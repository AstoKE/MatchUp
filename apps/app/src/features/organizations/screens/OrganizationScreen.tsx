import { Link, useLocalSearchParams, useRouter, type Href } from 'expo-router';
import { useState } from 'react';
import { Pressable, View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { localizedName, useCatalog } from '@/features/catalog';
import { UserAvatar } from '@/features/profile';
import { errorText } from '@/lib/error-text';
import { currentLocale } from '@/lib/i18n';
import {
  Banner,
  Button,
  EmptyState,
  Screen,
  ScreenHeader,
  Skeleton,
  Text,
  TOUCH_TARGET,
  useTheme,
  useToast,
} from '@/ui';
import type { OrganizationPage, OrganizationPerson } from '../api/organizations-api';
import { ensureOrganizationsCopy } from '../copy';
import { useMembershipAction, useOrganization, type MembershipAction } from '../hooks';

/**
 * An active organization (Phase 9 / M2, ADR-0030): what it is and who runs it, for anyone signed in. Members see the
 * members, the owner and administrators also the waiting requests and invitations. Every action is checked again by the
 * server; the buttons only leave out what cannot work.
 */
export function OrganizationScreen() {
  ensureOrganizationsCopy();
  const { t } = useTranslation(['organizations', 'common']);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const page = useOrganization(id ?? '');
  const header = (
    <ScreenHeader
      title={page.data?.name ?? t('organizations:page.title')}
      backLabel={t('common:back')}
      onBack={() => (router.canGoBack() ? router.back() : router.replace('/organizations' as Href))}
    />
  );
  if (page.isError) {
    return (
      <Screen maxWidth={640}>
        {header}
        <EmptyState
          title={t('organizations:page.unavailable')}
          body={errorText(page.error)}
          actionLabel={t('common:retry')}
          onAction={() => void page.refetch()}
        />
      </Screen>
    );
  }
  if (!page.data) {
    return (
      <Screen maxWidth={640}>
        {header}
        <View accessible accessibilityRole="progressbar" accessibilityLabel={t('common:loading')}>
          <Skeleton height={200} radiusKey="lg" />
        </View>
      </Screen>
    );
  }
  return (
    <Screen maxWidth={640}>
      {header}
      <Page page={page.data} />
    </Screen>
  );
}

function Page({ page }: { page: OrganizationPage }) {
  const { t } = useTranslation(['organizations', 'common']);
  const { spacing } = useTheme();
  const toast = useToast();
  const catalog = useCatalog();
  const act = useMembershipAction(page.id);
  const [error, setError] = useState<string | null>(null);
  const locale = currentLocale();
  const city = catalog.data?.cities.find((c) => c.id === page.cityId);
  const sports = (catalog.data?.sports ?? [])
    .filter((s) => page.sportIds.includes(s.id))
    .map((s) => localizedName(s.names, locale));
  const leader = page.role === 'OWNER' || page.role === 'ADMIN';

  // Some actions take the person off this list or the page: the toast runs after the promise, not in onSuccess.
  const run = (action: MembershipAction, done?: string) => {
    setError(null);
    void act
      .mutateAsync(action)
      .then(() => (done ? toast.show(done, 'success') : undefined))
      .catch((failure: unknown) => setError(errorText(failure)));
  };

  return (
    <View style={{ gap: spacing[4] }}>
      <Text tone="secondary">
        {[
          city ? localizedName(city.names, locale) : null,
          sports.join(', ') || null,
          t('organizations:page.members', { count: page.memberCount }),
        ]
          .filter(Boolean)
          .join(' · ')}
      </Text>
      {page.description ? <Text>{page.description}</Text> : null}
      {error ? <Banner kind="danger" message={error} /> : null}

      <MyState page={page} busy={act.isPending} run={run} />

      <Section title={t('organizations:page.leaders')}>
        {page.leaders.map((person) => (
          <PersonRow key={person.userId} person={person} />
        ))}
      </Section>

      {page.waiting && page.waiting.length > 0 ? (
        <Section title={t('organizations:page.waiting')}>
          {page.waiting.map((person) => (
            <PersonRow key={person.userId} person={person}>
              {person.status === 'REQUESTED' ? (
                <>
                  <Button
                    label={t('organizations:page.approve')}
                    disabled={act.isPending}
                    onPress={() =>
                      run(
                        { kind: 'decide', userId: person.userId, accept: true },
                        t('organizations:page.approved'),
                      )
                    }
                  />
                  <Button
                    variant="secondary"
                    label={t('organizations:page.decline')}
                    disabled={act.isPending}
                    onPress={() => run({ kind: 'decide', userId: person.userId, accept: false })}
                  />
                </>
              ) : (
                <Button
                  variant="tertiary"
                  label={t('organizations:page.withdrawInvite')}
                  disabled={act.isPending}
                  onPress={() => run({ kind: 'remove', userId: person.userId })}
                />
              )}
            </PersonRow>
          ))}
        </Section>
      ) : null}

      {page.members ? (
        <Section title={t('organizations:page.memberList')}>
          {page.members.map((person) => (
            <PersonRow key={person.userId} person={person}>
              {leader ? (
                <MemberActions page={page} person={person} busy={act.isPending} run={run} />
              ) : null}
            </PersonRow>
          ))}
        </Section>
      ) : null}
      {page.members && leader ? (
        <Text variant="caption" tone="secondary">
          {t('organizations:page.inviteHint')}
        </Text>
      ) : null}
    </View>
  );
}

/** What the caller can do about their own membership. */
function MyState({
  page,
  busy,
  run,
}: {
  page: OrganizationPage;
  busy: boolean;
  run: (action: MembershipAction, done?: string) => void;
}) {
  const { t } = useTranslation('organizations');
  const { spacing } = useTheme();
  const [leaving, setLeaving] = useState(false);
  if (page.membership === 'INVITED') {
    return (
      <View style={{ gap: spacing[2] }}>
        <Text variant="label">{t('page.invited')}</Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          <Button
            label={t('page.accept')}
            disabled={busy}
            onPress={() => run({ kind: 'respond', accept: true }, t('page.joined'))}
          />
          <Button
            variant="secondary"
            label={t('page.decline')}
            disabled={busy}
            onPress={() => run({ kind: 'respond', accept: false })}
          />
        </View>
      </View>
    );
  }
  if (page.membership === 'REQUESTED') {
    return (
      <View style={{ gap: spacing[2], alignItems: 'flex-start' }}>
        <Text tone="secondary">{t('page.requested')}</Text>
        <Button
          variant="tertiary"
          label={t('page.withdrawRequest')}
          disabled={busy}
          onPress={() => run({ kind: 'leave' })}
        />
      </View>
    );
  }
  if (page.membership === null) {
    return (
      <View style={{ alignItems: 'flex-start' }}>
        <Button
          label={t('page.join')}
          disabled={busy}
          onPress={() => run({ kind: 'join' }, t('page.joinSent'))}
        />
      </View>
    );
  }
  if (page.role === 'OWNER') {
    return (
      <Text variant="caption" tone="secondary">
        {t('page.ownerHint')}
      </Text>
    );
  }
  return leaving ? (
    <View style={{ gap: spacing[2] }}>
      <Text role="alert">{t('page.leaveConfirm', { name: page.name })}</Text>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
        <Button
          variant="destructive"
          label={t('page.leaveYes')}
          disabled={busy}
          onPress={() => run({ kind: 'leave' }, t('page.left'))}
        />
        <Button variant="secondary" label={t('page.keep')} onPress={() => setLeaving(false)} />
      </View>
    </View>
  ) : (
    <View style={{ alignItems: 'flex-start' }}>
      <Button variant="tertiary" label={t('page.leave')} onPress={() => setLeaving(true)} />
    </View>
  );
}

/** The owner: roles, removal, hand-over. An administrator: removing plain members. */
function MemberActions({
  page,
  person,
  busy,
  run,
}: {
  page: OrganizationPage;
  person: OrganizationPerson;
  busy: boolean;
  run: (action: MembershipAction, done?: string) => void;
}) {
  const { t } = useTranslation('organizations');
  const { spacing } = useTheme();
  const [asking, setAsking] = useState<'remove' | 'transfer' | null>(null);
  const name = person.displayName ?? t('page.unnamed');
  if (person.role === 'OWNER') return null;
  const owner = page.role === 'OWNER';
  const canRemove = owner || (page.role === 'ADMIN' && person.role === 'MEMBER');
  if (asking) {
    return (
      <View style={{ gap: spacing[2] }}>
        <Text role="alert">
          {t(asking === 'remove' ? 'page.removeConfirm' : 'page.transferConfirm', { name })}
        </Text>
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>
          <Button
            variant="destructive"
            label={t('page.yes')}
            disabled={busy}
            onPress={() => {
              setAsking(null);
              run(
                asking === 'remove'
                  ? { kind: 'remove', userId: person.userId }
                  : { kind: 'transfer', userId: person.userId },
                t(asking === 'remove' ? 'page.removed' : 'page.transferred', { name }),
              );
            }}
          />
          <Button variant="secondary" label={t('page.keep')} onPress={() => setAsking(null)} />
        </View>
      </View>
    );
  }
  return (
    <>
      {owner ? (
        <Button
          variant="secondary"
          label={t(person.role === 'ADMIN' ? 'page.makeMember' : 'page.makeAdmin')}
          disabled={busy}
          onPress={() =>
            run({
              kind: 'role',
              userId: person.userId,
              role: person.role === 'ADMIN' ? 'MEMBER' : 'ADMIN',
            })
          }
        />
      ) : null}
      {owner ? (
        <Button
          variant="tertiary"
          label={t('page.transfer')}
          disabled={busy}
          onPress={() => setAsking('transfer')}
        />
      ) : null}
      {canRemove ? (
        <Button
          variant="tertiary"
          label={t('page.remove')}
          disabled={busy}
          onPress={() => setAsking('remove')}
        />
      ) : null}
    </>
  );
}

function PersonRow({
  person,
  children,
}: {
  person: OrganizationPerson;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation('organizations');
  const { colors, radius, spacing } = useTheme();
  const name = person.displayName ?? t('page.unnamed');
  const role =
    person.status === 'ACTIVE'
      ? t(`role.${person.role}`)
      : t(person.status === 'INVITED' ? 'page.statusInvited' : 'page.statusRequested');
  return (
    <View
      role="listitem"
      style={{
        gap: spacing[2],
        padding: spacing[3],
        borderRadius: radius.md,
        borderWidth: 1,
        borderColor: colors.borderSubtle,
        backgroundColor: colors.surfaceRaised,
      }}
    >
      <Link href={{ pathname: '/u/[id]', params: { id: person.userId } }} asChild>
        <Pressable
          accessibilityRole="link"
          accessibilityLabel={t('page.openCard', { name, role })}
          style={{
            minHeight: TOUCH_TARGET,
            flexDirection: 'row',
            alignItems: 'center',
            gap: spacing[3],
            alignSelf: 'flex-start',
          }}
        >
          {/* Inside a named link: no initials, whose letters would not be in its name (WCAG 2.5.3). */}
          <UserAvatar
            name={name}
            avatarKey={person.avatarKey}
            avatarPath={person.avatarPath}
            size={40}
            fallback="icon"
          />
          <View>
            <Text variant="titleSm" tone="link">
              {name}
            </Text>
            <Text variant="caption" tone="secondary">
              {role}
            </Text>
          </View>
        </Pressable>
      </Link>
      {children ? (
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: spacing[2] }}>{children}</View>
      ) : null}
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  const { spacing } = useTheme();
  return (
    <View style={{ gap: spacing[3] }}>
      <Text variant="title" heading={2}>
        {title}
      </Text>
      <View role="list" style={{ gap: spacing[3] }}>
        {children}
      </View>
    </View>
  );
}
