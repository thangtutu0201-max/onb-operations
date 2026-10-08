import { DatabaseSchema } from './db';

function escapeCsvField(val: any): string {
  if (val === null || val === undefined) return '';
  const str = String(val);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

export function exportSchedulesToCsv(
  db: DatabaseSchema,
  fromDate?: string,
  toDate?: string
): string {
  let list = db.schedules || [];
  if (fromDate) list = list.filter(s => s.date >= fromDate);
  if (toDate) list = list.filter(s => s.date <= toDate);

  const headers = [
    'Mã lịch',
    'Mã nhân sự',
    'Nhân sự phối hợp',
    'Ngày diễn ra',
    'Buổi',
    'Hình thức / Loại việc',
    'Sản phẩm / Module',
    'Khách hàng / Nội dung công việc',
    'Trạng thái',
    'Địa điểm / Link họp',
    'Ghi chú',
    'Tháng năm'
  ];

  const rows = list.map(s => [
    escapeCsvField(s.id),
    escapeCsvField(s.onbCode),
    escapeCsvField(Array.isArray(s.collaborators) ? s.collaborators.join('; ') : ''),
    escapeCsvField(s.date),
    escapeCsvField(s.sessionOfDay || ''),
    escapeCsvField(s.workFormName || s.workTypeCode),
    escapeCsvField(s.productCode || ''),
    escapeCsvField(s.customerOrTask),
    escapeCsvField(s.status),
    escapeCsvField(s.locationOrLink || ''),
    escapeCsvField(s.notes || ''),
    escapeCsvField(s.monthYear)
  ]);

  // UTF-8 BOM for Microsoft Excel compatibility with Vietnamese
  return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}

export function exportProgressToCsv(
  db: DatabaseSchema,
  fromDate?: string,
  toDate?: string
): string {
  let list = db.progress || [];
  if (fromDate) list = list.filter(p => p.date >= fromDate);
  if (toDate) list = list.filter(p => p.date <= toDate);

  const headers = [
    'Mã tiến độ',
    'Tên công việc',
    'Nhân sự chính',
    'Ngày ghi nhận',
    'Loại việc',
    'Sản phẩm',
    'Khối lượng',
    'Số tiền (VNĐ)',
    'Điểm gợi ý',
    'Điểm ghi nhận',
    'Chia điểm nhân sự',
    'Trạng thái',
    'Ghi chú',
    'Tháng năm'
  ];

  const rows = list.map(p => {
    const splitsText = Array.isArray(p.splits)
      ? p.splits.map(sp => `${sp.onbCode}: ${sp.points}`).join('; ')
      : '';

    return [
      escapeCsvField(p.code || p.id),
      escapeCsvField(p.taskName),
      escapeCsvField(p.primaryOnbCode),
      escapeCsvField(p.date),
      escapeCsvField(p.workTypeCode),
      escapeCsvField(p.productCode || ''),
      escapeCsvField(p.quantity ?? ''),
      escapeCsvField(p.amount ?? ''),
      escapeCsvField(p.suggestedScore),
      escapeCsvField(p.recordedScore),
      escapeCsvField(splitsText),
      escapeCsvField(p.status),
      escapeCsvField(p.notes || ''),
      escapeCsvField(p.monthYear)
    ];
  });

  return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}

export function exportPackagesToCsv(
  db: DatabaseSchema,
  fromDate?: string,
  toDate?: string
): string {
  let list = db.packages || [];
  if (fromDate) list = list.filter(p => (p.receptionDate || `${p.monthYear}-01`) >= fromDate);
  if (toDate) list = list.filter(p => (p.receptionDate || `${p.monthYear}-01`) <= toDate);

  const headers = [
    'Mã gói',
    'Tên khách hàng',
    'Mã số thuế',
    'Ngày tiếp nhận',
    'Nguồn tiếp nhận',
    'Phân loại',
    'Phân hạng khách hàng',
    'Loại hình',
    'Module triển khai & Điểm chi tiết',
    'Tháng năm',
    'Ghi chú'
  ];

  const rows = list.map(pkg => {
    const detailsText = Array.isArray(pkg.details)
      ? pkg.details.map(d => `${d.moduleName || d.moduleCode} (${d.onbCode}: ${d.recordedScore}đ)`).join('; ')
      : '';

    return [
      escapeCsvField(pkg.packageCode || pkg.id),
      escapeCsvField(pkg.customerName || pkg.packageName || ''),
      escapeCsvField(pkg.taxCode || ''),
      escapeCsvField(pkg.receptionDate || ''),
      escapeCsvField(pkg.sourceName || pkg.sourceCode || ''),
      escapeCsvField(pkg.packageClass || ''),
      escapeCsvField(pkg.customerTier || ''),
      escapeCsvField(pkg.workForm || ''),
      escapeCsvField(detailsText),
      escapeCsvField(pkg.monthYear),
      escapeCsvField(pkg.notes || '')
    ];
  });

  return '\uFEFF' + [headers.join(','), ...rows.map(r => r.join(','))].join('\r\n');
}
