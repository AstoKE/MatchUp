import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import enInvite from '@/locales/en/organization-invite.json';
import enOrganizations from '@/locales/en/organizations.json';
import trInvite from '@/locales/tr/organization-invite.json';
import trOrganizations from '@/locales/tr/organizations.json';
import { renderApp } from '@/test/render';
import type { OrganizationPage, OrganizationPerson } from './api/organizations-api';
import { EventOrganizationControl } from './components/EventOrganizationControl';
import { InviteToOrganization } from './components/InviteToOrganization';
import { OrganizationScreen } from './screens/OrganizationScreen';

const mockApi = {
  fetchOrganization: jest.fn(),
  requestToJoin: jest.fn(),
  respondToInvite: jest.fn(),
  decideJoinRequest: jest.fn(),
  leaveOrganization: jest.fn(),
  removeMember: jest.fn(),
  setMemberRole: jest.fn(),
  transferOwnership: jest.fn(),
  fetchOrganizationsToInvite: jest.fn(),
  inviteToOrganization: jest.fn(),
  fetchOrganizationEvents: jest.fn(),
  fetchRunnableOrganizations: jest.fn(),
  setEventOrganization: jest.fn(),
};
jest.mock('./api/organizations-api', () => ({
  ...jest.requireActual('./api/organizations-api'),
  fetchOrganization: (...a: unknown[]) => mockApi.fetchOrganization(...a),
  requestToJoin: (...a: unknown[]) => mockApi.requestToJoin(...a),
  respondToInvite: (...a: unknown[]) => mockApi.respondToInvite(...a),
  decideJoinRequest: (...a: unknown[]) => mockApi.decideJoinRequest(...a),
  leaveOrganization: (...a: unknown[]) => mockApi.leaveOrganization(...a),
  removeMember: (...a: unknown[]) => mockApi.removeMember(...a),
  setMemberRole: (...a: unknown[]) => mockApi.setMemberRole(...a),
  transferOwnership: (...a: unknown[]) => mockApi.transferOwnership(...a),
  fetchOrganizationEvents: (...a: unknown[]) => mockApi.fetchOrganizationEvents(...a),
}));
jest.mock('./api/event-link-api', () => ({
  fetchRunnableOrganizations: (...a: unknown[]) => mockApi.fetchRunnableOrganizations(...a),
  setEventOrganization: (...a: unknown[]) => mockApi.setEventOrganization(...a),
}));
jest.mock('./api/invite-api', () => ({
  fetchOrganizationsToInvite: (...a: unknown[]) => mockApi.fetchOrganizationsToInvite(...a),
  inviteToOrganization: (...a: unknown[]) => mockApi.inviteToOrganization(...a),
}));
jest.mock('@/features/catalog/api/catalog-api', () => ({
  fetchCatalog: () => Promise.resolve({ sports: [], cities: [] }),
}));
const mockRouter = { replace: jest.fn(), push: jest.fn(), back: jest.fn(), canGoBack: () => true };
jest.mock('expo-router', () => ({
  useRouter: () => mockRouter,
  useLocalSearchParams: () => ({ id: '00000000-0000-4000-8000-0000000000d1' }),
  usePathname: () => '/o/x',
  Link: jest.requireActual<typeof import('@/test/link-mock')>('@/test/link-mock').LinkMock,
}));

const ORG = '00000000-0000-4000-8000-0000000000d1';
const me: SessionState = {
  status: 'authenticated',
  userId: '00000000-0000-4000-8000-0000000000aa',
  email: 'a@example.com',
  emailVerified: true,
};
const person = (n: number, over: Partial<OrganizationPerson> = {}): OrganizationPerson => ({
  userId: `00000000-0000-4000-8000-0000000000b${n}`,
  displayName: `Kişi ${n}`,
  avatarKey: null,
  avatarPath: null,
  role: 'MEMBER',
  status: 'ACTIVE',
  ...over,
});
const page = (over: Partial<OrganizationPage> = {}): OrganizationPage => ({
  id: ORG,
  name: 'Çankaya Kartalları',
  description: 'Hafta içi akşam halı saha.',
  cityId: '00000000-0000-4000-8000-0000000000a1',
  sportIds: [],
  memberCount: 3,
  role: null,
  membership: null,
  leaders: [person(1, { role: 'OWNER' })],
  members: null,
  waiting: null,
  ...over,
});

beforeEach(() => {
  jest.clearAllMocks();
  for (const fn of Object.values(mockApi)) fn.mockResolvedValue(undefined);
  mockApi.requestToJoin.mockResolvedValue('REQUESTED');
  mockApi.fetchOrganizationEvents.mockResolvedValue([]);
});

describe('the organization page (Phase 9 / M2)', () => {
  it('shows a stranger what it is and who runs it, and lets them ask to join', async () => {
    mockApi.fetchOrganization.mockResolvedValue(page());
    await renderApp(<OrganizationScreen />, { session: me });
    expect(await screen.findByText('Hafta içi akşam halı saha.')).toBeTruthy();
    expect(screen.getByText('Kişi 1')).toBeTruthy();
    expect(screen.queryByText('Üyeler')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Katılmak iste' }));
    await waitFor(() => expect(mockApi.requestToJoin).toHaveBeenCalledWith(ORG));
  });

  it('an invited person accepts or declines', async () => {
    mockApi.fetchOrganization.mockResolvedValue(page({ membership: 'INVITED' }));
    await renderApp(<OrganizationScreen />, { session: me });
    await fireEvent.press(await screen.findByRole('button', { name: 'Katıl' }));
    await waitFor(() => expect(mockApi.respondToInvite).toHaveBeenCalledWith(ORG, true));
  });

  it('the owner decides requests, gives roles and hands over after asking', async () => {
    mockApi.fetchOrganization.mockResolvedValue(
      page({
        role: 'OWNER',
        membership: 'ACTIVE',
        members: [person(1, { role: 'OWNER' }), person(2)],
        waiting: [person(3, { status: 'REQUESTED' })],
      }),
    );
    await renderApp(<OrganizationScreen />, { session: me });
    await fireEvent.press(await screen.findByRole('button', { name: 'Onayla' }));
    await waitFor(() =>
      expect(mockApi.decideJoinRequest).toHaveBeenCalledWith(ORG, person(3).userId, true),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Yönetici yap' }));
    await waitFor(() =>
      expect(mockApi.setMemberRole).toHaveBeenCalledWith(ORG, person(2).userId, 'ADMIN'),
    );
    await fireEvent.press(screen.getByRole('button', { name: 'Sahipliği devret' }));
    expect(mockApi.transferOwnership).not.toHaveBeenCalled();
    await fireEvent.press(screen.getByRole('button', { name: 'Evet' }));
    await waitFor(() =>
      expect(mockApi.transferOwnership).toHaveBeenCalledWith(ORG, person(2).userId),
    );
    expect(screen.queryByRole('button', { name: 'Organizasyondan ayrıl' })).toBeNull();
  });

  it('an administrator may remove plain members only, and gives no roles', async () => {
    mockApi.fetchOrganization.mockResolvedValue(
      page({
        role: 'ADMIN',
        membership: 'ACTIVE',
        members: [person(1, { role: 'OWNER' }), person(2, { role: 'ADMIN' }), person(4)],
        waiting: [],
      }),
    );
    await renderApp(<OrganizationScreen />, { session: me });
    expect(await screen.findAllByRole('button', { name: 'Çıkar' })).toHaveLength(1);
    expect(screen.queryByRole('button', { name: 'Yönetici yap' })).toBeNull();
  });

  it('a member leaves after asking', async () => {
    mockApi.fetchOrganization.mockResolvedValue(
      page({ role: 'MEMBER', membership: 'ACTIVE', members: [person(1, { role: 'OWNER' })] }),
    );
    await renderApp(<OrganizationScreen />, { session: me });
    await fireEvent.press(await screen.findByRole('button', { name: 'Organizasyondan ayrıl' }));
    await fireEvent.press(screen.getByRole('button', { name: 'Evet, ayrıl' }));
    await waitFor(() => expect(mockApi.leaveOrganization).toHaveBeenCalledWith(ORG));
  });
});

describe('reporting the organization (Phase 9 / M4)', () => {
  it('anyone but the owner can open the report form', async () => {
    mockApi.fetchOrganization.mockResolvedValue(page());
    await renderApp(<OrganizationScreen />, { session: me });
    await fireEvent.press(await screen.findByRole('button', { name: 'Organizasyonu bildir' }));
    expect(await screen.findByRole('button', { name: 'Bildirimi gönder' })).toBeTruthy();
  });

  it('the owner does not report their own', async () => {
    mockApi.fetchOrganization.mockResolvedValue(
      page({ role: 'OWNER', membership: 'ACTIVE', members: [], waiting: [] }),
    );
    await renderApp(<OrganizationScreen />, { session: me });
    await screen.findByText('Hafta içi akşam halı saha.');
    expect(screen.queryByRole('button', { name: 'Organizasyonu bildir' })).toBeNull();
  });
});

describe('the invitation on a player card', () => {
  it('shows nothing to someone who runs no organization', async () => {
    mockApi.fetchOrganizationsToInvite.mockResolvedValue([]);
    await renderApp(<InviteToOrganization userId={person(5).userId} name="Kişi 5" />, {
      session: me,
    });
    await waitFor(() => expect(mockApi.fetchOrganizationsToInvite).toHaveBeenCalled());
    expect(screen.queryByRole('button', { name: 'Organizasyona davet et' })).toBeNull();
  });

  it('invites to an organization the viewer runs, and says where the person already is', async () => {
    mockApi.fetchOrganizationsToInvite.mockResolvedValue([
      { id: ORG, name: 'Çankaya Kartalları', membership: null },
      { id: '00000000-0000-4000-8000-0000000000d2', name: 'Tenis Grubu', membership: 'ACTIVE' },
    ]);
    mockApi.inviteToOrganization.mockResolvedValue('INVITED');
    await renderApp(<InviteToOrganization userId={person(5).userId} name="Kişi 5" />, {
      session: me,
    });
    await fireEvent.press(await screen.findByRole('button', { name: 'Organizasyona davet et' }));
    expect(screen.getByText('Üye')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Davet et (Çankaya Kartalları)' }));
    await waitFor(() =>
      expect(mockApi.inviteToOrganization).toHaveBeenCalledWith(ORG, person(5).userId),
    );
    expect(await screen.findByText('Kişi 5 davet edildi.')).toBeTruthy();
  });
});

describe('the copy', () => {
  it('has the same keys in Turkish and English', () => {
    const keys = (o: object, prefix = ''): string[] =>
      Object.entries(o).flatMap(([k, v]) =>
        typeof v === 'object' && v !== null
          ? keys(v as object, `${prefix}${k}.`)
          : [`${prefix}${k}`],
      );
    expect(keys(enInvite).sort()).toEqual(keys(trInvite).sort());
    expect(keys(enOrganizations).sort()).toEqual(keys(trOrganizations).sort());
  });
});

describe('events as the organization (Phase 9 / M3)', () => {
  it('the page lists upcoming events, linking to them', async () => {
    mockApi.fetchOrganization.mockResolvedValue(page());
    mockApi.fetchOrganizationEvents.mockResolvedValue([
      {
        id: '00000000-0000-4000-8000-0000000000e1',
        title: 'Perşembe maçı',
        startsAt: '2026-12-03T17:00:00Z',
        approvedCount: 6,
        capacity: 10,
      },
    ]);
    await renderApp(<OrganizationScreen />, { session: me });
    expect(await screen.findByText('Perşembe maçı')).toBeTruthy();
    expect(screen.getByText(/6\/10 oyuncu/)).toBeTruthy();
  });

  it('says when there are none', async () => {
    mockApi.fetchOrganization.mockResolvedValue(page());
    await renderApp(<OrganizationScreen />, { session: me });
    expect(await screen.findByText('Şu an yaklaşan bir etkinlik yok.')).toBeTruthy();
  });

  it('the organizer shows an event under an organization they run, or under themselves', async () => {
    mockApi.fetchRunnableOrganizations.mockResolvedValue([{ id: ORG, name: 'Çankaya Kartalları' }]);
    const EVENT = '00000000-0000-4000-8000-0000000000e1';
    await renderApp(<EventOrganizationControl eventId={EVENT} currentId={null} />, { session: me });
    await fireEvent.press(await screen.findByRole('radio', { name: 'Çankaya Kartalları' }));
    await waitFor(() => expect(mockApi.setEventOrganization).toHaveBeenCalledWith(EVENT, ORG));
    expect(screen.getByRole('radio', { name: 'Kendi adıma' })).toBeTruthy();
  });

  it('shows no control to someone who runs no organization', async () => {
    mockApi.fetchRunnableOrganizations.mockResolvedValue([]);
    await renderApp(
      <EventOrganizationControl eventId="00000000-0000-4000-8000-0000000000e1" currentId={null} />,
      { session: me },
    );
    await waitFor(() => expect(mockApi.fetchRunnableOrganizations).toHaveBeenCalled());
    expect(screen.queryByText('Organizasyon adına')).toBeNull();
  });
});
