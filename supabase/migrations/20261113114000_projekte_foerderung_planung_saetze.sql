-- Paket D (SETEC): Planung im Projekt, Förderstatus, Projekt-Verlauf
-- (WhatsApp an den Kunden), Lohnkosten und Verrechnungssätze je Mitarbeiter.

-- ── Planung: Dokumente, die als PV-Plan, Stringplan, Dachbelegung oben im
-- Projekt stehen. Nur ein Merker — Speicher und Rechte wie jedes Dokument.
alter table public.dateien add column planung boolean not null default false;

-- ── Förderung (PV in Österreich: OeMAG, Klimafonds, Land, Gemeinde) ──────
-- leer = nicht erfasst; „keine“ = ausdrücklich ohne Förderung.
-- `foerder_datum` = Datum des aktuellen Schritts, `foerder_frist` = bis wann
-- der nächste Schritt fällig ist (z. B. Fertigstellungsmeldung).
alter table public.projekte
  add column foerder_status text check (foerder_status in
    ('keine','vorbereitet','eingereicht','zugesagt','fertig_gemeldet','ausbezahlt','abgelehnt')),
  add column foerder_stelle text,
  add column foerder_betrag numeric(12,2) check (foerder_betrag is null or foerder_betrag >= 0),
  add column foerder_datum date,
  add column foerder_frist date,
  add column foerder_notiz text;
create index on public.projekte (foerder_status) where foerder_status is not null;

-- ── Verlauf je Projekt: was wann an den Kunden ging, Förderschritte ──────
-- WhatsApp schickt die App nicht selbst (wa.me öffnet WhatsApp mit dem Text) —
-- vermerkt wird die Absicht samt Text.
create table public.projekt_verlauf (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid not null references public.projekte(id) on delete cascade,
  art text not null check (art in ('whatsapp','foerderung','notiz')),
  text text not null check (length(text) between 1 and 4000),
  -- an wen (Telefonnummer bei WhatsApp)
  an text,
  user_id uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.projekt_verlauf (projekt_id, created_at desc);
alter table public.projekt_verlauf enable row level security;
create policy verlauf_lesen on public.projekt_verlauf for select to authenticated using (public.ist_aktiv());
-- eintragen nur als man selbst; Förderschritte schreibt der Trigger
create policy verlauf_anlegen on public.projekt_verlauf for insert to authenticated
  with check (public.ist_aktiv() and user_id = auth.uid() and art <> 'foerderung');
create policy verlauf_loeschen on public.projekt_verlauf for delete to authenticated using (public.ist_chef());

create or replace function public.foerderung_verlauf() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  t text;
begin
  if new.foerder_status is distinct from old.foerder_status
     or new.foerder_stelle is distinct from old.foerder_stelle
     or new.foerder_betrag is distinct from old.foerder_betrag
     or new.foerder_frist is distinct from old.foerder_frist then
    t := 'Förderung: ' || coalesce(case new.foerder_status
           when 'keine' then 'keine Förderung' when 'vorbereitet' then 'Antrag vorbereitet'
           when 'eingereicht' then 'eingereicht' when 'zugesagt' then 'zugesagt'
           when 'fertig_gemeldet' then 'Fertigstellung gemeldet' when 'ausbezahlt' then 'ausbezahlt'
           when 'abgelehnt' then 'abgelehnt' end, 'nicht erfasst')
      || coalesce(' · ' || nullif(trim(new.foerder_stelle), ''), '')
      || coalesce(' · ' || replace(to_char(new.foerder_betrag, 'FM999999990.00'), '.', ',') || ' €', '')
      || coalesce(' · Frist ' || to_char(new.foerder_frist, 'DD.MM.YYYY'), '');
    insert into public.projekt_verlauf (projekt_id, art, text, user_id)
    values (new.id, 'foerderung', t, auth.uid());
  end if;
  return new;
end $$;
create trigger projekte_foerderung_verlauf after update on public.projekte
  for each row execute function public.foerderung_verlauf();

-- ── WhatsApp-Vorlagen des Betriebs: [{name, text}], leer = Vorgaben der App
alter table public.firma add column whatsapp_vorlagen jsonb;

-- ── Lohnkosten und Verrechnungssatz je Mitarbeiter ───────────────────────
-- Eigene Tabelle statt Spalten an `profiles`: Profile liest jeder, die
-- Lohnkosten nur der Chef. Je Person mehrere Zeilen mit „gültig ab“ — die
-- Nachkalkulation nimmt für jede Stunde den Satz, der an ihrem Tag galt.
create table public.mitarbeiter_saetze (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  gueltig_ab date not null default current_date,
  -- was eine Stunde den Betrieb kostet (Lohn + Nebenkosten)
  lohnkosten numeric(10,2) check (lohnkosten is null or lohnkosten >= 0),
  -- was der Kunde je Stunde zahlt; leer = Lohnart bzw. Projekt-/Betriebssatz
  verrechnungssatz numeric(10,2) check (verrechnungssatz is null or verrechnungssatz > 0),
  created_at timestamptz not null default now(),
  unique (user_id, gueltig_ab)
);
alter table public.mitarbeiter_saetze enable row level security;
create policy saetze_chef on public.mitarbeiter_saetze for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());
