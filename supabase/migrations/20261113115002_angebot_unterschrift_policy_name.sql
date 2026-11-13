-- `name` im Unterabfrage-Vergleich traf angebot_verlauf.name statt des
-- Dateinamens — ausdrücklich storage.objects.name.
drop policy angebot_bestaetigung_chef_ablegen on storage.objects;
create policy angebot_bestaetigung_chef_ablegen on storage.objects for insert to authenticated
  with check (bucket_id = 'angebot-bestaetigung' and public.ist_chef()
              and exists (select 1 from public.angebot_verlauf v where v.unterschrift_pfad = storage.objects.name));

drop policy angebot_bestaetigung_loeschen on storage.objects;
create policy angebot_bestaetigung_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'angebot-bestaetigung' and public.ist_chef()
         and not exists (select 1 from public.angebot_verlauf v where v.unterschrift_pfad = storage.objects.name));
