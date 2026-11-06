-- Phase 4 / M5: the map needs to know where a province and a district are, to open on them and to start the pin picker
-- there. catalog_places gains "center": [lat, lon] (4 decimals, ~10 m) for both; additive, old apps ignore it. Written
-- inline: a helper would be one more function guests can execute (01_security_baseline keeps that list short).
create or replace function public.catalog_places()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', c.id, 'slug', c.slug, 'names', c.names, 'timezone', c.timezone,
           'center', jsonb_build_array(round(extensions.st_y(c.centroid::extensions.geometry)::numeric, 4),
                                       round(extensions.st_x(c.centroid::extensions.geometry)::numeric, 4)),
           'districts', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'id', d.id, 'slug', d.slug, 'names', d.names,
                      'center', jsonb_build_array(round(extensions.st_y(d.centroid::extensions.geometry)::numeric, 4),
                                                  round(extensions.st_x(d.centroid::extensions.geometry)::numeric, 4)))
                    order by d.slug)
               from public.districts d
              where d.city_id = c.id and d.is_active), '[]'::jsonb)
         ) order by c.slug), '[]'::jsonb)
    from public.cities c
   where c.is_active;
$$;
