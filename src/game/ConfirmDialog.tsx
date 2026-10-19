import { X } from 'lucide-react';
import type { Phase } from '../model';

export type ConfirmKind = 'next' | 'end' | 'skip_round';

type Props = {
  kind: ConfirmKind;
  phase: Phase | undefined;
  busy: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

function description(kind: ConfirmKind, phase: Phase | undefined) {
  if (kind === 'skip_round') return 'Resten av runden hoppes over, og oppgaven blir ikke trukket igjen. Poeng som allerede er vist, beholdes. Ellers gir runden ingen poeng eller slurker.';
  if (kind === 'end') return 'Spillet avsluttes og sluttresultatet vises for alle.';
  if (phase === 'assignment') return 'Oppgaven hoppes over og blir ikke trukket igjen.';
  return 'Spillere som ikke har svart eller fullført, får 0 poeng når fasiten vises.';
}

export function ConfirmDialog({ kind, phase, busy, onConfirm, onCancel }: Props) {
  return (
    <div className="modal-backdrop">
      <section className="modal" role="dialog" aria-modal="true" aria-labelledby="confirm-title">
        <button className="modal-close" aria-label="Lukk" onClick={onCancel}><X size={20} /></button>
        <h2 id="confirm-title">{kind === 'skip_round' ? 'Hoppe over runden?' : kind === 'end' ? 'Avslutte spillet?' : 'Gå videre nå?'}</h2>
        <p className="muted">{description(kind, phase)}</p>
        <button className="button primary wide" disabled={busy} onClick={onConfirm}>{kind === 'skip_round' ? 'Hopp over runden' : kind === 'end' ? 'Avslutt spillet' : 'Gå videre'}</button>
        <button className="button secondary wide" onClick={onCancel}>Vent litt til</button>
      </section>
    </div>
  );
}
