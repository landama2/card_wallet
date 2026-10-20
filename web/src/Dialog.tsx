import { useEffect, useRef, useState } from 'react';

// In-app replacement for alert/confirm/prompt: call notify/ask/askText from anywhere, mount <DialogHost /> once.
// Each dialog pushes a history entry, so the phone's Back button cancels it instead of leaving the screen.
type Req = { message: string; ok: string; cancel: boolean; danger: boolean; input: string | null; done: (v: string | boolean | null) => void };
let show: ((r: Req) => void) | null = null;

type Toast = { message: string; action: string; run: () => void };
let showToast: ((t: Toast | null) => void) | null = null;
/** A short message with one action (e.g. Undo) above the tab bar; goes away after 6 s. */
export const toast = (message: string, action: string, run: () => void) => showToast?.({ message, action, run });

const open = (r: Omit<Req, 'done'>) => new Promise<string | boolean | null>((done) => {
  history.pushState({ dialog: true }, '');
  show!({ ...r, done });
});

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
  const top = useRef<Req | undefined>(undefined);
  const answer = useRef<string | boolean | null | undefined>(undefined); // set by a button; undefined = Back was pressed
  const [t, setT] = useState<Toast | null>(null);
  useEffect(() => { showToast = setT; return () => { showToast = null; }; }, []);
  useEffect(() => { if (!t) return; const h = setTimeout(() => setT(null), 6000); return () => clearTimeout(h); }, [t]);
  useEffect(() => { show = (r) => setQueue((q) => [...q, r]); return () => { show = null; }; }, []);
  const req = queue[0];
  top.current = req;
  // Every close goes through history.back(); the dialog resolves once its entry is gone, so the caller's
  // next navigation (go(...)) can't race with that Back.
  useEffect(() => {
    const onPop = () => {
      const r = top.current;
      if (!r) return;
      top.current = undefined; // a second popstate before re-render must not drop the next queued dialog
      const v = answer.current !== undefined ? answer.current : r.input != null ? null : false;
      answer.current = undefined;
      setQueue((q) => q.slice(1));
      r.done(v);
    };
    addEventListener('popstate', onPop);
    return () => removeEventListener('popstate', onPop);
  }, []);
  useEffect(() => { setText(req?.input ?? ''); if (req?.input != null) field.current?.focus(); }, [req]);
  const toastEl = t && (
    <div className="toast" role="status">
      <span>{t.message}</span>
      <button onClick={() => { setT(null); t.run(); }}>{t.action}</button>
    </div>
  );
  if (!req) return toastEl;
  const close = (v: string | boolean | null) => {
    if (answer.current !== undefined) return; // a double tap must not go Back twice
    answer.current = v;
    history.back();
  };
  const cancel = () => close(req.input != null ? null : false);
  const ok = () => close(req.input != null ? text : true);
  return (
    <>
      {toastEl}
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
            {/* A destructive dialog focuses Cancel, so Enter can't confirm it by accident. */}
            {req.cancel && <button type="button" className="secondary" autoFocus={req.danger} onClick={cancel}>Cancel</button>}
            <button type="submit" autoFocus={req.input == null && !req.danger} className={`secondary strong${req.danger ? ' danger-text' : ''}`}>{req.ok}</button>
          </div>
        </form>
      </div>
    </>
  );
}
