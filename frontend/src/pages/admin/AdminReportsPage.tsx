import React, { useEffect, useState } from 'react';
import { Flag, Send } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import { ReportItem } from '../../types';
import { formatDateTime } from '../../utils/format';

export const AdminReportsPage: React.FC = () => {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [senderFilter, setSenderFilter] = useState('ALL');
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [responses, setResponses] = useState<Record<number, string>>({});
  const [statuses, setStatuses] = useState<Record<number, 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'>>({});
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ reports: ReportItem[] }>(
        `/admin/reports?senderRole=${encodeURIComponent(senderFilter)}&status=${encodeURIComponent(
          statusFilter
        )}`
      );
      setReports(res.reports);
      const rMap: Record<number, string> = {};
      const sMap: Record<number, 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'> = {};
      for (const rp of res.reports) {
        rMap[rp.id] = rp.admin_response || '';
        sMap[rp.id] = rp.status;
      }
      setResponses(rMap);
      setStatuses(sMap);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [senderFilter, statusFilter]);

  const handleSaveReport = async (id: number) => {
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(`/admin/reports/${id}`, {
        method: 'PUT',
        body: JSON.stringify({
          status: statuses[id] || 'RESOLVED',
          adminResponse: responses[id] || ''
        })
      });
      setMsg(res.message);
      await loadReports();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-extrabold text-[#1E3A8A] flex items-center gap-2">
            <Flag className="w-6 h-6 text-blue-600" />
            Tiếp nhận &amp; Xử lý Báo cáo
          </h1>
          <p className="text-sm text-slate-600 mt-1">
            Đón nhận và phản hồi các báo cáo từ Sinh viên và Quản lý tình nguyện.
          </p>
        </div>

        <div className="flex flex-wrap gap-2">
          <select
            value={senderFilter}
            onChange={(e) => setSenderFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Tất cả người gửi</option>
            <option value="STUDENT">Từ Sinh viên</option>
            <option value="MANAGER">Từ Quản lý</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="ALL">Tất cả trạng thái</option>
            <option value="OPEN">Mới tiếp nhận</option>
            <option value="IN_PROGRESS">Đang xử lý</option>
            <option value="RESOLVED">Đã giải quyết</option>
          </select>
        </div>
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
        <div className="text-center py-12 text-slate-500">Đang tải báo cáo...</div>
      ) : reports.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-300 text-slate-500">
          Không có báo cáo nào phù hợp.
        </div>
      ) : (
        <div className="space-y-4">
          {reports.map((rp) => (
            <div
              key={rp.id}
              className="bg-white rounded-3xl border border-blue-100 p-5 shadow-xs space-y-4"
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span
                    className={`px-2.5 py-0.5 rounded-full text-xs font-bold ${
                      rp.sender_role === 'STUDENT'
                        ? 'bg-blue-100 text-blue-800'
                        : 'bg-sky-100 text-sky-800'
                    }`}
                  >
                    {rp.sender_role === 'STUDENT' ? 'Sinh viên gửi' : 'Quản lý gửi'}
                  </span>
                  <StatusBadge status={rp.status} />
                </div>
                <span className="text-xs text-slate-400">{formatDateTime(rp.created_at)}</span>
              </div>

              <div>
                <h3 className="font-bold text-lg text-slate-900">{rp.title}</h3>
                <div className="text-xs text-slate-600 mt-0.5">
                  Người gửi: <strong>{rp.reporter_name}</strong>{' '}
                  {rp.reporter_student_code && `(${rp.reporter_student_code})`} •{' '}
                  {rp.reporter_email} • SĐT: {rp.reporter_phone}
                </div>
                <p className="text-sm text-slate-700 mt-2 bg-[#F4F7FB] p-3.5 rounded-2xl border border-blue-100 whitespace-pre-line">
                  {rp.content}
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-4 gap-3 pt-2 border-t border-slate-100">
                <select
                  value={statuses[rp.id] || rp.status}
                  onChange={(e) =>
                    setStatuses((prev) => ({
                      ...prev,
                      [rp.id]: e.target.value as 'OPEN' | 'IN_PROGRESS' | 'RESOLVED'
                    }))
                  }
                  className="px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white"
                >
                  <option value="OPEN">Mới tiếp nhận</option>
                  <option value="IN_PROGRESS">Đang xử lý</option>
                  <option value="RESOLVED">Đã giải quyết</option>
                </select>
                <input
                  type="text"
                  value={responses[rp.id] || ''}
                  onChange={(e) => setResponses((prev) => ({ ...prev, [rp.id]: e.target.value }))}
                  placeholder="Nhập phản hồi xử lý của Admin gửi lại người báo cáo..."
                  className="md:col-span-2 px-3.5 py-2 rounded-xl border border-slate-300 text-sm"
                />
                <button
                  onClick={() => handleSaveReport(rp.id)}
                  className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl bg-[#1E3A8A] text-white text-xs font-bold hover:bg-blue-800"
                >
                  <Send className="w-3.5 h-3.5" />
                  Cập nhật &amp; Phản hồi
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
