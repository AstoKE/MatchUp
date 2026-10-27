import { describe, expect, it } from 'vitest';
import {
  formatTypedDate,
  parseCostToMinor,
  parseTypedDate,
  parseTypedTime,
  toEventInput,
  utcToZonedParts,
  validateCancel,
  validateEventDraft,
  zonedTimeToUtc,
  type EventDraft,
} from './event';

const IST = 'Europe/Istanbul';
const NOW = new Date('2026-10-27T10:00:00.000Z'); // 13:00 in Istanbul

const draft = (over: Partial<EventDraft> = {}): EventDraft => ({
  sportId: '00000000-0000-4000-8000-000000000001',
  formatId: '00000000-0000-4000-8000-000000000002',
  title: '  Akşam   halı saha ',
  description: '',
  date: '2026-10-28',
  time: '19:30',
  durationMinutes: 90,
  cityId: '00000000-0000-4000-8000-000000000003',
  districtId: '00000000-0000-4000-8000-000000000004',
  locationVisibility: 'PUBLIC',
  placeLabel: 'ODTÜ Halı Saha 2',
  addressText: '',
  participantNotes: '',
  capacity: 12,
  organizerPlays: true,
  waitlistEnabled: true,
  visibility: 'PUBLIC',
  skillMin: null,
  skillMax: null,
  bookingStatus: 'NOT_REQUIRED',
  costText: '',
  costNote: '',
  equipmentNote: '',
  ...over,
});
const ctx = { format: { min: 10, max: 14 }, timeZone: IST, now: NOW, publishing: true };

describe('typed date and time', () => {
  it.each([
    ['25.10.2026', '2026-10-25'],
    ['5/1/2027', '2027-01-05'],
    ['05-01-2027', '2027-01-05'],
    ['31.02.2027', null],
    ['2026-10-25', null],
    ['', null],
  ])('parseTypedDate(%j) → %j', (input, expected) => {
    expect(parseTypedDate(input)).toBe(expected);
  });

  it('formats back to the Turkish order', () => {
    expect(formatTypedDate('2026-10-25')).toBe('25.10.2026');
    expect(formatTypedDate('nonsense')).toBe('');
  });

  it.each([
    ['19:30', '19:30'],
    ['9:05', '09:05'],
    ['09.05', '09:05'],
    ['0905', '09:05'],
    ['24:00', null],
    ['12:60', null],
    ['noon', null],
  ])('parseTypedTime(%j) → %j', (input, expected) => {
    expect(parseTypedTime(input)).toBe(expected);
  });
});

describe('time zones', () => {
  it('converts Istanbul wall time (UTC+3, no DST) to UTC and back', () => {
    expect(zonedTimeToUtc('2026-10-28', '19:30', IST)).toBe('2026-10-28T16:30:00.000Z');
    expect(utcToZonedParts('2026-10-28T16:30:00.000Z', IST)).toEqual({
      date: '2026-10-28',
      time: '19:30',
    });
  });

  it('handles a zone with DST on both sides of the change', () => {
    expect(zonedTimeToUtc('2026-07-01', '12:00', 'Europe/Berlin')).toBe('2026-07-01T10:00:00.000Z');
    expect(zonedTimeToUtc('2026-12-01', '12:00', 'Europe/Berlin')).toBe('2026-12-01T11:00:00.000Z');
  });

  it('crosses midnight correctly', () => {
    expect(zonedTimeToUtc('2026-10-28', '01:00', IST)).toBe('2026-10-27T22:00:00.000Z');
    expect(utcToZonedParts('2026-10-27T22:00:00.000Z', IST)).toEqual({
      date: '2026-10-28',
      time: '01:00',
    });
  });

  it('rejects malformed input', () => {
    expect(() => zonedTimeToUtc('2026/10/28', '19:30', IST)).toThrow(RangeError);
  });
});

describe('cost', () => {
  it.each([
    ['', null],
    ['150', 15000],
    ['150,5', 15050],
    ['150,50', 15050],
    ['150.50', 15050],
    ['1.500', 150000],
    ['1.500,00', 150000],
    ['abc', Number.NaN],
    ['-5', Number.NaN],
  ])('parseCostToMinor(%j) → %j', (input, expected) => {
    expect(parseCostToMinor(input)).toBe(expected);
  });
});

describe('validateEventDraft', () => {
  it('accepts a complete, valid draft', () => {
    expect(validateEventDraft(draft(), ctx)).toEqual({});
  });

  it('requires sport, format, district and a real title and place', () => {
    expect(
      validateEventDraft(
        draft({ sportId: null, formatId: null, title: ' a ', districtId: null, placeLabel: 'x' }),
        { ...ctx, format: null },
      ),
    ).toEqual({
      sportId: 'SPORT_REQUIRED',
      formatId: 'FORMAT_REQUIRED',
      title: 'TITLE_TOO_SHORT',
      districtId: 'DISTRICT_REQUIRED',
      placeLabel: 'PLACE_TOO_SHORT',
    });
  });

  it('enforces the length limits', () => {
    const errors = validateEventDraft(
      draft({
        title: 'x'.repeat(81),
        description: 'x'.repeat(2001),
        placeLabel: 'x'.repeat(121),
        addressText: 'x'.repeat(301),
        participantNotes: 'x'.repeat(1001),
        costNote: 'x'.repeat(201),
        equipmentNote: 'x'.repeat(501),
      }),
      ctx,
    );
    expect(errors).toEqual({
      title: 'TITLE_TOO_LONG',
      description: 'DESCRIPTION_TOO_LONG',
      placeLabel: 'PLACE_TOO_LONG',
      addressText: 'ADDRESS_TOO_LONG',
      participantNotes: 'NOTES_TOO_LONG',
      costNote: 'COST_NOTE_TOO_LONG',
      equipmentNote: 'EQUIPMENT_TOO_LONG',
    });
  });

  it('rejects control characters in the title', () => {
    expect(validateEventDraft(draft({ title: 'Maç\u0007 günü' }), ctx).title).toBe(
      'TITLE_TOO_SHORT',
    );
  });

  it('checks the start: invalid, past, too soon to publish, too far', () => {
    expect(validateEventDraft(draft({ date: '2026-02-30' }), ctx).date).toBe('DATE_INVALID');
    expect(validateEventDraft(draft({ time: '25:00' }), ctx).time).toBe('TIME_INVALID');
    expect(validateEventDraft(draft({ date: '2026-10-27', time: '12:00' }), ctx).date).toBe(
      'START_IN_PAST',
    );
    expect(validateEventDraft(draft({ date: '2026-10-27', time: '13:30' }), ctx).date).toBe(
      'START_TOO_SOON',
    );
    expect(
      validateEventDraft(draft({ date: '2026-10-27', time: '13:30' }), {
        ...ctx,
        publishing: false,
      }),
    ).toEqual({});
    expect(
      validateEventDraft(draft({ date: '2026-10-27', time: '13:30' }), {
        ...ctx,
        minLeadMinutes: 15,
      }),
    ).toEqual({});
    expect(validateEventDraft(draft({ date: '2027-12-01' }), ctx).date).toBe('START_TOO_FAR');
  });

  it('bounds duration and capacity (by the chosen format)', () => {
    expect(validateEventDraft(draft({ durationMinutes: 10 }), ctx).durationMinutes).toBe(
      'DURATION_INVALID',
    );
    expect(validateEventDraft(draft({ durationMinutes: 481 }), ctx).durationMinutes).toBe(
      'DURATION_INVALID',
    );
    expect(validateEventDraft(draft({ capacity: 9 }), ctx).capacity).toBe('CAPACITY_OUT_OF_RANGE');
    expect(validateEventDraft(draft({ capacity: 15 }), ctx).capacity).toBe('CAPACITY_OUT_OF_RANGE');
    expect(validateEventDraft(draft({ capacity: 10.5 }), ctx).capacity).toBe(
      'CAPACITY_OUT_OF_RANGE',
    );
  });

  it('checks the skill range and the cost', () => {
    expect(validateEventDraft(draft({ skillMin: 4, skillMax: 2 }), ctx).skillMin).toBe(
      'SKILL_RANGE_INVALID',
    );
    expect(validateEventDraft(draft({ skillMin: 2.25 }), ctx).skillMin).toBe('SKILL_RANGE_INVALID');
    expect(validateEventDraft(draft({ skillMin: 2, skillMax: 3.5 }), ctx)).toEqual({});
    expect(validateEventDraft(draft({ costText: 'çok' }), ctx).costText).toBe('COST_INVALID');
    expect(validateEventDraft(draft({ costText: '200000' }), ctx).costText).toBe('COST_INVALID');
  });
});

describe('toEventInput', () => {
  it('builds the server payload: trimmed text, nulls for empty, UTC start, kuruş', () => {
    expect(toEventInput(draft({ costText: '150,50', addressText: '  Sokak 1 ' }), IST)).toEqual({
      sport_id: '00000000-0000-4000-8000-000000000001',
      sport_format_id: '00000000-0000-4000-8000-000000000002',
      title: 'Akşam halı saha',
      description: null,
      visibility: 'PUBLIC',
      starts_at: '2026-10-28T16:30:00.000Z',
      duration_minutes: 90,
      city_id: '00000000-0000-4000-8000-000000000003',
      district_id: '00000000-0000-4000-8000-000000000004',
      location_visibility: 'PUBLIC',
      location_label: 'ODTÜ Halı Saha 2',
      address_text: 'Sokak 1',
      participant_notes: null,
      capacity: 12,
      waitlist_enabled: true,
      organizer_plays: true,
      skill_min: null,
      skill_max: null,
      booking_status: 'NOT_REQUIRED',
      cost_amount_minor: 15050,
      cost_note: null,
      equipment_note: null,
    });
  });
});

describe('validateCancel', () => {
  it('requires a known reason and bounds the message', () => {
    expect(validateCancel(null, '')).toEqual({ reason: 'CANCEL_REASON_REQUIRED' });
    expect(validateCancel('BECAUSE', '')).toEqual({ reason: 'CANCEL_REASON_REQUIRED' });
    expect(validateCancel('WEATHER', 'x'.repeat(501))).toEqual({
      message: 'CANCEL_MESSAGE_TOO_LONG',
    });
    expect(validateCancel('WEATHER', 'Yağmur')).toEqual({});
  });
});
