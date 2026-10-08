import fs from 'fs';
import path from 'path';
import { DatabaseSchema } from './db';

const BACKUPS_DIR = path.resolve(process.cwd(), 'data', 'backups');

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

export function ensureBackupsDir(): void {
  if (!fs.existsSync(BACKUPS_DIR)) {
    fs.mkdirSync(BACKUPS_DIR, { recursive: true });
  }
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function createBackupSnapshot(
  db: DatabaseSchema,
  tag: 'daily' | 'manual' | 'pre_cleanup' | 'pre_reset' | 'pre_import' = 'daily'
): BackupFileInfo {
  ensureBackupsDir();

  const now = new Date();
  const pad = (n: number) => String(n).padStart(2, '0');
  const dateStr = `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}_${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
  const filename = `backup_${tag}_${dateStr}.json`;
  const filePath = path.join(BACKUPS_DIR, filename);

  const payload = JSON.stringify(db, null, 2);
  fs.writeFileSync(filePath, payload, 'utf-8');

  const stat = fs.statSync(filePath);

  const counts = {
    schedules: Array.isArray(db.schedules) ? db.schedules.length : 0,
    progress: Array.isArray(db.progress) ? db.progress.length : 0,
    packages: Array.isArray(db.packages) ? db.packages.length : 0,
    customers: Array.isArray(db.customers) ? db.customers.length : 0,
    members: Array.isArray(db.members) ? db.members.length : 0,
    totalOperational:
      (Array.isArray(db.schedules) ? db.schedules.length : 0) +
      (Array.isArray(db.progress) ? db.progress.length : 0) +
      (Array.isArray(db.packages) ? db.packages.length : 0)
  };

  // Run retention cleanup keeping last 30 snapshots
  cleanupOldBackups(30);

  return {
    filename,
    createdAt: now.toISOString(),
    sizeBytes: stat.size,
    sizeFormatted: formatBytes(stat.size),
    tag,
    counts
  };
}

export function listBackups(): BackupFileInfo[] {
  ensureBackupsDir();
  try {
    const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json'));
    const result: BackupFileInfo[] = [];

    for (const filename of files) {
      const filePath = path.join(BACKUPS_DIR, filename);
      try {
        const stat = fs.statSync(filePath);
        let tag = 'manual';
        if (filename.includes('_daily_')) tag = 'daily';
        else if (filename.includes('_pre_cleanup_')) tag = 'pre_cleanup';
        else if (filename.includes('_pre_reset_')) tag = 'pre_reset';
        else if (filename.includes('_pre_import_')) tag = 'pre_import';

        // Extract counts by reading minimal JSON
        let counts = {
          schedules: 0,
          progress: 0,
          packages: 0,
          customers: 0,
          members: 0,
          totalOperational: 0
        };

        try {
          const content = fs.readFileSync(filePath, 'utf-8');
          const data = JSON.parse(content);
          counts = {
            schedules: Array.isArray(data.schedules) ? data.schedules.length : 0,
            progress: Array.isArray(data.progress) ? data.progress.length : 0,
            packages: Array.isArray(data.packages) ? data.packages.length : 0,
            customers: Array.isArray(data.customers) ? data.customers.length : 0,
            members: Array.isArray(data.members) ? data.members.length : 0,
            totalOperational:
              (Array.isArray(data.schedules) ? data.schedules.length : 0) +
              (Array.isArray(data.progress) ? data.progress.length : 0) +
              (Array.isArray(data.packages) ? data.packages.length : 0)
          };
        } catch {
          // ignore parsing error for corrupted files
        }

        result.push({
          filename,
          createdAt: stat.mtime.toISOString(),
          sizeBytes: stat.size,
          sizeFormatted: formatBytes(stat.size),
          tag,
          counts
        });
      } catch {
        // ignore individual file stat error
      }
    }

    // Sort newest first
    return result.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  } catch (err) {
    console.error('Lỗi khi đọc danh sách bản sao lưu:', err);
    return [];
  }
}

export function cleanupOldBackups(maxKeep = 30): number {
  ensureBackupsDir();
  try {
    const files = fs.readdirSync(BACKUPS_DIR).filter(f => f.endsWith('.json'));
    if (files.length <= maxKeep) return 0;

    const fileStats = files.map(filename => ({
      filename,
      filePath: path.join(BACKUPS_DIR, filename),
      mtimeMs: fs.statSync(path.join(BACKUPS_DIR, filename)).mtimeMs
    }));

    // Sort oldest first
    fileStats.sort((a, b) => a.mtimeMs - b.mtimeMs);

    const toDeleteCount = files.length - maxKeep;
    let deleted = 0;

    for (let i = 0; i < toDeleteCount; i++) {
      try {
        fs.unlinkSync(fileStats[i].filePath);
        deleted++;
      } catch (err) {
        console.error(`Không thể xóa bản sao lưu cũ: ${fileStats[i].filename}`, err);
      }
    }

    return deleted;
  } catch (err) {
    console.error('Lỗi khi dọn dẹp bản sao lưu cũ:', err);
    return 0;
  }
}

export function readBackupFile(filename: string): { success: boolean; data?: DatabaseSchema; error?: string } {
  ensureBackupsDir();
  const safeFilename = path.basename(filename);
  const filePath = path.join(BACKUPS_DIR, safeFilename);

  if (!fs.existsSync(filePath)) {
    return { success: false, error: 'Tệp sao lưu không tồn tại trên hệ thống.' };
  }

  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw);

    // Integrity checks
    if (!parsed || !parsed.config || !Array.isArray(parsed.members)) {
      return { success: false, error: 'Tệp sao lưu bị lỗi cấu trúc: thiếu config hoặc members.' };
    }

    return { success: true, data: parsed };
  } catch (err: any) {
    return { success: false, error: `Không thể đọc tệp sao lưu: ${err.message}` };
  }
}

export function deleteBackupFile(filename: string): boolean {
  ensureBackupsDir();
  const safeFilename = path.basename(filename);
  const filePath = path.join(BACKUPS_DIR, safeFilename);

  if (fs.existsSync(filePath)) {
    fs.unlinkSync(filePath);
    return true;
  }
  return false;
}

// Automatic Daily Backup Worker
let isWorkerStarted = false;

export function initAutomaticBackupWorker(getDb: () => DatabaseSchema): void {
  if (isWorkerStarted) return;
  isWorkerStarted = true;

  const runCheck = () => {
    try {
      const backups = listBackups();
      const lastDaily = backups.find(b => b.tag === 'daily');

      const now = Date.now();
      const ONE_DAY_MS = 24 * 60 * 60 * 1000;

      let needDaily = true;
      if (lastDaily) {
        const lastTime = new Date(lastDaily.createdAt).getTime();
        if (now - lastTime < ONE_DAY_MS) {
          needDaily = false;
        }
      }

      if (needDaily) {
        const db = getDb();
        if (db && db.members) {
          const snap = createBackupSnapshot(db, 'daily');
          console.log(`[Automatic Backup] Đã tạo bản sao lưu hằng ngày tự động: ${snap.filename} (${snap.sizeFormatted})`);
        }
      }
    } catch (err) {
      console.error('[Automatic Backup] Lỗi khi tạo bản sao lưu định kỳ:', err);
    }
  };

  // Run on startup after 5 seconds
  setTimeout(runCheck, 5000);

  // Check every 6 hours
  setInterval(runCheck, 6 * 60 * 60 * 1000);
}
