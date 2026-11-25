import React, { useEffect, useState } from 'react';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { Navbar, PageKey } from './components/Navbar';
import { HomePage } from './pages/guest/HomePage';
import { AuthMode, AuthPage } from './pages/guest/AuthPage';
import { StudentSchedulePage } from './pages/student/StudentSchedulePage';
import { StudentEndedProofsPage } from './pages/student/StudentEndedProofsPage';
import { StudentProfileModal } from './pages/student/StudentProfileModal';
import { ManagerActivitiesPage } from './pages/manager/ManagerActivitiesPage';
import { ManagerCreateActivityPage } from './pages/manager/ManagerCreateActivityPage';
import { ManagerEndedProofsPage } from './pages/manager/ManagerEndedProofsPage';
import { ReportPage } from './pages/shared/ReportPage';
import { AdminDashboardPage } from './pages/admin/AdminDashboardPage';
import { AdminManagersPage } from './pages/admin/AdminManagersPage';
import { AdminActivitiesPage } from './pages/admin/AdminActivitiesPage';
import { AdminStudentsPage } from './pages/admin/AdminStudentsPage';
import { AdminReportsPage } from './pages/admin/AdminReportsPage';

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
    } else if (user.role === 'ADMIN' && (currentPage === 'home' || currentPage === 'auth')) {
      setCurrentPage('admin-dashboard');
    } else if (user.role === 'MANAGER' && (currentPage === 'home' || currentPage === 'auth')) {
      setCurrentPage('manager-activities');
    } else if (user.role === 'STUDENT' && pendingCheckIn) {
      setCurrentPage('student-schedule');
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
      case 'student-schedule':
        return user?.role === 'STUDENT' ? (
          <StudentSchedulePage />
        ) : (
          <HomePage onNavigate={navigateTo} />
        );
      case 'student-proofs':
        return user?.role === 'STUDENT' ? (
          <StudentEndedProofsPage />
        ) : (
          <HomePage onNavigate={navigateTo} />
        );
      case 'manager-activities':
        return user?.role === 'MANAGER' ? (
          <ManagerActivitiesPage />
        ) : (
          <HomePage onNavigate={navigateTo} />
        );
      case 'manager-create':
        return user?.role === 'MANAGER' ? (
          <ManagerCreateActivityPage onNavigate={navigateTo} />
        ) : (
          <HomePage onNavigate={navigateTo} />
        );
      case 'manager-proofs':
        return user?.role === 'MANAGER' ? (
          <ManagerEndedProofsPage />
        ) : (
          <HomePage onNavigate={navigateTo} />
        );
      case 'reports':
        return user && (user.role === 'STUDENT' || user.role === 'MANAGER') ? (
          <ReportPage />
        ) : (
          <HomePage onNavigate={navigateTo} />
        );
      case 'admin-dashboard':
        return user?.role === 'ADMIN' ? (
          <AdminDashboardPage onNavigate={navigateTo} />
        ) : (
          <HomePage onNavigate={navigateTo} />
        );
      case 'admin-managers':
        return user?.role === 'ADMIN' ? (
          <AdminManagersPage />
        ) : (
          <HomePage onNavigate={navigateTo} />
        );
      case 'admin-activities':
        return user?.role === 'ADMIN' ? (
          <AdminActivitiesPage />
        ) : (
          <HomePage onNavigate={navigateTo} />
        );
      case 'admin-students':
        return user?.role === 'ADMIN' ? (
          <AdminStudentsPage />
        ) : (
          <HomePage onNavigate={navigateTo} />
        );
      case 'admin-reports':
        return user?.role === 'ADMIN' ? (
          <AdminReportsPage />
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
