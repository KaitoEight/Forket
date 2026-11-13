import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
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

import { InviteTimePicker } from '@/components/chat/InviteTimePicker';
import { colors, radius } from '@/constants/theme';
import { searchPlaces } from '@/services/placeService';
import { fetchMyPosts, groupVisits } from '@/services/profileService';

export type PickedPlace = { id: string; name: string; address?: string | null; cover: string | null };
export type ShareMode = 'place' | 'invite';

type Props = {
  visible: boolean;
  onClose: () => void;
  onSend: (place: PickedPlace, mode: ShareMode, note: string, inviteAt: Date | null) => Promise<void>;
};

/** Chọn quán gửi vào chat: quán đã đi gần đây hoặc tìm theo tên → chia sẻ / rủ đi */
export function PlacePickerSheet({ visible, onClose, onSend }: Props) {
  const insets = useSafeAreaInsets();
  const [query, setQuery] = useState('');
  const [recent, setRecent] = useState<PickedPlace[] | null>(null);
  const [results, setResults] = useState<PickedPlace[]>([]);
  const [searching, setSearching] = useState(false);
  const [picked, setPicked] = useState<PickedPlace | null>(null);

  useEffect(() => {
    if (!visible || recent) return;
    fetchMyPosts()
      .then((posts) =>
        setRecent(groupVisits(posts).slice(0, 8).map((v) => ({ id: v.id, name: v.name, cover: v.cover })))
      )
      .catch(() => setRecent([]));
  }, [visible, recent]);

  useEffect(() => {
    const q = query.trim();
    if (!q) return; // ô trống → hiện quán đi gần đây
    const t = setTimeout(() => {
      setSearching(true);
      searchPlaces(q)
        .then((list) => setResults(list.map((p) => ({ id: p.id, name: p.name, address: p.address, cover: p.cover_url }))))
        .catch(() => setResults([]))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const close = () => {
    setPicked(null);
    setQuery('');
    onClose();
  };

  const list = query.trim() ? results : (recent ?? []);

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={close}>
      <KeyboardAvoidingView style={styles.backdrop} behavior="padding">
        <Pressable style={styles.flex} onPress={close} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]}>
          <View style={styles.handle} />
          {picked ? (
            <ModeStep
              place={picked}
              onBack={() => setPicked(null)}
              onSend={async (mode, note, inviteAt) => {
                await onSend(picked, mode, note, inviteAt);
                close();
              }}
            />
          ) : (
            <>
              <Text style={styles.title}>Gửi một quán</Text>
              <View style={styles.search}>
                <Ionicons name="search" size={18} color={colors.textMuted} />
                <TextInput
                  style={styles.searchInput}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Tìm quán theo tên…"
                  placeholderTextColor={colors.textMuted}
                  autoCorrect={false}
                />
                {searching && <ActivityIndicator size="small" color={colors.textMuted} />}
              </View>
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={styles.list}>
                {!query.trim() && <Text style={styles.section}>Đã đi gần đây</Text>}
                {recent === null && !query.trim() ? (
                  <ActivityIndicator color={colors.accent} style={styles.loader} />
                ) : list.length === 0 ? (
                  <Text style={styles.empty}>
                    {query.trim() ? 'Không tìm thấy quán nào.' : 'Bạn chưa check-in quán nào. Gõ tên quán để tìm.'}
                  </Text>
                ) : (
                  list.map((p) => (
                    <Pressable key={p.id} style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={() => setPicked(p)}>
                      <View style={styles.thumb}>
                        {p.cover ? (
                          <Image source={{ uri: p.cover }} style={StyleSheet.absoluteFill} contentFit="cover" />
                        ) : (
                          <Ionicons name="restaurant" size={18} color={colors.caramel} />
                        )}
                      </View>
                      <View style={styles.flex}>
                        <Text style={styles.name} numberOfLines={1}>
                          {p.name}
                        </Text>
                        {!!p.address && (
                          <Text style={styles.sub} numberOfLines={1}>
                            {p.address}
                          </Text>
                        )}
                      </View>
                      <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </>
          )}
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

/** Bước 2: chọn Chia sẻ quán (mặc định) hoặc Rủ đi (có vote) + lời nhắn */
export function ModeStep({
  place,
  onBack,
  onSend,
}: {
  place: PickedPlace;
  onBack?: () => void;
  onSend: (mode: ShareMode, note: string, inviteAt: Date | null) => Promise<void>;
}) {
  const [mode, setMode] = useState<ShareMode>('place');
  const [note, setNote] = useState('');
  const [inviteAt, setInviteAt] = useState<Date | null>(null);
  const [sending, setSending] = useState(false);

  const send = async () => {
    setSending(true);
    try {
      await onSend(mode, note, mode === 'invite' ? inviteAt : null);
    } finally {
      setSending(false);
    }
  };

  return (
    <View style={styles.modeWrap}>
      <View style={styles.modeHeader}>
        {onBack && (
          <Pressable onPress={onBack} hitSlop={8} accessibilityLabel="Chọn quán khác">
            <Ionicons name="arrow-back" size={22} color={colors.text} />
          </Pressable>
        )}
        <Text style={[styles.title, styles.flex]} numberOfLines={1}>
          {place.name}
        </Text>
      </View>

      <View style={styles.modes}>
        <ModeOption
          active={mode === 'place'}
          icon="location"
          title="Chia sẻ quán"
          sub="Gửi card quán để bạn bè xem"
          onPress={() => setMode('place')}
        />
        <ModeOption
          active={mode === 'invite'}
          icon="restaurant"
          title="Rủ đi"
          sub="Kèm vote Đi / Thôi cho mọi người"
          onPress={() => setMode('invite')}
        />
      </View>

      <TextInput
        style={styles.note}
        value={note}
        onChangeText={setNote}
        placeholder={mode === 'invite' ? 'vd: Nhớ mang ví nha!' : 'Lời nhắn (tuỳ chọn)'}
        placeholderTextColor={colors.textMuted}
        maxLength={200}
      />

      {mode === 'invite' && (
        <>
          <Text style={styles.timeLabel}>Giờ hẹn (không bắt buộc — có giờ thì mình sẽ nhắc trước 30 phút)</Text>
          <InviteTimePicker value={inviteAt} onChange={setInviteAt} />
        </>
      )}

      <Pressable style={[styles.send, sending && styles.dim]} onPress={send} disabled={sending}>
        {sending ? (
          <ActivityIndicator color={colors.onAccent} />
        ) : (
          <Text style={styles.sendText}>{mode === 'invite' ? 'Gửi lời rủ' : 'Gửi quán'}</Text>
        )}
      </Pressable>
    </View>
  );
}

function ModeOption({
  active,
  icon,
  title,
  sub,
  onPress,
}: {
  active: boolean;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  sub: string;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.mode, active && styles.modeActive]} onPress={onPress} accessibilityState={{ selected: active }}>
      <Ionicons name={icon} size={20} color={active ? colors.onAccent : colors.accent} />
      <Text style={[styles.modeTitle, active && styles.modeTitleActive]}>{title}</Text>
      <Text style={[styles.modeSub, active && styles.modeSubActive]}>{sub}</Text>
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
    maxHeight: '80%',
    gap: 10,
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
    height: 46,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 15 },
  list: { paddingBottom: 8 },
  section: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginVertical: 6 },
  loader: { marginVertical: 16 },
  empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', paddingVertical: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8, borderRadius: 12 },
  pressed: { backgroundColor: colors.surface },
  thumb: {
    width: 44,
    height: 44,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: colors.caramelSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  name: { color: colors.text, fontWeight: '700', fontSize: 15 },
  sub: { color: colors.textMuted, fontSize: 12 },
  modeWrap: { gap: 12 },
  modeHeader: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  modes: { flexDirection: 'row', gap: 10 },
  timeLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  mode: {
    flex: 1,
    gap: 4,
    padding: 14,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  modeActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  modeTitle: { color: colors.text, fontWeight: '800', fontSize: 15, marginTop: 4 },
  modeTitleActive: { color: colors.onAccent },
  modeSub: { color: colors.textMuted, fontSize: 12, lineHeight: 16 },
  modeSubActive: { color: colors.accentSoft },
  note: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 46,
    fontSize: 15,
  },
  send: {
    backgroundColor: colors.accent,
    height: 50,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { color: colors.onAccent, fontWeight: '800', fontSize: 16 },
  dim: { opacity: 0.6 },
});
