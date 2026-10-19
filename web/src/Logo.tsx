import { useState } from 'react';
import { initialOf, logoUrl } from './logic';

// Store icon from the domain, or a coloured initial when there is no domain / the icon fails to load.
export default function Logo({ name, domain, size = 40 }: { name: string; domain: string | null; size?: number }) {
  const [failed, setFailed] = useState<string | null>(null);
  const style = { width: size, height: size, fontSize: size * 0.5 };
  if (domain && failed !== domain) {
    return <img className="logo" style={style} src={logoUrl(domain)} alt="" onError={() => setFailed(domain)} />;
  }
  const hue = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) % 360, 7);
  return <span className="logo" style={{ ...style, background: `hsl(${hue} 55% 45%)` }} aria-hidden>{initialOf(name)}</span>;
}
