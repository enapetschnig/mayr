-- =====================================================================
--  Anzahlung, Teil- und Schlussrechnung
-- =====================================================================
--
-- Teilrechnung = Rechnung mit `teil_nr` (1., 2. … Teilrechnung zu einem
-- Angebot), meist eine Pauschale „30 % laut Angebot“.
--
-- Schlussrechnung = Rechnung über die ganze Leistung, die die bereits
-- gestellten Teilrechnungen abzieht: je Teilrechnung eine Position der Art
-- „abzug“ (negativer Betrag, quelle = {"teil": [id]}). Wie bei Stunden und
-- Material wird an der Quelle vermerkt, wo abgezogen ist (`abgezogen_in`),
-- damit keine Teilrechnung zweimal abgezogen wird. Position gelöscht,
-- Entwurf gelöscht oder Schlussrechnung storniert → wieder frei.
-- =====================================================================

alter table public.belege
  add column teil_nr int check (teil_nr between 1 and 99),
  add column abgezogen_in uuid references public.belege(id) on delete set null;
create index on public.belege (abgezogen_in);

alter table public.beleg_positionen drop constraint beleg_positionen_art_check;
alter table public.beleg_positionen add constraint beleg_positionen_art_check
  check (art in ('titel','leistung','artikel','arbeit','material','pauschale','text','abzug'));

-- Fertige Rechnung: auch `abgezogen_in` darf sich noch ändern (Verrechnung an der Quelle)
create or replace function public.beleg_schutz() returns trigger
language plpgsql set search_path = public as $$
declare
  v_frei constant text[] := array['status', 'bezahlt_am', 'empf_email', 'projekt_id', 'kunde_id', 'angebot_id', 'abgezogen_in', 'updated_at'];
begin
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

-- Abziehen nur fertige, nicht stornierte Teilrechnungen — und nur einmal
create function public.teil_abzug_pruefen() returns trigger
language plpgsql set search_path = public as $$
begin
  if new.abgezogen_in is null or new.abgezogen_in is not distinct from old.abgezogen_in then
    return new;
  end if;
  if old.abgezogen_in is not null then
    raise exception 'Diese Teilrechnung ist schon in einer anderen Schlussrechnung abgezogen.';
  end if;
  if new.typ <> 'rechnung' or new.teil_nr is null or new.status not in ('offen','bezahlt') then
    raise exception 'Abziehen lassen sich nur fertige Teilrechnungen.';
  end if;
  if new.abgezogen_in = new.id then
    raise exception 'Eine Rechnung kann sich nicht selbst abziehen.';
  end if;
  return new;
end $$;
create trigger belege_teil_abzug before update of abgezogen_in on public.belege
  for each row execute function public.teil_abzug_pruefen();

-- Abzugsposition gelöscht → Teilrechnung wieder frei (die übrigen Quellen wie bisher)
create or replace function public.position_freigeben() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if old.quelle is null then return old; end if;
  update public.zeiten set rechnung_id = null
   where rechnung_id = old.beleg_id
     and id in (select x::uuid from jsonb_array_elements_text(coalesce(old.quelle->'zeiten', '[]'::jsonb)) x);
  update public.material_buchungen set rechnung_id = null
   where rechnung_id = old.beleg_id
     and id in (select x::uuid from jsonb_array_elements_text(coalesce(old.quelle->'material', '[]'::jsonb)) x);
  update public.regieberichte set rechnung_id = null
   where rechnung_id = old.beleg_id
     and id in (select x::uuid from jsonb_array_elements_text(coalesce(old.quelle->'regie', '[]'::jsonb)) x);
  update public.belege set abgezogen_in = null
   where abgezogen_in = old.beleg_id
     and id in (select x::uuid from jsonb_array_elements_text(coalesce(old.quelle->'teil', '[]'::jsonb)) x);
  return old;
end $$;

-- Schlussrechnung storniert → ihre Teilrechnungen wieder frei (für die Korrektur)
create function public.teil_freigeben_bei_storno() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  update public.belege set abgezogen_in = null where abgezogen_in = new.id;
  return new;
end $$;
create trigger belege_teil_storno after update of status on public.belege
  for each row when (new.status = 'storniert' and old.status <> 'storniert')
  execute function public.teil_freigeben_bei_storno();

notify pgrst, 'reload schema';
