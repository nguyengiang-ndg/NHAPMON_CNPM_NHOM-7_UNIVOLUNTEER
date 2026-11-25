import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabase, type SqliteDatabase } from '../src/db/database';
import { ensureAdminAccount } from '../src/db/seed';
import { AuthUserService } from '../src/services/authUser.service';
import { ActivityService } from '../src/services/activity.service';
import { RegistrationProofService } from '../src/services/registrationProof.service';
import { AdminReportService } from '../src/services/adminReport.service';

describe('AuthUserService - Thành viên 1 (Scrum Master)', () => {
  let db: SqliteDatabase;
  let authService: AuthUserService;

  beforeEach(() => {
    db = createDatabase(':memory:');
    authService = new AuthUserService(db);
  });

  it('ensureAdminAccount(): tạo duy nhất tài khoản Admin adminnguyendangiang@gmail.com / Giang123@', () => {
    // 1. Arrange & 2. Act
    ensureAdminAccount(db);
    const adminLogin = authService.login('adminnguyendangiang@gmail.com', 'Giang123@');

    // 3. Assert
    expect(adminLogin.user.role).toBe('ADMIN');
    expect(adminLogin.user.email).toBe('adminnguyendangiang@gmail.com');
    expect(() => authService.login('admin@school.edu.vn', '123456')).toThrow();
  });

  it('registerStudent(): chấp nhận email cá nhân thường (Gmail/Yahoo) nhưng chặn trùng Mã sinh viên', () => {
    // 1. Arrange
    authService.registerStudent({
      email: 'nguyen.a@gmail.com',
      studentCode: '21T1029999',
      fullName: 'Nguyễn Văn A',
      dob: '2004-01-10',
      phone: '0901234567',
      password: 'password123'
    });

    // 2. Act & 3. Assert
    expect(() =>
      authService.registerStudent({
        email: 'khac.email@yahoo.com',
        studentCode: '21T1029999',
        fullName: 'Trần Văn B',
        dob: '2004-02-12',
        phone: '0909998887',
        password: 'password123'
      })
    ).toThrow(/Mã sinh viên này đã tồn tại/);
  });

  it('registerManager() & login(): Quản lý mới tạo ở trạng thái PENDING và trả đúng thông báo chờ Admin duyệt', () => {
    // 1. Arrange
    const managerInput = {
      email: 'ql.moi@gmail.com',
      fullName: 'Phạm Thị Quản Lý',
      dob: '1996-06-15',
      phone: '0911223344',
      address: '10 Lê Lợi, Huế',
      password: 'password123'
    };

    // 2. Act
    const regResult = authService.registerManager(managerInput);

    // 3. Assert
    expect(regResult.user.status).toBe('PENDING');
    expect(regResult.message).toContain('Cảm ơn bạn đã đăng ký, Admin sẽ duyệt sớm nhất có thể');
    expect(() => authService.login('ql.moi@gmail.com', 'password123')).toThrow(
      /đang chờ Admin phê duyệt/
    );
  });

  it('getStudentDetailForManager(): hiển thị tất cả thông tin sinh viên TRỪ Email sinh viên', () => {
    // 1. Arrange
    const sv = authService.registerStudent({
      email: 'secret.student@gmail.com',
      studentCode: '21T1020111',
      fullName: 'Lê Minh Tuấn',
      dob: '2004-05-05',
      phone: '0988111222',
      password: 'password123'
    }).user;

    const adminService = new AdminReportService(db);
    const mgr = authService.registerManager({
      email: 'mgr@gmail.com',
      fullName: 'Quản lý A',
      dob: '1994-01-01',
      phone: '0905000111',
      address: 'Huế',
      password: 'password123'
    }).user;
    adminService.reviewManagerAccount(mgr.id, 'APPROVE');

    const actService = new ActivityService(db);
    const start = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const end = new Date(Date.now() + 52 * 3600 * 1000).toISOString();
    const act = actService.createActivity(mgr.id, {
      title: 'Hỗ trợ sinh viên',
      description: 'Mô tả chi tiết',
      coverImage: '/uploads/cover-green-sunday.svg',
      location: 'Sân trường',
      startTime: start,
      endTime: end,
      maxParticipants: 20,
      trainingPoints: 5
    });
    adminService.reviewActivityProposal(act.id, 'APPROVE');

    const rpService = new RegistrationProofService(db);
    rpService.registerActivity(sv.id, act.id, 'Em muốn tham gia ạ');

    // 2. Act
    const detailForManager = authService.getStudentDetailForManager(sv.id, mgr.id);

    // 3. Assert
    expect(detailForManager.student.full_name).toBe('Lê Minh Tuấn');
    expect(detailForManager.student.student_code).toBe('21T1020111');
    expect(detailForManager.student.phone).toBe('0988111222');
    expect('email' in detailForManager.student).toBe(false);
  });

  it('getStudentDetailForManager(): cho phép Quản lý xem sinh viên đang nằm trong danh sách chờ và vẫn ẩn Email', () => {
    // 1. Arrange
    const sv1 = authService.registerStudent({
      email: 'full1@gmail.com',
      studentCode: '21T1020112',
      fullName: 'Sinh viên Chính',
      dob: '2004-05-05',
      phone: '0988111223',
      password: 'password123'
    }).user;
    const svWait = authService.registerStudent({
      email: 'secret.waiter@gmail.com',
      studentCode: '21T1020113',
      fullName: 'Sinh viên Danh Sách Chờ',
      dob: '2004-06-06',
      phone: '0988111224',
      password: 'password123'
    }).user;

    const adminService = new AdminReportService(db);
    const mgr = authService.registerManager({
      email: 'mgr.waitdetail@gmail.com',
      fullName: 'Quản lý Waitlist',
      dob: '1994-01-01',
      phone: '0905000222',
      address: 'Huế',
      password: 'password123'
    }).user;
    adminService.reviewManagerAccount(mgr.id, 'APPROVE');

    const actService = new ActivityService(db);
    const start = new Date(Date.now() + 48 * 3600 * 1000).toISOString();
    const end = new Date(Date.now() + 52 * 3600 * 1000).toISOString();
    const act = actService.createActivity(mgr.id, {
      title: 'Hoạt động 1 slot',
      description: 'Mô tả chi tiết',
      coverImage: '/uploads/cover-green-sunday.svg',
      location: 'Sân trường',
      startTime: start,
      endTime: end,
      maxParticipants: 1,
      trainingPoints: 5
    });
    adminService.reviewActivityProposal(act.id, 'APPROVE');

    const rpService = new RegistrationProofService(db);
    const r1 = rpService.registerActivity(sv1.id, act.id, 'Slot 1');
    rpService.reviewRegistration(mgr.id, r1.registration.id, 'APPROVE');
    rpService.joinWaitlist(svWait.id, act.id, 'Em xin vào danh sách chờ');

    // 2. Act
    const waiterDetail = authService.getStudentDetailForManager(svWait.id, mgr.id);

    // 3. Assert
    expect(waiterDetail.student.full_name).toBe('Sinh viên Danh Sách Chờ');
    expect(waiterDetail.student.student_code).toBe('21T1020113');
    expect('email' in waiterDetail.student).toBe(false);
    expect(waiterDetail.registrations.length).toBe(0);
  });

  it('requestPasswordReset() & resetPasswordWithOtp(): đặt lại mật khẩu thành công bằng OTP 6 số và đăng nhập bằng mật khẩu mới', async () => {
    // 1. Arrange
    const registered = authService.registerStudent({
      email: 'quyen.sv@gmail.com',
      studentCode: '21T1020888',
      fullName: 'Trần Thị Quyên',
      dob: '2004-05-12',
      phone: '0911222333',
      password: 'oldPassword123',
    });

    let capturedOtp = '';
    const emailSender = vi.fn(async (params) => {
      capturedOtp = params.otpCode;
      return { deliveryMode: 'SMTP' as const };
    });
    const t0 = new Date('2026-11-22T10:00:00.000Z');

    // 2. Act
    const requestResult = await authService.requestPasswordReset('quyen.sv@gmail.com', t0, emailSender);
    const resetResult = authService.resetPasswordWithOtp(
      'quyen.sv@gmail.com',
      capturedOtp,
      'newStrongPass456',
      new Date(t0.getTime() + 2 * 60 * 1000)
    );

    // 3. Assert
    expect(emailSender).toHaveBeenCalledTimes(1);
    expect(capturedOtp).toMatch(/^\d{6}$/);
    expect('otp' in (requestResult as Record<string, unknown>)).toBe(false);
    expect(requestResult.deliveryMode).toBe('SMTP');
    expect(resetResult.message).toContain('Đặt lại mật khẩu thành công');
    expect(() => authService.login('quyen.sv@gmail.com', 'oldPassword123')).toThrow();

    const newLogin = authService.login('quyen.sv@gmail.com', 'newStrongPass456');
    expect(newLogin.user.id).toBe(registered.user.id);

    const notif = db
      .prepare('SELECT title FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1')
      .get(registered.user.id) as { title: string } | undefined;
    expect(notif?.title).toBe('Đặt lại mật khẩu thành công');
  });

  it('requestPasswordReset(): chặn gửi lại OTP trong vòng 60 giây cooldown (HTTP 429)', async () => {
    // 1. Arrange
    authService.registerStudent({
      email: 'cooldown.sv@gmail.com',
      studentCode: '21T1020889',
      fullName: 'Phạm Văn Cooldown',
      dob: '2004-06-15',
      phone: '0911222444',
      password: 'password123',
    });
    const emailSender = vi.fn(async () => ({ deliveryMode: 'SMTP' as const }));
    const t0 = new Date('2026-11-22T10:00:00.000Z');
    await authService.requestPasswordReset('cooldown.sv@gmail.com', t0, emailSender);

    // 2. Act & 3. Assert
    const withinCooldown = new Date(t0.getTime() + 30 * 1000);
    await expect(
      authService.requestPasswordReset('cooldown.sv@gmail.com', withinCooldown, emailSender)
    ).rejects.toMatchObject({ statusCode: 429 });
    expect(emailSender).toHaveBeenCalledTimes(1);
  });

  it('resetPasswordWithOtp(): từ chối mã OTP đã hết hạn sau 10 phút', async () => {
    // 1. Arrange
    authService.registerStudent({
      email: 'expired.sv@gmail.com',
      studentCode: '21T1020890',
      fullName: 'Lê Văn Hết Hạn',
      dob: '2004-07-20',
      phone: '0911222555',
      password: 'password123',
    });
    let capturedOtp = '';
    const emailSender = vi.fn(async (params) => {
      capturedOtp = params.otpCode;
      return { deliveryMode: 'SMTP' as const };
    });
    const t0 = new Date('2026-11-22T10:00:00.000Z');
    await authService.requestPasswordReset('expired.sv@gmail.com', t0, emailSender);

    // 2. Act & 3. Assert
    const afterExpiry = new Date(t0.getTime() + 11 * 60 * 1000);
    expect(() =>
      authService.resetPasswordWithOtp('expired.sv@gmail.com', capturedOtp, 'newPass123', afterExpiry)
    ).toThrow(/hết hạn/i);
  });

  it('resetPasswordWithOtp(): khóa mã OTP khi nhập sai 5 lần liên tiếp (HTTP 429)', async () => {
    // 1. Arrange
    authService.registerStudent({
      email: 'lockout.sv@gmail.com',
      studentCode: '21T1020891',
      fullName: 'Hoàng Minh Khóa',
      dob: '2004-08-25',
      phone: '0911222666',
      password: 'password123',
    });
    let capturedOtp = '';
    const emailSender = vi.fn(async (params) => {
      capturedOtp = params.otpCode;
      return { deliveryMode: 'SMTP' as const };
    });
    const t0 = new Date('2026-11-22T10:00:00.000Z');
    await authService.requestPasswordReset('lockout.sv@gmail.com', t0, emailSender);
    const wrongOtp = capturedOtp === '000000' ? '999999' : '000000';

    // 2. Act & 3. Assert: 4 lần sai đầu trả về 400
    for (let i = 0; i < 4; i++) {
      expect(() =>
        authService.resetPasswordWithOtp('lockout.sv@gmail.com', wrongOtp, 'newPass123', t0)
      ).toThrow(/còn \d+ lần thử/);
    }

    // Lần thứ 5 bị khóa với statusCode 429
    try {
      authService.resetPasswordWithOtp('lockout.sv@gmail.com', wrongOtp, 'newPass123', t0);
      expect.unreachable('Phải báo lỗi 429 ở lần sai thứ 5');
    } catch (err: any) {
      expect(err.statusCode).toBe(429);
    }

    // Ngay cả khi nhập đúng OTP sau khi đã bị khóa cũng không dùng được nữa
    expect(() =>
      authService.resetPasswordWithOtp('lockout.sv@gmail.com', capturedOtp, 'newPass123', t0)
    ).toThrow(/Không có mã OTP hợp lệ/i);
  });

  it('exportStudentCompletedActivitiesCsv(): xuất bảng tổng hợp CSV có UTF-8 BOM và lọc đúng theo học kỳ', () => {
    // 1. Arrange
    const sv = authService.registerStudent({
      email: 'export.sv@gmail.com',
      studentCode: '21T1020999',
      fullName: 'Nguyễn Thị Xuất File',
      dob: '2004-11-11',
      phone: '0912345678',
      password: 'password123'
    }).user;

    const adminService = new AdminReportService(db);
    const mgr = authService.registerManager({
      email: 'export.mgr@gmail.com',
      fullName: 'Quản lý Export',
      dob: '1990-01-01',
      phone: '0905123456',
      address: 'Đà Nẵng',
      password: 'password123'
    }).user;
    adminService.reviewManagerAccount(mgr.id, 'APPROVE');

    const actService = new ActivityService(db);
    const rpService = new RegistrationProofService(db);

    const start1 = new Date('2026-10-15T07:00:00.000Z');
    const end1 = new Date('2026-10-15T11:00:00.000Z');
    const act1 = actService.createActivity(mgr.id, {
      title: 'Ngày Chủ Nhật Xanh HK1',
      description: 'Dọn dẹp khuôn viên',
      coverImage: '/uploads/cover-green-sunday.svg',
      location: 'Sân trường A',
      startTime: start1.toISOString(),
      endTime: end1.toISOString(),
      maxParticipants: 30,
      trainingPoints: 5
    });
    adminService.reviewActivityProposal(act1.id, 'APPROVE');

    const start2 = new Date('2027-03-15T07:00:00.000Z');
    const end2 = new Date('2027-03-15T11:00:00.000Z');
    const act2 = actService.createActivity(mgr.id, {
      title: 'Hiến máu Nhân đạo HK2',
      description: 'Hỗ trợ y tế',
      coverImage: '/uploads/cover-blood-donation.svg',
      location: 'Hội trường B',
      startTime: start2.toISOString(),
      endTime: end2.toISOString(),
      maxParticipants: 30,
      trainingPoints: 8
    });
    adminService.reviewActivityProposal(act2.id, 'APPROVE');

    const r1 = rpService.registerActivity(sv.id, act1.id, 'Tham gia HK1', new Date(start1.getTime() - 48 * 3600 * 1000));
    rpService.reviewRegistration(mgr.id, r1.registration.id, 'APPROVE');
    rpService.manualCheckIn(mgr.id, r1.registration.id, start1);
    const p1 = rpService.submitProof(
      sv.id,
      r1.registration.id,
      '/uploads/proof-sample-1.svg',
      'Minh chứng HK1',
      new Date(end1.getTime() + 2 * 3600 * 1000)
    ) as { id: number };
    rpService.reviewProofSubmission(mgr.id, p1.id, 'CONFIRM');

    const r2 = rpService.registerActivity(sv.id, act2.id, 'Tham gia HK2', new Date(start2.getTime() - 48 * 3600 * 1000));
    rpService.reviewRegistration(mgr.id, r2.registration.id, 'APPROVE');
    rpService.manualCheckIn(mgr.id, r2.registration.id, start2);
    const p2 = rpService.submitProof(
      sv.id,
      r2.registration.id,
      '/uploads/proof-sample-2.svg',
      'Minh chứng HK2',
      new Date(end2.getTime() + 2 * 3600 * 1000)
    ) as { id: number };
    rpService.reviewProofSubmission(mgr.id, p2.id, 'CONFIRM');

    // 2. Act
    const allCsv = authService.exportStudentCompletedActivitiesCsv(sv.id, 'ALL');
    const hk1Csv = authService.exportStudentCompletedActivitiesCsv(sv.id, 'HK1 2026-2027');

    // 3. Assert
    expect(allCsv.startsWith('\uFEFF')).toBe(true);
    expect(allCsv).toContain('Nguyễn Thị Xuất File');
    expect(allCsv).toContain('21T1020999');
    expect(allCsv).toContain('Ngày Chủ Nhật Xanh HK1');
    expect(allCsv).toContain('Hiến máu Nhân đạo HK2');
    expect(allCsv).toContain('Tổng điểm rèn luyện,13');

    expect(hk1Csv).toContain('HK1 2026-2027');
    expect(hk1Csv).toContain('Ngày Chủ Nhật Xanh HK1');
    expect(hk1Csv).toContain('Tổng điểm rèn luyện,5');
    expect(hk1Csv).not.toContain('Hiến máu Nhân đạo HK2');
  });
});
