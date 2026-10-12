import { useCallback, useEffect, useRef, useState } from 'react';
import { Check, Play } from 'lucide-react';
import { formatTime, roundTask, type Game, type Response } from '../model';
import type { Act } from './useGame';

const tickInterval = 25;

type Props = { game: Game; response: Response; busy: boolean; act: Act };

/**
 * Personal stopwatch for a performer (or everyone on group tasks).
 * The start time is kept in localStorage so a reload doesn't lose a running timer.
 */
export function Stopwatch({ game, response, busy, act }: Props) {
  const round = game.round!;
  const task = roundTask(round);
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

  // Sync with the server: another device may have started or finished this timer.
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
    const interval = window.setInterval(update, tickInterval);
    return () => window.clearInterval(interval);
  }, [localStart, stopped, task.answer.timeout, stop]);

  const start = async () => {
    if (startRef.current !== null || busy) return;
    const value = Date.now(); startRef.current = value; setLocalStart(value); localStorage.setItem(timerKey, String(value));
    if (!await act('timer_start')) {
      startRef.current = null; setLocalStart(null); localStorage.removeItem(timerKey);
    }
  };

  const retryStop = async () => {
    if (failedStop !== null && await act('timer_stop', { value: failedStop })) { setFailedStop(null); localStorage.removeItem(timerKey); }
  };

  if (stopped) return (
    <div className="timer-done">
      <span className="large-icon"><Check size={38} /></span>
      <h2>{failedStop !== null ? 'Tiden må lagres' : 'Ferdig!'}</h2>
      <p className="muted">{task.kind === 'everyone' ? 'Resultatet ditt avsløres på fasiten.' : 'De andre ser tiden når verten viser fasiten.'}</p>
      {task.kind === 'individual' && response.actual !== null && <div className="private-result"><span>Bare du ser dette</span><strong>{formatTime(response.actual)} s</strong></div>}
      {failedStop !== null && <button className="button secondary" disabled={busy} onClick={retryStop}>Prøv å lagre igjen</button>}
    </div>
  );

  const running = localStart !== null;
  return (
    <div className="stopwatch">
      <span className="eyebrow">{task.kind === 'everyone' ? 'SIKT PÅ 10,00 SEKUNDER' : 'DIN STOPPEKLOKKE'}</span>
      <div className={`timer-value ${running ? 'running' : ''}`}>{formatTime(elapsed)}<span>sekunder</span></div>
      <button className={`button timer-button ${running ? 'stop' : 'primary'}`} disabled={busy || round.awarded}
        onClick={() => running ? void stop(Math.max(0, (Date.now() - localStart) / 1000)) : void start()}>
        {running ? <span className="stop-square" /> : <Play size={22} fill="currentColor" />}
        {running ? 'Stopp' : 'Start timer'}
      </button>
      <p className="muted">{task.kind === 'everyone' ? 'Timeren forsvinner når du stopper. Etter 20 sekunder blir det 0 poeng.' : 'Trykk start når du begynner, og stopp når du er ferdig.'}</p>
      {round.awarded && <p className="muted">Runden er allerede avsluttet. Resultatet er låst.</p>}
    </div>
  );
}
