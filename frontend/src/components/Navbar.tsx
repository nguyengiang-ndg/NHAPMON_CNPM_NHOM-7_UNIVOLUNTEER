import React, { useState } from 'react';
import {
  Award,
  Bell,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardList,
  Flag,
  HeartHandshake,
  Home,
  LogIn,
  LogOut,
  PlusCircle,
  Settings,
  ShieldCheck,
  UserCheck,
  Users
} from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { formatDateTime } from '../utils/format';

export type PageKey =
  | 'home'
  | 'auth'
  | 'student-schedule'
  | 'student-proofs'
  | 'manager-activities'
  | 'manager-create'
  | 'manager-proofs'
  | 'reports'
  | 'admin-dashboard'
  | 'admin-managers'
  | 'admin-activities'
  | 'admin-students'
  | 'admin-reports';

interface NavbarProps {
  currentPage: PageKey;
  onNavigate: (page: PageKey) => void;
  onOpenStudentProfile: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({
  currentPage,
  onNavigate,
  onOpenStudentProfile
}) => {
  const { user, notifications, unreadCount, totalPoints, logout, markAllNotificationsRead } =
    useAuth();
  const [notifOpen, setNotifOpen] = useState(false);

  const navButtonClass = (active: boolean) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap shrink-0 px-2.5 2xl:px-3.5 py-2 rounded-xl text-[13px] 2xl:text-sm font-semibold transition-all duration-150 focus:outline-none focus:ring-2 focus:ring-blue-500 ${
      active
        ? 'bg-[#1E3A8A] text-white shadow-sm'
        : 'text-slate-600 hover:bg-blue-50 hover:text-blue-700'
    }`;

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-blue-100 shadow-[0_2px_12px_rgba(30,58,138,0.06)]">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex items-center justify-between h-16 gap-3">
          {/* Brand */}
          <button
            onClick={() =>
              onNavigate(
                user?.role === 'ADMIN'
                  ? 'admin-dashboard'
                  : user?.role === 'MANAGER'
                    ? 'manager-activities'
                    : 'home'
              )
            }
            className="flex items-center gap-3 text-left group shrink-0 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 p-1 -ml-1"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-[#1E3A8A] to-[#2563EB] flex items-center justify-center text-white shadow-sm group-hover:scale-105 transition-transform">
              <HeartHandshake className="w-5 h-5" />
            </div>
            <div>
              <div className="text-base font-extrabold text-[#1E3A8A] tracking-tight leading-tight">
                UniVolunteer
              </div>
              <div className="text-[11px] text-blue-600 font-semibold hidden 2xl:block">
                Cổng Tình nguyện Trường học
              </div>
            </div>
          </button>

          {/* Desktop Navigation */}
          <nav className="hidden xl:flex items-center gap-1 flex-nowrap min-w-0" aria-label="Điều hướng chính">
            {!user && (
              <button
                onClick={() => onNavigate('home')}
                className={navButtonClass(currentPage === 'home')}
              >
                <Home className="w-4 h-4" />
                Trang chủ &amp; Hoạt động
              </button>
            )}

            {user?.role === 'STUDENT' && (
              <>
                <button
                  onClick={() => onNavigate('home')}
                  className={navButtonClass(currentPage === 'home')}
                >
                  <Home className="w-4 h-4" />
                  Hoạt động sắp tới
                </button>
                <button
                  onClick={() => onNavigate('student-schedule')}
                  className={navButtonClass(currentPage === 'student-schedule')}
                >
                  <Calendar className="w-4 h-4" />
                  Thời khóa biểu
                </button>
                <button
                  onClick={() => onNavigate('student-proofs')}
                  className={navButtonClass(currentPage === 'student-proofs')}
                >
                  <Camera className="w-4 h-4" />
                  Minh chứng (48h)
                </button>
                <button
                  onClick={() => onNavigate('reports')}
                  className={navButtonClass(currentPage === 'reports')}
                >
                  <Flag className="w-4 h-4" />
                  Báo cáo Admin
                </button>
              </>
            )}

            {user?.role === 'MANAGER' && (
              <>
                <button
                  onClick={() => onNavigate('manager-activities')}
                  className={navButtonClass(currentPage === 'manager-activities')}
                >
                  <ClipboardList className="w-4 h-4" />
                  Quản lý Hoạt động &amp; SV
                </button>
                <button
                  onClick={() => onNavigate('manager-create')}
                  className={navButtonClass(currentPage === 'manager-create')}
                >
                  <PlusCircle className="w-4 h-4" />
                  Đăng hoạt động mới
                </button>
                <button
                  onClick={() => onNavigate('manager-proofs')}
                  className={navButtonClass(currentPage === 'manager-proofs')}
                >
                  <CheckCircle2 className="w-4 h-4" />
                  Duyệt đã kết thúc
                </button>
                <button
                  onClick={() => onNavigate('reports')}
                  className={navButtonClass(currentPage === 'reports')}
                >
                  <Flag className="w-4 h-4" />
                  Báo cáo Admin
                </button>
              </>
            )}

            {user?.role === 'ADMIN' && (
              <>
                <button
                  onClick={() => onNavigate('admin-dashboard')}
                  className={navButtonClass(currentPage === 'admin-dashboard')}
                >
                  <Settings className="w-4 h-4" />
                  Tổng quan
                </button>
                <button
                  onClick={() => onNavigate('admin-managers')}
                  className={navButtonClass(currentPage === 'admin-managers')}
                >
                  <UserCheck className="w-4 h-4" />
                  Duyệt Quản lý
                </button>
                <button
                  onClick={() => onNavigate('admin-activities')}
                  className={navButtonClass(currentPage === 'admin-activities')}
                >
                  <ShieldCheck className="w-4 h-4" />
                  Duyệt Hoạt động
                </button>
                <button
                  onClick={() => onNavigate('admin-students')}
                  className={navButtonClass(currentPage === 'admin-students')}
                >
                  <Users className="w-4 h-4" />
                  Tài khoản SV
                </button>
                <button
                  onClick={() => onNavigate('admin-reports')}
                  className={navButtonClass(currentPage === 'admin-reports')}
                >
                  <Flag className="w-4 h-4" />
                  Báo cáo
                </button>
              </>
            )}
          </nav>

          {/* Right Action Area */}
          <div className="flex items-center gap-2.5 shrink-0">
            {!user ? (
              <button
                onClick={() => onNavigate('auth')}
                className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 transition-colors shadow-xs focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <LogIn className="w-4 h-4" />
                Đăng nhập / Đăng ký
              </button>
            ) : (
              <>
                {/* Notification Bell */}
                <div className="relative">
                  <button
                    onClick={() => setNotifOpen((o) => !o)}
                    aria-label="Mở hộp thông báo"
                    className="relative p-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 hover:bg-blue-50 hover:border-blue-200 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title="Thông báo"
                  >
                    <Bell className="w-5 h-5" />
                    {unreadCount > 0 && (
                      <span className="font-mono-data absolute -top-1 -right-1 min-w-[20px] h-[20px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center ring-2 ring-white">
                        {unreadCount > 9 ? '9+' : unreadCount}
                      </span>
                    )}
                  </button>

                  {notifOpen && (
                    <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white rounded-2xl shadow-xl border border-blue-100 overflow-hidden z-50">
                      <div className="px-4 py-3 border-b border-slate-100 flex items-center justify-between bg-[#F4F7FB]">
                        <span className="font-bold text-sm text-[#1E3A8A]">
                          Thông báo ({unreadCount} chưa đọc)
                        </span>
                        {unreadCount > 0 && (
                          <button
                            onClick={markAllNotificationsRead}
                            className="text-xs font-semibold text-blue-700 hover:underline"
                          >
                            Đánh dấu đã đọc
                          </button>
                        )}
                      </div>
                      <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
                        {notifications.length === 0 ? (
                          <div className="p-6 text-center text-sm text-slate-500">
                            Chưa có thông báo nào.
                          </div>
                        ) : (
                          notifications.map((n) => (
                            <div
                              key={n.id}
                              className={`p-3.5 text-sm ${n.is_read ? 'bg-white' : 'bg-blue-50/70'}`}
                            >
                              <div className="font-semibold text-slate-900 flex items-center justify-between gap-2">
                                <span>{n.title}</span>
                                {!n.is_read && (
                                  <span className="w-2 h-2 rounded-full bg-blue-600 shrink-0" />
                                )}
                              </div>
                              <p className="text-slate-600 text-xs mt-1 leading-relaxed">
                                {n.message}
                              </p>
                              <div className="text-[11px] text-slate-400 mt-1">
                                {formatDateTime(n.created_at)}
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>
                  )}
                </div>

                {/* Right-corner Avatar for Student */}
                {user.role === 'STUDENT' ? (
                  <button
                    onClick={onOpenStudentProfile}
                    aria-label="Mở hồ sơ và điểm rèn luyện"
                    className="flex items-center gap-2.5 pl-1.5 pr-3 py-1 rounded-2xl border border-blue-200 bg-blue-50/80 hover:bg-blue-100 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    title="Nhấn vào Avatar để xem điểm rèn luyện & lịch sử tích điểm"
                  >
                    <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-[#1E3A8A] to-[#2563EB] text-white font-bold text-xs flex items-center justify-center shadow-xs">
                      {getInitials(user.full_name)}
                    </div>
                    <div className="text-left hidden sm:block">
                      <div className="text-xs font-bold text-slate-900 max-w-[130px] truncate">
                        {user.full_name}
                      </div>
                      <div className="flex items-center gap-1.5 mt-0.5">
                        <span className="font-mono-data text-[10px] text-slate-500">
                          {user.student_code}
                        </span>
                        <span className="font-mono-data inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md bg-amber-100 text-amber-800 text-[10px] font-bold">
                          <Award className="w-3 h-3 text-amber-600" />
                          {totalPoints}đ
                        </span>
                      </div>
                    </div>
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <div className="hidden sm:flex items-center gap-2.5 px-3 py-1.5 rounded-2xl bg-[#F4F7FB] border border-blue-100">
                      <div className="w-8 h-8 rounded-xl bg-[#1E3A8A] text-white text-xs font-bold flex items-center justify-center">
                        {getInitials(user.full_name)}
                      </div>
                      <div className="text-left min-w-0" title={user.full_name}>
                        <div className="text-xs font-bold text-slate-900 max-w-[120px] 2xl:max-w-[175px] truncate">
                          {user.full_name}
                        </div>
                        <div className="text-[10px] font-semibold text-blue-700 whitespace-nowrap">
                          {user.role === 'ADMIN' ? 'Quản trị viên' : 'Quản lý HĐ'}
                        </div>
                      </div>
                    </div>
                    <button
                      onClick={() => {
                        logout();
                        onNavigate('home');
                      }}
                      aria-label="Đăng xuất"
                      className="p-2.5 rounded-xl border border-slate-200 bg-white text-slate-600 hover:bg-rose-50 hover:text-rose-600 hover:border-rose-200 transition-colors focus:outline-none focus:ring-2 focus:ring-rose-500"
                      title="Đăng xuất"
                    >
                      <LogOut className="w-4 h-4" />
                    </button>
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {/* Mobile Nav */}
        {user && (
          <div className="flex xl:hidden items-center gap-1.5 pb-3 overflow-x-auto">
            {user.role === 'STUDENT' && (
              <>
                <button
                  onClick={() => onNavigate('home')}
                  className={navButtonClass(currentPage === 'home')}
                >
                  Hoạt động
                </button>
                <button
                  onClick={() => onNavigate('student-schedule')}
                  className={navButtonClass(currentPage === 'student-schedule')}
                >
                  Thời khóa biểu
                </button>
                <button
                  onClick={() => onNavigate('student-proofs')}
                  className={navButtonClass(currentPage === 'student-proofs')}
                >
                  Minh chứng (48h)
                </button>
                <button
                  onClick={() => onNavigate('reports')}
                  className={navButtonClass(currentPage === 'reports')}
                >
                  Báo cáo
                </button>
              </>
            )}
            {user.role === 'MANAGER' && (
              <>
                <button
                  onClick={() => onNavigate('manager-activities')}
                  className={navButtonClass(currentPage === 'manager-activities')}
                >
                  Quản lý HĐ
                </button>
                <button
                  onClick={() => onNavigate('manager-create')}
                  className={navButtonClass(currentPage === 'manager-create')}
                >
                  Đăng HĐ mới
                </button>
                <button
                  onClick={() => onNavigate('manager-proofs')}
                  className={navButtonClass(currentPage === 'manager-proofs')}
                >
                  Duyệt kết thúc
                </button>
                <button
                  onClick={() => onNavigate('reports')}
                  className={navButtonClass(currentPage === 'reports')}
                >
                  Báo cáo
                </button>
              </>
            )}
            {user.role === 'ADMIN' && (
              <>
                <button
                  onClick={() => onNavigate('admin-dashboard')}
                  className={navButtonClass(currentPage === 'admin-dashboard')}
                >
                  Tổng quan
                </button>
                <button
                  onClick={() => onNavigate('admin-managers')}
                  className={navButtonClass(currentPage === 'admin-managers')}
                >
                  Quản lý
                </button>
                <button
                  onClick={() => onNavigate('admin-activities')}
                  className={navButtonClass(currentPage === 'admin-activities')}
                >
                  Hoạt động
                </button>
                <button
                  onClick={() => onNavigate('admin-students')}
                  className={navButtonClass(currentPage === 'admin-students')}
                >
                  Sinh viên
                </button>
                <button
                  onClick={() => onNavigate('admin-reports')}
                  className={navButtonClass(currentPage === 'admin-reports')}
                >
                  Báo cáo
                </button>
              </>
            )}
          </div>
        )}
      </div>
    </header>
  );
};
