import { useEffect } from 'react';
import CodeView from '../CodeView';
import { deleteItem, getItem } from '../db';
import { isArchived, isUpcoming, validityLabel } from '../logic';
import { go } from '../route';

export default function Detail({ id }: { id: number }) {
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
  return (
    <div className="detail">
      <header><button onClick={back}>‹ Back</button><h1>{item.name}</h1></header>
      {isArchived(item) ? <p className="expired">Expired</p> : isUpcoming(item) && <p className="expired">Not valid yet</p>}
      {label && <p className="validity">{label}</p>}
      <CodeView code={item.code} format={item.format} />
      <p className="codetext">{item.code}</p>
      <button className="danger" onClick={remove}>Delete</button>
    </div>
  );
}
