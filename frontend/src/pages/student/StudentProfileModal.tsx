import React, { useEffect, useState } from 'react';
import { Award, Calendar, Download, History, KeyRound, LogOut, Printer, User as UserIcon, X } from 'lucide-react';
import { apiFetch, getStoredToken } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { PointHistoryItem } from '../../types';
import { formatDateOnly, formatDateTime } from '../../utils/format';

function escapeHtml(value: string | number | null | undefined): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

interface StudentProfileModalProps {
  open: boolean;
  onClose: () => void;
  onLoggedOut: () => void;
}

export const StudentProfileModal: React.FC<StudentProfileModalProps> = ({
  open,
  onClose,
  onLoggedOut
}) => {
  const { user, logout, refreshUserData } = useAuth();
  const [tab, setTab] = useState<'points' | 'profile' | 'password'>('points');
  const [totalPoints, setTotalPoints] = useState(0);
  const [filteredTotalPoints, setFilteredTotalPoints] = useState(0);
  const [semesters, setSemesters] = useState<string[]>([]);
  const [selectedSemester, setSelectedSemester] = useState('ALL');
  const [history, setHistory] = useState<PointHistoryItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [exportingCsv, setExportingCsv] = useState(false);

  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [dob, setDob] = useState('');
  const [address, setAddress] = useState('');
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');

  useEffect(() => {
    if (!open || !user || user.role !== 'STUDENT') return;
    setFullName(user.full_name || '');
    setPhone(user.phone || '');
    setDob(user.dob || '');
    setAddress(user.address || '');
    setMsg('');
    setErr('');

    const loadPoints = async () => {
      setLoading(true);
      try {
        const res = await apiFetch<{
          totalPoints: number;
          filteredTotalPoints?: number;
          semesters: string[];
          history: PointHistoryItem[];
        }>(`/student/points?semester=${encodeURIComponent(selectedSemester)}`);
        setTotalPoints(res.totalPoints);
        setFilteredTotalPoints(res.filteredTotalPoints ?? res.totalPoints);
        setSemesters(res.semesters);
        setHistory(res.history);
      } catch (e: any) {
        setErr(e.message);
      } finally {
        setLoading(false);
      }
    };

    loadPoints();
  }, [open, user, selectedSemester]);

  if (!open || !user) return null;

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      await apiFetch('/users/me', {
        method: 'PUT',
        body: JSON.stringify({ fullName, phone, dob, address })
      });
      await refreshUserData();
      setMsg('Cập nhật thông tin cá nhân thành công!');
    } catch (error: any) {
      setErr(error.message);
    }
  };

  const handleExportCsv = async () => {
    setErr('');
    setMsg('');
    setExportingCsv(true);
    try {
      const token = getStoredToken();
      const res = await fetch(
        `/api/student/points/export-csv?semester=${encodeURIComponent(selectedSemester)}`,
        {
          headers: token ? { Authorization: `Bearer ${token}` } : {}
        }
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Không thể xuất file CSV.');
      }
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `bang-tong-hop-hoat-dong-${user.student_code || user.id}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      setMsg('Đã tải xuống file CSV bảng tổng hợp hoạt động đã hoàn thành.');
    } catch (error: any) {
      setErr(error.message);
    } finally {
      setExportingCsv(false);
    }
  };

  const handlePrintSummary = () => {
    setErr('');
    const printWin = window.open('', '_blank', 'width=960,height=760');
    if (!printWin) {
      setErr('Trình duyệt đã chặn cửa sổ in. Vui lòng cho phép pop-up hoặc dùng nút Xuất CSV (Excel).');
      return;
    }

    const scopeText = selectedSemester === 'ALL' ? 'Tất cả học kỳ' : selectedSemester;
    const rowsHtml = history
      .map((item, idx) => {
        const proofUrl = item.proof_image_url
          ? item.proof_image_url.startsWith('/')
            ? `${window.location.origin}${item.proof_image_url}`
            : item.proof_image_url
          : '';
        const proofCell = proofUrl
          ? `<img src="${escapeHtml(proofUrl)}" alt="Minh chứng" style="width:68px;height:48px;object-fit:cover;border-radius:6px;border:1px solid #cbd5e1;" />`
          : '<span style="color:#64748b;">Đã xác nhận</span>';
        const timeRange =
          item.activity_start_time && item.activity_end_time
            ? `${formatDateTime(item.activity_start_time)} → ${formatDateTime(item.activity_end_time)}`
            : formatDateTime(item.awarded_at);

        return `
          <tr>
            <td style="text-align:center;">${idx + 1}</td>
            <td><strong>${escapeHtml(item.activity_title)}</strong></td>
            <td>${escapeHtml(item.activity_location)}</td>
            <td style="font-size:12px;">${escapeHtml(timeRange)}</td>
            <td style="text-align:center;">${escapeHtml(item.semester)}</td>
            <td>${escapeHtml(item.manager_name || '')}</td>
            <td style="text-align:center;">${proofCell}</td>
            <td style="text-align:center;font-weight:700;color:#1e3a8a;">+${Number(item.points || 0)}</td>
          </tr>
        `;
      })
      .join('');

    const html = `
      <!doctype html>
      <html lang="vi">
      <head>
        <meta charset="utf-8" />
        <title>Bảng tổng hợp Hoạt động Tình nguyện - ${escapeHtml(user.student_code || user.full_name)}</title>
        <style>
          @page { size: A4; margin: 16mm; }
          body { font-family: Arial, Helvetica, sans-serif; color: #0f172a; line-height: 1.45; margin: 0; padding: 20px; }
          .header { text-align: center; border-bottom: 2px solid #1e3a8a; padding-bottom: 12px; margin-bottom: 16px; }
          .motto { font-size: 12px; font-weight: 700; text-transform: uppercase; color: #334155; }
          h1 { font-size: 18px; color: #1e3a8a; margin: 8px 0 4px; text-transform: uppercase; }
          .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 6px 20px; background: #f8fafc; border: 1px solid #cbd5e1; border-radius: 10px; padding: 12px 16px; font-size: 13px; margin-bottom: 16px; }
          table { width: 100%; border-collapse: collapse; font-size: 12.5px; margin-bottom: 18px; }
          th, td { border: 1px solid #cbd5e1; padding: 8px; vertical-align: middle; }
          th { background: #1e3a8a; color: #ffffff; text-align: left; font-size: 12px; }
          .summary-box { text-align: right; font-size: 14px; font-weight: 700; color: #1e3a8a; margin-bottom: 24px; }
          .sign { display: flex; justify-content: space-between; margin-top: 28px; font-size: 13px; text-align: center; }
          .sign-col { width: 42%; }
          @media print { .no-print { display: none; } body { padding: 0; } }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="motto">Cộng hòa Xã hội Chủ nghĩa Việt Nam — Độc lập - Tự do - Hạnh phúc</div>
          <h1>Bảng Tổng hợp Hoạt động Tình nguyện Đã Hoàn thành</h1>
          <div style="font-size:12px;color:#475569;">Xuất từ Hệ thống UniVolunteer · Phạm vi: ${escapeHtml(scopeText)}</div>
        </div>
        <div class="meta">
          <div><strong>Họ và tên sinh viên:</strong> ${escapeHtml(user.full_name)}</div>
          <div><strong>Mã sinh viên:</strong> ${escapeHtml(user.student_code || '')}</div>
          <div><strong>Email liên hệ:</strong> ${escapeHtml(user.email)}</div>
          <div><strong>Số điện thoại:</strong> ${escapeHtml(user.phone)}</div>
          <div><strong>Số hoạt động hoàn thành:</strong> ${history.length}</div>
          <div><strong>Tổng điểm rèn luyện (${escapeHtml(scopeText)}):</strong> +${filteredTotalPoints} điểm</div>
        </div>
        <table>
          <thead>
            <tr>
              <th style="text-align:center;width:36px;">STT</th>
              <th>Tên hoạt động</th>
              <th>Địa điểm</th>
              <th>Thời gian diễn ra</th>
              <th style="text-align:center;">Học kỳ</th>
              <th>Quản lý xác nhận</th>
              <th style="text-align:center;">Minh chứng</th>
              <th style="text-align:center;width:64px;">Điểm</th>
            </tr>
          </thead>
          <tbody>
            ${rowsHtml}
          </tbody>
        </table>
        <div class="summary-box">Tổng điểm rèn luyện tích lũy trong bảng: +${filteredTotalPoints} điểm</div>
        <div class="sign">
          <div class="sign-col">
            <strong>Sinh viên kê khai</strong>
            <div style="margin-top:56px;">${escapeHtml(user.full_name)}</div>
          </div>
          <div class="sign-col">
            <div>Ngày xuất: ${escapeHtml(new Date().toLocaleDateString('vi-VN'))}</div>
            <strong>Xác nhận của Ban Tổ chức / Nhà trường</strong>
          </div>
        </div>
        <script>
          window.onload = function () { setTimeout(function () { window.focus(); window.print(); }, 250); };
        </script>
      </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(html);
    printWin.document.close();
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg('');
    setErr('');
    try {
      await apiFetch('/users/me/password', {
        method: 'PUT',
        body: JSON.stringify({ currentPassword, newPassword })
      });
      setCurrentPassword('');
      setNewPassword('');
      setMsg('Đổi mật khẩu thành công!');
    } catch (error: any) {
      setErr(error.message);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-blue-100">
        {/* Header */}
        <div className="bg-gradient-to-r from-[#0F2557] via-[#1E3A8A] to-[#2563EB] p-6 text-white flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className="w-16 h-16 rounded-2xl bg-white/20 backdrop-blur flex items-center justify-center text-2xl font-bold border border-white/30">
              {user.full_name.trim().slice(0, 1).toUpperCase()}
            </div>
            <div>
              <h2 className="text-xl font-bold">{user.full_name}</h2>
              <p className="text-blue-100 text-sm">
                MSSV:{' '}
                <span className="font-mono-data font-semibold text-white">{user.student_code}</span>{' '}
                • {user.email}
              </p>
              <div className="font-mono-data mt-2 inline-flex items-center gap-1.5 bg-white text-[#1E3A8A] px-3 py-1 rounded-full text-xs font-bold shadow-xs">
                <Award className="w-4 h-4 text-amber-500" />
                Tổng điểm đã tích được: {totalPoints} điểm rèn luyện
              </div>
            </div>
          </div>
          <button
            onClick={onClose}
            aria-label="Đóng hồ sơ"
            className="p-2 rounded-full bg-white/15 hover:bg-white/25 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-slate-200 px-6 bg-[#F4F7FB] gap-2">
          <button
            onClick={() => {
              setTab('points');
              setMsg('');
              setErr('');
            }}
            className={`inline-flex items-center gap-1.5 py-3 px-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'points'
                ? 'border-blue-600 text-[#1E3A8A]'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <History className="w-4 h-4" />
            Lịch sử tích điểm
          </button>
          <button
            onClick={() => {
              setTab('profile');
              setMsg('');
              setErr('');
            }}
            className={`inline-flex items-center gap-1.5 py-3 px-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'profile'
                ? 'border-blue-600 text-[#1E3A8A]'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserIcon className="w-4 h-4" />
            Thông tin cá nhân
          </button>
          <button
            onClick={() => {
              setTab('password');
              setMsg('');
              setErr('');
            }}
            className={`inline-flex items-center gap-1.5 py-3 px-3 text-sm font-semibold border-b-2 transition-colors ${
              tab === 'password'
                ? 'border-blue-600 text-[#1E3A8A]'
                : 'border-transparent text-slate-600 hover:text-slate-900'
            }`}
          >
            <KeyRound className="w-4 h-4" />
            Đổi mật khẩu
          </button>
        </div>

        <div className="p-6 space-y-4">
          {msg && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm">
              {msg}
            </div>
          )}
          {err && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm">
              {err}
            </div>
          )}

          {tab === 'points' && (
            <div className="space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <h3 className="font-bold text-slate-800">Chi tiết lịch sử cộng điểm rèn luyện</h3>
                <div className="flex flex-wrap items-center gap-2">
                  <select
                    aria-label="Lọc học kỳ"
                    value={selectedSemester}
                    onChange={(e) => setSelectedSemester(e.target.value)}
                    className="px-3 py-1.5 rounded-xl border border-slate-300 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="ALL">Tất cả học kỳ</option>
                    {semesters.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    onClick={handleExportCsv}
                    disabled={exportingCsv || loading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-blue-300 bg-blue-50 text-[#1E3A8A] text-xs font-bold hover:bg-blue-100 disabled:opacity-50"
                  >
                    <Download className="w-3.5 h-3.5" />
                    {exportingCsv ? 'Đang xuất...' : 'Xuất CSV (Excel)'}
                  </button>
                  <button
                    type="button"
                    onClick={handlePrintSummary}
                    disabled={history.length === 0 || loading}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 disabled:bg-slate-300"
                  >
                    <Printer className="w-3.5 h-3.5" />
                    In / Xuất PDF
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="text-center py-8 text-slate-500 text-sm">Đang tải...</div>
              ) : history.length === 0 ? (
                <div className="text-center py-8 bg-slate-50 rounded-2xl border border-dashed border-slate-300 text-slate-500 text-sm">
                  Bạn chưa có lịch sử cộng điểm nào trong học kỳ này. Hãy tham gia hoạt động và nộp
                  ảnh minh chứng trong vòng 2 ngày sau khi kết thúc nhé!
                </div>
              ) : (
                <div className="space-y-2.5">
                  {history.map((item) => (
                    <div
                      key={item.id}
                      className="p-4 rounded-2xl border border-blue-100 bg-white flex items-center justify-between gap-3 hover:border-blue-300 transition-colors"
                    >
                      <div>
                        <div className="font-semibold text-slate-900">{item.activity_title}</div>
                        <div className="text-xs text-slate-500 mt-1 flex flex-wrap items-center gap-3">
                          <span className="inline-flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-blue-600" />
                            {item.semester}
                          </span>
                          <span>Cộng lúc: {formatDateTime(item.awarded_at)}</span>
                        </div>
                      </div>
                      <span className="font-mono-data px-3 py-1.5 rounded-xl bg-amber-100 text-amber-900 font-bold text-sm shrink-0">
                        +{item.points} điểm
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {tab === 'profile' && (
            <form onSubmit={handleSaveProfile} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Email (không đổi)
                  </label>
                  <input
                    type="text"
                    value={user.email}
                    disabled
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Mã sinh viên (không đổi)
                  </label>
                  <input
                    type="text"
                    value={user.student_code || ''}
                    disabled
                    className="font-mono-data w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-100 text-slate-500 text-sm"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Họ và tên</label>
                  <input
                    type="text"
                    required
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Số điện thoại
                  </label>
                  <input
                    type="text"
                    required
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="font-mono-data w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Ngày tháng năm sinh ({formatDateOnly(dob)})
                  </label>
                  <input
                    type="date"
                    required
                    value={dob}
                    onChange={(e) => setDob(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">Địa chỉ</label>
                  <input
                    type="text"
                    value={address}
                    onChange={(e) => setAddress(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"
              >
                Lưu thay đổi
              </button>
            </form>
          )}

          {tab === 'password' && (
            <form onSubmit={handleChangePassword} className="space-y-4 max-w-md">
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Mật khẩu hiện tại
                </label>
                <input
                  type="password"
                  required
                  value={currentPassword}
                  onChange={(e) => setCurrentPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Mật khẩu mới (tối thiểu 6 ký tự)
                </label>
                <input
                  type="password"
                  required
                  minLength={6}
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>
              <button
                type="submit"
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"
              >
                Cập nhật mật khẩu
              </button>
            </form>
          )}

          <div className="pt-4 border-t border-slate-200 flex items-center justify-between">
            <button
              onClick={() => {
                logout();
                onClose();
                onLoggedOut();
              }}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-rose-50 text-rose-700 text-sm font-semibold hover:bg-rose-100"
            >
              <LogOut className="w-4 h-4" />
              Đăng xuất
            </button>
            <button
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-slate-300 text-slate-700 text-sm font-medium hover:bg-slate-50"
            >
              Đóng
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
