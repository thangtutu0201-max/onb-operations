import React, { useState, useEffect, useMemo } from 'react';
import {
  TrainingPackage,
  ONBMember,
  ONBGroup,
  CurrentUserSession,
  WorkSchedule,
  TrainingModuleCatalog,
  TrainingPriorityRegistration,
  ModuleInChargeMember,
  RecurringTrainingSchedule,
  SessionOfDay,
  DEFAULT_TRAINING_MODULES
} from '../types';
import { api } from '../services/api';
import {
  Shuffle,
  Lock,
  Unlock,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Users,
  RefreshCw,
  Plus,
  Copy,
  Trash2,
  Edit2,
  Calendar,
  AlertTriangle,
  Clock,
  ExternalLink,
  ChevronLeft,
  ChevronRight,
  BookmarkCheck,
  Check,
  X,
  Layers,
  ArrowRight,
  History,
  UserCheck,
  BookOpen,
  Search,
  ArrowLeftRight,
  ShieldAlert,
  Info,
  Filter,
  RotateCcw,
  UserX
} from 'lucide-react';
import { resolveMemberGroupAtDate } from '../utils/packageScoring';

interface AllocationTabProps {
  monthYear: string;
  onMonthChange?: (m: string) => void;
  isMonthLocked: boolean;
  isMonthReopened?: boolean;
  trainingPackages: TrainingPackage[];
  members: ONBMember[];
  groups: ONBGroup[];
  groupPoints: Record<string, number>;
  session: CurrentUserSession | null;
  schedules?: WorkSchedule[];
  onRefreshData: () => Promise<void>;
  onNavigateToSchedule?: (onbCode?: string, date?: string) => void;
}

export const WEEKDAY_OPTIONS = [
  { day: 2, label: 'Thứ Hai', short: 'T2' },
  { day: 3, label: 'Thứ Ba', short: 'T3' },
  { day: 4, label: 'Thứ Tư', short: 'T4' },
  { day: 5, label: 'Thứ Năm', short: 'T5' },
  { day: 6, label: 'Thứ Sáu', short: 'T6' },
  { day: 7, label: 'Thứ Bảy', short: 'T7' },
  { day: 8, label: 'Chủ nhật', short: 'CN' }
];

export function getWeekdayNumber(dateStr?: string): number {
  if (!dateStr || !dateStr.includes('-')) return 2;
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const jsDay = dt.getUTCDay();
  return jsDay === 0 ? 8 : jsDay + 1; // 2=Thứ Hai, ..., 8=Chủ nhật
}

export const AllocationTab: React.FC<AllocationTabProps> = ({
  monthYear,
  onMonthChange,
  isMonthLocked,
  isMonthReopened = false,
  trainingPackages,
  members,
  groups,
  groupPoints: propGroupPoints,
  session,
  schedules = [],
  onRefreshData,
  onNavigateToSchedule
}) => {
  const currentVietnamMonth = useMemo(() => {
    const now = new Date();
    const utc = now.getTime() + (now.getTimezoneOffset() * 60000);
    const vnTime = new Date(utc + (3600000 * 7));
    const y = vnTime.getFullYear();
    const m = String(vnTime.getMonth() + 1).padStart(2, '0');
    return `${y}-${m}`;
  }, []);

  const isPastMonth = monthYear < currentVietnamMonth;
  const isFutureMonth = monthYear > currentVietnamMonth;
  const isCurrentMonth = monthYear === currentVietnamMonth;
  const isAdmin = Boolean(session?.isMasterAdmin || session?.role === 'admin');
  const canManage = Boolean(
    session?.canManageAllocation &&
    !isMonthLocked &&
    (!isPastMonth || (isMonthReopened && isAdmin))
  );

  // Subtab navigation:
  // 'CLASSES': Danh sách lớp & Phân bổ
  // 'EXCLUSIONS': Danh sách loại trừ nhân sự (không nhận lớp trong tháng)
  // 'PRIORITIES': Đăng ký ưu tiên
  // 'HISTORY_LOOKUP': Tra cứu lịch sử nhân sự
  // 'IN_CHARGE': Người phụ trách module trong tháng (tùy chọn)
  const [activeSubTab, setActiveSubTab] = useState<'CLASSES' | 'EXCLUSIONS' | 'PRIORITIES' | 'HISTORY_LOOKUP' | 'IN_CHARGE'>('CLASSES');

  // Monthly Allocation Exclusions state (Requirement 2)
  const [excludedOnbCodes, setExcludedOnbCodes] = useState<string[]>([]);
  const [isSavingExclusions, setIsSavingExclusions] = useState(false);
  const [exclusionSearch, setExclusionSearch] = useState('');
  const [exclusionGroupFilter, setExclusionGroupFilter] = useState('');

  // Core training modules, in-charge members, and monthly priorities
  const [trainingModules, setTrainingModules] = useState<TrainingModuleCatalog[]>([]);
  const [priorities, setPriorities] = useState<TrainingPriorityRegistration[]>([]);
  const [inChargeMembers, setInChargeMembers] = useState<ModuleInChargeMember[]>([]);
  const [recurringSchedules, setRecurringSchedules] = useState<RecurringTrainingSchedule[]>([]);
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([]);
  const [isLoadingMeta, setIsLoadingMeta] = useState(false);

  // Draft Simulation State
  const [draftPlan, setDraftPlan] = useState<TrainingPackage[] | null>(null);
  const [draftGroupPoints, setDraftGroupPoints] = useState<Record<string, number> | null>(null);
  const [draftGroupCounts, setDraftGroupCounts] = useState<Record<string, number> | null>(null);
  const [draftMaxDelta, setDraftMaxDelta] = useState<number>(0);
  const [draftExplanation, setDraftExplanation] = useState<string>('');
  const [draftEmptyGroups, setDraftEmptyGroups] = useState<string[]>([]);
  const [unallocatedList, setUnallocatedList] = useState<Array<{
    id: string;
    packageCode: string;
    productCode: string;
    contentTitle?: string;
    scheduledDate: string;
    sessionOfDay: string;
    reason: string;
  }>>([]);
  const [simulationSummary, setSimulationSummary] = useState<{
    totalAllocated: number;
    totalUnallocated: number;
    participatingCount: number;
    excludedCount: number;
    explanation: string;
  } | null>(null);
  const [isSimulating, setIsSimulating] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [isSavingAssignments, setIsSavingAssignments] = useState(false);

  // Modals & Panels
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingPackage, setEditingPackage] = useState<TrainingPackage | null>(null);
  const [isPriorityPanelOpen, setIsPriorityPanelOpen] = useState(false);
  const [reportModalData, setReportModalData] = useState<any | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);

  // Class Deletion Confirmation Modal State
  const [classToDelete, setClassToDelete] = useState<TrainingPackage | null>(null);
  const [isDeletingClass, setIsDeletingClass] = useState(false);
  const [deleteError, setDeleteError] = useState<string>('');

  // Transfer History Modal State
  const [viewTransferHistoryPkg, setViewTransferHistoryPkg] = useState<TrainingPackage | null>(null);

  // Weekday Filter State (Independent per user account)
  const userFilterKey = useMemo(() => {
    return `allocation_day_filter_${session?.onbCode || 'guest'}`;
  }, [session?.onbCode]);

  const [selectedDays, setSelectedDays] = useState<number[]>(() => {
    try {
      const key = `allocation_day_filter_${session?.onbCode || 'guest'}`;
      const saved = localStorage.getItem(key);
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const [isDayFilterOpen, setIsDayFilterOpen] = useState(false);

  // Sync filter when user switches account
  useEffect(() => {
    try {
      const saved = localStorage.getItem(userFilterKey);
      setSelectedDays(saved ? JSON.parse(saved) : []);
    } catch {
      setSelectedDays([]);
    }
  }, [userFilterKey]);

  const handleToggleDay = (day: number) => {
    let updated: number[];
    if (selectedDays.includes(day)) {
      updated = selectedDays.filter(d => d !== day);
    } else {
      updated = [...selectedDays, day].sort((a, b) => a - b);
    }
    setSelectedDays(updated);
    try {
      localStorage.setItem(userFilterKey, JSON.stringify(updated));
    } catch {}
  };

  const handleClearDayFilter = () => {
    setSelectedDays([]);
    try {
      localStorage.removeItem(userFilterKey);
    } catch {}
  };

  const handleSelectAllDays = () => {
    handleClearDayFilter();
  };

  // Generate Classes from Core Modal State
  const [isGenerateCoreModalOpen, setIsGenerateCoreModalOpen] = useState(false);
  const [selectedScheduleIdsForGen, setSelectedScheduleIdsForGen] = useState<string[]>([]);
  const [isGeneratingFromCore, setIsGeneratingFromCore] = useState(false);

  // Add / Edit Class Form State
  const [formModuleCode, setFormModuleCode] = useState<string>('');
  const [formDate, setFormDate] = useState<string>(`${monthYear}-15`);
  const [formSession, setFormSession] = useState<SessionOfDay>('Sáng');
  const [formAssignedOnb, setFormAssignedOnb] = useState<string>('');
  const [formUserNotes, setFormUserNotes] = useState<string>('');
  const [formError, setFormError] = useState<string>('');

  // Priority Registration Form State
  const [priorityOnb, setPriorityOnb] = useState<string>('');
  const [priorityModule, setPriorityModule] = useState<string>('');
  const [priorityMaxSessions, setPriorityMaxSessions] = useState<string>('2');
  const [priorityOrder, setPriorityOrder] = useState<string>('1');
  const [priorityNotes, setPriorityNotes] = useState<string>('');
  const [editingPriority, setEditingPriority] = useState<TrainingPriorityRegistration | null>(null);
  const [isSubmittingPriority, setIsSubmittingPriority] = useState(false);

  // Deleting Priority modal state & feedback
  const [deletingPriorityItem, setDeletingPriorityItem] = useState<TrainingPriorityRegistration | null>(null);
  const [isDeletingPriority, setIsDeletingPriority] = useState(false);
  const [priorityFeedback, setPriorityFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Monthly Module In-Charge Form State
  const [inChargeModule, setInChargeModule] = useState<string>('');
  const [inChargeOnb, setInChargeOnb] = useState<string>('');
  const [inChargeIsPriority, setInChargeIsPriority] = useState<boolean>(false);
  const [inChargeMaxSessions, setInChargeMaxSessions] = useState<string>('');
  const [inChargeNotes, setInChargeNotes] = useState<string>('');
  const [editingInCharge, setEditingInCharge] = useState<ModuleInChargeMember | null>(null);
  const [isSubmittingInCharge, setIsSubmittingInCharge] = useState(false);
  const [isCopyingInCharge, setIsCopyingInCharge] = useState(false);

  // Deleting In-Charge item modal state & feedback
  const [deletingInChargeItem, setDeletingInChargeItem] = useState<ModuleInChargeMember | null>(null);
  const [isDeletingInCharge, setIsDeletingInCharge] = useState(false);
  const [inChargeFeedback, setInChargeFeedback] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  // Copy In-Charge from Month with Preview Modal State
  const [isCopyModalOpen, setIsCopyModalOpen] = useState(false);
  const [sourceMonthForCopy, setSourceMonthForCopy] = useState<string>('');
  const [copyPreviewList, setCopyPreviewList] = useState<ModuleInChargeMember[]>([]);
  const [isLoadingCopyPreview, setIsLoadingCopyPreview] = useState(false);

  // Generate Classes from Core Preview State
  const [generatePreviewItems, setGeneratePreviewItems] = useState<any[]>([]);
  const [generatePreviewSummary, setGeneratePreviewSummary] = useState<{ newCount: number; existingCount: number; cancelledCount: number } | null>(null);
  const [isLoadingGeneratePreview, setIsLoadingGeneratePreview] = useState(false);
  const [ignoreCancelledInGen, setIgnoreCancelledInGen] = useState(false);

  // History Lookup State (Xem lại lịch phân bổ và lịch làm việc của từng người ở các tháng trước)
  const [lookupMonth, setLookupMonth] = useState<string>(monthYear);
  const [lookupOnb, setLookupOnb] = useState<string>('');
  const [lookupGroupId, setLookupGroupId] = useState<string>('');
  const [lookupModuleCode, setLookupModuleCode] = useState<string>('');
  const [lookupStatus, setLookupStatus] = useState<string>('');
  const [lookupPackages, setLookupPackages] = useState<TrainingPackage[]>([]);
  const [lookupSchedules, setLookupSchedules] = useState<WorkSchedule[]>([]);
  const [isLoadingLookup, setIsLoadingLookup] = useState<boolean>(false);

  // Month navigation helpers
  const handlePrevMonth = () => {
    const [y, m] = monthYear.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const py = prevDate.getFullYear();
    const pm = String(prevDate.getMonth() + 1).padStart(2, '0');
    onMonthChange?.(`${py}-${pm}`);
  };

  const handleNextMonth = () => {
    const [y, m] = monthYear.split('-').map(Number);
    const nextDate = new Date(y, m, 1);
    const ny = nextDate.getFullYear();
    const nm = String(nextDate.getMonth() + 1).padStart(2, '0');
    onMonthChange?.(`${ny}-${nm}`);
  };

  const handleCurrentMonth = () => {
    onMonthChange?.(currentVietnamMonth);
  };

  // Active participating members (Requirement 2: All active ONB minus exclusions)
  const activeMembers = useMemo(() => members.filter(m => m.isActive !== false), [members]);
  const participatingMembers = useMemo(() => {
    return activeMembers.filter(m => !excludedOnbCodes.includes(m.code));
  }, [activeMembers, excludedOnbCodes]);

  // Active groups
  const activeGroups = useMemo(() => groups.filter(g => g.isActive), [groups]);

  // Load Allocation Meta (Modules, Priorities, Groups, In-Charge, Recurring, Exclusions)
  const loadAllocationMeta = async () => {
    setIsLoadingMeta(true);
    try {
      const res = await api.getAllocation(monthYear);
      if (res.trainingModules && Array.isArray(res.trainingModules)) {
        setTrainingModules(res.trainingModules);
      }
      if (res.priorities) {
        setPriorities(res.priorities);
      }
      if (res.inChargeMembers) {
        setInChargeMembers(res.inChargeMembers);
      }
      if (res.recurringSchedules && Array.isArray(res.recurringSchedules)) {
        setRecurringSchedules(res.recurringSchedules);
      }
      if (res.excludedOnbCodes && Array.isArray(res.excludedOnbCodes)) {
        setExcludedOnbCodes(res.excludedOnbCodes);
      } else {
        setExcludedOnbCodes([]);
      }
      // Initialize selected groups if empty
      if (selectedGroupIds.length === 0 && res.groups) {
        setSelectedGroupIds(res.groups.filter(g => g.isActive).map(g => g.name));
      }
    } catch (err) {
      console.error('Failed to load allocation meta', err);
    } finally {
      setIsLoadingMeta(false);
    }
  };

  useEffect(() => {
    loadAllocationMeta();
    setDraftPlan(null);
    setReportModalData(null);
    setUnallocatedList([]);
    setSimulationSummary(null);
  }, [monthYear]);

  // Ensure default groups are selected
  useEffect(() => {
    if (selectedGroupIds.length === 0 && activeGroups.length > 0) {
      setSelectedGroupIds(activeGroups.map(g => g.name));
    }
  }, [activeGroups]);

  // Active training modules (can create classes for active ones)
  const activeModules = useMemo(() => {
    return trainingModules.filter(m => m.isActive);
  }, [trainingModules]);

  // Calculate live group points from existing classes or prop
  const currentGroupStats = useMemo(() => {
    const pts: Record<string, number> = {};
    const counts: Record<string, number> = {};
    activeGroups.forEach(g => {
      pts[g.name] = 0;
      counts[g.name] = 0;
    });

    trainingPackages.forEach(p => {
      if (p.assignedGroup && p.assignedGroup in pts) {
        pts[p.assignedGroup] += (Number(p.allocationPoints) || 0);
        counts[p.assignedGroup] += 1;
      }
    });

    const values = Object.values(pts);
    const minP = values.length > 0 ? Math.min(...values) : 0;
    const maxP = values.length > 0 ? Math.max(...values) : 0;
    const delta = Math.round((maxP - minP) * 100) / 100;

    return { pts, counts, delta, minP, maxP };
  }, [activeGroups, trainingPackages]);

  // Filtered packages by weekday (independent per user, preserves month and data)
  const filteredPackages = useMemo(() => {
    const list = draftPlan || trainingPackages;
    if (!selectedDays || selectedDays.length === 0) return list;
    return list.filter(pkg => {
      const day = pkg.dayOfWeek || getWeekdayNumber(pkg.scheduledDate);
      return selectedDays.includes(day);
    });
  }, [draftPlan, trainingPackages, selectedDays]);

  // Check schedule conflict helper
  const checkMemberConflict = (onbCode: string, date: string, sessionOfDay: SessionOfDay, excludeClassId?: string) => {
    if (!onbCode || !date || !sessionOfDay) return null;

    // Check schedules table (Rule: không ghi đè kể cả ô có lịch đã hủy)
    const schConflict = schedules.find(s => {
      if (s.onbCode !== onbCode || s.date !== date) return false;
      if (s.sessionOfDay && s.sessionOfDay !== sessionOfDay && !s.fullDay) return false;
      return true;
    });
    if (schConflict) {
      const isCancelled = schConflict.status === 'Đã hủy' || schConflict.status === 'Hủy';
      return {
        type: 'SCHEDULE',
        title: (schConflict.workFormName || schConflict.workTypeCode) + (isCancelled ? ' (Đã hủy)' : ''),
        content: schConflict.customerOrTask,
        session: schConflict.sessionOfDay || 'Cả ngày'
      };
    }

    // Check existing packages in this month
    const listToCheck = draftPlan || trainingPackages;
    const pkgConflict = listToCheck.find(p => {
      if (p.id === excludeClassId) return false;
      if (p.assignedOnbCode !== onbCode || p.scheduledDate !== date) return false;
      if (p.sessionOfDay !== sessionOfDay) return false;
      return true;
    });
    if (pkgConflict) {
      return {
        type: 'PACKAGE',
        title: `Lớp ${pkgConflict.packageCode}`,
        content: pkgConflict.title,
        session: pkgConflict.sessionOfDay
      };
    }

    return null;
  };

  // Open Add Modal
  const handleOpenAddModal = () => {
    setEditingPackage(null);
    setFormError('');
    const firstMod = activeModules[0];
    const modCode = firstMod ? firstMod.code : 'CRM';
    setFormModuleCode(modCode);
    setFormDate(`${monthYear}-15`);
    setFormSession((firstMod?.defaultSession as SessionOfDay) || 'Sáng');
    setFormAssignedOnb('');
    setFormUserNotes('');
    setIsAddModalOpen(true);
  };

  // Open Edit Modal
  const handleOpenEditModal = (pkg: TrainingPackage) => {
    setEditingPackage(pkg);
    setFormError('');
    setFormModuleCode(pkg.productCode);
    setFormDate(pkg.scheduledDate);
    setFormSession(pkg.sessionOfDay);
    setFormAssignedOnb(pkg.assignedOnbCode || '');
    setFormUserNotes(pkg.userNotes || '');
    setIsAddModalOpen(true);
  };

  // When module changes in Add/Edit form: auto fill defaultSession from Core
  const handleModuleChangeInForm = (code: string) => {
    setFormModuleCode(code);
    const mod = trainingModules.find(m => m.code === code);
    if (mod && mod.defaultSession) {
      setFormSession(mod.defaultSession as SessionOfDay);
    }
  };

  // Save class from Add/Edit Modal
  const handleSaveClass = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (!formModuleCode) {
      setFormError('Vui lòng chọn module đào tạo.');
      return;
    }
    if (!formDate || !formDate.startsWith(monthYear)) {
      setFormError(`Ngày diễn ra lớp (${formDate}) phải thuộc tháng đang quản lý (${monthYear}).`);
      return;
    }
    if (formSession !== 'Sáng' && formSession !== 'Chiều') {
      setFormError('Buổi đào tạo chỉ có thể là Sáng hoặc Chiều.');
      return;
    }

    try {
      if (editingPackage) {
        await api.updateTrainingClass(editingPackage.id, {
          productCode: formModuleCode,
          sessionOfDay: formSession,
          scheduledDate: formDate,
          assignedOnbCode: formAssignedOnb !== undefined ? formAssignedOnb : '',
          userNotes: formUserNotes
        });
      } else {
        await api.createTrainingClass({
          monthYear,
          productCode: formModuleCode,
          scheduledDate: formDate,
          sessionOfDay: formSession,
          assignedOnbCode: formAssignedOnb || undefined,
          userNotes: formUserNotes
        });
      }
      setIsAddModalOpen(false);
      await onRefreshData();
      await loadAllocationMeta();
    } catch (err: any) {
      setFormError(err.message || 'Lỗi khi lưu lớp đào tạo.');
    }
  };

  // Duplicate class
  const handleDuplicateClass = async (id: string) => {
    if (!canManage) return;
    try {
      await api.duplicateTrainingClass(id);
      await onRefreshData();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi nhân bản lớp');
    }
  };

  // Direct assign member inline
  const handleDirectAssignMember = async (classId: string, onbCode: string) => {
    if (!canManage) return;
    try {
      await api.updateTrainingClass(classId, {
        assignedOnbCode: onbCode !== undefined ? onbCode : ''
      });
      await onRefreshData();
      await loadAllocationMeta();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi thay đổi nhân sự được giao lớp');
    }
  };

  // Open Delete Modal
  const handleOpenDeleteModal = (pkg: TrainingPackage) => {
    if (!canManage) return;
    if (pkg.isLocked) {
      alert(`Lớp "${pkg.packageCode}" đang ở trạng thái Khóa phân bổ. Vui lòng mở khóa trước khi xóa.`);
      return;
    }
    setDeleteError('');
    setClassToDelete(pkg);
  };

  // Confirm Delete Class
  const handleConfirmDeleteClass = async () => {
    if (!canManage || !classToDelete) return;
    setIsDeletingClass(true);
    setDeleteError('');
    try {
      await api.deleteTrainingClass(classToDelete.id);
      setClassToDelete(null);
      await onRefreshData();
      await loadAllocationMeta();
    } catch (err: any) {
      setDeleteError(err.message || 'Lỗi khi xóa lớp đào tạo.');
    } finally {
      setIsDeletingClass(false);
    }
  };

  // Toggle lock
  const handleToggleLock = async (pkg: TrainingPackage) => {
    if (!canManage) return;
    try {
      await api.updateTrainingClass(pkg.id, { isLocked: !pkg.isLocked });
      await onRefreshData();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi đổi trạng thái khóa');
    }
  };

  // Unlink schedule for safe reallocation
  const handleUnlinkSchedule = async (pkg: TrainingPackage) => {
    if (!canManage) return;
    if (confirm(`Xác nhận hủy liên kết lịch công việc của lớp "${pkg.packageCode}"? Lịch công việc cũ sẽ được xóa an toàn để bạn điều chuyển hoặc phân bổ lại.`)) {
      try {
        await api.unlinkTrainingSchedule(pkg.id);
        await onRefreshData();
      } catch (err: any) {
        alert(err.message || 'Lỗi khi hủy liên kết lịch');
      }
    }
  };

  // Priority Registration Handlers
  const handleOpenEditPriority = (rec: TrainingPriorityRegistration) => {
    setEditingPriority(rec);
    setPriorityOnb(rec.onbCode);
    setPriorityModule(rec.moduleCode);
    setPriorityMaxSessions(rec.maxSessions ? String(rec.maxSessions) : '');
    setPriorityOrder(rec.order ? String(rec.order) : '1');
    setPriorityNotes(rec.notes || '');
    setPriorityFeedback(null);
  };

  const handleCancelEditPriority = () => {
    setEditingPriority(null);
    setPriorityOnb('');
    setPriorityModule('');
    setPriorityMaxSessions('2');
    setPriorityOrder('1');
    setPriorityNotes('');
  };

  const handleSavePriority = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    if (!priorityOnb || !priorityModule) {
      setPriorityFeedback({
        type: 'error',
        message: 'Vui lòng chọn đầy đủ Nhân sự ONB và Module đăng ký.'
      });
      return;
    }
    setIsSubmittingPriority(true);
    setPriorityFeedback(null);
    try {
      if (editingPriority) {
        const res = await api.updateTrainingPriority(editingPriority.id, {
          onbCode: priorityOnb,
          moduleCode: priorityModule,
          maxSessions: priorityMaxSessions ? Number(priorityMaxSessions) : undefined,
          order: priorityOrder ? Number(priorityOrder) : 1,
          notes: priorityNotes
        });
        if (res.priority) {
          setPriorities(prev => prev.map(p => (p.id === editingPriority.id ? res.priority : p)));
        }
        setPriorityFeedback({
          type: 'success',
          message: `Đã lưu thay đổi đăng ký ưu tiên cho nhân sự ${priorityOnb} (Module ${priorityModule}) thành công!`
        });
      } else {
        const res = await api.createTrainingPriority({
          monthYear,
          onbCode: priorityOnb,
          moduleCode: priorityModule,
          maxSessions: priorityMaxSessions ? Number(priorityMaxSessions) : undefined,
          order: priorityOrder ? Number(priorityOrder) : 1,
          notes: priorityNotes
        });
        if (res.priority) {
          setPriorities(prev => [...prev, res.priority]);
        }
        setPriorityFeedback({
          type: 'success',
          message: `Đã thêm đăng ký ưu tiên cho nhân sự ${priorityOnb} (Module ${priorityModule}) thành công!`
        });
      }
      handleCancelEditPriority();
      await loadAllocationMeta();
    } catch (err: any) {
      setPriorityFeedback({
        type: 'error',
        message: err.message || 'Lỗi khi lưu đăng ký ưu tiên'
      });
    } finally {
      setIsSubmittingPriority(false);
    }
  };

  const handleDeletePriority = (rec: TrainingPriorityRegistration) => {
    if (!canManage) return;
    setDeletingPriorityItem(rec);
  };

  const handleConfirmDeletePriority = async () => {
    if (!canManage || !deletingPriorityItem) return;
    setIsDeletingPriority(true);
    setPriorityFeedback(null);
    try {
      await api.deleteTrainingPriority(deletingPriorityItem.id);
      setPriorities(prev => prev.filter(p => p.id !== deletingPriorityItem.id));
      setPriorityFeedback({
        type: 'success',
        message: `Đã xóa đăng ký ưu tiên của nhân sự ${deletingPriorityItem.onbCode} (Module ${deletingPriorityItem.moduleCode}) trong tháng ${monthYear} thành công!`
      });
      setDeletingPriorityItem(null);
      await loadAllocationMeta();
    } catch (err: any) {
      setPriorityFeedback({
        type: 'error',
        message: err.message || 'Lỗi khi xóa đăng ký ưu tiên'
      });
    } finally {
      setIsDeletingPriority(false);
    }
  };

  // --- IN-CHARGE MEMBERS HANDLERS (Người phụ trách module theo tháng) ---
  const handleOpenEditInCharge = (rec: ModuleInChargeMember) => {
    setEditingInCharge(rec);
    setInChargeModule(rec.moduleCode);
    setInChargeOnb(rec.onbCode);
    setInChargeIsPriority(Boolean(rec.isPriority));
    setInChargeMaxSessions(rec.maxSessions ? String(rec.maxSessions) : '');
    setInChargeNotes(rec.notes || '');
    setInChargeFeedback(null);
  };

  const handleCancelEditInCharge = () => {
    setEditingInCharge(null);
    setInChargeModule('');
    setInChargeOnb('');
    setInChargeIsPriority(false);
    setInChargeMaxSessions('');
    setInChargeNotes('');
  };

  const handleSaveInCharge = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    if (!inChargeModule || !inChargeOnb) {
      setInChargeFeedback({
        type: 'error',
        message: 'Vui lòng chọn đầy đủ Module đào tạo và Nhân sự ONB.'
      });
      return;
    }
    setIsSubmittingInCharge(true);
    setInChargeFeedback(null);
    try {
      if (editingInCharge) {
        const res = await api.updateModuleInChargeMember(editingInCharge.id, {
          moduleCode: inChargeModule,
          onbCode: inChargeOnb,
          isPriority: inChargeIsPriority,
          maxSessions: inChargeMaxSessions ? Number(inChargeMaxSessions) : undefined,
          notes: inChargeNotes
        });
        if (res.record) {
          setInChargeMembers(prev => prev.map(m => (m.id === editingInCharge.id ? res.record : m)));
        }
        setInChargeFeedback({
          type: 'success',
          message: `Đã lưu thay đổi phân công: ${inChargeOnb} phụ trách ${inChargeModule} trong tháng ${monthYear} thành công!`
        });
      } else {
        const res = await api.createModuleInChargeMember({
          monthYear,
          moduleCode: inChargeModule,
          onbCode: inChargeOnb,
          isPriority: inChargeIsPriority,
          maxSessions: inChargeMaxSessions ? Number(inChargeMaxSessions) : undefined,
          notes: inChargeNotes
        });
        if (res.record) {
          setInChargeMembers(prev => [...prev, res.record]);
        }
        setInChargeFeedback({
          type: 'success',
          message: `Đã thêm phân công: ${inChargeOnb} phụ trách ${inChargeModule} trong tháng ${monthYear} thành công!`
        });
      }
      handleCancelEditInCharge();
      await loadAllocationMeta();
    } catch (err: any) {
      setInChargeFeedback({
        type: 'error',
        message: err.message || 'Lỗi khi lưu người phụ trách module'
      });
    } finally {
      setIsSubmittingInCharge(false);
    }
  };

  const handleDeleteInCharge = (rec: ModuleInChargeMember) => {
    if (!canManage) return;
    setDeletingInChargeItem(rec);
  };

  const handleConfirmDeleteInCharge = async () => {
    if (!canManage || !deletingInChargeItem) return;
    setIsDeletingInCharge(true);
    setInChargeFeedback(null);
    try {
      await api.deleteModuleInChargeMember(deletingInChargeItem.id);
      setInChargeMembers(prev => prev.filter(ic => ic.id !== deletingInChargeItem.id));
      setInChargeFeedback({
        type: 'success',
        message: `Đã xóa phân công nhân sự ${deletingInChargeItem.onbCode} phụ trách ${deletingInChargeItem.moduleCode} trong tháng ${monthYear} thành công!`
      });
      setDeletingInChargeItem(null);
      await loadAllocationMeta();
    } catch (err: any) {
      setInChargeFeedback({
        type: 'error',
        message: err.message || 'Lỗi khi xóa người phụ trách'
      });
    } finally {
      setIsDeletingInCharge(false);
    }
  };

  // --- IN-CHARGE COPY WITH PREVIEW HANDLERS ---
  const handleOpenCopyModal = async () => {
    if (!canManage) return;
    const [y, m] = monthYear.split('-').map(Number);
    const prevDate = new Date(y, m - 2, 1);
    const py = prevDate.getFullYear();
    const pm = String(prevDate.getMonth() + 1).padStart(2, '0');
    const defaultSource = `${py}-${pm}`;
    setSourceMonthForCopy(defaultSource);
    setIsCopyModalOpen(true);
    await loadCopyPreview(defaultSource);
  };

  const loadCopyPreview = async (sourceMonth: string) => {
    if (!sourceMonth) return;
    setIsLoadingCopyPreview(true);
    try {
      const res = await api.getModuleInChargeMembers(sourceMonth);
      setCopyPreviewList(res.inChargeMembers || []);
    } catch (err: any) {
      setCopyPreviewList([]);
    } finally {
      setIsLoadingCopyPreview(false);
    }
  };

  const handleConfirmCopyInCharge = async () => {
    if (!canManage || !sourceMonthForCopy) return;
    if (copyPreviewList.length === 0) {
      alert(`Tháng ${sourceMonthForCopy} không có danh sách người phụ trách nào để sao chép.`);
      return;
    }
    setIsCopyingInCharge(true);
    try {
      const res = await api.copyModuleInChargeFromMonth({
        fromMonthYear: sourceMonthForCopy,
        toMonthYear: monthYear
      });
      alert(res.message);
      setIsCopyModalOpen(false);
      await loadAllocationMeta();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi sao chép danh sách người phụ trách');
    } finally {
      setIsCopyingInCharge(false);
    }
  };

  // --- GENERATE CLASSES FROM CORE WITH PREVIEW HANDLERS ---
  const handleOpenGenerateModal = async () => {
    if (!canManage) return;
    const activeIds = recurringSchedules.filter(s => s.isActive).map(s => s.id);
    setSelectedScheduleIdsForGen(activeIds);
    setGeneratePreviewItems([]);
    setGeneratePreviewSummary(null);
    setIsGenerateCoreModalOpen(true);
    if (activeIds.length > 0) {
      await fetchGeneratePreview(activeIds);
    }
  };

  const fetchGeneratePreview = async (scheduleIds: string[]) => {
    setIsLoadingGeneratePreview(true);
    try {
      const res = await api.previewClassesFromCore({
        monthYear,
        scheduleIds
      });
      setGeneratePreviewItems(res.items || []);
      setGeneratePreviewSummary({
        newCount: res.newCount,
        existingCount: res.existingCount,
        cancelledCount: res.cancelledCount
      });
    } catch (err: any) {
      console.error('Failed to preview classes from Core', err);
      setGeneratePreviewItems([]);
    } finally {
      setIsLoadingGeneratePreview(false);
    }
  };

  const handleGenerateClassesFromCore = async () => {
    if (!canManage) return;
    if (selectedScheduleIdsForGen.length === 0) {
      alert('Vui lòng chọn ít nhất 1 lịch mẫu định kỳ từ Thiết lập hệ thống');
      return;
    }
    setIsGeneratingFromCore(true);
    try {
      const res = await api.generateClassesFromCore({
        monthYear,
        scheduleIds: selectedScheduleIdsForGen,
        ignoreCancelledExceptions: ignoreCancelledInGen
      });
      alert(`Đã tạo thành công ${res.createdCount} lớp trong tháng ${monthYear}! (Bỏ qua ${res.skippedCount} lớp đã tồn tại${res.skippedCancelledCount ? `, ${res.skippedCancelledCount} lớp đã bị loại trừ` : ''}).`);
      setIsGenerateCoreModalOpen(false);
      await onRefreshData();
      await loadAllocationMeta();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi tạo lớp từ lịch mẫu Thiết lập hệ thống');
    } finally {
      setIsGeneratingFromCore(false);
    }
  };

  // --- HISTORY LOOKUP HANDLERS (Xem lại lịch phân bổ & lịch làm việc ở các tháng trước) ---
  const loadLookupData = async (
    targetMonth: string,
    targetOnb?: string,
    targetGroup?: string,
    targetModule?: string,
    targetStatus?: string
  ) => {
    setIsLoadingLookup(true);
    try {
      const res = await api.getHistoryLookup({
        monthYear: targetMonth,
        onbCode: targetOnb || undefined,
        groupId: targetGroup || undefined,
        moduleCode: targetModule || undefined,
        status: targetStatus || undefined
      });
      setLookupPackages(res.packages || []);

      const schRes = await api.getSchedules({ monthYear: targetMonth });
      let schs = schRes.schedules || [];
      if (targetOnb) {
        schs = schs.filter(s => s.onbCode === targetOnb);
      }
      setLookupSchedules(schs);
    } catch (err) {
      console.error('Failed to load lookup data', err);
    } finally {
      setIsLoadingLookup(false);
    }
  };

  useEffect(() => {
    if (activeSubTab === 'HISTORY_LOOKUP') {
      loadLookupData(lookupMonth || monthYear, lookupOnb, lookupGroupId, lookupModuleCode, lookupStatus);
    }
  }, [activeSubTab, lookupMonth, lookupOnb, lookupGroupId, lookupModuleCode, lookupStatus]);

  // Run Simulation (Requirements 1, 2, 3, 4, 5)
  const handleRunSimulation = async () => {
    if (!canManage) return;
    if (trainingPackages.length === 0) {
      alert('Chưa có lớp đào tạo nào trong tháng này để phân bổ. Vui lòng bấm "+ Thêm lớp đào tạo" hoặc "Tạo lớp từ Thiết lập hệ thống" trước!');
      return;
    }
    setIsSimulating(true);
    try {
      const res = await api.simulateAllocation({
        monthYear,
        selectedGroupIds,
        excludedOnbCodes
      });
      setDraftPlan(res.simulatedPackages);
      setDraftGroupPoints(res.groupPointsResult);
      setDraftGroupCounts(res.groupClassCounts);
      setDraftMaxDelta(res.maxDifference);
      setDraftExplanation(res.explanation);
      setDraftEmptyGroups(res.emptyGroups || []);
      setUnallocatedList(res.unallocatedClasses || []);
      setSimulationSummary({
        totalAllocated: res.totalAllocated ?? res.simulatedPackages.filter(p => p.allocationStatus === 'Đã phân bổ').length,
        totalUnallocated: res.totalUnallocated ?? (res.unallocatedClasses ? res.unallocatedClasses.length : 0),
        participatingCount: res.participatingCount ?? (activeMembers.length - excludedOnbCodes.length),
        excludedCount: res.excludedCount ?? excludedOnbCodes.length,
        explanation: res.explanation
      });
    } catch (err: any) {
      alert(err.message || 'Lỗi khi chạy phân bổ');
    } finally {
      setIsSimulating(false);
    }
  };

  // Handle Manual Draft Change by Package ID
  const handleManualDraftChange = (packageId: string, newOnbCode: string) => {
    if (!draftPlan) return;
    const targetIdx = draftPlan.findIndex(p => p.id === packageId);
    if (targetIdx === -1) return;
    const targetPkg = draftPlan[targetIdx];
    const newMember = members.find(m => m.code === newOnbCode);

    const nextDraft = [...draftPlan];
    let newGroup: string | undefined = undefined;
    if (newMember) {
      newGroup = resolveMemberGroupAtDate(members, newMember.code, targetPkg.scheduledDate) || newMember.currentGroup;
    }

    nextDraft[targetIdx] = {
      ...targetPkg,
      assignedOnbCode: newMember ? newMember.code : undefined,
      assignedGroup: newGroup,
      allocationStatus: newMember ? 'Đã phân bổ' : 'Chưa phân bổ',
      systemNotes: newMember ? 'Điều chỉnh thủ công bởi người phân bổ' : 'Chưa phân bổ'
    };

    // Live recalculate group points & counts
    const recalculatedPoints: Record<string, number> = {};
    const recalculatedCounts: Record<string, number> = {};
    activeGroups.forEach(g => {
      recalculatedPoints[g.name] = 0;
      recalculatedCounts[g.name] = 0;
    });

    nextDraft.forEach(pkg => {
      if (pkg.assignedGroup && pkg.assignedGroup in recalculatedPoints) {
        recalculatedPoints[pkg.assignedGroup] += (Number(pkg.allocationPoints) || 0);
        recalculatedCounts[pkg.assignedGroup] += 1;
      }
    });

    const values = Object.values(recalculatedPoints);
    const minP = values.length > 0 ? Math.min(...values) : 0;
    const maxP = values.length > 0 ? Math.max(...values) : 0;
    const delta = Math.round((maxP - minP) * 100) / 100;

    setDraftPlan(nextDraft);
    setDraftGroupPoints(recalculatedPoints);
    setDraftGroupCounts(recalculatedCounts);
    setDraftMaxDelta(delta);

    // Live update unallocated classes list
    const updatedUnallocated = nextDraft
      .filter(p => !p.assignedOnbCode)
      .map(p => ({
        id: p.id,
        packageCode: p.packageCode,
        productCode: p.productCode,
        contentTitle: p.contentTitle || p.title,
        scheduledDate: p.scheduledDate,
        sessionOfDay: p.sessionOfDay,
        reason: p.systemNotes || 'Chưa phân công nhân sự'
      }));
    setUnallocatedList(updatedUnallocated);
    if (simulationSummary) {
      setSimulationSummary({
        ...simulationSummary,
        totalAllocated: nextDraft.filter(p => p.assignedOnbCode).length,
        totalUnallocated: updatedUnallocated.length
      });
    }
  };

  // Save draft assignments directly into trainingPackages without creating schedules
  const handleSaveAssignments = async () => {
    if (!draftPlan || draftPlan.length === 0) return;
    setIsSavingAssignments(true);
    try {
      const assignments = draftPlan.map(p => ({
        id: p.id,
        assignedOnbCode: p.assignedOnbCode,
        systemNotes: p.systemNotes,
        isLocked: p.isLocked
      }));

      const res = await api.saveAllocationAssignments({
        monthYear,
        assignments
      });

      alert(res.message || 'Đã lưu kết quả phân bổ thành công!');
      setDraftPlan(null);
      setUnallocatedList([]);
      setSimulationSummary(null);
      await onRefreshData();
      await loadAllocationMeta();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi lưu kết quả phân bổ');
    } finally {
      setIsSavingAssignments(false);
    }
  };

  // Save exclusion list
  const handleSaveExclusions = async (newExclusions: string[]) => {
    setIsSavingExclusions(true);
    try {
      const res = await api.updateAllocationExclusions({
        monthYear,
        excludedOnbCodes: newExclusions
      });
      setExcludedOnbCodes(res.excludedOnbCodes);
      alert(`Đã lưu danh sách loại trừ tháng ${monthYear}: ${res.excludedOnbCodes.length} nhân sự không nhận lớp.`);
    } catch (err: any) {
      alert(err.message || 'Lỗi khi lưu danh sách loại trừ');
    } finally {
      setIsSavingExclusions(false);
    }
  };

  // Confirm Allocation and Fill into Work Schedule
  const handleConfirmAndFillSchedules = async () => {
    const planToConfirm = draftPlan || trainingPackages;
    if (!planToConfirm || planToConfirm.length === 0) return;

    setIsConfirming(true);
    try {
      const assignments = planToConfirm.map(p => ({
        id: p.id,
        assignedOnbCode: p.assignedOnbCode,
        isLocked: p.isLocked
      }));

      const res = await api.confirmAndFillSchedules({
        monthYear,
        assignments
      });

      setReportModalData(res);
      setDraftPlan(null);
      await onRefreshData();
      await loadAllocationMeta();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi chốt phân bổ và điền lịch');
    } finally {
      setIsConfirming(false);
    }
  };

  // Retry Failed Classes
  const handleRetryFailedClasses = async (reassignments: Array<{ classId: string; assignedOnbCode: string }>) => {
    setIsRetrying(true);
    try {
      const res = await api.retryFailedClasses({
        monthYear,
        reassignments
      });

      alert(`Đã điền lại thành công ${res.retrySuccessCount} lớp! Còn ${res.stillFailedCount} lớp chưa điền được.`);
      if (res.stillFailedCount === 0) {
        setReportModalData(null);
      } else {
        setReportModalData((prev: any) => ({
          ...prev,
          failedCount: res.stillFailedCount,
          failedClasses: res.remainingFailed
        }));
      }
      await onRefreshData();
      await loadAllocationMeta();
    } catch (err: any) {
      alert(err.message || 'Lỗi khi điền lại lịch');
    } finally {
      setIsRetrying(false);
    }
  };

  // Format date DD/MM for display
  const formatDayMonth = (dateStr: string) => {
    if (!dateStr || !dateStr.includes('-')) return dateStr;
    const parts = dateStr.split('-');
    return `${parts[2]}/${parts[1]}`;
  };

  // Week and day of week display info helper
  const getWeekDisplayInfo = (dateStr: string) => {
    if (!dateStr || !dateStr.includes('-')) {
      return { monthYearStr: '', weekLabel: '—', dayOfWeekStr: '—', formattedDate: dateStr };
    }
    const [y, m, d] = dateStr.split('-').map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
    const jsDay = dt.getUTCDay();
    const dayOfWeek = jsDay === 0 ? 8 : jsDay + 1; // 2=T2, ..., 8=CN
    const dayOfWeekStr = dayOfWeek === 8 ? 'CN' : `T${dayOfWeek}`;

    const monDiff = dayOfWeek - 2;
    const monday = new Date(Date.UTC(y, m - 1, d - monDiff, 12, 0, 0));
    const sunday = new Date(Date.UTC(y, m - 1, d - monDiff + 6, 12, 0, 0));

    const target = new Date(dt.valueOf());
    const dayNr = (dt.getUTCDay() + 6) % 7;
    target.setUTCDate(target.getUTCDate() - dayNr + 3);
    const firstThursday = target.valueOf();
    target.setUTCMonth(0, 1);
    if (target.getUTCDay() !== 4) {
      target.setUTCMonth(0, 1 + ((4 - target.getUTCDay() + 7) % 7));
    }
    const weekNumber = 1 + Math.ceil((firstThursday - target.valueOf()) / 604800000);

    const pad = (n: number) => String(n).padStart(2, '0');
    const monStr = `${pad(monday.getUTCDate())}/${pad(monday.getUTCMonth() + 1)}`;
    const sunStr = `${pad(sunday.getUTCDate())}/${pad(sunday.getUTCMonth() + 1)}`;
    const weekLabel = `Tuần ${weekNumber} (${monStr} - ${sunStr})`;
    const monthYearStr = `${pad(m)}/${y}`;
    const formattedDate = `${pad(d)}/${pad(m)}`;

    return { monthYearStr, weekLabel, dayOfWeekStr, formattedDate };
  };

  return (
    <div className="space-y-5">
      {/* 1. Header Toolbar with Month Navigation & Status */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg shrink-0">
              <Calendar className="w-6 h-6" />
            </div>
            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <h2 className="text-base font-bold text-slate-900">
                  Lịch đào tạo tập trung
                </h2>
                {isMonthReopened ? (
                  <span className="bg-indigo-100 text-indigo-800 text-[11px] font-bold px-2 py-0.5 rounded-full border border-indigo-300 inline-flex items-center gap-1">
                    <RotateCcw className="w-3 h-3 text-indigo-600" />
                    Mở lại để điều chỉnh
                  </span>
                ) : isPastMonth ? (
                  <span className="bg-amber-100 text-amber-800 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-amber-300 inline-flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-amber-600" />
                    Tháng lịch sử (Chỉ xem)
                  </span>
                ) : null}
                {isCurrentMonth && (
                  <span className="bg-blue-100 text-blue-800 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-blue-300 inline-flex items-center gap-1">
                    <CheckCircle2 className="w-3 h-3 text-blue-600" />
                    Tháng hiện tại
                  </span>
                )}
                {isFutureMonth && (
                  <span className="bg-emerald-100 text-emerald-800 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-emerald-300 inline-flex items-center gap-1">
                    <Calendar className="w-3 h-3 text-emerald-600" />
                    Kế hoạch tháng tới
                  </span>
                )}
                {isMonthLocked && (
                  <span className="bg-slate-100 text-slate-700 text-[11px] font-semibold px-2 py-0.5 rounded-full border border-slate-300 inline-flex items-center gap-1">
                    <Lock className="w-3 h-3 text-slate-500" />
                    Đã khóa hệ thống
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-500 mt-0.5">
                Quy trình: Khai báo người phụ trách module → Tạo danh sách lớp từ Thiết lập hệ thống / Bổ sung → Phân bổ cân bằng nhóm → Chỉnh tay → Chốt & Điền lịch
              </p>
            </div>
          </div>

          {/* Month Selector Controls */}
          <div className="flex items-center gap-1.5 bg-slate-50 p-1.5 rounded-lg border border-slate-200">
            <button
              onClick={handlePrevMonth}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors text-xs font-medium flex items-center gap-1 cursor-pointer"
              title="Xem tháng trước"
            >
              <ChevronLeft className="w-4 h-4" />
              <span className="hidden sm:inline">Tháng trước</span>
            </button>
            <button
              onClick={handleCurrentMonth}
              className={`px-2.5 py-1 text-xs font-semibold rounded-lg transition-colors cursor-pointer ${
                isCurrentMonth
                  ? 'bg-[#4F46E5] text-white shadow-xs'
                  : 'text-slate-700 hover:bg-white'
              }`}
              title="Về tháng hiện tại"
            >
              Hiện tại
            </button>
            <button
              onClick={handleNextMonth}
              className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-white rounded-lg transition-colors text-xs font-medium flex items-center gap-1 cursor-pointer"
              title="Xem tháng sau"
            >
              <span className="hidden sm:inline">Tháng sau</span>
              <ChevronRight className="w-4 h-4" />
            </button>

            {onMonthChange && (
              <input
                type="month"
                value={monthYear}
                onChange={e => e.target.value && onMonthChange(e.target.value)}
                className="ml-1 border border-slate-300 rounded-lg px-2 py-1 text-xs font-mono font-semibold bg-white text-slate-800 shadow-xs focus:border-[#4F46E5] focus:ring-2 focus:ring-[#E0E7FF] focus:outline-hidden"
                title="Chọn trực tiếp tháng/năm"
              />
            )}
          </div>
        </div>

        {/* Action Controls Toolbar & Sub-tabs */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-100">
          {/* Sub-tab Navigation */}
          <div className="flex flex-wrap items-center gap-1 bg-[#F1F5F9] p-1 rounded-xl">
            <button
              onClick={() => setActiveSubTab('CLASSES')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'CLASSES'
                  ? 'bg-[#EEF2FF] text-[#4F46E5] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <Calendar className="w-3.5 h-3.5" />
              <span>Danh sách lớp ({trainingPackages.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('EXCLUSIONS')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'EXCLUSIONS'
                  ? 'bg-[#EEF2FF] text-[#4F46E5] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
              title="Danh sách nhân sự không tham gia nhận lớp trong tháng"
            >
              <UserX className="w-3.5 h-3.5 text-amber-600" />
              <span>Nhân sự không nhận lớp ({excludedOnbCodes.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('PRIORITIES')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'PRIORITIES'
                  ? 'bg-[#EEF2FF] text-[#4F46E5] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>Đăng ký ưu tiên ({priorities.length})</span>
            </button>

            <button
              onClick={() => setActiveSubTab('HISTORY_LOOKUP')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'HISTORY_LOOKUP'
                  ? 'bg-[#EEF2FF] text-[#4F46E5] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <History className="w-3.5 h-3.5 text-[#4F46E5]" />
              <span>Tra cứu lịch sử nhân sự</span>
            </button>

            <button
              onClick={() => setActiveSubTab('IN_CHARGE')}
              className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer ${
                activeSubTab === 'IN_CHARGE'
                  ? 'bg-[#EEF2FF] text-[#4F46E5] shadow-xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-white/70'
              }`}
            >
              <UserCheck className="w-3.5 h-3.5" />
              <span>Phụ trách module ({inChargeMembers.length})</span>
            </button>
          </div>

          {/* Action buttons (only when on CLASSES tab or relevant) */}
          <div className="flex flex-wrap items-center gap-2">
            {canManage ? (
              <>
                <button
                  onClick={handleOpenGenerateModal}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  title="Tạo các lớp đào tạo trong tháng từ lịch mẫu định kỳ Thiết lập hệ thống"
                >
                  <Layers className="w-3.5 h-3.5 text-[#4F46E5]" />
                  <span>Tạo lớp từ Thiết lập hệ thống</span>
                </button>

                <button
                  onClick={handleOpenAddModal}
                  className="px-3 py-1.5 text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  title="Thêm lớp đào tạo lẻ phát sinh trong tháng"
                >
                  <Plus className="w-3.5 h-3.5 text-slate-600" />
                  <span>Thêm lớp lẻ</span>
                </button>

                <button
                  onClick={handleRunSimulation}
                  disabled={isSimulating || trainingPackages.length === 0}
                  className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] disabled:bg-slate-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                  title="Chạy thuật toán phân bổ cân bằng điểm theo các quy tắc"
                >
                  <Shuffle className="w-3.5 h-3.5" />
                  <span>{isSimulating ? 'Đang tính toán...' : 'Chạy phân bổ'}</span>
                </button>

                {draftPlan && (
                  <>
                    <button
                      onClick={handleSaveAssignments}
                      disabled={isSavingAssignments}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] disabled:bg-slate-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                      title="Lưu người được phân công vào danh sách lớp (chưa điền lịch làm việc)"
                    >
                      <Check className="w-3.5 h-3.5" />
                      <span>{isSavingAssignments ? 'Đang lưu...' : 'Lưu kết quả phân bổ'}</span>
                    </button>

                    <button
                      onClick={handleConfirmAndFillSchedules}
                      disabled={isConfirming}
                      className="px-3.5 py-1.5 text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
                      title="Chốt phân bổ và tự động điền các ca học vào Lịch công việc"
                    >
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      <span>{isConfirming ? 'Đang điền...' : 'Chốt & Điền lịch'}</span>
                    </button>

                    <button
                      onClick={() => {
                        setDraftPlan(null);
                        setUnallocatedList([]);
                        setSimulationSummary(null);
                      }}
                      className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                      title="Hủy phương án nháp"
                    >
                      <X className="w-3.5 h-3.5 text-slate-500" />
                      <span>Hủy nháp</span>
                    </button>
                  </>
                )}
              </>
            ) : (
              <span className="text-xs text-slate-500 bg-slate-100 px-3 py-1.5 rounded-md flex items-center gap-1.5">
                <Lock className="w-3.5 h-3.5 text-slate-400" />
                {isMonthReopened
                  ? (isAdmin ? 'Đang mở lại cho Admin' : 'Chỉ Admin được điều chỉnh')
                  : isPastMonth
                  ? 'Tháng lịch sử (Chỉ xem, không sửa)'
                  : isMonthLocked
                  ? 'Tháng đã khóa hệ thống'
                  : 'Quyền xem (Không có quyền phân bổ)'}
              </span>
            )}
          </div>
        </div>

        {/* Reopened Banner vs Past Month Banner */}
        {isMonthReopened ? (
          <div className="p-3 bg-indigo-50/90 border border-indigo-200 rounded-lg text-indigo-950 text-xs flex items-center gap-2.5">
            <RotateCcw className="w-4 h-4 text-indigo-600 shrink-0" />
            <span>
              <strong>Tháng này đang được mở lại để admin điều chỉnh dữ liệu:</strong> {isAdmin ? 'Bạn có quyền quản lý, điều chỉnh các lớp đào tạo và cập nhật phân bổ cho kỳ này. Sau khi hoàn tất, hãy khóa sổ lại tại Tra cứu.' : 'Kỳ này đang được mở lại cho Quản trị viên điều chỉnh dữ liệu. Tài khoản thông thường chỉ xem.'}
            </span>
          </div>
        ) : isPastMonth && (
          <div className="p-3 bg-amber-50/90 border border-amber-200 rounded-lg text-amber-950 text-xs flex items-center gap-2.5">
            <ShieldAlert className="w-4 h-4 text-amber-600 shrink-0" />
            <span>
              <strong>Chế độ xem lịch sử:</strong> Tháng {monthYear} là kỳ đã qua. Toàn bộ danh sách lớp, người phụ trách, kết quả phân bổ và lịch công việc chỉ hiển thị để tra cứu, không cho phép tạo mới, chỉnh sửa, phân bổ lại hoặc điền lịch.
            </span>
          </div>
        )}
      </div>

      {/* 2. SUBTAB: CLASSES (Danh sách lớp & Phân bổ) */}
      {activeSubTab === 'CLASSES' && (
        <div className="space-y-5">

      {/* 3. Group Balancing & Points Strip */}
      <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs border-b border-slate-100 pb-3">
          <div className="flex items-center gap-2">
            <span className="font-bold text-slate-900">Các nhóm tham gia phân bổ trong tháng:</span>
            <div className="flex flex-wrap items-center gap-3">
              {activeGroups.map(g => {
                const isChecked = selectedGroupIds.includes(g.name);
                return (
                  <label key={g.id} className="flex items-center gap-1.5 cursor-pointer font-medium text-slate-700">
                    <input
                      type="checkbox"
                      checked={isChecked}
                      disabled={!canManage || Boolean(draftPlan)}
                      onChange={e => {
                        if (e.target.checked) {
                          setSelectedGroupIds([...selectedGroupIds, g.name]);
                        } else {
                          setSelectedGroupIds(selectedGroupIds.filter(name => name !== g.name));
                        }
                      }}
                      className="rounded-xs border-slate-300 text-blue-600 focus:ring-blue-500"
                    />
                    <span>{g.name}</span>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="flex items-center gap-3 font-mono text-slate-600">
            <span>Chênh lệch Max - Min: <strong className="text-slate-900 font-bold">{draftPlan ? draftMaxDelta : currentGroupStats.delta}đ</strong></span>
          </div>
        </div>

        {/* Dynamic Groups Cards (Requirements 4 & 5) */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {activeGroups.map(grp => {
            const currentPts = currentGroupStats.pts[grp.name] || 0;
            const currentClassCount = currentGroupStats.counts[grp.name] || 0;
            const draftPts = draftGroupPoints ? draftGroupPoints[grp.name] : null;
            const draftCount = draftGroupCounts ? draftGroupCounts[grp.name] : null;
            const displayPts = draftPlan && draftPts !== null ? draftPts : currentPts;
            const displayClassCount = draftPlan && draftCount !== null ? draftCount : currentClassCount;
            const groupMembersCount = participatingMembers.filter(m => m.currentGroup === grp.name).length;
            const isParticipating = selectedGroupIds.includes(grp.name);
            const isEmpty = isParticipating && groupMembersCount === 0;

            return (
              <div
                key={grp.id}
                className={`p-4 rounded-lg border transition-all space-y-2 ${
                  !isParticipating
                    ? 'bg-slate-50/60 border-slate-200 opacity-60'
                    : isEmpty
                    ? 'bg-amber-50/40 border-amber-300'
                    : draftPlan
                    ? 'bg-blue-50/30 border-blue-200 shadow-2xs'
                    : 'bg-white border-slate-200 shadow-2xs'
                }`}
              >
                <div className="flex items-center justify-between text-xs">
                  <div className="flex items-center gap-1.5">
                    <span className="font-bold text-slate-900">{grp.name}</span>
                    {!isParticipating && (
                      <span className="text-[10px] bg-slate-200 text-slate-600 px-1.5 py-0.5 rounded-xs">
                        Không tham gia
                      </span>
                    )}
                  </div>
                  <span className="text-slate-600 font-semibold text-xs">
                    {displayClassCount} lớp
                  </span>
                </div>

                <div className="flex items-baseline gap-3">
                  <div className="text-2xl font-bold text-slate-900 font-mono-numbers">
                    {displayPts} <span className="text-xs font-normal text-slate-500">điểm</span>
                  </div>

                  {draftPlan && draftPts !== null && (
                    <div className="text-xs font-bold text-blue-700 bg-blue-100/70 border border-blue-200 px-2 py-0.5 rounded-sm flex items-center gap-1 font-mono-numbers">
                      Dự kiến: {draftPts}đ ({draftPts >= currentPts ? `+${draftPts - currentPts}` : draftPts - currentPts})
                    </div>
                  )}
                </div>

                <div className="text-[11px] text-slate-500 flex items-center justify-between">
                  <span>Nhân sự khả dụng: {groupMembersCount} người</span>
                  {isEmpty && (
                    <span className="text-amber-700 font-semibold flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3" />
                      Không có nhân sự
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {/* Draft Explanation Banner (Requirements 4 & 5) */}
        {draftPlan && (
          <div className="p-4 bg-blue-50/90 border border-blue-200 rounded-lg space-y-3 text-xs text-blue-950 shadow-2xs">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <Sparkles className="w-5 h-5 text-blue-600 shrink-0" />
                <div>
                  <div className="font-bold text-sm text-blue-900 flex items-center gap-2">
                    <span>Kết quả phân bổ đào tạo ({draftPlan.filter(p => p.assignedOnbCode).length}/{draftPlan.length} lớp đã giao)</span>
                    {unallocatedList.length === 0 ? (
                      <span className="text-[11px] bg-emerald-100 text-emerald-800 font-semibold px-2 py-0.5 rounded-full border border-emerald-300">
                        100% lớp hợp lệ
                      </span>
                    ) : (
                      <span className="text-[11px] bg-amber-100 text-amber-800 font-semibold px-2 py-0.5 rounded-full border border-amber-300">
                        {unallocatedList.length} lớp chưa giao
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-blue-800 mt-1">
                    {draftExplanation || `Chênh lệch điểm giữa 3 nhóm: ${draftMaxDelta}đ.`}
                    {' '}Bạn có thể đổi người nhận lớp trực tiếp ở bảng bên dưới, số điểm nhóm sẽ tự động cập nhật ngay lập tức.
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleSaveAssignments}
                  disabled={isSavingAssignments}
                  className="px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded font-semibold text-xs shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  title="Lưu người được phân công vào danh sách lớp (chưa điền vào lịch làm việc)"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSavingAssignments ? 'Đang lưu...' : 'Lưu kết quả phân bổ'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleConfirmAndFillSchedules}
                  disabled={isConfirming}
                  className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded font-semibold text-xs shadow-2xs flex items-center gap-1.5 cursor-pointer"
                  title="Chốt phân bổ và tự động điền các ca học vào Lịch công việc"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>{isConfirming ? 'Đang điền...' : 'Chốt & Điền lịch'}</span>
                </button>

                <button
                  type="button"
                  onClick={() => {
                    setDraftPlan(null);
                    setUnallocatedList([]);
                    setSimulationSummary(null);
                  }}
                  className="px-2.5 py-1.5 text-xs font-medium text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 rounded cursor-pointer"
                >
                  Hủy nháp
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Unallocated Classes Banner if any (Requirements 1 & 5) */}
        {draftPlan && unallocatedList.length > 0 && (
          <div className="p-4 bg-rose-50 border border-rose-300 rounded-lg space-y-2.5 shadow-2xs">
            <div className="flex items-center gap-2 text-rose-800 font-bold text-xs sm:text-sm">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0" />
              <span>Có {unallocatedList.length} lớp chưa thể phân bổ nhân sự</span>
            </div>
            <p className="text-xs text-rose-700">
              Các lớp dưới đây không tìm được nhân sự khả dụng do tất cả nhân sự tham gia đều bị bận/trùng lịch hoặc đã bị đưa vào danh sách loại trừ trong tháng:
            </p>
            <div className="overflow-x-auto bg-white rounded border border-rose-200">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-rose-100/70 text-rose-900 border-b border-rose-200 font-semibold text-[11px]">
                    <th className="py-2 px-3">Mã lớp</th>
                    <th className="py-2 px-3">Module / Nội dung lớp</th>
                    <th className="py-2 px-3">Thời gian</th>
                    <th className="py-2 px-3">Lý do chưa thể phân bổ</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-rose-100 text-slate-800">
                  {unallocatedList.map(item => (
                    <tr key={item.id} className="hover:bg-rose-50/50">
                      <td className="py-2 px-3 font-mono font-semibold text-rose-900 whitespace-nowrap">{item.packageCode}</td>
                      <td className="py-2 px-3">
                        <span className="font-semibold text-slate-900">{item.productCode}</span>: {item.contentTitle || item.productCode}
                      </td>
                      <td className="py-2 px-3 font-mono text-slate-700 whitespace-nowrap">{formatDayMonth(item.scheduledDate)} ({item.sessionOfDay})</td>
                      <td className="py-2 px-3 text-rose-700 font-medium">{item.reason}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>

      {/* 4. Monthly Training Classes Table */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
        <div className="p-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
              Danh sách lớp đào tạo trong tháng ({draftPlan ? 'Đang xem bản nháp' : 'Chính thức'})
            </h3>
            <p className="text-xs text-slate-500 mt-0.5">
              Thứ tự hiển thị chuẩn: Module → Thời gian → Ngày → Điểm gói → Nhân sự được giao → Nhóm nhận → Ghi chú
            </p>
          </div>

          <div className="flex items-center gap-3 text-xs text-slate-500 font-mono flex-wrap">
            <span>Tổng: <strong>{filteredPackages.length}</strong> lớp</span>
            <span>·</span>
            <span>Đã điền lịch: <strong className="text-emerald-700">{filteredPackages.filter(p => p.scheduleStatus === 'Đã điền lịch').length}</strong></span>
            {selectedDays.length > 0 && (
              <span className="bg-blue-50 text-blue-700 px-2 py-0.5 rounded-full font-sans font-semibold border border-blue-200 text-[11px] inline-flex items-center gap-1.5">
                <span>Đang lọc: {selectedDays.map(d => WEEKDAY_OPTIONS.find(o => o.day === d)?.short || d).join(', ')}</span>
                <button
                  type="button"
                  onClick={handleClearDayFilter}
                  className="hover:text-blue-900 font-bold cursor-pointer"
                  title="Xóa bộ lọc Thứ"
                >
                  ×
                </button>
              </span>
            )}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse text-xs">
            <thead>
              <tr className="bg-[#F1F5F9] border-b border-[#E2E8F0] text-[#475569] font-semibold uppercase tracking-wider text-[11px]">
                <th className="py-2.5 px-2.5 w-20 text-center">Tháng/Năm</th>
                <th className="py-2.5 px-2.5 min-w-[140px]">Tuần</th>
                
                {/* 3. Cột Thứ với Bộ lọc độc lập theo người dùng */}
                <th className="py-2.5 px-2.5 w-24 text-center relative">
                  <div className="flex items-center justify-center gap-1">
                    <span>Thứ</span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setIsDayFilterOpen(!isDayFilterOpen);
                      }}
                      className={`p-1 rounded hover:bg-slate-200 transition-colors cursor-pointer relative ${
                        selectedDays.length > 0 ? 'text-blue-700 bg-blue-100 font-bold' : 'text-slate-400'
                      }`}
                      title={selectedDays.length > 0 ? `Đang lọc: ${selectedDays.map(d => WEEKDAY_OPTIONS.find(o => o.day === d)?.label).join(', ')}` : 'Lọc theo Thứ'}
                    >
                      <Filter className="w-3.5 h-3.5" />
                      {selectedDays.length > 0 && (
                        <span className="absolute -top-1 -right-1 bg-blue-600 text-white text-[9px] w-3 h-3 rounded-full flex items-center justify-center font-bold">
                          {selectedDays.length}
                        </span>
                      )}
                    </button>
                  </div>

                  {/* Dropdown Menu bộ lọc theo Thứ */}
                  {isDayFilterOpen && (
                    <div
                      className="absolute left-1/2 -translate-x-1/2 top-full mt-1 w-52 bg-white rounded-md shadow-xl border border-slate-200 z-30 p-2.5 text-left normal-case tracking-normal text-xs"
                      onClick={e => e.stopPropagation()}
                    >
                      <div className="flex items-center justify-between pb-1.5 border-b border-slate-100 mb-1.5 font-bold text-slate-800 text-[11px]">
                        <span>Lọc theo Thứ</span>
                        {selectedDays.length > 0 && (
                          <button
                            type="button"
                            onClick={handleClearDayFilter}
                            className="text-[10px] text-blue-600 hover:underline font-semibold cursor-pointer"
                          >
                            Xóa lọc
                          </button>
                        )}
                      </div>

                      <div className="space-y-1 py-1 max-h-56 overflow-y-auto">
                        <label className="flex items-center gap-2 px-1.5 py-1 hover:bg-slate-50 rounded cursor-pointer font-medium text-slate-800 text-xs">
                          <input
                            type="checkbox"
                            checked={selectedDays.length === 0}
                            onChange={handleSelectAllDays}
                            className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                          />
                          <span>Tất cả</span>
                        </label>
                        {WEEKDAY_OPTIONS.map(opt => (
                          <label key={opt.day} className="flex items-center gap-2 px-1.5 py-1 hover:bg-slate-50 rounded cursor-pointer text-slate-700 text-xs">
                            <input
                              type="checkbox"
                              checked={selectedDays.includes(opt.day)}
                              onChange={() => handleToggleDay(opt.day)}
                              className="rounded text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span>{opt.label}</span>
                          </label>
                        ))}
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex items-center justify-between mt-1">
                        <button
                          type="button"
                          onClick={handleClearDayFilter}
                          className="text-[11px] text-slate-500 hover:text-slate-700 cursor-pointer"
                        >
                          Mặc định
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsDayFilterOpen(false)}
                          className="px-2.5 py-1 text-[11px] font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded transition-colors cursor-pointer"
                        >
                          Đóng
                        </button>
                      </div>
                    </div>
                  )}
                </th>

                <th className="py-2.5 px-2.5 w-20 text-center font-mono">Ngày</th>
                <th className="py-2.5 px-2.5 w-18 text-center">Buổi</th>
                <th className="py-2.5 px-3 min-w-[180px]">Module / Nội dung lớp</th>
                <th className="py-2.5 px-2.5 w-20 text-right font-mono">Điểm gói</th>
                <th className="py-2.5 px-3 min-w-[190px]">ONB được giao</th>
                <th className="py-2.5 px-2.5 w-24 text-center">Nhóm nhận</th>
                <th className="py-2.5 px-3 min-w-[140px]">Ghi chú</th>
                <th className="py-2.5 px-2.5 w-28 text-center">Trạng thái</th>
                <th className="py-2.5 px-2.5 text-right w-24">Thao tác</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {filteredPackages.map((pkg, idx) => {
                const assignedMember = members.find(m => m.code === pkg.assignedOnbCode);
                const isFilledInSchedule = pkg.scheduleStatus === 'Đã điền lịch' && Boolean(pkg.scheduleId);
                const isConflictError = pkg.scheduleStatus === 'Lỗi xung đột';

                // Check live conflict if in draft mode
                const draftConflict = draftPlan && pkg.assignedOnbCode
                  ? checkMemberConflict(pkg.assignedOnbCode, pkg.scheduledDate, pkg.sessionOfDay, pkg.id)
                  : null;

                const weekInfo = getWeekDisplayInfo(pkg.scheduledDate);
                const dayOfWeekDisplay = pkg.dayOfWeekName
                  ? (pkg.dayOfWeek === 8 ? 'CN' : `T${pkg.dayOfWeek || ''}`)
                  : weekInfo.dayOfWeekStr;
                const weekLabelDisplay = pkg.weekLabel || weekInfo.weekLabel;
                const monthYearDisplay = weekInfo.monthYearStr || pkg.monthYear?.split('-').reverse().join('/') || monthYear;

                return (
                  <tr
                    key={pkg.id}
                    className={`transition-colors text-xs ${
                      isConflictError || draftConflict
                        ? 'bg-rose-50/50 hover:bg-rose-50'
                        : isFilledInSchedule
                        ? 'bg-emerald-50/30 hover:bg-emerald-50/60'
                        : 'hover:bg-slate-50/70'
                    }`}
                  >
                    {/* 1. Tháng/năm */}
                    <td className="py-2.5 px-2.5 text-center font-mono text-slate-600 whitespace-nowrap">
                      {monthYearDisplay}
                    </td>

                    {/* 2. Tuần */}
                    <td className="py-2.5 px-2.5 text-slate-700 whitespace-nowrap font-medium text-[11px]">
                      {weekLabelDisplay}
                    </td>

                    {/* 3. Thứ */}
                    <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                      <span className="px-1.5 py-0.5 rounded-xs bg-slate-100 text-slate-700 font-semibold text-[11px] border border-slate-200">
                        {dayOfWeekDisplay}
                      </span>
                    </td>

                    {/* 4. Ngày */}
                    <td className="py-2.5 px-2.5 text-center font-mono text-slate-800 font-medium whitespace-nowrap" title={pkg.scheduledDate}>
                      {formatDayMonth(pkg.scheduledDate)}
                    </td>

                    {/* 5. Buổi */}
                    <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                      <span className={`px-2 py-0.5 rounded-xs font-semibold text-[11px] ${
                        pkg.sessionOfDay === 'Sáng'
                          ? 'bg-amber-100 text-amber-800'
                          : 'bg-blue-100 text-blue-800'
                      }`}>
                        {pkg.sessionOfDay}
                      </span>
                    </td>

                    {/* 6. Module / Nội dung lớp */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="flex items-center gap-1.5">
                        <span className="bg-blue-50 text-blue-700 font-bold px-1.5 py-0.5 rounded-xs border border-blue-200 text-[11px]">
                          {pkg.productCode}
                        </span>
                        <span className="font-semibold text-slate-900 truncate max-w-[160px]" title={pkg.contentTitle || pkg.title || pkg.moduleName}>
                          {pkg.contentTitle || pkg.title || pkg.moduleName || `Đào tạo ${pkg.productCode}`}
                        </span>
                      </div>
                    </td>

                    {/* 7. Điểm gói */}
                    <td className="py-2.5 px-2.5 text-right whitespace-nowrap font-mono">
                      {pkg.hasReferenceScore === false ? (
                        <span className="text-[10px] font-bold text-rose-700 bg-rose-50 border border-rose-200 px-1 py-0.5 rounded-xs">
                          Chưa có điểm
                        </span>
                      ) : (
                        <span className="font-bold text-slate-900">
                          {Number(pkg.allocationPoints || 0).toFixed(2)}đ
                        </span>
                      )}
                    </td>

                    {/* 8. ONB được giao - Cho phép sửa và đồng bộ với Lịch công việc */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {canManage ? (
                        <div className="space-y-1">
                          <select
                            value={pkg.assignedOnbCode || ''}
                            onChange={e => {
                              if (draftPlan) {
                                handleManualDraftChange(pkg.id, e.target.value);
                              } else {
                                handleDirectAssignMember(pkg.id, e.target.value);
                              }
                            }}
                            className={`w-full border rounded-sm p-1 text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-hidden ${
                              isFilledInSchedule
                                ? 'border-emerald-300 bg-emerald-50/40 text-emerald-950 font-semibold'
                                : 'border-slate-300 bg-white text-slate-900'
                            }`}
                            title={isFilledInSchedule ? 'Lớp đã có lịch: Thay đổi sẽ tự động chuyển lịch sang người mới' : 'Chọn nhân sự nhận lớp'}
                          >
                            {!isFilledInSchedule && (
                              <option value="">-- Chưa giao --</option>
                            )}
                            {activeMembers.map(m => (
                              <option key={m.code} value={m.code}>
                                {m.fullName} ({m.code} - {m.currentGroup})
                              </option>
                            ))}
                            {pkg.assignedOnbCode && !activeMembers.some(m => m.code === pkg.assignedOnbCode) && (
                              <option value={pkg.assignedOnbCode}>
                                {pkg.assignedOnbCode}
                              </option>
                            )}
                          </select>

                          {/* Nhật ký chuyển nếu có */}
                          {pkg.transferHistory && pkg.transferHistory.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setViewTransferHistoryPkg(pkg)}
                              className="text-[10px] text-blue-700 hover:text-blue-900 bg-blue-50 hover:bg-blue-100 border border-blue-200 px-1.5 py-0.5 rounded-xs flex items-center gap-1 cursor-pointer transition-colors"
                              title="Xem lịch sử chuyển giao người phụ trách"
                            >
                              <ArrowLeftRight className="w-3 h-3 text-blue-600" />
                              <span>Đã chuyển ({pkg.transferHistory.length})</span>
                            </button>
                          )}

                          {draftConflict && (
                            <div className="text-[10px] text-rose-600 font-medium flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>Trùng: {draftConflict.title}</span>
                            </div>
                          )}
                        </div>
                      ) : (
                        <div>
                          <div className="font-semibold text-slate-900">
                            {assignedMember ? `${assignedMember.fullName} (${pkg.assignedOnbCode})` : <span className="text-slate-400 font-normal">Chưa phân bổ</span>}
                          </div>
                          {pkg.transferHistory && pkg.transferHistory.length > 0 && (
                            <button
                              type="button"
                              onClick={() => setViewTransferHistoryPkg(pkg)}
                              className="text-[10px] text-blue-700 hover:text-blue-900 bg-blue-50 border border-blue-200 px-1.5 py-0.5 rounded-xs flex items-center gap-1 cursor-pointer mt-0.5"
                              title="Xem lịch sử chuyển giao người phụ trách"
                            >
                              <ArrowLeftRight className="w-3 h-3 text-blue-600" />
                              <span>Đã chuyển ({pkg.transferHistory.length})</span>
                            </button>
                          )}
                          {isConflictError && pkg.fillScheduleError && (
                            <div className="text-[10px] text-rose-600 font-medium flex items-center gap-1 mt-0.5">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>Xung đột lịch</span>
                            </div>
                          )}
                        </div>
                      )}
                    </td>

                    {/* 9. Nhóm nhận */}
                    <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                      <span className={`text-[11px] font-medium px-2 py-0.5 rounded-xs ${
                        pkg.assignedGroup ? 'bg-slate-100 text-slate-800' : 'text-slate-400'
                      }`}>
                        {pkg.assignedGroup || '—'}
                      </span>
                    </td>

                    {/* 10. Ghi chú */}
                    <td className="py-2.5 px-3 text-slate-600 text-[11px] max-w-[180px]">
                      {pkg.userNotes && (
                        <div className="font-medium text-slate-800 truncate" title={pkg.userNotes}>
                          {pkg.userNotes}
                        </div>
                      )}
                      {pkg.systemNotes && (
                        <div className="text-[10px] text-blue-600 truncate" title={pkg.systemNotes}>
                          {pkg.systemNotes}
                        </div>
                      )}
                      {!pkg.userNotes && !pkg.systemNotes && <span className="text-slate-300">—</span>}
                    </td>

                    {/* 11. Trạng thái */}
                    <td className="py-2.5 px-2.5 text-center whitespace-nowrap">
                      {isFilledInSchedule ? (
                        <span className="px-2 py-0.5 rounded-xs text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200 inline-flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                          Đã điền lịch
                        </span>
                      ) : pkg.scheduleStatus === 'Lỗi xung đột' ? (
                        <button
                          onClick={() => setReportModalData({ failedClasses: [pkg] })}
                          className="px-2 py-0.5 rounded-xs text-[10px] font-bold text-rose-800 bg-rose-50 border border-rose-200 inline-flex items-center gap-1 hover:underline cursor-pointer"
                          title={pkg.fillScheduleError}
                        >
                          <AlertTriangle className="w-3 h-3 text-rose-600" />
                          Lỗi xung đột
                        </button>
                      ) : draftPlan ? (
                        pkg.assignedOnbCode ? (
                          <span className="px-2 py-0.5 rounded-xs text-[10px] font-bold text-blue-800 bg-blue-100 border border-blue-200">
                            Dự kiến giao
                          </span>
                        ) : (
                          <span className="px-2 py-0.5 rounded-xs text-[10px] font-bold text-amber-800 bg-amber-100 border border-amber-200">
                            Chưa thể giao
                          </span>
                        )
                      ) : pkg.assignedOnbCode ? (
                        <span className="px-2 py-0.5 rounded-xs text-[10px] font-semibold text-blue-800 bg-blue-50 border border-blue-200">
                          Đã phân bổ
                        </span>
                      ) : (
                        <span className="px-2 py-0.5 rounded-xs text-[10px] font-medium text-slate-500 bg-slate-100">
                          Chưa phân bổ
                        </span>
                      )}
                    </td>

                    {/* 12. Thao tác */}
                    <td className="py-2.5 px-2.5 text-right whitespace-nowrap">
                      <div className="flex items-center justify-end gap-1">
                        {/* Nút Khóa / Mở */}
                        {canManage && (
                          <button
                            onClick={() => handleToggleLock(pkg)}
                            className={`p-1 rounded-sm text-[11px] transition-colors inline-flex items-center ${
                              pkg.isLocked
                                ? 'text-amber-800 bg-amber-50 hover:bg-amber-100'
                                : 'text-slate-400 hover:text-slate-700'
                            }`}
                            title={pkg.isLocked ? 'Đang khóa phân công (Giữ nguyên khi phân bổ lại)' : 'Chưa khóa'}
                          >
                            {pkg.isLocked ? <Lock className="w-3.5 h-3.5" /> : <Unlock className="w-3.5 h-3.5" />}
                          </button>
                        )}

                        {/* Nút Xem lịch làm việc */}
                        {pkg.assignedOnbCode && onNavigateToSchedule && (
                          <button
                            onClick={() => onNavigateToSchedule(pkg.assignedOnbCode, pkg.scheduledDate)}
                            className="p-1 text-slate-400 hover:text-indigo-600 transition-colors cursor-pointer"
                            title={`Xem lịch của ${pkg.assignedOnbCode} ngày ${pkg.scheduledDate}`}
                          >
                            <Calendar className="w-3.5 h-3.5" />
                          </button>
                        )}

                        {canManage && (
                          <>
                            {isFilledInSchedule && (
                              <button
                                onClick={() => handleUnlinkSchedule(pkg)}
                                className="p-1 text-slate-400 hover:text-amber-600 transition-colors"
                                title="Hủy liên kết lịch để điều chuyển người nhận"
                              >
                                <RefreshCw className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              onClick={() => handleOpenEditModal(pkg)}
                              className="p-1 text-slate-400 hover:text-blue-600 transition-colors cursor-pointer"
                              title="Sửa thông tin lớp"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleDuplicateClass(pkg.id)}
                              className="p-1 text-slate-400 hover:text-emerald-600 transition-colors cursor-pointer"
                              title="Nhân bản lớp này"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleOpenDeleteModal(pkg)}
                              className="p-1 text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                              title="Xóa lớp đào tạo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}

              {filteredPackages.length === 0 && (
                <tr>
                  <td colSpan={canManage ? 12 : 11} className="py-10 text-center text-slate-400">
                    {selectedDays.length > 0 ? (
                      <div className="space-y-2">
                        <p className="font-medium text-slate-600">Không có lớp đào tạo phù hợp với bộ lọc.</p>
                        <button
                          type="button"
                          onClick={handleClearDayFilter}
                          className="text-xs font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                        >
                          Xóa bộ lọc Thứ để xem tất cả ({trainingPackages.length} lớp)
                        </button>
                      </div>
                    ) : (
                      <div>
                        <p>Chưa có lớp đào tạo nào trong tháng {monthYear}.</p>
                        {canManage && (
                          <button
                            onClick={handleOpenAddModal}
                            className="mt-2 text-xs font-semibold text-blue-600 hover:text-blue-800 underline cursor-pointer"
                          >
                            + Thêm lớp đào tạo đầu tiên
                          </button>
                        )}
                      </div>
                    )}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )}

      {/* 2.5. SUBTAB: EXCLUSIONS (Danh sách nhân sự không tham gia nhận lớp trong tháng / Danh sách loại trừ - Requirement 2) */}
      {activeSubTab === 'EXCLUSIONS' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <UserX className="w-4 h-4 text-amber-600" />
                  <span>Danh sách nhân sự loại trừ không nhận lớp trong tháng {monthYear}</span>
                </h3>
                <p className="text-xs text-slate-500 mt-1">
                  Mặc định toàn bộ nhân viên ONB ({activeMembers.length} người) đều có thể nhận lớp của tất cả module. Chọn những người không tham gia nhận lớp trong tháng này.
                </p>
              </div>

              {canManage && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => handleSaveExclusions(excludedOnbCodes)}
                    disabled={isSavingExclusions}
                    className="px-3.5 py-1.5 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-md transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{isSavingExclusions ? 'Đang lưu...' : 'Lưu danh sách loại trừ'}</span>
                  </button>
                  {excludedOnbCodes.length > 0 && (
                    <button
                      type="button"
                      onClick={() => handleSaveExclusions([])}
                      disabled={isSavingExclusions}
                      className="px-3 py-1.5 text-xs font-medium text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors cursor-pointer"
                      title="Bỏ loại trừ tất cả nhân sự để toàn bộ cùng tham gia"
                    >
                      Bỏ loại trừ tất cả
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Explanation box */}
            <div className="p-3.5 bg-amber-50/70 border border-amber-200 rounded-lg text-xs text-amber-950 space-y-1">
              <div className="font-bold flex items-center gap-1.5 text-amber-900">
                <Info className="w-4 h-4 text-amber-600 shrink-0" />
                <span>Quy tắc vận hành danh sách loại trừ (Requirement 2):</span>
              </div>
              <ul className="list-disc list-inside space-y-0.5 text-slate-700 ml-1">
                <li>Toàn bộ nhân viên ONB mặc định có thể nhận lớp của tất cả module (không cần khai báo từng cặp).</li>
                <li>Danh sách tham gia phân bổ = <strong>Toàn bộ nhân viên ONB ({activeMembers.length})</strong> trừ đi <strong>Nhân sự bị loại ({excludedOnbCodes.length})</strong> = <strong>{participatingMembers.length} người</strong>.</li>
                <li>Nhân sự bị loại sẽ không nhận bất kỳ lớp nào khi chạy phân bổ, kể cả khi đã có đăng ký ưu tiên trước đó.</li>
                <li>Việc loại trừ chỉ áp dụng cho riêng tháng {monthYear}, hoàn toàn không thay đổi danh sách nhân viên chung hay phân quyền.</li>
              </ul>
            </div>

            {/* Summary Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 text-xs">
                <span className="text-slate-500">Tổng nhân sự ONB hoạt động</span>
                <div className="text-xl font-bold text-slate-900 mt-0.5">{activeMembers.length} người</div>
              </div>
              <div className="p-3 bg-emerald-50/60 rounded-lg border border-emerald-200 text-xs">
                <span className="text-emerald-700 font-medium">Tham gia nhận lớp tháng {monthYear}</span>
                <div className="text-xl font-bold text-emerald-800 mt-0.5">{participatingMembers.length} người</div>
              </div>
              <div className="p-3 bg-amber-50/60 rounded-lg border border-amber-200 text-xs">
                <span className="text-amber-700 font-medium">Bị loại trừ (Không nhận lớp)</span>
                <div className="text-xl font-bold text-amber-800 mt-0.5">{excludedOnbCodes.length} người</div>
              </div>
            </div>

            {/* Filters & Search */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              <div className="flex items-center gap-2 flex-1 max-w-md">
                <div className="relative w-full">
                  <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={exclusionSearch}
                    onChange={e => setExclusionSearch(e.target.value)}
                    placeholder="Tìm theo tên hoặc mã nhân sự..."
                    className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-md focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="flex items-center gap-2">
                <select
                  value={exclusionGroupFilter}
                  onChange={e => setExclusionGroupFilter(e.target.value)}
                  className="text-xs border border-slate-300 rounded-md p-1.5 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                >
                  <option value="">-- Tất cả nhóm --</option>
                  {activeGroups.map(g => (
                    <option key={g.id} value={g.name}>{g.name}</option>
                  ))}
                </select>
              </div>
            </div>

            {/* Personnel Exclusion Table */}
            <div className="overflow-x-auto border border-slate-200 rounded-lg">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px] uppercase tracking-wider">
                    <th className="py-2.5 px-3 w-12 text-center">Loại trừ</th>
                    <th className="py-2.5 px-3 w-24">Mã ONB</th>
                    <th className="py-2.5 px-3">Họ và tên</th>
                    <th className="py-2.5 px-3 w-28 text-center">Nhóm hiện tại</th>
                    <th className="py-2.5 px-3 w-36 text-center">Đăng ký ưu tiên</th>
                    <th className="py-2.5 px-3 w-40 text-center">Trạng thái nhận lớp</th>
                    <th className="py-2.5 px-3 w-28 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {activeMembers
                    .filter(m => {
                      if (exclusionGroupFilter && m.currentGroup !== exclusionGroupFilter) return false;
                      if (exclusionSearch) {
                        const term = exclusionSearch.toLowerCase();
                        return m.fullName.toLowerCase().includes(term) || m.code.toLowerCase().includes(term);
                      }
                      return true;
                    })
                    .map(m => {
                      const isExcluded = excludedOnbCodes.includes(m.code);
                      const memberPriorities = priorities.filter(p => p.onbCode === m.code);

                      return (
                        <tr
                          key={m.code}
                          className={`transition-colors ${
                            isExcluded ? 'bg-amber-50/50 hover:bg-amber-50' : 'hover:bg-slate-50/70'
                          }`}
                        >
                          <td className="py-2.5 px-3 text-center">
                            <input
                              type="checkbox"
                              checked={isExcluded}
                              disabled={!canManage}
                              onChange={() => {
                                const next = isExcluded
                                  ? excludedOnbCodes.filter(c => c !== m.code)
                                  : [...excludedOnbCodes, m.code];
                                setExcludedOnbCodes(next);
                              }}
                              className="rounded text-amber-600 focus:ring-amber-500 cursor-pointer"
                              title={isExcluded ? 'Bỏ loại trừ' : 'Đưa vào danh sách loại trừ'}
                            />
                          </td>
                          <td className="py-2.5 px-3 font-mono font-semibold text-slate-800">
                            {m.code}
                          </td>
                          <td className="py-2.5 px-3">
                            <span className="font-semibold text-slate-900">{m.fullName}</span>
                            {m.email && <span className="text-[11px] text-slate-400 block">{m.email}</span>}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            <span className="px-2 py-0.5 rounded bg-slate-100 text-slate-700 font-medium text-[11px]">
                              {m.currentGroup || '—'}
                            </span>
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {memberPriorities.length > 0 ? (
                              <span className={`text-[11px] font-semibold px-2 py-0.5 rounded ${
                                isExcluded
                                  ? 'bg-amber-100 text-amber-800 line-through'
                                  : 'bg-blue-50 text-blue-700'
                              }`} title={isExcluded ? 'Đã bị loại trừ: Đăng ký ưu tiên sẽ không được áp dụng' : 'Đăng ký ưu tiên có hiệu lực'}>
                                {memberPriorities.length} module {isExcluded ? '(vô hiệu)' : ''}
                              </span>
                            ) : (
                              <span className="text-slate-300 text-[11px]">Không có</span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-center">
                            {isExcluded ? (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800 border border-amber-300 inline-flex items-center gap-1">
                                <UserX className="w-3 h-3 text-amber-600" />
                                Bị loại trừ (Không nhận)
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-300 inline-flex items-center gap-1">
                                <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                                Tham gia nhận lớp
                              </span>
                            )}
                          </td>
                          <td className="py-2.5 px-3 text-right">
                            {canManage && (
                              <button
                                type="button"
                                onClick={() => {
                                  const next = isExcluded
                                    ? excludedOnbCodes.filter(c => c !== m.code)
                                    : [...excludedOnbCodes, m.code];
                                  setExcludedOnbCodes(next);
                                }}
                                className={`text-[11px] font-semibold px-2 py-1 rounded transition-colors cursor-pointer ${
                                  isExcluded
                                    ? 'text-emerald-700 hover:text-emerald-900 bg-emerald-50 hover:bg-emerald-100'
                                    : 'text-amber-700 hover:text-amber-900 bg-amber-50 hover:bg-amber-100'
                                }`}
                              >
                                {isExcluded ? 'Cho tham gia' : 'Loại trừ'}
                              </button>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>

            {canManage && (
              <div className="flex items-center justify-between pt-2 border-t border-slate-100">
                <span className="text-xs text-slate-500">
                  Đang chọn loại trừ: <strong className="text-slate-900">{excludedOnbCodes.length}</strong> / {activeMembers.length} nhân sự
                </span>
                <button
                  type="button"
                  onClick={() => handleSaveExclusions(excludedOnbCodes)}
                  disabled={isSavingExclusions}
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-md transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                >
                  <Check className="w-3.5 h-3.5" />
                  <span>{isSavingExclusions ? 'Đang lưu...' : 'Lưu danh sách loại trừ'}</span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. SUBTAB: IN_CHARGE (Quản lý người phụ trách module theo từng tháng) */}
      {activeSubTab === 'IN_CHARGE' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <UserCheck className="w-4 h-4 text-blue-600" />
                  Quản lý người phụ trách module trong tháng {monthYear}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Danh sách người phụ trách quản lý riêng theo tháng, không mặc định kế thừa ngầm sang tháng sau. Thuật toán sẽ ưu tiên người phụ trách của nhóm khi phân bổ module tương ứng.
                </p>
              </div>

              {canManage && (
                <button
                  type="button"
                  onClick={handleOpenCopyModal}
                  disabled={isCopyingInCharge}
                  className="px-3.5 py-1.5 text-xs font-semibold text-slate-700 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-colors flex items-center gap-1.5 shadow-2xs cursor-pointer"
                  title="Sao chép danh sách người phụ trách từ tháng khác có xem trước và xác nhận"
                >
                  <Copy className="w-3.5 h-3.5 text-blue-600" />
                  <span>Sao chép danh sách từ tháng...</span>
                </button>
              )}
            </div>

            {/* Feedback Notification */}
            {inChargeFeedback && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 transition-all ${
                  inChargeFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {inChargeFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span className="font-medium">{inChargeFeedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setInChargeFeedback(null)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                  title="Đóng thông báo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* In-Charge Input Form */}
            {canManage && (
              <form
                onSubmit={handleSaveInCharge}
                className={`p-4 rounded-md border space-y-3 text-xs transition-colors ${
                  editingInCharge
                    ? 'bg-blue-50/50 border-blue-200 ring-1 ring-blue-300'
                    : 'bg-slate-50/70 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">
                      {editingInCharge ? 'Chỉnh sửa người phụ trách module' : 'Khai báo người phụ trách module trong tháng này'}
                    </span>
                    {editingInCharge && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[11px] font-semibold rounded-xs border border-blue-200">
                        Đang sửa: {editingInCharge.onbCode} - {editingInCharge.moduleCode}
                      </span>
                    )}
                  </div>
                  {editingInCharge && (
                    <button
                      type="button"
                      onClick={handleCancelEditInCharge}
                      className="text-slate-500 hover:text-slate-700 text-xs flex items-center gap-1 cursor-pointer bg-white px-2 py-0.5 rounded-xs border border-slate-200 shadow-2xs"
                    >
                      <X className="w-3 h-3" />
                      <span>Hủy chỉnh sửa</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Module đào tạo <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={inChargeModule}
                      onChange={e => setInChargeModule(e.target.value)}
                      className="w-full border border-slate-300 rounded-sm p-1.5 bg-white text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                      required
                    >
                      <option value="">-- Chọn module từ Thiết lập hệ thống --</option>
                      {trainingModules.filter(m => m.isActive || m.code === inChargeModule).map(m => (
                        <option key={m.code} value={m.code}>
                          {m.code} - {m.name} {!m.isActive ? '(Ngừng SD)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Nhân sự ONB <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={inChargeOnb}
                      onChange={e => setInChargeOnb(e.target.value)}
                      className="w-full border border-slate-300 rounded-sm p-1.5 bg-white text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                      required
                    >
                      <option value="">-- Chọn nhân sự từ Thiết lập hệ thống --</option>
                      {members.filter(m => m.isActive || m.code === inChargeOnb).map(m => (
                        <option key={m.code} value={m.code}>
                          {m.fullName} ({m.code} - {m.currentGroup}) {!m.isActive ? '(Ngừng SD)' : ''}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1" title="Số buổi tối đa sẵn sàng nhận trong tháng">
                      Tối đa buổi/tháng
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={inChargeMaxSessions}
                      onChange={e => setInChargeMaxSessions(e.target.value)}
                      placeholder="Không giới hạn"
                      className="w-full border border-slate-300 rounded-sm p-1.5 bg-white text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="flex items-center gap-2 pb-1.5">
                    <label className="flex items-center gap-1.5 cursor-pointer text-slate-800 font-medium">
                      <input
                        type="checkbox"
                        checked={inChargeIsPriority}
                        onChange={e => setInChargeIsPriority(e.target.checked)}
                        className="rounded-xs border-slate-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span>Ưu tiên nhận lớp</span>
                    </label>
                  </div>

                  <div className="md:col-span-4">
                    <label className="block font-semibold text-slate-700 mb-1">Ghi chú phân công</label>
                    <input
                      type="text"
                      placeholder="Ghi chú năng lực chuyên môn, ôn luyện..."
                      value={inChargeNotes}
                      onChange={e => setInChargeNotes(e.target.value)}
                      className="w-full border border-slate-300 rounded-sm p-1.5 bg-white text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="md:col-span-2 flex items-center gap-2">
                    {editingInCharge ? (
                      <>
                        <button
                          type="submit"
                          disabled={isSubmittingInCharge || !inChargeModule || !inChargeOnb}
                          className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-sm transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isSubmittingInCharge ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEditInCharge}
                          disabled={isSubmittingInCharge}
                          className="py-2 px-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold rounded-sm transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Hủy</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="submit"
                        disabled={isSubmittingInCharge || !inChargeModule || !inChargeOnb}
                        className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-sm transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isSubmittingInCharge ? 'Đang thêm...' : 'Thêm phân công'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </form>
            )}

            {/* In-Charge List Table */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3">Tháng/Năm</th>
                    <th className="py-2.5 px-3">Module</th>
                    <th className="py-2.5 px-3">Nhân sự</th>
                    <th className="py-2.5 px-3">Nhóm</th>
                    <th className="py-2.5 px-3 text-center">Ưu tiên nhận lớp</th>
                    <th className="py-2.5 px-3 text-center">Tối đa buổi</th>
                    <th className="py-2.5 px-3">Ghi chú</th>
                    {canManage && <th className="py-2.5 px-3 text-right w-20">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {inChargeMembers.map(ic => {
                    const mem = members.find(m => m.code === ic.onbCode);
                    const mod = trainingModules.find(m => m.code === ic.moduleCode);
                    const isBeingEdited = editingInCharge?.id === ic.id;
                    return (
                      <tr
                        key={ic.id}
                        className={`transition-colors ${
                          isBeingEdited ? 'bg-blue-50/60 font-medium' : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono text-slate-600">{ic.monthYear}</td>
                        <td className="py-2.5 px-3 font-semibold text-blue-700">
                          <span className="bg-blue-50 px-2 py-0.5 rounded-xs border border-blue-200">
                            {ic.moduleCode} - {mod?.name || ic.moduleCode}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {mem?.fullName || ic.onbCode} <span className="text-slate-400 font-mono text-[11px]">({ic.onbCode})</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-medium">
                          {ic.assignedGroup || mem?.currentGroup || '—'}
                        </td>
                        <td className="py-2.5 px-3 text-center">
                          {ic.isPriority ? (
                            <span className="px-2 py-0.5 rounded-xs text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200 inline-flex items-center gap-1">
                              <Sparkles className="w-3 h-3 text-amber-600" />
                              Ưu tiên cao
                            </span>
                          ) : (
                            <span className="text-slate-400 text-[11px]">Bình thường</span>
                          )}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          {ic.maxSessions ? `${ic.maxSessions} buổi` : 'Không giới hạn'}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{ic.notes || '—'}</td>
                        {canManage && (
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenEditInCharge(ic)}
                                className={`p-1 transition-colors cursor-pointer rounded-xs ${
                                  isBeingEdited
                                    ? 'text-blue-700 bg-blue-100 ring-1 ring-blue-400'
                                    : 'text-slate-400 hover:text-blue-600 hover:bg-slate-100'
                                }`}
                                title="Sửa phân công này"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteInCharge(ic)}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xs transition-colors cursor-pointer"
                                title="Xóa phân công này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {inChargeMembers.length === 0 && (
                    <tr>
                      <td colSpan={canManage ? 8 : 7} className="py-8 text-center text-slate-400">
                        <p>Chưa có nhân sự nào được phân công phụ trách module trong tháng {monthYear}.</p>
                        {canManage && (
                          <p className="mt-1 text-xs text-slate-500">
                            Bạn có thể thêm người phụ trách ở form trên hoặc bấm <strong>"Sao chép từ tháng..."</strong>.
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* In-App Delete Confirmation Modal */}
            {deletingInChargeItem && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
                <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-rose-50/60">
                    <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span>Xác nhận xóa phân công người phụ trách</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => !isDeletingInCharge && setDeletingInChargeItem(null)}
                      disabled={isDeletingInCharge}
                      className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-5 space-y-3 text-xs">
                    <p className="text-slate-700 leading-relaxed">
                      Bạn có chắc chắn muốn xóa bản ghi phân công phụ trách module sau đây không?
                    </p>

                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Tháng/Năm:</span>
                        <span className="font-semibold text-slate-800 font-mono">{deletingInChargeItem.monthYear}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Module:</span>
                        <span className="font-semibold text-blue-700">
                          {deletingInChargeItem.moduleCode} - {trainingModules.find(m => m.code === deletingInChargeItem.moduleCode)?.name || deletingInChargeItem.moduleCode}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Nhân sự:</span>
                        <span className="font-semibold text-slate-800">
                          {members.find(m => m.code === deletingInChargeItem.onbCode)?.fullName || deletingInChargeItem.onbCode} ({deletingInChargeItem.onbCode})
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Nhóm:</span>
                        <span className="font-medium text-slate-700">
                          {deletingInChargeItem.assignedGroup || members.find(m => m.code === deletingInChargeItem.onbCode)?.currentGroup || '—'}
                        </span>
                      </div>
                      {deletingInChargeItem.maxSessions && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Tối đa:</span>
                          <span className="font-medium text-slate-700 font-mono">{deletingInChargeItem.maxSessions} buổi/tháng</span>
                        </div>
                      )}
                    </div>

                    <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-sm text-amber-900 text-[11px] leading-relaxed">
                      <strong>Lưu ý:</strong> Xóa một bản ghi phụ trách module không đồng nghĩa với loại nhân sự khỏi đợt phân bổ. Việc không nhận lớp vẫn được quản lý riêng tại tab "Nhân sự không nhận lớp".
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50/50">
                    <button
                      type="button"
                      onClick={() => setDeletingInChargeItem(null)}
                      disabled={isDeletingInCharge}
                      className="px-3.5 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDeleteInCharge}
                      disabled={isDeletingInCharge}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-semibold text-xs rounded-md transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isDeletingInCharge ? 'Đang xóa...' : 'Xác nhận xóa'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. SUBTAB: PRIORITIES (Đăng ký ưu tiên nhận lớp) */}
      {activeSubTab === 'PRIORITIES' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-4">
            <div className="border-b border-slate-100 pb-3">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <BookmarkCheck className="w-4 h-4 text-blue-600" />
                Khai báo danh sách người đăng ký ưu tiên nhận lớp ({monthYear})
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Dành cho nhân sự vừa hoàn thành học sản phẩm/module đăng ký ôn luyện. Thuật toán sẽ ưu tiên giao lớp đúng module trong giới hạn số buổi tối đa.
              </p>
            </div>

            {/* Feedback Notification */}
            {priorityFeedback && (
              <div
                className={`p-3 rounded-lg border text-xs flex items-center justify-between gap-2 transition-all ${
                  priorityFeedback.type === 'success'
                    ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                    : 'bg-rose-50 border-rose-200 text-rose-800'
                }`}
              >
                <div className="flex items-center gap-2">
                  {priorityFeedback.type === 'success' ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                  ) : (
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  )}
                  <span className="font-medium">{priorityFeedback.message}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setPriorityFeedback(null)}
                  className="text-slate-400 hover:text-slate-600 cursor-pointer p-0.5"
                  title="Đóng thông báo"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              </div>
            )}

            {/* Registration Input Form */}
            {canManage && (
              <form
                onSubmit={handleSavePriority}
                className={`p-4 rounded-md border space-y-3 text-xs transition-colors ${
                  editingPriority
                    ? 'bg-blue-50/50 border-blue-200 ring-1 ring-blue-300'
                    : 'bg-slate-50/70 border-slate-200'
                }`}
              >
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-slate-800">
                      {editingPriority ? 'Chỉnh sửa đăng ký ưu tiên nhận lớp' : 'Thêm mới đăng ký ưu tiên nhận lớp trong tháng này'}
                    </span>
                    {editingPriority && (
                      <span className="px-2 py-0.5 bg-blue-100 text-blue-800 text-[11px] font-semibold rounded-xs border border-blue-200">
                        Đang sửa: {editingPriority.onbCode} - {editingPriority.moduleCode}
                      </span>
                    )}
                  </div>
                  {editingPriority && (
                    <button
                      type="button"
                      onClick={handleCancelEditPriority}
                      className="text-slate-500 hover:text-slate-700 text-xs flex items-center gap-1 cursor-pointer bg-white px-2 py-0.5 rounded-xs border border-slate-200 shadow-2xs"
                    >
                      <X className="w-3 h-3" />
                      <span>Hủy chỉnh sửa</span>
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-6 gap-3 items-end">
                  <div className="md:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Nhân sự ONB <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={priorityOnb}
                      onChange={e => setPriorityOnb(e.target.value)}
                      className="w-full border border-slate-300 rounded-sm p-1.5 bg-white text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                      required
                    >
                      <option value="">-- Chọn nhân sự --</option>
                      {activeMembers.map(m => (
                        <option key={m.code} value={m.code}>
                          {m.fullName} ({m.code} - {m.currentGroup})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="md:col-span-2">
                    <label className="block font-semibold text-slate-700 mb-1">
                      Module đăng ký <span className="text-rose-500">*</span>
                    </label>
                    <select
                      value={priorityModule}
                      onChange={e => setPriorityModule(e.target.value)}
                      className="w-full border border-slate-300 rounded-sm p-1.5 bg-white text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                      required
                    >
                      <option value="">-- Chọn module từ Thiết lập hệ thống --</option>
                      {trainingModules
                        .filter(m => m.isActive || m.code === priorityModule)
                        .map(m => (
                          <option key={m.code} value={m.code}>
                            {m.code} - {m.name} {!m.isActive ? '(Ngừng SD)' : ''}
                          </option>
                        ))}
                    </select>
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1" title="Số buổi/lớp tối đa nhân sự sẵn sàng nhận trong tháng để tránh dồn lớp">
                      Tối đa buổi/tháng
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="30"
                      value={priorityMaxSessions}
                      onChange={e => setPriorityMaxSessions(e.target.value)}
                      placeholder="VD: 2"
                      className="w-full border border-slate-300 rounded-sm p-1.5 bg-white text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden font-mono"
                    />
                  </div>

                  <div>
                    <label className="block font-semibold text-slate-700 mb-1" title="Thứ tự ưu tiên khi có nhiều người đăng ký cùng module">
                      Thứ tự ưu tiên
                    </label>
                    <input
                      type="number"
                      min="1"
                      max="99"
                      value={priorityOrder}
                      onChange={e => setPriorityOrder(e.target.value)}
                      placeholder="1"
                      className="w-full border border-slate-300 rounded-sm p-1.5 bg-white text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden font-mono"
                    />
                  </div>

                  <div className="md:col-span-4">
                    <label className="block font-semibold text-slate-700 mb-1">Ghi chú (Tùy chọn)</label>
                    <input
                      type="text"
                      placeholder="Lý do đăng ký nhận lớp, vừa hoàn thành ôn luyện module..."
                      value={priorityNotes}
                      onChange={e => setPriorityNotes(e.target.value)}
                      className="w-full border border-slate-300 rounded-sm p-1.5 bg-white text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                    />
                  </div>

                  <div className="md:col-span-2 flex items-center gap-2">
                    {editingPriority ? (
                      <>
                        <button
                          type="submit"
                          disabled={isSubmittingPriority || !priorityOnb || !priorityModule}
                          className="flex-1 py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-sm transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <Check className="w-3.5 h-3.5" />
                          <span>{isSubmittingPriority ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
                        </button>
                        <button
                          type="button"
                          onClick={handleCancelEditPriority}
                          disabled={isSubmittingPriority}
                          className="py-2 px-3 bg-white hover:bg-slate-50 border border-slate-300 text-slate-700 font-semibold rounded-sm transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                          <span>Hủy</span>
                        </button>
                      </>
                    ) : (
                      <button
                        type="submit"
                        disabled={isSubmittingPriority || !priorityOnb || !priorityModule}
                        className="w-full py-2 px-3 bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 text-white font-semibold rounded-sm transition-colors flex items-center justify-center gap-1.5 shadow-2xs cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>{isSubmittingPriority ? 'Đang thêm...' : 'Thêm đăng ký'}</span>
                      </button>
                    )}
                  </div>
                </div>
              </form>
            )}

            {/* List of Registered Priorities */}
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-100/70 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                    <th className="py-2.5 px-3">Tháng/Năm</th>
                    <th className="py-2.5 px-3">Nhân sự</th>
                    <th className="py-2.5 px-3">Nhóm</th>
                    <th className="py-2.5 px-3">Module đăng ký</th>
                    <th className="py-2.5 px-3 text-center">Tối đa buổi</th>
                    <th className="py-2.5 px-3 text-center">Thứ tự ưu tiên</th>
                    <th className="py-2.5 px-3">Ghi chú</th>
                    {canManage && <th className="py-2.5 px-3 text-right w-20">Thao tác</th>}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {priorities.map(pr => {
                    const mem = members.find(m => m.code === pr.onbCode);
                    const mod = trainingModules.find(m => m.code === pr.moduleCode);
                    const isBeingEdited = editingPriority?.id === pr.id;
                    return (
                      <tr
                        key={pr.id}
                        className={`transition-colors ${
                          isBeingEdited ? 'bg-blue-50/60 font-medium' : 'hover:bg-slate-50/50'
                        }`}
                      >
                        <td className="py-2.5 px-3 font-mono text-slate-600">{pr.monthYear}</td>
                        <td className="py-2.5 px-3 font-medium text-slate-900">
                          {mem?.fullName || pr.onbCode} <span className="text-slate-400 font-mono text-[11px]">({pr.onbCode})</span>
                        </td>
                        <td className="py-2.5 px-3 text-slate-600 font-medium">{mem?.currentGroup || '—'}</td>
                        <td className="py-2.5 px-3 font-semibold text-blue-700">
                          <span className="bg-blue-50 px-2 py-0.5 rounded-xs border border-blue-200">
                            {pr.moduleCode} - {mod?.name || pr.moduleCode}
                          </span>
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono">
                          {pr.maxSessions ? `${pr.maxSessions} buổi` : 'Không giới hạn'}
                        </td>
                        <td className="py-2.5 px-3 text-center font-mono font-semibold text-slate-700">
                          {pr.order || 1}
                        </td>
                        <td className="py-2.5 px-3 text-slate-500">{pr.notes || '—'}</td>
                        {canManage && (
                          <td className="py-2.5 px-3 text-right">
                            <div className="flex items-center justify-end gap-1">
                              <button
                                onClick={() => handleOpenEditPriority(pr)}
                                className={`p-1 transition-colors cursor-pointer rounded-xs ${
                                  isBeingEdited
                                    ? 'text-blue-700 bg-blue-100 ring-1 ring-blue-400'
                                    : 'text-slate-400 hover:text-blue-600 hover:bg-slate-100'
                                }`}
                                title="Sửa đăng ký này"
                              >
                                <Edit2 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeletePriority(pr)}
                                className="p-1 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-xs transition-colors cursor-pointer"
                                title="Xóa đăng ký này"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </td>
                        )}
                      </tr>
                    );
                  })}
                  {priorities.length === 0 && (
                    <tr>
                      <td colSpan={canManage ? 8 : 7} className="py-8 text-center text-slate-400">
                        <p>Chưa có nhân sự nào đăng ký ưu tiên nhận lớp trong tháng {monthYear}.</p>
                        {canManage && (
                          <p className="mt-1 text-xs text-slate-500">
                            Bạn có thể thêm đăng ký ở biểu mẫu phía trên.
                          </p>
                        )}
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>

            {/* In-App Delete Confirmation Modal for Priority */}
            {deletingPriorityItem && (
              <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-2xs p-4 animate-in fade-in duration-150">
                <div className="bg-white rounded-lg shadow-xl border border-slate-200 max-w-md w-full overflow-hidden">
                  <div className="flex items-center justify-between px-5 py-3.5 border-b border-slate-100 bg-rose-50/60">
                    <div className="flex items-center gap-2 text-rose-700 font-bold text-sm">
                      <Trash2 className="w-4 h-4 text-rose-600" />
                      <span>Xác nhận xóa đăng ký ưu tiên</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => !isDeletingPriority && setDeletingPriorityItem(null)}
                      disabled={isDeletingPriority}
                      className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="p-5 space-y-3 text-xs">
                    <p className="text-slate-700 leading-relaxed">
                      Bạn có chắc chắn muốn xóa bản ghi đăng ký ưu tiên nhận lớp sau đây không?
                    </p>

                    <div className="bg-slate-50 border border-slate-200 rounded-md p-3.5 space-y-2">
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Tháng/Năm:</span>
                        <span className="font-semibold text-slate-800 font-mono">{deletingPriorityItem.monthYear}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Nhân sự:</span>
                        <span className="font-semibold text-slate-800">
                          {members.find(m => m.code === deletingPriorityItem.onbCode)?.fullName || deletingPriorityItem.onbCode} ({deletingPriorityItem.onbCode})
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Nhóm:</span>
                        <span className="font-medium text-slate-700">
                          {members.find(m => m.code === deletingPriorityItem.onbCode)?.currentGroup || '—'}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Module đăng ký:</span>
                        <span className="font-semibold text-blue-700">
                          {deletingPriorityItem.moduleCode} - {trainingModules.find(m => m.code === deletingPriorityItem.moduleCode)?.name || deletingPriorityItem.moduleCode}
                        </span>
                      </div>
                      {deletingPriorityItem.maxSessions && (
                        <div className="flex justify-between">
                          <span className="text-slate-500 font-medium">Tối đa:</span>
                          <span className="font-medium text-slate-700 font-mono">{deletingPriorityItem.maxSessions} buổi/tháng</span>
                        </div>
                      )}
                      <div className="flex justify-between">
                        <span className="text-slate-500 font-medium">Thứ tự ưu tiên:</span>
                        <span className="font-bold text-slate-800 font-mono">{deletingPriorityItem.order || 1}</span>
                      </div>
                    </div>

                    <div className="p-2.5 bg-amber-50/80 border border-amber-200 rounded-sm text-amber-900 text-[11px] leading-relaxed">
                      <strong>Lưu ý:</strong> Xóa đăng ký ưu tiên chỉ bỏ quyền ưu tiên nhận lớp của đăng ký đó, không loại nhân sự khỏi danh sách tham gia phân bổ và không tự động xóa kết quả phân bổ đã có.
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 px-5 py-3.5 border-t border-slate-100 bg-slate-50/50">
                    <button
                      type="button"
                      onClick={() => setDeletingPriorityItem(null)}
                      disabled={isDeletingPriority}
                      className="px-3.5 py-1.5 border border-slate-300 rounded-md bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs transition-colors cursor-pointer"
                    >
                      Hủy
                    </button>
                    <button
                      type="button"
                      onClick={handleConfirmDeletePriority}
                      disabled={isDeletingPriority}
                      className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 text-white font-semibold text-xs rounded-md transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>{isDeletingPriority ? 'Đang xóa...' : 'Xác nhận xóa'}</span>
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. SUBTAB: HISTORY_LOOKUP (Xem lại lịch phân bổ và lịch làm việc của từng người ở các tháng trước) */}
      {activeSubTab === 'HISTORY_LOOKUP' && (
        <div className="space-y-4">
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <History className="w-4 h-4 text-indigo-600" />
                  Tra cứu lịch sử phân bổ & lịch làm việc của nhân sự
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Xem lại và đối chiếu danh sách lớp đào tạo tập trung đã được phân bổ và toàn bộ lịch làm việc thực tế của từng nhân sự ở các tháng trước.
                </p>
              </div>

              {/* Selector Controls */}
              <div className="flex flex-wrap items-center gap-3">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">Kỳ tra cứu:</span>
                  <input
                    type="month"
                    value={lookupMonth}
                    onChange={e => e.target.value && setLookupMonth(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1 text-xs font-mono font-semibold bg-white text-slate-800 shadow-2xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  />
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">Nhân sự:</span>
                  <select
                    value={lookupOnb}
                    onChange={e => setLookupOnb(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1 text-xs font-medium bg-white text-slate-800 shadow-2xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    {members.map(m => (
                      <option key={m.code} value={m.code}>
                        {m.fullName} ({m.code} - {m.currentGroup})
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">Module:</span>
                  <select
                    value={lookupModuleCode}
                    onChange={e => setLookupModuleCode(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1 text-xs font-medium bg-white text-slate-800 shadow-2xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    <option value="">-- Tất cả module --</option>
                    {trainingModules.map(m => (
                      <option key={m.code} value={m.code}>
                        {m.code}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center gap-2">
                  <span className="text-xs font-semibold text-slate-700">Trạng thái:</span>
                  <select
                    value={lookupStatus}
                    onChange={e => setLookupStatus(e.target.value)}
                    className="border border-slate-300 rounded-md px-2 py-1 text-xs font-medium bg-white text-slate-800 shadow-2xs focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                  >
                    <option value="">-- Tất cả trạng thái --</option>
                    <option value="FILLED">Đã điền lịch</option>
                    <option value="UNFILLED">Chưa điền lịch</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Summary Metrics Cards */}
            {(() => {
              const selectedMemberObj = members.find(m => m.code === lookupOnb);
              const totalAllocatedScore = lookupPackages.reduce((acc, p) => acc + (Number(p.allocationPoints) || 0), 0);
              const dtttSchedulesCount = lookupSchedules.filter(s => s.workTypeCode === 'DTTT' || (s.workFormName && s.workFormName.toLowerCase().includes('đào tạo'))).length;

              return (
                <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                  <div className="p-3 bg-slate-50 rounded-lg border border-slate-200">
                    <div className="text-[11px] text-slate-500">Nhân sự tra cứu</div>
                    <div className="text-sm font-bold text-slate-900 mt-0.5">
                      {selectedMemberObj?.fullName || lookupOnb}
                    </div>
                    <div className="text-[11px] text-slate-500">
                      Mã: {lookupOnb} · Nhóm: {selectedMemberObj?.currentGroup || '—'}
                    </div>
                  </div>

                  <div className="p-3 bg-blue-50 rounded-lg border border-blue-200">
                    <div className="text-[11px] text-blue-700 font-medium">Lớp ĐTTT được giao ({lookupMonth})</div>
                    <div className="text-xl font-bold text-blue-900 mt-0.5 font-mono-numbers">
                      {lookupPackages.length} <span className="text-xs font-normal text-blue-600">lớp</span>
                    </div>
                    <div className="text-[11px] text-blue-600">
                      Đã điền lịch: {lookupPackages.filter(p => p.scheduleStatus === 'Đã điền lịch').length} lớp
                    </div>
                  </div>

                  <div className="p-3 bg-indigo-50 rounded-lg border border-indigo-200">
                    <div className="text-[11px] text-indigo-700 font-medium">Tổng điểm phân bổ ĐTTT</div>
                    <div className="text-xl font-bold text-indigo-900 mt-0.5 font-mono-numbers">
                      {Math.round(totalAllocatedScore * 100) / 100} <span className="text-xs font-normal text-indigo-600">điểm</span>
                    </div>
                    <div className="text-[11px] text-indigo-600">
                      Điểm đào tạo tập trung theo phân bổ
                    </div>
                  </div>

                  <div className="p-3 bg-emerald-50 rounded-lg border border-emerald-200">
                    <div className="text-[11px] text-emerald-700 font-medium">Lịch công việc thực tế</div>
                    <div className="text-xl font-bold text-emerald-900 mt-0.5 font-mono-numbers">
                      {lookupSchedules.length} <span className="text-xs font-normal text-emerald-600">buổi</span>
                    </div>
                    <div className="text-[11px] text-emerald-600">
                      Trong đó ĐTTT: {dtttSchedulesCount} buổi · Khác: {lookupSchedules.length - dtttSchedulesCount} buổi
                    </div>
                  </div>
                </div>
              );
            })()}

            {/* Split Comparison Tables: Lớp ĐTTT phân bổ vs Lịch công việc thực tế */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 pt-2">
              {/* Left Column: Lớp ĐTTT đã phân bổ */}
              <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col">
                <div className="p-3 bg-blue-50/60 border-b border-blue-100 flex items-center justify-between">
                  <h4 className="font-bold text-blue-950 text-xs flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    Lớp đào tạo tập trung được phân bổ ({lookupPackages.length} lớp)
                  </h4>
                  <span className="text-[11px] text-blue-700 font-mono">Kỳ: {lookupMonth}</span>
                </div>

                <div className="overflow-x-auto flex-1 max-h-96">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                        <th className="py-2 px-2.5">Mã lớp</th>
                        <th className="py-2 px-2.5">Module</th>
                        <th className="py-2 px-2.5">Thời gian</th>
                        <th className="py-2 px-2.5">Ngày</th>
                        <th className="py-2 px-2.5 text-right">Điểm</th>
                        <th className="py-2 px-2.5 text-center">Trạng thái lịch</th>
                        <th className="py-2 px-2.5 text-right">Xem lịch</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lookupPackages.map(pkg => (
                        <tr key={pkg.id} className="hover:bg-slate-50/60">
                          <td className="py-2 px-2.5 font-mono font-medium text-slate-800">{pkg.packageCode}</td>
                          <td className="py-2 px-2.5 font-semibold text-blue-700">{pkg.productCode}</td>
                          <td className="py-2 px-2.5">
                            <span className={`px-1.5 py-0.5 rounded-xs text-[10px] font-semibold ${
                              pkg.sessionOfDay === 'Sáng' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {pkg.sessionOfDay}
                            </span>
                          </td>
                          <td className="py-2 px-2.5 font-mono">{formatDayMonth(pkg.scheduledDate)}</td>
                          <td className="py-2 px-2.5 text-right font-mono font-semibold">{pkg.allocationPoints}đ</td>
                          <td className="py-2 px-2.5 text-center">
                            {pkg.scheduleStatus === 'Đã điền lịch' ? (
                              <span className="text-emerald-700 font-semibold text-[11px]">Đã điền</span>
                            ) : (
                              <span className="text-slate-400 text-[11px]">{pkg.scheduleStatus || 'Chưa điền'}</span>
                            )}
                          </td>
                          <td className="py-2 px-2.5 text-right">
                            {onNavigateToSchedule && (
                              <button
                                onClick={() => onNavigateToSchedule(lookupOnb, pkg.scheduledDate)}
                                className="text-blue-600 hover:text-blue-800 inline-flex items-center gap-1 font-medium cursor-pointer text-[11px]"
                                title="Xem trực tiếp trên Lịch công việc"
                              >
                                <ExternalLink className="w-3 h-3" />
                                <span>Xem</span>
                              </button>
                            )}
                          </td>
                        </tr>
                      ))}
                      {lookupPackages.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-8 text-center text-slate-400">
                            Không có lớp đào tạo tập trung nào được phân bổ cho nhân sự này trong tháng {lookupMonth}.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Right Column: Lịch công việc thực tế của nhân sự */}
              <div className="border border-slate-200 rounded-lg overflow-hidden flex flex-col">
                <div className="p-3 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between">
                  <h4 className="font-bold text-emerald-950 text-xs flex items-center gap-1.5">
                    <UserCheck className="w-3.5 h-3.5 text-emerald-600" />
                    Lịch công việc thực tế của nhân sự ({lookupSchedules.length} buổi)
                  </h4>
                  <span className="text-[11px] text-emerald-700 font-mono">Kỳ: {lookupMonth}</span>
                </div>

                <div className="overflow-x-auto flex-1 max-h-96">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                        <th className="py-2 px-2.5">Ngày</th>
                        <th className="py-2 px-2.5">Buổi</th>
                        <th className="py-2 px-2.5">Hình thức việc</th>
                        <th className="py-2 px-2.5">Nội dung công việc / Khách hàng</th>
                        <th className="py-2 px-2.5 text-center">Trạng thái</th>
                        <th className="py-2 px-2.5 text-right">Xem</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {lookupSchedules.map(sch => {
                        const isDttt = sch.workTypeCode === 'DTTT' || (sch.workFormName && sch.workFormName.toLowerCase().includes('đào tạo'));
                        return (
                          <tr key={sch.id} className={`hover:bg-slate-50/60 ${isDttt ? 'bg-blue-50/20' : ''}`}>
                            <td className="py-2 px-2.5 font-mono font-medium">{formatDayMonth(sch.date)}</td>
                            <td className="py-2 px-2.5">
                              <span className={`px-1.5 py-0.5 rounded-xs text-[10px] font-semibold ${
                                sch.sessionOfDay === 'Sáng' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                              }`}>
                                {sch.sessionOfDay || 'Cả ngày'}
                              </span>
                            </td>
                            <td className="py-2 px-2.5 font-medium">
                              <span className={`px-1.5 py-0.5 rounded-xs text-[10px] ${
                                isDttt ? 'bg-blue-100 text-blue-800 font-bold' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {sch.workFormName || sch.workTypeCode}
                              </span>
                            </td>
                            <td className="py-2 px-2.5 truncate max-w-[200px]" title={sch.customerOrTask}>
                              {sch.customerOrTask}
                            </td>
                            <td className="py-2 px-2.5 text-center">
                              <span className="text-[11px] text-slate-600">{sch.status || 'Kế hoạch'}</span>
                            </td>
                            <td className="py-2 px-2.5 text-right">
                              {onNavigateToSchedule && (
                                <button
                                  onClick={() => onNavigateToSchedule(sch.onbCode, sch.date)}
                                  className="text-emerald-700 hover:text-emerald-900 inline-flex items-center gap-1 font-medium cursor-pointer text-[11px]"
                                  title="Chuyển tới ô lịch này trên Lịch công việc"
                                >
                                  <ExternalLink className="w-3 h-3" />
                                  <span>Xem</span>
                                </button>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                      {lookupSchedules.length === 0 && (
                        <tr>
                          <td colSpan={6} className="py-8 text-center text-slate-400">
                            Không có lịch làm việc nào được ghi nhận cho nhân sự này trong tháng {lookupMonth}.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. Add / Edit Class Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                {editingPackage ? `Sửa lớp đào tạo ${editingPackage.packageCode}` : 'Thêm lớp đào tạo tập trung trong tháng'}
              </h3>
              <button onClick={() => setIsAddModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveClass} className="p-5 space-y-4 text-xs">
              {formError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 font-medium">
                  {formError}
                </div>
              )}

              {/* Module selection */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Module đào tạo (Lấy từ Thiết lập hệ thống) <span className="text-rose-500">*</span>
                </label>
                <select
                  value={formModuleCode}
                  onChange={e => handleModuleChangeInForm(e.target.value)}
                  className="w-full border border-slate-300 rounded-sm p-2 bg-white text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                  required
                >
                  {activeModules.map(m => (
                    <option key={m.code} value={m.code}>
                      {m.code} - {m.name} {m.defaultSession ? `(Mặc định: ${m.defaultSession})` : ''}
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-slate-500 mt-1 block">
                  Chọn module sẽ tự động điền buổi mặc định và tham chiếu bảng điểm tại Thiết lập hệ thống.
                </span>
              </div>

              {/* Session and Date */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Buổi học <span className="text-rose-500">*</span>
                  </label>
                  <select
                    value={formSession}
                    onChange={e => setFormSession(e.target.value as SessionOfDay)}
                    className="w-full border border-slate-300 rounded-sm p-2 bg-white text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                    required
                  >
                    <option value="Sáng">Sáng</option>
                    <option value="Chiều">Chiều</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Ngày diễn ra <span className="text-rose-500">*</span>
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={e => setFormDate(e.target.value)}
                    className="w-full border border-slate-300 rounded-sm p-2 bg-white text-xs font-mono focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                    required
                  />
                  <span className="text-[11px] text-slate-500 mt-1 block">
                    Phải thuộc tháng {monthYear}
                  </span>
                </div>
              </div>

              {/* Assigned Member (Optional prior to simulation) */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nhân sự được giao
                </label>
                <select
                  value={formAssignedOnb}
                  onChange={e => setFormAssignedOnb(e.target.value)}
                  className="w-full border border-slate-300 rounded-sm p-2 bg-white text-xs font-medium focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                >
                  {(!editingPackage?.scheduleId || editingPackage?.scheduleStatus !== 'Đã điền lịch') && (
                    <option value="">-- Chưa giao (Để thuật toán phân bổ) --</option>
                  )}
                  {activeMembers.map(m => (
                    <option key={m.code} value={m.code}>
                      {m.fullName} ({m.code} - {m.currentGroup})
                    </option>
                  ))}
                </select>
                {editingPackage?.scheduleId && editingPackage?.scheduleStatus === 'Đã điền lịch' && (
                  <span className="text-[11px] text-amber-700 mt-1 block font-medium">
                    Lưu ý: Lớp đã có lịch liên kết. Thay đổi nhân sự tại đây sẽ tự động chuyển lịch sang người mới trên Lịch công việc.
                  </span>
                )}
              </div>

              {/* User Notes */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Ghi chú người dùng
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú nội dung ôn luyện, phòng học..."
                  value={formUserNotes}
                  onChange={e => setFormUserNotes(e.target.value)}
                  className="w-full border border-slate-300 rounded-sm p-2 bg-white text-xs focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                />
              </div>

              <div className="flex items-center justify-end gap-2.5 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-100 rounded-md transition-colors"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-md transition-colors shadow-2xs"
                >
                  {editingPackage ? 'Cập nhật lớp' : 'Lưu lớp mới'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 6. Confirmation & Reconciliation Report Modal (Báo cáo kết quả sau khi điền lịch) */}
      {reportModalData && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-2xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            {/* Modal Header */}
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600" />
                  Báo cáo kết quả điền Lịch công việc ({reportModalData.monthYear || monthYear})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Kết quả đối soát chi tiết: Không ghi đè lịch đã có, bảo vệ tính toàn vẹn dữ liệu cá nhân.
                </p>
              </div>
              <button onClick={() => setReportModalData(null)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-5 space-y-4 overflow-y-auto text-xs">
              {/* Summary Stats Cards */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
                <div className="p-3 bg-slate-50 rounded-md border border-slate-200 text-center">
                  <div className="text-lg font-bold text-slate-900 font-mono-numbers">
                    {reportModalData.totalProcessed || reportModalData.failedClasses?.length || 0}
                  </div>
                  <div className="text-[11px] text-slate-500 mt-0.5">Tổng xử lý</div>
                </div>

                <div className="p-3 bg-emerald-50 rounded-md border border-emerald-200 text-center">
                  <div className="text-lg font-bold text-emerald-700 font-mono-numbers">
                    {reportModalData.newSuccessCount || 0}
                  </div>
                  <div className="text-[11px] text-emerald-800 mt-0.5">Mới điền thành công</div>
                </div>

                <div className="p-3 bg-blue-50 rounded-md border border-blue-200 text-center">
                  <div className="text-lg font-bold text-blue-700 font-mono-numbers">
                    {reportModalData.skippedCount || 0}
                  </div>
                  <div className="text-[11px] text-blue-800 mt-0.5">Đã điền từ trước</div>
                </div>

                <div className="p-3 bg-rose-50 rounded-md border border-rose-200 text-center">
                  <div className="text-lg font-bold text-rose-700 font-mono-numbers">
                    {reportModalData.failedCount || reportModalData.failedClasses?.length || 0}
                  </div>
                  <div className="text-[11px] text-rose-800 mt-0.5">Không thành công</div>
                </div>

                <div className="p-3 bg-indigo-50 rounded-md border border-indigo-200 text-center">
                  <div className="text-lg font-bold text-indigo-700 font-mono-numbers">
                    {reportModalData.uniqueMembersCount || 0}
                  </div>
                  <div className="text-[11px] text-indigo-800 mt-0.5">Nhân sự liên quan</div>
                </div>
              </div>

              {/* Success Notice */}
              {reportModalData.newSuccessCount > 0 && (
                <div className="p-3 bg-emerald-50/80 border border-emerald-200 rounded-md text-emerald-900 text-xs flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>
                    Đã điền thành công <strong>{reportModalData.newSuccessCount}</strong> lớp vào Lịch công việc với hình thức <strong>Đào tạo tập trung (DTTT)</strong>.
                  </span>
                </div>
              )}

              {/* Failed Classes Table & In-place Reassignment */}
              {reportModalData.failedClasses && reportModalData.failedClasses.length > 0 ? (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-rose-900 flex items-center gap-1.5 text-xs">
                      <AlertTriangle className="w-4 h-4 text-rose-600" />
                      Danh sách các lớp chưa điền được ({reportModalData.failedClasses.length} lớp):
                    </h4>
                    <span className="text-[11px] text-slate-500">
                      Bạn có thể chọn người nhận khác ngay tại bảng và bấm "Điền lại"
                    </span>
                  </div>

                  <div className="border border-rose-200 rounded-md overflow-hidden">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-rose-50/60 border-b border-rose-200 text-rose-900 font-semibold text-[11px]">
                          <th className="py-2.5 px-3">Lớp / Module</th>
                          <th className="py-2.5 px-3">Thời gian</th>
                          <th className="py-2.5 px-3">Ngày</th>
                          <th className="py-2.5 px-3 min-w-[160px]">Đổi nhân sự nhận</th>
                          <th className="py-2.5 px-3 min-w-[200px]">Lý do & Lịch đang có</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100 bg-white">
                        {reportModalData.failedClasses.map((item: any, idx: number) => {
                          const conflictInfo = item.conflictingSchedule;

                          return (
                            <tr key={item.id} className="hover:bg-rose-50/30">
                              <td className="py-2.5 px-3 font-medium text-slate-900 whitespace-nowrap">
                                <div>{item.packageCode}</div>
                                <div className="text-[11px] text-blue-700 font-semibold">{item.moduleName || item.productCode}</div>
                              </td>

                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <span className={`px-2 py-0.5 rounded-xs text-[10px] font-semibold ${
                                  item.sessionOfDay === 'Sáng' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                                }`}>
                                  {item.sessionOfDay}
                                </span>
                              </td>

                              <td className="py-2.5 px-3 font-mono whitespace-nowrap">
                                {formatDayMonth(item.scheduledDate)}
                              </td>

                              <td className="py-2.5 px-3 whitespace-nowrap">
                                <select
                                  value={item.assignedOnbCode || ''}
                                  onChange={e => {
                                    const nextFailed = [...reportModalData.failedClasses];
                                    nextFailed[idx] = {
                                      ...nextFailed[idx],
                                      assignedOnbCode: e.target.value
                                    };
                                    setReportModalData({
                                      ...reportModalData,
                                      failedClasses: nextFailed
                                    });
                                  }}
                                  className="border border-slate-300 rounded-sm p-1 text-xs bg-white text-slate-900 font-medium focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                                >
                                  {participatingMembers.map(m => (
                                    <option key={m.code} value={m.code}>
                                      {m.fullName} ({m.code} - {m.currentGroup})
                                    </option>
                                  ))}
                                </select>
                              </td>

                              <td className="py-2.5 px-3 text-rose-700 text-[11px]">
                                <div className="font-semibold">
                                  {item.reason}
                                </div>
                                {conflictInfo && (
                                  <div className="mt-1 bg-slate-50 p-1.5 rounded-xs border border-slate-200 text-slate-700 text-[11px] flex items-center justify-between gap-2">
                                    <span>
                                      Lịch đang có: <strong>{conflictInfo.workFormName}</strong> — {conflictInfo.customerOrTask}
                                    </span>
                                    {onNavigateToSchedule && (
                                      <button
                                        onClick={() => {
                                          setReportModalData(null);
                                          onNavigateToSchedule(item.assignedOnbCode, item.scheduledDate);
                                        }}
                                        className="text-blue-600 hover:text-blue-800 flex items-center gap-1 shrink-0 font-medium cursor-pointer"
                                        title="Xem chi tiết trên Lịch công việc"
                                      >
                                        <ExternalLink className="w-3 h-3" />
                                        <span>Xem lịch</span>
                                      </button>
                                    )}
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              ) : (
                <div className="p-4 bg-emerald-50 rounded-md border border-emerald-200 text-emerald-900 text-center font-medium">
                  Tất cả các lớp đã được điền vào Lịch công việc thành công, không có xung đột!
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 border-t border-slate-100 flex items-center justify-between bg-slate-50">
              <span className="text-[11px] text-slate-500">
                Lưu ý: Không thể ghi đè lịch cá nhân khi xung đột để đảm bảo lịch công việc của phòng.
              </span>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setReportModalData(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-md transition-colors"
                >
                  Đóng
                </button>

                {reportModalData.failedClasses && reportModalData.failedClasses.length > 0 && canManage && (
                  <button
                    type="button"
                    disabled={isRetrying}
                    onClick={() => {
                      const reassignments = reportModalData.failedClasses.map((fc: any) => ({
                        classId: fc.id,
                        assignedOnbCode: fc.assignedOnbCode
                      }));
                      handleRetryFailedClasses(reassignments);
                    }}
                    className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-md transition-colors flex items-center gap-1.5 shadow-2xs"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isRetrying ? 'animate-spin' : ''}`} />
                    <span>{isRetrying ? 'Đang điền lại...' : 'Điền lại các lớp chưa thành công'}</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 7. Copy In-Charge From Month Modal with Preview */}
      {isCopyModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-2xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Copy className="w-4 h-4 text-blue-600" />
                Sao chép danh sách người phụ trách module vào tháng {monthYear}
              </h3>
              <button onClick={() => setIsCopyModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 bg-slate-50 border border-slate-200 rounded-md">
                <label className="font-semibold text-slate-800 flex items-center gap-2">
                  <Calendar className="w-4 h-4 text-slate-500" />
                  Chọn tháng nguồn để sao chép:
                </label>
                <div className="flex items-center gap-2">
                  <input
                    type="month"
                    value={sourceMonthForCopy}
                    onChange={e => {
                      setSourceMonthForCopy(e.target.value);
                      loadCopyPreview(e.target.value);
                    }}
                    className="border border-slate-300 rounded-md px-2.5 py-1 text-xs font-mono font-semibold bg-white text-slate-800 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                  />
                  <button
                    type="button"
                    onClick={() => loadCopyPreview(sourceMonthForCopy)}
                    className="p-1 text-slate-500 hover:text-blue-600 cursor-pointer"
                    title="Tải lại danh sách"
                  >
                    <RefreshCw className={`w-3.5 h-3.5 ${isLoadingCopyPreview ? 'animate-spin' : ''}`} />
                  </button>
                </div>
              </div>

              {/* Business Rules Callout */}
              <div className="p-3 bg-amber-50/80 border border-amber-200 rounded-md text-[11px] text-amber-950 space-y-1">
                <div className="font-bold flex items-center gap-1.5 text-amber-900">
                  <Info className="w-3.5 h-3.5 text-amber-700 shrink-0" />
                  Nguyên tắc sao chép danh sách người phụ trách:
                </div>
                <ul className="list-disc pl-5 space-y-0.5 text-amber-900">
                  <li>Chỉ sao chép danh sách người phụ trách và thông tin ưu tiên được chọn.</li>
                  <li><strong>Không sao chép kết quả phân bổ hoặc lịch đã điền</strong>.</li>
                  <li>Sau khi sao chép, hai tháng hoàn toàn độc lập; chỉnh sửa tháng này không làm thay đổi tháng kia.</li>
                </ul>
              </div>

              {/* Preview Table */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="font-semibold text-slate-800">
                    Xem trước danh sách tháng nguồn ({sourceMonthForCopy}): {copyPreviewList.length} nhân sự
                  </span>
                </div>

                {isLoadingCopyPreview ? (
                  <div className="p-8 text-center text-slate-400">Đang tải danh sách người phụ trách...</div>
                ) : copyPreviewList.length > 0 ? (
                  <div className="border border-slate-200 rounded-md overflow-hidden max-h-60 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                          <th className="py-2 px-3">Module</th>
                          <th className="py-2 px-3">Nhân sự</th>
                          <th className="py-2 px-3">Nhóm</th>
                          <th className="py-2 px-3 text-center">Ưu tiên</th>
                          <th className="py-2 px-3 text-center">Max buổi</th>
                          <th className="py-2 px-3">Ghi chú</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {copyPreviewList.map((ic, i) => {
                          const mem = members.find(m => m.code === ic.onbCode);
                          return (
                            <tr key={ic.id || i} className="hover:bg-slate-50">
                              <td className="py-2 px-3 font-semibold text-blue-700">{ic.moduleCode}</td>
                              <td className="py-2 px-3 text-slate-900">
                                {mem?.fullName || ic.onbCode} <span className="text-slate-400 font-mono text-[11px]">({ic.onbCode})</span>
                              </td>
                              <td className="py-2 px-3 text-slate-600">{ic.assignedGroup || mem?.currentGroup || '—'}</td>
                              <td className="py-2 px-3 text-center">
                                {ic.isPriority ? (
                                  <span className="px-1.5 py-0.5 rounded-xs text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200">
                                    Ưu tiên
                                  </span>
                                ) : (
                                  <span className="text-slate-400">—</span>
                                )}
                              </td>
                              <td className="py-2 px-3 text-center font-mono">{ic.maxSessions ? `${ic.maxSessions} buổi` : '—'}</td>
                              <td className="py-2 px-3 text-slate-500 truncate max-w-[120px]">{ic.notes || '—'}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-6 bg-slate-50 border border-slate-200 rounded-md text-center text-slate-400">
                    Tháng {sourceMonthForCopy} chưa có người phụ trách module nào được khai báo.
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setIsCopyModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isCopyingInCharge || copyPreviewList.length === 0}
                onClick={handleConfirmCopyInCharge}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-md transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Copy className="w-3.5 h-3.5" />
                <span>{isCopyingInCharge ? 'Đang sao chép...' : `Xác nhận sao chép (${copyPreviewList.length} người)`}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 8. Generate Classes from Core Modal with Live Preview & Exclusion Handling */}
      {isGenerateCoreModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-3xl w-full max-h-[90vh] flex flex-col overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                  <Layers className="w-4 h-4 text-blue-600" />
                  Tạo danh sách lớp từ lịch mẫu định kỳ Thiết lập hệ thống (Tháng {monthYear})
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Tự động quét các ngày trong tháng khớp với các thứ và buổi quy định trong Thiết lập hệ thống để sinh các lớp đào tạo.
                </p>
              </div>
              <button onClick={() => setIsGenerateCoreModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs overflow-y-auto">
              {/* Select Templates */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-800">
                    Chọn các lịch mẫu định kỳ áp dụng trong tháng {monthYear}:
                  </label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const activeIds = recurringSchedules.filter(s => s.isActive).map(s => s.id);
                        setSelectedScheduleIdsForGen(activeIds);
                        fetchGeneratePreview(activeIds);
                      }}
                      className="text-blue-600 hover:underline text-[11px] cursor-pointer"
                    >
                      Chọn tất cả
                    </button>
                    <span>·</span>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedScheduleIdsForGen([]);
                        fetchGeneratePreview([]);
                      }}
                      className="text-slate-500 hover:underline text-[11px] cursor-pointer"
                    >
                      Bỏ chọn tất cả
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-48 overflow-y-auto border border-slate-200 p-2.5 rounded-md bg-slate-50/50">
                  {recurringSchedules.filter(s => s.isActive).map(s => {
                    const isChecked = selectedScheduleIdsForGen.includes(s.id);
                    const daysText = s.daysOfWeek.map(d => (d === 8 ? 'CN' : `T${d}`)).join(', ');
                    return (
                      <label
                        key={s.id}
                        className={`flex items-start gap-2.5 p-2 rounded-md border text-xs cursor-pointer transition-colors ${
                          isChecked ? 'bg-blue-50/60 border-blue-200 text-blue-950' : 'bg-white border-slate-200 text-slate-700'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={isChecked}
                          onChange={e => {
                            const next = e.target.checked
                              ? [...selectedScheduleIdsForGen, s.id]
                              : selectedScheduleIdsForGen.filter(id => id !== s.id);
                            setSelectedScheduleIdsForGen(next);
                            fetchGeneratePreview(next);
                          }}
                          className="mt-0.5 rounded-xs border-slate-300 text-blue-600 focus:ring-blue-500"
                        />
                        <div className="flex-1 min-w-0">
                          <div className="font-bold flex items-center justify-between gap-1">
                            <span className="text-blue-700">{s.moduleCode}</span>
                            <span className={`px-1.5 py-0.2 rounded-xs text-[10px] ${
                              s.sessionOfDay === 'Sáng' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {s.sessionOfDay}
                            </span>
                          </div>
                          <div className="truncate text-slate-800 font-medium">{s.contentTitle}</div>
                          <div className="text-[10px] text-slate-500 mt-0.5">Các thứ: {daysText}</div>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Exclusion option checkbox */}
              <div className="flex items-center justify-between p-3 bg-slate-50 border border-slate-200 rounded-md">
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-800">
                  <input
                    type="checkbox"
                    checked={ignoreCancelledInGen}
                    onChange={e => setIgnoreCancelledInGen(e.target.checked)}
                    className="rounded-xs border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Khôi phục và tạo lại cả các lớp từng bị xóa/loại trừ trước đó</span>
                </label>
                <span className="text-[11px] text-slate-500">Mặc định: Tôn trọng ngoại lệ đã xóa</span>
              </div>

              {/* Live Preview Summary Cards */}
              {generatePreviewSummary && (
                <div className="grid grid-cols-3 gap-3">
                  <div className="p-2.5 bg-emerald-50 border border-emerald-200 rounded-md text-center">
                    <div className="text-base font-bold text-emerald-800 font-mono-numbers">
                      {generatePreviewSummary.newCount}
                    </div>
                    <div className="text-[11px] text-emerald-700">Lớp mới sẽ tạo</div>
                  </div>
                  <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md text-center">
                    <div className="text-base font-bold text-slate-700 font-mono-numbers">
                      {generatePreviewSummary.existingCount}
                    </div>
                    <div className="text-[11px] text-slate-600">Đã tồn tại (Bỏ qua)</div>
                  </div>
                  <div className="p-2.5 bg-amber-50 border border-amber-200 rounded-md text-center">
                    <div className="text-base font-bold text-amber-800 font-mono-numbers">
                      {generatePreviewSummary.cancelledCount}
                    </div>
                    <div className="text-[11px] text-amber-700">Ngoại lệ từng xóa</div>
                  </div>
                </div>
              )}

              {/* Live Preview Occurrence Table */}
              <div>
                <div className="font-semibold text-slate-800 mb-1.5 flex items-center justify-between">
                  <span>Chi tiết các buổi dự kiến ({generatePreviewItems.length} buổi):</span>
                  {isLoadingGeneratePreview && <span className="text-slate-400 text-[11px]">Đang cập nhật preview...</span>}
                </div>

                <div className="border border-slate-200 rounded-md overflow-hidden max-h-56 overflow-y-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                        <th className="py-2 px-2.5">Tuần</th>
                        <th className="py-2 px-2.5 text-center">Thứ</th>
                        <th className="py-2 px-2.5 text-center">Ngày</th>
                        <th className="py-2 px-2.5 text-center">Buổi</th>
                        <th className="py-2 px-2.5">Module</th>
                        <th className="py-2 px-2.5">Nội dung</th>
                        <th className="py-2 px-2.5 text-center">Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {generatePreviewItems.map((item, idx) => (
                        <tr key={item.occurrenceKey || idx} className="hover:bg-slate-50">
                          <td className="py-1.5 px-2.5 text-slate-600 font-medium text-[11px]">{item.weekLabel}</td>
                          <td className="py-1.5 px-2.5 text-center font-medium">{item.dayOfWeekName}</td>
                          <td className="py-1.5 px-2.5 text-center font-mono">{formatDayMonth(item.scheduledDate)}</td>
                          <td className="py-1.5 px-2.5 text-center">
                            <span className={`px-1.5 py-0.2 rounded-xs text-[10px] font-semibold ${
                              item.sessionOfDay === 'Sáng' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                            }`}>
                              {item.sessionOfDay}
                            </span>
                          </td>
                          <td className="py-1.5 px-2.5 font-bold text-blue-700">{item.productCode}</td>
                          <td className="py-1.5 px-2.5 text-slate-800 truncate max-w-[150px]">{item.contentTitle}</td>
                          <td className="py-1.5 px-2.5 text-center">
                            {item.status === 'NEW' ? (
                              <span className="px-1.5 py-0.2 rounded-xs text-[10px] font-bold text-emerald-800 bg-emerald-50 border border-emerald-200">
                                Mới
                              </span>
                            ) : item.status === 'EXISTS' ? (
                              <span className="px-1.5 py-0.2 rounded-xs text-[10px] text-slate-600 bg-slate-100">
                                Đã có
                              </span>
                            ) : (
                              <span className="px-1.5 py-0.2 rounded-xs text-[10px] font-bold text-amber-800 bg-amber-50 border border-amber-200">
                                Ngoại lệ
                              </span>
                            )}
                          </td>
                        </tr>
                      ))}
                      {generatePreviewItems.length === 0 && (
                        <tr>
                          <td colSpan={7} className="py-6 text-center text-slate-400">
                            Chưa chọn lịch mẫu nào hoặc không có ngày nào khớp trong tháng {monthYear}.
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Notice */}
              <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-md text-[11px] text-blue-900">
                <strong>Lưu ý:</strong> Sau khi tạo, các lớp sẽ ở trạng thái <em>"Chưa phân bổ"</em>. Chúng <strong>không tự động điền vào Lịch công việc</strong> và <strong>không tự ghi nhận KPI</strong>. Bạn có thể bấm <em>"Chạy phân bổ"</em> để thuật toán gán người phụ trách cân bằng điểm giữa các nhóm.
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50">
              <button
                type="button"
                onClick={() => setIsGenerateCoreModalOpen(false)}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isGeneratingFromCore || selectedScheduleIdsForGen.length === 0}
                onClick={handleGenerateClassesFromCore}
                className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 hover:bg-blue-700 disabled:bg-slate-300 rounded-md transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Layers className="w-3.5 h-3.5" />
                <span>
                  {isGeneratingFromCore
                    ? 'Đang tạo lớp...'
                    : `Xác nhận tạo lớp (${generatePreviewSummary?.newCount || 0} lớp mới)`}
                </span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 9. Delete Class Confirmation Modal */}
      {classToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-rose-50/70">
              <h3 className="text-sm font-bold text-rose-900 flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-600" />
                Xác nhận xóa lớp đào tạo
              </h3>
              <button
                type="button"
                onClick={() => {
                  setClassToDelete(null);
                  setDeleteError('');
                }}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3.5 text-xs">
              {deleteError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 font-medium">
                  {deleteError}
                </div>
              )}

              <p className="text-slate-600 leading-relaxed">
                Bạn có chắc chắn muốn xóa lớp đào tạo này khỏi danh sách? Thao tác này sẽ xóa dòng lớp đã chọn và cập nhật lại số liệu phân bổ.
              </p>

              {/* Chi tiết lớp được chọn */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Module / Lớp:</span>
                  <span className="font-bold text-blue-700 text-right">
                    {classToDelete.packageCode} — {classToDelete.contentTitle || classToDelete.title || classToDelete.moduleName || classToDelete.productCode}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Ngày diễn ra:</span>
                  <span className="font-mono font-semibold text-slate-800">
                    {classToDelete.scheduledDate} ({classToDelete.dayOfWeekName || (classToDelete.dayOfWeek === 8 ? 'Chủ nhật' : `Thứ ${classToDelete.dayOfWeek || ''}`)})
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">Buổi:</span>
                  <span className={`px-2 py-0.5 rounded-xs font-semibold text-[11px] ${
                    classToDelete.sessionOfDay === 'Sáng' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                  }`}>
                    {classToDelete.sessionOfDay}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-slate-500 font-medium">ONB được giao:</span>
                  <span className="font-semibold text-slate-900">
                    {classToDelete.assignedOnbCode ? (
                      (() => {
                        const m = members.find(mem => mem.code === classToDelete.assignedOnbCode);
                        return m ? `${m.fullName} (${m.code})` : classToDelete.assignedOnbCode;
                      })()
                    ) : (
                      <span className="text-slate-400 font-normal">Chưa giao</span>
                    )}
                  </span>
                </div>

                {/* Thông báo nếu lớp còn lịch liên kết */}
                {(() => {
                  const activeSch = (schedules || []).find(s =>
                    (s.id === classToDelete.scheduleId || s.sourceTrainingPackageId === classToDelete.id) &&
                    s.status !== 'Đã hủy' && s.status !== 'Hủy'
                  );
                  if (activeSch) {
                    return (
                      <div className="mt-2 pt-2 border-t border-slate-200 text-amber-900 bg-amber-50/80 p-2.5 rounded-xs flex items-start gap-1.5 leading-relaxed">
                        <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
                        <div>
                          <strong>Lưu ý:</strong> Lớp đang có lịch làm việc liên kết thực tế ({activeSch.date} - {activeSch.sessionOfDay || 'Sáng'} của {activeSch.onbCode}). Vui lòng xử lý lịch làm việc trước; hệ thống không tự ý xóa kèm lịch hoặc để lịch mất liên kết.
                        </div>
                      </div>
                    );
                  }
                  return null;
                })()}
              </div>
            </div>

            <div className="p-4 border-t border-slate-100 flex items-center justify-end gap-2.5 bg-slate-50">
              <button
                type="button"
                onClick={() => {
                  setClassToDelete(null);
                  setDeleteError('');
                }}
                disabled={isDeletingClass}
                className="px-3.5 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteClass}
                disabled={isDeletingClass}
                className="px-4 py-2 text-xs font-semibold text-white bg-rose-600 hover:bg-rose-700 disabled:bg-slate-300 rounded-md transition-colors shadow-2xs flex items-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>{isDeletingClass ? 'Đang xóa...' : 'Xóa lớp'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 10. Transfer History Modal */}
      {viewTransferHistoryPkg && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <ArrowLeftRight className="w-4 h-4 text-blue-600" />
                Lịch sử chuyển giao — {viewTransferHistoryPkg.packageCode}
              </h3>
              <button
                type="button"
                onClick={() => setViewTransferHistoryPkg(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs max-h-96 overflow-y-auto">
              <div className="text-slate-600 font-medium">
                Nội dung: <strong>{viewTransferHistoryPkg.contentTitle || viewTransferHistoryPkg.title || viewTransferHistoryPkg.productCode}</strong> ({viewTransferHistoryPkg.scheduledDate} - {viewTransferHistoryPkg.sessionOfDay})
              </div>

              {viewTransferHistoryPkg.transferHistory && viewTransferHistoryPkg.transferHistory.length > 0 ? (
                <div className="space-y-2.5">
                  {viewTransferHistoryPkg.transferHistory.map((log, idx) => (
                    <div key={log.id || idx} className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1">
                      <div className="flex items-center justify-between text-slate-500 text-[11px]">
                        <span>Lần chuyển #{idx + 1}</span>
                        <span>{new Date(log.transferredAt).toLocaleString('vi-VN')}</span>
                      </div>
                      <div className="flex items-center gap-2 font-semibold text-slate-900">
                        <span className="text-rose-700">{log.fromMemberName} ({log.fromOnbCode})</span>
                        <ArrowLeftRight className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-emerald-700">{log.toMemberName} ({log.toOnbCode})</span>
                      </div>
                      {log.reason && (
                        <div className="text-slate-600 text-[11px] pt-1 border-t border-slate-100">
                          Lý do: <em>{log.reason}</em>
                        </div>
                      )}
                      <div className="text-[10px] text-slate-400">
                        Người thực hiện: {log.performedByName} ({log.performedByOnbCode})
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="text-center py-6 text-slate-400">
                  Lớp này chưa có lịch sử điều chuyển người phụ trách.
                </div>
              )}
            </div>

            <div className="p-3.5 border-t border-slate-100 flex items-center justify-end bg-slate-50">
              <button
                type="button"
                onClick={() => setViewTransferHistoryPkg(null)}
                className="px-3.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-md transition-colors cursor-pointer"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
