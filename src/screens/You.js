import React, { useEffect, useState } from 'react';
import { api, supabase, currentUser, timeAgo, initials } from '../lib';
import { Icon, Spinner, Empty, ScoreBadge } from '../ui';
import { game, levelFor, badgeState } from '../game';
import { pushStatus, enablePush } from '../push';
import { BlockedList, DeleteAccount } from '../safety';

export default function You({ onOpen, onOpenCreators, onOpenRanks, onOpenUser, onOpenLists, onOpenAdmin }) {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [visits, setVisits] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');
  const [stats, setStats] = useState(null);
  const [push, setPush] = useState(null);
  const [pushMsg, setPushMsg] = useState(null);
  const [admin, setAdmin] = useState(false);
  const [bio, setBio] = useState('');

  useEffect(() => { pushStatus().then(setPush).catch(() => setPush('unsupported')); }, []);

  useEffect(() => {
    (async () => {
      const u = await currentUser();
      setUser(u);
      if (!u) { setVisits([]); return; }
      const [{ data: p }, { data: v }] = await Promise.all([
        supabase.from('profiles').select('display_name,bio').eq('id', u.id).maybeSingle(),
        supabase.from('visits').select('id,google_place_id,score,review,created_at').eq('user_id', u.id).order('created_at', { ascending: false }).limit(50),
      ]);
      game.me().then(setStats).catch(() => {});
      supabase.rpc('is_admin').then(({ data }) => setAdmin(!!data));
      setProfile(p || null);
      setName((p && p.display_name) || '');
      setBio((p && p.bio) || '');
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
    const { error } = await supabase.from('profiles').upsert({ id: user.id, display_name: n, bio: bio.trim().slice(0, 160) || null });
    if (!error) { setProfile({ display_name: n, bio: bio.trim() || null }); setEditing(false); }
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
          <form className="stack-8" onSubmit={saveName}>
            <label className="sr-only" htmlFor="nm">Display name</label>
            <input id="nm" className="name-input" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} autoFocus />
            <label className="sr-only" htmlFor="bio">Bio</label>
            <input id="bio" className="name-input" value={bio} maxLength={160} placeholder="Short bio, e.g. Sisig hunter · Antipolo" onChange={(e) => setBio(e.target.value)} />
            <button className="btn btn-light">Save</button>
          </form>
        ) : (
          <div className="stack-4">
            <h1 className="display-xs light">{profile ? profile.display_name : 'Your food log'}</h1>
            {profile && profile.bio && <p className="small light-soft">{profile.bio}</p>}
            {profile && (
              <span className="row-6">
                <button className="link-btn light" onClick={() => setEditing(true)}>Edit profile</button>
                {user && <button className="link-btn light" onClick={() => onOpenUser(user.id)}>View public profile</button>}
              </span>
            )}
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
          <div><strong>{stats ? stats.influenced : 0}</strong><span>went because of you</span></div>
          <div><strong>{stats ? stats.followers : 0}</strong><span>followers</span></div>
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

      <section className="section stack-8">
        <button className="log-row" onClick={onOpenLists}>
          <span className="avatar">📋</span>
          <span className="grow"><span className="row-title-sm block">Your lists</span><span className="tiny muted">Saved places you can share</span></span>
          <Icon name="back" size={16} style={{ transform: 'rotate(180deg)' }} />
        </button>
        <div className="log-row">
          <span className="avatar"><Icon name="bell" size={18} /></span>
          <span className="grow">
            <span className="row-title-sm block">Notifications</span>
            <span className="tiny muted">
              {push === 'on' ? 'On — crown alerts, people you follow, weekly rank'
                : push === 'denied' ? 'Blocked in your browser settings'
                  : push === 'needs-install' ? 'On iPhone: Share → Add to Home Screen first, then open Ube Banana from there'
                    : push === 'unsupported' ? 'Not available in this browser'
                      : 'Crown alerts, people you follow, weekly rank'}
            </span>
            {pushMsg && <span className="tiny muted block">{pushMsg}</span>}
          </span>
          {push === 'off' && <button className="soft-btn" onClick={() => enablePush().then(setPush).catch((e) => setPushMsg(e.message))}>Turn on</button>}
        </div>
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
          <Empty icon="check" title="No check-ins yet">When you’re at a restaurant, tap Check in. Your scores build Ube Banana’s rankings.</Empty>
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

      <section className="section stack-12">
        <h2 className="h2">Privacy & safety</h2>
        <div className="stack-8">
          <span className="field-label">People you’ve blocked</span>
          <BlockedList />
        </div>
        <DeleteAccount />
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
          <a href="/privacy.html">Privacy</a> · <a href="/terms.html">Terms</a>{admin && <> · <button className="link-btn" onClick={onOpenAdmin}>Admin</button></>}
        </p>
        <p className="tiny muted about">
          Ube Banana scores come only from verified check-ins. Google ratings and photos are shown live from Google Maps. MICHELIN distinctions are listed as facts with a link to the Guide.
        </p>
      </section>
    </div>
  );
}
