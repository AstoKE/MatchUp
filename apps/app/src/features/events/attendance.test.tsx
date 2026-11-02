import { AppError } from '@matchup/domain';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderApp } from '@/test/render';
import type { EventAttendance } from './api/attendance-api';
import { AttendancePanel } from './components/AttendancePanel';

const EVENT = '00000000-0000-4000-8000-0000000000e1';
const P1 = '00000000-0000-4000-8000-000000000c01';
const P2 = '00000000-0000-4000-8000-000000000c02';
const SELF = '00000000-0000-4000-8000-000000000c03';

const mockApi = {
  fetchEventAttendance: jest.fn(),
  markAttendance: jest.fn(),
  finalizeAttendance: jest.fn(),
  disputeAttendance: jest.fn(),
};
jest.mock('./api/attendance-api', () => ({
  fetchEventAttendance: (...a: unknown[]) => mockApi.fetchEventAttendance(...a),
  markAttendance: (...a: unknown[]) => mockApi.markAttendance(...a),
  finalizeAttendance: (...a: unknown[]) => mockApi.finalizeAttendance(...a),
  disputeAttendance: (...a: unknown[]) => mockApi.disputeAttendance(...a),
}));
jest.mock('./api/events-api', () => ({}));
jest.mock('./api/participation-api', () => ({}));
jest.mock('./api/my-events-api', () => ({}));
jest.mock('./api/search-api', () => ({}));

const roster = (over: Partial<EventAttendance> = {}): EventAttendance => ({
  finalizedAt: null,
  disputeClosesAt: null,
  my: { participationId: SELF, attendance: 'PRESENT', isOrganizer: true },
  roster: [
    { participationId: SELF, displayName: 'Ben', attendance: 'PRESENT', isOrganizer: true },
    { participationId: P1, displayName: 'Deniz', attendance: 'NOT_CONFIRMED', isOrganizer: false },
    { participationId: P2, displayName: null, attendance: 'ABSENT', isOrganizer: false },
  ],
  ...over,
});
const own = (attendance: string, over: Partial<EventAttendance> = {}) =>
  ({
    finalizedAt: '2026-11-01T10:00:00Z',
    disputeClosesAt: new Date(Date.now() + 3_600_000).toISOString(),
    my: { participationId: P1, attendance, isOrganizer: false },
    roster: null,
    ...over,
  }) as EventAttendance;

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.markAttendance.mockResolvedValue(undefined);
  mockApi.finalizeAttendance.mockResolvedValue(undefined);
  mockApi.disputeAttendance.mockResolvedValue(undefined);
});

describe('the organizer', () => {
  it('marks a player; their own self-attested row is not offered', async () => {
    mockApi.fetchEventAttendance.mockResolvedValue(roster());
    await renderApp(<AttendancePanel eventId={EVENT} isOrganizer />);
    // Two players, so two choices: the organizer's own row has none.
    const present = await screen.findAllByRole('radio', { name: 'Geldi' });
    expect(present).toHaveLength(2);
    expect(screen.getByText('Deniz', { includeHiddenElements: true })).toBeTruthy();
    expect(screen.queryByText('Ben', { includeHiddenElements: true })).toBeNull();
    await fireEvent.press(present[0]!);
    await waitFor(() => expect(mockApi.markAttendance).toHaveBeenCalledTimes(1));
    expect(mockApi.markAttendance.mock.calls[0]![0]).toEqual({
      participationId: P1,
      value: 'PRESENT',
    });
  });

  it('must confirm finalizing, is told about unmarked players, and can step back', async () => {
    mockApi.fetchEventAttendance.mockResolvedValue(roster());
    await renderApp(<AttendancePanel eventId={EVENT} isOrganizer />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Yoklamayı kesinleştir' }));
    expect(mockApi.finalizeAttendance).not.toHaveBeenCalled();
    expect(await screen.findByText(/1 oyuncu işaretlenmedi/)).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Vazgeç' }));
    await fireEvent.press(await screen.findByRole('button', { name: 'Yoklamayı kesinleştir' }));
    expect(mockApi.finalizeAttendance).not.toHaveBeenCalled();
    await fireEvent.press(await screen.findByRole('button', { name: 'Evet, kesinleştir' }));
    expect(await screen.findByText('Yoklama kesinleşti')).toBeTruthy();
    expect(mockApi.finalizeAttendance.mock.calls[0]![0]).toBe(EVENT);
  });

  it('after finalizing sees the marks and no controls', async () => {
    mockApi.fetchEventAttendance.mockResolvedValue(roster({ finalizedAt: '2026-11-01T10:00:00Z' }));
    await renderApp(<AttendancePanel eventId={EVENT} isOrganizer />);
    expect(await screen.findByText('Deniz: İşaretlenmedi')).toBeTruthy();
    expect(screen.getByText('Oyuncu: Gelmedi')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: 'Geldi' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Yoklamayı kesinleştir' })).toBeNull();
  });

  it('sees a server refusal, localized', async () => {
    mockApi.fetchEventAttendance.mockResolvedValue(roster());
    mockApi.markAttendance.mockRejectedValue(new AppError('INVALID_TRANSITION'));
    await renderApp(<AttendancePanel eventId={EVENT} isOrganizer />);
    await fireEvent.press((await screen.findAllByRole('radio', { name: 'Gelmedi' }))[0]!);
    expect(await screen.findByText('Bu işlem şu an yapılamıyor.')).toBeTruthy();
  });
});

describe('a player', () => {
  it('sees nothing final before finalization', async () => {
    mockApi.fetchEventAttendance.mockResolvedValue(
      own('ABSENT', { finalizedAt: null, disputeClosesAt: null }),
    );
    await renderApp(<AttendancePanel eventId={EVENT} isOrganizer={false} />);
    expect(await screen.findByText('Organizatör yoklamayı henüz kesinleştirmedi.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'İtiraz et' })).toBeNull();
  });

  it('an absent mark stands out with an icon; a neutral state does not', async () => {
    mockApi.fetchEventAttendance.mockResolvedValue(own('ABSENT'));
    const first = await renderApp(<AttendancePanel eventId={EVENT} isOrganizer={false} />);
    expect(await screen.findByText('Gelmedin olarak işaretlendin.')).toBeTruthy();
    expect(screen.getByTestId('icon-alert', { includeHiddenElements: true })).toBeTruthy();
    await first.unmount();
    mockApi.fetchEventAttendance.mockResolvedValue(own('NOT_CONFIRMED'));
    await renderApp(<AttendancePanel eventId={EVENT} isOrganizer={false} />);
    expect(await screen.findByText(/Organizatör seni işaretlemedi/)).toBeTruthy();
    expect(screen.queryByTestId('icon-alert', { includeHiddenElements: true })).toBeNull();
  });

  it('cannot dispute a present mark', async () => {
    mockApi.fetchEventAttendance.mockResolvedValue(own('PRESENT'));
    await renderApp(<AttendancePanel eventId={EVENT} isOrganizer={false} />);
    expect(await screen.findByText('Geldin olarak işaretlendin.')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'İtiraz et' })).toBeNull();
  });

  it('disputes an absent mark with a trimmed reason; an empty one is not sent', async () => {
    mockApi.fetchEventAttendance.mockResolvedValue(own('ABSENT'));
    await renderApp(<AttendancePanel eventId={EVENT} isOrganizer={false} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'İtiraz et' }));
    await fireEvent.press(await screen.findByText('İtirazı gönder'));
    expect(mockApi.disputeAttendance).not.toHaveBeenCalled();
    await fireEvent.changeText(screen.getByLabelText('Neden yanlış?'), '  Oradaydım  ');
    await screen.findByDisplayValue('  Oradaydım  ');
    await fireEvent.press(screen.getByText('İtirazı gönder'));
    expect(await screen.findByText('İtirazın alındı')).toBeTruthy();
    expect(mockApi.disputeAttendance.mock.calls[0]![0]).toEqual({
      participationId: P1,
      reason: 'Oradaydım',
    });
  });

  it('cannot dispute after the window', async () => {
    mockApi.fetchEventAttendance.mockResolvedValue(
      own('ABSENT', { disputeClosesAt: '2020-01-01T00:00:00Z' }),
    );
    await renderApp(<AttendancePanel eventId={EVENT} isOrganizer={false} />);
    expect(
      await screen.findByText('Gelmedin olarak işaretlendin. İtiraz süresi doldu.'),
    ).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'İtiraz et' })).toBeNull();
  });

  it('sees a dispute under review', async () => {
    mockApi.fetchEventAttendance.mockResolvedValue(own('DISPUTED'));
    await renderApp(<AttendancePanel eventId={EVENT} isOrganizer={false} />);
    expect(await screen.findByText(/İtirazın inceleniyor/)).toBeTruthy();
  });

  it('offers a retry when loading fails', async () => {
    mockApi.fetchEventAttendance.mockRejectedValueOnce(new AppError('NETWORK'));
    mockApi.fetchEventAttendance.mockResolvedValue(own('PRESENT'));
    await renderApp(<AttendancePanel eventId={EVENT} isOrganizer={false} />);
    await fireEvent.press(await screen.findByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByText('Geldin olarak işaretlendin.')).toBeTruthy();
  });
});
