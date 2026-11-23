import { describe, it, expect, beforeEach, vi } from 'vitest';
import { createDatabase, type SqliteDatabase } from '../src/db/database';
import { ensureAdminAccount } from '../src/db/seed';
import { AuthUserService } from '../src/services/authUser.service';

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

  it('requestPasswordReset() & resetPasswordWithOtp(): đặt lại mật khẩu thành công bằng OTP 6 số và đăng nhập bằng mật khẩu mới', async () => {
    // 1. Arrange
    const registered = authService.registerStudent({
      email: 'quyen.sv@gmail.com',
      studentCode: '21T1020888',
      fullName: 'Trần Thị Quyên',
      dob: '2004-05-12',
      phone: '0911222333',
      password: 'oldPassword123'
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
  });

  it('requestPasswordReset(): chặn gửi lại OTP trong vòng 60 giây cooldown (HTTP 429)', async () => {
    // 1. Arrange
    authService.registerStudent({
      email: 'cooldown.sv@gmail.com',
      studentCode: '21T1020889',
      fullName: 'Phạm Văn Cooldown',
      dob: '2004-06-15',
      phone: '0911222444',
      password: 'password123'
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
      password: 'password123'
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
      password: 'password123'
    });
    let capturedOtp = '';
    const emailSender = vi.fn(async (params) => {
      capturedOtp = params.otpCode;
      return { deliveryMode: 'SMTP' as const };
    });
    const t0 = new Date('2026-11-22T10:00:00.000Z');
    await authService.requestPasswordReset('lockout.sv@gmail.com', t0, emailSender);
    const wrongOtp = capturedOtp === '000000' ? '999999' : '000000';

    // 2. Act & 3. Assert
    for (let i = 0; i < 4; i++) {
      expect(() =>
        authService.resetPasswordWithOtp('lockout.sv@gmail.com', wrongOtp, 'newPass123', t0)
      ).toThrow(/còn \d+ lần thử/);
    }

    try {
      authService.resetPasswordWithOtp('lockout.sv@gmail.com', wrongOtp, 'newPass123', t0);
      expect.unreachable('Phải báo lỗi 429 ở lần sai thứ 5');
    } catch (err: any) {
      expect(err.statusCode).toBe(429);
    }

    expect(() =>
      authService.resetPasswordWithOtp('lockout.sv@gmail.com', capturedOtp, 'newPass123', t0)
    ).toThrow(/Không có mã OTP hợp lệ/i);
  });
});
