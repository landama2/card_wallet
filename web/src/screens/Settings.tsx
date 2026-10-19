import { useState } from 'react';
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
    applyImport(pending!, mode); setPending(null); alert('Import complete'); };
  return (
    <div>
      <header><button onClick={() => go('/cards')}>‹ Back</button><h1>Settings</h1></header>
      <main className="form">
        <button onClick={exportBackup}>Export backup</button>
        {/* No accept filter: Android often reports .json files with a generic MIME type. */}
        <label className="button">
          Import backup
          <input type="file" hidden onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ''; }} />
        </label>
        {pending && (
          <div className="confirm">
            <p>{pending.length} items found.</p>
            <button onClick={() => run('merge')}>Merge</button>
            <button className="danger" onClick={() => run('replace')}>Replace all</button>
            <button onClick={() => setPending(null)}>Cancel</button>
          </div>
        )}
      </main>
    </div>
  );
}
