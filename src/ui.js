import React, { useState } from 'react';
import { photoUrl, directionsUrl, wazeUrl } from './lib';

const paths = {
  pin: <><path d="M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21z" /><circle cx="12" cy="9.5" r="2.5" /></>,
  search: <><circle cx="11" cy="11" r="7" /><path d="M20 20l-3.5-3.5" /></>,
  compass: <><circle cx="12" cy="12" r="9" /><path d="M15.5 8.5l-2 5-5 2 2-5z" /></>,
  tag: <><path d="M3 12V4h8l10 10-8 8z" /><circle cx="7.5" cy="7.5" r="1.5" /></>,
  check: <path d="M5 12.5l4.5 4.5L19 7.5" />,
  user: <><circle cx="12" cy="8" r="4" /><path d="M4 21c1.5-4 4.5-6 8-6s6.5 2 8 6" /></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="2" /><path d="M16 10l5-3v10l-5-3z" /></>,
  back: <path d="M15 18l-6-6 6-6" />,
  close: <path d="M6 6l12 12M18 6L6 18" />,
  external: <><path d="M14 4h6v6" /><path d="M20 4l-9 9" /><path d="M19 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h5" /></>,
  shield: <><path d="M12 3l8 3v6c0 5-3.5 8-8 9-4.5-1-8-4-8-9V6z" /><path d="M8.5 12l2.5 2.5 4.5-4.5" /></>,
  clock: <><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></>,
  nav: <path d="M3 11l18-8-8 18-2-8z" />,
  copy: <><rect x="9" y="9" width="11" height="11" rx="2" /><path d="M5 15V5a1 1 0 0 1 1-1h10" /></>,
  plus: <path d="M12 5v14M5 12h14" />,
  image: <><rect x="3" y="4" width="18" height="16" rx="2" /><circle cx="9" cy="10" r="2" /><path d="M21 17l-5-5-9 8" /></>,
  share: <><path d="M12 3v13" /><path d="M7 8l5-5 5 5" /><path d="M5 14v5a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-5" /></>,
  phone: <path d="M5 4h4l2 5-2.5 1.5a11 11 0 0 0 5 5L15 13l5 2v4a2 2 0 0 1-2 2A16 16 0 0 1 3 6a2 2 0 0 1 2-2z" />,
  globe: <><circle cx="12" cy="12" r="9" /><path d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18" /></>,
  bookmark: <path d="M6 4h12v17l-6-4-6 4z" />,
  poll: <><path d="M5 20V10M12 20V4M19 20v-7" /></>,
  feed: <><rect x="4" y="4" width="16" height="7" rx="2" /><rect x="4" y="14" width="16" height="6" rx="2" /></>,
  bell: <><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4z" /><path d="M10 20a2 2 0 0 0 4 0" /></>,
  locate: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /><circle cx="12" cy="12" r="7" /></>,
};

// The Ube Banana mark: a banana sticker. Decorative unless given a title.
export function Banana({ size = 40, className, title }) {
  return (
    <svg width={size} height={size} viewBox="0 0 100 100" className={className} role={title ? 'img' : undefined} aria-hidden={title ? undefined : 'true'}>
      {title && <title>{title}</title>}
      <path d="M17 31 C 19 74, 72 88, 89 27 C 76 55, 37 63, 25 30 Z" fill="var(--banana, #FFD23F)" stroke="var(--ube-ink, #24123D)" strokeWidth="5" strokeLinejoin="round" />
      <path d="M27 44 C 38 62, 64 66, 79 46" fill="none" stroke="var(--banana-deep, #F2B705)" strokeWidth="5" strokeLinecap="round" />
      <path d="M17 31 L 12 20 L 20 17 L 25 30" fill="#6B4A12" stroke="var(--ube-ink, #24123D)" strokeWidth="4" strokeLinejoin="round" />
      <circle cx="89" cy="27" r="4" fill="var(--ube-ink, #24123D)" />
    </svg>
  );
}

export function Icon({ name, size = 22, stroke = 2, style, className }) {
  if (name === 'play') {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={style} className={className} fill="currentColor">
        <path d="M8 5v14l11-7z" />
      </svg>
    );
  }
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden="true" style={style} className={className}
      fill="none" stroke="currentColor" strokeWidth={stroke} strokeLinecap="round" strokeLinejoin="round">
      {paths[name]}
    </svg>
  );
}

// Google place photo, served through our server so the key stays hidden.
export function PlacePhoto({ photo, width = 800, className, alt = '' }) {
  const [failed, setFailed] = useState(false);
  if (!photo || failed) {
    return (
      <div className={`photo-fallback ${className || ''}`}>
        <Icon name="image" size={28} stroke={1.6} />
      </div>
    );
  }
  return <img className={className} src={photoUrl(photo.name, width)} alt={alt} loading="lazy" onError={() => setFailed(true)} />;
}

export function Sheet({ title, onClose, children, tall }) {
  return (
    <div className="sheet-wrap" role="dialog" aria-modal="true" aria-label={title}>
      <button className="sheet-backdrop" aria-label="Close" onClick={onClose} />
      <div className={`sheet ${tall ? 'sheet-tall' : ''}`}>
        <div className="sheet-handle" />
        <div className="sheet-head">
          <h2 className="h3">{title}</h2>
          <button className="icon-btn" aria-label="Close" onClick={onClose}><Icon name="close" size={20} /></button>
        </div>
        <div className="sheet-body">{children}</div>
      </div>
    </div>
  );
}

// "Go there" buttons: Google Maps and Waze, each opening navigation to the place.
export function GoButtons({ place, size = 'md' }) {
  if (!place || !place.id) return null;
  return (
    <div className={`go-row go-${size}`}>
      <a className="go-btn go-gmaps" href={directionsUrl(place)} target="_blank" rel="noreferrer" aria-label={`Directions to ${place.name} in Google Maps`}>
        <Icon name="nav" size={size === 'sm' ? 15 : 18} /> Google Maps
      </a>
      <a className="go-btn go-waze" href={wazeUrl(place)} target="_blank" rel="noreferrer" aria-label={`Drive to ${place.name} with Waze`}>
        <Icon name="nav" size={size === 'sm' ? 15 : 18} /> Waze
      </a>
    </div>
  );
}

export function Spinner({ label }) {
  return (
    <div className="spinner-row" role="status">
      <span className="spinner" />
      {label && <span>{label}</span>}
    </div>
  );
}

export function Notice({ title, children, tone = 'info', action }) {
  return (
    <div className={`notice notice-${tone}`}>
      {title && <strong>{title}</strong>}
      {children && <div>{children}</div>}
      {action}
    </div>
  );
}

export function Empty({ icon = 'compass', title, children, action }) {
  return (
    <div className="empty">
      <span className="empty-icon"><Icon name={icon} size={28} /></span>
      <h3 className="h3">{title}</h3>
      {children && <p className="muted">{children}</p>}
      {action}
    </div>
  );
}

export function ScoreBadge({ score, size = 'sm' }) {
  if (score == null) return null;
  return <span className={`score-badge score-${size}`}>{Number(score).toFixed(1)}</span>;
}
