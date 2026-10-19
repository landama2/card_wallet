import { useState } from 'react';
import { Alert, Button, Text, View } from 'react-native';
import { exportBackup, pickBackup, applyImport } from '../src/backup';
import { DAY, getLead, setLead } from '../src/reminders';

const LEADS = [['1 hour', DAY / 24], ['1 day', DAY], ['3 days', 3 * DAY]] as const;

export default function Settings() {
  const [lead, setLeadState] = useState(getLead());

  const doImport = async () => {
    try {
      const items = await pickBackup();
      if (!items) return;
      Alert.alert('Import', `${items.length} items found.`, [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Merge', onPress: () => applyImport(items, 'merge') },
        { text: 'Replace all', style: 'destructive', onPress: () => applyImport(items, 'replace') },
      ]);
    } catch (e) {
      Alert.alert('Import failed', String(e));
    }
  };

  return (
    <View style={{ padding: 16, gap: 12 }}>
      <Button title="Export backup" onPress={exportBackup} />
      <Button title="Import backup" onPress={doImport} />
      <Text style={{ marginTop: 16 }}>Remind me before a ticket expires:</Text>
      {LEADS.map(([label, ms]) => (
        <Button key={label} title={(lead === ms ? '● ' : '○ ') + label} onPress={() => { setLead(ms); setLeadState(ms); }} />
      ))}
    </View>
  );
}
