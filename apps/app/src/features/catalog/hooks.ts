import { useQuery } from '@tanstack/react-query';
import { loadCatalog } from './load-catalog';

const ONE_HOUR = 60 * 60 * 1000;

/** The reference catalog changes through migrations only: kept in memory for an hour and on the device for a day. */
export function useCatalog() {
  return useQuery({ queryKey: ['catalog'], queryFn: () => loadCatalog(), staleTime: ONE_HOUR });
}
