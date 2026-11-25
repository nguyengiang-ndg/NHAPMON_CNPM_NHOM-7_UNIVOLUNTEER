import type { SqliteDatabase } from '../db/database';
import { AppError, ReportStatus, ReportTargetType, UserRecord } from '../types/models';
import { toSafeUser } from './authUser.service';

export class AdminReportService {
  constructor(private readonly db: SqliteDatabase) {}

  // ======================== DASHBOARD & SETTINGS ========================

  public getDashboardStats() {
    const count = (sql: string) => Number((this.db.prepare(sql).get() as { cnt: number }).cnt || 0);

    return {
      totalStudents: count("SELECT COUNT(*) AS cnt FROM users WHERE role = 'STUDENT'"),
      activeManagers: count("SELECT COUNT(*) AS cnt FROM users WHERE role = 'MANAGER' AND status = 'ACTIVE'"),
      pendingManagers: count("SELECT COUNT(*) AS cnt FROM users WHERE role = 'MANAGER' AND status = 'PENDING'"),
      approvedActivities: count("SELECT COUNT(*) AS cnt FROM activities WHERE status = 'APPROVED'"),
      pendingActivities: count("SELECT COUNT(*) AS cnt FROM activities WHERE status = 'PENDING_APPROVAL'"),
      cancelRequestedActivities: count("SELECT COUNT(*) AS cnt FROM activities WHERE status = 'CANCEL_REQUESTED'"),
      openReports: count("SELECT COUNT(*) AS cnt FROM reports WHERE status IN ('OPEN', 'IN_PROGRESS')"),
      totalPointsAwarded: Number(
        (this.db.prepare('SELECT COALESCE(SUM(points), 0) AS s FROM point_histories').get() as { s: number }).s || 0
      )
    };
  }

  public getSystemSettings() {
    return this.db.prepare('SELECT * FROM system_settings ORDER BY key ASC').all();
  }

  public updateSystemSetting(key: string, value: string) {
    const existing = this.db.prepare('SELECT * FROM system_settings WHERE key = ?').get(key);
    if (!existing) {
      throw new AppError('Không tìm thấy tham số cấu hình.', 404);
    }

    if (key === 'REQUIRE_CHECKIN_FOR_PROOF') {
      if (value !== '0' && value !== '1') {
        throw new AppError(
          'Giá trị cho REQUIRE_CHECKIN_FOR_PROOF chỉ được là 0 (Tắt) hoặc 1 (Bật).',
          400
        );
      }
      this.db.prepare('UPDATE system_settings SET value = ? WHERE key = ?').run(value, key);
      return this.db.prepare('SELECT * FROM system_settings WHERE key = ?').get(key);
    }

    const num = Number(value);
    if (!Number.isFinite(num) || num <= 0) {
      throw new AppError('Giá trị cấu hình phải là số dương hợp lệ.', 400);
    }

    this.db.prepare('UPDATE system_settings SET value = ? WHERE key = ?').run(String(num), key);
    return this.db.prepare('SELECT * FROM system_settings WHERE key = ?').get(key);
  }

  // ======================== QUẢN LÝ TÀI KHOẢN QUẢN LÝ & SINH VIÊN ========================

  public listManagers(status?: string) {
    let sql = "SELECT * FROM users WHERE role = 'MANAGER'";
    const params: unknown[] = [];
    if (status && status !== 'ALL') {
      sql += ' AND status = ?';
      params.push(status);
    }
    sql += ' ORDER BY created_at DESC';
    const rows = this.db.prepare(sql).all(...params) as unknown as UserRecord[];
    return rows.map((u) => ({
      ...toSafeUser(u),
      reject_reason: u.reject_reason,
      activity_count: Number(
        (this.db.prepare('SELECT COUNT(*) AS cnt FROM activities WHERE manager_id = ?').get(u.id) as { cnt: number })
          .cnt || 0
      )
    }));
  }

  public reviewManagerAccount(managerId: number, decision: 'APPROVE' | 'REJECT', rejectReason = '') {
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      throw new AppError('Quyết định duyệt không hợp lệ.', 400);
    }

    const manager = this.db
      .prepare("SELECT * FROM users WHERE id = ? AND role = 'MANAGER'")
      .get(managerId) as unknown as UserRecord | undefined;

    if (!manager) {
      throw new AppError('Không tìm thấy tài khoản Quản lý.', 404);
    }

    if (decision === 'APPROVE') {
      this.db
        .prepare("UPDATE users SET status = 'ACTIVE', reject_reason = NULL WHERE id = ?")
        .run(managerId);
      this.db
        .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
        .run(
          managerId,
          'Tài khoản Quản lý đã được duyệt',
          'Chúc mừng! Admin đã phê duyệt tài khoản Quản lý hoạt động của bạn.',
          'SUCCESS'
        );
    } else {
      const reason = rejectReason.trim() || 'Thông tin xác minh chưa đầy đủ.';
      this.db
        .prepare("UPDATE users SET status = 'REJECTED', reject_reason = ? WHERE id = ?")
        .run(reason, managerId);
    }

    return toSafeUser(
      this.db.prepare('SELECT * FROM users WHERE id = ?').get(managerId) as unknown as UserRecord
    );
  }

  public toggleUserLock(userId: number, lock: boolean) {
    const user = this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRecord | undefined;
    if (!user) {
      throw new AppError('Không tìm thấy tài khoản.', 404);
    }
    if (user.role === 'ADMIN') {
      throw new AppError('Không thể khóa tài khoản Admin.', 400);
    }

    const nextStatus = lock ? 'LOCKED' : 'ACTIVE';
    this.db.prepare('UPDATE users SET status = ? WHERE id = ?').run(nextStatus, userId);
    return toSafeUser(this.db.prepare('SELECT * FROM users WHERE id = ?').get(userId) as unknown as UserRecord);
  }

  public listStudentsForAdmin(search = '') {
    const rows = this.db
      .prepare(
        `SELECT
          u.*,
          (SELECT COALESCE(SUM(ph.points), 0) FROM point_histories ph WHERE ph.student_id = u.id) AS total_points,
          (SELECT COUNT(*) FROM registrations r WHERE r.student_id = u.id AND r.status = 'APPROVED') AS approved_activities_count
        FROM users u
        WHERE u.role = 'STUDENT'
        ORDER BY u.created_at DESC`
      )
      .all() as Array<Record<string, unknown>>;

    const q = search.trim().toLowerCase();
    return rows
      .map((r) => {
        const safe = toSafeUser(r as unknown as UserRecord);
        return {
          ...safe,
          total_points: Number(r.total_points || 0),
          approved_activities_count: Number(r.approved_activities_count || 0)
        };
      })
      .filter((s) => {
        if (!q) return true;
        return `${s.full_name} ${s.student_code} ${s.email} ${s.phone}`.toLowerCase().includes(q);
      });
  }

  /**
   * QUY TẮC BẮT BUỘC CHO ADMIN:
   * Khi Admin nhấn vào mỗi tài khoản sinh viên, hiện ra TẤT CẢ MỌI THỨ của sinh viên đó
   * (bao gồm Email, MSSV, SĐT, Ngày sinh, Tổng điểm, Lịch sử tích điểm, Hoạt động, Minh chứng, Báo cáo).
   */
  public getStudentFullDetailForAdmin(studentId: number) {
    const user = this.db
      .prepare("SELECT * FROM users WHERE id = ? AND role = 'STUDENT'")
      .get(studentId) as unknown as UserRecord | undefined;

    if (!user) {
      throw new AppError('Không tìm thấy tài khoản sinh viên.', 404);
    }

    const totalRow = this.db
      .prepare('SELECT COALESCE(SUM(points), 0) AS total_points FROM point_histories WHERE student_id = ?')
      .get(studentId) as { total_points: number };

    const pointHistory = this.db
      .prepare(
        `SELECT ph.*, a.title AS activity_title, a.location
         FROM point_histories ph
         JOIN activities a ON a.id = ph.activity_id
         WHERE ph.student_id = ?
         ORDER BY ph.awarded_at DESC`
      )
      .all(studentId);

    const registrations = this.db
      .prepare(
        `SELECT
          r.id AS registration_id,
          r.status AS registration_status,
          r.note_to_manager,
          r.cancel_reason,
          r.reject_reason,
          r.registered_at,
          a.id AS activity_id,
          a.title AS activity_title,
          a.start_time,
          a.end_time,
          a.training_points,
          m.full_name AS manager_name,
          ps.image_url AS proof_image_url,
          ps.description AS proof_description,
          ps.status AS proof_status,
          ps.submitted_at AS proof_submitted_at,
          ar.checked_in_at AS checked_in_at,
          ar.method AS checkin_method
        FROM registrations r
        JOIN activities a ON a.id = r.activity_id
        JOIN users m ON m.id = a.manager_id
        LEFT JOIN proof_submissions ps ON ps.registration_id = r.id
        LEFT JOIN attendance_records ar ON ar.registration_id = r.id
        WHERE r.student_id = ?
        ORDER BY r.registered_at DESC`
      )
      .all(studentId);

    const reports = this.db
      .prepare('SELECT * FROM reports WHERE reporter_id = ? ORDER BY created_at DESC')
      .all(studentId);

    return {
      student: {
        ...toSafeUser(user),
        total_points: Number(totalRow.total_points || 0)
      },
      pointHistory,
      registrations,
      reports
    };
  }

  // ======================== DUYỆT & HỦY HOẠT ĐỘNG ========================

  public listActivitiesForAdmin(status?: string) {
    let sql = `
      SELECT
        a.*,
        u.full_name AS manager_name,
        u.email AS manager_email,
        u.phone AS manager_phone,
        (SELECT COUNT(*) FROM registrations r WHERE r.activity_id = a.id AND r.status IN ('APPROVED', 'CANCEL_REQUESTED')) AS approved_count
      FROM activities a
      JOIN users u ON u.id = a.manager_id
    `;
    const params: unknown[] = [];
    if (status && status !== 'ALL') {
      sql += ' WHERE a.status = ?';
      params.push(status);
    }
    sql += ' ORDER BY a.created_at DESC';
    return this.db.prepare(sql).all(...params);
  }

  public reviewActivityProposal(activityId: number, decision: 'APPROVE' | 'REJECT', rejectReason = '') {
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      throw new AppError('Quyết định duyệt không hợp lệ.', 400);
    }

    const act = this.db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId) as Record<string, unknown> | undefined;
    if (!act) {
      throw new AppError('Không tìm thấy hoạt động.', 404);
    }
    if (act.status !== 'PENDING_APPROVAL') {
      throw new AppError('Chỉ có thể duyệt hoặc từ chối hoạt động đang ở trạng thái chờ Admin duyệt.', 400);
    }

    if (decision === 'APPROVE') {
      this.db
        .prepare("UPDATE activities SET status = 'APPROVED', reject_reason = NULL WHERE id = ?")
        .run(activityId);
      this.db
        .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
        .run(
          act.manager_id,
          'Hoạt động đã được Admin phê duyệt',
          `Hoạt động "${act.title}" đã được duyệt và hiển thị công khai cho sinh viên đăng ký.`,
          'SUCCESS'
        );
    } else {
      const reason = rejectReason.trim() || 'Thông tin hoạt động chưa phù hợp.';
      this.db
        .prepare("UPDATE activities SET status = 'REJECTED', reject_reason = ? WHERE id = ?")
        .run(reason, activityId);
      this.db
        .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
        .run(
          act.manager_id,
          'Hoạt động bị từ chối duyệt',
          `Hoạt động "${act.title}" chưa được duyệt. Lý do: ${reason}`,
          'ERROR'
        );
    }

    return this.db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId);
  }

  public reviewActivityCancelRequest(activityId: number, decision: 'APPROVE' | 'REJECT', note = '') {
    if (decision !== 'APPROVE' && decision !== 'REJECT') {
      throw new AppError('Quyết định duyệt không hợp lệ.', 400);
    }

    const act = this.db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId) as Record<string, unknown> | undefined;
    if (!act) {
      throw new AppError('Không tìm thấy hoạt động.', 404);
    }
    if (act.status !== 'CANCEL_REQUESTED') {
      throw new AppError('Hoạt động này không có yêu cầu hủy đang chờ duyệt.', 400);
    }

    if (decision === 'APPROVE') {
      this.db.prepare("UPDATE activities SET status = 'CANCELLED' WHERE id = ?").run(activityId);

      // Thông báo cho Quản lý
      this.db
        .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
        .run(
          act.manager_id,
          'Yêu cầu hủy hoạt động đã được Admin duyệt',
          `Hoạt động "${act.title}" đã chuyển sang trạng thái Đã hủy.`,
          'INFO'
        );

      // Thông báo cho tất cả sinh viên đang đăng ký/đã duyệt
      const regs = this.db
        .prepare(
          "SELECT student_id FROM registrations WHERE activity_id = ? AND status IN ('PENDING', 'APPROVED', 'CANCEL_REQUESTED')"
        )
        .all(activityId) as Array<{ student_id: number }>;

      const insertNotif = this.db.prepare(
        'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)'
      );
      for (const r of regs) {
        insertNotif.run(
          r.student_id,
          'Hoạt động tình nguyện đã bị hủy',
          `Hoạt động "${act.title}" đã được Quản lý xin phép Admin hủy bỏ. Lý do: ${act.cancel_reason || 'Theo kế hoạch của BTC'}.`,
          'WARNING'
        );
      }

      // Thông báo cho các sinh viên đang trong danh sách chờ & cập nhật trạng thái CANCELLED
      const waitlistRegs = this.db
        .prepare(
          "SELECT student_id FROM activity_waitlists WHERE activity_id = ? AND status IN ('WAITING', 'NOTIFIED')"
        )
        .all(activityId) as Array<{ student_id: number }>;

      if (waitlistRegs.length > 0) {
        this.db
          .prepare(
            "UPDATE activity_waitlists SET status = 'CANCELLED', updated_at = datetime('now') WHERE activity_id = ? AND status IN ('WAITING', 'NOTIFIED')"
          )
          .run(activityId);

        for (const w of waitlistRegs) {
          insertNotif.run(
            w.student_id,
            'Hoạt động trong danh sách chờ đã bị hủy',
            `Hoạt động "${act.title}" mà bạn đang chờ chỗ đã được Quản lý xin phép Admin hủy bỏ. Lý do: ${act.cancel_reason || 'Theo kế hoạch của BTC'}.`,
            'WARNING'
          );
        }
      }
    } else {
      const reason = note.trim() || 'Admin chưa chấp thuận hủy hoạt động này.';
      this.db
        .prepare("UPDATE activities SET status = 'APPROVED', reject_reason = ? WHERE id = ?")
        .run(reason, activityId);

      this.db
        .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
        .run(
          act.manager_id,
          'Yêu cầu hủy hoạt động bị từ chối',
          `Admin không duyệt yêu cầu hủy "${act.title}". Ghi chú: ${reason}`,
          'WARNING'
        );
    }

    return this.db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId);
  }

  // ======================== BÁO CÁO (REPORTS) & THÔNG BÁO ========================

  public createReport(
    reporterId: number,
    senderRole: 'STUDENT' | 'MANAGER',
    input: { targetType?: ReportTargetType; targetId?: number | null; title: string; content: string }
  ) {
    const title = input.title?.trim();
    const content = input.content?.trim();
    const targetType = input.targetType || 'OTHER';
    const targetId = input.targetId ?? null;

    if (!title || !content) {
      throw new AppError('Vui lòng nhập tiêu đề và nội dung báo cáo.', 400);
    }

    const res = this.db
      .prepare(
        `INSERT INTO reports (reporter_id, sender_role, target_type, target_id, title, content, status)
         VALUES (?, ?, ?, ?, ?, ?, 'OPEN')`
      )
      .run(reporterId, senderRole, targetType, targetId, title, content);

    const admins = this.db.prepare("SELECT id FROM users WHERE role = 'ADMIN'").all() as Array<{ id: number }>;
    const insertNotif = this.db.prepare(
      'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)'
    );
    const roleLabel = senderRole === 'STUDENT' ? 'Sinh viên' : 'Quản lý hoạt động';
    for (const admin of admins) {
      insertNotif.run(admin.id, `Báo cáo mới từ ${roleLabel}`, title, 'WARNING');
    }

    return this.db.prepare('SELECT * FROM reports WHERE id = ?').get(Number(res.lastInsertRowid));
  }

  public getMyReports(userId: number) {
    return this.db
      .prepare('SELECT * FROM reports WHERE reporter_id = ? ORDER BY created_at DESC')
      .all(userId);
  }

  public listReportsForAdmin(senderRole?: string, status?: string) {
    let sql = `
      SELECT
        rp.*,
        u.full_name AS reporter_name,
        u.email AS reporter_email,
        u.phone AS reporter_phone,
        u.student_code AS reporter_student_code
      FROM reports rp
      JOIN users u ON u.id = rp.reporter_id
      WHERE 1=1
    `;
    const params: unknown[] = [];

    if (senderRole && senderRole !== 'ALL') {
      sql += ' AND rp.sender_role = ?';
      params.push(senderRole);
    }
    if (status && status !== 'ALL') {
      sql += ' AND rp.status = ?';
      params.push(status);
    }

    sql += ' ORDER BY rp.created_at DESC';
    return this.db.prepare(sql).all(...params);
  }

  public resolveReport(reportId: number, status: ReportStatus, adminResponse: string) {
    const report = this.db
      .prepare('SELECT * FROM reports WHERE id = ?')
      .get(reportId) as Record<string, unknown> | undefined;

    if (!report) {
      throw new AppError('Không tìm thấy báo cáo.', 404);
    }
    if (!['OPEN', 'IN_PROGRESS', 'RESOLVED'].includes(status)) {
      throw new AppError('Trạng thái xử lý không hợp lệ.', 400);
    }

    this.db
      .prepare(
        `UPDATE reports
         SET status = ?, admin_response = ?, updated_at = datetime('now')
         WHERE id = ?`
      )
      .run(status, adminResponse.trim() || null, reportId);

    this.db
      .prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)')
      .run(
        report.reporter_id,
        'Admin đã phản hồi báo cáo của bạn',
        `Báo cáo "${report.title}" chuyển trạng thái ${status}. Phản hồi: ${adminResponse.trim() || 'Đã tiếp nhận xử lý.'}`,
        status === 'RESOLVED' ? 'SUCCESS' : 'INFO'
      );

    return this.db.prepare('SELECT * FROM reports WHERE id = ?').get(reportId);
  }

  public getNotifications(userId: number) {
    return this.db
      .prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50')
      .all(userId);
  }

  public markAllNotificationsRead(userId: number) {
    this.db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
  }
}
