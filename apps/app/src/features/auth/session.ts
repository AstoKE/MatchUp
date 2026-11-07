import { createContext, useContext } from 'react';

/**
 * Client-side view of the session. UX only: every protected action is enforced again by the
 * database (RLS + RPC checks). Until a SessionProvider is mounted, nobody is signed in, so the
 * honest default is "guest" (D-09: guests may browse public events).
 */
export type SessionState =
  | { status: 'loading' }
  | { status: 'guest' }
  | {
      status: 'authenticated';
      userId: string;
      email: string | null;
      emailVerified: boolean;
      /** E.164 once a phone is confirmed (Phase 8, ADR-0029); shown masked to its owner only. */
      phone?: string | null;
    };

export const SessionContext = createContext<SessionState>({ status: 'guest' });

export function useSession(): SessionState {
  return useContext(SessionContext);
}
