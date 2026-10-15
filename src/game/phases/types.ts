import type { RoundState } from '../roundState';
import type { Act } from '../useGame';

export type PhaseProps = {
  state: RoundState;
  busy: boolean;
  offline: boolean;
  act: Act;
  /** Fetches the latest state, e.g. when a server-timed hint is due. */
  refresh?: () => Promise<void>;
};
