import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import { ask } from '../Dialog';
import { applyImport, exportBackup, lastExport, restoreBeforeReplace, savedBeforeReplace } from '../backup';
import { listItems } from '../db';
import { type NewItem, daysAgo, dedupe, parseImport } from '../logic';
import { go } from '../route';
import { getTheme, setTheme } from '../theme';

export default function Settings() {
  const [theme, setThemeState] = useState(getTheme);
  const [last, setLast] = useState(lastExport);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted); }, []);
  const doExport = async () => { if (await exportBackup()) setLast(lastExport()); };
  const [pending, setPending] = useState<{ items: NewItem[]; fresh: number } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; title: string; detail?: string; undo?: boolean } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const show = (r: NonNullable<typeof result>) => { setResult(r); setTimeout(() => card.current?.focus()); };
  // Counts cover cards, tickets and coupons together.
  const count = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
  const [before, setBefore] = useState(savedBeforeReplace);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setResult(null); setConfirmReplace(false);
    try {
      const items = parseImport(await file.text());
      if (items.length) {
        setPending({ items, fresh: dedupe(listItems(), items).length });
        setTimeout(() => panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      } else { setPending(null); show({ ok: false, title: 'This backup is empty.' }); }
    } catch (e) {
      setPending(null);
      show({ ok: false, title: e instanceof Error ? e.message : "That file couldn't be read." });
    }
  };
  const run = (mode: 'merge' | 'replace') => {
    const { added, skipped } = applyImport(pending!.items, mode);
    setPending(null); setConfirmReplace(false);
    setBefore(savedBeforeReplace());
    show(mode === 'replace'
      ? { ok: true, title: `Replaced your wallet with ${count(added)}.`, undo: savedBeforeReplace() != null }
      : added
        ? { ok: true, title: `Added ${count(added)}.`, detail: skipped ? `${skipped} already in your wallet, skipped.` : undefined }
        : { ok: true, title: 'Nothing new.', detail: `All ${skipped} are already in your wallet.` });
  };
  const restore = () => {
    const n = restoreBeforeReplace();
    setBefore(null);
    show({ ok: true, title: `Restored your ${count(n)}.` });
  };
  const restoreLater = async () => {
    if (await ask(`Replace your ${count(listItems().length)} with the ${count(before!.length)} you had before the last replace?`, 'Restore', true)) restore();
  };
  return (
    <div className="screen">
      <header className="subbar">
        <button className="icon-btn" aria-label="Back" onClick={() => history.length > 1 ? history.back() : go('/cards')}><Icon name="back" /></button>
        <h1>Settings</h1>
      </header>
      <main className="form">
        <section className="panel">
          <h2 className="section-label">Theme</h2>
          <div className="segmented">
            {(['system', 'light', 'dark'] as const).map((t) => (
              <button key={t} aria-pressed={theme === t} onClick={() => { setTheme(t); setThemeState(t); }}>{t[0].toUpperCase() + t.slice(1)}</button>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2 className="section-label">Backup</h2>
          <p>Your cards are stored only on this phone. Export a backup now and then, and keep it somewhere safe.</p>
          <p className="backup-status">
            {last ? `Last backup: ${daysAgo(last)}` : 'No backup yet'}
            {persisted === false && ' · This browser may clear your data when the phone runs low on space'}
          </p>
          <div className="two">
            <button className="secondary" onClick={doExport}><Icon name="download" size={20} />Export</button>
            {/* A filter is needed: without one Android offers photo/video capture and asks for camera and
                microphone. Generic types are included because Android often reports .json files as those. */}
            <label className="secondary">
              <Icon name="upload" size={20} />Import
              <input type="file" accept=".json,application/json,text/plain,application/octet-stream" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
          {before && !result?.undo && <button className="secondary" onClick={restoreLater}>Restore the wallet from before the last replace</button>}
          {result && (
            <div ref={card} tabIndex={-1} role={result.ok ? 'status' : 'alert'} className={`result ${result.ok ? 'ok' : 'err'}`}>
              <Icon name={result.ok ? 'check' : 'alert'} size={22} />
              <div>
                <strong>{result.title}</strong>
                {result.detail && <span>{result.detail}</span>}
              </div>
              {result.ok && <button className="primary" onClick={() => go('/cards')}>View cards</button>}
              {result.undo && <button className="secondary" onClick={restore}>Undo</button>}
            </div>
          )}
        </section>
        {pending && (
          <section ref={panel} className="panel" role="region" aria-live="polite" aria-label="Import backup">
            {confirmReplace ? (
              <>
                <p>This deletes your {count(listItems().length)} and loads {count(pending.items.length)} from the backup. You can restore them afterwards in Settings.</p>
                <div className="row two">
                  <button className="secondary danger-text" onClick={() => run('replace')}>Yes, replace</button>
                  <button className="secondary" onClick={() => setConfirmReplace(false)}>Back</button>
                </div>
              </>
            ) : (
              <>
                <p>
                  <strong>{pending.items.length} in backup: {pending.fresh} new, {pending.items.length - pending.fresh} already here.</strong>
                  <br />{pending.items.slice(0, 3).map((i) => i.name).join(', ')}{pending.items.length > 3 && ` and ${pending.items.length - 3} more`}
                </p>
                <div className="row">
                  {pending.fresh > 0 && <button className="primary" onClick={() => run('merge')}>Add new items</button>}
                  <button className="secondary danger-text" onClick={() => setConfirmReplace(true)}>Replace everything</button>
                  <button className="secondary" onClick={() => setPending(null)}>Cancel</button>
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
