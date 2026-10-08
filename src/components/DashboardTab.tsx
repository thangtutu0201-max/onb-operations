import React, { useMemo } from 'react';
import { ScorecardRow, CurrentUserSession, ONBGroup, ONBMember, MonthlyBonusPool } from '../types';
import { getRowOfficialBonus } from '../utils/scorecardCalculations';
import {
  Award,
  CheckCircle2,
  Users,
  Lock,
  Unlock,
  ArrowUpRight,
  ShieldCheck,
  Activity,
  RefreshCw,
  AlertTriangle,
  AlertCircle,
  Wifi,
  WifiOff,
  RotateCcw
} from 'lucide-react';

interface DashboardTabProps {
  monthYear: string;
  isMonthLocked: boolean;
  isMonthReopened?: boolean;
  scorecardData: {
    monthYear?: string;
    isLocked?: boolean;
    bonusPool?: MonthlyBonusPool | null;
    rows: ScorecardRow[];
    totalDepartmentWeightedScore?: number;
    summary: {
      totalMembers: number;
      totalRecordedScoreAll: number;
      totalBonusAll: number;
      totalTasksAll: number;
      totalSchedulesAll: number;
    };
  } | null;
  groups?: ONBGroup[];
  members?: ONBMember[];
  onNavigateTab: (tabId: string) => void;
  session: CurrentUserSession | null;
  auditLogs: any[];
  syncStatus?: 'idle' | 'loading' | 'syncing' | 'connected' | 'disconnected' | 'error';
  lastSyncTime?: string | null;
  syncError?: string | null;
  blockErrors?: Record<string, string>;
  onRefreshData?: () => Promise<void>;
}

export const DashboardTab: React.FC<DashboardTabProps> = ({
  monthYear,
  isMonthLocked,
  isMonthReopened,
  scorecardData,
  groups = [],
  members = [],
  onNavigateTab,
  session,
  auditLogs,
  syncStatus = 'connected',
  lastSyncTime,
  syncError,
  blockErrors = {},
  onRefreshData
}) => {
  const rows = scorecardData?.rows || [];
  const bonusPool = scorecardData?.bonusPool || null;
  const isPoolConfigured = bonusPool !== null && bonusPool !== undefined && bonusPool.amount !== null && bonusPool.amount !== undefined;
  const departmentTotalW = scorecardData?.totalDepartmentWeightedScore ?? (
    rows.reduce((acc, r) => acc + (r.weightedScore || 0), 0)
  );

  const summary = scorecardData?.summary || {
    totalMembers: 0,
    totalRecordedScoreAll: 0,
    totalBonusAll: 0,
    totalTasksAll: 0,
    totalSchedulesAll: 0
  };

  // Build sorted groups from Core
  const sortedCoreGroups = useMemo(() => {
    if (groups && groups.length > 0) {
      return [...groups].sort((a, b) => a.order - b.order);
    }
    // Fallback if groups catalog is temporarily empty
    return [
      { id: 'grp_1', code: 'NHOM_1', name: 'Nhóm 1', order: 1, isActive: true },
      { id: 'grp_2', code: 'NHOM_2', name: 'Nhóm 2', order: 2, isActive: true },
      { id: 'grp_3', code: 'NHOM_3', name: 'Nhóm 3', order: 3, isActive: true }
    ];
  }, [groups]);

  // Dynamic group point totals matching official Core groups
  const groupStats = useMemo(() => {
    const stats: Record<string, { score: number; members: number; tasks: number; groupId?: string }> = {};

    sortedCoreGroups.forEach(g => {
      stats[g.name] = { score: 0, members: 0, tasks: 0, groupId: g.id };
    });

    // Count members currently active in Core belonging to each group
    const activeMembers = members.filter(m => m.isActive !== false);
    activeMembers.forEach(m => {
      // Find matching group by stable groupId, or fallback to currentGroup name
      const matchedGroup = (m.groupId && sortedCoreGroups.find(g => g.id === m.groupId)) ||
        sortedCoreGroups.find(g => g.name.toLowerCase() === (m.currentGroup || '').toLowerCase());
      const gName = matchedGroup ? matchedGroup.name : m.currentGroup;
      if (gName && stats[gName]) {
        stats[gName].members += 1;
      }
    });

    // Aggregate score and tasks from Scorecard rows
    rows.forEach(r => {
      // Priority 1: Match by stable groupId if available
      // Priority 2: Match by r.currentGroup
      let targetGroupName = r.currentGroup;
      const matchedByMember = (r as any).memberId && members.find(m => m.id === (r as any).memberId);
      if (matchedByMember) {
        const mg = (matchedByMember.groupId && sortedCoreGroups.find(g => g.id === matchedByMember.groupId)) ||
          sortedCoreGroups.find(g => g.name.toLowerCase() === (matchedByMember.currentGroup || '').toLowerCase());
        if (mg) {
          targetGroupName = mg.name;
        }
      }

      if (!stats[targetGroupName]) {
        stats[targetGroupName] = { score: 0, members: 0, tasks: 0 };
      }
      stats[targetGroupName].score += (r.totalRecordedScore || r.totalMonthlyScore || 0);
      stats[targetGroupName].tasks += (r.totalTasks || 0);
    });

    return stats;
  }, [sortedCoreGroups, members, rows]);

  // Top 5 contributors this month
  const topPerformers = useMemo(() => {
    return [...rows]
      .sort((a, b) => (b.totalRecordedScore || b.totalMonthlyScore || 0) - (a.totalRecordedScore || a.totalMonthlyScore || 0))
      .slice(0, 5);
  }, [rows]);

  const handleManualRefresh = async () => {
    if (onRefreshData) {
      await onRefreshData();
    }
  };

  const isSyncing = syncStatus === 'syncing' || syncStatus === 'loading';
  const isDisconnected = syncStatus === 'disconnected';
  const isError = syncStatus === 'error';
  const isConnected = syncStatus === 'connected';

  return (
    <div className="space-y-6">
      {/* Realtime Status Header Bar */}
      <div className="bg-white rounded-xl border border-slate-200 px-4 py-3 shadow-[0_2px_8px_rgba(15,23,42,0.04)] flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3 flex-wrap">
          {/* Status Badge */}
          {syncStatus === 'loading' ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#EFF6FF] text-[#1D4ED8] border border-[#BFDBFE]">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Đang tải dữ liệu ban đầu...</span>
            </div>
          ) : syncStatus === 'syncing' ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#EEF2FF] text-[#4F46E5] border border-[#C7D2FE]">
              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
              <span>Đang đồng bộ...</span>
            </div>
          ) : isDisconnected ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#FFFBEB] text-[#92400E] border border-[#FDE68A]">
              <WifiOff className="w-3.5 h-3.5 text-[#92400E]" />
              <span>Mất kết nối realtime (Tự thử lại...)</span>
            </div>
          ) : isError ? (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#FEF2F2] text-[#B91C1C] border border-[#FECACA]">
              <AlertCircle className="w-3.5 h-3.5 text-[#B91C1C]" />
              <span>Lỗi đồng bộ dữ liệu</span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]">
              <span className="w-2 h-2 rounded-full bg-[#047857] animate-pulse"></span>
              <Wifi className="w-3.5 h-3.5 text-[#047857]" />
              <span>Đang kết nối realtime</span>
            </div>
          )}

          {/* Last sync time */}
          <div className="text-xs text-slate-600 flex items-center gap-1.5">
            <span className="text-slate-300">|</span>
            <span className="text-slate-500">Đồng bộ gần nhất:</span>
            <span className="font-semibold text-slate-800">
              {lastSyncTime ? `${lastSyncTime}` : 'Chưa có dữ liệu'}
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isSyncing}
            className="px-3 py-1.5 font-medium text-xs text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
            title="Đọc lại toàn bộ dữ liệu mới nhất từ nguồn chính thức của Core và các phân hệ"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isSyncing ? 'animate-spin text-[#4F46E5]' : 'text-slate-500'}`} />
            <span>Nạp lại dữ liệu</span>
          </button>
        </div>
      </div>

      {/* Disconnection or Sync Error Alert if any */}
      {isDisconnected && (
        <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-xs text-amber-900 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              Mất kết nối máy chủ. Số liệu hiển thị đang được bảo lưu nguyên vẹn từ lần đồng bộ gần nhất [{lastSyncTime || 'N/A'}] và có thể chưa phản ánh thay đổi mới. Hệ thống đang tự động kết nối lại.
            </span>
          </div>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="underline font-semibold hover:text-amber-950 cursor-pointer ml-3 shrink-0"
          >
            Thử kết nối lại
          </button>
        </div>
      )}

      {syncError && (
        <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            <span>{syncError} — Toàn bộ số liệu hiển thị được bảo lưu an toàn từ phiên trước.</span>
          </div>
          <button
            type="button"
            onClick={handleManualRefresh}
            className="underline font-semibold hover:text-rose-950 cursor-pointer ml-3 shrink-0"
          >
            Thử lại
          </button>
        </div>
      )}

      {/* Specific Block Error Banner if any individual slice fails */}
      {Object.keys(blockErrors).length > 0 && (
        <div className="p-3 bg-rose-50/70 border border-rose-200 rounded-lg text-xs text-rose-800 space-y-1">
          <div className="font-semibold flex items-center gap-1.5 text-rose-900">
            <AlertTriangle className="w-3.5 h-3.5 text-rose-600" />
            <span>Cảnh báo: Có lỗi tải tại một số khối dữ liệu thành phần:</span>
          </div>
          <ul className="list-disc list-inside pl-2 space-y-0.5 text-[11px]">
            {Object.entries(blockErrors).map(([key, msg]) => (
              <li key={key}>
                <strong className="capitalize">{key}:</strong> {msg}
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Month Status Banner */}
      <div className={`p-4 rounded-xl border flex items-center justify-between ${
        isMonthReopened
          ? 'bg-[#EFF6FF] border-[#BFDBFE] text-[#1D4ED8]'
          : isMonthLocked
          ? 'bg-[#FFFBEB] border-[#FDE68A] text-[#92400E]'
          : 'bg-[#ECFDF5] border-[#A7F3D0] text-[#047857]'
      }`}>
        <div className="flex items-center gap-3">
          {isMonthReopened ? (
            <div className="p-2 bg-[#DBEAFE] rounded-lg text-[#1D4ED8] shrink-0">
              <RotateCcw className="w-4 h-4" />
            </div>
          ) : isMonthLocked ? (
            <div className="p-2 bg-[#FDE68A] rounded-lg text-[#92400E] shrink-0">
              <Lock className="w-4 h-4" />
            </div>
          ) : (
            <div className="p-2 bg-[#A7F3D0] rounded-lg text-[#047857] shrink-0">
              <Unlock className="w-4 h-4" />
            </div>
          )}
          <div>
            <div className="font-semibold text-sm">
              {isMonthReopened
                ? `Tháng này đang được mở lại để admin điều chỉnh dữ liệu.`
                : isMonthLocked
                ? `Tháng ${monthYear} đã khóa sổ dữ liệu (Chế độ Chỉ Đọc)`
                : `Tháng ${monthYear} đang trong kỳ vận hành`}
            </div>
            <div className="text-xs opacity-90 mt-0.5">
              {isMonthReopened
                ? 'Kỳ cũ đã mở sổ: Chỉ tài khoản Quản trị viên được phép sửa hoặc xóa dữ liệu trong kỳ này. Sau khi hiệu chỉnh xong, vui lòng khóa sổ lại.'
                : isMonthLocked
                ? 'Dữ liệu tháng cũ được bảo lưu nguyên trạng. Hệ thống khóa các thao tác thêm, sửa, xóa điểm và thưởng.'
                : 'Được phép nhập/sửa lịch công việc, cập nhật tiến độ, chia điểm và theo dõi KPI phòng.'}
            </div>
          </div>
        </div>
      </div>

      {/* KPI Headline Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Points */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Tổng Điểm KPI Phòng</span>
            <div className="p-2 bg-[#EEF2FF] text-[#4F46E5] rounded-lg">
              <Award className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono-numbers">
            {summary.totalRecordedScoreAll.toLocaleString('vi-VN')}
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Tổng hợp từ tiến độ & gói tiếp nhận
          </div>
        </div>

        {/* Total Tasks & Schedules */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Lượt Công Việc & Lịch</span>
            <div className="p-2 bg-[#ECFDF5] text-[#047857] rounded-lg">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono-numbers">
            {summary.totalTasksAll} <span className="text-sm font-normal text-slate-500">việc / {summary.totalSchedulesAll} lịch</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            TVTK, đào tạo, trực tiếp & hỗ trợ
          </div>
        </div>

        {/* Total Bonus */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Tổng Quỹ Thưởng Tháng</span>
            <div className="p-2 bg-[#FFFBEB] text-[#92400E] rounded-lg">
              <ShieldCheck className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono-numbers">
            {summary.totalBonusAll.toLocaleString('vi-VN')} <span className="text-xs font-normal">VNĐ</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            Nhập tay công khai · Không gắn lương
          </div>
        </div>

        {/* Personnel active */}
        <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between text-slate-500 text-xs font-medium">
            <span>Nhân Sự Hoạt Động</span>
            <div className="p-2 bg-[#EFF6FF] text-[#1D4ED8] rounded-lg">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div className="mt-2 text-2xl font-bold text-slate-900 font-mono-numbers">
            {summary.totalMembers} <span className="text-sm font-normal text-slate-500">thành viên</span>
          </div>
          <div className="mt-1 text-xs text-slate-500">
            {sortedCoreGroups.length > 0 ? `Phân bổ qua ${sortedCoreGroups.length} nhóm nghiệp vụ` : 'Từ Core → Nhân sự ONB'}
          </div>
        </div>
      </div>

      {/* Group Workload & Balance Comparison */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-base font-semibold text-slate-900">
              Cân Bằng Điểm Nghiệp Vụ Giữa Các Nhóm ({monthYear})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Mục tiêu phân bổ đào tạo và tiến độ nhằm duy trì cân đối năng suất giữa các nhóm (Đồng bộ theo Thiết lập hệ thống)
            </p>
          </div>
          <button
            onClick={() => onNavigateTab('allocation')}
            className="text-xs text-[#4F46E5] hover:text-[#4338CA] font-semibold flex items-center gap-1 cursor-pointer"
          >
            Lịch đào tạo tập trung <ArrowUpRight className="w-3.5 h-3.5" />
          </button>
        </div>

        <div className={`grid grid-cols-1 md:grid-cols-${Math.min(Math.max(sortedCoreGroups.length, 1), 4)} gap-4`}>
          {sortedCoreGroups.map(group => {
            const groupName = group.name;
            const g = groupStats[groupName] || { score: 0, members: 0, tasks: 0 };
            return (
              <div key={group.id || groupName} className="p-4 rounded-xl border border-slate-200 bg-slate-50/60 hover:bg-slate-50 transition-colors">
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-slate-800">{groupName}</span>
                  <span className="text-xs text-slate-500">{g.members} nhân sự</span>
                </div>
                <div className="mt-3 flex items-baseline justify-between">
                  <span className="text-2xl font-bold text-slate-900 font-mono-numbers">
                    {g.score.toLocaleString('vi-VN')}
                  </span>
                  <span className="text-xs text-slate-600">
                    {g.tasks} lượt việc
                  </span>
                </div>
                <div className="mt-2 text-[11px] text-slate-500">
                  Trung bình: {g.members > 0 ? (g.score / g.members).toFixed(1) : 0} điểm / người
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Two Column Layout: Top Performers & Recent Audit Stream */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Top 5 Contributors */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-slate-900">
              Top Ghi Nhận Điểm Tháng {monthYear}
            </h3>
            <button
              onClick={() => onNavigateTab('scorecard')}
              className="text-xs text-[#4F46E5] hover:text-[#4338CA] font-semibold cursor-pointer"
            >
              Xem Thưởng hiệu quả →
            </button>
          </div>

          <div className="divide-y divide-slate-100">
            {topPerformers.map((row, idx) => {
              const official = getRowOfficialBonus(row, isPoolConfigured, departmentTotalW);
              return (
                <div key={row.onbCode} className="py-2.5 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-xs font-bold text-slate-400 font-mono-numbers">
                      #{idx + 1}
                    </span>
                    <div>
                      <div className="text-sm font-medium text-slate-900">{row.fullName}</div>
                      <div className="text-xs text-slate-500">
                        {row.onbCode} · {row.currentGroup} · {row.totalTasks} công việc
                      </div>
                    </div>
                  </div>

                  <div className="text-right">
                    <div className="text-sm font-bold text-slate-900 font-mono-numbers">
                      {row.totalRecordedScore || row.totalMonthlyScore || 0} <span className="text-xs font-normal text-slate-500">điểm</span>
                    </div>
                    {official.amount !== null && official.amount !== undefined ? (
                      official.amount > 0 ? (
                        <div className="text-xs text-[#92400E] font-mono-numbers">
                          +{official.amount.toLocaleString('vi-VN')} đ
                        </div>
                      ) : (
                        <div className="text-xs text-slate-400 font-mono-numbers">
                          0 đ
                        </div>
                      )
                    ) : null}
                  </div>
                </div>
              );
            })}
            {topPerformers.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-400">
                Chưa có dữ liệu điểm trong tháng này
              </div>
            )}
          </div>
        </div>

        {/* Audit Log Stream */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-semibold text-slate-900">Nhật Ký Thay Đổi Gần Đây</h3>
            </div>
            <button
              onClick={() => onNavigateTab('audit')}
              className="text-xs text-[#4F46E5] hover:text-[#4338CA] font-semibold cursor-pointer"
            >
              Xem tất cả →
            </button>
          </div>

          <div className="space-y-3">
            {auditLogs.slice(0, 5).map(log => (
              <div key={log.id} className="text-xs border-l-2 border-[#4F46E5] pl-3 py-0.5">
                <div className="flex items-center justify-between text-slate-500">
                  <span className="font-medium text-slate-800">{log.userName} ({log.onbCode})</span>
                  <span className="font-mono text-[11px]">
                    {new Date(log.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="text-slate-700 mt-0.5">{log.description}</div>
              </div>
            ))}
            {auditLogs.length === 0 && (
              <div className="py-6 text-center text-xs text-slate-400">
                Chưa có thao tác mới
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
