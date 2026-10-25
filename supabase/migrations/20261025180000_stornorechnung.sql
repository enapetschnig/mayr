-- Storno als eigener Beleg: Stornorechnung mit eigener Nummer. Dazu der
-- Verweis der Korrektur-Rechnung und Angebote, die als Nachweis bleiben.
--
-- Bisher bekam die Rechnung nur den Status „storniert“ — der Kunde hatte kein
-- Dokument, das sie aufhebt (ein Firmenkunde braucht es, um die Vorsteuer zu
-- berichtigen). Jetzt entsteht beim Stornieren eine Stornorechnung: Nummer
-- aus dem Rechnungskreis, Verweis auf die Rechnung, alle Positionen mit
-- negativer Menge, sofort festgeschrieben. Die stornierte Rechnung bleibt
-- unverändert (lückenlose Nummern); beide zählen nicht zum Umsatz.
alter table public.belege drop constraint belege_status_check;
alter table public.belege add constraint belege_status_check
  check (status in ('entwurf','offen','angenommen','abgelehnt','bezahlt','storniert','storno'));
alter table public.belege add column storno_von uuid references public.belege(id);
create unique index belege_storno_von_einmal on public.belege (storno_von) where storno_von is not null;

-- „Korrektur anlegen“: die neue Rechnung weiß, welche sie ersetzt (Verweis
-- auf dem PDF) — und es gibt je stornierter Rechnung nur eine
alter table public.belege add column korrektur_von uuid references public.belege(id);
create unique index belege_korrektur_von_einmal on public.belege (korrektur_von) where korrektur_von is not null;

-- Ein Angebot, das in einer fertigen Rechnung steckt, bleibt als Nachweis
-- (sonst verliert die Rechnung still ihren Verweis)
create function public.angebot_verrechnet(p_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.belege where angebot_id = p_id and typ = 'rechnung' and status <> 'entwurf');
$$;
revoke execute on function public.angebot_verrechnet(uuid) from public, anon;
grant execute on function public.angebot_verrechnet(uuid) to authenticated;

drop policy belege_nicht_loeschen on public.belege;
create policy belege_nicht_loeschen on public.belege as restrictive for delete to authenticated
  using (case when typ = 'angebot' then not public.angebot_verrechnet(id) else status = 'entwurf' end);

-- Festschreiben wie bisher (20261025140000), dazu: eine Stornorechnung bleibt,
-- wie sie ist — auch ihr Status
create or replace function public.beleg_schutz() returns trigger
language plpgsql set search_path = public as $$
declare
  v_frei constant text[] := array['status', 'bezahlt_am', 'empf_email', 'projekt_id', 'kunde_id', 'angebot_id', 'updated_at'];
begin
  if old.typ = 'rechnung' and old.status <> 'entwurf' then
    if new.status = 'entwurf' then
      raise exception 'Eine fertige Rechnung kann nicht zurück in den Entwurf.';
    end if;
    if old.status = 'storniert' and new.status <> 'storniert' then
      raise exception 'Eine stornierte Rechnung bleibt storniert. Für die neue Rechnung „Korrektur anlegen“.';
    end if;
    if old.status = 'storno' and new.status <> 'storno' then
      raise exception 'Eine Stornorechnung bleibt, wie sie ist.';
    end if;
    if (to_jsonb(new) - v_frei) is distinct from (to_jsonb(old) - v_frei)
       or (new.projekt_id is distinct from old.projekt_id and new.projekt_id is not null)
       or (new.kunde_id is distinct from old.kunde_id and new.kunde_id is not null)
       or (new.angebot_id is distinct from old.angebot_id and new.angebot_id is not null) then
      raise exception 'Eine fertige Rechnung ist festgeschrieben. Bitte stornieren und neu erstellen.';
    end if;
  end if;
  return new;
end $$;

-- Stornieren: Stornorechnung anlegen, Rechnung auf „storniert“, Stunden/
-- Material/Regieberichte wieder frei. Gibt die ID der Stornorechnung zurück.
drop function public.beleg_stornieren(uuid);
create function public.beleg_stornieren(p_id uuid) returns uuid
language plpgsql security definer set search_path = public as $$
declare
  b public.belege;
  v_id uuid := gen_random_uuid();
  -- Datum und Nummernjahr nach Wiener Zeit (der Server rechnet in UTC)
  v_heute date := (now() at time zone 'Europe/Vienna')::date;
begin
  if not public.ist_chef() then
    raise exception 'Nur der Chef kann stornieren.';
  end if;
  select * into b from public.belege where id = p_id for update;
  if b.id is null or b.typ <> 'rechnung' or b.status not in ('offen','bezahlt') then
    raise exception 'Nur fertige Rechnungen können storniert werden.';
  end if;

  -- erst als Entwurf — die Positionen einer fertigen Rechnung sind fest
  insert into public.belege (id, typ, status, storno_von, projekt_id, kunde_id,
    empf_name, empf_zusatz, empf_strasse, empf_plz, empf_ort, empf_uid, empf_email,
    datum, leistung_von, leistung_bis, betreff, einleitung, schlusstext, ust_satz, reverse_charge)
  values (v_id, 'rechnung', 'entwurf', b.id, b.projekt_id, b.kunde_id,
    b.empf_name, b.empf_zusatz, b.empf_strasse, b.empf_plz, b.empf_ort, b.empf_uid, b.empf_email,
    v_heute, b.leistung_von, b.leistung_bis,
    'Storno zu Rechnung ' || b.nummer || coalesce(' — ' || nullif(btrim(b.betreff), ''), ''),
    'Hiermit stornieren wir unsere Rechnung ' || b.nummer || ' vom ' || to_char(b.datum, 'DD.MM.YYYY') || ' in voller Höhe.',
    case when b.status = 'bezahlt' then 'Den bereits bezahlten Betrag schreiben wir Ihnen gut.' end,
    b.ust_satz, b.reverse_charge);

  insert into public.beleg_positionen (beleg_id, pos, art, bezeichnung, langtext, menge, einheit, einzelpreis, ek_preis, minuten, artikel_id, leistung_id)
  select v_id, pos, art, bezeichnung, langtext,
         case when art in ('titel','text') then menge else -menge end,
         einheit, einzelpreis, ek_preis, minuten, artikel_id, leistung_id
    from public.beleg_positionen
   where beleg_id = b.id;

  update public.belege set
    status = 'storno',
    nummer = public.naechste_nummer('rechnung', v_heute),
    fertig_am = now(),
    netto = -b.netto,
    ust = -b.ust,
    brutto = -b.brutto
  where id = v_id;

  update public.belege set status = 'storniert' where id = b.id;
  update public.zeiten set rechnung_id = null where rechnung_id = b.id;
  update public.material_buchungen set rechnung_id = null where rechnung_id = b.id;
  update public.regieberichte set rechnung_id = null where rechnung_id = b.id;
  return v_id;
end $$;
revoke execute on function public.beleg_stornieren(uuid) from public, anon;
grant execute on function public.beleg_stornieren(uuid) to authenticated;
