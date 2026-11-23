import fs from 'node:fs';
import path from 'node:path';
import { getDb } from './db/database';
import { ensureAdminAccount } from './db/seed';
import { createApp } from './app';

function loadLocalEnvFiles(): void {
  const candidates = [
    path.resolve(process.cwd(), '.env'),
    path.resolve(process.cwd(), '..', '.env'),
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
  ];

  for (const filePath of candidates) {
    if (!fs.existsSync(filePath)) continue;
    const content = fs.readFileSync(filePath, 'utf8');
    for (const rawLine of content.split(/\r?\n/)) {
      const line = rawLine.trim();
      if (!line || line.startsWith('#')) continue;
      const eqIndex = line.indexOf('=');
      if (eqIndex <= 0) continue;
      const key = line.slice(0, eqIndex).trim();
      let val = line.slice(eqIndex + 1).trim();
      if (
        (val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))
      ) {
        val = val.slice(1, -1);
      }
      if (key && process.env[key] === undefined) {
        process.env[key] = val;
      }
    }
  }
}

loadLocalEnvFiles();

const PORT = Number(process.env.PORT || 4000);

const db = getDb();
ensureAdminAccount(db);

const app = createApp(db);

app.listen(PORT, () => {
  console.log(`UniVolunteer Backend đang chạy tại http://localhost:${PORT}`);
});
