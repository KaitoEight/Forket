import { Tabs } from 'expo-router/js-tabs';
import { Platform } from 'react-native';

import { FoodTabBar } from '@/components/FoodTabBar';
import { colors } from '@/constants/theme';

export default function TabLayout() {
  return (
    <Tabs
      tabBar={(props) => <FoodTabBar {...props} />}
      screenOptions={{
        headerShown: false,
        sceneStyle: { backgroundColor: colors.bg },
        // Android: ẩn thanh tab khi gõ phím để ô nhập không bị đè
        tabBarHideOnKeyboard: Platform.OS === 'android',
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Bản đồ' }} />
      <Tabs.Screen name="feed" options={{ title: 'Bảng tin' }} />
      <Tabs.Screen name="messages" options={{ title: 'Tin nhắn' }} />
      <Tabs.Screen name="profile" options={{ title: 'Hồ sơ' }} />
    </Tabs>
  );
}
