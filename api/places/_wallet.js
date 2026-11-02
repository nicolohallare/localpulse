import crypto from 'crypto';
import forge from 'node-forge';
import { send, fail, SUPABASE_URL, SUPABASE_KEY } from '../_lib.js';
import { SECRET, rpc, bearer, getUser } from '../_server.js';
import { MALLS } from './_mall.js';

// Mall Food Trip card for Apple Wallet and Google Wallet.
//   POST /api/places/wallet?mall=<id>&kind=apple|google  (Bearer user token) -> { url }
//   GET  /api/places/wallet?t=<signed token>                                  -> the .pkpass file
// Progress = different restaurants inside the mall the user checked in at this month (Manila time).
// Keys live in private.app_secrets (read with the server secret): apple_pass_key (PEM),
// apple_pass_cert (base64 DER from Apple), apple_team_id, google_wallet_issuer, google_wallet_key (JSON).

const SITE = 'https://ubebanana.app';
const PASS_TYPE = 'pass.com.ubebanana.foodtrip';
const GOAL = 3;

const secrets = {};
async function secret(key) {
  if (key in secrets) return secrets[key];
  const v = await rpc('get_app_secret', { p_secret: SECRET, p_key: key }).catch(() => null);
  if (v) secrets[key] = v;
  return v || null;
}

// ── Signed links (so Safari can download the pass without a login header) ──
const b64u = (s) => Buffer.from(s).toString('base64url');
function sign(obj) {
  const body = b64u(JSON.stringify(obj));
  return `${body}.${crypto.createHmac('sha256', SECRET).update(body).digest('base64url')}`;
}
function verify(t) {
  const [body, mac] = String(t || '').split('.');
  if (!body || !mac) return null;
  const want = crypto.createHmac('sha256', SECRET).update(body).digest('base64url');
  if (mac.length !== want.length || !crypto.timingSafeEqual(Buffer.from(mac), Buffer.from(want))) return null;
  const o = JSON.parse(Buffer.from(body, 'base64url').toString());
  return o.exp > Date.now() ? o : null;
}

// ── Progress ────────────────────────────────────────────────────────────────
function monthInfo() {
  const now = new Date(Date.now() + 8 * 3600e3); // Manila
  const y = now.getUTCFullYear(); const m = now.getUTCMonth();
  const start = new Date(Date.UTC(y, m, 1) - 8 * 3600e3);
  const end = new Date(Date.UTC(y, m + 1, 0));
  const name = end.toLocaleString('en-US', { month: 'long', timeZone: 'UTC' });
  return { key: `${y}${String(m + 1).padStart(2, '0')}`, start, name, ends: `${name.slice(0, 3)} ${end.getUTCDate()}`, endIso: new Date(Date.UTC(y, m + 1, 1) - 8 * 3600e3).toISOString() };
}

async function progress(token, user, mall) {
  const r = await fetch(`${SITE}/api/places/mall?id=${mall.id}`).then((x) => x.json());
  const inside = (r.places || []).filter((p) => p.inside);
  const ids = inside.map((p) => p.id);
  const month = monthInfo();
  const h = { apikey: SUPABASE_KEY, Authorization: `Bearer ${token}` };
  const q = `visits?select=google_place_id,place_name&user_id=eq.${user.id}&created_at=gte.${month.start.toISOString()}&google_place_id=in.(${ids.map((i) => `"${i}"`).join(',')})`;
  const visits = ids.length ? await fetch(`${SUPABASE_URL}/rest/v1/${q}`, { headers: h }).then((x) => (x.ok ? x.json() : [])) : [];
  const done = [...new Map(visits.map((v) => [v.google_place_id, v.place_name || (inside.find((p) => p.id === v.google_place_id) || {}).name])).values()];
  const prof = await fetch(`${SUPABASE_URL}/rest/v1/profiles?select=display_name&id=eq.${user.id}`, { headers: h }).then((x) => (x.ok ? x.json() : [])).catch(() => []);
  return {
    u: user.id, m: mall.id, n: Math.min(done.length, GOAL), done: done.filter(Boolean).slice(0, 6),
    name: (prof[0] && prof[0].display_name) || 'Ube Banana foodie', mo: month.key,
    lat: r.mall && r.mall.lat, lng: r.mall && r.mall.lng, places: inside.length,
  };
}

const short = (mall) => mall.name.replace('SM City ', '').replace('SM Center ', '').replace('SM ', '');
function texts(p, mall) {
  const left = GOAL - p.n;
  return {
    title: `${short(mall)} Food Trip`,
    status: p.n >= GOAL ? 'Complete! Claim your prize' : `${p.n} of ${GOAL} check-ins`,
    nudge: p.n >= GOAL ? 'You finished the Food Trip. Show this card to claim your prize.' : `${left} more check-in${left === 1 ? '' : 's'} at ${short(mall)} to win`,
    how: `Check in at ${GOAL} different restaurants inside ${mall.name} this month with Ube Banana (ubebanana.app). Each check-in is verified at the restaurant. ${p.places} places to eat to choose from.`,
    done: p.done.length ? p.done.join(' · ') : 'None yet. Your first check-in shows here.',
  };
}

// ── Apple Wallet ────────────────────────────────────────────────────────────
const CRC = new Int32Array(256).map((_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; return c; });
function crc32(buf) { let c = -1; for (const b of buf) c = CRC[(c ^ b) & 255] ^ (c >>> 8); return (c ^ -1) >>> 0; }
function zip(files) { // stored (no compression); passes are small
  const parts = []; const dir = []; let off = 0;
  for (const [name, data] of Object.entries(files)) {
    const nb = Buffer.from(name); const crc = crc32(data);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(crc, 14);
    h.writeUInt32LE(data.length, 18); h.writeUInt32LE(data.length, 22); h.writeUInt16LE(nb.length, 26);
    parts.push(h, nb, data);
    const d = Buffer.alloc(46); d.writeUInt32LE(0x02014b50, 0); d.writeUInt16LE(20, 4); d.writeUInt16LE(20, 6); d.writeUInt32LE(crc, 16);
    d.writeUInt32LE(data.length, 20); d.writeUInt32LE(data.length, 24); d.writeUInt16LE(nb.length, 28); d.writeUInt32LE(off, 42);
    dir.push(d, nb);
    off += 30 + nb.length + data.length;
  }
  const cd = Buffer.concat(dir);
  const e = Buffer.alloc(22); e.writeUInt32LE(0x06054b50, 0); e.writeUInt16LE(dir.length / 2, 8); e.writeUInt16LE(dir.length / 2, 10);
  e.writeUInt32LE(cd.length, 12); e.writeUInt32LE(off, 16);
  return Buffer.concat([...parts, cd, e]);
}

const imgCache = {};
async function img(name) {
  if (!imgCache[name]) imgCache[name] = Buffer.from(await fetch(`${SITE}/wallet/${name}`).then((r) => { if (!r.ok) throw new Error(`missing ${name}`); return r.arrayBuffer(); }));
  return imgCache[name];
}
const wwdrCache = {};
async function wwdr(gen) {
  if (!wwdrCache[gen]) {
    const der = Buffer.from(await fetch(`https://www.apple.com/certificateauthority/AppleWWDRCA${gen}.cer`).then((r) => r.arrayBuffer()));
    wwdrCache[gen] = forge.pki.certificateFromAsn1(forge.asn1.fromDer(der.toString('binary')));
  }
  return wwdrCache[gen];
}

async function applePass(p) {
  const mall = MALLS.find((m) => m.id === p.m);
  const [keyPem, certB64, team] = await Promise.all([secret('apple_pass_key'), secret('apple_pass_cert'), secret('apple_team_id')]);
  if (!keyPem || !certB64 || !team) { const e = new Error('Apple Wallet is not set up yet'); e.status = 503; throw e; }
  const t = texts(p, mall);
  const month = monthInfo();
  const pass = {
    formatVersion: 1, passTypeIdentifier: PASS_TYPE, teamIdentifier: team,
    serialNumber: `ft-${p.m}-${p.mo}-${p.u}`, organizationName: 'Ube Banana', description: `${mall.name} Food Trip card`,
    logoText: 'Ube Banana',
    backgroundColor: 'rgb(36,18,61)', foregroundColor: 'rgb(251,246,233)', labelColor: 'rgb(255,210,63)',
    expirationDate: month.endIso,
    storeCard: {
      headerFields: [{ key: 'month', label: month.name.toUpperCase(), value: `${p.n}/${GOAL}` }],
      primaryFields: [{ key: 'status', label: t.title.toUpperCase(), value: t.status }],
      secondaryFields: [
        { key: 'prize', label: 'PRIZE', value: 'SM Gift Pass' },
        { key: 'ends', label: 'ENDS', value: month.ends },
      ],
      auxiliaryFields: [{ key: 'name', label: 'FOODIE', value: p.name }],
      backFields: [
        { key: 'how', label: 'How it works', value: t.how },
        { key: 'done', label: 'Your check-ins this month', value: t.done },
        { key: 'guide', label: 'Where to eat', value: `${SITE}/mall/${p.m}`, attributedValue: `<a href="${SITE}/mall/${p.m}">Open the ${short(mall)} guide</a>` },
        { key: 'pilot', label: 'About', value: 'SM Food Trip pilot preview by Ube Banana. Prizes and dates are placeholders until the pilot starts.' },
      ],
    },
    barcodes: [{ format: 'PKBarcodeFormatQR', message: `${SITE}/mall/${p.m}?ft=${p.u.slice(0, 8)}`, messageEncoding: 'iso-8859-1', altText: `FT-${p.u.slice(0, 8).toUpperCase()}` }],
    ...(p.lat ? { locations: [{ latitude: p.lat, longitude: p.lng, relevantText: t.nudge }], maxDistance: 300 } : {}),
  };
  const files = { 'pass.json': Buffer.from(JSON.stringify(pass)) };
  for (const n of ['icon.png', 'icon@2x.png', 'icon@3x.png', 'logo.png', 'logo@2x.png', 'logo@3x.png', 'strip.png', 'strip@2x.png', 'strip@3x.png']) files[n] = await img(n);
  const manifest = Object.fromEntries(Object.entries(files).map(([n, b]) => [n, crypto.createHash('sha1').update(b).digest('hex')]));
  files['manifest.json'] = Buffer.from(JSON.stringify(manifest));

  const cert = forge.pki.certificateFromAsn1(forge.asn1.fromDer(Buffer.from(certB64, 'base64').toString('binary')));
  const ou = (cert.issuer.getField('OU') || {}).value || 'G4';
  const p7 = forge.pkcs7.createSignedData();
  p7.content = forge.util.createBuffer(files['manifest.json'].toString('binary'));
  p7.addCertificate(await wwdr(/^G\d$/.test(ou) ? ou : 'G4'));
  p7.addCertificate(cert);
  p7.addSigner({
    key: forge.pki.privateKeyFromPem(keyPem), certificate: cert, digestAlgorithm: forge.pki.oids.sha256,
    authenticatedAttributes: [
      { type: forge.pki.oids.contentType, value: forge.pki.oids.data },
      { type: forge.pki.oids.messageDigest },
      { type: forge.pki.oids.signingTime, value: new Date() },
    ],
  });
  p7.sign({ detached: true });
  files.signature = Buffer.from(forge.asn1.toDer(p7.toAsn1()).getBytes(), 'binary');
  return zip(files);
}

// ── Google Wallet ───────────────────────────────────────────────────────────
function jwt(payload, key) {
  const head = b64u(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const body = b64u(JSON.stringify(payload));
  return `${head}.${body}.${crypto.createSign('RSA-SHA256').update(`${head}.${body}`).sign(key.private_key, 'base64url')}`;
}
async function googleToken(key) {
  const now = Math.floor(Date.now() / 1000);
  const a = jwt({ iss: key.client_email, scope: 'https://www.googleapis.com/auth/wallet_object.issuer', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 }, key);
  const r = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${a}` });
  return (await r.json()).access_token;
}

async function googleLink(p) {
  const mall = MALLS.find((m) => m.id === p.m);
  const [issuer, raw] = await Promise.all([secret('google_wallet_issuer'), secret('google_wallet_key')]);
  if (!issuer || !raw) { const e = new Error('Google Wallet is not set up yet'); e.status = 503; throw e; }
  const key = JSON.parse(raw);
  const t = texts(p, mall);
  const month = monthInfo();
  const classId = `${issuer}.food_trip_${p.m.replace(/-/g, '_')}`;
  const obj = {
    id: `${issuer}.ft_${p.m.replace(/-/g, '_')}_${p.mo}_${p.u.replace(/-/g, '')}`,
    classId, state: 'ACTIVE', hexBackgroundColor: '#24123D',
    logo: { sourceUri: { uri: `${SITE}/wallet/logo-round.png` }, contentDescription: { defaultValue: { language: 'en', value: 'Ube Banana' } } },
    cardTitle: { defaultValue: { language: 'en', value: `Ube Banana · ${t.title}` } },
    subheader: { defaultValue: { language: 'en', value: `${month.name} · ends ${month.ends}` } },
    header: { defaultValue: { language: 'en', value: t.status } },
    heroImage: { sourceUri: { uri: `${SITE}/wallet/strip@3x.png` } },
    textModulesData: [
      { id: 'prize', header: 'Prize', body: 'SM Gift Pass' },
      { id: 'foodie', header: 'Foodie', body: p.name },
      { id: 'done', header: 'Your check-ins this month', body: t.done },
      { id: 'how', header: 'How it works', body: t.how },
    ],
    linksModuleData: { uris: [{ uri: `${SITE}/mall/${p.m}`, description: `Where to eat at ${mall.name}`, id: 'guide' }] },
    barcode: { type: 'QR_CODE', value: `${SITE}/mall/${p.m}?ft=${p.u.slice(0, 8)}`, alternateText: `FT-${p.u.slice(0, 8).toUpperCase()}` },
    validTimeInterval: { end: { date: month.endIso } },
    ...(p.lat ? { locations: [{ latitude: p.lat, longitude: p.lng }] } : {}),
  };
  // If the card is already in someone's Wallet, update it in place so the progress is current.
  try {
    const tok = await googleToken(key);
    await fetch(`https://walletobjects.googleapis.com/walletobjects/v1/genericObject/${encodeURIComponent(obj.id)}`, {
      method: 'PUT', headers: { Authorization: `Bearer ${tok}`, 'Content-Type': 'application/json' }, body: JSON.stringify(obj),
    });
  } catch (e) { /* first save creates it below */ }
  const token = jwt({
    iss: key.client_email, aud: 'google', typ: 'savetowallet', origins: [SITE],
    payload: { genericClasses: [{ id: classId }], genericObjects: [obj] },
  }, key);
  return `https://pay.google.com/gp/v/save/${token}`;
}

export default async function handler(req, res) {
  try {
    if (!SECRET) return send(res, 503, { error: 'Server secret missing' });
    if (req.method === 'GET') {
      const p = verify(req.query.t);
      if (!p) return send(res, 410, { error: 'This link expired. Tap Add to Apple Wallet again.' });
      const buf = await applePass(p);
      res.setHeader('Content-Type', 'application/vnd.apple.pkpass');
      res.setHeader('Content-Disposition', `attachment; filename="UbeBanana-FoodTrip.pkpass"`);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(buf);
    }
    const token = bearer(req);
    const user = await getUser(token);
    if (!user) return send(res, 401, { error: 'Sign in first' });
    const mall = MALLS.find((m) => m.id === String(req.query.mall || ''));
    if (!mall) return send(res, 404, { error: 'Mall not found' });
    const p = await progress(token, user, mall);
    if (String(req.query.kind) === 'google') return send(res, 200, { url: await googleLink(p), progress: p.n });
    if (!(await secret('apple_pass_cert'))) return send(res, 503, { error: 'Apple Wallet is not set up yet' });
    return send(res, 200, { url: `${SITE}/api/places/wallet?t=${sign({ ...p, exp: Date.now() + 10 * 60e3 })}`, progress: p.n });
  } catch (e) {
    fail(res, e);
  }
}
