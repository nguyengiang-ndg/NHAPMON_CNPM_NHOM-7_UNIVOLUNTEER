import React, { useEffect, useState } from 'react';
import {
  Award,
  Calendar,
  CheckCircle2,
  Clock,
  KeyRound,
  MapPin,
  MessageSquare,
  Phone,
  Trash2,
  X
} from 'lucide-react';
import { apiFetch } from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import { useAuth } from '../../contexts/AuthContext';
import { ScheduleItem, WaitlistItem } from '../../types';
import { formatDateTime } from '../../utils/format';

export const StudentSchedulePage: React.FC = () => {
  const { refreshUserData, pendingCheckIn, setPendingCheckIn } = useAuth();
  const [items, setItems] = useState<ScheduleItem[]>([]);
  const [waitlists, setWaitlists] = useState<WaitlistItem[]>([]);
  const [cancelCutoffHours, setCancelCutoffHours] = useState<number>(24);
  const [filterStatus, setFilterStatus] = useState<string>('ALL');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [cancelModalItem, setCancelModalItem] = useState<ScheduleItem | null>(null);
  const [cancelReason, setCancelReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [checkInTarget, setCheckInTarget] = useState<{
    activityId: number;
    title: string;
    method: 'PIN' | 'QR';
  } | null>(null);
  const [checkInPin, setCheckInPin] = useState('');
  const [checkInSubmitting, setCheckInSubmitting] = useState(false);

  const loadSchedule = async () => {
    setLoading(true);
    try {
      const [scheduleRes, waitRes] = await Promise.all([
        apiFetch<{ schedule: ScheduleItem[]; cancelCutoffHours?: number }>('/student/schedule'),
        apiFetch<{ waitlists: WaitlistItem[] }>('/student/waitlists')
      ]);
      setItems(scheduleRes.schedule);
      setWaitlists(waitRes.waitlists);
      if (typeof scheduleRes.cancelCutoffHours === 'number' && scheduleRes.cancelCutoffHours > 0) {
        setCancelCutoffHours(scheduleRes.cancelCutoffHours);
      }

      if (pendingCheckIn) {
        const matched = scheduleRes.schedule.find(
          (s) => s.activity_id === pendingCheckIn.activityId && s.registration_status === 'APPROVED'
        );
        setCheckInTarget({
          activityId: pendingCheckIn.activityId,
          title: matched ? matched.title : `Hoạt động #${pendingCheckIn.activityId}`,
          method: 'QR'
        });
        setCheckInPin(pendingCheckIn.pin);
        setPendingCheckIn(null);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadSchedule();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingCheckIn]);

  const handleSubmitCheckIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!checkInTarget) return;
    if (!/^\d{6}$/.test(checkInPin.trim())) {
      setErr('Mã PIN điểm danh phải gồm đúng 6 chữ số.');
      return;
    }

    setCheckInSubmitting(true);
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/student/activities/${checkInTarget.activityId}/checkin`,
        {
          method: 'POST',
          body: JSON.stringify({ pin: checkInPin.trim(), method: checkInTarget.method })
        }
      );
      setCheckInTarget(null);
      setCheckInPin('');
      setMsg(res.message);
      await refreshUserData();
      await loadSchedule();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setCheckInSubmitting(false);
    }
  };

  const handleRegisterFromWaitlist = async (w: WaitlistItem) => {
    setMsg('');
    setErr('');
    setSubmitting(true);
    try {
      const res = await apiFetch<{ message: string }>(
        `/student/activities/${w.activity_id}/register`,
        {
          method: 'POST',
          body: JSON.stringify({ noteToManager: w.note_to_manager || '' })
        }
      );
      setMsg(res.message);
      await refreshUserData();
      await loadSchedule();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleLeaveWaitlist = async (activityId: number) => {
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/student/activities/${activityId}/waitlist`,
        { method: 'DELETE' }
      );
      setMsg(res.message);
      await loadSchedule();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleImmediateWithdraw = async (item: ScheduleItem) => {
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/student/registrations/${item.registration_id}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: 'Sinh viên rút đơn khi đang chờ duyệt' })
        }
      );
      setMsg(res.message);
      await loadSchedule();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleRequestCancelApproved = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!cancelModalItem) return;
    setSubmitting(true);
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/student/registrations/${cancelModalItem.registration_id}/cancel`,
        {
          method: 'POST',
          body: JSON.stringify({ reason: cancelReason })
        }
      );
      setCancelModalItem(null);
      setCancelReason('');
      setMsg(res.message);
      await loadSchedule();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setSubmitting(false);
    }
  };

  const visibleItems = items.filter((i) =>
    filterStatus === 'ALL' ? true : i.registration_status === filterStatus
  );

  const formatDayChip = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return { day: '--', month: '--', time: '--:--' };
    return {
      day: String(d.getDate()).padStart(2, '0'),
      month: `Th${d.getMonth() + 1}`,
      time: d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })
    };
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1E3A8A]">
            Thời khóa biểu Hoạt động của tôi
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Theo dõi lịch hoạt động đã đăng ký, số điện thoại Quản lý ngay bên cạnh để gọi trực
            tiếp và thao tác hủy khi cần.
          </p>
        </div>

        <select
          aria-label="Lọc trạng thái thời khóa biểu"
          value={filterStatus}
          onChange={(e) => setFilterStatus(e.target.value)}
          className="px-4 py-2.5 rounded-xl border border-slate-300 bg-white text-sm font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="ALL">Tất cả trạng thái ({items.length})</option>
          <option value="APPROVED">Đã được duyệt</option>
          <option value="PENDING">Đang chờ Quản lý duyệt</option>
          <option value="CANCEL_REQUESTED">Đang chờ duyệt hủy</option>
          <option value="CANCELLED">Đã hủy / Rút đơn</option>
          <option value="REJECTED">Bị từ chối</option>
        </select>
      </div>

      {msg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-semibold">
          {msg}
        </div>
      )}
      {err && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-sm font-semibold">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">Đang tải thời khóa biểu...</div>
      ) : visibleItems.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-300 text-slate-500">
          Chưa có hoạt động nào trong danh sách này.
        </div>
      ) : (
        <div className="space-y-4">
          {visibleItems.map((item) => {
            const chip = formatDayChip(item.start_time);
            return (
              <div
                key={item.registration_id}
                className="bg-white rounded-3xl border border-blue-100 p-5 shadow-xs flex flex-col lg:flex-row items-stretch justify-between gap-5 hover:border-blue-300 transition-colors"
              >
                <div className="flex lg:flex-col items-center justify-center gap-2 lg:gap-0.5 px-4 py-3 rounded-2xl bg-[#F4F7FB] border border-blue-100 shrink-0 lg:w-28 text-center">
                  <span className="text-xs font-bold text-blue-700">{chip.month}</span>
                  <span className="font-mono-data text-2xl sm:text-3xl font-extrabold text-[#1E3A8A] leading-none">
                    {chip.day}
                  </span>
                  <span className="font-mono-data text-xs font-semibold text-slate-600 mt-1">
                    {chip.time}
                  </span>
                </div>

                <div className="space-y-2 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={item.registration_status} />
                    {item.activity_status === 'CANCELLED' && (
                      <StatusBadge status="CANCELLED" customLabel="Hoạt động đã bị BTC hủy" />
                    )}
                    {item.checked_in_at && (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        Đã điểm danh ({item.checkin_method === 'MANUAL' ? 'Thủ công' : item.checkin_method})
                      </span>
                    )}
                    <span className="font-mono-data text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                      +{item.training_points} điểm RL
                    </span>
                  </div>

                  <h3 className="text-lg font-extrabold text-slate-900">{item.title}</h3>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                    <div className="flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                      <span className="font-mono-data">
                        {formatDateTime(item.start_time)} → {formatDateTime(item.end_time)}
                      </span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                      <span>{item.location}</span>
                    </div>
                  </div>

                  {item.note_to_manager && (
                    <div className="text-xs text-slate-700 flex items-start gap-1.5 bg-slate-50 px-3 py-2 rounded-xl border border-slate-100">
                      <MessageSquare className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
                      <span>
                        <strong>Lời nhắn của bạn:</strong> {item.note_to_manager}
                      </span>
                    </div>
                  )}

                  {item.reject_reason && (
                    <div className="text-xs text-rose-800 bg-rose-50 px-3 py-2 rounded-xl border border-rose-100">
                      <strong>Ghi chú/Lý do từ chối:</strong> {item.reject_reason}
                    </div>
                  )}
                </div>

                <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end justify-center gap-3 shrink-0 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-5">
                  <a
                    href={`tel:${item.manager_phone}`}
                    className="inline-flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-blue-50 border border-blue-200 text-blue-950 hover:bg-blue-100 transition-colors"
                    title="Nhấn để gọi điện cho Quản lý hoạt động"
                  >
                    <div className="w-8 h-8 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <Phone className="w-4 h-4" />
                    </div>
                    <div>
                      <div className="text-[11px] font-semibold text-blue-700">
                        QL: {item.manager_name}
                      </div>
                      <div className="font-mono-data text-sm font-extrabold tracking-tight">
                        {item.manager_phone}
                      </div>
                    </div>
                  </a>

                  {item.registration_status === 'PENDING' &&
                    item.activity_status !== 'CANCELLED' &&
                    new Date(item.end_time).getTime() > Date.now() && (
                      <button
                        onClick={() => handleImmediateWithdraw(item)}
                        className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-rose-300 text-rose-700 bg-rose-50 hover:bg-rose-100 text-xs font-bold transition-colors"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Rút đơn ngay (Chưa duyệt)
                      </button>
                    )}

                  {item.registration_status === 'APPROVED' &&
                    item.activity_status !== 'CANCELLED' && (
                      <>
                        {item.checked_in_at ? (
                          <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-bold text-right">
                            Đã điểm danh lúc {formatDateTime(item.checked_in_at)}
                          </div>
                        ) : new Date(item.end_time).getTime() > Date.now() ? (
                          <button
                            onClick={() => {
                              setCheckInTarget({
                                activityId: item.activity_id,
                                title: item.title,
                                method: 'PIN'
                              });
                              setCheckInPin('');
                              setErr('');
                            }}
                            className={`inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl text-xs font-bold transition-colors ${
                              item.has_active_checkin_session
                                ? 'bg-[#1E3A8A] text-white hover:bg-blue-800 shadow-xs'
                                : 'bg-blue-50 border border-blue-300 text-[#1E3A8A] hover:bg-blue-100'
                            }`}
                          >
                            <KeyRound className="w-3.5 h-3.5" />
                            {item.has_active_checkin_session ? (
                              <span className="inline-flex items-center gap-1.5">
                                <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
                                Điểm danh có mặt ngay (PIN)
                              </span>
                            ) : (
                              'Điểm danh có mặt (PIN)'
                            )}
                          </button>
                        ) : null}
                      </>
                    )}

                  {item.registration_status === 'APPROVED' &&
                    item.activity_status !== 'CANCELLED' &&
                    (() => {
                      const msUntilStart = new Date(item.start_time).getTime() - Date.now();
                      const cancelCutoffMs = cancelCutoffHours * 60 * 60 * 1000;
                      if (msUntilStart >= cancelCutoffMs) {
                        return (
                          <button
                            onClick={() => {
                              setCancelModalItem(item);
                              setCancelReason('');
                              setErr('');
                            }}
                            className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl border border-orange-300 text-orange-800 bg-orange-50 hover:bg-orange-100 text-xs font-bold transition-colors"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            Hủy đăng ký (Cần QL đồng ý)
                          </button>
                        );
                      }
                      if (msUntilStart > 0) {
                        return (
                          <div className="px-3 py-2 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-semibold text-right max-w-xs">
                            Đã khóa hủy (còn dưới {cancelCutoffHours} tiếng trước giờ bắt đầu). Vui
                            lòng gọi SĐT Quản lý phía trên nếu có sự cố bất khả kháng.
                          </div>
                        );
                      }
                      return (
                        <span className="text-[11px] font-semibold text-slate-500 text-right">
                          Hoạt động đã bắt đầu / kết thúc
                        </span>
                      );
                    })()}

                  {item.registration_status === 'CANCEL_REQUESTED' && (
                    <div className="text-xs text-orange-700 font-bold text-right">
                      Đang chờ Quản lý đồng ý hủy...
                      <div className="text-[11px] font-normal text-slate-600 mt-0.5">
                        Gọi SĐT phía trên nếu cần trao đổi gấp
                      </div>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Danh sách chờ chỗ trống */}
      {waitlists.length > 0 && (
        <section className="space-y-4 pt-2">
          <div>
            <h2 className="text-xl font-extrabold text-[#1E3A8A] flex items-center gap-2">
              <Clock className="w-5 h-5 text-indigo-600" />
              Danh sách chờ của tôi ({waitlists.length})
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-0.5">
              Khi hoạt động đủ chỗ có người hủy, người đứng đầu hàng chờ sẽ tự động nhận thông báo
              và có thể bấm Đăng ký ngay tại đây.
            </p>
          </div>

          <div className="space-y-3">
            {waitlists.map((w) => {
              const isOpenForAction =
                w.waitlist_status === 'NOTIFIED' &&
                w.available_slots > 0 &&
                w.activity_status === 'APPROVED' &&
                new Date(w.start_time).getTime() > Date.now() &&
                new Date(w.registration_deadline).getTime() > Date.now();

              return (
                <div
                  key={w.waitlist_id}
                  className="bg-white rounded-3xl border border-indigo-200 p-5 shadow-xs flex flex-col lg:flex-row items-stretch justify-between gap-4"
                >
                  <div className="space-y-2 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <StatusBadge status={w.waitlist_status} />
                      <span className="font-mono-data text-xs font-bold px-2.5 py-0.5 rounded-full bg-indigo-50 text-indigo-800 border border-indigo-200">
                        Vị trí hàng chờ: #{w.queue_position}
                      </span>
                      <span className="font-mono-data text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                        +{w.training_points} điểm RL
                      </span>
                    </div>

                    <h3 className="text-lg font-extrabold text-slate-900">{w.title}</h3>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs text-slate-600">
                      <div className="flex items-center gap-1.5">
                        <Calendar className="w-4 h-4 text-blue-600 shrink-0" />
                        <span className="font-mono-data">
                          {formatDateTime(w.start_time)} → {formatDateTime(w.end_time)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <MapPin className="w-4 h-4 text-blue-600 shrink-0" />
                        <span>{w.location}</span>
                      </div>
                    </div>

                    {w.waitlist_status === 'NOTIFIED' && (
                      <div className="text-xs font-semibold text-emerald-800 bg-emerald-50 border border-emerald-200 px-3 py-2 rounded-xl">
                        Hoạt động vừa có {w.available_slots} chỗ trống! Hãy bấm{' '}
                        <strong>Đăng ký ngay</strong> trước khi chỗ được lấp đầy.
                      </div>
                    )}
                  </div>

                  <div className="flex flex-col sm:flex-row lg:flex-col items-stretch sm:items-center lg:items-end justify-center gap-2.5 shrink-0 border-t lg:border-t-0 lg:border-l border-slate-100 pt-3 lg:pt-0 lg:pl-5">
                    <a
                      href={`tel:${w.manager_phone}`}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 text-blue-950 text-xs font-semibold hover:bg-blue-100"
                    >
                      <Phone className="w-3.5 h-3.5 text-blue-600" />
                      <span className="font-mono-data">
                        {w.manager_name}: {w.manager_phone}
                      </span>
                    </a>

                    <div className="flex flex-wrap gap-2 justify-end">
                      {isOpenForAction && (
                        <button
                          onClick={() => handleRegisterFromWaitlist(w)}
                          disabled={submitting}
                          className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:opacity-60"
                        >
                          <Award className="w-3.5 h-3.5" />
                          Đăng ký ngay
                        </button>
                      )}
                      <button
                        onClick={() => handleLeaveWaitlist(w.activity_id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-semibold hover:bg-slate-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Rời hàng chờ
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      )}

      {cancelModalItem && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="cancel-modal-title"
        >
          <form
            onSubmit={handleRequestCancelApproved}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-slate-200 space-y-4"
          >
            <div className="flex items-start justify-between">
              <h3 id="cancel-modal-title" className="text-lg font-extrabold text-slate-900">
                Gửi Yêu cầu Hủy Đăng ký
              </h3>
              <button
                type="button"
                onClick={() => {
                  setCancelModalItem(null);
                  setErr('');
                }}
                aria-label="Đóng"
                className="p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            {err && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                {err}
              </div>
            )}
            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-950 space-y-1">
              <div>
                Hoạt động này bạn đã được duyệt tham gia, nên việc hủy cần được{' '}
                <strong>Quản lý ({cancelModalItem.manager_name})</strong> đồng ý.
              </div>
              <div>
                <strong>Quy định:</strong> Chỉ hỗ trợ gửi yêu cầu hủy khi cách giờ bắt đầu từ{' '}
                <strong>{cancelCutoffHours} tiếng trở lên</strong>. SĐT liên hệ nhanh:{' '}
                <strong className="font-mono-data">{cancelModalItem.manager_phone}</strong>
              </div>
            </div>
            <div>
              <label htmlFor="cancel-reason" className="block text-sm font-bold text-slate-700 mb-1.5">
                Lý do xin hủy *
              </label>
              <textarea
                id="cancel-reason"
                rows={3}
                required
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value)}
                placeholder="Nhập lý do (VD: Em bị trùng lịch thi học kỳ / bị ốm đột xuất)..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setCancelModalItem(null);
                  setErr('');
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={submitting}
                className="px-5 py-2.5 rounded-xl bg-orange-600 text-white text-sm font-bold hover:bg-orange-700 disabled:opacity-60"
              >
                {submitting ? 'Đang gửi...' : 'Gửi yêu cầu hủy'}
              </button>
            </div>
          </form>
        </div>
      )}

      {checkInTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="checkin-modal-title"
        >
          <form
            onSubmit={handleSubmitCheckIn}
            className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-blue-100 space-y-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 id="checkin-modal-title" className="text-lg font-extrabold text-[#1E3A8A]">
                  Điểm danh Có mặt tại Sự kiện
                </h3>
                <p className="text-xs text-blue-700 font-bold mt-0.5">{checkInTarget.title}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCheckInTarget(null);
                  setErr('');
                }}
                aria-label="Đóng"
                className="p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {err && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                {err}
              </div>
            )}

            <div className="p-3.5 rounded-2xl bg-blue-50 border border-blue-200 text-xs text-blue-950 leading-relaxed">
              Nhập <strong>mã PIN 6 chữ số</strong> do Quản lý hoạt động cung cấp tại địa điểm (hoặc
              tự động điền từ QR Code) để xác nhận có mặt và mở khóa quyền nộp ảnh minh chứng.
            </div>

            <div>
              <label htmlFor="checkin-pin" className="block text-sm font-bold text-slate-700 mb-1.5">
                Mã PIN điểm danh (6 chữ số) *
              </label>
              <input
                id="checkin-pin"
                type="text"
                inputMode="numeric"
                maxLength={6}
                required
                autoFocus
                value={checkInPin}
                onChange={(e) => setCheckInPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="••••••"
                className="font-mono-data w-full px-4 py-3 rounded-xl border border-slate-300 text-2xl font-extrabold text-center tracking-[0.4em] text-[#1E3A8A] focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  setCheckInTarget(null);
                  setErr('');
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
              >
                Đóng
              </button>
              <button
                type="submit"
                disabled={checkInSubmitting}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-60"
              >
                {checkInSubmitting ? 'Đang xác nhận...' : 'Xác nhận có mặt'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
