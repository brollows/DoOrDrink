import type { ComponentType } from 'react';
import { Dices, Users } from 'lucide-react';
import { phaseNames, roundPhases, type Phase } from '../model';
import type { ConfirmKind } from './ConfirmDialog';
import { HostControls, PlayerControls } from './GameControls';
import { AssignmentPhase } from './phases/AssignmentPhase';
import { GuessingPhase } from './phases/GuessingPhase';
import { LeaderboardPhase } from './phases/LeaderboardPhase';
import { PerformingPhase } from './phases/PerformingPhase';
import { RevealPhase } from './phases/RevealPhase';
import { SipsPhase } from './phases/SipsPhase';
import type { PhaseProps } from './phases/types';
import { RoundSidebar } from './RoundSidebar';
import type { RoundState } from './roundState';
import type { Act } from './useGame';

const phaseViews: Record<Phase, ComponentType<PhaseProps>> = {
  assignment: AssignmentPhase,
  guessing: GuessingPhase,
  performing: PerformingPhase,
  reveal: RevealPhase,
  sips: SipsPhase,
  leaderboard: LeaderboardPhase,
};

type Props = {
  state: RoundState;
  busy: boolean;
  offline: boolean;
  act: Act;
  refresh: () => Promise<void>;
  onConfirm: (kind: ConfirmKind) => void;
};

function Stepper({ state }: { state: RoundState }) {
  const { round, task } = state;
  const phases = roundPhases(round.taskId, task, state.game);
  const currentIndex = phases.indexOf(round.phase);
  return (
    <nav className="stepper" aria-label="Spillsteg">
      {phases.map((phase, index) => (
        <div key={phase} className={index === currentIndex ? 'current' : index < currentIndex ? 'complete' : ''}>
          <span>{index + 1}</span><small>{phaseNames[phase]}</small>
        </div>
      ))}
    </nav>
  );
}

/** One round of the game: progress, the current phase, sidebar and controls. */
export function RoundView({ state, busy, offline, act, refresh, onConfirm }: Props) {
  const { game, isHost, round, task } = state;
  const PhaseView = phaseViews[round.phase];

  return <>
    <div className="round-top">
      <span className="eyebrow">RUNDE {round.number} / {game.taskCount}</span>
      <span className="pill">{task.kind === 'everyone' ? <><Users size={14} />Alle spiller</> : <><Dices size={14} />Én tar utfordringen</>}</span>
    </div>
    <Stepper state={state} />
    <main className="round-main">
      <section className={`round-card phase-${round.phase}`}>
        {/* Keyed by player so local input state never carries over when the demo switches player. */}
        <PhaseView key={state.me.id} state={state} busy={busy} offline={offline} act={act} refresh={refresh} />
      </section>
      <RoundSidebar state={state} />
    </main>
    {isHost ? <HostControls state={state} busy={busy} offline={offline} act={act} onConfirm={onConfirm} /> : <PlayerControls />}
  </>;
}
