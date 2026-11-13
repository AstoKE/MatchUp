import { focusManager } from '@tanstack/react-query';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react-native';
import { initI18n } from '@/lib/i18n';
import { renderApp } from '@/test/render';
import type { DashboardSummary } from './api/admin-api';
import { DashboardPanel } from './components/DashboardPanel';
import { ensureAdminCopy } from './copy';
import { relativeAge } from './relative-age';
import { useDashboardSummary } from './hooks';

const mockFetch = jest.fn();
jest.mock('./api/admin-api', () => ({
  ...jest.requireActual('./api/admin-api'),
  fetchDashboardSummary: (...args: unknown[]) => mockFetch(...args),
}));
const at = '2026-11-12T10:00:00Z';
const summary: DashboardSummary = {
  generated_at: at,
  reports: { count: 3, oldest_at: at, by_type: { USER: 1, EVENT: 2, VENUE: 0, ORGANIZATION: 0 } },
  organization_requests: { count: 4, oldest_at: at },
  business_requests: { count: 5, oldest_at: at },
  feedback: { count: 0, oldest_at: null },
  disputes: { count: 6, oldest_at: at },
  flags: { count: 7 },
  recent_actions: [
    { action: 'USER_SUSPENDED', target_type: 'USER', note: 'n'.repeat(140), created_at: at },
  ],
};
beforeAll(() => {
  initI18n('tr');
  ensureAdminCopy();
});
beforeEach(() => {
  jest.clearAllMocks();
  mockFetch.mockResolvedValue(summary);
});

it('shows every queue, counts, report types, oldest ages and a visible muted zero queue', async () => {
  await renderApp(<DashboardPanel onOpenSection={jest.fn()} />);
  expect(await screen.findByLabelText('Bildirimler (açık): 3 bekliyor')).toBeTruthy();
  for (const label of [
    'Organizasyon istekleri: 4 bekliyor',
    'İşletme istekleri: 5 bekliyor',
    'Geri bildirim (yeni): 0 bekliyor',
    'Yoklama itirazları: 6 bekliyor',
    'İşaretler: 7 bekliyor',
  ]) {
    expect(screen.getByLabelText(label)).toBeTruthy();
  }
  expect(screen.getByText('Kişi: 1 · Etkinlik: 2 · Mekân: 0 · Organizasyon: 0')).toBeTruthy();
  expect(screen.getByText('Bekleyen yok')).toBeTruthy();
  expect(screen.getAllByText(/^en eski:/)).toHaveLength(4);
});

it('opens the matching section from each card and the full log', async () => {
  const onOpenSection = jest.fn();
  await renderApp(<DashboardPanel onOpenSection={onOpenSection} />);
  await screen.findByText('Son işlemler');
  const cards = [
    ['Bildirimler (açık)', 'reports'],
    ['Organizasyon istekleri', 'organizations'],
    ['İşletme istekleri', 'businesses'],
    ['Geri bildirim (yeni)', 'feedback'],
    ['Yoklama itirazları', 'disputes'],
    ['İşaretler', 'flags'],
  ];
  for (const [title, section] of cards) {
    await fireEvent.press(screen.getByRole('button', { name: `Aç: ${title}` }));
    expect(onOpenSection).toHaveBeenLastCalledWith(section);
  }
  await fireEvent.press(screen.getByRole('button', { name: 'Tüm kayıt' }));
  expect(onOpenSection).toHaveBeenLastCalledWith('audit');
});

it('lists localized recent actions and truncates notes to 120 characters', async () => {
  await renderApp(<DashboardPanel onOpenSection={jest.fn()} />);
  expect(await screen.findByText('Hesap askıya alındı')).toBeTruthy();
  expect(screen.getByText('Kişi')).toBeTruthy();
  expect(screen.getByText('n'.repeat(120))).toBeTruthy();
  expect(screen.queryByText('n'.repeat(140))).toBeNull();
});

it('an action this app version does not know yet shows its code instead of breaking the page', async () => {
  mockFetch.mockResolvedValue({
    ...summary,
    recent_actions: [
      {
        action: 'SOMETHING_NEW',
        target_type: 'TEAM',
        note: null,
        created_at: summary.generated_at,
      },
    ],
  });
  await renderApp(<DashboardPanel onOpenSection={jest.fn()} />);
  expect(await screen.findByText('SOMETHING_NEW')).toBeTruthy();
  expect(screen.getByText('TEAM')).toBeTruthy();
  expect(screen.getByText('Bildirimler (açık)')).toBeTruthy();
});

it('retries a failed load and allows manual refresh', async () => {
  mockFetch.mockRejectedValueOnce(new Error('NETWORK_ERROR'));
  await renderApp(<DashboardPanel onOpenSection={jest.fn()} />);
  expect(await screen.findByText('Pano yüklenemedi')).toBeTruthy();
  await fireEvent.press(screen.getByRole('button', { name: 'Tekrar dene' }));
  await screen.findByText('Son işlemler');
  await fireEvent.press(screen.getByRole('button', { name: 'Yenile' }));
  await waitFor(() => expect(mockFetch).toHaveBeenCalledTimes(3));
});

it('shows an empty recent log without hiding zero cards', async () => {
  mockFetch.mockResolvedValue({ ...summary, recent_actions: [] });
  await renderApp(<DashboardPanel onOpenSection={jest.fn()} />);
  expect(await screen.findByText('Henüz işlem yok')).toBeTruthy();
  const card = screen.getByLabelText('Geri bildirim (yeni): 0 bekliyor');
  expect(within(card).getByText('Bekleyen yok')).toBeTruthy();
});

function PollingProbe({ active }: { active: boolean }) {
  useDashboardSummary(active);
  return null;
}

it('polls every minute only while active and foregrounded, and stops on unmount', async () => {
  jest.useFakeTimers();
  focusManager.setFocused(true);
  try {
    const view = await renderApp(<PollingProbe active />);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(59_999);
    });
    expect(mockFetch).toHaveBeenCalledTimes(1);
    await act(async () => {
      await jest.advanceTimersByTimeAsync(1);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await act(async () => {
      focusManager.setFocused(false);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(120_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await view.unmount();
    const inactive = await renderApp(<PollingProbe active={false} />);
    await act(async () => {
      focusManager.setFocused(true);
    });
    await act(async () => {
      await jest.advanceTimersByTimeAsync(120_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
    await inactive.unmount();
    await act(async () => {
      await jest.advanceTimersByTimeAsync(120_000);
    });
    expect(mockFetch).toHaveBeenCalledTimes(2);
  } finally {
    focusManager.setFocused(undefined);
    jest.useRealTimers();
  }
});

describe('relativeAge', () => {
  const now = Date.parse(at);
  it.each([
    [0, '0 saniye önce'],
    [59_000, '59 saniye önce'],
    [60_000, '1 dakika önce'],
    [3_600_000, '1 saat önce'],
    [3 * 86_400_000, '3 gün önce'],
    [30 * 86_400_000, '1 ay önce'],
    [365 * 86_400_000, '1 yıl önce'],
  ])('formats an age of %i ms in Turkish', (age, expected) => {
    initI18n('tr');
    expect(relativeAge(new Date(now - age).toISOString(), now)).toBe(expected);
  });
  it('uses the current language and clamps future clock skew', () => {
    initI18n('en');
    expect(relativeAge(new Date(now - 3 * 86_400_000).toISOString(), now)).toBe('3 days ago');
    expect(relativeAge(new Date(now + 60_000).toISOString(), now)).toBe('0 seconds ago');
    initI18n('tr');
  });
});
