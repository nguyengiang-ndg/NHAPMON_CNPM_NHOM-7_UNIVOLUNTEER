import { Router } from 'express';
import type { SqliteDatabase } from '../db/database';
import { AuthUserService } from '../services/authUser.service';
import { AuthRequest, requireRole } from '../middlewares/auth.middleware';

export function createAuthUserRouter(
  db: SqliteDatabase,
  authenticate: (req: AuthRequest, res: any, next: any) => void
) {
  const router = Router();
  const authService = new AuthUserService(db);

  router.post('/auth/register-student', (req, res, next) => {
    try {
      const result = authService.registerStudent(req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/register-manager', (req, res, next) => {
    try {
      const result = authService.registerManager(req.body);
      res.status(201).json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/login', (req, res, next) => {
    try {
      const { email, password } = req.body;
      const result = authService.login(email, password);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/forgot-password', async (req, res, next) => {
    try {
      const { email } = req.body;
      const result = await authService.requestPasswordReset(email);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.post('/auth/reset-password', (req, res, next) => {
    try {
      const { email, otp, newPassword } = req.body;
      const result = authService.resetPasswordWithOtp(email, otp, newPassword);
      res.json(result);
    } catch (err) {
      next(err);
    }
  });

  router.get('/users/me', authenticate, (req: AuthRequest, res, next) => {
    try {
      const user = authService.getUserById(req.authUser!.userId);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  router.put('/users/me', authenticate, (req: AuthRequest, res, next) => {
    try {
      const user = authService.updateProfile(req.authUser!.userId, req.body);
      res.json({ user });
    } catch (err) {
      next(err);
    }
  });

  router.put('/users/me/password', authenticate, (req: AuthRequest, res, next) => {
    try {
      const { currentPassword, newPassword } = req.body;
      authService.changePassword(req.authUser!.userId, currentPassword, newPassword);
      res.json({ message: 'Đổi mật khẩu thành công.' });
    } catch (err) {
      next(err);
    }
  });

  // Avatar góc phải của Sinh viên: xem điểm đã tích và lịch sử tích điểm
  router.get('/student/points', authenticate, requireRole('STUDENT'), (req: AuthRequest, res, next) => {
    try {
      const semester = req.query.semester ? String(req.query.semester) : undefined;
      const data = authService.getStudentPointsOverview(req.authUser!.userId, semester);
      res.json(data);
    } catch (err) {
      next(err);
    }
  });

  // Xuất bảng tổng hợp các hoạt động đã hoàn thành (CSV cho Excel)
  router.get('/student/points/export-csv', authenticate, requireRole('STUDENT'), (req: AuthRequest, res, next) => {
    try {
      const semester = req.query.semester ? String(req.query.semester) : undefined;
      const user = authService.getUserById(req.authUser!.userId);
      const csv = authService.exportStudentCompletedActivitiesCsv(req.authUser!.userId, semester);
      const safeCode = (user.student_code || String(user.id)).replace(/[^a-zA-Z0-9_-]/g, '');
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="bang-tong-hop-hoat-dong-${safeCode}.csv"`
      );
      res.send(csv);
    } catch (err) {
      next(err);
    }
  });

  // Quản lý xem chi tiết sinh viên (HIỆN TẤT CẢ THÔNG TIN TRỪ EMAIL SINH VIÊN)
  router.get(
    '/manager/students/:studentId',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const studentId = Number(req.params.studentId);
        const detail = authService.getStudentDetailForManager(studentId, req.authUser!.userId);
        res.json(detail);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
