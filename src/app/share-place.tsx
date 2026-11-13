import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, Share, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { GroupAvatar } from '@/components/GroupAvatar';
import { ModeStep, type PickedPlace } from '@/components/chat/PlacePickerSheet';
import { ScreenHeader } from '@/components/SettingsUI';
import { colors, statusBarStyle } from '@/constants/theme';
import { fetchConversations, getDirectConversation, sendPlaceMessage, type Conversation } from '@/services/chatService';
import { fetchPlacesByIds, type MapPlace } from '@/services/placeService';
import { appAlert } from '@/lib/appAlert';
import { scheduleInviteReminder } from '@/lib/push';

/** Gửi 1 quán (từ bản đồ) vào 1 cuộc trò chuyện: chọn chat → chọn Chia sẻ / Rủ đi */
export default function SharePlaceScreen() {
  const { placeId } = useLocalSearchParams<{ placeId: string }>();
  const insets = useSafeAreaInsets();
  const [place, setPlace] = useState<PickedPlace | null>(null);
  const [mapPlace, setMapPlace] = useState<MapPlace | null>(null);
  const [items, setItems] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [target, setTarget] = useState<Conversation | null>(null);

  useEffect(() => {
    if (!placeId) return;
    Promise.all([fetchPlacesByIds([placeId]), fetchConversations()])
      .then(([[p], convs]) => {
        if (p) {
          setPlace({ id: p.id, name: p.name, address: p.address, cover: p.cover_url });
          setMapPlace(p);
        }
        setItems(convs);
      })
      .catch((e) => appAlert('Không tải được', e?.message ?? String(e)))
      .finally(() => setLoading(false));
  }, [placeId]);

  /** Gửi ra ngoài app (Zalo, Messenger, tin nhắn…) bằng link Google Maps */
  const shareOutside = async () => {
    if (!mapPlace) return;
    const link = `https://www.google.com/maps/search/?api=1&query=${mapPlace.lat},${mapPlace.lng}`;
    const message = [`🍽️ ${mapPlace.name}`, mapPlace.address, link].filter(Boolean).join('\n');
    try {
      await Share.share({ message });
    } catch (e: any) {
      appAlert('Không chia sẻ được', e?.message ?? String(e));
    }
  };

  const send = async (mode: 'place' | 'invite', note: string, inviteAt: Date | null) => {
    if (!target || !place) return;
    try {
      const conv = target.conversation_id ?? (await getDirectConversation(target.other_id!));
      const sent = await sendPlaceMessage(conv, place.id, mode, note, inviteAt);
      if (inviteAt && sent) {
        scheduleInviteReminder({ messageId: sent.id, conversationId: conv, placeName: place.name, at: inviteAt });
      }
      router.replace({ pathname: '/chat/[id]', params: { id: conv } });
    } catch (e: any) {
      appAlert('Không gửi được', e?.message ?? String(e));
    }
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style={statusBarStyle} />
      <ScreenHeader title={target ? `Gửi cho ${target.title}` : 'Gửi quán cho…'} />

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.loader} />
      ) : !place ? (
        <Text style={styles.empty}>Không tìm thấy quán này.</Text>
      ) : target ? (
        <View style={styles.step}>
          <ModeStep place={place} onBack={() => setTarget(null)} onSend={send} />
        </View>
      ) : (
        <FlatList
          data={items}
          keyExtractor={(c) => c.conversation_id ?? `friend-${c.other_id}`}
          contentContainerStyle={[styles.list, { paddingBottom: insets.bottom + 24 }]}
          ListHeaderComponent={
            <View>
              <Text style={styles.placeLine}>📍 {place.name}</Text>
              <Pressable style={({ pressed }) => [styles.outside, pressed && styles.pressed]} onPress={shareOutside}>
                <Ionicons name="share-social" size={18} color={colors.accent} />
                <Text style={styles.outsideText}>Chia sẻ ra ngoài app (Zalo, Messenger…)</Text>
              </Pressable>
              <Text style={styles.sectionLabel}>Hoặc gửi trong Forket</Text>
            </View>
          }
          ListEmptyComponent={<Text style={styles.empty}>Chưa có cuộc trò chuyện nào. Kết bạn trước nhé.</Text>}
          renderItem={({ item }) => (
            <Pressable style={({ pressed }) => [styles.row, pressed && styles.pressed]} onPress={() => setTarget(item)}>
              {item.is_group ? (
                <GroupAvatar uri={item.other_avatar_url} size={44} />
              ) : (
                <Avatar
                  name={item.title}
                  seed={item.other_username ?? item.title}
                  uri={item.other_avatar_url}
                  size={44}
                />
              )}
              <View style={styles.flex}>
                <Text style={styles.name} numberOfLines={1}>
                  {item.title}
                </Text>
                <Text style={styles.sub}>{item.is_group ? `Nhóm · ${item.member_count} người` : `@${item.other_username}`}</Text>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  loader: { marginTop: 32 },
  empty: { color: colors.textMuted, fontSize: 14, textAlign: 'center', marginTop: 32, paddingHorizontal: 24 },
  list: { paddingHorizontal: 16 },
  placeLine: { color: colors.text, fontWeight: '800', fontSize: 15, paddingVertical: 10 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10, borderRadius: 12 },
  pressed: { backgroundColor: colors.surface },
  name: { color: colors.text, fontWeight: '700', fontSize: 15 },
  sub: { color: colors.textMuted, fontSize: 13 },
  step: { padding: 16 },
  outside: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.accentSoft,
    borderRadius: 16,
    paddingHorizontal: 14,
    height: 50,
  },
  outsideText: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  sectionLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', marginTop: 16, marginBottom: 4 },
});
