import React, { useEffect, useState } from 'react';
import { Award, Eye, Lock, Search, Unlock, X } from 'lucide-react';
import { apiFetch } from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import { User } from '../../types';
import { formatDateOnly, formatDateTime } from '../../utils/format';

interface StudentRow extends User {
  total_points: number;
  approved_activities_count: number;
}

export const AdminStudentsPage: React.FC = () => {
  const [students, setStudents] = useState<StudentRow[]>([]);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [detail, setDetail] = useState<any | null>(null);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const loadStudents = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{ students: StudentRow[] }>(
        `/admin/students?search=${encodeURIComponent(search)}`
      );
      setStudents(res.students);
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStudents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleOpenDetail = async (id: number) => {
    setErr('');
    try {
      const res = await apiFetch(`/admin/students/${id}`);
      setDetail(res);
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
      await loadStudents();
      if (detail?.student?.id === id) {
        await handleOpenDetail(id);
      }
    } catch (e: any) {
      setErr(e.message);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1E3A8A]">Quản lý Tài khoản Sinh viên</h1>
        <p className="text-sm text-slate-600 mt-1">
          Nhấn vào từng tài khoản sinh viên để xem <strong>tất cả mọi thông tin</strong> của sinh
          viên đó (Email, MSSV, SĐT, điểm rèn luyện, hoạt động tham gia, minh chứng và báo cáo).
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

      <div className="flex gap-3 bg-white p-4 rounded-2xl border border-blue-100">
        <div className="relative flex-1">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && loadStudents()}
            placeholder="Tìm theo tên, MSSV, Email hoặc SĐT..."
            className="w-full pl-10 pr-4 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
        <button
          onClick={loadStudents}
          className="px-5 py-2 rounded-xl bg-[#1E3A8A] text-white text-sm font-bold hover:bg-blue-800"
        >
          Tìm kiếm
        </button>
      </div>

      {loading ? (
        <div className="text-center py-12 text-slate-500">Đang tải danh sách sinh viên...</div>
      ) : (
        <div className="bg-white rounded-3xl border border-blue-100 overflow-hidden shadow-xs">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead className="bg-[#F4F7FB] border-b border-blue-100 text-xs uppercase text-[#1E3A8A]">
                <tr>
                  <th className="px-4 py-3">MSSV</th>
                  <th className="px-4 py-3">Họ và tên</th>
                  <th className="px-4 py-3">Email</th>
                  <th className="px-4 py-3">SĐT</th>
                  <th className="px-4 py-3">Điểm RL</th>
                  <th className="px-4 py-3">Trạng thái</th>
                  <th className="px-4 py-3 text-right">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {students.map((sv) => (
                  <tr key={sv.id} className="hover:bg-blue-50/40">
                    <td className="font-mono-data px-4 py-3 font-bold text-slate-900">
                      {sv.student_code}
                    </td>
                    <td className="px-4 py-3 font-semibold text-slate-800">{sv.full_name}</td>
                    <td className="px-4 py-3 text-slate-600">{sv.email}</td>
                    <td className="font-mono-data px-4 py-3 text-slate-600">{sv.phone}</td>
                    <td className="font-mono-data px-4 py-3 font-bold text-blue-700">
                      {sv.total_points} đ
                    </td>
                    <td className="px-4 py-3">
                      <StatusBadge status={sv.status} />
                    </td>
                    <td className="px-4 py-3 text-right space-x-2">
                      <button
                        onClick={() => handleOpenDetail(sv.id)}
                        className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-blue-50 text-blue-800 text-xs font-bold hover:bg-blue-100"
                      >
                        <Eye className="w-3.5 h-3.5" />
                        Xem tất cả
                      </button>
                      {sv.status === 'ACTIVE' ? (
                        <button
                          onClick={() => handleToggleLock(sv.id, true)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-200 text-rose-700 text-xs font-semibold hover:bg-rose-50"
                        >
                          <Lock className="w-3.5 h-3.5" />
                          Khóa
                        </button>
                      ) : (
                        <button
                          onClick={() => handleToggleLock(sv.id, false)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-blue-200 text-blue-700 text-xs font-semibold hover:bg-blue-50"
                        >
                          <Unlock className="w-3.5 h-3.5" />
                          Mở khóa
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {detail && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-blue-100 p-6 space-y-6">
            <div className="flex items-start justify-between pb-4 border-b border-slate-100">
              <div>
                <h2 className="text-xl font-extrabold text-[#1E3A8A]">
                  Hồ sơ Toàn diện Sinh viên (Quyền Admin)
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Hiển thị toàn bộ thông tin cá nhân (gồm cả Email), điểm, hoạt động, minh chứng và
                  báo cáo.
                </p>
              </div>
              <button
                onClick={() => setDetail(null)}
                className="p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-3 gap-4 bg-[#F4F7FB] p-4 rounded-2xl border border-blue-100 text-sm">
              <div>
                <div className="text-xs text-slate-500">Họ và tên</div>
                <div className="font-bold text-slate-900">{detail.student.full_name}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Mã sinh viên</div>
                <div className="font-mono-data font-bold text-slate-900">
                  {detail.student.student_code}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Email</div>
                <div className="font-bold text-blue-700 break-all">{detail.student.email}</div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Số điện thoại</div>
                <div className="font-mono-data font-semibold text-slate-800">
                  {detail.student.phone}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Ngày tháng năm sinh</div>
                <div className="font-semibold text-slate-800">
                  {formatDateOnly(detail.student.dob)}
                </div>
              </div>
              <div>
                <div className="text-xs text-slate-500">Tổng điểm RL tích lũy</div>
                <div className="font-mono-data font-extrabold text-amber-700 inline-flex items-center gap-1">
                  <Award className="w-4 h-4" />
                  {detail.student.total_points} điểm
                </div>
              </div>
              <div className="col-span-2 sm:col-span-3">
                <div className="text-xs text-slate-500">Địa chỉ</div>
                <div className="text-slate-800">{detail.student.address || 'Chưa cập nhật'}</div>
              </div>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-bold text-slate-900 text-sm">
                Hoạt động đã đăng ký &amp; Minh chứng ({detail.registrations.length})
              </h3>
              {detail.registrations.length === 0 ? (
                <div className="text-xs text-slate-500">Chưa tham gia hoạt động nào.</div>
              ) : (
                <div className="space-y-2">
                  {detail.registrations.map((r: any) => (
                    <div
                      key={r.registration_id}
                      className="p-3.5 rounded-xl border border-slate-200 text-xs space-y-2"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="font-bold text-slate-900">{r.activity_title}</span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <StatusBadge status={r.registration_status} />
                          {r.checked_in_at && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              Đã điểm danh ({r.checkin_method === 'MANUAL' ? 'Thủ công' : r.checkin_method})
                            </span>
                          )}
                          {r.proof_status && <StatusBadge status={r.proof_status} />}
                        </div>
                      </div>
                      <div className="text-slate-600">
                        Quản lý: {r.manager_name} • Thời gian: {formatDateTime(r.start_time)}
                      </div>
                      {r.proof_image_url && (
                        <img
                          src={r.proof_image_url}
                          alt="Minh chứng"
                          className="w-40 h-24 object-cover rounded-lg border border-slate-200"
                        />
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900 text-sm">
                Lịch sử tích điểm ({detail.pointHistory.length})
              </h3>
              {detail.pointHistory.length === 0 ? (
                <div className="text-xs text-slate-500">Chưa có lịch sử cộng điểm.</div>
              ) : (
                <div className="space-y-1.5">
                  {detail.pointHistory.map((p: any) => (
                    <div
                      key={p.id}
                      className="p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-xs flex justify-between"
                    >
                      <span>
                        <strong>{p.activity_title}</strong> ({p.semester})
                      </span>
                      <span className="font-mono-data font-bold text-blue-800">+{p.points} đ</span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <h3 className="font-bold text-slate-900 text-sm">
                Báo cáo đã gửi lên Admin ({detail.reports.length})
              </h3>
              {detail.reports.length === 0 ? (
                <div className="text-xs text-slate-500">Chưa gửi báo cáo nào.</div>
              ) : (
                <div className="space-y-1.5">
                  {detail.reports.map((rp: any) => (
                    <div key={rp.id} className="p-3 rounded-xl border border-slate-200 text-xs">
                      <div className="flex justify-between">
                        <span className="font-bold">{rp.title}</span>
                        <StatusBadge status={rp.status} />
                      </div>
                      <p className="text-slate-600 mt-1">{rp.content}</p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
