import { displayNameSchema } from '@matchup/domain';
import { afterAll, describe, expect, it } from 'vitest';
import { closeDb, db } from './helpers';

/** ADR-0004: the database decides what a display name may be; the domain package says the same before the request is sent. */
afterAll(async () => {
  await closeDb();
});

const NAMES = [
  'Ayşe Yılmaz',
  'İlker Şahin',
  'Ece',
  'x',
  '',
  '   ',
  'A'.repeat(40),
  'A'.repeat(41),
  'Ali\u0007Veli',
  'ali.com',
  'Ali.COM',
  'ali.com.tr',
  'ali.comş',
  'ali.tr',
  'Ali.Kaya',
  'Ali Kaya.',
  'www.ornek',
  'http://x',
  'https:x',
  'ali@ornek',
  '@ali',
  'Ara 0532 123 45 67',
  '05321234567',
  '(0532) 123-45-67',
  'Ali 123456',
  'Ali 1234567',
  'Kaya 12 34 56 7',
  'Mert 2026',
  'ali.xyz',
  'ali.ru',
  'ali.org!',
];

describe('display names', () => {
  it.each(NAMES)('%j is accepted or refused the same way by both', async (name) => {
    const domain = displayNameSchema.safeParse(name).success;
    let database = true;
    try {
      await db().query('select private.clean_display_name($1)', [name]);
    } catch {
      database = false;
    }
    expect(domain).toBe(database);
  });

  it('refuses what an advertisement is made of', () => {
    for (const name of ['ali.com', 'Ara 0532 123 45 67', 'ali@ornek', 'http://x']) {
      expect(displayNameSchema.safeParse(name).success).toBe(false);
    }
    expect(displayNameSchema.safeParse('Ayşe Yılmaz').success).toBe(true);
  });
});
