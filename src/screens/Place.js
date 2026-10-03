import React, { useCallback, useEffect, useState } from 'react';
import {
  api, supabase, distanceM, fmtDistance, fmtCount, timeAgo, initials, matchMichelin, DISTINCTION,
  PLATFORM_LABEL, detectPlatform, youtubeId,
} from '../lib';
import { Icon, PlacePhoto, Spinner, Notice, Empty, Sheet } from '../ui';
import CheckIn from './CheckIn';

export default function Place({ id, loc, michelin, onBack, onOpenCreators }) {
  const [place, setPlace] = useState(null);
  const [error, setError] = useState(null);
  const [stat, setStat] = useState(null);
  const [feed, setFeed] = useState([]);
  const [videos, setVideos] = useState([]);
  const [deals, setDeals] = useState([]);
  const [yt, setYt] = useState(null);
  const [summary, setSummary] = useState(null);
  const [tab, setTab] = useState('videos');
  const [photoIdx, setPhotoIdx] = useState(0);
  const [checkingIn, setCheckingIn] = useState(false);
  const [addingVideo, setAddingVideo] = useState(false);
  const [player, setPlayer] = useState(null);

  const loadOwn = useCallback(async () => {
    const [s, f, v, d] = await Promise.all([
      supabase.from('place_stats').select('*').eq('google_place_id', id).maybeSingle(),
      supabase.from('visit_feed').select('*').eq('google_place_id', id).order('created_at', { ascending: false }).limit(30),
      supabase.from('place_videos').select('id,platform,url,creator_handle,title').eq('google_place_id', id).order('created_at', { ascending: false }),
      supabase.from('deal_listings').select('*').eq('google_place_id', id),
    ]);
    setStat(s.data || null);
    setFeed(f.data || []);
    setVideos(v.data || []);
    setDeals(d.data || []);
    if (s.data && s.data.visit_count >= 3) api.summary(id).then(setSummary).catch(() => {});
  }, [id]);

  useEffect(() => {
    let cancelled = false;
    setPlace(null);
    setError(null);
    api.details(id)
      .then((p) => {
        if (cancelled) return;
        setPlace(p);
        const area = (p.address || '').split(',').slice(-2).join(' ');
        api.youtube(`${p.name} ${area}`).then((r) => !cancelled && setYt(r)).catch(() => !cancelled && setYt({ videos: [] }));
      })
      .catch((e) => !cancelled && setError(e));
    loadOwn();
    return () => { cancelled = true; };
  }, [id, loadOwn]);

  if (error) {
    return (
      <div className="screen pad">
        <button className="icon-btn ring" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
        <Notice tone="warn" title="Couldn’t load this place">{error.message}{error.hint ? ` — ${error.hint}` : ''}</Notice>
      </div>
    );
  }
  if (!place) return <div className="screen pad"><Spinner label="Loading place…" /></div>;

  const mich = matchMichelin(place.name, michelin);
  const dist = distanceM(loc, place);
  const photo = place.photos[photoIdx] || place.photos[0];
  const ytVideos = (yt && yt.videos) || [];
  const videoCount = videos.length + ytVideos.length;

  async function share() {
    const url = `${window.location.origin}/#/place/${id}`;
    try {
      if (navigator.share) await navigator.share({ title: place.name, text: `${place.name} on LocalPulse`, url });
      else { await navigator.clipboard.writeText(url); alert('Link copied'); }
    } catch (e) { /* user cancelled */ }
  }

  return (
    <div className="screen place-screen">
      <div className="hero">
        <PlacePhoto photo={photo} width={900} className="hero-img" alt={place.name} />
        <div className="hero-shade" />
        <button className="icon-btn float tl" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
        <button className="icon-btn float tr" onClick={share} aria-label="Share"><Icon name="share" size={20} /></button>
        {place.photos.length > 1 && (
          <div className="hero-dots" aria-label="Photos">
            {place.photos.slice(0, 6).map((ph, i) => (
              <button key={ph.name} aria-label={`Photo ${i + 1}`} aria-pressed={i === photoIdx}
                className={`dot ${i === photoIdx ? 'dot-on' : ''}`} onClick={() => setPhotoIdx(i)} />
            ))}
          </div>
        )}
        <span className="hero-credit">
          Photo{photo && photo.author ? `: ${photo.author}` : ''} · Google Maps
        </span>
      </div>

      <div className="place-body">
        <div className="stack-6">
          <h1 className="display-sm">{place.name}</h1>
          <p className="muted">{[place.type, place.address, place.price].filter(Boolean).join(' · ')}</p>
          <p className="small strong row-6">
            {place.openNow != null && (
              <span className={place.openNow ? 'open' : 'closed'}><Icon name="clock" size={14} /> {place.openNow ? 'Open now' : 'Closed now'}</span>
            )}
            {dist != null && <span className="muted">{fmtDistance(dist)} away</span>}
          </p>
        </div>

        {mich && (
          <div className="mich-card">
            <div>
              <span className="eyebrow">MICHELIN Guide Philippines {mich.year}</span>
              <span className="mich-card-title">{DISTINCTION[mich.distinction]}</span>
            </div>
            <a href={mich.guide_url} target="_blank" rel="noreferrer" className="link-out">Read on Michelin <Icon name="external" size={14} /></a>
          </div>
        )}

        <div className="score-grid">
          <div className="score-tile ube-tile">
            <span className="tile-label">LocalPulse score</span>
            {stat ? (
              <>
                <span className="tile-big">{Number(stat.avg_score).toFixed(1)}<small>/10</small></span>
                <span className="tile-foot"><Icon name="shield" size={14} /> {stat.visit_count} verified visit{stat.visit_count === 1 ? '' : 's'}</span>
              </>
            ) : (
              <>
                <span className="tile-big tile-new">New</span>
                <span className="tile-foot">Be the first to check in</span>
              </>
            )}
          </div>
          <div className="score-tile">
            <span className="tile-label muted">Google rating</span>
            {place.rating != null ? (
              <>
                <span className="tile-big">{place.rating.toFixed(1)}<span className="star">★</span></span>
                <span className="tile-foot muted">{fmtCount(place.ratingCount)} reviews · <strong className="ink">Google Maps</strong></span>
              </>
            ) : (
              <span className="tile-foot muted">No Google rating yet</span>
            )}
          </div>
        </div>
        <p className="tiny muted">The two scores are kept separate. LocalPulse counts verified visits only.</p>

        {summary && summary.summary && (
          <section className="summary-card">
            <div className="row-between">
              <h2 className="h3">What visitors say</h2>
              <span className="tiny muted">AI summary · {summary.count} visits</span>
            </div>
            <p>{summary.summary}</p>
            {summary.highlights && summary.highlights.length > 0 && (
              <div className="row-wrap">{summary.highlights.map((h) => <span key={h} className="soft-chip">{h}</span>)}</div>
            )}
          </section>
        )}

        <div className="seg" role="tablist" aria-label="Sections">
          <button role="tab" aria-selected={tab === 'videos'} className={tab === 'videos' ? 'seg-on' : ''} onClick={() => setTab('videos')}>
            Videos{videoCount ? ` · ${videoCount}` : ''}
          </button>
          <button role="tab" aria-selected={tab === 'visits'} className={tab === 'visits' ? 'seg-on' : ''} onClick={() => setTab('visits')}>
            Visits{feed.length ? ` · ${feed.length}` : ''}
          </button>
          <button role="tab" aria-selected={tab === 'deals'} className={tab === 'deals' ? 'seg-on' : ''} onClick={() => setTab('deals')}>
            Deals{deals.length ? ` · ${deals.length}` : ''}
          </button>
        </div>

        {tab === 'videos' && (
          <div className="stack-16">
            {videos.length > 0 && (
              <div className="stack-10">
                <h3 className="eyebrow">Added by creators &amp; visitors</h3>
                <div className="video-grid">
                  {videos.map((v) => <SubmittedVideo key={v.id} v={v} onPlayYouTube={setPlayer} />)}
                </div>
              </div>
            )}
            <div className="stack-10">
              <h3 className="eyebrow">From YouTube</h3>
              {!yt && <Spinner label="Searching YouTube…" />}
              {yt && ytVideos.length === 0 && (
                <p className="small muted">{yt.error ? `YouTube results unavailable${yt.hint ? ` — ${yt.hint}` : ''}` : 'No YouTube reviews found for this place yet.'}</p>
              )}
              {ytVideos.map((v) => (
                <button key={v.id} className="yt-card" onClick={() => setPlayer({ id: v.id, title: v.title, channel: v.channel })}>
                  <span className="yt-thumb">
                    {v.thumb && <img src={v.thumb} alt="" loading="lazy" />}
                    <span className="play"><Icon name="play" size={20} /></span>
                    <span className="badge-yt">YouTube</span>
                  </span>
                  <span className="yt-meta">
                    <span className="row-title-sm">{v.title}</span>
                    <span className="tiny muted">{v.channel}{v.views ? ` · ${fmtCount(v.views)} views` : ''} · {timeAgo(v.published)}</span>
                  </span>
                </button>
              ))}
              {ytVideos.length > 0 && <p className="tiny muted">YouTube search results for this place. Some may mention other places.</p>}
            </div>
            <button className="dashed-btn" onClick={() => setAddingVideo(true)}>
              <Icon name="plus" size={18} /> Saw a TikTok or Reel about this place? Add it
            </button>
            <button className="link-btn left" onClick={onOpenCreators}>Food creator? Put your videos on LocalPulse →</button>
          </div>
        )}

        {tab === 'visits' && (
          <div className="stack-12">
            {feed.length === 0 && (
              <Empty icon="check" title="No check-ins yet">Visiting? Check in to give this place its first LocalPulse score.</Empty>
            )}
            {feed.map((r) => (
              <article key={r.id} className="review">
                <div className="row-10">
                  <span className="avatar">{initials(r.display_name)}</span>
                  <span className="grow">
                    <span className="strong small block">{r.display_name}</span>
                    <span className="verified"><Icon name="shield" size={13} /> Verified visit · location</span>
                  </span>
                  <span className="score-chip">{r.score}/10</span>
                </div>
                {r.review && <p>{r.review}</p>}
                {r.tags && r.tags.length > 0 && <div className="row-wrap">{r.tags.map((t) => <span key={t} className="soft-chip">{t}</span>)}</div>}
                <span className="tiny muted">{timeAgo(r.created_at)}</span>
              </article>
            ))}
            {place.mapsUri && (
              <a className="row-link" href={place.mapsUri} target="_blank" rel="noreferrer">
                Read {fmtCount(place.ratingCount)} Google reviews on Google Maps <Icon name="external" size={16} />
              </a>
            )}
          </div>
        )}

        {tab === 'deals' && (
          <div className="stack-12">
            {deals.length === 0 && <Empty icon="tag" title="No deals listed">Deals from creators and card promos will show here.</Empty>}
            {deals.map((d) => <DealCard key={d.id} d={d} />)}
          </div>
        )}

        <section className="info-list">
          {place.fullAddress && (
            <div className="info-row">
              <span className="grow"><span className="tiny muted block">Address</span><span className="small strong">{place.fullAddress}</span></span>
              {place.mapsUri && <a className="soft-btn" href={place.mapsUri} target="_blank" rel="noreferrer"><Icon name="nav" size={16} /> Directions</a>}
            </div>
          )}
          {place.hours.length > 0 && (
            <details className="info-row hours">
              <summary><span className="tiny muted block">Hours (from Google)</span><span className="small strong">See opening hours</span></summary>
              <ul>{place.hours.map((h) => <li key={h} className="small">{h}</li>)}</ul>
            </details>
          )}
          {(place.phone || place.website) && (
            <div className="info-row">
              {place.phone && <a className="soft-btn" href={`tel:${place.phone.replace(/\s+/g, '')}`}><Icon name="phone" size={16} /> Call</a>}
              {place.website && <a className="soft-btn" href={place.website} target="_blank" rel="noreferrer"><Icon name="globe" size={16} /> Website</a>}
            </div>
          )}
        </section>
      </div>

      <div className="action-bar">
        <button className="btn btn-primary grow" onClick={() => setCheckingIn(true)}><Icon name="check" size={20} stroke={2.4} /> Check in here</button>
      </div>

      {checkingIn && (
        <CheckIn place={place} onClose={() => setCheckingIn(false)} onDone={() => { loadOwn(); setTab('visits'); }} />
      )}
      {addingVideo && <AddVideo place={place} onClose={() => setAddingVideo(false)} />}
      {player && (
        <Sheet title={player.channel || 'YouTube'} onClose={() => setPlayer(null)}>
          <div className="player">
            <iframe title={player.title || 'YouTube video'} src={`https://www.youtube-nocookie.com/embed/${player.id}?autoplay=1&playsinline=1&rel=0`}
              allow="autoplay; encrypted-media; picture-in-picture" allowFullScreen />
          </div>
          {player.title && <p className="strong">{player.title}</p>}
          <a className="link-out" href={`https://www.youtube.com/watch?v=${player.id}`} target="_blank" rel="noreferrer">Open on YouTube <Icon name="external" size={14} /></a>
        </Sheet>
      )}
    </div>
  );
}

function SubmittedVideo({ v, onPlayYouTube }) {
  const [meta, setMeta] = useState(null);
  useEffect(() => {
    if (v.platform === 'tiktok' || v.platform === 'youtube') api.oembed(v.url).then(setMeta).catch(() => {});
  }, [v.url, v.platform]);
  const ytId = v.platform === 'youtube' ? youtubeId(v.url) : null;
  const title = v.title || (meta && meta.title) || `${PLATFORM_LABEL[v.platform]} video`;
  const handle = v.creator_handle || (meta && meta.author && `@${meta.author}`) || '';
  const inner = (
    <>
      <span className={`vtile vtile-${v.platform}`}>
        {meta && meta.thumb && <img src={meta.thumb} alt="" loading="lazy" />}
        <span className="play"><Icon name="play" size={18} /></span>
        <span className="badge-plat">{PLATFORM_LABEL[v.platform]}</span>
      </span>
      {handle && <span className="strong small">{handle}</span>}
      <span className="small muted clamp-2">{title}</span>
    </>
  );
  if (ytId) return <button className="vcard" onClick={() => onPlayYouTube({ id: ytId, title, channel: handle })}>{inner}</button>;
  return <a className="vcard" href={v.url} target="_blank" rel="noreferrer">{inner}</a>;
}

function DealCard({ d }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className={`deal ${d.kind === 'creator_code' ? 'deal-code' : ''}`}>
      <span className="eyebrow">{d.kind === 'creator_code' ? 'Creator code' : d.kind === 'card_promo' ? 'Card promo' : 'Restaurant promo'}</span>
      <span className="strong">{d.title}</span>
      {d.detail && <span className="small muted">{d.detail}</span>}
      <div className="row-between">
        {d.code ? (
          <button className="soft-btn" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(d.code); setCopied(true); }}>
            <Icon name="copy" size={16} /> {copied ? 'Copied' : d.code}
          </button>
        ) : <span />}
        {d.source_url && <a className="link-out" href={d.source_url} target="_blank" rel="noreferrer">Full terms <Icon name="external" size={14} /></a>}
      </div>
      {d.ends_on && <span className="tiny muted">Until {new Date(d.ends_on).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>}
    </div>
  );
}

function AddVideo({ place, onClose }) {
  const [url, setUrl] = useState('');
  const [handle, setHandle] = useState('');
  const [state, setState] = useState('idle');
  const [err, setErr] = useState(null);
  const platform = detectPlatform(url.trim());

  async function submit(e) {
    e.preventDefault();
    if (!platform) { setErr('Paste a TikTok, YouTube, Instagram or Facebook link.'); return; }
    setState('saving');
    setErr(null);
    const { error } = await supabase.from('place_videos').insert({
      google_place_id: place.id,
      platform,
      url: url.trim(),
      creator_handle: handle.trim() || null,
    });
    if (error) { setErr('Could not submit. Please try again.'); setState('idle'); return; }
    setState('done');
  }

  return (
    <Sheet title="Add a video" onClose={onClose}>
      {state === 'done' ? (
        <div className="stack-12 center">
          <span className="done-icon"><Icon name="check" size={32} stroke={2.4} /></span>
          <p className="strong">Thanks! We’ll review it shortly.</p>
          <p className="small muted">Approved videos appear on {place.name}’s page.</p>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      ) : (
        <form className="stack-12" onSubmit={submit}>
          <p className="small muted">Share a video that reviews <strong>{place.name}</strong>. It shows after a quick check, and plays from the original post.</p>
          <label className="field">Video link
            <input type="url" inputMode="url" required placeholder="https://www.tiktok.com/@…/video/…" value={url} onChange={(e) => setUrl(e.target.value)} />
          </label>
          {url && <span className="tiny muted">{platform ? `${PLATFORM_LABEL[platform]} link` : 'Not a supported link yet'}</span>}
          <label className="field">Creator’s handle (optional)
            <input type="text" placeholder="@handle" value={handle} maxLength={60} onChange={(e) => setHandle(e.target.value)} />
          </label>
          {err && <Notice tone="warn">{err}</Notice>}
          <button className="btn btn-primary" disabled={state === 'saving'}>{state === 'saving' ? 'Sending…' : 'Submit video'}</button>
        </form>
      )}
    </Sheet>
  );
}
