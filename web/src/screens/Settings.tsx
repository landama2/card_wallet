import { useEffect, useRef, useState } from 'react';
import Icon from '../Icon';
import { ask } from '../Dialog';
import { applyImport, exportBackup, isZip, lastExport, restoreBeforeReplace, savedBeforeReplace, unzipBackup } from '../backup';
import { listItems } from '../db';
import { type NewItem, daysAgo, dedupe, parseImport } from '../logic';
import { ocrDebugOn, setOcrDebug } from '../OcrDebug';
import { clearPhotos, photoUsage, putPhoto } from '../photos';
import { go } from '../route';
import { getLook, getTheme, setLook, setTheme } from '../theme';

export default function Settings() {
  const [theme, setThemeState] = useState(getTheme);
  const [look, setLookState] = useState(getLook);
  const [ocrDebug, setOcrDebugState] = useState(ocrDebugOn);
  const [last, setLast] = useState(lastExport);
  const [persisted, setPersisted] = useState<boolean | null>(null);
  useEffect(() => { navigator.storage?.persisted?.().then(setPersisted); }, []);
  const doExport = async (withPhotos: boolean) => { if (await exportBackup(withPhotos)) setLast(lastExport()); };
  const [usage, setUsage] = useState<{ count: number; bytes: number } | null>(null);
  useEffect(() => { photoUsage().then(setUsage).catch(() => {}); }, []);
  const [pending, setPending] = useState<{ items: NewItem[]; photos: (Uint8Array | null)[] | null; missing: number; fresh: number } | null>(null);
  const [busy, setBusy] = useState(false); // an import or restore is writing photos
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; title: string; detail?: string; undo?: boolean } | null>(null);
  const card = useRef<HTMLDivElement>(null);
  const panel = useRef<HTMLElement>(null);
  const show = (r: NonNullable<typeof result>) => { setResult(r); setTimeout(() => card.current?.focus()); };
  // Counts cover cards, tickets, coupons and receipts together.
  const count = (n: number) => `${n} ${n === 1 ? 'item' : 'items'}`;
  const [before, setBefore] = useState(savedBeforeReplace);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setResult(null); setConfirmReplace(false);
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const zip = isZip(bytes) ? unzipBackup(bytes) : null;
      const items = zip ? zip.items : parseImport(new TextDecoder().decode(bytes));
      if (items.length) {
        setPending({ items, photos: zip?.photos ?? null, missing: zip?.missing ?? 0, fresh: dedupe(listItems(), items).length });
        setTimeout(() => panel.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' }));
      } else { setPending(null); show({ ok: false, title: 'This backup is empty.' }); }
    } catch (e) {
      setPending(null);
      show({ ok: false, title: e instanceof Error ? e.message : "That file couldn't be read." });
    }
  };
  // Replace clears every stored photo (their items are gone); then each imported item gets its photo, if the zip had one.
  const run = async (mode: 'merge' | 'replace') => {
    const p = pending!;
    setPending(null); setConfirmReplace(false); setBusy(true);
    try {
      if (mode === 'replace') {
        try { await clearPhotos(); } catch { return show({ ok: false, title: "Couldn't reset the photos, so nothing was imported." }); }
      }
      const { added, skipped, ids } = applyImport(p.items, mode);
      let failed = p.missing;
      for (const [i, data] of (p.photos ?? []).entries()) {
        if (!data || ids[i] == null) continue;
        await putPhoto(ids[i]!, new Blob([data as Uint8Array<ArrayBuffer>], { type: 'image/jpeg' })).catch(() => { failed++; });
      }
      photoUsage().then(setUsage).catch(() => {});
      setBefore(savedBeforeReplace());
      const lost = failed ? `${failed} ${failed === 1 ? 'photo' : 'photos'} couldn't be restored.` : undefined;
      show(mode === 'replace'
        ? { ok: true, title: `Replaced your wallet with ${count(added)}.`, detail: lost, undo: savedBeforeReplace() != null }
        : added
          ? { ok: true, title: `Added ${count(added)}.`, detail: [skipped ? `${skipped} already in your wallet, skipped.` : '', lost ?? ''].filter(Boolean).join(' ') || undefined }
          : { ok: true, title: 'Nothing new.', detail: `All ${skipped} are already in your wallet.` });
    } finally { setBusy(false); }
  };
  // Restored items come back without photos, and their ids restart at 1, so no stored photo may remain to be mistaken for theirs.
  const restore = async () => {
    setBusy(true);
    try {
      try { await clearPhotos(); } catch { return show({ ok: false, title: "Couldn't reset the photos, so nothing was restored." }); }
      const n = restoreBeforeReplace();
      setBefore(null);
      photoUsage().then(setUsage).catch(() => {});
      show({ ok: true, title: `Restored your ${count(n)}.` });
    } finally { setBusy(false); }
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
          <h2 className="section-label">Look</h2>
          <div className="segmented" role="group" aria-label="Look">
            {([['classic', 'Classic'], ['soft', 'Soft tiles'], ['cards', 'Real cards']] as const).map(([l, label]) => (
              <button key={l} aria-pressed={look === l} onClick={() => { setLook(l); setLookState(l); }}>{label}</button>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2 className="section-label">Developer</h2>
          <div className="segmented" role="group" aria-label="OCR details">
            {([false, true] as const).map((on) => (
              <button key={String(on)} aria-pressed={ocrDebug === on} onClick={() => { setOcrDebug(on); setOcrDebugState(on); }}>{on ? 'Show OCR details' : 'Hide OCR details'}</button>
            ))}
          </div>
        </section>
        <section className="panel">
          <h2 className="section-label">Backup</h2>
          <p>Your cards, receipts and photos are stored only on this phone. Export a backup now and then, and keep it somewhere safe. Photos are only in the “with photos” backup, which contains your receipts in readable form.</p>
          <p className="backup-status">
            {last ? `Last backup: ${daysAgo(last)}` : 'No backup yet'}
            {usage && usage.count > 0 && ` · ${usage.count} ${usage.count === 1 ? 'photo' : 'photos'}, ${usage.bytes < 1_048_576 ? `${Math.ceil(usage.bytes / 1024)} KB` : `${(usage.bytes / 1_048_576).toFixed(1)} MB`}`}
            {persisted === false && ' · This browser may clear your data when the phone runs low on space'}
          </p>
          <div className="two">
            <button className="secondary" disabled={busy} onClick={() => doExport(false)}><Icon name="download" size={20} />Export</button>
            {/* A filter is needed: without one Android offers photo/video capture and asks for camera and
                microphone. Generic types are included because Android often reports .json files as those. */}
            <label className="secondary" aria-disabled={busy}>
              <Icon name="upload" size={20} />Import
              <input type="file" accept=".json,.zip,application/json,application/zip,text/plain,application/octet-stream" className="sr-only" disabled={busy} onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
          {usage && usage.count > 0 && (
            <button className="secondary" disabled={busy} onClick={() => doExport(true)}><Icon name="download" size={20} />Export with photos (.zip)</button>
          )}
          {before && !result?.undo && <button className="secondary" disabled={busy} onClick={restoreLater}>Restore the wallet from before the last replace</button>}
          {busy && <p className="backup-status" role="status">Importing photos…</p>}
          {result && (
            <div ref={card} tabIndex={-1} role={result.ok ? 'status' : 'alert'} className={`result ${result.ok ? 'ok' : 'err'}`}>
              <Icon name={result.ok ? 'check' : 'alert'} size={22} />
              <div>
                <strong>{result.title}</strong>
                {result.detail && <span>{result.detail}</span>}
              </div>
              {result.ok && <button className="primary" onClick={() => go('/cards')}>View wallet</button>}
              {result.undo && <button className="secondary" disabled={busy} onClick={restore}>Undo</button>}
            </div>
          )}
        </section>
        {pending && (
          <section ref={panel} className="panel" role="region" aria-live="polite" aria-label="Import backup">
            {confirmReplace ? (
              <>
                <p>This deletes your {count(listItems().length)} and their photos, and loads {count(pending.items.length)} from the backup. You can restore the items (without photos) afterwards in Settings.</p>
                <div className="row two">
                  <button className="secondary danger-text" disabled={busy} onClick={() => run('replace')}>Yes, replace</button>
                  <button className="secondary" disabled={busy} onClick={() => setConfirmReplace(false)}>Back</button>
                </div>
              </>
            ) : (
              <>
                <p>
                  <strong>{pending.items.length} in backup: {pending.fresh} new, {pending.items.length - pending.fresh} already here.</strong>
                  <br />{pending.items.slice(0, 3).map((i) => i.name).join(', ')}{pending.items.length > 3 && ` and ${pending.items.length - 3} more`}
                </p>
                <div className="row">
                  {pending.fresh > 0 && <button className="primary" disabled={busy} onClick={() => run('merge')}>Add new items</button>}
                  <button className="secondary danger-text" disabled={busy} onClick={() => setConfirmReplace(true)}>Replace everything</button>
                  <button className="secondary" disabled={busy} onClick={() => setPending(null)}>Cancel</button>
                </div>
              </>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
