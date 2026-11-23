import { Router } from 'express';
import type { SqliteDatabase } from '../db/database';
import { ActivityService } from '../services/activity.service';
import { AuthRequest, requireRole } from '../middlewares/auth.middleware';

export function createActivityRouter(
  db: SqliteDatabase,
  authenticate: (req: AuthRequest, res: any, next: any) => void
) {
  const router = Router();
  const activityService = new ActivityService(db);

  // Công khai cho Khách (chưa đăng nhập) & Sinh viên
  router.get('/activities', (req, res, next) => {
    try {
      const search = req.query.search ? String(req.query.search) : undefined;
      const onlyAvailable = req.query.onlyAvailable === 'true';
      const minPoints = req.query.minPoints ? Number(req.query.minPoints) : undefined;
      const timeframe = req.query.timeframe === 'UPCOMING' ? 'UPCOMING' : 'ALL';
      const activities = activityService.listPublicActivities({
        search,
        onlyAvailable,
        minPoints,
        timeframe
      });
      res.json({ activities });
    } catch (err) {
      next(err);
    }
  });

  router.get('/activities/:id', (req, res, next) => {
    try {
      const activity = activityService.getPublicActivityDetail(Number(req.params.id));
      res.json({ activity });
    } catch (err) {
      next(err);
    }
  });

  // Quản lý hoạt động
  router.get('/manager/activities', authenticate, requireRole('MANAGER'), (req: AuthRequest, res, next) => {
    try {
      const activities = activityService.getManagerActivities(req.authUser!.userId);
      res.json({ activities });
    } catch (err) {
      next(err);
    }
  });

  router.post('/manager/activities', authenticate, requireRole('MANAGER'), (req: AuthRequest, res, next) => {
    try {
      const activity = activityService.createActivity(req.authUser!.userId, req.body);
      res.status(201).json({
        message: 'Đã gửi đề xuất hoạt động lên Admin phê duyệt.',
        activity
      });
    } catch (err) {
      next(err);
    }
  });

  router.put('/manager/activities/:id', authenticate, requireRole('MANAGER'), (req: AuthRequest, res, next) => {
    try {
      const activity = activityService.updateRejectedActivity(
        req.authUser!.userId,
        Number(req.params.id),
        req.body
      );
      res.json({
        message: 'Đã cập nhật và gửi lại Admin phê duyệt.',
        activity
      });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/manager/activities/:id/cancel-request',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const activity = activityService.requestCancelActivity(
          req.authUser!.userId,
          Number(req.params.id),
          req.body.reason
        );
        res.json({
          message: 'Đã gửi yêu cầu hủy hoạt động lên Admin xem xét.',
          activity
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/manager/activities/:id',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const detail = activityService.getManagerActivityDetail(
          req.authUser!.userId,
          Number(req.params.id)
        );
        res.json(detail);
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/manager/activities/:id/export-csv',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const csv = activityService.exportManagerActivityCsv(
          req.authUser!.userId,
          Number(req.params.id)
        );
        res.setHeader('Content-Type', 'text/csv; charset=utf-8');
        res.setHeader(
          'Content-Disposition',
          `attachment; filename="danh-sach-sv-hoat-dong-${req.params.id}.csv"`
        );
        res.send(csv);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
