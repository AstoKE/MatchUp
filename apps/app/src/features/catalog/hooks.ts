import { useQuery } from '@tanstack/react-query';
import { fetchCatalog } from './api/catalog-api';

const ONE_HOUR = 60 * 60 * 1000;

/** The reference catalog changes through migrations only, so it is cached for a long time. */
export function useCatalog() {
  return useQuery({ queryKey: ['catalog'], queryFn: fetchCatalog, staleTime: ONE_HOUR });
}
