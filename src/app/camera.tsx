import Ionicons from '@expo/vector-icons/Ionicons';
import { CameraView, useCameraPermissions, type CameraType } from 'expo-camera';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  useWindowDimensions,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { IconButton } from '@/components/IconButton';
import { StarRating } from '@/components/StarRating';
import { colors, radius } from '@/constants/theme';
import { useKeyboardVisible } from '@/hooks/useKeyboardVisible';
import { useVerticalSwipe } from '@/hooks/useVerticalSwipe';
import {
  contributeNewPlace,
  fetchNearbyRecommendations,
  findDuplicatePlace,
  getCurrentLocationAndAddress,
  searchRadiusFor,
  type CurrentLocation,
  type NearbyPlace,
} from '@/services/placeService';
import { createPost, squarePhoto } from '@/services/postService';
import { saveReview } from '@/services/reviewService';

type PlaceChoice = { kind: 'existing'; place: NearbyPlace } | { kind: 'new' } | null;

export default function CameraScreen() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const size = Math.min(width - 16, 520);

  const [permission, requestPermission] = useCameraPermissions();
  const cameraRef = useRef<CameraView>(null);
  const [facing, setFacing] = useState<CameraType>('back');
  const [flash, setFlash] = useState(false);
  const [capturing, setCapturing] = useState(false);

  const [photoUri, setPhotoUri] = useState<string | null>(null);
  const [caption, setCaption] = useState('');
  const [sending, setSending] = useState(false);

  const [loc, setLoc] = useState<CurrentLocation | null>(null);
  const [locFailed, setLocFailed] = useState(false);
  // Mở từ nút "Check-in" của 1 quán trên bản đồ → chọn sẵn quán đó
  const params = useLocalSearchParams<{ placeId?: string; placeName?: string }>();
  const presetPlace: NearbyPlace | null =
    params.placeId && params.placeName
      ? { id: params.placeId, name: params.placeName, distance_meters: 0 }
      : null;
  const [nearby, setNearby] = useState<NearbyPlace[]>(() => (presetPlace ? [presetPlace] : []));
  const [choice, setChoice] = useState<PlaceChoice>(() =>
    presetPlace ? { kind: 'existing', place: presetPlace } : null
  );
  const [newPlaceName, setNewPlaceName] = useState('');
  const [rating, setRating] = useState(0);

  const keyboard = useKeyboardVisible();

  // Vuốt xuống (khi chưa chụp) → đóng camera
  const swipeHandlers = useVerticalSwipe({
    onSwipeDown: () => router.back(),
    enabled: () => !photoUri && !keyboard.visible,
  });

  // Lấy vị trí ngầm khi mở app để gợi ý quán gần đây
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const current = await getCurrentLocationAndAddress();
        if (cancelled) return;
        setLoc(current);
        // Bán kính giãn theo sai số GPS để không bỏ sót quán ngay cạnh
        const found = await fetchNearbyRecommendations(
          current.latitude,
          current.longitude,
          searchRadiusFor(current.accuracy)
        ).catch((e) => {
          console.warn('Không tải được quán gần đây:', e);
          return [] as NearbyPlace[];
        });
        if (cancelled) return;
        setNearby((prev) => {
          const preset = prev.filter((p) => !found.some((f) => f.id === p.id));
          return [...preset, ...found];
        });
        // Chưa chọn quán nào → gợi ý quán gần nhất
        if (found.length > 0) setChoice((prev) => prev ?? { kind: 'existing', place: found[0] });
      } catch (e) {
        console.warn('Không lấy được vị trí:', e);
        if (!cancelled) setLocFailed(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const takePhoto = async () => {
    if (!cameraRef.current || capturing) return;
    setCapturing(true);
    try {
      const pic = await cameraRef.current.takePictureAsync({ quality: 0.8 });
      setPhotoUri(await squarePhoto(pic.uri, pic.width, pic.height));
    } catch (e: any) {
      Alert.alert('Không chụp được ảnh', e?.message ?? String(e));
    } finally {
      setCapturing(false);
    }
  };

  const discard = () => {
    setPhotoUri(null);
    setCaption('');
    setRating(0);
  };

  const send = async () => {
    if (!photoUri || sending) return;
    // Cú chạm để đóng bàn phím lỡ rơi trúng nút Gửi → bỏ qua, chưa gửi
    if (keyboard.visible || keyboard.justHidden()) {
      Keyboard.dismiss();
      return;
    }
    if (choice?.kind === 'new' && !newPlaceName.trim()) {
      Alert.alert('Thiếu tên quán', 'Nhập tên quán để ghim lên bản đồ nhé!');
      return;
    }

    setSending(true);
    try {
      let placeId: string | null = null;
      if (choice?.kind === 'existing') {
        placeId = choice.place.id;
      } else if (choice?.kind === 'new' && loc) {
        // Quán này đã có người ghim gần đây → dùng lại, không tạo trùng
        const duplicate = findDuplicatePlace(newPlaceName, nearby);
        if (duplicate) {
          placeId = duplicate.id;
          setChoice({ kind: 'existing', place: duplicate });
          setNewPlaceName('');
        }
      }
      if (choice?.kind === 'new' && loc && !placeId) {
        const created = await contributeNewPlace(
          newPlaceName,
          loc.latitude,
          loc.longitude,
          loc.address
        );
        placeId = created.id;
        const added = { id: created.id, name: created.name, distance_meters: 0 };
        setNearby((prev) => [added, ...prev]);
        setChoice({ kind: 'existing', place: added });
        setNewPlaceName('');
      }

      await createPost({
        localUri: photoUri,
        caption,
        placeId,
        lat: loc?.latitude,
        lng: loc?.longitude,
      });
      // Chấm sao nhanh → lưu thành đánh giá của tôi cho quán (giữ bình luận cũ nếu có)
      if (placeId && rating > 0) {
        await saveReview(placeId, rating).catch((e) =>
          console.warn('Không lưu được đánh giá:', e?.message ?? e)
        );
      }
      discard();
      // Đóng camera → mở Bảng tin để thấy món vừa đăng
      router.back();
      router.navigate('/feed');
    } catch (e: any) {
      Alert.alert('Gửi thất bại', e?.message ?? String(e));
    } finally {
      setSending(false);
    }
  };

  if (!permission) return <View style={styles.screen} />;

  if (!permission.granted) {
    return (
      <View style={[styles.screen, styles.permission]}>
        <StatusBar style="dark" />
        <Ionicons name="camera" size={56} color={colors.accent} />
        <Text style={styles.permissionTitle}>Forket cần dùng camera</Text>
        <Text style={styles.permissionText}>
          để bạn chụp và chia sẻ món ngon cùng bạn bè.
        </Text>
        <Pressable style={styles.primaryBtn} onPress={requestPermission}>
          <Text style={styles.primaryBtnText}>Cho phép camera</Text>
        </Pressable>
      </View>
    );
  }

  const locationLabel =
    choice?.kind === 'existing'
      ? choice.place.name
      : choice?.kind === 'new'
        ? newPlaceName.trim() || 'Quán mới'
        : loc
          ? loc.address.split(',')[0] || 'Vị trí hiện tại'
          : locFailed
            ? 'Không có vị trí'
            : 'Đang tìm vị trí…';

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
    >
      <StatusBar style="dark" />
      <View
        style={[styles.content, { paddingTop: insets.top + 8, paddingBottom: insets.bottom + 8 }]}
        {...swipeHandlers}
      >
        {/* Thanh trên: đóng · vị trí */}
        <View style={styles.topBar}>
          <IconButton icon="close" label="Đóng camera" onPress={() => router.back()} />
          <View style={styles.locationPill}>
            <Ionicons name="location" size={14} color={colors.accent} />
            <Text style={styles.locationText} numberOfLines={1}>
              {locationLabel}
            </Text>
          </View>
          <View style={styles.controlSpacer} />
        </View>

        <View style={styles.center}>
          {/* Khung ảnh vuông bo góc — chạm vào ảnh để đóng bàn phím */}
          <Pressable
            style={[styles.viewfinder, { width: size, height: size }]}
            onPress={photoUri ? Keyboard.dismiss : undefined}
            disabled={!photoUri}
            accessible={false}
          >
            {photoUri ? (
              <Image source={{ uri: photoUri }} style={StyleSheet.absoluteFill} contentFit="cover" />
            ) : (
              <CameraView
                ref={cameraRef}
                style={StyleSheet.absoluteFill}
                facing={facing}
                flash={flash ? 'on' : 'off'}
                mirror={facing === 'front'}
              />
            )}

            {photoUri && (
              <TextInput
                style={styles.captionInput}
                value={caption}
                onChangeText={setCaption}
                placeholder="Thêm lời nhắn…"
                placeholderTextColor="rgba(255,255,255,0.8)"
                maxLength={60}
                returnKeyType="done"
                submitBehavior="blurAndSubmit"
              />
            )}

            {capturing && (
              <View style={[StyleSheet.absoluteFill, styles.busy]}>
                <ActivityIndicator color={colors.onPhoto} />
              </View>
            )}
          </Pressable>

          {/* Chọn quán (chỉ hiện sau khi chụp) */}
          {photoUri && (
            <View style={styles.placePicker}>
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                contentContainerStyle={styles.chips}
                keyboardShouldPersistTaps="handled"
              >
                {nearby.map((p) => {
                  const selected = choice?.kind === 'existing' && choice.place.id === p.id;
                  return (
                    <Pressable
                      key={p.id}
                      style={[styles.chip, selected && styles.chipSelected]}
                      onPress={() => setChoice(selected ? null : { kind: 'existing', place: p })}
                    >
                      <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                        🍽️ {p.name} · {Math.round(p.distance_meters)}m
                      </Text>
                    </Pressable>
                  );
                })}
                <Pressable
                  disabled={!loc}
                  style={[
                    styles.chip,
                    choice?.kind === 'new' && styles.chipSelected,
                    !loc && styles.chipDisabled,
                  ]}
                  onPress={() => setChoice(choice?.kind === 'new' ? null : { kind: 'new' })}
                >
                  <Text style={[styles.chipText, choice?.kind === 'new' && styles.chipTextSelected]}>
                    ＋ Quán mới
                  </Text>
                </Pressable>
              </ScrollView>

              {choice?.kind === 'new' && (
                <TextInput
                  style={styles.newPlaceInput}
                  value={newPlaceName}
                  onChangeText={setNewPlaceName}
                  placeholder="Tên quán (VD: Bún bò cô Ba)"
                  placeholderTextColor={colors.textMuted}
                  returnKeyType="done"
                  submitBehavior="blurAndSubmit"
                  autoFocus
                />
              )}
              {choice && (
                <View style={styles.ratingRow}>
                  <Text style={styles.ratingLabel}>Chấm điểm quán</Text>
                  <StarRating value={rating} onChange={setRating} size={26} />
                </View>
              )}
              {choice?.kind === 'new' && loc && (
                <Text style={[styles.gpsHint, loc.accuracy > 50 && styles.gpsHintWarn]}>
                  {loc.accuracy > 50
                    ? `GPS lệch ±${Math.round(loc.accuracy)}m — ra chỗ thoáng để ghim chính xác hơn`
                    : `GPS chính xác ±${Math.round(loc.accuracy)}m`}
                </Text>
              )}
            </View>
          )}
        </View>

        {/* Hàng nút điều khiển. Đang gõ phím → chỉ hiện nút "Xong", không hiện nút Gửi */}
        <View style={styles.controls}>
          {photoUri && keyboard.visible ? (
            <Pressable style={styles.doneBtn} onPress={Keyboard.dismiss}>
              <Ionicons name="checkmark" size={18} color={colors.onAccent} />
              <Text style={styles.doneText}>Xong</Text>
            </Pressable>
          ) : photoUri ? (
            <>
              <IconButton icon="close" label="Huỷ ảnh" size={30} onPress={discard} disabled={sending} />
              <Pressable
                accessibilityLabel="Gửi"
                style={({ pressed }) => [styles.sendBtn, pressed && styles.pressed]}
                onPress={send}
                disabled={sending}
              >
                {sending ? (
                  <ActivityIndicator color={colors.onAccent} />
                ) : (
                  <Ionicons name="paper-plane" size={34} color={colors.onAccent} />
                )}
              </Pressable>
              <View style={styles.controlSpacer} />
            </>
          ) : (
            <>
              <IconButton
                icon={flash ? 'flash' : 'flash-off'}
                label="Đèn flash"
                size={26}
                color={flash ? colors.accent : colors.text}
                onPress={() => setFlash((f) => !f)}
              />
              <Pressable
                accessibilityLabel="Chụp ảnh"
                style={({ pressed }) => [styles.shutterRing, pressed && styles.pressed]}
                onPress={takePhoto}
                disabled={capturing}
              >
                <View style={styles.shutterInner} />
              </Pressable>
              <IconButton
                icon="camera-reverse"
                label="Đổi camera"
                size={28}
                onPress={() => setFacing((f) => (f === 'back' ? 'front' : 'back'))}
              />
            </>
          )}
        </View>

        {!photoUri && <Text style={styles.hint}>Vuốt xuống để đóng</Text>}
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { flex: 1 },
  topBar: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    gap: 12,
  },
  locationPill: {
    flexShrink: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  locationText: { color: colors.text, fontWeight: '600', fontSize: 14, flexShrink: 1 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: 14 },
  viewfinder: {
    borderRadius: radius.viewfinder,
    overflow: 'hidden',
    backgroundColor: colors.surface,
    borderCurve: 'continuous',
  },
  captionInput: {
    position: 'absolute',
    bottom: 20,
    alignSelf: 'center',
    maxWidth: '85%',
    minWidth: 160,
    textAlign: 'center',
    color: colors.onPhoto,
    fontSize: 16,
    fontWeight: '700',
    backgroundColor: colors.overlay,
    paddingHorizontal: 18,
    paddingVertical: 10,
    borderRadius: radius.pill,
  },
  busy: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.overlay },
  placePicker: { width: '100%', gap: 10 },
  chips: { paddingHorizontal: 16, gap: 8 },
  chip: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: radius.pill,
  },
  chipSelected: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipDisabled: { opacity: 0.4 },
  chipText: { color: colors.text, fontWeight: '600', fontSize: 13 },
  chipTextSelected: { color: colors.onAccent },
  newPlaceInput: {
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 14,
    height: 44,
    fontSize: 15,
  },
  doneBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    paddingHorizontal: 22,
    height: 48,
    borderRadius: radius.pill,
  },
  doneText: { color: colors.onAccent, fontWeight: '800', fontSize: 16 },
  hint: { color: colors.textMuted, fontSize: 12, textAlign: 'center', paddingBottom: 6 },
  bottomRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
  ratingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginHorizontal: 16,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 14,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  ratingLabel: { color: colors.text, fontWeight: '600', fontSize: 14 },
  badge: {
    position: 'absolute',
    top: -2,
    right: -2,
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 4,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: colors.bg,
  },
  badgeText: { color: '#fff', fontSize: 10, fontWeight: '800' },
  gpsHint: { color: colors.textMuted, fontSize: 12, marginHorizontal: 16 },
  gpsHintWarn: { color: colors.accent },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-evenly',
    paddingVertical: 12,
  },
  controlSpacer: { width: 52 },
  shutterRing: {
    width: 84,
    height: 84,
    borderRadius: 42,
    borderWidth: 4,
    borderColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  shutterInner: { width: 66, height: 66, borderRadius: 33, backgroundColor: colors.accent },
  sendBtn: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { transform: [{ scale: 0.92 }] },
  historyHint: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    paddingVertical: 10,
  },
  historyHintText: { color: colors.text, fontWeight: '700', fontSize: 15 },
  permission: { alignItems: 'center', justifyContent: 'center', padding: 32, gap: 12 },
  permissionTitle: { color: colors.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  permissionText: { color: colors.textMuted, fontSize: 15, textAlign: 'center' },
  primaryBtn: {
    marginTop: 12,
    backgroundColor: colors.accent,
    paddingHorizontal: 28,
    paddingVertical: 14,
    borderRadius: radius.pill,
  },
  primaryBtnText: { color: colors.onAccent, fontWeight: '800', fontSize: 16 },
});
