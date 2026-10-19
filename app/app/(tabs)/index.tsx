import { useCallback, useState } from 'react';
import { FlatList, TextInput, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import Row from '../../src/Row';
import { listItems } from '../../src/db';
import type { Item } from '../../src/logic';

export default function Cards() {
  const [items, setItems] = useState<Item[]>([]);
  const [q, setQ] = useState('');
  useFocusEffect(useCallback(() => { setItems(listItems().filter((i) => i.kind === 'card')); }, []));
  const shown = items.filter((i) => i.name.toLowerCase().includes(q.toLowerCase()));
  return (
    <View style={{ flex: 1 }}>
      <TextInput placeholder="Search" value={q} onChangeText={setQ} style={{ padding: 12, borderBottomWidth: 1 }} />
      <FlatList data={shown} keyExtractor={(i) => String(i.id)} renderItem={({ item }) => <Row item={item} />} />
      <Link href={{ pathname: '/add', params: { kind: 'card' } }} style={{ padding: 16, textAlign: 'center' }}>+ Add card</Link>
    </View>
  );
}
