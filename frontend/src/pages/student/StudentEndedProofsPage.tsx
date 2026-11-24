import React, { useEffect, useState } from 'react';
import { Camera, CheckCircle2, Clock, Lock, MapPin, Upload, X } from 'lucide-react';
import { apiFetch, uploadImageFile } from '../../api/client';
import { StatusBadge } from '../../components/StatusBadge';
import { EndedActivityForStudent } from '../../types';
import { formatDateTime, formatRemainingTime } from '../../utils/format';

export const StudentEndedProofsPage: React.FC = () => {
  const [activities, setActivities] = useState<EndedActivityForStudent[]>([]);
  const [proofWindowHours, setProofWindowHours] = useState<number>(48);
  const [requireCheckInForProof, setRequireCheckInForProof] = useState<boolean>(true);
  const [loading, setLoading] = useState(true);
  const [msg, setMsg] = useState('');
  const [err, setErr] = useState('');

  const [selected, setSelected] = useState<EndedActivityForStudent | null>(null);
  const [imageUrl, setImageUrl] = useState('');
  const [description, setDescription] = useState('');
  const [uploadingFile, setUploadingFile] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const loadEnded = async () => {
    setLoading(true);
    try {
      const res = await apiFetch<{
        activities: EndedActivityForStudent[];
        proofWindowHours?: number;
        requireCheckInForProof?: boolean;
      }>('/student/ended-activities');
      setActivities(res.activities);
      if (typeof res.proofWindowHours === 'number' && res.proofWindowHours > 0) {
        setProofWindowHours(res.proofWindowHours);
      }
      if (typeof res.requireCheckInForProof === 'boolean') {
        setRequireCheckInForProof(res.requireCheckInForProof);
      }
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadEnded();
  }, []);

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
    setErr('');
    try {
      const uploadedUrl = await uploadImageFile(file);
      setImageUrl(uploadedUrl);
    } catch (error: any) {
      setErr(error.message);
    } finally {
      setUploadingFile(false);
    }
  };

  const handleSubmitProof = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected) return;
    if (!imageUrl.trim()) {
      setErr('Vui lòng tải lên ảnh minh chứng từ thiết bị của bạn.');
      return;
    }

    setSubmitting(true);
    setMsg('');
    setErr('');
    try {
      const res = await apiFetch<{ message: string }>(
        `/student/registrations/${selected.registration_id}/proof`,
        {
          method: 'POST',
          body: JSON.stringify({ imageUrl, description })
        }
      );
      setSelected(null);
      setImageUrl('');
      setDescription('');
      setMsg(res.message);
      await loadEnded();
    } catch (error: any) {
      setErr(error.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-extrabold text-[#1E3A8A]">
          Hoạt động đã diễn ra xong &amp; Nộp Ảnh Minh chứng
        </h1>
        <div className="mt-3 p-4 rounded-2xl bg-amber-50 border border-amber-200 text-amber-950 text-sm flex items-start gap-3">
          <Clock className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
          <div>
            <strong>Quy tắc {proofWindowHours} giờ:</strong> Các hoạt động đã kết thúc chỉ hiển thị
            tại đây trong vòng <strong>{proofWindowHours} giờ kể từ lúc kết thúc</strong> để bạn gửi
            ảnh minh chứng những việc đã làm. Hết thời hạn này, hoạt động sẽ tự động biến mất khỏi
            danh sách.
          </div>
        </div>
      </div>

      {msg && (
        <div className="p-4 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-sm font-semibold">
          {msg}
        </div>
      )}
      {err && (
        <div className="p-4 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-sm font-semibold">
          {err}
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-slate-500">Đang tải danh sách...</div>
      ) : activities.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-3xl border border-dashed border-slate-300 text-slate-500">
          Hiện không có hoạt động nào đã kết thúc trong vòng 2 ngày qua.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {activities.map((item) => {
            const windowMs = proofWindowHours * 60 * 60 * 1000;
            const pctLeft = Math.min(
              100,
              Math.max(4, Math.round((item.remaining_ms / windowMs) * 100))
            );
            return (
              <div
                key={item.registration_id}
                className="bg-white rounded-3xl border border-blue-100 overflow-hidden shadow-xs flex flex-col justify-between"
              >
                <div>
                  <div className="relative h-40 bg-blue-900">
                    <img
                      src={item.cover_image}
                      alt={item.title}
                      className="w-full h-full object-cover"
                    />
                    <div className="font-mono-data absolute top-3 left-3 px-3 py-1 rounded-full bg-amber-500 text-white text-xs font-bold shadow flex items-center gap-1.5">
                      <Clock className="w-3.5 h-3.5" />
                      {formatRemainingTime(item.remaining_ms)}
                    </div>
                    <div className="font-mono-data absolute top-3 right-3 px-3 py-1 rounded-full bg-blue-600 text-white text-xs font-bold shadow">
                      +{item.training_points} điểm RL
                    </div>
                  </div>

                  <div className="p-5 space-y-3.5">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className="font-extrabold text-lg text-slate-900 leading-snug">
                        {item.title}
                      </h3>
                      {item.proof_status ? (
                        <StatusBadge status={item.proof_status} />
                      ) : (
                        <StatusBadge status="PENDING" customLabel="Chưa nộp ảnh" />
                      )}
                    </div>

                    <div className="p-3 rounded-2xl bg-amber-50/70 border border-amber-200/80 space-y-1.5">
                      <div className="flex items-center justify-between text-[11px] font-bold text-amber-900">
                        <span>Thời hạn nộp minh chứng ({proofWindowHours}h)</span>
                        <span className="font-mono-data">
                          {formatRemainingTime(item.remaining_ms)}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-amber-200/70 overflow-hidden">
                        <div
                          className="h-full rounded-full bg-amber-500"
                          style={{ width: `${pctLeft}%` }}
                        />
                      </div>
                    </div>

                    <div className="text-xs text-slate-600 space-y-1">
                      <div>
                        Kết thúc lúc:{' '}
                        <span className="font-mono-data font-semibold">
                          {formatDateTime(item.end_time)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1">
                        <MapPin className="w-3.5 h-3.5 text-blue-600" />
                        {item.location}
                      </div>
                    </div>

                    {item.proof_image_url && (
                      <div className="p-3.5 rounded-2xl bg-[#F4F7FB] border border-blue-100 space-y-2">
                        <div className="text-xs font-bold text-[#1E3A8A]">
                          Ảnh minh chứng đã gửi:
                        </div>
                        <img
                          src={item.proof_image_url}
                          alt="Minh chứng"
                          className="w-full h-36 object-cover rounded-xl border border-slate-200 bg-white"
                        />
                        {item.proof_description && (
                          <p className="text-xs text-slate-700">{item.proof_description}</p>
                        )}
                        {item.proof_reject_reason && (
                          <div className="text-xs text-rose-800 bg-rose-50 p-2.5 rounded-xl border border-rose-200">
                            <strong>Lý do từ chối:</strong> {item.proof_reject_reason}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                <div className="px-5 pb-5 space-y-2.5">
                  {item.is_checked_in ? (
                    <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs font-semibold flex items-center gap-1.5">
                      <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Đã điểm danh có mặt ({item.checkin_method === 'MANUAL' ? 'Thủ công' : item.checkin_method}) · Đã mở khóa nộp minh chứng
                      </span>
                    </div>
                  ) : requireCheckInForProof ? (
                    <div className="px-3 py-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-medium flex items-start gap-2">
                      <Lock className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                      <span>
                        Bạn chưa điểm danh có mặt tại sự kiện nên chưa mở khóa nộp ảnh minh chứng.
                        Vui lòng liên hệ Quản lý ({item.manager_name} -{' '}
                        <strong className="font-mono-data">{item.manager_phone}</strong>) để được hỗ
                        trợ xác nhận thủ công nếu có mặt.
                      </span>
                    </div>
                  ) : null}

                  {item.proof_status === 'CONFIRMED' ? (
                    <div className="p-3 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs font-bold text-center">
                      Quản lý đã xác nhận minh chứng &amp; cộng +{item.training_points} điểm cho
                      bạn!
                    </div>
                  ) : item.can_submit_proof === false || (requireCheckInForProof && !item.is_checked_in) ? (
                    <button
                      type="button"
                      disabled
                      className="w-full py-2.5 rounded-xl bg-slate-200 text-slate-500 text-sm font-bold inline-flex items-center justify-center gap-2"
                    >
                      <Lock className="w-4 h-4" />
                      Chưa điểm danh · Khóa nộp minh chứng
                    </button>
                  ) : (
                    <button
                      onClick={() => {
                        setSelected(item);
                        setImageUrl(item.proof_image_url || '');
                        setDescription(item.proof_description || '');
                        setErr('');
                      }}
                      className="w-full py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 inline-flex items-center justify-center gap-2 transition-colors focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      <Camera className="w-4 h-4" />
                      {item.proof_id ? 'Cập nhật lại ảnh minh chứng' : 'Gửi ảnh minh chứng'}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {selected && (
        <div
          className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="proof-modal-title"
        >
          <form
            onSubmit={handleSubmitProof}
            className="bg-white rounded-3xl max-w-lg w-full p-6 shadow-2xl border border-blue-100 space-y-4 max-h-[90vh] overflow-y-auto"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 id="proof-modal-title" className="text-lg font-extrabold text-slate-900">
                  Gửi Ảnh Minh Chứng
                </h3>
                <p className="text-xs text-blue-700 font-bold mt-0.5">{selected.title}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setErr('');
                }}
                aria-label="Đóng"
                className="p-1.5 rounded-lg hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {err && (
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold">
                {err}
              </div>
            )}

            <div className="space-y-3">
              <span className="block text-sm font-bold text-slate-700">
                Tải ảnh minh chứng từ máy tính / điện thoại *
              </span>
              <label className="flex flex-col items-center justify-center gap-1.5 p-6 rounded-2xl border-2 border-dashed border-blue-300 bg-blue-50/50 hover:bg-blue-50 cursor-pointer text-sm font-bold text-[#1E3A8A] transition-colors text-center">
                <Upload className="w-6 h-6 text-blue-600" />
                <span>
                  {uploadingFile
                    ? 'Đang nén và tải ảnh lên...'
                    : imageUrl
                      ? 'Nhấn để đổi ảnh minh chứng khác'
                      : 'Nhấn để chọn ảnh minh chứng (PNG, JPG, WEBP)'}
                </span>
                <span className="text-[11px] font-normal text-slate-500">
                  Ảnh chụp trực tiếp tại buổi hoạt động tình nguyện
                </span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleFileChange}
                  className="hidden"
                />
              </label>

              {imageUrl && (
                <img
                  src={imageUrl}
                  alt="Xem trước ảnh minh chứng"
                  className="w-full h-48 object-cover rounded-2xl border border-slate-200 bg-slate-50"
                />
              )}
            </div>

            <div>
              <label htmlFor="proof-desc" className="block text-sm font-bold text-slate-700 mb-1">
                Mô tả những việc đã làm
              </label>
              <textarea
                id="proof-desc"
                rows={3}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="VD: Em có mặt từ 7h30 đến 11h00, hỗ trợ phân loại rác và trồng 10 cây xanh..."
                className="w-full px-3.5 py-2.5 rounded-xl border border-slate-300 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setSelected(null);
                  setErr('');
                }}
                className="px-4 py-2.5 rounded-xl border border-slate-300 text-sm font-semibold"
              >
                Hủy
              </button>
              <button
                type="submit"
                disabled={submitting || uploadingFile || !imageUrl}
                className="px-5 py-2.5 rounded-xl bg-blue-600 text-white text-sm font-bold hover:bg-blue-700 disabled:opacity-60"
              >
                {submitting ? 'Đang gửi...' : 'Gửi minh chứng'}
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
};
