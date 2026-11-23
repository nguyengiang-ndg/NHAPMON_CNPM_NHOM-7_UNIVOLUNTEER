import { getDb } from '../backend/src/db/database';
import { ensureAdminAccount } from '../backend/src/db/seed';
import { createApp } from '../backend/src/app';

const db = getDb();
ensureAdminAccount(db);

const app = createApp(db);

export default app;
