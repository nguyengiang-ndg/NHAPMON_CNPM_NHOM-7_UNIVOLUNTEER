import { NextFunction, Request, Response } from 'express';
import type { SqliteDatabase } from '../db/database';
import { AppError, UserRecord, UserRole } from '../types/models';
import { verifyToken } from '../utils/helpers';

export interface AuthRequest extends Request {
  authUser?: {
    userId: number;
    role: UserRole;
    email: string;
  };
}

export function createAuthenticateMiddleware(db: SqliteDatabase) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return next(new AppError('Vui lòng đăng nhập để tiếp tục.', 401));
    }

    const token = authHeader.slice('Bearer '.length).trim();
    try {
      const decoded = verifyToken(token);
      const user = db
        .prepare('SELECT id, role, email, status FROM users WHERE id = ?')
        .get(decoded.userId) as unknown as Pick<UserRecord, 'id' | 'role' | 'email' | 'status'> | undefined;

      if (!user) {
        return next(new AppError('Tài khoản không còn tồn tại.', 401));
      }
      if (user.status !== 'ACTIVE') {
        return next(new AppError('Tài khoản hiện không ở trạng thái hoạt động.', 403));
      }

      req.authUser = {
        userId: user.id,
        role: user.role,
        email: user.email
      };
      next();
    } catch {
      next(new AppError('Phiên đăng nhập không hợp lệ hoặc đã hết hạn.', 401));
    }
  };
}

export function requireRole(...roles: UserRole[]) {
  return (req: AuthRequest, _res: Response, next: NextFunction) => {
    if (!req.authUser) {
      return next(new AppError('Vui lòng đăng nhập.', 401));
    }
    if (!roles.includes(req.authUser.role)) {
      return next(new AppError('Bạn không có quyền thực hiện chức năng này.', 403));
    }
    next();
  };
}

export function errorHandler(err: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({ error: err.message });
    return;
  }
  console.error('Unhandled API Error:', err);
  res.status(500).json({ error: 'Đã xảy ra lỗi hệ thống. Vui lòng thử lại sau.' });
}
