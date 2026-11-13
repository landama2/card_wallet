import { useState } from 'react';
import Icon from '../Icon';
import Logo from '../Logo';
import { go } from '../route';
import { CATEGORIES, STORES, type Store, searchStores } from '../stores';

const ALL = Object.values(STORES).flat();
const addCard = (name: string, picked = false) =>
  go(`/add?kind=card&name=${encodeURIComponent(name)}${picked ? '&picked=1' : ''}`);

// New card, step 1: choose the store (or a custom card); the Add form then only asks for the code.
export default function Picker({ initialQuery = '' }: { initialQuery?: string }) {
  const [q, setQ] = useState(initialQuery);
  const [cat, setCat] = useState<string | null>(null);
  const query = q.trim();
  const found = searchStores(query, cat ? ALL.filter((s) => s.cat === cat) : ALL);

  return (
    <div className="screen">
      <header className="subbar">
        <button className="icon-btn" aria-label="Back" onClick={() => go('/cards')}><Icon name="back" /></button>
        <h1>Add a card</h1>
      </header>
      <main className="form picker">
        <label className="search">
          <Icon name="search" size={20} />
          <input type="search" placeholder={`Search ${ALL.length} stores`} aria-label="Search stores" value={q} onChange={(e) => setQ(e.target.value)} autoFocus={!!initialQuery} />
        </label>
        <div className="chips" role="group" aria-label="Category">
          {[null, ...CATEGORIES].map((c) => (
            <button key={c ?? 'all'} aria-pressed={cat === c} onClick={() => setCat(c)}>{c ?? 'All'}</button>
          ))}
        </div>

        {query ? (
          <>
            <h2 className="section-label">{found.length === 1 ? '1 store' : `${found.length} stores`}</h2>
            {found.map((s) => <StoreRow key={s.name} s={s} />)}
            <button className="row-card custom" onClick={() => addCard(query)}>
              <span className="plus-mark" aria-hidden><Icon name="plus" size={20} /></span>
              <span className="text">
                <span className="name">Add “{query}” as a custom card</span>
                <span className="sub">Not in the list? Any card with a code works.</span>
              </span>
            </button>
          </>
        ) : (
          <div className="store-grid">
            <button className="store-tile custom" onClick={() => addCard('')}>
              <span className="plus-mark" aria-hidden><Icon name="plus" size={20} /></span>
              <span className="name">Custom card</span>
            </button>
            {found.map((s) => (
              <button key={s.name} className="store-tile" style={{ background: s.color, '--store': s.color } as React.CSSProperties} onClick={() => addCard(s.name, true)}>
                <Logo name={s.name} domain={s.domain ?? null} mark />
                <span className="name">{s.name}</span>
              </button>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

function StoreRow({ s }: { s: Store }) {
  return (
    <button className="row-card" onClick={() => addCard(s.name, true)}>
      <span className="store-swatch" style={{ background: s.color, '--store': s.color } as React.CSSProperties}><Logo name={s.name} domain={s.domain ?? null} mark /></span>
      <span className="text">
        <span className="name">{s.name}</span>
        <span className="sub">{s.cat}</span>
      </span>
      <Icon name="chevron" size={20} />
    </button>
  );
}
