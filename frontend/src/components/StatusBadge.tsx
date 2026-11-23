import React from 'react';

const STATUS_MAP: Record<string, { label: string; className: string }> = {
  // User
  ACTIVE: { label: 'Đang hoạt động', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  PENDING: { label: 'Chờ duyệt', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  REJECTED: { label: 'Bị từ chối', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  LOCKED: { label: 'Đã khóa', className: 'bg-slate-200 text-slate-700 border-slate-300' },
  // Activity
  PENDING_APPROVAL: { label: 'Chờ Admin duyệt', className: 'bg-amber-100 text-amber-800 border-amber-200' },
  APPROVED: { label: 'Đã duyệt', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  CANCEL_REQUESTED: { label: 'Chờ duyệt hủy', className: 'bg-orange-100 text-orange-800 border-orange-200' },
  CANCELLED: { label: 'Đã hủy', className: 'bg-slate-100 text-slate-600 border-slate-300' },
  // Proof
  SUBMITTED: { label: 'Chờ xác nhận', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  CONFIRMED: { label: 'Đã cộng điểm', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  // Report
  OPEN: { label: 'Mới tiếp nhận', className: 'bg-rose-100 text-rose-800 border-rose-200' },
  IN_PROGRESS: { label: 'Đang xử lý', className: 'bg-blue-100 text-blue-800 border-blue-200' },
  RESOLVED: { label: 'Đã giải quyết', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  // Waitlist
  WAITING: { label: 'Đang chờ chỗ trống', className: 'bg-indigo-100 text-indigo-800 border-indigo-200' },
  NOTIFIED: { label: 'Đã có chỗ trống!', className: 'bg-emerald-100 text-emerald-800 border-emerald-200' },
  PROMOTED: { label: 'Đã đăng ký chính thức', className: 'bg-blue-100 text-blue-800 border-blue-200' }
};

export const StatusBadge: React.FC<{ status: string; customLabel?: string }> = ({
  status,
  customLabel
}) => {
  const cfg = STATUS_MAP[status] || {
    label: status,
    className: 'bg-slate-100 text-slate-700 border-slate-200'
  };
  return (
    <span
      className={`inline-flex items-center whitespace-nowrap shrink-0 px-2.5 py-0.5 rounded-full text-xs font-semibold border ${cfg.className}`}
    >
      {customLabel || cfg.label}
    </span>
  );
};
