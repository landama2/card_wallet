import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import { applyImport, exportBackup, lastExport } from '../backup';
import { insertMany, listItems } from '../db';
import { type NewItem, daysAgo, dedupe, parseImport } from '../logic';
import { go } from '../route';

export default function Settings() {
  const [last, setLast] = useState(lastExport);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted); }, []);
  const doExport = async () => { if (await exportBackup()) setLast(lastExport()); };
  const [pending, setPending] = useState<{ items: NewItem[]; fresh: number } | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; title: string; detail?: string; undo?: NewItem[] } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const show = (r: NonNullable<typeof result>) => { setResult(r); setTimeout(() => card.current?.focus()); };
  const cards = (n: number) => `${n} ${n === 1 ? 'card' : 'cards'}`;
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setResult(null); setConfirmReplace(false);
    try {
      const items = parseImport(await file.text());
      if (items.length) {
        setPending({ items, fresh: dedupe(listItems(), items).length });
        setTimeout(() => panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      } else { setPending(null); show({ ok: false, title: 'This backup has no cards.' }); }
    } catch (e) {
      setPending(null);
      show({ ok: false, title: e instanceof Error ? e.message : "That file couldn't be read." });
    }
  };
  const run = (mode: 'merge' | 'replace') => {
    const before = listItems().map(({ id, ...rest }) => rest); // for Undo after a replace
    const { added, skipped } = applyImport(pending!.items, mode);
    setPending(null); setConfirmReplace(false);
    show(mode === 'replace'
      ? { ok: true, title: `Replaced your wallet with ${cards(added)}.`, undo: before.length ? before : undefined }
      : added
        ? { ok: true, title: `Added ${cards(added)}.`, detail: skipped ? `${skipped} already in your wallet, skipped.` : undefined }
        : { ok: true, title: 'Nothing new.', detail: `All ${skipped} are already in your wallet.` });
  };
  const undo = (items: NewItem[]) => {
    insertMany(items, true);
    show({ ok: true, title: `Restored your ${cards(items.length)}.` });
  };
  return (
    <div className="screen">
      <header className="subbar">
        <button className="icon-btn" aria-label="Back" onClick={() => history.length > 1 ? history.back() : go('/cards')}><Icon name="back" /></button>
        <h1>Settings</h1>
      </header>
      <main className="form">
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
          {result && (
            <div ref={card} tabIndex={-1} role={result.ok ? 'status' : 'alert'} className={`result ${result.ok ? 'ok' : 'err'}`}>
              <Icon name={result.ok ? 'check' : 'alert'} size={22} />
              <div>
                <strong>{result.title}</strong>
                {result.detail && <span>{result.detail}</span>}
              </div>
              {result.ok && <button className="primary" onClick={() => go('/cards')}>View cards</button>}
              {result.undo && <button className="secondary" onClick={() => undo(result.undo!)}>Undo</button>}
            </div>
          )}
        </section>
        {pending && (
          <section ref={panel} className="panel" role="region" aria-live="polite" aria-label="Import backup">
            {confirmReplace ? (
              <>
                <p>This deletes your {cards(listItems().length)} and loads {cards(pending.items.length)} from the backup. You can undo it right after.</p>
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
                  {pending.fresh > 0 && <button className="primary" onClick={() => run('merge')}>Add new cards</button>}
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
