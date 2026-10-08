import React, { useState, useMemo } from 'react';
import {
  ONBMember,
  ONBGroup,
  AppConfig,
  ProductCatalog,
  WorkTypeCatalog,
  ReferenceScore,
  CurrentUserSession,
  GroupId,
  CalculationMethod,
  WorkTypeUnit,
  CustomFieldType,
  CustomFieldDefinition,
  PackageCoreConfig,
  PackageSource,
  PackageClassification,
  CustomerTier,
  PackageWorkType,
  LeaderPlatformConfig,
  PackageModuleCatalog,
  TrainingModuleCatalog,
  RecurringTrainingSchedule,
  DEFAULT_PACKAGE_CORE_CONFIG,
  DEFAULT_TRAINING_MODULES,
  DEFAULT_RECURRING_SCHEDULES
} from '../types';
import { api } from '../services/api';
import {
  Shield,
  Users,
  Layers,
  Settings,
  Plus,
  Edit2,
  Trash2,
  AlertOctagon,
  UserCheck,
  CheckCircle2,
  Lock,
  FolderTree,
  ArrowRight,
  Info,
  Clock,
  Check,
  X,
  Sliders,
  Calculator,
  Tag,
  ToggleLeft,
  ToggleRight,
  AlertCircle,
  FileText,
  List,
  Package,
  Award,
  Save,
  Calendar,
  ShieldAlert,
  HardDrive,
  ShieldCheck
} from 'lucide-react';
import { BackupManagementSubTab } from './BackupManagementSubTab';
import { AccessControlSubTab } from './AccessControlSubTab';

interface CoreTabProps {
  config: AppConfig;
  groups: ONBGroup[];
  members: ONBMember[];
  products: ProductCatalog[];
  workTypes: WorkTypeCatalog[];
  referenceScores: ReferenceScore[];
  packageCoreConfig?: PackageCoreConfig;
  onUpdatePackageCoreConfig?: (cfg: Partial<PackageCoreConfig>) => Promise<void>;
  session: CurrentUserSession | null;
  onUpdateConfig: (cfg: Partial<AppConfig>) => Promise<void>;
  onCreateGroup: (g: any) => Promise<void>;
  onUpdateGroup: (id: string, g: any) => Promise<void>;
  onDeleteGroup: (id: string) => Promise<void>;
  onCreateMember: (m: any) => Promise<void>;
  onUpdateMember: (code: string, m: any) => Promise<void>;
  onDeleteMember: (code: string) => Promise<void>;
  onCreateProduct: (p: any) => Promise<void>;
  onUpdateProduct?: (id: string, p: any) => Promise<void>;
  onDeleteProduct?: (id: string) => Promise<void>;
  onCreateWorkType: (wt: any) => Promise<void>;
  onUpdateWorkType: (id: string, wt: any) => Promise<void>;
  onDeleteWorkType: (id: string) => Promise<void>;
  onCreateReferenceScore: (rs: any) => Promise<void>;
  onUpdateReferenceScore: (id: string, rs: any) => Promise<void>;
  onDeleteReferenceScore?: (id: string) => Promise<void>;
  onOpenCleanupModal?: () => void;
  onOpenDateRangeDeleteModal?: () => void;
  onRefreshAllData?: () => Promise<void>;
}

export const CoreTab: React.FC<CoreTabProps> = ({
  config,
  groups,
  members,
  products,
  workTypes,
  referenceScores,
  packageCoreConfig = DEFAULT_PACKAGE_CORE_CONFIG,
  onUpdatePackageCoreConfig,
  session,
  onUpdateConfig,
  onCreateGroup,
  onUpdateGroup,
  onDeleteGroup,
  onCreateMember,
  onUpdateMember,
  onDeleteMember,
  onCreateProduct,
  onUpdateProduct,
  onDeleteProduct,
  onCreateWorkType,
  onUpdateWorkType,
  onDeleteWorkType,
  onCreateReferenceScore,
  onUpdateReferenceScore,
  onDeleteReferenceScore,
  onOpenCleanupModal,
  onOpenDateRangeDeleteModal,
  onRefreshAllData
}) => {
  const isMasterAdmin = session?.isMasterAdmin;

  const [activeSubTab, setActiveSubTab] = useState<'members' | 'groups' | 'permissions' | 'accessControl' | 'catalogs' | 'scores' | 'packageConfig' | 'trainingModules' | 'recurringTraining' | 'backups'>('groups');

  // Recurring Training Schedules State
  const [recurringSchedules, setRecurringSchedules] = useState<RecurringTrainingSchedule[]>(DEFAULT_RECURRING_SCHEDULES);
  const [isRecurringModalOpen, setIsRecurringModalOpen] = useState(false);
  const [editingRecurring, setEditingRecurring] = useState<RecurringTrainingSchedule | null>(null);
  const [recurringForm, setRecurringForm] = useState({
    moduleCode: 'CRM',
    contentTitle: '',
    daysOfWeek: [2] as number[],
    sessionOfDay: 'Sáng' as 'Sáng' | 'Chiều',
    effectiveFrom: '2026-01-01',
    effectiveTo: '',
    defaultNotes: '',
    isActive: true,
    order: 1
  });
  const [recurringError, setRecurringError] = useState('');

  const loadRecurringSchedules = async () => {
    try {
      const res = await api.getRecurringTrainingSchedules();
      if (res.recurringSchedules && Array.isArray(res.recurringSchedules)) {
        setRecurringSchedules(res.recurringSchedules);
      }
    } catch (err) {
      console.error('Failed to load recurring training schedules in Core', err);
    }
  };

  // Training Modules Management State
  const [trainingModules, setTrainingModules] = useState<TrainingModuleCatalog[]>([]);
  const [isTrainingModuleModalOpen, setIsTrainingModuleModalOpen] = useState(false);
  const [editingTrainingModule, setEditingTrainingModule] = useState<TrainingModuleCatalog | null>(null);
  const [trainingModuleForm, setTrainingModuleForm] = useState({
    code: '',
    name: '',
    defaultSession: '' as 'Sáng' | 'Chiều' | '',
    order: 1,
    isActive: true,
    description: ''
  });
  const [trainingModuleError, setTrainingModuleError] = useState('');

  const loadTrainingModules = async () => {
    try {
      const res = await api.getTrainingModules();
      if (res.modules && Array.isArray(res.modules)) {
        setTrainingModules(res.modules);
      }
    } catch (err) {
      console.error('Failed to load training modules in Core', err);
    }
  };

  React.useEffect(() => {
    loadTrainingModules();
    loadRecurringSchedules();
  }, []);

  // Unified Delete Confirmation & Inactive Switch States
  const [deleteConfirmState, setDeleteConfirmState] = useState<{
    isOpen: boolean;
    recordType: string;
    id: string;
    code: string;
    name: string;
    details?: { label: string; value: string }[];
    onConfirm: () => Promise<void>;
  } | null>(null);

  const [cannotDeleteState, setCannotDeleteState] = useState<{
    isOpen: boolean;
    recordType: string;
    code: string;
    name: string;
    reason: string;
    details?: { label: string; value: string }[];
    onToggleInactive?: () => Promise<void>;
  } | null>(null);

  const [isDeleting, setIsDeleting] = useState(false);

  // Products Management State
  const [isProductModalOpen, setIsProductModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<ProductCatalog | null>(null);
  const [isSubmittingProduct, setIsSubmittingProduct] = useState(false);
  const [productForm, setProductForm] = useState({
    code: '',
    name: '',
    category: 'Module',
    description: '',
    isActive: true
  });
  const [productError, setProductError] = useState('');

  // Reference Scores Management State
  const [isScoreModalOpen, setIsScoreModalOpen] = useState(false);
  const [editingScore, setEditingScore] = useState<ReferenceScore | null>(null);
  const [isSubmittingScore, setIsSubmittingScore] = useState(false);
  const [scoreForm, setScoreForm] = useState({
    workTypeCode: '',
    productCode: '',
    suggestedScore: 10,
    conversionRate: 5000000 as number | undefined,
    effectiveFrom: '2026-01-01',
    effectiveTo: '',
    description: '',
    isActive: true
  });
  const [scoreError, setScoreError] = useState('');

  const handleOpenCreateRecurring = () => {
    setEditingRecurring(null);
    setRecurringError('');
    setRecurringForm({
      moduleCode: trainingModules[0]?.code || 'CRM',
      contentTitle: '',
      daysOfWeek: [2],
      sessionOfDay: 'Sáng',
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: '',
      defaultNotes: '',
      isActive: true,
      order: recurringSchedules.length + 1
    });
    setIsRecurringModalOpen(true);
  };

  const handleOpenEditRecurring = (sched: RecurringTrainingSchedule) => {
    setEditingRecurring(sched);
    setRecurringError('');
    setRecurringForm({
      moduleCode: sched.moduleCode,
      contentTitle: sched.contentTitle,
      daysOfWeek: sched.daysOfWeek || [2],
      sessionOfDay: sched.sessionOfDay,
      effectiveFrom: sched.effectiveFrom,
      effectiveTo: sched.effectiveTo || '',
      defaultNotes: sched.defaultNotes || '',
      isActive: sched.isActive,
      order: sched.order || 1
    });
    setIsRecurringModalOpen(true);
  };

  const handleSubmitRecurring = async (e: React.FormEvent) => {
    e.preventDefault();
    setRecurringError('');
    if (!recurringForm.moduleCode || !recurringForm.contentTitle.trim()) {
      setRecurringError('Vui lòng chọn Module và nhập Nội dung lớp.');
      return;
    }
    if (!recurringForm.daysOfWeek || recurringForm.daysOfWeek.length === 0) {
      setRecurringError('Vui lòng chọn ít nhất 1 thứ trong tuần tổ chức lớp.');
      return;
    }
    if (!recurringForm.effectiveFrom) {
      setRecurringError('Vui lòng nhập ngày bắt đầu hiệu lực.');
      return;
    }

    try {
      if (editingRecurring) {
        await api.updateRecurringTrainingSchedule(editingRecurring.id, {
          moduleCode: recurringForm.moduleCode,
          contentTitle: recurringForm.contentTitle.trim(),
          daysOfWeek: recurringForm.daysOfWeek,
          sessionOfDay: recurringForm.sessionOfDay,
          effectiveFrom: recurringForm.effectiveFrom,
          effectiveTo: recurringForm.effectiveTo.trim() || undefined,
          defaultNotes: recurringForm.defaultNotes.trim(),
          isActive: recurringForm.isActive,
          order: recurringForm.order
        });
      } else {
        await api.createRecurringTrainingSchedule({
          moduleCode: recurringForm.moduleCode,
          contentTitle: recurringForm.contentTitle.trim(),
          daysOfWeek: recurringForm.daysOfWeek,
          sessionOfDay: recurringForm.sessionOfDay,
          effectiveFrom: recurringForm.effectiveFrom,
          effectiveTo: recurringForm.effectiveTo.trim() || undefined,
          defaultNotes: recurringForm.defaultNotes.trim(),
          isActive: recurringForm.isActive,
          order: recurringForm.order
        });
      }
      setIsRecurringModalOpen(false);
      await loadRecurringSchedules();
    } catch (err: any) {
      setRecurringError(err.message || 'Lỗi khi lưu lịch mẫu định kỳ.');
    }
  };

  const handleDeleteRecurring = (sched: RecurringTrainingSchedule) => {
    setDeleteConfirmState({
      isOpen: true,
      recordType: 'Lịch đào tạo định kỳ',
      id: sched.id,
      code: sched.moduleCode,
      name: sched.contentTitle,
      onConfirm: async () => {
        try {
          await api.deleteRecurringTrainingSchedule(sched.id);
          await loadRecurringSchedules();
          setDeleteConfirmState(null);
        } catch (err: any) {
          setDeleteConfirmState(null);
          setCannotDeleteState({
            isOpen: true,
            recordType: 'Lịch đào tạo định kỳ',
            code: sched.moduleCode,
            name: sched.contentTitle,
            reason: err.message || 'Lịch đã có dữ liệu phát sinh liên quan.',
            onToggleInactive: async () => {
              await api.updateRecurringTrainingSchedule(sched.id, { isActive: false });
              await loadRecurringSchedules();
              setCannotDeleteState(null);
            }
          });
        }
      }
    });
  };

  const handleToggleRecurringActive = async (s: RecurringTrainingSchedule) => {
    try {
      await api.updateRecurringTrainingSchedule(s.id, { isActive: !s.isActive });
      await loadRecurringSchedules();
    } catch (err: any) {
      console.error('Lỗi khi đổi trạng thái', err);
    }
  };

  const handleOpenCreateTrainingModule = () => {
    setEditingTrainingModule(null);
    setTrainingModuleError('');
    setTrainingModuleForm({
      code: '',
      name: '',
      defaultSession: 'Sáng',
      order: trainingModules.length + 1,
      isActive: true,
      description: ''
    });
    setIsTrainingModuleModalOpen(true);
  };

  const handleOpenEditTrainingModule = (mod: TrainingModuleCatalog) => {
    setEditingTrainingModule(mod);
    setTrainingModuleError('');
    setTrainingModuleForm({
      code: mod.code,
      name: mod.name,
      defaultSession: (mod.defaultSession as 'Sáng' | 'Chiều' | '') || '',
      order: mod.order || 1,
      isActive: mod.isActive,
      description: mod.description || ''
    });
    setIsTrainingModuleModalOpen(true);
  };

  const handleSubmitTrainingModule = async (e: React.FormEvent) => {
    e.preventDefault();
    setTrainingModuleError('');

    if (!trainingModuleForm.code.trim() || !trainingModuleForm.name.trim()) {
      setTrainingModuleError('Vui lòng nhập Mã và Tên module.');
      return;
    }

    try {
      if (editingTrainingModule) {
        await api.updateTrainingModule(editingTrainingModule.id, {
          code: trainingModuleForm.code.trim().toUpperCase(),
          name: trainingModuleForm.name.trim(),
          defaultSession: trainingModuleForm.defaultSession,
          order: Number(trainingModuleForm.order),
          isActive: trainingModuleForm.isActive,
          description: trainingModuleForm.description.trim()
        });
      } else {
        await api.createTrainingModule({
          code: trainingModuleForm.code.trim().toUpperCase(),
          name: trainingModuleForm.name.trim(),
          defaultSession: trainingModuleForm.defaultSession,
          order: Number(trainingModuleForm.order),
          isActive: trainingModuleForm.isActive,
          description: trainingModuleForm.description.trim()
        });
      }
      await loadTrainingModules();
      setIsTrainingModuleModalOpen(false);
    } catch (err: any) {
      setTrainingModuleError(err.message || 'Lỗi khi lưu module');
    }
  };

  const handleToggleTrainingModuleActive = async (mod: TrainingModuleCatalog) => {
    try {
      await api.updateTrainingModule(mod.id, { isActive: !mod.isActive });
      await loadTrainingModules();
    } catch (err: any) {
      console.error('Lỗi khi đổi trạng thái', err);
    }
  };

  const handleDeleteTrainingModule = (mod: TrainingModuleCatalog) => {
    setDeleteConfirmState({
      isOpen: true,
      recordType: 'Module đào tạo tập trung',
      id: mod.id,
      code: mod.code,
      name: mod.name,
      onConfirm: async () => {
        try {
          await api.deleteTrainingModule(mod.id);
          await loadTrainingModules();
          setDeleteConfirmState(null);
        } catch (err: any) {
          setDeleteConfirmState(null);
          setCannotDeleteState({
            isOpen: true,
            recordType: 'Module đào tạo tập trung',
            code: mod.code,
            name: mod.name,
            reason: err.message || 'Module đã có dữ liệu lớp đào tạo phát sinh.',
            onToggleInactive: async () => {
              await api.updateTrainingModule(mod.id, { isActive: false });
              await loadTrainingModules();
              setCannotDeleteState(null);
            }
          });
        }
      }
    });
  };

  // Package Core Config State
  const [localPkgConfig, setLocalPkgConfig] = useState<PackageCoreConfig>(packageCoreConfig || DEFAULT_PACKAGE_CORE_CONFIG);
  const [isSavingPkgConfig, setIsSavingPkgConfig] = useState(false);
  const [pkgConfigMsg, setPkgConfigMsg] = useState<string | null>(null);

  // Sync when prop updates
  React.useEffect(() => {
    if (packageCoreConfig) {
      setLocalPkgConfig(packageCoreConfig);
    }
  }, [packageCoreConfig]);

  const handleSavePackageCoreConfig = async () => {
    if (!onUpdatePackageCoreConfig) return;
    setIsSavingPkgConfig(true);
    setPkgConfigMsg(null);
    try {
      await onUpdatePackageCoreConfig(localPkgConfig);
      setPkgConfigMsg('Đã lưu cấu hình phân hệ KH & Gói tiếp nhận vào Core thành công!');
      setTimeout(() => setPkgConfigMsg(null), 4000);
    } catch (err: any) {
      setPkgConfigMsg(`Lỗi khi lưu cấu hình: ${err.message || 'Lỗi không xác định'}`);
    } finally {
      setIsSavingPkgConfig(false);
    }
  };

  const handleDeletePackageConfigItem = (section: keyof PackageCoreConfig, item: any) => {
    setDeleteConfirmState({
      isOpen: true,
      recordType: `Cấu hình ${section}`,
      id: item.id,
      code: item.code || String(item.platforms || ''),
      name: item.name || (item.platforms ? `${item.platforms} nền tảng` : item.id),
      onConfirm: async () => {
        try {
          await api.deletePackageConfigItem(section as string, item.id);
          const updatedList = ((localPkgConfig[section] as any[]) || []).filter((it: any) => it.id !== item.id);
          setLocalPkgConfig({
            ...localPkgConfig,
            [section]: updatedList
          });
          setDeleteConfirmState(null);
        } catch (err: any) {
          setDeleteConfirmState(null);
          setCannotDeleteState({
            isOpen: true,
            recordType: `Cấu hình ${section}`,
            code: item.code || String(item.platforms || ''),
            name: item.name || (item.platforms ? `${item.platforms} nền tảng` : item.id),
            reason: err.message || 'Danh mục đã có dữ liệu phát sinh liên quan.',
            onToggleInactive: async () => {
              const updatedList = ((localPkgConfig[section] as any[]) || []).map((it: any) =>
                it.id === item.id ? { ...it, isActive: false } : it
              );
              const newCfg = {
                ...localPkgConfig,
                [section]: updatedList
              };
              setLocalPkgConfig(newCfg);
              if (onUpdatePackageCoreConfig) {
                await onUpdatePackageCoreConfig(newCfg);
              }
              setCannotDeleteState(null);
            }
          });
        }
      }
    });
  };

  // Groups Management State
  const [isGroupModalOpen, setIsGroupModalOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<ONBGroup | null>(null);
  const [groupForm, setGroupForm] = useState({
    name: '',
    code: '',
    order: 1,
    isActive: true,
    description: ''
  });
  const [groupError, setGroupError] = useState('');

  // Member Filter & Modal State
  const [selectedGroupFilter, setSelectedGroupFilter] = useState<string>('ALL');
  const [isMemberModalOpen, setIsMemberModalOpen] = useState(false);
  const [editingMember, setEditingMember] = useState<ONBMember | null>(null);
  const [memberError, setMemberError] = useState('');
  const [memberForm, setMemberForm] = useState({
    code: '',
    fullName: '',
    displayName: '',
    email: '',
    groupId: groups[0]?.id || 'grp_1',
    currentGroup: groups[0]?.name || 'Nhóm 1',
    startDate: '2026-01-01',
    isActive: true,
    participateRandom: true,
    completedProductsStr: 'CRM, HRM',
    phone: ''
  });

  // Config Modal State
  const [bonusManager1, setBonusManager1] = useState(config.bonusManagers?.[0] || 'LIEM');
  const [bonusManager2, setBonusManager2] = useState(config.bonusManagers?.[1] || 'DTPTHAO');
  const [allocManager1, setAllocManager1] = useState(config.allocationManagers?.[0] || 'NTGIANG');
  const [allocManager2, setAllocManager2] = useState(config.allocationManagers?.[1] || 'NDDUONG');
  const [permissionMsg, setPermissionMsg] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Work Types Modal State (Core quản lý toàn diện)
  const [isWorkTypeModalOpen, setIsWorkTypeModalOpen] = useState(false);
  const [editingWorkType, setEditingWorkType] = useState<WorkTypeCatalog | null>(null);
  const [isSubmittingWorkType, setIsSubmittingWorkType] = useState(false);
  const [workTypeForm, setWorkTypeForm] = useState({
    code: '',
    name: '',
    unit: 'Buổi',
    unitType: 'session' as any,
    calculationMethod: 'QUANTITY_MULTIPLY' as CalculationMethod,
    defaultScorePerUnit: 10,
    conversionRate: 5000000,
    isTraining: false,
    requiresProduct: false,
    kpiCategory: 'Triển khai',
    isActive: true,
    order: 1,
    description: ''
  });
  const [workTypeError, setWorkTypeError] = useState('');

  if (!isMasterAdmin) {
    return (
      <div className="bg-white p-8 rounded-lg border border-slate-200 text-center space-y-3">
        <Shield className="w-12 h-12 text-slate-300 mx-auto" />
        <h3 className="text-base font-semibold text-slate-900">Thiết Lập Hệ Thống - Giới Hạn Quản Trị</h3>
        <p className="text-xs text-slate-500 max-w-md mx-auto">
          Chỉ Quản trị viên chính (Từ Đức Thắng · Thangtutu0201@gmail.com) mới được quyền truy cập và chỉnh sửa phân hệ Thiết lập hệ thống theo quy định an toàn nghiệp vụ.
        </p>
      </div>
    );
  }

  // --- GROUP ACTIONS ---
  const handleOpenCreateGroup = () => {
    setEditingGroup(null);
    setGroupForm({
      name: '',
      code: '',
      order: groups.length + 1,
      isActive: true,
      description: ''
    });
    setGroupError('');
    setIsGroupModalOpen(true);
  };

  const handleOpenEditGroup = (g: ONBGroup) => {
    setEditingGroup(g);
    setGroupForm({
      name: g.name,
      code: g.code,
      order: g.order,
      isActive: g.isActive,
      description: g.description || ''
    });
    setGroupError('');
    setIsGroupModalOpen(true);
  };

  const handleSubmitGroup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!groupForm.name.trim()) {
      setGroupError('Vui lòng nhập tên nhóm.');
      return;
    }

    try {
      if (editingGroup) {
        await onUpdateGroup(editingGroup.id, {
          name: groupForm.name.trim(),
          code: groupForm.code.trim() || undefined,
          order: Number(groupForm.order),
          isActive: groupForm.isActive,
          description: groupForm.description.trim()
        });
      } else {
        await onCreateGroup({
          name: groupForm.name.trim(),
          code: groupForm.code.trim() || undefined,
          order: Number(groupForm.order),
          isActive: groupForm.isActive,
          description: groupForm.description.trim()
        });
      }
      setIsGroupModalOpen(false);
    } catch (err: any) {
      setGroupError(err.message || 'Lỗi khi lưu nhóm.');
    }
  };

  const handleToggleGroupActive = async (g: ONBGroup) => {
    try {
      await onUpdateGroup(g.id, { isActive: !g.isActive });
    } catch (err: any) {
      console.error('Lỗi khi đổi trạng thái nhóm', err);
    }
  };

  const handleDeleteGroupCheck = (g: ONBGroup) => {
    setDeleteConfirmState({
      isOpen: true,
      recordType: 'Nhóm làm việc',
      id: g.id,
      code: g.code,
      name: g.name,
      onConfirm: async () => {
        try {
          await onDeleteGroup(g.id);
          setDeleteConfirmState(null);
        } catch (err: any) {
          setDeleteConfirmState(null);
          setCannotDeleteState({
            isOpen: true,
            recordType: 'Nhóm làm việc',
            code: g.code,
            name: g.name,
            reason: err.message || 'Nhóm đã có dữ liệu phát sinh liên quan.',
            onToggleInactive: async () => {
              await onUpdateGroup(g.id, { isActive: false });
              setCannotDeleteState(null);
            }
          });
        }
      }
    });
  };

  // --- MEMBER ACTIONS ---
  const handleOpenCreateMember = () => {
    setEditingMember(null);
    setMemberError('');
    const defaultGroup = groups[0] || { id: 'grp_1', name: 'Nhóm 1' };
    setMemberForm({
      code: '',
      fullName: '',
      displayName: '',
      email: '',
      groupId: defaultGroup.id,
      currentGroup: defaultGroup.name,
      startDate: new Date().toISOString().slice(0, 10),
      isActive: true,
      participateRandom: true,
      completedProductsStr: 'CRM',
      phone: ''
    });
    setIsMemberModalOpen(true);
  };

  const handleOpenEditMember = (m: ONBMember) => {
    setEditingMember(m);
    setMemberError('');
    const matchedGroup = groups.find(g => (m.groupId && g.id === m.groupId) || g.name === m.currentGroup) || groups[0];
    setMemberForm({
      code: m.code,
      fullName: m.fullName,
      displayName: m.displayName || m.fullName,
      email: m.email,
      groupId: matchedGroup?.id || m.groupId || 'grp_1',
      currentGroup: matchedGroup?.name || m.currentGroup || 'Nhóm 1',
      startDate: m.startDate || '2026-01-01',
      isActive: m.isActive,
      participateRandom: m.participateRandom !== false,
      completedProductsStr: m.completedProducts ? m.completedProducts.join(', ') : '',
      phone: m.phone || ''
    });
    setIsMemberModalOpen(true);
  };

  const handleSubmitMember = async (e: React.FormEvent) => {
    e.preventDefault();
    setMemberError('');

    const trimmedCode = memberForm.code.trim().toUpperCase();
    if (!trimmedCode) {
      setMemberError('Mã ONB không được để trống.');
      return;
    }
    if (!memberForm.fullName.trim()) {
      setMemberError('Họ và tên không được để trống.');
      return;
    }
    if (!memberForm.email.trim()) {
      setMemberError('Email liên kết không được để trống.');
      return;
    }

    // Check duplicate code excluding current editing member
    const isDuplicate = members.some(m =>
      m.code.toUpperCase() === trimmedCode &&
      (!editingMember || (m.id !== editingMember.id && m.code.toUpperCase() !== editingMember.code.toUpperCase()))
    );
    if (isDuplicate) {
      setMemberError(`Mã ONB "${trimmedCode}" đã tồn tại trên nhân sự khác.`);
      return;
    }

    const completedArr = memberForm.completedProductsStr.split(',').map(s => s.trim()).filter(Boolean);

    try {
      const selectedG = groups.find(g => g.id === memberForm.groupId);
      const payload = {
        ...memberForm,
        code: trimmedCode,
        fullName: memberForm.fullName.trim(),
        displayName: memberForm.displayName?.trim() || memberForm.fullName.trim(),
        email: memberForm.email.trim(),
        groupId: selectedG ? selectedG.id : memberForm.groupId,
        currentGroup: selectedG ? selectedG.name : memberForm.currentGroup,
        completedProducts: completedArr
      };

      if (editingMember) {
        await onUpdateMember(editingMember.code, payload);
      } else {
        await onCreateMember(payload);
      }
      setIsMemberModalOpen(false);
      setEditingMember(null);
      setMemberError('');
    } catch (err: any) {
      setMemberError(err.message || 'Lỗi khi lưu nhân sự.');
    }
  };

  const handleToggleMemberActive = async (m: ONBMember) => {
    try {
      await onUpdateMember(m.code, { isActive: !m.isActive });
    } catch (err: any) {
      console.error('Lỗi khi đổi trạng thái nhân sự', err);
    }
  };

  const handleDeleteMemberCheck = (m: ONBMember) => {
    setDeleteConfirmState({
      isOpen: true,
      recordType: 'Nhân sự ONB',
      id: m.code,
      code: m.code,
      name: m.fullName,
      onConfirm: async () => {
        try {
          await onDeleteMember(m.code);
          setDeleteConfirmState(null);
        } catch (err: any) {
          setDeleteConfirmState(null);
          setCannotDeleteState({
            isOpen: true,
            recordType: 'Nhân sự ONB',
            code: m.code,
            name: m.fullName,
            reason: err.message || 'Nhân sự đã có dữ liệu phát sinh liên quan.',
            onToggleInactive: async () => {
              await onUpdateMember(m.code, { isActive: false });
              setCannotDeleteState(null);
            }
          });
        }
      }
    });
  };

  // --- PRODUCT ACTIONS ---
  const handleOpenCreateProduct = () => {
    setEditingProduct(null);
    setProductError('');
    setProductForm({
      code: '',
      name: '',
      category: 'Module',
      description: '',
      isActive: true
    });
    setIsProductModalOpen(true);
  };

  const handleOpenEditProduct = (p: ProductCatalog) => {
    setEditingProduct(p);
    setProductError('');
    setProductForm({
      code: p.code,
      name: p.name,
      category: p.category || 'Module',
      description: p.description || '',
      isActive: p.isActive !== false
    });
    setIsProductModalOpen(true);
  };

  const handleSubmitProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    setProductError('');
    const trimmedCode = productForm.code.trim().toUpperCase();
    const trimmedName = productForm.name.trim();

    if (!trimmedCode || !trimmedName) {
      setProductError('Vui lòng nhập đầy đủ Mã và Tên sản phẩm.');
      return;
    }

    // Check duplicate code excluding current editing product
    const isDuplicate = products.some(p =>
      p.code.toUpperCase() === trimmedCode &&
      (!editingProduct || p.id !== editingProduct.id)
    );
    if (isDuplicate) {
      setProductError(`Mã sản phẩm "${trimmedCode}" đã tồn tại trên sản phẩm khác.`);
      return;
    }

    setIsSubmittingProduct(true);
    try {
      const payload = {
        code: trimmedCode,
        name: trimmedName,
        category: productForm.category,
        description: productForm.description.trim(),
        isActive: productForm.isActive
      };

      if (editingProduct && onUpdateProduct) {
        await onUpdateProduct(editingProduct.id, payload);
      } else {
        await onCreateProduct(payload);
      }
      setIsProductModalOpen(false);
      setEditingProduct(null);
      setProductError('');
    } catch (err: any) {
      setProductError(err.message || 'Lỗi khi lưu sản phẩm.');
    } finally {
      setIsSubmittingProduct(false);
    }
  };

  const handleToggleProductActive = async (p: ProductCatalog) => {
    if (!onUpdateProduct) return;
    try {
      await onUpdateProduct(p.id, { isActive: !p.isActive });
    } catch (err: any) {
      console.error('Lỗi đổi trạng thái sản phẩm', err);
    }
  };

  const handleDeleteProductClick = (p: ProductCatalog) => {
    if (!onDeleteProduct) return;
    setDeleteConfirmState({
      isOpen: true,
      recordType: 'Sản phẩm / Module',
      id: p.id,
      code: p.code,
      name: p.name,
      onConfirm: async () => {
        try {
          await onDeleteProduct(p.id);
          setDeleteConfirmState(null);
        } catch (err: any) {
          setDeleteConfirmState(null);
          setCannotDeleteState({
            isOpen: true,
            recordType: 'Sản phẩm / Module',
            code: p.code,
            name: p.name,
            reason: err.message || `[${p.code} - ${p.name}] đã có dữ liệu phát sinh, không thể xóa. Vui lòng chuyển sang Ngưng sử dụng.`,
            onToggleInactive: async () => {
              if (onUpdateProduct) {
                await onUpdateProduct(p.id, { isActive: false });
              }
              setCannotDeleteState(null);
            }
          });
        }
      }
    });
  };

  // --- REFERENCE SCORE ACTIONS ---
  const handleOpenCreateScore = () => {
    setEditingScore(null);
    setScoreError('');
    const defaultWt = workTypes[0];
    setScoreForm({
      workTypeCode: defaultWt?.code || '',
      productCode: '',
      suggestedScore: defaultWt?.defaultScorePerUnit ?? 10,
      conversionRate: defaultWt?.conversionRate !== undefined ? defaultWt.conversionRate : 5000000,
      effectiveFrom: new Date().toISOString().slice(0, 10),
      effectiveTo: '',
      description: '',
      isActive: true
    });
    setIsScoreModalOpen(true);
  };

  const handleOpenEditScore = (rs: ReferenceScore) => {
    setEditingScore(rs);
    setScoreError('');
    setScoreForm({
      workTypeCode: rs.workTypeCode,
      productCode: rs.productCode || '',
      suggestedScore: rs.suggestedScore,
      conversionRate: rs.conversionRate !== undefined ? rs.conversionRate : undefined,
      effectiveFrom: rs.effectiveFrom,
      effectiveTo: rs.effectiveTo || '',
      description: rs.description || '',
      isActive: rs.isActive !== false
    });
    setIsScoreModalOpen(true);
  };

  const handleSubmitScore = async (e: React.FormEvent) => {
    e.preventDefault();
    setScoreError('');

    if (!scoreForm.workTypeCode || !scoreForm.workTypeCode.trim()) {
      setScoreError('Vui lòng chọn Loại công việc.');
      return;
    }

    if (!scoreForm.effectiveFrom || !scoreForm.effectiveFrom.trim()) {
      setScoreError('Vui lòng chọn ngày bắt đầu hiệu lực.');
      return;
    }

    const numScore = Number(scoreForm.suggestedScore);
    if (scoreForm.suggestedScore === ('' as any) || isNaN(numScore) || numScore < 0) {
      setScoreError('Điểm gợi ý phải là số hợp lệ lớn hơn hoặc bằng 0.');
      return;
    }

    if (scoreForm.conversionRate !== undefined && (scoreForm.conversionRate as any) !== '' && scoreForm.conversionRate !== null) {
      const numRate = Number(scoreForm.conversionRate);
      if (isNaN(numRate) || numRate <= 0) {
        setScoreError('Mức quy đổi VNĐ phải là số dương lớn hơn 0.');
        return;
      }
    }

    if (scoreForm.effectiveTo && scoreForm.effectiveTo < scoreForm.effectiveFrom) {
      setScoreError('Ngày kết thúc hiệu lực không được trước ngày bắt đầu hiệu lực.');
      return;
    }

    // Check duplicate excluding self
    const isDup = referenceScores.some(rs =>
      rs.id !== editingScore?.id &&
      rs.workTypeCode.toLowerCase() === scoreForm.workTypeCode.trim().toLowerCase() &&
      (rs.productCode || '').toLowerCase() === (scoreForm.productCode || '').trim().toLowerCase() &&
      rs.effectiveFrom === scoreForm.effectiveFrom.trim()
    );

    if (isDup) {
      setScoreError(
        `Quy tắc điểm cho Loại việc "${scoreForm.workTypeCode}" - Sản phẩm "${scoreForm.productCode || 'Tất cả sản phẩm'}" có ngày hiệu lực ${scoreForm.effectiveFrom} đã tồn tại.`
      );
      return;
    }

    setIsSubmittingScore(true);
    try {
      const payload = {
        workTypeCode: scoreForm.workTypeCode.trim(),
        productCode: scoreForm.productCode && scoreForm.productCode.trim() ? scoreForm.productCode.trim() : null,
        suggestedScore: numScore,
        conversionRate: (scoreForm.conversionRate !== undefined && (scoreForm.conversionRate as any) !== '' && scoreForm.conversionRate !== null)
          ? Number(scoreForm.conversionRate)
          : null,
        effectiveFrom: scoreForm.effectiveFrom.trim(),
        effectiveTo: scoreForm.effectiveTo && scoreForm.effectiveTo.trim() ? scoreForm.effectiveTo.trim() : null,
        description: scoreForm.description ? scoreForm.description.trim() : '',
        isActive: scoreForm.isActive
      };

      if (editingScore) {
        await onUpdateReferenceScore(editingScore.id, payload);
      } else {
        await onCreateReferenceScore(payload);
      }
      setIsScoreModalOpen(false);
      setEditingScore(null);
    } catch (err: any) {
      setScoreError(err.message || 'Lỗi khi lưu điểm tham chiếu.');
    } finally {
      setIsSubmittingScore(false);
    }
  };

  const handleToggleScoreActive = async (rs: ReferenceScore) => {
    try {
      const nextActive = rs.isActive === false ? true : false;
      await onUpdateReferenceScore(rs.id, { isActive: nextActive });
    } catch (err: any) {
      console.error('Lỗi đổi trạng thái điểm tham chiếu', err);
    }
  };

  const handleDeleteScoreClick = (rs: ReferenceScore) => {
    if (!onDeleteReferenceScore) return;
    const wt = workTypes.find(w => w.code === rs.workTypeCode);
    const prod = products.find(p => p.code === rs.productCode);

    setDeleteConfirmState({
      isOpen: true,
      recordType: 'Điểm tham chiếu Core',
      id: rs.id,
      code: rs.workTypeCode,
      name: `${wt ? `${wt.name} (${rs.workTypeCode})` : rs.workTypeCode} → ${rs.suggestedScore} điểm`,
      details: [
        { label: 'Loại công việc', value: `${wt ? wt.name : rs.workTypeCode} (${rs.workTypeCode})` },
        { label: 'Sản phẩm áp dụng', value: prod ? `${prod.name} (${prod.code})` : (rs.productCode || 'Tất cả sản phẩm (Áp dụng chung)') },
        { label: 'Ngày hiệu lực', value: `${rs.effectiveFrom}${rs.effectiveTo ? ` đến ${rs.effectiveTo}` : ' (vô thời hạn)'}` },
        { label: 'Định mức điểm / Quy đổi', value: `${rs.suggestedScore} điểm${rs.conversionRate ? ` | ${rs.conversionRate.toLocaleString('vi-VN')} đ/điểm` : ''}` },
        { label: 'Trạng thái hiện tại', value: rs.isActive !== false ? 'Đang sử dụng' : 'Ngưng sử dụng' }
      ],
      onConfirm: async () => {
        try {
          await onDeleteReferenceScore(rs.id);
          setDeleteConfirmState(null);
        } catch (err: any) {
          setDeleteConfirmState(null);
          setCannotDeleteState({
            isOpen: true,
            recordType: 'Điểm tham chiếu Core',
            code: rs.workTypeCode,
            name: `${wt ? `${wt.name} (${rs.workTypeCode})` : rs.workTypeCode} → ${rs.suggestedScore} điểm`,
            reason: err.message || 'Dòng điểm tham chiếu này đã có dữ liệu phát sinh, không thể xóa. Vui lòng chuyển sang Ngưng sử dụng.',
            details: [
              { label: 'Loại công việc', value: `${wt ? wt.name : rs.workTypeCode} (${rs.workTypeCode})` },
              { label: 'Sản phẩm áp dụng', value: prod ? `${prod.name} (${prod.code})` : (rs.productCode || 'Tất cả sản phẩm (Áp dụng chung)') },
              { label: 'Ngày hiệu lực', value: `${rs.effectiveFrom}${rs.effectiveTo ? ` đến ${rs.effectiveTo}` : ' (vô thời hạn)'}` },
              { label: 'Điểm gợi ý chuẩn', value: `${rs.suggestedScore} điểm` }
            ],
            onToggleInactive: async () => {
              await onUpdateReferenceScore(rs.id, { isActive: false });
              setCannotDeleteState(null);
            }
          });
        }
      }
    });
  };

  const handleSavePermissions = async () => {
    setPermissionMsg(null);
    try {
      const bManagers = [bonusManager1, bonusManager2].filter(Boolean);
      const aManagers = [allocManager1, allocManager2].filter(Boolean);
      await onUpdateConfig({
        bonusManagers: bManagers,
        allocationManagers: aManagers
      });
      setPermissionMsg({ type: 'success', text: 'Đã cập nhật chỉ định phân quyền thành công!' });
      setTimeout(() => setPermissionMsg(null), 4000);
    } catch (err: any) {
      setPermissionMsg({ type: 'error', text: err.message || 'Lỗi lưu cấu hình phân quyền.' });
    }
  };

  // --- WORK TYPE ACTIONS (CORE QUẢN TRỊ DUY NHẤT) ---
  const handleOpenCreateWorkType = () => {
    setEditingWorkType(null);
    setWorkTypeForm({
      code: '',
      name: '',
      unit: 'Buổi',
      unitType: 'session',
      calculationMethod: 'QUANTITY_MULTIPLY',
      defaultScorePerUnit: 10,
      conversionRate: 5000000,
      isTraining: false,
      requiresProduct: false,
      kpiCategory: 'TVTK Trực tiếp',
      isActive: true,
      order: workTypes.length + 1,
      description: ''
    });
    setWorkTypeError('');
    setIsWorkTypeModalOpen(true);
  };

  const handleOpenEditWorkType = (wt: WorkTypeCatalog) => {
    setEditingWorkType(wt);
    const ref = referenceScores.find(rs => rs.workTypeCode === wt.code);
    setWorkTypeForm({
      code: wt.code,
      name: wt.name,
      unit: wt.unit || 'Buổi',
      unitType: wt.unitType || (wt.unit === 'VNĐ' ? 'currency' : 'session'),
      calculationMethod: wt.calculationMethod || (wt.unit === 'VNĐ' ? 'AMOUNT_DIVIDE' : 'QUANTITY_MULTIPLY'),
      defaultScorePerUnit: wt.defaultScorePerUnit !== undefined ? wt.defaultScorePerUnit : (ref?.suggestedScore || 10),
      conversionRate: wt.conversionRate !== undefined ? wt.conversionRate : (ref?.conversionRate || 5000000),
      isTraining: Boolean(wt.isTraining),
      requiresProduct: Boolean(wt.requiresProduct),
      kpiCategory: wt.kpiCategory || 'Khác',
      isActive: wt.isActive !== false,
      order: wt.order || 1,
      description: wt.description || ''
    });
    setWorkTypeError('');
    setIsWorkTypeModalOpen(true);
  };

  const handleSubmitWorkType = async (e: React.FormEvent) => {
    e.preventDefault();
    setWorkTypeError('');
    const trimmedCode = workTypeForm.code.trim();
    const trimmedName = workTypeForm.name.trim();

    if (!trimmedCode || !trimmedName) {
      setWorkTypeError('Vui lòng nhập đầy đủ Mã định danh và Tên loại công việc.');
      return;
    }

    // Check duplicate code excluding current editing work type
    const isDuplicate = workTypes.some(w =>
      w.code.trim().toLowerCase() === trimmedCode.toLowerCase() &&
      (!editingWorkType || w.id !== editingWorkType.id)
    );
    if (isDuplicate) {
      setWorkTypeError(`Mã loại công việc "${trimmedCode}" đã tồn tại trên loại việc khác.`);
      return;
    }

    setIsSubmittingWorkType(true);
    try {
      const payload = {
        code: trimmedCode,
        name: trimmedName,
        unit: workTypeForm.unit,
        unitType: workTypeForm.unitType,
        calculationMethod: workTypeForm.calculationMethod,
        defaultScorePerUnit: Number(workTypeForm.defaultScorePerUnit) || 0,
        conversionRate: workTypeForm.calculationMethod === 'AMOUNT_DIVIDE' ? (Number(workTypeForm.conversionRate) || 5000000) : undefined,
        isTraining: workTypeForm.isTraining,
        requiresProduct: workTypeForm.requiresProduct,
        kpiCategory: workTypeForm.kpiCategory,
        isActive: workTypeForm.isActive,
        order: Number(workTypeForm.order) || 1,
        description: workTypeForm.description.trim()
      };

      if (editingWorkType) {
        await onUpdateWorkType(editingWorkType.id, payload);
      } else {
        await onCreateWorkType(payload);
      }
      setIsWorkTypeModalOpen(false);
      setEditingWorkType(null);
      setWorkTypeError('');
    } catch (err: any) {
      setWorkTypeError(err.message || 'Lỗi khi lưu loại công việc.');
    } finally {
      setIsSubmittingWorkType(false);
    }
  };

  const handleToggleWorkTypeActive = async (wt: WorkTypeCatalog) => {
    try {
      await onUpdateWorkType(wt.id, { isActive: !wt.isActive });
    } catch (err: any) {
      console.error('Lỗi khi đổi trạng thái', err);
    }
  };

  const handleDeleteWorkTypeCheck = (wt: WorkTypeCatalog) => {
    setDeleteConfirmState({
      isOpen: true,
      recordType: 'Loại hình công việc',
      id: wt.id,
      code: wt.code,
      name: wt.name,
      onConfirm: async () => {
        try {
          await onDeleteWorkType(wt.id);
          setDeleteConfirmState(null);
        } catch (err: any) {
          setDeleteConfirmState(null);
          setCannotDeleteState({
            isOpen: true,
            recordType: 'Loại hình công việc',
            code: wt.code,
            name: wt.name,
            reason: err.message || `[${wt.code} - ${wt.name}] đã có dữ liệu phát sinh, không thể xóa. Vui lòng chuyển sang Ngưng sử dụng.`,
            onToggleInactive: async () => {
              await onUpdateWorkType(wt.id, { isActive: false });
              setCannotDeleteState(null);
            }
          });
        }
      }
    });
  };

  // Filtered members in Core
  const filteredMembers = useMemo(() => {
    if (selectedGroupFilter === 'ALL') return members;
    return members.filter(m => (m.groupId && m.groupId === selectedGroupFilter) || m.currentGroup === selectedGroupFilter);
  }, [members, selectedGroupFilter]);

  return (
    <div className="space-y-4">
      {/* Top Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 bg-blue-50 text-blue-700 rounded-lg border border-blue-200/60">
            <Shield className="w-5 h-5" />
          </div>
          <div>
            <h2 className="text-lg md:text-xl font-bold text-slate-900 tracking-tight">
              Thiết Lập Hệ Thống - Quản Trị & Cấu Hình Tổ Chức
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">
              Đặc quyền Quản trị viên chính ({config.adminOnbCode}) · Thay đổi danh mục và nhóm tự động bảo toàn toàn vẹn lịch sử công tác
            </p>
          </div>
        </div>

        <div className="text-xs bg-slate-50 border border-slate-200 px-3.5 py-1.5 rounded-lg text-slate-600 font-medium shrink-0">
          Admin: <strong className="text-slate-900">{config.adminOnbCode}</strong> ({config.adminEmail})
        </div>
      </div>

      {/* Khu vực Quản trị: Xóa Dữ Liệu Theo Khoảng Thời Gian (Chỉ Admin) */}
      {(isMasterAdmin || session?.role === 'admin') && onOpenDateRangeDeleteModal && (
        <div className="bg-gradient-to-r from-rose-50 via-red-50/80 to-white p-4.5 rounded-xl border border-rose-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start sm:items-center gap-3.5">
            <div className="p-2.5 bg-rose-600 text-white rounded-xl shadow-xs shrink-0">
              <Calendar className="w-5 h-5" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <h3 className="text-sm font-bold text-rose-950">
                  Xóa Dữ Liệu Theo Khoảng Thời Gian
                </h3>
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-rose-200/80 text-rose-800">
                  Chỉ Quản trị viên
                </span>
              </div>
              <p className="text-xs text-rose-800/90 mt-0.5 leading-relaxed">
                Cho phép Admin dọn dẹp Lịch công việc, Tiếp nhận gói đào tạo, Tiến độ thực hiện theo ngày phát sinh thực tế. Tự động xử lý dữ liệu liên kết, cập nhật lại điểm KPI & bảng tổng hợp, bảo toàn 100% danh mục Thiết lập hệ thống.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onOpenDateRangeDeleteModal}
            className="px-4 py-2.5 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-xs cursor-pointer shrink-0 hover:shadow-md"
          >
            <Trash2 className="w-4 h-4" />
            <span>Xóa dữ liệu theo khoảng thời gian</span>
          </button>
        </div>
      )}

      {/* Dedicated Cleanup Banner (Dành cho tài khoản kiểm thử cũ nếu có cấu hình) */}
      {session?.email?.toLowerCase() === 'dangthihong01012003@gmail.com' && onOpenCleanupModal && (
        <div className="bg-slate-50 p-3 rounded-lg border border-slate-200 flex items-center justify-between gap-2 text-xs text-slate-500">
          <span>Công cụ dọn dẹp kiểm thử cá nhân nâng cao (Có xác thực email)</span>
          <button
            type="button"
            onClick={onOpenCleanupModal}
            className="px-2.5 py-1 text-slate-600 hover:text-slate-800 font-semibold underline cursor-pointer"
          >
            Mở hộp thoại kiểm thử
          </button>
        </div>
      )}

      {/* Core Subtabs Bar */}
      <div className="flex items-center gap-1.5 overflow-x-auto pb-2 border-b border-[#E2E8F0] text-sm no-scrollbar">
        <button
          onClick={() => setActiveSubTab('groups')}
          className={`px-3.5 py-2 text-sm whitespace-nowrap rounded-lg transition-colors flex items-center gap-2 border-b-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:outline-hidden ${
            activeSubTab === 'groups'
              ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold border-[#4F46E5] shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] font-medium border-transparent'
          }`}
        >
          <FolderTree className={`w-4 h-4 shrink-0 ${activeSubTab === 'groups' ? 'text-[#4F46E5]' : 'text-[#64748B]'}`} />
          <span>Danh mục Nhóm</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            activeSubTab === 'groups' ? 'bg-[#E0E7FF] text-[#4F46E5]' : 'bg-slate-100 text-slate-600'
          }`}>
            {groups.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('members')}
          className={`px-3.5 py-2 text-sm whitespace-nowrap rounded-lg transition-colors flex items-center gap-2 border-b-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:outline-hidden ${
            activeSubTab === 'members'
              ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold border-[#4F46E5] shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] font-medium border-transparent'
          }`}
        >
          <Users className={`w-4 h-4 shrink-0 ${activeSubTab === 'members' ? 'text-[#4F46E5]' : 'text-[#64748B]'}`} />
          <span>Nhân sự ONB</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            activeSubTab === 'members' ? 'bg-[#E0E7FF] text-[#4F46E5]' : 'bg-slate-100 text-slate-600'
          }`}>
            {members.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('permissions')}
          className={`px-3.5 py-2 text-sm whitespace-nowrap rounded-lg transition-colors flex items-center gap-2 border-b-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:outline-hidden ${
            activeSubTab === 'permissions'
              ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold border-[#4F46E5] shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] font-medium border-transparent'
          }`}
        >
          <Settings className={`w-4 h-4 shrink-0 ${activeSubTab === 'permissions' ? 'text-[#4F46E5]' : 'text-[#64748B]'}`} />
          <span>Phân quyền Thưởng & Phân bổ</span>
        </button>

        {isMasterAdmin && (
          <button
            onClick={() => setActiveSubTab('accessControl')}
            className={`px-3.5 py-2 text-sm whitespace-nowrap rounded-lg transition-colors flex items-center gap-2 border-b-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:outline-hidden ${
              activeSubTab === 'accessControl'
                ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold border-[#4F46E5] shadow-xs'
                : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] font-medium border-transparent'
            }`}
          >
            <ShieldCheck className={`w-4 h-4 shrink-0 ${activeSubTab === 'accessControl' ? 'text-[#4F46E5]' : 'text-[#64748B]'}`} />
            <span>Quyền truy cập &amp; Tài khoản</span>
          </button>
        )}

        <button
          onClick={() => setActiveSubTab('catalogs')}
          className={`px-3.5 py-2 text-sm whitespace-nowrap rounded-lg transition-colors flex items-center gap-2 border-b-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:outline-hidden ${
            activeSubTab === 'catalogs'
              ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold border-[#4F46E5] shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] font-medium border-transparent'
          }`}
        >
          <Layers className={`w-4 h-4 shrink-0 ${activeSubTab === 'catalogs' ? 'text-[#4F46E5]' : 'text-[#64748B]'}`} />
          <span>Sản phẩm & Loại việc</span>
        </button>

        <button
          onClick={() => setActiveSubTab('scores')}
          className={`px-3.5 py-2 text-sm whitespace-nowrap rounded-lg transition-colors flex items-center gap-2 border-b-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:outline-hidden ${
            activeSubTab === 'scores'
              ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold border-[#4F46E5] shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] font-medium border-transparent'
          }`}
        >
          <CheckCircle2 className={`w-4 h-4 shrink-0 ${activeSubTab === 'scores' ? 'text-[#4F46E5]' : 'text-[#64748B]'}`} />
          <span>Bảng Điểm Tham Chiếu</span>
        </button>

        <button
          onClick={() => setActiveSubTab('packageConfig')}
          className={`px-3.5 py-2 text-sm whitespace-nowrap rounded-lg transition-colors flex items-center gap-2 border-b-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:outline-hidden ${
            activeSubTab === 'packageConfig'
              ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold border-[#4F46E5] shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] font-medium border-transparent'
          }`}
        >
          <Package className={`w-4 h-4 shrink-0 ${activeSubTab === 'packageConfig' ? 'text-[#4F46E5]' : 'text-[#64748B]'}`} />
          <span>Cấu hình KH & Gói tiếp nhận</span>
        </button>

        <button
          onClick={() => setActiveSubTab('trainingModules')}
          className={`px-3.5 py-2 text-sm whitespace-nowrap rounded-lg transition-colors flex items-center gap-2 border-b-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:outline-hidden ${
            activeSubTab === 'trainingModules'
              ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold border-[#4F46E5] shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] font-medium border-transparent'
          }`}
        >
          <Calendar className={`w-4 h-4 shrink-0 ${activeSubTab === 'trainingModules' ? 'text-[#4F46E5]' : 'text-[#64748B]'}`} />
          <span>Module Đào tạo tập trung</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            activeSubTab === 'trainingModules' ? 'bg-[#E0E7FF] text-[#4F46E5]' : 'bg-slate-100 text-slate-600'
          }`}>
            {trainingModules.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('recurringTraining')}
          className={`px-3.5 py-2 text-sm whitespace-nowrap rounded-lg transition-colors flex items-center gap-2 border-b-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:outline-hidden ${
            activeSubTab === 'recurringTraining'
              ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold border-[#4F46E5] shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] font-medium border-transparent'
          }`}
        >
          <Clock className={`w-4 h-4 shrink-0 ${activeSubTab === 'recurringTraining' ? 'text-[#4F46E5]' : 'text-[#64748B]'}`} />
          <span>Lịch đào tạo định kỳ</span>
          <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${
            activeSubTab === 'recurringTraining' ? 'bg-[#E0E7FF] text-[#4F46E5]' : 'bg-slate-100 text-slate-600'
          }`}>
            {recurringSchedules.length}
          </span>
        </button>

        <button
          onClick={() => setActiveSubTab('backups')}
          className={`px-3.5 py-2 text-sm whitespace-nowrap rounded-lg transition-colors flex items-center gap-2 border-b-2 cursor-pointer focus-visible:ring-2 focus-visible:ring-[#4F46E5] focus-visible:outline-hidden ${
            activeSubTab === 'backups'
              ? 'bg-[#EEF2FF] text-[#4F46E5] font-semibold border-[#4F46E5] shadow-xs'
              : 'text-[#64748B] hover:text-[#0F172A] hover:bg-[#F1F5F9] font-medium border-transparent'
          }`}
        >
          <HardDrive className={`w-4 h-4 shrink-0 ${activeSubTab === 'backups' ? 'text-[#4F46E5]' : 'text-[#64748B]'}`} />
          <span>Sao lưu, Xuất &amp; Khôi phục</span>
        </button>
      </div>

      {/* 1. GROUPS MANAGEMENT SUBTAB */}
      {activeSubTab === 'groups' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <FolderTree className="w-4.5 h-4.5 text-blue-600" />
                Quản lý danh mục nhóm làm việc
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Các tab nhóm trong phân hệ Lịch công việc và Điều phối công việc được tạo động từ đây. Đổi tên nhóm bảo toàn toàn bộ lịch làm việc và KPI.
              </p>
            </div>
            <button
              onClick={handleOpenCreateGroup}
              className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm nhóm mới</span>
            </button>
          </div>

          <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl text-sm text-slate-700 space-y-2">
            <div className="font-semibold text-slate-900 flex items-center gap-2 text-sm">
              <Info className="w-4 h-4 text-blue-600 shrink-0" />
              <span>Quy tắc quản lý nhóm bảo toàn dữ liệu:</span>
            </div>
            <ul className="list-disc pl-5 space-y-1 text-xs sm:text-sm text-slate-700 leading-relaxed">
              <li>Nhóm được liên kết bằng mã định danh nội bộ (<strong>id</strong>), không dùng tên nhóm làm khóa.</li>
              <li>Đổi tên nhóm không làm mất lịch làm việc và không làm mất KPI đã ghi nhận.</li>
              <li>Nhóm đã có nhân viên hoặc lịch chỉ được phép <strong>Ngừng sử dụng</strong>, không được xóa để bảo vệ lịch sử dữ liệu.</li>
              <li>Chuyển nhân viên sang nhóm khác sẽ tự động lưu lịch sử chuyển nhóm và không làm thay đổi phân loại lịch cũ.</li>
            </ul>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold text-xs">
                  <th className="py-3 px-3.5 w-20 text-center min-w-[75px]">Thứ tự</th>
                  <th className="py-3 px-3.5 min-w-[150px]">Tên nhóm</th>
                  <th className="py-3 px-3.5 min-w-[120px]">Mã nhóm</th>
                  <th className="py-3 px-3.5 text-center min-w-[110px]">Số nhân sự</th>
                  <th className="py-3 px-3.5 min-w-[140px]">Trạng thái</th>
                  <th className="py-3 px-3.5 min-w-[200px]">Mô tả</th>
                  <th className="py-3 px-3.5 text-right min-w-[160px]">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {[...groups].sort((a, b) => a.order - b.order).map(grp => {
                  const memberCount = members.filter(m => (m.groupId && m.groupId === grp.id) || m.currentGroup === grp.name).length;

                  return (
                    <tr key={grp.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3.5 text-center font-semibold text-slate-700 text-sm">
                        {grp.order}
                      </td>
                      <td className="py-3 px-3.5 font-semibold text-slate-900 text-sm">
                        <div className="flex items-center gap-2">
                          <span>{grp.name}</span>
                          {!grp.isActive && (
                            <span className="text-[11px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-normal">
                              Ngừng sử dụng
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-3 px-3.5 font-normal text-slate-600 text-sm">
                        {grp.code}
                      </td>
                      <td className="py-3 px-3.5 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedGroupFilter(grp.id);
                            setActiveSubTab('members');
                          }}
                          className="font-medium text-sm text-blue-700 hover:text-blue-900 hover:underline cursor-pointer transition-colors"
                          title={`Xem ${memberCount} nhân sự thuộc ${grp.name}`}
                        >
                          {memberCount} người
                        </button>
                      </td>
                      <td className="py-3 px-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                          grp.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                            : 'bg-amber-50 text-amber-700 border border-amber-200/80'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${grp.isActive ? 'bg-emerald-600' : 'bg-amber-500'}`}></span>
                          {grp.isActive ? 'Đang hoạt động' : 'Ngừng sử dụng'}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-slate-600 text-sm max-w-xs truncate font-normal">
                        {grp.description || '—'}
                      </td>
                      <td className="py-3 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleToggleGroupActive(grp)}
                            className={`px-2.5 py-1.5 text-xs rounded-md font-medium transition-colors border cursor-pointer ${
                              grp.isActive
                                ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200/80'
                                : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200/80'
                            }`}
                            title={grp.isActive ? 'Tạm ngừng sử dụng nhóm này' : 'Kích hoạt lại nhóm này'}
                          >
                            {grp.isActive ? 'Ngừng sử dụng' : 'Kích hoạt'}
                          </button>

                          <button
                            onClick={() => handleOpenEditGroup(grp)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500"
                            title="Chỉnh sửa"
                            aria-label="Chỉnh sửa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>

                          <button
                            onClick={() => handleDeleteGroupCheck(grp)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-500"
                            title="Xóa"
                            aria-label="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 2. MEMBERS MANAGEMENT SUBTAB */}
      {activeSubTab === 'members' && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-slate-900 flex items-center gap-2">
                <Users className="w-4.5 h-4.5 text-blue-600" />
                Danh sách nhân sự phòng ONB
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Nhân sự được gán vào nhóm theo Thiết lập hệ thống. Lịch công việc và điều phối công việc tự động đồng bộ theo thông tin này.
              </p>
            </div>

            <div className="flex items-center gap-2.5 flex-wrap">
              {/* Group Filter */}
              <select
                value={selectedGroupFilter}
                onChange={e => setSelectedGroupFilter(e.target.value)}
                className="border border-slate-300 rounded-lg px-3 py-1.5 text-sm bg-white font-medium text-slate-700 focus:outline-hidden focus:border-blue-500 cursor-pointer"
              >
                <option value="ALL">Tất cả nhóm ({members.length} nhân sự)</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>
                    {g.name} {!g.isActive ? '(Ngừng SD)' : ''}
                  </option>
                ))}
              </select>

              <button
                onClick={handleOpenCreateMember}
                className="px-4 py-2 text-sm font-semibold text-white bg-blue-600 hover:bg-blue-700 rounded-lg shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500"
              >
                <Plus className="w-4 h-4" />
                <span>Thêm nhân sự</span>
              </button>
            </div>
          </div>

          <div className="overflow-x-auto border border-slate-200 rounded-lg">
            <table className="w-full text-left border-collapse text-sm">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-700 font-semibold text-xs">
                  <th className="py-3 px-3.5 min-w-[100px]">Mã ONB</th>
                  <th className="py-3 px-3.5 min-w-[160px]">Họ và tên</th>
                  <th className="py-3 px-3.5 min-w-[180px]">Email liên kết</th>
                  <th className="py-3 px-3.5 min-w-[130px]">Nhóm trực thuộc</th>
                  <th className="py-3 px-3.5 min-w-[130px]">Trạng thái</th>
                  <th className="py-3 px-3.5 min-w-[120px]">Phân bổ đào tạo</th>
                  <th className="py-3 px-3.5 min-w-[180px]">Module đã học</th>
                  <th className="py-3 px-3.5 text-right min-w-[160px]">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredMembers.map(m => {
                  const grp = groups.find(g => (m.groupId && g.id === m.groupId) || g.name === m.currentGroup);
                  const groupName = grp?.name || m.currentGroup;

                  return (
                    <tr key={m.code} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-3.5 font-normal text-slate-700 text-sm">{m.code}</td>
                      <td className="py-3 px-3.5 font-semibold text-slate-900 text-sm">{m.fullName}</td>
                      <td className="py-3 px-3.5 text-slate-600 text-sm font-normal">{m.email}</td>
                      <td className="py-3 px-3.5">
                        <span className="bg-blue-50 text-blue-800 border border-blue-200/80 px-2.5 py-0.5 rounded-md font-semibold text-xs inline-block">
                          {groupName}
                        </span>
                      </td>
                      <td className="py-3 px-3.5">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium ${
                          m.isActive
                            ? 'bg-emerald-50 text-emerald-700 border border-emerald-200/80'
                            : 'bg-amber-50 text-amber-700 border border-amber-200/80'
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${m.isActive ? 'bg-emerald-600' : 'bg-amber-500'}`}></span>
                          {m.isActive ? 'Đang hoạt động' : 'Ngừng sử dụng'}
                        </span>
                      </td>
                      <td className="py-3 px-3.5 text-slate-700 text-sm">
                        {m.participateRandom ? 'Tham gia' : 'Bỏ qua'}
                      </td>
                      <td className="py-3 px-3.5 text-slate-600 text-sm max-w-xs truncate font-normal">
                        {m.completedProducts?.join(', ') || 'Chưa cập nhật'}
                      </td>
                      <td className="py-3 px-3.5 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleToggleMemberActive(m)}
                            className={`px-2.5 py-1.5 text-xs rounded-md font-medium transition-colors border cursor-pointer ${
                              m.isActive
                                ? 'text-amber-800 bg-amber-50 hover:bg-amber-100 border-amber-200/80'
                                : 'text-emerald-800 bg-emerald-50 hover:bg-emerald-100 border-emerald-200/80'
                            }`}
                            title={m.isActive ? 'Ngưng sử dụng nhân sự này' : 'Kích hoạt lại nhân sự này'}
                          >
                            {m.isActive ? 'Ngừng sử dụng' : 'Kích hoạt'}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleOpenEditMember(m)}
                            className="p-1.5 text-slate-500 hover:text-slate-800 hover:bg-slate-100 rounded-md transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-blue-500"
                            title="Chỉnh sửa"
                            aria-label="Chỉnh sửa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteMemberCheck(m)}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer focus-visible:ring-2 focus-visible:ring-rose-500"
                            title="Xóa"
                            aria-label="Xóa"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 3. PERMISSIONS SUBTAB */}
      {activeSubTab === 'permissions' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs p-5 space-y-5">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">
              Chỉ Định Quyền Nhập Thưởng & Quyền Phân Bổ Đào Tạo
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Theo quy định: Quản trị viên chính và tối đa 2 người được chỉ định được nhập thưởng.
              Quản trị viên chính và tối đa 2 người được chỉ định được chạy phân bổ đào tạo.
              Hai quyền này độc lập và được kiểm tra nghiêm ngặt tại máy chủ.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
            {/* Bonus Managers */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
              <span className="font-semibold text-xs text-slate-800 block">
                2 Nhân sự được cấp quyền nhập/sửa Khoản thưởng:
              </span>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Người chỉ định 1</label>
                <select
                  value={bonusManager1}
                  onChange={e => setBonusManager1(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-2 bg-white text-xs"
                >
                  <option value="">-- Không chỉ định --</option>
                  {members.map(m => (
                    <option key={m.code} value={m.code}>
                      {m.fullName} ({m.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Người chỉ định 2</label>
                <select
                  value={bonusManager2}
                  onChange={e => setBonusManager2(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-2 bg-white text-xs"
                >
                  <option value="">-- Không chỉ định --</option>
                  {members.map(m => (
                    <option key={m.code} value={m.code}>
                      {m.fullName} ({m.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Allocation Managers */}
            <div className="p-4 bg-slate-50 rounded-lg border border-slate-200 space-y-3">
              <span className="font-semibold text-xs text-slate-800 block">
                2 Nhân sự được cấp quyền Random Phân bổ đào tạo:
              </span>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Người chỉ định 1</label>
                <select
                  value={allocManager1}
                  onChange={e => setAllocManager1(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-2 bg-white text-xs"
                >
                  <option value="">-- Không chỉ định --</option>
                  {members.map(m => (
                    <option key={m.code} value={m.code}>
                      {m.fullName} ({m.code})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-[11px] text-slate-500 mb-1">Người chỉ định 2</label>
                <select
                  value={allocManager2}
                  onChange={e => setAllocManager2(e.target.value)}
                  className="w-full border border-slate-300 rounded-md p-2 bg-white text-xs"
                >
                  <option value="">-- Không chỉ định --</option>
                  {members.map(m => (
                    <option key={m.code} value={m.code}>
                      {m.fullName} ({m.code})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <div>
              {permissionMsg && (
                <div className={`text-xs font-medium flex items-center gap-1.5 ${permissionMsg.type === 'success' ? 'text-emerald-700' : 'text-rose-700'}`}>
                  {permissionMsg.type === 'success' ? <Check className="w-4 h-4 text-emerald-600" /> : <AlertCircle className="w-4 h-4 text-rose-600" />}
                  <span>{permissionMsg.text}</span>
                </div>
              )}
            </div>
            <button
              onClick={handleSavePermissions}
              className="px-4 py-2 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white font-semibold text-xs rounded-lg shadow-xs cursor-pointer transition-colors"
            >
              Lưu cấu hình phân quyền
            </button>
          </div>
        </div>
      )}

      {/* ACCESS CONTROL SUBTAB */}
      {activeSubTab === 'accessControl' && (
        <AccessControlSubTab
          session={session}
          members={members}
        />
      )}

      {/* 4. CATALOGS SUBTAB */}
      {activeSubTab === 'catalogs' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Products */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Danh Mục Sản Phẩm / Module</h4>
                <p className="text-[11px] text-slate-500">Quản lý các sản phẩm, module phục vụ chấm điểm và phân bổ</p>
              </div>
              <button
                type="button"
                onClick={handleOpenCreateProduct}
                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Thêm sản phẩm</span>
              </button>
            </div>
            <div className="divide-y divide-slate-100 text-xs max-h-96 overflow-y-auto">
              {products.map(p => (
                <div key={p.id || p.code} className={`py-2.5 flex items-center justify-between gap-2 ${!p.isActive ? 'opacity-60 bg-slate-50/50' : ''}`}>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{p.code}</span>
                      <span className="font-medium text-slate-800 text-xs truncate">{p.name}</span>
                      {!p.isActive && (
                        <span className="text-[9px] bg-rose-50 text-rose-700 border border-rose-200 font-semibold px-1 rounded">
                          Ngừng SD
                        </span>
                      )}
                    </div>
                    <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2">
                      <span className="text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.2 rounded">
                        {p.category}
                      </span>
                      {p.description && <span className="truncate max-w-xs">{p.description}</span>}
                    </div>
                  </div>

                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={() => handleToggleProductActive(p)}
                      className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${
                        p.isActive
                          ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                          : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                      }`}
                      title={p.isActive ? 'Ngưng sử dụng sản phẩm này' : 'Kích hoạt lại sản phẩm này'}
                    >
                      {p.isActive ? 'Ngừng SD' : 'Kích hoạt'}
                    </button>
                    <button
                      type="button"
                      onClick={() => handleOpenEditProduct(p)}
                      className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-slate-100 rounded transition-colors"
                      title="Sửa thông tin / Mã sản phẩm"
                    >
                      <Edit2 className="w-3.5 h-3.5" />
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDeleteProductClick(p)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                      title="Xóa vĩnh viễn (chỉ được xóa khi chưa có dữ liệu phát sinh)"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Work Types (Quản lý toàn diện loại công việc & quy tắc điểm) */}
          <div className="bg-white p-5 rounded-lg border border-slate-200 shadow-2xs space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-semibold text-slate-900">Loại Hình Công Việc & Quy Tắc Điểm</h4>
                <p className="text-[11px] text-slate-500">Nguồn quản lý duy nhất · Tự động đồng bộ sang Tiến độ thực hiện</p>
              </div>
              <button
                type="button"
                onClick={handleOpenCreateWorkType}
                className="px-2.5 py-1.5 bg-blue-600 hover:bg-blue-700 text-white rounded text-xs font-semibold flex items-center gap-1 shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Thêm loại việc</span>
              </button>
            </div>

            <div className="divide-y divide-slate-100 text-xs max-h-96 overflow-y-auto">
              {workTypes.map((wt) => {
                const ref = referenceScores.find(rs => rs.workTypeCode === wt.code);
                const scoreDisplay = wt.calculationMethod === 'AMOUNT_DIVIDE'
                  ? `Quy đổi: ${(wt.conversionRate || ref?.conversionRate || 5000000).toLocaleString('vi-VN')} đ = 1đ`
                  : `Định mức: ${wt.defaultScorePerUnit ?? ref?.suggestedScore ?? 10} đ/${wt.unit || 'Buổi'}`;

                return (
                  <div key={wt.id || wt.code} className={`py-2.5 flex items-center justify-between gap-2 ${!wt.isActive ? 'opacity-60 bg-slate-50/50' : ''}`}>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-slate-900 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{wt.code}</span>
                        <span className="font-medium text-slate-800 text-xs truncate">{wt.name}</span>
                        {!wt.isActive && (
                          <span className="text-[9px] bg-rose-50 text-rose-700 border border-rose-200 font-semibold px-1 rounded">
                            Ngừng SD
                          </span>
                        )}
                        {wt.isTraining && (
                          <span className="text-[9px] bg-blue-50 text-blue-700 px-1 rounded font-medium">
                            Đào tạo
                          </span>
                        )}
                      </div>
                      <div className="text-[11px] text-slate-500 mt-1 flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-medium text-amber-800 bg-amber-50 px-1 rounded">
                          Đơn vị: {wt.unit || 'Buổi'}
                        </span>
                        <span className="font-mono text-emerald-700 bg-emerald-50 px-1 rounded font-semibold">
                          {scoreDisplay}
                        </span>
                        {wt.order !== undefined && (
                          <span className="text-[10px] text-slate-400">Thứ tự: {wt.order}</span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => handleOpenEditWorkType(wt)}
                        className="p-1.5 text-slate-500 hover:text-blue-700 hover:bg-slate-100 rounded transition-colors"
                        title="Sửa cấu hình loại việc"
                      >
                        <Edit2 className="w-3.5 h-3.5" />
                      </button>

                      <button
                        type="button"
                        onClick={() => handleToggleWorkTypeActive(wt)}
                        className={`p-1.5 rounded transition-colors ${
                          wt.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'
                        }`}
                        title={wt.isActive ? 'Ngừng sử dụng loại việc này' : 'Kích hoạt lại loại việc này'}
                      >
                        {wt.isActive ? <ToggleRight className="w-4 h-4" /> : <ToggleLeft className="w-4 h-4" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteWorkTypeCheck(wt)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors"
                        title="Xóa vĩnh viễn (chỉ được xóa khi chưa có dữ liệu)"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* 5. REFERENCE SCORES SUBTAB */}
      {activeSubTab === 'scores' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                Bảng Điểm Tham Chiếu (Thay thế VLOOKUP)
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cung cấp điểm gợi ý chuẩn và tỷ lệ quy đổi KPI. Chỉnh sửa bảo toàn toàn bộ dữ liệu lịch sử.
              </p>
            </div>
            <button
              type="button"
              onClick={handleOpenCreateScore}
              className="px-3 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs cursor-pointer transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              <span>+ Thêm điểm tham chiếu</span>
            </button>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-3">Loại công việc</th>
                  <th className="py-2.5 px-3">Sản phẩm áp dụng</th>
                  <th className="py-2.5 px-3">Điểm gợi ý</th>
                  <th className="py-2.5 px-3">Quy đổi VNĐ</th>
                  <th className="py-2.5 px-3">Hiệu lực từ</th>
                  <th className="py-2.5 px-3">Trạng thái</th>
                  <th className="py-2.5 px-3">Mô tả</th>
                  <th className="py-2.5 px-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {referenceScores.map(rs => (
                  <tr key={rs.id} className={`hover:bg-slate-50 ${rs.isActive === false ? 'opacity-60 bg-slate-50/50' : ''}`}>
                    <td className="py-2.5 px-3">
                      <div className="font-mono font-bold text-slate-900">{rs.workTypeCode}</div>
                      {workTypes.find(w => w.code === rs.workTypeCode)?.name && (
                        <div className="text-[11px] text-slate-500 font-normal truncate max-w-[160px]">
                          {workTypes.find(w => w.code === rs.workTypeCode)?.name}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3">
                      <div className="font-mono text-slate-700 font-medium">{rs.productCode || 'Tất cả sản phẩm'}</div>
                      {rs.productCode && products.find(p => p.code === rs.productCode)?.name && (
                        <div className="text-[11px] text-slate-500 font-normal truncate max-w-[160px]">
                          {products.find(p => p.code === rs.productCode)?.name}
                        </div>
                      )}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-bold text-blue-900">{rs.suggestedScore} điểm</td>
                    <td className="py-2.5 px-3 font-mono text-emerald-700">
                      {rs.conversionRate ? `${rs.conversionRate.toLocaleString('vi-VN')} đ/điểm` : '—'}
                    </td>
                    <td className="py-2.5 px-3 font-mono text-slate-500">
                      <div>{rs.effectiveFrom}</div>
                      {rs.effectiveTo && <div className="text-[10px] text-slate-400">đến {rs.effectiveTo}</div>}
                    </td>
                    <td className="py-2.5 px-3">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-xs font-medium text-[11px] ${
                        rs.isActive !== false
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        <span className={`w-1.5 h-1.5 rounded-full ${rs.isActive !== false ? 'bg-emerald-600' : 'bg-slate-400'}`}></span>
                        {rs.isActive !== false ? 'Đang dùng' : 'Ngừng dùng'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-600 max-w-xs truncate">{rs.description || '—'}</td>
                    <td className="py-2.5 px-3 text-right">
                      <div className="flex items-center justify-end gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleToggleScoreActive(rs)}
                          className={`px-2 py-0.5 text-[11px] rounded font-medium transition-colors ${
                            rs.isActive !== false
                              ? 'text-amber-700 bg-amber-50 hover:bg-amber-100'
                              : 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100'
                          }`}
                          title={rs.isActive !== false ? 'Ngưng sử dụng quy tắc điểm này' : 'Kích hoạt lại'}
                        >
                          {rs.isActive !== false ? 'Ngừng SD' : 'Kích hoạt'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleOpenEditScore(rs)}
                          className="p-1 text-slate-400 hover:text-slate-800"
                          title="Sửa điểm tham chiếu"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteScoreClick(rs)}
                          className="p-1 text-slate-400 hover:text-rose-600"
                          title="Xóa điểm tham chiếu (chỉ khi chưa có dữ liệu)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 6. PACKAGE & CUSTOMER CORE CONFIG SUBTAB (Section 7) */}
      {activeSubTab === 'packageConfig' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs p-5 space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-200 pb-4">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Package className="w-4 h-4 text-indigo-600" />
                Cấu Hình Phân Hệ KH & Gói Tiếp Nhận Trong Core
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Core là nguồn duy nhất quản lý định mức điểm tiếp nhận, nguồn, hạng KH, loại hình và mức cộng Leader số nền tảng.
              </p>
            </div>
            <button
              onClick={handleSavePackageCoreConfig}
              disabled={isSavingPkgConfig}
              className="px-4 py-2 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-md transition-colors flex items-center gap-1.5 shadow-2xs disabled:opacity-50"
            >
              <Save className="w-3.5 h-3.5" />
              <span>{isSavingPkgConfig ? 'Đang lưu vào Core...' : 'Lưu toàn bộ cấu hình KH & Gói'}</span>
            </button>
          </div>

          {pkgConfigMsg && (
            <div className="p-3 bg-emerald-50 border border-emerald-200 text-emerald-800 rounded-md text-xs flex items-center gap-2">
              <Check className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{pkgConfigMsg}</span>
            </div>
          )}

          <div className="p-3.5 bg-indigo-50/70 border border-indigo-200/80 rounded-md text-xs text-indigo-900 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
              Quy tắc quản lý cấu hình và bảo toàn lịch sử:
            </div>
            <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-indigo-800">
              <li><strong>Nguồn tiếp nhận:</strong> Liên kết bằng mã nguồn ổn định. Đổi tên nguồn sẽ tự cập nhật hiển thị cả trên các bản ghi tháng cũ nhưng không đổi điểm hoặc tính lại KPI (Mục 4.5).</li>
              <li><strong>Nguồn không tính điểm:</strong> Nguồn có thuộc tính "Không tính điểm tiếp nhận" tự động gợi ý 0đ và không cộng Leader (Mục 4.5 & 8.1).</li>
              <li><strong>Thay đổi mức điểm Core:</strong> Chỉ áp dụng cho các gói mới tạo sau này; không tự động sửa điểm của các gói đã ghi nhận trong lịch sử (Mục 7.1).</li>
              <li><strong>Module tiếp nhận:</strong> Lưu snapshot tên và mã tại thời điểm ghi nhận; module đã phát sinh dữ liệu chỉ chuyển sang ngừng sử dụng, không xóa mất liên kết (Mục 5.1).</li>
            </ul>
          </div>

          {/* 1. NGUỒN TIẾP NHẬN (SOURCES) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>1. Danh mục Nguồn tiếp nhận & Thuộc tính tính điểm ({localPkgConfig.sources?.length || 0})</span>
              </h4>
              <button
                type="button"
                onClick={() => {
                  const newSrc = {
                    id: `src_${Date.now()}`,
                    code: `SRC_CUSTOM_${Date.now().toString().slice(-4)}`,
                    name: 'Nguồn mới',
                    isNonScoring: false,
                    isActive: true,
                    order: (localPkgConfig.sources?.length || 0) + 1
                  };
                  setLocalPkgConfig({
                    ...localPkgConfig,
                    sources: [...(localPkgConfig.sources || []), newSrc]
                  });
                }}
                className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Thêm nguồn
              </button>
            </div>

            <div className="border border-slate-200 rounded-md overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                    <th className="py-2 px-3 w-12 text-center">STT</th>
                    <th className="py-2 px-3">Mã nguồn</th>
                    <th className="py-2 px-3">Tên hiển thị nguồn</th>
                    <th className="py-2 px-3 text-center">Tính điểm tiếp nhận</th>
                    <th className="py-2 px-3 text-center">Trạng thái</th>
                    <th className="py-2 px-3 text-right">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {localPkgConfig.sources?.map((src, idx) => (
                    <tr key={src.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={src.code}
                          onChange={e => {
                            const newCode = e.target.value.toUpperCase();
                            setLocalPkgConfig({
                              ...localPkgConfig,
                              sources: localPkgConfig.sources.map(s => s.id === src.id ? { ...s, code: newCode } : s)
                            });
                          }}
                          className="w-36 px-2 py-1 text-xs font-mono font-semibold border border-slate-200 rounded bg-white text-slate-800 uppercase"
                        />
                      </td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={src.name}
                          onChange={e => {
                            const newName = e.target.value;
                            setLocalPkgConfig({
                              ...localPkgConfig,
                              sources: localPkgConfig.sources.map(s => s.id === src.id ? { ...s, name: newName } : s)
                            });
                          }}
                          className="w-full max-w-xs px-2 py-1 text-xs border border-slate-200 rounded bg-white font-medium"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setLocalPkgConfig({
                              ...localPkgConfig,
                              sources: localPkgConfig.sources.map(s => s.id === src.id ? { ...s, isNonScoring: !s.isNonScoring } : s)
                            });
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-semibold transition-colors ${
                            src.isNonScoring
                              ? 'bg-amber-100 text-amber-800 hover:bg-amber-200'
                              : 'bg-emerald-100 text-emerald-800 hover:bg-emerald-200'
                          }`}
                        >
                          {src.isNonScoring ? 'Không tính điểm (0đ)' : 'Có tính điểm'}
                        </button>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setLocalPkgConfig({
                              ...localPkgConfig,
                              sources: localPkgConfig.sources.map(s => s.id === src.id ? { ...s, isActive: !s.isActive } : s)
                            });
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            src.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {src.isActive ? 'Đang dùng' : 'Ngừng dùng'}
                        </button>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <button
                          type="button"
                          onClick={() => handleDeletePackageConfigItem('sources', src)}
                          className="p-1 text-slate-400 hover:text-rose-600 rounded transition-colors"
                          title="Xóa nguồn (chỉ khi chưa có gói tiếp nhận phát sinh)"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 2. PHÂN HẠNG KHÁCH HÀNG & MỨC ĐIỂM (CUSTOMER TIERS) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              2. Phân hạng khách hàng & Điểm tiếp nhận tham chiếu (Mục 4.7)
            </h4>
            <div className="border border-slate-200 rounded-md overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                    <th className="py-2 px-3">Tên phân hạng</th>
                    <th className="py-2 px-3">Mã hạng</th>
                    <th className="py-2 px-3 text-right">Mức điểm tham chiếu (KPI)</th>
                    <th className="py-2 px-3 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {localPkgConfig.customerTiers?.map(tier => (
                    <tr key={tier.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-slate-900">{tier.name}</td>
                      <td className="py-2 px-3 font-mono text-slate-600">{tier.code}</td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={tier.score}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            setLocalPkgConfig({
                              ...localPkgConfig,
                              customerTiers: localPkgConfig.customerTiers.map(t => t.id === tier.id ? { ...t, score: val } : t)
                            });
                          }}
                          className="w-20 px-2 py-1 text-right text-xs font-mono font-bold border border-slate-200 rounded bg-white text-indigo-700"
                        />
                        <span className="ml-1 text-slate-500">điểm</span>
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                          tier.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {tier.isActive ? 'Hiệu lực' : 'Tạm dừng'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 3. LOẠI HÌNH TIẾP NHẬN (WORK TYPES) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
              3. Loại hình tiếp nhận & Quy tắc tính điểm cơ bản (Mục 4.8 & 8.2)
            </h4>
            <div className="border border-slate-200 rounded-md overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                    <th className="py-2 px-3">Tên loại hình</th>
                    <th className="py-2 px-3">Mã loại hình</th>
                    <th className="py-2 px-3">Cách tính điểm cơ bản</th>
                    <th className="py-2 px-3 text-right">Điểm cơ bản cố định</th>
                    <th className="py-2 px-3 text-center">Cho phép cộng Leader</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {localPkgConfig.workTypes?.map(wt => (
                    <tr key={wt.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold text-slate-900">{wt.name}</td>
                      <td className="py-2 px-3 font-mono text-slate-600">{wt.code}</td>
                      <td className="py-2 px-3 text-slate-700">
                        {wt.useCustomerTier ? 'Lấy theo phân hạng khách hàng (BASIC/BRONZE/SILVER/GOLD)' : 'Cố định theo Core'}
                      </td>
                      <td className="py-2 px-3 text-right">
                        {!wt.useCustomerTier ? (
                          <div className="inline-flex items-center gap-1">
                            <input
                              type="number"
                              step="0.5"
                              min="0"
                              value={wt.baseScore || 0}
                              onChange={e => {
                                const val = parseFloat(e.target.value) || 0;
                                setLocalPkgConfig({
                                  ...localPkgConfig,
                                  workTypes: localPkgConfig.workTypes.map(w => w.id === wt.id ? { ...w, baseScore: val } : w)
                                });
                              }}
                              className="w-16 px-2 py-1 text-right text-xs font-mono font-bold border border-slate-200 rounded bg-white text-indigo-700"
                            />
                            <span className="text-slate-500">đ</span>
                          </div>
                        ) : (
                          <span className="text-slate-400 italic">Theo hạng KH</span>
                        )}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded text-[11px] font-semibold ${
                          wt.allowLeader ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-100 text-slate-500'
                        }`}>
                          {wt.allowLeader ? 'Được cộng Leader' : 'Không cộng Leader'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 4. LEADER SỐ NỀN TẢNG (LEADER PLATFORMS) */}
          <div className="space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
              <Award className="w-4 h-4 text-amber-600" />
              <span>4. Bảng tra cứu điểm bổ sung Leader số nền tảng (Mục 6.1)</span>
            </h4>
            <div className="border border-slate-200 rounded-md overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                    <th className="py-2 px-3">Số nền tảng</th>
                    <th className="py-2 px-3 text-right">Điểm cộng Leader (KPI)</th>
                    <th className="py-2 px-3">Diễn giải áp dụng</th>
                    <th className="py-2 px-3 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {localPkgConfig.leaderPlatforms?.map(lp => (
                    <tr key={lp.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 font-bold font-mono text-slate-900">
                        {lp.platforms >= 5 ? 'Từ 5 nền tảng trở lên' : `${lp.platforms} nền tảng`}
                      </td>
                      <td className="py-2 px-3 text-right">
                        <input
                          type="number"
                          step="0.5"
                          min="0"
                          value={lp.score}
                          onChange={e => {
                            const val = parseFloat(e.target.value) || 0;
                            setLocalPkgConfig({
                              ...localPkgConfig,
                              leaderPlatforms: localPkgConfig.leaderPlatforms.map(p => p.id === lp.id ? { ...p, score: val } : p)
                            });
                          }}
                          className="w-16 px-2 py-1 text-right text-xs font-mono font-bold border border-slate-200 rounded bg-white text-amber-700"
                        />
                        <span className="ml-1 text-slate-500">điểm</span>
                      </td>
                      <td className="py-2 px-3 text-slate-600">
                        {lp.platforms === 2 && 'Cộng 4 điểm bổ sung vào dòng khai báo Leader duy nhất'}
                        {lp.platforms === 3 && 'Cộng 6 điểm bổ sung vào dòng khai báo Leader duy nhất'}
                        {lp.platforms === 4 && 'Cộng 8 điểm bổ sung vào dòng khai báo Leader duy nhất'}
                        {lp.platforms >= 5 && 'Cộng 10 điểm bổ sung cho từ 5 nền tảng trở lên'}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-emerald-50 text-emerald-700">
                          Hiệu lực
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* 5. MODULE TIẾP NHẬN (MODULES) */}
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">
                5. Danh mục Module tiếp nhận khởi tạo ({localPkgConfig.modules?.length || 0})
              </h4>
              <button
                type="button"
                onClick={() => {
                  const newMod = {
                    id: `mod_${Date.now()}`,
                    code: `MOD_CUSTOM_${Date.now().toString().slice(-4)}`,
                    name: 'Module mới',
                    isActive: true,
                    order: (localPkgConfig.modules?.length || 0) + 1
                  };
                  setLocalPkgConfig({
                    ...localPkgConfig,
                    modules: [...(localPkgConfig.modules || []), newMod]
                  });
                }}
                className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded font-medium flex items-center gap-1"
              >
                <Plus className="w-3 h-3" /> Thêm module
              </button>
            </div>

            <div className="border border-slate-200 rounded-md overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold text-[11px]">
                    <th className="py-2 px-3 w-12 text-center">STT</th>
                    <th className="py-2 px-3">Mã module</th>
                    <th className="py-2 px-3">Tên module tiếp nhận</th>
                    <th className="py-2 px-3 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {localPkgConfig.modules?.map((mod, idx) => (
                    <tr key={mod.id} className="hover:bg-slate-50">
                      <td className="py-2 px-3 text-center font-mono text-slate-500">{idx + 1}</td>
                      <td className="py-2 px-3 font-mono font-semibold text-slate-700">{mod.code}</td>
                      <td className="py-2 px-3">
                        <input
                          type="text"
                          value={mod.name}
                          onChange={e => {
                            const newName = e.target.value;
                            setLocalPkgConfig({
                              ...localPkgConfig,
                              modules: localPkgConfig.modules.map(m => m.id === mod.id ? { ...m, name: newName } : m)
                            });
                          }}
                          className="w-full max-w-xs px-2 py-1 text-xs border border-slate-200 rounded bg-white font-medium"
                        />
                      </td>
                      <td className="py-2 px-3 text-center">
                        <button
                          type="button"
                          onClick={() => {
                            setLocalPkgConfig({
                              ...localPkgConfig,
                              modules: localPkgConfig.modules.map(m => m.id === mod.id ? { ...m, isActive: !m.isActive } : m)
                            });
                          }}
                          className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                            mod.isActive ? 'bg-slate-100 text-slate-700' : 'bg-slate-200 text-slate-500'
                          }`}
                        >
                          {mod.isActive ? 'Đang dùng' : 'Ngừng dùng'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Group Create/Edit */}
      {isGroupModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-1.5">
                <FolderTree className="w-4 h-4 text-blue-600" />
                {editingGroup ? `Sửa Nhóm: ${editingGroup.name}` : 'Thêm Nhóm Mới'}
              </h3>
              <button onClick={() => setIsGroupModalOpen(false)} className="text-slate-400">✕</button>
            </div>

            {groupError && (
              <div className="p-2.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md">
                {groupError}
              </div>
            )}

            <form onSubmit={handleSubmitGroup} className="space-y-3 text-xs">
              <div>
                <label className="block font-medium text-slate-700 mb-1">Tên nhóm *</label>
                <input
                  type="text"
                  value={groupForm.name}
                  onChange={e => setGroupForm({ ...groupForm, name: e.target.value })}
                  placeholder="VD: Nhóm 1, Nhóm 2, Nhóm ERP, Nhóm Triển khai..."
                  className="w-full border border-slate-300 rounded-md p-2 font-medium"
                  required
                />
                <span className="text-[10px] text-slate-400 mt-0.5 block">
                  Đổi tên nhóm không làm mất dữ liệu lịch đã nhập.
                </span>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Mã nhóm (Code)</label>
                  <input
                    type="text"
                    value={groupForm.code}
                    onChange={e => setGroupForm({ ...groupForm, code: e.target.value.toUpperCase() })}
                    placeholder="VD: NHOM_1"
                    className="w-full border border-slate-300 rounded-md p-2 uppercase font-mono"
                  />
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Thứ tự hiển thị (Order) *</label>
                  <input
                    type="number"
                    min={1}
                    value={groupForm.order}
                    onChange={e => setGroupForm({ ...groupForm, order: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md p-2 font-mono"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Trạng thái sử dụng</label>
                <select
                  value={groupForm.isActive ? 'active' : 'inactive'}
                  onChange={e => setGroupForm({ ...groupForm, isActive: e.target.value === 'active' })}
                  className="w-full border border-slate-300 rounded-md p-2 bg-white"
                >
                  <option value="active">Đang hoạt động (Hiển thị tab Lịch)</option>
                  <option value="inactive">Ngừng sử dụng (Bảo lưu dữ liệu lịch sử)</option>
                </select>
              </div>

              <div>
                <label className="block font-medium text-slate-700 mb-1">Mô tả / Ghi chú</label>
                <textarea
                  rows={2}
                  value={groupForm.description}
                  onChange={e => setGroupForm({ ...groupForm, description: e.target.value })}
                  placeholder="Ghi chú về chức năng hoặc đặc thù của nhóm..."
                  className="w-full border border-slate-300 rounded-md p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsGroupModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white font-semibold text-xs rounded-lg shadow-xs cursor-pointer transition-colors"
                >
                  {editingGroup ? 'Lưu thay đổi' : 'Tạo nhóm'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Member Create/Edit */}
      {isMemberModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-slate-900 text-sm">
                {editingMember ? `Sửa Thông Tin: ${editingMember.fullName}` : 'Thêm Nhân Sự Mới'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsMemberModalOpen(false);
                  setEditingMember(null);
                  setMemberError('');
                }}
                className="text-slate-400 hover:text-slate-600"
              >
                ✕
              </button>
            </div>

            {memberError && (
              <div className="p-2.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md font-medium">
                {memberError}
              </div>
            )}

            <form onSubmit={handleSubmitMember} className="space-y-3 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Mã ONB duy nhất *</label>
                  <input
                    type="text"
                    value={memberForm.code}
                    onChange={e => setMemberForm({ ...memberForm, code: e.target.value.toUpperCase() })}
                    className="w-full border border-slate-300 rounded-md p-2 uppercase font-mono"
                    placeholder="VD: DTHANG, LIEM..."
                    required
                  />
                  {editingMember && (
                    <p className="text-[10px] text-slate-500 mt-1">
                      Cho phép đổi Mã ONB. Toàn bộ lịch sử, tiến độ, gói tiếp nhận và phân bổ sẽ tự động liên kết theo mã mới.
                    </p>
                  )}
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Họ và tên *</label>
                  <input
                    type="text"
                    value={memberForm.fullName}
                    onChange={e => setMemberForm({ ...memberForm, fullName: e.target.value })}
                    className="w-full border border-slate-300 rounded-md p-2"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Tên hiển thị / viết tắt</label>
                  <input
                    type="text"
                    value={memberForm.displayName}
                    onChange={e => setMemberForm({ ...memberForm, displayName: e.target.value })}
                    className="w-full border border-slate-300 rounded-md p-2"
                  />
                </div>
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Email liên kết *</label>
                  <input
                    type="email"
                    value={memberForm.email}
                    onChange={e => setMemberForm({ ...memberForm, email: e.target.value })}
                    className="w-full border border-slate-300 rounded-md p-2 font-mono"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-medium text-slate-700 mb-1">Nhóm trực thuộc *</label>
                  <select
                    value={memberForm.groupId}
                    onChange={e => {
                      const selG = groups.find(g => g.id === e.target.value);
                      setMemberForm({
                        ...memberForm,
                        groupId: e.target.value,
                        currentGroup: selG ? selG.name : memberForm.currentGroup
                      });
                    }}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white font-medium"
                    required
                  >
                    {groups.map(g => (
                      <option key={g.id} value={g.id}>
                        {g.name} {!g.isActive ? '(Ngừng SD)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-medium text-slate-700 mb-1">Trạng thái hoạt động</label>
                  <select
                    value={memberForm.isActive ? 'active' : 'inactive'}
                    onChange={e => setMemberForm({ ...memberForm, isActive: e.target.value === 'active' })}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white"
                  >
                    <option value="active">Đang hoạt động</option>
                    <option value="inactive">Ngừng hoạt động (Bảo lưu dữ liệu)</option>
                  </select>
                </div>
              </div>

              {/* Group Transfer History if exists */}
              {editingMember && editingMember.groupHistory && editingMember.groupHistory.length > 0 && (
                <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-md">
                  <span className="font-semibold text-slate-700 text-[11px] flex items-center gap-1 mb-1">
                    <Clock className="w-3 h-3 text-slate-500" /> Lịch sử luân chuyển nhóm:
                  </span>
                  <div className="space-y-1 text-[10px] text-slate-600 font-mono">
                    {editingMember.groupHistory.map((h, i) => (
                      <div key={i} className="flex items-center gap-2">
                        <span className="text-slate-400">{h.fromDate}:</span>
                        <span className="font-semibold text-slate-800">{h.group}</span>
                        {h.note && <span className="text-slate-500 font-sans">({h.note})</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div>
                <label className="block font-medium text-slate-700 mb-1">
                  Module sản phẩm đã học (cách nhau bằng dấu phẩy)
                </label>
                <input
                  type="text"
                  placeholder="CRM, HRM, Kế toán, Sản xuất..."
                  value={memberForm.completedProductsStr}
                  onChange={e => setMemberForm({ ...memberForm, completedProductsStr: e.target.value })}
                  className="w-full border border-slate-300 rounded-md p-2"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="chkRandom"
                  checked={memberForm.participateRandom}
                  onChange={e => setMemberForm({ ...memberForm, participateRandom: e.target.checked })}
                  className="rounded-xs text-blue-600"
                />
                <label htmlFor="chkRandom" className="text-slate-700 cursor-pointer">
                  Tham gia vào thuật toán phân bổ đào tạo tập trung
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsMemberModalOpen(false);
                    setEditingMember(null);
                    setMemberError('');
                  }}
                  className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white font-semibold text-xs rounded-lg cursor-pointer transition-colors shadow-xs"
                >
                  Lưu nhân sự
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Work Type Create/Edit (Core Quản lý loại công việc & quy tắc điểm) */}
      {isWorkTypeModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full max-h-[92vh] overflow-y-auto p-5 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                  <Tag className="w-4 h-4 text-blue-600" />
                  {editingWorkType ? `Sửa Loại Công Việc: ${editingWorkType.name}` : 'Thêm Loại Công Việc Mới'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cấu hình chuẩn trong Core · Đồng bộ sang bảng nhập điểm & biểu mẫu công việc
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsWorkTypeModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 p-1"
              >
                ✕
              </button>
            </div>

            {workTypeError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700 flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{workTypeError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitWorkType} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Mã định danh (Code) *
                  </label>
                  <input
                    type="text"
                    required
                    placeholder="VD: TVTK_TT, ON11, HT..."
                    value={workTypeForm.code}
                    onChange={e => setWorkTypeForm({ ...workTypeForm, code: e.target.value.toUpperCase() })}
                    className="w-full border border-slate-300 rounded-md p-2 uppercase font-mono font-bold bg-white"
                  />
                  {editingWorkType ? (
                    <span className="text-[10px] text-slate-500">
                      Cho phép chỉnh sửa Mã loại việc. Lịch công việc, tiến độ và quy tắc điểm sẽ tự động đồng bộ theo mã mới.
                    </span>
                  ) : (
                    <span className="text-[10px] text-slate-500">Mã viết tắt dùng để liên kết dữ liệu trong hệ thống.</span>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Thứ tự hiển thị
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={workTypeForm.order}
                    onChange={e => setWorkTypeForm({ ...workTypeForm, order: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md p-2 font-mono"
                  />
                  <span className="text-[10px] text-slate-500">Thứ tự trong danh sách xổ xuống.</span>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tên hiển thị loại công việc *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Tư vấn triển khai trực tiếp..."
                  value={workTypeForm.name}
                  onChange={e => setWorkTypeForm({ ...workTypeForm, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-md p-2 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Đơn vị tính (Hiển thị) *
                  </label>
                  <select
                    value={workTypeForm.unit}
                    onChange={e => {
                      const u = e.target.value;
                      let uType: any = 'number';
                      let calc: CalculationMethod = 'QUANTITY_MULTIPLY';
                      if (u === 'Buổi') { uType = 'session'; }
                      else if (u === 'Ngày') { uType = 'day'; }
                      else if (u === 'Giờ') { uType = 'hours'; }
                      else if (u === 'Gói') { uType = 'number'; }
                      else if (u === 'VNĐ') { uType = 'currency'; calc = 'AMOUNT_DIVIDE'; }

                      setWorkTypeForm({
                        ...workTypeForm,
                        unit: u,
                        unitType: uType,
                        calculationMethod: calc
                      });
                    }}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white font-medium"
                  >
                    <option value="Buổi">Buổi</option>
                    <option value="Ngày">Ngày</option>
                    <option value="Giờ">Giờ</option>
                    <option value="Gói">Gói</option>
                    <option value="Lượt">Lượt</option>
                    <option value="Số lượng">Số lượng (Mẫu/Tài liệu)</option>
                    <option value="VNĐ">VNĐ (Tiền về)</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Phương pháp tính điểm
                  </label>
                  <select
                    value={workTypeForm.calculationMethod}
                    onChange={e => setWorkTypeForm({ ...workTypeForm, calculationMethod: e.target.value as any })}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white"
                  >
                    <option value="QUANTITY_MULTIPLY">Khối lượng × Định mức (Nhân)</option>
                    <option value="AMOUNT_DIVIDE">Số tiền ÷ Tỷ lệ quy đổi (Chia)</option>
                    <option value="FIXED_POINTS">Điểm cố định theo gói/nhiệm vụ</option>
                  </select>
                </div>
              </div>

              {workTypeForm.calculationMethod === 'AMOUNT_DIVIDE' ? (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tỷ lệ quy đổi (Số tiền VNĐ để được 1 điểm KPI) *
                  </label>
                  <input
                    type="number"
                    step="500000"
                    min="1000"
                    placeholder="VD: 5000000"
                    value={workTypeForm.conversionRate}
                    onChange={e => setWorkTypeForm({ ...workTypeForm, conversionRate: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md p-2 font-mono font-bold text-emerald-700 text-right"
                  />
                  <span className="text-[10px] text-slate-500">
                    Ví dụ 5.000.000 VNĐ = 1 điểm KPI (10 triệu = 2 điểm).
                  </span>
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Điểm định mức gợi ý cho mỗi đơn vị ({workTypeForm.unit}) *
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    min="0"
                    placeholder="VD: 10"
                    value={workTypeForm.defaultScorePerUnit}
                    onChange={e => setWorkTypeForm({ ...workTypeForm, defaultScorePerUnit: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md p-2 font-mono font-bold text-blue-700 text-right"
                  />
                  <span className="text-[10px] text-slate-500">
                    Khi người dùng nhập 1 {workTypeForm.unit}, hệ thống tự đề xuất {workTypeForm.defaultScorePerUnit} điểm.
                  </span>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nhóm KPI nghiệp vụ
                  </label>
                  <select
                    value={workTypeForm.kpiCategory}
                    onChange={e => setWorkTypeForm({ ...workTypeForm, kpiCategory: e.target.value })}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white"
                  >
                    <option value="TVTK Trực tiếp">TVTK Trực tiếp</option>
                    <option value="Đào tạo tập trung">Đào tạo tập trung</option>
                    <option value="ON11">ON11</option>
                    <option value="Hỗ trợ HT">Hỗ trợ HT</option>
                    <option value="DEMO/POC/Tiền về">DEMO/POC/Tiền về</option>
                    <option value="Đào tạo nội bộ">Đào tạo nội bộ</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Trạng thái sử dụng
                  </label>
                  <select
                    value={workTypeForm.isActive ? 'active' : 'inactive'}
                    onChange={e => setWorkTypeForm({ ...workTypeForm, isActive: e.target.value === 'active' })}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white font-medium"
                  >
                    <option value="active">Đang sử dụng (Hiển thị khi nhập điểm)</option>
                    <option value="inactive">Ngừng sử dụng (Bảo lưu dữ liệu lịch sử)</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center gap-4 pt-1">
                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={workTypeForm.isTraining}
                    onChange={e => setWorkTypeForm({ ...workTypeForm, isTraining: e.target.checked })}
                    className="rounded text-blue-600"
                  />
                  <span>Thuộc nhóm Đào tạo</span>
                </label>

                <label className="flex items-center gap-2 cursor-pointer text-slate-700">
                  <input
                    type="checkbox"
                    checked={workTypeForm.requiresProduct}
                    onChange={e => setWorkTypeForm({ ...workTypeForm, requiresProduct: e.target.checked })}
                    className="rounded text-blue-600"
                  />
                  <span>Bắt buộc chọn Module</span>
                </label>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mô tả / Hướng dẫn nghiệp vụ (Tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder="Ghi chú quy cách hoặc căn cứ tính điểm..."
                  value={workTypeForm.description}
                  onChange={e => setWorkTypeForm({ ...workTypeForm, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-md p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsWorkTypeModalOpen(false);
                    setEditingWorkType(null);
                    setWorkTypeError('');
                  }}
                  className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingWorkType}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-md shadow-xs cursor-pointer"
                >
                  {isSubmittingWorkType ? 'Đang lưu...' : (editingWorkType ? 'Cập nhật loại việc' : 'Tạo loại việc mới')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Product Create/Edit */}
      {isProductModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                  <Package className="w-4 h-4 text-blue-600" />
                  {editingProduct ? `Sửa Sản Phẩm / Module: ${editingProduct.name}` : 'Thêm Sản Phẩm / Module Mới'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Quản lý danh mục sản phẩm, module phục vụ chấm điểm và phân bổ
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsProductModalOpen(false);
                  setEditingProduct(null);
                  setProductError('');
                }}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {productError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700 flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{productError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitProduct} className="space-y-3.5 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mã sản phẩm / Module *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: CRM, HRM, KETOAN, SAN_XUAT..."
                  value={productForm.code}
                  onChange={e => setProductForm({ ...productForm, code: e.target.value.toUpperCase() })}
                  className="w-full border border-slate-300 rounded-md p-2 uppercase font-mono font-bold bg-white"
                />
                {editingProduct ? (
                  <p className="text-[10px] text-slate-500 mt-1">
                    Cho phép chỉnh sửa Mã. Toàn bộ dữ liệu liên quan (tiến độ, lịch làm việc, quy tắc điểm, đào tạo) sẽ tự động đồng bộ theo mã mới.
                  </p>
                ) : (
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Mã viết tắt, không dấu, dùng để liên kết dữ liệu trong hệ thống.
                  </p>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tên sản phẩm / Module *
                </label>
                <input
                  type="text"
                  required
                  placeholder="VD: Quản trị quan hệ khách hàng (CRM)..."
                  value={productForm.name}
                  onChange={e => setProductForm({ ...productForm, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-md p-2 font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Phân loại danh mục
                  </label>
                  <select
                    value={productForm.category}
                    onChange={e => setProductForm({ ...productForm, category: e.target.value })}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white font-medium"
                  >
                    <option value="Module">Module</option>
                    <option value="Sản phẩm">Sản phẩm</option>
                    <option value="CRM">CRM</option>
                    <option value="HRM">HRM</option>
                    <option value="ERP">ERP</option>
                    <option value="Nền tảng">Nền tảng</option>
                    <option value="Khác">Khác</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Trạng thái sử dụng
                  </label>
                  <select
                    value={productForm.isActive ? 'active' : 'inactive'}
                    onChange={e => setProductForm({ ...productForm, isActive: e.target.value === 'active' })}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white font-medium"
                  >
                    <option value="active">Đang sử dụng (Mặc định)</option>
                    <option value="inactive">Ngừng sử dụng (Bảo lưu dữ liệu)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mô tả / Ghi chú (Tùy chọn)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú về tính năng hoặc phạm vi áp dụng của module..."
                  value={productForm.description}
                  onChange={e => setProductForm({ ...productForm, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-md p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsProductModalOpen(false);
                    setEditingProduct(null);
                    setProductError('');
                  }}
                  className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProduct}
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white font-semibold rounded-md shadow-xs cursor-pointer"
                >
                  {isSubmittingProduct ? 'Đang lưu...' : (editingProduct ? 'Lưu thay đổi' : 'Tạo sản phẩm')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: Reference Score Create/Edit */}
      {isScoreModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 flex items-center justify-center p-3 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-lg w-full p-5 space-y-4 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm sm:text-base flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  {editingScore ? `Sửa Điểm Tham Chiếu: ${editingScore.workTypeCode}` : 'Thêm Điểm Tham Chiếu Mới'}
                </h3>
                <p className="text-xs text-slate-500 mt-0.5">
                  Cấu hình định mức điểm gợi ý, quy đổi KPI và thời gian áp dụng trong Core
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setIsScoreModalOpen(false);
                  setEditingScore(null);
                  setScoreError('');
                }}
                className="text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {scoreError && (
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-xs text-rose-700 flex items-center gap-2 font-medium">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{scoreError}</span>
              </div>
            )}

            <form onSubmit={handleSubmitScore} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Loại công việc *
                  </label>
                  <select
                    required
                    value={scoreForm.workTypeCode}
                    onChange={e => {
                      const newWtCode = e.target.value;
                      const selectedWt = workTypes.find(w => w.code === newWtCode);
                      setScoreForm(prev => ({
                        ...prev,
                        workTypeCode: newWtCode,
                        suggestedScore: prev.suggestedScore !== undefined ? prev.suggestedScore : (selectedWt?.defaultScorePerUnit ?? 10),
                        conversionRate: selectedWt?.conversionRate !== undefined ? selectedWt.conversionRate : prev.conversionRate
                      }));
                    }}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white font-medium"
                  >
                    <option value="">-- Chọn loại công việc --</option>
                    {workTypes.map(wt => (
                      <option key={wt.code} value={wt.code}>
                        {wt.code} - {wt.name}{!wt.isActive ? ' (Ngưng SD)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Liên kết với danh mục loại việc Core.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Sản phẩm áp dụng
                  </label>
                  <select
                    value={scoreForm.productCode}
                    onChange={e => setScoreForm({ ...scoreForm, productCode: e.target.value })}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white font-medium"
                  >
                    <option value="">Tất cả sản phẩm (Áp dụng chung)</option>
                    {products.map(p => (
                      <option key={p.code} value={p.code}>
                        {p.code} - {p.name}{!p.isActive ? ' (Ngưng SD)' : ''}
                      </option>
                    ))}
                  </select>
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Để trống nếu áp dụng cho toàn bộ sản phẩm.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Điểm gợi ý chuẩn *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    required
                    placeholder="VD: 10, 12, 15, 6, 0.5..."
                    value={scoreForm.suggestedScore}
                    onChange={e => setScoreForm({ ...scoreForm, suggestedScore: e.target.value === '' ? ('' as any) : Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md p-2 font-mono font-bold text-blue-900 bg-white"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Điểm tiêu chuẩn cho 1 đơn vị việc (buổi/ngày/gói).
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Mức quy đổi VNĐ (VNĐ = 1 điểm KPI)
                  </label>
                  <input
                    type="number"
                    step="1000"
                    min="0"
                    placeholder="VD: 5000000..."
                    value={scoreForm.conversionRate !== undefined ? scoreForm.conversionRate : ''}
                    onChange={e => setScoreForm({ ...scoreForm, conversionRate: e.target.value ? Number(e.target.value) : undefined })}
                    className="w-full border border-slate-300 rounded-md p-2 font-mono text-emerald-800 bg-white"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Áp dụng cho loại việc doanh số/tiền về: Số tiền chia tỷ lệ để ra điểm KPI.
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Hiệu lực từ *
                  </label>
                  <input
                    type="date"
                    required
                    value={scoreForm.effectiveFrom}
                    onChange={e => setScoreForm({ ...scoreForm, effectiveFrom: e.target.value })}
                    className="w-full border border-slate-300 rounded-md p-2 font-mono bg-white"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Ngày bắt đầu áp dụng định mức điểm này.
                  </p>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Hiệu lực đến (Tùy chọn)
                  </label>
                  <input
                    type="date"
                    value={scoreForm.effectiveTo || ''}
                    onChange={e => setScoreForm({ ...scoreForm, effectiveTo: e.target.value })}
                    className="w-full border border-slate-300 rounded-md p-2 font-mono bg-white"
                  />
                  <p className="text-[10px] text-slate-500 mt-0.5">
                    Để trống nếu áp dụng vô thời hạn.
                  </p>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Trạng thái sử dụng
                </label>
                <select
                  value={scoreForm.isActive ? 'active' : 'inactive'}
                  onChange={e => setScoreForm({ ...scoreForm, isActive: e.target.value === 'active' })}
                  className="w-full border border-slate-300 rounded-md p-2 bg-white font-medium"
                >
                  <option value="active">Đang sử dụng (Mặc định)</option>
                  <option value="inactive">Ngưng sử dụng (Bảo lưu lịch sử)</option>
                </select>
                <p className="text-[10px] text-slate-500 mt-0.5">
                  Khi Ngưng sử dụng, quy tắc này không được gợi ý cho nghiệp vụ mới nhưng bảo lưu toàn bộ lịch sử.
                </p>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mô tả / Ghi chú (Tùy chọn)
                </label>
                <textarea
                  rows={2}
                  placeholder="Ghi chú về căn cứ điểm, nghị quyết hoặc phạm vi áp dụng..."
                  value={scoreForm.description}
                  onChange={e => setScoreForm({ ...scoreForm, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-md p-2 bg-white"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setIsScoreModalOpen(false);
                    setEditingScore(null);
                    setScoreError('');
                  }}
                  className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md cursor-pointer font-medium"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingScore}
                  className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-semibold rounded-md shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  {isSubmittingScore ? 'Đang lưu...' : (editingScore ? 'Lưu thay đổi' : 'Tạo điểm tham chiếu')}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* 7. TRAINING MODULES SUBTAB */}
      {activeSubTab === 'trainingModules' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                Quản Lý Danh Mục Module Đào Tạo Tập Trung & Buổi Mặc Định
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Cấu hình danh sách module và buổi học mặc định (Sáng / Chiều). Khi tạo lớp ở phân hệ phân bổ, hệ thống tự điền buổi mặc định từ cấu hình này.
              </p>
            </div>
            {isMasterAdmin && (
              <button
                onClick={handleOpenCreateTrainingModule}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm module mới
              </button>
            )}
          </div>

          {/* Reference Score Notice */}
          <div className="p-3 bg-blue-50/70 border border-blue-200 rounded-md text-xs text-blue-900 flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
            <div>
              <span className="font-semibold">Quy tắc tham chiếu điểm đào tạo tập trung tại Core: </span>
              <span>
                Lớp đào tạo tập trung dùng chung nguồn điểm với loại việc <strong>ĐTTT (Đào tạo tập trung)</strong>.
                Nếu Core cấu hình đơn vị là <strong>Ngày</strong>, một buổi đào tạo tương ứng 0,5 ngày (điểm gói = 0,5 × điểm/ngày).
                Nếu cấu hình đơn vị là <strong>Buổi</strong>, điểm gói bằng đúng điểm một buổi.
              </span>
            </div>
          </div>

          {/* Table of Training Modules */}
          <div className="overflow-x-auto border border-slate-200 rounded-md">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase tracking-wider text-[11px]">
                  <th className="py-2.5 px-3 w-12 text-center">STT</th>
                  <th className="py-2.5 px-3 w-28">Mã Module</th>
                  <th className="py-2.5 px-3">Tên Module</th>
                  <th className="py-2.5 px-3 w-32">Buổi mặc định</th>
                  <th className="py-2.5 px-3 w-28 text-center">Trạng thái</th>
                  <th className="py-2.5 px-3">Mô tả / Ghi chú</th>
                  {isMasterAdmin && <th className="py-2.5 px-3 text-right w-24">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {trainingModules.map((mod, idx) => (
                  <tr key={mod.id} className="hover:bg-slate-50/60">
                    <td className="py-2.5 px-3 text-center text-slate-400 font-mono">{idx + 1}</td>
                    <td className="py-2.5 px-3 font-mono font-semibold text-slate-900">{mod.code}</td>
                    <td className="py-2.5 px-3 font-medium text-slate-900">{mod.name}</td>
                    <td className="py-2.5 px-3">
                      {mod.defaultSession ? (
                        <span className={`px-2 py-0.5 rounded-xs text-[11px] font-semibold ${
                          mod.defaultSession === 'Sáng' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {mod.defaultSession}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Chưa thiết lập</span>
                      )}
                    </td>
                    <td className="py-2.5 px-3 text-center">
                      <span className={`px-2 py-0.5 rounded-xs text-[10px] font-semibold ${
                        mod.isActive
                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                          : 'bg-slate-100 text-slate-500 border border-slate-200'
                      }`}>
                        {mod.isActive ? 'Đang dùng' : 'Ngừng dùng'}
                      </span>
                    </td>
                    <td className="py-2.5 px-3 text-slate-500">{mod.description || '—'}</td>
                    {isMasterAdmin && (
                      <td className="py-2.5 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEditTrainingModule(mod)}
                            className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                            title="Sửa module"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleToggleTrainingModuleActive(mod)}
                            className="p-1 text-slate-400 hover:text-amber-600 transition-colors"
                            title={mod.isActive ? 'Ngừng sử dụng' : 'Kích hoạt lại'}
                          >
                            {mod.isActive ? <X className="w-3.5 h-3.5 text-amber-600" /> : <Check className="w-3.5 h-3.5 text-emerald-600" />}
                          </button>
                          <button
                            onClick={() => handleDeleteTrainingModule(mod)}
                            className="p-1 text-slate-400 hover:text-rose-600 transition-colors"
                            title="Xóa module (chỉ khi chưa dùng)"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
                {trainingModules.length === 0 && (
                  <tr>
                    <td colSpan={7} className="py-6 text-center text-slate-400">
                      Chưa có Module đào tạo tập trung. Nhấn Thêm module mới để tạo.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 8. RECURRING TRAINING SCHEDULES SUBTAB */}
      {activeSubTab === 'recurringTraining' && (
        <div className="bg-white rounded-lg border border-slate-200 shadow-2xs p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-semibold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                Cấu Hình Lịch Đào Tạo Định Kỳ Tại Core
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Đặc quyền Quản trị viên chính · Thiết lập các lớp đào tạo lặp lại định kỳ hằng tuần theo các thứ và buổi cụ thể.
              </p>
            </div>
            {isMasterAdmin && (
              <button
                onClick={handleOpenCreateRecurring}
                className="px-3.5 py-1.5 text-xs font-semibold text-white bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] rounded-lg transition-colors flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm lịch mẫu định kỳ
              </button>
            )}
          </div>

          <div className="p-3 bg-blue-50/70 border border-blue-200/80 rounded-md text-xs text-blue-900 space-y-1">
            <div className="font-semibold flex items-center gap-1.5">
              <Info className="w-3.5 h-3.5 text-blue-700 shrink-0" />
              Nguyên tắc nghiệp vụ lịch đào tạo định kỳ Core:
            </div>
            <ul className="list-disc pl-5 space-y-0.5 text-[11px] text-blue-800">
              <li>Mỗi lịch mẫu gắn với <strong>Module, Nội dung lớp, các thứ tổ chức trong tuần và buổi Sáng hoặc Chiều</strong>.</li>
              <li>Ví dụ: <em>Đào tạo CRM: Sáng Thứ 2 hằng tuần</em>; <em>Giải đáp HRM: Sáng Thứ 4 và Thứ 6 hằng tuần</em>.</li>
              <li><strong>Không gắn cố định người phụ trách vào Thiết lập hệ thống</strong>: Nhân sự nhận lớp được phân công theo danh sách phụ trách của từng tháng cụ thể.</li>
              <li>Khi người quản lý bấm <em>"Tạo lớp trong tháng từ Thiết lập hệ thống"</em>, hệ thống sẽ tự động quét các ngày thực tế trong tháng khớp với lịch mẫu để sinh danh sách lớp.</li>
            </ul>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200 text-slate-600 font-semibold uppercase text-[11px]">
                  <th className="py-2.5 px-3 w-14 text-center">STT</th>
                  <th className="py-2.5 px-3 w-28">Module</th>
                  <th className="py-2.5 px-3 min-w-[180px]">Nội dung lớp</th>
                  <th className="py-2.5 px-3 min-w-[160px]">Các thứ tổ chức</th>
                  <th className="py-2.5 px-3 w-20 text-center">Buổi</th>
                  <th className="py-2.5 px-3 w-28 text-center">Chu kỳ</th>
                  <th className="py-2.5 px-3 min-w-[160px]">Hiệu lực</th>
                  <th className="py-2.5 px-3 w-24 text-center">Tham chiếu</th>
                  <th className="py-2.5 px-3 min-w-[150px]">Ghi chú mặc định</th>
                  <th className="py-2.5 px-3 w-28 text-center">Trạng thái</th>
                  {isMasterAdmin && <th className="py-2.5 px-3 text-right w-24">Thao tác</th>}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {[...recurringSchedules].sort((a, b) => (a.order || 0) - (b.order || 0)).map((sched, idx) => {
                  const daysText = sched.daysOfWeek.map(d => (d === 8 ? 'Chủ nhật' : `Thứ ${d}`)).join(', ');

                  return (
                    <tr key={sched.id} className="hover:bg-slate-50 transition-colors">
                      <td className="py-2.5 px-3 text-center font-mono text-slate-500">
                        {sched.order || idx + 1}
                      </td>
                      <td className="py-2.5 px-3 font-mono font-bold text-blue-700">
                        <span className="bg-blue-50 px-2 py-0.5 rounded-xs border border-blue-200">
                          {sched.moduleCode}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 font-semibold text-slate-900">
                        {sched.contentTitle}
                      </td>
                      <td className="py-2.5 px-3">
                        <div className="flex flex-wrap gap-1">
                          {sched.daysOfWeek.map(d => (
                            <span
                              key={d}
                              className="px-1.5 py-0.5 bg-slate-100 text-slate-700 rounded-xs font-medium text-[11px] border border-slate-200"
                            >
                              {d === 8 ? 'CN' : `T${d}`}
                            </span>
                          ))}
                          <span className="text-[11px] text-slate-500 ml-1">({daysText})</span>
                        </div>
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        <span className={`px-2 py-0.5 rounded-xs font-semibold text-[11px] ${
                          sched.sessionOfDay === 'Sáng' ? 'bg-amber-100 text-amber-800' : 'bg-blue-100 text-blue-800'
                        }`}>
                          {sched.sessionOfDay}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-center text-slate-600 font-medium text-[11px]">
                        Hằng tuần
                      </td>
                      <td className="py-2.5 px-3 font-mono text-[11px] text-slate-600">
                        <div>Từ: {sched.effectiveFrom}</div>
                        {sched.effectiveTo ? (
                          <div>Đến: {sched.effectiveTo}</div>
                        ) : (
                          <div className="text-slate-400">Vô thời hạn</div>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-center font-mono text-[11px] text-slate-600">
                        <span className="bg-slate-100 px-1.5 py-0.5 rounded-xs text-slate-700 font-semibold">
                          {sched.defaultScoreRule || 'ĐTTT'}
                        </span>
                      </td>
                      <td className="py-2.5 px-3 text-slate-600 text-[11px]">
                        {sched.defaultNotes || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {isMasterAdmin ? (
                          <button
                            onClick={() => handleToggleRecurringActive(sched)}
                            className={`px-2 py-0.5 rounded-full text-[11px] font-semibold border cursor-pointer ${
                              sched.isActive
                                ? 'bg-emerald-50 text-emerald-700 border-emerald-200 hover:bg-emerald-100'
                                : 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200'
                            }`}
                          >
                            {sched.isActive ? 'Đang áp dụng' : 'Tạm dừng'}
                          </button>
                        ) : (
                          <span className={`px-2 py-0.5 rounded-full text-[11px] font-semibold ${
                            sched.isActive ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-500'
                          }`}>
                            {sched.isActive ? 'Đang áp dụng' : 'Tạm dừng'}
                          </span>
                        )}
                      </td>
                      {isMasterAdmin && (
                        <td className="py-2.5 px-3 text-right whitespace-nowrap">
                          <button
                            onClick={() => handleOpenEditRecurring(sched)}
                            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-md transition-colors mr-1 cursor-pointer"
                            title="Sửa lịch mẫu"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteRecurring(sched)}
                            className="p-1 text-slate-500 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-colors cursor-pointer"
                            title="Xóa lịch mẫu"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      )}
                    </tr>
                  );
                })}
                {recurringSchedules.length === 0 && (
                  <tr>
                    <td colSpan={11} className="py-6 text-center text-slate-400">
                      Chưa có lịch mẫu định kỳ nào trong Core.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* 9. SAO LƯU, XUẤT & KHÔI PHỤC SUBTAB */}
      {activeSubTab === 'backups' && (
        <BackupManagementSubTab
          session={session}
          onOpenDateRangeDeleteModal={onOpenDateRangeDeleteModal}
          onRefreshAllData={onRefreshAllData || (async () => {})}
        />
      )}

      {/* RECURRING TRAINING SCHEDULE MODAL */}
      {isRecurringModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-lg w-full overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Clock className="w-4 h-4 text-blue-600" />
                {editingRecurring ? `Sửa lịch mẫu: ${editingRecurring.contentTitle}` : 'Thêm lịch đào tạo định kỳ mới tại Core'}
              </h3>
              <button onClick={() => setIsRecurringModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitRecurring} className="p-5 space-y-4 text-xs">
              {recurringError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 font-medium">
                  {recurringError}
                </div>
              )}

              {/* Module selection */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Module đào tạo *
                </label>
                <select
                  value={recurringForm.moduleCode}
                  onChange={e => {
                    const mod = trainingModules.find(m => m.code === e.target.value);
                    setRecurringForm({
                      ...recurringForm,
                      moduleCode: e.target.value,
                      sessionOfDay: (mod?.defaultSession as any) || recurringForm.sessionOfDay,
                      contentTitle: recurringForm.contentTitle || `Đào tạo ${e.target.value}`
                    });
                  }}
                  className="w-full border border-slate-300 rounded-md p-2 bg-white font-medium focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                  required
                >
                  {trainingModules.filter(m => m.isActive).map(m => (
                    <option key={m.code} value={m.code}>
                      {m.code} - {m.name}
                    </option>
                  ))}
                </select>
              </div>

              {/* Content Title */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nội dung lớp (Ví dụ: "Đào tạo CRM", "Giải đáp HRM") *
                </label>
                <input
                  type="text"
                  placeholder="Nhập tên nội dung lớp..."
                  value={recurringForm.contentTitle}
                  onChange={e => setRecurringForm({ ...recurringForm, contentTitle: e.target.value })}
                  className="w-full border border-slate-300 rounded-md p-2 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              {/* Days of week selection */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Các thứ tổ chức trong tuần * (Chọn một hoặc nhiều thứ)
                </label>
                <div className="grid grid-cols-4 sm:grid-cols-7 gap-1.5 bg-slate-50 p-2.5 rounded-md border border-slate-200">
                  {[
                    { val: 2, label: 'Thứ 2' },
                    { val: 3, label: 'Thứ 3' },
                    { val: 4, label: 'Thứ 4' },
                    { val: 5, label: 'Thứ 5' },
                    { val: 6, label: 'Thứ 6' },
                    { val: 7, label: 'Thứ 7' },
                    { val: 8, label: 'Chủ nhật' }
                  ].map(day => {
                    const isChecked = recurringForm.daysOfWeek.includes(day.val);
                    return (
                      <label
                        key={day.val}
                        className={`flex flex-col items-center justify-center p-2 rounded-md border text-center cursor-pointer transition-colors ${
                          isChecked
                            ? 'bg-blue-600 text-white border-blue-600 font-bold shadow-2xs'
                            : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100 font-medium'
                        }`}
                      >
                        <input
                          type="checkbox"
                          className="sr-only"
                          checked={isChecked}
                          onChange={e => {
                            if (e.target.checked) {
                              setRecurringForm({
                                ...recurringForm,
                                daysOfWeek: [...recurringForm.daysOfWeek, day.val].sort()
                              });
                            } else {
                              setRecurringForm({
                                ...recurringForm,
                                daysOfWeek: recurringForm.daysOfWeek.filter(d => d !== day.val)
                              });
                            }
                          }}
                        />
                        <span className="text-[11px]">{day.label}</span>
                      </label>
                    );
                  })}
                </div>
              </div>

              {/* Session of Day & Chu kỳ */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Buổi học *
                  </label>
                  <select
                    value={recurringForm.sessionOfDay}
                    onChange={e => setRecurringForm({ ...recurringForm, sessionOfDay: e.target.value as any })}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white font-medium"
                    required
                  >
                    <option value="Sáng">Sáng</option>
                    <option value="Chiều">Chiều</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Chu kỳ lặp lại
                  </label>
                  <input
                    type="text"
                    disabled
                    value="Hằng tuần"
                    className="w-full border border-slate-300 rounded-md p-2 bg-slate-100 text-slate-700 font-medium"
                  />
                </div>
              </div>

              {/* Effective dates */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Ngày bắt đầu hiệu lực *
                  </label>
                  <input
                    type="date"
                    value={recurringForm.effectiveFrom}
                    onChange={e => setRecurringForm({ ...recurringForm, effectiveFrom: e.target.value })}
                    className="w-full border border-slate-300 rounded-md p-2 font-mono"
                    required
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Ngày kết thúc (Tùy chọn)
                  </label>
                  <input
                    type="date"
                    value={recurringForm.effectiveTo}
                    onChange={e => setRecurringForm({ ...recurringForm, effectiveTo: e.target.value })}
                    className="w-full border border-slate-300 rounded-md p-2 font-mono"
                  />
                </div>
              </div>

              {/* Default Notes & Order */}
              <div className="grid grid-cols-3 gap-3">
                <div className="col-span-2">
                  <label className="block font-semibold text-slate-700 mb-1">
                    Ghi chú mặc định (Nội dung lớp)
                  </label>
                  <input
                    type="text"
                    placeholder="VD: Lớp ôn tập hằng tuần..."
                    value={recurringForm.defaultNotes}
                    onChange={e => setRecurringForm({ ...recurringForm, defaultNotes: e.target.value })}
                    className="w-full border border-slate-300 rounded-md p-2"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Thứ tự sắp xếp
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={recurringForm.order}
                    onChange={e => setRecurringForm({ ...recurringForm, order: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md p-2"
                  />
                </div>
              </div>

              {/* Active Toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer font-medium text-slate-700">
                  <input
                    type="checkbox"
                    checked={recurringForm.isActive}
                    onChange={e => setRecurringForm({ ...recurringForm, isActive: e.target.checked })}
                    className="rounded-xs border-slate-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span>Đang áp dụng (Sử dụng để sinh lớp hằng tháng)</span>
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsRecurringModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow-xs cursor-pointer"
                >
                  {editingRecurring ? 'Lưu thay đổi' : 'Tạo lịch mẫu'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* TRAINING MODULE MODAL */}
      {isTrainingModuleModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-lg border border-slate-200 shadow-xl max-w-md w-full overflow-hidden">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Calendar className="w-4 h-4 text-blue-600" />
                {editingTrainingModule ? `Sửa module đào tạo ${editingTrainingModule.code}` : 'Thêm module đào tạo mới'}
              </h3>
              <button onClick={() => setIsTrainingModuleModalOpen(false)} className="text-slate-400 hover:text-slate-600 p-1">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSubmitTrainingModule} className="p-5 space-y-4 text-xs">
              {trainingModuleError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 rounded text-rose-800 font-medium">
                  {trainingModuleError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mã Module (VD: CRM, HRM, SAN_XUAT) *
                </label>
                <input
                  type="text"
                  placeholder="Mã ngắn gọn..."
                  value={trainingModuleForm.code}
                  onChange={e => setTrainingModuleForm({ ...trainingModuleForm, code: e.target.value.toUpperCase() })}
                  className="w-full border border-slate-300 rounded-md p-2 font-mono uppercase focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                  required
                />
                {editingTrainingModule && (
                  <span className="text-[10px] text-slate-500 mt-0.5 block">
                    Đổi mã module sẽ tự động cập nhật liên kết sang các lịch định kỳ và phân bổ lớp đào tạo liên quan.
                  </span>
                )}
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Tên Module hiển thị *
                </label>
                <input
                  type="text"
                  placeholder="VD: Quản trị quan hệ khách hàng (CRM)"
                  value={trainingModuleForm.name}
                  onChange={e => setTrainingModuleForm({ ...trainingModuleForm, name: e.target.value })}
                  className="w-full border border-slate-300 rounded-md p-2 focus:ring-1 focus:ring-blue-500 focus:outline-hidden"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Buổi mặc định
                  </label>
                  <select
                    value={trainingModuleForm.defaultSession}
                    onChange={e => setTrainingModuleForm({ ...trainingModuleForm, defaultSession: e.target.value as any })}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white"
                  >
                    <option value="">-- Chưa đặt --</option>
                    <option value="Sáng">Sáng</option>
                    <option value="Chiều">Chiều</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Thứ tự sắp xếp
                  </label>
                  <input
                    type="number"
                    min="1"
                    value={trainingModuleForm.order}
                    onChange={e => setTrainingModuleForm({ ...trainingModuleForm, order: Number(e.target.value) })}
                    className="w-full border border-slate-300 rounded-md p-2"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Trạng thái sử dụng
                </label>
                <select
                  value={trainingModuleForm.isActive ? 'active' : 'inactive'}
                  onChange={e => setTrainingModuleForm({ ...trainingModuleForm, isActive: e.target.value === 'active' })}
                  className="w-full border border-slate-300 rounded-md p-2 bg-white font-medium"
                >
                  <option value="active">Đang sử dụng (Cho phép tạo lớp)</option>
                  <option value="inactive">Ngừng sử dụng (Bảo lưu lịch sử)</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Mô tả / Ghi chú (Tùy chọn)
                </label>
                <input
                  type="text"
                  placeholder="Ghi chú về module..."
                  value={trainingModuleForm.description}
                  onChange={e => setTrainingModuleForm({ ...trainingModuleForm, description: e.target.value })}
                  className="w-full border border-slate-300 rounded-md p-2"
                />
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTrainingModuleModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-md shadow-xs cursor-pointer"
                >
                  {editingTrainingModule ? 'Lưu thay đổi' : 'Tạo module'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Xác Nhận Xóa Chung (Đặc biệt cho Nhân sự ONB và các danh mục Core) */}
      {deleteConfirmState && deleteConfirmState.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="font-semibold text-slate-900 text-sm flex items-center gap-2">
                <Trash2 className="w-4 h-4 text-rose-600" />
                Xác nhận xóa {deleteConfirmState.recordType}
              </h3>
              <button
                type="button"
                onClick={() => setDeleteConfirmState(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-2 text-xs text-slate-700">
              <p>
                Bạn có chắc chắn muốn xóa vĩnh viễn {deleteConfirmState.recordType.toLowerCase()} sau đây khỏi hệ thống?
              </p>
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
                {deleteConfirmState.recordType !== 'Điểm tham chiếu Core' && (
                  <>
                    <div>
                      <span className="text-slate-500 font-medium">Mã ONB / Mã danh mục:</span>{' '}
                      <span className="font-mono font-bold text-slate-900">{deleteConfirmState.code || deleteConfirmState.id}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Họ tên / Tên hiển thị:</span>{' '}
                      <span className="font-semibold text-slate-900">{deleteConfirmState.name}</span>
                    </div>
                  </>
                )}
                {deleteConfirmState.details && deleteConfirmState.details.map((d, i) => (
                  <div key={i} className={`flex items-start justify-between gap-2 text-[11px] ${(i > 0 || deleteConfirmState.recordType !== 'Điểm tham chiếu Core') ? 'pt-1 border-t border-slate-100' : ''}`}>
                    <span className="text-slate-500 font-medium">{d.label}:</span>
                    <span className="font-medium text-slate-900 text-right">{d.value}</span>
                  </div>
                ))}
              </div>
              <p className="text-[11px] text-amber-700 bg-amber-50 p-2 rounded border border-amber-200">
                Lưu ý: Thao tác này chỉ thực hiện được khi danh mục chưa phát sinh dữ liệu nghiệp vụ nào. Sau khi xóa thành công, bản ghi sẽ không xuất hiện trở lại.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setDeleteConfirmState(null)}
                className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md font-medium cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={async () => {
                  if (deleteConfirmState?.onConfirm) {
                    setIsDeleting(true);
                    try {
                      await deleteConfirmState.onConfirm();
                    } finally {
                      setIsDeleting(false);
                    }
                  }
                }}
                className="px-4 py-1.5 bg-rose-600 hover:bg-rose-700 disabled:opacity-50 text-white font-semibold rounded-md shadow-xs cursor-pointer flex items-center gap-1.5"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {isDeleting ? 'Đang xóa...' : 'Xóa'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Thông Báo Đã Phát Sinh Dữ Liệu - Không Thể Xóa, Hướng Dẫn Ngưng Sử Dụng */}
      {cannotDeleteState && cannotDeleteState.isOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-rose-100 pb-3">
              <h3 className="font-semibold text-rose-800 text-sm flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600" />
                Không thể xóa {cannotDeleteState.recordType}
              </h3>
              <button
                type="button"
                onClick={() => setCannotDeleteState(null)}
                className="text-slate-400 hover:text-slate-600 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-700">
              <div className="p-3 bg-rose-50 border border-rose-200 rounded-md text-rose-900 leading-relaxed font-medium">
                {cannotDeleteState.reason || `Danh mục này đã có dữ liệu phát sinh nên không thể xóa. Vui lòng chuyển sang trạng thái Ngưng sử dụng.`}
              </div>

              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1">
                {cannotDeleteState.recordType !== 'Điểm tham chiếu Core' && (
                  <>
                    <div>
                      <span className="text-slate-500 font-medium">Mã:</span>{' '}
                      <span className="font-mono font-bold text-slate-900">{cannotDeleteState.code}</span>
                    </div>
                    <div>
                      <span className="text-slate-500 font-medium">Họ tên / Tên:</span>{' '}
                      <span className="font-semibold text-slate-900">{cannotDeleteState.name}</span>
                    </div>
                  </>
                )}
                {cannotDeleteState.details && cannotDeleteState.details.map((d, i) => (
                  <div key={i} className={`flex items-start justify-between gap-2 text-[11px] ${(i > 0 || cannotDeleteState.recordType !== 'Điểm tham chiếu Core') ? 'pt-1 border-t border-slate-100' : ''}`}>
                    <span className="text-slate-500 font-medium">{d.label}:</span>
                    <span className="font-medium text-slate-900 text-right">{d.value}</span>
                  </div>
                ))}
              </div>

              <p className="text-[11px] text-slate-500">
                Toàn bộ dữ liệu nghiệp vụ lịch sử (lịch làm việc, tiến độ, điểm, thưởng...) được bảo toàn nguyên vẹn khi chuyển sang trạng thái Ngưng sử dụng.
              </p>
            </div>

            <div className="flex justify-end gap-2 pt-3 border-t border-slate-100 text-xs">
              <button
                type="button"
                onClick={() => setCannotDeleteState(null)}
                className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md font-medium cursor-pointer"
              >
                Đóng
              </button>
              {cannotDeleteState.onToggleInactive && (
                <button
                  type="button"
                  onClick={async () => {
                    await cannotDeleteState.onToggleInactive?.();
                  }}
                  className="px-4 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-semibold rounded-md shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  Chuyển sang Ngưng sử dụng
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
