-- Der Profilschutz soll App-Benutzer bremsen, nicht die Verwaltung:
-- Ohne angemeldeten Benutzer (SQL-Editor, Service-Role, Skripte) ist
-- auth.uid() leer — dann darf geändert werden.
create or replace function public.profil_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.ist_admin() then
    if new.firma_id is distinct from old.firma_id
       or new.ist_aktiv is distinct from old.ist_aktiv
       or new.ist_admin is distinct from old.ist_admin then
      raise exception 'Firma, Freischaltung und Admin-Recht kann nur ein Administrator ändern.';
    end if;
  end if;
  return new;
end $$;

create or replace function public.projekt_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and old.firma_id is distinct from public.meine_firma() then
    if new.firma_id is distinct from old.firma_id
       or new.sichtbarkeit is distinct from old.sichtbarkeit then
      raise exception 'Nur die Firma, die das Projekt angelegt hat, kann die Freigabe ändern.';
    end if;
  end if;
  return new;
end $$;
