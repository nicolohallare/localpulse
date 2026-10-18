import React, { useState } from 'react';
import { isNativeApp } from './lib';
import { shareUrl } from './game';
import { Icon } from './ui';

// Share a check-in. The link (/c/<id>) shows a card with the score, the take and the photo
// on Facebook, Messenger and Viber, and opens the place in Ube Banana.
export const takeUrl = (visitId) => shareUrl('c', visitId);

function openExternal(url) {
  // In the app, leaving our site opens the Facebook app or the browser.
  if (isNativeApp()) window.location.href = url;
  else window.open(url, '_blank', 'noopener');
}

export function shareToFacebook(visitId) {
  openExternal(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(takeUrl(visitId))}`);
}

export async function shareElsewhere(visitId, placeName) {
  const url = takeUrl(visitId);
  const text = placeName ? `My take on ${placeName} on Ube Banana 🍌` : 'My take on Ube Banana 🍌';
  try {
    const native = window.Capacitor && window.Capacitor.Plugins && window.Capacitor.Plugins.Share;
    if (native && isNativeApp()) { await native.share({ title: 'Ube Banana', text, url, dialogTitle: 'Share your take' }); return 'shared'; }
    if (navigator.share) { await navigator.share({ title: 'Ube Banana', text, url }); return 'shared'; }
    await navigator.clipboard.writeText(url);
    return 'copied';
  } catch (e) {
    try { await navigator.clipboard.writeText(url); return 'copied'; } catch (x) { return 'cancelled'; }
  }
}

export function ShareTake({ visitId, placeName, compact = false }) {
  const [note, setNote] = useState(null);
  if (!visitId) return null;
  async function more() {
    const r = await shareElsewhere(visitId, placeName);
    if (r === 'copied') { setNote('Link copied — paste it anywhere'); setTimeout(() => setNote(null), 2500); }
  }
  return (
    <div className="stack-8">
      {!compact && <p className="strong">Share your take — be the influencer 🍌</p>}
      <div className="share-row">
        <button className="btn share-fb" onClick={() => shareToFacebook(visitId)}>
          <Icon name="facebook" size={18} /> Facebook
        </button>
        <button className="btn btn-quiet share-more" onClick={more}>
          <Icon name="share" size={18} /> More
        </button>
      </div>
      {note && <p className="tiny muted">{note}</p>}
    </div>
  );
}
