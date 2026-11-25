import React, { useEffect, useState } from 'react';
import { Flag, Send } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import { ReportItem } from '../../types';
import { formatDateTime } from '../../utils/format';

export const ReportPage: React.FC = () => {
  const [reports, setReports] = useState<ReportItem[]>([]);
  const [targetType, setTargetType] = useState<'ACTIVITY' | 'USER' | 'PROOF' | 'OTHER'>('OTHER');
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadReports = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ reports: ReportItem[] }>('/reports/mine');
      setReports(res.reports);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadReports();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>('/reports', {
        method: 'POST',
        body: JSON.stringify({ targetType, title, content })
      });
      setTitle('');
      setContent('');
      setMsg(res.message);
      await loadReports();
    } catch (error: any) {
      setErr(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
      <div className="lg:col-span-2 bg-white rounded-3xl border border-blue-100 p-6 shadow-xs h-fit space-y-4">
        <div className="flex items-center gap-2">
          <Flag className="w-5 h-5 text-blue-600" />
          <h1 className="text-xl font-extrabold text-[#1E3A8A]">
            Gửi Báo cáo / Khiếu nại lên Admin
          </h1>
        </div>
        <p className="text-xs text-slate-600">
          Gửi phản ánh về hoạt động, minh chứng, tài khoản vi phạm hoặc đề xuất hỗ trợ trực tiếp
          tới Quản trị viên nhà trường.
        </p>

        {msg && (
          <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-medium">
            {msg}
          </div>
        )}
        {err && (
          <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium">
            {err}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Loại báo cáo</label>
            <select
              value={targetType}
              onChange={(e) => setTargetType(e.target.value as any)}
              className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="ACTIVITY">Về Hoạt động tình nguyện</option>
              <option value="PROOF">Khiếu nại Minh chứng / Điểm rèn luyện</option>
              <option value="USER">Báo cáo Tài khoản vi phạm</option>
              <option value="OTHER">Góp ý / Hỗ trợ khác</option>
            </select>
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">Tiêu đề *</label>
            <input
              type="text"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Nhập tiêu đề ngắn gọn..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Nội dung chi tiết *
            </label>
            <textarea
              rows={4}
              required
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Mô tả rõ sự việc, thời gian, tên hoạt động hoặc minh chứng liên quan..."
              className="w-full px-3.5 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 inline-flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <Send className="w-4 h-4" />
            {submitting ? 'Đang gửi...' : 'Gửi báo cáo lên Admin'}
          </button>
        </form>
      </div>

      <div className="lg:col-span-3 space-y-4">
        <h2 className="text-xl font-extrabold text-[#1E3A8A]">
          Lịch sử Báo cáo đã gửi ({reports.length})
        </h2>

        {loading ? (
          <div className="text-center py-10 text-slate-500">Đang tải...</div>
        ) : reports.length === 0 ? (
          <div className="text-center py-10 bg-white rounded-3xl border border-dashed border-slate-300 text-slate-500 text-sm">
            Bạn chưa gửi báo cáo nào.
          </div>
        ) : (
          <div className="space-y-3">
            {reports.map((rp) => (
              <div
                key={rp.id}
                className="bg-white rounded-2xl border border-blue-100 p-5 shadow-xs space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <StatusBadge status={rp.status} />
                  <span className="text-xs text-slate-400">{formatDateTime(rp.created_at)}</span>
                </div>
                <h3 className="font-bold text-slate-900">{rp.title}</h3>
                <p className="text-sm text-slate-600 whitespace-pre-line">{rp.content}</p>
                {rp.admin_response && (
                  <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-950">
                    <strong>Phản hồi từ Admin:</strong> {rp.admin_response}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
