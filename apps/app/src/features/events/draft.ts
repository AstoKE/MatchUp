import { utcToZonedParts, type EventDraft } from '@matchup/domain';
import type { Catalog } from '@/features/catalog';
import type { EventDetails } from './api/events-api';

/** A new event in the given province (see `startingCityId`), tomorrow 19:00, 90 minutes, nothing chosen yet. */
export function emptyDraft(catalog: Catalog, now: Date, cityId: string | null): EventDraft {
  const city = catalog.cities.find((c) => c.id === cityId);
  const today = utcToZonedParts(now.toISOString(), city?.timeZone ?? 'Europe/Istanbul').date;
  const [y, m, d] = today.split('-').map(Number) as [number, number, number];
  return {
    sportId: null,
    formatId: null,
    title: '',
    description: '',
    date: new Date(Date.UTC(y, m - 1, d + 1)).toISOString().slice(0, 10),
    time: '19:00',
    durationMinutes: 90,
    cityId: city?.id ?? null,
    districtId: null,
    venueId: null,
    locationVisibility: 'PUBLIC',
    placeLabel: '',
    addressText: '',
    participantNotes: '',
    capacity: 10,
    organizerPlays: true,
    waitlistEnabled: true,
    autoApprove: false,
    setting: null,
    visibility: 'PUBLIC',
    skillMin: null,
    skillMax: null,
    bookingStatus: 'NOT_REQUIRED',
    costText: '',
    costNote: '',
    equipmentNote: '',
  };
}

/** An existing event (organizer view, private details included) back into form values. */
export function draftFromEvent(event: EventDetails, timeZone: string): EventDraft {
  const { date, time } = utcToZonedParts(event.startsAt, timeZone);
  return {
    sportId: event.sportId,
    formatId: event.formatId,
    title: event.title,
    description: event.description ?? '',
    date,
    time,
    durationMinutes: event.durationMinutes,
    cityId: event.cityId,
    districtId: event.districtId,
    venueId: event.venue?.id ?? null,
    locationVisibility: event.locationVisibility,
    placeLabel: event.private?.placeLabel ?? event.publicPlaceLabel ?? '',
    addressText: event.private?.addressText ?? '',
    participantNotes: event.private?.participantNotes ?? '',
    capacity: event.capacity,
    organizerPlays: event.organizerPlays,
    waitlistEnabled: event.waitlistEnabled,
    autoApprove: event.autoApprove,
    setting: event.setting,
    visibility: event.visibility,
    skillMin: event.skillMin,
    skillMax: event.skillMax,
    bookingStatus: event.bookingStatus,
    // The form always takes "150" / "150,50" (parseCostToMinor), whatever the app language.
    costText:
      event.costAmountMinor === null
        ? ''
        : (event.costAmountMinor / 100)
            .toFixed(event.costAmountMinor % 100 === 0 ? 0 : 2)
            .replace('.', ','),
    costNote: event.costNote ?? '',
    equipmentNote: event.equipmentNote ?? '',
  };
}

/** Pick the validation errors of the given fields only (per-step validation). */
export function pick<T extends object>(errors: T, keys: readonly PropertyKey[]): Partial<T> {
  return Object.fromEntries(
    Object.entries(errors).filter(([key]) => keys.includes(key)),
  ) as Partial<T>;
}
