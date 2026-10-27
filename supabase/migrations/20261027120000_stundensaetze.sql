-- Weitere Stundensätze des Betriebs (Meister, Lehrling …) für die Kalkulation
-- im Angebot: [{"name": "Meister", "satz": 85}]. Der Standard bleibt
-- firma.stundensatz (bzw. der Satz am Projekt).
alter table public.firma add column stundensaetze jsonb not null default '[]'::jsonb
  check (jsonb_typeof(stundensaetze) = 'array');

-- Demo-Betrieb: Meister und Lehrling neben dem Standardsatz
update public.firma set stundensaetze = '[{"name": "Meister", "satz": 85}, {"name": "Lehrling", "satz": 42}]'::jsonb
 where id = 1 and name = 'Elektro Muster GmbH';

notify pgrst, 'reload schema';
