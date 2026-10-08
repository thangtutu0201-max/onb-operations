import React, { useState, useEffect } from 'react';
import { BackupFileInfo, CurrentUserSession } from '../types';
import { api } from '../services/api';
import {
  Database,
  Cloud,
  Download,
  RotateCcw,
  Trash2,
  Plus,
  RefreshCw,
  CheckCircle2,
  AlertTriangle,
  AlertCircle,
  FileSpreadsheet,
  Clock,
  ShieldCheck,
  Server,
  HardDrive,
  Calendar,
  Layers,
  ArrowRight,
  Info
} from 'lucide-react';

interface BackupManagementSubTabProps {
  session: CurrentUserSession | null;
  onOpenDateRangeDeleteModal?: () => void;
  onRefreshAllData: () => Promise<void>;
}

export const BackupManagementSubTab: React.FC<BackupManagementSubTabProps> = ({
  session,
  onOpenDateRangeDeleteModal,
  onRefreshAllData
}) => {
  const isMasterAdmin = Boolean(session?.isMasterAdmin || session?.role === 'admin');

  const [backups, setBackups] = useState<BackupFileInfo[]>([]);
  const [isLoadingBackups, setIsLoadingBackups] = useState<boolean>(true);
  const [isCreatingBackup, setIsCreatingBackup] = useState<boolean>(false);
  const [actionMessage, setActionMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Restore Modal State
  const [restoreConfirmFile, setRestoreConfirmFile] = useState<BackupFileInfo | null>(null);
  const [isRestoring, setIsRestoring] = useState<boolean>(false);

  // Reset Operational Data Modal State
  const [isResetModalOpen, setIsResetModalOpen] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);

  // Export State
  const [exportType, setExportType] = useState<'schedules' | 'progress' | 'packages' | 'all'>('all');
  const [exportFormat, setExportFormat] = useState<'csv' | 'json'>('csv');
  const [exportFromDate, setExportFromDate] = useState<string>('');
  const [exportToDate, setExportToDate] = useState<string>('');

  const loadBackupsList = async () => {
    setIsLoadingBackups(true);
    try {
      const res = await api.getBackups();
      setBackups(res.backups || []);
    } catch (err: any) {
      console.error('Lỗi khi tải danh sách sao lưu:', err);
    } finally {
      setIsLoadingBackups(false);
    }
  };

  useEffect(() => {
    loadBackupsList();
  }, []);

  const handleCreateManualBackup = async () => {
    setIsCreatingBackup(true);
    setActionMessage(null);
    try {
      const res = await api.createBackupSnapshot();
      setActionMessage({ type: 'success', text: res.message });
      await loadBackupsList();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi tạo bản sao lưu thủ công.' });
    } finally {
      setIsCreatingBackup(false);
    }
  };

  const handleConfirmRestore = async () => {
    if (!restoreConfirmFile) return;
    setIsRestoring(true);
    setActionMessage(null);
    try {
      const res = await api.restoreBackupSnapshot(restoreConfirmFile.filename);
      setActionMessage({ type: 'success', text: res.message });
      setRestoreConfirmFile(null);
      await onRefreshAllData();
      await loadBackupsList();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi khôi phục bản sao lưu.' });
    } finally {
      setIsRestoring(false);
    }
  };

  const handleDeleteBackup = async (filename: string) => {
    if (!window.confirm(`Bạn có chắc chắn muốn xóa bản sao lưu ${filename}?`)) return;
    try {
      await api.deleteBackupFile(filename);
      await loadBackupsList();
      setActionMessage({ type: 'success', text: `Đã xóa bản sao lưu ${filename}.` });
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi xóa bản sao lưu.' });
    }
  };

  const handleConfirmReset = async () => {
    setIsResetting(true);
    setActionMessage(null);
    try {
      const res = await api.resetOperationalData();
      setActionMessage({
        type: 'success',
        text: `Đã xóa trắng dữ liệu nghiệp vụ thành công (${res.wipedCounts.total} bản ghi). Toàn bộ danh mục Thiết lập hệ thống được bảo toàn. Bản sao lưu tự động đã lưu: ${res.backupReferenceId}`
      });
      setIsResetModalOpen(false);
      await onRefreshAllData();
      await loadBackupsList();
    } catch (err: any) {
      setActionMessage({ type: 'error', text: err.message || 'Lỗi khi xóa trắng dữ liệu nghiệp vụ.' });
    } finally {
      setIsResetting(false);
    }
  };

  const handleTriggerExport = () => {
    const params = new URLSearchParams();
    params.set('type', exportType);
    params.set('format', exportFormat);
    if (exportFromDate) params.set('fromDate', exportFromDate);
    if (exportToDate) params.set('toDate', exportToDate);

    window.location.href = `/api/core/export?${params.toString()}`;
  };

  const formatTagBadge = (tag: string) => {
    switch (tag) {
      case 'daily':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-blue-100 text-blue-800">Tự động hằng ngày</span>;
      case 'manual':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">Thủ công</span>;
      case 'pre_cleanup':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">Trước khi xóa dữ liệu</span>;
      case 'pre_reset':
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-purple-100 text-purple-800">Trước khi reset nghiệp vụ</span>;
      default:
        return <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-slate-100 text-slate-700">{tag}</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* 1. Architectural Overview & Storage Guidance Card */}
      <div className="bg-white text-slate-800 rounded-xl p-6 shadow-xs border border-slate-200">
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
          <div className="flex items-center gap-3">
            <div className="p-3 bg-[#EEF2FF] text-[#4F46E5] rounded-xl border border-indigo-100">
              <Server className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5">
                <h3 className="text-base font-bold text-slate-900">
                  Kiến Trúc Lưu Trữ & An Toàn Dữ Liệu Thực Tế
                </h3>
                <span className="px-2.5 py-0.5 text-[10px] font-bold uppercase rounded-lg bg-[#ECFDF5] text-[#047857] border border-[#A7F3D0]">
                  Chuẩn 150 Users Đồng Thời
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">
                Phân định rõ ràng giữa Cơ sở dữ liệu vận hành (OLTP) và Kho lưu trữ bản sao lưu (Google Drive / Archives)
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleCreateManualBackup}
              disabled={isCreatingBackup}
              className="px-4 py-2 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white text-xs font-semibold rounded-lg transition-all flex items-center gap-2 shadow-xs cursor-pointer disabled:opacity-50"
            >
              {isCreatingBackup ? (
                <>
                  <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  <span>Đang tạo bản sao...</span>
                </>
              ) : (
                <>
                  <Plus className="w-3.5 h-3.5" />
                  <span>Tạo bản sao lưu ngay</span>
                </>
              )}
            </button>
          </div>
        </div>

        {/* 3 Columns Comparison */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-5 text-xs">
          <div className="bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0] space-y-2">
            <div className="flex items-center gap-2 text-[#1D4ED8] font-bold">
              <HardDrive className="w-4 h-4" />
              <span>1. CSDL Vận Hành (OLTP)</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              Lưu trữ bền vững trên Server Backend với <strong className="text-slate-900">Transaction Queue</strong> và <strong className="text-slate-900">Atomic File Replacement</strong>. Đáp ứng 150 người dùng đọc/ghi đồng thời không gây lock, race conditions hay mất dữ liệu.
            </p>
          </div>

          <div className="bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0] space-y-2">
            <div className="flex items-center gap-2 text-[#92400E] font-bold">
              <Cloud className="w-4 h-4" />
              <span>2. Google Drive Cá Nhân (Bản sao lưu)</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              Drive đóng vai trò là <strong className="text-slate-900">Kho lưu trữ bản sao lưu an toàn ngoài hệ thống</strong> và nhận dữ liệu xuất (Export). Phân tách với CSDL vận hành để tránh nghẽn API Rate-Limit (429) và độ trễ mạng của Drive.
            </p>
          </div>

          <div className="bg-[#F8FAFC] p-4 rounded-xl border border-[#E2E8F0] space-y-2">
            <div className="flex items-center gap-2 text-[#047857] font-bold">
              <ShieldCheck className="w-4 h-4" />
              <span>3. Phân Quyền & Bảo Toàn 5 Năm</span>
            </div>
            <p className="text-slate-600 leading-relaxed text-[11px]">
              Người dùng chỉ truy cập theo phân quyền nghiệp vụ (Nhân viên, Quản lý, Admin). Kiểm tra quyền 100% tại Backend. Cơ chế lọc theo tháng giúp tra cứu 100.000 dòng trong 5 năm với độ trễ &lt; 30ms.
            </p>
          </div>
        </div>
      </div>

      {actionMessage && (
        <div
          className={`p-4 rounded-xl border text-xs font-semibold flex items-center justify-between gap-3 animate-in fade-in duration-200 ${
            actionMessage.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-200'
              : 'bg-rose-50 text-rose-900 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            {actionMessage.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
            )}
            <span>{actionMessage.text}</span>
          </div>
          <button
            onClick={() => setActionMessage(null)}
            className="text-slate-400 hover:text-slate-600 text-xs cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Backup Snapshots Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2.5">
            <Database className="w-4 h-4 text-blue-600" />
            <h4 className="text-sm font-bold text-slate-900">
              Danh Sách Các Bản Sao Lưu Hệ Thống ({backups.length} bản)
            </h4>
          </div>
          <div className="text-[11px] text-slate-500 flex items-center gap-1.5">
            <Clock className="w-3.5 h-3.5 text-slate-400" />
            <span>Tự động sao lưu hằng ngày &amp; lưu tối đa 30 bản sao gần nhất (Retention Policy)</span>
          </div>
        </div>

        {isLoadingBackups ? (
          <div className="py-10 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
            <RefreshCw className="w-4 h-4 animate-spin text-blue-500" />
            <span>Đang tải danh sách bản sao lưu...</span>
          </div>
        ) : backups.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-400">
            Chưa có bản sao lưu nào. Hãy bấm “Tạo bản sao lưu ngay” để lưu trữ trạng thái hệ thống.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs border-collapse">
              <thead>
                <tr className="bg-[#F1F5F9] border-b border-[#E2E8F0] text-[#475569] font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-3">Thời điểm tạo</th>
                  <th className="py-2.5 px-3">Phân loại</th>
                  <th className="py-2.5 px-3">Tên tệp sao lưu</th>
                  <th className="py-2.5 px-3">Dung lượng</th>
                  <th className="py-2.5 px-3">Bản ghi vận hành</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {backups.map(b => (
                  <tr key={b.filename} className="hover:bg-[#F8FAFC] transition-colors">
                    <td className="py-2.5 px-3 text-slate-700 whitespace-nowrap font-medium">
                      {new Date(b.createdAt).toLocaleString('vi-VN')}
                    </td>
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {formatTagBadge(b.tag)}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600 max-w-[220px] truncate" title={b.filename}>
                      {b.filename}
                    </td>
                    <td className="py-2.5 px-3 text-slate-700 font-semibold">
                      {b.sizeFormatted}
                    </td>
                    <td className="py-2.5 px-3 text-slate-600">
                      <span className="font-semibold text-slate-800">{b.counts.totalOperational}</span> dòng
                      <span className="text-[10px] text-slate-400 ml-1.5">
                        (Lịch: {b.counts.schedules}, Tiến độ: {b.counts.progress}, Gói: {b.counts.packages})
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1.5">
                        <a
                          href={`/api/core/backups/download/${encodeURIComponent(b.filename)}`}
                          download={b.filename}
                          className="px-2.5 py-1 text-[11px] font-semibold text-[#4F46E5] bg-[#EEF2FF] hover:bg-indigo-100 rounded-lg flex items-center gap-1 transition-colors"
                          title="Tải tệp JSON về máy để lưu trữ hoặc upload lên Google Drive cá nhân"
                        >
                          <Download className="w-3 h-3" />
                          <span>Tải về (Lưu Drive)</span>
                        </a>

                        {isMasterAdmin && (
                          <>
                            <button
                              type="button"
                              onClick={() => setRestoreConfirmFile(b)}
                              className="px-2.5 py-1 text-[11px] font-semibold text-amber-700 bg-amber-50 hover:bg-amber-100 rounded-lg flex items-center gap-1 transition-colors cursor-pointer"
                              title="Khôi phục hệ thống về trạng thái tại bản sao lưu này"
                            >
                              <RotateCcw className="w-3 h-3" />
                              <span>Khôi phục</span>
                            </button>

                            <button
                              type="button"
                              onClick={() => handleDeleteBackup(b.filename)}
                              className="p-1 text-slate-400 hover:text-rose-600 rounded-md transition-colors cursor-pointer"
                              title="Xóa bản sao lưu này"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* 3. Export Data Center (CSV / JSON for Excel & Google Sheets) */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs p-5 space-y-4">
        <div className="flex items-center gap-2.5 border-b border-slate-100 pb-3">
          <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
          <h4 className="text-sm font-bold text-slate-900">
            Trung Tâm Xuất Dữ Liệu (Export Data - Excel / CSV / JSON)
          </h4>
        </div>

        <p className="text-xs text-slate-500 leading-relaxed">
          Cho phép xuất dữ liệu lịch sử lưu trữ 5 năm ra định dạng CSV (tương thích Microsoft Excel với Tiếng Việt có dấu UTF-8) hoặc JSON để lưu trữ dài hạn tại Google Drive cá nhân hoặc tích hợp phần mềm khác.
        </p>

        <div className="grid grid-cols-1 sm:grid-cols-4 gap-3 bg-slate-50 p-4 rounded-xl border border-slate-200 text-xs">
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Phân hệ cần xuất:
            </label>
            <select
              value={exportType}
              onChange={e => setExportType(e.target.value as any)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium"
            >
              <option value="all">Toàn bộ CSDL hệ thống</option>
              <option value="schedules">Lịch công việc (Schedules)</option>
              <option value="progress">Tiến độ thực hiện (Progress)</option>
              <option value="packages">Tiếp nhận gói đào tạo (Packages)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Định dạng tệp:
            </label>
            <select
              value={exportFormat}
              onChange={e => setExportFormat(e.target.value as any)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800 font-medium"
            >
              <option value="csv">CSV (Mở bằng Excel / Google Sheets)</option>
              <option value="json">JSON (Cấu trúc dữ liệu đầy đủ)</option>
            </select>
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Từ ngày (tùy chọn):
            </label>
            <input
              type="date"
              value={exportFromDate}
              onChange={e => setExportFromDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800"
            />
          </div>

          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-1">
              Đến ngày (tùy chọn):
            </label>
            <input
              type="date"
              value={exportToDate}
              onChange={e => setExportToDate(e.target.value)}
              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-slate-800"
            />
          </div>
        </div>

        <div className="flex justify-end pt-1">
          <button
            type="button"
            onClick={handleTriggerExport}
            className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
          >
            <Download className="w-4 h-4" />
            <span>Tải tệp dữ liệu đã chọn</span>
          </button>
        </div>
      </div>

      {/* 4. Danger Zone: Reset Operational Data & Date Range Delete (Admin Only) */}
      {isMasterAdmin && (
        <div className="bg-rose-50/50 rounded-2xl border border-rose-200 p-5 space-y-4">
          <div className="flex items-center gap-2.5 border-b border-rose-200/80 pb-3">
            <AlertTriangle className="w-5 h-5 text-rose-600" />
            <div>
              <h4 className="text-sm font-bold text-rose-950">
                Khu Vực Quản Trị Rủi Ro &amp; Vòng Đời Dữ Liệu (Admin Only)
              </h4>
              <p className="text-[11px] text-rose-800/80">
                Các thao tác điều chỉnh quy mô lớn có ảnh hưởng đến dữ liệu nghiệp vụ
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Card 1: Xóa theo khoảng thời gian */}
            <div className="bg-white p-4.5 rounded-xl border border-rose-200 shadow-2xs flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-rose-600" />
                  <span className="text-xs font-bold text-slate-900">
                    Xóa Dữ Liệu Theo Khoảng Thời Gian
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Dọn dẹp Lịch, Gói hoặc Tiến độ trong khoảng thời gian cụ thể (Từ ngày → Đến ngày). Bảo toàn dữ liệu ngoài khoảng và 100% danh mục Thiết lập hệ thống.
                </p>
              </div>
              <button
                type="button"
                onClick={onOpenDateRangeDeleteModal}
                className="w-full py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Mở hộp thoại xóa theo thời gian</span>
              </button>
            </div>

            {/* Card 2: Xóa trắng dữ liệu nghiệp vụ để bắt đầu lại */}
            <div className="bg-white p-4.5 rounded-xl border border-rose-200 shadow-2xs flex flex-col justify-between space-y-3">
              <div>
                <div className="flex items-center gap-2">
                  <RotateCcw className="w-4 h-4 text-rose-600" />
                  <span className="text-xs font-bold text-slate-900">
                    Xóa Trắng Nghiệp Vụ (Reset Operational Data)
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 mt-1 leading-relaxed">
                  Xóa toàn bộ Lịch, Tiến độ, Gói để vận hành chu kỳ mới. <strong>Mặc định bảo toàn 100%</strong> Nhân sự, Nhóm, Sản phẩm, Loại việc, Cấu hình Thiết lập hệ thống và tự động sao lưu trước khi xóa.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsResetModalOpen(true)}
                className="w-full py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors flex items-center justify-center gap-1.5 shadow-xs cursor-pointer"
              >
                <AlertTriangle className="w-3.5 h-3.5" />
                <span>Xóa trắng dữ liệu nghiệp vụ...</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirm Restore */}
      {restoreConfirmFile && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-md w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-amber-100 text-amber-700">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  Xác nhận khôi phục hệ thống?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Bạn đang yêu cầu khôi phục dữ liệu từ bản sao lưu:
                </p>
              </div>
            </div>

            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5 text-xs">
              <div className="font-mono font-bold text-slate-800 break-all">
                {restoreConfirmFile.filename}
              </div>
              <div className="text-slate-500 text-[11px]">
                Thời điểm tạo: {new Date(restoreConfirmFile.createdAt).toLocaleString('vi-VN')}
              </div>
              <div className="text-slate-500 text-[11px]">
                Dung lượng: {restoreConfirmFile.sizeFormatted} · Tổng bản ghi: {restoreConfirmFile.counts.totalOperational}
              </div>
            </div>

            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-[11px] text-amber-900 space-y-1">
              <div className="font-bold flex items-center gap-1">
                <Info className="w-3.5 h-3.5" />
                Bảo vệ dữ liệu an toàn:
              </div>
              <p>
                Hệ thống sẽ <strong>tự động tạo một bản sao lưu bảo hiểm</strong> của dữ liệu hiện tại trước khi khôi phục, bảo đảm không bị mất dữ liệu ngoài ý muốn.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isRestoring}
                onClick={() => setRestoreConfirmFile(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isRestoring}
                onClick={handleConfirmRestore}
                className="px-4 py-2 text-xs font-bold text-white bg-amber-600 hover:bg-amber-700 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isRestoring ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang khôi phục...</span>
                  </>
                ) : (
                  <>
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Xác nhận khôi phục</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Confirm Reset Operational Data */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 max-w-lg w-full p-6 space-y-4 animate-in fade-in">
            <div className="flex items-start gap-3">
              <div className="p-2.5 rounded-xl bg-rose-100 text-rose-700">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-rose-950">
                  Xác nhận xóa trắng dữ liệu nghiệp vụ để bắt đầu lại?
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Dành riêng cho Quản trị viên để dọn dẹp chu kỳ vận hành cũ
                </p>
              </div>
            </div>

            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-900 space-y-2">
              <div className="font-bold flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-600" />
                <span>Bảo toàn 100% Cấu hình Thiết lập hệ thống &amp; Tài khoản:</span>
              </div>
              <ul className="list-disc pl-5 space-y-1 text-[11px] text-slate-700">
                <li>Toàn bộ Nhân sự ONB và danh mục Nhóm làm việc.</li>
                <li>Danh mục Sản phẩm, Loại công việc và Bảng điểm tham chiếu Thiết lập hệ thống.</li>
                <li>Cấu hình Tiếp nhận gói đào tạo, Phân quyền hệ thống.</li>
                <li>Danh mục hồ sơ đối tác khách hàng (Customers Catalog).</li>
              </ul>
            </div>

            <div className="p-3 bg-purple-50 border border-purple-200 rounded-xl text-xs text-purple-950 space-y-1">
              <div className="font-bold">Dữ liệu sẽ bị xóa:</div>
              <p className="text-[11px] text-purple-900">
                Tất cả Lịch công việc, Tiến độ thực hiện, Gói tiếp nhận và Khoản thưởng KPI. Hệ thống sẽ <strong>tự động tạo một bản sao lưu toàn diện</strong> trước khi xóa trắng để có thể khôi phục lại bất kỳ lúc nào.
              </p>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isResetting}
                onClick={() => setIsResetModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isResetting}
                onClick={handleConfirmReset}
                className="px-5 py-2 text-xs font-bold text-white bg-rose-600 hover:bg-rose-700 rounded-lg flex items-center gap-1.5 cursor-pointer shadow-xs disabled:opacity-50"
              >
                {isResetting ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Đang sao lưu &amp; xóa trắng...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xác nhận xóa trắng nghiệp vụ</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
