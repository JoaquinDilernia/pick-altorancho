import 'dotenv/config';
import express from 'express';
import cors    from 'cors';
import cron    from 'node-cron';
import { runSync }     from './sync.mjs';
import { getMetadata } from './firebase.mjs';

const app    = express();
const PORT   = process.env.PORT || 3000;
const SECRET = process.env.SYNC_SECRET;
const HOURS  = parseInt(process.env.SYNC_INTERVAL_HOURS || '6', 10);

app.use(cors({
  origin: process.env.ALLOWED_ORIGIN || '*',
}));
app.use(express.json());

function requireToken(req, res, next) {
  const auth = req.headers.authorization || '';
  if (!SECRET || auth !== `Bearer ${SECRET}`) {
    return res.status(401).json({ ok: false, error: 'Unauthorized' });
  }
  next();
}

let syncRunning = false;

app.post('/api/sync', requireToken, async (req, res) => {
  if (syncRunning) return res.status(409).json({ ok: false, error: 'Sync already running' });
  syncRunning = true;
  try {
    const result = await runSync();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('[server] sync error:', err.message);
    res.status(500).json({ ok: false, error: err.message });
  } finally {
    syncRunning = false;
  }
});

app.get('/api/status', requireToken, async (req, res) => {
  try {
    const meta = await getMetadata();
    res.json({ ok: true, running: syncRunning, lastSync: meta });
  } catch (err) {
    res.status(500).json({ ok: false, error: err.message });
  }
});

app.listen(PORT, () => console.log(`[server] listening on :${PORT}`));

// Cron: every HOURS hours, starting from :00
cron.schedule(`0 */${HOURS} * * *`, () => {
  if (syncRunning) { console.log('[cron] sync already running, skipping'); return; }
  console.log('[cron] starting scheduled sync');
  syncRunning = true;
  runSync()
    .then(r => console.log('[cron] sync complete:', r))
    .catch(e => console.error('[cron] sync error:', e.message))
    .finally(() => { syncRunning = false; });
});

console.log(`[server] cron scheduled every ${HOURS}h`);
