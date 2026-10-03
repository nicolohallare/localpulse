import React, { useCallback, useEffect, useRef, useState } from 'react';
import './styles.css';
import { supabase, getLocation, DEFAULT_LOCATION } from './lib';
import { Icon } from './ui';
import Discover from './screens/Discover';
import Place from './screens/Place';
import Deals from './screens/Deals';
import You from './screens/You';
import Creators from './screens/Creators';
import NearbyCheckIn from './screens/NearbyCheckIn';
import Ranks from './screens/Ranks';

function parseHash() {
  const h = window.location.hash.replace(/^#\/?/, '');
  const [name, id] = h.split('/');
  if (name === 'place' && id) return { name: 'place', id: decodeURIComponent(id) };
  if (name === 'ranks') return { name, id: id === 'creators' ? 'creators' : 'diners' };
  if (['deals', 'creators', 'you', 'checkin'].includes(name)) return { name };
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

  const locate = useCallback(async () => {
    try {
      const here = await getLocation();
      setLoc({ lat: here.lat, lng: here.lng, label: 'Near you', isDefault: false });
      setLocNote(null);
    } catch (e) {
      setLoc(DEFAULT_LOCATION);
      setLocNote(`${e.message} Showing BGC, Taguig — tap the location button to try again.`);
    }
  }, []);

  useEffect(() => { locate(); }, [locate]);

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

  return (
    <div className="app">
      <main className="app-main">
        {(tab === 'discover') && route.name !== 'place' && (
          <Discover loc={loc} locNote={locNote} onRetryLocation={locate} michelin={michelin}
            onOpen={openPlace} onOpenProfile={() => go('/you')} />
        )}
        {tab === 'deals' && <Deals onOpen={openPlace} />}
        {tab === 'you' && <You onOpen={openPlace} onOpenCreators={() => go('/creators')} onOpenRanks={() => go('/ranks')} />}
        {tab === 'creators' && <Creators onBack={back} onOpenRanks={() => go('/ranks/creators')} />}
        {tab === 'ranks' && <Ranks key={route.id} initial={route.id} onBack={back} />}
        {route.name === 'place' && (
          <Place key={route.id} id={route.id} loc={loc} michelin={michelin} onBack={back} onOpenCreators={() => go('/creators')} />
        )}
      </main>

      {route.name === 'checkin' && (
        <NearbyCheckIn onClose={back} onPick={(id) => { window.location.replace(`#/place/${encodeURIComponent(id)}`); }} />
      )}

      {route.name !== 'place' && (
        <nav className="tabbar" aria-label="Main">
          <TabLink icon="compass" label="Discover" active={tab === 'discover'} onClick={() => go('/')} />
          <TabLink icon="tag" label="Deals" active={tab === 'deals'} onClick={() => go('/deals')} />
          <button className="tab tab-center" onClick={() => go('/checkin')}>
            <span className="tab-fab"><Icon name="check" size={24} stroke={2.6} /></span>
            <span>Check in</span>
          </button>
          <TabLink icon="video" label="Creators" active={tab === 'creators'} onClick={() => go('/creators')} />
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
