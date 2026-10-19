import { Link, Tabs } from 'expo-router';

export default function TabsLayout() {
  return (
    <Tabs screenOptions={{ headerRight: () => <Link href="/settings" style={{ marginRight: 16 }}>Settings</Link> }}>
      <Tabs.Screen name="index" options={{ title: 'Cards' }} />
      <Tabs.Screen name="tickets" options={{ title: 'Tickets' }} />
    </Tabs>
  );
}
