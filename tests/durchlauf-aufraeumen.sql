-- Räumt weg, was tests/durchlauf.mjs in der Datenbank anlegt: die Projekte
-- „TEST Durchlauf …“ samt Stunden, Material, Regieberichten, Belegen,
-- Terminen und Dateieinträgen, dazu die verbrauchten Nummern.
-- Aufruf über tests/durchlauf-aufraeumen.mjs (löscht vorher die Dateien).
--
-- Die Schutz-Trigger (festgeschriebene Rechnungen, unterschriebene
-- Regieberichte) werden dafür kurz abgeschaltet — alles in einer Transaktion.
do $$
declare
  v_projekte uuid[] := array(select id from public.projekte where name like 'TEST Durchlauf%');
begin
  alter table public.zeiten disable trigger user;
  alter table public.material_buchungen disable trigger user;
  alter table public.regieberichte disable trigger user;
  alter table public.belege disable trigger user;
  alter table public.beleg_positionen disable trigger user;

  delete from public.belege where projekt_id = any(v_projekte);
  delete from public.zeiten where projekt_id = any(v_projekte);
  delete from public.material_buchungen where projekt_id = any(v_projekte);
  delete from public.regieberichte where projekt_id = any(v_projekte);
  delete from public.termine where projekt_id = any(v_projekte);
  delete from public.dateien where projekt_id = any(v_projekte);
  delete from public.projekte where id = any(v_projekte);

  alter table public.zeiten enable trigger user;
  alter table public.material_buchungen enable trigger user;
  alter table public.regieberichte enable trigger user;
  alter table public.belege enable trigger user;
  alter table public.beleg_positionen enable trigger user;

  -- Nummernkreise zurück auf die höchste Nummer, die es noch gibt
  update public.nummernkreise n set letzte = coalesce((
    select max(substring(x.nummer from '(\d+)$')::int) from (
      select nummer from public.projekte where n.typ = 'projekt' and nummer like n.jahr || '-%'
      union all select nummer from public.belege where n.typ = 'angebot' and nummer like 'AN-' || n.jahr || '-%'
      union all select nummer from public.belege where n.typ = 'rechnung' and nummer like 'RE-' || n.jahr || '-%'
      union all select nummer from public.regieberichte where n.typ = 'regie' and nummer like 'RB-' || n.jahr || '-%'
    ) x), 0);
end $$;
