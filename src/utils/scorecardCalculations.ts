import {
  ProgressTask,
  CustomerPackage,
  ONBMember,
  WorkTypeCatalog,
  ScorecardRow,
  MonthlyBonus,
  MonthlyBonusPool
} from '../types';
import { cleanTaxCode, resolveMemberGroupAtDate } from './packageScoring';

/**
 * Checks whether a work type belongs to the 55% DEMO/POC/Tiền về group:
 * Matches if the work type name or code contains any of:
 * 'poc', 'tiền', 'tien', 'cơ hội', 'co hoi', 'demo'
 * (case-insensitive, trimmed, contains check).
 */
export function isDemoPocTienVeWorkType(
  workTypeCode: string | undefined,
  workTypesCatalog: WorkTypeCatalog[]
): boolean {
  if (!workTypeCode || !workTypeCode.trim()) return false;
  const wt = workTypesCatalog.find(w => w.code === workTypeCode || w.name === workTypeCode);
  const textToCheck = `${wt?.name || ''} ${workTypeCode}`.toLowerCase().trim();

  return (
    textToCheck.includes('poc') ||
    textToCheck.includes('tiền') ||
    textToCheck.includes('tien') ||
    textToCheck.includes('cơ hội') ||
    textToCheck.includes('co hoi') ||
    textToCheck.includes('demo')
  );
}

export function categorizeProgressTask(
  task: ProgressTask,
  workTypesCatalog: WorkTypeCatalog[]
): 'DEMO_POC' | 'TRAINING' | 'UNKNOWN' {
  if (!task.workTypeCode || !task.workTypeCode.trim()) {
    return 'UNKNOWN';
  }
  if (isDemoPocTienVeWorkType(task.workTypeCode, workTypesCatalog)) {
    return 'DEMO_POC';
  }
  return 'TRAINING';
}

/**
 * Shared helper to determine official display bonus for a scorecard row.
 * Guarantees 100% synchronization between Thưởng hiệu quả and Tổng quan.
 */
export function getRowOfficialBonus(
  row: {
    finalBonus?: number | null;
    calculatedBonus?: number | null;
    manualBonus?: number | null;
    bonusMode?: 'POOL' | 'MANUAL';
    totalMonthlyScore?: number;
    weightedScore?: number;
    departmentRatio?: number;
  },
  isPoolConfigured: boolean,
  departmentTotalW: number
): { amount: number | null; label: string; isZero: boolean; isUnconfigured: boolean } {
  // If pool is not configured and row has no manual bonus, it is unconfigured
  if (!isPoolConfigured && row.bonusMode !== 'MANUAL' && (row.manualBonus === null || row.manualBonus === undefined)) {
    return { amount: null, label: 'Chưa nhập quỹ', isZero: false, isUnconfigured: true };
  }

  // If department total weighted score is 0, no points to allocate bonus -> 0 đ
  if (departmentTotalW === 0) {
    return { amount: 0, label: '0 đ', isZero: true, isUnconfigured: false };
  }

  // If member has 0 points in the month (unqualified, ratio = 0) -> 0 đ
  if ((row.weightedScore || 0) === 0 && (row.totalMonthlyScore || 0) === 0) {
    return { amount: 0, label: '0 đ', isZero: true, isUnconfigured: false };
  }

  // If finalBonus is explicitly 0
  if (row.finalBonus === 0) {
    return { amount: 0, label: '0 đ', isZero: true, isUnconfigured: false };
  }

  // If finalBonus has a positive value
  if (row.finalBonus !== null && row.finalBonus !== undefined && row.finalBonus > 0) {
    return {
      amount: row.finalBonus,
      label: `${row.finalBonus.toLocaleString('vi-VN')} đ`,
      isZero: false,
      isUnconfigured: false
    };
  }

  // If calculatedBonus is available
  if (isPoolConfigured && row.calculatedBonus !== null && row.calculatedBonus !== undefined) {
    if (row.calculatedBonus === 0) {
      return { amount: 0, label: '0 đ', isZero: true, isUnconfigured: false };
    }
    return {
      amount: row.calculatedBonus,
      label: `${row.calculatedBonus.toLocaleString('vi-VN')} đ`,
      isZero: false,
      isUnconfigured: false
    };
  }

  // If manualBonus is available in MANUAL mode
  if (row.manualBonus !== null && row.manualBonus !== undefined) {
    if (row.manualBonus === 0) {
      return { amount: 0, label: '0 đ', isZero: true, isUnconfigured: false };
    }
    return {
      amount: row.manualBonus,
      label: `${row.manualBonus.toLocaleString('vi-VN')} đ`,
      isZero: false,
      isUnconfigured: false
    };
  }

  return { amount: null, label: 'Chưa nhập quỹ', isZero: false, isUnconfigured: true };
}

/**
 * Computes the standardized monthly scorecard for all members in a given month.
 * Follows the 55% / 40% / 5% rules:
 * A: DEMO/POC/Tiền về (55%)
 * B: Tiếp nhận gói (40%)
 * C: Đào tạo & loại việc khác (5%)
 * T: Tổng thực hiện = A + B + C
 * W: Tổng đã nhân trọng số = A * 0.55 + B * 0.40 + C * 0.05
 * Tỷ trọng (%) = (W / W_toàn_phòng) * 100%
 */
export function computeScorecardData(params: {
  monthYear: string;
  members: ONBMember[];
  workTypes: WorkTypeCatalog[];
  progressTasks: ProgressTask[];
  packages: CustomerPackage[];
  bonuses: MonthlyBonus[];
  bonusPool?: MonthlyBonusPool | null;
  schedules?: any[];
}): {
  rows: ScorecardRow[];
  totalDepartmentWeightedScore: number;
  bonusPool: MonthlyBonusPool | null;
  summary: {
    totalMembers: number;
    totalRecordedScoreAll: number;
    totalWeightedScoreAll: number;
    totalBonusAll: number;
    poolAmount: number | null;
    roundingDiff: number;
    totalTasksAll: number;
    totalPackagesAll: number;
    totalCustomersAll: number;
  };
} {
  const { monthYear, members, workTypes, progressTasks, packages, bonuses, bonusPool = null, schedules = [] } = params;

  // 1. Filter records by monthYear (matching business date)
  const monthProgress = progressTasks.filter(p => (p.date ? p.date.slice(0, 7) : p.monthYear) === monthYear);
  const monthPackages = packages.filter(pkg => (pkg.receptionDate ? pkg.receptionDate.slice(0, 7) : pkg.monthYear) === monthYear);
  const monthBonuses = bonuses.filter(b => b.monthYear === monthYear);
  const monthSchedules = schedules.filter(s => s.monthYear === monthYear);

  // 2. Select relevant members: all active members, PLUS inactive members who have data in this month
  const relevantMembers = members.filter(m => {
    if (m.isActive) return true;
    const hasTask = monthProgress.some(p => p.primaryOnbCode === m.code || p.splits?.some(s => s.onbCode === m.code));
    const hasPkg = monthPackages.some(p => p.assignedOnbCode === m.code || p.details?.some(d => d.onbCode === m.code) || p.splits?.some(s => s.onbCode === m.code));
    const hasSched = monthSchedules.some(s => s.onbCode === m.code || s.collaborators?.includes(m.code));
    const hasBonus = monthBonuses.some(b => b.onbCode === m.code);
    return hasTask || hasPkg || hasSched || hasBonus;
  });

  // Intermediate computation per member
  interface MemberInterim {
    member: ONBMember;
    a: number; // DEMO_POC
    b: number; // RECEPTION
    c: number; // TRAINING
    t: number; // a + b + c
    w: number; // a*0.55 + b*0.40 + c*0.05
    manualBonus: number | null;
    displayGroups: string;
    groupBreakdown: Record<string, { a: number; b: number; c: number; t: number; w: number }>;
    distinctCustomerIds: Set<string>;
    newPackagesCount: number;
    taskCount: number;
    scheduleCount: number;
    warningTasksCount: number;
  }

  const interimList: MemberInterim[] = relevantMembers.map(member => {
    let scoreDemoPoc = 0;
    let scoreTraining = 0;
    let scoreReception = 0;
    let taskCount = 0;
    let warningTasksCount = 0;

    const memberGroupsInMonth = new Set<string>();
    const groupBreakdown: Record<string, { a: number; b: number; c: number; t: number; w: number }> = {};

    function addScoreToGroup(grpName: string, type: 'a' | 'b' | 'c', pts: number) {
      if (!grpName) grpName = member.currentGroup || 'Nhóm 1';
      memberGroupsInMonth.add(grpName);
      if (!groupBreakdown[grpName]) {
        groupBreakdown[grpName] = { a: 0, b: 0, c: 0, t: 0, w: 0 };
      }
      groupBreakdown[grpName][type] += pts;
    }

    // 2.1 Process Progress Tasks
    for (const prg of monthProgress) {
      const hasSplits = !!(prg.splits && prg.splits.length > 0);
      let pointsForMember = 0;
      let isParticipant = false;

      if (hasSplits && prg.splits) {
        const split = prg.splits.find(sp => sp.onbCode === member.code);
        if (split) {
          pointsForMember = Number(split.points) || 0;
          isParticipant = true;
        }
      } else {
        if (prg.primaryOnbCode === member.code) {
          pointsForMember = Number(prg.recordedScore) || 0;
          isParticipant = true;
        }
      }

      if (isParticipant) {
        taskCount++;
        const category = categorizeProgressTask(prg, workTypes);
        const resolvedGroup = resolveMemberGroupAtDate(members, member.code, prg.date || `${monthYear}-01`);

        if (category === 'DEMO_POC') {
          scoreDemoPoc += pointsForMember;
          addScoreToGroup(resolvedGroup, 'a', pointsForMember);
        } else if (category === 'TRAINING') {
          scoreTraining += pointsForMember;
          addScoreToGroup(resolvedGroup, 'c', pointsForMember);
        } else {
          // UNKNOWN work type
          warningTasksCount++;
          // Still assign to TRAINING (5%) with warning flag for reconciliation
          scoreTraining += pointsForMember;
          addScoreToGroup(resolvedGroup, 'c', pointsForMember);
        }
      }
    }

    // 2.2 Process Packages
    let newPackagesCount = 0;
    const distinctCustomerIds = new Set<string>();

    for (const pkg of monthPackages) {
      if (pkg.details && Array.isArray(pkg.details) && pkg.details.length > 0) {
        let memberParticipated = false;
        for (const d of pkg.details) {
          if (d.onbCode === member.code) {
            memberParticipated = true;
            const pts = Number(d.recordedScore) || 0;
            scoreReception += pts;
            const grp = d.groupName || resolveMemberGroupAtDate(members, member.code, pkg.receptionDate || `${monthYear}-01`);
            addScoreToGroup(grp, 'b', pts);
          }
        }
        if (memberParticipated) {
          distinctCustomerIds.add(cleanTaxCode(pkg.taxCode || '') || pkg.customerId || pkg.customerName || '');
          if (pkg.packageClass === 'Tiếp nhận mới' || pkg.packageType === 'Mới tiếp nhận') {
            newPackagesCount++;
          }
        }
      } else {
        // Legacy fallback
        const hasSplits = !!(pkg.splits && pkg.splits.length > 0);
        let pointsForMember = 0;
        let isParticipant = false;

        if (hasSplits && pkg.splits) {
          const split = pkg.splits.find(sp => sp.onbCode === member.code);
          if (split) {
            pointsForMember = Number(split.points) || 0;
            isParticipant = true;
          }
        } else {
          if (pkg.assignedOnbCode === member.code) {
            pointsForMember = Number(pkg.recordedScore) || 0;
            isParticipant = true;
          }
        }

        if (isParticipant) {
          scoreReception += pointsForMember;
          const grp = resolveMemberGroupAtDate(members, member.code, pkg.receptionDate || `${monthYear}-01`);
          addScoreToGroup(grp, 'b', pointsForMember);
          distinctCustomerIds.add(cleanTaxCode(pkg.taxCode || '') || pkg.customerId || pkg.customerName || '');
          if (pkg.packageType === 'Mới tiếp nhận' || pkg.packageClass === 'Tiếp nhận mới') {
            newPackagesCount++;
          }
        }
      }
    }

    // Finalize groups display
    const groupsArr = Array.from(memberGroupsInMonth).filter(Boolean);
    const displayGroups = groupsArr.length > 0 ? groupsArr.sort().join(', ') : (member.currentGroup || 'Nhóm 1');

    // Calculate total raw and weighted scores
    const a = Math.round(scoreDemoPoc * 100) / 100;
    const b = Math.round(scoreReception * 100) / 100;
    const c = Math.round(scoreTraining * 100) / 100;
    const t = Math.round((a + b + c) * 100) / 100;
    const w = Math.round((a * 0.55 + b * 0.40 + c * 0.05) * 100) / 100;

    // Compute per-group total and weighted
    Object.keys(groupBreakdown).forEach(gKey => {
      const gItem = groupBreakdown[gKey];
      gItem.a = Math.round(gItem.a * 100) / 100;
      gItem.b = Math.round(gItem.b * 100) / 100;
      gItem.c = Math.round(gItem.c * 100) / 100;
      gItem.t = Math.round((gItem.a + gItem.b + gItem.c) * 100) / 100;
      gItem.w = Math.round((gItem.a * 0.55 + gItem.b * 0.40 + gItem.c * 0.05) * 100) / 100;
    });

    // Bonus lookup
    const bonusItem = monthBonuses.find(bn => bn.onbCode === member.code);
    const manualBonus = bonusItem !== undefined ? Number(bonusItem.amount) : null;

    // Schedules count
    const memberSchedules = monthSchedules.filter(s => s.onbCode === member.code || (s.collaborators && s.collaborators.includes(member.code)));

    return {
      member,
      a,
      b,
      c,
      t,
      w,
      manualBonus,
      displayGroups,
      groupBreakdown,
      distinctCustomerIds,
      newPackagesCount,
      taskCount,
      scheduleCount: memberSchedules.length,
      warningTasksCount
    };
  });

  // 3. Compute Total Weighted Score for the whole department in month (denominator W_dept)
  const totalDepartmentWeightedScore = interimList.reduce((acc, item) => acc + item.w, 0);

  // Determine bonus pool configuration for this month
  const isPoolConfigured = bonusPool !== null && bonusPool !== undefined && bonusPool.amount !== null && bonusPool.amount !== undefined;
  const poolAmount = isPoolConfigured ? bonusPool!.amount! : null;

  // 4. Build final ScorecardRow objects
  const rows: ScorecardRow[] = interimList.map(item => {
    // Exact ratio for bonus calculation (full precision, no intermediate rounding)
    const exactRatio = totalDepartmentWeightedScore > 0
      ? (item.w / totalDepartmentWeightedScore)
      : 0;

    // Display ratio rounded to 2 decimal places
    const departmentRatio = Math.round(exactRatio * 10000) / 100;

    let calculatedBonus: number | null = null;
    if (isPoolConfigured) {
      if (poolAmount === 0 || totalDepartmentWeightedScore === 0) {
        calculatedBonus = 0;
      } else {
        // Khoản thưởng = Tỷ trọng trong phòng (chính xác) × Tổng quỹ thưởng, làm tròn đến đồng
        calculatedBonus = Math.round(exactRatio * poolAmount!);
      }
    }

    let finalBonus: number | null = null;
    let bonusMode: 'POOL' | 'MANUAL' = 'POOL';

    if (isPoolConfigured) {
      finalBonus = calculatedBonus;
      bonusMode = 'POOL';
    } else if (totalDepartmentWeightedScore === 0) {
      // Khi toàn phòng chưa có điểm phát sinh (W_dept = 0):
      // Chưa đủ điều kiện điểm để phân bổ/ghi nhận thưởng trong kỳ, khoản thưởng chính thức là 0 đ
      finalBonus = 0;
      bonusMode = (item.manualBonus !== null && item.manualBonus !== undefined) ? 'MANUAL' : 'POOL';
    } else if (item.w === 0 && item.t === 0) {
      // Nhân sự không có điểm trong tháng, tỷ trọng phòng = 0: Không đủ điều kiện thưởng, trả về 0 đ
      finalBonus = 0;
      bonusMode = (item.manualBonus !== null && item.manualBonus !== undefined) ? 'MANUAL' : 'POOL';
    } else if (item.manualBonus !== null && item.manualBonus !== undefined) {
      // Bảo toàn thưởng nhập tay lịch sử khi tháng chưa cấu hình quỹ và nhân sự có phát sinh điểm
      finalBonus = item.manualBonus;
      bonusMode = 'MANUAL';
    } else {
      // Chưa nhập quỹ
      finalBonus = null;
      bonusMode = 'POOL';
    }

    return {
      onbCode: item.member.code,
      fullName: item.member.fullName,
      shortCode: item.member.shortCode || item.member.code,
      currentGroup: item.member.currentGroup,
      displayGroups: item.displayGroups,
      monthYear,

      // Standardized 55% / 40% / 5% columns:
      scoreDemoPocTienVe: item.a,
      scoreReception: item.b,
      scoreTraining: item.c,
      totalMonthlyScore: item.t,
      weightedScore: item.w,
      departmentRatio,
      manualBonus: item.manualBonus,
      calculatedBonus,
      finalBonus,
      bonusMode,

      groupBreakdown: item.groupBreakdown,
      warningTasksCount: item.warningTasksCount,

      // Backward compatibility fields
      totalTasks: item.taskCount,
      totalScheduleCount: item.scheduleCount,
      newPackagesCount: item.newPackagesCount,
      distinctCustomersCount: item.distinctCustomerIds.size,
      receptionScore: item.b,
      totalRecordedScore: item.t
    };
  });

  const uniquePackagesCount = new Set(monthPackages.map(p => p.id || p.packageCode)).size;
  const uniqueCustomersCount = new Set(monthPackages.map(p => cleanTaxCode(p.taxCode) || p.customerName)).size;
  const totalBonusAll = rows.reduce((acc, r) => {
    const official = getRowOfficialBonus(r, isPoolConfigured, totalDepartmentWeightedScore);
    return acc + (official.amount !== null && official.amount !== undefined ? official.amount : 0);
  }, 0);
  const totalRecordedScoreAll = interimList.reduce((acc, r) => acc + r.t, 0);

  // Compute rounding difference if pool is active and department has score
  let roundingDiff = 0;
  if (isPoolConfigured && poolAmount! > 0 && totalDepartmentWeightedScore > 0) {
    const sumCalculated = rows.reduce((acc, r) => acc + (r.calculatedBonus !== null && r.calculatedBonus !== undefined ? r.calculatedBonus : 0), 0);
    roundingDiff = sumCalculated - poolAmount!;
  }

  return {
    rows,
    totalDepartmentWeightedScore: Math.round(totalDepartmentWeightedScore * 100) / 100,
    bonusPool: bonusPool || null,
    summary: {
      totalMembers: rows.length,
      totalRecordedScoreAll: Math.round(totalRecordedScoreAll * 100) / 100,
      totalWeightedScoreAll: Math.round(totalDepartmentWeightedScore * 100) / 100,
      totalBonusAll,
      poolAmount,
      roundingDiff,
      totalTasksAll: interimList.reduce((acc, r) => acc + r.taskCount, 0),
      totalPackagesAll: uniquePackagesCount,
      totalCustomersAll: uniqueCustomersCount
    }
  };
}
