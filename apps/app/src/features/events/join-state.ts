import type { EventDetails } from './api/events-api';
import type { ParticipationStatus } from './api/participation-api';

/** The server's limit of requests per person and event; beyond it the page says so instead of offering the button. */
export const MAX_REQUESTS = 3;

/**
 * Whether to offer the request form at all. Only mirrors the server, which decides again on every request: an unknown
 * refusal is shown as an error, this just avoids offering what cannot work.
 */
export function canRequestToJoin(
  event: EventDetails,
  mine: { status: ParticipationStatus; requestCount: number } | null,
  now: number,
): boolean {
  if (event.isOrganizer || event.status !== 'PUBLISHED' || now >= Date.parse(event.startsAt)) {
    return false;
  }
  if (mine) {
    if (mine.status !== 'CANCELED' || mine.requestCount >= MAX_REQUESTS) return false;
  }
  return event.approvedCount < event.capacity || event.waitlistEnabled;
}
