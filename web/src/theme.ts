export type Theme = 'system' | 'light' | 'dark';
export type Look = 'classic' | 'soft' | 'cards';
const KEY = 'theme';
const LOOK_KEY = 'look';
// Status-bar colour = each look's page background.
const BAR: Record<Look, { light: string; dark: string }> = {
  classic: { light: '#f4f5f7', dark: '#0f1115' },
  soft: { light: '#fbf7f1', dark: '#1c1714' },
  cards: { light: '#f2f4f3', dark: '#0e1513' },
};

export function getTheme(): Theme {
  try { const t = localStorage.getItem(KEY); if (t === 'light' || t === 'dark') return t; } catch { /* storage blocked */ }
  return 'system';
}

export function setTheme(t: Theme) {
  try { t === 'system' ? localStorage.removeItem(KEY) : localStorage.setItem(KEY, t); } catch { /* storage blocked */ }
  applyTheme();
}

export function getLook(): Look {
  try { const l = localStorage.getItem(LOOK_KEY); if (l === 'classic' || l === 'cards') return l; } catch { /* storage blocked */ }
  return 'soft';
}

export function setLook(l: Look) {
  try { l === 'soft' ? localStorage.removeItem(LOOK_KEY) : localStorage.setItem(LOOK_KEY, l); } catch { /* storage blocked */ }
  applyTheme();
}

// 'system' leaves data-theme off so the prefers-color-scheme rules and the two media-based theme-color metas apply.
export function applyTheme() {
  const t = getTheme(), l = getLook(), root = document.documentElement;
  if (t === 'system') root.removeAttribute('data-theme'); else root.dataset.theme = t;
  if (l === 'classic') root.removeAttribute('data-look'); else root.dataset.look = l;
  document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]').forEach((m, i) => {
    m.content = BAR[l][t === 'system' ? (i ? 'dark' : 'light') : t];
  });
}
