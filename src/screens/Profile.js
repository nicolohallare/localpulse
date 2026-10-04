import React, { useEffect, useState } from 'react';
import { supabase, initials } from '../lib';
import { game, levelFor, follow, shareUrl, shareLink } from '../game';
import { Icon, Spinner, Empty, Notice } from '../ui';
import { TakeCard, withPlaces } from './Feed';

// Public influencer profile: #/u/<user id>
export default function Profile({ id, onBack, onOpenPlace, onOpenUser, onOpenList }) {
  const [p, setP] = useState(null);
  const [takes, setTakes] = useState(null);
  const [lists, setLists] = useState([]);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState(null);

  useEffect(() => {
    let off = false;
    game.profile(id).then((d) => !off && setP(d)).catch((e) => !off && setErr(e));
    game.takes(id).then(withPlaces).then((d) => !off && setTakes(d)).catch(() => !off && setTakes([]));
    supabase.from('lists').select('id,title,description').eq('owner', id).eq('is_public', true).order('created_at', { ascending: false })
      .then(({ data }) => !off && setLists(data || []));
    return () => { off = true; };
  }, [id]);

  async function toggle() {
    setBusy(true);
    try {
      await follow(id, !p.am_following);
      setP({ ...p, am_following: !p.am_following, followers: p.followers + (p.am_following ? -1 : 1) });
    } catch (e) { /* ignore */ }
    setBusy(false);
  }

  async function share() {
    const r = await shareLink({ title: `${p.name} on LocalPulse`, text: `Follow ${p.name}’s food takes on LocalPulse`, url: shareUrl('u', id) });
    if (r === 'copied') setNote('Link copied');
  }

  if (err) return <div className="screen pad"><Notice tone="warn" title="Couldn’t load this profile">{err.message}</Notice></div>;
  if (!p) return <div className="screen pad"><Spinner /></div>;
  const lvl = levelFor(p.points);

  return (
    <div className="screen">
      <div className="you-hero">
        <div className="row-between">
          <button className="icon-btn ring light-ring" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
          <button className="icon-btn ring light-ring" onClick={share} aria-label="Share profile"><Icon name="share" size={20} /></button>
        </div>
        <span className="you-avatar">{initials(p.name)}</span>
        <div className="stack-4">
          <h1 className="display-xs light">{p.name}</h1>
          <span className="level-chip">Lv {lvl.index} · {lvl.name} · {p.points} pts</span>
          {p.bio && <p className="small light-soft">{p.bio}</p>}
          {note && <span className="tiny light-soft">{note}</span>}
        </div>
        <div className="you-stats">
          <div><strong>{p.influenced}</strong><span>went because of them</span></div>
          <div><strong>{p.followers}</strong><span>followers</span></div>
          <div><strong>{p.visits}</strong><span>check-ins</span></div>
          <div><strong>{p.sukis}</strong><span>👑 suki</span></div>
        </div>
        {!p.is_me && (
          <button className={`btn ${p.am_following ? 'btn-light-outline' : 'btn-mango'}`} disabled={busy} onClick={toggle}>
            {p.am_following ? 'Following' : `Follow ${p.name.split(' ')[0]}`}
          </button>
        )}
      </div>

      {lists.length > 0 && (
        <section className="section stack-8">
          <h2 className="h3">Lists</h2>
          {lists.map((l) => (
            <button key={l.id} className="log-row" onClick={() => onOpenList(l.id)}>
              <span className="avatar">📋</span>
              <span className="grow"><span className="row-title-sm block">{l.title}</span>{l.description && <span className="tiny muted clamp-1">{l.description}</span>}</span>
              <Icon name="back" size={16} style={{ transform: 'rotate(180deg)' }} />
            </button>
          ))}
        </section>
      )}

      <section className="section stack-12">
        <h2 className="h2">Takes</h2>
        {!takes && <Spinner />}
        {takes && takes.length === 0 && <Empty icon="check" title="No takes yet">Their check-ins will show up here.</Empty>}
        {(takes || []).map((t) => (
          <TakeCard key={t.id} t={t} author={{ id, name: null }} onOpenPlace={onOpenPlace} onOpenUser={onOpenUser} />
        ))}
      </section>
    </div>
  );
}
