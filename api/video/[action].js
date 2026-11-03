import { send } from '../_lib.js';
import oembed from './_oembed.js';
import match from './_match.js';
import discover from './_discover.js';
import thumb from './_thumb.js';

// /api/video/oembed?url=…  ·  /api/video/match?url=…&lat=…&lng=…
const ROUTES = { oembed, match, discover, thumb };

export default function handler(req, res) {
  const fn = ROUTES[String(req.query.action || '')];
  if (!fn) return send(res, 404, { error: 'Not found' });
  return fn(req, res);
}
