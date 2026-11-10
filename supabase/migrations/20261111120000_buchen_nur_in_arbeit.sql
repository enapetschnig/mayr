-- Gebucht wird nur auf Projekte „In Arbeit“ (status = 'aktiv'): Stunden,
-- Material (Ausfassen, direkt) und Regieberichte. Bei Angebot, Zu verrechnen
-- und Abgeschlossen sperrt die Datenbank — der Chef stellt das Projekt
-- dafür kurz wieder auf „In Arbeit“. Rückgaben ins Lager bleiben immer möglich.
-- Ohne Anmeldung (Demo-Skripte, Wartung als postgres) gilt die Sperre nicht.

create or replace function public.nur_in_arbeit_buchen()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  st text;
begin
  if auth.uid() is null or new.projekt_id is null then return new; end if;
  if tg_op = 'UPDATE' and new.projekt_id is not distinct from old.projekt_id then return new; end if;
  if tg_table_name = 'material_buchungen' and new.art not in ('ausfassung', 'direkt') then return new; end if;
  select status into st from public.projekte where id = new.projekt_id;
  if st is distinct from 'aktiv' then
    raise exception 'Auf dieses Projekt kann nicht mehr gebucht werden — es ist nicht „In Arbeit“ (%).',
      case st when 'angebot' then 'Angebot' when 'verrechnen' then 'Zu verrechnen' when 'abgeschlossen' then 'Abgeschlossen' else coalesce(st, '?') end
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

create trigger zeiten_nur_in_arbeit before insert or update of projekt_id on public.zeiten
  for each row execute function public.nur_in_arbeit_buchen();
create trigger material_nur_in_arbeit before insert or update of projekt_id on public.material_buchungen
  for each row execute function public.nur_in_arbeit_buchen();
create trigger regie_nur_in_arbeit before insert or update of projekt_id on public.regieberichte
  for each row execute function public.nur_in_arbeit_buchen();
