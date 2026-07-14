"use client";

import { useEffect, useRef } from "react";

/**
 * Mantém silenciosamente a última configuração usada por usuário, marca e
 * módulo. Não cria versões nomeadas: a interface sempre retoma de onde o
 * usuário parou.
 */
export function CompactSavedViews({ userId, brandId, module, values, onApply }: {
  userId: string;
  brandId: string;
  module: string;
  values: Record<string, string>;
  onApply: (values: Record<string, string>) => void;
}) {
  const key = `minerador-pro:last-view:${userId || "anonymous"}:${brandId || "no-brand"}:${module}`;
  const hydratedKey = useRef<string | null>(null);
  const applyRef = useRef(onApply);
  const latestValuesRef = useRef(values);
  useEffect(() => { applyRef.current = onApply; }, [onApply]);
  useEffect(() => { latestValuesRef.current = values; }, [values]);

  useEffect(() => {
    hydratedKey.current = null;
    const timer = window.setTimeout(() => {
      try {
        const raw = window.localStorage.getItem(key);
        if (raw) applyRef.current(JSON.parse(raw) as Record<string, string>);
        else window.localStorage.setItem(key, JSON.stringify(latestValuesRef.current));
      } catch {
        window.localStorage.removeItem(key);
      } finally {
        hydratedKey.current = key;
      }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [key]); // A troca dos valores é persistida pelo efeito seguinte.

  useEffect(() => {
    if (hydratedKey.current !== key) return;
    window.localStorage.setItem(key, JSON.stringify(values));
  }, [key, values]);

  return null;
}
