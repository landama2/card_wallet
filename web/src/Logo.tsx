import { useState } from 'react';
import { initialOf, logoUrl, storeHue } from './logic';

// Store icon from the domain, or the store's initial when there is no domain / the icon fails to load.
// `mark`: the translucent square used on store-coloured tiles and the detail header.
export default function Logo({ name, domain, size = 44, mark = false }: { name: string; domain: string | null; size?: number; mark?: boolean }) {
  const [failed, setFailed] = useState<string | null>(null);
  const icon = domain && failed !== domain
    ? <img src={logoUrl(domain)} alt="" onError={() => setFailed(domain)} />
    : null;
  if (mark) return <span className="mark" aria-hidden>{icon ?? initialOf(name)}</span>;
  const style = { width: size, height: size, fontSize: size * 0.42 };
  if (icon) return <img className="logo" style={style} src={logoUrl(domain!)} alt="" onError={() => setFailed(domain)} />;
  return <span className="logo" style={{ ...style, background: tileColor(name) }} aria-hidden>{initialOf(name)}</span>;
}

// Dark enough for white text (≥ 4.5:1) at every hue.
export const tileColor = (name: string) => `hsl(${storeHue(name)} 45% 30%)`;
