import { useEffect, useState } from 'react';

/** Seconds left, counted down locally from the server's value so every phone agrees. */
export function useCountdown(secondsLeft: number | null | undefined) {
  const [deadline, setDeadline] = useState<number | null>(null);
  const [, setTick] = useState(0);
  useEffect(() => { if (secondsLeft != null) setDeadline(current => current ?? Date.now() + secondsLeft * 1000); }, [secondsLeft]);
  useEffect(() => { const interval = window.setInterval(() => setTick(tick => tick + 1), 250); return () => window.clearInterval(interval); }, []);
  return deadline === null ? null : Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
}

export function Countdown({ seconds }: { seconds: number | null }) {
  return <div className={`timer-value countdown ${seconds !== null && seconds <= 10 ? 'urgent' : ''}`} role="timer">{seconds ?? '–'}<span>sekunder igjen</span></div>;
}
