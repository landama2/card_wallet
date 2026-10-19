import { Stack } from 'expo-router';

export default function Root() {
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="add" options={{ title: 'Add' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="item/[id]" options={{ title: '' }} />
    </Stack>
  );
}
