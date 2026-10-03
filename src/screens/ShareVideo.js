import React, { useCallback, useEffect, useState } from 'react';
import { api, supabase, ensureUser, detectPlatform, distanceM, fmtDistance, PLATFORM_LABEL } from '../lib';
import { Icon, PlacePhoto, Spinner, Notice } from '../ui';

// Add a creator video (TikTok, YouTube, Reels) to a place.
// Opened from the app, or straight from TikTok via Share → LocalPulse.
export default function ShareVideo({ initialUrl = '', loc, onBack, onOpen }) {
  const [url, setUrl] = useState(initialUrl);
  const [match, setMatch] = useState(null);
  const [state, setState] = useState('idle'); // idle | matching | ready | saving | done
  const [err, setErr] = useState(null);
  const [pick, setPick] = useState(null);
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);

  const run = useCallback(async (link) => {
    const u = String(link || '').trim();
    if (!detectPlatform(u)) { setErr('Paste a TikTok, YouTube, Instagram or Facebook link.'); return; }
    setErr(null);
    setState('matching');
    setPick(null);
    setResults(null);
    try {
      const m = await api.matchVideo(u, loc.lat, loc.lng);
      setMatch(m);
      if (m.candidates && m.candidates.length) setPick(m.candidates[0]);
      setState('ready');
    } catch (e) {
      setErr(e.message);
      setState('idle');
    }
  }, [loc.lat, loc.lng]);

  useEffect(() => {
    if (initialUrl) run(initialUrl);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function search(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setResults([]);
    try { setResults(await api.search(q.trim(), loc.lat, loc.lng)); } catch (x) { setResults([]); }
  }

  async function submit() {
    if (!pick || !match) return;
    setState('saving');
    setErr(null);
    try {
      await ensureUser();
      const v = match.video;
      const { error } = await supabase.from('place_videos').insert({
        google_place_id: pick.id,
        platform: v.platform,
        url: v.url,
        creator_handle: v.handle ? `@${v.handle}` : (v.author || null),
        title: v.title ? String(v.title).slice(0, 200) : null,
      });
      if (error) throw error;
      setState('done');
    } catch (e) {
      setErr('Could not submit. Please try again.');
      setState('ready');
    }
  }

  const v = match && match.video;
  const options = results || (match && match.candidates) || [];

  return (
    <div className="screen">
      <div className="px pad-top row-6">
        <button className="icon-btn ring" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
      </div>
      <header className="px stack-8">
        <span className="pill-tag">Add a food video</span>
        <h1 className="display">Pin a TikTok to the map</h1>
        <p className="muted">Paste a link, or in TikTok tap <strong className="ink">Share → LocalPulse</strong>. We’ll find the restaurant for you.</p>
      </header>

      {state === 'done' ? (
        <section className="section">
          <div className="card stack-12 center">
            <span className="done-icon"><Icon name="check" size={32} stroke={2.4} /></span>
            <p className="strong">Thanks! It’s on its way to {pick.name}.</p>
            <p className="small muted">Videos appear after a quick check, and play from the creator’s original post.</p>
            <button className="btn btn-primary" onClick={() => onOpen(pick.id)}>See {pick.name}</button>
            <button className="btn btn-quiet" onClick={() => { setUrl(''); setMatch(null); setState('idle'); }}>Add another</button>
          </div>
        </section>
      ) : (
        <>
          <section className="section">
            <form className="stack-8" onSubmit={(e) => { e.preventDefault(); run(url); }}>
              <label className="field">Video link
                <input type="url" inputMode="url" placeholder="https://www.tiktok.com/@…/video/…" value={url}
                  onChange={(e) => setUrl(e.target.value)} />
              </label>
              <button className="btn btn-primary" disabled={state === 'matching' || !url.trim()}>
                {state === 'matching' ? 'Finding the place…' : 'Find the restaurant'}
              </button>
            </form>
            {err && <Notice tone="warn">{err}</Notice>}
          </section>

          {state === 'matching' && <section className="section"><Spinner label="Reading the caption and checking Google Maps…" /></section>}

          {v && state !== 'matching' && (
            <section className="section stack-12">
              <div className="share-video">
                <span className={`vtile vtile-${v.platform}`}>
                  {v.thumb && <img src={v.thumb} alt="" />}
                  <span className="badge-plat">{PLATFORM_LABEL[v.platform]}</span>
                </span>
                <span className="stack-4 grow">
                  {(v.handle || v.author) && <span className="strong small">{v.handle ? `@${v.handle}` : v.author}</span>}
                  <span className="small muted clamp-3">{v.title || 'No caption available'}</span>
                </span>
              </div>

              <h2 className="h3">Which place is it?</h2>
              {options.length === 0 && (
                <p className="small muted">{results ? 'No matches — try another name.' : 'We couldn’t tell from the caption. Search for the place below.'}</p>
              )}
              <div className="stack-8" role="radiogroup" aria-label="Place">
                {options.map((p) => {
                  const d = distanceM(loc, p);
                  const on = pick && pick.id === p.id;
                  return (
                    <button key={p.id} role="radio" aria-checked={on} className={`pick-row ${on ? 'pick-on' : ''}`} onClick={() => setPick(p)}>
                      <PlacePhoto photo={p.photos[0]} width={160} className="pick-thumb" alt="" />
                      <span className="grow">
                        <span className="row-title-sm block">{p.name}</span>
                        <span className="tiny muted">{[p.address, d != null ? fmtDistance(d) : null].filter(Boolean).join(' · ')}</span>
                      </span>
                      <span className="pick-dot" aria-hidden="true">{on && <Icon name="check" size={16} stroke={3} />}</span>
                    </button>
                  );
                })}
              </div>

              <form className="search" onSubmit={search} role="search">
                <Icon name="search" size={20} />
                <label className="sr-only" htmlFor="pq">Search for a different place</label>
                <input id="pq" type="search" placeholder="Not right? Search the place" value={q} onChange={(e) => setQ(e.target.value)} />
              </form>

              <button className="btn btn-primary" disabled={!pick || state === 'saving'} onClick={submit}>
                {state === 'saving' ? 'Sending…' : pick ? `Add to ${pick.name}` : 'Pick a place'}
              </button>
              <p className="tiny muted">Place details from Google Maps. Only add videos that review this place.</p>
            </section>
          )}
        </>
      )}
    </div>
  );
}
