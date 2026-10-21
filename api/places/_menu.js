import { send, SUPABASE_URL } from '../_lib.js';
import { SECRET, rpc, select } from '../_server.js';

// POST /api/places/menu?id=<menu photo id>
// Reads a menu photo someone added (once) and stores the dishes and prices it shows.
// Only photos still marked "pending" are read, so calling it twice costs nothing extra.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function clean(items) {
  if (!Array.isArray(items)) return [];
  return items.slice(0, 150).map((it) => {
    const price = Number(String(it && it.price != null ? it.price : '').replace(/[^0-9.]/g, ''));
    return {
      section: String((it && it.section) || '').trim().slice(0, 40) || null,
      name: String((it && it.name) || '').trim().slice(0, 80),
      price: Number.isFinite(price) && price > 0 && price < 1e6 ? Math.round(price * 100) / 100 : null,
      note: String((it && it.note) || '').trim().slice(0, 80) || null,
    };
  }).filter((it) => it.name);
}

export default async function handler(req, res) {
  const id = String(req.query.id || '');
  if (!UUID_RE.test(id)) return send(res, 400, { error: 'Invalid id' });
  try {
    const rows = await select(`menu_photos?id=eq.${id}&select=id,path,read_status,items,currency`);
    const row = rows && rows[0];
    if (!row) return send(res, 404, { error: 'Menu photo not found' });
    if (row.read_status !== 'pending') return send(res, 200, row);

    const key = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
    if (!key || !SECRET) return send(res, 200, row);

    const img = await fetch(`${SUPABASE_URL}/storage/v1/object/public/take-media/${row.path}`);
    if (!img.ok) throw new Error('Photo not found');
    const b64 = Buffer.from(await img.arrayBuffer()).toString('base64');
    const type = (img.headers.get('content-type') || 'image/jpeg').split(';')[0];

    const ai = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
      body: JSON.stringify({
        model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
        max_tokens: 4000,
        messages: [{
          role: 'user',
          content: [
            { type: 'image', source: { type: 'base64', media_type: type, data: b64 } },
            { type: 'text', text:
              'This photo was added as a restaurant menu. Read the dishes and drinks and their prices exactly as printed. ' +
              'Do not guess or invent anything; if a price is unreadable or missing, use null. Keep names as printed (fix obvious capitalisation only). ' +
              'Use the menu\'s own section headings when there are any. If several prices are shown for sizes, make one item per size with the size in "note". ' +
              'If the photo is not a menu or price list, set "is_menu" to false and return no items. Reply with JSON only, no code fences:\n' +
              '{"is_menu": true, "currency": "<ISO code such as PHP, or empty if unknown>", "items": [{"section": "<heading or empty>", "name": "<dish>", "price": <number or null>, "note": "<size or short note, or empty>"}]}' },
          ],
        }],
      }),
    });
    const data = await ai.json();
    if (!ai.ok) throw new Error((data.error && data.error.message) || `AI ${ai.status}`);
    const text = (data.content && data.content[0] && data.content[0].text) || '';
    const parsed = JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1));
    const items = parsed.is_menu === false ? [] : clean(parsed.items);
    const status = items.length ? 'read' : 'unreadable';
    const currency = String(parsed.currency || '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3) || null;
    await rpc('set_menu_items', { p_secret: SECRET, p_id: id, p_items: items, p_currency: currency, p_status: status });
    send(res, 200, { ...row, items, currency, read_status: status });
  } catch (e) {
    send(res, 200, { error: 'Could not read this menu photo yet' });
  }
}
