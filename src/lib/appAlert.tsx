import Ionicons from '@expo/vector-icons/Ionicons';
import { useEffect, useState, type ComponentProps } from 'react';
import { Alert, Modal, Platform, Pressable, StyleSheet, Text, View, type AlertButton } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

export type AppAlertButton = AlertButton & {
  /** Icon hiện bên trái nút (chỉ trong bảng chọn tự vẽ) */
  icon?: IconName;
};

type Dialog = { id: number; title: string; message?: string; buttons: AppAlertButton[] };

let nextId = 0;
let queue: Dialog[] = [];
let notify: ((d: Dialog | null) => void) | null = null;

/**
 * Thay cho Alert.alert, cùng cách gọi.
 * - Có ≥ 2 nút (menu, xác nhận) → bảng chọn tự vẽ: có màu, icon, luôn có nút Đóng, bấm ra ngoài để tắt.
 *   (Alert gốc của Android chỉ hiện tối đa 3 nút và không bấm ra ngoài để tắt được; trên web thì không hiện gì.)
 * - Thông báo đơn giản trên điện thoại → Alert gốc (không bị chồng lên các popup khác đang mở).
 */
export function appAlert(title: string, message?: string, buttons?: AppAlertButton[]) {
  const list = buttons?.length ? buttons : [{ text: 'OK' }];
  if (Platform.OS !== 'web' && list.length < 2) {
    Alert.alert(title, message, list);
    return;
  }
  // Luôn có cách đóng
  const withCancel = list.some((b) => b.style === 'cancel') ? list : [...list, { text: 'Đóng', style: 'cancel' as const }];
  queue.push({ id: ++nextId, title, message, buttons: withCancel });
  if (queue.length === 1) notify?.(queue[0]);
}

function closeCurrent() {
  queue = queue.slice(1);
  notify?.(queue[0] ?? null);
}

/** Nơi hiện bảng chọn — đặt 1 lần ở layout gốc */
export function AlertHost() {
  const insets = useSafeAreaInsets();
  const [dialog, setDialog] = useState<Dialog | null>(() => queue[0] ?? null);

  useEffect(() => {
    notify = setDialog;
    return () => {
      notify = null;
    };
  }, []);

  if (!dialog) return null;

  const press = (b?: AppAlertButton) => {
    closeCurrent();
    // Đợi bảng đóng rồi mới chạy (nút có thể mở tiếp 1 bảng khác)
    if (b?.onPress) setTimeout(() => b.onPress?.(), 0);
  };

  const cancel = dialog.buttons.find((b) => b.style === 'cancel');
  const actions = dialog.buttons.filter((b) => b.style !== 'cancel');

  return (
    <Modal visible transparent animationType="fade" statusBarTranslucent onRequestClose={() => press(cancel)}>
      <Pressable style={styles.backdrop} onPress={() => press(cancel)} accessibilityLabel="Đóng">
        <Pressable style={[styles.sheet, { paddingBottom: insets.bottom + 16 }]} onPress={() => {}}>
          <View style={styles.handle} />
          <Text style={styles.title} numberOfLines={2}>
            {dialog.title}
          </Text>
          {!!dialog.message && <Text style={styles.message}>{dialog.message}</Text>}

          <View style={styles.actions}>
            {actions.map((b, i) => {
              const danger = b.style === 'destructive';
              return (
                <Pressable
                  key={`${dialog.id}-${i}`}
                  style={({ pressed }) => [styles.action, danger ? styles.actionDanger : styles.actionDefault, pressed && styles.pressed]}
                  onPress={() => press(b)}
                >
                  {b.icon && (
                    <View style={[styles.iconWrap, danger ? styles.iconDanger : styles.iconDefault]}>
                      <Ionicons name={b.icon} size={18} color={danger ? colors.danger : colors.accent} />
                    </View>
                  )}
                  <Text style={[styles.actionText, danger ? styles.textDanger : styles.textDefault]}>
                    {b.text ?? 'OK'}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Pressable style={({ pressed }) => [styles.cancel, pressed && styles.pressed]} onPress={() => press(cancel)}>
            <Text style={styles.cancelText}>{cancel?.text ?? 'Đóng'}</Text>
          </Pressable>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: colors.overlay, justifyContent: 'flex-end', alignItems: 'center' },
  sheet: {
    width: '100%',
    maxWidth: 520,
    backgroundColor: colors.bg,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingTop: 10,
    paddingHorizontal: 16,
    gap: 6,
  },
  handle: { alignSelf: 'center', width: 40, height: 5, borderRadius: 3, backgroundColor: colors.border, marginBottom: 6 },
  title: { color: colors.text, fontSize: 18, fontWeight: '800', textAlign: 'center' },
  message: { color: colors.textMuted, fontSize: 14, lineHeight: 20, textAlign: 'center' },
  actions: { gap: 8, marginTop: 10 },
  action: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    minHeight: 54,
    paddingHorizontal: 14,
    borderRadius: 18,
    borderWidth: 1,
  },
  actionDefault: { backgroundColor: colors.surface, borderColor: colors.border },
  actionDanger: { backgroundColor: colors.dangerFaint, borderColor: colors.dangerBorder },
  iconWrap: { width: 34, height: 34, borderRadius: 11, alignItems: 'center', justifyContent: 'center' },
  iconDefault: { backgroundColor: colors.accentSoft },
  iconDanger: { backgroundColor: colors.dangerSoft },
  actionText: { flex: 1, fontSize: 16, fontWeight: '700' },
  textDefault: { color: colors.text },
  textDanger: { color: colors.danger },
  cancel: {
    marginTop: 6,
    height: 52,
    borderRadius: radius.pill,
    backgroundColor: colors.brown,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: { color: colors.onAccent, fontSize: 16, fontWeight: '800' },
  pressed: { opacity: 0.8 },
});
