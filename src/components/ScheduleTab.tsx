import React, { useState, useMemo, useEffect } from 'react';
import {
  WorkSchedule,
  ONBMember,
  ONBGroup,
  WorkTypeCatalog,
  ProductCatalog,
  CurrentUserSession,
  SessionOfDay,
  STANDARDIZED_WORK_FORMS,
  resolveWorkForm
} from '../types';
import {
  Calendar as CalendarIcon,
  ChevronLeft,
  ChevronRight,
  Plus,
  Search,
  CheckCircle,
  Edit2,
  Trash2,
  ArrowRightLeft,
  Lock,
  Maximize2,
  Minimize2,
  Table as TableIcon,
  List as ListIcon,
  Info,
  Users,
  AlertCircle,
  XCircle,
  Briefcase,
  ChevronDown,
  ChevronUp
} from 'lucide-react';

interface ScheduleTabProps {
  schedules: WorkSchedule[];
  members: ONBMember[];
  groups: ONBGroup[];
  workTypes: WorkTypeCatalog[];
  products: ProductCatalog[];
  monthYear: string;
  isMonthLocked: boolean;
  session: CurrentUserSession | null;
  onAddSchedule: (schedule: Partial<WorkSchedule>) => Promise<void>;
  onAddFullDaySchedule: (payload: any) => Promise<any>;
  onCancelSchedule: (id: string, cancelBothSessions?: boolean) => Promise<void>;
  onUpdateSchedule: (id: string, schedule: Partial<WorkSchedule> & { applyToFullDay?: boolean }) => Promise<void>;
  onDeleteSchedule: (id: string) => Promise<void>;
  onTransferSchedule?: (id: string, payload: { toOnbCode: string; reason?: string; expectedOnbCode?: string }) => Promise<void>;
  onConvertToProgress: (id: string) => Promise<void>;
  onMonthChange?: (newMonth: string) => void;
}

// Helpers for week date math
function getMonday(d: Date): Date {
  const date = new Date(d);
  const day = date.getDay();
  const diff = date.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(date.setDate(diff));
}

function formatDateISO(d: Date): string {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDayMonthVN(d: Date): string {
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  return `${day}/${month}`;
}

function formatDateVi(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

function formatDateTimeVi(isoStr: string): string {
  if (!isoStr) return '';
  try {
    const d = new Date(isoStr);
    const day = String(d.getDate()).padStart(2, '0');
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const year = d.getFullYear();
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    return `${day}/${month}/${year} ${hours}:${minutes}`;
  } catch {
    return isoStr;
  }
}

const DAY_NAMES = ['Thứ 2', 'Thứ 3', 'Thứ 4', 'Thứ 5', 'Thứ 6', 'Thứ 7', 'CHỦ NHẬT'];

// Deterministic Visual State Calculation based on Strict Rule 4:
// Trắng: Chưa có lịch
// Đỏ: Lịch đã hủy
// Vàng: Lịch nửa ngày (chỉ 1 buổi có lịch chưa hủy)
// Xanh: Cả Sáng và Chiều đều có lịch chưa hủy
export type CellVisualColor = 'white' | 'yellow' | 'green' | 'red';

export function getDaySessionColors(
  morningInput?: WorkSchedule | WorkSchedule[] | null,
  afternoonInput?: WorkSchedule | WorkSchedule[] | null
): {
  morningColor: CellVisualColor;
  afternoonColor: CellVisualColor;
} {
  const morningList = Array.isArray(morningInput) ? morningInput : (morningInput ? [morningInput] : []);
  const afternoonList = Array.isArray(afternoonInput) ? afternoonInput : (afternoonInput ? [afternoonInput] : []);

  const hasMorning = morningList.length > 0;
  const hasMorningActive = hasMorning && morningList.some(s => s.status !== 'Đã hủy' && s.status !== 'Hủy');
  const isMorningAllCancelled = hasMorning && !hasMorningActive;

  const hasAfternoon = afternoonList.length > 0;
  const hasAfternoonActive = hasAfternoon && afternoonList.some(s => s.status !== 'Đã hủy' && s.status !== 'Hủy');
  const isAfternoonAllCancelled = hasAfternoon && !hasAfternoonActive;

  // Case: Both have active schedules -> Both GREEN
  if (hasMorningActive && hasAfternoonActive) {
    return { morningColor: 'green', afternoonColor: 'green' };
  }

  // Morning Color
  let morningColor: CellVisualColor = 'white';
  if (isMorningAllCancelled) {
    morningColor = 'red';
  } else if (hasMorningActive) {
    morningColor = 'yellow';
  }

  // Afternoon Color
  let afternoonColor: CellVisualColor = 'white';
  if (isAfternoonAllCancelled) {
    afternoonColor = 'red';
  } else if (hasAfternoonActive) {
    afternoonColor = 'yellow';
  }

  return { morningColor, afternoonColor };
}

// Background styling matching the exact color rule
function getColorClasses(color: CellVisualColor): string {
  switch (color) {
    case 'green':
      return 'bg-emerald-50 hover:bg-emerald-100/70 text-emerald-950 border-emerald-200';
    case 'yellow':
      return 'bg-amber-50 hover:bg-amber-100/70 text-amber-950 border-amber-200';
    case 'red':
      return 'bg-rose-50 hover:bg-rose-100/70 text-rose-950 border-rose-200';
    case 'white':
    default:
      return 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200';
  }
}

export const ScheduleTab: React.FC<ScheduleTabProps> = ({
  schedules,
  members,
  groups,
  workTypes,
  products,
  monthYear,
  isMonthLocked,
  session,
  onAddSchedule,
  onAddFullDaySchedule,
  onCancelSchedule,
  onUpdateSchedule,
  onDeleteSchedule,
  onTransferSchedule,
  onConvertToProgress,
  onMonthChange
}) => {
  // 1. Dynamic visible groups from Core
  const visibleGroups = useMemo(() => {
    const list = (groups && groups.length > 0)
      ? groups
      : [
          { id: 'grp_1', code: 'NHOM_1', name: 'Nhóm 1', order: 1, isActive: true },
          { id: 'grp_2', code: 'NHOM_2', name: 'Nhóm 2', order: 2, isActive: true },
          { id: 'grp_3', code: 'NHOM_3', name: 'Nhóm 3', order: 3, isActive: true }
        ];

    return list.filter(g => {
      if (g.isActive) return true;
      // Inactive groups appear if they have members or history
      return members.some(m => (m.groupId && m.groupId === g.id) || m.currentGroup === g.name);
    }).sort((a, b) => a.order - b.order);
  }, [groups, members]);

  // Selected Group Tab: Default to first active group
  const [selectedGroupId, setSelectedGroupId] = useState<string>(() => {
    return visibleGroups[0]?.id || 'grp_1';
  });

  useEffect(() => {
    if (visibleGroups.length > 0 && !visibleGroups.some(g => g.id === selectedGroupId)) {
      setSelectedGroupId(visibleGroups[0].id);
    }
  }, [visibleGroups, selectedGroupId]);

  const currentGroupObj = useMemo(() => {
    return visibleGroups.find(g => g.id === selectedGroupId) || visibleGroups[0];
  }, [visibleGroups, selectedGroupId]);

  // View Mode: 'matrix' (Default) vs 'list'
  const [viewMode, setViewMode] = useState<'matrix' | 'list'>('matrix');

  // Fullscreen / Expanded state
  const [isExpanded, setIsExpanded] = useState(false);

  // Weekend overtime stats toggle
  const [showWeekendStats, setShowWeekendStats] = useState(false);

  // Member search input within group
  const [searchMember, setSearchMember] = useState<string>('');

  // 2. Week Navigation State (Always 7 days: T2 - CN)
  const todayDate = useMemo(() => new Date('2026-10-05'), []);
  const [currentMonday, setCurrentMonday] = useState<Date>(() => getMonday(todayDate));

  // Sync week with selectedMonth if monthYear changes externally
  useEffect(() => {
    const curMonth = formatDateISO(currentMonday).slice(0, 7);
    if (monthYear && monthYear !== curMonth) {
      const firstDay = new Date(`${monthYear}-01`);
      setCurrentMonday(getMonday(firstDay));
    }
  }, [monthYear]);

  // Compute ALWAYS 7 DAYS of the week (Thứ Hai đến Chủ Nhật)
  const weekDays = useMemo(() => {
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(currentMonday);
      d.setDate(currentMonday.getDate() + i);
      const iso = formatDateISO(d);
      const dayMonth = formatDayMonthVN(d);
      const dayName = DAY_NAMES[i];
      const isToday = iso === '2026-10-05';
      const isLockedDay = iso.slice(0, 7) < '2026-10'; // Read-only if in past month
      const isWeekend = i === 5 || i === 6; // Thứ 7 hoặc Chủ Nhật

      days.push({
        date: d,
        dateString: iso,
        dayMonth,
        dayName,
        isToday,
        isLockedDay,
        isWeekend
      });
    }
    return days;
  }, [currentMonday]);

  // Handle Week Navigation
  const handlePrevWeek = () => {
    const next = new Date(currentMonday);
    next.setDate(currentMonday.getDate() - 7);
    setCurrentMonday(next);
    const wed = new Date(next);
    wed.setDate(next.getDate() + 2);
    const mStr = formatDateISO(wed).slice(0, 7);
    if (onMonthChange && mStr !== monthYear) {
      onMonthChange(mStr);
    }
  };

  const handleNextWeek = () => {
    const next = new Date(currentMonday);
    next.setDate(currentMonday.getDate() + 7);
    setCurrentMonday(next);
    const wed = new Date(next);
    wed.setDate(next.getDate() + 2);
    const mStr = formatDateISO(wed).slice(0, 7);
    if (onMonthChange && mStr !== monthYear) {
      onMonthChange(mStr);
    }
  };

  const handleToday = () => {
    const next = getMonday(todayDate);
    setCurrentMonday(next);
    if (onMonthChange) onMonthChange('2026-10');
  };

  const handleDateJump = (isoDate: string) => {
    if (!isoDate) return;
    const target = new Date(isoDate);
    const mon = getMonday(target);
    setCurrentMonday(mon);
    const mStr = isoDate.slice(0, 7);
    if (onMonthChange && mStr !== monthYear) {
      onMonthChange(mStr);
    }
  };

  // Group members from Core
  const groupMembers = useMemo(() => {
    if (!currentGroupObj) return [];
    return members.filter(m => {
      const matchesGroup = (m.groupId && m.groupId === currentGroupObj.id) ||
        m.currentGroup === currentGroupObj.name;
      if (!matchesGroup) return false;

      // Inactive employee rule: still appears if has history in viewed week
      if (!m.isActive) {
        const hasSchedulesInWeek = weekDays.some(day => {
          return schedules.some(s => s.onbCode === m.code && s.date === day.dateString);
        });
        if (!hasSchedulesInWeek && !searchMember) {
          return false;
        }
      }

      if (searchMember) {
        const term = searchMember.toLowerCase();
        const matchName = m.fullName.toLowerCase().includes(term);
        const matchCode = m.code.toLowerCase().includes(term);
        const matchDisplay = m.displayName.toLowerCase().includes(term);
        if (!matchName && !matchCode && !matchDisplay) return false;
      }
      return true;
    });
  }, [members, currentGroupObj, searchMember, weekDays, schedules]);

  // Index schedules by "onbCode_date_session"
  const scheduleIndex = useMemo(() => {
    // Key: onbCode_date -> { morning?: WorkSchedule, afternoon?: WorkSchedule, mornings: WorkSchedule[], afternoons: WorkSchedule[], others: WorkSchedule[] }
    const map = new Map<string, { morning?: WorkSchedule; afternoon?: WorkSchedule; mornings: WorkSchedule[]; afternoons: WorkSchedule[]; others: WorkSchedule[] }>();

    for (const sch of schedules) {
      const key = `${sch.onbCode}_${sch.date}`;
      if (!map.has(key)) {
        map.set(key, { mornings: [], afternoons: [], others: [] });
      }
      const entry = map.get(key)!;

      // Determine session
      let sessionType: SessionOfDay = sch.sessionOfDay || 'Sáng';
      if (!sch.sessionOfDay) {
        if (sch.startTime && sch.startTime >= '12:00') {
          sessionType = 'Chiều';
        } else if (entry.mornings.length === 0) {
          sessionType = 'Sáng';
        } else {
          sessionType = 'Chiều';
        }
      }

      if (sessionType === 'Sáng') {
        entry.mornings.push(sch);
        if (!entry.morning) entry.morning = sch;
      } else {
        entry.afternoons.push(sch);
        if (!entry.afternoon) entry.afternoon = sch;
      }
    }
    return map;
  }, [schedules]);

  // Weekend client visits tracking statistics
  const weekendOvertimeStats = useMemo(() => {
    const list: Array<{
      schedule: WorkSchedule;
      member?: ONBMember;
      dayName: string;
      sessionName: string;
    }> = [];

    for (const sch of schedules) {
      if (sch.monthYear !== monthYear) continue;
      if (sch.status === 'Đã hủy' || sch.status === 'Hủy') continue;

      // Check if Saturday or Sunday
      const d = new Date(sch.date);
      const dayIdx = d.getDay(); // 0 is Sunday, 6 is Saturday
      if (dayIdx !== 0 && dayIdx !== 6) continue;

      // Check if not leave
      if (sch.workTypeCode.includes('Nghỉ') || sch.workTypeCode.includes('phép')) continue;

      // Must be marked for compensatory tracking or completed on weekend
      const isTracked = sch.trackCompensatoryLeave || sch.isCompleted || sch.status === 'Hoàn thành';
      if (!isTracked) continue;

      const mem = members.find(m => m.code === sch.onbCode);
      if (selectedGroupId && mem) {
        const matchesGroup = (mem.groupId && mem.groupId === selectedGroupId) || mem.currentGroup === currentGroupObj?.name;
        if (!matchesGroup) continue;
      }

      list.push({
        schedule: sch,
        member: mem,
        dayName: dayIdx === 6 ? 'Thứ 7' : 'Chủ Nhật',
        sessionName: sch.sessionOfDay || 'Sáng'
      });
    }

    // Sort by date descending
    list.sort((a, b) => b.schedule.date.localeCompare(a.schedule.date));
    return list;
  }, [schedules, monthYear, members, selectedGroupId, currentGroupObj]);

  // Modals state
  const [detailSchedule, setDetailSchedule] = useState<WorkSchedule | null>(null);
  const [detailOtherSession, setDetailOtherSession] = useState<WorkSchedule | null>(null);
  const [isFormModalOpen, setIsFormModalOpen] = useState(false);
  const [editingSchedule, setEditingSchedule] = useState<WorkSchedule | null>(null);

  // Delete confirmation modal state
  const [deleteConfirmSchedule, setDeleteConfirmSchedule] = useState<WorkSchedule | null>(null);
  const [isDeletingSchedule, setIsDeletingSchedule] = useState(false);
  const [deleteScheduleError, setDeleteScheduleError] = useState('');

  // Transfer modal state
  const [transferModalSchedule, setTransferModalSchedule] = useState<WorkSchedule | null>(null);
  const [targetOnbCode, setTargetOnbCode] = useState('');
  const [transferReason, setTransferReason] = useState('');
  const [isTransferring, setIsTransferring] = useState(false);
  const [transferError, setTransferError] = useState('');
  const [transferSuccessNotice, setTransferSuccessNotice] = useState<{
    targetMemberName: string;
    targetOnbCode: string;
    targetGroup?: string;
    targetGroupId?: string;
  } | null>(null);
  const [scheduleNotice, setScheduleNotice] = useState<{ type: 'error' | 'info' | 'success'; message: string } | null>(null);

  // Form input state (Strict Simple Schedule Form)
  const [formData, setFormData] = useState({
    onbCode: session?.onbCode || 'DTHANG',
    date: '2026-10-05',
    sessionOfDay: 'Sáng' as SessionOfDay,
    isFullDay: false,
    applyToFullDay: false,
    workTypeCode: 'TVTK_TT', // Exactly one of the 6 standardized choices
    customerOrTask: '',
    notes: '',
    trackCompensatoryLeave: false,
    isCompleted: false
  });

  const [formError, setFormError] = useState('');

  // Permission checks
  const canEditSchedule = (sch: WorkSchedule): boolean => {
    const isLocked = sch.date.slice(0, 7) < '2026-10';
    if (isLocked) return false;
    if (session?.isMasterAdmin) return true;
    return session?.onbCode === sch.onbCode;
  };

  const canAddForSlot = (targetDate: string, targetOnbCode: string): boolean => {
    const isLocked = targetDate.slice(0, 7) < '2026-10';
    if (isLocked) return false;
    if (session?.isMasterAdmin) return true;
    return session?.onbCode === targetOnbCode;
  };

  // Open Add Modal for specific cell
  const handleOpenAddForSlot = (dateString: string, onbCode: string, sessionOfDay: SessionOfDay) => {
    if (!canAddForSlot(dateString, onbCode)) {
      if (dateString.slice(0, 7) < '2026-10') {
        setScheduleNotice({ type: 'error', message: `Ngày ${dateString} thuộc tháng cũ đã bị khóa sổ. Chế độ chỉ xem!` });
      } else {
        setScheduleNotice({ type: 'error', message: `Bạn chỉ có quyền tạo/sửa lịch của chính mình (${session?.onbCode}). Không thể tạo lịch cho đồng nghiệp!` });
      }
      return;
    }

    const d = new Date(dateString);
    const dayOfWeek = d.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

    setEditingSchedule(null);
    setFormData({
      onbCode,
      date: dateString,
      sessionOfDay,
      isFullDay: false,
      applyToFullDay: false,
      workTypeCode: 'TVTK_TT',
      customerOrTask: '',
      notes: '',
      trackCompensatoryLeave: isWeekend,
      isCompleted: false
    });
    setFormError('');
    setIsFormModalOpen(true);
  };

  // Open Detail / Edit modal
  const handleOpenDetail = (sch: WorkSchedule) => {
    // Check if there is an other session schedule on that day
    const key = `${sch.onbCode}_${sch.date}`;
    const dayEntry = scheduleIndex.get(key);
    const otherSchedules = sch.sessionOfDay === 'Sáng' ? dayEntry?.afternoons : dayEntry?.mornings;
    const other = otherSchedules && otherSchedules.length > 0 ? otherSchedules[0] : null;

    setDetailSchedule(sch);
    setDetailOtherSession(other || null);
  };

  const handleOpenEditFromDetail = (sch: WorkSchedule) => {
    if (!canEditSchedule(sch)) {
      setScheduleNotice({ type: 'error', message: 'Bạn chỉ có quyền sửa lịch của chính mình.' });
      return;
    }

    const resolved = resolveWorkForm(sch.workTypeCode);
    const d = new Date(sch.date);
    const isWeekend = d.getDay() === 0 || d.getDay() === 6;

    setEditingSchedule(sch);
    setFormData({
      onbCode: sch.onbCode,
      date: sch.date,
      sessionOfDay: sch.sessionOfDay || 'Sáng',
      isFullDay: Boolean(sch.fullDay),
      applyToFullDay: false,
      workTypeCode: resolved.isUnknown ? 'TVTK_TT' : resolved.form.code,
      customerOrTask: sch.customerOrTask || '',
      notes: sch.notes || '',
      trackCompensatoryLeave: sch.trackCompensatoryLeave ?? isWeekend,
      isCompleted: sch.isCompleted ?? (sch.status === 'Hoàn thành')
    });
    setFormError('');
    setDetailSchedule(null);
    setIsFormModalOpen(true);
  };

  // Handle Cancel in-place
  const handleCancelClick = async (sch: WorkSchedule, cancelBoth: boolean) => {
    const promptMsg = cancelBoth
      ? `Bạn có chắc chắn muốn HỦY LỊCH CẢ NGÀY (${sch.date}) của ${sch.onbCode}? (Nội dung vẫn được giữ lại để tra cứu và chuyển màu đỏ)`
      : `Bạn có chắc chắn muốn HỦY LỊCH buổi ${sch.sessionOfDay || 'Sáng'} ngày ${sch.date}? (Nội dung vẫn được giữ lại và chuyển màu đỏ)`;

    if (confirm(promptMsg)) {
      try {
        await onCancelSchedule(sch.id, cancelBoth);
        setDetailSchedule(null);
        setDetailOtherSession(null);
        setIsFormModalOpen(false);
      } catch (err: any) {
        setScheduleNotice({ type: 'error', message: err.message || 'Lỗi khi hủy lịch' });
      }
    }
  };

  // Handle Form Submit
  const handleSubmitForm = async (e: React.FormEvent) => {
    e.preventDefault();
    const isLeave = formData.workTypeCode === 'Nghỉ phép' || formData.workTypeCode.includes('Nghỉ');
    if (!isLeave && !formData.customerOrTask.trim()) {
      setFormError('Vui lòng nhập tên khách hàng hoặc nội dung công việc.');
      return;
    }

    const finalCustomer = formData.customerOrTask.trim() || (isLeave ? 'Nghỉ phép / Nghỉ bù' : '');

    try {
      if (editingSchedule) {
        // Update existing schedule
        await onUpdateSchedule(editingSchedule.id, {
          onbCode: formData.onbCode,
          date: formData.date,
          sessionOfDay: formData.sessionOfDay,
          workTypeCode: formData.workTypeCode,
          customerOrTask: finalCustomer,
          notes: formData.notes,
          trackCompensatoryLeave: formData.trackCompensatoryLeave,
          isCompleted: formData.isCompleted,
          status: formData.isCompleted ? 'Hoàn thành' : 'Kế hoạch',
          applyToFullDay: formData.applyToFullDay
        });
      } else if (formData.isFullDay) {
        // Tích Cả ngày -> tạo hoặc cập nhật cả 2 buổi an toàn trong 1 request
        const res = await onAddFullDaySchedule({
          onbCode: formData.onbCode,
          date: formData.date,
          workTypeCode: formData.workTypeCode,
          customerOrTask: finalCustomer,
          notes: formData.notes,
          trackCompensatoryLeave: formData.trackCompensatoryLeave,
          isCompleted: formData.isCompleted,
          replaceExisting: false
        });

        if (res && res.conflict) {
          if (confirm(`${res.message}`)) {
            await onAddFullDaySchedule({
              onbCode: formData.onbCode,
              date: formData.date,
              workTypeCode: formData.workTypeCode,
              customerOrTask: finalCustomer,
              notes: formData.notes,
              trackCompensatoryLeave: formData.trackCompensatoryLeave,
              isCompleted: formData.isCompleted,
              replaceExisting: true
            });
          } else {
            return;
          }
        }
      } else {
        // Add single session schedule
        await onAddSchedule({
          onbCode: formData.onbCode,
          date: formData.date,
          sessionOfDay: formData.sessionOfDay,
          workTypeCode: formData.workTypeCode,
          customerOrTask: finalCustomer,
          notes: formData.notes,
          trackCompensatoryLeave: formData.trackCompensatoryLeave,
          isCompleted: formData.isCompleted,
          status: formData.isCompleted ? 'Hoàn thành' : 'Kế hoạch'
        });
      }

      setIsFormModalOpen(false);
      setEditingSchedule(null);
    } catch (err: any) {
      setFormError(err.message || 'Lỗi khi lưu lịch làm việc.');
    }
  };

  // --- DELETE SCHEDULE LOGIC ---
  const handleOpenDeleteConfirm = (sch: WorkSchedule) => {
    setDeleteScheduleError('');
    setDeleteConfirmSchedule(sch);
  };

  const handleExecuteDelete = async () => {
    if (!deleteConfirmSchedule) return;
    setIsDeletingSchedule(true);
    setDeleteScheduleError('');
    try {
      await onDeleteSchedule(deleteConfirmSchedule.id);
      setDeleteConfirmSchedule(null);
      setDetailSchedule(null);
      setDetailOtherSession(null);
      setIsFormModalOpen(false);
      setEditingSchedule(null);
    } catch (err: any) {
      setDeleteScheduleError(err.message || 'Lỗi khi xóa lịch làm việc.');
    } finally {
      setIsDeletingSchedule(false);
    }
  };

  // --- TRANSFER SCHEDULE LOGIC ---
  const handleOpenTransferModal = (sch: WorkSchedule) => {
    setTransferError('');
    setTransferModalSchedule(sch);
    // Find first active member that is not current assignee
    const firstOther = members.find(m => m.isActive && m.code !== sch.onbCode);
    setTargetOnbCode(firstOther?.code || '');
    setTransferReason('');
  };

  const handleExecuteTransfer = async () => {
    if (!transferModalSchedule || !onTransferSchedule) return;
    if (!targetOnbCode || !targetOnbCode.trim()) {
      setTransferError('Vui lòng chọn nhân sự nhận lịch.');
      return;
    }
    if (targetOnbCode === transferModalSchedule.onbCode) {
      setTransferError('Không thể chuyển lịch cho chính người phụ trách hiện tại.');
      return;
    }

    setIsTransferring(true);
    setTransferError('');
    try {
      await onTransferSchedule(transferModalSchedule.id, {
        toOnbCode: targetOnbCode,
        reason: transferReason,
        expectedOnbCode: transferModalSchedule.onbCode
      });
      const targetMember = members.find(m => m.code === targetOnbCode);
      const targetGrp = groups.find(g => (targetMember?.groupId && g.id === targetMember.groupId) || g.name === targetMember?.currentGroup);
      setTransferSuccessNotice({
        targetMemberName: targetMember?.fullName || targetOnbCode,
        targetOnbCode,
        targetGroup: targetMember?.currentGroup,
        targetGroupId: targetGrp?.id || targetMember?.groupId
      });
      setTransferModalSchedule(null);
      setDetailSchedule(null);
      setDetailOtherSession(null);
    } catch (err: any) {
      setTransferError(err.message || 'Lỗi khi chuyển lịch.');
    } finally {
      setIsTransferring(false);
    }
  };

  return (
    <div className={`space-y-3.5 ${isExpanded ? 'fixed inset-0 z-40 bg-slate-50 p-4 overflow-y-auto' : ''}`}>
      {/* Schedule Notice Banner */}
      {scheduleNotice && (
        <div className={`p-3 rounded-lg border flex items-center justify-between text-xs animate-in fade-in duration-150 ${
          scheduleNotice.type === 'error' ? 'bg-rose-50 border-rose-200 text-rose-900' : 'bg-blue-50 border-blue-200 text-blue-900'
        }`}>
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 shrink-0 text-rose-600" />
            <span>{scheduleNotice.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setScheduleNotice(null)}
            className="text-slate-400 hover:text-slate-700 font-bold p-1 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* Transfer Success Notice Banner */}
      {transferSuccessNotice && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 flex items-center justify-between gap-3 text-xs text-emerald-950 animate-in fade-in duration-150">
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>
              Đã chuyển lịch thành công sang cho <strong>{transferSuccessNotice.targetMemberName}</strong> ({transferSuccessNotice.targetOnbCode} - {transferSuccessNotice.targetGroup || 'Nhóm'}).
            </span>
          </div>
          <div className="flex items-center gap-2">
            {transferSuccessNotice.targetGroupId && transferSuccessNotice.targetGroupId !== selectedGroupId && (
              <button
                type="button"
                onClick={() => {
                  if (transferSuccessNotice.targetGroupId) {
                    setSelectedGroupId(transferSuccessNotice.targetGroupId);
                  }
                  setSearchMember('');
                  setTransferSuccessNotice(null);
                }}
                className="px-3 py-1 bg-emerald-700 hover:bg-emerald-800 text-white rounded font-medium text-xs flex items-center gap-1 transition-colors"
              >
                <Users className="w-3.5 h-3.5" />
                Xem lịch người nhận
              </button>
            )}
            <button
              type="button"
              onClick={() => setTransferSuccessNotice(null)}
              className="text-slate-400 hover:text-slate-600 p-1"
              title="Đóng thông báo"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* 1. Header Toolbar with Dynamic Group Tabs */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs space-y-3">
        {/* Row 1: Dynamic Group Tabs (From Core) & View Mode */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
          {/* Dynamic Group Tabs from Core */}
          <div className="flex items-center gap-1.5 overflow-x-auto no-scrollbar">
            <span className="text-xs font-semibold text-slate-700 mr-1 flex items-center gap-1">
              <Users className="w-3.5 h-3.5 text-[#4F46E5]" /> Nhóm:
            </span>
            {visibleGroups.map(grp => {
              const isSelected = selectedGroupId === grp.id;
              const count = members.filter(m => (m.groupId && m.groupId === grp.id) || m.currentGroup === grp.name).length;

              return (
                <button
                  key={grp.id}
                  onClick={() => setSelectedGroupId(grp.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                    isSelected
                      ? 'bg-[#4F46E5] text-white shadow-xs'
                      : 'bg-white text-slate-700 hover:bg-[#F8FAFC] border border-[#CBD5E1]'
                  }`}
                >
                  <span>{grp.name}</span>
                  {!grp.isActive && (
                    <span className={`text-[9px] px-1 py-0.2 rounded-xs font-normal ${
                      isSelected ? 'bg-[#4338CA] text-indigo-100' : 'bg-slate-200 text-slate-600'
                    }`}>
                      Ngừng SD
                    </span>
                  )}
                  <span className={`text-[10px] px-1.5 py-0.2 rounded-full font-mono ${
                    isSelected ? 'bg-[#3730A3] text-white' : 'bg-slate-100 text-slate-600'
                  }`}>
                    {count}
                  </span>
                </button>
              );
            })}
          </div>

          {/* View Mode & Maximize Button */}
          <div className="flex items-center gap-2">
            {/* Weekend stats button */}
            <button
              onClick={() => setShowWeekendStats(!showWeekendStats)}
              className={`px-2.5 py-1 text-xs font-medium rounded-lg border transition-colors flex items-center gap-1.5 cursor-pointer ${
                showWeekendStats
                  ? 'bg-amber-50 border-amber-300 text-amber-900 font-semibold'
                  : 'bg-white border-[#CBD5E1] text-slate-600 hover:bg-[#F8FAFC]'
              }`}
            >
              <Briefcase className="w-3.5 h-3.5 text-amber-600" />
              <span>Đi KH cuối tuần ({weekendOvertimeStats.length} buổi)</span>
              {showWeekendStats ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            </button>

            <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg border border-slate-200">
              <button
                onClick={() => setViewMode('matrix')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'matrix' ? 'bg-white text-[#4F46E5] font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <TableIcon className="w-3.5 h-3.5 text-[#4F46E5]" />
                <span>Lịch ma trận (Sáng/Chiều)</span>
              </button>
              <button
                onClick={() => setViewMode('list')}
                className={`px-2.5 py-1 text-xs font-medium rounded-md transition-colors flex items-center gap-1.5 cursor-pointer ${
                  viewMode === 'list' ? 'bg-white text-[#4F46E5] font-semibold shadow-xs' : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                <ListIcon className="w-3.5 h-3.5 text-slate-500" />
                <span>Danh sách</span>
              </button>
            </div>

            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-[#CBD5E1] transition-colors cursor-pointer"
              title={isExpanded ? 'Thu nhỏ giao diện' : 'Mở rộng toàn màn hình'}
            >
              {isExpanded ? <Minimize2 className="w-4 h-4" /> : <Maximize2 className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Row 2: Week Navigator & Quick Search */}
        <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrevWeek}
              className="p-1.5 border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg text-slate-600 cursor-pointer"
              title="Tuần trước"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>

            <button
              onClick={handleToday}
              className="px-2.5 py-1 font-semibold text-[#4F46E5] hover:bg-[#EEF2FF] border border-[#CBD5E1] rounded-lg cursor-pointer transition-colors"
            >
              Hôm nay (05/10)
            </button>

            <button
              onClick={handleNextWeek}
              className="p-1.5 border border-[#CBD5E1] hover:bg-[#F8FAFC] rounded-lg text-slate-600 cursor-pointer"
              title="Tuần sau"
            >
              <ChevronRight className="w-4 h-4" />
            </button>

            <div className="font-semibold text-slate-900 ml-1 flex items-center gap-1.5">
              <CalendarIcon className="w-4 h-4 text-[#4F46E5]" />
              <span>
                Tuần: {formatDayMonthVN(weekDays[0].date)} → {formatDayMonthVN(weekDays[6].date)}/2026 (Đủ 7 ngày T2 - CN)
              </span>
            </div>

            <input
              type="date"
              value={formatDateISO(currentMonday)}
              onChange={e => handleDateJump(e.target.value)}
              className="border border-[#CBD5E1] rounded-lg px-2 py-0.5 text-xs text-slate-700 font-mono ml-2 focus:border-[#4F46E5] focus:ring-2 focus:ring-[#E0E7FF]"
              title="Chọn ngày để nhảy đến tuần tương ứng"
            />
          </div>

          {/* Member Search within group */}
          <div className="relative min-w-[200px] max-w-xs">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-2 text-slate-400" />
            <input
              type="text"
              placeholder={`Tìm trong ${currentGroupObj?.name}...`}
              value={searchMember}
              onChange={e => setSearchMember(e.target.value)}
              className="w-full pl-8 pr-3 py-1 border border-slate-200 rounded-md focus:outline-hidden focus:border-slate-400 text-xs"
            />
          </div>
        </div>
      </div>

      {/* 2. Color Legend (Strict Rule 4) */}
      <div className="bg-slate-100/80 px-3 py-2 rounded-md border border-slate-200/90 flex flex-wrap items-center justify-between gap-3 text-[11px] text-slate-700">
        <div className="flex flex-wrap items-center gap-3">
          <span className="font-bold text-slate-800 flex items-center gap-1">
            <Info className="w-3.5 h-3.5 text-blue-600" /> Quy định màu ô lịch:
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-white border border-slate-300"></span>
            <span>Trắng: <strong>Chưa có lịch</strong></span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-amber-200 border border-amber-400"></span>
            <span>Vàng: <strong>Nửa ngày</strong> (1 buổi)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-emerald-200 border border-emerald-400"></span>
            <span>Xanh: <strong>Cả ngày</strong> (đủ 2 buổi)</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="w-3 h-3 rounded-xs bg-rose-200 border border-rose-400"></span>
            <span>Đỏ: <strong>Đã hủy</strong></span>
          </span>
        </div>

        <div className="text-[10px] text-slate-500 font-medium">
          Mỗi nhân sự đúng 2 dòng: Sáng & Chiều · Tuần luôn đủ 7 ngày
        </div>
      </div>

      {/* 3. Collapsible Section: Weekend Client Visits Tracking */}
      {showWeekendStats && (
        <div className="bg-white rounded-lg border border-amber-300 shadow-sm p-4 space-y-3">
          <div className="flex items-center justify-between border-b border-amber-100 pb-2">
            <div className="flex items-center gap-2">
              <Briefcase className="w-4 h-4 text-amber-600" />
              <h3 className="font-bold text-slate-900 text-xs uppercase tracking-wide">
                Thống Kê Đi Khách Hàng Cuối Tuần (Theo dõi Nghỉ Bù) · Tháng {monthYear}
              </h3>
            </div>
            <span className="text-xs font-semibold px-2.5 py-0.5 bg-amber-100 text-amber-900 rounded-full font-mono">
              Tổng số: {weekendOvertimeStats.length} buổi đã thực hiện
            </span>
          </div>

          <p className="text-[11px] text-slate-500">
            Chỉ thống kê các buổi Thứ Bảy và Chủ Nhật đã đánh dấu theo dõi nghỉ bù, đã thực hiện và chưa bị hủy.
            (Không tự động quy đổi hoặc cộng trừ quỹ nghỉ bù; không tự sinh điểm KPI).
          </p>

          <div className="overflow-x-auto max-h-56">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-amber-50/70 border-b border-amber-200 text-amber-950 font-semibold text-[11px]">
                  <th className="py-1.5 px-2.5">Ngày</th>
                  <th className="py-1.5 px-2.5">Thứ</th>
                  <th className="py-1.5 px-2.5">Nhân viên</th>
                  <th className="py-1.5 px-2.5">Nhóm</th>
                  <th className="py-1.5 px-2.5">Buổi</th>
                  <th className="py-1.5 px-2.5">Hình thức</th>
                  <th className="py-1.5 px-2.5">Khách hàng / Nội dung</th>
                  <th className="py-1.5 px-2.5">Trạng thái</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {weekendOvertimeStats.map(({ schedule: sch, member: mem, dayName, sessionName }) => (
                  <tr key={sch.id} className="hover:bg-slate-50">
                    <td className="py-1.5 px-2.5 font-mono text-slate-700">{sch.date}</td>
                    <td className="py-1.5 px-2.5 font-medium text-slate-800">{dayName}</td>
                    <td className="py-1.5 px-2.5 font-bold text-slate-900">{mem?.fullName || sch.onbCode}</td>
                    <td className="py-1.5 px-2.5 text-slate-600">{mem?.currentGroup}</td>
                    <td className="py-1.5 px-2.5 font-semibold text-blue-700">{sessionName}</td>
                    <td className="py-1.5 px-2.5 font-mono text-[11px]">{sch.workTypeCode}</td>
                    <td className="py-1.5 px-2.5 font-medium text-slate-800">{sch.customerOrTask}</td>
                    <td className="py-1.5 px-2.5">
                      <span className="text-[10px] px-1.5 py-0.5 bg-emerald-100 text-emerald-800 rounded-xs font-semibold">
                        Đã thực hiện
                      </span>
                    </td>
                  </tr>
                ))}
                {weekendOvertimeStats.length === 0 && (
                  <tr>
                    <td colSpan={8} className="py-6 text-center text-slate-400 text-xs">
                      Không có lịch đi khách hàng cuối tuần nào được ghi nhận trong tháng {monthYear}.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 4. Empty Group Alert */}
      {groupMembers.length === 0 && (
        <div className="bg-white p-12 rounded-lg border-2 border-dashed border-slate-200 text-center space-y-2">
          <AlertCircle className="w-8 h-8 text-amber-500 mx-auto" />
          <h3 className="font-semibold text-slate-800 text-sm">
            Nhóm chưa có nhân viên. Vui lòng cập nhật tại Thiết lập hệ thống.
          </h3>
          <p className="text-xs text-slate-500">
            Hãy vào phân hệ <strong>Thiết lập hệ thống → Quản lý nhân sự</strong> để thêm nhân sự hoặc phân bổ vào nhóm này.
          </p>
        </div>
      )}

      {/* 5. MAIN VIEW: Matrix Layout with EXACTLY 2 Rows per Employee (Sáng / Chiều) & ALWAYS 7 DAYS */}
      {viewMode === 'matrix' && groupMembers.length > 0 && (
        <div className="bg-white rounded-lg border-2 border-slate-300 shadow-xs overflow-hidden">
          <div className="overflow-x-auto overflow-y-auto max-h-[76vh]">
            <table className="w-full border-collapse text-xs select-none">
              {/* Sticky Two-Tier Header */}
              <thead className="sticky top-0 z-30 bg-[#F1F5F9] border-b border-[#CBD5E1] shadow-xs">
                {/* Tier 1: Day Names (Monday to Sunday) */}
                <tr className="divide-x divide-[#E2E8F0]">
                  <th
                    rowSpan={2}
                    className="py-2 px-2.5 bg-[#F1F5F9] text-[#0F172A] font-bold uppercase tracking-wider text-left sticky left-0 z-40 w-32 min-w-[125px] border-r border-[#CBD5E1]"
                  >
                    Nhân viên ONB
                  </th>

                  <th
                    rowSpan={2}
                    className="py-2 px-1 bg-[#F1F5F9] text-[#334155] font-bold uppercase tracking-wider text-center sticky left-[125px] z-40 w-14 min-w-[56px] border-r border-[#CBD5E1]"
                  >
                    Buổi
                  </th>

                  {weekDays.map(day => (
                    <th
                      key={day.dateString}
                      colSpan={2}
                      className={`py-1.5 px-2 text-center font-bold tracking-tight uppercase border-r border-[#CBD5E1] ${
                        day.isToday
                          ? 'bg-[#EEF2FF] text-[#4F46E5]'
                          : day.isWeekend
                          ? 'bg-[#FFFBEB] text-[#92400E]'
                          : 'bg-[#F1F5F9] text-[#0F172A]'
                      }`}
                    >
                      <div className="flex items-center justify-center gap-1.5">
                        <span>{day.dayName}</span>
                        <span className="font-mono text-[11px] font-normal text-[#64748B]">
                          ({day.dayMonth})
                        </span>
                        {day.isToday && (
                          <span className="text-[10px] bg-[#4F46E5] text-white px-1.5 py-0.2 rounded-xs font-medium">
                            Hôm nay
                          </span>
                        )}
                        {day.isLockedDay && (
                          <span title="Ngày thuộc tháng cũ (Chỉ xem)">
                            <Lock className="w-3 h-3 text-amber-600 ml-0.5 inline" />
                          </span>
                        )}
                      </div>
                    </th>
                  ))}
                </tr>

                {/* Tier 2: Two Sub-Columns per Day (Hình thức & Khách hàng/Nội dung) */}
                <tr className="divide-x divide-[#E2E8F0] border-t border-[#E2E8F0] text-[10px] text-[#475569] uppercase font-semibold">
                  {weekDays.map(day => (
                    <React.Fragment key={`sub_${day.dateString}`}>
                      <th className="py-1 px-1.5 bg-[#F1F5F9] text-[#475569] w-18 min-w-[65px] text-center border-r border-[#E2E8F0]">
                        Hình thức
                      </th>
                      <th className="py-1 px-2 bg-[#F1F5F9] text-[#475569] min-w-[130px] text-left border-r border-[#CBD5E1]">
                        Khách hàng / Nội dung
                      </th>
                    </React.Fragment>
                  ))}
                </tr>
              </thead>

              {/* Table Body: Exactly 2 Rows per Employee */}
              <tbody className="divide-y-2 divide-slate-300">
                {groupMembers.map(member => {
                  // Precompute schedules and colors for all 7 days for this member
                  const memberDaysData = weekDays.map(day => {
                    const key = `${member.code}_${day.dateString}`;
                    const dayEntry = scheduleIndex.get(key) || { mornings: [], afternoons: [], others: [] };
                    const morningSchedules = dayEntry.mornings;
                    const afternoonSchedules = dayEntry.afternoons;
                    const morningSch = dayEntry.morning || null;
                    const afternoonSch = dayEntry.afternoon || null;

                    const colors = getDaySessionColors(morningSchedules, afternoonSchedules);
                    return {
                      day,
                      morningSchedules,
                      afternoonSchedules,
                      morningSch,
                      afternoonSch,
                      colors
                    };
                  });

                  return (
                    <React.Fragment key={member.code}>
                      {/* ROW 1: BUỔI SÁNG */}
                      <tr className="hover:bg-slate-50/50 transition-colors divide-x-2 divide-slate-300 group">
                        {/* Merged Member Column (rowSpan 2) */}
                        <td
                          rowSpan={2}
                          className="py-2.5 px-3 bg-white sticky left-0 z-20 border-r border-slate-300 align-middle text-left shadow-xs"
                        >
                          <div className="font-bold text-sm text-slate-900 leading-tight">
                            {member.displayName || member.code}
                          </div>
                          <div className="text-[11px] text-slate-500 leading-tight mt-0.5">
                            {member.fullName}
                          </div>
                          {!member.isActive && (
                            <span className="text-[10px] text-rose-600 font-medium block mt-0.5">
                              (Đã ngừng HĐ)
                            </span>
                          )}
                        </td>

                        {/* Session Column: SÁNG */}
                        <td className="py-2 px-1 bg-slate-50 font-bold text-xs text-blue-900 text-center sticky left-[125px] z-20 border-r-2 border-slate-300 align-middle">
                          Sáng
                        </td>

                        {/* 7 Days: SÁNG Cells */}
                        {memberDaysData.map(({ day, morningSchedules, colors }) => {
                          const bgClass = getColorClasses(colors.morningColor);
                          const canAdd = !day.isLockedDay && (session?.isMasterAdmin || session?.onbCode === member.code);

                          return (
                            <td
                              key={`morning_${day.dateString}`}
                              colSpan={2}
                              className={`p-0 align-top border-r-2 border-slate-300 border-b border-slate-200 ${bgClass}`}
                            >
                              {morningSchedules.length > 0 ? (
                                <div className="flex flex-col gap-1 p-1 h-full">
                                  {morningSchedules.map((mSch) => {
                                    const isCancelled = mSch.status === 'Đã hủy' || mSch.status === 'Hủy';
                                    const resolved = resolveWorkForm(mSch.workTypeCode);
                                    const isTransferred = mSch.isTransferred || (mSch.transferHistory && mSch.transferHistory.length > 0);
                                    return (
                                      <div
                                        key={mSch.id}
                                        onClick={() => handleOpenDetail(mSch)}
                                        className={`p-1.5 cursor-pointer rounded-xs flex items-start text-left hover:bg-black/5 transition-colors ${morningSchedules.length > 1 ? 'border border-slate-300/80 bg-white/70 shadow-2xs' : ''}`}
                                        title="Bấm để xem chi tiết hoặc chỉnh sửa"
                                      >
                                        {/* Sub-col 1: Work Type */}
                                        <div className="w-18 min-w-[65px] shrink-0 pr-1 text-center">
                                          {isCancelled ? (
                                            <span className="inline-block text-[9px] font-bold px-1 py-0.5 bg-rose-600 text-white rounded-xs leading-none">
                                              ĐÃ HỦY
                                            </span>
                                          ) : (
                                            <span className="inline-block font-mono font-semibold text-[10px] px-1 py-0.5 rounded-xs border border-slate-300/80 bg-white/80 leading-none truncate max-w-full">
                                              {resolved?.form.shortLabel || mSch.workTypeCode}
                                            </span>
                                          )}
                                        </div>

                                        {/* Sub-col 2: Customer / Content */}
                                        <div className="flex-1 min-w-0">
                                          <div className={`font-semibold text-xs leading-snug break-words ${isCancelled ? 'line-through text-rose-800' : ''}`}>
                                            {mSch.customerOrTask}
                                          </div>
                                          {mSch.notes && (
                                            <div className="text-[10px] text-slate-500 leading-tight mt-0.5 line-clamp-1">
                                              {mSch.notes}
                                            </div>
                                          )}
                                          <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                            {isTransferred && (
                                              <span className="text-[9px] px-1 py-0.2 bg-purple-100 text-purple-800 border border-purple-200 rounded-xs font-semibold inline-flex items-center gap-0.5" title="Lịch đã được chuyển giao nhân sự">
                                                <ArrowRightLeft className="w-2.5 h-2.5" /> Đã chuyển
                                              </span>
                                            )}
                                            {mSch.trackCompensatoryLeave && (
                                              <span className="text-[9px] px-1 bg-amber-100 text-amber-900 rounded-xs font-medium inline-block">
                                                Nghỉ bù
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div
                                  onClick={() => handleOpenAddForSlot(day.dateString, member.code, 'Sáng')}
                                  className="h-full min-h-[42px] flex items-center justify-center cursor-pointer group/add text-slate-300 hover:text-blue-600 hover:bg-blue-50/40 transition-colors"
                                  title={canAdd ? `Thêm lịch Sáng cho ${member.code}` : 'Chưa có lịch'}
                                >
                                  {canAdd && (
                                    <span className="opacity-0 group-hover/add:opacity-100 text-[10px] font-medium flex items-center gap-0.5">
                                      <Plus className="w-2.5 h-2.5" /> Sáng
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>

                      {/* ROW 2: BUỔI CHIỀU */}
                      <tr className="hover:bg-slate-50/50 transition-colors divide-x-2 divide-slate-300 group">
                        {/* Session Column: CHIỀU */}
                        <td className="py-2 px-1 bg-slate-50 font-bold text-xs text-amber-900 text-center sticky left-[125px] z-20 border-r-2 border-slate-300 align-middle">
                          Chiều
                        </td>

                        {/* 7 Days: CHIỀU Cells */}
                        {memberDaysData.map(({ day, afternoonSchedules, colors }) => {
                          const bgClass = getColorClasses(colors.afternoonColor);
                          const canAdd = !day.isLockedDay && (session?.isMasterAdmin || session?.onbCode === member.code);

                          return (
                            <td
                              key={`afternoon_${day.dateString}`}
                              colSpan={2}
                              className={`p-0 align-top border-r-2 border-slate-300 ${bgClass}`}
                            >
                              {afternoonSchedules.length > 0 ? (
                                <div className="flex flex-col gap-1 p-1 h-full">
                                  {afternoonSchedules.map((aSch) => {
                                    const isCancelled = aSch.status === 'Đã hủy' || aSch.status === 'Hủy';
                                    const resolved = resolveWorkForm(aSch.workTypeCode);
                                    const isTransferred = aSch.isTransferred || (aSch.transferHistory && aSch.transferHistory.length > 0);
                                    return (
                                      <div
                                        key={aSch.id}
                                        onClick={() => handleOpenDetail(aSch)}
                                        className={`p-1.5 cursor-pointer rounded-xs flex items-start text-left hover:bg-black/5 transition-colors ${afternoonSchedules.length > 1 ? 'border border-slate-300/80 bg-white/70 shadow-2xs' : ''}`}
                                        title="Bấm để xem chi tiết hoặc chỉnh sửa"
                                      >
                                        {/* Sub-col 1: Work Type */}
                                        <div className="w-18 min-w-[65px] shrink-0 pr-1 text-center">
                                          {isCancelled ? (
                                            <span className="inline-block text-[9px] font-bold px-1 py-0.5 bg-rose-600 text-white rounded-xs leading-none">
                                              ĐÃ HỦY
                                            </span>
                                          ) : (
                                            <span className="inline-block font-mono font-semibold text-[10px] px-1 py-0.5 rounded-xs border border-slate-300/80 bg-white/80 leading-none truncate max-w-full">
                                              {resolved?.form.shortLabel || aSch.workTypeCode}
                                            </span>
                                          )}
                                        </div>

                                        {/* Sub-col 2: Customer / Content */}
                                        <div className="flex-1 min-w-0">
                                          <div className={`font-semibold text-xs leading-snug break-words ${isCancelled ? 'line-through text-rose-800' : ''}`}>
                                            {aSch.customerOrTask}
                                          </div>
                                          {aSch.notes && (
                                            <div className="text-[10px] text-slate-500 leading-tight mt-0.5 line-clamp-1">
                                              {aSch.notes}
                                            </div>
                                          )}
                                          <div className="flex items-center gap-1 flex-wrap mt-0.5">
                                            {isTransferred && (
                                              <span className="text-[9px] px-1 py-0.2 bg-purple-100 text-purple-800 border border-purple-200 rounded-xs font-semibold inline-flex items-center gap-0.5" title="Lịch đã được chuyển giao nhân sự">
                                                <ArrowRightLeft className="w-2.5 h-2.5" /> Đã chuyển
                                              </span>
                                            )}
                                            {aSch.trackCompensatoryLeave && (
                                              <span className="text-[9px] px-1 bg-amber-100 text-amber-900 rounded-xs font-medium inline-block">
                                                Nghỉ bù
                                              </span>
                                            )}
                                          </div>
                                        </div>
                                      </div>
                                    );
                                  })}
                                </div>
                              ) : (
                                <div
                                  onClick={() => handleOpenAddForSlot(day.dateString, member.code, 'Chiều')}
                                  className="h-full min-h-[42px] flex items-center justify-center cursor-pointer group/add text-slate-300 hover:text-blue-600 hover:bg-blue-50/40 transition-colors"
                                  title={canAdd ? `Thêm lịch Chiều cho ${member.code}` : 'Chưa có lịch'}
                                >
                                  {canAdd && (
                                    <span className="opacity-0 group-hover/add:opacity-100 text-[10px] font-medium flex items-center gap-0.5">
                                      <Plus className="w-2.5 h-2.5" /> Chiều
                                    </span>
                                  )}
                                </div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    </React.Fragment>
                  );
                })}

                {groupMembers.length === 0 && (
                  <tr>
                    <td
                      colSpan={2 + 7 * 2}
                      className="py-12 text-center text-slate-400 text-xs"
                    >
                      Không tìm thấy nhân viên nào phù hợp với bộ lọc.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. SECONDARY VIEW: List Layout */}
      {viewMode === 'list' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
          <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
            <span className="font-semibold text-slate-800">
              Tra Cứu Lịch Toàn Bộ ({schedules.filter(s => s.monthYear === monthYear).length} lịch trong tháng {monthYear})
            </span>
          </div>

          <div className="overflow-x-auto max-h-[70vh]">
            <table className="w-full text-left border-collapse text-xs">
              <thead className="bg-[#F1F5F9] sticky top-0 z-10 border-b border-[#E2E8F0] text-[#475569] font-semibold uppercase text-[11px]">
                <tr>
                  <th className="py-2.5 px-3">Ngày</th>
                  <th className="py-2.5 px-3">Buổi</th>
                  <th className="py-2.5 px-3">Nhân sự</th>
                  <th className="py-2.5 px-3">Hình thức</th>
                  <th className="py-2.5 px-3">Khách hàng / Nội dung</th>
                  <th className="py-2.5 px-3">Trạng thái</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#E2E8F0]">
                {schedules
                  .filter(s => s.monthYear === monthYear)
                  .sort((a, b) => b.date.localeCompare(a.date))
                  .map(sch => {
                    const mem = members.find(m => m.code === sch.onbCode);
                    const isCancelled = sch.status === 'Đã hủy' || sch.status === 'Hủy';

                    return (
                      <tr key={sch.id} className={isCancelled ? 'bg-[#FEF2F2]' : 'hover:bg-[#F8FAFC]'}>
                        <td className="py-2 px-3 font-mono text-slate-700 whitespace-nowrap">{sch.date}</td>
                        <td className="py-2 px-3 whitespace-nowrap font-bold text-[#4F46E5]">{sch.sessionOfDay || 'Sáng'}</td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="font-bold text-slate-900">{mem?.displayName || sch.onbCode}</span>
                          <span className="text-[10px] text-slate-400 block">{mem?.currentGroup}</span>
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          <span className="font-mono bg-slate-100 px-1.5 py-0.5 rounded-xs font-medium text-slate-800">
                            {sch.workTypeCode}
                          </span>
                        </td>
                        <td className="py-2 px-3">
                          <div className={`font-medium ${isCancelled ? 'line-through text-rose-800' : 'text-slate-900'}`}>
                            {sch.customerOrTask}
                          </div>
                          {sch.notes && <div className="text-[11px] text-slate-500">{sch.notes}</div>}
                          {(sch.isTransferred || (sch.transferHistory && sch.transferHistory.length > 0)) && (
                            <span className="text-[9px] px-1.5 py-0.5 bg-purple-100 text-purple-800 border border-purple-200 rounded-xs font-semibold inline-flex items-center gap-0.5 mt-0.5">
                              <ArrowRightLeft className="w-2.5 h-2.5" /> Đã chuyển lịch
                            </span>
                          )}
                        </td>
                        <td className="py-2 px-3 whitespace-nowrap">
                          {isCancelled ? (
                            <span className="text-[10px] px-1.5 py-0.5 bg-rose-100 text-rose-800 rounded-xs font-bold">
                              Đã hủy
                            </span>
                          ) : (
                            <span className="text-slate-700">{sch.status}</span>
                          )}
                        </td>
                        <td className="py-2 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleOpenDetail(sch)}
                            className="p-1 text-slate-400 hover:text-slate-800"
                            title="Chi tiết"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 7. MODAL: View Schedule Detail & Quick In-Place Cancel */}
      {detailSchedule && !isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-semibold text-slate-900 text-sm">Chi Tiết Lịch Làm Việc</h3>
                <span className="text-xs font-mono text-slate-500">
                  {detailSchedule.date} · Buổi {detailSchedule.sessionOfDay || 'Sáng'}
                </span>
              </div>
              <button onClick={() => setDetailSchedule(null)} className="text-slate-400">✕</button>
            </div>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Nhân sự thực hiện:</span>
                <span className="font-bold text-slate-900">
                  {members.find(m => m.code === detailSchedule.onbCode)?.fullName || detailSchedule.onbCode} ({detailSchedule.onbCode})
                </span>
              </div>

              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Hình thức công việc:</span>
                <span className="font-semibold text-slate-900 bg-slate-100 px-2 py-0.5 rounded-xs">
                  {resolveWorkForm(detailSchedule.workTypeCode).displayName}
                </span>
              </div>

              <div>
                <span className="text-slate-500 block mb-0.5">Khách hàng & Nội dung:</span>
                <div className={`p-2.5 rounded-md font-medium border ${
                  detailSchedule.status === 'Đã hủy'
                    ? 'bg-rose-50 border-rose-200 text-rose-900 line-through'
                    : 'bg-slate-50 border-slate-200 text-slate-900'
                }`}>
                  {detailSchedule.customerOrTask}
                </div>
              </div>

              {detailSchedule.notes && (
                <div>
                  <span className="text-slate-500 block mb-0.5">Ghi chú công việc:</span>
                  <div className="p-2 bg-slate-50 rounded-md text-slate-700">{detailSchedule.notes}</div>
                </div>
              )}

              {/* Nhật ký & Thông tin chuyển lịch */}
              {(detailSchedule.isTransferred || (detailSchedule.transferHistory && detailSchedule.transferHistory.length > 0)) && (
                <div className="p-3 bg-purple-50 border border-purple-200 rounded-md space-y-2">
                  <div className="flex items-center gap-1.5 font-bold text-purple-900 text-xs">
                    <ArrowRightLeft className="w-4 h-4 text-purple-700 shrink-0" />
                    <span>Lịch đã được chuyển giao nhân sự</span>
                  </div>

                  {/* Lần chuyển gần nhất */}
                  {(() => {
                    const history = detailSchedule.transferHistory || [];
                    const latest = history[history.length - 1];
                    if (!latest) return null;
                    return (
                      <div className="bg-white/90 p-2.5 rounded border border-purple-100 space-y-1 text-xs">
                        <div className="font-semibold text-purple-950">
                          Chuyển từ <span className="font-bold text-slate-900">{latest.fromMemberName}</span> sang <span className="font-bold text-purple-700">{latest.toMemberName}</span>.
                        </div>
                        <div className="text-[11px] text-slate-600">
                          <span className="font-medium text-slate-700">Người thực hiện:</span> {latest.performedByName}.
                        </div>
                        <div className="text-[11px] text-slate-600">
                          <span className="font-medium text-slate-700">Thời điểm:</span> {formatDateTimeVi(latest.transferredAt)}.
                        </div>
                        {latest.reason && (
                          <div className="text-[11px] text-slate-700">
                            <span className="font-medium text-slate-700">Lý do:</span> {latest.reason}.
                          </div>
                        )}
                      </div>
                    );
                  })()}

                  {/* Danh sách toàn bộ lịch sử nếu chuyển nhiều lần */}
                  {detailSchedule.transferHistory && detailSchedule.transferHistory.length > 1 && (
                    <details className="text-[11px] text-purple-900 mt-1 cursor-pointer">
                      <summary className="font-semibold hover:underline">
                        Mục lịch sử chuyển lịch ({detailSchedule.transferHistory.length} lần chuyển)
                      </summary>
                      <div className="mt-2 space-y-1.5 pl-2 border-l-2 border-purple-300">
                        {detailSchedule.transferHistory.map((log, idx) => (
                          <div key={log.id || idx} className="py-1 border-b border-purple-100 last:border-0">
                            <div className="font-medium text-slate-900">
                              Lần {idx + 1}: {log.fromMemberName} → {log.toMemberName}
                            </div>
                            <div className="text-[10px] text-slate-500">
                              Người thực hiện: {log.performedByName} · Thời điểm: {formatDateTimeVi(log.transferredAt)}
                            </div>
                            {log.reason && (
                              <div className="text-[10px] text-slate-600 italic">
                                Lý do: {log.reason}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    </details>
                  )}
                </div>
              )}

              <div className="flex items-center justify-between py-1 border-b border-slate-100">
                <span className="text-slate-500">Trạng thái:</span>
                {detailSchedule.status === 'Đã hủy' ? (
                  <span className="font-bold text-rose-700 bg-rose-100 px-2 py-0.5 rounded-xs">
                    ĐÃ HỦY
                  </span>
                ) : (
                  <span className="font-medium text-emerald-700">{detailSchedule.status}</span>
                )}
              </div>

              {detailSchedule.trackCompensatoryLeave && (
                <div className="p-2 bg-amber-50 border border-amber-200 rounded-md text-amber-900 text-[11px] flex items-center gap-1.5">
                  <Briefcase className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  <span>Đi khách hàng cuối tuần, theo dõi nghỉ bù.</span>
                </div>
              )}
            </div>

            {/* Modal Actions */}
            <div className="pt-3 border-t border-slate-100 space-y-2">
              <div className="flex items-center justify-between gap-2 flex-wrap">
                {/* Convert to progress */}
                {detailSchedule.status !== 'Đã hủy' && !detailSchedule.relatedProgressId && !detailSchedule.date.startsWith('2026-0') && (
                  <button
                    onClick={async () => {
                      await onConvertToProgress(detailSchedule.id);
                      setDetailSchedule(null);
                    }}
                    className="px-2.5 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors flex items-center gap-1"
                  >
                    <CheckCircle className="w-3.5 h-3.5" /> Ghi nhận điểm
                  </button>
                )}

                <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                  {canEditSchedule(detailSchedule) ? (
                    <>
                      {/* Nút Chuyển lịch đưa ra hàng thao tác cửa sổ chi tiết */}
                      {onTransferSchedule && detailSchedule.status !== 'Đã hủy' && (
                        <button
                          onClick={() => handleOpenTransferModal(detailSchedule)}
                          className="px-2.5 py-1.5 text-xs text-indigo-700 hover:bg-indigo-50 border border-indigo-200 rounded-md font-medium flex items-center gap-1 transition-colors"
                          title="Chuyển lịch sang nhân sự khác"
                        >
                          <ArrowRightLeft className="w-3.5 h-3.5" />
                          Chuyển lịch
                        </button>
                      )}

                      {/* Hủy buổi này / Hủy cả ngày */}
                      {detailSchedule.status !== 'Đã hủy' && (
                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => handleCancelClick(detailSchedule, false)}
                            className="px-2.5 py-1.5 text-xs text-amber-700 hover:bg-amber-50 border border-amber-200 rounded-md font-medium"
                            title="Chỉ hủy buổi này"
                          >
                            Hủy buổi này
                          </button>
                          {detailOtherSession && detailOtherSession.status !== 'Đã hủy' && (
                            <button
                              onClick={() => handleCancelClick(detailSchedule, true)}
                              className="px-2.5 py-1.5 text-xs text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-md font-semibold"
                              title="Hủy cả ngày (Sáng và Chiều)"
                            >
                              Hủy cả ngày
                            </button>
                          )}
                        </div>
                      )}

                      {/* NÚT XÓA LỊCH: Đưa ra cửa sổ Chi tiết Lịch Làm Việc, màu đỏ rõ ràng để phân biệt */}
                      <button
                        onClick={() => handleOpenDeleteConfirm(detailSchedule)}
                        className="px-2.5 py-1.5 text-xs text-rose-700 hover:bg-rose-50 border border-rose-300 rounded-md font-medium flex items-center gap-1 transition-colors"
                        title="Xóa lịch làm việc"
                      >
                        <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                        Xóa lịch
                      </button>

                      {/* Sửa lịch Button */}
                      <button
                        onClick={() => handleOpenEditFromDetail(detailSchedule)}
                        className="px-3.5 py-1.5 text-xs bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white font-semibold rounded-lg flex items-center gap-1 cursor-pointer transition-colors shadow-xs"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                        Sửa lịch
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={() => setDetailSchedule(null)}
                      className="px-4 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-md text-xs font-medium"
                    >
                      Đóng
                    </button>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 8. MODAL: Create / Edit Form (Simplified, Exact 6 Forms, Full Day Checkbox) */}
      {isFormModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-slate-900 text-sm">
                {editingSchedule ? 'Chỉnh Sửa Lịch Làm Việc' : 'Thêm Mới Lịch Làm Việc'}
              </h3>
              <button onClick={() => setIsFormModalOpen(false)} className="text-slate-400">✕</button>
            </div>

            {formError && (
              <div className="p-2.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
                {formError}
              </div>
            )}

            <form onSubmit={handleSubmitForm} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                {/* Personnel */}
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nhân sự thực hiện *</label>
                  <select
                    value={formData.onbCode}
                    onChange={e => setFormData({ ...formData, onbCode: e.target.value })}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white"
                  >
                    {members.filter(m => m.isActive || m.code === formData.onbCode).map(m => (
                      <option key={m.code} value={m.code}>
                        {m.fullName} ({m.code} - {m.currentGroup}) {!m.isActive ? '(Ngừng SD)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* Date */}
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Ngày làm việc *</label>
                  <input
                    type="date"
                    value={formData.date}
                    onChange={e => setFormData({ ...formData, date: e.target.value })}
                    className="w-full border border-slate-300 rounded-md p-2 font-mono"
                    required
                  />
                </div>
              </div>

              {/* Session / Full Day selection */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <span className="font-semibold text-slate-800">Buổi áp dụng:</span>
                    <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="sessionSelect"
                        checked={formData.sessionOfDay === 'Sáng' && !formData.isFullDay}
                        disabled={formData.isFullDay}
                        onChange={() => setFormData({ ...formData, sessionOfDay: 'Sáng' })}
                        className="text-blue-600"
                      />
                      <span>Sáng</span>
                    </label>
                    <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                      <input
                        type="radio"
                        name="sessionSelect"
                        checked={formData.sessionOfDay === 'Chiều' && !formData.isFullDay}
                        disabled={formData.isFullDay}
                        onChange={() => setFormData({ ...formData, sessionOfDay: 'Chiều' })}
                        className="text-amber-600"
                      />
                      <span>Chiều</span>
                    </label>
                  </div>
                </div>

                {/* Full Day Checkbox */}
                {!editingSchedule ? (
                  <label className="flex items-center gap-2 cursor-pointer pt-1 border-t border-slate-200/80 font-bold text-emerald-800">
                    <input
                      type="checkbox"
                      checked={formData.isFullDay}
                      onChange={e => setFormData({ ...formData, isFullDay: e.target.checked })}
                      className="w-4 h-4 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Cả ngày, áp dụng cho cả Sáng và Chiều</span>
                  </label>
                ) : (
                  <label className="flex items-center gap-2 cursor-pointer pt-1 border-t border-slate-200/80 text-blue-800 font-medium">
                    <input
                      type="checkbox"
                      checked={formData.applyToFullDay}
                      onChange={e => setFormData({ ...formData, applyToFullDay: e.target.checked })}
                      className="w-4 h-4 rounded text-blue-600 focus:ring-blue-500"
                    />
                    <span>Áp dụng cập nhật này cho cả ngày (cả Sáng và Chiều)</span>
                  </label>
                )}
              </div>

              {/* Exact 6 Work Form Options */}
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Hình thức công việc * (Chọn đúng 1 trong 6 hình thức)
                </label>
                <select
                  value={formData.workTypeCode}
                  onChange={e => setFormData({ ...formData, workTypeCode: e.target.value })}
                  className="w-full border border-slate-300 rounded-md p-2 bg-white font-medium text-slate-900"
                  required
                >
                  {STANDARDIZED_WORK_FORMS.map(wf => (
                    <option key={wf.code} value={wf.code}>
                      {wf.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Customer & Task Content (Not required for Nghỉ phép) */}
              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Khách hàng / Nội dung {formData.workTypeCode === 'Nghỉ phép' ? '(Tùy chọn)' : '*'}
                </label>
                <input
                  type="text"
                  placeholder={
                    formData.workTypeCode === 'Nghỉ phép'
                      ? 'Nghỉ phép / Nghỉ bù (Có thể ghi lý do hoặc để trống)...'
                      : 'Ví dụ: TOYOINK, DECO VINA, Lớp cơ bản 1 CRM...'
                  }
                  value={formData.customerOrTask}
                  onChange={e => setFormData({ ...formData, customerOrTask: e.target.value })}
                  className="w-full border border-slate-300 rounded-md p-2"
                  required={formData.workTypeCode !== 'Nghỉ phép'}
                />
              </div>

              {/* Ghi chú */}
              <div>
                <label className="block font-medium text-slate-700 mb-1">Ghi chú chi tiết (Không bắt buộc)</label>
                <input
                  type="text"
                  placeholder="Ghi chú thêm về nội dung, tiến độ, địa điểm..."
                  value={formData.notes}
                  onChange={e => setFormData({ ...formData, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-md p-2"
                />
              </div>

              {/* Weekend Overtime Tracking */}
              {(() => {
                const d = new Date(formData.date);
                const dayOfWeek = d.getDay();
                const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;

                if (!isWeekend) return null;

                return (
                  <div className="p-3 bg-amber-50 border border-amber-200 rounded-md space-y-2">
                    <label className="flex items-center gap-2 cursor-pointer font-bold text-amber-950">
                      <input
                        type="checkbox"
                        checked={formData.trackCompensatoryLeave}
                        onChange={e => setFormData({ ...formData, trackCompensatoryLeave: e.target.checked })}
                        className="w-4 h-4 rounded text-amber-600 focus:ring-amber-500"
                      />
                      <span>Đi khách hàng cuối tuần, theo dõi nghỉ bù</span>
                    </label>

                    <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium pl-6">
                      <input
                        type="checkbox"
                        checked={formData.isCompleted}
                        onChange={e => setFormData({ ...formData, isCompleted: e.target.checked })}
                        className="w-4 h-4 rounded text-emerald-600"
                      />
                      <span>Đã thực hiện (để phân biệt với lịch dự kiến)</span>
                    </label>
                  </div>
                );
              })()}

              <div className="flex items-center justify-between pt-3 border-t border-slate-100">
                {editingSchedule && (
                  <button
                    type="button"
                    onClick={() => handleOpenDeleteConfirm(editingSchedule)}
                    className="text-xs text-rose-600 hover:text-rose-800 hover:underline flex items-center gap-1 font-medium"
                  >
                    <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                    Xóa vĩnh viễn
                  </button>
                )}
                <div className="flex items-center gap-2 ml-auto">
                  <button
                    type="button"
                    onClick={() => setIsFormModalOpen(false)}
                    className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors shadow-xs"
                  >
                    {editingSchedule ? 'Lưu thay đổi' : 'Tạo mới'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 9. MODAL: Xác nhận Xóa Lịch Làm Việc (Hiển thị đầy đủ thông tin đối chiếu) */}
      {deleteConfirmSchedule && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 rounded-full text-rose-600 shrink-0 mt-0.5">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 text-sm">Xác nhận xóa lịch làm việc</h3>
                <p className="text-xs text-slate-700 mt-2 leading-relaxed">
                  Bạn có chắc chắn muốn xóa lịch <strong className="text-slate-900">“{deleteConfirmSchedule.customerOrTask}”</strong> của <strong className="text-slate-900">{members.find(m => m.code === deleteConfirmSchedule.onbCode)?.fullName || deleteConfirmSchedule.onbCode}</strong> vào <strong className="text-slate-900">Buổi {deleteConfirmSchedule.sessionOfDay || 'Sáng'}</strong>, ngày <strong className="text-slate-900">{formatDateVi(deleteConfirmSchedule.date)}</strong> không?
                </p>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  Thao tác này chỉ xóa duy nhất lịch buổi đang xem, không ảnh hưởng các buổi khác hoặc nhân sự khác.
                </p>
              </div>
            </div>

            {deleteScheduleError && (
              <div className="p-2.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{deleteScheduleError}</div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingSchedule}
                onClick={() => {
                  setDeleteConfirmSchedule(null);
                  setDeleteScheduleError('');
                }}
                className="px-3.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-md font-medium transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeletingSchedule}
                onClick={handleExecuteDelete}
                className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-md font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
              >
                {isDeletingSchedule ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa lịch</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. MODAL: Chuyển Lịch Làm Việc Giữa Các Nhân Sự (Có nhật ký chuyển) */}
      {transferModalSchedule && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-lg w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div className="flex items-center gap-2">
                <div className="p-2 bg-indigo-50 text-indigo-700 rounded-md">
                  <ArrowRightLeft className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-900 text-sm">Chuyển Lịch Làm Việc Giữa Nhân Sự</h3>
                  <span className="text-[11px] text-slate-500">
                    Chuyển người phụ trách của lịch làm việc và ghi nhận nhật ký
                  </span>
                </div>
              </div>
              <button
                type="button"
                disabled={isTransferring}
                onClick={() => {
                  setTransferModalSchedule(null);
                  setTransferError('');
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {transferError && (
              <div className="p-2.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{transferError}</div>
              </div>
            )}

            {/* Tóm tắt thông tin lịch */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Người phụ trách hiện tại:</span>
                <span className="font-bold text-slate-900">
                  {members.find(m => m.code === transferModalSchedule.onbCode)?.fullName || transferModalSchedule.onbCode} ({transferModalSchedule.onbCode})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Thời gian làm việc:</span>
                <span className="font-medium text-slate-800">
                  Buổi {transferModalSchedule.sessionOfDay || 'Sáng'}, ngày {formatDateVi(transferModalSchedule.date)}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-slate-500 shrink-0">Nội dung công việc:</span>
                <span className="font-medium text-slate-900 text-right">
                  {transferModalSchedule.customerOrTask} ({resolveWorkForm(transferModalSchedule.workTypeCode).displayName})
                </span>
              </div>
            </div>

            {/* Chọn Người nhận lịch */}
            <div className="space-y-1 text-xs">
              <label className="block font-semibold text-slate-700">
                Người nhận lịch <span className="text-rose-500">*</span>
              </label>
              <select
                value={targetOnbCode}
                onChange={e => setTargetOnbCode(e.target.value)}
                className="w-full border border-slate-300 rounded-md p-2 bg-white text-xs text-slate-800 focus:outline-hidden focus:border-indigo-500"
                disabled={isTransferring}
              >
                <option value="">-- Chọn nhân sự nhận lịch --</option>
                {members
                  .filter(m => m.isActive && m.code !== transferModalSchedule.onbCode)
                  .map(m => (
                    <option key={m.code} value={m.code}>
                      {m.fullName} ({m.code} - {m.currentGroup})
                    </option>
                  ))}
              </select>
              <p className="text-[11px] text-slate-500">
                Chỉ hiển thị các nhân sự đang hoạt động và không bao gồm người phụ trách hiện tại.
              </p>
            </div>

            {/* Cảnh báo nếu người nhận đã có lịch khác trong buổi này */}
            {(() => {
              if (!targetOnbCode) return null;
              const targetMember = members.find(m => m.code === targetOnbCode);
              const conflictSchedule = schedules.find(s =>
                s.onbCode === targetOnbCode &&
                s.date === transferModalSchedule.date &&
                (s.sessionOfDay || 'Sáng') === (transferModalSchedule.sessionOfDay || 'Sáng') &&
                s.status !== 'Đã hủy' &&
                s.status !== 'Hủy' &&
                s.id !== transferModalSchedule.id
              );
              if (!conflictSchedule) return null;
              return (
                <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-md text-amber-950 text-xs flex items-start gap-2">
                  <AlertCircle className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div className="flex-1 leading-relaxed">
                    <strong>Cảnh báo trùng buổi:</strong> {targetMember?.fullName} đã có lịch <em>“{conflictSchedule.customerOrTask}”</em> vào buổi này. Cả hai lịch sẽ cùng được bảo toàn và hiển thị, không ghi đè lịch hiện có.
                  </div>
                </div>
              );
            })()}

            {/* Lý do chuyển / Ghi chú */}
            <div className="space-y-1 text-xs">
              <label className="block font-semibold text-slate-700">
                Lý do chuyển / Ghi chú bàn giao
              </label>
              <textarea
                rows={2}
                value={transferReason}
                onChange={e => setTransferReason(e.target.value)}
                placeholder="Nhập lý do chuyển (ví dụ: Thay đổi phân công, hỗ trợ đột xuất, bận việc...)"
                className="w-full border border-slate-300 rounded-md p-2 text-xs focus:outline-hidden focus:border-indigo-500"
                disabled={isTransferring}
              />
              <p className="text-[11px] text-slate-400">
                Lý do này được lưu riêng vào Nhật ký chuyển lịch, không ghi đè ghi chú công việc.
              </p>
            </div>

            {/* Hiển thị rõ câu xác nhận trước khi chuyển */}
            {targetOnbCode && (
              <div className="p-2.5 bg-indigo-50/80 border border-indigo-200 rounded-md text-[11px] text-indigo-950 font-medium leading-relaxed">
                Chuyển lịch <strong className="text-slate-900">“{transferModalSchedule.customerOrTask}”</strong> ngày <strong className="text-slate-900">{formatDateVi(transferModalSchedule.date)}</strong>, <strong className="text-slate-900">Buổi {transferModalSchedule.sessionOfDay || 'Sáng'}</strong> từ <strong className="text-slate-900">{members.find(m => m.code === transferModalSchedule.onbCode)?.fullName || transferModalSchedule.onbCode}</strong> sang <strong className="text-indigo-900">{members.find(m => m.code === targetOnbCode)?.fullName || targetOnbCode}</strong>?
              </div>
            )}

            {/* Nút thao tác: Hủy / Xác nhận chuyển */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isTransferring}
                onClick={() => {
                  setTransferModalSchedule(null);
                  setTransferError('');
                }}
                className="px-3.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-md font-medium transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isTransferring || !targetOnbCode}
                onClick={handleExecuteTransfer}
                className="px-4 py-1.5 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
              >
                {isTransferring ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Đang chuyển...</span>
                  </>
                ) : (
                  <>
                    <ArrowRightLeft className="w-3.5 h-3.5" />
                    <span>Xác nhận chuyển</span>
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
