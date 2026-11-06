-- Phase 4 / M1: the catalog of Turkey and its single read.
begin;
select plan(21);

create function pg_temp.act_as(p_role text) returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    json_build_object('sub', '00000000-0000-4000-8000-000000002501', 'role', p_role, 'aal', 'aal1')::text, true);
  execute format('set local role %I', p_role);
end;
$$;

-- ---- what was loaded ----------------------------------------------------------------------------------------------------
select is((select count(*)::int from public.cities where country_code = 'TR'), 81, '81 provinces');
select is((select count(*)::int from public.districts), 973, '973 districts, the official count');
select is((select count(*)::int from public.cities c where not exists (
  select 1 from public.districts d where d.city_id = c.id)), 0, 'every province has districts');
select is((select count(*)::int from public.districts d join public.cities c on c.id = d.city_id where c.slug = 'istanbul'),
  39, 'İstanbul has 39');
select is((select count(*)::int from public.districts d join public.cities c on c.id = d.city_id where c.slug = 'bayburt'),
  3, 'Bayburt has 3');
select is((select count(*)::int from public.districts d join public.cities c on c.id = d.city_id where c.slug = 'ankara'),
  25, 'Ankara still has its 25');
select ok((select names = '{"tr": "Şereflikoçhisar", "en": "Şereflikoçhisar"}'::jsonb from public.districts
  where slug = 'sereflikochisar'), 'an existing Ankara district keeps its name');
select ok((select bool_and(timezone = 'Europe/Istanbul' and is_active) from public.cities), 'one zone, all active');
select ok((select names ->> 'tr' = 'Iğdır' from public.cities where slug = 'igdir'), 'dotless capitals survive');
select is((select count(*)::int from public.cities where centroid is null), 0, 'every province has a center');
select is((select count(*)::int from public.districts where centroid is null), 0, 'every district has a center');
-- Turkey lies between about 35.8–42.2 N and 25.6–44.9 E.
select is((select count(*)::int from public.districts
  where extensions.st_y(centroid::extensions.geometry) not between 35.7 and 42.3
     or extensions.st_x(centroid::extensions.geometry) not between 25.5 and 45.0), 0, 'every center is inside Turkey');
select is((select count(*)::int from public.districts d join public.cities c on c.id = d.city_id
  where extensions.st_distance(d.centroid, c.centroid) > 250000), 0, 'and within 250 km of its province center');

-- ---- the read ---------------------------------------------------------------------------------------------------------------
select function_privs_are('public', 'catalog_places', array[]::text[], 'anon', array['EXECUTE'], 'guests may read it');
select function_privs_are('public', 'catalog_places', array[]::text[], 'authenticated', array['EXECUTE'], 'and members');
select pg_temp.act_as('anon');
select is(jsonb_array_length(public.catalog_places()), 81, 'a guest gets 81 provinces');
select is((select sum(jsonb_array_length(c -> 'districts'))::int from jsonb_array_elements(public.catalog_places()) c),
  973, 'with all their districts');
select ok((select bool_and(c ?& array['id', 'slug', 'names', 'timezone', 'center', 'districts'] and not c ? 'centroid'
  and not c ? 'wikidata_id') from jsonb_array_elements(public.catalog_places()) c), 'only the fields the app reads');
select is((select d -> 'center' from jsonb_array_elements(public.catalog_places()) c, jsonb_array_elements(c -> 'districts') d
            where d ->> 'slug' = 'cankaya'), '[39.9083, 32.8461]'::jsonb, 'a district''s centre, for the map (Phase 4 M5)');
reset role;
-- RLS still decides: a deactivated district is gone from the read.
update public.districts set is_active = false where slug = 'evren';
select pg_temp.act_as('anon');
select is((select jsonb_array_length(c -> 'districts') from jsonb_array_elements(public.catalog_places()) c
  where c ->> 'slug' = 'ankara'), 24, 'an inactive district is left out');
select throws_ok($$insert into public.cities (slug, names, timezone, country_code)
  values ('x', '{"tr":"x","en":"x"}', 'Europe/Istanbul', 'TR')$$, '42501', null, 'guests still cannot add provinces');
reset role;

select * from finish();
rollback;
