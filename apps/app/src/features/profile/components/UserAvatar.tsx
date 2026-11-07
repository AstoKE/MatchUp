import { isAvatarKey, LETTERS_AVATAR } from '@matchup/domain';
import { useRouter } from 'expo-router';
import { Pressable } from 'react-native';
import { useTranslation } from 'react-i18next';
import { useSession } from '@/features/auth';
import { Avatar, avatarImages, TOUCH_TARGET, useTheme } from '@/ui';
import { useAvatarPhotoUrl, useMyAvatar } from '../avatar-hooks';

/**
 * A person's avatar: their photo when they have one and the viewer may see it (the storage policy decides), else their
 * drawing, else their initials. Decorative, like `Avatar`.
 */
export function UserAvatar({
  name,
  avatarKey,
  avatarPath,
  size = 64,
  fallback,
}: {
  name: string;
  avatarKey: string | null | undefined;
  avatarPath?: string | null;
  size?: number;
  fallback?: 'initials' | 'icon';
}) {
  const photo = useAvatarPhotoUrl(avatarPath ?? null);
  const drawing =
    isAvatarKey(avatarKey) && avatarKey !== LETTERS_AVATAR ? avatarImages[avatarKey] : null;
  const image = photo.data ? { uri: photo.data } : drawing;
  return <Avatar name={name} size={size} image={image} fallback={fallback} />;
}

/** The signed-in person's own avatar (one small query of its own: it sits in headers that other queries rebuild). */
export function MyAvatar({
  size = 64,
  fallback,
}: {
  size?: number;
  fallback?: 'initials' | 'icon';
}) {
  const avatar = useMyAvatar();
  return (
    <UserAvatar
      name={avatar.data?.displayName ?? ''}
      avatarKey={avatar.data?.avatarKey ?? null}
      avatarPath={avatar.data?.avatarPath ?? null}
      size={size}
      fallback={fallback}
    />
  );
}

/** At the top left of the main screens, beside the province: the way to the own profile. Nothing for guests. */
export function HeaderAvatar() {
  const session = useSession();
  const router = useRouter();
  const { t } = useTranslation('nav');
  const { colors } = useTheme();
  if (session.status !== 'authenticated') return null;
  return (
    <Pressable
      accessibilityRole="link"
      accessibilityLabel={t('profile')}
      onPress={() => router.push('/profile')}
      style={({ pressed }) => ({
        width: TOUCH_TARGET,
        height: TOUCH_TARGET,
        alignItems: 'center',
        justifyContent: 'center',
        borderRadius: TOUCH_TARGET / 2,
        opacity: pressed ? 0.8 : 1,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
      })}
    >
      <MyAvatar size={TOUCH_TARGET - 4} fallback="icon" />
    </Pressable>
  );
}
