import React, { useCallback, useEffect, useState } from 'react';
import QRCode from 'qrcode';
import {
  Ban,
  Calendar,
  Check,
  CheckCircle2,
  Clock,
  Download,
  Edit3,
  Eye,
  EyeOff,
  KeyRound,
  MapPin,
  Maximize2,
  MessageSquare,
  QrCode,
  RefreshCw,
  UserCheck,
  Users,
  X
} from 'lucide-react';
import { apiFetch, getStoredToken } from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import {
  Activity,
  AttendanceSessionInfo,
  AttendanceStudentRecord
} from '../../types';
import { formatDateOnly, formatDateTime, formatRemainingTime } from '../../utils/format';

interface ManagerStudentReg {
  registration_id: number;
  registration_status: string;
  note_to_manager: string | null;
  cancel_reason: string | null;
  registered_at: string;
  student_id: number;
  full_name: string;
  student_code: string;
  dob: string | null;
  phone: string;
  address: string | null;
  total_points: number;
  proof_status: string | null;
}

interface ManagerWaitlistStudent {
  waitlist_id: number;
  waitlist_status: string;
  note_to_manager: string | null;
  notified_at: string | null;
  created_at: string;
  queue_position: number;
  student_id: number;
  full_name: string;
  student_code: string;
  dob: string | null;
  phone: string;
  address: string | null;
  total_points: number;
}

export const ManagerActivitiesPage: React.FC = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [selectedActivityId, setSelectedActivityId] = useState<number | null>(null);
  const [detailActivity, setDetailActivity] = useState<Activity | null>(null);
  const [registrations, setRegistrations] = useState<ManagerStudentReg[]>([]);
  const [waitlist, setWaitlist] = useState<ManagerWaitlistStudent[]>([]);
  const [regTab, setRegTab] = useState<
    'PENDING' | 'CANCEL_REQUESTED' | 'WAITLIST' | 'ATTENDANCE' | 'ALL'
  >('PENDING');

  const [attendanceSession, setAttendanceSession] = useState<AttendanceSessionInfo | null>(null);
  const [attendanceRecords, setAttendanceRecords] = useState<AttendanceStudentRecord[]>([]);
  const [attendanceSummary, setAttendanceSummary] = useState({
    totalApproved: 0,
    checkedInCount: 0,
    absentCount: 0
  });
  const [qrDataUrl, setQrDataUrl] = useState('');
  const [sessionMode, setSessionMode] = useState<'STATIC' | 'ROTATING'>('STATIC');
  const [sessionDuration, setSessionDuration] = useState<'15' | '30' | '60' | 'UNTIL_END'>('30');
  const [clockOffsetMs, setClockOffsetMs] = useState(0);
  const [nowTick, setNowTick] = useState(Date.now());
  const [projectorOpen, setProjectorOpen] = useState(false);
  const [attendanceLoading, setAttendanceLoading] = useState(false);

  const [studentModalData, setStudentModalData] = useState<any | null>(null);

  const [cancelModalOpen, setCancelModalOpen] = useState(false);
  const [cancelReason, setCancelReason] = useState('');

  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editTitle, setEditTitle] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editMaxParticipants, setEditMaxParticipants] = useState(30);
  const [editTrainingPoints, setEditTrainingPoints] = useState(5);
  const [editDescription, setEditDescription] = useState('');

  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadActivities = async () => {
    try {
      const res = await apiFetch<{ activities: Activity[] }>('/manager/activities');
      setActivities(res.activities);
      if (res.activities.length > 0 && !selectedActivityId) {
        setSelectedActivityId(res.activities[0].id);
      }
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const loadActivityDetail = async (id: number) => {
    try {
      const res = await apiFetch<{
        activity: Activity;
        registrations: ManagerStudentReg[];
        waitlist?: ManagerWaitlistStudent[];
      }>(`/manager/activities/${id}`);
      setDetailActivity(res.activity);
      setRegistrations(res.registrations);
      setWaitlist(res.waitlist || []);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const loadAttendanceState = useCallback(async (activityId: number) => {
    setAttendanceLoading(true);
    try {
      const res = await apiFetch<{
        session: AttendanceSessionInfo | null;
        summary: { totalApproved: number; checkedInCount: number; absentCount: number };
        records: AttendanceStudentRecord[];
        server_time: string;
      }>(`/manager/activities/${activityId}/attendance`);
      setAttendanceSession(res.session);
      setAttendanceSummary(res.summary);
      setAttendanceRecords(res.records);
      if (res.server_time) {
        setClockOffsetMs(new Date(res.server_time).getTime() - Date.now());
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setAttendanceLoading(false);
    }
  }, []);

  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selectedActivityId) {
      loadActivityDetail(selectedActivityId);
      setAttendanceSession(null);
      setQrDataUrl('');
      setProjectorOpen(false);
      loadAttendanceState(selectedActivityId);
    }
  }, [selectedActivityId, loadAttendanceState]);

  useEffect(() => {
    if (!attendanceSession?.is_active || !detailActivity) {
      setQrDataUrl('');
      return;
    }
    const checkInUrl = `${window.location.origin}/?checkinActivity=${detailActivity.id}&pin=${attendanceSession.current_pin}`;
    QRCode.toDataURL(checkInUrl, {
      width: 280,
      margin: 2,
      color: { dark: '#0F2557', light: '#FFFFFF' }
    })
      .then((url) => setQrDataUrl(url))
      .catch(() => setQrDataUrl(''));
  }, [attendanceSession?.current_pin, attendanceSession?.is_active, detailActivity]);

  useEffect(() => {
    if ((regTab !== 'ATTENDANCE' && !projectorOpen) || !attendanceSession?.is_active) {
      return;
    }
    const tickTimer = window.setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    const pollTimer = window.setInterval(() => {
      if (selectedActivityId) {
        loadAttendanceState(selectedActivityId);
      }
    }, 10000);
    return () => {
      window.clearInterval(tickTimer);
      window.clearInterval(pollTimer);
    };
  }, [regTab, projectorOpen, attendanceSession?.is_active, selectedActivityId, loadAttendanceState]);

  useEffect(() => {
    if (
      !attendanceSession?.is_active ||
      attendanceSession.mode !== 'ROTATING' ||
      !attendanceSession.next_rotate_at ||
      !selectedActivityId
    ) {
      return;
    }
    const serverNow = Date.now() + clockOffsetMs;
    const msUntilRotate = new Date(attendanceSession.next_rotate_at).getTime() - serverNow;
    const delayMs = Math.max(800, msUntilRotate + 250);
    const rotateTimer = window.setTimeout(() => {
      loadAttendanceState(selectedActivityId);
    }, delayMs);
    return () => window.clearTimeout(rotateTimer);
  }, [
    attendanceSession?.is_active,
    attendanceSession?.mode,
    attendanceSession?.next_rotate_at,
    attendanceSession?.current_pin,
    clockOffsetMs,
    selectedActivityId,
    loadAttendanceState
  ]);

  const handleOpenAttendanceSession = async () => {
    if (!detailActivity) return;
    setMsg('');
    setErr('');
    try {
      const payload =
        sessionDuration === 'UNTIL_END'
          ? { mode: sessionMode, untilEnd: true, rotateSeconds: 60 }
          : { mode: sessionMode, durationMinutes: Number(sessionDuration), rotateSeconds: 60 };
      const res = await apiFetch<{ message: string; session: AttendanceSessionInfo }>(
        `/manager/activities/${detailActivity.id}/attendance/open`,
        {
          method: 'POST',
          body: JSON.stringify(payload)
        }
      );
      setMsg(res.message);
      await loadAttendanceState(detailActivity.id);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleRotatePin = async () => {
    if (!detailActivity) return;
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/manager/activities/${detailActivity.id}/attendance/rotate`,
        { method: 'POST' }
      );
      setMsg(res.message);
      await loadAttendanceState(detailActivity.id);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleCloseAttendanceSession = async () => {
    if (!detailActivity) return;
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/manager/activities/${detailActivity.id}/attendance/close`,
        { method: 'POST' }
      );
      setMsg(res.message);
      setProjectorOpen(false);
      await loadAttendanceState(detailActivity.id);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleManualCheckIn = async (registrationId: number) => {
    if (!detailActivity) return;
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/manager/registrations/${registrationId}/manual-checkin`,
        { method: 'POST' }
      );
      setMsg(res.message);
      await loadAttendanceState(detailActivity.id);
      await loadActivityDetail(detailActivity.id);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleUndoManualCheckIn = async (registrationId: number) => {
    if (!detailActivity) return;
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/manager/registrations/${registrationId}/manual-checkin`,
        { method: 'DELETE' }
      );
      setMsg(res.message);
      await loadAttendanceState(detailActivity.id);
      await loadActivityDetail(detailActivity.id);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleReviewRegistration = async (
    registrationId: number,
    decision: 'APPROVE' | 'REJECT'
  ) => {
    let rejectReason = '';
    if (decision === 'REJECT') {
      const input = window.prompt('Nhập lý do từ chối (tùy chọn):');
      if (input === null) return;
      rejectReason = input;
    }
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/manager/registrations/${registrationId}/review`,
        {
          method: 'POST',
          body: JSON.stringify({ decision, rejectReason })
        }
      );
      setMsg(res.message);
      if (selectedActivityId) {
        await Promise.all([
          loadActivityDetail(selectedActivityId),
          loadAttendanceState(selectedActivityId)
        ]);
      }
      await loadActivities();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleReviewCancel = async (registrationId: number, decision: 'APPROVE' | 'REJECT') => {
    let note = '';
    if (decision === 'REJECT') {
      const input = window.prompt('Nhập lý do không đồng ý hủy:');
      if (input === null) return;
      note = input;
    }
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/manager/registrations/${registrationId}/review-cancel`,
        {
          method: 'POST',
          body: JSON.stringify({ decision, note })
        }
      );
      setMsg(res.message);
      if (selectedActivityId) {
        await Promise.all([
          loadActivityDetail(selectedActivityId),
          loadAttendanceState(selectedActivityId)
        ]);
      }
      await loadActivities();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleOpenStudentDetail = async (studentId: number) => {
    setErr('');
    try {
      const res = await apiFetch(`/manager/students/${studentId}`);
      setStudentModalData(res);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleRequestCancelActivity = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!detailActivity) return;
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/manager/activities/${detailActivity.id}/cancel-request`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: cancelReason })
        }
      );
      setCancelModalOpen(false);
      setCancelReason('');
      setMsg(res.message);
      await loadActivities();
      await loadActivityDetail(detailActivity.id);
    } catch (error: any) {
      setErr(error.message);
    }
  };

  const handleDownloadCsv = async (activityId: number) => {
    setErr('');
    try {
      const token = getStoredToken();
      const res = await fetch(`/api/manager/activities/${activityId}/export-csv`, {
        headers: token ? { Authorization: `Bearer ${token}` } : {}
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Không thể xuất file CSV.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `sinh-vien-hoat-dong-${activityId}.csv`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const filteredRegs = registrations.filter((r) =>
    regTab === 'ALL' ? true : r.registration_status === regTab
  );

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1E3A8A]">
          Quản lý Hoạt động &amp; Sinh viên đã đăng ký
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Chọn một hoạt động bên trái để xem thời gian diễn ra, số lượng sinh viên, duyệt đăng ký /
          duyệt hủy và xem thông tin chi tiết sinh viên (bảo mật ẩn Email của sinh viên).
        </p>
      </div>

      {msg && (
        <div className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold">
          {msg}
        </div>
      )}
      {err && (
        <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-semibold">
          {err}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-4 space-y-3">
          {activities.map((act) => (
            <button
              key={act.id}
              onClick={() => setSelectedActivityId(act.id)}
              className={`w-full text-left p-4 rounded-2xl border transition-all space-y-2 ${
                selectedActivityId === act.id
                  ? 'border-blue-500 bg-blue-50/70 shadow-sm'
                  : 'border-slate-200 bg-white hover:border-blue-300'
              }`}
            >
              <div className="flex items-center justify-between gap-2">
                <StatusBadge status={act.status} />
                <span className="font-mono-data text-xs font-bold text-amber-700">
                  +{act.training_points} đ
                </span>
              </div>
              <div className="font-bold text-slate-900 text-sm line-clamp-2">{act.title}</div>
              <div className="text-xs text-slate-600 flex items-center justify-between gap-2">
                <span>
                  Đã duyệt: <strong className="font-mono-data">{act.approved_count ?? 0}</strong>/
                  <span className="font-mono-data">{act.max_participants}</span>
                </span>
                <span className="flex items-center gap-1.5">
                  {(act.pending_count ?? 0) > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 font-semibold">
                      {act.pending_count} chờ duyệt
                    </span>
                  )}
                  {(act.waitlist_count ?? 0) > 0 && (
                    <span className="px-2 py-0.5 rounded-full bg-indigo-100 text-indigo-800 font-semibold">
                      {act.waitlist_count} hàng chờ
                    </span>
                  )}
                </span>
              </div>
            </button>
          ))}
        </div>

        <div className="lg:col-span-8">
          {!detailActivity ? (
            <div className="bg-white rounded-3xl border border-blue-100 p-10 text-center text-slate-500">
              Chọn một hoạt động để xem chi tiết.
            </div>
          ) : (
            <div className="bg-white rounded-3xl border border-blue-100 p-6 shadow-xs space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={detailActivity.status} />
                    <span className="font-mono-data text-xs font-bold text-amber-700">
                      +{detailActivity.training_points} điểm rèn luyện
                    </span>
                  </div>
                  <h2 className="text-xl font-extrabold text-slate-900">{detailActivity.title}</h2>
                  <div className="text-xs text-slate-600 flex flex-wrap gap-4">
                    <span className="inline-flex items-center gap-1">
                      <Calendar className="w-3.5 h-3.5 text-blue-600" />
                      {formatDateTime(detailActivity.start_time)} →{' '}
                      {formatDateTime(detailActivity.end_time)}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <MapPin className="w-3.5 h-3.5 text-blue-600" />
                      {detailActivity.location}
                    </span>
                    <span className="inline-flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-blue-600" />
                      {detailActivity.approved_count ?? 0}/{detailActivity.max_participants} sinh
                      viên
                    </span>
                  </div>
                  {detailActivity.reject_reason && (
                    <div className="text-xs text-rose-700 bg-rose-50 px-3 py-1.5 rounded-lg mt-2">
                      <strong>Ghi chú từ Admin:</strong> {detailActivity.reject_reason}
                    </div>
                  )}
                </div>

                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => handleDownloadCsv(detailActivity.id)}
                    className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    Xuất CSV
                  </button>
                  {detailActivity.status === 'REJECTED' && (
                    <button
                      onClick={() => {
                        setEditTitle(detailActivity.title);
                        setEditLocation(detailActivity.location);
                        setEditMaxParticipants(detailActivity.max_participants);
                        setEditTrainingPoints(detailActivity.training_points);
                        setEditDescription(detailActivity.description);
                        setEditModalOpen(true);
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-blue-300 bg-blue-50 text-xs font-semibold text-blue-700 hover:bg-blue-100"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      Sửa &amp; Gửi duyệt lại
                    </button>
                  )}
                  {detailActivity.status === 'APPROVED' &&
                    new Date(detailActivity.end_time).getTime() > Date.now() && (
                      <button
                        onClick={() => setCancelModalOpen(true)}
                        className="inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border border-rose-300 bg-rose-50 text-xs font-semibold text-rose-700 hover:bg-rose-100"
                      >
                        <Ban className="w-3.5 h-3.5" />
                        Gửi Admin yêu cầu hủy
                      </button>
                    )}
                </div>
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  onClick={() => setRegTab('PENDING')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border ${
                    regTab === 'PENDING'
                      ? 'bg-blue-600 text-white border-blue-600'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  Chờ duyệt đăng ký (
                  {registrations.filter((r) => r.registration_status === 'PENDING').length})
                </button>
                <button
                  onClick={() => setRegTab('CANCEL_REQUESTED')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border ${
                    regTab === 'CANCEL_REQUESTED'
                      ? 'bg-orange-600 text-white border-orange-600'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  Yêu cầu xin hủy (
                  {registrations.filter((r) => r.registration_status === 'CANCEL_REQUESTED').length})
                </button>
                <button
                  onClick={() => setRegTab('WAITLIST')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border ${
                    regTab === 'WAITLIST'
                      ? 'bg-indigo-600 text-white border-indigo-600'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  Danh sách chờ ({waitlist.length})
                </button>
                <button
                  onClick={() => {
                    setRegTab('ATTENDANCE');
                    if (selectedActivityId) {
                      loadAttendanceState(selectedActivityId);
                    }
                  }}
                  className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold border ${
                    regTab === 'ATTENDANCE'
                      ? 'bg-[#0F2557] text-white border-[#0F2557]'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  <QrCode className="w-3.5 h-3.5" />
                  Điểm danh (PIN / QR) ({attendanceSummary.checkedInCount}/
                  {attendanceSummary.totalApproved})
                </button>
                <button
                  onClick={() => setRegTab('ALL')}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-bold border ${
                    regTab === 'ALL'
                      ? 'bg-[#1E3A8A] text-white border-[#1E3A8A]'
                      : 'bg-white text-slate-700 border-slate-200'
                  }`}
                >
                  Tất cả sinh viên ({registrations.length})
                </button>
              </div>

              {regTab === 'ATTENDANCE' ? (
                <div className="space-y-5">
                  {/* Phiên điểm danh PIN / QR */}
                  <div className="p-5 rounded-2xl bg-[#F4F7FB] border border-blue-200 space-y-4">
                    {attendanceLoading && !attendanceSession && attendanceRecords.length === 0 ? (
                      <div className="text-center py-4 text-sm text-slate-500">
                        Đang tải trạng thái điểm danh...
                      </div>
                    ) : attendanceSession?.is_active ? (
                      <div className="grid grid-cols-1 md:grid-cols-12 gap-5 items-center">
                        <div className="md:col-span-5 flex flex-col items-center justify-center bg-white p-4 rounded-2xl border border-blue-100 shadow-xs space-y-2">
                          {qrDataUrl ? (
                            <img
                              src={qrDataUrl}
                              alt="Mã QR điểm danh"
                              className="w-48 h-48 object-contain"
                            />
                          ) : (
                            <div className="w-48 h-48 bg-slate-100 rounded-xl flex items-center justify-center text-xs text-slate-500">
                              Đang tạo mã QR...
                            </div>
                          )}
                          <span className="text-[11px] text-slate-500 text-center">
                            Sinh viên quét bằng Camera / Zalo để tự điền PIN
                          </span>
                        </div>

                        <div className="md:col-span-7 space-y-3">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-100 text-emerald-800 text-xs font-bold border border-emerald-200">
                              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                              Đang mở điểm danh
                            </span>
                            <span className="px-3 py-1 rounded-full bg-blue-100 text-[#1E3A8A] text-xs font-bold">
                              {attendanceSession.mode === 'ROTATING'
                                ? `Tự xoay mã mỗi ${attendanceSession.rotate_seconds}s (TOTP)`
                                : 'Mã PIN cố định trong phiên'}
                            </span>
                          </div>

                          <div className="bg-white p-4 rounded-2xl border border-blue-200 flex items-center justify-between gap-3">
                            <div>
                              <div className="text-xs font-semibold text-slate-500">
                                Mã PIN điểm danh 6 số
                              </div>
                              <div className="font-mono-data text-3xl sm:text-4xl font-extrabold tracking-[0.22em] text-[#0F2557] mt-1">
                                {attendanceSession.current_pin}
                              </div>
                            </div>
                            <KeyRound className="w-8 h-8 text-blue-600 shrink-0" />
                          </div>

                          <div className="text-xs text-slate-600 flex flex-wrap items-center gap-3">
                            <span className="inline-flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-blue-600" />
                              Phiên còn:{' '}
                              <strong className="font-mono-data text-slate-900">
                                {formatRemainingTime(
                                  new Date(attendanceSession.expires_at).getTime() -
                                    (nowTick + clockOffsetMs)
                                )}
                              </strong>
                            </span>
                            {attendanceSession.mode === 'ROTATING' &&
                              attendanceSession.next_rotate_at && (
                                <span className="px-2.5 py-0.5 rounded-full bg-amber-100 text-amber-900 font-bold font-mono-data">
                                  Đổi mã sau:{' '}
                                  {Math.max(
                                    0,
                                    Math.ceil(
                                      (new Date(attendanceSession.next_rotate_at).getTime() -
                                        (nowTick + clockOffsetMs)) /
                                        1000
                                    )
                                  )}
                                  s
                                </span>
                              )}
                          </div>

                          <div className="flex flex-wrap gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setProjectorOpen(true)}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-[#0F2557] text-white text-xs font-bold hover:bg-blue-900"
                            >
                              <Maximize2 className="w-3.5 h-3.5" />
                              Phóng to chiếu máy chiếu
                            </button>
                            <button
                              type="button"
                              onClick={handleRotatePin}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-white border border-blue-300 text-[#1E3A8A] text-xs font-bold hover:bg-blue-50"
                            >
                              <RefreshCw className="w-3.5 h-3.5" />
                              Đổi mã PIN mới
                            </button>
                            <button
                              type="button"
                              onClick={handleCloseAttendanceSession}
                              className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-100"
                            >
                              <X className="w-3.5 h-3.5" />
                              Đóng điểm danh
                            </button>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="space-y-4">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div>
                            <h3 className="font-extrabold text-base text-[#1E3A8A] flex items-center gap-2">
                              <QrCode className="w-5 h-5 text-blue-600" />
                              Mở phiên Điểm danh nhanh (PIN 6 số &amp; QR Code)
                            </h3>
                            <p className="text-xs text-slate-600 mt-0.5">
                              Sinh viên cần xác nhận có mặt để mở khóa quyền nộp ảnh minh chứng 48h.
                            </p>
                          </div>
                        </div>

                        {detailActivity.status !== 'APPROVED' ? (
                          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-xs text-amber-900 font-medium">
                            Chỉ mở phiên điểm danh được khi hoạt động ở trạng thái{' '}
                            <strong>Đã duyệt (APPROVED)</strong>.
                          </div>
                        ) : new Date(detailActivity.end_time).getTime() <= Date.now() ? (
                          <div className="p-3 rounded-xl bg-slate-100 border border-slate-200 text-xs text-slate-700 font-medium">
                            Hoạt động đã kết thúc. Bạn vẫn có thể sử dụng nút{' '}
                            <strong>Điểm danh thủ công</strong> bên dưới cho các sinh viên có tham
                            gia nhưng gặp sự cố khi quét mã.
                          </div>
                        ) : (
                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end">
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Chế độ bảo mật mã
                              </label>
                              <select
                                value={sessionMode}
                                onChange={(e) =>
                                  setSessionMode(e.target.value as 'STATIC' | 'ROTATING')
                                }
                                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                              >
                                <option value="STATIC">
                                  Mã cố định theo phiên (Khuyên dùng ngoài trời)
                                </option>
                                <option value="ROTATING">
                                  Tự động xoay mã mỗi 60 giây (Chống chụp gửi bạn)
                                </option>
                              </select>
                            </div>
                            <div>
                              <label className="block text-xs font-bold text-slate-700 mb-1">
                                Thời lượng mở điểm danh
                              </label>
                              <select
                                value={sessionDuration}
                                onChange={(e) =>
                                  setSessionDuration(
                                    e.target.value as '15' | '30' | '60' | 'UNTIL_END'
                                  )
                                }
                                className="w-full px-3 py-2 rounded-xl border border-slate-300 text-xs font-semibold bg-white"
                              >
                                <option value="15">15 phút</option>
                                <option value="30">30 phút</option>
                                <option value="60">60 phút</option>
                                <option value="UNTIL_END">Đến hết giờ kết thúc</option>
                              </select>
                            </div>
                            <button
                              type="button"
                              onClick={handleOpenAttendanceSession}
                              className="w-full py-2.5 px-4 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 inline-flex items-center justify-center gap-1.5"
                            >
                              <QrCode className="w-4 h-4" />
                              Mở điểm danh (PIN &amp; QR)
                            </button>
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  {/* Thống kê & Danh sách điểm danh trực tiếp */}
                  <div className="space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="font-bold text-sm text-slate-800">
                        Tình hình Điểm danh Sinh viên đã duyệt
                      </h4>
                      <div className="flex items-center gap-2 text-xs font-bold">
                        <span className="px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800">
                          Đã có mặt: {attendanceSummary.checkedInCount}
                        </span>
                        <span className="px-2.5 py-1 rounded-full bg-slate-100 text-slate-700">
                          Chưa điểm danh: {attendanceSummary.absentCount}
                        </span>
                      </div>
                    </div>

                    {attendanceRecords.length === 0 ? (
                      <div className="py-8 text-center text-sm text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                        Chưa có sinh viên nào được duyệt tham gia hoạt động này.
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {attendanceRecords.map((rec) => (
                          <div
                            key={rec.registration_id}
                            className="p-3.5 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                          >
                            <div className="space-y-0.5">
                              <div className="flex flex-wrap items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => handleOpenStudentDetail(rec.student_id)}
                                  className="font-bold text-sm text-slate-900 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
                                >
                                  {rec.full_name} (
                                  <span className="font-mono-data">{rec.student_code}</span>)
                                  <Eye className="w-3.5 h-3.5 text-blue-600" />
                                </button>
                                {rec.checked_in_at ? (
                                  <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                                    <CheckCircle2 className="w-3.5 h-3.5" />
                                    Có mặt (
                                    {rec.checkin_method === 'MANUAL'
                                      ? 'Thủ công'
                                      : rec.checkin_method}
                                    )
                                  </span>
                                ) : (
                                  <span className="px-2.5 py-0.5 rounded-full text-xs font-semibold bg-slate-100 text-slate-600 border border-slate-200">
                                    Chưa điểm danh
                                  </span>
                                )}
                              </div>
                              <div className="text-xs text-slate-500">
                                SĐT: <span className="font-mono-data">{rec.phone}</span>
                                {rec.checked_in_at &&
                                  ` • Điểm danh lúc: ${formatDateTime(rec.checked_in_at)}`}
                              </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                              {!rec.checked_in_at ? (
                                <button
                                  type="button"
                                  onClick={() => handleManualCheckIn(rec.registration_id)}
                                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-[#1E3A8A] text-xs font-bold hover:bg-blue-100"
                                >
                                  <UserCheck className="w-3.5 h-3.5" />
                                  Điểm danh thủ công
                                </button>
                              ) : rec.proof_status !== 'CONFIRMED' ? (
                                <button
                                  type="button"
                                  onClick={() => handleUndoManualCheckIn(rec.registration_id)}
                                  className="px-3 py-1.5 rounded-xl border border-slate-300 text-slate-600 text-xs font-semibold hover:bg-slate-50"
                                >
                                  Hủy điểm danh
                                </button>
                              ) : (
                                <span className="text-[11px] font-semibold text-emerald-700">
                                  Đã cộng điểm
                                </span>
                              )}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ) : regTab === 'WAITLIST' ? (
                waitlist.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                    Chưa có sinh viên nào trong danh sách chờ của hoạt động này.
                  </div>
                ) : (
                  <div className="space-y-3">
                    {waitlist.map((w) => (
                      <div
                        key={w.waitlist_id}
                        className="p-4 rounded-2xl border border-indigo-200 bg-indigo-50/30 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                      >
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono-data text-xs font-extrabold px-2 py-0.5 rounded-lg bg-indigo-600 text-white">
                              #{w.queue_position}
                            </span>
                            <button
                              onClick={() => handleOpenStudentDetail(w.student_id)}
                              className="font-bold text-slate-900 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
                              title="Nhấn vào để xem tất cả thông tin sinh viên (trừ Email)"
                            >
                              {w.full_name} (<span className="font-mono-data">{w.student_code}</span>)
                              <Eye className="w-3.5 h-3.5 text-blue-600" />
                            </button>
                            <StatusBadge status={w.waitlist_status} />
                          </div>
                          <div className="text-xs text-slate-600">
                            SĐT: <strong className="font-mono-data">{w.phone}</strong> • Tổng điểm
                            RL: <strong className="font-mono-data">{w.total_points} đ</strong>
                          </div>
                          {w.note_to_manager && (
                            <div className="text-xs text-slate-700 bg-white px-2.5 py-1.5 rounded-lg inline-flex items-start gap-1.5 border border-indigo-100">
                              <MessageSquare className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                              <span>
                                <strong>Lời nhắn SV:</strong> {w.note_to_manager}
                              </span>
                            </div>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )
              ) : filteredRegs.length === 0 ? (
                <div className="py-8 text-center text-sm text-slate-500 bg-slate-50 rounded-2xl border border-dashed border-slate-200">
                  Không có sinh viên nào trong mục này.
                </div>
              ) : (
                <div className="space-y-3">
                  {filteredRegs.map((reg) => (
                    <div
                      key={reg.registration_id}
                      className="p-4 rounded-2xl border border-slate-200 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:border-blue-300"
                    >
                      <div className="space-y-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <button
                            onClick={() => handleOpenStudentDetail(reg.student_id)}
                            className="font-bold text-slate-900 hover:text-blue-700 hover:underline inline-flex items-center gap-1"
                            title="Nhấn vào để xem tất cả thông tin sinh viên (trừ Email)"
                          >
                            {reg.full_name} (<span className="font-mono-data">{reg.student_code}</span>)
                            <Eye className="w-3.5 h-3.5 text-blue-600" />
                          </button>
                          <StatusBadge status={reg.registration_status} />
                        </div>
                        <div className="text-xs text-slate-600">
                          SĐT: <strong className="font-mono-data">{reg.phone}</strong> • Tổng điểm
                          RL: <strong className="font-mono-data">{reg.total_points} đ</strong>
                        </div>
                        {reg.note_to_manager && (
                          <div className="text-xs text-slate-700 bg-slate-50 px-2.5 py-1.5 rounded-lg inline-flex items-start gap-1.5">
                            <MessageSquare className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                            <span>
                              <strong>Lời nhắn SV:</strong> {reg.note_to_manager}
                            </span>
                          </div>
                        )}
                        {reg.cancel_reason && reg.registration_status === 'CANCEL_REQUESTED' && (
                          <div className="text-xs text-orange-800 bg-orange-50 px-2.5 py-1.5 rounded-lg">
                            <strong>Lý do xin hủy:</strong> {reg.cancel_reason}
                          </div>
                        )}
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {reg.registration_status === 'PENDING' && (
                          <>
                            <button
                              onClick={() => handleReviewRegistration(reg.registration_id, 'APPROVE')}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                            >
                              <Check className="w-3.5 h-3.5" />
                              Duyệt
                            </button>
                            <button
                              onClick={() => handleReviewRegistration(reg.registration_id, 'REJECT')}
                              className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-100"
                            >
                              <X className="w-3.5 h-3.5" />
                              Từ chối
                            </button>
                          </>
                        )}

                        {reg.registration_status === 'CANCEL_REQUESTED' && (
                          <>
                            <button
                              onClick={() => handleReviewCancel(reg.registration_id, 'APPROVE')}
                              className="px-3 py-1.5 rounded-lg bg-orange-600 text-white text-xs font-bold hover:bg-orange-700"
                            >
                              Đồng ý hủy
                            </button>
                            <button
                              onClick={() => handleReviewCancel(reg.registration_id, 'REJECT')}
                              className="px-3 py-1.5 rounded-lg border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
                            >
                              Từ chối hủy
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal Chi tiết Sinh viên dành cho Quản lý (ẨN HOÀN TOÀN EMAIL) */}
      {studentModalData && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-blue-100 space-y-4">
            <div className="flex items-start justify-between">
              <div>
                <h3 className="text-lg font-extrabold text-slate-900">
                  Thông tin Chi tiết Sinh viên
                </h3>
                <p className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <EyeOff className="w-3.5 h-3.5 text-amber-600" />
                  Email của sinh viên được ẩn theo quy định bảo mật đối với Quản lý
                </p>
              </div>
              <button
                onClick={() => setStudentModalData(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 gap-3 bg-[#F4F7FB] p-4 rounded-2xl border border-blue-100 text-sm">
              <div>
                <div className="text-xs text-slate-500">Họ và tên</div>
                <div className="font-bold text-slate-900">{studentModalData.student.full_name}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Mã sinh viên</div>
                <div className="font-mono-data font-bold text-slate-900">
                  {studentModalData.student.student_code}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Số điện thoại</div>
                <div className="font-mono-data font-semibold text-slate-800">
                  {studentModalData.student.phone}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Ngày sinh</div>
                <div className="font-semibold text-slate-800">
                  {formatDateOnly(studentModalData.student.dob)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Địa chỉ</div>
                <div className="font-medium text-slate-800">
                  {studentModalData.student.address || 'Chưa cập nhật'}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Tổng điểm RL hiện có</div>
                <div className="font-mono-data font-bold text-blue-700">
                  {studentModalData.student.total_points} điểm
                </div>
              </div>
              <div className="col-span-2 pt-2 border-t border-blue-200/70 text-xs text-amber-700 font-medium">
                Email của sinh viên: [Đã ẩn quyền xem đối với Quản lý hoạt động]
              </div>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              <div className="text-xs font-bold text-slate-700 uppercase">
                Lịch sử đăng ký trong các hoạt động của bạn
              </div>
              {studentModalData.registrations.length === 0 ? (
                <div className="p-3 rounded-xl border border-dashed border-slate-200 text-xs text-slate-500">
                  Sinh viên hiện chỉ đang nằm trong danh sách chờ của hoạt động bạn quản lý.
                </div>
              ) : (
                studentModalData.registrations.map((r: any) => (
                  <div
                    key={r.registration_id}
                    className="p-3 rounded-xl border border-slate-200 text-xs space-y-1"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-slate-800">{r.activity_title}</span>
                      <StatusBadge status={r.registration_status} />
                    </div>
                    {r.note_to_manager && (
                      <div className="text-slate-600">Lời nhắn: {r.note_to_manager}</div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* Modal Yêu cầu Hủy Hoạt động gửi Admin */}
      {cancelModalOpen && detailActivity && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleRequestCancelActivity}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">
                Gửi Admin Yêu cầu Hủy Hoạt động
              </h3>
              <button
                type="button"
                onClick={() => {
                  setCancelModalOpen(false);
                  setErr('');
                }}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {err && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                {err}
              </div>
            )}
            <p className="text-xs text-slate-600">
              Hoạt động: <strong>{detailActivity.title}</strong>
            </p>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">
                Lý do xin hủy gửi Admin *
              </label>
              <textarea
                rows={3}
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="VD: Thời tiết mưa bão, không đảm bảo an toàn cho sinh viên..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCancelModalOpen(false);
                  setErr('');
                }}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm"
              >
                Đóng
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-700"
              >
                Gửi yêu cầu hủy
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Sửa & Gửi duyệt lại hoạt động bị từ chối */}
      {editModalOpen && detailActivity && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              setMsg('');
              setErr('');
              try {
                const res = await apiFetch<{ message: string }>(
                  `/manager/activities/${detailActivity.id}`,
                  {
                    method: 'PUT',
                    body: JSON.stringify({
                      title: editTitle,
                      location: editLocation,
                      maxParticipants: Number(editMaxParticipants),
                      trainingPoints: Number(editTrainingPoints),
                      description: editDescription
                    })
                  }
                );
                setEditModalOpen(false);
                setMsg(res.message);
                await loadActivities();
                await loadActivityDetail(detailActivity.id);
              } catch (error: any) {
                setErr(error.message);
              }
            }}
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-blue-100 space-y-4"
          >
            <div className="flex items-start justify-between">
              <h3 className="text-lg font-extrabold text-slate-900">
                Chỉnh sửa &amp; Gửi Admin duyệt lại
              </h3>
              <button
                type="button"
                onClick={() => {
                  setEditModalOpen(false);
                  setErr('');
                }}
                className="p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {err && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                {err}
              </div>
            )}
            <div className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Tên hoạt động</label>
                <input
                  type="text"
                  required
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Địa điểm</label>
                <input
                  type="text"
                  required
                  value={editLocation}
                  onChange={(e) => setEditLocation(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Số lượng SV</label>
                  <input
                    type="number"
                    required
                    min={1}
                    value={editMaxParticipants}
                    onChange={(e) => setEditMaxParticipants(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">Điểm RL</label>
                  <input
                    type="number"
                    required
                    min={0}
                    max={20}
                    value={editTrainingPoints}
                    onChange={(e) => setEditTrainingPoints(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">Mô tả</label>
                <textarea
                  rows={3}
                  required
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setEditModalOpen(false);
                  setErr('');
                }}
                className="px-4 py-2 rounded-xl border border-slate-300 text-sm"
              >
                Đóng
              </button>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"
              >
                Lưu &amp; Gửi duyệt lại
              </button>
            </div>
          </form>
        </div>
      )}

      {/* Modal Phóng to Chiếu Máy Chiếu PIN / QR Điểm danh */}
      {projectorOpen && attendanceSession?.is_active && detailActivity && (
        <div
          className="fixed inset-0 z-50 bg-[#0F2557] text-white flex flex-col items-center justify-center p-6"
          role="dialog"
          aria-modal="true"
        >
          <button
            type="button"
            onClick={() => setProjectorOpen(false)}
            className="absolute top-5 right-5 inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/15 hover:bg-white/25 text-white text-sm font-bold"
          >
            <X className="w-5 h-5" />
            Đóng trình chiếu
          </button>

          <div className="max-w-3xl w-full text-center space-y-6">
            <div className="space-y-2">
              <div className="text-xs font-bold uppercase tracking-widest text-sky-300">
                Điểm danh Sự kiện Tình nguyện UniVolunteer
              </div>
              <h2 className="text-2xl sm:text-4xl font-extrabold leading-tight">
                {detailActivity.title}
              </h2>
            </div>

            <div className="bg-white text-slate-900 rounded-3xl p-6 sm:p-8 shadow-2xl inline-flex flex-col sm:flex-row items-center gap-8">
              {qrDataUrl && (
                <img
                  src={qrDataUrl}
                  alt="QR Điểm danh phóng to"
                  className="w-64 h-64 sm:w-72 sm:h-72 object-contain border border-slate-200 rounded-2xl"
                />
              )}
              <div className="text-center sm:text-left space-y-4">
                <div>
                  <div className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    Hoặc nhập mã PIN 6 số trên Thời khóa biểu
                  </div>
                  <div className="font-mono-data text-5xl sm:text-6xl font-extrabold tracking-[0.2em] text-[#0F2557] mt-2">
                    {attendanceSession.current_pin}
                  </div>
                </div>

                <div className="space-y-1 text-sm text-slate-700">
                  <div>
                    Đã điểm danh:{' '}
                    <strong className="font-mono-data text-emerald-700 text-lg">
                      {attendanceSummary.checkedInCount}/{attendanceSummary.totalApproved} SV
                    </strong>
                  </div>
                  <div>
                    Hết hạn sau:{' '}
                    <strong className="font-mono-data">
                      {formatRemainingTime(
                        new Date(attendanceSession.expires_at).getTime() -
                          (nowTick + clockOffsetMs)
                      )}
                    </strong>
                  </div>
                  {attendanceSession.mode === 'ROTATING' && attendanceSession.next_rotate_at && (
                    <div className="text-amber-700 font-bold font-mono-data">
                      Mã tự đổi sau:{' '}
                      {Math.max(
                        0,
                        Math.ceil(
                          (new Date(attendanceSession.next_rotate_at).getTime() -
                            (nowTick + clockOffsetMs)) /
                            1000
                        )
                      )}
                      s
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
