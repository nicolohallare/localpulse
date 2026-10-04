import React, { useEffect, useState } from 'react';
import { supabase, ensureUser, getLocation, distanceM, fmtDistance, CHECKIN_RADIUS_M, isPreviewHost } from '../lib';
import { Icon, Sheet, Spinner, Notice } from '../ui';
import { game, levelFor, badgeState } from '../game';
import { pushStatus, enablePush } from '../push';

const TAGS = ['Must try', 'Worth the wait', 'Good value', 'Date night', 'Slow service', 'Good for groups', 'Kid-friendly', 'Pet-friendly', 'Aircon', 'Parking'];
const LABEL = ['', 'Skip it', 'Poor', 'Meh', 'Below average', 'Okay', 'Decent', 'Good', 'Great', 'Excellent', 'Unforgettable'];

// Steps: locating → (too-far | name) → rate → saving → done
export default function CheckIn({ place, onClose, onDone }) {
  const [step, setStep] = useState('locating');
  const [problem, setProblem] = useState(null);
  const [distance, setDistance] = useState(null);
  const [coords, setCoords] = useState(null);
  const [skip, setSkip] = useState(false);
  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [score, setScore] = useState(0);
  const [tags, setTags] = useState([]);
  const [review, setReview] = useState('');
  const [good, setGood] = useState([]);
  const [bad, setBad] = useState([]);
  const [suggest, setSuggest] = useState([]);
  const [before, setBefore] = useState(null);
  const [after, setAfter] = useState(null);
  const [placeGame, setPlaceGame] = useState(null);
  const [crown, setCrown] = useState(false);

  async function start(skipDistance = false) {
    setProblem(null);
    setStep('locating');
    setSkip(skipDistance);
    try {
      const u = await ensureUser();
      setUser(u);
      game.me().then(setBefore).catch(() => {});
      supabase.rpc('get_place_dishes', { p_place: place.id }).then(({ data }) => {
        if (data) setSuggest([...(data.good || []), ...(data.bad || [])].map((d) => d.dish).filter((d, i, a) => a.indexOf(d) === i).slice(0, 8));
      });
      if (!skipDistance) {
        const here = await getLocation({ highAccuracy: true, timeout: 12000 });
        setCoords(here);
        const d = distanceM(here, place);
        setDistance(d);
        if (d != null && d > CHECKIN_RADIUS_M + Math.min(here.accuracy || 0, 100)) { setStep('too-far'); return; }
      }
      const { data: prof } = await supabase.from('profiles').select('display_name').eq('id', u.id).maybeSingle();
      setStep(prof ? 'rate' : 'name');
    } catch (e) {
      setProblem(e);
      setStep('error');
    }
  }

  useEffect(() => {
    start();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function saveName(e) {
    e.preventDefault();
    const n = name.trim().slice(0, 40);
    if (!n) return;
    const { error } = await supabase.from('profiles').upsert({ id: user.id, display_name: n });
    if (error) { setProblem({ message: 'Could not save your name. Try again.' }); return; }
    setStep('rate');
  }

  async function post() {
    setStep('saving');
    setProblem(null);
    try {
      const { data: s } = await supabase.auth.getSession();
      const token = s.session && s.session.access_token;
      const r = await fetch('/api/checkin', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          placeId: place.id,
          lat: coords && coords.lat,
          lng: coords && coords.lng,
          accuracy: coords && coords.accuracy,
          skip,
          score,
          tags,
          review: review.trim() || null,
          good,
          bad,
        }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw Object.assign(new Error(data.error || 'Could not save your check-in.'), { hint: data.hint });
      if (data.distance != null) setDistance(data.distance);
      setCrown(!!data.crown);
      const [a, pgm] = await Promise.all([game.me().catch(() => null), game.place(place.id).catch(() => null)]);
      setAfter(a);
      setPlaceGame(pgm);
      setStep('done');
      onDone && onDone();
    } catch (e) {
      setProblem(e);
      setStep('rate');
    }
  }

  const toggleTag = (t) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < 6 ? [...cur, t] : cur));

  return (
    <Sheet title={step === 'done' ? 'Checked in' : `Check in at ${place.name}`} onClose={onClose} tall={step === 'rate' || step === 'saving'}>
      {step === 'locating' && <Spinner label="Confirming you’re here…" />}

      {step === 'error' && problem && (
        <div className="stack-12">
          <Notice tone="warn" title={problem.message}>{problem.hint}</Notice>
          <button className="btn btn-primary" onClick={() => start()}>Try again</button>
          {isPreviewHost() && <button className="btn btn-quiet" onClick={() => start(true)}>Preview only: skip location check</button>}
        </div>
      )}

      {step === 'too-far' && (
        <div className="stack-12 center">
          <span className="far-icon"><Icon name="pin" size={30} /></span>
          <p className="strong">You’re {fmtDistance(distance)} away</p>
          <p className="small muted">Check-ins only count when you’re at the restaurant, so every LocalPulse take comes from a real visit.</p>
          <button className="btn btn-primary" onClick={() => start()}>I’m here now — try again</button>
          {isPreviewHost() && <button className="btn btn-quiet" onClick={() => start(true)}>Preview only: skip location check</button>}
        </div>
      )}

      {step === 'name' && (
        <form className="stack-12" onSubmit={saveName}>
          <p className="small muted">Your takes help people decide where to eat. What name should they see? No sign-up needed.</p>
          <label className="field">Your name
            <input autoFocus required maxLength={40} placeholder="e.g. Mika C." value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          {problem && <Notice tone="warn">{problem.message}</Notice>}
          <button className="btn btn-primary">Continue</button>
        </form>
      )}

      {(step === 'rate' || step === 'saving') && (
        <div className="stack-16">
          <span className="verified-pill"><Icon name="shield" size={15} /> {distance != null ? `You’re here · ${fmtDistance(distance)}` : 'Visit confirmed'}</span>
          <p className="small muted">You’re the influencer here — your take shows up for people deciding where to eat.</p>
          <div className="stack-8">
            <span className="field-label">Your score out of 10</span>
            <div className="score-pick">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button key={n} type="button" aria-pressed={score === n} className={score === n ? 'on' : ''} onClick={() => setScore(n)}>{n}</button>
              ))}
            </div>
            <span className="score-word">{score ? LABEL[score] : 'Tap a number'}</span>
          </div>

          <DishPicker label="👍 Order this" tone="good" items={good} setItems={setGood} other={bad} suggest={suggest} />
          <DishPicker label="👎 Skip this" tone="bad" items={bad} setItems={setBad} other={good} suggest={suggest} />

          <label className="field">Your take (optional)
            <textarea rows={3} maxLength={500} placeholder="What should people know before going?"
              value={review} onChange={(e) => setReview(e.target.value)} />
          </label>
          <div className="stack-8">
            <span className="field-label">Good to know</span>
            <div className="row-wrap">
              {TAGS.map((t) => (
                <button key={t} type="button" aria-pressed={tags.includes(t)} className={`chip ${tags.includes(t) ? 'chip-soft-on' : ''}`} onClick={() => toggleTag(t)}>{t}</button>
              ))}
            </div>
          </div>
          {problem && <Notice tone="warn" title={problem.message}>{problem.hint}</Notice>}
          <button className="btn btn-primary" disabled={!score || step === 'saving'} onClick={post}>
            {step === 'saving' ? 'Posting…' : 'Post my take'}
          </button>
        </div>
      )}

      {step === 'done' && (
        <div className="stack-12 center">
          <span className="done-icon"><Icon name="check" size={36} stroke={2.4} /></span>
          <h3 className="display-xs">Your take is live</h3>
          <p className="muted">Your {score}/10 now counts toward {place.name}’s LocalPulse score. If someone goes because of your take, you earn influence points.</p>
          <Reward before={before} after={after} placeGame={placeGame} crown={crown} />
          <NotifyOffer />
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      )}
    </Sheet>
  );
}

function DishPicker({ label, tone, items, setItems, other, suggest }) {
  const [text, setText] = useState('');
  const add = (raw) => {
    const d = String(raw || '').trim().toLowerCase().slice(0, 30);
    if (!d || items.includes(d) || other.includes(d) || items.length >= 4) return;
    setItems([...items, d]);
    setText('');
  };
  const options = suggest.filter((s) => !items.includes(s) && !other.includes(s)).slice(0, 5);
  return (
    <div className="stack-8">
      <span className="field-label">{label}</span>
      <div className="row-wrap">
        {items.map((d) => (
          <button key={d} type="button" className={`dish-chip dish-${tone}`} onClick={() => setItems(items.filter((x) => x !== d))} aria-label={`Remove ${d}`}>
            {d} <Icon name="close" size={12} stroke={2.6} />
          </button>
        ))}
        {options.map((d) => (
          <button key={d} type="button" className="chip dish-suggest" onClick={() => add(d)}>+ {d}</button>
        ))}
      </div>
      {items.length < 4 && (
        <form className="dish-add" onSubmit={(e) => { e.preventDefault(); add(text); }}>
          <label className="sr-only" htmlFor={`dish-${tone}`}>{label}</label>
          <input id={`dish-${tone}`} placeholder={tone === 'good' ? 'e.g. sisig, kare-kare' : 'e.g. halo-halo'} value={text} maxLength={30}
            onChange={(e) => setText(e.target.value)} enterKeyHint="done" />
          <button className="soft-btn" disabled={!text.trim()}>Add</button>
        </form>
      )}
    </div>
  );
}

function NotifyOffer() {
  const [state, setState] = useState(null);
  const [msg, setMsg] = useState(null);
  useEffect(() => { pushStatus().then(setState).catch(() => setState('unsupported')); }, []);
  if (state !== 'off') return null;
  return (
    <div className="notify-card">
      <span className="grow small"><strong>Get a heads-up</strong> if someone takes your 👑 crown, or people you follow post a take.</span>
      <button className="soft-btn" onClick={() => enablePush().then(() => setState('on')).catch((e) => setMsg(e.message))}>Turn on</button>
      {msg && <span className="tiny muted">{msg}</span>}
    </div>
  );
}

function Reward({ before, after, placeGame, crown }) {
  if (!after) return null;
  const b = before || { points: 0 };
  const gained = Math.max(0, (after.points || 0) - (b.points || 0));
  const lvlBefore = levelFor(b.points || 0);
  const lvlAfter = levelFor(after.points || 0);
  const had = new Set(badgeState(before).filter((x) => x.earned).map((x) => x.id));
  const fresh = badgeState(after).filter((x) => x.earned && !had.has(x.id));
  const suki = placeGame && placeGame.suki;
  const trail = after.trailblazers > (b.trailblazers || 0);
  return (
    <div className="reward">
      <div className="row-between">
        <span className="reward-pts">+{gained} pts</span>
        <span className="small muted">{after.points} total</span>
      </div>
      {trail && <div className="reward-row"><span className="badge-medal">🧭</span> First on LocalPulse here — Trailblazer bonus!</div>}
      {lvlAfter.index > lvlBefore.index && (
        <div className="reward-row"><span className="badge-medal">⭐</span> Level up: you’re now {lvlAfter.name}</div>
      )}
      {fresh.filter((x) => x.id !== 'trailblazer').map((x) => (
        <div key={x.id} className="reward-row"><span className="badge-medal">{x.glyph}</span> New badge: {x.name}</div>
      ))}
      {(crown || (suki && suki.is_me)) && <div className="reward-row"><span className="badge-medal">👑</span> You’re the Suki of this place</div>}
      {lvlAfter.next && <span className="tiny muted">{lvlAfter.toNext} pts to {lvlAfter.next.name}</span>}
    </div>
  );
}
