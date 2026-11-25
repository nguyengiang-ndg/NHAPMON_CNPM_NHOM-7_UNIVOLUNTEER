import React, { useEffect, useState } from 'react';
import { Award, CheckCircle2, Flag, Settings, ShieldAlert, UserCheck, Users } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { DashboardStats } from '../../types';
import { PageKey } from '../../components/Navbar';

interface Props {
  onNavigate: (page: PageKey) => void;
}

export const AdminDashboardPage: React.FC<Props> = ({ onNavigate }) => {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [settings, setSettings] = useState<Array<{ key: string; value: string; description: string }>>([]);
  const [editValues, setEditValues] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadData = async () => {
    try {
      const [dashRes, setRes] = await Promise.all([
        apiFetch<{ stats: DashboardStats }>('/admin/dashboard'),
        apiFetch<{ settings: Array<{ key: string; value: string; description: string }> }>(
          '/admin/settings'
        )
      ]);
      setStats(dashRes.stats);
      setSettings(setRes.settings);
      const map: Record<string, string> = {};
      for (const s of setRes.settings) map[s.key] = s.value;
      setEditValues(map);
    } catch (e: any) {
      setErr(e.message);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSaveSetting = async (key: string) => {
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(`/admin/settings/${key}`, {
        method: 'PUT',
        body: JSON.stringify({ value: editValues[key] })
      });
      setMsg(res.message);
      await loadData();
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1E3A8A]">
          Bảng điều khiển Quản trị viên (Admin)
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Theo dõi toàn bộ hoạt động tình nguyện, xét duyệt Quản lý, kiểm soát sinh viên và xử lý
          báo cáo trong trường.
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

      {stats && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          <button
            onClick={() => onNavigate('admin-students')}
            className="text-left p-5 rounded-3xl bg-white border border-blue-100 shadow-xs hover:border-blue-400 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Tài khoản Sinh viên</span>
              <Users className="w-5 h-5 text-blue-600" />
            </div>
            <div className="font-mono-data text-3xl font-extrabold text-[#1E3A8A] mt-2">
              {stats.totalStudents}
            </div>
            <div className="text-xs text-blue-700 font-semibold mt-1">
              Tổng điểm đã cấp: {stats.totalPointsAwarded} đ
            </div>
          </button>

          <button
            onClick={() => onNavigate('admin-managers')}
            className="text-left p-5 rounded-3xl bg-white border border-blue-100 shadow-xs hover:border-amber-400 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Quản lý chờ duyệt</span>
              <UserCheck className="w-5 h-5 text-amber-600" />
            </div>
            <div className="font-mono-data text-3xl font-extrabold text-amber-700 mt-2">
              {stats.pendingManagers}
            </div>
            <div className="text-xs text-slate-600 mt-1">
              Đang hoạt động: {stats.activeManagers} Quản lý
            </div>
          </button>

          <button
            onClick={() => onNavigate('admin-activities')}
            className="text-left p-5 rounded-3xl bg-white border border-blue-100 shadow-xs hover:border-blue-400 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Hoạt động chờ duyệt / hủy</span>
              <CheckCircle2 className="w-5 h-5 text-blue-600" />
            </div>
            <div className="font-mono-data text-3xl font-extrabold text-blue-700 mt-2">
              {stats.pendingActivities + stats.cancelRequestedActivities}
            </div>
            <div className="text-xs text-slate-600 mt-1">
              Đang công khai: {stats.approvedActivities} hoạt động
            </div>
          </button>

          <button
            onClick={() => onNavigate('admin-reports')}
            className="text-left p-5 rounded-3xl bg-white border border-blue-100 shadow-xs hover:border-rose-400 transition-colors"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-semibold text-slate-500">Báo cáo chưa xử lý xong</span>
              <Flag className="w-5 h-5 text-rose-600" />
            </div>
            <div className="font-mono-data text-3xl font-extrabold text-rose-700 mt-2">
              {stats.openReports}
            </div>
            <div className="text-xs text-slate-600 mt-1">Từ Sinh viên &amp; Quản lý</div>
          </button>
        </div>
      )}

      {/* System Settings */}
      <div className="bg-white rounded-3xl border border-blue-100 p-6 shadow-xs space-y-4">
        <div className="flex items-center gap-2">
          <Settings className="w-5 h-5 text-blue-600" />
          <h2 className="text-lg font-extrabold text-[#1E3A8A]">Cấu hình Tham số Hệ thống</h2>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {settings.map((s) => (
            <div key={s.key} className="p-4 rounded-2xl bg-[#F4F7FB] border border-blue-100 space-y-2">
              <div className="font-mono-data text-xs font-bold text-[#1E3A8A] flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-blue-600" />
                {s.key}
              </div>
              <p className="text-xs text-slate-600">{s.description}</p>
              <div className="flex gap-2">
                {s.key === 'REQUIRE_CHECKIN_FOR_PROOF' ? (
                  <select
                    value={editValues[s.key] ?? '1'}
                    onChange={(e) =>
                      setEditValues((prev) => ({ ...prev, [s.key]: e.target.value }))
                    }
                    className="flex-1 px-3 py-1.5 rounded-xl border border-slate-300 text-sm bg-white font-semibold"
                  >
                    <option value="1">1 — Bật (Bắt buộc điểm danh trước khi nộp minh chứng)</option>
                    <option value="0">0 — Tắt (Không bắt buộc điểm danh)</option>
                  </select>
                ) : (
                  <input
                    type="number"
                    value={editValues[s.key] || ''}
                    onChange={(e) =>
                      setEditValues((prev) => ({ ...prev, [s.key]: e.target.value }))
                    }
                    className="font-mono-data flex-1 px-3 py-1.5 rounded-xl border border-slate-300 text-sm bg-white"
                  />
                )}
                <button
                  onClick={() => handleSaveSetting(s.key)}
                  className="px-4 py-1.5 rounded-xl bg-[#1E3A8A] text-white text-xs font-bold hover:bg-blue-800"
                >
                  Lưu
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-4 rounded-2xl bg-blue-50 border border-blue-200 flex items-center gap-3 text-sm text-blue-950">
        <Award className="w-5 h-5 text-blue-600 shrink-0" />
        <span>
          <strong>Ghi chú vận hành:</strong> Mọi thao tác duyệt Quản lý, duyệt/hủy Hoạt động và phản
          hồi Báo cáo đều tự động gửi thông báo tức thời tới tài khoản tương ứng.
        </span>
      </div>
    </div>
  );
};
