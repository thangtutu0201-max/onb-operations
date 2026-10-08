import {
  CurrentUserSession,
  ONBMember,
  ONBGroup,
  AppConfig,
  ProductCatalog,
  WorkTypeCatalog,
  ReferenceScore,
  WorkSchedule,
  ProgressTask,
  Customer,
  CustomerPackage,
  PackageCoreConfig,
  ScorecardRow,
  MonthlyBonusPool,
  AuditLog,
  TrainingPackage,
  TrainingModuleCatalog,
  TrainingPriorityRegistration,
  ModuleInChargeMember,
  RecurringTrainingSchedule,
  GroupId,
  SessionOfDay,
  WorkAllocationResult,
  HistoryMonthItem,
  MonthOperationalStatus,
  CleanupSubsystem,
  CleanupTimeScopeType,
  CleanupPreCheckRequest,
  CleanupPreCheckResult,
  CleanupExecuteRequest,
  CleanupAuditLog,
  DateRangeDeletePreviewRequest,
  DateRangeDeletePreviewResult,
  DateRangeDeleteExecuteRequest,
  DateRangeDeleteExecuteResult,
  BackupFileInfo,
  AuthorizedAccount
} from '../types';
import { getCurrentIdToken } from './firebase';

export class ApiError extends Error {
  code?: string;
  status?: number;
  email?: string;

  constructor(message: string, code?: string, status?: number, email?: string) {
    super(message);
    this.name = 'ApiError';
    this.code = code;
    this.status = status;
    this.email = email;
  }
}

async function request<T>(url: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers || {});
  headers.set('Content-Type', 'application/json');

  const token = await getCurrentIdToken();
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }

  const response = await fetch(url, {
    ...options,
    headers
  });

  const data = await response.json();
  if (!response.ok) {
    throw new ApiError(data.error || `Lỗi hệ thống (${response.status})`, data.code, response.status, data.email);
  }
  return data as T;
}

export const api = {
  // Session & Bootstrap
  getSession: () => request<{
    authenticated: boolean;
    authorized?: boolean;
    session?: CurrentUserSession;
    account?: AuthorizedAccount;
    currentVietnamMonth: string;
    error?: string;
    code?: string;
    email?: string;
  }>('/api/session'),
  getBootstrap: () => request<{
    session: CurrentUserSession;
    config: AppConfig;
    currentVietnamMonth: string;
    groups: ONBGroup[];
    members: ONBMember[];
    products: ProductCatalog[];
    workTypes: WorkTypeCatalog[];
    referenceScores: ReferenceScore[];
    packageCoreConfig?: PackageCoreConfig;
  }>('/api/bootstrap'),

  // Access Control / Accounts Management
  getAccounts: () => request<{ accounts: AuthorizedAccount[] }>('/api/accounts'),
  createAccount: (data: {
    email: string;
    onbCode: string;
    role: 'admin' | 'user';
    status: 'ACTIVE' | 'LOCKED';
    canEditBonus?: boolean;
    canManageAllocation?: boolean;
  }) =>
    request<{ account: AuthorizedAccount }>('/api/accounts', {
      method: 'POST',
      body: JSON.stringify(data)
    }),
  updateAccount: (id: string, data: Partial<AuthorizedAccount>) =>
    request<{ account: AuthorizedAccount }>(`/api/accounts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    }),
  deleteAccount: (id: string) =>
    request<{ success: boolean }>(`/api/accounts/${id}`, {
      method: 'DELETE'
    }),

  // Schedules
  getSchedules: (params?: { monthYear?: string; onbCode?: string; group?: string; workType?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return request<{ schedules: WorkSchedule[]; total: number }>(`/api/schedules?${query}`);
  },
  createSchedule: (payload: Partial<WorkSchedule>) =>
    request<{ success: boolean; schedule: WorkSchedule }>('/api/schedules', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  createFullDaySchedule: (payload: any) =>
    request<{ success: boolean; schedules?: WorkSchedule[]; conflict?: boolean; message?: string; existingMorning?: any; existingAfternoon?: any }>('/api/schedules/full-day', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  cancelSchedule: (id: string, cancelBothSessions?: boolean) =>
    request<{ success: boolean }>(`/api/schedules/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancelBothSessions })
    }),
  updateSchedule: (id: string, payload: Partial<WorkSchedule> & { applyToFullDay?: boolean }) =>
    request<{ success: boolean; schedule: WorkSchedule }>(`/api/schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteSchedule: (id: string) =>
    request<{ success: boolean }>(`/api/schedules/${id}`, {
      method: 'DELETE'
    }),
  transferSchedule: (id: string, payload: { toOnbCode: string; reason?: string; expectedOnbCode?: string }) =>
    request<{ success: boolean; schedule: WorkSchedule; transferLog?: any }>(`/api/schedules/${id}/transfer`, {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  convertScheduleToProgress: (id: string) =>
    request<{ success: boolean; progressTask: ProgressTask }>(`/api/schedules/${id}/convert-to-progress`, {
      method: 'POST'
    }),

  // Progress & Points
  getProgress: (params?: { monthYear?: string; onbCode?: string; group?: string; product?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return request<{ progress: ProgressTask[]; total: number }>(`/api/progress?${query}`);
  },
  createProgress: (payload: Partial<ProgressTask>) =>
    request<{ success: boolean; progressTask: ProgressTask }>('/api/progress', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  batchCreateProgress: (items: Array<Partial<ProgressTask>>) =>
    request<{ success: boolean; count: number; progressTasks: ProgressTask[] }>('/api/progress/batch', {
      method: 'POST',
      body: JSON.stringify({ items })
    }),
  updateProgress: (id: string, payload: Partial<ProgressTask>) =>
    request<{ success: boolean; progressTask: ProgressTask }>(`/api/progress/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteProgress: (id: string) =>
    request<{ success: boolean }>(`/api/progress/${id}`, {
      method: 'DELETE'
    }),

  // Customers & Packages
  getCustomers: () => request<{ customers: Customer[] }>('/api/customers'),
  createCustomer: (payload: Partial<Customer>) =>
    request<{ success: boolean; customer: Customer }>('/api/customers', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getPackages: (params?: { monthYear?: string; onbCode?: string; status?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return request<{ packages: CustomerPackage[]; total: number }>(`/api/packages?${query}`);
  },
  createPackage: (payload: Partial<CustomerPackage>) =>
    request<{ success: boolean; package: CustomerPackage }>('/api/packages', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updatePackage: (id: string, payload: Partial<CustomerPackage> & { handoverNote?: string }) =>
    request<{ success: boolean; package: CustomerPackage }>(`/api/packages/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deletePackage: (id: string) =>
    request<{ success: boolean }>(`/api/packages/${id}`, {
      method: 'DELETE'
    }),
  checkLeaderConflict: (params: { taxCode: string; excludeDetailId?: string; excludePackageId?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return request<{
      hasLeader: boolean;
      existingClaim?: {
        onbCode: string;
        memberName: string;
        packageCode: string;
        moduleName: string;
        monthYear: string;
        packageId: string;
        detailId: string;
      } | null;
    }>(`/api/packages/check-leader?${query}`);
  },
  getLeaderConflicts: () =>
    request<{
      conflicts: Array<{
        taxCode: string;
        count: number;
        claims: Array<{
          taxCode: string;
          customerName: string;
          packageCode: string;
          packageId: string;
          detailId: string;
          onbCode: string;
          memberName: string;
          moduleName: string;
          monthYear: string;
          leaderPlatforms: number;
          leaderScore: number;
        }>;
      }>;
    }>('/api/packages/leader-conflicts'),
  getPackageCoreConfig: () =>
    request<{ config: PackageCoreConfig }>('/api/core/package-config'),
  updatePackageCoreConfig: (payload: Partial<PackageCoreConfig>) =>
    request<{ success: boolean; config: PackageCoreConfig }>('/api/core/package-config', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  // Scorecard & Bonuses
  getScorecard: (monthYear: string) =>
    request<{
      monthYear: string;
      isLocked: boolean;
      bonusPool?: MonthlyBonusPool | null;
      rows: ScorecardRow[];
      totalDepartmentWeightedScore: number;
      summary: {
        totalMembers: number;
        totalRecordedScoreAll: number;
        totalWeightedScoreAll: number;
        totalBonusAll: number;
        poolAmount?: number | null;
        roundingDiff?: number;
        totalTasksAll: number;
        totalPackagesAll: number;
        totalCustomersAll: number;
      };
    }>(`/api/scorecard?monthYear=${encodeURIComponent(monthYear)}`),
  getBonusPool: (monthYear: string) =>
    request<{
      monthYear: string;
      pool: MonthlyBonusPool | null;
      isLocked: boolean;
    }>(`/api/bonus-pool?monthYear=${encodeURIComponent(monthYear)}`),
  updateBonusPool: (payload: { monthYear: string; amount: number | null; reason?: string }) =>
    request<{
      success: boolean;
      pool: MonthlyBonusPool | null;
      message?: string;
    }>('/api/bonus-pool', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  getScorecardDrilldown: (monthYear: string, onbCode: string, category?: string) =>
    request<{
      monthYear: string;
      onbCode: string;
      memberName: string;
      currentGroup: string;
      category?: string;
      summary?: {
        scoreDemoPocTienVe: number;
        scoreReception: number;
        scoreTraining: number;
        totalMonthlyScore: number;
        weightedScore: number;
      };
      tasks: Array<ProgressTask & { category?: string; workTypeName?: string; memberPoints?: number; resolvedGroup?: string }>;
      packages: Array<CustomerPackage & { myDetails?: any[]; memberPoints?: number }>;
      schedules: WorkSchedule[];
      bonus?: { amount: number; reason?: string };
    }>(`/api/scorecard/drilldown?monthYear=${encodeURIComponent(monthYear)}&onbCode=${encodeURIComponent(onbCode)}${category ? `&category=${encodeURIComponent(category)}` : ''}`),
  updateBonus: (payload: { monthYear: string; onbCode: string; amount: number | null; reason?: string }) =>
    request<{ success: boolean; amount?: number; cleared?: boolean }>('/api/bonuses', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // Centralized Monthly Training Allocation (Lịch đào tạo tập trung)
  getAllocation: (monthYear: string) =>
    request<{
      monthYear: string;
      packages: TrainingPackage[];
      trainingModules: TrainingModuleCatalog[];
      inChargeMembers?: ModuleInChargeMember[];
      recurringSchedules?: RecurringTrainingSchedule[];
      priorities: TrainingPriorityRegistration[];
      groups: ONBGroup[];
      members: ONBMember[];
      groupPoints: Record<string, number>;
      groupClassCounts: Record<string, number>;
      isLocked: boolean;
      isPastMonth?: boolean;
      canManage: boolean;
      dtttWorkForm?: any;
      excludedOnbCodes?: string[];
    }>(`/api/allocation?monthYear=${encodeURIComponent(monthYear)}`),

  updateAllocationExclusions: (payload: { monthYear: string; excludedOnbCodes: string[] }) =>
    request<{ success: boolean; monthYear: string; excludedOnbCodes: string[] }>('/api/allocation/exclusions', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  createTrainingClass: (payload: {
    monthYear: string;
    productCode: string;
    scheduledDate: string;
    sessionOfDay?: string;
    userNotes?: string;
    assignedOnbCode?: string;
  }) =>
    request<{ success: boolean; package: TrainingPackage }>('/api/allocation/classes', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  duplicateTrainingClass: (id: string) =>
    request<{ success: boolean; package: TrainingPackage }>(`/api/allocation/classes/${id}/duplicate`, {
      method: 'POST'
    }),

  updateTrainingClass: (id: string, payload: Partial<TrainingPackage>) =>
    request<{ success: boolean; package: TrainingPackage }>(`/api/allocation/classes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  deleteTrainingClass: (id: string) =>
    request<{ success: boolean }>(`/api/allocation/classes/${id}`, {
      method: 'DELETE'
    }),

  createTrainingPriority: (payload: {
    monthYear: string;
    onbCode: string;
    moduleCode: string;
    maxSessions?: number;
    order?: number;
    notes?: string;
  }) =>
    request<{ success: boolean; priority: TrainingPriorityRegistration }>('/api/allocation/priorities', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateTrainingPriority: (id: string, payload: Partial<TrainingPriorityRegistration>) =>
    request<{ success: boolean; priority: TrainingPriorityRegistration }>(`/api/allocation/priorities/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  deleteTrainingPriority: (id: string) =>
    request<{ success: boolean }>(`/api/allocation/priorities/${id}`, {
      method: 'DELETE'
    }),

  simulateAllocation: (payload: { monthYear: string; selectedGroupIds?: string[]; packageIds?: string[]; excludedOnbCodes?: string[] }) =>
    request<{
      success: boolean;
      monthYear: string;
      simulatedPackages: TrainingPackage[];
      groupPointsResult: Record<string, number>;
      groupClassCounts: Record<string, number>;
      maxDifference: number;
      minGroupPoints: number;
      maxGroupPoints: number;
      explanation: string;
      emptyGroups?: string[];
      unallocatedClasses?: Array<{
        id: string;
        packageCode: string;
        productCode: string;
        contentTitle?: string;
        scheduledDate: string;
        sessionOfDay: string;
        reason: string;
      }>;
      totalAllocated?: number;
      totalUnallocated?: number;
      participatingCount?: number;
      excludedCount?: number;
    }>('/api/allocation/simulate', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  saveAllocationAssignments: (payload: {
    monthYear: string;
    assignments: Array<{ id: string; assignedOnbCode?: string; systemNotes?: string; isLocked?: boolean }>;
  }) =>
    request<{ success: boolean; message: string }>('/api/allocation/save-assignments', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  confirmAndFillSchedules: (payload: {
    monthYear: string;
    assignments: Array<{ id: string; assignedOnbCode?: string; isLocked?: boolean }>;
  }) =>
    request<{
      success: boolean;
      monthYear: string;
      totalProcessed: number;
      newSuccessCount: number;
      skippedCount: number;
      failedCount: number;
      uniqueMembersCount: number;
      failedClasses: Array<{
        id: string;
        packageCode: string;
        productCode: string;
        moduleName: string;
        scheduledDate: string;
        sessionOfDay: string;
        assignedOnbCode: string;
        memberName: string;
        assignedGroup: string;
        reason: string;
        conflictingSchedule?: any;
      }>;
    }>('/api/allocation/confirm-and-fill-schedules', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  retryFailedClasses: (payload: {
    monthYear: string;
    reassignments: Array<{ classId: string; assignedOnbCode: string }>;
  }) =>
    request<{
      success: boolean;
      retrySuccessCount: number;
      stillFailedCount: number;
      remainingFailed: Array<{
        id: string;
        packageCode: string;
        productCode: string;
        moduleName: string;
        scheduledDate: string;
        sessionOfDay: string;
        assignedOnbCode: string;
        memberName: string;
        assignedGroup: string;
        reason: string;
        conflictingSchedule?: any;
      }>;
    }>('/api/allocation/retry-failed-classes', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  unlinkTrainingSchedule: (id: string) =>
    request<{ success: boolean }>(`/api/allocation/unlink-schedule/${id}`, {
      method: 'POST'
    }),

  // Monthly Module In-Charge Management (Quản lý người phụ trách module theo tháng)
  getModuleInChargeMembers: (monthYear: string) =>
    request<{ monthYear: string; inChargeMembers: ModuleInChargeMember[] }>(`/api/allocation/in-charge?monthYear=${monthYear}`),

  createModuleInChargeMember: (payload: {
    monthYear: string;
    moduleCode: string;
    onbCode: string;
    isPriority?: boolean;
    maxSessions?: number;
    notes?: string;
  }) =>
    request<{ success: boolean; record: ModuleInChargeMember }>('/api/allocation/in-charge', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateModuleInChargeMember: (id: string, payload: Partial<ModuleInChargeMember>) =>
    request<{ success: boolean; record: ModuleInChargeMember }>(`/api/allocation/in-charge/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  deleteModuleInChargeMember: (id: string) =>
    request<{ success: boolean }>(`/api/allocation/in-charge/${id}`, {
      method: 'DELETE'
    }),

  copyModuleInChargeFromMonth: (payload: { fromMonthYear: string; toMonthYear: string }) =>
    request<{
      success: boolean;
      copiedCount: number;
      skippedCount: number;
      records: ModuleInChargeMember[];
      message: string;
    }>('/api/allocation/in-charge/copy-from-month', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  previewClassesFromCore: (payload: { monthYear: string; scheduleIds?: string[] }) =>
    request<{
      success: boolean;
      monthYear: string;
      items: Array<{
        recurringScheduleId: string;
        moduleCode: string;
        contentTitle: string;
        dayOfWeek: number;
        dayOfWeekName: string;
        scheduledDate: string;
        dateLabel: string;
        weekLabel: string;
        sessionOfDay: SessionOfDay;
        allocationPoints: number;
        scoreUnit: string;
        scoreFormula: string;
        hasReferenceScore: boolean;
        occurrenceKey: string;
        status: 'Sẽ tạo mới' | 'Đã tồn tại' | 'Đã bị loại trừ';
      }>;
      newCount: number;
      existingCount: number;
      cancelledCount: number;
    }>('/api/allocation/preview-classes-from-core', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  generateClassesFromCore: (payload: { monthYear: string; scheduleIds?: string[]; ignoreCancelledExceptions?: boolean }) =>
    request<{
      success: boolean;
      monthYear: string;
      createdCount: number;
      skippedCount: number;
      skippedCancelledCount?: number;
      createdClasses: TrainingPackage[];
      message: string;
    }>('/api/allocation/generate-classes-from-core', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  getHistoryLookup: (params: { monthYear: string; onbCode?: string; groupId?: string; moduleCode?: string; status?: string }) => {
    const query = new URLSearchParams(params as any).toString();
    return request<{
      monthYear: string;
      hasData: boolean;
      packages: TrainingPackage[];
      totalClasses: number;
      totalPoints: number;
    }>(`/api/allocation/history-lookup?${query}`);
  },

  // Recurring Training Schedules in Core
  getRecurringTrainingSchedules: () =>
    request<{ recurringSchedules: RecurringTrainingSchedule[] }>('/api/core/recurring-schedules'),

  createRecurringTrainingSchedule: (payload: Partial<RecurringTrainingSchedule>) =>
    request<{ success: boolean; recurringSchedule: RecurringTrainingSchedule }>('/api/core/recurring-schedules', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateRecurringTrainingSchedule: (id: string, payload: Partial<RecurringTrainingSchedule>) =>
    request<{ success: boolean; recurringSchedule: RecurringTrainingSchedule }>(`/api/core/recurring-schedules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  deleteRecurringTrainingSchedule: (id: string) =>
    request<{ success: boolean }>(`/api/core/recurring-schedules/${id}`, {
      method: 'DELETE'
    }),

  // Core Training Modules Management
  getTrainingModules: () =>
    request<{ modules: TrainingModuleCatalog[] }>('/api/core/training-modules'),

  createTrainingModule: (payload: Partial<TrainingModuleCatalog>) =>
    request<{ success: boolean; module: TrainingModuleCatalog }>('/api/core/training-modules', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  updateTrainingModule: (id: string, payload: Partial<TrainingModuleCatalog>) =>
    request<{ success: boolean; module: TrainingModuleCatalog }>(`/api/core/training-modules/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  deleteTrainingModule: (id: string) =>
    request<{ success: boolean }>(`/api/core/training-modules/${id}`, {
      method: 'DELETE'
    }),

  // Legacy lock helper
  togglePackageLock: (id: string, payload: { isLocked: boolean; assignedOnbCode?: string; assignedGroup?: GroupId }) =>
    request<{ success: boolean }>(`/api/allocation/classes/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),

  // History & Months
  getHistoryMonths: () =>
    request<{
      currentVietnamMonth: string;
      months: HistoryMonthItem[];
      systemLockedMonths: string[];
      reopenedMonths: string[];
    }>('/api/history/months'),

  reopenMonth: (monthYear: string, reason: string) =>
    request<{
      success: boolean;
      monthYear: string;
      status: MonthOperationalStatus;
      statusLabel: string;
      isLocked: boolean;
      isReopened: boolean;
      config: AppConfig;
    }>('/api/history/months/reopen', {
      method: 'POST',
      body: JSON.stringify({ monthYear, reason })
    }),

  lockMonth: (monthYear: string) =>
    request<{
      success: boolean;
      monthYear: string;
      status: MonthOperationalStatus;
      statusLabel: string;
      isLocked: boolean;
      isReopened: boolean;
      config: AppConfig;
    }>('/api/history/months/lock', {
      method: 'POST',
      body: JSON.stringify({ monthYear })
    }),

  // Import & Reconciliation
  previewImport: (payload: { rows: any[]; targetType: string; monthYear: string }) =>
    request<{
      totalRows: number;
      validCount: number;
      errorCount: number;
      errors: { row: number; field: string; message: string }[];
      validPreview: any[];
    }>('/api/import/preview', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  confirmImport: (payload: { targetType: string; monthYear: string; validRows: any[]; batchId?: string }) =>
    request<{ success: boolean; batchId: string; insertedCount: number }>('/api/import/confirm', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),

  // Core Management (Admin Only)
  updateCoreConfig: (payload: Partial<AppConfig>) =>
    request<{ success: boolean; config: AppConfig }>('/api/core/config', {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  createMember: (payload: any) =>
    request<{ success: boolean; member: ONBMember }>('/api/core/members', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateMember: (code: string, payload: any) =>
    request<{ success: boolean; member: ONBMember }>(`/api/core/members/${encodeURIComponent(code)}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteMember: (code: string) =>
    request<{ success: boolean }>(`/api/core/members/${encodeURIComponent(code)}`, {
      method: 'DELETE'
    }),
  createProduct: (payload: any) =>
    request<{ success: boolean; product: ProductCatalog }>('/api/core/products', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateProduct: (id: string, payload: any) =>
    request<{ success: boolean; product: ProductCatalog }>(`/api/core/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteProduct: (id: string) =>
    request<{ success: boolean }>(`/api/core/products/${id}`, {
      method: 'DELETE'
    }),
  createWorkType: (payload: any) =>
    request<{ success: boolean; workType: WorkTypeCatalog }>('/api/core/work-types', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateWorkType: (id: string, payload: any) =>
    request<{ success: boolean; workType: WorkTypeCatalog }>(`/api/core/work-types/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteWorkType: (id: string) =>
    request<{ success: boolean }>(`/api/core/work-types/${id}`, {
      method: 'DELETE'
    }),
  createReferenceScore: (payload: any) =>
    request<{ success: boolean; referenceScore: ReferenceScore }>('/api/core/reference-scores', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateReferenceScore: (id: string, payload: any) =>
    request<{ success: boolean; referenceScore?: ReferenceScore }>(`/api/core/reference-scores/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteReferenceScore: (id: string) =>
    request<{ success: boolean }>(`/api/core/reference-scores/${id}`, {
      method: 'DELETE'
    }),
  deletePackageConfigItem: (section: string, id: string) =>
    request<{ success: boolean }>(`/api/core/package-config/${section}/${id}`, {
      method: 'DELETE'
    }),

  // Core Groups Management
  getGroups: () => request<{ groups: ONBGroup[] }>('/api/core/groups'),
  createGroup: (payload: any) =>
    request<{ success: boolean; group: ONBGroup }>('/api/core/groups', {
      method: 'POST',
      body: JSON.stringify(payload)
    }),
  updateGroup: (id: string, payload: any) =>
    request<{ success: boolean; group: ONBGroup }>(`/api/core/groups/${id}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    }),
  deleteGroup: (id: string) =>
    request<{ success: boolean }>(`/api/core/groups/${id}`, {
      method: 'DELETE'
    }),

  // Audit Logs & Backup
  getAuditLogs: () => request<{ logs: AuditLog[] }>('/api/audit-logs'),
  restoreBackup: (data: any) =>
    request<{ success: boolean }>('/api/restore', {
      method: 'POST',
      body: JSON.stringify(data)
    }),

  // Điều phối công việc
  getWorkAllocation: (monthYear?: string, group?: string) => {
    const params = new URLSearchParams();
    if (monthYear) params.append('monthYear', monthYear);
    if (group) params.append('group', group);
    const qs = params.toString();
    return request<WorkAllocationResult>(`/api/work-allocation${qs ? `?${qs}` : ''}`);
  },

  // Realtime Events
  subscribeToRealtime: (
    onEvent: (data: any) => void,
    onStatus?: (status: 'connected' | 'disconnected') => void
  ): (() => void) => {
    if (typeof window === 'undefined' || !window.EventSource) {
      if (onStatus) onStatus('disconnected');
      return () => {};
    }
    const es = new EventSource('/api/realtime/stream');
    es.onopen = () => {
      if (onStatus) onStatus('connected');
    };
    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'CONNECTED') {
          if (onStatus) onStatus('connected');
        }
        onEvent(data);
      } catch {
        // Heartbeat or non-json message
      }
    };
    es.onerror = () => {
      if (onStatus) onStatus('disconnected');
      // EventSource automatically attempts to reconnect
    };
    return () => {
      es.close();
    };
  },

  // Test Data Cleanup (Đặc quyền riêng cho tài khoản cá nhân đã xác thực)
  getCleanupStatus: () => request<{
    isAuthorized: boolean;
    isConfirmed: boolean;
    authorizedEmail?: string;
    confirmedAt?: string;
    currentUserEmail?: string;
  }>('/api/test-data-cleanup/status'),

  confirmCleanupAccount: (email: string) => request<{ success: boolean; message: string }>('/api/test-data-cleanup/confirm-account', {
    method: 'POST',
    body: JSON.stringify({ email })
  }),

  preCheckCleanup: (payload: CleanupPreCheckRequest) => request<CleanupPreCheckResult>('/api/test-data-cleanup/pre-check', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  executeCleanup: (payload: CleanupExecuteRequest) => request<{
    success: boolean;
    message: string;
    backupReferenceId: string;
    deletedCounts: {
      schedules: number;
      trainingClassesReset: number;
      progress: number;
      progressSplits: number;
      packages: number;
      packageDetails: number;
    };
    monthsAffected: string[];
    completedAt: string;
  }>('/api/test-data-cleanup/execute', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  getCleanupAuditLogs: () => request<{ logs: CleanupAuditLog[] }>('/api/test-data-cleanup/audit-logs'),

  restoreCleanupSnapshot: (payload: { backupReferenceId: string; confirmPhrase: string }) => request<{ success: boolean; message: string }>('/api/test-data-cleanup/restore-snapshot', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  // Xóa dữ liệu theo khoảng thời gian (Admin Only - Thao tác đơn giản, không cần Gmail/OTP)
  previewDateRangeDelete: (payload: DateRangeDeletePreviewRequest) => request<DateRangeDeletePreviewResult>('/api/core/delete-by-date-range/preview', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  executeDateRangeDelete: (payload: DateRangeDeleteExecuteRequest) => request<DateRangeDeleteExecuteResult>('/api/core/delete-by-date-range/execute', {
    method: 'POST',
    body: JSON.stringify(payload)
  }),

  // Trung tâm Sao lưu & Khôi phục (Admin Only)
  getBackups: () => request<{ backups: BackupFileInfo[] }>('/api/core/backups'),

  createBackupSnapshot: () => request<{ success: boolean; message: string; backup: BackupFileInfo }>('/api/core/backups/create', {
    method: 'POST'
  }),

  restoreBackupSnapshot: (filename: string) => request<{ success: boolean; message: string }>('/api/core/backups/restore', {
    method: 'POST',
    body: JSON.stringify({ filename })
  }),

  deleteBackupFile: (filename: string) => request<{ success: boolean; message: string }>(`/api/core/backups/${encodeURIComponent(filename)}`, {
    method: 'DELETE'
  }),

  // Xóa trắng dữ liệu nghiệp vụ (Admin Only)
  resetOperationalData: () => request<{
    success: boolean;
    message: string;
    backupReferenceId: string;
    wipedCounts: { schedules: number; progress: number; packages: number; total: number };
  }>('/api/core/reset-operational-data', {
    method: 'POST'
  })
};

