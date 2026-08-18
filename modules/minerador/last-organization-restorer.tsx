"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { MINERADOR_ORGANIZATION_STORAGE_VERSION, mineradorLastOrganizationKey, normalizeMineradorLastOrganization, parseMineradorLastOrganization, type MineradorOrganizationValues } from "@/lib/minerador/last-organization";

type Props = {
  userId: string;
  brandId: string;
  ready: boolean;
  knownListIds: readonly string[];
  values: MineradorOrganizationValues;
  onApply: (values: MineradorOrganizationValues) => void;
  onHydrated: (key: string) => void;
};

function serializeMineradorOrganization(values: MineradorOrganizationValues) {
  return JSON.stringify({
    ...values,
    organizationStorageVersion: MINERADOR_ORGANIZATION_STORAGE_VERSION,
  });
}

/** Minerador-only compatibility reader for the existing last-view local preference. */
export function MineradorLastOrganizationRestorer({ userId, brandId, ready, knownListIds, values, onApply, onHydrated }: Props) {
  const key = userId && brandId ? mineradorLastOrganizationKey(userId, brandId) : null;
  const knownListIdsKey = knownListIds.join("|");
  const hydratedKey = useRef<string | null>(null);
  const skipInitialPersistKey = useRef<string | null>(null);
  const persistedValueRef = useRef<string | null>(null);
  const applyRef = useRef(onApply);
  const valuesRef = useRef(values);
  const hydratedRef = useRef(onHydrated);
  useEffect(() => { applyRef.current = onApply; }, [onApply]);
  useEffect(() => { valuesRef.current = values; }, [values]);
  useEffect(() => { hydratedRef.current = onHydrated; }, [onHydrated]);

  useLayoutEffect(() => {
    if (!key || !ready) return;
    if (hydratedKey.current === key) return;
    hydratedKey.current = null;
    skipInitialPersistKey.current = key;
    try {
      const raw = window.localStorage.getItem(key);
      persistedValueRef.current = raw;
      const parsed = parseMineradorLastOrganization(raw);
      if (parsed) applyRef.current(normalizeMineradorLastOrganization(parsed, knownListIdsKey ? knownListIdsKey.split("|") : []));
      else if (raw === null) window.localStorage.setItem(key, serializeMineradorOrganization(valuesRef.current));
    } catch {
      // Preferências indisponíveis ou inválidas não são removidas nem alteram a tabela.
    } finally {
      hydratedKey.current = key;
      hydratedRef.current(key);
    }
  }, [key, ready, knownListIdsKey]);

  useEffect(() => {
    if (!key || hydratedKey.current !== key) return;
    if (skipInitialPersistKey.current === key) { skipInitialPersistKey.current = null; return; }
    const serialized = serializeMineradorOrganization(values);
    if (serialized === persistedValueRef.current) return;
    try {
      window.localStorage.setItem(key, serialized);
      persistedValueRef.current = serialized;
    } catch { /* armazenamento local indisponível */ }
  }, [key, values]);

  return null;
}
