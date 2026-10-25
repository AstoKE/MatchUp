import { AppError } from '@matchup/domain';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderApp } from '@/test/render';
import type { SessionState } from '@/features/auth';
import { RequireOnboarded } from './RequireOnboarded';
import { LegalDocScreen } from './screens/LegalDocScreen';
import { OnboardingScreen } from './screens/OnboardingScreen';
import { Text } from 'react-native';

const FOOTBALL = '00000000-0000-4000-8000-000000000f01';
const BASKET = '00000000-0000-4000-8000-000000000f02';
const KEEPER = '00000000-0000-4000-8000-0000000000a1';
const DEFENDER = '00000000-0000-4000-8000-0000000000a2';
const MID = '00000000-0000-4000-8000-0000000000a3';
const FORWARD = '00000000-0000-4000-8000-0000000000a4';
const ANKARA = '00000000-0000-4000-8000-0000000000c1';
const CANKAYA = '00000000-0000-4000-8000-0000000000d1';

const anchors = Object.fromEntries(
  [1, 2, 3, 4, 5].map((n) => [String(n), { tr: `Seviye ${n} açıklaması`, en: `Level ${n} text` }]),
);
const catalog = {
  sports: [
    {
      id: FOOTBALL,
      slug: 'football',
      names: { tr: 'Futbol', en: 'Football' },
      isTeamSport: true,
      skillDescriptors: anchors,
      positions: [
        { id: KEEPER, slug: 'goalkeeper', names: { tr: 'Kaleci', en: 'Goalkeeper' } },
        { id: DEFENDER, slug: 'defender', names: { tr: 'Defans', en: 'Defender' } },
        { id: MID, slug: 'midfielder', names: { tr: 'Orta saha', en: 'Midfielder' } },
        { id: FORWARD, slug: 'forward', names: { tr: 'Forvet', en: 'Forward' } },
      ],
    },
    {
      id: BASKET,
      slug: 'basketball',
      names: { tr: 'Basketbol', en: 'Basketball' },
      isTeamSport: true,
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

const mockApi = {
  fetchMyAccount: jest.fn(),
  fetchLegalVersions: jest.fn(),
  completeOnboarding: jest.fn(),
  fetchCatalog: jest.fn(),
};
jest.mock('./api/onboarding-api', () => ({
  fetchMyAccount: (...a: unknown[]) => mockApi.fetchMyAccount(...a),
  fetchLegalVersions: (...a: unknown[]) => mockApi.fetchLegalVersions(...a),
  completeOnboarding: (...a: unknown[]) => mockApi.completeOnboarding(...a),
}));
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: (...a: unknown[]) => mockApi.fetchCatalog(...a),
}));

const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => {
  const { Text: RNText } = jest.requireActual<typeof import('react-native')>('react-native');
  return {
    useRouter: () => mockRouter,
    useLocalSearchParams: () => mockParams,
    usePathname: () => '/profile',
    Redirect: ({ href }: { href: unknown }) => (
      <RNText testID="redirect">{JSON.stringify(href)}</RNText>
    ),
    Link: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

const signedIn = (emailVerified = true): SessionState => ({
  status: 'authenticated',
  userId: '00000000-0000-4000-8000-0000000000aa',
  email: 'a@test.invalid',
  emailVerified,
});
const account = (overrides: Record<string, unknown> = {}) => ({
  userId: 'u',
  status: 'ACTIVE',
  emailVerified: true,
  adultConfirmed: false,
  onboarded: false,
  ...overrides,
});
const versions = { termsVersion: 'draft-0.1', privacyVersion: 'draft-0.1', draft: true };

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mockApi.fetchMyAccount.mockResolvedValue(account());
  mockApi.fetchLegalVersions.mockResolvedValue(versions);
  mockApi.fetchCatalog.mockResolvedValue(catalog);
  mockApi.completeOnboarding.mockResolvedValue(undefined);
});

describe('RequireOnboarded', () => {
  const gated = () => (
    <RequireOnboarded>
      <Text>gizli içerik</Text>
    </RequireOnboarded>
  );

  it('sends guests to sign-in', async () => {
    await renderApp(gated(), { session: { status: 'guest' } });
    expect(await screen.findByTestId('redirect')).toHaveTextContent(/sign-in/);
  });

  it('sends a signed-in user who has not onboarded to the onboarding flow and remembers the page', async () => {
    await renderApp(gated(), { session: signedIn() });
    const redirect = await screen.findByTestId('redirect');
    expect(redirect).toHaveTextContent(/onboarding/);
    expect(redirect).toHaveTextContent(/profile/);
    expect(screen.queryByText('gizli içerik')).toBeNull();
  });

  it('shows the content once the server says the user is onboarded', async () => {
    mockApi.fetchMyAccount.mockResolvedValue(account({ onboarded: true, adultConfirmed: true }));
    await renderApp(gated(), { session: signedIn() });
    expect(await screen.findByText('gizli içerik')).toBeTruthy();
  });

  it('shows a retryable error instead of the content when the account cannot be loaded', async () => {
    mockApi.fetchMyAccount.mockRejectedValueOnce(new AppError('NETWORK'));
    await renderApp(gated(), { session: signedIn() });
    expect(await screen.findByText(/Bağlanılamadı|bağlan/i)).toBeTruthy();
    expect(screen.queryByText('gizli içerik')).toBeNull();
    mockApi.fetchMyAccount.mockResolvedValue(account({ onboarded: true }));
    await fireEvent.press(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByText('gizli içerik')).toBeTruthy();
  });
});

describe('OnboardingScreen', () => {
  const press = (name: string) => fireEvent.press(screen.getByRole('button', { name }));
  const check = (name: string) => fireEvent.press(screen.getByRole('checkbox', { name }));

  async function reachSports() {
    await check('18 yaşından büyük olduğumu onaylıyorum.');
    await check("Kullanım Koşulları'nı ve Gizlilik Bildirimi'ni okudum, kabul ediyorum.");
    await press('İleri');
    await fireEvent.changeText(await screen.findByLabelText('Görünen ad'), 'Ayşe Yılmaz');
    await press('İleri');
    await screen.findByText('Hangi sporları yapıyorsun?');
  }

  it('does not let anyone past the first step without the 18+ and terms confirmations', async () => {
    await renderApp(<OnboardingScreen />, { session: signedIn() });
    await screen.findByText('Başlamadan önce');
    await press('İleri');
    expect(await screen.findByText(/18 yaşından büyük olmalısın/)).toBeTruthy();
    expect(screen.getByText(/kabul etmelisin/)).toBeTruthy();
    expect(screen.queryByText('Seni tanıyalım')).toBeNull();
    expect(mockApi.completeOnboarding).not.toHaveBeenCalled();
  });

  it('flags the legal texts as drafts', async () => {
    await renderApp(<OnboardingScreen />, { session: signedIn() });
    expect(await screen.findByText(/henüz bir avukat tarafından incelenmemiş/)).toBeTruthy();
  });

  it('validates the name before moving on', async () => {
    await renderApp(<OnboardingScreen />, { session: signedIn() });
    await screen.findByText('Başlamadan önce');
    await check('18 yaşından büyük olduğumu onaylıyorum.');
    await check("Kullanım Koşulları'nı ve Gizlilik Bildirimi'ni okudum, kabul ediyorum.");
    await press('İleri');
    await fireEvent.changeText(await screen.findByLabelText('Görünen ad'), 'A');
    await press('İleri');
    expect(await screen.findByText('En az 2 karakter kullan.')).toBeTruthy();
    expect(screen.queryByText('Hangi sporları yapıyorsun?')).toBeNull();
  });

  it('removes a validation message as soon as the user starts fixing the field', async () => {
    await renderApp(<OnboardingScreen />, { session: signedIn() });
    await screen.findByText('Başlamadan önce');
    await check('18 yaşından büyük olduğumu onaylıyorum.');
    await check("Kullanım Koşulları'nı ve Gizlilik Bildirimi'ni okudum, kabul ediyorum.");
    await press('İleri');
    await press('İleri');
    expect(await screen.findByText('En az 2 karakter kullan.')).toBeTruthy();
    await fireEvent.changeText(screen.getByLabelText('Görünen ad'), 'Ay');
    expect(screen.queryByText('En az 2 karakter kullan.')).toBeNull();
  });

  it('requires at least one sport', async () => {
    await renderApp(<OnboardingScreen />, { session: signedIn() });
    await screen.findByText('Başlamadan önce');
    await reachSports();
    await press('Bitir');
    expect(await screen.findByText('En az bir spor seç.')).toBeTruthy();
    expect(mockApi.completeOnboarding).not.toHaveBeenCalled();
  });

  it('submits exactly what the user chose and returns to the page that needed onboarding', async () => {
    mockParams = { returnTo: '/profile' };
    await renderApp(<OnboardingScreen />, { session: signedIn() });
    await screen.findByText('Başlamadan önce');
    await check(
      'Haber ve ipuçları almak istiyorum (isteğe bağlı). Bunu istediğin zaman değiştirebilirsin.',
    );
    await reachSports();

    await fireEvent.press(screen.getByRole('checkbox', { name: 'Futbol' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Seviyeyi yükselt' })); // 3 → 3.5
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Kaleci' }));
    await press('Bitir');

    await waitFor(() => expect(mockApi.completeOnboarding).toHaveBeenCalledTimes(1));
    const [input, sentVersions] = mockApi.completeOnboarding.mock.calls[0] as [
      Record<string, unknown>,
      unknown,
    ];
    expect(input).toEqual({
      adultConfirmed: true,
      termsAccepted: true,
      marketingConsent: true,
      displayName: 'Ayşe Yılmaz',
      cityId: null,
      districtId: null,
      sports: [{ sportId: FOOTBALL, level: 3.5, positionIds: [KEEPER] }],
    });
    expect(sentVersions).toEqual(versions);
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/profile'));
  });

  it('keeps marketing consent off unless the user turns it on', async () => {
    await renderApp(<OnboardingScreen />, { session: signedIn() });
    await screen.findByText('Başlamadan önce');
    await reachSports();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Basketbol' }));
    await press('Bitir');
    await waitFor(() => expect(mockApi.completeOnboarding).toHaveBeenCalled());
    expect(
      (mockApi.completeOnboarding.mock.calls[0] as [{ marketingConsent: boolean }])[0]
        .marketingConsent,
    ).toBe(false);
  });

  it('limits positions to three per sport', async () => {
    await renderApp(<OnboardingScreen />, { session: signedIn() });
    await screen.findByText('Başlamadan önce');
    await reachSports();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Futbol' }));
    for (const name of ['Kaleci', 'Defans', 'Orta saha']) {
      await fireEvent.press(screen.getByRole('checkbox', { name }));
    }
    expect(screen.getByRole('checkbox', { name: 'Forvet' })).toBeDisabled();
  });

  it('never sends the user back into onboarding after finishing', async () => {
    mockParams = { returnTo: '/onboarding' };
    await renderApp(<OnboardingScreen />, { session: signedIn() });
    await screen.findByText('Başlamadan önce');
    await reachSports();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Basketbol' }));
    await press('Bitir');
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/'));
  });

  it('shows a localized server error, keeps the form, and refreshes the legal versions', async () => {
    mockApi.completeOnboarding.mockRejectedValueOnce(new AppError('CONSENT_VERSION_MISMATCH'));
    await renderApp(<OnboardingScreen />, { session: signedIn() });
    await screen.findByText('Başlamadan önce');
    await reachSports();
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Basketbol' }));
    const before = mockApi.fetchLegalVersions.mock.calls.length;
    await press('Bitir');
    expect(await screen.findByText(/güncellenmiş/)).toBeTruthy();
    await waitFor(() =>
      expect(mockApi.fetchLegalVersions.mock.calls.length).toBeGreaterThan(before),
    );
    expect(mockRouter.replace).not.toHaveBeenCalled();
    expect(screen.getByRole('checkbox', { name: 'Basketbol' })).toBeChecked();
  });

  it('asks an unverified user to verify the email first instead of showing the form', async () => {
    await renderApp(<OnboardingScreen />, { session: signedIn(false) });
    expect(await screen.findByText('Önce e-postanı doğrula')).toBeTruthy();
    expect(screen.queryByText('Başlamadan önce')).toBeNull();
  });

  it('skips the flow for a user who is already onboarded', async () => {
    mockParams = { returnTo: '/my-events' };
    mockApi.fetchMyAccount.mockResolvedValue(account({ onboarded: true }));
    await renderApp(<OnboardingScreen />, { session: signedIn() });
    expect(await screen.findByTestId('redirect')).toHaveTextContent(/my-events/);
  });

  it('works in English too', async () => {
    await renderApp(<OnboardingScreen />, { session: signedIn(), locale: 'en' });
    expect(await screen.findByText('Before we start')).toBeTruthy();
    await press('Next');
    expect(await screen.findByText('You must be 18 or older to use MatchUp.')).toBeTruthy();
  });
});

describe('LegalDocScreen', () => {
  it('shows the draft banner and the version being accepted', async () => {
    await renderApp(<LegalDocScreen doc="terms" />);
    expect(await screen.findByText(/TASLAK/)).toBeTruthy();
    expect(screen.getByText('Kullanım Koşulları (taslak)')).toBeTruthy();
    expect(await screen.findByText('Sürüm: draft-0.1')).toBeTruthy();
  });

  it('treats unknown status as a draft (safe default) and renders the privacy notice', async () => {
    mockApi.fetchLegalVersions.mockReturnValue(new Promise(() => undefined));
    await renderApp(<LegalDocScreen doc="privacy" />);
    expect(screen.getByText(/TASLAK/)).toBeTruthy();
    expect(screen.getByText('Gizlilik Bildirimi (taslak)')).toBeTruthy();
  });
});
