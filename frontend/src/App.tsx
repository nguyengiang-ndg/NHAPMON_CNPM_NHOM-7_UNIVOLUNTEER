import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Navbar, PageKey } from './components/Navbar';
import { AuthMode, AuthPage } from './pages/guest/AuthPage';
import { StudentProfileModal } from './pages/student/StudentProfileModal';

const StageOneWelcome: React.FC<{ onNavigate: (p: PageKey, m?: AuthMode) => void }> = ({
  onNavigate
}) => (
  <div className="bg-white rounded-3xl border border-blue-100 p-8 shadow-xs space-y-4 text-center max-w-2xl mx-auto">
    <h1 className="text-2xl font-extrabold text-[#1E3A8A]">
      UniVolunteer — Khung Hệ thống &amp; Module Xác thực (Sprint 1 - TV1)
    </h1>
    <p className="text-sm text-slate-600">
      Module xác thực (Đăng ký Sinh viên/Quản lý, Quên mật khẩu OTP và Hồ sơ điểm) đã sẵn sàng.
      Các phân hệ Trang chủ, Thời khóa biểu và Quản trị sẽ được ghép tiếp qua PR của thành viên 2,
      3 và 4.
    </p>
    <div className="flex flex-wrap justify-center gap-3 pt-2">
      <button
        onClick={() => onNavigate('auth', 'login')}
        className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700"
      >
        Đăng nhập ngay
      </button>
      <button
        onClick={() => onNavigate('auth', 'register-student')}
        className="px-5 py-2.5 rounded-xl border border-blue-300 text-[#1E3A8A] text-sm font-bold hover:bg-blue-50"
      >
        Đăng ký Sinh viên
      </button>
    </div>
  </div>
);

const AppShell: React.FC = () => {
  const { user, loading, pendingCheckIn } = useAuth();
  const [currentPage, setCurrentPage] = useState<PageKey>('home');
  const [authInitialMode, setAuthInitialMode] = useState<AuthMode>('login');
  const [profileOpen, setProfileOpen] = useState(false);

  const navigateTo = (page: PageKey, authMode: AuthMode = 'login') => {
    if (page === 'auth') {
      setAuthInitialMode(authMode);
    }
    setCurrentPage(page);
  };

  useEffect(() => {
    if (loading) return;
    if (!user) {
      if (pendingCheckIn) {
        setAuthInitialMode('login');
        setCurrentPage('auth');
        return;
      }
      if (currentPage !== 'home' && currentPage !== 'auth') {
        setCurrentPage('home');
      }
    } else if (user.role === 'STUDENT' && currentPage === 'auth') {
      setCurrentPage('home');
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id, user?.role, loading, pendingCheckIn]);

  const renderPage = () => {
    if (loading) {
      return (
        <div className="py-20 text-center text-slate-500 text-sm">
          Đang tải hệ thống UniVolunteer...
        </div>
      );
    }
    if (currentPage === 'auth') {
      return <AuthPage onNavigate={navigateTo} initialMode={authInitialMode} />;
    }
    return <StageOneWelcome onNavigate={navigateTo} />;
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#F4F7FB]">
      <Navbar
        currentPage={currentPage}
        onNavigate={(p) => navigateTo(p)}
        onOpenStudentProfile={() => setProfileOpen(true)}
      />
      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-6 sm:py-9">
        {renderPage()}
      </main>
      <footer className="bg-white border-t border-blue-100 py-5 text-center text-xs text-slate-500">
        UniVolunteer — Hệ thống Web Quản lý Tình nguyện viên Trường học (Đồ án Nhập môn Công nghệ
        Phần mềm)
      </footer>
      <StudentProfileModal
        open={profileOpen}
        onClose={() => setProfileOpen(false)}
        onLoggedOut={() => navigateTo('home')}
      />
    </div>
  );
};

export function App() {
  return (
    <AuthProvider>
      <AppShell />
    </AuthProvider>
  );
}

export default App;
