/**
 * Work that must happen while the session still exists, right before signing out (Phase 8 / M4: this device's push token
 * is unregistered, so a shared phone never shows the previous person's notifications). Features register here at start;
 * the auth feature runs them, without depending on those features.
 */
type Step = () => Promise<void>;
const steps = new Set<Step>();

export function addBeforeSignOut(step: Step): () => void {
  steps.add(step);
  return () => steps.delete(step);
}

/** Runs every step, each at most `timeoutMs`; a failure or a slow network never blocks signing out. */
export async function runBeforeSignOut(timeoutMs = 3000): Promise<void> {
  await Promise.all(
    [...steps].map((step) =>
      Promise.race([
        step().catch(() => undefined),
        new Promise<void>((resolve) => setTimeout(resolve, timeoutMs)),
      ]),
    ),
  );
}
