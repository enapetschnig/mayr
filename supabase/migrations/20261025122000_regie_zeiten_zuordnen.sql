-- =====================================================================
--  Regieberichte: Stunden der Partie zuordnen, Unterschrift absichern
-- =====================================================================
--
-- 1. regie_zeiten_zuordnen(p_regie, p_dazu, p_weg)
--    Der Regiebericht schlägt Stunden vor, die am selben Projekt und Tag
--    schon gebucht sind („Heute schon gebucht: Max 6 h — übernehmen“).
--    Übernehmen setzt nur zeiten.regiebericht_id, statt doppelt zu buchen.
--    Die RLS auf zeiten lässt Ändern aber nur bei eigenen, selbst
--    angelegten Stunden oder dem Chef zu — und die Partie schreibt den
--    Bericht meist auf EINEM Handy. Deshalb diese Funktion. Sie ändert
--    ausschließlich regiebericht_id, nie Stunden, Datum oder Person:
--      dazu  Stunden desselben Projekts und Tages, noch in keinem Bericht
--            und keiner Rechnung → in diesen Bericht (nur im Entwurf)
--      weg   Stunden, die in genau diesem Entwurf stecken → aus dem
--            Bericht nehmen; sie bleiben normale Projektstunden
--    Rückgabe: die IDs, die wirklich geändert wurden.
--    Ohne diese Migration arbeitet die App direkt (nur eigene Stunden).
--
-- 2. Unterschrieben am = Serverzeit
--    Beim Unterschreiben setzt die Datenbank den Zeitpunkt; eine falsch
--    gehende Handyuhr landet nicht im Beleg. Ohne Unterschriftsbild und
--    Namen wird kein Bericht „unterschrieben“. Nur für angemeldete
--    Benutzer (auth.uid()), Wartungsskripte bleiben frei.
--
-- 3. Unterschriften bleiben im Speicher
--    Die Unterschrift des Kunden ist der Beleg. Die allgemeine Regel
--    „Eigentümer oder Chef darf löschen“ gilt für Fotos und Dokumente,
--    nicht für <projekt_id>/unterschriften/… (Überschreiben ist schon
--    gesperrt: der Bucket hat keine Update-Policy).
-- =====================================================================

-- ── 1. Stunden zuordnen ─────────────────────────────────────────────────
create or replace function public.regie_zeiten_zuordnen(
  p_regie uuid,
  p_dazu uuid[] default '{}',
  p_weg uuid[] default '{}'
) returns uuid[]
language plpgsql security definer set search_path = public as $$
declare
  v_projekt uuid;
  v_datum date;
  v_status text;
  v_dazu uuid[];
  v_weg uuid[];
begin
  if not public.ist_aktiv() then
    raise exception 'Kein Zugriff.';
  end if;

  -- Sperre gegen gleichzeitiges Unterschreiben auf einem zweiten Gerät
  select projekt_id, datum, status into v_projekt, v_datum, v_status
    from public.regieberichte where id = p_regie for update;
  if not found then
    raise exception 'Regiebericht nicht gefunden.';
  end if;
  if v_status <> 'entwurf' then
    raise exception 'Der Regiebericht ist schon unterschrieben.';
  end if;

  with geaendert as (
    update public.zeiten set regiebericht_id = p_regie
     where id = any(coalesce(p_dazu, '{}'))
       and regiebericht_id is null
       and rechnung_id is null
       and projekt_id = v_projekt
       and datum = v_datum
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_dazu from geaendert;

  with geaendert as (
    update public.zeiten set regiebericht_id = null
     where id = any(coalesce(p_weg, '{}'))
       and regiebericht_id = p_regie
       and rechnung_id is null
    returning id
  )
  select coalesce(array_agg(id), '{}') into v_weg from geaendert;

  return v_dazu || v_weg;
end $$;

revoke execute on function public.regie_zeiten_zuordnen(uuid, uuid[], uuid[]) from public, anon;
grant execute on function public.regie_zeiten_zuordnen(uuid, uuid[], uuid[]) to authenticated;

-- ── 2. Unterschreiben: Serverzeit, Bild und Name Pflicht ───────────────
create or replace function public.regie_unterschrift_pruefen() returns trigger
language plpgsql as $$
begin
  if auth.uid() is not null and old.status = 'entwurf' and new.status = 'unterschrieben' then
    if new.unterschrift_pfad is null or btrim(coalesce(new.unterschrift_name, '')) = '' then
      raise exception 'Zum Unterschreiben fehlen Unterschrift oder Name.';
    end if;
    new.unterschrieben_am := now();
  end if;
  return new;
end $$;

drop trigger if exists regieberichte_unterschrift on public.regieberichte;
create trigger regieberichte_unterschrift before update on public.regieberichte
  for each row execute function public.regie_unterschrift_pruefen();

-- ── 3. Unterschriften nicht löschbar ───────────────────────────────────
drop policy if exists unterschriften_bleiben on storage.objects;
create policy unterschriften_bleiben on storage.objects as restrictive for delete to authenticated
  using (not (bucket_id = 'projekt-dateien' and name like '%/unterschriften/%'));

notify pgrst, 'reload schema';
