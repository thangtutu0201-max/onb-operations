import React, { useState, useEffect, useCallback } from 'react';
import { api } from './services/api';
import { auth, onAuthStateChanged, signOutUser, User } from './services/firebase';
import {
  CurrentUserSession,
  AppConfig,
  ONBMember,
  ProductCatalog,
  WorkTypeCatalog,
  ReferenceScore,
  WorkSchedule,
  ProgressTask,
  Customer,
  CustomerPackage,
  ScorecardRow,
  AuditLog,
  TrainingPackage,
  GroupId,
  ONBGroup,
  PackageCoreConfig,
  DEFAULT_PACKAGE_CORE_CONFIG
} from './types';
import { Navbar } from './components/Navbar';
import { LoginScreen } from './components/LoginScreen';
import { DashboardTab } from './components/DashboardTab';
import { ScheduleTab } from './components/ScheduleTab';
import { ProgressTab } from './components/ProgressTab';
import { PackagesTab } from './components/PackagesTab';
import { ScorecardTab } from './components/ScorecardTab';
import { AllocationTab } from './components/AllocationTab';
import { WorkAllocationTab } from './components/WorkAllocationTab';
import { HistoryTab } from './components/HistoryTab';
import { ImportTab } from './components/ImportTab';
import { CoreTab } from './components/CoreTab';
import { AuditLogTab } from './components/AuditLogTab';
import { DrilldownModal } from './components/DrilldownModal';
import { EditBonusModal } from './components/EditBonusModal';
import { TestDataCleanupModal } from './components/TestDataCleanupModal';
import { DateRangeDeleteModal } from './components/DateRangeDeleteModal';
import { CheckCircle2, AlertCircle } from 'lucide-react';

export default function App() {
  const [activeTab, setActiveTab] = useState<string>('dashboard');
  const [selectedMonth, setSelectedMonth] = useState<string>('2026-10');
  const [currentVietnamMonth, setCurrentVietnamMonth] = useState<string>('2026-10');

  // Firebase Auth & User Session State
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [session, setSession] = useState<CurrentUserSession | null>(null);
  const [isAuthChecking, setIsAuthChecking] = useState<boolean>(true);
  const [authError, setAuthError] = useState<{ code?: string; message?: string; email?: string } | null>(null);

  const [config, setConfig] = useState<AppConfig | null>(null);

  // Catalogs & Core
  const [groups, setGroups] = useState<ONBGroup[]>([]);
  const [members, setMembers] = useState<ONBMember[]>([]);
  const [products, setProducts] = useState<ProductCatalog[]>([]);
  const [workTypes, setWorkTypes] = useState<WorkTypeCatalog[]>([]);
  const [referenceScores, setReferenceScores] = useState<ReferenceScore[]>([]);
  const [packageCoreConfig, setPackageCoreConfig] = useState<PackageCoreConfig>(DEFAULT_PACKAGE_CORE_CONFIG);

  // Operational Data
  const [schedules, setSchedules] = useState<WorkSchedule[]>([]);
  const [progress, setProgress] = useState<ProgressTask[]>([]);
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [packages, setPackages] = useState<CustomerPackage[]>([]);
  const [scorecardData, setScorecardData] = useState<any | null>(null);

  // Training Allocation
  const [trainingPackages, setTrainingPackages] = useState<TrainingPackage[]>([]);
  const [groupPoints, setGroupPoints] = useState<Record<GroupId, number>>({
    'Nhóm 1': 0,
    'Nhóm 2': 0,
    'Nhóm 3': 0
  });

  // Audit Logs
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);

  // Modals
  const [drilldownOnbCode, setDrilldownOnbCode] = useState<string | null>(null);
  const [drilldownCategory, setDrilldownCategory] = useState<'DEMO_POC' | 'PACKAGES' | 'TRAINING' | 'ALL'>('ALL');
  const [editBonusRow, setEditBonusRow] = useState<ScorecardRow | null>(null);
  const [isCleanupModalOpen, setIsCleanupModalOpen] = useState(false);
  const [isDateRangeDeleteModalOpen, setIsDateRangeDeleteModalOpen] = useState(false);

  const [isLoading, setIsLoading] = useState(true);

  // Realtime & Sync state for Dashboard/Overview
  const [realtimeConnected, setRealtimeConnected] = useState<boolean>(false);
  const [syncStatus, setSyncStatus] = useState<'idle' | 'loading' | 'syncing' | 'connected' | 'disconnected' | 'error'>('loading');
  const [lastSyncTime, setLastSyncTime] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [blockErrors, setBlockErrors] = useState<Record<string, string>>({});
  const [toast, setToast] = useState<{ type: 'success' | 'error' | 'info'; message: string } | null>(null);

  const showToast = useCallback((message: string, type: 'success' | 'error' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => {
      setToast(null);
    }, 4000);
  }, []);

  // Helper to format Vietnam timestamp (Asia/Ho_Chi_Minh: dd/mm/yyyy HH:mm:ss)
  const formatVietnamTime = (date: Date = new Date()): string => {
    try {
      const parts = new Intl.DateTimeFormat('en-GB', {
        timeZone: 'Asia/Ho_Chi_Minh',
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
      }).formatToParts(date);
      const day = parts.find(p => p.type === 'day')?.value || '01';
      const month = parts.find(p => p.type === 'month')?.value || '01';
      const year = parts.find(p => p.type === 'year')?.value || '2026';
      const hour = parts.find(p => p.type === 'hour')?.value || '00';
      const minute = parts.find(p => p.type === 'minute')?.value || '00';
      const second = parts.find(p => p.type === 'second')?.value || '00';
      return `${day}/${month}/${year} ${hour}:${minute}:${second}`;
    } catch {
      return date.toLocaleString('vi-VN');
    }
  };

  // Determine if selected month is reopened (by admin)
  const isMonthReopened = Boolean(
    config && config.reopenedMonths && config.reopenedMonths.includes(selectedMonth)
  );

  // Determine if selected month is locked (Asia/Ho_Chi_Minh timezone)
  const isMonthLocked = Boolean(
    (config && config.systemLockedMonths && config.systemLockedMonths.includes(selectedMonth)) ||
    (selectedMonth < currentVietnamMonth && !isMonthReopened)
  );

  // For data entry/modification operations:
  // If month is locked -> nobody can edit.
  // If month is reopened -> only admin can edit, non-admin members are locked out.
  const isUserLockedForMonth = isMonthLocked || (isMonthReopened && !session?.isMasterAdmin && session?.role !== 'admin');

  // Load Bootstrap & Session
  const loadBootstrap = useCallback(async () => {
    try {
      const [boot, sess] = await Promise.all([
        api.getBootstrap(),
        api.getSession()
      ]);

      setConfig(boot.config);
      setGroups(boot.groups || []);
      setMembers(boot.members);
      setProducts(boot.products);
      setWorkTypes(boot.workTypes);
      setReferenceScores(boot.referenceScores);
      if (boot.packageCoreConfig) {
        setPackageCoreConfig(boot.packageCoreConfig);
      }
      setCurrentVietnamMonth(boot.currentVietnamMonth);
      if (sess.session) {
        setSession(sess.session);
      }
      setBlockErrors(prev => {
        const copy = { ...prev };
        delete copy['core'];
        return copy;
      });
    } catch (err: any) {
      console.error('Failed to bootstrap app', err);
      setBlockErrors(prev => ({
        ...prev,
        core: err.message || 'Lỗi tải danh mục Core (Nhóm, Nhân sự)'
      }));
      throw err;
    }
  }, []);

  // Load Monthly Data
  const loadMonthData = useCallback(async () => {
    const errors: Record<string, string> = {};

    // Slices for each block so that failure in one block does not wipe others
    const schPromise = api.getSchedules()
      .then(res => { setSchedules(res.schedules); })
      .catch(err => { errors['schedules'] = 'Lỗi tải Lịch công việc'; });

    const prgPromise = api.getProgress({ monthYear: selectedMonth })
      .then(res => { setProgress(res.progress); })
      .catch(err => { errors['progress'] = 'Lỗi tải Tiến độ thực hiện'; });

    const custPromise = api.getCustomers()
      .then(res => { setCustomers(res.customers); })
      .catch(err => { errors['customers'] = 'Lỗi tải Khách hàng'; });

    const pkgPromise = api.getPackages({ monthYear: selectedMonth })
      .then(res => { setPackages(res.packages); })
      .catch(err => { errors['packages'] = 'Lỗi tải Tiếp nhận gói đào tạo'; });

    const scPromise = api.getScorecard(selectedMonth)
      .then(res => { setScorecardData(res); })
      .catch(err => { errors['scorecard'] = 'Lỗi tải Thưởng hiệu quả'; });

    const allocPromise = api.getAllocation(selectedMonth)
      .then(res => {
        setTrainingPackages(res.packages);
        setGroupPoints(res.groupPoints);
      })
      .catch(err => { errors['allocation'] = 'Lỗi tải Lịch đào tạo tập trung'; });

    const logsPromise = api.getAuditLogs()
      .then(res => { setAuditLogs(res.logs); })
      .catch(err => { errors['auditLogs'] = 'Lỗi tải Nhật ký thay đổi'; });

    await Promise.all([
      schPromise,
      prgPromise,
      custPromise,
      pkgPromise,
      scPromise,
      allocPromise,
      logsPromise
    ]);

    setBlockErrors(prev => ({
      ...prev,
      ...errors
    }));

    setIsLoading(false);

    if (Object.keys(errors).length > 0) {
      const failedKeys = Object.keys(errors).join(', ');
      throw new Error(`Lỗi cập nhật một số khối dữ liệu: ${failedKeys}`);
    }
  }, [selectedMonth]);

  // Combined full refresh for both Core and operational data
  const refreshAllData = useCallback(async () => {
    setSyncStatus('syncing');
    setSyncError(null);
    try {
      await Promise.all([
        loadBootstrap(),
        loadMonthData()
      ]);
      const nowStr = formatVietnamTime();
      setLastSyncTime(nowStr);
      setSyncStatus(realtimeConnected ? 'connected' : 'idle');
    } catch (err: any) {
      console.error('Lỗi làm mới dữ liệu hệ thống:', err);
      setSyncStatus('error');
      setSyncError(err.message || 'Lỗi cập nhật dữ liệu từ nguồn máy chủ.');
    }
  }, [loadBootstrap, loadMonthData, realtimeConnected]);

  // User authorization check with server
  const checkUserAuthorization = useCallback(async (user: User) => {
    setIsAuthChecking(true);
    setAuthError(null);
    try {
      const sessRes = await api.getSession();
      if (!sessRes.authorized || !sessRes.session) {
        setAuthError({
          code: sessRes.code || 'ACCOUNT_NOT_AUTHORIZED',
          message: sessRes.error || 'Tài khoản chưa được cấp quyền sử dụng. Vui lòng liên hệ quản trị viên.',
          email: user.email || sessRes.email
        });
        setSession(null);
        setIsLoading(false);
      } else {
        setSession(sessRes.session);
        setAuthError(null);
        setSyncStatus('loading');
        await Promise.all([
          loadBootstrap(),
          loadMonthData()
        ]);
        const nowStr = formatVietnamTime();
        setLastSyncTime(nowStr);
        setSyncStatus('connected');
      }
    } catch (err: any) {
      console.error('Lỗi kiểm tra phân quyền tài khoản:', err);
      const code = err.code || (err.message?.includes('chưa được cấp quyền') ? 'ACCOUNT_NOT_AUTHORIZED' : err.message?.includes('bị khóa') ? 'ACCOUNT_LOCKED' : 'AUTH_ERROR');
      setAuthError({
        code,
        message: err.message || 'Lỗi kiểm tra quyền truy cập tài khoản.',
        email: user.email || err.email
      });
      setSession(null);
      setIsLoading(false);
    } finally {
      setIsAuthChecking(false);
    }
  }, [loadBootstrap, loadMonthData]);

  // Firebase Auth Lifecycle Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setSession(null);
        setIsAuthChecking(false);
        setAuthError(null);
        setIsLoading(false);
        setSchedules([]);
        setProgress([]);
        setCustomers([]);
        setPackages([]);
        setScorecardData(null);
      } else {
        await checkUserAuthorization(user);
      }
    });

    return () => unsubscribe();
  }, [checkUserAuthorization]);

  // Realtime Data Synchronization across users/sessions (ONLY when authenticated & authorized)
  useEffect(() => {
    if (!session) return;

    const unsubscribe = api.subscribeToRealtime(
      (event) => {
        if (event?.type === 'DB_CHANGED') {
          refreshAllData();
        }
      },
      (status) => {
        const isConn = status === 'connected';
        setRealtimeConnected(isConn);
        if (isConn) {
          setSyncStatus(prev => (prev === 'loading' || prev === 'syncing' ? prev : 'connected'));
          setSyncError(null);
        } else {
          setSyncStatus(prev => (prev === 'loading' || prev === 'syncing' ? prev : 'disconnected'));
        }
      }
    );

    // Fallback polling every 8 seconds to guarantee consistency even if SSE is interrupted
    const interval = setInterval(() => {
      refreshAllData();
    }, 8000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [session, refreshAllData]);

  // Window Focus & Online reconnect listeners to immediately catch up on changes
  useEffect(() => {
    if (!session) return;

    const handleFocus = () => {
      refreshAllData();
    };
    const handleOnline = () => {
      refreshAllData();
    };
    const handleOffline = () => {
      setRealtimeConnected(false);
      setSyncStatus('disconnected');
    };

    window.addEventListener('focus', handleFocus);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    return () => {
      window.removeEventListener('focus', handleFocus);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [session, refreshAllData]);

  // Sign out handler
  const handleSignOut = async () => {
    try {
      await signOutUser();
      setSession(null);
      setFirebaseUser(null);
      setAuthError(null);
      setSchedules([]);
      setProgress([]);
      setCustomers([]);
      setPackages([]);
      setScorecardData(null);
    } catch (err) {
      console.error('Lỗi khi đăng xuất:', err);
    }
  };

  // Schedule Handlers
  const handleAddSchedule = async (payload: Partial<WorkSchedule>) => {
    await api.createSchedule(payload);
    await loadMonthData();
  };

  const handleAddFullDaySchedule = async (payload: any) => {
    const res = await api.createFullDaySchedule(payload);
    await loadMonthData();
    return res;
  };

  const handleCancelSchedule = async (id: string, cancelBothSessions?: boolean) => {
    await api.cancelSchedule(id, cancelBothSessions);
    await loadMonthData();
  };

  const handleUpdateSchedule = async (id: string, payload: Partial<WorkSchedule> & { applyToFullDay?: boolean }) => {
    await api.updateSchedule(id, payload);
    await loadMonthData();
  };

  const handleDeleteSchedule = async (id: string) => {
    await api.deleteSchedule(id);
    await loadMonthData();
  };

  const handleTransferSchedule = async (id: string, payload: { toOnbCode: string; reason?: string; expectedOnbCode?: string }) => {
    await api.transferSchedule(id, payload);
    await loadMonthData();
  };

  const handleConvertToProgress = async (id: string) => {
    await api.convertScheduleToProgress(id);
    await loadMonthData();
    showToast('Đã chuyển lịch thành bản ghi tiến độ & ghi điểm thành công!');
  };

  // Progress Handlers
  const handleAddTask = async (payload: Partial<ProgressTask>) => {
    await api.createProgress(payload);
    await loadMonthData();
  };

  const handleBatchAddTasks = async (items: Array<Partial<ProgressTask>>) => {
    const res = await api.batchCreateProgress(items);
    await loadMonthData();
    return res;
  };

  const handleUpdateTask = async (id: string, payload: Partial<ProgressTask>) => {
    await api.updateProgress(id, payload);
    await loadMonthData();
  };

  const handleDeleteTask = async (id: string) => {
    await api.deleteProgress(id);
    await loadMonthData();
  };

  // Packages & Customers Handlers
  const handleAddCustomer = async (payload: Partial<Customer>) => {
    await api.createCustomer(payload);
    const res = await api.getCustomers();
    setCustomers(res.customers);
  };

  const handleAddPackage = async (payload: Partial<CustomerPackage>) => {
    await api.createPackage(payload);
    await loadMonthData();
  };

  const handleUpdatePackage = async (id: string, payload: any) => {
    await api.updatePackage(id, payload);
    await loadMonthData();
  };

  const handleDeletePackage = async (id: string) => {
    await api.deletePackage(id);
    await loadMonthData();
  };

  const handleUpdatePackageCoreConfig = async (cfg: Partial<PackageCoreConfig>) => {
    const res = await api.updatePackageCoreConfig(cfg);
    if (res.config) {
      setPackageCoreConfig(res.config);
    }
    await loadMonthData();
  };

  // Bonus Handler
  const handleSaveBonus = async (amount: number, reason: string) => {
    if (!editBonusRow) return;
    await api.updateBonus({
      monthYear: selectedMonth,
      onbCode: editBonusRow.onbCode,
      amount,
      reason
    });
    await loadMonthData();
  };

  const handleDirectSaveBonus = async (onbCode: string, amount: number | null) => {
    await api.updateBonus({
      monthYear: selectedMonth,
      onbCode,
      amount,
      reason: ''
    });
    await loadMonthData();
  };

  // Core Management Handlers (Admin Only)
  const handleUpdateConfig = async (cfg: Partial<AppConfig>) => {
    await api.updateCoreConfig(cfg);
    await loadBootstrap();
  };

  const handleCreateMember = async (m: any) => {
    await api.createMember(m);
    await refreshAllData();
  };

  const handleUpdateMember = async (code: string, m: any) => {
    await api.updateMember(code, m);
    await refreshAllData();
  };

  const handleDeleteMember = async (code: string) => {
    await api.deleteMember(code);
    await refreshAllData();
  };

  const handleCreateGroup = async (g: any) => {
    await api.createGroup(g);
    await refreshAllData();
  };

  const handleUpdateGroup = async (id: string, g: any) => {
    await api.updateGroup(id, g);
    await refreshAllData();
  };

  const handleDeleteGroup = async (id: string) => {
    await api.deleteGroup(id);
    await refreshAllData();
  };

  const handleCreateProduct = async (p: any) => {
    await api.createProduct(p);
    await Promise.all([loadBootstrap(), loadMonthData()]);
  };

  const handleUpdateProduct = async (id: string, p: any) => {
    await api.updateProduct(id, p);
    await Promise.all([loadBootstrap(), loadMonthData()]);
  };

  const handleDeleteProduct = async (id: string) => {
    await api.deleteProduct(id);
    await Promise.all([loadBootstrap(), loadMonthData()]);
  };

  const handleCreateWorkType = async (wt: any) => {
    await api.createWorkType(wt);
    await Promise.all([loadBootstrap(), loadMonthData()]);
  };

  const handleUpdateWorkType = async (id: string, wt: any) => {
    await api.updateWorkType(id, wt);
    await Promise.all([loadBootstrap(), loadMonthData()]);
  };

  const handleDeleteWorkType = async (id: string) => {
    await api.deleteWorkType(id);
    await Promise.all([loadBootstrap(), loadMonthData()]);
  };

  const handleCreateReferenceScore = async (rs: any) => {
    await api.createReferenceScore(rs);
    await Promise.all([loadBootstrap(), loadMonthData()]);
  };

  const handleUpdateReferenceScore = async (id: string, rs: any) => {
    await api.updateReferenceScore(id, rs);
    await Promise.all([loadBootstrap(), loadMonthData()]);
  };

  const handleDeleteReferenceScore = async (id: string) => {
    await api.deleteReferenceScore(id);
    await Promise.all([loadBootstrap(), loadMonthData()]);
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-slate-50 flex flex-col items-center justify-center p-4">
        <div className="w-10 h-10 border-3 border-indigo-600 border-t-transparent rounded-full animate-spin mb-4" />
        <div className="text-sm font-semibold text-slate-800">
          Đang xác thực thông tin đăng nhập Google...
        </div>
        <div className="text-xs text-slate-500 mt-1">
          Hệ thống Quản lý Vận hành ONB
        </div>
      </div>
    );
  }

  if (!firebaseUser || !session) {
    return (
      <LoginScreen
        authError={authError}
        onRefreshAuth={() => {
          if (auth.currentUser) {
            checkUserAuthorization(auth.currentUser);
          }
        }}
        isLoading={isAuthChecking}
      />
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-800">
      {/* Universal Top Bar */}
      <Navbar
        session={session}
        selectedMonth={selectedMonth}
        onMonthChange={m => setSelectedMonth(m)}
        isMonthLocked={isMonthLocked}
        isMonthReopened={isMonthReopened}
        onSignOut={handleSignOut}
        activeTab={activeTab}
        onTabChange={tab => setActiveTab(tab)}
        onOpenCleanupModal={() => setIsCleanupModalOpen(true)}
      />

      {/* Main Workspace Canvas */}
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6">
        {isLoading ? (
          <div className="py-20 text-center text-xs text-slate-400">
            Đang khởi động hệ thống quản trị vận hành ONB...
          </div>
        ) : (
          <>
            {activeTab === 'dashboard' && (
              <DashboardTab
                monthYear={selectedMonth}
                isMonthLocked={isMonthLocked}
                isMonthReopened={isMonthReopened}
                scorecardData={scorecardData}
                groups={groups}
                members={members}
                onNavigateTab={tab => setActiveTab(tab)}
                session={session}
                auditLogs={auditLogs}
                syncStatus={syncStatus}
                lastSyncTime={lastSyncTime}
                syncError={syncError}
                blockErrors={blockErrors}
                onRefreshData={refreshAllData}
              />
            )}

            {activeTab === 'schedule' && (
              <ScheduleTab
                schedules={schedules}
                members={members}
                groups={groups}
                workTypes={workTypes}
                products={products}
                monthYear={selectedMonth}
                isMonthLocked={isUserLockedForMonth}
                session={session}
                onAddSchedule={handleAddSchedule}
                onAddFullDaySchedule={handleAddFullDaySchedule}
                onCancelSchedule={handleCancelSchedule}
                onUpdateSchedule={handleUpdateSchedule}
                onDeleteSchedule={handleDeleteSchedule}
                onTransferSchedule={handleTransferSchedule}
                onConvertToProgress={handleConvertToProgress}
                onMonthChange={m => setSelectedMonth(m)}
              />
            )}

            {activeTab === 'progress' && (
              <ProgressTab
                tasks={progress}
                members={members}
                workTypes={workTypes}
                products={products}
                referenceScores={referenceScores}
                packages={packages}
                customers={customers}
                packageCoreConfig={packageCoreConfig}
                monthYear={selectedMonth}
                onMonthChange={setSelectedMonth}
                isMonthLocked={isUserLockedForMonth}
                session={session}
                onAddTask={handleAddTask}
                onBatchAddTasks={handleBatchAddTasks}
                onUpdateTask={handleUpdateTask}
                onDeleteTask={handleDeleteTask}
                onRefreshData={loadMonthData}
              />
            )}

            {activeTab === 'packages' && (
              <PackagesTab
                packages={packages}
                customers={customers}
                members={members}
                groups={groups}
                packageCoreConfig={packageCoreConfig}
                workTypes={workTypes}
                products={products}
                referenceScores={referenceScores}
                progressTasks={progress}
                monthYear={selectedMonth}
                onMonthChange={setSelectedMonth}
                isMonthLocked={isUserLockedForMonth}
                session={session}
                onAddPackage={handleAddPackage}
                onUpdatePackage={handleUpdatePackage}
                onDeletePackage={handleDeletePackage}
                onAddCustomer={handleAddCustomer}
                onRefreshData={loadMonthData}
              />
            )}

            {activeTab === 'scorecard' && (
              <ScorecardTab
                scorecardData={scorecardData}
                monthYear={selectedMonth}
                onMonthChange={setSelectedMonth}
                isMonthLocked={isUserLockedForMonth}
                session={session}
                onOpenDrilldown={(code, cat = 'ALL') => {
                  setDrilldownOnbCode(code);
                  setDrilldownCategory(cat);
                }}
                onSaveBonus={handleDirectSaveBonus}
                onRefreshData={loadMonthData}
              />
            )}

            {activeTab === 'allocation' && (
              <AllocationTab
                monthYear={selectedMonth}
                onMonthChange={setSelectedMonth}
                isMonthLocked={isUserLockedForMonth}
                isMonthReopened={isMonthReopened}
                trainingPackages={trainingPackages}
                members={members}
                groups={groups}
                groupPoints={groupPoints}
                session={session}
                schedules={schedules}
                onRefreshData={loadMonthData}
                onNavigateToSchedule={(onbCode, date) => {
                  setActiveTab('schedule');
                }}
              />
            )}

            {activeTab === 'work-allocation' && (
              <WorkAllocationTab
                monthYear={selectedMonth}
                onMonthChange={setSelectedMonth}
                isMonthLocked={isUserLockedForMonth}
                members={members}
                groups={groups}
                packages={packages}
                scorecardRows={scorecardData?.rows || []}
                session={session}
                onRefreshData={refreshAllData}
              />
            )}

            {activeTab === 'history' && (
              <HistoryTab
                currentVietnamMonth={currentVietnamMonth}
                onSelectMonth={m => {
                  setSelectedMonth(m);
                  setActiveTab('dashboard');
                }}
                selectedMonth={selectedMonth}
                session={session}
                onConfigChanged={refreshAllData}
              />
            )}

            {activeTab === 'import' && (
              <ImportTab
                members={members}
                workTypes={workTypes}
                products={products}
                referenceScores={referenceScores}
                packageCoreConfig={packageCoreConfig}
                packages={packages}
                progressTasks={progress}
                customers={customers}
                monthYear={selectedMonth}
                onMonthChange={setSelectedMonth}
                isMonthLocked={isUserLockedForMonth}
                session={session}
                onRefreshData={loadMonthData}
              />
            )}

            {activeTab === 'core' && config && (
              <CoreTab
                config={config}
                groups={groups}
                members={members}
                products={products}
                workTypes={workTypes}
                referenceScores={referenceScores}
                packageCoreConfig={packageCoreConfig}
                onUpdatePackageCoreConfig={handleUpdatePackageCoreConfig}
                session={session}
                onUpdateConfig={handleUpdateConfig}
                onCreateGroup={handleCreateGroup}
                onUpdateGroup={handleUpdateGroup}
                onDeleteGroup={handleDeleteGroup}
                onCreateMember={handleCreateMember}
                onUpdateMember={handleUpdateMember}
                onDeleteMember={handleDeleteMember}
                onCreateProduct={handleCreateProduct}
                onUpdateProduct={handleUpdateProduct}
                onDeleteProduct={handleDeleteProduct}
                onCreateWorkType={handleCreateWorkType}
                onUpdateWorkType={handleUpdateWorkType}
                onDeleteWorkType={handleDeleteWorkType}
                onCreateReferenceScore={handleCreateReferenceScore}
                onUpdateReferenceScore={handleUpdateReferenceScore}
                onDeleteReferenceScore={handleDeleteReferenceScore}
                onOpenCleanupModal={() => setIsCleanupModalOpen(true)}
                onOpenDateRangeDeleteModal={() => setIsDateRangeDeleteModalOpen(true)}
                onRefreshAllData={refreshAllData}
              />
            )}

            {activeTab === 'audit' && (
              <AuditLogTab logs={auditLogs} />
            )}
          </>
        )}
      </main>

      {/* Date Range Delete Modal (Chức năng Xóa dữ liệu theo khoảng thời gian - Admin Only) */}
      <DateRangeDeleteModal
        isOpen={isDateRangeDeleteModalOpen}
        onClose={() => setIsDateRangeDeleteModalOpen(false)}
        selectedMonth={selectedMonth}
        session={session}
        onSuccessRefresh={async () => {
          await refreshAllData();
          showToast('Đã xóa dữ liệu theo khoảng thời gian và đồng bộ hệ thống thành công!', 'success');
        }}
      />

      {/* Test Data Cleanup Modal (Đặc quyền riêng cho tài khoản cá nhân đã xác thực) */}
      <TestDataCleanupModal
        isOpen={isCleanupModalOpen}
        onClose={() => setIsCleanupModalOpen(false)}
        selectedMonth={selectedMonth}
        session={session}
        onSuccessRefresh={async () => {
          await refreshAllData();
          showToast('Đã xóa dữ liệu kiểm thử và làm mới hệ thống thành công!', 'success');
        }}
      />

      {/* Drilldown Modal */}
      {drilldownOnbCode && (
        <DrilldownModal
          monthYear={selectedMonth}
          onbCode={drilldownOnbCode}
          category={drilldownCategory}
          onClose={() => setDrilldownOnbCode(null)}
          onMonthChange={setSelectedMonth}
        />
      )}

      {/* Edit Bonus Modal */}
      {editBonusRow && (
        <EditBonusModal
          row={editBonusRow}
          monthYear={selectedMonth}
          onClose={() => setEditBonusRow(null)}
          onSave={handleSaveBonus}
        />
      )}

      {/* Global Toast Notification */}
      {toast && (
        <div className="fixed bottom-5 right-5 z-50 flex items-center gap-2.5 px-4 py-3 rounded-lg shadow-lg text-xs font-semibold animate-in slide-in-from-bottom-2 bg-slate-900 text-white border border-slate-700">
          {toast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span>{toast.message}</span>
        </div>
      )}
    </div>
  );
}
