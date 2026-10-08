import { PackageCoreConfig, ONBMember } from '../types';

export interface ScoreCalculationResult {
  suggestedScore: number;
  baseScore: number;
  leaderScore: number;
  formula: string;
  isNonScoring: boolean;
  warning?: string;
}

/**
 * Calculates suggested reception score according to Core configuration:
 * Step 1: Check source. If source is marked non-scoring (e.g. 'Khác'), suggested score is 0.
 * Step 2: For scoring sources:
 *   - POC: baseScore from Core (default 7) + leader score (if applicable)
 *   - Demo: baseScore from Core (default 3), no tier score, no leader score
 *   - Đào tạo / Tư vấn: customer tier score from Core (BASIC: 2, BRONZE: 4, SILVER: 7, GOLD: 9) + leader score
 * Leader Platform rules:
 *   - 2 platforms: 4 pts
 *   - 3 platforms: 6 pts
 *   - 4 platforms: 8 pts
 *   - >= 5 platforms: 10 pts
 *   - Value not configured (e.g. 1 platform): warning shown, no score assigned
 */
export function calculatePackageScore(
  config: PackageCoreConfig,
  sourceCode: string,
  workForm: string,
  customerTier: string,
  leaderPlatforms?: number
): ScoreCalculationResult {
  const source = config.sources?.find(s => s.code === sourceCode);

  // Step 1: If source is configured as non-scoring, suggested score is 0
  if (source && source.isNonScoring) {
    return {
      suggestedScore: 0,
      baseScore: 0,
      leaderScore: 0,
      formula: `Nguồn "${source.name}" không tính điểm tiếp nhận (0 điểm)`,
      isNonScoring: true
    };
  }

  // Step 2: Scoring source
  const wt = config.workTypes?.find(w => w.name === workForm || w.code === workForm);
  const wtCode = wt?.code || workForm;

  let baseScore = 0;
  let leaderScore = 0;
  let formula = '';
  let warning: string | undefined;

  const hasLeader = leaderPlatforms !== undefined && leaderPlatforms !== null && Number(leaderPlatforms) > 0;
  const numPlatforms = Number(leaderPlatforms) || 0;

  if (hasLeader) {
    if (numPlatforms < 2) {
      warning = `Số nền tảng ${numPlatforms} chưa có cấu hình điểm tại Core (chỉ áp dụng từ 2 nền tảng trở lên).`;
      leaderScore = 0;
    } else {
      const lp = config.leaderPlatforms?.find(p => p.platforms === numPlatforms)
        || (numPlatforms >= 5 ? config.leaderPlatforms?.find(p => p.platforms >= 5) : undefined);
      if (lp) {
        leaderScore = lp.score;
      } else {
        warning = `Chưa có cấu hình điểm cho ${numPlatforms} nền tảng.`;
        leaderScore = 0;
      }
    }
  }

  // Demo: baseScore from Core, no customer tier, no leader
  if (wtCode === 'DEMO' || workForm === 'Demo') {
    baseScore = wt?.baseScore !== undefined ? wt.baseScore : 3;
    leaderScore = 0;
    formula = `Điểm Demo: ${baseScore} điểm`;
    if (hasLeader) {
      warning = 'Loại hình Demo không áp dụng cộng điểm Leader theo cấu hình Core.';
    }
    return {
      suggestedScore: baseScore,
      baseScore,
      leaderScore: 0,
      formula,
      isNonScoring: false,
      warning
    };
  }

  // POC: baseScore from Core + leader score
  if (wtCode === 'POC' || workForm === 'POC') {
    baseScore = wt?.baseScore !== undefined ? wt.baseScore : 7;
    const total = baseScore + leaderScore;
    if (leaderScore > 0) {
      formula = `Điểm POC: ${baseScore} + Leader ${numPlatforms} nền tảng: ${leaderScore} = ${total} điểm`;
    } else {
      formula = `Điểm POC: ${baseScore} điểm`;
    }
    return {
      suggestedScore: total,
      baseScore,
      leaderScore,
      formula,
      isNonScoring: false,
      warning
    };
  }

  // Đào tạo or Tư vấn: tier score + leader
  const tier = config.customerTiers?.find(t => t.code === customerTier || t.name === customerTier);
  baseScore = tier?.score !== undefined ? tier.score : 7;
  const tierName = tier?.name || customerTier;

  const total = baseScore + leaderScore;
  if (leaderScore > 0) {
    formula = `Điểm hạng ${tierName}: ${baseScore} + Leader ${numPlatforms} nền tảng: ${leaderScore} = ${total} điểm`;
  } else {
    formula = `Điểm hạng ${tierName}: ${baseScore} điểm`;
  }

  return {
    suggestedScore: total,
    baseScore,
    leaderScore,
    formula,
    isNonScoring: false,
    warning
  };
}

/**
 * Resolves performer's group at reception date from member's group history in Core.
 * If no history at or before reception date, fallbacks to member's currentGroup.
 * If unknown, returns 'Chưa xác định nhóm'.
 */
export function resolveMemberGroupAtDate(
  members: ONBMember[],
  onbCode: string,
  date: string
): string {
  const member = members.find(m => m.code === onbCode);
  if (!member) return 'Chưa xác định nhóm';

  if (Array.isArray(member.groupHistory) && member.groupHistory.length > 0) {
    const sorted = [...member.groupHistory].sort((a, b) => b.fromDate.localeCompare(a.fromDate));
    const match = sorted.find(h => h.fromDate <= date);
    if (match && match.group) return match.group;
  }

  return member.currentGroup || 'Chưa xác định nhóm';
}

/**
 * Cleans tax code: trims leading/trailing spaces, preserves leading zeros and hyphens.
 */
export function cleanTaxCode(taxCode: string | undefined | null): string {
  if (!taxCode) return '';
  return taxCode.toString().trim();
}
