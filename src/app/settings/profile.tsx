import * as ImagePicker from 'expo-image-picker';
import { StatusBar } from 'expo-status-bar';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Avatar } from '@/components/Avatar';
import { ScreenHeader } from '@/components/SettingsUI';
import { colors, radius, statusBarStyle } from '@/constants/theme';
import { useAuth } from '@/lib/auth';
import { removeAvatar, updateMyProfile, uploadAvatar } from '@/services/profileService';
import { appAlert } from '@/lib/appAlert';
import { goBack } from '@/lib/navigation';

const BIO_MAX = 150;

export default function EditProfileScreen() {
  const insets = useSafeAreaInsets();
  const { profile, refreshProfile } = useAuth();
  const [name, setName] = useState(profile?.display_name ?? '');
  const [bio, setBio] = useState(profile?.bio ?? '');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  const dirty = name.trim() !== (profile?.display_name ?? '') || bio.trim() !== (profile?.bio ?? '');

  const pickAvatar = async () => {
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ['images'],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (result.canceled || !result.assets?.[0]) return;
    setUploading(true);
    try {
      await uploadAvatar(result.assets[0]);
      await refreshProfile();
    } catch (e: any) {
      appAlert('Không đổi được ảnh', e?.message ?? String(e));
    } finally {
      setUploading(false);
    }
  };

  const avatarOptions = () => {
    if (!profile?.avatar_url) return pickAvatar();
    appAlert('Ảnh đại diện', undefined, [
      { text: 'Chọn ảnh mới', icon: 'image-outline', onPress: pickAvatar },
      {
        text: 'Gỡ ảnh',
        icon: 'trash-outline',
        style: 'destructive',
        onPress: async () => {
          try {
            await removeAvatar();
            await refreshProfile();
          } catch (e: any) {
            appAlert('Không gỡ được ảnh', e?.message ?? String(e));
          }
        },
      },
      { text: 'Đóng', style: 'cancel' },
    ]);
  };

  const save = async () => {
    setSaving(true);
    try {
      await updateMyProfile({ display_name: name, bio });
      await refreshProfile();
      goBack();
    } catch (e: any) {
      appAlert('Không lưu được', e?.message ?? String(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { paddingTop: insets.top + 8 }]}
      behavior="padding"
    >
      <StatusBar style={statusBarStyle} />
      <ScreenHeader
        title="Sửa hồ sơ"
        right={
          <Pressable
            style={[styles.saveBtn, (!dirty || saving) && styles.saveBtnIdle]}
            onPress={save}
            disabled={!dirty || saving}
          >
            {saving ? (
              <ActivityIndicator size="small" color={colors.onAccent} />
            ) : (
              <Text style={[styles.saveText, !dirty && styles.saveTextIdle]}>Lưu</Text>
            )}
          </Pressable>
        }
      />

      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 24 }]}
        keyboardShouldPersistTaps="handled"
      >
        <Pressable style={styles.avatarBox} onPress={avatarOptions} disabled={uploading}>
          {profile && (
            <Avatar name={profile.display_name} seed={profile.username} uri={profile.avatar_url} size={104} />
          )}
          {uploading && (
            <View style={styles.avatarBusy}>
              <ActivityIndicator color={colors.onPhoto} />
            </View>
          )}
          <Text style={styles.avatarLink}>{profile?.avatar_url ? 'Đổi ảnh đại diện' : 'Thêm ảnh đại diện'}</Text>
        </Pressable>

        <View style={styles.field}>
          <Text style={styles.label}>Tên hiển thị</Text>
          <TextInput
            style={styles.input}
            value={name}
            onChangeText={setName}
            maxLength={40}
            placeholder="vd: An Nguyễn"
            placeholderTextColor={colors.textMuted}
            autoCapitalize="words"
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>Username</Text>
          <View style={[styles.input, styles.inputLocked]}>
            <Text style={styles.locked}>@{profile?.username}</Text>
          </View>
          <Text style={styles.hint}>Username không đổi được.</Text>
        </View>

        <View style={styles.field}>
          <View style={styles.labelRow}>
            <Text style={styles.label}>Bio</Text>
            <Text style={styles.counter}>
              {bio.length}/{BIO_MAX}
            </Text>
          </View>
          <TextInput
            style={[styles.input, styles.bioInput]}
            value={bio}
            onChangeText={setBio}
            maxLength={BIO_MAX}
            multiline
            placeholder="Món tủ của bạn, quán ruột, khẩu vị… vd: Fan cứng bún bò, ghét hành 🌶️"
            placeholderTextColor={colors.textMuted}
          />
        </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.bg },
  content: { padding: 16, gap: 18 },
  saveBtn: {
    minWidth: 64,
    height: 40,
    paddingHorizontal: 16,
    borderRadius: radius.pill,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveBtnIdle: { backgroundColor: colors.surfaceHigh },
  saveText: { color: colors.onAccent, fontWeight: '800' },
  saveTextIdle: { color: colors.textMuted },
  avatarBox: { alignItems: 'center', gap: 10, paddingVertical: 8 },
  avatarBusy: {
    position: 'absolute',
    top: 8,
    width: 104,
    height: 104,
    borderRadius: 52,
    backgroundColor: colors.overlay,
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarLink: { color: colors.accent, fontWeight: '800', fontSize: 14 },
  field: { gap: 6 },
  labelRow: { flexDirection: 'row', justifyContent: 'space-between' },
  label: { color: colors.text, fontWeight: '700', fontSize: 14 },
  counter: { color: colors.textMuted, fontSize: 12 },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    color: colors.text,
    borderRadius: 14,
    paddingHorizontal: 14,
    minHeight: 48,
    fontSize: 16,
    justifyContent: 'center',
  },
  inputLocked: { backgroundColor: colors.surfaceHigh },
  locked: { color: colors.textMuted, fontSize: 16 },
  bioInput: { minHeight: 96, paddingTop: 12, paddingBottom: 12, textAlignVertical: 'top' },
  hint: { color: colors.textMuted, fontSize: 12 },
});
