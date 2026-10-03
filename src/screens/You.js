import React, { useEffect, useState } from 'react';
import { api, supabase, currentUser, timeAgo, initials } from '../lib';
import { Icon, Spinner, Empty, ScoreBadge } from '../ui';

export default function You({ onOpen, onOpenCreators }) {
  const [user, setUser] = useState(undefined);
  const [profile, setProfile] = useState(null);
  const [visits, setVisits] = useState(null);
  const [editing, setEditing] = useState(false);
  const [name, setName] = useState('');

  useEffect(() => {
    (async () => {
      const u = await currentUser();
      setUser(u);
      if (!u) { setVisits([]); return; }
      const [{ data: p }, { data: v }] = await Promise.all([
        supabase.from('profiles').select('display_name').eq('id', u.id).maybeSingle(),
        supabase.from('visits').select('id,google_place_id,score,review,created_at').eq('user_id', u.id).order('created_at', { ascending: false }).limit(50),
      ]);
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
        <div className="you-stats">
          <div><strong>{visits ? visits.length : '–'}</strong><span>check-ins</span></div>
          <div><strong>{visits ? places : '–'}</strong><span>places</span></div>
        </div>
      </div>

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
