import { Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import type { Item } from './logic';

export default function Row({ item, dim }: { item: Item; dim?: boolean }) {
  const router = useRouter();
  return (
    <Pressable
      onPress={() => router.push(`/item/${item.id}`)}
      style={{ padding: 16, borderBottomWidth: 1, borderColor: '#ddd', opacity: dim ? 0.4 : 1 }}
    >
      <Text style={{ fontSize: 18 }}>{item.name}</Text>
      {item.expires_at != null && <Text>{new Date(item.expires_at).toLocaleString()}</Text>}
    </Pressable>
  );
}
