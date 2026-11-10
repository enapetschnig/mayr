/**
 * SEPA-Überweisungsdatei (pain.001.001.03) für die freigegebenen
 * Eingangsrechnungen — ins Online-Banking hochladen, dort unterschreiben.
 * Getestet in sepa.test.ts.
 */

export type Ueberweisung = { id: string; empfaenger: string; iban: string; betrag: number; zweck: string };
export type Auftraggeber = { name: string; iban: string; bic?: string | null };

/** IBAN ohne Leerzeichen, groß; Prüfziffer nach ISO 7064 (mod 97) */
export function ibanPruefen(roh: string | null | undefined): string | null {
  const iban = (roh ?? "").replace(/\s+/g, "").toUpperCase();
  if (!/^[A-Z]{2}\d{2}[A-Z0-9]{10,30}$/.test(iban)) return null;
  const umgestellt = iban.slice(4) + iban.slice(0, 4);
  let rest = 0;
  for (const z of umgestellt) {
    const wert = z >= "A" && z <= "Z" ? String(z.charCodeAt(0) - 55) : z;
    for (const ziffer of wert) rest = (rest * 10 + Number(ziffer)) % 97;
  }
  return rest === 1 ? iban : null;
}

const xml = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&apos;");
/** SEPA kennt nur einen kleinen Zeichensatz — Umlaute umschreiben, Rest weg */
export function sepaText(s: string, laenge: number): string {
  const t = s.replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/Ä/g, "Ae").replace(/Ö/g, "Oe").replace(/Ü/g, "Ue").replace(/ß/g, "ss")
    .replace(/[^A-Za-z0-9 /\-?:().,'+]/g, " ").replace(/\s+/g, " ").trim();
  return t.slice(0, laenge);
}
const betragText = (n: number) => (Math.round(n * 100) / 100).toFixed(2);

export function sepaXml(von: Auftraggeber, liste: Ueberweisung[], ausfuehrung: string, jetzt = new Date()): string {
  const summe = liste.reduce((s, u) => s + Math.round(u.betrag * 100), 0) / 100;
  const msgId = `ER-${jetzt.toISOString().replace(/\D/g, "").slice(0, 14)}`;
  const posten = liste.map((u, i) => `
      <CdtTrfTxInf>
        <PmtId><EndToEndId>${xml(sepaText(`${msgId}-${i + 1}`, 35))}</EndToEndId></PmtId>
        <Amt><InstdAmt Ccy="EUR">${betragText(u.betrag)}</InstdAmt></Amt>
        <Cdtr><Nm>${xml(sepaText(u.empfaenger, 70))}</Nm></Cdtr>
        <CdtrAcct><Id><IBAN>${u.iban}</IBAN></Id></CdtrAcct>
        <RmtInf><Ustrd>${xml(sepaText(u.zweck, 140))}</Ustrd></RmtInf>
      </CdtTrfTxInf>`).join("");
  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.03">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${msgId}</MsgId>
      <CreDtTm>${jetzt.toISOString().slice(0, 19)}</CreDtTm>
      <NbOfTxs>${liste.length}</NbOfTxs>
      <CtrlSum>${betragText(summe)}</CtrlSum>
      <InitgPty><Nm>${xml(sepaText(von.name, 70))}</Nm></InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${msgId}-1</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${liste.length}</NbOfTxs>
      <CtrlSum>${betragText(summe)}</CtrlSum>
      <PmtTpInf><SvcLvl><Cd>SEPA</Cd></SvcLvl></PmtTpInf>
      <ReqdExctnDt>${ausfuehrung}</ReqdExctnDt>
      <Dbtr><Nm>${xml(sepaText(von.name, 70))}</Nm></Dbtr>
      <DbtrAcct><Id><IBAN>${von.iban}</IBAN></Id></DbtrAcct>
      <DbtrAgt><FinInstnId>${von.bic ? `<BIC>${xml(von.bic.replace(/\s+/g, "").toUpperCase())}</BIC>` : "<Othr><Id>NOTPROVIDED</Id></Othr>"}</FinInstnId></DbtrAgt>
      <ChrgBr>SLEV</ChrgBr>${posten}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}
