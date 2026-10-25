-- =====================================================================================
-- Phase 2 / P2-M2: reference catalog — sports, formats, positions, cities, districts.
-- DATABASE.md §3.2–3.3. Guest-readable (ADR-0013); no write path for API roles.
--
-- Reference data is loaded by THIS migration (idempotent upserts keyed by slug) rather than
-- supabase/seed/, because `supabase db push` does not run seed files on hosted projects.
-- Catalog changes ship as new migrations with the same upsert pattern.
-- Geography columns (centroid) are added in Phase 3/4 together with PostGIS.
-- =====================================================================================

create table public.sports (
  id                uuid primary key default gen_random_uuid(),
  slug              text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  names             jsonb not null check (jsonb_typeof(names) = 'object' and names ? 'tr' and names ? 'en'),
  icon_key          text not null check (icon_key ~ '^[a-z0-9-]{2,40}$'),
  is_team_sport     boolean not null,
  is_active         boolean not null default true,
  skill_descriptors jsonb not null check (jsonb_typeof(skill_descriptors) = 'object'),
  settings          jsonb not null default '{}'::jsonb check (jsonb_typeof(settings) = 'object'),
  sort_order        smallint not null default 100,
  created_at        timestamptz not null default pg_catalog.now(),
  updated_at        timestamptz not null default pg_catalog.now()
);
comment on table public.sports is 'Configurable sports catalog. Sport-specific rules live in data (settings jsonb, validated in packages/domain), not in code.';
create trigger sports_set_updated_at before update on public.sports
  for each row execute function private.set_updated_at();

create table public.sport_formats (
  id               uuid primary key default gen_random_uuid(),
  sport_id         uuid not null references public.sports (id) on delete cascade,
  slug             text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  names            jsonb not null check (jsonb_typeof(names) = 'object' and names ? 'tr' and names ? 'en'),
  min_participants smallint not null check (min_participants >= 2),
  default_capacity smallint not null,
  max_participants smallint not null check (max_participants <= 500),
  is_flexible      boolean not null default false,
  is_active        boolean not null default true,
  sort_order       smallint not null default 100,
  unique (sport_id, slug),
  constraint sport_formats_bounds check (min_participants <= default_capacity and default_capacity <= max_participants)
);

create table public.sport_positions (
  id         uuid primary key default gen_random_uuid(),
  sport_id   uuid not null references public.sports (id) on delete cascade,
  slug       text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  names      jsonb not null check (jsonb_typeof(names) = 'object' and names ? 'tr' and names ? 'en'),
  is_active  boolean not null default true,
  sort_order smallint not null default 100,
  unique (sport_id, slug),
  -- lets child tables guarantee "this position belongs to this sport" with a composite FK
  unique (id, sport_id)
);

create table public.cities (
  id           uuid primary key default gen_random_uuid(),
  slug         text not null unique check (slug ~ '^[a-z0-9-]{2,40}$'),
  names        jsonb not null check (jsonb_typeof(names) = 'object' and names ? 'tr' and names ? 'en'),
  timezone     text not null,
  country_code char(2) not null,
  is_active    boolean not null default true
);

create table public.districts (
  id        uuid primary key default gen_random_uuid(),
  city_id   uuid not null references public.cities (id) on delete cascade,
  slug      text not null check (slug ~ '^[a-z0-9-]{2,40}$'),
  names     jsonb not null check (jsonb_typeof(names) = 'object' and names ? 'tr' and names ? 'en'),
  is_active boolean not null default true,
  unique (city_id, slug),
  unique (id, city_id)
);

create index sport_formats_sport_id_idx on public.sport_formats (sport_id);
create index sport_positions_sport_id_idx on public.sport_positions (sport_id);
create index districts_city_id_idx on public.districts (city_id);

-- ---- Row Level Security: read-only reference data for everyone (guests included) ------------------
alter table public.sports          enable row level security;
alter table public.sport_formats   enable row level security;
alter table public.sport_positions enable row level security;
alter table public.cities          enable row level security;
alter table public.districts       enable row level security;

grant select on public.sports, public.sport_formats, public.sport_positions, public.cities, public.districts
  to anon, authenticated;

create policy sports_select_active on public.sports for select to anon, authenticated using (is_active);
create policy sport_formats_select_active on public.sport_formats for select to anon, authenticated using (is_active);
create policy sport_positions_select_active on public.sport_positions for select to anon, authenticated using (is_active);
create policy cities_select_active on public.cities for select to anon, authenticated using (is_active);
create policy districts_select_active on public.districts for select to anon, authenticated using (is_active);

-- =====================================================================================
-- Reference data (idempotent)
-- =====================================================================================
-- Skill anchors (1..5), shared wording for now; specialize per sport via a later migration if needed.
with anchors(v) as (
  select jsonb_build_object(
    '1', jsonb_build_object('tr', 'Yeni başlıyorum', 'en', 'Just starting'),
    '2', jsonb_build_object('tr', 'Eğlence amaçlı oynuyorum; kuralları biliyorum', 'en', 'Recreational; I know the rules'),
    '3', jsonb_build_object('tr', 'Rahat oynuyorum; amatör maçlarda dengeliyim', 'en', 'Comfortable in casual games'),
    '4', jsonb_build_object('tr', 'İleri düzey; düzenli ve rekabetçi oynuyorum', 'en', 'Strong; I play regularly and competitively'),
    '5', jsonb_build_object('tr', 'Çok ileri; lisanslı veya yarı profesyonel', 'en', 'Very advanced; licensed or semi-professional')
  )
),
s(slug, tr, en, icon_key, is_team, sort_order) as (
  values
    ('football',     'Futbol',      'Football',     'football',     true,  10),
    ('futsal',       'Futsal',      'Futsal',       'futsal',       true,  20),
    ('basketball',   'Basketbol',   'Basketball',   'basketball',   true,  30),
    ('volleyball',   'Voleybol',    'Volleyball',   'volleyball',   true,  40),
    ('tennis',       'Tenis',       'Tennis',       'tennis',       false, 50),
    ('padel',        'Padel',       'Padel',        'padel',        false, 60),
    ('badminton',    'Badminton',   'Badminton',    'badminton',    false, 70),
    ('table-tennis', 'Masa tenisi', 'Table tennis', 'table-tennis', false, 80),
    ('running',      'Koşu',        'Running',      'running',      false, 90),
    ('walking',      'Yürüyüş',     'Walking',      'walking',      false, 100)
)
insert into public.sports (slug, names, icon_key, is_team_sport, skill_descriptors, sort_order)
select s.slug, jsonb_build_object('tr', s.tr, 'en', s.en), s.icon_key, s.is_team, anchors.v, s.sort_order
from s cross join anchors
on conflict (slug) do update
  set names = excluded.names, icon_key = excluded.icon_key, is_team_sport = excluded.is_team_sport,
      skill_descriptors = excluded.skill_descriptors, sort_order = excluded.sort_order;

-- Formats: (sport, slug, label, min, default, max, flexible, order)
-- Capacity bounds include substitutes. Flexible formats (running/walking/round-robin) have no teams.
with f(sport, slug, label, min_p, def_p, max_p, flexible, ord) as (
  values
    ('football',     '5v5',         '5v5',            10, 10, 14,  false, 10),
    ('football',     '6v6',         '6v6',            12, 12, 17,  false, 20),
    ('football',     '7v7',         '7v7',            14, 14, 20,  false, 30),
    ('football',     '11v11',       '11v11',          22, 22, 30,  false, 40),
    ('futsal',       '5v5',         '5v5',            10, 10, 14,  false, 10),
    ('basketball',   '3v3',         '3v3',             6,  6, 10,  false, 10),
    ('basketball',   '5v5',         '5v5',            10, 10, 15,  false, 20),
    ('volleyball',   '4v4',         '4v4',             8,  8, 12,  false, 10),
    ('volleyball',   '6v6',         '6v6',            12, 12, 16,  false, 20),
    ('tennis',       'singles',     '1v1',             2,  2,  2,  false, 10),
    ('tennis',       'doubles',     '2v2',             4,  4,  4,  false, 20),
    ('padel',        'doubles',     '2v2',             4,  4,  4,  false, 10),
    ('badminton',    'singles',     '1v1',             2,  2,  2,  false, 10),
    ('badminton',    'doubles',     '2v2',             4,  4,  4,  false, 20),
    ('table-tennis', 'singles',     '1v1',             2,  2,  2,  false, 10),
    ('table-tennis', 'doubles',     '2v2',             4,  4,  4,  false, 20),
    ('table-tennis', 'round-robin', 'Turnuva',         3,  6, 12,  true,  30),
    ('running',      'group-run',   'Grup koşusu',     2,  8, 100, true,  10),
    ('walking',      'group-walk',  'Grup yürüyüşü',   2,  8, 100, true,  10)
)
insert into public.sport_formats (sport_id, slug, names, min_participants, default_capacity, max_participants, is_flexible, sort_order)
select sp.id, f.slug,
       jsonb_build_object('tr', f.label,
         'en', case f.slug when 'round-robin' then 'Round robin' when 'group-run' then 'Group run' when 'group-walk' then 'Group walk' else f.label end),
       f.min_p, f.def_p, f.max_p, f.flexible, f.ord
from f join public.sports sp on sp.slug = f.sport
on conflict (sport_id, slug) do update
  set names = excluded.names, min_participants = excluded.min_participants,
      default_capacity = excluded.default_capacity, max_participants = excluded.max_participants,
      is_flexible = excluded.is_flexible, sort_order = excluded.sort_order;

-- Positions (informational in the MVP; not enforced as sub-capacity — PRD §4.3)
with p(sport, slug, tr, en, ord) as (
  values
    ('football',   'goalkeeper',        'Kaleci',          'Goalkeeper',        10),
    ('football',   'defender',          'Defans',          'Defender',          20),
    ('football',   'midfielder',        'Orta saha',       'Midfielder',        30),
    ('football',   'forward',           'Forvet',          'Forward',           40),
    ('futsal',     'goalkeeper',        'Kaleci',          'Goalkeeper',        10),
    ('futsal',     'defender',          'Defans',          'Defender',          20),
    ('futsal',     'winger',            'Kanat',           'Winger',            30),
    ('futsal',     'pivot',             'Pivot',           'Pivot',             40),
    ('basketball', 'point-guard',       'Oyun kurucu',     'Point guard',       10),
    ('basketball', 'shooting-guard',    'Şutör guard',     'Shooting guard',    20),
    ('basketball', 'small-forward',     'Küçük forvet',    'Small forward',     30),
    ('basketball', 'power-forward',     'Uzun forvet',     'Power forward',     40),
    ('basketball', 'center',            'Pivot',           'Center',            50),
    ('volleyball', 'setter',            'Pasör',           'Setter',            10),
    ('volleyball', 'outside-hitter',    'Smaçör',          'Outside hitter',    20),
    ('volleyball', 'opposite',          'Çapraz',          'Opposite',          30),
    ('volleyball', 'middle-blocker',    'Orta oyuncu',     'Middle blocker',    40),
    ('volleyball', 'libero',            'Libero',          'Libero',            50),
    ('padel',      'left-side',         'Sol taraf',       'Left side',         10),
    ('padel',      'right-side',        'Sağ taraf',       'Right side',        20)
)
insert into public.sport_positions (sport_id, slug, names, sort_order)
select sp.id, p.slug, jsonb_build_object('tr', p.tr, 'en', p.en), p.ord
from p join public.sports sp on sp.slug = p.sport
on conflict (sport_id, slug) do update set names = excluded.names, sort_order = excluded.sort_order;

insert into public.cities (slug, names, timezone, country_code)
values ('ankara', jsonb_build_object('tr', 'Ankara', 'en', 'Ankara'), 'Europe/Istanbul', 'TR')
on conflict (slug) do update set names = excluded.names, timezone = excluded.timezone;

-- Ankara's 25 districts
with d(slug, name) as (
  values
    ('akyurt', 'Akyurt'), ('altindag', 'Altındağ'), ('ayas', 'Ayaş'), ('bala', 'Bala'),
    ('beypazari', 'Beypazarı'), ('camlidere', 'Çamlıdere'), ('cankaya', 'Çankaya'), ('cubuk', 'Çubuk'),
    ('elmadag', 'Elmadağ'), ('etimesgut', 'Etimesgut'), ('evren', 'Evren'), ('golbasi', 'Gölbaşı'),
    ('gudul', 'Güdül'), ('haymana', 'Haymana'), ('kahramankazan', 'Kahramankazan'), ('kalecik', 'Kalecik'),
    ('kecioren', 'Keçiören'), ('kizilcahamam', 'Kızılcahamam'), ('mamak', 'Mamak'), ('nallihan', 'Nallıhan'),
    ('polatli', 'Polatlı'), ('pursaklar', 'Pursaklar'), ('sincan', 'Sincan'),
    ('sereflikochisar', 'Şereflikoçhisar'), ('yenimahalle', 'Yenimahalle')
)
insert into public.districts (city_id, slug, names)
select c.id, d.slug, jsonb_build_object('tr', d.name, 'en', d.name)
from d cross join public.cities c where c.slug = 'ankara'
on conflict (city_id, slug) do update set names = excluded.names;
