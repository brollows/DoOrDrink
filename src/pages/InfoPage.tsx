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
      <li>Oppgavene kommer i tilfeldig rekkefølge. Noen er utfordringer for én spiller, andre spiller alle sammen.</li>
      <li>I en utfordring får en tilfeldig spiller oppgaven. Ta den for 5 poeng, eller send den videre. Den som tar en videresendt oppgave får 10 poeng.</li>
      <li>De andre gjetter før oppgaven utføres. Den som har oppgaven tar tiden eller svarer selv i appen.</li>
      <li>Fasiten avslører resultatene. Nærmest får mest poeng. Like resultater deler den beste plasseringen.</li>
      <li>De beste i runden deler ut 3 slurker hver til ulike mottakere og er selv immune. Med 2 spillere deler ingen ut, med 3–4 deler én ut, med 5–6 deler to ut, og med 7 eller flere deler tre ut. Tilskuere teller ikke. I spill der taperne drikker automatisk, deles ingen ekstra slurker ut.</li>
      <li>På «Perfekte 10» starter og stopper alle selv. Resultatet skjules til fasiten. 20 sekunder eller ingen fullføring gir 0 poeng.</li>
      <li>I «Stein, saks, papir» får alle en tilfeldig motstander, eller maskinen ved oddetall. Uavgjort betyr nytt valg. Vinneren får 3 poeng, og taperen tar 3 slurker.</li>
      <li>I «Topp 5» har alle 60 sekunder på å skrive 3 enkeltord om temaet. De fem ordene flest skrev vises, og du får 2 poeng for hvert av dine ord på lista. Store og små bokstaver spiller ingen rolle, og for ord på 7 bokstaver eller mer teller én skrivefeil som samme ord.</li>
      <li>I «Mim det!» velger den som har oppgaven ett ord og mimer det. De andre har 120 sekunder på å gjette, så mange ganger de vil. Med 60 sekunder igjen vises antall bokstaver, og med 30 sekunder igjen første bokstav. Raskest får mest poeng, og den som mimer får 5 poeng (10 hvis oppgaven ble sendt videre).</li>
      <li>I «Samme bølgelengde» trekkes én spiller ut som fasit. Alle svarer på 5 spørsmål med to alternativer. Svarer du ulikt enn fasiten, er du ute. Du får 1 poeng for hvert likt svar, og fasiten får 1 poeng for hver spiller som svarte likt på alle 5.</li>
      <li>I «Nest mest» velger alle et tall fra 0 til 100. Høyest tar 5 slurker, og nest høyest vinner.</li>
      <li>I «Ville du helst» velger alle ett av to alternativer. Flertallet får 3 poeng, og de i mindretall tar 3 slurker. Ved helt likt skjer ingenting.</li>
      <li>Verten styrer stegene og kan gå videre før alle er klare. Manglende svar gir 0 poeng.</li>
    </ol>
    <p className="muted">Ved start trekkes opptil én utfordringsrunde per aktiv spiller, begrenset av utfordringene som finnes. Alle fellesspill beholdes. Hver spiller fullfører maks én utfordring. «Bånn i bøtta», «Mim det!» og «Samme bølgelengde» kan trekkes to ganger, med en ny spiller hver gang. Rundevisningen viser hvor mange runder som gjenstår. Sammenlagt poengtavle vises når spillet er ferdig eller verten avslutter tidlig. Spilldata slettes innen 24 timer.</p>
    <p className="muted">Ved lik poengsum rundt grensen for å dele ut slurker får de som ble med først dele ut. Bare spillere med poeng i runden kan dele ut.</p>
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
