import React, { useState, useEffect, useMemo, useCallback } from 'react';
import {
  ONBMember,
  ONBGroup,
  CustomerPackage,
  ScorecardRow,
  CurrentUserSession,
  WorkAllocationResult,
  GroupWorkAllocation,
  ONBWorkAllocationRow
} from '../types';
import {
  computeWorkAllocationData,
  formatPercentage,
  formatScore
} from '../utils/workAllocationCalculations';
import { api } from '../services/api';
import {
  Users,
  Calendar,
  Filter,
  Search,
  Download,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  HelpCircle,
  TrendingUp,
  Award,
  Layers,
  ArrowUpDown,
  Building,
  UserCheck,
  ShieldAlert,
  Info
} from 'lucide-react';

interface WorkAllocationTabProps {
  monthYear: string;
  onMonthChange: (m: string) => void;
  isMonthLocked: boolean;
  members: ONBMember[];
  groups: ONBGroup[];
  packages: CustomerPackage[];
  scorecardRows: ScorecardRow[];
  session: CurrentUserSession | null;
  onRefreshData?: () => Promise<void>;
}

export const WorkAllocationTab: React.FC<WorkAllocationTabProps> = ({
  monthYear,
  onMonthChange,
  isMonthLocked,
  members,
  groups,
  packages,
  scorecardRows,
  session,
  onRefreshData
}) => {
  // Account-specific persistence key for independent filters
  const accountFilterKey = `onb_filter_work_allocation_${session?.onbCode || 'default'}`;

  // Local filter states (loaded from account storage or default)
  const [selectedGroup, setSelectedGroup] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(accountFilterKey);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.group !== undefined) return parsed.group;
      }
    } catch {
      // ignore
    }
    return ''; // Default: All groups
  });

  const [searchTerm, setSearchTerm] = useState<string>('');
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'synced' | 'error'>('synced');
  const [lastSyncTime, setLastSyncTime] = useState<string>(() => new Date().toLocaleTimeString('vi-VN'));
  const [syncError, setSyncError] = useState<string | null>(null);
  const [showFormulaInfo, setShowFormulaInfo] = useState<boolean>(false);
  const [filterWarning, setFilterWarning] = useState<string | null>(null);

  // Save independent filter state per account on change
  useEffect(() => {
    try {
      localStorage.setItem(accountFilterKey, JSON.stringify({
        group: selectedGroup
      }));
    } catch {
      // ignore storage issues
    }
  }, [accountFilterKey, selectedGroup]);

  // Available groups strictly from Core
  const availableGroups = useMemo(() => {
    if (groups && groups.length > 0) {
      return [...groups].sort((a, b) => a.order - b.order).map(g => g.name);
    }
    return [];
  }, [groups]);

  // Validate group filter against latest groups from Core
  useEffect(() => {
    if (selectedGroup && availableGroups.length > 0 && !availableGroups.includes(selectedGroup)) {
      const oldGroup = selectedGroup;
      setSelectedGroup('');
      setFilterWarning(`Nhóm "${oldGroup}" không còn tồn tại trong Thiết lập hệ thống. Bộ lọc đã được tự động chuyển về "Toàn phòng (Tất cả nhóm)".`);
    }
  }, [selectedGroup, availableGroups]);

  // Months for Month/Year picker
  const monthOptions = [
    { val: '2026-12', label: 'Tháng 12/2026' },
    { val: '2026-11', label: 'Tháng 11/2026' },
    { val: '2026-10', label: 'Tháng 10/2026 (Hiện tại)' },
    { val: '2026-09', label: 'Tháng 09/2026' },
    { val: '2026-08', label: 'Tháng 08/2026' },
    { val: '2026-07', label: 'Tháng 07/2026' },
    { val: '2026-06', label: 'Tháng 06/2026' },
    { val: '2026-05', label: 'Tháng 05/2026' },
    { val: '2026-04', label: 'Tháng 04/2026' },
    { val: '2026-03', label: 'Tháng 03/2026' },
    { val: '2026-02', label: 'Tháng 02/2026' },
    { val: '2026-01', label: 'Tháng 01/2026' }
  ];

  // Compute work allocation data from authoritative source props
  const allocationResult: WorkAllocationResult = useMemo(() => {
    try {
      return computeWorkAllocationData({
        monthYear,
        members,
        groups,
        packages,
        scorecardRows
      });
    } catch (err: any) {
      console.error('Lỗi tính toán phân bổ công việc ONB:', err);
      // Retain previous or empty safe result, do NOT zero-out unless empty
      return {
        monthYear,
        groups: [],
        summary: {
          totalMembers: 0,
          totalGroups: 0,
          totalKH: 0,
          totalGoi: 0,
          totalDiemTiepNhan: 0,
          totalDiemThucHien: 0
        }
      };
    }
  }, [monthYear, members, groups, packages, scorecardRows]);

  // Handle manual sync refresh
  const handleManualSync = async () => {
    setSyncStatus('loading');
    setSyncError(null);
    try {
      if (onRefreshData) {
        await onRefreshData();
      }
      setLastSyncTime(new Date().toLocaleTimeString('vi-VN'));
      setSyncStatus('synced');
    } catch (err: any) {
      console.error('Lỗi đồng bộ dữ liệu:', err);
      setSyncStatus('error');
      setSyncError(err.message || 'Lỗi kết nối khi đồng bộ dữ liệu.');
    }
  };

  // Filter groups to display according to user selection
  const displayedGroups = useMemo(() => {
    let result = allocationResult.groups;
    if (selectedGroup) {
      result = result.filter(g => g.groupName === selectedGroup || g.groupId === selectedGroup);
    }
    return result;
  }, [allocationResult, selectedGroup]);

  // Filter rows within group by search term without changing rank within group
  const getFilteredRowsForGroup = useCallback((group: GroupWorkAllocation) => {
    if (!searchTerm.trim()) {
      return group.rows;
    }
    const term = searchTerm.trim().toLowerCase();
    return group.rows.filter(r =>
      r.fullName.toLowerCase().includes(term) ||
      r.onbCode.toLowerCase().includes(term)
    );
  }, [searchTerm]);

  // Export to Excel (CSV)
  const handleExportCSV = () => {
    const csvRows: string[] = [];
    csvRows.push('\uFEFF'); // UTF-8 BOM for Microsoft Excel

    // CSV Header
    csvRows.push([
      'Nhóm',
      'STT',
      'Mã ONB',
      'Họ và tên',
      'KH tiếp nhận',
      'Gói tiếp nhận',
      'Điểm tiếp nhận',
      'Tổng điểm đã thực hiện trong tháng',
      'Tỷ lệ hoàn thành điểm công việc',
      'Đánh giá',
      'Mức độ hoàn thành công việc',
      'Gợi ý phân công',
      'Ghi chú cảnh báo'
    ].map(f => `"${f.replace(/"/g, '""')}"`).join(','));

    // Data rows
    displayedGroups.forEach(group => {
      const filtered = getFilteredRowsForGroup(group);
      filtered.forEach((r, idx) => {
        csvRows.push([
          group.groupName,
          String(idx + 1),
          r.onbCode,
          r.fullName,
          String(r.taxCodesCount),
          String(r.packagesCount),
          formatScore(r.receptionScore),
          formatScore(r.totalMonthlyScore),
          formatPercentage(r.completionRate),
          formatPercentage(r.evaluation),
          r.completionLevel,
          r.suggestion,
          r.warningNote || ''
        ].map(f => `"${String(f).replace(/"/g, '""')}"`).join(','));
      });
    });

    const blob = new Blob([csvRows.join('\r\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.setAttribute('download', `Phan_bo_cong_viec_ONB_${monthYear}_${selectedGroup || 'Toan_phong'}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper badge styles
  const getCompletionLevelBadge = (level: string) => {
    switch (level) {
      case 'Vượt mong đợi':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-emerald-100 text-emerald-800 border border-emerald-300">
            ★ Vượt mong đợi
          </span>
        );
      case 'Đạt':
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-blue-100 text-blue-800 border border-blue-300">
            ✓ Đạt
          </span>
        );
      case 'Cần cố gắng':
      default:
        return (
          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-semibold bg-rose-100 text-rose-800 border border-rose-300">
            ⚠ Cần cố gắng
          </span>
        );
    }
  };

  const getSuggestionBadge = (suggestion: string) => {
    switch (suggestion) {
      case 'Hạn chế giao việc':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-rose-50 text-rose-700 border border-rose-200 shadow-2xs">
            Hạn chế giao việc
          </span>
        );
      case 'Giao thêm 1 chút':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-amber-50 text-amber-800 border border-amber-200 shadow-2xs">
            Giao thêm 1 chút
          </span>
        );
      case 'Ngừng hoạt động (Không giao việc)':
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-semibold bg-slate-100 text-slate-500 border border-slate-200 shadow-2xs">
            Ngừng hoạt động
          </span>
        );
      case 'Giao tẹt ga':
      default:
        return (
          <span className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-200 shadow-2xs">
            Giao tẹt ga
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Header & Quick Overview */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-indigo-50 border border-indigo-200 flex items-center justify-center text-indigo-700 font-bold">
                <Users className="w-4 h-4" />
              </div>
              <div>
                <h1 className="text-lg font-bold text-slate-900 tracking-tight">
                  Điều phối công việc
                </h1>
                <p className="text-xs text-slate-500">
                  Theo dõi khối lượng tiếp nhận, mức độ hoàn thành công việc và gợi ý phân công theo tháng, theo nhóm
                </p>
              </div>
            </div>
          </div>

          {/* Realtime Status Indicator & Actions */}
          <div className="flex items-center gap-2.5 flex-wrap">
            {/* Realtime Indicator */}
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs bg-slate-50 border-slate-200">
              {syncStatus === 'loading' ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 text-blue-600 animate-spin" />
                  <span className="text-blue-700 font-medium">Đang tải...</span>
                </>
              ) : syncStatus === 'error' ? (
                <>
                  <AlertCircle className="w-3.5 h-3.5 text-rose-600" />
                  <span className="text-rose-700 font-medium">Lỗi đồng bộ</span>
                </>
              ) : (
                <>
                  <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  <span className="text-slate-600">Đã cập nhật lúc:</span>
                  <span className="font-mono font-semibold text-slate-900">{lastSyncTime}</span>
                </>
              )}
            </div>

            {/* Reload Data Button (Nạp lại dữ liệu từ Thiết lập hệ thống) */}
            <button
              onClick={handleManualSync}
              disabled={syncStatus === 'loading'}
              className="px-3 py-1.5 font-medium text-xs text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs disabled:opacity-50"
              title="Đọc lại dữ liệu mới nhất từ Thiết lập hệ thống & các phân hệ"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${syncStatus === 'loading' ? 'animate-spin' : ''}`} />
              <span>Nạp lại dữ liệu</span>
            </button>

            {/* Formula Guide Toggle */}
            <button
              onClick={() => setShowFormulaInfo(!showFormulaInfo)}
              className={`px-3 py-1.5 font-medium text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer border ${
                showFormulaInfo
                  ? 'bg-indigo-50 border-indigo-200 text-indigo-700'
                  : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50'
              }`}
              title="Xem giải thích quy tắc tính và gợi ý phân công"
            >
              <Info className="w-3.5 h-3.5" />
              <span>Quy tắc tính & Gợi ý</span>
            </button>

            {/* Export Excel Button */}
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 font-medium text-xs text-slate-700 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
              title="Xuất bảng ra tệp CSV Excel"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel</span>
            </button>
          </div>
        </div>

        {/* Sync Error Banner if any */}
        {syncError && (
          <div className="mt-3 p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>{syncError} (Dữ liệu hiển thị được bảo lưu an toàn từ phiên trước)</span>
            </div>
            <button
              onClick={handleManualSync}
              className="underline font-semibold hover:text-rose-900 cursor-pointer"
            >
              Thử lại
            </button>
          </div>
        )}

        {/* Department Summary Cards */}
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mt-4 pt-4 border-t border-slate-100">
          <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Tổng nhân sự</span>
            <span className="text-base font-bold font-mono text-slate-900 mt-0.5 block">
              {allocationResult.summary.totalMembers} ONB
            </span>
            <span className="text-[10px] text-slate-400">
              {displayedGroups.length} nhóm hiển thị
            </span>
          </div>

          <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">KH tiếp nhận</span>
            <span className="text-base font-bold font-mono text-indigo-700 mt-0.5 block">
              {displayedGroups.reduce((s, g) => s + g.totalKH, 0)}
            </span>
            <span className="text-[10px] text-slate-400">Không trùng MST/ONB</span>
          </div>

          <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Gói tiếp nhận</span>
            <span className="text-base font-bold font-mono text-indigo-700 mt-0.5 block">
              {displayedGroups.reduce((s, g) => s + g.totalGoi, 0)}
            </span>
            <span className="text-[10px] text-slate-400">Bản ghi gói gốc</span>
          </div>

          <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Điểm tiếp nhận</span>
            <span className="text-base font-bold font-mono text-blue-700 mt-0.5 block">
              {formatScore(displayedGroups.reduce((s, g) => s + g.totalDiemTiepNhan, 0))} đ
            </span>
            <span className="text-[10px] text-slate-400">Từ Tiếp nhận gói đào tạo</span>
          </div>

          <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Tổng điểm thực hiện</span>
            <span className="text-base font-bold font-mono text-emerald-700 mt-0.5 block">
              {formatScore(displayedGroups.reduce((s, g) => s + g.totalDiemThucHien, 0))} đ
            </span>
            <span className="text-[10px] text-slate-400">Khớp Thưởng hiệu quả</span>
          </div>

          <div className="bg-slate-50/80 rounded-lg p-3 border border-slate-100">
            <span className="text-[11px] font-medium text-slate-500 uppercase tracking-wider block">Trạng thái kỳ</span>
            <span className={`text-xs font-bold px-2 py-0.5 rounded mt-1 inline-block ${
              isMonthLocked ? 'bg-amber-100 text-amber-800' : 'bg-emerald-100 text-emerald-800'
            }`}>
              {isMonthLocked ? 'Đã khóa sổ' : 'Đang mở'}
            </span>
            <span className="text-[10px] text-slate-400 block mt-0.5">Tháng {monthYear}</span>
          </div>
        </div>
      </div>

      {/* Explainer / Formula Guide Card (Collapsible) */}
      {showFormulaInfo && (
        <div className="bg-indigo-50/60 border border-indigo-200 rounded-xl p-4 text-xs text-slate-700 space-y-3">
          <div className="flex items-center justify-between font-bold text-indigo-900 border-b border-indigo-200 pb-2">
            <div className="flex items-center gap-1.5">
              <Info className="w-4 h-4 text-indigo-600" />
              <span>Quy tắc tính toán và Cơ chế Gợi ý phân công công việc</span>
            </div>
            <button
              onClick={() => setShowFormulaInfo(false)}
              className="text-slate-400 hover:text-slate-700 text-xs cursor-pointer font-normal"
            >
              Đóng lại
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-2xs space-y-1">
              <h4 className="font-bold text-slate-900 text-xs">1. Tiếp nhận gói đào tạo</h4>
              <p className="text-[11px] text-slate-600">
                • <strong>KH tiếp nhận</strong>: Đếm số Mã số thuế không trùng của ONB trong tháng (giữ số 0 đầu). Có nhiều dòng cùng MST chỉ tính 1 KH. Nếu thiếu MST thì cảnh báo bổ sung.
              </p>
              <p className="text-[11px] text-slate-600">
                • <strong>Gói tiếp nhận</strong>: Tổng số bản ghi gói tiếp nhận gốc thuộc ONB trong tháng (không nhân theo module con).
              </p>
            </div>

            <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-2xs space-y-1">
              <h4 className="font-bold text-slate-900 text-xs">2. Tỷ lệ hoàn thành & Đánh giá</h4>
              <p className="text-[11px] text-slate-600">
                • <strong>Tổng điểm thực hiện trong tháng</strong>: Khớp chuẩn cột Tổng điểm thực hiện (T) tại Thưởng hiệu quả.
              </p>
              <p className="text-[11px] text-slate-600">
                • <strong>Tỷ lệ hoàn thành điểm công việc</strong> = Tổng điểm / 100 (Ví dụ: 80đ = 80%, 100đ = 100%, 120đ = 120%).
              </p>
              <p className="text-[11px] text-slate-600">
                • <strong>Đánh giá</strong> = Tỷ lệ * 30% (Ví dụ: 80đ = 24%, 100đ = 30%, 120đ = 36%).
              </p>
            </div>

            <div className="bg-white p-3 rounded-lg border border-indigo-100 shadow-2xs space-y-1">
              <h4 className="font-bold text-slate-900 text-xs">3. Mức độ & Gợi ý phân công</h4>
              <p className="text-[11px] text-slate-600">
                • <strong>Mức độ</strong>: Đánh giá &lt; 30%: <span className="text-rose-700 font-semibold">Cần cố gắng</span> · = 30%: <span className="text-blue-700 font-semibold">Đạt</span> · &gt; 30%: <span className="text-emerald-700 font-semibold">Vượt mong đợi</span>.
              </p>
              <p className="text-[11px] text-slate-600">
                • <strong>Gợi ý theo xếp hạng giảm dần tổng điểm trong nhóm</strong>:<br />
                - Vị trí 1 - 3: <span className="text-rose-700 font-bold">Hạn chế giao việc</span><br />
                - Vị trí 4 - 6: <span className="text-amber-700 font-bold">Giao thêm 1 chút</span><br />
                - Từ vị trí 7: <span className="text-emerald-700 font-bold">Giao tẹt ga</span><br />
                (Khi bằng điểm: Ưu tiên mã ONB tăng dần để ổn định thứ tự).
              </p>
            </div>
          </div>
        </div>
      )}

      {/* 2. Independent Filters Bar */}
      <div className="bg-white border border-slate-200 rounded-xl p-4 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5 flex-wrap">
          {/* Month/Year Filter */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
            <Calendar className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-medium text-slate-600">Kỳ:</span>
            <select
              value={monthYear}
              onChange={e => onMonthChange(e.target.value)}
              className="bg-transparent font-semibold text-slate-900 focus:outline-hidden cursor-pointer"
            >
              {monthOptions.map(m => (
                <option key={m.val} value={m.val}>{m.label}</option>
              ))}
            </select>
          </div>

          {/* Group Filter (Account-independent, persistent) */}
          <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 px-3 py-1.5 rounded-lg text-xs">
            <Filter className="w-3.5 h-3.5 text-slate-500" />
            <span className="font-medium text-slate-600">Nhóm:</span>
            <select
              value={selectedGroup}
              onChange={e => setSelectedGroup(e.target.value)}
              className="bg-transparent font-semibold text-slate-900 focus:outline-hidden cursor-pointer"
            >
              <option value="">Toàn phòng (Tất cả nhóm)</option>
              {availableGroups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>
          </div>
        </div>

        {/* Search ONB Filter */}
        <div className="relative min-w-[220px]">
          <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên hoặc mã ONB..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-9 pr-3 py-1.5 border border-slate-200 rounded-lg text-xs focus:outline-hidden focus:border-indigo-500 bg-white"
          />
        </div>
      </div>

      {/* 3. Main Tables: Per Group Sections */}
      {displayedGroups.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-xl p-12 text-center text-slate-400">
          <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
          <p className="text-sm font-medium text-slate-600">Không tìm thấy nhóm hoặc nhân sự nào phù hợp bộ lọc</p>
          <p className="text-xs text-slate-400 mt-1">Vui lòng thay đổi lựa chọn nhóm hoặc tháng đang xem</p>
        </div>
      ) : (
        displayedGroups.map(group => {
          const filteredRows = getFilteredRowsForGroup(group);

          return (
            <div key={group.groupId} className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden space-y-0">
              {/* Group Section Header */}
              <div className="bg-slate-50/90 px-4 py-3 border-b border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div className="flex items-center gap-2.5">
                  <span className="w-2.5 h-2.5 rounded-full bg-indigo-600"></span>
                  <h2 className="text-sm font-bold text-slate-900">{group.groupName}</h2>
                  <span className="text-xs text-slate-400 font-normal">
                    ({group.totalMembers} nhân sự trong nhóm)
                  </span>
                  {searchTerm && (
                    <span className="text-[11px] bg-indigo-50 text-indigo-700 px-2 py-0.5 rounded font-medium">
                      Khớp: {filteredRows.length}/{group.totalMembers}
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-3 text-xs text-slate-600 flex-wrap">
                  <span>
                    KH: <strong className="text-slate-900">{group.totalKH}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Gói: <strong className="text-slate-900">{group.totalGoi}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Điểm tiếp nhận: <strong className="text-blue-700">{formatScore(group.totalDiemTiepNhan)} đ</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Điểm thực hiện: <strong className="text-emerald-700">{formatScore(group.totalDiemThucHien)} đ</strong>
                  </span>
                </div>
              </div>

              {/* Table with EXACT Columns and Order */}
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="bg-[#F1F5F9] text-[#475569] font-bold border-b border-[#E2E8F0]">
                      {/* 1. STT */}
                      <th className="py-2.5 px-3 whitespace-nowrap text-center w-12" title="Số thứ tự trong nhóm">
                        STT
                      </th>

                      {/* 2. ONB */}
                      <th className="py-2.5 px-3 whitespace-nowrap min-w-[170px]" title="Nhân sự ONB (Họ tên, Nhóm, Mã định danh)">
                        ONB
                      </th>

                      {/* 3. KH tiếp nhận */}
                      <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[90px]" title="Số lượng Mã số thuế không trùng của ONB trong tháng">
                        KH tiếp nhận
                      </th>

                      {/* 4. Gói tiếp nhận */}
                      <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[90px]" title="Tổng số bản ghi gói tiếp nhận gốc thuộc ONB trong tháng">
                        Gói tiếp nhận
                      </th>

                      {/* 5. Điểm tiếp nhận */}
                      <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[100px]" title="Tổng tất cả Điểm tiếp nhận của ONB trong tháng từ Tiếp nhận gói đào tạo">
                        Điểm tiếp nhận
                      </th>

                      {/* 6. Tổng điểm đã thực hiện trong tháng */}
                      <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[125px] font-bold text-slate-900" title="Cột Tổng điểm thực hiện trong tháng từ Thưởng hiệu quả">
                        Tổng điểm đã thực hiện<br />trong tháng
                      </th>

                      {/* 7. Tỷ lệ hoàn thành điểm công việc */}
                      <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[110px]" title="Tỷ lệ = Tổng điểm đã thực hiện / 100">
                        Tỷ lệ hoàn thành<br />điểm công việc
                      </th>

                      {/* 8. Đánh giá */}
                      <th className="py-2.5 px-3 text-right whitespace-nowrap min-w-[90px]" title="Đánh giá = Tỷ lệ hoàn thành * 30%">
                        Đánh giá
                      </th>

                      {/* 9. Mức độ hoàn thành công việc */}
                      <th className="py-2.5 px-3 text-center whitespace-nowrap min-w-[125px]" title="<30%: Cần cố gắng, =30%: Đạt, >30%: Vượt mong đợi">
                        Mức độ hoàn thành<br />công việc
                      </th>

                      {/* 10. Gợi ý phân công */}
                      <th className="py-2.5 px-3 text-center whitespace-nowrap min-w-[140px]" title="Xếp hạng giảm dần theo Tổng điểm trong nhóm. Vị trí 1-3: Hạn chế giao việc, 4-6: Giao thêm 1 chút, từ 7 trở đi: Giao tẹt ga">
                        Gợi ý phân công
                      </th>
                    </tr>
                  </thead>

                  <tbody className="divide-y divide-slate-100">
                    {filteredRows.length === 0 ? (
                      <tr>
                        <td colSpan={10} className="py-8 text-center text-slate-400 italic">
                          Không tìm thấy nhân sự phù hợp từ khóa tìm kiếm trong nhóm này
                        </td>
                      </tr>
                    ) : (
                      filteredRows.map((row, rowIdx) => {
                        return (
                          <tr
                            key={row.memberId || row.onbCode}
                            className="hover:bg-slate-50/80 transition-colors"
                          >
                            {/* 1. STT */}
                            <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                              {row.stt}
                            </td>

                            {/* 2. ONB */}
                            <td className="py-2.5 px-3">
                              <div className="font-semibold text-slate-900 flex items-center gap-1.5">
                                <span>{row.fullName}</span>
                                <span className="text-[10px] text-slate-400 font-mono">({row.onbCode})</span>
                              </div>
                              <div className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                                <span className="text-slate-400">{row.groupName}</span>
                              </div>
                            </td>

                            {/* 3. KH tiếp nhận */}
                            <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-800">
                              <div className="flex items-center justify-end gap-1">
                                <span>{row.taxCodesCount}</span>
                                {row.hasMissingTaxWarning && (
                                  <span
                                    className="text-amber-500 cursor-help"
                                    title={row.warningNote}
                                  >
                                    <AlertTriangle className="w-3 h-3 inline" />
                                  </span>
                                )}
                              </div>
                            </td>

                            {/* 4. Gói tiếp nhận */}
                            <td className="py-2.5 px-3 text-right font-mono font-medium text-slate-800">
                              {row.packagesCount}
                            </td>

                            {/* 5. Điểm tiếp nhận */}
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-blue-700">
                              {formatScore(row.receptionScore)}
                            </td>

                            {/* 6. Tổng điểm đã thực hiện trong tháng */}
                            <td className="py-2.5 px-3 text-right font-mono font-bold text-slate-900 bg-slate-50/50">
                              {formatScore(row.totalMonthlyScore)}
                            </td>

                            {/* 7. Tỷ lệ hoàn thành điểm công việc */}
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-indigo-700">
                              {formatPercentage(row.completionRate)}
                            </td>

                            {/* 8. Đánh giá */}
                            <td className="py-2.5 px-3 text-right font-mono font-semibold text-slate-800">
                              {formatPercentage(row.evaluation)}
                            </td>

                            {/* 9. Mức độ hoàn thành công việc */}
                            <td className="py-2.5 px-3 text-center">
                              {getCompletionLevelBadge(row.completionLevel)}
                            </td>

                            {/* 10. Gợi ý phân công */}
                            <td className="py-2.5 px-3 text-center">
                              <div className="flex items-center justify-center gap-1.5">
                                <span className="font-mono text-[10px] text-slate-400 font-bold" title={`Hạng ${row.rankInGroup} trong nhóm ${group.groupName}`}>
                                  #{row.rankInGroup}
                                </span>
                                {getSuggestionBadge(row.suggestion)}
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>

                  {/* Group Summary Footer Row */}
                  <tfoot>
                    <tr className="bg-slate-100 font-bold text-slate-900 border-t-2 border-slate-200">
                      <td colSpan={2} className="py-2.5 px-3 text-slate-800">
                        TỔNG CỘNG {group.groupName.toUpperCase()}:
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-indigo-800">
                        {group.totalKH}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-indigo-800">
                        {group.totalGoi}
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-blue-800">
                        {formatScore(group.totalDiemTiepNhan)} đ
                      </td>
                      <td className="py-2.5 px-3 text-right font-mono text-emerald-800">
                        {formatScore(group.totalDiemThucHien)} đ
                      </td>
                      <td colSpan={4} className="py-2.5 px-3 text-right text-xs text-slate-500 font-normal">
                        Bình quân:{' '}
                        <strong className="text-slate-800 font-mono">
                          {group.totalMembers > 0
                            ? formatScore(Math.round((group.totalDiemThucHien / group.totalMembers) * 100) / 100)
                            : 0} đ/người
                        </strong>
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          );
        })
      )}
    </div>
  );
};
