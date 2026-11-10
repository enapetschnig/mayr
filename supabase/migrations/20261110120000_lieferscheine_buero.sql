-- Das Büro legt Lieferscheine auch selbst ab (z. B. per Mail gekommen) und
-- darf dafür in jeden Ordner des Buckets schreiben; upsert braucht update.
drop policy if exists lieferscheine_datei_hochladen on storage.objects;
create policy lieferscheine_datei_hochladen on storage.objects for insert to authenticated
  with check (bucket_id = 'lieferscheine' and public.ist_aktiv()
              and (public.ist_chef() or (storage.foldername(name))[1] = auth.uid()::text));
create policy lieferscheine_datei_ersetzen on storage.objects for update to authenticated
  using (bucket_id = 'lieferscheine' and public.ist_chef())
  with check (bucket_id = 'lieferscheine' and public.ist_chef());
