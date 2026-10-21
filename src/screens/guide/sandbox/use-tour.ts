import { useState } from 'react';

import { prepare } from '../sandbox-state';
import type { SetupId, Store } from '../sandbox-state';
import { stepsAt, T } from '../tasks';
import type { Page, Target, Task } from '../tasks';

type Tour = { task: Task; step: number };

type Options = {
  wide: boolean;
  setStore: (change: (store: Store) => Store) => void;
  /** Where a task starts: its first step's page, with the history cleared. */
  startAt: (page: Page) => void;
  /** The last step was done. */
  onDone: (task: Task) => void;
};

/**
 * A guided task in the practice store: which step it is on, and moving on when the person does what the step asks.
 * A tap anywhere else just does what it does — the step waits.
 */
export function useTour({ wide, setStore, startAt, onDone }: Options) {
  const [tour, setTour] = useState<Tour | null>(null);
  const steps = tour ? stepsAt(tour.task, wide) : [];
  const step = tour ? steps[tour.step] : undefined;

  const start = (task: Task) => {
    const need = task.prepare;
    if (need) setStore((store) => prepare(store, need));
    startAt(stepsAt(task, wide)[0].page);
    setTour({ task, step: 0 });
  };

  const matches = (target: Target, setupId?: SetupId) => !!tour && !!step && step.target === target && (target !== T.setupRow || setupId === tour.task.setup);

  const did = (target: Target, setupId?: SetupId) => {
    if (!tour || !matches(target, setupId)) return;
    if (tour.step + 1 < steps.length) {
      setTour({ ...tour, step: tour.step + 1 });
      return;
    }
    setTour(null);
    onDone(tour.task);
  };

  return { tour, step, count: steps.length, start, did, isTarget: matches, stop: () => setTour(null) };
}
