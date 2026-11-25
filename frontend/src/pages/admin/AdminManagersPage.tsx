import React, { useEffect, useState } from 'react';
import { Check, Lock, MapPin, Phone, Unlock, X } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import { User } from '../../types';
import { formatDateOnly } from '../../utils/format';

interface ManagerItem extends User {
  activity_count: number;
}

export const AdminManagersPage: React.FC = () => {
  const [managers, setManagers] = useState<ManagerItem[]>([]);
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadManagers = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ managers: ManagerItem[] }>(
        `/admin/managers?status=${encodeURIComponent(statusFilter)}`
      );
      setManagers(res.managers);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadManagers();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter]);

  const handleReview = async (id: number, decision: 'APPROVE' | 'REJECT') => {
    let rejectReason = '';
    if (decision === 'REJECT') {
      const input = window.prompt('Nhập lý do từ chối tài khoản Quản lý:');
      if (input === null) return;
      rejectReason = input;
    }
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(`/admin/managers/${id}/review`, {
        method: 'POST',
        body: JSON.stringify({ decision, rejectReason })
      });
      setMsg(res.message);
      await loadManagers();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  const handleToggleLock = async (id: number, lock: boolean) => {
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(`/admin/users/${id}/lock`, {
        method: 'POST',
        body: JSON.stringify({ lock })
      });
      setMsg(res.message);
      await loadManagers();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1E3A8A]">
            Duyệt &amp; Quản lý Tài khoản Quản lý Tình nguyện
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Xét duyệt đơn đăng ký Quản lý mới và quản lý quyền hoạt động.
          </p>
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="px-3.5 py-2 rounded-xl border border-slate-300 bg-white text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="ALL">Tất cả trạng thái</option>
          <option value="PENDING">Đang chờ duyệt</option>
          <option value="ACTIVE">Đang hoạt động</option>
          <option value="REJECTED">Đã từ chối</option>
          <option value="LOCKED">Đã khóa</option>
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
      ) : managers.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-300 text-slate-500">
          Không có tài khoản Quản lý nào trong danh sách này.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {managers.map((m) => (
            <div
              key={m.id}
              className="bg-white rounded-3xl border border-blue-100 p-5 shadow-xs space-y-3"
            >
              <div className="flex items-start justify-between gap-2">
                <div>
                  <h3 className="font-bold text-slate-900 text-lg">{m.full_name}</h3>
                  <div className="text-xs text-slate-600">{m.email}</div>
                </div>
                <StatusBadge status={m.status} />
              </div>

              <div className="text-xs text-slate-600 space-y-1 bg-[#F4F7FB] p-3.5 rounded-2xl">
                <div className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-blue-600" />
                  SĐT: <strong className="font-mono-data">{m.phone}</strong> • Ngày sinh:{' '}
                  {formatDateOnly(m.dob)}
                </div>
                <div className="flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-blue-600" />
                  Địa chỉ: {m.address || '—'}
                </div>
                <div>Số hoạt động đã tạo: {m.activity_count}</div>
              </div>

              {m.reject_reason && (
                <div className="text-xs text-rose-700 bg-rose-50 p-2 rounded-lg">
                  Lý do từ chối: {m.reject_reason}
                </div>
              )}

              <div className="flex flex-wrap gap-2 pt-1">
                {m.status === 'PENDING' && (
                  <>
                    <button
                      onClick={() => handleReview(m.id, 'APPROVE')}
                      className="flex-1 inline-flex items-center justify-center gap-1.5 py-2 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700"
                    >
                      <Check className="w-4 h-4" />
                      Duyệt tài khoản
                    </button>
                    <button
                      onClick={() => handleReview(m.id, 'REJECT')}
                      className="px-4 py-2 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-bold hover:bg-rose-100 inline-flex items-center gap-1"
                    >
                      <X className="w-4 h-4" />
                      Từ chối
                    </button>
                  </>
                )}
                {m.status === 'ACTIVE' && (
                  <button
                    onClick={() => handleToggleLock(m.id, true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-50"
                  >
                    <Lock className="w-3.5 h-3.5" />
                    Khóa tài khoản
                  </button>
                )}
                {m.status === 'LOCKED' && (
                  <button
                    onClick={() => handleToggleLock(m.id, false)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-50"
                  >
                    <Unlock className="w-3.5 h-3.5" />
                    Mở khóa tài khoản
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
