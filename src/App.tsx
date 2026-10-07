import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, Navigate, Route, Routes, useNavigate, useParams } from 'react-router-dom';
import { Check, ChevronLeft, Copy, Crown, Dices, Flag, Hourglass, Play, Radio, ShieldCheck, Timer, Trophy, Users, Wine, WifiOff, X } from 'lucide-react';
import { configured, createGame, fetchGame, joinGame, leaveDevice, membership, performAction, watchGame } from './api';
import { formatTime, phaseNames, roundPhases, tasks, type Game, type Player, type Response } from './model';

function Brand() {
  return <Link className="brand" to="/" aria-label="DoOrDrink, forsiden"><span className="brand-mark">D.</span><span>Do<span className="brand-or">Or</span>Drink<span className="brand-dot">.</span></span></Link>;
}
function Avatar({ player, small = false }: { player: Player; small?: boolean }) {
  const color = [...player.id].reduce((a, c) => a + c.charCodeAt(0), 0) % 5;
  return <span className={`avatar color-${color} ${small ? 'small' : ''}`} aria-hidden="true">{player.name.slice(0, 1).toUpperCase()}</span>;
}
function ErrorMessage({ message }: { message: string }) {
  return message ? <div className="error" role="alert">{message}</div> : null;
}
function Home() {
  const navigate = useNavigate();
  const saved = membership();
  const [mode, setMode] = useState<'create' | 'join'>('create');
  const [name, setName] = useState(saved?.name || '');
  const [code, setCode] = useState('');
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
  return <div className="home-layout">
    <header className="home-header"><Brand /><span className="pill"><Radio size={13} /> Spill sammen</span></header>
    <main className="home-main">
      <section className="intro">
        <div className="eyebrow"><span className="lime-line" /> KVELDEN STARTER HER</div>
        <h1>Ta sjansen.<br />Ta <span>utfordringen.</span></h1>
        <p>Hvem kjenner vennene sine best?<br />Gjett utfallet. Samle poeng. Del ut slurker.</p>
        <div className="intro-chips"><span><Dices size={17} /> Tilfeldige utfordringer</span><span><Trophy size={17} /> Ekte konkurranse</span></div>
        <div className="example-card"><span className="example-icon"><Timer size={26} /></span><div><span className="eyebrow">EN SMAK AV SPILLET</span><h3>Hvor nær ti sekunder kommer du?</h3><p>Det finner dere ut på fasiten.</p></div><span className="example-number">10<span>s</span></span></div>
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
          <label htmlFor="name">Hva heter du?</label><input id="name" placeholder="Navnet ditt" autoComplete="given-name" maxLength={24} value={name} onChange={e => setName(e.target.value)} required />
          {mode === 'join' && <><label htmlFor="code">Spillkode</label><input id="code" className="code-input" placeholder="000000" inputMode="numeric" autoComplete="off" pattern="[0-9]{6}" maxLength={6} value={code} onChange={e => setCode(e.target.value.replace(/\D/g, ''))} required /></>}
          <ErrorMessage message={error} />
          <button className="button primary wide" disabled={busy || !configured} type="submit">{busy ? 'Kobler til …' : mode === 'create' ? 'Opprett spill' : 'Bli med i spillet'}<Play size={17} fill="currentColor" /></button>
        </form>
        {!configured && <p className="setup-note">Nettspill er ikke koblet til ennå. Prøv spillflyten lokalt nedenfor.</p>}
        <button className="demo-link" disabled={busy} onClick={() => void submit(true)}><Dices size={17} /> Prøv et lokalt spill</button>
        <div className="entry-footer"><Users size={16} /><span>2–40 spillere</span><span className="separator">·</span><span>Ingen konto nødvendig</span></div>
      </section>
    </main>
    <footer className="home-footer"><span>Din gjeng. Deres kveld.</span><Link to="/rules">Slik spiller dere</Link><Link to="/install">Legg til på iPhone</Link></footer>
  </div>;
}

function Information({ install = false }: { install?: boolean }) {
  return <main className="info-page"><Brand /><Link className="text-link" to="/"><ChevronLeft size={16} /> Tilbake</Link>
    <span className="eyebrow">{install ? 'ALLTID I LOMMA' : 'SLIK FUNGERER DET'}</span>
    <h1>{install ? 'Legg til på iPhone.' : 'Spillereglene.'}</h1>
    {install ? <><ol className="rules"><li>Åpne DoOrDrink i Safari.</li><li>Trykk på delingsknappen.</li><li>Velg «Legg til på Hjem-skjermen» og trykk «Legg til».</li></ol><p className="muted">Bruk samme nettleser eller den installerte appen for å komme tilbake som samme spiller. Nettspill krever internett.</p></>
      : <><ol className="rules"><li>Verten oppretter spillet. Alle velger navn og blir med med en sekssifret kode.</li><li>En tilfeldig spiller får oppgaven. Ta den for 5 poeng, eller send den videre. Den som tar en videresendt oppgave får 10 poeng.</li><li>De andre gjetter før oppgaven utføres. Den som har oppgaven tar tiden selv.</li><li>Fasiten avslører resultatene. Nærmest får mest poeng. Like resultater deler den beste plasseringen.</li><li>De tre med flest poeng i runden får dele ut 3 slurker hver. De er immune. Førstemann til mølla velger mottaker.</li><li>På «Perfekte 10» starter og stopper alle selv. Resultatet skjules til fasiten. 20 sekunder eller ingen fullføring gir 0 poeng.</li><li>Verten styrer stegene og kan gå videre før alle er klare. Manglende svar gir 0 poeng.</li></ol><p className="muted">En individuell oppgave kan fullføres én gang per spiller. Fellesoppgaver bruker ikke opp en individuell tur. Spillet slutter når oppgavene er brukt, alle har fullført sin individuelle tur, eller verten avslutter. Spilldata slettes innen 24 timer.</p><p className="muted">Ved lik plassering rundt topp tre får de som ble med først dele ut. Hvis alle tilgjengelige mottakere er valgt eller immune, kan verten gå videre.</p><p className="muted">Poeng: sisteplass får 1. Opp til tredjeplass øker det med 1 per plass; andreplass får 2 mer enn tredjeplass og førsteplass får 3 mer enn andreplass. Ved fem som gjetter: 1–2–3–5–8.</p></>}
  </main>;
}

function Stopwatch({ game, response, busy, act }: { game: Game; response: Response; busy: boolean; act: (action: string, payload?: Record<string, unknown>) => Promise<boolean> }) {
  const round = game.round!;
  const task = round.task || tasks[round.taskId];
  const timerKey = `do-or-drink-timer:${round.id}:${game.meId}`;
  const [localStart, setLocalStart] = useState<number | null>(() => {
    const saved = localStorage.getItem(timerKey);
    return saved ? Number(saved) : response.startedAt ? Date.parse(response.startedAt) : null;
  });
  const startRef = useRef(localStart);
  const [elapsed, setElapsed] = useState(0);
  const [stopped, setStopped] = useState(response.finished);
  const stopRef = useRef(response.finished);
  const [failedStop, setFailedStop] = useState<number | null>(null);
  const stop = useCallback(async (value: number) => {
    if (stopRef.current) return;
    stopRef.current = true; setStopped(true);
    const success = await act('timer_stop', { value });
    if (!success) setFailedStop(value);
    else localStorage.removeItem(timerKey);
  }, [act, timerKey]);
  useEffect(() => {
    if (response.finished) { stopRef.current = true; setStopped(true); setFailedStop(null); localStorage.removeItem(timerKey); }
    if (response.startedAt && startRef.current === null) {
      const value = Date.parse(response.startedAt); startRef.current = value; setLocalStart(value);
    }
  }, [response.finished, response.startedAt, timerKey]);
  useEffect(() => {
    if (localStart === null || stopped) return;
    const update = () => {
      const value = Math.max(0, (Date.now() - localStart) / 1000);
      setElapsed(value);
      if (task.answer.timeout && value >= task.answer.timeout) void stop(task.answer.timeout);
    };
    update();
    const interval = window.setInterval(update, 25);
    return () => window.clearInterval(interval);
  }, [localStart, stopped, task.answer.timeout, stop]);
  const start = async () => {
    if (startRef.current !== null || busy) return;
    const value = Date.now(); startRef.current = value; setLocalStart(value); localStorage.setItem(timerKey, String(value));
    if (!await act('timer_start')) {
      startRef.current = null; setLocalStart(null); localStorage.removeItem(timerKey);
    }
  };
  if (stopped) return <div className="timer-done"><span className="large-icon"><Check size={38} /></span><h2>{failedStop !== null ? 'Tiden må lagres' : 'Ferdig!'}</h2>
    <p className="muted">{task.kind === 'everyone' ? 'Resultatet ditt avsløres på fasiten.' : 'De andre ser tiden når verten viser fasiten.'}</p>
    {task.kind === 'individual' && response.actual !== null && <div className="private-result"><span>Bare du ser dette</span><strong>{formatTime(response.actual)} s</strong></div>}
    {failedStop !== null && <button className="button secondary" disabled={busy} onClick={async () => {
      if (await act('timer_stop', { value: failedStop })) { setFailedStop(null); localStorage.removeItem(timerKey); }
    }}>Prøv å lagre igjen</button>}
  </div>;
  return <div className="stopwatch"><span className="eyebrow">{task.kind === 'everyone' ? 'SIKT PÅ 10,00 SEKUNDER' : 'DIN STOPPEKLOKKE'}</span>
    <div className={`timer-value ${localStart !== null ? 'running' : ''}`}>{formatTime(elapsed)}<span>sekunder</span></div>
    <button className={`button timer-button ${localStart === null ? 'primary' : 'stop'}`} disabled={busy || round.awarded}
      onClick={() => localStart === null ? void start() : void stop(Math.max(0, (Date.now() - localStart) / 1000))}>
      {localStart === null ? <Play size={22} fill="currentColor" /> : <span className="stop-square" />}{localStart === null ? 'Start timer' : 'Stopp'}</button>
    <p className="muted">{task.kind === 'everyone' ? 'Timeren forsvinner når du stopper. Etter 20 sekunder blir det 0 poeng.' : 'Trykk start når du begynner, og stopp når du er ferdig.'}</p>
    {round.awarded && <p className="muted">Runden er allerede avsluttet. Resultatet er låst.</p>}
  </div>;
}

function Ranking({ game, total = false }: { game: Game; total?: boolean }) {
  const round = game.round;
  const task = round ? round.task || tasks[round.taskId] : null;
  const rows = [...game.players].sort((a, b) => total ? b.score - a.score : (round?.responses.find(q => q.playerId === b.id)?.points || 0) - (round?.responses.find(q => q.playerId === a.id)?.points || 0));
  return <div className="ranking" role="region" aria-label={total ? 'Sammenlagt' : 'Rundens resultater'} tabIndex={0}>{rows.map((p, index) => {
    const q = round?.responses.find(q => q.playerId === p.id);
    const rank = total ? rows.findIndex(other => other.score === p.score) + 1 : q?.points ? rows.findIndex(other => round?.responses.find(response => response.playerId === other.id)?.points === q.points) + 1 : null;
    return <div className={`ranking-row ${p.id === game.meId ? 'is-me' : ''}`} key={p.id}>
      <span className={`rank ${index < 3 ? 'podium' : ''}`}>{rank || '–'}</span><Avatar player={p} small />
      <div className="ranking-name"><strong>{p.name}{p.id === game.meId && <span> (deg)</span>}</strong><span>{total ? (p.completed ? 'Oppgave fullført' : '') : p.id === round?.performerId ? 'Utførte oppgaven' : task?.kind === 'individual' ? q?.guess !== null && q?.guess !== undefined ? `Gjettet ${formatTime(q.guess)} ${task.answer.unit}` : 'Ikke svart' : q?.actual !== null && q?.actual !== undefined ? q.actual >= (task?.answer.timeout || Infinity) ? 'Tiden gikk ut' : `${formatTime(q.actual)} s · ${formatTime(Math.abs(q.actual - (task?.answer.target || 0)))} s unna` : 'Ikke fullført'}</span></div>
      <span className="points">{total ? p.score : `+${q?.points || 0}`}<small>poeng</small></span>
    </div>;
  })}</div>;
}

function GameScreen() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const [game, setGame] = useState<Game | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [guess, setGuess] = useState(30);
  const [manualResult, setManualResult] = useState('');
  const [copied, setCopied] = useState(false);
  const [offline, setOffline] = useState(!navigator.onLine);
  const [confirm, setConfirm] = useState<'next' | 'end' | null>(null);
  const actor = useRef(membership()?.playerId);
  const inFlight = useRef(false);
  const sequence = useRef(0);
  const alive = useRef(true);
  const refresh = useCallback(async () => {
    const request = ++sequence.current;
    try {
      const value = await fetchGame(sessionId, actor.current);
      if (alive.current && request === sequence.current) { setGame(value); setError(''); }
    } catch (error) { if (alive.current && request === sequence.current) setError((error as Error).message); }
  }, [sessionId]);
  useEffect(() => {
    alive.current = true;
    void refresh();
    const cleanup = watchGame(sessionId, () => { if (!inFlight.current) void refresh(); });
    const interval = window.setInterval(() => { if (!inFlight.current && document.visibilityState === 'visible') void refresh(); }, 4000);
    const wake = () => { setOffline(!navigator.onLine); if (!inFlight.current) void refresh(); };
    window.addEventListener('online', wake); window.addEventListener('offline', wake); document.addEventListener('visibilitychange', wake);
    return () => { alive.current = false; cleanup(); window.clearInterval(interval); window.removeEventListener('online', wake); window.removeEventListener('offline', wake); document.removeEventListener('visibilitychange', wake); };
  }, [refresh, sessionId]);
  useEffect(() => {
    const answer = game?.round ? (game.round.task || tasks[game.round.taskId]).answer : null;
    setGuess(answer ? (answer.min + answer.max) / 2 : 30);
    setManualResult(''); setConfirm(null);
  }, [game?.round?.id, game?.round?.phase]);
  const act = useCallback(async (action: string, payload: Record<string, unknown> = {}) => {
    if (!game || inFlight.current || !navigator.onLine) return false;
    inFlight.current = true; ++sequence.current; setBusy(true); setError('');
    try {
      const value = await performAction(game, action, payload);
      ++sequence.current;
      if (alive.current) setGame(value);
      setConfirm(null);
      return true;
    } catch (error) { if (alive.current) setError((error as Error).message); return false; }
    finally { inFlight.current = false; if (alive.current) setBusy(false); }
  }, [game]);
  if (!game) return <main className="loading-page"><Brand /><Hourglass size={35} /><h2>{error ? 'Kunne ikke åpne spillet' : 'Henter spillet …'}</h2><ErrorMessage message={error} /><Link className="button secondary" to="/">Til forsiden</Link></main>;
  const me = game.players.find(p => p.id === game.meId)!;
  const host = game.hostId === game.meId;
  const round = game.round;
  const task = round ? round.task || tasks[round.taskId] : null;
  const performer = game.players.find(p => p.id === round?.performerId);
  const myResponse = round?.responses.find(q => q.playerId === game.meId);
  const expected = round?.responses.filter(q => task?.kind !== 'individual' || q.playerId !== round.performerId) || [];
  const submitted = expected.filter(q => q.submitted);
  const missing = expected.filter(q => !q.submitted).map(q => game.players.find(p => p.id === q.playerId)!);
  const canMonitor = host && (round?.phase !== 'guessing' || Boolean(myResponse?.submitted) || me.id === round.performerId);
  const winners = round?.winners.map(id => game.players.find(p => p.id === id)!) || [];
  const recipient = round?.allocations.find(a => a.recipientId === game.meId);
  const recipients = game.players.filter(p => !round?.winners.includes(p.id) && !round?.allocations.some(a => a.recipientId === p.id));
  const myAllocation = round?.allocations.find(a => a.giverId === game.meId);
  let ready = true, readyCount = 0, readyTotal = 0;
  if (round?.phase === 'assignment') { ready = round.accepted; readyCount = +ready; readyTotal = 1; }
  if (round?.phase === 'guessing') { readyCount = submitted.length; readyTotal = expected.length; ready = readyCount === readyTotal; }
  if (round?.phase === 'performing') {
    const relevant = round.responses.filter(q => !round.performerId || q.playerId === round.performerId);
    readyCount = relevant.filter(q => q.finished).length; readyTotal = relevant.length; ready = readyCount === readyTotal;
  }
  if (round?.phase === 'sips') { readyCount = round.allocations.length; readyTotal = winners.length; ready = readyCount === readyTotal || !recipients.length; }
  const next = () => { if (!ready && !round?.awarded) setConfirm('next'); else void act('next'); };
  return <div className={`game-layout status-${game.status} ${recipient && round?.phase === 'sips' && game.status === 'playing' ? 'drink-mode' : ''}`}>
    <header className="game-header"><Brand /><div className="session-label"><span>SPILLKODE</span><strong>{game.code}</strong></div><div className="self-label"><Avatar player={me} small /><span>{me.name}{host && <small>Vert</small>}</span></div></header>
    {game.id === 'demo' && <div className="demo-bar"><Dices size={16} /><span>Lokalt prøvespill</span><label htmlFor="demo-player">Se som:</label><select id="demo-player" value={game.meId} onChange={async e => { actor.current = e.target.value; ++sequence.current; setGame(await fetchGame('demo', actor.current)); }}>
      {game.players.map(p => <option key={p.id} value={p.id}>{p.name}{p.id === game.hostId ? ' (vert)' : ''}</option>)}</select></div>}
    {offline && <div className="offline" role="status"><WifiOff size={16} /> Ingen forbindelse. Kobler til når nettet er tilbake.</div>}
    <ErrorMessage message={error} />
    {game.status === 'lobby' ? <main className="lobby-main">
      <section className="lobby-intro"><span className="eyebrow">VENTEROMMET</span><h1>Er alle med?</h1><p className="muted">Del koden med gjengen. Verten starter når dere er klare.</p>
        <button className="join-code" aria-label="Kopier spillkode" onClick={async () => { try { await navigator.clipboard.writeText(game.code); setCopied(true); window.setTimeout(() => setCopied(false), 2000); } catch { setError('Kunne ikke kopiere. Del koden som står på skjermen.'); } }}><span>{game.code}</span>{copied ? <Check size={22} /> : <Copy size={22} />}</button>
        <div className="round-summary"><div><Dices size={20} /><strong>2</strong><span>oppgaver</span></div><div><Users size={20} /><strong>{game.players.length}</strong><span>spillere</span></div><div><Trophy size={20} /><strong>1</strong><span>vinner</span></div></div>
        {host ? <button className="button primary wide" disabled={busy || offline || game.players.length < 2} onClick={() => void act('start')}><Play size={19} fill="currentColor" /> Start spillet</button> : <div className="waiting"><Hourglass size={19} /> Venter på at verten starter</div>}
      </section>
      <section className="players-card"><div className="section-title"><h2>Gjengen</h2><span className="pill">{game.players.length} spillere</span></div><div className="player-list">{game.players.map(p => <div className="player-row" key={p.id}><Avatar player={p} /><strong>{p.name}{p.id === game.meId && <span className="muted"> (deg)</span>}</strong>{p.id === game.hostId ? <span className="host-badge"><Crown size={14} /> Vert</span> : <Check className="lime" size={19} />}</div>)}</div></section>
    </main> : game.status === 'finished' ? <main className="finished-main"><span className="large-icon"><Trophy size={40} /></span><span className="eyebrow">KVELDENS RESULTAT</span><h1>{[...game.players].sort((a,b) => b.score-a.score)[0]?.name} {game.players.filter(p => p.score === Math.max(...game.players.map(p => p.score))).length > 1 ? 'deler seieren!' : 'vinner!'}</h1><Ranking game={game} total /><button className="button secondary wide" onClick={() => { leaveDevice(); navigate('/'); }}>Til forsiden</button></main>
    : round && task && myResponse && <>
      <div className="round-top"><span className="eyebrow">RUNDE {round.number} / {game.taskCount}</span><span className="pill">{task.kind === 'everyone' ? <Users size={14} /> : <Dices size={14} />}{task.kind === 'everyone' ? 'Alle spiller' : 'Én tar utfordringen'}</span></div>
      <nav className="stepper" aria-label="Spillsteg">{roundPhases(round.taskId, task).map((phase, index) => <div key={phase} className={phase === round.phase ? 'current' : roundPhases(round.taskId, task).indexOf(round.phase) > index ? 'complete' : ''}><span>{index + 1}</span><small>{phaseNames[phase]}</small></div>)}</nav>
      <main className="round-main">
        <section className={`round-card phase-${round.phase}`}>
          {round.phase === 'assignment' && <><span className="task-icon">{task.kind === 'everyone' ? <Timer size={30} /> : <Wine size={30} />}</span><span className="eyebrow">{performer ? `${performer.name.toUpperCase()} SIN TUR` : 'EN UTFORDRING FOR ALLE'}</span><h1>{task.title}</h1><p className="task-description">{task.description}</p>
            {performer && <div className="performer-card"><Avatar player={performer} /><div><strong>{performer.name}</strong><span>{round.transferred ? '+10 poeng for å ta over' : '+5 poeng for å fullføre'}</span></div></div>}
            {round.accepted ? <div className="waiting"><Check size={20} /> {task.kind === 'everyone' ? 'Alle er med på denne oppgaven' : `${performer?.name} tar utfordringen`}</div> : me.id === round.performerId ? <div className="choice-buttons"><button className="button primary wide" disabled={busy || offline} onClick={() => void act('accept')}>Jeg tar den! <Check size={19} /></button><button className="button secondary wide" disabled={busy || offline} onClick={() => void act('decline')}><Dices size={19} /> Gi til en tilfeldig spiller</button></div> : <div className="waiting"><Hourglass size={19} /> Venter på {performer?.name}</div>}
          </>}
          {round.phase === 'guessing' && <>{!myResponse.submitted && <><span className="eyebrow">HVA TROR DU?</span><h1>{task.answer.method === 'stopwatch' ? 'Hvor rask er' : 'Gjett resultatet til'}<br /><span className="lime">{performer?.name}?</span></h1><p className="task-description">{task.id === 'beer' ? `Hvor mange sekunder bruker ${performer?.name} på å drikke ølen?` : `Oppgi ditt tips i ${task.answer.unit}.`}</p></>}
            {me.id === round.performerId ? <div className="waiting"><Hourglass size={20} /> De andre gjetter. Snart er det din tur.</div> : myResponse.submitted ? <div className="answer-saved"><span className="large-icon"><Check size={30} /></span><h2>Svaret er levert</h2><strong>{formatTime(myResponse.guess!)} <small>{task.answer.unit}</small></strong><p className="muted">Venter på at verten går videre.</p></div> : <div className="guess-controls"><output htmlFor="guess-slider" className="guess-value">{guess.toLocaleString('nb-NO')}<span>{task.answer.unit}</span></output><input id="guess-slider" aria-label={`Gjett antall ${task.answer.unit}`} type="range" min={task.answer.min} max={task.answer.max} step="0.1" value={guess} disabled={round.awarded} style={{ '--range-progress': `${(guess - task.answer.min) / (task.answer.max - task.answer.min) * 100}%` } as React.CSSProperties} onChange={e => setGuess(Number(e.target.value))} /><div className="range-labels"><span>{task.answer.min} {task.answer.unit}</span><span>{task.answer.max} {task.answer.unit}</span></div><button className="button primary wide" disabled={busy || offline || round.awarded} onClick={() => void act('guess', { value: guess })}>Oppgi svar <Check size={19} /></button></div>}
          </>}
          {round.phase === 'performing' && <><span className="eyebrow">{task.kind === 'everyone' ? 'NÅ GJELDER DET' : `${performer?.name.toUpperCase()} SIN TUR`}</span><h1>{task.title}</h1>
            {task.answer.method === 'manual' && (task.answer.enteredBy === 'host' ? host : me.id === round.performerId) ? <div className="manual-entry">{round.responses.find(q => q.playerId === round.performerId)?.finished ? <div className="waiting"><Check size={20} /> Fasiten er lagret</div> : <form onSubmit={event => { event.preventDefault(); void act('manual_result', { value: Number(manualResult.replace(',', '.')) }); }}><label htmlFor="manual-result">Oppgi fasit i {task.answer.unit}</label><input id="manual-result" inputMode="decimal" required value={manualResult} onChange={event => setManualResult(event.target.value)} /><button className="button primary wide" disabled={busy || offline || round.awarded}>Lagre fasit</button></form>}</div> : task.answer.method === 'stopwatch' && (task.kind === 'everyone' || me.id === round.performerId) ? <Stopwatch key={`${round.id}:${me.id}`} game={game} response={myResponse} busy={busy || offline} act={act} /> : <div className="spectator"><Avatar player={performer!} /><h2>{performer?.name} {round.actual !== null || round.responses.find(q => q.playerId === round.performerId)?.finished ? 'er ferdig!' : 'tar utfordringen'}</h2><p className="muted">Resultatet avsløres på fasiten. Følg med på oppgaven!</p><span className="locked-result"><ShieldCheck size={20} /> Fasiten er skjult</span></div>}
          </>}
          {round.phase === 'reveal' && <><span className="eyebrow">ØYEBLIKKET ER HER</span><h1>Fasiten.</h1>{task.kind === 'individual' ? <div className="reveal-value"><span>{performer?.name}{task.answer.method === 'stopwatch' ? ' brukte' : ' sitt resultat'}</span><strong>{round.actual === null ? '–' : formatTime(Math.max(task.answer.min, Math.min(round.actual, task.answer.max)))}<small>{task.answer.unit}</small></strong><p className="muted">{round.actual === null ? 'Oppgaven ble ikke fullført. Ingen poeng denne runden.' : round.actual > task.answer.max ? `Over ${task.answer.max} ${task.answer.unit}. Gjettingene vurderes mot ${task.answer.max}.` : 'Så godt kjente dere hverandre.'}</p></div> : <p className="task-description">Målet var {formatTime(task.answer.target!)} {task.answer.unit}. Hvem traff best?</p>}<Ranking game={game} /></>}
          {round.phase === 'leaderboard' && <><span className="eyebrow">SAMMENLAGT ETTER RUNDE {round.number}</span><h1>Hvem leder?</h1><Ranking game={game} total /></>}
          {round.phase === 'sips' && <>{recipient ? <div className="drink-content"><Wine size={60} /><span className="eyebrow">{game.players.find(p => p.id === recipient.giverId)?.name.toUpperCase()} HAR VALGT DEG</span><h1>Ta 3<br />slurker.</h1><p>Denne er til deg, {me.name}.</p><span className="pill">Venter på neste runde</span></div> : <><span className="eyebrow">RUNDE VINNERE</span><h1>Del ut slurker.</h1><p className="task-description">Topp tre gir 3 slurker hver. Velg samtidig – førstemann til mølla!</p><div className="giver-list">{winners.map(p => <div className="giver" key={p.id}><Avatar player={p} small /><strong>{p.name}</strong><ShieldCheck size={17} /><span className={`allocation-status ${round.allocations.some(a => a.giverId === p.id) ? 'done' : ''}`}>{round.allocations.some(a => a.giverId === p.id) ? 'Har valgt' : 'Velger …'}</span></div>)}</div>
              {round.winners.includes(me.id) ? myAllocation ? <div className="waiting"><Check size={20} /> Du ga 3 slurker til {game.players.find(p => p.id === myAllocation.recipientId)?.name}</div> : <div className="recipient-list"><h3>Hvem får dine 3 slurker?</h3><div className="recipient-options" role="region" aria-label="Velg mottaker" tabIndex={0}>{recipients.length ? recipients.map(p => <button className="recipient-button" key={p.id} disabled={busy || offline} onClick={() => void act('allocate', { recipientId: p.id })}><Avatar player={p} small /><strong>{p.name}</strong><Wine size={19} /><span>3</span></button>) : <p className="muted">Ingen mottakere igjen. Verten kan gå videre.</p>}</div></div> : <div className="waiting"><Hourglass size={19} /> Vinnerne velger hvem som får slurker.</div>}
              <p className="immune-note"><ShieldCheck size={16} /> Utdelerne er immune denne runden.</p></>}
          </>}
        </section>
        <aside className="round-sidebar"><div className="side-card"><span className="eyebrow">DENNE RUNDEN</span><h3>{task.title}</h3><p className="muted">{task.description}</p>{performer && <div className="side-performer"><Avatar player={performer} small /><span>{performer.name}</span></div>}</div>
          {host && canMonitor && (round.phase === 'guessing' || round.phase === 'performing') && <div className="side-card response-status"><div className="section-title"><h3>{round.phase === 'guessing' ? 'Svarstatus' : 'Fullførte'}</h3><strong className="lime">{readyCount}/{readyTotal}</strong></div><div className="progress-track"><span style={{ width: `${readyTotal ? readyCount / readyTotal * 100 : 100}%` }} /></div>
            {ready ? <p className="status-ready"><Check size={16} /> Alle er klare</p> : <><p className="muted">Venter på</p><div className="missing-players">{(round.phase === 'guessing' ? missing : round.responses.filter(q => !q.finished && (!round.performerId || q.playerId === round.performerId)).map(q => game.players.find(p => p.id === q.playerId)!)).slice(0, 3).map(p => <span key={p.id}><Avatar player={p} small />{p.name}</span>)}</div>{readyTotal-readyCount > 3 && <p className="muted">og {readyTotal-readyCount-3} til</p>}</>}
          </div>}
          {!host && <div className="side-card"><span className="eyebrow">DINE POENG</span><div className="score-total">{me.score}<small>poeng</small></div><p className="muted">Verten styrer når alle går videre.</p></div>}
        </aside>
      </main>
      {host ? <footer className="host-controls"><button className="back-button" aria-label="Forrige steg" disabled={busy || offline || round.phase === 'assignment'} onClick={() => void act('back')}><ChevronLeft size={22} /></button><div><span>DU ER VERT</span><strong>{phaseNames[round.phase]}</strong></div><button className={`button next-button ${ready ? 'primary' : 'not-ready'}`} disabled={busy || offline} onClick={next}>{round.phase === 'sips' ? 'Neste runde' : round.phase === 'assignment' && !round.accepted ? 'Hopp over' : 'Gå videre'}{canMonitor && readyTotal > 0 && <span className="counter">{readyCount}/{readyTotal}</span>}</button><button className="end-button" aria-label="Avslutt spillet" disabled={busy || offline} onClick={() => setConfirm('end')}><Flag size={19} /></button></footer> : <footer className="player-controls"><Hourglass size={16} /><span>Verten går videre når dere er klare</span></footer>}
    </>}
    {confirm && <div className="modal-backdrop"><section className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title"><button className="modal-close" aria-label="Lukk" onClick={() => setConfirm(null)}><X size={20} /></button><h2 id="confirm-title">{confirm === 'end' ? 'Avslutte spillet?' : 'Gå videre nå?'}</h2><p className="muted">{confirm === 'end' ? 'Spillet avsluttes og sluttresultatet vises for alle.' : round?.phase === 'assignment' ? 'Oppgaven hoppes over og blir ikke trukket igjen.' : 'Spillere som ikke har svart eller fullført, får 0 poeng når fasiten vises.'}</p><button className="button primary wide" disabled={busy} onClick={() => void act(confirm)}>{confirm === 'end' ? 'Avslutt spillet' : 'Gå videre'}</button><button className="button secondary wide" onClick={() => setConfirm(null)}>Vent litt til</button></section></div>}
  </div>;
}

export default function App() {
  return <Routes><Route path="/" element={<Home />} /><Route path="/game/:sessionId" element={<GameScreen />} /><Route path="/rules" element={<Information />} /><Route path="/install" element={<Information install />} /><Route path="*" element={<Navigate to="/" replace />} /></Routes>;
}
