import { AppError } from '@matchup/domain';
import { fireEvent, screen } from '@testing-library/react-native';
import type { Catalog } from '@/features/catalog';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import type { MyProfile } from './api/profile-api';
import type { MyProgress } from './api/progress-api';
import { ProgressSection } from './components/ProgressSection';

const FOOTBALL = '00000000-0000-4000-8000-000000000f01';
const USER = '00000000-0000-4000-8000-0000000000aa';

const mockFetch = jest.fn();
jest.mock('./api/progress-api', () => ({
  fetchMyProgress: (...a: unknown[]) => mockFetch(...a),
}));
jest.mock('./api/profile-api', () => ({}));

const session: SessionState = {
  status: 'authenticated',
  userId: USER,
  email: 'p@example.com',
  emailVerified: true,
};
const catalog = {
  sports: [{ id: FOOTBALL, names: { tr: 'Futbol', en: 'Football' } }],
  cities: [],
} as unknown as Catalog;
const profile = {
  sports: [{ sportId: FOOTBALL, level: 3.5, positionIds: [] }],
} as unknown as MyProfile;
const empty: MyProgress = { xpTotal: 0, reliability: null, ratings: [], badges: [] };
const show = (locale?: 'tr' | 'en') =>
  renderApp(<ProgressSection profile={profile} catalog={catalog} />, { session, locale });

beforeEach(() => jest.clearAllMocks());

describe('progress on the profile', () => {
  it('a new player: level 1, "new player", and honest empty states', async () => {
    mockFetch.mockResolvedValue(empty);
    await show();
    expect(await screen.findByText('Seviye 1')).toBeTruthy();
    expect(screen.getByText('0 XP · sonraki seviyeye 100 XP')).toBeTruthy();
    expect(screen.getByText('Yeni oyuncu')).toBeTruthy();
    expect(screen.getByText(/Henüz puanın yok/)).toBeTruthy();
    expect(screen.getByText(/Henüz rozetin yok/)).toBeTruthy();
  });

  it('level follows the XP curve', async () => {
    mockFetch.mockResolvedValue({ ...empty, xpTotal: 130 });
    await show();
    expect(await screen.findByText('Seviye 2')).toBeTruthy();
    expect(screen.getByText('130 XP · sonraki seviyeye 170 XP')).toBeTruthy();
  });

  it('below three signals reliability shows "new player", not a percentage', async () => {
    mockFetch.mockResolvedValue({
      ...empty,
      reliability: { score: 0.45, samples: 2, confidence: 0.3 },
    });
    await show();
    expect(await screen.findByText('Yeni oyuncu')).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('from three signals on it shows the percentage and how sure it is', async () => {
    mockFetch.mockResolvedValue({
      ...empty,
      reliability: { score: 0.977, samples: 10, confidence: 0.77 },
    });
    await show();
    expect(await screen.findByText('%98')).toBeTruthy();
    expect(screen.getByText('Yüksek güven')).toBeTruthy();
  });

  it('a low-confidence rating is provisional, next to the own estimate, with the feedback note', async () => {
    mockFetch.mockResolvedValue({
      ...empty,
      ratings: [{ sportId: FOOTBALL, rating: 3.33, confidence: 0.33 }],
    });
    await show();
    expect(await screen.findByText('Futbol: 3,3')).toBeTruthy();
    expect(screen.getByText(/Geçici: .*Kendi tahminin: 3,5/)).toBeTruthy();
    expect(screen.getByText(/oyuncu geri bildirimlerine dayanır/)).toBeTruthy();
  });

  it('a confident rating is not called provisional', async () => {
    mockFetch.mockResolvedValue({
      ...empty,
      ratings: [{ sportId: FOOTBALL, rating: 3.71, confidence: 0.71 }],
    });
    await show();
    expect(await screen.findByText('Futbol: 3,7')).toBeTruthy();
    expect(screen.queryByText(/Geçici/)).toBeNull();
  });

  it('a per-sport badge carries the sport name, in the app language', async () => {
    mockFetch.mockResolvedValue({
      ...empty,
      badges: [
        {
          code: 'SPORT_REGULAR',
          sportId: FOOTBALL,
          names: { tr: '{sport} Müdavimi', en: '{sport} Regular' },
          descriptions: { tr: 'Bu sporda 10 maç.', en: '10 games in this sport.' },
        },
      ],
    });
    await show('en');
    expect(await screen.findByText('Football Regular')).toBeTruthy();
    expect(screen.getByText('10 games in this sport.')).toBeTruthy();
  });

  it('offers a retry when loading fails', async () => {
    mockFetch.mockRejectedValueOnce(new AppError('NETWORK'));
    mockFetch.mockResolvedValue(empty);
    await show();
    await fireEvent.press(await screen.findByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByText('Seviye 1')).toBeTruthy();
  });
});
