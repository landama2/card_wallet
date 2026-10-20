import { useState } from 'react';
import Icon from '../Icon';
import { applyImport, exportBackup } from '../backup';
import { type NewItem, parseImport } from '../logic';
import { go } from '../route';

export default function Settings() {
  const [pending, setPending] = useState<NewItem[] | null>(null);
  const [confirmReplace, setConfirmReplace] = useState(false);
  const [status, setStatus] = useState('');
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setStatus(''); setConfirmReplace(false);
    try { setPending(parseImport(await file.text())); }
    catch (e) { setPending(null); setStatus(`Import failed: ${String(e)}`); }
  };
  const run = (mode: 'merge' | 'replace') => {
    applyImport(pending!, mode); setPending(null); setConfirmReplace(false);
    setStatus(`Imported ${pending!.length} items.`);
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
          <div className="two">
            <button className="secondary" onClick={exportBackup}><Icon name="download" size={20} />Export</button>
            {/* A filter is needed: without one Android offers photo/video capture and asks for camera and
                microphone. Generic types are included because Android often reports .json files as those. */}
            <label className="secondary">
              <Icon name="upload" size={20} />Import
              <input type="file" accept=".json,application/json,text/plain,application/octet-stream" className="sr-only" onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
            </label>
          </div>
          {status && <p role="status">{status}</p>}
        </section>
        {pending && (
          <section className="panel" role="dialog" aria-label="Import backup">
            <p>{confirmReplace ? `Delete all current items and replace them with the ${pending.length} from the backup?` : `${pending.length} items found in the backup.`}</p>
            <div className="row">
              {confirmReplace ? (
                <>
                  <button className="secondary danger-text" onClick={() => run('replace')}>Yes, replace</button>
                  <button className="secondary" onClick={() => setConfirmReplace(false)}>Back</button>
                </>
              ) : (
                <>
                  <button className="secondary" onClick={() => run('merge')}>Merge</button>
                  <button className="secondary danger-text" onClick={() => setConfirmReplace(true)}>Replace all</button>
                  <button className="secondary" onClick={() => setPending(null)}>Cancel</button>
                </>
              )}
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
