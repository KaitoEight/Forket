import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { IconButton } from '@/components/IconButton';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { useAuth, type Profile } from '@/lib/auth';
import {
  acceptFriendRequest,
  blockUser,
  fetchFriendships,
  findUserByCode,
  removeFriendship,
  searchUsers,
  sendFriendRequest,
  subscribeToFriendships,
  type FriendEntry,
  type Relation,
} from '@/services/friendService';
import { appAlert } from '@/lib/appAlert';
import { parseFriendCode } from '@/services/profileService';
import { goBack } from '@/lib/navigation';

export default function FriendsScreen() {
  const insets = useSafeAreaInsets();
  const { profile, session } = useAuth();
  const userId = session?.user.id;

  const [entries, setEntries] = useState<FriendEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<Profile[]>([]);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = async () => {
    try {
      setEntries(await fetchFriendships());
    } catch (e: any) {
      console.warn('Không tải được danh sách bạn bè:', e?.message ?? e);
    }
  };

  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    fetchFriendships()
      .then((data) => !cancelled && setEntries(data))
      .catch((e) => console.warn('Không tải được danh sách bạn bè:', e?.message ?? e))
      .finally(() => !cancelled && setLoading(false));

    // Có lời mời mới / được chấp nhận → cập nhật ngay
    const unsubscribe = subscribeToFriendships(userId, () => {
      fetchFriendships()
        .then((data) => !cancelled && setEntries(data))
        .catch(() => {});
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [userId]);

  // Tìm kiếm (đợi người dùng ngừng gõ 300ms)
  useEffect(() => {
    const q = query.trim();
    const t = setTimeout(() => {
      if (q.length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      // Gõ / dán mã kết bạn (8 ký tự hoặc link forket://add/…) → tìm thêm theo mã
      const code = parseFriendCode(q);
      const byCode = code && code.length === 8 ? findUserByCode(code).catch(() => null) : Promise.resolve(null);
      Promise.all([searchUsers(q).catch(() => [] as Profile[]), byCode])
        .then(([found, coded]) => {
          const list = coded && coded.id !== userId ? [coded, ...found.filter((u) => u.id !== coded.id)] : found;
          setResults(list);
        })
        .catch((e) => console.warn('Tìm kiếm lỗi:', e?.message ?? e))
        .finally(() => setSearching(false));
    }, 300);
    return () => clearTimeout(t);
  }, [query, userId]);

  const byUser = useMemo(() => new Map(entries.map((e) => [e.user.id, e])), [entries]);
  const incoming = entries.filter((e) => e.relation === 'incoming');
  const friends = entries.filter((e) => e.relation === 'friends');
  const outgoing = entries.filter((e) => e.relation === 'outgoing');

  const run = async (id: string, action: () => Promise<void>) => {
    setBusyId(id);
    try {
      await action();
      await reload();
    } catch (e: any) {
      appAlert('Không thực hiện được', e?.message ?? String(e));
    } finally {
      setBusyId(null);
    }
  };

  const confirmUnfriend = (entry: FriendEntry) =>
    appAlert('Huỷ kết bạn?', `Bạn và ${entry.user.display_name} sẽ không thấy ảnh của nhau nữa.`, [
      { text: 'Thôi', style: 'cancel' },
      {
        text: 'Huỷ kết bạn',
        style: 'destructive',
        onPress: () => run(entry.user.id, () => removeFriendship(entry.friendshipId)),
      },
    ]);

  const friendMenu = (entry: FriendEntry) =>
    appAlert(entry.user.display_name, `@${entry.user.username}`, [
      {
        text: 'Xem hồ sơ',
        icon: 'person-circle-outline',
        onPress: () => router.push({ pathname: '/user/[id]', params: { id: entry.user.id } }),
      },
      { text: 'Huỷ kết bạn', icon: 'person-remove-outline', style: 'destructive', onPress: () => confirmUnfriend(entry) },
      {
        text: 'Chặn',
        icon: 'ban-outline',
        style: 'destructive',
        onPress: () =>
          appAlert(
            `Chặn ${entry.user.display_name}?`,
            'Hai bạn sẽ huỷ kết bạn, không tìm thấy nhau và không nhắn tin được.',
            [
              { text: 'Thôi', style: 'cancel' },
              { text: 'Chặn', style: 'destructive', onPress: () => run(entry.user.id, () => blockUser(entry.user.id)) },
            ]
          ),
      },
      { text: 'Đóng', style: 'cancel' },
    ]);

  const actionFor = (user: Profile) => {
    const entry = byUser.get(user.id);
    const relation: Relation = entry?.relation ?? 'none';
    const busy = busyId === user.id;
    switch (relation) {
      case 'none':
        return (
          <ActionButton
            label="Kết bạn"
            icon="person-add"
            primary
            busy={busy}
            onPress={() => run(user.id, () => sendFriendRequest(user.id))}
          />
        );
      case 'incoming':
        return (
          <ActionButton
            label="Chấp nhận"
            icon="checkmark"
            primary
            busy={busy}
            onPress={() => run(user.id, () => acceptFriendRequest(entry!.friendshipId))}
          />
        );
      case 'outgoing':
        return (
          <ActionButton
            label="Đã gửi"
            icon="time-outline"
            busy={busy}
            onPress={() => run(user.id, () => removeFriendship(entry!.friendshipId))}
          />
        );
      case 'friends':
        return <ActionButton label="Bạn bè" icon="people" onPress={() => confirmUnfriend(entry!)} />;
    }
  };

  const searchingMode = query.trim().length >= 2;

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <StatusBar style={statusBarStyle} />
      <View style={styles.header}>
        <IconButton icon="chevron-back" label="Quay lại" onPress={() => goBack()} />
        <Text style={styles.title}>Bạn bè</Text>
        <IconButton icon="qr-code-outline" label="Kết bạn bằng QR" onPress={() => router.push('/qr')} />
      </View>

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            tintColor={colors.text}
            onRefresh={async () => {
              setRefreshing(true);
              await reload();
              setRefreshing(false);
            }}
          />
        }
      >
        {profile && (
          <View style={styles.meCard}>
            <Avatar name={profile.display_name} seed={profile.username} uri={profile.avatar_url} size={56} />
            <View style={styles.flex}>
              <Text style={styles.meName}>{profile.display_name}</Text>
              <Text style={styles.meUser}>@{profile.username}</Text>
            </View>
            <View style={styles.countPill}>
              <Text style={styles.countText}>{friends.length} bạn</Text>
            </View>
          </View>
        )}

        <Pressable style={styles.qrBanner} onPress={() => router.push('/qr')}>
          <Ionicons name="qr-code" size={22} color={colors.accent} />
          <View style={styles.flex}>
            <Text style={styles.qrTitle}>Kết bạn bằng mã QR</Text>
            <Text style={styles.qrSub}>Đưa mã của bạn hoặc quét mã của bạn bè</Text>
          </View>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </Pressable>

        <View style={styles.searchBox}>
          <Ionicons name="search" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            value={query}
            onChangeText={setQuery}
            placeholder="Tìm @username, tên hoặc mã kết bạn"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="none"
            autoCorrect={false}
            returnKeyType="search"
          />
          {searching && <ActivityIndicator size="small" color={colors.textMuted} />}
          {!!query && !searching && (
            <Pressable hitSlop={8} onPress={() => setQuery('')}>
              <Ionicons name="close-circle" size={18} color={colors.textMuted} />
            </Pressable>
          )}
        </View>

        {searchingMode ? (
          <Section title="Kết quả">
            {results.length === 0 && !searching ? (
              <Text style={styles.empty}>Không tìm thấy ai.</Text>
            ) : (
              results.map((u) => <UserRow key={u.id} user={u} action={actionFor(u)} />)
            )}
          </Section>
        ) : loading ? (
          <ActivityIndicator color={colors.text} style={styles.loader} />
        ) : (
          <>
            {incoming.length > 0 && (
              <Section title={`Lời mời kết bạn (${incoming.length})`}>
                {incoming.map((e) => (
                  <UserRow
                    key={e.friendshipId}
                    user={e.user}
                    action={
                      <View style={styles.actions}>
                        <ActionButton
                          label="Chấp nhận"
                          icon="checkmark"
                          primary
                          busy={busyId === e.user.id}
                          onPress={() => run(e.user.id, () => acceptFriendRequest(e.friendshipId))}
                        />
                        <Pressable
                          hitSlop={8}
                          accessibilityLabel="Từ chối"
                          onPress={() => run(e.user.id, () => removeFriendship(e.friendshipId))}
                        >
                          <Ionicons name="close" size={22} color={colors.textMuted} />
                        </Pressable>
                      </View>
                    }
                  />
                ))}
              </Section>
            )}

            <Section title={`Bạn bè (${friends.length})`}>
              {friends.length === 0 ? (
                <Text style={styles.empty}>
                  Chưa có bạn bè. Tìm @username của bạn bè ở ô trên để kết bạn và xem ảnh của nhau.
                </Text>
              ) : (
                friends.map((e) => (
                  <UserRow
                    key={e.friendshipId}
                    user={e.user}
                    action={
                      <Pressable hitSlop={8} accessibilityLabel="Tuỳ chọn" onPress={() => friendMenu(e)}>
                        <Ionicons name="ellipsis-horizontal" size={20} color={colors.textMuted} />
                      </Pressable>
                    }
                  />
                ))
              )}
            </Section>

            {outgoing.length > 0 && (
              <Section title="Đã gửi lời mời">
                {outgoing.map((e) => (
                  <UserRow
                    key={e.friendshipId}
                    user={e.user}
                    action={
                      <ActionButton
                        label="Huỷ"
                        icon="close"
                        busy={busyId === e.user.id}
                        onPress={() => run(e.user.id, () => removeFriendship(e.friendshipId))}
                      />
                    }
                  />
                ))}
              </Section>
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={styles.section}>
      <Text style={styles.sectionTitle}>{title}</Text>
      <View style={styles.sectionBody}>{children}</View>
    </View>
  );
}

function UserRow({ user, action }: { user: Profile; action: React.ReactNode }) {
  return (
    <View style={styles.row}>
      <Pressable
        style={styles.rowMain}
        onPress={() => router.push({ pathname: '/user/[id]', params: { id: user.id } })}
      >
      <Avatar name={user.display_name} seed={user.username} uri={user.avatar_url} />
      <View style={styles.flex}>
        <Text style={styles.rowName} numberOfLines={1}>
          {user.display_name}
        </Text>
        <Text style={styles.rowUser} numberOfLines={1}>
          @{user.username}
        </Text>
      </View>
      </Pressable>
      {action}
    </View>
  );
}

function ActionButton({
  label,
  icon,
  primary,
  busy,
  onPress,
}: {
  label: string;
  icon: React.ComponentProps<typeof Ionicons>['name'];
  primary?: boolean;
  busy?: boolean;
  onPress: () => void;
}) {
  const fg = primary ? colors.onAccent : colors.text;
  return (
    <Pressable
      style={({ pressed }) => [
        styles.actionBtn,
        primary && styles.actionBtnPrimary,
        (pressed || busy) && styles.dim,
      ]}
      onPress={onPress}
      disabled={busy}
    >
      {busy ? <ActivityIndicator size="small" color={fg} /> : <Ionicons name={icon} size={16} color={fg} />}
      <Text style={[styles.actionText, { color: fg }]}>{label}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  title: { color: colors.text, fontSize: 18, fontWeight: '800' },
  content: { padding: 16, gap: 20 },
  meCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    borderRadius: 24,
  },
  meName: { color: colors.text, fontSize: 18, fontWeight: '800' },
  meUser: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  countPill: {
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: radius.pill,
  },
  countText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  searchBox: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    paddingHorizontal: 16,
    height: 48,
  },
  searchInput: { flex: 1, color: colors.text, fontSize: 16 },
  loader: { marginTop: 24 },
  section: { gap: 10 },
  sectionTitle: { color: colors.textMuted, fontWeight: '700', fontSize: 13, textTransform: 'uppercase' },
  sectionBody: { gap: 4 },
  empty: { color: colors.textMuted, fontSize: 14, lineHeight: 20 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 8 },
  rowMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 12 },
  qrBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.accentSoft,
    borderRadius: 18,
    padding: 14,
  },
  qrTitle: { color: colors.accent, fontWeight: '800', fontSize: 15 },
  qrSub: { color: colors.text, fontSize: 13, marginTop: 1 },
  rowName: { color: colors.text, fontWeight: '700', fontSize: 15 },
  rowUser: { color: colors.textMuted, fontSize: 13, marginTop: 1 },
  actions: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  actionBtnPrimary: { backgroundColor: colors.accent },
  actionText: { fontWeight: '700', fontSize: 13 },
  dim: { opacity: 0.6 },
});
