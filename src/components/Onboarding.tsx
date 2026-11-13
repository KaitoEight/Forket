import Ionicons from '@expo/vector-icons/Ionicons';
import { useRef, useState, type ComponentProps, type ReactNode } from 'react';
import { FlatList, Pressable, StyleSheet, Text, useWindowDimensions, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, radius } from '@/constants/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

type Slide = {
  key: string;
  kicker: string;
  title: string;
  body: string;
  icon: IconName;
  badges: { icon: IconName; label: string }[];
  tint: string;
};

const SLIDES: Slide[] = [
  {
    key: 'snap',
    kicker: 'Chụp & ghim',
    title: 'Ăn món gì,\nchụp món đó',
    body: 'Một tấm ảnh vuông, một dòng lời nhắn, quán tự gắn theo GPS. Bạn bè thấy ngay trên Bảng tin.',
    icon: 'camera',
    badges: [
      { icon: 'location', label: 'Bún bò cô Ba' },
      { icon: 'star', label: '4.5' },
    ],
    tint: colors.accentSoft,
  },
  {
    key: 'map',
    kicker: 'Bản đồ của hội',
    title: 'Xem bạn bè\nđã ăn ở đâu',
    body: 'Lọc theo đồ ăn, đồ uống, hoặc theo từng người bạn. Quán nào cả hội đi nhiều là biết liền.',
    icon: 'map',
    badges: [
      { icon: 'cafe', label: 'Cà phê' },
      { icon: 'people', label: '3 bạn đã đến' },
    ],
    tint: colors.caramelSoft,
  },
  {
    key: 'go',
    kicker: 'Rủ nhau đi',
    title: 'Gửi quán vào chat,\nvote là đi',
    body: 'Chia sẻ một quán cho nhóm, hoặc rủ đi ăn kèm vote Đi / Thôi. Hết cảnh “ăn gì giờ?”.',
    icon: 'chatbubbles',
    badges: [
      { icon: 'restaurant', label: 'Rủ đi ăn' },
      { icon: 'checkmark-circle', label: '4 người Đi' },
    ],
    tint: colors.accentSoft,
  },
];

/** Các slide giới thiệu app. `footer` nằm ở slide cuối (nút đăng ký / đăng nhập). */
export function Onboarding({
  footer,
  onSkip,
}: {
  footer: ReactNode;
  /** Có → hiện nút "Bỏ qua" nhảy thẳng tới slide cuối */
  onSkip?: () => void;
}) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const listRef = useRef<FlatList<Slide>>(null);
  const [index, setIndex] = useState(0);
  const last = index === SLIDES.length - 1;

  const goTo = (i: number) => {
    listRef.current?.scrollToIndex({ index: i, animated: true });
    setIndex(i);
  };

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12, paddingBottom: insets.bottom + 16 }]}>
      <View style={styles.top}>
        <View style={styles.brand}>
          <Ionicons name="leaf" size={18} color={colors.accent} />
          <Text style={styles.brandText}>Forket</Text>
        </View>
        {!last && (
          <Pressable
            hitSlop={10}
            onPress={() => {
              goTo(SLIDES.length - 1);
              onSkip?.();
            }}
          >
            <Text style={styles.skip}>Bỏ qua</Text>
          </Pressable>
        )}
      </View>

      <FlatList
        ref={listRef}
        data={SLIDES}
        horizontal
        pagingEnabled
        showsHorizontalScrollIndicator={false}
        keyExtractor={(s) => s.key}
        getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
        onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
        renderItem={({ item }) => (
          <View style={[styles.slide, { width }]}>
            <Illustration slide={item} />
            <Text style={styles.kicker}>{item.kicker}</Text>
            <Text style={styles.title}>{item.title}</Text>
            <Text style={styles.body}>{item.body}</Text>
          </View>
        )}
      />

      <View style={styles.dots}>
        {SLIDES.map((s, i) => (
          <Pressable key={s.key} hitSlop={6} onPress={() => goTo(i)} accessibilityLabel={`Trang ${i + 1}`}>
            <View style={[styles.dot, i === index && styles.dotActive]} />
          </Pressable>
        ))}
      </View>

      <View style={styles.bottom}>
        <View style={styles.promise}>
          <Ionicons name="shield-checkmark" size={16} color={colors.accent} />
          <Text style={styles.promiseText}>Review chân thật, từ bạn bè</Text>
        </View>
        {last ? (
          footer
        ) : (
          <Pressable style={styles.next} onPress={() => goTo(index + 1)}>
            <Text style={styles.nextText}>Tiếp</Text>
            <Ionicons name="arrow-forward" size={18} color={colors.onAccent} />
          </Pressable>
        )}
      </View>
    </View>
  );
}

/** Minh hoạ: khối tròn màu + icon lớn + 2 nhãn nhỏ như thẻ trong app */
function Illustration({ slide }: { slide: Slide }) {
  return (
    <View style={styles.art}>
      <View style={[styles.blob, { backgroundColor: slide.tint }]}>
        <View style={styles.iconCard}>
          <Ionicons name={slide.icon} size={56} color={colors.accent} />
        </View>
      </View>
      <View style={[styles.badge, styles.badgeLeft]}>
        <Ionicons name={slide.badges[0].icon} size={14} color={colors.caramel} />
        <Text style={styles.badgeText}>{slide.badges[0].label}</Text>
      </View>
      <View style={[styles.badge, styles.badgeRight]}>
        <Ionicons name={slide.badges[1].icon} size={14} color={colors.accent} />
        <Text style={styles.badgeText}>{slide.badges[1].label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 24 },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  brandText: { color: colors.text, fontSize: 20, fontWeight: '900' },
  skip: { color: colors.textMuted, fontWeight: '700', fontSize: 15 },
  slide: { paddingHorizontal: 28, justifyContent: 'center' },
  art: { height: 260, alignItems: 'center', justifyContent: 'center', marginBottom: 28 },
  blob: { width: 220, height: 220, borderRadius: 110, alignItems: 'center', justifyContent: 'center' },
  iconCard: {
    width: 116,
    height: 116,
    borderRadius: 32,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    transform: [{ rotate: '-6deg' }],
  },
  badge: {
    position: 'absolute',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.pill,
  },
  badgeLeft: { left: 8, top: 36 },
  badgeRight: { right: 8, bottom: 36 },
  badgeText: { color: colors.text, fontWeight: '700', fontSize: 13 },
  kicker: { color: colors.caramel, fontWeight: '800', fontSize: 13, textTransform: 'uppercase', letterSpacing: 1 },
  title: { color: colors.text, fontSize: 32, lineHeight: 38, fontWeight: '900', marginTop: 8 },
  body: { color: colors.textMuted, fontSize: 16, lineHeight: 23, marginTop: 12 },
  dots: { flexDirection: 'row', justifyContent: 'center', gap: 8, marginVertical: 16 },
  dot: { width: 8, height: 8, borderRadius: 4, backgroundColor: colors.border },
  dotActive: { width: 24, backgroundColor: colors.accent },
  bottom: { paddingHorizontal: 24, gap: 14 },
  promise: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 6 },
  promiseText: { color: colors.accent, fontWeight: '800', fontSize: 14 },
  next: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    backgroundColor: colors.accent,
    height: 54,
    borderRadius: radius.pill,
  },
  nextText: { color: colors.onAccent, fontWeight: '800', fontSize: 16 },
});
