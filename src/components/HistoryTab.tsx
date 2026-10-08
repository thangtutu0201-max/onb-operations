import React, { useState, useEffect, useCallback } from 'react';
import { api } from '../services/api';
import { CurrentUserSession, HistoryMonthItem } from '../types';
import { Lock, Unlock, ArrowRight, AlertTriangle, ShieldCheck, CheckCircle2, RotateCcw } from 'lucide-react';

interface HistoryTabProps {
  currentVietnamMonth: string;
  onSelectMonth: (monthYear: string) => void;
  selectedMonth: string;
  session: CurrentUserSession | null;
  onConfigChanged?: () => void;
}

export const HistoryTab: React.FC<HistoryTabProps> = ({
  currentVietnamMonth,
  onSelectMonth,
  selectedMonth,
  session,
  onConfigChanged
}) => {
  const [months, setMonths] = useState<HistoryMonthItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Modals for Lock / Reopen
  const [reopenTargetMonth, setReopenTargetMonth] = useState<string | null>(null);
  const [reopenReason, setReopenReason] = useState('');
  const [isSubmittingReopen, setIsSubmittingReopen] = useState(false);
  const [reopenError, setReopenError] = useState<string | null>(null);

  const [lockTargetMonth, setLockTargetMonth] = useState<string | null>(null);
  const [isSubmittingLock, setIsSubmittingLock] = useState(false);
  const [lockError, setLockError] = useState<string | null>(null);

  const isAdmin = Boolean(session?.isMasterAdmin || session?.role === 'admin');

  const fetchMonths = useCallback(async () => {
    try {
      const res = await api.getHistoryMonths();
      setMonths(res.months);
      setIsLoading(false);
    } catch (err) {
      console.error('Lỗi tải danh mục tháng lịch sử:', err);
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMonths();
  }, [fetchMonths]);

  // Handle Confirm Reopen Month
  const handleConfirmReopen = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reopenTargetMonth) return;

    const trimmed = reopenReason.trim();
    if (!trimmed) {
      setReopenError('Vui lòng nhập lý do mở sổ để lưu vết đối chiếu.');
      return;
    }

    setIsSubmittingReopen(true);
    setReopenError(null);

    try {
      const res = await api.reopenMonth(reopenTargetMonth, trimmed);
      if (res.success) {
        setReopenTargetMonth(null);
        setReopenReason('');
        await fetchMonths();
        if (onConfigChanged) onConfigChanged();
      } else {
        setReopenError('Không thể mở sổ tháng này. Vui lòng thử lại.');
      }
    } catch (err: any) {
      setReopenError(err.message || 'Lỗi hệ thống khi mở sổ.');
    } finally {
      setIsSubmittingReopen(false);
    }
  };

  // Handle Confirm Lock Month
  const handleConfirmLock = async () => {
    if (!lockTargetMonth) return;

    setIsSubmittingLock(true);
    setLockError(null);

    try {
      const res = await api.lockMonth(lockTargetMonth);
      if (res.success) {
        setLockTargetMonth(null);
        await fetchMonths();
        if (onConfigChanged) onConfigChanged();
      } else {
        setLockError('Không thể khóa sổ tháng này. Vui lòng thử lại.');
      }
    } catch (err: any) {
      setLockError(err.message || 'Lỗi hệ thống khi khóa sổ.');
    } finally {
      setIsSubmittingLock(false);
    }
  };

  const formatMonthDisplay = (my: string) => {
    const [year, month] = my.split('-');
    return `${month}/${year}`;
  };

  return (
    <div className="space-y-5">
      {/* Overview Banner */}
      <div className="bg-white p-5 rounded-xl border border-[#E2E8F0] shadow-xs">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-slate-900 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#4F46E5]" />
              <span>Tra Cứu & Quản Lý Khóa Sổ / Mở Sổ</span>
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Hệ thống lưu trữ toàn bộ dữ liệu vận hành từ tháng 01/2026. Các kỳ đã khóa ở chế độ <strong>Chỉ Đọc</strong> để bảo toàn toàn vẹn số liệu.
              Quản trị viên có thể <strong>Mở sổ</strong> để điều chỉnh dữ liệu kỳ cũ và <strong>Khóa sổ lại</strong> sau khi hoàn tất.
            </p>
          </div>
          {isAdmin && (
            <div className="px-3 py-1.5 bg-[#EEF2FF] border border-[#C7D2FE] rounded-lg text-[11px] font-semibold text-[#4F46E5] shrink-0 self-start sm:self-auto">
              Quyền Quản trị viên: Có quyền Mở sổ / Khóa sổ
            </div>
          )}
        </div>
      </div>

      {/* Months Grid / Table */}
      <div className="bg-white rounded-xl border border-[#E2E8F0] shadow-xs overflow-hidden">
        <div className="p-4 border-b border-[#E2E8F0] flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-900">Danh Mục Các Tháng Vận Hành</span>
          <span className="text-xs text-slate-500">
            Tháng đang xem trên thanh tác vụ: <strong className="text-slate-800">{selectedMonth}</strong>
          </span>
        </div>

        {isLoading ? (
          <div className="p-8 text-center text-xs text-slate-500">Đang tải danh mục các tháng vận hành...</div>
        ) : (
          <div className="divide-y divide-[#E2E8F0] text-xs">
            {months.map(m => {
              const isSelected = selectedMonth === m.monthYear;
              const isCurrent = m.isCurrent;
              const isLocked = m.isLocked;
              const isReopened = m.isReopened;

              return (
                <div
                  key={m.monthYear}
                  onClick={() => onSelectMonth(m.monthYear)}
                  className={`p-4 flex flex-col lg:flex-row lg:items-center justify-between gap-4 cursor-pointer transition-colors ${
                    isSelected ? 'bg-[#EEF2FF]/60' : 'hover:bg-[#F8FAFC]'
                  }`}
                >
                  {/* Left: Icon & Month details */}
                  <div className="flex items-start sm:items-center gap-3">
                    <div
                      className={`p-2.5 rounded-lg shrink-0 ${
                        isReopened
                          ? 'bg-[#EFF6FF] text-[#1D4ED8]'
                          : isLocked
                          ? 'bg-[#FFFBEB] text-[#92400E]'
                          : 'bg-[#ECFDF5] text-[#047857]'
                      }`}
                      title={
                        isReopened
                          ? 'Mở lại để điều chỉnh'
                          : isLocked
                          ? 'Đã khóa sổ (Chỉ đọc)'
                          : 'Đang mở vận hành'
                      }
                    >
                      {isReopened ? (
                        <RotateCcw className="w-4 h-4" />
                      ) : isLocked ? (
                        <Lock className="w-4 h-4" />
                      ) : (
                        <Unlock className="w-4 h-4" />
                      )}
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-bold text-sm text-slate-900">
                          Tháng {formatMonthDisplay(m.monthYear)}
                        </span>

                        {/* Status Badges */}
                        {isReopened ? (
                          <span className="text-[10px] font-semibold text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] px-2 py-0.5 rounded-lg flex items-center gap-1">
                            <RotateCcw className="w-3 h-3" />
                            Mở lại để điều chỉnh
                          </span>
                        ) : isLocked ? (
                          <span className="text-[10px] font-semibold text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] px-2 py-0.5 rounded-lg flex items-center gap-1">
                            <Lock className="w-3 h-3" />
                            Đã khóa
                          </span>
                        ) : (
                          <span className="text-[10px] font-semibold text-[#047857] bg-[#ECFDF5] border border-[#A7F3D0] px-2 py-0.5 rounded-lg flex items-center gap-1">
                            <Unlock className="w-3 h-3" />
                            Đang mở
                          </span>
                        )}

                        {isCurrent && (
                          <span className="text-[10px] font-semibold text-slate-700 bg-slate-100 px-2 py-0.5 rounded-lg">
                            Kỳ hiện tại
                          </span>
                        )}
                        {isSelected && (
                          <span className="text-[10px] font-semibold text-[#4F46E5] bg-[#EEF2FF] border border-[#C7D2FE] px-2 py-0.5 rounded-lg">
                            Đang xem
                          </span>
                        )}
                      </div>

                      {/* Status Description */}
                      <div className="text-[11px] mt-1">
                        {isReopened ? (
                          <span className="text-[#1D4ED8] font-medium">
                            Tháng này đang được mở lại để admin điều chỉnh dữ liệu.
                          </span>
                        ) : isLocked ? (
                          <span className="text-slate-500">
                            Chỉ đọc · Đã khóa sổ · Không cho phép thêm, sửa, xóa dữ liệu.
                          </span>
                        ) : (
                          <span className="text-slate-500">
                            Đang mở vận hành · Cho phép nhập lịch, sửa điểm và ghi nhận KPI.
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Right: Operational Statistics & Actions */}
                  <div className="flex items-center gap-4 text-slate-600 flex-wrap sm:flex-nowrap justify-between lg:justify-end">
                    {/* Counts */}
                    <div className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-right">
                      <div>
                        <strong className="font-mono text-slate-900">{m.scheduleCount}</strong> lịch
                      </div>
                      <div>
                        <strong className="font-mono text-slate-900">{m.progressCount}</strong> tiến độ
                      </div>
                      <div>
                        <strong className="font-mono text-slate-900">{m.packageCount}</strong> gói
                      </div>
                      <div>
                        <strong className="font-mono text-slate-900">{m.bonusCount}</strong> thưởng
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2">
                      {/* Xem tháng này */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSelectMonth(m.monthYear);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-700 hover:text-slate-900 bg-white border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg transition-colors flex items-center gap-1 shadow-2xs cursor-pointer"
                        title={`Chọn xem tháng ${formatMonthDisplay(m.monthYear)}`}
                      >
                        <span>Xem tháng này</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>

                      {/* Nút Mở sổ / Khóa sổ cho Admin */}
                      {isAdmin && (
                        <>
                          {isLocked ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setReopenTargetMonth(m.monthYear);
                                setReopenReason('');
                                setReopenError(null);
                              }}
                              className="px-3 py-1.5 text-xs font-semibold text-[#1D4ED8] hover:text-blue-900 bg-[#EFF6FF] hover:bg-blue-100 border border-[#BFDBFE] rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                              title={`Mở sổ tháng ${formatMonthDisplay(m.monthYear)} để admin điều chỉnh dữ liệu`}
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                              <span>Mở sổ</span>
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setLockTargetMonth(m.monthYear);
                                setLockError(null);
                              }}
                              className="px-3 py-1.5 text-xs font-semibold text-[#92400E] hover:text-amber-950 bg-[#FFFBEB] hover:bg-amber-100 border border-[#FDE68A] rounded-lg transition-colors flex items-center gap-1 cursor-pointer shadow-2xs"
                              title={`Khóa sổ tháng ${formatMonthDisplay(m.monthYear)}`}
                            >
                              <Lock className="w-3.5 h-3.5" />
                              <span>Khóa sổ</span>
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* MODAL: Mở sổ */}
      {reopenTargetMonth && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <RotateCcw className="w-4 h-4 text-indigo-600" />
                <span>Mở lại sổ tháng {formatMonthDisplay(reopenTargetMonth)}</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setReopenTargetMonth(null);
                  setReopenReason('');
                  setReopenError(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleConfirmReopen} className="p-5 space-y-4 text-xs">
              {reopenError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 font-medium">
                  {reopenError}
                </div>
              )}

              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-md text-amber-900 text-xs space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Xác nhận mở sổ</span>
                </div>
                <p>
                  Bạn có chắc chắn muốn mở lại sổ tháng <strong>{formatMonthDisplay(reopenTargetMonth)}</strong> để điều chỉnh dữ liệu? Chỉ admin được sửa hoặc xóa dữ liệu trong kỳ mở lại.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Lý do mở sổ (Bắt buộc để lưu nhật ký đối chiếu) *
                </label>
                <textarea
                  rows={3}
                  required
                  value={reopenReason}
                  onChange={(e) => setReopenReason(e.target.value)}
                  placeholder="VD: Điều chỉnh phân bổ điểm đào tạo do đối soát sai lệch với phòng ban..."
                  className="w-full border border-slate-300 rounded-md p-2.5 text-xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setReopenTargetMonth(null);
                    setReopenReason('');
                    setReopenError(null);
                  }}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md font-medium cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReopen}
                  className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 disabled:opacity-50 text-white font-semibold rounded-md shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmittingReopen ? 'Đang xử lý...' : 'Xác nhận mở sổ'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Khóa sổ */}
      {lockTargetMonth && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full overflow-hidden border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Lock className="w-4 h-4 text-amber-600" />
                <span>Khóa sổ tháng {formatMonthDisplay(lockTargetMonth)}</span>
              </h3>
              <button
                type="button"
                onClick={() => {
                  setLockTargetMonth(null);
                  setLockError(null);
                }}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              {lockError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 font-medium">
                  {lockError}
                </div>
              )}

              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-md text-amber-900 text-xs space-y-1">
                <div className="font-semibold flex items-center gap-1.5 text-amber-950">
                  <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Xác nhận khóa sổ</span>
                </div>
                <p>
                  Bạn có chắc chắn muốn khóa sổ tháng <strong>{formatMonthDisplay(lockTargetMonth)}</strong>? Sau khi khóa, dữ liệu kỳ này chỉ được xem cho đến khi admin mở sổ lại.
                </p>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setLockTargetMonth(null);
                    setLockError(null);
                  }}
                  className="px-3.5 py-1.5 text-xs text-slate-600 hover:bg-slate-100 rounded-md font-medium cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="button"
                  disabled={isSubmittingLock}
                  onClick={handleConfirmLock}
                  className="px-4 py-1.5 text-xs bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-semibold rounded-md shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmittingLock ? 'Đang khóa...' : 'Xác nhận khóa sổ'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

