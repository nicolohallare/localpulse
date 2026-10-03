import React, { useEffect, useRef, useState } from 'react';
import { api } from './lib';

let loader = null;
function loadMaps() {
  if (window.google && window.google.maps) return Promise.resolve(window.google.maps);
  if (loader) return loader;
  loader = api.config().then(({ mapsKey }) => {
    if (!mapsKey) throw new Error('no-key');
    return new Promise((resolve, reject) => {
      window.__lpMapsReady = () => resolve(window.google.maps);
      const s = document.createElement('script');
      s.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(mapsKey)}&v=weekly&callback=__lpMapsReady`;
      s.async = true;
      s.onerror = () => reject(new Error('load-failed'));
      document.head.appendChild(s);
    });
  });
  loader.catch(() => { loader = null; });
  return loader;
}

const MAP_STYLE = [
  { featureType: 'poi', elementType: 'labels', stylers: [{ visibility: 'off' }] },
  { featureType: 'transit', stylers: [{ visibility: 'off' }] },
  { featureType: 'water', stylers: [{ color: '#d9e4f2' }] },
  { featureType: 'landscape', stylers: [{ color: '#f1eee9' }] },
  { featureType: 'road', elementType: 'geometry', stylers: [{ color: '#ffffff' }] },
];

// Google map with one pin per place. Places data is only ever shown on a Google map.
export default function MapView({ center, places, stats, onPick, activeId }) {
  const el = useRef(null);
  const map = useRef(null);
  const markers = useRef([]);
  const [state, setState] = useState('loading');

  useEffect(() => {
    let cancelled = false;
    loadMaps()
      .then((maps) => {
        if (cancelled || !el.current) return;
        map.current = new maps.Map(el.current, {
          center: { lat: center.lat, lng: center.lng },
          zoom: 15,
          disableDefaultUI: true,
          zoomControl: true,
          gestureHandling: 'greedy',
          clickableIcons: false,
          styles: MAP_STYLE,
        });
        setState('ready');
      })
      .catch(() => !cancelled && setState('unavailable'));
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (state !== 'ready' || !map.current) return;
    map.current.panTo({ lat: center.lat, lng: center.lng });
  }, [center.lat, center.lng, state]);

  useEffect(() => {
    const maps = window.google && window.google.maps;
    if (state !== 'ready' || !maps) return;
    markers.current.forEach((m) => m.setMap(null));
    markers.current = [];

    const me = new maps.Marker({
      map: map.current,
      position: { lat: center.lat, lng: center.lng },
      icon: { path: maps.SymbolPath.CIRCLE, scale: 7, fillColor: '#2F6FEB', fillOpacity: 1, strokeColor: '#fff', strokeWeight: 3 },
      zIndex: 1,
      title: 'You',
    });
    markers.current.push(me);

    places.forEach((p) => {
      if (p.lat == null) return;
      const s = stats[p.id];
      const active = p.id === activeId;
      const m = new maps.Marker({
        map: map.current,
        position: { lat: p.lat, lng: p.lng },
        title: p.name,
        zIndex: active ? 100 : 10,
        label: s ? { text: Number(s.avg_score).toFixed(1), color: '#FFFFFF', fontSize: '11px', fontWeight: '700' } : undefined,
        icon: {
          path: maps.SymbolPath.CIRCLE,
          scale: s ? 14 : 8,
          fillColor: active ? '#17131F' : (s ? '#5B2A86' : '#C9733A'),
          fillOpacity: 1,
          strokeColor: '#FFFFFF',
          strokeWeight: 2.5,
        },
      });
      m.addListener('click', () => onPick(p));
      markers.current.push(m);
    });
  }, [places, stats, state, activeId, center.lat, center.lng, onPick]);

  if (state === 'unavailable') return null;
  return (
    <div className="map-shell">
      <div ref={el} className="map" aria-label="Map of nearby places" />
      {state === 'loading' && <div className="map-loading">Loading map…</div>}
    </div>
  );
}
