import { z } from 'zod';
import { supabase } from '@/lib/supabase/client';

const localized = z.object({ tr: z.string(), en: z.string() });
export type LocalizedName = z.infer<typeof localized>;

const sportRow = z.object({
  id: z.uuid(),
  slug: z.string(),
  names: localized,
  is_team_sport: z.boolean(),
  skill_descriptors: z.record(z.string(), localized),
});
const positionRow = z.object({
  id: z.uuid(),
  sport_id: z.uuid(),
  slug: z.string(),
  names: localized,
});
const cityRow = z.object({ id: z.uuid(), slug: z.string(), names: localized });
const districtRow = z.object({
  id: z.uuid(),
  city_id: z.uuid(),
  slug: z.string(),
  names: localized,
});

export interface CatalogPosition {
  id: string;
  slug: string;
  names: LocalizedName;
}
export interface CatalogSport {
  id: string;
  slug: string;
  names: LocalizedName;
  isTeamSport: boolean;
  /** Skill anchors "1".."5" with a plain-language description each. */
  skillDescriptors: Record<string, LocalizedName>;
  positions: CatalogPosition[];
}
export interface CatalogDistrict {
  id: string;
  slug: string;
  names: LocalizedName;
}
export interface CatalogCity {
  id: string;
  slug: string;
  names: LocalizedName;
  districts: CatalogDistrict[];
}
export interface Catalog {
  sports: CatalogSport[];
  cities: CatalogCity[];
}

/** Guest-readable reference data (ADR-0013), fetched in four small queries and joined here. */
export async function fetchCatalog(): Promise<Catalog> {
  const [sports, positions, cities, districts] = await Promise.all([
    supabase
      .from('sports')
      .select('id, slug, names, is_team_sport, skill_descriptors')
      .order('sort_order'),
    supabase.from('sport_positions').select('id, sport_id, slug, names').order('sort_order'),
    supabase.from('cities').select('id, slug, names').order('slug'),
    supabase.from('districts').select('id, city_id, slug, names').order('slug'),
  ]);
  for (const result of [sports, positions, cities, districts]) {
    if (result.error) throw result.error;
  }

  const sportRows = z.array(sportRow).parse(sports.data);
  const positionRows = z.array(positionRow).parse(positions.data);
  const cityRows = z.array(cityRow).parse(cities.data);
  const districtRows = z.array(districtRow).parse(districts.data);

  return {
    sports: sportRows.map((s) => ({
      id: s.id,
      slug: s.slug,
      names: s.names,
      isTeamSport: s.is_team_sport,
      skillDescriptors: s.skill_descriptors,
      positions: positionRows
        .filter((p) => p.sport_id === s.id)
        .map((p) => ({ id: p.id, slug: p.slug, names: p.names })),
    })),
    cities: cityRows.map((c) => ({
      id: c.id,
      slug: c.slug,
      names: c.names,
      districts: districtRows
        .filter((d) => d.city_id === c.id)
        .map((d) => ({ id: d.id, slug: d.slug, names: d.names })),
    })),
  };
}
