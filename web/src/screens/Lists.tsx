import { useState } from 'react';
import { listItems } from '../db';
import { type Item, type Kind, KINDS, isArchived, isUpcoming, validityLabel } from '../logic';
import { go } from '../route';

const TAB_LABEL: Record<Kind, string> = { card: 'Cards', ticket: 'Tickets', coupon: 'Coupons' };

function Row({ item, dim }: { item: Item; dim?: boolean }) {
  const sub = validityLabel(item);
  return (
    <button className={'row' + (dim ? ' dim' : '')} onClick={() => go(`/item/${item.id}`)}>
      <span className="name">{item.name}</span>
      {sub && <span className="sub">{sub}</span>}
    </button>
  );
}

export default function Lists({ tab }: { tab: Kind }) {
  const [q, setQ] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const now = Date.now();
  const items = listItems().filter((i) => i.kind === tab);
  const byExpiry = (a: Item, b: Item) => (a.expires_at ?? Infinity) - (b.expires_at ?? Infinity);
  const live = items.filter((i) => !isArchived(i, now));
  const valid = live.filter((i) => !isUpcoming(i, now)).sort(byExpiry);
  const upcoming = live.filter((i) => isUpcoming(i, now)).sort((a, b) => a.valid_from! - b.valid_from!);
  const archive = items.filter((i) => isArchived(i, now)).sort((a, b) => (b.expires_at ?? 0) - (a.expires_at ?? 0));
  return (
    <>
      <header className="tabs">
        {KINDS.map((k) => (
          <button key={k} className={tab === k ? 'on' : ''} onClick={() => go(`/${k}s`)}>{TAB_LABEL[k]}</button>
        ))}
        <button onClick={() => go('/settings')} aria-label="Settings">⚙</button>
      </header>
      <main>
        {tab === 'card' ? (
          <>
            <input type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            {items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase())).map((i) => <Row key={i.id} item={i} />)}
          </>
        ) : (
          <>
            {valid.map((i) => <Row key={i.id} item={i} />)}
            {upcoming.length > 0 && <h2 className="section">Not yet valid</h2>}
            {upcoming.map((i) => <Row key={i.id} item={i} dim />)}
            <button className="link" onClick={() => setShowArchive(!showArchive)}>
              {showArchive ? 'Hide' : 'Show'} archive ({archive.length})
            </button>
            {showArchive && archive.map((i) => <Row key={i.id} item={i} dim />)}
          </>
        )}
      </main>
      <button className="fab" onClick={() => go(`/add?kind=${tab}`)}>+ Add {tab}</button>
    </>
  );
}
