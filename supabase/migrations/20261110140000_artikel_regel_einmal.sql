-- ============================================================================
--  Artikel lesen: ist_aktiv() einmal je Abfrage statt für jede Zeile
--
--  Mit dem Datanorm-Katalog (70.000+ Artikel) kostete die Leseregel je Suche
--  5–8 Sekunden — der Wert ändert sich innerhalb einer Abfrage nicht, also
--  als Unterabfrage (Postgres rechnet sie einmal aus).
-- ============================================================================
alter policy artikel_lesen on public.artikel using ((select public.ist_aktiv()));
