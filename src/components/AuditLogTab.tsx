import React, { useState } from 'react';
import { AuditLog } from '../types';
import { Activity, Search, Shield, Filter, Clock } from 'lucide-react';

interface AuditLogTabProps {
  logs: AuditLog[];
}

export const AuditLogTab: React.FC<AuditLogTabProps> = ({ logs }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedEntity, setSelectedEntity] = useState('');

  const filteredLogs = logs.filter(log => {
    if (selectedEntity && log.entity !== selectedEntity) return false;
    if (searchTerm) {
      const term = searchTerm.toLowerCase();
      const matchDesc = log.description.toLowerCase().includes(term);
      const matchUser = log.userName.toLowerCase().includes(term);
      const matchCode = log.onbCode.toLowerCase().includes(term);
      if (!matchDesc && !matchUser && !matchCode) return false;
    }
    return true;
  });

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs">
        <div className="flex items-center gap-2">
          <Activity className="w-5 h-5 text-[#4F46E5]" />
          <h2 className="text-base font-semibold text-slate-900">
            Nhật Ký Thay Đổi & Truy Vết Hoạt Động (Audit Trail)
          </h2>
        </div>
        <p className="text-xs text-slate-500 mt-1">
          Hệ thống tự động ghi nhận mọi thay đổi về điểm số, tiến độ, gói tiếp nhận, khoản thưởng, phân bổ và Thiết lập hệ thống.
          Mỗi bản ghi lưu trữ định danh người sửa, thời điểm và đối chiếu giá trị trước/sau.
        </p>
      </div>

      {/* Filter Bar */}
      <div className="bg-white p-3.5 rounded-xl border border-slate-200 shadow-xs flex flex-wrap items-center gap-2 text-xs">
        <div className="relative min-w-[200px] flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo nội dung, nhân sự thực hiện..."
            value={searchTerm}
            onChange={e => setSearchTerm(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-[#CBD5E1] rounded-lg focus:border-[#4F46E5] focus:ring-2 focus:ring-[#E0E7FF] focus:outline-hidden"
          />
        </div>

        <select
          value={selectedEntity}
          onChange={e => setSelectedEntity(e.target.value)}
          className="border border-[#CBD5E1] rounded-lg px-2.5 py-1.5 bg-white text-slate-700 focus:border-[#4F46E5] focus:ring-2 focus:ring-[#E0E7FF] focus:outline-hidden"
        >
          <option value="">Tất cả phân hệ</option>
          <option value="SCORE">Điểm số</option>
          <option value="BONUS">Khoản thưởng</option>
          <option value="SCHEDULE">Lịch công việc</option>
          <option value="PROGRESS">Tiến độ thực hiện</option>
          <option value="PACKAGE">Tiếp nhận gói đào tạo</option>
          <option value="ALLOCATION">Lịch đào tạo tập trung</option>
          <option value="CORE">Thiết lập hệ thống</option>
          <option value="MEMBER">Nhân sự</option>
        </select>

        <span className="text-slate-400 ml-auto">
          Tổng số: <strong>{filteredLogs.length}</strong> sự kiện
        </span>
      </div>

      {/* Audit List */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F1F5F9] border-b border-[#E2E8F0] text-[#475569] font-semibold uppercase text-[11px]">
                <th className="py-2.5 px-3 w-40">Thời gian (Việt Nam)</th>
                <th className="py-2.5 px-3 w-28">Hành động</th>
                <th className="py-2.5 px-3 w-28">Phân hệ</th>
                <th className="py-2.5 px-3 w-40">Người thực hiện</th>
                <th className="py-2.5 px-3">Chi tiết thay đổi</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#E2E8F0]">
              {filteredLogs.map(log => (
                <tr key={log.id} className="hover:bg-[#F8FAFC] transition-colors">
                  <td className="py-2.5 px-3 font-mono text-slate-600 whitespace-nowrap">
                    {new Date(log.timestamp).toLocaleString('vi-VN', {
                      timeZone: 'Asia/Ho_Chi_Minh',
                      year: 'numeric',
                      month: '2-digit',
                      day: '2-digit',
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    })}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <span className={`px-1.5 py-0.5 rounded-xs font-mono font-medium text-[10px] ${
                      log.action === 'CREATE' ? 'bg-emerald-50 text-emerald-800' :
                      log.action === 'UPDATE' ? 'bg-blue-50 text-blue-800' :
                      log.action === 'DELETE' ? 'bg-rose-50 text-rose-800' : 'bg-slate-100 text-slate-800'
                    }`}>
                      {log.action}
                    </span>
                  </td>
                  <td className="py-2.5 px-3 font-mono font-medium text-slate-700 whitespace-nowrap">
                    {log.entity}
                  </td>
                  <td className="py-2.5 px-3 whitespace-nowrap">
                    <div className="font-semibold text-slate-900">{log.userName}</div>
                    <div className="text-[10px] font-mono text-slate-400">{log.onbCode}</div>
                  </td>
                  <td className="py-2.5 px-3 text-slate-800">
                    <div>{log.description}</div>
                    {log.oldValue && log.newValue && (
                      <div className="text-[11px] text-slate-500 mt-1 font-mono bg-slate-50 p-1.5 rounded-xs border border-slate-100">
                        {typeof log.oldValue === 'object' && log.oldValue.recordedScore !== undefined && (
                          <span>Điểm cũ: {log.oldValue.recordedScore} → Điểm mới: {log.newValue.recordedScore}</span>
                        )}
                        {typeof log.oldValue === 'object' && log.oldValue.amount !== undefined && (
                          <span>Thưởng cũ: {log.oldValue.amount?.toLocaleString('vi-VN')} → Mới: {log.newValue.amount?.toLocaleString('vi-VN')} đ</span>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              ))}

              {filteredLogs.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-8 text-center text-slate-400">
                    Chưa có sự kiện nhật ký nào phù hợp với bộ lọc.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
