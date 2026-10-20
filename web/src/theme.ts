export type Theme = 'system' | 'light' | 'dark';
const KEY = 'theme';
const BAR = { light: '#f4f5f7', dark: '#0f1115' };

export function getTheme(): Theme {
  try { const t = localStorage.getItem(KEY); if (t === 'light' || t === 'dark') return t; } catch { /* storage blocked */ }
  return 'system';
}

export function setTheme(t: Theme) {
  try { t === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, t); } catch { /* storage blocked */ }
  applyTheme();
}

// 'system' leaves data-theme off so the prefers-color-scheme rules and the two media-based theme-color metas apply.
export function applyTheme() {
  const t = getTheme(), root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = t;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m, i) => {
    m.content = t === 'system' ? BAR[i ? 'dark' : 'light'] : BAR[t];
  });
}
