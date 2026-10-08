import React, { useRef, useState, useEffect, useCallback } from 'react';
import { CurrentUserSession } from '../types';
import { Shield, Lock, Unlock, Calendar, UserCheck, Download, ChevronLeft, ChevronRight, RotateCcw, ShieldAlert, LogOut } from 'lucide-react';

interface NavbarProps {
  session: CurrentUserSession | null;
  selectedMonth: string;
  onMonthChange: (m: string) => void;
  isMonthLocked: boolean;
  isMonthReopened?: boolean;
  onSignOut: () => void;
  activeTab: string;
  onTabChange: (tab: string) => void;
  onOpenCleanupModal?: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  session,
  selectedMonth,
  onMonthChange,
  isMonthLocked,
  isMonthReopened,
  onSignOut,
  activeTab,
  onTabChange,
  onOpenCleanupModal
}) => {
  const navScrollRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Record<string, HTMLButtonElement | null>>({});
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Pre-generate list of available months (from 2026-01 to 2026-12)
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

  const handleDownloadBackup = () => {
    window.location.href = '/api/backup';
  };

  const navItems = [
    { id: 'dashboard', label: 'Tổng quan' },
    { id: 'packages', label: 'Tiếp nhận gói đào tạo' },
    { id: 'schedule', label: 'Lịch công việc' },
    { id: 'progress', label: 'Tiến độ thực hiện' },
    { id: 'work-allocation', label: 'Điều phối công việc' },
    { id: 'allocation', label: 'Lịch đào tạo tập trung' },
    { id: 'scorecard', label: 'Thưởng hiệu quả' },
    { id: 'history', label: 'Tra cứu' },
    { id: 'import', label: 'Nhập dữ liệu' },
    { id: 'core', label: 'Thiết lập hệ thống', adminOnly: true },
    { id: 'audit', label: 'Nhật ký' }
  ];

  // Check scroll boundary to toggle left/right arrows
  const checkScrollBoundary = useCallback(() => {
    const el = navScrollRef.current;
    if (!el) return;
    const hasOverflow = el.scrollWidth > el.clientWidth + 2;
    setCanScrollLeft(el.scrollLeft > 4);
    setCanScrollRight(hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 4);
  }, []);

  useEffect(() => {
    checkScrollBoundary();
    const el = navScrollRef.current;
    if (el) {
      el.addEventListener('scroll', checkScrollBoundary, { passive: true });
    }
    window.addEventListener('resize', checkScrollBoundary);
    return () => {
      if (el) {
        el.removeEventListener('scroll', checkScrollBoundary);
      }
      window.removeEventListener('resize', checkScrollBoundary);
    };
  }, [checkScrollBoundary]);

  // When activeTab changes, automatically bring active tab into visible area
  useEffect(() => {
    const btn = itemRefs.current[activeTab];
    if (btn) {
      btn.scrollIntoView({ behavior: 'smooth', inline: 'nearest', block: 'nearest' });
    }
    // Re-check scroll buttons after scroll completes
    const timer = setTimeout(checkScrollBoundary, 300);
    return () => clearTimeout(timer);
  }, [activeTab, checkScrollBoundary]);

  const handleScroll = (direction: 'left' | 'right') => {
    const el = navScrollRef.current;
    if (!el) return;
    const scrollAmount = direction === 'left' ? -260 : 260;
    el.scrollBy({ left: scrollAmount, behavior: 'smooth' });
    setTimeout(checkScrollBoundary, 250);
  };

  return (
    <header className="bg-white border-b border-slate-200 sticky top-0 z-30 shadow-[0_2px_8px_rgba(15,23,42,0.04)]">
      {/* Top Bar Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16">
          {/* Zone 1: Application Wordmark & Title */}
          <div className="flex items-center gap-3">
            <div className="flex items-center gap-2">
              <span className="text-2xl font-black tracking-tight text-[#4F46E5] leading-none select-none">
                ONB
              </span>
              <span className="text-xs font-semibold tracking-wider text-slate-500 uppercase border-l border-slate-200 pl-2">
                Operations
              </span>
            </div>
          </div>

          {/* Zone 2: Month Filter & Status */}
          <div className="flex items-center gap-2.5">
            <div className="flex items-center gap-2 bg-white border border-slate-300 px-3 py-1.5 rounded-lg shadow-[0_2px_8px_rgba(15,23,42,0.02)] focus-within:border-[#4F46E5] focus-within:ring-2 focus-within:ring-[#E0E7FF] transition-colors">
              <Calendar className="w-4 h-4 text-slate-400" />
              <select
                value={selectedMonth}
                onChange={e => onMonthChange(e.target.value)}
                className="bg-transparent text-sm font-semibold text-slate-900 focus:outline-hidden cursor-pointer"
              >
                {monthOptions.map(m => (
                  <option key={m.val} value={m.val}>
                    {m.label}
                  </option>
                ))}
              </select>
            </div>

            {/* Locked / Reopened indicator */}
            {isMonthReopened ? (
              <span className="flex items-center gap-1.5 text-xs text-[#1D4ED8] bg-[#EFF6FF] border border-[#BFDBFE] px-2.5 py-1.5 rounded-lg font-semibold" title="Tháng cũ đang được mở lại để admin điều chỉnh dữ liệu">
                <RotateCcw className="w-3.5 h-3.5 text-[#1D4ED8]" />
                <span className="hidden sm:inline">Mở lại để điều chỉnh</span>
              </span>
            ) : isMonthLocked ? (
              <span className="flex items-center gap-1.5 text-xs text-[#92400E] bg-[#FFFBEB] border border-[#FDE68A] px-2.5 py-1.5 rounded-lg font-medium" title="Tháng cũ hoặc tháng đã khóa: Chỉ xem dữ liệu, không thể thêm/sửa/xóa">
                <Lock className="w-3.5 h-3.5 text-[#92400E]" />
                <span className="hidden sm:inline">Đã khóa</span>
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs text-[#047857] bg-[#ECFDF5] border border-[#A7F3D0] px-2.5 py-1.5 rounded-lg font-medium" title="Tháng đang mở: Được phép nhập và sửa dữ liệu nghiệp vụ">
                <Unlock className="w-3.5 h-3.5 text-[#047857]" />
                <span className="hidden sm:inline">Đang mở</span>
              </span>
            )}
          </div>

          {/* Zone 3: User Session & Actions */}
          <div className="flex items-center gap-2.5">
            {/* Dedicated Test Data Cleanup Button */}
            {session?.email?.toLowerCase() === 'dangthihong01012003@gmail.com' && onOpenCleanupModal && (
              <button
                type="button"
                onClick={onOpenCleanupModal}
                title="Xóa dữ liệu kiểm thử (Đặc quyền riêng cho tài khoản cá nhân)"
                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-[#B91C1C] bg-[#FEF2F2] hover:bg-[#FEE2E2] border border-[#FECACA] rounded-lg transition-colors cursor-pointer shadow-xs"
              >
                <ShieldAlert className="w-3.5 h-3.5 text-[#B91C1C]" />
                <span className="hidden md:inline">Xóa dữ liệu kiểm thử</span>
              </button>
            )}

            {/* Download Backup */}
            <button
              onClick={handleDownloadBackup}
              title="Sao lưu toàn bộ cơ sở dữ liệu tập trung (JSON)"
              className="p-2 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:outline-hidden cursor-pointer"
            >
              <Download className="w-4 h-4" />
            </button>

            {/* Authenticated Google Account & Sign Out */}
            <div className="flex items-center gap-3 border-l border-slate-200 pl-3">
              <div className="flex items-center gap-2">
                {session?.photoURL ? (
                  <img
                    src={session.photoURL}
                    alt={session.fullName}
                    className="w-8 h-8 rounded-full border border-slate-200 object-cover shrink-0"
                  />
                ) : (
                  <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-700 border border-indigo-200 flex items-center justify-center font-bold text-xs shrink-0">
                    {session?.fullName?.charAt(0) || session?.email?.charAt(0) || 'U'}
                  </div>
                )}
                <div className="flex flex-col text-left">
                  <div className="text-xs font-bold text-slate-900 leading-tight flex items-center gap-1.5">
                    <span className="truncate max-w-[150px]">{session?.fullName || 'Người dùng'}</span>
                    <span className="font-mono text-[10px] bg-slate-100 px-1 py-0.2 rounded text-slate-600 font-semibold">
                      {session?.onbCode}
                    </span>
                  </div>
                  <div className="text-[11px] text-slate-500 flex items-center gap-1 truncate max-w-[190px]">
                    {session?.isMasterAdmin ? (
                      <span className="text-[#4F46E5] font-semibold flex items-center gap-0.5">
                        <Shield className="w-3 h-3" /> Quản trị viên
                      </span>
                    ) : (
                      <span>
                        {session?.canEditBonus && 'Thưởng · '}
                        {session?.canManageAllocation && 'Phân bổ · '}
                        ONB
                      </span>
                    )}
                    <span className="text-slate-400">·</span>
                    <span className="truncate text-slate-400">{session?.email}</span>
                  </div>
                </div>
              </div>

              {/* Sign Out Button */}
              <button
                type="button"
                onClick={onSignOut}
                title="Đăng xuất khỏi tài khoản Google"
                className="p-2 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer border border-transparent hover:border-rose-200"
              >
                <LogOut className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Primary Horizontal Navigation Bar */}
        <div className="relative border-t border-slate-200 flex items-center">
          {/* Left Scroll Button */}
          {canScrollLeft && (
            <button
              type="button"
              onClick={() => handleScroll('left')}
              aria-label="Cuộn sang trái"
              title="Cuộn sang trái"
              className="absolute left-0 z-20 h-full px-1 flex items-center justify-center bg-gradient-to-r from-white via-white/95 to-transparent text-slate-500 hover:text-[#4F46E5] transition-colors cursor-pointer"
            >
              <div className="p-1 rounded-md bg-white border border-slate-200 shadow-xs hover:bg-slate-50">
                <ChevronLeft className="w-4 h-4" />
              </div>
            </button>
          )}

          {/* Navigation Scroll Container */}
          <div
            ref={navScrollRef}
            className="flex items-center gap-1 overflow-x-auto py-2 scroll-smooth no-scrollbar w-full"
            style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
          >
            {navItems.map(item => {
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  ref={el => {
                    itemRefs.current[item.id] = el;
                  }}
                  onClick={() => onTabChange(item.id)}
                  className={`px-3 py-1.5 text-xs whitespace-nowrap rounded-lg transition-colors duration-150 flex items-center gap-1.5 border-b-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:outline-hidden ${
                    isActive
                      ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold border-[#4F46E5] shadow-[0_2px_8px_rgba(15,23,42,0.02)]'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-[#F1F5F9] font-medium border-transparent'
                  }`}
                >
                  {item.adminOnly && (
                    <Shield className={`w-3.5 h-3.5 ${isActive ? 'text-[#4F46E5]' : 'text-slate-400'}`} />
                  )}
                  <span>{item.label}</span>
                </button>
              );
            })}
          </div>

          {/* Right Scroll Button */}
          {canScrollRight && (
            <button
              type="button"
              onClick={() => handleScroll('right')}
              aria-label="Cuộn sang phải"
              title="Cuộn sang phải"
              className="absolute right-0 z-20 h-full px-1 flex items-center justify-center bg-gradient-to-l from-white via-white/95 to-transparent text-slate-500 hover:text-[#4F46E5] transition-colors cursor-pointer"
            >
              <div className="p-1 rounded-md bg-white border border-slate-200 shadow-xs hover:bg-slate-50">
                <ChevronRight className="w-4 h-4" />
              </div>
            </button>
          )}
        </div>
      </div>
    </header>
  );
};

