import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import Logo from '../Logo';
import Scanner from '../Scanner';
import { detectBlob } from '../detect';
import { getItem, insertItem, updateItem } from '../db';
import { FORMATS, FORMAT_LABEL, KINDS, type Format, type Kind, dayEnd, dayStart, toDateInput, toDomain, validateCode } from '../logic';
import { readLines } from '../ocr';
import { guessFromText } from '../ocr-parse';
import { go } from '../route';

const KIND_LABEL: Record<Kind, string> = { card: 'Card', ticket: 'Ticket', coupon: 'Coupon' };
type Field = 'name' | 'website' | 'code' | 'from' | 'until';

// datetime-local value (local time) for an epoch time.
const toDateTimeInput = (t: number) => {
  const d = new Date(t);
  return `${toDateInput(t)}T${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
};

// Add a new item, or edit one when `editId` is given (same form, prefilled).
export default function Add({ kind: initialKind, shared, editId }: { kind: Kind; shared: boolean; editId?: number }) {
  const editing = editId != null ? getItem(editId) : null;
  const [kind, setKind] = useState<Kind>(editing?.kind ?? initialKind);
  const [name, setName] = useState(editing?.name ?? '');
  const [note, setNote] = useState(editing?.note ?? '');
  const [code, setCode] = useState(editing?.code ?? '');
  const [format, setFormat] = useState<Format>(editing?.format ?? 'qr');
  const [expires, setExpires] = useState(editing?.kind === 'ticket' && editing.expires_at ? toDateTimeInput(editing.expires_at) : '');
  const [from, setFrom] = useState(editing?.kind === 'coupon' && editing.valid_from ? toDateInput(editing.valid_from) : '');
  const [until, setUntil] = useState(editing?.kind === 'coupon' && editing.expires_at ? toDateInput(editing.expires_at) : '');
  const [website, setWebsite] = useState(editing?.domain ?? '');
  const [scanning, setScanning] = useState(false);
  const [filled, setFilled] = useState<Partial<Record<Field, string>>>({}); // field -> badge text
  const [ocrNote, setOcrNote] = useState('');
  const saving = useRef(false);
  const back = () => go(editing ? `/item/${editing.id}` : `/${kind}s`);

  const current = useRef({ kind, name, website, from, until }); // latest values, for the async OCR fill below
  current.current = { kind, name, website, from, until };
  const mark = (fields: Field[], text: string) => setFilled((f) => ({ ...f, ...Object.fromEntries(fields.map((k) => [k, text])) }));
  const typed = (field: Field, set: (v: string) => void) => (v: string) => {
    set(v);
    setFilled(({ [field]: _gone, ...rest }) => rest);
  };

  const fill = (r: { code: string; format: Format } | null, source: string) => {
    if (!r) return alert('No code found. Enter the code manually.');
    setCode(r.code);
    setFormat(r.format);
    mark(['code'], `${FORMAT_LABEL[r.format]} · ${source}`);
  };

  // Read the store name, website and coupon dates from the image; never overwrite what the user typed.
  const readText = async (blob: Blob) => {
    setOcrNote('Reading text from the image…');
    try {
      const g = guessFromText(await readLines(blob));
      const c = current.current;
      const got: Field[] = [];
      if (g.name && !c.name) { setName(g.name); got.push('name'); }
      if (g.domain && !c.website) { setWebsite(g.domain); got.push('website'); }
      if (c.kind === 'coupon') {
        // Keep "valid from" <= "valid until" together with whatever the user already entered.
        const u = g.until && !c.until && (!c.from || c.from <= g.until) ? g.until : undefined;
        const f = g.from && !c.from && (!(u || c.until) || g.from <= (u || c.until)) ? g.from : undefined;
        if (f) { setFrom(f); got.push('from'); }
        if (u) { setUntil(u); got.push('until'); }
      }
      mark(got, 'from image');
      const words: Record<Field, string> = { name: 'name', website: 'website', code: 'code', from: 'valid from', until: 'valid until' };
      setOcrNote(got.length ? `Filled from your image: ${got.map((k) => words[k]).join(', ')}. Please check before saving.` : 'No usable text found in the image.');
    } catch (e) {
      console.error('OCR failed', e);
      setOcrNote('Text recognition is unavailable right now (it needs internet the first time).');
    }
  };

  // Barcode and text recognition run side by side; a "No code found" alert waits for the text
  // recognition, so the blocking dialog neither delays nor interrupts it.
  const importBlob = async (blob: Blob) => {
    const ocr = readText(blob);
    const r = await detectBlob(blob).catch(() => null);
    if (!r) await ocr;
    fill(r, 'from image');
  };

  const sharedTaken = useRef(false); // StrictMode runs effects twice in dev; import the shared file once
  useEffect(() => {
    if (!shared || sharedTaken.current) return;
    sharedTaken.current = true;
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
    const domain = toDomain(website);
    if (website.trim() && !domain) return alert('Store website should look like tesco.cz');
    if (kind === 'ticket' && !expires) return alert('Pick an expiry date');
    if (kind === 'coupon' && !until) return alert('Pick the last valid day');
    if (kind === 'coupon' && from && from > until) return alert('"Valid from" must not be after "Valid until"');
    const expiresAt = kind === 'ticket' ? new Date(expires).getTime() : kind === 'coupon' ? dayEnd(until) : null;
    const validFrom = kind === 'coupon' && from ? dayStart(from) : null;
    if (expiresAt != null && expiresAt < Date.now() && !confirm('Already expired. Save anyway?')) return;
    saving.current = true;
    const fields = {
      kind, name: name.trim(), note: note.trim() || null, code: code.trim(), format,
      expires_at: expiresAt, valid_from: validFrom, domain,
    };
    try {
      if (editing) updateItem(editing.id, fields);
      else insertItem({ ...fields, color: null, notify_id: null, created_at: Date.now() });
    } catch (e) {
      saving.current = false;
      return alert('Could not save: ' + String(e));
    }
    if (editing) go(`/item/${editing.id}`); else go(`/${kind}s`);
  };

  if (scanning) {
    return <Scanner onResult={(r) => { fill(r, 'scanned'); setScanning(false); }} onCancel={() => setScanning(false)} />;
  }

  const badge = (f: Field) => filled[f] && <span className="badge">{filled[f]}</span>;
  const cls = (f: Field) => 'input' + (filled[f] ? ' filled' : '');

  return (
    <div className="screen">
      <header className="subbar">
        <button className="icon-btn" aria-label="Back" onClick={back}><Icon name="back" /></button>
        <h1>{editing ? `Edit ${editing.name}` : 'Add'}</h1>
      </header>
      <main className="form">
        <div className="segmented" role="group" aria-label="What is it?">
          {KINDS.map((k) => (
            <button key={k} aria-pressed={k === kind} onClick={() => setKind(k)}>{KIND_LABEL[k]}</button>
          ))}
        </div>

        {ocrNote && <p className="banner" role="status">{ocrNote}</p>}

        <label className="field">
          <span className="field-label">Store name {badge('name')}</span>
          <span className="with-logo">
            <Logo name={name || '?'} domain={toDomain(website)} size={52} />
            <input className={cls('name')} value={name} onChange={(e) => typed('name', setName)(e.target.value)} placeholder="e.g. Albert" />
          </span>
        </label>

        <label className="field">
          <span className="field-label">Store website, for the logo {badge('website')}</span>
          <input className={cls('website')} value={website} onChange={(e) => typed('website', setWebsite)(e.target.value)} placeholder="e.g. albert.cz (optional)" inputMode="url" autoCapitalize="none" />
        </label>

        <div className="two">
          <button className="secondary" onClick={() => setScanning(true)}><Icon name="scan" size={20} />Scan code</button>
          <label className="secondary">
            <Icon name="image" size={20} />From image
            <input type="file" accept="image/*" className="sr-only" onChange={(e) => { const f = e.target.files?.[0]; if (f) importBlob(f); e.target.value = ''; }} />
          </label>
        </div>

        <label className="field">
          <span className="field-label">Code {badge('code')}</span>
          <input className={cls('code')} value={code} onChange={(e) => typed('code', setCode)(e.target.value)} placeholder="Scan, import or type the number" autoCapitalize="none" />
        </label>
        <div className="pills" role="group" aria-label="Code type">
          {FORMATS.map((f) => (
            <button key={f} aria-pressed={f === format} onClick={() => setFormat(f)}>{FORMAT_LABEL[f]}</button>
          ))}
        </div>

        {kind === 'ticket' && (
          <label className="field">
            <span className="field-label">Expires</span>
            <input className="input" type="datetime-local" value={expires} onChange={(e) => setExpires(e.target.value)} />
          </label>
        )}
        {kind === 'coupon' && (
          <div className="two">
            <label className="field">
              <span className="field-label">Valid from {badge('from')}</span>
              <input className={cls('from')} type="date" value={from} max={until || undefined} onChange={(e) => typed('from', setFrom)(e.target.value)} />
            </label>
            <label className="field">
              <span className="field-label">Valid until {badge('until')}</span>
              <input className={cls('until')} type="date" value={until} min={from || undefined} onChange={(e) => typed('until', setUntil)(e.target.value)} />
            </label>
          </div>
        )}

        <label className="field">
          <span className="field-label">Note (optional)</span>
          <input className="input" value={note} onChange={(e) => setNote(e.target.value)} placeholder={kind === 'coupon' ? 'e.g. −20 % on fruit' : 'e.g. Family card'} />
        </label>
      </main>
      <div className="bottom-bar">
        <button className="primary" onClick={save}>{editing ? 'Save changes' : `Save ${KIND_LABEL[kind].toLowerCase()}`}</button>
      </div>
    </div>
  );
}
