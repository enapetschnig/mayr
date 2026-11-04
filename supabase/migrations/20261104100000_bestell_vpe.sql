-- Bestellt wird in Packungen: Kabel im 100-m-Ring, Kabelbinder im 100er-Beutel.
-- Der Bestellvorschlag rundet auf ein Vielfaches davon auf (leer = ganze Einheiten).
alter table public.artikel add column bestell_vpe numeric(12,3) check (bestell_vpe is null or bestell_vpe > 0);
notify pgrst, 'reload schema';
