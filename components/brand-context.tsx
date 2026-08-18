"use client";

import React, { createContext, useContext, useState, useEffect, useRef } from "react";
import { useSupabaseSession } from "@/components/auth/supabase-session-context";
import { usePathname } from "next/navigation";
import { parseBrandRef } from "@/lib/tenant-routing";
import { readGlobalNavigationContext, writeSelectedOperationalBrandPreference } from "@/lib/navigation/global-context";
import type { OperationalBrandHint } from "@/components/shell-visual-context";

export interface Marca {
  id: string;
  nome: string;
  site_url: string;
  nicho: string;
  dna_diretrizes: string;
  silos_existentes: unknown; // jsonb array/object
  localizacao: string; // Adicionado localizacao
  created_at: string;
  status?: "active" | "suspended" | "inactive";
  owner_user_id?: string | null;
  agencyName?: string | null;
}

interface BrandContextType {
  selectedBrandId: string;
  setSelectedBrandId: (id: string) => void;
  brands: Marca[];
  refreshBrands: () => Promise<void>;
  activeBrand: Marca | null;
  activeBrandRef: string | null;
  loading: boolean;
  userRole: string;
  profileLoading: boolean;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

export function BrandProvider({ children, initialOperationalBrand = null }: { children: React.ReactNode; initialOperationalBrand?: OperationalBrandHint | null }) {
  const { data: session, status: sessionStatus } = useSupabaseSession();
  const pathname = usePathname();
  const [brands, setBrands] = useState<Marca[]>([]);
  const [selectedBrandId, setSelectedBrandIdState] = useState<string>(initialOperationalBrand?.id || "");
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("cliente"); // default
  const [profileLoading, setProfileLoading] = useState(true);
  const refreshGeneration = useRef(0);
  const initialHintConsumed = useRef(false);

  const refreshBrands = async () => {
    const generation = ++refreshGeneration.current;
    // Se a sessão ainda está carregando, espera.
    if (sessionStatus === "loading") return;

    // Se deslogado, nao chama /api/marcas (evita 401 e erro no console).
    // Apenas libera o loading pra a pagina de login renderizar.
    if (sessionStatus === "unauthenticated") {
      setBrands([]);
      setUserRole("cliente");
      setSelectedBrandIdState("");
      initialHintConsumed.current = true;
      setLoading(false);
      setProfileLoading(false);
      return;
    }

    const preserveServerHint = Boolean(initialOperationalBrand && session?.user?.id && !initialHintConsumed.current);
    setLoading(true);
    setProfileLoading(true);
    if (!preserveServerHint) {
      setBrands([]);
      setUserRole("cliente");
      setSelectedBrandIdState("");
    } else if (initialOperationalBrand) {
      setSelectedBrandIdState(initialOperationalBrand.id);
    }

    try {
      const response = await fetch("/api/marcas?scope=operational", { cache: "no-store" });
      if (!response.ok) throw new Error("Erro ao buscar marcas da API");
      
      const data = await response.json();
      
      const loadedBrands = data.brands || [];
      const role = data.role || "cliente";
      
      if (generation !== refreshGeneration.current) return;
      setBrands(loadedBrands);
      setUserRole(role);

      // A rota continua sendo a autoridade. Esta preferência apenas restaura
      // o seletor global e precisa existir na lista autorizada pelo servidor.
      const currentSelectedId = selectedBrandId && loadedBrands.some((brand: Marca) => brand.id === selectedBrandId)
        ? selectedBrandId
        : "";
      const persisted = readGlobalNavigationContext(session?.user?.id);
      const persistedBrandId = persisted?.brandId && loadedBrands.some((brand: Marca) => brand.id === persisted.brandId)
        ? persisted.brandId
        : "";
      setSelectedBrandIdState(currentSelectedId || persistedBrandId);
    } catch (err) {
      console.error("Erro ao inicializar perfil e marcas via API:", err);
    } finally {
      if (generation !== refreshGeneration.current) return;
      setLoading(false);
      setProfileLoading(false);
      initialHintConsumed.current = true;
    }
  };

  const setSelectedBrandId = (id: string) => {
    if (id && !brands.some((brand) => brand.id === id) && initialOperationalBrand?.id !== id) return;
    setSelectedBrandIdState(id);
    writeSelectedOperationalBrandPreference(id || null);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshBrands();
    // refreshBrands intentionally follows session identity only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, session?.user?.id]);

  // The canonical tenant comes from the route. Browser selection is only a
  // compatibility preference for legacy global routes and never an authority.
  let routeTenant = "";
  const routeRef = pathname.match(/^\/([^/]+)/)?.[1];
  if (routeRef) { try { routeTenant = parseBrandRef(routeRef).brandId; } catch { routeTenant = ""; } }
  const currentRouteContext = routeTenant ? { brandId: routeTenant, brandRef: routeRef || null } : null;
  const selectedOperationalBrandId = selectedBrandId;
  const activeBrandRef = currentRouteContext?.brandRef || null;
  const effectiveSelectedBrandId = currentRouteContext?.brandId || selectedOperationalBrandId;
  const activeBrand = brands.find(b => b.id === effectiveSelectedBrandId) || null;

  return (
    <BrandContext.Provider 
      value={{ 
        selectedBrandId: effectiveSelectedBrandId,
        setSelectedBrandId, 
        brands, 
        refreshBrands, 
        activeBrand, 
        activeBrandRef,
        loading,
        userRole,
        profileLoading
      }}
    >
      {children}
    </BrandContext.Provider>
  );
}

export function useBrand() {
  const context = useContext(BrandContext);
  if (context === undefined) {
    throw new Error("useBrand deve ser usado dentro de um BrandProvider");
  }
  return context;
}
