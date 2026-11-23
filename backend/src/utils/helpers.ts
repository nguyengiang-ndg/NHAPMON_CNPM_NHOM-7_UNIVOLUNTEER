import crypto from 'node:crypto';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { UserRole } from '../types/models';

function getJwtSecret(): string {
  return process.env.JWT_SECRET || 'univolunteer-super-secret-dev-key-2026';
}

export interface JwtPayload {
  userId: number;
  role: UserRole;
  email: string;
}

export function hashPassword(plain: string): string {
  return bcrypt.hashSync(plain, 10);
}

export function comparePassword(plain: string, hash: string): boolean {
  return bcrypt.compareSync(plain, hash);
}

export function signToken(payload: JwtPayload): string {
  return jwt.sign(payload, getJwtSecret(), { expiresIn: '7d' });
}

export function verifyToken(token: string): JwtPayload {
  return jwt.verify(token, getJwtSecret()) as JwtPayload;
}

export function isValidEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email.trim());
}

/**
 * Kiểm tra xem thời điểm `now` có nằm trong khoảng [end_time, end_time + windowHours] hay không.
 * Mặc định windowHours = 48 giờ (2 ngày) theo đúng yêu cầu nghiệp vụ.
 */
export function isWithinProofWindow(
  endTimeIso: string,
  now: Date = new Date(),
  windowHours = 48
): { ended: boolean; withinWindow: boolean; remainingMs: number; expiresAt: string } {
  const endMs = new Date(endTimeIso).getTime();
  const nowMs = now.getTime();
  const expiresMs = endMs + windowHours * 60 * 60 * 1000;
  const ended = nowMs >= endMs;
  const remainingMs = Math.max(0, expiresMs - nowMs);
  const withinWindow = ended && nowMs <= expiresMs;

  return {
    ended,
    withinWindow,
    remainingMs,
    expiresAt: new Date(expiresMs).toISOString()
  };
}

/**
 * Kiểm tra hai khoảng thời gian có bị giao nhau (trùng lịch) hay không.
 */
export function hasTimeOverlap(
  aStartIso: string,
  aEndIso: string,
  bStartIso: string,
  bEndIso: string
): boolean {
  const aStart = new Date(aStartIso).getTime();
  const aEnd = new Date(aEndIso).getTime();
  const bStart = new Date(bStartIso).getTime();
  const bEnd = new Date(bEndIso).getTime();
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Xác định học kỳ từ ngày diễn ra hoạt động (ví dụ: HK1 2026-2027).
 */
export function resolveSemester(dateIso: string): string {
  const d = new Date(dateIso);
  const month = d.getMonth() + 1;
  const year = d.getFullYear();

  if (month >= 9 && month <= 12) {
    return `HK1 ${year}-${year + 1}`;
  }
  if (month === 1) {
    return `HK1 ${year - 1}-${year}`;
  }
  if (month >= 2 && month <= 6) {
    return `HK2 ${year - 1}-${year}`;
  }
  return `HK Hè ${year - 1}-${year}`;
}

export function escapeCsvCell(value: string | number | null | undefined): string {
  const str = value === null || value === undefined ? '' : String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n') || str.includes('\r')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Sinh mã PIN 6 chữ số động theo chuẩn HMAC-SHA256 + RFC 4226 Dynamic Truncation (kiểu TOTP).
 */
export function computeRotatingPin(secret: string, timeStep: number): string {
  const hmac = crypto.createHmac('sha256', secret).update(String(timeStep)).digest();
  const offset = hmac[hmac.length - 1] & 0x0f;
  const binary =
    ((hmac[offset] & 0x7f) << 24) |
    ((hmac[offset + 1] & 0xff) << 16) |
    ((hmac[offset + 2] & 0xff) << 8) |
    (hmac[offset + 3] & 0xff);
  const code = binary % 1_000_000;
  return String(code).padStart(6, '0');
}

export function timingSafePinEqual(provided: string, expected: string): boolean {
  const providedBuf = Buffer.from(provided, 'utf8');
  const expectedBuf = Buffer.from(expected, 'utf8');
  if (providedBuf.length !== expectedBuf.length || providedBuf.length === 0) {
    return false;
  }
  return crypto.timingSafeEqual(providedBuf, expectedBuf);
}
