import React, { useEffect, useState } from 'react';
import { initials } from '../lib';
import { game, creatorTier, levelFor, POINT_RULES } from '../game';
import { Icon, Spinner, Empty, Notice } from '../ui';

const MEDAL = { 1: 'rank-gold', 2: 'rank-silver', 3: 'rank-bronze' };

export default function Ranks({ onBack, initial = 'diners', onOpenUser }) {
  const [board, setBoard] = useState(initial);
  const [period, setPeriod] = useState('week');
  const [rows, setRows] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    let off = false;
    setRows(null);
    setErr(null);
    const load = board === 'diners' ? game.leaderboard(period) : board === 'influencers' ? game.influencers(30) : game.creators(30);
    load.then((d) => !off && setRows(d || [])).catch((e) => !off && setErr(e));
    return () => { off = true; };
  }, [board, period]);

  return (
    <div className="screen">
      <div className="px pad-top row-6">
        <button className="icon-btn ring" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
      </div>
      <header className="px stack-8">
        <span className="pill-tag">Leaderboard</span>
        <h1 className="display">Top of the table</h1>
        <p className="muted">
          {board === 'diners'
            ? 'Points come from verified visits. Your score never changes your points — honest 4/10s count the same as 10/10s.'
            : board === 'influencers'
              ? 'Everyone’s an influencer. These locals sent the most people to places through their takes this month.'
              : 'Creators climb when people watch their video on Ube Banana and then actually go.'}
        </p>
      </header>

      <section className="section stack-12">
        <div className="seg" role="tablist" aria-label="Board">
          <button role="tab" aria-selected={board === 'diners'} className={board === 'diners' ? 'seg-on' : ''} onClick={() => setBoard('diners')}>Diners</button>
          <button role="tab" aria-selected={board === 'influencers'} className={board === 'influencers' ? 'seg-on' : ''} onClick={() => setBoard('influencers')}>Influencers</button>
          <button role="tab" aria-selected={board === 'creators'} className={board === 'creators' ? 'seg-on' : ''} onClick={() => setBoard('creators')}>Creators</button>
        </div>

        {board === 'diners' && (
          <div className="row-6">
            <button className={`chip ${period === 'week' ? 'chip-on' : ''}`} aria-pressed={period === 'week'} onClick={() => setPeriod('week')}>This week</button>
            <button className={`chip ${period === 'all' ? 'chip-on' : ''}`} aria-pressed={period === 'all'} onClick={() => setPeriod('all')}>All time</button>
          </div>
        )}

        {err && <Notice tone="warn" title="Couldn’t load the leaderboard">{err.message}</Notice>}
        {!rows && !err && <Spinner />}

        {rows && rows.length === 0 && (
          board === 'diners'
            ? <Empty icon="check" title={period === 'week' ? 'Nobody’s on the board this week' : 'No check-ins yet'}>The first verified check-in takes the top spot.</Empty>
            : board === 'influencers'
              ? <Empty icon="user" title="No influence yet">When someone opens a place from your take and then checks in there, you’ll show up here.</Empty>
              : <Empty icon="video" title="No visits sent yet">When someone watches a creator’s video here and then checks in at that place, the creator shows up on this board.</Empty>
        )}

        {rows && rows.length > 0 && (
          <ol className="rank-list">
            {board === 'diners' && rows.map((r) => (
              <li key={`${r.rank}-${r.display_name}-${r.points}`} className={`rank-row ${r.is_me ? 'rank-me' : ''}`}>
                <span className={`rank-num ${MEDAL[r.rank] || ''}`}>{r.rank}</span>
                <span className="avatar">{initials(r.display_name)}</span>
                <span className="grow">
                  <span className="strong small block">{r.display_name}{r.is_me ? ' (you)' : ''}</span>
                  <span className="tiny muted">{levelFor(r.points).name} · {r.visits} check-in{r.visits === 1 ? '' : 's'} · {r.places} place{r.places === 1 ? '' : 's'}</span>
                </span>
                <span className="rank-pts">{r.points}<small>pts</small></span>
              </li>
            ))}
            {board === 'influencers' && rows.map((r) => (
              <li key={r.user_id} className={`rank-row ${r.is_me ? 'rank-me' : ''}`}>
                <span className={`rank-num ${MEDAL[r.rank] || ''}`}>{r.rank}</span>
                <button className="rank-open" onClick={() => onOpenUser && onOpenUser(r.user_id)}>
                  <span className="avatar">{initials(r.display_name)}</span>
                  <span className="grow">
                    <span className="strong small block">{r.display_name}{r.is_me ? ' (you)' : ''}</span>
                    <span className="tiny muted">{r.followers} follower{r.followers === 1 ? '' : 's'}</span>
                  </span>
                </button>
                <span className="rank-pts">{r.influenced}<small>went</small></span>
              </li>
            ))}
            {board === 'creators' && rows.map((r) => {
              const tier = creatorTier(r.pulse_visits);
              return (
                <li key={r.creator} className="rank-row">
                  <span className={`rank-num ${MEDAL[r.rank] || ''}`}>{r.rank}</span>
                  <span className="avatar avatar-creator">{initials(r.creator.replace(/^@/, ''))}</span>
                  <span className="grow">
                    <span className="strong small block">{r.creator}</span>
                    <span className="tiny muted"><span className={`tier ${tier.cls}`}>{tier.name}</span> {r.places} place{r.places === 1 ? '' : 's'} · {r.plays} play{r.plays === 1 ? '' : 's'} here</span>
                  </span>
                  <span className="rank-pts">{r.pulse_visits}<small>visits</small></span>
                </li>
              );
            })}
          </ol>
        )}
      </section>

      <section className="section">
        {board === 'diners' ? (
          <div className="card stack-8">
            <h2 className="h3">How points work</h2>
            {POINT_RULES.map(([k, v]) => (
              <div key={k} className="row-between small"><span>{k}</span><strong className="ube">{v}</strong></div>
            ))}
            <p className="tiny muted">The weekly board resets every Monday (Manila time). Hold the most check-ins at a place over 60 days to wear its 👑 Suki crown.</p>
          </div>
        ) : (
          <div className="card stack-8">
            <h2 className="h3">How creators climb</h2>
            <p className="small"><strong>Visit sent</strong> — someone plays your video on Ube Banana, then checks in at that place within 14 days. Each viewer counts once per video.</p>
            <p className="small"><strong>First to feature</strong> — the first approved video of a place keeps a permanent credit on its page.</p>
            <div className="row-wrap">
              <span className="tier tier-rising">Rising · 1+</span>
              <span className="tier tier-trend">Trending · 10+</span>
              <span className="tier tier-pick">Ube Pick · 25+</span>
            </div>
            <p className="tiny muted">Visits sent in the last 30 days. Based only on activity in Ube Banana.</p>
          </div>
        )}
      </section>
    </div>
  );
}
