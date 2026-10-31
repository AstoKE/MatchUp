import { AppError } from '@matchup/domain';
import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { renderApp } from '@/test/render';
import type { EventReviews } from './api/reviews-api';
import { ReviewPanel } from './components/ReviewPanel';

const EVENT = '00000000-0000-4000-8000-0000000000e1';
const A = '00000000-0000-4000-8000-000000000a01';
const B = '00000000-0000-4000-8000-000000000a02';

const mockApi = { fetchEventReviews: jest.fn(), submitReviews: jest.fn() };
jest.mock('./api/reviews-api', () => ({
  fetchEventReviews: (...a: unknown[]) => mockApi.fetchEventReviews(...a),
  submitReviews: (...a: unknown[]) => mockApi.submitReviews(...a),
}));
jest.mock('./api/attendance-api', () => ({}));
jest.mock('./api/events-api', () => ({}));
jest.mock('./api/participation-api', () => ({}));
jest.mock('./api/my-events-api', () => ({}));
jest.mock('./api/search-api', () => ({}));

const data = (over: Partial<EventReviews> = {}): EventReviews => ({
  canReview: true,
  windowOpen: true,
  windowClosesAt: '2026-11-04T10:00:00Z',
  targets: [
    { userId: A, displayName: 'Deniz', reviewed: false },
    { userId: B, displayName: null, reviewed: false },
  ],
  ...over,
});
const panel = () => (
  <ReviewPanel
    eventId={EVENT}
    timeZone="Europe/Istanbul"
    descriptors={{ '1': { tr: 'Yeni başlıyor', en: 'Just starting' } }}
  />
);

beforeEach(() => {
  jest.clearAllMocks();
  mockApi.submitReviews.mockResolvedValue(undefined);
});

describe('reviewing', () => {
  it('renders nothing for someone without review rights', async () => {
    mockApi.fetchEventReviews.mockResolvedValue(data({ canReview: false, targets: [] }));
    await renderApp(panel());
    await waitFor(() => expect(mockApi.fetchEventReviews).toHaveBeenCalled());
    expect(screen.queryByText('Değerlendirme')).toBeNull();
  });

  it('shows the anchors and that reviews are blind', async () => {
    mockApi.fetchEventReviews.mockResolvedValue(data());
    await renderApp(panel());
    expect(await screen.findByText('1: Yeni başlıyor')).toBeTruthy();
    expect(screen.getByText(/Puanını kimse göremez/)).toBeTruthy();
  });

  it('sends only the people with a score, with their fair play, and nothing with none chosen', async () => {
    mockApi.fetchEventReviews.mockResolvedValue(data());
    await renderApp(panel());
    await screen.findByText('1: Yeni başlıyor');
    await fireEvent.press(screen.getByText('Değerlendirmeleri gönder (0)'));
    expect(mockApi.submitReviews).not.toHaveBeenCalled();

    await fireEvent.press(screen.getAllByRole('radio', { name: '4' })[0]!);
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Deniz centilmendi' }));
    // Fair play alone does not make the second player part of the submission.
    await fireEvent.press(screen.getByRole('checkbox', { name: 'Oyuncu centilmendi' }));
    await fireEvent.press(await screen.findByText('Değerlendirmeleri gönder (1)'));
    expect(await screen.findByText('Değerlendirmelerin alındı')).toBeTruthy();
    expect(mockApi.submitReviews.mock.calls[0]![0]).toEqual({
      eventId: EVENT,
      reviews: [{ revieweeId: A, score: 4, fairPlay: true }],
    });
  });

  it('a reviewed player has no controls, and all done says so', async () => {
    mockApi.fetchEventReviews.mockResolvedValue(
      data({ targets: [{ userId: A, displayName: 'Deniz', reviewed: true }] }),
    );
    await renderApp(panel());
    expect(await screen.findByText('Deniz: değerlendirildi')).toBeTruthy();
    expect(screen.getByText('Herkesi değerlendirdin. Teşekkürler!')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: '4' })).toBeNull();
  });

  it('after the window says it is closed and offers nothing', async () => {
    mockApi.fetchEventReviews.mockResolvedValue(data({ windowOpen: false }));
    await renderApp(panel());
    expect(await screen.findByText('Değerlendirme süresi doldu.')).toBeTruthy();
    expect(screen.queryByRole('radio', { name: '4' })).toBeNull();
  });

  it('shows a server refusal, localized, and keeps the choices', async () => {
    mockApi.fetchEventReviews.mockResolvedValue(data());
    mockApi.submitReviews.mockRejectedValue(new AppError('WINDOW_CLOSED'));
    await renderApp(panel());
    await screen.findByText('1: Yeni başlıyor');
    await fireEvent.press(screen.getAllByRole('radio', { name: '2' })[0]!);
    await fireEvent.press(await screen.findByText('Değerlendirmeleri gönder (1)'));
    expect(await screen.findByText('Değerlendirme süresi doldu.')).toBeTruthy();
    expect(screen.getByText('Değerlendirmeleri gönder (1)')).toBeTruthy();
  });

  it('offers a retry when loading fails', async () => {
    mockApi.fetchEventReviews.mockRejectedValueOnce(new AppError('NETWORK'));
    mockApi.fetchEventReviews.mockResolvedValue(data());
    await renderApp(panel());
    await fireEvent.press(await screen.findByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByText('1: Yeni başlıyor')).toBeTruthy();
  });
});
