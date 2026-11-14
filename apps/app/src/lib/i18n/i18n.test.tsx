import { brand } from '@matchup/config';
import { DOMAIN_ERROR_CODES } from '@matchup/domain';
import { act, render, screen } from '@testing-library/react-native';
import { Text } from 'react-native';
import { useTranslation } from 'react-i18next';
import { formatDateTime, formatMoneyMinor, i18n, initI18n, toLocaleLower, toLocaleUpper } from '.';
import { enResources } from './en-resources';
import { resources as trOnly } from './resources';

const resources = { tr: trOnly.tr, en: enResources };

type Json = { [key: string]: string | Json };

function flatten(value: Json, prefix = ''): Record<string, string> {
  return Object.entries(value).reduce<Record<string, string>>((acc, [key, v]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof v === 'string' ? { ...acc, [path]: v } : { ...acc, ...flatten(v, path) };
  }, {});
}

const placeholders = (s: string) => [...s.matchAll(/\{\{\s*(\w+)\s*\}\}/g)].map((m) => m[1]).sort();

describe('translation resources', () => {
  const namespaces = Object.keys(resources.tr) as (keyof typeof resources.tr)[];

  it.each(namespaces)('namespace "%s": tr and en have identical keys', (ns) => {
    const tr = flatten(resources.tr[ns] as Json);
    const en = flatten(resources.en[ns] as Json);
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort());
  });

  it.each(namespaces)('namespace "%s": no empty strings and matching placeholders', (ns) => {
    const tr = flatten(resources.tr[ns] as Json);
    const en = flatten(resources.en[ns] as Json);
    for (const [key, text] of Object.entries(tr)) {
      expect(text.trim().length).toBeGreaterThan(0);
      expect(en[key]?.trim().length ?? 0).toBeGreaterThan(0);
      expect(placeholders(en[key] ?? '')).toEqual(placeholders(text));
    }
  });

  it.each(namespaces)(
    'namespace "%s": every plural has both forms, and counts are interpolated',
    (ns) => {
      // i18next picks _one/_other by the count in both languages; a lone form shows a raw key for the other count.
      const tr = flatten(resources.tr[ns] as Json);
      for (const key of Object.keys(tr)) {
        const base = key.replace(/_(one|other)$/, '');
        if (base === key) continue;
        expect(tr).toHaveProperty([`${base}_one`]);
        expect(tr).toHaveProperty([`${base}_other`]);
      }
    },
  );

  // Copy that travels with a lazy chunk (addResourceBundle) is not in `resources`; hold it to the same parity.
  it.each([
    'admin',
    'organizations',
    'organization-invite',
    'businesses',
    'business-invite',
    'event-series',
  ])('lazily loaded "%s": tr and en have identical keys and placeholders', (file) => {
    /* eslint-disable @typescript-eslint/no-require-imports -- a file per case; the JSON is the test's input */
    const tr = flatten(require(`@/locales/tr/${file}.json`) as Json);
    const en = flatten(require(`@/locales/en/${file}.json`) as Json);
    /* eslint-enable @typescript-eslint/no-require-imports */
    expect(Object.keys(en).sort()).toEqual(Object.keys(tr).sort());
    for (const [key, text] of Object.entries(tr)) {
      expect(text.trim().length).toBeGreaterThan(0);
      expect(placeholders(en[key] ?? '')).toEqual(placeholders(text));
    }
  });

  it('no resource hard-codes the product name (ADR-0010)', () => {
    const all = JSON.stringify(resources);
    expect(all).not.toContain(brand.name);
  });

  it('has a localized message for every domain error code in both languages', () => {
    for (const code of DOMAIN_ERROR_CODES) {
      expect(resources.tr.errors).toHaveProperty(code);
      expect(resources.en.errors).toHaveProperty(code);
    }
    for (const code of ['NETWORK', 'TIMEOUT', 'UNKNOWN'] as const) {
      expect(resources.tr.errors[code].length).toBeGreaterThan(0);
    }
  });
});

describe('i18n runtime', () => {
  afterEach(() => {
    initI18n('tr');
  });

  function Probe() {
    const { t } = useTranslation('common');
    return (
      <>
        <Text>{t('retry')}</Text>
        <Text>{t('logoAlt')}</Text>
        <Text>{t('participants', { count: 3 })}</Text>
      </>
    );
  }

  it('is Turkish-first and injects the brand name via {{appName}}', async () => {
    initI18n('tr');
    await render(<Probe />);
    expect(screen.getByText('Tekrar dene')).toBeTruthy();
    expect(screen.getByText(`Logo: ${brand.name}`)).toBeTruthy();
    expect(screen.getByText('3 katılımcı')).toBeTruthy();
  });

  it('switches to English at runtime', async () => {
    initI18n('tr');
    await render(<Probe />);
    await act(async () => {
      await i18n.changeLanguage('en');
    });
    expect(screen.getByText('Try again')).toBeTruthy();
    expect(screen.getByText('3 participants')).toBeTruthy();
  });

  it('falls back to Turkish for an unsupported language', async () => {
    initI18n('tr');
    await act(async () => {
      await i18n.changeLanguage('de');
    });
    expect(i18n.t('retry')).toBe('Tekrar dene');
  });
});

describe('formatting (market: Europe/Istanbul, Turkish)', () => {
  it('renders event times in Istanbul time regardless of device timezone', () => {
    // 21:30 UTC on 24 Oct is already 00:30 on 25 Oct in Istanbul (UTC+3, no DST).
    const text = formatDateTime('2026-10-24T21:30:00Z', 'en', {
      dateStyle: 'short',
      timeStyle: 'short',
      hourCycle: 'h23',
    });
    expect(text).toContain('10/25/26');
    expect(text).toContain('00:30');
  });

  it('upper-cases Turkish dotted/dotless I correctly', () => {
    expect(toLocaleUpper('izmir ılık', 'tr')).toBe('İZMİR ILIK');
    expect(toLocaleLower('İSTANBUL IŞIK', 'tr')).toBe('istanbul ışık');
    expect('izmir'.toUpperCase()).toBe('IZMIR'); // the bug we avoid
  });

  it('formats TRY amounts from integer minor units', () => {
    expect(formatMoneyMinor(15000, 'tr').replace(/\s/g, '')).toBe('₺150,00');
  });
});
