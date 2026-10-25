-- =====================================================================
-- Sicherheits-Hinweise von Supabase (Advisor) abarbeiten.
-- Keine offene Lücke — die Beleg-Funktionen prüfen selbst auf ist_chef(),
-- Trigger-Funktionen lassen sich über die API nicht sinnvoll aufrufen —
-- aber was niemand aufrufen soll, soll auch niemand aufrufen dürfen.
--
-- Trigger feuern ohne EXECUTE-Prüfung; das Entziehen ändert an Anlegen,
-- Festschreiben und Nummernvergabe nichts (tests/rls-test.mjs prüft das).
-- ist_aktiv()/ist_chef() bleiben aufrufbar: sie stecken in den Policies und
-- verraten nur etwas über den Aufrufer selbst.
-- =====================================================================

-- Fester search_path auch für die einfachen Trigger-Funktionen
alter function public.regie_schutz() set search_path = public;
alter function public.updated_at_setzen() set search_path = public;
alter function public.beleg_schutz() set search_path = public;
alter function public.regie_unterschrift_pruefen() set search_path = public;

-- Trigger-Funktionen mit festen Rechten: nicht über /rest/v1/rpc
revoke execute on function
  public.buchung_schutz(),
  public.handle_new_user(),
  public.position_freigeben(),
  public.positionen_schutz(),
  public.profil_schutz(),
  public.projekt_nummer_vergeben(),
  public.regie_nummer_vergeben()
from public, anon, authenticated;

-- Belege fertigstellen und stornieren: nur angemeldet (die Funktion prüft den Chef)
revoke execute on function public.beleg_fertigstellen(uuid), public.beleg_stornieren(uuid) from public, anon;
grant execute on function public.beleg_fertigstellen(uuid), public.beleg_stornieren(uuid) to authenticated;
