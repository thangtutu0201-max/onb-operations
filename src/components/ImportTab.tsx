import React from 'react';
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
import { ExcelImportWizard, ImportTargetType } from './ExcelImportWizard';

export interface ImportTabProps {
  members: ONBMember[];
  workTypes?: WorkTypeCatalog[];
  products?: ProductCatalog[];
  referenceScores?: ReferenceScore[];
  packageCoreConfig?: PackageCoreConfig;
  packages?: CustomerPackage[];
  progressTasks?: ProgressTask[];
  customers?: Customer[];
  monthYear: string;
  onMonthChange?: (m: string) => void;
  isMonthLocked: boolean;
  session?: CurrentUserSession | null;
  onRefreshData: () => void;
  initialTargetType?: ImportTargetType;
}

export const ImportTab: React.FC<ImportTabProps> = ({
  members,
  workTypes = [],
  products = [],
  referenceScores = [],
  packageCoreConfig = {
    sources: [],
    classifications: [],
    customerTiers: [],
    workTypes: [],
    leaderPlatforms: [],
    modules: []
  },
  packages = [],
  progressTasks = [],
  customers = [],
  monthYear,
  onMonthChange,
  isMonthLocked,
  session = null,
  onRefreshData,
  initialTargetType = 'packages'
}) => {
  return (
    <div className="space-y-5">
      {/* Introduction Banner */}
      <div className="bg-white p-5 rounded-xl border border-slate-200 shadow-2xs">
        <h2 className="text-base font-bold text-slate-900">
          Nhập Dữ Liệu & Đối Soát
        </h2>
        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
          Phân hệ nhập khẩu dữ liệu tập trung từ file Excel (.xlsx) cho hai phân hệ: <strong>Tiếp nhận gói đào tạo</strong> và <strong>Tiến độ thực hiện</strong>.
          Quy trình chuẩn hóa 3 bước: Tải tệp lên, ghép trường thông tin, kiểm tra dữ liệu và chỉ nhập các dòng hợp lệ vào hệ thống.
        </p>
      </div>

      {/* Unified Excel Import Wizard */}
      <ExcelImportWizard
        initialTargetType={initialTargetType}
        allowChangeTarget={true}
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
        onSuccessImport={(_count, _target) => {
          onRefreshData();
        }}
      />
    </div>
  );
};
