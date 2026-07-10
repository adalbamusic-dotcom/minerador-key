"use client";

import React, { useState, useEffect, useMemo, useRef } from "react";
import { useBrand } from "@/components/brand-context";
import { useSession, signOut } from "next-auth/react";
import { createClient } from "@supabase/supabase-js";
import { useRouter } from "next/navigation";
import {
  Loader2,
  X,
  Check,
  Lock,
  RefreshCw,
  Undo2,
  Redo2,
  ChevronDown,
  ChevronRight,
  Plus,
  Trash2,
  Unlink,
  MoreHorizontal,
  ShieldCheck,
  Search,
  Building2,
  Zap,
  Download,
  Menu,
  User,
  PenTool,
  LogOut,
  Key
} from "lucide-react";

// Supabase client
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || "";
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Helper slug
const toSlug = (text: string) =>
  text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase().trim()
    .replace(/\s+/g, "-").replace(/[^\w-]+/g, "");

// Cores por artigo — faixa inteira da <tr>
// Reiniciam a cada novo silo para manter previsibilidade
const ARTICLE_COLORS = [
  "bg-blue-900/[.12]",
  "bg-emerald-900/[.12]",
  "bg-violet-900/[.12]",
  "bg-amber-900/[.12]",
  "bg-teal-900/[.12]",
  "bg-rose-900/[.12]",
  "bg-cyan-900/[.12]",
  "bg-orange-900/[.12]",
];

// Barra colorida lateral (indicador de artigo na 1ª célula)
const ARTICLE_ACCENTS = [
  "border-l-2 border-l-blue-500/80",
  "border-l-2 border-l-emerald-500/80",
  "border-l-2 border-l-violet-500/80",
  "border-l-2 border-l-amber-500/80",
  "border-l-2 border-l-teal-500/80",
  "border-l-2 border-l-rose-500/80",
  "border-l-2 border-l-cyan-500/80",
  "border-l-2 border-l-orange-500/80",
];

const SILO_COLORS = [
  { border: "border-l-blue-500", rowBg: "bg-blue-500/[.045]", headerText: "text-blue-300", countBg: "bg-blue-500/10", countBorder: "border-blue-500/20" },
  { border: "border-l-violet-500", rowBg: "bg-violet-500/[.045]", headerText: "text-violet-300", countBg: "bg-violet-500/10", countBorder: "border-violet-500/20" },
  { border: "border-l-emerald-500", rowBg: "bg-emerald-500/[.045]", headerText: "text-emerald-300", countBg: "bg-emerald-500/10", countBorder: "border-emerald-500/20" },
  { border: "border-l-amber-500", rowBg: "bg-amber-500/[.045]", headerText: "text-amber-300", countBg: "bg-amber-500/10", countBorder: "border-amber-500/20" },
  { border: "border-l-cyan-500", rowBg: "bg-cyan-500/[.045]", headerText: "text-cyan-300", countBg: "bg-cyan-500/10", countBorder: "border-cyan-500/20" },
  { border: "border-l-rose-500", rowBg: "bg-rose-500/[.045]", headerText: "text-rose-300", countBg: "bg-rose-500/10", countBorder: "border-rose-500/20" },
];

const SUPPORT_KEYWORD_COLORS = [
  { row: "bg-blue-950/35", expanded: "bg-blue-950/55", border: "border-blue-500/60", title: "text-blue-300", stripe: "border-l-blue-500" },
  { row: "bg-violet-950/35", expanded: "bg-violet-950/55", border: "border-violet-500/60", title: "text-violet-300", stripe: "border-l-violet-500" },
  { row: "bg-emerald-950/35", expanded: "bg-emerald-950/55", border: "border-emerald-500/60", title: "text-emerald-300", stripe: "border-l-emerald-500" },
  { row: "bg-amber-950/35", expanded: "bg-amber-950/55", border: "border-amber-500/60", title: "text-amber-300", stripe: "border-l-amber-500" },
  { row: "bg-cyan-950/35", expanded: "bg-cyan-950/55", border: "border-cyan-500/60", title: "text-cyan-300", stripe: "border-l-cyan-500" },
  { row: "bg-rose-950/35", expanded: "bg-rose-950/55", border: "border-rose-500/60", title: "text-rose-300", stripe: "border-l-rose-500" },
];

// ─── Algoritmo de Fusão e Clusterização ────────────────────────────────────
const clusterMasterList = (list: any[]) => {
  const stopWords = new Set([
    "de","da","do","para","como","em","o","a","os","as","um","uma",
    "com","sem","por","que","e","se","no","na","nos","nas","ao","aos","sobre","sob",
  ]);

  const tokenize = (text: string) =>
    new Set(
      text.toString().normalize("NFD").replace(/[\u0300-\u036f]/g,"")
        .toLowerCase().replace(/[^\w\s]/g,"").split(/\s+/)
        .filter(t => t.length > 1 && !stopWords.has(t))
    );

  const overlap = (a: Set<string>, b: Set<string>) => {
    if (!a.size || !b.size) return 0;
    let n = 0;
    a.forEach(t => { if (b.has(t)) n++; });
    return n / Math.min(a.size, b.size);
  };

  // 1. Clusters de Artigo — publicados são a âncora
  const clusters: {
    id: number;
    tokens: Set<string>;
    isPublished: boolean;
    publishedSlug?: string;
    publishedHierarquia?: string;
    publishedSiloId?: any;
    publishedSiloName?: string;
    keywords: any[];
  }[] = [];

  const published = list.filter(i => i.isPublished);
  const fresh     = list.filter(i => !i.isPublished);

  published.forEach((item, idx) => {
    clusters.push({
      id: idx + 1,
      tokens: tokenize(item.keyword),
      isPublished: true,
      publishedSlug: item.slug_sugerido,
      publishedHierarquia: item.hierarquia,
      publishedSiloId: item.silo_id,
      publishedSiloName: item.siloName,
      keywords: [item],
    });
  });

  fresh.forEach(item => {
    const t = tokenize(item.keyword);
    let placed = false;

    // Tenta ancorar em publicado (prevenção de canibalização)
    for (const c of clusters) {
      if (c.isPublished && overlap(t, c.tokens) >= 0.5) {
        c.keywords.push(item);
        placed = true;
        break;
      }
    }
    if (!placed) {
      for (const c of clusters) {
        if (!c.isPublished && overlap(t, c.tokens) >= 0.6) {
          c.keywords.push(item);
          placed = true;
          break;
        }
      }
    }
    if (!placed) {
      clusters.push({
        id: clusters.length + 1,
        tokens: t,
        isPublished: false,
        keywords: [item],
      });
    }
  });

  // 2. Silos semânticos
  const silos: { id: number; name: string; tokens: Set<string>; clusters: any[] }[] = [];

  clusters.forEach(cluster => {
    const rep = cluster.keywords.find(k => k.isPublished) ||
      cluster.keywords.sort((a, b) => (b.volume_search||0) - (a.volume_search||0))[0];
    const t = tokenize(rep.keyword);

    // Preserva silo real se vier de publicado
    const realSiloId   = cluster.publishedSiloId   || rep.silo_id   || null;
    const realSiloName = cluster.publishedSiloName  || rep.siloName  || null;

    let placed = false;
    if (realSiloId) {
      for (const silo of silos) {
        if (silo.id === realSiloId) {
          silo.clusters.push(cluster);
          t.forEach(tk => silo.tokens.add(tk));
          placed = true;
          break;
        }
      }
      if (!placed) {
        silos.push({ id: realSiloId, name: realSiloName || `Silo ${realSiloId}`, tokens: new Set(t), clusters: [cluster] });
        placed = true;
      }
    }

    if (!placed) {
      for (const silo of silos) {
        let shares = false;
        t.forEach(tk => { if (tk.length > 3 && silo.tokens.has(tk)) shares = true; });
        if (shares) {
          silo.clusters.push(cluster);
          t.forEach(tk => silo.tokens.add(tk));
          placed = true;
          break;
        }
      }
    }

    if (!placed) {
      const tmpId = `tmp-${silos.length + 1}`;
      silos.push({ id: tmpId as any, name: `Novo Grupo ${silos.length + 1}`, tokens: new Set(t), clusters: [cluster] });
    }
  });

  // 3. Hierarquia dentro de cada Silo
  silos.forEach(silo => {
    const sorted = silo.clusters.slice().sort((ca, cb) => {
      const ra = ca.keywords.find((k: any) => k.isPublished) ||
        ca.keywords.sort((a: any, b: any) => (b.volume_search||0) - (a.volume_search||0))[0];
      const rb = cb.keywords.find((k: any) => k.isPublished) ||
        cb.keywords.sort((a: any, b: any) => (b.volume_search||0) - (a.volume_search||0))[0];
      return (rb.volume_search||0) - (ra.volume_search||0);
    });

    sorted.forEach((cluster, idx) => {
      const baseHierarquia = cluster.isPublished
        ? cluster.publishedHierarquia || (idx === 0 ? "Pilar" : `Suporte ${idx}`)
        : idx === 0 ? "Pilar" : `Suporte ${idx}`;

      const baseSlug = cluster.isPublished
        ? cluster.publishedSlug || ""
        : toSlug(cluster.keywords.sort((a: any, b: any) => (b.volume_search||0)-(a.volume_search||0))[0]?.keyword || "");

      cluster.keywords.forEach((kw: any) => {
        kw.clusterId  = cluster.id;
        kw.siloId     = silo.id;
        kw.siloName   = silo.name;

        if (kw.isPublished) {
          kw.computedSlug        = kw.slug_sugerido;
          kw.computedHierarquia  = kw.hierarquia;
        } else if (cluster.isPublished) {
          // Palavra nova no grupo de publicado → sempre Reforço Narrativo
          kw.computedSlug       = baseSlug;
          kw.computedHierarquia = "Reforço Narrativo";
        } else {
          const isRep = kw.keyword === cluster.keywords
            .sort((a: any, b: any) => (b.volume_search||0)-(a.volume_search||0))[0]?.keyword;
          kw.computedSlug       = baseSlug;
          kw.computedHierarquia = isRep ? baseHierarquia : "Reforço Narrativo";
        }
      });
    });
  });

  const result: any[] = [];
  clusters.forEach(c => c.keywords.forEach(kw => result.push(kw)));

  // Ordena: Silo (nome alfabético) → clusterId → volume desc
  return result.sort((a, b) => {
    const sA = (a.siloName || "").toLowerCase();
    const sB = (b.siloName || "").toLowerCase();
    if (sA < sB) return -1;
    if (sA > sB) return 1;
    if (a.clusterId !== b.clusterId) return (a.clusterId || 0) - (b.clusterId || 0);
    return (b.volume_search || 0) - (a.volume_search || 0);
  });
};

// ─── Componente principal ───────────────────────────────────────────────────
export default function ArquitetoPage() {
  const router = useRouter();
  const { data: session, status: sessionStatus } = useSession();
  const { brands, selectedBrandId, setSelectedBrandId, userRole, profileLoading, refreshBrands } = useBrand();

  // Data
  const [lists,    setLists]    = useState<any[]>([]);
  const [masterList, setMasterList] = useState<any[]>([]);
  const [masterUndoStack, setMasterUndoStack] = useState<any[][]>([]);
  const [masterRedoStack, setMasterRedoStack] = useState<any[][]>([]);

  // UI state
  const [loading,           setLoading]           = useState(true);
  const [saving,            setSaving]            = useState(false);
  const [updating,          setUpdating]          = useState(false);
  const [loadingKeywords,   setLoadingKeywords]   = useState(false);
  const [generatingStrategic, setGeneratingStrategic] = useState(false);
  const [notification,      setNotification]      = useState<{ type:"success"|"error"; message:string }|null>(null);
  const [menuOpen,          setMenuOpen]          = useState(false);
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectionMenuRef = useRef<HTMLDivElement>(null);

  // Accordion — expanded row ids & active tabs per expanded article
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeTabs,  setActiveTabs]  = useState<Record<string, "suporte" | "dna">>({});

  // Toolbar filters
  const [searchQuery,      setSearchQuery]      = useState("");
  const [filterHierarquia, setFilterHierarquia] = useState("Todos");

  // Inline edits
  const [customSlugs,       setCustomSlugs]       = useState<Record<string,string>>({});
  const [customHierarquias, setCustomHierarquias] = useState<Record<string,string>>({});
  const [selectedIds,       setSelectedIds]       = useState<Set<string>>(new Set());

  // Silo modal
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [newListName,     setNewListName]     = useState("");
  const [newListNicho,    setNewListNicho]    = useState("");

  // Edição direta de Briefing/DNA do Artigo no acordeão
  const [savingBriefingId, setSavingBriefingId] = useState<string | null>(null);
  const [dnaMetaTitles, setDnaMetaTitles] = useState<Record<string, string>>({});
  const [dnaMetaDescriptions, setDnaMetaDescriptions] = useState<Record<string, string>>({});
  const [dnaAngulosVenda, setDnaAngulosVenda] = useState<Record<string, string>>({});
  const [dnaCTAs, setDnaCTAs] = useState<Record<string, string>>({});
  const [dnaAntiCanibalizacoes, setDnaAntiCanibalizacoes] = useState<Record<string, string>>({});

  // Inner Accordion - Keyword semantic DNA expanded rows
  const [expandedKwIds, setExpandedKwIds] = useState<Set<string>>(new Set());

  // Close menu on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
      if (selectionMenuRef.current && !selectionMenuRef.current.contains(e.target as Node)) setSelectionMenuOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  // Session sync
  useEffect(() => {
    if (sessionStatus === "authenticated" && (session as any)?.accessToken) {
      supabase.auth.setSession({
        access_token: (session as any).accessToken,
        refresh_token: "",
      }).then(() => { fetchData(); fetchMasterList(); });
    } else if (sessionStatus === "unauthenticated") {
      setLoading(false);
    }
  }, [selectedBrandId, sessionStatus, session]);

  const showNotification = (type: "success"|"error", msg: string) => {
    setNotification({ type, message: msg });
    setTimeout(() => setNotification(null), 3500);
  };

  // ── Fetch silos + briefings
  const pushMasterHistory = (snapshot = masterList) => {
    setMasterUndoStack(prev => [...prev.slice(-19), snapshot]);
    setMasterRedoStack([]);
  };

  const undoMasterList = () => {
    setMasterUndoStack(prev => {
      if (prev.length === 0) return prev;
      const previous = prev[prev.length - 1];
      setMasterRedoStack(redo => [masterList, ...redo.slice(0, 19)]);
      setMasterList(previous);
      setSelectedIds(new Set());
      showNotification("success", "Voltando uma alteracao estrutural.");
      return prev.slice(0, -1);
    });
  };

  const redoMasterList = () => {
    setMasterRedoStack(prev => {
      if (prev.length === 0) return prev;
      const next = prev[0];
      setMasterUndoStack(undo => [...undo.slice(-19), masterList]);
      setMasterList(next);
      setSelectedIds(new Set());
      showNotification("success", "Refazendo alteracao estrutural.");
      return prev.slice(1);
    });
  };

  const fetchData = async () => {
    if (sessionStatus !== "authenticated" || !selectedBrandId) return;
    setLoading(true);
    try {
      const { data: silosData, error: silosError } = await supabase
        .from("listas_kgr").select("*")
        .eq("marca_id", selectedBrandId).order("created_at", { ascending: false });
      if (silosError) throw silosError;
      const silos = silosData || [];
      setLists(silos);

    } catch (err: any) {
      showNotification("error", "Erro ao carregar dossiês.");
    } finally { setLoading(false); }
  };

  // ── Fetch & cluster master list
  const fetchMasterList = async () => {
    if (!selectedBrandId) return;
    setLoadingKeywords(true);
    try {
      const { data: silosData } = await supabase
        .from("listas_kgr").select("id, nome").eq("marca_id", selectedBrandId);
      const allowedIds = (silosData || []).map(s => s.id);
      const siloNameMap: Record<string,string> = {};
      (silosData || []).forEach(s => { siloNameMap[String(s.id)] = s.nome; });

      // Keywords
      let kwQuery = supabase.from("keywords_kgr").select("*");
      if (allowedIds.length > 0) {
        kwQuery = kwQuery.or(`lista_id.is.null,${allowedIds.map(id=>`lista_id.eq.${id}`).join(",")}`);
      } else { kwQuery = kwQuery.is("lista_id", null); }
      const { data: kwData } = await kwQuery;
      const allKws = kwData || [];

      // Briefings — busca em paralelo
      const [bWithSiloML, bNoSiloML] = await Promise.all([
        allowedIds.length > 0
          ? supabase.from("briefings_artigos").select("*").in("silo_id", allowedIds)
          : Promise.resolve({ data: [], error: null }),
        supabase.from("briefings_artigos").select("*").is("silo_id", null),
      ]);
      const allBriefingsRaw = [
        ...(bWithSiloML.data || []),
        ...(bNoSiloML.data || []),
      ];
      const bMapML = new Map(allBriefingsRaw.map(b => [b.id, b]));
      const allBriefings = Array.from(bMapML.values());

      const items: any[] = [];

      // 1. Mapear todas as keywords publicadas de keywords_kgr
      const pubKws = allKws.filter(k => k.status?.toLowerCase() === "publicado");
      const pubBriefings = allBriefings.filter(b => b.status?.toLowerCase() === "publicado");

      const publishedMap = new Map<string, any>();

      pubKws.forEach(kw => {
        const briefing = pubBriefings.find(b => 
          b.keyword_principal.toLowerCase().trim() === kw.keyword.toLowerCase().trim()
        );

        const slugSemantica = kw.analise_semantica?.slug_sugerido || toSlug(kw.keyword);
        const hierarquiaSemantica = kw.analise_semantica?.hierarquia || "Pilar";

        publishedMap.set(kw.keyword.toLowerCase().trim(), {
          id: briefing ? `pub-b-${briefing.id}` : `pub-k-${kw.id}`,
          briefingId: briefing?.id || null,
          keywordId: kw.id,
          keyword: kw.keyword,
          volume_search: kw.volume_search || 0,
          intent: kw.intent || "Informativo",
          kgr: kw.kgr_score || kw.kgr || null,
          status: "publicado",
          slug_sugerido: briefing?.slug_sugerido || slugSemantica,
          hierarquia: briefing?.hierarquia || hierarquiaSemantica,
          silo_id: briefing?.silo_id || kw.lista_id,
          siloName: siloNameMap[String(briefing?.silo_id || kw.lista_id)] || null,
          isPublished: true,
          meta_title: briefing?.meta_title || null,
          meta_description: briefing?.meta_description || null,
          diretrizes_estrategicas: briefing?.diretrizes_estrategicas || null,
          keywords_secundarias: briefing?.keywords_secundarias || [],
          analise_semantica: kw.analise_semantica || null
        });
      });

      // Se houver algum briefing publicado que não esteja no keywords_kgr, adiciona
      pubBriefings.forEach(b => {
        const key = b.keyword_principal.toLowerCase().trim();
        if (!publishedMap.has(key)) {
          const kwMatch = allKws.find(k => k.keyword.toLowerCase().trim() === key);
          publishedMap.set(key, {
            id: `pub-b-${b.id}`,
            briefingId: b.id,
            keywordId: kwMatch?.id || null,
            keyword: b.keyword_principal,
            volume_search: kwMatch?.volume_search || 0,
            intent: kwMatch?.intent || "Informativo",
            kgr: kwMatch?.kgr_score || kwMatch?.kgr || null,
            status: "publicado",
            slug_sugerido: b.slug_sugerido,
            hierarquia: b.hierarquia,
            silo_id: b.silo_id,
            siloName: siloNameMap[String(b.silo_id)] || null,
            isPublished: true,
            meta_title: b.meta_title || null,
            meta_description: b.meta_description || null,
            diretrizes_estrategicas: b.diretrizes_estrategicas || null,
            keywords_secundarias: b.keywords_secundarias || [],
            analise_semantica: kwMatch?.analise_semantica || null
          });
        }
      });

      publishedMap.forEach(item => { items.push(item); });

      // 2. Aprovados (novos)
      const approved = allKws.filter(k => k.status?.toLowerCase() === "aprovado");
      approved.forEach(kw => {
        items.push({
          id: kw.id,
          keyword: kw.keyword,
          volume_search: kw.volume_search || 0,
          intent: kw.intent || "Informativo",
          kgr: kw.kgr_score || kw.kgr || null,
          status: "aprovado",
          silo_id: kw.lista_id,
          siloName: siloNameMap[String(kw.lista_id)] || null,
          isPublished: false,
          analise_semantica: kw.analise_semantica || null
        });
      });

      const clustered = clusterMasterList(items);
      setMasterList(clustered);

      // Pre-populate input values for editing briefing directly
      const initialMetaTitles: Record<string, string> = {};
      const initialMetaDescriptions: Record<string, string> = {};
      const initialAngulos: Record<string, string> = {};
      const initialCTAs: Record<string, string> = {};
      const initialAntiCanibalizacoes: Record<string, string> = {};

      allBriefings.forEach(b => {
        initialMetaTitles[b.id] = b.meta_title || "";
        initialMetaDescriptions[b.id] = b.meta_description || "";
        const strat = b.diretrizes_estrategicas || {};
        initialAngulos[b.id] = strat.angulo_de_venda || "";
        initialCTAs[b.id] = strat.chamada_para_acao || "";
        initialAntiCanibalizacoes[b.id] = strat.angulo_anti_canibalizacao || "";
      });

      setDnaMetaTitles(initialMetaTitles);
      setDnaMetaDescriptions(initialMetaDescriptions);
      setDnaAngulosVenda(initialAngulos);
      setDnaCTAs(initialCTAs);
      setDnaAntiCanibalizacoes(initialAntiCanibalizacoes);

      showNotification("success", `${publishedMap.size} publicados + ${approved.length} novos carregados.`);
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao carregar o ecossistema.");
    } finally { setLoadingKeywords(false); }
  };

  // ── Handlers
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newListName.trim()) { showNotification("error", "Nome do silo obrigatório."); return; }
    setSaving(true);
    try {
      const { data: newList, error } = await supabase.from("listas_kgr")
        .insert({ nome: newListName.trim(), nicho: newListNicho.trim()||null, marca_id: selectedBrandId })
        .select().single();
      if (error) throw error;
      const { data: brandData } = await supabase.from("marcas").select("silos_existentes").eq("id", selectedBrandId).single();
      await supabase.from("marcas").update({
        silos_existentes: [...(brandData?.silos_existentes||[]), { nome: newListName.trim(), slug: toSlug(newListName) }]
      }).eq("id", selectedBrandId);
      showNotification("success", `Silo "${newListName}" criado!`);
      setNewListName(""); setNewListNicho(""); setIsListModalOpen(false);
      await refreshBrands(); await fetchData();
    } catch (err: any) { showNotification("error", err.message || "Erro ao criar silo"); }
    finally { setSaving(false); }
  };

  // Salva o briefing do Artigo diretamente do acordeão
  const handleSaveArticleDna = async (art: any) => {
    const briefingId = art.briefingId;
    const keywordPrincipal = art.keywordPrincipal;
    setSavingBriefingId(briefingId);
    try {
      const protectedPublishedPayload = art.isPublished ? {} : {
        keyword_principal: keywordPrincipal,
        slug_sugerido: customSlugs[art.id] || customSlugs[briefingId] || toSlug(keywordPrincipal),
        silo_id: art.siloId,
      };

      const payload = {
        ...protectedPublishedPayload,
        hierarquia: customHierarquias[art.id] || customHierarquias[briefingId] || art.hierarquia || "Pilar",
        meta_title: (dnaMetaTitles[briefingId] || "").trim(),
        meta_description: (dnaMetaDescriptions[briefingId] || "").trim(),
        diretrizes_estrategicas: {
          angulo_de_venda: (dnaAngulosVenda[briefingId] || "").trim(),
          chamada_para_acao: (dnaCTAs[briefingId] || "").trim(),
          angulo_anti_canibalizacao: (dnaAntiCanibalizacoes[briefingId] || "").trim(),
        },
      };

      let error;
      if (briefingId.startsWith("temp-")) {
        // Insere novo briefing
        const { error: insError } = await supabase
          .from("briefings_artigos")
          .insert({
            ...payload,
            slug_sugerido: toSlug(keywordPrincipal),
            status: "publicado"
          });
        error = insError;
      } else {
        // Atualiza briefing existente
        const { error: updError } = await supabase
          .from("briefings_artigos")
          .update(payload)
          .eq("id", briefingId);
        error = updError;
      }

      if (error) throw error;
      showNotification("success", "DNA do Artigo salvo.");
      await fetchData();
      await fetchMasterList();
    } catch (err: any) {
      console.error(err);
      showNotification("error", "Erro ao salvar DNA.");
    } finally {
      setSavingBriefingId(null);
    }
  };

  const handleGenerateStrategicBriefings = async () => {
    if (!masterList.length) return;
    setGeneratingStrategic(true);
    try {
      showNotification("success", "Gerando dossiês estratégicos via IA...");
      await new Promise(r => setTimeout(r, 2000));
      showNotification("success", "Dossiês gerados para todos os grupos!");
      await fetchData();
      await fetchMasterList();
    } catch { showNotification("error", "Erro ao gerar dossiês."); }
    finally { setGeneratingStrategic(false); }
  };

  const handlePipelineStep = async (label: string) => {
    if (!masterList.length) return;
    setGeneratingStrategic(true);
    try {
      showNotification("success", `${label} iniciado.`);
      await new Promise(r => setTimeout(r, 600));
    } catch {
      showNotification("error", `Erro em ${label}.`);
    } finally {
      setGeneratingStrategic(false);
    }
  };

  const toggleExpand = (id: string) => {
    setExpandedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleExpandKw = (id: string) => {
    setExpandedKwIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  // ── 3. FUSÃO E TRANSFORMAÇÃO: LISTA DE ARTIGOS (1 por Cluster) ──
  const toggleArticleSelection = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSiloSelection = (articleIds: string[]) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = articleIds.length > 0 && articleIds.every(id => next.has(id));
      articleIds.forEach(id => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const updateClusterSilo = (clusterId: number, siloId: any, siloName: string | null) => {
    pushMasterHistory();
    setMasterList(prev => prev.map(kw =>
      kw.clusterId === clusterId
        ? { ...kw, siloId, silo_id: siloId, siloName }
        : kw
    ));
  };

  const handleDetachArticle = (art: any) => {
    if (art.isPublished) {
      showNotification("error", "Artigos publicados sao bloqueados e nao podem ser removidos do Silo.");
      return;
    }
    updateClusterSilo(art.clusterId, null, null);
    showNotification("success", "Artigo movido para Sem Grupo.");
  };

  const handleMoveArticleToSilo = (art: any, listId: string) => {
    if (art.isPublished) {
      showNotification("error", "Artigos publicados ja foram validados no site e nao podem mudar de Silo.");
      return;
    }
    if (!listId) {
      handleDetachArticle(art);
      return;
    }

    const target = lists.find(list => String(list.id) === String(listId));
    if (!target) return;

    updateClusterSilo(art.clusterId, target.id, target.nome);
    showNotification("success", `Artigo movido para ${target.nome}.`);
  };

  const handleDeleteSiloGroup = (group: { articles: any[] }) => {
    if (group.articles.some(art => art.isPublished)) {
      showNotification("error", "Silos com artigos publicados nao podem ser apagados.");
      return;
    }
    pushMasterHistory();
    const clusterIds = new Set(group.articles.map(art => art.clusterId));
    setMasterList(prev => prev.map(kw =>
      clusterIds.has(kw.clusterId)
        ? { ...kw, siloId: null, silo_id: null, siloName: null }
        : kw
    ));
    setSelectedIds(prev => {
      const next = new Set(prev);
      group.articles.forEach(art => next.delete(art.id));
      return next;
    });
    showNotification("success", "Silo removido da estrutura local; artigos voltaram para Sem Grupo.");
  };

  const handleDetachSupportKeyword = (keyword: any) => {
    const nextClusterId = `manual-${keyword.id}-${Date.now()}`;
    pushMasterHistory();
    setMasterList(prev => prev.map(kw =>
      kw.id === keyword.id
        ? { ...kw, clusterId: nextClusterId }
        : kw
    ));
    showNotification("success", "Keyword secundaria removida do artigo sem apagar o registro.");
  };

  const articlesList = useMemo(() => {
    const clustersMap = new Map<number, {
      clusterId: number;
      siloId: any;
      siloName: string;
      isPublished: boolean;
      mainKeyword: any;
      supportKeywords: any[];
    }>();

    masterList.forEach(kw => {
      const cid = kw.clusterId || 0;
      if (!clustersMap.has(cid)) {
        clustersMap.set(cid, {
          clusterId: cid,
          siloId: kw.siloId,
          siloName: kw.siloName,
          isPublished: false,
          mainKeyword: null,
          supportKeywords: []
        });
      }

      const entry = clustersMap.get(cid)!;
      if (kw.isPublished) {
        entry.isPublished = true;
      }

      // Define a keyword principal do cluster (âncora publicada ou maior volume)
      if (!entry.mainKeyword) {
        entry.mainKeyword = kw;
      } else {
        if (kw.isPublished && !entry.mainKeyword.isPublished) {
          entry.supportKeywords.push(entry.mainKeyword);
          entry.mainKeyword = kw;
        } else if (kw.isPublished === entry.mainKeyword.isPublished) {
          if ((kw.volume_search || 0) > (entry.mainKeyword.volume_search || 0)) {
            entry.supportKeywords.push(entry.mainKeyword);
            entry.mainKeyword = kw;
          } else {
            entry.supportKeywords.push(kw);
          }
        } else {
          entry.supportKeywords.push(kw);
        }
      }
    });

    // Mapeamento final para objetos do tipo Artigo
    const articles = Array.from(clustersMap.values()).map(c => {
      const main = c.mainKeyword;
      return {
        id: `art-${c.clusterId}`,
        clusterId: c.clusterId,
        siloId: c.siloId,
        siloName: c.siloName,
        siloSlug: toSlug(c.siloName || ""),
        isPublished: c.isPublished,
        keywordPrincipal: main?.keyword || "",
        slug: main?.computedSlug || toSlug(main?.keyword || ""),
        hierarquia: main?.computedHierarquia || "Pilar",
        volume: main?.volume_search || 0,
        intent: main?.intent || "Informativo",
        kgr: main?.kgr || null,
        analiseSemantica: main?.analise_semantica || null,
        supportKeywords: c.supportKeywords,
        mainKeywordObj: main,
        briefingId: main?.briefingId || `temp-${c.clusterId}`
      };
    });

    // Ordenação: Silo (alfabético) -> Volume do artigo (Volume da Kw Principal) desc
    const sortedArticles = articles.sort((a, b) => {
      const sA = (a.siloName || "").toLowerCase();
      const sB = (b.siloName || "").toLowerCase();
      if (sA < sB) return -1;
      if (sA > sB) return 1;
      return (b.volume || 0) - (a.volume || 0);
    });

    const siloPositions: Record<string, number> = {};
    return sortedArticles.map(art => {
      const siloKey = `${art.siloId ?? "sem-silo"}-${art.siloSlug || "sem-silo"}`;
      const position = siloPositions[siloKey] ?? 0;
      siloPositions[siloKey] = position + 1;

      return {
        ...art,
        hierarquia: customHierarquias[art.id] || (position === 0 ? "Pilar" : `Suporte ${position}`),
      };
    });
  }, [masterList, customHierarquias]);

  // ── Filtros aplicados sobre a lista de artigos
  const filteredArticles = useMemo(() => {
    return articlesList.filter(art => {
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesMain = art.keywordPrincipal.toLowerCase().includes(q) || art.slug.toLowerCase().includes(q);
        const matchesSupport = art.supportKeywords.some(sk => sk.keyword.toLowerCase().includes(q));
        if (!matchesMain && !matchesSupport) return false;
      }
      if (filterHierarquia !== "Todos") {
        const h = art.hierarquia.toLowerCase();
        const f = filterHierarquia.toLowerCase();
        if (f.includes("reforço")) {
          if (!h.includes("reforço")) return false;
        } else {
          if (!h.includes(f)) return false;
        }
      }
      return true;
    });
  }, [articlesList, searchQuery, filterHierarquia]);

  // ── Mapeamento estável de cores por Artigo (Cluster) dentro de cada Silo
  const groupedArticles = useMemo(() => {
    const groups = new Map<string, {
      key: string;
      siloId: any;
      siloName: string;
      siloSlug: string;
      articles: typeof filteredArticles;
    }>();

    filteredArticles.forEach(art => {
      const siloName = art.siloName || "Sem Silo";
      const siloSlug = art.siloSlug || "sem-silo";
      const key = `${art.siloId ?? "sem-silo"}-${siloSlug}`;

      if (!groups.has(key)) {
        groups.set(key, {
          key,
          siloId: art.siloId,
          siloName,
          siloSlug,
          articles: [],
        });
      }

      groups.get(key)!.articles.push(art);
    });

    return Array.from(groups.values());
  }, [filteredArticles]);

  const selectArticles = (articleIds: string[]) => {
    setSelectedIds(new Set(articleIds));
    setSelectionMenuOpen(false);
  };

  const selectGroup = (articleIds: string[]) => {
    setSelectedIds(new Set(articleIds));
    setSelectionMenuOpen(false);
  };

  const handleDeleteSelectedNonPublished = () => {
    if (selectedIds.size === 0) return;
    const selectedArticles = articlesList.filter(art => selectedIds.has(art.id));
    const selectedClusterIds = new Set(selectedArticles.map(art => art.clusterId));
    const protectedCount = selectedArticles.filter(art => art.isPublished).length;
    pushMasterHistory();
    setMasterList(prev => prev.filter(item => item.status === "publicado" || !selectedClusterIds.has(item.clusterId)));
    setSelectedIds(new Set());
    showNotification("success", protectedCount > 0
      ? "Novos selecionados removidos. Publicados foram preservados."
      : "Itens novos selecionados removidos.");
  };

  const handleResetNonPublished = () => {
    const nonPublishedCount = masterList.filter(item => item.status !== "publicado").length;
    if (nonPublishedCount === 0) {
      showNotification("success", "Nao ha itens novos para limpar.");
      return;
    }

    const ok = window.confirm(`Limpar ${nonPublishedCount} item(ns) nao-publicado(s)? Os publicados serao preservados.`);
    if (!ok) return;

    pushMasterHistory();
    setMasterList(prev => prev.filter(item => item.status === "publicado"));
    setSelectedIds(new Set());
    showNotification("success", "Reset aplicado: apenas nao-publicados foram removidos.");
  };

  if (sessionStatus === "loading" || profileLoading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-[#06070a]">
        <Loader2 className="w-6 h-6 text-indigo-500 animate-spin" />
      </div>
    );
  }
  if (sessionStatus === "unauthenticated") {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#06070a] text-slate-200 p-6 text-center font-mono">
        <Building2 className="w-10 h-10 text-indigo-500 mb-3" />
        <h1 className="text-sm font-bold uppercase tracking-wider">Acesso Restrito</h1>
        <button onClick={() => router.push("/api/auth/signin")}
          className="mt-5 bg-indigo-600 hover:bg-indigo-500 text-white rounded px-5 py-2 text-xs font-bold cursor-pointer">
          Ir para Login
        </button>
      </div>
    );
  }

  return (
    <div className="flex-1 bg-[#06070a] flex flex-col overflow-hidden font-mono text-xs relative select-none">

      {/* ── Toast ── */}
      {notification && (
        <div className={`fixed top-3 right-3 z-[60] flex items-center gap-2 px-3 py-2 rounded border shadow-xl text-xs font-semibold ${
          notification.type === "success"
            ? "bg-[#091510] border-emerald-800/60 text-emerald-400"
            : "bg-[#150909] border-rose-800/60 text-rose-400"
        }`}>
          <Check className="w-3 h-3" />
          <span>{notification.message}</span>
        </div>
      )}

      {/* ── BARRA UNICA: FERRAMENTAS + MENU HAMBURGER DE NAVEGABILIDADE ── */}
      <div className="bg-[#0b0c10] border-b border-slate-900 px-3 h-10 flex items-center justify-between shrink-0 z-30">
        
        {/* Esquerda: Identidade + Busca + Filtros + Ferramentas da Planilha (Visíveis) */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
          <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px] shrink-0">Arquiteto</span>
          <span className="text-slate-800 select-none shrink-0">·</span>

          <div className="flex items-center gap-1 shrink-0">
            <button
              onClick={undoMasterList}
              disabled={masterUndoStack.length === 0}
              className="p-1 text-slate-600 hover:text-slate-300 border border-slate-800 hover:border-slate-650 rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Voltar uma alteracao"
            >
              <Undo2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={redoMasterList}
              disabled={masterRedoStack.length === 0}
              className="p-1 text-slate-600 hover:text-slate-300 border border-slate-800 hover:border-slate-650 rounded transition-colors cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
              title="Refazer alteracao"
            >
              <Redo2 className="w-3.5 h-3.5" />
            </button>
          </div>

          <span className="text-slate-800 select-none shrink-0">|</span>

          {/* Busca */}
          <div className="relative shrink-0">
            <Search className="w-3 h-3 text-slate-655 absolute left-2 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input type="text" placeholder="Buscar..." value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="w-36 bg-transparent border border-slate-800 rounded pl-6 pr-2 py-0.5 text-[10.5px] text-slate-200 placeholder-slate-700 focus:outline-none focus:border-slate-600 transition-colors" />
          </div>

          {/* Filtro Hierarquia */}
          <select value={filterHierarquia} onChange={e => setFilterHierarquia(e.target.value)}
            className="bg-transparent border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-400 focus:outline-none cursor-pointer shrink-0">
            <option value="Todos" className="bg-[#0b0c10]">Hierarquia: Todos</option>
            <option value="Pilar" className="bg-[#0b0c10]">Pilar</option>
            <option value="Suporte" className="bg-[#0b0c10]">Suporte</option>
            <option value="Reforço Narrativo" className="bg-[#0b0c10]">Reforço Narrativo</option>
          </select>

          <span className="text-slate-800 select-none shrink-0">|</span>

          {/* Carregar */}
          <button onClick={fetchMasterList} disabled={loadingKeywords}
            className="flex items-center gap-1 border border-slate-800 hover:border-slate-650 hover:text-slate-200 text-slate-400 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40 cursor-pointer shrink-0"
            title="Sincronizar artigos">
            {loadingKeywords ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3" />}
            <span>Carregar</span>
          </button>

          {/* Gerar IA */}
          <button onClick={() => handlePipelineStep("Revalidar Estrutura")} disabled={masterList.length === 0 || generatingStrategic}
            className="flex items-center gap-1 border border-indigo-900/60 hover:border-indigo-700 text-indigo-400 hover:text-indigo-300 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40 cursor-pointer shrink-0"
            title="Gerar Dossiês IA">
            {generatingStrategic ? <Loader2 className="w-3 h-3 animate-spin" /> : <Zap className="w-3 h-3" />}
            <span>Revalidar Estrutura (IA)</span>
          </button>

          <button onClick={() => handlePipelineStep("Gerar DNA dos Artigos")}
            disabled={masterList.length === 0 || generatingStrategic}
            className="flex items-center gap-1 border border-indigo-900/60 hover:border-indigo-700 text-indigo-400 hover:text-indigo-300 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40 cursor-pointer shrink-0"
            title="Etapa 2: IA cria o DNA individual dos artigos">
            <Zap className="w-3 h-3" />
            <span>Gerar DNA dos Artigos (IA)</span>
          </button>

          <button onClick={() => handlePipelineStep("Gerar DNA dos Silos")}
            disabled={masterList.length === 0 || generatingStrategic}
            className="flex items-center gap-1 border border-emerald-900/60 hover:border-emerald-700 text-emerald-400 hover:text-emerald-300 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40 cursor-pointer shrink-0"
            title="Etapa 3: IA define estrategia macro e linkagem do Silo">
            <Zap className="w-3 h-3" />
            <span>Gerar DNA dos Silos (IA)</span>
          </button>

          {/* Novo Silo */}
          <button onClick={() => setIsListModalOpen(true)}
            className="flex items-center gap-1 border border-slate-800 hover:border-slate-650 hover:text-slate-200 text-slate-400 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer shrink-0"
            title="Criar novo Silo">
            <Plus className="w-3 h-3" />
            <span>Silo</span>
          </button>

          {/* Exportar */}
          <button onClick={() => showNotification("success", "Exportação iniciada...")}
            className="flex items-center gap-1 border border-slate-800 hover:border-emerald-800 text-emerald-500 hover:text-emerald-450 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer shrink-0"
            title="Exportar planilha">
            <Download className="w-3 h-3" />
            <span>Exportar</span>
          </button>

          <button onClick={handleDeleteSelectedNonPublished}
            disabled={selectedIds.size === 0}
            className="flex items-center gap-1 border border-slate-800 hover:border-rose-800 text-rose-500 hover:text-rose-400 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer shrink-0"
            title="Remove apenas itens novos selecionados; publicados sao preservados">
            <Trash2 className="w-3 h-3" />
            <span>Apagar Selecionados</span>
          </button>

          <button onClick={handleResetNonPublished}
            className="flex items-center gap-1 border border-rose-900/60 hover:border-rose-700 text-rose-400 hover:text-rose-300 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer shrink-0"
            title="Limpar importacoes erradas mantendo todos os publicados">
            <RefreshCw className="w-3 h-3" />
            <span>Limpar Nao-Publicados (Reset)</span>
          </button>
        </div>

        {/* Direita: Contador de Artigos + Dropdown Hamburger de NAVEGABILIDADE */}
        <div className="flex items-center gap-2" ref={menuRef}>
          {articlesList.length > 0 && (
            <span className="text-slate-700 text-[10px] font-semibold tabular-nums shrink-0 mr-1 hidden sm:inline">
              {filteredArticles.length} artigos
            </span>
          )}

          <div className="relative">
            {/* Hamburger Button */}
            <button
              onClick={() => setMenuOpen(v => !v)}
              className="flex items-center justify-center bg-transparent hover:bg-slate-900 border border-slate-800 hover:border-slate-600 rounded p-1.5 text-slate-400 hover:text-slate-200 transition-colors cursor-pointer"
              title="Menu Principal"
            >
              <Menu className="w-3.5 h-3.5" />
            </button>

            {/* Menu Dropdown de Navegabilidade */}
            {menuOpen && (
              <div className="absolute right-0 top-full mt-1.5 w-56 bg-[#0e1015] border border-slate-850 rounded shadow-2xl z-[80] overflow-hidden">
                {/* Header: User account details */}
                <div className="px-3 py-2 border-b border-slate-850 bg-slate-950/40">
                  <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest block">Conta Ativa</span>
                  <span className="text-slate-400 text-[10px] truncate block font-sans" title={session?.user?.email || ""}>
                    {session?.user?.email}
                  </span>
                </div>

                {/* Seletor de Marcas/Clientes (Admin Only) */}
                <div className="p-2 border-b border-slate-850">
                  <span className="text-[8px] font-bold text-slate-600 uppercase tracking-widest block mb-1">Cliente / Marca</span>
                  {userRole === "admin" ? (
                    <select
                      value={selectedBrandId}
                      onChange={e => { setSelectedBrandId(e.target.value); setMenuOpen(false); }}
                      className="w-full bg-[#06070a] border border-slate-800 rounded px-2 py-1 text-[11px] text-slate-300 font-bold focus:outline-none cursor-pointer"
                    >
                      {brands.length === 0 ? (
                        <option value="" disabled>Sem Marcas</option>
                      ) : (
                        brands.map(brand => (
                          <option key={brand.id} value={brand.id} className="bg-[#0b0c10]">{brand.nome}</option>
                        ))
                      )}
                    </select>
                  ) : (
                    <span className="text-[11px] text-slate-400 font-bold px-1.5 block">
                      {brands.find(b => b.id === selectedBrandId)?.nome || "Sem Marca"}
                    </span>
                  )}
                </div>

                {/* Links de Navegação */}
                <div className="py-1">
                  <button onClick={() => { router.push("/perfil"); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[11px] text-slate-350 hover:bg-slate-900 transition-colors cursor-pointer">
                    <User className="w-3.5 h-3.5 text-slate-500" />
                    <span>Perfil da Marca</span>
                  </button>

                  <button onClick={() => { router.push("/minerador"); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[11px] text-slate-350 hover:bg-slate-900 transition-colors cursor-pointer">
                    <Key className="w-3.5 h-3.5 text-slate-500" />
                    <span>Minerador Key</span>
                  </button>

                  <button onClick={() => { router.push("/arquiteto"); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[11px] text-indigo-400 hover:bg-slate-900 transition-colors cursor-pointer font-bold bg-slate-900/30">
                    <PenTool className="w-3.5 h-3.5 text-indigo-400" />
                    <span>Arquiteto de Conteúdo</span>
                  </button>

                  {userRole === "admin" && (
                    <button onClick={() => { router.push("/admin/marcas"); setMenuOpen(false); }}
                      className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[11px] text-indigo-400 hover:bg-slate-900 transition-colors cursor-pointer">
                      <Building2 className="w-3.5 h-3.5 text-slate-500" />
                      <span>Painel Admin</span>
                    </button>
                  )}
                </div>

                {/* Logout Button */}
                <div className="border-t border-slate-850 py-1 bg-slate-950/20">
                  <button onClick={() => { signOut(); setMenuOpen(false); }}
                    className="w-full flex items-center gap-2.5 px-3.5 py-2 text-left text-[11px] text-rose-455 hover:bg-rose-950/15 transition-colors cursor-pointer font-bold">
                    <LogOut className="w-3.5 h-3.5 text-rose-500" />
                    <span>Sair da Conta</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── PLANILHA PRINCIPAL DE ARTIGOS ── */}
      <main className="flex-1 overflow-auto">
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2.5 text-slate-700">
            <span className="text-[11px]">
              {masterList.length === 0
                ? "Abra o menu (≡) e clique em Carregar Artigos."
                : "Nenhum artigo corresponde aos filtros."}
            </span>
          </div>
        ) : (
          <div className="w-full overflow-x-auto">
            <table className="w-full border-collapse min-w-[900px] text-left">
              <thead className="sticky top-0 z-20">
                <tr className="bg-[#080a0f] text-slate-500 text-[9px] font-bold uppercase tracking-widest border-b border-slate-800/80">
                  <th className="py-2 px-2.5 w-16">
                    <div className="relative flex items-center gap-1" ref={selectionMenuRef}>
                      <input
                        type="checkbox"
                        checked={filteredArticles.length > 0 && filteredArticles.every(art => selectedIds.has(art.id))}
                        onChange={() => {
                          const allIds = filteredArticles.map(art => art.id);
                          const allSelected = allIds.length > 0 && allIds.every(id => selectedIds.has(id));
                          selectArticles(allSelected ? [] : allIds);
                        }}
                        className="h-3.5 w-3.5 rounded border-slate-700 bg-[#06070a] accent-blue-500 cursor-pointer"
                        title="Selecionar tudo que esta visivel"
                      />
                      <button
                        onClick={() => setSelectionMenuOpen(v => !v)}
                        className="text-slate-600 hover:text-slate-300 transition-colors cursor-pointer p-0.5"
                        title="Opcoes de selecao"
                      >
                        <MoreHorizontal className="w-3.5 h-3.5" />
                      </button>
                      {selectionMenuOpen && (
                        <div className="absolute left-0 top-full mt-1 w-64 bg-[#0e1015] border border-slate-850 rounded shadow-2xl z-40 overflow-hidden normal-case tracking-normal">
                          <button
                            onClick={() => selectArticles(filteredArticles.map(art => art.id))}
                            className="w-full px-3 py-2 text-left text-[10px] text-slate-300 hover:bg-slate-900 transition-colors cursor-pointer"
                          >
                            Selecionar Tudo
                          </button>
                          <button
                            onClick={() => selectArticles(filteredArticles.filter(art => !art.isPublished).map(art => art.id))}
                            className="w-full px-3 py-2 text-left text-[10px] text-slate-300 hover:bg-slate-900 transition-colors cursor-pointer"
                          >
                            Selecionar Apenas Novos (Aprovados)
                          </button>
                          <div className="border-y border-slate-850 py-1">
                            <span className="block px-3 py-1 text-[8px] font-bold uppercase tracking-widest text-slate-600">
                              Selecionar Grupo/Cor Especifico
                            </span>
                            {groupedArticles.map(group => (
                              <button
                                key={group.key}
                                onClick={() => selectGroup(group.articles.map(art => art.id))}
                                className="w-full px-3 py-1.5 text-left text-[10px] text-slate-400 hover:bg-slate-900 hover:text-slate-200 transition-colors cursor-pointer truncate"
                              >
                                {group.siloName} ({group.articles.length})
                              </button>
                            ))}
                          </div>
                          <button
                            onClick={() => selectArticles([])}
                            className="w-full px-3 py-2 text-left text-[10px] text-slate-500 hover:bg-slate-900 transition-colors cursor-pointer"
                          >
                            Desmarcar Tudo
                          </button>
                        </div>
                      )}
                    </div>
                  </th>
                  <th className="py-2 px-2.5 w-6">{/* chevron */}</th>
                  <th className="py-2 px-2.5 w-24">Status</th>
                  <th className="py-2 px-3 w-28">Hierarquia</th>
                  <th className="py-2 px-3">Keyword Principal (Pilar)</th>
                  <th className="py-2 px-3 w-52 text-right">Ações</th>
                </tr>
              </thead>

              <tbody>
                {groupedArticles.map((group, groupIndex) => {
                  const siloPaletteSize = Math.min(SILO_COLORS.length, ARTICLE_COLORS.length, ARTICLE_ACCENTS.length);
                  const siloColor = SILO_COLORS[groupIndex % siloPaletteSize];
                  const groupArticleIds = group.articles.map(art => art.id);
                  const groupHasPublished = group.articles.some(art => art.isPublished);
                  const allGroupSelected = groupArticleIds.length > 0 && groupArticleIds.every(id => selectedIds.has(id));

                  return (
                    <React.Fragment key={group.key}>
                      <tr className={`bg-gray-900 border-l-4 ${siloColor.border} border-y border-slate-800/80`}>
                        <td colSpan={6} className="px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-2">
                              <input
                                type="checkbox"
                                checked={allGroupSelected}
                                onChange={() => toggleSiloSelection(groupArticleIds)}
                                className="h-3.5 w-3.5 rounded border-slate-700 bg-[#06070a] accent-blue-500 cursor-pointer"
                                title="Selecionar artigos do Silo"
                              />
                              <div className="min-w-0 flex items-center gap-2">
                                <span className={`text-[10px] font-bold uppercase tracking-widest ${siloColor.headerText}`}>
                                  Silo: {group.siloName}
                                </span>
                                <span className="truncate text-[10px] text-blue-400 font-mono select-all">
                                  /{group.siloSlug}
                                </span>
                                <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[8.5px] font-bold uppercase tracking-wider text-slate-400 ${siloColor.countBg} ${siloColor.countBorder}`}>
                                  {group.articles.length} {group.articles.length === 1 ? "artigo" : "artigos"}
                                </span>
                                {groupHasPublished && (
                                  <span className="shrink-0 rounded border border-slate-700/70 bg-slate-950 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">
                                    Publicados protegidos
                                  </span>
                                )}
                              </div>
                            </div>
                            {group.siloId && String(group.siloId).startsWith("tmp-") && !groupHasPublished && (
                              <button
                                onClick={() => handleDeleteSiloGroup(group)}
                                className="shrink-0 text-slate-600 hover:text-rose-400 transition-colors cursor-pointer p-1"
                                title="Apagar Silo novo e devolver artigos para Sem Grupo"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>

                      {group.articles.map((art) => {
                  const rowBg     = siloColor.rowBg;
                  const isExpanded = expandedIds.has(art.id);
                  const currentSlug = customSlugs[art.id] ?? art.slug;
                  const activeTab = activeTabs[art.id] || "suporte";

                  return (
                    <React.Fragment key={art.id}>
                      {/* Linha do Artigo */}
                      <tr className={`border-b border-slate-900/40 transition-colors ${rowBg} ${art.isPublished ? "opacity-60" : "hover:brightness-105"}`}>

                        <td className="py-2 px-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={selectedIds.has(art.id)}
                            onChange={() => toggleArticleSelection(art.id)}
                            className="h-3.5 w-3.5 rounded border-slate-700 bg-[#06070a] accent-blue-500 cursor-pointer"
                            title={art.isPublished ? "Selecionar publicado protegido" : "Selecionar artigo novo"}
                          />
                        </td>
                        
                        {/* Seta Chevron */}
                        <td className="py-2 px-2.5 text-center">
                          <button onClick={() => toggleExpand(art.id)}
                            className="text-slate-550 hover:text-slate-300 transition-colors cursor-pointer p-0.5">
                            {isExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                          </button>
                        </td>

                        {/* Status */}
                        <td className="py-2 px-2.5">
                          {art.isPublished ? (
                            <span className="text-[9.5px] font-bold uppercase tracking-wider text-slate-500 border border-slate-700/60 px-2 py-0.5 rounded">
                              Publicado
                            </span>
                          ) : (
                            <span className="text-[9.5px] font-bold uppercase tracking-wider text-indigo-400 border border-indigo-900/40 px-2 py-0.5 rounded">
                              Novo
                            </span>
                          )}
                        </td>

                        <td className="py-2 px-3">
                          <select
                            value={art.hierarquia}
                            onChange={e => setCustomHierarquias(prev => ({
                              ...prev,
                              [art.id]: e.target.value,
                              [art.briefingId]: e.target.value,
                            }))}
                            className={`rounded border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-wider focus:outline-none cursor-pointer ${
                              art.hierarquia === "Pilar"
                                ? "border-blue-500/30 bg-blue-500/10 text-blue-300"
                                : "border-slate-700/60 bg-slate-900/40 text-slate-400"
                            }`}
                            title={art.isPublished ? "Permitido: mudar hierarquia sem alterar slug, keyword ou Silo" : "Editar hierarquia"}
                          >
                            <option value="Pilar" className="bg-[#0b0c10]">Pilar</option>
                            {Array.from({ length: Math.max(group.articles.length - 1, 1) }, (_, idx) => `Suporte ${idx + 1}`).map(option => (
                              <option key={option} value={option} className="bg-[#0b0c10]">{option}</option>
                            ))}
                          </select>
                        </td>

                        {/* Keyword Principal + Slug */}
                        <td className="py-2 px-3">
                          <div className="flex items-center gap-3 min-w-0">
                            <span className={`font-bold text-[12px] truncate ${art.isPublished ? "text-slate-400" : "text-slate-100"}`}>
                              {art.keywordPrincipal}
                            </span>
                            {art.isPublished ? (
                              <span className="font-mono text-[10.5px] text-slate-500 select-all shrink-0" title="Slug publicado bloqueado para preservar a URL">
                                /{art.slug}
                              </span>
                            ) : (
                              <input
                                type="text"
                                value={currentSlug}
                                onChange={e => setCustomSlugs(prev => ({ ...prev, [art.id]: e.target.value }))}
                                className="w-full max-w-[280px] bg-[#06070a]/60 border border-slate-800 hover:border-slate-700 focus:border-blue-500 rounded px-2.5 py-0.5 text-[10.5px] text-blue-400 font-mono focus:outline-none transition-colors"
                              />
                            )}
                          </div>
                        </td>

                        <td className="py-2 px-3">
                          {!art.isPublished ? (
                            <div className="flex items-center justify-end gap-1.5">
                              <button
                                onClick={() => handleDetachArticle(art)}
                                className="text-slate-600 hover:text-rose-400 transition-colors cursor-pointer p-1"
                                title="Remover do Grupo"
                              >
                                <Unlink className="w-3.5 h-3.5" />
                              </button>
                              <select
                                value={art.siloId || ""}
                                onChange={e => handleMoveArticleToSilo(art, e.target.value)}
                                className="max-w-[145px] bg-[#06070a]/80 border border-slate-800 rounded px-1.5 py-0.5 text-[9.5px] text-slate-400 focus:outline-none focus:border-blue-600 cursor-pointer"
                                title="Mudar de Silo"
                              >
                                <option value="" className="bg-[#0b0c10]">Sem Grupo</option>
                                {lists.map(list => (
                                  <option key={list.id} value={list.id} className="bg-[#0b0c10]">
                                    {list.nome}
                                  </option>
                                ))}
                              </select>
                            </div>
                          ) : (
                            <span className="flex items-center justify-end gap-1 text-right text-[9px] font-bold uppercase tracking-wider text-slate-600" title="Slug, keyword principal e Silo travados. Hierarquia editavel.">
                              <ShieldCheck className="w-3 h-3" />
                              URL/Silo travados
                            </span>
                          )}
                        </td>
                      </tr>

                      {/* Acordeão Expandido do Artigo */}
                      {isExpanded && (
                        <tr className={`${rowBg} border-b border-slate-900/30`}>
                          <td colSpan={6} className="py-4 px-10">
                            
                            {/* Abas do Acordeão */}
                            <div className="flex items-center gap-1 border-b border-slate-800/80 pb-1.5 mb-3.5">
                              <button
                                onClick={() => setActiveTabs(prev => ({ ...prev, [art.id]: "suporte" }))}
                                className={`px-3 py-1 font-bold text-[9.5px] uppercase tracking-wider rounded transition-colors cursor-pointer ${
                                  activeTab === "suporte" ? "bg-slate-850 text-indigo-400" : "text-slate-500 hover:text-slate-350"
                                }`}
                              >
                                Keywords de Suporte ({art.supportKeywords.length})
                              </button>
                              <button
                                onClick={() => setActiveTabs(prev => ({ ...prev, [art.id]: "dna" }))}
                                className={`px-3 py-1 font-bold text-[9.5px] uppercase tracking-wider rounded transition-colors cursor-pointer ${
                                  activeTab === "dna" ? "bg-slate-850 text-teal-400" : "text-slate-500 hover:text-slate-350"
                                }`}
                              >
                                DNA do Artigo
                              </button>
                            </div>

                            {/* ── ABA 1: KEYWORDS DE SUPORTE ── */}
                            {activeTab === "suporte" && (
                              <div className="flex flex-col gap-2.5">
                                <div className="border border-blue-500/15 bg-blue-500/[.035] rounded p-3">
                                  <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-2 mb-2">
                                    <div className="min-w-0">
                                      <span className="text-[8.5px] font-bold text-blue-400 uppercase tracking-widest block">DNA da Palavra Principal</span>
                                      <div className="flex items-center gap-3 min-w-0">
                                        <span className="text-[12px] font-bold text-slate-100 truncate">{art.keywordPrincipal}</span>
                                        <span className="text-[10px] text-blue-400 font-mono select-all shrink-0">/{currentSlug}</span>
                                      </div>
                                    </div>
                                    <div className="flex flex-wrap items-center gap-2 text-[9.5px]">
                                      <span className="rounded border border-blue-500/20 bg-blue-500/10 px-2 py-0.5 text-blue-300 font-bold uppercase tracking-wider">{art.hierarquia}</span>
                                      <span className="text-slate-400">Volume <strong className="text-slate-200 font-mono">{(art.volume || 0).toLocaleString("pt-BR")}</strong></span>
                                      <span className="text-slate-400">Intencao <strong className="text-slate-200">{art.intent || "Informativo"}</strong></span>
                                      <span className="text-slate-400">KGR <strong className="text-emerald-400 font-mono">{art.kgr != null ? Number(art.kgr).toFixed(3) : "-"}</strong></span>
                                    </div>
                                  </div>

                                  {art.analiseSemantica && Object.keys(art.analiseSemantica).length > 0 ? (
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[9.5px]">
                                      {art.analiseSemantica.perfil_b2b && (
                                        <div className="bg-[#06070a]/60 rounded p-1.5 border border-slate-900">
                                          <span className="text-slate-600 font-bold uppercase tracking-wider text-[7.5px] block mb-0.5">Nicho / Perfil</span>
                                          <p className="text-slate-300 leading-relaxed">{art.analiseSemantica.perfil_b2b}</p>
                                        </div>
                                      )}
                                      {art.analiseSemantica.emocao_dominante && (
                                        <div className="bg-[#06070a]/60 rounded p-1.5 border border-slate-900">
                                          <span className="text-slate-600 font-bold uppercase tracking-wider text-[7.5px] block mb-0.5">Dor / Objecao</span>
                                          <p className="text-slate-300 leading-relaxed">{art.analiseSemantica.emocao_dominante}</p>
                                        </div>
                                      )}
                                      {art.analiseSemantica.nivel_consciencia && (
                                        <div className="bg-[#06070a]/60 rounded p-1.5 border border-slate-900">
                                          <span className="text-slate-600 font-bold uppercase tracking-wider text-[7.5px] block mb-0.5">Nivel de Consciencia</span>
                                          <p className="text-slate-300 leading-relaxed">{art.analiseSemantica.nivel_consciencia}</p>
                                        </div>
                                      )}
                                    </div>
                                  ) : (
                                    <span className="text-[9.5px] text-slate-650 italic">Sem DNA semantico disponivel para a keyword principal.</span>
                                  )}
                                </div>
                                {art.supportKeywords.length === 0 ? (
                                  <span className="text-[10px] text-slate-655 italic">Nenhuma keyword secundária de suporte vinculada a este artigo.</span>
                                ) : (
                                  <div className="border border-slate-800/40 rounded overflow-hidden">
                                    <table className="w-full text-left text-[10px] border-collapse bg-[#06070a]/20">
                                      <thead>
                                        <tr className="bg-[#0b0c10]/40 text-slate-600 font-bold uppercase tracking-wider text-[8px] border-b border-slate-900/50">
                                          <th className="py-1.5 px-3 w-6"></th>
                                          <th className="py-1.5 px-3">Keyword</th>
                                          <th className="py-1.5 px-3 w-20">Volume</th>
                                          <th className="py-1.5 px-3 w-24">Intenção</th>
                                          <th className="py-1.5 px-3 w-16">KGR</th>
                                          <th className="py-1.5 px-3 w-24">Hierarquia</th>
                                          <th className="py-1.5 px-3 w-20 text-right">Acao</th>
                                        </tr>
                                      </thead>
                                      <tbody>
                                        {art.supportKeywords.map((sk, skIndex) => {
                                          const isKwExpanded = expandedKwIds.has(sk.id);
                                          const keywordColor = SUPPORT_KEYWORD_COLORS[skIndex % SUPPORT_KEYWORD_COLORS.length];
                                          return (
                                            <React.Fragment key={sk.id}>
                                              <tr className={`border-l-4 ${keywordColor.stripe} border-b border-slate-900/30 hover:brightness-125 transition-colors ${keywordColor.row}`}>
                                                
                                                {/* Chevron do DNA Semântico da Keyword */}
                                                <td className="py-1 px-3">
                                                  <button onClick={() => toggleExpandKw(sk.id)}
                                                    className="text-slate-600 hover:text-slate-300 transition-colors cursor-pointer">
                                                    {isKwExpanded ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                                  </button>
                                                </td>

                                                <td className="py-1 px-3 font-semibold text-slate-300">{sk.keyword}</td>
                                                <td className="py-1 px-3 text-slate-400 font-mono">{(sk.volume_search || 0).toLocaleString("pt-BR")}</td>
                                                <td className="py-1 px-3 text-slate-400">{sk.intent || "Informativo"}</td>
                                                <td className="py-1 px-3 font-mono">
                                                  <span className={(sk.kgr || 0) < 0.25 ? "text-emerald-400" : (sk.kgr || 0) < 1 ? "text-amber-450" : "text-rose-455"}>
                                                    {sk.kgr != null ? Number(sk.kgr).toFixed(3) : "—"}
                                                  </span>
                                                </td>
                                                <td className="py-1 px-3 text-slate-500 font-semibold">{sk.computedHierarquia}</td>
                                                <td className="py-1 px-3 text-right">
                                                  <button
                                                    onClick={() => handleDetachSupportKeyword(sk)}
                                                    className="text-slate-600 hover:text-rose-400 transition-colors cursor-pointer p-1"
                                                    title="Remover keyword secundaria deste artigo sem apagar o registro"
                                                  >
                                                    <Unlink className="w-3.5 h-3.5 inline" />
                                                  </button>
                                                </td>
                                              </tr>

                                              {/* DNA Semântico da Keyword Individual (Etapa 1) */}
                                              {isKwExpanded && (
                                                <tr className={`border-l-4 ${keywordColor.stripe} ${keywordColor.expanded}`}>
                                                  <td colSpan={7} className="py-2.5 px-8">
                                                    {sk.analise_semantica && Object.keys(sk.analise_semantica).length > 0 ? (
                                                      <div className="flex flex-col gap-2">
                                                        <span className="text-[8.5px] font-bold text-indigo-400 uppercase tracking-widest">DNA Semântico da Keyword</span>
                                                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-[9.5px]">
                                                          {sk.analise_semantica.perfil_b2b && (
                                                            <div className={`bg-[#06070a]/60 rounded p-1.5 border ${keywordColor.border}`}>
                                                              <span className="text-slate-600 font-bold uppercase tracking-wider text-[7.5px] block mb-0.5">Perfil Público B2B</span>
                                                              <p className="text-slate-300 leading-relaxed">{sk.analise_semantica.perfil_b2b}</p>
                                                            </div>
                                                          )}
                                                          {sk.analise_semantica.emocao_dominante && (
                                                            <div className={`bg-[#06070a]/60 rounded p-1.5 border ${keywordColor.border}`}>
                                                              <span className="text-slate-600 font-bold uppercase tracking-wider text-[7.5px] block mb-0.5">Dor / Emoção Dominante</span>
                                                              <p className="text-slate-300 leading-relaxed">{sk.analise_semantica.emocao_dominante}</p>
                                                            </div>
                                                          )}
                                                          {sk.analise_semantica.nivel_consciencia && (
                                                            <div className={`bg-[#06070a]/60 rounded p-1.5 border ${keywordColor.border}`}>
                                                              <span className="text-slate-600 font-bold uppercase tracking-wider text-[7.5px] block mb-0.5">Nível de Consciência</span>
                                                              <p className="text-slate-300 leading-relaxed">{sk.analise_semantica.nivel_consciencia}</p>
                                                            </div>
                                                          )}
                                                        </div>
                                                      </div>
                                                    ) : (
                                                      <span className="text-[9px] text-slate-700 italic">Sem DNA semântico disponível para esta keyword.</span>
                                                    )}
                                                  </td>
                                                </tr>
                                              )}
                                            </React.Fragment>
                                          );
                                        })}
                                      </tbody>
                                    </table>
                                  </div>
                                )}
                              </div>
                            )}

                            {/* ── ABA 2: DNA DO ARTIGO (Briefing Estratégico) ── */}
                            {activeTab === "dna" && (
                              <div className="bg-[#06070a]/40 border border-slate-800/40 rounded p-4 flex flex-col gap-3.5">
                                <div className="flex justify-between items-center pb-2 border-b border-slate-900">
                                  <div>
                                    <span className="text-[9.5px] font-bold text-teal-400 uppercase tracking-widest block">Metadados e Diretrizes de Briefing</span>
                                    <span className="text-slate-500 text-[9px]">Consolidação estratégica do cluster/artigo</span>
                                  </div>

                                  <button
                                    onClick={() => handleSaveArticleDna(art)}
                                    disabled={savingBriefingId === art.briefingId}
                                    className="bg-indigo-650 hover:bg-indigo-600 disabled:opacity-40 text-white font-bold text-[10px] px-3.5 py-1 rounded transition-colors cursor-pointer flex items-center gap-1.5"
                                    title={art.isPublished ? "Salva apenas campos permitidos; slug, keyword e Silo ficam intactos" : "Salvar DNA"}
                                  >
                                    {savingBriefingId === art.briefingId && <Loader2 className="w-2.5 h-2.5 animate-spin" />}
                                    Salvar DNA
                                  </button>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                                  {/* Meta Title */}
                                  <div className="flex flex-col gap-1.5">
                                    <div className="flex justify-between">
                                      <label className="text-[8.5px] font-bold text-slate-500 uppercase tracking-wider">Meta Title (SEO)</label>
                                      <span className={`text-[8.5px] font-bold ${(dnaMetaTitles[art.briefingId] || "").length > 60 ? "text-red-500" : "text-slate-655"}`}>
                                        {(dnaMetaTitles[art.briefingId] || "").length}/60
                                      </span>
                                    </div>
                                    <input
                                      type="text"
                                      value={dnaMetaTitles[art.briefingId] || ""}
                                      onChange={e => setDnaMetaTitles(p => ({ ...p, [art.briefingId]: e.target.value }))}
                                      disabled={art.isPublished}
                                      className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-slate-750 disabled:text-slate-500"
                                      placeholder="Título magnético otimizado..."
                                    />
                                  </div>

                                  {/* Meta Description */}
                                  <div className="flex flex-col gap-1.5">
                                    <div className="flex justify-between">
                                      <label className="text-[8.5px] font-bold text-slate-500 uppercase tracking-wider">Meta Description</label>
                                      <span className={`text-[8.5px] font-bold ${(dnaMetaDescriptions[art.briefingId] || "").length > 155 ? "text-red-500" : "text-slate-655"}`}>
                                        {(dnaMetaDescriptions[art.briefingId] || "").length}/155
                                      </span>
                                    </div>
                                    <input
                                      type="text"
                                      value={dnaMetaDescriptions[art.briefingId] || ""}
                                      onChange={e => setDnaMetaDescriptions(p => ({ ...p, [art.briefingId]: e.target.value }))}
                                      disabled={art.isPublished}
                                      className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-slate-750 disabled:text-slate-500"
                                      placeholder="Resumo focado em cliques (CTR)..."
                                    />
                                  </div>

                                  {/* Ângulo de Venda */}
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[8.5px] font-bold text-slate-500 uppercase tracking-wider">💡 Ângulo de Venda Sugerido</label>
                                    <textarea
                                      rows={3}
                                      value={dnaAngulosVenda[art.briefingId] || ""}
                                      onChange={e => setDnaAngulosVenda(p => ({ ...p, [art.briefingId]: e.target.value }))}
                                      disabled={art.isPublished}
                                      className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-slate-750 disabled:text-slate-500 resize-none font-sans text-[11px]"
                                      placeholder="Defina como o artigo deve se posicionar para converter o leitor..."
                                    />
                                  </div>

                                  {/* CTA */}
                                  <div className="flex flex-col gap-1">
                                    <label className="text-[8.5px] font-bold text-slate-500 uppercase tracking-wider">⚡ Chamada Para Ação (CTA)</label>
                                    <textarea
                                      rows={3}
                                      value={dnaCTAs[art.briefingId] || ""}
                                      onChange={e => setDnaCTAs(p => ({ ...p, [art.briefingId]: e.target.value }))}
                                      disabled={art.isPublished}
                                      className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-slate-750 disabled:text-slate-500 resize-none font-sans text-[11px]"
                                      placeholder="Ex: Baixar planilha, agendar consulta..."
                                    />
                                  </div>

                                  {/* Anti-Canibalização */}
                                  <div className="flex flex-col gap-1 sm:col-span-2">
                                    <label className="text-[8.5px] font-bold text-slate-500 uppercase tracking-wider">🛡️ Ângulo Anti-Canibalização</label>
                                    <textarea
                                      rows={2}
                                      value={dnaAntiCanibalizacoes[art.briefingId] || ""}
                                      onChange={e => setDnaAntiCanibalizacoes(p => ({ ...p, [art.briefingId]: e.target.value }))}
                                      disabled={art.isPublished}
                                      className="w-full bg-[#06070a] border border-slate-850 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-slate-750 disabled:text-slate-500 resize-none font-sans text-[11px]"
                                      placeholder="Diretrizes para diferenciar este artigo de outros parecidos do ecossistema..."
                                    />
                                  </div>
                                </div>
                              </div>
                            )}

                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                      })}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </main>

      {/* ── Modal Criar Silo ── */}
      {isListModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-slate-800 w-full max-w-sm rounded shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-[10px] text-white uppercase tracking-wider">Criar Novo Silo</span>
              <button onClick={() => setIsListModalOpen(false)} className="text-slate-500 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateList} className="p-4 flex flex-col gap-3">
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nome</label>
                <input type="text" required placeholder="Ex: Captacao de Pacientes"
                  value={newListName} onChange={e => setNewListName(e.target.value)}
                  className="w-full bg-[#06070a] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-650 text-xs" />
              </div>
              <div className="flex flex-col gap-1">
                <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nicho (opcional)</label>
                <input type="text" placeholder="Ex: Clinicas locais"
                  value={newListNicho} onChange={e => setNewListNicho(e.target.value)}
                  className="w-full bg-[#06070a] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-650 text-xs" />
              </div>
              <div className="flex justify-end gap-2 mt-1">
                <button type="button" onClick={() => setIsListModalOpen(false)}
                  className="border border-slate-800 text-slate-400 font-bold py-1.5 px-3 rounded text-xs cursor-pointer hover:bg-slate-900">Cancelar</button>
                <button type="submit" disabled={saving}
                  className="bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-bold py-1.5 px-4 rounded text-xs flex items-center gap-1 cursor-pointer">
                  {saving && <Loader2 className="w-3 h-3 animate-spin" />} Criar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
