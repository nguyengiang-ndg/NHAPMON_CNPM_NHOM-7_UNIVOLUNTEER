import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type SqliteDatabase } from '../src/db/database';
import { AuthUserService } from '../src/services/authUser.service';
import { ActivityService } from '../src/services/activity.service';
import { AdminReportService } from '../src/services/adminReport.service';
import { RegistrationProofService } from '../src/services/registrationProof.service';

describe('AdminReportService - Thành viên 4', () => {
  let db: SqliteDatabase;
  let authService: AuthUserService;
  let activityService: ActivityService;
  let adminService: AdminReportService;

  beforeEach(() => {
    db = createDatabase(':memory:');
    authService = new AuthUserService(db);
    activityService = new ActivityService(db);
    adminService = new AdminReportService(db);
  });

  it('getStudentFullDetailForAdmin(): Admin nhấn vào tài khoản sinh viên thấy TẤT CẢ mọi thứ (kể cả Email, điểm, hoạt động, báo cáo)', () => {
    // 1. Arrange
    const sv = authService.registerStudent({
      email: 'sinhvien.daydu@gmail.com',
      studentCode: '21T1020777',
      fullName: 'Đặng Thị Mai',
      dob: '2004-12-01',
      phone: '0966554433',
      password: 'password123'
    }).user;

    adminService.createReport(sv.id, 'STUDENT', {
      targetType: 'OTHER',
      title: 'Cần hỗ trợ cập nhật điểm',
      content: 'Em đã tham gia hoạt động nhưng chưa thấy cộng điểm.'
    });

    // 2. Act
    const fullDetail = adminService.getStudentFullDetailForAdmin(sv.id);

    // 3. Assert
    expect(fullDetail.student.email).toBe('sinhvien.daydu@gmail.com');
    expect(fullDetail.student.student_code).toBe('21T1020777');
    expect(fullDetail.reports.length).toBe(1);
    expect(fullDetail.student.total_points).toBe(0);
  });

  it('reviewActivityCancelRequest() & reviewActivityProposal(): duyệt yêu cầu hủy và chặn duyệt lại hoạt động không ở trạng thái chờ duyệt', () => {
    // 1. Arrange
    const mgr = authService.registerManager({
      email: 'mgr4@gmail.com',
      fullName: 'Quản lý D',
      dob: '1992-08-08',
      phone: '0905222333',
      address: 'Huế',
      password: 'password123'
    }).user;
    adminService.reviewManagerAccount(mgr.id, 'APPROVE');

    const sv = authService.registerStudent({
      email: 'sv4@gmail.com',
      studentCode: '22T1020444',
      fullName: 'Hoàng Văn Nam',
      dob: '2005-04-04',
      phone: '0912345678',
      password: 'password123'
    }).user;

    const start = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const end = new Date(Date.now() + 76 * 3600 * 1000).toISOString();
    const act = activityService.createActivity(mgr.id, {
      title: 'Dã ngoại dọn rác bãi biển',
      description: 'Thu gom rác tại bãi biển Thuận An',
      coverImage: '/uploads/cover-green-sunday.svg',
      location: 'Biển Thuận An',
      startTime: start,
      endTime: end,
      maxParticipants: 30,
      trainingPoints: 9
    });
    adminService.reviewActivityProposal(act.id, 'APPROVE');

    const rpService = new RegistrationProofService(db);
    rpService.registerActivity(sv.id, act.id, 'Em xin đi cùng lớp');
    activityService.requestCancelActivity(mgr.id, act.id, 'Thời tiết xấu');

    // 2. Act
    const cancelledAct = adminService.reviewActivityCancelRequest(act.id, 'APPROVE') as {
      status: string;
    };
    const svNotifs = adminService.getNotifications(sv.id) as Array<{ title: string }>;

    // 3. Assert
    expect(cancelledAct.status).toBe('CANCELLED');
    expect(svNotifs.some((n) => n.title.includes('đã bị hủy'))).toBe(true);
    expect(() => adminService.reviewActivityProposal(act.id, 'APPROVE')).toThrow(
      /chờ Admin duyệt/
    );
  });

  it('createReport() & resolveReport(): Admin đón nhận và xử lý báo cáo từ cả Sinh viên và Quản lý', () => {
    // 1. Arrange
    const mgr = authService.registerManager({
      email: 'mgr.report@gmail.com',
      fullName: 'Quản lý E',
      dob: '1993-02-02',
      phone: '0905333444',
      address: 'Huế',
      password: 'password123'
    }).user;
    adminService.reviewManagerAccount(mgr.id, 'APPROVE');

    const sv = authService.registerStudent({
      email: 'sv.report@gmail.com',
      studentCode: '21T1020333',
      fullName: 'Võ Thị Hoa',
      dob: '2004-06-06',
      phone: '0989888777',
      password: 'password123'
    }).user;

    const svReport = adminService.createReport(sv.id, 'STUDENT', {
      title: 'Báo cáo sai sót giờ kết thúc',
      content: 'Hoạt động kết thúc sớm hơn dự kiến.'
    }) as { id: number };
    adminService.createReport(mgr.id, 'MANAGER', {
      title: 'Báo cáo sinh viên gửi ảnh giả mạo',
      content: 'Phát hiện ảnh minh chứng lấy từ mạng.'
    });

    // 2. Act
    const allReports = adminService.listReportsForAdmin();
    const resolved = adminService.resolveReport(
      svReport.id,
      'RESOLVED',
      'Admin đã điều chỉnh lại mốc thời gian.'
    ) as { status: string; admin_response: string };

    // 3. Assert
    expect(allReports.length).toBe(2);
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.admin_response).toContain('điều chỉnh');
  });
});
