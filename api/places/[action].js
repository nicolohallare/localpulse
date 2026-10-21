import { send } from '../_lib.js';
import nearby from './_nearby.js';
import search from './_search.js';
import details from './_details.js';
import names from './_names.js';
import photo from './_photo.js';
import michelin from './_michelin.js';
import menu from './_menu.js';

// One function for all place endpoints (keeps the deployment under Vercel's Hobby function limit):
// /api/places/nearby · /search · /details · /names · /photo · /michelin · /menu
const ROUTES = { nearby, search, details, names, photo, michelin, menu };

export default function handler(req, res) {
  const fn = ROUTES[String(req.query.action || '')];
  if (!fn) return send(res, 404, { error: 'Not found' });
  return fn(req, res);
}
