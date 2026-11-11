import { useEffect, useImperativeHandle, useRef, useState } from 'react';

import type { FoodMapProps, MapCommand, MapEvent } from './types';

/**
 * Logic dùng chung cho WebView (native) và iframe (web):
 * xếp hàng lệnh cho tới khi bản đồ sẵn sàng, đồng bộ props → bản đồ,
 * và chuyển sự kiện bản đồ → callback.
 */
export function useMapBridge(
  { places, selectedId = null, onSelect, onViewportChange, ref }: FoodMapProps,
  deliver: (cmd: MapCommand) => void
) {
  const [ready, setReady] = useState(false);
  const pending = useRef<MapCommand[]>([]);

  const post = (cmd: MapCommand) => {
    if (ready) deliver(cmd);
    else pending.current.push(cmd);
  };

  useImperativeHandle(ref, () => ({
    focus: (lat, lng, zoom, offsetY) => post({ type: 'focus', lat, lng, zoom, offsetY }),
    setUser: (lat, lng) => post({ type: 'user', lat, lng }),
  }));

  useEffect(() => {
    if (ready) deliver({ type: 'places', places });
  }, [ready, places, deliver]);

  useEffect(() => {
    if (ready) deliver({ type: 'selected', id: selectedId });
  }, [ready, selectedId, deliver]);

  const handleRaw = (raw: string) => {
    let msg: MapEvent;
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }
    switch (msg.type) {
      case 'ready':
        pending.current.splice(0).forEach(deliver);
        setReady(true);
        break;
      case 'viewport': {
        const { type: _type, ...viewport } = msg;
        onViewportChange?.(viewport);
        break;
      }
      case 'select':
        onSelect?.(msg.id);
        break;
    }
  };

  return handleRaw;
}
