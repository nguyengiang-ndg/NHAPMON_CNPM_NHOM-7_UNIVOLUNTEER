import type { SqliteDatabase } from '../db/database';
import { ActivityRecord, AppError } from '../types/models';
import { escapeCsvCell } from '../utils/helpers';
import { sanitizeStudentForManager } from './authUser.service';

export interface CreateActivityInput {
  title: string;
  description: string;
  coverImage: string;
  location: string;
  startTime: string;
  endTime: string;
  registrationDeadline?: string;
  maxParticipants: number;
  trainingPoints: number;
}

export interface ActivityQueryFilter {
  search?: string;
  onlyAvailable?: boolean;
  minPoints?: number;
  timeframe?: 'UPCOMING' | 'ALL';
}

export class ActivityService {
  constructor(private readonly db: SqliteDatabase) {}

  private getMaxAllowedPoints(): number {
    const row = this.db
      .prepare("SELECT value FROM system_settings WHERE key = 'MAX_TRAINING_POINTS_PER_ACTIVITY'")
      .get() as { value: string } | undefined;
    return row ? Number(row.value) || 20 : 20;
  }

  public listPublicActivities(filter: ActivityQueryFilter = {}, now: Date = new Date()) {
    const rows = this.db
      .prepare(
        `SELECT
          a.*,
          u.full_name AS manager_name,
          u.phone AS manager_phone,
          (
            SELECT COUNT(*) FROM registrations r
            WHERE r.activity_id = a.id AND r.status IN ('APPROVED', 'CANCEL_REQUESTED')
          ) AS approved_count,
          (
            SELECT COUNT(*) FROM registrations r
            WHERE r.activity_id = a.id AND r.status = 'PENDING'
          ) AS pending_count,
          (
            SELECT COUNT(*) FROM activity_waitlists w
            WHERE w.activity_id = a.id AND w.status IN ('WAITING', 'NOTIFIED')
          ) AS waitlist_count
        FROM activities a
        JOIN users u ON u.id = a.manager_id
        WHERE a.status = 'APPROVED'
        ORDER BY a.start_time ASC`
      )
      .all() as Array<Record<string, unknown>>;

    const nowMs = now.getTime();
    const searchLower = filter.search?.trim().toLowerCase() || '';
    const minPoints = filter.minPoints !== undefined ? Number(filter.minPoints) : 0;

    return rows
      .map((row) => {
        const maxP = Number(row.max_participants);
        const approvedCount = Number(row.approved_count);
        const startMs = new Date(String(row.start_time)).getTime();
        const endMs = new Date(String(row.end_time)).getTime();
        const deadlineMs = new Date(String(row.registration_deadline)).getTime();
        const availableSlots = Math.max(0, maxP - approvedCount);

        return {
          ...row,
          approved_count: approvedCount,
          pending_count: Number(row.pending_count),
          waitlist_count: Number(row.waitlist_count || 0),
          available_slots: availableSlots,
          is_ended: nowMs >= endMs,
          is_upcoming: nowMs < startMs,
          is_registration_open: nowMs < deadlineMs && nowMs < startMs && availableSlots > 0,
          is_waitlist_open: nowMs < deadlineMs && nowMs < startMs && availableSlots === 0
        };
      })
      .filter((item) => {
        if (filter.timeframe === 'UPCOMING' && item.is_ended) {
          return false;
        }
        if (filter.onlyAvailable && !item.is_registration_open) {
          return false;
        }
        if (minPoints > 0 && Number((item as Record<string, unknown>).training_points) < minPoints) {
          return false;
        }
        if (searchLower) {
          const record = item as Record<string, unknown>;
          const hay = `${record.title} ${record.location} ${record.description} ${record.manager_name}`.toLowerCase();
          if (!hay.includes(searchLower)) {
            return false;
          }
        }
        return true;
      });
  }

  public getPublicActivityDetail(activityId: number, now: Date = new Date()) {
    const row = this.db
      .prepare(
        `SELECT
          a.*,
          u.full_name AS manager_name,
          u.phone AS manager_phone,
          (
            SELECT COUNT(*) FROM registrations r
            WHERE r.activity_id = a.id AND r.status IN ('APPROVED', 'CANCEL_REQUESTED')
          ) AS approved_count,
          (
            SELECT COUNT(*) FROM registrations r
            WHERE r.activity_id = a.id AND r.status = 'PENDING'
          ) AS pending_count,
          (
            SELECT COUNT(*) FROM activity_waitlists w
            WHERE w.activity_id = a.id AND w.status IN ('WAITING', 'NOTIFIED')
          ) AS waitlist_count
        FROM activities a
        JOIN users u ON u.id = a.manager_id
        WHERE a.id = ? AND a.status = 'APPROVED'`
      )
      .get(activityId) as Record<string, unknown> | undefined;

    if (!row) {
      throw new AppError('Không tìm thấy hoạt động.', 404);
    }

    const nowMs = now.getTime();
    const maxP = Number(row.max_participants);
    const approvedCount = Number(row.approved_count);
    const startMs = new Date(String(row.start_time)).getTime();
    const endMs = new Date(String(row.end_time)).getTime();
    const deadlineMs = new Date(String(row.registration_deadline)).getTime();
    const availableSlots = Math.max(0, maxP - approvedCount);

    return {
      ...row,
      approved_count: approvedCount,
      pending_count: Number(row.pending_count),
      waitlist_count: Number(row.waitlist_count || 0),
      available_slots: availableSlots,
      is_ended: nowMs >= endMs,
      is_registration_open:
        row.status === 'APPROVED' && nowMs < deadlineMs && nowMs < startMs && availableSlots > 0,
      is_waitlist_open:
        row.status === 'APPROVED' && nowMs < deadlineMs && nowMs < startMs && availableSlots === 0
    };
  }

  public createActivity(managerId: number, input: CreateActivityInput): ActivityRecord {
    const title = input.title?.trim();
    const description = input.description?.trim();
    const coverImage = input.coverImage?.trim() || '/uploads/cover-green-sunday.svg';
    const location = input.location?.trim();
    const startTime = input.startTime;
    const endTime = input.endTime;
    const registrationDeadline = input.registrationDeadline || startTime;
    const maxParticipants = Number(input.maxParticipants);
    const trainingPoints = Number(input.trainingPoints);

    if (!title || !description || !location || !startTime || !endTime) {
      throw new AppError('Vui lòng điền đầy đủ tên, mô tả, địa điểm và thời gian hoạt động.', 400);
    }

    const startMs = new Date(startTime).getTime();
    const endMs = new Date(endTime).getTime();
    const deadlineMs = new Date(registrationDeadline).getTime();

    if (Number.isNaN(startMs) || Number.isNaN(endMs) || Number.isNaN(deadlineMs)) {
      throw new AppError('Định dạng ngày giờ không hợp lệ.', 400);
    }
    if (endMs <= startMs) {
      throw new AppError('Thời gian kết thúc phải sau thời gian bắt đầu.', 400);
    }
    if (deadlineMs > startMs) {
      throw new AppError('Hạn chót đăng ký không được sau thời gian bắt đầu hoạt động.', 400);
    }
    if (!Number.isInteger(maxParticipants) || maxParticipants <= 0) {
      throw new AppError('Số lượng sinh viên tối đa phải là số nguyên lớn hơn 0.', 400);
    }

    const maxAllowedPoints = this.getMaxAllowedPoints();
    if (Number.isNaN(trainingPoints) || trainingPoints < 0 || trainingPoints > maxAllowedPoints) {
      throw new AppError(`Điểm rèn luyện phải từ 0 đến ${maxAllowedPoints} điểm.`, 400);
    }

    const res = this.db
      .prepare(
        `INSERT INTO activities (
          manager_id, title, description, cover_image, location,
          start_time, end_time, registration_deadline,
          max_participants, training_points, status
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'PENDING_APPROVAL')`
      )
      .run(
        managerId,
        title,
        description,
        coverImage,
        location,
        new Date(startTime).toISOString(),
        new Date(endTime).toISOString(),
        new Date(registrationDeadline).toISOString(),
        maxParticipants,
        trainingPoints
      );

    const created = this.db
      .prepare('SELECT * FROM activities WHERE id = ?')
      .get(Number(res.lastInsertRowid)) as unknown as ActivityRecord;

    // Thông báo cho Admin có hoạt động mới chờ duyệt
    const admins = this.db.prepare("SELECT id FROM users WHERE role = 'ADMIN'").all() as Array<{ id: number }>;
    const insertNotif = this.db.prepare(
      'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)'
    );
    for (const admin of admins) {
      insertNotif.run(
        admin.id,
        'Hoạt động mới chờ phê duyệt',
        `Quản lý vừa đề xuất hoạt động "${title}" (${trainingPoints} điểm rèn luyện).`,
        'INFO'
      );
    }

    return created;
  }

  public updateRejectedActivity(
    managerId: number,
    activityId: number,
    input: Partial<CreateActivityInput>
  ): ActivityRecord {
    const existing = this.db
      .prepare('SELECT * FROM activities WHERE id = ? AND manager_id = ?')
      .get(activityId, managerId) as unknown as ActivityRecord | undefined;

    if (!existing) {
      throw new AppError('Không tìm thấy hoạt động thuộc quyền quản lý của bạn.', 404);
    }
    if (existing.status !== 'REJECTED' && existing.status !== 'PENDING_APPROVAL') {
      throw new AppError('Chỉ có thể chỉnh sửa hoạt động đang chờ duyệt hoặc bị từ chối.', 400);
    }

    const rawStart = input.startTime ? input.startTime : existing.start_time;
    const rawEnd = input.endTime ? input.endTime : existing.end_time;
    const rawDeadline = input.registrationDeadline
      ? input.registrationDeadline
      : existing.registration_deadline;

    const startMs = new Date(rawStart).getTime();
    const endMs = new Date(rawEnd).getTime();
    const deadlineMs = new Date(rawDeadline).getTime();

    if (Number.isNaN(startMs) || Number.isNaN(endMs) || Number.isNaN(deadlineMs)) {
      throw new AppError('Định dạng ngày giờ không hợp lệ.', 400);
    }
    if (endMs <= startMs) {
      throw new AppError('Thời gian kết thúc phải sau thời gian bắt đầu.', 400);
    }
    if (deadlineMs > startMs) {
      throw new AppError('Hạn chót đăng ký không được sau thời gian bắt đầu hoạt động.', 400);
    }

    const nextMaxParticipants =
      input.maxParticipants !== undefined ? Number(input.maxParticipants) : existing.max_participants;
    if (!Number.isInteger(nextMaxParticipants) || nextMaxParticipants <= 0) {
      throw new AppError('Số lượng sinh viên tối đa phải là số nguyên lớn hơn 0.', 400);
    }

    const nextTrainingPoints =
      input.trainingPoints !== undefined ? Number(input.trainingPoints) : existing.training_points;
    const maxAllowedPoints = this.getMaxAllowedPoints();
    if (Number.isNaN(nextTrainingPoints) || nextTrainingPoints < 0 || nextTrainingPoints > maxAllowedPoints) {
      throw new AppError(`Điểm rèn luyện phải từ 0 đến ${maxAllowedPoints} điểm.`, 400);
    }

    const startTime = new Date(startMs).toISOString();
    const endTime = new Date(endMs).toISOString();
    const deadline = new Date(deadlineMs).toISOString();

    this.db
      .prepare(
        `UPDATE activities SET
          title = ?,
          description = ?,
          cover_image = ?,
          location = ?,
          start_time = ?,
          end_time = ?,
          registration_deadline = ?,
          max_participants = ?,
          training_points = ?,
          status = 'PENDING_APPROVAL',
          reject_reason = NULL
         WHERE id = ?`
      )
      .run(
        input.title?.trim() || existing.title,
        input.description?.trim() || existing.description,
        input.coverImage?.trim() || existing.cover_image,
        input.location?.trim() || existing.location,
        startTime,
        endTime,
        deadline,
        nextMaxParticipants,
        nextTrainingPoints,
        activityId
      );

    return this.db
      .prepare('SELECT * FROM activities WHERE id = ?')
      .get(activityId) as unknown as ActivityRecord;
  }

  public requestCancelActivity(
    managerId: number,
    activityId: number,
    reason: string,
    now: Date = new Date()
  ): ActivityRecord {
    const activity = this.db
      .prepare('SELECT * FROM activities WHERE id = ? AND manager_id = ?')
      .get(activityId, managerId) as unknown as ActivityRecord | undefined;

    if (!activity) {
      throw new AppError('Không tìm thấy hoạt động thuộc quyền quản lý của bạn.', 404);
    }
    if (activity.status === 'PENDING_APPROVAL') {
      throw new AppError('Hoạt động đang chờ Admin phê duyệt, chưa thể gửi yêu cầu hủy.', 400);
    }
    if (activity.status === 'CANCELLED') {
      throw new AppError('Hoạt động này đã bị hủy trước đó.', 400);
    }
    if (activity.status === 'REJECTED') {
      throw new AppError('Hoạt động đã bị Admin từ chối trước đó, không thể gửi yêu cầu hủy.', 400);
    }
    if (activity.status === 'CANCEL_REQUESTED') {
      throw new AppError('Yêu cầu hủy hoạt động này đã được gửi và đang chờ Admin duyệt.', 400);
    }
    if (now.getTime() >= new Date(activity.end_time).getTime()) {
      throw new AppError('Hoạt động đã kết thúc, không thể gửi yêu cầu hủy.', 400);
    }
    if (!reason || !reason.trim()) {
      throw new AppError('Vui lòng nhập lý do xin hủy hoạt động gửi lên Admin.', 400);
    }

    this.db
      .prepare(
        `UPDATE activities
         SET status = 'CANCEL_REQUESTED', cancel_reason = ?
         WHERE id = ?`
      )
      .run(reason.trim(), activityId);

    const admins = this.db.prepare("SELECT id FROM users WHERE role = 'ADMIN'").all() as Array<{ id: number }>;
    const insertNotif = this.db.prepare(
      'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)'
    );
    for (const admin of admins) {
      insertNotif.run(
        admin.id,
        'Yêu cầu hủy hoạt động mới',
        `Quản lý gửi yêu cầu hủy hoạt động "${activity.title}". Lý do: ${reason.trim()}`,
        'WARNING'
      );
    }

    return this.db
      .prepare('SELECT * FROM activities WHERE id = ?')
      .get(activityId) as unknown as ActivityRecord;
  }

  public getManagerActivities(managerId: number) {
    return this.db
      .prepare(
        `SELECT
          a.*,
          (SELECT COUNT(*) FROM registrations r WHERE r.activity_id = a.id AND r.status IN ('APPROVED', 'CANCEL_REQUESTED')) AS approved_count,
          (SELECT COUNT(*) FROM registrations r WHERE r.activity_id = a.id AND r.status = 'PENDING') AS pending_count,
          (SELECT COUNT(*) FROM registrations r WHERE r.activity_id = a.id AND r.status = 'CANCEL_REQUESTED') AS cancel_requested_count,
          (SELECT COUNT(*) FROM proof_submissions ps JOIN registrations r2 ON r2.id = ps.registration_id WHERE r2.activity_id = a.id AND ps.status = 'SUBMITTED') AS proof_pending_count,
          (SELECT COUNT(*) FROM proof_submissions ps JOIN registrations r3 ON r3.id = ps.registration_id WHERE r3.activity_id = a.id AND ps.status = 'CONFIRMED') AS proof_confirmed_count,
          (SELECT COUNT(*) FROM activity_waitlists w WHERE w.activity_id = a.id AND w.status IN ('WAITING', 'NOTIFIED')) AS waitlist_count
        FROM activities a
        WHERE a.manager_id = ?
        ORDER BY a.created_at DESC`
      )
      .all(managerId);
  }

  /**
   * Trả về thông tin chi tiết hoạt động kèm danh sách sinh viên đã đăng ký & danh sách chờ FIFO.
   * QUAN TRỌNG: Lọc bỏ tuyệt đối trường `email` của sinh viên bằng `sanitizeStudentForManager`.
   */
  public getManagerActivityDetail(managerId: number, activityId: number) {
    const activity = this.db
      .prepare(
        `SELECT
          a.*,
          (SELECT COUNT(*) FROM registrations r WHERE r.activity_id = a.id AND r.status IN ('APPROVED', 'CANCEL_REQUESTED')) AS approved_count,
          (SELECT COUNT(*) FROM registrations r WHERE r.activity_id = a.id AND r.status = 'PENDING') AS pending_count,
          (SELECT COUNT(*) FROM activity_waitlists w WHERE w.activity_id = a.id AND w.status IN ('WAITING', 'NOTIFIED')) AS waitlist_count
        FROM activities a
        WHERE a.id = ? AND a.manager_id = ?`
      )
      .get(activityId, managerId);

    if (!activity) {
      throw new AppError('Không tìm thấy hoạt động thuộc quyền quản lý của bạn.', 404);
    }

    const rawStudents = this.db
      .prepare(
        `SELECT
          r.id AS registration_id,
          r.status AS registration_status,
          r.note_to_manager,
          r.cancel_reason,
          r.reject_reason AS registration_reject_reason,
          r.registered_at,
          u.id AS student_id,
          u.email,
          u.full_name,
          u.student_code,
          u.dob,
          u.phone,
          u.address,
          u.avatar_url,
          u.status AS account_status,
          (SELECT COALESCE(SUM(ph.points), 0) FROM point_histories ph WHERE ph.student_id = u.id) AS total_points,
          ps.id AS proof_id,
          ps.image_url AS proof_image_url,
          ps.description AS proof_description,
          ps.status AS proof_status,
          ps.reject_reason AS proof_reject_reason,
          ps.submitted_at AS proof_submitted_at,
          ar.checked_in_at AS checked_in_at,
          ar.method AS checkin_method
        FROM registrations r
        JOIN users u ON u.id = r.student_id
        LEFT JOIN proof_submissions ps ON ps.registration_id = r.id
        LEFT JOIN attendance_records ar ON ar.registration_id = r.id
        WHERE r.activity_id = ?
        ORDER BY r.registered_at DESC`
      )
      .all(activityId) as Array<Record<string, unknown>>;

    const rawWaitlist = this.db
      .prepare(
        `SELECT
          w.id AS waitlist_id,
          w.status AS waitlist_status,
          w.note_to_manager,
          w.notified_at,
          w.created_at,
          u.id AS student_id,
          u.email,
          u.full_name,
          u.student_code,
          u.dob,
          u.phone,
          u.address,
          u.avatar_url,
          (SELECT COALESCE(SUM(ph.points), 0) FROM point_histories ph WHERE ph.student_id = u.id) AS total_points
        FROM activity_waitlists w
        JOIN users u ON u.id = w.student_id
        WHERE w.activity_id = ? AND w.status IN ('WAITING', 'NOTIFIED')
        ORDER BY w.created_at ASC, w.id ASC`
      )
      .all(activityId) as Array<Record<string, unknown>>;

    // Ẩn email sinh viên theo đúng yêu cầu: "HIỆN TẤT CẢ THÔNG TIN CỦA SINH VIÊN TRỪ MAIL SINH VIÊN"
    const sanitizedRegistrations = rawStudents.map((row) => sanitizeStudentForManager(row));
    const sanitizedWaitlist = rawWaitlist.map((row, idx) => ({
      ...sanitizeStudentForManager(row),
      queue_position: idx + 1
    }));

    return {
      activity,
      registrations: sanitizedRegistrations,
      waitlist: sanitizedWaitlist
    };
  }

  public exportManagerActivityCsv(managerId: number, activityId: number): string {
    const detail = this.getManagerActivityDetail(managerId, activityId);
    const approvedRows = detail.registrations.filter(
      (r) => r.registration_status === 'APPROVED' || r.registration_status === 'CANCEL_REQUESTED'
    );

    const header = [
      'STT',
      'Mã sinh viên',
      'Họ và tên',
      'Số điện thoại',
      'Ngày sinh',
      'Trạng thái',
      'Lời nhắn',
      'Trạng thái minh chứng'
    ].join(',');

    const lines = approvedRows.map((row, idx) =>
      [
        idx + 1,
        escapeCsvCell(row.student_code as string),
        escapeCsvCell(row.full_name as string),
        escapeCsvCell(row.phone as string),
        escapeCsvCell(row.dob as string),
        escapeCsvCell(row.registration_status as string),
        escapeCsvCell(row.note_to_manager as string),
        escapeCsvCell((row.proof_status as string) || 'Chưa nộp')
      ].join(',')
    );

    return '\uFEFF' + [header, ...lines].join('\n');
  }
}
