"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { CornerUpLeft, CornerUpRight, History, Search } from "lucide-react";
import { useSupabaseSession } from "@/components/auth/supabase-session-context";
import { NotificationBell } from "@/components/global-notice-center";
import { ContextHelpCenter } from "@/components/context-help-center";
import { SessionLogoutButton } from "@/components/auth/session-logout-button";
import { useBrand } from "@/components/brand-context";
import { GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY } from "@/components/global-topbar-control";
import { resolveContextHelpArea } from "@/lib/context-help";

type TopbarMode = "page" | "module";

type TopbarModel = {
  mode: TopbarMode;
  title: string;
  moduleId?: string;
};

export type GlobalTopbarModuleControls = {
  moduleId: string;
  search?: {
    getValue: () => string;
    setValue: (value: string) => void;
  };
  history?: {
    getCount: () => number;
    canUndo: () => boolean;
    canRedo: () => boolean;
    undo: () => void;
    redo: () => void;
    open: () => void;
    undoLabel?: string;
    redoLabel?: string;
    historyLabel?: string;
    undoTitle?: string;
    redoTitle?: string;
    historyTitle?: (count: number) => string;
  };
  actions?: ReactNode;
  tabs?: ReactNode;
};

export type GlobalTopbarPageControls = {
  tabs?: ReactNode;
  actions?: ReactNode;
};

type GlobalTopbarControlsContextValue = {
  controls: GlobalTopbarModuleControls | null;
  pageControls: GlobalTopbarPageControls | null;
  registerControls: (controls: GlobalTopbarModuleControls) => void;
  updateControls: (controls: GlobalTopbarModuleControls) => void;
  unregisterControls: (moduleId: string) => void;
  registerPageControls: (id: string, controls: GlobalTopbarPageControls) => void;
  unregisterPageControls: (id: string) => void;
};

const GlobalTopbarControlsContext = createContext<GlobalTopbarControlsContextValue | null>(null);

const moduleTitles: Record<string, string> = {
  marca: "Marca",
  minerador: "Minerador",
  arquiteto: "Arquiteto",
  radar: "Radar",
  planejador: "Planejador",
  redator: "Redator",
  publicacoes: "Publicações",
};

function topbarModel(pathname: string): TopbarModel {
  if (pathname.startsWith("/conta")) return { mode: "page", title: "Perfil" };
  if (pathname.startsWith("/admin")) return { mode: "page", title: "Administração" };
  if (pathname.startsWith("/agencias/")) return { mode: "page", title: "Minha Agência" };
  if (pathname.startsWith("/selecionar-marca")) return { mode: "page", title: "Selecionar marca" };
  if (/^\/[^/]+\/?$/.test(pathname)) return { mode: "page", title: "Marca" };

  const moduleId = pathname.split("/").filter(Boolean)[1] || pathname.split("/").filter(Boolean)[0] || "";
  return { mode: "module", moduleId, title: moduleTitles[moduleId] || "Workspace" };
}

function profileRoleLabel(role: string) {
  if (role === "admin") return "Admin global";
  if (role === "owner") return "Owner";
  if (role === "member") return "Membro";
  return "Usuário da plataforma";
}

export function GlobalTopbarControlsProvider({ children }: { children: React.ReactNode }) {
  const [controls, setControls] = useState<GlobalTopbarModuleControls | null>(null);
  const [pageControlsById, setPageControlsById] = useState<Record<string, GlobalTopbarPageControls>>({});
  const registerControls = useCallback((nextControls: GlobalTopbarModuleControls) => {
    setControls((current) => current === nextControls ? current : nextControls);
  }, []);
  const updateControls = useCallback((nextControls: GlobalTopbarModuleControls) => {
    setControls((current) => {
      if (!current || current.moduleId !== nextControls.moduleId || current === nextControls) return current;
      return nextControls;
    });
  }, []);
  const unregisterControls = useCallback((moduleId: string) => {
    setControls((current) => current?.moduleId === moduleId ? null : current);
  }, []);
  const registerPageControls = useCallback((id: string, nextControls: GlobalTopbarPageControls) => {
    setPageControlsById((current) => ({ ...current, [id]: nextControls }));
  }, []);
  const unregisterPageControls = useCallback((id: string) => {
    setPageControlsById((current) => {
      if (!(id in current)) return current;
      const next = { ...current };
      delete next[id];
      return next;
    });
  }, []);
  const pageControls = useMemo(() => {
    const merged: GlobalTopbarPageControls = {};
    for (const registered of Object.values(pageControlsById)) {
      if (registered.tabs !== undefined) merged.tabs = registered.tabs;
      if (registered.actions !== undefined) merged.actions = registered.actions;
    }
    return merged.tabs !== undefined || merged.actions !== undefined ? merged : null;
  }, [pageControlsById]);
  const value = useMemo(() => ({ controls, pageControls, registerControls, updateControls, unregisterControls, registerPageControls, unregisterPageControls }), [controls, pageControls, registerControls, updateControls, unregisterControls, registerPageControls, unregisterPageControls]);

  return <GlobalTopbarControlsContext.Provider value={value}>{children}</GlobalTopbarControlsContext.Provider>;
}

export function useGlobalTopbarControlsRegistration() {
  const value = useContext(GlobalTopbarControlsContext);
  if (!value) throw new Error("useGlobalTopbarControlsRegistration deve ser usado dentro de GlobalTopbarControlsProvider.");
  return value;
}

export function GlobalTopbarPageControls({ tabs, actions }: GlobalTopbarPageControls) {
  const registrationId = useId();
  const { registerPageControls, unregisterPageControls } = useGlobalTopbarControlsRegistration();
  const pageControls = useMemo(() => ({ tabs, actions }), [tabs, actions]);

  useEffect(() => {
    registerPageControls(registrationId, pageControls);
    return () => unregisterPageControls(registrationId);
  }, [pageControls, registerPageControls, registrationId, unregisterPageControls]);

  return null;
}

function ProfilePopover() {
  const { data: session } = useSupabaseSession();
  const { userRole } = useBrand();
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const name = session?.user?.name?.trim() || session?.user?.email || "Perfil";
  const email = session?.user?.email || "Sessão autenticada";
  const initials = name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase() || "P";

  useEffect(() => {
    if (!open) return;
    const closeOnOutsidePointer = (event: PointerEvent) => {
      if (event.target instanceof Node && !containerRef.current?.contains(event.target)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", closeOnOutsidePointer);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnOutsidePointer);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  return <div ref={containerRef} className="relative">
    <button type="button" onClick={() => setOpen((current) => !current)} className="inline-flex min-h-9 min-w-9 items-center justify-center rounded-md px-1.5 text-foreground/80 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent" aria-label="Abrir menu do perfil" title="Perfil" aria-expanded={open} aria-haspopup="dialog">
      <span className="flex h-7 w-7 items-center justify-center overflow-hidden rounded-full border border-divider bg-context-accent/10 text-xs font-bold text-context-accent" aria-hidden="true">
        {session?.user?.image ? <img src={session.user.image} alt="" className="h-full w-full object-cover" /> : initials.slice(0, 2)}
      </span>
    </button>
    {open ? <div className="absolute right-0 top-full z-50 mt-2 w-64 rounded-lg border border-divider bg-surface-elevated p-3 shadow-lg" role="dialog" aria-label="Dados do perfil">
      <div className="flex items-center gap-3 border-b border-divider pb-3">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center overflow-hidden rounded-full border border-divider bg-context-accent/10 text-sm font-bold text-context-accent" aria-hidden="true">
          {session?.user?.image ? <img src={session.user.image} alt="" className="h-full w-full object-cover" /> : initials.slice(0, 2)}
        </span>
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{name}</p>
          <p className="truncate text-xs text-text-muted">{email}</p>
          <p className="mt-1 text-xs text-text-muted">{profileRoleLabel(userRole)}</p>
        </div>
      </div>
      <div className="mt-3 space-y-1">
        <Link href="/conta" onClick={() => setOpen(false)} className="flex min-h-9 items-center rounded-md px-2 text-sm font-semibold text-foreground/75 hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-context-accent">Perfil</Link>
        <SessionLogoutButton compact={false} className="w-full justify-start px-2 text-sm text-foreground/75 hover:bg-foreground/10 hover:text-foreground" />
      </div>
    </div> : null}
  </div>;
}

export function GlobalTopbar({ pageTabs, pageActions, moduleActions }: { pageTabs?: ReactNode; pageActions?: ReactNode; moduleActions?: ReactNode }) {
  const pathname = usePathname();
  const model = useMemo(() => topbarModel(pathname), [pathname]);
  const contextHelpArea = useMemo(() => resolveContextHelpArea(pathname), [pathname]);
  const arquitetoLayout = model.moduleId === "arquiteto";
  const { controls, pageControls } = useGlobalTopbarControlsRegistration();
  const moduleControls = model.moduleId && controls?.moduleId === model.moduleId ? controls : null;
  const moduleActionsContent = moduleControls?.actions ?? moduleActions;
  const moduleTabsContent = moduleControls?.tabs;
  const registeredPageTabs = pageControls?.tabs !== undefined ? pageControls.tabs : pageTabs;
  const registeredPageActions = pageControls?.actions !== undefined ? pageControls.actions : pageActions;

  return <header className={`sticky top-0 z-40 flex h-10 shrink-0 items-center border-b border-divider bg-background/95 pl-14 pr-2 backdrop-blur-sm lg:pl-3 ${model.moduleId === "minerador" ? "max-sm:pl-2" : ""}`} data-global-topbar data-topbar-mode={model.mode}>
    <div className={`flex min-w-0 ${model.moduleId === "minerador" ? "max-sm:hidden" : ""} ${arquitetoLayout ? "flex-1 xl:flex-[0.6]" : "flex-1"} items-center gap-1.5`}>
      <div className={`flex min-w-0 items-center gap-2 ${model.mode === "page" ? "flex-1" : "shrink-0"}`}>
        <h1 className="truncate text-sm font-semibold uppercase text-context-accent">{model.title}</h1>
        {model.mode === "page" && registeredPageTabs ? <div className="min-w-0 flex-1 overflow-x-auto xl:overflow-visible" data-topbar-page-tabs>{registeredPageTabs}</div> : null}
      </div>

      {model.mode === "module" ? <div className="flex shrink-0 items-center gap-0.5">
         {moduleControls?.history ? <button type="button" onClick={moduleControls.history.undo} disabled={!moduleControls.history.canUndo()} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-divider bg-surface-subtle text-foreground/65 transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 active:bg-surface disabled:cursor-not-allowed disabled:opacity-30" aria-label={moduleControls.history.undoLabel || "Desfazer"} title={moduleControls.history.undoTitle || "Desfazer última alteração"}>
          <CornerUpLeft className="h-4 w-4" aria-hidden="true" />
        </button> : null}
         {moduleControls?.history ? <button type="button" onClick={moduleControls.history.redo} disabled={!moduleControls.history.canRedo()} className="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full border border-divider bg-surface-subtle text-foreground/65 transition-colors hover:border-module-accent/30 hover:bg-surface-elevated hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/30 active:bg-surface disabled:cursor-not-allowed disabled:opacity-30" aria-label={moduleControls.history.redoLabel || "Refazer"} title={moduleControls.history.redoTitle || "Refazer alteração"}>
          <CornerUpRight className="h-4 w-4" aria-hidden="true" />
        </button> : null}
        {moduleControls?.history ? <button type="button" data-global-topbar-history-button={moduleControls.moduleId} onClick={moduleControls.history.open} className="inline-flex min-h-8 min-w-8 items-center justify-center rounded-md text-foreground/65 transition-colors hover:bg-foreground/10 hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-module-accent/35" aria-label={moduleControls.history.historyLabel || "Histórico"} title={moduleControls.history.historyTitle?.(moduleControls.history.getCount()) || `Histórico (${moduleControls.history.getCount()})`}>
          <History className="h-4 w-4" aria-hidden="true" />
        </button> : null}
      </div> : null}

      {model.mode === "module" && moduleControls?.search ? <form onSubmit={(event: FormEvent<HTMLFormElement>) => event.preventDefault()} className="hidden min-w-0 flex-1 items-center md:flex" role="search">
        <label htmlFor="global-topbar-search" className="sr-only">Pesquisar nesta área</label>
        <div className="relative min-w-0 flex-1 px-2">
          <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-foreground/45" aria-hidden="true" />
           <input id="global-topbar-search" data-topbar-search type="search" value={moduleControls.search.getValue()} onChange={(event) => moduleControls.search?.setValue(event.target.value)} placeholder="Pesquisar nesta área" className={`h-8 w-full max-w-[50ch] rounded-md border border-divider bg-surface-subtle pl-9 pr-3 ${GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY} text-foreground outline-none transition-colors placeholder:text-text-muted hover:border-module-accent/25 hover:ring-1 hover:ring-module-accent/10 focus:border-module-accent/45 focus:ring-2 focus:ring-module-accent/25`} />
        </div>
      </form> : null}
    </div>

    {model.moduleId !== "minerador" ? <div className={`hidden min-w-0 ${arquitetoLayout ? "flex-1 xl:flex-[1.4]" : "flex-1"} items-center justify-center px-2 md:flex ${model.mode === "page" ? "pointer-events-none" : ""}`} data-topbar-center-slot>
      {model.mode === "page" ? <div className="pointer-events-auto w-fit">{registeredPageActions}</div> : moduleActionsContent}
    </div> : null}

    <div className="flex min-w-0 flex-1 items-center justify-end gap-1 overflow-visible">
      {model.moduleId === "minerador" && moduleActionsContent ? <div className="min-w-0 flex-1 max-w-[min(52vw,52rem)] overflow-hidden" data-topbar-module-actions>{moduleActionsContent}</div> : null}
      {moduleTabsContent ? <div className="min-w-0 shrink-0" data-topbar-module-tabs>{moduleTabsContent}</div> : null}
      <NotificationBell />
      <ContextHelpCenter key={contextHelpArea || "none"} area={contextHelpArea} />
      <ProfilePopover />
    </div>
  </header>;
}
