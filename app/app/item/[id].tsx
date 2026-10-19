import { useEffect } from 'react';
import { Alert, Button, Text, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import * as Brightness from 'expo-brightness';
import { useKeepAwake } from 'expo-keep-awake';
import CodeView from '../../src/CodeView';
import { getItem, deleteItem } from '../../src/db';
import { cancel } from '../../src/reminders';
import { isArchived } from '../../src/logic';

export default function Detail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const router = useRouter();
  const item = getItem(Number(id));
  useKeepAwake();
  useEffect(() => {
    Brightness.setBrightnessAsync(1).catch(() => {});
    return () => { Brightness.restoreSystemBrightnessAsync().catch(() => {}); };
  }, []);

  if (!item) return <Text>Not found</Text>;

  const remove = () =>
    Alert.alert('Delete?', item.name, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => { await cancel(item); deleteItem(item.id); router.back(); } },
    ]);

  return (
    <View style={{ flex: 1, backgroundColor: '#fff' }}>
      <Text style={{ fontSize: 22, padding: 16 }}>{item.name}</Text>
      {isArchived(item) && <Text style={{ color: 'red', paddingHorizontal: 16 }}>Expired</Text>}
      <CodeView code={item.code} format={item.format} />
      <Text selectable style={{ textAlign: 'center', padding: 8 }}>{item.code}</Text>
      <Button title="Delete" color="red" onPress={remove} />
    </View>
  );
}
