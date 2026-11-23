import crypto from 'node:crypto';
import type { SqliteDatabase } from '../db/database';
import { AppError, UserRecord } from '../types/models';
import { comparePassword, escapeCsvCell, hashPassword, isValidEmail, signToken } from '../utils/helpers';
import {
  OtpEmailDeliveryMode,
  OtpEmailResult,
  SendOtpEmailParams,
  sendPasswordResetOtpEmail,
} from '../utils/mailer';

const OTP_EXPIRES_MINUTES = 10;
const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
const OTP_MAX_ATTEMPTS = 5;

interface PasswordResetOtpRecord {
  id: number;
  user_id: number;
  email: string;
  otp_hash: string;
  expires_at: string;
  attempts: number;
  used: number;
  created_at: string;
}

function hashOtpCode(otp: string): string {
  return crypto.createHash('sha256').update(otp).digest('hex');
}

export interface RegisterStudentInput {
  email: string;
  studentCode: string;
  fullName: string;
  dob: string;
  phone: string;
  password: string;
}

export interface RegisterManagerInput {
  email: string;
  fullName: string;
  dob: string;
  phone: string;
  address: string;
  password: string;
}

export interface SafeUserDto {
  id: number;
  email: string;
  role: string;
  status: string;
  full_name: string;
  dob: string | null;
  phone: string;
  student_code: string | null;
  address: string | null;
  avatar_url: string | null;
  created_at: string;
}

/**
 * Chuẩn hóa dữ liệu người dùng trả về cho chính người dùng hoặc Admin (có kèm email).
 */
export function toSafeUser(user: UserRecord): SafeUserDto {
  return {
    id: user.id,
    email: user.email,
    role: user.role,
    status: user.status,
    full_name: user.full_name,
    dob: user.dob,
    phone: user.phone,
    student_code: user.student_code,
    address: user.address,
    avatar_url: user.avatar_url,
    created_at: user.created_at
  };
}

/**
 * QUY TẮC BẮT BUỘC:
 * Khi Quản lý hoạt động nhấn vào xem sinh viên, hiển thị tất cả thông tin CỦA SINH VIÊN TRỪ Email sinh viên.
 * Hàm này lọc bỏ hoàn toàn trường `email` (và `password_hash`) trước khi trả dữ liệu cho Manager.
 */
export function sanitizeStudentForManager<T extends Record<string, unknown>>(
  studentRecord: T
): Omit<T, 'email' | 'password_hash'> {
  const clone = { ...studentRecord };
  delete clone.email;
  delete clone.password_hash;
  return clone;
}

export class AuthUserService {
  constructor(private readonly db: SqliteDatabase) {}

  public registerStudent(input: RegisterStudentInput): { token: string; user: SafeUserDto } {
    const email = input.email?.trim().toLowerCase();
    const studentCode = input.studentCode?.trim().toUpperCase();
    const fullName = input.fullName?.trim();
    const dob = input.dob?.trim();
    const phone = input.phone?.trim();
    const password = input.password;

    if (!email || !isValidEmail(email)) {
      throw new AppError('Email không đúng định dạng hợp lệ.', 400);
    }
    if (!studentCode) {
      throw new AppError('Mã sinh viên không được để trống.', 400);
    }
    if (!fullName || !dob || !phone) {
      throw new AppError('Vui lòng nhập đầy đủ họ tên, ngày tháng năm sinh và số điện thoại.', 400);
    }
    if (!password || password.length < 6) {
      throw new AppError('Mật khẩu phải có ít nhất 6 ký tự.', 400);
    }

    const existingEmail = this.db
      .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email);
    if (existingEmail) {
      throw new AppError('Email này đã được đăng ký tài khoản.', 409);
    }

    const existingStudentCode = this.db
      .prepare('SELECT id FROM users WHERE UPPER(student_code) = UPPER(?)')
      .get(studentCode);
    if (existingStudentCode) {
      throw new AppError('Mã sinh viên này đã tồn tại trong hệ thống. Không được phép trùng mã sinh viên.', 409);
    }

    const passwordHash = hashPassword(password);
    const result = this.db
      .prepare(
        `INSERT INTO users (email, password_hash, role, status, full_name, dob, phone, student_code)
         VALUES (?, ?, 'STUDENT', 'ACTIVE', ?, ?, ?, ?)`
      )
      .run(email, passwordHash, fullName, dob, phone, studentCode);

    const created = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(Number(result.lastInsertRowid)) as unknown as UserRecord;

    const token = signToken({
      userId: created.id,
      role: created.role,
      email: created.email
    });

    return {
      token,
      user: toSafeUser(created)
    };
  }

  public registerManager(input: RegisterManagerInput): { message: string; user: SafeUserDto } {
    const email = input.email?.trim().toLowerCase();
    const fullName = input.fullName?.trim();
    const dob = input.dob?.trim();
    const phone = input.phone?.trim();
    const address = input.address?.trim();
    const password = input.password;

    if (!email || !isValidEmail(email)) {
      throw new AppError('Email không đúng định dạng hợp lệ.', 400);
    }
    if (!fullName || !dob || !phone || !address) {
      throw new AppError('Vui lòng nhập đầy đủ họ tên, SĐT, ngày sinh và địa chỉ.', 400);
    }
    if (!password || password.length < 6) {
      throw new AppError('Mật khẩu phải có ít nhất 6 ký tự.', 400);
    }

    const existingEmail = this.db
      .prepare('SELECT id FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email);
    if (existingEmail) {
      throw new AppError('Email này đã được đăng ký tài khoản.', 409);
    }

    const passwordHash = hashPassword(password);
    const result = this.db
      .prepare(
        `INSERT INTO users (email, password_hash, role, status, full_name, dob, phone, address)
         VALUES (?, ?, 'MANAGER', 'PENDING', ?, ?, ?, ?)`
      )
      .run(email, passwordHash, fullName, dob, phone, address);

    const created = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(Number(result.lastInsertRowid)) as unknown as UserRecord;

    // Gửi thông báo cho tất cả Admin
    const admins = this.db.prepare("SELECT id FROM users WHERE role = 'ADMIN'").all() as Array<{ id: number }>;
    const insertNotif = this.db.prepare(
      'INSERT INTO notifications (user_id, title, message, type) VALUES (?, ?, ?, ?)'
    );
    for (const admin of admins) {
      insertNotif.run(
        admin.id,
        'Đơn đăng ký Quản lý hoạt động mới',
        `${fullName} (${email}) vừa đăng ký tài khoản Quản lý hoạt động và đang chờ duyệt.`,
        'WARNING'
      );
    }

    return {
      message: 'Cảm ơn bạn đã đăng ký, Admin sẽ duyệt sớm nhất có thể.',
      user: toSafeUser(created)
    };
  }

  public login(emailInput: string, password: string): { token: string; user: SafeUserDto } {
    const email = emailInput?.trim().toLowerCase();
    if (!email || !password) {
      throw new AppError('Vui lòng nhập đầy đủ email và mật khẩu.', 400);
    }

    const user = this.db
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email) as unknown as UserRecord | undefined;

    if (!user || !comparePassword(password, user.password_hash)) {
      throw new AppError('Email hoặc mật khẩu không chính xác.', 401);
    }

    if (user.status === 'PENDING') {
      throw new AppError('Tài khoản Quản lý của bạn đang chờ Admin phê duyệt. Vui lòng quay lại sau.', 403);
    }
    if (user.status === 'REJECTED') {
      throw new AppError(
        `Tài khoản của bạn đã bị từ chối${user.reject_reason ? `: ${user.reject_reason}` : '.'}`,
        403
      );
    }
    if (user.status === 'LOCKED') {
      throw new AppError('Tài khoản của bạn đã bị khóa bởi quản trị viên.', 403);
    }

    const token = signToken({
      userId: user.id,
      role: user.role,
      email: user.email
    });

    return {
      token,
      user: toSafeUser(user)
    };
  }

  public getUserById(userId: number): SafeUserDto {
    const user = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(userId) as unknown as UserRecord | undefined;
    if (!user) {
      throw new AppError('Không tìm thấy tài khoản.', 404);
    }
    return toSafeUser(user);
  }

  public updateProfile(
    userId: number,
    updates: { fullName?: string; phone?: string; dob?: string; address?: string; avatarUrl?: string }
  ): SafeUserDto {
    const user = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(userId) as unknown as UserRecord | undefined;
    if (!user) {
      throw new AppError('Không tìm thấy tài khoản.', 404);
    }

    this.db
      .prepare(
        `UPDATE users SET
          full_name = ?,
          phone = ?,
          dob = ?,
          address = ?,
          avatar_url = ?
         WHERE id = ?`
      )
      .run(
        updates.fullName?.trim() || user.full_name,
        updates.phone?.trim() || user.phone,
        updates.dob?.trim() ?? user.dob,
        updates.address?.trim() ?? user.address,
        updates.avatarUrl !== undefined ? updates.avatarUrl : user.avatar_url,
        userId
      );

    return this.getUserById(userId);
  }

  public changePassword(userId: number, currentPassword: string, newPassword: string): void {
    const user = this.db
      .prepare('SELECT * FROM users WHERE id = ?')
      .get(userId) as unknown as UserRecord | undefined;
    if (!user) {
      throw new AppError('Không tìm thấy tài khoản.', 404);
    }
    if (!comparePassword(currentPassword, user.password_hash)) {
      throw new AppError('Mật khẩu hiện tại không đúng.', 400);
    }
    if (!newPassword || newPassword.length < 6) {
      throw new AppError('Mật khẩu mới phải có ít nhất 6 ký tự.', 400);
    }
    this.db
      .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
      .run(hashPassword(newPassword), userId);
  }

  /**
   * Bước 1 Quên mật khẩu: Sinh mã OTP 6 số, lưu bản băm SHA-256 hết hạn sau 10 phút và gửi email.
   */
  public async requestPasswordReset(
    emailInput: string,
    now: Date = new Date(),
    emailSender: (params: SendOtpEmailParams) => Promise<OtpEmailResult> = sendPasswordResetOtpEmail
  ): Promise<{ message: string; deliveryMode: OtpEmailDeliveryMode }> {
    const email = emailInput?.trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      throw new AppError('Định dạng email không hợp lệ.', 400);
    }

    const user = this.db
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email) as unknown as UserRecord | undefined;

    if (!user) {
      throw new AppError('Không tìm thấy tài khoản với email này.', 404);
    }
    if (user.status === 'LOCKED') {
      throw new AppError('Tài khoản của bạn đã bị khóa bởi quản trị viên.', 403);
    }
    if (user.status === 'REJECTED') {
      throw new AppError(
        'Tài khoản của bạn đã bị từ chối và không thể khôi phục mật khẩu.',
        403
      );
    }

    const latestActiveOtp = this.db
      .prepare(
        `SELECT * FROM password_reset_otps
         WHERE user_id = ? AND used = 0
         ORDER BY id DESC LIMIT 1`
      )
      .get(user.id) as unknown as PasswordResetOtpRecord | undefined;

    if (latestActiveOtp) {
      const elapsedMs = now.getTime() - new Date(latestActiveOtp.created_at).getTime();
      if (elapsedMs >= 0 && elapsedMs < OTP_RESEND_COOLDOWN_MS) {
        const waitSeconds = Math.ceil((OTP_RESEND_COOLDOWN_MS - elapsedMs) / 1000);
        throw new AppError(
          `Vui lòng chờ ${waitSeconds} giây trước khi yêu cầu gửi lại mã OTP.`,
          429
        );
      }
    }

    this.db
      .prepare('UPDATE password_reset_otps SET used = 1 WHERE user_id = ? AND used = 0')
      .run(user.id);

    const otpCode = String(crypto.randomInt(100000, 1000000));
    const otpHash = hashOtpCode(otpCode);
    const createdAtIso = now.toISOString();
    const expiresAtIso = new Date(now.getTime() + OTP_EXPIRES_MINUTES * 60 * 1000).toISOString();

    const insertResult = this.db
      .prepare(
        `INSERT INTO password_reset_otps (user_id, email, otp_hash, expires_at, created_at)
         VALUES (?, ?, ?, ?, ?)`
      )
      .run(user.id, user.email, otpHash, expiresAtIso, createdAtIso);

    try {
      const delivery = await emailSender({
        toEmail: user.email,
        fullName: user.full_name,
        otpCode,
        expiresMinutes: OTP_EXPIRES_MINUTES,
      });

      const message =
        delivery.deliveryMode === 'DEV_CONSOLE'
          ? 'Mã OTP 6 số đã được tạo (chế độ cục bộ: xem mã OTP tại Terminal Backend). Mã có hiệu lực trong 10 phút.'
          : 'Mã OTP 6 số đã được gửi về email của bạn. Vui lòng kiểm tra hộp thư (kể cả mục Spam).';

      return { message, deliveryMode: delivery.deliveryMode };
    } catch (err) {
      this.db
        .prepare('UPDATE password_reset_otps SET used = 1 WHERE id = ?')
        .run(Number(insertResult.lastInsertRowid));
      throw err;
    }
  }

  /**
   * Bước 2 Quên mật khẩu: Xác thực OTP 6 số (timing-safe, tối đa 5 lần thử) và cập nhật mật khẩu mới.
   */
  public resetPasswordWithOtp(
    emailInput: string,
    otpInput: string,
    newPassword: string,
    now: Date = new Date()
  ): { message: string } {
    const email = emailInput?.trim().toLowerCase();
    const otp = otpInput?.trim();

    if (!email || !isValidEmail(email)) {
      throw new AppError('Định dạng email không hợp lệ.', 400);
    }
    if (!otp || !/^\d{6}$/.test(otp)) {
      throw new AppError('Mã OTP phải gồm đúng 6 chữ số.', 400);
    }
    if (!newPassword || newPassword.length < 6) {
      throw new AppError('Mật khẩu mới phải có ít nhất 6 ký tự.', 400);
    }

    const user = this.db
      .prepare('SELECT * FROM users WHERE LOWER(email) = LOWER(?)')
      .get(email) as unknown as UserRecord | undefined;

    if (!user) {
      throw new AppError('Không tìm thấy tài khoản với email này.', 404);
    }
    if (user.status === 'LOCKED') {
      throw new AppError('Tài khoản của bạn đã bị khóa bởi quản trị viên.', 403);
    }
    if (user.status === 'REJECTED') {
      throw new AppError(
        'Tài khoản của bạn đã bị từ chối và không thể khôi phục mật khẩu.',
        403
      );
    }

    const otpRecord = this.db
      .prepare(
        `SELECT * FROM password_reset_otps
         WHERE user_id = ? AND used = 0
         ORDER BY id DESC LIMIT 1`
      )
      .get(user.id) as unknown as PasswordResetOtpRecord | undefined;

    if (!otpRecord) {
      throw new AppError(
        'Không có mã OTP hợp lệ hoặc mã đã được sử dụng. Vui lòng yêu cầu gửi lại mã mới.',
        400
      );
    }

    if (now.getTime() > new Date(otpRecord.expires_at).getTime()) {
      this.db.prepare('UPDATE password_reset_otps SET used = 1 WHERE id = ?').run(otpRecord.id);
      throw new AppError('Mã OTP đã hết hạn (quá 10 phút). Vui lòng yêu cầu gửi lại mã mới.', 400);
    }

    if (otpRecord.attempts >= OTP_MAX_ATTEMPTS) {
      this.db.prepare('UPDATE password_reset_otps SET used = 1 WHERE id = ?').run(otpRecord.id);
      throw new AppError(
        'Bạn đã nhập sai OTP quá nhiều lần. Vui lòng yêu cầu gửi lại mã OTP mới.',
        429
      );
    }

    const providedBuf = Buffer.from(hashOtpCode(otp), 'hex');
    const expectedBuf = Buffer.from(otpRecord.otp_hash, 'hex');
    const isMatch =
      providedBuf.length === expectedBuf.length && crypto.timingSafeEqual(providedBuf, expectedBuf);

    if (!isMatch) {
      const nextAttempts = otpRecord.attempts + 1;
      if (nextAttempts >= OTP_MAX_ATTEMPTS) {
        this.db
          .prepare('UPDATE password_reset_otps SET attempts = ?, used = 1 WHERE id = ?')
          .run(nextAttempts, otpRecord.id);
        throw new AppError(
          'Bạn đã nhập sai mã OTP 5 lần. Mã OTP này đã bị vô hiệu hóa, vui lòng yêu cầu mã mới.',
          429
        );
      }

      this.db
        .prepare('UPDATE password_reset_otps SET attempts = ? WHERE id = ?')
        .run(nextAttempts, otpRecord.id);
      const remaining = OTP_MAX_ATTEMPTS - nextAttempts;
      throw new AppError(`Mã OTP không chính xác. Bạn còn ${remaining} lần thử.`, 400);
    }

    const newPasswordHash = hashPassword(newPassword);
    this.db.exec('BEGIN');
    try {
      this.db
        .prepare('UPDATE users SET password_hash = ? WHERE id = ?')
        .run(newPasswordHash, user.id);
      this.db
        .prepare('UPDATE password_reset_otps SET used = 1 WHERE user_id = ?')
        .run(user.id);
      this.db
        .prepare(
          `INSERT INTO notifications (user_id, title, message, type)
           VALUES (?, ?, ?, ?)`
        )
        .run(
          user.id,
          'Đặt lại mật khẩu thành công',
          'Mật khẩu tài khoản của bạn vừa được đặt lại qua mã xác thực OTP email.',
          'WARNING'
        );
      this.db.exec('COMMIT');
    } catch (err) {
      this.db.exec('ROLLBACK');
      throw err;
    }

    return {
      message: 'Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại bằng mật khẩu mới.',
    };
  }

  /**
   * Lấy tổng điểm rèn luyện và lịch sử tích điểm của sinh viên (hiển thị khi bấm vào Avatar góc phải).
   */
  public getStudentPointsOverview(studentId: number, semester?: string) {
    const user = this.getUserById(studentId);
    const totalRow = this.db
      .prepare('SELECT COALESCE(SUM(points), 0) AS total_points FROM point_histories WHERE student_id = ?')
      .get(studentId) as { total_points: number };

    let query = `
      SELECT
        ph.id,
        ph.activity_id,
        ph.points,
        ph.semester,
        ph.awarded_at,
        a.title AS activity_title,
        a.location AS activity_location,
        a.start_time AS activity_start_time,
        a.end_time AS activity_end_time,
        m.full_name AS manager_name,
        m.phone AS manager_phone,
        ps.image_url AS proof_image_url,
        ps.description AS proof_description,
        ps.status AS proof_status
      FROM point_histories ph
      JOIN activities a ON a.id = ph.activity_id
      JOIN users m ON m.id = a.manager_id
      LEFT JOIN proof_submissions ps ON ps.registration_id = ph.registration_id
      WHERE ph.student_id = ?
    `;
    const params: unknown[] = [studentId];

    if (semester && semester !== 'ALL') {
      query += ' AND ph.semester = ?';
      params.push(semester);
    }

    query += ' ORDER BY ph.awarded_at DESC';
    const history = this.db.prepare(query).all(...params) as Array<Record<string, unknown>>;

    const filteredTotalPoints = history.reduce(
      (sum, row) => sum + Number(row.points || 0),
      0
    );

    const semesters = this.db
      .prepare('SELECT DISTINCT semester FROM point_histories WHERE student_id = ? ORDER BY semester DESC')
      .all(studentId)
      .map((r) => String(r.semester));

    return {
      user,
      totalPoints: Number(totalRow.total_points || 0),
      filteredTotalPoints,
      semesters,
      history
    };
  }

  /**
   * Xuất Bảng tổng hợp các hoạt động đã hoàn thành (dạng CSV có UTF-8 BOM cho Excel) để sinh viên nộp minh chứng cuối kỳ.
   */
  public exportStudentCompletedActivitiesCsv(studentId: number, semester?: string): string {
    const overview = this.getStudentPointsOverview(studentId, semester);
    const scopeLabel = !semester || semester === 'ALL' ? 'Tất cả học kỳ' : semester;

    const metaRows = [
      ['BẢNG TỔNG HỢP HOẠT ĐỘNG TÌNH NGUYỆN ĐÃ HOÀN THÀNH', '', '', '', '', '', '', '', '', ''].join(','),
      ['Họ và tên', escapeCsvCell(overview.user.full_name)].join(','),
      ['Mã sinh viên', escapeCsvCell(overview.user.student_code)].join(','),
      ['Email', escapeCsvCell(overview.user.email)].join(','),
      ['Phạm vi học kỳ', escapeCsvCell(scopeLabel)].join(','),
      ['Số hoạt động hoàn thành', overview.history.length].join(','),
      ['Tổng điểm rèn luyện', overview.filteredTotalPoints].join(','),
      ''
    ];

    const header = [
      'STT',
      'Tên hoạt động',
      'Địa điểm',
      'Thời gian bắt đầu',
      'Thời gian kết thúc',
      'Học kỳ',
      'Quản lý xác nhận',
      'Điểm rèn luyện',
      'Trạng thái minh chứng',
      'Thời gian xác nhận'
    ].join(',');

    const lines = overview.history.map((row, idx) =>
      [
        idx + 1,
        escapeCsvCell(String(row.activity_title || '')),
        escapeCsvCell(String(row.activity_location || '')),
        escapeCsvCell(String(row.activity_start_time || '')),
        escapeCsvCell(String(row.activity_end_time || '')),
        escapeCsvCell(String(row.semester || '')),
        escapeCsvCell(String(row.manager_name || '')),
        Number(row.points || 0),
        escapeCsvCell(row.proof_status === 'CONFIRMED' ? 'Đã xác nhận' : String(row.proof_status || 'Đã hoàn thành')),
        escapeCsvCell(String(row.awarded_at || ''))
      ].join(',')
    );

    return '\uFEFF' + [...metaRows, header, ...lines].join('\n');
  }

  /**
   * Dành cho Quản lý hoạt động bấm xem chi tiết 1 sinh viên trong hoạt động của mình:
   * Trả về tất cả thông tin của sinh viên (họ tên, MSSV, ngày sinh, SĐT, tổng điểm, lịch sử tham gia)
   * NHƯNG TUYỆT ĐỐI KHÔNG BAO GỒM EMAIL SINH VIÊN.
   */
  public getStudentDetailForManager(studentId: number, managerId: number) {
    // Kiểm tra sinh viên này có đăng ký hoặc nằm trong danh sách chờ của ít nhất 1 hoạt động do managerId quản lý hay không
    const hasRegistrationRelation = this.db
      .prepare(
        `SELECT r.id
         FROM registrations r
         JOIN activities a ON a.id = r.activity_id
         WHERE r.student_id = ? AND a.manager_id = ?
         LIMIT 1`
      )
      .get(studentId, managerId);

    const hasWaitlistRelation = hasRegistrationRelation
      ? undefined
      : this.db
          .prepare(
            `SELECT w.id
             FROM activity_waitlists w
             JOIN activities a ON a.id = w.activity_id
             WHERE w.student_id = ? AND a.manager_id = ?
             LIMIT 1`
          )
          .get(studentId, managerId);

    if (!hasRegistrationRelation && !hasWaitlistRelation) {
      throw new AppError('Bạn không có quyền xem thông tin sinh viên không thuộc hoạt động mình quản lý.', 403);
    }

    const student = this.db
      .prepare("SELECT * FROM users WHERE id = ? AND role = 'STUDENT'")
      .get(studentId) as unknown as UserRecord | undefined;

    if (!student) {
      throw new AppError('Không tìm thấy sinh viên.', 404);
    }

    const totalRow = this.db
      .prepare('SELECT COALESCE(SUM(points), 0) AS total_points FROM point_histories WHERE student_id = ?')
      .get(studentId) as { total_points: number };

    const activitiesInManagerScope = this.db
      .prepare(
        `SELECT
          r.id AS registration_id,
          r.status AS registration_status,
          r.note_to_manager,
          r.cancel_reason,
          r.registered_at,
          a.id AS activity_id,
          a.title AS activity_title,
          a.start_time,
          a.end_time,
          ps.image_url AS proof_image_url,
          ps.description AS proof_description,
          ps.status AS proof_status
        FROM registrations r
        JOIN activities a ON a.id = r.activity_id
        LEFT JOIN proof_submissions ps ON ps.registration_id = r.id
        WHERE r.student_id = ? AND a.manager_id = ?
        ORDER BY r.registered_at DESC`
      )
      .all(studentId, managerId);

    const safeForManager = sanitizeStudentForManager(student as unknown as Record<string, unknown>);

    return {
      student: {
        ...safeForManager,
        total_points: Number(totalRow.total_points || 0)
      },
      registrations: activitiesInManagerScope
    };
  }
}
