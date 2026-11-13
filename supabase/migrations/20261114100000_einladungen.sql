-- Einladungen: Der Chef schickt einen persönlichen Link /einladung/<token>.
--
-- Wer über den Link ein Konto anlegt, ist sofort freigeschaltet — mit dem
-- Namen, der Rolle und dem Team aus der Einladung. Ohne Einladung bleibt es
-- wie bisher: registrieren, dann schaltet der Chef frei.
--
-- Eine Einladung kann auch auf einen BESTEHENDEN Zugang zeigen (profil_id):
-- Dann führt der Link nur zur Installation und Anmeldung („dein Zugang“).
--
-- Sicherheit: Der Token (18 Zufallsbytes) steht nur einmal im Klartext beim
-- Erzeugen — gespeichert wird sein SHA-256. Gültig 14 Tage, einmal einlösbar,
-- zurückziehbar. Eingelöst wird im Trigger handle_new_user: Der Browser
-- schickt den Token als Metadatum bei signUp mit, der Trigger prüft ihn und
-- sperrt die Zeile (for update) — zwei gleichzeitige Registrierungen mit
-- demselben Link ergeben höchstens ein freigeschaltetes Konto.

create table public.einladungen (
  id uuid primary key default gen_random_uuid(),
  token_hash text not null unique,
  vorname text not null default '' check (length(vorname) <= 60),
  nachname text not null default '' check (length(nachname) <= 60),
  rolle text not null default 'monteur' check (rolle in ('chef','monteur')),
  team_id uuid references public.teams(id) on delete set null,
  -- gesetzt = Link zu einem bestehenden Zugang (nur installieren + anmelden)
  profil_id uuid references public.profiles(id) on delete cascade,
  gueltig_bis timestamptz not null default now() + interval '14 days',
  eingeloest_am timestamptz,
  eingeloest_von uuid references public.profiles(id) on delete set null,
  zurueckgezogen_am timestamptz,
  erstellt_von uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  check (profil_id is not null or (btrim(vorname) <> '' and btrim(nachname) <> ''))
);
comment on table public.einladungen is 'Persönliche Einladungslinks /einladung/<token>; Token nur als SHA-256';

alter table public.einladungen enable row level security;
-- Nur lesen für den Chef; schreiben ausschließlich über die Funktionen unten
create policy einladungen_chef on public.einladungen for select to authenticated using (public.ist_chef());

create or replace function public.einladung_hash(p_token text) returns text
language sql immutable set search_path = public, extensions as $$
  select encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex')
$$;

-- URL-taugliches Zufallswort: 18 Bytes → 24 Zeichen ohne + / =
create or replace function public.einladung_token() returns text
language sql volatile set search_path = public, extensions as $$
  select translate(encode(extensions.gen_random_bytes(18), 'base64'), '+/', '-_')
$$;

-- Benutzername aus dem Namen wie im Browser (lib/konto.ts benutzername())
create or replace function public.benutzer_aus_name(p_text text) returns text
language sql immutable set search_path = public as $$
  select trim(both '.-' from regexp_replace(
           regexp_replace(
             translate(replace(replace(replace(replace(lower(btrim(coalesce(p_text, ''))), 'ä', 'ae'), 'ö', 'oe'), 'ü', 'ue'), 'ß', 'ss'),
                       'áàâãåéèêëíìîïóòôõúùûçñšžčćđ', 'aaaaaeeeeiiiiooooouuucnszccd'),
             '\s+', '.', 'g'),
           '[^a-z0-9._-]', '', 'g'))
$$;

-- Freier Benutzername: Vorname, sonst vorname.nachname, sonst mit Ziffer
create or replace function public.einladung_benutzervorschlag(p_vorname text, p_nachname text, p_domain text)
returns text language plpgsql stable security definer set search_path = public as $$
declare
  v text := public.benutzer_aus_name(p_vorname);
  v_lang text := public.benutzer_aus_name(p_vorname || ' ' || p_nachname);
  i int := 2;
begin
  if length(v) < 2 then v := v_lang; end if;
  if length(v) < 2 then return null; end if;
  if not exists (select 1 from auth.users where lower(email) = v || '@' || p_domain) then return v; end if;
  if length(v_lang) >= 2 and not exists (select 1 from auth.users where lower(email) = v_lang || '@' || p_domain) then return v_lang; end if;
  while exists (select 1 from auth.users where lower(email) = v_lang || i || '@' || p_domain) loop
    i := i + 1;
  end loop;
  return v_lang || i;
end $$;
revoke execute on function public.einladung_benutzervorschlag(text, text, text) from public, anon, authenticated;

-- ── Chef: erzeugen, neu erzeugen, zurückziehen ─────────────────────────────
create or replace function public.einladung_erstellen(
  p_vorname text, p_nachname text, p_rolle text default 'monteur', p_team uuid default null, p_profil uuid default null
) returns json language plpgsql security definer set search_path = public as $$
declare
  v_token text := public.einladung_token();
  v_id uuid;
begin
  if not public.ist_chef() then raise exception 'Einladen kann nur der Chef.'; end if;
  if p_profil is null and (btrim(coalesce(p_vorname, '')) = '' or btrim(coalesce(p_nachname, '')) = '') then
    raise exception 'Bitte Vor- und Nachnamen eintragen.';
  end if;
  if p_profil is not null then
    -- ein bestehender Zugang hat höchstens einen offenen Link
    update public.einladungen set zurueckgezogen_am = now()
     where profil_id = p_profil and eingeloest_am is null and zurueckgezogen_am is null;
    select vorname, nachname into p_vorname, p_nachname from public.profiles where id = p_profil;
    if not found then raise exception 'Diesen Mitarbeiter gibt es nicht.'; end if;
  end if;
  insert into public.einladungen (token_hash, vorname, nachname, rolle, team_id, profil_id)
  values (public.einladung_hash(v_token), btrim(coalesce(p_vorname, '')), btrim(coalesce(p_nachname, '')),
          coalesce(p_rolle, 'monteur'), p_team, p_profil)
  returning id into v_id;
  return json_build_object('id', v_id, 'token', v_token);
end $$;

-- Neuer Link für dieselbe Einladung (der alte gilt dann nicht mehr), wieder 14 Tage
create or replace function public.einladung_neu(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare v_token text := public.einladung_token();
begin
  if not public.ist_chef() then raise exception 'Einladen kann nur der Chef.'; end if;
  update public.einladungen
     set token_hash = public.einladung_hash(v_token), gueltig_bis = now() + interval '14 days', zurueckgezogen_am = null
   where id = p_id and eingeloest_am is null;
  if not found then raise exception 'Diese Einladung ist schon eingelöst oder gelöscht.'; end if;
  return v_token;
end $$;

create or replace function public.einladung_zurueckziehen(p_id uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ist_chef() then raise exception 'Nur der Chef.'; end if;
  update public.einladungen set zurueckgezogen_am = now() where id = p_id and eingeloest_am is null;
end $$;

-- ── Öffentlich: Was steht hinter dem Link? (ohne Anmeldung) ────────────────
-- Gibt nur preis, was der Eingeladene ohnehin sehen soll.
create or replace function public.einladung_lesen(p_token text) returns json
language plpgsql stable security definer set search_path = public as $$
declare
  e public.einladungen;
  v_domain text := 'elektro.handwerkapp.at';
  v_firma text;
  v_status text;
  v_benutzer text;
begin
  select * into e from public.einladungen where token_hash = public.einladung_hash(p_token);
  if not found then return json_build_object('status', 'unbekannt'); end if;
  select name into v_firma from public.firma where id = 1;
  v_status := case
    when e.zurueckgezogen_am is not null then 'zurueckgezogen'
    when e.eingeloest_am is not null then 'eingeloest'
    when e.gueltig_bis < now() then 'abgelaufen'
    else 'gueltig' end;
  if e.profil_id is not null then
    select replace(lower(email), '@' || v_domain, '') into v_benutzer from public.profiles where id = e.profil_id;
  elsif v_status = 'gueltig' then
    v_benutzer := public.einladung_benutzervorschlag(e.vorname, e.nachname, v_domain);
  end if;
  return json_build_object(
    'status', v_status,
    'art', case when e.profil_id is null then 'neu' else 'zugang' end,
    'vorname', e.vorname,
    'nachname', e.nachname,
    'firma', v_firma,
    'benutzer', v_benutzer
  );
end $$;

revoke execute on function public.einladung_erstellen(text, text, text, uuid, uuid) from public, anon;
revoke execute on function public.einladung_neu(uuid) from public, anon;
revoke execute on function public.einladung_zurueckziehen(uuid) from public, anon;
grant execute on function public.einladung_erstellen(text, text, text, uuid, uuid) to authenticated;
grant execute on function public.einladung_neu(uuid) to authenticated;
grant execute on function public.einladung_zurueckziehen(uuid) to authenticated;
grant execute on function public.einladung_lesen(text) to anon, authenticated;

-- ── Einlösen beim Anlegen des Kontos ──────────────────────────────────────
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_bootstrap boolean := lower(new.email) in ('napetschnig.chris@gmail.com', 'hallo@epowergmbh.at');
  v_token text := new.raw_user_meta_data->>'einladung';
  e public.einladungen;
begin
  if v_token is not null and v_token <> '' then
    select * into e from public.einladungen
     where token_hash = public.einladung_hash(v_token)
       and profil_id is null and eingeloest_am is null and zurueckgezogen_am is null and gueltig_bis >= now()
     for update;
  end if;

  if e.id is not null then
    insert into public.profiles (id, vorname, nachname, email, rolle, aktiv)
    values (new.id, e.vorname, e.nachname, new.email, e.rolle, true)
    on conflict (id) do nothing;
    update public.einladungen set eingeloest_am = now(), eingeloest_von = new.id where id = e.id;
    if e.team_id is not null then
      update public.teams set mitglieder = array_append(mitglieder, new.id)
       where id = e.team_id and not (new.id = any(mitglieder));
    end if;
    return new;
  end if;

  insert into public.profiles (id, vorname, nachname, email, rolle, aktiv)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'vorname', ''),
    coalesce(new.raw_user_meta_data->>'nachname', ''),
    new.email,
    case when v_bootstrap then 'chef' else 'monteur' end,
    v_bootstrap
  )
  on conflict (id) do nothing;
  return new;
end $$;
revoke execute on function public.handle_new_user() from public, anon, authenticated;
