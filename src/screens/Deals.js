import React, { useEffect, useState } from 'react';
import { api, supabase } from '../lib';
import { Icon, Spinner, Empty } from '../ui';

const FILTERS = [
  { k: 'all', label: 'All' },
  { k: 'creator_code', label: 'Creator codes' },
  { k: 'card_promo', label: 'Card promos' },
  { k: 'restaurant_promo', label: 'Restaurant promos' },
];

export default function Deals({ onOpen }) {
  const [deals, setDeals] = useState(null);
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
        <p className="muted">Creator codes and promos near you. Always check the full terms.</p>
      </header>
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
    </div>
  );
}
