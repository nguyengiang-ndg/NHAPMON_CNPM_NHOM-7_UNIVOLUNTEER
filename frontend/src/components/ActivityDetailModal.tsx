import React, { useEffect } from 'react';
import { Award, Calendar, Clock, MapPin, Phone, User, Users, X } from 'lucide-react';
import { Activity } from '../types';
import { formatDateTime } from '../utils/format';

interface ActivityDetailModalProps {
  activity: Activity | null;
  onClose: () => void;
  onRegisterClick: (activity: Activity) => void;
  canRegister?: boolean;
  waitlistInfo?: { status: string; position: number } | null;
}

export const ActivityDetailModal: React.FC<ActivityDetailModalProps> = ({
  activity,
  onClose,
  onRegisterClick,
  canRegister = true,
  waitlistInfo = null
}) => {
  useEffect(() => {
    if (!activity) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [activity, onClose]);

  if (!activity) return null;

  const approvedCount = activity.approved_count ?? 0;
  const maxP = activity.max_participants || 1;
  const progressPct = Math.min(100, Math.round((approvedCount / maxP) * 100));

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="activity-detail-title"
    >
      <div className="bg-white rounded-3xl max-w-2xl w-full max-h-[90vh] overflow-y-auto shadow-2xl border border-blue-100">
        <div className="relative h-56 sm:h-64 bg-slate-100">
          <img
            src={activity.cover_image}
            alt={activity.title}
            className="w-full h-full object-cover"
          />
          <button
            onClick={onClose}
            aria-label="Đóng chi tiết hoạt động"
            className="absolute top-3.5 right-3.5 p-2 rounded-full bg-white/95 text-slate-700 hover:bg-white shadow-md focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <X className="w-5 h-5" />
          </button>
          <div className="absolute bottom-3.5 left-4 flex flex-wrap items-center gap-2">
            <span className="font-mono-data px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-bold shadow">
              +{activity.training_points} điểm rèn luyện
            </span>
            {activity.is_registration_open ? (
              <span className="px-3 py-1 rounded-full bg-white/95 text-[#1E3A8A] text-xs font-bold shadow">
                Đang mở đăng ký
              </span>
            ) : activity.is_waitlist_open ? (
              <span className="px-3 py-1 rounded-full bg-indigo-600 text-white text-xs font-bold shadow">
                Đủ chỗ · Mở danh sách chờ
              </span>
            ) : (
              <span className="px-3 py-1 rounded-full bg-slate-900/85 text-white text-xs font-semibold">
                {activity.is_ended ? 'Đã kết thúc' : 'Đã đóng đăng ký / Đủ chỗ'}
              </span>
            )}
          </div>
        </div>

        <div className="p-6 sm:p-7 space-y-5">
          <div>
            <h2 id="activity-detail-title" className="text-2xl font-extrabold text-slate-900 leading-snug">
              {activity.title}
            </h2>
            <p className="text-slate-600 mt-2.5 text-sm leading-relaxed whitespace-pre-line">
              {activity.description}
            </p>
          </div>

          <div className="p-4 rounded-2xl bg-[#F4F7FB] border border-blue-100 space-y-2">
            <div className="flex items-center justify-between text-xs font-semibold">
              <span className="text-slate-700 inline-flex items-center gap-1.5">
                <Users className="w-4 h-4 text-blue-600" />
                Số lượng sinh viên tham gia
              </span>
              <span className="font-mono-data text-[#1E3A8A] font-bold">
                {approvedCount}/{maxP} đã duyệt
                {(activity.pending_count ?? 0) > 0 && ` (+${activity.pending_count} chờ duyệt)`}
              </span>
            </div>
            <div className="h-2.5 w-full rounded-full bg-blue-100 overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#1E3A8A] to-[#3B82F6]"
                style={{ width: `${progressPct}%` }}
              />
            </div>
            {(activity.waitlist_count ?? 0) > 0 && (
              <div className="text-[11px] font-semibold text-indigo-700">
                Đang có <span className="font-mono-data">{activity.waitlist_count}</span> sinh viên
                trong danh sách chờ chỗ trống
              </div>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 bg-slate-50 p-4 rounded-2xl border border-slate-200 text-sm">
            <div className="flex items-start gap-2.5">
              <MapPin className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs text-slate-500">Địa điểm</div>
                <div className="font-semibold text-slate-800">{activity.location}</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Clock className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs text-slate-500">Hạn chót đăng ký</div>
                <div className="font-mono-data text-xs font-semibold text-slate-800 mt-0.5">
                  {formatDateTime(activity.registration_deadline)}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2.5 sm:col-span-2">
              <Calendar className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs text-slate-500">Thời gian diễn ra</div>
                <div className="font-mono-data text-xs font-semibold text-slate-800 mt-0.5">
                  {formatDateTime(activity.start_time)} → {formatDateTime(activity.end_time)}
                </div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <User className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs text-slate-500">Quản lý hoạt động</div>
                <div className="font-semibold text-slate-800">{activity.manager_name}</div>
              </div>
            </div>
            <div className="flex items-start gap-2.5">
              <Phone className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
              <div>
                <div className="text-xs text-slate-500">SĐT Quản lý</div>
                <div className="font-mono-data font-bold text-[#1E3A8A]">
                  {activity.manager_phone}
                </div>
              </div>
            </div>
          </div>

          <div className="flex items-center justify-end gap-3 pt-2 border-t border-slate-100">
            <button
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 focus:outline-none focus:ring-2 focus:ring-slate-400"
            >
              Đóng
            </button>
            {canRegister && (
              <button
                onClick={() => onRegisterClick(activity)}
                disabled={
                  (!activity.is_registration_open && !activity.is_waitlist_open) ||
                  (!activity.is_registration_open && Boolean(waitlistInfo))
                }
                className={`inline-flex items-center gap-2 px-5 py-2.5 rounded-xl text-white text-sm font-bold disabled:bg-slate-300 transition-colors focus:outline-none focus:ring-2 ${
                  !activity.is_registration_open && activity.is_waitlist_open
                    ? 'bg-indigo-600 hover:bg-indigo-700 focus:ring-indigo-500'
                    : 'bg-blue-600 hover:bg-blue-700 focus:ring-blue-500'
                }`}
              >
                <Award className="w-4 h-4" />
                {activity.is_registration_open
                  ? 'Đăng ký tham gia'
                  : activity.is_waitlist_open
                    ? waitlistInfo
                      ? `Đang ở hàng chờ (#${waitlistInfo.position})`
                      : 'Đăng ký danh sách chờ'
                    : 'Không thể đăng ký'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
