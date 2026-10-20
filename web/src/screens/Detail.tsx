import { useEffect, useState } from 'react';
import CodeView from '../CodeView';
import { ask, askText, notify, toast } from '../Dialog';
import Icon from '../Icon';
import Logo, { tileColor } from '../Logo';
import { deleteItem, getItem, restoreItem, updateItem } from '../db';
import { FORMAT_LABEL, LINEAR, receiptFacts, statusChip, toDomain, validityLabel } from '../logic';
import { deletePhoto, getPhoto, putPhoto, shrinkPhoto } from '../photos';
import { closeOverlay, go, openOverlay } from '../route';

const KIND_LABEL = { card: 'Loyalty card', ticket: 'Ticket', coupon: 'Coupon', receipt: 'Receipt' } as const;

export default function Detail({ id, till, photoOpen }: { id: number; till: boolean; photoOpen: boolean }) {
  const [rev, setRev] = useState(0); // bumped after an edit so the item is re-read from storage
  const [photo, setPhoto] = useState<string | null>(null); // object URL of the stored photo
  const [showPhoto, setShowPhoto] = useState(false); // the "Original photo" row is collapsed until tapped
  const [zoomed, setZoomed] = useState(false);
  useEffect(() => {
    let url: string | undefined;
    let gone = false;
    getPhoto(id).then((b) => { if (!gone && b) setPhoto(url = URL.createObjectURL(b)); else if (!gone) setPhoto(null); })
      .catch(() => { if (!gone) setPhoto(null); }); // unreadable = treated as none; "Add photo" replaces it
    return () => { gone = true; if (url) URL.revokeObjectURL(url); };
  }, [id, rev]);
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

  useEffect(() => { updateItem(id, { last_used_at: Date.now() }); }, [id]); // puts this card first on the list

  // The phone's status bar takes the store colour too, while this screen is open (both light and dark metas).
  useEffect(() => {
    if (!color) return;
    const metas = [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')];
    const before = metas.map((m) => m.content);
    metas.forEach((m) => { m.content = color; });
    return () => metas.forEach((m, i) => { m.content = before[i]; });
  }, [color]);

  // Esc closes till mode on desktop; on the phone it's Back or a tap.
  useEffect(() => {
    if (!till && !photoOpen) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') closeOverlay(); };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [till, photoOpen]);
  useEffect(() => { if (!photoOpen) setZoomed(false); }, [photoOpen]);

  // ponytail: StrictMode runs this initializer twice in dev, so the tip disappears after 2 dev views; fine in prod.
  const [showTip] = useState(() => {
    const n = Number(localStorage.getItem('wallet.tipViews') ?? 0) + 1;
    localStorage.setItem('wallet.tipViews', String(n));
    return n <= 3;
  });

  if (!item) {
    return (
      <div className="screen">
        <header className="subbar"><button className="icon-btn" aria-label="Back" onClick={() => go('/cards')}><Icon name="back" /></button></header>
        <p className="empty">This item no longer exists.</p>
      </div>
    );
  }

  const back = () => go(`/${item.kind}s`);
  const remove = async () => {
    const blob = await getPhoto(item.id).catch(() => undefined); // held in memory for Undo
    deleteItem(item.id);
    deletePhoto(item.id).catch(() => {});
    back();
    toast(`Deleted ${item.name}`, 'Undo', () => {
      const newId = restoreItem(item);
      if (blob) putPhoto(newId, blob).catch(() => {});
      go(`/item/${newId}`);
    });
  };
  const pickPhoto = async (f: File | undefined) => {
    if (!f) return;
    try { await putPhoto(item.id, await shrinkPhoto(f)); setShowPhoto(true); setRev((r) => r + 1); }
    catch { notify("The photo couldn't be saved."); }
  };
  const removePhoto = async () => {
    if (!(await ask('Remove the photo? The item stays.', 'Remove', true))) return;
    await deletePhoto(item.id).catch(() => {});
    setRev((r) => r + 1);
  };
  const photoInput = <input type="file" accept="image/*" className="sr-only" onChange={(e) => { pickPhoto(e.target.files?.[0]); e.target.value = ''; }} />;
  const noCode = item.kind === 'receipt' && !item.code;
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
          <div className="sub">{[item.note, receiptFacts(item), validityLabel(item)].filter(Boolean).join(' · ') || KIND_LABEL[item.kind]}</div>
        </div>
      </div>
      <div className="sheet">
        {chip && <span className={`chip status ${chip.tone}`}>{chip.text}</span>}
        {noCode ? (
          photo && (
            <button className="photo-card" aria-label="Show photo full screen" onClick={() => openOverlay('photo')}>
              <img src={photo} alt="" />
            </button>
          )
        ) : (
          <>
            <div className="code-card" role="button" tabIndex={0} aria-label="Show code full screen"
              onClick={() => openOverlay('till')} onKeyDown={(e) => { if (e.target !== e.currentTarget || (e.key !== 'Enter' && e.key !== ' ')) return; e.preventDefault(); openOverlay('till'); }}>
              <CodeView code={item.code} format={item.format} editHref={`#/edit/${item.id}`} />
              <p className="codetext">{item.code}</p>
              <span className="format-label">{FORMAT_LABEL[item.format]} · tap for full screen</span>
            </div>
            {showTip && <p className="tip"><Icon name="sun" /> Turn the screen brightness up if the till can't read it. The screen stays on while this is open.</p>}
          </>
        )}
        {photo ? (
          <div className="photo-row">
            <button className="link-btn" aria-expanded={showPhoto || noCode} onClick={() => setShowPhoto(!showPhoto)}>
              Original photo <Icon name="chevron" size={18} />
            </button>
            {(showPhoto || noCode) && (
              <div className="photo-body">
                {!noCode && <button className="photo-thumb" aria-label="Show photo full screen" onClick={() => openOverlay('photo')}><img src={photo} alt="" /></button>}
                <div className="row">
                  <label className="secondary">Replace{photoInput}</label>
                  <button className="secondary danger-text" onClick={removePhoto}>Remove</button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <label className="link-btn photo-add"><Icon name="image" size={18} />Add photo{photoInput}</label>
        )}
        <div className="actions">
          <button className="action" onClick={() => go(`/edit/${item.id}`)}><Icon name="edit" size={20} />Edit</button>
          <button className="action" onClick={setLogo}><Icon name="image" size={20} />Logo</button>
          <button className="action danger" onClick={remove}><Icon name="trash" size={20} />Delete</button>
        </div>
      </div>
      {till && (
        <div className={'till' + (LINEAR.has(item.format) ? ' linear' : '')} role="dialog" aria-modal="true" aria-label={`${item.name} code`} onClick={closeOverlay}>
          <div className="till-code">
            <CodeView code={item.code} format={item.format} />
            <p className="codetext">{item.code}</p>
          </div>
        </div>
      )}
      {photoOpen && photo && (
        <div className={'photo-view' + (zoomed ? ' zoomed' : '')} role="dialog" aria-modal="true" aria-label={`${item.name} photo`} onClick={closeOverlay}>
          <img src={photo} alt={`Photo of ${item.name}`} onClick={(e) => { e.stopPropagation(); setZoomed(!zoomed); }} />
        </div>
      )}
    </div>
  );
}
