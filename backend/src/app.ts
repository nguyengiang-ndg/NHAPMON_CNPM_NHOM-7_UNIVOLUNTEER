import fs from 'node:fs';
import path from 'node:path';
import express from 'express';
import cors from 'cors';
import type { SqliteDatabase } from './db/database';
import { createAuthenticateMiddleware, errorHandler } from './middlewares/auth.middleware';
import { createAuthUserRouter } from './routes/auth.routes';
import { createUploadRouter } from './routes/upload.routes';

export function createApp(db: SqliteDatabase) {
  const app = express();

  app.use(cors());
  app.use(express.json({ limit: '5mb' }));

  const uploadsDir = path.resolve(__dirname, '../uploads');
  if (fs.existsSync(uploadsDir)) {
    app.use('/uploads', express.static(uploadsDir));
  }

  app.get('/api/health', (_req, res) => {
    res.json({ status: 'ok', service: 'UniVolunteer API' });
  });

  const authenticate = createAuthenticateMiddleware(db);

  app.use('/api/uploads', createUploadRouter(authenticate));
  app.use('/api', createAuthUserRouter(db, authenticate));

  const frontendDistDir = path.resolve(__dirname, '../../frontend/dist');
  if (process.env.VERCEL !== '1' && fs.existsSync(frontendDistDir)) {
    app.use(express.static(frontendDistDir));
    app.get(/^(?!\/api|\/uploads).*/, (_req, res) => {
      res.sendFile(path.join(frontendDistDir, 'index.html'));
    });
  }

  app.use(errorHandler);

  return app;
}
