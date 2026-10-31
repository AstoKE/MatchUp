import { AppError } from '@matchup/domain';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import { EditProfileScreen } from './screens/EditProfileScreen';
import { EditSportsScreen } from './screens/EditSportsScreen';
import { ProfileScreen } from './screens/ProfileScreen';
import { SettingsScreen } from './screens/SettingsScreen';

const FOOTBALL = '00000000-0000-4000-8000-000000000f01';
const TENNIS = '00000000-0000-4000-8000-000000000f02';
const KEEPER = '00000000-0000-4000-8000-0000000000a1';
const ANKARA = '00000000-0000-4000-8000-0000000000c1';
const CANKAYA = '00000000-0000-4000-8000-0000000000d1';
const USER = '00000000-0000-4000-8000-0000000000aa';

const anchors = Object.fromEntries(
  [1, 2, 3, 4, 5].map((n) => [String(n), { tr: `Seviye ${n} metni`, en: `Level ${n} text` }]),
);
const catalog = {
  sports: [
    {
      id: FOOTBALL,
      slug: 'football',
      names: { tr: 'Futbol', en: 'Football' },
      isTeamSport: true,
      skillDescriptors: anchors,
      positions: [{ id: KEEPER, slug: 'goalkeeper', names: { tr: 'Kaleci', en: 'Goalkeeper' } }],
    },
    {
      id: TENNIS,
      slug: 'tennis',
      names: { tr: 'Tenis', en: 'Tennis' },
      isTeamSport: false,
      skillDescriptors: anchors,
      positions: [],
    },
  ],
  cities: [
    {
      id: ANKARA,
      slug: 'ankara',
      names: { tr: 'Ankara', en: 'Ankara' },
      districts: [{ id: CANKAYA, slug: 'cankaya', names: { tr: 'Çankaya', en: 'Çankaya' } }],
    },
  ],
};
const baseProfile = {
  userId: USER,
  displayName: 'Ayşe Yılmaz',
  bio: 'Hafta sonları halı saha.',
  cityId: ANKARA,
  districtId: CANKAYA,
  settings: {
    locale: 'tr',
    theme: 'system',
    profileVisibility: 'EVENT_PEERS',
    showReliability: true,
    showBadges: true,
    marketingConsent: false,
  },
  sports: [{ sportId: FOOTBALL, level: 3.5, positionIds: [KEEPER] }],
};

jest.mock('./api/progress-api', () => ({
  fetchMyProgress: () =>
    Promise.resolve({ xpTotal: 0, reliability: null, ratings: [], badges: [] }),
}));

const mockApi = {
  fetchMyProfile: jest.fn(),
  updateMyProfile: jest.fn(),
  updateMySettings: jest.fn(),
  setMarketingConsent: jest.fn(),
  replaceSportProfiles: jest.fn(),
  fetchCatalog: jest.fn(),
};
jest.mock('./api/profile-api', () => ({
  fetchMyProfile: (...a: unknown[]) => mockApi.fetchMyProfile(...a),
  updateMyProfile: (...a: unknown[]) => mockApi.updateMyProfile(...a),
  updateMySettings: (...a: unknown[]) => mockApi.updateMySettings(...a),
  setMarketingConsent: (...a: unknown[]) => mockApi.setMarketingConsent(...a),
  replaceSportProfiles: (...a: unknown[]) => mockApi.replaceSportProfiles(...a),
}));
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: (...a: unknown[]) => mockApi.fetchCatalog(...a),
}));
const mockSignOut = jest.fn();
jest.mock('@/features/auth/api/auth-api', () => ({
  signOut: (...a: unknown[]) => mockSignOut(...a),
}));

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({}),
  usePathname: () => '/profile',
  Redirect: () => null,
  Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const session: SessionState = {
  status: 'authenticated',
  userId: USER,
  email: 'ayse@test.invalid',
  emailVerified: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.fetchMyProfile.mockResolvedValue(baseProfile);
  mockApi.fetchCatalog.mockResolvedValue(catalog);
  for (const fn of [
    mockApi.updateMyProfile,
    mockApi.updateMySettings,
    mockApi.setMarketingConsent,
    mockApi.replaceSportProfiles,
  ]) {
    fn.mockResolvedValue(undefined);
  }
});

const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
/** React Query passes extra context after the variables; only the variables matter here. */
const firstArg = (mock: jest.Mock) => (mock.mock.calls[0] as unknown[])[0];

describe('ProfileScreen', () => {
  it('shows who the user is: name, email, place, bio, sports with level and positions', async () => {
    await renderApp(<ProfileScreen />, { session });
    expect(await screen.findByText('Ayşe Yılmaz')).toBeTruthy();
    expect(screen.getByText('ayse@test.invalid olarak giriş yapıldı')).toBeTruthy();
    expect(screen.getByText('Çankaya, Ankara')).toBeTruthy();
    expect(screen.getByText('Hafta sonları halı saha.')).toBeTruthy();
    expect(screen.getByText('Futbol · Seviye 3.5')).toBeTruthy();
    expect(screen.getByText('Kaleci')).toBeTruthy();
  });

  it('says so honestly when there is no bio, location or sport', async () => {
    mockApi.fetchMyProfile.mockResolvedValue({
      ...baseProfile,
      bio: null,
      cityId: null,
      districtId: null,
      sports: [],
    });
    await renderApp(<ProfileScreen />, { session });
    expect(await screen.findByText('Konum belirtilmedi')).toBeTruthy();
    expect(screen.getByText('Henüz kendini tanıtmadın.')).toBeTruthy();
    expect(screen.getByText('Henüz spor eklemedin.')).toBeTruthy();
  });

  it('navigates to the edit screens and settings', async () => {
    await renderApp(<ProfileScreen />, { session });
    await screen.findByText('Ayşe Yılmaz');
    await press('Profili düzenle');
    await press('Sporları düzenle');
    await press('Ayarlar');
    expect(mockRouter.push.mock.calls).toEqual([
      ['/edit-profile'],
      ['/edit-sports'],
      ['/settings'],
    ]);
  });

  it('shows a retryable error when the profile cannot be loaded', async () => {
    mockApi.fetchMyProfile.mockRejectedValueOnce(new AppError('NETWORK'));
    await renderApp(<ProfileScreen />, { session });
    expect(await screen.findByText('Profilin yüklenemedi.')).toBeTruthy();
    await press('Tekrar dene');
    expect(await screen.findByText('Ayşe Yılmaz')).toBeTruthy();
  });

  it('signs out', async () => {
    mockSignOut.mockResolvedValue(undefined);
    await renderApp(<ProfileScreen />, { session });
    await screen.findByText('Ayşe Yılmaz');
    await press('Çıkış yap');
    await waitFor(() => expect(mockSignOut).toHaveBeenCalled());
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });
});

describe('EditProfileScreen', () => {
  it('starts from the saved values and saves exactly what changed', async () => {
    await renderApp(<EditProfileScreen />, { session });
    const name = await screen.findByLabelText('Görünen ad');
    expect(name.props.value).toBe('Ayşe Yılmaz');
    await fireEvent.changeText(name, '  Ayşe Y.  ');
    await fireEvent.changeText(screen.getByLabelText('Hakkında'), '');
    await press('Kaydet');
    await waitFor(() => expect(mockApi.updateMyProfile).toHaveBeenCalledTimes(1));
    expect(firstArg(mockApi.updateMyProfile)).toEqual({
      displayName: 'Ayşe Y.',
      bio: null,
      cityId: ANKARA,
      districtId: CANKAYA,
    });
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
  });

  it('does not call the server for an invalid name and clears the message when fixed', async () => {
    await renderApp(<EditProfileScreen />, { session });
    await fireEvent.changeText(await screen.findByLabelText('Görünen ad'), 'A');
    await press('Kaydet');
    expect(await screen.findByText('En az 2 karakter kullan.')).toBeTruthy();
    expect(mockApi.updateMyProfile).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Görünen ad'), 'Al');
    expect(screen.queryByText('En az 2 karakter kullan.')).toBeNull();
  });

  it('rejects an over-long bio before sending anything', async () => {
    await renderApp(<EditProfileScreen />, { session });
    await fireEvent.changeText(await screen.findByLabelText('Hakkında'), 'x'.repeat(281));
    await press('Kaydet');
    expect(await screen.findByText('En fazla 280 karakter kullanabilirsin.')).toBeTruthy();
    expect(mockApi.updateMyProfile).not.toHaveBeenCalled();
  });

  it('shows a localized server error and stays on the screen', async () => {
    mockApi.updateMyProfile.mockRejectedValueOnce(new AppError('ONBOARDING_REQUIRED'));
    await renderApp(<EditProfileScreen />, { session });
    await screen.findByLabelText('Görünen ad');
    await press('Kaydet');
    expect(await screen.findByText(/profilini tamamlamalısın/)).toBeTruthy();
    expect(mockRouter.back).not.toHaveBeenCalled();
  });
});

describe('EditSportsScreen', () => {
  it('starts from the saved sports and sends the full replacement list', async () => {
    await renderApp(<EditSportsScreen />, { session });
    expect(await screen.findByRole('checkbox', { name: 'Futbol' })).toBeChecked();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Tenis' }));
    await fireEvent.press(screen.getAllByRole('button', { name: 'Seviyeyi yükselt' })[1]!);
    await press('Kaydet');
    await waitFor(() => expect(mockApi.replaceSportProfiles).toHaveBeenCalledTimes(1));
    expect(firstArg(mockApi.replaceSportProfiles)).toEqual([
      { sportId: FOOTBALL, level: 3.5, positionIds: [KEEPER] },
      { sportId: TENNIS, level: 3.5, positionIds: [] },
    ]);
  });

  it('will not save an empty list', async () => {
    await renderApp(<EditSportsScreen />, { session });
    await fireEvent.press(await screen.findByRole('checkbox', { name: 'Futbol' }));
    await press('Kaydet');
    expect(await screen.findByText('En az bir spor seç.')).toBeTruthy();
    expect(mockApi.replaceSportProfiles).not.toHaveBeenCalled();
  });

  it('shows the server error and keeps the selection', async () => {
    mockApi.replaceSportProfiles.mockRejectedValueOnce(new AppError('VALIDATION_FAILED'));
    await renderApp(<EditSportsScreen />, { session });
    await screen.findByRole('checkbox', { name: 'Futbol' });
    await press('Kaydet');
    expect(await screen.findByText(/kontrol edip tekrar dene/)).toBeTruthy();
    expect(screen.getByRole('checkbox', { name: 'Futbol' })).toBeChecked();
  });
});

describe('SettingsScreen', () => {
  it('explains what each visibility choice means today and saves the choice with theme and language', async () => {
    await renderApp(<SettingsScreen />, { session });
    expect(await screen.findByText(/Şimdilik kimse göremez/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Herkes' }));
    expect(screen.getByText(/E-posta adresin hiçbir zaman gösterilmez/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Rozetlerimi göster' }));
    await fireEvent.press(screen.getByRole('radio', { name: 'Koyu' }));
    await press('Kaydet');
    await waitFor(() => expect(mockApi.updateMySettings).toHaveBeenCalledTimes(1));
    expect(firstArg(mockApi.updateMySettings)).toEqual({
      locale: 'tr',
      theme: 'dark',
      profileVisibility: 'EVERYONE',
      showReliability: true,
      showBadges: false,
    });
  });

  it('keeps marketing consent a separate, immediate and reversible choice', async () => {
    await renderApp(<SettingsScreen />, { session });
    await fireEvent.press(
      await screen.findByRole('checkbox', { name: 'Haber ve ipuçları almak istiyorum' }),
    );
    await waitFor(() => expect(mockApi.setMarketingConsent).toHaveBeenCalledTimes(1));
    expect(firstArg(mockApi.setMarketingConsent)).toBe(true);
    expect(mockApi.updateMySettings).not.toHaveBeenCalled();
  });

  it('shows a server error instead of pretending the save worked', async () => {
    mockApi.updateMySettings.mockRejectedValueOnce(new AppError('NETWORK'));
    await renderApp(<SettingsScreen />, { session });
    await screen.findByText(/Şimdilik kimse göremez/);
    await press('Kaydet');
    expect(await screen.findByText(/Bağlanılamadı|bağlan/i)).toBeTruthy();
  });

  it('links to the draft legal texts', async () => {
    await renderApp(<SettingsScreen />, { session });
    await screen.findByText(/Şimdilik kimse göremez/);
    await press('Kullanım Koşulları');
    await press('Gizlilik Bildirimi');
    expect(mockRouter.push.mock.calls).toEqual([['/legal/terms'], ['/legal/privacy']]);
  });
});
