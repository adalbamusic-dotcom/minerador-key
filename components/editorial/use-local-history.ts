"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { cloneHistorySnapshot, createHistoryEntry, type EditorialHistoryEntry, type EditorialHistoryModule } from "@/lib/editorial/history";

const navigationSessionHistory = new Map<string, { past: Array<EditorialHistoryEntry<unknown>>; future: Array<EditorialHistoryEntry<unknown>> }>();

export function useLocalHistory<T>(module: EditorialHistoryModule, value: T, onRestore: (snapshot: T) => void, limit = 30, scope = "default") {
  const storageKey = `${scope}:${module}`;
  const stored = navigationSessionHistory.get(storageKey);
  const valueRef = useRef(value);
  const [past, setPast] = useState<Array<EditorialHistoryEntry<T>>>(() => (stored?.past || []) as Array<EditorialHistoryEntry<T>>);
  const [future, setFuture] = useState<Array<EditorialHistoryEntry<T>>>(() => (stored?.future || []) as Array<EditorialHistoryEntry<T>>);
  const pastRef = useRef(past);
  const futureRef = useRef(future);
  const storageKeyRef = useRef(storageKey);

  useEffect(() => { valueRef.current = value; }, [value]);
  useEffect(() => { pastRef.current = past; }, [past]);
  useEffect(() => { futureRef.current = future; }, [future]);

  useEffect(() => {
    if (storageKeyRef.current === storageKey) return;
    storageKeyRef.current = storageKey;
    const next = navigationSessionHistory.get(storageKey);
    const nextPast = (next?.past || []) as Array<EditorialHistoryEntry<T>>;
    const nextFuture = (next?.future || []) as Array<EditorialHistoryEntry<T>>;
    pastRef.current = nextPast; futureRef.current = nextFuture;
    const timer = window.setTimeout(() => { setPast(nextPast); setFuture(nextFuture); }, 0);
    return () => window.clearTimeout(timer);
  }, [storageKey]);

  const store = useCallback((nextPast: Array<EditorialHistoryEntry<T>>, nextFuture: Array<EditorialHistoryEntry<T>>) => {
    navigationSessionHistory.set(storageKeyRef.current, { past: nextPast as Array<EditorialHistoryEntry<unknown>>, future: nextFuture as Array<EditorialHistoryEntry<unknown>> });
  }, []);

  const capture = useCallback((label: string, snapshot = valueRef.current) => {
    const next = [...pastRef.current, createHistoryEntry(module, label, snapshot)].slice(-limit);
    pastRef.current = next; futureRef.current = [];
    setPast(next); setFuture([]); store(next, []);
  }, [limit, module, store]);

  const undo = useCallback(() => {
    const entry = pastRef.current.at(-1); if (!entry) return;
    const nextPast = pastRef.current.slice(0, -1);
    const nextFuture = [createHistoryEntry(module, entry.label, valueRef.current), ...futureRef.current].slice(0, limit);
    pastRef.current = nextPast; futureRef.current = nextFuture;
    setPast(nextPast); setFuture(nextFuture); store(nextPast, nextFuture); onRestore(cloneHistorySnapshot(entry.snapshot));
  }, [limit, module, onRestore, store]);

  const redo = useCallback(() => {
    const entry = futureRef.current[0]; if (!entry) return;
    const nextFuture = futureRef.current.slice(1);
    const nextPast = [...pastRef.current, createHistoryEntry(module, entry.label, valueRef.current)].slice(-limit);
    pastRef.current = nextPast; futureRef.current = nextFuture;
    setPast(nextPast); setFuture(nextFuture); store(nextPast, nextFuture); onRestore(cloneHistorySnapshot(entry.snapshot));
  }, [limit, module, onRestore, store]);

  const restore = useCallback((id: string) => {
    const entry = pastRef.current.find(candidate => candidate.id === id); if (!entry) return;
    const safeguard = createHistoryEntry(module, "Antes da restauração manual", valueRef.current);
    const nextPast = [...pastRef.current, safeguard].slice(-limit);
    pastRef.current = nextPast; futureRef.current = [];
    setPast(nextPast); setFuture([]); store(nextPast, []); onRestore(cloneHistorySnapshot(entry.snapshot));
  }, [limit, module, onRestore, store]);

  return { entries: past, canUndo: past.length > 0, canRedo: future.length > 0, capture, undo, redo, restore };
}
