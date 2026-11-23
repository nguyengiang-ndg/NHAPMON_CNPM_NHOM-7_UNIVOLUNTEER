import React, { useEffect, useState } from 'react';
import {
  ArrowLeft,
  CheckCircle2,
  HeartHandshake,
  KeyRound,
  LogIn,
  Mail,
  ShieldCheck,
  UserCheck,
  UserPlus
} from 'lucide-react';
import { apiFetch } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { User } from '../../types';
import { PageKey } from '../../components/Navbar';

export type AuthMode = 'login' | 'register-student' | 'register-manager';

interface AuthPageProps {
  onNavigate: (page: PageKey) => void;
  initialMode?: AuthMode;
}

export const AuthPage: React.FC<AuthPageProps> = ({ onNavigate, initialMode = 'login' }) => {
  const { setSession, pendingRegisterActivityId, pendingCheckIn } = useAuth();
  const [mode, setMode] = useState<AuthMode>(initialMode);
  const [error, setError] = useState('');
  const [managerSuccessMsg, setManagerSuccessMsg] = useState('');
  const [resetSuccessMsg, setResetSuccessMsg] = useState('');
  const [loading, setLoading] = useState(false);

  const [forgotMode, setForgotMode] = useState(false);
  const [forgotStep, setForgotStep] = useState<1 | 2>(1);
  const [forgotEmail, setForgotEmail] = useState('');
  const [forgotOtp, setForgotOtp] = useState('');
  const [forgotNewPassword, setForgotNewPassword] = useState('');
  const [forgotConfirmPassword, setForgotConfirmPassword] = useState('');
  const [forgotInfoMsg, setForgotInfoMsg] = useState('');
  const [resendCooldown, setResendCooldown] = useState(0);

  useEffect(() => {
    setMode(initialMode);
    setForgotMode(false);
    setResetSuccessMsg('');
    setError('');
  }, [initialMode]);

  useEffect(() => {
    if (resendCooldown <= 0) return;
    const timer = window.setInterval(() => {
      setResendCooldown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [resendCooldown]);

  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  const [svEmail, setSvEmail] = useState('');
  const [svCode, setSvCode] = useState('');
  const [svName, setSvName] = useState('');
  const [svDob, setSvDob] = useState('');
  const [svPhone, setSvPhone] = useState('');
  const [svPassword, setSvPassword] = useState('');

  const [mgEmail, setMgEmail] = useState('');
  const [mgName, setMgName] = useState('');
  const [mgDob, setMgDob] = useState('');
  const [mgPhone, setMgPhone] = useState('');
  const [mgAddress, setMgAddress] = useState('');
  const [mgPassword, setMgPassword] = useState('');

  const openForgotPassword = () => {
    setMode('login');
    setForgotMode(true);
    setForgotStep(1);
    setForgotEmail(loginEmail.trim());
    setForgotOtp('');
    setForgotNewPassword('');
    setForgotConfirmPassword('');
    setForgotInfoMsg('');
    setError('');
    setResetSuccessMsg('');
  };

  const handleRequestOtp = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError('');
    setForgotInfoMsg('');
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string; deliveryMode: string }>(
        '/auth/forgot-password',
        {
          method: 'POST',
          body: JSON.stringify({ email: forgotEmail.trim() })
        }
      );
      setForgotInfoMsg(res.message);
      setForgotStep(2);
      setResendCooldown(60);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!/^\d{6}$/.test(forgotOtp.trim())) {
      setError('Mã OTP phải gồm đúng 6 chữ số.');
      return;
    }
    if (forgotNewPassword.length < 6) {
      setError('Mật khẩu mới phải có ít nhất 6 ký tự.');
      return;
    }
    if (forgotNewPassword !== forgotConfirmPassword) {
      setError('Xác nhận mật khẩu mới không khớp.');
      return;
    }

    setLoading(true);
    try {
      const res = await apiFetch<{ message: string }>('/auth/reset-password', {
        method: 'POST',
        body: JSON.stringify({
          email: forgotEmail.trim(),
          otp: forgotOtp.trim(),
          newPassword: forgotNewPassword
        })
      });
      setForgotMode(false);
      setMode('login');
      setLoginEmail(forgotEmail.trim());
      setLoginPassword('');
      setForgotOtp('');
      setForgotNewPassword('');
      setForgotConfirmPassword('');
      setForgotInfoMsg('');
      setResetSuccessMsg(res.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const navigateAfterLogin = (loggedUser: User) => {
    if (loggedUser.role === 'ADMIN') {
      onNavigate('admin-dashboard');
    } else if (loggedUser.role === 'MANAGER') {
      onNavigate('manager-activities');
    } else {
      onNavigate('home');
    }
  };

  const handleLogin = async (email: string, password: string) => {
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: User }>('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      await setSession(res.token, res.user);
      navigateAfterLogin(res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleStudentRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      const res = await apiFetch<{ token: string; user: User }>('/auth/register-student', {
        method: 'POST',
        body: JSON.stringify({
          email: svEmail,
          studentCode: svCode,
          fullName: svName,
          dob: svDob,
          phone: svPhone,
          password: svPassword
        })
      });
      await setSession(res.token, res.user);
      navigateAfterLogin(res.user);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleManagerRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setManagerSuccessMsg('');
    setLoading(true);
    try {
      const res = await apiFetch<{ message: string }>('/auth/register-manager', {
        method: 'POST',
        body: JSON.stringify({
          email: mgEmail,
          fullName: mgName,
          dob: mgDob,
          phone: mgPhone,
          address: mgAddress,
          password: mgPassword
        })
      });
      setManagerSuccessMsg(res.message);
      setMgEmail('');
      setMgName('');
      setMgDob('');
      setMgPhone('');
      setMgAddress('');
      setMgPassword('');
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-5xl mx-auto space-y-5">
      {pendingRegisterActivityId && (
        <div className="p-4 rounded-2xl bg-amber-50 border border-amber-300 text-amber-950 text-sm font-medium">
          Bạn cần <strong>Đăng nhập</strong> (hoặc <strong>Đăng ký tài khoản Sinh viên</strong>) để
          hoàn tất đăng ký hoạt động tình nguyện vừa chọn.
        </div>
      )}

      {pendingCheckIn && (
        <div className="p-4 rounded-2xl bg-blue-50 border border-blue-300 text-blue-950 text-sm font-medium">
          Bạn vừa quét mã QR điểm danh (mã PIN đã được điền sẵn). Vui lòng{' '}
          <strong>Đăng nhập tài khoản Sinh viên</strong> để hoàn tất xác nhận có mặt.
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* Left Panel: Brand & Account Rules */}
        <div className="lg:col-span-5 space-y-5">
          <div className="rounded-3xl bg-gradient-to-br from-[#0F2557] to-[#1E3A8A] text-white p-6 space-y-4 shadow-md">
            <div className="w-11 h-11 rounded-2xl bg-sky-400/20 border border-sky-300/30 flex items-center justify-center">
              <HeartHandshake className="w-6 h-6 text-sky-200" />
            </div>
            <h1 className="text-2xl font-extrabold leading-snug">
              Tham gia Cộng đồng UniVolunteer
            </h1>
            <p className="text-xs sm:text-sm text-blue-100/90 leading-relaxed">
              Hệ thống phân tách rõ 3 vai trò: <strong>Sinh viên</strong> tham gia &amp; tích điểm,{' '}
              <strong>Quản lý hoạt động</strong> điều phối chiến dịch và <strong>Admin</strong> kiểm
              duyệt minh bạch.
            </p>
          </div>

          <div className="rounded-3xl bg-white border border-blue-100 p-5 space-y-4 shadow-xs">
            <div className="text-xs font-extrabold uppercase tracking-wider text-[#1E3A8A] flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              Quy định Đăng ký Tài khoản
            </div>

            <div className="p-3.5 rounded-2xl bg-blue-50/70 border border-blue-200 space-y-1.5 text-xs">
              <div className="font-bold text-blue-950">Đối với Sinh viên</div>
              <ul className="text-slate-700 space-y-1 list-disc pl-4 leading-relaxed">
                <li>Đăng ký và đăng nhập bằng email cá nhân thông thường (Gmail, Outlook,...).</li>
                <li>
                  <strong>Mã sinh viên</strong> bắt buộc phải chính xác và{' '}
                  <strong>không được trùng</strong>.
                </li>
                <li>Tài khoản được kích hoạt ngay để tìm và đăng ký hoạt động.</li>
              </ul>
            </div>

            <div className="p-3.5 rounded-2xl bg-sky-50/70 border border-sky-200 space-y-1.5 text-xs">
              <div className="font-bold text-sky-950">Đối với Quản lý Hoạt động</div>
              <ul className="text-slate-700 space-y-1 list-disc pl-4 leading-relaxed">
                <li>Điền đầy đủ Email, SĐT, Họ tên, Ngày sinh và Địa chỉ liên hệ.</li>
                <li>Tài khoản sẽ được Admin xét duyệt trước khi có thể đăng hoạt động mới.</li>
              </ul>
            </div>
          </div>
        </div>

        {/* Right Panel: Tabbed Forms */}
        <div className="lg:col-span-7 bg-white rounded-3xl border border-blue-100 shadow-sm overflow-hidden">
          <div className="grid grid-cols-3 border-b border-slate-200 bg-[#F4F7FB]">
            <button
              onClick={() => {
                setMode('login');
                setForgotMode(false);
                setError('');
                setManagerSuccessMsg('');
                setResetSuccessMsg('');
              }}
              className={`py-3.5 px-3 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                mode === 'login'
                  ? 'border-blue-600 text-[#1E3A8A] bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <LogIn className="w-4 h-4" />
              Đăng nhập
            </button>
            <button
              onClick={() => {
                setMode('register-student');
                setForgotMode(false);
                setError('');
                setManagerSuccessMsg('');
                setResetSuccessMsg('');
              }}
              className={`py-3.5 px-3 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                mode === 'register-student'
                  ? 'border-blue-600 text-[#1E3A8A] bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="w-4 h-4" />
              ĐK Sinh viên
            </button>
            <button
              onClick={() => {
                setMode('register-manager');
                setForgotMode(false);
                setError('');
                setManagerSuccessMsg('');
                setResetSuccessMsg('');
              }}
              className={`py-3.5 px-3 text-xs sm:text-sm font-bold flex items-center justify-center gap-1.5 border-b-2 transition-colors ${
                mode === 'register-manager'
                  ? 'border-sky-600 text-sky-800 bg-white'
                  : 'border-transparent text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserCheck className="w-4 h-4" />
              ĐK Quản lý HĐ
            </button>
          </div>

          <div className="p-6 sm:p-8 space-y-5">
            {error && (
              <div className="p-3.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
                {error}
              </div>
            )}

            {resetSuccessMsg && (
              <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-start gap-2.5">
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
                <div>
                  <div className="font-bold text-emerald-800">Đặt lại mật khẩu thành công</div>
                  <p>{resetSuccessMsg}</p>
                </div>
              </div>
            )}

            {managerSuccessMsg && (
              <div className="p-5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 space-y-2">
                <div className="flex items-center gap-2 font-bold text-base text-emerald-700">
                  <CheckCircle2 className="w-5 h-5" />
                  Đăng ký Quản lý Hoạt động thành công!
                </div>
                <p className="text-sm">{managerSuccessMsg}</p>
              </div>
            )}

            {mode === 'login' && !forgotMode && (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  setResetSuccessMsg('');
                  handleLogin(loginEmail, loginPassword);
                }}
                className="space-y-4"
              >
                <div>
                  <label htmlFor="login-email" className="block text-sm font-bold text-slate-700 mb-1">
                    Email
                  </label>
                  <input
                    id="login-email"
                    type="email"
                    required
                    value={loginEmail}
                    onChange={(e) => setLoginEmail(e.target.value)}
                    placeholder="example@gmail.com"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label
                      htmlFor="login-password"
                      className="block text-sm font-bold text-slate-700"
                    >
                      Mật khẩu
                    </label>
                    <button
                      type="button"
                      onClick={openForgotPassword}
                      className="text-xs font-bold text-blue-600 hover:text-blue-800 hover:underline focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1"
                    >
                      Quên mật khẩu?
                    </button>
                  </div>
                  <input
                    id="login-password"
                    type="password"
                    required
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="Nhập mật khẩu"
                    className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
                </button>
              </form>
            )}

            {mode === 'login' && forgotMode && (
              <div className="space-y-4">
                <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-100">
                  <div className="flex items-center gap-2 text-[#1E3A8A] font-extrabold text-base">
                    <KeyRound className="w-5 h-5 text-blue-600" />
                    Khôi phục mật khẩu qua Email OTP
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setForgotMode(false);
                      setError('');
                      setForgotInfoMsg('');
                    }}
                    className="inline-flex items-center gap-1 text-xs font-bold text-slate-600 hover:text-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 rounded px-1.5 py-1"
                  >
                    <ArrowLeft className="w-3.5 h-3.5" />
                    Quay lại Đăng nhập
                  </button>
                </div>

                {forgotStep === 1 ? (
                  <form onSubmit={handleRequestOtp} className="space-y-4">
                    <p className="text-xs sm:text-sm text-slate-600 leading-relaxed">
                      Nhập địa chỉ Email bạn đã dùng để đăng ký tài khoản. Hệ thống sẽ gửi mã xác
                      thực <strong>OTP 6 chữ số</strong> (có hiệu lực trong 10 phút).
                    </p>
                    <div>
                      <label
                        htmlFor="forgot-email"
                        className="block text-sm font-bold text-slate-700 mb-1"
                      >
                        Email tài khoản
                      </label>
                      <input
                        id="forgot-email"
                        type="email"
                        required
                        value={forgotEmail}
                        onChange={(e) => setForgotEmail(e.target.value)}
                        placeholder="example@gmail.com"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60 transition-colors flex items-center justify-center gap-2 focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <Mail className="w-4 h-4" />
                      {loading ? 'Đang gửi mã OTP...' : 'Gửi mã OTP 6 số về Email'}
                    </button>
                  </form>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    {forgotInfoMsg && (
                      <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-900 text-xs sm:text-sm font-medium">
                        {forgotInfoMsg}
                      </div>
                    )}

                    <div className="flex items-center justify-between text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
                      <span>
                        Email nhận OTP: <strong className="text-slate-900">{forgotEmail}</strong>
                      </span>
                      <button
                        type="button"
                        onClick={() => {
                          setForgotStep(1);
                          setError('');
                          setForgotOtp('');
                        }}
                        className="font-bold text-blue-600 hover:text-blue-800 hover:underline"
                      >
                        Đổi email
                      </button>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label
                          htmlFor="forgot-otp"
                          className="block text-sm font-bold text-slate-700"
                        >
                          Mã OTP 6 chữ số
                        </label>
                        <button
                          type="button"
                          disabled={loading || resendCooldown > 0}
                          onClick={() => handleRequestOtp()}
                          className="text-xs font-bold text-blue-600 hover:text-blue-800 disabled:text-slate-400 disabled:no-underline hover:underline"
                        >
                          {resendCooldown > 0
                            ? `Gửi lại mã OTP (${resendCooldown}s)`
                            : 'Gửi lại mã OTP'}
                        </button>
                      </div>
                      <input
                        id="forgot-otp"
                        type="text"
                        inputMode="numeric"
                        maxLength={6}
                        required
                        value={forgotOtp}
                        onChange={(e) =>
                          setForgotOtp(e.target.value.replace(/\D/g, '').slice(0, 6))
                        }
                        placeholder="Nhập 6 chữ số OTP"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-base font-mono-data tracking-[0.35em] text-center font-bold focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="forgot-new-password"
                        className="block text-sm font-bold text-slate-700 mb-1"
                      >
                        Mật khẩu mới (tối thiểu 6 ký tự)
                      </label>
                      <input
                        id="forgot-new-password"
                        type="password"
                        required
                        minLength={6}
                        value={forgotNewPassword}
                        onChange={(e) => setForgotNewPassword(e.target.value)}
                        placeholder="Nhập mật khẩu mới"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <div>
                      <label
                        htmlFor="forgot-confirm-password"
                        className="block text-sm font-bold text-slate-700 mb-1"
                      >
                        Xác nhận mật khẩu mới
                      </label>
                      <input
                        id="forgot-confirm-password"
                        type="password"
                        required
                        minLength={6}
                        value={forgotConfirmPassword}
                        onChange={(e) => setForgotConfirmPassword(e.target.value)}
                        placeholder="Nhập lại mật khẩu mới"
                        className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>

                    <button
                      type="submit"
                      disabled={loading}
                      className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {loading ? 'Đang xác thực...' : 'Xác nhận Đặt lại Mật khẩu'}
                    </button>
                  </form>
                )}
              </div>
            )}

            {mode === 'register-student' && (
              <form onSubmit={handleStudentRegister} className="space-y-4">
                <div className="p-3.5 rounded-xl bg-blue-50 border border-blue-200 text-xs text-blue-950">
                  Sử dụng email cá nhân thông thường (Gmail, Outlook,...).{' '}
                  <strong>Mã sinh viên</strong> bắt buộc phải chính xác và{' '}
                  <strong>không được trùng</strong> với sinh viên khác.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="sv-email" className="block text-xs font-bold text-slate-700 mb-1">
                      Email *
                    </label>
                    <input
                      id="sv-email"
                      type="email"
                      required
                      value={svEmail}
                      onChange={(e) => setSvEmail(e.target.value)}
                      placeholder="tenban@gmail.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="sv-code" className="block text-xs font-bold text-slate-700 mb-1">
                      Mã sinh viên (Không trùng) *
                    </label>
                    <input
                      id="sv-code"
                      type="text"
                      required
                      value={svCode}
                      onChange={(e) => setSvCode(e.target.value)}
                      placeholder="VD: 22T1020099"
                      className="font-mono-data w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm uppercase focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="sv-name" className="block text-xs font-bold text-slate-700 mb-1">
                      Họ và tên *
                    </label>
                    <input
                      id="sv-name"
                      type="text"
                      required
                      value={svName}
                      onChange={(e) => setSvName(e.target.value)}
                      placeholder="Nguyễn Văn A"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="sv-dob" className="block text-xs font-bold text-slate-700 mb-1">
                      Ngày tháng năm sinh *
                    </label>
                    <input
                      id="sv-dob"
                      type="date"
                      required
                      value={svDob}
                      onChange={(e) => setSvDob(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="sv-phone" className="block text-xs font-bold text-slate-700 mb-1">
                      Số điện thoại *
                    </label>
                    <input
                      id="sv-phone"
                      type="tel"
                      required
                      value={svPhone}
                      onChange={(e) => setSvPhone(e.target.value)}
                      placeholder="0901234567"
                      className="font-mono-data w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="sv-pass" className="block text-xs font-bold text-slate-700 mb-1">
                      Mật khẩu (ít nhất 6 ký tự) *
                    </label>
                    <input
                      id="sv-pass"
                      type="password"
                      required
                      minLength={6}
                      value={svPassword}
                      onChange={(e) => setSvPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-blue-500"
                >
                  {loading ? 'Đang tạo tài khoản...' : 'Đăng ký tài khoản Sinh viên'}
                </button>
              </form>
            )}

            {mode === 'register-manager' && (
              <form onSubmit={handleManagerRegister} className="space-y-4">
                <div className="p-3.5 rounded-xl bg-sky-50 border border-sky-200 text-xs text-sky-950 flex items-center gap-2">
                  <KeyRound className="w-4 h-4 shrink-0 text-sky-600" />
                  Sau khi gửi đăng ký, tài khoản Quản lý hoạt động sẽ được Admin kiểm duyệt trước
                  khi kích hoạt.
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="mg-email" className="block text-xs font-bold text-slate-700 mb-1">
                      Email *
                    </label>
                    <input
                      id="mg-email"
                      type="email"
                      required
                      value={mgEmail}
                      onChange={(e) => setMgEmail(e.target.value)}
                      placeholder="quanly@gmail.com"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="mg-phone" className="block text-xs font-bold text-slate-700 mb-1">
                      Số điện thoại *
                    </label>
                    <input
                      id="mg-phone"
                      type="tel"
                      required
                      value={mgPhone}
                      onChange={(e) => setMgPhone(e.target.value)}
                      placeholder="0905123456"
                      className="font-mono-data w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="mg-name" className="block text-xs font-bold text-slate-700 mb-1">
                      Họ và tên *
                    </label>
                    <input
                      id="mg-name"
                      type="text"
                      required
                      value={mgName}
                      onChange={(e) => setMgName(e.target.value)}
                      placeholder="Trần Thị B"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div>
                    <label htmlFor="mg-dob" className="block text-xs font-bold text-slate-700 mb-1">
                      Ngày tháng năm sinh *
                    </label>
                    <input
                      id="mg-dob"
                      type="date"
                      required
                      value={mgDob}
                      onChange={(e) => setMgDob(e.target.value)}
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="mg-addr" className="block text-xs font-bold text-slate-700 mb-1">
                      Địa chỉ *
                    </label>
                    <input
                      id="mg-addr"
                      type="text"
                      required
                      value={mgAddress}
                      onChange={(e) => setMgAddress(e.target.value)}
                      placeholder="34 Lê Lợi, TP. Huế"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                  <div className="sm:col-span-2">
                    <label htmlFor="mg-pass" className="block text-xs font-bold text-slate-700 mb-1">
                      Mật khẩu (ít nhất 6 ký tự) *
                    </label>
                    <input
                      id="mg-pass"
                      type="password"
                      required
                      minLength={6}
                      value={mgPassword}
                      onChange={(e) => setMgPassword(e.target.value)}
                      placeholder="••••••"
                      className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>
                </div>
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-sky-600 text-white font-bold text-sm hover:bg-sky-700 disabled:opacity-60 focus:outline-none focus:ring-2 focus:ring-sky-500"
                >
                  {loading ? 'Đang gửi đăng ký...' : 'Đăng ký Quản lý Hoạt động'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
