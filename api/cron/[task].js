import { send } from '../_lib.js';
import weekly from './_weekly.js';
import promos, { importPromos } from './_promos.js';

// Scheduled tasks (see vercel.json): /api/cron/weekly (Monday digest) · /api/cron/promos (bank card promos) · /api/cron/import (admin pastes a bank page).
export const config = { maxDuration: 60 };
const TASKS = { weekly, promos, import: importPromos };

export default function handler(req, res) {
  const fn = TASKS[String(req.query.task || '')];
  if (!fn) return send(res, 404, { error: 'Not found' });
  return fn(req, res);
}
