-- =====================================================================
--  GRUNDSCHEMA — drei Elektrofirmen, eine App
-- =====================================================================
--
-- Wer was sieht, ist die eine Frage, an der hier alles hängt:
--
--   * Jeder Benutzer gehört zu genau einer Firma (profiles.firma_id).
--   * Ein Projekt ist entweder "privat" (nur die eigene Firma) oder
--     "gemeinsam" (alle drei Firmen sehen es).
--   * Stunden, Material, Fotos und Termine tragen ihre EIGENE Sichtbarkeit.
--     Auch auf einem gemeinsamen Projekt sieht die andere Firma eine
--     Buchung nur, wenn sie "gemeinsam" markiert ist.
--   * Rechnungen und Angebote sieht nur die ausstellende Firma — und die
--     Kollegenfirma, an die eine fertige Rechnung adressiert ist
--     (Subunternehmer → Generalunternehmer).
--
-- Die Regeln stehen als RLS in der Datenbank, nicht im Frontend: Was die
-- App nicht anzeigt, liefert die Datenbank gar nicht erst aus.

-- ── Firmen ──────────────────────────────────────────────────────────────
create table public.firmen (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  kurzname text not null,
  inhaber text,
  strasse text,
  plz text,
  ort text,
  land text not null default 'Österreich',
  telefon text,
  email text,
  website text,
  uid text,
  firmenbuch text,
  bank_name text,
  kontoinhaber text,
  iban text,
  bic text,
  farbe text not null default '#0E5A44',
  logo_pfad text,
  rechnung_praefix text not null default 'RE',
  angebot_praefix text not null default 'AN',
  stundensatz numeric(10,2) not null default 65,
  material_aufschlag numeric(6,2) not null default 15,
  zahlungsziel_tage int not null default 14,
  kleinunternehmer boolean not null default false,
  fusszeile text,
  ist_demo boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ── Benutzer ────────────────────────────────────────────────────────────
create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  vorname text not null default '',
  nachname text not null default '',
  email text,
  firma_id uuid references public.firmen(id) on delete set null,
  ist_aktiv boolean not null default false,
  ist_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- ── Hilfsfunktionen für RLS ─────────────────────────────────────────────
-- SECURITY DEFINER, damit die Policies nicht rekursiv über profiles laufen.
create or replace function public.meine_firma() returns uuid
language sql stable security definer set search_path = public as $$
  select firma_id from public.profiles where id = auth.uid() and ist_aktiv
$$;

create or replace function public.ist_aktiv() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ist_aktiv from public.profiles where id = auth.uid()), false)
$$;

create or replace function public.ist_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((select ist_admin and ist_aktiv from public.profiles where id = auth.uid()), false)
$$;

-- ── Projekte ────────────────────────────────────────────────────────────
create table public.projekte (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null default public.meine_firma() references public.firmen(id),
  erstellt_von uuid default auth.uid() references auth.users(id) on delete set null,
  name text not null,
  sichtbarkeit text not null default 'privat' check (sichtbarkeit in ('privat','gemeinsam')),
  status text not null default 'aktiv' check (status in ('aktiv','abgeschlossen')),
  kunde_name text,
  kunde_strasse text,
  kunde_plz text,
  kunde_ort text,
  kunde_telefon text,
  kunde_email text,
  kunde_uid text,
  adresse text,
  plz text,
  ort text,
  beschreibung text,
  start_datum date,
  end_datum date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index on public.projekte (firma_id);
create index on public.projekte (sichtbarkeit);

create or replace function public.projekt_sichtbar(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.ist_aktiv() and exists (
    select 1 from public.projekte pr
    where pr.id = p
      and (pr.sichtbarkeit = 'gemeinsam' or pr.firma_id = public.meine_firma())
  )
$$;

-- Wer darf am Projekt etwas eintragen? Die eigene Firma immer, bei einem
-- gemeinsamen Projekt alle.
create or replace function public.projekt_gemeinsam(p uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.projekte where id = p and sichtbarkeit = 'gemeinsam')
$$;

-- ── Rollen am Projekt: Generalunternehmer / Subunternehmer ──────────────
create table public.projekt_rollen (
  projekt_id uuid not null references public.projekte(id) on delete cascade,
  firma_id uuid not null references public.firmen(id) on delete cascade,
  rolle text not null check (rolle in ('GU','SU')),
  primary key (projekt_id, firma_id)
);
-- Höchstens ein Generalunternehmer pro Projekt.
create unique index projekt_rollen_ein_gu on public.projekt_rollen (projekt_id) where rolle = 'GU';

-- ── Rechnungen & Angebote ───────────────────────────────────────────────
-- Vor den Buchungstabellen, weil Stunden und Material darauf zeigen
-- ("schon verrechnet in Rechnung X").
create table public.rechnungen (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null default public.meine_firma() references public.firmen(id),
  erstellt_von uuid default auth.uid() references auth.users(id) on delete set null,
  typ text not null default 'rechnung' check (typ in ('rechnung','angebot')),
  nummer text,
  status text not null default 'entwurf'
    check (status in ('entwurf','offen','bezahlt','storniert','angenommen','abgelehnt')),
  empfaenger_art text not null default 'kunde' check (empfaenger_art in ('kunde','firma')),
  empfaenger_firma_id uuid references public.firmen(id),
  projekt_id uuid references public.projekte(id) on delete set null,
  angebot_id uuid references public.rechnungen(id) on delete set null,
  kunde_name text,
  kunde_zusatz text,
  kunde_strasse text,
  kunde_plz text,
  kunde_ort text,
  kunde_uid text,
  kunde_email text,
  datum date not null default current_date,
  leistung_von date,
  leistung_bis date,
  faellig_am date,
  gueltig_bis date,
  betreff text,
  notizen text,
  ust_satz numeric(5,2) not null default 20,
  reverse_charge boolean not null default false,
  netto numeric(12,2) not null default 0,
  ust numeric(12,2) not null default 0,
  brutto numeric(12,2) not null default 0,
  bezahlt_am date,
  fertig_am timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint empfaenger_firma_passt check (
    (empfaenger_art = 'firma') = (empfaenger_firma_id is not null)
  ),
  constraint nicht_an_sich_selbst check (empfaenger_firma_id is distinct from firma_id)
);
create unique index rechnungen_nummer_eindeutig on public.rechnungen (firma_id, typ, nummer) where nummer is not null;
create index on public.rechnungen (firma_id);
create index on public.rechnungen (empfaenger_firma_id);
create index on public.rechnungen (projekt_id);

create table public.rechnung_positionen (
  id uuid primary key default gen_random_uuid(),
  rechnung_id uuid not null references public.rechnungen(id) on delete cascade,
  pos int not null default 0,
  art text not null default 'leistung'
    check (art in ('leistung','stunden','material','pauschale','fremdleistung','text')),
  bezeichnung text not null default '',
  beschreibung text,
  menge numeric(12,3) not null default 1,
  einheit text not null default 'Stk',
  einzelpreis numeric(12,2) not null default 0,
  gesamt numeric(12,2) generated always as (round(menge * einzelpreis, 2)) stored
);
create index on public.rechnung_positionen (rechnung_id);

-- Fortlaufende Nummern je Firma, Typ und Jahr. Vergeben wird erst beim
-- Fertigstellen — so entstehen durch gelöschte Entwürfe keine Lücken.
create table public.nummernkreise (
  firma_id uuid not null references public.firmen(id) on delete cascade,
  typ text not null,
  jahr int not null,
  letzte int not null default 0,
  primary key (firma_id, typ, jahr)
);

-- ── Stunden ─────────────────────────────────────────────────────────────
create table public.zeiten (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references public.projekte(id) on delete cascade,
  firma_id uuid not null default public.meine_firma() references public.firmen(id),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datum date not null default current_date,
  stunden numeric(5,2) not null check (stunden > 0 and stunden <= 24),
  von time,
  bis time,
  pause_minuten int not null default 0,
  taetigkeit text,
  sichtbarkeit text not null default 'privat' check (sichtbarkeit in ('privat','gemeinsam')),
  rechnung_id uuid references public.rechnungen(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.zeiten (projekt_id);
create index on public.zeiten (firma_id, datum);

-- ── Material ────────────────────────────────────────────────────────────
create table public.material (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references public.projekte(id) on delete cascade,
  firma_id uuid not null default public.meine_firma() references public.firmen(id),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  datum date not null default current_date,
  bezeichnung text not null,
  menge numeric(12,3) not null default 1,
  einheit text not null default 'Stk',
  ek_preis numeric(12,2),
  notiz text,
  sichtbarkeit text not null default 'privat' check (sichtbarkeit in ('privat','gemeinsam')),
  rechnung_id uuid references public.rechnungen(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.material (projekt_id);
create index on public.material (firma_id, datum);

-- ── Fotos & Dokumente ───────────────────────────────────────────────────
create table public.dateien (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references public.projekte(id) on delete cascade,
  firma_id uuid not null default public.meine_firma() references public.firmen(id),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  pfad text not null unique,
  name text not null,
  mime text,
  groesse bigint,
  art text not null default 'foto' check (art in ('foto','dokument')),
  beschreibung text,
  sichtbarkeit text not null default 'gemeinsam' check (sichtbarkeit in ('privat','gemeinsam')),
  created_at timestamptz not null default now()
);
create index on public.dateien (projekt_id);

-- ── Kalender ────────────────────────────────────────────────────────────
create table public.termine (
  id uuid primary key default gen_random_uuid(),
  firma_id uuid not null default public.meine_firma() references public.firmen(id),
  user_id uuid not null default auth.uid() references auth.users(id) on delete cascade,
  projekt_id uuid references public.projekte(id) on delete cascade,
  titel text not null,
  beschreibung text,
  ort text,
  datum date not null,
  bis_datum date,
  von time,
  bis time,
  ganztags boolean not null default false,
  sichtbarkeit text not null default 'privat' check (sichtbarkeit in ('privat','gemeinsam')),
  firmen uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  constraint bis_nach_von check (bis_datum is null or bis_datum >= datum)
);
create index on public.termine (datum);

-- =====================================================================
--  Trigger
-- =====================================================================

create or replace function public.updated_at_setzen() returns trigger
language plpgsql as $$
begin new.updated_at := now(); return new; end $$;

create trigger firmen_updated before update on public.firmen
  for each row execute function public.updated_at_setzen();
create trigger projekte_updated before update on public.projekte
  for each row execute function public.updated_at_setzen();
create trigger rechnungen_updated before update on public.rechnungen
  for each row execute function public.updated_at_setzen();

-- Nur die Eigentümerfirma darf ein Projekt umhängen oder seine
-- Sichtbarkeit ändern. Partner auf gemeinsamen Projekten dürfen
-- Beschreibung, Kunde, Status pflegen — nicht aber das Projekt "stehlen"
-- oder auf privat schalten.
create or replace function public.projekt_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.firma_id is distinct from public.meine_firma() then
    if new.firma_id is distinct from old.firma_id
       or new.sichtbarkeit is distinct from old.sichtbarkeit then
      raise exception 'Nur die Firma, die das Projekt angelegt hat, kann die Freigabe ändern.';
    end if;
  end if;
  return new;
end $$;
create trigger projekte_schutz before update on public.projekte
  for each row execute function public.projekt_schutz();

-- Wird ein Projekt auf "gemeinsam" gestellt, bekommt die Eigentümerfirma
-- automatisch die GU-Rolle, sofern noch niemand GU ist.
create or replace function public.projekt_gu_vorbelegen() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.sichtbarkeit = 'gemeinsam'
     and not exists (select 1 from public.projekt_rollen where projekt_id = new.id and rolle = 'GU') then
    insert into public.projekt_rollen (projekt_id, firma_id, rolle)
    values (new.id, new.firma_id, 'GU')
    on conflict (projekt_id, firma_id) do nothing;
  end if;
  return new;
end $$;
create trigger projekte_gu after insert or update of sichtbarkeit on public.projekte
  for each row execute function public.projekt_gu_vorbelegen();

-- Benutzerfelder, die nur ein Admin ändern darf.
create or replace function public.profil_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if not public.ist_admin() then
    if new.firma_id is distinct from old.firma_id
       or new.ist_aktiv is distinct from old.ist_aktiv
       or new.ist_admin is distinct from old.ist_admin then
      raise exception 'Firma, Freischaltung und Admin-Recht kann nur ein Administrator ändern.';
    end if;
  end if;
  return new;
end $$;
create trigger profiles_schutz before update on public.profiles
  for each row execute function public.profil_schutz();

-- Fertige Rechnungen sind festgeschrieben: Positionen und Beträge ändern
-- sich nicht mehr, nur noch der Zahlungsstatus.
create or replace function public.rechnung_schutz() returns trigger
language plpgsql as $$
begin
  if old.status <> 'entwurf' and old.typ = 'rechnung' then
    if new.netto is distinct from old.netto
       or new.brutto is distinct from old.brutto
       or new.nummer is distinct from old.nummer
       or new.empfaenger_firma_id is distinct from old.empfaenger_firma_id
       or new.kunde_name is distinct from old.kunde_name then
      raise exception 'Eine fertige Rechnung kann nicht mehr geändert werden. Bitte stornieren und neu erstellen.';
    end if;
    if new.status = 'entwurf' then
      raise exception 'Eine fertige Rechnung kann nicht zurück in den Entwurf.';
    end if;
  end if;
  return new;
end $$;
create trigger rechnungen_schutz before update on public.rechnungen
  for each row execute function public.rechnung_schutz();

create or replace function public.positionen_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
declare r_id uuid := coalesce(new.rechnung_id, old.rechnung_id);
begin
  if exists (select 1 from public.rechnungen where id = r_id and typ = 'rechnung' and status <> 'entwurf') then
    raise exception 'Positionen einer fertigen Rechnung sind festgeschrieben.';
  end if;
  return coalesce(new, old);
end $$;
create trigger positionen_schutz before insert or update or delete on public.rechnung_positionen
  for each row execute function public.positionen_schutz();

-- Neuer Benutzer → Profil. Die zwei Bootstrap-Adressen sind sofort aktiv
-- und Administrator, alle anderen warten auf Freischaltung.
create or replace function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  bootstrap boolean := lower(new.email) in ('napetschnig.chris@gmail.com', 'hallo@epowergmbh.at');
  gewuenschte_firma uuid;
begin
  begin
    gewuenschte_firma := nullif(new.raw_user_meta_data->>'firma_id', '')::uuid;
  exception when others then
    gewuenschte_firma := null;
  end;
  if gewuenschte_firma is not null and not exists (select 1 from public.firmen where id = gewuenschte_firma) then
    gewuenschte_firma := null;
  end if;

  insert into public.profiles (id, vorname, nachname, email, firma_id, ist_aktiv, ist_admin)
  values (
    new.id,
    coalesce(new.raw_user_meta_data->>'vorname', ''),
    coalesce(new.raw_user_meta_data->>'nachname', ''),
    new.email,
    gewuenschte_firma,
    bootstrap,
    bootstrap
  )
  on conflict (id) do nothing;
  return new;
end $$;
create trigger on_auth_user_created after insert on auth.users
  for each row execute function public.handle_new_user();

-- =====================================================================
--  Funktionen für die App
-- =====================================================================

-- Fertigstellen: vergibt die nächste Nummer (z. B. RE-2026-007) und
-- schreibt den Beleg fest.
create or replace function public.beleg_fertigstellen(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rechnungen;
  f public.firmen;
  jahr int;
  n int;
  nr text;
begin
  select * into r from public.rechnungen where id = p_id for update;
  if r.id is null or r.firma_id is distinct from public.meine_firma() then
    raise exception 'Beleg nicht gefunden.';
  end if;
  if r.status <> 'entwurf' then
    return r.nummer;
  end if;
  if not exists (select 1 from public.rechnung_positionen where rechnung_id = p_id) then
    raise exception 'Der Beleg hat noch keine Positionen.';
  end if;

  select * into f from public.firmen where id = r.firma_id;
  jahr := extract(year from r.datum)::int;

  insert into public.nummernkreise (firma_id, typ, jahr, letzte)
  values (r.firma_id, r.typ, jahr, 1)
  on conflict (firma_id, typ, jahr) do update set letzte = public.nummernkreise.letzte + 1
  returning letzte into n;

  nr := (case when r.typ = 'angebot' then f.angebot_praefix else f.rechnung_praefix end)
        || '-' || jahr || '-' || lpad(n::text, 3, '0');

  update public.rechnungen
     set nummer = nr, status = 'offen', fertig_am = now()
   where id = p_id;
  return nr;
end $$;

-- =====================================================================
--  Row Level Security
-- =====================================================================

alter table public.firmen enable row level security;
alter table public.profiles enable row level security;
alter table public.projekte enable row level security;
alter table public.projekt_rollen enable row level security;
alter table public.rechnungen enable row level security;
alter table public.rechnung_positionen enable row level security;
alter table public.nummernkreise enable row level security;
alter table public.zeiten enable row level security;
alter table public.material enable row level security;
alter table public.dateien enable row level security;
alter table public.termine enable row level security;

-- Firmen: Stammdaten sehen alle (Name, Farbe, Anschrift für die
-- Kollegenrechnung). Ändern nur die eigene Firma oder ein Admin.
create policy firmen_lesen on public.firmen for select to authenticated
  using (true);

-- Für die Registrierung (noch nicht angemeldet): nur Name, keine Bankdaten.
create or replace function public.firmen_auswahl()
returns table (id uuid, name text)
language sql stable security definer set search_path = public as $$
  select id, name from public.firmen order by ist_demo, name
$$;
grant execute on function public.firmen_auswahl() to anon, authenticated;
create policy firmen_aendern on public.firmen for update to authenticated
  using (id = public.meine_firma() or public.ist_admin())
  with check (id = public.meine_firma() or public.ist_admin());
create policy firmen_anlegen on public.firmen for insert to authenticated
  with check (public.ist_admin());

-- Profile
create policy profile_lesen on public.profiles for select to authenticated
  using (id = auth.uid() or public.ist_aktiv());
create policy profile_aendern on public.profiles for update to authenticated
  using (id = auth.uid() or public.ist_admin())
  with check (id = auth.uid() or public.ist_admin());
create policy profile_loeschen on public.profiles for delete to authenticated
  using (public.ist_admin() and id <> auth.uid());

-- Projekte
create policy projekte_lesen on public.projekte for select to authenticated
  using (public.ist_aktiv() and (sichtbarkeit = 'gemeinsam' or firma_id = public.meine_firma()));
create policy projekte_anlegen on public.projekte for insert to authenticated
  with check (firma_id = public.meine_firma());
create policy projekte_aendern on public.projekte for update to authenticated
  using (public.ist_aktiv() and (sichtbarkeit = 'gemeinsam' or firma_id = public.meine_firma()))
  with check (public.ist_aktiv() and (sichtbarkeit = 'gemeinsam' or firma_id = public.meine_firma()));
create policy projekte_loeschen on public.projekte for delete to authenticated
  using (firma_id = public.meine_firma());

-- Rollen: wer das Projekt sieht, darf die Rollen einteilen.
create policy rollen_lesen on public.projekt_rollen for select to authenticated
  using (public.projekt_sichtbar(projekt_id));
create policy rollen_schreiben on public.projekt_rollen for all to authenticated
  using (public.projekt_sichtbar(projekt_id))
  with check (public.projekt_sichtbar(projekt_id));

-- Buchungen (Stunden, Material, Dateien) — eigene immer, fremde nur wenn
-- "gemeinsam" UND das Projekt sichtbar ist.
create policy zeiten_lesen on public.zeiten for select to authenticated
  using (firma_id = public.meine_firma()
         or (sichtbarkeit = 'gemeinsam' and public.projekt_sichtbar(projekt_id)));
create policy zeiten_anlegen on public.zeiten for insert to authenticated
  with check (firma_id = public.meine_firma() and user_id = auth.uid() and public.projekt_sichtbar(projekt_id));
create policy zeiten_aendern on public.zeiten for update to authenticated
  using (firma_id = public.meine_firma()) with check (firma_id = public.meine_firma());
create policy zeiten_loeschen on public.zeiten for delete to authenticated
  using (firma_id = public.meine_firma());

create policy material_lesen on public.material for select to authenticated
  using (firma_id = public.meine_firma()
         or (sichtbarkeit = 'gemeinsam' and public.projekt_sichtbar(projekt_id)));
create policy material_anlegen on public.material for insert to authenticated
  with check (firma_id = public.meine_firma() and user_id = auth.uid() and public.projekt_sichtbar(projekt_id));
create policy material_aendern on public.material for update to authenticated
  using (firma_id = public.meine_firma()) with check (firma_id = public.meine_firma());
create policy material_loeschen on public.material for delete to authenticated
  using (firma_id = public.meine_firma());

create policy dateien_lesen on public.dateien for select to authenticated
  using (firma_id = public.meine_firma()
         or (sichtbarkeit = 'gemeinsam' and public.projekt_sichtbar(projekt_id)));
create policy dateien_anlegen on public.dateien for insert to authenticated
  with check (firma_id = public.meine_firma() and user_id = auth.uid() and public.projekt_sichtbar(projekt_id));
create policy dateien_aendern on public.dateien for update to authenticated
  using (firma_id = public.meine_firma()) with check (firma_id = public.meine_firma());
create policy dateien_loeschen on public.dateien for delete to authenticated
  using (firma_id = public.meine_firma());

-- Termine
create policy termine_lesen on public.termine for select to authenticated
  using (firma_id = public.meine_firma()
         or (public.ist_aktiv() and sichtbarkeit = 'gemeinsam'
             and (projekt_id is null or public.projekt_sichtbar(projekt_id))));
create policy termine_anlegen on public.termine for insert to authenticated
  with check (firma_id = public.meine_firma() and user_id = auth.uid()
              and (projekt_id is null or public.projekt_sichtbar(projekt_id)));
-- Gemeinsame Termine dürfen alle verschieben — man stimmt sich ja ab.
create policy termine_aendern on public.termine for update to authenticated
  using (firma_id = public.meine_firma() or (public.ist_aktiv() and sichtbarkeit = 'gemeinsam'))
  with check (firma_id = public.meine_firma() or (public.ist_aktiv() and sichtbarkeit = 'gemeinsam'));
create policy termine_loeschen on public.termine for delete to authenticated
  using (firma_id = public.meine_firma());

-- Rechnungen: eigene vollständig; an mich adressierte nur lesen, und nur
-- fertige (keine Entwürfe der Kollegen).
create policy rechnungen_lesen on public.rechnungen for select to authenticated
  using (firma_id = public.meine_firma()
         or (empfaenger_firma_id = public.meine_firma() and status <> 'entwurf'));
create policy rechnungen_anlegen on public.rechnungen for insert to authenticated
  with check (firma_id = public.meine_firma());
create policy rechnungen_aendern on public.rechnungen for update to authenticated
  using (firma_id = public.meine_firma()) with check (firma_id = public.meine_firma());
create policy rechnungen_loeschen on public.rechnungen for delete to authenticated
  using (firma_id = public.meine_firma() and (status = 'entwurf' or typ = 'angebot'));

create policy positionen_lesen on public.rechnung_positionen for select to authenticated
  using (exists (select 1 from public.rechnungen r where r.id = rechnung_id));
create policy positionen_schreiben on public.rechnung_positionen for all to authenticated
  using (exists (select 1 from public.rechnungen r where r.id = rechnung_id and r.firma_id = public.meine_firma()))
  with check (exists (select 1 from public.rechnungen r where r.id = rechnung_id and r.firma_id = public.meine_firma()));

-- nummernkreise: nur über beleg_fertigstellen() (SECURITY DEFINER).

-- =====================================================================
--  Storage
-- =====================================================================

insert into storage.buckets (id, name, public)
values ('projekt-dateien', 'projekt-dateien', false)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('firmen-logos', 'firmen-logos', true)
on conflict (id) do nothing;

create or replace function public.datei_sichtbar(p_pfad text) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.dateien d
    where d.pfad = p_pfad
      and (d.firma_id = public.meine_firma()
           or (d.sichtbarkeit = 'gemeinsam' and public.projekt_sichtbar(d.projekt_id)))
  )
$$;

-- Pfad: <projekt_id>/<zufall>-<dateiname>
create policy projektdateien_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'projekt-dateien'
              and public.projekt_sichtbar(((storage.foldername(name))[1])::uuid));
create policy projektdateien_lesen on storage.objects for select to authenticated
  using (bucket_id = 'projekt-dateien' and (owner = auth.uid() or public.datei_sichtbar(name)));
create policy projektdateien_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'projekt-dateien' and (owner = auth.uid() or exists (
    select 1 from public.dateien d where d.pfad = name and d.firma_id = public.meine_firma())));

-- Logos: Pfad <firma_id>/logo.png — öffentlich lesbar (steht ja auf jeder
-- Rechnung), schreiben nur die eigene Firma.
create policy logos_lesen on storage.objects for select
  using (bucket_id = 'firmen-logos');
create policy logos_schreiben on storage.objects for insert to authenticated
  with check (bucket_id = 'firmen-logos'
              and (((storage.foldername(name))[1])::uuid = public.meine_firma() or public.ist_admin()));
create policy logos_ersetzen on storage.objects for update to authenticated
  using (bucket_id = 'firmen-logos'
         and (((storage.foldername(name))[1])::uuid = public.meine_firma() or public.ist_admin()));
create policy logos_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'firmen-logos'
         and (((storage.foldername(name))[1])::uuid = public.meine_firma() or public.ist_admin()));

-- =====================================================================
--  Die drei Firmen
-- =====================================================================
-- MAM Mechatronik ist die echte Firma. Die beiden anderen sind Demo-Firmen
-- zum Ausprobieren — Name und Daten in der App unter Einstellungen ändern,
-- sobald die echten Partner feststehen.

insert into public.firmen (id, name, kurzname, strasse, plz, ort, farbe, rechnung_praefix, angebot_praefix, ist_demo)
values
  ('11111111-1111-4111-8111-111111111111', 'MAM Mechatronik', 'MAM',
   'Guntendorf 18', '4550', 'Kremsmünster', '#0E5A44', 'MAM', 'MAM-AN', false),
  ('22222222-2222-4222-8222-222222222222', 'Demo Elektro Nord', 'Nord',
   'Musterstraße 1', '4020', 'Linz', '#1D4ED8', 'NORD', 'NORD-AN', true),
  ('33333333-3333-4333-8333-333333333333', 'Demo Elektro Süd', 'Süd',
   'Beispielweg 2', '4600', 'Wels', '#C2410C', 'SUED', 'SUED-AN', true);

-- Realtime für die Live-Aktualisierung von Kalender und Projektfotos
alter publication supabase_realtime add table public.termine, public.dateien;

notify pgrst, 'reload schema';
