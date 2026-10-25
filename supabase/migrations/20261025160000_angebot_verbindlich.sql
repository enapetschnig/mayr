-- Angebot als verbindlicher oder unverbindlicher Kostenvoranschlag.
--
-- Bei Verbrauchern gilt ein Kostenvoranschlag als verbindlich, wenn nicht
-- ausdrücklich das Gegenteil erklärt ist (§ 5 Abs. 2 KSchG). Das PDF schreibt
-- deshalb immer dazu, was gilt; ohne Wahl ist es unverbindlich — dann muss
-- eine beträchtliche Überschreitung vorher gemeldet werden (§ 1170a Abs. 2 ABGB).
alter table public.belege
  add column kv_verbindlich boolean not null default false;
