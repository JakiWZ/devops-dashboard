import { useEffect, useRef, useState } from 'react';
import { flushSync } from 'react-dom';

// Recharts disegna in modo sincrono e ogni grafico forza un layout della pagina: cinque grafici
// nello stesso task bloccavano il main thread per ~300 ms su mobile (Total Blocking Time in
// Lighthouse). Due accorgimenti:
// 1. un grafico si monta solo quando è vicino al viewport (sotto la piega aspetta lo scroll);
// 2. i grafici pronti passano da una coda condivisa, uno per task del browser.
const queue: Array<() => void> = [];

function flushOne() {
  queue.shift()?.();
  if (queue.length > 0) setTimeout(flushOne, 0);
}

function enqueue(mount: () => void): () => void {
  queue.push(mount);
  if (queue.length === 1) setTimeout(flushOne, 0);
  return () => {
    const index = queue.indexOf(mount);
    if (index !== -1) queue.splice(index, 1);
  };
}

/**
 * Restituisce il ref da mettere sul segnaposto e `true` quando il grafico può montarsi;
 * da lì resta `true`. Senza IntersectionObserver (test in jsdom) si monta subito, in coda.
 */
export function useMountInTurn<T extends Element>() {
  const ref = useRef<T>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    const mount = () => flushSync(() => setReady(true));
    const element = ref.current;
    if (typeof IntersectionObserver === 'undefined' || !element) return enqueue(mount);

    let dequeue: (() => void) | undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting) && !dequeue) {
          observer.disconnect();
          dequeue = enqueue(mount);
        }
      },
      { rootMargin: '200px 0px' },
    );
    observer.observe(element);
    return () => {
      observer.disconnect();
      dequeue?.();
    };
  }, [ready]);

  return [ref, ready] as const;
}
