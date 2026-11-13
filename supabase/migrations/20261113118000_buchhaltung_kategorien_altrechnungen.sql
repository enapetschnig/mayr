-- =====================================================================
--  Buchhaltung: Kategorien für Ein- und Ausgangsrechnungen, Altrechnungen
-- =====================================================================
--
-- Kategorien (`rechnung_kategorien`) pflegt der Betrieb selbst, getrennt
-- für Eingang (Material PV, Treibstoff, Miete …) und Ausgang (PV-Anlage,
-- Speicher, Störungsdienst …). Eine Eingangs-Kategorie sagt zugleich die
-- Art für die Buchhaltung (Material, Fremdleistung … → Aufwandskonto); ein
-- eigenes Konto je Kategorie ist möglich. Stichworte machen den Vorschlag.
--
-- Altrechnungen (`belege.altbestand`): Rechnungen aus dem bisherigen
-- Programm, damit Offene Posten, Mahnen und Kundenhistorie stimmen. Nummer
-- frei, nicht aus dem Nummernkreis, ohne Positionen; nicht festgeschrieben
-- (Tippfehler lassen sich korrigieren, löschen geht auch) und nie in der
-- Übergabe an die Kanzlei — sie sind im alten Programm schon verbucht.
-- Bezahlt, teilbezahlt oder ausgebucht wird über `zahlungen` wie bei jeder
-- Rechnung.
--
-- Nur der Chef.
-- =====================================================================

create table public.rechnung_kategorien (
  id uuid primary key default gen_random_uuid(),
  richtung text not null check (richtung in ('eingang', 'ausgang')),
  name text not null check (length(btrim(name)) between 1 and 60),
  -- nur Eingang: wohin in der Buchhaltung (wie eingangsrechnungen.kategorie)
  art text check (art in ('material', 'fremdleistung', 'werkzeug', 'fahrzeug', 'buero', 'sonstiges')),
  -- eigenes Erlös-/Aufwandskonto statt des Vorschlags aus den Fibu-Konten
  konto int check (konto between 1 and 999999999),
  -- Wörter für den Vorschlag, mit Komma: „PV, Photovoltaik, Modul“
  stichworte text not null default '',
  sortierung int not null default 0,
  created_at timestamptz not null default now(),
  check ((richtung = 'eingang') = (art is not null))
);
create unique index rechnung_kategorien_name on public.rechnung_kategorien (richtung, lower(btrim(name)));

alter table public.rechnung_kategorien enable row level security;
create policy rechnung_kategorien_chef on public.rechnung_kategorien for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());

alter table public.belege
  add column kategorie_id uuid references public.rechnung_kategorien(id) on delete set null,
  add column altbestand boolean not null default false;
alter table public.eingangsrechnungen
  add column kategorie_id uuid references public.rechnung_kategorien(id) on delete set null;
create index on public.belege (kategorie_id);
create index on public.eingangsrechnungen (kategorie_id);
create index belege_altbestand on public.belege (datum) where altbestand;

-- Eine Ausgangs-Kategorie gehört an eine Rechnung, eine Eingangs-Kategorie an eine Eingangsrechnung
create function public.kategorie_richtung_pruefen() returns trigger
language plpgsql set search_path = public as $$
declare
  v_richtung text;
begin
  if new.kategorie_id is null then
    return new;
  end if;
  select richtung into v_richtung from public.rechnung_kategorien where id = new.kategorie_id;
  if v_richtung is distinct from (case when tg_table_name = 'belege' then 'ausgang' else 'eingang' end) then
    raise exception 'Diese Kategorie gehört zu den %.', case when v_richtung = 'eingang' then 'Eingangsrechnungen' else 'Ausgangsrechnungen' end;
  end if;
  return new;
end $$;
create trigger belege_kategorie before insert or update of kategorie_id on public.belege
  for each row execute function public.kategorie_richtung_pruefen();
create trigger eingang_kategorie before insert or update of kategorie_id on public.eingangsrechnungen
  for each row execute function public.kategorie_richtung_pruefen();

-- Was eine Altrechnung braucht — beim Anlegen und bei jeder Korrektur
create function public.altrechnung_pruefen(b public.belege) returns void
language plpgsql set search_path = public as $$
begin
  if b.typ <> 'rechnung' then
    raise exception 'Altbestand gibt es nur bei Rechnungen.';
  end if;
  if coalesce(btrim(b.nummer), '') = '' then
    raise exception 'Bitte die Rechnungsnummer aus dem alten Programm eintragen.';
  end if;
  if coalesce(btrim(b.empf_name), '') = '' then
    raise exception 'Bitte den Kunden eintragen.';
  end if;
  if b.brutto <= 0 then
    raise exception 'Der Bruttobetrag muss über 0 € liegen.';
  end if;
  if abs(b.netto + b.ust - b.brutto) >= 0.005 then
    raise exception 'Netto und USt ergeben nicht den Bruttobetrag.';
  end if;
  if b.faellig_am is not null and b.faellig_am < b.datum then
    raise exception 'Fällig kann nicht vor dem Rechnungsdatum liegen.';
  end if;
  if b.storno_von is not null or b.korrektur_von is not null or b.teil_nr is not null or b.angebot_id is not null then
    raise exception 'Eine Altrechnung ist eine einfache Rechnung — ohne Storno, Korrektur, Teilrechnung oder Angebot.';
  end if;
end $$;

create function public.altrechnung_anlegen() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.altbestand then
    if new.status <> 'offen' then
      raise exception 'Eine Altrechnung wird offen angelegt — bezahlt wird sie über eine Zahlung.';
    end if;
    perform public.altrechnung_pruefen(new);
    new.fertig_am := coalesce(new.fertig_am, now());
  end if;
  return new;
end $$;
create trigger belege_altbestand before insert on public.belege
  for each row execute function public.altrechnung_anlegen();

-- Festschreiben wie bisher; dazu frei: die Kategorie (steht auf keinem PDF).
-- Altrechnungen: nicht festgeschrieben, aber sie bleiben Altrechnungen, werden
-- nicht storniert, und nach einer Betragskorrektur rechnet der Status neu.
create or replace function public.beleg_schutz() returns trigger
language plpgsql set search_path = public as $$
declare
  v_frei constant text[] := array['status', 'bezahlt_am', 'empf_email', 'projekt_id', 'kunde_id', 'angebot_id', 'abgezogen_in', 'kategorie_id', 'updated_at'];
  v_summe numeric;
  v_letzte date;
begin
  if new.altbestand is distinct from old.altbestand then
    raise exception 'Ob eine Rechnung aus dem alten Programm stammt, lässt sich nachträglich nicht ändern.';
  end if;
  if old.altbestand then
    if new.status not in ('offen', 'bezahlt') then
      raise exception 'Eine Altrechnung wird nicht storniert — ausbuchen oder löschen.';
    end if;
    perform public.altrechnung_pruefen(new);
    if new.brutto is distinct from old.brutto then
      select coalesce(sum(betrag), 0), max(datum) into v_summe, v_letzte from public.zahlungen where beleg_id = new.id;
      if v_summe > new.brutto then
        raise exception 'Darauf ist schon mehr bezahlt (% €). Erst die Zahlung löschen.', v_summe;
      end if;
      if v_summe >= new.brutto then
        new.status := 'bezahlt';
        new.bezahlt_am := v_letzte;
      else
        new.status := 'offen';
        new.bezahlt_am := null;
      end if;
    end if;
    return new;
  end if;
  if old.typ = 'rechnung' and old.status <> 'entwurf' then
    if new.status = 'entwurf' then
      raise exception 'Eine fertige Rechnung kann nicht zurück in den Entwurf.';
    end if;
    if old.status = 'storniert' and new.status <> 'storniert' then
      raise exception 'Eine stornierte Rechnung bleibt storniert. Für die neue Rechnung „Korrektur anlegen“.';
    end if;
    if old.status = 'storno' and new.status <> 'storno' then
      raise exception 'Eine Stornorechnung bleibt, wie sie ist.';
    end if;
    if (to_jsonb(new) - v_frei) is distinct from (to_jsonb(old) - v_frei)
       or (new.projekt_id is distinct from old.projekt_id and new.projekt_id is not null)
       or (new.kunde_id is distinct from old.kunde_id and new.kunde_id is not null)
       or (new.angebot_id is distinct from old.angebot_id and new.angebot_id is not null) then
      raise exception 'Eine fertige Rechnung ist festgeschrieben. Bitte stornieren und neu erstellen.';
    end if;
  end if;
  return new;
end $$;

-- Löschen: Rechnungen nur als Entwurf — Altrechnungen immer (falsch erfasst, doppelt importiert)
drop policy belege_nicht_loeschen on public.belege;
create policy belege_nicht_loeschen on public.belege as restrictive for delete to authenticated
  using (case when typ = 'angebot' then not public.angebot_verrechnet(id)
              when altbestand then true
              else status = 'entwurf' end);

-- Altrechnungen sind im alten Programm schon verbucht — nie ein zweites Mal an die Kanzlei
create or replace function public.fibu_uebergeben(p_von date, p_bis date, p_format text, p_belege uuid[], p_eingaenge uuid[])
returns uuid
language plpgsql set search_path = public as $$
declare
  v_id uuid;
begin
  if not public.ist_chef() then
    raise exception 'Nur der Chef.';
  end if;
  if coalesce(cardinality(p_belege), 0) + coalesce(cardinality(p_eingaenge), 0) = 0 then
    raise exception 'In diesem Zeitraum gibt es nichts zu übergeben.';
  end if;
  if exists (select 1 from public.belege where id = any(coalesce(p_belege, '{}')) and altbestand) then
    raise exception 'Altrechnungen sind im alten Programm schon verbucht und gehen nicht an die Kanzlei.';
  end if;
  insert into public.fibu_uebergaben (von, bis, format) values (p_von, p_bis, p_format) returning id into v_id;
  insert into public.fibu_uebergabe_belege (uebergabe_id, beleg_id) select v_id, unnest(coalesce(p_belege, '{}'));
  insert into public.fibu_uebergabe_belege (uebergabe_id, eingang_id) select v_id, unnest(coalesce(p_eingaenge, '{}'));
  return v_id;
end $$;

notify pgrst, 'reload schema';
