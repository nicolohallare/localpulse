import React, { useCallback, useEffect, useState } from 'react';
import { api, supabase, PLATFORM_LABEL } from '../lib';
import { Icon, Spinner, Notice, Empty } from '../ui';

// #/admin — approve videos, read creator applications, manage deals.
export default function Admin({ loc, onBack, onOpenPlace }) {
  const [session, setSession] = useState(undefined);
  const [isAdmin, setIsAdmin] = useState(null);
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [err, setErr] = useState(null);
  const [q, setQ] = useState(null);
  const [tab, setTab] = useState('videos');

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s));
    return () => sub.subscription.unsubscribe();
  }, []);

  const load = useCallback(async () => {
    const { data, error } = await supabase.rpc('admin_queue');
    if (error) { setErr(error.message); return; }
    const names = await api.names([...new Set([...(data.videos || []), ...(data.deals || [])].map((x) => x.google_place_id))]).catch(() => []);
    const byId = Object.fromEntries(names.map((n) => [n.id, n]));
    setQ({ ...data, byId });
  }, []);

  useEffect(() => {
    if (!session || !session.user || !session.user.email) { setIsAdmin(null); return; }
    supabase.rpc('is_admin').then(({ data }) => { setIsAdmin(!!data); if (data) load(); });
  }, [session, load]);

  async function sendLink(e) {
    e.preventDefault();
    setErr(null);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: { emailRedirectTo: `${window.location.origin}/?admin=1` },
    });
    if (error) setErr(error.message); else setSent(true);
  }

  async function review(id, ok) {
    await supabase.rpc('admin_review_video', { p_id: id, p_approve: ok });
    setQ((cur) => ({ ...cur, videos: cur.videos.filter((v) => v.id !== id) }));
  }

  const signedIn = session && session.user && session.user.email;

  return (
    <div className="screen">
      <div className="px pad-top row-6"><button className="icon-btn ring" onClick={onBack} aria-label="Back"><Icon name="back" /></button></div>
      <header className="px stack-8"><span className="pill-tag">Admin</span><h1 className="display">LocalPulse admin</h1></header>

      {session === undefined && <section className="section"><Spinner /></section>}

      {session !== undefined && !signedIn && (
        <section className="section">
          {sent ? (
            <Notice tone="info" title="Check your email">Tap the sign-in link we sent to {email}. Open it on this phone.</Notice>
          ) : (
            <form className="stack-12 card" onSubmit={sendLink}>
              <p className="small muted">Sign in with your admin email. We’ll send you a one-tap link.</p>
              <label className="field">Email<input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>
              {err && <Notice tone="warn">{err}</Notice>}
              <button className="btn btn-primary">Send sign-in link</button>
            </form>
          )}
        </section>
      )}

      {signedIn && isAdmin === false && (
        <section className="section stack-12">
          <Notice tone="warn" title="Not an admin">{session.user.email} doesn’t have admin access.</Notice>
          <button className="btn btn-quiet" onClick={() => supabase.auth.signOut()}>Sign out</button>
        </section>
      )}

      {signedIn && isAdmin && !q && <section className="section"><Spinner /></section>}

      {signedIn && isAdmin && q && (
        <>
          <section className="section">
            <div className="admin-stats">
              <div><strong>{q.stats.visits_7d}</strong><span>check-ins (7d)</span></div>
              <div><strong>{q.stats.users_7d}</strong><span>active users (7d)</span></div>
              <div><strong>{q.stats.places_total}</strong><span>places with check-ins</span></div>
              <div><strong>{q.stats.polls_7d}</strong><span>polls (7d)</span></div>
            </div>
          </section>
          <section className="section stack-12">
            <div className="seg" role="tablist" aria-label="Admin">
              <button role="tab" aria-selected={tab === 'videos'} className={tab === 'videos' ? 'seg-on' : ''} onClick={() => setTab('videos')}>Videos · {q.videos.length}</button>
              <button role="tab" aria-selected={tab === 'apps'} className={tab === 'apps' ? 'seg-on' : ''} onClick={() => setTab('apps')}>Creators · {q.applications.length}</button>
              <button role="tab" aria-selected={tab === 'deals'} className={tab === 'deals' ? 'seg-on' : ''} onClick={() => setTab('deals')}>Deals · {q.deals.length}</button>
            </div>

            {tab === 'videos' && (
              <div className="stack-12">
                {q.videos.length === 0 && <Empty icon="video" title="All caught up">No videos waiting for review.</Empty>}
                {q.videos.map((v) => <PendingVideo key={v.id} v={v} place={q.byId[v.google_place_id]} onReview={review} onOpenPlace={onOpenPlace} />)}
              </div>
            )}

            {tab === 'apps' && (
              <div className="stack-12">
                {q.applications.length === 0 && <Empty icon="user" title="No applications yet" />}
                {q.applications.map((a) => (
                  <article key={a.id} className="card stack-4">
                    <span className="strong">{a.name} {a.handle && <span className="muted small">· {a.handle}</span>}</span>
                    <a className="small" href={`mailto:${a.email}`}>{a.email}</a>
                    {a.platforms && <span className="small muted">{a.platforms}</span>}
                    {a.video_links && <span className="small admin-links">{a.video_links.split(/\s+/).filter(Boolean).slice(0, 5).map((l) => <a key={l} href={l} target="_blank" rel="noreferrer">{l}</a>)}</span>}
                    {a.note && <p className="small">{a.note}</p>}
                    <span className="tiny muted">{new Date(a.created_at).toLocaleString('en-PH')}</span>
                  </article>
                ))}
              </div>
            )}

            {tab === 'deals' && <DealsAdmin q={q} loc={loc} reload={load} />}
          </section>
          <section className="section"><button className="btn btn-quiet" onClick={() => supabase.auth.signOut()}>Sign out of admin</button></section>
        </>
      )}
    </div>
  );
}

function PendingVideo({ v, place, onReview, onOpenPlace }) {
  const [meta, setMeta] = useState(null);
  useEffect(() => { if (v.platform === 'tiktok' || v.platform === 'youtube') api.oembed(v.url).then(setMeta).catch(() => {}); }, [v.url, v.platform]);
  return (
    <article className="card stack-8">
      <div className="share-video" style={{ padding: 0, border: 0 }}>
        <a className={`vtile vtile-${v.platform}`} href={v.url} target="_blank" rel="noreferrer">
          {meta && meta.thumb && <img src={meta.thumb} alt="" />}
          <span className="badge-plat">{PLATFORM_LABEL[v.platform]}</span>
        </a>
        <span className="stack-4 grow">
          <span className="strong small">{v.creator_handle || (meta && meta.author) || 'Unknown creator'}</span>
          <span className="small muted clamp-3">{v.title || (meta && meta.title) || v.url}</span>
          <button className="link-btn left" onClick={() => onOpenPlace(v.google_place_id)}>→ {(place && place.name) || 'Open place'}</button>
        </span>
      </div>
      <div className="row-6">
        <button className="btn btn-primary grow" onClick={() => onReview(v.id, true)}><Icon name="check" size={18} /> Approve</button>
        <button className="btn btn-quiet grow" onClick={() => onReview(v.id, false)}>Reject</button>
      </div>
    </article>
  );
}

function DealsAdmin({ q, loc, reload }) {
  const [place, setPlace] = useState(null);
  const [search, setSearch] = useState('');
  const [results, setResults] = useState(null);
  const [f, setF] = useState({ kind: 'card_promo', title: '', detail: '', code: '', source: '', ends: '' });
  const [state, setState] = useState('idle');
  const set = (k) => (e) => setF((x) => ({ ...x, [k]: e.target.value }));

  async function find(e) {
    e.preventDefault();
    if (!search.trim()) return;
    setResults(await api.search(search.trim(), loc.lat, loc.lng).catch(() => []));
  }
  async function save(e) {
    e.preventDefault();
    if (!place || !f.title.trim()) return;
    setState('saving');
    const { error } = await supabase.rpc('admin_save_deal', {
      p_place: place.id, p_kind: f.kind, p_title: f.title.trim(), p_detail: f.detail.trim(),
      p_code: f.code.trim(), p_source: f.source.trim(), p_ends: f.ends || null,
    });
    setState(error ? 'error' : 'saved');
    if (!error) { setF({ kind: f.kind, title: '', detail: '', code: '', source: '', ends: '' }); setPlace(null); setResults(null); reload(); }
  }
  async function end(id) { await supabase.rpc('admin_end_deal', { p_id: id }); reload(); }

  return (
    <div className="stack-16">
      <form className="card stack-12" onSubmit={save}>
        <h2 className="h3">Add a deal</h2>
        {place ? (
          <div className="pick-row pick-on"><span className="grow row-title-sm">{place.name}</span><button type="button" className="icon-btn" aria-label="Change place" onClick={() => setPlace(null)}><Icon name="close" size={18} /></button></div>
        ) : (
          <>
            <div className="dish-add">
              <label className="sr-only" htmlFor="dealq">Find the restaurant</label>
              <input id="dealq" placeholder="Find the restaurant" value={search} onChange={(e) => setSearch(e.target.value)} />
              <button type="button" className="soft-btn" onClick={find}>Search</button>
            </div>
            {(results || []).slice(0, 6).map((p) => (
              <button type="button" key={p.id} className="pick-row" onClick={() => setPlace(p)}>
                <span className="grow"><span className="row-title-sm block">{p.name}</span><span className="tiny muted">{p.address}</span></span>
              </button>
            ))}
          </>
        )}
        <label className="field">Type
          <select value={f.kind} onChange={set('kind')}>
            <option value="card_promo">Card promo</option>
            <option value="creator_code">Creator code</option>
            <option value="restaurant_promo">Restaurant promo</option>
          </select>
        </label>
        <label className="field">Title<input required maxLength={100} placeholder="20% off with BPI cards" value={f.title} onChange={set('title')} /></label>
        <label className="field">Details<input maxLength={200} placeholder="Min. spend ₱1,500 · weekdays only" value={f.detail} onChange={set('detail')} /></label>
        <label className="field">Code (optional)<input maxLength={40} value={f.code} onChange={set('code')} /></label>
        <label className="field">Source / terms link<input type="url" value={f.source} onChange={set('source')} /></label>
        <label className="field">Ends on<input type="date" value={f.ends} onChange={set('ends')} /></label>
        {state === 'error' && <Notice tone="warn">Could not save the deal.</Notice>}
        {state === 'saved' && <Notice tone="info">Deal is live.</Notice>}
        <button className="btn btn-primary" disabled={!place || state === 'saving'}>{state === 'saving' ? 'Saving…' : 'Publish deal'}</button>
      </form>
      <div className="stack-8">
        <h2 className="h3">Live deals</h2>
        {q.deals.length === 0 && <p className="small muted">No live deals.</p>}
        {q.deals.map((d) => (
          <div key={d.id} className="pick-row">
            <span className="grow"><span className="row-title-sm block">{d.title}</span>
              <span className="tiny muted">{(q.byId[d.google_place_id] && q.byId[d.google_place_id].name) || ''}{d.ends_on ? ` · until ${d.ends_on}` : ''}</span></span>
            <button className="soft-btn" onClick={() => end(d.id)}>End</button>
          </div>
        ))}
      </div>
    </div>
  );
}
