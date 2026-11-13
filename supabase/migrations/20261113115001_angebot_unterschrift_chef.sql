-- Demo-Unterschriften (supabase/demo/unterschriften.py) legt der Chef ab —
-- nur dort, wo der Verlauf schon auf die Datei zeigt; überschreiben geht nicht.
create policy angebot_bestaetigung_chef_ablegen on storage.objects for insert to authenticated
  with check (bucket_id = 'angebot-bestaetigung' and public.ist_chef()
              and exists (select 1 from public.angebot_verlauf v where v.unterschrift_pfad = name));
