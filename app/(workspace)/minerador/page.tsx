"use client";

import { useState, useEffect, useRef, Fragment, useMemo } from "react";
import { createClient } from "@supabase/supabase-js";
import Papa from "papaparse";
import { 
  Key, 
  Search, 
  Loader2, 
  ArrowUpDown,
  CheckSquare,
  Square,
  Trash2,
  Check,
  X,
  Plus,
  RefreshCw,
  Undo2,
  Redo2,
  FolderPlus,
  Folders,
  ArrowRight,
  AlertTriangle,
  Play,
  FileSpreadsheet,
  Upload,
  Brain,
  ChevronDown,
  ChevronRight,
  Building2,
} from "lucide-react";
import { useBrand } from "@/components/brand-context";
import { AppMenu } from "@/components/app-menu";
import { signIn, useSession } from "next-auth/react";
import { useRouter } from "next/navigation";

// Inicializa o cliente do Supabase com as chaves pÃºblicas
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

interface ListObject {
  id: string;
  nome: string;
  nicho: string | null;
}

interface KeywordItem {
  id: string;
  keyword: string;
  location: string | null;
  results_allintitle: number | null;
  volume_search: number | null;
  kgr_score: number | null;
  intent: string | null;
  status: string;
  lista_id: string | null;
  analise_semantica?: Record<string, string> | null;
  volume_source?: string | null;
  created_at?: string;
}

// HeurÃ­stica de classificaÃ§Ã£o automÃ¡tica de intenÃ§Ã£o de busca
function autoClassifyIntent(keyword: string): string {
  const kw = keyword.toLowerCase();
  
  // Transacional / Vendas
  if (
    kw.includes("preÃ§o") || kw.includes("preco") || 
    kw.includes("comprar") || kw.includes("valor") || 
    kw.includes("contratar") || kw.includes("venda") || 
    kw.includes("alugar") || kw.includes("orÃ§amento") || 
    kw.includes("orcamento") || kw.includes("cupom") || 
    kw.includes("desconto") || kw.includes("promoÃ§Ã£o") || 
    kw.includes("promocao")
  ) {
    return "Vendas";
  }
  
  // Comercial / InvestigaÃ§Ã£o
  if (
    kw.includes("melhor") || kw.includes("ranking") || 
    kw.includes("comparar") || kw.includes("review") || 
    kw.includes("top") || kw.includes("custo beneficio") || 
    kw.includes("custo-beneficio") || kw.includes("serviÃ§o") || 
    kw.includes("clinica") || kw.includes("advogado") || 
    kw.includes("dentista") || kw.includes("empresa") || 
    kw.includes("agÃªncia") || kw.includes("agencia")
  ) {
    return "Comercial";
  }
  
  // Informativo / Educacional
  if (
    kw.includes("como") || kw.includes("o que") || 
    kw.includes("porque") || kw.includes("onde") || 
    kw.includes("quem") || kw.includes("quando") || 
    kw.includes("dicas") || kw.includes("passo a passo") || 
    kw.includes("guia") || kw.includes("tutorial") || 
    kw.includes("exemplo") || kw.includes("significado") || 
    kw.includes("definiÃ§Ã£o") || kw.includes("definicao")
  ) {
    return "Informativo";
  }
  
  return "Informativo";
}

// HeurÃ­stica de identificaÃ§Ã£o automÃ¡tica do nicho com base na palavra-chave
function autoDetectNiche(keyword: string): string {
  const kw = keyword.toLowerCase();
  
  if (
    kw.includes("dente") || kw.includes("dentista") || 
    kw.includes("aparelho") || kw.includes("clareamento") || 
    kw.includes("canal") || kw.includes("orto") || 
    kw.includes("implante") || kw.includes("harmonizaÃ§Ã£o") || 
    kw.includes("harmonizacao") || kw.includes("siso")
  ) {
    return "Odontologia";
  }
  
  if (
    kw.includes("advogado") || kw.includes("processo") || 
    kw.includes("lei") || kw.includes("direito") || 
    kw.includes("pensÃ£o") || kw.includes("pensao") || 
    kw.includes("divÃ³rcio") || kw.includes("divorcio") || 
    kw.includes("trabalhista") || kw.includes("justiÃ§a") || 
    kw.includes("justica")
  ) {
    return "Advocacia";
  }
  
  if (
    kw.includes("mÃ©dico") || kw.includes("medico") || 
    kw.includes("consulta") || kw.includes("clÃ­nica") || 
    kw.includes("clinica") || kw.includes("pediatra") || 
    kw.includes("dor") || kw.includes("terapia") || 
    kw.includes("psicÃ³logo") || kw.includes("psicologo") || 
    kw.includes("pilates") || kw.includes("fisioterapia")
  ) {
    return "SaÃºde";
  }
  
  if (
    kw.includes("cabelo") || kw.includes("unha") || 
    kw.includes("depilaÃ§Ã£o") || kw.includes("depilacao") || 
    kw.includes("massagem") || kw.includes("massagista") || 
    kw.includes("maquiagem") || kw.includes("estÃ©tica") || 
    kw.includes("estetica") || kw.includes("sobrancelha") || 
    kw.includes("cÃ­lios") || kw.includes("cilios")
  ) {
    return "EstÃ©tica";
  }
  
  if (
    kw.includes("treino") || kw.includes("academia") || 
    kw.includes("dieta") || kw.includes("personal") || 
    kw.includes("whey") || kw.includes("emagrecer") || 
    kw.includes("crossfit")
  ) {
    return "Fitness";
  }
  
  if (
    kw.includes("encanador") || kw.includes("eletricista") || 
    kw.includes("pintor") || kw.includes("reforma") || 
    kw.includes("construÃ§Ã£o") || kw.includes("construcao") || 
    kw.includes("ar condicionado") || kw.includes("limpeza") || 
    kw.includes("chaveiro") || kw.includes("desentupidora")
  ) {
    return "ServiÃ§os";
  }
  
  if (
    kw.includes("seo") || kw.includes("marketing") || 
    kw.includes("site") || kw.includes("trÃ¡fego") || 
    kw.includes("trafego") || kw.includes("leads") || 
    kw.includes("anÃºncio") || kw.includes("anuncio") || 
    kw.includes("vendas online")
  ) {
    return "Marketing";
  }
  
  return "Geral";
}

// Helper para formatar texto em slug de SEO
const toSlug = (text: string) => {
  return text
    .toString()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/\s+/g, "-")
    .replace(/[^\w\-]+/g, "")
    .replace(/\-\-+/g, "-");
};

export default function Home() {
  const { data: session, status: sessionStatus } = useSession();
  const { selectedBrandId, setSelectedBrandId, brands, userRole, profileLoading } = useBrand();
  const router = useRouter();
  const activeBrand = brands.find(b => b.id === selectedBrandId) || null;



  const getSiloSlug = (listId: string | null) => {
    if (!listId) return "";
    const listObj = lists.find(l => l.id === listId);
    if (!listObj) return "";
    if (activeBrand?.silos_existentes && Array.isArray(activeBrand.silos_existentes)) {
      const match = activeBrand.silos_existentes.find((s: any) => 
        (typeof s === "object" && s.nome === listObj.nome) ||
        (typeof s === "string" && s === listObj.nome)
      );
      if (match) {
        return typeof match === "object" ? match.slug : toSlug(match);
      }
    }
    return toSlug(listObj.nome); // fallback
  };

  const getCanonicalUrl = (item: KeywordItem) => {
    if (!activeBrand?.site_url) return "";
    let domain = activeBrand.site_url.trim();
    if (!domain.startsWith("http://") && !domain.startsWith("https://")) {
      domain = `https://${domain}`;
    }
    if (domain.endsWith("/")) {
      domain = domain.slice(0, -1);
    }
    
    const siloSlug = getSiloSlug(item.lista_id);
    const kwSlug = item.analise_semantica?.slug_sugerido || toSlug(item.keyword);
    
    if (siloSlug) {
      return `${domain}/${siloSlug}/${kwSlug}`;
    }
    return `${domain}/${kwSlug}`;
  };

  // Estados de Dados
  const [lists, setLists] = useState<ListObject[]>([]);
  const [keywords, setKeywords] = useState<KeywordItem[]>([]);
  const [filteredKeywords, setFilteredKeywords] = useState<KeywordItem[]>([]);
  const [keywordsUndoStack, setKeywordsUndoStack] = useState<KeywordItem[][]>([]);
  const [keywordsRedoStack, setKeywordsRedoStack] = useState<KeywordItem[][]>([]);
  
  // Estados de Controle/Status
  const [loading, setLoading] = useState(true);
  const [updating, setUpdating] = useState(false);
  const [importing, setImporting] = useState(false);
  const [queueProcessing, setQueueProcessing] = useState(false);
  const [queueProgress, setQueueProgress] = useState(0);
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ type: "success" | "error"; message: string } | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Estados de Filtros e OrdenaÃ§Ã£o
  const [searchQuery, setSearchQuery] = useState("");
  const [filterStatus, setFilterStatus] = useState("bruto"); // PadrÃ£o: bruto
  const [filterIntent, setFilterIntent] = useState("Todos");
  const [filterListId, setFilterListId] = useState("Todos");
  const [sortColumn, setSortColumn] = useState<"keyword" | "results_allintitle" | "volume_search" | "kgr_score" | "nicho" | "lista">("keyword");
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");

  // SeleÃ§Ãµes Lote
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());

  // Modal de CriaÃ§Ã£o de Lista
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [newListName, setNewListName] = useState("");
  const [newListNicho, setNewListNicho] = useState("");

  // Modal de ImportaÃ§Ã£o Manual (Copiar e Colar)
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [manualKeywordsText, setManualKeywordsText] = useState("");
  const [manualListId, setManualListId] = useState("");
  const [manualIntent, setManualIntent] = useState("");
  const [manualNicho, setManualNicho] = useState("");
  const [manualStatus, setManualStatus] = useState("bruto");
  const [manualLocation, setManualLocation] = useState("Brasil");

  // Modal de ExportaÃ§Ã£o
  const [isExportModalOpen, setIsExportModalOpen] = useState(false);
  const [exportFileName, setExportFileName] = useState("kgr-estrategico-export");

  // Controle do Banner de Palavras Duplicadas
  const [showDuplicateBanner, setShowDuplicateBanner] = useState(true);

  // Estado para a lista alvo da aÃ§Ã£o em lote "Mover para Lista"
  const [targetListId, setTargetListId] = useState("");

  // Estado provisÃ³rio para prÃ©-visualizar o briefing gerado (Etapa 2)
  const [briefingPreview, setBriefingPreview] = useState<any>(null);
  const [briefingEditPrincipal, setBriefingEditPrincipal] = useState("");
  const [briefingEditSlug, setBriefingEditSlug] = useState("");
  const [briefingEditHierarquia, setBriefingEditHierarquia] = useState("Pilar");
  const [briefingEditMetaTitle, setBriefingEditMetaTitle] = useState("");
  const [briefingEditMetaDescription, setBriefingEditMetaDescription] = useState("");
  const [briefingEditAnguloVenda, setBriefingEditAnguloVenda] = useState("");
  const [briefingEditCTA, setBriefingEditCTA] = useState("");
  const [briefingEditAntiCanibalizacao, setBriefingEditAntiCanibalizacao] = useState("");
  const [briefingEditLinksSugeridos, setBriefingEditLinksSugeridos] = useState<string[]>([]);
  const [briefingEditKeywordsSecundarias, setBriefingEditKeywordsSecundarias] = useState<string[]>([]);

  // NotificaÃ§Ãµes
  const showNotification = (type: "success" | "error", message: string) => {
    setNotification({ type, message });
    setTimeout(() => setNotification(null), 3000);
  };

  const pushKeywordsHistory = (snapshot = keywords) => {
    setKeywordsUndoStack(prev => [...prev.slice(-19), snapshot]);
    setKeywordsRedoStack([]);
  };

  const undoKeywords = () => {
    setKeywordsUndoStack(prev => {
      if (prev.length === 0) return prev;
      const previous = prev[prev.length - 1];
      setKeywordsRedoStack(redo => [keywords, ...redo.slice(0, 19)]);
      setKeywords(previous);
      setSelectedIds(new Set());
      showNotification("success", "Voltando uma alteraÃƒÂ§ÃƒÂ£o na lista atual.");
      return prev.slice(0, -1);
    });
  };

  const redoKeywords = () => {
    setKeywordsRedoStack(prev => {
      if (prev.length === 0) return prev;
      const next = prev[0];
      setKeywordsUndoStack(undo => [...undo.slice(-19), keywords]);
      setKeywords(next);
      setSelectedIds(new Set());
      showNotification("success", "Refazendo alteraÃƒÂ§ÃƒÂ£o na lista atual.");
      return prev.slice(1);
    });
  };

  // Carrega listas e keywords iniciais do Supabase
  const fetchData = async () => {
    if (sessionStatus !== "authenticated") return;
    setLoading(true);
    try {
      // 1. Carrega todas as listas de KGR (Categorias/Silos) filtradas por marca_id
      let listsQuery = supabase
        .from("listas_kgr")
        .select("*");
      
      if (selectedBrandId) {
        listsQuery = listsQuery.eq("marca_id", selectedBrandId);
      }
      
      const { data: listsData, error: listsError } = await listsQuery.order("nome", { ascending: true });

      if (listsError) throw listsError;
      const loadedLists = listsData || [];
      setLists(loadedLists);

      // Define a primeira lista alvo no lote se houver listas
      if (loadedLists.length > 0) {
        setTargetListId(loadedLists[0].id);
      } else {
        setTargetListId("");
      }

      // 2. Carrega as keywords pertencentes a estes silos ou sem silo (lista_id is null)
      let loadedKeywords: any[] = [];
      if (selectedBrandId) {
        const allowedListIds = loadedLists.map(l => l.id);
        let query = supabase
          .from("keywords_kgr")
          .select("*")
          .order("created_at", { ascending: false });

        if (allowedListIds.length > 0) {
          const orFilter = `lista_id.is.null,${allowedListIds.map(id => `lista_id.eq.${id}`).join(",")}`;
          query = query.or(orFilter);
        } else {
          query = query.is("lista_id", null);
        }

        const { data: keywordsData, error: keywordsError } = await query;
        if (keywordsError) throw keywordsError;
        loadedKeywords = keywordsData || [];
      } else {
        // Se nenhuma marca_id (fallback), busca todas
        const { data: keywordsData, error: keywordsError } = await supabase
          .from("keywords_kgr")
          .select("*")
          .order("created_at", { ascending: false });

        if (keywordsError) throw keywordsError;
        loadedKeywords = keywordsData || [];
      }

      // A. Identifica e APAGA palavras-chave repetidas no banco (mesma palavra na mesma lista)
      const seen = new Map<string, any>();
      const duplicatesToDelete: string[] = [];
      
      loadedKeywords.forEach(k => {
        const key = `${k.keyword.toLowerCase().trim()}-${k.lista_id || 'sem-lista'}`;
        const existing = seen.get(key);
        if (!existing) {
          seen.set(key, k);
        } else if (existing.status?.toLowerCase() === "publicado") {
          if (k.status?.toLowerCase() !== "publicado") duplicatesToDelete.push(k.id);
        } else if (k.status?.toLowerCase() === "publicado") {
          duplicatesToDelete.push(existing.id);
          seen.set(key, k);
        } else {
          duplicatesToDelete.push(k.id);
        }
      });

      if (duplicatesToDelete.length > 0) {
        console.log(`DeduplicaÃ§Ã£o automÃ¡tica: apagando ${duplicatesToDelete.length} registros repetidos...`);
        // Deleta as duplicatas do banco de dados
        const protectedIds = new Set(loadedKeywords.filter(k => k.status?.toLowerCase() === "publicado").map(k => k.id));
        const safeDuplicateIds = duplicatesToDelete.filter(id => !protectedIds.has(id));
        if (safeDuplicateIds.length > 0) {
          await supabase
          .from("keywords_kgr")
          .delete()
          .in("id", safeDuplicateIds);
        }
        
        // Remove da lista em memÃ³ria
        loadedKeywords = loadedKeywords.filter(k => !safeDuplicateIds.includes(k.id));
      }

      // B. Auto-atribuiÃ§Ã£o de nicho para listas que nÃ£o possuem nicho definido
      const listsWithoutNicho = loadedLists.filter(l => !l.nicho || l.nicho === "Geral" || l.nicho.trim() === "");
      if (listsWithoutNicho.length > 0 && loadedKeywords.length > 0) {
        const listPromises = listsWithoutNicho.map(async (list) => {
          const listKws = loadedKeywords.filter(k => k.lista_id === list.id);
          if (listKws.length > 0) {
            const detectedNicho = autoDetectNiche(listKws[0].keyword);
            await supabase
              .from("listas_kgr")
              .update({ nicho: detectedNicho })
              .eq("id", list.id);
            list.nicho = detectedNicho; // atualiza na memÃ³ria
          }
        });
        await Promise.all(listPromises);
        setLists([...loadedLists]);
      }

      // C. Auto-classificaÃ§Ã£o de intenÃ§Ã£o em segundo plano para palavras sem intenÃ§Ã£o atribuÃ­da
      const unclassified = loadedKeywords.filter(k => !k.intent);
      // D. Auto-classificaÃ§Ã£o de nicho em segundo plano para palavras sem nicho atribuÃ­do no analise_semantica
      const unniched = loadedKeywords.filter(k => !k.analise_semantica || !k.analise_semantica.nicho_override);

      if (unclassified.length > 0 || unniched.length > 0) {
        const promises: Promise<void>[] = [];

        unclassified.forEach((k) => {
          const detected = autoClassifyIntent(k.keyword);
          const updatePromise = (async () => {
            await supabase
              .from("keywords_kgr")
              .update({ intent: detected })
              .eq("id", k.id);
            k.intent = detected;
          })();
          promises.push(updatePromise);
        });

        unniched.forEach((k) => {
          const detected = autoDetectNiche(k.keyword);
          const currentSemantic = k.analise_semantica || {};
          const updatedSemantic = { ...currentSemantic, nicho_override: detected };
          const updatePromise = (async () => {
            await supabase
              .from("keywords_kgr")
              .update({ analise_semantica: updatedSemantic })
              .eq("id", k.id);
            k.analise_semantica = updatedSemantic;
          })();
          promises.push(updatePromise);
        });

        Promise.all(promises).then(() => {
          setKeywords([...loadedKeywords]);
        });
      } else {
        setKeywords(loadedKeywords);
      }

      setSelectedIds(new Set());
    } catch (err: any) {
      console.error("Erro ao carregar dados do Supabase:", err);
      showNotification("error", `Erro: ${err.message || "Erro de rede"}`);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (sessionStatus === "authenticated" && (session as any)?.accessToken) {
      supabase.auth.setSession({
        access_token: (session as any).accessToken,
        refresh_token: ""
      }).then(() => {
        fetchData();
      }).catch(err => {
        console.error("Erro ao sincronizar token na home:", err);
        fetchData();
      });
    } else {
      fetchData();
    }
  }, [selectedBrandId, sessionStatus, session]);

  // Redireciona o Admin para /marcas apenas se NENHUMA marca estiver selecionada
  useEffect(() => {
    if (sessionStatus === "authenticated" && userRole === "admin" && !selectedBrandId) {
      router.push("/marcas");
    }
  }, [sessionStatus, userRole, selectedBrandId, router]);

  // AÃ§Ã£o: Exportar selecionadas para CSV Local
  const exportSelectedToCSV = (fileName: string) => {
    if (selectedIds.size === 0) {
      showNotification("error", "Selecione pelo menos uma palavra-chave para exportar.");
      return;
    }

    const selectedKeywords = keywords.filter(k => selectedIds.has(k.id));

    // Passo 2: Varre todas as chaves Ãºnicas presentes dentro dos objetos analise_semantica
    const uniqueKeysSet = new Set<string>();
    selectedKeywords.forEach(k => {
      if (k.analise_semantica && typeof k.analise_semantica === "object") {
        Object.keys(k.analise_semantica).forEach(key => {
          uniqueKeysSet.add(key);
        });
      }
    });

    const dynamicKeys = Array.from(uniqueKeysSet).filter(key => key !== "nicho_override");

    // Mapeamento de rÃ³tulos amigÃ¡veis para chaves conhecidas do cardÃ¡pio
    const formatKeyLabel = (k: string) => {
      const labels: Record<string, string> = {
        urgencia_tempo: "UrgÃªncia Tempo",
        intencao_local: "IntenÃ§Ã£o Local",
        perfil_b2b: "Perfil B2b",
        emocao_dominante: "EmoÃ§Ã£o Dominante",
        nivel_consciencia: "NÃ­vel ConsciÃªncia",
        "objecao_implÃ­cita": "ObjeÃ§Ã£o ImplÃ­cita",
        objecao_implicita: "ObjeÃ§Ã£o ImplÃ­cita",
        poder_aquisitivo: "Poder Aquisitivo",
        gatilho_de_conversao: "Gatilho ConversÃ£o"
      };
      if (labels[k]) return labels[k];
      return k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
    };

    // Passo 3: Cria os objetos planos achatando as colunas fixas e as chaves dinÃ¢micas
    const flatData = selectedKeywords.map(k => {
      // Colunas fixas obrigatÃ³rias
      const row: Record<string, any> = {
        "Palavra-Chave": k.keyword || "",
        "Resultados": k.results_allintitle !== null ? k.results_allintitle : "",
        "Volume": k.volume_search !== null ? k.volume_search : "",
        "KGR": k.kgr_score !== null ? k.kgr_score.toFixed(3) : "",
        "IntenÃ§Ã£o": k.intent || autoClassifyIntent(k.keyword),
        "Nicho": k.analise_semantica?.nicho_override || autoDetectNiche(k.keyword),
        "Status": k.status || "bruto"
      };

      // Adiciona as colunas dinÃ¢micas encontradas
      dynamicKeys.forEach(dk => {
        const columnHeader = formatKeyLabel(dk);
        const val = k.analise_semantica ? k.analise_semantica[dk] : "";
        row[columnHeader] = val || "";
      });

      return row;
    });

    // Passo 4 & 5: Utiliza Papa.unparse com delimitador ';' para gerar o CSV
    const csvContent = Papa.unparse(flatData, {
      delimiter: ";",
      header: true
    });

    // Adiciona o BOM do UTF-8 (\uFEFF) no inÃ­cio da string para o Excel brasileiro ler acentos perfeitamente
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);

    // Garante que a extensÃ£o .csv esteja presente e limpa no nome do arquivo
    let finalFileName = fileName.trim();
    if (!finalFileName) finalFileName = "kgr-estrategico-export";
    if (!finalFileName.toLowerCase().endsWith(".csv")) {
      finalFileName += ".csv";
    }

    // Cria link temporÃ¡rio para download
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", finalFileName);
    document.body.appendChild(link);
    link.click();
    
    // Cleanup
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    showNotification("success", `Exportadas ${selectedKeywords.length} palavras no arquivo "${finalFileName}"!`);
  };

  // FunÃ§Ã£o para executar a fila de processamento semÃ¢ntico da IA (DeepSeek)
  const handleBatchAnalyze = async () => {
    if (selectedIds.size === 0) return;
    setQueueProcessing(true);
    setQueueProgress(0);
    setUpdating(true);

    const selectedKeywords = keywords.filter(k => selectedIds.has(k.id));
    let successCount = 0;
    let failCount = 0;

    try {
      let count = 0;
      for (const item of selectedKeywords) {
        count++;
        setQueueProgress(count);
        try {
          const res = await fetch("/api/analyze", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keywordId: item.id, keyword: item.keyword })
          });
          const resData = await res.json();
          if (!res.ok || !resData.success) {
            console.error(`Erro ao analisar keyword "${item.keyword}":`, resData.error);
            failCount++;
          } else {
            successCount++;
            // Atualiza a palavra-chave no estado local reativamente com o JSON retornado do DeepSeek
            setKeywords(prev => prev.map(k => k.id === item.id ? { 
              ...k, 
              analise_semantica: resData.data
            } : k));
          }
        } catch (err) {
          console.error(`Falha na requisiÃ§Ã£o para a palavra "${item.keyword}":`, err);
          failCount++;
        }
      }

      if (failCount === 0) {
        showNotification("success", `AnÃ¡lise SemÃ¢ntica de todas as ${successCount} palavras concluÃ­da!`);
      } else {
        showNotification("success", `AnÃ¡lise concluÃ­da: ${successCount} com sucesso e ${failCount} falhas.`);
      }
      setSelectedIds(new Set());
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao executar a fila de processamento semÃ¢ntico.");
    } finally {
      setQueueProcessing(false);
      setUpdating(false);
    }
  };

  // AÃ§Ã£o em Lote: Executa a classificaÃ§Ã£o de Nicho e IntenÃ§Ã£o via DeepSeek (IA real do Google Brasil)
  const handleBatchProcessIntentNiche = async () => {
    if (selectedIds.size === 0) return;
    setQueueProcessing(true);
    setQueueProgress(0);
    setUpdating(true);

    const selectedKeywords = keywords.filter(k => selectedIds.has(k.id));
    let successCount = 0;
    let failCount = 0;

    try {
      let count = 0;
      for (const item of selectedKeywords) {
        count++;
        setQueueProgress(count);
        try {
          const res = await fetch("/api/process-intent-niche", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ keywordId: item.id, keyword: item.keyword })
          });
          const resData = await res.json();
          if (!res.ok || !resData.success) {
            console.error(`Erro ao classificar keyword "${item.keyword}":`, resData.error);
            failCount++;
          } else {
            successCount++;
            // Atualiza intenÃ§Ã£o e nicho_override no estado local reativamente
            setKeywords(prev => prev.map(k => k.id === item.id ? { 
              ...k, 
              intent: resData.intent,
              analise_semantica: {
                ...(k.analise_semantica || {}),
                nicho_override: resData.nicho
              }
            } : k));
          }
        } catch (err) {
          console.error(`Falha na classificaÃ§Ã£o para a palavra "${item.keyword}":`, err);
          failCount++;
        }
      }

      if (failCount === 0) {
        showNotification("success", `ClassificaÃ§Ã£o de Nicho & IntenÃ§Ã£o de todas as ${successCount} palavras concluÃ­da!`);
      } else {
        showNotification("success", `ClassificaÃ§Ã£o concluÃ­da: ${successCount} com sucesso e ${failCount} falhas.`);
      }
      setSelectedIds(new Set());
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao executar processamento de Nicho & IntenÃ§Ã£o.");
    } finally {
      setQueueProcessing(false);
      setUpdating(false);
    }
  };

  // Memo para identificar grupos de palavras-chave duplicadas
  const duplicateGroups = useMemo(() => {
    const counts: Record<string, KeywordItem[]> = {};
    filteredKeywords.forEach(k => {
      const key = k.keyword.toLowerCase().trim();
      if (!counts[key]) counts[key] = [];
      counts[key].push(k);
    });
    return Object.values(counts).filter(group => group.length > 1);
  }, [filteredKeywords]);

  // AÃ§Ã£o: Apaga palavras repetidas na visualizaÃ§Ã£o atual (mantendo apenas 1 cÃ³pia de cada)
  const handleDeleteDuplicates = async () => {
    const idsToDelete: string[] = [];
    duplicateGroups.forEach(group => {
      // MantÃ©m o primeiro registro e manda deletar os outros
      const published = group.filter(k => k.status?.toLowerCase() === "publicado");
      const nonPublished = group.filter(k => k.status?.toLowerCase() !== "publicado");
      const toDelete = published.length > 0
        ? nonPublished.map(k => k.id)
        : nonPublished.slice(1).map(k => k.id);
      idsToDelete.push(...toDelete);
    });

    if (idsToDelete.length === 0) return;

    const confirmDelete = confirm(`Deseja realmente apagar as ${idsToDelete.length} ocorrÃªncias duplicadas, mantendo apenas 1 registro Ãºnico de cada palavra-chave?`);
    if (!confirmDelete) return;

    setUpdating(true);
    try {
      pushKeywordsHistory();
      const { error } = await supabase
        .from("keywords_kgr")
        .delete()
        .in("id", idsToDelete);

      if (error) throw error;

      setKeywords(prev => prev.filter(item => item.status?.toLowerCase() === "publicado" || !idsToDelete.includes(item.id)));
      setSelectedIds(new Set());
      showNotification("success", `${idsToDelete.length} duplicatas nÃƒÂ£o-publicadas apagadas. Publicados preservados.`);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao apagar duplicatas.");
    } finally {
      setUpdating(false);
    }
  };

  // AÃ§Ã£o em Lote: Gerar Briefing (Silo) via DeepSeek
  const handleGenerateBriefing = async () => {
    if (selectedIds.size === 0) return;
    setUpdating(true);
    setBriefingPreview(null);
    try {
      const selectedKeywords = keywords.filter(k => selectedIds.has(k.id));
      const res = await fetch("/api/generate-briefing", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: selectedKeywords })
      });
      const resData = await res.json();
      if (!res.ok || !resData.success) {
        showNotification("error", resData.error || "Erro ao gerar o briefing.");
      } else {
        const data = resData.data;
        setBriefingPreview(data);
        
        // Inicializa os estados de ediÃ§Ã£o com os dados retornados do Supabase
        setBriefingEditPrincipal(data.keyword_principal || "");
        setBriefingEditSlug(data.slug_sugerido || "");
        setBriefingEditHierarquia(data.hierarquia || "Pilar");
        setBriefingEditMetaTitle(data.meta_title || "");
        setBriefingEditMetaDescription(data.meta_description || "");
        
        const strat = data.diretrizes_estrategicas || {};
        setBriefingEditAnguloVenda(strat.angulo_de_venda || "");
        setBriefingEditCTA(strat.chamada_para_acao || "");
        setBriefingEditAntiCanibalizacao(strat.angulo_anti_canibalizacao || "");
        setBriefingEditLinksSugeridos(strat.links_internos_sugeridos || []);
        
        setBriefingEditKeywordsSecundarias(data.keywords_secundarias || []);
        showNotification("success", "Briefing de ConteÃºdo gerado com sucesso!");
      }
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao executar geraÃ§Ã£o de briefing.");
    } finally {
      setUpdating(false);
    }
  };

  // AÃ§Ã£o: Salva as ediÃ§Ãµes do Briefing no Supabase
  const handleSaveBriefing = async () => {
    if (!briefingPreview?.id) return;
    setUpdating(true);
    try {
      const { error } = await supabase
        .from("briefings_artigos")
        .update({
          slug_sugerido: briefingEditSlug,
          hierarquia: briefingEditHierarquia,
          meta_title: briefingEditMetaTitle,
          meta_description: briefingEditMetaDescription,
          diretrizes_estrategicas: {
            angulo_de_venda: briefingEditAnguloVenda,
            chamada_para_acao: briefingEditCTA,
            links_internos_sugeridos: briefingEditLinksSugeridos,
            angulo_anti_canibalizacao: briefingEditAntiCanibalizacao
          }
        })
        .eq("id", briefingPreview.id);

      if (error) throw error;

      showNotification("success", "Briefing de ConteÃºdo atualizado e finalizado com sucesso!");
      setBriefingPreview(null); // Fecha o Slide-over
      fetchData(); // Atualiza a planilha
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao salvar alteraÃ§Ãµes do briefing.");
    } finally {
      setUpdating(false);
    }
  };

  // AÃ§Ã£o: Buscar e visualizar briefing existente para o silo selecionado (Etapa 2)
  const handleViewSiloBriefing = async () => {
    if (filterListId === "Todos") return;
    
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("briefings_artigos")
        .select("*")
        .eq("silo_id", filterListId)
        .maybeSingle();

      if (error) throw error;

      if (!data) {
        showNotification("error", "Nenhum DossiÃª de Briefing gerado para este silo ainda. Selecione os termos e clique em 'Gerar Briefing (Silo)' para criÃ¡-lo.");
        return;
      }

      // Popula os estados do Slide-over para exibiÃ§Ã£o/ediÃ§Ã£o
      setBriefingPreview(data);
      setBriefingEditPrincipal(data.keyword_principal || "");
      setBriefingEditSlug(data.slug_sugerido || "");
      setBriefingEditHierarquia(data.hierarquia || "Pilar");
      setBriefingEditMetaTitle(data.meta_title || "");
      setBriefingEditMetaDescription(data.meta_description || "");
      
      const strat = data.diretrizes_estrategicas || {};
      setBriefingEditAnguloVenda(strat.angulo_de_venda || "");
      setBriefingEditCTA(strat.chamada_para_acao || "");
      setBriefingEditAntiCanibalizacao(strat.angulo_anti_canibalizacao || "");
      setBriefingEditLinksSugeridos(strat.links_internos_sugeridos || []);
      setBriefingEditKeywordsSecundarias(data.keywords_secundarias || []);

      showNotification("success", "DossiÃª de Briefing carregado!");
    } catch (err: any) {
      console.error("Erro ao carregar briefing do silo:", err);
      showNotification("error", "Erro ao buscar briefing do silo.");
    } finally {
      setLoading(false);
    }
  };

  // Importar palavras do arquivo CSV selecionado
  const handleImportCSV = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setImporting(true);

    Papa.parse(file, {
      header: true,
      skipEmptyLines: true,
      complete: async (results) => {
        try {
          const rows = results.data as any[];
          if (rows.length === 0) {
            showNotification("error", "Nenhum dado encontrado no arquivo CSV.");
            setImporting(false);
            e.target.value = "";
            return;
          }

          const parsedKeywords = [];
          
          for (const row of rows) {
            // Procura por Keyword / Palavra
            const keywordKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "keyword" || k.toLowerCase() === "palavra"
            );
            if (!keywordKey || !row[keywordKey]) continue;

            const keyword = row[keywordKey].trim();
            if (!keyword) continue;

            // Procura por Resultados
            const resultsKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "resultados" || k.toLowerCase() === "results_allintitle"
            );
            let resultsVal: number | null = null;
            if (resultsKey && row[resultsKey]) {
              const parsed = parseInt(row[resultsKey], 10);
              if (!isNaN(parsed)) resultsVal = parsed;
            }

            // Procura por Volume
            const volumeKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "volume" || k.toLowerCase() === "volume_search"
            );
            let volumeVal: number | null = null;
            if (volumeKey && row[volumeKey]) {
              const parsed = parseInt(row[volumeKey], 10);
              if (!isNaN(parsed)) volumeVal = parsed;
            }

            // Procura por Intent
            const intentKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "intent" || k.toLowerCase() === "intencao" || k.toLowerCase() === "intenÃ§Ã£o"
            );
            const intentVal = intentKey ? row[intentKey] : null;

            // Procura por Status
            const statusKey = Object.keys(row).find(
              (k) => k.toLowerCase() === "status"
            );
            let statusVal = "bruto";
            if (statusKey && row[statusKey]) {
              const s = String(row[statusKey]).trim().toLowerCase();
              if (["bruto", "aprovado", "rejeitado", "publicado"].includes(s)) {
                statusVal = s;
              }
            }

            // Procura por Silo do CSV
            const siloKey = Object.keys(row).find(
              (k) => ["silo", "lista", "categoria", "silo_slug", "silo_nome"].includes(k.toLowerCase().trim())
            );
            const rowSiloVal = siloKey ? String(row[siloKey]).trim() : "";
            
            let matchedListId = null;
            if (rowSiloVal) {
              const matchedList = lists.find(l => 
                l.nome.toLowerCase() === rowSiloVal.toLowerCase() ||
                toSlug(l.nome) === toSlug(rowSiloVal)
              );
              
              if (matchedList) {
                matchedListId = matchedList.id;
              } else {
                if (activeBrand?.silos_existentes && Array.isArray(activeBrand.silos_existentes)) {
                  const matchedSiloObj = activeBrand.silos_existentes.find((s: any) => 
                    (typeof s === "object" && (s.nome?.toLowerCase() === rowSiloVal.toLowerCase() || s.slug === toSlug(rowSiloVal))) ||
                    (typeof s === "string" && (s.toLowerCase() === rowSiloVal.toLowerCase() || toSlug(s) === toSlug(rowSiloVal)))
                  );
                  
                  if (matchedSiloObj) {
                    const sNome = typeof matchedSiloObj === "object" ? matchedSiloObj.nome : matchedSiloObj;
                    try {
                      const { data: newListData } = await supabase
                        .from("listas_kgr")
                        .insert([{
                          nome: sNome,
                          marca_id: activeBrand.id,
                          nicho: activeBrand.nicho || null
                        }])
                        .select()
                        .single();
                      
                      if (newListData) {
                        matchedListId = newListData.id;
                        lists.push(newListData); // Adiciona na memÃ³ria local
                      }
                    } catch (err) {
                      console.error("Erro ao auto-criar silo do CSV:", err);
                    }
                  }
                }
              }
            }

            if (!matchedListId && filterListId !== "Todos") {
              matchedListId = filterListId;
            }

            if (!matchedListId) {
              // Pula palavras sem associaÃ§Ã£o de Silo resolvido
              continue; 
            }

            // Procura por Slug do CSV
            const slugKey = Object.keys(row).find(
              (k) => ["slug", "slug_sugerido", "keyword_slug"].includes(k.toLowerCase().trim())
            );
            const rowSlugVal = slugKey ? String(row[slugKey]).trim().toLowerCase() : "";

            // Calcula o score KGR caso tenha ambos
            let kgrScore: number | null = null;
            if (resultsVal !== null && volumeVal !== null && volumeVal > 0) {
              kgrScore = Number((resultsVal / volumeVal).toFixed(4));
            }

            const resolvedIntent = intentVal || autoClassifyIntent(keyword);
            const resolvedNiche = autoDetectNiche(keyword);

            const semanticObj: Record<string, any> = { nicho_override: resolvedNiche };
            if (rowSlugVal) {
              semanticObj.slug_sugerido = toSlug(rowSlugVal);
            } else if (statusVal === "publicado") {
              semanticObj.slug_sugerido = toSlug(keyword);
            }

            parsedKeywords.push({
              keyword,
              results_allintitle: resultsVal,
              volume_search: volumeVal,
              kgr_score: kgrScore,
              intent: resolvedIntent,
              lista_id: matchedListId,
              status: statusVal,
              analise_semantica: semanticObj
            });
          }

          if (parsedKeywords.length === 0) {
            showNotification("error", "Nenhuma palavra-chave vÃ¡lida associada a um Silo foi encontrada. Verifique se informou a coluna Silo no CSV ou selecione um Silo padrÃ£o no topo.");
            setImporting(false);
            e.target.value = "";
            return;
          }

          // Insere dados em lote no Supabase
          const { error } = await supabase
            .from("keywords_kgr")
            .insert(parsedKeywords);

          if (error) throw error;

          showNotification("success", `${parsedKeywords.length} palavras-chave importadas com sucesso!`);
          fetchData();
        } catch (err: any) {
          console.error("Erro ao importar CSV:", err);
          showNotification("error", `Erro na importaÃ§Ã£o: ${err.message || "Erro no banco"}`);
        } finally {
          setImporting(false);
          e.target.value = "";
        }
      },
      error: (err) => {
        console.error("Erro no PapaParse:", err);
        showNotification("error", "Falha ao processar a estrutura do arquivo CSV.");
        setImporting(false);
        e.target.value = "";
      }
    });
  };
  // Abre modal de importaÃ§Ã£o manual com valores coerentes prÃ©-preenchidos
  const openManualModal = () => {
    if (filterListId !== "Todos") {
      setManualListId(filterListId);
    } else if (lists.length > 0) {
      setManualListId(lists[0].id);
    } else {
      setManualListId("");
    }
    setManualKeywordsText("");
    setManualIntent("");
    setManualNicho("");
    setManualStatus("bruto");
    setManualLocation("Brasil");
    setIsManualModalOpen(true);
  };

  // Salva palavras importadas de forma manual (copiar/colar) no Supabase em lote
  const handleManualImport = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualKeywordsText.trim()) {
      showNotification("error", "Digite ou cole pelo menos uma palavra-chave.");
      return;
    }
    if (!manualListId) {
      showNotification("error", "Selecione uma Categoria/Silo para associar os novos termos.");
      return;
    }

    setUpdating(true);
    try {
      const keywordLines = manualKeywordsText
        .split("\n")
        .map(line => line.trim())
        .filter(line => line.length > 0);

      if (keywordLines.length === 0) {
        showNotification("error", "Nenhuma palavra-chave vÃ¡lida encontrada no texto.");
        setUpdating(false);
        return;
      }

      const payload = keywordLines.map(keyword => {
        const analise = manualNicho ? { nicho_override: manualNicho } : null;
        return {
          keyword,
          location: manualLocation.trim() || null,
          results_allintitle: null,
          volume_search: null,
          kgr_score: null,
          intent: manualIntent || null,
          status: manualStatus,
          lista_id: manualListId,
          analise_semantica: analise
        };
      });

      const { error } = await supabase
        .from("keywords_kgr")
        .insert(payload);

      if (error) throw error;

      showNotification("success", `${payload.length} palavras-chave importadas manualmente com sucesso!`);
      setIsManualModalOpen(false);
      fetchData();
    } catch (err: any) {
      console.error("Erro na importaÃ§Ã£o manual:", err);
      showNotification("error", `Erro ao importar: ${err.message || "Erro de conexÃ£o"}`);
    } finally {
      setUpdating(false);
    }
  };

  // Processa filtros e ordenaÃ§Ã£o localmente
  useEffect(() => {
    let result = [...keywords];

    // Filtro inicial por Status (PadrÃ£o: Bruto)
    if (filterStatus !== "Todos") {
      result = result.filter(item => (item.status || "").toLowerCase() === filterStatus.toLowerCase());
    }

    // Filtro por IntenÃ§Ã£o
    if (filterIntent !== "Todos") {
      result = result.filter(item => {
        if (filterIntent === "Sem Classif.") return !item.intent;
        return item.intent === filterIntent;
      });
    }

    // Filtro por Lista/Silo
    if (filterListId !== "Todos") {
      result = result.filter(item => item.lista_id === filterListId);
    }

    // Busca textual (Palavra ou Localidade)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      result = result.filter(item => 
        item.keyword.toLowerCase().includes(query) ||
        (item.location && item.location.toLowerCase().includes(query))
      );
    }

    // OrdenaÃ§Ã£o dinÃ¢mica por coluna clicada
    result.sort((a, b) => {
      let valA: any = "";
      let valB: any = "";

      if (sortColumn === "keyword") {
        valA = a.keyword.toLowerCase();
        valB = b.keyword.toLowerCase();
      } else if (sortColumn === "results_allintitle") {
        valA = a.results_allintitle ?? -1;
        valB = b.results_allintitle ?? -1;
      } else if (sortColumn === "volume_search") {
        valA = a.volume_search ?? -1;
        valB = b.volume_search ?? -1;
      } else if (sortColumn === "kgr_score") {
        valA = a.kgr_score ?? -1;
        valB = b.kgr_score ?? -1;
      } else if (sortColumn === "nicho") {
        const nicheA = a.analise_semantica?.nicho_override || autoDetectNiche(a.keyword);
        const nicheB = b.analise_semantica?.nicho_override || autoDetectNiche(b.keyword);
        valA = nicheA.toLowerCase();
        valB = nicheB.toLowerCase();
      } else if (sortColumn === "lista") {
        const listA = lists.find(l => l.id === a.lista_id);
        const listB = lists.find(l => l.id === b.lista_id);
        valA = listA ? listA.nome.toLowerCase() : "";
        valB = listB ? listB.nome.toLowerCase() : "";
      }

      if (valA < valB) return sortDirection === "asc" ? -1 : 1;
      if (valA > valB) return sortDirection === "asc" ? 1 : -1;
      return 0;
    });

    setFilteredKeywords(result);
  }, [keywords, searchQuery, filterStatus, filterIntent, filterListId, sortColumn, sortDirection, lists]);

  // FunÃ§Ã£o para lidar com clique de ordenaÃ§Ã£o no cabeÃ§alho
  const handleSort = (column: typeof sortColumn) => {
    if (sortColumn === column) {
      setSortDirection(prev => prev === "asc" ? "desc" : "asc");
    } else {
      setSortColumn(column);
      setSortDirection("asc");
    }
  };

  // Renderiza o indicador de ordenaÃ§Ã£o
  const renderSortIcon = (column: typeof sortColumn) => {
    if (sortColumn !== column) return <ArrowUpDown className="w-3 h-3 text-slate-650 opacity-40 ml-1 inline" />;
    return sortDirection === "asc" 
      ? <ArrowUpDown className="w-3 h-3 text-indigo-400 ml-1 inline rotate-180 transition-transform" /> 
      : <ArrowUpDown className="w-3 h-3 text-indigo-400 ml-1 inline transition-transform" />;
  };

  // Cria nova lista (Silo/Categoria)
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) return;
    if (!selectedBrandId) {
      showNotification("error", "Selecione ou cadastre uma marca primeiro.");
      return;
    }

    try {
      const payload: Record<string, any> = {
        nome: newListName.trim(),
        nicho: newListNicho.trim() || null
      };
      if (selectedBrandId) {
        payload.marca_id = selectedBrandId;
      }

      const { data, error } = await supabase
        .from("listas_kgr")
        .insert([payload])
        .select();

      if (error) throw error;
      
      showNotification("success", "Lista criada com sucesso!");
      setNewListName("");
      setNewListNicho("");
      setIsListModalOpen(false);
      
      // Recarrega listas do banco filtradas
      let listsQuery = supabase
        .from("listas_kgr")
        .select("*");
      if (selectedBrandId) {
        listsQuery = listsQuery.eq("marca_id", selectedBrandId);
      }
      const { data: listsData } = await listsQuery.order("nome", { ascending: true });
      
      const loadedLists = listsData || [];
      setLists(loadedLists);
      if (loadedLists.length > 0 && !targetListId) {
        setTargetListId(loadedLists[0].id);
      }
    } catch (err: any) {
      console.error(err);
      showNotification("error", `Erro ao criar lista: ${err.message || "Erro no banco"}`);
    }
  };

  // AtualizaÃ§Ã£o direta de intenÃ§Ã£o na cÃ©lula da tabela (com suporte a aplicaÃ§Ã£o em massa)
  const handleUpdateIntent = async (id: string, intent: string) => {
    try {
      // Se a palavra alterada fizer parte da seleÃ§Ã£o atual, aplica a mudanÃ§a em massa
      const idsToUpdate = selectedIds.has(id) ? Array.from(selectedIds) : [id];

      const { error } = await supabase
        .from("keywords_kgr")
        .update({ intent: intent || null })
        .in("id", idsToUpdate);

      if (error) throw error;

      const idSet = new Set(idsToUpdate);
      setKeywords(prev => prev.map(k => idSet.has(k.id) ? { ...k, intent: intent || null } : k));
      showNotification("success", `IntenÃ§Ã£o atualizada para ${idsToUpdate.length} palavra(s).`);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Falha ao salvar intenÃ§Ã£o.");
    }
  };

  // AtualizaÃ§Ã£o direta da lista/grupo pertencente na cÃ©lula (com suporte a aplicaÃ§Ã£o em massa)
  const handleUpdateKeywordList = async (id: string, listId: string) => {
    try {
      // Se a palavra alterada fizer parte da seleÃ§Ã£o atual, aplica a mudanÃ§a em massa
      const rawIds = selectedIds.has(id) ? Array.from(selectedIds) : [id];
      const idsToUpdate = rawIds.filter(wordId => {
        const item = keywords.find(k => k.id === wordId);
        return item?.status?.toLowerCase() !== "publicado";
      });
      const protectedCount = rawIds.length - idsToUpdate.length;

      if (idsToUpdate.length === 0) {
        showNotification("error", "Silo de keyword publicada e bloqueado e nao pode ser alterado.");
        return;
      }

      const { error } = await supabase
        .from("keywords_kgr")
        .update({ lista_id: listId || null })
        .in("id", idsToUpdate);

      if (error) throw error;

      const idSet = new Set(idsToUpdate);
      setKeywords(prev => prev.map(k => idSet.has(k.id) ? { ...k, lista_id: listId || null } : k));
      showNotification("success", `Silo/Categoria atualizado para ${idsToUpdate.length} palavra(s). ${protectedCount > 0 ? `${protectedCount} publicada(s) preservada(s).` : ""}`);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Falha ao mover palavra-chave.");
    }
  };

  // AtualizaÃ§Ã£o direta do nicho na cÃ©lula da tabela (salvo no JSONB analise_semantica)
  const handleUpdateNiche = async (id: string, nicheValue: string) => {
    try {
      const idsToUpdate = selectedIds.has(id) ? Array.from(selectedIds) : [id];

      const promises = idsToUpdate.map(async (wordId) => {
        const wordItem = keywords.find(k => k.id === wordId);
        if (!wordItem) return;

        const currentSemantic = wordItem.analise_semantica || {};
        const updatedSemantic = { ...currentSemantic };
        if (nicheValue) {
          updatedSemantic.nicho_override = nicheValue;
        } else {
          delete updatedSemantic.nicho_override;
        }

        const { error } = await supabase
          .from("keywords_kgr")
          .update({ analise_semantica: updatedSemantic })
          .eq("id", wordId);

        if (error) throw error;
      });

      await Promise.all(promises);

      // Atualiza no estado local
      setKeywords(prev => prev.map(k => {
        if (idsToUpdate.includes(k.id)) {
          const currentSemantic = k.analise_semantica || {};
          const updatedSemantic = { ...currentSemantic };
          if (nicheValue) {
            updatedSemantic.nicho_override = nicheValue;
          } else {
            delete updatedSemantic.nicho_override;
          }
          return { ...k, analise_semantica: updatedSemantic };
        }
        return k;
      }));

      showNotification("success", `Nicho atualizado para ${idsToUpdate.length} palavra(s).`);
    } catch (err: any) {
      console.error("Erro ao salvar nicho:", err);
      showNotification("error", "Falha ao salvar nicho.");
    }
  };

  // AtualizaÃ§Ã£o direta do status na cÃ©lula da tabela (com suporte a aplicaÃ§Ã£o em massa)
  const handleUpdateStatus = async (id: string, status: string) => {
    try {
      const rawIds = selectedIds.has(id) ? Array.from(selectedIds) : [id];
      const idsToUpdate = rawIds.filter(wordId => {
        const item = keywords.find(k => k.id === wordId);
        return item?.status?.toLowerCase() !== "publicado";
      });
      const protectedCount = rawIds.length - idsToUpdate.length;

      if (idsToUpdate.length === 0) {
        showNotification("error", "Status publicado e bloqueado e nao pode ser rebaixado.");
        return;
      }

      const { error } = await supabase
        .from("keywords_kgr")
        .update({ status: status })
        .in("id", idsToUpdate);

      if (error) throw error;

      const idSet = new Set(idsToUpdate);
      setKeywords(prev => prev.map(k => idSet.has(k.id) ? { ...k, status: status } : k));
      showNotification("success", `Status atualizado para ${idsToUpdate.length} palavra(s). ${protectedCount > 0 ? `${protectedCount} publicada(s) preservada(s).` : ""}`);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Falha ao salvar status.");
    }
  };

  // Checkboxes
  const handleToggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  const handleToggleSelectAll = () => {
    if (selectedIds.size === filteredKeywords.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredKeywords.map(k => k.id)));
    }
  };

  // AÃ§Ã£o em Lote: Mover para Lista
  const handleBatchMove = async () => {
    if (selectedIds.size === 0 || !targetListId) return;
    const selectedItems = keywords.filter(item => selectedIds.has(item.id));
    const movableIds = selectedItems
      .filter(item => item.status?.toLowerCase() !== "publicado")
      .map(item => item.id);
    const protectedCount = selectedItems.length - movableIds.length;

    if (movableIds.length === 0) {
      showNotification("error", "Nada foi movido: publicados nao podem trocar de Silo/Categoria.");
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from("keywords_kgr")
        .update({ lista_id: targetListId })
        .in("id", movableIds);

      if (error) throw error;

      const movableSet = new Set(movableIds);
      setKeywords(prev => prev.map(item => 
        movableSet.has(item.id) ? { ...item, lista_id: targetListId } : item
      ));
      setSelectedIds(new Set());
      showNotification("success", `Palavras nao-publicadas movidas com sucesso. ${protectedCount > 0 ? `${protectedCount} publicada(s) preservada(s).` : ""}`);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao mover palavras de lista.");
    } finally {
      setUpdating(false);
    }
  };

  // AÃ§Ã£o em Lote: Aprovar KGR
  const handleBatchApprove = async () => {
    if (selectedIds.size === 0) return;
    const selectedItems = keywords.filter(item => selectedIds.has(item.id));
    const approvableIds = selectedItems
      .filter(item => item.status?.toLowerCase() !== "publicado")
      .map(item => item.id);
    const protectedCount = selectedItems.length - approvableIds.length;

    if (approvableIds.length === 0) {
      showNotification("error", "Nada foi aprovado: publicados ja estao bloqueados e preservados.");
      return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from("keywords_kgr")
        .update({ status: "aprovado" })
        .in("id", approvableIds);

      if (error) throw error;

      const approvableSet = new Set(approvableIds);
      setKeywords(prev => prev.map(item => 
        approvableSet.has(item.id) ? { ...item, status: "aprovado" } : item
      ));
      setSelectedIds(new Set());
      showNotification("success", `Palavras nao-publicadas aprovadas com sucesso. ${protectedCount > 0 ? `${protectedCount} publicada(s) preservada(s).` : ""}`);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao aprovar palavras-chave.");
    } finally {
      setUpdating(false);
    }
  };

  // AÃ£o em Lote: Marcar como Publicado
  const handleBatchPublish = async () => {
    if (selectedIds.size === 0) return;

    // Protecao: nao publicar com dados estimados sem aviso explicito.
    const selectedItems = keywords.filter(item => selectedIds.has(item.id));
    const estimatedItems = selectedItems.filter(
      k => (k.volume_source || "real") === "estimado"
    );
    if (estimatedItems.length > 0) {
      const ok = window.confirm(
        `ATENÇÃO: ${estimatedItems.length} palavra(s) possuem volume ESTIMADO (sem dado real da API).\n\n` +
        `Publicar com dados estimados pode levar a decisões de SEO incorretas.\n` +
        `Tem certeza que deseja publicar mesmo assim?`
      );
      if (!ok) return;
    }

    setUpdating(true);
    try {
      const { error } = await supabase
        .from("keywords_kgr")
        .update({ status: "publicado" })
        .in("id", Array.from(selectedIds));

      if (error) throw error;

      setKeywords(prev => prev.map(item =>
        selectedIds.has(item.id) ? { ...item, status: "publicado" } : item
      ));
      setSelectedIds(new Set());
      showNotification("success", "Palavras marcadas como publicadas com sucesso!");
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao publicar palavras-chave.");
    } finally {
      setUpdating(false);
    }
  };

  // AÃ§Ã£o em Lote: Descobrir Resultados, Volumes e calcular KGR (Qualificar/Quantificar)
  const handleBatchQualify = async () => {
    if (selectedIds.size === 0) return;
    setUpdating(true);
    showNotification("success", `Qualificando ${selectedIds.size} palavras-chave...`);

    const selectedKeywords = keywords.filter(k => selectedIds.has(k.id));
    const keywordStrings = selectedKeywords.map(k => k.keyword);

    try {
      // 1. Busca os volumes de pesquisa na API do Keywords Everywhere / RapidAPI
      const response = await fetch("/api/volume", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ keywords: keywordStrings })
      });
      const resData = await response.json();

      // 2. Processa cada termo e salva os valores + KGR no banco.
      //    REGRA: nunca inventar dados. Se a API falhar, marca como 'estimado'
      //    e mantem volume/allintitle nulos (KGR nao calculado). Dados estimados
      //    nao podem sustentar publicacao sem aviso.
      const apiOk = resData.success && resData.data;
      let estimatedCount = 0;

      for (const item of selectedKeywords) {
        let volume: number | null = null;
        let volumeSource = "estimado";

        if (apiOk) {
          const apiItem = Array.isArray(resData.data)
            ? resData.data.find((d: any) => d.keyword === item.keyword)
            : resData.data[item.keyword];

          if (apiItem && apiItem.vol !== undefined && apiItem.vol !== null) {
            volume = apiItem.vol;
            volumeSource = "real";
          } else if (apiItem && apiItem.volume !== undefined && apiItem.volume !== null) {
            volume = apiItem.volume;
            volumeSource = "real";
          }
        }

        if (volumeSource === "estimado") estimatedCount++;

        // allintitle: apenas valor real ja salvo; nunca gera numero aleatorio
        const allintitle = item.results_allintitle ?? null;

        // KGR = allintitle / volume (so se ambos reais e > 0)
        const kgr =
          volume !== null && volume > 0 && allintitle !== null
            ? Number((allintitle / volume).toFixed(4))
            : null;

        await supabase
          .from("keywords_kgr")
          .update({
            volume_search: volume,
            results_allintitle: allintitle,
            kgr_score: kgr,
            volume_source: volumeSource
          })
          .eq("id", item.id);
      }

      if (estimatedCount > 0) {
        showNotification(
          "error",
          `${estimatedCount} palavra(s) sem volume real (API falhou). Marcadas como "Estimado" — revise antes de publicar.`
        );
      } else {
        showNotification("success", "Qualificação de KGR concluída com sucesso!");
      }
      fetchData();
      setSelectedIds(new Set());
    } catch (err: any) {
      console.error(err);
      showNotification("error", `Erro ao qualificar KGR: ${err.message || "Erro de conexão"}`);
    } finally {
      setUpdating(false);
    }
  };

  // AÃ§Ã£o em Lote: Excluir com dupla confirmaÃ§Ã£o
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const selectedItems = keywords.filter(item => selectedIds.has(item.id));
    const deletableIds = selectedItems
      .filter(item => item.status?.toLowerCase() !== "publicado")
      .map(item => item.id);
    const protectedCount = selectedItems.length - deletableIds.length;
    if (deletableIds.length === 0) {
      showNotification("error", "Nada foi apagado: publicados estÃƒÂ£o protegidos.");
      return;
    }
    
    // Primeira ConfirmaÃ§Ã£o
    const firstConfirm = confirm(`Deseja realmente excluir ${deletableIds.length} palavra(s) nao-publicada(s)? ${protectedCount > 0 ? `${protectedCount} publicada(s) serao preservadas.` : ""}`);
    if (!firstConfirm) return;

    // Segunda ConfirmaÃ§Ã£o
    const secondConfirm = confirm(`ATENÃ‡ÃƒO: Esta aÃ§Ã£o Ã© permanente e removerÃ¡ definitivamente os registros do Supabase. Tem certeza absoluta de que deseja excluir estas palavras?`);
    if (!secondConfirm) return;

    setUpdating(true);
    try {
      const { error } = await supabase
        .from("keywords_kgr")
        .delete()
        .in("id", deletableIds);

      if (error) throw error;

      pushKeywordsHistory();
      setKeywords(prev => prev.filter(item => item.status?.toLowerCase() === "publicado" || !deletableIds.includes(item.id)));
      setSelectedIds(new Set());
      showNotification("success", "Palavras excluÃ­das com sucesso.");
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao excluir palavras.");
    } finally {
      setUpdating(false);
    }
  };

  if (sessionStatus === "loading") {
    return (
      <div className="min-h-screen bg-[#06070a] text-slate-200 flex items-center justify-center font-mono">
        <Loader2 className="w-8 h-8 text-indigo-500 animate-spin" />
      </div>
    );
  }

  if (sessionStatus === "unauthenticated") {
    return (
      <div className="min-h-screen bg-[#06070a] text-slate-200 flex flex-col items-center justify-center p-6 text-center font-mono">
        <Building2 className="w-12 h-12 text-indigo-500 mb-3" />
        <h1 className="text-lg font-bold text-white uppercase tracking-wider">Minerador KGR</h1>
        <p className="text-xs text-slate-400 mt-2 max-w-sm leading-relaxed">
          Ãrea restrita. Por favor, faÃ§a login com suas credenciais para acessar a plataforma.
        </p>
        <button 
          onClick={() => signIn()} 
          className="mt-6 bg-indigo-650 hover:bg-indigo-600 text-white rounded px-6 py-2.5 font-bold text-xs transition-colors shadow-lg shadow-indigo-950/40 cursor-pointer"
        >
          Fazer Login
        </button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#06070a] text-slate-200 flex flex-col font-mono text-xs select-none">
      
      {/* NotificaÃ§Ã£o pop-up */}
      {notification && (
        <div className={`fixed top-4 right-4 z-50 flex items-center gap-2 px-3 py-2 rounded border shadow-xl ${
          notification.type === "success" 
            ? "bg-emerald-950 border-emerald-800 text-emerald-400" 
            : "bg-rose-955 border-rose-800 text-rose-400"
        }`}>
          <Check className="w-3.5 h-3.5" />
          <span>{notification.message}</span>
        </div>
      )}

      {/* BARRA UNICA: FERRAMENTAS DO MINERADOR + MENU HAMBURGER DE NAVEGABILIDADE */}
      <div className="bg-[#0b0c10] border-b border-slate-900 px-3 h-10 flex items-center justify-between sticky top-0 z-30 font-mono shrink-0 overflow-x-auto">
        {/* Esquerda: Identidade + Busca + Filtros + Ferramentas locais da Planilha */}
        <div className="flex items-center gap-2 py-1">
          <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px] shrink-0">Minerador</span>
          <span className="text-slate-800 select-none shrink-0">Â·</span>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={undoKeywords}
              disabled={keywordsUndoStack.length === 0}
              className="p-1 text-slate-600 hover:text-slate-300 border border-slate-800 hover:border-slate-650 rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Voltar uma alteracao"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redoKeywords}
              disabled={keywordsRedoStack.length === 0}
              className="p-1 text-slate-600 hover:text-slate-300 border border-slate-800 hover:border-slate-650 rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Refazer alteracao"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="text-slate-800 select-none shrink-0">|</span>

          {/* Busca */}
          <div className="relative shrink-0">
            <Search className="w-3 h-3 text-slate-600 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" placeholder="Buscar..." value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-36 bg-transparent border border-slate-800 rounded pl-6 pr-2 py-0.5 text-[10.5px] text-slate-200 placeholder-slate-700 focus:outline-none focus:border-slate-600 transition-colors" />
          </div>

          <span className="text-slate-800 select-none shrink-0">|</span>

          {/* Status */}
          <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
            className="bg-transparent border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-400 focus:outline-none cursor-pointer shrink-0">
            <option value="Todos" className="bg-[#0b0c10]">Status: Todos</option>
            <option value="bruto" className="bg-[#0b0c10]">Bruto</option>
            <option value="aprovado" className="bg-[#0b0c10]">Aprovado</option>
            <option value="rejeitado" className="bg-[#0b0c10]">Rejeitado</option>
            <option value="publicado" className="bg-[#0b0c10]">Publicado</option>
          </select>

          {/* IntenÃ§Ã£o */}
          <select value={filterIntent} onChange={(e) => setFilterIntent(e.target.value)}
            className="bg-transparent border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-400 focus:outline-none cursor-pointer shrink-0">
            <option value="Todos" className="bg-[#0b0c10]">IntenÃ§Ã£o: Todos</option>
            <option value="Informativo" className="bg-[#0b0c10]">Informativo</option>
            <option value="Comercial" className="bg-[#0b0c10]">Comercial</option>
            <option value="Vendas" className="bg-[#0b0c10]">Vendas</option>
            <option value="Sem Classif." className="bg-[#0b0c10]">Sem Classif.</option>
          </select>

          {/* Silo */}
          <select value={filterListId} onChange={(e) => setFilterListId(e.target.value)}
            className="bg-transparent border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-400 focus:outline-none cursor-pointer shrink-0 max-w-[130px]">
            <option value="Todos" className="bg-[#0b0c10]">Silo: Todos</option>
            {lists.map(list => (
              <option key={list.id} value={list.id} className="bg-[#0b0c10]">{list.nome}</option>
            ))}
          </select>

          <span className="text-slate-800 select-none shrink-0">|</span>

          {/* Importar CSV */}
          <button onClick={() => fileInputRef.current?.click()} disabled={importing}
            className="flex items-center gap-1 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-50 cursor-pointer shrink-0"
            title="Importar arquivo CSV">
            {importing ? <Loader2 className="w-3 h-3 animate-spin" /> : <Upload className="w-3 h-3" />}
            <span>CSV</span>
          </button>

          {/* Importar Manual */}
          <button onClick={openManualModal}
            className="flex items-center gap-1 border border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-600 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer shrink-0"
            title="Adicionar palavras manualmente">
            <Plus className="w-3 h-3" />
            <span>Manual</span>
          </button>
          <input type="file" ref={fileInputRef} accept=".csv" onChange={handleImportCSV} className="hidden" />

          {/* Exportar */}
          <button onClick={() => {
              if (selectedIds.size === 0) { showNotification("error", "Selecione pelo menos uma palavra-chave para exportar."); return; }
              setExportFileName(`kgr-export-${new Date().toISOString().slice(0, 10)}`);
              setIsExportModalOpen(true);
            }}
            className="flex items-center gap-1 border border-slate-800 hover:border-emerald-805 text-emerald-500 hover:text-emerald-450 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer shrink-0"
            title="Exportar selecionadas para CSV">
            <FileSpreadsheet className="w-3 h-3" />
            <span>Exportar</span>
          </button>

          {/* Refresh */}
          <button onClick={fetchData}
            className="p-1 text-slate-600 hover:text-slate-300 border border-slate-800 hover:border-slate-650 rounded transition-colors cursor-pointer shrink-0"
            title="Recarregar planilha">
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>

        <AppMenu active="minerador" countLabel={filteredKeywords.length > 0 ? `${filteredKeywords.length} termos` : undefined} />
      </div>


      {/* PLANILHA PRINCIPAL */}
      <main className="flex-1 overflow-auto relative">
        {/* Slide-over de EdiÃ§Ã£o e VisualizaÃ§Ã£o do Briefing */}
        {briefingPreview && (
          <div className="fixed inset-0 z-50 overflow-hidden bg-black/50 backdrop-blur-xs flex justify-end">
            <div className="w-full max-w-lg bg-[#0b0c10] border-l border-slate-900 shadow-2xl flex flex-col h-full animate-in slide-in-from-right-full duration-200">
              {/* CabeÃ§alho */}
              <div className="px-5 py-4 border-b border-slate-900 bg-slate-950 flex items-center justify-between">
                <div>
                  <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-widest block mb-0.5">DossiÃª de ConteÃºdo (Etapa 2)</span>
                  <h2 className="text-sm font-bold text-white uppercase tracking-wide truncate max-w-[340px]" title={briefingEditPrincipal}>
                    {briefingEditPrincipal}
                  </h2>
                </div>
                <button 
                  onClick={() => setBriefingPreview(null)}
                  className="text-slate-500 hover:text-white transition-colors"
                  title="Fechar Painel"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              {/* ConteÃºdo Central RolÃ¡vel */}
              <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-5 whitespace-normal">
                
                {/* Keywords SecundÃ¡rias */}
                {briefingEditKeywordsSecundarias.length > 0 && (
                  <div className="flex flex-col gap-1.5">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Keywords SecundÃ¡rias (H2/H3)</label>
                    <div className="flex flex-wrap gap-1.5">
                      {briefingEditKeywordsSecundarias.map((kw, i) => (
                        <span key={i} className="bg-indigo-950/20 border border-indigo-900/30 text-indigo-300 text-[10px] px-2 py-0.5 rounded-full font-semibold">
                          {kw}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                {/* Slug Sugerido */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider flex items-center gap-1">
                      Slug da URL
                      {(briefingPreview?.status?.toLowerCase() === "publicado" || 
                        keywords.find(k => k.keyword.toLowerCase() === briefingEditPrincipal.toLowerCase())?.status?.toLowerCase() === "publicado") && (
                        <span className="text-red-500 font-bold text-[9px] flex items-center gap-0.5" title="Publicado em produÃ§Ã£o - Bloqueado">
                          ðŸ”’ Bloqueado (Keyword Publicada)
                        </span>
                      )}
                    </label>
                  </div>
                  <input 
                    type="text"
                    value={briefingEditSlug}
                    disabled={
                      briefingPreview?.status?.toLowerCase() === "publicado" || 
                      keywords.find(k => k.keyword.toLowerCase() === briefingEditPrincipal.toLowerCase())?.status?.toLowerCase() === "publicado"
                    }
                    onChange={(e) => {
                      const value = e.target.value;
                      setBriefingEditSlug(toSlug(value));
                    }}
                    className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-650 text-xs font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
                    placeholder="ex: captacao-clientes-clinica"
                  />
                </div>

                {/* Hierarquia */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Hierarquia do Artigo</label>
                  <select
                    value={briefingEditHierarquia}
                    onChange={(e) => setBriefingEditHierarquia(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-850 rounded px-2 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-650 cursor-pointer text-xs font-semibold"
                  >
                    <option value="Pilar" className="bg-[#0b0c10]">Pilar (Guia Completo)</option>
                    <option value="Suporte" className="bg-[#0b0c10]">Suporte (DÃºvida EspecÃ­fica)</option>
                  </select>
                </div>

                {/* Meta Title */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Meta Title (SEO)</label>
                    <span className={`text-[9px] font-bold ${briefingEditMetaTitle.length > 60 ? "text-red-500 animate-pulse" : "text-slate-500"}`}>
                      {briefingEditMetaTitle.length}/60
                    </span>
                  </div>
                  <input 
                    type="text"
                    value={briefingEditMetaTitle}
                    onChange={(e) => setBriefingEditMetaTitle(e.target.value)}
                    className={`w-full bg-[#06070a] border rounded px-2.5 py-1.5 text-slate-200 focus:outline-none text-xs font-semibold ${
                      briefingEditMetaTitle.length > 60 ? "border-red-900 focus:border-red-650" : "border-slate-850 focus:border-indigo-650"
                    }`}
                    placeholder="TÃ­tulo magnÃ©tico otimizado..."
                  />
                </div>

                {/* Meta Description */}
                <div className="flex flex-col gap-1">
                  <div className="flex justify-between items-center">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Meta Description</label>
                    <span className={`text-[9px] font-bold ${briefingEditMetaDescription.length > 155 ? "text-red-500 animate-pulse" : "text-slate-500"}`}>
                      {briefingEditMetaDescription.length}/155
                    </span>
                  </div>
                  <textarea 
                    rows={2.5}
                    value={briefingEditMetaDescription}
                    onChange={(e) => setBriefingEditMetaDescription(e.target.value)}
                    className={`w-full bg-[#06070a] border rounded px-2.5 py-1.5 text-slate-200 focus:outline-none text-xs font-semibold resize-none ${
                      briefingEditMetaDescription.length > 155 ? "border-red-900 focus:border-red-650" : "border-slate-850 focus:border-indigo-650"
                    }`}
                    placeholder="Resumo focado em cliques (CTR)..."
                  />
                </div>

                {/* Painel de Diretrizes EstratÃ©gicas */}
                <div className="flex flex-col gap-3">
                  <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Diretrizes EstratÃ©gicas</span>
                  
                  {/* Ã‚ngulo de Venda */}
                  <div className="bg-[#06070a] border border-slate-900 rounded p-3 flex flex-col gap-1">
                    <span className="text-[9.5px] font-bold text-indigo-400">ðŸ’¡ Ã‚ngulo de Venda Sugerido</span>
                    <p className="text-[11.5px] text-slate-350 leading-relaxed whitespace-pre-wrap">{briefingEditAnguloVenda}</p>
                  </div>

                  {/* Chamada para AÃ§Ã£o */}
                  <div className="bg-[#06070a] border border-slate-900 rounded p-3 flex flex-col gap-1">
                    <span className="text-[9.5px] font-bold text-teal-400">âš¡ Chamada Para AÃ§Ã£o (CTA)</span>
                    <p className="text-[11.5px] text-slate-350 leading-relaxed whitespace-pre-wrap">{briefingEditCTA}</p>
                  </div>

                  {/* Ã‚ngulo Anti-CanibalizaÃ§Ã£o */}
                  {briefingEditAntiCanibalizacao && (
                    <div className="bg-[#06070a] border border-slate-900 rounded p-3 flex flex-col gap-1">
                      <span className="text-[9.5px] font-bold text-amber-400">ðŸ›¡ï¸ Ã‚ngulo Anti-CanibalizaÃ§Ã£o</span>
                      <p className="text-[11.5px] text-slate-350 leading-relaxed whitespace-pre-wrap">{briefingEditAntiCanibalizacao}</p>
                    </div>
                  )}

                  {/* Links Internos Sugeridos */}
                  {briefingEditLinksSugeridos.length > 0 && (
                    <div className="bg-[#06070a] border border-slate-900 rounded p-3 flex flex-col gap-2">
                      <span className="text-[9.5px] font-bold text-blue-400">ðŸ”— Links Internos Sugeridos</span>
                      <div className="flex flex-wrap gap-1.5">
                        {briefingEditLinksSugeridos.map((slug, i) => (
                          <span key={i} className="bg-blue-955/20 border border-blue-900/30 text-blue-300 text-[9.5px] px-2 py-0.5 rounded font-mono">
                            /{slug}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                </div>
              </div>

              {/* RodapÃ© Fixo */}
              <div className="p-4 border-t border-slate-900 bg-slate-950 flex items-center justify-end gap-2 text-xs">
                <button 
                  type="button" 
                  onClick={() => setBriefingPreview(null)}
                  className="bg-[#06070a] hover:bg-slate-900 border border-slate-800 text-slate-400 font-bold py-2 px-4 rounded transition-all"
                >
                  Descartar
                </button>
                <button 
                  type="button" 
                  onClick={handleSaveBriefing}
                  disabled={updating}
                  className="bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold py-2 px-5 rounded transition-all flex items-center gap-1.5"
                >
                  {updating && <Loader2 className="w-4 h-4 animate-spin" />}
                  <span>Confirmar e Salvar Briefing</span>
                </button>
              </div>

            </div>
          </div>
        )}
        {loading ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[#06070a]/90">
            <Loader2 className="w-6 h-6 text-indigo-500 animate-spin mb-2" />
            <span className="text-[10px] text-slate-500 font-mono">Buscando do Supabase...</span>
          </div>
        ) : filteredKeywords.length === 0 ? (
          <div className="p-16 text-center">
            <AlertTriangle className="w-6 h-6 text-slate-655 mx-auto mb-2" />
            <p className="font-bold text-slate-400">Nenhuma palavra-chave encontrada</p>
            <p className="text-[10px] text-slate-600 mt-1">Insira palavras do banco ou utilize filtros diferentes.</p>
          </div>
        ) : (
          <>
            {duplicateGroups.length > 0 && showDuplicateBanner && (
              <div className="bg-amber-955/20 border-b border-amber-900/60 text-amber-300 px-4 py-2.5 text-[11px] flex items-center justify-between gap-4 animate-in slide-in-from-top-4">
                <div className="flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 animate-pulse" />
                  <span>
                    AtenÃ§Ã£o: Existem <strong>{duplicateGroups.length} palavras-chave repetidas</strong> nesta visualizaÃ§Ã£o.
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs font-semibold">
                  <button
                    onClick={handleDeleteDuplicates}
                    className="bg-amber-600/90 hover:bg-amber-500 text-white font-bold px-3 py-1 rounded transition-all shrink-0 shadow-lg"
                  >
                    Apagar Duplicadas (Manter apenas 1)
                  </button>
                  <button
                    onClick={() => setShowDuplicateBanner(false)}
                    className="text-slate-400 hover:text-white font-semibold px-2 py-1 shrink-0 transition-colors"
                  >
                    Ignorar Alerta
                  </button>
                </div>
              </div>
            )}
            <table className="w-full border-collapse text-left text-[12.5px] font-sans tracking-wide whitespace-nowrap">
            
            {/* CabeÃ§alho Fixo OrdenÃ¡vel */}
            <thead className="bg-[#0b0c10] border-b border-slate-900 sticky top-0 z-20">
              <tr className="text-slate-500">
                <th className="py-2 px-2 text-center border-r border-slate-900/50 w-8 font-mono text-[10px]">#</th>
                <th className="py-2 px-3 w-8 text-center border-r border-slate-900/50">
                  <button onClick={handleToggleSelectAll} className="hover:text-indigo-400 transition-colors inline-block align-middle">
                    {selectedIds.size === filteredKeywords.length ? (
                      <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />
                    ) : (
                      <Square className="w-3.5 h-3.5" />
                    )}
                  </button>
                </th>
                <th 
                  className="py-2 px-3 border-r border-slate-900/50 cursor-pointer hover:bg-slate-900/50 transition-colors" 
                  onClick={() => handleSort("keyword")}
                >
                  Palavra-Chave {renderSortIcon("keyword")}
                </th>
                <th 
                  className="py-2 px-3 text-center border-r border-slate-900/50 w-24 cursor-pointer hover:bg-slate-900/50 transition-colors" 
                  onClick={() => handleSort("results_allintitle")}
                >
                  Resultados {renderSortIcon("results_allintitle")}
                </th>
                <th 
                  className="py-2 px-3 text-center border-r border-slate-900/50 w-24 cursor-pointer hover:bg-slate-900/50 transition-colors" 
                  onClick={() => handleSort("volume_search")}
                >
                  Volume {renderSortIcon("volume_search")}
                </th>
                <th 
                  className="py-2 px-3 text-center border-r border-slate-900/50 w-24 cursor-pointer hover:bg-slate-900/50 transition-colors" 
                  onClick={() => handleSort("kgr_score")}
                >
                  KGR {renderSortIcon("kgr_score")}
                </th>
                <th className="py-2 px-3 text-center border-r border-slate-900/50 w-36">
                  IntenÃ§Ã£o
                </th>
                <th 
                  className="py-2 px-3 text-center border-r border-slate-900/50 w-32 cursor-pointer hover:bg-slate-900/50 transition-colors" 
                  onClick={() => handleSort("nicho")}
                >
                  Nicho (Mercado) {renderSortIcon("nicho")}
                </th>
                <th 
                  className="py-2 px-3 border-r border-slate-900/50 cursor-pointer hover:bg-slate-900/50 transition-colors" 
                  onClick={() => handleSort("lista")}
                >
                  Silo/Categoria {renderSortIcon("lista")}
                </th>
                <th className="py-2 px-3 text-center w-20">Status</th>
              </tr>
            </thead>

            {/* Linhas da Planilha */}
            <tbody className="divide-y divide-slate-900/50 bg-[#06070a]">
              {filteredKeywords.map((item, index) => {
                const isSelected = selectedIds.has(item.id);
                
                // FormataÃ§Ã£o KGR de acordo com a regra estrita de Golden Ratio
                let kgrText = "-";
                let kgrColor = "text-slate-500";
                if (item.kgr_score !== null && item.volume_search !== null) {
                  kgrText = item.kgr_score.toFixed(3);
                  const score = item.kgr_score;
                  const vol = item.volume_search;
                  
                  if (score < 0.25 && vol <= 250) {
                    // Verde: KGR < 0.25 e Volume <= 250 (Regras estritas cumpridas)
                    kgrColor = "bg-emerald-950/60 text-emerald-400 border border-emerald-900/30 px-1.5 py-0.5 rounded text-[10px] font-bold";
                  } else if ((score >= 0.25 && score <= 1.00) || (vol > 250 && score < 0.25)) {
                    // Amarelo: volume Ã© alto mas dÃ¡ pra trabalhar, ou KGR estÃ¡ entre 0.25 e 1.00
                    kgrColor = "bg-amber-950/60 text-amber-400 border border-amber-900/30 px-1.5 py-0.5 rounded text-[10px] font-bold";
                  } else {
                    // Vermelho: nÃ£o se enquadra dentro das regras do KGR (KGR > 1.00)
                    kgrColor = "bg-rose-955/20 text-rose-455 border border-rose-900/30 px-1.5 py-0.5 rounded text-[10px] font-bold";
                  }
                }

                // Nicho auto-detectado da palavra-chave
                const niche = autoDetectNiche(item.keyword);

                const isExpanded = expandedRowId === item.id;

                return (
                  <Fragment key={item.id}>
                    <tr 
                      className={`hover:bg-slate-900/40 transition-colors ${
                        item.status?.toLowerCase() === "publicado"
                          ? "bg-rose-955/10 border-l-2 border-l-rose-500"
                          : isSelected 
                          ? "bg-indigo-950/20" 
                          : ""
                      }`}
                    >
                      {/* NÃºmero da Linha */}
                      <td className="py-1 px-2 text-center border-r border-slate-900/40 w-8 text-slate-500 font-mono text-[11px] select-none">
                        {index + 1}
                      </td>

                      {/* Checkbox */}
                      <td className="py-1 px-3 text-center border-r border-slate-900/40 w-8">
                        <button onClick={() => handleToggleSelect(item.id)} className="text-slate-600 hover:text-indigo-400 transition-colors inline-block align-middle">
                          {isSelected ? (
                            <CheckSquare className="w-3.5 h-3.5 text-indigo-500" />
                          ) : (
                            <Square className="w-3.5 h-3.5" />
                          )}
                        </button>
                      </td>

                      {/* Palavra */}
                      <td 
                        className="py-1 px-3 border-r border-slate-900/40 text-slate-300 max-w-xs truncate cursor-pointer hover:text-white" 
                        onClick={() => setExpandedRowId(isExpanded ? null : item.id)}
                      >
                        <div className="flex items-center gap-1.5 select-none">
                          <span className="text-slate-500 hover:text-slate-300">
                            {isExpanded ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
                          </span>
                          <span 
                            title={item.keyword} 
                            className={item.status?.toLowerCase() === "publicado" ? "text-rose-455 font-semibold" : ""}
                          >
                            {item.keyword}
                          </span>
                          {item.status?.toLowerCase() === "publicado" && (
                            <span 
                              className="ml-2 text-[10px] text-blue-400 font-mono truncate max-w-[340px] select-all"
                              title="Canonical publicado fixo: slug e URL nao podem ser alterados ou removidos."
                            >
                              {getCanonicalUrl(item) || "canonical publicado"}
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Resultados */}
                      <td className="py-1 px-3 text-center border-r border-slate-900/40 text-slate-400 font-mono">
                        {item.results_allintitle !== null ? item.results_allintitle : "-"}
                      </td>

                      {/* Volume */}
                      <td className="py-1 px-3 text-center border-r border-slate-900/40 text-slate-400 font-mono">
                        <div className="flex flex-col items-center gap-0.5">
                          <span>{item.volume_search !== null ? item.volume_search : "-"}</span>
                          {(item.volume_source || "real") === "estimado" && (
                            <span
                              className="text-[8px] uppercase tracking-wide bg-amber-950/60 text-amber-400 border border-amber-900/40 px-1 rounded font-bold"
                              title="Volume sem fonte real (API falhou). Não use para decisão editorial sem revisar."
                            >
                              Estimado
                            </span>
                          )}
                        </div>
                      </td>

                      {/* KGR */}
                      <td className="py-1 px-3 text-center border-r border-slate-900/40 font-mono">
                        {item.kgr_score !== null ? (
                          <span className={kgrColor}>
                            {kgrText}
                          </span>
                        ) : (
                          <span className="text-slate-600">-</span>
                        )}
                      </td>

                      {/* IntenÃ§Ã£o */}
                      <td className="py-0.5 px-3 text-center border-r border-slate-900/40 w-36">
                        <select
                          value={item.intent || ""}
                          onChange={(e) => handleUpdateIntent(item.id, e.target.value)}
                          className={`w-full bg-[#06070a] border border-slate-900 rounded px-1.5 py-0.5 text-[10px] font-bold focus:outline-none cursor-pointer ${
                            item.intent === "Informativo" ? "text-blue-400 border-blue-955" :
                            item.intent === "Comercial" ? "text-amber-400 border-amber-955" :
                            item.intent === "Vendas" ? "text-purple-450 border-purple-955" :
                            "text-slate-500 border-slate-900"
                          }`}
                        >
                          <option value="" className="bg-[#0b0c10] text-slate-500" disabled>Sem Classif.</option>
                          <option value="Informativo" className="bg-[#0b0c10] text-blue-400">Informativo</option>
                          <option value="Comercial" className="bg-[#0b0c10] text-amber-400">Comercial</option>
                          <option value="Vendas" className="bg-[#0b0c10] text-purple-400">Vendas</option>
                        </select>
                      </td>

                      {/* Nicho (Mercado) - SelecionÃ¡vel */}
                      <td className="py-0.5 px-3 border-r border-slate-900/40 w-32 text-center">
                        <select
                          value={item.analise_semantica?.nicho_override || "Geral"}
                          onChange={(e) => handleUpdateNiche(item.id, e.target.value)}
                          className={`bg-[#06070a] border rounded px-1.5 py-0.5 text-[10px] font-bold focus:outline-none cursor-pointer w-full text-center ${
                            (item.analise_semantica?.nicho_override) === "Odontologia" ? "text-cyan-400 border-cyan-900/40 bg-cyan-950/20" :
                            (item.analise_semantica?.nicho_override) === "Advocacia" ? "text-amber-450 border-amber-900/40 bg-amber-950/20" :
                            (item.analise_semantica?.nicho_override) === "SaÃºde" ? "text-teal-400 border-teal-900/40 bg-teal-950/20" :
                            (item.analise_semantica?.nicho_override) === "EstÃ©tica" ? "text-pink-400 border-pink-900/40 bg-pink-950/10" :
                            (item.analise_semantica?.nicho_override) === "Fitness" ? "text-emerald-400 border-emerald-900/40 bg-emerald-950/20" :
                            (item.analise_semantica?.nicho_override) === "ServiÃ§os" ? "text-orange-400 border-orange-900/40 bg-orange-950/20" :
                            (item.analise_semantica?.nicho_override) === "Marketing" ? "text-indigo-400 border-indigo-900/40 bg-indigo-950/20" :
                            "text-slate-500 border-slate-900 bg-slate-950"
                          }`}
                        >
                          <option value="Odontologia" className="bg-[#0b0c10] text-cyan-400">Odontologia</option>
                          <option value="Advocacia" className="bg-[#0b0c10] text-amber-400">Advocacia</option>
                          <option value="SaÃºde" className="bg-[#0b0c10] text-teal-400">SaÃºde</option>
                          <option value="EstÃ©tica" className="bg-[#0b0c10] text-pink-400">EstÃ©tica</option>
                          <option value="Fitness" className="bg-[#0b0c10] text-emerald-400">Fitness</option>
                          <option value="ServiÃ§os" className="bg-[#0b0c10] text-orange-400">ServiÃ§os</option>
                          <option value="Marketing" className="bg-[#0b0c10] text-indigo-400">Marketing</option>
                          <option value="Geral" className="bg-[#0b0c10] text-slate-400">Geral</option>
                        </select>
                      </td>

                      {/* Silo/Categoria (Lista Pertencente) */}
                      <td className="py-0.5 px-3 border-r border-slate-900/40">
                        <select
                          value={item.lista_id || ""}
                          onChange={(e) => handleUpdateKeywordList(item.id, e.target.value)}
                          disabled={item.status?.toLowerCase() === "publicado"}
                          className="bg-[#06070a] border border-slate-900 focus:border-indigo-650 rounded px-1.5 py-0.5 text-[10px] text-slate-355 font-semibold focus:outline-none cursor-pointer max-w-[150px] truncate disabled:opacity-50 disabled:cursor-not-allowed"
                        >
                          <option value="" className="bg-[#0b0c10] text-slate-500">Sem Silo/Categoria</option>
                          {lists.map(list => (
                            <option key={list.id} value={list.id} className="bg-[#0b0c10]">{list.nome}</option>
                          ))}
                        </select>
                      </td>

                      {/* Status Dropdown */}
                      <td className="py-0.5 px-3 border-r border-slate-900/40 text-center w-24">
                        <select
                          value={item.status || "bruto"}
                          onChange={(e) => handleUpdateStatus(item.id, e.target.value)}
                          disabled={item.status?.toLowerCase() === "publicado"}
                          className={`bg-[#06070a] border rounded px-1.5 py-0.5 text-[10px] font-bold focus:outline-none cursor-pointer focus:border-indigo-650 w-full text-center ${
                            item.status?.toLowerCase() === "publicado"
                              ? "text-rose-455 border-rose-900/60 bg-rose-955/15"
                              : item.status?.toLowerCase() === "aprovado"
                              ? "text-emerald-450 border-emerald-900/30 bg-emerald-950/40"
                              : item.status?.toLowerCase() === "rejeitado"
                              ? "text-rose-455 border-rose-900/30 bg-rose-955/10"
                              : "text-slate-500 border-slate-900 bg-slate-950"
                          }`}
                        >
                          <option value="bruto" className="bg-[#0b0c10] text-slate-500">Bruto</option>
                          <option value="aprovado" className="bg-[#0b0c10] text-emerald-400">Aprovado</option>
                          <option value="rejeitado" className="bg-[#0b0c10] text-rose-455">Rejeitado</option>
                          <option value="publicado" className="bg-[#0b0c10] text-rose-400">Publicado</option>
                        </select>
                      </td>
                    </tr>

                    {/* Acordeom ExpansÃ­vel com AnÃ¡lise SemÃ¢ntica DinÃ¢mica em JSONB */}
                    {isExpanded && (
                      <tr className="bg-slate-950/95 border-b border-slate-900/60">
                        <td colSpan={10} className="p-4 border-r border-l border-slate-900/50">
                          {/* URL CanÃ´nica baseada no domÃ­nio e slug */}
                          <div className="mb-4 bg-[#0b0c10] border border-slate-900/80 rounded p-3.5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs font-sans">
                            <div className="flex flex-col gap-0.5 max-w-full">
                              <span className="text-[9px] font-bold text-indigo-400 uppercase tracking-wider flex items-center gap-1">
                                ðŸ”— URL CanÃ´nica {item.status?.toLowerCase() === "publicado" ? "Publicada (Fixa)" : "Planejada"}
                              </span>
                              <span className="text-slate-300 select-all font-mono truncate max-w-md md:max-w-2xl block mt-0.5">
                                {getCanonicalUrl(item) || "Defina o domÃ­nio do site e o slug nas configuraÃ§Ãµes da marca."}
                              </span>
                            </div>
                            {getCanonicalUrl(item) && activeBrand?.site_url && (
                              <a
                                href={getCanonicalUrl(item)}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="bg-indigo-950/40 hover:bg-indigo-900/40 border border-indigo-900/30 text-indigo-300 text-[10px] px-3 py-1.5 rounded font-semibold transition-all shrink-0 flex items-center gap-1"
                              >
                                Acessar Link
                              </a>
                            )}
                          </div>

                          {item.analise_semantica && Object.keys(item.analise_semantica).length > 0 ? (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3.5 text-[12px] font-sans whitespace-normal">
                              {Object.entries(item.analise_semantica).map(([key, value]) => {
                                const formatKeyName = (k: string) => {
                                  const labels: Record<string, string> = {
                                    urgencia_tempo: "â±ï¸ UrgÃªncia / Tempo",
                                    intencao_local: "ðŸ“ IntenÃ§Ã£o Local",
                                    perfil_b2b: "ðŸ’¼ Perfil B2B",
                                    emocao_dominante: "ðŸŽ­ EmoÃ§Ã£o Dominante",
                                    nivel_consciencia: "ðŸ§  NÃ­vel de ConsciÃªncia",
                                    "objecao_implÃ­cita": "ðŸ›¡ï¸ ObjeÃ§Ã£o ImplÃ­cita",
                                    objecao_implicita: "ðŸ›¡ï¸ ObjeÃ§Ã£o ImplÃ­cita",
                                    poder_aquisitivo: "ðŸ’° Poder Aquisitivo",
                                    gatilho_de_conversao: "âš¡ Gatilho de ConversÃ£o"
                                  };
                                  return labels[k] || k.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
                                };

                                return (
                                  <div key={key} className="bg-[#0b0c10] border border-slate-900 p-3 rounded shadow-sm">
                                    <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block mb-1">
                                      {formatKeyName(key)}
                                    </span>
                                    <p className="text-slate-300 leading-relaxed">
                                      {value}
                                    </p>
                                  </div>
                                );
                              })}
                            </div>
                          ) : (
                            <div className="text-center py-4 text-xs text-slate-500 font-sans">
                              Nenhuma anÃ¡lise semÃ¢ntica disponÃ­vel para esta palavra-chave. Selecione o termo e dispare a AnÃ¡lise SemÃ¢ntica (DeepSeek) no rodapÃ©.
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                  </Fragment>
                );
              })}
            </tbody>
          </table>
          </>
        )}
      </main>

      {/* FOOTER BATCH ACTIONS BAR */}
      {selectedIds.size > 0 && (
        <footer className="bg-[#0b0c10] border-t border-slate-900 p-3.5 flex flex-wrap items-center justify-between gap-4 sticky bottom-0 z-30 shadow-2xl animate-in slide-in-from-bottom-12">
          
          <div className="flex items-center gap-2">
            <span className="bg-indigo-650 text-white font-bold text-[10px] px-2 py-0.5 rounded">
              {selectedIds.size}
            </span>
            <span className="text-[10px] text-slate-500 font-semibold uppercase tracking-wider">palavras selecionadas</span>
          </div>

          <div className="flex flex-wrap items-center gap-3.5">
            
            {/* Mover para Categoria/Silo */}
            <div className="flex items-center gap-1.5 bg-[#06070a] border border-slate-800 rounded px-2.5 py-1">
              <span className="text-[10px] text-slate-500 font-semibold">Mover para Silo:</span>
              <select
                value={targetListId}
                onChange={(e) => setTargetListId(e.target.value)}
                className="bg-transparent text-slate-300 font-semibold focus:outline-none cursor-pointer pr-1 max-w-[120px] truncate"
              >
                {lists.map(list => (
                  <option key={list.id} value={list.id} className="bg-[#0b0c10]">{list.nome}</option>
                ))}
              </select>
              <button
                onClick={handleBatchMove}
                disabled={updating || !targetListId}
                className="p-1 hover:bg-slate-900 rounded transition-colors text-indigo-400"
                title="Mover Palavras"
              >
                <ArrowRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Descobrir KGR (Qualificar/Quantificar) */}
            <button
              onClick={handleBatchQualify}
              disabled={updating}
              className="flex items-center gap-1 bg-[#06070a] border border-slate-800 hover:bg-slate-900 text-emerald-450 font-bold py-1.5 px-4 rounded transition-all"
            >
              <Play className="w-3.5 h-3.5 text-emerald-400" />
              <span>Qualificar (Volume & KGR)</span>
            </button>

            {/* Aprovar KGR */}
            <button
              onClick={handleBatchApprove}
              disabled={updating}
              className="flex items-center gap-1 bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold py-1.5 px-4 rounded transition-all hover:scale-[1.01]"
            >
              <Check className="w-3.5 h-3.5" />
              <span>Aprovar KGR</span>
            </button>

            {/* Marcar como Publicado */}
            <button
              onClick={handleBatchPublish}
              disabled={updating}
              className="flex items-center gap-1 bg-rose-955/25 hover:bg-rose-955/40 border border-rose-900/60 disabled:opacity-50 text-rose-400 font-bold py-1.5 px-4 rounded transition-all hover:scale-[1.01]"
            >
              <span>Marcar Publicado</span>
            </button>

             {/* Processar Nicho & IntenÃ§Ã£o (DeepSeek / IA Real) */}
            <button
              onClick={handleBatchProcessIntentNiche}
              disabled={updating || queueProcessing}
              className="flex items-center gap-1.5 bg-[#06070a] border border-indigo-950/40 hover:bg-slate-900 disabled:opacity-50 text-indigo-400 font-bold py-1.5 px-4 rounded transition-all hover:scale-[1.01]"
              title="Processar Nicho e IntenÃ§Ã£o reais de acordo com a pesquisa no mercado brasileiro via DeepSeek"
            >
              {queueProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              ) : (
                <Brain className="w-3.5 h-3.5 text-indigo-400" />
              )}
              <span>
                {queueProcessing 
                  ? `Processando (${queueProgress} de ${selectedIds.size})...` 
                  : "Processar Nicho & IntenÃ§Ã£o"}
              </span>
            </button>

            {/* Gerar Briefing (Silo) (Etapa 2 ProvisÃ³rio) */}
            <button
              onClick={handleGenerateBriefing}
              disabled={updating || queueProcessing}
              className="flex items-center gap-1.5 bg-[#06070a] border border-indigo-950/40 hover:bg-slate-900 disabled:opacity-50 text-indigo-400 font-bold py-1.5 px-4 rounded transition-all hover:scale-[1.01]"
              title="Gerar briefing de conteÃºdo unificado para as palavras-chave selecionadas para evitar canibalizaÃ§Ã£o"
            >
              <FileSpreadsheet className="w-3.5 h-3.5 text-indigo-400" />
              <span>Gerar Briefing (Silo)</span>
            </button>

            {/* AnÃ¡lise SemÃ¢ntica */}
            <button
              onClick={handleBatchAnalyze}
              disabled={updating || queueProcessing}
              className="flex items-center gap-1.5 bg-[#06070a] border border-indigo-950/40 hover:bg-slate-900 disabled:opacity-50 text-indigo-400 font-bold py-1.5 px-4 rounded transition-all"
            >
              {queueProcessing ? (
                <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-400" />
              ) : (
                <Brain className="w-3.5 h-3.5 text-indigo-400" />
              )}
              <span>
                {queueProcessing 
                  ? `Analisando (${queueProgress} de ${selectedIds.size})...` 
                  : "AnÃ¡lise SemÃ¢ntica"}
              </span>
            </button>

            {/* Excluir */}
            <button
              onClick={handleBatchDelete}
              disabled={updating || queueProcessing}
              className="flex items-center gap-1 bg-red-950/20 border border-red-900/30 hover:bg-red-900/30 disabled:opacity-50 text-red-400 font-bold py-1.5 px-4 rounded transition-all"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Excluir</span>
            </button>

          </div>
        </footer>
      )}

      {/* Modal de criaÃ§Ã£o de Categoria/Silo */}
      {isListModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-slate-800 w-full max-w-sm rounded overflow-hidden relative shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-indigo-500 to-purple-600"></div>
            
            <div className="px-4 py-3 border-b border-slate-950 flex items-center justify-between">
              <span className="font-bold text-[10px] text-white uppercase tracking-wider flex items-center gap-1">
                <FolderPlus className="w-3.5 h-3.5 text-indigo-450" /> Criar Silo / Categoria
              </span>
              <button onClick={() => setIsListModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleCreateList} className="p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nome da Categoria/Silo</label>
                <input 
                  type="text" 
                  required
                  placeholder="Ex: ClÃ­nicas Campinas, Blog Silo RJ"
                  value={newListName}
                  onChange={(e) => setNewListName(e.target.value)}
                  className="w-full bg-[#06070a] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-indigo-650"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nicho / Setor do Projeto</label>
                <input 
                  type="text" 
                  placeholder="Ex: Odontologia, Advocacia"
                  value={newListNicho}
                  onChange={(e) => setNewListNicho(e.target.value)}
                  className="w-full bg-[#06070a] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-indigo-650"
                />
              </div>

              <div className="flex items-center justify-end gap-2 mt-2">
                <button 
                  type="button" 
                  onClick={() => setIsListModalOpen(false)} 
                  className="bg-[#06070a] hover:bg-slate-900 border border-slate-800 text-slate-400 font-bold py-1.5 px-3 rounded transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-indigo-650 hover:bg-indigo-600 text-white font-bold py-1.5 px-4 rounded transition-all"
                >
                  Criar Silo
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de ImportaÃ§Ã£o Manual (Copy e Cola) */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-slate-800 w-full max-w-lg rounded overflow-hidden relative shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-indigo-500 to-purple-600"></div>
            
            <div className="px-4 py-3 border-b border-slate-950 flex items-center justify-between">
              <span className="font-bold text-[10px] text-white uppercase tracking-wider flex items-center gap-1.5">
                <Plus className="w-4 h-4 text-indigo-400" /> Importar Lista Manualmente (Copiar & Colar)
              </span>
              <button onClick={() => setIsManualModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleManualImport} className="p-4 flex flex-col gap-4">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">
                  Cole as Palavras-Chave (uma por linha)
                </label>
                <textarea
                  required
                  rows={6}
                  placeholder="Ex:&#10;como fazer seo para dentista&#10;agencia de marketing clinica estetica&#10;dentista em campinas preco"
                  value={manualKeywordsText}
                  onChange={(e) => setManualKeywordsText(e.target.value)}
                  className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-indigo-650 font-sans text-xs resize-y min-h-[120px]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Selecionar Silo / Categoria */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">
                    Silo / Lista Destino {manualStatus === "publicado" && <span className="text-rose-500 font-bold ml-1">* Silo de PublicaÃ§Ã£o ObrigatÃ³rio</span>}
                  </label>
                  <select
                    value={manualListId}
                    onChange={(e) => setManualListId(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-855 rounded px-2 py-1.5 text-slate-350 focus:outline-none focus:border-indigo-650 cursor-pointer text-xs font-semibold"
                  >
                    <option value="" disabled>Selecione um Silo</option>
                    {lists.map(list => (
                      <option key={list.id} value={list.id}>{list.nome}</option>
                    ))}
                  </select>
                </div>

                {/* LocalizaÃ§Ã£o padrÃ£o */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">Localidade / RegiÃ£o</label>
                  <input
                    type="text"
                    placeholder="Ex: Brasil, SP, Rio de Janeiro"
                    value={manualLocation}
                    onChange={(e) => setManualLocation(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-indigo-650 text-xs font-semibold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* IntenÃ§Ã£o Inicial */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">IntenÃ§Ã£o Inicial</label>
                  <select
                    value={manualIntent}
                    onChange={(e) => setManualIntent(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-855 rounded px-2 py-1.5 text-slate-350 focus:outline-none focus:border-indigo-650 cursor-pointer text-xs font-semibold"
                  >
                    <option value="">AutomÃ¡tico (HeurÃ­stica)</option>
                    <option value="Informativo">Informativo</option>
                    <option value="Comercial">Comercial</option>
                    <option value="Vendas">Vendas</option>
                  </select>
                </div>

                {/* Nicho Inicial */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">Nicho Inicial</label>
                  <select
                    value={manualNicho}
                    onChange={(e) => setManualNicho(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-855 rounded px-2 py-1.5 text-slate-350 focus:outline-none focus:border-indigo-650 cursor-pointer text-xs font-semibold"
                  >
                    <option value="">AutomÃ¡tico (HeurÃ­stica)</option>
                    <option value="Odontologia">Odontologia</option>
                    <option value="Advocacia">Advocacia</option>
                    <option value="SaÃºde">SaÃºde</option>
                    <option value="EstÃ©tica">EstÃ©tica</option>
                    <option value="Fitness">Fitness</option>
                    <option value="ServiÃ§os">ServiÃ§os</option>
                    <option value="Marketing">Marketing</option>
                    <option value="Geral">Geral</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                {/* Status Inicial */}
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider font-semibold">Status Inicial</label>
                  <select
                    value={manualStatus}
                    onChange={(e) => setManualStatus(e.target.value)}
                    className="w-full bg-[#06070a] border border-slate-855 rounded px-2 py-1.5 text-slate-355 focus:outline-none focus:border-indigo-650 cursor-pointer text-xs font-semibold"
                  >
                    <option value="bruto">Bruto</option>
                    <option value="aprovado">Aprovado</option>
                    <option value="rejeitado">Rejeitado</option>
                    <option value="publicado">Publicado</option>
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 text-xs">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="bg-[#06070a] hover:bg-slate-900 border border-slate-800 text-slate-400 font-bold py-1.5 px-3 rounded transition-all"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={updating}
                  className="bg-indigo-650 hover:bg-indigo-600 disabled:opacity-50 text-white font-bold py-1.5 px-4 rounded transition-all flex items-center gap-1.5"
                >
                  {updating && <Loader2 className="w-3.5 h-3.5 animate-spin" />}
                  <span>Importar Palavras</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal de ExportaÃ§Ã£o com OpÃ§Ã£o de Renomear Arquivo */}
      {isExportModalOpen && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-slate-800 w-full max-w-sm rounded overflow-hidden relative shadow-2xl">
            <div className="absolute top-0 left-0 right-0 h-[3px] bg-gradient-to-r from-emerald-500 to-teal-600"></div>
            
            <div className="px-4 py-3 border-b border-slate-950 flex items-center justify-between">
              <span className="font-bold text-[10px] text-white uppercase tracking-wider flex items-center gap-1.5">
                <FileSpreadsheet className="w-4 h-4 text-emerald-400" /> Exportar Planilha (CSV)
              </span>
              <button onClick={() => setIsExportModalOpen(false)} className="text-slate-500 hover:text-white transition-colors">
                <X className="w-4 h-4" />
              </button>
            </div>

            <form 
              onSubmit={(e) => {
                e.preventDefault();
                exportSelectedToCSV(exportFileName);
                setIsExportModalOpen(false);
              }} 
              className="p-4 flex flex-col gap-3.5"
            >
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nome do Arquivo CSV</label>
                <input 
                  type="text" 
                  required
                  placeholder="Nome do arquivo..."
                  value={exportFileName}
                  onChange={(e) => setExportFileName(e.target.value)}
                  className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 placeholder-slate-650 focus:outline-none focus:border-emerald-600 text-xs font-semibold"
                />
                <span className="text-[8.5px] text-slate-500 italic mt-0.5">Nota: a extensÃ£o .csv serÃ¡ adicionada automaticamente.</span>
              </div>

              <div className="flex items-center justify-end gap-2 mt-2 text-xs">
                <button 
                  type="button" 
                  onClick={() => setIsExportModalOpen(false)} 
                  className="bg-[#06070a] hover:bg-slate-900 border border-slate-800 text-slate-400 font-bold py-1.5 px-3 rounded transition-all"
                >
                  Cancelar
                </button>
                <button 
                  type="submit" 
                  className="bg-emerald-650 hover:bg-emerald-600 text-white font-bold py-1.5 px-4 rounded transition-all"
                >
                  Exportar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

    </div>
  );
}
