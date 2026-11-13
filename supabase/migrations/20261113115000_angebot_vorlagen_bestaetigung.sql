-- Angebote (Paket E der SETEC-Wunschliste):
--  1. Angebotsvorlagen — ein ganzes Angebot (Titel, Positionen, Texte) zum
--     Wiederverwenden. Nicht dasselbe wie eine Leistung (`leistungen`): die ist
--     EINE Position mit Material, eine Vorlage ist ein ganzes Angebot.
--  2. Kunde bestätigt online — Link mit zufälligem Token, öffentliche Seite
--     /angebot/<token> ohne Anmeldung. Zugriff NUR über die RPCs unten
--     (security definer, auch für anon); die Tabellen selbst sieht nur der Chef.
--  3. Datenblätter der Artikel im Angebot — die Tabelle `artikel_dateien`
--     kommt aus Paket F; hier wird sie nur gelesen, wenn es sie gibt.

-- ── 1. Vorlagen ─────────────────────────────────────────────────────────
create table public.angebot_vorlagen (
  id uuid primary key default gen_random_uuid(),
  name text not null check (length(btrim(name)) between 1 and 120),
  kategorie text check (kategorie is null or length(kategorie) <= 60),
  betreff text,
  einleitung text,
  schlusstext text,
  -- Positionen wie im Editor: art, bezeichnung, langtext, menge, einheit,
  -- einzelpreis, ek_preis, minuten, artikel_id, leistung_id (ohne Herkunft)
  positionen jsonb not null default '[]'::jsonb check (jsonb_typeof(positionen) = 'array'),
  -- Summe beim Speichern — nur zur Anzeige in der Auswahl
  netto numeric(12,2) not null default 0,
  erstellt_von uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create unique index angebot_vorlagen_name_einmal on public.angebot_vorlagen (lower(btrim(name)));
create trigger angebot_vorlagen_updated before update on public.angebot_vorlagen
  for each row execute function public.updated_at_setzen();

alter table public.angebot_vorlagen enable row level security;
create policy angebot_vorlagen_chef on public.angebot_vorlagen for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());

-- ── 2. Online bestätigen ────────────────────────────────────────────────
create table public.angebot_links (
  id uuid primary key default gen_random_uuid(),
  beleg_id uuid not null references public.belege(id) on delete cascade,
  -- 24 Zufallsbytes, base64url = 32 Zeichen (192 Bit) — nicht zu erraten
  token text not null unique check (length(token) >= 32),
  -- gilt bis: Gültig-bis des Angebots, sonst dieser Tag (beim Anlegen gesetzt)
  ablauf date not null,
  gesperrt_am timestamptz,
  geoeffnet_am timestamptz,
  erstellt_von uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
-- Je Angebot höchstens ein gültiger Link — ein neuer sperrt den alten
create unique index angebot_links_einer on public.angebot_links (beleg_id) where gesperrt_am is null;

create table public.angebot_verlauf (
  id uuid primary key default gen_random_uuid(),
  beleg_id uuid not null references public.belege(id) on delete cascade,
  art text not null check (art in ('link', 'geoeffnet', 'angenommen', 'rueckfrage', 'gesperrt')),
  name text,
  text text,
  unterschrift_pfad text,
  -- Betrag brutto zum Zeitpunkt der Annahme (der Kunde hat genau das gesehen)
  betrag numeric(12,2),
  -- Für „Zu erledigen“: Annahme und Rückfrage, bis der Chef das Angebot öffnet
  gelesen boolean not null default true,
  wer uuid default auth.uid() references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.angebot_verlauf (beleg_id, created_at);
create index angebot_verlauf_ungelesen on public.angebot_verlauf (beleg_id) where not gelesen;

alter table public.angebot_links enable row level security;
alter table public.angebot_verlauf enable row level security;
create policy angebot_links_chef on public.angebot_links for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());
create policy angebot_verlauf_chef on public.angebot_verlauf for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());

-- Unterschriften des Kunden: Bucket privat, nur PNG, klein.
-- Pfad <token>/<zufall>.png — hochladen darf, wer den gültigen Link hat
-- (anon), höchstens 5 Dateien je Link; lesen nur der Chef.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('angebot-bestaetigung', 'angebot-bestaetigung', false, 524288, array['image/png'])
on conflict (id) do nothing;

/** Den Link zu einem Token — nur gültige (nicht gesperrt) */
create function public.angebot_link_zu(p_token text) returns public.angebot_links
language sql stable security definer set search_path = public as $$
  select l.* from public.angebot_links l
   where p_token is not null and length(p_token) between 32 and 64
     and l.token = p_token and l.gesperrt_am is null
$$;
revoke execute on function public.angebot_link_zu(text) from public, anon, authenticated;

/**
 * Zustand des Angebots hinter einem Link:
 * offen | angenommen | abgelehnt | abgelaufen | verrechnet | gesperrt | unbekannt.
 * Annehmen und Rückfragen gehen nur bei „offen“.
 */
create function public.angebot_link_zustand(p_link public.angebot_links) returns text
language plpgsql stable security definer set search_path = public as $$
declare
  b public.belege;
begin
  if p_link.id is null then return 'unbekannt'; end if;
  select * into b from public.belege where id = p_link.beleg_id;
  if b.id is null or b.typ <> 'angebot' then return 'unbekannt'; end if;
  if b.status = 'angenommen' then return 'angenommen'; end if;
  if b.status = 'abgelehnt' then return 'abgelehnt'; end if;
  if b.status <> 'offen' then return 'gesperrt'; end if; -- Entwurf: zurückgenommen
  if exists (select 1 from public.belege r where r.angebot_id = b.id and r.typ = 'rechnung' and r.status <> 'storniert') then
    return 'verrechnet';
  end if;
  if current_date > coalesce(b.gueltig_bis, p_link.ablauf) then return 'abgelaufen'; end if;
  return 'offen';
end $$;
revoke execute on function public.angebot_link_zustand(public.angebot_links) from public, anon, authenticated;

create function public.angebot_upload_erlaubt(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v_token text := split_part(p_name, '/', 1);
  v_link public.angebot_links;
begin
  if p_name !~ '^[A-Za-z0-9_-]{32,64}/[A-Za-z0-9-]{8,64}\.png$' then return false; end if;
  v_link := public.angebot_link_zu(v_token);
  if v_link.id is null or public.angebot_link_zustand(v_link) <> 'offen' then return false; end if;
  return (select count(*) from storage.objects o
           where o.bucket_id = 'angebot-bestaetigung' and o.name like v_token || '/%') < 5;
end $$;
revoke execute on function public.angebot_upload_erlaubt(text) from public;
grant execute on function public.angebot_upload_erlaubt(text) to anon, authenticated;

create policy angebot_bestaetigung_hochladen on storage.objects for insert to anon, authenticated
  with check (bucket_id = 'angebot-bestaetigung' and public.angebot_upload_erlaubt(name));
create policy angebot_bestaetigung_lesen on storage.objects for select to authenticated
  using (bucket_id = 'angebot-bestaetigung' and public.ist_chef());
-- Nur mit dem Angebot weg (gelöscht → kein Verlauf mehr verweist darauf)
create policy angebot_bestaetigung_loeschen on storage.objects for delete to authenticated
  using (bucket_id = 'angebot-bestaetigung' and public.ist_chef()
         and not exists (select 1 from public.angebot_verlauf v where v.unterschrift_pfad = name));

/** Chef: Link erzeugen (ein alter wird gesperrt). Gibt das Token zurück. */
create function public.angebot_link_erstellen(p_beleg uuid) returns text
language plpgsql security definer set search_path = public as $$
declare
  b public.belege;
  v_token text;
  v_tage int;
begin
  if not public.ist_chef() then raise exception 'Nur der Chef kann einen Bestätigungslink erzeugen.'; end if;
  select * into b from public.belege where id = p_beleg;
  if b.id is null or b.typ <> 'angebot' then raise exception 'Angebot nicht gefunden.'; end if;
  if b.status <> 'offen' then
    raise exception 'Einen Link gibt es nur für fertige, offene Angebote (jetzt: %).', b.status;
  end if;
  select coalesce(angebot_gueltig_tage, 30) into v_tage from public.firma limit 1;
  update public.angebot_links set gesperrt_am = now() where beleg_id = p_beleg and gesperrt_am is null;
  v_token := translate(encode(extensions.gen_random_bytes(24), 'base64'), '+/', '-_');
  insert into public.angebot_links (beleg_id, token, ablauf)
  values (p_beleg, v_token, greatest(coalesce(b.gueltig_bis, b.datum + coalesce(v_tage, 30)), current_date));
  insert into public.angebot_verlauf (beleg_id, art, text) values (p_beleg, 'link', 'Bestätigungslink erzeugt');
  return v_token;
end $$;
revoke execute on function public.angebot_link_erstellen(uuid) from public, anon;
grant execute on function public.angebot_link_erstellen(uuid) to authenticated;

/** Chef: Link sperren — der Kunde sieht danach nichts mehr */
create function public.angebot_link_sperren(p_beleg uuid) returns void
language plpgsql security definer set search_path = public as $$
begin
  if not public.ist_chef() then raise exception 'Nur der Chef kann den Link sperren.'; end if;
  update public.angebot_links set gesperrt_am = now() where beleg_id = p_beleg and gesperrt_am is null;
  if found then
    insert into public.angebot_verlauf (beleg_id, art, text) values (p_beleg, 'gesperrt', 'Bestätigungslink gesperrt');
  end if;
end $$;
revoke execute on function public.angebot_link_sperren(uuid) from public, anon;
grant execute on function public.angebot_link_sperren(uuid) to authenticated;

/** Datenblätter der Artikel im Angebot (auch aus dem Material der Leistungen) — leer ohne Paket F */
create function public.angebot_datenblaetter(p_beleg uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare
  v jsonb;
begin
  if to_regclass('public.artikel_dateien') is null then return '[]'::jsonb; end if;
  execute $q$
    select coalesce(jsonb_agg(jsonb_build_object('name', x.name, 'pfad', x.pfad, 'artikel', x.artikel) order by x.artikel, x.name), '[]'::jsonb)
      from (
        select distinct on (d.pfad) d.name, d.pfad, a.bezeichnung as artikel
          from public.artikel_dateien d
          join public.artikel a on a.id = d.artikel_id
         where d.art = 'datenblatt'
           and d.artikel_id in (
             select p.artikel_id from public.beleg_positionen p where p.beleg_id = $1 and p.artikel_id is not null
             union
             select m.artikel_id from public.beleg_positionen p
               join public.leistung_material m on m.leistung_id = p.leistung_id
              where p.beleg_id = $1
           )
      ) x
  $q$ into v using p_beleg;
  return v;
end $$;
revoke execute on function public.angebot_datenblaetter(uuid) from public, anon, authenticated;

/**
 * Darf ein Datenblatt öffentlich geladen werden? Nur wenn es zu einem Artikel
 * gehört, der in einem Angebot mit gültigem Link steht (Speicher `dateien`, Paket F).
 */
create function public.datenblatt_oeffentlich(p_name text) returns boolean
language plpgsql stable security definer set search_path = public as $$
declare
  v boolean;
begin
  if to_regclass('public.artikel_dateien') is null or p_name not like 'artikel/%' then return false; end if;
  execute $q$
    select exists (
      select 1 from public.artikel_dateien d
       where d.pfad = $1 and d.art = 'datenblatt'
         and exists (
           select 1 from public.angebot_links l
             join public.belege b on b.id = l.beleg_id and b.status in ('offen', 'angenommen')
             join public.beleg_positionen p on p.beleg_id = b.id
             left join public.leistung_material m on m.leistung_id = p.leistung_id
            where l.gesperrt_am is null
              and (p.artikel_id = d.artikel_id or m.artikel_id = d.artikel_id)))
  $q$ into v using p_name;
  return coalesce(v, false);
end $$;
revoke execute on function public.datenblatt_oeffentlich(text) from public;
grant execute on function public.datenblatt_oeffentlich(text) to anon, authenticated;

create policy datenblatt_oeffentlich_lesen on storage.objects for select to anon, authenticated
  using (bucket_id = 'dateien' and public.datenblatt_oeffentlich(name));

/**
 * Öffentlich: das Angebot hinter dem Token. Ohne gültigen Link nur der
 * Zustand und der Briefkopf. Interne Werte (EK, Minuten, Aufschläge) nie.
 * Das erste Öffnen durch den Kunden landet im Verlauf (der Chef zählt nicht).
 */
create function public.angebot_oeffentlich(p_token text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_link public.angebot_links;
  v_zustand text;
  b public.belege;
  f public.firma;
  v_annahme jsonb;
  v_projekt jsonb;
begin
  select * into f from public.firma limit 1;
  v_link := public.angebot_link_zu(p_token);
  v_zustand := public.angebot_link_zustand(v_link);
  -- Briefkopf wie auf dem PDF — keine Kalkulationswerte des Betriebs
  if v_zustand in ('unbekannt', 'gesperrt') then
    return jsonb_build_object('zustand', case when v_link.id is null then 'unbekannt' else 'gesperrt' end,
      'firma', jsonb_build_object('name', f.name, 'logo_pfad', f.logo_pfad, 'telefon', f.telefon, 'email', f.email));
  end if;
  select * into b from public.belege where id = v_link.beleg_id;

  if v_link.geoeffnet_am is null and not public.ist_chef() then
    update public.angebot_links set geoeffnet_am = now() where id = v_link.id;
    insert into public.angebot_verlauf (beleg_id, art, text) values (b.id, 'geoeffnet', 'Kunde hat den Link geöffnet');
  end if;

  select jsonb_build_object('name', v.name, 'zeit', v.created_at) into v_annahme
    from public.angebot_verlauf v where v.beleg_id = b.id and v.art = 'angenommen' order by v.created_at desc limit 1;
  select jsonb_build_object('nummer', p.nummer, 'name', p.name, 'strasse', p.strasse, 'plz', p.plz, 'ort', p.ort) into v_projekt
    from public.projekte p where p.id = b.projekt_id;

  return jsonb_build_object(
    'zustand', v_zustand,
    'stand', b.updated_at,
    'gilt_bis', coalesce(b.gueltig_bis, v_link.ablauf),
    'annahme', v_annahme,
    'projekt', v_projekt,
    'firma', jsonb_build_object(
      'name', f.name, 'zusatz', f.zusatz, 'inhaber', f.inhaber, 'strasse', f.strasse, 'plz', f.plz, 'ort', f.ort,
      'land', f.land, 'telefon', f.telefon, 'email', f.email, 'website', f.website, 'uid', f.uid,
      'firmenbuch', f.firmenbuch, 'bank_name', f.bank_name, 'iban', f.iban, 'bic', f.bic, 'logo_pfad', f.logo_pfad,
      'farbe', f.farbe, 'angebot_gueltig_tage', f.angebot_gueltig_tage, 'zahlungsziel_tage', f.zahlungsziel_tage,
      'kleinunternehmer', f.kleinunternehmer, 'fusszeile', f.fusszeile),
    'beleg', jsonb_build_object(
      'typ', b.typ, 'nummer', b.nummer, 'status', b.status, 'datum', b.datum, 'gueltig_bis', b.gueltig_bis,
      'leistung_von', b.leistung_von, 'leistung_bis', b.leistung_bis, 'faellig_am', b.faellig_am,
      'betreff', b.betreff, 'einleitung', b.einleitung, 'schlusstext', b.schlusstext,
      'ust_satz', b.ust_satz, 'reverse_charge', b.reverse_charge, 'kv_verbindlich', b.kv_verbindlich,
      'netto', b.netto, 'ust', b.ust, 'brutto', b.brutto,
      'empf_name', b.empf_name, 'empf_zusatz', b.empf_zusatz, 'empf_strasse', b.empf_strasse,
      'empf_plz', b.empf_plz, 'empf_ort', b.empf_ort, 'empf_uid', b.empf_uid),
    'positionen', coalesce((
      select jsonb_agg(jsonb_build_object('art', p.art, 'bezeichnung', p.bezeichnung, 'langtext', p.langtext,
               'menge', p.menge, 'einheit', p.einheit, 'einzelpreis', p.einzelpreis) order by p.pos)
        from public.beleg_positionen p where p.beleg_id = b.id), '[]'::jsonb),
    'datenblaetter', public.angebot_datenblaetter(b.id)
  );
end $$;
revoke execute on function public.angebot_oeffentlich(text) from public;
grant execute on function public.angebot_oeffentlich(text) to anon, authenticated;

/**
 * Öffentlich: Angebot annehmen. Einmal, nur offen und gültig, nur der Stand,
 * den der Kunde gesehen hat (`p_stand` = updated_at), mit Namen, Haken und
 * hochgeladener Unterschrift. Setzt den Status wie „Angenommen“ im Editor und
 * stellt das Projekt von „Angebot“ auf „In Arbeit“ (wie projektAktivieren).
 * Keine IP, kein Gerät — nur Name, Zeit (vom Server) und Unterschrift.
 */
create function public.angebot_annehmen(p_token text, p_name text, p_stand timestamptz, p_unterschrift text, p_akzeptiert boolean)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare
  v_link public.angebot_links;
  v_zustand text;
  b public.belege;
  v_name text := btrim(coalesce(p_name, ''));
begin
  v_link := public.angebot_link_zu(p_token);
  -- Sperre gegen zwei gleichzeitige Annahmen
  if v_link.id is not null then
    select * into b from public.belege where id = v_link.beleg_id for update;
  end if;
  v_zustand := public.angebot_link_zustand(v_link);
  if v_zustand = 'angenommen' then raise exception 'Dieses Angebot wurde bereits angenommen.'; end if;
  if v_zustand = 'abgelaufen' then raise exception 'Dieses Angebot ist abgelaufen — bitte melden Sie sich bei uns.'; end if;
  if v_zustand <> 'offen' then raise exception 'Dieses Angebot kann nicht mehr angenommen werden.'; end if;
  if p_stand is null or b.updated_at is distinct from p_stand then
    raise exception 'Das Angebot wurde inzwischen geändert — bitte die Seite neu laden und noch einmal prüfen.';
  end if;
  if length(v_name) < 3 or length(v_name) > 120 then raise exception 'Bitte Vor- und Nachnamen eintragen.'; end if;
  if not coalesce(p_akzeptiert, false) then raise exception 'Bitte bestätigen Sie das Angebot mit dem Haken.'; end if;
  if p_unterschrift is null or split_part(p_unterschrift, '/', 1) <> v_link.token
     or not exists (select 1 from storage.objects o where o.bucket_id = 'angebot-bestaetigung' and o.name = p_unterschrift) then
    raise exception 'Die Unterschrift fehlt — bitte noch einmal unterschreiben.';
  end if;

  update public.belege set status = 'angenommen' where id = b.id and status = 'offen';
  update public.projekte set status = 'aktiv' where id = b.projekt_id and status = 'angebot';
  insert into public.angebot_verlauf (beleg_id, art, name, unterschrift_pfad, betrag, text, gelesen)
  values (b.id, 'angenommen', v_name, p_unterschrift, b.brutto, 'Online angenommen', false);
  return jsonb_build_object('zustand', 'angenommen', 'zeit', now());
end $$;
revoke execute on function public.angebot_annehmen(text, text, timestamptz, text, boolean) from public;
grant execute on function public.angebot_annehmen(text, text, timestamptz, text, boolean) to anon, authenticated;

/** Öffentlich: Rückfrage zum Angebot (höchstens 20 je Link) */
create function public.angebot_rueckfrage(p_token text, p_name text, p_text text) returns void
language plpgsql security definer set search_path = public as $$
declare
  v_link public.angebot_links;
  v_name text := btrim(coalesce(p_name, ''));
  v_text text := btrim(coalesce(p_text, ''));
begin
  v_link := public.angebot_link_zu(p_token);
  if public.angebot_link_zustand(v_link) not in ('offen', 'abgelaufen') then
    raise exception 'Zu diesem Angebot sind keine Rückfragen mehr möglich — bitte rufen Sie uns an.';
  end if;
  if length(v_name) < 2 or length(v_name) > 120 then raise exception 'Bitte Ihren Namen eintragen.'; end if;
  if length(v_text) < 3 or length(v_text) > 2000 then raise exception 'Bitte Ihre Frage eintragen (höchstens 2000 Zeichen).'; end if;
  if (select count(*) from public.angebot_verlauf where beleg_id = v_link.beleg_id and art = 'rueckfrage') >= 20 then
    raise exception 'Zu viele Rückfragen — bitte rufen Sie uns an.';
  end if;
  insert into public.angebot_verlauf (beleg_id, art, name, text, gelesen) values (v_link.beleg_id, 'rueckfrage', v_name, v_text, false);
end $$;
revoke execute on function public.angebot_rueckfrage(text, text, text) from public;
grant execute on function public.angebot_rueckfrage(text, text, text) to anon, authenticated;

notify pgrst, 'reload schema';
