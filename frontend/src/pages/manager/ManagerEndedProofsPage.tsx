import React, { useEffect, useState } from 'react';
import { Award, Check, CheckCheck, CheckCircle2, Clock, UserCheck, X } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import { formatDateTime } from '../../utils/format';

interface EndedActivityManager {
  id: number;
  title: string;
  location: string;
  start_time: string;
  end_time: string;
  training_points: number;
  participants: Array<{
    registration_id: number;
    student_id: number;
    full_name: string;
    student_code: string;
    phone: string;
    checked_in_at: string | null;
    checkin_method: 'PIN' | 'QR' | 'MANUAL' | null;
    proof_id: number | null;
    proof_image_url: string | null;
    proof_description: string | null;
    proof_status: 'SUBMITTED' | 'CONFIRMED' | 'REJECTED' | null;
    proof_reject_reason: string | null;
    proof_submitted_at: string | null;
  }>;
}

export const ManagerEndedProofsPage: React.FC = () => {
  const [activities, setActivities] = useState<EndedActivityManager[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadEnded = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ activities: EndedActivityManager[] }>(
        '/manager/ended-activities'
      );
      setActivities(res.activities);
      if (res.activities.length > 0 && !selectedId) {
        setSelectedId(res.activities[0].id);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEnded();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleReviewProof = async (proofId: number, decision: 'CONFIRM' | 'REJECT') => {
    let rejectReason = '';
    if (decision === 'REJECT') {
      const input = window.prompt('Nhập lý do từ chối ảnh minh chứng:');
      if (input === null) return;
      rejectReason = input;
    }
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(`/manager/proofs/${proofId}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, rejectReason })
      });
      setMsg(res.message);
      await loadEnded();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleBulkConfirm = async (activityId: number) => {
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/manager/activities/${activityId}/bulk-confirm-proofs`,
        { method: 'POST' }
      );
      setMsg(res.message);
      await loadEnded();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleManualCheckIn = async (registrationId: number) => {
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/manager/registrations/${registrationId}/manual-checkin`,
        { method: 'POST' }
      );
      setMsg(res.message);
      await loadEnded();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const selectedActivity = activities.find((a) => a.id === selectedId) || null;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1E3A8A]">
          Duyệt Hoạt động đã kết thúc &amp; Xác nhận Minh chứng Cộng điểm
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Nhấn vào hoạt động đã kết thúc để xem danh sách sinh viên kèm ảnh minh chứng. Khi nhấn{' '}
          <strong>Xác nhận</strong>, sinh viên sẽ được cộng ngay điểm rèn luyện của hoạt động.
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

      {loading ? (
        <div className="text-center py-12 text-slate-500">Đang tải...</div>
      ) : activities.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-300 text-slate-500">
          Chưa có hoạt động nào đã kết thúc.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-4 space-y-3">
            {activities.map((act) => {
              const submittedCount = act.participants.filter(
                (p) => p.proof_status === 'SUBMITTED'
              ).length;
              return (
                <button
                  key={act.id}
                  onClick={() => setSelectedId(act.id)}
                  className={`w-full text-left p-4 rounded-2xl border transition-all space-y-1.5 ${
                    selectedId === act.id
                      ? 'border-blue-500 bg-blue-50/70 shadow-sm'
                      : 'border-slate-200 bg-white hover:border-blue-300'
                  }`}
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="font-mono-data font-bold text-amber-700">
                      +{act.training_points} điểm RL
                    </span>
                    {submittedCount > 0 && (
                      <span className="px-2 py-0.5 rounded-full bg-blue-100 text-blue-800 font-semibold">
                        {submittedCount} chờ xác nhận
                      </span>
                    )}
                  </div>
                  <div className="font-bold text-sm text-slate-900">{act.title}</div>
                  <div className="text-xs text-slate-500 flex items-center gap-1">
                    <Clock className="w-3.5 h-3.5" />
                    Kết thúc: {formatDateTime(act.end_time)}
                  </div>
                </button>
              );
            })}
          </div>

          <div className="lg:col-span-8">
            {selectedActivity && (
              <div className="bg-white rounded-3xl border border-blue-100 p-6 shadow-xs space-y-5">
                <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-slate-100">
                  <div>
                    <h2 className="text-xl font-extrabold text-slate-900">
                      {selectedActivity.title}
                    </h2>
                    <p className="text-xs text-slate-600 mt-1">
                      Tổng sinh viên tham gia: {selectedActivity.participants.length} • Điểm cộng:{' '}
                      <strong className="font-mono-data text-amber-700">
                        +{selectedActivity.training_points} điểm rèn luyện
                      </strong>
                    </p>
                  </div>
                  {selectedActivity.participants.some((p) => p.proof_status === 'SUBMITTED') && (
                    <button
                      onClick={() => handleBulkConfirm(selectedActivity.id)}
                      className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                    >
                      <CheckCheck className="w-4 h-4" />
                      Xác nhận tất cả đang chờ
                    </button>
                  )}
                </div>

                {selectedActivity.participants.length === 0 ? (
                  <div className="py-8 text-center text-sm text-slate-500">
                    Không có sinh viên nào được duyệt tham gia hoạt động này.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {selectedActivity.participants.map((p) => (
                      <div
                        key={p.registration_id}
                        className="p-4 rounded-2xl border border-blue-100 space-y-3 bg-[#F4F7FB]"
                      >
                        <div className="flex items-start justify-between gap-2">
                          <div>
                            <div className="font-bold text-slate-900 text-sm">{p.full_name}</div>
                            <div className="font-mono-data text-xs text-slate-600">
                              MSSV: {p.student_code} • SĐT: {p.phone}
                            </div>
                            <div className="mt-1">
                              {p.checked_in_at ? (
                                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-emerald-700">
                                  <CheckCircle2 className="w-3.5 h-3.5" />
                                  Đã điểm danh ({p.checkin_method === 'MANUAL' ? 'Thủ công' : p.checkin_method})
                                </span>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => handleManualCheckIn(p.registration_id)}
                                  className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold hover:bg-amber-200"
                                >
                                  <UserCheck className="w-3 h-3" />
                                  Điểm danh thủ công (Mở khóa nộp ảnh)
                                </button>
                              )}
                            </div>
                          </div>
                          {p.proof_status ? (
                            <StatusBadge status={p.proof_status} />
                          ) : (
                            <StatusBadge status="PENDING" customLabel="Chưa nộp ảnh" />
                          )}
                        </div>

                        {p.proof_image_url ? (
                          <div className="space-y-2">
                            <img
                              src={p.proof_image_url}
                              alt={`Minh chứng của ${p.full_name}`}
                              className="w-full h-40 object-cover rounded-xl border border-slate-200 bg-white"
                            />
                            {p.proof_description && (
                              <p className="text-xs text-slate-700 bg-white p-2.5 rounded-lg border border-slate-100">
                                {p.proof_description}
                              </p>
                            )}
                            {p.proof_reject_reason && (
                              <p className="text-xs text-rose-700 bg-rose-50 p-2 rounded-lg">
                                Đã từ chối: {p.proof_reject_reason}
                              </p>
                            )}

                            {p.proof_status === 'SUBMITTED' && p.proof_id && (
                              <div className="flex gap-2 pt-1">
                                <button
                                  onClick={() => handleReviewProof(p.proof_id!, 'CONFIRM')}
                                  className="flex-1 inline-flex items-center justify-center gap-1 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                                >
                                  <Check className="w-4 h-4" />
                                  Xác nhận (+{selectedActivity.training_points}đ)
                                </button>
                                <button
                                  onClick={() => handleReviewProof(p.proof_id!, 'REJECT')}
                                  className="px-3 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-100 inline-flex items-center gap-1"
                                >
                                  <X className="w-4 h-4" />
                                  Từ chối
                                </button>
                              </div>
                            )}

                            {p.proof_status === 'CONFIRMED' && (
                              <div className="text-xs font-bold text-emerald-700 flex items-center gap-1">
                                <Award className="w-4 h-4" />
                                Đã cộng +{selectedActivity.training_points} điểm cho sinh viên
                              </div>
                            )}
                          </div>
                        ) : (
                          <div className="h-28 rounded-xl border border-dashed border-slate-300 flex items-center justify-center text-xs text-slate-400 bg-white">
                            Sinh viên chưa gửi ảnh minh chứng
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
