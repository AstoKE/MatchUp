import { describe, expect, it } from 'vitest';
import { maskTurkishMobile, normalizeTurkishMobile } from './phone';

describe('normalizeTurkishMobile', () => {
  it('accepts the ways people write a Turkish mobile number', () => {
    for (const typed of [
      '0532 123 45 67',
      '532 123 4567',
      '+90 (532) 123-45-67',
      '905321234567',
      '5321234567',
    ]) {
      expect(normalizeTurkishMobile(typed)).toBe('+905321234567');
    }
  });
  it('refuses landlines, foreign numbers, short numbers and letters', () => {
    for (const typed of [
      '0312 123 45 67',
      '+44 7700 900123',
      '532 123 45',
      '0532 12a 45 67',
      '',
      '+1 5321234567',
    ]) {
      expect(normalizeTurkishMobile(typed)).toBeNull();
    }
  });
});

describe('maskTurkishMobile', () => {
  it('keeps the operator code and the last two digits', () => {
    expect(maskTurkishMobile('+905321234567')).toBe('+90 532 *** ** 67');
  });
});
