-- Datenblätter der Artikel liegen in „projekt-dateien“ unter artikel/<artikel_id>/…
-- (Paket F), nicht in einem eigenen Speicher „dateien“. Die öffentliche Leseregel
-- für Kunden mit gültigem Angebotslink zeigt jetzt auf den richtigen Speicher.
drop policy if exists datenblatt_oeffentlich_lesen on storage.objects;
create policy datenblatt_oeffentlich_lesen on storage.objects for select to anon, authenticated
  using (bucket_id = 'projekt-dateien' and public.datenblatt_oeffentlich(name));
