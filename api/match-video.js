import { send, places, shapePlace, LIST_FIELDS, num } from './_lib.js';
import { shapeOembed } from './oembed.js';

// GET /api/match-video?url=<tiktok/youtube link>&lat=..&lng=..
// Reads the video's public caption (oEmbed), asks Claude which restaurant it features,
// and returns likely Google Maps matches near the user. Nothing is stored here.
function platformOf(url) {
  if (/^https:\/\/(www\.|vm\.|vt\.|m\.)?tiktok\.com\//i.test(url)) return 'tiktok';
  if (/^https:\/\/(www\.|m\.)?(youtube\.com|youtu\.be)\//i.test(url)) return 'youtube';
  if (/^https:\/\/(www\.)?instagram\.com\//i.test(url)) return 'instagram';
  if (/^https:\/\/(www\.|m\.)?(facebook\.com|fb\.watch)\//i.test(url)) return 'facebook';
  return null;
}

async function oembed(url, platform) {
  const endpoint = platform === 'tiktok'
    ? `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`
    : platform === 'youtube' ? `https://www.youtube.com/oembed?format=json&url=${encodeURIComponent(url)}` : null;
  if (!endpoint) return {};
  try {
    const r = await fetch(endpoint);
    return r.ok ? shapeOembed(await r.json()) : {};
  } catch (e) {
    return {};
  }
}

async function guessPlaces(caption, author) {
  const key = process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY;
  if (!key || !caption) return [];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({
      model: process.env.CLAUDE_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 300,
      messages: [{
        role: 'user',
        content:
          'This is the caption of a Philippine food video. List the restaurant, cafe, bar or food stall it features ' +
          '(up to 3 if it covers several). Use names exactly as written; @mentions of businesses count. Include the ' +
          'branch or area if stated. Never guess a place that is not named. Reply with JSON only, no code fences: ' +
          '[{"place": "<name>", "area": "<area or empty>"}]\n\n' +
          `CREATOR: ${author || 'unknown'}\nCAPTION: ${String(caption).slice(0, 1500)}`,
      }],
    }),
  });
  const data = await r.json();
  try {
    const arr = JSON.parse(((data.content && data.content[0] && data.content[0].text) || '[]').replace(/```json|```/g, '').trim());
    return Array.isArray(arr) ? arr.filter((x) => x && x.place).slice(0, 3) : [];
  } catch (e) {
    return [];
  }
}

export default async function handler(req, res) {
  const url = String(req.query.url || '').trim().slice(0, 500);
  const platform = platformOf(url);
  if (!platform) return send(res, 400, { error: 'Paste a TikTok, YouTube, Instagram or Facebook link.' });
  const lat = num(req.query.lat, -90, 90, 14.5509);
  const lng = num(req.query.lng, -180, 180, 121.0509);

  const meta = await oembed(url, platform);
  const guesses = await guessPlaces(meta.title, meta.author).catch(() => []);

  const seen = new Set();
  const candidates = [];
  for (const g of guesses) {
    try {
      const data = await places('places:searchText', {
        method: 'POST',
        fieldMask: LIST_FIELDS,
        body: {
          textQuery: [g.place, g.area].filter(Boolean).join(' '),
          pageSize: 2,
          regionCode: 'PH',
          locationBias: { circle: { center: { latitude: lat, longitude: lng }, radius: 30000 } },
        },
      });
      (data.places || []).forEach((p) => {
        if (!seen.has(p.id)) { seen.add(p.id); candidates.push(shapePlace(p, 1)); }
      });
    } catch (e) { /* skip */ }
  }

  send(res, 200, {
    video: { platform, url, ...meta },
    guesses: guesses.map((g) => g.place),
    candidates: candidates.slice(0, 5),
  }, 'public, s-maxage=86400, stale-while-revalidate=3600');
}
