import { useEffect, useState } from 'react';
import CodeView from '../CodeView';
import { ask, askText, notify } from '../Dialog';
import Icon from '../Icon';
import Logo, { tileColor } from '../Logo';
import { deleteItem, getItem, updateItem } from '../db';
import { FORMAT_LABEL, statusChip, toDomain, validityLabel } from '../logic';
import { go } from '../route';

const KIND_LABEL = { card: 'Loyalty card', ticket: 'Ticket', coupon: 'Coupon' } as const;

export default function Detail({ id }: { id: number }) {
  const [rev, setRev] = useState(0); // bumped after an edit so the item is re-read from storage
  const item = getItem(id);
  const color = item ? tileColor(item.name) : null;

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

  // The phone's status bar takes the store colour too, while this screen is open.
  useEffect(() => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]');
    if (!meta || !color) return;
    const before = meta.content;
    meta.content = color;
    return () => { meta.content = before; };
  }, [color]);

  if (!item) {
    return (
      <div className="screen">
        <header className="subbar"><button className="icon-btn" aria-label="Back" onClick={() => go('/cards')}><Icon name="back" /></button></header>
        <p className="empty">This item no longer exists.</p>
      </div>
    );
  }

  const back = () => go(`/${item.kind}s`);
  const remove = async () => { if (await ask(`Delete ${item.name}?`, 'Delete', true)) { deleteItem(item.id); back(); } };
  const setLogo = async () => {
    const input = await askText('Store website for the logo (e.g. tesco.cz). Leave empty to remove.', item.domain ?? '');
    if (input === null) return;
    const domain = toDomain(input);
    if (input.trim() && !domain) return notify('Store website should look like tesco.cz');
    updateItem(item.id, { domain });
    setRev(rev + 1);
  };
  const chip = statusChip(item);

  return (
    <div className="detail" style={{ background: color! }}>
      <header className="subbar">
        <button className="glass" aria-label="Back" onClick={back}><Icon name="back" /></button>
      </header>
      <div className="store">
        <Logo name={item.name} domain={item.domain ?? null} mark />
        <div>
          <h1>{item.name}</h1>
          <div className="sub">{[item.note, validityLabel(item)].filter(Boolean).join(' · ') || KIND_LABEL[item.kind]}</div>
        </div>
      </div>
      <div className="sheet">
        {chip && <span className={`chip status ${chip.tone}`}>{chip.text}</span>}
        <div className="code-card">
          <CodeView code={item.code} format={item.format} editHref={`#/edit/${item.id}`} />
          <p className="codetext">{item.code}</p>
          <span className="format-label">{FORMAT_LABEL[item.format]}</span>
        </div>
        <p className="tip"><Icon name="sun" /> Turn the screen brightness up if the till can't read it. The screen stays on while this is open.</p>
        <div className="actions">
          <button className="action" onClick={() => go(`/edit/${item.id}`)}><Icon name="edit" size={20} />Edit</button>
          <button className="action" onClick={setLogo}><Icon name="image" size={20} />Logo</button>
          <button className="action danger" onClick={remove}><Icon name="trash" size={20} />Delete</button>
        </div>
      </div>
    </div>
  );
}
