import React, { useEffect, useState } from 'react';
import { api, supabase } from '../lib';
import { Icon, Spinner, Empty } from '../ui';
import { usePromos, useMyCards, PromoCard, MyCardsSheet, SubmitPromoSheet } from '../promos';

const FILTERS = [
  { k: 'all', label: 'All' },
  { k: 'creator_code', label: 'Creator codes' },
  { k: 'card_promo', label: 'Card promos' },
  { k: 'restaurant_promo', label: 'Restaurant promos' },
];

export default function Deals({ onOpen, loc }) {
  const [deals, setDeals] = useState(null);
  const promos = usePromos();
  const cards = useMyCards();
  const [mine, setMine] = useState(true);
  const [q, setQ] = useState('');
  const [editCards, setEditCards] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [opening, setOpening] = useState(null);

  async function openMerchant(p) {
    if (p.google_place_id) return onOpen(p.google_place_id);
    setOpening(p.id);
    const r = await api.search(`${p.merchant} restaurant`, loc && loc.lat, loc && loc.lng).catch(() => []);
    setOpening(null);
    if (r && r[0]) onOpen(r[0].id);
  }
  const useMine = mine && cards.length > 0;
  const shownPromos = (promos || [])
    .filter((p) => !useMine || cards.includes(p.bank))
    .filter((p) => !q.trim() || `${p.merchant} ${p.bank} ${p.discount} ${p.branches || ''}`.toLowerCase().includes(q.trim().toLowerCase()));
  const [filter, setFilter] = useState('all');
  const [copied, setCopied] = useState(null);

  useEffect(() => {
    supabase.from('deal_listings').select('*').order('created_at', { ascending: false })
      .then(async ({ data }) => {
        const rows = data || [];
        const names = await api.names([...new Set(rows.map((d) => d.google_place_id).filter(Boolean))]).catch(() => []);
        const byId = Object.fromEntries(names.map((n) => [n.id, n.name]));
        setDeals(rows.map((d) => ({ ...d, liveName: byId[d.google_place_id] || null })));
      });
  }, []);

  const shown = (deals || []).filter((d) => filter === 'all' || d.kind === filter);

  return (
    <div className="screen pad-top">
      <header className="stack-6 px">
        <h1 className="display">Deals</h1>
        <p className="muted">Card promos and creator codes. Always check the full terms.</p>
      </header>

      <section className="section stack-12">
        <div className="row-between">
          <h2 className="h2" style={{ margin: 0 }}>💳 Card promos</h2>
          <button className="soft-btn" onClick={() => setEditCards(true)}><Icon name="tag" size={16} /> {cards.length ? `My cards · ${cards.length}` : 'Set my cards'}</button>
        </div>
        {cards.length > 0 ? (
          <div className="row-6">
            <button className={`chip chip-sm ${mine ? 'chip-on' : ''}`} onClick={() => setMine(true)}>For my cards</button>
            <button className={`chip chip-sm ${!mine ? 'chip-on' : ''}`} onClick={() => setMine(false)}>All banks</button>
          </div>
        ) : (
          <button className="why-card" style={{ textAlign: 'left' }} onClick={() => setEditCards(true)}>
            <span className="strong">Which cards do you have?</span>
            <span className="small">Pick your banks and we’ll only show promos you can actually use — here and on every restaurant.</span>
          </button>
        )}
        <label className="menu-search"><Icon name="search" size={18} /><input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search restaurant or bank" aria-label="Search promos" /></label>
        {!promos && <Spinner label="Loading promos…" />}
        {promos && shownPromos.length === 0 && (
          <Empty icon="tag" title={useMine ? 'No promos for your cards right now' : 'No card promos yet'}>
            {useMine ? 'Try “All banks”, or check back — we read the banks’ promo pages every day.' : 'We read the banks’ promo pages every day. Check back soon.'}
          </Empty>
        )}
        {shownPromos.slice(0, 60).map((p) => (
          <div key={p.id} style={{ opacity: opening === p.id ? 0.6 : 1 }}><PromoCard p={p} onOpenName={openMerchant} /></div>
        ))}
        <button className="dashed-btn" onClick={() => setSubmitting(true)}><Icon name="plus" size={18} /> Saw a card promo? Share it</button>
        <p className="tiny muted">From the banks’ own promo pages, read automatically every day, plus promos shared by users and checked by us.</p>
      </section>
      {editCards && <MyCardsSheet onClose={() => setEditCards(false)} />}
      {submitting && <SubmitPromoSheet onClose={() => setSubmitting(false)} />}
      {deals && deals.length > 0 && (<>
      <h2 className="h2 px" style={{ marginTop: 20 }}>Other deals</h2>
      <div className="chips">
        {FILTERS.map((f) => (
          <button key={f.k} className={`chip ${filter === f.k ? 'chip-on' : ''}`} aria-pressed={filter === f.k} onClick={() => setFilter(f.k)}>{f.label}</button>
        ))}
      </div>
      <section className="section stack-12">
        {!deals && <Spinner label="Loading deals…" />}
        {deals && shown.length === 0 && (
          <Empty icon="tag" title="No deals yet">
            We’re lining up creator codes and promos near you. Check back soon.
          </Empty>
        )}
        {shown.map((d) => (
          <div key={d.id} className={`deal ${d.kind === 'creator_code' ? 'deal-code' : ''}`}>
            <span className="eyebrow">{d.kind === 'creator_code' ? 'Creator code' : d.kind === 'card_promo' ? 'Card promo' : 'Restaurant promo'}</span>
            <span className="strong">{d.title}</span>
            <span className="small muted">{[d.liveName, d.detail].filter(Boolean).join(' · ')}</span>
            <div className="row-between">
              {d.code ? (
                <button className="soft-btn" onClick={() => { navigator.clipboard && navigator.clipboard.writeText(d.code); setCopied(d.id); }}>
                  <Icon name="copy" size={16} /> {copied === d.id ? 'Copied' : d.code}
                </button>
              ) : <span />}
              <span className="row-6">
                {d.google_place_id && <button className="link-btn" onClick={() => onOpen(d.google_place_id)}>View place</button>}
                {d.source_url && <a className="link-out" href={d.source_url} target="_blank" rel="noreferrer">Terms <Icon name="external" size={14} /></a>}
              </span>
            </div>
            {d.ends_on && <span className="tiny muted">Until {new Date(d.ends_on).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' })}</span>}
          </div>
        ))}
      </section>
      </>)}
    </div>
  );
}
