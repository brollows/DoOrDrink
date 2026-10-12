import { useMemo } from 'react';
import { encode } from 'uqr';

// Light margin around the code; scanners need it to find the edges.
const quietZone = 2;

/** QR code as crisp SVG. Always dark on white so every phone camera can read it. */
export function QrCode({ value, label }: { value: string; label: string }) {
  const { path, size } = useMemo(() => {
    const { data, size } = encode(value, { ecc: 'M', border: 0 });
    let path = '';
    data.forEach((row, y) => row.forEach((dark, x) => { if (dark) path += `M${x} ${y}h1v1h-1z`; }));
    return { path, size };
  }, [value]);

  const box = size + quietZone * 2;
  return (
    <svg className="qr-code" viewBox={`${-quietZone} ${-quietZone} ${box} ${box}`} role="img" aria-label={label} shapeRendering="crispEdges">
      <path d={path} />
    </svg>
  );
}

export function joinUrl(code: string) {
  return `${window.location.origin}/join/${code}`;
}
