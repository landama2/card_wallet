import { useCallback, useState } from 'react';
import { Button, ScrollView, Text, View } from 'react-native';
import { Link, useFocusEffect } from 'expo-router';
import Row from '../../src/Row';
import { listItems } from '../../src/db';
import { Item, isArchived } from '../../src/logic';

export default function Tickets() {
  const [items, setItems] = useState<Item[]>([]);
  const [showArchive, setShowArchive] = useState(false);
  useFocusEffect(useCallback(() => { setItems(listItems().filter((i) => i.kind === 'ticket')); }, []));
  const now = Date.now();
  const active = items.filter((i) => !isArchived(i, now)).sort((a, b) => (a.expires_at ?? Infinity) - (b.expires_at ?? Infinity));
  const archive = items.filter((i) => isArchived(i, now)).sort((a, b) => (b.expires_at ?? 0) - (a.expires_at ?? 0));
  return (
    <View style={{ flex: 1 }}>
      <ScrollView>
        {active.map((i) => <Row key={i.id} item={i} />)}
        <Button title={`${showArchive ? 'Hide' : 'Show'} archive (${archive.length})`} onPress={() => setShowArchive(!showArchive)} />
        {showArchive && archive.map((i) => <Row key={i.id} item={i} dim />)}
        {showArchive && archive.length === 0 && <Text style={{ padding: 16 }}>Archive is empty</Text>}
      </ScrollView>
      <Link href={{ pathname: '/add', params: { kind: 'ticket' } }} style={{ padding: 16, textAlign: 'center' }}>+ Add ticket</Link>
    </View>
  );
}
