import express from 'express';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import {
  readDatabase,
  updateDatabase,
  getCurrentVietnamMonth,
  isMonthLocked,
  isMonthReopened,
  getMonthLockStatus,
  canModifyMonthData,
  DatabaseSchema,
  ensureScheduleWorkForms,
  ensureTrainingModules,
  ensureRecurringTrainingSchedules,
  ensureModuleInChargeMembers,
  ensureCancelledOccurrenceKeys,
  getVietnamWeekInfo,
  calculateTrainingClassScore,
  DEFAULT_PACKAGE_CORE_CONFIG,
  FIRST_ADMIN_EMAIL,
  writeDatabaseSync,
  onDbChange
} from './server/db';
import { authenticateToken } from './server/authService';

declare global {
  namespace Express {
    interface Request {
      userSession?: CurrentUserSession;
      userAccount?: AuthorizedAccount;
    }
  }
}
import { computeWorkAllocationData } from './src/utils/workAllocationCalculations';
import {
  ONBMember,
  ONBGroup,
  ScorecardRow,
  AuditLog,
  CurrentUserSession,
  AuthorizedAccount,
  PointSplit,
  GroupId,
  WorkSchedule,
  ScheduleTransferLog,
  Customer,
  CustomerPackage,
  PackageDetailRow,
  PackageCoreConfig,
  MonthlyBonusPool,
  ScheduleWorkForm,
  WorkTypeCatalog,
  ProductCatalog,
  ReferenceScore,
  TrainingModuleCatalog,
  TrainingPriorityRegistration,
  TrainingPackage,
  SessionOfDay,
  ModuleInChargeMember,
  RecurringTrainingSchedule,
  DEFAULT_RECURRING_SCHEDULES,
  CleanupAuditLog
} from './src/types';
import {
  createBackupSnapshot,
  listBackups,
  readBackupFile,
  deleteBackupFile,
  initAutomaticBackupWorker
} from './server/backupService';
import {
  exportSchedulesToCsv,
  exportProgressToCsv,
  exportPackagesToCsv
} from './server/exportService';
import {
  calculatePackageScore,
  resolveMemberGroupAtDate,
  cleanTaxCode
} from './src/utils/packageScoring';
import {
  computeScorecardData,
  categorizeProgressTask,
  isDemoPocTienVeWorkType
} from './src/utils/scorecardCalculations';

function findExistingLeaderClaim(
  packages: CustomerPackage[],
  members: ONBMember[],
  taxCode: string,
  excludeDetailId?: string
): { onbCode: string; memberName: string; packageCode: string; moduleName: string; monthYear: string; packageId: string; detailId: string } | null {
  const cleanTargetTax = cleanTaxCode(taxCode);
  if (!cleanTargetTax) return null;

  for (const pkg of packages) {
    if (cleanTaxCode(pkg.taxCode) !== cleanTargetTax) continue;
    if (!pkg.details || !Array.isArray(pkg.details)) continue;

    for (const d of pkg.details) {
      if (excludeDetailId && d.id === excludeDetailId) continue;
      if (d.leaderPlatforms && Number(d.leaderPlatforms) >= 2) {
        const mem = members.find(m => m.code === d.onbCode);
        return {
          onbCode: d.onbCode,
          memberName: mem?.fullName || mem?.displayName || d.onbCode,
          packageCode: pkg.packageCode || 'Gói tiếp nhận',
          moduleName: d.moduleName || d.moduleCode || 'Module',
          monthYear: pkg.monthYear || pkg.receptionDate?.slice(0, 7) || 'N/A',
          packageId: pkg.id,
          detailId: d.id
        };
      }
    }
  }
  return null;
}

function ensureGroups(db: DatabaseSchema) {
  if (!db.groups || !Array.isArray(db.groups)) {
    db.groups = [
      { id: 'grp_1', code: 'NHOM_1', name: 'Nhóm 1', order: 1, isActive: true, description: 'Nhóm nghiệp vụ 1' },
      { id: 'grp_2', code: 'NHOM_2', name: 'Nhóm 2', order: 2, isActive: true, description: 'Nhóm nghiệp vụ 2' },
      { id: 'grp_3', code: 'NHOM_3', name: 'Nhóm 3', order: 3, isActive: true, description: 'Nhóm nghiệp vụ 3' }
    ];
  }
  // Ensure all members have valid groupId linked to groups
  if (db.members && Array.isArray(db.members)) {
    db.members.forEach(m => {
      if (!m.groupId) {
        const found = db.groups.find(g => g.name === m.currentGroup);
        m.groupId = found ? found.id : (db.groups[0]?.id || 'grp_1');
      }
    });
  }
}

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Helper: Auth middleware and session builder
  const requireAuth = async (req: express.Request, res: express.Response, next: express.NextFunction) => {
    const db = readDatabase();
    const authHeader = req.headers.authorization;
    const result = await authenticateToken(authHeader, db);

    if (!result.success) {
      return res.status(result.status).json({
        error: result.error,
        code: result.code,
        email: result.email
      });
    }

    req.userSession = result.session;
    req.userAccount = result.account;
    next();
  };

  const requireAdmin = (req: express.Request, res: express.Response, next: express.NextFunction) => {
    if (!req.userSession || (!req.userSession.isMasterAdmin && req.userSession.role !== 'admin')) {
      return res.status(403).json({
        error: 'Quyền truy cập bị từ chối. Chỉ Quản trị viên mới có thể thực hiện thao tác này.',
        code: 'FORBIDDEN'
      });
    }
    next();
  };

  const getSession = (req: express.Request, db: DatabaseSchema): CurrentUserSession => {
    if (req.userSession) {
      return req.userSession;
    }
    const adminMember = db.members.find(m => m.email?.toLowerCase() === FIRST_ADMIN_EMAIL.toLowerCase()) || db.members[0];
    return {
      email: FIRST_ADMIN_EMAIL.toLowerCase(),
      onbCode: adminMember?.code || 'DTHANG',
      fullName: adminMember?.fullName || 'Từ Đức Thắng',
      role: 'admin',
      isMasterAdmin: true,
      canEditBonus: true,
      canManageAllocation: true
    };
  };

  const addAuditLog = (
    db: DatabaseSchema,
    session: CurrentUserSession,
    action: AuditLog['action'],
    entity: AuditLog['entity'],
    entityId: string,
    description: string,
    oldValue?: any,
    newValue?: any
  ) => {
    const log: AuditLog = {
      id: `log_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      timestamp: new Date().toISOString(),
      action,
      entity,
      entityId,
      onbCode: session.onbCode,
      userName: session.fullName,
      description,
      oldValue,
      newValue
    };
    db.auditLogs.unshift(log);
    if (db.auditLogs.length > 500) {
      db.auditLogs.pop();
    }
  };

  // 1. Session Endpoint (Public verification endpoint that returns auth status)
  app.get('/api/session', async (req, res) => {
    const db = readDatabase();
    const authHeader = req.headers.authorization;
    if (!authHeader) {
      return res.status(401).json({
        authenticated: false,
        authorized: false,
        error: 'Chưa đăng nhập. Vui lòng đăng nhập bằng Google.',
        code: 'UNAUTHORIZED'
      });
    }

    const result = await authenticateToken(authHeader, db);
    if (!result.success) {
      return res.status(result.status).json({
        authenticated: result.code !== 'UNAUTHORIZED' && result.code !== 'INVALID_TOKEN',
        authorized: false,
        error: result.error,
        code: result.code,
        email: result.email
      });
    }

    res.json({
      authenticated: true,
      authorized: true,
      session: result.session,
      account: result.account,
      currentVietnamMonth: getCurrentVietnamMonth()
    });
  });

  // Protect ALL subsequent /api endpoints: Token verification + Account active authorization
  app.use('/api', (req, res, next) => {
    if (req.path === '/session' && req.method === 'GET') {
      return next();
    }
    return requireAuth(req, res, next);
  });

  // ACCOUNTS MANAGEMENT APIS (Access Control - Admin Only)
  app.get('/api/accounts', requireAdmin, (req, res) => {
    const db = readDatabase();
    res.json({ accounts: db.authorizedAccounts || [] });
  });

  app.post('/api/accounts', requireAdmin, (req, res) => {
    const db = readDatabase();
    const session = req.userSession!;
    const { email, onbCode, role, status, canEditBonus, canManageAllocation } = req.body;

    const cleanEmail = (email || '').toLowerCase().trim();
    if (!cleanEmail || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(cleanEmail)) {
      return res.status(400).json({ error: 'Địa chỉ email Google không hợp lệ.' });
    }

    if (!Array.isArray(db.authorizedAccounts)) {
      db.authorizedAccounts = [];
    }

    if (db.authorizedAccounts.some(a => a.email.toLowerCase() === cleanEmail)) {
      return res.status(400).json({ error: `Email "${cleanEmail}" đã tồn tại trong danh sách tài khoản được phép sử dụng.` });
    }

    const member = db.members.find(m => m.code === onbCode);
    if (!member) {
      return res.status(400).json({ error: 'Mã nhân sự liên kết không hợp lệ.' });
    }

    const newAccount: AuthorizedAccount = {
      id: `acc_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      email: cleanEmail,
      onbCode: member.code,
      role: role === 'admin' ? 'admin' : 'user',
      status: status === 'LOCKED' ? 'LOCKED' : 'ACTIVE',
      canEditBonus: role === 'admin' ? true : Boolean(canEditBonus),
      canManageAllocation: role === 'admin' ? true : Boolean(canManageAllocation),
      displayName: member.fullName,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    db.authorizedAccounts.push(newAccount);
    writeDatabaseSync(db);

    addAuditLog(
      db,
      session,
      'CREATE',
      'CORE',
      newAccount.id,
      `Thêm tài khoản cấp phép: ${cleanEmail} (Nhân sự: ${member.fullName}, Vai trò: ${newAccount.role}, Trạng thái: ${newAccount.status})`,
      null,
      newAccount
    );

    res.json({ account: newAccount });
  });

  app.put('/api/accounts/:id', requireAdmin, (req, res) => {
    const db = readDatabase();
    const session = req.userSession!;
    const { id } = req.params;
    const { onbCode, role, status, canEditBonus, canManageAllocation } = req.body;

    if (!Array.isArray(db.authorizedAccounts)) {
      db.authorizedAccounts = [];
    }

    const account = db.authorizedAccounts.find(a => a.id === id);
    if (!account) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
    }

    // Protection for first admin
    if (account.email.toLowerCase() === FIRST_ADMIN_EMAIL.toLowerCase()) {
      if (status === 'LOCKED') {
        return res.status(400).json({ error: 'Không thể khóa tài khoản Quản trị viên chính ban đầu.' });
      }
      if (role === 'user') {
        return res.status(400).json({ error: 'Không thể hạ quyền Quản trị viên chính ban đầu.' });
      }
    }

    // Protection against self-demotion or self-lockout
    if (account.email.toLowerCase() === session.email.toLowerCase()) {
      if (status === 'LOCKED') {
        return res.status(400).json({ error: 'Bạn không thể tự khóa tài khoản của chính mình.' });
      }
      if (role === 'user' && account.role === 'admin') {
        return res.status(400).json({ error: 'Bạn không thể tự hạ quyền quản trị của chính mình.' });
      }
    }

    if (onbCode) {
      const member = db.members.find(m => m.code === onbCode);
      if (!member) {
        return res.status(400).json({ error: 'Mã nhân sự liên kết không hợp lệ.' });
      }
      account.onbCode = member.code;
      account.displayName = member.fullName;
    }

    const oldSnapshot = { ...account };

    if (role === 'admin' || role === 'user') {
      account.role = role;
    }
    if (status === 'ACTIVE' || status === 'LOCKED') {
      account.status = status;
    }
    if (account.role === 'admin') {
      account.canEditBonus = true;
      account.canManageAllocation = true;
    } else {
      if (canEditBonus !== undefined) account.canEditBonus = Boolean(canEditBonus);
      if (canManageAllocation !== undefined) account.canManageAllocation = Boolean(canManageAllocation);
    }
    account.updatedAt = new Date().toISOString();

    writeDatabaseSync(db);

    addAuditLog(
      db,
      session,
      'UPDATE',
      'CORE',
      account.id,
      `Cập nhật tài khoản ${account.email}: Vai trò=${account.role}, Trạng thái=${account.status}`,
      oldSnapshot,
      account
    );

    res.json({ account });
  });

  app.delete('/api/accounts/:id', requireAdmin, (req, res) => {
    const db = readDatabase();
    const session = req.userSession!;
    const { id } = req.params;

    if (!Array.isArray(db.authorizedAccounts)) {
      db.authorizedAccounts = [];
    }

    const account = db.authorizedAccounts.find(a => a.id === id);
    if (!account) {
      return res.status(404).json({ error: 'Không tìm thấy tài khoản.' });
    }

    if (account.email.toLowerCase() === FIRST_ADMIN_EMAIL.toLowerCase()) {
      return res.status(400).json({ error: 'Không thể xóa tài khoản Quản trị viên chính ban đầu.' });
    }

    if (account.email.toLowerCase() === session.email.toLowerCase()) {
      return res.status(400).json({ error: 'Bạn không thể tự xóa tài khoản đang đăng nhập.' });
    }

    const oldSnapshot = { ...account };
    db.authorizedAccounts = db.authorizedAccounts.filter(a => a.id !== id);
    writeDatabaseSync(db);

    addAuditLog(
      db,
      session,
      'DELETE',
      'CORE',
      id,
      `Xóa quyền truy cập tài khoản: ${account.email} (${account.onbCode})`,
      oldSnapshot,
      null
    );

    res.json({ success: true });
  });

  app.get('/api/bootstrap', (req, res) => {
    const db = readDatabase();
    ensureGroups(db);
    ensureScheduleWorkForms(db);
    const session = getSession(req, db);
    const sortedGroups = [...db.groups].sort((a, b) => a.order - b.order);
    const sortedWorkForms = [...db.scheduleWorkForms].sort((a, b) => a.order - b.order);
    res.json({
      session,
      config: db.config,
      currentVietnamMonth: getCurrentVietnamMonth(),
      groups: sortedGroups,
      scheduleWorkForms: sortedWorkForms,
      members: db.members,
      products: db.products,
      workTypes: db.workTypes,
      referenceScores: db.referenceScores,
      packageCoreConfig: db.packageCoreConfig || DEFAULT_PACKAGE_CORE_CONFIG
    });
  });

  // Package Core Config APIs
  app.get('/api/core/package-config', (req, res) => {
    const db = readDatabase();
    res.json({ config: db.packageCoreConfig || DEFAULT_PACKAGE_CORE_CONFIG });
  });

  function checkPackageConfigItemUsage(
    db: DatabaseSchema,
    section: string,
    item: any
  ): { isUsed: boolean; reason: string; count: number } {
    if (!item) return { isUsed: false, reason: '', count: 0 };
    if (section === 'sources') {
      const pkgs = db.packages.filter(p => p.sourceCode === item.code || p.sourceName === item.name);
      return { isUsed: pkgs.length > 0, reason: `${pkgs.length} gói tiếp nhận sử dụng nguồn này`, count: pkgs.length };
    }
    if (section === 'classifications') {
      const pkgs = db.packages.filter(p => p.packageClass === item.name || p.packageClass === item.code);
      return { isUsed: pkgs.length > 0, reason: `${pkgs.length} gói tiếp nhận sử dụng phân loại này`, count: pkgs.length };
    }
    if (section === 'customerTiers') {
      const pkgs = db.packages.filter(p => p.customerTier === item.code || p.customerTier === item.name);
      return { isUsed: pkgs.length > 0, reason: `${pkgs.length} gói tiếp nhận có phân hạng này`, count: pkgs.length };
    }
    if (section === 'workTypes') {
      const pkgs = db.packages.filter(p => p.workForm === item.name || p.workForm === item.code);
      return { isUsed: pkgs.length > 0, reason: `${pkgs.length} gói tiếp nhận sử dụng loại hình này`, count: pkgs.length };
    }
    if (section === 'leaderPlatforms') {
      const pkgs = db.packages.filter(p => p.details && p.details.some(d => Number(d.leaderPlatforms) === Number(item.platforms)));
      return { isUsed: pkgs.length > 0, reason: `${pkgs.length} gói tiếp nhận có khai báo Leader ${item.platforms} nền tảng`, count: pkgs.length };
    }
    if (section === 'modules') {
      const pkgs = db.packages.filter(p => p.details && p.details.some(d => d.moduleCode === item.code || d.moduleName === item.name));
      return { isUsed: pkgs.length > 0, reason: `${pkgs.length} gói tiếp nhận có module này`, count: pkgs.length };
    }
    return { isUsed: false, reason: '', count: 0 };
  }

  app.put('/api/core/package-config', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền sửa cấu hình KH & Gói tiếp nhận trong Core.' });
    }

    const { sources, classifications, customerTiers, workTypes, leaderPlatforms, modules } = req.body;
    const currentCfg = db.packageCoreConfig || DEFAULT_PACKAGE_CORE_CONFIG;

    // Check if any item was deleted in incoming payload and whether it had existing packages
    const sectionsToCheck: Array<{ key: keyof PackageCoreConfig; name: string; incoming?: any[] }> = [
      { key: 'sources', name: 'Nguồn tiếp nhận', incoming: sources },
      { key: 'classifications', name: 'Phân loại gói', incoming: classifications },
      { key: 'customerTiers', name: 'Phân hạng khách hàng', incoming: customerTiers },
      { key: 'workTypes', name: 'Loại hình tiếp nhận', incoming: workTypes },
      { key: 'leaderPlatforms', name: 'Điểm Leader nền tảng', incoming: leaderPlatforms },
      { key: 'modules', name: 'Module tiếp nhận', incoming: modules }
    ];

    for (const sec of sectionsToCheck) {
      if (Array.isArray(sec.incoming)) {
        const existingList = (currentCfg[sec.key] as any[]) || [];
        const incomingIds = new Set(sec.incoming.map((item: any) => item.id));
        for (const oldItem of existingList) {
          if (!incomingIds.has(oldItem.id)) {
            const usage = checkPackageConfigItemUsage(db, sec.key as string, oldItem);
            if (usage.isUsed) {
              return res.status(400).json({
                error: `Danh mục này đã có dữ liệu phát sinh nên không thể xóa. Vui lòng chuyển sang trạng thái Ngưng sử dụng. (Phát sinh: ${usage.reason})`
              });
            }
          }
        }
      }
    }

    let updatedConfig: PackageCoreConfig | null = null;

    await updateDatabase(draft => {
      if (!draft.packageCoreConfig) {
        draft.packageCoreConfig = JSON.parse(JSON.stringify(DEFAULT_PACKAGE_CORE_CONFIG));
      }
      const cfg = draft.packageCoreConfig!;
      const oldVal = JSON.parse(JSON.stringify(cfg));

      // Propagate code/name updates to existing packages
      if (Array.isArray(sources)) {
        sources.forEach((newS: any) => {
          const oldS = cfg.sources?.find(s => s.id === newS.id);
          if (oldS && (oldS.code !== newS.code || oldS.name !== newS.name)) {
            draft.packages.forEach(p => {
              if (p.sourceCode === oldS.code) {
                p.sourceCode = newS.code;
                p.sourceName = newS.name;
              }
            });
          }
        });
        cfg.sources = sources;
      }

      if (Array.isArray(classifications)) {
        classifications.forEach((newC: any) => {
          const oldC = cfg.classifications?.find(c => c.id === newC.id);
          if (oldC && (oldC.name !== newC.name || oldC.code !== newC.code)) {
            draft.packages.forEach(p => {
              if (p.packageClass === oldC.name || p.packageClass === oldC.code) {
                p.packageClass = newC.name;
              }
            });
          }
        });
        cfg.classifications = classifications;
      }

      if (Array.isArray(customerTiers)) {
        customerTiers.forEach((newT: any) => {
          const oldT = cfg.customerTiers?.find(t => t.id === newT.id);
          if (oldT && (oldT.code !== newT.code || oldT.name !== newT.name)) {
            draft.packages.forEach(p => {
              if (p.customerTier === oldT.code || p.customerTier === oldT.name) {
                p.customerTier = newT.code;
              }
            });
          }
        });
        cfg.customerTiers = customerTiers;
      }

      if (Array.isArray(workTypes)) {
        workTypes.forEach((newW: any) => {
          const oldW = cfg.workTypes?.find(w => w.id === newW.id);
          if (oldW && (oldW.name !== newW.name || oldW.code !== newW.code)) {
            draft.packages.forEach(p => {
              if (p.workForm === oldW.name || p.workForm === oldW.code) {
                p.workForm = newW.name;
              }
            });
          }
        });
        cfg.workTypes = workTypes;
      }

      if (Array.isArray(leaderPlatforms)) cfg.leaderPlatforms = leaderPlatforms;

      if (Array.isArray(modules)) {
        modules.forEach((newM: any) => {
          const oldM = cfg.modules?.find(m => m.id === newM.id);
          if (oldM && (oldM.code !== newM.code || oldM.name !== newM.name)) {
            draft.packages.forEach(p => {
              if (p.details) {
                p.details.forEach(d => {
                  if (d.moduleCode === oldM.code) {
                    d.moduleCode = newM.code;
                    d.moduleName = newM.name;
                  }
                });
              }
            });
          }
        });
        cfg.modules = modules;
      }

      draft.packageCoreConfig = cfg;
      updatedConfig = cfg;
      addAuditLog(draft, session, 'UPDATE', 'CORE', 'packageCoreConfig', 'Cập nhật cấu hình phân hệ KH & Gói tiếp nhận trong Core', oldVal, updatedConfig);
    });

    res.json({ success: true, config: updatedConfig });
  });

  // Dedicated single item delete for package config with usage check
  app.delete('/api/core/package-config/:section/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền xóa cấu hình trong Core.' });
    }

    const { section, id } = req.params;
    const cfg = db.packageCoreConfig || JSON.parse(JSON.stringify(DEFAULT_PACKAGE_CORE_CONFIG));
    const list = (cfg as any)[section];

    if (!Array.isArray(list)) {
      return res.status(400).json({ error: `Phân hệ cấu hình ${section} không hợp lệ.` });
    }

    const item = list.find((it: any) => it.id === id);
    if (!item) {
      return res.status(404).json({ error: 'Không tìm thấy bản ghi cấu hình cần xóa.' });
    }

    // Check usage in packages
    const usage = checkPackageConfigItemUsage(db, section, item);
    if (usage.isUsed) {
      return res.status(400).json({
        error: `Danh mục này đã có dữ liệu phát sinh nên không thể xóa. Vui lòng chuyển sang trạng thái Ngưng sử dụng. (Phát sinh: ${usage.reason})`
      });
    }

    await updateDatabase(draft => {
      if (!draft.packageCoreConfig) {
        draft.packageCoreConfig = JSON.parse(JSON.stringify(DEFAULT_PACKAGE_CORE_CONFIG));
      }
      const draftList = (draft.packageCoreConfig as any)[section];
      if (Array.isArray(draftList)) {
        (draft.packageCoreConfig as any)[section] = draftList.filter((it: any) => it.id !== id);
      }
      addAuditLog(draft, session, 'DELETE', 'CORE', id, `Xóa cấu hình ${section}: ${item.name || item.code || id}`);
    });

    res.json({ success: true });
  });

  // Group Management APIs (Admin Only for CUD)
  app.get('/api/core/groups', (req, res) => {
    const db = readDatabase();
    ensureGroups(db);
    const sortedGroups = [...db.groups].sort((a, b) => a.order - b.order);
    res.json({ groups: sortedGroups });
  });

  // Schedule Work Form Catalog Management (Core - Admin Only for CUD)
  app.get('/api/core/schedule-work-forms', (req, res) => {
    const db = readDatabase();
    ensureScheduleWorkForms(db);
    const sorted = [...db.scheduleWorkForms].sort((a, b) => a.order - b.order);
    res.json({ scheduleWorkForms: sorted });
  });

  app.post('/api/core/schedule-work-forms', async (req, res) => {
    const db = readDatabase();
    ensureScheduleWorkForms(db);
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền thêm hình thức lịch làm việc.' });
    }

    const { name, code, shortLabel, order, category, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tên hình thức không được để trống.' });
    }

    const trimmedName = name.trim();
    if (db.scheduleWorkForms.some(f => f.name.toLowerCase() === trimmedName.toLowerCase())) {
      return res.status(400).json({ error: `Hình thức "${trimmedName}" đã tồn tại trong Core.` });
    }

    const trimmedCode = (code || trimmedName.replace(/\s+/g, '_').toUpperCase()).trim();
    const newForm: ScheduleWorkForm = {
      id: `wf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code: trimmedCode,
      name: trimmedName,
      shortLabel: shortLabel?.trim() || trimmedCode,
      order: Number(order) || (db.scheduleWorkForms.length + 1),
      category: category === 'leave' ? 'leave' : 'work',
      isActive: true,
      description: description?.trim()
    };

    await updateDatabase(draft => {
      ensureScheduleWorkForms(draft);
      draft.scheduleWorkForms.push(newForm);
      addAuditLog(draft, session, 'CREATE', 'CORE', newForm.id, `Tạo hình thức lịch: ${newForm.name} (${newForm.category})`, null, newForm);
    });

    res.json({ success: true, scheduleWorkForm: newForm });
  });

  app.put('/api/core/schedule-work-forms/:id', async (req, res) => {
    const db = readDatabase();
    ensureScheduleWorkForms(db);
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền chỉnh sửa hình thức lịch làm việc.' });
    }

    const id = req.params.id;
    const { name, code, shortLabel, order, category, isActive, description } = req.body;

    const existing = db.scheduleWorkForms.find(f => f.id === id);
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy hình thức cần sửa.' });
    }

    let updatedForm: ScheduleWorkForm | null = null;
    await updateDatabase(draft => {
      ensureScheduleWorkForms(draft);
      const item = draft.scheduleWorkForms.find(f => f.id === id);
      if (item) {
        const oldVal = { ...item };
        if (name !== undefined) item.name = name.trim();
        if (code !== undefined) item.code = code.trim();
        if (shortLabel !== undefined) item.shortLabel = shortLabel.trim();
        if (order !== undefined) item.order = Number(order);
        if (category !== undefined) item.category = category === 'leave' ? 'leave' : 'work';
        if (isActive !== undefined) item.isActive = Boolean(isActive);
        if (description !== undefined) item.description = description;

        updatedForm = item;
        addAuditLog(draft, session, 'UPDATE', 'CORE', id, `Cập nhật hình thức lịch: ${item.name}`, oldVal, item);
      }
    });

    res.json({ success: true, scheduleWorkForm: updatedForm });
  });

  app.delete('/api/core/schedule-work-forms/:id', async (req, res) => {
    const db = readDatabase();
    ensureScheduleWorkForms(db);
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền xóa hình thức lịch làm việc.' });
    }

    const id = req.params.id;
    const item = db.scheduleWorkForms.find(f => f.id === id);
    if (!item) return res.status(404).json({ error: 'Không tìm thấy hình thức.' });

    // Check if used in ANY schedule (preserves history!)
    const scheduleCount = db.schedules.filter(s =>
      s.workFormId === id ||
      s.workTypeCode === item.name ||
      s.workTypeCode === item.code
    ).length;

    if (scheduleCount > 0) {
      return res.status(400).json({
        error: `Danh mục này đã có dữ liệu phát sinh nên không thể xóa. Vui lòng chuyển sang trạng thái Ngưng sử dụng. (Phát sinh: ${scheduleCount} lịch làm việc đã sử dụng)`
      });
    }

    await updateDatabase(draft => {
      ensureScheduleWorkForms(draft);
      draft.scheduleWorkForms = draft.scheduleWorkForms.filter(f => f.id !== id);
      addAuditLog(draft, session, 'DELETE', 'CORE', id, `Xóa hình thức lịch chưa từng sử dụng: ${item.name}`);
    });

    res.json({ success: true });
  });

  app.post('/api/core/groups', async (req, res) => {
    const db = readDatabase();
    ensureGroups(db);
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính (Từ Đức Thắng) mới có quyền tạo nhóm mới.' });
    }

    const { name, code, order, description } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ error: 'Tên nhóm không được để trống.' });
    }

    const trimmedName = name.trim();
    const groupCode = (code || trimmedName.replace(/\s+/g, '_').toUpperCase()).trim();

    if (db.groups.some(g => g.name.toLowerCase() === trimmedName.toLowerCase())) {
      return res.status(400).json({ error: `Nhóm "${trimmedName}" đã tồn tại.` });
    }
    if (db.groups.some(g => g.code.toLowerCase() === groupCode.toLowerCase())) {
      return res.status(400).json({ error: `Mã nhóm "${groupCode}" đã tồn tại.` });
    }

    const newGroup: ONBGroup = {
      id: `grp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code: groupCode,
      name: trimmedName,
      order: Number(order) || (db.groups.length + 1),
      isActive: true,
      description: description?.trim()
    };

    await updateDatabase(draft => {
      ensureGroups(draft);
      draft.groups.push(newGroup);
      addAuditLog(draft, session, 'CREATE', 'CORE', newGroup.id, `Tạo nhóm mới: ${newGroup.name}`, null, newGroup);
    });

    res.json({ success: true, group: newGroup });
  });

  app.put('/api/core/groups/:id', async (req, res) => {
    const db = readDatabase();
    ensureGroups(db);
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền chỉnh sửa nhóm.' });
    }

    const id = req.params.id;
    const { name, code, order, isActive, description } = req.body;

    const existing = db.groups.find(g => g.id === id);
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy nhóm cần sửa.' });
    }

    const oldName = existing.name;
    const newName = name !== undefined ? name.trim() : oldName;
    const newCode = code !== undefined ? code.trim() : existing.code;

    if (!newName) {
      return res.status(400).json({ error: 'Tên nhóm không được để trống.' });
    }

    // Check duplicate name excluding self
    if (db.groups.some(g => g.id !== id && g.name.toLowerCase() === newName.toLowerCase())) {
      return res.status(400).json({ error: `Tên nhóm "${newName}" đã tồn tại.` });
    }
    // Check duplicate code excluding self
    if (newCode && db.groups.some(g => g.id !== id && g.code.toLowerCase() === newCode.toLowerCase())) {
      return res.status(400).json({ error: `Mã nhóm "${newCode}" đã tồn tại.` });
    }

    let updatedGroup: ONBGroup | null = null;
    await updateDatabase(draft => {
      ensureGroups(draft);
      const grp = draft.groups.find(g => g.id === id);
      if (grp) {
        const oldVal = { ...grp };
        grp.name = newName;
        grp.code = newCode;
        if (order !== undefined) grp.order = Number(order);
        if (isActive !== undefined) grp.isActive = Boolean(isActive);
        if (description !== undefined) grp.description = description;

        // If group name changed, propagate display name to members in that group without breaking history
        if (oldName !== newName) {
          draft.members.forEach(m => {
            if (m.currentGroup === oldName || m.groupId === id) {
              m.currentGroup = newName;
              m.groupId = id;
            }
          });
        }

        updatedGroup = grp;
        addAuditLog(draft, session, 'UPDATE', 'CORE', id, `Cập nhật nhóm: ${oldName} -> ${newName}`, oldVal, grp);
      }
    });

    res.json({ success: true, group: updatedGroup });
  });

  app.delete('/api/core/groups/:id', async (req, res) => {
    const db = readDatabase();
    ensureGroups(db);
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền xóa nhóm.' });
    }

    const id = req.params.id;
    const grp = db.groups.find(g => g.id === id);
    if (!grp) return res.status(404).json({ error: 'Không tìm thấy nhóm.' });

    // Check if group has members or related history (schedules, training packages)
    const memberCount = db.members.filter(m => m.currentGroup === grp.name || m.groupId === id).length;
    const scheduleCount = db.schedules.filter(s => resolveMemberGroupAtDate(db.members, s.onbCode, s.date) === grp.name || (s as any).group === grp.name).length;
    const trainingClassCount = (db.trainingPackages || []).filter(p => p.assignedGroup === grp.name || (p as any).assignedGroupId === id).length;

    if (memberCount > 0 || scheduleCount > 0 || trainingClassCount > 0) {
      return res.status(400).json({
        error: `Danh mục này đã có dữ liệu phát sinh nên không thể xóa. Vui lòng chuyển sang trạng thái Ngưng sử dụng. (Phát sinh: ${memberCount} nhân sự, ${scheduleCount} lịch làm việc, ${trainingClassCount} lớp đào tạo liên quan)`
      });
    }

    await updateDatabase(draft => {
      ensureGroups(draft);
      draft.groups = draft.groups.filter(g => g.id !== id);
      addAuditLog(draft, session, 'DELETE', 'CORE', id, `Xóa nhóm trống chưa có dữ liệu: ${grp.name}`);
    });

    res.json({ success: true });
  });

  // 2. Core Management (Admin Only)
  app.get('/api/core/overview', (req, res) => {
    const db = readDatabase();
    res.json({
      config: db.config,
      members: db.members,
      products: db.products,
      workTypes: db.workTypes,
      referenceScores: db.referenceScores,
      totalSchedules: db.schedules.length,
      totalProgress: db.progress.length,
      totalPackages: db.packages.length
    });
  });

  app.put('/api/core/config', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính (Từ Đức Thắng) mới có quyền sửa cấu hình Core.' });
    }

    const { bonusManagers, allocationManagers, systemLockedMonths, initialDataImportLocked } = req.body;
    await updateDatabase(draft => {
      const oldCfg = { ...draft.config };
      if (bonusManagers !== undefined) draft.config.bonusManagers = bonusManagers;
      if (allocationManagers !== undefined) draft.config.allocationManagers = allocationManagers;
      if (systemLockedMonths !== undefined) draft.config.systemLockedMonths = systemLockedMonths;
      if (initialDataImportLocked !== undefined) draft.config.initialDataImportLocked = initialDataImportLocked;
      addAuditLog(draft, session, 'UPDATE', 'CORE', 'CONFIG', 'Cập nhật cấu hình quản trị phân quyền Core', oldCfg, draft.config);
    });

    res.json({ success: true, config: readDatabase().config });
  });

  app.post('/api/core/members', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền thêm nhân sự.' });
    }

    const { code, fullName, displayName, email, currentGroup, groupId, startDate, completedProducts, phone } = req.body;
    if (!code || !fullName || !email || (!currentGroup && !groupId)) {
      return res.status(400).json({ error: 'Thiếu thông tin nhân sự bắt buộc (Mã, Họ tên, Email, Nhóm).' });
    }

    const trimmedCode = code.trim().toUpperCase();
    if (db.members.some(m => m.code === trimmedCode)) {
      return res.status(400).json({ error: `Mã ONB ${trimmedCode} đã tồn tại trong hệ thống!` });
    }

    ensureGroups(db);
    const grp = db.groups.find(g => (groupId && g.id === groupId) || (currentGroup && g.name === currentGroup)) || db.groups[0];
    const assignedGroupId = grp?.id;
    const assignedGroupName = grp?.name || currentGroup || 'Nhóm 1';

    const newMember: ONBMember = {
      id: `ONB_${trimmedCode}`,
      code: trimmedCode,
      fullName: fullName.trim(),
      displayName: displayName?.trim() || fullName.trim(),
      shortCode: trimmedCode,
      email: email.trim(),
      groupId: assignedGroupId,
      currentGroup: assignedGroupName,
      groupHistory: [{
        groupId: assignedGroupId,
        group: assignedGroupName,
        fromDate: startDate || new Date().toISOString().slice(0, 10),
        note: 'Khởi tạo'
      }],
      startDate: startDate || new Date().toISOString().slice(0, 10),
      isActive: true,
      participateRandom: true,
      completedProducts: Array.isArray(completedProducts) ? completedProducts : [],
      phone
    };

    await updateDatabase(draft => {
      draft.members.push(newMember);
      addAuditLog(draft, session, 'CREATE', 'MEMBER', newMember.code, `Thêm nhân sự mới: ${newMember.fullName} (${newMember.code})`, null, newMember);
    });

    res.json({ success: true, member: newMember });
  });

  app.put('/api/core/members/:code', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền chỉnh sửa nhân sự.' });
    }

    const targetCode = req.params.code;
    const { code, fullName, displayName, email, currentGroup, isActive, inactiveDate, participateRandom, completedProducts, phone } = req.body;

    const existingMember = db.members.find(m => m.code === targetCode || m.id === targetCode);
    if (!existingMember) {
      return res.status(404).json({ error: 'Không tìm thấy nhân sự.' });
    }

    const newCode = code ? code.trim().toUpperCase() : existingMember.code;
    const oldCode = existingMember.code;

    if (!newCode) {
      return res.status(400).json({ error: 'Mã ONB không được để trống.' });
    }

    // Check duplicate code if code is changed (exclude current member by ID and oldCode)
    if (newCode !== oldCode) {
      if (db.members.some(m => m.code.toUpperCase() === newCode && m.id !== existingMember.id && m.code !== oldCode)) {
        return res.status(400).json({ error: `Mã ONB "${newCode}" đã tồn tại trên nhân sự khác.` });
      }
    }

    let updatedMember: ONBMember | null = null;
    await updateDatabase(draft => {
      const idx = draft.members.findIndex(m => m.code === oldCode || m.id === existingMember.id);
      if (idx === -1) return;

      const oldMem = { ...draft.members[idx] };
      const m = draft.members[idx];

      m.code = newCode;
      m.shortCode = newCode;

      if (fullName !== undefined) m.fullName = fullName.trim();
      if (displayName !== undefined) m.displayName = displayName.trim();
      if (email !== undefined) m.email = email.trim();
      if (phone !== undefined) m.phone = phone;
      if (participateRandom !== undefined) m.participateRandom = Boolean(participateRandom);
      if (completedProducts !== undefined) m.completedProducts = completedProducts;

      // Group change preservation:
      const newGroupId = req.body.groupId;
      const targetGroup = draft.groups.find(g => (newGroupId && g.id === newGroupId) || (currentGroup && g.name === currentGroup));
      const resolvedGroupName = targetGroup ? targetGroup.name : (currentGroup || m.currentGroup);
      const resolvedGroupId = targetGroup ? targetGroup.id : (newGroupId || m.groupId);

      if ((newGroupId && newGroupId !== m.groupId) || (currentGroup && currentGroup !== m.currentGroup)) {
        m.groupHistory = m.groupHistory || [];
        m.groupHistory.push({
          groupId: resolvedGroupId,
          group: resolvedGroupName,
          fromDate: new Date().toISOString().slice(0, 10),
          note: `Chuyển từ ${m.currentGroup} sang ${resolvedGroupName}`
        });
        m.groupId = resolvedGroupId;
        m.currentGroup = resolvedGroupName;
      }

      // Deactivation vs activation
      if (isActive !== undefined) {
        m.isActive = Boolean(isActive);
        if (!m.isActive) {
          m.inactiveDate = inactiveDate || new Date().toISOString().slice(0, 10);
        } else {
          m.inactiveDate = undefined;
        }
      }

      // Propagate newCode across all related records to preserve data integrity and historical links
      if (newCode !== oldCode) {
        // Schedules
        draft.schedules.forEach(s => {
          if (s.onbCode === oldCode) s.onbCode = newCode;
          if (Array.isArray(s.collaborators)) {
            s.collaborators = s.collaborators.map(c => c === oldCode ? newCode : c);
          }
          if (s.updatedBy === oldCode) s.updatedBy = newCode;
        });
        // Progress tasks
        draft.progress.forEach(p => {
          if (p.primaryOnbCode === oldCode) p.primaryOnbCode = newCode;
          if (Array.isArray(p.splits)) {
            p.splits.forEach(sp => {
              if (sp.onbCode === oldCode) sp.onbCode = newCode;
            });
          }
          if (p.updatedBy === oldCode) p.updatedBy = newCode;
        });
        // Packages
        draft.packages.forEach(pkg => {
          if (pkg.assignedOnbCode === oldCode) pkg.assignedOnbCode = newCode;
          if (Array.isArray(pkg.details)) {
            pkg.details.forEach(d => {
              if (d.onbCode === oldCode) d.onbCode = newCode;
            });
          }
          if (Array.isArray(pkg.splits)) {
            pkg.splits.forEach(sp => {
              if (sp.onbCode === oldCode) sp.onbCode = newCode;
            });
          }
          if (pkg.updatedBy === oldCode) pkg.updatedBy = newCode;
        });
        // Training packages
        if (Array.isArray(draft.trainingPackages)) {
          draft.trainingPackages.forEach(tp => {
            if (tp.assignedOnbCode === oldCode) tp.assignedOnbCode = newCode;
            if ((tp as any).updatedBy === oldCode) (tp as any).updatedBy = newCode;
          });
        }
        // Bonuses
        if (Array.isArray(draft.bonuses)) {
          draft.bonuses.forEach(b => {
            if (b.onbCode === oldCode) b.onbCode = newCode;
            if (b.updatedBy === oldCode) b.updatedBy = newCode;
          });
        }
        // Module In-Charge
        if (Array.isArray(draft.moduleInChargeMembers)) {
          draft.moduleInChargeMembers.forEach(ic => {
            if (ic.onbCode === oldCode) ic.onbCode = newCode;
          });
        }
        // Training Priority Registrations
        if (Array.isArray((draft as any).trainingPriorityRegistrations)) {
          (draft as any).trainingPriorityRegistrations.forEach((tpr: any) => {
            if (tpr.onbCode === oldCode) tpr.onbCode = newCode;
          });
        }
        // Config managers
        if (Array.isArray(draft.config.bonusManagers)) {
          draft.config.bonusManagers = draft.config.bonusManagers.map(c => c === oldCode ? newCode : c);
        }
        if (Array.isArray(draft.config.allocationManagers)) {
          draft.config.allocationManagers = draft.config.allocationManagers.map(c => c === oldCode ? newCode : c);
        }
        if (draft.config.adminOnbCode === oldCode) {
          draft.config.adminOnbCode = newCode;
        }
        // Audit logs
        if (Array.isArray(draft.auditLogs)) {
          draft.auditLogs.forEach(log => {
            if (log.onbCode === oldCode) log.onbCode = newCode;
          });
        }
      }

      updatedMember = m;
      addAuditLog(draft, session, 'UPDATE', 'MEMBER', newCode, `Cập nhật nhân sự: ${m.fullName} (${oldCode} -> ${newCode})`, oldMem, m);
    });

    if (!updatedMember) {
      return res.status(404).json({ error: 'Không tìm thấy nhân sự.' });
    }

    res.json({ success: true, member: updatedMember });
  });

  app.delete('/api/core/members/:code', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền xóa nhân sự.' });
    }

    const targetCode = req.params.code;
    const member = db.members.find(m => m.code === targetCode || m.id === targetCode);
    if (!member) return res.status(404).json({ error: 'Không tìm thấy nhân sự.' });

    const codeToMatch = member.code;

    // Check system admin constraint
    if (db.config.adminOnbCode === codeToMatch || db.config.adminEmail?.toLowerCase() === member.email?.toLowerCase()) {
      return res.status(400).json({
        error: 'Nhân sự này đang được cấu hình là Quản trị viên chính hệ thống (Master Admin), không thể xóa.'
      });
    }

    // Check Core permissions constraints
    if (Array.isArray(db.config.bonusManagers) && db.config.bonusManagers.includes(codeToMatch)) {
      return res.status(400).json({
        error: 'Nhân sự này đang được phân quyền Quản lý thưởng trong Phân quyền Core. Vui lòng gỡ phân quyền trước khi xóa.'
      });
    }
    if (Array.isArray(db.config.allocationManagers) && db.config.allocationManagers.includes(codeToMatch)) {
      return res.status(400).json({
        error: 'Nhân sự này đang được phân quyền Quản lý phân bổ trong Phân quyền Core. Vui lòng gỡ phân quyền trước khi xóa.'
      });
    }

    // Check actual operational business records (distinguishing empty or auto-generated records)
    const activeSchedules = (db.schedules || []).filter(s =>
      (s.onbCode === codeToMatch || (Array.isArray(s.collaborators) && s.collaborators.includes(codeToMatch))) &&
      s.status !== 'Đã hủy' &&
      Boolean(s.customerOrTask && s.customerOrTask.trim() && s.customerOrTask.trim() !== '-')
    );

    const activeProgress = (db.progress || []).filter(p =>
      (p.primaryOnbCode === codeToMatch || (Array.isArray(p.splits) && p.splits.some(sp => sp.onbCode === codeToMatch))) &&
      Boolean(p.taskName && p.taskName.trim())
    );

    const activePackages = (db.packages || []).filter(pkg =>
      pkg.assignedOnbCode === codeToMatch ||
      (Array.isArray(pkg.details) && pkg.details.some(d => d.onbCode === codeToMatch)) ||
      (Array.isArray(pkg.splits) && pkg.splits.some(sp => sp.onbCode === codeToMatch))
    );

    const activeTraining = (db.trainingPackages || []).filter(tp =>
      tp.assignedOnbCode === codeToMatch && Boolean(tp.contentTitle || (tp as any).moduleCode || tp.productCode)
    );

    const activeBonuses = (db.bonuses || []).filter(b =>
      b.onbCode === codeToMatch && b.amount !== undefined && b.amount !== null && b.amount > 0
    );

    const relatedList: string[] = [];
    if (activeSchedules.length > 0) relatedList.push(`Lịch làm việc (${activeSchedules.length} buổi)`);
    if (activeProgress.length > 0) relatedList.push(`Tiến độ chi tiết (${activeProgress.length} công việc)`);
    if (activePackages.length > 0) relatedList.push(`Khách hàng & Gói tiếp nhận (${activePackages.length} gói)`);
    if (activeTraining.length > 0) relatedList.push(`Lớp đào tạo tập trung (${activeTraining.length} lớp)`);
    if (activeBonuses.length > 0) relatedList.push(`Khoản thưởng hiệu quả (${activeBonuses.length} khoản)`);

    if (relatedList.length > 0) {
      return res.status(400).json({
        error: `Nhân sự này đã có dữ liệu phát sinh tại ${relatedList.join(', ')}, không thể xóa. Vui lòng chuyển sang Ngưng sử dụng.`
      });
    }

    await updateDatabase(draft => {
      draft.members = draft.members.filter(m => m.code !== codeToMatch && m.id !== member.id);
      if (Array.isArray(draft.moduleInChargeMembers)) {
        draft.moduleInChargeMembers = draft.moduleInChargeMembers.filter(ic => ic.onbCode !== codeToMatch);
      }
      if (Array.isArray((draft as any).trainingPriorityRegistrations)) {
        (draft as any).trainingPriorityRegistrations = (draft as any).trainingPriorityRegistrations.filter((tpr: any) => tpr.onbCode !== codeToMatch);
      }
      if (Array.isArray(draft.schedules)) {
        draft.schedules = draft.schedules.filter(s => s.onbCode !== codeToMatch && !(Array.isArray(s.collaborators) && s.collaborators.includes(codeToMatch)));
      }
      addAuditLog(draft, session, 'DELETE', 'MEMBER', codeToMatch, `Xóa nhân sự chưa có dữ liệu: ${member.fullName} (${codeToMatch})`);
    });

    res.json({ success: true });
  });

  // Reference scoring catalog
  app.post('/api/core/reference-scores', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền cấu hình điểm Core.' });
    }

    const { workTypeCode, productCode, suggestedScore, conversionRate, effectiveFrom, effectiveTo, description, isActive } = req.body;
    if (!workTypeCode || !workTypeCode.trim()) {
      return res.status(400).json({ error: 'Vui lòng chọn loại công việc.' });
    }

    const trimmedWorkType = typeof workTypeCode === 'string' ? workTypeCode.trim() : '';
    const trimmedProduct = (productCode && typeof productCode === 'string' && productCode.trim()) ? productCode.trim() : undefined;
    const effFrom = (effectiveFrom && typeof effectiveFrom === 'string' && effectiveFrom.trim()) ? effectiveFrom.trim() : new Date().toISOString().slice(0, 10);
    const effTo = (effectiveTo && typeof effectiveTo === 'string' && effectiveTo.trim()) ? effectiveTo.trim() : undefined;

    if (suggestedScore === undefined || suggestedScore === '' || isNaN(Number(suggestedScore)) || Number(suggestedScore) < 0) {
      return res.status(400).json({ error: 'Điểm gợi ý phải là số hợp lệ lớn hơn hoặc bằng 0.' });
    }

    if (conversionRate !== undefined && conversionRate !== '' && conversionRate !== null) {
      if (isNaN(Number(conversionRate)) || Number(conversionRate) <= 0) {
        return res.status(400).json({ error: 'Mức quy đổi VNĐ phải là số dương lớn hơn 0.' });
      }
    }

    if (effTo && effTo < effFrom) {
      return res.status(400).json({ error: 'Ngày kết thúc hiệu lực không được trước ngày bắt đầu hiệu lực.' });
    }

    // Check duplicate
    const isDuplicate = (db.referenceScores || []).some(rs =>
      rs.workTypeCode.toLowerCase() === trimmedWorkType.toLowerCase() &&
      (rs.productCode || '').toLowerCase() === (trimmedProduct || '').toLowerCase() &&
      rs.effectiveFrom === effFrom
    );

    if (isDuplicate) {
      return res.status(400).json({
        error: `Quy tắc điểm tham chiếu cho Loại việc "${trimmedWorkType}" - Sản phẩm "${trimmedProduct || 'Tất cả sản phẩm'}" có ngày hiệu lực ${effFrom} đã tồn tại.`
      });
    }

    const newScore: ReferenceScore = {
      id: `rs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      workTypeCode: trimmedWorkType,
      productCode: trimmedProduct,
      suggestedScore: Number(suggestedScore),
      conversionRate: (conversionRate !== undefined && conversionRate !== '' && conversionRate !== null) ? Number(conversionRate) : undefined,
      effectiveFrom: effFrom,
      effectiveTo: effTo,
      description: description ? description.trim() : '',
      isActive: isActive !== undefined ? Boolean(isActive) : true
    };

    await updateDatabase(draft => {
      draft.referenceScores.push(newScore);
      addAuditLog(draft, session, 'CREATE', 'CORE', newScore.id, `Thêm điểm tham chiếu: ${newScore.workTypeCode} (${newScore.productCode || 'Tất cả'}) -> ${newScore.suggestedScore} điểm`, null, newScore);
    });

    res.json({ success: true, referenceScore: newScore });
  });

  app.put('/api/core/reference-scores/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền cấu hình điểm Core.' });
    }

    const id = req.params.id;
    const { workTypeCode, productCode, suggestedScore, conversionRate, effectiveFrom, effectiveTo, description, isActive } = req.body;

    const existing = db.referenceScores.find(rs => rs.id === id);
    if (!existing) {
      return res.status(404).json({ error: 'Không tìm thấy bản ghi điểm tham chiếu.' });
    }

    const targetWorkType = (workTypeCode !== undefined ? (typeof workTypeCode === 'string' ? workTypeCode.trim() : '') : existing.workTypeCode);
    const targetProduct = (productCode !== undefined ? (productCode && typeof productCode === 'string' && productCode.trim() ? productCode.trim() : undefined) : existing.productCode);
    const targetEffFrom = (effectiveFrom !== undefined ? (typeof effectiveFrom === 'string' && effectiveFrom.trim() ? effectiveFrom.trim() : '2026-01-01') : existing.effectiveFrom);
    const targetEffTo = (effectiveTo !== undefined ? (effectiveTo && typeof effectiveTo === 'string' && effectiveTo.trim() ? effectiveTo.trim() : undefined) : existing.effectiveTo);

    if (!targetWorkType) {
      return res.status(400).json({ error: 'Vui lòng chọn loại công việc.' });
    }

    if (suggestedScore !== undefined) {
      if (suggestedScore === '' || isNaN(Number(suggestedScore)) || Number(suggestedScore) < 0) {
        return res.status(400).json({ error: 'Điểm gợi ý phải là số hợp lệ lớn hơn hoặc bằng 0.' });
      }
    }

    if (conversionRate !== undefined && conversionRate !== '' && conversionRate !== null) {
      if (isNaN(Number(conversionRate)) || Number(conversionRate) <= 0) {
        return res.status(400).json({ error: 'Mức quy đổi VNĐ phải là số dương lớn hơn 0.' });
      }
    }

    if (targetEffTo && targetEffTo < targetEffFrom) {
      return res.status(400).json({ error: 'Ngày kết thúc hiệu lực không được trước ngày bắt đầu hiệu lực.' });
    }

    // Check duplicate excluding self
    const isDuplicate = (db.referenceScores || []).some(rs =>
      rs.id !== id &&
      rs.workTypeCode.toLowerCase() === targetWorkType.toLowerCase() &&
      (rs.productCode || '').toLowerCase() === (targetProduct || '').toLowerCase() &&
      rs.effectiveFrom === targetEffFrom
    );

    if (isDuplicate) {
      return res.status(400).json({
        error: `Quy tắc điểm tham chiếu cho Loại việc "${targetWorkType}" - Sản phẩm "${targetProduct || 'Tất cả sản phẩm'}" có ngày hiệu lực ${targetEffFrom} đã tồn tại ở bản ghi khác.`
      });
    }

    let updatedScore: ReferenceScore | null = null;
    await updateDatabase(draft => {
      const item = draft.referenceScores.find(rs => rs.id === id);
      if (item) {
        const oldVal = { ...item };
        item.workTypeCode = targetWorkType;
        item.productCode = targetProduct;
        if (suggestedScore !== undefined) item.suggestedScore = Number(suggestedScore);
        if (conversionRate !== undefined) {
          item.conversionRate = (conversionRate !== '' && conversionRate !== null) ? Number(conversionRate) : undefined;
        }
        item.effectiveFrom = targetEffFrom;
        item.effectiveTo = targetEffTo;
        if (description !== undefined) item.description = (typeof description === 'string') ? description.trim() : '';
        if (isActive !== undefined) item.isActive = Boolean(isActive);

        updatedScore = item;
        addAuditLog(draft, session, 'UPDATE', 'CORE', id, `Cập nhật điểm tham chiếu Core ${item.workTypeCode} (${item.productCode || 'Tất cả'})`, oldVal, item);
      }
    });

    res.json({ success: true, referenceScore: updatedScore });
  });

  app.delete('/api/core/reference-scores/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền xóa điểm tham chiếu.' });
    }

    const id = req.params.id;
    const item = db.referenceScores.find(rs => rs.id === id);
    if (!item) return res.status(404).json({ error: 'Không tìm thấy điểm tham chiếu.' });

    // Check if used in progress tasks
    const prgTasks = (db.progress || []).filter(p => {
      if (p.workTypeCode !== item.workTypeCode) return false;
      if (item.productCode && p.productCode !== item.productCode) return false;
      if (p.date) {
        if (item.effectiveFrom && p.date < item.effectiveFrom) return false;
        if (item.effectiveTo && p.date > item.effectiveTo) return false;
      }
      return true;
    });

    // Check if used in schedules
    const schTasks = (db.schedules || []).filter(s => {
      if (s.workTypeCode !== item.workTypeCode) return false;
      if (item.productCode && s.productCode !== item.productCode) return false;
      if (s.date) {
        if (item.effectiveFrom && s.date < item.effectiveFrom) return false;
        if (item.effectiveTo && s.date > item.effectiveTo) return false;
      }
      return true;
    });

    // Check if used in centralized training classes (ĐTTT)
    let trainCount = 0;
    if (item.workTypeCode === 'ĐTTT' && Array.isArray(db.trainingPackages)) {
      db.trainingPackages.forEach(tp => {
        const date = tp.scheduledDate;
        if (date) {
          if (item.effectiveFrom && date < item.effectiveFrom) return;
          if (item.effectiveTo && date > item.effectiveTo) return;
        }
        if (item.productCode && tp.productCode && tp.productCode.toUpperCase() !== item.productCode.toUpperCase()) return;
        trainCount++;
      });
    }

    const relatedModules: string[] = [];
    if (prgTasks.length > 0) relatedModules.push(`Tiến độ chi tiết (${prgTasks.length} bản ghi)`);
    if (schTasks.length > 0) relatedModules.push(`Lịch làm việc (${schTasks.length} bản ghi)`);
    if (trainCount > 0) relatedModules.push(`Phân bổ đào tạo tập trung (${trainCount} lớp học)`);

    if (relatedModules.length > 0) {
      return res.status(400).json({
        error: `Dòng điểm tham chiếu này đã có dữ liệu phát sinh tại ${relatedModules.join(', ')}, không thể xóa. Vui lòng chuyển sang Ngưng sử dụng.`
      });
    }

    await updateDatabase(draft => {
      draft.referenceScores = draft.referenceScores.filter(rs => rs.id !== id);
      addAuditLog(draft, session, 'DELETE', 'CORE', id, `Xóa điểm tham chiếu chưa có dữ liệu: ${item.workTypeCode} ${item.productCode || 'Tất cả'} (${item.effectiveFrom})`);
    });

    res.json({ success: true });
  });

  // Catalogs: Products
  app.get('/api/core/products', (req, res) => {
    const db = readDatabase();
    res.json({ products: db.products || [] });
  });

  app.post('/api/core/products', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền sửa danh mục.' });

    const { code, name, category, description, isActive } = req.body;
    if (!code || !code.trim() || !name || !name.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập Mã và Tên sản phẩm.' });
    }

    const trimmedCode = code.toUpperCase().trim();
    if (db.products.some(p => p.code.toLowerCase() === trimmedCode.toLowerCase())) {
      return res.status(400).json({ error: `Mã sản phẩm "${trimmedCode}" đã tồn tại.` });
    }

    const newProd: ProductCatalog = {
      id: `p_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code: trimmedCode,
      name: name.trim(),
      category: category || 'Module',
      description: description ? description.trim() : '',
      isActive: isActive !== undefined ? Boolean(isActive) : true
    };

    await updateDatabase(draft => {
      draft.products.push(newProd);
      addAuditLog(draft, session, 'CREATE', 'CORE', newProd.code, `Thêm sản phẩm/module: ${newProd.name} (${newProd.code})`, null, newProd);
    });

    res.json({ success: true, product: newProd });
  });

  app.put('/api/core/products/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền sửa danh mục sản phẩm.' });

    const id = req.params.id;
    const existing = db.products.find(p => p.id === id || p.code === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });

    const { code, name, category, description, isActive } = req.body;
    const oldCode = existing.code;
    const newCode = code ? code.trim().toUpperCase() : oldCode;

    // Check duplicate code excluding self
    if (newCode !== oldCode) {
      if (db.products.some(p => p.id !== existing.id && p.code.toLowerCase() === newCode.toLowerCase())) {
        return res.status(400).json({ error: `Mã sản phẩm "${newCode}" đã tồn tại trên sản phẩm khác.` });
      }
    }

    let updatedProd: ProductCatalog | null = null;
    await updateDatabase(draft => {
      const prod = draft.products.find(p => p.id === existing.id);
      if (prod) {
        const oldVal = { ...prod };
        prod.code = newCode;
        if (name !== undefined) prod.name = name.trim();
        if (category !== undefined) prod.category = category;
        if (description !== undefined) prod.description = description ? description.trim() : '';
        if (isActive !== undefined) prod.isActive = Boolean(isActive);

        // Propagate code change across all dependent operational and configuration records
        if (newCode !== oldCode) {
          draft.schedules.forEach(s => {
            if (s.productCode === oldCode) s.productCode = newCode;
          });
          draft.progress.forEach(p => {
            if (p.productCode === oldCode) p.productCode = newCode;
          });
          draft.referenceScores.forEach(rs => {
            if (rs.productCode === oldCode) rs.productCode = newCode;
          });
          if (Array.isArray(draft.trainingPackages)) {
            draft.trainingPackages.forEach(tp => {
              if (tp.productCode === oldCode) tp.productCode = newCode;
            });
          }
          if (Array.isArray(draft.members)) {
            draft.members.forEach(m => {
              if (Array.isArray(m.completedProducts)) {
                m.completedProducts = m.completedProducts.map(cp => cp === oldCode ? newCode : cp);
              }
            });
          }
          if (Array.isArray(draft.packages)) {
            draft.packages.forEach(pkg => {
              if (Array.isArray(pkg.details)) {
                pkg.details.forEach(d => {
                  if (d.moduleCode === oldCode) {
                    d.moduleCode = newCode;
                    if (name !== undefined) d.moduleName = name.trim();
                  }
                });
              }
            });
          }
          if (Array.isArray(draft.recurringTrainingSchedules)) {
            draft.recurringTrainingSchedules.forEach(rts => {
              if (rts.moduleCode === oldCode) rts.moduleCode = newCode;
            });
          }
          if (Array.isArray(draft.trainingModules)) {
            draft.trainingModules.forEach(tm => {
              if (tm.code === oldCode) tm.code = newCode;
            });
          }
          if (Array.isArray(draft.moduleInChargeMembers)) {
            draft.moduleInChargeMembers.forEach(ic => {
              if (ic.moduleCode === oldCode) ic.moduleCode = newCode;
            });
          }
          if (Array.isArray(draft.trainingPriorities)) {
            draft.trainingPriorities.forEach(pr => {
              if (pr.moduleCode === oldCode) pr.moduleCode = newCode;
            });
          }
          if (draft.packageCoreConfig && Array.isArray(draft.packageCoreConfig.modules)) {
            draft.packageCoreConfig.modules.forEach(m => {
              if (m.code === oldCode) {
                m.code = newCode;
                if (name !== undefined) m.name = name.trim();
              }
            });
          }
        }

        updatedProd = prod;
        addAuditLog(draft, session, 'UPDATE', 'CORE', id, `Cập nhật sản phẩm: ${prod.name} (${oldCode} -> ${newCode})`, oldVal, prod);
      }
    });

    res.json({ success: true, product: updatedProd });
  });

  app.delete('/api/core/products/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền xóa sản phẩm.' });

    const id = req.params.id;
    const prod = db.products.find(p => p.id === id || p.code === id);
    if (!prod) return res.status(404).json({ error: 'Không tìm thấy sản phẩm.' });

    // Check if used in operational business data
    const schCount = db.schedules.filter(s => s.productCode === prod.code || s.productCode === prod.name).length;
    const prgCount = db.progress.filter(p => p.productCode === prod.code || p.productCode === prod.name).length;
    const tpCount = (db.trainingPackages || []).filter(tp => tp.productCode === prod.code).length;
    const pkgCount = (db.packages || []).filter(pkg =>
      Array.isArray(pkg.details) && pkg.details.some(d => d.moduleCode === prod.code)
    ).length;

    const related: string[] = [];
    if (schCount > 0) related.push(`Lịch làm việc (${schCount} bản ghi)`);
    if (prgCount > 0) related.push(`Tiến độ chi tiết (${prgCount} bản ghi)`);
    if (tpCount > 0) related.push(`Phân bổ đào tạo (${tpCount} lớp)`);
    if (pkgCount > 0) related.push(`Gói tiếp nhận (${pkgCount} gói)`);

    if (related.length > 0) {
      return res.status(400).json({
        error: `[${prod.code} - ${prod.name}] đã có dữ liệu phát sinh tại ${related.join(', ')}, không thể xóa. Vui lòng chuyển sang Ngưng sử dụng.`
      });
    }

    await updateDatabase(draft => {
      draft.products = draft.products.filter(p => p.id !== prod.id && p.code !== prod.code);
      // Clean up un-used reference scores configured for this deleted product
      draft.referenceScores = draft.referenceScores.filter(rs => rs.productCode !== prod.code);
      // Clean up from member completed products
      if (Array.isArray(draft.members)) {
        draft.members.forEach(m => {
          if (Array.isArray(m.completedProducts)) {
            m.completedProducts = m.completedProducts.filter(cp => cp !== prod.code);
          }
        });
      }
      addAuditLog(draft, session, 'DELETE', 'CORE', prod.code, `Xóa sản phẩm chưa có dữ liệu: ${prod.name} (${prod.code})`);
    });

    res.json({ success: true });
  });

  app.post('/api/core/work-types', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền sửa loại công việc.' });

    const {
      code,
      name,
      isTraining,
      description,
      isActive,
      unit,
      unitType,
      calculationMethod,
      requiresProduct,
      kpiCategory,
      defaultScorePerUnit,
      conversionRate,
      order,
      customFields
    } = req.body;

    if (!code || !name) {
      return res.status(400).json({ error: 'Vui lòng nhập mã và tên loại công việc.' });
    }

    const trimmedCode = code.trim();
    const trimmedName = name.trim();

    if (db.workTypes.some(w => w.code.toLowerCase() === trimmedCode.toLowerCase())) {
      return res.status(400).json({ error: `Mã loại công việc "${trimmedCode}" đã tồn tại.` });
    }

    const newWt: WorkTypeCatalog = {
      id: `wt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code: trimmedCode,
      name: trimmedName,
      isTraining: Boolean(isTraining),
      description: description || '',
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      unit: unit || 'Buổi',
      unitType: unitType || (unit === 'VNĐ' ? 'currency' : 'session'),
      calculationMethod: calculationMethod || (unit === 'VNĐ' ? 'AMOUNT_DIVIDE' : 'QUANTITY_MULTIPLY'),
      requiresProduct: Boolean(requiresProduct),
      kpiCategory: kpiCategory || (trimmedCode === 'TIEN_VE' ? 'DEMO/POC/Tiền về' : 'Khác'),
      defaultScorePerUnit: defaultScorePerUnit !== undefined ? Number(defaultScorePerUnit) : 10,
      conversionRate: conversionRate !== undefined ? Number(conversionRate) : (calculationMethod === 'AMOUNT_DIVIDE' || trimmedCode === 'TIEN_VE' ? 5000000 : undefined),
      order: order !== undefined ? Number(order) : db.workTypes.length + 1,
      customFields: Array.isArray(customFields) ? customFields : []
    };

    await updateDatabase(draft => {
      draft.workTypes.push(newWt);

      // Also create or update matching reference score
      const existingRef = draft.referenceScores.find(rs => rs.workTypeCode === newWt.code);
      if (!existingRef) {
        draft.referenceScores.push({
          id: `rs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          workTypeCode: newWt.code,
          suggestedScore: defaultScorePerUnit !== undefined ? Number(defaultScorePerUnit) : 10,
          conversionRate: conversionRate !== undefined ? Number(conversionRate) : (newWt.calculationMethod === 'AMOUNT_DIVIDE' ? 5000000 : undefined),
          effectiveFrom: '2026-01-01',
          description: `Quy tắc chuẩn cho ${newWt.name}`,
          isActive: true
        });
      }

      addAuditLog(draft, session, 'CREATE', 'CORE', newWt.code, `Thêm loại công việc: ${newWt.name} (${newWt.unit})`);
    });

    res.json({ success: true, workType: newWt });
  });

  app.put('/api/core/work-types/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền sửa loại công việc.' });

    const id = req.params.id;
    const existing = db.workTypes.find(w => w.id === id || w.code === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy loại công việc.' });

    const {
      code,
      name,
      isTraining,
      description,
      isActive,
      unit,
      unitType,
      calculationMethod,
      requiresProduct,
      kpiCategory,
      defaultScorePerUnit,
      conversionRate,
      order,
      customFields
    } = req.body;

    const oldCode = existing.code;
    const newCode = code ? code.trim() : oldCode;

    // Check duplicate code excluding self
    if (newCode !== oldCode) {
      if (db.workTypes.some(w => w.id !== existing.id && w.code.toLowerCase() === newCode.toLowerCase())) {
        return res.status(400).json({ error: `Mã loại công việc "${newCode}" đã tồn tại trên loại việc khác.` });
      }
    }

    let updated: any = null;
    await updateDatabase(draft => {
      const wt = draft.workTypes.find(w => w.id === existing.id);
      if (wt) {
        const oldVal = { ...wt };
        wt.code = newCode;
        if (name !== undefined) wt.name = name.trim();
        if (isTraining !== undefined) wt.isTraining = Boolean(isTraining);
        if (description !== undefined) wt.description = description;
        if (isActive !== undefined) wt.isActive = Boolean(isActive);
        if (unit !== undefined) wt.unit = unit;
        if (unitType !== undefined) wt.unitType = unitType;
        if (calculationMethod !== undefined) wt.calculationMethod = calculationMethod;
        if (requiresProduct !== undefined) wt.requiresProduct = Boolean(requiresProduct);
        if (kpiCategory !== undefined) wt.kpiCategory = kpiCategory;
        if (defaultScorePerUnit !== undefined) wt.defaultScorePerUnit = Number(defaultScorePerUnit);
        if (conversionRate !== undefined) wt.conversionRate = Number(conversionRate);
        if (order !== undefined) wt.order = Number(order);
        if (customFields !== undefined && Array.isArray(customFields)) wt.customFields = customFields;

        // Propagate code change to historical records
        if (newCode !== oldCode) {
          draft.schedules.forEach(s => {
            if (s.workTypeCode === oldCode) {
              s.workTypeCode = newCode;
              if (s.workFormName === oldCode) s.workFormName = newCode;
            }
          });
          draft.progress.forEach(p => {
            if (p.workTypeCode === oldCode) p.workTypeCode = newCode;
          });
          draft.scheduleWorkForms.forEach(swf => {
            if (swf.code === oldCode) swf.code = newCode;
            if (swf.name === oldCode && name) swf.name = name.trim();
          });
          if (Array.isArray(draft.recurringTrainingSchedules)) {
            draft.recurringTrainingSchedules.forEach(rts => {
              if (rts.defaultScoreRule === oldCode) rts.defaultScoreRule = newCode;
            });
          }
        }

        // Sync or update matching ReferenceScore if defaultScorePerUnit or conversionRate changed
        const ref = draft.referenceScores.find(rs => rs.workTypeCode === wt.code || rs.workTypeCode === oldCode);
        if (ref) {
          if (oldCode !== wt.code) ref.workTypeCode = wt.code;
          if (defaultScorePerUnit !== undefined) ref.suggestedScore = Number(defaultScorePerUnit);
          if (conversionRate !== undefined) ref.conversionRate = Number(conversionRate);
        } else if (defaultScorePerUnit !== undefined || conversionRate !== undefined) {
          draft.referenceScores.push({
            id: `rs_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            workTypeCode: wt.code,
            suggestedScore: defaultScorePerUnit !== undefined ? Number(defaultScorePerUnit) : 10,
            conversionRate: conversionRate !== undefined ? Number(conversionRate) : undefined,
            effectiveFrom: '2026-01-01',
            description: `Quy tắc chuẩn cho ${wt.name}`,
            isActive: true
          });
        }

        updated = wt;
        addAuditLog(draft, session, 'UPDATE', 'CORE', wt.code, `Cập nhật loại công việc: ${wt.name} (${oldCode} -> ${newCode})`, oldVal, wt);
      }
    });

    if (!updated) return res.status(404).json({ error: 'Không tìm thấy loại công việc.' });
    res.json({ success: true, workType: updated });
  });

  app.delete('/api/core/work-types/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền xóa loại công việc.' });

    const id = req.params.id;
    const wt = db.workTypes.find(w => w.id === id || w.code === id);
    if (!wt) return res.status(404).json({ error: 'Không tìm thấy loại công việc.' });

    // Check if used in progress tasks or schedules or training packages
    const progressCount = db.progress.filter(p => p.workTypeCode === wt.code || p.workTypeCode === wt.name).length;
    const scheduleCount = db.schedules.filter(s => s.workTypeCode === wt.code || s.workTypeCode === wt.name).length;
    const tpCount = (wt.code === 'ĐTTT') ? (db.trainingPackages || []).length : 0;

    const related: string[] = [];
    if (scheduleCount > 0) related.push(`Lịch làm việc (${scheduleCount} bản ghi)`);
    if (progressCount > 0) related.push(`Tiến độ chi tiết (${progressCount} bản ghi)`);
    if (tpCount > 0) related.push(`Phân bổ đào tạo (${tpCount} lớp)`);

    if (related.length > 0) {
      return res.status(400).json({
        error: `[${wt.code} - ${wt.name}] đã có dữ liệu phát sinh tại ${related.join(', ')}, không thể xóa. Vui lòng chuyển sang Ngưng sử dụng.`
      });
    }

    await updateDatabase(draft => {
      draft.workTypes = draft.workTypes.filter(w => w.id !== wt.id && w.code !== wt.code);
      draft.referenceScores = draft.referenceScores.filter(rs => rs.workTypeCode !== wt.code);
      draft.scheduleWorkForms = draft.scheduleWorkForms.filter(swf => swf.code !== wt.code);
      addAuditLog(draft, session, 'DELETE', 'CORE', wt.code, `Xóa loại công việc chưa có dữ liệu: ${wt.name}`);
    });

    res.json({ success: true });
  });

  // 3. Work Schedules APIs
  app.get('/api/schedules', (req, res) => {
    const db = readDatabase();
    let result = [...db.schedules];

    const { monthYear, onbCode, group, workType, startDate, endDate } = req.query;

    if (monthYear) {
      result = result.filter(s => s.monthYear === monthYear);
    }
    if (onbCode) {
      result = result.filter(s => s.onbCode === onbCode || (s.collaborators && s.collaborators.includes(onbCode as string)));
    }
    if (group) {
      const memberCodesInGroup = db.members.filter(m => m.currentGroup === group).map(m => m.code);
      result = result.filter(s => memberCodesInGroup.includes(s.onbCode));
    }
    if (workType) {
      result = result.filter(s => s.workTypeCode === workType);
    }
    if (startDate) {
      result = result.filter(s => s.date >= (startDate as string));
    }
    if (endDate) {
      result = result.filter(s => s.date <= (endDate as string));
    }

    res.json({ schedules: result, total: result.length });
  });

  app.post('/api/schedules', async (req, res) => {
    const db = readDatabase();
    ensureScheduleWorkForms(db);
    const session = getSession(req, db);

    const {
      onbCode,
      collaborators,
      date,
      sessionOfDay,
      workFormId,
      workTypeCode,
      productCode,
      customerOrTask,
      notes,
      locationOrLink,
      status,
      trackCompensatoryLeave,
      isCompleted,
      fullDay
    } = req.body;

    const matchedForm = db.scheduleWorkForms.find(f => (workFormId && f.id === workFormId) || f.code === workTypeCode || f.name === workTypeCode);
    const resolvedFormId = matchedForm?.id || workFormId;
    const resolvedFormName = matchedForm?.name || workTypeCode;
    const resolvedCategory = matchedForm?.category || ((workTypeCode && (workTypeCode.includes('Nghỉ') || workTypeCode.includes('phép'))) ? 'leave' : 'work');

    const isLeave = resolvedCategory === 'leave';
    const finalTask = (customerOrTask && customerOrTask.trim()) || (isLeave ? 'Nghỉ phép / Nghỉ bù' : '');

    if (!onbCode || !date || (!resolvedFormName && !workTypeCode) || !finalTask) {
      return res.status(400).json({ error: 'Vui lòng nhập đủ: Nhân sự, Ngày, Loại công việc, Khách hàng/Nội dung.' });
    }

    const targetMember = db.members.find(m => m.code === onbCode);
    if (targetMember && !targetMember.isActive) {
      return res.status(400).json({ error: `Nhân sự ${targetMember.fullName} (${onbCode}) đang ở trạng thái Ngưng sử dụng, không thể tạo lịch mới.` });
    }

    if (productCode) {
      const targetProd = db.products.find(p => p.code === productCode);
      if (targetProd && !targetProd.isActive) {
        return res.status(400).json({ error: `Sản phẩm "${targetProd.name}" đang ở trạng thái Ngưng sử dụng, không thể chọn cho lịch mới.` });
      }
    }

    // Permission check: only Master Admin or own schedule
    if (!session.isMasterAdmin && session.onbCode !== onbCode) {
      return res.status(403).json({ error: 'Bạn chỉ có quyền tạo/sửa lịch của chính mình. Không thể sửa lịch đồng nghiệp!' });
    }

    const monthYear = date.slice(0, 7);
    if (isMonthLocked(monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${monthYear} đã bị khóa (chế độ chỉ đọc). Không thể thêm mới lịch!` });
    }

    // Anti-duplicate: Check if session already has active schedule
    if (sessionOfDay) {
      const dup = db.schedules.find(s =>
        s.onbCode === onbCode &&
        s.date === date &&
        s.sessionOfDay === sessionOfDay &&
        s.status !== 'Đã hủy' &&
        s.status !== 'Hủy'
      );
      if (dup) {
        return res.status(400).json({
          error: `Buổi ${sessionOfDay} ngày ${date} của nhân sự ${onbCode} đã có lịch: "${dup.customerOrTask}". Không thể tạo trùng buổi!`,
          existingSchedule: dup
        });
      }
    }

    const newSchedule: WorkSchedule = {
      id: `sch_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      onbCode,
      collaborators: Array.isArray(collaborators) ? collaborators : [],
      date,
      sessionOfDay: sessionOfDay || 'Sáng',
      workFormId: resolvedFormId,
      workTypeCode: resolvedFormName,
      workFormName: resolvedFormName,
      workFormCategory: resolvedCategory,
      productCode,
      customerOrTask: finalTask,
      notes,
      locationOrLink,
      status: status || 'Kế hoạch',
      trackCompensatoryLeave: Boolean(trackCompensatoryLeave),
      isCompleted: Boolean(isCompleted),
      fullDay: Boolean(fullDay),
      monthYear,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: session.onbCode
    };

    await updateDatabase(draft => {
      draft.schedules.push(newSchedule);
      addAuditLog(draft, session, 'CREATE', 'SCHEDULE', newSchedule.id, `Tạo lịch làm việc (${newSchedule.sessionOfDay}) cho ${onbCode} ngày ${date}: ${finalTask}`, null, newSchedule);
    });

    res.json({ success: true, schedule: newSchedule });
  });

  // Atomic Full-Day Creation / Update (Creates both Sáng and Chiều safely)
  app.post('/api/schedules/full-day', async (req, res) => {
    const db = readDatabase();
    ensureScheduleWorkForms(db);
    const session = getSession(req, db);

    const {
      onbCode,
      date,
      workFormId,
      workTypeCode,
      customerOrTask,
      notes,
      trackCompensatoryLeave,
      isCompleted,
      replaceExisting
    } = req.body;

    const matchedForm = db.scheduleWorkForms.find(f => (workFormId && f.id === workFormId) || f.code === workTypeCode || f.name === workTypeCode);
    const resolvedFormId = matchedForm?.id || workFormId;
    const resolvedFormName = matchedForm?.name || workTypeCode;
    const resolvedCategory = matchedForm?.category || ((workTypeCode && (workTypeCode.includes('Nghỉ') || workTypeCode.includes('phép'))) ? 'leave' : 'work');

    const isLeave = resolvedCategory === 'leave';
    const finalTask = (customerOrTask && customerOrTask.trim()) || (isLeave ? 'Nghỉ phép / Nghỉ bù' : '');

    if (!onbCode || !date || (!resolvedFormName && !workTypeCode) || !finalTask) {
      return res.status(400).json({ error: 'Vui lòng nhập đủ: Nhân sự, Ngày, Hình thức, Khách hàng/Nội dung.' });
    }

    if (!session.isMasterAdmin && session.onbCode !== onbCode) {
      return res.status(403).json({ error: 'Bạn chỉ có quyền tạo/sửa lịch của chính mình. Không thể sửa lịch đồng nghiệp!' });
    }

    const monthYear = date.slice(0, 7);
    if (isMonthLocked(monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${monthYear} đã bị khóa (chế độ chỉ đọc). Không thể thêm mới lịch!` });
    }

    // Check existing schedules on that date
    const existingMorning = db.schedules.find(s => s.onbCode === onbCode && s.date === date && (s.sessionOfDay === 'Sáng' || !s.sessionOfDay));
    const existingAfternoon = db.schedules.find(s => s.onbCode === onbCode && s.date === date && s.sessionOfDay === 'Chiều');

    const hasConflict = (existingMorning && existingMorning.status !== 'Đã hủy' && existingMorning.status !== 'Hủy') ||
                        (existingAfternoon && existingAfternoon.status !== 'Đã hủy' && existingAfternoon.status !== 'Hủy');

    if (hasConflict && !replaceExisting) {
      return res.status(409).json({
        conflict: true,
        message: `Ngày ${date} đã có lịch: Sáng (${existingMorning?.customerOrTask || 'Trống'}), Chiều (${existingAfternoon?.customerOrTask || 'Trống'}). Bạn có xác nhận thay thế bằng lịch cả ngày này không?`,
        existingMorning,
        existingAfternoon
      });
    }

    const createdOrUpdated: WorkSchedule[] = [];

    await updateDatabase(draft => {
      // 1. Process Sáng
      const mIdx = draft.schedules.findIndex(s => s.onbCode === onbCode && s.date === date && (s.sessionOfDay === 'Sáng' || !s.sessionOfDay));
      if (mIdx >= 0) {
        draft.schedules[mIdx].sessionOfDay = 'Sáng';
        draft.schedules[mIdx].workFormId = resolvedFormId;
        draft.schedules[mIdx].workTypeCode = resolvedFormName;
        draft.schedules[mIdx].workFormName = resolvedFormName;
        draft.schedules[mIdx].workFormCategory = resolvedCategory;
        draft.schedules[mIdx].customerOrTask = finalTask;
        draft.schedules[mIdx].notes = notes;
        draft.schedules[mIdx].status = 'Kế hoạch';
        draft.schedules[mIdx].trackCompensatoryLeave = Boolean(trackCompensatoryLeave);
        draft.schedules[mIdx].isCompleted = Boolean(isCompleted);
        draft.schedules[mIdx].fullDay = true;
        draft.schedules[mIdx].updatedAt = new Date().toISOString();
        draft.schedules[mIdx].updatedBy = session.onbCode;
        createdOrUpdated.push(draft.schedules[mIdx]);
      } else {
        const morningItem: WorkSchedule = {
          id: `sch_${Date.now()}_m_${Math.random().toString(36).substring(2, 6)}`,
          onbCode,
          collaborators: [],
          date,
          sessionOfDay: 'Sáng',
          workFormId: resolvedFormId,
          workTypeCode: resolvedFormName,
          workFormName: resolvedFormName,
          workFormCategory: resolvedCategory,
          customerOrTask: finalTask,
          notes,
          status: 'Kế hoạch',
          trackCompensatoryLeave: Boolean(trackCompensatoryLeave),
          isCompleted: Boolean(isCompleted),
          fullDay: true,
          monthYear,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: session.onbCode
        };
        draft.schedules.push(morningItem);
        createdOrUpdated.push(morningItem);
      }

      // 2. Process Chiều
      const aIdx = draft.schedules.findIndex(s => s.onbCode === onbCode && s.date === date && s.sessionOfDay === 'Chiều');
      if (aIdx >= 0) {
        draft.schedules[aIdx].sessionOfDay = 'Chiều';
        draft.schedules[aIdx].workFormId = resolvedFormId;
        draft.schedules[aIdx].workTypeCode = resolvedFormName;
        draft.schedules[aIdx].workFormName = resolvedFormName;
        draft.schedules[aIdx].workFormCategory = resolvedCategory;
        draft.schedules[aIdx].customerOrTask = finalTask;
        draft.schedules[aIdx].notes = notes;
        draft.schedules[aIdx].status = 'Kế hoạch';
        draft.schedules[aIdx].trackCompensatoryLeave = Boolean(trackCompensatoryLeave);
        draft.schedules[aIdx].isCompleted = Boolean(isCompleted);
        draft.schedules[aIdx].fullDay = true;
        draft.schedules[aIdx].updatedAt = new Date().toISOString();
        draft.schedules[aIdx].updatedBy = session.onbCode;
        createdOrUpdated.push(draft.schedules[aIdx]);
      } else {
        const afternoonItem: WorkSchedule = {
          id: `sch_${Date.now()}_a_${Math.random().toString(36).substring(2, 6)}`,
          onbCode,
          collaborators: [],
          date,
          sessionOfDay: 'Chiều',
          workFormId: resolvedFormId,
          workTypeCode: resolvedFormName,
          workFormName: resolvedFormName,
          workFormCategory: resolvedCategory,
          customerOrTask: finalTask,
          notes,
          status: 'Kế hoạch',
          trackCompensatoryLeave: Boolean(trackCompensatoryLeave),
          isCompleted: Boolean(isCompleted),
          fullDay: true,
          monthYear,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
          updatedBy: session.onbCode
        };
        draft.schedules.push(afternoonItem);
        createdOrUpdated.push(afternoonItem);
      }

      addAuditLog(draft, session, 'CREATE', 'SCHEDULE', createdOrUpdated[0].id, `Tạo lịch CẢ NGÀY (Sáng + Chiều) cho ${onbCode} ngày ${date}: ${finalTask}`);
    });

    res.json({ success: true, schedules: createdOrUpdated });
  });

  // Cancel Schedule in-place (Marks status as 'Đã hủy' without deleting history)
  app.post('/api/schedules/:id/cancel', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    const id = req.params.id;
    const { cancelBothSessions } = req.body;

    const existing = db.schedules.find(s => s.id === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy lịch.' });

    if (!session.isMasterAdmin && session.onbCode !== existing.onbCode) {
      return res.status(403).json({ error: 'Bạn chỉ có quyền hủy lịch của chính mình!' });
    }

    if (isMonthLocked(existing.monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} đã bị khóa. Không thể hủy lịch cũ!` });
    }

    await updateDatabase(draft => {
      const item = draft.schedules.find(s => s.id === id);
      if (item) {
        item.status = 'Đã hủy';
        item.updatedAt = new Date().toISOString();
        item.updatedBy = session.onbCode;
        addAuditLog(draft, session, 'UPDATE', 'SCHEDULE', id, `HỦY LỊCH buổi ${item.sessionOfDay || 'Sáng'} ngày ${item.date} của ${item.onbCode}`);
      }

      if (cancelBothSessions && existing) {
        // Also cancel other session on same date for same person
        draft.schedules.forEach(s => {
          if (s.onbCode === existing.onbCode && s.date === existing.date && s.id !== id) {
            s.status = 'Đã hủy';
            s.updatedAt = new Date().toISOString();
            s.updatedBy = session.onbCode;
            addAuditLog(draft, session, 'UPDATE', 'SCHEDULE', s.id, `HỦY LỊCH cả ngày (buổi ${s.sessionOfDay}) ngày ${s.date} của ${s.onbCode}`);
          }
        });
      }
    });

    res.json({ success: true });
  });

  app.put('/api/schedules/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    const id = req.params.id;

    const existing = db.schedules.find(s => s.id === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy lịch.' });

    if (!session.isMasterAdmin && session.onbCode !== existing.onbCode) {
      return res.status(403).json({ error: 'Bạn chỉ có quyền sửa lịch của chính mình!' });
    }

    if (isMonthLocked(existing.monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} đã bị khóa. Không thể chỉnh sửa lịch cũ!` });
    }

    const {
      onbCode,
      collaborators,
      date,
      sessionOfDay,
      startTime,
      endTime,
      workTypeCode,
      productCode,
      customerOrTask,
      notes,
      locationOrLink,
      status,
      trackCompensatoryLeave,
      isCompleted,
      fullDay,
      applyToFullDay // option to apply update to both sessions
    } = req.body;

    let updated: WorkSchedule | null = null;
    await updateDatabase(draft => {
      const item = draft.schedules.find(s => s.id === id);
      if (item) {
        const oldVal = { ...item };
        if (onbCode !== undefined) item.onbCode = onbCode;
        if (collaborators !== undefined) item.collaborators = collaborators;
        if (date !== undefined) {
          item.date = date;
          item.monthYear = date.slice(0, 7);
        }
        if (sessionOfDay !== undefined) item.sessionOfDay = sessionOfDay;
        if (startTime !== undefined) item.startTime = startTime;
        if (endTime !== undefined) item.endTime = endTime;
        if (workTypeCode !== undefined) item.workTypeCode = workTypeCode;
        if (productCode !== undefined) item.productCode = productCode;
        if (customerOrTask !== undefined) item.customerOrTask = customerOrTask;
        if (notes !== undefined) item.notes = notes;
        if (locationOrLink !== undefined) item.locationOrLink = locationOrLink;
        if (status !== undefined) item.status = status;
        if (trackCompensatoryLeave !== undefined) item.trackCompensatoryLeave = Boolean(trackCompensatoryLeave);
        if (isCompleted !== undefined) item.isCompleted = Boolean(isCompleted);
        if (fullDay !== undefined) item.fullDay = Boolean(fullDay);
        item.updatedAt = new Date().toISOString();
        item.updatedBy = session.onbCode;

        updated = item;
        addAuditLog(draft, session, 'UPDATE', 'SCHEDULE', id, `Cập nhật lịch làm việc của ${item.onbCode}`, oldVal, item);

        // Bidirectional sync: If this schedule is linked to a training package in Phân bổ
        const linkedTp = (draft.trainingPackages || []).find(t =>
          t.id === item.sourceTrainingPackageId || t.scheduleId === id
        );
        if (linkedTp) {
          if (item.status === 'Đã hủy' || item.status === 'Hủy') {
            linkedTp.scheduleId = undefined;
            linkedTp.scheduleStatus = 'Chưa điền lịch';
            linkedTp.allocationStatus = 'Chưa phân bổ';
            linkedTp.assignedOnbCode = undefined;
            linkedTp.assignedGroup = undefined;
          } else {
            if (onbCode !== undefined) {
              linkedTp.assignedOnbCode = item.onbCode;
              const targetMem = draft.members.find(m => m.code === item.onbCode);
              linkedTp.assignedGroup = resolveMemberGroupAtDate(draft.members, item.onbCode, linkedTp.scheduledDate) || targetMem?.currentGroup || linkedTp.assignedGroup;
              linkedTp.allocationStatus = 'Đã phân bổ';
              linkedTp.scheduleStatus = 'Đã điền lịch';
              linkedTp.scheduleId = item.id;
            }
            if (date !== undefined) {
              linkedTp.scheduledDate = item.date;
              linkedTp.monthYear = item.date.slice(0, 7);
              const wInfo = getVietnamWeekInfo(item.date);
              linkedTp.dayOfWeek = wInfo.dayOfWeek;
              linkedTp.dayOfWeekName = wInfo.dayOfWeekName;
              linkedTp.weekLabel = wInfo.weekLabel;
              const scoreInfo = calculateTrainingClassScore(draft, linkedTp.productCode, item.date);
              linkedTp.allocationPoints = scoreInfo.score;
            }
            if (sessionOfDay !== undefined && (sessionOfDay === 'Sáng' || sessionOfDay === 'Chiều')) {
              linkedTp.sessionOfDay = sessionOfDay;
            }
          }
          linkedTp.updatedAt = new Date().toISOString();
        }

        // If applyToFullDay is true, also update the other session of that date
        if (applyToFullDay) {
          const otherSession = item.sessionOfDay === 'Sáng' ? 'Chiều' : 'Sáng';
          const otherItem = draft.schedules.find(s => s.onbCode === item.onbCode && s.date === item.date && s.id !== id && (s.sessionOfDay === otherSession || !s.sessionOfDay));
          if (otherItem) {
            if (workTypeCode !== undefined) otherItem.workTypeCode = workTypeCode;
            if (customerOrTask !== undefined) otherItem.customerOrTask = customerOrTask;
            if (notes !== undefined) otherItem.notes = notes;
            if (trackCompensatoryLeave !== undefined) otherItem.trackCompensatoryLeave = Boolean(trackCompensatoryLeave);
            if (isCompleted !== undefined) otherItem.isCompleted = Boolean(isCompleted);
            otherItem.updatedAt = new Date().toISOString();
            otherItem.updatedBy = session.onbCode;
          }
        }
      }
    });

    res.json({ success: true, schedule: updated });
  });

  app.delete('/api/schedules/:id', async (req, res) => {
    try {
      const db = readDatabase();
      const session = getSession(req, db);
      const id = req.params.id;

      const existing = db.schedules.find(s => s.id === id);
      if (!existing) {
        return res.status(404).json({ error: 'Không tìm thấy lịch làm việc cần xóa (có thể đã được xóa trước đó).' });
      }

      if (isMonthLocked(existing.monthYear, db.config)) {
        return res.status(403).json({ error: `Tháng ${existing.monthYear} đã bị khóa sổ. Không thể xóa lịch thuộc kỳ kế toán đã khóa!` });
      }

      // Permission check: Master admin or schedule owner
      const canDelete = session.isMasterAdmin || session.onbCode === existing.onbCode;
      if (!canDelete) {
        return res.status(403).json({ error: 'Bạn chỉ có quyền xóa lịch làm việc của chính mình hoặc cần quyền Quản trị viên.' });
      }

      // Constraint check: Does this schedule have linked progress tasks?
      const linkedProgress = (db.progress || []).filter(p =>
        p.scheduleId === id || (existing.relatedProgressId && p.id === existing.relatedProgressId)
      );

      if (linkedProgress.length > 0 || existing.relatedProgressId) {
        const taskCodes = linkedProgress.map(p => p.code || p.id).join(', ') || existing.relatedProgressId;
        return res.status(400).json({
          error: `Lịch này đã có dữ liệu Tiến độ chi tiết / Điểm KPI phát sinh (${taskCodes}), không thể xóa. Vui lòng xử lý hoặc xóa bản ghi tiến độ trước.`
        });
      }

      await updateDatabase(draft => {
        // When deleting schedule, reconcile all linked training packages:
        const linkedTps = (draft.trainingPackages || []).filter(t => t.id === existing.sourceTrainingPackageId || t.scheduleId === id);
        for (const tp of linkedTps) {
          if (tp.occurrenceKey) {
            if (!draft.cancelledOccurrenceKeys) draft.cancelledOccurrenceKeys = [];
            if (!draft.cancelledOccurrenceKeys.includes(tp.occurrenceKey)) {
              draft.cancelledOccurrenceKeys.push(tp.occurrenceKey);
            }
          }
          // Check if there are other active schedules linked to this tp
          const otherActive = draft.schedules.filter(s => s.id !== id && (s.sourceTrainingPackageId === tp.id || s.id === tp.scheduleId) && s.status !== 'Đã hủy' && s.status !== 'Hủy');
          if (otherActive.length === 0) {
            tp.scheduleId = undefined;
            tp.scheduleStatus = 'Chưa điền lịch';
            tp.allocationStatus = 'Chưa phân bổ';
            tp.assignedOnbCode = undefined;
            tp.assignedGroup = undefined;
            tp.updatedAt = new Date().toISOString();
          } else {
            tp.scheduleId = otherActive[0].id;
            tp.scheduleStatus = 'Đã điền lịch';
            tp.allocationStatus = 'Đã phân bổ';
            tp.updatedAt = new Date().toISOString();
          }
        }
        draft.schedules = draft.schedules.filter(s => s.id !== id);
        addAuditLog(
          draft,
          session,
          'DELETE',
          'SCHEDULE',
          id,
          `Xóa lịch của ${existing.onbCode} buổi ${existing.sessionOfDay || 'Sáng'} ngày ${existing.date}: ${existing.customerOrTask}`,
          existing,
          null
        );
      });

      return res.json({ success: true, message: 'Đã xóa lịch làm việc thành công.' });
    } catch (err: any) {
      console.error('Error deleting schedule:', err);
      return res.status(500).json({ error: err.message || 'Lỗi máy chủ khi xóa lịch làm việc.' });
    }
  });

  // Transfer schedule to another member
  app.post('/api/schedules/:id/transfer', async (req, res) => {
    try {
      const db = readDatabase();
      const session = getSession(req, db);
      const id = req.params.id;
      const { toOnbCode, reason, expectedOnbCode } = req.body;

      const existing = db.schedules.find(s => s.id === id);
      if (!existing) {
        return res.status(404).json({ error: 'Không tìm thấy lịch cần chuyển (có thể đã bị xóa trước đó).' });
      }

      if (isMonthLocked(existing.monthYear, db.config)) {
        return res.status(403).json({ error: `Tháng ${existing.monthYear} đã bị khóa sổ. Không thể chuyển lịch cũ!` });
      }

      // Concurrency check: If schedule assignee was modified in the background
      if (expectedOnbCode && existing.onbCode !== expectedOnbCode) {
        return res.status(409).json({ error: 'Lịch làm việc đã bị thay đổi người phụ trách bởi thao tác khác. Vui lòng tải lại trang để xem thông tin mới nhất.' });
      }

      // Permission check: Master admin or schedule owner
      const canTransfer = session.isMasterAdmin || session.onbCode === existing.onbCode;
      if (!canTransfer) {
        return res.status(403).json({ error: 'Bạn không có quyền chuyển lịch của nhân sự này.' });
      }

      if (!toOnbCode || !toOnbCode.trim()) {
        return res.status(400).json({ error: 'Vui lòng chọn nhân sự nhận lịch.' });
      }

      const targetCode = toOnbCode.trim();
      if (targetCode === existing.onbCode) {
        return res.status(400).json({ error: 'Không thể chuyển lịch cho chính người phụ trách hiện tại.' });
      }

      const targetMember = db.members.find(m => m.code === targetCode);
      if (!targetMember) {
        return res.status(404).json({ error: 'Không tìm thấy nhân sự nhận lịch trong hệ thống.' });
      }

      if (targetMember.isActive === false) {
        return res.status(400).json({ error: `Nhân sự ${targetMember.fullName} (${targetMember.code}) đã ngưng sử dụng, không thể nhận lịch.` });
      }

      // Check if progress or score already recorded for old member
      const linkedProgress = (db.progress || []).filter(p =>
        p.scheduleId === id || (existing.relatedProgressId && p.id === existing.relatedProgressId)
      );
      if (linkedProgress.length > 0 || existing.relatedProgressId) {
        const taskCodes = linkedProgress.map(p => p.code || p.id).join(', ') || existing.relatedProgressId;
        return res.status(400).json({
          error: `Lịch này đã có dữ liệu Tiến độ chi tiết / Điểm KPI phát sinh (${taskCodes}) gắn liền với người phụ trách cũ, không thể chuyển. Vui lòng xử lý tiến độ trước nếu muốn chuyển lịch.`
        });
      }

      const currentMember = db.members.find(m => m.code === existing.onbCode);
      const performer = db.members.find(m => m.code === session.onbCode);

      const transferLog: ScheduleTransferLog = {
        id: `tf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
        fromOnbCode: existing.onbCode,
        fromMemberName: currentMember?.fullName || existing.onbCode,
        toOnbCode: targetMember.code,
        toMemberName: targetMember.fullName,
        performedByOnbCode: session.onbCode,
        performedByName: performer?.fullName || session.fullName || session.onbCode,
        transferredAt: new Date().toISOString(),
        reason: reason && reason.trim() ? reason.trim() : 'Thay đổi phân công công việc'
      };

      let updatedSchedule: any = null;
      await updateDatabase(draft => {
        const sch = draft.schedules.find(s => s.id === id);
        if (sch) {
          const oldVal = { ...sch };
          sch.onbCode = targetMember.code;
          sch.isTransferred = true;
          if (!Array.isArray(sch.transferHistory)) {
            sch.transferHistory = [];
          }
          sch.transferHistory.push(transferLog);
          sch.updatedAt = new Date().toISOString();
          sch.updatedBy = session.onbCode;

          updatedSchedule = sch;
          addAuditLog(
            draft,
            session,
            'UPDATE',
            'SCHEDULE',
            id,
            `Chuyển lịch "${sch.customerOrTask}" từ ${transferLog.fromMemberName} (${transferLog.fromOnbCode}) sang ${transferLog.toMemberName} (${transferLog.toOnbCode})`,
            oldVal,
            sch
          );

          // Bidirectional sync: Update linked training package in Phân bổ
          const linkedTp = (draft.trainingPackages || []).find(t => t.id === sch.sourceTrainingPackageId || t.scheduleId === id);
          if (linkedTp) {
            const oldTpVal = { ...linkedTp };
            linkedTp.assignedOnbCode = targetMember.code;
            linkedTp.assignedGroup = resolveMemberGroupAtDate(draft.members, targetMember.code, linkedTp.scheduledDate) || targetMember.currentGroup;
            linkedTp.allocationStatus = 'Đã phân bổ';
            linkedTp.scheduleStatus = 'Đã điền lịch';
            linkedTp.scheduleId = id;
            linkedTp.transferHistory = [...sch.transferHistory];
            linkedTp.updatedAt = new Date().toISOString();
            addAuditLog(
              draft,
              session,
              'UPDATE',
              'ALLOCATION',
              linkedTp.id,
              `Đồng bộ chuyển lịch sang Phân bổ đào tạo: ${linkedTp.packageCode} chuyển sang ${targetMember.fullName} (${targetMember.code})`,
              oldTpVal,
              linkedTp
            );
          }
        }
      });

      return res.json({ success: true, schedule: updatedSchedule, transferLog });
    } catch (err: any) {
      console.error('Error transferring schedule:', err);
      return res.status(500).json({ error: err.message || 'Lỗi máy chủ khi chuyển lịch.' });
    }
  });

  // Convert schedule to progress task quickly
  app.post('/api/schedules/:id/convert-to-progress', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    const id = req.params.id;

    const sch = db.schedules.find(s => s.id === id);
    if (!sch) return res.status(404).json({ error: 'Không tìm thấy lịch.' });

    if (isMonthLocked(sch.monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${sch.monthYear} đã bị khóa.` });
    }

    // Look up reference score (must be active and date effective if specified)
    const ref = db.referenceScores.find(rs =>
      rs.isActive !== false &&
      rs.workTypeCode === sch.workTypeCode &&
      (!rs.productCode || rs.productCode === sch.productCode) &&
      (!rs.effectiveFrom || !sch.date || rs.effectiveFrom <= sch.date) &&
      (!rs.effectiveTo || !sch.date || rs.effectiveTo >= sch.date)
    );
    const suggestedScore = ref ? ref.suggestedScore : 0;

    const newTask: any = {
      id: `prg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code: `TD-${Date.now().toString().slice(-6)}`,
      taskName: sch.customerOrTask,
      primaryOnbCode: sch.onbCode,
      workTypeCode: sch.workTypeCode,
      productCode: sch.productCode,
      date: sch.date,
      monthYear: sch.monthYear,
      status: 'Đang xử lý',
      suggestedScore,
      recordedScore: suggestedScore,
      splits: [],
      notes: sch.notes || '',
      scheduleId: sch.id,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: session.onbCode
    };

    await updateDatabase(draft => {
      draft.progress.push(newTask);
      const targetSch = draft.schedules.find(s => s.id === id);
      if (targetSch) {
        targetSch.relatedProgressId = newTask.id;
      }
      addAuditLog(draft, session, 'CREATE', 'PROGRESS', newTask.id, `Tạo bản ghi tiến độ từ lịch: ${newTask.taskName}`, null, newTask);
    });

    res.json({ success: true, progressTask: newTask });
  });

  // 4. Progress & Detailed Points APIs
  app.get('/api/progress', (req, res) => {
    const db = readDatabase();
    let result = [...db.progress];

    const { monthYear, onbCode, group, product, customer } = req.query;

    if (monthYear) {
      result = result.filter(p => p.monthYear === monthYear);
    }
    if (onbCode) {
      result = result.filter(p => p.primaryOnbCode === onbCode || (p.splits && p.splits.some(sp => sp.onbCode === onbCode)));
    }
    if (group) {
      const memberCodesInGroup = db.members.filter(m => m.currentGroup === group).map(m => m.code);
      result = result.filter(p => memberCodesInGroup.includes(p.primaryOnbCode));
    }
    if (product) {
      result = result.filter(p => p.productCode === product);
    }
    if (customer) {
      result = result.filter(p => p.customerId === customer);
    }

    res.json({ progress: result, total: result.length });
  });

  app.post('/api/progress', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    const {
      taskName,
      customerId,
      packageId,
      primaryOnbCode,
      workTypeCode,
      productCode,
      date,
      status,
      suggestedScore,
      recordedScore,
      splits,
      notes,
      scheduleId
    } = req.body;

    if (!taskName || !primaryOnbCode || !workTypeCode || !date) {
      return res.status(400).json({ error: 'Vui lòng nhập tên công việc, người phụ trách, loại công việc và ngày.' });
    }

    const targetMember = db.members.find(m => m.code === primaryOnbCode);
    if (targetMember && !targetMember.isActive) {
      return res.status(400).json({ error: `Nhân sự ${targetMember.fullName} (${primaryOnbCode}) đang ở trạng thái Ngưng sử dụng, không thể giao việc mới.` });
    }
    const targetWt = db.workTypes.find(w => w.code === workTypeCode);
    if (targetWt && !targetWt.isActive) {
      return res.status(400).json({ error: `Loại công việc "${targetWt.name}" đang ở trạng thái Ngưng sử dụng, không thể chọn cho công việc mới.` });
    }
    if (productCode) {
      const targetProd = db.products.find(p => p.code === productCode);
      if (targetProd && !targetProd.isActive) {
        return res.status(400).json({ error: `Sản phẩm "${targetProd.name}" đang ở trạng thái Ngưng sử dụng, không thể chọn cho công việc mới.` });
      }
    }

    const monthYear = date.slice(0, 7);
    if (isMonthLocked(monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${monthYear} đã bị khóa. Không thể thêm công việc!` });
    }

    // Validate points (cannot be negative)
    const recScore = Number(recordedScore);
    if (isNaN(recScore) || recScore < 0) {
      return res.status(400).json({ error: 'Điểm ghi nhận phải là số không âm (>= 0).' });
    }

    // Validate splits if provided
    const validSplits: PointSplit[] = [];
    if (Array.isArray(splits)) {
      for (const sp of splits) {
        const pts = Number(sp.points);
        if (isNaN(pts) || pts < 0) {
          return res.status(400).json({ error: 'Điểm chia cho nhân sự phải là số không âm (>= 0).' });
        }
        validSplits.push({
          onbCode: sp.onbCode,
          points: pts,
          note: sp.note
        });
      }
    }

    const newTask: any = {
      id: `prg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code: `TD-${Date.now().toString().slice(-6)}`,
      taskName: taskName.trim(),
      customerId,
      packageId,
      primaryOnbCode,
      workTypeCode,
      productCode,
      quantity: req.body.quantity !== undefined ? Number(req.body.quantity) : 1,
      unit: req.body.unit || undefined,
      amount: req.body.amount !== undefined ? Number(req.body.amount) : undefined,
      date,
      monthYear,
      status: status || 'Hoàn thành',
      suggestedScore: Number(suggestedScore) || 0,
      recordedScore: recScore,
      splits: validSplits,
      notes,
      scheduleId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: session.onbCode
    };

    await updateDatabase(draft => {
      draft.progress.push(newTask);
      addAuditLog(draft, session, 'CREATE', 'PROGRESS', newTask.id, `Tạo tiến độ: ${newTask.taskName} (${recScore}đ)`, null, newTask);
    });

    res.json({ success: true, progressTask: newTask });
  });

  // Batch create multiple progress tasks safely in one atomic transaction
  app.post('/api/progress/batch', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    const { items } = req.body;
    if (!Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ error: 'Danh sách công việc không được để trống.' });
    }

    const newTasks: any[] = [];
    const timestamp = new Date().toISOString();

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      const taskName = (item.taskName || '').trim();
      const primaryOnbCode = item.primaryOnbCode;
      const workTypeCode = item.workTypeCode;
      const date = item.date;
      const recordedScore = Number(item.recordedScore);

      if (!taskName) {
        return res.status(400).json({ error: `Dòng ${i + 1}: Vui lòng nhập Tên công việc / Nhiệm vụ.` });
      }
      if (!primaryOnbCode) {
        return res.status(400).json({ error: `Dòng ${i + 1}: Vui lòng chọn Người thực hiện.` });
      }
      if (!workTypeCode) {
        return res.status(400).json({ error: `Dòng ${i + 1}: Vui lòng chọn Loại công việc.` });
      }
      const targetMember = db.members.find(m => m.code === primaryOnbCode);
      if (targetMember && !targetMember.isActive) {
        return res.status(400).json({ error: `Dòng ${i + 1}: Nhân sự ${targetMember.fullName} (${primaryOnbCode}) đang ở trạng thái Ngưng sử dụng, không thể giao việc mới.` });
      }
      const targetWt = db.workTypes.find(w => w.code === workTypeCode);
      if (targetWt && !targetWt.isActive) {
        return res.status(400).json({ error: `Dòng ${i + 1}: Loại công việc "${targetWt.name}" đang ở trạng thái Ngưng sử dụng, không thể chọn cho công việc mới.` });
      }
      if (item.productCode) {
        const targetProd = db.products.find(p => p.code === item.productCode);
        if (targetProd && !targetProd.isActive) {
          return res.status(400).json({ error: `Dòng ${i + 1}: Sản phẩm "${targetProd.name}" đang ở trạng thái Ngưng sử dụng, không thể chọn cho công việc mới.` });
        }
      }
      if (!date) {
        return res.status(400).json({ error: `Dòng ${i + 1}: Vui lòng chọn Ngày thực hiện.` });
      }
      const monthYear = date.slice(0, 7);
      if (isMonthLocked(monthYear, db.config)) {
        return res.status(403).json({ error: `Dòng ${i + 1}: Ngày ${date} thuộc tháng đã bị khóa sổ. Không thể ghi nhận điểm!` });
      }
      if (isNaN(recordedScore) || recordedScore < 0) {
        return res.status(400).json({ error: `Dòng ${i + 1}: Điểm KPI phải là số không âm (>= 0).` });
      }

      newTasks.push({
        id: `prg_${Date.now()}_${i}_${Math.random().toString(36).substring(2, 6)}`,
        code: `TD-${Date.now().toString().slice(-6)}-${i + 1}`,
        taskName,
        primaryOnbCode,
        workTypeCode,
        productCode: item.productCode || undefined,
        quantity: item.quantity !== undefined ? Number(item.quantity) : 1,
        unit: item.unit || undefined,
        amount: item.amount !== undefined ? Number(item.amount) : undefined,
        date,
        monthYear,
        status: 'Hoàn thành',
        suggestedScore: Number(item.suggestedScore) || 0,
        recordedScore,
        splits: [], // No split UI, single performer receives points
        notes: item.notes || '',
        createdAt: timestamp,
        updatedAt: timestamp,
        updatedBy: session.onbCode
      });
    }

    await updateDatabase(draft => {
      draft.progress.push(...newTasks);
      addAuditLog(draft, session, 'CREATE', 'PROGRESS', 'BATCH', `Nhập nhanh hàng loạt ${newTasks.length} công việc & điểm (${newTasks.reduce((s, t) => s + t.recordedScore, 0)}đ)`);
    });

    res.json({ success: true, count: newTasks.length, progressTasks: newTasks });
  });

  app.put('/api/progress/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    const id = req.params.id;

    const existing = db.progress.find(p => p.id === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy bản ghi tiến độ.' });

    if (isMonthLocked(existing.monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} đã bị khóa. Không thể sửa điểm hoặc tiến độ cũ!` });
    }

    const {
      code,
      taskName,
      customerId,
      packageId,
      primaryOnbCode,
      workTypeCode,
      productCode,
      quantity,
      unit,
      amount,
      date,
      status,
      suggestedScore,
      recordedScore,
      splits,
      notes
    } = req.body;

    let updatedRecScore = existing.recordedScore;
    if (recordedScore !== undefined) {
      const parsed = Number(recordedScore);
      if (isNaN(parsed) || parsed < 0) {
        return res.status(400).json({ error: 'Điểm ghi nhận phải là số không âm (>= 0).' });
      }
      updatedRecScore = parsed;
    }

    let updatedSplits = existing.splits;
    if (splits !== undefined && Array.isArray(splits)) {
      const parsedSplits: PointSplit[] = [];
      for (const sp of splits) {
        const pts = Number(sp.points);
        if (isNaN(pts) || pts < 0) {
          return res.status(400).json({ error: 'Điểm chia cho nhân sự phải là số không âm (>= 0).' });
        }
        parsedSplits.push({
          onbCode: sp.onbCode,
          points: pts,
          note: sp.note
        });
      }
      updatedSplits = parsedSplits;
    }

    let updatedTask: any = null;
    await updateDatabase(draft => {
      const item = draft.progress.find(p => p.id === id);
      if (item) {
        const oldVal = { ...item };
        if (code !== undefined && code.trim()) item.code = code.trim();
        if (taskName !== undefined) item.taskName = taskName;
        if (customerId !== undefined) item.customerId = customerId;
        if (packageId !== undefined) item.packageId = packageId;
        if (primaryOnbCode !== undefined) item.primaryOnbCode = primaryOnbCode;
        if (workTypeCode !== undefined) item.workTypeCode = workTypeCode;
        if (productCode !== undefined) item.productCode = productCode;
        if (quantity !== undefined) item.quantity = Number(quantity);
        if (unit !== undefined) item.unit = unit;
        if (amount !== undefined) item.amount = Number(amount);
        if (date !== undefined) {
          item.date = date;
          item.monthYear = date.slice(0, 7);
        }
        if (status !== undefined) item.status = status;
        if (suggestedScore !== undefined) item.suggestedScore = Number(suggestedScore) || 0;
        item.recordedScore = updatedRecScore;
        item.splits = updatedSplits;
        if (notes !== undefined) item.notes = notes;
        item.updatedAt = new Date().toISOString();
        item.updatedBy = session.onbCode;

        updatedTask = item;
        addAuditLog(draft, session, 'UPDATE', 'SCORE', id, `Cập nhật điểm tiến độ ${item.taskName}: điểm cũ ${oldVal.recordedScore} -> điểm mới ${item.recordedScore}`, oldVal, item);
      }
    });

    res.json({ success: true, progressTask: updatedTask });
  });

  app.delete('/api/progress/:id', async (req, res) => {
    try {
      const db = readDatabase();
      const session = getSession(req, db);
      const id = req.params.id;

      const existing = db.progress.find(p => p.id === id);
      if (!existing) {
        return res.status(404).json({ error: 'Không tìm thấy bản ghi tiến độ cần xóa (có thể đã được xóa trước đó).' });
      }

      if (isMonthLocked(existing.monthYear, db.config)) {
        return res.status(403).json({ error: `Tháng ${existing.monthYear} đã bị khóa sổ. Dữ liệu lịch sử chỉ xem, không thể xóa!` });
      }

      // Permission check: Master admin, admin, primary assignee, creator, or split contributor
      const isLeadOrAdmin = session.isMasterAdmin || session.role === 'admin';
      const canDelete = isLeadOrAdmin ||
        session.onbCode === existing.primaryOnbCode ||
        session.onbCode === existing.createdBy ||
        session.onbCode === existing.updatedBy ||
        (existing.splits && existing.splits.some(s => s.onbCode === session.onbCode));

      if (!canDelete) {
        return res.status(403).json({ error: 'Bạn chỉ có quyền xóa bản ghi tiến độ của chính mình hoặc cần quyền Quản trị viên.' });
      }

      await updateDatabase(draft => {
        // If this progress was linked to a work schedule, un-link relatedProgressId safely
        (draft.schedules || []).forEach(s => {
          if (s.relatedProgressId === id || (existing.scheduleId && s.id === existing.scheduleId)) {
            s.relatedProgressId = undefined;
          }
        });

        draft.progress = draft.progress.filter(p => p.id !== id);
        addAuditLog(
          draft,
          session,
          'DELETE',
          'PROGRESS',
          id,
          `Xóa tiến độ công việc: ${existing.taskName} (${existing.primaryOnbCode}, ${existing.recordedScore} điểm, ngày ${existing.date})`,
          existing,
          null
        );
      });

      return res.json({ success: true, message: 'Đã xóa bản ghi tiến độ thành công.' });
    } catch (err: any) {
      console.error('Error deleting progress task:', err);
      return res.status(500).json({ error: err.message || 'Lỗi máy chủ khi xóa bản ghi tiến độ.' });
    }
  });

  // 5. Customers & Packages APIs
  app.get('/api/customers', (req, res) => {
    const db = readDatabase();
    res.json({ customers: db.customers });
  });

  app.post('/api/customers', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    const { name, taxCode, contactPerson, phone, address } = req.body;

    if (!name) return res.status(400).json({ error: 'Vui lòng nhập tên khách hàng.' });

    const newCust: Customer = {
      id: `cust_${Date.now()}`,
      code: `KH_${Date.now().toString().slice(-4)}`,
      name: name.trim(),
      taxCode: (taxCode || '').toString().trim(),
      contactPerson,
      phone,
      address,
      createdAt: new Date().toISOString().slice(0, 10)
    };

    await updateDatabase(draft => {
      draft.customers.push(newCust);
      addAuditLog(draft, session, 'CREATE', 'PACKAGE', newCust.id, `Thêm khách hàng: ${newCust.name}`);
    });

    res.json({ success: true, customer: newCust });
  });

  app.get('/api/packages', (req, res) => {
    const db = readDatabase();
    const pcfg = db.packageCoreConfig || DEFAULT_PACKAGE_CORE_CONFIG;
    let result = [...db.packages];
    const { monthYear, onbCode, group, sourceCode, moduleCode, search } = req.query;

    if (monthYear) result = result.filter(p => p.monthYear === monthYear);
    if (onbCode) {
      result = result.filter(p =>
        (p.details && p.details.some(d => d.onbCode === onbCode)) ||
        p.assignedOnbCode === onbCode
      );
    }
    if (group) {
      result = result.filter(p =>
        (p.details && p.details.some(d => d.groupName === group))
      );
    }
    if (sourceCode) {
      result = result.filter(p => p.sourceCode === sourceCode);
    }
    if (moduleCode) {
      result = result.filter(p =>
        (p.details && p.details.some(d => d.moduleCode === moduleCode))
      );
    }
    if (search) {
      const term = (search as string).toLowerCase().trim();
      result = result.filter(p =>
        (p.taxCode && p.taxCode.toLowerCase().includes(term)) ||
        (p.customerName && p.customerName.toLowerCase().includes(term)) ||
        (p.packageCode && p.packageCode.toLowerCase().includes(term))
      );
    }

    // Dynamic join current sourceName from Core config (Section 4.5)
    const enriched = result.map(pkg => {
      const src = pcfg.sources?.find(s => s.code === pkg.sourceCode);
      return {
        ...pkg,
        sourceName: src ? src.name : (pkg.sourceName || pkg.sourceCode)
      };
    });

    res.json({ packages: enriched, total: enriched.length });
  });

  app.get('/api/packages/check-leader', (req, res) => {
    const db = readDatabase();
    const taxCode = cleanTaxCode(req.query.taxCode as string);
    const excludeDetailId = (req.query.excludeDetailId as string) || undefined;
    const claim = findExistingLeaderClaim(db.packages, db.members, taxCode, excludeDetailId);
    res.json({
      hasLeader: Boolean(claim),
      existingClaim: claim || null
    });
  });

  app.get('/api/packages/leader-conflicts', (req, res) => {
    const db = readDatabase();
    const claimsByTax: Record<string, any[]> = {};
    for (const pkg of db.packages) {
      const cleanTax = cleanTaxCode(pkg.taxCode);
      if (!cleanTax) continue;
      for (const d of pkg.details || []) {
        if (d.leaderPlatforms && Number(d.leaderPlatforms) >= 2) {
          if (!claimsByTax[cleanTax]) claimsByTax[cleanTax] = [];
          const mem = db.members.find(m => m.code === d.onbCode);
          claimsByTax[cleanTax].push({
            taxCode: cleanTax,
            customerName: pkg.customerName,
            packageCode: pkg.packageCode,
            packageId: pkg.id,
            detailId: d.id,
            onbCode: d.onbCode,
            memberName: mem?.fullName || d.onbCode,
            moduleName: d.moduleName,
            monthYear: pkg.monthYear,
            leaderPlatforms: d.leaderPlatforms,
            leaderScore: d.leaderScore
          });
        }
      }
    }
    const conflicts = Object.entries(claimsByTax)
      .filter(([_, claims]) => claims.length > 1)
      .map(([taxCode, claims]) => ({ taxCode, count: claims.length, claims }));

    res.json({ conflicts });
  });

  app.post('/api/packages', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    const pcfg = db.packageCoreConfig || DEFAULT_PACKAGE_CORE_CONFIG;

    const {
      taxCode,
      customerName,
      customerId,
      receptionDate,
      sourceCode,
      packageClass,
      customerTier,
      workForm,
      notes,
      details
    } = req.body;

    const trimmedTaxCode = cleanTaxCode(taxCode);
    if (!trimmedTaxCode) {
      return res.status(400).json({ error: 'Mã số thuế là bắt buộc. Vui lòng nhập mã số thuế.' });
    }
    if (!customerName || !customerName.trim()) {
      return res.status(400).json({ error: 'Tên khách hàng là bắt buộc. Vui lòng nhập tên khách hàng.' });
    }
    if (!receptionDate) {
      return res.status(400).json({ error: 'Ngày tiếp nhận là bắt buộc.' });
    }

    if (sourceCode) {
      const targetSource = pcfg.sources?.find(s => s.code === sourceCode);
      if (targetSource && !targetSource.isActive) {
        return res.status(400).json({ error: `Nguồn tiếp nhận "${targetSource.name}" đang ở trạng thái Ngưng sử dụng, không thể chọn cho gói mới.` });
      }
    }
    if (customerTier) {
      const targetTier = pcfg.customerTiers?.find(t => t.code === customerTier);
      if (targetTier && !targetTier.isActive) {
        return res.status(400).json({ error: `Phân hạng khách hàng "${targetTier.name}" đang ở trạng thái Ngưng sử dụng, không thể chọn cho gói mới.` });
      }
    }
    if (workForm) {
      const targetWf = pcfg.workTypes?.find(w => w.name === workForm || w.code === workForm);
      if (targetWf && !targetWf.isActive) {
        return res.status(400).json({ error: `Loại hình tiếp nhận "${targetWf.name}" đang ở trạng thái Ngưng sử dụng, không thể chọn cho gói mới.` });
      }
    }

    const monthYear = receptionDate.slice(0, 7);
    if (isMonthLocked(monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${monthYear} đã bị khóa sổ. Không thể thêm gói tiếp nhận vào tháng cũ!` });
    }

    if (!Array.isArray(details) || details.length === 0) {
      return res.status(400).json({ error: 'Gói tiếp nhận phải có ít nhất một module và người thực hiện.' });
    }

    // Leader validation: Check if more than one row in this package declares Leader
    const leaderRows = details.filter(d => d.leaderPlatforms && Number(d.leaderPlatforms) >= 2);
    if (leaderRows.length > 1) {
      return res.status(400).json({
        error: 'Mỗi mã số thuế chỉ có một khai báo Leader duy nhất, không lặp theo gói, module hoặc người thực hiện. Vui lòng chỉ giữ 1 khai báo Leader!'
      });
    }

    // Check if Leader conflicts with ANY existing package in DB (across all months and packages)
    if (leaderRows.length > 0) {
      const existingClaim = findExistingLeaderClaim(db.packages, db.members, trimmedTaxCode);
      if (existingClaim) {
        return res.status(400).json({
          error: `Mã số thuế này đã có khai báo Leader: ${existingClaim.memberName} · ${existingClaim.packageCode} · ${existingClaim.moduleName} · ${existingClaim.monthYear}. Không thể khai báo thêm Leader.`
        });
      }
    }

    // Generate package ID and sequential packageCode (e.g. GOI-2026-006)
    const packageYear = receptionDate.slice(0, 4);
    const existingSeqNumbers = db.packages
      .map(p => {
        const match = p.packageCode?.match(/GOI-\d{4}-(\d+)/);
        return match ? parseInt(match[1], 10) : 0;
      })
      .filter(n => !isNaN(n));
    const nextSeq = (existingSeqNumbers.length > 0 ? Math.max(...existingSeqNumbers) : 0) + 1;
    const packageCode = `GOI-${packageYear}-${nextSeq.toString().padStart(3, '0')}`;
    const packageId = `pkg_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

    // Prepare detail rows
    const processedDetails: PackageDetailRow[] = [];
    const performerInModule = new Set<string>();

    for (let i = 0; i < details.length; i++) {
      const row = details[i];
      if (!row.moduleCode) {
        return res.status(400).json({ error: `Dòng ${i + 1}: Vui lòng chọn module tiếp nhận.` });
      }
      if (!row.onbCode) {
        return res.status(400).json({ error: `Dòng ${i + 1}: Vui lòng chọn người thực hiện.` });
      }

      // 5.2: Không thêm trùng cùng một người vào cùng một module của cùng gói
      const modPerformerKey = `${row.moduleCode}__${row.onbCode}`;
      if (performerInModule.has(modPerformerKey)) {
        return res.status(400).json({
          error: `Người thực hiện ${row.onbCode} đã có trong module ${row.moduleName || row.moduleCode}. Không thêm trùng cùng một người vào cùng một module của cùng gói; muốn điều chỉnh thì sửa dòng hiện có.`
        });
      }
      performerInModule.add(modPerformerKey);

      // Resolve moduleName snapshot
      const modDef = pcfg.modules?.find(m => m.code === row.moduleCode);
      const moduleName = row.moduleName || modDef?.name || row.moduleCode;

      // Resolve groupName at receptionDate
      const groupName = resolveMemberGroupAtDate(db.members, row.onbCode, receptionDate);

      // Score calculation
      const hasLeader = row.leaderPlatforms && Number(row.leaderPlatforms) >= 2;
      const numPlatforms = hasLeader ? Number(row.leaderPlatforms) : undefined;
      const calc = calculatePackageScore(
        pcfg,
        sourceCode || 'SRC_BAN_THEM_1',
        workForm || 'Đào tạo',
        customerTier || 'SILVER',
        numPlatforms
      );

      const recScore = row.recordedScore !== undefined && row.recordedScore !== null && !isNaN(Number(row.recordedScore))
        ? Number(row.recordedScore)
        : calc.suggestedScore;

      if (recScore < 0) {
        return res.status(400).json({ error: `Dòng ${i + 1}: Điểm ghi nhận không được âm.` });
      }

      processedDetails.push({
        id: row.id || `dtl_${packageId}_${i + 1}`,
        packageId,
        moduleCode: row.moduleCode,
        moduleName,
        onbCode: row.onbCode,
        groupName,
        leaderPlatforms: numPlatforms,
        leaderScore: calc.leaderScore,
        suggestedScore: calc.suggestedScore,
        recordedScore: recScore,
        isManualScore: Boolean(row.isManualScore),
        scoreFormula: calc.formula,
        notes: row.notes || '',
        updatedBy: session.onbCode,
        updatedAt: new Date().toISOString()
      });
    }

    const totalRecordedScore = processedDetails.reduce((sum, d) => sum + d.recordedScore, 0);
    const totalSuggestedScore = processedDetails.reduce((sum, d) => sum + d.suggestedScore, 0);

    const newPkg: CustomerPackage = {
      id: packageId,
      packageCode,
      taxCode: trimmedTaxCode,
      customerName: customerName.trim(),
      customerId: customerId || undefined,
      receptionDate,
      monthYear,
      sourceCode: sourceCode || 'SRC_BAN_THEM_1',
      packageClass: packageClass || 'Tiếp nhận mới',
      customerTier: customerTier || 'SILVER',
      workForm: workForm || 'Đào tạo',
      notes: notes || '',
      details: processedDetails,
      packageName: customerName.trim(),
      packageType: packageClass === 'Tiếp nhận mới' ? 'Mới tiếp nhận' : 'Đang phụ trách',
      assignedOnbCode: processedDetails[0]?.onbCode || session.onbCode,
      suggestedScore: totalSuggestedScore,
      recordedScore: totalRecordedScore,
      splits: [],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      updatedBy: session.onbCode
    };

    await updateDatabase(draft => {
      draft.packages.push(newPkg);
      addAuditLog(draft, session, 'CREATE', 'PACKAGE', newPkg.id, `Tạo gói tiếp nhận: ${newPkg.customerName} (${newPkg.packageCode}, ${totalRecordedScore}đ)`);
    });

    res.json({ success: true, package: newPkg });
  });

  app.put('/api/packages/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    const id = req.params.id;
    const pcfg = db.packageCoreConfig || DEFAULT_PACKAGE_CORE_CONFIG;

    const existing = db.packages.find(p => p.id === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy gói tiếp nhận.' });

    if (isMonthLocked(existing.monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} đã bị khóa sổ (Chế độ chỉ đọc). Không thể sửa gói tiếp nhận này!` });
    }

    const {
      packageCode,
      taxCode,
      customerName,
      customerId,
      receptionDate,
      sourceCode,
      packageClass,
      customerTier,
      workForm,
      notes,
      details
    } = req.body;

    const targetDate = receptionDate || existing.receptionDate;
    const newMonthYear = targetDate.slice(0, 7);

    if (newMonthYear !== existing.monthYear && isMonthLocked(newMonthYear, db.config)) {
      return res.status(403).json({ error: `Không thể chuyển ngày tiếp nhận vào tháng đã khóa (${newMonthYear}).` });
    }

    const trimmedTaxCode = cleanTaxCode(taxCode !== undefined ? taxCode : existing.taxCode);
    if (!trimmedTaxCode) {
      return res.status(400).json({ error: 'Mã số thuế không được để trống.' });
    }

    let processedDetails = existing.details || [];
    if (Array.isArray(details)) {
      if (details.length === 0) {
        return res.status(400).json({ error: 'Gói phải có ít nhất 1 module và người thực hiện.' });
      }

      // Check duplicate leader in the update payload itself
      const leaderRows = details.filter(d => d.leaderPlatforms && Number(d.leaderPlatforms) >= 2);
      if (leaderRows.length > 1) {
        return res.status(400).json({
          error: 'Mỗi mã số thuế chỉ có một khai báo Leader duy nhất, không lặp theo gói, module hoặc người thực hiện. Vui lòng chỉ giữ 1 khai báo Leader!'
        });
      }

      // Check if Leader conflicts with ANY OTHER detail row in DB
      if (leaderRows.length > 0) {
        const leaderRow = leaderRows[0];
        const existingClaim = findExistingLeaderClaim(db.packages, db.members, trimmedTaxCode, leaderRow.id);
        if (existingClaim) {
          return res.status(400).json({
            error: `Mã số thuế này đã có khai báo Leader: ${existingClaim.memberName} · ${existingClaim.packageCode} · ${existingClaim.moduleName} · ${existingClaim.monthYear}. Không thể khai báo thêm Leader.`
          });
        }
      }

      const performerInModule = new Set<string>();
      processedDetails = [];

      for (let i = 0; i < details.length; i++) {
        const row = details[i];
        if (!row.moduleCode || !row.onbCode) {
          return res.status(400).json({ error: `Dòng ${i + 1}: Thiếu module hoặc người thực hiện.` });
        }

        const modPerformerKey = `${row.moduleCode}__${row.onbCode}`;
        if (performerInModule.has(modPerformerKey)) {
          return res.status(400).json({
            error: `Người thực hiện ${row.onbCode} đã có trong module. Không thêm trùng cùng một người vào cùng một module của cùng gói.`
          });
        }
        performerInModule.add(modPerformerKey);

        const modDef = pcfg.modules?.find(m => m.code === row.moduleCode);
        const moduleName = row.moduleName || modDef?.name || row.moduleCode;
        const groupName = resolveMemberGroupAtDate(db.members, row.onbCode, targetDate);

        const hasLeader = row.leaderPlatforms && Number(row.leaderPlatforms) >= 2;
        const numPlatforms = hasLeader ? Number(row.leaderPlatforms) : undefined;
        const calc = calculatePackageScore(
          pcfg,
          sourceCode || existing.sourceCode || 'SRC_BAN_THEM_1',
          workForm || existing.workForm || 'Đào tạo',
          customerTier || existing.customerTier || 'SILVER',
          numPlatforms
        );

        const recScore = row.recordedScore !== undefined && row.recordedScore !== null && !isNaN(Number(row.recordedScore))
          ? Number(row.recordedScore)
          : calc.suggestedScore;

        if (recScore < 0) {
          return res.status(400).json({ error: `Dòng ${i + 1}: Điểm ghi nhận không được âm.` });
        }

        processedDetails.push({
          id: row.id || `dtl_${id}_${Date.now()}_${i + 1}`,
          packageId: id,
          moduleCode: row.moduleCode,
          moduleName,
          onbCode: row.onbCode,
          groupName,
          leaderPlatforms: numPlatforms,
          leaderScore: calc.leaderScore,
          suggestedScore: calc.suggestedScore,
          recordedScore: recScore,
          isManualScore: Boolean(row.isManualScore),
          scoreFormula: calc.formula,
          notes: row.notes || '',
          updatedBy: session.onbCode,
          updatedAt: new Date().toISOString()
        });
      }
    }

    const totalRecordedScore = processedDetails.reduce((sum, d) => sum + d.recordedScore, 0);
    const totalSuggestedScore = processedDetails.reduce((sum, d) => sum + d.suggestedScore, 0);

    let updatedPkg: CustomerPackage | null = null;
    await updateDatabase(draft => {
      const item = draft.packages.find(p => p.id === id);
      if (item) {
        const oldVal = JSON.parse(JSON.stringify(item));
        if (packageCode !== undefined && packageCode.trim()) {
          item.packageCode = packageCode.trim().toUpperCase();
        }
        if (taxCode !== undefined) item.taxCode = trimmedTaxCode;
        if (customerName !== undefined) {
          item.customerName = customerName.trim();
          item.packageName = customerName.trim();
        }
        if (customerId !== undefined) item.customerId = customerId;
        if (receptionDate !== undefined) {
          item.receptionDate = receptionDate;
          item.monthYear = newMonthYear;
        }
        if (sourceCode !== undefined) item.sourceCode = sourceCode;
        if (packageClass !== undefined) {
          item.packageClass = packageClass;
          item.packageType = packageClass === 'Tiếp nhận mới' ? 'Mới tiếp nhận' : 'Đang phụ trách';
        }
        if (customerTier !== undefined) item.customerTier = customerTier;
        if (workForm !== undefined) item.workForm = workForm;
        if (notes !== undefined) item.notes = notes;
        item.details = processedDetails;
        item.recordedScore = totalRecordedScore;
        item.suggestedScore = totalSuggestedScore;
        item.updatedAt = new Date().toISOString();
        item.updatedBy = session.onbCode;

        updatedPkg = item;
        addAuditLog(draft, session, 'UPDATE', 'PACKAGE', id, `Cập nhật gói tiếp nhận: ${item.customerName} (${item.packageCode}, ${totalRecordedScore}đ)`, oldVal, item);
      }
    });

    res.json({ success: true, package: updatedPkg });
  });

  app.delete('/api/packages/:id', async (req, res) => {
    try {
      const db = readDatabase();
      const session = getSession(req, db);
      const id = req.params.id;

      const existing = db.packages.find(p => p.id === id);
      if (!existing) {
        return res.status(404).json({ error: 'Không tìm thấy gói cần xóa (có thể đã được xóa trước đó).' });
      }

      if (isMonthLocked(existing.monthYear, db.config)) {
        return res.status(403).json({ error: `Tháng ${existing.monthYear} đã bị khóa sổ. Dữ liệu lịch sử chỉ xem, không thể xóa gói!` });
      }

      // Permission check: Master admin, assigned performer, creator, or performer in details
      const isPerformer = existing.assignedOnbCode === session.onbCode ||
        existing.createdBy === session.onbCode ||
        existing.updatedBy === session.onbCode ||
        (existing.details && existing.details.some(d => d.onbCode === session.onbCode));

      if (!session.isMasterAdmin && !isPerformer) {
        return res.status(403).json({ error: 'Bạn chỉ có quyền xóa gói tiếp nhận do chính mình thực hiện hoặc cần quyền Quản trị viên.' });
      }

      await updateDatabase(draft => {
        // Safely un-link any work schedules referencing this package
        if (draft.schedules) {
          draft.schedules.forEach(s => {
            if ((s as any).packageId === id || (s as any).customerPackageId === id) {
              (s as any).packageId = undefined;
              (s as any).customerPackageId = undefined;
            }
          });
        }

        draft.packages = draft.packages.filter(p => p.id !== id);
        addAuditLog(
          draft,
          session,
          'DELETE',
          'PACKAGE',
          id,
          `Xóa gói tiếp nhận: ${existing.customerName} (${existing.packageCode || id}, MST: ${existing.taxCode || '-'}, ${existing.details?.length || 0} module chi tiết)`,
          existing,
          null
        );
      });

      res.json({ success: true, message: 'Đã xóa gói tiếp nhận thành công.' });
    } catch (err: any) {
      console.error('Error deleting package:', err);
      res.status(500).json({ error: err.message || 'Lỗi máy chủ khi xóa gói tiếp nhận.' });
    }
  });

  // 6. Scorecard & Bonus APIs
  app.get('/api/scorecard', (req, res) => {
    const db = readDatabase();
    const monthYear = (req.query.monthYear as string) || getCurrentVietnamMonth();
    const isLocked = isMonthLocked(monthYear, db.config);
    const pool = (db.bonusPools || []).find(p => p.monthYear === monthYear) || null;

    const scorecardResult = computeScorecardData({
      monthYear,
      members: db.members,
      workTypes: db.workTypes,
      progressTasks: db.progress,
      packages: db.packages,
      bonuses: db.bonuses,
      bonusPool: pool,
      schedules: db.schedules
    });

    res.json({
      monthYear,
      isLocked,
      bonusPool: scorecardResult.bonusPool,
      rows: scorecardResult.rows,
      totalDepartmentWeightedScore: scorecardResult.totalDepartmentWeightedScore,
      summary: scorecardResult.summary
    });
  });

  // Drilldown to constituent records
  app.get('/api/scorecard/drilldown', (req, res) => {
    const db = readDatabase();
    const pcfg = db.packageCoreConfig || DEFAULT_PACKAGE_CORE_CONFIG;
    const { monthYear, onbCode, category } = req.query;

    if (!monthYear || !onbCode) {
      return res.status(400).json({ error: 'Cần cung cấp monthYear và onbCode' });
    }

    const member = db.members.find(m => m.code === onbCode);

    // 1. Tasks where member participated in this month
    const rawTasks = db.progress.filter(p => {
      const pMonth = p.date ? p.date.slice(0, 7) : p.monthYear;
      if (pMonth !== monthYear) return false;
      if (p.primaryOnbCode === onbCode) return true;
      if (p.splits && p.splits.some(sp => sp.onbCode === onbCode)) return true;
      return false;
    });

    const tasks = rawTasks.map(t => {
      const hasSplits = !!(t.splits && t.splits.length > 0);
      let memberPoints = 0;
      if (hasSplits && t.splits) {
        const sp = t.splits.find(s => s.onbCode === onbCode);
        memberPoints = sp ? sp.points : 0;
      } else {
        if (t.primaryOnbCode === onbCode) memberPoints = t.recordedScore;
      }

      const wt = db.workTypes.find(w => w.code === t.workTypeCode || w.name === t.workTypeCode);
      const cat = categorizeProgressTask(t, db.workTypes);
      const grp = resolveMemberGroupAtDate(db.members, onbCode as string, t.date || `${monthYear}-01`);

      return {
        ...t,
        workTypeName: wt ? wt.name : t.workTypeCode,
        category: cat, // 'DEMO_POC' | 'TRAINING' | 'UNKNOWN'
        memberPoints,
        resolvedGroup: grp
      };
    });

    // 2. Packages where member participated in this month
    const packages = db.packages.filter(pkg => {
      const pkgMonth = pkg.receptionDate ? pkg.receptionDate.slice(0, 7) : pkg.monthYear;
      if (pkgMonth !== monthYear) return false;
      if (pkg.details && Array.isArray(pkg.details) && pkg.details.some(d => d.onbCode === onbCode)) return true;
      if (pkg.assignedOnbCode === onbCode) return true;
      if (pkg.splits && pkg.splits.some(sp => sp.onbCode === onbCode)) return true;
      return false;
    }).map(pkg => {
      const src = pcfg.sources?.find(s => s.code === pkg.sourceCode);
      const myDetails = (pkg.details || []).filter(d => d.onbCode === onbCode);
      const memberPoints = myDetails.reduce((acc, d) => acc + (Number(d.recordedScore) || 0), 0) ||
        (pkg.assignedOnbCode === onbCode ? (Number(pkg.recordedScore) || 0) : 0);

      return {
        ...pkg,
        sourceName: src ? src.name : (pkg.sourceName || pkg.sourceCode),
        myDetails,
        memberPoints
      };
    });

    const schedules = db.schedules.filter(s => {
      if (s.monthYear !== monthYear) return false;
      return s.onbCode === onbCode || (s.collaborators && s.collaborators.includes(onbCode as string));
    });

    const bonus = db.bonuses.find(b => b.monthYear === monthYear && b.onbCode === onbCode);

    // Compute exact constituent totals
    const demoPocScore = tasks.filter(t => t.category === 'DEMO_POC').reduce((acc, t) => acc + t.memberPoints, 0);
    const trainingScore = tasks.filter(t => t.category === 'TRAINING' || t.category === 'UNKNOWN').reduce((acc, t) => acc + t.memberPoints, 0);
    const receptionScore = packages.reduce((acc, p) => acc + p.memberPoints, 0);
    const totalScore = demoPocScore + receptionScore + trainingScore;
    const weightedScore = Math.round((demoPocScore * 0.55 + receptionScore * 0.40 + trainingScore * 0.05) * 100) / 100;

    res.json({
      monthYear,
      onbCode,
      memberName: member?.fullName || onbCode,
      currentGroup: member?.currentGroup || 'Nhóm 1',
      category: category || 'ALL',
      summary: {
        scoreDemoPocTienVe: Math.round(demoPocScore * 100) / 100,
        scoreReception: Math.round(receptionScore * 100) / 100,
        scoreTraining: Math.round(trainingScore * 100) / 100,
        totalMonthlyScore: Math.round(totalScore * 100) / 100,
        weightedScore
      },
      tasks,
      packages,
      schedules,
      bonus
    });
  });

  // Bonus CRUD (Restricted: Master Admin + 2 designated bonusManagers only)
  app.get('/api/bonuses', (req, res) => {
    const db = readDatabase();
    const monthYear = (req.query.monthYear as string) || getCurrentVietnamMonth();
    const bonuses = db.bonuses.filter(b => b.monthYear === monthYear);
    res.json({ bonuses, monthYear });
  });

  app.post('/api/bonuses', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.canEditBonus) {
      return res.status(403).json({
        error: 'Bạn không có quyền nhập hoặc chỉnh sửa khoản thưởng. Chỉ Quản trị viên chính và 2 người được chỉ định mới có quyền này!'
      });
    }

    const { monthYear, onbCode, amount, reason } = req.body;
    if (!monthYear || !onbCode) {
      return res.status(400).json({ error: 'Vui lòng cung cấp Tháng và Nhân sự.' });
    }

    if (isMonthLocked(monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${monthYear} đã bị khóa. Không thể sửa khoản thưởng cũ!` });
    }

    // Support clearing bonus (setting back to "Chưa nhập")
    if (amount === null || amount === undefined || amount === '') {
      await updateDatabase(draft => {
        const idx = draft.bonuses.findIndex(b => b.monthYear === monthYear && b.onbCode === onbCode);
        if (idx !== -1) {
          const oldVal = { ...draft.bonuses[idx] };
          draft.bonuses.splice(idx, 1);
          addAuditLog(draft, session, 'DELETE', 'BONUS', oldVal.id, `Xóa khoản thưởng của ${onbCode} tháng ${monthYear} (về trạng thái Chưa nhập)`, oldVal, null);
        }
      });
      return res.json({ success: true, cleared: true });
    }

    const numAmount = Number(amount);
    if (isNaN(numAmount) || numAmount < 0) {
      return res.status(400).json({ error: 'Khoản thưởng phải là số không âm (>= 0).' });
    }

    await updateDatabase(draft => {
      const idx = draft.bonuses.findIndex(b => b.monthYear === monthYear && b.onbCode === onbCode);
      if (idx !== -1) {
        const oldVal = { ...draft.bonuses[idx] };
        draft.bonuses[idx].amount = numAmount;
        draft.bonuses[idx].reason = reason || '';
        draft.bonuses[idx].updatedBy = session.onbCode;
        draft.bonuses[idx].updatedAt = new Date().toISOString();
        addAuditLog(draft, session, 'UPDATE', 'BONUS', draft.bonuses[idx].id, `Cập nhật thưởng ${onbCode} tháng ${monthYear}: ${numAmount.toLocaleString('vi-VN')} đ`, oldVal, draft.bonuses[idx]);
      } else {
        const newBonus: any = {
          id: `bn_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          monthYear,
          onbCode,
          amount: numAmount,
          reason: reason || '',
          updatedBy: session.onbCode,
          updatedAt: new Date().toISOString()
        };
        draft.bonuses.push(newBonus);
        addAuditLog(draft, session, 'CREATE', 'BONUS', newBonus.id, `Ghi nhận thưởng ${onbCode} tháng ${monthYear}: ${numAmount.toLocaleString('vi-VN')} đ`, null, newBonus);
      }
    });

    res.json({ success: true, amount: numAmount });
  });

  // Department Bonus Fund (Tổng quỹ thưởng cả phòng) APIs
  app.get('/api/bonus-pool', (req, res) => {
    const db = readDatabase();
    const monthYear = (req.query.monthYear as string) || getCurrentVietnamMonth();
    const pool = (db.bonusPools || []).find(p => p.monthYear === monthYear) || null;
    res.json({
      monthYear,
      pool,
      isLocked: isMonthLocked(monthYear, db.config)
    });
  });

  app.post('/api/bonus-pool', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.canEditBonus) {
      return res.status(403).json({
        error: 'Bạn không có quyền nhập hoặc chỉnh sửa Quỹ thưởng phòng. Chỉ Quản trị viên chính và 2 người được chỉ định mới có quyền này!'
      });
    }

    const { monthYear, amount, reason } = req.body;
    if (!monthYear) {
      return res.status(400).json({ error: 'Vui lòng cung cấp Tháng/Năm.' });
    }

    if (isMonthLocked(monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${monthYear} đã bị khóa sổ. Tháng cũ chỉ đọc, không được sửa quỹ thưởng!` });
    }

    let updatedPool: MonthlyBonusPool | null = null;

    if (amount === null || amount === undefined || amount === '') {
      // Clear pool (về trạng thái Chưa nhập quỹ)
      await updateDatabase(draft => {
        if (!draft.bonusPools) draft.bonusPools = [];
        const idx = draft.bonusPools.findIndex(p => p.monthYear === monthYear);
        if (idx !== -1) {
          const oldVal = { ...draft.bonusPools[idx] };
          draft.bonusPools.splice(idx, 1);
          addAuditLog(draft, session, 'DELETE', 'BONUS', oldVal.id, `Đặt lại Quỹ thưởng phòng tháng ${monthYear} về trạng thái Chưa nhập quỹ`, oldVal, null);
        }
      });
      return res.json({ success: true, pool: null, message: 'Đã đặt lại về trạng thái Chưa nhập quỹ' });
    }

    const num = Number(amount);
    if (isNaN(num) || num < 0) {
      return res.status(400).json({ error: 'Tổng quỹ thưởng cả phòng phải là số nguyên không âm (>= 0).' });
    }

    const roundedAmount = Math.round(num);

    await updateDatabase(draft => {
      if (!draft.bonusPools) draft.bonusPools = [];
      const idx = draft.bonusPools.findIndex(p => p.monthYear === monthYear);
      if (idx !== -1) {
        const oldVal = { ...draft.bonusPools[idx] };
        draft.bonusPools[idx].amount = roundedAmount;
        draft.bonusPools[idx].mode = 'POOL';
        draft.bonusPools[idx].reason = reason || '';
        draft.bonusPools[idx].updatedBy = session.onbCode;
        draft.bonusPools[idx].updatedAt = new Date().toISOString();
        updatedPool = draft.bonusPools[idx];
        addAuditLog(draft, session, 'UPDATE', 'BONUS', draft.bonusPools[idx].id, `Cập nhật Tổng quỹ thưởng cả phòng tháng ${monthYear}: ${roundedAmount.toLocaleString('vi-VN')} VNĐ`, oldVal, draft.bonusPools[idx]);
      } else {
        const newPool: MonthlyBonusPool = {
          id: `pool_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          monthYear,
          amount: roundedAmount,
          mode: 'POOL',
          reason: reason || '',
          updatedBy: session.onbCode,
          updatedAt: new Date().toISOString()
        };
        draft.bonusPools.push(newPool);
        updatedPool = newPool;
        addAuditLog(draft, session, 'CREATE', 'BONUS', newPool.id, `Thiết lập Tổng quỹ thưởng cả phòng tháng ${monthYear}: ${roundedAmount.toLocaleString('vi-VN')} VNĐ`, null, newPool);
      }
    });

    res.json({ success: true, pool: updatedPool, message: 'Lưu tổng quỹ thưởng cả phòng thành công!' });
  });

  // 7. Centralized Monthly Training Allocation APIs (Phân bổ đào tạo tập trung theo tháng)
  app.get('/api/allocation', (req, res) => {
    const db = readDatabase();
    ensureTrainingModules(db);
    ensureGroups(db);
    ensureRecurringTrainingSchedules(db);
    ensureModuleInChargeMembers(db);
    const session = getSession(req, db);
    const monthYear = (req.query.monthYear as string) || getCurrentVietnamMonth();

    // Reconcile training packages with actual schedules in db.schedules
    let didReconcile = false;
    for (const pkg of (db.trainingPackages || [])) {
      if (pkg.monthYear !== monthYear) continue;
      const activeSchedules = (db.schedules || []).filter(s =>
        (s.id === pkg.scheduleId || s.sourceTrainingPackageId === pkg.id) &&
        s.status !== 'Đã hủy' && s.status !== 'Hủy'
      );
      if (activeSchedules.length > 0) {
        const sch = activeSchedules[0];
        if (pkg.allocationStatus !== 'Đã phân bổ') {
          pkg.allocationStatus = 'Đã phân bổ';
          didReconcile = true;
        }
        if (pkg.scheduleStatus !== 'Đã điền lịch') {
          pkg.scheduleStatus = 'Đã điền lịch';
          didReconcile = true;
        }
        if (pkg.scheduleId !== sch.id) {
          pkg.scheduleId = sch.id;
          didReconcile = true;
        }
        if (sch.onbCode && pkg.assignedOnbCode !== sch.onbCode) {
          pkg.assignedOnbCode = sch.onbCode;
          pkg.assignedGroup = resolveMemberGroupAtDate(db.members, sch.onbCode, pkg.scheduledDate) || db.members.find(m => m.code === sch.onbCode)?.currentGroup;
          didReconcile = true;
        }
        if (sch.transferHistory && (!pkg.transferHistory || JSON.stringify(pkg.transferHistory) !== JSON.stringify(sch.transferHistory))) {
          pkg.transferHistory = [...sch.transferHistory];
          didReconcile = true;
        }
      } else {
        // Linked schedule was deleted or does not exist
        if (pkg.scheduleId !== undefined || pkg.scheduleStatus === 'Đã điền lịch') {
          pkg.scheduleId = undefined;
          pkg.scheduleStatus = 'Chưa điền lịch';
          didReconcile = true;
        }
        const expectedAlloc = pkg.assignedOnbCode ? 'Đã phân bổ' : 'Chưa phân bổ';
        if (pkg.allocationStatus !== expectedAlloc) {
          pkg.allocationStatus = expectedAlloc;
          didReconcile = true;
        }
      }
    }

    if (didReconcile) {
      updateDatabase(draft => {
        for (const pkg of (draft.trainingPackages || [])) {
          if (pkg.monthYear !== monthYear) continue;
          const activeSchedules = (draft.schedules || []).filter(s =>
            (s.id === pkg.scheduleId || s.sourceTrainingPackageId === pkg.id) &&
            s.status !== 'Đã hủy' && s.status !== 'Hủy'
          );
          if (activeSchedules.length > 0) {
            const sch = activeSchedules[0];
            pkg.allocationStatus = 'Đã phân bổ';
            pkg.scheduleStatus = 'Đã điền lịch';
            pkg.scheduleId = sch.id;
            if (sch.onbCode && pkg.assignedOnbCode !== sch.onbCode) {
              pkg.assignedOnbCode = sch.onbCode;
              pkg.assignedGroup = resolveMemberGroupAtDate(draft.members, sch.onbCode, pkg.scheduledDate) || draft.members.find(m => m.code === sch.onbCode)?.currentGroup;
            }
            if (sch.transferHistory) {
              pkg.transferHistory = [...sch.transferHistory];
            }
          } else {
            pkg.scheduleId = undefined;
            pkg.scheduleStatus = 'Chưa điền lịch';
            pkg.allocationStatus = pkg.assignedOnbCode ? 'Đã phân bổ' : 'Chưa phân bổ';
          }
        }
      }).catch(err => console.error('Failed to persist reconciled training packages', err));
    }
    
    // Packages of this month, sorted by date asc, sessionOfDay asc (Sáng before Chiều), productCode asc
    const packages = (db.trainingPackages || [])
      .filter(p => p.monthYear === monthYear)
      .sort((a, b) => {
        const d = (a.scheduledDate || '').localeCompare(b.scheduledDate || '');
        if (d !== 0) return d;
        const sA = a.sessionOfDay === 'Sáng' ? 0 : 1;
        const sB = b.sessionOfDay === 'Sáng' ? 0 : 1;
        if (sA !== sB) return sA - sB;
        return (a.productCode || '').localeCompare(b.productCode || '');
      });

    // In-charge members for this specific month
    const inChargeMembers = (db.moduleInChargeMembers || []).filter(ic => ic.monthYear === monthYear);

    // Priorities for this specific month
    const priorities = (db.trainingPriorities || []).filter(p => p.monthYear === monthYear);

    // Recurring schedules from Core
    const recurringSchedules = db.recurringTrainingSchedules || [];

    const dtttWorkForm = (db.scheduleWorkForms || []).find(wf => wf.code === 'DTTT') || null;

    // Active groups
    const activeGroups = (db.groups || []).filter(g => g.isActive);
    const groupPoints: Record<string, number> = {};
    const groupClassCounts: Record<string, number> = {};
    activeGroups.forEach(g => {
      groupPoints[g.name] = 0;
      groupClassCounts[g.name] = 0;
    });

    // Calculate live points from centralized training classes in this month
    for (const pkg of packages) {
      if (pkg.assignedGroup && pkg.assignedGroup in groupPoints) {
        groupPoints[pkg.assignedGroup] = (groupPoints[pkg.assignedGroup] || 0) + (Number(pkg.allocationPoints) || 0);
        groupClassCounts[pkg.assignedGroup] = (groupClassCounts[pkg.assignedGroup] || 0) + 1;
      }
    }

    const locked = isMonthLocked(monthYear, db.config);
    const currentMonth = getCurrentVietnamMonth();
    const isPastMonth = monthYear < currentMonth;
    const excludedOnbCodes = (db.monthlyAllocationExclusions && db.monthlyAllocationExclusions[monthYear]) || [];

    res.json({
      monthYear,
      packages,
      trainingModules: db.trainingModules || [],
      inChargeMembers,
      recurringSchedules,
      priorities,
      groups: db.groups || [],
      members: db.members || [],
      groupPoints,
      groupClassCounts,
      isLocked: locked,
      isPastMonth,
      canManage: session.canManageAllocation && !locked,
      dtttWorkForm,
      excludedOnbCodes
    });
  });

  // Manage monthly allocation exclusion list (Danh sách nhân sự loại trừ không nhận lớp trong tháng)
  app.post('/api/allocation/exclusions', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên và người được ủy quyền mới có quyền cập nhật danh sách loại trừ.' });
    }

    const { monthYear, excludedOnbCodes } = req.body;
    if (!monthYear || !Array.isArray(excludedOnbCodes)) {
      return res.status(400).json({ error: 'Vui lòng cung cấp Tháng và danh sách mã nhân sự loại trừ.' });
    }

    if (isMonthLocked(monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${monthYear} đã bị khóa sổ.` });
    }

    await updateDatabase(draft => {
      if (!draft.monthlyAllocationExclusions) {
        draft.monthlyAllocationExclusions = {};
      }
      draft.monthlyAllocationExclusions[monthYear] = excludedOnbCodes;
      addAuditLog(draft, session, 'UPDATE', 'ALLOCATION', monthYear, `Cập nhật danh sách loại trừ nhân sự nhận lớp tháng ${monthYear}: ${excludedOnbCodes.length} nhân sự bị loại.`);
    });

    res.json({ success: true, monthYear, excludedOnbCodes });
  });

  app.post('/api/allocation/classes', async (req, res) => {
    const db = readDatabase();
    ensureTrainingModules(db);
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính và 2 người được chỉ định mới có quyền thêm lớp đào tạo.' });
    }

    const { monthYear, productCode, contentTitle, scheduledDate, sessionOfDay, userNotes, assignedOnbCode } = req.body;
    if (!monthYear || !productCode || !scheduledDate) {
      return res.status(400).json({ error: 'Vui lòng cung cấp Tháng, Module và Ngày diễn ra lớp.' });
    }

    const currentMonth = getCurrentVietnamMonth();
    if (monthYear < currentMonth || isMonthLocked(monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${monthYear} là tháng trong quá khứ hoặc đã bị khóa (chỉ xem lịch sử, không thể thêm lớp mới).` });
    }

    if (!scheduledDate.startsWith(monthYear)) {
      return res.status(400).json({ error: `Ngày lớp (${scheduledDate}) phải thuộc tháng đang quản lý (${monthYear}).` });
    }

    const mod = (db.trainingModules || []).find(m => m.code === productCode);
    if (!mod) {
      return res.status(400).json({ error: `Không tìm thấy module "${productCode}" trong Core.` });
    }
    if (!mod.isActive) {
      return res.status(400).json({ error: `Module "${mod.name}" đã ngừng sử dụng tại Core. Vui lòng chọn module đang hoạt động.` });
    }

    const chosenSession: SessionOfDay = (sessionOfDay as SessionOfDay) || (mod.defaultSession as SessionOfDay) || 'Sáng';
    if (chosenSession !== 'Sáng' && chosenSession !== 'Chiều') {
      return res.status(400).json({ error: 'Buổi đào tạo chỉ có thể là Sáng hoặc Chiều.' });
    }

    const scoreInfo = calculateTrainingClassScore(db, mod.code, scheduledDate);
    const wInfo = getVietnamWeekInfo(scheduledDate);

    // Auto generate unique package code
    const mClean = monthYear.replace('-', '');
    const existingCodes = (db.trainingPackages || []).map(p => p.packageCode).filter(Boolean);
    let nextSeq = 1;
    let codeCandidate = `LOP-${mClean}-${String(nextSeq).padStart(3, '0')}`;
    while (existingCodes.includes(codeCandidate)) {
      nextSeq++;
      codeCandidate = `LOP-${mClean}-${String(nextSeq).padStart(3, '0')}`;
    }

    let assignedMember = assignedOnbCode ? db.members.find(m => m.code === assignedOnbCode && m.isActive) : null;
    let assignedGroup: string | undefined = undefined;
    if (assignedMember) {
      assignedGroup = resolveMemberGroupAtDate(db.members, assignedMember.code, scheduledDate) || assignedMember.currentGroup;
    }

    const finalContentTitle = (contentTitle || '').trim() || `Đào tạo ${mod.code}`;

    const newClass: TrainingPackage = {
      id: `tp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      packageCode: codeCandidate,
      productCode: mod.code,
      moduleName: mod.name,
      contentTitle: finalContentTitle,
      title: finalContentTitle,
      dayOfWeek: wInfo.dayOfWeek,
      dayOfWeekName: wInfo.dayOfWeekName,
      weekLabel: wInfo.weekLabel,
      sessionOfDay: chosenSession,
      scheduledDate,
      monthYear,
      allocationPoints: scoreInfo.score,
      scoreUnit: scoreInfo.unit,
      scoreFormula: scoreInfo.formula,
      hasReferenceScore: scoreInfo.hasReferenceScore,
      assignedOnbCode: assignedMember ? assignedMember.code : undefined,
      assignedGroup,
      userNotes: (userNotes || '').trim(),
      systemNotes: scoreInfo.hasReferenceScore ? '' : 'Chưa có điểm tham chiếu tại Core',
      isLocked: false,
      allocationStatus: 'Chưa phân bổ',
      scheduleStatus: 'Chưa điền lịch',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await updateDatabase(draft => {
      ensureTrainingModules(draft);
      if (!draft.trainingPackages) draft.trainingPackages = [];
      draft.trainingPackages.push(newClass);
      addAuditLog(draft, session, 'CREATE', 'ALLOCATION', newClass.id, `Thêm lớp đào tạo tập trung: ${newClass.packageCode} - ${finalContentTitle} ngày ${scheduledDate} (${chosenSession})`);
    });

    res.json({ success: true, package: newClass });
  });

  app.post('/api/allocation/classes/:id/duplicate', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính và 2 người được chỉ định mới có quyền nhân bản lớp đào tạo.' });
    }

    const existing = (db.trainingPackages || []).find(p => p.id === req.params.id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy lớp để nhân bản.' });

    const currentMonth = getCurrentVietnamMonth();
    if (existing.monthYear < currentMonth || isMonthLocked(existing.monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} là tháng trong quá khứ hoặc đã bị khóa (chỉ xem lịch sử, không thể nhân bản).` });
    }

    const mClean = existing.monthYear.replace('-', '');
    const existingCodes = (db.trainingPackages || []).map(p => p.packageCode).filter(Boolean);
    let nextSeq = 1;
    let codeCandidate = `LOP-${mClean}-${String(nextSeq).padStart(3, '0')}`;
    while (existingCodes.includes(codeCandidate)) {
      nextSeq++;
      codeCandidate = `LOP-${mClean}-${String(nextSeq).padStart(3, '0')}`;
    }

    const wInfo = getVietnamWeekInfo(existing.scheduledDate);

    const duplicated: TrainingPackage = {
      ...existing,
      id: `tp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      packageCode: codeCandidate,
      dayOfWeek: wInfo.dayOfWeek,
      dayOfWeekName: wInfo.dayOfWeekName,
      weekLabel: wInfo.weekLabel,
      occurrenceKey: undefined,
      assignedOnbCode: undefined,
      assignedGroup: undefined,
      isLocked: false,
      allocationStatus: 'Chưa phân bổ',
      scheduleStatus: 'Chưa điền lịch',
      scheduleId: undefined,
      conflictingScheduleInfo: undefined,
      fillScheduleError: undefined,
      transferHistory: undefined,
      systemNotes: '',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    await updateDatabase(draft => {
      if (!draft.trainingPackages) draft.trainingPackages = [];
      draft.trainingPackages.push(duplicated);
      addAuditLog(draft, session, 'CREATE', 'ALLOCATION', duplicated.id, `Nhân bản lớp đào tạo: ${existing.packageCode} -> ${duplicated.packageCode}`);
    });

    res.json({ success: true, package: duplicated });
  });

  app.put('/api/allocation/classes/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Không có quyền sửa lớp đào tạo.' });
    }

    const id = req.params.id;
    const existing = (db.trainingPackages || []).find(p => p.id === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy lớp đào tạo.' });

    const currentMonth = getCurrentVietnamMonth();
    if (existing.monthYear < currentMonth || isMonthLocked(existing.monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} là tháng trong quá khứ hoặc đã bị khóa (chỉ xem lịch sử, không thể chỉnh sửa).` });
    }

    const { productCode, contentTitle, sessionOfDay, scheduledDate, assignedOnbCode, userNotes, isLocked } = req.body;

    // Validate target member if assignedOnbCode is specified
    let targetMember: ONBMember | undefined;
    if (assignedOnbCode !== undefined && assignedOnbCode !== '') {
      targetMember = db.members.find(m => m.code === assignedOnbCode);
      if (!targetMember || targetMember.isActive === false) {
        return res.status(400).json({ error: `Nhân sự ${assignedOnbCode} không tồn tại hoặc đang ở trạng thái Ngưng sử dụng.` });
      }
    }

    // Check linked schedule
    const linkedSchedule = (db.schedules || []).find(s =>
      (s.id === existing.scheduleId || s.sourceTrainingPackageId === existing.id) &&
      s.status !== 'Đã hủy' && s.status !== 'Hủy'
    );

    if (assignedOnbCode !== undefined) {
      // Rule: Do not allow resetting to Chưa giao if linked schedule is still active
      if (linkedSchedule && (!assignedOnbCode || assignedOnbCode === '')) {
        return res.status(400).json({
          error: `Lớp đang có lịch làm việc liên kết với nhân sự ${linkedSchedule.onbCode}. Không thể chuyển về "Chưa giao" khi lịch làm việc vẫn đang tồn tại; vui lòng xử lý lịch làm việc trước.`
        });
      }

      // Rule: If changing to another ONB when linked schedule exists, perform validation
      if (linkedSchedule && targetMember && targetMember.code !== linkedSchedule.onbCode) {
        // Check progress / KPI data on old member's schedule
        const linkedProgress = (db.progress || []).filter(p =>
          p.scheduleId === linkedSchedule.id || p.id === linkedSchedule.relatedProgressId
        );
        if (linkedProgress.length > 0) {
          const taskCodes = linkedProgress.map(p => p.code || p.id).join(', ');
          return res.status(400).json({
            error: `Lịch liên kết của lớp này đã có dữ liệu Tiến độ chi tiết / Điểm KPI phát sinh (${taskCodes}) của người phụ trách cũ, không thể chuyển giao.`
          });
        }

        // Conflict check on target member
        const checkDate = scheduledDate || existing.scheduledDate;
        const checkSession = sessionOfDay || existing.sessionOfDay;
        const conflict = (db.schedules || []).find(s =>
          s.onbCode === targetMember!.code &&
          s.date === checkDate &&
          s.sessionOfDay === checkSession &&
          s.id !== linkedSchedule.id &&
          s.status !== 'Đã hủy' && s.status !== 'Hủy'
        );
        if (conflict) {
          return res.status(400).json({
            error: `Nhân sự ${targetMember!.fullName} (${targetMember!.code}) đã có lịch "${conflict.customerOrTask}" vào buổi ${checkSession} ngày ${checkDate}. Vui lòng chọn nhân sự khác hoặc xử lý lịch trùng.`
          });
        }
      }
    }

    let updated: TrainingPackage | null = null;
    await updateDatabase(draft => {
      const item = draft.trainingPackages.find(p => p.id === id);
      if (!item) return;

      const oldVal = { ...item };

      if (productCode !== undefined && productCode !== item.productCode) {
        const mod = (draft.trainingModules || []).find(m => m.code === productCode);
        if (mod) {
          item.productCode = mod.code;
          item.moduleName = mod.name;
        }
      }

      if (contentTitle !== undefined) {
        item.contentTitle = (contentTitle || '').trim();
        item.title = item.contentTitle || item.title || item.productCode;
      }

      if (sessionOfDay !== undefined) {
        if (sessionOfDay === 'Sáng' || sessionOfDay === 'Chiều') {
          item.sessionOfDay = sessionOfDay;
        }
      }

      if (scheduledDate !== undefined) {
        if (scheduledDate.startsWith(item.monthYear)) {
          item.scheduledDate = scheduledDate;
          const wInfo = getVietnamWeekInfo(scheduledDate);
          item.dayOfWeek = wInfo.dayOfWeek;
          item.dayOfWeekName = wInfo.dayOfWeekName;
          item.weekLabel = wInfo.weekLabel;
        }
      }

      // Recalculate score snapshot if product or date changed
      const scoreInfo = calculateTrainingClassScore(draft, item.productCode, item.scheduledDate);
      item.allocationPoints = scoreInfo.score;
      item.scoreUnit = scoreInfo.unit;
      item.scoreFormula = scoreInfo.formula;
      item.hasReferenceScore = scoreInfo.hasReferenceScore;

      if (userNotes !== undefined) item.userNotes = (userNotes || '').trim();
      if (isLocked !== undefined) item.isLocked = Boolean(isLocked);

      // Handle assigned ONB update
      if (assignedOnbCode !== undefined) {
        const activeSch = draft.schedules.find(s =>
          (s.id === item.scheduleId || s.sourceTrainingPackageId === item.id) &&
          s.status !== 'Đã hủy' && s.status !== 'Hủy'
        );

        if (activeSch) {
          // Class has active schedule: sync with schedule
          if (targetMember && targetMember.code !== activeSch.onbCode) {
            const currentMem = draft.members.find(m => m.code === activeSch.onbCode);
            const performer = draft.members.find(m => m.code === session.onbCode);
            const transferLog: ScheduleTransferLog = {
              id: `tf_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              fromOnbCode: activeSch.onbCode,
              fromMemberName: currentMem?.fullName || activeSch.onbCode,
              toOnbCode: targetMember.code,
              toMemberName: targetMember.fullName,
              performedByOnbCode: session.onbCode,
              performedByName: performer?.fullName || session.fullName || session.onbCode,
              transferredAt: new Date().toISOString(),
              reason: 'Điều chuyển người phụ trách từ Phân bổ đào tạo'
            };

            const oldSchVal = { ...activeSch };
            activeSch.onbCode = targetMember.code;
            activeSch.isTransferred = true;
            if (!Array.isArray(activeSch.transferHistory)) {
              activeSch.transferHistory = [];
            }
            activeSch.transferHistory.push(transferLog);
            activeSch.updatedAt = new Date().toISOString();
            activeSch.updatedBy = session.onbCode;

            addAuditLog(
              draft,
              session,
              'UPDATE',
              'SCHEDULE',
              activeSch.id,
              `Chuyển lịch "${activeSch.customerOrTask}" từ ${transferLog.fromMemberName} sang ${transferLog.toMemberName} theo Phân bổ`,
              oldSchVal,
              activeSch
            );

            item.assignedOnbCode = targetMember.code;
            item.assignedGroup = resolveMemberGroupAtDate(draft.members, targetMember.code, item.scheduledDate) || targetMember.currentGroup;
            item.allocationStatus = 'Đã phân bổ';
            item.scheduleStatus = 'Đã điền lịch';
            item.scheduleId = activeSch.id;
            item.transferHistory = [...activeSch.transferHistory];
          }

          if (scheduledDate !== undefined) {
            activeSch.date = scheduledDate;
            activeSch.monthYear = scheduledDate.slice(0, 7);
          }
          if (sessionOfDay !== undefined) {
            activeSch.sessionOfDay = sessionOfDay;
          }
          if (productCode !== undefined) {
            activeSch.productCode = productCode;
          }
          if (contentTitle !== undefined) {
            activeSch.customerOrTask = contentTitle || `Đào tạo tập trung: ${item.moduleName || item.productCode}`;
          }
          activeSch.updatedAt = new Date().toISOString();
          activeSch.updatedBy = session.onbCode;
        } else {
          // Class does NOT have active schedule
          if (!assignedOnbCode || assignedOnbCode === '') {
            item.assignedOnbCode = undefined;
            item.assignedGroup = undefined;
            item.allocationStatus = 'Chưa phân bổ';
            item.scheduleStatus = 'Chưa điền lịch';
            item.scheduleId = undefined;
          } else if (targetMember) {
            item.assignedOnbCode = targetMember.code;
            item.assignedGroup = resolveMemberGroupAtDate(draft.members, targetMember.code, item.scheduledDate) || targetMember.currentGroup;
            // IMPORTANT: Chưa tạo lịch thành công thì vẫn là Chưa phân bổ
            item.allocationStatus = 'Chưa phân bổ';
            item.scheduleStatus = 'Chưa điền lịch';
            item.scheduleId = undefined;
          }
        }
      }

      item.updatedAt = new Date().toISOString();
      updated = item;
      addAuditLog(draft, session, 'UPDATE', 'ALLOCATION', id, `Cập nhật thông tin lớp đào tạo: ${item.packageCode}`, oldVal, item);
    });

    res.json({ success: true, package: updated });
  });

  app.delete('/api/allocation/classes/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Không có quyền xóa lớp đào tạo.' });
    }

    const id = req.params.id;
    const existing = (db.trainingPackages || []).find(p => p.id === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy lớp đào tạo.' });

    const currentMonth = getCurrentVietnamMonth();
    if (existing.monthYear < currentMonth || isMonthLocked(existing.monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} là tháng trong quá khứ hoặc đã bị khóa (chỉ xem lịch sử, không thể xóa).` });
    }

    if (existing.isLocked) {
      return res.status(400).json({ error: `Lớp "${existing.packageCode}" đang ở trạng thái Khóa. Vui lòng mở khóa trước khi xóa.` });
    }

    // Check if an active linked schedule still exists in db.schedules
    const activeSchedule = (db.schedules || []).find(s =>
      (s.id === existing.scheduleId || s.sourceTrainingPackageId === existing.id) &&
      s.status !== 'Đã hủy' && s.status !== 'Hủy'
    );
    if (activeSchedule) {
      return res.status(400).json({
        error: `Lớp này đang có lịch làm việc liên kết thực tế (${activeSchedule.date} - ${activeSchedule.sessionOfDay || 'Sáng'} của ${activeSchedule.onbCode}). Vui lòng xử lý (hủy hoặc xóa) lịch làm việc trước; hệ thống không tự ý xóa lớp khi còn lịch liên kết.`
      });
    }

    // Check linked progress tasks
    const linkedProgress = (db.progress || []).filter(p =>
      p.scheduleId === existing.scheduleId ||
      (p.customFieldValues && p.customFieldValues.trainingPackageId === existing.id)
    );
    if (linkedProgress.length > 0) {
      const taskCodes = linkedProgress.map(p => p.code || p.id).join(', ');
      return res.status(400).json({
        error: `Lớp này đã có dữ liệu Tiến độ chi tiết / Điểm KPI phát sinh (${taskCodes}), không thể xóa.`
      });
    }

    await updateDatabase(draft => {
      ensureCancelledOccurrenceKeys(draft);
      if (existing.occurrenceKey) {
        if (!draft.cancelledOccurrenceKeys) draft.cancelledOccurrenceKeys = [];
        if (!draft.cancelledOccurrenceKeys.includes(existing.occurrenceKey)) {
          draft.cancelledOccurrenceKeys.push(existing.occurrenceKey);
        }
      }
      draft.trainingPackages = draft.trainingPackages.filter(p => p.id !== id);
      addAuditLog(draft, session, 'DELETE', 'ALLOCATION', id, `Xóa lớp đào tạo tập trung: ${existing.packageCode} (${existing.contentTitle || existing.title})`);
    });

    res.json({ success: true });
  });

  // --- QUẢN LÝ NGƯỜI PHỤ TRÁCH MODULE THEO TỪNG THÁNG ---
  app.get('/api/allocation/in-charge', (req, res) => {
    const db = readDatabase();
    ensureModuleInChargeMembers(db);
    const monthYear = (req.query.monthYear as string) || getCurrentVietnamMonth();
    const items = (db.moduleInChargeMembers || []).filter(ic => ic.monthYear === monthYear);
    res.json({ monthYear, inChargeMembers: items });
  });

  app.post('/api/allocation/in-charge', async (req, res) => {
    const db = readDatabase();
    ensureModuleInChargeMembers(db);
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên và người được cấp quyền mới có quyền quản lý người phụ trách module theo tháng.' });
    }

    const { monthYear, moduleCode, onbCode, isPriority, maxSessions, notes } = req.body;
    if (!monthYear || !moduleCode || !onbCode) {
      return res.status(400).json({ error: 'Vui lòng cung cấp Tháng/Năm, Module và Nhân sự ONB.' });
    }

    const currentMonth = getCurrentVietnamMonth();
    const isPast = monthYear < currentMonth;
    const isReopened = isMonthReopened(monthYear, db.config);
    const isAdmin = Boolean(session.isMasterAdmin || session.role === 'admin');
    if (isMonthLocked(monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${monthYear} đã bị khóa sổ. Không thể thêm phân công!` });
    }
    if (isPast && !(isReopened && isAdmin)) {
      return res.status(403).json({ error: `Tháng ${monthYear} là tháng trong quá khứ (chỉ xem lịch sử, không thể phân công người phụ trách).` });
    }

    const mem = db.members.find(m => m.code === onbCode && m.isActive);
    if (!mem) {
      return res.status(400).json({ error: `Nhân sự "${onbCode}" không tồn tại hoặc đã ngừng hoạt động.` });
    }

    const mod = (db.trainingModules || []).find(m => m.code === moduleCode);
    if (!mod) {
      return res.status(400).json({ error: `Module "${moduleCode}" không tồn tại trong Core.` });
    }

    // Anti-duplicate constraint: monthYear + moduleCode + onbCode
    const existing = (db.moduleInChargeMembers || []).find(
      ic => ic.monthYear === monthYear && ic.moduleCode.toUpperCase() === moduleCode.toUpperCase() && ic.onbCode === onbCode
    );
    if (existing) {
      return res.status(400).json({ error: `Nhân sự ${mem.fullName} (${onbCode}) đã được phân công phụ trách module ${moduleCode} trong tháng ${monthYear}.` });
    }

    const assignedGroup = resolveMemberGroupAtDate(db.members, mem.code, `${monthYear}-01`) || mem.currentGroup;

    const newRecord: ModuleInChargeMember = {
      id: `mic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      monthYear,
      moduleCode: mod.code,
      onbCode: mem.code,
      assignedGroup,
      isPriority: Boolean(isPriority),
      maxSessions: maxSessions ? Number(maxSessions) : undefined,
      notes: (notes || '').trim(),
      createdAt: new Date().toISOString()
    };

    await updateDatabase(draft => {
      ensureModuleInChargeMembers(draft);
      draft.moduleInChargeMembers!.push(newRecord);
      addAuditLog(draft, session, 'CREATE', 'ALLOCATION', newRecord.id, `Khai báo người phụ trách module: ${mem.fullName} phụ trách ${mod.code} tháng ${monthYear}`);
    });

    res.json({ success: true, record: newRecord });
  });

  app.put('/api/allocation/in-charge/:id', async (req, res) => {
    const db = readDatabase();
    ensureModuleInChargeMembers(db);
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Không có quyền cập nhật người phụ trách module.' });
    }

    const id = req.params.id;
    const existing = (db.moduleInChargeMembers || []).find(ic => ic.id === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy bản ghi người phụ trách.' });

    const currentMonth = getCurrentVietnamMonth();
    const isPast = existing.monthYear < currentMonth;
    const isReopened = isMonthReopened(existing.monthYear, db.config);
    const isAdmin = Boolean(session.isMasterAdmin || session.role === 'admin');
    if (isMonthLocked(existing.monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} đã bị khóa sổ. Không thể cập nhật!` });
    }
    if (isPast && !(isReopened && isAdmin)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} là tháng trong quá khứ (chỉ xem lịch sử, không thể cập nhật).` });
    }

    const { moduleCode, onbCode, isPriority, maxSessions, notes } = req.body;
    const targetModuleCode = moduleCode ? String(moduleCode).trim() : existing.moduleCode;
    const targetOnbCode = onbCode ? String(onbCode).trim() : existing.onbCode;

    // Validate module exists
    const mod = (db.trainingModules || []).find(m => m.code === targetModuleCode);
    if (!mod) {
      return res.status(400).json({ error: `Module "${targetModuleCode}" không tồn tại trong Core.` });
    }

    // Validate member exists
    const mem = db.members.find(m => m.code === targetOnbCode && m.isActive);
    if (!mem) {
      return res.status(400).json({ error: `Nhân sự "${targetOnbCode}" không tồn tại hoặc đã ngừng hoạt động.` });
    }

    // Duplicate check (must not clash with another record for this month)
    const dup = (db.moduleInChargeMembers || []).find(ic =>
      ic.id !== id &&
      ic.monthYear === existing.monthYear &&
      ic.moduleCode.toLowerCase() === targetModuleCode.toLowerCase() &&
      ic.onbCode.toLowerCase() === targetOnbCode.toLowerCase()
    );
    if (dup) {
      return res.status(400).json({
        error: `Nhân sự ${mem.fullName} (${targetOnbCode}) đã được phân công phụ trách module ${targetModuleCode} trong tháng ${existing.monthYear}.`
      });
    }

    const assignedGroup = resolveMemberGroupAtDate(db.members, mem.code, `${existing.monthYear}-01`) || mem.currentGroup;

    let updated: ModuleInChargeMember | null = null;
    await updateDatabase(draft => {
      ensureModuleInChargeMembers(draft);
      const item = draft.moduleInChargeMembers!.find(ic => ic.id === id);
      if (item) {
        item.moduleCode = mod.code;
        item.onbCode = mem.code;
        item.assignedGroup = assignedGroup;
        if (isPriority !== undefined) item.isPriority = Boolean(isPriority);
        if (maxSessions !== undefined) item.maxSessions = maxSessions ? Number(maxSessions) : undefined;
        if (notes !== undefined) item.notes = (notes || '').trim();
        item.updatedAt = new Date().toISOString();
        updated = item;
        addAuditLog(draft, session, 'UPDATE', 'ALLOCATION', id, `Cập nhật người phụ trách module: ${mem.fullName} phụ trách ${mod.code} tháng ${existing.monthYear}`);
      }
    });

    res.json({ success: true, record: updated });
  });

  app.delete('/api/allocation/in-charge/:id', async (req, res) => {
    const db = readDatabase();
    ensureModuleInChargeMembers(db);
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Không có quyền xóa người phụ trách module.' });
    }

    const id = req.params.id;
    const existing = (db.moduleInChargeMembers || []).find(ic => ic.id === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy bản ghi người phụ trách.' });

    const currentMonth = getCurrentVietnamMonth();
    const isPast = existing.monthYear < currentMonth;
    const isReopened = isMonthReopened(existing.monthYear, db.config);
    const isAdmin = Boolean(session.isMasterAdmin || session.role === 'admin');
    if (isMonthLocked(existing.monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} đã bị khóa sổ. Không thể xóa!` });
    }
    if (isPast && !(isReopened && isAdmin)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} là tháng trong quá khứ (chỉ xem lịch sử, không thể xóa).` });
    }

    await updateDatabase(draft => {
      ensureModuleInChargeMembers(draft);
      draft.moduleInChargeMembers = draft.moduleInChargeMembers!.filter(ic => ic.id !== id);
      addAuditLog(draft, session, 'DELETE', 'ALLOCATION', id, `Xóa người phụ trách module: ${existing.onbCode} module ${existing.moduleCode} tháng ${existing.monthYear}`);
    });

    res.json({ success: true });
  });

  app.post('/api/allocation/in-charge/copy-from-month', async (req, res) => {
    const db = readDatabase();
    ensureModuleInChargeMembers(db);
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Không có quyền sao chép danh sách người phụ trách module.' });
    }

    const { fromMonthYear, toMonthYear } = req.body;
    if (!fromMonthYear || !toMonthYear) {
      return res.status(400).json({ error: 'Cần cung cấp tháng nguồn (fromMonthYear) và tháng đích (toMonthYear).' });
    }

    if (fromMonthYear === toMonthYear) {
      return res.status(400).json({ error: 'Tháng nguồn và tháng đích không được trùng nhau.' });
    }

    const currentMonth = getCurrentVietnamMonth();
    if (toMonthYear < currentMonth || isMonthLocked(toMonthYear, db.config)) {
      return res.status(403).json({ error: `Tháng đích ${toMonthYear} là tháng trong quá khứ hoặc đã bị khóa.` });
    }

    const sourceRecords = (db.moduleInChargeMembers || []).filter(ic => ic.monthYear === fromMonthYear);
    if (sourceRecords.length === 0) {
      return res.status(400).json({ error: `Tháng ${fromMonthYear} chưa có danh sách người phụ trách module nào để sao chép.` });
    }

    const existingTo = (db.moduleInChargeMembers || []).filter(ic => ic.monthYear === toMonthYear);
    const newItems: ModuleInChargeMember[] = [];

    for (const src of sourceRecords) {
      const duplicate = existingTo.some(
        e => e.moduleCode.toUpperCase() === src.moduleCode.toUpperCase() && e.onbCode === src.onbCode
      );
      if (!duplicate) {
        const mem = db.members.find(m => m.code === src.onbCode && m.isActive);
        if (mem) {
          const assignedGroup = resolveMemberGroupAtDate(db.members, mem.code, `${toMonthYear}-01`) || mem.currentGroup;
          newItems.push({
            id: `mic_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            monthYear: toMonthYear,
            moduleCode: src.moduleCode,
            onbCode: src.onbCode,
            assignedGroup,
            isPriority: src.isPriority,
            maxSessions: src.maxSessions,
            notes: src.notes,
            createdAt: new Date().toISOString()
          });
        }
      }
    }

    await updateDatabase(draft => {
      ensureModuleInChargeMembers(draft);
      draft.moduleInChargeMembers!.push(...newItems);
      addAuditLog(draft, session, 'CREATE', 'ALLOCATION', toMonthYear, `Sao chép ${newItems.length} người phụ trách module từ tháng ${fromMonthYear} sang ${toMonthYear}`);
    });

    res.json({
      success: true,
      copiedCount: newItems.length,
      skippedCount: sourceRecords.length - newItems.length,
      records: newItems,
      message: `Đã sao chép thành công ${newItems.length} nhân sự phụ trách sang tháng ${toMonthYear}.`
    });
  });

  // --- CẤU HÌNH LỊCH ĐÀO TẠO ĐỊNH KỲ TẠI CORE ---
  app.get('/api/core/recurring-schedules', (req, res) => {
    const db = readDatabase();
    ensureRecurringTrainingSchedules(db);
    res.json({ recurringSchedules: db.recurringTrainingSchedules || [] });
  });

  app.post('/api/core/recurring-schedules', async (req, res) => {
    const db = readDatabase();
    ensureRecurringTrainingSchedules(db);
    const session = getSession(req, db);

    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền cấu hình Lịch đào tạo định kỳ tại Core.' });
    }

    const { moduleCode, contentTitle, daysOfWeek, sessionOfDay, effectiveFrom, effectiveTo, defaultNotes, isActive, order } = req.body;
    if (!moduleCode || !contentTitle || !daysOfWeek || !sessionOfDay || !effectiveFrom) {
      return res.status(400).json({ error: 'Vui lòng nhập đầy đủ Module, Nội dung lớp, Các thứ tổ chức, Buổi học và Ngày bắt đầu hiệu lực.' });
    }

    const parsedDays: number[] = Array.isArray(daysOfWeek) ? daysOfWeek.map(Number) : [2];

    const newSchedule: RecurringTrainingSchedule = {
      id: `rts_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      moduleCode: moduleCode.trim().toUpperCase(),
      contentTitle: contentTitle.trim(),
      daysOfWeek: parsedDays,
      sessionOfDay: sessionOfDay === 'Sáng' || sessionOfDay === 'Chiều' ? sessionOfDay : 'Sáng',
      recurrenceRule: 'WEEKLY',
      effectiveFrom,
      effectiveTo: effectiveTo || undefined,
      defaultScoreRule: 'ĐTTT',
      defaultNotes: (defaultNotes || '').trim(),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      order: Number(order) || ((db.recurringTrainingSchedules?.length || 0) + 1),
      createdAt: new Date().toISOString()
    };

    await updateDatabase(draft => {
      ensureRecurringTrainingSchedules(draft);
      draft.recurringTrainingSchedules!.push(newSchedule);
      addAuditLog(draft, session, 'CREATE', 'CORE', newSchedule.id, `Tạo lịch mẫu định kỳ: ${newSchedule.contentTitle} (${newSchedule.moduleCode})`);
    });

    res.json({ success: true, recurringSchedule: newSchedule });
  });

  app.put('/api/core/recurring-schedules/:id', async (req, res) => {
    const db = readDatabase();
    ensureRecurringTrainingSchedules(db);
    const session = getSession(req, db);

    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền sửa Lịch đào tạo định kỳ tại Core.' });
    }

    const id = req.params.id;
    const existing = (db.recurringTrainingSchedules || []).find(s => s.id === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy lịch mẫu.' });

    const { moduleCode, contentTitle, daysOfWeek, sessionOfDay, effectiveFrom, effectiveTo, defaultNotes, isActive, order } = req.body;

    let updatedSchedule: RecurringTrainingSchedule | null = null;
    await updateDatabase(draft => {
      ensureRecurringTrainingSchedules(draft);
      const target = draft.recurringTrainingSchedules!.find(s => s.id === id);
      if (target) {
        const oldVal = { ...target };
        if (moduleCode !== undefined) target.moduleCode = moduleCode.trim().toUpperCase();
        if (contentTitle !== undefined) target.contentTitle = contentTitle.trim();
        if (daysOfWeek !== undefined && Array.isArray(daysOfWeek)) target.daysOfWeek = daysOfWeek.map(Number);
        if (sessionOfDay !== undefined) target.sessionOfDay = sessionOfDay === 'Sáng' || sessionOfDay === 'Chiều' ? sessionOfDay : target.sessionOfDay;
        if (effectiveFrom !== undefined) target.effectiveFrom = effectiveFrom;
        if (effectiveTo !== undefined) target.effectiveTo = effectiveTo || undefined;
        if (defaultNotes !== undefined) target.defaultNotes = (defaultNotes || '').trim();
        if (isActive !== undefined) target.isActive = Boolean(isActive);
        if (order !== undefined) target.order = Number(order);
        target.updatedAt = new Date().toISOString();
        updatedSchedule = target;
        addAuditLog(draft, session, 'UPDATE', 'CORE', id, `Cập nhật lịch mẫu định kỳ: ${target.contentTitle}`, oldVal, target);
      }
    });

    res.json({ success: true, recurringSchedule: updatedSchedule });
  });

  app.delete('/api/core/recurring-schedules/:id', async (req, res) => {
    const db = readDatabase();
    ensureRecurringTrainingSchedules(db);
    const session = getSession(req, db);

    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền xóa lịch mẫu tại Core.' });
    }

    const id = req.params.id;
    const existing = (db.recurringTrainingSchedules || []).find(s => s.id === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy lịch mẫu.' });

    // Check if any training packages exist that match or were generated from this schedule
    const linkedClasses = (db.trainingPackages || []).filter(p =>
      (p as any).sourceRecurringScheduleId === id ||
      (p.productCode === existing.moduleCode && p.sessionOfDay === existing.sessionOfDay)
    );

    if (linkedClasses.length > 0) {
      return res.status(400).json({
        error: `Danh mục này đã có dữ liệu phát sinh nên không thể xóa. Vui lòng chuyển sang trạng thái Ngưng sử dụng. (Phát sinh: ${linkedClasses.length} lớp đào tạo liên quan)`
      });
    }

    await updateDatabase(draft => {
      ensureRecurringTrainingSchedules(draft);
      draft.recurringTrainingSchedules = draft.recurringTrainingSchedules!.filter(s => s.id !== id);
      addAuditLog(draft, session, 'DELETE', 'CORE', id, `Xóa lịch đào tạo định kỳ tại Core: ${existing.contentTitle}`);
    });

    res.json({ success: true });
  });

  // --- TẠO LỚP TRONG THÁNG TỪ CORE ---
  // Preview Classes from Core
  app.post('/api/allocation/preview-classes-from-core', (req, res) => {
    const db = readDatabase();
    ensureRecurringTrainingSchedules(db);
    ensureTrainingModules(db);
    ensureCancelledOccurrenceKeys(db);

    const { monthYear, scheduleIds } = req.body;
    if (!monthYear) {
      return res.status(400).json({ error: 'Vui lòng cung cấp tháng/năm cần xem trước.' });
    }

    let candidateSchedules = (db.recurringTrainingSchedules || []).filter(s => s.isActive);
    if (Array.isArray(scheduleIds) && scheduleIds.length > 0) {
      candidateSchedules = candidateSchedules.filter(s => scheduleIds.includes(s.id));
    }

    if (candidateSchedules.length === 0) {
      return res.status(400).json({ error: 'Không có lịch mẫu định kỳ nào được chọn.' });
    }

    const [yStr, mStr] = monthYear.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const totalDaysInMonth = new Date(year, month, 0).getDate();

    const items: any[] = [];
    let newCount = 0;
    let existingCount = 0;
    let cancelledCount = 0;

    for (let day = 1; day <= totalDaysInMonth; day++) {
      const dStr = String(day).padStart(2, '0');
      const dateStr = `${monthYear}-${dStr}`;
      const wInfo = getVietnamWeekInfo(dateStr);

      for (const rts of candidateSchedules) {
        if (!rts.daysOfWeek.includes(wInfo.dayOfWeek)) {
          continue;
        }

        if (rts.effectiveFrom && dateStr < rts.effectiveFrom) {
          continue;
        }
        if (rts.effectiveTo && dateStr > rts.effectiveTo) {
          continue;
        }

        const occKey = `${rts.id}_${dateStr}_${rts.sessionOfDay}`;
        const isDuplicate = (db.trainingPackages || []).some(p => {
          if (p.occurrenceKey && p.occurrenceKey === occKey) return true;
          if (p.monthYear === monthYear && p.productCode === rts.moduleCode && p.scheduledDate === dateStr && p.sessionOfDay === rts.sessionOfDay) {
            return true;
          }
          return false;
        });

        const isCancelled = (db.cancelledOccurrenceKeys || []).includes(occKey);

        let status: 'Sẽ tạo mới' | 'Đã tồn tại' | 'Đã bị loại trừ' = 'Sẽ tạo mới';
        if (isDuplicate) {
          status = 'Đã tồn tại';
          existingCount++;
        } else if (isCancelled) {
          status = 'Đã bị loại trừ';
          cancelledCount++;
        } else {
          newCount++;
        }

        const scoreInfo = calculateTrainingClassScore(db, rts.moduleCode, dateStr);

        items.push({
          recurringScheduleId: rts.id,
          moduleCode: rts.moduleCode,
          contentTitle: rts.contentTitle,
          dayOfWeek: wInfo.dayOfWeek,
          dayOfWeekName: wInfo.dayOfWeekName,
          weekLabel: wInfo.weekLabel,
          scheduledDate: dateStr,
          dateLabel: `${dStr}/${mStr}`,
          sessionOfDay: rts.sessionOfDay,
          allocationPoints: scoreInfo.score,
          scoreUnit: scoreInfo.unit,
          scoreFormula: scoreInfo.formula,
          hasReferenceScore: scoreInfo.hasReferenceScore,
          occurrenceKey: occKey,
          status
        });
      }
    }

    res.json({
      success: true,
      monthYear,
      items,
      newCount,
      existingCount,
      cancelledCount
    });
  });

  app.post('/api/allocation/generate-classes-from-core', async (req, res) => {
    const db = readDatabase();
    ensureRecurringTrainingSchedules(db);
    ensureTrainingModules(db);
    ensureCancelledOccurrenceKeys(db);
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên và người được cấp quyền mới có quyền tạo lớp trong tháng từ Core.' });
    }

    const { monthYear, scheduleIds, ignoreCancelledExceptions } = req.body;
    if (!monthYear) {
      return res.status(400).json({ error: 'Vui lòng cung cấp tháng/năm cần sinh lớp.' });
    }

    const currentMonth = getCurrentVietnamMonth();
    if (monthYear < currentMonth || isMonthLocked(monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${monthYear} là tháng trong quá khứ hoặc đã bị khóa. Không thể tạo thêm lớp!` });
    }

    let candidateSchedules = (db.recurringTrainingSchedules || []).filter(s => s.isActive);
    if (Array.isArray(scheduleIds) && scheduleIds.length > 0) {
      candidateSchedules = candidateSchedules.filter(s => scheduleIds.includes(s.id));
    }

    if (candidateSchedules.length === 0) {
      return res.status(400).json({ error: 'Không có lịch mẫu định kỳ nào đang hoạt động tại Core được chọn.' });
    }

    const [yStr, mStr] = monthYear.split('-');
    const year = parseInt(yStr, 10);
    const month = parseInt(mStr, 10);
    const totalDaysInMonth = new Date(year, month, 0).getDate();

    const createdClasses: TrainingPackage[] = [];
    let skippedDuplicateCount = 0;
    let skippedCancelledCount = 0;

    await updateDatabase(draft => {
      if (!draft.trainingPackages) draft.trainingPackages = [];
      ensureCancelledOccurrenceKeys(draft);

      const existingCodes = draft.trainingPackages.map(p => p.packageCode).filter(Boolean);
      let nextSeq = 1;

      for (let day = 1; day <= totalDaysInMonth; day++) {
        const dStr = String(day).padStart(2, '0');
        const dateStr = `${monthYear}-${dStr}`;
        const wInfo = getVietnamWeekInfo(dateStr);

        for (const rts of candidateSchedules) {
          if (!rts.daysOfWeek.includes(wInfo.dayOfWeek)) {
            continue;
          }

          if (rts.effectiveFrom && dateStr < rts.effectiveFrom) {
            continue;
          }
          if (rts.effectiveTo && dateStr > rts.effectiveTo) {
            continue;
          }

          const occKey = `${rts.id}_${dateStr}_${rts.sessionOfDay}`;
          const isDuplicate = draft.trainingPackages.some(p => {
            if (p.occurrenceKey && p.occurrenceKey === occKey) return true;
            if (p.monthYear === monthYear && p.productCode === rts.moduleCode && p.scheduledDate === dateStr && p.sessionOfDay === rts.sessionOfDay) {
              return true;
            }
            return false;
          });

          if (isDuplicate) {
            skippedDuplicateCount++;
            continue;
          }

          if (!ignoreCancelledExceptions && draft.cancelledOccurrenceKeys && draft.cancelledOccurrenceKeys.includes(occKey)) {
            skippedCancelledCount++;
            continue;
          }

          const scoreInfo = calculateTrainingClassScore(draft, rts.moduleCode, dateStr);

          const mClean = monthYear.replace('-', '');
          let codeCandidate = `LOP-${mClean}-${String(nextSeq).padStart(3, '0')}`;
          while (existingCodes.includes(codeCandidate)) {
            nextSeq++;
            codeCandidate = `LOP-${mClean}-${String(nextSeq).padStart(3, '0')}`;
          }
          existingCodes.push(codeCandidate);
          nextSeq++;

          const modCatalog = (draft.trainingModules || []).find(m => m.code === rts.moduleCode);

          const newPkg: TrainingPackage = {
            id: `tp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            packageCode: codeCandidate,
            productCode: rts.moduleCode,
            moduleName: modCatalog?.name || rts.moduleCode,
            contentTitle: rts.contentTitle,
            title: rts.contentTitle,
            dayOfWeek: wInfo.dayOfWeek,
            dayOfWeekName: wInfo.dayOfWeekName,
            weekLabel: wInfo.weekLabel,
            recurringScheduleId: rts.id,
            occurrenceKey: occKey,
            sessionOfDay: rts.sessionOfDay,
            scheduledDate: dateStr,
            monthYear,
            allocationPoints: scoreInfo.score,
            scoreUnit: scoreInfo.unit,
            scoreFormula: scoreInfo.formula,
            hasReferenceScore: scoreInfo.hasReferenceScore,
            assignedOnbCode: undefined,
            assignedGroup: undefined,
            userNotes: rts.defaultNotes || '',
            systemNotes: scoreInfo.hasReferenceScore ? 'Sinh tự động từ lịch mẫu Core' : 'Chưa có điểm tham chiếu tại Core',
            isLocked: false,
            allocationStatus: 'Chưa phân bổ',
            scheduleStatus: 'Chưa điền lịch',
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          draft.trainingPackages.push(newPkg);
          createdClasses.push(newPkg);
        }
      }

      if (createdClasses.length > 0) {
        addAuditLog(draft, session, 'CREATE', 'ALLOCATION', monthYear, `Tạo ${createdClasses.length} lớp đào tạo từ lịch mẫu Core trong tháng ${monthYear} (Bỏ qua ${skippedDuplicateCount} lớp đã có, ${skippedCancelledCount} lớp đã hủy trước đó)`);
      }
    });

    res.json({
      success: true,
      monthYear,
      createdCount: createdClasses.length,
      skippedCount: skippedDuplicateCount,
      skippedCancelledCount,
      createdClasses,
      message: `Đã sinh thành công ${createdClasses.length} lớp đào tạo trong tháng ${monthYear} từ lịch mẫu Core.`
    });
  });

  // Priority registrations
  app.get('/api/allocation/priorities', (req, res) => {
    const db = readDatabase();
    const monthYear = (req.query.monthYear as string) || getCurrentVietnamMonth();
    const items = (db.trainingPriorities || []).filter(p => p.monthYear === monthYear);
    res.json({ priorities: items });
  });

  app.post('/api/allocation/priorities', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Không có quyền quản lý danh sách đăng ký ưu tiên.' });
    }

    const { monthYear, onbCode, moduleCode, maxSessions, order, notes } = req.body;
    if (!monthYear || !onbCode || !moduleCode) {
      return res.status(400).json({ error: 'Vui lòng cung cấp Tháng, Nhân sự và Module đăng ký.' });
    }

    const currentMonth = getCurrentVietnamMonth();
    const isPast = monthYear < currentMonth;
    const isReopened = isMonthReopened(monthYear, db.config);
    const isAdmin = Boolean(session.isMasterAdmin || session.role === 'admin');
    if (isMonthLocked(monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${monthYear} đã bị khóa sổ. Không thể thêm đăng ký ưu tiên!` });
    }
    if (isPast && !(isReopened && isAdmin)) {
      return res.status(403).json({ error: `Tháng ${monthYear} là tháng trong quá khứ (chỉ xem lịch sử, không thể thêm đăng ký ưu tiên).` });
    }

    const mem = db.members.find(m => m.code === onbCode && m.isActive);
    if (!mem) return res.status(400).json({ error: `Nhân sự "${onbCode}" không tồn tại hoặc đã ngừng hoạt động.` });

    const mod = (db.trainingModules || []).find(m => m.code === moduleCode);
    if (!mod) return res.status(400).json({ error: `Module "${moduleCode}" không tồn tại trong Core.` });

    // Anti-duplicate check
    const dup = (db.trainingPriorities || []).find(p =>
      p.monthYear === monthYear &&
      p.onbCode === onbCode &&
      p.moduleCode.toLowerCase() === moduleCode.toLowerCase()
    );
    if (dup) {
      return res.status(400).json({
        error: `Nhân sự ${mem.fullName} (${onbCode}) đã đăng ký ưu tiên module ${mod.code} trong tháng ${monthYear}.`
      });
    }

    const newPriority: TrainingPriorityRegistration = {
      id: `pr_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      monthYear,
      onbCode: mem.code,
      moduleCode: mod.code,
      maxSessions: maxSessions ? Number(maxSessions) : undefined,
      order: order ? Number(order) : 1,
      notes: (notes || '').trim(),
      createdAt: new Date().toISOString()
    };

    await updateDatabase(draft => {
      if (!draft.trainingPriorities) draft.trainingPriorities = [];
      draft.trainingPriorities.push(newPriority);
      addAuditLog(draft, session, 'CREATE', 'ALLOCATION', newPriority.id, `Đăng ký ưu tiên nhận lớp: ${mem.fullName} (${onbCode}) đăng ký module ${mod.code} tháng ${monthYear}`);
    });

    res.json({ success: true, priority: newPriority });
  });

  app.put('/api/allocation/priorities/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Không có quyền cập nhật đăng ký ưu tiên.' });
    }

    const id = req.params.id;
    const existing = (db.trainingPriorities || []).find(p => p.id === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy bản ghi đăng ký ưu tiên.' });

    const currentMonth = getCurrentVietnamMonth();
    const isPast = existing.monthYear < currentMonth;
    const isReopened = isMonthReopened(existing.monthYear, db.config);
    const isAdmin = Boolean(session.isMasterAdmin || session.role === 'admin');
    if (isMonthLocked(existing.monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} đã bị khóa sổ. Không thể cập nhật!` });
    }
    if (isPast && !(isReopened && isAdmin)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} là tháng trong quá khứ (chỉ xem lịch sử, không thể cập nhật).` });
    }

    const { onbCode, moduleCode, maxSessions, order, notes } = req.body;
    const targetOnb = onbCode ? String(onbCode).trim() : existing.onbCode;
    const targetModule = moduleCode ? String(moduleCode).trim() : existing.moduleCode;

    const mem = db.members.find(m => m.code === targetOnb && m.isActive);
    if (!mem) return res.status(400).json({ error: `Nhân sự "${targetOnb}" không tồn tại hoặc đã ngừng hoạt động.` });

    const mod = (db.trainingModules || []).find(m => m.code === targetModule);
    if (!mod) return res.status(400).json({ error: `Module "${targetModule}" không tồn tại trong Core.` });

    // Anti-duplicate check (exclude this record)
    const dup = (db.trainingPriorities || []).find(p =>
      p.id !== id &&
      p.monthYear === existing.monthYear &&
      p.onbCode === targetOnb &&
      p.moduleCode.toLowerCase() === targetModule.toLowerCase()
    );
    if (dup) {
      return res.status(400).json({
        error: `Nhân sự ${mem.fullName} (${targetOnb}) đã đăng ký ưu tiên module ${targetModule} trong tháng ${existing.monthYear}.`
      });
    }

    let updated: TrainingPriorityRegistration | null = null;
    await updateDatabase(draft => {
      if (!draft.trainingPriorities) draft.trainingPriorities = [];
      const item = draft.trainingPriorities.find(p => p.id === id);
      if (item) {
        item.onbCode = mem.code;
        item.moduleCode = mod.code;
        if (maxSessions !== undefined) item.maxSessions = maxSessions ? Number(maxSessions) : undefined;
        if (order !== undefined) item.order = order ? Number(order) : undefined;
        if (notes !== undefined) item.notes = (notes || '').trim();
        item.updatedAt = new Date().toISOString();
        updated = item;
        addAuditLog(draft, session, 'UPDATE', 'ALLOCATION', id, `Cập nhật đăng ký ưu tiên: ${mem.fullName} (${targetOnb}) module ${mod.code} tháng ${existing.monthYear}`);
      }
    });

    res.json({ success: true, priority: updated });
  });

  app.delete('/api/allocation/priorities/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Không có quyền xóa đăng ký ưu tiên.' });
    }

    const id = req.params.id;
    const existing = (db.trainingPriorities || []).find(p => p.id === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy bản ghi đăng ký ưu tiên.' });

    const currentMonth = getCurrentVietnamMonth();
    const isPast = existing.monthYear < currentMonth;
    const isReopened = isMonthReopened(existing.monthYear, db.config);
    const isAdmin = Boolean(session.isMasterAdmin || session.role === 'admin');
    if (isMonthLocked(existing.monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} đã bị khóa sổ. Không thể xóa!` });
    }
    if (isPast && !(isReopened && isAdmin)) {
      return res.status(403).json({ error: `Tháng ${existing.monthYear} là tháng trong quá khứ (chỉ xem lịch sử, không thể xóa).` });
    }

    await updateDatabase(draft => {
      draft.trainingPriorities = (draft.trainingPriorities || []).filter(p => p.id !== id);
      addAuditLog(draft, session, 'DELETE', 'ALLOCATION', id, `Xóa đăng ký ưu tiên: ${existing.onbCode} module ${existing.moduleCode} tháng ${existing.monthYear}`);
    });

    res.json({ success: true });
  });

  // Algorithm Simulation
  app.post('/api/allocation/simulate', (req, res) => {
    const db = readDatabase();
    ensureTrainingModules(db);
    ensureGroups(db);
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính và 2 người được chỉ định mới có quyền chạy phân bổ đào tạo.' });
    }

    const { monthYear, selectedGroupIds, packageIds, excludedOnbCodes: reqExclusions } = req.body;
    const targetMonth = monthYear || getCurrentVietnamMonth();

    if (isMonthLocked(targetMonth, db.config)) {
      return res.status(403).json({ error: `Tháng ${targetMonth} đã bị khóa. Không thể chạy phân bổ!` });
    }

    const currentMonth = getCurrentVietnamMonth();
    if (targetMonth < currentMonth) {
      return res.status(403).json({ error: `Tháng ${targetMonth} là tháng trong quá khứ (chỉ cho phép xem lịch sử, không thể chạy phân bổ lại).` });
    }

    // Determine participating groups
    const allActiveGroups = (db.groups || []).filter(g => g.isActive);
    let participatingGroups = allActiveGroups;
    if (Array.isArray(selectedGroupIds) && selectedGroupIds.length > 0) {
      participatingGroups = allActiveGroups.filter(g => selectedGroupIds.includes(g.id) || selectedGroupIds.includes(g.name));
    }
    if (participatingGroups.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn ít nhất 1 nhóm tham gia phân bổ trong tháng.' });
    }

    const groupNames = participatingGroups.map(g => g.name);

    // Exclusion list: Prioritize reqExclusions if passed, else load from db.monthlyAllocationExclusions[targetMonth]
    const exclusions: string[] = Array.isArray(reqExclusions)
      ? reqExclusions
      : (db.monthlyAllocationExclusions && db.monthlyAllocationExclusions[targetMonth]) || [];

    // All active members from Core
    const allActiveMembers = (db.members || []).filter(m => m.isActive !== false);

    // Participating members: All active ONB members MINUS those excluded (Requirement 2)
    const participatingMembers = allActiveMembers.filter(m => !exclusions.includes(m.code));
    if (participatingMembers.length === 0) {
      return res.status(400).json({ error: 'Không có nhân sự nào tham gia phân bổ trong tháng (toàn bộ nhân viên đã bị loại trừ hoặc ngừng hoạt động).' });
    }

    // Check which participating groups have no eligible members
    const emptyGroups = groupNames.filter(gName => !participatingMembers.some(m => m.currentGroup === gName));

    // Priorities for targetMonth (exclude members in exclusion list!)
    const monthPriorities = (db.trainingPriorities || []).filter(
      p => p.monthYear === targetMonth && !exclusions.includes(p.onbCode)
    );

    // Month packages
    const allMonthPackages = (db.trainingPackages || []).filter(p => p.monthYear === targetMonth);
    const packagesToProcess = packageIds && Array.isArray(packageIds)
      ? allMonthPackages.filter(p => packageIds.includes(p.id))
      : allMonthPackages;

    // Track running group points & class counts, member session counts, and priority usage counts
    const currentGroupPoints: Record<string, number> = {};
    const currentGroupCounts: Record<string, number> = {};
    const memberSessionCounts: Record<string, number> = {};
    const priorityUsage: Record<string, number> = {}; // key: `${onbCode}__${moduleCode.toUpperCase()}`

    groupNames.forEach(g => {
      currentGroupPoints[g] = 0;
      currentGroupCounts[g] = 0;
    });
    allActiveMembers.forEach(m => {
      memberSessionCounts[m.code] = 0;
    });

    // Set of occupied slots: "onbCode__date__session"
    const occupiedSlots = new Set<string>();

    // Add ALL schedules in db.schedules to occupied slots
    (db.schedules || []).forEach(s => {
      if (s.date && s.onbCode) {
        if (s.sessionOfDay === 'Sáng') {
          occupiedSlots.add(`${s.onbCode}__${s.date}__Sáng`);
        } else if (s.sessionOfDay === 'Chiều') {
          occupiedSlots.add(`${s.onbCode}__${s.date}__Chiều`);
        } else {
          // Full day or unspecified
          occupiedSlots.add(`${s.onbCode}__${s.date}__Sáng`);
          occupiedSlots.add(`${s.onbCode}__${s.date}__Chiều`);
        }
      }
    });

    const simulatedPackages: TrainingPackage[] = [];

    // Separate locked / already filled classes vs unlocked
    const fixedClasses = packagesToProcess.filter(p => p.isLocked || p.scheduleStatus === 'Đã điền lịch');
    const unlockedClasses = packagesToProcess.filter(p => !p.isLocked && p.scheduleStatus !== 'Đã điền lịch');

    // Register fixed classes into group totals and occupied slots
    for (const pkg of fixedClasses) {
      if (pkg.assignedGroup && pkg.assignedGroup in currentGroupPoints) {
        currentGroupPoints[pkg.assignedGroup] += (pkg.allocationPoints || 0);
        currentGroupCounts[pkg.assignedGroup] += 1;
      }
      if (pkg.assignedOnbCode) {
        memberSessionCounts[pkg.assignedOnbCode] = (memberSessionCounts[pkg.assignedOnbCode] || 0) + 1;
        if (pkg.scheduledDate && pkg.sessionOfDay) {
          occupiedSlots.add(`${pkg.assignedOnbCode}__${pkg.scheduledDate}__${pkg.sessionOfDay}`);
        }
      }
      simulatedPackages.push({
        ...pkg,
        systemNotes: pkg.scheduleStatus === 'Đã điền lịch' ? 'Đã điền lịch (giữ nguyên)' : 'Khóa phân công (giữ nguyên)'
      });
    }

    // Sort unlocked classes for optimal allocation:
    // 1. Classes with priority registrations first
    // 2. Higher allocationPoints descending
    // 3. Date asc, Session (Sáng before Chiều)
    const sortedUnlocked = [...unlockedClasses].sort((a, b) => {
      const aHasPriority = monthPriorities.some(pr => pr.moduleCode.toUpperCase() === a.productCode.toUpperCase());
      const bHasPriority = monthPriorities.some(pr => pr.moduleCode.toUpperCase() === b.productCode.toUpperCase());
      if (aHasPriority !== bHasPriority) return aHasPriority ? -1 : 1;

      const ptDiff = (b.allocationPoints || 0) - (a.allocationPoints || 0);
      if (ptDiff !== 0) return ptDiff;

      const d = (a.scheduledDate || '').localeCompare(b.scheduledDate || '');
      if (d !== 0) return d;
      const sA = a.sessionOfDay === 'Sáng' ? 0 : 1;
      const sB = b.sessionOfDay === 'Sáng' ? 0 : 1;
      return sA - sB;
    });

    // Allocate each class:
    // Requirement 2: Default ALL ONB members can take any module.
    // Requirement 3: Apply priority registrations first (within maxSessions, sorting by order).
    // Requirement 4: Balance points among 3 groups flexibly.
    for (const pkg of sortedUnlocked) {
      const classPoints = Number(pkg.allocationPoints) || 0;

      // Find free candidate members across participating groups
      const freeCandidates: Array<{
        member: ONBMember;
        groupName: string;
        hasPriority: boolean;
        priorityOrder: number;
        priorityMaxSessions: number;
        currentSessions: number;
      }> = [];

      const modulePriorities = monthPriorities.filter(
        pr => pr.moduleCode.toUpperCase() === pkg.productCode.toUpperCase()
      );

      for (const mem of participatingMembers) {
        // Group of member at scheduledDate
        const mGroup = resolveMemberGroupAtDate(db.members, mem.code, pkg.scheduledDate) || mem.currentGroup;
        if (!mGroup || !groupNames.includes(mGroup)) continue;

        // Check schedule conflict
        const slotKey = `${mem.code}__${pkg.scheduledDate}__${pkg.sessionOfDay}`;
        if (occupiedSlots.has(slotKey)) continue;

        // Check priority registration for this module
        const pr = modulePriorities.find(p => p.onbCode === mem.code);
        let hasPriority = false;
        let priorityOrder = 999;
        let priorityMax = Infinity;

        if (pr) {
          const used = priorityUsage[`${mem.code}__${pkg.productCode.toUpperCase()}`] || 0;
          const maxS = (pr.maxSessions !== undefined && pr.maxSessions > 0) ? pr.maxSessions : Infinity;
          if (used < maxS) {
            hasPriority = true;
            priorityOrder = pr.order !== undefined && pr.order > 0 ? pr.order : 1;
            priorityMax = maxS;
          }
        }

        freeCandidates.push({
          member: mem,
          groupName: mGroup,
          hasPriority,
          priorityOrder,
          priorityMaxSessions: priorityMax,
          currentSessions: memberSessionCounts[mem.code] || 0
        });
      }

      if (freeCandidates.length === 0) {
        simulatedPackages.push({
          ...pkg,
          assignedOnbCode: undefined,
          assignedGroup: undefined,
          allocationStatus: 'Chưa phân bổ',
          systemNotes: `Tất cả nhân sự tham gia (${participatingMembers.length} người) đều bị bận/trùng lịch hoặc đã bị loại trừ vào buổi ${pkg.sessionOfDay} ngày ${pkg.scheduledDate}`
        });
        continue;
      }

      // Check if there are priority candidates
      const priorityCandidates = freeCandidates.filter(c => c.hasPriority);

      let chosenCandidate: typeof freeCandidates[0];
      let noteText = '';

      if (priorityCandidates.length > 0) {
        // Requirement 3: Prioritize registered member by priority order
        const minOrder = Math.min(...priorityCandidates.map(c => c.priorityOrder));
        const bestPriority = priorityCandidates.filter(c => c.priorityOrder === minOrder);

        // Balance points among groups for priority candidates
        bestPriority.sort((a, b) => {
          const ptDiff = (currentGroupPoints[a.groupName] || 0) - (currentGroupPoints[b.groupName] || 0);
          if (ptDiff !== 0) return ptDiff;
          const sessDiff = a.currentSessions - b.currentSessions;
          if (sessDiff !== 0) return sessDiff;
          return 0;
        });

        // Pick top priority candidate
        const topGroupPoints = currentGroupPoints[bestPriority[0].groupName] || 0;
        const tiedTop = bestPriority.filter(p => (currentGroupPoints[p.groupName] || 0) === topGroupPoints);
        tiedTop.sort((a, b) => a.currentSessions - b.currentSessions);
        const minSess = tiedTop[0].currentSessions;
        const tiedSess = tiedTop.filter(p => p.currentSessions === minSess);
        chosenCandidate = tiedSess[Math.floor(Math.random() * tiedSess.length)];

        noteText = `Ưu tiên đăng ký: ${chosenCandidate.member.fullName} (${chosenCandidate.member.code}) - Thứ tự ${chosenCandidate.priorityOrder}`;
        priorityUsage[`${chosenCandidate.member.code}__${pkg.productCode.toUpperCase()}`] = (priorityUsage[`${chosenCandidate.member.code}__${pkg.productCode.toUpperCase()}`] || 0) + 1;
      } else {
        // Regular flexible allocation to balance points among groups (Requirement 4)
        // Group candidate groups that have free members
        const availableGroupNames = Array.from(new Set(freeCandidates.map(c => c.groupName)));

        // Sort groups by lowest current points, then lowest class count
        availableGroupNames.sort((a, b) => {
          const ptDiff = (currentGroupPoints[a] || 0) - (currentGroupPoints[b] || 0);
          if (ptDiff !== 0) return ptDiff;
          return (currentGroupCounts[a] || 0) - (currentGroupCounts[b] || 0);
        });

        const chosenGroupName = availableGroupNames[0];
        const groupCandidates = freeCandidates.filter(c => c.groupName === chosenGroupName);

        // Sort candidates within group by fewest current sessions
        groupCandidates.sort((a, b) => a.currentSessions - b.currentSessions);
        const minSess = groupCandidates[0].currentSessions;
        const tied = groupCandidates.filter(c => c.currentSessions === minSess);
        chosenCandidate = tied[Math.floor(Math.random() * tied.length)];

        noteText = `Phân bổ cân bằng điểm: ${chosenGroupName} (+${pkg.allocationPoints || 0}đ)`;
      }

      const allocatedMember = chosenCandidate.member;
      const allocatedGroup = chosenCandidate.groupName;
      const slotKey = `${allocatedMember.code}__${pkg.scheduledDate}__${pkg.sessionOfDay}`;
      occupiedSlots.add(slotKey);
      currentGroupPoints[allocatedGroup] += (pkg.allocationPoints || 0);
      currentGroupCounts[allocatedGroup] += 1;
      memberSessionCounts[allocatedMember.code] = (memberSessionCounts[allocatedMember.code] || 0) + 1;

      simulatedPackages.push({
        ...pkg,
        assignedOnbCode: allocatedMember.code,
        assignedGroup: allocatedGroup,
        allocationStatus: 'Đã phân bổ',
        systemNotes: noteText
      });
    }

    // Sort simulatedPackages back by scheduledDate, then sessionOfDay (Sáng before Chiều)
    simulatedPackages.sort((a, b) => {
      const d = (a.scheduledDate || '').localeCompare(b.scheduledDate || '');
      if (d !== 0) return d;
      const sA = a.sessionOfDay === 'Sáng' ? 0 : 1;
      const sB = b.sessionOfDay === 'Sáng' ? 0 : 1;
      return sA - sB;
    });

    const unallocatedClasses = simulatedPackages
      .filter(p => p.allocationStatus !== 'Đã phân bổ')
      .map(p => ({
        id: p.id,
        packageCode: p.packageCode,
        productCode: p.productCode,
        contentTitle: p.contentTitle || p.title,
        scheduledDate: p.scheduledDate,
        sessionOfDay: p.sessionOfDay,
        reason: p.systemNotes || 'Không tìm được nhân sự khả dụng'
      }));

    const totalAllocated = simulatedPackages.filter(p => p.allocationStatus === 'Đã phân bổ').length;
    const totalUnallocated = unallocatedClasses.length;

    const pointValues = groupNames.map(g => currentGroupPoints[g] || 0);
    const minGroupPoints = Math.min(...pointValues);
    const maxGroupPoints = Math.max(...pointValues);
    const maxDifference = Math.round((maxGroupPoints - minGroupPoints) * 100) / 100;

    let explanation = '';
    if (totalUnallocated > 0) {
      explanation = `Đã phân bổ ${totalAllocated}/${simulatedPackages.length} lớp. Còn ${totalUnallocated} lớp chưa thể phân bổ do trùng lịch hoặc thiếu nhân sự.`;
    } else if (maxDifference === 0) {
      explanation = 'Điểm đào tạo tập trung đã được cân bằng hoàn hảo giữa các nhóm tham gia.';
    } else {
      explanation = `Phân bổ thành công 100% lớp. Chênh lệch ${maxDifference} điểm giữa các nhóm (Điểm cao nhất: ${maxGroupPoints}đ, thấp nhất: ${minGroupPoints}đ) do kích thước điểm mỗi lớp là cố định.`;
    }

    res.json({
      success: true,
      monthYear: targetMonth,
      simulatedPackages,
      groupPointsResult: currentGroupPoints,
      groupClassCounts: currentGroupCounts,
      maxDifference,
      minGroupPoints,
      maxGroupPoints,
      explanation,
      emptyGroups,
      unallocatedClasses,
      totalAllocated,
      totalUnallocated,
      participatingCount: participatingMembers.length,
      excludedCount: exclusions.length
    });
  });

  // Save allocated assignments directly into trainingPackages
  app.post('/api/allocation/save-assignments', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính và người được chỉ định mới có quyền lưu kết quả phân bổ.' });
    }

    const { monthYear, assignments } = req.body;
    if (!monthYear || !Array.isArray(assignments)) {
      return res.status(400).json({ error: 'Cần cung cấp monthYear và danh sách phân công (assignments).' });
    }

    const currentMonth = getCurrentVietnamMonth();
    if (monthYear < currentMonth || isMonthLocked(monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${monthYear} là tháng trong quá khứ hoặc đã bị khóa. Không thể cập nhật!` });
    }

    await updateDatabase(draft => {
      for (const item of assignments) {
        const pkg = (draft.trainingPackages || []).find(p => p.id === item.id);
        if (!pkg) continue;

        if (item.assignedOnbCode) {
          const mem = draft.members.find(m => m.code === item.assignedOnbCode && m.isActive !== false);
          if (mem) {
            pkg.assignedOnbCode = mem.code;
            pkg.assignedGroup = resolveMemberGroupAtDate(draft.members, mem.code, pkg.scheduledDate) || mem.currentGroup;
            pkg.allocationStatus = 'Đã phân bổ';
            if (item.systemNotes) pkg.systemNotes = item.systemNotes;
          }
        } else {
          pkg.assignedOnbCode = undefined;
          pkg.assignedGroup = undefined;
          pkg.allocationStatus = 'Chưa phân bổ';
        }
        if (item.isLocked !== undefined) pkg.isLocked = Boolean(item.isLocked);
        pkg.updatedAt = new Date().toISOString();
      }
      addAuditLog(draft, session, 'UPDATE', 'ALLOCATION', monthYear, `Lưu kết quả phân bổ đào tạo tập trung tháng ${monthYear} cho ${assignments.length} lớp.`);
    });

    res.json({ success: true, message: `Đã lưu kết quả phân bổ thành công cho ${assignments.length} lớp.` });
  });

  // Confirm allocation and fill into Work Schedule
  app.post('/api/allocation/confirm-and-fill-schedules', async (req, res) => {
    const db = readDatabase();
    ensureScheduleWorkForms(db);
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính và 2 người được chỉ định mới có quyền chốt phân bổ và điền lịch.' });
    }

    const { monthYear, assignments } = req.body;
    if (!monthYear || !Array.isArray(assignments)) {
      return res.status(400).json({ error: 'Cần cung cấp monthYear và mảng assignments.' });
    }

    const currentMonth = getCurrentVietnamMonth();
    if (monthYear < currentMonth || isMonthLocked(monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${monthYear} là tháng trong quá khứ hoặc đã bị khóa. Không thể điền lịch!` });
    }

    // Look up Centralized Training work form in Core (code === 'DTTT')
    const wfDttt = (db.scheduleWorkForms || []).find(wf => wf.code === 'DTTT' || (wf.category === 'work' && wf.name.toLowerCase().includes('đào tạo tập trung')));
    if (!wfDttt) {
      return res.status(400).json({
        error: 'Chưa cấu hình hình thức Đào tạo tập trung (DTTT) tại Core. Vui lòng vào Phân hệ Core để kích hoạt hoặc thêm hình thức này trước khi điền lịch!'
      });
    }

    let newSuccessCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const involvedMembers = new Set<string>();
    const failedClasses: any[] = [];

    await updateDatabase(draft => {
      ensureScheduleWorkForms(draft);

      for (const item of assignments) {
        const pkg = draft.trainingPackages.find(p => p.id === item.id);
        if (!pkg) continue;

        const onbCode = item.assignedOnbCode;
        if (item.isLocked !== undefined) pkg.isLocked = Boolean(item.isLocked);

        // If no member assigned
        if (!onbCode) {
          pkg.assignedOnbCode = undefined;
          pkg.assignedGroup = undefined;
          pkg.allocationStatus = 'Chưa phân bổ';
          continue;
        }

        const mem = draft.members.find(m => m.code === onbCode);
        if (!mem || !mem.isActive) {
          failedCount++;
          pkg.scheduleStatus = 'Lỗi xung đột';
          pkg.fillScheduleError = `Nhân sự "${onbCode}" không tồn tại hoặc đã ngừng hoạt động`;
          failedClasses.push({
            id: pkg.id,
            packageCode: pkg.packageCode,
            productCode: pkg.productCode,
            moduleName: pkg.moduleName,
            contentTitle: pkg.contentTitle || pkg.title,
            scheduledDate: pkg.scheduledDate,
            dayOfWeek: pkg.dayOfWeek,
            dayOfWeekName: pkg.dayOfWeekName,
            sessionOfDay: pkg.sessionOfDay,
            assignedOnbCode: onbCode,
            memberName: mem ? mem.fullName : onbCode,
            assignedGroup: pkg.assignedGroup || '—',
            reason: pkg.fillScheduleError,
            conflictingSchedule: null
          });
          continue;
        }

        pkg.assignedOnbCode = mem.code;
        pkg.assignedGroup = resolveMemberGroupAtDate(draft.members, mem.code, pkg.scheduledDate) || mem.currentGroup;
        involvedMembers.add(mem.code);

        // Check if class already has an existing valid schedule linked
        if (pkg.scheduleId) {
          const existingSch = draft.schedules.find(s => s.id === pkg.scheduleId);
          if (existingSch && existingSch.onbCode === mem.code && existingSch.date === pkg.scheduledDate && existingSch.sessionOfDay === pkg.sessionOfDay) {
            pkg.scheduleStatus = 'Đã điền lịch';
            pkg.allocationStatus = 'Đã xác nhận';
            skippedCount++;
            continue;
          }
        }

        // Check conflict with existing schedules for this member on that date & session
        // Rule: Không ghi đè ô lịch có sẵn, kể cả ô còn lưu lịch đã hủy!
        const conflict = draft.schedules.find(s => {
          if (s.onbCode !== mem.code || s.date !== pkg.scheduledDate) return false;
          if (pkg.scheduleId && s.id === pkg.scheduleId) return false;
          if (s.sourceTrainingPackageId && s.sourceTrainingPackageId === pkg.id) return false;
          // Session match
          if (s.sessionOfDay && s.sessionOfDay !== pkg.sessionOfDay && !s.fullDay) return false;
          return true;
        });

        if (conflict) {
          failedCount++;
          pkg.scheduleStatus = 'Lỗi xung đột';
          const sessionLabel = pkg.sessionOfDay.toLowerCase();
          const dParts = pkg.scheduledDate.split('-');
          const dateLabel = `${dParts[2]}/${dParts[1]}`;
          const conflictFormName = conflict.workFormName || conflict.workTypeCode;
          const conflictContent = conflict.customerOrTask;
          const statusText = conflict.status === 'Đã hủy' || conflict.status === 'Hủy' ? ' (Đã hủy)' : '';

          pkg.fillScheduleError = `Không điền được lớp ${pkg.contentTitle || pkg.moduleName || pkg.productCode} vào ${sessionLabel} ${dateLabel} cho ${mem.fullName} vì ô lịch đã có dữ liệu "${conflictFormName}"${statusText}, nội dung "${conflictContent}".`;
          pkg.conflictingScheduleInfo = {
            scheduleId: conflict.id,
            workFormName: conflictFormName + statusText,
            customerOrTask: conflictContent,
            sessionOfDay: conflict.sessionOfDay || (conflict.fullDay ? 'Cả ngày' : 'Sáng & Chiều'),
            onbCode: mem.code
          };

          failedClasses.push({
            id: pkg.id,
            packageCode: pkg.packageCode,
            productCode: pkg.productCode,
            moduleName: pkg.moduleName,
            contentTitle: pkg.contentTitle || pkg.title,
            scheduledDate: pkg.scheduledDate,
            dayOfWeek: pkg.dayOfWeek,
            dayOfWeekName: pkg.dayOfWeekName,
            sessionOfDay: pkg.sessionOfDay,
            assignedOnbCode: mem.code,
            memberName: mem.fullName,
            assignedGroup: pkg.assignedGroup,
            reason: pkg.fillScheduleError,
            conflictingSchedule: pkg.conflictingScheduleInfo
          });
        } else {
          // Free slot: create new schedule
          const newSch: WorkSchedule = {
            id: `sch_dttt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            onbCode: mem.code,
            collaborators: [],
            date: pkg.scheduledDate,
            sessionOfDay: pkg.sessionOfDay,
            workFormId: wfDttt.id,
            workTypeCode: wfDttt.code || 'DTTT',
            workFormName: wfDttt.name || 'Đào tạo tập trung (ĐTTT)',
            workFormCategory: 'work',
            productCode: pkg.productCode,
            customerOrTask: pkg.contentTitle || `Đào tạo tập trung: ${pkg.moduleName || pkg.productCode}`,
            notes: pkg.userNotes || '',
            status: 'Kế hoạch',
            monthYear,
            sourceTrainingPackageId: pkg.id,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            updatedBy: session.onbCode
          };

          draft.schedules.push(newSch);
          pkg.scheduleId = newSch.id;
          pkg.scheduleStatus = 'Đã điền lịch';
          pkg.allocationStatus = 'Đã xác nhận';
          pkg.fillScheduleError = undefined;
          pkg.conflictingScheduleInfo = undefined;
          newSuccessCount++;
        }
      }

      addAuditLog(draft, session, 'ALLOCATE', 'ALLOCATION', monthYear, `Chốt phân bổ & điền lịch tháng ${monthYear}: Điền mới ${newSuccessCount}, Bỏ qua ${skippedCount}, Xung đột ${failedCount}`);
    });

    res.json({
      success: true,
      monthYear,
      totalProcessed: assignments.length,
      newSuccessCount,
      skippedCount,
      failedCount,
      uniqueMembersCount: involvedMembers.size,
      failedClasses
    });
  });

  // Retry failed classes
  app.post('/api/allocation/retry-failed-classes', async (req, res) => {
    const db = readDatabase();
    ensureScheduleWorkForms(db);
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Không có quyền điền lại lịch.' });
    }

    const { monthYear, reassignments } = req.body;
    if (!monthYear || !Array.isArray(reassignments)) {
      return res.status(400).json({ error: 'Cần cung cấp monthYear và reassignments.' });
    }

    const currentMonth = getCurrentVietnamMonth();
    if (monthYear < currentMonth || isMonthLocked(monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${monthYear} là tháng trong quá khứ hoặc đã bị khóa.` });
    }

    const wfDttt = (db.scheduleWorkForms || []).find(wf => wf.code === 'DTTT' || (wf.category === 'work' && wf.name.toLowerCase().includes('đào tạo tập trung')));
    if (!wfDttt) {
      return res.status(400).json({ error: 'Chưa cấu hình hình thức Đào tạo tập trung (DTTT) tại Core.' });
    }

    let retrySuccessCount = 0;
    let stillFailedCount = 0;
    const remainingFailed: any[] = [];

    await updateDatabase(draft => {
      for (const item of reassignments) {
        const pkg = draft.trainingPackages.find(p => p.id === item.classId);
        if (!pkg) continue;

        // Never touch already filled classes
        if (pkg.scheduleStatus === 'Đã điền lịch' && pkg.scheduleId) {
          continue;
        }

        const mem = draft.members.find(m => m.code === item.assignedOnbCode);
        if (!mem || !mem.isActive) {
          stillFailedCount++;
          pkg.fillScheduleError = `Nhân sự không hợp lệ hoặc ngừng hoạt động`;
          remainingFailed.push({
            id: pkg.id,
            packageCode: pkg.packageCode,
            productCode: pkg.productCode,
            moduleName: pkg.moduleName,
            contentTitle: pkg.contentTitle || pkg.title,
            scheduledDate: pkg.scheduledDate,
            dayOfWeek: pkg.dayOfWeek,
            dayOfWeekName: pkg.dayOfWeekName,
            sessionOfDay: pkg.sessionOfDay,
            assignedOnbCode: item.assignedOnbCode,
            memberName: mem ? mem.fullName : item.assignedOnbCode,
            assignedGroup: pkg.assignedGroup,
            reason: pkg.fillScheduleError,
            conflictingSchedule: null
          });
          continue;
        }

        pkg.assignedOnbCode = mem.code;
        pkg.assignedGroup = resolveMemberGroupAtDate(draft.members, mem.code, pkg.scheduledDate) || mem.currentGroup;

        // Re-check conflict (including cancelled schedules)
        const conflict = draft.schedules.find(s => {
          if (s.onbCode !== mem.code || s.date !== pkg.scheduledDate) return false;
          if (pkg.scheduleId && s.id === pkg.scheduleId) return false;
          if (s.sourceTrainingPackageId && s.sourceTrainingPackageId === pkg.id) return false;
          if (s.sessionOfDay && s.sessionOfDay !== pkg.sessionOfDay && !s.fullDay) return false;
          return true;
        });

        if (conflict) {
          stillFailedCount++;
          pkg.scheduleStatus = 'Lỗi xung đột';
          const sessionLabel = pkg.sessionOfDay.toLowerCase();
          const dParts = pkg.scheduledDate.split('-');
          const dateLabel = `${dParts[2]}/${dParts[1]}`;
          const conflictFormName = conflict.workFormName || conflict.workTypeCode;
          const conflictContent = conflict.customerOrTask;
          const statusText = conflict.status === 'Đã hủy' || conflict.status === 'Hủy' ? ' (Đã hủy)' : '';

          pkg.fillScheduleError = `Không điền được lớp ${pkg.contentTitle || pkg.moduleName || pkg.productCode} vào ${sessionLabel} ${dateLabel} cho ${mem.fullName} vì ô lịch đã có dữ liệu "${conflictFormName}"${statusText}, nội dung "${conflictContent}".`;
          pkg.conflictingScheduleInfo = {
            scheduleId: conflict.id,
            workFormName: conflictFormName + statusText,
            customerOrTask: conflictContent,
            sessionOfDay: conflict.sessionOfDay || (conflict.fullDay ? 'Cả ngày' : 'Sáng & Chiều'),
            onbCode: mem.code
          };

          remainingFailed.push({
            id: pkg.id,
            packageCode: pkg.packageCode,
            productCode: pkg.productCode,
            moduleName: pkg.moduleName,
            contentTitle: pkg.contentTitle || pkg.title,
            scheduledDate: pkg.scheduledDate,
            dayOfWeek: pkg.dayOfWeek,
            dayOfWeekName: pkg.dayOfWeekName,
            sessionOfDay: pkg.sessionOfDay,
            assignedOnbCode: mem.code,
            memberName: mem.fullName,
            assignedGroup: pkg.assignedGroup,
            reason: pkg.fillScheduleError,
            conflictingSchedule: pkg.conflictingScheduleInfo
          });
        } else {
          // Idempotent: ensure no other schedule exists with sourceTrainingPackageId
          const existingSch = draft.schedules.find(s => s.sourceTrainingPackageId === pkg.id);
          if (existingSch) {
            existingSch.onbCode = mem.code;
            existingSch.status = 'Kế hoạch';
            pkg.scheduleId = existingSch.id;
          } else {
            const newSch: WorkSchedule = {
              id: `sch_dttt_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              onbCode: mem.code,
              collaborators: [],
              date: pkg.scheduledDate,
              sessionOfDay: pkg.sessionOfDay,
              workFormId: wfDttt.id,
              workTypeCode: wfDttt.code || 'DTTT',
              workFormName: wfDttt.name || 'Đào tạo tập trung (ĐTTT)',
              workFormCategory: 'work',
              productCode: pkg.productCode,
              customerOrTask: pkg.contentTitle || `Đào tạo tập trung: ${pkg.moduleName || pkg.productCode}`,
              notes: pkg.userNotes || '',
              status: 'Kế hoạch',
              monthYear,
              sourceTrainingPackageId: pkg.id,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              updatedBy: session.onbCode
            };
            draft.schedules.push(newSch);
            pkg.scheduleId = newSch.id;
          }

          pkg.scheduleStatus = 'Đã điền lịch';
          pkg.allocationStatus = 'Đã xác nhận';
          pkg.fillScheduleError = undefined;
          pkg.conflictingScheduleInfo = undefined;
          retrySuccessCount++;
        }
      }

      addAuditLog(draft, session, 'ALLOCATE', 'ALLOCATION', monthYear, `Điền lại lớp chưa thành công tháng ${monthYear}: Thành công ${retrySuccessCount}, Chưa thành công ${stillFailedCount}`);
    });

    res.json({
      success: true,
      retrySuccessCount,
      stillFailedCount,
      remainingFailed
    });
  });

  // History Lookup API (Xem lại lịch các tháng trước của từng người)
  app.get('/api/allocation/history-lookup', (req, res) => {
    const db = readDatabase();
    const monthYear = (req.query.monthYear as string) || getCurrentVietnamMonth();
    const onbCode = req.query.onbCode as string;
    const groupId = req.query.groupId as string;
    const moduleCode = req.query.moduleCode as string;
    const status = req.query.status as string;

    const allMonthPackages = (db.trainingPackages || []).filter(p => p.monthYear === monthYear);
    const hasData = allMonthPackages.length > 0;

    let filtered = allMonthPackages;
    if (onbCode) {
      filtered = filtered.filter(p => p.assignedOnbCode === onbCode);
    }
    if (groupId) {
      filtered = filtered.filter(p => p.assignedGroup === groupId);
    }
    if (moduleCode) {
      filtered = filtered.filter(p => p.productCode.toUpperCase() === moduleCode.toUpperCase());
    }
    if (status) {
      if (status === 'FILLED') {
        filtered = filtered.filter(p => p.scheduleStatus === 'Đã điền lịch');
      } else if (status === 'UNFILLED') {
        filtered = filtered.filter(p => p.scheduleStatus !== 'Đã điền lịch');
      } else if (status === 'ALLOCATED') {
        filtered = filtered.filter(p => Boolean(p.assignedOnbCode));
      } else if (status === 'UNALLOCATED') {
        filtered = filtered.filter(p => !p.assignedOnbCode);
      }
    }

    // Sort by scheduledDate ASC, sessionOfDay (Sáng before Chiều), productCode ASC
    filtered.sort((a, b) => {
      const d = (a.scheduledDate || '').localeCompare(b.scheduledDate || '');
      if (d !== 0) return d;
      const sA = a.sessionOfDay === 'Sáng' ? 0 : 1;
      const sB = b.sessionOfDay === 'Sáng' ? 0 : 1;
      if (sA !== sB) return sA - sB;
      return (a.productCode || '').localeCompare(b.productCode || '');
    });

    const totalPoints = filtered.reduce((sum, p) => sum + (Number(p.allocationPoints) || 0), 0);

    res.json({
      monthYear,
      hasData,
      packages: filtered,
      totalClasses: filtered.length,
      totalPoints: Math.round(totalPoints * 100) / 100
    });
  });

  // Safe unlink schedule for reallocation
  app.post('/api/allocation/unlink-schedule/:id', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.canManageAllocation) {
      return res.status(403).json({ error: 'Không có quyền điều chuyển hoặc hủy liên kết lịch.' });
    }

    const id = req.params.id;
    const pkg = (db.trainingPackages || []).find(p => p.id === id);
    if (!pkg) return res.status(404).json({ error: 'Không tìm thấy lớp.' });

    if (isMonthLocked(pkg.monthYear, db.config)) {
      return res.status(403).json({ error: `Tháng ${pkg.monthYear} đã bị khóa.` });
    }

    await updateDatabase(draft => {
      const target = draft.trainingPackages.find(p => p.id === id);
      if (target) {
        if (target.scheduleId) {
          draft.schedules = draft.schedules.filter(s => s.id !== target.scheduleId && s.sourceTrainingPackageId !== id);
        }
        target.scheduleId = undefined;
        target.scheduleStatus = 'Chưa điền lịch';
        target.allocationStatus = 'Chưa phân bổ';
        target.updatedAt = new Date().toISOString();
        addAuditLog(draft, session, 'UPDATE', 'ALLOCATION', id, `Hủy liên kết lịch để điều chuyển lớp ${target.packageCode}`);
      }
    });

    res.json({ success: true });
  });

  // Core Training Modules CRUD
  app.get('/api/core/training-modules', (req, res) => {
    const db = readDatabase();
    ensureTrainingModules(db);
    res.json({ modules: db.trainingModules || [] });
  });

  app.post('/api/core/training-modules', async (req, res) => {
    const db = readDatabase();
    ensureTrainingModules(db);
    const session = getSession(req, db);

    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền thêm module đào tạo tập trung tại Core.' });
    }

    const { code, name, defaultSession, order, description, isActive } = req.body;
    if (!code || !code.trim() || !name || !name.trim()) {
      return res.status(400).json({ error: 'Vui lòng nhập Mã và Tên module.' });
    }

    const trimmedCode = code.trim().toUpperCase();
    if (db.trainingModules?.some(m => m.code.toUpperCase() === trimmedCode)) {
      return res.status(400).json({ error: `Mã module "${trimmedCode}" đã tồn tại trong Core.` });
    }

    const newMod: TrainingModuleCatalog = {
      id: `tm_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      code: trimmedCode,
      name: name.trim(),
      defaultSession: defaultSession === 'Sáng' || defaultSession === 'Chiều' ? defaultSession : '',
      order: Number(order) || ((db.trainingModules?.length || 0) + 1),
      isActive: isActive !== undefined ? Boolean(isActive) : true,
      description: (description || '').trim()
    };

    await updateDatabase(draft => {
      ensureTrainingModules(draft);
      draft.trainingModules!.push(newMod);
      addAuditLog(draft, session, 'CREATE', 'CORE', newMod.id, `Tạo module đào tạo tập trung: ${newMod.name} (${newMod.code})`, null, newMod);
    });

    res.json({ success: true, module: newMod });
  });

  app.put('/api/core/training-modules/:id', async (req, res) => {
    const db = readDatabase();
    ensureTrainingModules(db);
    const session = getSession(req, db);

    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền sửa module đào tạo tại Core.' });
    }

    const id = req.params.id;
    const existing = db.trainingModules?.find(m => m.id === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy module trong Core.' });

    const { code, name, defaultSession, order, isActive, description } = req.body;
    const oldCode = existing.code;
    const newCode = code ? code.trim().toUpperCase() : oldCode;

    // Check duplicate code excluding self
    if (newCode !== oldCode) {
      if (db.trainingModules?.some(m => m.id !== id && m.code.toUpperCase() === newCode)) {
        return res.status(400).json({ error: `Mã module "${newCode}" đã tồn tại trên module khác.` });
      }
    }

    let updatedMod: TrainingModuleCatalog | null = null;
    await updateDatabase(draft => {
      ensureTrainingModules(draft);
      const mod = draft.trainingModules!.find(m => m.id === id);
      if (mod) {
        const oldVal = { ...mod };
        mod.code = newCode;
        if (name !== undefined) mod.name = name.trim();
        if (defaultSession !== undefined) {
          mod.defaultSession = defaultSession === 'Sáng' || defaultSession === 'Chiều' ? defaultSession : '';
        }
        if (order !== undefined) mod.order = Number(order);
        if (isActive !== undefined) mod.isActive = Boolean(isActive);
        if (description !== undefined) mod.description = (description || '').trim();

        // Propagate code change to recurring schedules, training classes, in-charge assignments
        if (newCode !== oldCode) {
          if (Array.isArray(draft.recurringTrainingSchedules)) {
            draft.recurringTrainingSchedules.forEach(s => {
              if (s.moduleCode === oldCode) s.moduleCode = newCode;
            });
          }
          if (Array.isArray(draft.trainingPackages)) {
            draft.trainingPackages.forEach(p => {
              if (p.productCode === oldCode) p.productCode = newCode;
            });
          }
          if (Array.isArray(draft.moduleInChargeMembers)) {
            draft.moduleInChargeMembers.forEach(ic => {
              if (ic.moduleCode === oldCode) ic.moduleCode = newCode;
            });
          }
        }

        updatedMod = mod;
        addAuditLog(draft, session, 'UPDATE', 'CORE', id, `Cập nhật module đào tạo: ${mod.name} (${oldCode} -> ${newCode})`, oldVal, mod);
      }
    });

    res.json({ success: true, module: updatedMod });
  });

  app.delete('/api/core/training-modules/:id', async (req, res) => {
    const db = readDatabase();
    ensureTrainingModules(db);
    const session = getSession(req, db);

    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền xóa module đào tạo tại Core.' });
    }

    const id = req.params.id;
    const existing = db.trainingModules?.find(m => m.id === id);
    if (!existing) return res.status(404).json({ error: 'Không tìm thấy module.' });

    // Check if referenced in training packages, recurring schedules, or module in-charge
    const classCount = (db.trainingPackages || []).filter(p => p.productCode === existing.code).length;
    const recurCount = (db.recurringTrainingSchedules || []).filter(s => s.moduleCode === existing.code).length;
    const inChargeCount = (db.moduleInChargeMembers || []).filter(ic => ic.moduleCode === existing.code).length;

    const totalUsage = classCount + recurCount + inChargeCount;
    if (totalUsage > 0) {
      return res.status(400).json({
        error: `Danh mục này đã có dữ liệu phát sinh nên không thể xóa. Vui lòng chuyển sang trạng thái Ngưng sử dụng. (Phát sinh: ${classCount} lớp đào tạo, ${recurCount} lịch mẫu định kỳ, ${inChargeCount} phân công phụ trách)`
      });
    }

    await updateDatabase(draft => {
      draft.trainingModules = draft.trainingModules!.filter(m => m.id !== id);
      addAuditLog(draft, session, 'DELETE', 'CORE', id, `Xóa module đào tạo chưa từng sử dụng: ${existing.name}`);
    });

    res.json({ success: true });
  });

  // 8. History & Month Locks APIs
  app.get('/api/history/months', (req, res) => {
    const db = readDatabase();
    const currentMonth = getCurrentVietnamMonth();

    // Collect all months from schedules, progress, packages, bonuses
    const monthSet = new Set<string>();
    // Start from 2026-01 up to current + 3 months
    for (let m = 1; m <= 12; m++) {
      const mStr = m < 10 ? `0${m}` : `${m}`;
      monthSet.add(`2026-${mStr}`);
    }

    db.schedules.forEach(s => monthSet.add(s.monthYear));
    db.progress.forEach(p => monthSet.add(p.monthYear));
    db.packages.forEach(p => monthSet.add(p.monthYear));
    db.bonuses.forEach(b => monthSet.add(b.monthYear));

    const sortedMonths = Array.from(monthSet).sort().reverse();

    const monthList = sortedMonths.map(m => {
      const lockInfo = getMonthLockStatus(m, db.config);
      const scheduleCount = db.schedules.filter(s => s.monthYear === m).length;
      const progressCount = db.progress.filter(p => p.monthYear === m).length;
      const packageCount = db.packages.filter(p => p.monthYear === m).length;
      const bonusCount = db.bonuses.filter(b => b.monthYear === m).length;

      return {
        monthYear: m,
        isCurrent: m === currentMonth,
        status: lockInfo.status,
        statusLabel: lockInfo.label,
        isLocked: lockInfo.isLocked,
        isReopened: lockInfo.isReopened,
        scheduleCount,
        progressCount,
        packageCount,
        bonusCount
      };
    });

    res.json({
      currentVietnamMonth: currentMonth,
      months: monthList,
      systemLockedMonths: db.config.systemLockedMonths || [],
      reopenedMonths: db.config.reopenedMonths || []
    });
  });

  app.post('/api/history/months/reopen', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.isMasterAdmin && session.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Quản trị viên (Admin) mới có quyền mở lại sổ tháng đã khóa.' });
    }

    const { monthYear, reason } = req.body;
    if (!monthYear || !/^\d{4}-\d{2}$/.test(monthYear)) {
      return res.status(400).json({ error: 'Định dạng tháng không hợp lệ (YYYY-MM).' });
    }

    const trimmedReason = (reason || '').trim();
    if (!trimmedReason) {
      return res.status(400).json({ error: 'Vui lòng nhập lý do mở sổ để lưu vết đối chiếu.' });
    }

    let updatedConfig = db.config;
    await updateDatabase(draft => {
      if (!Array.isArray(draft.config.reopenedMonths)) {
        draft.config.reopenedMonths = [];
      }
      if (!Array.isArray(draft.config.systemLockedMonths)) {
        draft.config.systemLockedMonths = [];
      }

      if (!draft.config.reopenedMonths.includes(monthYear)) {
        draft.config.reopenedMonths.push(monthYear);
      }
      draft.config.systemLockedMonths = draft.config.systemLockedMonths.filter(m => m !== monthYear);

      updatedConfig = draft.config;

      addAuditLog(
        draft,
        session,
        'UPDATE',
        'HISTORY',
        monthYear,
        `Mở lại sổ tháng ${monthYear} để điều chỉnh dữ liệu. Lý do: ${trimmedReason}`,
        { status: 'LOCKED', isLocked: true },
        { status: 'REOPENED', isLocked: false, isReopened: true, reason: trimmedReason }
      );
    });

    const statusInfo = getMonthLockStatus(monthYear, updatedConfig);
    res.json({
      success: true,
      monthYear,
      status: statusInfo.status,
      statusLabel: statusInfo.label,
      isLocked: statusInfo.isLocked,
      isReopened: statusInfo.isReopened,
      config: updatedConfig
    });
  });

  app.post('/api/history/months/lock', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.isMasterAdmin && session.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Quản trị viên (Admin) mới có quyền khóa sổ tháng.' });
    }

    const { monthYear } = req.body;
    if (!monthYear || !/^\d{4}-\d{2}$/.test(monthYear)) {
      return res.status(400).json({ error: 'Định dạng tháng không hợp lệ (YYYY-MM).' });
    }

    let updatedConfig = db.config;
    await updateDatabase(draft => {
      if (!Array.isArray(draft.config.reopenedMonths)) {
        draft.config.reopenedMonths = [];
      }
      if (!Array.isArray(draft.config.systemLockedMonths)) {
        draft.config.systemLockedMonths = [];
      }

      draft.config.reopenedMonths = draft.config.reopenedMonths.filter(m => m !== monthYear);
      if (!draft.config.systemLockedMonths.includes(monthYear)) {
        draft.config.systemLockedMonths.push(monthYear);
      }

      updatedConfig = draft.config;

      addAuditLog(
        draft,
        session,
        'UPDATE',
        'HISTORY',
        monthYear,
        `Khóa sổ tháng ${monthYear}. Dữ liệu chuyển về chế độ Chỉ Đọc (Read-Only).`,
        { status: 'REOPENED', isLocked: false },
        { status: 'LOCKED', isLocked: true, isReopened: false }
      );
    });

    const statusInfo = getMonthLockStatus(monthYear, updatedConfig);
    res.json({
      success: true,
      monthYear,
      status: statusInfo.status,
      statusLabel: statusInfo.label,
      isLocked: statusInfo.isLocked,
      isReopened: statusInfo.isReopened,
      config: updatedConfig
    });
  });

  // 9. Excel Import & Reconciliation APIs
  app.post('/api/import/preview', (req, res) => {
    const db = readDatabase();
    const { rows, targetType, monthYear } = req.body;

    if (!Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Không có dữ liệu hàng nào được tải lên.' });
    }

    const errors: { row: number; field: string; message: string }[] = [];
    const validRows: any[] = [];
    const memberCodeMap = new Map(db.members.map(m => [m.code.toUpperCase(), m]));
    const memberShortMap = new Map(db.members.map(m => [m.shortCode.toUpperCase(), m]));
    const memberDisplayMap = new Map(db.members.map(m => [m.displayName.toUpperCase(), m]));

    rows.forEach((r, idx) => {
      const rowIdx = idx + 1;
      const rawCode = (r.onbCode || r.shortCode || r.personnel || '').toString().trim().toUpperCase();

      const member = memberCodeMap.get(rawCode) || memberShortMap.get(rawCode) || memberDisplayMap.get(rawCode);

      if (!member) {
        errors.push({ row: rowIdx, field: 'onbCode', message: `Không tìm thấy nhân sự ứng với mã/tên "${rawCode}"` });
        return;
      }

      if (targetType === 'schedules') {
        const dateStr = (r.date || '').toString().trim();
        if (!dateStr || !dateStr.includes('-')) {
          errors.push({ row: rowIdx, field: 'date', message: 'Ngày không đúng định dạng YYYY-MM-DD' });
          return;
        }
        validRows.push({
          onbCode: member.code,
          date: dateStr,
          workTypeCode: r.workTypeCode || 'TVTK_TT',
          productCode: r.productCode || 'CRM',
          customerOrTask: r.customerOrTask || r.content || 'Công việc',
          monthYear: dateStr.slice(0, 7),
          status: 'Hoàn thành'
        });
      } else if (targetType === 'progress') {
        const dateStr = (r.date || '').toString().trim() || `${monthYear || '2026-07'}-01`;
        validRows.push({
          taskName: r.taskName || r.customerOrTask || 'Nhiệm vụ',
          primaryOnbCode: member.code,
          workTypeCode: r.workTypeCode || 'TVTK_TT',
          productCode: r.productCode || 'CRM',
          date: dateStr,
          monthYear: dateStr.slice(0, 7),
          suggestedScore: Number(r.suggestedScore) || 0,
          recordedScore: Number(r.recordedScore !== undefined ? r.recordedScore : r.suggestedScore) || 0,
          notes: r.notes || ''
        });
      } else {
        validRows.push(r);
      }
    });

    res.json({
      totalRows: rows.length,
      validCount: validRows.length,
      errorCount: errors.length,
      errors,
      validPreview: validRows.slice(0, 20)
    });
  });

  app.post('/api/import/confirm', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    const { targetType, monthYear, validRows, batchId } = req.body;

    if (!Array.isArray(validRows) || validRows.length === 0) {
      return res.status(400).json({ error: 'Không có dữ liệu hợp lệ để nhập.' });
    }

    // Check month lock
    if (monthYear && isMonthLocked(monthYear, db.config) && db.config.initialDataImportLocked) {
      return res.status(403).json({ error: `Tháng ${monthYear} đã bị khóa đối soát chính thức. Không thể import ghi đè!` });
    }

    const importedBatchId = batchId || `batch_${Date.now()}`;
    let insertedCount = 0;

    await updateDatabase(draft => {
      if (targetType === 'packages') {
        const pcfg = db.packageCoreConfig || DEFAULT_PACKAGE_CORE_CONFIG;
        for (const row of validRows) {
          const trimmedTaxCode = cleanTaxCode(row.taxCode);
          if (!trimmedTaxCode || !row.customerName || !row.receptionDate || !row.moduleCode || !row.onbCode) {
            continue;
          }
          const recDate = row.receptionDate;
          const pkgMonth = row.monthYear || recDate.slice(0, 7);

          // Find or create package for this tax code and reception date / package code
          let targetPkg = draft.packages.find(p =>
            (row.packageCode && p.packageCode === row.packageCode) ||
            (cleanTaxCode(p.taxCode) === trimmedTaxCode && p.receptionDate === recDate)
          );

          // Resolve member group at date
          const groupName = resolveMemberGroupAtDate(db.members, row.onbCode, recDate);
          const modDef = pcfg.modules?.find(m => m.code === row.moduleCode || m.name === row.moduleCode);
          const moduleCode = modDef?.code || row.moduleCode;
          const moduleName = row.moduleName || modDef?.name || row.moduleCode;

          const numPlatforms = row.leaderPlatforms && Number(row.leaderPlatforms) >= 2 ? Number(row.leaderPlatforms) : undefined;
          const calc = calculatePackageScore(
            pcfg,
            row.sourceCode || 'SRC_BAN_THEM_1',
            row.workForm || 'Đào tạo',
            row.customerTier || 'SILVER',
            numPlatforms
          );

          const recScore = row.recordedScore !== undefined && row.recordedScore !== null && !isNaN(Number(row.recordedScore))
            ? Number(row.recordedScore)
            : calc.suggestedScore;

          const detailId = `dtl_imp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
          const detailRow: PackageDetailRow = {
            id: detailId,
            packageId: targetPkg ? targetPkg.id : '',
            moduleCode,
            moduleName,
            onbCode: row.onbCode,
            groupName,
            leaderPlatforms: numPlatforms,
            leaderScore: calc.leaderScore,
            suggestedScore: calc.suggestedScore,
            recordedScore: recScore,
            isManualScore: Boolean(row.isManualScore || (row.recordedScore !== undefined && Number(row.recordedScore) !== calc.suggestedScore)),
            scoreFormula: calc.formula,
            notes: row.notes || '',
            updatedBy: session.onbCode,
            updatedAt: new Date().toISOString()
          };

          if (targetPkg) {
            const alreadyInMod = targetPkg.details?.some(d => d.moduleCode === moduleCode && d.onbCode === row.onbCode);
            if (!alreadyInMod) {
              detailRow.packageId = targetPkg.id;
              if (!targetPkg.details) targetPkg.details = [];
              targetPkg.details.push(detailRow);
              targetPkg.recordedScore = (targetPkg.recordedScore || 0) + recScore;
              targetPkg.suggestedScore = (targetPkg.suggestedScore || 0) + calc.suggestedScore;
              targetPkg.updatedAt = new Date().toISOString();
              targetPkg.updatedBy = session.onbCode;
              insertedCount++;
            }
          } else {
            const packageYear = recDate.slice(0, 4);
            const existingSeqNumbers = draft.packages
              .map(p => {
                const match = p.packageCode?.match(/GOI-\d{4}-(\d+)/);
                return match ? parseInt(match[1], 10) : 0;
              })
              .filter(n => !isNaN(n));
            const nextSeq = (existingSeqNumbers.length > 0 ? Math.max(...existingSeqNumbers) : 0) + 1;
            const packageCode = row.packageCode || `GOI-${packageYear}-${nextSeq.toString().padStart(3, '0')}`;
            const packageId = `pkg_imp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;

            detailRow.packageId = packageId;
            const newPkg: CustomerPackage = {
              id: packageId,
              packageCode,
              taxCode: trimmedTaxCode,
              customerName: row.customerName.trim(),
              customerId: row.customerId || undefined,
              receptionDate: recDate,
              monthYear: pkgMonth,
              sourceCode: row.sourceCode || 'SRC_BAN_THEM_1',
              packageClass: row.packageClass || 'Tiếp nhận mới',
              customerTier: row.customerTier || 'SILVER',
              workForm: row.workForm || 'Đào tạo',
              notes: row.notes || '',
              details: [detailRow],
              packageName: row.customerName.trim(),
              packageType: (row.packageClass || 'Tiếp nhận mới') === 'Tiếp nhận mới' ? 'Mới tiếp nhận' : 'Đang phụ trách',
              assignedOnbCode: row.onbCode || session.onbCode,
              suggestedScore: calc.suggestedScore,
              recordedScore: recScore,
              createdAt: new Date().toISOString(),
              createdBy: session.onbCode,
              updatedAt: new Date().toISOString(),
              updatedBy: session.onbCode
            };

            draft.packages.push(newPkg);
            insertedCount++;
          }
        }
      } else if (targetType === 'schedules') {
        for (const row of validRows) {
          // duplicate check: onbCode + date + customerOrTask
          const exists = draft.schedules.some(s =>
            s.onbCode === row.onbCode && s.date === row.date && s.customerOrTask === row.customerOrTask
          );
          if (!exists) {
            draft.schedules.push({
              id: `sch_imp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
              onbCode: row.onbCode,
              collaborators: [],
              date: row.date,
              workTypeCode: row.workTypeCode,
              productCode: row.productCode,
              customerOrTask: row.customerOrTask,
              status: row.status || 'Hoàn thành',
              monthYear: row.monthYear,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              updatedBy: session.onbCode
            });
            insertedCount++;
          }
        }
      } else if (targetType === 'progress') {
        for (const row of validRows) {
          const taskName = (row.taskName || 'Nhiệm vụ').trim();
          const primaryOnbCode = row.primaryOnbCode || row.onbCode;
          const dateStr = row.date;
          const workTypeCode = row.workTypeCode;

          const exists = draft.progress.some(p =>
            p.primaryOnbCode === primaryOnbCode &&
            p.date === dateStr &&
            p.workTypeCode === workTypeCode &&
            p.taskName.toLowerCase().trim() === taskName.toLowerCase()
          );

          if (!exists) {
            const taskId = `prg_imp_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`;
            const taskCode = `TD-IMP-${Date.now().toString().slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;
            draft.progress.push({
              id: taskId,
              code: taskCode,
              taskName,
              customerId: row.customerId || undefined,
              packageId: row.packageId || undefined,
              primaryOnbCode,
              workTypeCode,
              productCode: row.productCode || undefined,
              quantity: row.quantity !== undefined ? Number(row.quantity) : 1,
              unit: row.unit || undefined,
              amount: row.amount !== undefined ? Number(row.amount) : undefined,
              date: dateStr,
              monthYear: row.monthYear || dateStr.slice(0, 7),
              status: row.status || 'Hoàn thành',
              suggestedScore: Number(row.suggestedScore) || 0,
              recordedScore: Number(row.recordedScore !== undefined ? row.recordedScore : row.suggestedScore) || 0,
              splits: Array.isArray(row.splits) ? row.splits : [],
              notes: row.notes || '',
              scheduleId: row.scheduleId || undefined,
              createdAt: new Date().toISOString(),
              updatedAt: new Date().toISOString(),
              updatedBy: session.onbCode
            });
            insertedCount++;
          }
        }
      }

      const subsystemName = targetType === 'packages' ? 'Tiếp nhận gói đào tạo' : (targetType === 'progress' ? 'Tiến độ thực hiện' : targetType);
      addAuditLog(draft, session, 'IMPORT', 'CORE', importedBatchId, `Import Excel lô ${importedBatchId}: Thêm ${insertedCount} bản ghi vào ${subsystemName}`);
    });

    res.json({
      success: true,
      batchId: importedBatchId,
      insertedCount
    });
  });

  // 10. Audit Logs
  app.get('/api/audit-logs', (req, res) => {
    const db = readDatabase();
    res.json({ logs: db.auditLogs.slice(0, 100) });
  });

  // 11. Backup & Restore
  app.get('/api/backup', (req, res) => {
    const db = readDatabase();
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="onb_backup_${Date.now()}.json"`);
    res.send(JSON.stringify(db, null, 2));
  });

  app.post('/api/restore', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin) {
      return res.status(403).json({ error: 'Chỉ Quản trị viên chính mới có quyền khôi phục hệ thống từ bản sao lưu.' });
    }

    const backupData = req.body;
    if (!backupData || !backupData.members || !backupData.config) {
      return res.status(400).json({ error: 'Dữ liệu sao lưu không đúng cấu trúc hệ thống ONB!' });
    }

    await updateDatabase(draft => {
      draft.config = backupData.config;
      draft.members = backupData.members;
      draft.products = backupData.products || draft.products;
      draft.workTypes = backupData.workTypes || draft.workTypes;
      draft.referenceScores = backupData.referenceScores || draft.referenceScores;
      draft.schedules = backupData.schedules || [];
      draft.progress = backupData.progress || [];
      draft.customers = backupData.customers || [];
      draft.packages = backupData.packages || [];
      draft.bonuses = backupData.bonuses || [];
      draft.trainingPackages = backupData.trainingPackages || [];
      addAuditLog(draft, session, 'UPDATE', 'CORE', 'BACKUP_RESTORE', 'Khôi phục hệ thống từ tệp sao lưu JSON');
    });

    res.json({ success: true });
  });

  // ==========================================
  // PHÂN HỆ QUẢN TRỊ ĐẶC QUYỀN: XÓA DỮ LIỆU KIỂM THỬ (TEST DATA CLEANUP)
  // Chỉ tài khoản cá nhân đã xác thực (dangthihong01012003@gmail.com) mới được phép thực hiện
  // ==========================================
  const AUTHORIZED_CLEANUP_EMAIL = 'dangthihong01012003@gmail.com';

  const checkCleanupPermission = (req: express.Request, db: DatabaseSchema): {
    allowed: boolean;
    statusCode: number;
    error?: string;
    session: CurrentUserSession;
  } => {
    const session = getSession(req, db);
    const callerEmail = (session.email || '').toLowerCase().trim();
    const cfg = db.testDataCleanupConfig;
    const targetEmail = (cfg?.authorizedEmail || AUTHORIZED_CLEANUP_EMAIL).toLowerCase().trim();

    // 1. Kiểm tra định danh tài khoản đã xác thực (không phụ thuộc họ tên, mã ONB hay quyền admin thông thường)
    if (!callerEmail || callerEmail !== targetEmail) {
      return {
        allowed: false,
        statusCode: 403,
        error: `Từ chối truy cập: Chức năng “Xóa dữ liệu kiểm thử” chỉ dành riêng cho tài khoản cá nhân được ủy quyền duy nhất (${targetEmail}). Tài khoản hiện tại (${callerEmail || 'N/A'}) không được cấp quyền.`,
        session
      };
    }

    // 2. Kiểm tra trạng thái xác nhận kích hoạt tài khoản
    if (!cfg?.isConfirmed) {
      return {
        allowed: false,
        statusCode: 403,
        error: 'Chức năng chưa được xác nhận kích hoạt bởi tài khoản cá nhân được ủy quyền. Mặc định chưa ai được thực hiện.',
        session
      };
    }

    return { allowed: true, statusCode: 200, session };
  };

  // Trạng thái ủy quyền & xác nhận
  app.get('/api/test-data-cleanup/status', (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    const callerEmail = (session.email || '').toLowerCase().trim();
    const cfg = db.testDataCleanupConfig;
    const targetEmail = (cfg?.authorizedEmail || AUTHORIZED_CLEANUP_EMAIL).toLowerCase().trim();

    const isMatch = callerEmail === targetEmail;
    res.json({
      isAuthorized: isMatch,
      isConfirmed: isMatch ? Boolean(cfg?.isConfirmed) : false,
      authorizedEmail: isMatch ? targetEmail : undefined,
      confirmedAt: isMatch ? cfg?.confirmedAt : undefined,
      currentUserEmail: callerEmail
    });
  });

  // Xác nhận tài khoản cá nhân để kích hoạt chức năng
  app.post('/api/test-data-cleanup/confirm-account', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    const callerEmail = (session.email || '').toLowerCase().trim();
    const targetEmail = (db.testDataCleanupConfig?.authorizedEmail || AUTHORIZED_CLEANUP_EMAIL).toLowerCase().trim();

    if (callerEmail !== targetEmail) {
      return res.status(403).json({
        error: `Từ chối truy cập: Chỉ tài khoản cá nhân ${targetEmail} mới có quyền xác nhận kích hoạt.`
      });
    }

    const { email } = req.body;
    if (!email || email.toLowerCase().trim() !== targetEmail) {
      return res.status(400).json({
        error: `Email xác nhận không khớp với tài khoản được ủy quyền (${targetEmail}).`
      });
    }

    await updateDatabase(draft => {
      draft.testDataCleanupConfig = {
        authorizedEmail: targetEmail,
        isConfirmed: true,
        confirmedAt: new Date().toISOString(),
        confirmedBy: session.email
      };
      addAuditLog(
        draft,
        session,
        'UPDATE',
        'CORE',
        'testDataCleanupConfig',
        `Kích hoạt quyền chức năng "Xóa dữ liệu kiểm thử" cho tài khoản cá nhân ${targetEmail}`
      );
    });

    res.json({
      success: true,
      message: `Đã xác nhận và kích hoạt thành công quyền Xóa dữ liệu kiểm thử cho tài khoản ${targetEmail}.`
    });
  });

  // Kiểm tra trước khi xóa (Pre-Check / Dry-Run)
  app.post('/api/test-data-cleanup/pre-check', (req, res) => {
    const db = readDatabase();
    const check = checkCleanupPermission(req, db);
    if (!check.allowed) {
      return res.status(check.statusCode).json({ error: check.error });
    }

    const { subsystems, timeScopeType, monthYear, fromMonth, toMonth } = req.body;

    if (!Array.isArray(subsystems) || subsystems.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn ít nhất một phân hệ để kiểm tra.' });
    }

    const validSubsystems: ('schedules' | 'progress' | 'packages')[] = ['schedules', 'progress', 'packages'];
    for (const s of subsystems) {
      if (!validSubsystems.includes(s)) {
        return res.status(400).json({ error: `Phân hệ "${s}" không hợp lệ.` });
      }
    }

    // Xác thực phạm vi thời gian
    if (timeScopeType === 'current_month') {
      if (!monthYear || !/^\d{4}-\d{2}$/.test(monthYear)) {
        return res.status(400).json({ error: 'Tháng đang chọn không hợp lệ (định dạng YYYY-MM).' });
      }
    } else if (timeScopeType === 'custom_range') {
      if (!fromMonth || !toMonth || !/^\d{4}-\d{2}$/.test(fromMonth) || !/^\d{4}-\d{2}$/.test(toMonth)) {
        return res.status(400).json({ error: 'Khoảng thời gian không hợp lệ (từ tháng - đến tháng YYYY-MM).' });
      }
      if (fromMonth > toMonth) {
        return res.status(400).json({ error: 'Tháng bắt đầu không được lớn hơn tháng kết thúc.' });
      }
    } else if (timeScopeType !== 'all_time') {
      return res.status(400).json({ error: 'Loại phạm vi thời gian không hợp lệ.' });
    }

    const isDateInScope = (dateOrMonth?: string): boolean => {
      if (!dateOrMonth) return false;
      const m = dateOrMonth.slice(0, 7);
      if (timeScopeType === 'current_month') return m === monthYear;
      if (timeScopeType === 'custom_range') return m >= fromMonth! && m <= toMonth!;
      return true; // all_time
    };

    // Tìm tất cả các tháng phát sinh dữ liệu trong phạm vi được chọn
    const monthsSet = new Set<string>();
    db.schedules.forEach(s => {
      const m = s.monthYear || s.date?.slice(0, 7);
      if (m && isDateInScope(m)) monthsSet.add(m);
    });
    db.progress.forEach(p => {
      const m = p.monthYear || p.date?.slice(0, 7);
      if (m && isDateInScope(m)) monthsSet.add(m);
    });
    db.packages.forEach(pkg => {
      const m = pkg.monthYear || pkg.receptionDate?.slice(0, 7);
      if (m && isDateInScope(m)) monthsSet.add(m);
    });

    if (timeScopeType === 'current_month' && monthYear) {
      monthsSet.add(monthYear);
    }

    const monthsCovered = Array.from(monthsSet).sort();

    // 1. Kiểm tra tuân thủ khóa sổ (Section 6)
    const lockedMonths = monthsCovered.filter(m => isMonthLocked(m, db.config));
    const isLockedBlocked = lockedMonths.length > 0;
    let blockReason: string | undefined;

    if (isLockedBlocked) {
      blockReason = `Phạm vi xóa có chứa ${lockedMonths.length} kỳ đã bị KHÓA SỔ: [${lockedMonths.join(', ')}]. Hệ thống tuân thủ nghiêm ngặt nguyên tắc khóa sổ: Không thể xóa dữ liệu trong kỳ đã khóa. Vui lòng mở lại sổ hợp lệ trước khi tiếp tục.`;
    }

    // 2. Đếm số bản ghi chính và chi tiết sẽ bị xóa
    let schedulesCount = 0;
    let trainingClassesReset = 0;
    const deletedScheduleIds = new Set<string>();

    if (subsystems.includes('schedules')) {
      const targetSchedules = db.schedules.filter(s => isDateInScope(s.monthYear || s.date?.slice(0, 7)));
      schedulesCount = targetSchedules.length;
      targetSchedules.forEach(s => deletedScheduleIds.add(s.id));

      // Đếm số lớp Đào tạo tập trung (TrainingPackage) sẽ được trả về "Chưa phân bổ"
      (db.trainingPackages || []).forEach(tp => {
        if (tp.scheduleId && deletedScheduleIds.has(tp.scheduleId)) {
          trainingClassesReset++;
        } else if (targetSchedules.some(s => s.sourceTrainingPackageId === tp.id)) {
          trainingClassesReset++;
        }
      });
    }

    let progressCount = 0;
    let progressSplits = 0;
    const deletedProgressIds = new Set<string>();

    if (subsystems.includes('progress')) {
      const targetProgress = db.progress.filter(p => isDateInScope(p.monthYear || p.date?.slice(0, 7)));
      progressCount = targetProgress.length;
      targetProgress.forEach(p => {
        deletedProgressIds.add(p.id);
        progressSplits += p.splits?.length || 0;
      });
    }

    let packagesCount = 0;
    let packageDetails = 0;
    const deletedPackageIds = new Set<string>();

    if (subsystems.includes('packages')) {
      const targetPackages = db.packages.filter(p => isDateInScope(p.monthYear || p.receptionDate?.slice(0, 7)));
      packagesCount = targetPackages.length;
      targetPackages.forEach(p => {
        deletedPackageIds.add(p.id);
        packageDetails += p.details?.length || 0;
      });
    }

    // 3. Kiểm tra tính toàn vẹn và dữ liệu liên kết ngoài phạm vi (Section 5)
    const dependencyIssues: string[] = [];

    // Nếu chọn xóa Gói tiếp nhận nhưng KHÔNG chọn xóa Tiến độ:
    // Kiểm tra có task nào trong db.progress đang tham chiếu tới các gói sắp bị xóa không
    if (subsystems.includes('packages') && !subsystems.includes('progress')) {
      const linkedProgress = db.progress.filter(p => p.packageId && deletedPackageIds.has(p.packageId));
      if (linkedProgress.length > 0) {
        dependencyIssues.push(
          `Có ${linkedProgress.length} công việc trong phân hệ Tiến độ & Điểm đang liên kết tới các gói tiếp nhận sẽ bị xóa. Để bảo toàn tính toàn vẹn liên kết dữ liệu, vui lòng chọn phân hệ Tiến độ & Điểm cùng lúc.`
        );
      }
    }

    // 4. Phân tích ảnh hưởng số liệu tổng hợp (KPI, Thưởng, Nhân sự)
    const affectedMembers = new Set<string>();
    if (subsystems.includes('schedules')) {
      db.schedules.filter(s => isDateInScope(s.monthYear || s.date?.slice(0, 7))).forEach(s => affectedMembers.add(s.onbCode));
    }
    if (subsystems.includes('progress')) {
      db.progress.filter(p => isDateInScope(p.monthYear || p.date?.slice(0, 7))).forEach(p => affectedMembers.add(p.primaryOnbCode));
    }
    if (subsystems.includes('packages')) {
      db.packages.filter(p => isDateInScope(p.monthYear || p.receptionDate?.slice(0, 7))).forEach(p => {
        if (p.assignedOnbCode) affectedMembers.add(p.assignedOnbCode);
        (p.details || []).forEach(d => { if (d.onbCode) affectedMembers.add(d.onbCode); });
      });
    }

    // Kiểm tra khả năng tạo bản sao lưu
    const backupsDir = path.resolve(process.cwd(), 'data', 'backups');
    let backupReady = true;
    try {
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }
    } catch {
      backupReady = false;
    }

    const canProceed = !isLockedBlocked && dependencyIssues.length === 0 && backupReady && (schedulesCount > 0 || progressCount > 0 || packagesCount > 0);

    const dataSignature = `${db.schedules.length}_${db.progress.length}_${db.packages.length}_${Date.now()}`;

    res.json({
      canProceed,
      subsystems,
      timeScopeType,
      monthsCovered,
      counts: {
        schedules: schedulesCount,
        trainingClassesReset,
        progress: progressCount,
        progressSplits,
        packages: packagesCount,
        packageDetails,
        customersRetained: db.customers.length
      },
      impact: {
        totalWeightedScoreAffected: 0,
        totalBonusAffected: 0,
        membersAffectedCount: affectedMembers.size
      },
      lockedMonths,
      isLockedBlocked,
      blockReason,
      dependencyIssues,
      backupReady,
      dataSignature
    });
  });

  // Thực hiện xóa dữ liệu kiểm thử (Execute)
  let isCleanupRunning = false;

  app.post('/api/test-data-cleanup/execute', async (req, res) => {
    const db = readDatabase();
    const check = checkCleanupPermission(req, db);
    if (!check.allowed) {
      return res.status(check.statusCode).json({ error: check.error });
    }

    if (isCleanupRunning) {
      return res.status(429).json({ error: 'Một tác vụ xóa dữ liệu đang được thực hiện. Vui lòng đợi trong giây lát.' });
    }

    const {
      subsystems,
      timeScopeType,
      monthYear,
      fromMonth,
      toMonth,
      reason,
      confirmPhrase,
      authAccountEmail
    } = req.body;

    // 1. Kiểm tra xác thực các điều kiện bắt buộc
    if (!reason || typeof reason !== 'string' || reason.trim().length < 5) {
      return res.status(400).json({ error: 'Vui lòng nhập lý do xóa cụ thể (tối thiểu 5 ký tự).' });
    }

    if (confirmPhrase !== 'XÓA DỮ LIỆU') {
      return res.status(400).json({ error: 'Cụm từ xác nhận không chính xác. Vui lòng nhập đúng: XÓA DỮ LIỆU' });
    }

    const targetEmail = (db.testDataCleanupConfig?.authorizedEmail || AUTHORIZED_CLEANUP_EMAIL).toLowerCase().trim();
    if (!authAccountEmail || authAccountEmail.toLowerCase().trim() !== targetEmail) {
      return res.status(400).json({ error: `Xác thực tài khoản không chính xác. Vui lòng nhập đúng tài khoản email cá nhân (${targetEmail}).` });
    }

    if (!Array.isArray(subsystems) || subsystems.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn ít nhất một phân hệ để xóa.' });
    }

    const isDateInScope = (dateOrMonth?: string): boolean => {
      if (!dateOrMonth) return false;
      const m = dateOrMonth.slice(0, 7);
      if (timeScopeType === 'current_month') return m === monthYear;
      if (timeScopeType === 'custom_range') return m >= fromMonth && m <= toMonth;
      return true;
    };

    // Tìm các tháng liên quan
    const monthsSet = new Set<string>();
    db.schedules.forEach(s => {
      const m = s.monthYear || s.date?.slice(0, 7);
      if (m && isDateInScope(m)) monthsSet.add(m);
    });
    db.progress.forEach(p => {
      const m = p.monthYear || p.date?.slice(0, 7);
      if (m && isDateInScope(m)) monthsSet.add(m);
    });
    db.packages.forEach(pkg => {
      const m = pkg.monthYear || pkg.receptionDate?.slice(0, 7);
      if (m && isDateInScope(m)) monthsSet.add(m);
    });
    if (timeScopeType === 'current_month' && monthYear) monthsSet.add(monthYear);

    const monthsCovered = Array.from(monthsSet).sort();

    // Kiểm tra khóa sổ một lần nữa
    const lockedMonths = monthsCovered.filter(m => isMonthLocked(m, db.config));
    if (lockedMonths.length > 0) {
      return res.status(403).json({
        error: `Không thể thực hiện: Phát hiện ${lockedMonths.length} kỳ đang bị KHÓA SỔ: [${lockedMonths.join(', ')}]. Tuân thủ nguyên tắc khóa sổ!`
      });
    }

    // Kiểm tra ràng buộc phụ thuộc
    if (subsystems.includes('packages') && !subsystems.includes('progress')) {
      const targetPkgIds = new Set(db.packages.filter(p => isDateInScope(p.monthYear || p.receptionDate?.slice(0, 7))).map(p => p.id));
      const linkedProgress = db.progress.filter(p => p.packageId && targetPkgIds.has(p.packageId));
      if (linkedProgress.length > 0) {
        return res.status(400).json({
          error: `Ràng buộc toàn vẹn: Có ${linkedProgress.length} công việc Tiến độ & Điểm liên kết tới các gói này. Vui lòng chọn cả Tiến độ & Điểm trước khi xóa.`
        });
      }
    }

    isCleanupRunning = true;
    const startedAt = new Date().toISOString();

    try {
      // BƯỚC 1: TẠO BẢN SAO LƯU TỰ ĐỘNG CÓ THỂ PHỤC HỒI
      const backupsDir = path.resolve(process.cwd(), 'data', 'backups');
      if (!fs.existsSync(backupsDir)) {
        fs.mkdirSync(backupsDir, { recursive: true });
      }

      const backupRefId = `backup_cleanup_${Date.now()}_${Math.random().toString(36).substring(2, 7)}.json`;
      const backupFilePath = path.join(backupsDir, backupRefId);

      try {
        fs.writeFileSync(backupFilePath, JSON.stringify(db, null, 2), 'utf-8');
        // Xác minh bản sao lưu tồn tại và hợp lệ
        const stat = fs.statSync(backupFilePath);
        if (stat.size === 0) {
          throw new Error('Bản sao lưu trống.');
        }
      } catch (err: any) {
        return res.status(500).json({
          error: `Không thể tạo bản sao lưu an toàn trước khi xóa: ${err.message}. Thao tác bị hủy bỏ để bảo đảm an toàn dữ liệu.`
        });
      }

      // BƯỚC 2: THỰC HIỆN XÓA TẠI CƠ SỞ DỮ LIỆU CHÍNH THỨC
      let actualSchedulesDeleted = 0;
      let actualTrainingReset = 0;
      let actualProgressDeleted = 0;
      let actualProgressSplitsDeleted = 0;
      let actualPackagesDeleted = 0;
      let actualPackageDetailsDeleted = 0;

      await updateDatabase(draft => {
        // A. XỬ LÝ LỊCH LÀM VIỆC
        if (subsystems.includes('schedules')) {
          const toDelete = draft.schedules.filter(s => isDateInScope(s.monthYear || s.date?.slice(0, 7)));
          actualSchedulesDeleted = toDelete.length;
          const deletedIds = new Set(toDelete.map(s => s.id));

          // Cập nhật các lớp Đào tạo tập trung liên kết về "Chưa phân bổ" khi không còn lịch liên kết
          if (Array.isArray(draft.trainingPackages)) {
            draft.trainingPackages.forEach(tp => {
              const wasLinkedById = tp.scheduleId && deletedIds.has(tp.scheduleId);
              const wasLinkedBySource = toDelete.some(s => s.sourceTrainingPackageId === tp.id);

              if (wasLinkedById || wasLinkedBySource) {
                // Kiểm tra xem còn lịch nào khác liên kết không
                const remainingLink = draft.schedules.find(s =>
                  !deletedIds.has(s.id) &&
                  (s.id === tp.scheduleId || s.sourceTrainingPackageId === tp.id)
                );

                if (!remainingLink) {
                  tp.scheduleId = undefined;
                  tp.scheduleStatus = 'Chưa điền lịch';
                  tp.allocationStatus = 'Chưa phân bổ';
                  tp.assignedOnbCode = undefined;
                  tp.assignedGroup = undefined;
                  tp.fillScheduleError = undefined;
                  tp.conflictingScheduleInfo = undefined;
                  actualTrainingReset++;
                }
              }
            });
          }

          // Xóa các lịch trong phạm vi
          draft.schedules = draft.schedules.filter(s => !deletedIds.has(s.id));
        }

        // B. XỬ LÝ TIẾN ĐỘ & ĐIỂM
        if (subsystems.includes('progress')) {
          const toDelete = draft.progress.filter(p => isDateInScope(p.monthYear || p.date?.slice(0, 7)));
          actualProgressDeleted = toDelete.length;
          const deletedIds = new Set(toDelete.map(p => p.id));

          toDelete.forEach(p => {
            actualProgressSplitsDeleted += p.splits?.length || 0;
          });

          // Nếu lịch không bị xóa, ngắt liên kết tham chiếu từ lịch
          if (!subsystems.includes('schedules') && Array.isArray(draft.schedules)) {
            draft.schedules.forEach(s => {
              if (s.relatedProgressId && deletedIds.has(s.relatedProgressId)) {
                s.relatedProgressId = undefined;
              }
            });
          }

          draft.progress = draft.progress.filter(p => !deletedIds.has(p.id));
        }

        // C. XỬ LÝ KHÁCH HÀNG & GÓI
        if (subsystems.includes('packages')) {
          const toDelete = draft.packages.filter(p => isDateInScope(p.monthYear || p.receptionDate?.slice(0, 7)));
          actualPackagesDeleted = toDelete.length;
          const deletedPkgIds = new Set(toDelete.map(p => p.id));

          toDelete.forEach(p => {
            actualPackageDetailsDeleted += p.details?.length || 0;
          });

          // Ngắt liên kết packageId từ lịch nếu lịch không bị xóa
          if (Array.isArray(draft.schedules)) {
            draft.schedules.forEach(s => {
              if ((s as any).packageId && deletedPkgIds.has((s as any).packageId)) {
                (s as any).packageId = undefined;
              }
              if ((s as any).customerPackageId && deletedPkgIds.has((s as any).customerPackageId)) {
                (s as any).customerPackageId = undefined;
              }
            });
          }

          // Lưu ý: Không xóa draft.customers (hồ sơ khách hàng dùng chung được bảo toàn 100%)
          draft.packages = draft.packages.filter(p => !deletedPkgIds.has(p.id));
        }

        // BƯỚC 3: GHI NHẬT KÝ THAO TÁC RIÊNG VÀ AUDIT LOG TỔNG HỢP
        const completedAt = new Date().toISOString();
        const cleanupLog: CleanupAuditLog = {
          id: `cleanup_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
          startedAt,
          completedAt,
          accountEmail: check.session.email,
          onbCode: check.session.onbCode,
          fullName: check.session.fullName,
          reason: reason.trim(),
          subsystems,
          timeScope: {
            type: timeScopeType,
            monthYear,
            fromMonth,
            toMonth,
            monthsAffected: monthsCovered
          },
          deletedCounts: {
            schedules: actualSchedulesDeleted,
            trainingClassesReset: actualTrainingReset,
            progress: actualProgressDeleted,
            progressSplits: actualProgressSplitsDeleted,
            packages: actualPackagesDeleted,
            packageDetails: actualPackageDetailsDeleted
          },
          result: 'SUCCESS',
          backupReferenceId: backupRefId
        };

        if (!Array.isArray(draft.cleanupAuditLogs)) {
          draft.cleanupAuditLogs = [];
        }
        draft.cleanupAuditLogs.unshift(cleanupLog);

        addAuditLog(
          draft,
          check.session,
          'DELETE',
          'CORE',
          cleanupLog.id,
          `Xóa dữ liệu kiểm thử: [${subsystems.join(', ')}] (${monthsCovered.join(', ')}). Lý do: ${reason.trim()}. Bản sao lưu: ${backupRefId}. Số lượng xóa: ${actualSchedulesDeleted} lịch, ${actualProgressDeleted} tiến độ, ${actualPackagesDeleted} gói tiếp nhận.`
        );
      });

      res.json({
        success: true,
        message: 'Đã hoàn tất xóa dữ liệu kiểm thử và bảo toàn toàn vẹn hệ thống thành công.',
        backupReferenceId: backupRefId,
        deletedCounts: {
          schedules: actualSchedulesDeleted,
          trainingClassesReset: actualTrainingReset,
          progress: actualProgressDeleted,
          progressSplits: actualProgressSplitsDeleted,
          packages: actualPackagesDeleted,
          packageDetails: actualPackageDetailsDeleted
        },
        monthsAffected: monthsCovered,
        completedAt: new Date().toISOString()
      });
    } catch (err: any) {
      console.error('Lỗi khi thực hiện xóa dữ liệu kiểm thử', err);
      res.status(500).json({
        error: `Quá trình xóa gặp sự cố: ${err.message}. Vui lòng kiểm tra nhật ký hoặc khôi phục từ bản sao lưu.`
      });
    } finally {
      isCleanupRunning = false;
    }
  });

  // Xem danh sách nhật ký xóa dữ liệu kiểm thử
  app.get('/api/test-data-cleanup/audit-logs', (req, res) => {
    const db = readDatabase();
    const check = checkCleanupPermission(req, db);
    if (!check.allowed) {
      return res.status(check.statusCode).json({ error: check.error });
    }

    res.json({ logs: db.cleanupAuditLogs || [] });
  });

  // Khôi phục từ bản sao lưu kiểm thử
  app.post('/api/test-data-cleanup/restore-snapshot', async (req, res) => {
    const db = readDatabase();
    const check = checkCleanupPermission(req, db);
    if (!check.allowed) {
      return res.status(check.statusCode).json({ error: check.error });
    }

    const { backupReferenceId, confirmPhrase } = req.body;
    if (confirmPhrase !== 'KHÔI PHỤC') {
      return res.status(400).json({ error: 'Cụm từ xác nhận không khớp. Vui lòng nhập: KHÔI PHỤC' });
    }

    if (!backupReferenceId) {
      return res.status(400).json({ error: 'Mã bản sao lưu không hợp lệ.' });
    }

    const backupsDir = path.resolve(process.cwd(), 'data', 'backups');
    const safeFilename = path.basename(backupReferenceId);
    const backupFilePath = path.join(backupsDir, safeFilename);

    if (!fs.existsSync(backupFilePath)) {
      return res.status(404).json({ error: 'Không tìm thấy tệp bản sao lưu yêu cầu.' });
    }

    try {
      const content = fs.readFileSync(backupFilePath, 'utf-8');
      const backupData = JSON.parse(content);

      if (!backupData || !backupData.members || !backupData.config) {
        return res.status(400).json({ error: 'Tệp sao lưu không đúng định dạng cơ sở dữ liệu ONB.' });
      }

      await updateDatabase(draft => {
        draft.schedules = backupData.schedules || [];
        draft.progress = backupData.progress || [];
        draft.packages = backupData.packages || [];
        draft.trainingPackages = backupData.trainingPackages || [];
        if (backupData.customers) draft.customers = backupData.customers;

        addAuditLog(
          draft,
          check.session,
          'UPDATE',
          'CORE',
          'RESTORE_SNAPSHOT',
          `Khôi phục dữ liệu từ bản sao lưu kiểm thử: ${safeFilename}`
        );
      });

      res.json({ success: true, message: `Đã khôi phục dữ liệu thành công từ bản sao lưu ${safeFilename}.` });
    } catch (err: any) {
      res.status(500).json({ error: `Lỗi khôi phục bản sao lưu: ${err.message}` });
    }
  });

  // --- CHỨC NĂNG: XÓA DỮ LIỆU THEO KHOẢNG THỜI GIAN (ADMIN ONLY) ---
  app.post('/api/core/delete-by-date-range/preview', (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.isMasterAdmin && session.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Quản trị viên (Admin) mới có quyền sử dụng chức năng này.' });
    }

    const { fromDate, toDate, subsystems } = req.body;

    if (!fromDate || !toDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return res.status(400).json({ error: 'Khoảng thời gian không hợp lệ. Vui lòng nhập định dạng YYYY-MM-DD.' });
    }

    if (fromDate > toDate) {
      return res.status(400).json({ error: 'Ngày bắt đầu không được lớn hơn ngày kết thúc.' });
    }

    if (!Array.isArray(subsystems) || subsystems.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn ít nhất một phân hệ để kiểm tra.' });
    }

    const validSubs = ['schedules', 'packages', 'progress'];
    for (const sub of subsystems) {
      if (!validSubs.includes(sub)) {
        return res.status(400).json({ error: `Phân hệ "${sub}" không hợp lệ.` });
      }
    }

    const isInRange = (d?: string) => Boolean(d && d >= fromDate && d <= toDate);

    // 1. Lịch làm việc
    let schedulesCount = 0;
    let trainingClassesReset = 0;
    const targetScheduleIds = new Set<string>();

    if (subsystems.includes('schedules')) {
      const targetSchedules = db.schedules.filter(s => isInRange(s.date));
      schedulesCount = targetSchedules.length;
      targetSchedules.forEach(s => targetScheduleIds.add(s.id));

      (db.trainingPackages || []).forEach(tp => {
        const isLinkedById = tp.scheduleId && targetScheduleIds.has(tp.scheduleId);
        const isLinkedBySource = targetSchedules.some(s => s.sourceTrainingPackageId === tp.id);
        if (isLinkedById || isLinkedBySource) {
          trainingClassesReset++;
        }
      });
    }

    // 2. Tiến độ & Điểm
    let progressCount = 0;
    let progressSplits = 0;
    const targetProgressIds = new Set<string>();

    if (subsystems.includes('progress')) {
      const targetProgress = db.progress.filter(p => isInRange(p.date));
      progressCount = targetProgress.length;
      targetProgress.forEach(p => {
        targetProgressIds.add(p.id);
        progressSplits += p.splits?.length || 0;
      });
    }

    // 3. Khách hàng & Gói
    let packagesCount = 0;
    let packageDetails = 0;
    const targetPackageIds = new Set<string>();

    if (subsystems.includes('packages')) {
      const targetPackages = db.packages.filter(p => isInRange(p.receptionDate || (p.monthYear ? `${p.monthYear}-01` : '')));
      packagesCount = targetPackages.length;
      targetPackages.forEach(p => {
        targetPackageIds.add(p.id);
        packageDetails += p.details?.length || 0;
      });
    }

    // Kiểm tra dữ liệu liên kết chéo
    let progressUnlinked = 0;
    let schedulesUnlinked = 0;
    let progressWithPackageLinked = 0;

    if (subsystems.includes('schedules') && !subsystems.includes('progress')) {
      progressUnlinked = db.progress.filter(p => p.scheduleId && targetScheduleIds.has(p.scheduleId)).length;
    }

    if (subsystems.includes('progress') && !subsystems.includes('schedules')) {
      schedulesUnlinked = db.schedules.filter(s => s.relatedProgressId && targetProgressIds.has(s.relatedProgressId)).length;
    }

    if (subsystems.includes('packages') && !subsystems.includes('progress')) {
      progressWithPackageLinked = db.progress.filter(p => p.packageId && targetPackageIds.has(p.packageId)).length;
    }

    // Nhân sự bị ảnh hưởng
    const affectedMembers = new Set<string>();
    if (subsystems.includes('schedules')) {
      db.schedules.filter(s => isInRange(s.date)).forEach(s => affectedMembers.add(s.onbCode));
    }
    if (subsystems.includes('progress')) {
      db.progress.filter(p => isInRange(p.date)).forEach(p => {
        affectedMembers.add(p.primaryOnbCode);
        (p.splits || []).forEach(sp => affectedMembers.add(sp.onbCode));
      });
    }
    if (subsystems.includes('packages')) {
      db.packages.filter(p => isInRange(p.receptionDate || (p.monthYear ? `${p.monthYear}-01` : ''))).forEach(pkg => {
        if (pkg.assignedOnbCode) affectedMembers.add(pkg.assignedOnbCode);
        (pkg.details || []).forEach(d => { if (d.onbCode) affectedMembers.add(d.onbCode); });
      });
    }

    const total = schedulesCount + progressCount + packagesCount;
    const canProceed = total > 0;

    const notes: string[] = [
      `Khoảng thời gian: Từ ngày ${fromDate} đến ngày ${toDate} (tính cả ngày bắt đầu và ngày kết thúc).`,
      'Áp dụng theo ngày diễn ra lịch / ngày ghi nhận nghiệp vụ thực tế trên toàn bộ nhóm và nhân sự.',
      'Toàn bộ danh mục Core (Nhóm, Nhân sự, Sản phẩm, Loại việc, Điểm tham chiếu) và Hồ sơ khách hàng dùng chung được bảo toàn 100%.'
    ];

    if (trainingClassesReset > 0) {
      notes.push(`Có ${trainingClassesReset} lớp Đào tạo tập trung (ĐTTT) liên kết sẽ được tự động hoàn về trạng thái "Chưa phân bổ" để tránh mồ côi.`);
    }
    if (progressUnlinked > 0) {
      notes.push(`Có ${progressUnlinked} công việc Tiến độ liên kết với lịch bị xóa sẽ được gỡ liên kết lịch an toàn.`);
    }
    if (schedulesUnlinked > 0) {
      notes.push(`Có ${schedulesUnlinked} lịch liên kết với tiến độ bị xóa sẽ được gỡ liên kết tiến độ an toàn.`);
    }
    if (progressWithPackageLinked > 0) {
      notes.push(`Có ${progressWithPackageLinked} công việc Tiến độ liên kết với gói bị xóa sẽ được gỡ liên kết gói an toàn.`);
    }

    res.json({
      canProceed,
      fromDate,
      toDate,
      subsystems,
      counts: {
        schedules: schedulesCount,
        trainingClassesReset,
        progress: progressCount,
        progressSplits,
        packages: packagesCount,
        packageDetails,
        customersRetained: db.customers.length,
        total
      },
      linkedData: {
        trainingClassesReset,
        progressUnlinked,
        schedulesUnlinked,
        progressWithPackageLinked
      },
      affectedMembersCount: affectedMembers.size,
      warningMessage: 'Cảnh báo: Dữ liệu bị xóa sẽ không thể hoàn tác. Các chỉ số KPI, điểm tích lũy và bảng tổng hợp sẽ tự động tính toán lại.',
      notes
    });
  });

  app.post('/api/core/delete-by-date-range/execute', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.isMasterAdmin && session.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Quản trị viên (Admin) mới có quyền sử dụng chức năng này.' });
    }

    const { fromDate, toDate, subsystems } = req.body;

    if (!fromDate || !toDate || !/^\d{4}-\d{2}-\d{2}$/.test(fromDate) || !/^\d{4}-\d{2}-\d{2}$/.test(toDate)) {
      return res.status(400).json({ error: 'Khoảng thời gian không hợp lệ. Vui lòng nhập định dạng YYYY-MM-DD.' });
    }

    if (fromDate > toDate) {
      return res.status(400).json({ error: 'Ngày bắt đầu không được lớn hơn ngày kết thúc.' });
    }

    if (!Array.isArray(subsystems) || subsystems.length === 0) {
      return res.status(400).json({ error: 'Vui lòng chọn ít nhất một phân hệ để xóa.' });
    }

    const isInRange = (d?: string) => Boolean(d && d >= fromDate && d <= toDate);

    let actualSchedulesDeleted = 0;
    let actualTrainingReset = 0;
    let actualProgressDeleted = 0;
    let actualProgressSplitsDeleted = 0;
    let actualPackagesDeleted = 0;
    let actualPackageDetailsDeleted = 0;
    let actualProgressUnlinked = 0;
    let actualSchedulesUnlinked = 0;

    const completedAt = new Date().toISOString();
    const auditLogId = `audit_drdel_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

    try {
      await updateDatabase(draft => {
        // 1. LỊCH LÀM VIỆC
        if (subsystems.includes('schedules')) {
          const toDelete = draft.schedules.filter(s => isInRange(s.date));
          actualSchedulesDeleted = toDelete.length;
          const deletedScheduleIds = new Set(toDelete.map(s => s.id));

          // Trả các lớp Đào tạo tập trung về trạng thái Chưa phân bổ
          if (Array.isArray(draft.trainingPackages)) {
            draft.trainingPackages.forEach(tp => {
              const wasLinkedById = tp.scheduleId && deletedScheduleIds.has(tp.scheduleId);
              const wasLinkedBySource = toDelete.some(s => s.sourceTrainingPackageId === tp.id);

              if (wasLinkedById || wasLinkedBySource) {
                const remainingLink = draft.schedules.find(s =>
                  !deletedScheduleIds.has(s.id) &&
                  (s.id === tp.scheduleId || s.sourceTrainingPackageId === tp.id)
                );

                if (!remainingLink) {
                  tp.scheduleId = undefined;
                  tp.scheduleStatus = 'Chưa điền lịch';
                  tp.allocationStatus = 'Chưa phân bổ';
                  tp.assignedOnbCode = undefined;
                  tp.assignedGroup = undefined;
                  tp.fillScheduleError = undefined;
                  tp.conflictingScheduleInfo = undefined;
                  actualTrainingReset++;
                }
              }
            });
          }

          // Ngắt liên kết scheduleId ở Tiến độ nếu Tiến độ không bị xóa
          if (!subsystems.includes('progress') && Array.isArray(draft.progress)) {
            draft.progress.forEach(p => {
              if (p.scheduleId && deletedScheduleIds.has(p.scheduleId)) {
                p.scheduleId = undefined;
                actualProgressUnlinked++;
              }
            });
          }

          draft.schedules = draft.schedules.filter(s => !deletedScheduleIds.has(s.id));
        }

        // 2. TIẾN ĐỘ & ĐIỂM
        if (subsystems.includes('progress')) {
          const toDelete = draft.progress.filter(p => isInRange(p.date));
          actualProgressDeleted = toDelete.length;
          const deletedProgressIds = new Set(toDelete.map(p => p.id));

          toDelete.forEach(p => {
            actualProgressSplitsDeleted += p.splits?.length || 0;
          });

          // Ngắt liên kết relatedProgressId ở Lịch nếu Lịch không bị xóa
          if (!subsystems.includes('schedules') && Array.isArray(draft.schedules)) {
            draft.schedules.forEach(s => {
              if (s.relatedProgressId && deletedProgressIds.has(s.relatedProgressId)) {
                s.relatedProgressId = undefined;
                actualSchedulesUnlinked++;
              }
            });
          }

          draft.progress = draft.progress.filter(p => !deletedProgressIds.has(p.id));
        }

        // 3. KHÁCH HÀNG & GÓI
        if (subsystems.includes('packages')) {
          const toDelete = draft.packages.filter(p => isInRange(p.receptionDate || (p.monthYear ? `${p.monthYear}-01` : '')));
          actualPackagesDeleted = toDelete.length;
          const deletedPackageIds = new Set(toDelete.map(p => p.id));

          toDelete.forEach(p => {
            actualPackageDetailsDeleted += p.details?.length || 0;
          });

          // Ngắt liên kết packageId từ Tiến độ nếu Tiến độ không bị xóa
          if (!subsystems.includes('progress') && Array.isArray(draft.progress)) {
            draft.progress.forEach(p => {
              if (p.packageId && deletedPackageIds.has(p.packageId)) {
                p.packageId = undefined;
              }
            });
          }

          // Ngắt liên kết từ Lịch nếu Lịch không bị xóa
          if (Array.isArray(draft.schedules)) {
            draft.schedules.forEach(s => {
              if ((s as any).packageId && deletedPackageIds.has((s as any).packageId)) {
                (s as any).packageId = undefined;
              }
              if ((s as any).customerPackageId && deletedPackageIds.has((s as any).customerPackageId)) {
                (s as any).customerPackageId = undefined;
              }
            });
          }

          // draft.customers được bảo toàn nguyên vẹn
          draft.packages = draft.packages.filter(p => !deletedPackageIds.has(p.id));
        }

        // 4. GHI NHẬT KÝ THAO TÁC (AUDIT LOG)
        const subNames: string[] = [];
        if (subsystems.includes('schedules')) subNames.push(`Lịch làm việc (${actualSchedulesDeleted})`);
        if (subsystems.includes('packages')) subNames.push(`Khách hàng & Gói (${actualPackagesDeleted})`);
        if (subsystems.includes('progress')) subNames.push(`Tiến độ & Điểm (${actualProgressDeleted})`);

        addAuditLog(
          draft,
          session,
          'DELETE',
          'CORE',
          auditLogId,
          `Xóa dữ liệu theo khoảng thời gian: Từ ngày ${fromDate} đến ngày ${toDate}. Phân hệ đã xóa: [${subNames.join(', ')}]. Tổng số bản ghi đã xóa: ${actualSchedulesDeleted + actualProgressDeleted + actualPackagesDeleted}. Người thực hiện: ${session.fullName} (${session.onbCode}).`
        );
      });

      const totalDeleted = actualSchedulesDeleted + actualProgressDeleted + actualPackagesDeleted;

      res.json({
        success: true,
        message: `Đã xóa thành công ${totalDeleted} bản ghi trong khoảng thời gian từ ${fromDate} đến ${toDate}.`,
        fromDate,
        toDate,
        subsystems,
        deletedCounts: {
          schedules: actualSchedulesDeleted,
          trainingClassesReset: actualTrainingReset,
          progress: actualProgressDeleted,
          progressSplits: actualProgressSplitsDeleted,
          packages: actualPackagesDeleted,
          packageDetails: actualPackageDetailsDeleted,
          total: totalDeleted
        },
        linkedAdjustments: {
          trainingReset: actualTrainingReset,
          progressUnlinked: actualProgressUnlinked,
          schedulesUnlinked: actualSchedulesUnlinked
        },
        auditLogId,
        completedAt
      });
    } catch (err: any) {
      console.error('Lỗi khi xóa dữ liệu theo khoảng thời gian:', err);
      res.status(500).json({ error: `Lỗi hệ thống khi xóa dữ liệu: ${err.message || 'Không xác định'}` });
    }
  });

  // --- TRUNG TÂM SAO LƯU & KHÔI PHỤC (BACKUP & RESTORE CENTER - ADMIN ONLY) ---
  app.get('/api/core/backups', (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin && session.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Quản trị viên (Admin) mới có quyền xem danh sách bản sao lưu.' });
    }
    const backups = listBackups();
    res.json({ backups });
  });

  app.post('/api/core/backups/create', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin && session.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Quản trị viên (Admin) mới có quyền tạo bản sao lưu thủ công.' });
    }

    try {
      const snap = createBackupSnapshot(db, 'manual');
      await updateDatabase(draft => {
        addAuditLog(
          draft,
          session,
          'CREATE',
          'CORE',
          snap.filename,
          `Tạo bản sao lưu thủ công: ${snap.filename} (${snap.sizeFormatted}). Tổng bản ghi vận hành: ${snap.counts.totalOperational}.`
        );
      });

      res.json({
        success: true,
        message: `Đã tạo bản sao lưu thành công: ${snap.filename} (${snap.sizeFormatted})`,
        backup: snap
      });
    } catch (err: any) {
      res.status(500).json({ error: `Lỗi tạo bản sao lưu: ${err.message}` });
    }
  });

  app.post('/api/core/backups/restore', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin && session.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Quản trị viên (Admin) mới có quyền khôi phục hệ thống từ bản sao lưu.' });
    }

    const { filename } = req.body;
    if (!filename) {
      return res.status(400).json({ error: 'Vui lòng cung cấp tên tệp sao lưu cần khôi phục.' });
    }

    const backupResult = readBackupFile(filename);
    if (!backupResult.success || !backupResult.data) {
      return res.status(400).json({ error: backupResult.error || 'Tệp sao lưu không hợp lệ.' });
    }

    const backupData = backupResult.data;

    try {
      // Tự động tạo một bản sao lưu bảo hiểm trạng thái hiện tại trước khi khôi phục
      const preRestoreSnap = createBackupSnapshot(db, 'pre_cleanup');

      await updateDatabase(draft => {
        draft.config = backupData.config || draft.config;
        draft.members = backupData.members || draft.members;
        draft.groups = backupData.groups || draft.groups;
        draft.products = backupData.products || draft.products;
        draft.workTypes = backupData.workTypes || draft.workTypes;
        draft.referenceScores = backupData.referenceScores || draft.referenceScores;
        if (backupData.packageCoreConfig) draft.packageCoreConfig = backupData.packageCoreConfig;
        if (backupData.scheduleWorkForms) draft.scheduleWorkForms = backupData.scheduleWorkForms;
        draft.customers = backupData.customers || draft.customers;
        draft.schedules = backupData.schedules || [];
        draft.progress = backupData.progress || [];
        draft.packages = backupData.packages || [];
        draft.bonuses = backupData.bonuses || [];
        draft.trainingPackages = backupData.trainingPackages || [];

        addAuditLog(
          draft,
          session,
          'UPDATE',
          'CORE',
          filename,
          `Khôi phục toàn bộ hệ thống từ bản sao lưu ${filename}. Bản bảo hiểm trước khôi phục: ${preRestoreSnap.filename}.`
        );
      });

      res.json({
        success: true,
        message: `Đã khôi phục dữ liệu thành công từ bản sao lưu ${filename}. Hệ thống đã tự động lưu bản bảo hiểm ${preRestoreSnap.filename}.`
      });
    } catch (err: any) {
      console.error('Lỗi khi khôi phục bản sao lưu:', err);
      res.status(500).json({ error: `Lỗi khôi phục: ${err.message}` });
    }
  });

  app.get('/api/core/backups/download/:filename', (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin && session.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Quản trị viên (Admin) mới có quyền tải tệp sao lưu.' });
    }

    const filename = path.basename(req.params.filename);
    const backupResult = readBackupFile(filename);
    if (!backupResult.success || !backupResult.data) {
      return res.status(404).json({ error: 'Không tìm thấy tệp sao lưu yêu cầu.' });
    }

    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(JSON.stringify(backupResult.data, null, 2));
  });

  app.delete('/api/core/backups/:filename', (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);
    if (!session.isMasterAdmin && session.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Quản trị viên (Admin) mới có quyền xóa tệp sao lưu.' });
    }

    const filename = path.basename(req.params.filename);
    const success = deleteBackupFile(filename);
    if (!success) {
      return res.status(404).json({ error: 'Không tìm thấy tệp sao lưu cần xóa.' });
    }

    res.json({ success: true, message: `Đã xóa bản sao lưu ${filename}.` });
  });

  // --- TRUNG TÂM XUẤT DỮ LIỆU (EXPORT CENTER) ---
  app.get('/api/core/export', (req, res) => {
    const db = readDatabase();
    const { type, format, fromDate, toDate } = req.query as {
      type?: 'schedules' | 'progress' | 'packages' | 'all';
      format?: 'csv' | 'json';
      fromDate?: string;
      toDate?: string;
    };

    const targetType = type || 'all';
    const targetFormat = format || 'csv';
    const timestampStr = new Date().toISOString().slice(0, 10);

    if (targetFormat === 'json') {
      let exportObj: any = {};
      if (targetType === 'schedules') {
        exportObj = { schedules: fromDate || toDate ? db.schedules.filter(s => (!fromDate || s.date >= fromDate) && (!toDate || s.date <= toDate)) : db.schedules };
      } else if (targetType === 'progress') {
        exportObj = { progress: fromDate || toDate ? db.progress.filter(p => (!fromDate || p.date >= fromDate) && (!toDate || p.date <= toDate)) : db.progress };
      } else if (targetType === 'packages') {
        exportObj = { packages: fromDate || toDate ? db.packages.filter(p => (!fromDate || (p.receptionDate || p.monthYear) >= fromDate) && (!toDate || (p.receptionDate || p.monthYear) <= toDate)) : db.packages };
      } else {
        exportObj = db;
      }

      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="onb_export_${targetType}_${timestampStr}.json"`);
      return res.send(JSON.stringify(exportObj, null, 2));
    }

    // CSV format
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    if (targetType === 'schedules') {
      res.setHeader('Content-Disposition', `attachment; filename="onb_lich_lam_viec_${timestampStr}.csv"`);
      return res.send(exportSchedulesToCsv(db, fromDate, toDate));
    } else if (targetType === 'progress') {
      res.setHeader('Content-Disposition', `attachment; filename="onb_tien_do_diem_${timestampStr}.csv"`);
      return res.send(exportProgressToCsv(db, fromDate, toDate));
    } else if (targetType === 'packages') {
      res.setHeader('Content-Disposition', `attachment; filename="onb_khach_hang_goi_${timestampStr}.csv"`);
      return res.send(exportPackagesToCsv(db, fromDate, toDate));
    } else {
      // All: Return JSON if CSV all is requested
      res.setHeader('Content-Type', 'application/json; charset=utf-8');
      res.setHeader('Content-Disposition', `attachment; filename="onb_full_database_${timestampStr}.json"`);
      return res.send(JSON.stringify(db, null, 2));
    }
  });

  // --- XÓA TRẮNG DỮ LIỆU NGHIỆP VỤ ĐỂ BẮT ĐẦU LẠI (RESET OPERATIONAL DATA - ADMIN ONLY) ---
  app.post('/api/core/reset-operational-data', async (req, res) => {
    const db = readDatabase();
    const session = getSession(req, db);

    if (!session.isMasterAdmin && session.role !== 'admin') {
      return res.status(403).json({ error: 'Chỉ Quản trị viên (Admin) mới có quyền thực hiện xóa trắng dữ liệu nghiệp vụ.' });
    }

    try {
      // BƯỚC 1: Bắt buộc tạo một bản sao lưu toàn diện trước khi xóa trắng
      const backupSnap = createBackupSnapshot(db, 'pre_reset');

      const schedulesCount = db.schedules.length;
      const progressCount = db.progress.length;
      const packagesCount = db.packages.length;
      const totalWiped = schedulesCount + progressCount + packagesCount;

      await updateDatabase(draft => {
        // Xóa trắng toàn bộ dữ liệu nghiệp vụ phát sinh
        draft.schedules = [];
        draft.progress = [];
        draft.packages = [];
        draft.bonuses = [];

        // Trả các lớp Đào tạo tập trung về trạng thái Chưa phân bổ
        if (Array.isArray(draft.trainingPackages)) {
          draft.trainingPackages.forEach(tp => {
            tp.scheduleId = undefined;
            tp.scheduleStatus = 'Chưa điền lịch';
            tp.allocationStatus = 'Chưa phân bổ';
            tp.assignedOnbCode = undefined;
            tp.assignedGroup = undefined;
            tp.fillScheduleError = undefined;
            tp.conflictingScheduleInfo = undefined;
          });
        }

        // BẢO TOÀN 100% CẤU HÌNH CORE & TÀI KHOẢN:
        // draft.members, draft.groups, draft.products, draft.workTypes, draft.referenceScores,
        // draft.packageCoreConfig, draft.scheduleWorkForms, draft.config, draft.customers -> GIỮ NGUYÊN

        addAuditLog(
          draft,
          session,
          'DELETE',
          'CORE',
          backupSnap.filename,
          `Xóa trắng dữ liệu nghiệp vụ để bắt đầu lại: Đã xóa ${schedulesCount} lịch, ${progressCount} tiến độ, ${packagesCount} gói tiếp nhận. Bảo toàn 100% cấu hình Core. Bản sao lưu tự động: ${backupSnap.filename}.`
        );
      });

      res.json({
        success: true,
        message: `Đã xóa trắng dữ liệu nghiệp vụ thành công (${totalWiped} bản ghi). Toàn bộ danh mục Core được bảo toàn 100%. Bản sao lưu tự động đã được lưu an toàn: ${backupSnap.filename}.`,
        backupReferenceId: backupSnap.filename,
        wipedCounts: {
          schedules: schedulesCount,
          progress: progressCount,
          packages: packagesCount,
          total: totalWiped
        }
      });
    } catch (err: any) {
      console.error('Lỗi khi xóa trắng dữ liệu nghiệp vụ:', err);
      res.status(500).json({ error: `Lỗi hệ thống khi xóa trắng dữ liệu: ${err.message}` });
    }
  });

  const sseClients: express.Response[] = [];

  onDbChange((changeType, meta) => {
    const payload = JSON.stringify({
      type: 'DB_CHANGED',
      changeType,
      meta,
      timestamp: Date.now()
    });
    for (let i = sseClients.length - 1; i >= 0; i--) {
      const client = sseClients[i];
      try {
        client.write(`data: ${payload}\n\n`);
      } catch {
        sseClients.splice(i, 1);
      }
    }
  });

  app.get('/api/realtime/stream', (req, res) => {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    if (res.flushHeaders) res.flushHeaders();

    // Initial message to confirm connection
    res.write(`data: ${JSON.stringify({ type: 'CONNECTED', timestamp: Date.now() })}\n\n`);

    sseClients.push(res);

    // Keep-alive heartbeat every 20s
    const heartbeat = setInterval(() => {
      try {
        res.write(': keep-alive\n\n');
      } catch {
        clearInterval(heartbeat);
      }
    }, 20000);

    req.on('close', () => {
      clearInterval(heartbeat);
      const idx = sseClients.indexOf(res);
      if (idx !== -1) sseClients.splice(idx, 1);
    });
  });

  // 13. Phân hệ Phân bổ công việc ONB (Work Allocation)
  app.get('/api/work-allocation', (req, res) => {
    try {
      const db = readDatabase();
      const monthYear = (req.query.monthYear as string) || getCurrentVietnamMonth();
      const requestedGroup = (req.query.group as string) || '';

      // Compute scorecard data for the month to match exact scores
      const scorecard = computeScorecardData({
        monthYear,
        members: db.members,
        workTypes: db.workTypes,
        progressTasks: db.progress,
        packages: db.packages,
        bonuses: db.bonuses,
        bonusPool: db.bonusPools?.find(bp => bp.monthYear === monthYear) || null,
        schedules: db.schedules
      });

      const allocationResult = computeWorkAllocationData({
        monthYear,
        members: db.members,
        groups: db.groups,
        packages: db.packages,
        scorecardRows: scorecard.rows
      });

      if (requestedGroup) {
        const filteredGroups = allocationResult.groups.filter(g => g.groupName === requestedGroup || g.groupId === requestedGroup);
        return res.json({
          monthYear,
          groups: filteredGroups,
          summary: {
            ...allocationResult.summary,
            totalGroups: filteredGroups.length,
            totalMembers: filteredGroups.reduce((acc, g) => acc + g.totalMembers, 0),
            totalKH: filteredGroups.reduce((acc, g) => acc + g.totalKH, 0),
            totalGoi: filteredGroups.reduce((acc, g) => acc + g.totalGoi, 0),
            totalDiemTiepNhan: Math.round(filteredGroups.reduce((acc, g) => acc + g.totalDiemTiepNhan, 0) * 100) / 100,
            totalDiemThucHien: Math.round(filteredGroups.reduce((acc, g) => acc + g.totalDiemThucHien, 0) * 100) / 100
          }
        });
      }

      res.json(allocationResult);
    } catch (err: any) {
      console.error('Error computing work allocation:', err);
      res.status(500).json({ error: err.message || 'Lỗi khi tính toán phân bổ công việc ONB.' });
    }
  });

  // Vite development middleware
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(process.cwd(), 'dist')));
    app.get('*', (req, res) => {
      res.sendFile(path.resolve(process.cwd(), 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`ONB Operations System running on http://0.0.0.0:${PORT}`);
    initAutomaticBackupWorker(() => readDatabase());
  });
}

startServer().catch(err => {
  console.error('Failed to start ONB server', err);
});
