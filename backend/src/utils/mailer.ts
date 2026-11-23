import nodemailer from 'nodemailer';
import { AppError } from '../types/models';

export type OtpEmailDeliveryMode = 'SMTP' | 'RESEND' | 'DEV_CONSOLE';

export interface SendOtpEmailParams {
  toEmail: string;
  fullName: string;
  otpCode: string;
  expiresMinutes: number;
}

export interface OtpEmailResult {
  deliveryMode: OtpEmailDeliveryMode;
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function buildOtpEmailContent(params: SendOtpEmailParams) {
  const safeName = escapeHtml(params.fullName || 'bạn');
  const safeOtp = escapeHtml(params.otpCode);
  const subject = '[UniVolunteer] Mã OTP đặt lại mật khẩu';

  const text = [
    `Xin chào ${params.fullName || 'bạn'},`,
    '',
    `Mã xác thực OTP 6 số để đặt lại mật khẩu tài khoản UniVolunteer của bạn là: ${params.otpCode}`,
    `Mã có hiệu lực trong ${params.expiresMinutes} phút. Vui lòng không chia sẻ mã này cho bất kỳ ai.`,
    '',
    'Nếu bạn không thực hiện yêu cầu này, vui lòng bỏ qua email.',
    'Trân trọng,',
    'Hệ thống Tình nguyện UniVolunteer',
  ].join('\n');

  const html = `
    <div style="font-family: Arial, sans-serif; background-color: #f4f7fb; padding: 24px; color: #0f172a;">
      <div style="max-width: 520px; margin: 0 auto; background: #ffffff; border: 1px solid #e2e8f0; border-radius: 16px; overflow: hidden;">
        <div style="background: linear-gradient(135deg, #1e3a8a, #2563eb); color: #ffffff; padding: 20px 24px;">
          <h2 style="margin: 0; font-size: 18px;">UniVolunteer · Đặt lại mật khẩu</h2>
        </div>
        <div style="padding: 24px; line-height: 1.6; font-size: 14px;">
          <p style="margin-top: 0;">Xin chào <strong>${safeName}</strong>,</p>
          <p>Bạn vừa yêu cầu đặt lại mật khẩu cho tài khoản UniVolunteer. Dưới đây là mã xác thực OTP 6 số của bạn:</p>
          <div style="margin: 20px 0; padding: 16px; background: #eff6ff; border: 1px dashed #2563eb; border-radius: 12px; text-align: center;">
            <span style="font-family: monospace; font-size: 28px; font-weight: 700; letter-spacing: 6px; color: #1e3a8a;">${safeOtp}</span>
          </div>
          <p>Mã OTP có hiệu lực trong <strong>${params.expiresMinutes} phút</strong>. Tuyệt đối không chia sẻ mã này cho bất kỳ ai.</p>
          <p style="color: #64748b; font-size: 12px; margin-bottom: 0;">Nếu bạn không yêu cầu đặt lại mật khẩu, hãy bỏ qua email này.</p>
        </div>
      </div>
    </div>
  `.trim();

  return { subject, text, html };
}

export async function sendPasswordResetOtpEmail(
  params: SendOtpEmailParams
): Promise<OtpEmailResult> {
  const { subject, text, html } = buildOtpEmailContent(params);

  const smtpUser = process.env.SMTP_USER?.trim();
  const smtpPass = process.env.SMTP_PASS?.trim();
  if (smtpUser && smtpPass) {
    const port = Number(process.env.SMTP_PORT || 465);
    const host = process.env.SMTP_HOST?.trim() || 'smtp.gmail.com';
    const transporter = nodemailer.createTransport({
      host,
      port,
      secure: port === 465,
      auth: { user: smtpUser, pass: smtpPass },
    });

    try {
      await transporter.sendMail({
        from: process.env.SMTP_FROM?.trim() || `UniVolunteer <${smtpUser}>`,
        to: params.toEmail,
        subject,
        text,
        html,
      });
      return { deliveryMode: 'SMTP' };
    } catch (err) {
      console.error('[UniVolunteer][SMTP Error]', err);
      throw new AppError(
        'Không thể gửi email OTP qua máy chủ SMTP lúc này. Vui lòng thử lại sau.',
        502
      );
    }
  }

  const resendApiKey = process.env.RESEND_API_KEY?.trim();
  if (resendApiKey) {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: process.env.SMTP_FROM?.trim() || 'UniVolunteer <onboarding@resend.dev>',
        to: [params.toEmail],
        subject,
        html,
        text,
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      console.error('[UniVolunteer][Resend Error]', res.status, detail);
      throw new AppError(
        'Không thể gửi email OTP qua Resend lúc này. Vui lòng thử lại sau.',
        502
      );
    }
    return { deliveryMode: 'RESEND' };
  }

  if (process.env.VERCEL === '1') {
    throw new AppError(
      'Hệ thống chưa cấu hình máy chủ gửi email (SMTP_USER / SMTP_PASS hoặc RESEND_API_KEY). Vui lòng liên hệ quản trị viên.',
      503
    );
  }

  console.log(
    `[UniVolunteer][DEV OTP] Email: ${params.toEmail} | Họ tên: ${params.fullName} | OTP: ${params.otpCode} (Hết hạn sau ${params.expiresMinutes} phút)`
  );
  return { deliveryMode: 'DEV_CONSOLE' };
}
