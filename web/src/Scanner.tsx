import { useEffect, useRef } from 'react';
import { detect } from './detect';
import type { Format } from './logic';

type Props = { onResult: (r: { code: string; format: Format }) => void; onCancel: () => void };

export default function Scanner({ onResult, onCancel }: Props) {
  const video = useRef<HTMLVideoElement>(null);
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
        tick();
      })
      .catch(() => { if (!done) { alert('Camera unavailable. Enter the code manually.'); onCancel(); } });
    return () => { done = true; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, []);
  return (
    <div className="scanner">
      <video ref={video} playsInline muted />
      <div className="frame" aria-hidden="true" />
      <p className="hint-text">Point the camera at the barcode or QR code</p>
      <button className="cancel" onClick={onCancel}>Cancel</button>
    </div>
  );
}
