import { supabase, ensureUser } from './lib';

// Public half of the web-push key pair (safe to ship to browsers).
const VAPID_PUBLIC = 'BKDDG-nBQa2HM7D5hUwIRmx4bAfSwePcuEyMySd4Jc3nlTrLUCD20qI5B1mpUTEsItirkp1toQVaHWjUa9Zjlq4';

function toBytes(b64) {
  const pad = '='.repeat((4 - (b64.length % 4)) % 4);
  const raw = atob((b64 + pad).replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function pushSupported() {
  return 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;
}

// 'unsupported' | 'needs-install' | 'denied' | 'on' | 'off'
export async function pushStatus() {
  if (!pushSupported()) {
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    const standalone = window.matchMedia && window.matchMedia('(display-mode: standalone)').matches;
    return ios && !standalone ? 'needs-install' : 'unsupported';
  }
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.getRegistration();
  const sub = reg && (await reg.pushManager.getSubscription());
  return sub && Notification.permission === 'granted' ? 'on' : 'off';
}

export async function enablePush() {
  if (!pushSupported()) throw new Error('This phone can’t get notifications from LocalPulse yet.');
  const perm = await Notification.requestPermission();
  if (perm !== 'granted') throw new Error('Notifications are blocked. You can allow them in your browser settings.');
  const user = await ensureUser();
  const reg = await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription())
    || (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toBytes(VAPID_PUBLIC) }));
  const j = sub.toJSON();
  await supabase.from('push_subscriptions').delete().eq('endpoint', j.endpoint);
  const { error } = await supabase.from('push_subscriptions').insert({
    endpoint: j.endpoint, user_id: user.id, p256dh: j.keys.p256dh, auth: j.keys.auth,
  });
  if (error && !/duplicate/i.test(error.message)) throw new Error('Could not turn on notifications. Try again.');
  return 'on';
}
