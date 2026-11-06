import { useRouter } from 'expo-router';
import { useState } from 'react';
import { View } from 'react-native';
import { useTranslation } from 'react-i18next';
import { Screen, ScreenHeader, SegmentedChoice, Text, useTheme } from '@/ui';
import { AuditPanel, DisputesPanel, FlagsPanel } from '../components/ListPanels';
import { PeoplePanel } from '../components/PeoplePanel';
import { ReportsPanel } from '../components/ReportsPanel';
import { VenuesPanel } from '../components/VenuesPanel';

const SECTIONS = ['reports', 'flags', 'disputes', 'users', 'venues', 'audit'] as const;
type Section = (typeof SECTIONS)[number];

/** The console (docs/PHASE6_PLAN.md M5). Only reached through the gate; the server checks every call again. */
export default function AdminScreen() {
  const { t } = useTranslation(['admin', 'common']);
  const router = useRouter();
  const { spacing } = useTheme();
  const [section, setSection] = useState<Section>('reports');
  const [person, setPerson] = useState<string | null>(null);
  const openUser = (id: string | null) => {
    setPerson(id);
    if (id) setSection('users');
  };
  return (
    <Screen maxWidth={880}>
      <ScreenHeader
        title={t('admin:title')}
        backLabel={t('common:back')}
        onBack={() => (router.canGoBack() ? router.back() : router.replace('/profile'))}
      />
      <Text tone="secondary">{t('admin:subtitle')}</Text>
      <SegmentedChoice
        label={t('admin:section.label')}
        value={section}
        onChange={setSection}
        options={SECTIONS.map((value) => ({ value, label: t(`admin:section.${value}`) }))}
      />
      <View style={{ gap: spacing[3] }}>
        {section === 'reports' ? <ReportsPanel onOpenUser={openUser} /> : null}
        {section === 'flags' ? <FlagsPanel onOpenUser={openUser} /> : null}
        {section === 'disputes' ? <DisputesPanel /> : null}
        {section === 'users' ? <PeoplePanel userId={person} onSelect={setPerson} /> : null}
        {section === 'venues' ? <VenuesPanel /> : null}
        {section === 'audit' ? <AuditPanel /> : null}
      </View>
    </Screen>
  );
}
