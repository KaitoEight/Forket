import { StatusBar } from 'expo-status-bar';
import { Pressable, StyleSheet, Text } from 'react-native';

import { Onboarding } from '@/components/Onboarding';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { goBack } from '@/lib/navigation';

/** Xem lại các slide giới thiệu (mở từ Cài đặt) */
export default function IntroScreen() {
  return (
    <>
      <StatusBar style={statusBarStyle} />
      <Onboarding
        footer={
          <Pressable style={styles.primary} onPress={() => goBack()}>
            <Text style={styles.primaryText}>Bắt đầu thôi</Text>
          </Pressable>
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  primary: {
    backgroundColor: colors.accent,
    height: 54,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: { color: colors.onAccent, fontWeight: '800', fontSize: 16 },
});
