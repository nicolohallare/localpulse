import React, { useEffect, useState } from 'react';
import { api, supabase, ensureUser, currentUser, distanceM, fmtDistance } from '../lib';
import { shareUrl, shareLink } from '../game';
import { Icon, Spinner, Empty, Notice, Sheet } from '../ui';

async function myLists() {
  const u = await currentUser();
  if (!u) return [];
  const { data } = await supabase.from('lists').select('id,title,is_public,created_at, list_items(count)').eq('owner', u.id).order('created_at', { ascending: false });
  return data || [];
}

// ── Save a place to a list (sheet on the place page) ───────────────────────
export function SaveSheet({ place, onClose }) {
  const [lists, setLists] = useState(null);
  const [inList, setInList] = useState(new Set());
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);

  async function load() {
    const ls = await myLists();
    setLists(ls);
    if (ls.length) {
      const { data } = await supabase.from('list_items').select('list_id').eq('google_place_id', place.id).in('list_id', ls.map((l) => l.id));
      setInList(new Set((data || []).map((r) => r.list_id)));
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function toggle(listId) {
    const on = !inList.has(listId);
    const next = new Set(inList);
    if (on) next.add(listId); else next.delete(listId);
    setInList(next);
    if (on) await supabase.from('list_items').insert({ list_id: listId, google_place_id: place.id });
    else await supabase.from('list_items').delete().eq('list_id', listId).eq('google_place_id', place.id);
  }

  async function create(e) {
    e.preventDefault();
    const t = title.trim().slice(0, 60);
    if (!t) return;
    setBusy(true);
    await ensureUser();
    const { data, error } = await supabase.from('lists').insert({ title: t }).select('id').single();
    if (!error && data) {
      await supabase.from('list_items').insert({ list_id: data.id, google_place_id: place.id });
      setTitle('');
      await load();
    }
    setBusy(false);
  }

  return (
    <Sheet title={`Save ${place.name}`} onClose={onClose}>
      {!lists && <Spinner />}
      {lists && (
        <div className="stack-8">
          {lists.length === 0 && <p className="small muted">Make your first list — like “Best sisig in BGC” or “Date night ₱₱”. Lists are shareable.</p>}
          {lists.map((l) => {
            const on = inList.has(l.id);
            return (
              <button key={l.id} className={`pick-row ${on ? 'pick-on' : ''}`} onClick={() => toggle(l.id)} aria-pressed={on}>
                <span className="avatar">📋</span>
                <span className="grow row-title-sm">{l.title}</span>
                <span className="pick-dot" aria-hidden="true">{on && <Icon name="check" size={16} stroke={3} />}</span>
              </button>
            );
          })}
          <form className="dish-add" onSubmit={create}>
            <label className="sr-only" htmlFor="newlist">New list name</label>
            <input id="newlist" placeholder="New list, e.g. Best sisig in BGC" value={title} maxLength={60} onChange={(e) => setTitle(e.target.value)} />
            <button className="soft-btn" disabled={busy || !title.trim()}>Create</button>
          </form>
        </div>
      )}
    </Sheet>
  );
}

// ── Your lists: #/lists ─────────────────────────────────────────────────────
export function MyLists({ onBack, onOpenList }) {
  const [lists, setLists] = useState(null);
  useEffect(() => { myLists().then(setLists); }, []);
  return (
    <div className="screen">
      <div className="px pad-top row-6"><button className="icon-btn ring" onClick={onBack} aria-label="Back"><Icon name="back" /></button></div>
      <header className="px stack-8"><span className="pill-tag">Your lists</span><h1 className="display">Saved places</h1></header>
      <section className="section stack-8">
        {!lists && <Spinner />}
        {lists && lists.length === 0 && <Empty icon="tag" title="No lists yet">Open any place and tap Save to start a list.</Empty>}
        {(lists || []).map((l) => (
          <button key={l.id} className="log-row" onClick={() => onOpenList(l.id)}>
            <span className="avatar">📋</span>
            <span className="grow"><span className="row-title-sm block">{l.title}</span>
              <span className="tiny muted">{(l.list_items && l.list_items[0] && l.list_items[0].count) || 0} places{l.is_public ? '' : ' · private'}</span></span>
            <Icon name="back" size={16} style={{ transform: 'rotate(180deg)' }} />
          </button>
        ))}
      </section>
    </div>
  );
}

// ── One list: #/list/<id> ───────────────────────────────────────────────────
export function ListView({ id, loc, onBack, onOpenPlace, onOpenUser }) {
  const [list, setList] = useState(null);
  const [items, setItems] = useState(null);
  const [owner, setOwner] = useState(null);
  const [mine, setMine] = useState(false);
  const [err, setErr] = useState(null);
  const [note, setNote] = useState(null);

  useEffect(() => {
    (async () => {
      const { data: l } = await supabase.from('lists').select('*').eq('id', id).maybeSingle();
      if (!l) { setErr('This list is private or was deleted.'); return; }
      setList(l);
      const u = await currentUser();
      setMine(!!u && u.id === l.owner);
      supabase.from('profiles').select('display_name').eq('id', l.owner).maybeSingle().then(({ data }) => setOwner(data));
      const { data: it } = await supabase.from('list_items').select('google_place_id,note,created_at').eq('list_id', id).order('created_at');
      const names = await api.names((it || []).map((x) => x.google_place_id)).catch(() => []);
      const byId = Object.fromEntries(names.map((n) => [n.id, n]));
      setItems((it || []).map((x) => ({ ...x, place: byId[x.google_place_id] || { name: 'Place' } })));
    })();
  }, [id]);

  async function share() {
    const r = await shareLink({ title: list.title, text: `${list.title} — on LocalPulse`, url: shareUrl('l', id) });
    if (r === 'copied') setNote('Link copied');
  }
  async function remove(pid) {
    await supabase.from('list_items').delete().eq('list_id', id).eq('google_place_id', pid);
    setItems((cur) => cur.filter((x) => x.google_place_id !== pid));
  }
  async function togglePublic() {
    const { error } = await supabase.from('lists').update({ is_public: !list.is_public }).eq('id', id);
    if (!error) setList({ ...list, is_public: !list.is_public });
  }

  if (err) return <div className="screen pad"><button className="icon-btn ring" onClick={onBack} aria-label="Back"><Icon name="back" /></button><Notice tone="warn">{err}</Notice></div>;
  if (!list) return <div className="screen pad"><Spinner /></div>;

  return (
    <div className="screen">
      <div className="px pad-top row-between">
        <button className="icon-btn ring" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
        {list.is_public && <button className="soft-btn" onClick={share}><Icon name="share" size={16} /> Share list</button>}
      </div>
      <header className="px stack-8">
        <span className="pill-tag">List{owner ? ` by ${owner.display_name}` : ''}</span>
        <h1 className="display">{list.title}</h1>
        {list.description && <p className="muted">{list.description}</p>}
        {owner && !mine && <button className="link-btn left" onClick={() => onOpenUser(list.owner)}>See {owner.display_name}’s profile →</button>}
        {mine && <button className="link-btn left" onClick={togglePublic}>{list.is_public ? 'Public — anyone with the link can see it. Make private' : 'Private — only you can see it. Make public'}</button>}
        {note && <span className="tiny muted">{note}</span>}
      </header>
      <section className="section stack-8">
        {!items && <Spinner />}
        {items && items.length === 0 && <Empty icon="tag" title="Empty list">Open a place and tap Save to add it here.</Empty>}
        {(items || []).map((x, i) => {
          const d = distanceM(loc, x.place);
          return (
            <div key={x.google_place_id} className="pick-row">
              <span className="poll-num">{i + 1}</span>
              <button className="grow list-open" onClick={() => onOpenPlace(x.google_place_id)}>
                <span className="row-title-sm block">{x.place.name}</span>
                <span className="tiny muted">{[x.place.address, d != null ? fmtDistance(d) : null].filter(Boolean).join(' · ')}</span>
              </button>
              {mine && <button className="icon-btn" aria-label={`Remove ${x.place.name}`} onClick={() => remove(x.google_place_id)}><Icon name="close" size={18} /></button>}
            </div>
          );
        })}
        {items && items.length > 0 && <p className="attribution">Place details from Google Maps</p>}
      </section>
    </div>
  );
}

