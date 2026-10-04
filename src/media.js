import React, { useRef, useState } from 'react';
import { supabase, ensureUser, SUPABASE_URL } from './lib';
import { Icon, Sheet } from './ui';

const BUCKET = 'take-media';
export const MAX_ITEMS = 5;
const MAX_VIDEO_MB = 50;
const MAX_VIDEO_SEC = 90;

export const mediaUrl = (path) => `${SUPABASE_URL}/storage/v1/object/public/${BUCKET}/${path}`;

// Shrink photos on the phone before upload (max 1600px, JPEG) so they load fast and save data.
function compressImage(file, maxSide = 1600, quality = 0.82) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const scale = Math.min(1, maxSide / Math.max(img.width, img.height));
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width * scale);
      canvas.height = Math.round(img.height * scale);
      canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height);
      canvas.toBlob((b) => { URL.revokeObjectURL(url); b ? resolve(b) : reject(new Error('Could not read photo')); }, 'image/jpeg', quality);
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read photo')); };
    img.src = url;
  });
}

function videoDuration(file) {
  return new Promise((resolve) => {
    const v = document.createElement('video');
    v.preload = 'metadata';
    v.onloadedmetadata = () => { URL.revokeObjectURL(v.src); resolve(v.duration || 0); };
    v.onerror = () => resolve(0);
    v.src = URL.createObjectURL(file);
  });
}

// Validate picked files. Returns { items, error }.
export async function prepareFiles(fileList, existing = 0) {
  const items = [];
  let error = null;
  for (const f of Array.from(fileList || [])) {
    if (existing + items.length >= MAX_ITEMS) { error = `Up to ${MAX_ITEMS} photos or videos per take.`; break; }
    if (f.type.startsWith('image/')) {
      items.push({ kind: 'photo', file: f, preview: URL.createObjectURL(f) });
    } else if (f.type.startsWith('video/')) {
      if (items.some((x) => x.kind === 'video')) { error = 'One video per take.'; continue; }
      if (f.size > MAX_VIDEO_MB * 1024 * 1024) { error = `Videos must be under ${MAX_VIDEO_MB} MB.`; continue; }
      const sec = await videoDuration(f);
      if (sec > MAX_VIDEO_SEC + 1) { error = `Keep videos under ${MAX_VIDEO_SEC} seconds.`; continue; }
      items.push({ kind: 'video', file: f, preview: URL.createObjectURL(f) });
    }
  }
  return { items, error };
}

// Upload prepared items and attach them to a visit. Returns how many succeeded.
export async function uploadMedia(visitId, items, onProgress) {
  const u = await ensureUser();
  let ok = 0;
  for (let i = 0; i < items.length; i += 1) {
    const it = items[i];
    try {
      const body = it.kind === 'photo' ? await compressImage(it.file) : it.file;
      const ext = it.kind === 'photo' ? 'jpg' : ((it.file.type.split('/')[1] || 'mp4').replace('quicktime', 'mov'));
      const path = `${u.id}/${visitId}/${Date.now()}-${i}.${ext}`;
      const { error: upErr } = await supabase.storage.from(BUCKET).upload(path, body, {
        contentType: it.kind === 'photo' ? 'image/jpeg' : it.file.type, upsert: false, cacheControl: '31536000',
      });
      if (upErr) throw upErr;
      const { error: dbErr } = await supabase.from('visit_media').insert({ visit_id: visitId, user_id: u.id, path, kind: it.kind });
      if (dbErr) { await supabase.storage.from(BUCKET).remove([path]); throw dbErr; }
      ok += 1;
    } catch (e) { /* keep going with the rest */ }
    if (onProgress) onProgress(i + 1, items.length);
  }
  return ok;
}

// Media for a set of visits: { [visitId]: [{id, path, kind}] }
export async function loadMedia(visitIds) {
  const ids = [...new Set(visitIds || [])].filter(Boolean);
  if (!ids.length) return {};
  const { data } = await supabase.from('visit_media').select('id,visit_id,path,kind,created_at').in('visit_id', ids).order('created_at');
  const by = {};
  (data || []).forEach((m) => { (by[m.visit_id] = by[m.visit_id] || []).push(m); });
  return by;
}

export async function deleteMedia(m) {
  await supabase.storage.from(BUCKET).remove([m.path]);
  await supabase.from('visit_media').delete().eq('id', m.id);
}

// ── UI ──────────────────────────────────────────────────────────────────────
export function MediaPicker({ items, setItems, existing = 0 }) {
  const photoRef = useRef(null);
  const videoRef = useRef(null);
  const [err, setErr] = useState(null);
  const left = MAX_ITEMS - existing - items.length;

  async function add(e) {
    const { items: next, error } = await prepareFiles(e.target.files, existing + items.length);
    setErr(error);
    if (next.length) setItems([...items, ...next.filter((n) => !(n.kind === 'video' && items.some((x) => x.kind === 'video')))]);
    e.target.value = '';
  }

  return (
    <div className="stack-8">
      <span className="field-label">Photos &amp; video (optional, +5 pts)</span>
      {items.length > 0 && (
        <div className="media-picked">
          {items.map((it, i) => (
            <div key={it.preview} className="media-thumb">
              {it.kind === 'photo' ? <img src={it.preview} alt="" /> : <video src={it.preview} muted playsInline preload="metadata" />}
              {it.kind === 'video' && <span className="media-badge"><Icon name="play" size={12} /></span>}
              <button type="button" className="media-remove" aria-label="Remove" onClick={() => setItems(items.filter((_, j) => j !== i))}><Icon name="close" size={14} stroke={2.6} /></button>
            </div>
          ))}
        </div>
      )}
      {left > 0 && (
        <div className="row-6">
          <button type="button" className="soft-btn grow" onClick={() => photoRef.current.click()}><Icon name="image" size={18} /> Add photos</button>
          {!items.some((x) => x.kind === 'video') && (
            <button type="button" className="soft-btn grow" onClick={() => videoRef.current.click()}><Icon name="video" size={18} /> Add a video</button>
          )}
        </div>
      )}
      <input ref={photoRef} type="file" accept="image/*" multiple hidden onChange={add} />
      <input ref={videoRef} type="file" accept="video/*" hidden onChange={add} />
      {err && <span className="tiny muted">{err}</span>}
    </div>
  );
}

export function MediaStrip({ media }) {
  const [open, setOpen] = useState(null);
  if (!media || !media.length) return null;
  return (
    <>
      <div className={`media-strip media-n${Math.min(media.length, 3)}`}>
        {media.slice(0, 5).map((m, i) => (
          <button key={m.id} className="media-cell" onClick={() => setOpen(i)} aria-label={m.kind === 'video' ? 'Play video' : 'View photo'}>
            {m.kind === 'photo'
              ? <img src={mediaUrl(m.path)} alt="" loading="lazy" />
              : <video src={`${mediaUrl(m.path)}#t=0.1`} muted playsInline preload="metadata" />}
            {m.kind === 'video' && <span className="play play-sm"><Icon name="play" size={16} /></span>}
          </button>
        ))}
      </div>
      {open != null && (
        <Sheet title={media[open].kind === 'video' ? 'Video' : `Photo ${open + 1} of ${media.length}`} onClose={() => setOpen(null)} tall>
          <div className="lightbox">
            {media[open].kind === 'photo'
              ? <img src={mediaUrl(media[open].path)} alt="" />
              : <video src={mediaUrl(media[open].path)} controls autoPlay playsInline />}
          </div>
          {media.length > 1 && (
            <div className="row-between">
              <button className="soft-btn" disabled={open === 0} onClick={() => setOpen(open - 1)}>‹ Prev</button>
              <button className="soft-btn" disabled={open === media.length - 1} onClick={() => setOpen(open + 1)}>Next ›</button>
            </div>
          )}
        </Sheet>
      )}
    </>
  );
}

// Add photos/video to a check-in you already made.
export function AddMediaSheet({ visitId, existing = 0, onClose, onDone }) {
  const [items, setItems] = useState([]);
  const [state, setState] = useState('idle');
  const [progress, setProgress] = useState(null);

  async function upload() {
    setState('uploading');
    const ok = await uploadMedia(visitId, items, (a, b) => setProgress(`${a} of ${b}`));
    setState(ok === items.length ? 'done' : 'partial');
    if (ok) onDone && onDone();
  }

  return (
    <Sheet title="Add photos or video" onClose={onClose}>
      {state === 'done' ? (
        <div className="stack-12 center">
          <span className="done-icon"><Icon name="check" size={32} stroke={2.4} /></span>
          <p className="strong">Added to your take</p>
          <button className="btn btn-primary" onClick={onClose}>Done</button>
        </div>
      ) : (
        <div className="stack-12">
          <MediaPicker items={items} setItems={setItems} existing={existing} />
          {state === 'partial' && <p className="small muted">Some files couldn’t upload. Check your connection and try again.</p>}
          <button className="btn btn-primary" disabled={!items.length || state === 'uploading'} onClick={upload}>
            {state === 'uploading' ? `Uploading ${progress || ''}…` : `Upload ${items.length || ''}`}
          </button>
        </div>
      )}
    </Sheet>
  );
}
