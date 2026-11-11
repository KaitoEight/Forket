import { useCallback, useEffect, useRef, useState } from 'react';

import { buildMapHtml } from './map/mapHtml';
import { DEFAULT_CENTER, DEFAULT_ZOOM, type FoodMapProps, type MapCommand } from './map/types';
import { useMapBridge } from './map/useMapBridge';

export * from './map/types';

// Web: cùng bản đồ MapLibre nhưng chạy trong iframe
export default function FreeFoodMap(props: FoodMapProps) {
  const { initialCenter = DEFAULT_CENTER, initialZoom = DEFAULT_ZOOM } = props;
  const frameRef = useRef<HTMLIFrameElement>(null);
  const [html] = useState(() => buildMapHtml(initialCenter, initialZoom));

  const deliver = useCallback((cmd: MapCommand) => {
    frameRef.current?.contentWindow?.postMessage({ __focketCmd: cmd }, '*');
  }, []);

  const handleRaw = useMapBridge(props, deliver);

  useEffect(() => {
    const listener = (e: MessageEvent) => {
      if (e.source !== frameRef.current?.contentWindow) return;
      if (e.data && typeof e.data.__focketMap === 'string') handleRaw(e.data.__focketMap);
    };
    window.addEventListener('message', listener);
    return () => window.removeEventListener('message', listener);
  }, [handleRaw]);

  return (
    <iframe
      ref={frameRef}
      title="Bản đồ quán ăn"
      srcDoc={html}
      style={{ border: 0, width: '100%', height: '100%', flex: 1 }}
    />
  );
}
