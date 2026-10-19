import type { Item, NewItem } from './logic';

// ponytail: whole list rewritten on every change; fine for a personal wallet (hundreds of items).
const KEY = 'wallet.items';

export const listItems = (): Item[] => JSON.parse(localStorage.getItem(KEY) ?? '[]');
const save = (items: Item[]) => localStorage.setItem(KEY, JSON.stringify(items));

export const getItem = (id: number) => listItems().find((i) => i.id === id) ?? null;

export function insertItem(n: NewItem): number {
  const items = listItems();
  const id = Math.max(0, ...items.map((i) => i.id)) + 1;
  save([{ ...n, id }, ...items]);
  return id;
}

export const deleteItem = (id: number) => save(listItems().filter((i) => i.id !== id));

export const updateItem = (id: number, patch: Partial<NewItem>) =>
  save(listItems().map((i) => (i.id === id ? { ...i, ...patch } : i)));

export function insertMany(ns: NewItem[], replace: boolean) {
  const items = replace ? [] : listItems();
  let id = Math.max(0, ...items.map((i) => i.id));
  save([...ns.map((n) => ({ ...n, id: ++id })), ...items]);
}
