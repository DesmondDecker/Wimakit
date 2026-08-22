import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { Keyboard } from 'react-native';

// ─── useDebounce ───────────────────────────────────────────────────────────
export function useDebounce<T>(value: T, delay = 350): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── useDebouncedCallback ──────────────────────────────────────────────────
export function useDebouncedCallback<T extends (...args: any[]) => any>(
  fn: T,
  delay = 350
): T {
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  return useCallback(
    (...args: Parameters<T>) => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => fn(...args), delay);
    },
    [fn, delay]
  ) as T;
}

// ─── useKeyboard ──────────────────────────────────────────────────────────
export function useKeyboard() {
  const [height, setHeight] = useState(0);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => {
      setHeight(e.endCoordinates.height);
      setVisible(true);
    });
    const hide = Keyboard.addListener('keyboardDidHide', () => {
      setHeight(0);
      setVisible(false);
    });
    return () => { show.remove(); hide.remove(); };
  }, []);

  return { height, visible };
}

// ─── usePrevious ──────────────────────────────────────────────────────────
export function usePrevious<T>(value: T): T | undefined {
  const ref = useRef<T | undefined>(undefined);
  useEffect(() => { ref.current = value; }, [value]);
  return ref.current;
}

// ─── useMount ─────────────────────────────────────────────────────────────
export function useMount(fn: () => void | (() => void)) {
  useEffect(fn, []);
}

// ─── useFlatListProps — optimized FlatList config ─────────────────────────
export function useFlatListProps<T>(
  data: T[],
  keyExtractor: (item: T) => string
) {
  return useMemo(
    () => ({
      data,
      keyExtractor,
      removeClippedSubviews:   true,
      maxToRenderPerBatch:     10,
      updateCellsBatchingPeriod: 50,
      windowSize:              10,
      initialNumToRender:      6,
      getItemLayout:           undefined, // override per list if heights are fixed
    }),
    [data, keyExtractor]
  );
}

// ─── useSearchFilter — client-side search with debounce ───────────────────
export function useSearchFilter<T>(
  items: T[],
  query: string,
  fields: (keyof T)[],
  delay = 300
) {
  const debounced = useDebounce(query, delay);
  return useMemo(() => {
    if (!debounced.trim()) return items;
    const q = debounced.toLowerCase();
    return items.filter((item) =>
      fields.some((f) => {
        const val = item[f];
        return typeof val === 'string' && val.toLowerCase().includes(q);
      })
    );
  }, [items, debounced, fields]);
}

// ─── useIntersection (FlatList viewability) ───────────────────────────────
export function useViewabilityConfig() {
  return useRef({
    viewabilityConfig: {
      minimumViewTime:       200,
      itemVisiblePercentThreshold: 50,
    },
  }).current;
}

// ─── useRefresh — pull-to-refresh handler ─────────────────────────────────
export function useRefresh(refetch: () => Promise<any>) {
  const [refreshing, setRefreshing] = useState(false);
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try { await refetch(); } finally { setRefreshing(false); }
  }, [refetch]);
  return { refreshing, onRefresh };
}

// ─── useToggle ─────────────────────────────────────────────────────────────
export function useToggle(initial = false) {
  const [value, setValue] = useState(initial);
  const toggle = useCallback(() => setValue((v) => !v), []);
  const on  = useCallback(() => setValue(true), []);
  const off = useCallback(() => setValue(false), []);
  return { value, toggle, on, off };
}
