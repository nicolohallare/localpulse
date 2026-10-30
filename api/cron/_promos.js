import { send, trackUse } from '../_lib.js';
import { SECRET, rpc, bearer, getUser } from '../_server.js';

// Bank card dining promos, read from the banks' own promo pages.
// 1) Once a week: a web search per bank finds promo pages published in the last month.
// 2) Every run: up to 6 pages not read in the past week are fetched and read by AI,
//    which keeps only restaurant/café promos and notes discount, branches, minimum spend and end date.
// Each promo links back to the bank's page. Safe to call often: a short cooldown stops repeat runs.
const BANKS = [
  { bank: 'BDO', site: 'bdo.com.ph', q: 'dining promo credit card', re: /^https:\/\/(www\.)?bdo\.com\.ph\/personal\/cards\/credit-and-debit-card-promos\/[^?#]+/ },
  { bank: 'BDO', site: 'deals.bdo.com.ph', q: 'dining restaurant off', re: /^https:\/\/(www\.)?deals\.bdo\.com\.ph\/[^?#]+/ },
  { bank: 'BPI', site: 'bpi.com.ph', q: 'promo dining restaurant', re: /^https:\/\/(www\.)?bpi\.com\.ph\/personal\/rewards-and-promotions\/promos\/[^?#]+/ },
  { bank: 'Metrobank', site: 'metrobank.com.ph', q: 'promos dining discount', re: /^https:\/\/(www\.)?metrobank\.com\.ph\/promos\/[^?#]+/ },
  { bank: 'Security Bank', site: 'securitybank.com', q: 'credit card promo dining', re: /^https:\/\/(www\.)?securitybank\.com\/[^?#]*promo[^?#]*/i },
  { bank: 'RCBC', site: 'rcbccredit.com', q: 'promo dining', re: /^https:\/\/(www\.)?rcbccredit\.com\/[^?#]*promo[^?#]*/i },
  { bank: 'UnionBank', site: 'unionbankph.com', q: 'credit card promo dining', re: /^https:\/\/(www\.)?unionbankph\.com\/[^?#]*promo[^?#]*/i },
  { bank: 'EastWest', site: 'eastwestbanker.com', q: 'promos dining', re: /^https:\/\/(www\.)?eastwestbanker\.com\/promos\/[^?#]+/ },
  { bank: 'HSBC', site: 'hsbc.com.ph', q: 'credit card dining offer', re: /^https:\/\/(www\.)?hsbc\.com\.ph\/[^?#]*(offer|promo)[^?#]*/i },
  { bank: 'China Bank', site: 'chinabank.ph', q: 'credit card promo dining', re: /^https:\/\/(www\.)?chinabank\.ph\/[^?#]*promo[^?#]*/i },
  { bank: 'PNB', site: 'pnb.com.ph', q: 'credit card promo dining', re: /^https:\/\/(www\.)?pnb\.com\.ph\/[^?#]*promo[^?#]*/i },
  { bank: 'AUB', site: 'aub.com.ph', q: 'credit card promo dining', re: /^https:\/\/(www\.)?aub\.com\.ph\/[^?#]*promo[^?#]*/i },
];
const QUEUE = 'promos:queue';
const PER_RUN = 6;
const today = () => new Date(Date.now() + 8 * 3600e3).toISOString().slice(0, 10); // Manila date

const cacheGet = (key) => rpc('cache_get', { p_secret: SECRET, p_key: key }).catch(() => null);
const cachePut = (key, value, ttl) => rpc('cache_put', { p_secret: SECRET, p_key: key, p_value: value, p_ttl: ttl }).catch(() => {});

function norm(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()
    .replace(/&/g, ' and ').replace(/[^a-z0-9 ]/g, ' ').replace(/\s+/g, ' ').trim();
}
const STOP = new Set(['the', 'restaurant', 'resto', 'cafe', 'coffee', 'bar', 'grill', 'kitchen', 'and', 'by', 'at', 'of', 'co',
  'ph', 'manila', 'philippines', 'branch', 'branches', 'all', 'sm', 'mall', 'inc', 'group', 'dining', 'bistro', 'house']);
export function matchWords(name) {
  const w = norm(String(name || '').split(/[-–|(]/)[0]).split(' ').filter((x) => x.length > 2 && !STOP.has(x));
  return w.length ? w.slice(0, 3) : norm(name).split(' ').filter((x) => x.length > 1).slice(0, 2);
}

async function brave(q) {
  const key = process.env.BRAVE_SEARCH_KEY;
  if (!key) return [];
  const params = new URLSearchParams({ q, count: '20', country: 'PH', freshness: 'py' });
  trackUse('brave');
  const r = await fetch(`https://api.search.brave.com/res/v1/web/search?${params}`, { headers: { Accept: 'application/json', 'X-Subscription-Token': key }, signal: AbortSignal.timeout(8000) });
  if (!r.ok) throw new Error(`Search ${r.status}`);
  const d = await r.json();
  const strip = (t) => String(t || '').replace(/<[^>]+>/g, '').replace(/&#x27;|&#39;/g, "'").replace(/&amp;/g, '&').trim();
  return ((d.web && d.web.results) || []).map((x) => ({ url: x.url, snippet: `${strip(x.title)}\n${strip(x.description)}\n${(x.extra_snippets || []).map(strip).join('\n')}`.slice(0, 1500) }));
}

async function discover(queue) {
  const found = { ...(queue.urls || {}) };
  // Two searches per bank (dining + restaurant); pages that already ended are skipped when read.
  await Promise.all(BANKS.flatMap((b) => [`site:${b.site} ${b.q}`, `site:${b.site} restaurant discount promo`].map(async (q) => {
    const hits = await brave(q).catch(() => []);
    hits.forEach((h) => {
      const m = String(h.url).match(b.re);
      if (!m) return;
      if (!found[m[0]]) found[m[0]] = { bank: b.bank, read: null, snippet: h.snippet };
      else if (!found[m[0]].snippet) found[m[0]] = { ...found[m[0]], snippet: h.snippet, read: found[m[0]].error ? null : found[m[0]].read };
    });
  })));
  // Keep the queue small: drop pages not seen again within 60 days.
  return { urls: found, discoveredAt: Date.now() };
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36';

function pageText(html) {
  let h = String(html);
  // Read the page's main content; menus, headers and footers drown out the promo on bank sites.
  const main = h.match(/<main[\s\S]*?<\/main>/i) || h.match(/<article[\s\S]*?<\/article>/i);
  if (main && main[0].length > 500) h = main[0];
  return h
    .replace(/<script[\s\S]*?<\/script>/gi, ' ').replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<(nav|header|footer|noscript|svg|form)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<(br|\/p|\/li|\/h\d|\/tr|\/div)[^>]*>/gi, '\n').replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&#39;|&rsquo;/g, "'").replace(/&[a-z]+;/g, ' ')
    .replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n').trim().slice(0, 16000);
}

// Ask the AI for the restaurant promos in a bank page's text (or screenshots of it).
async function extractPromos({ bank, url, text, images, fromSnippet }) {
  const key = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  trackUse('ai');
  const ai = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    signal: AbortSignal.timeout(images && images.length ? 50000 : 28000),
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 3000,
      messages: [{ role: 'user', content: [...(images || []).map((b64) => ({ type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: b64 } })), { type: 'text', text:
        `Today is ${today()}. Below is ${images && images.length ? 'screenshots of' : fromSnippet ? 'a search-result summary of' : 'the text of'} a ${bank} bank promo page${url ? ` (${url})` : ''}. ` +
        'List ONLY promos at restaurants, cafés, bars, bakeries or food places you can go to (skip hotel rooms, travel, shopping, gadgets, installment plans, and food delivery or ride apps such as Foodpanda, GrabFood or Grab). ' +
        'One entry per restaurant brand. Use only what the page says; do not guess. Skip promos that already ended. Reply with JSON only, no code fences:\n' +
        '{"promos": [{"merchant": "<restaurant name as written>", "branches": "<which branches/locations, or empty if all>", ' +
        '"discount": "<short, e.g. 20% off, Free dessert, 2+1 buffet>", "details": "<one sentence: how to get it, key conditions>", ' +
        '"min_spend": <number in pesos or null>, "ends_on": "<YYYY-MM-DD or empty>", "cards": "<which cards, e.g. BDO credit cards>"}]}\n\n' +
        (text ? `PAGE TEXT:\n${text}` : '') }] }],
    }),
  });
  const data = await ai.json();
  if (!ai.ok) return { error: `ai ${ai.status}` };
  const out = (data.content && data.content[0] && data.content[0].text) || '';
  let parsed;
  try { parsed = JSON.parse(out.slice(out.indexOf('{'), out.lastIndexOf('}') + 1)); } catch (e) { return { error: 'unreadable' }; }
  const rows = (Array.isArray(parsed.promos) ? parsed.promos : []).slice(0, 80).map((p) => {
    const ends = /^\d{4}-\d{2}-\d{2}$/.test(String(p.ends_on || '')) ? p.ends_on : '';
    return {
      bank, cards: String(p.cards || `${bank} cards`).slice(0, 120), merchant: String(p.merchant || '').trim().slice(0, 120),
      match_words: matchWords(p.merchant), branches: String(p.branches || '').slice(0, 160) || null,
      discount: String(p.discount || '').trim().slice(0, 80), details: String(p.details || '').slice(0, 400) || null,
      min_spend: Number.isFinite(Number(p.min_spend)) && Number(p.min_spend) > 0 ? Number(p.min_spend) : null, ends_on: ends,
      ...(fromSnippet ? { details: [String(p.details || '').slice(0, 300), 'See the bank page for the full list and terms.'].filter(Boolean).join(' ') } : {}),
    };
  });
  return { rows };
}

async function readPage(url, bank, snippet) {
  let text = null;
  let fromSnippet = false;
  const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-PH,en;q=0.9' }, signal: AbortSignal.timeout(12000) }).catch(() => null);
  if (r && r.ok) text = pageText(await r.text());
  // Some bank sites block servers; then use the search result's title and description instead.
  if ((!text || text.length < 200) && snippet && snippet.length > 40) { text = snippet; fromSnippet = true; }
  if (r && (r.status === 404 || r.status === 410)) {
    // The bank took the page down: remove its promos.
    await rpc('replace_bank_promos', { p_secret: SECRET, p_source_url: url, p_rows: [] }).catch(() => {});
    return { url, error: 'gone', promos: 0 };
  }
  if (!text || text.length < 40) return { url, error: r ? `fetch ${r.status}` : 'fetch timeout' };
  const ex = await extractPromos({ bank, url, text, fromSnippet });
  if (ex.error) return { url, error: ex.error };
  const rows = ex.rows.filter((p) => p.merchant && p.discount && (!p.ends_on || p.ends_on >= today()) && (!fromSnippet || p.ends_on));
  const saved = await rpc('replace_bank_promos', { p_secret: SECRET, p_source_url: url, p_rows: rows });
  return { url, promos: saved };
}

export default async function handler(req, res) {
  if (!SECRET) return send(res, 503, { error: 'LP_SERVER_SECRET not set' });
  // ?peek=<bank promo url>: show the text the reader sees on that page (bank pages only).
  if (req.query.peek) {
    const url = String(req.query.peek);
    if (!BANKS.some((b) => b.re.test(url))) return send(res, 400, { error: 'Not a bank promo page' });
    const r = await fetch(url, { headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-PH,en;q=0.9' }, signal: AbortSignal.timeout(20000) }).catch((e) => ({ ok: false, status: String(e.message) }));
    if (!r.ok) return send(res, 200, { status: r.status });
    const html = await r.text();
    return send(res, 200, { status: r.status, htmlLength: html.length, text: pageText(html).slice(0, 2500) });
  }
  const ua = String(req.headers['user-agent'] || '');
  const fromCron = ua.includes('vercel-cron');
  const hop = Number(req.query.hop || 0);
  const chained = hop > 0 && req.headers['x-ub-chain'] === SECRET;
  if (!fromCron && !chained) {
    // Anyone may nudge it, but not more than once every 2 minutes.
    const last = await cacheGet('promos:lastrun');
    if (last && Date.now() - last.t < 120e3) return send(res, 429, { error: 'Ran recently, try again in a couple of minutes' });
  }
  await cachePut('promos:lastrun', { t: Date.now() }, 600);

  let queue = (await cacheGet(QUEUE)) || { urls: {}, discoveredAt: 0 };
  let discovered = false;
  if (!queue.discoveredAt || Date.now() - queue.discoveredAt > 6 * 864e5 || req.query.discover === '1') {
    queue = await discover(queue);
    discovered = true;
    await cachePut(QUEUE, queue, 60 * 86400);
  }
  const weekAgo = Date.now() - 10 * 864e5; // re-read each page every 10 days
  const todo = Object.entries(queue.urls).filter(([, v]) => !v.manual && (!v.read || v.read < weekAgo)).slice(0, discovered ? 2 : PER_RUN);
  // Stop waiting after 42 s so the batch always finishes (and starts the next one) inside the 60 s limit.
  const deadline = new Promise((r) => setTimeout(() => r('late'), 42000));
  const results = (await Promise.all(todo.map(([url, v]) => Promise.race([
    readPage(url, v.bank, v.snippet).catch((e) => ({ url, error: String(e.message || e).slice(0, 80) })),
    deadline.then(() => ({ url, error: 'slow' })),
  ]))));
  results.forEach((r) => { queue.urls[r.url] = { ...queue.urls[r.url], read: Date.now(), promos: r.promos || 0, error: r.error || null }; });
  await cachePut(QUEUE, queue, 60 * 86400);
  const left = Object.values(queue.urls).filter((v) => !v.manual && (!v.read || v.read < weekAgo)).length;
  // More pages waiting: start the next batch (up to 25 in a row), so a day's run reads everything.
  if (left > 0 && hop < 25) {
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '');
    if (host) {
      await fetch(`https://${host}/api/cron/promos?hop=${hop + 1}`, { headers: { 'x-ub-chain': SECRET }, signal: AbortSignal.timeout(2500) }).catch(() => {});
    }
  }
  send(res, 200, { discovered, pages: Object.keys(queue.urls).length, read: results, left, hop });
}

// POST /api/cron/import — an admin pastes a bank promo page's text (or screenshots) from their own browser,
// for banks whose sites block servers (e.g. BDO). Body: { bank, url?, text?, images?: [base64 jpeg] }.
export async function importPromos(req, res) {
  if (req.method !== 'POST') return send(res, 405, { error: 'POST only' });
  const token = bearer(req);
  const user = await getUser(token);
  if (!user) return send(res, 401, { error: 'Sign in as an admin first' });
  const isAdmin = await rpc('is_admin', {}, token).catch(() => false);
  if (!isAdmin) return send(res, 403, { error: 'Admins only' });
  const b = req.body || {};
  const bank = String(b.bank || '').trim().slice(0, 40);
  const url = /^https?:\/\//.test(String(b.url || '')) ? String(b.url).trim().slice(0, 500) : '';
  const text = String(b.text || '').replace(/\s+\n/g, '\n').slice(0, 30000);
  const images = (Array.isArray(b.images) ? b.images : []).filter((x) => typeof x === 'string' && x.length < 3e6).slice(0, 5);
  if (bank.length < 2 || (!text.trim() && !images.length)) return send(res, 400, { error: 'Pick the bank and paste the page text or add screenshots' });
  const ex = await extractPromos({ bank, url, text, images });
  if (ex.error) return send(res, 200, { error: `Couldn't read it (${ex.error}). Try again or use screenshots.` });
  const rows = ex.rows.filter((p) => p.merchant && p.discount && (!p.ends_on || p.ends_on >= today()));
  let n = 0;
  if (rows.length) {
    let h = 0; for (const c of text.slice(0, 2000)) h = (h * 31 + c.charCodeAt(0)) | 0;
    const key = url || `manual:${bank}:${today()}:${Math.abs(h)}`;
    n = await rpc('replace_bank_promos', { p_secret: SECRET, p_source_url: key, p_rows: rows });
    if (url) { // the automatic reader leaves this page alone from now on
      const queue = (await cacheGet(QUEUE)) || { urls: {}, discoveredAt: 0 };
      queue.urls[url] = { ...(queue.urls[url] || {}), bank, manual: true, read: Date.now(), promos: n };
      await cachePut(QUEUE, queue, 60 * 86400);
    }
  }
  send(res, 200, { saved: n, promos: rows.map((r) => ({ merchant: r.merchant, discount: r.discount, ends_on: r.ends_on || null })) });
}
