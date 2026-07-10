"use client";

import React, { createContext, useContext, useState, useEffect } from "react";
import { createClient } from "@supabase/supabase-js";
import { useSession } from "next-auth/react";

export interface Marca {
  id: string;
  nome: string;
  site_url: string;
  nicho: string;
  dna_diretrizes: string;
  silos_existentes: any; // jsonb array/object
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

export function BrandProvider({ children }: { children: React.ReactNode }) {
  const { data: session, status: sessionStatus } = useSession();
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
        if (saved && loadedBrands.some((b: any) => b.id === saved)) {
          setSelectedBrandIdState(saved);
        } else {
          setSelectedBrandIdState(loadedBrands[0].id);
          localStorage.setItem("selected_brand_id", loadedBrands[0].id);
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
    refreshBrands();
  }, [sessionStatus, session]);

  const activeBrand = brands.find(b => b.id === selectedBrandId) || null;

  return (
    <BrandContext.Provider 
      value={{ 
        selectedBrandId, 
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
