import React, { useEffect, useState } from 'react';
import { supabase, ensureUser, getLocation, distanceM, fmtDistance, CHECKIN_RADIUS_M, isPreviewHost } from '../lib';
import { Icon, Sheet, Spinner, Notice } from '../ui';

const TAGS = ['Must try', 'Worth the wait', 'Good value', 'Great for groups', 'Date night', 'Slow service'];
const LABEL = ['', 'Skip it', 'Poor', 'Meh', 'Below average', 'Okay', 'Decent', 'Good', 'Great', 'Excellent', 'Unforgettable'];

// Steps: locating → (too-far | name) → rate → saving → done
export default function CheckIn({ place, onClose, onDone }) {
  const [step, setStep] = useState('locating');
  const [problem, setProblem] = useState(null);
  const [distance, setDistance] = useState(null);
  const [user, setUser] = useState(null);
  const [name, setName] = useState('');
  const [score, setScore] = useState(0);
  const [tags, setTags] = useState([]);
  const [review, setReview] = useState('');

  async function start(skipDistance = false) {
    setProblem(null);
    setStep('locating');
    try {
      const u = await ensureUser();
      setUser(u);
      let d = null;
      if (!skipDistance) {
        const here = await getLocation({ highAccuracy: true, timeout: 12000 });
        d = distanceM(here, place);
        setDistance(d);
        if (d != null && d > CHECKIN_RADIUS_M) { setStep('too-far'); return; }
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
    const { error } = await supabase.from('visits').insert({
      google_place_id: place.id,
      score,
      tags,
      review: review.trim() || null,
      distance_m: distance != null ? Math.min(distance, 300) : null,
    });
    if (error) {
      setProblem({ message: /12 hours|limit/i.test(error.message) ? error.message : 'Could not save your check-in. Try again.' });
      setStep('rate');
      return;
    }
    setStep('done');
    onDone && onDone();
  }

  const toggleTag = (t) => setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : cur.length < 4 ? [...cur, t] : cur));

  return (
    <Sheet title={step === 'done' ? 'Checked in' : `Check in at ${place.name}`} onClose={onClose} tall={step === 'rate'}>
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
          <p className="small muted">Check-ins only count when you’re at the restaurant, so every LocalPulse score comes from real visits.</p>
          <button className="btn btn-primary" onClick={() => start()}>I’m here now — try again</button>
          {isPreviewHost() && <button className="btn btn-quiet" onClick={() => start(true)}>Preview only: skip location check</button>}
        </div>
      )}

      {step === 'name' && (
        <form className="stack-12" onSubmit={saveName}>
          <p className="small muted">What name should show on your reviews? No sign-up needed.</p>
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
          <div className="stack-8">
            <span className="field-label">Your score out of 10</span>
            <div className="score-pick">
              {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10].map((n) => (
                <button key={n} type="button" aria-pressed={score === n} className={score === n ? 'on' : ''} onClick={() => setScore(n)}>{n}</button>
              ))}
            </div>
            <span className="score-word">{score ? LABEL[score] : 'Tap a number'}</span>
          </div>
          <div className="row-wrap">
            {TAGS.map((t) => (
              <button key={t} type="button" aria-pressed={tags.includes(t)} className={`chip ${tags.includes(t) ? 'chip-soft-on' : ''}`} onClick={() => toggleTag(t)}>{t}</button>
            ))}
          </div>
          <label className="field">Your take (optional)
            <textarea rows={3} maxLength={500} placeholder="What should people order? Anything to know before going?"
              value={review} onChange={(e) => setReview(e.target.value)} />
          </label>
          {problem && <Notice tone="warn">{problem.message}</Notice>}
          <button className="btn btn-primary" disabled={!score || step === 'saving'} onClick={post}>
            {step === 'saving' ? 'Posting…' : 'Post check-in'}
          </button>
        </div>
      )}

      {step === 'done' && (
        <div className="stack-12 center">
          <span className="done-icon"><Icon name="check" size={36} stroke={2.4} /></span>
          <h3 className="display-xs">You’re checked in</h3>
          <p className="muted">Your {score}/10 now counts toward {place.name}’s LocalPulse score.</p>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      )}
    </Sheet>
  );
}
