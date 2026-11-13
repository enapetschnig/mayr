-- =====================================================================
--  Review R7 (Sicherheit, Rechte, Datenbank) nach den SETEC-Paketen
-- =====================================================================
--
-- Keine Regel wird lockerer. Im Einzelnen:
--  1. Terminplaner-Gruppe (`profiles.gruppe`) legt der Chef fest — bisher
--     konnte sich ein Monteur selbst in „Geschäftsführung“ schieben.
--  2. Gesperrte/nicht freigeschaltete Konten löschen keine Aufgabenfotos
--     und keine eigenen Personal-Dateien mehr (bisher reichte „Besitzer“).
--  3. Die öffentliche Datenblatt-Regel gilt nur noch für `anon`: Angemeldete
--     lesen „projekt-dateien“ ohnehin über `projektdateien_lesen` — so rechnet
--     nicht jede Dateiliste eines Mitarbeiters `datenblatt_oeffentlich` je Zeile.
--  4. Advisor „auth_rls_initplan“ und „multiple_permissive_policies“ für die
--     neuen Tabellen: auth.uid()/ist_chef()/ist_aktiv() je Abfrage einmal
--     (`(select …)`), „für alles“-Regeln in anlegen/ändern/löschen geteilt.
--  5. Indizes auf neue Fremdschlüssel und auf beleg_positionen.artikel_id/
--     leistung_id, leistung_material.artikel_id (Datenblätter am Angebot,
--     Artikel löschen bei ~72.000 Artikeln).
--  6. Trigger-Funktion `foerderung_verlauf` nicht per RPC aufrufbar,
--     `lieferant_schluessel` mit festem search_path.
-- =====================================================================

-- ── 1. Gruppe nur der Chef ──────────────────────────────────────────────
create or replace function public.profil_schutz() returns trigger
language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.ist_chef() then
    if new.rolle is distinct from old.rolle or new.aktiv is distinct from old.aktiv
       or new.gesperrt is distinct from old.gesperrt then
      raise exception 'Rolle und Freischaltung kann nur der Chef ändern.';
    end if;
    if new.lohnart is distinct from old.lohnart or new.wochenstunden is distinct from old.wochenstunden
       or new.urlaub_tage is distinct from old.urlaub_tage or new.konto_ab is distinct from old.konto_ab then
      raise exception 'Stundensatz, Sollzeit und Urlaubsanspruch kann nur der Chef ändern.';
    end if;
    if new.gruppe is distinct from old.gruppe then
      raise exception 'Die Gruppe im Terminplaner legt der Chef fest.';
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

-- ── 2./3. Speicher ──────────────────────────────────────────────────────
drop policy aufgaben_fotos_loeschen on storage.objects;
create policy aufgaben_fotos_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'aufgaben' and ((select public.ist_chef())
    or ((select public.ist_aktiv()) and owner = (select auth.uid()))));

drop policy personal_dateien_loeschen on storage.objects;
create policy personal_dateien_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'personal' and ((select public.ist_chef())
    or ((select public.ist_aktiv()) and (storage.foldername(name))[1] = (select auth.uid())::text
        and owner = (select auth.uid()))));

drop policy datenblatt_oeffentlich_lesen on storage.objects;
create policy datenblatt_oeffentlich_lesen on storage.objects for select to anon
  using (bucket_id = 'projekt-dateien' and public.datenblatt_oeffentlich(name));

-- ── 4. Regeln: einmal je Abfrage ────────────────────────────────────────
-- Projekt-Verlauf
drop policy verlauf_lesen on public.projekt_verlauf;
drop policy verlauf_anlegen on public.projekt_verlauf;
drop policy verlauf_loeschen on public.projekt_verlauf;
create policy verlauf_lesen on public.projekt_verlauf for select to authenticated
  using ((select public.ist_aktiv()));
create policy verlauf_anlegen on public.projekt_verlauf for insert to authenticated
  with check ((select public.ist_aktiv()) and user_id = (select auth.uid()) and art <> 'foerderung');
create policy verlauf_loeschen on public.projekt_verlauf for delete to authenticated
  using ((select public.ist_chef()));

-- Lohnkosten, Angebote, Kategorien: nur der Chef
drop policy saetze_chef on public.mitarbeiter_saetze;
create policy saetze_chef on public.mitarbeiter_saetze for all to authenticated
  using ((select public.ist_chef())) with check ((select public.ist_chef()));
drop policy angebot_vorlagen_chef on public.angebot_vorlagen;
create policy angebot_vorlagen_chef on public.angebot_vorlagen for all to authenticated
  using ((select public.ist_chef())) with check ((select public.ist_chef()));
drop policy angebot_links_chef on public.angebot_links;
create policy angebot_links_chef on public.angebot_links for all to authenticated
  using ((select public.ist_chef())) with check ((select public.ist_chef()));
drop policy angebot_verlauf_chef on public.angebot_verlauf;
create policy angebot_verlauf_chef on public.angebot_verlauf for all to authenticated
  using ((select public.ist_chef())) with check ((select public.ist_chef()));
drop policy rechnung_kategorien_chef on public.rechnung_kategorien;
create policy rechnung_kategorien_chef on public.rechnung_kategorien for all to authenticated
  using ((select public.ist_chef())) with check ((select public.ist_chef()));

-- Aufgaben
drop policy aufgaben_lesen on public.aufgaben;
drop policy aufgaben_anlegen on public.aufgaben;
drop policy aufgaben_aendern on public.aufgaben;
drop policy aufgaben_loeschen on public.aufgaben;
create policy aufgaben_lesen on public.aufgaben for select to authenticated
  using ((select public.ist_chef()) or ((select public.ist_aktiv())
    and ((select auth.uid()) = any (zustaendig) or erstellt_von = (select auth.uid()))));
create policy aufgaben_anlegen on public.aufgaben for insert to authenticated
  with check ((select public.ist_aktiv()));
create policy aufgaben_aendern on public.aufgaben for update to authenticated
  using ((select public.ist_chef()) or ((select public.ist_aktiv())
    and ((select auth.uid()) = any (zustaendig) or erstellt_von = (select auth.uid()))))
  with check ((select public.ist_aktiv()));
create policy aufgaben_loeschen on public.aufgaben for delete to authenticated
  using ((select public.ist_chef()) or ((select public.ist_aktiv()) and erstellt_von = (select auth.uid())));

drop policy aufgabe_verlauf_kommentieren on public.aufgabe_verlauf;
drop policy aufgabe_verlauf_loeschen on public.aufgabe_verlauf;
create policy aufgabe_verlauf_kommentieren on public.aufgabe_verlauf for insert to authenticated
  with check ((select public.ist_aktiv()) and user_id = (select auth.uid()) and art = 'kommentar'
    and exists (select 1 from public.aufgaben a where a.id = aufgabe_id));
create policy aufgabe_verlauf_loeschen on public.aufgabe_verlauf for delete to authenticated
  using (art = 'kommentar' and ((select public.ist_chef())
    or ((select public.ist_aktiv()) and user_id = (select auth.uid()))));

-- Mitarbeiter-Dokumente
drop policy personal_dokumente_lesen on public.personal_dokumente;
drop policy personal_dokumente_anlegen on public.personal_dokumente;
drop policy personal_dokumente_aendern on public.personal_dokumente;
drop policy personal_dokumente_loeschen on public.personal_dokumente;
create policy personal_dokumente_lesen on public.personal_dokumente for select to authenticated
  using ((select public.ist_chef()) or ((select public.ist_aktiv()) and user_id = (select auth.uid())));
create policy personal_dokumente_anlegen on public.personal_dokumente for insert to authenticated
  with check ((select public.ist_chef()) or ((select public.ist_aktiv()) and user_id = (select auth.uid())
    and art in ('krankenschein', 'zeugnis', 'fuehrerschein', 'sonstiges')));
create policy personal_dokumente_aendern on public.personal_dokumente for update to authenticated
  using ((select public.ist_chef())) with check ((select public.ist_chef()));
create policy personal_dokumente_loeschen on public.personal_dokumente for delete to authenticated
  using ((select public.ist_chef()) or ((select public.ist_aktiv()) and user_id = (select auth.uid())
    and hochgeladen_von = (select auth.uid())));

-- Firmendokumente: lesen wie bisher, pflegen ohne zweite Leseregel
drop policy firmen_dokumente_lesen on public.firmen_dokumente;
drop policy firmen_dokumente_pflegen on public.firmen_dokumente;
create policy firmen_dokumente_lesen on public.firmen_dokumente for select to authenticated
  using ((select public.ist_aktiv()) and (not nur_chef or (select public.ist_chef())));
create policy firmen_dokumente_anlegen on public.firmen_dokumente for insert to authenticated
  with check ((select public.ist_chef()));
create policy firmen_dokumente_aendern on public.firmen_dokumente for update to authenticated
  using ((select public.ist_chef())) with check ((select public.ist_chef()));
create policy firmen_dokumente_loeschen on public.firmen_dokumente for delete to authenticated
  using ((select public.ist_chef()));

-- Artikel-Dateien
drop policy artikel_dateien_pflegen on public.artikel_dateien;
create policy artikel_dateien_anlegen on public.artikel_dateien for insert to authenticated
  with check ((select public.ist_chef()) and pfad like 'artikel/' || artikel_id || '/%');
create policy artikel_dateien_aendern on public.artikel_dateien for update to authenticated
  using ((select public.ist_chef()))
  with check ((select public.ist_chef()) and pfad like 'artikel/' || artikel_id || '/%');
create policy artikel_dateien_loeschen on public.artikel_dateien for delete to authenticated
  using ((select public.ist_chef()));

-- Lagerplätze: Chef überall, ein Monteur in seinem eigenen Bus
drop policy lagerplaetze_pflegen on public.artikel_lagerplaetze;
create function public.lagerplatz_darf(p_lagerort uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select public.ist_chef() or (public.ist_aktiv() and exists (
    select 1 from public.lagerorte o where o.id = p_lagerort and o.user_id = auth.uid()))
$$;
revoke execute on function public.lagerplatz_darf(uuid) from public, anon;
grant execute on function public.lagerplatz_darf(uuid) to authenticated;
create policy lagerplaetze_anlegen on public.artikel_lagerplaetze for insert to authenticated
  with check (public.lagerplatz_darf(lagerort_id));
create policy lagerplaetze_aendern on public.artikel_lagerplaetze for update to authenticated
  using (public.lagerplatz_darf(lagerort_id)) with check (public.lagerplatz_darf(lagerort_id));
create policy lagerplaetze_loeschen on public.artikel_lagerplaetze for delete to authenticated
  using (public.lagerplatz_darf(lagerort_id));

-- ── 5. Indizes ──────────────────────────────────────────────────────────
create index if not exists angebot_links_erstellt_von_idx on public.angebot_links (erstellt_von);
create index if not exists angebot_verlauf_wer_idx on public.angebot_verlauf (wer);
create index if not exists angebot_vorlagen_erstellt_von_idx on public.angebot_vorlagen (erstellt_von);
create index if not exists aufgabe_verlauf_user_id_idx on public.aufgabe_verlauf (user_id);
create index if not exists aufgaben_erledigt_von_idx on public.aufgaben (erledigt_von);
create index if not exists aufgaben_erstellt_von_idx on public.aufgaben (erstellt_von);
create index if not exists aufgaben_kunde_id_idx on public.aufgaben (kunde_id);
create index if not exists firmen_dokumente_hochgeladen_von_idx on public.firmen_dokumente (hochgeladen_von);
create index if not exists personal_dokumente_hochgeladen_von_idx on public.personal_dokumente (hochgeladen_von);
create index if not exists projekt_verlauf_user_id_idx on public.projekt_verlauf (user_id);
create index if not exists lieferscheine_eingebucht_von_idx on public.lieferscheine (eingebucht_von);
create index if not exists beleg_positionen_artikel_id_idx on public.beleg_positionen (artikel_id);
create index if not exists beleg_positionen_leistung_id_idx on public.beleg_positionen (leistung_id);
create index if not exists leistung_material_artikel_id_idx on public.leistung_material (artikel_id);

-- ── 6. Funktionen ───────────────────────────────────────────────────────
revoke execute on function public.foerderung_verlauf() from public, anon, authenticated;
alter function public.lieferant_schluessel(text) set search_path = '';

notify pgrst, 'reload schema';
