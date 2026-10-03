import React, { useEffect, useState } from 'react';
import { api, supabase, currentUser, timeAgo, initials } from '../lib';
import { Icon, Spinner, Empty, ScoreBadge } from '../ui';
import { game, levelFor, badgeState } from '../game';

export default function You({ onOpen, onOpenCreators, onOpenRanks }) {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [visits, setVisits] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [stats, setStats] = useState(null);

  useEffect(() => {
    (async () => {
      const u = await currentUser();
      setUser(u);
      if (!u) { setVisits([]); return; }
      const [{ data: p }, { data: v }] = await Promise.all([
        supabase.from('profiles').select('display_name').eq('id', u.id).maybeSingle(),
        supabase.from('visits').select('id,google_place_id,score,review,created_at').eq('user_id', u.id).order('created_at', { ascending: false }).limit(50),
      ]);
      game.me().then(setStats).catch(() => {});
      setProfile(p || null);
      setName((p && p.display_name) || '');
      const rows = v || [];
      const names = await api.names([...new Set(rows.map((r) => r.google_place_id))]).catch(() => []);
      const byId = Object.fromEntries(names.map((n) => [n.id, n]));
      setVisits(rows.map((r) => ({ ...r, place: byId[r.google_place_id] || {} })));
    })();
  }, []);

  async function saveName(e) {
    e.preventDefault();
    const n = name.trim().slice(0, 40);
    if (!n || !user) return;
    const { error } = await supabase.from('profiles').upsert({ id: user.id, display_name: n });
    if (!error) { setProfile({ display_name: n }); setEditing(false); }
  }

  const places = visits ? new Set(visits.map((v) => v.google_place_id)).size : 0;
  const lvl = levelFor(stats ? stats.points : 0);
  const badges = badgeState(stats);
  const earned = badges.filter((b) => b.earned).length;

  return (
    <div className="screen">
      <div className="you-hero">
        <span className="you-avatar">{profile ? initials(profile.display_name) : <Icon name="user" size={28} />}</span>
        {editing ? (
          <form className="row-6" onSubmit={saveName}>
            <label className="sr-only" htmlFor="nm">Display name</label>
            <input id="nm" className="name-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
            <button className="btn btn-light">Save</button>
          </form>
        ) : (
          <div className="stack-4">
            <h1 className="display-xs light">{profile ? profile.display_name : 'Your food log'}</h1>
            {profile && <button className="link-btn light" onClick={() => setEditing(true)}>Edit name</button>}
          </div>
        )}
        <div className="stack-6">
          <div className="level-row">
            <span className="level-chip">Lv {lvl.index} · {lvl.name}</span>
            <span className="level-pts">{stats ? stats.points : 0} pts</span>
          </div>
          <div className="level-bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={lvl.pct} aria-label="Progress to next level">
            <span style={{ width: `${lvl.pct}%` }} />
          </div>
          <span className="level-next">{lvl.next ? `${lvl.toNext} pts to ${lvl.next.name}` : 'Top level reached — salute!'}</span>
        </div>
        <div className="you-stats">
          <div><strong>{visits ? visits.length : '–'}</strong><span>check-ins</span></div>
          <div><strong>{visits ? places : '–'}</strong><span>places</span></div>
          <div><strong>{stats && stats.streak ? `${stats.streak}🔥` : '0'}</strong><span>week streak</span></div>
          <div><strong>{stats ? stats.sukis : 0}</strong><span>👑 suki</span></div>
        </div>
      </div>

      <section className="section">
        <button className="rank-cta" onClick={onOpenRanks}>
          <span className="cta-num">{stats && stats.week_rank ? `#${stats.week_rank}` : '—'}</span>
          <span className="grow">
            <span className="strong block">{stats && stats.week_rank ? 'Your rank this week' : 'Get on this week’s board'}</span>
            <span className="small muted">{stats && stats.week_points ? `${stats.week_points} pts since Monday` : 'Check in anywhere to score points'} · See leaderboard</span>
          </span>
          <Icon name="back" size={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
      </section>

      <section className="section stack-12">
        <div className="row-between">
          <h2 className="h2">Badges</h2>
          <span className="small muted">{earned} of {badges.length}</span>
        </div>
        <div className="badge-grid">
          {badges.map((b) => (
            <div key={b.id} className={`badge ${b.earned ? 'badge-earned' : 'badge-locked'}`} title={b.how}>
              <span className="badge-medal" aria-hidden="true">{b.glyph}</span>
              <span className="badge-name">{b.name}</span>
              <span className="badge-prog">{b.earned ? 'Earned' : b.goal > 1 ? `${b.have}/${b.goal}` : b.how}</span>
            </div>
          ))}
        </div>
      </section>

      <section className="section stack-12">
        <h2 className="h2">Your check-ins</h2>
        {user === undefined || visits === null ? <Spinner /> : null}
        {visits && visits.length === 0 && (
          <Empty icon="check" title="No check-ins yet">When you’re at a restaurant, tap Check in. Your scores build LocalPulse’s rankings.</Empty>
        )}
        {(visits || []).map((v) => (
          <button key={v.id} className="log-row" onClick={() => onOpen(v.google_place_id)}>
            <span className="avatar">{initials(v.place.name || '?')}</span>
            <span className="grow">
              <span className="row-title-sm block">{v.place.name || 'Place'}</span>
              <span className="tiny muted">{timeAgo(v.created_at)}{v.review ? ` · “${v.review.slice(0, 50)}${v.review.length > 50 ? '…' : ''}”` : ''}</span>
            </span>
            <ScoreBadge score={v.score} />
          </button>
        ))}
      </section>

      <section className="section">
        <button className="creator-cta" onClick={onOpenCreators}>
          <span className="cta-icon"><Icon name="video" size={22} /></span>
          <span className="grow">
            <span className="strong block">Are you a food creator?</span>
            <span className="small muted">Put your TikToks and YouTube reviews on the map.</span>
          </span>
          <Icon name="back" size={18} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <p className="tiny muted about">
          LocalPulse scores come only from verified check-ins. Google ratings and photos are shown live from Google Maps. MICHELIN distinctions are listed as facts with a link to the Guide.
        </p>
      </section>
    </div>
  );
}
