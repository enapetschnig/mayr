-- Änderungswünsche aus der App (Knopf „Änderung melden“ in jedem Seitenkopf)
-- und Weiterleitung ans ePower-Cockpit, dort holt sie der Änderungswunsch-Roboter.
--
-- Wie in den übrigen Handwerker-Apps (Anleitung _baukasten/werkzeuge/melde-feature-einbau.md):
--   - Tabelle `aenderungswuensche`: Art, Text, Seite, Bildschirmfoto, Sprachnachricht
--     (Abschrift im Hintergrund per Edge Function `sprache-zu-text`), Status und Antwort.
--   - Ablage `aenderungswuensche` (privat): je Benutzer ein Ordner `<uid>/…`.
--   - `cockpit_verbindung`: Adresse und Geheimnis des Cockpit-Eingangs. Steht nicht im
--     Repo (öffentlich) — die Zeile wird einmal per SQL eingetragen. Leer = Trigger still.
-- Monteur sieht die eigenen Wünsche, der Chef alle. Status und Antwort setzt der Roboter
-- (Dienstrolle) oder der Chef.

create extension if not exists pg_net;

create table public.aenderungswuensche (
  id uuid primary key default gen_random_uuid(),
  erstellt_von uuid default auth.uid() references auth.users(id) on delete set null,
  art text not null default 'wunsch' check (art in ('wunsch', 'fehler', 'frage')),
  status text not null default 'neu' check (status in ('neu', 'gesehen', 'umgesetzt', 'abgelehnt')),
  text text not null default '',
  antwort text,
  seite text,
  app_version text,
  bild_pfad text,
  audio_pfad text,
  anhaenge text[] not null default '{}',
  abschrift text not null default 'fertig' check (abschrift in ('offen', 'laeuft', 'fertig', 'fehler')),
  abschrift_fehler text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index aenderungswuensche_erstellt_von on public.aenderungswuensche (erstellt_von, created_at desc);

create or replace function public.aenderungswunsch_aktualisiert() returns trigger
language plpgsql set search_path = public as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger aenderungswunsch_aktualisiert before update on public.aenderungswuensche
  for each row execute function public.aenderungswunsch_aktualisiert();

alter table public.aenderungswuensche enable row level security;
create policy wuensche_lesen on public.aenderungswuensche for select to authenticated
  using (erstellt_von = auth.uid() or public.ist_chef());
create policy wuensche_melden on public.aenderungswuensche for insert to authenticated
  with check (public.ist_aktiv() and erstellt_von = auth.uid() and status = 'neu' and antwort is null);
create policy wuensche_chef_aendern on public.aenderungswuensche for update to authenticated
  using (public.ist_chef()) with check (public.ist_chef());
create policy wuensche_chef_loeschen on public.aenderungswuensche for delete to authenticated
  using (public.ist_chef());

-- ── Ablage: Bildschirmfoto und Sprachnachricht ─────────────────────────
insert into storage.buckets (id, name, public, file_size_limit)
values ('aenderungswuensche', 'aenderungswuensche', false, 26214400)
on conflict (id) do nothing;

create policy wuensche_dateien_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'aenderungswuensche' and public.ist_aktiv()
    and (storage.foldername(name))[1] = auth.uid()::text);
create policy wuensche_dateien_lesen on storage.objects for select to authenticated
  using (bucket_id = 'aenderungswuensche'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.ist_chef()));
create policy wuensche_dateien_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'aenderungswuensche'
    and ((storage.foldername(name))[1] = auth.uid()::text or public.ist_chef()));

-- ── Weiterleitung ans Cockpit ──────────────────────────────────────────
create table public.cockpit_verbindung (
  einzig boolean primary key default true check (einzig),
  url text not null,
  secret text not null,
  app_key text not null default 'mayr'
);
-- Keine Policies: nur Dienstrolle und der Trigger (security definer) lesen das Geheimnis.
alter table public.cockpit_verbindung enable row level security;
revoke all on public.cockpit_verbindung from anon, authenticated;

create or replace function public.wunsch_ans_cockpit() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v public.cockpit_verbindung%rowtype;
  melder text;
begin
  select * into v from public.cockpit_verbindung limit 1;
  if not found then
    return new;                         -- nicht eingerichtet: still
  end if;
  select nullif(trim(concat(p.vorname, ' ', p.nachname)), '') into melder
    from public.profiles p where p.id = new.erstellt_von;
  perform net.http_post(
    url := v.url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-app-key', v.app_key, 'x-cockpit-secret', v.secret),
    body := jsonb_build_object(
      'id', new.id, 'art', new.art, 'status', new.status, 'text', new.text, 'antwort', new.antwort,
      'seite', new.seite, 'bild_pfad', new.bild_pfad, 'audio_pfad', new.audio_pfad, 'anhaenge', new.anhaenge,
      'melder', coalesce(melder, ''), 'erstellt_am', new.created_at, 'aktualisiert_am', new.updated_at
    )
  );
  return new;
end $$;

-- `text` ändert sich, wenn die Abschrift der Sprachnachricht nachkommt; status/antwort,
-- wenn der Wunsch erledigt wird — beides soll im Cockpit ankommen.
create trigger wunsch_ans_cockpit
  after insert or update of status, antwort, text, bild_pfad, audio_pfad on public.aenderungswuensche
  for each row execute function public.wunsch_ans_cockpit();
