-- Konten: vergessenes Passwort und Sperren.
--
-- Bisher stand auf der Anmeldeseite „der Chef setzt dir ein neues Passwort“ —
-- das konnte er aber nicht (dafür braucht es Rechte, die die App nicht hat).
-- passwort_setzen() vergibt ein vorläufiges Passwort; passwort_neu sorgt
-- dafür, dass der Mitarbeiter beim nächsten Anmelden ein eigenes festlegt.
--
-- Gesperrt (vom Chef) war bisher nicht von „neu registriert, wartet“ zu
-- unterscheiden — die Startseite meldete Gesperrte für immer als wartend.
alter table public.profiles
  add column gesperrt boolean not null default false,
  add column passwort_neu boolean not null default false;

-- Rolle, Freischaltung und Sperre ändert nur der Chef; ein vorläufiges
-- Passwort vergibt nur er (zurücksetzen darf jeder für sich, nach dem Ändern)
create or replace function public.profil_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.ist_chef() then
    if new.rolle is distinct from old.rolle or new.aktiv is distinct from old.aktiv
       or new.gesperrt is distinct from old.gesperrt then
      raise exception 'Rolle und Freischaltung kann nur der Chef ändern.';
    end if;
    if new.passwort_neu and not old.passwort_neu then
      raise exception 'Ein vorläufiges Passwort vergibt nur der Chef.';
    end if;
  end if;
  -- Freischalten hebt eine Sperre auf; gesperrt heißt immer auch nicht aktiv
  if new.aktiv and not old.aktiv then
    new.gesperrt := false;
  end if;
  if new.gesperrt and not old.gesperrt then
    new.aktiv := false;
  end if;
  if old.rolle = 'chef' and old.aktiv and (new.rolle <> 'chef' or not new.aktiv)
     and not exists (select 1 from public.profiles where id <> old.id and rolle = 'chef' and aktiv) then
    raise exception 'Es muss mindestens ein aktiver Chef bleiben.';
  end if;
  return new;
end $$;

-- Gleiches Verfahren wie Supabase Auth (bcrypt, Kosten 10) — die Anmeldung
-- prüft das Passwort ganz normal.
create or replace function public.passwort_setzen(p_user uuid, p_passwort text) returns void
language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.ist_chef() then
    raise exception 'Nur der Chef kann Passwörter vergeben.';
  end if;
  if length(coalesce(p_passwort, '')) < 6 then
    raise exception 'Das Passwort braucht mindestens 6 Zeichen.';
  end if;
  if octet_length(p_passwort) > 72 then
    raise exception 'Das Passwort ist zu lang.';
  end if;
  update auth.users
     set encrypted_password = extensions.crypt(p_passwort, extensions.gen_salt('bf', 10)), updated_at = now()
   where id = p_user;
  if not found then
    raise exception 'Diesen Mitarbeiter gibt es nicht.';
  end if;
  update public.profiles set passwort_neu = true where id = p_user;
end $$;
revoke execute on function public.passwort_setzen(uuid, text) from public, anon;
grant execute on function public.passwort_setzen(uuid, text) to authenticated;
