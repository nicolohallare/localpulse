// api/youtube-reviews.js
// Searches YouTube for real influencer video reviews of a specific restaurant
// Returns video metadata, thumbnails, view counts, and channel info

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  const { name, location = 'Philippines' } = req.query;

  if (!name) {
    return res.status(400).json({ error: 'name (restaurant name) is required' });
  }

  const key = process.env.YOUTUBE_API_KEY;
  if (!key) {
    // Gracefully return empty rather than crashing — app still works without YouTube
    return res.status(200).json({ videos: [], message: 'YouTube API key not configured yet' });
  }

  try {
    // Search for videos reviewing this restaurant
    // We try a few query variations to get the best results
    const query = encodeURIComponent(`${name} ${location} food review`);
    const searchUrl = `https://www.googleapis.com/youtube/v3/search?part=snippet&q=${query}&type=video&maxResults=5&relevanceLanguage=en&key=${key}`;

    const searchRes = await fetch(searchUrl);
    const searchData = await searchRes.json();

    if (searchData.error) {
      console.error('YouTube search error:', searchData.error);
      return res.status(200).json({ videos: [], error: searchData.error.message });
    }

    const videoIds = (searchData.items || [])
      .map(item => item.id.videoId)
      .filter(Boolean)
      .join(',');

    if (!videoIds) {
      return res.status(200).json({ videos: [] });
    }

    // Step 2: Get detailed stats for each video (views, likes, duration)
    const statsUrl = `https://www.googleapis.com/youtube/v3/videos?part=statistics,contentDetails,snippet&id=${videoIds}&key=${key}`;
    const statsRes = await fetch(statsUrl);
    const statsData = await statsRes.json();

    const videos = (statsData.items || []).map(video => {
      const stats = video.statistics || {};
      const snippet = video.snippet || {};

      // Format large numbers nicely: 1234567 → "1.2M"
      const fmt = (n) => {
        const num = parseInt(n || 0);
        if (num >= 1_000_000) return `${(num / 1_000_000).toFixed(1)}M`;
        if (num >= 1_000) return `${(num / 1_000).toFixed(0)}K`;
        return String(num);
      };

      // Extract the first 200 chars of description as the "excerpt"
      const excerpt = (snippet.description || '')
        .replace(/\n+/g, ' ')
        .replace(/https?:\/\/\S+/g, '')
        .trim()
        .substring(0, 220);

      return {
        pl: 'youtube',
        videoId: video.id,
        who: `@${snippet.channelTitle?.toLowerCase().replace(/\s+/g, '') || 'creator'}`,
        channel: snippet.channelTitle,
        followers: '—',          // Subscriber count needs a separate Channel API call
        verified: false,          // Verification also needs Channel API
        stars: 5,                 // Default — Claude will refine this from transcript
        title: snippet.title,
        excerpt: excerpt || 'Watch the full review on YouTube.',
        views: fmt(stats.viewCount),
        likes: fmt(stats.likeCount),
        comments: fmt(stats.commentCount),
        ago: new Date(snippet.publishedAt).toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' }),
        thumb: snippet.thumbnails?.high?.url || snippet.thumbnails?.medium?.url,
      };
    });

    return res.status(200).json({ videos });

  } catch (err) {
    console.error('youtube-reviews error:', err);
    return res.status(500).json({ error: 'Failed to fetch YouTube reviews', details: err.message });
  }
}
