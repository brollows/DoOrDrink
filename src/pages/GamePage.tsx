import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Hourglass, WifiOff } from 'lucide-react';
import { leaveDevice } from '../api';
import { Brand } from '../components/Brand';
import { ErrorMessage } from '../components/ErrorMessage';
import { ConfirmDialog, type ConfirmKind } from '../game/ConfirmDialog';
import { FinishedView } from '../game/FinishedView';
import { DemoBar, GameHeader } from '../game/GameHeader';
import { Lobby } from '../game/Lobby';
import { getRoundState } from '../game/roundState';
import { RoundView } from '../game/RoundView';
import { useGame, type Act } from '../game/useGame';

export default function GamePage() {
  const { sessionId = '' } = useParams();
  const navigate = useNavigate();
  const { game, error, setError, busy, offline, act: send, refresh, switchPlayer } = useGame(sessionId);
  const [confirm, setConfirm] = useState<ConfirmKind | null>(null);

  // A pending confirmation no longer applies once the step changes or an action succeeds.
  useEffect(() => setConfirm(null), [game?.round?.id, game?.round?.phase]);
  const act: Act = useCallback(async (action, payload) => {
    const success = await send(action, payload);
    if (success) setConfirm(null);
    return success;
  }, [send]);

  if (!game) return (
    <main className="loading-page">
      <Brand />
      <Hourglass size={35} />
      <h2>{error ? 'Kunne ikke åpne spillet' : 'Henter spillet …'}</h2>
      <ErrorMessage message={error} />
      <Link className="button secondary" to="/">Til forsiden</Link>
    </main>
  );

  const me = game.players.find(p => p.id === game.meId)!;
  const isHost = game.hostId === game.meId;
  const roundState = game.status === 'playing' ? getRoundState(game) : null;
  const drinkMode = roundState?.mustDrink && roundState.round.phase === 'sips';

  return (
    <div className={`game-layout status-${game.status} ${drinkMode ? 'drink-mode' : ''}`}>
      <GameHeader game={game} me={me} isHost={isHost} />
      {game.id === 'demo' && <DemoBar game={game} onSwitchPlayer={id => void switchPlayer(id)} />}
      {offline && <div className="offline" role="status"><WifiOff size={16} /> Ingen forbindelse. Kobler til når nettet er tilbake.</div>}
      <ErrorMessage message={error} />

      {game.status === 'lobby' && <Lobby game={game} isHost={isHost} busy={busy} offline={offline} act={act} onError={setError} />}
      {game.status === 'finished' && <FinishedView game={game} onLeave={() => { leaveDevice(); navigate(game.test ? '/test' : '/'); }} />}
      {roundState && <RoundView state={roundState} busy={busy} offline={offline} act={act} refresh={refresh} onConfirm={setConfirm} />}

      {confirm && <ConfirmDialog kind={confirm} phase={game.round?.phase} busy={busy}
        onConfirm={() => void act(confirm)} onCancel={() => setConfirm(null)} />}
    </div>
  );
}
