-- =====================================================================
--  Offene Posten und Mahnwesen
-- =====================================================================
--
-- Zahlungen je Rechnung (auch Teilzahlungen, Skonto, Ausbuchen). Ob eine
-- Rechnung „bezahlt“ ist, ergibt sich aus der Summe — ein Trigger setzt
-- Status und Zahldatum, die App setzt sie nie mehr selbst. So kann eine
-- Rechnung nicht „bezahlt“ heißen, auf der noch Geld fehlt.
--
-- Mahnungen: Stufe 1 = Zahlungserinnerung, 2 = 1. Mahnung, 3 = letzte
-- Mahnung. Je Rechnung und Stufe eine; sie halten fest, was beim Mahnen
-- offen war, und die Spesen und Zinsen, die draufstanden (das PDF wird
-- daraus jederzeit gleich neu erzeugt).
--
-- Nur der Chef.
-- =====================================================================

create table public.zahlungen (
  id uuid primary key default gen_random_uuid(),
  beleg_id uuid not null references public.belege(id) on delete cascade,
  datum date not null default current_date,
  betrag numeric(12,2) not null check (betrag <> 0 and abs(betrag) < 10000000),
  -- zahlung = Geld eingegangen, skonto = Abzug akzeptiert, ausbuchung = uneinbringlich/Kulanz
  art text not null default 'zahlung' check (art in ('zahlung','skonto','ausbuchung')),
  notiz text,
  erstellt_von uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);
create index on public.zahlungen (beleg_id);
create index on public.zahlungen (datum desc);

create table public.mahnungen (
  id uuid primary key default gen_random_uuid(),
  beleg_id uuid not null references public.belege(id) on delete cascade,
  stufe int not null check (stufe between 1 and 3),
  datum date not null default current_date,
  frist_bis date not null,
  -- offen = Rechnungsbetrag minus Zahlungen am Mahntag
  offen numeric(12,2) not null check (offen > 0),
  spesen numeric(12,2) not null default 0 check (spesen >= 0),
  zinsen numeric(12,2) not null default 0 check (zinsen >= 0),
  erstellt_von uuid default auth.uid() references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (beleg_id, stufe)
);
create index on public.mahnungen (beleg_id);

-- Einstellungen fürs Mahnen: Frist, Spesen je Stufe, Verzugszinsen p. a.
-- (Verbraucher 4 % nach § 1000 ABGB, Unternehmer 9,2 % über dem Basiszinssatz)
alter table public.firma
  add column mahn_frist_tage int not null default 10 check (mahn_frist_tage between 1 and 90),
  add column mahn_spesen jsonb not null default '[0, 10, 20]'::jsonb
    check (jsonb_typeof(mahn_spesen) = 'array' and jsonb_array_length(mahn_spesen) = 3),
  add column verzugszinsen numeric(5,2) not null default 4 check (verzugszinsen between 0 and 30);

-- Nur auf fertige Rechnungen, die nicht storniert sind
create function public.zahlung_pruefen() returns trigger
language plpgsql set search_path = public as $$
declare
  b public.belege;
begin
  select * into b from public.belege where id = new.beleg_id;
  if b.id is null or b.typ <> 'rechnung' or b.status not in ('offen','bezahlt') then
    raise exception 'Zahlungen gibt es nur auf fertigen, nicht stornierten Rechnungen.';
  end if;
  return new;
end $$;
create trigger zahlungen_pruefen before insert or update on public.zahlungen
  for each row execute function public.zahlung_pruefen();

-- Summe der Zahlungen → Status „bezahlt“ (ab dem letzten Cent) oder „offen“
create function public.zahlungen_status() returns trigger
language plpgsql security definer set search_path = public as $$
declare
  v_beleg uuid := coalesce(new.beleg_id, old.beleg_id);
  v_summe numeric;
  v_letzte date;
  b public.belege;
begin
  select * into b from public.belege where id = v_beleg for update;
  if b.id is null or b.status not in ('offen','bezahlt') then
    return null;
  end if;
  select coalesce(sum(betrag), 0), max(datum) into v_summe, v_letzte from public.zahlungen where beleg_id = v_beleg;
  if b.brutto > 0 and v_summe >= b.brutto then
    update public.belege set status = 'bezahlt', bezahlt_am = v_letzte where id = v_beleg
      and (status <> 'bezahlt' or bezahlt_am is distinct from v_letzte);
  else
    update public.belege set status = 'offen', bezahlt_am = null where id = v_beleg and status <> 'offen';
  end if;
  return null;
end $$;
create trigger zahlungen_status after insert or update or delete on public.zahlungen
  for each row execute function public.zahlungen_status();

alter table public.zahlungen enable row level security;
alter table public.mahnungen enable row level security;
create policy zahlungen_chef on public.zahlungen for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());
create policy mahnungen_chef on public.mahnungen for all to authenticated
  using (public.ist_chef()) with check (public.ist_chef());

-- Bisher „bezahlt“ markierte Rechnungen bekommen ihre Zahlung (voller Betrag
-- am Zahldatum) — der Trigger lässt den Status dabei, wie er ist
insert into public.zahlungen (beleg_id, datum, betrag, notiz, erstellt_von)
select id, coalesce(bezahlt_am, datum), brutto, 'Übernommen: als bezahlt markiert', null
  from public.belege
 where typ = 'rechnung' and status = 'bezahlt' and brutto > 0;

notify pgrst, 'reload schema';
