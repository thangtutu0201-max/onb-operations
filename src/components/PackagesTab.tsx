import React, { useState, useMemo, useEffect } from 'react';
import {
  CustomerPackage,
  Customer,
  ONBMember,
  ONBGroup,
  PackageCoreConfig,
  CurrentUserSession,
  PackageDetailRow
} from '../types';
import {
  calculatePackageScore,
  resolveMemberGroupAtDate,
  cleanTaxCode,
  ScoreCalculationResult
} from '../utils/packageScoring';
import { api } from '../services/api';
import { ExcelImportModal } from './ExcelImportModal';
import {
  Package,
  Plus,
  Search,
  Filter,
  Lock,
  Unlock,
  AlertTriangle,
  CheckCircle,
  HelpCircle,
  Trash2,
  Edit2,
  X,
  Save,
  RotateCcw,
  Sparkles,
  Info,
  ShieldAlert,
  ArrowUpDown,
  Building2,
  Users,
  Award,
  Calendar,
  FileSpreadsheet
} from 'lucide-react';
import { WorkTypeCatalog, ProductCatalog, ReferenceScore, ProgressTask } from '../types';

interface PackagesTabProps {
  packages: CustomerPackage[];
  customers: Customer[];
  members: ONBMember[];
  groups?: ONBGroup[];
  packageCoreConfig: PackageCoreConfig;
  monthYear: string;
  onMonthChange?: (m: string) => void;
  isMonthLocked: boolean;
  session: CurrentUserSession | null;
  onAddPackage: (pkg: Partial<CustomerPackage>) => Promise<void>;
  onUpdatePackage: (id: string, pkg: Partial<CustomerPackage>) => Promise<void>;
  onDeletePackage: (id: string) => Promise<void>;
  onAddCustomer?: (customer: Partial<Customer>) => Promise<void>;
  workTypes?: WorkTypeCatalog[];
  products?: ProductCatalog[];
  referenceScores?: ReferenceScore[];
  progressTasks?: ProgressTask[];
  onRefreshData?: () => void;
}

interface NewDetailDraft {
  tempId: string;
  moduleCode: string;
  moduleName: string;
  onbCode: string;
  groupName: string;
  leaderPlatforms?: number | '';
  recordedScore: number | '';
  suggestedScore: number;
  isManualScore: boolean;
  scoreFormula?: string;
  notes?: string;
  warning?: string;
}

export const PackagesTab: React.FC<PackagesTabProps> = ({
  packages,
  customers,
  members,
  groups = [],
  packageCoreConfig,
  monthYear,
  onMonthChange,
  isMonthLocked,
  session,
  onAddPackage,
  onUpdatePackage,
  onDeletePackage,
  workTypes = [],
  products = [],
  referenceScores = [],
  progressTasks = [],
  onRefreshData
}) => {
  // Excel Import Modal State
  const [isExcelImportModalOpen, setIsExcelImportModalOpen] = useState(false);

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedPerformer, setSelectedPerformer] = useState('');
  const [selectedGroup, setSelectedGroup] = useState('');
  const [selectedSource, setSelectedSource] = useState('');
  const [selectedModule, setSelectedModule] = useState('');

  // Conflict Modal
  const [isConflictModalOpen, setIsConflictModalOpen] = useState(false);
  const [historicalConflicts, setHistoricalConflicts] = useState<any[]>([]);

  // Composer State (Creating New Package)
  const [isCreatingPackage, setIsCreatingPackage] = useState(false);
  const [pkgTaxCode, setPkgTaxCode] = useState('');
  const [pkgCustomerName, setPkgCustomerName] = useState('');
  const [pkgReceptionDate, setPkgReceptionDate] = useState(() => {
    const today = new Date().toISOString().slice(0, 10);
    return today.startsWith(monthYear) ? today : `${monthYear}-01`;
  });
  const [pkgSourceCode, setPkgSourceCode] = useState(() => packageCoreConfig.sources?.[0]?.code || 'SRC_BAN_THEM_1');
  const [pkgClass, setPkgClass] = useState(() => packageCoreConfig.classifications?.[0]?.name || 'Tiếp nhận mới');
  const [pkgTier, setPkgTier] = useState(() => packageCoreConfig.customerTiers?.[2]?.code || 'SILVER');
  const [pkgWorkForm, setPkgWorkForm] = useState(() => packageCoreConfig.workTypes?.[2]?.name || 'Đào tạo');
  const [pkgNotes, setPkgNotes] = useState('');
  const [newDetails, setNewDetails] = useState<NewDetailDraft[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isSavingPackage, setIsSavingPackage] = useState(false);

  // Editing Existing Package
  const [editingPackageId, setEditingPackageId] = useState<string | null>(null);
  const [editFormData, setEditFormData] = useState<Partial<CustomerPackage> | null>(null);
  const [editDetails, setEditDetails] = useState<PackageDetailRow[]>([]);
  const [editError, setEditError] = useState<string | null>(null);
  const [isSavingEdit, setIsSavingEdit] = useState(false);

  // Discard Confirmation Modals
  const [isConfirmDiscardComposerOpen, setIsConfirmDiscardComposerOpen] = useState(false);
  const [isConfirmDiscardEditOpen, setIsConfirmDiscardEditOpen] = useState(false);

  // Package Deletion Modal State
  const [deleteConfirmPackage, setDeleteConfirmPackage] = useState<CustomerPackage | null>(null);
  const [isDeletingPackage, setIsDeletingPackage] = useState(false);
  const [deletePackageError, setDeletePackageError] = useState<string | null>(null);

  const formatDateVi = (dateStr?: string) => {
    if (!dateStr) return '-';
    const parts = dateStr.split('-');
    if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
    return dateStr;
  };

  // Default module & performer
  const defaultModuleCode = packageCoreConfig.modules?.[0]?.code || 'MOD_SAN_XUAT';
  const defaultModuleName = packageCoreConfig.modules?.[0]?.name || 'Sản xuất';
  const defaultOnbCode = session?.onbCode || members[0]?.code || 'DTHANG';

  // Keep reception date in sync if month changes and not creating
  useEffect(() => {
    if (!isCreatingPackage) {
      const today = new Date().toISOString().slice(0, 10);
      setPkgReceptionDate(today.startsWith(monthYear) ? today : `${monthYear}-01`);
    }
  }, [monthYear, isCreatingPackage]);

  // Load historical leader conflicts on mount
  useEffect(() => {
    api.getLeaderConflicts()
      .then(res => setHistoricalConflicts(res.conflicts || []))
      .catch(() => setHistoricalConflicts([]));
  }, [packages]);

  // Helper: Find Leader claim across entire database
  const getLeaderClaimForTax = (taxCode: string, excludeDetailId?: string) => {
    const cleanTax = cleanTaxCode(taxCode);
    if (!cleanTax) return null;

    for (const pkg of packages) {
      if (cleanTaxCode(pkg.taxCode) !== cleanTax) continue;
      if (!pkg.details) continue;

      for (const d of pkg.details) {
        if (excludeDetailId && d.id === excludeDetailId) continue;
        if (d.leaderPlatforms && Number(d.leaderPlatforms) >= 2) {
          const performer = members.find(m => m.code === d.onbCode);
          return {
            memberName: performer?.fullName || d.onbCode,
            packageCode: pkg.packageCode || 'Gói',
            moduleName: d.moduleName || d.moduleCode,
            monthYear: pkg.monthYear,
            packageId: pkg.id,
            detailId: d.id
          };
        }
      }
    }
    return null;
  };

  // Initialize Composer
  const handleOpenCreatePackage = () => {
    const today = new Date().toISOString().slice(0, 10);
    const dateVal = today.startsWith(monthYear) ? today : `${monthYear}-01`;
    const initialPerformer = session?.onbCode || members[0]?.code || 'DTHANG';
    const initialGroup = resolveMemberGroupAtDate(members, initialPerformer, dateVal);

    const initialSource = packageCoreConfig.sources?.[0]?.code || 'SRC_BAN_THEM_1';
    const initialClass = packageCoreConfig.classifications?.[0]?.name || 'Tiếp nhận mới';
    const initialTier = packageCoreConfig.customerTiers?.[2]?.code || 'SILVER';
    const initialWorkForm = packageCoreConfig.workTypes?.[2]?.name || 'Đào tạo';

    const calc = calculatePackageScore(packageCoreConfig, initialSource, initialWorkForm, initialTier, undefined);

    setPkgTaxCode('');
    setPkgCustomerName('');
    setPkgReceptionDate(dateVal);
    setPkgSourceCode(initialSource);
    setPkgClass(initialClass);
    setPkgTier(initialTier);
    setPkgWorkForm(initialWorkForm);
    setPkgNotes('');
    setCreateError(null);

    setNewDetails([
      {
        tempId: `tmp_${Date.now()}_1`,
        moduleCode: defaultModuleCode,
        moduleName: defaultModuleName,
        onbCode: initialPerformer,
        groupName: initialGroup,
        leaderPlatforms: '',
        recordedScore: calc.suggestedScore,
        suggestedScore: calc.suggestedScore,
        isManualScore: false,
        scoreFormula: calc.formula
      }
    ]);

    setIsCreatingPackage(true);
  };

  // Determine if composer draft has been altered by user
  const isComposerDirty = useMemo(() => {
    if (pkgTaxCode.trim() !== '' || pkgCustomerName.trim() !== '' || pkgNotes.trim() !== '') {
      return true;
    }
    const defaultDate = new Date().toISOString().slice(0, 10);
    const expectedDate = defaultDate.startsWith(monthYear) ? defaultDate : `${monthYear}-01`;
    if (pkgReceptionDate !== expectedDate) {
      return true;
    }
    const initialSource = packageCoreConfig.sources?.[0]?.code || 'SRC_BAN_THEM_1';
    const initialClass = packageCoreConfig.classifications?.[0]?.name || 'Tiếp nhận mới';
    const initialTier = packageCoreConfig.customerTiers?.[2]?.code || 'SILVER';
    const initialWorkForm = packageCoreConfig.workTypes?.[2]?.name || 'Đào tạo';

    if (
      pkgSourceCode !== initialSource ||
      pkgClass !== initialClass ||
      pkgTier !== initialTier ||
      pkgWorkForm !== initialWorkForm
    ) {
      return true;
    }

    if (newDetails.length !== 1) {
      return true;
    }

    const first = newDetails[0];
    if (first) {
      const initialPerformer = session?.onbCode || members[0]?.code || 'DTHANG';
      if (
        first.moduleCode !== defaultModuleCode ||
        first.onbCode !== initialPerformer ||
        first.leaderPlatforms !== '' ||
        first.isManualScore
      ) {
        return true;
      }
    }

    return false;
  }, [
    pkgTaxCode,
    pkgCustomerName,
    pkgNotes,
    pkgReceptionDate,
    pkgSourceCode,
    pkgClass,
    pkgTier,
    pkgWorkForm,
    newDetails,
    monthYear,
    packageCoreConfig,
    session,
    members,
    defaultModuleCode
  ]);

  const handleRequestCloseComposer = () => {
    if (!isComposerDirty) {
      handleForceCloseComposer();
    } else {
      setIsConfirmDiscardComposerOpen(true);
    }
  };

  const handleForceCloseComposer = () => {
    setIsConfirmDiscardComposerOpen(false);
    setIsCreatingPackage(false);
    setCreateError(null);
    setPkgTaxCode('');
    setPkgCustomerName('');
    setPkgNotes('');
    setNewDetails([]);
  };

  const handleDeleteComposerRow = (tempId: string) => {
    const updated = newDetails.filter(d => d.tempId !== tempId);
    setNewDetails(recalculateComposerScores(updated, pkgSourceCode, pkgWorkForm, pkgTier, pkgReceptionDate));
  };

  const editingOriginalPackage = useMemo(() => {
    return packages.find(p => p.id === editingPackageId) || null;
  }, [packages, editingPackageId]);

  const isEditDirty = useMemo(() => {
    if (!editingOriginalPackage || !editFormData) return false;
    if (editFormData.taxCode !== editingOriginalPackage.taxCode) return true;
    if (editFormData.customerName !== editingOriginalPackage.customerName) return true;
    if (editFormData.receptionDate !== editingOriginalPackage.receptionDate) return true;
    if (editFormData.sourceCode !== editingOriginalPackage.sourceCode) return true;
    if (editFormData.packageClass !== editingOriginalPackage.packageClass) return true;
    if (editFormData.customerTier !== editingOriginalPackage.customerTier) return true;
    if (editFormData.workForm !== editingOriginalPackage.workForm) return true;
    if ((editFormData.notes || '') !== (editingOriginalPackage.notes || '')) return true;

    const origDetails = editingOriginalPackage.details || [];
    if (editDetails.length !== origDetails.length) return true;
    for (let i = 0; i < editDetails.length; i++) {
      const d = editDetails[i];
      const orig = origDetails[i];
      if (!orig) return true;
      if (
        d.moduleCode !== orig.moduleCode ||
        d.onbCode !== orig.onbCode ||
        d.leaderPlatforms !== orig.leaderPlatforms ||
        Number(d.recordedScore) !== Number(orig.recordedScore)
      ) {
        return true;
      }
    }
    return false;
  }, [editingOriginalPackage, editFormData, editDetails]);

  const handleRequestCloseEdit = () => {
    if (!isEditDirty) {
      handleForceCloseEdit();
    } else {
      setIsConfirmDiscardEditOpen(true);
    }
  };

  const handleForceCloseEdit = () => {
    setIsConfirmDiscardEditOpen(false);
    setEditingPackageId(null);
    setEditFormData(null);
    setEditDetails([]);
    setEditError(null);
  };

  const handleDeleteEditRow = (index: number) => {
    const updated = editDetails.filter((_, i) => i !== index);
    setEditDetails(updated);
  };

  // Re-calculate scores for all rows in Composer when package-level fields change
  const recalculateComposerScores = (
    updatedDetails: NewDetailDraft[],
    src: string,
    wf: string,
    tier: string,
    recDate: string
  ): NewDetailDraft[] => {
    // Count performers per module
    const moduleCounts: Record<string, number> = {};
    updatedDetails.forEach(d => {
      moduleCounts[d.moduleCode] = (moduleCounts[d.moduleCode] || 0) + 1;
    });

    return updatedDetails.map(d => {
      const groupName = resolveMemberGroupAtDate(members, d.onbCode, recDate);
      const platforms = d.leaderPlatforms ? Number(d.leaderPlatforms) : undefined;
      const calc = calculatePackageScore(packageCoreConfig, src, wf, tier, platforms);

      const hasMultiplePerformers = (moduleCounts[d.moduleCode] || 0) > 1;

      let recordedScore = d.recordedScore;
      if (!d.isManualScore) {
        if (hasMultiplePerformers) {
          // Rule 5.5: When multiple people work on the same module, keep what was entered or prompt manual input
          recordedScore = d.recordedScore !== '' ? d.recordedScore : '';
        } else {
          recordedScore = calc.suggestedScore;
        }
      }

      return {
        ...d,
        groupName,
        suggestedScore: calc.suggestedScore,
        recordedScore,
        scoreFormula: calc.formula,
        warning: calc.warning
      };
    });
  };

  // Add new module to Composer
  const handleComposerAddModule = () => {
    const recDate = pkgReceptionDate;
    const initialPerformer = session?.onbCode || members[0]?.code || 'DTHANG';
    const initialGroup = resolveMemberGroupAtDate(members, initialPerformer, recDate);

    // Pick first unused module if available
    const usedCodes = new Set(newDetails.map(d => d.moduleCode));
    const nextMod = packageCoreConfig.modules?.find(m => !usedCodes.has(m.code)) || packageCoreConfig.modules?.[0];

    const modCode = nextMod?.code || defaultModuleCode;
    const modName = nextMod?.name || defaultModuleName;

    const calc = calculatePackageScore(packageCoreConfig, pkgSourceCode, pkgWorkForm, pkgTier, undefined);

    const updated = [
      ...newDetails,
      {
        tempId: `tmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        moduleCode: modCode,
        moduleName: modName,
        onbCode: initialPerformer,
        groupName: initialGroup,
        leaderPlatforms: '' as const,
        recordedScore: calc.suggestedScore,
        suggestedScore: calc.suggestedScore,
        isManualScore: false,
        scoreFormula: calc.formula
      }
    ];

    setNewDetails(recalculateComposerScores(updated, pkgSourceCode, pkgWorkForm, pkgTier, pkgReceptionDate));
  };

  // Add another performer to the same module in Composer (Rule 5.5)
  const handleComposerAddPerformerToModule = (moduleCode: string) => {
    const modDef = packageCoreConfig.modules?.find(m => m.code === moduleCode);
    const modName = modDef?.name || moduleCode;

    // Pick a member not yet performing this module
    const currentPerformersInMod = new Set(newDetails.filter(d => d.moduleCode === moduleCode).map(d => d.onbCode));
    const nextMember = members.find(m => !currentPerformersInMod.has(m.code)) || members[0];

    const groupName = resolveMemberGroupAtDate(members, nextMember.code, pkgReceptionDate);
    const calc = calculatePackageScore(packageCoreConfig, pkgSourceCode, pkgWorkForm, pkgTier, undefined);

    // Rule 5.5: Giữ nguyên điểm đã có của người trước; dòng mới hiển thị điểm tham chiếu nhưng không tự cấp toàn bộ điểm vào ô ghi nhận
    const updated = [
      ...newDetails,
      {
        tempId: `tmp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        moduleCode,
        moduleName: modName,
        onbCode: nextMember.code,
        groupName,
        leaderPlatforms: '' as const,
        recordedScore: '' as const, // Empty, forces user to enter negotiated score
        suggestedScore: calc.suggestedScore,
        isManualScore: true, // Marked manual because it's split/negotiated
        scoreFormula: `Điểm tham chiếu Thiết lập hệ thống: ${calc.suggestedScore}đ. Vui lòng nhập điểm thỏa thuận.`
      }
    ];

    setNewDetails(updated);
  };

  // Save new package
  const handleSaveNewPackage = async () => {
    setCreateError(null);

    const trimmedTax = cleanTaxCode(pkgTaxCode);
    if (!trimmedTax) {
      setCreateError('Mã số thuế là bắt buộc. Vui lòng nhập mã số thuế.');
      return;
    }
    if (!pkgCustomerName.trim()) {
      setCreateError('Tên khách hàng là bắt buộc. Vui lòng nhập tên khách hàng.');
      return;
    }
    if (!pkgReceptionDate) {
      setCreateError('Ngày tiếp nhận là bắt buộc.');
      return;
    }

    if (newDetails.length === 0) {
      setCreateError('Gói tiếp nhận phải có ít nhất một module và người thực hiện.');
      return;
    }

    // Check multiple performers per module validation (Section 5.5)
    for (let i = 0; i < newDetails.length; i++) {
      const d = newDetails[i];
      if (d.recordedScore === '' || isNaN(Number(d.recordedScore)) || Number(d.recordedScore) < 0) {
        setCreateError(`Dòng ${i + 1} (${d.moduleName} - ${d.onbCode}): Vui lòng nhập điểm ghi nhận hợp lệ (>= 0).`);
        return;
      }
    }

    // Check leader duplicate across rows in this new package
    const leaderRows = newDetails.filter(d => d.leaderPlatforms && Number(d.leaderPlatforms) >= 2);
    if (leaderRows.length > 1) {
      setCreateError('Mỗi mã số thuế chỉ có một khai báo Leader duy nhất. Không được khai báo Leader trên nhiều dòng!');
      return;
    }

    // Check leader duplicate across entire DB
    if (leaderRows.length > 0) {
      const existingClaim = getLeaderClaimForTax(trimmedTax);
      if (existingClaim) {
        setCreateError(
          `Mã số thuế này đã có khai báo Leader: ${existingClaim.memberName} · ${existingClaim.packageCode} · ${existingClaim.moduleName} · ${existingClaim.monthYear}. Không thể khai báo thêm Leader.`
        );
        return;
      }
    }

    // Check duplicate same person on same module (Section 5.2)
    const seenCombos = new Set<string>();
    for (const d of newDetails) {
      const key = `${d.moduleCode}__${d.onbCode}`;
      if (seenCombos.has(key)) {
        setCreateError(`Người thực hiện ${d.onbCode} đã có trong module ${d.moduleName}. Không thêm trùng cùng một người vào cùng một module.`);
        return;
      }
      seenCombos.add(key);
    }

    setIsSavingPackage(true);
    try {
      await onAddPackage({
        taxCode: trimmedTax,
        customerName: pkgCustomerName.trim(),
        receptionDate: pkgReceptionDate,
        monthYear: pkgReceptionDate.slice(0, 7),
        sourceCode: pkgSourceCode,
        packageClass: pkgClass,
        customerTier: pkgTier,
        workForm: pkgWorkForm,
        notes: pkgNotes,
        details: newDetails.map(d => ({
          id: `dtl_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          packageId: '',
          moduleCode: d.moduleCode,
          moduleName: d.moduleName,
          onbCode: d.onbCode,
          groupName: d.groupName,
          leaderPlatforms: d.leaderPlatforms ? Number(d.leaderPlatforms) : undefined,
          recordedScore: Number(d.recordedScore),
          suggestedScore: d.suggestedScore,
          isManualScore: d.isManualScore,
          scoreFormula: d.scoreFormula,
          notes: d.notes
        }))
      });

      // Reset and close
      setIsCreatingPackage(false);
      setCreateError(null);
    } catch (err: any) {
      // Rule 3.1 & 11: Giữ nguyên nội dung đang nhập khi lưu thất bại!
      setCreateError(err.message || 'Lưu gói tiếp nhận thất bại. Vui lòng kiểm tra lại thông tin.');
    } finally {
      setIsSavingPackage(false);
    }
  };

  // Start Editing Package
  const handleStartEditPackage = (pkg: CustomerPackage) => {
    if (isMonthLocked) return;
    setEditingPackageId(pkg.id);
    setEditFormData({
      packageCode: pkg.packageCode,
      taxCode: pkg.taxCode,
      customerName: pkg.customerName,
      receptionDate: pkg.receptionDate,
      sourceCode: pkg.sourceCode,
      packageClass: pkg.packageClass,
      customerTier: pkg.customerTier,
      workForm: pkg.workForm,
      notes: pkg.notes
    });
    setEditDetails(JSON.parse(JSON.stringify(pkg.details || [])));
    setEditError(null);
  };

  // Save Edited Package
  const handleSaveEditPackage = async () => {
    if (!editingPackageId || !editFormData) return;
    setEditError(null);

    const trimmedTax = cleanTaxCode(editFormData.taxCode);
    if (!trimmedTax) {
      setEditError('Mã số thuế không được để trống.');
      return;
    }
    if (!editFormData.customerName?.trim()) {
      setEditError('Tên khách hàng không được để trống.');
      return;
    }
    if (!editDetails || editDetails.length === 0) {
      setEditError('Gói phải có ít nhất 1 module và người thực hiện.');
      return;
    }

    // Validate scores
    for (let i = 0; i < editDetails.length; i++) {
      const d = editDetails[i];
      if (d.recordedScore === undefined || d.recordedScore === null || isNaN(Number(d.recordedScore)) || Number(d.recordedScore) < 0) {
        setEditError(`Dòng ${i + 1} (${d.moduleName}): Vui lòng nhập điểm ghi nhận hợp lệ (>= 0).`);
        return;
      }
    }

    // Validate Leader duplication
    const leaderRows = editDetails.filter(d => d.leaderPlatforms && Number(d.leaderPlatforms) >= 2);
    if (leaderRows.length > 1) {
      setEditError('Mỗi mã số thuế chỉ có một khai báo Leader duy nhất. Vui lòng chỉ giữ 1 khai báo Leader!');
      return;
    }

    if (leaderRows.length > 0) {
      const leaderRow = leaderRows[0];
      const existingClaim = getLeaderClaimForTax(trimmedTax, leaderRow.id);
      if (existingClaim) {
        setEditError(
          `Mã số thuế này đã có khai báo Leader: ${existingClaim.memberName} · ${existingClaim.packageCode} · ${existingClaim.moduleName} · ${existingClaim.monthYear}. Không thể khai báo thêm Leader.`
        );
        return;
      }
    }

    // Check duplicate same performer on same module
    const seenCombos = new Set<string>();
    for (const d of editDetails) {
      const key = `${d.moduleCode}__${d.onbCode}`;
      if (seenCombos.has(key)) {
        setEditError(`Người thực hiện ${d.onbCode} đã có trong module ${d.moduleName}. Không thêm trùng cùng một người vào cùng một module.`);
        return;
      }
      seenCombos.add(key);
    }

    setIsSavingEdit(true);
    try {
      await onUpdatePackage(editingPackageId, {
        ...editFormData,
        taxCode: trimmedTax,
        details: editDetails
      });
      setEditingPackageId(null);
      setEditFormData(null);
      setEditError(null);
    } catch (err: any) {
      // Keep edit state on failure
      setEditError(err.message || 'Lỗi khi cập nhật gói tiếp nhận.');
    } finally {
      setIsSavingEdit(false);
    }
  };

  // Add new module to existing package being edited
  const handleEditAddModule = () => {
    if (!editFormData) return;
    const recDate = editFormData.receptionDate || `${monthYear}-01`;
    const initialPerformer = session?.onbCode || members[0]?.code || 'DTHANG';
    const initialGroup = resolveMemberGroupAtDate(members, initialPerformer, recDate);

    const usedCodes = new Set(editDetails.map(d => d.moduleCode));
    const nextMod = packageCoreConfig.modules?.find(m => !usedCodes.has(m.code)) || packageCoreConfig.modules?.[0];

    const modCode = nextMod?.code || defaultModuleCode;
    const modName = nextMod?.name || defaultModuleName;

    const calc = calculatePackageScore(
      packageCoreConfig,
      editFormData.sourceCode || 'SRC_BAN_THEM_1',
      editFormData.workForm || 'Đào tạo',
      editFormData.customerTier || 'SILVER',
      undefined
    );

    const newRow: PackageDetailRow = {
      id: `dtl_${editingPackageId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      packageId: editingPackageId || '',
      moduleCode: modCode,
      moduleName: modName,
      onbCode: initialPerformer,
      groupName: initialGroup,
      suggestedScore: calc.suggestedScore,
      recordedScore: calc.suggestedScore,
      isManualScore: false,
      scoreFormula: calc.formula
    };

    setEditDetails([...editDetails, newRow]);
  };

  // Add another performer to module in existing package being edited (Rule 5.5)
  const handleEditAddPerformerToModule = (moduleCode: string) => {
    if (!editFormData) return;
    const recDate = editFormData.receptionDate || `${monthYear}-01`;
    const modDef = packageCoreConfig.modules?.find(m => m.code === moduleCode);
    const modName = modDef?.name || moduleCode;

    const currentPerformersInMod = new Set(editDetails.filter(d => d.moduleCode === moduleCode).map(d => d.onbCode));
    const nextMember = members.find(m => !currentPerformersInMod.has(m.code)) || members[0];
    const groupName = resolveMemberGroupAtDate(members, nextMember.code, recDate);

    const calc = calculatePackageScore(
      packageCoreConfig,
      editFormData.sourceCode || 'SRC_BAN_THEM_1',
      editFormData.workForm || 'Đào tạo',
      editFormData.customerTier || 'SILVER',
      undefined
    );

    const newRow: PackageDetailRow = {
      id: `dtl_${editingPackageId}_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      packageId: editingPackageId || '',
      moduleCode,
      moduleName: modName,
      onbCode: nextMember.code,
      groupName,
      suggestedScore: calc.suggestedScore,
      recordedScore: 0, // Prompt for agreed score
      isManualScore: true,
      scoreFormula: `Điểm tham chiếu: ${calc.suggestedScore}đ. Vui lòng nhập điểm thỏa thuận.`
    };

    setEditDetails([...editDetails, newRow]);
  };

  // Open delete package confirm modal
  const handleOpenDeletePackageModal = (pkg: CustomerPackage) => {
    setDeletePackageError(null);
    setDeleteConfirmPackage(pkg);
  };

  // Execute delete package after confirmation
  const handleExecuteDeletePackage = async () => {
    if (!deleteConfirmPackage) return;
    setIsDeletingPackage(true);
    setDeletePackageError(null);
    try {
      await onDeletePackage(deleteConfirmPackage.id);
      setDeleteConfirmPackage(null);
    } catch (err: any) {
      setDeletePackageError(err.message || 'Lỗi khi xóa gói tiếp nhận.');
    } finally {
      setIsDeletingPackage(false);
    }
  };

  // Filtered packages
  const filteredPackages = useMemo(() => {
    return packages.filter(pkg => {
      // Month filter: Defaults to selectedMonth
      if (pkg.monthYear !== monthYear) return false;

      // Performer filter: Check if any detail row has onbCode
      if (selectedPerformer) {
        const matchesPerformer = (pkg.details && pkg.details.some(d => d.onbCode === selectedPerformer)) ||
          pkg.assignedOnbCode === selectedPerformer;
        if (!matchesPerformer) return false;
      }

      // Group filter: Check if any detail row was in group
      if (selectedGroup) {
        const matchesGroup = pkg.details && pkg.details.some(d => d.groupName === selectedGroup);
        if (!matchesGroup) return false;
      }

      // Source filter
      if (selectedSource && pkg.sourceCode !== selectedSource) return false;

      // Module filter
      if (selectedModule) {
        const matchesModule = pkg.details && pkg.details.some(d => d.moduleCode === selectedModule);
        if (!matchesModule) return false;
      }

      // Search filter (Tax Code, Customer Name, Package Code)
      if (searchTerm) {
        const term = searchTerm.toLowerCase().trim();
        const mTax = (pkg.taxCode || '').toLowerCase().includes(term);
        const mCust = (pkg.customerName || '').toLowerCase().includes(term);
        const mCode = (pkg.packageCode || '').toLowerCase().includes(term);
        if (!mTax && !mCust && !mCode) return false;
      }

      return true;
    }).sort((a, b) => (b.receptionDate || '').localeCompare(a.receptionDate || ''));
  }, [packages, monthYear, selectedPerformer, selectedGroup, selectedSource, selectedModule, searchTerm]);

  // Statistics
  const totalPackagesCount = filteredPackages.length;
  const distinctTaxCodesCount = new Set(filteredPackages.map(p => cleanTaxCode(p.taxCode))).size;
  const totalReceptionPoints = useMemo(() => {
    return filteredPackages.reduce((sum, pkg) => {
      if (pkg.details && Array.isArray(pkg.details)) {
        return sum + pkg.details.reduce((s, d) => s + (Number(d.recordedScore) || 0), 0);
      }
      return sum + (Number(pkg.recordedScore) || 0);
    }, 0);
  }, [filteredPackages]);

  const newClassCount = filteredPackages.filter(p => p.packageClass === 'Tiếp nhận mới' || p.packageType === 'Mới tiếp nhận').length;
  const repeatClassCount = filteredPackages.filter(p => p.packageClass === 'Tiếp nhận lại').length;

  return (
    <div className="space-y-6">
      {/* Month Lock & Information Banner */}
      <div className={`p-4 rounded-xl border flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
        isMonthLocked
          ? 'bg-amber-50/80 border-amber-200 text-amber-900'
          : 'bg-indigo-50/80 border-indigo-200 text-indigo-900'
      }`}>
        <div className="flex items-start gap-3">
          {isMonthLocked ? (
            <Lock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
          ) : (
            <Unlock className="w-5 h-5 text-indigo-600 mt-0.5 shrink-0" />
          )}
          <div>
            <div className="font-semibold text-sm flex items-center gap-2 flex-wrap">
              <span>{isMonthLocked ? `Tháng ${monthYear} đã khóa sổ dữ liệu (Chế độ chỉ đọc)` : `Ghi nhận gói tiếp nhận tháng ${monthYear}`}</span>
              {onMonthChange && (
                <div className="flex items-center gap-1 bg-white/90 border border-slate-300 px-2 py-0.5 rounded text-slate-800 text-xs">
                  <Calendar className="w-3.5 h-3.5 text-slate-500" />
                  <select
                    value={monthYear}
                    onChange={e => onMonthChange(e.target.value)}
                    className="bg-transparent font-medium focus:outline-hidden cursor-pointer"
                  >
                    {['2026-12', '2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01'].map(m => (
                      <option key={m} value={m}>Tháng {m}</option>
                    ))}
                  </select>
                </div>
              )}
              <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${
                isMonthLocked ? 'bg-amber-200 text-amber-800' : 'bg-indigo-200 text-indigo-800'
              }`}>
                {isMonthLocked ? 'Chỉ tra cứu' : 'Cho phép nhập & sửa'}
              </span>
            </div>
            <p className="text-xs opacity-80 mt-0.5">
              {isMonthLocked
                ? 'Tháng cũ được bảo lưu lịch sử nguyên trạng. Không được phép thêm, sửa hoặc xóa gói tiếp nhận, điểm và khai báo Leader.'
                : 'Nhập gói tiếp nhận, quản lý module & người thực hiện, tự động gợi ý điểm Thiết lập hệ thống, kiểm soát Leader số nền tảng duy nhất theo MST.'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-end sm:self-center">
          {historicalConflicts.length > 0 && (
            <button
              onClick={() => setIsConflictModalOpen(true)}
              className="text-xs bg-rose-100 hover:bg-rose-200 text-rose-800 px-3 py-1.5 rounded-lg font-medium flex items-center gap-1.5 transition-colors"
            >
              <ShieldAlert className="w-3.5 h-3.5 text-rose-600" />
              <span>{historicalConflicts.length} Xung đột Leader lịch sử</span>
            </button>
          )}

          {!isMonthLocked && (
            <button
              type="button"
              onClick={() => setIsExcelImportModalOpen(true)}
              className="px-3.5 py-2 bg-white hover:bg-[#F8FAFC] border border-[#CBD5E1] text-[#334155] rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
            >
              <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
              <span>Nhập khẩu Excel</span>
            </button>
          )}

          {!isMonthLocked && !isCreatingPackage && (
            <button
              onClick={handleOpenCreatePackage}
              className="px-4 py-2 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-xs transition-all cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Thêm gói tiếp nhận</span>
            </button>
          )}
        </div>
      </div>

      {/* Statistics Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Tổng số gói tiếp nhận</div>
          <div className="text-2xl font-bold text-slate-900 font-mono mt-1">{totalPackagesCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Đếm theo mã gói duy nhất</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Tổng khách hàng (MST)</div>
          <div className="text-2xl font-bold text-slate-900 font-mono mt-1">{distinctTaxCodesCount}</div>
          <div className="text-[11px] text-slate-400 mt-1">Đếm theo mã số thuế phân biệt</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Tổng điểm KPI tiếp nhận</div>
          <div className="text-2xl font-bold text-indigo-600 font-mono mt-1">{totalReceptionPoints} đ</div>
          <div className="text-[11px] text-slate-400 mt-1">Tổng cộng các dòng chi tiết</div>
        </div>
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <div className="text-xs text-slate-500 font-medium">Phân loại gói</div>
          <div className="text-xs text-slate-700 font-medium mt-2 flex flex-col gap-1">
            <span className="flex items-center justify-between">
              <span className="text-slate-500">Tiếp nhận mới:</span>
              <b className="font-mono">{newClassCount}</b>
            </span>
            <span className="flex items-center justify-between">
              <span className="text-slate-500">Tiếp nhận lại:</span>
              <b className="font-mono">{repeatClassCount}</b>
            </span>
          </div>
        </div>
      </div>

      {/* Filter Bar (Section 3.2) */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
        <div className="flex items-center gap-2 text-xs font-semibold text-slate-700 uppercase tracking-wider">
          <Filter className="w-3.5 h-3.5 text-indigo-600" />
          <span>Bộ lọc dữ liệu bảng</span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
          {/* Quick Search */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-slate-400" />
            <input
              type="text"
              placeholder="Tìm MST, tên khách hàng, mã gói..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Performer Filter */}
          <div>
            <select
              value={selectedPerformer}
              onChange={e => setSelectedPerformer(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Tất cả người thực hiện</option>
              {members.map(m => (
                <option key={m.code} value={m.code}>{m.fullName} ({m.shortCode || m.code})</option>
              ))}
            </select>
          </div>

          {/* Group Filter */}
          <div>
            <select
              value={selectedGroup}
              onChange={e => setSelectedGroup(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Tất cả nhóm</option>
              {groups.map(g => (
                <option key={g.id} value={g.name}>{g.name}</option>
              ))}
              <option value="Chưa xác định nhóm">Chưa xác định nhóm</option>
            </select>
          </div>

          {/* Source Filter */}
          <div>
            <select
              value={selectedSource}
              onChange={e => setSelectedSource(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Tất cả nguồn tiếp nhận</option>
              {packageCoreConfig.sources?.map(s => (
                <option key={s.code} value={s.code}>{s.name} {s.isNonScoring ? '(0đ)' : ''}</option>
              ))}
            </select>
          </div>

          {/* Module Filter */}
          <div>
            <select
              value={selectedModule}
              onChange={e => setSelectedModule(e.target.value)}
              className="w-full px-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg focus:outline-none focus:ring-1 focus:ring-indigo-500"
            >
              <option value="">Tất cả module tiếp nhận</option>
              {packageCoreConfig.modules?.map(m => (
                <option key={m.code} value={m.code}>{m.name}</option>
              ))}
            </select>
          </div>
        </div>

        {(searchTerm || selectedPerformer || selectedGroup || selectedSource || selectedModule) && (
          <div className="flex justify-end">
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedPerformer('');
                setSelectedGroup('');
                setSelectedSource('');
                setSelectedModule('');
              }}
              className="text-xs text-indigo-600 hover:text-indigo-800 font-medium flex items-center gap-1"
            >
              <RotateCcw className="w-3 h-3" />
              <span>Xóa bộ lọc</span>
            </button>
          </div>
        )}
      </div>

      {/* Inline Package Composer (Adding New Package Quickly) */}
      {isCreatingPackage && (
        <div className="bg-white border-2 border-indigo-400 rounded-xl p-5 shadow-md space-y-4">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2">
              <Package className="w-5 h-5 text-indigo-600" />
              <h3 className="text-sm font-bold text-slate-900">Ghi nhận gói tiếp nhận mới trong tháng {monthYear}</h3>
              <span className="text-[11px] bg-indigo-50 text-indigo-700 font-mono px-2 py-0.5 rounded">Tự sinh mã gói GOI</span>
            </div>
            <button
              type="button"
              onClick={handleRequestCloseComposer}
              className="text-slate-400 hover:text-slate-600 p-1 rounded-md transition-colors cursor-pointer"
              title="Đóng biểu mẫu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          {createError && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-800 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{createError}</span>
            </div>
          )}

          {/* Section 4: Thông tin chung của gói */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {/* 4.1 Mã số thuế */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Mã số thuế <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={pkgTaxCode}
                onChange={e => {
                  const val = e.target.value;
                  setPkgTaxCode(val);
                  // Auto suggest customer name if taxCode exists in customers
                  const clean = cleanTaxCode(val);
                  if (clean) {
                    const foundCust = customers.find(c => cleanTaxCode(c.taxCode) === clean);
                    if (foundCust && !pkgCustomerName) {
                      setPkgCustomerName(foundCust.name);
                    }
                  }
                }}
                placeholder="0108923412"
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 font-mono"
              />
              <span className="text-[10px] text-slate-400 mt-0.5 block">Lưu văn bản, giữ số 0 đầu & dấu gạch nối</span>
            </div>

            {/* 4.2 Tên khách hàng */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Tên khách hàng <span className="text-rose-500">*</span>
              </label>
              <input
                type="text"
                value={pkgCustomerName}
                onChange={e => setPkgCustomerName(e.target.value)}
                placeholder="Công ty TNHH..."
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500"
              />
            </div>

            {/* 4.3 & 4.4 Ngày & Tháng tiếp nhận */}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Ngày tiếp nhận <span className="text-rose-500">*</span>
                </label>
                <input
                  type="date"
                  value={pkgReceptionDate}
                  onChange={e => {
                    const newDate = e.target.value;
                    setPkgReceptionDate(newDate);
                    setNewDetails(recalculateComposerScores(newDetails, pkgSourceCode, pkgWorkForm, pkgTier, newDate));
                  }}
                  className="w-full px-2 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500 font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Tháng tiếp nhận
                </label>
                <input
                  type="text"
                  readOnly
                  value={pkgReceptionDate ? pkgReceptionDate.slice(0, 7) : monthYear}
                  className="w-full px-2 py-1.5 text-xs bg-slate-100 border border-slate-300 rounded-lg text-slate-600 font-mono cursor-not-allowed"
                />
              </div>
            </div>

            {/* 4.5 Nguồn */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Nguồn tiếp nhận <span className="text-rose-500">*</span>
              </label>
              <select
                value={pkgSourceCode}
                onChange={e => {
                  const val = e.target.value;
                  setPkgSourceCode(val);
                  setNewDetails(recalculateComposerScores(newDetails, val, pkgWorkForm, pkgTier, pkgReceptionDate));
                }}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500"
              >
                {packageCoreConfig.sources?.filter(s => s.isActive || s.code === pkgSourceCode).map(s => (
                  <option key={s.code} value={s.code}>
                    {s.name} {s.isNonScoring ? '(Không tính điểm: 0đ)' : ''} {!s.isActive ? '(Ngừng SD)' : ''}
                  </option>
                ))}
              </select>
            </div>

            {/* 4.6 Phân loại gói */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phân loại gói <span className="text-rose-500">*</span>
              </label>
              <select
                value={pkgClass}
                onChange={e => setPkgClass(e.target.value)}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500"
              >
                {packageCoreConfig.classifications?.filter(c => c.isActive || c.name === pkgClass || c.code === pkgClass).map(c => (
                  <option key={c.code} value={c.name}>{c.name} {!c.isActive ? '(Ngừng SD)' : ''}</option>
                ))}
              </select>
            </div>

            {/* 4.7 Phân hạng khách hàng */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Phân hạng khách hàng <span className="text-rose-500">*</span>
              </label>
              <select
                value={pkgTier}
                onChange={e => {
                  const val = e.target.value;
                  setPkgTier(val);
                  setNewDetails(recalculateComposerScores(newDetails, pkgSourceCode, pkgWorkForm, val, pkgReceptionDate));
                }}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500"
              >
                {packageCoreConfig.customerTiers?.filter(t => t.isActive || t.code === pkgTier).map(t => (
                  <option key={t.code} value={t.code}>{t.name} ({t.score} điểm) {!t.isActive ? '(Ngừng SD)' : ''}</option>
                ))}
              </select>
            </div>

            {/* 4.8 Loại hình */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Loại hình <span className="text-rose-500">*</span>
              </label>
              <select
                value={pkgWorkForm}
                onChange={e => {
                  const val = e.target.value;
                  setPkgWorkForm(val);
                  setNewDetails(recalculateComposerScores(newDetails, pkgSourceCode, val, pkgTier, pkgReceptionDate));
                }}
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500"
              >
                {packageCoreConfig.workTypes?.filter(w => w.isActive || w.name === pkgWorkForm).map(w => (
                  <option key={w.code} value={w.name}>{w.name} {!w.isActive ? '(Ngừng SD)' : ''}</option>
                ))}
              </select>
            </div>

            {/* Ghi chú */}
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">Ghi chú gói</label>
              <input
                type="text"
                value={pkgNotes}
                onChange={e => setPkgNotes(e.target.value)}
                placeholder="Ghi chú thêm..."
                className="w-full px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:ring-1 focus:ring-indigo-500"
              />
            </div>
          </div>

          {/* Section 5 & 6: Danh sách Module & Người thực hiện */}
          <div className="space-y-2 pt-2">
            <div className="flex items-center justify-between">
              <div className="text-xs font-bold text-slate-800 uppercase tracking-wider flex items-center gap-1.5">
                <span>Module & Người thực hiện gói này ({newDetails.length} dòng)</span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleComposerAddModule}
                  className="px-2.5 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg font-medium flex items-center gap-1 transition-colors"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Thêm module khác</span>
                </button>
              </div>
            </div>

            <div className="border border-slate-200 rounded-lg overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead className="bg-[#F1F5F9] text-[#475569] font-semibold border-b border-[#E2E8F0]">
                  <tr>
                    <th className="p-2.5">Module tiếp nhận</th>
                    <th className="p-2.5">Người thực hiện</th>
                    <th className="p-2.5">Nhóm (Từ Thiết lập hệ thống)</th>
                    <th className="p-2.5">Leader số nền tảng</th>
                    <th className="p-2.5 text-right">Điểm Thiết lập hệ thống</th>
                    <th className="p-2.5 text-right">Điểm ghi nhận</th>
                    <th className="p-2.5">Diễn giải công thức</th>
                    <th className="p-2.5 text-center">Thao tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {newDetails.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="p-4 text-center text-slate-400 text-xs italic bg-slate-50/50">
                        Chưa có module nào trong gói. Vui lòng nhấn <span className="font-semibold text-indigo-600">"Thêm module khác"</span> ở góc trên bên phải để thêm người thực hiện.
                      </td>
                    </tr>
                  ) : (
                    newDetails.map((row, idx) => {
                      const countInThisModule = newDetails.filter(d => d.moduleCode === row.moduleCode).length;
                      const isMultiPerformerInMod = countInThisModule > 1;

                    // Leader duplicate check
                    const leaderClaim = row.leaderPlatforms && Number(row.leaderPlatforms) >= 2
                      ? getLeaderClaimForTax(pkgTaxCode)
                      : null;

                    return (
                      <tr key={row.tempId} className="hover:bg-slate-50/60">
                        {/* Module */}
                        <td className="p-2.5 min-w-[150px]">
                          <select
                            value={row.moduleCode}
                            onChange={e => {
                              const code = e.target.value;
                              const def = packageCoreConfig.modules?.find(m => m.code === code);
                              const updated = newDetails.map(d =>
                                d.tempId === row.tempId ? { ...d, moduleCode: code, moduleName: def?.name || code } : d
                              );
                              setNewDetails(recalculateComposerScores(updated, pkgSourceCode, pkgWorkForm, pkgTier, pkgReceptionDate));
                            }}
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                          >
                            {packageCoreConfig.modules?.filter(m => m.isActive || m.code === row.moduleCode).map(m => (
                              <option key={m.code} value={m.code}>{m.name} {!m.isActive ? '(Ngừng SD)' : ''}</option>
                            ))}
                          </select>
                        </td>

                        {/* Performer */}
                        <td className="p-2.5 min-w-[160px]">
                          <select
                            value={row.onbCode}
                            onChange={e => {
                              const code = e.target.value;
                              const updated = newDetails.map(d =>
                                d.tempId === row.tempId ? { ...d, onbCode: code } : d
                              );
                              setNewDetails(recalculateComposerScores(updated, pkgSourceCode, pkgWorkForm, pkgTier, pkgReceptionDate));
                            }}
                            className="w-full px-2 py-1 text-xs border border-slate-200 rounded bg-white"
                          >
                            {members.filter(m => m.isActive || m.code === row.onbCode).map(m => (
                              <option key={m.code} value={m.code}>{m.fullName} ({m.shortCode || m.code}) {!m.isActive ? '(Ngừng SD)' : ''}</option>
                            ))}
                          </select>
                        </td>

                        {/* Group Name (Read-only, auto resolved from Core) */}
                        <td className="p-2.5 whitespace-nowrap">
                          <span className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-700">
                            {row.groupName}
                          </span>
                        </td>

                        {/* Leader Platforms */}
                        <td className="p-2.5 min-w-[130px]">
                          <div className="space-y-1">
                            <input
                              type="number"
                              min="2"
                              max="10"
                              placeholder="Trống = Không"
                              value={row.leaderPlatforms}
                              onChange={e => {
                                const parsed = parseInt(e.target.value, 10);
                                const val: number | '' = e.target.value === '' || isNaN(parsed) ? '' : Math.max(0, parsed);
                                const updated: NewDetailDraft[] = newDetails.map(d =>
                                  d.tempId === row.tempId ? { ...d, leaderPlatforms: val } : d
                                );
                                setNewDetails(recalculateComposerScores(updated, pkgSourceCode, pkgWorkForm, pkgTier, pkgReceptionDate));
                              }}
                              className={`w-full px-2 py-1 text-xs border rounded font-mono ${
                                leaderClaim ? 'border-rose-400 bg-rose-50 text-rose-900' : 'border-slate-200 bg-white'
                              }`}
                            />
                            {leaderClaim && (
                              <div className="text-[10px] text-rose-700 leading-tight">
                                Trùng: {leaderClaim.memberName} ({leaderClaim.packageCode})
                              </div>
                            )}
                          </div>
                        </td>

                        {/* Suggested Score */}
                        <td className="p-2.5 text-right font-mono text-slate-500 whitespace-nowrap">
                          {row.suggestedScore} đ
                        </td>

                        {/* Recorded Score */}
                        <td className="p-2.5 text-right min-w-[100px]">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            placeholder="Nhập điểm"
                            value={row.recordedScore}
                            onChange={e => {
                              const val = e.target.value === '' ? '' : parseFloat(e.target.value);
                              setNewDetails(newDetails.map(d =>
                                d.tempId === row.tempId ? { ...d, recordedScore: val, isManualScore: true } : d
                              ));
                            }}
                            className={`w-20 px-2 py-1 text-right text-xs font-mono font-bold border rounded ${
                              row.isManualScore ? 'border-amber-400 bg-amber-50 text-amber-900' : 'border-indigo-300 bg-white text-indigo-900'
                            }`}
                          />
                        </td>

                        {/* Formula & Warning */}
                        <td className="p-2.5 text-[11px] text-slate-600 max-w-xs">
                          <div>{row.scoreFormula}</div>
                          {isMultiPerformerInMod && (
                            <div className="text-[10px] text-amber-700 font-medium mt-0.5 flex items-center gap-1">
                              <Info className="w-3 h-3 text-amber-600 shrink-0" />
                              <span>Module có nhiều người thực hiện. Vui lòng kiểm tra điểm ghi nhận của từng người.</span>
                            </div>
                          )}
                          {row.warning && (
                            <div className="text-[10px] text-rose-600 font-medium mt-0.5">{row.warning}</div>
                          )}
                        </td>

                        {/* Actions */}
                        <td className="p-2.5 text-center whitespace-nowrap space-x-1">
                          <button
                            type="button"
                            onClick={() => handleComposerAddPerformerToModule(row.moduleCode)}
                            title="Thêm người cùng module này (Rule 5.5)"
                            className="p-1 hover:bg-slate-200 rounded text-indigo-600 cursor-pointer"
                          >
                            <Users className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteComposerRow(row.tempId)}
                            title="Xóa dòng này"
                            className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </td>
                      </tr>
                    );
                  }))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Composer Footer Actions */}
          <div className="flex items-center justify-between pt-3 border-t border-slate-100">
            <div className="text-xs text-slate-500">
              Tổng điểm gói tiếp nhận:{' '}
              <span className="font-bold font-mono text-indigo-700 text-sm">
                {newDetails.reduce((s, d) => s + (Number(d.recordedScore) || 0), 0)} đ
              </span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleRequestCloseComposer}
                disabled={isSavingPackage}
                className="px-4 py-2 border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-lg text-xs font-semibold transition-colors cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={handleSaveNewPackage}
                disabled={isSavingPackage}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-sm disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                <span>{isSavingPackage ? 'Đang lưu...' : 'Lưu gói tiếp nhận'}</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Main Excel-like Table View (Section 3.1) */}
      <div className="bg-white border border-slate-200 rounded-xl shadow-xs overflow-hidden">
        <div className="overflow-x-auto max-h-[750px]">
          <table className="w-full text-left border-collapse text-xs">
            {/* Sticky Header with exact columns sequence specified in Section 3.1 */}
            <thead className="sticky top-0 z-10 bg-[#F1F5F9] text-[#475569] font-bold border-b border-[#CBD5E1] shadow-xs">
              <tr>
                <th className="p-3 whitespace-nowrap min-w-[120px]">Mã số thuế</th>
                <th className="p-3 whitespace-nowrap min-w-[180px]">Tên khách hàng</th>
                <th className="p-3 whitespace-nowrap min-w-[100px]">Ngày tiếp nhận</th>
                <th className="p-3 whitespace-nowrap min-w-[90px]">Tháng tiếp nhận</th>
                <th className="p-3 whitespace-nowrap min-w-[130px]">Nguồn</th>
                <th className="p-3 whitespace-nowrap min-w-[110px]">Phân loại gói</th>
                <th className="p-3 whitespace-nowrap min-w-[110px]">Phân hạng KH</th>
                <th className="p-3 whitespace-nowrap min-w-[100px]">Loại hình</th>
                <th className="p-3 whitespace-nowrap min-w-[130px]">Module tiếp nhận</th>
                <th className="p-3 whitespace-nowrap min-w-[140px]">Người thực hiện</th>
                <th className="p-3 whitespace-nowrap min-w-[100px]">Nhóm</th>
                <th className="p-3 whitespace-nowrap min-w-[100px]">Leader nền tảng</th>
                <th className="p-3 whitespace-nowrap min-w-[100px] text-right">Điểm tiếp nhận</th>
                <th className="p-3 whitespace-nowrap min-w-[120px] text-center">Thao tác</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-200">
              {filteredPackages.length === 0 ? (
                <tr>
                  <td colSpan={14} className="p-12 text-center text-slate-400">
                    <Package className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                    <p className="text-sm font-medium text-slate-600">Không có gói tiếp nhận nào phù hợp bộ lọc</p>
                    <p className="text-xs text-slate-400 mt-1">
                      {isMonthLocked ? 'Tháng này chưa có dữ liệu gói tiếp nhận.' : 'Bấm "Thêm gói tiếp nhận" để tạo mới.'}
                    </p>
                  </td>
                </tr>
              ) : (
                filteredPackages.map((pkg, pkgIndex) => {
                  const isEditingThisPkg = editingPackageId === pkg.id;
                  const details = pkg.details && pkg.details.length > 0 ? pkg.details : [];
                  const rowCount = Math.max(1, details.length);

                  // If this package is currently being edited inline
                  if (isEditingThisPkg && editFormData) {
                    return (
                      <React.Fragment key={pkg.id}>
                        {/* Edit Package Bar */}
                        <tr className="bg-indigo-50/70 border-t-2 border-indigo-400 font-semibold">
                          <td colSpan={14} className="p-3">
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-semibold text-slate-700">Mã gói:</span>
                                <input
                                  type="text"
                                  value={editFormData.packageCode || ''}
                                  onChange={e => setEditFormData({ ...editFormData, packageCode: e.target.value.toUpperCase() })}
                                  className="bg-white text-indigo-700 font-mono font-bold px-2 py-0.5 rounded text-xs border border-indigo-300 w-36 uppercase focus:ring-1 focus:ring-indigo-500 focus:outline-hidden"
                                  placeholder="Mã gói..."
                                  title="Chỉnh sửa Mã gói tiếp nhận"
                                />
                                <span className="text-sm font-bold text-slate-900 hidden md:inline">Đang chỉnh sửa gói tiếp nhận</span>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={handleEditAddModule}
                                  className="px-2.5 py-1 text-xs bg-white border border-slate-300 hover:bg-slate-50 text-slate-700 rounded-md font-medium flex items-center gap-1"
                                >
                                  <Plus className="w-3.5 h-3.5" />
                                  <span>Thêm module</span>
                                </button>
                                <button
                                  type="button"
                                  onClick={handleRequestCloseEdit}
                                  className="px-3 py-1 text-xs border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-md transition-colors cursor-pointer"
                                >
                                  Hủy
                                </button>
                                <button
                                  onClick={handleSaveEditPackage}
                                  disabled={isSavingEdit}
                                  className="px-3 py-1 text-xs bg-indigo-600 hover:bg-indigo-700 text-white rounded-md font-medium flex items-center gap-1"
                                >
                                  <Save className="w-3.5 h-3.5" />
                                  <span>{isSavingEdit ? 'Đang lưu...' : 'Lưu thay đổi'}</span>
                                </button>
                              </div>
                            </div>
                            {editError && (
                              <div className="mt-2 p-2 bg-rose-50 border border-rose-200 rounded text-rose-800 text-xs flex items-center gap-1.5">
                                <AlertTriangle className="w-3.5 h-3.5 text-rose-600 shrink-0" />
                                <span>{editError}</span>
                              </div>
                            )}
                          </td>
                        </tr>

                        {/* Edit Package Fields Row */}
                        <tr className="bg-indigo-50/30 border-b border-indigo-200">
                          {/* Mã số thuế */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={editFormData.taxCode || ''}
                              onChange={e => setEditFormData({ ...editFormData, taxCode: e.target.value })}
                              className="w-full px-2 py-1 text-xs border border-slate-300 rounded font-mono bg-white"
                            />
                          </td>
                          {/* Tên khách hàng */}
                          <td className="p-2">
                            <input
                              type="text"
                              value={editFormData.customerName || ''}
                              onChange={e => setEditFormData({ ...editFormData, customerName: e.target.value })}
                              className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                            />
                          </td>
                          {/* Ngày tiếp nhận */}
                          <td className="p-2">
                            <input
                              type="date"
                              value={editFormData.receptionDate || ''}
                              onChange={e => setEditFormData({ ...editFormData, receptionDate: e.target.value })}
                              className="w-full px-1.5 py-1 text-xs border border-slate-300 rounded font-mono bg-white"
                            />
                          </td>
                          {/* Tháng tiếp nhận */}
                          <td className="p-2 font-mono text-slate-500">
                            {editFormData.receptionDate?.slice(0, 7)}
                          </td>
                          {/* Nguồn */}
                          <td className="p-2">
                            <select
                              value={editFormData.sourceCode || ''}
                              onChange={e => setEditFormData({ ...editFormData, sourceCode: e.target.value })}
                              className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                            >
                              {packageCoreConfig.sources?.map(s => (
                                <option key={s.code} value={s.code}>{s.name}</option>
                              ))}
                            </select>
                          </td>
                          {/* Phân loại gói */}
                          <td className="p-2">
                            <select
                              value={editFormData.packageClass || ''}
                              onChange={e => setEditFormData({ ...editFormData, packageClass: e.target.value })}
                              className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                            >
                              {packageCoreConfig.classifications?.map(c => (
                                <option key={c.code} value={c.name}>{c.name}</option>
                              ))}
                            </select>
                          </td>
                          {/* Phân hạng khách hàng */}
                          <td className="p-2">
                            <select
                              value={editFormData.customerTier || ''}
                              onChange={e => setEditFormData({ ...editFormData, customerTier: e.target.value })}
                              className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                            >
                              {packageCoreConfig.customerTiers?.map(t => (
                                <option key={t.code} value={t.code}>{t.name}</option>
                              ))}
                            </select>
                          </td>
                          {/* Loại hình */}
                          <td className="p-2">
                            <select
                              value={editFormData.workForm || ''}
                              onChange={e => setEditFormData({ ...editFormData, workForm: e.target.value })}
                              className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                            >
                              {packageCoreConfig.workTypes?.map(w => (
                                <option key={w.code} value={w.name}>{w.name}</option>
                              ))}
                            </select>
                          </td>
                          <td colSpan={6} className="p-2 text-slate-400 italic text-right">
                            Chỉnh sửa các dòng module và người thực hiện bên dưới ↓
                          </td>
                        </tr>

                        {/* Edit Details Rows */}
                        {editDetails.map((d, dIdx) => {
                          const leaderClaim = d.leaderPlatforms && Number(d.leaderPlatforms) >= 2
                            ? getLeaderClaimForTax(editFormData.taxCode || '', d.id)
                            : null;

                          return (
                            <tr key={d.id || dIdx} className="bg-indigo-50/20 border-b border-indigo-100">
                              <td colSpan={8} className="p-2 text-slate-400 font-mono text-[11px] text-right">
                                Dòng chi tiết #{dIdx + 1}:
                              </td>
                              {/* Module */}
                              <td className="p-2">
                                <select
                                  value={d.moduleCode}
                                  onChange={e => {
                                    const code = e.target.value;
                                    const def = packageCoreConfig.modules?.find(m => m.code === code);
                                    setEditDetails(editDetails.map((item, i) =>
                                      i === dIdx ? { ...item, moduleCode: code, moduleName: def?.name || code } : item
                                    ));
                                  }}
                                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                                >
                                  {packageCoreConfig.modules?.map(m => (
                                    <option key={m.code} value={m.code}>{m.name}</option>
                                  ))}
                                </select>
                              </td>
                              {/* Performer */}
                              <td className="p-2">
                                <select
                                  value={d.onbCode}
                                  onChange={e => {
                                    const code = e.target.value;
                                    const recDate = editFormData.receptionDate || `${monthYear}-01`;
                                    const groupName = resolveMemberGroupAtDate(members, code, recDate);
                                    setEditDetails(editDetails.map((item, i) =>
                                      i === dIdx ? { ...item, onbCode: code, groupName } : item
                                    ));
                                  }}
                                  className="w-full px-2 py-1 text-xs border border-slate-300 rounded bg-white"
                                >
                                  {members.map(m => (
                                    <option key={m.code} value={m.code}>{m.fullName} ({m.shortCode || m.code})</option>
                                  ))}
                                </select>
                              </td>
                              {/* Group (Read-only) */}
                              <td className="p-2 whitespace-nowrap">
                                <span className="px-2 py-0.5 rounded text-[11px] bg-slate-100 font-medium">
                                  {d.groupName}
                                </span>
                              </td>
                              {/* Leader Platforms */}
                              <td className="p-2">
                                <input
                                  type="number"
                                  min="2"
                                  max="10"
                                  placeholder="Trống = Không"
                                  value={d.leaderPlatforms || ''}
                                  onChange={e => {
                                    const val = e.target.value === '' ? undefined : parseInt(e.target.value, 10);
                                    setEditDetails(editDetails.map((item, i) =>
                                      i === dIdx ? { ...item, leaderPlatforms: val } : item
                                    ));
                                  }}
                                  className={`w-full px-2 py-1 text-xs border rounded font-mono bg-white ${
                                    leaderClaim ? 'border-rose-400 bg-rose-50' : 'border-slate-300'
                                  }`}
                                />
                                {leaderClaim && (
                                  <div className="text-[10px] text-rose-700 leading-tight mt-0.5">
                                    Trùng: {leaderClaim.memberName} ({leaderClaim.packageCode})
                                  </div>
                                )}
                              </td>
                              {/* Recorded Score */}
                              <td className="p-2 text-right">
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={d.recordedScore}
                                  onChange={e => {
                                    const val = e.target.value === '' ? 0 : parseFloat(e.target.value);
                                    setEditDetails(editDetails.map((item, i) =>
                                      i === dIdx ? { ...item, recordedScore: val, isManualScore: true } : item
                                    ));
                                  }}
                                  className="w-20 px-2 py-1 text-right text-xs font-mono font-bold border border-slate-300 rounded bg-white"
                                />
                              </td>
                              {/* Actions */}
                              <td className="p-2 text-center whitespace-nowrap space-x-1">
                                <button
                                  type="button"
                                  onClick={() => handleEditAddPerformerToModule(d.moduleCode)}
                                  title="Thêm người cùng module này (Rule 5.5)"
                                  className="p-1 hover:bg-slate-200 rounded text-indigo-600 cursor-pointer"
                                >
                                  <Users className="w-3.5 h-3.5" />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleDeleteEditRow(dIdx)}
                                  title="Xóa dòng này"
                                  className="p-1 hover:bg-rose-50 rounded text-slate-400 hover:text-rose-600 transition-colors cursor-pointer"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              </td>
                            </tr>
                          );
                        })}

                        {editDetails.length === 0 && (
                          <tr className="bg-indigo-50/10">
                            <td colSpan={14} className="p-4 text-center text-slate-400 text-xs italic">
                              Chưa có module nào trong gói. Vui lòng nhấn <span className="font-semibold text-indigo-600">"Thêm module"</span> ở thanh công cụ trên để thêm người thực hiện.
                            </td>
                          </tr>
                        )}
                      </React.Fragment>
                    );
                  }

                  // Normal Display Mode (Grouped by Package Code)
                  return (
                    <React.Fragment key={pkg.id}>
                      {/* Package Header Row */}
                      <tr className="bg-slate-50/80 border-t border-slate-200 text-slate-700">
                        <td colSpan={14} className="px-3 py-1.5 font-medium">
                          <div className="flex items-center justify-between text-xs">
                            <div className="flex items-center gap-2">
                              <span className="font-mono font-bold text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded text-[11px]">
                                {pkg.packageCode}
                              </span>
                              <span className="font-bold text-slate-800">{pkg.customerName}</span>
                              <span className="text-slate-400 font-mono">MST: {pkg.taxCode}</span>
                              <span className="text-slate-400">·</span>
                              <span className="text-slate-500">{pkg.details?.length || 0} module/người thực hiện</span>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-xs text-slate-500">
                                Tổng điểm gói:{' '}
                                <span className="font-bold font-mono text-indigo-700">
                                  {pkg.details?.reduce((s, d) => s + (Number(d.recordedScore) || 0), 0) || pkg.recordedScore || 0} đ
                                </span>
                              </div>

                              {!isMonthLocked && (
                                <div className="flex items-center gap-1">
                                  <button
                                    onClick={() => handleStartEditPackage(pkg)}
                                    className="px-2 py-0.5 hover:bg-indigo-50 text-indigo-600 rounded text-[11px] font-medium flex items-center gap-1 transition-colors"
                                  >
                                    <Edit2 className="w-3 h-3" />
                                    <span>Sửa gói</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleOpenDeletePackageModal(pkg)}
                                    className="px-2 py-0.5 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded text-[11px] font-medium flex items-center gap-1 transition-colors cursor-pointer"
                                    title="Xóa gói tiếp nhận này"
                                  >
                                    <Trash2 className="w-3 h-3" />
                                    <span>Xóa</span>
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        </td>
                      </tr>

                      {/* Detail Rows for this Package */}
                      {details.map((d, dIdx) => {
                        const performer = members.find(m => m.code === d.onbCode);
                        const hasLeader = d.leaderPlatforms && Number(d.leaderPlatforms) >= 2;
                        const isNonScoringSrc = packageCoreConfig.sources?.find(s => s.code === pkg.sourceCode)?.isNonScoring;

                        return (
                          <tr key={d.id || dIdx} className="hover:bg-slate-50/50 transition-colors">
                            {/* 1. Mã số thuế */}
                            <td className="p-3 font-mono font-medium text-slate-900 whitespace-nowrap">
                              {pkg.taxCode}
                            </td>

                            {/* 2. Tên khách hàng */}
                            <td className="p-3 font-medium text-slate-800">
                              {pkg.customerName}
                            </td>

                            {/* 3. Ngày tiếp nhận */}
                            <td className="p-3 font-mono text-slate-600 whitespace-nowrap">
                              {pkg.receptionDate}
                            </td>

                            {/* 4. Tháng tiếp nhận */}
                            <td className="p-3 font-mono text-slate-500 whitespace-nowrap">
                              {pkg.monthYear}
                            </td>

                            {/* 5. Nguồn (joined from Core display name) */}
                            <td className="p-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                isNonScoringSrc ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-700'
                              }`}>
                                {pkg.sourceName || pkg.sourceCode}
                              </span>
                            </td>

                            {/* 6. Phân loại gói */}
                            <td className="p-3 whitespace-nowrap">
                              <span className={`px-2 py-0.5 rounded text-[11px] font-medium ${
                                pkg.packageClass === 'Tiếp nhận mới' || pkg.packageType === 'Mới tiếp nhận'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : 'bg-blue-50 text-blue-700 border border-blue-200'
                              }`}>
                                {pkg.packageClass || pkg.packageType}
                              </span>
                            </td>

                            {/* 7. Phân hạng khách hàng */}
                            <td className="p-3 whitespace-nowrap font-medium text-slate-700">
                              <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-slate-100">
                                {pkg.customerTier}
                              </span>
                            </td>

                            {/* 8. Loại hình */}
                            <td className="p-3 whitespace-nowrap text-slate-700">
                              {pkg.workForm}
                            </td>

                            {/* 9. Module tiếp nhận */}
                            <td className="p-3 font-semibold text-slate-900 whitespace-nowrap">
                              {d.moduleName || d.moduleCode}
                            </td>

                            {/* 10. Người thực hiện */}
                            <td className="p-3 whitespace-nowrap">
                              <div className="font-medium text-slate-900">
                                {performer?.fullName || d.onbCode}
                              </div>
                              <div className="text-[10px] text-slate-400 font-mono">
                                {d.onbCode}
                              </div>
                            </td>

                            {/* 11. Nhóm (nhóm của người thực hiện - xác định ở core tại Ngày tiếp nhận) */}
                            <td className="p-3 whitespace-nowrap">
                              <span className="px-2 py-0.5 rounded-full text-[11px] font-medium bg-slate-100 text-slate-700 border border-slate-200">
                                {d.groupName || 'Chưa xác định nhóm'}
                              </span>
                            </td>

                            {/* 12. Leader số nền tảng */}
                            <td className="p-3 whitespace-nowrap">
                              {hasLeader ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 border border-amber-300">
                                  <Award className="w-3 h-3 text-amber-600" />
                                  <span>{d.leaderPlatforms} nền tảng (+{d.leaderScore || 0}đ)</span>
                                </span>
                              ) : (
                                <span className="text-slate-300">-</span>
                              )}
                            </td>

                            {/* 13. Điểm tiếp nhận */}
                            <td className="p-3 text-right whitespace-nowrap">
                              <span className="font-mono font-bold text-sm text-indigo-700">
                                {d.recordedScore} đ
                              </span>
                              {d.scoreFormula && (
                                <div className="text-[10px] text-slate-400 font-sans" title={d.scoreFormula}>
                                  {d.isManualScore ? 'Sửa tay' : 'Thiết lập hệ thống'}
                                </div>
                              )}
                            </td>

                            {/* 14. Thao tác */}
                            <td className="p-3 text-center whitespace-nowrap">
                              {!isMonthLocked ? (
                                <div className="inline-flex items-center gap-1">
                                  <button
                                    onClick={() => handleStartEditPackage(pkg)}
                                    title="Chỉnh sửa gói này"
                                    className="p-1 hover:bg-slate-100 rounded text-slate-500 hover:text-indigo-600"
                                  >
                                    <Edit2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              ) : (
                                <span className="text-slate-300 text-[11px] italic">Chỉ đọc</span>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </React.Fragment>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Leader Conflict Reconciliation Modal (Section 6.3) */}
      {isConflictModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-xl max-w-3xl w-full p-6 space-y-4 max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <ShieldAlert className="w-5 h-5 text-rose-600" />
                <h3 className="text-base font-bold text-slate-900">Danh sách đối soát xung đột Leader lịch sử</h3>
              </div>
              <button
                onClick={() => setIsConflictModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <p className="text-xs text-slate-500">
              Theo quy định mục 6.3: Nếu dữ liệu lịch sử đã có nhiều khai báo Leader cùng một mã số thuế, hệ thống liệt kê để đối soát;
              không tự ý xóa hoặc sửa KPI lịch sử. Các bản ghi mới vẫn bị chặn không cho khai báo thêm Leader cho các MST này.
            </p>

            {historicalConflicts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-400 bg-slate-50 rounded-lg">
                Không phát hiện xung đột Leader nào trong toàn bộ hệ thống.
              </div>
            ) : (
              <div className="space-y-3">
                {historicalConflicts.map(item => (
                  <div key={item.taxCode} className="border border-rose-200 rounded-lg p-3 bg-rose-50/40 space-y-2">
                    <div className="flex items-center justify-between text-xs font-bold text-rose-900">
                      <span>Mã số thuế: {item.taxCode}</span>
                      <span className="bg-rose-200 text-rose-800 px-2 py-0.5 rounded text-[10px]">
                        {item.count} khai báo Leader
                      </span>
                    </div>

                    <div className="space-y-1.5">
                      {item.claims.map((claim: any, idx: number) => (
                        <div key={idx} className="bg-white p-2 rounded border border-rose-100 text-xs flex items-center justify-between">
                          <div>
                            <span className="font-semibold text-slate-800">{claim.memberName}</span>
                            <span className="text-slate-400 mx-1.5">·</span>
                            <span className="font-mono text-indigo-600">{claim.packageCode}</span>
                            <span className="text-slate-400 mx-1.5">·</span>
                            <span className="text-slate-600">{claim.moduleName}</span>
                          </div>
                          <div className="font-mono text-[11px] text-amber-700 font-bold">
                            {claim.leaderPlatforms} nền tảng (Tháng {claim.monthYear})
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <div className="pt-3 border-t border-slate-100 flex justify-end">
              <button
                onClick={() => setIsConflictModalOpen(false)}
                className="px-4 py-2 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white rounded-lg text-xs font-semibold cursor-pointer shadow-xs transition-colors"
              >
                Đóng đối soát
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Xác nhận bỏ thay đổi khi đóng biểu mẫu tạo mới */}
      {isConfirmDiscardComposerOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-100 rounded-full text-amber-700 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 text-sm">Xác nhận bỏ thay đổi</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Bạn có thay đổi chưa lưu. Bạn có muốn bỏ các thay đổi và đóng biểu mẫu không?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsConfirmDiscardComposerOpen(false)}
                className="px-3.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-md font-medium transition-colors cursor-pointer"
              >
                Tiếp tục nhập
              </button>
              <button
                type="button"
                onClick={handleForceCloseComposer}
                className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-md font-semibold transition-colors cursor-pointer shadow-xs"
              >
                Bỏ thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Xác nhận bỏ thay đổi khi hủy sửa gói */}
      {isConfirmDiscardEditOpen && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-amber-100 rounded-full text-amber-700 shrink-0 mt-0.5">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 text-sm">Xác nhận bỏ thay đổi</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Bạn có thay đổi chưa lưu trong gói này. Bạn có muốn bỏ các thay đổi và đóng biểu mẫu không?
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setIsConfirmDiscardEditOpen(false)}
                className="px-3.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-md font-medium transition-colors cursor-pointer"
              >
                Tiếp tục sửa
              </button>
              <button
                type="button"
                onClick={handleForceCloseEdit}
                className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-md font-semibold transition-colors cursor-pointer shadow-xs"
              >
                Bỏ thay đổi
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: Xác nhận xóa gói tiếp nhận trên danh sách */}
      {deleteConfirmPackage && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl shadow-2xl max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 rounded-full text-rose-600 shrink-0 mt-0.5">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 text-sm">Xác nhận xóa gói tiếp nhận</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Bạn có chắc chắn muốn xóa gói tiếp nhận này cùng toàn bộ các dòng module chi tiết liên quan không?
                </p>
              </div>
            </div>

            {/* Thông tin đối chiếu nhận diện đúng gói */}
            <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Mã gói:</span>
                <span className="font-bold font-mono text-indigo-700 bg-indigo-50 border border-indigo-200 px-2 py-0.5 rounded">
                  {deleteConfirmPackage.packageCode || deleteConfirmPackage.id}
                </span>
              </div>
              <div className="flex items-start justify-between gap-2">
                <span className="text-slate-500 shrink-0">Khách hàng:</span>
                <span className="font-semibold text-slate-900 text-right">
                  {deleteConfirmPackage.customerName}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Mã số thuế:</span>
                <span className="font-mono text-slate-800">
                  {deleteConfirmPackage.taxCode || '-'}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Ngày tiếp nhận:</span>
                <span className="font-mono text-slate-800">
                  {formatDateVi(deleteConfirmPackage.receptionDate)} (Tháng {deleteConfirmPackage.monthYear})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Số module / người thực hiện:</span>
                <span className="font-medium text-slate-800">
                  {deleteConfirmPackage.details?.length || 0} dòng
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Tổng điểm gói:</span>
                <span className="font-bold font-mono text-indigo-700">
                  {deleteConfirmPackage.details?.reduce((s, d) => s + (Number(d.recordedScore) || 0), 0) || deleteConfirmPackage.recordedScore || 0} điểm
                </span>
              </div>
            </div>

            {deletePackageError && (
              <div className="p-2.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md flex items-start gap-2">
                <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{deletePackageError}</div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingPackage}
                onClick={() => {
                  setDeleteConfirmPackage(null);
                  setDeletePackageError(null);
                }}
                className="px-3.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-md font-medium transition-colors disabled:opacity-50 cursor-pointer"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeletingPackage}
                onClick={handleExecuteDeletePackage}
                className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-md font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 cursor-pointer shadow-xs"
              >
                {isDeletingPackage ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa gói</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* Excel Import Modal */}
      <ExcelImportModal
        isOpen={isExcelImportModalOpen}
        onClose={() => setIsExcelImportModalOpen(false)}
        initialTargetType="packages"
        allowChangeTarget={false}
        monthYear={monthYear}
        onMonthChange={onMonthChange}
        isMonthLocked={isMonthLocked}
        members={members}
        workTypes={workTypes}
        products={products}
        referenceScores={referenceScores}
        packageCoreConfig={packageCoreConfig}
        packages={packages}
        progressTasks={progressTasks}
        customers={customers}
        session={session}
        onSuccessImport={async () => {
          setIsExcelImportModalOpen(false);
          if (onRefreshData) {
            onRefreshData();
          }
        }}
      />
    </div>
  );
};
