// api/nearby-places.js
// Fetches real restaurants/cafes near a lat/lng using Google Places API
// Vercel runs this as a serverless function — your API key stays secret

export default async function handler(req, res) {
  // Allow your app to call this from the browser
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { lat, lng, type = 'restaurant', radius = 1500 } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'lat and lng are required' });
  }

  const key = process.env.GOOGLE_MAPS_KEY;
  if (!key) return res.status(500).json({ error: 'Google Maps key not configured' });

  try {
    // Step 1: Get nearby places
    const searchUrl = `https://maps.googleapis.com/maps/api/place/nearbysearch/json?location=${lat},${lng}&radius=${radius}&type=${type}&key=${key}`;
    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.status !== 'OK' && searchData.status !== 'ZERO_RESULTS') {
      return res.status(500).json({ error: searchData.status, message: searchData.error_message });
    }

    // Step 2: Format and enrich each place
    const places = await Promise.all(
      (searchData.results || []).slice(0, 10).map(async (place, index) => {
        // Get photo URL if available
        let photoUrl = null;
        if (place.photos && place.photos[0]) {
          const ref = place.photos[0].photo_reference;
          photoUrl = `https://maps.googleapis.com/maps/api/place/photo?maxwidth=800&photo_reference=${ref}&key=${key}`;
        }

        // Map Google price_level (0-4) to our $ symbols
        const priceMap = { 0: 'Free', 1: '$', 2: '$$', 3: '$$$', 4: '$$$$' };

        return {
          id: place.place_id,
          name: place.name,
          cat: place.types
            ? place.types[0].replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())
            : 'Restaurant',
          addr: place.vicinity,
          lat: place.geometry.location.lat,
          lng: place.geometry.location.lng,
          rating: place.rating || 0,
          reviews: place.user_ratings_total || 0,
          price: priceMap[place.price_level] || '$$',
          open: place.opening_hours?.open_now ?? null,
          hero: photoUrl,
          google_place_id: place.place_id,
          rank: index + 1,
          // We'll compute real scores once we fetch reviews
          scores: { google: place.rating || 0 },
          // Placeholder — YouTube + TikTok filled by youtube-reviews endpoint
          videos: [],
          feed: [],
          deals: [],
          checkins: 0,
          tags: place.types?.includes('bar') ? ['Bar'] :
                place.rating >= 4.5 ? ['Highly Rated'] :
                place.user_ratings_total > 500 ? ['Popular'] : [],
        };
      })
    );

    return res.status(200).json({ places });

  } catch (err) {
    console.error('nearby-places error:', err);
    return res.status(500).json({ error: 'Failed to fetch places', details: err.message });
  }
}
