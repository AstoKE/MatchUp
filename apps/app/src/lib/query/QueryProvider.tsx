import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AppError } from '@matchup/domain';
import { useState, type ReactNode } from 'react';

/** Domain rejections (4xx-like) are final: retrying cannot change the answer. Only transport errors retry. */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof AppError && error.code !== 'NETWORK' && error.code !== 'TIMEOUT') {
    return false;
  }
  return failureCount < 2;
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        retry: shouldRetry,
        refetchOnWindowFocus: false,
      },
      // Mutations are never auto-retried: capacity-affecting actions must not replay silently.
      mutations: { retry: false },
    },
  });
}

export function QueryProvider({ children }: { children: ReactNode }) {
  const [client] = useState(createQueryClient);
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
