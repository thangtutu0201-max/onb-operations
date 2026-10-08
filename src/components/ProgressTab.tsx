import React, { useState, useMemo, useEffect, useCallback } from 'react';
import {
  ProgressTask,
  ONBMember,
  WorkTypeCatalog,
  ProductCatalog,
  ReferenceScore,
  CurrentUserSession
} from '../types';
import {
  Plus,
  Search,
  Filter,
  Users,
  Edit2,
  Trash2,
  Lock,
  Copy,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  HelpCircle,
  X,
  Save,
  RotateCcw,
  Check,
  Calendar,
  Layers,
  ArrowRight,
  FileSpreadsheet
} from 'lucide-react';
import { ExcelImportModal } from './ExcelImportModal';
import { CustomerPackage, Customer, PackageCoreConfig } from '../types';

interface ProgressTabProps {
  tasks: ProgressTask[];
  members: ONBMember[];
  workTypes: WorkTypeCatalog[];
  products: ProductCatalog[];
  referenceScores: ReferenceScore[];
  monthYear: string;
  onMonthChange?: (m: string) => void;
  isMonthLocked: boolean;
  session: CurrentUserSession | null;
  onAddTask: (task: Partial<ProgressTask>) => Promise<void>;
  onBatchAddTasks: (items: Array<Partial<ProgressTask>>) => Promise<any>;
  onUpdateTask: (id: string, task: Partial<ProgressTask>) => Promise<void>;
  onDeleteTask: (id: string) => Promise<void>;
  packages?: CustomerPackage[];
  customers?: Customer[];
  packageCoreConfig?: PackageCoreConfig;
  onRefreshData?: () => void;
}

// Helper to clean currency input and parse to integer VND
export function parseCurrencyInput(value: string | number): number {
  if (typeof value === 'number') return isNaN(value) ? 0 : Math.max(0, Math.floor(value));
  if (!value || typeof value !== 'string') return 0;
  // Replace anything that is not a digit
  const digits = value.replace(/[^\d]/g, '');
  return digits ? parseInt(digits, 10) : 0;
}

// Format integer to Vietnamese thousands dot representation: e.g. 5000000 -> "5.000.000"
export function formatCurrencyDisplay(value: string | number): string {
  if (value === '' || value === undefined || value === null) return '';
  const num = typeof value === 'number' ? value : parseCurrencyInput(value);
  if (isNaN(num) || num === 0) return '';
  return num.toLocaleString('vi-VN');
}

export function formatDateVi(dateStr: string): string {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}/${parts[0]}`;
  }
  return dateStr;
}

// Clean quantity input for non-currency work types (allows 0.5, 1, 1.5, 2 etc.)
export function parseQuantityInput(value: string | number): number {
  if (typeof value === 'number') return isNaN(value) ? 0 : Math.max(0, value);
  if (!value || typeof value !== 'string') return 0;
  const str = value.replace(/,/g, '.').trim();
  const num = parseFloat(str);
  return isNaN(num) ? 0 : Math.max(0, num);
}

// Format score nicely: if whole number, show integer; if decimal, show at most 2 decimals
export function formatKpiScore(score: number): number {
  return Math.round(score * 100) / 100;
}

// Check if work type is currency-based (Tiền về / VNĐ)
export function isCurrencyWorkType(wtCode: string, workTypes: WorkTypeCatalog[]): boolean {
  if (wtCode === 'TIEN_VE') return true;
  const wt = workTypes.find(w => w.code === wtCode || w.name === wtCode);
  return wt?.unit === 'VNĐ' || wt?.calculationMethod === 'AMOUNT_DIVIDE';
}

export interface CoreScoreEvalResult {
  status: 'FOUND' | 'NOT_FOUND' | 'AMBIGUOUS' | 'INVALID_RATE';
  suggestedScore: number;
  conversionRate?: number;
  calculationMethod: 'QUANTITY_MULTIPLY' | 'AMOUNT_DIVIDE';
  guideText: string;
  formulaText: string;
  message: string;
  ruleId?: string;
}

// Comprehensive Core Score evaluation supporting both Quantity Multiply and Amount Divide
export function evaluateCoreScore(
  referenceScores: ReferenceScore[],
  workTypes: WorkTypeCatalog[],
  workTypeCode: string,
  productCode: string | undefined,
  date: string,
  rawQuantityOrAmount: string | number
): CoreScoreEvalResult {
  if (!workTypeCode) {
    return {
      status: 'NOT_FOUND',
      suggestedScore: 0,
      calculationMethod: 'QUANTITY_MULTIPLY',
      guideText: '',
      formulaText: '',
      message: 'Chưa chọn loại việc'
    };
  }

  const wt = workTypes.find(w => w.code === workTypeCode || w.name === workTypeCode);
  const isCurrency = isCurrencyWorkType(workTypeCode, workTypes);
  const calcMethod = isCurrency ? 'AMOUNT_DIVIDE' : (wt?.calculationMethod || 'QUANTITY_MULTIPLY');

  // Filter rules matching workTypeCode and effective date range
  const dateEffectiveRules = referenceScores.filter(rs => {
    if (rs.isActive === false) return false;
    if (rs.workTypeCode !== workTypeCode && wt && rs.workTypeCode !== wt.code) return false;
    if (rs.effectiveFrom && rs.effectiveFrom > date) return false;
    if (rs.effectiveTo && rs.effectiveTo < date) return false;
    return true;
  });

  if (dateEffectiveRules.length === 0) {
    return {
      status: 'NOT_FOUND',
      suggestedScore: 0,
      calculationMethod: calcMethod,
      guideText: '',
      formulaText: '',
      message: 'Chưa có điểm tham chiếu'
    };
  }

  // If productCode provided, match exact product rule first
  let matchedRule: ReferenceScore | undefined;
  if (productCode) {
    const productRules = dateEffectiveRules.filter(rs => rs.productCode === productCode);
    if (productRules.length === 1) {
      matchedRule = productRules[0];
    } else if (productRules.length > 1) {
      return {
        status: 'AMBIGUOUS',
        suggestedScore: 0,
        calculationMethod: calcMethod,
        guideText: '',
        formulaText: '',
        message: 'Cấu hình điểm chưa rõ'
      };
    }
  }

  // Fallback to generic rule (without productCode)
  if (!matchedRule) {
    const genericRules = dateEffectiveRules.filter(rs => !rs.productCode);
    if (genericRules.length === 1) {
      matchedRule = genericRules[0];
    } else if (genericRules.length > 1) {
      return {
        status: 'AMBIGUOUS',
        suggestedScore: 0,
        calculationMethod: calcMethod,
        guideText: '',
        formulaText: '',
        message: 'Cấu hình điểm chưa rõ'
      };
    } else if (!productCode && dateEffectiveRules.some(rs => rs.productCode) && wt?.requiresProduct) {
      return {
        status: 'NOT_FOUND',
        suggestedScore: 0,
        calculationMethod: calcMethod,
        guideText: '',
        formulaText: '',
        message: 'Cần chọn module để tra điểm'
      };
    } else {
      matchedRule = dateEffectiveRules[0];
    }
  }

  if (!matchedRule) {
    return {
      status: 'NOT_FOUND',
      suggestedScore: 0,
      calculationMethod: calcMethod,
      guideText: '',
      formulaText: '',
      message: 'Chưa có điểm tham chiếu'
    };
  }

  // Now calculate based on method
  if (calcMethod === 'AMOUNT_DIVIDE') {
    // Conversion rate MUST come from Core (referenceScore or workType), not hardcoded in source!
    const conversionRate = matchedRule.conversionRate || wt?.conversionRate || 0;
    if (!conversionRate || conversionRate <= 0) {
      return {
        status: 'INVALID_RATE',
        suggestedScore: 0,
        conversionRate,
        calculationMethod: calcMethod,
        guideText: 'Chưa có mức quy đổi hợp lệ tại Thiết lập hệ thống',
        formulaText: '',
        message: 'Chưa có mức quy đổi hợp lệ tại Thiết lập hệ thống',
        ruleId: matchedRule.id
      };
    }

    const guideText = `Quy đổi: ${conversionRate.toLocaleString('vi-VN')} VNĐ = 1 điểm`;
    const amount = parseCurrencyInput(rawQuantityOrAmount);

    if (amount > 0) {
      const rawScore = amount / conversionRate;
      const suggestedScore = formatKpiScore(rawScore);
      const formulaText = `${amount.toLocaleString('vi-VN')} ÷ ${conversionRate.toLocaleString('vi-VN')} = ${suggestedScore} điểm`;
      return {
        status: 'FOUND',
        suggestedScore,
        conversionRate,
        calculationMethod: calcMethod,
        guideText,
        formulaText,
        message: `✓ Quy đổi Core (${suggestedScore}đ)`,
        ruleId: matchedRule.id
      };
    } else {
      return {
        status: 'FOUND',
        suggestedScore: 0,
        conversionRate,
        calculationMethod: calcMethod,
        guideText,
        formulaText: `0 ÷ ${conversionRate.toLocaleString('vi-VN')} = 0 điểm`,
        message: guideText,
        ruleId: matchedRule.id
      };
    }
  } else {
    // Quantity Multiply (Khối lượng × Điểm/đơn vị)
    const baseScore = matchedRule.suggestedScore ?? wt?.defaultScorePerUnit ?? 0;
    const unit = wt?.unit || 'Buổi';
    const guideText = `${baseScore} điểm / ${unit}`;
    const qty = parseQuantityInput(rawQuantityOrAmount);

    if (qty > 0) {
      const suggestedScore = Math.round(baseScore * qty * 10) / 10;
      const formulaText = `${qty} ${unit} × ${baseScore}đ = ${suggestedScore} điểm`;
      return {
        status: 'FOUND',
        suggestedScore,
        calculationMethod: calcMethod,
        guideText,
        formulaText,
        message: `✓ Core (${suggestedScore}đ)`,
        ruleId: matchedRule.id
      };
    } else {
      return {
        status: 'FOUND',
        suggestedScore: 0,
        calculationMethod: calcMethod,
        guideText,
        formulaText: `0 ${unit} × ${baseScore}đ = 0 điểm`,
        message: guideText,
        ruleId: matchedRule.id
      };
    }
  }
}

// Backward-compatible lookupCoreScore helper
export function lookupCoreScore(
  referenceScores: ReferenceScore[],
  workTypeCode: string,
  productCode: string | undefined,
  date: string
): {
  status: 'FOUND' | 'NOT_FOUND' | 'AMBIGUOUS';
  score?: number;
  conversionRate?: number;
  message?: string;
  ruleId?: string;
} {
  const dateEffectiveRules = referenceScores.filter(rs => {
    if (rs.isActive === false) return false;
    if (rs.workTypeCode !== workTypeCode) return false;
    if (rs.effectiveFrom && rs.effectiveFrom > date) return false;
    if (rs.effectiveTo && rs.effectiveTo < date) return false;
    return true;
  });

  if (dateEffectiveRules.length === 0) {
    return { status: 'NOT_FOUND', message: 'Chưa có điểm tham chiếu' };
  }

  if (productCode) {
    const productRules = dateEffectiveRules.filter(rs => rs.productCode === productCode);
    if (productRules.length === 1) {
      return { status: 'FOUND', score: productRules[0].suggestedScore, conversionRate: productRules[0].conversionRate, ruleId: productRules[0].id };
    }
    if (productRules.length > 1) {
      return { status: 'AMBIGUOUS', message: 'Cấu hình điểm chưa rõ' };
    }
  }

  const genericRules = dateEffectiveRules.filter(rs => !rs.productCode);
  if (genericRules.length === 1) {
    return { status: 'FOUND', score: genericRules[0].suggestedScore, conversionRate: genericRules[0].conversionRate, ruleId: genericRules[0].id };
  }
  if (genericRules.length > 1) {
    return { status: 'AMBIGUOUS', message: 'Cấu hình điểm chưa rõ' };
  }

  if (!productCode && dateEffectiveRules.some(rs => rs.productCode)) {
    return { status: 'NOT_FOUND', message: 'Cần chọn module để tra điểm' };
  }

  return { status: 'NOT_FOUND', message: 'Chưa có điểm tham chiếu' };
}

// Interface for each row in the batch entry table
interface DraftRow {
  id: string;
  primaryOnbCode: string;
  date: string;
  taskName: string;
  workTypeCode: string;
  productCode: string;
  quantity: string | number; // Khối lượng (e.g. 1, 0.5) hoặc Số tiền VNĐ (e.g. "5.000.000")
  unit: string; // Đơn vị: Buổi, Giờ, Gói, VNĐ...
  recordedScore: string | number;
  isManualScore: boolean;
  suggestedScore: number;
  scoreStatus: 'FOUND' | 'NOT_FOUND' | 'AMBIGUOUS' | 'INVALID_RATE';
  scoreMessage?: string;
  guideText?: string;
  formulaText?: string;
  conversionRate?: number;
  notes: string;
  error?: string;
}

export const ProgressTab: React.FC<ProgressTabProps> = ({
  tasks,
  members,
  workTypes,
  products,
  referenceScores,
  monthYear,
  onMonthChange,
  isMonthLocked,
  session,
  onAddTask,
  onBatchAddTasks,
  onUpdateTask,
  onDeleteTask,
  packages = [],
  customers = [],
  packageCoreConfig = {
    sources: [],
    classifications: [],
    customerTiers: [],
    workTypes: [],
    leaderPlatforms: [],
    modules: []
  },
  onRefreshData
}) => {
  // Excel Import Modal State
  const [isExcelImportModalOpen, setIsExcelImportModalOpen] = useState(false);

  // Per-User Filter Configuration
  const DEFAULT_SYSTEM_MONTH = '2026-10';
  const currentUserId = session?.onbCode || 'guest';
  const getFilterStorageKey = useCallback((code: string) => `onb_progress_filters_${code}`, []);

  // Filters for main task list
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedMember, setSelectedMember] = useState('');
  const [selectedWorkType, setSelectedWorkType] = useState('');
  const [selectedProduct, setSelectedProduct] = useState('');

  // Delete Confirmation Modal State
  const [deleteConfirmTask, setDeleteConfirmTask] = useState<ProgressTask | null>(null);
  const [isDeletingTask, setIsDeletingTask] = useState(false);
  const [deleteTaskError, setDeleteTaskError] = useState('');

  // Ref tracking latest filter values atomically for current user
  const filtersRef = React.useRef({
    searchTerm: '',
    selectedMember: '',
    selectedWorkType: '',
    selectedProduct: '',
    monthYear: monthYear || DEFAULT_SYSTEM_MONTH
  });

  // Track currently loaded account ID to avoid cross-saving during switch
  const loadedUserRef = React.useRef<string>('');

  // Keep monthYear in sync with prop if changed externally
  useEffect(() => {
    filtersRef.current.monthYear = monthYear;
  }, [monthYear]);

  // Load per-user filter config whenever session user changes
  useEffect(() => {
    try {
      const storageKey = getFilterStorageKey(currentUserId);
      const raw = localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw);
        const nextFilters = {
          searchTerm: parsed.searchTerm || '',
          selectedMember: parsed.selectedMember || '',
          selectedWorkType: parsed.selectedWorkType || '',
          selectedProduct: parsed.selectedProduct || '',
          monthYear: parsed.monthYear || DEFAULT_SYSTEM_MONTH
        };
        filtersRef.current = nextFilters;
        setSearchTerm(nextFilters.searchTerm);
        setSelectedMember(nextFilters.selectedMember);
        setSelectedWorkType(nextFilters.selectedWorkType);
        setSelectedProduct(nextFilters.selectedProduct);
        if (parsed.monthYear && onMonthChange && parsed.monthYear !== monthYear) {
          onMonthChange(parsed.monthYear);
        }
      } else {
        // Default filter when account has no custom saved configuration
        const defaultFilters = {
          searchTerm: '',
          selectedMember: '',
          selectedWorkType: '',
          selectedProduct: '',
          monthYear: DEFAULT_SYSTEM_MONTH
        };
        filtersRef.current = defaultFilters;
        setSearchTerm('');
        setSelectedMember('');
        setSelectedWorkType('');
        setSelectedProduct('');
        if (onMonthChange && monthYear !== DEFAULT_SYSTEM_MONTH) {
          onMonthChange(DEFAULT_SYSTEM_MONTH);
        }
      }
      loadedUserRef.current = currentUserId;
    } catch (err) {
      console.error('Error loading user filter:', err);
    }
  }, [currentUserId, getFilterStorageKey]);

  // Save filter changes for current user
  const persistUserFilter = useCallback((overrides: {
    searchTerm?: string;
    selectedMember?: string;
    selectedWorkType?: string;
    selectedProduct?: string;
    monthYear?: string;
  }) => {
    if (!currentUserId || loadedUserRef.current !== currentUserId) return;
    try {
      const updated = {
        ...filtersRef.current,
        ...overrides
      };
      filtersRef.current = updated;
      const storageKey = getFilterStorageKey(currentUserId);
      localStorage.setItem(storageKey, JSON.stringify(updated));
    } catch (err) {
      console.error('Error saving user filter:', err);
    }
  }, [currentUserId, getFilterStorageKey]);

  const handleSearchChange = (val: string) => {
    setSearchTerm(val);
    persistUserFilter({ searchTerm: val });
  };

  const handleMemberChange = (val: string) => {
    setSelectedMember(val);
    persistUserFilter({ selectedMember: val });
  };

  const handleWorkTypeChange = (val: string) => {
    setSelectedWorkType(val);
    persistUserFilter({ selectedWorkType: val });
  };

  const handleProductChange = (val: string) => {
    setSelectedProduct(val);
    persistUserFilter({ selectedProduct: val });
  };

  const handleMonthYearChange = (m: string) => {
    if (onMonthChange) {
      onMonthChange(m);
    }
    persistUserFilter({ monthYear: m });
  };

  const handleResetFilters = () => {
    const defaultFilters = {
      searchTerm: '',
      selectedMember: '',
      selectedWorkType: '',
      selectedProduct: '',
      monthYear: DEFAULT_SYSTEM_MONTH
    };
    filtersRef.current = defaultFilters;
    setSearchTerm('');
    setSelectedMember('');
    setSelectedWorkType('');
    setSelectedProduct('');
    if (onMonthChange && monthYear !== DEFAULT_SYSTEM_MONTH) {
      onMonthChange(DEFAULT_SYSTEM_MONTH);
    }
    try {
      localStorage.removeItem(getFilterStorageKey(currentUserId));
    } catch (err) {
      console.error('Error removing user filter:', err);
    }
  };

  const handleOpenDeleteConfirm = (task: ProgressTask) => {
    setDeleteTaskError('');
    setDeleteConfirmTask(task);
  };

  const handleExecuteDeleteTask = async () => {
    if (!deleteConfirmTask) return;
    setIsDeletingTask(true);
    setDeleteTaskError('');
    try {
      await onDeleteTask(deleteConfirmTask.id);
      setDeleteConfirmTask(null);
    } catch (err: any) {
      setDeleteTaskError(err.message || 'Lỗi khi xóa bản ghi tiến độ.');
    } finally {
      setIsDeletingTask(false);
    }
  };

  // Default values
  const defaultOnbCode = useMemo(() => session?.onbCode || members[0]?.code || 'DTHANG', [session, members]);
  const defaultDate = useMemo(() => {
    // Current date if in viewed month, otherwise first day of viewed month
    const today = '2026-10-05';
    return today.startsWith(monthYear) ? today : `${monthYear}-05`;
  }, [monthYear]);

  // Active work types from Core for selecting in new records
  const activeWorkTypes = useMemo(() => {
    const list = workTypes.filter(w => w.isActive !== false);
    return list.length > 0 ? list : workTypes;
  }, [workTypes]);

  const defaultWorkTypeCode = useMemo(() => activeWorkTypes[0]?.code || 'TVTK_TT', [activeWorkTypes]);

  // Helper to get unit configuration of a work type from Core
  const getWorkTypeUnit = useCallback(
    (wtCode: string): string => {
      const wt = workTypes.find(w => w.code === wtCode || w.name === wtCode);
      return wt?.unit || 'Buổi';
    },
    [workTypes]
  );

  // Fast Batch Entry State
  const [isBatchOpen, setIsBatchOpen] = useState(false);
  const [isSavingBatch, setIsSavingBatch] = useState(false);
  const [draftRows, setDraftRows] = useState<DraftRow[]>([]);

  // Single Edit Modal State
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editingTask, setEditingTask] = useState<ProgressTask | null>(null);
  const [singleForm, setSingleForm] = useState({
    code: '',
    primaryOnbCode: '',
    date: '',
    taskName: '',
    workTypeCode: '',
    productCode: '',
    quantity: '' as number | string,
    unit: 'Buổi',
    recordedScore: '' as number | string,
    isManualScore: false,
    suggestedScore: 0,
    scoreStatus: 'FOUND' as 'FOUND' | 'NOT_FOUND' | 'AMBIGUOUS' | 'INVALID_RATE',
    conversionRate: undefined as number | undefined,
    guideText: '',
    formulaText: '',
    notes: ''
  });
  const [singleFormError, setSingleFormError] = useState('');
  const [batchModalError, setBatchModalError] = useState('');
  const [batchSuccessNotice, setBatchSuccessNotice] = useState('');

  // Create initial draft row
  const createNewDraftRow = useCallback(
    (custom?: Partial<DraftRow>): DraftRow => {
      const pCode = custom?.primaryOnbCode || defaultOnbCode;
      const d = custom?.date || defaultDate;
      const wt = custom?.workTypeCode || defaultWorkTypeCode;
      const prod = custom?.productCode || '';
      const isCur = isCurrencyWorkType(wt, workTypes);
      const unit = custom?.unit || (isCur ? 'VNĐ' : getWorkTypeUnit(wt));
      const qty = custom?.quantity !== undefined ? custom.quantity : (isCur ? '' : 1);

      const evalResult = evaluateCoreScore(referenceScores, workTypes, wt, prod, d, qty);
      const initialScore = custom?.recordedScore !== undefined
        ? custom.recordedScore
        : (evalResult.status === 'FOUND' && (qty !== '' || !isCur) ? evalResult.suggestedScore : '');

      return {
        id: `row_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        primaryOnbCode: pCode,
        date: d,
        taskName: custom?.taskName || '',
        workTypeCode: wt,
        productCode: prod,
        quantity: isCur && qty !== '' ? formatCurrencyDisplay(qty) : qty,
        unit,
        recordedScore: initialScore,
        isManualScore: custom?.isManualScore || false,
        suggestedScore: evalResult.suggestedScore,
        scoreStatus: evalResult.status,
        scoreMessage: evalResult.message,
        guideText: evalResult.guideText,
        formulaText: evalResult.formulaText,
        conversionRate: evalResult.conversionRate,
        notes: custom?.notes || '',
        error: undefined
      };
    },
    [defaultOnbCode, defaultDate, defaultWorkTypeCode, referenceScores, workTypes, getWorkTypeUnit]
  );

  // Open Batch Entry View: Mặc định chỉ có ĐÚNG 1 DÒNG NHẬP
  const handleOpenBatch = () => {
    const rows = [createNewDraftRow()];
    setDraftRows(rows);
    setIsBatchOpen(true);
  };

  // Add a new row to batch
  const handleAddBatchRow = () => {
    setDraftRows(prev => [...prev, createNewDraftRow()]);
  };

  // Duplicate an existing row
  const handleDuplicateRow = (index: number) => {
    setDraftRows(prev => {
      const target = prev[index];
      const cloned = createNewDraftRow({
        primaryOnbCode: target.primaryOnbCode,
        date: target.date,
        taskName: target.taskName,
        workTypeCode: target.workTypeCode,
        productCode: target.productCode,
        quantity: target.quantity,
        unit: target.unit,
        recordedScore: target.recordedScore,
        isManualScore: target.isManualScore,
        notes: target.notes
      });
      const next = [...prev];
      next.splice(index + 1, 0, cloned);
      return next;
    });
  };

  // Delete a row
  const handleDeleteBatchRow = (index: number) => {
    setDraftRows(prev => {
      if (prev.length <= 1) {
        // Keep at least 1 clean row
        return [createNewDraftRow()];
      }
      return prev.filter((_, idx) => idx !== index);
    });
  };

  // Handle cell edits in batch table
  const handleBatchCellChange = (index: number, field: keyof DraftRow, value: any) => {
    setDraftRows(prev => {
      const next = [...prev];
      const oldRow = next[index];
      const row = { ...oldRow, [field]: value, error: undefined };

      // If workTypeCode changed -> handle unit and reset inappropriate quantities
      if (field === 'workTypeCode') {
        const prevIsCur = isCurrencyWorkType(oldRow.workTypeCode, workTypes);
        const nextIsCur = isCurrencyWorkType(value, workTypes);
        row.unit = nextIsCur ? 'VNĐ' : getWorkTypeUnit(value);

        if (prevIsCur !== nextIsCur) {
          // Switch between currency and quantity: CLEAR inappropriate input
          row.quantity = nextIsCur ? '' : 1;
          row.recordedScore = '';
          row.isManualScore = false;
        }
      }

      // If quantity changed and it's currency: format input with thousand separators
      if (field === 'quantity') {
        const isCur = isCurrencyWorkType(row.workTypeCode, workTypes);
        if (isCur) {
          const num = parseCurrencyInput(value);
          row.quantity = value === '' ? '' : num.toLocaleString('vi-VN');
        }
      }

      // If workTypeCode, productCode, date, or quantity changed -> re-evaluate Core Score
      if (field === 'workTypeCode' || field === 'productCode' || field === 'date' || field === 'quantity') {
        const wt = row.workTypeCode;
        const prod = row.productCode;
        const d = row.date;
        const isCur = isCurrencyWorkType(wt, workTypes);

        const evalResult = evaluateCoreScore(referenceScores, workTypes, wt, prod, d, row.quantity);
        row.suggestedScore = evalResult.suggestedScore;
        row.scoreStatus = evalResult.status;
        row.scoreMessage = evalResult.message;
        row.guideText = evalResult.guideText;
        row.formulaText = evalResult.formulaText;
        row.conversionRate = evalResult.conversionRate;

        // Auto-update score if user hasn't typed manually
        if (!row.isManualScore) {
          if (evalResult.status === 'FOUND') {
            if (isCur) {
              row.recordedScore = row.quantity === '' ? '' : evalResult.suggestedScore;
            } else {
              row.recordedScore = evalResult.suggestedScore;
            }
          } else {
            row.recordedScore = '';
          }
        }
      }

      // If user typed in recordedScore directly -> mark as manual override
      if (field === 'recordedScore') {
        row.isManualScore = true;
      }

      next[index] = row;
      return next;
    });
  };

  // Reset row's score to Core recommendation
  const handleResetRowScore = (index: number) => {
    setDraftRows(prev => {
      const next = [...prev];
      const row = { ...next[index] };
      const evalResult = evaluateCoreScore(referenceScores, workTypes, row.workTypeCode, row.productCode, row.date, row.quantity);
      if (evalResult.status === 'FOUND') {
        row.suggestedScore = evalResult.suggestedScore;
        row.recordedScore = evalResult.suggestedScore;
        row.scoreStatus = 'FOUND';
        row.scoreMessage = evalResult.message;
        row.guideText = evalResult.guideText;
        row.formulaText = evalResult.formulaText;
        row.conversionRate = evalResult.conversionRate;
        row.isManualScore = false;
        row.error = undefined;
      }
      next[index] = row;
      return next;
    });
  };

  // Save All Batch Rows safely
  const handleSaveAllBatch = async () => {
    setBatchModalError('');
    // 1. Identify rows with data vs completely blank rows
    const rowsWithTask = draftRows.filter(r => r.taskName.trim().length > 0);
    if (rowsWithTask.length === 0) {
      setBatchModalError('Chưa có công việc nào được nhập nội dung nghiệp vụ (Tên công việc / Nhiệm vụ). Dòng mặc định chưa nhập sẽ không được lưu vào hệ thống.');
      return;
    }

    let hasValidationErrors = false;
    const validatedRows = draftRows.map((row) => {
      const isBlank = !row.taskName.trim() && !row.notes.trim();

      if (isBlank) {
        return { ...row, error: undefined };
      }

      // Validate mandatory fields
      if (!row.taskName.trim()) {
        hasValidationErrors = true;
        return { ...row, error: 'Vui lòng nhập Tên công việc / Nhiệm vụ' };
      }
      if (!row.primaryOnbCode) {
        hasValidationErrors = true;
        return { ...row, error: 'Vui lòng chọn Người thực hiện' };
      }
      if (!row.workTypeCode) {
        hasValidationErrors = true;
        return { ...row, error: 'Vui lòng chọn Loại công việc' };
      }
      if (!row.date) {
        hasValidationErrors = true;
        return { ...row, error: 'Vui lòng chọn Ngày thực hiện' };
      }
      if (row.date.slice(0, 7) < '2026-10') {
        hasValidationErrors = true;
        return { ...row, error: 'Ngày thuộc tháng đã khóa sổ' };
      }

      const isCur = isCurrencyWorkType(row.workTypeCode, workTypes);
      if (isCur) {
        const amt = parseCurrencyInput(row.quantity);
        if (row.quantity === '' || !amt || amt <= 0) {
          hasValidationErrors = true;
          return { ...row, error: 'Số tiền về phải lớn hơn 0 VNĐ' };
        }
        if (row.scoreStatus === 'INVALID_RATE') {
          hasValidationErrors = true;
          return { ...row, error: 'Chưa có mức quy đổi hợp lệ tại Thiết lập hệ thống' };
        }
      } else {
        const qtyNum = parseQuantityInput(row.quantity);
        if (row.quantity === '' || isNaN(qtyNum) || qtyNum <= 0) {
          hasValidationErrors = true;
          return { ...row, error: 'Khối lượng phải là số dương (> 0)' };
        }
      }

      const scoreNum = Number(row.recordedScore);
      if (row.recordedScore === '' || isNaN(scoreNum) || scoreNum < 0) {
        hasValidationErrors = true;
        return { ...row, error: 'Điểm KPI phải là số không âm (>= 0)' };
      }

      return { ...row, error: undefined };
    });

    setDraftRows(validatedRows);

    if (hasValidationErrors) {
      setBatchModalError('Vui lòng kiểm tra và hoàn thiện các dòng đang báo lỗi màu đỏ bên dưới.');
      return;
    }

    // Filter valid rows to submit
    const rowsToSubmit = validatedRows.filter(r => r.taskName.trim().length > 0);

    try {
      setIsSavingBatch(true);
      const payload = rowsToSubmit.map(r => {
        const isCur = isCurrencyWorkType(r.workTypeCode, workTypes);
        const amountVal = isCur ? parseCurrencyInput(r.quantity) : undefined;
        const qtyVal = isCur ? 1 : (parseQuantityInput(r.quantity) || 1);
        const recScore = Number(r.recordedScore) || 0;

        return {
          primaryOnbCode: r.primaryOnbCode,
          date: r.date,
          taskName: r.taskName.trim(),
          workTypeCode: r.workTypeCode,
          productCode: r.productCode || undefined,
          quantity: qtyVal,
          amount: amountVal,
          unit: r.unit || (isCur ? 'VNĐ' : getWorkTypeUnit(r.workTypeCode)),
          conversionRate: r.conversionRate,
          suggestedScore: r.suggestedScore || 0,
          recordedScore: recScore,
          notes: r.notes.trim() || undefined,
          status: 'Hoàn thành' as const,
          splits: []
        };
      });

      await onBatchAddTasks(payload);
      setIsBatchOpen(false);
      setBatchSuccessNotice(`Đã lưu thành công ${rowsToSubmit.length} công việc và ghi nhận điểm KPI!`);
      setTimeout(() => setBatchSuccessNotice(''), 5000);
    } catch (err: any) {
      setBatchModalError(err.message || 'Lỗi khi lưu dữ liệu');
    } finally {
      setIsSavingBatch(false);
    }
  };

  // Close Batch Modal with unsaved confirmation
  const handleCloseBatch = () => {
    const hasUnsavedContent = draftRows.some(r => r.taskName.trim().length > 0 || r.notes.trim().length > 0);
    if (hasUnsavedContent) {
      if (!confirm('Bạn có một số công việc chưa lưu. Bạn có chắc chắn muốn đóng bảng nhập nhanh không? (Dữ liệu chưa lưu sẽ bị hủy)')) {
        return;
      }
    }
    setIsBatchOpen(false);
  };

  // Compute pending summary stats for batch view
  const batchStats = useMemo(() => {
    const activeRows = draftRows.filter(r => r.taskName.trim().length > 0);
    const totalScore = activeRows.reduce((sum, r) => {
      const s = Number(r.recordedScore);
      return sum + (isNaN(s) || s < 0 ? 0 : s);
    }, 0);
    return {
      rowCount: activeRows.length,
      totalScore: Math.round(totalScore * 100) / 100
    };
  }, [draftRows]);

  // Open Single Edit Modal
  const handleOpenEdit = (task: ProgressTask) => {
    setEditingTask(task);
    const isCur = isCurrencyWorkType(task.workTypeCode, workTypes);
    const rawQty = isCur ? (task.amount || task.quantity || '') : (task.quantity !== undefined ? task.quantity : 1);
    const formattedQty = isCur ? formatCurrencyDisplay(rawQty) : rawQty;
    const evalResult = evaluateCoreScore(
      referenceScores,
      workTypes,
      task.workTypeCode,
      task.productCode,
      task.date,
      formattedQty
    );
    const wtUnit = task.unit || (isCur ? 'VNĐ' : getWorkTypeUnit(task.workTypeCode));

    setSingleForm({
      code: task.code || '',
      primaryOnbCode: task.primaryOnbCode,
      date: task.date,
      taskName: task.taskName,
      workTypeCode: task.workTypeCode,
      productCode: task.productCode || '',
      quantity: formattedQty,
      unit: wtUnit,
      recordedScore: task.recordedScore,
      isManualScore: task.recordedScore !== evalResult.suggestedScore,
      suggestedScore: evalResult.suggestedScore,
      scoreStatus: evalResult.status,
      conversionRate: evalResult.conversionRate,
      guideText: evalResult.guideText,
      formulaText: evalResult.formulaText,
      notes: task.notes || ''
    });
    setSingleFormError('');
    setIsEditModalOpen(true);
  };

  // Handle single form submit
  const handleSingleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!singleForm.taskName.trim()) {
      setSingleFormError('Vui lòng nhập tên công việc / nhiệm vụ.');
      return;
    }

    const isCur = isCurrencyWorkType(singleForm.workTypeCode, workTypes);
    if (isCur) {
      const amt = parseCurrencyInput(singleForm.quantity);
      if (singleForm.quantity === '' || !amt || amt <= 0) {
        setSingleFormError('Số tiền về phải lớn hơn 0 VNĐ.');
        return;
      }
      if (singleForm.scoreStatus === 'INVALID_RATE') {
        setSingleFormError('Chưa có mức quy đổi hợp lệ tại Thiết lập hệ thống.');
        return;
      }
    } else {
      const qtyNum = parseQuantityInput(singleForm.quantity);
      if (singleForm.quantity === '' || isNaN(qtyNum) || qtyNum <= 0) {
        setSingleFormError('Khối lượng phải là số dương (> 0).');
        return;
      }
    }

    const scoreNum = Number(singleForm.recordedScore);
    if (singleForm.recordedScore === '' || isNaN(scoreNum) || scoreNum < 0) {
      setSingleFormError('Điểm ghi nhận phải là số không âm (>= 0).');
      return;
    }

    try {
      if (editingTask) {
        const amountVal = isCur ? parseCurrencyInput(singleForm.quantity) : undefined;
        const qtyVal = isCur ? 1 : parseQuantityInput(singleForm.quantity);

        await onUpdateTask(editingTask.id, {
          code: singleForm.code?.trim() || undefined,
          primaryOnbCode: singleForm.primaryOnbCode,
          date: singleForm.date,
          taskName: singleForm.taskName.trim(),
          workTypeCode: singleForm.workTypeCode,
          productCode: singleForm.productCode || undefined,
          quantity: qtyVal,
          amount: amountVal,
          unit: singleForm.unit || (isCur ? 'VNĐ' : getWorkTypeUnit(singleForm.workTypeCode)),
          conversionRate: singleForm.conversionRate,
          suggestedScore: singleForm.suggestedScore,
          recordedScore: scoreNum,
          notes: singleForm.notes.trim() || undefined
        });
      }
      setIsEditModalOpen(false);
    } catch (err: any) {
      setSingleFormError(err.message || 'Lỗi khi lưu công việc');
    }
  };

  // Filtered tasks in main list
  const filteredTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.monthYear !== monthYear) return false;

      if (selectedMember && t.primaryOnbCode !== selectedMember) {
        // Also check if had legacy split
        const hadSplit = t.splits && t.splits.some(sp => sp.onbCode === selectedMember);
        if (!hadSplit) return false;
      }

      if (selectedWorkType && t.workTypeCode !== selectedWorkType) {
        return false;
      }

      if (selectedProduct && t.productCode !== selectedProduct) {
        return false;
      }

      if (searchTerm) {
        const term = searchTerm.toLowerCase();
        const matchName = t.taskName.toLowerCase().includes(term);
        const matchCode = t.primaryOnbCode.toLowerCase().includes(term);
        const matchNote = t.notes?.toLowerCase().includes(term);
        if (!matchName && !matchCode && !matchNote) return false;
      }

      return true;
    }).sort((a, b) => b.date.localeCompare(a.date));
  }, [tasks, monthYear, selectedMember, selectedWorkType, selectedProduct, searchTerm]);

  // Total metrics
  const totalMonthScore = useMemo(() => {
    const list = tasks.filter(t => t.monthYear === monthYear);
    const sum = list.reduce((acc, t) => acc + (t.recordedScore || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [tasks, monthYear]);

  // Score strictly within active filtered scope
  const filteredScore = useMemo(() => {
    const sum = filteredTasks.reduce((acc, t) => acc + (t.recordedScore || 0), 0);
    return Math.round(sum * 100) / 100;
  }, [filteredTasks]);

  const isCustomFilterActive = Boolean(
    searchTerm || selectedMember || selectedWorkType || selectedProduct || monthYear !== DEFAULT_SYSTEM_MONTH
  );

  // Reconciliation check for TIEN_VE records that might have been saved with raw money score (> 100)
  const suspiciousTienVeTasks = useMemo(() => {
    return tasks.filter(t => {
      if (t.workTypeCode !== 'TIEN_VE') return false;
      return t.recordedScore >= 1000 || (t.amount && t.recordedScore === t.amount && t.amount > 100);
    });
  }, [tasks]);

  return (
    <div className="space-y-4">
      {/* 1. Header Toolbar */}
      <div className="bg-white p-4 rounded-lg border border-slate-200 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-base font-bold text-slate-900">
              Phân Hệ Tiến Độ & Điểm KPI ({monthYear})
            </h2>
            {onMonthChange && (
              <div className="flex items-center gap-1 bg-slate-100 border border-slate-300 px-2 py-0.5 rounded text-slate-800 text-xs">
                <Calendar className="w-3.5 h-3.5 text-slate-500" />
                <select
                  value={monthYear}
                  onChange={e => handleMonthYearChange(e.target.value)}
                  className="bg-transparent font-medium focus:outline-hidden cursor-pointer"
                  title="Chọn tháng / kỳ"
                >
                  {['2026-12', '2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01'].map(m => (
                    <option key={m} value={m}>Tháng {m}</option>
                  ))}
                </select>
              </div>
            )}
            <span className="text-xs font-semibold px-2.5 py-0.5 bg-blue-50 text-blue-800 rounded-full font-mono">
              {filteredTasks.length} công việc · {filteredScore} điểm
              {isCustomFilterActive && filteredScore !== totalMonthScore && (
                <span className="text-blue-600 font-normal ml-1"> (Tổng tháng: {totalMonthScore})</span>
              )}
            </span>
          </div>
          <p className="text-xs text-slate-500 mt-1">
            Giao diện nhập điểm tinh giản 7 trường dữ liệu · Bảng nhập nhanh nhiều dòng và tự động tham chiếu điểm từ Thiết lập hệ thống.
          </p>
        </div>

        <div className="flex items-center gap-2">
          {isMonthLocked ? (
            <span className="text-xs text-amber-800 bg-amber-50 border border-amber-300 px-3 py-2 rounded-md flex items-center gap-1.5 font-medium">
              <Lock className="w-3.5 h-3.5 text-amber-600" /> Tháng đã khóa (Chế độ chỉ xem)
            </span>
          ) : (
            <>
              <button
                type="button"
                onClick={() => setIsExcelImportModalOpen(true)}
                className="px-3.5 py-2 text-xs font-semibold text-slate-800 bg-white hover:bg-slate-50 border border-slate-300 rounded-md transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
              >
                <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                <span>Nhập khẩu Excel</span>
              </button>

              <button
                onClick={handleOpenBatch}
                className="px-4 py-2 text-xs font-semibold text-white bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] rounded-lg transition-colors flex items-center gap-2 shadow-xs cursor-pointer"
              >
                <Plus className="w-4 h-4 text-white" />
                <span>Nhập điểm thực hiện (Bảng nhập nhanh)</span>
              </button>
            </>
          )}
        </div>
      </div>

      {batchSuccessNotice && (
        <div className="bg-emerald-50 border border-emerald-300 rounded-lg p-3 text-xs text-emerald-900 flex items-center gap-2">
          <Check className="w-4 h-4 text-emerald-600 shrink-0" />
          <span>{batchSuccessNotice}</span>
        </div>
      )}

      {/* Reconciliation Banner for Suspicious TIEN_VE Records */}
      {suspiciousTienVeTasks.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-lg p-3 text-xs text-amber-900 flex items-start gap-2">
          <AlertCircle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
          <div className="space-y-1">
            <div className="font-bold">Cảnh báo đối soát Tiền về ({suspiciousTienVeTasks.length} bản ghi):</div>
            <p className="text-[11px] text-amber-800">
              Phát hiện bản ghi Tiền về có điểm bất thường (dấu hiệu lưu theo số tiền chưa chia tỷ lệ quy đổi Thiết lập hệ thống). Để bảo toàn lịch sử dữ liệu, hệ thống không tự ý ghi đè hàng loạt. Vui lòng kiểm tra và sửa tay từng bản ghi nếu cần:
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              {suspiciousTienVeTasks.map(t => (
                <span key={t.id} className="bg-white border border-amber-300 px-2 py-0.5 rounded font-mono text-[11px] flex items-center gap-1.5">
                  <strong>{t.code}</strong>: {t.taskName} ({t.recordedScore.toLocaleString('vi-VN')}đ)
                  <button
                    onClick={() => handleOpenEdit(t)}
                    className="text-blue-700 underline font-sans text-[10px] cursor-pointer"
                  >
                    Mở sửa
                  </button>
                </span>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* 2. Filters & Quick Search (Tách riêng bộ lọc độc lập theo từng tài khoản) */}
      <div className="bg-white p-3.5 rounded-lg border border-slate-200 shadow-2xs flex flex-wrap items-center gap-2 text-xs">
        {/* Month / Period Filter */}
        {onMonthChange && (
          <div className="flex items-center gap-1.5 border border-slate-200 rounded-md px-2 py-1.5 bg-white text-slate-700 min-w-[130px]" title="Kỳ / Tháng xem dữ liệu">
            <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            <select
              value={monthYear}
              onChange={e => handleMonthYearChange(e.target.value)}
              className="bg-transparent font-medium focus:outline-hidden cursor-pointer text-xs w-full"
            >
              {['2026-12', '2026-11', '2026-10', '2026-09', '2026-08', '2026-07', '2026-06', '2026-05', '2026-04', '2026-03', '2026-02', '2026-01'].map(m => (
                <option key={m} value={m}>Tháng {m}</option>
              ))}
            </select>
          </div>
        )}

        {/* Search Input */}
        <div className="relative min-w-[200px] flex-1">
          <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-400" />
          <input
            type="text"
            placeholder="Tìm theo tên công việc, nhân sự, ghi chú..."
            value={searchTerm}
            onChange={e => handleSearchChange(e.target.value)}
            className="w-full pl-8 pr-3 py-1.5 border border-slate-200 rounded-md focus:outline-hidden focus:border-slate-400"
          />
        </div>

        {/* Member Filter */}
        <select
          value={selectedMember}
          onChange={e => handleMemberChange(e.target.value)}
          className="border border-slate-200 rounded-md p-1.5 bg-white text-slate-700 min-w-[150px]"
        >
          <option value="">-- Tất cả nhân sự --</option>
          {members.map(m => (
            <option key={m.code} value={m.code}>
              {m.fullName} ({m.code})
            </option>
          ))}
        </select>

        {/* Work Type Filter */}
        <select
          value={selectedWorkType}
          onChange={e => handleWorkTypeChange(e.target.value)}
          className="border border-slate-200 rounded-md p-1.5 bg-white text-slate-700 min-w-[150px]"
        >
          <option value="">-- Tất cả loại việc --</option>
          {workTypes.map(wt => (
            <option key={wt.code} value={wt.code}>
              {wt.code} - {wt.name}
            </option>
          ))}
        </select>

        {/* Product Module Filter */}
        <select
          value={selectedProduct}
          onChange={e => handleProductChange(e.target.value)}
          className="border border-slate-200 rounded-md p-1.5 bg-white text-slate-700 min-w-[140px]"
        >
          <option value="">-- Tất cả module --</option>
          {products.map(p => (
            <option key={p.code} value={p.code}>
              {p.code}
            </option>
          ))}
        </select>

        {/* Reset Filters button */}
        <button
          type="button"
          onClick={handleResetFilters}
          disabled={!isCustomFilterActive}
          className={`px-2.5 py-1.5 text-xs rounded-md flex items-center gap-1 transition-colors ${
            isCustomFilterActive
              ? 'text-rose-700 bg-rose-50 hover:bg-rose-100 border border-rose-200 font-medium cursor-pointer shadow-2xs'
              : 'text-slate-400 bg-slate-50 border border-slate-200 cursor-not-allowed opacity-60'
          }`}
          title={isCustomFilterActive ? "Đặt lại tất cả bộ lọc về mặc định của tài khoản hiện tại" : "Bộ lọc đang ở giá trị mặc định"}
        >
          <RotateCcw className="w-3.5 h-3.5" />
          <span>Đặt lại bộ lọc</span>
        </button>

        <div className="flex items-center gap-2 ml-auto text-[11px] text-slate-500">
          <span className="bg-slate-50 border border-slate-200 px-2 py-0.5 rounded text-slate-600 font-medium">
            Bộ lọc của: {session?.fullName || session?.onbCode || 'Người dùng'}
          </span>
          <span className="font-mono">
            Hiển thị: <strong>{filteredTasks.length}</strong> / {tasks.filter(t => t.monthYear === monthYear).length} công việc ({filteredScore} đ)
          </span>
        </div>
      </div>

      {/* 3. Task List Table (7 Clean Columns) */}
      <div className="bg-white rounded-lg border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto max-h-[72vh]">
          <table className="w-full text-left border-collapse text-xs">
            <thead className="bg-[#F1F5F9] sticky top-0 z-10 border-b border-[#E2E8F0] text-[#475569] font-semibold uppercase text-[11px] select-none">
              <tr>
                <th className="py-2.5 px-3 w-24">Ngày</th>
                <th className="py-2.5 px-3 w-40">Người thực hiện</th>
                <th className="py-2.5 px-3">Tên công việc / Nhiệm vụ</th>
                <th className="py-2.5 px-3 w-32">Loại việc</th>
                <th className="py-2.5 px-3 w-28">Module</th>
                <th className="py-2.5 px-3 w-28">Khối lượng</th>
                <th className="py-2.5 px-3 w-24 text-right">Điểm KPI</th>
                <th className="py-2.5 px-3 w-44">Ghi chú</th>
                <th className="py-2.5 px-3 w-20 text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredTasks.map(task => {
                const mem = members.find(m => m.code === task.primaryOnbCode);
                const isDifferentFromSuggested = task.recordedScore !== task.suggestedScore;
                const hasLegacySplits = task.splits && task.splits.length > 0;
                const isCur = isCurrencyWorkType(task.workTypeCode, workTypes);
                const taskUnit = task.unit || (isCur ? 'VNĐ' : getWorkTypeUnit(task.workTypeCode));
                const rawAmount = task.amount !== undefined ? task.amount : (isCur ? task.quantity : undefined);
                const qtyDisplay = isCur
                  ? `${(rawAmount || 0).toLocaleString('vi-VN')} VNĐ`
                  : (task.quantity !== undefined ? `${task.quantity} ${taskUnit}` : `1 ${taskUnit}`);

                return (
                  <tr key={task.id} className="hover:bg-blue-50/20 transition-colors">
                    {/* 1. Date */}
                    <td className="py-2.5 px-3 font-mono text-slate-700 whitespace-nowrap">
                      {task.date}
                    </td>

                    {/* 2. Performer */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <div className="font-bold text-slate-900">{mem?.displayName || task.primaryOnbCode}</div>
                      <div className="text-[11px] text-slate-400">{mem?.currentGroup}</div>
                    </td>

                    {/* 3. Task Name */}
                    <td className="py-2.5 px-3">
                      <div className="font-medium text-slate-900">{task.taskName}</div>
                      {hasLegacySplits && (
                        <span className="text-[10px] text-slate-400 italic block mt-0.5">
                          (Dữ liệu phân bổ lịch sử: {task.splits.length} người)
                        </span>
                      )}
                    </td>

                    {/* 4. Work Type */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-mono text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded-xs font-medium">
                        {task.workTypeCode}
                      </span>
                    </td>

                    {/* 5. Product Module */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      {task.productCode ? (
                        <span className="font-mono text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded-xs font-semibold">
                          {task.productCode}
                        </span>
                      ) : (
                        <span className="text-slate-300 italic text-[11px]">-</span>
                      )}
                    </td>

                    {/* 6. Quantity / Volume */}
                    <td className="py-2.5 px-3 whitespace-nowrap">
                      <span className="font-medium text-slate-800 bg-amber-50 border border-amber-200/60 text-amber-900 px-2 py-0.5 rounded text-[11px] font-mono">
                        {qtyDisplay}
                      </span>
                    </td>

                    {/* 7. KPI Score */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap font-mono">
                      <span className={`font-bold text-sm ${isDifferentFromSuggested ? 'text-blue-700' : 'text-slate-900'}`}>
                        {task.recordedScore}
                      </span>
                      {isDifferentFromSuggested && (
                        <div className="text-[9px] text-slate-400 leading-none">Core: {task.suggestedScore}</div>
                      )}
                    </td>

                    {/* 7. Notes */}
                    <td className="py-2.5 px-3 text-slate-600">
                      <div className="truncate max-w-[200px]" title={task.notes || ''}>
                        {task.notes || '-'}
                      </div>
                    </td>

                    {/* Actions */}
                    <td className="py-2.5 px-3 text-right whitespace-nowrap">
                      {!isMonthLocked && (
                        <div className="flex items-center justify-end gap-1">
                          <button
                            onClick={() => handleOpenEdit(task)}
                            className="p-1 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-sm transition-colors cursor-pointer"
                            title="Sửa công việc"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenDeleteConfirm(task)}
                            className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-sm transition-colors cursor-pointer"
                            title="Xóa công việc"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}

              {filteredTasks.length === 0 && (
                <tr>
                  <td colSpan={8} className="py-12 text-center text-slate-400">
                    Chưa có công việc nào được ghi nhận trong tháng {monthYear}.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* 4. MODAL: WIDE MULTI-ROW BATCH ENTRY TABLE (BẢNG NHẬP NHANH NHIỀU DÒNG) */}
      {isBatchOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-2 sm:p-4">
          <div className="bg-white rounded-xl shadow-2xl w-full max-w-7xl flex flex-col max-h-[94vh] overflow-hidden border border-slate-300">
            {/* Modal Header */}
            <div className="p-4 bg-white border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-3">
                <div className="w-8 h-8 rounded-lg bg-[#EEF2FF] text-[#4F46E5] flex items-center justify-center font-bold border border-indigo-100">
                  <Sparkles className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm sm:text-base text-slate-900">
                    Bảng Nhập Nhanh Điểm Thực Hiện (Nhiều Dòng)
                  </h3>
                  <p className="text-xs text-slate-500 mt-0.5">
                    Mỗi dòng là 1 công việc độc lập · Dùng phím <strong>Tab</strong> để nhảy nhanh giữa các ô · Điểm KPI tự tham chiếu theo Thiết lập hệ thống
                  </p>
                </div>
              </div>

              {/* Header Counters & Controls */}
              <div className="flex items-center gap-3">
                <div className="bg-[#F1F5F9] border border-[#CBD5E1] px-3 py-1.5 rounded-lg text-xs font-mono text-slate-700 flex items-center gap-3">
                  <span>
                    Đã nhập: <strong className="text-slate-900">{batchStats.rowCount}</strong> dòng
                  </span>
                  <span className="text-slate-400">|</span>
                  <span>
                    Tổng điểm dự kiến: <strong className="text-[#047857] text-sm">{batchStats.totalScore}</strong> đ
                  </span>
                </div>

                <button
                  onClick={handleCloseBatch}
                  className="text-slate-400 hover:text-slate-700 p-1.5 rounded-lg hover:bg-slate-100 transition-colors cursor-pointer"
                  title="Đóng"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {batchModalError && (
              <div className="mx-4 mt-3 p-3 bg-rose-50 border border-rose-200 text-rose-800 text-xs rounded-lg flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{batchModalError}</span>
              </div>
            )}

            {/* Table Area with Sticky Header */}
            <div className="flex-1 overflow-x-auto overflow-y-auto p-4 space-y-2">
              <table className="w-full border-collapse text-xs select-none min-w-[1050px]">
                <thead className="sticky top-0 z-20 bg-[#F1F5F9] border-b border-[#CBD5E1] text-[#475569] font-semibold uppercase text-[11px] shadow-xs">
                  <tr>
                    <th className="py-2.5 px-2 w-10 text-center">#</th>
                    <th className="py-2.5 px-2 w-44">1. Người thực hiện *</th>
                    <th className="py-2.5 px-2 w-32">2. Ngày *</th>
                    <th className="py-2.5 px-2 min-w-[200px]">3. Tên công việc / Nhiệm vụ *</th>
                    <th className="py-2.5 px-2 w-36">4. Loại công việc *</th>
                    <th className="py-2.5 px-2 w-28">5. Module SP</th>
                    <th className="py-2.5 px-2 w-36">6. Khối lượng / Số tiền *</th>
                    <th className="py-2.5 px-2 w-32">7. Điểm KPI *</th>
                    <th className="py-2.5 px-2 w-40">8. Ghi chú</th>
                    <th className="py-2.5 px-2 w-20 text-center">Thao tác</th>
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-200">
                  {draftRows.map((row, index) => {
                    const hasError = Boolean(row.error);

                    return (
                      <tr
                        key={row.id}
                        className={`transition-colors ${
                          hasError ? 'bg-rose-50/50' : index % 2 === 0 ? 'bg-white' : 'bg-slate-50/30'
                        } hover:bg-blue-50/30`}
                      >
                        {/* # Row Index */}
                        <td className="py-2 px-2 text-center font-mono text-slate-400 font-semibold align-middle">
                          {index + 1}
                        </td>

                        {/* 1. Performer (Người thực hiện) */}
                        <td className="py-2 px-1.5 align-top">
                          <select
                            value={row.primaryOnbCode}
                            onChange={e => handleBatchCellChange(index, 'primaryOnbCode', e.target.value)}
                            className="w-full border border-slate-300 rounded-md p-1.5 text-xs bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-medium"
                          >
                            {members.map(m => (
                              <option key={m.code} value={m.code}>
                                {m.fullName} ({m.code})
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 2. Date (Ngày thực hiện) */}
                        <td className="py-2 px-1.5 align-top">
                          <input
                            type="date"
                            value={row.date}
                            onChange={e => handleBatchCellChange(index, 'date', e.target.value)}
                            className="w-full border border-slate-300 rounded-md p-1.5 text-xs font-mono focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                        </td>

                        {/* 3. Task Name (Tên công việc / Nhiệm vụ) */}
                        <td className="py-2 px-1.5 align-top">
                          <input
                            type="text"
                            placeholder="Nhập tên nhiệm vụ, triển khai, hỗ trợ... *"
                            value={row.taskName}
                            onChange={e => handleBatchCellChange(index, 'taskName', e.target.value)}
                            className={`w-full border rounded-md p-1.5 text-xs focus:outline-hidden focus:ring-1 ${
                              hasError && !row.taskName.trim()
                                ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                                : 'border-slate-300 focus:ring-blue-500'
                            }`}
                          />
                          {row.error && (
                            <div className="text-[10px] text-rose-600 font-medium mt-0.5 flex items-center gap-1">
                              <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                              <span>{row.error}</span>
                            </div>
                          )}
                        </td>

                        {/* 4. Work Type (Loại công việc từ Core) */}
                        <td className="py-2 px-1.5 align-top">
                          <select
                            value={row.workTypeCode}
                            onChange={e => handleBatchCellChange(index, 'workTypeCode', e.target.value)}
                            className="w-full border border-slate-300 rounded-md p-1.5 text-xs bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 font-medium"
                          >
                            {/* If current row has an inactive work type from historical data, keep it visible */}
                            {!activeWorkTypes.some(w => w.code === row.workTypeCode) && row.workTypeCode && (
                              <option key={row.workTypeCode} value={row.workTypeCode}>
                                {row.workTypeCode} (Ngừng SD)
                              </option>
                            )}
                            {activeWorkTypes.map(wt => (
                              <option key={wt.code} value={wt.code}>
                                {wt.code} - {wt.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 5. Product Module (Module sản phẩm từ Core) */}
                        <td className="py-2 px-1.5 align-top">
                          <select
                            value={row.productCode}
                            onChange={e => handleBatchCellChange(index, 'productCode', e.target.value)}
                            className="w-full border border-slate-300 rounded-md p-1.5 text-xs bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 text-slate-800"
                          >
                            <option value="">-- Để trống --</option>
                            {products.map(p => (
                              <option key={p.code} value={p.code}>
                                {p.code} - {p.name}
                              </option>
                            ))}
                          </select>
                        </td>

                        {/* 6. Khối lượng / Số tiền (Tự động thích ứng theo Loại công việc trong Core) */}
                        <td className="py-2 px-1.5 align-top">
                          {(() => {
                            const isCur = isCurrencyWorkType(row.workTypeCode, workTypes);
                            const unit = row.unit || (isCur ? 'VNĐ' : getWorkTypeUnit(row.workTypeCode));
                            const isHour = unit === 'Giờ';
                            const isSession = unit === 'Buổi';

                            return (
                              <div className="space-y-1">
                                <div className="relative flex items-center">
                                  <input
                                    type={isCur ? 'text' : 'number'}
                                    step={isHour || isSession ? '0.5' : '1'}
                                    min="0"
                                    placeholder={isCur ? 'Số tiền về (VNĐ)...' : 'Khối lượng...'}
                                    value={row.quantity}
                                    onChange={e => handleBatchCellChange(index, 'quantity', e.target.value)}
                                    className={`w-full border rounded-md p-1.5 pr-14 text-xs font-mono font-bold text-right bg-white focus:outline-hidden focus:ring-1 ${
                                      hasError && (row.quantity === '' || (!isCur && Number(row.quantity) <= 0) || (isCur && parseCurrencyInput(row.quantity) <= 0))
                                        ? 'border-rose-400 bg-rose-50/40 focus:ring-rose-500'
                                        : 'border-slate-300 focus:ring-blue-500'
                                    }`}
                                  />
                                  <span className="absolute right-1.5 text-[10px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1 py-0.5 rounded pointer-events-none">
                                    {unit}
                                  </span>
                                </div>

                                {/* Currency Conversion Guidance */}
                                {isCur && (
                                  <div className="space-y-0.5 leading-tight">
                                    {row.scoreStatus === 'INVALID_RATE' ? (
                                      <div className="text-[10px] text-rose-600 font-semibold flex items-center gap-1">
                                        <AlertCircle className="w-2.5 h-2.5 shrink-0" />
                                        <span>Chưa có mức quy đổi hợp lệ tại Thiết lập hệ thống</span>
                                      </div>
                                    ) : row.conversionRate ? (
                                      <>
                                        <div className="text-[10px] text-emerald-700 font-semibold">
                                          Quy đổi: {row.conversionRate.toLocaleString('vi-VN')} VNĐ = 1 điểm
                                        </div>
                                        {parseCurrencyInput(row.quantity) > 0 && row.formulaText && (
                                          <div className="text-[10px] text-slate-500 font-mono">
                                            {row.formulaText}
                                          </div>
                                        )}
                                      </>
                                    ) : null}
                                  </div>
                                )}

                                {/* Quick Selector Pill Buttons (Only for non-currency Session & Hour) */}
                                {!isCur && isSession && (
                                  <div className="flex items-center gap-1">
                                    {[0.5, 1, 1.5, 2].map(v => (
                                      <button
                                        key={v}
                                        type="button"
                                        onClick={() => handleBatchCellChange(index, 'quantity', v)}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                                          Number(row.quantity) === v
                                            ? 'bg-blue-600 text-white font-bold'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                      >
                                        {v}
                                      </button>
                                    ))}
                                  </div>
                                )}
                                {!isCur && isHour && (
                                  <div className="flex items-center gap-1">
                                    {[1, 2, 4, 8].map(v => (
                                      <button
                                        key={v}
                                        type="button"
                                        onClick={() => handleBatchCellChange(index, 'quantity', v)}
                                        className={`px-1.5 py-0.5 rounded text-[10px] font-mono transition-colors cursor-pointer ${
                                          Number(row.quantity) === v
                                            ? 'bg-blue-600 text-white font-bold'
                                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                                        }`}
                                      >
                                        {v}h
                                      </button>
                                    ))}
                                  </div>
                                )}
                              </div>
                            );
                          })()}
                        </td>

                        {/* 7. Điểm KPI (Tự tham chiếu Core + Giữ quyền sửa tay) */}
                        <td className="py-2 px-1.5 align-top">
                          <div className="space-y-1">
                            <input
                              type="number"
                              step="0.1"
                              min="0"
                              placeholder="Điểm..."
                              value={row.recordedScore}
                              onChange={e => handleBatchCellChange(index, 'recordedScore', e.target.value)}
                              className="w-full border border-slate-300 rounded-md p-1.5 text-xs font-mono font-bold text-slate-900 bg-white focus:outline-hidden focus:ring-1 focus:ring-blue-500 text-right"
                            />

                            {/* Core Score Hint & Override status */}
                            <div className="flex items-center justify-between text-[10px]">
                              {row.scoreStatus === 'FOUND' ? (
                                row.isManualScore ? (
                                  <div className="flex items-center justify-between w-full text-blue-700">
                                    <span title="Điểm tính từ Thiết lập hệ thống">Gợi ý: {row.suggestedScore}đ</span>
                                    <button
                                      type="button"
                                      onClick={() => handleResetRowScore(index)}
                                      className="text-[9px] hover:underline font-semibold ml-1 cursor-pointer bg-blue-50 px-1 py-0.5 rounded text-blue-800"
                                      title="Khôi phục về điểm tính từ Thiết lập hệ thống"
                                    >
                                      Dùng điểm gợi ý
                                    </button>
                                  </div>
                                ) : (
                                  <span className="text-emerald-700 font-medium">✓ Core: {row.recordedScore}đ</span>
                                )
                              ) : row.scoreStatus === 'INVALID_RATE' ? (
                                <span className="text-rose-600 font-medium text-[10px]">Chưa có mức quy đổi</span>
                              ) : row.scoreStatus === 'AMBIGUOUS' ? (
                                <span className="text-amber-700 font-medium">Cấu hình chưa rõ</span>
                              ) : (
                                <span className="text-slate-400 italic">Chưa có điểm tham chiếu</span>
                              )}
                            </div>
                          </div>
                        </td>

                        {/* 8. Ghi chú */}
                        <td className="py-2 px-1.5 align-top">
                          <input
                            type="text"
                            placeholder="Ghi chú thêm (tùy chọn)..."
                            value={row.notes}
                            onChange={e => handleBatchCellChange(index, 'notes', e.target.value)}
                            className="w-full border border-slate-300 rounded-md p-1.5 text-xs focus:outline-hidden focus:ring-1 focus:ring-blue-500"
                          />
                        </td>

                        {/* Actions: Clone & Delete */}
                        <td className="py-2 px-1.5 text-center align-middle whitespace-nowrap">
                          <div className="flex items-center justify-center gap-1">
                            <button
                              type="button"
                              onClick={() => handleDuplicateRow(index)}
                              className="p-1 text-slate-500 hover:text-blue-600 hover:bg-slate-100 rounded-sm transition-colors"
                              title="Nhân bản dòng này"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteBatchRow(index)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-sm transition-colors"
                              title="Xóa dòng"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>

              {/* Quick Add Row Button at bottom of table */}
              <div className="pt-2 flex items-center justify-between">
                <button
                  type="button"
                  onClick={handleAddBatchRow}
                  className="px-3 py-1.5 text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-md transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Thêm 1 dòng mới</span>
                </button>

                <div className="text-[11px] text-slate-500">
                  Dòng trống sẽ tự động bỏ qua khi lưu · Dòng nhập dở bắt buộc điền đủ trường
                </div>
              </div>
            </div>

            {/* Modal Footer Bar */}
            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between shrink-0">
              <div className="text-xs text-slate-600 flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500"></span>
                <span>
                  Sẵn sàng ghi nhận <strong>{batchStats.rowCount}</strong> công việc vào tháng <strong>{monthYear}</strong>.
                </span>
              </div>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={handleCloseBatch}
                  className="px-4 py-2 text-xs font-medium text-slate-600 hover:bg-slate-200 rounded-md transition-colors"
                >
                  Hủy bỏ
                </button>

                <button
                  type="button"
                  disabled={isSavingBatch}
                  onClick={handleSaveAllBatch}
                  className={`px-5 py-2 text-xs font-bold text-white rounded-md shadow-sm transition-all flex items-center gap-2 ${
                    isSavingBatch
                      ? 'bg-slate-400 cursor-not-allowed'
                      : 'bg-emerald-600 hover:bg-emerald-700 cursor-pointer'
                  }`}
                >
                  <Save className="w-4 h-4" />
                  <span>{isSavingBatch ? 'Đang lưu dữ liệu...' : `Lưu tất cả (${batchStats.rowCount} dòng - ${batchStats.totalScore}đ)`}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* 5. MODAL: SINGLE TASK EDIT (TINH GIẢN ĐÚNG 7 TRƯỜNG, BỎ CHIA ĐIỂM) */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <div>
                <h3 className="font-bold text-slate-900 text-sm">Chỉnh Sửa Công Việc & Điểm</h3>
                <p className="text-[11px] text-slate-500 mt-0.5">
                  Cập nhật thông tin thực hiện cho 1 nhân sự · Điểm tự tham chiếu Core
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            {singleFormError && (
              <div className="p-2.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md flex items-center gap-1.5">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{singleFormError}</span>
              </div>
            )}

            <form onSubmit={handleSingleSubmit} className="space-y-3.5 text-xs">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                {/* Mã công việc */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Mã tiến độ / việc</label>
                  <input
                    type="text"
                    value={singleForm.code}
                    onChange={e => setSingleForm({ ...singleForm, code: e.target.value.toUpperCase() })}
                    placeholder="VD: TD-001..."
                    className="w-full border border-slate-300 rounded-md p-2 font-mono uppercase bg-white"
                  />
                </div>

                {/* 1. Người thực hiện */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">1. Người thực hiện *</label>
                  <select
                    value={singleForm.primaryOnbCode}
                    onChange={e => setSingleForm({ ...singleForm, primaryOnbCode: e.target.value })}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white font-medium"
                    required
                  >
                    {members.filter(m => m.isActive || m.code === singleForm.primaryOnbCode).map(m => (
                      <option key={m.code} value={m.code}>
                        {m.fullName} ({m.code}) {!m.isActive ? '(Ngừng SD)' : ''}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 2. Ngày thực hiện */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">2. Ngày thực hiện *</label>
                  <input
                    type="date"
                    value={singleForm.date}
                    onChange={e => {
                      const newDate = e.target.value;
                      const evalResult = evaluateCoreScore(referenceScores, workTypes, singleForm.workTypeCode, singleForm.productCode, newDate, singleForm.quantity);
                      setSingleForm({
                        ...singleForm,
                        date: newDate,
                        suggestedScore: evalResult.suggestedScore,
                        scoreStatus: evalResult.status,
                        conversionRate: evalResult.conversionRate,
                        guideText: evalResult.guideText,
                        formulaText: evalResult.formulaText,
                        recordedScore: singleForm.isManualScore ? singleForm.recordedScore : evalResult.suggestedScore
                      });
                    }}
                    className="w-full border border-slate-300 rounded-md p-2 font-mono"
                    required
                  />
                </div>
              </div>

              {/* 3. Tên công việc / Nhiệm vụ */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">3. Tên công việc / Nhiệm vụ *</label>
                <input
                  type="text"
                  placeholder="Ví dụ: Triển khai trực tiếp TOYOINK, Đào tạo lớp CRM..."
                  value={singleForm.taskName}
                  onChange={e => setSingleForm({ ...singleForm, taskName: e.target.value })}
                  className="w-full border border-slate-300 rounded-md p-2"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* 4. Loại công việc */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">4. Loại công việc *</label>
                  <select
                    value={singleForm.workTypeCode}
                    onChange={e => {
                      const newWt = e.target.value;
                      const prevIsCur = isCurrencyWorkType(singleForm.workTypeCode, workTypes);
                      const nextIsCur = isCurrencyWorkType(newWt, workTypes);
                      let newQty = singleForm.quantity;
                      if (prevIsCur !== nextIsCur) {
                        newQty = nextIsCur ? '' : 1;
                      }
                      const newUnit = nextIsCur ? 'VNĐ' : getWorkTypeUnit(newWt);
                      const evalResult = evaluateCoreScore(referenceScores, workTypes, newWt, singleForm.productCode, singleForm.date, newQty);
                      setSingleForm({
                        ...singleForm,
                        workTypeCode: newWt,
                        unit: newUnit,
                        quantity: newQty,
                        suggestedScore: evalResult.suggestedScore,
                        scoreStatus: evalResult.status,
                        conversionRate: evalResult.conversionRate,
                        guideText: evalResult.guideText,
                        formulaText: evalResult.formulaText,
                        recordedScore: singleForm.isManualScore ? singleForm.recordedScore : (nextIsCur && newQty === '' ? '' : evalResult.suggestedScore)
                      });
                    }}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white"
                    required
                  >
                    {!activeWorkTypes.some(w => w.code === singleForm.workTypeCode) && singleForm.workTypeCode && (
                      <option key={singleForm.workTypeCode} value={singleForm.workTypeCode}>
                        {singleForm.workTypeCode} (Ngừng SD)
                      </option>
                    )}
                    {activeWorkTypes.map(wt => (
                      <option key={wt.code} value={wt.code}>
                        {wt.code} - {wt.name}
                      </option>
                    ))}
                  </select>
                </div>

                {/* 5. Module sản phẩm */}
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">5. Module sản phẩm</label>
                  <select
                    value={singleForm.productCode}
                    onChange={e => {
                      const newProd = e.target.value;
                      const evalResult = evaluateCoreScore(referenceScores, workTypes, singleForm.workTypeCode, newProd, singleForm.date, singleForm.quantity);
                      setSingleForm({
                        ...singleForm,
                        productCode: newProd,
                        suggestedScore: evalResult.suggestedScore,
                        scoreStatus: evalResult.status,
                        conversionRate: evalResult.conversionRate,
                        guideText: evalResult.guideText,
                        formulaText: evalResult.formulaText,
                        recordedScore: singleForm.isManualScore ? singleForm.recordedScore : evalResult.suggestedScore
                      });
                    }}
                    className="w-full border border-slate-300 rounded-md p-2 bg-white"
                  >
                    <option value="">-- Để trống --</option>
                    {products.filter(p => p.isActive || p.code === singleForm.productCode).map(p => (
                      <option key={p.code} value={p.code}>
                        {p.code} - {p.name} {!p.isActive ? '(Ngừng SD)' : ''}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              {/* 6. Khối lượng / Số tiền (Tự động thích ứng theo loại việc trong Core) */}
              {(() => {
                const isCur = isCurrencyWorkType(singleForm.workTypeCode, workTypes);
                return (
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <label className="font-semibold text-slate-700">6. Khối lượng / Số tiền *</label>
                      <span className="text-[11px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded">
                        Đơn vị: {singleForm.unit}
                      </span>
                    </div>

                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <div className="relative flex-1">
                          <input
                            type={isCur ? 'text' : 'number'}
                            step={singleForm.unit === 'Buổi' || singleForm.unit === 'Giờ' ? '0.5' : '1'}
                            min="0"
                            placeholder={isCur ? 'Số tiền về (VNĐ)...' : 'Khối lượng...'}
                            value={singleForm.quantity}
                            onChange={e => {
                              const isC = isCurrencyWorkType(singleForm.workTypeCode, workTypes);
                              let rawVal = e.target.value;
                              if (isC) {
                                const num = parseCurrencyInput(rawVal);
                                rawVal = rawVal === '' ? '' : num.toLocaleString('vi-VN');
                              }
                              const evalResult = evaluateCoreScore(referenceScores, workTypes, singleForm.workTypeCode, singleForm.productCode, singleForm.date, rawVal);
                              setSingleForm({
                                ...singleForm,
                                quantity: rawVal,
                                suggestedScore: evalResult.suggestedScore,
                                scoreStatus: evalResult.status,
                                conversionRate: evalResult.conversionRate,
                                guideText: evalResult.guideText,
                                formulaText: evalResult.formulaText,
                                recordedScore: singleForm.isManualScore ? singleForm.recordedScore : (isC && rawVal === '' ? '' : evalResult.suggestedScore)
                              });
                            }}
                            className="w-full border border-slate-300 rounded-md p-2 font-mono font-bold text-slate-900 bg-white text-right pr-14"
                            required
                          />
                          <span className="absolute right-2 top-2 text-xs font-semibold text-slate-500 pointer-events-none">
                            {singleForm.unit}
                          </span>
                        </div>

                        {/* Quick Select Buttons (Only for non-currency Buổi / Giờ) */}
                        {!isCur && singleForm.unit === 'Buổi' && (
                          <div className="flex items-center gap-1">
                            {[0.5, 1, 1.5, 2].map(val => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => {
                                  const evalResult = evaluateCoreScore(referenceScores, workTypes, singleForm.workTypeCode, singleForm.productCode, singleForm.date, val);
                                  setSingleForm({
                                    ...singleForm,
                                    quantity: val,
                                    suggestedScore: evalResult.suggestedScore,
                                    scoreStatus: evalResult.status,
                                    conversionRate: evalResult.conversionRate,
                                    guideText: evalResult.guideText,
                                    formulaText: evalResult.formulaText,
                                    recordedScore: singleForm.isManualScore ? singleForm.recordedScore : evalResult.suggestedScore
                                  });
                                }}
                                className={`px-2 py-1.5 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                                  Number(singleForm.quantity) === val
                                    ? 'bg-blue-600 text-white font-bold'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                {val}
                              </button>
                            ))}
                          </div>
                        )}
                        {!isCur && singleForm.unit === 'Giờ' && (
                          <div className="flex items-center gap-1">
                            {[1, 2, 4, 8].map(val => (
                              <button
                                key={val}
                                type="button"
                                onClick={() => {
                                  const evalResult = evaluateCoreScore(referenceScores, workTypes, singleForm.workTypeCode, singleForm.productCode, singleForm.date, val);
                                  setSingleForm({
                                    ...singleForm,
                                    quantity: val,
                                    suggestedScore: evalResult.suggestedScore,
                                    scoreStatus: evalResult.status,
                                    conversionRate: evalResult.conversionRate,
                                    guideText: evalResult.guideText,
                                    formulaText: evalResult.formulaText,
                                    recordedScore: singleForm.isManualScore ? singleForm.recordedScore : evalResult.suggestedScore
                                  });
                                }}
                                className={`px-2 py-1.5 rounded text-xs font-mono font-medium transition-colors cursor-pointer ${
                                  Number(singleForm.quantity) === val
                                    ? 'bg-blue-600 text-white font-bold'
                                    : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
                                }`}
                              >
                                {val}h
                              </button>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Currency Conversion Guidance */}
                      {isCur && (
                        <div className="space-y-0.5 leading-tight pt-0.5">
                          {singleForm.scoreStatus === 'INVALID_RATE' ? (
                            <div className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                              <AlertCircle className="w-3 h-3 shrink-0" />
                              <span>Chưa có mức quy đổi hợp lệ tại Thiết lập hệ thống</span>
                            </div>
                          ) : singleForm.conversionRate ? (
                            <>
                              <div className="text-[11px] text-emerald-700 font-semibold">
                                Quy đổi: {singleForm.conversionRate.toLocaleString('vi-VN')} VNĐ = 1 điểm
                              </div>
                              {parseCurrencyInput(singleForm.quantity) > 0 && singleForm.formulaText && (
                                <div className="text-[11px] text-slate-500 font-mono">
                                  {singleForm.formulaText}
                                </div>
                              )}
                            </>
                          ) : null}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* 7. Điểm KPI */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-md space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="font-semibold text-slate-800">7. Điểm KPI ghi nhận *</label>
                  <div className="text-[11px] text-slate-500">
                    {singleForm.scoreStatus === 'FOUND' ? (
                      singleForm.isManualScore ? (
                        <span className="flex items-center gap-1 text-blue-700">
                          Gợi ý Core: {singleForm.suggestedScore}đ
                          <button
                            type="button"
                            onClick={() => {
                              setSingleForm({
                                ...singleForm,
                                recordedScore: singleForm.suggestedScore,
                                isManualScore: false
                              });
                            }}
                            className="font-bold underline cursor-pointer ml-1 bg-blue-50 px-1 py-0.5 rounded text-blue-800"
                          >
                            Dùng điểm Core
                          </button>
                        </span>
                      ) : (
                        <span className="text-emerald-700 font-semibold">
                          ✓ Khớp quy tắc Core ({singleForm.recordedScore}đ)
                        </span>
                      )
                    ) : singleForm.scoreStatus === 'INVALID_RATE' ? (
                      <span className="text-rose-600 font-semibold">Chưa có mức quy đổi</span>
                    ) : singleForm.scoreStatus === 'AMBIGUOUS' ? (
                      <span className="text-amber-700 font-medium">Cấu hình chưa rõ</span>
                    ) : (
                      <span className="text-slate-400 italic">Chưa có điểm tham chiếu</span>
                    )}
                  </div>
                </div>

                <input
                  type="number"
                  step="0.1"
                  min="0"
                  value={singleForm.recordedScore}
                  onChange={e => setSingleForm({
                    ...singleForm,
                    recordedScore: e.target.value === '' ? '' : (parseFloat(e.target.value) || 0),
                    isManualScore: true
                  })}
                  className="w-full border border-slate-300 rounded-md p-2 font-mono font-bold text-slate-900 bg-white"
                  required
                />
              </div>

              {/* 8. Ghi chú */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1">8. Ghi chú chi tiết (Tùy chọn)</label>
                <input
                  type="text"
                  placeholder="Ghi chú thêm về nội dung, kết quả..."
                  value={singleForm.notes}
                  onChange={e => setSingleForm({ ...singleForm, notes: e.target.value })}
                  className="w-full border border-slate-300 rounded-md p-2"
                />
              </div>

              {/* Form Action Buttons */}
              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-3.5 py-1.5 text-slate-600 hover:bg-slate-100 rounded-md"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-1.5 bg-[#4F46E5] hover:bg-[#4338CA] active:bg-[#3730A3] text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors shadow-xs"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* MODAL: Xác nhận xóa dòng tiến độ chi tiết */}
      {deleteConfirmTask && (
        <div className="fixed inset-0 z-60 bg-black/50 flex items-center justify-center p-4">
          <div className="bg-white rounded-lg shadow-2xl max-w-md w-full p-5 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="flex items-start gap-3">
              <div className="p-2.5 bg-rose-100 rounded-full text-rose-600 shrink-0 mt-0.5">
                <Trash2 className="w-5 h-5" />
              </div>
              <div className="flex-1">
                <h3 className="font-semibold text-slate-900 text-sm">Xác nhận xóa dòng tiến độ & điểm</h3>
                <p className="text-xs text-slate-600 mt-1 leading-relaxed">
                  Bạn có chắc chắn muốn xóa công việc này không? Dữ liệu điểm KPI và tiến độ tương ứng sẽ được cập nhật lại theo dữ liệu còn lại.
                </p>
              </div>
            </div>

            {/* Thông tin đối chiếu rõ ràng: tên công việc, người thực hiện, ngày ghi nhận */}
            <div className="bg-slate-50 border border-slate-200 rounded-md p-3 space-y-2 text-xs">
              <div className="flex items-start justify-between gap-2">
                <span className="text-slate-500 shrink-0">Tên công việc:</span>
                <span className="font-bold text-slate-900 text-right">
                  {deleteConfirmTask.taskName} {deleteConfirmTask.code ? `(${deleteConfirmTask.code})` : ''}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Người thực hiện:</span>
                <span className="font-semibold text-slate-800">
                  {members.find(m => m.code === deleteConfirmTask.primaryOnbCode)?.fullName || deleteConfirmTask.primaryOnbCode} ({deleteConfirmTask.primaryOnbCode})
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Ngày ghi nhận:</span>
                <span className="font-medium text-slate-800 font-mono">
                  {formatDateVi(deleteConfirmTask.date)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-slate-500">Điểm KPI ghi nhận:</span>
                <span className="font-bold text-blue-700 font-mono">
                  {deleteConfirmTask.recordedScore} điểm
                </span>
              </div>
              {deleteConfirmTask.notes && (
                <div className="flex items-start justify-between gap-2">
                  <span className="text-slate-500 shrink-0">Ghi chú:</span>
                  <span className="text-slate-600 text-right truncate max-w-[240px]">
                    {deleteConfirmTask.notes}
                  </span>
                </div>
              )}
            </div>

            {deleteTaskError && (
              <div className="p-2.5 text-xs text-rose-800 bg-rose-50 border border-rose-200 rounded-md flex items-start gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                <div className="flex-1 leading-relaxed">{deleteTaskError}</div>
              </div>
            )}

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                disabled={isDeletingTask}
                onClick={() => {
                  setDeleteConfirmTask(null);
                  setDeleteTaskError('');
                }}
                className="px-3.5 py-1.5 text-xs text-slate-700 hover:bg-slate-100 rounded-md font-medium transition-colors disabled:opacity-50"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={isDeletingTask}
                onClick={handleExecuteDeleteTask}
                className="px-4 py-1.5 text-xs bg-rose-600 hover:bg-rose-700 text-white rounded-md font-semibold flex items-center gap-1.5 transition-colors disabled:opacity-50 shadow-xs"
              >
                {isDeletingTask ? (
                  <>
                    <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin"></span>
                    <span>Đang xóa...</span>
                  </>
                ) : (
                  <>
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Xóa</span>
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
        initialTargetType="progress"
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
        progressTasks={tasks}
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
