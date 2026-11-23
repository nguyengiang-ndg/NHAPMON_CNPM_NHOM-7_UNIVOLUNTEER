import { describe, it, expect, beforeEach } from 'vitest';
import { createDatabase, type SqliteDatabase } from '../src/db/database';
import { AuthUserService } from '../src/services/authUser.service';
import { ActivityService } from '../src/services/activity.service';

describe('ActivityService - Thành viên 2', () => {
  let db: SqliteDatabase;
  let authService: AuthUserService;
  let activityService: ActivityService;
  let managerId: number;

  beforeEach(() => {
    db = createDatabase(':memory:');
    authService = new AuthUserService(db);
    activityService = new ActivityService(db);

    const mgr = authService.registerManager({
      email: 'mgr2@gmail.com',
      fullName: 'Nguyễn Quản Lý',
      dob: '1993-04-20',
      phone: '0905999111',
      address: 'Huế',
      password: 'password123'
    }).user;
    db.prepare("UPDATE users SET status = 'ACTIVE' WHERE id = ?").run(mgr.id);
    managerId = mgr.id;
  });

  it('createActivity() & listPublicActivities(): hoạt động mới tạo ở trạng thái chờ duyệt và chỉ hiện công khai sau khi được duyệt', () => {
    // 1. Arrange
    const start = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const end = new Date(Date.now() + 76 * 3600 * 1000).toISOString();

    // 2. Act
    const created = activityService.createActivity(managerId, {
      title: 'Ngày hội Sách cũ',
      description: 'Thu gom và phân loại sách giáo trình cho tân sinh viên.',
      coverImage: '/uploads/cover-green-sunday.svg',
      location: 'Thư viện',
      startTime: start,
      endTime: end,
      maxParticipants: 15,
      trainingPoints: 6
    });
    const publicBeforeApprove = activityService.listPublicActivities();
    db.prepare("UPDATE activities SET status = 'APPROVED' WHERE id = ?").run(created.id);
    const publicAfterApprove = activityService.listPublicActivities({ search: 'Sách cũ' });

    // 3. Assert
    expect(created.status).toBe('PENDING_APPROVAL');
    expect(publicBeforeApprove.length).toBe(0);
    expect(publicAfterApprove.length).toBe(1);
    expect(publicAfterApprove[0].manager_phone).toBe('0905999111');
  });

  it('requestCancelActivity(): gửi yêu cầu hủy khi hợp lệ và chặn khi hoạt động đã bị từ chối hoặc đã kết thúc', () => {
    // 1. Arrange
    const start = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const end = new Date(Date.now() + 76 * 3600 * 1000).toISOString();
    const created = activityService.createActivity(managerId, {
      title: 'Trồng cây đầu xuân',
      description: 'Trồng cây khuôn viên.',
      coverImage: '/uploads/cover-plant-trees.svg',
      location: 'Sân sau',
      startTime: start,
      endTime: end,
      maxParticipants: 10,
      trainingPoints: 4
    });
    db.prepare("UPDATE activities SET status = 'APPROVED' WHERE id = ?").run(created.id);

    const rejectedAct = activityService.createActivity(managerId, {
      title: 'Hoạt động bị từ chối',
      description: 'Mô tả.',
      coverImage: '/uploads/cover-plant-trees.svg',
      location: 'Sân sau',
      startTime: start,
      endTime: end,
      maxParticipants: 10,
      trainingPoints: 4
    });
    db.prepare("UPDATE activities SET status = 'REJECTED', reject_reason = 'Chưa đạt' WHERE id = ?").run(rejectedAct.id);

    // 2. Act
    const cancelRequested = activityService.requestCancelActivity(
      managerId,
      created.id,
      'Dự báo thời tiết có bão lớn không đảm bảo an toàn.'
    );

    // 3. Assert
    expect(cancelRequested.status).toBe('CANCEL_REQUESTED');
    expect(cancelRequested.cancel_reason).toContain('bão lớn');
    expect(() =>
      activityService.requestCancelActivity(managerId, rejectedAct.id, 'Xin hủy')
    ).toThrow(/đã bị Admin từ chối/);
    expect(() =>
      activityService.requestCancelActivity(
        managerId,
        created.id,
        'Xin hủy muộn',
        new Date(Date.now() + 80 * 3600 * 1000)
      )
    ).toThrow(/đã được gửi|đã kết thúc/);
  });

  it('getManagerActivityDetail() & exportManagerActivityCsv(): danh sách sinh viên của hoạt động không chứa Email sinh viên', () => {
    // 1. Arrange
    const sv = authService.registerStudent({
      email: 'private.sv@gmail.com',
      studentCode: '22T1020555',
      fullName: 'Phạm Bảo Anh',
      dob: '2005-07-12',
      phone: '0933445566',
      password: 'password123'
    }).user;

    const start = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const end = new Date(Date.now() + 76 * 3600 * 1000).toISOString();
    const act = activityService.createActivity(managerId, {
      title: 'Chủ nhật xanh',
      description: 'Dọn dẹp khuôn viên',
      coverImage: '/uploads/cover-green-sunday.svg',
      location: 'Sân chính',
      startTime: start,
      endTime: end,
      maxParticipants: 20,
      trainingPoints: 5
    });
    db.prepare("UPDATE activities SET status = 'APPROVED' WHERE id = ?").run(act.id);
    db.prepare(
      "INSERT INTO registrations (activity_id, student_id, note_to_manager, status) VALUES (?, ?, 'Em xin tham gia', 'APPROVED')"
    ).run(act.id, sv.id);

    // 2. Act
    const detail = activityService.getManagerActivityDetail(managerId, act.id);
    const csv = activityService.exportManagerActivityCsv(managerId, act.id);

    // 3. Assert
    expect(detail.registrations.length).toBe(1);
    expect('email' in detail.registrations[0]).toBe(false);
    expect(csv).toContain('22T1020555');
    expect(csv).not.toContain('private.sv@gmail.com');
  });

  it('requestCancelActivity(), updateRejectedActivity() & getPublicActivityDetail(): chặn hủy khi PENDING_APPROVAL, validate sửa lại và ẩn hoạt động chưa duyệt', () => {
    // 1. Arrange
    const start = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    const end = new Date(Date.now() + 76 * 3600 * 1000).toISOString();
    const pendingAct = activityService.createActivity(managerId, {
      title: 'Hoạt động đang chờ Admin',
      description: 'Mô tả',
      coverImage: '/uploads/cover-green-sunday.svg',
      location: 'Hội trường A',
      startTime: start,
      endTime: end,
      maxParticipants: 20,
      trainingPoints: 5
    });

    const rejectedAct = activityService.createActivity(managerId, {
      title: 'Hoạt động bị từ chối cần sửa',
      description: 'Mô tả',
      coverImage: '/uploads/cover-green-sunday.svg',
      location: 'Sân trường',
      startTime: start,
      endTime: end,
      maxParticipants: 15,
      trainingPoints: 4
    });
    db.prepare("UPDATE activities SET status = 'REJECTED', reject_reason = 'Sửa lại điểm và địa điểm' WHERE id = ?").run(rejectedAct.id);

    // 2. Act & 3. Assert
    expect(() => activityService.getPublicActivityDetail(pendingAct.id)).toThrow(
      /Không tìm thấy hoạt động/
    );
    expect(() =>
      activityService.requestCancelActivity(managerId, pendingAct.id, 'Xin hủy khi chưa duyệt')
    ).toThrow(/đang chờ Admin phê duyệt/);
    expect(() =>
      activityService.updateRejectedActivity(managerId, rejectedAct.id, { trainingPoints: 99 })
    ).toThrow(/Điểm rèn luyện phải từ 0 đến 20/);

    const updated = activityService.updateRejectedActivity(managerId, rejectedAct.id, {
      location: 'Hội trường B',
      trainingPoints: 6
    });
    expect(updated.status).toBe('PENDING_APPROVAL');
    expect(updated.training_points).toBe(6);
  });
});
