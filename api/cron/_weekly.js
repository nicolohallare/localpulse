import { send } from '../_lib.js';
import { SECRET, rpc, pushTo } from '../_server.js';

// Runs every Monday 9:00 AM Manila (see vercel.json). Tells people how they finished last week.
// Safe to call more than once: the database only returns results the first time each week.
export default async function handler(req, res) {
  const ua = String(req.headers['user-agent'] || '');
  const cronOk = ua.includes('vercel-cron') ||
    (process.env.CRON_SECRET && req.headers.authorization === `Bearer ${process.env.CRON_SECRET}`);
  if (!cronOk) return send(res, 403, { error: 'Scheduler only' });
  if (!SECRET) return send(res, 503, { error: 'LP_SERVER_SECRET not set' });

  const rows = await rpc('weekly_digest', { p_secret: SECRET }).catch(() => []);
  let sent = 0;
  for (const r of rows || []) {
    const medal = r.rank === 1 ? '🥇' : r.rank === 2 ? '🥈' : r.rank === 3 ? '🥉' : '🍽️';
    // eslint-disable-next-line no-await-in-loop
    sent += await pushTo([r.user_id], {
      title: `${medal} You finished #${r.rank} last week`,
      body: `${r.points} points. A new week just started — check in to climb the board.`,
      url: '/#/ranks',
    });
  }
  send(res, 200, { users: (rows || []).length, sent });
}
