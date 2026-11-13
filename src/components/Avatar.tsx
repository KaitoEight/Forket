import { Image } from 'expo-image';
import { StyleSheet, Text, View } from 'react-native';

const PALETTE = ['#FF8A65', '#4FC3F7', '#81C784', '#BA68C8', '#FFD54F', '#F06292', '#4DB6AC', '#9575CD'];

function colorFor(seed: string) {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) | 0;
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return '?';
  const first = parts[0][0];
  const last = parts.length > 1 ? parts[parts.length - 1][0] : '';
  return (first + last).toUpperCase();
}

/** Avatar tròn: ảnh đại diện nếu có, không thì chữ cái đầu (màu cố định theo username) */
export function Avatar({
  name,
  seed,
  size = 40,
  uri,
}: {
  name: string;
  seed: string;
  size?: number;
  uri?: string | null;
}) {
  return (
    <View
      style={[
        styles.circle,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: colorFor(seed) },
      ]}
    >
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
      ) : (
        <Text style={[styles.text, { fontSize: size * 0.4 }]}>{initials(name)}</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: { alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  text: { color: '#1A1A1A', fontWeight: '800' },
});
