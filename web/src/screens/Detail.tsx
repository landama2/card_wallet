import { useEffect, useState } from 'react';
import CodeView from '../CodeView';
import Logo from '../Logo';
import { deleteItem, getItem, updateItem } from '../db';
import { isArchived, isUpcoming, toDomain, validityLabel } from '../logic';
import { go } from '../route';

export default function Detail({ id }: { id: number }) {
  const [rev, setRev] = useState(0); // bumped after an edit so the item is re-read from storage
  const item = getItem(id);
  useEffect(() => {
    let lock: WakeLockSentinel | undefined;
    let gone = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      navigator.wakeLock?.request('screen').then((l) => { if (gone) l.release(); else lock = l; }).catch(() => {});
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => { gone = true; document.removeEventListener('visibilitychange', acquire); lock?.release(); };
  }, []);
  if (!item) return <main><p>Not found</p><button onClick={() => go('/cards')}>Back</button></main>;
  const back = () => go(`/${item.kind}s`);
  const remove = () => { if (confirm(`Delete ${item.name}?`)) { deleteItem(item.id); back(); } };
  const label = validityLabel(item);
  const setLogo = () => {
    const input = prompt('Store website for the logo (e.g. tesco.cz). Leave empty to remove.', item.domain ?? '');
    if (input === null) return;
    const domain = toDomain(input);
    if (input.trim() && !domain) return alert('Store website should look like tesco.cz');
    updateItem(item.id, { domain });
    setRev(rev + 1);
  };
  return (
    <div className="detail">
      <header><button onClick={back}>‹ Back</button><Logo name={item.name} domain={item.domain ?? null} size={32} /><h1>{item.name}</h1></header>
      {isArchived(item) ? <p className="expired">Expired</p> : isUpcoming(item) && <p className="upcoming">Not valid yet</p>}
      {label && <p className="validity">{label}</p>}
      <CodeView code={item.code} format={item.format} />
      <p className="codetext">{item.code}</p>
      <button onClick={setLogo}>{item.domain ? 'Change logo' : 'Set logo'}</button>
      <button className="danger" onClick={remove}>Delete</button>
    </div>
  );
}
