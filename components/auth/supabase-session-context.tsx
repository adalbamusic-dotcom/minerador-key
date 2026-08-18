"use client";

import { createContext, useContext, useEffect, useMemo, useRef, useState } from "react";
import type { Session } from "@supabase/supabase-js";
import { getBrowserSupabaseClient } from "@/lib/supabase/browser-client";

export type BrowserIdentity = {
  user: { id: string; email: string | null; name: string | null; image: string | null };
};

type SupabaseSessionContextValue = {
  data: BrowserIdentity | null;
  status: "loading" | "authenticated" | "unauthenticated";
  actorUserId: string | null;
  sessionEpoch: number;
  signOut: (callbackUrl?: string) => Promise<void>;
};

const SupabaseSessionContext = createContext<SupabaseSessionContextValue | undefined>(undefined);

function identityFromSession(session: Session | null): BrowserIdentity | null {
  if (!session?.user) return null;
  const metadata = session.user.user_metadata || {};
  return {
    user: {
      id: session.user.id,
      email: session.user.email || null,
      name: typeof metadata.full_name === "string" ? metadata.full_name : typeof metadata.name === "string" ? metadata.name : null,
      image: typeof metadata.avatar_url === "string" ? metadata.avatar_url : null,
    },
  };
}

export function SupabaseSessionProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [status, setStatus] = useState<SupabaseSessionContextValue["status"]>("loading");
  const [sessionEpoch, setSessionEpoch] = useState(0);
  const actorUserIdRef = useRef<string | null>(null);

  const commitSession = (nextSession: Session | null) => {
    const nextActorUserId = nextSession?.user?.id || null;
    if (actorUserIdRef.current !== nextActorUserId) {
      actorUserIdRef.current = nextActorUserId;
      setSessionEpoch(epoch => epoch + 1);
    }
    setSession(nextSession);
    setStatus(nextSession ? "authenticated" : "unauthenticated");
  };

  useEffect(() => {
    const client = getBrowserSupabaseClient();
    let active = true;
    client.auth.getSession().then(({ data }) => {
      if (!active) return;
      commitSession(data.session);
    }).catch(() => {
      if (active) commitSession(null);
    });
    const { data: subscription } = client.auth.onAuthStateChange((_event, nextSession) => {
      if (!active) return;
      commitSession(nextSession);
    });
    return () => { active = false; subscription.subscription.unsubscribe(); };
  }, []);

  const value = useMemo<SupabaseSessionContextValue>(() => ({
    data: identityFromSession(session),
    status,
    actorUserId: session?.user?.id || null,
    sessionEpoch,
    async signOut(callbackUrl = "/login") {
      actorUserIdRef.current = null;
      setSessionEpoch(epoch => epoch + 1);
      setSession(null);
      setStatus("unauthenticated");
      await getBrowserSupabaseClient().auth.signOut();
      window.location.assign(callbackUrl);
    },
  }), [session, status, sessionEpoch]);

  return <SupabaseSessionContext.Provider value={value}>{children}</SupabaseSessionContext.Provider>;
}

export function useSupabaseSession() {
  const context = useContext(SupabaseSessionContext);
  if (!context) throw new Error("useSupabaseSession deve ser usado dentro de SupabaseSessionProvider.");
  return context;
}
