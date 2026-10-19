import { File, Paths } from 'expo-file-system';
import * as Sharing from 'expo-sharing';
import * as DocumentPicker from 'expo-document-picker';
import { listItems, insertItem, getItem, deleteAll } from './db';
import { NewItem, serialize, parseImport, dedupe } from './logic';
import { cancel, schedule } from './reminders';

export async function exportBackup() {
  const f = new File(Paths.cache, 'wallet-backup.json');
  f.create({ overwrite: true });
  await f.write(serialize(listItems()));
  await Sharing.shareAsync(f.uri, { mimeType: 'application/json' });
}

export async function pickBackup(): Promise<NewItem[] | null> {
  const r = await DocumentPicker.getDocumentAsync({ type: '*/*', copyToCacheDirectory: true });
  if (r.canceled) return null;
  return parseImport(await new File(r.assets[0].uri).text());
}

export async function applyImport(items: NewItem[], mode: 'merge' | 'replace') {
  if (mode === 'replace') {
    for (const i of listItems()) await cancel(i);
    deleteAll();
  }
  const toAdd = mode === 'merge' ? dedupe(listItems(), items) : items;
  for (const n of toAdd) await schedule(getItem(insertItem(n))!);
}
