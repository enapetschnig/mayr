-- Eingebuchter Lieferschein ist für Nicht-Chefs fest: bisher konnte der
-- Monteur nach dem Einbuchen Nummer, Lieferant oder Projekt noch ändern —
-- die Lagerbewegungen zeigten dann auf einen anderen Beleg als den gebuchten.
-- Ohne Anmeldung (SQL, Demo zurücksetzen, Aufräumen) bleibt alles erlaubt.
create or replace function public.lieferschein_eingebucht_schutz()
returns trigger language plpgsql set search_path = public
as $$
begin
  if auth.uid() is null or public.ist_chef() then
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'DELETE' then
    if old.eingebucht_am is not null then raise exception 'Lieferschein ist schon eingebucht'; end if;
    return old;
  end if;
  if new.eingebucht_am is distinct from old.eingebucht_am or new.eingebucht_von is distinct from old.eingebucht_von then
    raise exception 'Einbuchen nur durch den Chef';
  end if;
  if old.eingebucht_am is not null then
    raise exception 'Lieferschein ist schon eingebucht — ändern kann ihn nur der Chef';
  end if;
  return new;
end $$;
