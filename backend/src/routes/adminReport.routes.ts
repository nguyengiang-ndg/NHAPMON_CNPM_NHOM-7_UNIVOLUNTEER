import { Router } from 'express';
import type { SqliteDatabase } from '../db/database';
import { AdminReportService } from '../services/adminReport.service';
import { AuthRequest, requireRole } from '../middlewares/auth.middleware';
import { ReportStatus } from '../types/models';

export function createAdminReportRouter(
  db: SqliteDatabase,
  authenticate: (req: AuthRequest, res: any, next: any) => void
) {
  const router = Router();
  const arService = new AdminReportService(db);

  // ======================== BÁO CÁO & THÔNG BÁO (STUDENT & MANAGER) ========================

  router.post(
    '/reports',
    authenticate,
    requireRole('STUDENT', 'MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const senderRole = req.authUser!.role as 'STUDENT' | 'MANAGER';
        const report = arService.createReport(req.authUser!.userId, senderRole, req.body);
        res.status(201).json({
          message: 'Đã gửi báo cáo lên Admin thành công.',
          report
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get('/reports/mine', authenticate, requireRole('STUDENT', 'MANAGER'), (req: AuthRequest, res, next) => {
    try {
      const reports = arService.getMyReports(req.authUser!.userId);
      res.json({ reports });
    } catch (err) {
      next(err);
    }
  });

  router.get('/notifications', authenticate, (req: AuthRequest, res, next) => {
    try {
      const notifications = arService.getNotifications(req.authUser!.userId);
      res.json({ notifications });
    } catch (err) {
      next(err);
    }
  });

  router.post('/notifications/read-all', authenticate, (req: AuthRequest, res, next) => {
    try {
      arService.markAllNotificationsRead(req.authUser!.userId);
      res.json({ message: 'Đã đánh dấu tất cả thông báo là đã đọc.' });
    } catch (err) {
      next(err);
    }
  });

  // ======================== QUẢN TRỊ VIÊN (ADMIN) ========================

  router.get('/admin/dashboard', authenticate, requireRole('ADMIN'), (_req, res, next) => {
    try {
      const stats = arService.getDashboardStats();
      res.json({ stats });
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/settings', authenticate, requireRole('ADMIN'), (_req, res, next) => {
    try {
      const settings = arService.getSystemSettings();
      res.json({ settings });
    } catch (err) {
      next(err);
    }
  });

  router.put('/admin/settings/:key', authenticate, requireRole('ADMIN'), (req, res, next) => {
    try {
      const setting = arService.updateSystemSetting(String(req.params.key), String(req.body.value));
      res.json({ message: 'Cập nhật cấu hình thành công.', setting });
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/managers', authenticate, requireRole('ADMIN'), (req, res, next) => {
    try {
      const status = req.query.status ? String(req.query.status) : undefined;
      const managers = arService.listManagers(status);
      res.json({ managers });
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/managers/:id/review', authenticate, requireRole('ADMIN'), (req, res, next) => {
    try {
      const { decision, rejectReason } = req.body as {
        decision: 'APPROVE' | 'REJECT';
        rejectReason?: string;
      };
      const manager = arService.reviewManagerAccount(Number(req.params.id), decision, rejectReason);
      res.json({
        message: decision === 'APPROVE' ? 'Đã duyệt tài khoản Quản lý.' : 'Đã từ chối tài khoản Quản lý.',
        manager
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/users/:id/lock', authenticate, requireRole('ADMIN'), (req, res, next) => {
    try {
      const user = arService.toggleUserLock(Number(req.params.id), Boolean(req.body.lock));
      res.json({
        message: req.body.lock ? 'Đã khóa tài khoản.' : 'Đã mở khóa tài khoản.',
        user
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/students', authenticate, requireRole('ADMIN'), (req, res, next) => {
    try {
      const search = req.query.search ? String(req.query.search) : '';
      const students = arService.listStudentsForAdmin(search);
      res.json({ students });
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/students/:id', authenticate, requireRole('ADMIN'), (req, res, next) => {
    try {
      const detail = arService.getStudentFullDetailForAdmin(Number(req.params.id));
      res.json(detail);
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/activities', authenticate, requireRole('ADMIN'), (req, res, next) => {
    try {
      const status = req.query.status ? String(req.query.status) : undefined;
      const activities = arService.listActivitiesForAdmin(status);
      res.json({ activities });
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/activities/:id/review', authenticate, requireRole('ADMIN'), (req, res, next) => {
    try {
      const { decision, rejectReason } = req.body as {
        decision: 'APPROVE' | 'REJECT';
        rejectReason?: string;
      };
      const activity = arService.reviewActivityProposal(Number(req.params.id), decision, rejectReason);
      res.json({
        message: decision === 'APPROVE' ? 'Đã duyệt hoạt động.' : 'Đã từ chối hoạt động.',
        activity
      });
    } catch (err) {
      next(err);
    }
  });

  router.post('/admin/activities/:id/review-cancel', authenticate, requireRole('ADMIN'), (req, res, next) => {
    try {
      const { decision, note } = req.body as {
        decision: 'APPROVE' | 'REJECT';
        note?: string;
      };
      const activity = arService.reviewActivityCancelRequest(Number(req.params.id), decision, note);
      res.json({
        message:
          decision === 'APPROVE'
            ? 'Đã duyệt hủy hoạt động và thông báo tới các sinh viên.'
            : 'Đã từ chối yêu cầu hủy hoạt động.',
        activity
      });
    } catch (err) {
      next(err);
    }
  });

  router.get('/admin/reports', authenticate, requireRole('ADMIN'), (req, res, next) => {
    try {
      const senderRole = req.query.senderRole ? String(req.query.senderRole) : undefined;
      const status = req.query.status ? String(req.query.status) : undefined;
      const reports = arService.listReportsForAdmin(senderRole, status);
      res.json({ reports });
    } catch (err) {
      next(err);
    }
  });

  router.put('/admin/reports/:id', authenticate, requireRole('ADMIN'), (req, res, next) => {
    try {
      const { status, adminResponse } = req.body as { status: ReportStatus; adminResponse: string };
      const report = arService.resolveReport(Number(req.params.id), status, adminResponse || '');
      res.json({
        message: 'Đã cập nhật xử lý báo cáo.',
        report
      });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
