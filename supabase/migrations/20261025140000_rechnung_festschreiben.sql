-- Fertige Rechnungen ganz festschreiben. Bisher waren nur Nummer, Datum,
-- Beträge, Empfänger und Leistungszeitraum gesperrt — Betreff, Einleitung,
-- Schlusstext und Fälligkeit stehen aber auch auf dem PDF, und ein Nachdruck
-- muss der verschickten Rechnung gleichen (BAO § 131: der ursprüngliche
-- Inhalt bleibt ersichtlich).
--
-- Jetzt umgekehrt: nach dem Fertigstellen ändern sich nur noch Status und
-- Zahldatum (bezahlt) und die E-Mail des Empfängers. Projekt, Kunde und
-- Angebot dürfen nur auf leer gehen — das macht die Datenbank selbst, wenn
-- eines davon gelöscht wird (on delete set null). Storniert bleibt storniert;
-- die App legt dafür eine Korrektur als neue Rechnung an.
create or replace function public.beleg_schutz() returns trigger
language plpgsql set search_path = public as $$
declare
  v_frei constant text[] := array['status', 'bezahlt_am', 'empf_email', 'projekt_id', 'kunde_id', 'angebot_id', 'updated_at'];
begin
  if old.typ = 'rechnung' and old.status <> 'entwurf' then
    if new.status = 'entwurf' then
      raise exception 'Eine fertige Rechnung kann nicht zurück in den Entwurf.';
    end if;
    if old.status = 'storniert' and new.status <> 'storniert' then
      raise exception 'Eine stornierte Rechnung bleibt storniert. Für die neue Rechnung „Korrektur anlegen“.';
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
