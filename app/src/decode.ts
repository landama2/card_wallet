import { Camera } from 'expo-camera';
import { FORMATS, Format } from './logic';

export async function decodeImage(uri: string): Promise<{ code: string; format: Format } | null> {
  const results = await Camera.scanFromURLAsync(uri, [...FORMATS]);
  const r = results.find((x) => (FORMATS as readonly string[]).includes(x.type));
  return r ? { code: r.data, format: r.type as Format } : null;
}
