import { useEffect, useRef } from "react";

type UseDebouncedEffectOptions = {
  delayMs: number;
  enabled?: boolean;
  /**
   * When true, the first dependency change (typically initial mount) is ignored.
   * Useful for avoiding immediately persisting default state over stored settings.
   */
  skipFirstRun?: boolean;
};

/**
 * Runs `effect` after `delayMs` whenever `deps` change (debounced).
 * Intended for safe "save on change" persistence.
 */
export function useDebouncedEffect(
  effect: () => void,
  deps: React.DependencyList,
  { delayMs, enabled = true, skipFirstRun = false }: UseDebouncedEffectOptions
) {
  const effectRef = useRef(effect);
  const isFirstRunRef = useRef(true);

  useEffect(() => {
    effectRef.current = effect;
  }, [effect]);

  useEffect(() => {
    if (!enabled) return;
    if (skipFirstRun && isFirstRunRef.current) {
      isFirstRunRef.current = false;
      return;
    }

    const timer = window.setTimeout(() => {
      effectRef.current();
    }, delayMs);

    return () => {
      window.clearTimeout(timer);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

