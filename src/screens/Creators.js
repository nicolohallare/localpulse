import React, { useEffect, useState } from 'react';
import { supabase, initials } from '../lib';
import { Icon, Notice } from '../ui';
import { game, creatorTier } from '../game';

export default function Creators({ onBack, onOpenRanks }) {
  const [top, setTop] = useState(null);
  useEffect(() => { game.creators(30).then((d) => setTop((d || []).slice(0, 3))).catch(() => setTop([])); }, []);
  const [form, setForm] = useState({ name: '', email: '', handle: '', platforms: '', video_links: '', note: '' });
  const [state, setState] = useState('idle');
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e) {
    e.preventDefault();
    setState('saving');
    setErr(null);
    const payload = Object.fromEntries(Object.entries(form).map(([k, v]) => [k, v.trim() || null]));
    const { error } = await supabase.from('creator_applications').insert(payload);
    if (error) { setErr('Could not send. Please check your details and try again.'); setState('idle'); return; }
    setState('done');
  }

  return (
    <div className="screen">
      <div className="px pad-top row-6">
        <button className="icon-btn ring" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
      </div>
      <header className="px stack-8 creator-head">
        <span className="pill-tag">For creators</span>
        <h1 className="display">Put your food videos on the map</h1>
        <p className="muted">Your reviews show on each restaurant’s LocalPulse page and play from your original post, so views go to you. You choose which videos appear, and can remove them anytime.</p>
      </header>

      <section className="section">
        <ul className="benefits">
          <li><Icon name="pin" size={18} /> Your videos pinned to the places you review</li>
          <li><Icon name="video" size={18} /> Plays on TikTok / YouTube — your views, your credit</li>
          <li><Icon name="tag" size={18} /> Share your promo codes with diners nearby</li>
        </ul>
      </section>

      <section className="section stack-12">
        <div className="row-between">
          <h2 className="h2">Creator leaderboard</h2>
          <button className="link-btn" onClick={onOpenRanks}>See all</button>
        </div>
        <p className="small muted">Ranked by <strong className="ink">Pulse visits</strong>: people who watched your video on LocalPulse, then went and checked in. Proof you sent real customers.</p>
        {top && top.length === 0 && (
          <div className="card small muted">No Pulse visits yet this month — the first creator to send a diner takes #1.</div>
        )}
        {top && top.length > 0 && (
          <ol className="rank-list">
            {top.map((r) => {
              const tier = creatorTier(r.pulse_visits);
              return (
                <li key={r.creator} className="rank-row">
                  <span className={`rank-num ${['', 'rank-gold', 'rank-silver', 'rank-bronze'][r.rank] || ''}`}>{r.rank}</span>
                  <span className="avatar avatar-creator">{initials(r.creator.replace(/^@/, ''))}</span>
                  <span className="grow">
                    <span className="strong small block">{r.creator}</span>
                    <span className={`tier ${tier.cls}`}>{tier.name}</span>
                  </span>
                  <span className="rank-pts">{r.pulse_visits}<small>visits</small></span>
                </li>
              );
            })}
          </ol>
        )}
        <div className="row-wrap">
          <span className="tier tier-rising">Rising · 1+</span>
          <span className="tier tier-trend">Trending · 10+</span>
          <span className="tier tier-pick">Pulse Pick · 25+</span>
          <span className="first-feature">First to feature</span>
        </div>
      </section>

      <section className="section">
        {state === 'done' ? (
          <div className="stack-12 center card">
            <span className="done-icon"><Icon name="check" size={32} stroke={2.4} /></span>
            <p className="strong">Thanks! We’ll be in touch.</p>
            <p className="small muted">We review every application and reply by email.</p>
          </div>
        ) : (
          <form className="stack-12 card" onSubmit={submit}>
            <h2 className="h3">Apply to join</h2>
            <label className="field">Name<input required maxLength={80} value={form.name} onChange={set('name')} /></label>
            <label className="field">Email<input required type="email" maxLength={120} value={form.email} onChange={set('email')} /></label>
            <label className="field">Main handle<input maxLength={60} placeholder="@yourhandle" value={form.handle} onChange={set('handle')} /></label>
            <label className="field">Platforms<input maxLength={120} placeholder="TikTok, YouTube, Instagram" value={form.platforms} onChange={set('platforms')} /></label>
            <label className="field">Links to 1–5 food review videos
              <textarea rows={3} maxLength={2000} placeholder="One link per line" value={form.video_links} onChange={set('video_links')} />
            </label>
            <label className="field">Anything else? (optional)<textarea rows={2} maxLength={1000} value={form.note} onChange={set('note')} /></label>
            {err && <Notice tone="warn">{err}</Notice>}
            <button className="btn btn-primary" disabled={state === 'saving'}>{state === 'saving' ? 'Sending…' : 'Send application'}</button>
            <p className="tiny muted">We only use your email to reply about LocalPulse.</p>
          </form>
        )}
      </section>
    </div>
  );
}
