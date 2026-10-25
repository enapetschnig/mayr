-- Räumt weg, was tests/rls-test.mjs anlegt: Testdaten, die Testkonten
-- rlstest-…@mayr-test.at und die verbrauchten Nummern. Als postgres ausführen
-- (sql.sh -f oder Supabase-MCP). Dateien im Storage löscht der Test selbst.
--
-- Die Schutz-Trigger (festgeschriebene Rechnungen, unterschriebene
-- Regieberichte) werden dafür kurz abgeschaltet — alles in einer Transaktion.
do $$
declare
  v_user uuid[] := array(select id from auth.users where email like 'rlstest-%@mayr-test.at');
  v_projekte uuid[] := array(select id from public.projekte where name like 'RLS-Test%');
begin
  alter table public.zeiten disable trigger user;
  alter table public.material_buchungen disable trigger user;
  alter table public.regieberichte disable trigger user;
  alter table public.belege disable trigger user;
  alter table public.beleg_positionen disable trigger user;

  delete from public.belege where projekt_id = any(v_projekte) or erstellt_von = any(v_user);
  delete from public.zeiten where projekt_id = any(v_projekte) or user_id = any(v_user) or erstellt_von = any(v_user);
  delete from public.material_buchungen where projekt_id = any(v_projekte) or user_id = any(v_user);
  delete from public.regieberichte where projekt_id = any(v_projekte) or erstellt_von = any(v_user);
  delete from public.termine where projekt_id = any(v_projekte) or user_id = any(v_user);
  delete from public.dateien where projekt_id = any(v_projekte) or user_id = any(v_user);
  delete from public.projekte where id = any(v_projekte);
  delete from auth.users where id = any(v_user);

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
