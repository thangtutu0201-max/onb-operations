import React, { useState, useEffect, useMemo } from 'react';
import {
  AuthorizedAccount,
  CurrentUserSession,
  ONBMember,
  UserAccessRole,
  UserAccessStatus
} from '../types';
import { api } from '../services/api';
import {
  Shield,
  ShieldCheck,
  Plus,
  Edit2,
  Trash2,
  Lock,
  Unlock,
  CheckCircle2,
  XCircle,
  Search,
  Filter,
  UserCheck,
  AlertCircle,
  Mail,
  User,
  Clock,
  Key,
  RefreshCw,
  Info
} from 'lucide-react';

interface AccessControlSubTabProps {
  session: CurrentUserSession | null;
  members: ONBMember[];
  showToast?: (msg: string, type?: 'success' | 'error' | 'info') => void;
}

const FIRST_ADMIN_EMAIL = 'thangtutu0201@gmail.com';

export const AccessControlSubTab: React.FC<AccessControlSubTabProps> = ({
  session,
  members,
  showToast
}) => {
  const [accounts, setAccounts] = useState<AuthorizedAccount[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'ACTIVE' | 'LOCKED'>('ALL');

  // Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<AuthorizedAccount | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const [formData, setFormData] = useState<{
    email: string;
    onbCode: string;
    role: UserAccessRole;
    status: UserAccessStatus;
    canEditBonus: boolean;
    canManageAllocation: boolean;
  }>({
    email: '',
    onbCode: members[0]?.code || 'DTHANG',
    role: 'user',
    status: 'ACTIVE',
    canEditBonus: false,
    canManageAllocation: false
  });

  // Delete Confirm State
  const [deleteTarget, setDeleteTarget] = useState<AuthorizedAccount | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  const isMasterAdmin = session?.isMasterAdmin || session?.role === 'admin';

  const loadAccounts = async () => {
    setIsLoading(true);
    try {
      const res = await api.getAccounts();
      setAccounts(res.accounts || []);
    } catch (err: any) {
      console.error('Failed to load authorized accounts', err);
      showToast?.(err.message || 'Lỗi tải danh sách tài khoản phân quyền.', 'error');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadAccounts();
  }, []);

  const openAddModal = () => {
    setEditingAccount(null);
    setFormData({
      email: '',
      onbCode: members[0]?.code || 'DTHANG',
      role: 'user',
      status: 'ACTIVE',
      canEditBonus: false,
      canManageAllocation: false
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const openEditModal = (acc: AuthorizedAccount) => {
    setEditingAccount(acc);
    setFormData({
      email: acc.email,
      onbCode: acc.onbCode,
      role: acc.role,
      status: acc.status,
      canEditBonus: Boolean(acc.canEditBonus),
      canManageAllocation: Boolean(acc.canManageAllocation)
    });
    setFormError(null);
    setIsModalOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanEmail = formData.email.trim().toLowerCase();
    if (!cleanEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      setFormError('Vui lòng nhập địa chỉ email Google hợp lệ.');
      return;
    }

    if (!formData.onbCode) {
      setFormError('Vui lòng chọn nhân sự liên kết trong hệ thống.');
      return;
    }

    setIsSubmitting(true);
    try {
      if (editingAccount) {
        await api.updateAccount(editingAccount.id, {
          onbCode: formData.onbCode,
          role: formData.role,
          status: formData.status,
          canEditBonus: formData.canEditBonus,
          canManageAllocation: formData.canManageAllocation
        });
        showToast?.(`Đã cập nhật tài khoản ${cleanEmail} thành công!`, 'success');
      } else {
        await api.createAccount({
          email: cleanEmail,
          onbCode: formData.onbCode,
          role: formData.role,
          status: formData.status,
          canEditBonus: formData.canEditBonus,
          canManageAllocation: formData.canManageAllocation
        });
        showToast?.(`Đã cấp quyền sử dụng cho email ${cleanEmail}!`, 'success');
      }
      setIsModalOpen(false);
      await loadAccounts();
    } catch (err: any) {
      setFormError(err.message || 'Lỗi khi lưu tài khoản.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleStatus = async (acc: AuthorizedAccount) => {
    if (acc.email.toLowerCase() === FIRST_ADMIN_EMAIL.toLowerCase()) {
      showToast?.('Không thể khóa tài khoản Quản trị viên chính ban đầu.', 'error');
      return;
    }
    if (acc.email.toLowerCase() === session?.email.toLowerCase()) {
      showToast?.('Bạn không thể tự khóa tài khoản của chính mình.', 'error');
      return;
    }

    const nextStatus: UserAccessStatus = acc.status === 'ACTIVE' ? 'LOCKED' : 'ACTIVE';
    try {
      await api.updateAccount(acc.id, { status: nextStatus });
      showToast?.(
        nextStatus === 'ACTIVE'
          ? `Đã kích hoạt cho phép ${acc.email} sử dụng hệ thống.`
          : `Đã khóa tài khoản ${acc.email}. Mọi truy cập tiếp theo sẽ bị từ chối.`,
        'success'
      );
      await loadAccounts();
    } catch (err: any) {
      showToast?.(err.message || 'Lỗi đổi trạng thái tài khoản.', 'error');
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;

    if (deleteTarget.email.toLowerCase() === FIRST_ADMIN_EMAIL.toLowerCase()) {
      showToast?.('Không thể xóa tài khoản Quản trị viên chính ban đầu.', 'error');
      setDeleteTarget(null);
      return;
    }

    if (deleteTarget.email.toLowerCase() === session?.email.toLowerCase()) {
      showToast?.('Bạn không thể tự xóa tài khoản của chính mình.', 'error');
      setDeleteTarget(null);
      return;
    }

    setIsDeleting(true);
    try {
      await api.deleteAccount(deleteTarget.id);
      showToast?.(`Đã xóa tài khoản ${deleteTarget.email} khỏi danh sách cấp quyền.`, 'success');
      setDeleteTarget(null);
      await loadAccounts();
    } catch (err: any) {
      showToast?.(err.message || 'Lỗi khi xóa tài khoản.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  const filteredAccounts = useMemo(() => {
    return accounts.filter(acc => {
      const matchSearch =
        acc.email.toLowerCase().includes(searchQuery.toLowerCase()) ||
        acc.onbCode.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (acc.displayName && acc.displayName.toLowerCase().includes(searchQuery.toLowerCase()));

      const matchStatus =
        statusFilter === 'ALL' || acc.status === statusFilter;

      return matchSearch && matchStatus;
    });
  }, [accounts, searchQuery, statusFilter]);

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-5">
      {/* Header Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600" />
            Quản lý Quyền truy cập &amp; Kích hoạt Tài khoản
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Chỉ quản trị viên được phép thao tác · Xác thực danh tính qua Google Sign-In &amp; ID Token
          </p>
        </div>

        {isMasterAdmin && (
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={loadAccounts}
              disabled={isLoading}
              title="Tải lại danh sách"
              className="p-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-slate-200 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
            </button>
            <button
              type="button"
              onClick={openAddModal}
              className="px-3.5 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Cấp quyền tài khoản mới</span>
            </button>
          </div>
        )}
      </div>

      {/* Security Principles Banner */}
      <div className="p-4 bg-indigo-50/70 border border-indigo-200/80 rounded-xl text-xs text-indigo-950 space-y-2">
        <div className="font-bold flex items-center gap-2 text-indigo-900">
          <Info className="w-4 h-4 text-indigo-600 shrink-0" />
          <span>Nguyên tắc bảo vệ &amp; phân quyền truy cập:</span>
        </div>
        <ul className="list-disc pl-5 space-y-1 text-slate-700 leading-relaxed text-xs">
          <li>
            <strong>Xác minh ID Token thực tế:</strong> Máy chủ giải mã và kiểm tra chữ ký số ID token phát hành từ Google/Firebase, ngăn chặn hoàn toàn việc giả mạo email hoặc tên người dùng qua header hoặc giao diện.
          </li>
          <li>
            <strong>Duyệt danh sách trắng (Whitelist):</strong> Chỉ tài khoản Google có email trùng khớp chính xác với danh sách được duyệt và trạng thái <strong>Được phép</strong> mới có thể đọc/ghi dữ liệu.
          </li>
          <li>
            <strong>Khóa tức thì:</strong> Khi tài khoản bị chuyển sang <strong>Đã khóa</strong>, máy chủ sẽ từ chối mọi yêu cầu đọc/thêm/sửa/xóa ngay lập tức.
          </li>
          <li>
            <strong>Liên kết Firebase UID ổn định:</strong> Sau lần đăng nhập hợp lệ đầu tiên, mã định danh Firebase UID duy nhất sẽ được tự động liên kết với tài khoản.
          </li>
        </ul>
      </div>

      {/* Filter and Search Bar */}
      <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-72">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Tìm theo email Google, mã nhân sự, họ tên..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-slate-500 hidden sm:inline">Trạng thái:</span>
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as any)}
              className="px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-700 cursor-pointer focus:outline-hidden"
            >
              <option value="ALL">Tất cả ({accounts.length})</option>
              <option value="ACTIVE">
                Được phép ({accounts.filter(a => a.status === 'ACTIVE').length})
              </option>
              <option value="LOCKED">
                Đã khóa ({accounts.filter(a => a.status === 'LOCKED').length})
              </option>
            </select>
          </div>
        </div>

        <div className="text-xs text-slate-500">
          Hiển thị <strong>{filteredAccounts.length}</strong> / {accounts.length} tài khoản
        </div>
      </div>

      {/* Accounts Table */}
      <div className="overflow-x-auto border border-slate-200 rounded-xl">
        <table className="w-full text-left border-collapse text-xs">
          <thead>
            <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold uppercase text-[11px]">
              <th className="py-3 px-3.5 w-12 text-center">STT</th>
              <th className="py-3 px-3.5 min-w-[200px]">Email Google</th>
              <th className="py-3 px-3.5 min-w-[170px]">Nhân viên liên kết</th>
              <th className="py-3 px-3.5 w-28 text-center">Vai trò</th>
              <th className="py-3 px-3.5 min-w-[140px]">Quyền nghiệp vụ</th>
              <th className="py-3 px-3.5 w-32 text-center">Trạng thái</th>
              <th className="py-3 px-3.5 min-w-[150px]">Firebase UID</th>
              <th className="py-3 px-3.5 min-w-[140px]">Đăng nhập gần nhất</th>
              {isMasterAdmin && <th className="py-3 px-3.5 w-24 text-right">Thao tác</th>}
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 bg-white">
            {filteredAccounts.map((acc, index) => {
              const isFirstAdmin = acc.email.toLowerCase() === FIRST_ADMIN_EMAIL.toLowerCase();
              const isSelf = acc.email.toLowerCase() === session?.email.toLowerCase();
              const member = members.find(m => m.code === acc.onbCode);

              return (
                <tr key={acc.id} className="hover:bg-slate-50/70 transition-colors">
                  <td className="py-3 px-3.5 text-center font-mono text-slate-500">
                    {index + 1}
                  </td>

                  {/* Email Google */}
                  <td className="py-3 px-3.5">
                    <div className="flex items-center gap-2">
                      <Mail className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-mono font-semibold text-slate-900 break-all">
                        {acc.email}
                      </span>
                      {isFirstAdmin && (
                        <span
                          title="Quản trị viên chính ban đầu được thiết lập tại máy chủ"
                          className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 shrink-0"
                        >
                          ★ Root Admin
                        </span>
                      )}
                      {isSelf && (
                        <span className="px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-blue-50 text-blue-700 border border-blue-200 shrink-0">
                          Bạn
                        </span>
                      )}
                    </div>
                  </td>

                  {/* Linked Employee */}
                  <td className="py-3 px-3.5">
                    <div className="flex items-center gap-1.5">
                      <User className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span className="font-medium text-slate-900">
                        {member?.fullName || acc.displayName || acc.onbCode}
                      </span>
                      <span className="font-mono text-[11px] bg-slate-100 px-1.5 py-0.5 rounded-md text-slate-600 font-semibold">
                        {acc.onbCode}
                      </span>
                    </div>
                  </td>

                  {/* Role */}
                  <td className="py-3 px-3.5 text-center">
                    {acc.role === 'admin' ? (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-indigo-50 text-indigo-700 border border-indigo-200">
                        <Shield className="w-3 h-3 text-indigo-600" /> Quản trị viên
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                        Người dùng
                      </span>
                    )}
                  </td>

                  {/* Special Permissions */}
                  <td className="py-3 px-3.5">
                    {acc.role === 'admin' ? (
                      <span className="text-slate-400 text-[11px]">Toàn quyền hệ thống</span>
                    ) : (
                      <div className="flex flex-wrap gap-1 text-[11px]">
                        {acc.canEditBonus && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-50 text-emerald-800 border border-emerald-200 font-medium">
                            Sửa thưởng
                          </span>
                        )}
                        {acc.canManageAllocation && (
                          <span className="px-1.5 py-0.5 rounded bg-blue-50 text-blue-800 border border-blue-200 font-medium">
                            Quản lý phân bổ
                          </span>
                        )}
                        {!acc.canEditBonus && !acc.canManageAllocation && (
                          <span className="text-slate-400 italic">Tiêu chuẩn</span>
                        )}
                      </div>
                    )}
                  </td>

                  {/* Status (Active / Locked) */}
                  <td className="py-3 px-3.5 text-center">
                    {acc.status === 'ACTIVE' ? (
                      <button
                        type="button"
                        disabled={isFirstAdmin || isSelf}
                        onClick={() => handleToggleStatus(acc)}
                        title={
                          isFirstAdmin
                            ? 'Không thể khóa Root Admin'
                            : isSelf
                            ? 'Không thể tự khóa tài khoản'
                            : 'Bấm để khóa tài khoản'
                        }
                        className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200 transition-colors ${
                          isFirstAdmin || isSelf ? 'opacity-80 cursor-default' : 'hover:bg-emerald-100 cursor-pointer'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                        Được phép
                      </button>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleToggleStatus(acc)}
                        title="Bấm để kích hoạt lại quyền"
                        className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-semibold bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 transition-colors cursor-pointer"
                      >
                        <Lock className="w-3.5 h-3.5 text-rose-600" />
                        Đã khóa
                      </button>
                    )}
                  </td>

                  {/* Firebase UID linkage */}
                  <td className="py-3 px-3.5">
                    {acc.firebaseUid ? (
                      <div className="font-mono text-[10px] text-slate-600 truncate max-w-[140px]" title={acc.firebaseUid}>
                        <span className="text-emerald-600 font-bold">✓</span> {acc.firebaseUid}
                      </div>
                    ) : (
                      <span className="text-amber-700 text-[11px] bg-amber-50 px-2 py-0.5 rounded border border-amber-200">
                        Chờ đăng nhập
                      </span>
                    )}
                  </td>

                  {/* Last Login */}
                  <td className="py-3 px-3.5 text-slate-500 font-mono text-[11px]">
                    {acc.lastLoginAt ? (
                      new Date(acc.lastLoginAt).toLocaleString('vi-VN', {
                        timeZone: 'Asia/Ho_Chi_Minh',
                        day: '2-digit',
                        month: '2-digit',
                        year: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit'
                      })
                    ) : (
                      <span className="text-slate-400 italic">Chưa đăng nhập</span>
                    )}
                  </td>

                  {/* Actions */}
                  {isMasterAdmin && (
                    <td className="py-3 px-3.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          type="button"
                          onClick={() => openEditModal(acc)}
                          title="Chỉnh sửa tài khoản"
                          className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-slate-100 rounded-md transition-colors cursor-pointer"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          disabled={isFirstAdmin || isSelf}
                          onClick={() => setDeleteTarget(acc)}
                          title={
                            isFirstAdmin
                              ? 'Không thể xóa Root Admin'
                              : isSelf
                              ? 'Không thể tự xóa tài khoản của bạn'
                              : 'Xóa tài khoản khỏi danh sách cấp quyền'
                          }
                          className={`p-1.5 rounded-md transition-colors ${
                            isFirstAdmin || isSelf
                              ? 'text-slate-300 cursor-not-allowed'
                              : 'text-slate-500 hover:text-rose-600 hover:bg-rose-50 cursor-pointer'
                          }`}
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  )}
                </tr>
              );
            })}

            {filteredAccounts.length === 0 && (
              <tr>
                <td colSpan={9} className="py-8 text-center text-slate-400">
                  {searchQuery || statusFilter !== 'ALL'
                    ? 'Không tìm thấy tài khoản nào khớp với bộ lọc.'
                    : 'Chưa có tài khoản nào được cấp quyền.'}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {/* MODAL: CREATE / EDIT ACCOUNT */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-lg w-full overflow-hidden border border-slate-200">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ShieldCheck className="w-4.5 h-4.5 text-indigo-600" />
                {editingAccount ? `Chỉnh sửa tài khoản: ${editingAccount.email}` : 'Cấp quyền tài khoản Google mới'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 text-sm p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSubmit} className="p-6 space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-700 flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Email Google */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Email Google của nhân sự *
                </label>
                <input
                  type="email"
                  required
                  disabled={Boolean(editingAccount)}
                  placeholder="VD: nhanvien.onb@gmail.com"
                  value={formData.email}
                  onChange={e => setFormData({ ...formData, email: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg font-mono text-xs focus:ring-2 focus:ring-indigo-500 focus:outline-hidden disabled:bg-slate-100 disabled:text-slate-500"
                />
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  Nhập chính xác email Google cá nhân hoặc doanh nghiệp mà nhân sự dùng để bấm "Đăng nhập bằng Google".
                </span>
              </div>

              {/* Linked ONB Member */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nhân viên liên kết trong hệ thống ONB *
                </label>
                <select
                  required
                  value={formData.onbCode}
                  onChange={e => setFormData({ ...formData, onbCode: e.target.value })}
                  className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
                >
                  {members.map(m => (
                    <option key={m.code} value={m.code}>
                      {m.fullName} ({m.code}) - {m.currentGroup} {m.isActive ? '' : '(Ngừng hoạt động)'}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-400 mt-0.5 block">
                  Liên kết tài khoản Google này với hồ sơ nhân sự để ghi nhận lịch làm việc, tiến độ và phân bổ.
                </span>
              </div>

              {/* Role & Status */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Vai trò trong hệ thống *
                  </label>
                  <select
                    value={formData.role}
                    disabled={editingAccount?.email.toLowerCase() === FIRST_ADMIN_EMAIL.toLowerCase()}
                    onChange={e => setFormData({ ...formData, role: e.target.value as UserAccessRole })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
                  >
                    <option value="user">Người dùng (Nhân viên)</option>
                    <option value="admin">Quản trị viên (Admin)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Trạng thái cấp quyền *
                  </label>
                  <select
                    value={formData.status}
                    disabled={editingAccount?.email.toLowerCase() === FIRST_ADMIN_EMAIL.toLowerCase()}
                    onChange={e => setFormData({ ...formData, status: e.target.value as UserAccessStatus })}
                    className="w-full px-3 py-2 bg-white border border-slate-300 rounded-lg text-xs font-medium focus:ring-2 focus:ring-indigo-500 focus:outline-hidden cursor-pointer"
                  >
                    <option value="ACTIVE">Được phép (Hoạt động)</option>
                    <option value="LOCKED">Đã khóa (Chặn truy cập)</option>
                  </select>
                </div>
              </div>

              {/* Special Permissions (if Role is 'user') */}
              {formData.role === 'user' && (
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-lg space-y-2">
                  <span className="font-semibold text-slate-700 block">
                    Quyền hạn bổ sung (Tùy chọn):
                  </span>
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={formData.canEditBonus}
                      onChange={e => setFormData({ ...formData, canEditBonus: e.target.checked })}
                      className="rounded-xs border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Cho phép điều chỉnh Thưởng hiệu quả (Tab Thưởng)</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={formData.canManageAllocation}
                      onChange={e => setFormData({ ...formData, canManageAllocation: e.target.checked })}
                      className="rounded-xs border-slate-300 text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>Cho phép quản lý Phân bổ đào tạo tập trung</span>
                  </label>
                </div>
              )}

              {/* Actions Buttons */}
              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg font-medium cursor-pointer"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmitting}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-semibold rounded-lg shadow-xs cursor-pointer disabled:opacity-60 transition-colors"
                >
                  {isSubmitting ? 'Đang lưu...' : editingAccount ? 'Lưu thay đổi' : 'Cấp quyền sử dụng'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE CONFIRM */}
      {deleteTarget && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-5 space-y-4 border border-slate-200">
            <div className="flex items-center gap-2 text-rose-600 border-b border-rose-100 pb-3">
              <AlertCircle className="w-5 h-5 shrink-0" />
              <h3 className="font-bold text-slate-900 text-sm">
                Xóa quyền truy cập tài khoản
              </h3>
            </div>

            <p className="text-xs text-slate-600 leading-relaxed">
              Bạn có chắc chắn muốn xóa quyền truy cập của email{' '}
              <strong className="font-mono text-slate-900">{deleteTarget.email}</strong> (Nhân sự:{' '}
              {deleteTarget.onbCode})?
            </p>
            <p className="text-[11px] text-amber-700 bg-amber-50 p-2.5 rounded-lg border border-amber-200">
              Sau khi xóa, tài khoản này sẽ bị từ chối truy cập ngay lập tức nếu chưa được cấp quyền lại. Toàn bộ lịch làm việc và KPI đã ghi nhận trong quá khứ vẫn được bảo toàn nguyên vẹn.
            </p>

            <div className="flex justify-end gap-2 pt-2 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setDeleteTarget(null)}
                className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-lg font-medium cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDelete}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold rounded-lg shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeleting ? 'Đang xóa...' : 'Xóa quyền truy cập'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
