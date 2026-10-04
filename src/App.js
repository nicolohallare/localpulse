import React, { useCallback, useEffect, useRef, useState } from 'react';
import './styles.css';
import { api, supabase, getLocation, DEFAULT_LOCATION, findVideoUrl } from './lib';
import { Sheet, Spinner } from './ui';

import { Icon } from './ui';
import Discover from './screens/Discover';
import Place from './screens/Place';
import Deals from './screens/Deals';
import You from './screens/You';
import Creators from './screens/Creators';
import NearbyCheckIn from './screens/NearbyCheckIn';
import Ranks from './screens/Ranks';
import ShareVideo from './screens/ShareVideo';
import Feed from './screens/Feed';
import Profile from './screens/Profile';
import Admin from './screens/Admin';
import { PollNew, PollView } from './screens/Poll';
import { MyLists, ListView } from './screens/Lists';

// Shared from another app (TikTok → Share → LocalPulse): /?url=…&text=…
(function takeShare() {
  const q = new URLSearchParams(window.location.search);
  if (!q.has('url') && !q.has('text') && !q.has('title')) return;
  const link = findVideoUrl([q.get('url'), q.get('text'), q.get('title')].filter(Boolean).join(' '));
  window.history.replaceState(null, '', `/#/add${link ? `?u=${encodeURIComponent(link)}` : ''}`);
}());

function parseHash() {
  const raw = window.location.hash.replace(/^#\/?/, '');
  const [h, query] = raw.split('?');
  const [name, id] = h.split('/');
  const params = new URLSearchParams(query || '');
  if (name === 'add') return { name: 'add', url: params.get('u') || '' };
  if (name === 'poll' && id === 'new') return { name: 'pollnew', with: params.get('with') || '' };
  if (name === 'poll' && id) return { name: 'poll', id, fresh: params.get('new') === '1' };
  if (name === 'list' && id) return { name: 'list', id };
  if (name === 'u' && id) return { name: 'user', id };
  if (name === 'place' && id) return { name: 'place', id: decodeURIComponent(id) };
  if (name === 'ranks') return { name, id: ['creators', 'influencers'].includes(id) ? id : 'diners' };
  if (['deals', 'creators', 'you', 'checkin', 'feed', 'lists', 'admin'].includes(name)) return { name };
  return { name: 'discover' };
}

export default function App() {
  const [route, setRoute] = useState(parseHash);
  const [loc, setLoc] = useState({ ...DEFAULT_LOCATION, label: 'Finding you…' });
  const [locNote, setLocNote] = useState(null);
  const [michelin, setMichelin] = useState([]);
  const lastTab = useRef('discover');
  const navigatedInApp = useRef(false);

  useEffect(() => {
    const onHash = () => setRoute(parseHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    if (route.name !== 'place' && route.name !== 'checkin') lastTab.current = route.name;
    window.scrollTo(0, 0);
  }, [route]);

  const [picking, setPicking] = useState(false);

  // Use the phone's location. If it's blocked, use the area the person picked before,
  // or ask them where they are (instead of silently assuming one city).
  const locate = useCallback(async () => {
    try {
      const here = await getLocation();
      setLoc({ lat: here.lat, lng: here.lng, label: 'Near you', isDefault: false });
      setLocNote(null);
    } catch (e) {
      let saved = null;
      try { saved = JSON.parse(localStorage.getItem('lp-area') || 'null'); } catch (x) { saved = null; }
      if (saved && saved.lat != null) {
        setLoc({ ...saved, isDefault: false, manual: true });
        setLocNote(null);
      } else {
        setLoc({ ...DEFAULT_LOCATION, label: 'Set your area' });
        setLocNote(`${e.message} Tap “Set your area” to see places near you.`);
        setPicking(true);
      }
    }
  }, []);

  const pickArea = useCallback((p) => {
    const area = { lat: p.lat, lng: p.lng, label: p.name };
    try { localStorage.setItem('lp-area', JSON.stringify(area)); } catch (x) { /* private mode */ }
    setLoc({ ...area, isDefault: false, manual: true });
    setLocNote(null);
    setPicking(false);
  }, []);

  useEffect(() => { locate(); }, [locate]);

  // Back from the admin sign-in email: /?admin=1#access_token=… → wait for the session, then open admin.
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('admin') !== '1') return;
    supabase.auth.getSession().then(() => {
      window.history.replaceState(null, '', '/#/admin');
      setRoute(parseHash());
    });
  }, []);

  useEffect(() => {
    supabase.from('michelin_listings').select('*').order('distinction').then(({ data }) => setMichelin(data || []));
  }, []);

  const go = useCallback((path) => {
    navigatedInApp.current = true;
    window.location.hash = path;
  }, []);
  const openPlace = useCallback((id) => go(`/place/${encodeURIComponent(id)}`), [go]);
  const back = useCallback(() => {
    if (navigatedInApp.current && window.history.length > 1) window.history.back();
    else go(lastTab.current === 'discover' ? '/' : `/${lastTab.current}`);
  }, [go]);

  const tab = route.name === 'checkin' ? lastTab.current : route.name;
  const openUser = (uid) => go(`/u/${uid}`);
  const openList = (lid) => go(`/list/${lid}`);
  const TABS = ['discover', 'feed', 'deals', 'you'];
  const showTabs = TABS.includes(tab) || tab === 'creators' || tab === 'ranks';

  return (
    <div className="app">
      <main className="app-main">
        {(tab === 'discover') && route.name !== 'place' && (
          <Discover loc={loc} locNote={locNote} onRetryLocation={() => setPicking(true)} michelin={michelin}
            onOpen={openPlace} onOpenProfile={() => go('/you')} onAddVideo={() => go('/add')} />
        )}
        {tab === 'deals' && <Deals onOpen={openPlace} />}
        {tab === 'you' && <You onOpen={openPlace} onOpenCreators={() => go('/creators')} onOpenRanks={() => go('/ranks')}
          onOpenUser={openUser} onOpenLists={() => go('/lists')} onOpenAdmin={() => go('/admin')} />}
        {tab === 'feed' && <Feed onOpenPlace={openPlace} onOpenUser={openUser} onOpenCreators={() => go('/creators')} onOpenRanks={() => go('/ranks/influencers')} />}
        {tab === 'user' && <Profile key={route.id} id={route.id} onBack={back} onOpenPlace={openPlace} onOpenUser={openUser} onOpenList={openList} />}
        {tab === 'pollnew' && <PollNew key={route.with} loc={loc} withPlace={route.with} onBack={back} onCreated={(pid) => window.location.replace(`#/poll/${pid}?new=1`)} />}
        {tab === 'poll' && <PollView key={route.id} id={route.id} fresh={route.fresh} onBack={back} onOpenPlace={openPlace} />}
        {tab === 'lists' && <MyLists onBack={back} onOpenList={openList} />}
        {tab === 'list' && <ListView key={route.id} id={route.id} loc={loc} onBack={back} onOpenPlace={openPlace} onOpenUser={openUser} />}
        {tab === 'admin' && <Admin loc={loc} onBack={back} onOpenPlace={openPlace} />}
        {tab === 'creators' && <Creators onBack={back} onOpenRanks={() => go('/ranks/creators')} onAddVideo={() => go('/add')} />}
        {tab === 'ranks' && <Ranks key={route.id} initial={route.id} onBack={back} onOpenUser={openUser} />}
        {tab === 'add' && <ShareVideo key={route.url} initialUrl={route.url} loc={loc} onBack={back} onOpen={openPlace} />}
        {route.name === 'place' && (
          <Place key={route.id} id={route.id} loc={loc} michelin={michelin} onBack={back} onOpenCreators={() => go('/creators')}
            onOpenUser={openUser} onNewPoll={(pid) => go(`/poll/new?with=${encodeURIComponent(pid)}`)} />
        )}
      </main>

      {picking && <AreaPicker onPick={pickArea} onUseGps={() => { setPicking(false); locate(); }} onClose={() => setPicking(false)} />}

      {route.name === 'checkin' && (
        <NearbyCheckIn onClose={back} onPick={(id) => { window.location.replace(`#/place/${encodeURIComponent(id)}`); }} />
      )}

      {route.name !== 'place' && showTabs && (
        <nav className="tabbar" aria-label="Main">
          <TabLink icon="compass" label="Discover" active={tab === 'discover'} onClick={() => go('/')} />
          <TabLink icon="feed" label="Feed" active={tab === 'feed'} onClick={() => go('/feed')} />
          <button className="tab tab-center" onClick={() => go('/checkin')}>
            <span className="tab-fab"><Icon name="check" size={24} stroke={2.6} /></span>
            <span>Check in</span>
          </button>
          <TabLink icon="tag" label="Deals" active={tab === 'deals'} onClick={() => go('/deals')} />
          <TabLink icon="user" label="You" active={tab === 'you'} onClick={() => go('/you')} />
        </nav>
      )}
    </div>
  );
}

function TabLink({ icon, label, active, onClick }) {
  return (
    <button className={`tab ${active ? 'tab-on' : ''}`} aria-current={active ? 'page' : undefined} onClick={onClick}>
      <Icon name={icon} size={23} />
      <span>{label}</span>
    </button>
  );
}

function AreaPicker({ onPick, onUseGps, onClose }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState(null);
  const [busy, setBusy] = useState(false);
  async function search(e) {
    e.preventDefault();
    if (!q.trim()) return;
    setBusy(true);
    const r = await api.search(`${q.trim()} Philippines`).catch(() => []);
    setResults(r);
    setBusy(false);
  }
  return (
    <Sheet title="Where are you?" onClose={onClose}>
      <div className="stack-12">
        <button className="btn btn-primary" onClick={onUseGps}>Use my current location</button>
        <p className="small muted center">or type your city, town or area</p>
        <form className="dish-add" onSubmit={search}>
          <label className="sr-only" htmlFor="area-q">City or area</label>
          <input id="area-q" placeholder="e.g. Antipolo, Cebu City, Kapitolyo" value={q} onChange={(e) => setQ(e.target.value)} autoFocus />
          <button className="soft-btn" disabled={!q.trim() || busy}>Search</button>
        </form>
        {busy && <Spinner />}
        {results && results.length === 0 && <p className="small muted">No matches. Try a bigger area, like the city name.</p>}
        {(results || []).slice(0, 6).map((p) => (
          <button key={p.id} className="pick-row" onClick={() => onPick({ ...p, name: q.trim().replace(/^./, (c) => c.toUpperCase()) })}>
            <span className="grow"><span className="row-title-sm block">{p.name}</span>{p.address && <span className="tiny muted">{p.address}</span>}</span>
          </button>
        ))}
      </div>
    </Sheet>
  );
}
