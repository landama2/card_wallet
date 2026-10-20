import { useEffect, useRef, useState } from 'react';
import Icon from './Icon';
import { detect } from './detect';
import type { Format } from './logic';

type Props = { onResult: (r: { code: string; format: Format }) => void; onCancel: () => void; onManual: () => void };

export default function Scanner({ onResult, onCancel, onManual }: Props) {
  const video = useRef<HTMLVideoElement>(null);
  const [track, setTrack] = useState<MediaStreamTrack | null>(null);
  const [torch, setTorch] = useState(false);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let stream: MediaStream | undefined;
    let timer: number | undefined;
    let done = false;
    const tick = async () => {
      if (done) return;
      const r = await detect(video.current!).catch(() => null);
      if (r && !done) { done = true; onResult(r); } else timer = window.setTimeout(tick, 250);
    };
    navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } })
      .then(async (s) => {
        stream = s;
        if (done) { s.getTracks().forEach((t) => t.stop()); return; }
        video.current!.srcObject = s;
        await video.current!.play();
        setTrack(s.getVideoTracks()[0]);
        tick();
      })
      .catch(() => { if (!done) setFailed(true); });
    return () => { done = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  // Torch: Chrome on Android only; the button appears only where the camera reports one.
  const hasTorch = !!(track?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch;
  const toggleTorch = () =>
    track!.applyConstraints({ advanced: [{ torch: !torch } as unknown as MediaTrackConstraintSet] }).then(() => setTorch(!torch)).catch(() => {});
  return (
    <div className="scanner">
      <video ref={video} playsInline muted />
      {failed
        ? <p className="hint-text">Camera unavailable. Type the code instead.</p>
        : <><div className="frame" aria-hidden="true" /><p className="hint-text">Point the camera at the barcode or QR code</p></>}
      <div className="scanner-actions">
        {hasTorch && (
          <button className="glass" aria-label="Light" aria-pressed={torch} onClick={toggleTorch}><Icon name="sun" /></button>
        )}
        <button onClick={onManual}>Type the code</button>
        <button onClick={onCancel}>Cancel</button>
      </div>
    </div>
  );
}
