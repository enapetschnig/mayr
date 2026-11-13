-- Terminplaner (Plantafel „Mitarbeiter“): Spalten = Leute, gruppiert nach Team.
-- Wer in keinem Team steht, kommt in seine Gruppe („Büro“, „Lager“ …);
-- ohne Gruppe der Chef in „Geschäftsführung“, alle anderen in „Ohne Team“.
alter table public.profiles add column if not exists gruppe text
  check (gruppe is null or length(gruppe) between 1 and 40);
comment on column public.profiles.gruppe is 'Gruppe im Terminplaner für Leute ohne Team (Geschäftsführung, Büro …); leer = nach Rolle';
