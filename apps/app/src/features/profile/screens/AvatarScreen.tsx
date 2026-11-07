import {
  avatarChoices,
  isAvatarKey,
  LETTERS_AVATAR,
  type AvatarKey,
  type DrawnAvatarKey,
} from '@matchup/domain';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { sanitizeReturnTo } from '@/features/auth';
import { localizedName, useCatalog } from '@/features/catalog';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import {
  Avatar,
  avatarImages,
  Banner,
  Button,
  EmptyState,
  Screen,
  Skeleton,
  Text,
  useTheme,
  useToast,
} from '@/ui';
import {
  useChooseAvatar,
  useMyAvatar,
  useRemoveAvatarPhoto,
  useUploadAvatarPhoto,
} from '../avatar-hooks';
import { MyAvatar } from '../components/UserAvatar';
import { useMyProfile } from '../hooks';
import { pickAvatarPhoto } from '../photo-picker';

/**
 * Choosing an avatar (docs/PHASE8_PLAN.md M3): the drawings of the person's set first, the other set on request, the
 * letters, or an own photo. Opened from the profile, and once right after onboarding (`first`), where it can be skipped.
 */
export function AvatarScreen() {
  const { t } = useTranslation(['profile', 'common']);
  const { spacing } = useTheme();
  const router = useRouter();
  const toast = useToast();
  const params = useLocalSearchParams<{ next?: string; first?: string }>();
  const first = params.first === '1';
  const next = params.next ? sanitizeReturnTo(params.next) : '/profile';
  const avatar = useMyAvatar();
  const profile = useMyProfile();
  const catalog = useCatalog();
  const choose = useChooseAvatar();
  const upload = useUploadAvatarPhoto();
  const removePhoto = useRemoveAvatarPhoto();
  const [picked, setPicked] = useState<AvatarKey | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (avatar.isPending || catalog.isPending || profile.isPending) {
    return (
      <Screen maxWidth={560}>
        <Skeleton height={320} radiusKey="lg" />
      </Screen>
    );
  }
  if (avatar.isError || catalog.isError || profile.isError || !avatar.data || !catalog.data) {
    return (
      <Screen maxWidth={560}>
        <EmptyState
          title={errorText(avatar.error ?? catalog.error ?? profile.error)}
          actionLabel={t('common:retry')}
          onAction={() => {
            void avatar.refetch();
            void catalog.refetch();
            void profile.refetch();
          }}
        />
      </Screen>
    );
  }

  const mine = avatar.data;
  const name = profile.data?.displayName ?? '';
  const hasPhoto = mine.avatarPath !== null;
  const current: AvatarKey = mine.avatarKey ?? LETTERS_AVATAR;
  const selected = picked ?? (hasPhoto ? null : current);
  const { first: offered, rest } = avatarChoices(mine.gender);
  const shown = showAll ? [...offered, ...rest] : offered;
  const locale = currentLocale();
  const sportName = (slug: string) => {
    const sport = catalog.data.sports.find((s) => s.slug === slug);
    return sport ? localizedName(sport.names, locale) : slug;
  };
  const labelOf = (key: AvatarKey) => {
    if (key === LETTERS_AVATAR) return t('profile:avatar.letters');
    const sport = key.slice(2);
    return sport === 'general' ? t('profile:avatar.general') : sportName(sport);
  };
  // Both sets on screen: the accessible name says which character it is.
  const a11yLabelOf = (key: AvatarKey) =>
    key === LETTERS_AVATAR || !(showAll || rest.length === 0)
      ? labelOf(key)
      : t('profile:avatar.labelWithSet', {
          name: labelOf(key),
          set: t(key.startsWith('f-') ? 'profile:avatar.setF' : 'profile:avatar.setM'),
        });

  const busy = choose.isPending || upload.isPending || removePhoto.isPending;
  const leave = () => router.replace(next as '/');

  const save = () => {
    setError(null);
    if (picked === null || (picked === current && !hasPhoto)) {
      leave();
      return;
    }
    choose
      .mutateAsync(picked)
      .then(() => {
        toast.show(t('profile:avatar.saved'), 'success');
        leave();
      })
      .catch((e: unknown) => setError(errorText(e)));
  };

  const uploadPhoto = () => {
    setError(null);
    pickAvatarPhoto()
      .then((uri) => (uri ? upload.mutateAsync(uri).then(() => true) : false))
      .then((done) => {
        if (done) {
          setPicked(null);
          toast.show(t('profile:avatar.photoSaved'), 'success');
        }
      })
      .catch((e: unknown) => setError(errorText(e)));
  };

  return (
    <Screen maxWidth={560}>
      <View style={{ gap: spacing[2] }}>
        <Text variant="headline" heading={1}>
          {t('profile:avatar.title')}
        </Text>
        <Text tone="secondary">{t('profile:avatar.intro')}</Text>
      </View>
      {error ? <Banner kind="danger" message={error} /> : null}

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: spacing[4] }}>
        {selected !== null && isAvatarKey(selected) && selected !== LETTERS_AVATAR ? (
          <Avatar name={name} size={96} image={avatarImages[selected as DrawnAvatarKey]} />
        ) : selected === LETTERS_AVATAR ? (
          <Avatar name={name} size={96} />
        ) : (
          <MyAvatar size={96} />
        )}
        <View style={{ flex: 1, gap: spacing[2], alignItems: 'flex-start' }}>
          <Button
            variant="secondary"
            label={hasPhoto ? t('profile:avatar.replacePhoto') : t('profile:avatar.uploadPhoto')}
            loading={upload.isPending}
            loadingLabel={t('profile:avatar.uploading')}
            disabled={busy}
            onPress={uploadPhoto}
          />
          {hasPhoto ? (
            <Button
              variant="tertiary"
              label={t('profile:avatar.removePhoto')}
              disabled={busy}
              onPress={() => {
                setError(null);
                removePhoto
                  .mutateAsync()
                  .then(() => toast.show(t('profile:avatar.photoRemoved'), 'success'))
                  .catch((e: unknown) => setError(errorText(e)));
              }}
            />
          ) : null}
          <Text variant="caption" tone="secondary">
            {t('profile:avatar.photoNote')}
          </Text>
        </View>
      </View>

      <View
        role="radiogroup"
        accessibilityLabel={t('profile:avatar.choices')}
        style={{ flexDirection: 'row', flexWrap: 'wrap', rowGap: spacing[3] }}
      >
        {shown.map((key) => (
          <Choice
            key={key}
            avatarKey={key}
            name={name}
            label={labelOf(key)}
            accessibilityLabel={a11yLabelOf(key)}
            selected={selected === key}
            onPress={() => setPicked(key)}
          />
        ))}
      </View>
      {rest.length > 0 ? (
        <View style={{ alignItems: 'flex-start' }}>
          <Button
            variant="tertiary"
            label={showAll ? t('profile:avatar.showFewer') : t('profile:avatar.showAll')}
            aria-expanded={showAll}
            onPress={() => setShowAll(!showAll)}
          />
        </View>
      ) : null}
      {hasPhoto && picked !== null ? (
        <Banner kind="info" message={t('profile:avatar.replacesPhoto')} />
      ) : null}

      <View style={{ gap: spacing[2] }}>
        <Button
          label={first ? t('common:continue') : t('common:save')}
          fullWidth
          loading={choose.isPending}
          disabled={busy}
          onPress={save}
        />
        {first ? (
          <Button variant="tertiary" label={t('profile:avatar.skip')} onPress={leave} />
        ) : null}
      </View>
    </Screen>
  );
}

/** One avatar to choose: the drawing (or the initials) in a ring, with its name below. */
function Choice({
  avatarKey,
  name,
  label,
  accessibilityLabel,
  selected,
  onPress,
}: {
  avatarKey: AvatarKey;
  name: string;
  label: string;
  accessibilityLabel: string;
  selected: boolean;
  onPress: () => void;
}) {
  const { colors, spacing } = useTheme();
  const [focused, setFocused] = useState(false);
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityLabel={accessibilityLabel}
      aria-checked={selected}
      onPress={onPress}
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        width: '33.33%',
        alignItems: 'center',
        gap: spacing[1],
        ...(focused
          ? {
              outlineColor: colors.focusRing,
              outlineWidth: 2,
              outlineOffset: 2,
              outlineStyle: 'solid' as const,
            }
          : null),
      }}
    >
      <View
        style={{
          padding: 3,
          borderRadius: 999,
          borderWidth: 3,
          borderColor: selected ? colors.actionPrimary : 'transparent',
        }}
      >
        <Avatar
          name={name}
          size={80}
          image={avatarKey === LETTERS_AVATAR ? null : avatarImages[avatarKey]}
        />
      </View>
      <Text variant="label" style={{ textAlign: 'center' }}>
        {label}
      </Text>
    </Pressable>
  );
}
