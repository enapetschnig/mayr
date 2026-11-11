-- Änderung melden: „Bildschirm aufnehmen & erklären“ wie in Steinbrecher.
--   aufnahme_pfad   – rrweb-Aufzeichnung der Seite (gzip-JSON) in der Ablage aenderungswuensche
--   aufnahme_ablauf – {sekunden, schritte: [{t, art: seite|klick, text}]}; daraus und aus der
--                     Abschrift macht `sprache-zu-text` die einzelnen Wünsche
-- Der Cockpit-Trigger schickt aufnahme_pfad mit (Abspielen im Cockpit). Bestehende Meldungen
-- bleiben, wie sie sind.

alter table public.aenderungswuensche add column if not exists aufnahme_pfad text;
alter table public.aenderungswuensche add column if not exists aufnahme_ablauf jsonb;

create or replace function public.wunsch_ans_cockpit() returns trigger
language plpgsql security definer set search_path = public, extensions as $$
declare
  v public.cockpit_verbindung%rowtype;
  melder text;
begin
  select * into v from public.cockpit_verbindung limit 1;
  if not found then
    return new;                         -- nicht eingerichtet: still
  end if;
  select nullif(trim(concat(p.vorname, ' ', p.nachname)), '') into melder
    from public.profiles p where p.id = new.erstellt_von;
  perform net.http_post(
    url := v.url,
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-app-key', v.app_key, 'x-cockpit-secret', v.secret),
    body := jsonb_build_object(
      'id', new.id, 'art', new.art, 'status', new.status, 'text', new.text, 'antwort', new.antwort,
      'seite', new.seite, 'bild_pfad', new.bild_pfad, 'audio_pfad', new.audio_pfad, 'anhaenge', new.anhaenge,
      'aufnahme_pfad', new.aufnahme_pfad,
      'melder', coalesce(melder, ''), 'erstellt_am', new.created_at, 'aktualisiert_am', new.updated_at
    )
  );
  return new;
end $$;

drop trigger if exists wunsch_ans_cockpit on public.aenderungswuensche;
create trigger wunsch_ans_cockpit
  after insert or update of status, antwort, text, bild_pfad, audio_pfad, aufnahme_pfad on public.aenderungswuensche
  for each row execute function public.wunsch_ans_cockpit();
