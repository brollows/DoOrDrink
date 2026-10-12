import { useState } from 'react';
import { Check, Copy, Crown, Dices, Hourglass, Play, Trophy, Users } from 'lucide-react';
import { Avatar } from '../components/Avatar';
import { joinUrl, QrCode } from '../components/QrCode';
import { participants, type Game } from '../model';
import type { Act } from './useGame';

const copiedFeedbackMs = 2000;

type Props = {
  game: Game;
  isHost: boolean;
  busy: boolean;
  offline: boolean;
  act: Act;
  onError: (message: string) => void;
};

function JoinCodeButton({ code, onError }: { code: string; onError: Props['onError'] }) {
  const [copied, setCopied] = useState(false);
  const copyCode = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      window.setTimeout(() => setCopied(false), copiedFeedbackMs);
    } catch { onError('Kunne ikke kopiere. Del koden som står på skjermen.'); }
  };
  return (
    <button className="join-code" aria-label="Kopier spillkode" onClick={copyCode}>
      <span>{code}</span>{copied ? <Check size={22} /> : <Copy size={22} />}
    </button>
  );
}

/** Shown to the host: scan to open the join form with the code already filled in. */
function JoinPanel({ code, onError }: { code: string; onError: Props['onError'] }) {
  return (
    <div className="join-panel">
      <QrCode value={joinUrl(code)} label={`QR-kode for å bli med i spill ${code}`} />
      <div className="join-details">
        <span className="eyebrow">SKANN FOR Å BLI MED</span>
        <JoinCodeButton code={code} onError={onError} />
        <p className="muted">Eller skriv inn koden under «Bli med».</p>
      </div>
    </div>
  );
}

function HostPlaysToggle({ game, disabled, act }: { game: Game; disabled: boolean; act: Act }) {
  const hostPlays = game.hostPlays !== false;
  return (
    <label className="toggle-row">
      <span>
        <strong>Jeg spiller med</strong>
        <small>{hostPlays ? 'Du får oppgaver og poeng som de andre.' : 'Denne skjermen viser spillet for alle, for eksempel på en TV.'}</small>
      </span>
      <input type="checkbox" role="switch" className="switch" checked={hostPlays} disabled={disabled}
        onChange={event => void act('host_plays', { value: event.target.checked })} />
    </label>
  );
}

/** Waiting room before the game starts: how to join, and who is in. */
export function Lobby({ game, isHost, busy, offline, act, onError }: Props) {
  const playerCount = participants(game).length;
  const hostPlays = game.hostPlays !== false;

  return (
    <main className="lobby-main">
      <section className="lobby-intro">
        <span className="eyebrow">VENTEROMMET</span>
        <h1>Er alle med?</h1>
        <p className="muted">Del koden med gjengen. Verten starter når dere er klare.</p>
        {isHost ? <JoinPanel code={game.code} onError={onError} /> : <JoinCodeButton code={game.code} onError={onError} />}
        <div className="round-summary">
          <div><Dices size={20} /><strong>{game.taskCount}</strong><span>oppgaver</span></div>
          <div><Users size={20} /><strong>{playerCount}</strong><span>spillere</span></div>
          <div><Trophy size={20} /><strong>1</strong><span>vinner</span></div>
        </div>
        {isHost && <HostPlaysToggle game={game} disabled={busy || offline} act={act} />}
        {isHost
          ? <button className="button primary wide" disabled={busy || offline || playerCount < 2} onClick={() => void act('start')}><Play size={19} fill="currentColor" /> Start spillet</button>
          : <div className="waiting"><Hourglass size={19} /> Venter på at verten starter</div>}
      </section>

      <section className="players-card">
        <div className="section-title"><h2>Gjengen</h2><span className="pill">{playerCount} spillere</span></div>
        <div className="player-list">
          {game.players.map(p => (
            <div className="player-row" key={p.id}>
              <Avatar player={p} />
              <strong>{p.name}{p.id === game.meId && <span className="muted"> (deg)</span>}</strong>
              {p.id === game.hostId
                ? <span className="host-badge"><Crown size={14} /> {hostPlays ? 'Vert' : 'Vert · spiller ikke'}</span>
                : <Check className="lime" size={19} />}
            </div>
          ))}
        </div>
      </section>
    </main>
  );
}
