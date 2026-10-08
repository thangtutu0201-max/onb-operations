import React, { useEffect, useState } from 'react';
import { api } from '../services/api';
import { Eye, FileText, Package, Calendar, Award, AlertCircle } from 'lucide-react';

interface DrilldownModalProps {
  monthYear: string;
  onbCode: string;
  category?: 'DEMO_POC' | 'PACKAGES' | 'TRAINING' | 'ALL';
  onClose: () => void;
  onMonthChange?: (m: string) => void;
}

export const DrilldownModal: React.FC<DrilldownModalProps> = ({
  monthYear: initialMonthYear,
  onbCode,
  category: initialCategory = 'ALL',
  onClose,
  onMonthChange
}) => {
  const [currentMonth, setCurrentMonth] = useState(initialMonthYear);
  const [activeCategory, setActiveCategory] = useState<'ALL' | 'DEMO_POC' | 'PACKAGES' | 'TRAINING'>(initialCategory);
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<any>(null);

  const monthOptions = [
    { val: '2026-12', label: '12/2026' },
    { val: '2026-11', label: '11/2026' },
    { val: '2026-10', label: '10/2026' },
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

  useEffect(() => {
    setLoading(true);
    api.getScorecardDrilldown(currentMonth, onbCode)
      .then(res => {
        setData(res);
        setLoading(false);
      })
      .catch(err => {
        console.error(err);
        setLoading(false);
      });
  }, [currentMonth, onbCode]);

  const handleMonthSelect = (m: string) => {
    setCurrentMonth(m);
    if (onMonthChange) onMonthChange(m);
  };

  const tasks = data?.tasks || [];
  const demoPocTasks = tasks.filter((t: any) => t.category === 'DEMO_POC');
  const trainingTasks = tasks.filter((t: any) => t.category === 'TRAINING' || t.category === 'UNKNOWN');
  const packages = data?.packages || [];

  const summary = data?.summary || {
    scoreDemoPocTienVe: 0,
    scoreReception: 0,
    scoreTraining: 0,
    totalMonthlyScore: 0,
    weightedScore: 0
  };

  const fmtScore = (num: number) => {
    return num.toLocaleString('vi-VN', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  };

  return (
    <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
      <div className="bg-white rounded-lg shadow-xl max-w-4xl w-full p-5 space-y-4 max-h-[90vh] overflow-y-auto text-xs">
        {/* Header with Title and Month Picker */}
        <div className="flex flex-wrap items-center justify-between border-b border-slate-200 pb-3 gap-3">
          <div>
            <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
              <Eye className="w-4 h-4 text-blue-600" />
              Chi Tiết Cấu Thành Điểm: {data?.memberName || onbCode} ({onbCode})
            </h3>
            <span className="text-[11px] text-slate-500">
              Nhóm: <strong>{data?.currentGroup || 'Nhóm 1'}</strong> · Đối chiếu minh bạch các bản ghi cấu thành điểm thành phần
            </span>
          </div>

          <div className="flex items-center gap-2">
            {/* Clear Month Selector */}
            <div className="flex items-center gap-1.5 bg-slate-100 border border-slate-200 px-2.5 py-1 rounded-md">
              <Calendar className="w-3.5 h-3.5 text-slate-500" />
              <select
                value={currentMonth}
                onChange={e => handleMonthSelect(e.target.value)}
                className="bg-transparent font-semibold text-slate-800 focus:outline-hidden cursor-pointer text-xs"
              >
                {monthOptions.map(m => (
                  <option key={m.val} value={m.val}>
                    Tháng {m.label}
                  </option>
                ))}
              </select>
            </div>

            <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-600 rounded">✕</button>
          </div>
        </div>

        {/* Category Selector Tabs */}
        <div className="flex items-center gap-1.5 border-b border-slate-100 pb-2 overflow-x-auto text-xs">
          <button
            onClick={() => setActiveCategory('ALL')}
            className={`px-3 py-1.5 rounded-lg font-medium transition-colors cursor-pointer ${
              activeCategory === 'ALL' ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold border border-indigo-200' : 'bg-slate-100 text-slate-700 hover:bg-slate-200 border border-transparent'
            }`}
          >
            Tất cả thành phần ({summary.totalMonthlyScore}đ)
          </button>

          <button
            onClick={() => setActiveCategory('DEMO_POC')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeCategory === 'DEMO_POC' ? 'bg-blue-700 text-white' : 'bg-blue-50 text-blue-800 hover:bg-blue-100'
            }`}
          >
            <span>DEMO/POC/Tiền về (55%)</span>
            <span className="font-bold font-mono-numbers">({summary.scoreDemoPocTienVe}đ)</span>
          </button>

          <button
            onClick={() => setActiveCategory('PACKAGES')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeCategory === 'PACKAGES' ? 'bg-emerald-700 text-white' : 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
            }`}
          >
            <span>Tiếp nhận gói (40%)</span>
            <span className="font-bold font-mono-numbers">({summary.scoreReception}đ)</span>
          </button>

          <button
            onClick={() => setActiveCategory('TRAINING')}
            className={`px-3 py-1.5 rounded-md font-medium transition-colors flex items-center gap-1.5 ${
              activeCategory === 'TRAINING' ? 'bg-purple-700 text-white' : 'bg-purple-50 text-purple-800 hover:bg-purple-100'
            }`}
          >
            <span>Đào tạo & loại việc khác (5%)</span>
            <span className="font-bold font-mono-numbers">({summary.scoreTraining}đ)</span>
          </button>
        </div>

        {/* Formula Summary Ribbon */}
        <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 grid grid-cols-2 sm:grid-cols-4 gap-3 text-center">
          <div className="bg-white p-2 rounded border border-slate-100">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">A: DEMO/POC/Tiền về</span>
            <div className="text-sm font-bold text-blue-700 font-mono-numbers mt-0.5">
              {fmtScore(summary.scoreDemoPocTienVe)} đ
            </div>
            <span className="text-[10px] text-slate-400">Trọng số 55%</span>
          </div>

          <div className="bg-white p-2 rounded border border-slate-100">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">B: Điểm tiếp nhận</span>
            <div className="text-sm font-bold text-emerald-700 font-mono-numbers mt-0.5">
              {fmtScore(summary.scoreReception)} đ
            </div>
            <span className="text-[10px] text-slate-400">Trọng số 40%</span>
          </div>

          <div className="bg-white p-2 rounded border border-slate-100">
            <span className="text-[10px] text-slate-500 uppercase font-semibold">C: Điểm đào tạo & khác</span>
            <div className="text-sm font-bold text-purple-700 font-mono-numbers mt-0.5">
              {fmtScore(summary.scoreTraining)} đ
            </div>
            <span className="text-[10px] text-slate-400">Trọng số 5%</span>
          </div>

          <div className="bg-amber-50/70 p-2 rounded border border-amber-200/80">
            <span className="text-[10px] text-amber-800 uppercase font-semibold">Điểm nhân trọng số (W)</span>
            <div className="text-sm font-bold text-amber-900 font-mono-numbers mt-0.5">
              {fmtScore(summary.weightedScore)} đ
            </div>
            <span className="text-[10px] text-amber-700 font-mono-numbers">
              Tổng thực hiện (T): {fmtScore(summary.totalMonthlyScore)}đ
            </span>
          </div>
        </div>

        {loading ? (
          <div className="py-12 text-center text-slate-400">Đang nạp dữ liệu chi tiết kỳ {currentMonth}...</div>
        ) : (
          <div className="space-y-4">
            {/* 1. DEMO/POC/Tiền về (55%) Section */}
            {(activeCategory === 'ALL' || activeCategory === 'DEMO_POC') && (
              <div className="border border-blue-200 rounded-lg p-3 bg-white space-y-2">
                <div className="flex items-center justify-between font-bold text-blue-900 text-xs">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-blue-600" />
                    1. Nhóm DEMO/POC/Tiền về (55%): {demoPocTasks.length} bản ghi
                  </span>
                  <span className="font-mono-numbers text-blue-800">
                    Tổng A: <strong>{fmtScore(summary.scoreDemoPocTienVe)} đ</strong>
                  </span>
                </div>

                <div className="border border-slate-200 rounded-md overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px]">
                      <tr>
                        <th className="py-2 px-2.5">Ngày</th>
                        <th className="py-2 px-2.5">Loại công việc</th>
                        <th className="py-2 px-2.5">Nhiệm vụ</th>
                        <th className="py-2 px-2.5">Nhóm ghi nhận</th>
                        <th className="py-2 px-2.5 text-right font-medium">Điểm nhận</th>
                        <th className="py-2 px-2.5">Phần chia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {demoPocTasks.map((t: any) => (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="py-2 px-2.5 font-mono text-slate-600">{t.date}</td>
                          <td className="py-2 px-2.5 font-semibold text-blue-900">{t.workTypeName || t.workTypeCode}</td>
                          <td className="py-2 px-2.5 text-slate-800">{t.taskName}</td>
                          <td className="py-2 px-2.5 text-slate-600">{t.resolvedGroup}</td>
                          <td className="py-2 px-2.5 text-right font-mono-numbers font-bold text-blue-700">
                            {fmtScore(t.memberPoints)}
                          </td>
                          <td className="py-2 px-2.5 text-[11px] text-slate-500">
                            {t.splits && t.splits.length > 0 ? `Chia ${t.splits.length} người (Tổng: ${t.recordedScore}đ)` : 'Trực tiếp 100%'}
                          </td>
                        </tr>
                      ))}
                      {demoPocTasks.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-3 text-center text-slate-400 italic">
                            Không có bản ghi nào thuộc nhóm DEMO/POC/Tiền về trong tháng.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 2. Tiếp nhận gói (40%) Section */}
            {(activeCategory === 'ALL' || activeCategory === 'PACKAGES') && (
              <div className="border border-emerald-200 rounded-lg p-3 bg-white space-y-2">
                <div className="flex items-center justify-between font-bold text-emerald-900 text-xs">
                  <span className="flex items-center gap-1.5">
                    <Package className="w-3.5 h-3.5 text-emerald-600" />
                    2. Nhóm Tiếp nhận gói (40%): {packages.length} gói khách hàng
                  </span>
                  <span className="font-mono-numbers text-emerald-800">
                    Tổng B: <strong>{fmtScore(summary.scoreReception)} đ</strong>
                  </span>
                </div>

                <div className="border border-slate-200 rounded-md overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px]">
                      <tr>
                        <th className="py-2 px-2.5">Ngày tiếp nhận</th>
                        <th className="py-2 px-2.5">Mã gói</th>
                        <th className="py-2 px-2.5">Mã số thuế</th>
                        <th className="py-2 px-2.5">Khách hàng</th>
                        <th className="py-2 px-2.5">Module / Leader</th>
                        <th className="py-2 px-2.5 text-right font-medium">Điểm nhận</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {packages.map((pkg: any) => {
                        const myDtl = pkg.myDetails || [];
                        const dtlSummary = myDtl.map((d: any) => `${d.moduleName || d.moduleCode}${d.leaderPlatforms ? ` (Leader ${d.leaderPlatforms} nền tảng)` : ''}`).join('; ');

                        return (
                          <tr key={pkg.id} className="hover:bg-slate-50">
                            <td className="py-2 px-2.5 font-mono text-slate-600">{pkg.receptionDate}</td>
                            <td className="py-2 px-2.5 font-mono font-semibold text-slate-800">{pkg.packageCode}</td>
                            <td className="py-2 px-2.5 font-mono text-slate-700">{pkg.taxCode || '—'}</td>
                            <td className="py-2 px-2.5 font-medium text-slate-900">{pkg.customerName || pkg.packageName}</td>
                            <td className="py-2 px-2.5 text-slate-600">{dtlSummary || 'Tiếp nhận gói'}</td>
                            <td className="py-2 px-2.5 text-right font-mono-numbers font-bold text-emerald-700">
                              {fmtScore(pkg.memberPoints)}
                            </td>
                          </tr>
                        );
                      })}
                      {packages.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-3 text-center text-slate-400 italic">
                            Không có gói tiếp nhận nào được phân công trong tháng.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* 3. Đào tạo & Loại việc khác (5%) Section */}
            {(activeCategory === 'ALL' || activeCategory === 'TRAINING') && (
              <div className="border border-purple-200 rounded-lg p-3 bg-white space-y-2">
                <div className="flex items-center justify-between font-bold text-purple-900 text-xs">
                  <span className="flex items-center gap-1.5">
                    <FileText className="w-3.5 h-3.5 text-purple-600" />
                    3. Nhóm Đào tạo & Loại việc khác (5%): {trainingTasks.length} bản ghi
                  </span>
                  <span className="font-mono-numbers text-purple-800">
                    Tổng C: <strong>{fmtScore(summary.scoreTraining)} đ</strong>
                  </span>
                </div>

                <div className="border border-slate-200 rounded-md overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 border-b border-slate-200 text-slate-600 text-[11px]">
                      <tr>
                        <th className="py-2 px-2.5">Ngày</th>
                        <th className="py-2 px-2.5">Loại công việc</th>
                        <th className="py-2 px-2.5">Nhiệm vụ</th>
                        <th className="py-2 px-2.5">Nhóm ghi nhận</th>
                        <th className="py-2 px-2.5 text-right font-medium">Điểm nhận</th>
                        <th className="py-2 px-2.5">Phần chia</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {trainingTasks.map((t: any) => (
                        <tr key={t.id} className="hover:bg-slate-50">
                          <td className="py-2 px-2.5 font-mono text-slate-600">{t.date}</td>
                          <td className="py-2 px-2.5 font-semibold text-purple-900 flex items-center gap-1">
                            <span>{t.workTypeName || t.workTypeCode}</span>
                            {t.category === 'UNKNOWN' && (
                              <span className="text-[10px] text-amber-600 bg-amber-50 px-1 rounded font-normal">
                                Chưa rõ loại
                              </span>
                            )}
                          </td>
                          <td className="py-2 px-2.5 text-slate-800">{t.taskName}</td>
                          <td className="py-2 px-2.5 text-slate-600">{t.resolvedGroup}</td>
                          <td className="py-2 px-2.5 text-right font-mono-numbers font-bold text-purple-700">
                            {fmtScore(t.memberPoints)}
                          </td>
                          <td className="py-2 px-2.5 text-[11px] text-slate-500">
                            {t.splits && t.splits.length > 0 ? `Chia ${t.splits.length} người (Tổng: ${t.recordedScore}đ)` : 'Trực tiếp 100%'}
                          </td>
                        </tr>
                      ))}
                      {trainingTasks.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-3 text-center text-slate-400 italic">
                            Không có bản ghi đào tạo hoặc công việc khác trong tháng.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}

        <div className="flex justify-end pt-2 border-t border-slate-100">
          <button
            onClick={onClose}
            className="px-4 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white rounded-lg font-semibold text-xs transition-colors shadow-xs cursor-pointer"
          >
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
};
