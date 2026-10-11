import React, { useCallback, useEffect, useState } from 'react';
import { api, currentUser, timeAgo, initials } from '../lib';
import { game, levelFor, follow, logTouch } from '../game';
import { Icon, Spinner, Empty, Notice } from '../ui';
import { MediaStrip, loadMedia } from '../media';
import { TakeMenu } from '../safety';

// Load live place names for a set of takes (Google data is never stored).
export async function withPlaces(rows) {
  const ids = [...new Set((rows || []).map((r) => r.google_place_id))];
  const [names, media] = await Promise.all([
    api.names(ids).catch(() => []),
    loadMedia((rows || []).map((r) => r.id)).catch(() => ({})),
  ]);
  const byId = Object.fromEntries(names.map((n) => [n.id, n]));
  return (rows || []).map((r) => ({ ...r, place: byId[r.google_place_id] || {}, media: media[r.id] || [] }));
}

export function TakeCard({ t, author, onOpenPlace, onOpenUser, showPlace = true, onHidden }) {
  const who = author || { id: t.user_id, name: t.display_name, points: t.author_points };
  const open = () => { if (who.id) logTouch(t.google_place_id, who.id); onOpenPlace(t.google_place_id); };
  return (
    <article className="take">
      {who.name && (
        <div className="take-top">
        <button className="take-head" onClick={() => who.id && onOpenUser(who.id)}>
          <span className="avatar">{initials(who.name)}</span>
          <span className="grow">
            <span className="strong small block">{who.name}</span>
            <span className="tiny muted">{who.points != null ? `${levelFor(who.points).name} · ` : ''}{timeAgo(t.created_at)}</span>
          </span>
          <span className={`score-chip ${t.score >= 8 ? 'score-hi' : t.score <= 4 ? 'score-lo' : ''}`}>{t.score}/10</span>
        </button>
        <TakeMenu take={{ id: t.id, user_id: who.id }} name={who.name} onHidden={(what) => onHidden && onHidden(t, what)} />
        </div>
      )}
      {showPlace && (
        <button className="take-place" onClick={open}>
          <Icon name="pin" size={16} className="ube" />
          <span className="grow take-place-text">
            <span className="strong block clamp-1">{t.place && t.place.name ? t.place.name : 'Open place'}</span>
            {t.place && t.place.address && <span className="tiny muted clamp-1">{t.place.address}</span>}
          </span>
          <Icon name="back" size={16} style={{ transform: 'rotate(180deg)' }} />
        </button>
      )}
      {(t.dishes_good && t.dishes_good.length > 0) && (
        <div className="row-wrap"><span className="tiny strong good-ink">👍 Order</span>{t.dishes_good.map((d) => <span key={d} className="dish-chip dish-good">{d}</span>)}</div>
      )}
      {(t.dishes_bad && t.dishes_bad.length > 0) && (
        <div className="row-wrap"><span className="tiny strong bad-ink">👎 Skip</span>{t.dishes_bad.map((d) => <span key={d} className="dish-chip dish-bad">{d}</span>)}</div>
      )}
      {t.review && <p>{t.review}</p>}
      <MediaStrip media={t.media} />
      {!who.name && <span className="tiny muted">{timeAgo(t.created_at)} · {t.score}/10</span>}
    </article>
  );
}

export default function Feed({ onOpenPlace, onOpenUser, onOpenCreators, onOpenRanks }) {
  const [mode, setMode] = useState('everyone');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);
  const [top, setTop] = useState(null);
  const [me, setMe] = useState(null);
  const [followed, setFollowed] = useState({});

  const load = useCallback(async () => {
    setRows(null);
    setErr(null);
    try {
      const data = await game.feed(mode);
      setRows(await withPlaces(data));
    } catch (e) {
      setErr(e);
    }
  }, [mode]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => {
    currentUser().then(setMe);
    game.influencers(30).then((d) => setTop((d || []).slice(0, 8))).catch(() => setTop([]));
  }, []);

  async function toggleFollow(id) {
    const on = !followed[id];
    setFollowed((f) => ({ ...f, [id]: on }));
    try { await follow(id, on); } catch (e) { setFollowed((f) => ({ ...f, [id]: !on })); }
  }

  return (
    <div className="screen">
      <header className="px pad-top stack-8">
        <span className="pill-tag">Feed</span>
        <h1 className="display">What locals are saying</h1>
        <p className="muted">Every check-in is a recommendation. Follow people whose taste you trust.</p>
      </header>

      {top && top.length > 0 && (
        <section className="section">
          <div className="row-between">
            <h2 className="h3">Top influencers this month</h2>
            <button className="link-btn" onClick={onOpenRanks}>See all</button>
          </div>
          <div className="infl-rail">
            {top.map((u) => (
              <div key={u.user_id} className="infl-card">
                <button className="infl-open" onClick={() => onOpenUser(u.user_id)}>
                  <span className="avatar avatar-lg">{initials(u.display_name)}</span>
                  <span className="strong small clamp-1">{u.display_name}</span>
                  <span className="tiny muted">{u.influenced} went because of them</span>
                </button>
                {!u.is_me && (!me || me.id !== u.user_id) && (
                  <button className={`follow-btn ${followed[u.user_id] ? 'following' : ''}`} onClick={() => toggleFollow(u.user_id)}>
                    {followed[u.user_id] ? 'Following' : 'Follow'}
                  </button>
                )}
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="section stack-12">
        <div className="seg" role="tablist" aria-label="Feed">
          <button role="tab" aria-selected={mode === 'everyone'} className={mode === 'everyone' ? 'seg-on' : ''} onClick={() => setMode('everyone')}>Everyone</button>
          <button role="tab" aria-selected={mode === 'following'} className={mode === 'following' ? 'seg-on' : ''} onClick={() => setMode('following')}>Following</button>
        </div>
        {err && <Notice tone="warn" title="Couldn’t load the feed">{err.message}</Notice>}
        {!rows && !err && <Spinner />}
        {rows && rows.length === 0 && (
          mode === 'following'
            ? <Empty icon="user" title="Follow some locals">Tap a name on any take to see their profile and follow them.</Empty>
            : <Empty icon="check" title="No takes yet">Check in somewhere and tell people what to order — you’ll be the first influencer here.</Empty>
        )}
        <div className="stack-12">
          {(rows || []).map((t) => <TakeCard key={t.id} t={t} onOpenPlace={onOpenPlace} onOpenUser={onOpenUser}
            onHidden={(x, what) => setRows((cur) => cur.filter((r) => (what === 'blocked' ? r.user_id !== x.user_id : r.id !== x.id)))} />)}
        </div>
      </section>

      <section className="section">
        <button className="creator-cta" onClick={onOpenCreators}>
          <span className="cta-icon"><Icon name="video" size={22} /></span>
          <span className="grow">
            <span className="strong block">Make food videos?</span>
            <span className="small muted">Pin your TikToks and YouTube reviews to the places you cover.</span>
          </span>
          <Icon name="back" size={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
      </section>
    </div>
  );
}
