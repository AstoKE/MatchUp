import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import { EditProfileScreen } from './screens/EditProfileScreen';
import { AvatarScreen } from './screens/AvatarScreen';

const USER = '00000000-0000-4000-8000-0000000000aa';
const ANKARA = '00000000-0000-4000-8000-0000000000c1';
const catalog = {
  sports: [
    {
      id: '00000000-0000-4000-8000-000000000f01',
      slug: 'football',
      names: { tr: 'Futbol', en: 'Football' },
      isTeamSport: true,
      skillDescriptors: {},
      positions: [],
    },
    {
      id: '00000000-0000-4000-8000-000000000f02',
      slug: 'tennis',
      names: { tr: 'Tenis', en: 'Tennis' },
      isTeamSport: false,
      skillDescriptors: {},
      positions: [],
    },
  ],
  cities: [
    {
      id: ANKARA,
      slug: 'ankara',
      names: { tr: 'Ankara', en: 'Ankara' },
      districts: [
        {
          id: '00000000-0000-4000-8000-0000000000d1',
          slug: 'cankaya',
          names: { tr: 'Çankaya', en: 'Çankaya' },
        },
      ],
    },
  ],
};
// Literal ids: this object is read inside a hoisted jest.mock factory.
const mockProfile = {
  userId: '00000000-0000-4000-8000-0000000000aa',
  displayName: 'Ayşe Yılmaz',
  bio: null,
  cityId: '00000000-0000-4000-8000-0000000000c1',
  districtId: null,
  settings: {
    locale: 'tr',
    theme: 'system',
    profileVisibility: 'EVENT_PEERS',
    showReliability: true,
    showBadges: true,
    marketingConsent: false,
    analyticsConsent: false,
  },
  sports: [],
};

const mockProfileApi = { updateMyProfile: jest.fn() };
jest.mock('./api/profile-api', () => ({
  fetchMyProfile: () => Promise.resolve(mockProfile),
  updateMyProfile: (...a: unknown[]) => mockProfileApi.updateMyProfile(...a),
}));
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: () => Promise.resolve(catalog),
}));
const mockPick = jest.fn();
jest.mock('./photo-picker', () => ({ pickAvatarPhoto: () => mockPick() }));
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn() };
let mockParams: Record<string, string> = {};
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => mockParams,
  usePathname: () => '/avatar',
  Redirect: () => null,
}));

type AvatarApi = Record<string, jest.Mock>;
const api = jest.requireMock<AvatarApi>('./api/avatar-api');
const mine = (over: Record<string, unknown> = {}) =>
  api.fetchMyAvatar!.mockResolvedValue({
    displayName: 'Ayşe Yılmaz',
    gender: 'FEMALE',
    avatarKey: 'f-football',
    avatarPath: null,
    ...over,
  });

const session: SessionState = {
  status: 'authenticated',
  userId: USER,
  email: 'ayse@test.invalid',
  emailVerified: true,
};

beforeEach(() => {
  jest.clearAllMocks();
  mockParams = {};
  mine();
  mockProfileApi.updateMyProfile.mockResolvedValue(undefined);
  api.listMyAvatarObjects!.mockResolvedValue([]);
});

describe('AvatarScreen', () => {
  it('offers the letters and the own set first, marks the current one, and the other set on request', async () => {
    await renderApp(<AvatarScreen />, { session });
    expect(await screen.findByRole('radio', { name: 'Futbol', checked: true })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Harfler' })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(12);
    await fireEvent.press(screen.getByRole('button', { name: 'Tüm avatarları göster' }));
    expect(screen.getAllByRole('radio')).toHaveLength(23);
    // Both sets on screen: the names say which character.
    expect(screen.getByRole('radio', { name: 'Tenis, erkek karakter' })).toBeTruthy();
    expect(screen.getByRole('radio', { name: 'Tenis, kız karakter' })).toBeTruthy();
  });

  it('offers everything at once to someone who would rather not say', async () => {
    mine({ gender: 'UNDISCLOSED', avatarKey: 'letters' });
    await renderApp(<AvatarScreen />, { session });
    expect(await screen.findByRole('radio', { name: 'Harfler', checked: true })).toBeTruthy();
    expect(screen.getAllByRole('radio')).toHaveLength(23);
    expect(screen.queryByRole('button', { name: 'Tüm avatarları göster' })).toBeNull();
  });

  it('saves a chosen drawing and goes back to the profile', async () => {
    await renderApp(<AvatarScreen />, { session });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Tenis' }));
    expect(screen.getByRole('radio', { name: 'Tenis', checked: true })).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(api.setMyAvatar).toHaveBeenCalledWith('f-tennis'));
    await waitFor(() => expect(mockRouter.replace).toHaveBeenCalledWith('/profile'));
  });

  it('right after onboarding: continue or skip, then the page that needed onboarding', async () => {
    mockParams = { first: '1', next: '/my-events' };
    await renderApp(<AvatarScreen />, { session });
    await fireEvent.press(await screen.findByRole('button', { name: 'Şimdilik atla' }));
    expect(mockRouter.replace).toHaveBeenCalledWith('/my-events');
    expect(api.setMyAvatar).not.toHaveBeenCalled();
  });

  it('uploads a picked photo: the new one first, then the old ones deleted', async () => {
    mine({ avatarPath: `${USER}/old.jpg` });
    mockPick.mockResolvedValue('file:///prepared.jpg');
    api.uploadAvatarPhoto!.mockResolvedValue(`${USER}/new.jpg`);
    api.setMyAvatarPhoto!.mockResolvedValue(`${USER}/old.jpg`);
    api.listMyAvatarObjects!.mockResolvedValue([`${USER}/old.jpg`, `${USER}/new.jpg`]);
    await renderApp(<AvatarScreen />, { session });
    await fireEvent.press(await screen.findByRole('button', { name: 'Fotoğrafı değiştir' }));
    await waitFor(() => expect(api.setMyAvatarPhoto).toHaveBeenCalledWith(`${USER}/new.jpg`));
    expect(api.uploadAvatarPhoto).toHaveBeenCalledWith(USER, 'file:///prepared.jpg');
    await waitFor(() =>
      expect(api.deleteAvatarObjects).toHaveBeenLastCalledWith([`${USER}/old.jpg`]),
    );
    expect(await screen.findByText('Fotoğrafın yüklendi.')).toBeTruthy();
  });

  it('does nothing when the picker is cancelled', async () => {
    mockPick.mockResolvedValue(null);
    await renderApp(<AvatarScreen />, { session });
    await fireEvent.press(await screen.findByRole('button', { name: 'Fotoğraf yükle' }));
    await waitFor(() => expect(mockPick).toHaveBeenCalled());
    expect(api.uploadAvatarPhoto).not.toHaveBeenCalled();
  });

  it('removes the photo: the bytes, then the reference', async () => {
    mine({ avatarPath: `${USER}/old.jpg` });
    api.listMyAvatarObjects!.mockResolvedValue([`${USER}/old.jpg`]);
    await renderApp(<AvatarScreen />, { session });
    await fireEvent.press(await screen.findByRole('button', { name: 'Fotoğrafı kaldır' }));
    await waitFor(() => expect(api.clearMyAvatarPhoto).toHaveBeenCalled());
    expect(api.deleteAvatarObjects).toHaveBeenCalledWith([`${USER}/old.jpg`]);
  });

  it('warns that choosing a drawing deletes the photo', async () => {
    mine({ avatarPath: `${USER}/old.jpg` });
    await renderApp(<AvatarScreen />, { session });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Tenis' }));
    expect(screen.getByText('Bir avatar seçip kaydedersen fotoğrafın silinir.')).toBeTruthy();
  });
});

describe('EditProfileScreen: gender', () => {
  it('shows the private gender and saves a change', async () => {
    await renderApp(<EditProfileScreen />, { session });
    expect(await screen.findByRole('radio', { name: 'Kadın', checked: true })).toBeTruthy();
    expect(screen.getByText(/Başkalarına gösterilmez/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('radio', { name: 'Belirtmek istemiyorum' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(api.setMyGender).toHaveBeenCalledWith('UNDISCLOSED'));
    expect(mockProfileApi.updateMyProfile).toHaveBeenCalled();
  });

  it('does not touch the gender when it is not changed', async () => {
    await renderApp(<EditProfileScreen />, { session });
    await screen.findByRole('radio', { name: 'Kadın', checked: true });
    await fireEvent.press(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mockRouter.back).toHaveBeenCalled());
    expect(api.setMyGender).not.toHaveBeenCalled();
  });
});
