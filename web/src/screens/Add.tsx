import { useEffect, useRef, useState } from 'react';
import Scanner from '../Scanner';
import { detectBlob } from '../detect';
import { insertItem } from '../db';
import { FORMATS, KINDS, type Format, type Kind, dayEnd, dayStart, validateCode } from '../logic';
import { go } from '../route';

export default function Add({ kind: initialKind, shared }: { kind: Kind; shared: boolean }) {
  // A shared image arrives without context, so let the user say what it is.
  const [kind, setKind] = useState(initialKind);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [format, setFormat] = useState<Format>('qr');
  const [expires, setExpires] = useState(''); // ticket: datetime-local value, local time
  const [from, setFrom] = useState(''); // coupon: date values (YYYY-MM-DD)
  const [until, setUntil] = useState('');
  const [scanning, setScanning] = useState(false);
  const saving = useRef(false);
  const back = () => go(`/${kind}s`);

  const fill = (r: { code: string; format: Format } | null) => {
    if (!r) return alert('No code found. Enter the code manually.');
    setCode(r.code);
    setFormat(r.format);
  };
  const importBlob = async (blob: Blob) => fill(await detectBlob(blob).catch(() => null));

  useEffect(() => {
    if (!shared) return;
    (async () => {
      const cache = await caches.open('shared');
      const res = await cache.match('shared-file');
      if (!res) return;
      await cache.delete('shared-file');
      const blob = await res.blob();
      if (blob.type === 'application/pdf') alert('PDF codes cannot be decoded. Enter the code manually.');
      else await importBlob(blob);
    })();
  }, [shared]);

  const save = () => {
    if (saving.current) return;
    if (!name.trim()) return alert('Name is required');
    const err = validateCode(format, code.trim());
    if (err) return alert(`Invalid code: ${err}`);
    if (kind === 'ticket' && !expires) return alert('Pick an expiry date');
    if (kind === 'coupon' && !until) return alert('Pick the last valid day');
    if (kind === 'coupon' && from && from > until) return alert('"Valid from" must not be after "Valid until"');
    const expiresAt = kind === 'ticket' ? new Date(expires).getTime() : kind === 'coupon' ? dayEnd(until) : null;
    const validFrom = kind === 'coupon' && from ? dayStart(from) : null;
    if (expiresAt != null && expiresAt < Date.now() && !confirm('Already expired. Save anyway?')) return;
    saving.current = true;
    try {
      insertItem({
        kind, name: name.trim(), code: code.trim(), format, color: null, note: null,
        expires_at: expiresAt, valid_from: validFrom, notify_id: null, created_at: Date.now(),
      });
    } catch (e) {
      saving.current = false;
      return alert('Could not save: ' + String(e));
    }
    back();
  };

  if (scanning) {
    return <Scanner onResult={(r) => { fill(r); setScanning(false); }} onCancel={() => setScanning(false)} />;
  }

  return (
    <div>
      <header><button onClick={back}>‹ Back</button><h1>Add {kind}</h1></header>
      <main className="form">
        {shared && (
          <div className="chips">
            {KINDS.map((k) => <button key={k} className={k === kind ? 'on' : ''} onClick={() => setKind(k)}>{k}</button>)}
          </div>
        )}
        <input placeholder="Name" value={name} onChange={(e) => setName(e.target.value)} />
        <input placeholder="Code / number" value={code} onChange={(e) => setCode(e.target.value)} />
        <div className="chips">
          {FORMATS.map((f) => (
            <button key={f} className={f === format ? 'on' : ''} onClick={() => setFormat(f)}>{f}</button>
          ))}
        </div>
        {kind === 'ticket' && (
          <label>Expires <input type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} /></label>
        )}
        {kind === 'coupon' && (
          <>
            <label>Valid from (optional) <input type="date" value={from} max={until || undefined} onChange={(e) => setFrom(e.target.value)} /></label>
            <label>Valid until <input type="date" value={until} min={from || undefined} onChange={(e) => setUntil(e.target.value)} /></label>
          </>
        )}
        <button onClick={() => setScanning(true)}>Scan with camera</button>
        <label className="button">
          Import from image
          <input type="file" accept="image/*" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) importBlob(f); e.target.value = ''; }} />
        </label>
        <button className="primary" onClick={save}>Save</button>
      </main>
    </div>
  );
}
