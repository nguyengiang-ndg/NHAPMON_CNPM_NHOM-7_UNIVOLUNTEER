import React, { useEffect, useState } from 'react';
import { Calendar, Check, MapPin, Phone, Users, X } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import { Activity } from '../../types';
import { formatDateTime } from '../../utils/format';

export const AdminActivitiesPage: React.FC = () => {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadActivities = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ activities: Activity[] }>(
        `/admin/activities?status=${encodeURIComponent(statusFilter)}`
      );
      setActivities(res.activities);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleReviewProposal = async (id: number, decision: 'APPROVE' | 'REJECT') => {
    let rejectReason = '';
    if (decision === 'REJECT') {
      const input = window.prompt('Nhập lý do từ chối duyệt hoạt động:');
      if (input === null) return;
      rejectReason = input;
    }
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(`/admin/activities/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, rejectReason })
      });
      setMsg(res.message);
      await loadActivities();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleReviewCancel = async (id: number, decision: 'APPROVE' | 'REJECT') => {
    let note = '';
    if (decision === 'REJECT') {
      const input = window.prompt('Nhập ghi chú từ chối hủy hoạt động:');
      if (input === null) return;
      note = input;
    }
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(`/admin/activities/${id}/review-cancel`, {
        method: 'POST',
        body: JSON.stringify({ decision, note })
      });
      setMsg(res.message);
      await loadActivities();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1E3A8A]">
            Duyệt Hoạt động mới &amp; Yêu cầu Hủy Hoạt động
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Phê duyệt hoạt động do Quản lý gửi lên và xử lý các đề xuất hủy hoạt động.
          </p>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="ALL">Tất cả hoạt động</option>
          <option value="PENDING_APPROVAL">Chờ Admin duyệt</option>
          <option value="CANCEL_REQUESTED">Chờ duyệt hủy</option>
          <option value="APPROVED">Đã duyệt (Công khai)</option>
          <option value="REJECTED">Đã từ chối</option>
          <option value="CANCELLED">Đã hủy</option>
        </select>
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
          Không có hoạt động nào trong danh sách.
        </div>
      ) : (
        <div className="space-y-4">
          {activities.map((act) => (
            <div
              key={act.id}
              className="bg-white rounded-3xl border border-blue-100 p-5 shadow-xs flex flex-col md:flex-row gap-5"
            >
              <img
                src={act.cover_image}
                alt={act.title}
                className="w-full md:w-52 h-36 object-cover rounded-2xl border border-slate-200 shrink-0"
              />
              <div className="flex-1 space-y-2">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <StatusBadge status={act.status} />
                    <span className="font-mono-data text-xs font-bold text-amber-800 bg-amber-100 px-2.5 py-0.5 rounded-full">
                      +{act.training_points} điểm RL
                    </span>
                  </div>
                  <span className="font-mono-data text-xs text-slate-500 inline-flex items-center gap-1">
                    <Users className="w-3.5 h-3.5 text-blue-600" />
                    {act.approved_count ?? 0}/{act.max_participants} SV
                  </span>
                </div>

                <h3 className="font-bold text-lg text-slate-900">{act.title}</h3>
                <p className="text-xs text-slate-600 line-clamp-2">{act.description}</p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 text-xs text-slate-600">
                  <div className="flex items-center gap-1.5">
                    <Calendar className="w-3.5 h-3.5 text-blue-600" />
                    {formatDateTime(act.start_time)} → {formatDateTime(act.end_time)}
                  </div>
                  <div className="flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-blue-600" />
                    {act.location}
                  </div>
                  <div className="flex items-center gap-1.5 sm:col-span-2">
                    <Phone className="w-3.5 h-3.5 text-blue-600" />
                    Quản lý: <strong>{act.manager_name}</strong> ({act.manager_phone} •{' '}
                    {act.manager_email})
                  </div>
                </div>

                {act.cancel_reason && (
                  <div className="p-2.5 rounded-xl bg-orange-50 border border-orange-200 text-xs text-orange-900">
                    <strong>Lý do Quản lý xin hủy:</strong> {act.cancel_reason}
                  </div>
                )}

                <div className="flex flex-wrap gap-2 pt-2">
                  {act.status === 'PENDING_APPROVAL' && (
                    <>
                      <button
                        onClick={() => handleReviewProposal(act.id, 'APPROVE')}
                        className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                      >
                        <Check className="w-4 h-4" />
                        Duyệt hoạt động
                      </button>
                      <button
                        onClick={() => handleReviewProposal(act.id, 'REJECT')}
                        className="inline-flex items-center gap-1 px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-100"
                      >
                        <X className="w-4 h-4" />
                        Từ chối
                      </button>
                    </>
                  )}
                  {act.status === 'CANCEL_REQUESTED' && (
                    <>
                      <button
                        onClick={() => handleReviewCancel(act.id, 'APPROVE')}
                        className="px-4 py-2 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700"
                      >
                        Đồng ý hủy hoạt động (Báo SV)
                      </button>
                      <button
                        onClick={() => handleReviewCancel(act.id, 'REJECT')}
                        className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50"
                      >
                        Từ chối hủy (Giữ hoạt động)
                      </button>
                    </>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
