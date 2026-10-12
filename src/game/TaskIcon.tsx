import { Grab, Hand, Ruler, Scissors, Split, Timer, Wine, type LucideProps } from 'lucide-react';
import type { Hand as HandName, Task } from '../model';

export function TaskIcon({ task, ...props }: { task: Task } & LucideProps) {
  if (task.answer.method === 'rps') return <Scissors {...props} />;
  if (task.answer.method === 'choice') return <Split {...props} />;
  if (task.answer.method === 'manual') return <Ruler {...props} />;
  return task.kind === 'everyone' ? <Timer {...props} /> : <Wine {...props} />;
}

const handIcons = { rock: Grab, paper: Hand, scissors: Scissors };

export function HandIcon({ hand, ...props }: { hand: HandName } & LucideProps) {
  const Icon = handIcons[hand];
  return <Icon {...props} />;
}
