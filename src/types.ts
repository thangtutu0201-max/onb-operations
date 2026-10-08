export type UserRole = 'admin' | 'user';
export type UserAccessRole = 'admin' | 'user';

export type GroupId = string;

export interface ONBGroup {
  id: string; // e.g. "grp_1", "grp_2", "grp_3"
  code: string; // e.g. "NHOM_1", "NHOM_2", "NHOM_3"
  name: string; // e.g. "Nhóm 1", "Nhóm 2", "Nhóm 3"
  order: number;
  isActive: boolean;
  description?: string;
}

export interface GroupHistory {
  groupId?: string;
  group: string;
  fromDate: string;
  note?: string;
}

export interface ONBMember {
  id: string; // e.g. "ONB_DTHANG"
  code: string; // Unique code e.g. "DTHANG"
  fullName: string; // "Từ Đức Thắng"
  displayName: string; // "Từ Đức Thắng"
  shortCode: string; // "DTHANG"
  email: string; // "Thangtutu0201@gmail.com"
  groupId?: string;
  currentGroup: string;
  groupHistory: GroupHistory[];
  startDate: string;
  inactiveDate?: string;
  isActive: boolean;
  participateRandom: boolean;
  completedProducts: string[]; // e.g. ['CRM', 'HRM', 'Kế toán']
  phone?: string;
}

export type MonthOperationalStatus = 'OPEN' | 'LOCKED' | 'REOPENED';

export interface AppConfig {
  adminEmail: string;
  adminOnbCode: string;
  bonusManagers: string[]; // Up to 2 designated ONB codes besides admin
  allocationManagers: string[]; // Up to 2 designated ONB codes besides admin
  timezone: string; // "Asia/Ho_Chi_Minh"
  systemLockedMonths: string[]; // Explicitly locked or auto-locked if < currentMonth
  reopenedMonths?: string[]; // Danh sách các tháng cũ được Admin mở lại để điều chỉnh dữ liệu
  initialDataImportLocked: boolean;
}

export interface HistoryMonthItem {
  monthYear: string;
  isCurrent: boolean;
  status: MonthOperationalStatus;
  statusLabel: 'Đang mở' | 'Đã khóa' | 'Mở lại để điều chỉnh';
  isLocked: boolean;
  isReopened: boolean;
  scheduleCount: number;
  progressCount: number;
  packageCount: number;
  bonusCount: number;
}

export interface ProductCatalog {
  id: string;
  code: string;
  name: string;
  category: 'ERP' | 'HRM' | 'CRM' | 'Module' | 'Other';
  description?: string;
  isActive: boolean;
}

export type CalculationMethod = 'QUANTITY_MULTIPLY' | 'AMOUNT_DIVIDE';

export type WorkTypeUnit = 'Ngày' | 'Buổi' | 'Giờ' | 'Gói' | 'Số lượng' | 'VNĐ';

export type CustomFieldType = 'text' | 'number' | 'date' | 'select' | 'checkbox';

export interface CustomFieldDefinition {
  id: string;
  key: string; // Unique key e.g. "hop_dong", "so_tien_hop_dong"
  label: string; // Display label e.g. "Số hợp đồng"
  type: CustomFieldType;
  required: boolean;
  defaultValue?: string | number | boolean;
  order: number;
  isActive: boolean;
  options?: string[]; // Dropdown options if select
  description?: string;
}

export interface WorkTypeCatalog {
  id: string;
  code: string; // TVTK_TT, TVTK_Tỉnh, TVTK_ON11, ĐTTT, ON11, HT, POC, Trực tiếp, TIEN_VE
  name: string;
  description?: string;
  isTraining: boolean;
  isActive: boolean;
  unit?: WorkTypeUnit | string; // 'Ngày' | 'Buổi' | 'Giờ' | 'Gói' | 'Số lượng' | 'VNĐ'
  unitType?: 'session' | 'number' | 'currency' | 'hours' | 'day';
  calculationMethod?: CalculationMethod; // 'QUANTITY_MULTIPLY' | 'AMOUNT_DIVIDE'
  requiresProduct?: boolean; // Bắt buộc chọn module hay không
  kpiCategory?: string; // Nhóm điểm báo cáo: 'TVTK_TRUC_TIEP' | 'TVTK_TINH' | 'ON11' | 'DAO_TAO' | 'DEMO/POC/Tiền về' | 'KHAC'
  defaultScorePerUnit?: number;
  conversionRate?: number; // Số tiền quy đổi (VNĐ) tương ứng 1 điểm KPI
  order?: number;
  customFields?: CustomFieldDefinition[];
}

export interface ReferenceScore {
  id: string;
  workTypeCode: string;
  productCode?: string;
  suggestedScore: number;
  conversionRate?: number; // Mức VNĐ quy đổi cho 1 điểm (ví dụ: 5.000.000 VNĐ / điểm)
  effectiveFrom: string;
  effectiveTo?: string;
  description?: string;
  isActive?: boolean;
}

export type SessionOfDay = 'Sáng' | 'Chiều';

export interface ScheduleWorkForm {
  id: string; // e.g. "wf_tvtk_tt", "wf_tvtk_tinh", "wf_tvtk_on11", "wf_dttt", "wf_poc", "wf_leave"
  code: string; // e.g. "TVTK_TT"
  name: string; // e.g. "TVTK Trực tiếp / Khách hàng"
  shortLabel?: string; // e.g. "TVTK_TT"
  order: number;
  category: 'work' | 'leave'; // 'work' = Công việc, 'leave' = Nghỉ phép, nghỉ bù
  isActive: boolean;
  description?: string;
}

export const DEFAULT_SCHEDULE_WORK_FORMS: ScheduleWorkForm[] = [
  {
    id: 'wf_tvtk_tt',
    code: 'TVTK_TT',
    name: 'TVTK Trực tiếp / Khách hàng',
    shortLabel: 'TVTK_TT',
    order: 1,
    category: 'work',
    isActive: true,
    description: 'Tư vấn triển khai trực tiếp tại khách hàng'
  },
  {
    id: 'wf_tvtk_tinh',
    code: 'TVTK_TINH',
    name: 'TVTK Tỉnh (Công tác)',
    shortLabel: 'TVTK_Tỉnh',
    order: 2,
    category: 'work',
    isActive: true,
    description: 'Tư vấn triển khai công tác tỉnh'
  },
  {
    id: 'wf_tvtk_on11',
    code: 'TVTK_ON11',
    name: 'TVTK Online 1-1 / ON11',
    shortLabel: 'TVTK_ON11',
    order: 3,
    category: 'work',
    isActive: true,
    description: 'Tư vấn triển khai Online 1-1'
  },
  {
    id: 'wf_dttt',
    code: 'DTTT',
    name: 'Đào tạo tập trung (ĐTTT)',
    shortLabel: 'ĐTTT',
    order: 4,
    category: 'work',
    isActive: true,
    description: 'Đào tạo tập trung theo lớp'
  },
  {
    id: 'wf_poc',
    code: 'POC',
    name: 'POC / Demo',
    shortLabel: 'POC',
    order: 5,
    category: 'work',
    isActive: true,
    description: 'Xây dựng dữ liệu mẫu POC / Demo'
  },
  {
    id: 'wf_leave',
    code: 'NGHI_PHEP',
    name: 'Nghỉ phép / Nghỉ bù',
    shortLabel: 'Nghỉ phép',
    order: 6,
    category: 'leave',
    isActive: true,
    description: 'Nghỉ phép năm hoặc nghỉ bù'
  }
];

export interface ScheduleTransferLog {
  id: string;
  fromOnbCode: string;
  fromMemberName: string;
  toOnbCode: string;
  toMemberName: string;
  performedByOnbCode: string;
  performedByName: string;
  transferredAt: string; // ISO timestamp
  reason?: string;
}

export interface WorkSchedule {
  id: string;
  onbCode: string;
  collaborators: string[]; // other ONB codes
  date: string; // YYYY-MM-DD
  sessionOfDay?: SessionOfDay; // 'Sáng' | 'Chiều'
  workFormId?: string; // Stable ID link to ScheduleWorkForm in Core
  workTypeCode: string; // Saved name/code
  workFormName?: string; // Snapshot of name at time of recording to preserve locked history
  workFormCategory?: 'work' | 'leave'; // Snapshot of category ('work' vs 'leave')
  startTime?: string;
  endTime?: string;
  productCode?: string;
  customerOrTask: string;
  notes?: string;
  locationOrLink?: string;
  status: 'Kế hoạch' | 'Đang thực hiện' | 'Hoàn thành' | 'Đã hủy' | 'Hủy';
  trackCompensatoryLeave?: boolean; // Đi khách hàng cuối tuần, theo dõi nghỉ bù
  isCompleted?: boolean; // Đã thực hiện (phân biệt với dự kiến)
  fullDay?: boolean; // Lịch cả ngày
  relatedProgressId?: string;
  sourceTrainingPackageId?: string; // Truy vết mã lớp đào tạo tập trung nguồn
  isTransferred?: boolean; // Lịch đã được chuyển giao cho nhân sự khác
  transferHistory?: ScheduleTransferLog[]; // Nhật ký chuyển lịch giữa các nhân sự
  monthYear: string; // "2026-07"
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface PointSplit {
  onbCode: string;
  points: number;
  note?: string;
}

export interface ProgressTask {
  id: string;
  code: string;
  taskName: string;
  customerId?: string;
  packageId?: string;
  primaryOnbCode: string;
  workTypeCode: string;
  productCode?: string;
  quantity?: number; // Khối lượng
  amount?: number; // Số tiền (nếu áp dụng, vd Tiền về)
  unit?: string; // Đơn vị tính: Buổi, Ngày, Giờ, Gói, VNĐ...
  conversionRate?: number; // Mức quy đổi tại thời điểm ghi nhận (vd 5.000.000 VNĐ / điểm)
  calculationMethod?: CalculationMethod;
  customFieldValues?: Record<string, any>; // Giá trị các trường bổ sung theo cấu hình loại việc
  date: string; // YYYY-MM-DD
  monthYear: string; // YYYY-MM
  status: 'Chưa bắt đầu' | 'Đang xử lý' | 'Hoàn thành' | 'Tạm dừng';
  suggestedScore: number; // Tra cứu từ Core
  recordedScore: number; // Thực tế ghi nhận
  splits: PointSplit[]; // Chia điểm cho nhiều người
  notes?: string;
  scheduleId?: string;
  createdBy?: string;
  createdAt: string;
  updatedAt: string;
  updatedBy: string;
}

export interface HandoverHistory {
  onbCode: string;
  fromDate: string;
  toDate?: string;
  note?: string;
}

export interface Customer {
  id: string;
  code: string;
  name: string;
  taxCode: string; // Text to keep leading zeros!
  contactPerson?: string;
  phone?: string;
  address?: string;
  createdAt: string;
}

export interface PackageDetailRow {
  id: string; // e.g. "dtl_..."
  packageId: string;
  moduleCode: string; // e.g. "MOD_SAN_XUAT", "MOD_CRM", etc.
  moduleName: string; // Snapshot of module name at recording time (preserves history)
  onbCode: string; // Performer code (e.g. "DTHANG", "NTGIANG")
  groupName: string; // Snapshot of group at receptionDate (preserves history)
  leaderPlatforms?: number; // 2, 3, 4, 5+ platforms or undefined/0
  leaderScore?: number; // Leader bonus score from Core
  suggestedScore: number; // Auto suggested score from Core
  recordedScore: number; // Final recorded score
  isManualScore: boolean; // Whether user manually adjusted points
  scoreFormula?: string; // Short explanation text of the formula applied
  notes?: string;
  updatedBy?: string;
  updatedAt?: string;
}

export interface CustomerPackage {
  id: string; // Unique package ID
  packageCode: string; // e.g. "GOI-2026-001"
  taxCode?: string; // Text to keep leading zeros and hyphens
  customerName?: string; // Customer name
  customerId?: string; // Optional reference to Customer catalog
  receptionDate: string; // YYYY-MM-DD
  monthYear: string; // YYYY-MM
  sourceCode?: string; // Stable code from Core, e.g. "SRC_BAN_THEM_1"
  sourceName?: string; // Display name joined from Core
  packageClass?: 'Tiếp nhận mới' | 'Tiếp nhận lại' | string;
  customerTier?: 'BASIC' | 'BRONZE' | 'SILVER' | 'GOLD' | string;
  workForm?: 'POC' | 'Demo' | 'Đào tạo' | 'Tư vấn' | string;
  notes?: string;
  details?: PackageDetailRow[];

  // Legacy fields preserved for backward compatibility
  packageName?: string;
  packageType?: 'Mới tiếp nhận' | 'Đang phụ trách' | 'Tồn kỳ trước' | 'Dự án' | 'Bảo trì';
  assignedOnbCode?: string;
  handoverHistory?: HandoverHistory[];
  status?: 'Tiếp nhận' | 'Đang triển khai' | 'Nghiệm thu' | 'Tạm dừng';
  suggestedScore?: number;
  recordedScore?: number;
  splits?: PointSplit[];
  createdAt: string;
  createdBy?: string;
  updatedAt: string;
  updatedBy: string;
}

// Core Configurations for Packages Module
export interface PackageSource {
  id: string;
  code: string;
  name: string;
  isNonScoring: boolean; // Nguồn không tính điểm tiếp nhận
  isActive: boolean;
  order: number;
}

export interface PackageClassification {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  order: number;
}

export interface CustomerTier {
  id: string;
  code: string;
  name: string;
  score: number;
  effectiveFrom?: string;
  effectiveTo?: string;
  isActive: boolean;
  order: number;
}

export interface PackageWorkType {
  id: string;
  code: string;
  name: string;
  baseScore?: number;
  useCustomerTier: boolean;
  allowLeader: boolean;
  isActive: boolean;
  order: number;
}

export interface LeaderPlatformConfig {
  id: string;
  platforms: number; // 2, 3, 4, 5 (for >= 5)
  score: number;
  isActive: boolean;
  order: number;
}

export interface PackageModuleCatalog {
  id: string;
  code: string;
  name: string;
  isActive: boolean;
  order: number;
}

export interface PackageCoreConfig {
  sources: PackageSource[];
  classifications: PackageClassification[];
  customerTiers: CustomerTier[];
  workTypes: PackageWorkType[];
  leaderPlatforms: LeaderPlatformConfig[];
  modules: PackageModuleCatalog[];
}

export const DEFAULT_PACKAGE_CORE_CONFIG: PackageCoreConfig = {
  sources: [
    { id: 'src_1', code: 'SRC_BAN_THEM_1', name: 'Bán thêm 1 (T.Anh)', isNonScoring: false, isActive: true, order: 1 },
    { id: 'src_2', code: 'SRC_BAN_THEM_2', name: 'Bán thêm 2 (Tr.Đức)', isNonScoring: false, isActive: true, order: 2 },
    { id: 'src_3', code: 'SRC_BAN_THEM_3', name: 'Bán thêm 3 (P.Linh)', isNonScoring: false, isActive: true, order: 3 },
    { id: 'src_4', code: 'SRC_BAN_THEM_4', name: 'Bán thêm 4 (Đ.Đùng)', isNonScoring: false, isActive: true, order: 4 },
    { id: 'src_5', code: 'SRC_BAN_THEM_5', name: 'Bán thêm 5 (V.Minh)', isNonScoring: false, isActive: true, order: 5 },
    { id: 'src_6', code: 'SRC_BAN_THEM_6', name: 'Bán thêm 6 (M.Đức)', isNonScoring: false, isActive: true, order: 6 },
    { id: 'src_7', code: 'SRC_BAN_MOI_1', name: 'Bán mới 1 (C.Thu)', isNonScoring: false, isActive: true, order: 7 },
    { id: 'src_8', code: 'SRC_BAN_MOI_2', name: 'Bán mới 2 (N.Vy)', isNonScoring: false, isActive: true, order: 8 },
    { id: 'src_9', code: 'SRC_BAN_MOI_3', name: 'Bán mới 3 (C.Cường)', isNonScoring: false, isActive: true, order: 9 },
    { id: 'src_10', code: 'SRC_BAN_MOI_4', name: 'Bán mới 4 (Q.Đại)', isNonScoring: false, isActive: true, order: 10 },
    { id: 'src_11', code: 'SRC_BAN_MOI_5', name: 'Bán mới 5 (T.Bình)', isNonScoring: false, isActive: true, order: 11 },
    { id: 'src_12', code: 'SRC_KHAC', name: 'Khác', isNonScoring: true, isActive: true, order: 12 }
  ],
  classifications: [
    { id: 'cls_1', code: 'TIEP_NHAN_MOI', name: 'Tiếp nhận mới', isActive: true, order: 1 },
    { id: 'cls_2', code: 'TIEP_NHAN_LAI', name: 'Tiếp nhận lại', isActive: true, order: 2 }
  ],
  customerTiers: [
    { id: 'tier_basic', code: 'BASIC', name: 'BASIC', score: 2, isActive: true, order: 1 },
    { id: 'tier_bronze', code: 'BRONZE', name: 'BRONZE', score: 4, isActive: true, order: 2 },
    { id: 'tier_silver', code: 'SILVER', name: 'SILVER', score: 7, isActive: true, order: 3 },
    { id: 'tier_gold', code: 'GOLD', name: 'GOLD', score: 9, isActive: true, order: 4 }
  ],
  workTypes: [
    { id: 'wt_poc', code: 'POC', name: 'POC', baseScore: 7, useCustomerTier: false, allowLeader: true, isActive: true, order: 1 },
    { id: 'wt_demo', code: 'DEMO', name: 'Demo', baseScore: 3, useCustomerTier: false, allowLeader: false, isActive: true, order: 2 },
    { id: 'wt_dao_tao', code: 'DAO_TAO', name: 'Đào tạo', useCustomerTier: true, allowLeader: true, isActive: true, order: 3 },
    { id: 'wt_tu_van', code: 'TU_VAN', name: 'Tư vấn', useCustomerTier: true, allowLeader: true, isActive: true, order: 4 }
  ],
  leaderPlatforms: [
    { id: 'lp_2', platforms: 2, score: 4, isActive: true, order: 1 },
    { id: 'lp_3', platforms: 3, score: 6, isActive: true, order: 2 },
    { id: 'lp_4', platforms: 4, score: 8, isActive: true, order: 3 },
    { id: 'lp_5', platforms: 5, score: 10, isActive: true, order: 4 }
  ],
  modules: [
    { id: 'mod_1', code: 'MOD_SAN_XUAT', name: 'Sản xuất', isActive: true, order: 1 },
    { id: 'mod_2', code: 'MOD_CRM', name: 'Crm + khuyến mại', isActive: true, order: 2 },
    { id: 'mod_3', code: 'MOD_HRM', name: 'HRM', isActive: true, order: 3 },
    { id: 'mod_4', code: 'MOD_MUA_HANG', name: 'Mua hàng', isActive: true, order: 4 },
    { id: 'mod_5', code: 'MOD_VPS', name: 'VPS', isActive: true, order: 5 },
    { id: 'mod_6', code: 'MOD_KE_TOAN', name: 'Kế toán', isActive: true, order: 6 },
    { id: 'mod_7', code: 'MOD_CAC_BO_KHAC', name: 'Các bộ khác', isActive: true, order: 7 }
  ]
};

export interface MonthlyBonus {
  id: string;
  monthYear: string; // YYYY-MM
  onbCode: string;
  amount: number; // VNĐ
  reason?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface MonthlyBonusPool {
  id: string;
  monthYear: string; // YYYY-MM
  amount: number | null; // null: Chưa nhập quỹ; >= 0: Đã nhập quỹ
  mode?: 'POOL' | 'MANUAL';
  reason?: string;
  updatedBy: string;
  updatedAt: string;
}

export interface TrainingModuleCatalog {
  id: string;
  code: string;
  name: string;
  defaultSession?: SessionOfDay | '';
  order: number;
  isActive: boolean;
  description?: string;
}

export const DEFAULT_TRAINING_MODULES: TrainingModuleCatalog[] = [
  { id: 'tm_crm', code: 'CRM', name: 'Quản trị quan hệ khách hàng (CRM)', defaultSession: 'Chiều', order: 1, isActive: true, description: 'Lớp đào tạo quy trình và tính năng CRM' },
  { id: 'tm_hrm', code: 'HRM', name: 'Quản trị nhân sự tổng thể (HRM)', defaultSession: 'Sáng', order: 2, isActive: true, description: 'Lớp đào tạo hồ sơ, hợp đồng và chính sách nhân sự' },
  { id: 'tm_ttns', code: 'TTNS', name: 'Thông tin nhân sự', defaultSession: 'Sáng', order: 3, isActive: true, description: 'Quản lý thông tin và lý lịch nhân viên' },
  { id: 'tm_cc', code: 'CHẤM CÔNG', name: 'Chấm công', defaultSession: 'Sáng', order: 4, isActive: true, description: 'Quản lý máy chấm công, ca làm việc và đơn phép' },
  { id: 'tm_tl', code: 'TIỀN LƯƠNG', name: 'Tính lương & Thuế', defaultSession: 'Chiều', order: 5, isActive: true, description: 'Bảng tính lương động và quyết toán thuế TNCN' },
  { id: 'tm_sx', code: 'SẢN XUẤT', name: 'Quản lý sản xuất & Định mức', defaultSession: 'Chiều', order: 6, isActive: true, description: 'Kế hoạch sản xuất, lệnh sản xuất và định mức BOM' },
  { id: 'tm_kt', code: 'KẾ TOÁN', name: 'Kế toán tài chính', defaultSession: 'Sáng', order: 7, isActive: true, description: 'Nghiệp vụ kế toán tổng hợp, chứng từ và sổ cái' },
  { id: 'tm_kho', code: 'KHO', name: 'Quản lý kho hàng', defaultSession: 'Sáng', order: 8, isActive: true, description: 'Nhập xuất tồn, kiểm kê và vị trí kho' },
  { id: 'tm_mua', code: 'MUA', name: 'Quản lý mua hàng', defaultSession: 'Chiều', order: 9, isActive: true, description: 'Đơn mua hàng, báo giá nhà cung cấp' },
  { id: 'tm_ws', code: 'WESIGN', name: 'Chữ ký số & Trình ký WeSign', defaultSession: 'Sáng', order: 10, isActive: true, description: 'Thiết lập luồng ký và trình ký điện tử' },
  { id: 'tm_qt', code: 'QUY TRÌNH', name: 'Quản lý quy trình động', defaultSession: 'Chiều', order: 11, isActive: true, description: 'Thiết kế quy trình liên phòng ban' },
  { id: 'tm_aimkt', code: 'AI MKT', name: 'AI Marketing & Bán hàng', defaultSession: 'Chiều', order: 12, isActive: true, description: 'Ứng dụng AI tự động hóa chăm sóc và kịch bản bán hàng' },
  { id: 'tm_cv', code: 'CÔNG VIỆC', name: 'Quản lý công việc & Dự án', defaultSession: 'Sáng', order: 13, isActive: true, description: 'Giao việc, tiến độ dự án và Kanban' },
  { id: 'tm_ts', code: 'TÀI SẢN', name: 'Quản lý tài sản & CCDC', defaultSession: 'Chiều', order: 14, isActive: true, description: 'Khấu hao tài sản và công cụ dụng cụ' }
];

export interface TrainingPriorityRegistration {
  id: string;
  monthYear: string; // YYYY-MM
  onbCode: string;
  moduleCode: string;
  maxSessions?: number; // Số buổi/lớp tối đa sẵn sàng nhận trong tháng
  order?: number; // Thứ tự ưu tiên
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

// Danh sách loại trừ nhân sự nhận lớp theo tháng
export interface MonthlyAllocationExclusionConfig {
  monthYear: string;
  excludedOnbCodes: string[];
}

// 1. Quản lý người phụ trách module theo từng tháng
export interface ModuleInChargeMember {
  id: string;
  monthYear: string; // YYYY-MM (Kỳ quản lý riêng)
  moduleCode: string; // Mã module (CRM, HRM...)
  onbCode: string; // Mã nhân sự ONB
  assignedGroup?: string; // Nhóm làm việc tự tham chiếu theo nhân sự
  isPriority?: boolean; // Ưu tiên nhận lớp (vừa học xong hoặc đăng ký ôn luyện)
  maxSessions?: number; // Số buổi tối đa sẵn sàng nhận trong tháng
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

// 2. Cấu hình lịch đào tạo định kỳ tại Core
export interface RecurringTrainingSchedule {
  id: string;
  moduleCode: string; // Module (CRM, HRM...)
  contentTitle: string; // Nội dung lớp (Đào tạo CRM, Giải đáp HRM...)
  daysOfWeek: number[]; // Các thứ tổ chức: 2=Thứ 2, 3=Thứ 3, ..., 7=Thứ 7, 8=Chủ nhật
  sessionOfDay: SessionOfDay; // 'Sáng' | 'Chiều'
  recurrenceRule: 'WEEKLY'; // Chu kỳ hằng tuần
  effectiveFrom: string; // YYYY-MM-DD
  effectiveTo?: string; // YYYY-MM-DD (Tùy chọn)
  defaultScoreRule?: string; // Tham chiếu quy tắc điểm đào tạo
  defaultNotes?: string;
  isActive: boolean;
  order: number;
  createdAt: string;
  updatedAt?: string;
}

export const DEFAULT_RECURRING_SCHEDULES: RecurringTrainingSchedule[] = [
  {
    id: 'rts_crm_t2',
    moduleCode: 'CRM',
    contentTitle: 'Đào tạo CRM',
    daysOfWeek: [2], // Thứ 2
    sessionOfDay: 'Sáng',
    recurrenceRule: 'WEEKLY',
    effectiveFrom: '2026-01-01',
    defaultScoreRule: 'ĐTTT',
    defaultNotes: 'Lớp đào tạo quy trình CRM hằng tuần',
    isActive: true,
    order: 1,
    createdAt: new Date().toISOString()
  },
  {
    id: 'rts_hrm_t4_t6',
    moduleCode: 'HRM',
    contentTitle: 'Giải đáp HRM',
    daysOfWeek: [4, 6], // Thứ 4 và Thứ 6
    sessionOfDay: 'Sáng',
    recurrenceRule: 'WEEKLY',
    effectiveFrom: '2026-01-01',
    defaultScoreRule: 'ĐTTT',
    defaultNotes: 'Giải đáp thắc mắc chuyên sâu HRM',
    isActive: true,
    order: 2,
    createdAt: new Date().toISOString()
  },
  {
    id: 'rts_ttns_t3',
    moduleCode: 'TTNS',
    contentTitle: 'Hướng dẫn Thông tin nhân sự',
    daysOfWeek: [3], // Thứ 3
    sessionOfDay: 'Chiều',
    recurrenceRule: 'WEEKLY',
    effectiveFrom: '2026-01-01',
    defaultScoreRule: 'ĐTTT',
    defaultNotes: 'Hồ sơ nhân sự và lý lịch điện tử',
    isActive: true,
    order: 3,
    createdAt: new Date().toISOString()
  },
  {
    id: 'rts_cc_t5',
    moduleCode: 'CHẤM CÔNG',
    contentTitle: 'Nghiệp vụ Chấm công & Ca',
    daysOfWeek: [5], // Thứ 5
    sessionOfDay: 'Chiều',
    recurrenceRule: 'WEEKLY',
    effectiveFrom: '2026-01-01',
    defaultScoreRule: 'ĐTTT',
    defaultNotes: 'Thiết lập máy chấm công và ca kíp',
    isActive: true,
    order: 4,
    createdAt: new Date().toISOString()
  }
];

export interface ConflictingScheduleInfo {
  scheduleId: string;
  workFormName: string;
  customerOrTask: string;
  sessionOfDay?: string;
  onbCode?: string;
}

export interface TrainingPackage {
  id: string;
  packageCode: string; // Mã lớp định danh duy nhất (VD: LOP-202610-001)
  productCode: string; // Module code
  moduleName?: string;
  contentTitle?: string; // Nội dung lớp (VD: "Đào tạo CRM", "Giải đáp HRM")
  dayOfWeek?: number; // 2..8 (Thứ 2..Chủ nhật)
  dayOfWeekName?: string; // "Thứ 2", "Thứ 3"...
  weekLabel?: string; // "Tuần 41 (05/10 - 11/10)"
  recurringScheduleId?: string; // ID lịch mẫu gốc tại Core
  occurrenceKey?: string; // Định danh lần học gốc để chống tạo trùng
  sessionOfDay: SessionOfDay; // 'Sáng' | 'Chiều'
  scheduledDate: string; // YYYY-MM-DD
  scheduledTime?: string;
  title: string;
  monthYear: string; // YYYY-MM
  allocationPoints: number; // Điểm gói phân bổ
  scoreUnit?: string; // 'Buổi' | 'Ngày'
  scoreFormula?: string;
  hasReferenceScore?: boolean;
  assignedOnbCode?: string;
  assignedGroup?: GroupId;
  userNotes?: string; // Ghi chú người dùng nhập
  systemNotes?: string; // Ghi chú do thuật toán / hệ thống tạo
  isLocked: boolean; // Khóa không cho phân bổ lại
  allocationStatus: 'Chưa phân bổ' | 'Đã phân bổ' | 'Đã xác nhận';
  scheduleStatus?: 'Chưa điền lịch' | 'Đã điền lịch' | 'Lỗi xung đột' | 'Đã hủy';
  scheduleId?: string;
  conflictingScheduleInfo?: ConflictingScheduleInfo;
  fillScheduleError?: string;
  transferHistory?: ScheduleTransferLog[];
  createdAt: string;
  updatedAt: string;
}

export interface AuditLog {
  id: string;
  timestamp: string;
  action: 'CREATE' | 'UPDATE' | 'DELETE' | 'ALLOCATE' | 'IMPORT';
  entity: 'MEMBER' | 'CORE' | 'SCHEDULE' | 'PROGRESS' | 'PACKAGE' | 'SCORE' | 'BONUS' | 'ALLOCATION' | 'HISTORY';
  entityId: string;
  onbCode: string;
  userName: string;
  description: string;
  oldValue?: any;
  newValue?: any;
}

export interface ScorecardRow {
  onbCode: string;
  fullName: string;
  shortCode: string;
  currentGroup: GroupId;
  displayGroups?: string;
  monthYear: string;

  // Chuẩn hóa 3 thành phần điểm và trọng số theo yêu cầu mới (55% / 40% / 5%):
  scoreDemoPocTienVe: number; // A: Điểm DEMO/POC/Tiền về (55%) - trước trọng số
  scoreReception: number; // B: Điểm tiếp nhận (40%) - trước trọng số
  scoreTraining: number; // C: Điểm đào tạo & loại việc khác (5%) - trước trọng số
  totalMonthlyScore: number; // T = A + B + C (Tổng điểm thực hiện trong tháng)
  weightedScore: number; // W = A*0.55 + B*0.40 + C*0.05 (Tổng điểm đã nhân trọng số)
  departmentRatio: number; // Tỷ trọng trong phòng (%) = (W / W_dept) * 100%
  manualBonus: number | null; // Khoản thưởng (VNĐ). null = Chưa nhập, number >= 0 = Đã nhập
  calculatedBonus?: number | null; // Khoản thưởng tự tính từ Quỹ thưởng (null: Chưa nhập quỹ, number: >= 0)
  finalBonus?: number | null; // Khoản thưởng áp dụng hiển thị (null: Chưa nhập quỹ, >= 0: Đã tính/nhập)
  bonusMode?: 'POOL' | 'MANUAL'; // Chế độ tính thưởng (POOL: tự tính từ quỹ, MANUAL: nhập tay cũ)

  groupBreakdown?: Record<string, { a: number; b: number; c: number; t: number; w: number }>;
  warningTasksCount?: number;

  // Sheet "Bảng điểm tính lương DS & KPI" detailed columns preserved:
  totalTasks?: number; // Tổng số lượt công việc
  totalScheduleCount?: number; // Số buổi lịch
  
  // Điểm theo loại công việc
  scoreDirectConsulting?: number; // TVTK Trực tiếp
  scoreProvinceConsulting?: number; // TVTK Tỉnh
  scoreOnline11Consulting?: number; // TVTK Online 1-1
  scoreCentralizedTraining?: number; // Đào tạo tập trung
  scoreOnline11?: number; // Online 1-1
  scoreSupport?: number; // Hỗ trợ
  scorePOC?: number; // POC
  scoreOtherWork?: number; // Công việc khác
  
  // Tiếp nhận gói đào tạo
  newPackagesCount?: number; // Số gói tiếp nhận mới
  activePackagesCount?: number; // Số gói đang phụ trách
  carriedPackagesCount?: number; // Số gói tồn từ kỳ trước
  distinctCustomersCount?: number; // Số khách hàng phân biệt
  receptionScore?: number; // Điểm tiếp nhận gói
  
  // Điểm chia nhận được & Điểm tự thực hiện
  splitScoreReceived?: number; // Điểm nhận từ chia
  selfScore?: number; // Điểm trực tiếp
  totalRecordedScore?: number; // Tổng điểm KPI ghi nhận thực tế
}

export type UserAccessStatus = 'ACTIVE' | 'LOCKED';

export interface AuthorizedAccount {
  id: string;
  email: string; // Google Email (normalized lowercase)
  onbCode: string; // Linked ONB member code
  role: UserRole; // 'admin' | 'user'
  status: UserAccessStatus; // 'ACTIVE' = Được phép, 'LOCKED' = Đã khóa
  canEditBonus?: boolean;
  canManageAllocation?: boolean;
  firebaseUid?: string; // Linked on first successful login
  displayName?: string;
  photoURL?: string;
  createdAt: string;
  updatedAt: string;
  lastLoginAt?: string;
}

export interface CurrentUserSession {
  email: string;
  onbCode: string;
  fullName: string;
  role: UserRole;
  isMasterAdmin: boolean;
  canEditBonus: boolean;
  canManageAllocation: boolean;
  firebaseUid?: string;
  photoURL?: string;
}

export interface WorkFormDef {
  code: string;
  name: string;
  shortLabel: string;
  badgeClass: string;
  subrowClass: string;
  dotClass: string;
}

export const STANDARDIZED_WORK_FORMS: WorkFormDef[] = [
  {
    code: 'TVTK_TT',
    name: 'TVTK Trực tiếp / Khách hàng',
    shortLabel: 'TVTK_TT',
    badgeClass: 'bg-emerald-50 text-emerald-800 border-emerald-200',
    subrowClass: 'border-l-2 border-emerald-500 bg-emerald-50/40',
    dotClass: 'bg-emerald-500'
  },
  {
    code: 'TVTK_Tỉnh',
    name: 'TVTK Tỉnh (Công tác)',
    shortLabel: 'TVTK_Tỉnh',
    badgeClass: 'bg-amber-50 text-amber-900 border-amber-200',
    subrowClass: 'border-l-2 border-amber-500 bg-amber-50/40',
    dotClass: 'bg-amber-500'
  },
  {
    code: 'TVTK_ON11',
    name: 'TVTK Online 1-1 / ON11',
    shortLabel: 'TVTK_ON11',
    badgeClass: 'bg-blue-50 text-blue-800 border-blue-200',
    subrowClass: 'border-l-2 border-blue-500 bg-blue-50/40',
    dotClass: 'bg-blue-500'
  },
  {
    code: 'ĐTTT',
    name: 'Đào tạo tập trung (ĐTTT)',
    shortLabel: 'ĐTTT',
    badgeClass: 'bg-purple-50 text-purple-800 border-purple-200',
    subrowClass: 'border-l-2 border-purple-500 bg-purple-50/40',
    dotClass: 'bg-purple-500'
  },
  {
    code: 'POC',
    name: 'POC / Demo',
    shortLabel: 'POC',
    badgeClass: 'bg-indigo-50 text-indigo-800 border-indigo-200',
    subrowClass: 'border-l-2 border-indigo-500 bg-indigo-50/40',
    dotClass: 'bg-indigo-500'
  },
  {
    code: 'Nghỉ phép',
    name: 'Nghỉ phép / Nghỉ bù',
    shortLabel: 'Nghỉ phép',
    badgeClass: 'bg-rose-50 text-rose-800 border-rose-200',
    subrowClass: 'border-l-2 border-rose-400 bg-rose-50/40',
    dotClass: 'bg-rose-400'
  }
];

export function resolveWorkForm(
  codeOrId: string = '',
  catalog?: ScheduleWorkForm[]
): {
  form: WorkFormDef & { category?: 'work' | 'leave'; isInactive?: boolean };
  isUnknown: boolean;
  displayCode: string;
  displayName: string;
  category: 'work' | 'leave';
} {
  const normalized = (codeOrId || '').trim();
  const upper = normalized.toUpperCase();

  // 1. Check against dynamic Core catalog if provided
  if (catalog && catalog.length > 0) {
    const dynamicMatch = catalog.find(
      f => f.id === normalized || f.name.toLowerCase() === normalized.toLowerCase() || f.code.toLowerCase() === normalized.toLowerCase()
    );
    if (dynamicMatch) {
      const isInactive = !dynamicMatch.isActive;
      const short = dynamicMatch.shortLabel || dynamicMatch.code || dynamicMatch.name;
      return {
        form: {
          code: dynamicMatch.code,
          name: dynamicMatch.name,
          shortLabel: short,
          badgeClass: 'bg-slate-100 text-slate-800 border-slate-300',
          subrowClass: 'border-l-2 border-slate-400 bg-slate-50/50',
          dotClass: 'bg-slate-500',
          category: dynamicMatch.category,
          isInactive
        },
        isUnknown: false,
        displayCode: short + (isInactive ? ' (Ngừng SD)' : ''),
        displayName: dynamicMatch.name + (isInactive ? ' (Ngừng sử dụng)' : ''),
        category: dynamicMatch.category
      };
    }
  }

  // 2. Exact match in standardized defaults
  const exact = STANDARDIZED_WORK_FORMS.find(f => f.code === normalized || f.name === normalized);
  if (exact) {
    const isLeave = exact.code === 'Nghỉ phép' || exact.name.includes('Nghỉ');
    return {
      form: { ...exact, category: isLeave ? 'leave' : 'work' },
      isUnknown: false,
      displayCode: exact.shortLabel,
      displayName: exact.name,
      category: isLeave ? 'leave' : 'work'
    };
  }

  // Known legacy mappings
  if (upper === 'TVTK_TT' || upper === 'TRỰC TIẾP' || upper === 'TRUC TIEP') {
    const f = STANDARDIZED_WORK_FORMS[0];
    return { form: { ...f, category: 'work' }, isUnknown: false, displayCode: f.shortLabel, displayName: f.name, category: 'work' };
  }
  if (upper === 'TVTK_TỈNH' || upper === 'TVTK_TINH' || upper === 'TỈNH' || upper === 'TINH') {
    const f = STANDARDIZED_WORK_FORMS[1];
    return { form: { ...f, category: 'work' }, isUnknown: false, displayCode: f.shortLabel, displayName: f.name, category: 'work' };
  }
  if (upper === 'TVTK_ON11' || upper === 'ON11' || upper === 'ONLINE 1-1' || upper === 'ONLINE') {
    const f = STANDARDIZED_WORK_FORMS[2];
    return { form: { ...f, category: 'work' }, isUnknown: false, displayCode: f.shortLabel, displayName: f.name, category: 'work' };
  }
  if (upper === 'ĐTTT' || upper === 'DTTT' || upper.includes('ĐÀO TẠO') || upper.includes('DAO TAO')) {
    const f = STANDARDIZED_WORK_FORMS[3];
    return { form: { ...f, category: 'work' }, isUnknown: false, displayCode: f.shortLabel, displayName: f.name, category: 'work' };
  }
  if (upper === 'POC' || upper === 'DEMO') {
    const f = STANDARDIZED_WORK_FORMS[4];
    return { form: { ...f, category: 'work' }, isUnknown: false, displayCode: f.shortLabel, displayName: f.name, category: 'work' };
  }
  if (upper.includes('NGHỈ') || upper.includes('NGHI') || upper.includes('PHÉP') || upper.includes('BÙ')) {
    const f = STANDARDIZED_WORK_FORMS[5];
    return { form: { ...f, category: 'leave' }, isUnknown: false, displayCode: f.shortLabel, displayName: f.name, category: 'leave' };
  }

  // Unknown: Must show with "Cần cập nhật hình thức" notice as requested
  return {
    form: {
      code: normalized,
      name: normalized || 'Cần cập nhật hình thức',
      shortLabel: normalized || 'Cần cập nhật',
      badgeClass: 'bg-amber-100 text-amber-900 border-amber-300 font-semibold',
      subrowClass: 'border-l-2 border-amber-400 bg-amber-50/50',
      dotClass: 'bg-amber-400',
      category: 'work'
    },
    isUnknown: true,
    displayCode: normalized ? `${normalized} (Cần cập nhật)` : 'Cần cập nhật',
    displayName: `${normalized || 'Chưa phân loại'} - Cần cập nhật hình thức`,
    category: 'work'
  };
}

// ==========================================
// Phân hệ "Điều phối công việc" Types
// ==========================================
export type CompletionLevel = 'Cần cố gắng' | 'Đạt' | 'Vượt mong đợi';
export type WorkAllocationSuggestion =
  | 'Hạn chế giao việc'
  | 'Giao thêm 1 chút'
  | 'Giao tẹt ga'
  | 'Ngừng hoạt động (Không giao việc)';

export interface ONBWorkAllocationRow {
  stt: number;
  onbCode: string;
  memberId: string; // Stable internal identifier from Core
  fullName: string;
  groupName: string;
  groupId?: string; // Stable internal groupId from Core
  isActive: boolean; // Trạng thái hoạt động từ Core
  taxCodesCount: number; // KH tiếp nhận: số lượng Mã số thuế không trùng
  missingTaxCodeCount: number; // Cảnh báo số gói thiếu MST nếu có
  hasMissingTaxWarning: boolean;
  packagesCount: number; // Gói tiếp nhận: tổng số bản ghi gói tiếp nhận gốc
  receptionScore: number; // Điểm tiếp nhận: tổng điểm tiếp nhận
  totalMonthlyScore: number; // Tổng điểm đã thực hiện trong tháng (từ Thưởng hiệu quả)
  completionRate: number; // Tỷ lệ hoàn thành điểm công việc = totalMonthlyScore / 100
  evaluation: number; // Đánh giá = completionRate * 0.3
  completionLevel: CompletionLevel;
  rankInGroup: number; // Thứ hạng trong nhóm theo totalMonthlyScore (1..N)
  suggestion: WorkAllocationSuggestion;
  warningNote?: string;
}

export interface GroupWorkAllocation {
  groupId: string;
  groupName: string;
  rows: ONBWorkAllocationRow[];
  totalMembers: number;
  totalKH: number;
  totalGoi: number;
  totalDiemTiepNhan: number;
  totalDiemThucHien: number;
}

export interface WorkAllocationResult {
  monthYear: string;
  groups: GroupWorkAllocation[];
  summary: {
    totalMembers: number;
    totalGroups: number;
    totalKH: number;
    totalGoi: number;
    totalDiemTiepNhan: number;
    totalDiemThucHien: number;
  };
}

// ==========================================
// Phân hệ "Xóa dữ liệu kiểm thử" (Test Data Cleanup)
// ==========================================
export interface TestDataCleanupConfig {
  authorizedEmail: string; // "dangthihong01012003@gmail.com"
  isConfirmed: boolean;
  confirmedAt?: string;
  confirmedBy?: string;
}

export type CleanupSubsystem = 'schedules' | 'progress' | 'packages';
export type CleanupTimeScopeType = 'current_month' | 'custom_range' | 'all_time';

export interface CleanupPreCheckRequest {
  subsystems: CleanupSubsystem[];
  timeScopeType: CleanupTimeScopeType;
  monthYear?: string;
  fromMonth?: string;
  toMonth?: string;
}

export interface CleanupPreCheckResult {
  canProceed: boolean;
  subsystems: CleanupSubsystem[];
  timeScopeType: CleanupTimeScopeType;
  monthsCovered: string[];
  counts: {
    schedules: number;
    trainingClassesReset: number;
    progress: number;
    progressSplits: number;
    packages: number;
    packageDetails: number;
    customersRetained: number;
  };
  impact: {
    totalWeightedScoreAffected: number;
    totalBonusAffected: number;
    membersAffectedCount: number;
  };
  lockedMonths: string[];
  isLockedBlocked: boolean;
  blockReason?: string;
  dependencyIssues: string[];
  backupReady: boolean;
  dataSignature: string;
}

export interface CleanupExecuteRequest extends CleanupPreCheckRequest {
  reason: string;
  confirmPhrase: string; // Must be "XÓA DỮ LIỆU"
  authAccountEmail: string; // Must match "dangthihong01012003@gmail.com"
  dataSignature: string;
}

export interface CleanupAuditLog {
  id: string;
  startedAt: string;
  completedAt: string;
  accountEmail: string;
  onbCode?: string;
  fullName?: string;
  reason: string;
  subsystems: CleanupSubsystem[];
  timeScope: {
    type: CleanupTimeScopeType;
    monthYear?: string;
    fromMonth?: string;
    toMonth?: string;
    monthsAffected: string[];
  };
  deletedCounts: {
    schedules: number;
    trainingClassesReset: number;
    progress: number;
    progressSplits: number;
    packages: number;
    packageDetails: number;
  };
  result: 'SUCCESS' | 'FAILED' | 'INCOMPLETE';
  errorMessage?: string;
  backupReferenceId: string;
}

// Types for "Xóa dữ liệu theo khoảng thời gian" (Admin Only)
export type DateRangeSubsystem = 'schedules' | 'packages' | 'progress';

export interface DateRangeDeletePreviewRequest {
  fromDate: string;
  toDate: string;
  subsystems: DateRangeSubsystem[];
}

export interface DateRangeDeletePreviewResult {
  canProceed: boolean;
  fromDate: string;
  toDate: string;
  subsystems: DateRangeSubsystem[];
  counts: {
    schedules: number;
    trainingClassesReset: number;
    progress: number;
    progressSplits: number;
    packages: number;
    packageDetails: number;
    customersRetained: number;
    total: number;
  };
  linkedData: {
    trainingClassesReset: number;
    progressUnlinked: number;
    schedulesUnlinked: number;
    progressWithPackageLinked: number;
  };
  affectedMembersCount: number;
  warningMessage?: string;
  notes: string[];
}

export interface DateRangeDeleteExecuteRequest {
  fromDate: string;
  toDate: string;
  subsystems: DateRangeSubsystem[];
}

export interface DateRangeDeleteExecuteResult {
  success: boolean;
  message: string;
  fromDate: string;
  toDate: string;
  subsystems: DateRangeSubsystem[];
  deletedCounts: {
    schedules: number;
    trainingClassesReset: number;
    progress: number;
    progressSplits: number;
    packages: number;
    packageDetails: number;
    total: number;
  };
  linkedAdjustments: {
    trainingReset: number;
    progressUnlinked: number;
    schedulesUnlinked: number;
  };
  auditLogId: string;
  completedAt: string;
}

export interface BackupFileInfo {
  filename: string;
  createdAt: string;
  sizeBytes: number;
  sizeFormatted: string;
  tag: string;
  counts: {
    schedules: number;
    progress: number;
    packages: number;
    customers: number;
    members: number;
    totalOperational: number;
  };
}

