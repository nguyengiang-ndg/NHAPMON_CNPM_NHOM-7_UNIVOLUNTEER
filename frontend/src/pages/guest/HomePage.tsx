import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  Award,
  BookOpen,
  Calendar,
  Camera,
  CheckCircle2,
  ClipboardCheck,
  Filter,
  MapPin,
  Phone,
  Search,
  Sparkles,
  UserCheck,
  UserPlus,
  Users,
  X
} from 'lucide-react';
import { apiFetch } from '../../api/client';
import { useAuth } from '../../contexts/AuthContext';
import { Activity, WaitlistItem } from '../../types';
import { formatDateTime } from '../../utils/format';
import { ActivityDetailModal } from '../../components/ActivityDetailModal';
import { PageKey } from '../../components/Navbar';
import { AuthMode } from './AuthPage';

interface HomePageProps {
  onNavigate: (page: PageKey, authMode?: AuthMode) => void;
}

export const HomePage: React.FC<HomePageProps> = ({ onNavigate }) => {
  const { user, pendingRegisterActivityId, setPendingRegisterActivityId, refreshUserData } =
    useAuth();
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [onlyAvailable, setOnlyAvailable] = useState(false);
  const [minPoints, setMinPoints] = useState(0);
  const [timeframe, setTimeframe] = useState<'UPCOMING' | 'ALL'>('UPCOMING');

  const [detailActivity, setDetailActivity] = useState<Activity | null>(null);
  const [registerTarget, setRegisterTarget] = useState<Activity | null>(null);
  const [registerMode, setRegisterMode] = useState<'register' | 'waitlist'>('register');
  const [waitlistMap, setWaitlistMap] = useState<Record<number, { status: string; position: number }>>({});
  const [noteToManager, setNoteToManager] = useState('');
  const [confirmChecked, setConfirmChecked] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [feedback, setFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
    conflicts?: Array<{ title: string; start_time: string }>;
  } | null>(null);

  const loadActivities = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      if (onlyAvailable) params.set('onlyAvailable', 'true');
      if (minPoints > 0) params.set('minPoints', String(minPoints));
      params.set('timeframe', timeframe);

      const activitiesPromise = apiFetch<{ activities: Activity[] }>(`/activities?${params.toString()}`);
      const waitlistsPromise =
        user?.role === 'STUDENT'
          ? apiFetch<{ waitlists: WaitlistItem[] }>('/student/waitlists').catch(() => ({ waitlists: [] }))
          : Promise.resolve({ waitlists: [] as WaitlistItem[] });

      const [res, waitRes] = await Promise.all([activitiesPromise, waitlistsPromise]);
      setActivities(res.activities);

      const nextMap: Record<number, { status: string; position: number }> = {};
      for (const w of waitRes.waitlists) {
        nextMap[w.activity_id] = {
          status: w.waitlist_status,
          position: w.queue_position
        };
      }
      setWaitlistMap(nextMap);

      if (user?.role === 'STUDENT' && pendingRegisterActivityId) {
        const matched = res.activities.find((a) => a.id === pendingRegisterActivityId);
        if (matched && (matched.is_registration_open || (matched.is_waitlist_open && !nextMap[matched.id]))) {
          setRegisterTarget(matched);
          setRegisterMode(matched.is_registration_open ? 'register' : 'waitlist');
          setNoteToManager('');
          setConfirmChecked(false);
        }
        setPendingRegisterActivityId(null);
      }
    } catch (e: any) {
      setFeedback({ type: 'error', text: e.message });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadActivities();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onlyAvailable, minPoints, timeframe, user?.id]);

  const handleRegisterClick = (activity: Activity) => {
    setFeedback(null);
    if (!user) {
      setPendingRegisterActivityId(activity.id);
      onNavigate('auth', 'login');
      return;
    }
    if (user.role !== 'STUDENT') {
      setFeedback({
        type: 'error',
        text: 'Chỉ tài khoản Sinh viên mới có thể đăng ký tham gia hoạt động.'
      });
      return;
    }
    setDetailActivity(null);
    setRegisterTarget(activity);
    setRegisterMode(activity.is_registration_open ? 'register' : 'waitlist');
    setNoteToManager('');
    setConfirmChecked(false);
  };

  const handleConfirmRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!registerTarget) return;
    if (!confirmChecked) {
      setFeedback({
        type: 'error',
        text:
          registerMode === 'waitlist'
            ? 'Vui lòng tích xác nhận vào danh sách chờ trước khi gửi.'
            : 'Vui lòng tích xác nhận "Bạn có chắc chắn muốn đăng ký không?" trước khi gửi.'
      });
      return;
    }

    setSubmitting(true);
    setFeedback(null);
    try {
      const endpoint =
        registerMode === 'waitlist'
          ? `/student/activities/${registerTarget.id}/waitlist`
          : `/student/activities/${registerTarget.id}/register`;

      const res = await apiFetch<{
        message: string;
        scheduleConflicts?: Array<{ title: string; start_time: string }>;
      }>(endpoint, {
        method: 'POST',
        body: JSON.stringify({ noteToManager })
      });

      setRegisterTarget(null);
      setFeedback({
        type: 'success',
        text: res.message,
        conflicts: res.scheduleConflicts
      });
      await refreshUserData();
      await loadActivities();
    } catch (err: any) {
      setFeedback({ type: 'error', text: err.message });
    } finally {
      setSubmitting(false);
    }
  };

  const openCampaignsCount = activities.filter((a) => a.is_registration_open).length;
  const totalSlotsCount = activities.reduce((acc, a) => acc + (a.max_participants || 0), 0);
  const totalPointsPool = activities.reduce((acc, a) => acc + (a.training_points || 0), 0);

  return (
    <div className="space-y-9">
      {/* Royal Blue Editorial Hero */}
      <section className="rounded-3xl bg-gradient-to-br from-[#0F2557] via-[#1E3A8A] to-[#2563EB] text-white p-6 sm:p-10 shadow-[0_20px_50px_rgba(30,58,138,0.22)] border border-blue-800 relative overflow-hidden">
        <div
          className="absolute -right-24 -top-24 w-80 h-80 rounded-full bg-sky-400/20 blur-2xl pointer-events-none"
          aria-hidden="true"
        />
        <div
          className="absolute -left-20 -bottom-24 w-72 h-72 rounded-full bg-blue-300/15 blur-2xl pointer-events-none"
          aria-hidden="true"
        />

        <div className="relative z-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-center">
          {/* Left Content */}
          <div className="lg:col-span-7 space-y-5">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-white/12 border border-white/20 text-sky-100 text-xs font-semibold">
              <Sparkles className="w-4 h-4 text-amber-300" />
              Cổng Quản lý Hoạt động Tình nguyện Trường học
            </div>

            <h1 className="text-3xl sm:text-4xl lg:text-[42px] font-extrabold tracking-tight leading-[1.15]">
              Kết nối Sức trẻ Tình nguyện, Minh bạch Điểm Rèn luyện
            </h1>

            <p className="text-blue-100/95 text-sm sm:text-base leading-relaxed max-w-2xl">
              Sinh viên dễ dàng tìm chiến dịch phù hợp, theo dõi thời khóa biểu kèm số điện thoại
              Quản lý, nộp ảnh minh chứng trong vòng 48 giờ và xem lịch sử tích điểm ngay trên
              Avatar cá nhân.
            </p>

            {/* Live Stats */}
            <div className="grid grid-cols-3 gap-3 max-w-lg pt-1">
              <div className="p-3 rounded-2xl bg-white/10 border border-white/15">
                <div className="font-mono-data text-2xl font-bold text-white">
                  {openCampaignsCount}
                </div>
                <div className="text-[11px] text-blue-100 mt-0.5">Hoạt động đang mở</div>
              </div>
              <div className="p-3 rounded-2xl bg-white/10 border border-white/15">
                <div className="font-mono-data text-2xl font-bold text-white">
                  {totalSlotsCount}
                </div>
                <div className="text-[11px] text-blue-100 mt-0.5">Tổng chỉ tiêu SV</div>
              </div>
              <div className="p-3 rounded-2xl bg-white/10 border border-white/15">
                <div className="font-mono-data text-2xl font-bold text-amber-300">
                  +{totalPointsPool}
                </div>
                <div className="text-[11px] text-blue-100 mt-0.5">Tổng điểm RL mở</div>
              </div>
            </div>

            {!user && (
              <div className="flex flex-wrap gap-3 pt-2">
                <button
                  onClick={() => onNavigate('auth', 'register-student')}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-amber-400 text-slate-950 font-extrabold text-sm hover:bg-amber-300 transition-colors shadow-sm focus:outline-none focus:ring-2 focus:ring-amber-300"
                >
                  <UserPlus className="w-4 h-4" />
                  Đăng ký Sinh viên
                </button>
                <button
                  onClick={() => onNavigate('auth', 'login')}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-xl bg-white/14 border border-white/25 text-white font-semibold text-sm hover:bg-white/25 transition-colors focus:outline-none focus:ring-2 focus:ring-white/60"
                >
                  Đăng nhập ngay
                </button>
                <a
                  href="#huong-dan"
                  className="inline-flex items-center gap-1.5 px-4 py-3 rounded-xl text-sky-200 hover:text-white text-sm font-semibold transition-colors"
                >
                  <BookOpen className="w-4 h-4" />
                  Hướng dẫn
                </a>
              </div>
            )}
          </div>

          {/* Right 3-Step Visual Journey Card */}
          <div className="lg:col-span-5">
            <div className="rounded-2xl bg-white text-slate-900 p-5 sm:p-6 shadow-xl border border-blue-100 space-y-4">
              <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                <span className="text-xs font-extrabold text-[#1E3A8A] tracking-wide">
                  Quy trình 3 bước Tham gia &amp; Tích điểm
                </span>
                <span className="font-mono-data text-[11px] font-bold px-2.5 py-0.5 rounded-full bg-blue-100 text-blue-800">
                  48h Rule
                </span>
              </div>

              <div className="space-y-3.5">
                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#1E3A8A] font-mono-data font-bold text-xs flex items-center justify-center shrink-0">
                    01
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                      <ClipboardCheck className="w-4 h-4 text-blue-600" />
                      Đăng ký &amp; Gửi lời nhắn
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Chọn hoạt động sắp diễn ra, gửi lời nhắn cho Quản lý và chờ phê duyệt.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-sky-100 text-sky-900 font-mono-data font-bold text-xs flex items-center justify-center shrink-0">
                    02
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                      <Calendar className="w-4 h-4 text-sky-600" />
                      Theo dõi Thời khóa biểu
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Xem lịch trực, số điện thoại Quản lý ngay bên cạnh để liên hệ hoặc xin hủy.
                    </p>
                  </div>
                </div>

                <div className="flex items-start gap-3">
                  <div className="w-8 h-8 rounded-xl bg-amber-100 text-amber-900 font-mono-data font-bold text-xs flex items-center justify-center shrink-0">
                    03
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-900 flex items-center gap-1.5">
                      <Camera className="w-4 h-4 text-amber-600" />
                      Nộp ảnh minh chứng trong 2 ngày
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">
                      Gửi ảnh việc đã làm trong vòng 48 giờ sau kết thúc để Quản lý xác nhận cộng
                      điểm.
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Hướng dẫn đăng ký tài khoản (Cho người chưa đăng ký) */}
      {!user && (
        <section
          id="huong-dan"
          className="bg-white rounded-3xl border border-blue-100 p-6 sm:p-8 shadow-xs space-y-6"
        >
          <div>
            <h2 className="text-2xl font-extrabold text-[#1E3A8A] flex items-center gap-2">
              <BookOpen className="w-6 h-6 text-blue-600" />
              Hướng dẫn Đăng ký Tài khoản
            </h2>
            <p className="text-sm text-slate-600 mt-1">
              Chọn đúng vai trò của bạn để bắt đầu tìm kiếm hoặc tổ chức hoạt động tình nguyện.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-[#F4F7FB] border border-blue-200 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-bold">
                  <UserPlus className="w-3.5 h-3.5" />
                  Dành cho Sinh viên
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  Tìm kiếm, tham gia hoạt động &amp; tích điểm rèn luyện
                </h3>
                <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-5 leading-relaxed">
                  <li>
                    Đăng ký bằng <strong>Email cá nhân</strong>,{' '}
                    <strong>Mã sinh viên (không trùng)</strong>, Họ tên, Ngày sinh và SĐT.
                  </li>
                  <li>
                    Chọn hoạt động sắp diễn ra, nhấn <strong>Đăng ký</strong>, gửi lời nhắn và chờ
                    Quản lý hoạt động duyệt.
                  </li>
                  <li>
                    Theo dõi <strong>Thời khóa biểu</strong> kèm SĐT Quản lý; nộp ảnh minh chứng
                    trong <strong>2 ngày (48h)</strong> sau kết thúc và xem điểm trên Avatar góc
                    phải.
                  </li>
                </ol>
              </div>
              <button
                onClick={() => onNavigate('auth', 'register-student')}
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-white border border-blue-300 text-[#1E3A8A] font-bold text-sm hover:bg-blue-50 transition-colors"
              >
                Mở form Đăng ký Sinh viên
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 rounded-2xl bg-sky-50/60 border border-sky-200 flex flex-col justify-between space-y-4">
              <div className="space-y-3">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-sky-600 text-white text-xs font-bold">
                  <UserCheck className="w-3.5 h-3.5" />
                  Dành cho Quản lý Hoạt động Tình nguyện
                </div>
                <h3 className="text-lg font-bold text-slate-900">
                  Tổ chức chiến dịch, quản lý sinh viên &amp; xác nhận minh chứng
                </h3>
                <ol className="text-sm text-slate-700 space-y-2 list-decimal pl-5 leading-relaxed">
                  <li>
                    Đăng ký bằng <strong>Email, SĐT, Họ tên, Ngày sinh, Địa chỉ</strong> và chờ{' '}
                    <strong>Admin xét duyệt</strong> tài khoản.
                  </li>
                  <li>
                    Đăng thông tin hoạt động (ảnh nền, ngày diễn ra, số lượng SV, điểm rèn luyện)
                    lên Admin duyệt hoặc yêu cầu hủy hoạt động.
                  </li>
                  <li>
                    Duyệt đơn đăng ký/xin hủy, xem danh sách SV (bảo mật ẩn Email SV) và xác nhận
                    ảnh minh chứng để cộng điểm.
                  </li>
                </ol>
              </div>
              <button
                onClick={() => onNavigate('auth', 'register-manager')}
                className="inline-flex items-center justify-center gap-2 w-full py-2.5 rounded-xl bg-white border border-sky-300 text-sky-900 font-bold text-sm hover:bg-sky-50 transition-colors"
              >
                Mở form Đăng ký Quản lý Hoạt động
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </section>
      )}

      {/* Feedback alert */}
      {feedback && (
        <div
          className={`p-4 rounded-2xl border flex items-start justify-between gap-3 ${
            feedback.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-950'
              : 'bg-rose-50 border-rose-200 text-rose-950'
          }`}
        >
          <div className="space-y-1 text-sm">
            <div className="font-semibold flex items-center gap-2">
              {feedback.type === 'success' ? (
                <CheckCircle2 className="w-5 h-5 text-emerald-600 shrink-0" />
              ) : (
                <AlertTriangle className="w-5 h-5 text-rose-600 shrink-0" />
              )}
              {feedback.text}
            </div>
            {feedback.conflicts && feedback.conflicts.length > 0 && (
              <div className="mt-2 p-3 rounded-xl bg-amber-100/90 border border-amber-300 text-amber-950 text-xs">
                <strong>Cảnh báo trùng lịch:</strong> Hoạt động này trùng khung giờ với{' '}
                {feedback.conflicts.map((c) => `"${c.title}"`).join(', ')} trong lịch của bạn.
              </div>
            )}
          </div>
          <button
            onClick={() => setFeedback(null)}
            aria-label="Đóng thông báo"
            className="p-1 hover:opacity-70"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search & Filter */}
      <section className="bg-white rounded-2xl border border-blue-100 p-4 sm:p-5 shadow-xs space-y-4">
        <div className="flex flex-col md:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              aria-label="Tìm kiếm hoạt động"
              placeholder="Tìm theo tên hoạt động, địa điểm, người quản lý..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadActivities()}
              className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <button
            onClick={loadActivities}
            className="px-6 py-2.5 rounded-xl bg-[#1E3A8A] text-white text-sm font-bold hover:bg-blue-800 transition-colors shrink-0 focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            Tìm kiếm
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-4 text-sm text-slate-700 pt-1">
          <div className="inline-flex items-center gap-1.5 font-semibold text-slate-600">
            <Filter className="w-4 h-4 text-blue-600" />
            Bộ lọc:
          </div>
          <label className="inline-flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={onlyAvailable}
              onChange={(e) => setOnlyAvailable(e.target.checked)}
              className="rounded border-slate-300 text-blue-600 focus:ring-blue-500"
            />
            Chỉ hiện hoạt động còn chỗ &amp; mở đăng ký
          </label>
          <div className="inline-flex items-center gap-2">
            <label htmlFor="filter-timeframe">Thời gian:</label>
            <select
              id="filter-timeframe"
              value={timeframe}
              onChange={(e) => setTimeframe(e.target.value as 'UPCOMING' | 'ALL')}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value="UPCOMING">Sắp / Đang diễn ra</option>
              <option value="ALL">Tất cả hoạt động</option>
            </select>
          </div>
          <div className="inline-flex items-center gap-2">
            <label htmlFor="filter-points">Điểm tối thiểu:</label>
            <select
              id="filter-points"
              value={minPoints}
              onChange={(e) => setMinPoints(Number(e.target.value))}
              className="px-3 py-1.5 rounded-xl border border-slate-300 bg-white text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            >
              <option value={0}>Tất cả</option>
              <option value={5}>Từ 5 điểm trở lên</option>
              <option value={8}>Từ 8 điểm trở lên</option>
            </select>
          </div>
        </div>
      </section>

      {/* Activity Grid */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-2xl font-extrabold text-[#1E3A8A]">
            Danh sách Hoạt động Tình nguyện ({activities.length})
          </h2>
        </div>

        {loading ? (
          <div className="text-center py-12 text-slate-500">Đang tải danh sách hoạt động...</div>
        ) : activities.length === 0 ? (
          <div className="text-center py-12 bg-white rounded-2xl border border-dashed border-slate-300 text-slate-500">
            Không có hoạt động nào phù hợp với bộ lọc hiện tại.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {activities.map((act) => {
              const approved = act.approved_count ?? 0;
              const maxP = act.max_participants || 1;
              const pct = Math.min(100, Math.round((approved / maxP) * 100));

              return (
                <article
                  key={act.id}
                  className="bg-white rounded-3xl border border-blue-100 overflow-hidden shadow-xs hover:shadow-lg transition-shadow duration-200 flex flex-col"
                >
                  <div className="relative h-44 bg-blue-900">
                    <img
                      src={act.cover_image}
                      alt={act.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="font-mono-data absolute top-3 left-3 px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-bold shadow">
                      +{act.training_points} điểm RL
                    </div>
                    <div className="font-mono-data absolute top-3 right-3 px-2.5 py-1 rounded-full bg-white/95 text-[#1E3A8A] text-xs font-bold shadow flex items-center gap-1">
                      <Users className="w-3.5 h-3.5 text-blue-600" />
                      {approved}/{maxP}
                    </div>
                  </div>

                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-3">
                      <h3 className="font-bold text-lg text-slate-900 line-clamp-2 leading-snug">
                        {act.title}
                      </h3>
                      <p className="text-xs text-slate-600 line-clamp-2 leading-relaxed">
                        {act.description}
                      </p>

                      {/* Progress bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[11px] font-medium text-slate-600 gap-2">
                          <span>Đã duyệt: {approved}/{maxP} SV</span>
                          <span className="flex items-center gap-2">
                            {(act.pending_count ?? 0) > 0 && (
                              <span className="text-amber-700 font-semibold">
                                +{act.pending_count} chờ duyệt
                              </span>
                            )}
                            {(act.waitlist_count ?? 0) > 0 && (
                              <span className="text-indigo-700 font-semibold">
                                • {act.waitlist_count} hàng chờ
                              </span>
                            )}
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-blue-100 overflow-hidden">
                          <div
                            className="h-full rounded-full bg-blue-600"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>

                      <div className="space-y-1.5 text-xs text-slate-600 pt-1">
                        <div className="flex items-center gap-2">
                          <Calendar className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="font-mono-data">{formatDateTime(act.start_time)}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <MapPin className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="truncate">{act.location}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <Phone className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          <span className="truncate">
                            QL: {act.manager_name} ({act.manager_phone})
                          </span>
                        </div>
                      </div>
                    </div>

                    {(() => {
                      const waitInfo = waitlistMap[act.id] || null;
                      const isWaitlistAction = !act.is_registration_open && act.is_waitlist_open;
                      const isDisabledForUser =
                        Boolean(user) &&
                        !act.is_registration_open &&
                        (!act.is_waitlist_open || Boolean(waitInfo));

                      return (
                        <div className="pt-3 border-t border-slate-100 flex items-center gap-2.5">
                          <button
                            onClick={() => setDetailActivity(act)}
                            className="flex-1 px-3 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-xs font-bold hover:bg-slate-50 transition-colors focus:outline-none focus:ring-2 focus:ring-slate-400"
                          >
                            Xem chi tiết
                          </button>
                          <button
                            onClick={() => handleRegisterClick(act)}
                            disabled={isDisabledForUser}
                            className={`flex-1 px-3 py-2.5 rounded-xl text-white text-xs font-bold disabled:bg-slate-300 transition-colors inline-flex items-center justify-center gap-1.5 focus:outline-none focus:ring-2 ${
                              isWaitlistAction
                                ? 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
                                : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                            }`}
                          >
                            <Award className="w-3.5 h-3.5" />
                            {!user
                              ? isWaitlistAction
                                ? 'Đăng ký danh sách chờ'
                                : 'Đăng ký'
                              : act.is_registration_open
                                ? 'Đăng ký ngay'
                                : isWaitlistAction
                                  ? waitInfo
                                    ? waitInfo.status === 'NOTIFIED'
                                      ? 'Đã có chỗ trống!'
                                      : `Đang ở hàng chờ (#${waitInfo.position})`
                                    : 'Đăng ký danh sách chờ'
                                  : act.is_ended
                                    ? 'Đã kết thúc'
                                    : 'Đã đóng đăng ký'}
                          </button>
                        </div>
                      );
                    })()}
                  </div>
                </article>
              );
            })}
          </div>
        )}
      </section>

      {/* Modal Chi tiết Hoạt động */}
      <ActivityDetailModal
        activity={detailActivity}
        onClose={() => setDetailActivity(null)}
        onRegisterClick={handleRegisterClick}
        canRegister={!user || user.role === 'STUDENT'}
        waitlistInfo={detailActivity ? waitlistMap[detailActivity.id] || null : null}
      />

      {/* Modal Xác nhận Đăng ký & Gửi lời nhắn cho Quản lý */}
      {registerTarget && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="register-modal-title"
        >
          <form
            onSubmit={handleConfirmRegister}
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-blue-100 space-y-5"
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <h3 id="register-modal-title" className="text-lg font-extrabold text-slate-900">
                  {registerMode === 'waitlist'
                    ? 'Đăng ký Danh sách chờ'
                    : 'Xác nhận Đăng ký Hoạt động'}
                </h3>
                <p className="text-sm text-blue-700 font-bold mt-0.5">{registerTarget.title}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRegisterTarget(null);
                  setFeedback(null);
                }}
                aria-label="Đóng hộp thoại đăng ký"
                className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-500"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {feedback?.type === 'error' && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                {feedback.text}
              </div>
            )}

            <div className="p-4 rounded-2xl bg-[#F4F7FB] border border-blue-100 text-xs text-slate-700 space-y-1.5">
              <div>
                <strong>Thời gian:</strong>{' '}
                <span className="font-mono-data">
                  {formatDateTime(registerTarget.start_time)} →{' '}
                  {formatDateTime(registerTarget.end_time)}
                </span>
              </div>
              <div>
                <strong>Số sinh viên hiện tại:</strong>{' '}
                <span className="font-mono-data">
                  {registerTarget.approved_count ?? 0}/{registerTarget.max_participants}
                </span>{' '}
                đã duyệt ({registerTarget.pending_count ?? 0} đang chờ duyệt)
              </div>
              <div>
                <strong>Điểm rèn luyện nhận được:</strong>{' '}
                <span className="font-mono-data font-bold text-amber-700">
                  +{registerTarget.training_points} điểm
                </span>
              </div>
            </div>

            <div>
              <label
                htmlFor="note-to-manager"
                className="block text-sm font-bold text-slate-800 mb-1.5"
              >
                Bạn có muốn nói gì với Quản lý hoạt động không? (Tùy chọn)
              </label>
              <textarea
                id="note-to-manager"
                rows={3}
                value={noteToManager}
                onChange={(e) => setNoteToManager(e.target.value)}
                placeholder="Ví dụ: Em có thể tham gia ca sáng, em có xe máy hỗ trợ vận chuyển đồ..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <label
              className={`flex items-start gap-2.5 p-3.5 rounded-2xl border cursor-pointer ${
                registerMode === 'waitlist'
                  ? 'bg-indigo-50 border-indigo-200'
                  : 'bg-blue-50 border-blue-200'
              }`}
            >
              <input
                type="checkbox"
                checked={confirmChecked}
                onChange={(e) => setConfirmChecked(e.target.checked)}
                className="mt-0.5 rounded border-blue-400 text-blue-600 focus:ring-blue-500"
              />
              <span className="text-sm text-blue-950 font-medium leading-snug">
                {registerMode === 'waitlist' ? (
                  <>
                    <strong>Hoạt động đã đủ chỗ.</strong> Tôi xác nhận vào danh sách chờ và sẽ nhận{' '}
                    <strong>Thông báo tự động</strong> ngay khi có sinh viên hủy chỗ trống.
                  </>
                ) : (
                  <>
                    <strong>Bạn có chắc chắn muốn đăng ký không?</strong> Đơn đăng ký sẽ được gửi
                    đến Quản lý hoạt động xem xét và phê duyệt.
                  </>
                )}
              </span>
            </label>

            <div className="flex justify-end gap-2.5 pt-1">
              <button
                type="button"
                onClick={() => {
                  setRegisterTarget(null);
                  setFeedback(null);
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50"
              >
                Hủy bỏ
              </button>
              <button
                type="submit"
                disabled={submitting}
                className={`px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:opacity-60 ${
                  registerMode === 'waitlist'
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-blue-600 hover:bg-blue-700'
                }`}
              >
                {submitting
                  ? 'Đang gửi...'
                  : registerMode === 'waitlist'
                    ? 'Xác nhận, Vào danh sách chờ'
                    : 'Chắc chắn, Gửi đăng ký'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
