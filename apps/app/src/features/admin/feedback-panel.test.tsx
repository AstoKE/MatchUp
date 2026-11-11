import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import type { SessionState } from '@/features/auth';
import { initI18n } from '@/lib/i18n';
import { renderApp } from '@/test/render';
import { FeedbackPanel } from './components/FeedbackPanel';
import { ensureAdminCopy } from './copy';

const mockFetch = jest.fn();
const mockSet = jest.fn();
jest.mock('./api/admin-api', () => ({
  ...jest.requireActual('./api/admin-api'),
  fetchFeedback: (...a: unknown[]) => mockFetch(...a),
  setFeedbackStatus: (...a: unknown[]) => mockSet(...a),
}));

const admin: SessionState = {
  status: 'authenticated',
  userId: '00000000-0000-4000-8000-0000000000ad',
  email: 'admin@example.com',
  emailVerified: true,
};
const WRITER = '00000000-0000-4000-8000-0000000000c1';
const item = (over: Record<string, unknown> = {}) => ({
  id: '00000000-0000-4000-8000-0000000000f1',
  kind: 'SUGGESTION',
  body: 'Takvime ekle düğmesi olsa iyi olur.',
  context: 'settings',
  status: 'NEW',
  user_id: WRITER,
  user_name: 'Deniz Kaya',
  created_at: '2026-11-11T10:00:00+00:00',
  handled_at: null,
  ...over,
});

// The console loads its own copy (copy.ts); here it is loaded once i18n has started.
beforeAll(() => {
  initI18n('tr');
  ensureAdminCopy();
});
beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue([item()]);
  mockSet.mockResolvedValue(undefined);
});

describe('the console: feedback (P-22)', () => {
  it('lists what is not done, and marks one done', async () => {
    await renderApp(<FeedbackPanel onOpenUser={jest.fn()} />, { session: admin });
    expect(await screen.findByText('Takvime ekle düğmesi olsa iyi olur.')).toBeTruthy();
    expect(mockFetch).toHaveBeenCalledWith(null);
    expect(screen.getByText(/Öneri · Yeni/)).toBeTruthy();
    expect(screen.getByText('Gönderildiği yer: settings')).toBeTruthy();
    await fireEvent.press(screen.getByRole('button', { name: 'Tamamlandı' }));
    await waitFor(() =>
      expect(mockSet).toHaveBeenCalledWith('00000000-0000-4000-8000-0000000000f1', 'DONE'),
    );
  });

  it('opens the writer, and shows the done ones on request', async () => {
    const onOpenUser = jest.fn();
    await renderApp(<FeedbackPanel onOpenUser={onOpenUser} />, { session: admin });
    await fireEvent.press(await screen.findByRole('button', { name: 'Deniz Kaya' }));
    expect(onOpenUser).toHaveBeenCalledWith(WRITER);
    await fireEvent.press(screen.getByRole('radio', { name: 'Tamamlanan' }));
    await waitFor(() => expect(mockFetch).toHaveBeenCalledWith('DONE'));
  });

  it('says when there is nothing', async () => {
    mockFetch.mockResolvedValue([]);
    await renderApp(<FeedbackPanel onOpenUser={jest.fn()} />, { session: admin });
    expect(await screen.findByText('Burada mesaj yok.')).toBeTruthy();
  });
});
