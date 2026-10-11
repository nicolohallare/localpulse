import React, { useEffect, useState } from 'react';
import { supabase, currentUser, ensureUser } from './lib';
import { Icon, Sheet, Notice } from './ui';

export const REPORT_REASONS = [
  ['fake', 'Fake or not a real visit'],
  ['spam', 'Spam or advertising'],
  ['offensive', 'Offensive or hateful'],
  ['harassment', 'Bullying or harassment'],
  ['privacy', 'Shows someone’s private info or face without consent'],
  ['other', 'Something else'],
];

let meCache;
function useMe() {
  const [me, setMe] = useState(meCache || null);
  useEffect(() => { if (!meCache) currentUser().then((u) => { meCache = u; setMe(u); }); }, []);
  return me;
}

export async function blockUser(userId) {
  await ensureUser();
  const { error } = await supabase.from('blocks').insert({ blocked: userId });
  if (error && error.code !== '23505') throw error;
}

export async function unblockUser(userId) {
  const u = await currentUser();
  const { error } = await supabase.from('blocks').delete().eq('blocker', u.id).eq('blocked', userId);
  if (error) throw error;
}

async function report({ visitId, userId, reason, note }) {
  await ensureUser();
  const { error } = await supabase.from('reports').insert({
    visit_id: visitId || null, target_user: visitId ? null : userId, reason, note: note ? note.slice(0, 300) : null,
  });
  if (error && error.code !== '23505') throw error; // already reported = fine
}

// "⋯" on a take: report it, or block the person who posted it. Hidden on your own takes.
export function TakeMenu({ take, name, onHidden }) {
  const me = useMe();
  const [open, setOpen] = useState(false);
  if (!take || (me && take.user_id === me.id)) return null;
  return (
    <>
      <button className="icon-btn take-more" aria-label="More options for this take" onClick={() => setOpen(true)}>
        <Icon name="more" size={20} />
      </button>
      {open && <SafetySheet visitId={take.id} userId={take.user_id} name={name || take.display_name || 'this person'}
        onClose={() => setOpen(false)} onDone={(what) => { setOpen(false); if (onHidden) onHidden(what); }} />}
    </>
  );
}

// Report or block, as one sheet. Without a visitId it reports the person instead of a take.
export function SafetySheet({ visitId, userId, name, onClose, onDone }) {
  const [step, setStep] = useState('menu');
  const [reason, setReason] = useState(null);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);

  async function sendReport() {
    setBusy(true); setErr(null);
    try { await report({ visitId, userId, reason, note }); setStep('reported'); } catch (e) { setErr('Couldn’t send the report. Check your connection and try again.'); }
    setBusy(false);
  }
  async function doBlock() {
    setBusy(true); setErr(null);
    try { await blockUser(userId); onDone('blocked'); } catch (e) { setErr('Couldn’t block right now. Try again.'); setBusy(false); }
  }

  return (
    <Sheet title={step === 'report' ? (visitId ? 'Report this take' : `Report ${name}`) : step === 'block' ? `Block ${name}?` : step === 'reported' ? 'Thanks for reporting' : 'Options'} onClose={onClose}>
      {step === 'menu' && (
        <div className="stack-8">
          <button className="menu-row" onClick={() => setStep('report')}><Icon name="flag" size={20} /> {visitId ? 'Report this take' : `Report ${name}`}</button>
          <button className="menu-row menu-danger" onClick={() => setStep('block')}><Icon name="block" size={20} /> Block {name}</button>
        </div>
      )}
      {step === 'report' && (
        <div className="stack-8" role="radiogroup" aria-label="Reason">
          {REPORT_REASONS.map(([k, label]) => (
            <button key={k} className={`menu-row ${reason === k ? 'menu-on' : ''}`} role="radio" aria-checked={reason === k} onClick={() => setReason(k)}>{label}</button>
          ))}
          <label className="field">Anything to add? (optional)
            <textarea rows={2} maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} />
          </label>
          <button className="btn btn-primary" disabled={!reason || busy} onClick={sendReport}>{busy ? 'Sending…' : 'Send report'}</button>
        </div>
      )}
      {step === 'reported' && (
        <div className="stack-12">
          <p>We’ll review it. Takes reported by several people are hidden right away while we check.</p>
          <button className="btn btn-quiet" onClick={() => setStep('block')}>Also block {name}</button>
          <button className="btn btn-primary" onClick={() => onDone('reported')}>Done</button>
        </div>
      )}
      {step === 'block' && (
        <div className="stack-12">
          <p>You won’t see {name}’s takes, photos or videos anywhere in Ube Banana. They won’t be told. You can unblock them anytime from the You tab.</p>
          <button className="btn btn-primary" disabled={busy} onClick={doBlock}>{busy ? 'Blocking…' : `Block ${name}`}</button>
          <button className="btn btn-quiet" onClick={onClose}>Cancel</button>
        </div>
      )}
      {err && <Notice tone="warn">{err}</Notice>}
    </Sheet>
  );
}

// You tab: people you've blocked, with unblock.
export function BlockedList() {
  const [rows, setRows] = useState(null);
  async function load() {
    const u = await currentUser();
    if (!u) { setRows([]); return; }
    const { data } = await supabase.from('blocks').select('blocked').eq('blocker', u.id);
    const ids = (data || []).map((b) => b.blocked);
    const { data: profs } = ids.length ? await supabase.from('profiles').select('id,display_name').in('id', ids) : { data: [] };
    const names = Object.fromEntries((profs || []).map((p) => [p.id, p.display_name]));
    setRows(ids.map((id) => ({ id, name: names[id] || 'Ube Banana user' })));
  }
  useEffect(() => { load(); }, []);
  if (!rows || rows.length === 0) return <p className="small muted">You haven’t blocked anyone.</p>;
  return (
    <div className="stack-8">
      {rows.map((r) => (
        <div key={r.id} className="row-between">
          <span className="strong small">{r.name}</span>
          <button className="soft-btn" onClick={async () => { await unblockUser(r.id); load(); }}>Unblock</button>
        </div>
      ))}
    </div>
  );
}

// You tab: permanently delete the account and everything posted with it.
export function DeleteAccount() {
  const [step, setStep] = useState('idle');
  const [typed, setTyped] = useState('');
  const [err, setErr] = useState(null);

  async function run() {
    setStep('deleting'); setErr(null);
    try {
      const u = await currentUser();
      if (!u) throw new Error('Not signed in');
      // Remove uploaded photos and videos first (stored files aren't removed by the database).
      const { data: media } = await supabase.from('visit_media').select('path').eq('user_id', u.id);
      const paths = (media || []).map((m) => m.path).filter(Boolean);
      for (let i = 0; i < paths.length; i += 100) await supabase.storage.from('take-media').remove(paths.slice(i, i + 100));
      const { error } = await supabase.rpc('delete_my_account');
      if (error) throw error;
      await supabase.auth.signOut().catch(() => {});
      try { localStorage.clear(); } catch (x) { /* ignore */ }
      setStep('done');
      setTimeout(() => window.location.replace('/'), 1800);
    } catch (e) {
      setErr('Couldn’t delete your account. Check your connection and try again.');
      setStep('confirm');
    }
  }

  if (step === 'done') return <Notice tone="info">Your account and everything you posted have been deleted.</Notice>;
  if (step === 'idle') return <button className="link-btn left danger-ink" onClick={() => setStep('confirm')}>Delete my account</button>;
  return (
    <div className="card stack-12">
      <p className="strong">Delete your account?</p>
      <p className="small">This permanently removes your check-ins, takes, photos, videos, points, badges, lists, polls and follows. It can’t be undone.</p>
      <label className="field">Type DELETE to confirm
        <input value={typed} autoCapitalize="characters" onChange={(e) => setTyped(e.target.value)} />
      </label>
      <button className="btn btn-danger" disabled={typed.trim().toUpperCase() !== 'DELETE' || step === 'deleting'} onClick={run}>
        {step === 'deleting' ? 'Deleting…' : 'Delete everything'}
      </button>
      <button className="btn btn-quiet" onClick={() => { setStep('idle'); setTyped(''); }}>Keep my account</button>
      {err && <Notice tone="warn">{err}</Notice>}
    </div>
  );
}
