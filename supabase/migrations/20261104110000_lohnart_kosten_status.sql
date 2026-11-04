-- Lehrling zum Lehrlingssatz verrechnen: Lohnart je Mitarbeiter (Name aus
-- firma.stundensaetze, leer = normaler Stundensatz).
alter table public.profiles add column lohnart text;

-- Nachkalkulation: was eine Stunde den Betrieb kostet (nur Chef sieht firma-Werte in der Karte)
alter table public.firma add column kostensatz numeric(10,2) check (kostensatz is null or kostensatz >= 0);

-- Abschließen und wieder öffnen nur durch den Chef — ein abgeschlossenes
-- Projekt ist für alle nicht mehr buchbar.
create or replace function public.projekt_status_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if new.status is distinct from old.status
     and auth.uid() is not null and not public.ist_chef()
     and (new.status = 'abgeschlossen' or old.status = 'abgeschlossen') then
    raise exception 'Ein Projekt abschließen oder wieder öffnen darf nur der Chef.';
  end if;
  return new;
end $$;

create trigger projekte_status_schutz before update on public.projekte
  for each row execute function public.projekt_status_schutz();
