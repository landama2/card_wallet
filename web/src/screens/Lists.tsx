import { useState } from 'react';
import Icon, { type IconName } from '../Icon';
import Logo, { tileColor } from '../Logo';
import { listItems } from '../db';
import { type Item, type Kind, KINDS, byRecent, isArchived, isUpcoming, statusChip } from '../logic';
import { go } from '../route';

const TITLE: Record<Kind, string> = { card: 'Wallet', ticket: 'Tickets', coupon: 'Coupons' };
const TAB: Record<Kind, { label: string; icon: IconName }> = {
  card: { label: 'Cards', icon: 'card' }, ticket: { label: 'Tickets', icon: 'ticket' }, coupon: { label: 'Coupons', icon: 'coupon' },
};
const EMPTY: Record<Kind, string> = {
  card: 'No cards yet. Tap + to scan or import your first loyalty card.',
  ticket: 'No tickets. Tap + to add one; it moves to the archive when it expires.',
  coupon: 'No coupons. Tap + and import a screenshot: the store and dates are filled in for you.',
};

function Tile({ item }: { item: Item }) {
  return (
    <button className="tile" style={{ background: tileColor(item.name) }} onClick={() => go(`/item/${item.id}`)}>
      <Logo name={item.name} domain={item.domain ?? null} mark />
      <span className="name">{item.name}</span>
    </button>
  );
}

function Row({ item, now, look }: { item: Item; now: number; look?: 'upcoming' | 'dim' }) {
  const chip = statusChip(item, now);
  return (
    <button className={'row-card' + (look ? ` ${look}` : '')} onClick={() => go(`/item/${item.id}`)}>
      <Logo name={item.name} domain={item.domain ?? null} />
      <span className="text">
        <span className="name">{item.name}</span>
        {item.note && <span className="sub">{item.note}</span>}
      </span>
      {chip && <span className={`chip ${chip.tone}`}>{chip.text}</span>}
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
  const cards = items.filter((i) => i.name.toLowerCase().includes(q.trim().toLowerCase())).sort(byRecent);
  return (
    <div className="screen">
      <header className="topbar">
        <h1>{TITLE[tab]}</h1>
        <button className="icon-btn" aria-label="Settings" onClick={() => go('/settings')}><Icon name="settings" /></button>
      </header>

      <main className="content">
        {items.length === 0 && <p className="empty">{EMPTY[tab]}</p>}
        {tab === 'card' && items.length > 0 && (
          <>
            <label className="search">
              <Icon name="search" size={20} />
              <input type="search" placeholder="Search cards" aria-label="Search cards" value={q} onChange={(e) => setQ(e.target.value)} />
            </label>
            <h2 className="section-label">Loyalty cards · {cards.length}</h2>
            <div className="tiles">{cards.map((i) => <Tile key={i.id} item={i} />)}</div>
          </>
        )}
        {tab !== 'card' && items.length > 0 && (
          <>
            {valid.length > 0 && <h2 className="section-label">Valid now</h2>}
            {valid.map((i) => <Row key={i.id} item={i} now={now} />)}
            {upcoming.length > 0 && <h2 className="section-label">Not yet valid</h2>}
            {upcoming.map((i) => <Row key={i.id} item={i} now={now} look="upcoming" />)}
            {archive.length > 0 && (
              <button className="link-btn" aria-expanded={showArchive} onClick={() => setShowArchive(!showArchive)}>
                {showArchive ? 'Hide' : 'Show'} expired ({archive.length}) <Icon name="chevron" size={18} />
              </button>
            )}
            {showArchive && archive.map((i) => <Row key={i.id} item={i} now={now} look="dim" />)}
          </>
        )}
      </main>

      <button className="fab" aria-label={`Add ${tab}`} onClick={() => go(`/add?kind=${tab}`)}><Icon name="plus" size={26} /></button>

      <nav className="tabbar" aria-label="Sections">
        {KINDS.map((k) => (
          <button key={k} className={'tab' + (k === tab ? ' on' : '')} aria-current={k === tab ? 'page' : undefined} onClick={() => go(`/${k}s`)}>
            <Icon name={TAB[k].icon} size={24} />
            {TAB[k].label}
          </button>
        ))}
      </nav>
    </div>
  );
}
