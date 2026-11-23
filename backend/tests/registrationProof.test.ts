import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type SqliteDatabase } from '../src/db/database';
import { AuthUserService } from '../src/services/authUser.service';
import { ActivityService } from '../src/services/activity.service';
import { RegistrationProofService } from '../src/services/registrationProof.service';

describe('RegistrationProofService - Thành viên 3', () => {
  let db: SqliteDatabase;
  let authService: AuthUserService;
  let activityService: ActivityService;
  let rpService: RegistrationProofService;
  let managerId: number;
  let studentId: number;

  beforeEach(() => {
    db = createDatabase(':memory:');
    authService = new AuthUserService(db);
    activityService = new ActivityService(db);
    rpService = new RegistrationProofService(db);

    const mgr = authService.registerManager({
      email: 'mgr3@gmail.com',
      fullName: 'Quản lý C',
      dob: '1994-03-03',
      phone: '0905777888',
      address: 'Huế',
      password: 'password123'
    }).user;
    db.prepare("UPDATE users SET status = 'ACTIVE' WHERE id = ?").run(mgr.id);
    managerId = mgr.id;

    const sv = authService.registerStudent({
      email: 'sv3@gmail.com',
      studentCode: '21T1020888',
      fullName: 'Nguyễn Minh Quân',
      dob: '2004-09-09',
      phone: '0977112233',
      password: 'password123'
    }).user;
    studentId = sv.id;
  });

  it('registerActivity() & studentCancelRegistration(): rút ngay khi PENDING, chờ duyệt khi APPROVED và chặn hủy nếu đã bắt đầu hoặc bị hủy', () => {
    // 1. Arrange
    const startMs = Date.now() + 72 * 3600 * 1000;
    const endMs = Date.now() + 76 * 3600 * 1000;
    const act = activityService.createActivity(managerId, {
      title: 'Hiến máu 2026',
      description: 'Hỗ trợ hiến máu',
      coverImage: '/uploads/cover-blood-donation.svg',
      location: 'Hội trường',
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      maxParticipants: 20,
      trainingPoints: 8
    });
    db.prepare("UPDATE activities SET status = 'APPROVED' WHERE id = ?").run(act.id);

    // 2. Act (Phần A: Đăng ký -> PENDING -> Hủy ngay lập tức)
    const firstReg = rpService.registerActivity(studentId, act.id, 'Em xin làm tổ tiếp đón');
    const withdrawResult = rpService.studentCancelRegistration(studentId, firstReg.registration.id);

    // 3. Assert (Phần A)
    expect(firstReg.registration.status).toBe('PENDING');
    expect(withdrawResult.mode).toBe('IMMEDIATE_WITHDRAW');
    expect(withdrawResult.registration.status).toBe('CANCELLED');

    // 2. Act (Phần B: Đăng ký lại -> Quản lý duyệt APPROVED -> SV xin hủy khi chưa bắt đầu -> phải chờ Quản lý đồng ý)
    const secondReg = rpService.registerActivity(studentId, act.id, 'Em đăng ký lại ạ');
    rpService.reviewRegistration(managerId, secondReg.registration.id, 'APPROVE');

    // Chặn nếu hoạt động đã bắt đầu
    expect(() =>
      rpService.studentCancelRegistration(
        studentId,
        secondReg.registration.id,
        'Xin hủy muộn',
        new Date(startMs + 1000)
      )
    ).toThrow(/đã bắt đầu diễn ra/);

    const cancelApprovedResult = rpService.studentCancelRegistration(
      studentId,
      secondReg.registration.id,
      'Em bị trùng lịch thi đột xuất.'
    );
    const managerApprovedCancel = rpService.reviewCancelRequest(
      managerId,
      secondReg.registration.id,
      'APPROVE'
    );

    // 3. Assert (Phần B)
    expect(cancelApprovedResult.mode).toBe('PENDING_MANAGER_APPROVAL');
    expect(cancelApprovedResult.registration.status).toBe('CANCEL_REQUESTED');
    expect(managerApprovedCancel.status).toBe('CANCELLED');
  });

  it('reviewRegistration(): chặn Quản lý duyệt đơn nếu hoạt động không còn ở trạng thái APPROVED', () => {
    // 1. Arrange
    const start = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const end = new Date(Date.now() + 76 * 3600 * 1000).toISOString();
    const act = activityService.createActivity(managerId, {
      title: 'Hoạt động sắp hủy',
      description: 'Mô tả',
      coverImage: '/uploads/cover-green-sunday.svg',
      location: 'Sân trường',
      startTime: start,
      endTime: end,
      maxParticipants: 10,
      trainingPoints: 5
    });
    db.prepare("UPDATE activities SET status = 'APPROVED' WHERE id = ?").run(act.id);
    const { registration } = rpService.registerActivity(studentId, act.id, 'Xin tham gia');
    activityService.requestCancelActivity(managerId, act.id, 'Hủy sự kiện');
    db.prepare("UPDATE activities SET status = 'CANCELLED' WHERE id = ?").run(act.id);

    // 2. Act & 3. Assert
    expect(() => rpService.reviewRegistration(managerId, registration.id, 'APPROVE')).toThrow(
      /không còn ở trạng thái đã duyệt/
    );
  });

  it('getEndedActivitiesForStudent() & submitProof(): chỉ tồn tại trong 2 ngày (48h) kể từ lúc kết thúc, quá 48h tự động biến mất', () => {
    // 1. Arrange
    const startMs = Date.now() - 5 * 3600 * 1000;
    const endMs = Date.now();
    const act = activityService.createActivity(managerId, {
      title: 'Đổi giấy lấy cây',
      description: 'Thu gom giấy',
      coverImage: '/uploads/cover-paper-tree.svg',
      location: 'Sảnh B',
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      registrationDeadline: new Date(startMs - 3600 * 1000).toISOString(),
      maxParticipants: 10,
      trainingPoints: 5
    });
    db.prepare("UPDATE activities SET status = 'APPROVED' WHERE id = ?").run(act.id);

    const beforeStart = new Date(startMs - 2 * 3600 * 1000);
    const { registration } = rpService.registerActivity(studentId, act.id, 'Tham gia', beforeStart);
    rpService.reviewRegistration(managerId, registration.id, 'APPROVE');
    rpService.manualCheckIn(managerId, registration.id, new Date(startMs));

    // 2. Act
    const at47Hours = new Date(endMs + 47 * 3600 * 1000);
    const at49Hours = new Date(endMs + 49 * 3600 * 1000);

    const visibleAt47h = rpService.getEndedActivitiesForStudent(studentId, at47Hours);
    const proof = rpService.submitProof(
      studentId,
      registration.id,
      '/uploads/proof-sample-1.svg',
      'Ảnh chụp tại bàn cân giấy',
      at47Hours
    );
    const visibleAt49h = rpService.getEndedActivitiesForStudent(studentId, at49Hours);

    // 3. Assert
    expect(visibleAt47h.length).toBe(1);
    expect(proof.status).toBe('SUBMITTED');
    expect(visibleAt49h.length).toBe(0);
    expect(() =>
      rpService.submitProof(
        studentId,
        registration.id,
        '/uploads/proof-sample-2.svg',
        'Nộp muộn',
        at49Hours
      )
    ).toThrow(/quá thời hạn 48 giờ/);
  });

  it('reviewProofSubmission(): Quản lý xác nhận minh chứng cộng đúng điểm rèn luyện và chống cộng trùng lặp', () => {
    // 1. Arrange
    const startMs = Date.now() - 10 * 3600 * 1000;
    const endMs = Date.now() - 2 * 3600 * 1000;
    const act = activityService.createActivity(managerId, {
      title: 'Tiếp sức mùa thi',
      description: 'Hỗ trợ thí sinh',
      coverImage: '/uploads/cover-exam-support.svg',
      location: 'Cổng trường',
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      registrationDeadline: new Date(startMs - 3600 * 1000).toISOString(),
      maxParticipants: 10,
      trainingPoints: 7
    });
    db.prepare("UPDATE activities SET status = 'APPROVED' WHERE id = ?").run(act.id);

    const { registration } = rpService.registerActivity(
      studentId,
      act.id,
      'Em tham gia đầy đủ',
      new Date(startMs - 2 * 3600 * 1000)
    );
    rpService.reviewRegistration(managerId, registration.id, 'APPROVE');
    rpService.manualCheckIn(managerId, registration.id, new Date(startMs));
    const proof = rpService.submitProof(
      studentId,
      registration.id,
      '/uploads/proof-sample-1.svg',
      'Hoàn thành ca trực',
      new Date(endMs + 1 * 3600 * 1000)
    ) as { id: number };

    // 2. Act
    const confirmed = rpService.reviewProofSubmission(managerId, proof.id, 'CONFIRM') as {
      status: string;
    };
    const pointSummary = authService.getStudentPointsOverview(studentId);

    // 3. Assert
    expect(confirmed.status).toBe('CONFIRMED');
    expect(pointSummary.totalPoints).toBe(7);
    expect(pointSummary.history.length).toBe(1);
    expect(() => rpService.reviewProofSubmission(managerId, proof.id, 'CONFIRM')).toThrow(
      /đã được xác nhận/
    );
  });

  it('studentCancelRegistration(): chặn gửi yêu cầu hủy đơn APPROVED khi cách start_time dưới 24 tiếng, cho phép từ đúng mốc 24 tiếng và vẫn cho rút đơn PENDING', () => {
    // 1. Arrange
    const startMs = new Date('2026-12-01T08:00:00.000Z').getTime();
    const endMs = new Date('2026-12-01T12:00:00.000Z').getTime();
    const act = activityService.createActivity(managerId, {
      title: 'Chiến dịch Mùa Đông Ấm',
      description: 'Quyên góp áo ấm',
      coverImage: '/uploads/cover-green-sunday.svg',
      location: 'Hội trường A',
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      maxParticipants: 20,
      trainingPoints: 6
    });
    db.prepare("UPDATE activities SET status = 'APPROVED' WHERE id = ?").run(act.id);

    const regRes = rpService.registerActivity(
      studentId,
      act.id,
      'Tham gia chuẩn bị',
      new Date(startMs - 72 * 3600 * 1000)
    );
    rpService.reviewRegistration(managerId, regRes.registration.id, 'APPROVE');

    // 2. Act & 3. Assert: Dưới 24 tiếng (23h59m59s và 12h trước giờ bắt đầu) -> Bị chặn HTTP 400
    const justUnder24h = new Date(startMs - (24 * 3600 * 1000 - 1000));
    const at12hBefore = new Date(startMs - 12 * 3600 * 1000);

    try {
      rpService.studentCancelRegistration(studentId, regRes.registration.id, 'Bận đột xuất', justUnder24h);
      expect.unreachable('Phải chặn khi dưới 24 tiếng');
    } catch (err: any) {
      expect(err.statusCode).toBe(400);
      expect(err.message).toMatch(/dưới 24 tiếng/);
    }

    expect(() =>
      rpService.studentCancelRegistration(studentId, regRes.registration.id, 'Bận việc riêng', at12hBefore)
    ).toThrow(/dưới 24 tiếng/);

    // Đúng biên >= 24 tiếng -> Cho phép gửi yêu cầu hủy
    const atExact24h = new Date(startMs - 24 * 3600 * 1000);
    const allowedCancel = rpService.studentCancelRegistration(
      studentId,
      regRes.registration.id,
      'Xin hủy đúng hạn 24h',
      atExact24h
    );
    expect(allowedCancel.mode).toBe('PENDING_MANAGER_APPROVAL');
    expect(allowedCancel.registration.status).toBe('CANCEL_REQUESTED');

    // Đơn PENDING (chưa duyệt, chưa giữ chỗ) dù dưới 24 tiếng vẫn rút được ngay lập tức
    const sv2 = authService.registerStudent({
      email: 'sv-pending-24h@gmail.com',
      studentCode: '21T1020901',
      fullName: 'Trần Văn Pending',
      dob: '2004-04-04',
      phone: '0977000901',
      password: 'password123'
    }).user;
    const pendingReg = rpService.registerActivity(sv2.id, act.id, 'Chờ duyệt', at12hBefore);
    const withdrawPending = rpService.studentCancelRegistration(sv2.id, pendingReg.registration.id, '', at12hBefore);
    expect(withdrawPending.mode).toBe('IMMEDIATE_WITHDRAW');
    expect(withdrawPending.registration.status).toBe('CANCELLED');
  });

  it('Waitlist FIFO: hoạt động đạt maxParticipants cho vào danh sách chờ và tự động Notification cho người đứng đầu khi có người được duyệt hủy', () => {
    // 1. Arrange
    const startMs = new Date('2026-12-05T08:00:00.000Z').getTime();
    const endMs = new Date('2026-12-05T12:00:00.000Z').getTime();
    const tJoin = new Date(startMs - 72 * 3600 * 1000);

    const act = activityService.createActivity(managerId, {
      title: 'Đội Tình nguyện Giới hạn 1 SV',
      description: 'Kiểm thử hàng chờ',
      coverImage: '/uploads/cover-green-sunday.svg',
      location: 'Sân trường',
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      maxParticipants: 1,
      trainingPoints: 5
    });
    db.prepare("UPDATE activities SET status = 'APPROVED' WHERE id = ?").run(act.id);

    const reg1 = rpService.registerActivity(studentId, act.id, 'SV1 đăng ký đầu tiên', tJoin);
    rpService.reviewRegistration(managerId, reg1.registration.id, 'APPROVE');

    const sv2 = authService.registerStudent({
      email: 'waiter2@gmail.com',
      studentCode: '21T1020902',
      fullName: 'Sinh viên Chờ #1',
      dob: '2004-05-05',
      phone: '0977000902',
      password: 'password123'
    }).user;
    const sv3 = authService.registerStudent({
      email: 'waiter3@gmail.com',
      studentCode: '21T1020903',
      fullName: 'Sinh viên Chờ #2',
      dob: '2004-06-06',
      phone: '0977000903',
      password: 'password123'
    }).user;

    // 2. Act: SV2 & SV3 đăng ký danh sách chờ theo thứ tự FIFO
    const w2 = rpService.joinWaitlist(sv2.id, act.id, 'Em rất mong được tham gia', new Date(tJoin.getTime() + 1000));
    const w3 = rpService.joinWaitlist(sv3.id, act.id, 'Em xin xếp hàng sau', new Date(tJoin.getTime() + 2000));
    const publicList = activityService.listPublicActivities({}, new Date(tJoin.getTime() + 3000));
    const publicAct = publicList.find((a: any) => a.id === act.id) as any;

    expect(w2.queuePosition).toBe(1);
    expect(w3.queuePosition).toBe(2);
    expect(publicAct.is_registration_open).toBe(false);
    expect(publicAct.is_waitlist_open).toBe(true);
    expect(publicAct.waitlist_count).toBe(2);

    // SV1 xin hủy (>24h trước start) và Quản lý đồng ý hủy -> trả 1 chỗ trống
    const tCancel = new Date(startMs - 48 * 3600 * 1000);
    rpService.studentCancelRegistration(studentId, reg1.registration.id, 'Em chuyển lịch học', tCancel);
    rpService.reviewCancelRequest(managerId, reg1.registration.id, 'APPROVE', '', tCancel);

    // 3. Assert: SV2 đứng đầu hàng chờ được chuyển sang NOTIFIED & nhận Notification, SV3 vẫn WAITING
    const sv2Waitlists = rpService.getStudentWaitlists(sv2.id) as Array<Record<string, unknown>>;
    const sv3Waitlists = rpService.getStudentWaitlists(sv3.id) as Array<Record<string, unknown>>;
    expect(sv2Waitlists.length).toBe(1);
    expect(sv2Waitlists[0].waitlist_status).toBe('NOTIFIED');
    expect(sv3Waitlists.length).toBe(1);
    expect(sv3Waitlists[0].waitlist_status).toBe('WAITING');

    const sv2Notif = db
      .prepare('SELECT title, type FROM notifications WHERE user_id = ? ORDER BY id DESC LIMIT 1')
      .get(sv2.id) as { title: string; type: string } | undefined;
    expect(sv2Notif?.title).toContain('chỗ trống');
    expect(sv2Notif?.type).toBe('SUCCESS');

    // SV2 vào đăng ký chính thức -> trạng thái waitlist chuyển sang PROMOTED
    const promotedReg = rpService.registerActivity(sv2.id, act.id, 'Đăng ký từ danh sách chờ', new Date(tCancel.getTime() + 5000));
    expect(promotedReg.registration.status).toBe('PENDING');
    const waitRowAfter = db
      .prepare('SELECT status FROM activity_waitlists WHERE activity_id = ? AND student_id = ?')
      .get(act.id, sv2.id) as { status: string };
    expect(waitRowAfter.status).toBe('PROMOTED');
  });

  it('joinWaitlist() & leaveWaitlist(): chặn vào hàng chờ khi còn chỗ hoặc trùng lặp, và rời hàng chờ đẩy người sau lên #1', () => {
    // 1. Arrange
    const startMs = new Date('2026-12-08T08:00:00.000Z').getTime();
    const endMs = new Date('2026-12-08T12:00:00.000Z').getTime();
    const t0 = new Date(startMs - 72 * 3600 * 1000);

    const act = activityService.createActivity(managerId, {
      title: 'Hoạt động Kiểm thử Biên Hàng chờ',
      description: 'Kiểm thử các ca lỗi',
      coverImage: '/uploads/cover-green-sunday.svg',
      location: 'Sảnh C',
      startTime: new Date(startMs).toISOString(),
      endTime: new Date(endMs).toISOString(),
      maxParticipants: 1,
      trainingPoints: 4
    });
    db.prepare("UPDATE activities SET status = 'APPROVED' WHERE id = ?").run(act.id);

    const sv2 = authService.registerStudent({
      email: 'edge2@gmail.com',
      studentCode: '21T1020904',
      fullName: 'SV Edge 2',
      dob: '2004-07-07',
      phone: '0977000904',
      password: 'password123'
    }).user;
    const sv3 = authService.registerStudent({
      email: 'edge3@gmail.com',
      studentCode: '21T1020905',
      fullName: 'SV Edge 3',
      dob: '2004-08-08',
      phone: '0977000905',
      password: 'password123'
    }).user;

    // 2. Act & 3. Assert: còn chỗ trống -> từ chối 400
    expect(() => rpService.joinWaitlist(sv2.id, act.id, '', t0)).toThrow(/còn chỗ trống/);

    // Lấp đầy maxParticipants = 1
    const reg1 = rpService.registerActivity(studentId, act.id, 'Đi', t0);
    rpService.reviewRegistration(managerId, reg1.registration.id, 'APPROVE');

    // SV2 và SV3 vào hàng chờ
    rpService.joinWaitlist(sv2.id, act.id, 'Chờ 1', new Date(t0.getTime() + 1000));
    rpService.joinWaitlist(sv3.id, act.id, 'Chờ 2', new Date(t0.getTime() + 2000));

    // Đăng ký trùng hàng chờ -> 409
    try {
      rpService.joinWaitlist(sv2.id, act.id, 'Chờ lại', new Date(t0.getTime() + 3000));
      expect.unreachable('Phải chặn trùng hàng chờ');
    } catch (err: any) {
      expect(err.statusCode).toBe(409);
    }

    // SV2 rời hàng chờ -> SV3 tự động lên vị trí #1
    rpService.leaveWaitlist(sv2.id, act.id);
    const sv3List = rpService.getStudentWaitlists(sv3.id) as Array<Record<string, unknown>>;
    expect(sv3List.length).toBe(1);
    expect(sv3List[0].queue_position).toBe(1);
  });

});
