import fs from 'fs';
import path from 'path';
import {
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
  PackageDetailRow,
  PackageCoreConfig,
  MonthlyBonus,
  MonthlyBonusPool,
  TrainingPackage,
  AuditLog,
  ScheduleWorkForm,
  DEFAULT_SCHEDULE_WORK_FORMS,
  TrainingModuleCatalog,
  TrainingPriorityRegistration,
  DEFAULT_TRAINING_MODULES,
  ModuleInChargeMember,
  RecurringTrainingSchedule,
  DEFAULT_RECURRING_SCHEDULES,
  TestDataCleanupConfig,
  CleanupAuditLog,
  AuthorizedAccount
} from '../src/types';

export const FIRST_ADMIN_EMAIL = 'thangtutu0201@gmail.com';

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

export interface DatabaseSchema {
  config: AppConfig;
  groups: ONBGroup[];
  members: ONBMember[];
  products: ProductCatalog[];
  workTypes: WorkTypeCatalog[];
  scheduleWorkForms: ScheduleWorkForm[];
  referenceScores: ReferenceScore[];
  schedules: WorkSchedule[];
  progress: ProgressTask[];
  customers: Customer[];
  packages: CustomerPackage[];
  packageCoreConfig?: PackageCoreConfig;
  bonuses: MonthlyBonus[];
  bonusPools?: MonthlyBonusPool[];
  trainingModules?: TrainingModuleCatalog[];
  isTrainingModulesInitialized?: boolean;
  trainingPriorities?: TrainingPriorityRegistration[];
  moduleInChargeMembers?: ModuleInChargeMember[];
  recurringTrainingSchedules?: RecurringTrainingSchedule[];
  isRecurringTrainingInitialized?: boolean;
  trainingPackages: TrainingPackage[];
  cancelledOccurrenceKeys?: string[];
  auditLogs: AuditLog[];
  testDataCleanupConfig?: TestDataCleanupConfig;
  cleanupAuditLogs?: CleanupAuditLog[];
  monthlyAllocationExclusions?: Record<string, string[]>;
  authorizedAccounts?: AuthorizedAccount[];
}

const DATA_DIR = path.resolve(process.cwd(), 'data');
const DB_FILE = path.join(DATA_DIR, 'db.json');

// Ensure data folder exists
if (!fs.existsSync(DATA_DIR)) {
  fs.mkdirSync(DATA_DIR, { recursive: true });
}

let cachedDb: DatabaseSchema | null = null;
let lastDbMtime: number = 0;
let writeQueue: Promise<void> = Promise.resolve();

export function readDatabase(): DatabaseSchema {
  if (!fs.existsSync(DB_FILE)) {
    const initial = getInitialData();
    writeDatabaseSync(initial);
    cachedDb = initial;
    return cachedDb;
  }

  try {
    const stat = fs.statSync(DB_FILE);
    if (cachedDb && stat.mtimeMs === lastDbMtime) {
      return cachedDb;
    }

    const raw = fs.readFileSync(DB_FILE, 'utf-8');
    cachedDb = JSON.parse(raw);
    lastDbMtime = stat.mtimeMs;
    if (cachedDb && Array.isArray(cachedDb.workTypes)) {
      let modified = false;

      // Migrate existing work types
      cachedDb.workTypes.forEach((wt: any) => {
        if (!wt.unit) {
          if (wt.code === 'HT') {
            wt.unit = 'Giờ';
            wt.unitType = 'hours';
          } else if (wt.code === 'POC') {
            wt.unit = 'Gói';
            wt.unitType = 'number';
          } else if (wt.code === 'TIEN_VE') {
            wt.unit = 'VNĐ';
            wt.unitType = 'currency';
          } else {
            wt.unit = 'Buổi';
            wt.unitType = 'session';
          }
          modified = true;
        }
        if (!wt.calculationMethod) {
          wt.calculationMethod = wt.code === 'TIEN_VE' ? 'AMOUNT_DIVIDE' : 'QUANTITY_MULTIPLY';
          modified = true;
        }
        if (wt.requiresProduct === undefined) {
          wt.requiresProduct = false;
          modified = true;
        }
        if (!wt.kpiCategory) {
          if (wt.code === 'TIEN_VE' || wt.code === 'POC') wt.kpiCategory = 'DEMO/POC/Tiền về';
          else if (wt.code === 'TVTK_TT' || wt.code === 'Trực tiếp') wt.kpiCategory = 'TVTK Trực tiếp';
          else if (wt.code === 'TVTK_Tỉnh') wt.kpiCategory = 'TVTK Tỉnh';
          else if (wt.code === 'ON11' || wt.code === 'TVTK_ON11') wt.kpiCategory = 'ON11';
          else if (wt.code === 'ĐTTT') wt.kpiCategory = 'Đào tạo tập trung';
          else wt.kpiCategory = 'Khác';
          modified = true;
        }
        if (!Array.isArray(wt.customFields)) {
          wt.customFields = [];
          modified = true;
        }
      });

      // Ensure TIEN_VE exists in workTypes
      const existingTienVe = cachedDb.workTypes.find((w: any) => w.code === 'TIEN_VE');
      if (!existingTienVe) {
        cachedDb.workTypes.push({
          id: 'wt_tien_ve',
          code: 'TIEN_VE',
          name: 'Tiền về',
          isTraining: false,
          isActive: true,
          unit: 'VNĐ',
          unitType: 'currency',
          calculationMethod: 'AMOUNT_DIVIDE',
          requiresProduct: false,
          kpiCategory: 'DEMO/POC/Tiền về',
          defaultScorePerUnit: 1,
          conversionRate: 5000000,
          order: cachedDb.workTypes.length + 1,
          customFields: []
        });
        modified = true;
      } else if (!existingTienVe.conversionRate) {
        existingTienVe.conversionRate = 5000000;
        modified = true;
      }

      // Ensure TIEN_VE exists in referenceScores
      if (Array.isArray(cachedDb.referenceScores) && !cachedDb.referenceScores.some((rs: any) => rs.workTypeCode === 'TIEN_VE')) {
        cachedDb.referenceScores.push({
          id: 'rs_tien_ve',
          workTypeCode: 'TIEN_VE',
          suggestedScore: 1,
          conversionRate: 5000000,
          effectiveFrom: '2026-01-01',
          description: 'Quy đổi Tiền về: 5.000.000 VNĐ = 1 điểm KPI',
          isActive: true
        });
        modified = true;
      }

      if (Array.isArray(cachedDb.referenceScores)) {
        cachedDb.referenceScores.forEach((rs: any) => {
          if (rs.isActive === undefined) {
            rs.isActive = true;
            modified = true;
          }
        });
      }

      // Ensure packageCoreConfig exists and is populated
      if (!cachedDb.packageCoreConfig) {
        cachedDb.packageCoreConfig = JSON.parse(JSON.stringify(DEFAULT_PACKAGE_CORE_CONFIG));
        modified = true;
      } else {
        // Ensure all arrays exist in packageCoreConfig
        const pcfg = cachedDb.packageCoreConfig;
        if (!Array.isArray(pcfg.sources)) {
          pcfg.sources = JSON.parse(JSON.stringify(DEFAULT_PACKAGE_CORE_CONFIG.sources));
          modified = true;
        }
        if (!Array.isArray(pcfg.classifications)) {
          pcfg.classifications = JSON.parse(JSON.stringify(DEFAULT_PACKAGE_CORE_CONFIG.classifications));
          modified = true;
        }
        if (!Array.isArray(pcfg.customerTiers)) {
          pcfg.customerTiers = JSON.parse(JSON.stringify(DEFAULT_PACKAGE_CORE_CONFIG.customerTiers));
          modified = true;
        }
        if (!Array.isArray(pcfg.workTypes)) {
          pcfg.workTypes = JSON.parse(JSON.stringify(DEFAULT_PACKAGE_CORE_CONFIG.workTypes));
          modified = true;
        }
        if (!Array.isArray(pcfg.leaderPlatforms)) {
          pcfg.leaderPlatforms = JSON.parse(JSON.stringify(DEFAULT_PACKAGE_CORE_CONFIG.leaderPlatforms));
          modified = true;
        }
        if (!Array.isArray(pcfg.modules)) {
          pcfg.modules = JSON.parse(JSON.stringify(DEFAULT_PACKAGE_CORE_CONFIG.modules));
          modified = true;
        }
      }

      // Ensure existing packages have new fields (taxCode, customerName, details array)
      if (Array.isArray(cachedDb.packages)) {
        cachedDb.packages.forEach((pkg: any) => {
          if (!pkg.taxCode) {
            const cust = cachedDb!.customers.find((c: any) => c.id === pkg.customerId);
            pkg.taxCode = (cust?.taxCode || '0108923412').toString().trim();
            modified = true;
          }
          if (!pkg.customerName) {
            const cust = cachedDb!.customers.find((c: any) => c.id === pkg.customerId);
            pkg.customerName = cust?.name || pkg.packageName || 'Khách hàng';
            modified = true;
          }
          if (!pkg.sourceCode) {
            pkg.sourceCode = 'SRC_BAN_THEM_1';
            modified = true;
          }
          if (!pkg.packageClass) {
            pkg.packageClass = pkg.packageType === 'Mới tiếp nhận' ? 'Tiếp nhận mới' : 'Tiếp nhận lại';
            modified = true;
          }
          if (!pkg.customerTier) {
            pkg.customerTier = 'SILVER';
            modified = true;
          }
          if (!pkg.workForm) {
            pkg.workForm = 'Đào tạo';
            modified = true;
          }
          if (!Array.isArray(pkg.details) || pkg.details.length === 0) {
            const member = cachedDb!.members.find((m: any) => m.code === pkg.assignedOnbCode);
            const scoreVal = Number(pkg.recordedScore) || 20;
            pkg.details = [
              {
                id: `dtl_${pkg.id}_1`,
                packageId: pkg.id,
                moduleCode: 'MOD_HRM',
                moduleName: 'HRM',
                onbCode: pkg.assignedOnbCode || 'NTGIANG',
                groupName: member?.currentGroup || 'Nhóm 1',
                leaderPlatforms: undefined,
                leaderScore: 0,
                suggestedScore: Number(pkg.suggestedScore) || scoreVal,
                recordedScore: scoreVal,
                isManualScore: false,
                scoreFormula: 'Điểm tiếp nhận: ' + scoreVal + ' điểm',
                notes: pkg.notes,
                updatedBy: pkg.updatedBy || 'SYSTEM',
                updatedAt: pkg.updatedAt || new Date().toISOString()
              }
            ];
            modified = true;
          }
        });
      }

      // Ensure bonusPools exists
      if (!Array.isArray(cachedDb.bonusPools)) {
        cachedDb.bonusPools = [];
        modified = true;
      }

      // Ensure trainingModules exists in Core (preserve empty array if already initialized)
      if (!Array.isArray(cachedDb.trainingModules)) {
        if (!cachedDb.isTrainingModulesInitialized) {
          cachedDb.trainingModules = JSON.parse(JSON.stringify(DEFAULT_TRAINING_MODULES));
          cachedDb.isTrainingModulesInitialized = true;
          modified = true;
        } else {
          cachedDb.trainingModules = [];
          modified = true;
        }
      } else {
        if (!cachedDb.isTrainingModulesInitialized) {
          cachedDb.isTrainingModulesInitialized = true;
          modified = true;
        }
      }

      // Ensure trainingPriorities exists
      if (!Array.isArray(cachedDb.trainingPriorities)) {
        cachedDb.trainingPriorities = [];
        modified = true;
      }

      // Ensure moduleInChargeMembers exists
      if (!Array.isArray(cachedDb.moduleInChargeMembers)) {
        cachedDb.moduleInChargeMembers = [];
        modified = true;
      }

      // Ensure recurringTrainingSchedules exists (preserve empty array if already initialized)
      if (!Array.isArray(cachedDb.recurringTrainingSchedules)) {
        if (!cachedDb.isRecurringTrainingInitialized) {
          cachedDb.recurringTrainingSchedules = JSON.parse(JSON.stringify(DEFAULT_RECURRING_SCHEDULES));
          cachedDb.isRecurringTrainingInitialized = true;
          modified = true;
        } else {
          cachedDb.recurringTrainingSchedules = [];
          modified = true;
        }
      } else {
        if (!cachedDb.isRecurringTrainingInitialized) {
          cachedDb.isRecurringTrainingInitialized = true;
          modified = true;
        }
      }

      // Ensure existing trainingPackages have all required fields
      if (Array.isArray(cachedDb.trainingPackages)) {
        cachedDb.trainingPackages.forEach((tp: any, index: number) => {
          if (!tp.sessionOfDay) {
            // Check time or default
            const hour = tp.scheduledTime ? parseInt(tp.scheduledTime.split(':')[0] || '12', 10) : 14;
            tp.sessionOfDay = hour < 12 ? 'Sáng' : 'Chiều';
            modified = true;
          }
          if (!tp.packageCode) {
            const mClean = (tp.monthYear || '2026-10').replace('-', '');
            tp.packageCode = `LOP-${mClean}-${String(index + 1).padStart(3, '0')}`;
            modified = true;
          }
          if (!tp.contentTitle) {
            tp.contentTitle = tp.title || tp.moduleName || `Đào tạo ${tp.productCode}`;
            modified = true;
          }
          if (tp.scheduledDate) {
            const wInfo = getVietnamWeekInfo(tp.scheduledDate);
            if (!tp.dayOfWeek) {
              tp.dayOfWeek = wInfo.dayOfWeek;
              modified = true;
            }
            if (!tp.dayOfWeekName) {
              tp.dayOfWeekName = wInfo.dayOfWeekName;
              modified = true;
            }
            if (!tp.weekLabel) {
              tp.weekLabel = wInfo.weekLabel;
              modified = true;
            }
          }
          if (tp.hasReferenceScore === undefined) {
            tp.hasReferenceScore = true;
            modified = true;
          }
          if (!tp.scoreUnit) {
            tp.scoreUnit = 'Buổi';
            modified = true;
          }
          if (!tp.scheduleStatus) {
            tp.scheduleStatus = tp.scheduleId ? 'Đã điền lịch' : 'Chưa điền lịch';
            modified = true;
          }
          if (tp.userNotes === undefined) {
            tp.userNotes = '';
            modified = true;
          }
          if (tp.systemNotes === undefined) {
            tp.systemNotes = '';
            modified = true;
          }
        });
      }

      // Ensure config and lock arrays
      if (!cachedDb.config) {
        cachedDb.config = {
          adminEmail: 'Thangtutu0201@gmail.com',
          adminOnbCode: 'C-1134',
          bonusManagers: [],
          allocationManagers: [],
          timezone: 'Asia/Ho_Chi_Minh',
          systemLockedMonths: [],
          reopenedMonths: [],
          initialDataImportLocked: true
        };
        modified = true;
      } else {
        if (!Array.isArray(cachedDb.config.reopenedMonths)) {
          cachedDb.config.reopenedMonths = [];
          modified = true;
        }
        if (!Array.isArray(cachedDb.config.systemLockedMonths)) {
          cachedDb.config.systemLockedMonths = [];
          modified = true;
        }
      }

      // Ensure testDataCleanupConfig exists (strictly assigned to dangthihong01012003@gmail.com, default unconfirmed)
      if (!cachedDb.testDataCleanupConfig) {
        cachedDb.testDataCleanupConfig = {
          authorizedEmail: 'dangthihong01012003@gmail.com',
          isConfirmed: false
        };
        modified = true;
      }

      // Ensure cleanupAuditLogs exists
      if (!Array.isArray(cachedDb.cleanupAuditLogs)) {
        cachedDb.cleanupAuditLogs = [];
        modified = true;
      }

      // Ensure monthlyAllocationExclusions exists
      if (!cachedDb.monthlyAllocationExclusions || typeof cachedDb.monthlyAllocationExclusions !== 'object') {
        cachedDb.monthlyAllocationExclusions = {};
        modified = true;
      }

      // Ensure authenticated user member profile exists for dangthihong01012003@gmail.com
      if (Array.isArray(cachedDb.members) && !cachedDb.members.some(m => m.email?.toLowerCase() === 'dangthihong01012003@gmail.com')) {
        const defaultGrp = (cachedDb.groups && cachedDb.groups[0]) || { id: 'grp_1', name: 'Nhóm 1' };
        cachedDb.members.push({
          id: 'ONB_DTHONG',
          code: 'C-DTHONG',
          fullName: 'Đặng Thị Hồng',
          displayName: 'Đặng Thị Hồng',
          shortCode: 'DTHONG',
          email: 'dangthihong01012003@gmail.com',
          groupId: defaultGrp.id,
          currentGroup: defaultGrp.name,
          groupHistory: [
            {
              groupId: defaultGrp.id,
              group: defaultGrp.name,
              fromDate: '2025-01-01',
              note: 'Tài khoản cá nhân hệ thống'
            }
          ],
          startDate: '2025-01-01',
          isActive: true,
          participateRandom: true,
          completedProducts: ['CRM', 'HRM'],
          phone: '0981012003'
        });
        modified = true;
      }

      // Ensure authorizedAccounts exists and first admin is active
      if (!Array.isArray(cachedDb.authorizedAccounts)) {
        cachedDb.authorizedAccounts = [];
        modified = true;
      }
      const adminAcc = cachedDb.authorizedAccounts.find(
        a => a.email.toLowerCase() === FIRST_ADMIN_EMAIL.toLowerCase()
      );
      if (!adminAcc) {
        cachedDb.authorizedAccounts.unshift({
          id: 'acc_first_admin',
          email: FIRST_ADMIN_EMAIL.toLowerCase(),
          onbCode: 'DTHANG',
          role: 'admin',
          status: 'ACTIVE',
          canEditBonus: true,
          canManageAllocation: true,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        });
        modified = true;
      } else {
        if (adminAcc.status !== 'ACTIVE' || adminAcc.role !== 'admin') {
          adminAcc.status = 'ACTIVE';
          adminAcc.role = 'admin';
          adminAcc.canEditBonus = true;
          adminAcc.canManageAllocation = true;
          modified = true;
        }
      }

      if (cachedDb.config && cachedDb.config.adminEmail.toLowerCase() !== FIRST_ADMIN_EMAIL.toLowerCase()) {
        cachedDb.config.adminEmail = FIRST_ADMIN_EMAIL.toLowerCase();
        cachedDb.config.adminOnbCode = 'DTHANG';
        modified = true;
      }

      if (modified) {
        writeDatabaseSync(cachedDb);
      }
    }
    return cachedDb!;
  } catch (err) {
    console.error('Failed to parse database, falling back to initial data', err);
    const initial = getInitialData();
    writeDatabaseSync(initial);
    cachedDb = initial;
    return cachedDb;
  }
}

export function writeDatabaseSync(data: DatabaseSchema) {
  const tmpFile = `${DB_FILE}.tmp.${Date.now()}`;
  fs.writeFileSync(tmpFile, JSON.stringify(data, null, 2), 'utf-8');
  fs.renameSync(tmpFile, DB_FILE);
  cachedDb = data;
  try {
    lastDbMtime = fs.statSync(DB_FILE).mtimeMs;
  } catch {
    // ignore
  }
}

export type DbChangeListener = (changeType: string, meta?: any) => void;
const changeListeners: DbChangeListener[] = [];

export function onDbChange(listener: DbChangeListener): () => void {
  changeListeners.push(listener);
  return () => {
    const idx = changeListeners.indexOf(listener);
    if (idx !== -1) changeListeners.splice(idx, 1);
  };
}

export function notifyDbChange(changeType: string, meta?: any) {
  changeListeners.forEach(fn => {
    try {
      fn(changeType, meta);
    } catch (e) {
      console.error('Error in onDbChange listener', e);
    }
  });
}

export async function updateDatabase(
  updater: (db: DatabaseSchema) => void | Promise<void>
): Promise<DatabaseSchema> {
  const op = async (): Promise<void> => {
    const current = readDatabase();
    await updater(current);
    writeDatabaseSync(current);
    notifyDbChange('DB_UPDATED');
  };

  writeQueue = writeQueue.then(op, op);
  await writeQueue;
  return readDatabase();
}

export function getCurrentVietnamMonth(): string {
  // Returns current month YYYY-MM according to Asia/Ho_Chi_Minh
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
    month: '2-digit'
  });
  return formatter.format(now); // e.g. "2026-10"
}

export type MonthOperationalStatus = 'OPEN' | 'LOCKED' | 'REOPENED';

export function getMonthLockStatus(monthYear: string, config: AppConfig): {
  status: MonthOperationalStatus;
  label: 'Đang mở' | 'Đã khóa' | 'Mở lại để điều chỉnh';
  isLocked: boolean;
  isReopened: boolean;
} {
  const currentMonth = getCurrentVietnamMonth();
  const isExplicitLocked = Array.isArray(config?.systemLockedMonths) && config.systemLockedMonths.includes(monthYear);
  const isReopened = Array.isArray(config?.reopenedMonths) && config.reopenedMonths.includes(monthYear);

  if (isExplicitLocked) {
    return { status: 'LOCKED', label: 'Đã khóa', isLocked: true, isReopened: false };
  }
  if (isReopened) {
    return { status: 'REOPENED', label: 'Mở lại để điều chỉnh', isLocked: false, isReopened: true };
  }
  if (monthYear < currentMonth) {
    return { status: 'LOCKED', label: 'Đã khóa', isLocked: true, isReopened: false };
  }
  return { status: 'OPEN', label: 'Đang mở', isLocked: false, isReopened: false };
}

export function isMonthLocked(monthYear: string, config: AppConfig): boolean {
  return getMonthLockStatus(monthYear, config).isLocked;
}

export function isMonthReopened(monthYear: string, config: AppConfig): boolean {
  return getMonthLockStatus(monthYear, config).isReopened;
}

export function canModifyMonthData(
  monthYear: string,
  config: AppConfig,
  session: { role?: string; isMasterAdmin?: boolean }
): { allowed: boolean; reason?: string } {
  const info = getMonthLockStatus(monthYear, config);
  const isAdmin = Boolean(session?.isMasterAdmin || session?.role === 'admin');

  if (info.isLocked) {
    return {
      allowed: false,
      reason: `Tháng ${monthYear} đã bị khóa sổ dữ liệu (Chế độ Chỉ Đọc). Kể cả Quản trị viên cũng cần mở sổ trước khi chỉnh sửa hoặc xóa dữ liệu!`
    };
  }

  if (info.isReopened) {
    if (!isAdmin) {
      return {
        allowed: false,
        reason: `Tháng ${monthYear} là kỳ cũ được mở lại để Quản trị viên điều chỉnh dữ liệu. Tài khoản nhân sự thông thường chỉ có quyền tra cứu!`
      };
    }
    return { allowed: true };
  }

  return { allowed: true };
}

export function ensureScheduleWorkForms(db: DatabaseSchema) {
  if (!db.scheduleWorkForms || !Array.isArray(db.scheduleWorkForms)) {
    db.scheduleWorkForms = JSON.parse(JSON.stringify(DEFAULT_SCHEDULE_WORK_FORMS));
  }
}

export function ensureTrainingModules(db: DatabaseSchema) {
  if (!db.trainingModules || !Array.isArray(db.trainingModules)) {
    if (!db.isTrainingModulesInitialized) {
      db.trainingModules = JSON.parse(JSON.stringify(DEFAULT_TRAINING_MODULES));
      db.isTrainingModulesInitialized = true;
    } else {
      db.trainingModules = [];
    }
  } else {
    if (!db.isTrainingModulesInitialized) {
      db.isTrainingModulesInitialized = true;
    }
  }
}

export function ensureRecurringTrainingSchedules(db: DatabaseSchema) {
  if (!db.recurringTrainingSchedules || !Array.isArray(db.recurringTrainingSchedules)) {
    if (!db.isRecurringTrainingInitialized) {
      db.recurringTrainingSchedules = JSON.parse(JSON.stringify(DEFAULT_RECURRING_SCHEDULES));
      db.isRecurringTrainingInitialized = true;
    } else {
      db.recurringTrainingSchedules = [];
    }
  } else {
    if (!db.isRecurringTrainingInitialized) {
      db.isRecurringTrainingInitialized = true;
    }
  }
}

export function ensureModuleInChargeMembers(db: DatabaseSchema) {
  if (!db.moduleInChargeMembers || !Array.isArray(db.moduleInChargeMembers)) {
    db.moduleInChargeMembers = [];
  }
}

export function ensureCancelledOccurrenceKeys(db: DatabaseSchema) {
  if (!db.cancelledOccurrenceKeys || !Array.isArray(db.cancelledOccurrenceKeys)) {
    db.cancelledOccurrenceKeys = [];
  }
}

export function getVietnamWeekInfo(dateStr: string): {
  dayOfWeek: number;
  dayOfWeekName: string;
  weekNumber: number;
  weekLabel: string;
} {
  if (!dateStr || !dateStr.includes('-')) {
    return { dayOfWeek: 2, dayOfWeekName: 'Thứ 2', weekNumber: 1, weekLabel: 'Tuần 1' };
  }
  const [y, m, d] = dateStr.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d, 12, 0, 0));
  const jsDay = dt.getUTCDay();
  const dayOfWeek = jsDay === 0 ? 8 : jsDay + 1; // 2=T2, ..., 8=CN
  const dayOfWeekName = dayOfWeek === 8 ? 'Chủ nhật' : `Thứ ${dayOfWeek}`;

  // Monday of this week (Thứ 2)
  const monDiff = dayOfWeek - 2;
  const monday = new Date(Date.UTC(y, m - 1, d - monDiff, 12, 0, 0));
  const sunday = new Date(Date.UTC(y, m - 1, d - monDiff + 6, 12, 0, 0));

  // ISO Week Number
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

  return { dayOfWeek, dayOfWeekName, weekNumber, weekLabel };
}

export function calculateTrainingClassScore(
  db: DatabaseSchema,
  moduleCode: string,
  classDate?: string
): {
  score: number;
  unit: string;
  formula: string;
  hasReferenceScore: boolean;
} {
  // 1. Find workType for Centralized Training: code === 'ĐTTT' or isTraining === true
  const wt = (db.workTypes || []).find(w => w.code === 'ĐTTT' || w.name === 'Đào tạo tập trung');
  const unit = wt?.unit || 'Buổi';

  // 2. Look in referenceScores for matching workTypeCode === 'ĐTTT'
  const dateFormatted = classDate || '2026-10-01';
  const matchingRefs = (db.referenceScores || []).filter(rs => {
    if (rs.isActive === false) return false;
    if (rs.workTypeCode !== 'ĐTTT') return false;
    if (rs.effectiveFrom && rs.effectiveFrom > dateFormatted) return false;
    if (rs.effectiveTo && rs.effectiveTo < dateFormatted) return false;
    return true;
  });

  const specificRef = matchingRefs.find(rs => rs.productCode && rs.productCode.toUpperCase() === moduleCode.toUpperCase());
  const fallbackRef = matchingRefs.find(rs => !rs.productCode);

  let rawScore: number | undefined;
  if (specificRef && specificRef.suggestedScore > 0) {
    rawScore = specificRef.suggestedScore;
  } else if (fallbackRef && fallbackRef.suggestedScore > 0) {
    rawScore = fallbackRef.suggestedScore;
  } else if (wt && wt.defaultScorePerUnit && wt.defaultScorePerUnit > 0) {
    rawScore = wt.defaultScorePerUnit;
  }

  if (rawScore === undefined || rawScore <= 0) {
    return {
      score: 0,
      unit,
      formula: 'Chưa có điểm tham chiếu tại Core',
      hasReferenceScore: false
    };
  }

  // Unit conversion according to requirements:
  // Core cấu hình điểm/ngày: 1 buổi = 0.5 ngày, điểm gói = 0.5 * điểm/ngày
  // Core cấu hình điểm/buổi: 1 buổi = lấy đúng điểm buổi
  const isDayUnit = unit.toLowerCase().includes('ngày') || unit.toLowerCase().includes('day');
  if (isDayUnit) {
    const finalScore = Math.round(0.5 * rawScore * 100) / 100;
    return {
      score: finalScore,
      unit: 'Ngày',
      formula: `0,5 ngày × ${rawScore}đ/ngày = ${finalScore} điểm`,
      hasReferenceScore: true
    };
  } else {
    return {
      score: rawScore,
      unit: 'Buổi',
      formula: `1 buổi = ${rawScore} điểm`,
      hasReferenceScore: true
    };
  }
}

// Initial Data builder
import { getInitialSeedData } from './seedData';

export function getInitialData(): DatabaseSchema {
  return getInitialSeedData();
}
