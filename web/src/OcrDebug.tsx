// Developer panel (Settings → Developer): what OCR saw in the last image and how the parser read it.
import { useEffect, useState } from 'react';
import { lastRead } from './ocr';
import { guessFromText, type LineTrace } from './ocr-parse';

const KEY = 'dev.ocrDebug';
export const ocrDebugOn = () => { try { return localStorage.getItem(KEY) === '1'; } catch { return false; } };
export const setOcrDebug = (on: boolean) => { try { if (on) localStorage.setItem(KEY, '1'); else localStorage.removeItem(KEY); } catch { /* storage blocked */ } };

const COLOR = { kept: '#16a34a', 'low confidence': '#dc2626', duplicate: '#9ca3af' };

export default function OcrDebug() {
  const r = lastRead;
  const [url, setUrl] = useState('');
  const [size, setSize] = useState([1, 1]);
  useEffect(() => {
    if (!r) return;
    const u = URL.createObjectURL(r.image);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [r]);
  if (!r) return null;
  const trace: LineTrace[] = [];
  const guess = guessFromText(r.parsed, Date.now(), trace);
  return (
    <details className="panel ocr-debug" open>
      <summary>OCR details</summary>
      <div className="ocr-image">
        {url && <img src={url} alt="" onLoad={(e) => setSize([e.currentTarget.naturalWidth, e.currentTarget.naturalHeight])} />}
        <svg viewBox={`0 0 ${size[0]} ${size[1]}`} preserveAspectRatio="none">
          {r.lines.map((l, i) => (
            <rect key={i} x={l.bbox.x0} y={l.bbox.y0} width={l.bbox.x1 - l.bbox.x0} height={l.bbox.y1 - l.bbox.y0} fill="none"
              stroke={COLOR[l.status]} strokeWidth={size[0] / 250} strokeDasharray={l.pass === '11' ? size[0] / 80 : undefined}>
              <title>{`${l.text} (${Math.round(l.confidence)}%)`}</title>
            </rect>
          ))}
        </svg>
      </div>
      <p>Green kept · red below 60 % confidence · grey duplicate · dashed = sparse-text pass</p>
      <h3>Tesseract lines</h3>
      <table>
        <thead><tr><th>Pass</th><th>Conf</th><th>Text</th><th>Status</th></tr></thead>
        <tbody>{r.lines.map((l, i) => (
          <tr key={i} style={{ color: l.status === 'kept' ? undefined : COLOR[l.status] }}>
            <td>{l.pass === '3' ? 'auto' : 'sparse'}</td><td>{Math.round(l.confidence)}</td><td>{l.text}</td><td>{l.status}</td>
          </tr>
        ))}</tbody>
      </table>
      <h3>Parser, top to bottom</h3>
      <table>
        <thead><tr><th>H</th><th>Text</th><th>Read as</th></tr></thead>
        <tbody>{trace.map((t, i) => (
          <tr key={i}>
            <td>{t.height}</td><td>{t.text}</td>
            <td>{[
              ...t.dates.map((d) => `${d.role ?? 'date'} ${d.date}`),
              t.domain && `site ${t.domain}`,
              t.name && `name? ${t.name}`,
            ].filter(Boolean).join(' · ') || '—'}</td>
          </tr>
        ))}</tbody>
      </table>
      <h3>Result</h3>
      <pre>{JSON.stringify(guess, null, 2)}</pre>
    </details>
  );
}
