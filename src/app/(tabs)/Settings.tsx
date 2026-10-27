import React, { useCallback, useRef, useState } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  TouchableOpacity,
  Switch,
  Alert,
  Image,
  ActivityIndicator,
  Dimensions,
  useColorScheme,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as ImagePicker from 'expo-image-picker';
import { AppText } from '@/components/AppText';
import { AppButton } from '@/components/AppButton';
import { Colors, Spacing, Radius, FontSize, FontWeight } from '@/constants/theme';
import { useAuthStore } from '@/store/auth';
import { api, ApiError, TokenStorage } from '@/RequestHandler/Request';
import { Ionicons } from '@expo/vector-icons';
import BottomSheet, { BottomSheetView, BottomSheetTextInput } from '@gorhom/bottom-sheet';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

const { width } = Dimensions.get('window');

// ── Types ─────────────────────────────────────────────────────────────────────
interface SettingRowProps {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  sublabel?: string;
  onPress?: () => void;
  right?: React.ReactNode;
  destructive?: boolean;
}

// ── Sub-components ────────────────────────────────────────────────────────────
function SectionHeader({ title }: { title: string }) {
  return (
    <AppText variant="caption" color={Colors.text.muted} style={styles.sectionHeader}>
      {title.toUpperCase()}
    </AppText>
  );
}

function SettingRow({ icon, label, sublabel, onPress, right, destructive }: SettingRowProps) {
  return (
    <TouchableOpacity
      style={styles.row}
      onPress={onPress}
      activeOpacity={onPress ? 0.7 : 1}
      disabled={!onPress}
    >
      <View style={[styles.rowIcon, destructive && styles.rowIconDestructive]}>
        <Ionicons name={icon} size={20} color={destructive ? Colors.error : Colors.text.primary} />
      </View>
      <View style={{ flex: 1 }}>
        <AppText variant="label" color={destructive ? Colors.error : Colors.text.primary}>
          {label}
        </AppText>
        {sublabel ? (
          <AppText variant="caption" color={Colors.text.muted}>{sublabel}</AppText>
        ) : null}
      </View>
      {right ?? (onPress ? <AppText style={styles.chevron} color={Colors.text.muted}>›</AppText> : null)}
    </TouchableOpacity>
  );
}

function SettingGroup({ children }: { children: React.ReactNode }) {
  return <View style={styles.group}>{children}</View>;
}

// ── Avatar ────────────────────────────────────────────────────────────────────
function Avatar({
  name,
  phone,
  imageUri,
  onEditPress,
}: {
  name?: string;
  phone?: string;
  imageUri?: string | null;
  onEditPress?: () => void;
}) {
  const initials = name
    ? name.split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase()
    : (phone ?? '?')[0].toUpperCase();

  return (
    <TouchableOpacity onPress={onEditPress} activeOpacity={0.8} style={styles.avatarWrap}>
      {imageUri ? (
        <Image source={{ uri: imageUri }} style={styles.avatar} />
      ) : (
        <View style={[styles.avatar, styles.avatarFallback]}>
          <AppText style={styles.avatarText}>{initials}</AppText>
        </View>
      )}
      <View style={styles.avatarBadge}>
        <Ionicons name="pencil" size={11} color={Colors.text.inverse} />
      </View>
    </TouchableOpacity>
  );
}

// ── Edit profile sheet content ─────────────────────────────────────────────────
function EditProfileForm({
  onSaved,
}: {
  onSaved: (updated: { firstName: string | null; lastName: string | null; email: string | null; profileImage: string | null }) => void;
}) {
  const { user } = useAuthStore();
  const [firstName, setFirstName]         = useState(user?.firstName ?? '');
  const [lastName, setLastName]           = useState(user?.lastName ?? '');
  const [email, setEmail]                 = useState(user?.email ?? '');
  const [localImageUri, setLocalImageUri] = useState<string | null>(null);
  const [uploadingPhoto, setUploadingPhoto] = useState(false);
  const [saving, setSaving]               = useState(false);
  const [error, setError]                 = useState('');

  // Preview: show picked image if available, otherwise the current stored URL
  const previewUri = localImageUri ?? user?.profileImage ?? null;

  const pickImage = async () => {
    const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') {
      Alert.alert('Permission needed', 'Allow access to your photo library to set a profile picture.');
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [1, 1],   // square crop
      quality: 0.8,
    });
    if (!result.canceled && result.assets.length > 0) {
      setLocalImageUri(result.assets[0].uri);
      setError('');
    }
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    try {
      // 1. Upload new photo first if one was picked
      let newProfileImage = user?.profileImage ?? null;
      if (localImageUri) {
        setUploadingPhoto(true);
        const asset = localImageUri;
        const ext = asset.split('.').pop()?.toLowerCase() ?? 'jpg';
        const mime = ext === 'png' ? 'image/png' : ext === 'webp' ? 'image/webp' : 'image/jpeg';
        const uploaded = await api.uploadAvatar(asset, mime);
        newProfileImage = uploaded.profileImage;
        setUploadingPhoto(false);
      }

      // 2. Patch text fields if any changed
      const patch: Record<string, string> = {};
      if (firstName.trim() !== (user?.firstName ?? '')) patch.firstName = firstName.trim();
      if (lastName.trim()  !== (user?.lastName  ?? '')) patch.lastName  = lastName.trim();
      if (email.trim()     !== (user?.email     ?? '')) patch.email     = email.trim();

      if (Object.keys(patch).length > 0) {
        const updated = await api.updateMe(patch);
        newProfileImage = updated.profileImage ?? newProfileImage;
        useAuthStore.getState().setAuth(
          { ...user!, ...patch, profileImage: newProfileImage },
          useAuthStore.getState().token!,
        );
      } else if (localImageUri) {
        // Photo was uploaded but no text fields changed — just sync the new URL
        useAuthStore.getState().setAuth(
          { ...user!, profileImage: newProfileImage },
          useAuthStore.getState().token!,
        );
      }

      onSaved({
        firstName:    user?.firstName ?? null,
        lastName:     user?.lastName  ?? null,
        email:        user?.email     ?? null,
        profileImage: newProfileImage,
      });
    } catch (err) {
      setUploadingPhoto(false);
      setError(err instanceof ApiError ? err.message : 'Save failed. Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.sheetContent}>
      <AppText variant="subheading" style={{ marginBottom: Spacing.lg }}>Edit profile</AppText>

      {/* Photo picker */}
      <TouchableOpacity style={styles.photoPicker} onPress={pickImage} activeOpacity={0.8}>
        {previewUri ? (
          <Image source={{ uri: previewUri }} style={styles.photoPreview} />
        ) : (
          <View style={styles.photoPlaceholder}>
            <Ionicons name="person" size={36} color={Colors.text.muted} />
          </View>
        )}
        <View style={styles.photoOverlay}>
          <Ionicons name="camera" size={22} color={Colors.text.inverse} />
          <AppText variant="caption" color={Colors.text.inverse} style={{ marginTop: 2 }}>
            {previewUri ? 'Change photo' : 'Add photo'}
          </AppText>
        </View>
      </TouchableOpacity>

      <AppText variant="label" style={styles.fieldLabel}>First name</AppText>
      <BottomSheetTextInput
        style={styles.sheetInput}
        placeholder="First name"
        placeholderTextColor={Colors.text.muted}
        value={firstName}
        onChangeText={setFirstName}
        autoCapitalize="words"
      />

      <AppText variant="label" style={styles.fieldLabel}>Last name</AppText>
      <BottomSheetTextInput
        style={styles.sheetInput}
        placeholder="Last name"
        placeholderTextColor={Colors.text.muted}
        value={lastName}
        onChangeText={setLastName}
        autoCapitalize="words"
      />

      <AppText variant="label" style={styles.fieldLabel}>Email address</AppText>
      <BottomSheetTextInput
        style={styles.sheetInput}
        placeholder="you@example.com"
        placeholderTextColor={Colors.text.muted}
        value={email}
        onChangeText={setEmail}
        keyboardType="email-address"
        autoCapitalize="none"
      />

      {error ? (
        <View style={styles.errorBox}>
          <AppText variant="caption" color={Colors.error}>{error}</AppText>
        </View>
      ) : null}

      <AppButton
        label={uploadingPhoto ? 'Uploading photo…' : 'Save changes'}
        onPress={handleSave}
        loading={saving}
        style={{ marginTop: Spacing.lg }}
      />
    </View>
  );
}

// ── Screen ────────────────────────────────────────────────────────────────────
export default function SettingsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuthStore();
  const [notifications, setNotifications] = useState(true);
  const [biometrics, setBiometrics]       = useState(false);
  const [loggingOut, setLoggingOut]       = useState(false);

  const sheetRef = useRef<BottomSheet>(null);
  const snapPoints = ['60%', '90%'];

  const displayName = user?.firstName
    ? `${user.firstName}${user.lastName ? ' ' + user.lastName : ''}`
    : undefined;
  const displayPhone    = user?.phone ?? '';
  const displayEmail    = user?.email;
  const profileImage    = user?.profileImage;

  const openSheet  = useCallback(() => sheetRef.current?.snapToIndex(0), []);
  const closeSheet = useCallback(() => sheetRef.current?.close(), []);

  const handleLogout = () => {
    Alert.alert('Sign out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign out',
        style: 'destructive',
        onPress: async () => {
          if (loggingOut) return;
          setLoggingOut(true);
          try {
            const refreshToken = await TokenStorage.getRefreshToken();
            if (refreshToken) await api.auth.logout({ refreshToken }).catch(() => {});
          } finally {
            await TokenStorage.clearTokens();
            logout();
            router.replace('/(auth)');
          }
        },
      },
    ]);
  };

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <ScrollView
        style={styles.container}
        contentContainerStyle={{ paddingBottom: insets.bottom + Spacing.xxl }}
        showsVerticalScrollIndicator={false}
      >
        {/* Header */}
        <View style={[styles.screenHeader, { paddingTop: insets.top + Spacing.lg }]}>
          <AppText variant="heading">Settings</AppText>
        </View>

        {/* Profile card */}
        <View style={[styles.profileCard, { marginHorizontal: Spacing.lg }]}>
          <Avatar
            name={displayName}
            phone={displayPhone}
            imageUri={profileImage}
            onEditPress={openSheet}
          />
          <View style={{ flex: 1, marginLeft: Spacing.md }}>
            <AppText variant="subheading">{displayName ?? 'Fundly User'}</AppText>
            <AppText variant="caption" color={Colors.text.muted}>{displayPhone}</AppText>
            {displayEmail ? (
              <AppText variant="caption" color={Colors.text.muted}>{displayEmail}</AppText>
            ) : null}
          </View>
          <TouchableOpacity style={styles.editBtn} onPress={openSheet} activeOpacity={0.7}>
            <AppText variant="caption" color={Colors.primary} style={{ fontWeight: FontWeight.semibold }}>
              Edit
            </AppText>
          </TouchableOpacity>
        </View>

        {/* Verification status */}
        {user && user.identityStatus !== 'VERIFIED' && (
          <TouchableOpacity
            style={[styles.verifyBanner, { marginHorizontal: Spacing.lg }]}
            activeOpacity={0.8}
            onPress={() => {}}
          >
            <Ionicons name="shield-checkmark-outline" size={28} color={Colors.primary} />
            <View style={{ flex: 1, marginLeft: Spacing.sm }}>
              <AppText variant="label">Verify your identity</AppText>
              <AppText variant="caption" color={Colors.text.muted}>Unlock higher loan limits</AppText>
            </View>
            <AppText style={styles.chevron} color={Colors.primary}>›</AppText>
          </TouchableOpacity>
        )}

        <View style={{ paddingHorizontal: Spacing.lg }}>
          {/* Account */}
          <SectionHeader title="Account" />
          <SettingGroup>
            <SettingRow
              icon="person-outline"
              label="Personal information"
              sublabel="Name, phone, email"
              onPress={openSheet}
            />
            <SettingRow
              icon="lock-closed-outline"
              label="Change password"
              onPress={() => router.push('/(auth)/forgot-password')}
            />
            <SettingRow
              icon="scan-outline"
              label="Identity verification"
              sublabel={user?.identityStatus === 'VERIFIED' ? 'Verified ✓' : 'Not verified'}
              onPress={() => {}}
            />
          </SettingGroup>

          {/* Preferences */}
          <SectionHeader title="Preferences" />
          <SettingGroup>
            <SettingRow
              icon="notifications-outline"
              label="Push notifications"
              sublabel="Loan updates and reminders"
              right={
                <Switch
                  value={notifications}
                  onValueChange={setNotifications}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor={Colors.background}
                />
              }
            />
            <SettingRow
              icon="finger-print-outline"
              label="Biometric login"
              sublabel="Use Face ID or fingerprint"
              right={
                <Switch
                  value={biometrics}
                  onValueChange={setBiometrics}
                  trackColor={{ false: Colors.border, true: Colors.primary }}
                  thumbColor={Colors.background}
                />
              }
            />
          </SettingGroup>

          {/* Support */}
          <SectionHeader title="Support" />
          <SettingGroup>
            <SettingRow icon="help-circle-outline"          label="Help centre"       onPress={() => {}} />
            <SettingRow icon="chatbubble-ellipses-outline"  label="Contact support"   onPress={() => {}} />
            <SettingRow icon="star-outline"                 label="Rate the app"      onPress={() => {}} />
          </SettingGroup>

          {/* Legal */}
          <SectionHeader title="Legal" />
          <SettingGroup>
            <SettingRow icon="document-text-outline" label="Terms of service" onPress={() => {}} />
            <SettingRow icon="lock-closed-outline"   label="Privacy policy"   onPress={() => {}} />
          </SettingGroup>

          <View style={styles.versionRow}>
            <AppText variant="caption" color={Colors.text.muted} align="center">Fundly v1.0.0</AppText>
          </View>

          <SettingGroup>
            <SettingRow icon="log-out-outline" label="Sign out" onPress={handleLogout} destructive />
          </SettingGroup>
        </View>
      </ScrollView>

      {/* ── Edit profile bottom sheet ── */}
      <BottomSheet
        ref={sheetRef}
        index={-1}
        snapPoints={snapPoints}
        enablePanDownToClose
        keyboardBehavior="extend"
        backgroundStyle={{ backgroundColor: Colors.background }}
        handleIndicatorStyle={{ backgroundColor: Colors.border }}
      >
        <BottomSheetView style={{ flex: 1 }}>
          <EditProfileForm onSaved={closeSheet} />
        </BottomSheetView>
      </BottomSheet>
    </GestureHandlerRootView>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.surface },
  screenHeader: {
    paddingHorizontal: Spacing.lg, paddingBottom: Spacing.md,
    backgroundColor: Colors.background,
  },

  // Profile card
  profileCard: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.background, borderRadius: Radius.lg,
    padding: Spacing.md, marginTop: Spacing.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.06, shadowRadius: 8, elevation: 2,
  },
  avatarWrap: { position: 'relative' },
  avatar: { width: 52, height: 52, borderRadius: 26 },
  avatarFallback: {
    backgroundColor: Colors.primary,
    alignItems: 'center', justifyContent: 'center',
  },
  avatarText: { fontSize: FontSize.lg, fontWeight: FontWeight.bold, color: Colors.text.inverse },
  avatarBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: 18, height: 18, borderRadius: 9,
    backgroundColor: Colors.primaryDark,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1.5, borderColor: Colors.background,
  },
  editBtn: {
    paddingHorizontal: Spacing.md, paddingVertical: Spacing.xs,
    borderRadius: Radius.full, borderWidth: 1.5, borderColor: Colors.primary,
  },

  // Verify banner
  verifyBanner: {
    flexDirection: 'row', alignItems: 'center',
    backgroundColor: Colors.primaryLight, borderRadius: Radius.md,
    padding: Spacing.md, marginTop: Spacing.md,
  },

  // Section headers
  sectionHeader: { marginTop: Spacing.xl, marginBottom: Spacing.sm, letterSpacing: 0.8 },

  // Setting groups
  group: {
    backgroundColor: Colors.background, borderRadius: Radius.lg,
    shadowColor: '#000', shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.05, shadowRadius: 4, elevation: 1,
    overflow: 'hidden',
  },
  row: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.md,
    paddingVertical: Spacing.md, paddingHorizontal: Spacing.md,
    borderBottomWidth: 1, borderBottomColor: Colors.border,
  },
  rowIcon: {
    width: 36, height: 36, borderRadius: Radius.sm,
    backgroundColor: Colors.surface, alignItems: 'center', justifyContent: 'center',
  },
  rowIconDestructive: { backgroundColor: Colors.errorLight },
  chevron: { fontSize: 22 },
  versionRow: { paddingVertical: Spacing.md },

  // Bottom sheet form
  sheetContent: { paddingHorizontal: Spacing.lg, paddingBottom: Spacing.xxl },
  fieldLabel: { marginBottom: Spacing.xs, marginTop: Spacing.md },
  sheetInput: {
    borderWidth: 1.5, borderColor: Colors.border,
    borderRadius: Radius.md, paddingHorizontal: Spacing.md,
    height: 48, fontSize: FontSize.md, color: Colors.text.primary,
  },
  errorBox: {
    backgroundColor: Colors.errorLight, borderRadius: Radius.sm,
    padding: Spacing.sm, marginTop: Spacing.md,
  },
  // Photo picker
  photoPicker: {
    alignSelf: 'center', marginBottom: Spacing.lg,
    width: 96, height: 96, borderRadius: 48, overflow: 'hidden',
  },
  photoPreview: { width: 96, height: 96, borderRadius: 48 },
  photoPlaceholder: {
    width: 96, height: 96, borderRadius: 48,
    backgroundColor: Colors.surface, borderWidth: 1.5, borderColor: Colors.border,
    alignItems: 'center', justifyContent: 'center',
  },
  photoOverlay: {
    position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
    backgroundColor: 'rgba(0,0,0,0.38)',
    alignItems: 'center', justifyContent: 'center',
  },
});
