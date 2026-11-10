-- new.art gibt es nur bei material_buchungen — plpgsql löst Felder beim
-- Vorbereiten auf, auch hinter „and“. Darum über to_jsonb lesen.
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
  if tg_table_name = 'material_buchungen' and (to_jsonb(new) ->> 'art') not in ('ausfassung', 'direkt') then return new; end if;
  select status into st from public.projekte where id = new.projekt_id;
  if st is distinct from 'aktiv' then
    raise exception 'Auf dieses Projekt kann nicht mehr gebucht werden — es ist nicht „In Arbeit“ (%).',
      case st when 'angebot' then 'Angebot' when 'verrechnen' then 'Zu verrechnen' when 'abgeschlossen' then 'Abgeschlossen' else coalesce(st, '?') end
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;
