import { useEffect, useRef, useState } from 'react';

// In-app replacement for alert/confirm/prompt: call notify/ask/askText from anywhere, mount <DialogHost /> once.
type Req = { message: string; ok: string; cancel: boolean; danger: boolean; input: string | null; done: (v: string | boolean | null) => void };
let show: ((r: Req) => void) | null = null;

const open = (r: Omit<Req, 'done'>) => new Promise<string | boolean | null>((done) => show!({ ...r, done }));

export const notify = (message: string) =>
  open({ message, ok: 'OK', cancel: false, danger: false, input: null }).then(() => {});
export const ask = (message: string, ok = 'OK', danger = false) =>
  open({ message, ok, cancel: true, danger, input: null }) as Promise<boolean>;
/** Resolves to the text, or null when cancelled. */
export const askText = (message: string, initial = '') =>
  open({ message, ok: 'Save', cancel: true, danger: false, input: initial }) as Promise<string | null>;

export function DialogHost() {
  const [queue, setQueue] = useState<Req[]>([]);
  const [text, setText] = useState('');
  const field = useRef<HTMLInputElement>(null);
  useEffect(() => { show = (r) => setQueue((q) => [...q, r]); return () => { show = null; }; }, []);
  const req = queue[0];
  useEffect(() => { setText(req?.input ?? ''); if (req?.input != null) field.current?.focus(); }, [req]);
  if (!req) return null;
  const close = (v: string | boolean | null) => { req.done(v); setQueue((q) => q.slice(1)); };
  const cancel = () => close(req.input != null ? null : false);
  const ok = () => close(req.input != null ? text : true);
  return (
    <div className="dialog-backdrop" onClick={req.cancel ? cancel : undefined}>
      <form
        className="dialog" role="alertdialog" aria-modal="true" aria-label={req.message}
        onClick={(e) => e.stopPropagation()}
        onSubmit={(e) => { e.preventDefault(); ok(); }}
        onKeyDown={(e) => { if (e.key === 'Escape') cancel(); }}
      >
        <p>{req.message}</p>
        {req.input != null && <input ref={field} value={text} onChange={(e) => setText(e.target.value)} autoCapitalize="none" autoCorrect="off" />}
        <div className="actions">
          {req.cancel && <button type="button" className="secondary" onClick={cancel}>Cancel</button>}
          <button type="submit" autoFocus={req.input == null} className={`secondary strong${req.danger ? ' danger-text' : ''}`}>{req.ok}</button>
        </div>
      </form>
    </div>
  );
}
