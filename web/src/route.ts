import { useEffect, useState } from 'react';

export function useRoute() {
  const [hash, setHash] = useState(location.hash);
  useEffect(() => {
    const onChange = () => setHash(location.hash);
    addEventListener('hashchange', onChange);
    return () => removeEventListener('hashchange', onChange);
  }, []);
  const [path, query = ''] = hash.replace(/^#/, '').split('?');
  return { path: path || '/cards', params: new URLSearchParams(query) };
}

export const go = (to: string) => { location.hash = to; };

// Overlays (scanner, till mode) are `?flag=1` on the current hash, so the phone's Back button closes them.
export const openOverlay = (flag: string) => {
  const h = location.hash.slice(1) || '/cards';
  if (new URLSearchParams(h.split('?')[1] ?? '').get(flag) === '1') return;
  go(`${h}${h.includes('?') ? '&' : '?'}${flag}=1`);
};
let closing = false; // history.back() is async; a second call before it lands would leave the screen
export const closeOverlay = () => {
  if (closing) return;
  closing = true;
  addEventListener('popstate', () => { closing = false; }, { once: true });
  history.back();
};
