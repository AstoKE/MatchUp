import { useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useEffect, useState, type ReactNode } from 'react';
import { getInitialSession, subscribeToSession, type AuthSession } from './api/auth-api';
import { SessionContext, type SessionState } from './session';

function toState(session: AuthSession | null): SessionState {
  if (!session) return { status: 'guest' };
  return {
    status: 'authenticated',
    userId: session.user.id,
    email: session.user.email ?? null,
    emailVerified: Boolean(session.user.email_confirmed_at),
    phone: session.user.phone_confirmed_at && session.user.phone ? `+${session.user.phone}` : null,
  };
}

/**
 * Mirrors the Supabase session into React state. Mount once, above the router's screens.
 * Signing out clears every cached query so no private data outlives the session.
 */
export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: 'loading' });
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    let active = true;
    void getInitialSession().then((session) => {
      if (active)
        setState((current) => (current.status === 'loading' ? toState(session) : current));
    });
    const unsubscribe = subscribeToSession((event, session) => {
      if (!active) return;
      setState(toState(session));
      if (event === 'SIGNED_OUT') queryClient.clear();
      if (event === 'PASSWORD_RECOVERY') {
        router.replace('/reset-password');
      }
    });
    return () => {
      active = false;
      unsubscribe();
    };
  }, [queryClient, router]);

  return <SessionContext.Provider value={state}>{children}</SessionContext.Provider>;
}
