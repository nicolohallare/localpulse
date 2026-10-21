import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { supabase, ensureUser, currentUser, timeAgo, currencySymbol } from './lib';
import { compressImage, mediaUrl } from './media';
import { Icon, Sheet, Spinner, Notice } from './ui';

// Menus come from photos people add. AI reads each photo once into dishes and prices,
// so you can search what a place serves and what it costs.
const BUCKET = 'take-media';
const MAX_PHOTOS = 4;
const SYMBOL = { PHP: '₱', TWD: 'NT$', HKD: 'HK$', JPY: '¥', KRW: '₩', THB: '฿', VND: '₫', IDR: 'Rp', MYR: 'RM', SGD: 'S$', USD: '$' };

async function readMenu(id) {
  try {
    const r = await fetch(`/api/places/menu?id=${encodeURIComponent(id)}`, { method: 'POST' });
    return await r.json();
  } catch (e) {
    return null;
  }
}

export function MenuTab({ place }) {
  const [isAdmin, setIsAdmin] = useState(false);
  const [photos, setPhotos] = useState(null);
  const [me, setMe] = useState(null);
  const [q, setQ] = useState('');
  const [adding, setAdding] = useState(false);
  const [viewing, setViewing] = useState(null);

  const load = useCallback(async () => {
    const { data } = await supabase.from('menu_photos')
      .select('id,user_id,path,items,currency,read_status,created_at')
      .eq('google_place_id', place.id).eq('hidden', false)
      .order('created_at', { ascending: false }).limit(20);
    setPhotos(data || []);
    // Photos the AI hasn't read yet (e.g. the app closed mid-way) get read now.
    (data || []).filter((p) => p.read_status === 'pending').slice(0, 2).forEach((p) => {
      readMenu(p.id).then((r) => { if (r && r.read_status && r.read_status !== 'pending') setPhotos((cur) => (cur || []).map((x) => (x.id === p.id ? { ...x, ...r } : x))); });
    });
  }, [place.id]);

  useEffect(() => {
    load();
    currentUser().then((u) => { setMe(u); if (u && u.email) supabase.rpc('is_admin').then(({ data }) => setIsAdmin(!!data)); }).catch(() => {});
  }, [load]);

  // One list from all photos; the newest photo wins when the same dish appears twice.
  const items = useMemo(() => {
    const seen = new Map();
    (photos || []).forEach((p) => (p.items || []).forEach((it) => {
      const k = `${it.name.toLowerCase()}|${(it.note || '').toLowerCase()}`;
      if (!seen.has(k)) seen.set(k, { ...it, currency: p.currency, at: p.created_at });
    }));
    return [...seen.values()];
  }, [photos]);

  const shown = q.trim() ? items.filter((it) => `${it.name} ${it.section || ''} ${it.note || ''}`.toLowerCase().includes(q.trim().toLowerCase())) : items;
  const sections = useMemo(() => {
    const by = new Map();
    shown.forEach((it) => { const s = it.section || 'Menu'; if (!by.has(s)) by.set(s, []); by.get(s).push(it); });
    return [...by.entries()];
  }, [shown]);
  const newest = photos && photos[0];
  const reading = (photos || []).some((p) => p.read_status === 'pending');
  const fmt = (it) => (it.price == null ? '—' : `${SYMBOL[it.currency] || currencySymbol()}${Number(it.price).toLocaleString(undefined, { maximumFractionDigits: 2 })}`);

  if (!photos) return <Spinner label="Loading the menu…" />;

  return (
    <div className="stack-12">
      {items.length > 0 && (
        <>
          <label className="menu-search">
            <Icon name="search" size={18} />
            <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search the menu" aria-label="Search the menu" />
          </label>
          {sections.map(([name, list]) => (
            <div key={name} className="menu-section">
              <h3 className="eyebrow">{name}</h3>
              {list.map((it) => (
                <div key={`${it.name}|${it.note || ''}`} className="menu-item">
                  <span className="grow">
                    <span className="small strong">{it.name}</span>
                    {it.note && <span className="tiny muted"> · {it.note}</span>}
                  </span>
                  <span className="menu-price">{fmt(it)}</span>
                </div>
              ))}
            </div>
          ))}
          {shown.length === 0 && <p className="small muted">Nothing on the menu matches “{q}”.</p>}
          <p className="tiny muted">
            Read by AI from menu photos people added{newest ? `, newest ${timeAgo(newest.created_at)}` : ''}. Prices may have changed — check the photos below or ask the restaurant.
          </p>
        </>
      )}

      {items.length === 0 && (
        <div className="menu-empty">
          <p className="strong">{photos.length ? (reading ? 'Reading the menu photo…' : 'No dishes could be read from the photos yet') : 'No menu yet'}</p>
          <p className="small muted">{photos.length ? 'You can still look at the photos below.' : 'At the restaurant? Snap the menu so everyone can see what’s on it and how much.'}</p>
        </div>
      )}
      {reading && items.length > 0 && <p className="tiny muted">Reading a new menu photo…</p>}

      {photos.length > 0 && (
        <div className="stack-8">
          <h3 className="eyebrow">Menu photos</h3>
          <div className="menu-photos">
            {photos.map((p) => (
              <button key={p.id} className="menu-thumb" onClick={() => setViewing(p)} aria-label="View menu photo">
                <img src={mediaUrl(p.path)} alt="" loading="lazy" />
                <span className="clip-tag">{timeAgo(p.created_at)}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <button className="dashed-btn" onClick={() => setAdding(true)}>
        <Icon name="image" size={18} /> {photos.length ? 'Add a newer menu photo' : 'Add a menu photo'}
      </button>

      {(place.mapsUri || place.website) && (
        <div className="row-6">
          {place.mapsUri && <a className="soft-btn" href={place.mapsUri} target="_blank" rel="noreferrer">Menu on Google Maps <Icon name="external" size={14} /></a>}
          {place.website && <a className="soft-btn" href={place.website} target="_blank" rel="noreferrer">Restaurant website <Icon name="external" size={14} /></a>}
        </div>
      )}

      {adding && <AddMenuSheet place={place} onClose={() => setAdding(false)} onAdded={() => { setAdding(false); load(); }} />}
      {viewing && (
        <MenuPhotoSheet photo={viewing} mine={!!me && me.id === viewing.user_id} isAdmin={isAdmin}
          onClose={() => setViewing(null)} onRemoved={() => { setViewing(null); load(); }} />
      )}
    </div>
  );
}

function AddMenuSheet({ place, onClose, onAdded }) {
  const ref = useRef(null);
  const [files, setFiles] = useState([]);
  const [busy, setBusy] = useState(null);
  const [err, setErr] = useState(null);

  function pick(e) {
    const list = Array.from(e.target.files || []).filter((f) => f.type.startsWith('image/')).slice(0, MAX_PHOTOS);
    setFiles(list.map((f) => ({ file: f, preview: URL.createObjectURL(f) })));
    e.target.value = '';
  }

  async function upload() {
    setErr(null);
    try {
      const u = await ensureUser();
      const ids = [];
      for (let i = 0; i < files.length; i += 1) {
        setBusy(`Uploading ${i + 1} of ${files.length}…`);
        const body = await compressImage(files[i].file, 2000, 0.85); // sharper, so prices stay readable
        const path = `${u.id}/menu/${place.id}/${Date.now()}-${i}.jpg`;
        const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, body, { contentType: 'image/jpeg', cacheControl: '31536000' });
        if (upErr) throw upErr;
        const { data, error } = await supabase.from('menu_photos').insert({ google_place_id: place.id, user_id: u.id, path }).select('id').single();
        if (error) { await supabase.storage.from(BUCKET).remove([path]); throw error; }
        ids.push(data.id);
      }
      setBusy('Reading the prices…');
      await Promise.all(ids.map(readMenu));
      onAdded();
    } catch (e) {
      setErr('Couldn’t upload the photo. Check your connection and try again.');
      setBusy(null);
    }
  }

  return (
    <Sheet title="Add a menu photo" onClose={busy ? () => {} : onClose}>
      <div className="stack-12">
        <p className="small muted">Take a clear, straight photo of each menu page at {place.name}. We read the dishes and prices so everyone can search them. Up to {MAX_PHOTOS} photos.</p>
        <input ref={ref} type="file" accept="image/*" multiple hidden onChange={pick} />
        {files.length > 0 && (
          <div className="menu-photos">
            {files.map((f) => <span key={f.preview} className="menu-thumb"><img src={f.preview} alt="" /></span>)}
          </div>
        )}
        {busy ? <Spinner label={busy} /> : (
          <>
            <button className={`btn ${files.length ? 'btn-quiet' : 'btn-primary'}`} onClick={() => ref.current && ref.current.click()}>
              <Icon name="image" size={18} /> {files.length ? 'Choose different photos' : 'Take or choose photos'}
            </button>
            {files.length > 0 && <button className="btn btn-primary" onClick={upload}>Add {files.length} photo{files.length === 1 ? '' : 's'}</button>}
          </>
        )}
        {err && <Notice tone="warn">{err}</Notice>}
        <p className="tiny muted">Only menus and price lists, please. Photos of people or anything else are removed.</p>
      </div>
    </Sheet>
  );
}

const REASONS = [['not_menu', 'Not a menu'], ['wrong_place', 'Wrong restaurant'], ['outdated', 'Old menu, prices changed'], ['offensive', 'Offensive'], ['other', 'Something else']];

function MenuPhotoSheet({ photo, mine, isAdmin, onClose, onRemoved }) {
  const [mode, setMode] = useState('view');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(null);

  async function remove() {
    setBusy(true);
    await supabase.storage.from(BUCKET).remove([photo.path]).catch(() => {});
    await supabase.from('menu_photos').delete().eq('id', photo.id);
    onRemoved();
  }
  async function report(reason) {
    setBusy(true);
    await ensureUser().catch(() => {});
    const { error } = await supabase.from('menu_reports').insert({ menu_id: photo.id, reason });
    setDone(error && !String(error.message).includes('duplicate') ? 'Couldn’t send that. Try again later.' : 'Thanks — we’ll take a look.');
    setBusy(false);
  }

  return (
    <Sheet title="Menu photo" onClose={onClose} tall>
      <div className="stack-12">
        <a href={mediaUrl(photo.path)} target="_blank" rel="noreferrer" className="menu-full">
          <img src={mediaUrl(photo.path)} alt="Menu" />
        </a>
        <p className="tiny muted">Added {timeAgo(photo.created_at)} · tap the photo to zoom</p>
        {done && <Notice>{done}</Notice>}
        {!done && mode === 'view' && (
          (mine || isAdmin) ? (
            <button className="menu-row" disabled={busy} onClick={remove}><Icon name="trash" size={20} /> {busy ? 'Removing…' : 'Remove this photo'}</button>
          ) : (
            <button className="menu-row" onClick={() => setMode('report')}><Icon name="flag" size={20} /> Report this photo</button>
          )
        )}
        {!done && mode === 'report' && (
          <div className="stack-8">
            <span className="field-label">What’s wrong with it?</span>
            {REASONS.map(([k, label]) => <button key={k} className="menu-row" disabled={busy} onClick={() => report(k)}>{label}</button>)}
          </div>
        )}
      </div>
    </Sheet>
  );
}
