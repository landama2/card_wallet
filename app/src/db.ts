import * as SQLite from 'expo-sqlite';
import type { Item, NewItem } from './logic';

const db = SQLite.openDatabaseSync('wallet.db');
db.execSync(`CREATE TABLE IF NOT EXISTS items (
  id INTEGER PRIMARY KEY AUTOINCREMENT, kind TEXT NOT NULL, name TEXT NOT NULL,
  code TEXT NOT NULL, format TEXT NOT NULL, color TEXT, note TEXT,
  expires_at INTEGER, notify_id TEXT, created_at INTEGER NOT NULL)`);

export const listItems = () => db.getAllSync<Item>('SELECT * FROM items ORDER BY created_at DESC');
export const getItem = (id: number) => db.getFirstSync<Item>('SELECT * FROM items WHERE id = ?', id);
export const insertItem = (i: NewItem) =>
  db.runSync(
    'INSERT INTO items (kind,name,code,format,color,note,expires_at,notify_id,created_at) VALUES (?,?,?,?,?,?,?,?,?)',
    i.kind, i.name, i.code, i.format, i.color, i.note, i.expires_at, i.notify_id, i.created_at,
  ).lastInsertRowId;
export const setNotifyId = (id: number, nid: string | null) =>
  db.runSync('UPDATE items SET notify_id = ? WHERE id = ?', nid, id);
export const deleteItem = (id: number) => db.runSync('DELETE FROM items WHERE id = ?', id);
export const deleteAll = () => db.runSync('DELETE FROM items');
