import { useState } from 'react';
import Icon from '../Icon';
import { applyImport, exportBackup } from '../backup';
import { type NewItem, parseImport } from '../logic';
import { go } from '../route';

export default function Settings() {
  const [pending, setPending] = useState<NewItem[] | null>(null);
  const pick = async (file: File | undefined) => {
    if (!file) return;
    try { setPending(parseImport(await file.text())); }
    catch (e) { alert(`Import failed: ${String(e)}`); }
  };
  const run = (mode: 'merge' | 'replace') => {
    if (mode === 'replace' && !confirm(`Replace all items with ${pending!.length} from backup?`)) return;
    applyImport(pending!, mode); setPending(null); alert('Import complete');
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
        </section>
        {pending && (
          <section className="panel" role="dialog" aria-label="Import backup">
            <p>{pending.length} items found in the backup.</p>
            <div className="row">
              <button className="secondary" onClick={() => run('merge')}>Merge</button>
              <button className="secondary danger-text" onClick={() => run('replace')}>Replace all</button>
              <button className="secondary" onClick={() => setPending(null)}>Cancel</button>
            </div>
          </section>
        )}
      </main>
    </div>
  );
}
