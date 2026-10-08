import {
  ONBMember,
  ONBGroup,
  CustomerPackage,
  ScorecardRow,
  ONBWorkAllocationRow,
  GroupWorkAllocation,
  WorkAllocationResult,
  CompletionLevel,
  WorkAllocationSuggestion
} from '../types';
import { cleanTaxCode } from './packageScoring';

export interface ComputeWorkAllocationParams {
  monthYear: string;
  members: ONBMember[];
  groups: ONBGroup[];
  packages: CustomerPackage[];
  scorecardRows: ScorecardRow[];
}

/**
 * Calculates standardized ONB Work Allocation metrics for a specific month.
 * Strictly adheres to specifications 3.1 through 3.10:
 * - STT: 1..N within each group
 * - ONB: Strictly derived from Core -> Nhân sự ONB (m.id, m.code, m.fullName, m.groupId/m.currentGroup, m.isActive)
 * - KH tiếp nhận: Count unique clean tax codes (preserve leading 0s, flag missing MST)
 * - Gói tiếp nhận: Count root CustomerPackage records (modules do not duplicate)
 * - Điểm tiếp nhận: Sum of recordedScore for this ONB in packages
 * - Tổng điểm đã thực hiện trong tháng: Exact match from Thưởng hiệu quả (ScorecardRow.totalMonthlyScore)
 * - Tỷ lệ hoàn thành điểm công việc: totalMonthlyScore / 100 (formatted %)
 * - Đánh giá: (totalMonthlyScore / 100) * 0.3 (formatted %)
 * - Mức độ hoàn thành công việc: <30% 'Cần cố gắng', ===30% 'Đạt', >30% 'Vượt mong đợi' (before rounding)
 * - Gợi ý phân công: Ranked descending by totalMonthlyScore within group, tie-break by onbCode ascending:
 *     1..3: 'Hạn chế giao việc'
 *     4..6: 'Giao thêm 1 chút'
 *     >=7:  'Giao tẹt ga'
 *     Inactive: 'Ngừng hoạt động (Không giao việc)'
 */
export function computeWorkAllocationData(params: ComputeWorkAllocationParams): WorkAllocationResult {
  const { monthYear, members, groups, packages, scorecardRows } = params;

  // 1. Filter packages belonging to the target month
  const monthPackages = packages.filter(pkg => {
    const pkgMonth = pkg.receptionDate ? pkg.receptionDate.slice(0, 7) : pkg.monthYear;
    return pkgMonth === monthYear;
  });

  // 2. Select relevant members directly from Core:
  // All active members from Core + inactive members who have data in this month
  const relevantMembers = members.filter(m => {
    if (m.isActive !== false) return true;
    const hasPkg = monthPackages.some(p =>
      p.assignedOnbCode === m.code ||
      p.details?.some(d => d.onbCode === m.code) ||
      p.splits?.some(s => s.onbCode === m.code)
    );
    const hasScore = scorecardRows.some(r => r.onbCode === m.code && (r.totalMonthlyScore > 0 || r.scoreReception > 0));
    return hasPkg || hasScore;
  });

  // 3. Map members by their official group directly from Core (groups catalog)
  // Essential rule: Current operational screen MUST reflect Core directly.
  // Never let historical dates or fallbacks overwrite the member's current Core group!
  const membersByGroup: Record<string, { groupId: string; groupName: string; members: ONBMember[] }> = {};

  // Initialize from groups catalog to preserve exact Core display order
  const sortedGroups = groups && groups.length > 0
    ? [...groups].sort((a, b) => a.order - b.order)
    : [];

  sortedGroups.forEach(g => {
    membersByGroup[g.name] = {
      groupId: g.id,
      groupName: g.name,
      members: []
    };
  });

  relevantMembers.forEach(m => {
    // Resolve group from Core:
    // 1. By stable groupId in groups catalog
    // 2. Or by currentGroup name in groups catalog
    let matchedGroup = m.groupId ? sortedGroups.find(g => g.id === m.groupId) : undefined;
    if (!matchedGroup && m.currentGroup) {
      matchedGroup = sortedGroups.find(g => g.name.toLowerCase() === m.currentGroup.toLowerCase());
    }

    let targetGroupName: string;
    let targetGroupId: string;

    if (matchedGroup) {
      targetGroupName = matchedGroup.name;
      targetGroupId = matchedGroup.id;
    } else if (m.currentGroup && m.currentGroup.trim()) {
      targetGroupName = m.currentGroup.trim();
      targetGroupId = m.groupId || `grp_${targetGroupName}`;
    } else {
      targetGroupName = 'Chưa xác định nhóm (Cần kiểm tra tại Core)';
      targetGroupId = 'grp_unassigned';
    }

    if (!membersByGroup[targetGroupName]) {
      membersByGroup[targetGroupName] = {
        groupId: targetGroupId,
        groupName: targetGroupName,
        members: []
      };
    }

    membersByGroup[targetGroupName].members.push(m);
  });

  // 4. Calculate metrics for each member within each group
  const groupAllocations: GroupWorkAllocation[] = [];

  let grandTotalMembers = 0;
  let grandTotalKH = 0;
  let grandTotalGoi = 0;
  let grandTotalDiemTiepNhan = 0;
  let grandTotalDiemThucHien = 0;

  // Process each group in order
  Object.keys(membersByGroup).forEach(groupName => {
    const groupBucket = membersByGroup[groupName];
    const groupMembers = groupBucket.members;

    // Include groups that either have members or exist in Core catalog
    if (groupMembers.length === 0 && !sortedGroups.some(g => g.name === groupName)) {
      return;
    }

    grandTotalMembers += groupMembers.length;
    const groupId = groupBucket.groupId;

    // Step 4.1: Compute raw metrics for each member in this group
    const memberCalculations = groupMembers.map(member => {
      // Find all root packages in this month where this member participated
      const memberPackages = monthPackages.filter(pkg => {
        if (pkg.details && Array.isArray(pkg.details) && pkg.details.length > 0) {
          return pkg.details.some(d => d.onbCode === member.code);
        }
        return (
          pkg.assignedOnbCode === member.code ||
          (pkg.splits && pkg.splits.some(s => s.onbCode === member.code))
        );
      });

      // 3.3. KH tiếp nhận:
      // Đếm số khách hàng duy nhất dựa trên Mã số thuế (cleanTaxCode).
      // Giữ số 0 ở đầu, loại bỏ khoảng trắng.
      // Cảnh báo nếu thiếu Mã số thuế (không mặc định gộp các dòng thiếu MST).
      const distinctTaxCodes = new Set<string>();
      let missingTaxCodeCount = 0;

      memberPackages.forEach(pkg => {
        const cleanedTax = cleanTaxCode(pkg.taxCode);
        if (cleanedTax) {
          distinctTaxCodes.add(cleanedTax);
        } else {
          missingTaxCodeCount++;
        }
      });

      const taxCodesCount = distinctTaxCodes.size + missingTaxCodeCount;
      const hasMissingTaxWarning = missingTaxCodeCount > 0;
      let warningNote: string | undefined;
      if (hasMissingTaxWarning) {
        warningNote = `Có ${missingTaxCodeCount} gói tiếp nhận chưa có Mã số thuế (cần bổ sung thông tin).`;
      }

      // 3.4. Gói tiếp nhận:
      // Tổng số bản ghi gói tiếp nhận gốc thuộc ONB trong tháng (không nhân theo module con).
      const packagesCount = memberPackages.length;

      // 3.5. Điểm tiếp nhận:
      // Lấy đúng trường Điểm tiếp nhận (recordedScore) từ Tiếp nhận gói đào tạo của ONB trong tháng.
      let receptionScore = 0;
      memberPackages.forEach(pkg => {
        if (pkg.details && Array.isArray(pkg.details) && pkg.details.length > 0) {
          pkg.details.forEach(d => {
            if (d.onbCode === member.code) {
              receptionScore += Number(d.recordedScore) || 0;
            }
          });
        } else {
          if (pkg.splits && pkg.splits.length > 0) {
            const sp = pkg.splits.find(s => s.onbCode === member.code);
            if (sp) receptionScore += Number(sp.points) || 0;
          } else if (pkg.assignedOnbCode === member.code) {
            receptionScore += Number(pkg.recordedScore) || 0;
          }
        }
      });
      receptionScore = Math.round(receptionScore * 100) / 100;

      // 3.6. Tổng điểm đã thực hiện trong tháng:
      // Lấy đúng giá trị từ cột "Tổng điểm thực hiện trong tháng" tại Thưởng hiệu quả
      const scRow = scorecardRows.find(r => r.onbCode === member.code || (r as any).memberId === member.id);
      const totalMonthlyScore = scRow ? Number(scRow.totalMonthlyScore) || 0 : 0;

      // 3.7. Tỷ lệ hoàn thành điểm công việc = Tổng điểm đã thực hiện trong tháng / 100
      const completionRate = totalMonthlyScore / 100;

      // 3.8. Đánh giá = Tỷ lệ hoàn thành điểm công việc * 30% (tương đương (Tổng điểm / 100) * 0.3)
      const evaluation = completionRate * 0.3;

      // 3.9. Mức độ hoàn thành công việc:
      // Đánh giá < 30%: Cần cố gắng.
      // Đánh giá = 30%: Đạt.
      // Đánh giá > 30%: Vượt mong đợi.
      // Phân loại dựa trên giá trị tính toán trước khi làm tròn hiển thị.
      const EPSILON = 1e-9;
      let completionLevel: CompletionLevel;
      if (Math.abs(evaluation - 0.3) < EPSILON) {
        completionLevel = 'Đạt';
      } else if (evaluation > 0.3) {
        completionLevel = 'Vượt mong đợi';
      } else {
        completionLevel = 'Cần cố gắng';
      }

      return {
        member,
        memberId: member.id || `ONB_${member.code}`,
        onbCode: member.code,
        fullName: member.fullName || member.displayName || member.code,
        groupName,
        groupId,
        isActive: member.isActive !== false,
        taxCodesCount,
        missingTaxCodeCount,
        hasMissingTaxWarning,
        packagesCount,
        receptionScore,
        totalMonthlyScore,
        completionRate,
        evaluation,
        completionLevel,
        warningNote
      };
    });

    // Step 4.2: Xếp hạng giảm dần trong từng nhóm theo "Tổng điểm đã thực hiện trong tháng" (Section 3.10)
    // Quy tắc phân xử khi bằng điểm: Sắp xếp theo mã ONB tăng dần để xác định vị trí ổn định.
    memberCalculations.sort((a, b) => {
      if (b.totalMonthlyScore !== a.totalMonthlyScore) {
        return b.totalMonthlyScore - a.totalMonthlyScore;
      }
      return a.onbCode.localeCompare(b.onbCode);
    });

    // Step 4.3: Gán Thứ hạng và Gợi ý phân công theo vị trí thực tế trong nhóm:
    // Nhân sự ngưng sử dụng: 'Ngừng hoạt động (Không giao việc)'
    // Nhân sự đang hoạt động: Vị trí 1 đến 3: Hạn chế giao việc, 4 đến 6: Giao thêm 1 chút, từ 7 trở đi: Giao tẹt ga
    let groupKH = 0;
    let groupGoi = 0;
    let groupDiemTiepNhan = 0;
    let groupDiemThucHien = 0;

    const rows: ONBWorkAllocationRow[] = memberCalculations.map((item, index) => {
      const rankInGroup = index + 1;
      let suggestion: WorkAllocationSuggestion;

      if (!item.isActive) {
        suggestion = 'Ngừng hoạt động (Không giao việc)';
      } else if (rankInGroup <= 3) {
        suggestion = 'Hạn chế giao việc';
      } else if (rankInGroup <= 6) {
        suggestion = 'Giao thêm 1 chút';
      } else {
        suggestion = 'Giao tẹt ga';
      }

      groupKH += item.taxCodesCount;
      groupGoi += item.packagesCount;
      groupDiemTiepNhan += item.receptionScore;
      groupDiemThucHien += item.totalMonthlyScore;

      return {
        stt: rankInGroup,
        onbCode: item.onbCode,
        memberId: item.memberId,
        fullName: item.fullName,
        groupName: item.groupName,
        groupId: item.groupId,
        isActive: item.isActive,
        taxCodesCount: item.taxCodesCount,
        missingTaxCodeCount: item.missingTaxCodeCount,
        hasMissingTaxWarning: item.hasMissingTaxWarning,
        packagesCount: item.packagesCount,
        receptionScore: item.receptionScore,
        totalMonthlyScore: item.totalMonthlyScore,
        completionRate: item.completionRate,
        evaluation: item.evaluation,
        completionLevel: item.completionLevel,
        rankInGroup,
        suggestion,
        warningNote: item.warningNote
      };
    });

    grandTotalKH += groupKH;
    grandTotalGoi += groupGoi;
    grandTotalDiemTiepNhan += Math.round(groupDiemTiepNhan * 100) / 100;
    grandTotalDiemThucHien += Math.round(groupDiemThucHien * 100) / 100;

    groupAllocations.push({
      groupId,
      groupName,
      rows,
      totalMembers: rows.length,
      totalKH: groupKH,
      totalGoi: groupGoi,
      totalDiemTiepNhan: Math.round(groupDiemTiepNhan * 100) / 100,
      totalDiemThucHien: Math.round(groupDiemThucHien * 100) / 100
    });
  });

  return {
    monthYear,
    groups: groupAllocations,
    summary: {
      totalMembers: grandTotalMembers,
      totalGroups: groupAllocations.length,
      totalKH: grandTotalKH,
      totalGoi: grandTotalGoi,
      totalDiemTiepNhan: Math.round(grandTotalDiemTiepNhan * 100) / 100,
      totalDiemThucHien: Math.round(grandTotalDiemThucHien * 100) / 100
    }
  };
}

/**
 * Format decimal to clean percentage string.
 * Example: 0.8 -> "80%", 1.0 -> "100%", 1.2 -> "120%", 0.24 -> "24%", 0.36 -> "36%"
 */
export function formatPercentage(val: number, precision: number = 1): string {
  if (val === undefined || val === null || isNaN(val)) return '0%';
  const pct = val * 100;
  if (Math.abs(pct - Math.round(pct)) < 1e-6) {
    return `${Math.round(pct)}%`;
  }
  return `${pct.toFixed(precision).replace(/\.0$/, '')}%`;
}

/**
 * Format score value with standard formatting
 */
export function formatScore(score: number): string {
  if (score === undefined || score === null || isNaN(score)) return '0';
  if (Math.abs(score - Math.round(score)) < 1e-6) {
    return String(Math.round(score));
  }
  return String(Math.round(score * 100) / 100);
}
