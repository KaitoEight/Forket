import Ionicons from '@expo/vector-icons/Ionicons';
import * as Clipboard from 'expo-clipboard';
import { CameraView, useCameraPermissions, type BarcodeScanningResult } from 'expo-camera';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  Share,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/SettingsUI';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { findUserByCode } from '@/services/friendService';
import { friendLink, parseFriendCode, resetFriendCode } from '@/services/profileService';
import { appAlert } from '@/lib/appAlert';

type Tab = 'mine' | 'scan' | 'enter';

const TAB_META: Record<Tab, { label: string; icon: React.ComponentProps<typeof Ionicons>['name'] }> = {
  mine: { label: 'Mã của tôi', icon: 'qr-code' },
  scan: { label: 'Quét mã', icon: 'scan' },
  enter: { label: 'Nhập mã', icon: 'keypad' },
};

export default function QrScreen() {
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<Tab>('mine');

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 16 }]}>
      <StatusBar style={statusBarStyle} />
      <ScreenHeader title="Kết bạn bằng QR" />

      <View style={styles.tabs}>
        {(['mine', 'scan', 'enter'] as const).map((t) => (
          <Pressable key={t} style={[styles.tab, tab === t && styles.tabActive]} onPress={() => setTab(t)}>
            <Ionicons
              name={TAB_META[t].icon}
              size={16}
              color={tab === t ? colors.onAccent : colors.textMuted}
            />
            <Text style={[styles.tabText, tab === t && styles.tabTextActive]}>
              {TAB_META[t].label}
            </Text>
          </Pressable>
        ))}
      </View>

      {tab === 'mine' ? <MyCode /> : tab === 'scan' ? <Scanner /> : <EnterCode />}
    </View>
  );
}

function MyCode() {
  const { profile, refreshProfile } = useAuth();
  const [resetting, setResetting] = useState(false);
  const [copied, setCopied] = useState(false);
  const code = profile?.friend_code;

  const copy = async () => {
    if (!code) return;
    try {
      await Clipboard.setStringAsync(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1800);
    } catch (e: any) {
      appAlert('Không copy được', e?.message ?? String(e));
    }
  };

  if (!profile) return null;
  if (!code) {
    return (
      <View style={styles.center}>
        <Text style={styles.muted}>
          Server chưa bật mã QR: hãy chạy file SQL 20261112000000_profile_privacy.sql trong Supabase.
        </Text>
      </View>
    );
  }

  const share = () =>
    Share.share({ message: `Kết bạn với mình trên Forket nhé! Mã: ${code}\n${friendLink(code)}` });

  const confirmReset = () =>
    appAlert('Đổi mã QR?', 'Mã cũ sẽ không dùng được nữa. Bạn bè hiện tại không bị ảnh hưởng.', [
      { text: 'Thôi', style: 'cancel' },
      {
        text: 'Đổi mã',
        onPress: async () => {
          setResetting(true);
          try {
            await resetFriendCode();
            await refreshProfile();
          } catch (e: any) {
            appAlert('Không đổi được mã', e?.message ?? String(e));
          } finally {
            setResetting(false);
          }
        },
      },
    ]);

  return (
    <View style={styles.center}>
      <View style={styles.qrCard}>
        <View style={styles.qrUser}>
          <Avatar name={profile.display_name} seed={profile.username} uri={profile.avatar_url} size={44} />
          <View>
            <Text style={styles.qrName}>{profile.display_name}</Text>
            <Text style={styles.muted}>@{profile.username}</Text>
          </View>
        </View>
        <View style={styles.qrBox}>
          {resetting ? (
            <ActivityIndicator color={colors.accent} />
          ) : (
            <QRCode value={friendLink(code)} size={220} color={colors.text} backgroundColor={colors.surface} />
          )}
        </View>
        <View style={styles.codeRow}>
          <Text style={styles.code} selectable>
            {code}
          </Text>
          <Pressable
            style={({ pressed }) => [styles.copyBtn, copied && styles.copyBtnDone, pressed && styles.copyPressed]}
            onPress={copy}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel={copied ? 'Đã copy mã' : 'Copy mã kết bạn'}
          >
            <Ionicons
              name={copied ? 'checkmark' : 'copy-outline'}
              size={20}
              color={copied ? colors.onAccent : colors.accent}
            />
          </Pressable>
        </View>
        {copied && <Text style={styles.copiedText}>Đã copy mã</Text>}
        <Text style={styles.muted}>Đưa mã này cho bạn bè quét để kết bạn</Text>
      </View>

      <View style={styles.actions}>
        <Pressable style={styles.primary} onPress={share}>
          <Ionicons name="share-outline" size={18} color={colors.onAccent} />
          <Text style={styles.primaryText}>Chia sẻ mã</Text>
        </Pressable>
        <Pressable style={styles.secondary} onPress={confirmReset} disabled={resetting}>
          <Ionicons name="refresh" size={18} color={colors.text} />
          <Text style={styles.secondaryText}>Đổi mã</Text>
        </Pressable>
      </View>
    </View>
  );
}

/** Gõ hoặc dán mã kết bạn (hoặc cả link forket://add/…) của bạn bè */
function EnterCode() {
  const { profile } = useAuth();
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const code = parseFriendCode(text);

  const submit = async () => {
    if (busy) return;
    setError(null);
    if (!code) {
      setError('Mã gồm 8 ký tự chữ và số, vd: K7MQ2XW9.');
      return;
    }
    if (code === profile?.friend_code) {
      setError('Đây là mã của chính bạn. Đưa mã này cho bạn bè nhập nhé.');
      return;
    }
    setBusy(true);
    try {
      const user = await findUserByCode(code);
      if (!user) {
        setError('Không tìm thấy ai với mã này. Mã có thể đã được đổi, hoặc người này không cho kết bạn.');
        return;
      }
      router.replace({ pathname: '/user/[id]', params: { id: user.id } });
    } catch (e: any) {
      setError(e?.message ?? String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.center} behavior="padding">
      <Ionicons name="keypad" size={44} color={colors.accent} />
      <Text style={styles.enterTitle}>Nhập mã kết bạn</Text>
      <Text style={styles.muted}>Hỏi bạn bè mã trong mục “Mã của tôi”, rồi gõ hoặc dán vào đây.</Text>

      <TextInput
        style={[styles.codeInput, !!error && styles.codeInputError]}
        value={text}
        onChangeText={(t) => {
          setText(t.toUpperCase());
          setError(null);
        }}
        placeholder="K7MQ2XW9"
        placeholderTextColor={colors.border}
        autoCapitalize="characters"
        autoCorrect={false}
        autoFocus
        maxLength={60}
        returnKeyType="go"
        onSubmitEditing={submit}
      />
      {error && <Text style={styles.error}>{error}</Text>}

      <Pressable
        style={[styles.primary, styles.enterBtn, (!code || busy) && styles.dim]}
        onPress={submit}
        disabled={!code || busy}
      >
        {busy ? <ActivityIndicator color={colors.onAccent} /> : <Text style={styles.primaryText}>Tìm bạn</Text>}
      </Pressable>
    </KeyboardAvoidingView>
  );
}

function Scanner() {
  const [permission, requestPermission] = useCameraPermissions();
  const [looking, setLooking] = useState(false);
  const handled = useRef(false);

  if (!permission) return <View style={styles.flex} />;
  if (!permission.granted) {
    return (
      <View style={styles.center}>
        <Ionicons name="scan" size={48} color={colors.accent} />
        <Text style={styles.muted}>Cho phép dùng camera để quét mã QR của bạn bè.</Text>
        <Pressable style={styles.primary} onPress={requestPermission}>
          <Text style={styles.primaryText}>Cho phép camera</Text>
        </Pressable>
      </View>
    );
  }

  const onScanned = async ({ data }: BarcodeScanningResult) => {
    if (handled.current) return;
    const code = parseFriendCode(data);
    if (!code) return; // QR không phải của Forket → bỏ qua, quét tiếp
    handled.current = true;
    setLooking(true);
    try {
      const user = await findUserByCode(code);
      if (!user) {
        appAlert('Không tìm thấy', 'Mã này không còn dùng được hoặc người này không cho kết bạn với bạn.', [
          { text: 'Quét lại', onPress: () => (handled.current = false) },
        ]);
        return;
      }
      router.replace({ pathname: '/user/[id]', params: { id: user.id } });
    } catch (e: any) {
      appAlert('Có lỗi', e?.message ?? String(e), [{ text: 'Quét lại', onPress: () => (handled.current = false) }]);
    } finally {
      setLooking(false);
    }
  };

  return (
    <View style={styles.center}>
      <View style={styles.scanFrame}>
        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          barcodeScannerSettings={{ barcodeTypes: ['qr'] }}
          onBarcodeScanned={looking ? undefined : onScanned}
        />
        {looking && (
          <View style={[StyleSheet.absoluteFill, styles.scanBusy]}>
            <ActivityIndicator color={colors.onPhoto} />
          </View>
        )}
      </View>
      <Text style={styles.muted}>Hướng camera vào mã QR Forket của bạn bè</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  flex: { flex: 1 },
  tabs: {
    flexDirection: 'row',
    marginHorizontal: 16,
    marginTop: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.pill,
    padding: 4,
  },
  tab: {
    flex: 1,
    flexDirection: 'row',
    gap: 6,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  tabActive: { backgroundColor: colors.accent },
  tabText: { color: colors.textMuted, fontWeight: '700' },
  tabTextActive: { color: colors.onAccent },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 },
  muted: { color: colors.textMuted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  qrCard: {
    alignItems: 'center',
    gap: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 28,
    padding: 20,
  },
  qrUser: { flexDirection: 'row', alignItems: 'center', gap: 12, alignSelf: 'flex-start' },
  qrName: { color: colors.text, fontSize: 17, fontWeight: '800' },
  qrBox: { width: 236, height: 236, alignItems: 'center', justifyContent: 'center' },
  code: { color: colors.text, fontSize: 22, fontWeight: '900', letterSpacing: 4 },
  codeRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  copyBtn: {
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  copyBtnDone: { backgroundColor: colors.accent },
  copyPressed: { opacity: 0.7 },
  copiedText: { color: colors.accent, fontSize: 12, fontWeight: '800' },
  actions: { flexDirection: 'row', gap: 10 },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    paddingHorizontal: 20,
    height: 48,
    borderRadius: radius.pill,
  },
  primaryText: { color: colors.onAccent, fontWeight: '800', fontSize: 15 },
  secondary: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    backgroundColor: colors.surfaceHigh,
    paddingHorizontal: 20,
    height: 48,
    borderRadius: radius.pill,
  },
  secondaryText: { color: colors.text, fontWeight: '800', fontSize: 15 },
  enterTitle: { color: colors.text, fontSize: 20, fontWeight: '800' },
  codeInput: {
    alignSelf: 'stretch',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    borderRadius: 16,
    paddingHorizontal: 16,
    height: 58,
    fontSize: 22,
    fontWeight: '900',
    letterSpacing: 4,
    textAlign: 'center',
  },
  codeInputError: { borderColor: colors.danger },
  error: { color: colors.danger, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  enterBtn: { alignSelf: 'stretch', justifyContent: 'center' },
  dim: { opacity: 0.5 },
  scanFrame: {
    width: 280,
    height: 280,
    borderRadius: 32,
    overflow: 'hidden',
    borderWidth: 4,
    borderColor: colors.accent,
    backgroundColor: colors.surfaceHigh,
  },
  scanBusy: { backgroundColor: colors.overlay, alignItems: 'center', justifyContent: 'center' },
});
