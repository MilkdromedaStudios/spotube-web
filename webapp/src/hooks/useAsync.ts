"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export interface AsyncState<T> {
  data?: T;
  error?: Error;
  loading: boolean;
  reload: () => void;
}

/** Runs an async loader when deps change, ignoring stale results. */
export function useAsync<T>(fn: () => Promise<T>, deps: unknown[], enabled = true): AsyncState<T> {
  const [state, setState] = useState<{ data?: T; error?: Error; loading: boolean }>({ loading: enabled });
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;
  useEffect(() => {
    if (!enabled) {
      setState({ loading: false });
      return;
    }
    let alive = true;
    setState((s) => ({ data: s.data, loading: true }));
    fnRef
      .current()
      .then((data) => alive && setState({ data, loading: false }))
      .catch((error: Error) => alive && setState({ error, loading: false }));
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce, enabled]);
  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { ...state, reload };
}
