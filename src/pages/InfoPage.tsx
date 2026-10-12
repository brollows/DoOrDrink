import { Link } from 'react-router-dom';
import { ChevronLeft } from 'lucide-react';
import { Brand } from '../components/Brand';

function InstallGuide() {
  return <>
    <ol className="rules">
      <li>Åpne DoOrDrink i Safari.</li>
      <li>Trykk på delingsknappen.</li>
      <li>Velg «Legg til på Hjem-skjermen» og trykk «Legg til».</li>
    </ol>
    <p className="muted">Bruk samme nettleser eller den installerte appen for å komme tilbake som samme spiller. Nettspill krever internett.</p>
  </>;
}

function Rules() {
  return <>
    <ol className="rules">
      <li>Verten oppretter spillet. Alle velger navn og blir med med en sekssifret kode.</li>
      <li>En tilfeldig spiller får oppgaven. Ta den for 5 poeng, eller send den videre. Den som tar en videresendt oppgave får 10 poeng.</li>
      <li>De andre gjetter før oppgaven utføres. Den som har oppgaven tar tiden selv.</li>
      <li>Fasiten avslører resultatene. Nærmest får mest poeng. Like resultater deler den beste plasseringen.</li>
      <li>De tre med flest poeng i runden får dele ut 3 slurker hver. De er immune. Førstemann til mølla velger mottaker.</li>
      <li>På «Perfekte 10» starter og stopper alle selv. Resultatet skjules til fasiten. 20 sekunder eller ingen fullføring gir 0 poeng.</li>
      <li>Verten styrer stegene og kan gå videre før alle er klare. Manglende svar gir 0 poeng.</li>
    </ol>
    <p className="muted">En individuell oppgave kan fullføres én gang per spiller. Fellesoppgaver bruker ikke opp en individuell tur. Spillet slutter når oppgavene er brukt, alle har fullført sin individuelle tur, eller verten avslutter. Spilldata slettes innen 24 timer.</p>
    <p className="muted">Ved lik plassering rundt topp tre får de som ble med først dele ut. Hvis alle tilgjengelige mottakere er valgt eller immune, kan verten gå videre.</p>
    <p className="muted">Poeng: sisteplass får 1. Opp til tredjeplass øker det med 1 per plass; andreplass får 2 mer enn tredjeplass og førsteplass får 3 mer enn andreplass. Ved fem som gjetter: 1–2–3–5–8.</p>
  </>;
}

export default function InfoPage({ install = false }: { install?: boolean }) {
  return (
    <main className="info-page">
      <Brand />
      <Link className="text-link" to="/"><ChevronLeft size={16} /> Tilbake</Link>
      <span className="eyebrow">{install ? 'ALLTID I LOMMA' : 'SLIK FUNGERER DET'}</span>
      <h1>{install ? 'Legg til på iPhone.' : 'Spillereglene.'}</h1>
      {install ? <InstallGuide /> : <Rules />}
    </main>
  );
}
