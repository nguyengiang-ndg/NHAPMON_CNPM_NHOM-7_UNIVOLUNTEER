import crypto from 'node:crypto';
import type { SqliteDatabase } from '../db/database';
import {
  ActivityRecord,
  ActivityWaitlistRecord,
  AppError,
  AttendanceRecord,
  AttendanceSessionMode,
  AttendanceSessionRecord,
  RegistrationRecord
} from '../types/models';
import {
  computeRotatingPin,
  hasTimeOverlap,
  isWithinProofWindow,
  resolveSemester,
  timingSafePinEqual
} from '../utils/helpers';
import { sanitizeStudentForManager } from './authUser.service';

export class RegistrationProofService {
  constructor(private readonly db: SqliteDatabase) {}

  private notifyManagerNewRegistration(activity: ActivityRecord, studentId: number): void {
    const student = this.db
      .prepare('SELECT full_name, student_code FROM users WHERE id = ?')
      .get(studentId) as { full_name: string; student_code: string };

    this.db
      .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
      .run(
        activity.manager_id,
        'Có sinh viên mới đăng ký hoạt động',
        `${student.full_name} (${student.student_code}) vừa đăng ký "${activity.title}" và đang chờ bạn duyệt.`,
        'INFO'
      );
  }

  public getProofWindowHours(): number {
    const row = this.db
      .prepare("SELECT value FROM system_settings WHERE key = 'PROOF_WINDOW_HOURS'")
      .get() as { value: string } | undefined;
    const parsed = row ? Number(row.value) : 48;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 48;
  }

  public getCancelCutoffHours(): number {
    const row = this.db
      .prepare("SELECT value FROM system_settings WHERE key = 'CANCEL_CUTOFF_HOURS'")
      .get() as { value: string } | undefined;
    const parsed = row ? Number(row.value) : 24;
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 24;
  }

  public isCheckInRequiredForProof(): boolean {
    const row = this.db
      .prepare("SELECT value FROM system_settings WHERE key = 'REQUIRE_CHECKIN_FOR_PROOF'")
      .get() as { value: string } | undefined;
    if (!row) return true;
    return row.value !== '0';
  }

  private formatSessionForManager(session: AttendanceSessionRecord, now: Date) {
    const nowMs = now.getTime();
    const expiresMs = new Date(session.expires_at).getTime();
    const isExpired = nowMs > expiresMs;

    let currentPin = session.pin_code || '';
    let nextRotateAt: string | null = null;
    let secondsUntilRotate: number | null = null;

    if (session.mode === 'ROTATING') {
      const stepMs = session.rotate_seconds * 1000;
      const currentStep = Math.floor(nowMs / stepMs);
      currentPin = computeRotatingPin(session.secret, currentStep);
      const nextRotateMs = (currentStep + 1) * stepMs;
      nextRotateAt = new Date(nextRotateMs).toISOString();
      secondsUntilRotate = Math.max(1, Math.ceil((nextRotateMs - nowMs) / 1000));
    }

    return {
      id: session.id,
      activity_id: session.activity_id,
      mode: session.mode,
      rotate_seconds: session.rotate_seconds,
      is_active: session.is_active === 1 && !isExpired,
      opened_at: session.opened_at,
      expires_at: session.expires_at,
      closed_at: session.closed_at,
      current_pin: currentPin,
      next_rotate_at: nextRotateAt,
      seconds_until_rotate: secondsUntilRotate,
      server_time: now.toISOString(),
      is_expired: isExpired
    };
  }

  private notifyNextWaiterIfSlotAvailable(activityId: number, now: Date = new Date()): void {
    const activity = this.db
      .prepare(
        `SELECT id, title, status, start_time, registration_deadline, max_participants
         FROM activities
         WHERE id = ?`
      )
      .get(activityId) as
      | Pick<
          ActivityRecord,
          'id' | 'title' | 'status' | 'start_time' | 'registration_deadline' | 'max_participants'
        >
      | undefined;

    if (!activity || activity.status !== 'APPROVED') {
      return;
    }

    const nowMs = now.getTime();
    if (
      nowMs >= new Date(activity.start_time).getTime() ||
      nowMs >= new Date(activity.registration_deadline).getTime()
    ) {
      return;
    }

    if (this.getApprovedSlotCount(activityId) >= activity.max_participants) {
      return;
    }

    const nextWaiter = this.db
      .prepare(
        `SELECT * FROM activity_waitlists
         WHERE activity_id = ? AND status = 'WAITING'
         ORDER BY created_at ASC, id ASC
         LIMIT 1`
      )
      .get(activityId) as unknown as ActivityWaitlistRecord | undefined;

    if (!nextWaiter) {
      return;
    }

    const nowIso = now.toISOString();
    this.db
      .prepare(
        `UPDATE activity_waitlists
         SET status = 'NOTIFIED', notified_at = ?, updated_at = ?
         WHERE id = ?`
      )
      .run(nowIso, nowIso, nextWaiter.id);

    this.db
      .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
      .run(
        nextWaiter.student_id,
        'Hoạt động trong danh sách chờ đã có chỗ trống!',
        `Hoạt động "${activity.title}" vừa có 1 chỗ trống do có sinh viên hủy đăng ký. Bạn đang đứng đầu hàng chờ, hãy vào đăng ký tham gia ngay!`,
        'SUCCESS'
      );
  }

  private markWaitlistPromoted(activityId: number, studentId: number, now: Date): void {
    this.db
      .prepare(
        `UPDATE activity_waitlists
         SET status = 'PROMOTED', updated_at = ?
         WHERE activity_id = ? AND student_id = ? AND status IN ('WAITING', 'NOTIFIED')`
      )
      .run(now.toISOString(), activityId, studentId);
  }

  private getApprovedSlotCount(activityId: number): number {
    const row = this.db
      .prepare(
        `SELECT COUNT(*) AS cnt
         FROM registrations
         WHERE activity_id = ? AND status IN ('APPROVED', 'CANCEL_REQUESTED')`
      )
      .get(activityId) as { cnt: number };
    return Number(row.cnt || 0);
  }

  /**
   * Kiểm tra xem sinh viên có bị trùng giờ với hoạt động nào đang chờ duyệt hoặc đã duyệt không.
   */
  public checkScheduleConflicts(studentId: number, targetActivity: ActivityRecord) {
    const existing = this.db
      .prepare(
        `SELECT a.id, a.title, a.start_time, a.end_time, r.status
         FROM registrations r
         JOIN activities a ON a.id = r.activity_id
         WHERE r.student_id = ?
           AND r.status IN ('PENDING', 'APPROVED', 'CANCEL_REQUESTED')
           AND a.id != ?
           AND a.status = 'APPROVED'`
      )
      .all(studentId, targetActivity.id) as Array<{
      id: number;
      title: string;
      start_time: string;
      end_time: string;
      status: string;
    }>;

    return existing.filter((item) =>
      hasTimeOverlap(targetActivity.start_time, targetActivity.end_time, item.start_time, item.end_time)
    );
  }

  /**
   * Sinh viên đăng ký hoạt động (mặc định trạng thái PENDING - phải chờ Quản lý duyệt).
   */
  public registerActivity(
    studentId: number,
    activityId: number,
    noteToManager = '',
    now: Date = new Date()
  ) {
    const activity = this.db
      .prepare('SELECT * FROM activities WHERE id = ?')
      .get(activityId) as unknown as ActivityRecord | undefined;

    if (!activity) {
      throw new AppError('Không tìm thấy hoạt động.', 404);
    }
    if (activity.status !== 'APPROVED') {
      throw new AppError('Hoạt động này hiện chưa được mở đăng ký.', 400);
    }

    const nowMs = now.getTime();
    if (nowMs >= new Date(activity.start_time).getTime()) {
      throw new AppError('Hoạt động đã bắt đầu hoặc kết thúc, không thể đăng ký.', 400);
    }
    if (nowMs >= new Date(activity.registration_deadline).getTime()) {
      throw new AppError('Đã quá hạn đăng ký tham gia hoạt động này.', 400);
    }

    const approvedCount = this.getApprovedSlotCount(activityId);
    if (approvedCount >= activity.max_participants) {
      throw new AppError('Hoạt động này đã đủ số lượng sinh viên được duyệt.', 400);
    }

    const existingReg = this.db
      .prepare('SELECT * FROM registrations WHERE activity_id = ? AND student_id = ?')
      .get(activityId, studentId) as unknown as RegistrationRecord | undefined;

    if (existingReg) {
      if (['PENDING', 'APPROVED', 'CANCEL_REQUESTED'].includes(existingReg.status)) {
        throw new AppError('Bạn đã đăng ký hoạt động này rồi.', 409);
      }

      // Nếu trước đó đã rút đơn / hủy / bị từ chối thì cho phép đăng ký lại với trạng thái PENDING
      this.db
        .prepare(
          `UPDATE registrations
           SET status = 'PENDING',
               note_to_manager = ?,
               cancel_reason = NULL,
               reject_reason = NULL,
               registered_at = datetime('now'),
               updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(noteToManager.trim() || null, existingReg.id);

      const updated = this.db
        .prepare('SELECT * FROM registrations WHERE id = ?')
        .get(existingReg.id) as unknown as RegistrationRecord;

      this.notifyManagerNewRegistration(activity, studentId);
      this.markWaitlistPromoted(activityId, studentId, now);
      const conflicts = this.checkScheduleConflicts(studentId, activity);
      return { registration: updated, scheduleConflicts: conflicts };
    }

    const res = this.db
      .prepare(
        `INSERT INTO registrations (activity_id, student_id, note_to_manager, status)
         VALUES (?, ?, ?, 'PENDING')`
      )
      .run(activityId, studentId, noteToManager.trim() || null);

    const created = this.db
      .prepare('SELECT * FROM registrations WHERE id = ?')
      .get(Number(res.lastInsertRowid)) as unknown as RegistrationRecord;

    this.notifyManagerNewRegistration(activity, studentId);
    this.markWaitlistPromoted(activityId, studentId, now);

    const conflicts = this.checkScheduleConflicts(studentId, activity);
    return {
      registration: created,
      scheduleConflicts: conflicts
    };
  }

  /**
   * Sinh viên đăng ký vào danh sách chờ FIFO khi hoạt động đã đủ số lượng duyệt tối đa.
   */
  public joinWaitlist(
    studentId: number,
    activityId: number,
    noteToManager = '',
    now: Date = new Date()
  ) {
    const activity = this.db
      .prepare('SELECT * FROM activities WHERE id = ?')
      .get(activityId) as unknown as ActivityRecord | undefined;

    if (!activity) {
      throw new AppError('Không tìm thấy hoạt động.', 404);
    }
    if (activity.status !== 'APPROVED') {
      throw new AppError('Hoạt động này hiện chưa được mở.', 400);
    }

    const nowMs = now.getTime();
    if (nowMs >= new Date(activity.start_time).getTime()) {
      throw new AppError('Hoạt động đã bắt đầu hoặc kết thúc, không thể vào danh sách chờ.', 400);
    }
    if (nowMs >= new Date(activity.registration_deadline).getTime()) {
      throw new AppError('Đã quá hạn đăng ký tham gia hoạt động này.', 400);
    }

    const approvedCount = this.getApprovedSlotCount(activityId);
    if (approvedCount < activity.max_participants) {
      throw new AppError('Hoạt động vẫn còn chỗ trống, bạn có thể đăng ký tham gia trực tiếp.', 400);
    }

    const existingReg = this.db
      .prepare('SELECT status FROM registrations WHERE activity_id = ? AND student_id = ?')
      .get(activityId, studentId) as { status: string } | undefined;

    if (existingReg && ['PENDING', 'APPROVED', 'CANCEL_REQUESTED'].includes(existingReg.status)) {
      throw new AppError('Bạn đã đăng ký hoạt động này rồi.', 409);
    }

    const existingWait = this.db
      .prepare('SELECT * FROM activity_waitlists WHERE activity_id = ? AND student_id = ?')
      .get(activityId, studentId) as unknown as ActivityWaitlistRecord | undefined;

    const nowIso = now.toISOString();
    const trimmedNote = noteToManager.trim() || null;
    let waitlistId: number;

    if (existingWait) {
      if (existingWait.status === 'WAITING' || existingWait.status === 'NOTIFIED') {
        throw new AppError('Bạn đã có tên trong danh sách chờ của hoạt động này.', 409);
      }

      this.db
        .prepare(
          `UPDATE activity_waitlists
           SET status = 'WAITING',
               note_to_manager = ?,
               notified_at = NULL,
               created_at = ?,
               updated_at = ?
           WHERE id = ?`
        )
        .run(trimmedNote, nowIso, nowIso, existingWait.id);
      waitlistId = existingWait.id;
    } else {
      const insertRes = this.db
        .prepare(
          `INSERT INTO activity_waitlists (activity_id, student_id, note_to_manager, status, created_at, updated_at)
           VALUES (?, ?, ?, 'WAITING', ?, ?)`
        )
        .run(activityId, studentId, trimmedNote, nowIso, nowIso);
      waitlistId = Number(insertRes.lastInsertRowid);
    }

    const waitlist = this.db
      .prepare('SELECT * FROM activity_waitlists WHERE id = ?')
      .get(waitlistId) as unknown as ActivityWaitlistRecord;

    const posRow = this.db
      .prepare(
        `SELECT COUNT(*) AS pos
         FROM activity_waitlists
         WHERE activity_id = ?
           AND status = 'WAITING'
           AND (created_at < ? OR (created_at = ? AND id <= ?))`
      )
      .get(activityId, waitlist.created_at, waitlist.created_at, waitlist.id) as { pos: number };

    const queuePosition = Number(posRow.pos || 1);

    return {
      waitlist,
      queuePosition,
      message: `Đã đăng ký danh sách chờ thành công (Vị trí #${queuePosition}). Hệ thống sẽ tự động gửi thông báo khi có chỗ trống.`
    };
  }

  /**
   * Sinh viên rời khỏi danh sách chờ của một hoạt động.
   * Nếu người rời đi đang ở trạng thái NOTIFIED (vừa được nhường chỗ), tự động chuyển lượt cho người kế tiếp.
   */
  public leaveWaitlist(studentId: number, activityId: number, now: Date = new Date()): { message: string } {
    const existing = this.db
      .prepare(
        `SELECT id, status FROM activity_waitlists
         WHERE activity_id = ? AND student_id = ? AND status IN ('WAITING', 'NOTIFIED')`
      )
      .get(activityId, studentId) as { id: number; status: string } | undefined;

    if (!existing) {
      throw new AppError('Bạn không có trong danh sách chờ của hoạt động này.', 404);
    }

    this.db
      .prepare(
        `UPDATE activity_waitlists
         SET status = 'CANCELLED', updated_at = ?
         WHERE id = ?`
      )
      .run(now.toISOString(), existing.id);

    if (existing.status === 'NOTIFIED') {
      this.notifyNextWaiterIfSlotAvailable(activityId, now);
    }

    return { message: 'Đã rời khỏi danh sách chờ thành công.' };
  }

  /**
   * Lấy danh sách hoạt động sinh viên đang chờ chỗ (WAITING | NOTIFIED) kèm vị trí FIFO.
   */
  public getStudentWaitlists(studentId: number) {
    const rows = this.db
      .prepare(
        `SELECT
          w.id AS waitlist_id,
          w.activity_id,
          w.note_to_manager,
          w.status AS waitlist_status,
          w.notified_at,
          w.created_at,
          a.title,
          a.location,
          a.cover_image,
          a.start_time,
          a.end_time,
          a.registration_deadline,
          a.training_points,
          a.max_participants,
          a.status AS activity_status,
          u.full_name AS manager_name,
          u.phone AS manager_phone,
          (
            SELECT COUNT(*) FROM registrations r
            WHERE r.activity_id = a.id AND r.status IN ('APPROVED', 'CANCEL_REQUESTED')
          ) AS approved_count,
          (
            SELECT COUNT(*) FROM activity_waitlists w3
            WHERE w3.activity_id = a.id AND w3.status IN ('WAITING', 'NOTIFIED')
          ) AS waitlist_count,
          CASE
            WHEN w.status = 'NOTIFIED' THEN 1
            ELSE (
              SELECT COUNT(*) FROM activity_waitlists w2
              WHERE w2.activity_id = w.activity_id
                AND w2.status = 'WAITING'
                AND (w2.created_at < w.created_at OR (w2.created_at = w.created_at AND w2.id <= w.id))
            )
          END AS queue_position
        FROM activity_waitlists w
        JOIN activities a ON a.id = w.activity_id
        JOIN users u ON u.id = a.manager_id
        WHERE w.student_id = ?
          AND w.status IN ('WAITING', 'NOTIFIED')
        ORDER BY w.created_at ASC, w.id ASC`
      )
      .all(studentId) as Array<Record<string, unknown>>;

    return rows.map((row) => {
      const approvedCount = Number(row.approved_count || 0);
      const maxP = Number(row.max_participants || 0);
      return {
        ...row,
        approved_count: approvedCount,
        available_slots: Math.max(0, maxP - approvedCount),
        waitlist_count: Number(row.waitlist_count || 0),
        queue_position: Number(row.queue_position || 1)
      };
    });
  }

  /**
   * Lấy Thời khóa biểu của sinh viên: gồm hoạt động đã đăng ký + SĐT Quản lý hoạt động ngay bên cạnh
   * + trạng thái điểm danh có mặt (PIN/QR/Thủ công).
   */
  public getStudentSchedule(studentId: number, now: Date = new Date()) {
    const nowIso = now.toISOString();
    return this.db
      .prepare(
        `SELECT
          r.id AS registration_id,
          r.status AS registration_status,
          r.note_to_manager,
          r.cancel_reason,
          r.reject_reason,
          r.registered_at,
          a.id AS activity_id,
          a.title,
          a.description,
          a.cover_image,
          a.location,
          a.start_time,
          a.end_time,
          a.training_points,
          a.max_participants,
          a.status AS activity_status,
          u.full_name AS manager_name,
          u.phone AS manager_phone,
          ar.checked_in_at AS checked_in_at,
          ar.method AS checkin_method,
          EXISTS(
            SELECT 1 FROM attendance_sessions s
            WHERE s.activity_id = a.id AND s.is_active = 1 AND s.expires_at > ?
          ) AS has_active_checkin_session
        FROM registrations r
        JOIN activities a ON a.id = r.activity_id
        JOIN users u ON u.id = a.manager_id
        LEFT JOIN attendance_records ar ON ar.registration_id = r.id
        WHERE r.student_id = ?
        ORDER BY a.start_time ASC`
      )
      .all(nowIso, studentId);
  }

  /**
   * Sinh viên bấm Hủy đăng ký trên Thời khóa biểu:
   * - Nếu đơn đang ở trạng thái PENDING (chưa được Quản lý duyệt) -> RÚT ĐƠN NGAY LẬP TỨC (CANCELLED).
   * - Nếu đơn đã ở trạng thái APPROVED -> chuyển sang CANCEL_REQUESTED (Chờ Quản lý hoạt động đồng ý).
   */
  public studentCancelRegistration(
    studentId: number,
    registrationId: number,
    reason = '',
    now: Date = new Date()
  ) {
    const reg = this.db
      .prepare(
        `SELECT r.*, a.title AS activity_title, a.manager_id, a.status AS activity_status, a.start_time, a.end_time
         FROM registrations r
         JOIN activities a ON a.id = r.activity_id
         WHERE r.id = ? AND r.student_id = ?`
      )
      .get(registrationId, studentId) as
      | (RegistrationRecord & {
          activity_title: string;
          manager_id: number;
          activity_status: string;
          start_time: string;
          end_time: string;
        })
      | undefined;

    if (!reg) {
      throw new AppError('Không tìm thấy đăng ký hoạt động.', 404);
    }
    if (reg.activity_status === 'CANCELLED') {
      throw new AppError('Hoạt động này đã bị hủy bởi ban tổ chức.', 400);
    }
    if (now.getTime() >= new Date(reg.end_time).getTime()) {
      throw new AppError('Hoạt động đã kết thúc, không thể hủy đăng ký.', 400);
    }

    if (reg.status === 'PENDING') {
      this.db
        .prepare(
          `UPDATE registrations
           SET status = 'CANCELLED', cancel_reason = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(reason.trim() || 'Sinh viên tự rút đơn khi đang chờ duyệt', registrationId);

      const updated = this.db
        .prepare('SELECT * FROM registrations WHERE id = ?')
        .get(registrationId) as unknown as RegistrationRecord;

      return {
        mode: 'IMMEDIATE_WITHDRAW' as const,
        message: 'Đã rút đơn đăng ký thành công vì đơn chưa được Quản lý duyệt.',
        registration: updated
      };
    }

    if (reg.status === 'APPROVED') {
      const startMs = new Date(reg.start_time).getTime();
      if (now.getTime() >= startMs) {
        throw new AppError('Hoạt động đã bắt đầu diễn ra, không thể gửi yêu cầu hủy đăng ký.', 400);
      }
      const cutoffHours = this.getCancelCutoffHours();
      const msUntilStart = startMs - now.getTime();
      if (msUntilStart < cutoffHours * 60 * 60 * 1000) {
        throw new AppError(
          `Không cho phép gửi yêu cầu hủy đăng ký khi cách giờ bắt đầu dưới ${cutoffHours} tiếng. Vui lòng liên hệ trực tiếp Quản lý qua số điện thoại.`,
          400
        );
      }
      if (!reason || !reason.trim()) {
        throw new AppError('Vui lòng nhập lý do hủy để gửi Quản lý hoạt động xem xét đồng ý.', 400);
      }

      this.db
        .prepare(
          `UPDATE registrations
           SET status = 'CANCEL_REQUESTED', cancel_reason = ?, updated_at = datetime('now')
           WHERE id = ?`
        )
        .run(reason.trim(), registrationId);

      const student = this.db
        .prepare('SELECT full_name, student_code FROM users WHERE id = ?')
        .get(studentId) as { full_name: string; student_code: string };

      this.db
        .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
        .run(
          reg.manager_id,
          'Sinh viên xin hủy đăng ký hoạt động',
          `${student.full_name} (${student.student_code}) xin hủy tham gia "${reg.activity_title}". Lý do: ${reason.trim()}`,
          'WARNING'
        );

      const updated = this.db
        .prepare('SELECT * FROM registrations WHERE id = ?')
        .get(registrationId) as unknown as RegistrationRecord;

      return {
        mode: 'PENDING_MANAGER_APPROVAL' as const,
        message: 'Đã gửi yêu cầu hủy đăng ký. Vui lòng chờ Quản lý hoạt động đồng ý (hoặc gọi SĐT quản lý để trao đổi).',
        registration: updated
      };
    }

    throw new AppError('Trạng thái đăng ký hiện tại không thể thực hiện hủy.', 400);
  }

  /**
   * Quản lý duyệt hoặc từ chối đơn đăng ký mới (PENDING -> APPROVED | REJECTED).
   */
  public reviewRegistration(
    managerId: number,
    registrationId: number,
    decision: 'APPROVE' | 'REJECT',
    rejectReason = ''
  ): RegistrationRecord {
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      throw new AppError('Quyết định duyệt không hợp lệ.', 400);
    }

    const reg = this.db
      .prepare(
        `SELECT r.*, a.manager_id, a.max_participants, a.title AS activity_title, a.status AS activity_status
         FROM registrations r
         JOIN activities a ON a.id = r.activity_id
         WHERE r.id = ?`
      )
      .get(registrationId) as
      | (RegistrationRecord & {
          manager_id: number;
          max_participants: number;
          activity_title: string;
          activity_status: string;
        })
      | undefined;

    if (!reg || reg.manager_id !== managerId) {
      throw new AppError('Không tìm thấy đơn đăng ký thuộc hoạt động bạn quản lý.', 404);
    }
    if (reg.activity_status !== 'APPROVED') {
      throw new AppError('Không thể duyệt đơn vì hoạt động này không còn ở trạng thái đã duyệt.', 400);
    }
    if (reg.status !== 'PENDING') {
      throw new AppError('Đơn đăng ký này không còn ở trạng thái chờ duyệt.', 400);
    }

    if (decision === 'APPROVE') {
      const currentApproved = this.getApprovedSlotCount(reg.activity_id);
      if (currentApproved >= reg.max_participants) {
        throw new AppError('Hoạt động đã đủ số lượng sinh viên tối đa, không thể duyệt thêm.', 400);
      }

      this.db
        .prepare("UPDATE registrations SET status = 'APPROVED', updated_at = datetime('now') WHERE id = ?")
        .run(registrationId);

      this.db
        .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
        .run(
          reg.student_id,
          'Đăng ký hoạt động được duyệt',
          `Quản lý đã duyệt bạn tham gia hoạt động "${reg.activity_title}". Hoạt động đã được thêm vào Thời khóa biểu của bạn.`,
          'SUCCESS'
        );
    } else {
      const reason = rejectReason.trim() || 'Không đạt yêu cầu hoặc đã đủ nhân sự.';
      this.db
        .prepare(
          "UPDATE registrations SET status = 'REJECTED', reject_reason = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .run(reason, registrationId);

      this.db
        .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
        .run(
          reg.student_id,
          'Đăng ký hoạt động bị từ chối',
          `Đơn đăng ký "${reg.activity_title}" không được duyệt. Lý do: ${reason}`,
          'ERROR'
        );
    }

    return this.db
      .prepare('SELECT * FROM registrations WHERE id = ?')
      .get(registrationId) as unknown as RegistrationRecord;
  }

  /**
   * Quản lý duyệt hoặc từ chối yêu cầu xin hủy của sinh viên (CANCEL_REQUESTED -> CANCELLED | APPROVED).
   */
  public reviewCancelRequest(
    managerId: number,
    registrationId: number,
    decision: 'APPROVE' | 'REJECT',
    note = '',
    now: Date = new Date()
  ): RegistrationRecord {
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      throw new AppError('Quyết định duyệt không hợp lệ.', 400);
    }

    const reg = this.db
      .prepare(
        `SELECT r.*, a.manager_id, a.title AS activity_title, a.start_time, a.max_participants, a.status AS activity_status
         FROM registrations r
         JOIN activities a ON a.id = r.activity_id
         WHERE r.id = ?`
      )
      .get(registrationId) as
      | (RegistrationRecord & {
          manager_id: number;
          activity_title: string;
          start_time: string;
          max_participants: number;
          activity_status: string;
        })
      | undefined;

    if (!reg || reg.manager_id !== managerId) {
      throw new AppError('Không tìm thấy yêu cầu hủy thuộc hoạt động bạn quản lý.', 404);
    }
    if (reg.status !== 'CANCEL_REQUESTED') {
      throw new AppError('Đơn này không ở trạng thái chờ duyệt hủy.', 400);
    }

    if (decision === 'APPROVE') {
      this.db
        .prepare("UPDATE registrations SET status = 'CANCELLED', updated_at = datetime('now') WHERE id = ?")
        .run(registrationId);

      this.db
        .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
        .run(
          reg.student_id,
          'Yêu cầu hủy đăng ký được đồng ý',
          `Quản lý đã đồng ý cho bạn hủy tham gia "${reg.activity_title}".`,
          'INFO'
        );

      // Nếu trả lại chỗ trống khi hoạt động còn mở & chưa diễn ra -> thông báo FIFO cho người đứng đầu danh sách chờ
      this.notifyNextWaiterIfSlotAvailable(reg.activity_id, now);
    } else {
      const reason = note.trim() || 'Quản lý không đồng ý hủy do đã chốt danh sách.';
      this.db
        .prepare(
          "UPDATE registrations SET status = 'APPROVED', reject_reason = ?, updated_at = datetime('now') WHERE id = ?"
        )
        .run(reason, registrationId);

      this.db
        .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
        .run(
          reg.student_id,
          'Yêu cầu hủy đăng ký bị từ chối',
          `Quản lý không đồng ý hủy tham gia "${reg.activity_title}". Lý do: ${reason}`,
          'WARNING'
        );
    }

    return this.db
      .prepare('SELECT * FROM registrations WHERE id = ?')
      .get(registrationId) as unknown as RegistrationRecord;
  }

  /**
   * QUY TẮC 2 NGÀY (48H) ĐỐI VỚI SINH VIÊN:
   * Chỉ trả về các hoạt động đã diễn ra xong (end_time <= now) mà sinh viên ĐÃ ĐƯỢC DUYỆT tham gia,
   * VÀ vẫn còn nằm trong 48 giờ (2 ngày) kể từ lúc kết thúc. Hết 48h tự động biến mất!
   */
  public getEndedActivitiesForStudent(studentId: number, now: Date = new Date()) {
    const windowHours = this.getProofWindowHours();
    const requireCheckIn = this.isCheckInRequiredForProof();

    const rows = this.db
      .prepare(
        `SELECT
          r.id AS registration_id,
          a.id AS activity_id,
          a.title,
          a.location,
          a.cover_image,
          a.start_time,
          a.end_time,
          a.training_points,
          u.full_name AS manager_name,
          u.phone AS manager_phone,
          ar.checked_in_at AS checked_in_at,
          ar.method AS checkin_method,
          ps.id AS proof_id,
          ps.image_url AS proof_image_url,
          ps.description AS proof_description,
          ps.status AS proof_status,
          ps.reject_reason AS proof_reject_reason,
          ps.submitted_at AS proof_submitted_at
        FROM registrations r
        JOIN activities a ON a.id = r.activity_id
        JOIN users u ON u.id = a.manager_id
        LEFT JOIN attendance_records ar ON ar.registration_id = r.id
        LEFT JOIN proof_submissions ps ON ps.registration_id = r.id
        WHERE r.student_id = ?
          AND r.status = 'APPROVED'
          AND a.status = 'APPROVED'
        ORDER BY a.end_time DESC`
      )
      .all(studentId) as Array<Record<string, unknown>>;

    return rows
      .map((row) => {
        const win = isWithinProofWindow(String(row.end_time), now, windowHours);
        const isCheckedIn = Boolean(row.checked_in_at);
        return {
          ...row,
          is_checked_in: isCheckedIn,
          can_submit_proof: !requireCheckIn || isCheckedIn,
          remaining_ms: win.remainingMs,
          expires_at: win.expiresAt,
          _withinWindow: win.withinWindow
        };
      })
      .filter((item) => item._withinWindow)
      .map(({ _withinWindow, ...rest }) => rest);
  }

  /**
   * Sinh viên gửi ảnh minh chứng cho hoạt động đã kết thúc trong vòng 2 ngày (48h).
   */
  public submitProof(
    studentId: number,
    registrationId: number,
    imageUrl: string,
    description = '',
    now: Date = new Date()
  ) {
    if (!imageUrl || !imageUrl.trim()) {
      throw new AppError('Vui lòng tải lên hoặc chọn ảnh minh chứng.', 400);
    }

    const reg = this.db
      .prepare(
        `SELECT r.*, a.end_time, a.title AS activity_title, a.manager_id, a.status AS activity_status
         FROM registrations r
         JOIN activities a ON a.id = r.activity_id
         WHERE r.id = ? AND r.student_id = ?`
      )
      .get(registrationId, studentId) as
      | (RegistrationRecord & {
          end_time: string;
          activity_title: string;
          manager_id: number;
          activity_status: string;
        })
      | undefined;

    if (!reg) {
      throw new AppError('Không tìm thấy lượt đăng ký hợp lệ.', 404);
    }
    if (reg.status !== 'APPROVED' || reg.activity_status !== 'APPROVED') {
      throw new AppError('Bạn chỉ có thể nộp minh chứng cho hoạt động đã được duyệt tham gia.', 400);
    }

    const windowHours = this.getProofWindowHours();
    const win = isWithinProofWindow(reg.end_time, now, windowHours);
    if (!win.ended) {
      throw new AppError('Hoạt động chưa kết thúc, chưa thể nộp ảnh minh chứng.', 400);
    }
    if (!win.withinWindow) {
      throw new AppError(`Đã quá thời hạn ${windowHours} giờ kể từ lúc hoạt động kết thúc.`, 400);
    }

    if (this.isCheckInRequiredForProof()) {
      const checkedIn = this.db
        .prepare('SELECT id FROM attendance_records WHERE registration_id = ?')
        .get(registrationId);
      if (!checkedIn) {
        throw new AppError(
          'Bạn chưa điểm danh có mặt tại sự kiện (PIN/QR) nên chưa được mở khóa quyền nộp ảnh minh chứng. Vui lòng liên hệ Quản lý nếu có sự cố.',
          403
        );
      }
    }

    const existingProof = this.db
      .prepare('SELECT * FROM proof_submissions WHERE registration_id = ?')
      .get(registrationId) as Record<string, unknown> | undefined;

    if (existingProof) {
      if (existingProof.status === 'CONFIRMED') {
        throw new AppError('Minh chứng này đã được Quản lý xác nhận và cộng điểm.', 400);
      }

      this.db
        .prepare(
          `UPDATE proof_submissions
           SET image_url = ?, description = ?, status = 'SUBMITTED', reject_reason = NULL, submitted_at = datetime('now'), reviewed_at = NULL
           WHERE registration_id = ?`
        )
        .run(imageUrl.trim(), description.trim() || null, registrationId);
    } else {
      this.db
        .prepare(
          `INSERT INTO proof_submissions (registration_id, image_url, description, status)
           VALUES (?, ?, ?, 'SUBMITTED')`
        )
        .run(registrationId, imageUrl.trim(), description.trim() || null);
    }

    this.db
      .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
      .run(
        reg.manager_id,
        'Có ảnh minh chứng mới cần xác nhận',
        `Sinh viên vừa nộp ảnh minh chứng cho hoạt động "${reg.activity_title}".`,
        'INFO'
      );

    return this.db
      .prepare('SELECT * FROM proof_submissions WHERE registration_id = ?')
      .get(registrationId);
  }

  /**
   * Quản lý xem danh sách các hoạt động đã kết thúc kèm sinh viên & ảnh minh chứng (email SV vẫn bị ẩn).
   */
  public getEndedActivitiesForManager(managerId: number, now: Date = new Date()) {
    const nowIso = now.toISOString();
    const activities = this.db
      .prepare(
        `SELECT * FROM activities
         WHERE manager_id = ? AND status = 'APPROVED' AND end_time <= ?
         ORDER BY end_time DESC`
      )
      .all(managerId, nowIso) as unknown as ActivityRecord[];

    return activities.map((activity) => {
      const participantsRaw = this.db
        .prepare(
          `SELECT
            r.id AS registration_id,
            r.note_to_manager,
            u.id AS student_id,
            u.email,
            u.full_name,
            u.student_code,
            u.phone,
            u.dob,
            u.avatar_url,
            ps.id AS proof_id,
            ps.image_url AS proof_image_url,
            ps.description AS proof_description,
            ps.status AS proof_status,
            ps.reject_reason AS proof_reject_reason,
            ps.submitted_at AS proof_submitted_at,
            ps.reviewed_at AS proof_reviewed_at,
            ar.checked_in_at AS checked_in_at,
            ar.method AS checkin_method
          FROM registrations r
          JOIN users u ON u.id = r.student_id
          LEFT JOIN proof_submissions ps ON ps.registration_id = r.id
          LEFT JOIN attendance_records ar ON ar.registration_id = r.id
          WHERE r.activity_id = ? AND r.status = 'APPROVED'
          ORDER BY CASE WHEN ps.status = 'SUBMITTED' THEN 0 WHEN ps.id IS NOT NULL THEN 1 ELSE 2 END, u.full_name ASC`
        )
        .all(activity.id) as Array<Record<string, unknown>>;

      const participants = participantsRaw.map((p) => sanitizeStudentForManager(p));
      return {
        ...activity,
        participants
      };
    });
  }

  /**
   * Quản lý xác nhận hoặc từ chối minh chứng của sinh viên.
   * Khi XÁC NHẬN: cộng số điểm rèn luyện của hoạt động vào lịch sử tích điểm của sinh viên (chống cộng trùng!).
   */
  public reviewProofSubmission(
    managerId: number,
    proofId: number,
    decision: 'CONFIRM' | 'REJECT',
    rejectReason = ''
  ) {
    if (decision !== 'CONFIRM' && decision !== 'REJECT') {
      throw new AppError('Quyết định duyệt minh chứng không hợp lệ.', 400);
    }

    const row = this.db
      .prepare(
        `SELECT
          ps.*,
          r.student_id,
          r.activity_id,
          a.manager_id,
          a.title AS activity_title,
          a.training_points,
          a.end_time
        FROM proof_submissions ps
        JOIN registrations r ON r.id = ps.registration_id
        JOIN activities a ON a.id = r.activity_id
        WHERE ps.id = ?`
      )
      .get(proofId) as Record<string, unknown> | undefined;

    if (!row || Number(row.manager_id) !== managerId) {
      throw new AppError('Không tìm thấy minh chứng thuộc hoạt động bạn quản lý.', 404);
    }

    const registrationId = Number(row.registration_id);
    const studentId = Number(row.student_id);
    const activityId = Number(row.activity_id);
    const points = Number(row.training_points);
    const activityTitle = String(row.activity_title);

    if (decision === 'CONFIRM') {
      if (row.status === 'CONFIRMED') {
        throw new AppError('Minh chứng này đã được xác nhận và cộng điểm trước đó.', 409);
      }

      const existingPoint = this.db
        .prepare('SELECT id FROM point_histories WHERE registration_id = ?')
        .get(registrationId);
      if (existingPoint) {
        throw new AppError('Sinh viên đã được cộng điểm cho lượt tham gia này rồi.', 409);
      }

      const semester = resolveSemester(String(row.end_time));

      this.db.exec('BEGIN');
      try {
        this.db
          .prepare(
            "UPDATE proof_submissions SET status = 'CONFIRMED', reject_reason = NULL, reviewed_at = datetime('now') WHERE id = ?"
          )
          .run(proofId);

        this.db
          .prepare(
            `INSERT INTO point_histories (student_id, activity_id, registration_id, points, semester)
             VALUES (?, ?, ?, ?, ?)`
          )
          .run(studentId, activityId, registrationId, points, semester);

        this.db
          .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
          .run(
            studentId,
            `Đã cộng +${points} điểm rèn luyện`,
            `Quản lý đã xác nhận minh chứng hoạt động "${activityTitle}". Bạn nhận được +${points} điểm rèn luyện.`,
            'SUCCESS'
          );

        this.db.exec('COMMIT');
      } catch (err) {
        this.db.exec('ROLLBACK');
        throw err;
      }
    } else {
      if (row.status === 'CONFIRMED') {
        throw new AppError('Không thể từ chối minh chứng đã xác nhận cộng điểm.', 400);
      }
      const reason = rejectReason.trim() || 'Ảnh minh chứng chưa rõ ràng hoặc chưa đúng nội dung.';
      this.db
        .prepare(
          "UPDATE proof_submissions SET status = 'REJECTED', reject_reason = ?, reviewed_at = datetime('now') WHERE id = ?"
        )
        .run(reason, proofId);

      const windowHours = this.getProofWindowHours();
      this.db
        .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
        .run(
          studentId,
          'Ảnh minh chứng bị từ chối',
          `Minh chứng cho "${activityTitle}" bị từ chối: ${reason}. Nếu còn trong ${windowHours}h sau khi kết thúc, bạn có thể nộp lại.`,
          'ERROR'
        );
    }

    return this.db.prepare('SELECT * FROM proof_submissions WHERE id = ?').get(proofId);
  }

  /**
   * Xác nhận hàng loạt nhiều minh chứng đang chờ duyệt trong cùng 1 hoạt động.
   */
  public bulkConfirmProofs(managerId: number, activityId: number) {
    const pendingProofs = this.db
      .prepare(
        `SELECT ps.id
         FROM proof_submissions ps
         JOIN registrations r ON r.id = ps.registration_id
         JOIN activities a ON a.id = r.activity_id
         WHERE a.id = ? AND a.manager_id = ? AND ps.status = 'SUBMITTED'`
      )
      .all(activityId, managerId) as Array<{ id: number }>;

    let confirmedCount = 0;
    for (const p of pendingProofs) {
      this.reviewProofSubmission(managerId, p.id, 'CONFIRM');
      confirmedCount++;
    }
    return { confirmedCount };
  }

  // ======================== ĐIỂM DANH NHANH BẰNG PIN 6 SỐ / QR CODE ========================

  /**
   * Quản lý mở phiên điểm danh (chế độ STATIC theo phiên hoặc ROTATING tự xoay mỗi 60s).
   */
  public openAttendanceSession(
    managerId: number,
    activityId: number,
    options: {
      mode?: AttendanceSessionMode;
      durationMinutes?: number;
      untilEnd?: boolean;
      rotateSeconds?: number;
    } = {},
    now: Date = new Date()
  ) {
    const activity = this.db
      .prepare('SELECT * FROM activities WHERE id = ? AND manager_id = ?')
      .get(activityId, managerId) as unknown as ActivityRecord | undefined;

    if (!activity) {
      throw new AppError('Không tìm thấy hoạt động thuộc quyền quản lý của bạn.', 404);
    }
    if (activity.status !== 'APPROVED') {
      throw new AppError('Chỉ có thể mở điểm danh cho hoạt động đã được Admin duyệt.', 400);
    }

    const nowMs = now.getTime();
    const endMs = new Date(activity.end_time).getTime();
    if (nowMs >= endMs) {
      throw new AppError('Hoạt động đã kết thúc, không thể mở phiên điểm danh.', 400);
    }

    const mode = options.mode ?? 'STATIC';
    if (mode !== 'STATIC' && mode !== 'ROTATING') {
      throw new AppError('Chế độ điểm danh không hợp lệ (chỉ hỗ trợ STATIC hoặc ROTATING).', 400);
    }

    const rotateSeconds = options.rotateSeconds !== undefined ? Number(options.rotateSeconds) : 60;
    if (!Number.isInteger(rotateSeconds) || rotateSeconds < 30 || rotateSeconds > 180) {
      throw new AppError('Chu kỳ xoay mã phải là số nguyên từ 30 đến 180 giây.', 400);
    }

    let expiresMs: number;
    if (options.untilEnd === true) {
      expiresMs = endMs;
    } else {
      const durationMinutes =
        options.durationMinutes !== undefined ? Number(options.durationMinutes) : 30;
      if (!Number.isInteger(durationMinutes) || durationMinutes < 5 || durationMinutes > 720) {
        throw new AppError('Thời lượng phiên điểm danh phải là số nguyên từ 5 đến 720 phút.', 400);
      }
      expiresMs = Math.min(nowMs + durationMinutes * 60 * 1000, endMs);
    }

    const nowIso = now.toISOString();
    const expiresIso = new Date(expiresMs).toISOString();
    const secret = crypto.randomBytes(24).toString('hex');
    const pinCode = mode === 'STATIC' ? String(crypto.randomInt(100000, 1000000)) : null;

    this.db.exec('BEGIN');
    let insertedId = 0;
    try {
      this.db
        .prepare(
          `UPDATE attendance_sessions
           SET is_active = 0, closed_at = ?
           WHERE activity_id = ? AND is_active = 1`
        )
        .run(nowIso, activityId);

      const res = this.db
        .prepare(
          `INSERT INTO attendance_sessions
             (activity_id, manager_id, mode, pin_code, secret, rotate_seconds, is_active, opened_at, expires_at)
           VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)`
        )
        .run(activityId, managerId, mode, pinCode, secret, rotateSeconds, nowIso, expiresIso);

      insertedId = Number(res.lastInsertRowid);
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    const created = this.db
      .prepare('SELECT * FROM attendance_sessions WHERE id = ?')
      .get(insertedId) as unknown as AttendanceSessionRecord;

    return {
      session: this.formatSessionForManager(created, now),
      isBeforeStart: nowMs < new Date(activity.start_time).getTime()
    };
  }

  /**
   * Quản lý chủ động đổi sang mã PIN/QR mới ngay lập tức (vô hiệu hóa mã cũ).
   */
  public rotateAttendancePin(managerId: number, activityId: number, now: Date = new Date()) {
    const activity = this.db
      .prepare('SELECT id FROM activities WHERE id = ? AND manager_id = ?')
      .get(activityId, managerId) as { id: number } | undefined;

    if (!activity) {
      throw new AppError('Không tìm thấy hoạt động thuộc quyền quản lý của bạn.', 404);
    }

    const session = this.db
      .prepare(
        `SELECT * FROM attendance_sessions
         WHERE activity_id = ? AND is_active = 1
         ORDER BY id DESC LIMIT 1`
      )
      .get(activityId) as unknown as AttendanceSessionRecord | undefined;

    if (!session || now.getTime() > new Date(session.expires_at).getTime()) {
      if (session) {
        this.db
          .prepare('UPDATE attendance_sessions SET is_active = 0, closed_at = ? WHERE id = ?')
          .run(session.expires_at, session.id);
      }
      throw new AppError('Hiện không có phiên điểm danh nào đang mở.', 400);
    }

    const nowIso = now.toISOString();
    if (session.mode === 'STATIC') {
      let nextPin = String(crypto.randomInt(100000, 1000000));
      while (nextPin === session.pin_code) {
        nextPin = String(crypto.randomInt(100000, 1000000));
      }
      this.db
        .prepare('UPDATE attendance_sessions SET pin_code = ? WHERE id = ?')
        .run(nextPin, session.id);
    } else {
      const nextSecret = crypto.randomBytes(24).toString('hex');
      this.db
        .prepare('UPDATE attendance_sessions SET secret = ?, opened_at = ? WHERE id = ?')
        .run(nextSecret, nowIso, session.id);
    }

    const updated = this.db
      .prepare('SELECT * FROM attendance_sessions WHERE id = ?')
      .get(session.id) as unknown as AttendanceSessionRecord;

    return { session: this.formatSessionForManager(updated, now) };
  }

  /**
   * Quản lý đóng phiên điểm danh hiện tại.
   */
  public closeAttendanceSession(managerId: number, activityId: number, now: Date = new Date()) {
    const activity = this.db
      .prepare('SELECT id FROM activities WHERE id = ? AND manager_id = ?')
      .get(activityId, managerId) as { id: number } | undefined;

    if (!activity) {
      throw new AppError('Không tìm thấy hoạt động thuộc quyền quản lý của bạn.', 404);
    }

    this.db
      .prepare(
        `UPDATE attendance_sessions
         SET is_active = 0, closed_at = ?
         WHERE activity_id = ? AND is_active = 1`
      )
      .run(now.toISOString(), activityId);

    return { message: 'Đã đóng phiên điểm danh.' };
  }

  /**
   * Lấy trạng thái phiên điểm danh hiện tại & danh sách có mặt / vắng mặt cho Quản lý (luôn ẩn Email SV).
   */
  public getManagerAttendanceState(managerId: number, activityId: number, now: Date = new Date()) {
    const activity = this.db
      .prepare('SELECT id FROM activities WHERE id = ? AND manager_id = ?')
      .get(activityId, managerId) as { id: number } | undefined;

    if (!activity) {
      throw new AppError('Không tìm thấy hoạt động thuộc quyền quản lý của bạn.', 404);
    }

    const rawSession = this.db
      .prepare(
        `SELECT * FROM attendance_sessions
         WHERE activity_id = ? AND is_active = 1
         ORDER BY id DESC LIMIT 1`
      )
      .get(activityId) as unknown as AttendanceSessionRecord | undefined;

    let session: ReturnType<RegistrationProofService['formatSessionForManager']> | null = null;
    if (rawSession) {
      if (now.getTime() > new Date(rawSession.expires_at).getTime()) {
        this.db
          .prepare('UPDATE attendance_sessions SET is_active = 0, closed_at = ? WHERE id = ?')
          .run(rawSession.expires_at, rawSession.id);
      } else {
        session = this.formatSessionForManager(rawSession, now);
      }
    }

    const rawRows = this.db
      .prepare(
        `SELECT
          r.id AS registration_id,
          r.status AS registration_status,
          u.id AS student_id,
          u.email,
          u.full_name,
          u.student_code,
          u.phone,
          ar.id AS attendance_id,
          ar.method AS checkin_method,
          ar.checked_in_at,
          ps.status AS proof_status
        FROM registrations r
        JOIN users u ON u.id = r.student_id
        LEFT JOIN attendance_records ar ON ar.registration_id = r.id
        LEFT JOIN proof_submissions ps ON ps.registration_id = r.id
        WHERE r.activity_id = ? AND r.status IN ('APPROVED', 'CANCEL_REQUESTED')
        ORDER BY CASE WHEN ar.id IS NOT NULL THEN 0 ELSE 1 END, u.full_name ASC`
      )
      .all(activityId) as Array<Record<string, unknown>>;

    const records = rawRows.map((row) => sanitizeStudentForManager(row));
    const totalApproved = records.length;
    const checkedInCount = records.filter((r) => Boolean(r.checked_in_at)).length;

    return {
      session,
      summary: {
        totalApproved,
        checkedInCount,
        absentCount: Math.max(0, totalApproved - checkedInCount)
      },
      records,
      server_time: now.toISOString(),
      requireCheckInForProof: this.isCheckInRequiredForProof()
    };
  }

  /**
   * Sinh viên tự điểm danh bằng mã PIN 6 số hoặc quét QR Code.
   */
  public studentCheckIn(
    studentId: number,
    activityId: number,
    pinInput: string,
    method: 'PIN' | 'QR' = 'PIN',
    now: Date = new Date()
  ) {
    const pin = String(pinInput ?? '').trim();
    if (!/^\d{6}$/.test(pin)) {
      throw new AppError('Mã PIN điểm danh phải gồm đúng 6 chữ số.', 400);
    }

    const activity = this.db
      .prepare('SELECT * FROM activities WHERE id = ?')
      .get(activityId) as unknown as ActivityRecord | undefined;

    if (!activity) {
      throw new AppError('Không tìm thấy hoạt động.', 404);
    }
    if (activity.status !== 'APPROVED') {
      throw new AppError('Hoạt động này không ở trạng thái được phép điểm danh.', 400);
    }

    const reg = this.db
      .prepare('SELECT * FROM registrations WHERE activity_id = ? AND student_id = ?')
      .get(activityId, studentId) as unknown as RegistrationRecord | undefined;

    if (!reg || reg.status !== 'APPROVED') {
      throw new AppError('Bạn chưa được duyệt tham gia hoạt động này nên không thể điểm danh.', 403);
    }

    const existingAttendance = this.db
      .prepare('SELECT * FROM attendance_records WHERE registration_id = ?')
      .get(reg.id) as unknown as AttendanceRecord | undefined;

    if (existingAttendance) {
      throw new AppError('Bạn đã điểm danh có mặt cho hoạt động này rồi.', 409);
    }

    const session = this.db
      .prepare(
        `SELECT * FROM attendance_sessions
         WHERE activity_id = ? AND is_active = 1
         ORDER BY id DESC LIMIT 1`
      )
      .get(activityId) as unknown as AttendanceSessionRecord | undefined;

    if (!session) {
      throw new AppError('Quản lý hiện chưa mở điểm danh cho hoạt động này.', 400);
    }

    const nowMs = now.getTime();
    if (nowMs > new Date(session.expires_at).getTime()) {
      this.db
        .prepare('UPDATE attendance_sessions SET is_active = 0, closed_at = ? WHERE id = ?')
        .run(session.expires_at, session.id);
      throw new AppError('Phiên điểm danh đã hết thời gian hiệu lực.', 400);
    }

    let isPinValid = false;
    if (session.mode === 'STATIC') {
      isPinValid = timingSafePinEqual(pin, session.pin_code || '');
    } else {
      const stepMs = session.rotate_seconds * 1000;
      const currentStep = Math.floor(nowMs / stepMs);
      const openedStep = Math.floor(new Date(session.opened_at).getTime() / stepMs);
      const currentExpected = computeRotatingPin(session.secret, currentStep);
      if (timingSafePinEqual(pin, currentExpected)) {
        isPinValid = true;
      } else if (currentStep - 1 >= openedStep) {
        const prevExpected = computeRotatingPin(session.secret, currentStep - 1);
        isPinValid = timingSafePinEqual(pin, prevExpected);
      }
    }

    if (!isPinValid) {
      throw new AppError('Mã PIN điểm danh không chính xác hoặc đã hết hiệu lực.', 400);
    }

    const safeMethod: 'PIN' | 'QR' = method === 'QR' ? 'QR' : 'PIN';
    const checkedInAt = now.toISOString();
    const res = this.db
      .prepare(
        `INSERT INTO attendance_records (activity_id, registration_id, student_id, session_id, method, checked_in_at, checked_in_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(activityId, reg.id, studentId, session.id, safeMethod, checkedInAt, studentId);

    const windowHours = this.getProofWindowHours();
    this.db
      .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
      .run(
        studentId,
        'Điểm danh có mặt thành công',
        `Bạn đã xác nhận có mặt tại hoạt động "${activity.title}" (${safeMethod}). Quyền nộp ảnh minh chứng trong ${windowHours}h sau khi kết thúc đã được mở khóa.`,
        'SUCCESS'
      );

    const attendance = this.db
      .prepare('SELECT * FROM attendance_records WHERE id = ?')
      .get(Number(res.lastInsertRowid)) as unknown as AttendanceRecord;

    return {
      message:
        'Điểm danh có mặt thành công! Quyền nộp ảnh minh chứng sau khi hoạt động kết thúc đã được mở khóa.',
      attendance,
      activityTitle: activity.title
    };
  }

  /**
   * Quản lý điểm danh thủ công cho sinh viên (trường hợp hết pin, mất mạng tại hiện trường).
   */
  public manualCheckIn(managerId: number, registrationId: number, now: Date = new Date()) {
    const reg = this.db
      .prepare(
        `SELECT r.*, a.manager_id, a.title AS activity_title, a.status AS activity_status
         FROM registrations r
         JOIN activities a ON a.id = r.activity_id
         WHERE r.id = ?`
      )
      .get(registrationId) as
      | (RegistrationRecord & {
          manager_id: number;
          activity_title: string;
          activity_status: string;
        })
      | undefined;

    if (!reg || reg.manager_id !== managerId) {
      throw new AppError('Không tìm thấy đơn đăng ký thuộc hoạt động bạn quản lý.', 404);
    }
    if (reg.activity_status !== 'APPROVED' || reg.status !== 'APPROVED') {
      throw new AppError('Chỉ có thể điểm danh sinh viên đã được duyệt tham gia hoạt động.', 400);
    }

    const existing = this.db
      .prepare('SELECT id FROM attendance_records WHERE registration_id = ?')
      .get(registrationId);
    if (existing) {
      throw new AppError('Sinh viên này đã được điểm danh có mặt trước đó.', 409);
    }

    const res = this.db
      .prepare(
        `INSERT INTO attendance_records (activity_id, registration_id, student_id, session_id, method, checked_in_at, checked_in_by)
         VALUES (?, ?, ?, NULL, 'MANUAL', ?, ?)`
      )
      .run(reg.activity_id, registrationId, reg.student_id, now.toISOString(), managerId);

    this.db
      .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
      .run(
        reg.student_id,
        'Quản lý đã xác nhận điểm danh có mặt',
        `Quản lý đã điểm danh thủ công cho bạn tại hoạt động "${reg.activity_title}". Quyền nộp ảnh minh chứng đã được mở khóa.`,
        'SUCCESS'
      );

    const attendance = this.db
      .prepare('SELECT * FROM attendance_records WHERE id = ?')
      .get(Number(res.lastInsertRowid)) as unknown as AttendanceRecord;

    return {
      message: 'Đã điểm danh thủ công cho sinh viên thành công.',
      attendance
    };
  }

  /**
   * Quản lý hủy trạng thái điểm danh của sinh viên (chỉ khi chưa được cộng điểm rèn luyện).
   */
  public undoManualCheckIn(managerId: number, registrationId: number) {
    const reg = this.db
      .prepare(
        `SELECT r.id, a.manager_id
         FROM registrations r
         JOIN activities a ON a.id = r.activity_id
         WHERE r.id = ?`
      )
      .get(registrationId) as { id: number; manager_id: number } | undefined;

    if (!reg || reg.manager_id !== managerId) {
      throw new AppError('Không tìm thấy đơn đăng ký thuộc hoạt động bạn quản lý.', 404);
    }

    const proof = this.db
      .prepare('SELECT status FROM proof_submissions WHERE registration_id = ?')
      .get(registrationId) as { status: string } | undefined;

    if (proof && proof.status === 'CONFIRMED') {
      throw new AppError('Không thể hủy điểm danh vì minh chứng của sinh viên đã được cộng điểm.', 400);
    }

    const existing = this.db
      .prepare('SELECT id FROM attendance_records WHERE registration_id = ?')
      .get(registrationId);

    if (!existing) {
      throw new AppError('Sinh viên này hiện chưa có trạng thái điểm danh.', 404);
    }

    this.db.prepare('DELETE FROM attendance_records WHERE registration_id = ?').run(registrationId);
    return { message: 'Đã hủy trạng thái điểm danh của sinh viên.' };
  }
}
