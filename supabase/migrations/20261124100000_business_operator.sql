-- Phase 10 / M3: the owner of an active business edits it and its venues (ADR-0031, founder 2026-11-12).
--
-- * The business: its name and contact details.
-- * Its venues: name, address and sports. Never the place (location, province, district), the kind or verification:
--   those stay the administrators' statements about the place (ROADMAP P-18).
-- * Only the OWNER of an ACTIVE business, for venues that business runs and that are listed.

-- The owner's view of their business, with contact details and the venues' editable fields.
create function public.get_my_business(p_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  b     public.businesses;
begin
  if v_uid is null then
    raise exception 'NOT_AUTHENTICATED' using errcode = 'P0001';
  end if;
  select * into b from public.businesses x where x.id = p_id;
  if not found or b.status <> 'ACTIVE'
     or not exists (select 1 from public.business_members m where m.business_id = p_id and m.user_id = v_uid and m.role = 'OWNER') then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return pg_catalog.jsonb_build_object(
    'id', b.id, 'name', b.name, 'city_id', b.city_id, 'contact_phone', b.contact_phone, 'contact_email', b.contact_email,
    'venues', coalesce((
      select pg_catalog.jsonb_agg(pg_catalog.jsonb_build_object(
               'id', v.id, 'name', v.name, 'address_text', v.address_text, 'verified', v.verification_status = 'VERIFIED',
               'listed', v.listing_status = 'ACTIVE',
               'sport_ids', coalesce((select pg_catalog.jsonb_agg(s.sport_id order by s.sport_id)
                                        from public.venue_sports s where s.venue_id = v.id), '[]'::jsonb))
             order by v.name, v.id)
        from public.business_venues bv join public.venues v on v.id = bv.venue_id
       where bv.business_id = b.id), '[]'::jsonb));
end;
$$;

-- Locks an active business the caller owns; NOT_FOUND otherwise.
create function private.lock_owned_business(p_id uuid, p_uid uuid)
returns public.businesses
language plpgsql
security definer
set search_path = ''
as $$
declare
  b public.businesses;
begin
  select * into b from public.businesses x where x.id = p_id for update;
  if not found or b.status <> 'ACTIVE'
     or not exists (select 1 from public.business_members m where m.business_id = p_id and m.user_id = p_uid and m.role = 'OWNER') then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  return b;
end;
$$;

create function public.update_my_business(p_id uuid, p_name text, p_contact_phone text, p_contact_email text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid   uuid := private.assert_onboarded_user();
  b       public.businesses := private.lock_owned_business(p_id, v_uid);
  v_name  text := private.clean_business_name(p_name);
  v_phone text := nullif(pg_catalog.regexp_replace(coalesce(p_contact_phone, ''), '[ ()-]', '', 'g'), '');
  v_email text := nullif(pg_catalog.lower(pg_catalog.btrim(coalesce(p_contact_email, ''))), '');
begin
  if (v_phone is null and v_email is null)
     or (v_phone is not null and v_phone !~ '^\+?[0-9]{10,13}$')
     or (v_email is not null and (pg_catalog.char_length(v_email) > 200 or v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$')) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  update public.businesses set name = v_name, contact_phone = v_phone, contact_email = v_email where id = p_id;
end;
$$;

-- A venue's name, address and sports (1-10 active sports); the place, kind and verification stay as they are.
create function public.update_business_venue(p_business uuid, p_venue uuid, p_name text, p_address text, p_sport_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid     uuid := private.assert_onboarded_user();
  b         public.businesses := private.lock_owned_business(p_business, v_uid);
  v_name    text := pg_catalog.btrim(p_name);
  v_address text := nullif(pg_catalog.btrim(p_address), '');
  v_sports  uuid[];
begin
  if not exists (select 1 from public.business_venues bv join public.venues v on v.id = bv.venue_id
                  where bv.business_id = p_business and bv.venue_id = p_venue and v.listing_status = 'ACTIVE') then
    raise exception 'NOT_FOUND' using errcode = 'P0001';
  end if;
  select coalesce(pg_catalog.array_agg(distinct s), '{}') into v_sports from pg_catalog.unnest(p_sport_ids) s where s is not null;
  if v_name is null or pg_catalog.char_length(v_name) not between 3 and 80 or v_name ~ '[[:cntrl:]]'
     or v_name ~* '(https?:|www\.|@|\.(com|net|org|ru|xyz|io|me|info|tr)\M)'
     or pg_catalog.regexp_replace(v_name, '[ ().-]', '', 'g') ~ '[0-9]{7,}'
     or (v_address is not null and (pg_catalog.char_length(v_address) not between 3 and 300
                                    or v_address ~* '(https?:|www\.|@)'))
     or pg_catalog.cardinality(v_sports) not between 1 and 10
     or exists (select 1 from pg_catalog.unnest(v_sports) s
                 where not exists (select 1 from public.sports sp where sp.id = s and sp.is_active)) then
    raise exception 'VALIDATION_FAILED' using errcode = 'P0001';
  end if;
  update public.venues set name = v_name, address_text = v_address where id = p_venue;
  delete from public.venue_sports where venue_id = p_venue and sport_id <> all (v_sports);
  insert into public.venue_sports (venue_id, sport_id) select p_venue, s from pg_catalog.unnest(v_sports) s
  on conflict do nothing;
end;
$$;

revoke all on function public.get_my_business(uuid), public.update_my_business(uuid, text, text, text),
  public.update_business_venue(uuid, uuid, text, text, uuid[]) from public, anon, authenticated;
grant execute on function public.get_my_business(uuid), public.update_my_business(uuid, text, text, text),
  public.update_business_venue(uuid, uuid, text, text, uuid[]) to authenticated;
revoke all on function private.lock_owned_business(uuid, uuid) from public, anon, authenticated;
