import { Router } from 'express';
import type { SqliteDatabase } from '../db/database';
import { RegistrationProofService } from '../services/registrationProof.service';
import { AuthRequest, requireRole } from '../middlewares/auth.middleware';

export function createRegistrationProofRouter(
  db: SqliteDatabase,
  authenticate: (req: AuthRequest, res: any, next: any) => void
) {
  const router = Router();
  const rpService = new RegistrationProofService(db);

  // ======================== LUỒNG SINH VIÊN ========================

  router.post(
    '/student/activities/:activityId/register',
    authenticate,
    requireRole('STUDENT'),
    (req: AuthRequest, res, next) => {
      try {
        const activityId = Number(req.params.activityId);
        const noteToManager = req.body?.noteToManager || '';
        const result = rpService.registerActivity(req.authUser!.userId, activityId, noteToManager);
        res.status(201).json({
          message: 'Đăng ký thành công! Đơn của bạn đang chờ Quản lý hoạt động duyệt.',
          ...result
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get('/student/schedule', authenticate, requireRole('STUDENT'), (req: AuthRequest, res, next) => {
    try {
      const schedule = rpService.getStudentSchedule(req.authUser!.userId);
      const cancelCutoffHours = rpService.getCancelCutoffHours();
      res.json({ schedule, cancelCutoffHours });
    } catch (err) {
      next(err);
    }
  });

  router.post(
    '/student/registrations/:registrationId/cancel',
    authenticate,
    requireRole('STUDENT'),
    (req: AuthRequest, res, next) => {
      try {
        const registrationId = Number(req.params.registrationId);
        const reason = req.body?.reason || '';
        const result = rpService.studentCancelRegistration(req.authUser!.userId, registrationId, reason);
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/student/activities/:activityId/waitlist',
    authenticate,
    requireRole('STUDENT'),
    (req: AuthRequest, res, next) => {
      try {
        const activityId = Number(req.params.activityId);
        const noteToManager = req.body?.noteToManager || '';
        const result = rpService.joinWaitlist(req.authUser!.userId, activityId, noteToManager);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    '/student/activities/:activityId/waitlist',
    authenticate,
    requireRole('STUDENT'),
    (req: AuthRequest, res, next) => {
      try {
        const activityId = Number(req.params.activityId);
        const result = rpService.leaveWaitlist(req.authUser!.userId, activityId);
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.get('/student/waitlists', authenticate, requireRole('STUDENT'), (req: AuthRequest, res, next) => {
    try {
      const waitlists = rpService.getStudentWaitlists(req.authUser!.userId);
      res.json({ waitlists });
    } catch (err) {
      next(err);
    }
  });

  // Hoạt động đã kết thúc trong vòng 2 ngày (48h) để nộp minh chứng
  router.get(
    '/student/ended-activities',
    authenticate,
    requireRole('STUDENT'),
    (req: AuthRequest, res, next) => {
      try {
        const activities = rpService.getEndedActivitiesForStudent(req.authUser!.userId);
        const proofWindowHours = rpService.getProofWindowHours();
        const requireCheckInForProof = rpService.isCheckInRequiredForProof();
        res.json({ activities, proofWindowHours, requireCheckInForProof });
      } catch (err) {
        next(err);
      }
    }
  );

  // Sinh viên điểm danh có mặt bằng PIN 6 số hoặc QR Code
  router.post(
    '/student/activities/:activityId/checkin',
    authenticate,
    requireRole('STUDENT'),
    (req: AuthRequest, res, next) => {
      try {
        const activityId = Number(req.params.activityId);
        const pin = String(req.body?.pin ?? '');
        const method = req.body?.method === 'QR' ? 'QR' : 'PIN';
        const result = rpService.studentCheckIn(req.authUser!.userId, activityId, pin, method);
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/student/registrations/:registrationId/proof',
    authenticate,
    requireRole('STUDENT'),
    (req: AuthRequest, res, next) => {
      try {
        const registrationId = Number(req.params.registrationId);
        const { imageUrl, description } = req.body;
        const proof = rpService.submitProof(
          req.authUser!.userId,
          registrationId,
          imageUrl,
          description
        );
        res.status(201).json({
          message: 'Đã gửi ảnh minh chứng thành công! Chờ Quản lý hoạt động xác nhận.',
          proof
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ======================== LUỒNG QUẢN LÝ ========================

  router.post(
    '/manager/registrations/:registrationId/review',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const registrationId = Number(req.params.registrationId);
        const { decision, rejectReason } = req.body as {
          decision: 'APPROVE' | 'REJECT';
          rejectReason?: string;
        };
        const registration = rpService.reviewRegistration(
          req.authUser!.userId,
          registrationId,
          decision,
          rejectReason
        );
        res.json({
          message: decision === 'APPROVE' ? 'Đã duyệt sinh viên tham gia.' : 'Đã từ chối đơn đăng ký.',
          registration
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/manager/registrations/:registrationId/review-cancel',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const registrationId = Number(req.params.registrationId);
        const { decision, note } = req.body as {
          decision: 'APPROVE' | 'REJECT';
          note?: string;
        };
        const registration = rpService.reviewCancelRequest(
          req.authUser!.userId,
          registrationId,
          decision,
          note
        );
        res.json({
          message:
            decision === 'APPROVE'
              ? 'Đã đồng ý cho sinh viên hủy đăng ký.'
              : 'Đã từ chối yêu cầu hủy đăng ký.',
          registration
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.get(
    '/manager/ended-activities',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const activities = rpService.getEndedActivitiesForManager(req.authUser!.userId);
        res.json({ activities });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/manager/proofs/:proofId/review',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const proofId = Number(req.params.proofId);
        const { decision, rejectReason } = req.body as {
          decision: 'CONFIRM' | 'REJECT';
          rejectReason?: string;
        };
        const proof = rpService.reviewProofSubmission(
          req.authUser!.userId,
          proofId,
          decision,
          rejectReason
        );
        res.json({
          message:
            decision === 'CONFIRM'
              ? 'Đã xác nhận minh chứng và cộng điểm rèn luyện cho sinh viên.'
              : 'Đã từ chối ảnh minh chứng.',
          proof
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/manager/activities/:activityId/bulk-confirm-proofs',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const result = rpService.bulkConfirmProofs(
          req.authUser!.userId,
          Number(req.params.activityId)
        );
        res.json({
          message: `Đã xác nhận hàng loạt ${result.confirmedCount} minh chứng và cộng điểm cho sinh viên.`,
          ...result
        });
      } catch (err) {
        next(err);
      }
    }
  );

  // ======================== ĐIỂM DANH PIN / QR (QUẢN LÝ) ========================

  router.get(
    '/manager/activities/:activityId/attendance',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const state = rpService.getManagerAttendanceState(
          req.authUser!.userId,
          Number(req.params.activityId)
        );
        res.json(state);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/manager/activities/:activityId/attendance/open',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const result = rpService.openAttendanceSession(
          req.authUser!.userId,
          Number(req.params.activityId),
          req.body || {}
        );
        res.status(201).json({
          message: 'Đã mở phiên điểm danh (PIN & QR Code).',
          ...result
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/manager/activities/:activityId/attendance/rotate',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const result = rpService.rotateAttendancePin(
          req.authUser!.userId,
          Number(req.params.activityId)
        );
        res.json({
          message: 'Đã đổi mã PIN / QR điểm danh mới.',
          ...result
        });
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/manager/activities/:activityId/attendance/close',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const result = rpService.closeAttendanceSession(
          req.authUser!.userId,
          Number(req.params.activityId)
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.post(
    '/manager/registrations/:registrationId/manual-checkin',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const result = rpService.manualCheckIn(
          req.authUser!.userId,
          Number(req.params.registrationId)
        );
        res.status(201).json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  router.delete(
    '/manager/registrations/:registrationId/manual-checkin',
    authenticate,
    requireRole('MANAGER'),
    (req: AuthRequest, res, next) => {
      try {
        const result = rpService.undoManualCheckIn(
          req.authUser!.userId,
          Number(req.params.registrationId)
        );
        res.json(result);
      } catch (err) {
        next(err);
      }
    }
  );

  return router;
}
