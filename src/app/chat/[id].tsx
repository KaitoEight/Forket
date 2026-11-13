import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import * as ImagePicker from 'expo-image-picker';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
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
import { GroupAvatar } from '@/components/GroupAvatar';
import { BillItemSheet } from '@/components/chat/BillItemSheet';
import { BillMessageCard } from '@/components/chat/BillMessageCard';
import { PlaceMessageCard } from '@/components/chat/PlaceMessageCard';
import { PlacePickerSheet } from '@/components/chat/PlacePickerSheet';
import { WheelCreateDialog } from '@/components/chat/WheelCreateDialog';
import { WheelMessageCard } from '@/components/chat/WheelMessageCard';
import { WheelSheet } from '@/components/chat/WheelSheet';
import { IconButton } from '@/components/IconButton';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { normalizeName } from '@/services/placeService';
import {
  addBillItem,
  castVote,
  deleteBillItem,
  fetchBillItems,
  fetchConversationInfo,
  fetchMessageById,
  fetchMessages,
  fetchVotes,
  markConversationRead,
  sendImageMessage,
  renameBill,
  sendBillMessage,
  setBillItemPaid,
  sendMessage,
  sendPlaceMessage,
  subscribeToBillItems,
  subscribeToMessageUpdates,
  subscribeToMessages,
  subscribeToVotes,
  updateBillItem,
  type BillItem,
  type BillItemInput,
  type ConversationInfo,
  type Message,
  type Vote,
} from '@/services/chatService';
import { appAlert } from '@/lib/appAlert';
import { goBack } from '@/lib/navigation';
import { cancelInviteReminder, scheduleInviteReminder } from '@/lib/push';
import {
  WHEEL_MODES,
  createWheel,
  fetchWheels,
  subscribeToWheels,
  type WheelEntry,
  type WheelGame,
  type WheelMode,
} from '@/services/wheelService';
import { markWished } from '@/services/wishlistService';

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

type Person = ConversationInfo['members'][number]['profile'];

export default function ChatScreen() {
  const { id: conversationId } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { session } = useAuth();
  const meId = session?.user.id;

  const [info, setInfo] = useState<ConversationInfo | null>(null);
  const [infoLoaded, setInfoLoaded] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [loading, setLoading] = useState(true);
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [emojiOpen, setEmojiOpen] = useState(false);
  const [placeOpen, setPlaceOpen] = useState(false);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  // Hộp đặt tên bảng tính tiền mới
  const [billTitleOpen, setBillTitleOpen] = useState(false);
  const [billTitle, setBillTitle] = useState('');
  const [billCreating, setBillCreating] = useState(false);
  // null = đặt tên cho bảng mới; có id = đổi tên bảng đã gửi
  const [billRenameId, setBillRenameId] = useState<string | null>(null);
  // Đang thêm / sửa 1 dòng của bảng nào
  const [billSheet, setBillSheet] = useState<{ messageId: string; item?: BillItem } | null>(null);
  const [viewer, setViewer] = useState<string | null>(null);
  // Minigame vòng quay: dữ liệu, vòng đang mở, hộp tạo mới
  const [wheels, setWheels] = useState<{ games: WheelGame[]; entries: WheelEntry[] }>({ games: [], entries: [] });
  const [wheelOpenMsg, setWheelOpenMsg] = useState<string | null>(null);
  const [wheelCreate, setWheelCreate] = useState<WheelMode | null>(null);
  // Bản mới nhất của danh sách tin (dùng trong callback realtime)
  const messagesRef = useRef<Message[]>([]);
  const memberIds = useRef(new Set<string>());

  useEffect(() => {
    messagesRef.current = messages;
  }, [messages]);

  useEffect(() => {
    memberIds.current = new Set((info?.members ?? []).map((m) => m.user_id));
  }, [info]);

  // Nhắc tên (chat nhóm): người được chọn từ gợi ý khi gõ "@"
  const [mentionPicks, setMentionPicks] = useState<{ id: string; name: string }[]>([]);

  const people = useMemo(() => {
    const map = new Map<string, Person>();
    for (const m of info?.members ?? []) if (m.profile) map.set(m.user_id, m.profile);
    // Người đã rời nhóm vẫn hiện tên trên tin nhắn cũ
    for (const msg of messages) if (msg.sender && !map.has(msg.sender_id)) map.set(msg.sender_id, msg.sender);
    return map;
  }, [info, messages]);

  // Gõ "@…" ở cuối ô nhập → gợi ý @all + thành viên nhóm (trừ mình)
  const mentionOptions = useMemo(() => {
    if (!info?.is_group) return [];
    const m = text.match(/(^|\s)@([^\s@]*)$/);
    if (!m) return [];
    const q = normalizeName(m[2]);
    const list: { key: string; label: string; sub: string; userId?: string; all?: boolean }[] = [];
    if (!q || 'all'.startsWith(q) || normalizeName('mọi người').includes(q)) {
      list.push({ key: 'all', label: '@all', sub: 'Nhắc tất cả mọi người trong nhóm', all: true });
    }
    for (const mem of info.members) {
      if (mem.user_id === meId) continue;
      const p = mem.profile;
      if (!q || normalizeName(p.display_name).includes(q) || p.username.toLowerCase().includes(q)) {
        list.push({ key: p.id, label: p.display_name, sub: `@${p.username}`, userId: p.id });
      }
    }
    return list.slice(0, 6);
  }, [text, info, meId]);

  const pickMention = (opt: { label: string; userId?: string; all?: boolean }) => {
    const token = opt.all ? '@all ' : `@${opt.label} `;
    setText((t) => t.replace(/(^|\s)@([^\s@]*)$/, (_all, lead) => `${lead}${token}`));
    if (opt.userId) {
      setMentionPicks((list) => (list.some((x) => x.id === opt.userId) ? list : [...list, { id: opt.userId!, name: opt.label }]));
    }
  };

  // Tên hiển thị để tô đậm @tên trong tin nhắn (chỉ ở chat nhóm)
  const mentionNames = useMemo(
    () => (info?.is_group ? [...people.values()].map((p) => p.display_name) : []),
    [info, people]
  );

  const other = info && !info.is_group ? info.members.find((m) => m.user_id !== meId)?.profile : undefined;
  const title = info?.is_group ? (info.name ?? 'Nhóm') : (other?.display_name ?? '');

  useEffect(() => {
    if (!conversationId || !meId) return;
    let cancelled = false;

    const loadVotes = (list: Message[]) => {
      const ids = list.filter((m) => m.kind === 'invite').map((m) => m.id);
      fetchVotes(ids)
        .then((v) => !cancelled && setVotes(v))
        .catch(() => {});
    };

    const loadBills = (list: Message[]) => {
      const ids = list.filter((m) => m.kind === 'bill').map((m) => m.id);
      fetchBillItems(ids)
        .then((items) => !cancelled && setBillItems(items))
        .catch(() => {});
    };

    const loadWheels = (list: Message[]) => {
      const ids = list.filter((m) => m.kind === 'wheel').map((m) => m.id);
      fetchWheels(ids)
        .then((w) => !cancelled && setWheels(w))
        .catch((e) => console.warn('Không tải được vòng quay:', e?.message ?? e));
    };

    const loadInfo = () =>
      fetchConversationInfo(conversationId)
        .then((data) => !cancelled && setInfo(data))
        .catch((e) => console.warn('Không tải được cuộc trò chuyện:', e?.message ?? e))
        .finally(() => !cancelled && setInfoLoaded(true));
    loadInfo();

    fetchMessages(conversationId)
      .then((list) => {
        if (cancelled) return;
        setMessages(list);
        loadVotes(list);
        loadBills(list);
        loadWheels(list);
      })
      .catch((e) => console.warn('Không tải được tin nhắn:', e?.message ?? e))
      .finally(() => !cancelled && setLoading(false));
    markConversationRead(conversationId);

    // Tin mới trong cuộc trò chuyện này → hiện ngay + đánh dấu đã đọc
    const unsubMessages = subscribeToMessages((messageId, convId, senderId) => {
      if (convId !== conversationId || senderId === meId) return;
      fetchMessageById(messageId)
        .then((m) => {
          if (!m || cancelled) return;
          setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
          if (m.kind === 'bill') loadBills([m, ...messagesRef.current]);
          if (m.kind === 'wheel') loadWheels([m, ...messagesRef.current]);
          if (!memberIds.current.has(m.sender_id)) loadInfo(); // có thành viên mới
          markConversationRead(conversationId);
        })
        .catch(() => {});
    });

    // Có người vote → tải lại vote của các lời rủ trong cuộc trò chuyện này
    const unsubVotes = subscribeToVotes((messageId) => {
      const list = messagesRef.current;
      if (!messageId || list.some((m) => m.id === messageId)) loadVotes(list);
    });

    // Tên bảng tính tiền bị đổi → cập nhật tin đó
    const unsubUpdates = subscribeToMessageUpdates((messageId, convId) => {
      if (convId !== conversationId) return;
      fetchMessageById(messageId)
        .then((m) => {
          if (!m || cancelled) return;
          setMessages((prev) => prev.map((x) => (x.id === m.id ? { ...x, body: m.body } : x)));
        })
        .catch(() => {});
    });

    // Có người thêm / sửa / xoá dòng trong bảng tính tiền → tải lại
    const unsubBills = subscribeToBillItems((messageId) => {
      const list = messagesRef.current;
      if (!messageId || list.some((m) => m.id === messageId)) loadBills(list);
    });

    // Có người thêm món / bắt đầu / quay → tải lại các vòng quay trong cuộc trò chuyện này
    const unsubWheels = subscribeToWheels(() => loadWheels(messagesRef.current));

    return () => {
      cancelled = true;
      unsubMessages();
      unsubVotes();
      unsubBills();
      unsubWheels();
      unsubUpdates();
      markConversationRead(conversationId);
    };
  }, [conversationId, meId]);

  const append = (m: Message | null) => {
    if (m) setMessages((prev) => (prev.some((x) => x.id === m.id) ? prev : [m, ...prev]));
  };

  const send = async () => {
    const body = text.trim();
    if (!body || !conversationId || sending) return;
    setSending(true);
    try {
      // Chỉ tính người còn xuất hiện trong nội dung (người dùng có thể đã xoá chữ @tên)
      const userIds = info?.is_group
        ? mentionPicks.filter((pk) => body.includes(`@${pk.name}`)).map((pk) => pk.id)
        : [];
      const all = !!info?.is_group && /(^|\s)@all(\s|$)/.test(body);
      append(await sendMessage(conversationId, body, null, { userIds, all }));
      setText('');
      setMentionPicks([]);
    } catch (e: any) {
      appAlert('Không gửi được', e?.message ?? String(e));
    } finally {
      setSending(false);
    }
  };

  const sendPhoto = async (source: 'library' | 'camera') => {
    if (!conversationId || uploading) return;
    setEmojiOpen(false);
    try {
      if (source === 'camera') {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          appAlert('Cần quyền camera', 'Cho phép Forket dùng camera trong Cài đặt để chụp ảnh gửi bạn bè.');
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
      append(await sendImageMessage(conversationId, asset, text));
      setText('');
    } catch (e: any) {
      appAlert('Không gửi được ảnh', e?.message ?? String(e));
    } finally {
      setUploading(false);
    }
  };

  const vote = async (messageId: string, choice: 'go' | 'no') => {
    if (!meId) return;
    const current = votes.find((v) => v.message_id === messageId && v.user_id === meId)?.choice ?? null;
    const before = votes;
    // Cập nhật ngay trên màn hình, gửi lên server sau
    setVotes((list) => {
      const rest = list.filter((v) => !(v.message_id === messageId && v.user_id === meId));
      return current === choice ? rest : [...rest, { message_id: messageId, user_id: meId, choice }];
    });
    try {
      await castVote(messageId, choice, current);
      // Bấm "Đi" → quán vào "Muốn đi" (server tự thêm) + nhắc trước giờ hẹn; bỏ vote / "Thôi" → huỷ nhắc
      const invite = messages.find((m) => m.id === messageId);
      if (choice === 'go' && current !== 'go') {
        if (invite?.place_id) markWished(invite.place_id);
        if (invite?.invite_at && invite.place && conversationId) {
          scheduleInviteReminder({
            messageId,
            conversationId,
            placeName: invite.place.name,
            at: new Date(invite.invite_at),
          });
        }
      } else {
        cancelInviteReminder(messageId);
      }
    } catch (e: any) {
      setVotes(before);
      appAlert('Không vote được', e?.message ?? String(e));
    }
  };

  const toggleBillPaid = async (item: BillItem) => {
    const next = !item.paid;
    setBillItems((list) => list.map((i) => (i.id === item.id ? { ...i, paid: next } : i)));
    try {
      await setBillItemPaid(item.id, next);
    } catch (e: any) {
      setBillItems((list) => list.map((i) => (i.id === item.id ? { ...i, paid: item.paid } : i)));
      appAlert('Không đổi được trạng thái', e?.message ?? String(e));
    }
  };

  const startRenameBill = (message: Message) => {
    setBillRenameId(message.id);
    setBillTitle(message.body ?? '');
    setBillTitleOpen(true);
  };

  const reloadBills = async () => {
    const ids = messagesRef.current.filter((m) => m.kind === 'bill').map((m) => m.id);
    setBillItems(await fetchBillItems(ids));
  };

  const submitBillTitle = async () => {
    if (!conversationId || billCreating) return;
    setBillCreating(true);
    try {
      if (billRenameId) {
        const id = billRenameId;
        await renameBill(id, billTitle);
        const name = billTitle.trim() || 'Tính tiền';
        setMessages((prev) => prev.map((m) => (m.id === id ? { ...m, body: name } : m)));
        setBillTitleOpen(false);
        setBillRenameId(null);
        setBillTitle('');
        return;
      }
      const msg = await sendBillMessage(conversationId, billTitle);
      append(msg);
      setBillTitleOpen(false);
      setBillTitle('');
      // Mở luôn bảng nhập dòng đầu tiên
      if (msg) setBillSheet({ messageId: msg.id });
    } catch (e: any) {
      appAlert(billRenameId ? 'Không đổi được tên bảng' : 'Không tạo được bảng', e?.message ?? String(e));
    } finally {
      setBillCreating(false);
    }
  };

  const reloadWheels = async (extra?: Message) => {
    const list = extra ? [extra, ...messagesRef.current] : messagesRef.current;
    setWheels(await fetchWheels(list.filter((m) => m.kind === 'wheel').map((m) => m.id)));
  };

  const createWheelGame = async (mode: WheelMode, title: string, memberIds: string[]) => {
    if (!conversationId) return;
    const messageId = await createWheel(conversationId, mode, title, memberIds);
    const msg = await fetchMessageById(messageId);
    if (msg) {
      append(msg);
      await reloadWheels(msg);
    }
    setWheelOpenMsg(messageId);
  };

  const openWheelMenu = () => {
    appAlert(
      'Minigame vòng quay',
      undefined,
      [
        ...(['pay', 'food_elim', 'food_spin'] as const).map((mode) => ({
          text: WHEEL_MODES[mode].label,
          icon: WHEEL_MODES[mode].icon,
          onPress: () => setWheelCreate(mode),
        })),
        { text: 'Đóng', style: 'cancel' as const },
      ]
    );
  };

  const openAddMenu = () => {
    Keyboard.dismiss();
    setEmojiOpen(false);
    appAlert('Gửi thêm', undefined, [
      { text: 'Gửi một quán', icon: 'restaurant-outline', onPress: () => setPlaceOpen(true) },
      { text: 'Minigame vòng quay', icon: 'dice-outline', onPress: openWheelMenu },
      {
        text: 'Tạo bảng tính tiền',
        icon: 'receipt-outline',
        onPress: () => {
          setBillRenameId(null);
          setBillTitle('');
          setBillTitleOpen(true);
        },
      },
      { text: 'Đóng', style: 'cancel' },
    ]);
  };

  const toggleEmoji = () => {
    if (emojiOpen) {
      setEmojiOpen(false);
    } else {
      Keyboard.dismiss();
      setEmojiOpen(true);
    }
  };

  const openHeader = () => {
    if (!info) return;
    if (info.is_group) router.push({ pathname: '/chat/info/[id]', params: { id: info.id } });
    else if (other) router.push({ pathname: '/user/[id]', params: { id: other.id } });
  };

  const canSend = !!text.trim() && !sending;
  const removed = infoLoaded && !info;

  return (
    <KeyboardAvoidingView style={styles.screen} behavior="padding">
      <StatusBar style={statusBarStyle} />
      <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
        <IconButton icon="chevron-back" label="Quay lại" onPress={() => goBack()} />
        {info ? (
          <Pressable style={styles.headerUser} onPress={openHeader}>
            {info.is_group ? (
              <GroupAvatar uri={info.avatar_url} size={38} />
            ) : (
              other && <Avatar name={other.display_name} seed={other.username} uri={other.avatar_url} size={38} />
            )}
            <View style={styles.flexShrink}>
              <Text style={styles.headerName} numberOfLines={1}>
                {title}
              </Text>
              <Text style={styles.headerSub} numberOfLines={1}>
                {info.is_group ? `${info.members.length} thành viên · Xem nhóm` : `@${other?.username ?? ''}`}
              </Text>
            </View>
          </Pressable>
        ) : (
          <View style={styles.flex} />
        )}
      </View>

      {loading ? (
        <ActivityIndicator color={colors.accent} style={styles.flex} />
      ) : removed ? (
        <View style={styles.emptyWrap}>
          <Text style={styles.emptyText}>Bạn không còn ở trong cuộc trò chuyện này.</Text>
        </View>
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
            {info?.is_group
              ? 'Nhóm mới tạo! Gửi một quán để rủ cả nhóm đi ăn nhé.'
              : `Rủ ${title || 'bạn ấy'} đi ăn gì đó đi! Gửi lời chào, ảnh món ngon hoặc một quán nhé.`}
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
          renderItem={({ item, index }) => {
            const mine = item.sender_id === meId;
            // Danh sách đảo ngược: tin gửi trước đó nằm ở index + 1
            const older = messages[index + 1];
            const showSender = !!info?.is_group && !mine && older?.sender_id !== item.sender_id;
            return (
              <Bubble
                message={item}
                mine={mine}
                meId={meId}
                sender={showSender ? (people.get(item.sender_id) ?? item.sender) : null}
                votes={votes.filter((v) => v.message_id === item.id)}
                people={people}
                billItems={item.kind === 'bill' ? billItems.filter((b) => b.message_id === item.id) : []}
                wheelGame={item.kind === 'wheel' ? wheels.games.find((g) => g.message_id === item.id) : undefined}
                wheelEntries={wheels.entries}
                onWheelOpen={() => setWheelOpenMsg(item.id)}
                mentionNames={mentionNames}
                onOpenImage={setViewer}
                onVote={(choice) => vote(item.id, choice)}
                onBillAdd={() => setBillSheet({ messageId: item.id })}
                onBillEdit={(bi) => setBillSheet({ messageId: item.id, item: bi })}
                onBillTogglePaid={toggleBillPaid}
                onBillRename={() => startRenameBill(item)}
              />
            );
          }}
        />
      )}

      {!removed && mentionOptions.length > 0 && (
        <View style={styles.mentionPanel}>
          {mentionOptions.map((opt) => (
            <Pressable
              key={opt.key}
              style={({ pressed }) => [styles.mentionRow, pressed && styles.mentionRowPressed]}
              onPress={() => pickMention(opt)}
            >
              <View style={[styles.mentionIcon, opt.all && styles.mentionIconAll]}>
                <Ionicons name={opt.all ? 'megaphone' : 'at'} size={16} color={opt.all ? colors.onAccent : colors.accent} />
              </View>
              <View style={styles.flex}>
                <Text style={styles.mentionLabel} numberOfLines={1}>
                  {opt.label}
                </Text>
                <Text style={styles.mentionSub} numberOfLines={1}>
                  {opt.sub}
                </Text>
              </View>
            </Pressable>
          ))}
        </View>
      )}

      {!removed && (
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
          <Pressable accessibilityLabel="Gửi thêm: quán, bảng tính tiền" hitSlop={6} style={styles.toolBtn} onPress={openAddMenu}>
            <Ionicons name="add-circle" size={27} color={colors.caramel} />
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
      )}

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

      <PlacePickerSheet
        visible={placeOpen}
        onClose={() => setPlaceOpen(false)}
        onSend={async (place, mode, note, inviteAt) => {
          if (!conversationId) return;
          try {
            const sent = await sendPlaceMessage(conversationId, place.id, mode, note, inviteAt);
            append(sent);
            if (inviteAt && sent) {
              scheduleInviteReminder({ messageId: sent.id, conversationId, placeName: place.name, at: inviteAt });
            }
          } catch (e: any) {
            appAlert('Không gửi được', e?.message ?? String(e));
            throw e;
          }
        }}
      />

      {/* Đặt tên bảng tính tiền */}
      <Modal
        visible={billTitleOpen}
        transparent
        animationType="fade"
        onRequestClose={() => {
          setBillTitleOpen(false);
          setBillRenameId(null);
        }}
      >
        <View style={styles.billBackdrop}>
          <View style={styles.billDialog}>
            <Text style={styles.billDialogTitle}>{billRenameId ? 'Đổi tên bảng' : 'Bảng tính tiền mới'}</Text>
            <TextInput
              style={styles.billInput}
              value={billTitle}
              onChangeText={setBillTitle}
              placeholder="Tên bảng (vd: Lẩu tối thứ 6) — bỏ trống = “Tính tiền”"
              placeholderTextColor={colors.textMuted}
              maxLength={60}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={submitBillTitle}
            />
            <View style={styles.billActions}>
              <Pressable
                style={styles.billGhost}
                onPress={() => {
                  setBillTitleOpen(false);
                  setBillRenameId(null);
                }}
              >
                <Text style={styles.billGhostText}>Huỷ</Text>
              </Pressable>
              <Pressable style={[styles.billPrimary, billCreating && styles.billDim]} onPress={submitBillTitle} disabled={billCreating}>
                {billCreating ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Text style={styles.billPrimaryText}>{billRenameId ? 'Lưu' : 'Tạo bảng'}</Text>
                )}
              </Pressable>
            </View>
          </View>
        </View>
      </Modal>

      {billSheet && (
        <BillItemSheet
          key={billSheet.item?.id ?? `new-${billSheet.messageId}`}
          people={[...people.values()].map((p) => ({ id: p.id, display_name: p.display_name }))}
          item={billSheet.item}
          onClose={() => setBillSheet(null)}
          onSave={async (input: BillItemInput) => {
            if (billSheet.item) await updateBillItem(billSheet.item.id, input);
            else await addBillItem(billSheet.messageId, input);
            await reloadBills();
          }}
          onDelete={
            billSheet.item
              ? async () => {
                  await deleteBillItem(billSheet.item!.id);
                  await reloadBills();
                }
              : undefined
          }
        />
      )}

      {/* Minigame vòng quay */}
      {wheelCreate && (
        <WheelCreateDialog
          mode={wheelCreate}
          meId={meId}
          people={[...people.values()].map((p) => ({ id: p.id, display_name: p.display_name }))}
          onClose={() => setWheelCreate(null)}
          onCreate={(title, memberIds) => createWheelGame(wheelCreate, title, memberIds)}
        />
      )}
      {wheelOpenMsg &&
        (() => {
          const game = wheels.games.find((g) => g.message_id === wheelOpenMsg);
          if (!game) return null;
          return (
            <WheelSheet
              key={game.id}
              game={game}
              entries={wheels.entries.filter((e) => e.game_id === game.id)}
              title={messages.find((m) => m.id === wheelOpenMsg)?.body ?? WHEEL_MODES[game.mode].defaultTitle}
              meId={meId}
              people={people}
              onClose={() => setWheelOpenMsg(null)}
              onChanged={() => reloadWheels()}
            />
          );
        })()}

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

const escapeRegExp = (v: string) => v.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/** Tô đậm "@all" và "@Tên thành viên" trong nội dung tin nhắn */
function renderWithMentions(body: string, names: string[], mine: boolean) {
  const alternatives = ['all', ...[...names].sort((a, b) => b.length - a.length).map(escapeRegExp)];
  const re = new RegExp(`(@(?:${alternatives.join('|')}))(?=$|[\\s.,!?;:])`, 'g');
  const parts = body.split(re);
  if (parts.length === 1) return body;
  return parts.map((part, i) =>
    i % 2 === 1 ? (
      <Text key={i} style={mine ? styles.mentionMine : styles.mention}>
        {part}
      </Text>
    ) : (
      part
    )
  );
}

function Bubble({
  message,
  mine,
  meId,
  sender,
  votes,
  people,
  billItems,
  wheelGame,
  wheelEntries,
  onWheelOpen,
  mentionNames,
  onOpenImage,
  onVote,
  onBillAdd,
  onBillEdit,
  onBillTogglePaid,
  onBillRename,
}: {
  message: Message;
  mine: boolean;
  meId: string | undefined;
  /** Hiện tên người gửi (chat nhóm, tin đầu của 1 lượt) */
  sender: Person | null;
  votes: Vote[];
  people: Map<string, Person>;
  billItems: BillItem[];
  wheelGame: WheelGame | undefined;
  wheelEntries: WheelEntry[];
  onWheelOpen: () => void;
  mentionNames: string[];
  onOpenImage: (uri: string) => void;
  onVote: (choice: 'go' | 'no') => void;
  onBillAdd: () => void;
  onBillEdit: (item: BillItem) => void;
  onBillTogglePaid: (item: BillItem) => void;
  onBillRename: () => void;
}) {
  const replyPhoto = message.post?.thumb_url ?? message.post?.image_url;
  const isBill = message.kind === 'bill';
  const isWheel = message.kind === 'wheel';
  const isCard = isBill || isWheel || message.kind === 'place' || message.kind === 'invite';
  const bigEmoji = !message.image_url && !isCard && isBigEmoji(message.body);

  return (
    <View style={[styles.bubbleWrap, mine ? styles.right : styles.left, isCard && styles.cardWrap]}>
      {sender && (
        <View style={styles.senderRow}>
          <Avatar name={sender.display_name} seed={sender.username} uri={sender.avatar_url} size={18} />
          <Text style={styles.senderName}>{sender.display_name}</Text>
        </View>
      )}

      {message.post_id && (
        <View style={[styles.replyTo, mine ? styles.right : styles.left]}>
          <Text style={styles.replyLabel}>{mine ? 'Bạn đã trả lời ảnh' : 'Đã trả lời ảnh'}</Text>
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

      {isWheel ? (
        <WheelMessageCard
          title={message.body}
          game={wheelGame}
          entries={wheelGame ? wheelEntries.filter((e) => e.game_id === wheelGame.id) : []}
          mine={mine}
          meId={meId}
          onOpen={onWheelOpen}
        />
      ) : isBill ? (
        <BillMessageCard
          title={message.body}
          items={billItems}
          mine={mine}
          meId={meId}
          isBillOwner={mine}
          onAdd={onBillAdd}
          onEdit={onBillEdit}
          onTogglePaid={onBillTogglePaid}
          onRename={onBillRename}
        />
      ) : isCard ? (
        <PlaceMessageCard
          kind={message.kind as 'place' | 'invite'}
          place={message.place}
          note={message.body}
          mine={mine}
          meId={meId}
          votes={votes}
          people={people}
          inviteAt={message.invite_at ?? null}
          onVote={onVote}
        />
      ) : (
        <>
          {message.image_url && (
            <Pressable onPress={() => onOpenImage(message.image_url!)}>
              <Image source={{ uri: message.image_url }} style={styles.photoMsg} contentFit="cover" transition={150} />
            </Pressable>
          )}

          {bigEmoji ? (
            <Text style={styles.bigEmoji}>{message.body}</Text>
          ) : message.body ? (
            <View style={[styles.bubble, mine ? styles.bubbleMine : styles.bubbleTheirs]}>
              <Text style={[styles.bubbleText, mine && styles.bubbleTextMine]}>
                {renderWithMentions(message.body, mentionNames, mine)}
              </Text>
            </View>
          ) : null}
        </>
      )}

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
  cardWrap: { maxWidth: '92%' },
  mention: { color: colors.accent, fontWeight: '800' },
  mentionMine: { color: colors.caramelSoft, fontWeight: '800' },
  mentionPanel: {
    backgroundColor: colors.surface,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.border,
    paddingVertical: 4,
  },
  mentionRow: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingHorizontal: 16, paddingVertical: 8 },
  mentionRowPressed: { backgroundColor: colors.surfaceHigh },
  mentionIcon: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  mentionIconAll: { backgroundColor: colors.caramel },
  mentionLabel: { color: colors.text, fontWeight: '800', fontSize: 15 },
  mentionSub: { color: colors.textMuted, fontSize: 12 },
  billBackdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'center', padding: 24 },
  billDialog: {
    backgroundColor: colors.bg,
    borderRadius: 24,
    padding: 20,
    gap: 14,
    width: '100%',
    maxWidth: 440,
    alignSelf: 'center',
  },
  billDialogTitle: { color: colors.text, fontSize: 18, fontWeight: '800' },
  billInput: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 48,
    fontSize: 15,
  },
  billActions: { flexDirection: 'row', justifyContent: 'flex-end', gap: 10 },
  billGhost: { paddingHorizontal: 16, height: 44, justifyContent: 'center' },
  billGhostText: { color: colors.textMuted, fontWeight: '700' },
  billPrimary: {
    backgroundColor: colors.accent,
    paddingHorizontal: 22,
    height: 44,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  billPrimaryText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
  billDim: { opacity: 0.6 },
  senderRow: { flexDirection: 'row', alignItems: 'center', gap: 6, marginLeft: 2 },
  senderName: { color: colors.textMuted, fontSize: 12, fontWeight: '700' },
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
  toolBtn: { width: 36, height: 46, alignItems: 'center', justifyContent: 'center' },
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
