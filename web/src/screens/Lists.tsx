import { useState } from 'react';
import { listItems } from '../db';
import { type Item, isArchived } from '../logic';
import { go } from '../route';

function Row({ item, dim }: { item: Item; dim?: boolean }) {
  return (
    <button className={'row' + (dim ? ' dim' : '')} onClick={() => go(`/item/${item.id}`)}>
      <span className="name">{item.name}</span>
      {item.expires_at != null && <span className="sub">{new Date(item.expires_at).toLocaleString()}</span>}
    </button>
  );
}

export default function Lists({ tab }: { tab: 'cards' | 'tickets' }) {
  const [q, setQ] = useState('');
  const [showArchive, setShowArchive] = useState(false);
  const items = listItems();
  const now = Date.now();
  const cards = items.filter((i) => i.kind === 'card' && i.name.toLowerCase().includes(q.toLowerCase()));
  const tickets = items.filter((i) => i.kind === 'ticket');
  const active = tickets.filter((i) => !isArchived(i, now)).sort((a, b) => (a.expires_at ?? Infinity) - (b.expires_at ?? Infinity));
  const archive = tickets.filter((i) => isArchived(i, now)).sort((a, b) => (b.expires_at ?? 0) - (a.expires_at ?? 0));
  const kind = tab === 'cards' ? 'card' : 'ticket';
  return (
    <>
      <header className="tabs">
        <button className={tab === 'cards' ? 'on' : ''} onClick={() => go('/cards')}>Cards</button>
        <button className={tab === 'tickets' ? 'on' : ''} onClick={() => go('/tickets')}>Tickets</button>
        <button onClick={() => go('/settings')} aria-label="Settings">⚙</button>
      </header>
      <main>
        {tab === 'cards' ? (
          <>
            <input type="search" placeholder="Search" value={q} onChange={(e) => setQ(e.target.value)} />
            {cards.map((i) => <Row key={i.id} item={i} />)}
          </>
        ) : (
          <>
            {active.map((i) => <Row key={i.id} item={i} />)}
            <button className="link" onClick={() => setShowArchive(!showArchive)}>
              {showArchive ? 'Hide' : 'Show'} archive ({archive.length})
            </button>
            {showArchive && archive.map((i) => <Row key={i.id} item={i} dim />)}
          </>
        )}
      </main>
      <button className="fab" onClick={() => go(`/add?kind=${kind}`)}>+ Add {kind}</button>
    </>
  );
}
