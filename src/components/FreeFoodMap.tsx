import { useCallback, useRef, useState, type ComponentProps, type ComponentType, type Ref } from 'react';
import { Linking, StyleSheet } from 'react-native';
import { WebView as RNWebView } from 'react-native-webview';

import { colors } from '@/constants/theme';

import { buildMapHtml } from './map/mapHtml';
import { DEFAULT_CENTER, DEFAULT_ZOOM, type FoodMapProps, type MapCommand } from './map/types';
import { useMapBridge } from './map/useMapBridge';

export * from './map/types';

// Type của react-native-webview 14 khai báo WebView là function component không có `ref`,
// nhưng lúc chạy nó là forwardRef và có injectJavaScript → tự khai báo kiểu cho ref.
type WebViewHandle = { injectJavaScript: (script: string) => void };
type WebViewProps = ComponentProps<typeof RNWebView>;
const WebView = RNWebView as unknown as ComponentType<WebViewProps & { ref?: Ref<WebViewHandle> }>;

// Bản đồ MapLibre + OpenFreeMap (OpenStreetMap) trong WebView — không cần API key
export default function FreeFoodMap(props: FoodMapProps) {
  const { initialCenter = DEFAULT_CENTER, initialZoom = DEFAULT_ZOOM } = props;
  const webRef = useRef<WebViewHandle>(null);
  const [html] = useState(() => buildMapHtml(initialCenter, initialZoom));

  const deliver = useCallback((cmd: MapCommand) => {
    webRef.current?.injectJavaScript(
      `window.__forket && window.__forket.handle(${JSON.stringify(cmd)}); true;`
    );
  }, []);

  const handleRaw = useMapBridge(props, deliver);

  return (
    <WebView
      ref={webRef}
      style={styles.map}
      source={{ html }}
      originWhitelist={['*']}
      onMessage={(e) => handleRaw(e.nativeEvent.data)}
      // Link ghi công (OpenStreetMap…) mở bằng trình duyệt, không cho WebView rời trang bản đồ
      onShouldStartLoadWithRequest={(req) => {
        if (/^https?:/i.test(req.url)) {
          Linking.openURL(req.url);
          return false;
        }
        return true;
      }}
      javaScriptEnabled
      domStorageEnabled
      setSupportMultipleWindows={false}
      scrollEnabled={false}
      bounces={false}
      overScrollMode="never"
      showsHorizontalScrollIndicator={false}
      showsVerticalScrollIndicator={false}
    />
  );
}

const styles = StyleSheet.create({
  map: { flex: 1, backgroundColor: colors.bg },
});
