import { colors } from '@/constants/theme';

import type { LatLng } from './types';

const MAPLIBRE = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.24.0';
// OpenFreeMap: bản đồ vector từ dữ liệu OpenStreetMap — miễn phí, KHÔNG cần API key,
// không giới hạn lượt dùng (https://openfreemap.org)
const STYLE_URL = 'https://tiles.openfreemap.org/styles/liberty';

/**
 * Trang HTML chứa bản đồ MapLibre GL. Chạy trong WebView (iOS/Android) hoặc iframe (web).
 *
 * Giao tiếp:
 *  - RN → bản đồ: window.__forket.handle(cmd)  (hoặc postMessage {__forketCmd})
 *  - bản đồ → RN: ReactNativeWebView.postMessage / parent.postMessage {__forketMap}
 */
export function buildMapHtml(center: LatLng, zoom: number) {
  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no" />
<link rel="stylesheet" href="${MAPLIBRE}/maplibre-gl.css" />
<style>
  html, body, #map { margin: 0; height: 100%; width: 100%; background: #f2efe9; }
  .maplibregl-ctrl-attrib { font-size: 9px; }
  .fm { position: relative; width: 60px; height: 60px; cursor: pointer; font-family: -apple-system, Roboto, sans-serif; }
  .fm.sel { width: 76px; height: 76px; }
  .fm-bubble {
    position: absolute; inset: 4px; border-radius: 16px; overflow: hidden;
    background: ${colors.caramelSoft}; border: 3px solid #fff; box-sizing: border-box;
    display: flex; align-items: center; justify-content: center; font-size: 22px;
    box-shadow: 0 3px 10px rgba(36,26,18,0.35);
  }
  .fm-bubble img { width: 100%; height: 100%; object-fit: cover; display: block; }
  .fm.sel .fm-bubble { border-color: ${colors.accent}; border-width: 4px; border-radius: 20px; }
  .fm-count {
    position: absolute; top: -2px; left: -2px; min-width: 20px; height: 20px; padding: 0 4px;
    border-radius: 10px; background: ${colors.accent}; color: #fff; border: 2px solid #fff;
    box-sizing: border-box; font: 800 10px/16px -apple-system, Roboto, sans-serif; text-align: center;
  }
  .fm-rating {
    position: absolute; bottom: -6px; left: 50%; transform: translateX(-50%);
    background: ${colors.caramel}; color: #fff; border: 2px solid #fff; border-radius: 9px;
    padding: 0 6px; font: 800 11px/16px -apple-system, Roboto, sans-serif; white-space: nowrap;
  }
  .fm-name {
    position: absolute; top: calc(100% + 10px); left: 50%; transform: translateX(-50%);
    max-width: 130px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;
    background: ${colors.surface}; color: ${colors.text}; border: 1px solid ${colors.border};
    border-radius: 8px; padding: 2px 8px; font: 700 11px/16px -apple-system, Roboto, sans-serif;
    box-shadow: 0 1px 4px rgba(36,26,18,0.2); pointer-events: none;
  }
  .fm.sel .fm-name { background: ${colors.accent}; color: #fff; border-color: ${colors.accent}; }
  .me {
    width: 16px; height: 16px; border-radius: 50%; background: #2F80ED;
    border: 3px solid #fff; box-shadow: 0 0 0 6px rgba(47,128,237,0.25);
  }
</style>
</head>
<body>
<div id="map"></div>
<script src="${MAPLIBRE}/maplibre-gl.js"></script>
<script>
(function () {
  function send(msg) {
    var s = JSON.stringify(msg);
    if (window.ReactNativeWebView) window.ReactNativeWebView.postMessage(s);
    else if (window.parent !== window) window.parent.postMessage({ __forketMap: s }, '*');
  }
  function esc(v) {
    return String(v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  var map = new maplibregl.Map({
    container: 'map',
    style: '${STYLE_URL}',
    center: [${center.longitude}, ${center.latitude}],
    zoom: ${zoom},
    attributionControl: { compact: true },
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false
  });
  map.touchZoomRotate.disableRotation();

  var markers = {};      // id -> { marker, el, p, key }
  var selectedId = null;
  var userMarker = null;

  function render(el, p, sel) {
    el.className = 'fm' + (sel ? ' sel' : '');
    el.style.zIndex = sel ? 1000 : Math.min(p.post_count + Math.round((p.avg_rating || 0) * 10), 999);
    var inner = p.cover_url ? '<img src="' + esc(p.cover_url) + '" />' : '🍜';
    var count = p.post_count > 1
      ? '<span class="fm-count">' + (p.post_count > 99 ? '99+' : p.post_count) + '</span>'
      : '';
    var rating = p.avg_rating != null
      ? '<span class="fm-rating">' + Number(p.avg_rating).toFixed(1) + ' ★</span>'
      : '';
    var name = '<span class="fm-name">' + esc(p.name) + '</span>';
    el.innerHTML = '<div class="fm-bubble">' + inner + '</div>' + count + rating + name;
  }

  function setPlaces(list) {
    var seen = {};
    list.forEach(function (p) {
      seen[p.id] = true;
      var key = p.cover_url + '|' + p.post_count + '|' + p.avg_rating + '|' + p.name;
      var e = markers[p.id];
      if (!e) {
        var el = document.createElement('div');
        render(el, p, p.id === selectedId);
        el.addEventListener('click', function (ev) {
          ev.stopPropagation();
          send({ type: 'select', id: p.id });
        });
        var marker = new maplibregl.Marker({ element: el, anchor: 'center' })
          .setLngLat([p.lng, p.lat])
          .addTo(map);
        markers[p.id] = { marker: marker, el: el, p: p, key: key };
      } else if (e.key !== key) {
        e.p = p; e.key = key;
        render(e.el, p, p.id === selectedId);
      }
    });
    Object.keys(markers).forEach(function (id) {
      if (!seen[id]) { markers[id].marker.remove(); delete markers[id]; }
    });
  }

  function setSelected(id) {
    var prev = selectedId;
    selectedId = id;
    [prev, id].forEach(function (x) {
      var e = x && markers[x];
      if (e) render(e.el, e.p, x === id);
    });
  }

  function focus(lat, lng, zoom, offsetY) {
    map.flyTo({
      center: [lng, lat],
      zoom: zoom == null ? map.getZoom() : zoom,
      offset: [0, -(offsetY || 0)],
      duration: 600,
      essential: true
    });
  }

  function setUser(lat, lng) {
    if (!userMarker) {
      var el = document.createElement('div');
      el.className = 'me';
      userMarker = new maplibregl.Marker({ element: el, anchor: 'center' }).setLngLat([lng, lat]).addTo(map);
    } else {
      userMarker.setLngLat([lng, lat]);
    }
  }

  function emitViewport() {
    var b = map.getBounds();
    send({
      type: 'viewport',
      minLat: b.getSouth(), minLng: b.getWest(),
      maxLat: b.getNorth(), maxLng: b.getEast(),
      zoom: map.getZoom()
    });
  }

  map.on('click', function (e) {
    var t = e.originalEvent && e.originalEvent.target;
    if (t && t.closest && t.closest('.fm')) return; // chạm vào marker, không phải nền
    send({ type: 'select', id: null });
  });
  map.on('moveend', emitViewport);
  map.on('load', function () {
    // Ưu tiên tên tiếng Việt cho đường/địa danh (mặc định style dùng tên Latin/Anh)
    map.getStyle().layers.forEach(function (layer) {
      if (layer.type === 'symbol' && map.getLayoutProperty(layer.id, 'text-field')) {
        map.setLayoutProperty(layer.id, 'text-field', ['coalesce', ['get', 'name:vi'], ['get', 'name']]);
      }
    });
    emitViewport();
  });

  window.__forket = {
    handle: function (cmd) {
      switch (cmd.type) {
        case 'places': return setPlaces(cmd.places);
        case 'selected': return setSelected(cmd.id);
        case 'focus': return focus(cmd.lat, cmd.lng, cmd.zoom, cmd.offsetY);
        case 'user': return setUser(cmd.lat, cmd.lng);
      }
    }
  };
  window.addEventListener('message', function (e) {
    if (e.data && e.data.__forketCmd) window.__forket.handle(e.data.__forketCmd);
  });

  send({ type: 'ready' });
})();
</script>
</body>
</html>`;
}
