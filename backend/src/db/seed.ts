import type { SqliteDatabase } from './database';
import { hashPassword } from '../utils/helpers';

export const DEFAULT_ADMIN_EMAIL = 'adminnguyendangiang@gmail.com';
export const DEFAULT_ADMIN_PASSWORD = 'Giang123@';

/**
 * Khởi tạo duy nhất tài khoản Admin mặc định cho hệ thống (không tạo dữ liệu demo giả).
 * Không ghi file ra đĩa để tương thích hoàn toàn với môi trường Serverless như Vercel.
 */
export function ensureAdminAccount(db: SqliteDatabase): void {
  const adminEmail = (process.env.ADMIN_EMAIL || DEFAULT_ADMIN_EMAIL).trim().toLowerCase();
  const adminPassword = process.env.ADMIN_PASSWORD || DEFAULT_ADMIN_PASSWORD;

  const existing = db
    .prepare('SELECT id, role FROM users WHERE LOWER(email) = LOWER(?)')
    .get(adminEmail) as { id: number; role: string } | undefined;

  if (existing) {
    return;
  }

  const passwordHash = hashPassword(adminPassword);
  db.prepare(
    `INSERT INTO users (email, password_hash, role, status, full_name, dob, phone, student_code, address)
     VALUES (?, ?, 'ADMIN', 'ACTIVE', ?, ?, ?, NULL, ?)`
  ).run(
    adminEmail,
    passwordHash,
    'Quản trị viên Hệ thống',
    '1990-01-01',
    '0900000000',
    'Quản trị hệ thống UniVolunteer'
  );
}
