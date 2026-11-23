import React, { useState } from 'react';
import { ImagePlus, PlusCircle, Upload } from 'lucide-react';
import { apiFetch, uploadImageFile } from '../../api/client';
import { toLocalDateTimeInputValue } from '../../utils/format';
import { PageKey } from '../../components/Navbar';

interface Props {
  onNavigate: (page: PageKey) => void;
}

export const ManagerCreateActivityPage: React.FC<Props> = ({ onNavigate }) => {
  const defaultStart = new Date(Date.now() + 72 * 3600 * 1000);
  const defaultEnd = new Date(Date.now() + 76 * 3600 * 1000);
  const defaultDeadline = new Date(Date.now() + 48 * 3600 * 1000);

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [coverImage, setCoverImage] = useState('/uploads/cover-green-sunday.svg');
  const [location, setLocation] = useState('');
  const [startTime, setStartTime] = useState(toLocalDateTimeInputValue(defaultStart));
  const [endTime, setEndTime] = useState(toLocalDateTimeInputValue(defaultEnd));
  const [registrationDeadline, setRegistrationDeadline] = useState(
    toLocalDateTimeInputValue(defaultDeadline)
  );
  const [maxParticipants, setMaxParticipants] = useState(30);
  const [trainingPoints, setTrainingPoints] = useState(5);

  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const handleCoverUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    setErr('');
    try {
      const url = await uploadImageFile(file);
      setCoverImage(url);
    } catch (error: any) {
      setErr(error.message);
    } finally {
      setUploading(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>('/manager/activities', {
        method: 'POST',
        body: JSON.stringify({
          title,
          description,
          coverImage,
          location,
          startTime: new Date(startTime).toISOString(),
          endTime: new Date(endTime).toISOString(),
          registrationDeadline: new Date(registrationDeadline).toISOString(),
          maxParticipants: Number(maxParticipants),
          trainingPoints: Number(trainingPoints)
        })
      });
      setMsg(res.message);
      setTitle('');
      setDescription('');
      setLocation('');
    } catch (error: any) {
      setErr(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto bg-white rounded-3xl border border-blue-100 p-6 sm:p-8 shadow-xs space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1E3A8A] flex items-center gap-2">
          <PlusCircle className="w-6 h-6 text-blue-600" />
          Đăng Hoạt động Tình nguyện mới
        </h1>
        <p className="text-sm text-slate-600 mt-1">
          Hoạt động sau khi gửi sẽ chuyển lên <strong>Admin phê duyệt</strong> trước khi hiển thị
          cho sinh viên đăng ký.
        </p>
      </div>

      {msg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm flex items-center justify-between gap-3">
          <span className="font-semibold">{msg}</span>
          <button
            onClick={() => onNavigate('manager-activities')}
            className="px-3.5 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold shrink-0"
          >
            Xem danh sách của tôi
          </button>
        </div>
      )}
      {err && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-800 text-sm font-medium">
          {err}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">
            Tên hoạt động tình nguyện *
          </label>
          <input
            type="text"
            required
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="VD: Chiến dịch Mùa hè Xanh tại xã Quảng Điền"
            className="w-full px-4 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <div className="space-y-2">
          <label className="block text-sm font-bold text-slate-700">Ảnh nền hoạt động *</label>
          <div className="flex flex-wrap items-center gap-2">
            <label className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-blue-50 border border-blue-200 text-[#1E3A8A] text-xs font-bold cursor-pointer hover:bg-blue-100">
              <Upload className="w-4 h-4 text-blue-600" />
              {uploading ? 'Đang tải ảnh...' : 'Tải ảnh nền từ máy'}
              <input type="file" accept="image/*" onChange={handleCoverUpload} className="hidden" />
            </label>
            {[
              { label: 'Mẫu Chủ nhật Xanh', url: '/uploads/cover-green-sunday.svg' },
              { label: 'Mẫu Hiến máu', url: '/uploads/cover-blood-donation.svg' },
              { label: 'Mẫu Mùa thi', url: '/uploads/cover-exam-support.svg' },
              { label: 'Mẫu Trồng cây', url: '/uploads/cover-plant-trees.svg' }
            ].map((p) => (
              <button
                key={p.url}
                type="button"
                onClick={() => setCoverImage(p.url)}
                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-xs font-medium text-slate-700"
              >
                <ImagePlus className="w-3.5 h-3.5" />
                {p.label}
              </button>
            ))}
          </div>
          <input
            type="text"
            required
            value={coverImage}
            onChange={(e) => setCoverImage(e.target.value)}
            className="font-mono-data w-full px-3.5 py-2 rounded-xl border border-slate-300 text-xs"
          />
          {coverImage && (
            <img
              src={coverImage}
              alt="Ảnh nền"
              className="w-full h-44 object-cover rounded-2xl border border-slate-200"
            />
          )}
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="sm:col-span-2">
            <label className="block text-sm font-bold text-slate-700 mb-1">
              Địa điểm tổ chức *
            </label>
            <input
              type="text"
              required
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="VD: Sân chính Cơ sở 1 - 34 Lê Lợi"
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              Thời gian bắt đầu *
            </label>
            <input
              type="datetime-local"
              required
              value={startTime}
              onChange={(e) => setStartTime(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              Thời gian kết thúc *
            </label>
            <input
              type="datetime-local"
              required
              value={endTime}
              onChange={(e) => setEndTime(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div>
            <label className="block text-sm font-bold text-slate-700 mb-1">
              Hạn chót đăng ký *
            </label>
            <input
              type="datetime-local"
              required
              value={registrationDeadline}
              onChange={(e) => setRegistrationDeadline(e.target.value)}
              className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Số lượng SV *</label>
              <input
                type="number"
                required
                min={1}
                value={maxParticipants}
                onChange={(e) => setMaxParticipants(Number(e.target.value))}
                className="font-mono-data w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm font-bold text-slate-700 mb-1">Điểm RL nhận *</label>
              <input
                type="number"
                required
                min={0}
                max={20}
                value={trainingPoints}
                onChange={(e) => setTrainingPoints(Number(e.target.value))}
                className="font-mono-data w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>
          </div>
        </div>

        <div>
          <label className="block text-sm font-bold text-slate-700 mb-1">
            Mô tả công việc &amp; Lưu ý cho sinh viên *
          </label>
          <textarea
            rows={4}
            required
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Mô tả chi tiết nhiệm vụ tình nguyện viên, trang phục yêu cầu..."
            className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>

        <button
          type="submit"
          disabled={submitting || uploading}
          className="w-full py-3 rounded-xl bg-blue-600 text-white font-bold text-sm hover:bg-blue-700 disabled:opacity-60"
        >
          {submitting ? 'Đang gửi lên Admin...' : 'Gửi Hoạt động lên Admin duyệt'}
        </button>
      </form>
    </div>
  );
};
