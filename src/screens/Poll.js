import React, { useCallback, useEffect, useState } from 'react';
import { api, supabase, ensureUser, currentUser, distanceM, fmtDistance } from '../lib';
import { shareUrl, shareLink } from '../game';
import { Icon, PlacePhoto, Spinner, Notice, GoButtons } from '../ui';

// ── Create: #/poll/new (optionally ?with=<placeId>) ──────────────────────────
export function PollNew({ loc, withPlace, onBack, onCreated }) {
  const [title, setTitle] = useState('Saan tayo kakain?');
  const [picked, setPicked] = useState([]);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [state, setState] = useState('idle');
  const [err, setErr] = useState(null);

  useEffect(() => {
    if (withPlace) api.details(withPlace).then((p) => setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur : [p, ...cur]))).catch(() => {});
    api.nearby(loc.lat, loc.lng, 1500).then((r) => setResults((cur) => cur || r)).catch(() => setResults([]));
  }, [withPlace, loc.lat, loc.lng]);

  async function search(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setResults(null);
    setResults(await api.search(q.trim(), loc.lat, loc.lng).catch(() => []));
  }

  const toggle = (p) => setPicked((cur) => (cur.some((x) => x.id === p.id) ? cur.filter((x) => x.id !== p.id) : cur.length < 5 ? [...cur, p] : cur));

  async function create() {
    setState('saving');
    setErr(null);
    try {
      await ensureUser();
      const { data: poll, error } = await supabase.from('polls').insert({ title: title.trim().slice(0, 80) || 'Saan tayo kakain?' }).select('id').single();
      if (error) throw error;
      const { error: e2 } = await supabase.from('poll_options').insert(picked.map((p, i) => ({ poll_id: poll.id, google_place_id: p.id, position: i })));
      if (e2) throw e2;
      onCreated(poll.id, true);
    } catch (e) {
      setErr('Could not create the poll. Try again.');
      setState('idle');
    }
  }

  return (
    <div className="screen">
      <div className="px pad-top row-6"><button className="icon-btn ring" onClick={onBack} aria-label="Back"><Icon name="back" /></button></div>
      <header className="px stack-8">
        <span className="pill-tag">Group poll</span>
        <h1 className="display">Let the barkada vote</h1>
        <p className="muted">Pick 2 to 5 places, share the link to your group chat, and see the votes come in. Friends don’t need to install anything.</p>
      </header>
      <section className="section stack-12">
        <label className="field">Question
          <input value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
        </label>
        {picked.length > 0 && (
          <div className="stack-8">
            <span className="field-label">In the poll ({picked.length}/5)</span>
            {picked.map((p, i) => (
              <div key={p.id} className="pick-row pick-on">
                <span className="poll-num">{i + 1}</span>
                <span className="grow row-title-sm">{p.name}</span>
                <button className="icon-btn" aria-label={`Remove ${p.name}`} onClick={() => toggle(p)}><Icon name="close" size={18} /></button>
              </div>
            ))}
          </div>
        )}
        <button className="btn btn-primary" disabled={picked.length < 2 || state === 'saving'} onClick={create}>
          {state === 'saving' ? 'Creating…' : picked.length < 2 ? `Pick ${2 - picked.length} more place${picked.length === 1 ? '' : 's'}` : 'Create poll & share'}
        </button>
        {err && <Notice tone="warn">{err}</Notice>}
      </section>
      <section className="section stack-8">
        <form className="search" onSubmit={search} role="search">
          <Icon name="search" size={20} />
          <label className="sr-only" htmlFor="pollq">Search places</label>
          <input id="pollq" type="search" placeholder="Add a place: name, dish or area" value={q} onChange={(e) => setQ(e.target.value)} />
        </form>
        {!results && <Spinner />}
        {(results || []).map((p) => {
          const on = picked.some((x) => x.id === p.id);
          const d = distanceM(loc, p);
          return (
            <button key={p.id} className={`pick-row ${on ? 'pick-on' : ''}`} onClick={() => toggle(p)} aria-pressed={on}>
              <PlacePhoto photo={p.photos[0]} width={160} className="pick-thumb" alt="" />
              <span className="grow">
                <span className="row-title-sm block">{p.name}</span>
                <span className="tiny muted">{[p.type, d != null ? fmtDistance(d) : null, p.price].filter(Boolean).join(' · ')}</span>
              </span>
              <span className="pick-dot" aria-hidden="true">{on && <Icon name="check" size={16} stroke={3} />}</span>
            </button>
          );
        })}
        <p className="attribution">Places from Google Maps</p>
      </section>
    </div>
  );
}

// ── Vote: #/poll/<id> ────────────────────────────────────────────────────────
export function PollView({ id, fresh, onBack, onOpenPlace }) {
  const [poll, setPoll] = useState(null);
  const [opts, setOpts] = useState([]);
  const [votes, setVotes] = useState([]);
  const [me, setMe] = useState(null);
  const [name, setName] = useState('');
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(fresh ? 'Poll created! Share it with your group.' : null);
  const [busy, setBusy] = useState(null);

  const loadVotes = useCallback(async () => {
    const { data } = await supabase.from('poll_votes').select('user_id,google_place_id,voter_name').eq('poll_id', id);
    setVotes(data || []);
  }, [id]);

  useEffect(() => {
    (async () => {
      const { data: p, error } = await supabase.from('polls').select('*').eq('id', id).maybeSingle();
      if (error || !p) { setErr('This poll doesn’t exist anymore.'); return; }
      setPoll(p);
      const { data: o } = await supabase.from('poll_options').select('google_place_id,position').eq('poll_id', id).order('position');
      const names = await api.names((o || []).map((x) => x.google_place_id)).catch(() => []);
      const byId = Object.fromEntries(names.map((n) => [n.id, n]));
      setOpts((o || []).map((x) => ({ id: x.google_place_id, ...(byId[x.google_place_id] || { name: 'Place' }) })));
      const u = await currentUser();
      setMe(u);
      if (u) {
        const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', u.id).maybeSingle();
        if (prof) setName(prof.display_name);
      }
      loadVotes();
    })();
  }, [id, loadVotes]);

  useEffect(() => {
    const t = setInterval(loadVotes, 5000);
    return () => clearInterval(t);
  }, [loadVotes]);

  async function vote(placeId) {
    if (!name.trim()) { setErr('Add your name first so your friends know who voted.'); return; }
    setBusy(placeId);
    setErr(null);
    try {
      const u = await ensureUser();
      setMe(u);
      const { error } = await supabase.from('poll_votes').upsert(
        { poll_id: id, user_id: u.id, google_place_id: placeId, voter_name: name.trim().slice(0, 40) },
        { onConflict: 'poll_id,user_id' }
      );
      if (error) throw error;
      await loadVotes();
    } catch (e) {
      setErr(poll && new Date(poll.closes_at) < new Date() ? 'Voting has closed.' : 'Could not save your vote. Try again.');
    }
    setBusy(null);
  }

  async function share() {
    const r = await shareLink({ title: poll.title, text: `${poll.title} Vote here 👇`, url: shareUrl('v', id) });
    if (r === 'copied') setNote('Link copied — paste it in your group chat.');
  }

  if (err && !poll) return <div className="screen pad"><button className="icon-btn ring" onClick={onBack} aria-label="Back"><Icon name="back" /></button><Notice tone="warn">{err}</Notice></div>;
  if (!poll) return <div className="screen pad"><Spinner /></div>;

  const closed = new Date(poll.closes_at) < new Date();
  const total = votes.length;
  const mine = me && votes.find((v) => v.user_id === me.id);
  const counts = Object.fromEntries(opts.map((o) => [o.id, votes.filter((v) => v.google_place_id === o.id)]));
  const leader = opts.slice().sort((a, b) => counts[b.id].length - counts[a.id].length)[0];

  return (
    <div className="screen">
      <div className="px pad-top row-between">
        <button className="icon-btn ring" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
        <button className="soft-btn" onClick={share}><Icon name="share" size={16} /> Share poll</button>
      </div>
      <header className="px stack-8">
        <span className="pill-tag">{closed ? 'Poll closed' : `Group poll · ${total} vote${total === 1 ? '' : 's'}`}</span>
        <h1 className="display">{poll.title}</h1>
        {note && <Notice tone="info">{note}</Notice>}
      </header>
      <section className="section stack-12">
        {!closed && (
          <label className="field">Your name
            <input value={name} maxLength={40} placeholder="So friends know who voted" onChange={(e) => setName(e.target.value)} />
          </label>
        )}
        {opts.map((o, i) => {
          const vs = counts[o.id] || [];
          const pct = total ? Math.round((vs.length / total) * 100) : 0;
          const chosen = mine && mine.google_place_id === o.id;
          return (
            <div key={o.id} className={`poll-opt ${chosen ? 'poll-mine' : ''}`}>
              <div className="poll-bar" style={{ width: `${pct}%` }} />
              <div className="poll-row">
                <span className="poll-num">{i + 1}</span>
                <button className="grow poll-name" onClick={() => onOpenPlace(o.id)}>
                  <span className="row-title-sm block">{o.name}</span>
                  <span className="tiny muted clamp-1">{vs.length ? vs.map((v) => v.voter_name || 'Someone').join(', ') : (o.address || '')}</span>
                </button>
                <span className="poll-count">{vs.length}</span>
              </div>
              {!closed && (
                <button className={`btn ${chosen ? 'btn-quiet' : 'btn-primary'} poll-vote`} disabled={busy === o.id || chosen} onClick={() => vote(o.id)}>
                  {chosen ? 'Your vote ✓' : busy === o.id ? 'Voting…' : 'Vote'}
                </button>
              )}
            </div>
          );
        })}
        {err && <Notice tone="warn">{err}</Notice>}
        {leader && total > 0 && (
          <div className="stack-8">
            <span className="field-label">Winning so far: {leader.name} — let’s go</span>
            <GoButtons place={leader} />
          </div>
        )}
        <p className="tiny muted">Votes update live. The poll closes {new Date(poll.closes_at).toLocaleDateString('en-PH', { weekday: 'short', month: 'short', day: 'numeric' })}.</p>
      </section>
    </div>
  );
}
