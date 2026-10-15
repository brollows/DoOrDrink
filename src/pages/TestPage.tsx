import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Dices } from 'lucide-react';
import { createTestGame } from '../api';
import { Brand } from '../components/Brand';
import { ErrorMessage } from '../components/ErrorMessage';
import { TaskIcon } from '../game/TaskIcon';
import { tasks, type Task } from '../model';

const groups: { title: string; kind: Task['kind'] }[] = [
  { title: 'Utfordringer', kind: 'challenge' },
  { title: 'Alle spiller', kind: 'everyone' },
];

/** Would you rather tasks share a title, so their first option tells them apart. */
const subtitle = (task: Task) => task.options ? task.options.join(' eller ') : task.description;

/**
 * Hidden test page (/test): start a local game with every task, or play one task at a time
 * from the introduction to the final scores. Same players and "Se som" switching as the demo.
 */
export default function TestPage() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const start = async (taskIds?: string[]) => {
    setBusy(true); setError('');
    try {
      const game = await createTestGame(taskIds);
      navigate(`/game/${game.id}`);
    } catch (error) { setError((error as Error).message); }
    finally { setBusy(false); }
  };

  return (
    <main className="info-page test-page">
      <Brand />
      <Link className="text-link" to="/"><ChevronLeft size={16} /> Til forsiden</Link>
      <span className="eyebrow">TESTMODUS</span>
      <h1>Test spillene.</h1>
      <p className="muted test-intro">Lokale spill med de samme spillerne som i prøvespillet. Bytt hvem du ser som med «Se som» øverst i spillet.</p>
      <ErrorMessage message={error} />
      <button className="button primary wide test-all" disabled={busy} onClick={() => void start()}><Dices size={19} /> Prøv hele spillet</button>

      {groups.map(group => (
        <section key={group.kind} className="test-group" aria-labelledby={`test-${group.kind}`}>
          <h2 id={`test-${group.kind}`}>{group.title}</h2>
          <div className="test-list">
            {Object.values(tasks).filter(task => task.kind === group.kind).map(task => (
              <button key={task.id} className="test-task" disabled={busy} onClick={() => void start([task.id])}>
                <span className="test-task-icon"><TaskIcon task={task} size={20} /></span>
                <span className="test-task-text"><strong>{task.title}</strong><small>{subtitle(task)}</small></span>
                <ChevronRight size={18} aria-hidden="true" />
              </button>
            ))}
          </div>
        </section>
      ))}
    </main>
  );
}
