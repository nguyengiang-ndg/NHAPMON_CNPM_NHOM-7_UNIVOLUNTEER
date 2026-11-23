import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { Router } from 'express';
import { AppError } from '../types/models';
import { AuthRequest } from '../middlewares/auth.middleware';

const MIME_TO_EXT: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

export function createUploadRouter(authenticate: (req: AuthRequest, res: any, next: any) => void) {
  const router = Router();
  const isVercel = process.env.VERCEL === '1';
  const uploadsDir = path.resolve(__dirname, '../../uploads');

  router.post('/base64', authenticate, (req: AuthRequest, res, next) => {
    try {
      const { dataUrl } = req.body as { dataUrl?: string; filename?: string };
      if (!dataUrl || typeof dataUrl !== 'string') {
        throw new AppError('Thiếu dữ liệu ảnh tải lên.', 400);
      }

      const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!match) {
        throw new AppError('Định dạng ảnh không hợp lệ (chỉ hỗ trợ PNG, JPG, WEBP, GIF).', 400);
      }

      const mime = match[1].toLowerCase();
      const ext = MIME_TO_EXT[mime];
      if (!ext) {
        throw new AppError('Loại ảnh không được hỗ trợ (hỗ trợ PNG, JPG, WEBP, GIF).', 400);
      }

      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 3 * 1024 * 1024) {
        throw new AppError('Dung lượng ảnh tối đa là 3MB.', 400);
      }

      if (isVercel) {
        // Trên Vercel Serverless (hệ thống tệp chỉ đọc), trả về trực tiếp dataUrl đã kiểm duyệt
        res.status(201).json({ url: dataUrl });
        return;
      }

      fs.mkdirSync(uploadsDir, { recursive: true });
      const safeFilename = `img-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.${ext}`;
      fs.writeFileSync(path.join(uploadsDir, safeFilename), buffer);

      res.status(201).json({ url: `/uploads/${safeFilename}` });
    } catch (err) {
      next(err);
    }
  });

  return router;
}
