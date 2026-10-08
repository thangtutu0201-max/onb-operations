import React, { useState, useEffect, useCallback } from 'react';
import {
  DateRangeSubsystem,
  DateRangeDeletePreviewResult,
  DateRangeDeleteExecuteResult,
  CurrentUserSession
} from '../types';
import { api } from '../services/api';
import {
  Calendar,
  Trash2,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  X,
  Layers,
  Clock,
  ShieldAlert,
  Info,
  RotateCcw,
  RefreshCw,
  Check,
  FileSpreadsheet,
  Briefcase,
  Users
} from 'lucide-react';

interface DateRangeDeleteModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMonth: string;
  session: CurrentUserSession | null;
  onSuccessRefresh: () => Promise<void>;
}

export const DateRangeDeleteModal: React.FC<DateRangeDeleteModalProps> = ({
  isOpen,
  onClose,
  selectedMonth,
  session,
  onSuccessRefresh
}) => {
  const isMasterAdmin = Boolean(session?.isMasterAdmin || session?.role === 'admin');

  // Date range states (default to current selectedMonth start & end)
  const [fromDate, setFromDate] = useState<string>(() => {
    return `${selectedMonth}-01`;
  });
  const [toDate, setToDate] = useState<string>(() => {
    const parts = selectedMonth.split('-');
    const year = parseInt(parts[0], 10) || 2026;
    const month = parseInt(parts[1], 10) || 10;
    const lastDay = new Date(year, month, 0).getDate();
    return `${selectedMonth}-${String(lastDay).padStart(2, '0')}`;
  });

  // Selected Subsystems (Default all 3 selected)
  const [subsystems, setSubsystems] = useState<DateRangeSubsystem[]>([
    'schedules',
    'packages',
    'progress'
  ]);

  // Preview & execution states
  const [isPreviewLoading, setIsPreviewLoading] = useState<boolean>(false);
  const [preview, setPreview] = useState<DateRangeDeletePreviewResult | null>(null);
  const [previewError, setPreviewError] = useState<string>('');

  const [isExecuting, setIsExecuting] = useState<boolean>(false);
  const [executeError, setExecuteError] = useState<string>('');
  const [executeResult, setExecuteResult] = useState<DateRangeDeleteExecuteResult | null>(null);

  // Sync date range whenever modal opens or selectedMonth changes
  useEffect(() => {
    if (isOpen) {
      const parts = selectedMonth.split('-');
      const year = parseInt(parts[0], 10) || 2026;
      const month = parseInt(parts[1], 10) || 10;
      const lastDay = new Date(year, month, 0).getDate();

      setFromDate(`${selectedMonth}-01`);
      setToDate(`${selectedMonth}-${String(lastDay).padStart(2, '0')}`);
      setSubsystems(['schedules', 'packages', 'progress']);
      setPreview(null);
      setPreviewError('');
      setExecuteError('');
      setExecuteResult(null);
    }
  }, [isOpen, selectedMonth]);

  // Handle ESC key to close
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && !isExecuting) {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, isExecuting, onClose]);

  // Fetch preview when parameters change
  const fetchPreview = useCallback(async (
    from: string,
    to: string,
    subs: DateRangeSubsystem[]
  ) => {
    if (!isOpen || !isMasterAdmin) return;
    if (!from || !to || from > to || subs.length === 0) {
      setPreview(null);
      return;
    }

    setIsPreviewLoading(true);
    setPreviewError('');
    try {
      const res = await api.previewDateRangeDelete({
        fromDate: from,
        toDate: to,
        subsystems: subs
      });
      setPreview(res);
    } catch (err: any) {
      console.error('Lỗi khi kiểm tra dữ liệu xóa:', err);
      setPreviewError(err.message || 'Không thể tải thông tin kiểm tra số lượng bản ghi.');
      setPreview(null);
    } finally {
      setIsPreviewLoading(false);
    }
  }, [isOpen, isMasterAdmin]);

  // Debounced auto-refresh preview
  useEffect(() => {
    if (!isOpen || executeResult) return;
    const timer = setTimeout(() => {
      fetchPreview(fromDate, toDate, subsystems);
    }, 250);
    return () => clearTimeout(timer);
  }, [isOpen, fromDate, toDate, subsystems, executeResult, fetchPreview]);

  if (!isOpen) return null;

  // Toggle subsystem selection
  const handleToggleSubsystem = (sub: DateRangeSubsystem) => {
    setExecuteError('');
    setSubsystems(prev => {
      if (prev.includes(sub)) {
        return prev.filter(s => s !== sub);
      } else {
        return [...prev, sub];
      }
    });
  };

  const handleSelectAllSubsystems = () => {
    setExecuteError('');
    if (subsystems.length === 3) {
      setSubsystems([]);
    } else {
      setSubsystems(['schedules', 'packages', 'progress']);
    }
  };

  // Quick date presets
  const applyPreset = (type: 'this_month' | 'last_month' | 'last_7_days' | 'last_30_days') => {
    const today = new Date();
    const pad = (n: number) => String(n).padStart(2, '0');
    const formatYMD = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

    if (type === 'this_month') {
      const parts = selectedMonth.split('-');
      const year = parseInt(parts[0], 10) || today.getFullYear();
      const month = parseInt(parts[1], 10) || today.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      setFromDate(`${year}-${pad(month)}-01`);
      setToDate(`${year}-${pad(month)}-${pad(lastDay)}`);
    } else if (type === 'last_month') {
      const prevDate = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const year = prevDate.getFullYear();
      const month = prevDate.getMonth() + 1;
      const lastDay = new Date(year, month, 0).getDate();
      setFromDate(`${year}-${pad(month)}-01`);
      setToDate(`${year}-${pad(month)}-${pad(lastDay)}`);
    } else if (type === 'last_7_days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 6);
      setFromDate(formatYMD(past));
      setToDate(formatYMD(today));
    } else if (type === 'last_30_days') {
      const past = new Date(today);
      past.setDate(past.getDate() - 29);
      setFromDate(formatYMD(past));
      setToDate(formatYMD(today));
    }
  };

  // Execution: Single-step, direct, no OTP or Gmail
  const handleExecuteDelete = async () => {
    if (!isMasterAdmin) {
      setExecuteError('Bạn không có quyền quản trị viên để thực hiện thao tác này.');
      return;
    }

    if (!fromDate || !toDate) {
      setExecuteError('Vui lòng chọn ngày bắt đầu và ngày kết thúc.');
      return;
    }

    if (fromDate > toDate) {
      setExecuteError('Ngày bắt đầu không được lớn hơn ngày kết thúc.');
      return;
    }

    if (subsystems.length === 0) {
      setExecuteError('Vui lòng chọn ít nhất một phân hệ để xóa.');
      return;
    }

    setIsExecuting(true);
    setExecuteError('');
    try {
      const result = await api.executeDateRangeDelete({
        fromDate,
        toDate,
        subsystems
      });

      setExecuteResult(result);
      // Trigger background synchronization and data reload
      await onSuccessRefresh();
    } catch (err: any) {
      console.error('Lỗi khi xóa dữ liệu theo khoảng thời gian:', err);
      setExecuteError(err.message || 'Lỗi hệ thống khi xóa dữ liệu. Vui lòng thử lại.');
    } finally {
      setIsExecuting(false);
    }
  };

  // Format date display (DD/MM/YYYY)
  const formatDateDisplay = (ymd: string) => {
    if (!ymd || !ymd.includes('-')) return ymd;
    const [y, m, d] = ymd.split('-');
    return `${d}/${m}/${y}`;
  };

  return (
    <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto animate-in fade-in duration-200">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden my-6 flex flex-col max-h-[92vh]">
        {/* Modal Header */}
        <div className="px-6 py-4 bg-white text-slate-900 flex items-center justify-between border-b border-slate-200 shrink-0">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-xl bg-rose-50 text-rose-600 border border-rose-200">
              <Trash2 className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h2 className="text-base font-bold text-slate-900 tracking-tight">
                  Xóa Dữ Liệu Theo Khoảng Thời Gian
                </h2>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-lg bg-rose-50 text-rose-700 border border-rose-200">
                  Admin Only
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Dọn dẹp Lịch công việc, Tiếp nhận gói đào tạo, Tiến độ thực hiện theo ngày phát sinh thực tế
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExecuting}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
            title="Đóng hộp thoại"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-6 flex-1 text-slate-800">
          {!isMasterAdmin ? (
            <div className="p-6 text-center space-y-3">
              <ShieldAlert className="w-12 h-12 text-rose-500 mx-auto" />
              <h3 className="text-base font-bold text-slate-900">Không có quyền truy cập</h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Chức năng này chỉ dành riêng cho Quản trị viên (Admin). Bạn không có quyền xóa dữ liệu theo khoảng thời gian.
              </p>
              <button
                onClick={onClose}
                className="px-4 py-2 bg-slate-200 text-slate-700 text-xs font-semibold rounded-lg hover:bg-slate-300"
              >
                Đóng
              </button>
            </div>
          ) : executeResult ? (
            /* SUCCESS STATE VIEW */
            <div className="space-y-5 animate-in fade-in duration-300">
              <div className="p-5 bg-emerald-50 border border-emerald-200 rounded-xl flex items-start gap-3.5">
                <CheckCircle2 className="w-6 h-6 text-emerald-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h3 className="text-sm font-bold text-emerald-950">
                    Xóa Dữ Liệu Hoàn Tất Thành Công!
                  </h3>
                  <p className="text-xs text-emerald-800 leading-relaxed">
                    Hệ thống đã xóa thực sự toàn bộ dữ liệu trong khoảng thời gian đã chọn và cập nhật lại điểm KPI, bảng tổng hợp.
                  </p>
                </div>
              </div>

              {/* Statistics of Deleted Items */}
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3">
                <div className="text-xs font-bold text-slate-700 uppercase tracking-wider flex items-center justify-between">
                  <span>Chi tiết số lượng đã xóa thực tế</span>
                  <span className="text-[11px] font-semibold text-slate-500 lowercase">
                    {formatDateDisplay(executeResult.fromDate)} → {formatDateDisplay(executeResult.toDate)}
                  </span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="bg-white p-3 rounded-lg border border-slate-200 text-center">
                    <span className="block text-[11px] text-slate-500 font-medium">Lịch công việc</span>
                    <span className="text-lg font-bold text-rose-600">
                      {executeResult.deletedCounts.schedules}
                    </span>
                    <span className="block text-[10px] text-slate-400">bản ghi</span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200 text-center">
                    <span className="block text-[11px] text-slate-500 font-medium">Tiếp nhận gói đào tạo</span>
                    <span className="text-lg font-bold text-rose-600">
                      {executeResult.deletedCounts.packages}
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      gói ({executeResult.deletedCounts.packageDetails} module)
                    </span>
                  </div>
                  <div className="bg-white p-3 rounded-lg border border-slate-200 text-center">
                    <span className="block text-[11px] text-slate-500 font-medium">Tiến độ thực hiện</span>
                    <span className="text-lg font-bold text-rose-600">
                      {executeResult.deletedCounts.progress}
                    </span>
                    <span className="block text-[10px] text-slate-400">
                      nhiệm vụ ({executeResult.deletedCounts.progressSplits} chia điểm)
                    </span>
                  </div>
                </div>

                {executeResult.linkedAdjustments && (
                  <div className="mt-2 pt-2 border-t border-slate-200 text-[11px] text-slate-600 space-y-1">
                    <div className="font-semibold text-slate-700">Dữ liệu liên kết đã được điều chỉnh đồng bộ:</div>
                    {executeResult.linkedAdjustments.trainingReset > 0 && (
                      <div className="flex items-center gap-1.5 text-emerald-700">
                        <Check className="w-3.5 h-3.5" />
                        Đã chuyển {executeResult.linkedAdjustments.trainingReset} lớp Đào tạo tập trung về trạng thái &quot;Chưa phân bổ&quot; (tránh mồ côi).
                      </div>
                    )}
                    {executeResult.linkedAdjustments.progressUnlinked > 0 && (
                      <div className="flex items-center gap-1.5 text-emerald-700">
                        <Check className="w-3.5 h-3.5" />
                        Đã gỡ liên kết lịch ở {executeResult.linkedAdjustments.progressUnlinked} công việc Tiến độ còn lại.
                      </div>
                    )}
                    {executeResult.linkedAdjustments.schedulesUnlinked > 0 && (
                      <div className="flex items-center gap-1.5 text-emerald-700">
                        <Check className="w-3.5 h-3.5" />
                        Đã gỡ liên kết tiến độ ở {executeResult.linkedAdjustments.schedulesUnlinked} lịch còn lại.
                      </div>
                    )}
                    <div className="flex items-center gap-1.5 text-slate-500">
                      <Check className="w-3.5 h-3.5 text-emerald-600" />
                      Đã ghi nhận sự kiện vào Nhật ký hoạt động (Audit Trail).
                    </div>
                  </div>
                )}
              </div>
            </div>
          ) : (
            /* CONFIGURATION & CONFIRMATION VIEW */
            <>
              {/* Section 1: Choose Time Range */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-blue-600" />
                    <span>1. Chọn Khoảng Thời Gian</span>
                  </label>
                  <div className="flex items-center gap-1 text-[11px]">
                    <span className="text-slate-400 mr-1">Chọn nhanh:</span>
                    <button
                      type="button"
                      onClick={() => applyPreset('this_month')}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer"
                    >
                      Tháng này
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('last_7_days')}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer"
                    >
                      7 ngày qua
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('last_30_days')}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer"
                    >
                      30 ngày qua
                    </button>
                    <button
                      type="button"
                      onClick={() => applyPreset('last_month')}
                      className="px-2 py-0.5 rounded bg-slate-100 hover:bg-slate-200 text-slate-700 font-medium transition-colors cursor-pointer"
                    >
                      Tháng trước
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Từ ngày (Bắt đầu):
                    </label>
                    <input
                      type="date"
                      value={fromDate}
                      onChange={e => setFromDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-2xs text-slate-900"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Đến ngày (Kết thúc):
                    </label>
                    <input
                      type="date"
                      value={toDate}
                      onChange={e => setToDate(e.target.value)}
                      className="w-full px-3 py-2 text-xs font-medium bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-blue-500 shadow-2xs text-slate-900"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-slate-500 flex items-center gap-1.5 pl-1">
                  <Info className="w-3.5 h-3.5 text-blue-500 shrink-0" />
                  <span>
                    Tính cả ngày bắt đầu và kết thúc ({formatDateDisplay(fromDate)} → {formatDateDisplay(toDate)}). Áp dụng theo ngày diễn ra/tiếp nhận nghiệp vụ.
                  </span>
                </p>
              </div>

              {/* Section 2: Choose Subsystems */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Layers className="w-4 h-4 text-blue-600" />
                    <span>2. Phạm Vi Phân Hệ Cần Xóa</span>
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAllSubsystems}
                    className="text-xs text-blue-600 hover:text-blue-800 font-semibold cursor-pointer"
                  >
                    {subsystems.length === 3 ? 'Bỏ chọn tất cả' : 'Chọn tất cả 3 phân hệ'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Subsystem 1: Lịch công việc */}
                  <div
                    onClick={() => handleToggleSubsystem('schedules')}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between ${
                      subsystems.includes('schedules')
                        ? 'bg-rose-50/70 border-rose-300 text-rose-950 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 shadow-2xs">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <input
                        type="checkbox"
                        checked={subsystems.includes('schedules')}
                        onChange={() => {}}
                        className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer w-4 h-4"
                      />
                    </div>
                    <div className="mt-3">
                      <span className="block text-xs font-bold text-slate-900">Lịch công việc</span>
                      <span className="text-[10px] text-slate-500 leading-tight block mt-0.5">
                        Lịch cá nhân, phối hợp, phân công của toàn bộ nhân sự & nhóm
                      </span>
                    </div>
                  </div>

                  {/* Subsystem 2: Tiếp nhận gói đào tạo */}
                  <div
                    onClick={() => handleToggleSubsystem('packages')}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between ${
                      subsystems.includes('packages')
                        ? 'bg-rose-50/70 border-rose-300 text-rose-950 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 shadow-2xs">
                        <Briefcase className="w-4 h-4" />
                      </div>
                      <input
                        type="checkbox"
                        checked={subsystems.includes('packages')}
                        onChange={() => {}}
                        className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer w-4 h-4"
                      />
                    </div>
                    <div className="mt-3">
                      <span className="block text-xs font-bold text-slate-900">Tiếp nhận gói đào tạo</span>
                      <span className="text-[10px] text-slate-500 leading-tight block mt-0.5">
                        Gói tiếp nhận & phân bổ module theo ngày tiếp nhận
                      </span>
                    </div>
                  </div>

                  {/* Subsystem 3: Tiến độ thực hiện */}
                  <div
                    onClick={() => handleToggleSubsystem('progress')}
                    className={`p-3.5 rounded-xl border transition-all cursor-pointer select-none flex flex-col justify-between ${
                      subsystems.includes('progress')
                        ? 'bg-rose-50/70 border-rose-300 text-rose-950 shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-600 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between">
                      <div className="p-1.5 rounded-lg bg-white border border-slate-200 text-slate-700 shadow-2xs">
                        <FileSpreadsheet className="w-4 h-4" />
                      </div>
                      <input
                        type="checkbox"
                        checked={subsystems.includes('progress')}
                        onChange={() => {}}
                        className="rounded text-rose-600 focus:ring-rose-500 cursor-pointer w-4 h-4"
                      />
                    </div>
                    <div className="mt-3">
                      <span className="block text-xs font-bold text-slate-900">Tiến độ thực hiện</span>
                      <span className="text-[10px] text-slate-500 leading-tight block mt-0.5">
                        Công việc ghi nhận, khối lượng, thành tiền & chia điểm KPI
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Section 3: Pre-check & Count Summary */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Clock className="w-4 h-4 text-blue-600" />
                    <span>3. Số Lượng Bản Ghi Dự Kiến Bị Xóa</span>
                  </label>
                  {isPreviewLoading && (
                    <span className="text-[11px] text-blue-600 flex items-center gap-1 font-medium">
                      <RefreshCw className="w-3 h-3 animate-spin" />
                      Đang kiểm tra...
                    </span>
                  )}
                </div>

                {previewError && (
                  <div className="p-3 bg-rose-50 border border-rose-200 text-rose-800 rounded-lg text-xs flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
                    <span>{previewError}</span>
                  </div>
                )}

                {preview && (
                  <div className="bg-slate-50 border border-slate-200 rounded-xl p-4 space-y-3.5">
                    {/* Record counts */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-center">
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="block text-[10px] text-slate-500 font-medium">Lịch công việc</span>
                        <span className="text-base font-bold text-slate-900">
                          {preview.counts.schedules}
                        </span>
                        <span className="block text-[10px] text-slate-400">dòng</span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="block text-[10px] text-slate-500 font-medium">Gói tiếp nhận</span>
                        <span className="text-base font-bold text-slate-900">
                          {preview.counts.packages}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          gói ({preview.counts.packageDetails} module)
                        </span>
                      </div>
                      <div className="bg-white p-2.5 rounded-lg border border-slate-200">
                        <span className="block text-[10px] text-slate-500 font-medium">Tiến độ thực hiện</span>
                        <span className="text-base font-bold text-slate-900">
                          {preview.counts.progress}
                        </span>
                        <span className="block text-[10px] text-slate-400">
                          việc ({preview.counts.progressSplits} điểm)
                        </span>
                      </div>
                      <div className="bg-rose-50 p-2.5 rounded-lg border border-rose-200">
                        <span className="block text-[10px] text-rose-700 font-bold uppercase">Tổng cộng xóa</span>
                        <span className="text-base font-black text-rose-600">
                          {preview.counts.total}
                        </span>
                        <span className="block text-[10px] text-rose-600">bản ghi</span>
                      </div>
                    </div>

                    {/* Preservation & Unlinking Safeguards */}
                    <div className="space-y-1.5 pt-1 text-[11px] text-slate-600 border-t border-slate-200">
                      <div className="font-semibold text-slate-700 flex items-center gap-1.5">
                        <Info className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                        <span>Xử lý liên kết và bảo toàn dữ liệu:</span>
                      </div>
                      <ul className="list-disc pl-5 space-y-1 text-slate-600">
                        {preview.notes.map((note, idx) => (
                          <li key={idx}>{note}</li>
                        ))}
                      </ul>
                    </div>

                    {preview.counts.total === 0 && (
                      <div className="p-3 bg-amber-50 border border-amber-200 rounded-lg text-amber-900 text-xs flex items-center gap-2">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>
                          Không tìm thấy bản ghi nào trong khoảng thời gian {formatDateDisplay(fromDate)} đến {formatDateDisplay(toDate)} thuộc các phân hệ đã chọn.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Warning Banner */}
              <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <h4 className="text-xs font-bold text-rose-950 uppercase tracking-wider">
                    Cảnh Báo Không Thể Hoàn Tác
                  </h4>
                  <p className="text-xs text-rose-800 leading-relaxed">
                    Dữ liệu sẽ được xóa thực sự trong toàn bộ hệ thống cơ sở dữ liệu. Sau khi bấm “Xác nhận xóa”, điểm KPI, tiến độ và bảng tổng hợp sẽ lập tức cập nhật lại theo dữ liệu thực tế. Thao tác không yêu cầu OTP hay xác thực Gmail.
                  </p>
                </div>
              </div>

              {executeError && (
                <div className="p-3.5 bg-rose-100 border border-rose-300 text-rose-950 rounded-xl text-xs flex items-center gap-2.5">
                  <AlertCircle className="w-4 h-4 text-rose-700 shrink-0" />
                  <span className="font-semibold">{executeError}</span>
                </div>
              )}
            </>
          )}
        </div>

        {/* Modal Footer */}
        <div className="px-6 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
          {executeResult ? (
            <div className="w-full flex justify-end">
              <button
                type="button"
                onClick={onClose}
                className="px-5 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                Đóng & Xem Dữ Liệu Đã Cập Nhật
              </button>
            </div>
          ) : (
            <>
              <button
                type="button"
                onClick={onClose}
                disabled={isExecuting}
                className="px-4 py-2 border border-slate-300 bg-white hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl transition-colors cursor-pointer disabled:opacity-50"
              >
                Hủy
              </button>

              <button
                type="button"
                onClick={handleExecuteDelete}
                disabled={
                  isExecuting ||
                  !isMasterAdmin ||
                  subsystems.length === 0 ||
                  !fromDate ||
                  !toDate ||
                  fromDate > toDate ||
                  (preview !== null && preview.counts.total === 0)
                }
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isExecuting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang tiến hành xóa...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xác nhận xóa</span>
                  </>
                )}
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
};
