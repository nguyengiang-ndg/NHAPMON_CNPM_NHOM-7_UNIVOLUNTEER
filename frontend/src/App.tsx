import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Navbar, PageKey } from './components/Navbar';
import { HomePage } from './pages/guest/HomePage';
import { AuthMode, AuthPage } from './pages/guest/AuthPage';
import { StudentProfileModal } from './pages/student/StudentProfileModal';
import { ManagerCreateActivityPage } from './pages/manager/ManagerCreateActivityPage';

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
    } else if (user.role === 'MANAGER' && (currentPage === 'home' || currentPage === 'auth')) {
      setCurrentPage('manager-create');
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

    switch (currentPage) {
      case 'home':
        return <HomePage onNavigate={navigateTo} />;
      case 'auth':
        return <AuthPage onNavigate={navigateTo} initialMode={authInitialMode} />;
      case 'manager-create':
        return user?.role === 'MANAGER' ? (
          <ManagerCreateActivityPage onNavigate={navigateTo} />
        ) : (
          <HomePage onNavigate={navigateTo} />
        );
      default:
        return <HomePage onNavigate={navigateTo} />;
    }
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
