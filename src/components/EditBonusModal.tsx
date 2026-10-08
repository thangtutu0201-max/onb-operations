import React, { useState } from 'react';
import { ScorecardRow } from '../types';
import { Award, DollarSign, ShieldAlert } from 'lucide-react';

interface EditBonusModalProps {
  row: ScorecardRow;
  monthYear: string;
  onClose: () => void;
  onSave: (amount: number, reason: string) => Promise<void>;
}

export const EditBonusModal: React.FC<EditBonusModalProps> = ({
  row,
  monthYear,
  onClose,
  onSave
}) => {
  const [amount, setAmount] = useState<number>(row.finalBonus ?? row.manualBonus ?? 0);
  const [reason, setReason] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (amount < 0) {
      setError('Khoản thưởng không được là số âm.');
      return;
    }

    setIsSubmitting(true);
    try {
      await onSave(amount, reason);
      onClose();
    } catch (err: any) {
      setError(err.message || 'Lỗi khi lưu khoản thưởng');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
        <div className="flex items-center justify-between border-b border-slate-100 pb-3">
          <div>
            <h3 className="font-semibold text-slate-900 text-sm">
              Cập Nhật Khoản Thưởng Tháng {monthYear}
            </h3>
            <span className="text-xs text-slate-500">
              Nhân sự: <strong>{row.fullName}</strong> ({row.onbCode})
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400">✕</button>
        </div>

        {error && (
          <div className="p-2.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3.5 text-xs">
          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Số tiền thưởng (VNĐ) *
            </label>
            <input
              type="number"
              step="100000"
              min="0"
              value={amount}
              onChange={e => setAmount(Math.max(0, parseInt(e.target.value) || 0))}
              className="w-full border border-slate-300 rounded-md p-2 font-mono-numbers text-base font-bold text-amber-900"
              required
            />
            <span className="text-[11px] text-slate-400 mt-1 block">
              Nhập tay độc lập · Điểm KPI thay đổi không làm ảnh hưởng khoản thưởng này.
            </span>
          </div>

          <div>
            <label className="block font-medium text-slate-700 mb-1">
              Lý do khen thưởng / Ghi chú
            </label>
            <input
              type="text"
              placeholder="VD: Thưởng vượt chỉ tiêu TVTK, Hỗ trợ dự án trọng điểm..."
              value={reason}
              onChange={e => setReason(e.target.value)}
              className="w-full border border-slate-300 rounded-md p-2"
            />
          </div>

          <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-[11px] text-amber-900">
            Khoản thưởng được hiển thị công khai cho toàn bộ thành viên trong phòng ONB xem theo quy chế minh bạch.
          </div>

          <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
            <button
              type="button"
              onClick={onClose}
              className="px-3.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
            >
              Hủy
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-4 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white text-xs font-semibold rounded-lg shadow-xs cursor-pointer transition-colors disabled:opacity-50"
            >
              {isSubmitting ? 'Đang lưu...' : 'Lưu khoản thưởng'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
