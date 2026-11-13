import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '@/constants/theme';
import {
  searchAddress,
  searchPlaces,
  type AddressSuggestion,
  type CurrentLocation,
  type MapPlace,
} from '@/services/placeService';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Vị trí đang dùng (để hiện địa chỉ và ưu tiên kết quả gần đó) */
  current: CurrentLocation | null;
  /** Quay về vị trí GPS hiện tại */
  onUseGps: () => Promise<void>;
  /** Chọn 1 địa chỉ từ gợi ý */
  onPickAddress: (loc: CurrentLocation) => Promise<void>;
  /** Chọn 1 quán đã lưu trên Forket */
  onPickPlace: (place: MapPlace) => Promise<void>;
};

/** Chọn vị trí check-in: GPS hiện tại, quán đã lưu, hoặc nhập địa chỉ cụ thể (có gợi ý) */
export function LocationPickerSheet({ visible, onClose, current, onUseGps, onPickAddress, onPickPlace }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [places, setPlaces] = useState<MapPlace[]>([]);
  const [addresses, setAddresses] = useState<AddressSuggestion[]>([]);
  const [searchingPlaces, setSearchingPlaces] = useState(false);
  const [searchingAddress, setSearchingAddress] = useState(false);
  const [applying, setApplying] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const q = query.trim();

  // Quán đã lưu: tìm nhanh (300ms). Địa chỉ: chờ lâu hơn để không vượt giới hạn ~1 lượt/giây của OpenStreetMap
  useEffect(() => {
    if (!visible || !q) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setSearchingPlaces(true);
      searchPlaces(q, current)
        .then((list) => !cancelled && setPlaces(list.slice(0, 5)))
        .catch(() => !cancelled && setPlaces([]))
        .finally(() => !cancelled && setSearchingPlaces(false));
    }, 300);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, visible, current]);

  useEffect(() => {
    if (!visible || q.length < 3) return;
    let cancelled = false;
    const t = setTimeout(() => {
      setSearchingAddress(true);
      searchAddress(q, current)
        .then((list) => !cancelled && setAddresses(list))
        .catch(() => !cancelled && setAddresses([]))
        .finally(() => !cancelled && setSearchingAddress(false));
    }, 800);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [q, visible, current]);

  const run = async (key: string, action: () => Promise<void>) => {
    setApplying(key);
    setError(null);
    try {
      await action();
      setQuery('');
      setPlaces([]);
      setAddresses([]);
      onClose();
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setApplying(null);
    }
  };

  const close = () => {
    setQuery('');
    setPlaces([]);
    setAddresses([]);
    setError(null);
    onClose();
  };

  const showPlaces = q.length > 0 ? places : [];
  const showAddresses = q.length >= 3 ? addresses : [];
  const searching = searchingPlaces || searchingAddress;

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <Pressable style={styles.flex} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          <Text style={styles.title}>Chọn vị trí</Text>

          <View style={styles.search}>
            <Ionicons name="search" size={18} color={colors.textMuted} />
            <TextInput
              style={styles.searchInput}
              value={query}
              onChangeText={setQuery}
              placeholder="Tìm quán đã lưu hoặc nhập địa chỉ…"
              placeholderTextColor={colors.textMuted}
              autoCorrect={false}
              returnKeyType="search"
            />
            {searching ? (
              <ActivityIndicator size="small" color={colors.textMuted} />
            ) : (
              !!query && (
                <Pressable hitSlop={8} onPress={() => setQuery('')}>
                  <Ionicons name="close-circle" size={18} color={colors.textMuted} />
                </Pressable>
              )
            )}
          </View>

          <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
            {error && <Text style={styles.error}>{error}</Text>}

            {/* GPS luôn ở đầu */}
            <Row
              icon="locate"
              iconTint={colors.accent}
              title="Vị trí hiện tại (GPS)"
              sub={current && !current.custom ? current.address || 'Đang dùng' : 'Dùng vị trí thật của bạn'}
              active={!!current && !current.custom}
              busy={applying === 'gps'}
              onPress={() => run('gps', onUseGps)}
            />

            {current?.custom && (
              <Row
                icon="pin"
                iconTint={colors.caramel}
                title="Đang dùng địa chỉ bạn chọn"
                sub={current.address}
                active
              />
            )}

            {showPlaces.length > 0 && <Text style={styles.section}>Quán đã lưu trên Forket</Text>}
            {showPlaces.map((p) => (
              <Row
                key={`p-${p.id}`}
                icon="restaurant"
                iconTint={colors.caramel}
                title={p.name}
                sub={p.address ?? ''}
                busy={applying === `p-${p.id}`}
                onPress={() => run(`p-${p.id}`, () => onPickPlace(p))}
              />
            ))}

            {showAddresses.length > 0 && <Text style={styles.section}>Địa chỉ</Text>}
            {showAddresses.map((a) => (
              <Row
                key={`a-${a.id}`}
                icon="location"
                iconTint={colors.brown}
                title={a.title}
                sub={a.subtitle}
                busy={applying === `a-${a.id}`}
                onPress={() =>
                  run(`a-${a.id}`, () =>
                    onPickAddress({ latitude: a.lat, longitude: a.lng, accuracy: 0, address: a.address, custom: true })
                  )
                }
              />
            ))}

            {q.length >= 3 && !searching && showPlaces.length === 0 && showAddresses.length === 0 && (
              <Text style={styles.empty}>
                Không tìm thấy “{q}”. Thử thêm số nhà, tên đường hoặc quận/huyện để rõ hơn.
              </Text>
            )}
            {q.length === 0 && (
              <Text style={styles.hint}>
                Gõ tên quán đã có trên Forket, hoặc địa chỉ (vd: 12 Nguyễn Huệ, Quận 1) để ghim đúng chỗ thay vì dùng GPS.
              </Text>
            )}
          </ScrollView>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Row({
  icon,
  iconTint,
  title,
  sub,
  active,
  busy,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  iconTint: string;
  title: string;
  sub?: string;
  active?: boolean;
  busy?: boolean;
  onPress?: () => void;
}) {
  return (
    <Pressable
      style={({ pressed }) => [styles.row, active && styles.rowActive, pressed && onPress && styles.rowPressed]}
      onPress={onPress}
      disabled={!onPress || busy}
    >
      <View style={[styles.rowIcon, { backgroundColor: `${iconTint}22` }]}>
        <Ionicons name={icon} size={18} color={iconTint} />
      </View>
      <View style={styles.flex}>
        <Text style={styles.rowTitle} numberOfLines={1}>
          {title}
        </Text>
        {!!sub && (
          <Text style={styles.rowSub} numberOfLines={2}>
            {sub}
          </Text>
        )}
      </View>
      {busy ? (
        <ActivityIndicator size="small" color={colors.accent} />
      ) : (
        active && <Ionicons name="checkmark-circle" size={20} color={colors.accent} />
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1 },
  backdrop: { flex: 1, backgroundColor: colors.overlay },
  sheet: {
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 16,
    maxHeight: '85%',
    gap: 10,
    width: '100%',
    maxWidth: 560,
    alignSelf: 'center',
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  search: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 14,
    height: 48,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15 },
  list: { paddingBottom: 8, gap: 2 },
  section: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginTop: 10,
    marginBottom: 2,
  },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, paddingHorizontal: 8, borderRadius: 14 },
  rowActive: { backgroundColor: colors.accentSoft },
  rowPressed: { backgroundColor: colors.surface },
  rowIcon: { width: 36, height: 36, borderRadius: 12, alignItems: 'center', justifyContent: 'center' },
  rowTitle: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rowSub: { color: colors.textMuted, fontSize: 12, lineHeight: 16, marginTop: 1 },
  error: { color: colors.danger, fontSize: 14, marginBottom: 6 },
  empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 20, lineHeight: 20 },
  hint: { color: colors.textMuted, fontSize: 13, lineHeight: 19, paddingVertical: 14, paddingHorizontal: 4 },
});
