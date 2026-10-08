import React, { useState, useMemo, useEffect } from 'react';
import { ScorecardRow, CurrentUserSession, MonthlyBonusPool } from '../types';
import { getRowOfficialBonus } from '../utils/scorecardCalculations';
import { api } from '../services/api';
import {
  Search,
  Download,
  Calendar,
  Lock,
  Check,
  AlertCircle,
  Coins,
  Save,
  RotateCcw,
  Info
} from 'lucide-react';

interface ScorecardTabProps {
  scorecardData: {
    monthYear: string;
    isLocked: boolean;
    bonusPool?: MonthlyBonusPool | null;
    rows: ScorecardRow[];
    totalDepartmentWeightedScore?: number;
    summary?: {
      totalMembers: number;
      totalRecordedScoreAll: number;
      totalWeightedScoreAll?: number;
      totalBonusAll: number;
      poolAmount?: number | null;
      roundingDiff?: number;
      totalTasksAll?: number;
    };
  } | null;
  monthYear: string;
  onMonthChange?: (m: string) => void;
  isMonthLocked: boolean;
  session: CurrentUserSession | null;
  onOpenDrilldown: (onbCode: string, category?: 'DEMO_POC' | 'PACKAGES' | 'TRAINING' | 'ALL') => void;
  onSaveBonus?: (onbCode: string, amount: number | null) => Promise<void>;
  onRefreshData?: () => void;
}

export const ScorecardTab: React.FC<ScorecardTabProps> = ({
  scorecardData,
  monthYear,
  onMonthChange,
  isMonthLocked,
  session,
  onOpenDrilldown,
  onRefreshData
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');

  // Department Bonus Fund state
  const bonusPool = scorecardData?.bonusPool || null;
  const isPoolConfigured = bonusPool !== null && bonusPool !== undefined && bonusPool.amount !== null && bonusPool.amount !== undefined;
  const poolAmount = isPoolConfigured ? bonusPool!.amount! : null;

  const [fundInput, setFundInput] = useState<string>('');
  const [isSavingFund, setIsSavingFund] = useState(false);
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [fundSaveMessage, setFundSaveMessage] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Sync fund input when monthYear or pool changes
  useEffect(() => {
    if (isPoolConfigured && poolAmount !== null) {
      setFundInput(poolAmount.toLocaleString('vi-VN'));
    } else {
      setFundInput('');
    }
    setFundSaveMessage(null);
  }, [monthYear, isPoolConfigured, poolAmount]);

  const rows = scorecardData?.rows || [];
  const departmentTotalW = scorecardData?.totalDepartmentWeightedScore ?? (
    rows.reduce((acc, r) => acc + (r.weightedScore || 0), 0)
  );

  // Permissions: Master Admin or 2 designated bonusManagers, and month not locked
  const canManageBonus = !!(session?.canEditBonus && !isMonthLocked);

  // Available groups for dropdown from distinct groups in data
  const availableGroups = useMemo(() => {
    const s = new Set<string>();
    rows.forEach(r => {
      if (r.currentGroup) s.add(r.currentGroup);
      if (r.displayGroups) {
        r.displayGroups.split(',').forEach(g => s.add(g.trim()));
      }
    });
    return Array.from(s).filter(Boolean).sort();
  }, [rows]);

  // Months for Month/Year picker
  const monthOptions = [
    { val: '2026-12', label: '12/2026' },
    { val: '2026-11', label: '11/2026' },
    { val: '2026-10', label: '10/2026 (Hiện tại)' },
    { val: '2026-09', label: '09/2026' },
    { val: '2026-08', label: '08/2026' },
    { val: '2026-07', label: '07/2026' },
    { val: '2026-06', label: '06/2026' },
    { val: '2026-05', label: '05/2026' },
    { val: '2026-04', label: '04/2026' },
    { val: '2026-03', label: '03/2026' },
    { val: '2026-02', label: '02/2026' },
    { val: '2026-01', label: '01/2026' }
  ];

  // Process rows with filtering:
  // When a group is filtered, display scores within that group;
  // Denominator remains whole department total W!
  // CRITICAL REQUIREMENT 1.3: Khoản thưởng luôn tính từ tổng điểm cả tháng của ONB trên toàn phòng,
  // lọc nhóm hay tìm tên KHÔNG làm thay đổi tiền thưởng!
  const displayRows = useMemo(() => {
    return rows.map(r => {
      if (!selectedGroup) {
        // Whole department view
        return {
          ...r,
          dispA: r.scoreDemoPocTienVe,
          dispB: r.scoreReception,
          dispC: r.scoreTraining,
          dispT: r.totalMonthlyScore,
          dispW: r.weightedScore,
          dispRatio: r.departmentRatio,
          matchFilter: true
        };
      }

      // Group filtered view
      const gData = r.groupBreakdown?.[selectedGroup];
      const belongsToGroup = (r.currentGroup === selectedGroup) ||
        (r.displayGroups && r.displayGroups.includes(selectedGroup)) ||
        (gData !== undefined);

      const dispA = gData ? gData.a : 0;
      const dispB = gData ? gData.b : 0;
      const dispC = gData ? gData.c : 0;
      const dispT = gData ? gData.t : 0;
      const dispW = gData ? gData.w : 0;

      // Numerator is filtered W, denominator is departmentTotalW
      const dispRatio = departmentTotalW > 0
        ? Math.round((dispW / departmentTotalW) * 10000) / 100
        : 0;

      return {
        ...r,
        dispA,
        dispB,
        dispC,
        dispT,
        dispW,
        dispRatio,
        matchFilter: belongsToGroup
      };
    }).filter(r => {
      if (!r.matchFilter) return false;
      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchName = r.fullName.toLowerCase().includes(term);
        const matchCode = r.onbCode.toLowerCase().includes(term);
        if (!matchName && !matchCode) return false;
      }
      return true;
    }).sort((a, b) => b.dispW - a.dispW);
  }, [rows, selectedGroup, searchTerm, departmentTotalW]);

  // Compute column totals for the TỔNG CỘNG row
  const totals = useMemo(() => {
    let sumA = 0;
    let sumB = 0;
    let sumC = 0;
    let sumT = 0;
    let sumW = 0;
    let sumRatio = 0;
    let sumBonus = 0;

    displayRows.forEach(r => {
      sumA += r.dispA || 0;
      sumB += r.dispB || 0;
      sumC += r.dispC || 0;
      sumT += r.dispT || 0;
      sumW += r.dispW || 0;
      sumRatio += r.dispRatio || 0;
      const official = getRowOfficialBonus(r, isPoolConfigured, departmentTotalW);
      if (official.amount !== null && official.amount !== undefined) {
        sumBonus += official.amount;
      }
    });

    const roundingDiff = (poolAmount !== null && poolAmount > 0 && departmentTotalW > 0)
      ? (sumBonus - poolAmount)
      : 0;

    return {
      sumA: Math.round(sumA * 100) / 100,
      sumB: Math.round(sumB * 100) / 100,
      sumC: Math.round(sumC * 100) / 100,
      sumT: Math.round(sumT * 100) / 100,
      sumW: Math.round(sumW * 100) / 100,
      sumRatio: Math.round(sumRatio * 100) / 100,
      sumBonus,
      roundingDiff
    };
  }, [displayRows, poolAmount, departmentTotalW]);

  // Handle Fund Input formatting with thousands separators
  const handleFundInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!canManageBonus) return;
    const rawVal = e.target.value.replace(/[^\d]/g, '');
    if (rawVal === '') {
      setFundInput('');
    } else {
      const num = parseInt(rawVal, 10);
      setFundInput(num.toLocaleString('vi-VN'));
    }
  };

  // Open confirmation modal for fund save
  const handleRequestSaveFund = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!canManageBonus) return;
    setShowConfirmModal(true);
  };

  // Execute fund update
  const handleConfirmSaveFund = async () => {
    setShowConfirmModal(false);
    setIsSavingFund(true);
    setFundSaveMessage(null);
    try {
      const digits = fundInput.replace(/[^\d]/g, '');
      const parsedAmount = digits === '' ? null : parseInt(digits, 10);
      const res = await api.updateBonusPool({
        monthYear,
        amount: parsedAmount
      });
      setFundSaveMessage({
        type: 'success',
        text: parsedAmount === null
          ? 'Đã đặt lại trạng thái Chưa nhập quỹ cho cả phòng.'
          : `Đã lưu Tổng quỹ thưởng cả phòng: ${parsedAmount.toLocaleString('vi-VN')} VNĐ.`
      });
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setFundSaveMessage({
        type: 'error',
        text: err.message || 'Lỗi khi lưu tổng quỹ thưởng phòng.'
      });
    } finally {
      setIsSavingFund(false);
    }
  };

  // Clear fund action (reset to Chưa nhập quỹ)
  const handleClearFund = async () => {
    if (!canManageBonus) return;
    setIsSavingFund(true);
    setFundSaveMessage(null);
    try {
      await api.updateBonusPool({
        monthYear,
        amount: null
      });
      setFundInput('');
      setFundSaveMessage({
        type: 'success',
        text: 'Đã đặt lại về trạng thái Chưa nhập quỹ.'
      });
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setFundSaveMessage({
        type: 'error',
        text: err.message || 'Lỗi khi đặt lại quỹ thưởng.'
      });
    } finally {
      setIsSavingFund(false);
    }
  };

  // Export CSV matching exact 9 columns plus TỔNG CỘNG row
  const handleExportCSV = () => {
    if (displayRows.length === 0) return;
    const headers = [
      'ONB',
      'Nhóm',
      'Điểm DEMO/POC/Tiền về (55%)',
      'Điểm tiếp nhận (40%)',
      'Điểm đào tạo (5%)',
      'Tổng điểm thực hiện trong tháng',
      'Tổng điểm đã nhân trọng số',
      'Tỷ trọng trong phòng (%)',
      'Khoản thưởng (VNĐ)'
    ];

    const dataLines = displayRows.map(r => {
      const official = getRowOfficialBonus(r, isPoolConfigured, departmentTotalW);
      return [
        `"${r.onbCode} - ${r.fullName}"`,
        `"${selectedGroup ? selectedGroup : (r.displayGroups || r.currentGroup)}"`,
        r.dispA.toFixed(2),
        r.dispB.toFixed(2),
        r.dispC.toFixed(2),
        r.dispT.toFixed(2),
        r.dispW.toFixed(2),
        `"${r.dispRatio.toFixed(2)}%"`,
        official.amount !== null && official.amount !== undefined ? official.amount : '"Chưa nhập quỹ"'
      ].join(',');
    });

    // TỔNG CỘNG line
    const totalBonusVal = isPoolConfigured ? totals.sumBonus : (displayRows.some(r => r.bonusMode === 'MANUAL') ? totals.sumBonus : '"Chưa nhập quỹ"');
    const totalLine = [
      `"TỔNG CỘNG: ${displayRows.length} nhân sự"`,
      `"${selectedGroup ? selectedGroup : 'Toàn phòng'}"`,
      totals.sumA.toFixed(2),
      totals.sumB.toFixed(2),
      totals.sumC.toFixed(2),
      totals.sumT.toFixed(2),
      totals.sumW.toFixed(2),
      `"${totals.sumRatio.toFixed(2)}%"`,
      totalBonusVal
    ].join(',');

    const csvRows = [headers.join(','), ...dataLines, totalLine];
    const blob = new Blob(['\uFEFF' + csvRows.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Bang_diem_va_khoan_thuong_ONB_${monthYear}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  // Helper to format scores cleanly
  const fmtScore = (num: number) => {
    return num.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  return (
    <div className="space-y-3.5">
      {/* 1. Header & Control Bar: Title, Month, Department Bonus Fund, Group, Search, Export */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-3">
          {/* Left: Title & Month Picker */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-slate-900 tracking-tight">
                Thưởng hiệu quả
              </h2>
              {isMonthLocked && (
                <span className="flex items-center gap-1 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded font-medium">
                  <Lock className="w-3 h-3 text-amber-600" />
                  <span>Tháng khóa (Chỉ đọc)</span>
                </span>
              )}
            </div>

            {/* Month/Year selector */}
            {onMonthChange && (
              <div className="flex items-center gap-1.5 bg-slate-100/90 border border-slate-200 px-2.5 py-1 rounded-md">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <select
                  value={monthYear}
                  onChange={e => onMonthChange(e.target.value)}
                  className="bg-transparent text-xs font-semibold text-slate-800 focus:outline-hidden cursor-pointer"
                  aria-label="Chọn tháng/năm"
                >
                  {monthOptions.map(m => (
                    <option key={m.val} value={m.val}>
                      Tháng {m.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Center/Left: Ô Tổng quỹ thưởng cả phòng (VNĐ) - Yêu cầu 1.1 */}
          <div className="flex items-center gap-2 bg-emerald-50/70 border border-emerald-200 px-3 py-1.5 rounded-lg">
            <div className="flex items-center gap-1.5 text-emerald-900 font-semibold text-xs whitespace-nowrap">
              <Coins className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>Tổng quỹ thưởng cả phòng (VNĐ):</span>
            </div>

            <div className="flex items-center gap-1.5">
              <input
                type="text"
                disabled={!canManageBonus || isSavingFund}
                placeholder="Chưa nhập quỹ"
                value={fundInput}
                onChange={handleFundInputChange}
                onKeyDown={e => {
                  if (e.key === 'Enter') {
                    handleRequestSaveFund();
                  }
                }}
                className={`w-36 px-2.5 py-1 text-right font-mono-numbers font-bold text-xs rounded border transition-colors ${
                  !canManageBonus
                    ? 'bg-slate-100 text-slate-600 border-slate-200 cursor-not-allowed'
                    : 'bg-white text-emerald-950 border-emerald-300 focus:outline-hidden focus:border-emerald-600 focus:ring-1 focus:ring-emerald-500 shadow-2xs'
                }`}
                title={!canManageBonus ? (isMonthLocked ? 'Tháng cũ chỉ đọc' : 'Chỉ Quản trị viên và người quản lý thưởng mới có quyền sửa') : 'Nhập số tiền quỹ thưởng của toàn phòng trong tháng'}
              />

              {canManageBonus && (
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={() => handleRequestSaveFund()}
                    disabled={isSavingFund}
                    className="px-2.5 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-medium text-xs flex items-center gap-1 shadow-2xs cursor-pointer transition-colors disabled:opacity-50"
                    title="Lưu quỹ thưởng toàn phòng cho tháng hiện tại"
                  >
                    <Save className="w-3 h-3" />
                    <span>Lưu quỹ</span>
                  </button>

                  {isPoolConfigured && (
                    <button
                      type="button"
                      onClick={handleClearFund}
                      disabled={isSavingFund}
                      className="p-1 hover:bg-emerald-100 text-slate-500 hover:text-rose-600 rounded cursor-pointer transition-colors"
                      title="Đặt lại về trạng thái Chưa nhập quỹ"
                    >
                      <RotateCcw className="w-3 h-3" />
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>

          {/* Right: Group Filter, Search ONB & Export */}
          <div className="flex items-center gap-2 flex-wrap">
            {/* Group Filter */}
            <select
              value={selectedGroup}
              onChange={e => setSelectedGroup(e.target.value)}
              className="border border-slate-200 rounded-md px-2.5 py-1.5 bg-white text-slate-700 font-medium text-xs focus:outline-hidden"
            >
              <option value="">Toàn phòng (Tất cả nhóm)</option>
              {availableGroups.map(g => (
                <option key={g} value={g}>{g}</option>
              ))}
            </select>

            {/* Search ONB */}
            <div className="relative min-w-[170px]">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
              <input
                type="text"
                placeholder="Tìm tên hoặc mã ONB..."
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md focus:outline-hidden focus:border-slate-400 text-xs"
              />
            </div>

            {/* Export CSV / Excel */}
            <button
              onClick={handleExportCSV}
              className="px-3 py-1.5 font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
              title="Xuất bảng Excel (CSV)"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Xuất Excel</span>
            </button>

            <span className="text-slate-400 text-xs pl-1">
              ONB: <strong className="text-slate-700">{displayRows.length}</strong>
            </span>
          </div>
        </div>

        {/* Notification Banner when Saving Fund */}
        {fundSaveMessage && (
          <div
            className={`p-2.5 rounded-md text-xs flex items-center justify-between transition-all ${
              fundSaveMessage.type === 'success'
                ? 'bg-emerald-50 text-emerald-800 border border-emerald-200'
                : 'bg-rose-50 text-rose-800 border border-rose-200'
            }`}
          >
            <div className="flex items-center gap-2">
              {fundSaveMessage.type === 'success' ? (
                <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              ) : (
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
              )}
              <span>{fundSaveMessage.text}</span>
            </div>
            <button
              onClick={() => setFundSaveMessage(null)}
              className="text-slate-400 hover:text-slate-600 font-bold px-1"
            >
              ✕
            </button>
          </div>
        )}
      </div>

      {/* 2. Standardized Summary Table: 1 row per ONB, Exact 9 Columns + TỔNG CỘNG row */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto max-h-[75vh]">
          <table className="w-full text-left border-collapse text-xs">
            {/* Header: Bright, clean modern style with #F1F5F9 background and #475569 text */}
            <thead className="sticky top-0 z-20 bg-[#F1F5F9] text-[#475569] shadow-xs">
              <tr className="border-b border-[#E2E8F0] text-[11px] font-semibold">
                {/* 1. ONB (Sticky Left) */}
                <th className="py-2.5 px-3 bg-[#F1F5F9] sticky left-0 z-30 min-w-[150px] whitespace-normal text-left text-[#475569]">
                  ONB
                </th>

                {/* 2. Nhóm */}
                <th className="py-2.5 px-2.5 bg-[#F1F5F9] min-w-[100px] whitespace-normal text-left text-[#475569]">
                  Nhóm
                </th>

                {/* 3. Điểm DEMO/POC/Tiền về (55%) */}
                <th className="py-2.5 px-3 bg-[#F1F5F9] text-right min-w-[115px] whitespace-normal text-[#475569]" title="Trọng số 55% - Nhóm Loại công việc chứa POC, Tiền, Cơ hội, Demo">
                  Điểm DEMO/POC/Tiền về<br />(55%)
                </th>

                {/* 4. Điểm tiếp nhận (40%) */}
                <th className="py-2.5 px-3 bg-[#F1F5F9] text-right min-w-[105px] whitespace-normal text-[#475569]" title="Trọng số 40% - Tổng điểm tiếp nhận các gói trong tháng">
                  Điểm tiếp nhận<br />(40%)
                </th>

                {/* 5. Điểm đào tạo (5%) */}
                <th className="py-2.5 px-3 bg-[#F1F5F9] text-right min-w-[105px] whitespace-normal text-[#475569]" title="Trọng số 5% - Toàn bộ các dòng tiến độ hợp lệ còn lại">
                  Điểm đào tạo<br />(5%)
                </th>

                {/* 6. Tổng điểm thực hiện trong tháng */}
                <th className="py-2.5 px-3 bg-[#F1F5F9] text-right min-w-[115px] whitespace-normal font-bold text-[#0F172A]" title="T = A + B + C">
                  Tổng điểm thực hiện<br />trong tháng
                </th>

                {/* 7. Tổng điểm đã nhân trọng số */}
                <th className="py-2.5 px-3 bg-[#F1F5F9] text-right min-w-[115px] whitespace-normal font-bold text-[#92400E]" title="W = A*55% + B*40% + C*5%">
                  Tổng điểm đã nhân<br />trọng số
                </th>

                {/* 8. Tỷ trọng trong phòng (%) */}
                <th className="py-2.5 px-3 bg-[#F1F5F9] text-right min-w-[105px] whitespace-normal font-bold text-[#4F46E5]" title="Tỷ trọng = (W / W_toàn_phòng) * 100%">
                  Tỷ trọng trong<br />phòng (%)
                </th>

                {/* 9. Khoản thưởng */}
                <th className="py-2.5 px-3 bg-[#F1F5F9] text-right min-w-[130px] whitespace-normal font-bold text-[#047857]" title="Khoản thưởng tự động: Tỷ trọng toàn phòng × Tổng quỹ thưởng">
                  Khoản thưởng
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-[#E2E8F0]">
              {displayRows.map(row => {
                return (
                  <tr
                    key={row.onbCode}
                    className="hover:bg-[#F8FAFC] transition-colors group"
                  >
                    {/* 1. ONB (Sticky Left) */}
                    <td
                      onClick={() => onOpenDrilldown(row.onbCode, 'ALL')}
                      className="py-2.5 px-3 bg-white group-hover:bg-[#F8FAFC] sticky left-0 z-10 cursor-pointer border-b border-[#E2E8F0]"
                    >
                      <div className="flex flex-col">
                        <span className="font-semibold text-[#0F172A] group-hover:text-[#4F46E5] transition-colors">
                          {row.fullName}
                        </span>
                        <span className="text-[10px] font-mono font-medium text-[#64748B]">
                          {row.onbCode}
                        </span>
                      </div>
                    </td>

                    {/* 2. Nhóm */}
                    <td className="py-2.5 px-2.5 text-[#334155] text-left border-b border-[#E2E8F0]">
                      {selectedGroup ? selectedGroup : (row.displayGroups || row.currentGroup)}
                    </td>

                    {/* 3. Điểm DEMO/POC/Tiền về (55%) */}
                    <td
                      onClick={() => onOpenDrilldown(row.onbCode, 'DEMO_POC')}
                      className="py-2.5 px-3 text-right font-mono-numbers font-medium text-[#334155] hover:text-[#4F46E5] hover:bg-[#EEF2FF] cursor-pointer transition-colors border-b border-[#E2E8F0]"
                      title="Bấm để xem chi tiết các dòng DEMO/POC/Tiền về cấu thành"
                    >
                      {row.dispA > 0 ? fmtScore(row.dispA) : '0'}
                    </td>

                    {/* 4. Điểm tiếp nhận (40%) */}
                    <td
                      onClick={() => onOpenDrilldown(row.onbCode, 'PACKAGES')}
                      className="py-2.5 px-3 text-right font-mono-numbers font-medium text-[#334155] hover:text-[#4F46E5] hover:bg-[#EEF2FF] cursor-pointer transition-colors border-b border-[#E2E8F0]"
                      title="Bấm để xem chi tiết các gói tiếp nhận cấu thành"
                    >
                      {row.dispB > 0 ? fmtScore(row.dispB) : '0'}
                    </td>

                    {/* 5. Điểm đào tạo (5%) */}
                    <td
                      onClick={() => onOpenDrilldown(row.onbCode, 'TRAINING')}
                      className="py-2.5 px-3 text-right font-mono-numbers font-medium text-[#334155] hover:text-[#4F46E5] hover:bg-[#EEF2FF] cursor-pointer transition-colors border-b border-[#E2E8F0]"
                      title="Bấm để xem chi tiết các công việc đào tạo & khác cấu thành"
                    >
                      <div className="flex items-center justify-end gap-1">
                        <span>{row.dispC > 0 ? fmtScore(row.dispC) : '0'}</span>
                        {row.warningTasksCount ? (
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-500" title="Có dòng công việc cần đối soát loại việc" />
                        ) : null}
                      </div>
                    </td>

                    {/* 6. Tổng điểm thực hiện trong tháng */}
                    <td
                      onClick={() => onOpenDrilldown(row.onbCode, 'ALL')}
                      className="py-2.5 px-3 text-right font-mono-numbers font-semibold text-[#0F172A] hover:text-[#4F46E5] hover:bg-[#EEF2FF] cursor-pointer transition-colors border-b border-[#E2E8F0]"
                      title="T = A + B + C (Bấm để xem đối chiếu đầy đủ)"
                    >
                      {fmtScore(row.dispT)}
                    </td>

                    {/* 7. Tổng điểm đã nhân trọng số */}
                    <td
                      onClick={() => onOpenDrilldown(row.onbCode, 'ALL')}
                      className="py-2.5 px-3 text-right font-mono-numbers font-bold text-[#92400E] bg-[#FFFBEB]/50 hover:bg-[#FFFBEB] cursor-pointer transition-colors border-b border-[#E2E8F0]"
                      title="W = A*55% + B*40% + C*5%"
                    >
                      {fmtScore(row.dispW)}
                    </td>

                    {/* 8. Tỷ trọng trong phòng (%) */}
                    <td
                      className="py-2.5 px-3 text-right font-mono-numbers font-bold text-[#4F46E5] bg-[#EEF2FF]/40 border-b border-[#E2E8F0]"
                      title="Tỷ trọng = (W / Tổng W toàn phòng) * 100%"
                    >
                      {row.dispRatio.toFixed(2)}%
                    </td>

                    {/* 9. Khoản thưởng - Tự tính, chỉ đọc, KHÔNG sửa tại từng dòng (Yêu cầu 1.2 & 1.3) */}
                    <td className="py-2 px-3 text-right font-mono-numbers">
                      {(() => {
                        const official = getRowOfficialBonus(row, isPoolConfigured, departmentTotalW);
                        if (official.isUnconfigured) {
                          return <span className="text-slate-400 italic">Chưa nhập quỹ</span>;
                        }
                        if (official.isZero) {
                          return (
                            <span
                              className="font-semibold text-slate-500"
                              title={departmentTotalW === 0 ? "Chưa có điểm để phân bổ quỹ thưởng" : "0 đ"}
                            >
                              0 đ
                            </span>
                          );
                        }
                        return (
                          <span className="font-bold text-emerald-800">
                            {official.label}
                          </span>
                        );
                      })()}
                    </td>
                  </tr>
                );
              })}

              {displayRows.length === 0 && (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400 italic">
                    Không có nhân sự nào phù hợp với bộ lọc hiện tại.
                  </td>
                </tr>
              )}
            </tbody>

            {/* 2. DÒNG TỔNG CỘNG CUỐI BẢNG - Bắt buộc theo Yêu cầu 2 */}
            <tfoot>
              <tr className="bg-[#F1F5F9] font-bold border-t-2 border-[#CBD5E1] text-[#0F172A] sticky bottom-0 z-20 shadow-xs">
                {/* 1. ONB (Sticky Left) */}
                <td className="py-2.5 px-3 bg-[#F1F5F9] sticky left-0 z-30 text-left font-bold text-[#0F172A] whitespace-nowrap">
                  TỔNG CỘNG: {displayRows.length} nhân sự
                </td>

                {/* 2. Nhóm */}
                <td className="py-2.5 px-2.5 text-left text-[#64748B] font-semibold">
                  {selectedGroup ? selectedGroup : 'Toàn phòng'}
                </td>

                {/* 3. Điểm DEMO/POC/Tiền về (55%) */}
                <td className="py-2.5 px-3 text-right font-mono-numbers text-[#0F172A]">
                  {fmtScore(totals.sumA)}
                </td>

                {/* 4. Điểm tiếp nhận (40%) */}
                <td className="py-2.5 px-3 text-right font-mono-numbers text-[#0F172A]">
                  {fmtScore(totals.sumB)}
                </td>

                {/* 5. Điểm đào tạo (5%) */}
                <td className="py-2.5 px-3 text-right font-mono-numbers text-[#0F172A]">
                  {fmtScore(totals.sumC)}
                </td>

                {/* 6. Tổng điểm thực hiện trong tháng */}
                <td className="py-2.5 px-3 text-right font-mono-numbers text-[#0F172A]">
                  {fmtScore(totals.sumT)}
                </td>

                {/* 7. Tổng điểm đã nhân trọng số */}
                <td className="py-2.5 px-3 text-right font-mono-numbers text-[#92400E] bg-[#FFFBEB]/80">
                  {fmtScore(totals.sumW)}
                </td>

                {/* 8. Tỷ trọng trong phòng (%) */}
                <td className="py-2.5 px-3 text-right font-mono-numbers text-[#4F46E5] bg-[#EEF2FF]/80">
                  {totals.sumRatio.toFixed(2)}%
                </td>

                {/* 9. Khoản thưởng */}
                <td className="py-2.5 px-3 text-right font-mono-numbers">
                  {!isPoolConfigured && displayRows.some(r => r.bonusMode === 'MANUAL') ? (
                    <span className="text-emerald-900 font-bold">{totals.sumBonus.toLocaleString('vi-VN')} đ</span>
                  ) : !isPoolConfigured ? (
                    <span className="text-slate-500 italic font-normal">Chưa nhập quỹ</span>
                  ) : poolAmount === 0 ? (
                    <span>0 đ</span>
                  ) : departmentTotalW === 0 ? (
                    <span className="text-amber-700 font-medium text-[11px]" title="Chưa có điểm để phân bổ quỹ thưởng">
                      Chưa có điểm để phân bổ
                    </span>
                  ) : (
                    <div className="flex flex-col items-end">
                      <span className="text-emerald-900 font-bold text-xs">
                        {totals.sumBonus.toLocaleString('vi-VN')} đ
                      </span>
                      {/* Hiển thị đối soát chênh lệch làm tròn nếu xem toàn phòng - Yêu cầu 1.4 */}
                      {!selectedGroup && !searchTerm && poolAmount !== null && (
                        <span
                          className={`text-[10px] font-medium ${
                            totals.roundingDiff === 0
                              ? 'text-slate-500'
                              : 'text-amber-700 font-semibold'
                          }`}
                          title="Chênh lệch giữa tổng thưởng đã làm tròn đến đồng của từng người so với Quỹ thưởng phòng"
                        >
                          Chênh lệch làm tròn: {totals.roundingDiff > 0 ? `+${totals.roundingDiff}` : totals.roundingDiff} đ
                        </span>
                      )}
                    </div>
                  )}
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      </div>

      {/* Footer Notes */}
      <div className="text-[11px] text-slate-400 flex flex-wrap items-center justify-between gap-2 px-1">
        <span>
          * Bấm vào ô điểm thành phần (55% / 40% / 5%) hoặc hàng ONB để mở danh sách chi tiết các bản ghi cấu thành.
        </span>
        <div className="flex items-center gap-4">
          <span>
            Tổng trọng số toàn phòng kỳ này: <strong className="text-slate-600">{fmtScore(departmentTotalW)} đ</strong>
          </span>
          {isPoolConfigured && poolAmount !== null && (
            <span>
              Quỹ thưởng phòng: <strong className="text-emerald-700">{poolAmount.toLocaleString('vi-VN')} đ</strong>
            </span>
          )}
        </div>
      </div>

      {/* Preview & Confirmation Modal Before Saving Department Bonus Fund (Yêu cầu 1.4) */}
      {showConfirmModal && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4 text-xs">
            <div className="flex items-center gap-2 text-slate-900 font-bold text-sm border-b border-slate-200 pb-3">
              <Coins className="w-5 h-5 text-emerald-600" />
              <span>Xác nhận Tổng quỹ thưởng cả phòng</span>
            </div>

            <div className="space-y-2.5 text-slate-700">
              <p>
                Bạn đang chuẩn bị cập nhật Tổng quỹ thưởng cho phòng ONB trong kỳ <strong>Tháng {monthYear}</strong>:
              </p>

              <div className="bg-slate-50 border border-slate-200 rounded p-3 space-y-2 text-xs">
                <div className="flex justify-between">
                  <span className="text-slate-500">Kỳ áp dụng:</span>
                  <span className="font-semibold text-slate-800">Tháng {monthYear}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tổng quỹ thưởng:</span>
                  <span className="font-bold text-emerald-700">
                    {fundInput.trim() === ''
                      ? 'Đặt lại: Chưa nhập quỹ'
                      : `${parseInt(fundInput.replace(/[^\d]/g, ''), 10).toLocaleString('vi-VN')} VNĐ`}
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tổng điểm W toàn phòng:</span>
                  <span className="font-semibold text-slate-800">{fmtScore(departmentTotalW)} điểm</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Số nhân sự nhận thưởng:</span>
                  <span className="font-semibold text-slate-800">
                    {rows.filter(r => r.weightedScore > 0).length} / {rows.length} nhân sự
                  </span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Phương thức tính:</span>
                  <span className="font-semibold text-blue-700">
                    Tỷ trọng điểm (55% / 40% / 5%)
                  </span>
                </div>
              </div>

              <div className="flex items-start gap-2 text-[11px] text-slate-500 bg-blue-50/60 p-2.5 rounded border border-blue-100">
                <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
                <span>
                  Khoản thưởng của từng nhân sự sẽ tự động tính = <strong>Tỷ trọng trong phòng × Tổng quỹ thưởng</strong>. Kết quả được làm tròn đến đồng. Lịch sử thay đổi sẽ tự động ghi vào Nhật ký hệ thống.
                </span>
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 border-t border-slate-200 pt-3">
              <button
                type="button"
                onClick={() => setShowConfirmModal(false)}
                className="px-3.5 py-1.5 rounded border border-slate-300 text-slate-700 hover:bg-slate-50 font-medium cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleConfirmSaveFund}
                className="px-4 py-1.5 rounded bg-emerald-700 hover:bg-emerald-800 text-white font-medium shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Xác nhận & Lưu quỹ</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
