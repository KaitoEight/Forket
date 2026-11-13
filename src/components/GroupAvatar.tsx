import Ionicons from '@expo/vector-icons/Ionicons';
import { Image } from 'expo-image';
import { StyleSheet, View } from 'react-native';

import { colors } from '@/constants/theme';

/** Ảnh nhóm chat: ảnh đã đặt, không thì icon nhóm */
export function GroupAvatar({ uri, size = 52 }: { uri?: string | null; size?: number }) {
  return (
    <View style={[styles.circle, { width: size, height: size, borderRadius: size / 2 }]}>
      {uri ? (
        <Image source={{ uri }} style={StyleSheet.absoluteFill} contentFit="cover" transition={120} />
      ) : (
        <Ionicons name="people" size={size * 0.46} color={colors.accent} />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  circle: {
    backgroundColor: colors.accentSoft,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
});
