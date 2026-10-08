import React, { useState, useEffect } from 'react';
import {
  CleanupSubsystem,
  CleanupTimeScopeType,
  CleanupPreCheckResult,
  CleanupAuditLog,
  CurrentUserSession
} from '../types';
import { api } from '../services/api';
import {
  ShieldAlert,
  AlertTriangle,
  Lock,
  CheckCircle2,
  XCircle,
  Database,
  Trash2,
  Calendar,
  Layers,
  Clock,
  RotateCcw,
  RefreshCw,
  FileText,
  KeyRound,
  History,
  X,
  Info
} from 'lucide-react';

interface TestDataCleanupModalProps {
  isOpen: boolean;
  onClose: () => void;
  selectedMonth: string;
  session: CurrentUserSession | null;
  onSuccessRefresh: () => Promise<void>;
}

export const TestDataCleanupModal: React.FC<TestDataCleanupModalProps> = ({
  isOpen,
  onClose,
  selectedMonth,
  session,
  onSuccessRefresh
}) => {
  const [activeTab, setActiveTab] = useState<'cleanup' | 'logs'>('cleanup');

  // Account verification state
  const [isAuthorized, setIsAuthorized] = useState(false);
  const [isConfirmed, setIsConfirmed] = useState(false);
  const [authorizedEmail, setAuthorizedEmail] = useState('');
  const [confirmAccountInput, setConfirmAccountInput] = useState('');
  const [isConfirmingAccount, setIsConfirmingAccount] = useState(false);
  const [accountConfirmError, setAccountConfirmError] = useState('');

  // Subsystems & Scope selection (Default: unselected as required)
  const [selectedSubsystems, setSelectedSubsystems] = useState<CleanupSubsystem[]>([]);
  const [timeScopeType, setTimeScopeType] = useState<CleanupTimeScopeType>('current_month');
  const [customFromMonth, setCustomFromMonth] = useState(selectedMonth);
  const [customToMonth, setCustomToMonth] = useState(selectedMonth);

  // Pre-check state
  const [isPreChecking, setIsPreChecking] = useState(false);
  const [preCheckResult, setPreCheckResult] = useState<CleanupPreCheckResult | null>(null);
  const [preCheckError, setPreCheckError] = useState('');

  // Confirmation inputs
  const [reason, setReason] = useState('');
  const [confirmPhrase, setConfirmPhrase] = useState('');
  const [reauthEmail, setReauthEmail] = useState('');

  // Execution state
  const [isExecuting, setIsExecuting] = useState(false);
  const [executeError, setExecuteError] = useState('');
  const [executeSuccessResult, setExecuteSuccessResult] = useState<any | null>(null);

  // Audit logs state
  const [logs, setLogs] = useState<CleanupAuditLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState(false);

  // Load status
  const checkStatus = async () => {
    try {
      const res = await api.getCleanupStatus();
      setIsAuthorized(res.isAuthorized);
      setIsConfirmed(res.isConfirmed);
      if (res.authorizedEmail) setAuthorizedEmail(res.authorizedEmail);
    } catch (err: any) {
      console.error('Lỗi kiểm tra quyền dọn dẹp dữ liệu kiểm thử:', err);
    }
  };

  const loadAuditLogs = async () => {
    setIsLoadingLogs(true);
    try {
      const res = await api.getCleanupAuditLogs();
      setLogs(res.logs || []);
    } catch (err) {
      console.error('Lỗi tải nhật ký dọn dẹp:', err);
    } finally {
      setIsLoadingLogs(false);
    }
  };

  useEffect(() => {
    if (isOpen) {
      checkStatus();
      setExecuteSuccessResult(null);
      setPreCheckResult(null);
      setPreCheckError('');
      setExecuteError('');
      setReason('');
      setConfirmPhrase('');
      setReauthEmail('');
      setSelectedSubsystems([]);
      setTimeScopeType('current_month');
    }
  }, [isOpen, selectedMonth]);

  useEffect(() => {
    if (isOpen && activeTab === 'logs') {
      loadAuditLogs();
    }
  }, [isOpen, activeTab]);

  if (!isOpen) return null;

  // Toggle subsystem
  const handleToggleSubsystem = (sub: CleanupSubsystem) => {
    setPreCheckResult(null);
    setPreCheckError('');
    setSelectedSubsystems(prev => {
      if (prev.includes(sub)) {
        return prev.filter(s => s !== sub);
      } else {
        return [...prev, sub];
      }
    });
  };

  const handleSelectAllSubsystems = () => {
    setPreCheckResult(null);
    setPreCheckError('');
    if (selectedSubsystems.length === 3) {
      setSelectedSubsystems([]);
    } else {
      setSelectedSubsystems(['schedules', 'progress', 'packages']);
    }
  };

  // Confirm account
  const handleConfirmAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setAccountConfirmError('');
    setIsConfirmingAccount(true);
    try {
      await api.confirmCleanupAccount(confirmAccountInput.trim());
      setIsConfirmed(true);
      setConfirmAccountInput('');
      await checkStatus();
    } catch (err: any) {
      setAccountConfirmError(err.message || 'Lỗi khi xác nhận tài khoản.');
    } finally {
      setIsConfirmingAccount(false);
    }
  };

  // Run Pre-Check
  const handleRunPreCheck = async () => {
    if (selectedSubsystems.length === 0) {
      setPreCheckError('Vui lòng chọn ít nhất một phân hệ để kiểm tra.');
      return;
    }

    setPreCheckError('');
    setIsPreChecking(true);
    try {
      const res = await api.preCheckCleanup({
        subsystems: selectedSubsystems,
        timeScopeType,
        monthYear: selectedMonth,
        fromMonth: customFromMonth,
        toMonth: customToMonth
      });
      setPreCheckResult(res);
    } catch (err: any) {
      setPreCheckError(err.message || 'Lỗi khi kiểm tra phạm vi xóa dữ liệu.');
      setPreCheckResult(null);
    } finally {
      setIsPreChecking(false);
    }
  };

  // Run Execute
  const handleExecute = async () => {
    if (!preCheckResult || !preCheckResult.canProceed) return;
    setExecuteError('');
    setIsExecuting(true);
    try {
      const res = await api.executeCleanup({
        subsystems: selectedSubsystems,
        timeScopeType,
        monthYear: selectedMonth,
        fromMonth: customFromMonth,
        toMonth: customToMonth,
        reason: reason.trim(),
        confirmPhrase: confirmPhrase.trim(),
        authAccountEmail: reauthEmail.trim(),
        dataSignature: preCheckResult.dataSignature
      });
      setExecuteSuccessResult(res);
      await onSuccessRefresh();
    } catch (err: any) {
      setExecuteError(err.message || 'Lỗi trong quá trình xóa dữ liệu kiểm thử.');
    } finally {
      setIsExecuting(false);
    }
  };

  // Verification checks for execute button
  const isReasonValid = reason.trim().length >= 5;
  const isPhraseValid = confirmPhrase.trim() === 'XÓA DỮ LIỆU';
  const isEmailValid = reauthEmail.trim().toLowerCase() === (authorizedEmail || 'dangthihong01012003@gmail.com').toLowerCase();
  const canConfirmExecution =
    Boolean(preCheckResult?.canProceed) &&
    !preCheckResult?.isLockedBlocked &&
    (preCheckResult?.dependencyIssues?.length || 0) === 0 &&
    isReasonValid &&
    isPhraseValid &&
    isEmailValid &&
    !isExecuting;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-3xl w-full max-h-[92vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="px-6 py-4.5 border-b border-slate-200 flex items-center justify-between bg-gradient-to-r from-rose-50 via-amber-50/50 to-white">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-rose-100 border border-rose-200 flex items-center justify-center text-rose-700 shadow-xs">
              <ShieldAlert className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-base sm:text-lg font-bold text-slate-900 tracking-tight">
                  Xóa Dữ Liệu Kiểm Thử
                </h3>
                <span className="text-[11px] font-semibold px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 border border-rose-200/80">
                  Đặc quyền cá nhân
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Bảo toàn 100% hồ sơ Core, danh mục, nhân sự và nhóm · Hỗ trợ sao lưu phục hồi tự động
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            disabled={isExecuting}
            className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tab Navigation */}
        <div className="px-6 border-b border-slate-200 bg-slate-50/60 flex items-center gap-2 text-xs font-semibold">
          <button
            onClick={() => setActiveTab('cleanup')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'cleanup'
                ? 'border-rose-600 text-rose-700 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <Trash2 className="w-3.5 h-3.5" />
            Thao tác dọn dẹp
          </button>
          <button
            onClick={() => setActiveTab('logs')}
            className={`py-3 px-3 border-b-2 flex items-center gap-2 cursor-pointer transition-colors ${
              activeTab === 'logs'
                ? 'border-rose-600 text-rose-700 font-bold'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-3.5 h-3.5" />
            Nhật ký xóa dữ liệu
          </button>
        </div>

        {/* Body Content */}
        <div className="flex-1 overflow-y-auto p-6 space-y-6">
          {/* Case 1: Account NOT confirmed yet */}
          {!isConfirmed ? (
            <div className="space-y-5">
              <div className="p-4.5 rounded-xl bg-amber-50 border border-amber-200/80 text-amber-900 space-y-2">
                <div className="flex items-center gap-2 text-sm font-bold text-amber-900">
                  <KeyRound className="w-4 h-4 text-amber-700" />
                  Yêu cầu xác nhận tài khoản cá nhân được ủy quyền
                </div>
                <p className="text-xs text-amber-800 leading-relaxed">
                  Chức năng <strong>Xóa dữ liệu kiểm thử</strong> chỉ cấp riêng cho tài khoản cá nhân đã xác thực của bạn (<strong>dangthihong01012003@gmail.com</strong>).
                  Để bảo đảm an toàn dữ liệu, mặc định chưa ai trong hệ thống (kể cả quản trị viên khác) có quyền thực hiện cho đến khi bạn xác nhận kích hoạt tài khoản.
                </p>
              </div>

              <form onSubmit={handleConfirmAccount} className="space-y-4 max-w-lg mx-auto bg-slate-50 p-5 rounded-xl border border-slate-200">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Nhập địa chỉ email tài khoản cá nhân của bạn để kích hoạt:
                  </label>
                  <input
                    type="email"
                    value={confirmAccountInput}
                    onChange={e => setConfirmAccountInput(e.target.value)}
                    placeholder="dangthihong01012003@gmail.com"
                    required
                    className="w-full px-3.5 py-2 text-sm bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                  />
                  <p className="text-[11px] text-slate-500 mt-1">
                    Nhập chính xác: <code className="font-mono text-slate-700 bg-slate-200/60 px-1 py-0.5 rounded">dangthihong01012003@gmail.com</code>
                  </p>
                </div>

                {accountConfirmError && (
                  <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                    <XCircle className="w-4 h-4 shrink-0" />
                    <span>{accountConfirmError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isConfirmingAccount || !confirmAccountInput.trim()}
                  className="w-full py-2.5 px-4 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isConfirmingAccount ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Đang xác nhận...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Xác nhận & Kích hoạt quyền
                    </>
                  )}
                </button>
              </form>
            </div>
          ) : activeTab === 'logs' ? (
            /* Case 2: View Audit Logs */
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">
                    Nhật ký các lần xóa dữ liệu kiểm thử
                  </h4>
                  <p className="text-xs text-slate-500">
                    Nhật ký độc lập, được bảo toàn vĩnh viễn và không bị xóa bởi chức năng dọn dẹp.
                  </p>
                </div>
                <button
                  onClick={loadAuditLogs}
                  disabled={isLoadingLogs}
                  className="px-3 py-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white border border-slate-200 rounded-lg hover:bg-slate-50 transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <RefreshCw className={`w-3 h-3 ${isLoadingLogs ? 'animate-spin' : ''}`} />
                  Làm mới
                </button>
              </div>

              {isLoadingLogs ? (
                <div className="py-12 text-center text-xs text-slate-500">
                  <RefreshCw className="w-5 h-5 animate-spin mx-auto mb-2 text-rose-500" />
                  Đang tải nhật ký thao tác...
                </div>
              ) : logs.length === 0 ? (
                <div className="py-12 text-center text-xs text-slate-400 bg-slate-50 rounded-xl border border-slate-200">
                  Chưa có lần xóa dữ liệu nào được ghi nhận.
                </div>
              ) : (
                <div className="space-y-3">
                  {logs.map(log => (
                    <div key={log.id} className="p-4 bg-white rounded-xl border border-slate-200 shadow-2xs space-y-2.5">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">
                              {log.accountEmail}
                            </span>
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">
                              {log.result}
                            </span>
                          </div>
                          <p className="text-xs text-slate-600 mt-1 font-medium">
                            Lý do: &ldquo;{log.reason}&rdquo;
                          </p>
                        </div>
                        <div className="text-[11px] text-slate-500 text-right shrink-0">
                          {new Date(log.completedAt).toLocaleString('vi-VN')}
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] bg-slate-50 p-2.5 rounded-lg border border-slate-200/60 text-slate-600">
                        <div>
                          Phân hệ: <strong className="text-slate-900">{log.subsystems.join(', ')}</strong>
                        </div>
                        <div>
                          Lịch đã xóa: <strong className="text-slate-900">{log.deletedCounts.schedules}</strong>
                        </div>
                        <div>
                          Tiến độ đã xóa: <strong className="text-slate-900">{log.deletedCounts.progress}</strong>
                        </div>
                        <div>
                          Gói đã xóa: <strong className="text-slate-900">{log.deletedCounts.packages}</strong>
                        </div>
                      </div>

                      <div className="text-[10px] text-slate-500 flex items-center justify-between font-mono">
                        <span>Bản sao lưu: {log.backupReferenceId}</span>
                        <span>Mã nhật ký: {log.id}</span>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : executeSuccessResult ? (
            /* Case 3: Deletion completed successfully */
            <div className="space-y-5 text-center py-4">
              <div className="w-14 h-14 bg-emerald-100 text-emerald-600 rounded-2xl flex items-center justify-center mx-auto shadow-xs border border-emerald-200">
                <CheckCircle2 className="w-8 h-8" />
              </div>
              <div>
                <h4 className="text-base sm:text-lg font-bold text-slate-900">
                  Đã hoàn tất xóa dữ liệu kiểm thử thành công
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Dữ liệu đã được xóa tại nguồn lưu trữ chính thức và tự động đồng bộ tới toàn bộ màn hình.
                </p>
              </div>

              {/* Counts summary */}
              <div className="grid grid-cols-3 gap-3 max-w-lg mx-auto text-center">
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-lg font-bold text-slate-900 font-mono-numbers">
                    {executeSuccessResult.deletedCounts?.schedules || 0}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Lịch công việc</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-lg font-bold text-slate-900 font-mono-numbers">
                    {executeSuccessResult.deletedCounts?.progress || 0}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Tiến độ thực hiện</div>
                </div>
                <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                  <div className="text-lg font-bold text-slate-900 font-mono-numbers">
                    {executeSuccessResult.deletedCounts?.packages || 0}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Tiếp nhận gói đào tạo</div>
                </div>
              </div>

              {/* Backup snapshot card */}
              <div className="max-w-lg mx-auto p-3.5 bg-blue-50 border border-blue-200 rounded-xl text-left text-xs space-y-1">
                <div className="font-semibold text-blue-900 flex items-center gap-1.5">
                  <Database className="w-4 h-4 text-blue-700" />
                  Mã bản sao lưu tự động tạo trước khi xóa:
                </div>
                <div className="font-mono text-blue-800 break-all bg-white/80 p-2 rounded border border-blue-200/80">
                  {executeSuccessResult.backupReferenceId}
                </div>
                <p className="text-[11px] text-blue-700/80 mt-1">
                  Bản sao lưu được lưu trữ độc lập tại thư mục <code className="font-mono">data/backups/</code> phục vụ việc khôi phục khi cần.
                </p>
              </div>

              <div className="pt-2">
                <button
                  onClick={onClose}
                  className="px-6 py-2.5 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer shadow-xs"
                >
                  Đóng hộp thoại
                </button>
              </div>
            </div>
          ) : (
            /* Case 4: Main Cleanup Form */
            <div className="space-y-6">
              {/* Important Safety Warning */}
              <div className="p-4 rounded-xl bg-rose-50 border border-rose-200/80 text-rose-950 space-y-1.5">
                <div className="flex items-center gap-2 text-xs sm:text-sm font-bold text-rose-900">
                  <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
                  Cảnh báo an toàn dữ liệu
                </div>
                <p className="text-xs text-rose-800 leading-relaxed">
                  Thao tác sẽ xóa mọi dữ liệu thuộc phạm vi đã chọn, bao gồm dữ liệu thật nếu có.
                  Phạm vi xóa áp dụng cho <strong>tất cả nhân sự thuộc phạm vi hệ thống</strong>, không phụ thuộc bộ lọc nhóm hay dòng hiển thị trên màn hình.
                  Toàn bộ tài khoản, hồ sơ ONB, nhóm, danh mục Core, sản phẩm, loại việc và bảng điểm tham chiếu được <strong>bảo toàn 100% nguyên vẹn</strong>.
                </p>
              </div>

              {/* Section 1: Choose Subsystems */}
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                    <Layers className="w-3.5 h-3.5 text-blue-600" />
                    1. Chọn phân hệ cần xóa (Mặc định không chọn sẵn):
                  </label>
                  <button
                    type="button"
                    onClick={handleSelectAllSubsystems}
                    className="text-xs font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                  >
                    {selectedSubsystems.length === 3 ? 'Bỏ chọn tất cả' : 'Chọn cả ba phân hệ'}
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Schedule */}
                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
                      selectedSubsystems.includes('schedules')
                        ? 'border-rose-500 bg-rose-50/50 shadow-xs ring-1 ring-rose-500'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSubsystems.includes('schedules')}
                      onChange={() => handleToggleSubsystem('schedules')}
                      className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">Lịch công việc</div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Xóa lịch; lớp Đào tạo tập trung hoàn trả về Chưa phân bổ.
                      </p>
                    </div>
                  </label>

                  {/* Progress */}
                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
                      selectedSubsystems.includes('progress')
                        ? 'border-rose-500 bg-rose-50/50 shadow-xs ring-1 ring-rose-500'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSubsystems.includes('progress')}
                      onChange={() => handleToggleSubsystem('progress')}
                      className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">Tiến độ thực hiện</div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Xóa tiến độ, điểm ghi nhận; tự động cập nhật lại tổng điểm KPI.
                      </p>
                    </div>
                  </label>

                  {/* Packages */}
                  <label
                    className={`flex items-start gap-3 p-3.5 rounded-xl border transition-all cursor-pointer ${
                      selectedSubsystems.includes('packages')
                        ? 'border-rose-500 bg-rose-50/50 shadow-xs ring-1 ring-rose-500'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={selectedSubsystems.includes('packages')}
                      onChange={() => handleToggleSubsystem('packages')}
                      className="mt-0.5 rounded text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">Tiếp nhận gói đào tạo</div>
                      <p className="text-[11px] text-slate-500 mt-0.5">
                        Xóa gói tiếp nhận & chi tiết; giữ nguyên hồ sơ KH dùng chung.
                      </p>
                    </div>
                  </label>
                </div>
              </div>

              {/* Section 2: Choose Time Scope */}
              <div className="space-y-3">
                <label className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                  <Calendar className="w-3.5 h-3.5 text-blue-600" />
                  2. Chọn phạm vi thời gian:
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Current month */}
                  <label
                    className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                      timeScopeType === 'current_month'
                        ? 'border-rose-500 bg-rose-50/50 ring-1 ring-rose-500'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="timeScope"
                      checked={timeScopeType === 'current_month'}
                      onChange={() => {
                        setTimeScopeType('current_month');
                        setPreCheckResult(null);
                      }}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">Tháng đang chọn</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Chỉ áp dụng trong tháng {selectedMonth}
                      </div>
                    </div>
                  </label>

                  {/* Custom range */}
                  <label
                    className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                      timeScopeType === 'custom_range'
                        ? 'border-rose-500 bg-rose-50/50 ring-1 ring-rose-500'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="timeScope"
                      checked={timeScopeType === 'custom_range'}
                      onChange={() => {
                        setTimeScopeType('custom_range');
                        setPreCheckResult(null);
                      }}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">Khoảng thời gian cụ thể</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Tùy chọn khoảng tháng liên tiếp
                      </div>
                    </div>
                  </label>

                  {/* All time */}
                  <label
                    className={`p-3.5 rounded-xl border flex items-start gap-3 cursor-pointer transition-all ${
                      timeScopeType === 'all_time'
                        ? 'border-rose-500 bg-rose-50/50 ring-1 ring-rose-500'
                        : 'border-slate-200 bg-white hover:bg-slate-50'
                    }`}
                  >
                    <input
                      type="radio"
                      name="timeScope"
                      checked={timeScopeType === 'all_time'}
                      onChange={() => {
                        setTimeScopeType('all_time');
                        setPreCheckResult(null);
                      }}
                      className="mt-0.5 text-rose-600 focus:ring-rose-500 cursor-pointer"
                    />
                    <div>
                      <div className="text-xs font-bold text-slate-900">Toàn bộ thời gian</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Xóa tất cả các tháng (yêu cầu mở sổ)
                      </div>
                    </div>
                  </label>
                </div>

                {/* Range inputs if custom_range */}
                {timeScopeType === 'custom_range' && (
                  <div className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex flex-wrap items-center gap-3 text-xs">
                    <span className="font-semibold text-slate-700">Từ tháng:</span>
                    <input
                      type="month"
                      value={customFromMonth}
                      onChange={e => {
                        setCustomFromMonth(e.target.value);
                        setPreCheckResult(null);
                      }}
                      className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-mono"
                    />
                    <span className="font-semibold text-slate-700">Đến tháng:</span>
                    <input
                      type="month"
                      value={customToMonth}
                      onChange={e => {
                        setCustomToMonth(e.target.value);
                        setPreCheckResult(null);
                      }}
                      className="bg-white border border-slate-300 rounded px-2.5 py-1 text-xs font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Pre-Check Button */}
              <div className="pt-1">
                <button
                  type="button"
                  onClick={handleRunPreCheck}
                  disabled={isPreChecking || selectedSubsystems.length === 0}
                  className="w-full py-2.5 px-4 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] disabled:bg-slate-100 disabled:text-slate-400 text-white text-xs font-semibold rounded-lg transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed shadow-xs"
                >
                  {isPreChecking ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      Đang phân tích và kiểm tra ràng buộc...
                    </>
                  ) : (
                    <>
                      <Database className="w-3.5 h-3.5 text-rose-400" />
                      Kiểm tra & Xem trước phạm vi xóa (Pre-Check)
                    </>
                  )}
                </button>
              </div>

              {preCheckError && (
                <div className="p-3.5 bg-red-50 border border-red-200 rounded-xl text-xs text-red-700 flex items-center gap-2">
                  <XCircle className="w-4 h-4 shrink-0" />
                  <span>{preCheckError}</span>
                </div>
              )}

              {/* Pre-Check Results */}
              {preCheckResult && (
                <div className="space-y-4 p-4.5 bg-slate-50/80 rounded-xl border border-slate-200 text-xs">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                    <span className="font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <FileText className="w-3.5 h-3.5 text-blue-600" />
                      Kết quả kiểm tra trước khi xóa:
                    </span>
                    <span className="text-[11px] font-semibold text-slate-500">
                      Phạm vi: {preCheckResult.monthsCovered.join(', ') || 'N/A'}
                    </span>
                  </div>

                  {/* Locked Month Blocking Check (Section 6) */}
                  {preCheckResult.isLockedBlocked ? (
                    <div className="p-3.5 bg-red-100 border border-red-300 rounded-xl text-red-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-xs text-red-950">
                        <Lock className="w-4 h-4 text-red-700 shrink-0" />
                        Ngăn chặn thao tác: Có kỳ kế toán đã khóa sổ
                      </div>
                      <p className="text-[11px] leading-relaxed">
                        {preCheckResult.blockReason}
                      </p>
                    </div>
                  ) : null}

                  {/* Dependency Issues Check (Section 5) */}
                  {preCheckResult.dependencyIssues.length > 0 ? (
                    <div className="p-3 bg-amber-100 border border-amber-300 rounded-xl text-amber-900 space-y-1">
                      <div className="font-bold flex items-center gap-1.5 text-xs">
                        <AlertTriangle className="w-4 h-4 text-amber-700 shrink-0" />
                        Ràng buộc dữ liệu liên kết:
                      </div>
                      {preCheckResult.dependencyIssues.map((issue, idx) => (
                        <p key={idx} className="text-[11px]">{issue}</p>
                      ))}
                    </div>
                  ) : null}

                  {/* Record counts */}
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <div className="text-slate-500 text-[11px]">Lịch công việc sẽ xóa</div>
                      <div className="text-base font-bold text-slate-900 font-mono-numbers mt-0.5">
                        {preCheckResult.counts.schedules} bản ghi
                      </div>
                      {preCheckResult.counts.trainingClassesReset > 0 && (
                        <div className="text-[10px] text-blue-600 mt-0.5">
                          ({preCheckResult.counts.trainingClassesReset} lớp ĐTTT hoàn trả Chưa phân bổ)
                        </div>
                      )}
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <div className="text-slate-500 text-[11px]">Tiến độ thực hiện sẽ xóa</div>
                      <div className="text-base font-bold text-slate-900 font-mono-numbers mt-0.5">
                        {preCheckResult.counts.progress} bản ghi
                      </div>
                      {preCheckResult.counts.progressSplits > 0 && (
                        <div className="text-[10px] text-slate-500 mt-0.5">
                          ({preCheckResult.counts.progressSplits} lượt chia điểm)
                        </div>
                      )}
                    </div>

                    <div className="bg-white p-3 rounded-lg border border-slate-200">
                      <div className="text-slate-500 text-[11px]">Gói tiếp nhận sẽ xóa</div>
                      <div className="text-base font-bold text-slate-900 font-mono-numbers mt-0.5">
                        {preCheckResult.counts.packages} gói
                      </div>
                      <div className="text-[10px] text-emerald-600 mt-0.5">
                        (Bảo toàn {preCheckResult.counts.customersRetained} khách hàng dùng chung)
                      </div>
                    </div>
                  </div>

                  {/* Impact summary */}
                  <div className="bg-white p-3 rounded-lg border border-slate-200 text-[11px] text-slate-600 flex items-center justify-between">
                    <span>Nhân sự có dữ liệu bị ảnh hưởng:</span>
                    <strong className="text-slate-900 font-bold">{preCheckResult.impact.membersAffectedCount} nhân sự</strong>
                  </div>

                  {/* Section 4: Mandatory Confirmation Inputs */}
                  {preCheckResult.canProceed && (
                    <div className="space-y-4 pt-3 border-t border-slate-200">
                      <div className="text-xs font-bold text-rose-900 uppercase tracking-wider flex items-center gap-1.5">
                        <KeyRound className="w-3.5 h-3.5 text-rose-600" />
                        3. Các bước xác nhận an toàn bắt buộc:
                      </div>

                      {/* Input 1: Reason */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Bước 1: Nhập lý do xóa dữ liệu (Tối thiểu 5 ký tự):
                        </label>
                        <input
                          type="text"
                          value={reason}
                          onChange={e => setReason(e.target.value)}
                          placeholder="Ví dụ: Xóa dữ liệu kiểm thử để nhập lại luồng nghiệp vụ mới"
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500"
                        />
                      </div>

                      {/* Input 2: Confirmation phrase */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Bước 2: Nhập đúng cụm từ <span className="text-rose-700 font-bold font-mono">XÓA DỮ LIỆU</span>:
                        </label>
                        <input
                          type="text"
                          value={confirmPhrase}
                          onChange={e => setConfirmPhrase(e.target.value)}
                          placeholder="XÓA DỮ LIỆU"
                          className="w-full px-3 py-2 text-xs font-mono font-bold bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500 text-rose-700"
                        />
                      </div>

                      {/* Input 3: Re-authenticate personal account email */}
                      <div>
                        <label className="block text-xs font-semibold text-slate-700 mb-1">
                          Bước 3: Xác thực lại tài khoản cá nhân của bạn (Email: <code className="font-mono text-slate-800">{authorizedEmail || 'dangthihong01012003@gmail.com'}</code>):
                        </label>
                        <input
                          type="email"
                          value={reauthEmail}
                          onChange={e => setReauthEmail(e.target.value)}
                          placeholder="dangthihong01012003@gmail.com"
                          className="w-full px-3 py-2 text-xs bg-white border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-rose-500 font-medium"
                        />
                      </div>

                      {executeError && (
                        <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-xs text-red-700 flex items-center gap-2">
                          <XCircle className="w-4 h-4 shrink-0" />
                          <span>{executeError}</span>
                        </div>
                      )}

                      {/* Execution buttons */}
                      <div className="flex items-center justify-end gap-3 pt-2">
                        <button
                          type="button"
                          onClick={onClose}
                          disabled={isExecuting}
                          className="px-4 py-2 border border-slate-200 hover:bg-slate-100 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                        >
                          Hủy bỏ
                        </button>
                        <button
                          type="button"
                          onClick={handleExecute}
                          disabled={!canConfirmExecution}
                          className="px-5 py-2 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 disabled:text-slate-500 text-white text-xs font-bold rounded-lg transition-colors shadow-xs flex items-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                        >
                          {isExecuting ? (
                            <>
                              <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                              Đang sao lưu và thực hiện xóa...
                            </>
                          ) : (
                            <>
                              <Trash2 className="w-3.5 h-3.5" />
                              Xác nhận xóa dữ liệu
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
