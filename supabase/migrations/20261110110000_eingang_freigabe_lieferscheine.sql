-- ============================================================================
--  Eingangsrechnungen: Freigabe → Überweisung, Positionen, Lieferscheinfotos
--
--  Ablauf: erfasst (KI liest Foto/PDF) → geprüft und zur Überweisung
--  freigegeben → überwiesen. Abgelehnt bleibt stehen, wird nicht bezahlt.
--  Wer nach der Freigabe Betrag, Lieferant oder IBAN ändert, muss neu
--  freigeben. Bezahlt werden kann nur, was freigegeben ist.
--
--  Positionen: jede Zeile kann einem eigenen Projekt gehören; die Anteile
--  je Projekt rechnet die App daraus.
--
--  Lieferscheine: Monteur fotografiert am Handy, die KI liest die Zeilen,
--  das Büro gleicht sie mit der Rechnung ab.
-- ============================================================================

alter table public.eingangsrechnungen
  add column freigabe text not null default 'offen' check (freigabe in ('offen', 'freigegeben', 'abgelehnt')),
  add column freigegeben_am timestamptz,
  add column freigegeben_von uuid references public.profiles(id) on delete set null,
  add column abgelehnt_grund text,
  add column iban text,
  add column skonto_prozent numeric(5,2) check (skonto_prozent >= 0 and skonto_prozent < 100),
  add column skonto_bis date,
  -- Lieferscheinnummern laut Rechnung (zum Abgleich)
  add column lieferschein_nummern text[] not null default '{}';

-- Was schon bezahlt war, galt als geprüft
update public.eingangsrechnungen set freigabe = 'freigegeben', freigegeben_am = coalesce(bezahlt_am::timestamptz, created_at)
 where bezahlt_am is not null;

create or replace function public.eingang_freigabe() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.freigabe = 'freigegeben' and new.freigabe = 'freigegeben'
     and old.bezahlt_am is null
     and (new.lieferant, new.netto, new.brutto, new.iban, new.nummer)
         is distinct from (old.lieferant, old.netto, old.brutto, old.iban, old.nummer) then
    -- nach der Freigabe geändert → nochmal ansehen
    new.freigabe := 'offen';
  end if;
  if new.freigabe = 'freigegeben' and (tg_op = 'INSERT' or old.freigabe is distinct from 'freigegeben') then
    new.freigegeben_am := now();
    new.freigegeben_von := auth.uid();
    new.abgelehnt_grund := null;
  elsif new.freigabe <> 'freigegeben' then
    new.freigegeben_am := null;
    new.freigegeben_von := null;
  end if;
  if new.freigabe <> 'abgelehnt' then new.abgelehnt_grund := null; end if;
  if new.bezahlt_am is not null and new.freigabe <> 'freigegeben' then
    raise exception 'Erst prüfen und zur Überweisung freigeben, dann als überwiesen markieren.';
  end if;
  return new;
end $$;
create trigger eingangsrechnungen_freigabe before insert or update on public.eingangsrechnungen
  for each row execute function public.eingang_freigabe();

-- ── Positionen ──────────────────────────────────────────────────────────
create table public.eingang_positionen (
  id uuid primary key default gen_random_uuid(),
  eingangsrechnung_id uuid not null references public.eingangsrechnungen(id) on delete cascade,
  pos int not null default 1,
  artikelnummer text,
  bezeichnung text not null check (btrim(bezeichnung) <> ''),
  menge numeric(12,3),
  einheit text,
  einzelpreis numeric(12,4),
  -- netto, wie auf der Rechnung
  gesamt numeric(12,2) not null default 0,
  lieferschein_nr text,
  projekt_id uuid references public.projekte(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.eingang_positionen (eingangsrechnung_id, pos);
create index on public.eingang_positionen (projekt_id);

alter table public.eingang_positionen enable row level security;
create policy eingang_positionen_chef on public.eingang_positionen for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());

-- ── Lieferscheine ───────────────────────────────────────────────────────
create table public.lieferscheine (
  id uuid primary key default gen_random_uuid(),
  projekt_id uuid references public.projekte(id) on delete set null,
  lieferant text,
  nummer text,
  datum date not null default current_date,
  datei_pfad text not null,
  datei_mime text,
  -- von der KI gelesen: [{artikelnummer, bezeichnung, menge, einheit}]
  positionen jsonb not null default '[]',
  gelesen_am timestamptz,
  eingangsrechnung_id uuid references public.eingangsrechnungen(id) on delete set null,
  notiz text,
  erstellt_von uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.lieferscheine (eingangsrechnung_id);
create index on public.lieferscheine (projekt_id);
create index on public.lieferscheine (datum desc);

alter table public.lieferscheine enable row level security;
-- Monteur: fotografiert und sieht die eigenen; Chef: alles
create policy lieferscheine_lesen on public.lieferscheine for select to authenticated
  using (public.ist_chef() or (public.ist_aktiv() and erstellt_von = auth.uid()));
create policy lieferscheine_anlegen on public.lieferscheine for insert to authenticated
  with check (public.ist_aktiv() and erstellt_von = auth.uid() and eingangsrechnung_id is null);
create policy lieferscheine_aendern on public.lieferscheine for update to authenticated
  using (public.ist_chef() or (public.ist_aktiv() and erstellt_von = auth.uid() and eingangsrechnung_id is null))
  with check (public.ist_chef() or (public.ist_aktiv() and erstellt_von = auth.uid() and eingangsrechnung_id is null));
create policy lieferscheine_loeschen on public.lieferscheine for delete to authenticated
  using (public.ist_chef() or (public.ist_aktiv() and erstellt_von = auth.uid() and eingangsrechnung_id is null));

insert into storage.buckets (id, name, public) values ('lieferscheine', 'lieferscheine', false)
on conflict (id) do nothing;
-- Ablage: <user-id>/<datei>
create policy lieferscheine_datei_lesen on storage.objects for select to authenticated
  using (bucket_id = 'lieferscheine' and (public.ist_chef() or (public.ist_aktiv() and (storage.foldername(name))[1] = auth.uid()::text)));
create policy lieferscheine_datei_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'lieferscheine' and public.ist_aktiv() and (storage.foldername(name))[1] = auth.uid()::text);
create policy lieferscheine_datei_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'lieferscheine' and (public.ist_chef() or (storage.foldername(name))[1] = auth.uid()::text));

notify pgrst, 'reload schema';
