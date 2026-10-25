-- =====================================================================
--  Rechte des Monteurs über die Schnittstelle schließen
-- =====================================================================
--
-- Die Oberfläche zeigt einem Monteur vieles nicht — die Datenbank muss es
-- trotzdem selbst verbieten (Funktionstest 25.10.2026, direkte API-Aufrufe):
--
-- 1. Verrechnen ist Sache des Chefs. Bisher nahm buchung_schutz die Spalte
--    rechnung_id für alle aus: ein Monteur konnte die Verrechnung seiner
--    Stunden aufheben (doppelt verrechenbar, danach wieder änderbar) oder
--    eigene Stunden an einen Beleg hängen.
-- 2. Stunden: für Kollegen nur die Partie im Regiebericht (regiebericht_id),
--    sonst der Chef. Wer eingetragen hat (erstellt_von), setzt die Datenbank;
--    umbuchen auf einen Kollegen kann nur der Chef.
-- 3. Projekte: die Nummer bleibt, den Stundensatz ändert nur der Chef (er
--    fließt in Rechnungen und Nachkalkulation).
-- 4. Pause nie negativ (sonst wird aus 1 h Arbeit mit „-60“ Pause 2 h).
--
-- Wartungsskripte ohne Anmeldung (auth.uid() ist leer) bleiben frei.
-- =====================================================================

-- ── 1. Verrechnen nur der Chef ──────────────────────────────────────────
create or replace function public.buchung_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  -- In einen unterschriebenen Regiebericht kommt nichts mehr dazu.
  if tg_op in ('INSERT','UPDATE')
     and new.regiebericht_id is not null
     and (tg_op = 'INSERT' or new.regiebericht_id is distinct from old.regiebericht_id)
     and public.regie_unterschrieben(new.regiebericht_id) then
    raise exception 'Der Regiebericht ist schon unterschrieben.';
  end if;
  -- rechnung_id setzen oder lösen: nur der Chef (Rechnung, Storno, Entwurf
  -- löschen laufen alle unter seiner Anmeldung)
  if auth.uid() is not null and not public.ist_chef()
     and ((tg_op = 'INSERT' and new.rechnung_id is not null)
       or (tg_op = 'UPDATE' and new.rechnung_id is distinct from old.rechnung_id)) then
    raise exception 'Verrechnen kann nur der Chef.';
  end if;
  if tg_op = 'INSERT' then
    return new;
  end if;
  if old.rechnung_id is null and not public.regie_unterschrieben(old.regiebericht_id) then
    return coalesce(new, old);
  end if;
  if tg_op = 'DELETE' then
    raise exception 'Schon verrechnet oder im unterschriebenen Regiebericht — kann nicht mehr gelöscht werden.';
  end if;
  if (to_jsonb(new) - 'rechnung_id') is distinct from (to_jsonb(old) - 'rechnung_id') then
    raise exception 'Schon verrechnet oder im unterschriebenen Regiebericht — kann nicht mehr geändert werden.';
  end if;
  return new;
end $$;

-- ── 2. Stunden: für wen, und wer hat eingetragen ────────────────────────
create function public.zeit_person_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.ist_chef() then
    if tg_op = 'INSERT' and auth.uid() is not null then
      new.erstellt_von := auth.uid();
    end if;
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.erstellt_von := auth.uid();
    if new.user_id is distinct from auth.uid() and new.regiebericht_id is null then
      raise exception 'Stunden für Kollegen bucht der Chef — oder die Partie im Regiebericht.';
    end if;
    return new;
  end if;
  if new.erstellt_von is distinct from old.erstellt_von then
    raise exception 'Wer die Stunden eingetragen hat, bleibt.';
  end if;
  if new.user_id is distinct from old.user_id then
    raise exception 'Stunden auf einen Kollegen umbuchen kann nur der Chef.';
  end if;
  return new;
end $$;
create trigger zeiten_person before insert or update on public.zeiten
  for each row execute function public.zeit_person_schutz();

-- ── 3. Projekte: Nummer fest, Stundensatz nur der Chef ──────────────────
create function public.projekt_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'UPDATE' and new.nummer is distinct from old.nummer then
    raise exception 'Die Projektnummer bleibt, wie sie ist.';
  end if;
  if auth.uid() is not null and not public.ist_chef()
     and ((tg_op = 'INSERT' and new.stundensatz is not null)
       or (tg_op = 'UPDATE' and new.stundensatz is distinct from old.stundensatz)) then
    raise exception 'Den Stundensatz eines Projekts legt der Chef fest.';
  end if;
  if new.stundensatz <= 0 and (tg_op = 'INSERT' or new.stundensatz is distinct from old.stundensatz) then
    raise exception 'Der Stundensatz muss über 0 € liegen — leer heißt: der des Betriebs.';
  end if;
  return new;
end $$;
create trigger projekte_schutz before insert or update on public.projekte
  for each row execute function public.projekt_schutz();

-- ── 4. Material: Wareneingang und Inventur nur der Chef ─────────────────
-- Der Monteur fasst aus, gibt zurück und bucht direkt aufs Projekt. Zugang,
-- Abgang und Inventur verändern den Lagerbestand ohne Projekt — Chefsache
-- (die Oberfläche zeigt sie ihm nicht). Wer gebucht hat, bleibt.
create function public.material_person_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.ist_chef() then
    return new;
  end if;
  if new.art in ('zugang', 'abgang', 'korrektur') then
    raise exception 'Wareneingang und Inventur bucht der Chef.';
  end if;
  if tg_op = 'UPDATE' and new.user_id is distinct from old.user_id then
    raise exception 'Wer gebucht hat, bleibt.';
  end if;
  return new;
end $$;
create trigger material_person before insert or update on public.material_buchungen
  for each row execute function public.material_person_schutz();

-- ── 5. Pause nie negativ ────────────────────────────────────────────────
alter table public.zeiten add constraint zeiten_pause_check check (pause_minuten >= 0);

-- Trigger-Funktionen nicht über /rest/v1/rpc (wie 20261025130000)
revoke execute on function
  public.buchung_schutz(),
  public.zeit_person_schutz(),
  public.projekt_schutz(),
  public.material_person_schutz()
from public, anon, authenticated;
