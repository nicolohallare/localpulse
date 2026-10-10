import React, { useEffect, useState } from 'react';
import { api, getLocation, distanceM, fmtDistance, CHECKIN_RADIUS_M } from '../lib';
import { Sheet, Spinner, Notice, PlacePhoto } from '../ui';

// "Check in" tab: find places right around you, pick one, then check in from its page.
export default function NearbyCheckIn({ onPick, onClose }) {
  const [state, setState] = useState('locating');
  const [list, setList] = useState([]);
  const [err, setErr] = useState(null);

  async function load() {
    setState('locating');
    setErr(null);
    try {
      const here = await getLocation({ highAccuracy: true, timeout: 12000 });
      setState('loading');
      const places = await api.nearby(here.lat, here.lng, CHECKIN_RADIUS_M + 50);
      setList(places.map((p) => ({ ...p, dist: distanceM(here, p) })).sort((a, b) => a.dist - b.dist));
      setState('ready');
    } catch (e) {
      setErr(e);
      setState('error');
    }
  }

  useEffect(() => { load(); }, []);

  return (
    <Sheet title="Where are you?" onClose={onClose} tall>
      {state === 'locating' && <Spinner label="Finding where you are…" />}
      {state === 'loading' && <Spinner label="Looking for places around you…" />}
      {state === 'error' && (
        <div className="stack-12">
          <Notice tone="warn" title={err.message}>{err.hint || 'Allow location access for Ube Banana in your browser settings, then try again.'}</Notice>
          <button className="btn btn-primary" onClick={load}>Try again</button>
        </div>
      )}
      {state === 'ready' && list.length === 0 && (
        <p className="muted">No restaurants or cafés within {CHECKIN_RADIUS_M} m. Open a place from Discover when you’re there.</p>
      )}
      {state === 'ready' && list.length > 0 && (
        <div className="stack-8">
          <p className="small muted">Places within {CHECKIN_RADIUS_M} m of you</p>
          {list.map((p) => (
            <button key={p.id} className="place-row compact" onClick={() => onPick(p.id)}>
              <PlacePhoto photo={p.photos[0]} width={200} className="place-thumb sm" />
              <span className="place-main">
                <span className="row-title">{p.name}</span>
                <span className="muted small">{[p.type, fmtDistance(p.dist)].filter(Boolean).join(' · ')}</span>
              </span>
            </button>
          ))}
          <p className="attribution">Places from Google Maps</p>
        </div>
      )}
    </Sheet>
  );
}
