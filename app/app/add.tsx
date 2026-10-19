import { useEffect, useState } from 'react';
import { Alert, Button, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as ImagePicker from 'expo-image-picker';
import { DateTimePickerAndroid } from '@react-native-community/datetimepicker';
import { FORMATS, Format, validateCode } from '../src/logic';
import { getItem, insertItem } from '../src/db';
import { schedule } from '../src/reminders';
import { decodeImage } from '../src/decode';

export default function Add() {
  const { kind = 'card', sharedPath, sharedMime } =
    useLocalSearchParams<{ kind?: 'card' | 'ticket'; sharedPath?: string; sharedMime?: string }>();
  const router = useRouter();
  const [perm, requestPerm] = useCameraPermissions();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [format, setFormat] = useState<Format>('qr');
  const [expires, setExpires] = useState<Date | null>(null);
  const [scanning, setScanning] = useState(false);

  const importImage = async (uri: string) => {
    const r = await decodeImage(uri).catch(() => null);
    if (!r) return Alert.alert('No code found', 'Enter the code manually.');
    setCode(r.code);
    setFormat(r.format);
  };

  useEffect(() => {
    if (!sharedPath) return;
    if (sharedMime?.startsWith('image/')) void importImage(sharedPath);
    else Alert.alert('Cannot read this file', 'PDF codes cannot be decoded. Enter the code manually.');
  }, [sharedPath]);

  const startScan = async () => {
    if (!perm?.granted && !(await requestPerm()).granted) {
      return Alert.alert('Camera denied', 'Enter the code manually.');
    }
    setScanning(true);
  };

  const pickImage = async () => {
    const r = await ImagePicker.launchImageLibraryAsync({ mediaTypes: ['images'] });
    if (!r.canceled) await importImage(r.assets[0].uri);
  };

  const pickExpiry = () =>
    DateTimePickerAndroid.open({
      value: expires ?? new Date(), mode: 'date',
      onChange: (e, d) => {
        if (e.type !== 'set' || !d) return;
        DateTimePickerAndroid.open({
          value: d, mode: 'time', is24Hour: true,
          onChange: (e2, t) => { if (e2.type === 'set' && t) setExpires(t); },
        });
      },
    });

  const doSave = async () => {
    const id = insertItem({
      kind, name: name.trim(), code: code.trim(), format, color: null, note: null,
      expires_at: kind === 'ticket' ? expires!.getTime() : null, notify_id: null, created_at: Date.now(),
    });
    await schedule(getItem(id)!);
    router.back();
  };

  const save = () => {
    if (!name.trim()) return Alert.alert('Name is required');
    const err = validateCode(format, code.trim());
    if (err) return Alert.alert('Invalid code', err);
    if (kind === 'ticket' && !expires) return Alert.alert('Pick an expiry date');
    if (kind === 'ticket' && expires!.getTime() < Date.now()) {
      return Alert.alert('Already expired', 'Save anyway?', [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: doSave },
      ]);
    }
    void doSave();
  };

  if (scanning) {
    return (
      <View style={{ flex: 1 }}>
        <CameraView
          style={{ flex: 1 }}
          barcodeScannerSettings={{ barcodeTypes: [...FORMATS] }}
          onBarcodeScanned={({ type, data }) => {
            if ((FORMATS as readonly string[]).includes(type)) {
              setCode(data); setFormat(type as Format); setScanning(false);
            }
          }}
        />
        <Button title="Cancel" onPress={() => setScanning(false)} />
      </View>
    );
  }

  return (
    <ScrollView contentContainerStyle={{ padding: 16, gap: 12 }}>
      <TextInput placeholder="Name" value={name} onChangeText={setName} style={{ borderBottomWidth: 1 }} />
      <TextInput placeholder="Code / number" value={code} onChangeText={setCode} style={{ borderBottomWidth: 1 }} />
      <ScrollView horizontal>
        {FORMATS.map((f) => (
          <Pressable key={f} onPress={() => setFormat(f)} style={{ padding: 8, margin: 2, backgroundColor: f === format ? '#9cf' : '#eee' }}>
            <Text>{f}</Text>
          </Pressable>
        ))}
      </ScrollView>
      {kind === 'ticket' && <Button title={expires ? expires.toLocaleString() : 'Pick expiry'} onPress={pickExpiry} />}
      <Button title="Scan with camera" onPress={startScan} />
      <Button title="Import from image" onPress={pickImage} />
      <Button title="Save" onPress={save} />
    </ScrollView>
  );
}
