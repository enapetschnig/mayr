-- Die Rückgabespalten heißen wie die Tabellenspalten: on conflict (schluessel)
-- war deshalb mehrdeutig und jeder Aufruf schlug fehl.
create or replace function public.kreditor_konten_holen(p_namen text[])
returns table (schluessel text, konto int)
language plpgsql set search_path = public as $$
#variable_conflict use_column
begin
  if not public.ist_chef() then
    raise exception 'Nur der Chef.';
  end if;
  insert into public.kreditor_konten (schluessel, name)
  select distinct on (lower(btrim(n))) lower(btrim(n)), btrim(n)
    from unnest(p_namen) n
   where btrim(n) <> ''
   order by lower(btrim(n)), n
  on conflict (schluessel) do nothing;
  return query
    select k.schluessel, k.konto from public.kreditor_konten k
     where k.schluessel in (select lower(btrim(n)) from unnest(p_namen) n);
end $$;
