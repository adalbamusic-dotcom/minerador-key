"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { useSession } from "next-auth/react";
import { usePathname } from "next/navigation";
import { parseBrandRef } from "@/lib/tenant-routing";

export interface Marca {
  id: string;
  nome: string;
  site_url: string;
  nicho: string;
  dna_diretrizes: string;
  silos_existentes: unknown; // jsonb array/object
  localizacao: string; // Adicionado localizacao
  created_at: string;
}

interface BrandContextType {
  selectedBrandId: string;
  setSelectedBrandId: (id: string) => void;
  brands: Marca[];
  refreshBrands: () => Promise<void>;
  activeBrand: Marca | null;
  loading: boolean;
  userRole: string;
  profileLoading: boolean;
}

const BrandContext = createContext<BrandContextType | undefined>(undefined);

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
  const pathname = usePathname();
  const [brands, setBrands] = useState<Marca[]>([]);
  const [selectedBrandId, setSelectedBrandIdState] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [userRole, setUserRole] = useState<string>("cliente"); // default
  const [profileLoading, setProfileLoading] = useState(true);

  const refreshBrands = async () => {
    // Se a sessão ainda está carregando, espera.
    if (sessionStatus === "loading") return;

    // Se deslogado, nao chama /api/marcas (evita 401 e erro no console).
    // Apenas libera o loading pra a pagina de login renderizar.
    if (sessionStatus === "unauthenticated") {
      setLoading(false);
      setProfileLoading(false);
      return;
    }

    setLoading(true);
    setProfileLoading(true);

    try {
      const response = await fetch("/api/marcas");
      if (!response.ok) throw new Error("Erro ao buscar marcas da API");
      
      const data = await response.json();
      
      const loadedBrands = data.brands || [];
      const role = data.role || "cliente";
      
      setBrands(loadedBrands);
      setUserRole(role);

      // Define marca selecionada
      if (role === "cliente" && loadedBrands.length > 0) {
        const forcedBrandId = loadedBrands[0].id;
        setSelectedBrandIdState(forcedBrandId);
        localStorage.setItem("selected_brand_id", forcedBrandId);
      } else if (loadedBrands.length > 0) {
        const saved = localStorage.getItem("selected_brand_id");
        if (saved && loadedBrands.some((b: Marca) => b.id === saved)) {
          setSelectedBrandIdState(saved);
        } else {
          setSelectedBrandIdState("");
        }
      } else {
        setSelectedBrandIdState("");
      }
    } catch (err) {
      console.error("Erro ao inicializar perfil e marcas via API:", err);
    } finally {
      setLoading(false);
      setProfileLoading(false);
    }
  };

  const setSelectedBrandId = (id: string) => {
    if (userRole === "cliente") return; // Clientes não mudam a marca
    setSelectedBrandIdState(id);
    localStorage.setItem("selected_brand_id", id);
  };

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    refreshBrands();
    // refreshBrands intentionally follows session identity only.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionStatus, session]);

  // The canonical tenant comes from the route. Browser selection is only a
  // compatibility preference for legacy global routes and never an authority.
  let routeTenant = "";
  const routeRef = pathname.match(/^\/([^/]+)/)?.[1];
  if (routeRef) { try { routeTenant = parseBrandRef(routeRef).brandId; } catch { routeTenant = ""; } }
  const effectiveSelectedBrandId = routeTenant || selectedBrandId;
  const activeBrand = brands.find(b => b.id === effectiveSelectedBrandId) || null;

  return (
    <BrandContext.Provider 
      value={{ 
        selectedBrandId: effectiveSelectedBrandId,
        setSelectedBrandId, 
        brands, 
        refreshBrands, 
        activeBrand, 
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
