-- "jahr" war gleichzeitig Variable und Spalte von nummernkreise —
-- Postgres weigert sich dann zu raten.
create or replace function public.beleg_fertigstellen(p_id uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  r public.rechnungen;
  f public.firmen;
  v_jahr int;
  v_n int;
  v_nr text;
begin
  select * into r from public.rechnungen where id = p_id for update;
  if r.id is null or r.firma_id is distinct from public.meine_firma() then
    raise exception 'Beleg nicht gefunden.';
  end if;
  if r.status <> 'entwurf' then
    return r.nummer;
  end if;
  if not exists (select 1 from public.rechnung_positionen where rechnung_id = p_id) then
    raise exception 'Der Beleg hat noch keine Positionen.';
  end if;

  select * into f from public.firmen where id = r.firma_id;
  v_jahr := extract(year from r.datum)::int;

  insert into public.nummernkreise as nk (firma_id, typ, jahr, letzte)
  values (r.firma_id, r.typ, v_jahr, 1)
  on conflict (firma_id, typ, jahr) do update set letzte = nk.letzte + 1
  returning nk.letzte into v_n;

  v_nr := (case when r.typ = 'angebot' then f.angebot_praefix else f.rechnung_praefix end)
          || '-' || v_jahr || '-' || lpad(v_n::text, 3, '0');

  update public.rechnungen
     set nummer = v_nr, status = 'offen', fertig_am = now()
   where id = p_id;
  return v_nr;
end $$;
