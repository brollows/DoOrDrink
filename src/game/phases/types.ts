import type { RoundState } from '../roundState';
import type { Act } from '../useGame';

export type PhaseProps = {
  state: RoundState;
  busy: boolean;
  offline: boolean;
  act: Act;
};
