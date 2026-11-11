import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Keyboard,
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

import { Avatar } from '@/components/Avatar';
import { IconButton } from '@/components/IconButton';
import { colors, radius } from '@/constants/theme';
import { useAuth, type Profile } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  fetchMessageById,
  fetchMessages,
  markChatRead,
  sendImageMessage,
  sendMessage,
  subscribeToIncomingMessages,
  type Message,
} from '@/services/chatService';

// Bảng emoji: ưu tiên đồ ăn — thức uống — cảm xúc
const EMOJI_GROUPS: { title: string; emojis: string[] }[] = [
  {
    title: 'Món ăn',
    emojis: [
      '🍜', '🍲', '🍛', '🍚', '🍙', '🍣', '🍱', '🥟', '🍤', '🍗', '🍖', '🥩', '🍳', '🥚',
      '🍔', '🍟', '🍕', '🌭', '🥪', '🌮', '🌯', '🥗', '🍝', '🥖', '🥐', '🧀', '🌶️', '🧄',
    ],
  },
  {
    title: 'Tráng miệng & đồ uống',
    emojis: [
      '🍰', '🧁', '🍦', '🍨', '🍩', '🍪', '🍫', '🍮', '🍡', '🍉', '🥭', '🍓', '🍍', '🥥',
      '☕', '🧋', '🍵', '🥤', '🧃', '🍺', '🍻', '🍷', '🍹', '🥂',
    ],
  },
  {
    title: 'Cảm xúc',
    emojis: [
      '😋', '🤤', '😍', '🥰', '😂', '🤣', '🥹', '😎', '🤩', '😮', '😭', '🥵', '🤯', '😴',
      '👍', '👎', '👏', '🙏', '🤝', '💯', '🔥', '❤️', '🧡', '✨', '🎉', '⭐', '👀', '💸',
    ],
  },
];

// Tin nhắn chỉ có vài emoji → hiện cỡ to, không có bong bóng
let EMOJI_ONLY: RegExp | null = null;
try {
  EMOJI_ONLY = new RegExp('^(?:\\p{Extended_Pictographic}|\\p{Emoji_Modifier}|\\u200d|\\ufe0f|\\s)+$', 'u');
} catch {
  EMOJI_ONLY = null; // engine không hỗ trợ \p{…} → hiện như tin thường
}
function isBigEmoji(text: string | null | undefined) {
  if (!text || !EMOJI_ONLY) return false;
  const t = text.trim();
  return t.length > 0 && t.length <= 12 && EMOJI_ONLY.test(t);
}

function clock(iso: string) {
  const d = new Date(iso);
  const sameDay = d.toDateString() === new Date().toDateString();
  const time = d.toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' });
  return sameDay ? time : `${d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' })} ${time}`;
}

export default function ChatScreen() {
  const { id: friendId } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const meId = session?.user.id;

  const [friend, setFriend] = useState<Profile | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [viewer, setViewer] = useState<string | null>(null);

  useEffect(() => {
    if (!friendId || !meId) return;
    let cancelled = false;

    supabase
      .from('profiles')
      .select('id, username, display_name, avatar_url')
      .eq('id', friendId)
      .maybeSingle()
      .then(({ data }) => !cancelled && setFriend(data));

    fetchMessages(friendId)
      .then((list) => !cancelled && setMessages(list))
      .catch((e) => console.warn('Không tải được tin nhắn:', e?.message ?? e))
      .finally(() => !cancelled && setLoading(false));
    markChatRead(friendId);

    // Tin mới từ người này → hiện ngay + đánh dấu đã đọc
    const unsubscribe = subscribeToIncomingMessages(meId, (messageId, senderId) => {
      if (senderId !== friendId) return;
      fetchMessageById(messageId)
        .then((m) => {
          if (!m || cancelled) return;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
          markChatRead(friendId);
        })
        .catch(() => {});
    });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, [friendId, meId]);

  const append = (m: Message | null) => {
    if (m) setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !friendId || sending) return;
    setSending(true);
    try {
      append(await sendMessage(friendId, body));
      setText('');
    } catch (e: any) {
      Alert.alert('Không gửi được', e?.message ?? String(e));
    } finally {
      setSending(false);
    }
  };

  const sendPhoto = async (source: 'library' | 'camera') => {
    if (!friendId || uploading) return;
    setEmojiOpen(false);
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          Alert.alert('Cần quyền camera', 'Cho phép Forket dùng camera trong Cài đặt để chụp ảnh gửi bạn bè.');
          return;
        }
      }
      const options: ImagePicker.ImagePickerOptions = { mediaTypes: ['images'], quality: 0.9 };
      const result =
        source === 'camera'
          ? await ImagePicker.launchCameraAsync(options)
          : await ImagePicker.launchImageLibraryAsync(options);
      if (result.canceled || !result.assets?.[0]) return;

      const asset = result.assets[0];
      setUploading(true);
      // Chữ đang gõ dở sẽ gửi kèm làm chú thích cho ảnh
      append(await sendImageMessage(friendId, asset, text));
      setText('');
    } catch (e: any) {
      Alert.alert('Không gửi được ảnh', e?.message ?? String(e));
    } finally {
      setUploading(false);
    }
  };

  const toggleEmoji = () => {
    if (emojiOpen) {
      setEmojiOpen(false);
    } else {
      Keyboard.dismiss();
      setEmojiOpen(true);
    }
  };

  const canSend = !!text.trim() && !sending;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <StatusBar style="dark" />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="chevron-back" label="Quay lại" onPress={() => router.back()} />
        {friend ? (
          <View style={styles.headerUser}>
            <Avatar name={friend.display_name} seed={friend.username} size={38} />
            <View style={styles.flexShrink}>
              <Text style={styles.headerName} numberOfLines={1}>
                {friend.display_name}
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                @{friend.username}
              </Text>
            </View>
          </View>
        ) : (
          <View style={styles.flex} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.flex} />
      ) : messages.length === 0 && !uploading ? (
        <Pressable
          style={styles.emptyWrap}
          onPress={() => {
            Keyboard.dismiss();
            setEmojiOpen(false);
          }}
        >
          <Text style={styles.emptyEmoji}>🍜</Text>
          <Text style={styles.emptyText}>
            Rủ {friend?.display_name ?? 'bạn ấy'} đi ăn gì đó đi! Gửi lời chào, emoji hoặc ảnh món ngon nhé.
          </Text>
        </Pressable>
      ) : (
        <FlatList
          data={messages}
          inverted
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.list}
          keyboardShouldPersistTaps="handled"
          onScrollBeginDrag={() => setEmojiOpen(false)}
          ListHeaderComponent={
            uploading ? (
              <View style={[styles.bubbleWrap, styles.right]}>
                <View style={[styles.photoMsg, styles.uploading]}>
                  <ActivityIndicator color={colors.accent} />
                  <Text style={styles.uploadingText}>Đang gửi ảnh…</Text>
                </View>
              </View>
            ) : undefined
          }
          renderItem={({ item }) => (
            <Bubble message={item} mine={item.sender_id === meId} onOpenImage={setViewer} />
          )}
        />
      )}

      <View style={[styles.inputBar, { paddingBottom: emojiOpen ? 8 : insets.bottom + 8 }]}>
        <Pressable
          accessibilityLabel="Gửi ảnh từ thư viện"
          hitSlop={6}
          style={styles.toolBtn}
          onPress={() => sendPhoto('library')}
          disabled={uploading}
        >
          <Ionicons name="image" size={24} color={uploading ? colors.textMuted : colors.accent} />
        </Pressable>
        <Pressable
          accessibilityLabel="Chụp ảnh gửi"
          hitSlop={6}
          style={styles.toolBtn}
          onPress={() => sendPhoto('camera')}
          disabled={uploading}
        >
          <Ionicons name="camera" size={24} color={uploading ? colors.textMuted : colors.accent} />
        </Pressable>

        <View style={styles.inputWrap}>
          <TextInput
            style={styles.input}
            value={text}
            onChangeText={setText}
            onFocus={() => setEmojiOpen(false)}
            placeholder="Nhắn tin…"
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
          />
          <Pressable accessibilityLabel="Chọn emoji" hitSlop={6} onPress={toggleEmoji}>
            <Ionicons
              name={emojiOpen ? 'keypad-outline' : 'happy-outline'}
              size={24}
              color={emojiOpen ? colors.accent : colors.textMuted}
            />
          </Pressable>
        </View>

        <Pressable
          accessibilityLabel="Gửi"
          style={[styles.sendBtn, !canSend && styles.sendBtnIdle]}
          onPress={send}
          disabled={!canSend}
        >
          {sending ? (
            <ActivityIndicator size="small" color={colors.onAccent} />
          ) : (
            <Ionicons name="send" size={18} color={canSend ? colors.onAccent : colors.textMuted} />
          )}
        </Pressable>
      </View>

      {emojiOpen && (
        <View style={[styles.emojiPanel, { paddingBottom: insets.bottom + 8 }]}>
          <ScrollView keyboardShouldPersistTaps="always">
            {EMOJI_GROUPS.map((g) => (
              <View key={g.title} style={styles.emojiGroup}>
                <Text style={styles.emojiGroupTitle}>{g.title}</Text>
                <View style={styles.emojiGrid}>
                  {g.emojis.map((e) => (
                    <Pressable
                      key={e}
                      style={({ pressed }) => [styles.emojiCell, pressed && styles.emojiCellPressed]}
                      onPress={() => setText((t) => t + e)}
                    >
                      <Text style={styles.emojiChar}>{e}</Text>
                    </Pressable>
                  ))}
                </View>
              </View>
            ))}
          </ScrollView>
        </View>
      )}

      {/* Xem ảnh toàn màn hình */}
      <Modal visible={!!viewer} transparent animationType="fade" onRequestClose={() => setViewer(null)}>
        <Pressable style={styles.viewer} onPress={() => setViewer(null)}>
          {viewer && <Image source={{ uri: viewer }} style={styles.viewerImage} contentFit="contain" />}
          <View style={[styles.viewerClose, { top: insets.top + 12 }]}>
            <Ionicons name="close" size={26} color="#fff" />
          </View>
        </Pressable>
      </Modal>
    </KeyboardAvoidingView>
  );
}

function Bubble({
  message,
  mine,
  onOpenImage,
}: {
  message: Message;
  mine: boolean;
  onOpenImage: (uri: string) => void;
}) {
  const replyPhoto = message.post?.thumb_url ?? message.post?.image_url;
  const bigEmoji = !message.image_url && isBigEmoji(message.body);

  return (
    <View style={[styles.bubbleWrap, mine ? styles.right : styles.left]}>
      {message.post_id && (
        <View style={[styles.replyTo, mine ? styles.right : styles.left]}>
          <Text style={styles.replyLabel}>{mine ? 'Bạn đã trả lời ảnh' : 'Đã trả lời ảnh của bạn'}</Text>
          {replyPhoto && message.post ? (
            <Pressable onPress={() => onOpenImage(message.post!.image_url)}>
              <Image source={{ uri: replyPhoto }} style={styles.replyPhoto} contentFit="cover" />
            </Pressable>
          ) : (
            <View style={[styles.replyPhoto, styles.replyGone]}>
              <Ionicons name="image-outline" size={20} color={colors.textMuted} />
            </View>
          )}
        </View>
      )}

      {message.image_url && (
        <Pressable onPress={() => onOpenImage(message.image_url!)}>
          <Image
            source={{ uri: message.image_url }}
            style={styles.photoMsg}
            contentFit="cover"
            transition={150}
          />
        </Pressable>
      )}

      {bigEmoji ? (
        <Text style={styles.bigEmoji}>{message.body}</Text>
      ) : message.body ? (
        <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
          <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>{message.body}</Text>
        </View>
      ) : null}

      <Text style={styles.time}>{clock(message.created_at)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  flexShrink: { flexShrink: 1 },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 16,
    paddingBottom: 10,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    backgroundColor: colors.bg,
  },
  headerUser: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10 },
  headerName: { color: colors.text, fontWeight: '800', fontSize: 16 },
  headerSub: { color: colors.textMuted, fontSize: 12 },
  list: { padding: 16, gap: 10, flexGrow: 1 },
  emptyWrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32, gap: 10 },
  emptyEmoji: { fontSize: 52 },
  emptyText: { color: colors.textMuted, textAlign: 'center', fontSize: 15, lineHeight: 22 },
  bubbleWrap: { maxWidth: '80%', gap: 4 },
  left: { alignSelf: 'flex-start', alignItems: 'flex-start' },
  right: { alignSelf: 'flex-end', alignItems: 'flex-end' },
  replyTo: { gap: 4 },
  replyLabel: { color: colors.textMuted, fontSize: 12 },
  replyPhoto: { width: 120, height: 120, borderRadius: 18, backgroundColor: colors.surfaceHigh },
  replyGone: { alignItems: 'center', justifyContent: 'center' },
  photoMsg: { width: 220, height: 220, borderRadius: 20, backgroundColor: colors.surfaceHigh },
  uploading: { alignItems: 'center', justifyContent: 'center', gap: 8 },
  uploadingText: { color: colors.textMuted, fontSize: 13 },
  bubble: { paddingHorizontal: 14, paddingVertical: 10, borderRadius: 20 },
  bubbleMine: { backgroundColor: colors.accent, borderBottomRightRadius: 6 },
  bubbleTheirs: {
    backgroundColor: colors.surface,
    borderBottomLeftRadius: 6,
    borderWidth: 1,
    borderColor: colors.border,
  },
  bubbleText: { color: colors.text, fontSize: 15, lineHeight: 21 },
  bubbleTextMine: { color: colors.onAccent },
  bigEmoji: { fontSize: 44, lineHeight: 54 },
  time: { color: colors.textMuted, fontSize: 11 },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 4,
    paddingHorizontal: 10,
    paddingTop: 8,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    backgroundColor: colors.bg,
  },
  toolBtn: { width: 40, height: 46, alignItems: 'center', justifyContent: 'center' },
  inputWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-end',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 23,
    paddingLeft: 14,
    paddingRight: 10,
    paddingVertical: 10,
    marginHorizontal: 4,
  },
  input: { flex: 1, color: colors.text, fontSize: 15, maxHeight: 110, padding: 0 },
  sendBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendBtnIdle: { backgroundColor: colors.surfaceHigh },
  emojiPanel: {
    height: 280,
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingHorizontal: 8,
  },
  emojiGroup: { paddingTop: 10 },
  emojiGroupTitle: {
    color: colors.textMuted,
    fontSize: 12,
    fontWeight: '700',
    textTransform: 'uppercase',
    marginLeft: 6,
    marginBottom: 4,
  },
  emojiGrid: { flexDirection: 'row', flexWrap: 'wrap' },
  emojiCell: {
    width: '12.5%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: radius.pill,
  },
  emojiCellPressed: { backgroundColor: colors.accentSoft },
  emojiChar: { fontSize: 28 },
  viewer: { flex: 1, backgroundColor: 'rgba(0,0,0,0.92)', alignItems: 'center', justifyContent: 'center' },
  viewerImage: { width: '100%', height: '80%' },
  viewerClose: {
    position: 'absolute',
    right: 16,
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(255,255,255,0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
});
