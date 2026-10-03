import { send, places, SERVER_GOOGLE_KEY } from './_lib.js';

// GET /api/health          → which keys are set (true/false only, never the values)
// GET /api/health?probe=1  → also makes one tiny Google Places call to confirm the key works
export default async function handler(req, res) {
  const status = {
    googlePlacesKey: !!process.env.GOOGLE_MAPS_KEY,
    usingKey: process.env.GOOGLE_MAPS_KEY ? 'GOOGLE_MAPS_KEY' : (SERVER_GOOGLE_KEY ? 'browser key fallback' : 'none'),
    mapsBrowserKey: !!(process.env.REACT_APP_GOOGLE_MAPS_KEY || process.env.GOOGLE_MAPS_BROWSER_KEY),
    youtubeKey: !!(process.env.YOUTUBE_API_KEY || SERVER_GOOGLE_KEY),
    claudeKey: !!(process.env.CLAUDE_API_KEY || process.env.ANTHROPIC_API_KEY),
  };
  if (req.query.probe) {
    try {
      await places('places:searchText', {
        method: 'POST',
        fieldMask: 'places.id',
        body: { textQuery: 'restaurant in Bonifacio Global City', pageSize: 1 },
      });
      status.placesApi = 'ok';
    } catch (e) {
      status.placesApi = e.message;
      status.placesHint = e.hint || null;
    }
    try {
      const key = process.env.YOUTUBE_API_KEY || SERVER_GOOGLE_KEY;
      const r = await fetch(`https://www.googleapis.com/youtube/v3/search?part=id&type=video&maxResults=1&q=lechon&key=${key}`);
      const d = await r.json();
      status.youtubeApi = r.ok ? 'ok' : ((d.error && d.error.message) || `error ${r.status}`);
    } catch (e) {
      status.youtubeApi = 'request failed';
    }
  }
  send(res, 200, status);
}
