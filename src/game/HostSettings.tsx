import { useEffect, useMemo, useRef, useState } from 'react';
import { Clock, ListChecks, X } from 'lucide-react';
import { allTaskIds, durationLabel, simulateDuration, taskSlots } from '../duration';
import { participants, type Game } from '../model';
import type { Act } from './useGame';

export function HostSettings({ game, disabled, act }: { game: Game; disabled: boolean; act: Act }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<string[]>([]);
  const dialog = useRef<HTMLDialogElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const ids = game.selectedTasks ?? allTaskIds;
  const count = participants(game).length;
  const playerSips = game.playerSips !== false, gameSips = game.gameSips !== false;
  const estimates = useMemo(() => ({
    current: simulateDuration(ids, count, { playerSips, gameSips }),
    comparison: [false, true].flatMap(half => [true, false].map(drinking => ({ half, drinking,
      estimate: simulateDuration(allTaskIds, count, { half, playerSips: drinking, gameSips: drinking }),
    }))),
  }), [ids.join(','), count, playerSips, gameSips]);
  const preview = useMemo(() => simulateDuration(taskSlots.filter(s => selected.includes(s.key)).map(s => s.task.id), count,
    { playerSips, gameSips }), [selected, count, playerSips, gameSips]);
  useEffect(() => {
    if (open) dialog.current?.showModal();
    else if (dialog.current?.open) { dialog.current.close(); trigger.current?.focus(); }
  }, [open]);
  const show = () => {
    const remaining = [...ids];
    setSelected(taskSlots.filter(slot => {
      const i = remaining.indexOf(slot.task.id);
      if (i < 0) return false;
      remaining.splice(i, 1); return true;
    }).map(s => s.key));
    setOpen(true);
  };
  return <section className="host-settings" aria-label="Vertens spillinnstillinger">
    <h2>Spillinnstillinger</h2>
    <label className="toggle-row"><span><strong>Spillere kan dele ut slurker</strong><small>Topp tre velger mottakere etter rundens poeng.</small></span>
      <input type="checkbox" role="switch" className="switch" checked={playerSips} disabled={disabled}
        onChange={e => void act('settings', { playerSips: e.target.checked })} /></label>
    <label className="toggle-row"><span><strong>Spillet deler ut slurker</strong><small>Automatiske slurker til tapere. Avslåtte slurkesteg hoppes over.</small></span>
      <input type="checkbox" role="switch" className="switch" checked={gameSips} disabled={disabled}
        onChange={e => void act('settings', { gameSips: e.target.checked })} /></label>
    <p className="muted">«Bånn i bøtta» er fortsatt en drikkeoppgave. Fjern begge forekomstene i oppgavevalget for et spill helt uten drikking.</p>
    <button ref={trigger} className="button secondary wide" disabled={disabled} onClick={show}><ListChecks size={19} /> Velg oppgaver · {ids.length} valgt</button>
    <div className="duration-card" aria-live="polite">
      <span className="eyebrow"><Clock size={16} /> ANSLÅTT SPILLETID</span>
      <strong className="duration-value">{count < 2 ? 'Velg minst to spillere' : durationLabel(estimates.current)}</strong>
      {count >= 2 && <small>Typisk ca. {estimates.current.median} min · ca. {estimates.current.rounds} spilte runder med valgene dine</small>}
      <details><summary>Sammenlign alle og halvparten</summary>
        <p className="muted">Med {count} aktive spillere. «Uten slurker» slår av begge slurkeinnstillingene, men beholder de samme oppgavene.</p>
        <div className="duration-comparison">{estimates.comparison.map(({ half, drinking, estimate }) => <div key={`${half}-${drinking}`}>
          <span>{half ? 'Halvparten' : 'Alle oppgaver'} · {drinking ? 'med slurker' : 'uten slurker'}</span><strong>{durationLabel(estimate)}</strong>
        </div>)}</div>
        <p className="muted">800 simulerte økter per alternativ. Intervallet viser 10.–90. persentil ut fra antatte menneskelige tider: lese og svare, hente utstyr, utføre oppgaver, lese runde- og totalpoeng, reaksjoner og korte avbrekk. Lange pauser og innlogging kommer i tillegg. Halvparten er et tilfeldig utvalg i hver simulering, så sammensetningen varierer.</p>
        <p className="muted">Hver spiller kan fullføre én individuell utfordring. Resterende utfordringer faller da bort. Miming beregnes med ordvalg og opptil 120 sekunder utførelse, Topp 5 med 60 sekunder skriving, og Bånn i bøtta med tid til klargjøring og gjennomføring. Dette er modellanslag, ikke målte økter.</p>
      </details>
    </div>
    <dialog ref={dialog} className="modal task-picker" aria-labelledby="task-picker-title" onCancel={() => setOpen(false)} onClose={() => setOpen(false)}>
      <button className="modal-close" aria-label="Lukk oppgavevalg" onClick={() => setOpen(false)}><X size={20} /></button>
      <h2 id="task-picker-title">Velg oppgavene</h2>
      <p className="muted">Hver avkrysning er én forekomst. Rekkefølgen trekkes tilfeldig når valget lagres.</p>
      <div className="task-picker-tools"><button className="button secondary" disabled={disabled} onClick={() => setSelected(taskSlots.map(s => s.key))}>Velg alle</button>
        <button className="button secondary" disabled={disabled} onClick={() => setSelected([])}>Fjern alle</button></div>
      {(['challenge', 'everyone'] as const).map(kind => <fieldset key={kind}><legend>{kind === 'challenge' ? 'Individuelle utfordringer' : 'Alle spiller'}</legend>
        {taskSlots.filter(s => s.task.kind === kind).map(slot => <label className="task-option" key={slot.key}>
          <input type="checkbox" checked={selected.includes(slot.key)} disabled={disabled} onChange={e => setSelected(current => e.target.checked ? [...current, slot.key] : current.filter(key => key !== slot.key))} />
          <span><strong>{slot.task.title}{(slot.task.repeat ?? 1) > 1 && ` · ${slot.index + 1} av ${slot.task.repeat}`}</strong>
            <small>{slot.task.options?.join(' eller ') ?? slot.task.description}</small></span>
        </label>)}
      </fieldset>)}
      <div className="task-picker-save"><p>{selected.length} valgt · {durationLabel(preview)}</p>
        <button className="button primary wide" disabled={disabled || !selected.length} onClick={async () => {
          if (await act('settings', { tasks: taskSlots.filter(s => selected.includes(s.key)).map(s => s.task.id) })) setOpen(false);
        }}>Lagre oppgavevalg</button></div>
    </dialog>
  </section>;
}
