import { places, shapePlace, send, fail, PLACE_ID_RE } from '../_lib.js';

const FIELDS = [
  'id', 'displayName', 'primaryTypeDisplayName', 'formattedAddress', 'shortFormattedAddress',
  'location', 'rating', 'userRatingCount', 'priceLevel', 'photos',
  'regularOpeningHours.weekdayDescriptions', 'currentOpeningHours.openNow',
  'googleMapsUri', 'websiteUri', 'nationalPhoneNumber',
].join(',');

// GET /api/places/details?id=<google place id>
export default async function handler(req, res) {
  try {
    const id = String(req.query.id || '');
    if (!PLACE_ID_RE.test(id)) return send(res, 400, { error: 'Invalid place id' });
    const data = await places(`places/${id}?languageCode=en&regionCode=PH`, { fieldMask: FIELDS });
    send(res, 200, { place: shapePlace(data) }, 'public, s-maxage=300');
  } catch (e) {
    fail(res, e);
  }
}
