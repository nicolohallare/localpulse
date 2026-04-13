// api/aggregate-score.js
// Sends all collected reviews to Claude and gets back:
// - An aggregate score (1-5)
// - A 2-sentence honest summary
// - Sentiment breakdown (positive/neutral/negative %)
// - Suggested tags (e.g. "Must Try", "Late Night", "Value Pick")

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed — use POST' });
  }

  const { placeName, googleReviews = [], youtubeVideos = [], checkinReviews = [] } = req.body;

  if (!placeName) {
    return res.status(400).json({ error: 'placeName is required' });
  }

  const key = process.env.CLAUDE_API_KEY;
  if (!key) return res.status(500).json({ error: 'Claude API key not configured' });

  // Build a readable summary of all the reviews we have
  const reviewLines = [];

  if (googleReviews.length > 0) {
    reviewLines.push('=== GOOGLE REVIEWS ===');
    googleReviews.forEach(r => {
      reviewLines.push(`[${r.stars}/5] ${r.who}: "${r.text}"`);
    });
  }

  if (youtubeVideos.length > 0) {
    reviewLines.push('\n=== YOUTUBE VIDEO REVIEWS ===');
    youtubeVideos.forEach(v => {
      reviewLines.push(`Channel: ${v.channel} | Views: ${v.views} | Title: "${v.title}"`);
      if (v.excerpt) reviewLines.push(`Excerpt: "${v.excerpt}"`);
    });
  }

  if (checkinReviews.length > 0) {
    reviewLines.push('\n=== LOCALPULSE COMMUNITY CHECK-IN REVIEWS ===');
    checkinReviews.forEach(r => {
      reviewLines.push(`[${r.stars}/5] ${r.who}: "${r.text}"`);
    });
  }

  const reviewText = reviewLines.join('\n');

  if (!reviewText.trim()) {
    // No reviews yet — return a neutral default
    return res.status(200).json({
      aggregate_score: 0,
      summary: 'No reviews yet for this place. Be the first to check in and leave a review!',
      sentiment: { positive: 0, neutral: 100, negative: 0 },
      tags: [],
      per_platform: { google: 0, youtube: 0, localpulse: 0 },
    });
  }

  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': key,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: 600,
        messages: [{
          role: 'user',
          content: `You are the AI review aggregation engine for LocalPulse, a social restaurant discovery app for the Philippines.

Analyze ALL of the following reviews for "${placeName}" and return ONLY a valid JSON object — no explanation, no markdown, no code fences. Just raw JSON.

REVIEWS:
${reviewText}

Return exactly this JSON structure:
{
  "aggregate_score": <a single float from 1.0 to 5.0, weighted by source credibility — YouTube videos with high views should count more than a single text review>,
  "summary": "<exactly 2 sentences. First sentence: what the place is known for. Second sentence: the honest verdict — who should go and why.>",
  "sentiment": {
    "positive": <integer percentage 0-100>,
    "neutral": <integer percentage 0-100>,
    "negative": <integer percentage 0-100>
  },
  "tags": [<2-4 short descriptive tags from this list: "Must Try", "Hidden Gem", "Value Pick", "Late Night", "Date Night", "Work Friendly", "Trending", "Book Ahead", "Family Friendly", "Quick Bite">],
  "per_platform": {
    "google": <average of Google review stars, or null if none>,
    "youtube": <estimated score from YouTube content tone, or null if none>,
    "localpulse": <average of LocalPulse check-in stars, or null if none>
  }
}`
        }],
      }),
    });

    const data = await response.json();

    if (data.error) {
      console.error('Claude API error:', data.error);
      return res.status(500).json({ error: 'Claude API error', details: data.error.message });
    }

    const rawText = data.content?.[0]?.text || '{}';

    // Strip any accidental markdown fences just in case
    const cleaned = rawText.replace(/```json|```/g, '').trim();
    const result = JSON.parse(cleaned);

    return res.status(200).json(result);

  } catch (err) {
    console.error('aggregate-score error:', err);
    return res.status(500).json({ error: 'Failed to generate aggregate score', details: err.message });
  }
}
