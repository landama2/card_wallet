import { useEffect } from 'react';
import { Stack, useRouter } from 'expo-router';
import { ShareIntentProvider, useShareIntentContext } from 'expo-share-intent';

function Routes() {
  const router = useRouter();
  const { hasShareIntent, shareIntent, resetShareIntent } = useShareIntentContext();
  useEffect(() => {
    if (!hasShareIntent) return;
    const f = shareIntent.files?.[0];
    if (f) router.push({ pathname: '/add', params: { kind: 'ticket', sharedPath: f.path, sharedMime: f.mimeType } });
    resetShareIntent();
  }, [hasShareIntent]);
  return (
    <Stack>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="add" options={{ title: 'Add' }} />
      <Stack.Screen name="settings" options={{ title: 'Settings' }} />
      <Stack.Screen name="item/[id]" options={{ title: '' }} />
    </Stack>
  );
}

export default function Root() {
  return (
    <ShareIntentProvider>
      <Routes />
    </ShareIntentProvider>
  );
}
