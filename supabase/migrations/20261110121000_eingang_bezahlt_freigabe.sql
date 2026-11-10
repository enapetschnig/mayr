-- Schon bezahlt erfasst (Tankbeleg mit Karte, bar): gilt damit als geprüft.
-- Abgelehnte Rechnungen lassen sich nicht als bezahlt markieren.
create or replace function public.eingang_freigabe() returns trigger
language plpgsql set search_path = public as $$
begin
  if tg_op = 'UPDATE' and old.freigabe = 'freigegeben' and new.freigabe = 'freigegeben'
     and old.bezahlt_am is null and new.bezahlt_am is null
     and (new.lieferant, new.netto, new.brutto, new.iban, new.nummer)
         is distinct from (old.lieferant, old.netto, old.brutto, old.iban, old.nummer) then
    -- nach der Freigabe geändert → nochmal ansehen
    new.freigabe := 'offen';
  end if;
  if new.bezahlt_am is not null and new.freigabe = 'abgelehnt' then
    raise exception 'Die Rechnung ist abgelehnt — erst wieder auf „zu prüfen“ setzen.';
  end if;
  if new.bezahlt_am is not null and new.freigabe = 'offen' then
    new.freigabe := 'freigegeben';
  end if;
  if new.freigabe = 'freigegeben' and (tg_op = 'INSERT' or old.freigabe is distinct from 'freigegeben') then
    new.freigegeben_am := now();
    new.freigegeben_von := auth.uid();
  elsif new.freigabe <> 'freigegeben' then
    new.freigegeben_am := null;
    new.freigegeben_von := null;
  end if;
  if new.freigabe <> 'abgelehnt' then new.abgelehnt_grund := null; end if;
  return new;
end $$;
