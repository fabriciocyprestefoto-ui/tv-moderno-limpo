export function createRafThrottle(callback: () => void): () => void {
  let rafId: number | null = null;

  return () => {
    if (rafId !== null) return;
    rafId = window.requestAnimationFrame(() => {
      rafId = null;
      callback();
    });
  };
}
