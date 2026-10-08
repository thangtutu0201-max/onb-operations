import React, { useState, useEffect, useMemo, useRef } from 'react';
import * as XLSX from 'xlsx';
import {
  Upload,
  FileSpreadsheet,
  CheckCircle2,
  AlertTriangle,
  ArrowRight,
  ArrowLeft,
  Download,
  RefreshCw,
  FileText,
  AlertCircle,
  X,
  ChevronRight,
  Filter,
  Check,
  HelpCircle,
  Info,
  Lock,
  Layers,
  Calendar,
  Sparkles
} from 'lucide-react';
import {
  ONBMember,
  WorkTypeCatalog,
  ProductCatalog,
  ReferenceScore,
  PackageCoreConfig,
  CustomerPackage,
  ProgressTask,
  Customer,
  CurrentUserSession
} from '../types';
import { calculatePackageScore, cleanTaxCode } from '../utils/packageScoring';
import { evaluateCoreScore } from './ProgressTab';
import { api } from '../services/api';

export type ImportTargetType = 'packages' | 'progress';

export interface ExcelImportWizardProps {
  initialTargetType?: ImportTargetType;
  allowChangeTarget?: boolean;
  monthYear: string;
  onMonthChange?: (m: string) => void;
  isMonthLocked: boolean;
  members: ONBMember[];
  workTypes: WorkTypeCatalog[];
  products: ProductCatalog[];
  referenceScores: ReferenceScore[];
  packageCoreConfig: PackageCoreConfig;
  packages: CustomerPackage[];
  progressTasks: ProgressTask[];
  customers: Customer[];
  session: CurrentUserSession | null;
  onSuccessImport: (count: number, targetType: ImportTargetType) => void;
  onClose?: () => void;
  isModal?: boolean;
}

export interface FieldDefinition {
  key: string;
  label: string;
  required: boolean;
  description: string;
  aliases: string[]; // Keywords for auto-matching column header
  example: string;
}

// Subsystem A: Tiếp nhận gói đào tạo
const PACKAGE_FIELDS: FieldDefinition[] = [
  {
    key: 'taxCode',
    label: 'Mã số thuế',
    required: true,
    description: 'Mã số thuế của doanh nghiệp khách hàng (dạng chuỗi, giữ nguyên số 0 ở đầu)',
    aliases: ['mã số thuế', 'mst', 'tax code', 'ma so thue', 'taxcode', 'mã st'],
    example: '0108923456'
  },
  {
    key: 'customerName',
    label: 'Tên khách hàng',
    required: true,
    description: 'Tên công ty hoặc khách hàng tiếp nhận',
    aliases: ['tên khách hàng', 'khách hàng', 'ten khach hang', 'khach hang', 'ten cong ty', 'tên cty', 'đơn vị'],
    example: 'Công ty Cổ phần Công nghệ ABC'
  },
  {
    key: 'moduleCode',
    label: 'Module tiếp nhận',
    required: true,
    description: 'Module triển khai (Sản xuất, CRM, HRM, Mua hàng, VPS, Kế toán, Các bộ khác)',
    aliases: ['module', 'phân hệ', 'phan he', 'module tiếp nhận', 'sản phẩm', 'gói triển khai'],
    example: 'Sản xuất'
  },
  {
    key: 'onbCode',
    label: 'Người thực hiện',
    required: true,
    description: 'Mã nhân sự hoặc tên nhân sự ONB phụ trách',
    aliases: ['mã nhân sự', 'người thực hiện', 'nhân sự', 'onb', 'mã onb', 'performer', 'cán bộ', 'chuyên viên'],
    example: 'DTHANG'
  },
  {
    key: 'receptionDate',
    label: 'Ngày tiếp nhận',
    required: true,
    description: 'Ngày tiếp nhận gói (Định dạng YYYY-MM-DD hoặc DD/MM/YYYY)',
    aliases: ['ngày tiếp nhận', 'ngày nhận', 'ngày', 'ngay tiep nhan', 'reception date', 'ngày bắt đầu'],
    example: '2026-10-15'
  },
  {
    key: 'packageCode',
    label: 'Mã gói',
    required: false,
    description: 'Mã định danh gói (nếu để trống hệ thống tự sinh theo định dạng GOI-YYYY-XXX)',
    aliases: ['mã gói', 'ma goi', 'package code', 'số gói', 'mã hợp đồng'],
    example: 'GOI-2026-001'
  },
  {
    key: 'sourceCode',
    label: 'Nguồn tiếp nhận',
    required: false,
    description: 'Nguồn theo Thiết lập hệ thống (Bán thêm 1, Bán mới 1, Khác...)',
    aliases: ['nguồn', 'nguồn tiếp nhận', 'nguon', 'source', 'kênh tiếp nhận'],
    example: 'Bán thêm 1 (T.Anh)'
  },
  {
    key: 'packageClass',
    label: 'Phân loại gói',
    required: false,
    description: 'Tiếp nhận mới hoặc Tiếp nhận lại (mặc định: Tiếp nhận mới)',
    aliases: ['phân loại', 'phân loại gói', 'loại tiếp nhận', 'classification', 'phan loai'],
    example: 'Tiếp nhận mới'
  },
  {
    key: 'customerTier',
    label: 'Hạng khách hàng',
    required: false,
    description: 'Hạng khách hàng theo Core: BASIC, BRONZE, SILVER, GOLD (mặc định: SILVER)',
    aliases: ['hạng khách hàng', 'hạng', 'phân hạng', 'tier', 'customer tier'],
    example: 'SILVER'
  },
  {
    key: 'workForm',
    label: 'Hình thức',
    required: false,
    description: 'Hình thức tiếp nhận: POC, Demo, Đào tạo, Tư vấn (mặc định: Đào tạo)',
    aliases: ['hình thức', 'loại hình', 'work form', 'hinh thuc'],
    example: 'Đào tạo'
  },
  {
    key: 'leaderPlatforms',
    label: 'Số nền tảng Leader',
    required: false,
    description: 'Số nền tảng khi khai báo Leader (2, 3, 4, 5+). Mỗi MST chỉ được 1 Leader duy nhất.',
    aliases: ['leader', 'số nền tảng', 'nền tảng leader', 'leader platforms', 'nền tảng'],
    example: '2'
  },
  {
    key: 'recordedScore',
    label: 'Điểm ghi nhận',
    required: false,
    description: 'Điểm ghi nhận (nếu để trống hệ thống tự tính theo cấu hình Thiết lập hệ thống)',
    aliases: ['điểm ghi nhận', 'điểm', 'diem ghi nhan', 'score', 'điểm tiếp nhận'],
    example: '11'
  },
  {
    key: 'notes',
    label: 'Ghi chú',
    required: false,
    description: 'Ghi chú bổ sung',
    aliases: ['ghi chú', 'ghi chu', 'notes', 'note', 'diễn giải'],
    example: 'Gói tiếp nhận dự án trọng điểm'
  }
];

// Subsystem B: Tiến độ thực hiện
const PROGRESS_FIELDS: FieldDefinition[] = [
  {
    key: 'onbCode',
    label: 'Nhân sự thực hiện',
    required: true,
    description: 'Mã nhân sự hoặc tên nhân sự ONB (phải có trong danh mục nhân sự)',
    aliases: ['mã nhân sự', 'nhân sự', 'người thực hiện', 'onb', 'mã onb', 'cán bộ thực hiện', 'họ và tên'],
    example: 'DTHANG'
  },
  {
    key: 'date',
    label: 'Ngày thực hiện',
    required: true,
    description: 'Ngày ghi nhận tiến độ (Định dạng YYYY-MM-DD hoặc DD/MM/YYYY)',
    aliases: ['ngày thực hiện', 'ngày', 'ngay thuc hien', 'ngay', 'date', 'thời gian'],
    example: '2026-10-16'
  },
  {
    key: 'taskName',
    label: 'Nội dung / Nhiệm vụ',
    required: true,
    description: 'Tên nội dung công việc hoặc nhiệm vụ tiến độ thực hiện',
    aliases: ['nội dung', 'tên nhiệm vụ', 'công việc', 'nhiệm vụ', 'ten cong viec', 'nội dung công việc', 'task name'],
    example: 'Triển khai trực tiếp phân hệ Sản xuất tại khách hàng'
  },
  {
    key: 'workTypeCode',
    label: 'Loại công việc',
    required: true,
    description: 'Mã hoặc tên loại việc (TVTK_TT, TVTK_Tỉnh, TVTK_ON11, ĐTTT, POC, TIEN_VE...)',
    aliases: ['loại công việc', 'loại việc', 'mã loại việc', 'work type', 'loai cong viec', 'hình thức việc'],
    example: 'TVTK_TT'
  },
  {
    key: 'productCode',
    label: 'Module / Phân hệ',
    required: false,
    description: 'Sản phẩm hoặc Module liên quan (bắt buộc nếu loại việc yêu cầu chọn module)',
    aliases: ['module', 'phân hệ', 'sản phẩm', 'product', 'phan he', 'module liên quan'],
    example: 'Sản xuất'
  },
  {
    key: 'quantity',
    label: 'Khối lượng / Số lượng',
    required: false,
    description: 'Số lượng hoặc số buổi/giờ thực hiện (mặc định: 1)',
    aliases: ['khối lượng', 'số lượng', 'khoi luong', 'so luong', 'quantity', 'số buổi'],
    example: '1'
  },
  {
    key: 'amount',
    label: 'Số tiền (VNĐ)',
    required: false,
    description: 'Số tiền thu về (áp dụng cho loại việc tính tiền như TIEN_VE)',
    aliases: ['số tiền', 'tiền về', 'doanh số', 'giá trị', 'so tien', 'vnđ', 'amount'],
    example: '15000000'
  },
  {
    key: 'recordedScore',
    label: 'Điểm ghi nhận',
    required: false,
    description: 'Điểm ghi nhận thực tế (nếu để trống hệ thống tự tra cứu theo điểm tham chiếu)',
    aliases: ['điểm ghi nhận', 'điểm', 'diem ghi nhan', 'score', 'kpi'],
    example: '10'
  },
  {
    key: 'notes',
    label: 'Ghi chú',
    required: false,
    description: 'Ghi chú bổ sung',
    aliases: ['ghi chú', 'ghi chu', 'notes', 'note'],
    example: 'Khách hàng nghiệm thu đạt yêu cầu'
  }
];

// Helper: Get Excel column letter (0 -> A, 1 -> B, 25 -> Z, 26 -> AA)
export function getExcelColumnLetter(colIndex: number): string {
  let letter = '';
  let temp = colIndex;
  while (temp >= 0) {
    letter = String.fromCharCode((temp % 26) + 65) + letter;
    temp = Math.floor(temp / 26) - 1;
  }
  return letter;
}

// Columns from error files that must be ignored during field mapping
const DIAGNOSTIC_COLUMNS = [
  'sheet gốc',
  'dòng excel gốc',
  'trường lỗi',
  'nội dung lỗi',
  'hướng khắc phục',
  'sheet goc',
  'dong excel goc',
  'truong loi',
  'noi dung loi',
  'huong khac phuc'
];

export interface ExcelRowItem {
  excelRow: number; // 1-based actual row number in Excel
  originalExcelRow?: number | null; // From "Dòng Excel gốc" if re-uploading error file
  sheetName: string;
  rawCells: Record<number, string>; // colIndex -> value
  parsedData: Record<string, any>; // fieldKey -> parsed value
  status: 'VALID' | 'ERROR';
  errors: Array<{
    field: string;
    fieldLabel: string;
    value: any;
    message: string;
    suggestion: string;
  }>;
}

export const ExcelImportWizard: React.FC<ExcelImportWizardProps> = ({
  initialTargetType = 'packages',
  allowChangeTarget = true,
  monthYear,
  onMonthChange,
  isMonthLocked,
  members,
  workTypes,
  products,
  referenceScores,
  packageCoreConfig,
  packages,
  progressTasks,
  customers,
  session,
  onSuccessImport,
  onClose,
  isModal = false
}) => {
  // Wizard Step: 1 = Tải tệp lên, 2 = Ghép trường thông tin, 3 = Kiểm tra & nhập dữ liệu
  const [currentStep, setCurrentStep] = useState<1 | 2 | 3>(1);

  // Target Subsystem
  const [targetType, setTargetType] = useState<ImportTargetType>(initialTargetType);

  // Step 1: File & Sheet State
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [workbook, setWorkbook] = useState<XLSX.WorkBook | null>(null);
  const [availableSheets, setAvailableSheets] = useState<string[]>([]);
  const [selectedSheet, setSelectedSheet] = useState<string>('');
  const [headerRow, setHeaderRow] = useState<number>(1); // 1-based
  const [sheetRawMatrix, setSheetRawMatrix] = useState<string[][]>([]);
  const [fileError, setFileError] = useState<string | null>(null);

  // Step 2: Field Mapping State: Record<fieldKey, colIndex | -1>
  const [fieldMapping, setFieldMapping] = useState<Record<string, number>>({});

  // Step 3: Validation & Inspection State
  const [validatedRows, setValidatedRows] = useState<ExcelRowItem[]>([]);
  const [isValidating, setIsValidating] = useState<boolean>(false);
  const [validationFilter, setValidationFilter] = useState<'ALL' | 'VALID' | 'ERROR'>('ALL');

  // Confirmation Modal & Execution State
  const [isConfirmModalOpen, setIsConfirmModalOpen] = useState<boolean>(false);
  const [isImporting, setIsImporting] = useState<boolean>(false);
  const [importProgressPercent, setImportProgressPercent] = useState<number>(0);
  const [importSuccessResult, setImportSuccessResult] = useState<{
    batchId: string;
    count: number;
    message: string;
  } | null>(null);
  const [importErrorResult, setImportErrorResult] = useState<string | null>(null);

  // Drag and drop ref
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Active Field Definitions based on Target
  const currentFields = useMemo(() => {
    return targetType === 'packages' ? PACKAGE_FIELDS : PROGRESS_FIELDS;
  }, [targetType]);

  const targetName = useMemo(() => {
    return targetType === 'packages' ? 'Tiếp nhận gói đào tạo' : 'Tiến độ thực hiện';
  }, [targetType]);

  // Keep targetType in sync with initial prop if changed externally
  useEffect(() => {
    if (!allowChangeTarget && initialTargetType) {
      setTargetType(initialTargetType);
    }
  }, [initialTargetType, allowChangeTarget]);

  // Handle target switch (allowed only from Nhập dữ liệu)
  const handleChangeTargetType = (newTarget: ImportTargetType) => {
    if (newTarget === targetType) return;
    setTargetType(newTarget);
    // Reset mapping and validation when target changes
    setFieldMapping({});
    setValidatedRows([]);
    setImportSuccessResult(null);
    setImportErrorResult(null);
  };

  // Helper: Extract Text Safely from Cell
  const formatCellValue = (val: any): string => {
    if (val === undefined || val === null) return '';
    if (typeof val === 'number') {
      return val.toString();
    }
    return String(val).trim();
  };

  // -------------------------------------------------------------
  // STEP 1: Parse Excel File & Propose Header Row
  // -------------------------------------------------------------
  const handleFileSelected = async (file: File) => {
    setFileError(null);
    setImportSuccessResult(null);
    setImportErrorResult(null);
    setValidatedRows([]);

    // Check extension
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!['.xlsx', '.xls'].includes(ext)) {
      setFileError('Định dạng tệp không được hỗ trợ. Vui lòng tải lên tệp Excel có đuôi .xlsx hoặc .xls.');
      return;
    }

    try {
      const buffer = await file.arrayBuffer();
      const wb = XLSX.read(buffer, {
        type: 'array',
        cellDates: true,
        raw: false // Preserves text formats (like leading 0 in tax codes)
      });

      if (!wb.SheetNames || wb.SheetNames.length === 0) {
        setFileError('Tệp Excel không chứa sheet dữ liệu nào hoặc tệp bị hỏng.');
        return;
      }

      setSelectedFile(file);
      setWorkbook(wb);
      setAvailableSheets(wb.SheetNames);
      const firstSheet = wb.SheetNames[0];
      setSelectedSheet(firstSheet);
      loadSheetData(wb, firstSheet);
    } catch (err: any) {
      console.error('Error reading Excel file:', err);
      setFileError(`Không thể đọc tệp Excel: ${err.message || 'Tệp có thể bị hỏng hoặc có mật khẩu bảo vệ'}. Vui lòng kiểm tra lại.`);
      setSelectedFile(null);
      setWorkbook(null);
    }
  };

  const loadSheetData = (wb: XLSX.WorkBook, sheetName: string) => {
    const ws = wb.Sheets[sheetName];
    if (!ws) return;

    // Convert to 2D array of string values
    const rawMatrix: any[][] = XLSX.utils.sheet_to_json(ws, {
      header: 1,
      defval: '',
      raw: false
    });

    const stringMatrix: string[][] = rawMatrix.map(row =>
      Array.isArray(row) ? row.map(formatCellValue) : []
    );

    setSheetRawMatrix(stringMatrix);

    // Auto-detect header row (1-based): Find first row with at least 2 non-empty values
    let detectedHeaderRow = 1;
    for (let r = 0; r < Math.min(stringMatrix.length, 10); r++) {
      const row = stringMatrix[r];
      const filledCount = row.filter(cell => cell.trim() !== '').length;
      if (filledCount >= 2) {
        detectedHeaderRow = r + 1;
        break;
      }
    }

    setHeaderRow(detectedHeaderRow);
    // Invalidate previous mapping and validation results
    setFieldMapping({});
    setValidatedRows([]);
  };

  const handleSheetChange = (newSheet: string) => {
    if (!workbook || newSheet === selectedSheet) return;
    setSelectedSheet(newSheet);
    loadSheetData(workbook, newSheet);
  };

  const handleHeaderRowChange = (newRow: number) => {
    const validRow = Math.max(1, newRow);
    setHeaderRow(validRow);
    // Invalidate previous mapping and validation
    setFieldMapping({});
    setValidatedRows([]);
  };

  // Get sheet columns from headerRow
  const sheetColumns = useMemo(() => {
    if (sheetRawMatrix.length === 0 || headerRow > sheetRawMatrix.length) {
      return [];
    }
    const headerRowIndex = headerRow - 1;
    const headerValues = sheetRawMatrix[headerRowIndex] || [];
    
    // Find max length across top rows to show all columns
    let maxCols = headerValues.length;
    for (let r = 0; r < Math.min(sheetRawMatrix.length, 20); r++) {
      if (sheetRawMatrix[r].length > maxCols) {
        maxCols = sheetRawMatrix[r].length;
      }
    }

    const cols: Array<{ colIndex: number; colLetter: string; title: string; fullLabel: string }> = [];
    for (let c = 0; c < maxCols; c++) {
      const colLetter = getExcelColumnLetter(c);
      const rawTitle = (headerValues[c] || '').trim();
      const title = rawTitle || `(Cột ${colLetter} trống)`;
      cols.push({
        colIndex: c,
        colLetter,
        title,
        fullLabel: `${colLetter} - ${title}`
      });
    }
    return cols;
  }, [sheetRawMatrix, headerRow]);

  // -------------------------------------------------------------
  // STEP 2: Intelligent Field Mapping & Auto-Proposals
  // -------------------------------------------------------------
  useEffect(() => {
    // When entering Step 2 or when sheetColumns/currentFields change, auto-propose mapping if not yet set
    if (sheetColumns.length === 0) return;

    // Check if we need to auto-propose
    const newMapping: Record<string, number> = { ...fieldMapping };
    let hasChanges = false;

    // Set of columns already assigned
    const assignedCols = new Set<number>();
    Object.values(newMapping).forEach(col => {
      if (col >= 0) assignedCols.add(col);
    });

    currentFields.forEach(field => {
      // If field is already mapped to a valid column, keep it
      if (newMapping[field.key] !== undefined && newMapping[field.key] >= 0) {
        return;
      }

      // Try matching by exact or alias keywords
      let bestColIndex = -1;
      let highestScore = 0;

      sheetColumns.forEach(col => {
        // Skip already assigned columns
        if (assignedCols.has(col.colIndex)) return;

        // Skip diagnosis columns from error files (Sheet gốc, Dòng Excel gốc, Trường lỗi...)
        const colTitleNorm = col.title.toLowerCase().trim();
        if (DIAGNOSTIC_COLUMNS.some(diag => colTitleNorm.includes(diag))) {
          return;
        }

        // Match normalized text
        for (const alias of field.aliases) {
          const aliasNorm = alias.toLowerCase().trim();
          if (colTitleNorm === aliasNorm) {
            bestColIndex = col.colIndex;
            highestScore = 100;
            break;
          } else if (colTitleNorm.includes(aliasNorm) && aliasNorm.length > 2) {
            const score = aliasNorm.length;
            if (score > highestScore) {
              bestColIndex = col.colIndex;
              highestScore = score;
            }
          }
        }
      });

      if (bestColIndex >= 0) {
        newMapping[field.key] = bestColIndex;
        assignedCols.add(bestColIndex);
        hasChanges = true;
      } else if (newMapping[field.key] === undefined) {
        newMapping[field.key] = -1; // Unmapped
        hasChanges = true;
      }
    });

    if (hasChanges) {
      setFieldMapping(newMapping);
    }
  }, [sheetColumns, currentFields]);

  // Check if all required fields are mapped
  const missingRequiredFields = useMemo(() => {
    return currentFields
      .filter(f => f.required)
      .filter(f => fieldMapping[f.key] === undefined || fieldMapping[f.key] < 0);
  }, [currentFields, fieldMapping]);

  const canProceedToStep3 = missingRequiredFields.length === 0;

  // Get sample values for a column
  const getColumnSampleValues = (colIndex: number): string[] => {
    if (colIndex < 0 || sheetRawMatrix.length === 0) return [];
    const samples: string[] = [];
    const startRow = headerRow; // 0-based is headerRow because headerRow is 1-based
    for (let r = startRow; r < sheetRawMatrix.length && samples.length < 3; r++) {
      const val = (sheetRawMatrix[r]?.[colIndex] || '').trim();
      if (val && !samples.includes(val)) {
        samples.push(val);
      }
    }
    return samples;
  };

  // -------------------------------------------------------------
  // STEP 3: Full-Dataset Validation Engine
  // -------------------------------------------------------------
  const runValidation = () => {
    setIsValidating(true);
    setValidatedRows([]);

    // Find if file contains original Excel row column from a previous error export
    let originalRowColIndex = -1;
    sheetColumns.forEach(c => {
      const norm = c.title.toLowerCase().trim();
      if (norm.includes('dòng excel gốc') || norm.includes('dong excel goc')) {
        originalRowColIndex = c.colIndex;
      }
    });

    const rows: ExcelRowItem[] = [];
    const dataStartIndex = headerRow; // row index in sheetRawMatrix (headerRow is 1-based, so its index is headerRow - 1, data starts at headerRow)

    // Maps for duplicate checks within this file
    const fileSeenPackageKeys = new Set<string>();
    const fileSeenProgressKeys = new Set<string>();
    const fileSeenLeaderTaxCodes = new Set<string>();

    for (let r = dataStartIndex; r < sheetRawMatrix.length; r++) {
      const actualExcelRow = r + 1; // 1-based Excel row number
      const rowCells = sheetRawMatrix[r] || [];

      // Check if row is completely blank
      const isCompletelyBlank = rowCells.every(c => !c || c.trim() === '');
      if (isCompletelyBlank) {
        continue; // Skip entirely blank rows while keeping original row numbers intact!
      }

      // Check original row if re-uploaded
      let originalExcelRow: number | null = null;
      if (originalRowColIndex >= 0 && rowCells[originalRowColIndex]) {
        const rawOrig = rowCells[originalRowColIndex].toString().replace(/[^\d]/g, '');
        if (rawOrig) {
          originalExcelRow = parseInt(rawOrig, 10);
        }
      }

      const rawCellsMap: Record<number, string> = {};
      rowCells.forEach((c, idx) => {
        rawCellsMap[idx] = c;
      });

      const parsedData: Record<string, any> = {};
      const rowErrors: ExcelRowItem['errors'] = [];

      // Extract values according to mapping
      currentFields.forEach(f => {
        const colIdx = fieldMapping[f.key];
        if (colIdx !== undefined && colIdx >= 0) {
          parsedData[f.key] = formatCellValue(rowCells[colIdx]);
        } else {
          parsedData[f.key] = '';
        }
      });

      // ----------------------------------------
      // BUSINESS VALIDATION FOR PACKAGES
      // ----------------------------------------
      if (targetType === 'packages') {
        const taxCode = cleanTaxCode(parsedData.taxCode);
        const customerName = (parsedData.customerName || '').trim();
        const rawDate = (parsedData.receptionDate || '').trim();
        const rawModule = (parsedData.moduleCode || '').trim();
        const rawPerformer = (parsedData.onbCode || '').trim();
        const rawSource = (parsedData.sourceCode || '').trim();
        const rawClass = (parsedData.packageClass || '').trim();
        const rawTier = (parsedData.customerTier || '').trim();
        const rawWorkForm = (parsedData.workForm || '').trim();
        const rawLeader = (parsedData.leaderPlatforms || '').trim();
        const rawScore = (parsedData.recordedScore || '').trim();

        // 1. Tax Code required
        if (!taxCode) {
          rowErrors.push({
            field: 'taxCode',
            fieldLabel: 'Mã số thuế',
            value: parsedData.taxCode,
            message: 'Mã số thuế không được để trống.',
            suggestion: 'Vui lòng nhập mã số thuế hợp lệ (ví dụ: 0108923456).'
          });
        }

        // 2. Customer Name required
        if (!customerName) {
          rowErrors.push({
            field: 'customerName',
            fieldLabel: 'Tên khách hàng',
            value: parsedData.customerName,
            message: 'Tên khách hàng không được để trống.',
            suggestion: 'Vui lòng nhập tên công ty hoặc tên khách hàng.'
          });
        }

        // 3. Reception Date required and format check
        let validIsoDate = '';
        if (!rawDate) {
          rowErrors.push({
            field: 'receptionDate',
            fieldLabel: 'Ngày tiếp nhận',
            value: parsedData.receptionDate,
            message: 'Ngày tiếp nhận không được để trống.',
            suggestion: 'Nhập ngày theo định dạng YYYY-MM-DD hoặc DD/MM/YYYY.'
          });
        } else {
          // Normalize date format
          validIsoDate = normalizeDateToIso(rawDate);
          if (!validIsoDate) {
            rowErrors.push({
              field: 'receptionDate',
              fieldLabel: 'Ngày tiếp nhận',
              value: rawDate,
              message: `Định dạng ngày "${rawDate}" không hợp lệ.`,
              suggestion: 'Vui lòng nhập đúng định dạng DD/MM/YYYY hoặc YYYY-MM-DD.'
            });
          } else {
            parsedData.receptionDate = validIsoDate;
            const rowMonth = validIsoDate.slice(0, 7);
            parsedData.monthYear = rowMonth;

            // Check if month matches selected month (if monthYear is specified)
            if (monthYear && rowMonth !== monthYear) {
              rowErrors.push({
                field: 'receptionDate',
                fieldLabel: 'Ngày tiếp nhận',
                value: rawDate,
                message: `Ngày tiếp nhận (${rawDate}) thuộc tháng ${rowMonth}, không khớp với Tháng áp dụng (${monthYear}).`,
                suggestion: `Vui lòng chỉnh ngày về tháng ${monthYear} hoặc chọn lại Tháng áp dụng trên giao diện.`
              });
            }

            // Check if month is locked
            if (isMonthLocked && rowMonth === monthYear) {
              rowErrors.push({
                field: 'receptionDate',
                fieldLabel: 'Kỳ hoạt động',
                value: rowMonth,
                message: `Tháng ${rowMonth} đã bị khóa đối soát chính thức.`,
                suggestion: 'Liên hệ Quản trị viên chính để mở lại kỳ nếu cần bổ sung dữ liệu.'
              });
            }
          }
        }

        // 4. Module required and exists in packageCoreConfig.modules
        const matchedModule = packageCoreConfig.modules?.find(
          m => m.code.toLowerCase() === rawModule.toLowerCase() || m.name.toLowerCase() === rawModule.toLowerCase()
        );
        if (!rawModule) {
          rowErrors.push({
            field: 'moduleCode',
            fieldLabel: 'Module tiếp nhận',
            value: parsedData.moduleCode,
            message: 'Module tiếp nhận không được để trống.',
            suggestion: 'Vui lòng chọn module: Sản xuất, CRM, HRM, Mua hàng, VPS, Kế toán, Các bộ khác.'
          });
        } else if (!matchedModule) {
          rowErrors.push({
            field: 'moduleCode',
            fieldLabel: 'Module tiếp nhận',
            value: rawModule,
            message: `Module "${rawModule}" không tồn tại trong danh mục Thiết lập hệ thống.`,
            suggestion: 'Vui lòng nhập chính xác tên một trong các module: ' + (packageCoreConfig.modules?.map(m => m.name).join(', ') || 'Sản xuất, CRM, HRM...')
          });
        } else {
          parsedData.moduleCode = matchedModule.code;
          parsedData.moduleName = matchedModule.name;
        }

        // 5. Performer required and exists in members
        const matchedMember = members.find(
          m => m.code.toUpperCase() === rawPerformer.toUpperCase() ||
               m.shortCode.toUpperCase() === rawPerformer.toUpperCase() ||
               m.fullName.toLowerCase() === rawPerformer.toLowerCase()
        );
        if (!rawPerformer) {
          rowErrors.push({
            field: 'onbCode',
            fieldLabel: 'Người thực hiện',
            value: parsedData.onbCode,
            message: 'Người thực hiện không được để trống.',
            suggestion: 'Vui lòng nhập mã nhân sự ONB (ví dụ: DTHANG, NTGIANG...)'
          });
        } else if (!matchedMember) {
          rowErrors.push({
            field: 'onbCode',
            fieldLabel: 'Người thực hiện',
            value: rawPerformer,
            message: `Mã/Tên nhân sự "${rawPerformer}" không tồn tại trong danh mục nhân sự ONB.`,
            suggestion: 'Kiểm tra lại danh sách nhân sự tại phân hệ Thiết lập hệ thống.'
          });
        } else if (matchedMember.isActive === false) {
          rowErrors.push({
            field: 'onbCode',
            fieldLabel: 'Người thực hiện',
            value: rawPerformer,
            message: `Nhân sự "${matchedMember.fullName}" (${matchedMember.code}) đang ở trạng thái Ngưng sử dụng.`,
            suggestion: 'Vui lòng phân bổ cho nhân sự đang hoạt động.'
          });
        } else {
          parsedData.onbCode = matchedMember.code;
          parsedData.memberName = matchedMember.fullName;
        }

        // 6. Source validation (optional, defaults to first active source)
        if (rawSource) {
          const matchedSource = packageCoreConfig.sources?.find(
            s => s.code.toLowerCase() === rawSource.toLowerCase() || s.name.toLowerCase() === rawSource.toLowerCase()
          );
          if (!matchedSource) {
            rowErrors.push({
              field: 'sourceCode',
              fieldLabel: 'Nguồn tiếp nhận',
              value: rawSource,
              message: `Nguồn tiếp nhận "${rawSource}" không có trong danh mục.`,
              suggestion: 'Chọn nguồn hợp lệ (ví dụ: Bán thêm 1, Bán mới 1, Khác...)'
            });
          } else {
            parsedData.sourceCode = matchedSource.code;
            parsedData.sourceName = matchedSource.name;
          }
        } else {
          parsedData.sourceCode = packageCoreConfig.sources?.[0]?.code || 'SRC_BAN_THEM_1';
        }

        // 7. Classification validation
        if (rawClass) {
          const matchedCls = packageCoreConfig.classifications?.find(
            c => c.name.toLowerCase() === rawClass.toLowerCase() || c.code.toLowerCase() === rawClass.toLowerCase()
          );
          if (!matchedCls) {
            rowErrors.push({
              field: 'packageClass',
              fieldLabel: 'Phân loại gói',
              value: rawClass,
              message: `Phân loại "${rawClass}" không hợp lệ.`,
              suggestion: 'Chọn "Tiếp nhận mới" hoặc "Tiếp nhận lại".'
            });
          } else {
            parsedData.packageClass = matchedCls.name;
          }
        } else {
          parsedData.packageClass = 'Tiếp nhận mới';
        }

        // 8. Tier validation
        if (rawTier) {
          const matchedTier = packageCoreConfig.customerTiers?.find(
            t => t.code.toUpperCase() === rawTier.toUpperCase() || t.name.toUpperCase() === rawTier.toUpperCase()
          );
          if (!matchedTier) {
            rowErrors.push({
              field: 'customerTier',
              fieldLabel: 'Hạng khách hàng',
              value: rawTier,
              message: `Hạng khách hàng "${rawTier}" không hợp lệ.`,
              suggestion: 'Chọn: BASIC, BRONZE, SILVER, GOLD.'
            });
          } else {
            parsedData.customerTier = matchedTier.code;
          }
        } else {
          parsedData.customerTier = 'SILVER';
        }

        // 9. Work Form validation
        if (rawWorkForm) {
          const matchedWf = packageCoreConfig.workTypes?.find(
            w => w.name.toLowerCase() === rawWorkForm.toLowerCase() || w.code.toLowerCase() === rawWorkForm.toLowerCase()
          );
          if (!matchedWf) {
            rowErrors.push({
              field: 'workForm',
              fieldLabel: 'Hình thức',
              value: rawWorkForm,
              message: `Hình thức "${rawWorkForm}" không hợp lệ.`,
              suggestion: 'Chọn: POC, Demo, Đào tạo, Tư vấn.'
            });
          } else {
            parsedData.workForm = matchedWf.name;
          }
        } else {
          parsedData.workForm = 'Đào tạo';
        }

        // 10. Leader Platforms check
        let numPlatforms: number | undefined;
        if (rawLeader) {
          const parsedNum = parseInt(rawLeader, 10);
          if (isNaN(parsedNum) || parsedNum < 2) {
            rowErrors.push({
              field: 'leaderPlatforms',
              fieldLabel: 'Số nền tảng Leader',
              value: rawLeader,
              message: `Số nền tảng Leader "${rawLeader}" không hợp lệ (phải từ 2 nền tảng trở lên).`,
              suggestion: 'Nhập số nguyên từ 2, 3, 4, 5 trở lên.'
            });
          } else {
            numPlatforms = parsedNum;
            parsedData.leaderPlatforms = parsedNum;

            // Check Leader uniqueness rule across entire system and within file
            if (taxCode) {
              if (fileSeenLeaderTaxCodes.has(taxCode)) {
                rowErrors.push({
                  field: 'leaderPlatforms',
                  fieldLabel: 'Xung đột Leader trong file',
                  value: rawLeader,
                  message: `Mã số thuế ${taxCode} đã có một dòng khác trong file khai báo Leader.`,
                  suggestion: 'Mỗi mã số thuế chỉ có 1 khai báo Leader duy nhất. Vui lòng xóa khai báo Leader ở các dòng trùng lặp.'
                });
              } else {
                fileSeenLeaderTaxCodes.add(taxCode);
              }

              // Check existing leader claim across all packages in database
              const existingClaim = findExistingLeaderClaimInDb(packages, members, taxCode);
              if (existingClaim) {
                rowErrors.push({
                  field: 'leaderPlatforms',
                  fieldLabel: 'Xung đột Leader với hệ thống',
                  value: rawLeader,
                  message: `Mã số thuế này đã có khai báo Leader trong hệ thống: ${existingClaim.memberName} · ${existingClaim.packageCode} · ${existingClaim.moduleName} · Tháng ${existingClaim.monthYear}.`,
                  suggestion: 'Không được khai báo thêm Leader cho mã số thuế đã có Leader.'
                });
              }
            }
          }
        }

        // 11. Score validation & auto-calculation
        const calcResult = calculatePackageScore(
          packageCoreConfig,
          parsedData.sourceCode || 'SRC_BAN_THEM_1',
          parsedData.workForm || 'Đào tạo',
          parsedData.customerTier || 'SILVER',
          numPlatforms
        );
        parsedData.suggestedScore = calcResult.suggestedScore;

        if (rawScore !== '') {
          const parsedScore = parseFloat(rawScore.replace(/,/g, '.'));
          if (isNaN(parsedScore) || parsedScore < 0) {
            rowErrors.push({
              field: 'recordedScore',
              fieldLabel: 'Điểm ghi nhận',
              value: rawScore,
              message: `Điểm ghi nhận "${rawScore}" không hợp lệ (phải là số >= 0).`,
              suggestion: 'Nhập điểm số không âm hoặc để trống để hệ thống tự tính điểm.'
            });
          } else {
            parsedData.recordedScore = parsedScore;
          }
        } else {
          parsedData.recordedScore = calcResult.suggestedScore;
        }

        // 12. Duplicate check within file: taxCode + module + onbCode
        if (taxCode && matchedModule && matchedMember) {
          const fileComboKey = `${taxCode}__${matchedModule.code}__${matchedMember.code}__${parsedData.monthYear || ''}`;
          if (fileSeenPackageKeys.has(fileComboKey)) {
            rowErrors.push({
              field: 'moduleCode',
              fieldLabel: 'Trùng lặp dữ liệu trong file',
              value: `${taxCode} - ${matchedModule.name} - ${matchedMember.code}`,
              message: `Dòng này trùng lặp với dòng khác trong file (cùng MST, module "${matchedModule.name}" và người thực hiện ${matchedMember.code}).`,
              suggestion: 'Xóa hoặc gộp các dòng trùng lặp trước khi nhập.'
            });
          } else {
            fileSeenPackageKeys.add(fileComboKey);
          }

          // Duplicate check with existing records in database
          const existingInDb = packages.some(p => {
            if (cleanTaxCode(p.taxCode) !== taxCode) return false;
            if (parsedData.monthYear && p.monthYear !== parsedData.monthYear) return false;
            return p.details?.some(d => d.moduleCode === matchedModule.code && d.onbCode === matchedMember.code);
          });

          if (existingInDb) {
            rowErrors.push({
              field: 'moduleCode',
              fieldLabel: 'Trùng lặp dữ liệu hệ thống',
              value: `${taxCode} - ${matchedModule.name}`,
              message: `Bản ghi cho MST ${taxCode}, module ${matchedModule.name} và người thực hiện ${matchedMember.code} đã tồn tại trong hệ thống.`,
              suggestion: 'Hệ thống không tự ý ghi đè dữ liệu cũ. Vui lòng kiểm tra lại.'
            });
          }
        }
      }

      // ----------------------------------------
      // BUSINESS VALIDATION FOR PROGRESS
      // ----------------------------------------
      else if (targetType === 'progress') {
        const rawPerformer = (parsedData.onbCode || '').trim();
        const rawDate = (parsedData.date || '').trim();
        const taskName = (parsedData.taskName || '').trim();
        const rawWorkType = (parsedData.workTypeCode || '').trim();
        const rawProduct = (parsedData.productCode || '').trim();
        const rawQty = (parsedData.quantity || '').trim();
        const rawAmount = (parsedData.amount || '').trim();
        const rawScore = (parsedData.recordedScore || '').trim();

        // 1. Performer required
        const matchedMember = members.find(
          m => m.code.toUpperCase() === rawPerformer.toUpperCase() ||
               m.shortCode.toUpperCase() === rawPerformer.toUpperCase() ||
               m.fullName.toLowerCase() === rawPerformer.toLowerCase()
        );
        if (!rawPerformer) {
          rowErrors.push({
            field: 'onbCode',
            fieldLabel: 'Nhân sự thực hiện',
            value: parsedData.onbCode,
            message: 'Nhân sự thực hiện không được để trống.',
            suggestion: 'Vui lòng nhập mã nhân sự ONB (ví dụ: DTHANG, NTGIANG...)'
          });
        } else if (!matchedMember) {
          rowErrors.push({
            field: 'onbCode',
            fieldLabel: 'Nhân sự thực hiện',
            value: rawPerformer,
            message: `Mã/Tên nhân sự "${rawPerformer}" không tồn tại trong danh mục nhân sự ONB.`,
            suggestion: 'Kiểm tra lại danh sách nhân sự tại phân hệ Thiết lập hệ thống.'
          });
        } else if (matchedMember.isActive === false) {
          rowErrors.push({
            field: 'onbCode',
            fieldLabel: 'Nhân sự thực hiện',
            value: rawPerformer,
            message: `Nhân sự "${matchedMember.fullName}" (${matchedMember.code}) đang ở trạng thái Ngưng sử dụng.`,
            suggestion: 'Vui lòng chọn nhân sự đang hoạt động.'
          });
        } else {
          parsedData.primaryOnbCode = matchedMember.code;
          parsedData.memberName = matchedMember.fullName;
        }

        // 2. Date required and format check
        let validIsoDate = '';
        if (!rawDate) {
          rowErrors.push({
            field: 'date',
            fieldLabel: 'Ngày thực hiện',
            value: parsedData.date,
            message: 'Ngày thực hiện không được để trống.',
            suggestion: 'Nhập ngày theo định dạng YYYY-MM-DD hoặc DD/MM/YYYY.'
          });
        } else {
          validIsoDate = normalizeDateToIso(rawDate);
          if (!validIsoDate) {
            rowErrors.push({
              field: 'date',
              fieldLabel: 'Ngày thực hiện',
              value: rawDate,
              message: `Định dạng ngày "${rawDate}" không hợp lệ.`,
              suggestion: 'Vui lòng nhập đúng định dạng DD/MM/YYYY hoặc YYYY-MM-DD.'
            });
          } else {
            parsedData.date = validIsoDate;
            const rowMonth = validIsoDate.slice(0, 7);
            parsedData.monthYear = rowMonth;

            if (monthYear && rowMonth !== monthYear) {
              rowErrors.push({
                field: 'date',
                fieldLabel: 'Ngày thực hiện',
                value: rawDate,
                message: `Ngày thực hiện (${rawDate}) thuộc tháng ${rowMonth}, không khớp với Tháng áp dụng (${monthYear}).`,
                suggestion: `Vui lòng chỉnh ngày về tháng ${monthYear} hoặc chọn lại Tháng áp dụng trên giao diện.`
              });
            }

            if (isMonthLocked && rowMonth === monthYear) {
              rowErrors.push({
                field: 'date',
                fieldLabel: 'Kỳ hoạt động',
                value: rowMonth,
                message: `Tháng ${rowMonth} đã bị khóa đối soát chính thức.`,
                suggestion: 'Liên hệ Quản trị viên để mở lại kỳ nếu cần bổ sung dữ liệu.'
              });
            }
          }
        }

        // 3. Task Name required
        if (!taskName) {
          rowErrors.push({
            field: 'taskName',
            fieldLabel: 'Nội dung / Nhiệm vụ',
            value: parsedData.taskName,
            message: 'Nội dung công việc không được để trống.',
            suggestion: 'Vui lòng nhập tên công việc hoặc nội dung đã triển khai.'
          });
        } else {
          parsedData.taskName = taskName;
        }

        // 4. Work Type required and exists in workTypes
        const matchedWt = workTypes.find(
          w => w.code.toLowerCase() === rawWorkType.toLowerCase() || w.name.toLowerCase() === rawWorkType.toLowerCase()
        );
        if (!rawWorkType) {
          rowErrors.push({
            field: 'workTypeCode',
            fieldLabel: 'Loại công việc',
            value: parsedData.workTypeCode,
            message: 'Loại công việc không được để trống.',
            suggestion: 'Vui lòng chọn loại công việc (ví dụ: TVTK_TT, TVTK_Tỉnh, TVTK_ON11, ĐTTT, POC, TIEN_VE...)'
          });
        } else if (!matchedWt) {
          rowErrors.push({
            field: 'workTypeCode',
            fieldLabel: 'Loại công việc',
            value: rawWorkType,
            message: `Loại công việc "${rawWorkType}" không tồn tại trong danh mục Thiết lập hệ thống.`,
            suggestion: 'Kiểm tra lại mã loại việc tại phân hệ Thiết lập hệ thống.'
          });
        } else if (matchedWt.isActive === false) {
          rowErrors.push({
            field: 'workTypeCode',
            fieldLabel: 'Loại công việc',
            value: rawWorkType,
            message: `Loại công việc "${matchedWt.name}" đang ở trạng thái Ngưng sử dụng.`,
            suggestion: 'Vui lòng chọn loại công việc đang hoạt động.'
          });
        } else {
          parsedData.workTypeCode = matchedWt.code;
          parsedData.workTypeName = matchedWt.name;

          // 5. Product check (if required by workType)
          if (matchedWt.requiresProduct) {
            if (!rawProduct) {
              rowErrors.push({
                field: 'productCode',
                fieldLabel: 'Module / Phân hệ',
                value: parsedData.productCode,
                message: `Loại việc "${matchedWt.name}" bắt buộc phải chọn phân hệ/module.`,
                suggestion: 'Vui lòng nhập tên module hợp lệ (ví dụ: Sản xuất, CRM, HRM, Kế toán...)'
              });
            } else {
              const matchedProd = products.find(
                p => p.code.toLowerCase() === rawProduct.toLowerCase() || p.name.toLowerCase() === rawProduct.toLowerCase()
              );
              if (!matchedProd) {
                rowErrors.push({
                  field: 'productCode',
                  fieldLabel: 'Module / Phân hệ',
                  value: rawProduct,
                  message: `Module "${rawProduct}" không tồn tại trong danh mục sản phẩm.`,
                  suggestion: 'Chọn module hợp lệ từ danh mục sản phẩm.'
                });
              } else {
                parsedData.productCode = matchedProd.code;
              }
            }
          } else if (rawProduct) {
            const matchedProd = products.find(
              p => p.code.toLowerCase() === rawProduct.toLowerCase() || p.name.toLowerCase() === rawProduct.toLowerCase()
            );
            if (matchedProd) {
              parsedData.productCode = matchedProd.code;
            } else {
              parsedData.productCode = rawProduct;
            }
          }
        }

        // 6. Quantity / Amount validation
        let qtyVal = 1;
        if (rawQty) {
          const parsed = parseFloat(rawQty.replace(/,/g, '.'));
          if (isNaN(parsed) || parsed < 0) {
            rowErrors.push({
              field: 'quantity',
              fieldLabel: 'Khối lượng',
              value: rawQty,
              message: `Khối lượng "${rawQty}" không hợp lệ (phải là số >= 0).`,
              suggestion: 'Nhập số hợp lệ (ví dụ: 1, 0.5, 2...)'
            });
          } else {
            qtyVal = parsed;
            parsedData.quantity = parsed;
          }
        } else {
          parsedData.quantity = 1;
        }

        let amountVal: number | undefined;
        if (rawAmount) {
          const cleaned = rawAmount.replace(/[^\d]/g, '');
          if (cleaned) {
            amountVal = parseInt(cleaned, 10);
            parsedData.amount = amountVal;
          }
        }

        // 7. Core KPI Score Evaluation
        let evaluatedScore = 0;
        if (matchedWt && validIsoDate) {
          try {
            const scoreEval = evaluateCoreScore(
              referenceScores,
              workTypes,
              matchedWt.code,
              parsedData.productCode,
              validIsoDate,
              amountVal !== undefined ? amountVal : qtyVal
            );
            evaluatedScore = scoreEval.suggestedScore || 0;
            parsedData.suggestedScore = evaluatedScore;
          } catch (e) {
            console.error('Error evaluating KPI score:', e);
          }
        }

        if (rawScore !== '') {
          const parsedScore = parseFloat(rawScore.replace(/,/g, '.'));
          if (isNaN(parsedScore) || parsedScore < 0) {
            rowErrors.push({
              field: 'recordedScore',
              fieldLabel: 'Điểm ghi nhận',
              value: rawScore,
              message: `Điểm ghi nhận "${rawScore}" không hợp lệ (phải là số >= 0).`,
              suggestion: 'Nhập điểm số không âm hoặc để trống để hệ thống tự tính điểm.'
            });
          } else {
            parsedData.recordedScore = parsedScore;
          }
        } else {
          parsedData.recordedScore = evaluatedScore;
        }

        // 8. Duplicate check within file: primaryOnbCode + date + workTypeCode + taskName
        if (matchedMember && validIsoDate && matchedWt && taskName) {
          const fileComboKey = `${matchedMember.code}__${validIsoDate}__${matchedWt.code}__${taskName.toLowerCase()}`;
          if (fileSeenProgressKeys.has(fileComboKey)) {
            rowErrors.push({
              field: 'taskName',
              fieldLabel: 'Trùng lặp công việc trong file',
              value: taskName,
              message: `Dòng này bị trùng lặp với dòng khác trong file (cùng nhân sự, ngày, loại việc và tên nhiệm vụ).`,
              suggestion: 'Xóa hoặc điều chỉnh tên nhiệm vụ để phân biệt.'
            });
          } else {
            fileSeenProgressKeys.add(fileComboKey);
          }

          // Duplicate check with existing progress tasks in database
          const existingInDb = progressTasks.some(
            t => t.primaryOnbCode === matchedMember.code &&
                 t.date === validIsoDate &&
                 t.workTypeCode === matchedWt.code &&
                 t.taskName.toLowerCase().trim() === taskName.toLowerCase().trim()
          );

          if (existingInDb) {
            rowErrors.push({
              field: 'taskName',
              fieldLabel: 'Trùng lặp công việc hệ thống',
              value: taskName,
              message: `Công việc này đã tồn tại trong hệ thống (cùng nhân sự ${matchedMember.code}, ngày ${validIsoDate}, loại việc ${matchedWt.name}).`,
              suggestion: 'Hệ thống không tự ý ghi đè. Vui lòng kiểm tra lại.'
            });
          }
        }
      }

      rows.push({
        excelRow: actualExcelRow,
        originalExcelRow,
        sheetName: selectedSheet,
        rawCells: rawCellsMap,
        parsedData,
        status: rowErrors.length === 0 ? 'VALID' : 'ERROR',
        errors: rowErrors
      });
    }

    setValidatedRows(rows);
    setIsValidating(false);
  };

  // Run validation whenever entering Step 3
  useEffect(() => {
    if (currentStep === 3) {
      runValidation();
    }
  }, [currentStep]);

  // Statistics
  const totalRowsCount = validatedRows.length;
  const validRows = useMemo(() => validatedRows.filter(r => r.status === 'VALID'), [validatedRows]);
  const errorRows = useMemo(() => validatedRows.filter(r => r.status === 'ERROR'), [validatedRows]);
  const validCount = validRows.length;
  const errorCount = errorRows.length;

  // Filtered rows for table view
  const displayRows = useMemo(() => {
    if (validationFilter === 'VALID') return validRows;
    if (validationFilter === 'ERROR') return errorRows;
    return validatedRows;
  }, [validatedRows, validationFilter, validRows, errorRows]);

  // -------------------------------------------------------------
  // STEP 3: Export Errors to .xlsx
  // -------------------------------------------------------------
  const handleExportErrorFile = () => {
    if (errorRows.length === 0) return;

    // Collect all original headers from headerRow
    const originalHeaders: string[] = [];
    const headerRowIdx = headerRow - 1;
    const originalHeaderCells = sheetRawMatrix[headerRowIdx] || [];

    // Filter out previous diagnostic columns if any to avoid duplication
    const cleanHeaderIndices: number[] = [];
    originalHeaderCells.forEach((h, idx) => {
      const norm = (h || '').toLowerCase().trim();
      if (!DIAGNOSTIC_COLUMNS.some(diag => norm.includes(diag))) {
        cleanHeaderIndices.push(idx);
        originalHeaders.push(h || `Cột ${getExcelColumnLetter(idx)}`);
      }
    });

    // Append the 5 diagnostic columns requested in prompt:
    // Sheet gốc, Dòng Excel gốc, Trường lỗi, Nội dung lỗi, Hướng khắc phục
    const finalHeaders = [
      ...originalHeaders,
      'Sheet gốc',
      'Dòng Excel gốc',
      'Trường lỗi',
      'Nội dung lỗi',
      'Hướng khắc phục'
    ];

    const aoaData: any[][] = [finalHeaders];

    errorRows.forEach(row => {
      const rowValues: any[] = [];
      // Keep original values exactly
      cleanHeaderIndices.forEach(idx => {
        rowValues.push(row.rawCells[idx] || '');
      });

      // Diagnosis columns
      const errorFields = Array.from(new Set(row.errors.map(e => e.fieldLabel))).join('; ');
      const errorContents = row.errors.map(e => `${e.fieldLabel}: ${e.message}`).join(';\n');
      const errorSuggestions = row.errors.map(e => `${e.fieldLabel}: ${e.suggestion}`).join(';\n');

      const originLine = row.originalExcelRow
        ? `Dòng ${row.originalExcelRow}`
        : `Dòng ${row.excelRow}`;

      rowValues.push(row.sheetName);
      rowValues.push(originLine);
      rowValues.push(errorFields);
      rowValues.push(errorContents);
      rowValues.push(errorSuggestions);

      aoaData.push(rowValues);
    });

    const ws = XLSX.utils.aoa_to_sheet(aoaData);

    // Set column widths
    ws['!cols'] = finalHeaders.map((h, i) => {
      if (i >= originalHeaders.length) {
        return { wch: 30 };
      }
      return { wch: 18 };
    });

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Dong_Loi');

    const cleanSubsystemName = targetType === 'packages' ? 'TiepNhanGoi' : 'TienDoThucHien';
    const timestamp = new Date().toISOString().replace(/[-:T.]/g, '').slice(0, 14);
    XLSX.writeFile(wb, `Danh_sach_dong_loi_${cleanSubsystemName}_${timestamp}.xlsx`);
  };

  // -------------------------------------------------------------
  // SAMPLE TEMPLATE GENERATION (.xlsx)
  // -------------------------------------------------------------
  const handleDownloadTemplate = () => {
    const wb = XLSX.utils.book_new();

    if (targetType === 'packages') {
      const headers = [
        'Mã số thuế (*)',
        'Tên khách hàng (*)',
        'Module (*)',
        'Mã nhân sự (*)',
        'Ngày tiếp nhận (*)',
        'Mã gói',
        'Nguồn tiếp nhận',
        'Phân loại gói',
        'Hạng khách hàng',
        'Hình thức',
        'Số nền tảng Leader',
        'Điểm ghi nhận',
        'Ghi chú'
      ];

      const sampleRows = [
        [
          '0108923456',
          'Công ty Cổ phần Công nghệ ABC',
          'Sản xuất',
          'DTHANG',
          '2026-10-15',
          'GOI-2026-001',
          'Bán thêm 1 (T.Anh)',
          'Tiếp nhận mới',
          'SILVER',
          'Đào tạo',
          '2',
          '11',
          'Triển khai giai đoạn 1'
        ],
        [
          '0312456789',
          'Tập đoàn Dược phẩm Đại Nam',
          'CRM',
          'NTGIANG',
          '2026-10-16',
          'GOI-2026-002',
          'Bán mới 1 (C.Thu)',
          'Tiếp nhận mới',
          'GOLD',
          'Tư vấn',
          '',
          '9',
          'Gói tư vấn phân hệ CRM'
        ]
      ];

      const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
      ws['!cols'] = headers.map(() => ({ wch: 22 }));
      XLSX.utils.book_append_sheet(wb, ws, 'TiepNhanGoi');
      XLSX.writeFile(wb, 'Mau_NhapKhau_TiepNhanGoiDaoTao.xlsx');
    } else {
      const headers = [
        'Mã nhân sự (*)',
        'Ngày thực hiện (*)',
        'Nội dung / Nhiệm vụ (*)',
        'Loại công việc (*)',
        'Module / Phân hệ',
        'Khối lượng',
        'Số tiền (VNĐ)',
        'Điểm ghi nhận',
        'Ghi chú'
      ];

      const sampleRows = [
        [
          'DTHANG',
          '2026-10-15',
          'Triển khai trực tiếp phân hệ Sản xuất tại khách hàng',
          'TVTK_TT',
          'Sản xuất',
          '1',
          '',
          '10',
          'Khách hàng ký biên bản bàn giao'
        ],
        [
          'NTGIANG',
          '2026-10-16',
          'Đào tạo trực tuyến CRM buổi 1 cho 15 học viên',
          'TVTK_ON11',
          'CRM',
          '1',
          '',
          '4',
          'Lớp học tham gia đầy đủ'
        ]
      ];

      const ws = XLSX.utils.aoa_to_sheet([headers, ...sampleRows]);
      ws['!cols'] = headers.map(() => ({ wch: 22 }));
      XLSX.utils.book_append_sheet(wb, ws, 'TienDoThucHien');
      XLSX.writeFile(wb, 'Mau_NhapKhau_TienDoThucHien.xlsx');
    }
  };

  // -------------------------------------------------------------
  // STEP 3: Confirm & Execute Import
  // -------------------------------------------------------------
  const handleOpenConfirmModal = () => {
    if (validCount === 0) return;
    setIsConfirmModalOpen(true);
  };

  const handleExecuteImport = async () => {
    if (validCount === 0) return;

    setIsImporting(true);
    setImportProgressPercent(20);
    setImportErrorResult(null);

    try {
      const validPayload = validRows.map(r => r.parsedData);
      setImportProgressPercent(50);

      const res = await api.confirmImport({
        targetType,
        monthYear,
        validRows: validPayload,
        batchId: `BATCH_${Date.now()}`
      });

      setImportProgressPercent(100);
      setIsConfirmModalOpen(false);
      setImportSuccessResult({
        batchId: res.batchId,
        count: res.insertedCount,
        message: `Đã nhập thành công ${res.insertedCount} dòng hợp lệ vào phân hệ ${targetName}.`
      });

      // Notify parent to refresh subsystem data
      onSuccessImport(res.insertedCount, targetType);
    } catch (err: any) {
      console.error('Import error:', err);
      setImportErrorResult(err.message || 'Lỗi khi nhập dữ liệu vào hệ thống.');
      setIsConfirmModalOpen(false);
    } finally {
      setIsImporting(false);
    }
  };

  // Reset file and start over
  const handleResetImport = () => {
    setSelectedFile(null);
    setWorkbook(null);
    setAvailableSheets([]);
    setSelectedSheet('');
    setHeaderRow(1);
    setSheetRawMatrix([]);
    setFieldMapping({});
    setValidatedRows([]);
    setImportSuccessResult(null);
    setImportErrorResult(null);
    setCurrentStep(1);
  };

  return (
    <div className="bg-white rounded-xl border border-slate-200 shadow-xs overflow-hidden flex flex-col">
      {/* Top Header & Subsystem Context */}
      <div className="p-5 border-b border-slate-200 bg-linear-to-r from-slate-50 to-white flex flex-wrap items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <div className="p-2 bg-indigo-50 text-indigo-700 rounded-lg">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Nhập khẩu dữ liệu từ file Excel
              </h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Quy trình 3 bước chuẩn hóa: Tải tệp lên, ghép trường thông tin, kiểm tra và chỉ nhập dòng hợp lệ.
              </p>
            </div>
          </div>
        </div>

        {/* Subsystem & Period Selection */}
        <div className="flex flex-wrap items-center gap-3">
          {/* Target Subsystem Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
              Phân hệ nhập khẩu:
            </label>
            {allowChangeTarget ? (
              <select
                value={targetType}
                onChange={e => handleChangeTargetType(e.target.value as ImportTargetType)}
                className="text-xs font-semibold bg-white border border-slate-300 rounded-md px-2.5 py-1.5 text-slate-800 shadow-2xs focus:ring-2 focus:ring-indigo-500 cursor-pointer"
              >
                <option value="packages">Tiếp nhận gói đào tạo</option>
                <option value="progress">Tiến độ thực hiện</option>
              </select>
            ) : (
              <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-indigo-50 border border-indigo-200 text-indigo-900 rounded-md text-xs font-bold" title="Mở từ phân hệ. Để đổi đối tượng, vui lòng vào phân hệ Nhập dữ liệu.">
                <span>{targetName}</span>
                <span className="text-[10px] text-indigo-600 font-normal ml-1">(Khóa đối tượng)</span>
              </div>
            )}
          </div>

          {/* Month Year Selector */}
          <div>
            <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
              Tháng áp dụng:
            </label>
            <div className="flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 border border-slate-200 text-slate-800 rounded-md text-xs font-mono font-medium">
              <Calendar className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>{monthYear}</span>
              {isMonthLocked && (
                <span className="text-[10px] bg-amber-100 text-amber-800 border border-amber-300 px-1 rounded ml-1 font-sans">
                  Đã khóa
                </span>
              )}
            </div>
          </div>

          {/* Close button if rendered in modal */}
          {isModal && onClose && (
            <button
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors ml-2 cursor-pointer"
              title="Đóng cửa sổ"
            >
              <X className="w-5 h-5" />
            </button>
          )}
        </div>
      </div>

      {/* Stepper Progress Bar */}
      <div className="bg-slate-50 px-6 py-3 border-b border-slate-200">
        <div className="flex items-center justify-between max-w-2xl mx-auto">
          {/* Step 1 */}
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              currentStep === 1
                ? 'bg-indigo-600 text-white shadow-xs'
                : currentStep > 1
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200 text-slate-600'
            }`}>
              {currentStep > 1 ? <Check className="w-4 h-4" /> : '1'}
            </div>
            <span className={`text-xs font-semibold ${currentStep === 1 ? 'text-indigo-950 font-bold' : 'text-slate-600'}`}>
              1. Tải tệp lên
            </span>
          </div>

          <div className={`flex-1 h-0.5 mx-3 ${currentStep > 1 ? 'bg-emerald-500' : 'bg-slate-200'}`} />

          {/* Step 2 */}
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              currentStep === 2
                ? 'bg-indigo-600 text-white shadow-xs'
                : currentStep > 2
                ? 'bg-emerald-600 text-white'
                : 'bg-slate-200 text-slate-600'
            }`}>
              {currentStep > 2 ? <Check className="w-4 h-4" /> : '2'}
            </div>
            <span className={`text-xs font-semibold ${currentStep === 2 ? 'text-indigo-950 font-bold' : 'text-slate-600'}`}>
              2. Ghép trường thông tin
            </span>
          </div>

          <div className={`flex-1 h-0.5 mx-3 ${currentStep > 2 ? 'bg-emerald-500' : 'bg-slate-200'}`} />

          {/* Step 3 */}
          <div className="flex items-center gap-2">
            <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold transition-colors ${
              currentStep === 3
                ? 'bg-indigo-600 text-white shadow-xs'
                : 'bg-slate-200 text-slate-600'
            }`}>
              3
            </div>
            <span className={`text-xs font-semibold ${currentStep === 3 ? 'text-indigo-950 font-bold' : 'text-slate-600'}`}>
              3. Kiểm tra & nhập dữ liệu
            </span>
          </div>
        </div>
      </div>

      {/* Main Body per Step */}
      <div className="p-6 flex-1 overflow-y-auto">
        {/* Success Banner */}
        {importSuccessResult && (
          <div className="mb-6 p-4 bg-emerald-50 border border-emerald-200 text-emerald-900 rounded-xl text-xs space-y-2">
            <div className="flex items-center gap-2 font-bold text-sm text-emerald-800">
              <CheckCircle2 className="w-5 h-5 text-emerald-600" />
              <span>Nhập dữ liệu thành công!</span>
            </div>
            <p className="text-emerald-700">{importSuccessResult.message}</p>
            <div className="text-[11px] text-emerald-600 font-mono">
              Mã lô kiểm soát: {importSuccessResult.batchId}
            </div>
            <div className="pt-2">
              <button
                onClick={handleResetImport}
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md text-xs font-semibold cursor-pointer"
              >
                Nhập khẩu tệp khác
              </button>
            </div>
          </div>
        )}

        {/* Global Error Banner */}
        {importErrorResult && (
          <div className="mb-6 p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs flex items-center gap-3">
            <AlertCircle className="w-5 h-5 text-rose-600 shrink-0" />
            <div>
              <div className="font-bold">Lỗi khi thực hiện nhập dữ liệu:</div>
              <p className="mt-0.5">{importErrorResult}</p>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------- */}
        {/* STEP 1: TẢI TỆP LÊN                                      */}
        {/* --------------------------------------------------------- */}
        {currentStep === 1 && (
          <div className="space-y-6">
            {/* Top Bar with Template Download Button */}
            <div className="flex flex-wrap items-center justify-between gap-4 p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl">
              <div>
                <h3 className="text-xs font-bold text-indigo-950">
                  Tệp mẫu nhập khẩu cho: {targetName}
                </h3>
                <p className="text-[11px] text-indigo-700 mt-0.5">
                  Tệp mẫu có sẵn các cột chuẩn, đánh dấu (*) tại trường bắt buộc và giữ nguyên mã định danh dạng văn bản.
                </p>
              </div>
              <button
                type="button"
                onClick={handleDownloadTemplate}
                className="px-3.5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-semibold flex items-center gap-1.5 shadow-2xs transition-all cursor-pointer"
              >
                <Download className="w-4 h-4" />
                <span>Tải tệp mẫu (.xlsx)</span>
              </button>
            </div>

            {/* Drag & Drop Upload Box */}
            {!selectedFile ? (
              <div
                onDragOver={e => {
                  e.preventDefault();
                  setIsDragging(true);
                }}
                onDragLeave={() => setIsDragging(false)}
                onDrop={e => {
                  e.preventDefault();
                  setIsDragging(false);
                  if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                    handleFileSelected(e.dataTransfer.files[0]);
                  }
                }}
                onClick={() => fileInputRef.current?.click()}
                className={`border-2 border-dashed rounded-xl p-10 text-center transition-all cursor-pointer ${
                  isDragging
                    ? 'border-indigo-600 bg-indigo-50/30'
                    : 'border-slate-300 hover:border-indigo-500 bg-slate-50/50 hover:bg-indigo-50/10'
                }`}
              >
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx, .xls"
                  className="hidden"
                  onChange={e => {
                    if (e.target.files && e.target.files[0]) {
                      handleFileSelected(e.target.files[0]);
                    }
                  }}
                />
                <div className="mx-auto w-12 h-12 bg-indigo-100 text-indigo-600 rounded-full flex items-center justify-center mb-3">
                  <Upload className="w-6 h-6" />
                </div>
                <h4 className="text-sm font-bold text-slate-800">
                  Kéo thả file Excel vào đây hoặc bấm Chọn tệp
                </h4>
                <p className="text-xs text-slate-500 mt-1">
                  Hỗ trợ định dạng tệp .xlsx (dung lượng khuyến nghị dưới 10MB)
                </p>
                <button
                  type="button"
                  className="mt-4 px-4 py-2 bg-white border border-slate-300 hover:border-slate-400 text-slate-800 rounded-lg text-xs font-semibold shadow-2xs inline-flex items-center gap-1.5"
                >
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span>Chọn tệp từ máy tính</span>
                </button>
              </div>
            ) : (
              /* Uploaded File Summary & Sheet Selection */
              <div className="space-y-4">
                <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex flex-wrap items-center justify-between gap-3">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 bg-emerald-100 text-emerald-700 rounded-lg flex items-center justify-center">
                      <FileSpreadsheet className="w-6 h-6" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">{selectedFile.name}</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">
                        Kích thước: {(selectedFile.size / 1024).toFixed(1)} KB · Số sheet: {availableSheets.length}
                      </div>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => fileInputRef.current?.click()}
                    className="text-xs text-indigo-600 hover:text-indigo-800 font-semibold underline cursor-pointer"
                  >
                    Chọn file khác
                  </button>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept=".xlsx, .xls"
                    className="hidden"
                    onChange={e => {
                      if (e.target.files && e.target.files[0]) {
                        handleFileSelected(e.target.files[0]);
                      }
                    }}
                  />
                </div>

                {/* Configuration: Sheet & Header Row */}
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 bg-white border border-slate-200 rounded-xl">
                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Chọn Sheet dữ liệu:
                    </label>
                    <select
                      value={selectedSheet}
                      onChange={e => handleSheetChange(e.target.value)}
                      className="w-full border border-slate-300 rounded-lg px-3 py-2 text-xs bg-white text-slate-800 shadow-2xs focus:ring-2 focus:ring-indigo-500"
                    >
                      {availableSheets.map(s => (
                        <option key={s} value={s}>{s}</option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-bold text-slate-700 mb-1">
                      Dòng tiêu đề (Header Row):
                    </label>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min={1}
                        max={Math.max(1, sheetRawMatrix.length)}
                        value={headerRow}
                        onChange={e => handleHeaderRowChange(parseInt(e.target.value, 10) || 1)}
                        className="w-24 border border-slate-300 rounded-lg px-3 py-2 text-xs font-mono bg-white text-slate-800 shadow-2xs focus:ring-2 focus:ring-indigo-500"
                      />
                      <span className="text-[11px] text-slate-500">
                        (Dữ liệu bắt đầu từ dòng {headerRow + 1})
                      </span>
                    </div>
                  </div>
                </div>

                {/* Visual Preview Table of First Few Rows */}
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="p-3 bg-slate-50 border-b border-slate-200 flex items-center justify-between text-xs">
                    <span className="font-bold text-slate-800">
                      Xem trước sheet "{selectedSheet}" (Dòng tiêu đề: {headerRow})
                    </span>
                    <span className="text-[11px] text-slate-500">
                      Hiển thị tối đa 8 dòng đầu để kiểm tra vị trí tiêu đề
                    </span>
                  </div>

                  <div className="overflow-x-auto max-h-72">
                    <table className="w-full text-left text-xs border-collapse">
                      <thead>
                        <tr className="bg-slate-100 text-slate-600 border-b border-slate-200 font-mono">
                          <th className="py-2 px-3 w-16 text-center border-r border-slate-200">Dòng</th>
                          {sheetColumns.slice(0, 10).map(col => (
                            <th key={col.colIndex} className="py-2 px-3 border-r border-slate-200 min-w-[130px]">
                              {col.colLetter}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-200 font-sans">
                        {sheetRawMatrix.slice(0, 8).map((row, rIdx) => {
                          const excelRowNum = rIdx + 1;
                          const isHeader = excelRowNum === headerRow;
                          const isAboveHeader = excelRowNum < headerRow;
                          const isDataRow = excelRowNum > headerRow;

                          return (
                            <tr
                              key={rIdx}
                              className={`transition-colors ${
                                isHeader
                                  ? 'bg-indigo-50/80 font-bold text-indigo-950 border-y-2 border-indigo-400'
                                  : isAboveHeader
                                  ? 'bg-slate-50/50 text-slate-400 italic'
                                  : 'hover:bg-slate-50 text-slate-800'
                              }`}
                            >
                              <td className="py-2 px-3 text-center font-mono border-r border-slate-200 text-[11px]">
                                <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-bold ${
                                  isHeader
                                    ? 'bg-indigo-600 text-white'
                                    : isAboveHeader
                                    ? 'bg-slate-200 text-slate-500'
                                    : 'bg-emerald-100 text-emerald-800'
                                }`}>
                                  {excelRowNum}
                                </span>
                              </td>
                              {sheetColumns.slice(0, 10).map(col => (
                                <td
                                  key={col.colIndex}
                                  className="py-2 px-3 border-r border-slate-200 truncate max-w-[200px]"
                                  title={row[col.colIndex] || ''}
                                >
                                  {row[col.colIndex] || (
                                    <span className="text-slate-300">trống</span>
                                  )}
                                </td>
                              ))}
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>

                  <div className="p-2.5 bg-slate-50 border-t border-slate-200 text-[11px] text-slate-500 flex items-center gap-4">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-slate-300 inline-block" /> Phía trên tiêu đề (Bỏ qua)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-indigo-500 inline-block" /> Dòng tiêu đề ({headerRow})
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block" /> Dòng dữ liệu (Bắt đầu từ {headerRow + 1})
                    </span>
                  </div>
                </div>
              </div>
            )}

            {fileError && (
              <div className="p-4 bg-rose-50 border border-rose-200 text-rose-900 rounded-xl text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                <span>{fileError}</span>
              </div>
            )}

            {/* Bottom Actions for Step 1 */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              {isModal && onClose ? (
                <button
                  type="button"
                  onClick={onClose}
                  className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold cursor-pointer"
                >
                  Hủy bỏ
                </button>
              ) : (
                <div />
              )}

              <button
                type="button"
                disabled={!selectedFile || sheetColumns.length === 0}
                onClick={() => setCurrentStep(2)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
              >
                <span>Tiếp tục: Ghép trường thông tin</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------- */}
        {/* STEP 2: GHÉP TRƯỜNG THÔNG TIN                             */}
        {/* --------------------------------------------------------- */}
        {currentStep === 2 && (
          <div className="space-y-6">
            <div className="p-4 bg-indigo-50/50 border border-indigo-100 rounded-xl flex items-start gap-3">
              <Info className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
              <div className="text-xs text-indigo-950 space-y-1">
                <div className="font-bold">Hướng dẫn ghép trường cho phân hệ: {targetName}</div>
                <p className="text-indigo-800 text-[11px]">
                  Hệ thống đã tự động ghép các cột có tên tương ứng. Vui lòng kiểm tra lại và đảm bảo tất cả các trường bắt buộc <strong>(*)</strong> đều đã được ghép cột Excel tương ứng trước khi tiếp tục.
                </p>
                <p className="text-indigo-800 text-[11px]">
                  * Các mã định danh như Mã số thuế, Mã nhân sự sẽ được bảo toàn nguyên vẹn chuỗi văn bản (không làm mất số 0 ở đầu).
                </p>
              </div>
            </div>

            {/* Validation Notice if required fields missing */}
            {missingRequiredFields.length > 0 && (
              <div className="p-3 bg-amber-50 border border-amber-200 text-amber-900 rounded-xl text-xs flex items-center gap-2">
                <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                <span>
                  Còn <strong>{missingRequiredFields.length}</strong> trường bắt buộc chưa được ghép:{' '}
                  {missingRequiredFields.map(f => f.label).join(', ')}.
                </span>
              </div>
            )}

            {/* Field Mapping Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-slate-100 text-slate-700 font-bold border-b border-slate-200">
                    <th className="py-3 px-4 w-1/3">Trường của hệ thống</th>
                    <th className="py-3 px-4 w-1/3">Cột trong Excel</th>
                    <th className="py-3 px-4 w-1/4">Dữ liệu mẫu</th>
                    <th className="py-3 px-4 w-28 text-center">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {currentFields.map(field => {
                    const currentMappedCol = fieldMapping[field.key] ?? -1;
                    const isMapped = currentMappedCol >= 0;
                    const sampleValues = isMapped ? getColumnSampleValues(currentMappedCol) : [];

                    return (
                      <tr key={field.key} className="hover:bg-slate-50 transition-colors">
                        {/* System Field */}
                        <td className="py-3 px-4 align-top">
                          <div className="font-bold text-slate-900 flex items-center gap-1.5">
                            <span>{field.label}</span>
                            {field.required && (
                              <span className="text-rose-600 font-bold" title="Trường bắt buộc">(*)</span>
                            )}
                          </div>
                          <div className="text-[11px] text-slate-500 mt-0.5 leading-snug">
                            {field.description}
                          </div>
                        </td>

                        {/* Excel Column Selector */}
                        <td className="py-3 px-4 align-top">
                          <select
                            value={currentMappedCol}
                            onChange={e => {
                              const newCol = parseInt(e.target.value, 10);
                              setFieldMapping(prev => ({
                                ...prev,
                                [field.key]: newCol
                              }));
                            }}
                            className={`w-full border rounded-lg px-2.5 py-1.5 text-xs bg-white shadow-2xs focus:ring-2 focus:ring-indigo-500 ${
                              field.required && !isMapped
                                ? 'border-rose-300 text-rose-900 bg-rose-50/20'
                                : 'border-slate-300 text-slate-800'
                            }`}
                          >
                            <option value={-1}>[-- Không ghép --]</option>
                            {sheetColumns.map(col => {
                              // If this column is already mapped to another field, show indication
                              const mappedToOther = Object.entries(fieldMapping).find(
                                ([k, c]) => c === col.colIndex && k !== field.key
                              );
                              return (
                                <option key={col.colIndex} value={col.colIndex}>
                                  {col.fullLabel} {mappedToOther ? '(Đã ghép trường khác)' : ''}
                                </option>
                              );
                            })}
                          </select>
                        </td>

                        {/* Sample Data Preview */}
                        <td className="py-3 px-4 align-top font-mono text-[11px] text-slate-600">
                          {isMapped ? (
                            sampleValues.length > 0 ? (
                              <div className="space-y-0.5">
                                {sampleValues.map((s, idx) => (
                                  <div key={idx} className="truncate max-w-[200px]" title={s}>
                                    • {s}
                                  </div>
                                ))}
                              </div>
                            ) : (
                              <span className="text-slate-400 italic">(Cột trống)</span>
                            )
                          ) : (
                            <span className="text-slate-400 italic">Ví dụ: {field.example}</span>
                          )}
                        </td>

                        {/* Status Badge */}
                        <td className="py-3 px-4 align-top text-center">
                          {isMapped ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                              <Check className="w-3 h-3 text-emerald-600" />
                              <span>Đã ghép</span>
                            </span>
                          ) : field.required ? (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                              <AlertCircle className="w-3 h-3 text-rose-600" />
                              <span>Bắt buộc</span>
                            </span>
                          ) : (
                            <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full text-[10px] font-semibold bg-slate-100 text-slate-600">
                              Bỏ qua
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Bottom Actions for Step 2 */}
            <div className="flex items-center justify-between pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCurrentStep(1)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại: Tải tệp</span>
              </button>

              <button
                type="button"
                disabled={!canProceedToStep3}
                onClick={() => setCurrentStep(3)}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-2xs transition-all cursor-pointer"
              >
                <span>Tiếp tục: Kiểm tra dữ liệu</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        )}

        {/* --------------------------------------------------------- */}
        {/* STEP 3: KIỂM TRA & NHẬP DỮ LIỆU                           */}
        {/* --------------------------------------------------------- */}
        {currentStep === 3 && (
          <div className="space-y-6">
            {/* Top Summary Dashboard */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
              {/* Total Records */}
              <div className="bg-slate-50 p-4 rounded-xl border border-slate-200 shadow-2xs">
                <div className="text-xs text-slate-500 font-medium">Tổng số dòng dữ liệu</div>
                <div className="text-2xl font-bold text-slate-900 font-mono mt-1">
                  {totalRowsCount}
                </div>
                <div className="text-[11px] text-slate-400 mt-0.5">
                  (Đã loại bỏ các dòng hoàn toàn trống)
                </div>
              </div>

              {/* Valid Records */}
              <div className="bg-emerald-50/70 p-4 rounded-xl border border-emerald-200 shadow-2xs">
                <div className="text-xs text-emerald-800 font-medium flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600" />
                  <span>Dòng hợp lệ</span>
                </div>
                <div className="text-2xl font-bold text-emerald-900 font-mono mt-1">
                  {validCount}
                </div>
                <div className="text-[11px] text-emerald-700 mt-0.5 font-medium">
                  {totalRowsCount > 0 ? `${((validCount / totalRowsCount) * 100).toFixed(0)}% sẵn sàng nhập khẩu` : '0%'}
                </div>
              </div>

              {/* Error Records */}
              <div className="bg-rose-50/70 p-4 rounded-xl border border-rose-200 shadow-2xs">
                <div className="text-xs text-rose-800 font-medium flex items-center gap-1.5">
                  <AlertTriangle className="w-4 h-4 text-rose-600" />
                  <span>Dòng có lỗi</span>
                </div>
                <div className="text-2xl font-bold text-rose-900 font-mono mt-1">
                  {errorCount}
                </div>
                <div className="text-[11px] text-rose-700 mt-0.5 font-medium">
                  {errorCount > 0 ? 'Cần tải file lỗi về sửa' : 'Không có dòng lỗi'}
                </div>
              </div>
            </div>

            {/* Filter and Export Error File Toolbar */}
            <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white border border-slate-200 rounded-xl">
              {/* Filter Tabs */}
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setValidationFilter('ALL')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    validationFilter === 'ALL'
                      ? 'bg-[#EEF2FF] text-[#4F46E5] border border-indigo-200 shadow-xs'
                      : 'text-slate-600 hover:bg-[#F1F5F9]'
                  }`}
                >
                  Tất cả ({totalRowsCount})
                </button>
                <button
                  type="button"
                  onClick={() => setValidationFilter('VALID')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    validationFilter === 'VALID'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-emerald-700 hover:bg-emerald-50'
                  }`}
                >
                  Hợp lệ ({validCount})
                </button>
                <button
                  type="button"
                  onClick={() => setValidationFilter('ERROR')}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    validationFilter === 'ERROR'
                      ? 'bg-rose-600 text-white shadow-2xs'
                      : 'text-rose-700 hover:bg-rose-50'
                  }`}
                >
                  Có lỗi ({errorCount})
                </button>
              </div>

              {/* Action Button: Export Error Rows */}
              {errorCount > 0 && (
                <button
                  type="button"
                  onClick={handleExportErrorFile}
                  className="px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer"
                  title="Xuất file Excel chứa các dòng lỗi kèm chẩn đoán để sửa và nhập lại"
                >
                  <Download className="w-4 h-4 text-rose-600" />
                  <span>Tải file các dòng lỗi ({errorCount} dòng)</span>
                </button>
              )}
            </div>

            {/* Results Inspection Table */}
            <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="sticky top-0 bg-slate-100 text-slate-700 font-bold border-b border-slate-200 z-10">
                    <tr>
                      <th className="py-2.5 px-3 w-28">Vị trí Excel</th>
                      <th className="py-2.5 px-3 w-28 text-center">Trạng thái</th>
                      <th className="py-2.5 px-3 w-1/3">Dữ liệu kiểm tra</th>
                      <th className="py-2.5 px-3 w-1/2">Chi tiết lỗi & Hướng khắc phục</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {displayRows.length === 0 ? (
                      <tr>
                        <td colSpan={4} className="py-8 text-center text-slate-400">
                          Không có dòng nào phù hợp bộ lọc.
                        </td>
                      </tr>
                    ) : (
                      displayRows.map(row => {
                        const hasErrors = row.errors.length > 0;
                        return (
                          <tr
                            key={row.excelRow}
                            className={`hover:bg-slate-50 transition-colors ${
                              hasErrors ? 'bg-rose-50/20' : ''
                            }`}
                          >
                            {/* Position in Excel */}
                            <td className="py-2.5 px-3 align-top font-mono text-[11px]">
                              <div className="font-bold text-slate-900">
                                Dòng {row.excelRow}
                              </div>
                              <div className="text-[10px] text-slate-500">
                                Sheet: {row.sheetName}
                              </div>
                              {row.originalExcelRow && (
                                <div className="text-[10px] text-indigo-700 font-semibold mt-0.5">
                                  (Gốc: Dòng {row.originalExcelRow})
                                </div>
                              )}
                            </td>

                            {/* Status */}
                            <td className="py-2.5 px-3 align-top text-center">
                              {row.status === 'VALID' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-100 text-emerald-800">
                                  <Check className="w-3 h-3 text-emerald-600" />
                                  <span>Hợp lệ</span>
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-rose-100 text-rose-800">
                                  <AlertCircle className="w-3 h-3 text-rose-600" />
                                  <span>Có {row.errors.length} lỗi</span>
                                </span>
                              )}
                            </td>

                            {/* Data Summary */}
                            <td className="py-2.5 px-3 align-top text-[11px] text-slate-700">
                              {targetType === 'packages' ? (
                                <div className="space-y-0.5">
                                  <div>
                                    <strong className="text-slate-900">MST:</strong> {row.parsedData.taxCode || '-'} · <strong className="text-slate-900">KH:</strong> {row.parsedData.customerName || '-'}
                                  </div>
                                  <div>
                                    <strong className="text-slate-900">Module:</strong> {row.parsedData.moduleName || row.parsedData.moduleCode || '-'} · <strong className="text-slate-900">Nhân sự:</strong> {row.parsedData.onbCode || '-'}
                                  </div>
                                  <div className="text-slate-500 text-[10px]">
                                    Ngày: {row.parsedData.receptionDate || '-'} · Điểm: {row.parsedData.recordedScore ?? '-'}đ
                                    {row.parsedData.leaderPlatforms ? ` · Leader: ${row.parsedData.leaderPlatforms} nền tảng` : ''}
                                  </div>
                                </div>
                              ) : (
                                <div className="space-y-0.5">
                                  <div>
                                    <strong className="text-slate-900">Việc:</strong> {row.parsedData.taskName || '-'}
                                  </div>
                                  <div>
                                    <strong className="text-slate-900">Nhân sự:</strong> {row.parsedData.primaryOnbCode || row.parsedData.onbCode || '-'} · <strong className="text-slate-900">Loại:</strong> {row.parsedData.workTypeName || row.parsedData.workTypeCode || '-'}
                                  </div>
                                  <div className="text-slate-500 text-[10px]">
                                    Ngày: {row.parsedData.date || '-'} · Điểm: {row.parsedData.recordedScore ?? '-'}đ · Module: {row.parsedData.productCode || '-'}
                                  </div>
                                </div>
                              )}
                            </td>

                            {/* Error Details */}
                            <td className="py-2.5 px-3 align-top">
                              {hasErrors ? (
                                <div className="space-y-2">
                                  {row.errors.map((err, errIdx) => (
                                    <div
                                      key={errIdx}
                                      className="p-2 bg-rose-50 border border-rose-200 rounded-lg text-[11px] text-rose-900 space-y-0.5"
                                    >
                                      <div className="font-bold flex items-center justify-between">
                                        <span>• {err.fieldLabel} (Giá trị: "{String(err.value ?? '')}")</span>
                                      </div>
                                      <div className="text-rose-800">
                                        <strong>Nguyên nhân:</strong> {err.message}
                                      </div>
                                      <div className="text-emerald-800 font-medium">
                                        <strong>Khắc phục:</strong> {err.suggestion}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              ) : (
                                <span className="text-emerald-700 text-[11px] flex items-center gap-1 font-medium">
                                  <Check className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Dữ liệu hợp lệ, đủ điều kiện nhập khẩu.</span>
                                </span>
                              )}
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Bottom Actions for Step 3 */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-4 border-t border-slate-200">
              <button
                type="button"
                onClick={() => setCurrentStep(2)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer"
              >
                <ArrowLeft className="w-4 h-4" />
                <span>Quay lại: Ghép trường</span>
              </button>

              <div className="flex items-center gap-3">
                {validCount === 0 ? (
                  <div className="text-xs text-rose-700 font-medium flex items-center gap-1.5">
                    <AlertCircle className="w-4 h-4 text-rose-600" />
                    <span>Không có dòng hợp lệ nào để nhập. Vui lòng tải file lỗi để sửa.</span>
                  </div>
                ) : errorCount === 0 ? (
                  <button
                    type="button"
                    onClick={handleOpenConfirmModal}
                    className="px-6 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    <CheckCircle2 className="w-4 h-4" />
                    <span>Nhập dữ liệu ({validCount} bản ghi)</span>
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={handleOpenConfirmModal}
                    className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-lg text-xs font-bold flex items-center gap-2 shadow-sm transition-all cursor-pointer"
                  >
                    <Check className="w-4 h-4" />
                    <span>Chỉ nhập các dòng hợp lệ ({validCount} bản ghi)</span>
                  </button>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* --------------------------------------------------------- */}
      {/* CONFIRMATION POPUP MODAL                                  */}
      {/* --------------------------------------------------------- */}
      {isConfirmModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-xs">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in fade-in zoom-in-95 duration-150">
            <div className="w-12 h-12 bg-indigo-100 text-indigo-700 rounded-full flex items-center justify-center mx-auto">
              <Upload className="w-6 h-6" />
            </div>

            <div className="text-center space-y-1.5">
              <h3 className="text-base font-bold text-slate-900">
                Xác nhận nhập khẩu dữ liệu
              </h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                {errorCount > 0 ? (
                  <>
                    Nhập <strong>{validCount}</strong> dòng hợp lệ vào phân hệ{' '}
                    <strong>[{targetName}]</strong> và bỏ qua <strong>{errorCount}</strong> dòng lỗi?
                  </>
                ) : (
                  <>
                    Nhập toàn bộ <strong>{validCount}</strong> dòng dữ liệu hợp lệ vào phân hệ{' '}
                    <strong>[{targetName}]</strong>?
                  </>
                )}
              </p>
              <p className="text-[11px] text-rose-600 font-semibold pt-1">
                * Tuyệt đối không nhập dòng lỗi vào hệ thống.
              </p>
            </div>

            {isImporting && (
              <div className="space-y-1.5 pt-2">
                <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                  <div
                    className="bg-indigo-600 h-2 transition-all duration-300"
                    style={{ width: `${importProgressPercent}%` }}
                  />
                </div>
                <div className="text-center text-[11px] text-slate-500 font-mono">
                  Đang ghi dữ liệu vào hệ thống... ({importProgressPercent}%)
                </div>
              </div>
            )}

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-100">
              <button
                type="button"
                disabled={isImporting}
                onClick={() => setIsConfirmModalOpen(false)}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg text-xs font-semibold cursor-pointer"
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                disabled={isImporting}
                onClick={handleExecuteImport}
                className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-300 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-xs cursor-pointer"
              >
                {isImporting ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Đang nạp...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>Xác nhận nhập khẩu</span>
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

// -------------------------------------------------------------
// HELPER UTILITIES
// -------------------------------------------------------------

// Helper to normalize various date formats to YYYY-MM-DD
function normalizeDateToIso(rawDate: string): string {
  if (!rawDate) return '';
  const trimmed = rawDate.trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const parts = trimmed.split('-');
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10);
    const d = parseInt(parts[2], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return trimmed;
    }
  }

  // DD/MM/YYYY or DD-MM-YYYY
  const slashMatch = trimmed.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slashMatch) {
    const d = parseInt(slashMatch[1], 10);
    const m = parseInt(slashMatch[2], 10);
    const y = parseInt(slashMatch[3], 10);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  // Excel serial date number (e.g. 46310)
  const num = Number(trimmed);
  if (!isNaN(num) && num > 30000 && num < 60000) {
    const dateObj = new Date(Math.round((num - 25569) * 86400 * 1000));
    if (!isNaN(dateObj.getTime())) {
      return dateObj.toISOString().slice(0, 10);
    }
  }

  return '';
}

// Find leader claim in existing database packages
function findExistingLeaderClaimInDb(
  packages: CustomerPackage[],
  members: ONBMember[],
  taxCode: string
) {
  const cleanTax = cleanTaxCode(taxCode);
  if (!cleanTax) return null;

  for (const pkg of packages) {
    if (cleanTaxCode(pkg.taxCode) !== cleanTax) continue;
    if (!pkg.details) continue;

    for (const d of pkg.details) {
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
}
