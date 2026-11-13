import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { Linking, Platform, Pressable, StyleSheet, Text, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { tagLabel } from '@/constants/placeTags';
import { colors, radius } from '@/constants/theme';
import type { ChatPlace, Vote } from '@/services/chatService';
import { fetchPlacesByIds, type MapPlace } from '@/services/placeService';
import { toggleMustTry, useMustTryIds } from '@/services/mustTryService';
import { toggleWishlist, useWishlistIds } from '@/services/wishlistService';

type Person = { id: string; username: string; display_name: string; avatar_url: string | null };

// Ảnh bìa + điểm của quán (dùng chung giữa các card trong 1 lần mở app)
const statsCache = new Map<string, MapPlace | null>();
const pending = new Map<string, Promise<MapPlace | null>>();

function loadStats(id: string) {
  if (statsCache.has(id)) return Promise.resolve(statsCache.get(id) ?? null);
  let p = pending.get(id);
  if (!p) {
    p = fetchPlacesByIds([id])
      .then(([x]) => x ?? null)
      .catch(() => null)
      .then((x) => {
        statsCache.set(id, x);
        pending.delete(id);
        return x;
      });
    pending.set(id, p);
  }
  return p;
}

/** "19:00 hôm nay" · "19:00 ngày mai" · "19:00 thứ Sáu 14/11" · "đã qua" */
function formatInviteTime(iso: string) {
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return '';
  const time = at.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const days = Math.round((startOfDay(at) - startOfDay(new Date())) / 86_400_000);
  if (at.getTime() < Date.now() && days <= 0) return days === 0 ? `${time} hôm nay · đã qua` : `${time} · đã qua`;
  if (days === 0) return `${time} hôm nay`;
  if (days === 1) return `${time} ngày mai`;
  return `${time} ${at.toLocaleDateString('vi-VN', { weekday: 'long', day: '2-digit', month: '2-digit' })}`;
}

type Props = {
  kind: 'place' | 'invite';
  place: ChatPlace | null;
  note: string | null;
  /** Giờ hẹn của lời rủ (ISO) */
  inviteAt?: string | null;
  mine: boolean;
  meId: string | undefined;
  votes: Vote[];
  people: Map<string, Person>;
  onVote?: (choice: 'go' | 'no') => void;
};

/** Card quán trong chat. kind = 'invite' → thêm phần vote "Đi" / "Thôi" */
export function PlaceMessageCard({ kind, place, note, inviteAt, mine, meId, votes, people, onVote }: Props) {
  const [stats, setStats] = useState<MapPlace | null>(() => (place ? (statsCache.get(place.id) ?? null) : null));
  const wished = useWishlistIds().has(place?.id ?? '');
  const mustTry = useMustTryIds().has(place?.id ?? '');

  useEffect(() => {
    if (!place) return;
    let active = true;
    loadStats(place.id).then((s) => active && setStats(s));
    return () => {
      active = false;
    };
  }, [place]);

  if (!place) {
    return (
      <View style={[styles.card, styles.gone]}>
        <Ionicons name="location-outline" size={18} color={colors.textMuted} />
        <Text style={styles.muted}>Quán này đã bị xoá</Text>
      </View>
    );
  }

  const openMap = () =>
    router.navigate({ pathname: '/', params: { focusPlace: place.id, lat: String(place.lat), lng: String(place.lng) } });

  const directions = () => {
    const dest = `${place.lat},${place.lng}`;
    Linking.openURL(
      Platform.OS === 'ios'
        ? `http://maps.apple.com/?daddr=${dest}&q=${encodeURIComponent(place.name)}`
        : `https://www.google.com/maps/dir/?api=1&destination=${dest}`
    );
  };

  const goers = votes.filter((v) => v.choice === 'go');
  const nopes = votes.filter((v) => v.choice === 'no');
  const myVote = votes.find((v) => v.user_id === meId)?.choice ?? null;
  const tags = (place.tags ?? []).map(tagLabel).join(' · ');

  return (
    <View style={[styles.card, mine ? styles.cardMine : styles.cardTheirs]}>
      {kind === 'invite' && (
        <View style={styles.inviteHead}>
          <Ionicons name="restaurant" size={14} color={colors.onAccent} />
          <Text style={styles.inviteHeadText}>Rủ đi ăn</Text>
          {!!inviteAt && <Text style={styles.inviteTime}>· {formatInviteTime(inviteAt)}</Text>}
        </View>
      )}

      <Pressable onPress={openMap} style={styles.cover}>
        {stats?.cover_url ? (
          <Image source={{ uri: stats.cover_url }} style={StyleSheet.absoluteFill} contentFit="cover" transition={150} />
        ) : (
          <Ionicons name="restaurant" size={30} color={colors.caramel} />
        )}
        {stats?.avg_rating != null && (
          <View style={styles.rating}>
            <Text style={styles.ratingText}>★ {stats.avg_rating.toFixed(1)}</Text>
          </View>
        )}
      </Pressable>

      <View style={styles.info}>
        <Text style={styles.name} numberOfLines={2}>
          {place.name}
        </Text>
        {!!tags && <Text style={styles.tags}>{tags}</Text>}
        {!!place.address && (
          <Text style={styles.muted} numberOfLines={1}>
            {place.address}
          </Text>
        )}
        {!!note && <Text style={styles.note}>“{note}”</Text>}
      </View>

      <View style={styles.links}>
        <Pressable style={styles.link} onPress={openMap}>
          <Ionicons name="map-outline" size={15} color={colors.accent} />
          <Text style={styles.linkText}>Xem bản đồ</Text>
        </Pressable>
        <View style={styles.linkDivider} />
        <Pressable style={styles.link} onPress={directions}>
          <Ionicons name="navigate-outline" size={15} color={colors.accent} />
          <Text style={styles.linkText}>Chỉ đường</Text>
        </Pressable>
        <View style={styles.linkDivider} />
        <Pressable
          style={styles.link}
          onPress={() => toggleWishlist(place.id).catch(() => {})}
          accessibilityLabel={wished ? 'Bỏ khỏi Muốn đi' : 'Thêm vào Muốn đi'}
        >
          <Ionicons name={wished ? 'bookmark' : 'bookmark-outline'} size={15} color={colors.caramel} />
        </Pressable>
        <View style={styles.linkDivider} />
        <Pressable
          style={styles.link}
          onPress={() => toggleMustTry(place.id).catch(() => {})}
          accessibilityLabel={mustTry ? 'Bỏ khỏi Must try' : 'Thêm vào Must try'}
        >
          <Ionicons name={mustTry ? 'heart' : 'heart-outline'} size={15} color={colors.danger} />
        </Pressable>
      </View>

      {kind === 'invite' && (
        <View style={styles.vote}>
          <View style={styles.voteButtons}>
            <VoteButton label="Đi" count={goers.length} active={myVote === 'go'} onPress={() => onVote?.('go')} />
            <VoteButton label="Thôi" count={nopes.length} active={myVote === 'no'} onPress={() => onVote?.('no')} muted />
          </View>
          {goers.length > 0 && <Voters label="Đi" votes={goers} people={people} meId={meId} />}
          {nopes.length > 0 && <Voters label="Thôi" votes={nopes} people={people} meId={meId} />}
        </View>
      )}
    </View>
  );
}

function VoteButton({
  label,
  count,
  active,
  onPress,
  muted,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
  muted?: boolean;
}) {
  return (
    <Pressable
      style={({ pressed }) => [
        styles.voteBtn,
        active && (muted ? styles.voteBtnNo : styles.voteBtnGo),
        pressed && styles.pressed,
      ]}
      onPress={onPress}
      accessibilityState={{ selected: active }}
    >
      <Text style={[styles.voteText, active && styles.voteTextActive]}>
        {label}
        {count > 0 ? ` · ${count}` : ''}
      </Text>
    </Pressable>
  );
}

function Voters({
  label,
  votes,
  people,
  meId,
}: {
  label: string;
  votes: Vote[];
  people: Map<string, Person>;
  meId: string | undefined;
}) {
  const names = votes
    .map((v) => (v.user_id === meId ? 'Bạn' : people.get(v.user_id)?.display_name))
    .filter(Boolean)
    .join(', ');
  return (
    <View style={styles.voters}>
      <Text style={styles.votersLabel}>{label}:</Text>
      <View style={styles.avatars}>
        {votes.slice(0, 5).map((v) => {
          const p = people.get(v.user_id);
          return p ? <Avatar key={v.user_id} name={p.display_name} seed={p.username} uri={p.avatar_url} size={20} /> : null;
        })}
      </View>
      <Text style={styles.votersNames} numberOfLines={1}>
        {names}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    width: 250,
    borderRadius: 22,
    overflow: 'hidden',
    borderWidth: 1,
    backgroundColor: colors.surface,
  },
  cardMine: { borderColor: colors.accent },
  cardTheirs: { borderColor: colors.border },
  gone: { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 14, borderColor: colors.border },
  inviteHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 6,
  },
  inviteHeadText: { color: colors.onAccent, fontWeight: '800', fontSize: 13 },
  inviteTime: { color: colors.accentSoft, fontWeight: '800', fontSize: 13, flexShrink: 1 },
  cover: {
    height: 120,
    backgroundColor: colors.caramelSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rating: {
    position: 'absolute',
    left: 8,
    top: 8,
    backgroundColor: colors.caramel,
    borderRadius: 8,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  ratingText: { color: '#fff', fontWeight: '800', fontSize: 11 },
  info: { padding: 12, gap: 3 },
  name: { color: colors.text, fontWeight: '800', fontSize: 16 },
  tags: { color: colors.brown, fontSize: 12, fontWeight: '700' },
  muted: { color: colors.textMuted, fontSize: 12 },
  note: { color: colors.text, fontSize: 14, marginTop: 4, fontStyle: 'italic' },
  links: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
  },
  link: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 5, paddingVertical: 10 },
  linkDivider: { width: StyleSheet.hairlineWidth, backgroundColor: colors.border },
  linkText: { color: colors.accent, fontWeight: '700', fontSize: 13 },
  vote: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    padding: 10,
    gap: 8,
  },
  voteButtons: { flexDirection: 'row', gap: 8 },
  voteBtn: {
    flex: 1,
    height: 38,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.bg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  voteBtnGo: { backgroundColor: colors.accent, borderColor: colors.accent },
  voteBtnNo: { backgroundColor: colors.brown, borderColor: colors.brown },
  voteText: { color: colors.text, fontWeight: '800', fontSize: 14 },
  voteTextActive: { color: colors.onAccent },
  pressed: { opacity: 0.8 },
  voters: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  votersLabel: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
  avatars: { flexDirection: 'row', gap: 2 },
  votersNames: { flex: 1, color: colors.textMuted, fontSize: 12 },
});
