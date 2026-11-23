import path from 'node:path';
import fs from 'node:fs';

export interface SqliteRunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface SqliteStatement {
  run(...params: unknown[]): SqliteRunResult;
  get(...params: unknown[]): Record<string, unknown> | undefined;
  all(...params: unknown[]): Array<Record<string, unknown>>;
}

export interface SqliteDatabase {
  exec(sql: string): void;
  prepare(sql: string): SqliteStatement;
  close(): void;
}

interface NodeSqliteModule {
  DatabaseSync: new (location: string) => SqliteDatabase;
}

const sqliteMod = (
  process as unknown as {
    getBuiltinModule: (name: string) => NodeSqliteModule | undefined;
  }
).getBuiltinModule('node:sqlite');

if (!sqliteMod?.DatabaseSync) {
  throw new Error('Runtime không hỗ trợ node:sqlite. Yêu cầu Node.js >= 22.5 / Node.js 24 LTS.');
}

const DatabaseSync = sqliteMod.DatabaseSync;

let sharedDb: SqliteDatabase | null = null;

export function resolveDefaultDbPath(): string {
  if (process.env.DB_PATH) {
    return process.env.DB_PATH;
  }
  if (process.env.VERCEL === '1') {
    return '/tmp/univolunteer.db';
  }
  return path.resolve(__dirname, '../../data/univolunteer.db');
}

export function createDatabase(dbPath?: string): SqliteDatabase {
  const target = dbPath ?? resolveDefaultDbPath();
  if (target !== ':memory:') {
    fs.mkdirSync(path.dirname(target), { recursive: true });
  }

  const db = new DatabaseSync(target);
  db.exec('PRAGMA foreign_keys = ON;');
  if (target !== ':memory:' && process.env.VERCEL !== '1') {
    db.exec('PRAGMA journal_mode = WAL;');
  }

  initSchema(db);
  return db;
}

export function initSchema(db: SqliteDatabase): void {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      email TEXT NOT NULL UNIQUE,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('STUDENT', 'MANAGER', 'ADMIN')),
      status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('PENDING', 'ACTIVE', 'REJECTED', 'LOCKED')),
      full_name TEXT NOT NULL,
      dob TEXT,
      phone TEXT NOT NULL,
      student_code TEXT UNIQUE,
      address TEXT,
      avatar_url TEXT,
      reject_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now'))
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      manager_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      description TEXT NOT NULL,
      cover_image TEXT NOT NULL,
      location TEXT NOT NULL,
      start_time TEXT NOT NULL,
      end_time TEXT NOT NULL,
      registration_deadline TEXT NOT NULL,
      max_participants INTEGER NOT NULL CHECK(max_participants > 0),
      training_points INTEGER NOT NULL CHECK(training_points >= 0),
      status TEXT NOT NULL DEFAULT 'PENDING_APPROVAL' CHECK(status IN ('PENDING_APPROVAL', 'APPROVED', 'REJECTED', 'CANCEL_REQUESTED', 'CANCELLED')),
      reject_reason TEXT,
      cancel_reason TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (manager_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS registrations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      note_to_manager TEXT,
      status TEXT NOT NULL DEFAULT 'PENDING' CHECK(status IN ('PENDING', 'APPROVED', 'REJECTED', 'CANCEL_REQUESTED', 'CANCELLED')),
      cancel_reason TEXT,
      reject_reason TEXT,
      registered_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(activity_id, student_id),
      FOREIGN KEY (activity_id) REFERENCES activities(id),
      FOREIGN KEY (student_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS proof_submissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      registration_id INTEGER NOT NULL UNIQUE,
      image_url TEXT NOT NULL,
      description TEXT,
      status TEXT NOT NULL DEFAULT 'SUBMITTED' CHECK(status IN ('SUBMITTED', 'CONFIRMED', 'REJECTED')),
      reject_reason TEXT,
      submitted_at TEXT NOT NULL DEFAULT (datetime('now')),
      reviewed_at TEXT,
      FOREIGN KEY (registration_id) REFERENCES registrations(id)
    );

    CREATE TABLE IF NOT EXISTS point_histories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      student_id INTEGER NOT NULL,
      activity_id INTEGER NOT NULL,
      registration_id INTEGER NOT NULL UNIQUE,
      points INTEGER NOT NULL,
      semester TEXT NOT NULL,
      awarded_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (student_id) REFERENCES users(id),
      FOREIGN KEY (activity_id) REFERENCES activities(id),
      FOREIGN KEY (registration_id) REFERENCES registrations(id)
    );

    CREATE TABLE IF NOT EXISTS reports (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      reporter_id INTEGER NOT NULL,
      sender_role TEXT NOT NULL CHECK(sender_role IN ('STUDENT', 'MANAGER')),
      target_type TEXT NOT NULL CHECK(target_type IN ('ACTIVITY', 'USER', 'PROOF', 'OTHER')),
      target_id INTEGER,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'IN_PROGRESS', 'RESOLVED')),
      admin_response TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (reporter_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      title TEXT NOT NULL,
      message TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'INFO',
      is_read INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      description TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS password_reset_otps (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL,
      email TEXT NOT NULL,
      otp_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      used INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      FOREIGN KEY (user_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS activity_waitlists (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      student_id INTEGER NOT NULL,
      note_to_manager TEXT,
      status TEXT NOT NULL DEFAULT 'WAITING' CHECK(status IN ('WAITING', 'NOTIFIED', 'PROMOTED', 'CANCELLED')),
      notified_at TEXT,
      created_at TEXT NOT NULL DEFAULT (datetime('now')),
      updated_at TEXT NOT NULL DEFAULT (datetime('now')),
      UNIQUE(activity_id, student_id),
      FOREIGN KEY (activity_id) REFERENCES activities(id),
      FOREIGN KEY (student_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS attendance_sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      manager_id INTEGER NOT NULL,
      mode TEXT NOT NULL DEFAULT 'STATIC' CHECK(mode IN ('STATIC', 'ROTATING')),
      pin_code TEXT,
      secret TEXT NOT NULL,
      rotate_seconds INTEGER NOT NULL DEFAULT 60,
      is_active INTEGER NOT NULL DEFAULT 1,
      opened_at TEXT NOT NULL DEFAULT (datetime('now')),
      expires_at TEXT NOT NULL,
      closed_at TEXT,
      FOREIGN KEY (activity_id) REFERENCES activities(id),
      FOREIGN KEY (manager_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS attendance_records (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL,
      registration_id INTEGER NOT NULL UNIQUE,
      student_id INTEGER NOT NULL,
      session_id INTEGER,
      method TEXT NOT NULL CHECK(method IN ('PIN', 'QR', 'MANUAL')),
      checked_in_at TEXT NOT NULL DEFAULT (datetime('now')),
      checked_in_by INTEGER,
      FOREIGN KEY (activity_id) REFERENCES activities(id),
      FOREIGN KEY (registration_id) REFERENCES registrations(id),
      FOREIGN KEY (student_id) REFERENCES users(id),
      FOREIGN KEY (session_id) REFERENCES attendance_sessions(id),
      FOREIGN KEY (checked_in_by) REFERENCES users(id)
    );
  `);

  db.prepare(
    `INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)`
  ).run(
    'PROOF_WINDOW_HOURS',
    '48',
    'Thời gian tối đa (giờ) cho phép sinh viên nộp ảnh minh chứng sau khi hoạt động kết thúc (mặc định 48h = 2 ngày)'
  );

  db.prepare(
    `INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)`
  ).run(
    'MAX_TRAINING_POINTS_PER_ACTIVITY',
    '20',
    'Điểm rèn luyện tối đa cho mỗi hoạt động tình nguyện'
  );

  db.prepare(
    `INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)`
  ).run(
    'CANCEL_CUTOFF_HOURS',
    '24',
    'Số giờ tối thiểu trước thời gian bắt đầu hoạt động để sinh viên đã duyệt được gửi yêu cầu hủy'
  );

  db.prepare(
    `INSERT OR IGNORE INTO system_settings (key, value, description) VALUES (?, ?, ?)`
  ).run(
    'REQUIRE_CHECKIN_FOR_PROOF',
    '1',
    'Bắt buộc sinh viên điểm danh có mặt (PIN/QR hoặc Quản lý xác nhận) trước khi nộp ảnh minh chứng (1 = Bật, 0 = Tắt)'
  );
}

export function getDb(): SqliteDatabase {
  if (!sharedDb) {
    sharedDb = createDatabase();
  }
  return sharedDb;
}
