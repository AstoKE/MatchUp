import { describe, expect, it } from 'vitest';
import {
  activeFilterCount,
  groupByLocalDay,
  relativeDay,
  buildSearchPayload,
  EMPTY_DISCOVER_FILTERS,
  SEARCH_PAGE_SIZE,
  type DiscoverFilters,
} from './search';

const IST = 'Europe/Istanbul';
const NOW = new Date('2026-10-27T10:00:00.000Z'); // Tuesday 13:00 in Istanbul (UTC+3)
const CITY = '00000000-0000-4000-8000-0000000000c1';
const SPORT = '00000000-0000-4000-8000-0000000000f1';
const DISTRICT = '00000000-0000-4000-8000-0000000000d1';

const filters = (over: Partial<DiscoverFilters> = {}): DiscoverFilters => ({
  ...EMPTY_DISCOVER_FILTERS,
  ...over,
});
const payload = (over: Partial<DiscoverFilters> = {}, now = NOW) =>
  buildSearchPayload(filters(over), { now, timeZone: IST, cityId: CITY });

describe('buildSearchPayload', () => {
  it('sends only the page size and the city when no filter is on', () => {
    expect(payload()).toEqual({ limit: SEARCH_PAGE_SIZE, city_id: CITY });
  });

  it('a point from the device sorts by distance, sent to about a metre', () => {
    expect(
      buildSearchPayload(filters(), {
        now: NOW,
        timeZone: IST,
        cityId: CITY,
        near: { lat: 39.895012345, lon: 32.779498765 },
      }),
    ).toEqual({
      limit: SEARCH_PAGE_SIZE,
      city_id: CITY,
      near: { lat: 39.89501, lon: 32.7795 },
      sort: 'NEAREST',
    });
  });

  it('omits the city for guests who have not chosen one', () => {
    expect(buildSearchPayload(filters(), { now: NOW, timeZone: IST })).toEqual({
      limit: SEARCH_PAGE_SIZE,
    });
  });

  it('maps sports, district, parts of the day and open slots', () => {
    expect(
      payload({
        sportIds: [SPORT],
        districtId: DISTRICT,
        timeOfDay: ['EVENING', 'MORNING'],
        onlyOpen: true,
      }),
    ).toMatchObject({
      sport_ids: [SPORT],
      district_ids: [DISTRICT],
      time_of_day: ['EVENING', 'MORNING'],
      only_open: true,
    });
  });

  it('"today" runs until the next local midnight, not the device or UTC one', () => {
    // 2026-10-28 00:00 in Istanbul is 2026-10-27T21:00Z.
    expect(payload({ datePreset: 'TODAY' })).toMatchObject({ to: '2026-10-27T21:00:00.000Z' });
    expect(payload({ datePreset: 'TODAY' }).from).toBeUndefined();
  });

  it('"today" late in the evening UTC is already tomorrow in Istanbul', () => {
    const lateUtc = new Date('2026-10-27T22:30:00.000Z'); // 01:30 on the 28th in Istanbul
    expect(payload({ datePreset: 'TODAY' }, lateUtc)).toMatchObject({
      to: '2026-10-28T21:00:00.000Z',
    });
  });

  it('"tomorrow" is exactly the next local day', () => {
    expect(payload({ datePreset: 'TOMORROW' })).toMatchObject({
      from: '2026-10-27T21:00:00.000Z',
      to: '2026-10-28T21:00:00.000Z',
    });
  });

  it('"this week" covers seven local days from today', () => {
    expect(payload({ datePreset: 'WEEK' })).toMatchObject({ to: '2026-11-02T21:00:00.000Z' });
  });

  it('keeps day boundaries correct across a month end', () => {
    const now = new Date('2026-10-31T10:00:00.000Z');
    expect(payload({ datePreset: 'TOMORROW' }, now)).toMatchObject({
      from: '2026-10-31T21:00:00.000Z',
      to: '2026-11-01T21:00:00.000Z',
    });
  });

  it('a picked day is exactly that local day, and outranks a preset', () => {
    expect(payload({ day: '2026-12-31' })).toMatchObject({
      from: '2026-12-30T21:00:00.000Z',
      to: '2026-12-31T21:00:00.000Z',
    });
    expect(payload({ day: '2026-11-05', datePreset: 'TODAY' })).toMatchObject({
      from: '2026-11-04T21:00:00.000Z',
      to: '2026-11-05T21:00:00.000Z',
    });
  });

  it('a picked day counts as one date filter', () => {
    expect(activeFilterCount(filters({ day: '2026-11-05' }))).toBe(1);
  });

  it('sends the indoor / outdoor choice only when it is made', () => {
    expect(payload().setting).toBeUndefined();
    expect(payload({ setting: 'OUTDOOR' })).toMatchObject({ setting: 'OUTDOOR' });
  });

  it('does not share arrays with the filter state', () => {
    const state = filters({ sportIds: [SPORT], timeOfDay: ['MORNING'] });
    const result = buildSearchPayload(state, { now: NOW, timeZone: IST });
    result.sport_ids?.push('x');
    expect(state.sportIds).toEqual([SPORT]);
  });
});

describe('activeFilterCount', () => {
  it('counts each switched-on filter once', () => {
    expect(activeFilterCount(EMPTY_DISCOVER_FILTERS)).toBe(0);
    expect(
      activeFilterCount(
        filters({
          datePreset: 'WEEK',
          timeOfDay: ['MORNING', 'EVENING'],
          sportIds: [SPORT, SPORT],
          districtId: DISTRICT,
          setting: 'INDOOR',
          onlyOpen: true,
        }),
      ),
    ).toBe(6);
  });
});

describe('groupByLocalDay', () => {
  const at = (iso: string) => ({ startsAt: iso });

  it('keeps the order and starts a new group per local day', () => {
    const groups = groupByLocalDay(
      [
        at('2026-10-27T15:00:00.000Z'),
        at('2026-10-27T17:30:00.000Z'),
        at('2026-10-28T06:00:00.000Z'),
        at('2026-10-30T16:00:00.000Z'),
      ],
      IST,
    );
    expect(groups.map((g) => [g.date, g.items.length])).toEqual([
      ['2026-10-27', 2],
      ['2026-10-28', 1],
      ['2026-10-30', 1],
    ]);
  });

  it('uses the city day, not the UTC day: 22:30Z is already tomorrow in Istanbul', () => {
    const groups = groupByLocalDay(
      [at('2026-10-27T20:59:00.000Z'), at('2026-10-27T21:00:00.000Z')],
      IST,
    );
    expect(groups.map((g) => g.date)).toEqual(['2026-10-27', '2026-10-28']);
  });

  it('returns nothing for nothing', () => {
    expect(groupByLocalDay([], IST)).toEqual([]);
  });
});

describe('relativeDay', () => {
  it('names today and tomorrow in the city time zone only', () => {
    expect(relativeDay('2026-10-27', NOW, IST)).toBe('TODAY');
    expect(relativeDay('2026-10-28', NOW, IST)).toBe('TOMORROW');
    expect(relativeDay('2026-10-29', NOW, IST)).toBeNull();
    expect(relativeDay('2026-10-26', NOW, IST)).toBeNull();
  });

  it('follows the city day when UTC is still the previous one', () => {
    const late = new Date('2026-10-27T22:30:00.000Z'); // 01:30 on the 28th in Istanbul
    expect(relativeDay('2026-10-28', late, IST)).toBe('TODAY');
    expect(relativeDay('2026-10-29', late, IST)).toBe('TOMORROW');
  });

  it('crosses a month end', () => {
    const now = new Date('2026-10-31T10:00:00.000Z');
    expect(relativeDay('2026-11-01', now, IST)).toBe('TOMORROW');
  });
});
