-- Fertige Rechnungen als PDF aufbewahren, so wie sie verschickt wurden.
--
-- Neu erzeugt sähe eine alte Rechnung nach einer Änderung im Betrieb (Bank,
-- Anschrift, Logo) oder am Projekt anders aus als das Original. Die App legt
-- das PDF beim Fertigstellen ab (<beleg-id>.pdf) und zeigt danach immer das.
--
-- Nur der Chef liest und legt ab, nur für fertige Rechnungen; überschreiben
-- geht nicht (keine Update-Policy). Löschen erst, wenn die Rechnung selbst
-- weg ist — fertige Rechnungen lassen sich nicht löschen, das passiert nur
-- beim Zurücksetzen der Demo und beim Aufräumen nach Tests.
insert into storage.buckets (id, name, public) values ('beleg-archiv', 'beleg-archiv', false)
  on conflict (id) do nothing;

create policy beleg_archiv_lesen on storage.objects for select to authenticated
  using (bucket_id = 'beleg-archiv' and public.ist_chef());

create policy beleg_archiv_ablegen on storage.objects for insert to authenticated
  with check (
    bucket_id = 'beleg-archiv' and public.ist_chef()
    and exists (select 1 from public.belege b
                 where b.id::text || '.pdf' = name and b.typ = 'rechnung' and b.status <> 'entwurf')
  );

create policy beleg_archiv_verwaist_loeschen on storage.objects for delete to authenticated
  using (
    bucket_id = 'beleg-archiv' and public.ist_chef()
    and not exists (select 1 from public.belege b where b.id::text || '.pdf' = name)
  );
