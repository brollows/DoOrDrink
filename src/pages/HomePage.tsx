import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Dices, Play, Radio, Timer, Trophy, Users } from 'lucide-react';
import { configured, createGame, joinGame, membership } from '../api';
import { Brand } from '../components/Brand';
import { ErrorMessage } from '../components/ErrorMessage';

type Mode = 'create' | 'join';

export default function HomePage() {
  const navigate = useNavigate();
  const saved = membership();
  // Opened from a QR code or shared link: /join/123456
  const linkedCode = useParams().code?.replace(/\D/g, '').slice(0, 6) || '';
  const [mode, setMode] = useState<Mode>(linkedCode ? 'join' : 'create');
  const [name, setName] = useState(saved?.name || '');
  const [code, setCode] = useState(linkedCode);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async (demo = false) => {
    if (!name.trim() && !demo) { setError('Skriv inn navnet ditt først.'); return; }
    if (mode === 'join' && !demo && !/^\d{6}$/.test(code)) { setError('Spillkoden må ha seks siffer.'); return; }
    setBusy(true); setError('');
    try {
      const game = mode === 'join' && !demo ? await joinGame(code, name) : await createGame(name, demo);
      navigate(`/game/${game.id}`);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <div className="home-layout">
      <header className="home-header">
        <Brand />
        <span className="pill"><Radio size={13} /> Spill sammen</span>
      </header>

      <main className="home-main">
        <section className="intro">
          <div className="eyebrow"><span className="lime-line" /> KVELDEN STARTER HER</div>
          <h1>Ta sjansen.<br />Ta <span>utfordringen.</span></h1>
          <p>Hvem kjenner vennene sine best?<br />Gjett utfallet. Samle poeng. Del ut slurker.</p>
          <div className="intro-chips">
            <span><Dices size={17} /> Tilfeldige utfordringer</span>
            <span><Trophy size={17} /> Ekte konkurranse</span>
          </div>
          <div className="example-card">
            <span className="example-icon"><Timer size={26} /></span>
            <div>
              <span className="eyebrow">EN SMAK AV SPILLET</span>
              <h3>Hvor nær ti sekunder kommer du?</h3>
              <p>Det finner dere ut på fasiten.</p>
            </div>
            <span className="example-number">10<span>s</span></span>
          </div>
        </section>

        <section className="entry-card">
          {saved && <Link className="resume" to={`/game/${saved.sessionId}`}><Play size={16} /> Fortsett som {saved.name}</Link>}
          <div className="tabs" role="tablist" aria-label="Velg hvordan du vil spille">
            <button role="tab" aria-selected={mode === 'create'} className={mode === 'create' ? 'active' : ''} onClick={() => setMode('create')}>Opprett spill</button>
            <button role="tab" aria-selected={mode === 'join'} className={mode === 'join' ? 'active' : ''} onClick={() => setMode('join')}>Bli med</button>
          </div>
          <h2>{mode === 'create' ? 'Samle gjengen.' : 'Bli med i gjengen.'}</h2>
          <p className="muted">{mode === 'create' ? 'Du blir vert og styrer spillet fra mobilen.' : 'Få den sekssifrede koden fra verten.'}</p>

          <form onSubmit={event => { event.preventDefault(); void submit(); }}>
            <label htmlFor="name">Hva heter du?</label>
            <input id="name" placeholder="Navnet ditt" autoComplete="given-name" maxLength={24} value={name} onChange={e => setName(e.target.value)} required autoFocus={Boolean(linkedCode)} />
            {mode === 'join' && <>
              <label htmlFor="code">Spillkode</label>
              <input id="code" className="code-input" placeholder="000000" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6}
                value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required />
            </>}
            <ErrorMessage message={error} />
            <button className="button primary wide" disabled={busy || !configured} type="submit">
              {busy ? 'Kobler til …' : mode === 'create' ? 'Opprett spill' : 'Bli med i spillet'}
              <Play size={17} fill="currentColor" />
            </button>
          </form>

          {!configured && <p className="setup-note">Nettspill er ikke koblet til ennå. Prøv spillflyten lokalt nedenfor.</p>}
          <button className="demo-link" disabled={busy} onClick={() => void submit(true)}><Dices size={17} /> Prøv et lokalt spill</button>
          <div className="entry-footer">
            <Users size={16} /><span>2–40 spillere</span><span className="separator">·</span><span>Ingen konto nødvendig</span>
          </div>
        </section>
      </main>

      <footer className="home-footer">
        <span>Din gjeng. Deres kveld.</span>
        <Link to="/rules">Slik spiller dere</Link>
        <Link to="/install">Legg til på iPhone</Link>
      </footer>
    </div>
  );
}
