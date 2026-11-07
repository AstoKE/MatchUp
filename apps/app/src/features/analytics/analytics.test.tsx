import { screen, waitFor } from '@testing-library/react-native';
import { useEffect } from 'react';
import { Text } from 'react-native';
import type { SessionState } from '@/features/auth';
import { renderApp } from '@/test/render';
import { useTrack } from './hooks';

const mockSend = jest.fn();
const mockFetchMyProfile = jest.fn();
jest.mock('./api/analytics-api', () => ({ sendUsageEvent: (...a: unknown[]) => mockSend(...a) }));
jest.mock('@/features/profile/api/profile-api', () => ({
  fetchMyProfile: (...a: unknown[]) => mockFetchMyProfile(...a),
}));

const ME = '00000000-0000-4000-8000-0000000000aa';
const session: SessionState = {
  status: 'authenticated',
  userId: ME,
  email: 'a@example.com',
  emailVerified: true,
};
const profile = (analyticsConsent: boolean) => ({
  userId: ME,
  displayName: 'Ayşe',
  bio: null,
  cityId: null,
  districtId: null,
  settings: { analyticsConsent },
  sports: [],
});

/** Tries to record one event; `track` changes once the profile (and so the consent) is known, which retries it. */
function Probe() {
  const track = useTrack();
  useEffect(() => {
    track({ name: 'map_opened', props: { where: 'DISCOVER' } });
  }, [track]);
  return <Text>tried</Text>;
}

beforeEach(() => jest.clearAllMocks());

describe('useTrack', () => {
  it('sends nothing for a guest', async () => {
    await renderApp(<Probe />, { session: { status: 'guest' } });
    await screen.findByText('tried');
    await new Promise((r) => setTimeout(r, 100));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends nothing for a player who did not consent', async () => {
    mockFetchMyProfile.mockResolvedValue(profile(false));
    await renderApp(<Probe />, { session });
    await waitFor(() => expect(mockFetchMyProfile).toHaveBeenCalled());
    await new Promise((r) => setTimeout(r, 100));
    expect(mockSend).not.toHaveBeenCalled();
  });

  it('sends the event for a player who consented', async () => {
    mockFetchMyProfile.mockResolvedValue(profile(true));
    await renderApp(<Probe />, { session });
    await waitFor(() =>
      expect(mockSend).toHaveBeenCalledWith({ name: 'map_opened', props: { where: 'DISCOVER' } }),
    );
  });
});
