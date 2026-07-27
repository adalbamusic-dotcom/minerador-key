"use client";

import React, { useState, useEffect, useMemo, useRef, useCallback } from "react";
import { useBrand } from "@/components/brand-context";
import { useSession, signOut } from "next-auth/react";
import { z } from "zod";
import { useRouter } from "next/navigation";
import { buildProvisionalGroups, describeAssignedGroups } from "@/lib/arquiteto/engine";
import { detectArchitectureConflicts } from "@/lib/arquiteto/conflicts";
import type {
  ArticleDNA,
  EditorialArticleUnitType,
  EditorialUnitClassification,
  LandingPagePurpose,
  KeywordArticleReview,
  ProvisionalArticleGroup,
  SiloDNA,
  SiloPage,
  VersionEnvelope,
  VersionStatusEvent,
} from "@/lib/arquiteto/contracts";
import { ProvisionalArticleGroupSchema, SiloPageSchema } from "@/lib/arquiteto/contracts";
import {
  applyKeywordArticleReview,
  buildLogicalKeywordRecommendations,
  buildRelevantArticleCatalog,
  buildKeywordReviewBatches,
  mergeKeywordArticleReviews,
} from "@/lib/arquiteto/keyword-article-review";
import { createStatusEvent, createVersionEnvelope } from "@/lib/arquiteto/versioning";
import { resolveArchitectDeepLink, sameStringSet } from "@/lib/arquiteto/deep-link";
import { deterministicArticleDnaPayload, deterministicSiloDnaPayload, deterministicSiloPagePayload } from "@/lib/arquiteto/adapters";
import { assertManualPublishedSiloPageUrl, assertManualSiloPageSlugAvailable, initialManualSiloPageVerification, normalizeManualSiloPageSlug } from "@/lib/arquiteto/manual-silo";
import { confirmArticleArchitecture } from "@/lib/arquiteto/architecture-confirmation";
import { applyHumanEditorialUnitDecision, suggestEditorialUnitClassification } from "@/lib/arquiteto/unit-strategy";
import { adaptKeywordIdentityContext, resolveArticleSerpIdentityContext, serpAssessmentModeLabel } from "@/lib/arquiteto/identity-context";
import {
  SerpFormationAssessmentSchema,
  SerpFormationRecoverySchema,
  SerpPublicationVerificationSchema,
  applySerpRecommendationToWorkCopy,
  assessedKeywordDnaIds,
  architectSerpFormationKey,
  decideSerpRecommendation,
  findSerpRecommendationForKeyword,
  isPublishedStructuralRecommendation,
  markSerpAssessmentOutdated,
  type SerpFormationAssessment,
  type SerpPublicationVerification,
  unassociatedSerpRecommendations,
} from "@/lib/arquiteto/serp-formation";
import { articleApprovalIssues, effectiveVersionStatus, siloDnaPreflight } from "@/lib/editorial/operational-flow";
import type { AIReviewAnnotation } from "@/lib/editorial/operational-contracts";
import { useEditorialPipeline } from "@/components/editorial-pipeline-context";
import { ArticleDnaSummary, SiloDnaSummary } from "@/components/editorial/dna-panels";
import { CompactSavedViews } from "@/components/editorial/compact-saved-views";
import { WorkflowImportDialog, WorkflowStatusBadge } from "@/components/editorial/workflow-status";
import { DangerApprovalDialog } from "@/components/editorial/danger-approval-dialog";
import { BackgroundTaskNotice } from "@/components/editorial/background-task-notice";
import { HistoryControls } from "@/components/editorial/history-controls";
import { useLocalHistory } from "@/components/editorial/use-local-history";
import {
  ArchitectArticleDnaRecoverySchema,
  ArchitectRecoverySnapshotSchema,
  ArchitectReviewRecoverySchema,
  ArchitectSiloDnaRecoverySchema,
  auditArchitectWorkspace,
  architectArticleDnaRecoveryKey,
  architectReviewRecoveryKey,
  architectSiloDnaRecoveryKey,
  buildArchitectRecoveryPlan,
  createArchitectRecoverySnapshot,
  type ArchitectRecoveryAudit,
  type ArchitectRecoveryPlan,
  type ArchitectRecoverySnapshot,
} from "@/lib/editorial/architect-recovery";
import { readBrowserArtifactReadOnly, readBrowserStorageSnapshot, writeBrowserArtifact } from "@/lib/editorial/browser-artifact-store";
import { ArchitectRecoveryPanel } from "@/components/editorial/architect-recovery-panel";
import {
  createAuthenticatedBrowserClient,
  getCurrentSupabaseToken,
  getSupabaseSessionErrorMessage,
  isSupabaseBrowserAuthError,
  isSupabaseTokenExpirationError,
  withSupabaseSelectRetry,
} from "@/lib/supabase/browser-authenticated-client";
// Labels rendered by the identity resolver: SERP de fortalecimento · SERP de arquitetura do publicado · SERP de formação.
import {
  Loader2,
  X,
  Check,
  Lock,
  RefreshCw,
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
  Key,
  ArrowRight,
  Network
} from "lucide-react";

interface KeywordImportCandidate {
  id: string;
  keyword: string;
  intent: string | null;
  volume_search: number | null;
  status: "aprovado" | "publicado";
  lista_id: string | null;
  siloName: string | null;
}

type ArchitectDatabaseSources = {
  silos: any[];
  keywords: any[];
  briefings: any[];
  capturedAt: string;
};

type ArchitectBackgroundResult =
  | { kind: "logical_grouping"; groups: ProvisionalArticleGroup[]; regrouped: Array<Record<string, unknown>> }
  | { kind: "keyword_review"; review: KeywordArticleReview; batchCount: number }
  | { kind: "article_dna"; versions: VersionEnvelope<ArticleDNA>[]; events: VersionStatusEvent[] }
  | { kind: "silo_dna"; versions: VersionEnvelope<SiloDNA>[]; events: VersionStatusEvent[] }
  | { kind: "silo_page"; versions: VersionEnvelope<SiloPage>[]; events: VersionStatusEvent[] };

type PendingDangerAction =
  | { type: "delete-selected"; clusterIds: string[]; count: number; protectedCount: number }
  | { type: "reset-new"; count: number }
  | { type: "remove-silo"; clusterIds: string[]; articleIds: string[]; siloName: string };

type AiReviewArticle = {
  mainKeywordObj: { id: string; aiReviewAnnotation?: AIReviewAnnotation } | null;
  supportKeywords: Array<{ id: string; aiReviewAnnotation?: AIReviewAnnotation }>;
};

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

const EDITORIAL_UNIT_LABELS: Record<EditorialArticleUnitType, string> = {
  article: "Artigo", service_page: "Página de serviço", landing_page: "Landing page", category_page: "Página de categoria", other: "Outro",
};
const LANDING_PURPOSE_LABELS: Record<Exclude<LandingPagePurpose, undefined>, string> = {
  seo: "SEO", campaign: "Campanha", hybrid: "Híbrida", unknown: "Ainda não definida",
};

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
  const supabase = useMemo(() => createAuthenticatedBrowserClient(), []);
  const { architectImportedKeywordIds, articleVersions: acceptedArticleDnas, siloVersions: acceptedSiloDnas, siloPageVersions: acceptedSiloPages, versionEvents, aiReviewAnnotations,
    setArticleVersions: setAcceptedArticleDnas, setSiloVersions: setAcceptedSiloDnas, setSiloPageVersions: setAcceptedSiloPages, addVersionEvents,
    selectedEntityId, setSelectedEntityId, importApprovedKeywordsToArchitect, setArchitectImportedKeywordIds, importApprovedToRadar, importApprovedSiloPagesToRadar, radarItems,
    backgroundTasks, runBackgroundTask, consumeBackgroundTask, dismissBackgroundTask, addAiReviewAnnotations, restoreOperationalSnapshot,
    plannerItems, documents, operationalPublications } = useEditorialPipeline();

  // Data
  const [lists,    setLists]    = useState<any[]>([]);
  const [masterList, setMasterList] = useState<any[]>([]);
  const [keywordImportPool, setKeywordImportPool] = useState<KeywordImportCandidate[]>([]);
  const [keywordImportError, setKeywordImportError] = useState<string | null>(null);
  const [databaseSources, setDatabaseSources] = useState<ArchitectDatabaseSources>({ silos: [], keywords: [], briefings: [], capturedAt: "" });
  const [recoverySnapshot, setRecoverySnapshot] = useState<ArchitectRecoverySnapshot | null>(null);
  const [recoveryAudit, setRecoveryAudit] = useState<ArchitectRecoveryAudit | null>(null);
  const [recoveryPlan, setRecoveryPlan] = useState<ArchitectRecoveryPlan | null>(null);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryError, setRecoveryError] = useState<string | null>(null);
  const importedKeywordIds = useMemo(() => new Set(architectImportedKeywordIds), [architectImportedKeywordIds]);
  const renderedKeywordIds = useMemo(
    () => new Set(masterList.map(item => String(item.keywordId || item.id)).filter(Boolean)),
    [masterList],
  );
  const effectiveImportedKeywordIdsForUi = useMemo(
    () => new Set(recoveryPlan?.correctedImportedKeywordIds || recoveryAudit?.ids.effectiveImportedKeywordIds || (renderedKeywordIds.size ? renderedKeywordIds : architectImportedKeywordIds)),
    [architectImportedKeywordIds, recoveryAudit, recoveryPlan, renderedKeywordIds],
  );
  const importedKeywordSignature = useMemo(() => [...architectImportedKeywordIds].sort().join("|"), [architectImportedKeywordIds]);
  const [keywordImportOpen, setKeywordImportOpen] = useState(false);
  const [provisionalGroups, setProvisionalGroups] = useState<ProvisionalArticleGroup[]>([]);
  const [serpAssessments, setSerpAssessments] = useState<SerpFormationAssessment[]>([]);
  const [publicationVerifications, setPublicationVerifications] = useState<SerpPublicationVerification[]>([]);
  const [serpPreview, setSerpPreview] = useState<{ groups: ProvisionalArticleGroup[]; queryCount: number } | null>(null);
  const [serpBusy, setSerpBusy] = useState(false);
  const [serpExecution, setSerpExecution] = useState<Record<string, { status: "processing" | "ready" | "error"; queryCount: number; completed: number; message?: string }>>({});
  const [verificationBusy, setVerificationBusy] = useState<Set<string>>(new Set());

  // UI state
  const [loading,           setLoading]           = useState(true);
  const [saving,            setSaving]            = useState(false);
  const [updating,          setUpdating]          = useState(false);
  const [loadingKeywords,   setLoadingKeywords]   = useState(false);
  const architectTasks = useMemo(() => backgroundTasks.filter(task => ["logical_grouping", "keyword_review", "article_dna", "silo_dna", "silo_page"].includes(task.type)), [backgroundTasks]);
  const runningArchitectTask = (type: "logical_grouping" | "keyword_review" | "article_dna" | "silo_dna" | "silo_page") =>
    architectTasks.find(task => task.type === type && (task.status === "queued" || task.status === "running"));
  const activeLogicalTask = runningArchitectTask("logical_grouping");
  const activeKeywordReviewTask = runningArchitectTask("keyword_review");
  const activeArticleDnaTask = runningArchitectTask("article_dna");
  const activeSiloDnaTask = runningArchitectTask("silo_dna");
  const activeSiloPageTask = runningArchitectTask("silo_page");
  const generatingStrategic = Boolean(activeLogicalTask || activeKeywordReviewTask || activeArticleDnaTask || activeSiloDnaTask || activeSiloPageTask);
  const [notification,      setNotification]      = useState<{ type:"success"|"error"; message:string }|null>(null);
  const [menuOpen,          setMenuOpen]          = useState(false);
  const [selectionMenuOpen, setSelectionMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const selectionMenuRef = useRef<HTMLDivElement>(null);
  const lastLoadedImportSignature = useRef("");
  const recoveredArchitectArtifacts = useRef(new Set<string>());
  const reviewRecoveryReady = useRef(new Set<string>());
  const serpRecoveryReady = useRef(new Set<string>());
  const consumedExternalNavigation = useRef<string | null>(null);
  const masterListRef = useRef(masterList);
  masterListRef.current = masterList;

  // Accordion — expanded row ids & active tabs per expanded article
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [activeTabs,  setActiveTabs]  = useState<Record<string, "suporte" | "dna">>({});
  const [unitDrafts, setUnitDrafts] = useState<Record<string, { type: EditorialArticleUnitType; landingPagePurpose: LandingPagePurpose }>>({});
  const [primaryDrafts, setPrimaryDrafts] = useState<Record<string, string>>({});

  // Toolbar filters
  const [searchQuery,      setSearchQuery]      = useState("");
  const [filterHierarquia, setFilterHierarquia] = useState("Todos");
  const [filterStatus, setFilterStatus] = useState("Todos");

  // Inline edits
  const [customSlugs,       setCustomSlugs]       = useState<Record<string,string>>({});
  const [customHierarquias, setCustomHierarquias] = useState<Record<string,string>>({});
  const [selectedArticleIds,       setSelectedArticleIds]       = useState<Set<string>>(new Set());
  const [selectedSiloPageIds, setSelectedSiloPageIds] = useState<Set<string>>(new Set());
  const [expandedSiloIds, setExpandedSiloIds] = useState<Set<string>>(new Set());
  const architectHistoryValue = useMemo(() => ({ masterList, customSlugs, customHierarquias, articleVersions: acceptedArticleDnas, siloVersions: acceptedSiloDnas, siloPageVersions: acceptedSiloPages, versionEvents, aiReviewAnnotations }), [masterList, customSlugs, customHierarquias, acceptedArticleDnas, acceptedSiloDnas, acceptedSiloPages, versionEvents, aiReviewAnnotations]);
  const masterHistory = useLocalHistory("arquiteto", architectHistoryValue, snapshot => {
    setMasterList(snapshot.masterList);
    setCustomSlugs(snapshot.customSlugs);
    setCustomHierarquias(snapshot.customHierarquias);
    setProvisionalGroups(describeAssignedGroups(snapshot.masterList));
    restoreOperationalSnapshot("arquiteto", snapshot);
    setSelectedArticleIds(new Set());
  }, 30, selectedBrandId || "sem-marca");
  const [selectedStatusAction, setSelectedStatusAction] = useState("");
  const [pendingDangerAction, setPendingDangerAction] = useState<PendingDangerAction | null>(null);
  useEffect(() => {
    if (!selectedBrandId || recoveredArchitectArtifacts.current.has(selectedBrandId)) return;
    const brandId = selectedBrandId;
    let cancelled = false;
    const recover = async () => {
      const recoveredEvents: VersionStatusEvent[] = [];
      try {
        const raw = await readBrowserArtifactReadOnly(architectArticleDnaRecoveryKey(brandId));
        if (raw && !cancelled) {
          const recovered = ArchitectArticleDnaRecoverySchema.parse(raw);
          setAcceptedArticleDnas(current => ({ ...current, ...recovered.versions }));
          recoveredEvents.push(...recovered.events);
        }
      } catch { /* artefato inválido não impede a recuperação dos demais */ }
      try {
        const raw = await readBrowserArtifactReadOnly(architectSiloDnaRecoveryKey(brandId));
        if (raw && !cancelled) {
          const recovered = ArchitectSiloDnaRecoverySchema.parse(raw);
          setAcceptedSiloDnas(current => ({ ...current, ...recovered.versions }));
          recoveredEvents.push(...recovered.events);
        }
      } catch { /* artefato inválido não impede a recuperação dos demais */ }
      if (cancelled) return;
      recoveredArchitectArtifacts.current.add(brandId);
      if (recoveredEvents.length) addVersionEvents(recoveredEvents);
    };
    void recover();
    return () => { cancelled = true; };
  }, [selectedBrandId, setAcceptedArticleDnas, setAcceptedSiloDnas, addVersionEvents]);

  useEffect(() => {
    if (!selectedBrandId) return;
    const brandId = selectedBrandId;
    let cancelled = false;
    serpRecoveryReady.current.delete(brandId);
    setSerpAssessments([]);
    setPublicationVerifications([]);
    const recover = async () => {
      try {
        const raw = await readBrowserArtifactReadOnly(architectSerpFormationKey(brandId));
        if (!cancelled && raw) {
          const recovered = SerpFormationRecoverySchema.parse(raw);
          setSerpAssessments(recovered.assessments);
          setPublicationVerifications(recovered.verifications || []);
        }
      } catch { /* recuperação inválida não substitui o workspace atual */ }
      if (!cancelled) serpRecoveryReady.current.add(brandId);
    };
    void recover();
    return () => { cancelled = true; };
  }, [selectedBrandId]);

  useEffect(() => {
    if (!selectedBrandId || !serpRecoveryReady.current.has(selectedBrandId)) return;
    const recovery = SerpFormationRecoverySchema.parse({ schemaVersion: 1, brandId: selectedBrandId, updatedAt: new Date().toISOString(), assessments: serpAssessments, verifications: publicationVerifications });
    const timer = window.setTimeout(() => { void writeBrowserArtifact(architectSerpFormationKey(selectedBrandId), recovery).catch(() => undefined); }, 0);
    return () => window.clearTimeout(timer);
  }, [selectedBrandId, serpAssessments, publicationVerifications]);

  useEffect(() => {
    if (!selectedBrandId || !recoveredArchitectArtifacts.current.has(selectedBrandId)) return;
    const timer = window.setTimeout(() => {
      try {
        const versionIds = new Set(Object.values(acceptedArticleDnas).map(version => version.versionId));
        const recovery = ArchitectArticleDnaRecoverySchema.parse({ schemaVersion: 1, versions: acceptedArticleDnas,
          events: versionEvents.filter(event => versionIds.has(event.versionId)), savedAt: new Date().toISOString() });
        void writeBrowserArtifact(architectArticleDnaRecoveryKey(selectedBrandId), recovery).catch(() => undefined);
      } catch { /* cada artefato mantém sua própria recuperação */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [acceptedArticleDnas, selectedBrandId, versionEvents]);

  useEffect(() => {
    if (!selectedBrandId || !recoveredArchitectArtifacts.current.has(selectedBrandId)) return;
    const timer = window.setTimeout(() => {
      try {
        const versionIds = new Set(Object.values(acceptedSiloDnas).map(version => version.versionId));
        const recovery = ArchitectSiloDnaRecoverySchema.parse({ schemaVersion: 1, versions: acceptedSiloDnas,
          events: versionEvents.filter(event => versionIds.has(event.versionId)), savedAt: new Date().toISOString() });
        void writeBrowserArtifact(architectSiloDnaRecoveryKey(selectedBrandId), recovery).catch(() => undefined);
      } catch { /* cada artefato mantém sua própria recuperação */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [acceptedSiloDnas, selectedBrandId, versionEvents]);

  useEffect(() => {
    const requested = selectedEntityId || (typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("articleId") : null);
    if (!requested || !masterList.length) return;
    const navigation = resolveArchitectDeepLink(masterList, requested, selectedBrandId, consumedExternalNavigation.current);
    if (!navigation) return;
    consumedExternalNavigation.current = navigation.requestKey;
    setExpandedIds(current => sameStringSet(current, [navigation.articleRowId]) ? current : new Set([navigation.articleRowId]));
    setSelectedArticleIds(current => sameStringSet(current, [navigation.articleRowId]) ? current : new Set([navigation.articleRowId]));
    if (selectedEntityId) setSelectedEntityId(null);
    if (typeof window !== "undefined" && new URL(window.location.href).searchParams.has("articleId")) {
      const url = new URL(window.location.href);
      url.searchParams.delete("articleId");
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    }
  }, [masterList, selectedBrandId, selectedEntityId, setSelectedEntityId]);

  // Silo modal
  const [isListModalOpen, setIsListModalOpen] = useState(false);
  const [newListName,     setNewListName]     = useState("");
  const [newListCentralEntity, setNewListCentralEntity] = useState("");
  const [createSiloPage, setCreateSiloPage] = useState(false);
  const [newSiloPageSlug, setNewSiloPageSlug] = useState("");
  const [newSiloPagePublicationStatus, setNewSiloPagePublicationStatus] = useState<"new" | "published">("new");
  const [newSiloPagePublishedUrl, setNewSiloPagePublishedUrl] = useState("");
  const [verifyingSiloPageId, setVerifyingSiloPageId] = useState<string | null>(null);

  // Edição direta de Briefing/DNA do Artigo no acordeão
  const [savingBriefingId, setSavingBriefingId] = useState<string | null>(null);
  const [dnaMetaTitles, setDnaMetaTitles] = useState<Record<string, string>>({});
  const [dnaMetaDescriptions, setDnaMetaDescriptions] = useState<Record<string, string>>({});
  const [dnaAngulosVenda, setDnaAngulosVenda] = useState<Record<string, string>>({});
  const [dnaCTAs, setDnaCTAs] = useState<Record<string, string>>({});
  const [dnaAntiCanibalizacoes, setDnaAntiCanibalizacoes] = useState<Record<string, string>>({});

  // Inner Accordion - Keyword semantic DNA expanded rows
  const [expandedKwIds, setExpandedKwIds] = useState<Set<string>>(new Set());

  // Close the article-selection menu on outside click.
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
    if (sessionStatus === "authenticated") {
      fetchData();
      fetchMasterList();
    } else if (sessionStatus === "unauthenticated") {
      setLoading(false);
    }
  }, [selectedBrandId, sessionStatus, supabase]);

  const showNotification = (type: "success"|"error", msg: string) => {
    setNotification({ type, message: msg });
    setTimeout(() => setNotification(null), 3500);
  };

  // ── Fetch silos + briefings
  const pushMasterHistory = (snapshot = masterList, label = "Alteração na arquitetura de artigos") => masterHistory.capture(label, { masterList: snapshot, customSlugs, customHierarquias, articleVersions: acceptedArticleDnas, siloVersions: acceptedSiloDnas, siloPageVersions: acceptedSiloPages, versionEvents, aiReviewAnnotations });

  const undoMasterList = () => {
    masterHistory.undo();
    showNotification("success", "Voltando uma alteração estrutural.");
  };

  const redoMasterList = () => {
    masterHistory.redo();
    showNotification("success", "Refazendo alteração estrutural.");
  };

  const fetchData = async () => {
    if (sessionStatus !== "authenticated" || !selectedBrandId) return;
    setLoading(true);
    try {
      await getCurrentSupabaseToken();
      const silos = await withSupabaseSelectRetry(async () => {
        const { data: silosData, error: silosError } = await supabase
          .from("listas_kgr").select("*")
          .eq("marca_id", selectedBrandId).order("created_at", { ascending: false });
        if (silosError) throw silosError;
        return silosData || [];
      });
      setLists(silos);

    } catch (err: any) {
      const authError = isSupabaseBrowserAuthError(err);
      console.error("Erro ao carregar listas_kgr no Arquiteto:", {
        code: authError ? err.code : err?.code,
        ...(authError ? err.diagnostic : {}),
        table: "listas_kgr",
        operation: "select",
        status: err?.status,
        tokenExpired: authError ? isSupabaseTokenExpirationError(err) : false,
        message: authError ? undefined : err?.message,
      });
      showNotification(
        "error",
        authError ? getSupabaseSessionErrorMessage(err.code, err.expiresAt) : err?.message || "Erro ao carregar dossiês.",
      );
    } finally { setLoading(false); }
  };

  const readArchitectDatabaseSources = async (): Promise<ArchitectDatabaseSources> => {
    if (sessionStatus !== "authenticated" || !selectedBrandId) {
      return { silos: [], keywords: [], briefings: [], capturedAt: new Date().toISOString() };
    }
    await getCurrentSupabaseToken();
    return withSupabaseSelectRetry(async () => {
      const { data: silosData, error: silosError } = await supabase
        .from("listas_kgr").select("id, nome, nicho, marca_id, created_at").eq("marca_id", selectedBrandId);
      if (silosError) throw silosError;
      const silos = silosData || [];
      const allowedIds = silos.map(silo => silo.id);
      let keywordQuery = supabase.from("keywords_kgr").select("*").eq("brand_id", selectedBrandId);
      keywordQuery = allowedIds.length
        ? keywordQuery.or(`lista_id.is.null,${allowedIds.map(id => `lista_id.eq.${id}`).join(",")}`)
        : keywordQuery.is("lista_id", null);
      const [keywordResult, briefingResults] = await Promise.all([
        keywordQuery,
        Promise.all([
          allowedIds.length
            ? supabase.from("briefings_artigos").select("*").in("silo_id", allowedIds)
            : Promise.resolve({ data: [], error: null }),
          supabase.from("briefings_artigos").select("*").is("silo_id", null),
        ]),
      ]);
      if (keywordResult.error) throw keywordResult.error;
      const [briefingsWithSilo, briefingsWithoutSilo] = briefingResults;
      if (briefingsWithSilo.error) throw briefingsWithSilo.error;
      if (briefingsWithoutSilo.error) throw briefingsWithoutSilo.error;
      const byId = new Map<string, any>();
      [...(briefingsWithSilo.data || []), ...(briefingsWithoutSilo.data || [])].forEach(briefing => byId.set(String(briefing.id), briefing));
      return { silos, keywords: keywordResult.data || [], briefings: [...byId.values()], capturedAt: new Date().toISOString() };
    });
  };

  // ── Fetch & cluster master list
  const fetchMasterList = async (approvedIds = importedKeywordIds) => {
    if (sessionStatus !== "authenticated" || !selectedBrandId) return;
    setLoadingKeywords(true);
    setKeywordImportError(null);
    try {
      const sourceData = await readArchitectDatabaseSources();
      setDatabaseSources(sourceData);
      const silosData = sourceData.silos;
      const allKws = sourceData.keywords;
      const allBriefingsRaw = sourceData.briefings;
      const siloNameMap: Record<string,string> = {};
      silosData.forEach(s => { siloNameMap[String(s.id)] = s.nome; });

      // Keywords
      // [DIAG] Rastreio de keywords por camada
      setKeywordImportPool(allKws
        .filter(keyword => ["aprovado", "publicado"].includes(keyword.status?.toLowerCase()))
        .map(keyword => ({
          id: keyword.id,
          keyword: keyword.keyword,
          intent: keyword.intent || null,
          volume_search: keyword.volume_search ?? null,
          status: keyword.status.toLowerCase() as KeywordImportCandidate["status"],
          lista_id: keyword.lista_id || null,
          siloName: keyword.lista_id ? siloNameMap[String(keyword.lista_id)] || null : null,
        }))
        .sort((left, right) => left.status.localeCompare(right.status) || left.keyword.localeCompare(right.keyword, "pt-BR")));

      // Briefings — busca em paralelo
      const allBriefings = allBriefingsRaw;

      // A leitura inicial apenas reapresenta o workspace já persistido. A
      // reconciliação de fontes fica bloqueada até o snapshot ser exportado.
      let persistedReview: z.infer<typeof ArchitectReviewRecoverySchema> | null = null;
      try {
        const rawRecovery = await readBrowserArtifactReadOnly(architectReviewRecoveryKey(selectedBrandId));
        if (rawRecovery) persistedReview = ArchitectReviewRecoverySchema.parse(rawRecovery);
      } catch { /* uma cópia inválida não autoriza reconstrução implícita */ }
      const currentWorkspaceItems = masterListRef.current.length ? masterListRef.current : persistedReview?.masterList || [];
      const currentWorkspaceByKeywordId = new Map(currentWorkspaceItems.map(item => [String(item.keywordId || item.id), item]));

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
        const publishedArticleId = briefing ? `pub-b-${briefing.id}` : `pub-k-${kw.id}`;

        publishedMap.set(kw.keyword.toLowerCase().trim(), {
          id: publishedArticleId,
          clusterId: publishedArticleId,
          provisionalGroupId: publishedArticleId,
          briefingId: briefing?.id || null,
          keywordId: kw.id,
          keyword: kw.keyword,
          volume_search: kw.volume_search || 0,
          intent: kw.intent || "Informativo",
          kgr: kw.kgr_score || kw.kgr || null,
          status: "publicado",
          slug_sugerido: briefing?.slug_sugerido || slugSemantica,
          publishedUrl: briefing?.published_url || briefing?.publishedUrl || briefing?.url || kw.published_url || kw.publishedUrl || kw.url || null,
          canonical: briefing?.canonical || briefing?.canonical_url || kw.canonical || kw.canonical_url || null,
          hierarquia: briefing?.hierarquia || hierarquiaSemantica,
          silo_id: briefing?.silo_id || kw.lista_id,
          siloName: siloNameMap[String(briefing?.silo_id || kw.lista_id)] || null,
          isPublished: true,
          meta_title: briefing?.meta_title || null,
          meta_description: briefing?.meta_description || null,
          diretrizes_estrategicas: briefing?.diretrizes_estrategicas || null,
          keywords_secundarias: briefing?.keywords_secundarias || [],
          analise_semantica: kw.analise_semantica || null,
          ...adaptKeywordIdentityContext(kw),
        });
      });

      // Se houver algum briefing publicado que não esteja no keywords_kgr, adiciona
      pubBriefings.forEach(b => {
        const key = b.keyword_principal.toLowerCase().trim();
        if (!publishedMap.has(key)) {
          const kwMatch = allKws.find(k => k.keyword.toLowerCase().trim() === key);
          publishedMap.set(key, {
            id: `pub-b-${b.id}`,
            clusterId: `pub-b-${b.id}`,
            provisionalGroupId: `pub-b-${b.id}`,
            briefingId: b.id,
            keywordId: kwMatch?.id || null,
            keyword: b.keyword_principal,
            volume_search: kwMatch?.volume_search || 0,
            intent: kwMatch?.intent || "Informativo",
            kgr: kwMatch?.kgr_score || kwMatch?.kgr || null,
            status: "publicado",
            slug_sugerido: b.slug_sugerido,
            publishedUrl: b.published_url || b.publishedUrl || b.url || null,
            canonical: b.canonical || b.canonical_url || null,
            hierarquia: b.hierarquia,
            silo_id: b.silo_id,
            siloName: siloNameMap[String(b.silo_id)] || null,
            isPublished: true,
            meta_title: b.meta_title || null,
            meta_description: b.meta_description || null,
            diretrizes_estrategicas: b.diretrizes_estrategicas || null,
            keywords_secundarias: b.keywords_secundarias || [],
            analise_semantica: kwMatch?.analise_semantica || null,
            ...(kwMatch ? adaptKeywordIdentityContext(kwMatch) : adaptKeywordIdentityContext(b)),
          });
        }
      });

      publishedMap.forEach(item => {
        const current = currentWorkspaceByKeywordId.get(String(item.keywordId || item.id));
        items.push(current ? { ...item, ...current, id: item.id, keywordId: item.keywordId, status: "publicado", isPublished: true } : item);
      });

      // Relações explícitas já gravadas no briefing são evidência de vínculo;
      // elas não são reagrupadas nem inferidas por similaridade lexical.
      pubBriefings.forEach(briefing => {
        const anchor = publishedMap.get(String(briefing.keyword_principal || "").toLowerCase().trim());
        if (!anchor) return;
        const secondaryValues = Array.isArray(briefing.keywords_secundarias)
          ? briefing.keywords_secundarias
          : typeof briefing.keywords_secundarias === "string"
            ? (() => { try { const parsed = JSON.parse(briefing.keywords_secundarias); return Array.isArray(parsed) ? parsed : []; } catch { return []; } })()
            : [];
        secondaryValues.forEach((secondary: unknown) => {
          const value = typeof secondary === "string" ? secondary.trim() : "";
          const secondaryKeyword = allKws.find(keyword => String(keyword.id) === value || String(keyword.keyword).toLowerCase().trim() === value.toLowerCase());
          if (!secondaryKeyword || secondaryKeyword.id === anchor.keywordId) return;
          if (items.some(item => item.keywordId === secondaryKeyword.id && item.clusterId === anchor.clusterId)) return;
          items.push({
            id: `pub-support-${briefing.id}-${secondaryKeyword.id}`,
            clusterId: anchor.clusterId,
            provisionalGroupId: anchor.provisionalGroupId,
            briefingId: briefing.id,
            keywordId: secondaryKeyword.id,
            keyword: secondaryKeyword.keyword,
            volume_search: secondaryKeyword.volume_search || 0,
            intent: secondaryKeyword.intent || "Informativo",
            kgr: secondaryKeyword.kgr_score || secondaryKeyword.kgr || null,
            status: secondaryKeyword.status || "aprovado",
            slug_sugerido: anchor.slug_sugerido,
            publishedUrl: anchor.publishedUrl || secondaryKeyword.published_url || secondaryKeyword.publishedUrl || secondaryKeyword.url || null,
            canonical: anchor.canonical || secondaryKeyword.canonical || secondaryKeyword.canonical_url || null,
            hierarquia: "Reforco Narrativo",
            silo_id: anchor.silo_id,
            siloName: anchor.siloName,
            isPublished: false,
            computedSlug: anchor.slug_sugerido,
            computedHierarquia: "Reforco Narrativo",
            analise_semantica: secondaryKeyword.analise_semantica || null,
            ...adaptKeywordIdentityContext(secondaryKeyword),
          });
        });
      });

      // 2. Reapresentar keywords aprovadas importadas agora ou já presentes no
      // workspace atual. O índice só controla inclusão; não reagrupa os itens.
      const approved = allKws.filter(k => k.status?.toLowerCase() === "aprovado"
        && (approvedIds.has(String(k.id)) || currentWorkspaceByKeywordId.has(String(k.id))));
      approved.forEach(kw => {
        if (items.some(item => String(item.keywordId || item.id) === String(kw.id))) return;
        const current = currentWorkspaceByKeywordId.get(String(kw.id));
        items.push({
          ...(current || {}),
          id: current?.id || kw.id,
          keywordId: kw.id,
          keyword: current?.keyword || kw.keyword,
          volume_search: kw.volume_search || 0,
          intent: kw.intent || "Informativo",
          kgr: kw.kgr_score || kw.kgr || null,
          publishedUrl: current?.publishedUrl || kw.published_url || kw.publishedUrl || kw.url || null,
          canonical: current?.canonical || kw.canonical || kw.canonical_url || null,
          status: "aprovado",
          silo_id: kw.lista_id,
          siloName: siloNameMap[String(kw.lista_id)] || null,
          isPublished: false,
          analise_semantica: kw.analise_semantica || null,
          ...adaptKeywordIdentityContext(kw),
        });
      });

      const renderedIds = new Set(items.map(item => String(item.keywordId || item.id)));
      currentWorkspaceItems.forEach(item => {
        const keywordId = String(item.keywordId || item.id);
        if (!renderedIds.has(keywordId)) {
          items.push(item);
          renderedIds.add(keywordId);
        }
      });
      if (persistedReview) {
        setCustomSlugs(persistedReview.customSlugs);
        setCustomHierarquias(persistedReview.customHierarchies);
        if (persistedReview.annotations.length) addAiReviewAnnotations(persistedReview.annotations);
      }
      reviewRecoveryReady.current.add(selectedBrandId);
      const safeCurrentGroups = (persistedReview?.provisionalGroups || provisionalGroups).flatMap(group => {
        const parsed = ProvisionalArticleGroupSchema.safeParse(group);
        return parsed.success ? [parsed.data] : [];
      });
      setProvisionalGroups(safeCurrentGroups);
      setMasterList(items);

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
      lastLoadedImportSignature.current = [...approvedIds].sort().join("|");

    } catch (err: any) {
      const authError = isSupabaseBrowserAuthError(err);
      console.error("Erro ao carregar o ecossistema no Arquiteto:", {
        code: authError ? err.code : err?.code,
        ...(authError ? err.diagnostic : {}),
        table: "listas_kgr/keywords_kgr/briefings_artigos",
        operation: "select",
        status: err?.status,
        tokenExpired: authError ? isSupabaseTokenExpirationError(err) : false,
        message: authError ? undefined : err?.message,
      });
      setKeywordImportError(
        authError ? getSupabaseSessionErrorMessage(err.code, err.expiresAt) : "Não foi possível atualizar os itens do Minerador.",
      );
      showNotification(
        "error",
        authError ? getSupabaseSessionErrorMessage(err.code, err.expiresAt) : "Erro ao carregar o ecossistema.",
      );
    } finally { setLoadingKeywords(false); }
  };

  useEffect(() => {
    if (sessionStatus !== "authenticated" || !selectedBrandId || lastLoadedImportSignature.current === importedKeywordSignature) return;
    void fetchMasterList(new Set(architectImportedKeywordIds));
    // fetchMasterList is intentionally kept local to this legacy page; the
    // signature is the stable dependency that controls recovery reloads.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [architectImportedKeywordIds, importedKeywordSignature, selectedBrandId, sessionStatus]);

  useEffect(() => {
    if (!selectedBrandId || !reviewRecoveryReady.current.has(selectedBrandId) || !masterList.length) return;
    const timer = window.setTimeout(() => {
      try {
        const recovery = ArchitectReviewRecoverySchema.parse({ schemaVersion: 1, importedKeywordSignature,
          masterList, provisionalGroups, customSlugs, customHierarchies: customHierarquias,
          annotations: aiReviewAnnotations, savedAt: new Date().toISOString() });
        void writeBrowserArtifact(architectReviewRecoveryKey(selectedBrandId), recovery).catch(() => undefined);
      } catch { /* falha local não pode interromper o trabalho editorial */ }
    }, 0);
    return () => window.clearTimeout(timer);
  }, [aiReviewAnnotations, customHierarquias, customSlugs, importedKeywordSignature, masterList, provisionalGroups, selectedBrandId]);

  // ── Handlers
  const handleCreateList = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedBrandId || !activeBrand) { showNotification("error", "Selecione uma marca ativa antes de criar o silo."); return; }
    if (!newListCentralEntity.trim()) { showNotification("error", "Keyword ou entidade central obrigatória."); return; }
    let normalizedSlug: string | null = null;
    let publishedUrl: string | null = null;
    try {
      if (createSiloPage) {
        normalizedSlug = normalizeManualSiloPageSlug(newSiloPageSlug);
        assertManualSiloPageSlugAvailable(normalizedSlug, [
          ...Object.values(acceptedSiloPages).filter(version => version.payload.brandId === selectedBrandId).map(version => version.payload.slug),
          ...masterList.filter(item => item.isPublished && item.slug_sugerido).map(item => String(item.slug_sugerido)),
        ]);
        publishedUrl = newSiloPagePublicationStatus === "published" ? assertManualPublishedSiloPageUrl(newSiloPagePublishedUrl, activeBrand.site_url) : null;
      }
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Identidade da Página do Silo inválida.");
      return;
    }
    if (!newListName.trim()) { showNotification("error", "Nome do silo obrigatório."); return; }
    setSaving(true);
    try {
      const { data: newList, error } = await supabase.from("listas_kgr")
        .insert({ nome: newListName.trim(), marca_id: selectedBrandId })
        .select().single();
      if (error) throw error;
      const siloId = String(newList.id);
      const centralKeyword = masterList.find(item => String(item.keyword || "").trim().toLocaleLowerCase("pt-BR") === newListCentralEntity.trim().toLocaleLowerCase("pt-BR"));
      const siloPayload = deterministicSiloDnaPayload(siloId, newListName.trim(), [], {
        brandId: selectedBrandId,
        centralEntity: newListCentralEntity.trim(),
        ...(centralKeyword?.keywordDnaRef ? { centralKeywordDnaRef: centralKeyword.keywordDnaRef } : {}),
      });
      const siloVersion = await createVersionEnvelope({
        entityId: siloId, versionNumber: 1, previousVersionId: null, origin: "human",
        changeReason: "SiloDNA criado manualmente no Arquiteto.", createdBy: session?.user?.id || "human-reviewer", payload: siloPayload,
      });
      let pageVersion: VersionEnvelope<SiloPage> | null = null;
      if (createSiloPage && normalizedSlug) {
        const pagePayload = deterministicSiloPagePayload(siloVersion, selectedBrandId, normalizedSlug, {
          publicationStatus: newSiloPagePublicationStatus,
          publishedUrl,
          publicationVerification: initialManualSiloPageVerification(newSiloPagePublicationStatus, publishedUrl),
        });
        pageVersion = await createVersionEnvelope({
          entityId: pagePayload.siloPageId, versionNumber: 1, previousVersionId: null, origin: "human",
          changeReason: "SiloPage criada manualmente no Arquiteto.", createdBy: session?.user?.id || "human-reviewer", payload: pagePayload,
        });
      }
      const { data: brandData } = await supabase.from("marcas").select("silos_existentes").eq("id", selectedBrandId).single();
      await supabase.from("marcas").update({
        silos_existentes: [...(brandData?.silos_existentes||[]), { nome: newListName.trim(), slug: toSlug(newListName) }]
      }).eq("id", selectedBrandId);
      setAcceptedSiloDnas(previous => ({ ...previous, [siloVersion.payload.siloId]: siloVersion }));
      addVersionEvents([createStatusEvent(siloVersion.versionId, "proposed", session?.user?.id || "human-reviewer", "SiloDNA manual aguardando revisão humana.")]);
      if (pageVersion) {
        setAcceptedSiloPages(previous => ({ ...previous, [pageVersion!.payload.siloPageId]: pageVersion! }));
        addVersionEvents([createStatusEvent(pageVersion.versionId, "proposed", session?.user?.id || "human-reviewer", "SiloPage manual aguardando revisão humana; publicação/verificação são independentes.")]);
      }
      showNotification("success", pageVersion ? `Silo "${newListName}" e SiloPage criados. Revisão humana pendente.` : `Silo "${newListName}" criado. SiloPage permanece independente.`);
      setNewListName(""); setNewListCentralEntity(""); setCreateSiloPage(false); setNewSiloPageSlug(""); setNewSiloPagePublicationStatus("new"); setNewSiloPagePublishedUrl(""); setIsListModalOpen(false);
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

  const processDeterministicStructure = () => {
    if (!masterList.length) return;
    const source = masterList.map(item => ({ ...item }));
    const taskId = runBackgroundTask<ArchitectBackgroundResult>({
      type: "logical_grouping",
      label: "Processar lógica sem IA",
      execute: async update => {
        update({ message: "Analisando KeywordDNAs e priorizando publicados...", current: 0, total: 1 });
        await new Promise(resolve => window.setTimeout(resolve, 0));
        const groups = buildProvisionalGroups(source);
        const regrouped = groups.flatMap((group, groupIndex) => {
          const principalId = group.principalSuggestion.keywordId;
          const principalKeyword = group.keywords.find(item => item.id === principalId);
          return group.keywords.map(keyword => ({
            ...keyword,
            clusterId: groupIndex + 1,
            provisionalGroupId: group.id,
            siloId: group.suggestedSiloId,
            silo_id: group.suggestedSiloId,
            siloName: group.suggestedSiloName,
            computedSlug: keyword.slug_sugerido || toSlug(principalKeyword?.keyword || keyword.keyword),
            computedHierarquia: keyword.id === principalId
              ? group.suggestedHierarchy
              : group.roles[keyword.id] === "reforco_narrativo" ? "Reforco Narrativo" : "Suporte",
          }));
        });
        update({ message: `${groups.length} artigo(s) organizados, com no máximo 6 keywords cada.`, current: 1, total: 1 });
        return { kind: "logical_grouping", groups, regrouped: regrouped.length ? regrouped : clusterMasterList(source) };
      },
    });
    if (!taskId) showNotification("error", "Não foi possível iniciar a tarefa lógica.");
  };

  const handlePipelineStep = async (label: string) => {
    if (label === "Gerar DNA dos Artigos") return handleGenerateArticleDnas();
    if (label === "Gerar DNA dos Silos") return handleGenerateSiloDnas();
  };

  const selectedStrategicGroups = (): ProvisionalArticleGroup[] => articlesList.filter(article => selectedArticleIds.has(article.id)).map(article => {
    const entityId = article.mainKeywordObj?.provisionalGroupId || article.briefingId;
    const base = provisionalGroups.find(group => group.id === entityId);
    const keywords = masterList.filter(keyword => String(keyword.clusterId) === String(article.clusterId));
    const principalId = article.mainKeywordObj?.id || base?.principalSuggestion.keywordId || keywords[0]?.id;
    if (!base || !principalId || !keywords.length) return null;
    const roles = Object.fromEntries(keywords.map(keyword => [keyword.id,
      keyword.id === principalId ? "principal" : keyword.computedHierarquia === "Reforco Narrativo" ? "reforco_narrativo" : "secundaria"]));
    const principal = keywords.find(keyword => keyword.id === principalId) || keywords[0];
    return { ...base, keywordIds: keywords.map(keyword => keyword.id), keywords, suggestedSiloId: article.siloId ? String(article.siloId) : null,
      suggestedSiloName: article.siloName || null, suggestedHierarchy: article.hierarquia.startsWith("Pilar") ? "Pilar" : article.hierarquia.includes("Reforco") ? "Reforco Narrativo" : "Suporte",
      principalSuggestion: { ...base.principalSuggestion, keywordId: principalId }, roles,
      ...(principal?.architectureStatus || base.architectureStatus ? { architectureStatus: principal?.architectureStatus || base.architectureStatus } : {}),
      ...(principal?.kgrIdentity || base.kgrIdentity ? { kgrIdentity: principal?.kgrIdentity || base.kgrIdentity } : {}),
    } as ProvisionalArticleGroup;
  }).filter((group): group is ProvisionalArticleGroup => Boolean(group));

  const plannedSerpQueriesForGroup = (group: ProvisionalArticleGroup) => {
    const principal = group.keywords.find(keyword => keyword.id === group.principalSuggestion.keywordId);
    const identity = resolveArticleSerpIdentityContext({
      published: Boolean(group.publishedAnchorId), principalKeywordId: group.principalSuggestion.keywordId,
      keywordUrlRelation: principal?.keywordUrlRelation, architectureStatus: group.architectureStatus || principal?.architectureStatus,
      kgrIdentity: group.kgrIdentity || principal?.kgrIdentity, slug: principal?.slug_sugerido,
    });
    return identity.kgrIdentityProtected ? 1 : group.keywords.length;
  };

  const callStrategicApi = async <T,>(path: string, body: unknown): Promise<T> => {
    const response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json();
    if (!response.ok || !payload.success) throw new Error(payload.error || "Falha no servico estrategico.");
    return payload.data as T;
  };

  const activeBrand = brands.find(brand => brand.id === selectedBrandId);
  const brandContext = activeBrand ? {
    id: activeBrand.id,
    name: activeBrand.nome,
    niche: activeBrand.nicho || null,
  } : undefined;
  const articleEntityIdFor = (article: (typeof articlesList)[number]) => article.isPublished
    ? article.mainKeywordObj?.id
    : article.mainKeywordObj?.provisionalGroupId || article.briefingId;
  const articleSerpIdentityFor = (article: (typeof articlesList)[number]) => {
    const articleId = articleEntityIdFor(article);
    const dna = articleId ? acceptedArticleDnas[articleId] : undefined;
    const principalReference = dna?.payload.keywordReferences.find(reference => reference.keywordId === article.mainKeywordObj?.id);
    return resolveArticleSerpIdentityContext({
      published: article.isPublished,
      principalKeywordId: article.mainKeywordObj?.id || dna?.payload.principalKeywordId || "",
      primaryKeywordPolicy: dna?.payload.primaryKeywordPolicy || article.mainKeywordObj?.primaryKeywordPolicy,
      keywordUrlRelation: principalReference?.keywordUrlRelation || article.mainKeywordObj?.keywordUrlRelation,
      architectureStatus: dna?.payload.architectureStatus || article.mainKeywordObj?.architectureStatus,
      kgrIdentity: dna?.payload.kgrIdentity || article.mainKeywordObj?.kgrIdentity,
      slug: dna?.payload.suggestedSlug || article.mainKeywordObj?.computedSlug || article.mainKeywordObj?.slug_sugerido || article.slug,
    });
  };
  const latestSerpAssessmentFor = (articleId: string | null | undefined) => {
    if (!articleId) return undefined;
    return serpAssessments.filter(assessment => assessment.brandId === selectedBrandId && assessment.articleId === articleId).sort((left, right) => right.version - left.version).at(0);
  };
  const serpIndicatorFor = (article: (typeof articlesList)[number]) => {
    const articleId = articleEntityIdFor(article);
    const execution = articleId ? serpExecution[articleId] : undefined;
    if (execution?.status === "processing") return { label: `SERP processando · ${execution.completed} de ${execution.queryCount}`, className: "border-amber-500/40 bg-amber-500/10 text-amber-300" };
    if (execution?.status === "error") return { label: "SERP com erro", className: "border-rose-500/40 bg-rose-500/10 text-rose-300" };
    const assessment = latestSerpAssessmentFor(articleId);
    if (!assessment) return { label: "SERP não analisada", className: "border-slate-700 text-slate-500" };
    const articleVersion = articleId ? acceptedArticleDnas[articleId] : undefined;
    const expectedVersionId = articleVersion?.versionId || `work:${articleId}`;
    if (assessment.articleDnaVersionId !== expectedVersionId) return { label: `SERP desatualizada · v${assessment.version}`, className: "border-orange-500/40 bg-orange-500/10 text-orange-300" };
    if (assessment.conflicts.length) return { label: `SERP com conflito · v${assessment.version}`, className: "border-rose-500/40 bg-rose-500/10 text-rose-300" };
    return { label: `SERP pronta · v${assessment.version}`, className: "border-cyan-500/40 bg-cyan-500/10 text-cyan-300" };
  };
  const handleConfirmArticleArchitecture = async (article: (typeof articlesList)[number], selectedPrincipalKeywordId?: string) => {
    const articleId = articleEntityIdFor(article);
    const current = articleId ? acceptedArticleDnas[articleId] : undefined;
    const principalKeywordId = selectedPrincipalKeywordId || article.mainKeywordObj?.id;
    if (!current || !principalKeywordId) return showNotification("error", "Gere o ArticleDNA e defina uma principal antes de confirmar a arquitetura.");
    try {
      const actorId = session?.user?.id || "human-reviewer";
      const successor = await confirmArticleArchitecture(current, principalKeywordId, actorId);
      setAcceptedArticleDnas(previous => ({ ...previous, [articleId!]: successor }));
      addVersionEvents([createStatusEvent(successor.versionId, "proposed", actorId, "Arquitetura confirmada; aprovação do workflow continua independente.")]);
      showNotification("success", "Arquitetura confirmada em nova versão do ArticleDNA. A próxima SERP usará fortalecimento.");
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível confirmar a arquitetura.");
    }
  };
  const handleEditorialUnitDecision = async (article: (typeof articlesList)[number], decision: { type: EditorialArticleUnitType; landingPagePurpose?: LandingPagePurpose; status?: "human_confirmed" | "conflict" | "unknown" }) => {
    const articleId = articleEntityIdFor(article);
    const current = articleId ? acceptedArticleDnas[articleId] : undefined;
    if (!current) return showNotification("error", "Gere o ArticleDNA antes de classificar o tipo da unidade.");
    try {
      const actorId = session?.user?.id || "human-reviewer";
      const payload = applyHumanEditorialUnitDecision(current.payload, decision, actorId);
      const successor = await createVersionEnvelope({
        entityId: current.payload.articleId, versionNumber: current.versionNumber + 1, previousVersionId: current.versionId,
        origin: "human", changeReason: "Classificação manual do tipo e propósito da unidade editorial.", createdBy: actorId, payload,
      });
      setAcceptedArticleDnas(previous => ({ ...previous, [articleId!]: successor }));
      addVersionEvents([createStatusEvent(successor.versionId, "proposed", actorId, "Classificação humana registrada; aprovação editorial continua independente.")]);
      setSerpAssessments(previous => previous.map(assessment => assessment.articleDnaVersionId === current.versionId ? markSerpAssessmentOutdated(assessment, "Desatualizado por mudança do perfil da unidade editorial.") : assessment));
      showNotification("success", "Perfil da unidade salvo em nova versão do ArticleDNA. A SERP anterior foi preservada no histórico.");
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível salvar o perfil da unidade.");
    }
  };
  const openSerpResult = (article: (typeof articlesList)[number]) => {
    setExpandedIds(current => new Set([...current, article.id]));
    setActiveTabs(current => ({ ...current, [article.id]: "suporte" }));
    window.requestAnimationFrame(() => document.getElementById(`article-row-${article.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" }));
  };
  const publicationUrlFor = (article: (typeof articlesList)[number]) => {
    const dna = articleEntityIdFor(article) ? acceptedArticleDnas[articleEntityIdFor(article)!] : undefined;
    return article.mainKeywordObj?.publishedUrl || article.mainKeywordObj?.url || dna?.payload.publishedIdentityRef?.publishedUrl || null;
  };
  const persistSerpState = async (assessments: SerpFormationAssessment[], verifications = publicationVerifications) => {
    if (!selectedBrandId) throw new Error("Marca ausente para persistir o assessment SERP.");
    const recovery = SerpFormationRecoverySchema.parse({ schemaVersion: 1, brandId: selectedBrandId, updatedAt: new Date().toISOString(), assessments, verifications });
    await writeBrowserArtifact(architectSerpFormationKey(selectedBrandId), recovery);
  };

  const openSerpPreview = () => {
    const groups = selectedStrategicGroups();
    if (!groups.length) {
      showNotification("error", "Selecione ao menos um artigo para validar o agrupamento pela SERP.");
      return;
    }
    setSerpPreview({ groups, queryCount: groups.reduce((total, group) => total + plannedSerpQueriesForGroup(group), 0) });
  };

  const confirmSerpValidation = async () => {
    if (!serpPreview || !brandContext) return;
    const requestedGroups = serpPreview.groups;
    const requestedArticleIds = requestedGroups.map(group => group.publishedAnchorId || group.id);
    setSerpExecution(current => ({ ...current, ...Object.fromEntries(requestedGroups.map(group => [group.publishedAnchorId || group.id, { status: "processing" as const, queryCount: group.keywords.length, completed: 0 }])) }));
    setSerpBusy(true);
    try {
      const previousAssessments = Object.fromEntries(serpPreview.groups.map(group => {
        const articleId = group.publishedAnchorId || group.id;
        const previous = latestSerpAssessmentFor(articleId);
        return previous ? [articleId, { id: previous.id, version: previous.version }] : [];
      }).filter(([key]) => Boolean(key)));
      const articleDnaVersionIds = Object.fromEntries(serpPreview.groups.map(group => {
        const articleId = group.publishedAnchorId || group.id;
        const version = acceptedArticleDnas[articleId];
        return [articleId, version?.versionId || `work:${articleId}`];
      }));
      const result = await callStrategicApi<{ assessments: SerpFormationAssessment[]; queryCount: number }>("/api/arquiteto/serp", {
        brandId: brandContext.id, groups: requestedGroups, location: "Brasil", language: "pt-br", device: "desktop",
        articleDnaVersionIds, previousAssessments,
      });
      const assessments = result.assessments.map(assessment => SerpFormationAssessmentSchema.parse(assessment));
      if (assessments.length !== requestedGroups.length || assessments.some(assessment => {
        const queried = assessedKeywordDnaIds(assessment);
        return assessment.snapshots.length !== queried.length || assessment.recommendations.length !== queried.length || !queried.includes(assessment.snapshots[0]?.keywordId || "");
      })) throw new Error("A SERP retornou análise incompleta: a principal precisa de snapshot e as keywords consultadas precisam de recomendação.");
      const replaced = assessments.reduce((all, assessment) => {
        const previous = latestSerpAssessmentFor(assessment.articleId);
        return [...all.map(item => item.id === previous?.id ? markSerpAssessmentOutdated(item) : item), assessment];
      }, serpAssessments);
      await persistSerpState(replaced);
      setSerpAssessments(replaced);
      setSerpPreview(null);
      setSerpExecution(current => ({ ...current, ...Object.fromEntries(assessments.map(assessment => [assessment.articleId, { status: "ready" as const, queryCount: assessment.queryCount, completed: assessment.queryCount }])) }));
      const focusArticleIds = requestedArticleIds.map(articleId => articlesList.find(article => articleEntityIdFor(article) === articleId)?.id).filter((id): id is string => Boolean(id));
      setExpandedIds(current => new Set([...current, ...focusArticleIds]));
      setActiveTabs(current => ({ ...current, ...Object.fromEntries(focusArticleIds.map(id => [id, "suporte" as const])) }));
      window.setTimeout(() => document.getElementById(focusArticleIds[0] ? `article-row-${focusArticleIds[0]}` : "")?.scrollIntoView({ behavior: "smooth", block: "center" }), 0);
      showNotification("success", `${result.queryCount} de ${result.queryCount} snapshots persistidos. Recomendações disponíveis nas keywords.`);
    } catch (error) {
      setSerpExecution(current => ({ ...current, ...Object.fromEntries(requestedGroups.map(group => [group.publishedAnchorId || group.id, { status: "error" as const, queryCount: group.keywords.length, completed: 0, message: error instanceof Error ? error.message : "Falha na validação SERP." }])) }));
      showNotification("error", error instanceof Error ? error.message : "A validação SERP falhou sem persistir resultado.");
    } finally { setSerpBusy(false); }
  };

  const handleSerpRecommendationDecision = async (article: (typeof articlesList)[number], keywordId: string, status: "followed" | "ignored") => {
    const articleId = articleEntityIdFor(article);
    const assessment = latestSerpAssessmentFor(articleId);
    if (!articleId || !assessment) return showNotification("error", "Nenhum assessment SERP persistido para este artigo.");
    const recommendation = assessment.recommendations.find(item => item.keywordId === keywordId);
    if (!recommendation) return showNotification("error", "Recomendação SERP ausente para esta keyword.");
    let nextKeywords = masterList;
    let changedWorkCopy = false;
    const identityContext = articleSerpIdentityFor(article);
    const proposalOnly = identityContext.principalProtected && keywordId === article.mainKeywordObj?.id;
    if (status === "followed" && !proposalOnly) {
      const applied = applySerpRecommendationToWorkCopy({ keywords: masterList as Array<any>, keywordId, recommendation, principalKeywordId: article.mainKeywordObj?.id || keywordId, published: article.isPublished, principalProtected: identityContext.principalProtected });
      if (applied.blocked) return showNotification("error", applied.reason || "A recomendação está bloqueada para este artigo.");
      nextKeywords = applied.keywords;
      changedWorkCopy = applied.changed;
      if (applied.changed) pushMasterHistory(masterList, `Seguir recomendação SERP de ${article.keywordPrincipal}`);
    }
    const actorId = session?.user?.id || "human-reviewer";
    const nextAssessment = decideSerpRecommendation(assessment, keywordId, status, actorId, acceptedArticleDnas[articleId]?.versionId || `work:${Date.now()}`, status === "ignored" ? "Decisão humana: manter a cópia de trabalho atual." : proposalOnly ? "Proposta de fortalecimento registrada; identidade publicada preservada." : null);
    const nextAssessments = serpAssessments.map(item => item.id === assessment.id ? nextAssessment : item);
    try {
      await persistSerpState(nextAssessments);
      if (status === "followed") setMasterList(nextKeywords);
      setSerpAssessments(nextAssessments);
      showNotification("success", status === "followed" ? proposalOnly ? "Proposta de fortalecimento registrada; a identidade publicada permanece protegida." : changedWorkCopy ? "Recomendação seguida na cópia de trabalho e persistida." : "Recomendação registrada e persistida." : "Recomendação ignorada e persistida.");
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Não foi possível persistir a decisão SERP.");
    }
  };

  const handleVerifyPublication = async (article: (typeof articlesList)[number]) => {
    const url = publicationUrlFor(article);
    const articleId = articleEntityIdFor(article);
    if (!url || !articleId || !selectedBrandId) return showNotification("error", "URL publicada ausente; nenhuma URL será inventada.");
    setVerificationBusy(current => new Set(current).add(article.id));
    try {
      const result = await callStrategicApi<{ verification: SerpPublicationVerification }>("/api/arquiteto/publication/verify", {
        brandId: selectedBrandId, articleId, articleDnaVersionId: acceptedArticleDnas[articleId]?.versionId || null, url, sitemapUrl: null,
      });
      const verification = SerpPublicationVerificationSchema.parse(result.verification);
      const nextVerifications = [...publicationVerifications.filter(item => item.id !== verification.id && item.articleId !== articleId), verification];
      await persistSerpState(serpAssessments, nextVerifications);
      setPublicationVerifications(nextVerifications);
      showNotification("success", `Verificação concluída: ${verification.status}.`);
    } catch (error) {
      showNotification("error", error instanceof Error ? error.message : "Falha ao verificar URL e canonical.");
    } finally { setVerificationBusy(current => { const next = new Set(current); next.delete(article.id); return next; }); }
  };
  const renderSerpRecommendationForKeyword = (article: (typeof articlesList)[number], keywordDnaId: string | undefined, keywordLabel: string) => {
    const articleId = articleEntityIdFor(article);
    if (!articleId || !keywordDnaId) return null;
    const assessment = latestSerpAssessmentFor(articleId);
    if (!assessment) return null;
    if (!assessedKeywordDnaIds(assessment).includes(keywordDnaId)) return <div className="mt-1 rounded border border-slate-800 bg-slate-950/30 p-2 text-[8px] text-slate-500">Não consultada neste perfil de validação ({assessment.validationProfile}); a proveniência da KeywordDNA permanece preservada.</div>;
    const recommendation = findSerpRecommendationForKeyword(assessment, keywordDnaId);
    const rawRecommendation = assessment.recommendations.find(item => item.keywordId === keywordDnaId);
    if (!recommendation) return <div className="mt-1 rounded border border-amber-500/30 bg-amber-500/[.06] p-2 text-[8px] text-amber-300">
      <p className="font-bold">Recomendação SERP não associada</p>
      <p className="mt-0.5 text-amber-200/70">KeywordDNA: {keywordDnaId} · ArticleDNA: {assessment.articleDnaVersionId}{rawRecommendation ? ` · versão da recomendação: ${rawRecommendation.keywordDnaVersionId}` : " · referência ausente"}</p>
    </div>;
    const identityContext = articleSerpIdentityFor(article);
    const publishedPrincipal = identityContext.principalProtected && keywordDnaId === article.mainKeywordObj?.id;
    const blocked = identityContext.principalProtected && isPublishedStructuralRecommendation(recommendation.action, keywordDnaId, article.mainKeywordObj?.id || keywordDnaId);
    const proposalAction = publishedPrincipal || recommendation.action === "revisar_conteudo" || recommendation.action === "sugerir_artigo_suporte";
    const assessmentMode = identityContext.mode;
    const assessmentLabel = serpAssessmentModeLabel(assessmentMode);
    return <div className="mt-1.5 rounded border border-cyan-500/20 bg-cyan-500/[.035] p-2">
      <div className="flex flex-wrap items-center justify-between gap-1.5">
        <span className="text-[8px] font-bold uppercase tracking-wider text-cyan-300">{assessmentLabel} · v{assessment.version}</span>
        <span className="rounded border border-cyan-900/60 px-1.5 py-0.5 text-[7.5px] uppercase tracking-wider text-cyan-400">{recommendation.decision.status}</span>
      </div>
      <p className="mt-1 text-[9px] font-semibold text-slate-200">{recommendation.action === "fortalecer_intencao" ? "Fortalecer intenção" : recommendation.action === "revisar_conteudo" ? "Revisar conteúdo ao redor da principal" : recommendation.action === "sugerir_artigo_suporte" ? "Sugerir artigo complementar" : recommendation.action.replaceAll("_", " ")} · confiança {recommendation.confidence}</p>
      <p className="mt-0.5 text-[8.5px] leading-relaxed text-slate-400">{recommendation.reason}</p>
      <p className="mt-1 text-[7.5px] text-slate-600">Keyword: {keywordLabel} · analisada em {new Date(assessment.createdAt).toLocaleString("pt-BR")}</p>
      {recommendation.conflicts.length > 0 && <div className="mt-1 space-y-0.5">{recommendation.conflicts.map(conflict => <p key={conflict} className="text-[8px] text-rose-300">Conflito: {conflict}</p>)}</div>}
      {recommendation.decision.status === "pending" && <div className="mt-2 flex flex-wrap items-center gap-2">
        {(publishedPrincipal || !blocked) && <button onClick={() => void handleSerpRecommendationDecision(article, recommendation.keywordId, "followed")} className="rounded border border-emerald-900/60 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-emerald-300 hover:border-emerald-700" title={proposalAction ? "Registrar proposta sem alterar a identidade publicada" : "Aplicar somente a esta keyword na cópia de trabalho"}>{proposalAction ? recommendation.action === "sugerir_artigo_suporte" ? "Sugerir artigo complementar" : "Registrar proposta de atualização" : "Seguir recomendação"}</button>}
        <button onClick={() => void handleSerpRecommendationDecision(article, recommendation.keywordId, "ignored")} className="rounded border border-slate-700 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200">Ignorar</button>
      </div>}
      {(blocked || publishedPrincipal) && <p className="mt-1 text-[8px] text-amber-400">Keyword principal protegida: a SERP só pode registrar proposta de fortalecimento ao redor da identidade consolidada.</p>}
    </div>;
  };
  const renderSerpRecommendations = (article: (typeof articlesList)[number]) => {
    const assessment = latestSerpAssessmentFor(articleEntityIdFor(article));
    if (!assessment) return null;
    const unassociated = unassociatedSerpRecommendations(assessment);
    const referenceCount = assessment.keywordDnaReferences.length;
    const queriedCount = assessedKeywordDnaIds(assessment).length;
    const complete = assessment.snapshots.length === queriedCount && assessment.recommendations.length === queriedCount && unassociated.length === 0;
    const articleDna = articleEntityIdFor(article) ? acceptedArticleDnas[articleEntityIdFor(article)!] : undefined;
    const publishedCanonical = article.mainKeywordObj?.canonical || articleDna?.payload.canonical || null;
    const assessmentMode = articleSerpIdentityFor(article).mode;
    return <section className="mb-3 rounded border border-cyan-500/20 bg-cyan-500/[.035] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-2 mb-2">
        <div><p className="text-[8.5px] font-bold uppercase tracking-widest text-cyan-300">{serpAssessmentModeLabel(assessmentMode)}{assessment.evaluationStatus === "outdated" ? " · Desatualizado por correção do avaliador" : ""}</p><p className="mt-1 text-[9px] text-slate-500">Assessment v{assessment.version} · {assessment.intentCompatibility} · competição {assessment.competitionLevel} · {assessment.queryCount} consulta(s) · perfil {assessment.validationProfile} · {new Date(assessment.createdAt).toLocaleString("pt-BR")}</p></div>
        <span className="text-[8px] font-mono text-slate-600">{assessment.contentHash.slice(0, 18)}…</span>
      </div>
      <p className={`text-[9px] ${complete ? "text-emerald-300" : "text-amber-300"}`}>{complete ? "SERP validada: recomendações associadas às keywords consultadas." : "SERP concluída parcialmente: o resultado não foi associado integralmente e exige revisão humana."} Proveniência: {referenceCount} KeywordDNAs (principal incluída) · consultadas: {assessment.snapshots.length}/{queriedCount} · recomendações: {assessment.recommendations.length}/{queriedCount}.</p>
      {assessmentMode === "fortalecimento" && <p className="mt-1 rounded border border-amber-500/25 bg-amber-500/[.04] p-2 text-[8px] text-amber-200/80">Principal protegida: {article.keywordPrincipal} · URL: {publicationUrlFor(article) || "não recebida"} · canonical: {publishedCanonical || "não recebida"}. Oportunidades abaixo fortalecem esta identidade.</p>}
      {assessment.conflicts.length > 0 && <div className="mt-1 space-y-0.5">{assessment.conflicts.map(conflict => <p key={conflict} className="text-[8px] text-rose-300">Conflito do artigo: {conflict}</p>)}</div>}
      {unassociated.length > 0 && <div className="mt-2 rounded border border-amber-500/30 bg-amber-500/[.05] p-2"><p className="text-[8px] font-bold uppercase tracking-wider text-amber-300">Recomendação SERP não associada</p>{unassociated.map(recommendation => <p key={recommendation.id} className="mt-0.5 text-[8px] text-amber-200/80">KeywordDNA: {recommendation.keywordId} · KeywordDNA v{recommendation.keywordDnaVersionId} · ArticleDNA: {assessment.articleDnaVersionId}</p>)}</div>}
    </section>;
  };
  /*
  const renderLegacySerpRecommendations = (article: (typeof articlesList)[number]) => {
    const assessment = latestSerpAssessmentFor(articleEntityIdFor(article));
    if (!assessment) return null;
    return <section className="mb-3 rounded border border-cyan-500/20 bg-cyan-500/[.035] p-3">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/70 pb-2 mb-2">
        <div><p className="text-[8.5px] font-bold uppercase tracking-widest text-cyan-300">Validação SERP de formação</p><p className="mt-1 text-[9px] text-slate-500">Assessment v{assessment.version} · {assessment.intentCompatibility} · competição {assessment.competitionLevel} · {assessment.queryCount} consulta(s)</p></div>
        <span className="text-[8px] font-mono text-slate-600">{assessment.contentHash.slice(0, 18)}…</span>
      </div>
      <div className="grid gap-2 lg:grid-cols-2">
        {assessment.recommendations.map(recommendation => {
          const keyword = [article.mainKeywordObj, ...article.supportKeywords].find(item => item?.id === recommendation.keywordId);
          const blocked = article.isPublished && (recommendation.action === "tornar_principal" || (recommendation.action === "separar_artigo" && recommendation.keywordId === article.mainKeywordObj?.id));
          return <div key={recommendation.id} className="rounded border border-slate-800 bg-[#08090c] p-2.5">
            <div className="flex items-start justify-between gap-2"><span className="text-[10px] font-semibold text-slate-200">{keyword?.keyword || recommendation.keywordId}</span><span className="rounded border border-cyan-900/60 px-1.5 py-0.5 text-[8px] uppercase tracking-wider text-cyan-400">{recommendation.decision.status}</span></div>
            <p className="mt-1 text-[9px] text-slate-400">{recommendation.reason}</p>
            <p className="mt-1 text-[8px] uppercase tracking-wider text-slate-600">Sugestão: {recommendation.action.replaceAll("_", " ")}</p>
            {recommendation.decision.status === "pending" && <div className="mt-2 flex items-center gap-2"><button onClick={() => void handleSerpRecommendationDecision(article, recommendation.keywordId, "followed")} disabled={blocked} className="rounded border border-emerald-900/60 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-emerald-300 hover:border-emerald-700 disabled:cursor-not-allowed disabled:opacity-40" title={blocked ? "Principal publicada protegida" : "Aplicar somente a esta keyword na cópia de trabalho"}>Seguir recomendação</button><button onClick={() => void handleSerpRecommendationDecision(article, recommendation.keywordId, "ignored")} className="rounded border border-slate-700 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-slate-400 hover:text-slate-200">Ignorar</button></div>}
            {blocked && <p className="mt-1 text-[8px] text-amber-400">Aplicação direta bloqueada: identidade publicada protegida.</p>}
          </div>;
        })}
      </div>
    </section>;
  };
  */
  const deterministicConflicts = useMemo(
    () => detectArchitectureConflicts(provisionalGroups),
    [provisionalGroups],
  );

  const handleRevalidateStructure = () => {
    const groups = selectedStrategicGroups();
    if (!groups.length) {
      showNotification("error", "Selecione os artigos cujas keywords devem ser revisadas pela IA.");
      return;
    }
    const currentGroups = describeAssignedGroups(masterList);
    const batches = buildKeywordReviewBatches(groups);
    const taskId = runBackgroundTask<ArchitectBackgroundResult>({
      type: "keyword_review",
      label: "Revisar repartição das keywords com IA",
      execute: async update => {
        const reviews: KeywordArticleReview[] = [];
        for (let index = 0; index < batches.length; index += 1) {
          update({ message: `Revisando lote ${index + 1} de ${batches.length} sem gerar DNA...`, current: index, total: batches.length });
          reviews.push(await callStrategicApi<KeywordArticleReview>("/api/revalidate-structure", {
            focusGroups: batches[index],
            articleCatalog: buildRelevantArticleCatalog(currentGroups, batches[index]),
            logicalRecommendations: buildLogicalKeywordRecommendations(currentGroups, batches[index]),
            brand: brandContext,
          }));
        }
        update({ message: "Repartição revisada; aguardando decisão humana.", current: batches.length, total: batches.length });
        return { kind: "keyword_review", review: mergeKeywordArticleReviews(reviews), batchCount: batches.length };
      },
    });
    if (!taskId) showNotification("error", "Não foi possível iniciar a revisão das keywords.");
  };

  const handleGenerateArticleDnas = () => {
    const groups = selectedStrategicGroups();
    if (!groups.length) {
      showNotification("error", "Selecione ao menos um artigo para gerar DNA.");
      return;
    }
    const taskId = runBackgroundTask<ArchitectBackgroundResult>({
      type: "article_dna",
      label: "Gerar ArticleDNA artigo por artigo",
      execute: async update => {
        const versions: VersionEnvelope<ArticleDNA>[] = [];
        const events: VersionStatusEvent[] = [];
        for (let index = 0; index < groups.length; index += 1) {
          update({ message: `Gerando ArticleDNA ${index + 1} de ${groups.length}...`, current: index, total: groups.length });
          const batch = await callStrategicApi<{ versions: VersionEnvelope<ArticleDNA>[]; events: VersionStatusEvent[] }>("/api/arquiteto/article-dna", {
            groups: [groups[index]], brand: brandContext,
          });
          if (batch.versions.length !== 1 || batch.events.length < 1) {
            throw new Error(`O artigo ${index + 1} nao retornou um ArticleDNA completo. Nada foi aplicado.`);
          }
          versions.push(...batch.versions); events.push(...batch.events);
        }
        if (versions.length !== groups.length) {
          throw new Error(`A IA concluiu ${versions.length} de ${groups.length} ArticleDNAs. Nada foi aplicado.`);
        }
        update({ message: "ArticleDNAs disponíveis na planilha para pente-fino.", current: groups.length, total: groups.length });
        return { kind: "article_dna", versions, events };
      },
    });
    if (!taskId) showNotification("error", "Não foi possível iniciar a geração de ArticleDNA.");
  };

  const handleGenerateSiloDnas = () => {
    const groups = selectedStrategicGroups();
    if (!groups.length) {
      showNotification("error", "Selecione artigos dos silos que deseja analisar.");
      return;
    }
    const siloMap = new Map<string, { id: string; name: string; articleVersions: VersionEnvelope<ArticleDNA>[] }>();
    for (const group of groups) {
      if (!group.suggestedSiloId) continue;
      const articleVersion = acceptedArticleDnas[group.publishedAnchorId || group.id];
      if (!articleVersion || effectiveVersionStatus(articleVersion.versionId, versionEvents) !== "approved") continue;
      const id = String(group.suggestedSiloId);
      const current = siloMap.get(id) || { id, name: group.suggestedSiloName || "Silo", articleVersions: [] };
      current.articleVersions.push(articleVersion);
      siloMap.set(id, current);
    }
    if (!siloMap.size) {
      showNotification("error", "Aceite primeiro o ArticleDNA dos artigos selecionados e confirme o silo.");
      return;
    }
    const silos = [...siloMap.values()];
    const taskId = runBackgroundTask<ArchitectBackgroundResult>({
      type: "silo_dna",
      label: "Gerar SiloDNA silo por silo",
      execute: async update => {
        const versions: VersionEnvelope<SiloDNA>[] = [];
        const events: VersionStatusEvent[] = [];
        for (let index = 0; index < silos.length; index += 1) {
          update({ message: `Gerando SiloDNA ${index + 1} de ${silos.length}...`, current: index, total: silos.length });
          const batch = await callStrategicApi<{ versions: VersionEnvelope<SiloDNA>[]; events: VersionStatusEvent[] }>("/api/arquiteto/silo-dna", {
            silos: [silos[index]], brand: brandContext,
          });
          if (batch.versions.length !== 1 || batch.events.length < 1) {
            throw new Error(`O silo ${index + 1} nao retornou um SiloDNA completo. Nada foi aplicado.`);
          }
          versions.push(...batch.versions); events.push(...batch.events);
        }
        update({ message: "SiloDNAs disponíveis na planilha para pente-fino.", current: silos.length, total: silos.length });
        return { kind: "silo_dna", versions, events };
      },
    });
    if (!taskId) showNotification("error", "Não foi possível iniciar a geração de SiloDNA.");
  };

  const siloPageStatus = useCallback((siloId: string | null): string => {
    if (!siloId) return "none";
    const entityId = `silo-page:${siloId}`;
    const pageVersion = acceptedSiloPages[entityId];
    if (!pageVersion) return "pending";
    const versionStatus = effectiveVersionStatus(pageVersion.versionId, versionEvents);
    if (radarItems.some(item => item.articleId === entityId)) return "sent_radar";
    if (versionStatus === "approved") return "approved";
    if (versionStatus === "proposed") return "awaiting_approval";
    return "pending";
  }, [acceptedSiloPages, versionEvents, radarItems]);

  const handleGenerateSiloPageForSilo = async (siloId: string, siloName: string) => {
    const actorId = session?.user?.id || "human-reviewer";
    const siloDnaVersion = acceptedSiloDnas[siloId];
    if (!siloDnaVersion) { showNotification("error", "Gere o SiloDNA deste silo primeiro."); return; }
    const entityId = `silo-page:${siloId}`;
    const current = acceptedSiloPages[entityId];
    const currentStatus = current ? effectiveVersionStatus(current.versionId, versionEvents) : null;
    if (current && currentStatus !== "rejected" && currentStatus !== "superseded") {
      showNotification("error", "Este silo já possui uma Página do Silo.");
      return;
    }
    const slug = siloName.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
    const payload = deterministicSiloPagePayload(siloDnaVersion, selectedBrandId, slug);
    const version = await createVersionEnvelope({ entityId, versionNumber: (current?.versionNumber || 0) + 1,
      previousVersionId: current?.versionId || null, origin: "system", changeReason: "Página do Silo criada pela lógica determinística.", createdBy: actorId, payload });
    setAcceptedSiloPages(previous => ({ ...previous, [entityId]: version }));
    addVersionEvents([createStatusEvent(version.versionId, "proposed", actorId, "Página do Silo pronta para revisão humana.")]);
    showNotification("success", "Página do Silo gerada. Status: Aguardando aprovação.");
  };

  const handleVerifySiloPage = async (pageVersion: VersionEnvelope<SiloPage>) => {
    if (pageVersion.payload.publicationStatus !== "published" || !pageVersion.payload.publishedUrl) { showNotification("error", "A conferência exige uma SiloPage publicada com URL registrada."); return; }
    setVerifyingSiloPageId(pageVersion.payload.siloPageId);
    try {
      const response = await fetch("/api/arquiteto/publication/verify", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({
        brandId: selectedBrandId, entityType: "silo_page", siloPageId: pageVersion.payload.siloPageId, siloPageVersionId: pageVersion.versionId, url: pageVersion.payload.publishedUrl, sitemapUrl: null,
      }) });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.success) throw new Error(body.error || "Não foi possível conferir a SiloPage.");
      const raw = body.data?.verification as Record<string, unknown>;
      const status = raw.status === "verified" && raw.declaredCanonical && raw.resolvedUrl && raw.declaredCanonical === raw.resolvedUrl ? "canonical_confirmed" : raw.status === "verified" ? "accessible" : raw.status === "sitemap_match" ? "sitemap_match" : raw.status === "canonical_mismatch" ? "canonical_mismatch" : raw.status === "not_in_sitemap" ? "not_in_sitemap" : raw.status === "unreachable" ? "unreachable" : "error";
      const verification = {
        status, checkedAt: typeof raw.checkedAt === "string" ? raw.checkedAt : new Date().toISOString(), requestedUrl: typeof raw.requestedUrl === "string" ? raw.requestedUrl : pageVersion.payload.publishedUrl,
        resolvedUrl: typeof raw.resolvedUrl === "string" ? raw.resolvedUrl : null, declaredCanonical: typeof raw.declaredCanonical === "string" ? raw.declaredCanonical : null,
        httpStatus: typeof raw.httpStatus === "number" ? raw.httpStatus : null, sitemapUrl: typeof raw.sitemapUrl === "string" ? raw.sitemapUrl : null,
        sitemapMatch: typeof raw.sitemapMatch === "boolean" ? raw.sitemapMatch : null, message: typeof raw.message === "string" ? raw.message : null,
      } as const;
      const successorPayload = SiloPageSchema.parse({ ...pageVersion.payload, publicationVerification: verification });
      const successor = await createVersionEnvelope({ entityId: successorPayload.siloPageId, versionNumber: pageVersion.versionNumber + 1, previousVersionId: pageVersion.versionId, origin: "system", changeReason: "Evidência explícita de verificação da identidade da SiloPage.", createdBy: session?.user?.id || "human-reviewer", payload: successorPayload });
      setAcceptedSiloPages(previous => ({ ...previous, [successorPayload.siloPageId]: successor }));
      addVersionEvents([createStatusEvent(successor.versionId, "proposed", session?.user?.id || "human-reviewer", "Verificação registrada; revisão humana continua independente da publicação.")]);
      showNotification("success", `Verificação registrada: ${verification.status}. URL, slug e canonical foram preservados.`);
    } catch (error) { showNotification("error", error instanceof Error ? error.message : "Falha na verificação da SiloPage."); }
    finally { setVerifyingSiloPageId(null); }
  };

  const handleGenerateSiloPageWithIA = (siloId: string, siloName: string) => {
    const siloDnaVersion = acceptedSiloDnas[siloId];
    if (!siloDnaVersion) { showNotification("error", "Gere o SiloDNA deste silo primeiro."); return; }
    const taskId = runBackgroundTask<ArchitectBackgroundResult>({
      type: "silo_page",
      label: "Detectar viés · Página do Silo (IA)",
      execute: async update => {
        update({ message: "Gerando Página do Silo com IA...", current: 0, total: 1 });
        const batch = await callStrategicApi<{ versions: VersionEnvelope<SiloPage>[]; events: VersionStatusEvent[] }>("/api/arquiteto/silo-page", {
          siloId, siloName, siloDnaVersion, brand: brandContext,
        });
        if (batch.versions.length !== 1 || batch.events.length < 1) {
          throw new Error("A IA não retornou uma Página do Silo completa.");
        }
        update({ message: "Página do Silo gerada. Revise na planilha.", current: 1, total: 1 });
        return { kind: "silo_page", versions: batch.versions, events: batch.events };
      },
    });
    if (!taskId) showNotification("error", "Não foi possível iniciar a geração da Página do Silo.");
  };

  const handleGenerateSelectedSiloPagesWithIA = () => {
    for (const pageEntityId of selectedSiloPageIds) {
      const siloId = pageEntityId.replace('silo-page:', '');
      const siloGroup = groupedArticles.find(g => String(g.siloId) === siloId);
      const siloName = siloGroup?.siloName || siloId;
      handleGenerateSiloPageWithIA(siloId, siloName);
    }
  };

  const toggleSiloPageSelection = (pageEntityId: string) => {
    setSelectedSiloPageIds(prev => {
      const next = new Set(prev);
      if (next.has(pageEntityId)) next.delete(pageEntityId); else next.add(pageEntityId);
      return next;
    });
  };

  const toggleSiloExpand = (siloId: string) => {
    setExpandedSiloIds(prev => {
      const next = new Set(prev);
      if (next.has(siloId)) next.delete(siloId); else next.add(siloId);
      return next;
    });
  };

  const sendSelectedToRadar = () => {
    let articlesSent = 0, pagesSent = 0, skipped = 0;
    if (selectedArticleIds.size > 0) {
      const articleIds = articlesList.filter(article => selectedArticleIds.has(article.id))
        .map(article => article.isPublished
          ? article.mainKeywordObj?.id
          : article.mainKeywordObj?.provisionalGroupId || article.briefingId)
        .filter((id): id is string => Boolean(id) && Boolean(acceptedArticleDnas[id]));
      if (articleIds.length) {
        const serpByArticle = Object.fromEntries(articleIds.map(articleId => {
          const assessment = latestSerpAssessmentFor(articleId);
          return assessment ? [articleId, assessment] : [];
        }).filter(([key]) => Boolean(key))) as Record<string, SerpFormationAssessment>;
        const result = importApprovedToRadar(articleIds, masterList as Array<Record<string, unknown>>, serpByArticle);
        articlesSent = result.imported; skipped += result.skipped;
      }
    }
    if (selectedSiloPageIds.size > 0) {
      const siloPageIds = [...selectedSiloPageIds].filter(id => {
        const pv = acceptedSiloPages[id];
        return pv && effectiveVersionStatus(pv.versionId, versionEvents) === 'approved';
      });
      if (siloPageIds.length) {
        const result = importApprovedSiloPagesToRadar(siloPageIds);
        pagesSent = result.imported; skipped += result.skipped;
      }
    }
    const parts: string[] = [];
    if (articlesSent) parts.push(`${articlesSent} artigo(s)`);
    if (pagesSent) parts.push(`${pagesSent} página(s) do silo`);
    if (skipped) parts.push(`${skipped} já existente(s)`);
    showNotification(articlesSent || pagesSent ? 'success' : 'error', parts.length ? parts.join(', ') + ' enviada(s) ao Radar.' : 'Nenhum item aprovado selecionado.');
  };

  useEffect(() => {
    if (loading) return;
    const task = architectTasks.find(candidate => candidate.status === "completed" && !candidate.consumed && candidate.result);
    if (!task) return;
    const result = task.result as ArchitectBackgroundResult;
    if (result.kind === "logical_grouping") {
      pushMasterHistory(masterListRef.current, "Processar l├│gica sem IA e agrupar keywords em artigos");
      setProvisionalGroups(result.groups);
      setMasterList(result.regrouped);
      showNotification("success", `${result.groups.length} artigo(s) organizados pela l├│gica sem IA, com no m├íximo 6 keywords cada. Tarefa terminada.`);
    } else if (result.kind === "keyword_review") {
      const currentMasterList = masterListRef.current;
      masterHistory.capture("Revis├úo da reparti├º├úo de keywords pela IA", { masterList: currentMasterList, customSlugs, customHierarquias, articleVersions: acceptedArticleDnas, siloVersions: acceptedSiloDnas, siloPageVersions: acceptedSiloPages, versionEvents, aiReviewAnnotations });
      const next = applyKeywordArticleReview(currentMasterList, result.review);
      const nextAnnotations = next.map(keyword => keyword.aiReviewAnnotation)
        .filter((annotation): annotation is AIReviewAnnotation => Boolean(annotation));
      setMasterList(next);
      setProvisionalGroups(describeAssignedGroups(next));
      addAiReviewAnnotations(nextAnnotations);
      try {
        const annotations = [...new Map([...aiReviewAnnotations, ...nextAnnotations].map(annotation => [annotation.id, annotation])).values()];
        const recovery = ArchitectReviewRecoverySchema.parse({ schemaVersion: 1, importedKeywordSignature,
          masterList: next, provisionalGroups: describeAssignedGroups(next), customSlugs, customHierarchies: customHierarquias,
          annotations, savedAt: new Date().toISOString() });
        void writeBrowserArtifact(architectReviewRecoveryKey(selectedBrandId), recovery)
          .then(() => showNotification("success", `${result.review.decisions.length} keyword(s) revisadas em ${result.batchCount} lote(s) e salvas. Confira as marca├º├Áes da IA.`))
          .catch(() => showNotification("error", "A Revis├úo IA foi aplicada, mas o navegador recusou o salvamento dur├ível."));
      } catch { showNotification("error", "A Revis├úo IA retornou dados que n├úo puderam ser preparados para salvamento."); }
    } else if (result.kind === "article_dna") {
      if (!result.versions.length || !result.events.length) {
        showNotification("error", "A tarefa terminou sem produzir ArticleDNA. Nenhum status foi alterado; execute novamente.");
        consumeBackgroundTask(task.id);
        return;
      }
      const nextVersions = { ...acceptedArticleDnas, ...Object.fromEntries(result.versions.map(item => [item.payload.articleId, item])) };
      const nextEvents = [...versionEvents, ...result.events];
      setAcceptedArticleDnas(nextVersions);
      addVersionEvents(result.events);
      try {
        const versionIds = new Set(Object.values(nextVersions).map(version => version.versionId));
        const recovery = ArchitectArticleDnaRecoverySchema.parse({ schemaVersion: 1, versions: nextVersions,
          events: nextEvents.filter(event => versionIds.has(event.versionId)), savedAt: new Date().toISOString() });
        void writeBrowserArtifact(architectArticleDnaRecoveryKey(selectedBrandId), recovery)
          .then(() => showNotification("success", `${result.versions.length} ArticleDNA(s) aplicados e salvos. O status agora aguarda aprova├º├úo.`))
          .catch(() => showNotification("error", "O ArticleDNA foi aplicado, mas o navegador recusou o salvamento dur├ível."));
      } catch (error) { console.error("[arquiteto] ArticleDNA", error); showNotification("error", "O ArticleDNA retornado n├úo p├┤de ser validado para salvamento."); }
    } else if (result.kind === "silo_dna") {
      if (!result.versions.length || !result.events.length) {
        showNotification("error", "A tarefa terminou sem produzir SiloDNA. Nenhum resultado foi aplicado.");
        consumeBackgroundTask(task.id);
        return;
      }
      const nextVersions = { ...acceptedSiloDnas, ...Object.fromEntries(result.versions.map(item => [item.payload.siloId, item])) };
      const nextEvents = [...versionEvents, ...result.events];
      setAcceptedSiloDnas(nextVersions);
      addVersionEvents(result.events);
      try {
        const versionIds = new Set(Object.values(nextVersions).map(version => version.versionId));
        const recovery = ArchitectSiloDnaRecoverySchema.parse({ schemaVersion: 1, versions: nextVersions,
          events: nextEvents.filter(event => versionIds.has(event.versionId)), savedAt: new Date().toISOString() });
        void writeBrowserArtifact(architectSiloDnaRecoveryKey(selectedBrandId), recovery)
          .then(() => showNotification("success", `${result.versions.length} SiloDNA(s) aplicados e salvos. Revise os resumos na planilha.`))
          .catch(() => showNotification("error", "O SiloDNA foi aplicado, mas o navegador recusou o salvamento dur├ível."));
      } catch (error) { console.error("[arquiteto] SiloDNA", error); showNotification("error", "O SiloDNA retornado n├úo p├┤de ser validado para salvamento."); }
    } else if (result.kind === "silo_page") {
      if (!result.versions.length || !result.events.length) {
        showNotification("error", "A tarefa terminou sem produzir Pagina do Silo.");
        consumeBackgroundTask(task.id);
        return;
      }
      const nextVersions = { ...acceptedSiloPages, ...Object.fromEntries(result.versions.map(item => [item.payload.siloPageId, item])) };
      setAcceptedSiloPages(nextVersions);
      addVersionEvents(result.events);
      showNotification("success", `${result.versions.length} Pagina(s) do Silo gerada(s) com IA.`);
    }
    consumeBackgroundTask(task.id);
  }, [architectTasks, loading, consumeBackgroundTask, setAcceptedArticleDnas, setAcceptedSiloDnas, setAcceptedSiloPages, addVersionEvents, addAiReviewAnnotations, masterHistory.capture]);

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
    setSelectedArticleIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleSiloArticleSelection = (articleIds: string[]) => {
    setSelectedArticleIds(prev => {
      const next = new Set(prev);
      const allSelected = articleIds.length > 0 && articleIds.every(id => next.has(id));
      articleIds.forEach(id => {
        if (allSelected) next.delete(id);
        else next.add(id);
      });
      return next;
    });
  };

  const updateClusterSilo = (clusterId: string, siloId: any, siloName: string | null) => {
    pushMasterHistory(masterList, `Mover artigo para ${siloName || "Sem Grupo"}`);
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
    setPendingDangerAction({ type: "remove-silo", clusterIds: group.articles.map(art => String(art.clusterId)),
      articleIds: group.articles.map(art => String(art.id)), siloName: group.articles[0]?.siloName || "Silo sem nome" });
  };

  const handleDetachSupportKeyword = (keyword: any) => {
    const nextClusterId = `manual-${keyword.id}-${Date.now()}`;
    pushMasterHistory(masterList, `Separar a keyword ${keyword.keyword} do artigo`);
    setMasterList(prev => prev.map(kw =>
      kw.id === keyword.id
        ? { ...kw, clusterId: nextClusterId }
        : kw
    ));
    showNotification("success", "Keyword secundaria removida do artigo sem apagar o registro.");
  };

  const markAiReviewChecked = (article: AiReviewArticle) => {
    const articleKeywords = article.mainKeywordObj
      ? [article.mainKeywordObj, ...article.supportKeywords]
      : article.supportKeywords;
    const keywordIds = new Set(articleKeywords.map(keyword => keyword.id));
    setMasterList(previous => previous.map(keyword => keywordIds.has(keyword.id) && keyword.aiReviewAnnotation
      ? { ...keyword, aiReviewAnnotation: { ...keyword.aiReviewAnnotation, reviewState: "reviewed" } }
      : keyword));
    const reviewedAnnotations: AIReviewAnnotation[] = articleKeywords.flatMap(keyword => keyword.aiReviewAnnotation
      ? [{ ...keyword.aiReviewAnnotation, reviewState: "reviewed" as const }]
      : []);
    addAiReviewAnnotations(reviewedAnnotations);
    showNotification("success", "Anotações da IA marcadas como revisadas. O status do artigo continua separado.");
  };

  const articlesList = useMemo(() => {
    const clustersMap = new Map<string, {
      clusterId: string;
      siloId: any;
      siloName: string;
      isPublished: boolean;
      mainKeyword: any;
      supportKeywords: any[];
    }>();

    masterList.filter(kw => kw.clusterId !== null && kw.clusterId !== undefined && kw.clusterId !== "" && kw.clusterId !== 0).forEach(kw => {
      const cid = String(kw.clusterId);
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
      const aiReviewAnnotations: AIReviewAnnotation[] = [main, ...c.supportKeywords]
        .map(keyword => keyword?.aiReviewAnnotation)
        .filter((annotation): annotation is AIReviewAnnotation => Boolean(annotation));
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
        aiReviewAnnotations,
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

  const articleWorkflowStatus = useCallback((art: (typeof articlesList)[number]) => {
    if (art.isPublished) return "published";
    const articleEntityId = art.mainKeywordObj?.provisionalGroupId || art.briefingId;
    if (articleEntityId && radarItems.some(item => item.articleId === articleEntityId)) return "sent_radar";
    const articleVersion = articleEntityId ? acceptedArticleDnas[articleEntityId] : undefined;
    const versionStatus = articleVersion ? effectiveVersionStatus(articleVersion.versionId, versionEvents) : null;
    if (versionStatus === "approved") return "approved";
    if (articleVersion && versionStatus !== "rejected" && versionStatus !== "superseded") return "awaiting_approval";
    return "draft";
  }, [acceptedArticleDnas, versionEvents, radarItems]);

  const articleApprovalStatus = useCallback((art: (typeof articlesList)[number]) => {
    const articleEntityId = articleEntityIdFor(art);
    const assessment = latestSerpAssessmentFor(articleEntityId);
    if (assessment?.conflicts.length) return "conflicts";
    const articleVersion = articleEntityId ? acceptedArticleDnas[articleEntityId] : undefined;
    if (!articleVersion) return "draft";
    const versionStatus = effectiveVersionStatus(articleVersion.versionId, versionEvents);
    if (versionStatus === "approved") return "approved";
    if (versionStatus === "rejected" || versionStatus === "superseded") return "draft";
    return "awaiting_approval";
  }, [acceptedArticleDnas, serpAssessments, versionEvents]);

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
      if (filterStatus !== "Todos" && articleWorkflowStatus(art) !== filterStatus) return false;
      return true;
    });
  }, [articlesList, searchQuery, filterHierarquia, filterStatus, articleWorkflowStatus]);

  const ungroupedKeywords = useMemo(
    () => masterList.filter(keyword => keyword.clusterId === null || keyword.clusterId === undefined || keyword.clusterId === "" || keyword.clusterId === 0),
    [masterList],
  );

  const createRecoveryInput = (browserStorage: Awaited<ReturnType<typeof readBrowserStorageSnapshot>>, sources: ArchitectDatabaseSources) => {
    if (!selectedBrandId) throw new Error("Selecione uma marca antes de auditar o workspace.");
    return {
      brandId: selectedBrandId,
      masterKeywords: sources.keywords,
      importedKeywordIds: architectImportedKeywordIds,
      currentMasterList: masterList,
      currentArticles: articlesList,
      provisionalGroups,
      articleDnas: acceptedArticleDnas,
      siloDnas: acceptedSiloDnas,
      siloPages: acceptedSiloPages,
      versionEvents,
      radarItems,
      plannerItems,
      documents,
      operationalPublications,
      historyEntries: masterHistory.entries,
      localStorage: browserStorage.localStorage,
      indexedDb: browserStorage.indexedDb,
      renderedItems: filteredArticles,
    };
  };

  const downloadRecoveryJson = (snapshot: ArchitectRecoverySnapshot) => {
    const serialized = JSON.stringify(snapshot, null, 2);
    const validated = ArchitectRecoverySnapshotSchema.parse(JSON.parse(serialized));
    const blob = new Blob([JSON.stringify(validated, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    anchor.href = url;
    anchor.download = `ArchitectRecoverySnapshot-${selectedBrandId || "sem-marca"}-${stamp}.json`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
    return validated;
  };

  const exportRecoverySnapshot = async () => {
    if (!selectedBrandId || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      const [sources, browserStorage] = await Promise.all([readArchitectDatabaseSources(), readBrowserStorageSnapshot()]);
      if (browserStorage.errors.length) throw new Error(`Snapshot incompleto: ${browserStorage.errors.join(" ")}`);
      setDatabaseSources(sources);
      const auditInput = createRecoveryInput(browserStorage, sources);
      const audit = auditArchitectWorkspace(auditInput);
      const snapshot = createArchitectRecoverySnapshot({
        auditInput,
        database: { brandId: selectedBrandId, capturedAt: sources.capturedAt, silos: sources.silos, keywords: sources.keywords, briefings: sources.briefings },
        workspace: {
          brandId: selectedBrandId,
          currentArticles: articlesList,
          currentNewArticles: articlesList.filter(article => !article.isPublished),
          currentPublishedArticles: articlesList.filter(article => article.isPublished),
          currentMasterList: masterList,
          ungroupedKeywords,
          provisionalGroups,
          keywordArticleReferences: articlesList.map(article => ({ articleId: article.id, keywordIds: [article.mainKeywordObj?.id, ...article.supportKeywords.map((keyword: any) => keyword.id)].filter(Boolean), roles: Object.fromEntries([[article.mainKeywordObj?.id, "principal"], ...article.supportKeywords.map((keyword: any) => [keyword.id, "secundaria"])]) })),
          architectImportedKeywordIds,
          articleDnas: acceptedArticleDnas,
          siloDnas: acceptedSiloDnas,
          siloPages: acceptedSiloPages,
          versionEvents,
          radarItems,
          plannerItems,
          documents,
          operationalPublications,
          historyEntries: masterHistory.entries,
          backgroundTasks: architectTasks.map(task => ({ id: task.id, type: task.type, status: task.status, message: task.message, current: task.current, total: task.total, startedAt: task.startedAt, finishedAt: task.finishedAt, consumed: task.consumed, error: task.error })),
        },
        browser: { capturedAt: browserStorage.capturedAt, indexedDbAvailable: browserStorage.indexedDbAvailable, errors: browserStorage.errors, localStorage: browserStorage.localStorage, indexedDb: browserStorage.indexedDb },
      });
      const validated = downloadRecoveryJson(snapshot);
      setRecoverySnapshot(validated);
      setRecoveryAudit(audit);
      setRecoveryPlan(null);
      showNotification("success", "Snapshot ArchitectRecoverySnapshot criado e validado. A recuperação está liberada para auditoria.");
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível criar o snapshot.";
      setRecoveryError(message);
      showNotification("error", message);
    } finally {
      setRecoveryBusy(false);
    }
  };

  const auditRecoverySources = async () => {
    if (!recoverySnapshot || !selectedBrandId || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      const [sources, browserStorage] = await Promise.all([readArchitectDatabaseSources(), readBrowserStorageSnapshot()]);
      if (browserStorage.errors.length) throw new Error(`Auditoria incompleta: ${browserStorage.errors.join(" ")}`);
      setDatabaseSources(sources);
      const input = createRecoveryInput(browserStorage, sources);
      const audit = auditArchitectWorkspace(input);
      const plan = buildArchitectRecoveryPlan(input);
      setRecoveryAudit(audit);
      setRecoveryPlan(plan);
      showNotification("success", `Auditoria concluída: ${audit.counts.recoverableNewArticles} artigo(s) novo(s) recuperável(is) e ${audit.counts.orphanKeywordsRecoverable} keyword(s) órfã(s).`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível auditar as fontes.";
      setRecoveryError(message);
      showNotification("error", message);
    } finally {
      setRecoveryBusy(false);
    }
  };

  const applySafeRecovery = async () => {
    if (!recoverySnapshot || !recoveryPlan || !selectedBrandId || recoveryBusy) return;
    setRecoveryBusy(true);
    setRecoveryError(null);
    try {
      pushMasterHistory(masterList, "Antes da recuperação segura do workspace");
      const sourceById = new Map(databaseSources.keywords.map(keyword => [String(keyword.id), keyword]));
      const siloNameMap = Object.fromEntries(databaseSources.silos.map(silo => [String(silo.id), silo.nome]));
      const currentByKeywordId = new Map(masterList.map(item => [String(item.keywordId || item.id), item]));
      const recoveredKeywordIds = new Set(recoveryPlan.recoveredMasterList.map(recovered => String(recovered.id)));
      const recoveredMasterItems = recoveryPlan.recoveredMasterList.map(recovered => {
        const keywordId = String(recovered.id);
        const source = sourceById.get(keywordId) || {};
        const current = currentByKeywordId.get(keywordId);
        const published = Boolean(current?.isPublished) || String(source.status || "").toLowerCase() === "publicado";
        const base = current || {
          id: keywordId,
          keywordId,
          keyword: source.keyword || keywordId,
          volume_search: source.volume_search || 0,
          intent: source.intent || "Informativo",
          kgr: source.kgr_score || source.kgr || null,
          analise_semantica: source.analise_semantica || null,
        };
        if (published) {
          const publishedClusterId = current?.clusterId ?? base.clusterId ?? `pub-k-${keywordId}`;
          const publishedSiloId = current?.siloId ?? current?.silo_id ?? base.siloId ?? base.silo_id ?? source.lista_id ?? null;
          return {
            ...base,
            keywordId: base.keywordId || keywordId,
            status: "publicado",
            isPublished: true,
            clusterId: publishedClusterId,
            provisionalGroupId: current?.provisionalGroupId ?? base.provisionalGroupId ?? publishedClusterId,
            siloId: publishedSiloId,
            silo_id: current?.silo_id ?? base.silo_id ?? publishedSiloId,
            siloName: current?.siloName ?? base.siloName ?? siloNameMap[String(source.lista_id)] ?? null,
            computedSlug: current?.computedSlug ?? current?.slug_sugerido ?? base.computedSlug ?? base.slug_sugerido ?? source.slug_sugerido ?? toSlug(String(source.keyword || keywordId)),
            computedHierarquia: current?.computedHierarquia ?? current?.hierarquia ?? base.computedHierarquia ?? base.hierarquia ?? source.hierarquia ?? "Pilar",
          };
        }
        return {
          ...base,
          keywordId: base.keywordId || keywordId,
          keyword: base.keyword || source.keyword || keywordId,
          status: source.status || "aprovado",
          isPublished: false,
          clusterId: recovered.clusterId ?? null,
          provisionalGroupId: recovered.provisionalGroupId ?? null,
          siloId: recovered.siloId ?? null,
          silo_id: recovered.silo_id ?? null,
          siloName: recovered.siloName ?? null,
          computedSlug: recovered.computedSlug ?? current?.computedSlug ?? source.slug_sugerido ?? toSlug(String(source.keyword || keywordId)),
          computedHierarquia: recovered.computedHierarquia ?? current?.computedHierarquia ?? (published ? current?.hierarquia || "Pilar" : undefined),
        };
      });
      // Nenhum registro que já estava no workspace é descartado por falta de
      // correspondência momentânea na leitura da fonte mestre.
      const preservedCurrentItems = masterList.filter(item => !recoveredKeywordIds.has(String(item.keywordId || item.id)));
      const nextMasterList = [...recoveredMasterItems, ...preservedCurrentItems];
      const safeGroups = recoveryPlan.recoveredProvisionalGroups.flatMap(group => {
        const parsed = ProvisionalArticleGroupSchema.safeParse(group);
        return parsed.success ? [parsed.data] : [];
      });
      const rawReview = await readBrowserArtifactReadOnly(architectReviewRecoveryKey(selectedBrandId));
      let review: z.infer<typeof ArchitectReviewRecoverySchema> | null = null;
      try { if (rawReview) review = ArchitectReviewRecoverySchema.parse(rawReview); } catch { /* snapshot mantém a evidência inválida */ }
      const nextCustomSlugs = review?.customSlugs || customSlugs;
      const nextCustomHierarchies = review?.customHierarchies || customHierarquias;
      setMasterList(nextMasterList);
      setProvisionalGroups(safeGroups);
      setCustomSlugs(nextCustomSlugs);
      setCustomHierarquias(nextCustomHierarchies);
      setArchitectImportedKeywordIds(recoveryPlan.correctedImportedKeywordIds);
      const persistedReview = ArchitectReviewRecoverySchema.parse({
        schemaVersion: 1,
        importedKeywordSignature: recoveryPlan.correctedImportedKeywordIds.slice().sort().join("|"),
        masterList: nextMasterList,
        provisionalGroups: safeGroups,
        customSlugs: nextCustomSlugs,
        customHierarchies: nextCustomHierarchies,
        annotations: aiReviewAnnotations,
        savedAt: new Date().toISOString(),
      });
      await writeBrowserArtifact(architectReviewRecoveryKey(selectedBrandId), persistedReview);
      setRecoveryAudit(recoveryPlan);
      showNotification("success", `Recuperação aplicada sem reagrupamento: ${recoveryPlan.counts.recoverableNewArticles} artigo(s) preservado(s), ${recoveryPlan.orphanKeywordIds.length} keyword(s) em Keywords não agrupadas e índice corrigido.`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Não foi possível aplicar a recuperação segura.";
      setRecoveryError(message);
      showNotification("error", message);
    } finally {
      setRecoveryBusy(false);
    }
  };


  const prepareSelectedLogicalArticleDnas = async () => {
    const actorId = session?.user?.id || "human-reviewer";
    const versions: VersionEnvelope<ArticleDNA>[] = [];
    const proposedEvents: VersionStatusEvent[] = [];
    for (const group of selectedStrategicGroups()) {
      const entityId = group.publishedAnchorId || group.id;
      const current = acceptedArticleDnas[entityId];
      const currentStatus = current ? effectiveVersionStatus(current.versionId, versionEvents) : null;
      if (current && currentStatus !== "rejected" && currentStatus !== "superseded") { versions.push(current); continue; }
      const payload = deterministicArticleDnaPayload(group, selectedBrandId);
      const version = await createVersionEnvelope({ entityId, versionNumber: (current?.versionNumber || 0) + 1,
        previousVersionId: current?.versionId || null, origin: "system", changeReason: "ArticleDNA-base criado pelo agrupamento lógico aprovado pelo usuário.", createdBy: actorId, payload });
      versions.push(version);
      proposedEvents.push(createStatusEvent(version.versionId, "proposed", actorId, "Base lógica pronta para decisão humana."));
    }
    if (versions.length) setAcceptedArticleDnas(previous => ({ ...previous, ...Object.fromEntries(versions.map(version => [version.payload.articleId, version])) }));
    if (proposedEvents.length) addVersionEvents(proposedEvents);
    return { actorId, versions, proposedEvents };
  };

  const changeSelectedArticleStatus = async (target: string) => {
    pushMasterHistory(masterList, `Alterar status de ${selectedArticleIds.size} artigo(s) para ${target}`);
    setSelectedStatusAction(target);
    if (target === "awaiting_approval") {
      const prepared = await prepareSelectedLogicalArticleDnas();
      showNotification(prepared.versions.length ? "success" : "error", prepared.versions.length
        ? `${prepared.versions.length} artigo(s) enviado(s) para aprovação humana, sem chamar IA.`
        : "Nenhum artigo novo válido foi encontrado na seleção.");
    } else if (target === "approved") {
      const prepared = await prepareSelectedLogicalArticleDnas();
      const candidates = prepared.versions.filter(version => effectiveVersionStatus(version.versionId, [...versionEvents, ...prepared.proposedEvents]) !== "approved");
      if (!candidates.length) showNotification("error", "Os artigos selecionados já estão aprovados ou não correspondem a grupos novos válidos.");
      else {
        const approvedEvents = candidates.map(version => createStatusEvent(version.versionId, "approved", prepared.actorId, "Status aprovado manualmente na barra de seleção."));
        const combinedEvents = [...versionEvents, ...prepared.proposedEvents, ...approvedEvents];
        const eligible = candidates.filter(version => articleApprovalIssues(version, combinedEvents).length === 0);
        const eligibleIds = new Set(eligible.map(version => version.versionId));
        addVersionEvents(approvedEvents.filter(event => eligibleIds.has(event.versionId)));
        const blocked = candidates.filter(version => !eligibleIds.has(version.versionId));
        const blockers = [...new Set(blocked.flatMap(version => articleApprovalIssues(version, combinedEvents).filter(issue => !issue.includes("aprovação humana"))))];
        showNotification(eligible.length ? "success" : "error", `${eligible.length} artigo(s) aprovado(s)${blocked.length ? `. ${blocked.length} pendente(s): ${blockers.join(" ")}` : " para o Radar."}`);
      }
    } else if (target === "sent_radar") {
      sendSelectedToRadar();
    }
    if (selectedSiloPageIds.size > 0) {
      const actorId = session?.user?.id || "human-reviewer";
      if (target === "approved") {
        const pageEvents: VersionStatusEvent[] = [];
        for (const pageEntityId of selectedSiloPageIds) {
          const pv = acceptedSiloPages[pageEntityId];
          if (!pv) continue;
          const currentStatus = effectiveVersionStatus(pv.versionId, versionEvents);
          if (currentStatus !== "approved") pageEvents.push(createStatusEvent(pv.versionId, "approved", actorId, "Pagina do Silo aprovada manualmente."));
        }
        if (pageEvents.length) addVersionEvents(pageEvents);
      }
    }
    setSelectedStatusAction("");
  };

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
    setSelectedArticleIds(new Set(articleIds));
    setSelectionMenuOpen(false);
  };

  const selectGroup = (articleIds: string[]) => {
    setSelectedArticleIds(new Set(articleIds));
    setSelectionMenuOpen(false);
  };

  const handleDeleteSelectedNonPublished = () => {
    if (selectedArticleIds.size === 0) return;
    const selectedArticles = articlesList.filter(art => selectedArticleIds.has(art.id));
    const selectedClusterIds = selectedArticles.filter(art => !art.isPublished).map(art => String(art.clusterId));
    const protectedCount = selectedArticles.filter(art => art.isPublished).length;
    if (!selectedClusterIds.length) { showNotification("error", "Nenhum artigo novo pode ser apagado; publicados estão protegidos."); return; }
    setPendingDangerAction({ type: "delete-selected", clusterIds: selectedClusterIds, count: selectedClusterIds.length, protectedCount });
  };

  const handleResetNonPublished = () => {
    const nonPublishedCount = masterList.filter(item => item.status !== "publicado").length;
    if (nonPublishedCount === 0) {
      showNotification("success", "Nao ha itens novos para limpar.");
      return;
    }

    setPendingDangerAction({ type: "reset-new", count: nonPublishedCount });
  };

  const confirmDangerAction = () => {
    if (!pendingDangerAction) return;
    pushMasterHistory(masterList, pendingDangerAction.type === "reset-new" ? "Resetar organização dos artigos novos" : pendingDangerAction.type === "delete-selected" ? "Apagar artigos novos selecionados" : `Remover silo ${pendingDangerAction.siloName}`);
    if (pendingDangerAction.type === "delete-selected") {
      const clusterIds = new Set(pendingDangerAction.clusterIds);
      setMasterList(previous => previous.filter(item => item.status === "publicado" || !clusterIds.has(String(item.clusterId))));
      setSelectedArticleIds(new Set());
      showNotification("success", pendingDangerAction.protectedCount ? "Artigos novos removidos; publicados foram preservados." : "Artigos novos removidos da organização local.");
    } else if (pendingDangerAction.type === "reset-new") {
      setMasterList(previous => previous.filter(item => item.status === "publicado"));
      setSelectedArticleIds(new Set());
      showNotification("success", "Reset aprovado: somente itens não-publicados foram removidos.");
    } else {
      const clusterIds = new Set(pendingDangerAction.clusterIds);
      setMasterList(previous => previous.map(keyword => clusterIds.has(String(keyword.clusterId)) ? { ...keyword, siloId: null, silo_id: null, siloName: null } : keyword));
      setSelectedArticleIds(previous => { const next = new Set(previous); pendingDangerAction.articleIds.forEach(id => next.delete(id)); return next; });
      showNotification("success", "Silo removido da estrutura local; artigos voltaram para Sem Grupo.");
    }
    setPendingDangerAction(null);
  };

  const importApprovedKeywords = async (ids: string[]) => {
    pushMasterHistory(masterList, `Importar ${ids.length} keyword(s) aprovadas do Minerador`);
    const { imported, allIds } = importApprovedKeywordsToArchitect(ids);
    setKeywordImportOpen(false);
    await fetchMasterList(new Set(allIds));
    showNotification("success", `${imported} keyword(s) aprovada(s) importada(s) para o Arquiteto.`);
  };

  const dangerApproval = pendingDangerAction?.type === "reset-new"
    ? { title: "Resetar a organização dos artigos novos", description: `Esta ação removerá ${pendingDangerAction.count} keyword(s) não-publicada(s) da organização atual.`, impact: ["A organização local dos artigos novos será removida.", "Artigos publicados continuarão protegidos.", "A ação ficará disponível no histórico local para desfazer."], phrase: `RESETAR ${pendingDangerAction.count}`, label: "Aprovar reset" }
    : pendingDangerAction?.type === "delete-selected"
      ? { title: "Apagar artigos novos selecionados", description: `Esta ação removerá ${pendingDangerAction.count} artigo(s) novo(s) da estrutura atual.`, impact: ["Keywords e artigos novos selecionados sairão da organização local.", `${pendingDangerAction.protectedCount} publicado(s) permanecerão protegidos.`, "Nenhum registro publicado será alterado."], phrase: `APAGAR ${pendingDangerAction.count}`, label: "Aprovar exclusão" }
      : pendingDangerAction?.type === "remove-silo"
        ? { title: `Remover o silo “${pendingDangerAction.siloName}”`, description: "O silo será retirado da organização local e seus artigos voltarão para Sem Grupo.", impact: ["Os artigos não serão apagados.", "As relações locais com este silo serão removidas.", "Silos com publicados não podem chegar a esta confirmação."], phrase: "REMOVER SILO", label: "Aprovar remoção" }
        : null;

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
    <div className="relative flex h-screen min-h-0 flex-col overflow-hidden bg-[#06070a] font-mono text-xs select-none">

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
      <div className="sticky top-0 bg-[#0b0c10] border-b border-slate-900 px-3 h-10 flex items-center justify-between shrink-0 z-40">
        
        {/* Esquerda: Identidade + Busca + Filtros + Ferramentas da Planilha (Visíveis) */}
        <div className="flex items-center gap-2 overflow-x-auto scrollbar-none py-1">
          <span className="text-slate-500 font-bold uppercase tracking-widest text-[10px] shrink-0">Arquiteto</span>
          <span className="text-slate-800 select-none shrink-0">·</span>

          <HistoryControls entries={masterHistory.entries} canUndo={masterHistory.canUndo} canRedo={masterHistory.canRedo}
            onUndo={undoMasterList} onRedo={redoMasterList} onRestore={masterHistory.restore} compact/>

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

          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            className="bg-transparent border border-slate-800 rounded px-1.5 py-0.5 text-[10px] text-slate-400 focus:outline-none cursor-pointer shrink-0">
            <option value="Todos" className="bg-[#0b0c10]">Status: Todos</option>
            <option value="draft" className="bg-[#0b0c10]">Em processo</option>
            <option value="awaiting_approval" className="bg-[#0b0c10]">Aguardando aprovação</option>
            <option value="approved" className="bg-[#0b0c10]">Aprovado</option>
            <option value="sent_radar" className="bg-[#0b0c10]">Importado no Radar</option>
            <option value="published" className="bg-[#0b0c10]">Publicado</option>
          </select>

          <CompactSavedViews
            userId={session?.user?.email || "usuario-local"}
            brandId={selectedBrandId}
            module="arquiteto"
            values={{ searchQuery, filterHierarquia, filterStatus }}
            onApply={view => { setSearchQuery(view.searchQuery || ""); setFilterHierarquia(view.filterHierarquia || "Todos"); setFilterStatus(view.filterStatus || "Todos"); }}
          />

          {/* Gerar IA */}
          <button onClick={processDeterministicStructure} disabled={masterList.length === 0 || generatingStrategic}
            className="flex items-center gap-1 border border-cyan-900/60 hover:border-cyan-700 text-cyan-400 hover:text-cyan-300 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors disabled:opacity-40 cursor-pointer shrink-0"
            title="Gerar Dossiês IA">
            {activeLogicalTask ? <Loader2 className="h-3 w-3 animate-spin"/> : <Network className="w-3 h-3" />}
            <span>{activeLogicalTask ? "Processando lógica…" : "Processar logica (sem IA)"}</span>
          </button>

          {(activeLogicalTask?.message || deterministicConflicts.length > 0) && (
            <span className="text-[9px] text-amber-400 whitespace-nowrap">
              {activeLogicalTask?.message || `${deterministicConflicts.length} conflito(s) logico(s)`}
            </span>
          )}

          <button onClick={() => { setKeywordImportOpen(true); void fetchMasterList(); }}
            className="flex items-center gap-1 border border-emerald-900/60 hover:border-emerald-700 text-emerald-400 hover:text-emerald-300 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer shrink-0"
            title="Selecionar keywords aprovadas no Minerador">
            <Plus className="w-3 h-3" />
            <span>Importar do Minerador</span>
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

          <button onClick={handleResetNonPublished}
            className="flex items-center gap-1 border border-rose-950/70 text-rose-400 hover:bg-rose-950/15 rounded px-2 py-0.5 text-[10px] font-semibold transition-colors cursor-pointer shrink-0"
            title="Resetar apenas a organização de artigos não publicados">
            <RefreshCw className="w-3 h-3" />
            <span>Resetar não-publicados</span>
          </button>

        </div>

        <div className="flex items-center gap-2">
          {articlesList.length > 0 && (
            <span className="text-slate-700 text-[10px] font-semibold tabular-nums shrink-0 mr-1 hidden sm:inline">
              {filteredArticles.length} artigos
            </span>
          )}

          {false && <div className="relative">
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

                <div className="border-t border-rose-950/70 py-1">
                  <p className="px-3.5 py-1 text-[8px] font-bold uppercase tracking-widest text-rose-700">Zona de segurança</p>
                  <button onClick={handleResetNonPublished}
                    className="flex w-full items-center gap-2.5 px-3.5 py-2 text-left text-[10px] text-rose-400 transition-colors hover:bg-rose-950/15">
                    <RefreshCw className="h-3.5 w-3.5"/><span>Resetar somente não-publicados…</span>
                  </button>
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
          </div>}
        </div>
      </div>

      <ArchitectRecoveryPanel
        snapshotReady={Boolean(recoverySnapshot)}
        snapshotCreatedAt={recoverySnapshot?.createdAt || null}
        audit={recoveryAudit}
        plan={recoveryPlan}
        busy={recoveryBusy}
        error={recoveryError}
        onExportSnapshot={() => void exportRecoverySnapshot()}
        onAudit={() => void auditRecoverySources()}
        onRecover={() => void applySafeRecovery()}
      />

      {/* ── PLANILHA PRINCIPAL DE ARTIGOS ── */}
      <main className="flex-1 overflow-auto">
        {ungroupedKeywords.length > 0 && (
          <section className="border-b border-amber-950/60 bg-amber-950/[.06] px-4 py-3">
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-bold uppercase tracking-widest text-amber-500">Keywords não agrupadas · {ungroupedKeywords.length}</span>
              <span className="text-[9px] text-slate-600">Sem agrupamento inferido durante a recuperação</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ungroupedKeywords.map(keyword => (
                <span key={String(keyword.id)} className="rounded border border-amber-900/50 bg-black/20 px-2 py-1 text-[10px] text-amber-200/80" title="Keyword preservada sem vínculo recuperável com artigo ou grupo">
                  {keyword.keyword}
                </span>
              ))}
            </div>
          </section>
        )}
        {loading ? (
          <div className="flex items-center justify-center h-full">
            <Loader2 className="w-5 h-5 text-indigo-500 animate-spin" />
          </div>
        ) : filteredArticles.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full gap-2.5 text-slate-700">
            <span className="text-[11px]">
              {masterList.length === 0
                ? "Nenhum artigo disponível. Use Importar do Minerador."
                : "Nenhum artigo corresponde aos filtros."}
            </span>
          </div>
        ) : (
          <div className="w-full">
            <table className="w-full min-w-[1360px] border-separate border-spacing-0 text-left">
              <thead className="sticky top-0 z-30 bg-[#080a0f] shadow-[0_1px_0_rgba(51,65,85,0.8)]">
                <tr className="bg-[#080a0f] text-slate-500 text-[9px] font-bold uppercase tracking-widest border-b border-slate-800/80">
                  <th className="sticky left-0 z-40 w-10 border-r border-slate-850 bg-[#080a0f] px-2 py-2 text-right">#</th>
                  <th className="py-2 px-2.5 w-16">
                    <div className="relative flex items-center gap-1" ref={selectionMenuRef}>
                      <input
                        type="checkbox"
                        checked={filteredArticles.length > 0 && filteredArticles.every(art => selectedArticleIds.has(art.id))}
                        onChange={() => {
                          const allIds = filteredArticles.map(art => art.id);
                          const allSelected = allIds.length > 0 && allIds.every(id => selectedArticleIds.has(id));
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
                  <th className="py-2 px-2.5 w-28">APROVAÇÃO</th>
                  <th className="py-2 px-3 w-28">Hierarquia</th>
                  <th className="py-2 px-3">Keyword Principal (Pilar)</th>
                  <th className="w-24 px-3 py-2 text-center">KeywordDNAs</th>
                  <th className="w-28 px-3 py-2 text-center">Revisão IA</th>
                  <th className="w-28 px-3 py-2 text-center">ArticleDNA</th>
                  <th className="w-28 px-3 py-2 text-center">SiloDNA</th>
                  <th className="py-2 px-3 w-52 text-right">Ações</th>
                </tr>
              </thead>

              <tbody>
                {groupedArticles.map((group, groupIndex) => {
                  const siloPaletteSize = Math.min(SILO_COLORS.length, ARTICLE_COLORS.length, ARTICLE_ACCENTS.length);
                  const siloColor = SILO_COLORS[groupIndex % siloPaletteSize];
                  const groupArticleIds = group.articles.map(art => art.id);
                  const groupHasPublished = group.articles.some(art => art.isPublished);
                  const allGroupSelected = groupArticleIds.length > 0 && groupArticleIds.every(id => selectedArticleIds.has(id));

                  return (
                    <React.Fragment key={group.key}>
                      {/* Cabeçalho do Silo — somente informações, ações ficam no rodapé */}
                      <tr className={`bg-gray-900 border-l-4 ${siloColor.border} border-y border-slate-800/80`}>
                        <td colSpan={12} className="px-3 py-2.5">
                          <div className="flex items-center justify-between gap-3">
                            <div className="min-w-0 flex items-center gap-2">
                              {/* Checkbox da Página do Silo (teal) — sempre visível, disabled sem SiloDNA */}
                              {group.siloId && (() => {
                                const pageEntityId = `silo-page:${group.siloId}`;
                                const siloDnaExists = Boolean(acceptedSiloDnas[String(group.siloId)]);
                                return (
                                  <input
                                    type="checkbox"
                                    checked={selectedSiloPageIds.has(pageEntityId)}
                                    onChange={() => toggleSiloPageSelection(pageEntityId)}
                                    disabled={!siloDnaExists}
                                    className="h-3.5 w-3.5 rounded border-teal-700 bg-[#06070a] accent-teal-500 cursor-pointer disabled:opacity-30 disabled:cursor-not-allowed"
                                    title={siloDnaExists ? "Selecionar Página do Silo" : "Gere o SiloDNA primeiro para trabalhar a Página do Silo"}
                                  />
                                );
                              })()}
                              {/* Expand/collapse do Silo */}
                              {group.siloId && (
                                <button onClick={() => toggleSiloExpand(String(group.siloId))}
                                  className="text-slate-500 hover:text-teal-300 transition-colors cursor-pointer p-0.5"
                                  title="Ver/editar detalhes do Silo">
                                  {expandedSiloIds.has(String(group.siloId)) ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                                </button>
                              )}
                              {/* Checkbox dos artigos (azul) — selecionar todos do silo */}
                              <input
                                type="checkbox"
                                checked={allGroupSelected}
                                onChange={() => toggleSiloArticleSelection(groupArticleIds)}
                                className="h-3.5 w-3.5 rounded border-slate-700 bg-[#06070a] accent-blue-500 cursor-pointer"
                                title="Selecionar artigos deste silo"
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
                                {/* SiloDNA badge */}
                                {group.siloId && (() => {
                                  const sdna = acceptedSiloDnas[String(group.siloId)];
                                  if (!sdna) return null;
                                  return <span className="shrink-0 rounded border border-emerald-900/60 bg-emerald-950/30 px-1.5 py-0.5 text-[8px] font-bold text-emerald-300" title={`SiloDNA: ${sdna.versionId}`}>Silo ID · v{sdna.versionNumber}</span>;
                                })()}
                                {/* SiloPage badge — sempre visível */}
                                {group.siloId && (() => {
                                  const pageEntityId = `silo-page:${group.siloId}`;
                                  const pv = acceptedSiloPages[pageEntityId];
                                  if (!pv) return <span className="shrink-0 rounded border border-slate-800 px-1.5 py-0.5 text-[8px] font-bold text-slate-600">Pagina Pendente</span>;
                                  return (
                                    <span className="shrink-0 rounded border border-teal-900/60 bg-teal-950/30 px-1.5 py-0.5 text-[8px] font-bold text-teal-300" title={`Página do Silo: ${pv.versionId}`}>
                                      Pagina ID . v{pv.versionNumber}
                                    </span>
                                  );
                                })()}

                                {groupHasPublished && (
                                  <span className="shrink-0 rounded border border-slate-700/70 bg-slate-950 px-1.5 py-0.5 text-[8px] font-bold uppercase tracking-wider text-slate-500">
                                    Publicados protegidos
                                  </span>
                                )}
                              </div>
                            </div>
                            {/* Lado direito: somente status badges em somente leitura */}
                            <div className="flex items-center gap-2">
                              {group.siloId && (() => {
                                const ps = siloPageStatus(String(group.siloId));
                                if (ps === "none") return null;
                                return <WorkflowStatusBadge status={ps} />;
                              })()}
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
                          </div>
                        </td>
                      </tr>

                      {/* Painel expansível — somente leitura, status controlado pelo rodapé */}
                      {group.siloId && expandedSiloIds.has(String(group.siloId)) && (() => {
                        const pageEntityId = `silo-page:${group.siloId}`;
                        const pageVersion = acceptedSiloPages[pageEntityId];
                        const siloDnaVersion = acceptedSiloDnas[String(group.siloId)];
                        return (
                          <tr className={`${siloColor.rowBg} border-b border-slate-900/30`}>
                            <td colSpan={12} className="py-4 px-10">
                              <div className="rounded border border-teal-900/30 bg-teal-950/[.05] p-4">
                                <div className="flex items-center justify-between gap-3 border-b border-slate-800/80 pb-2 mb-3">
                                  <div>
                                    <span className="text-[9px] font-bold uppercase tracking-widest text-teal-400">Página do Silo</span>
                                    <p className="text-[10px] text-slate-500 mt-0.5">Página publicável do silo — diferente do SiloDNA que é a inteligência estratégica.</p>
                                  </div>
                                  {pageVersion && (
                                    <span className="rounded border border-teal-900/60 bg-teal-950/30 px-2 py-0.5 text-[9px] font-bold text-teal-300">
                                      ID · v{pageVersion.versionNumber}
                                    </span>
                                  )}
                                </div>
                                {pageVersion ? (
                                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-[10px]">
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Slug</dt><dd className="mt-0.5 text-teal-300 font-mono">/{pageVersion.payload.slug}</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Publicação</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.publicationStatus === "published" ? "Publicado" : "Novo"} · verificação {pageVersion.payload.publicationVerification.status}</dd>{pageVersion.payload.publishedUrl && <a href={pageVersion.payload.publishedUrl} target="_blank" rel="noopener noreferrer" className="mt-0.5 block truncate text-teal-300 hover:text-teal-200" title={pageVersion.payload.publishedUrl}>{pageVersion.payload.publishedUrl}</a>}{pageVersion.payload.publicationStatus === "published" && pageVersion.payload.publishedUrl && <button type="button" onClick={() => void handleVerifySiloPage(pageVersion)} disabled={verifyingSiloPageId === pageVersion.payload.siloPageId} className="mt-1 rounded border border-teal-900/70 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-teal-300 hover:border-teal-700 disabled:opacity-40">{verifyingSiloPageId === pageVersion.payload.siloPageId ? "Conferindo…" : "Conferir identidade"}</button>}</div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">H1</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.h1}</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">SEO Title</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.seoTitle}</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Meta Description</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.metaDescription}</dd></div>
                                    <div className="sm:col-span-2"><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Introdução</dt><dd className="mt-0.5 text-slate-300 leading-relaxed">{pageVersion.payload.intro}</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">CTA</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.cta}</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Indexação</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.indexationStatus}</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Seções</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.sections.length} seção(ões)</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Pilar</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.pillarArticleId || "—"}</dd></div>
                                    <div><dt className="text-[8px] font-bold uppercase tracking-wider text-slate-600">Suportes</dt><dd className="mt-0.5 text-slate-200">{pageVersion.payload.supportArticleIds.join(", ") || "—"}</dd></div>
                                    {pageVersion.payload.humanPendingDecisions.length > 0 && (
                                      <div className="sm:col-span-2 rounded border border-amber-900/40 bg-amber-950/20 p-2">
                                        <dt className="text-[8px] font-bold uppercase tracking-wider text-amber-400">Pendências humanas</dt>
                                        <dd className="mt-0.5 text-amber-300">{pageVersion.payload.humanPendingDecisions.join(" · ")}</dd>
                                      </div>
                                    )}
                                  </div>
                                ) : siloDnaVersion ? (
                                  <p className="text-[10px] text-slate-400">O SiloDNA existe (ID · v{siloDnaVersion.versionNumber}) mas a Página do Silo ainda não foi gerada. Use o rodapé para gerar.</p>
                                ) : (
                                  <p className="text-[10px] text-slate-500">Gere o SiloDNA primeiro para poder criar a Página do Silo.</p>
                                )}
                              </div>
                            </td>
                          </tr>
                        );
                      })()}

                      {group.articles.map((art) => {

                  const rowBg     = siloColor.rowBg;
                  const isExpanded = expandedIds.has(art.id);
                   const currentSlug = customSlugs[art.id] ?? art.slug;
                   const activeTab = activeTabs[art.id] || "suporte";
                   const workflowStatus = articleWorkflowStatus(art);
                   const approvalStatus = articleApprovalStatus(art);
                   const articleEntityId = art.isPublished
                     ? art.mainKeywordObj?.id
                     : art.mainKeywordObj?.provisionalGroupId || art.briefingId;
                   const articleDnaVersion = articleEntityId ? acceptedArticleDnas[articleEntityId] : undefined;
                   const publicationCanonical = art.mainKeywordObj?.canonical || articleDnaVersion?.payload.canonical || null;
                   const articleIdentityContext = articleSerpIdentityFor(art);
                   const kgrBoundSlug = articleDnaVersion?.payload.kgrIdentity?.boundSlug || art.mainKeywordObj?.kgrIdentity?.boundSlug || null;
                   const siloDnaVersion = art.siloId ? acceptedSiloDnas[String(art.siloId)] : undefined;
                   const pendingAiReview = art.aiReviewAnnotations.some(annotation => annotation.reviewState === "pending_fine_review");

                  return (
                    <React.Fragment key={art.id}>
                      {/* Linha do Artigo */}
                      <tr id={`article-row-${art.id}`} className={`border-b border-slate-900/40 transition-colors ${rowBg} ${art.isPublished ? "opacity-60" : "hover:brightness-105"} ${pendingAiReview ? "border-l-2 border-l-violet-500" : ""}`}>

                        <td className="sticky left-0 z-10 w-10 border-r border-slate-850 bg-[#080a0f] px-2 py-2 text-right text-[9px] tabular-nums text-slate-500">
                          {filteredArticles.findIndex(candidate => candidate.id === art.id) + 1}
                        </td>

                        <td className="py-2 px-2.5 text-center">
                          <input
                            type="checkbox"
                            checked={selectedArticleIds.has(art.id)}
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
                          <WorkflowStatusBadge status={workflowStatus}/>
                        </td>

                        <td className="py-2 px-2.5">
                          <WorkflowStatusBadge status={approvalStatus}/>
                        </td>

                        <td className="py-2 px-3">
                          <select
                            value={art.hierarquia}
                            onFocus={() => pushMasterHistory(masterList, `Editar hierarquia de ${art.keywordPrincipal}`)}
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
                            {art.isPublished && <span className={`shrink-0 rounded border px-1.5 py-0.5 text-[7.5px] font-bold uppercase tracking-wider ${(articleDnaVersion?.payload.primaryKeywordPolicy || art.mainKeywordObj?.primaryKeywordPolicy) === "locked" ? "border-emerald-900/60 bg-emerald-950/20 text-emerald-300" : (articleDnaVersion?.payload.primaryKeywordPolicy || art.mainKeywordObj?.primaryKeywordPolicy) === "revisable" || (articleDnaVersion?.payload.primaryKeywordPolicy || art.mainKeywordObj?.primaryKeywordPolicy) === "reviewable" ? "border-amber-900/60 bg-amber-950/20 text-amber-300" : "border-rose-900/60 bg-rose-950/20 text-rose-300"}`}>{(articleDnaVersion?.payload.primaryKeywordPolicy || art.mainKeywordObj?.primaryKeywordPolicy) === "locked" ? "Principal travada" : (articleDnaVersion?.payload.primaryKeywordPolicy || art.mainKeywordObj?.primaryKeywordPolicy) === "revisable" || (articleDnaVersion?.payload.primaryKeywordPolicy || art.mainKeywordObj?.primaryKeywordPolicy) === "reviewable" ? "Principal revisável" : "Principal não travada"}</span>}
                            {art.isPublished ? (
                              publicationUrlFor(art) ? (
                                <a href={publicationUrlFor(art)!} target="_blank" rel="noopener noreferrer" className="font-mono text-[10.5px] text-cyan-400 hover:text-cyan-300 underline underline-offset-2 select-all shrink-0 truncate max-w-[260px]" title="Abrir URL publicada em nova aba">
                                  {publicationUrlFor(art)}
                                </a>
                              ) : (
                                <span className="font-mono text-[10.5px] text-slate-600 shrink-0" title="A URL publicada não foi recebida; nenhuma URL será inventada">
                                  URL não recebida · /{art.slug}
                                </span>
                              )
                            ) : (
                              <input
                                type="text"
                                value={articleIdentityContext.slugProtected && kgrBoundSlug ? kgrBoundSlug : currentSlug}
                                onFocus={() => pushMasterHistory(masterList, `Editar slug de ${art.keywordPrincipal}`)}
                                onChange={e => { if (!articleIdentityContext.slugProtected) setCustomSlugs(prev => ({ ...prev, [art.id]: e.target.value })); }}
                                disabled={articleIdentityContext.slugProtected}
                                className="w-full max-w-[280px] bg-[#06070a]/60 border border-slate-800 hover:border-slate-700 focus:border-blue-500 rounded px-2.5 py-0.5 text-[10.5px] text-blue-400 font-mono focus:outline-none transition-colors disabled:cursor-not-allowed disabled:text-amber-400"
                              />
                            )}
                          </div>
                        </td>

                        <td className="px-3 py-2 text-center text-[10px] font-bold text-indigo-300">{art.supportKeywords.length + 1}</td>

                        <td className="px-3 py-2 text-center">
                          {art.aiReviewAnnotations.length > 0 ? (
                            <button
                              onClick={() => toggleExpand(art.id)}
                              className={`rounded border px-2 py-1 text-[8px] font-bold uppercase tracking-wider ${pendingAiReview ? "border-violet-500/40 bg-violet-500/10 text-violet-300" : "border-emerald-500/30 bg-emerald-500/10 text-emerald-400"}`}
                              title="Abrir as alterações e anotações aplicadas pela IA"
                            >
                              {pendingAiReview ? `IA aplicada · ${art.aiReviewAnnotations.length}` : "Revisado"}
                            </button>
                          ) : <span className="text-[9px] text-slate-700">—</span>}
                        </td>

<td className="px-3 py-2 text-center"><div className="flex flex-col items-center gap-1">{articleDnaVersion ? (<div className="flex flex-col items-center gap-0.5"><span className="rounded border border-indigo-900/60 bg-indigo-950/30 px-1.5 py-0.5 text-[8.5px] font-bold text-indigo-300" title={`Identidade: ${articleDnaVersion.versionId}`}>ID . v{articleDnaVersion.versionNumber}</span><span className={`text-[7.5px] font-semibold ${articleDnaVersion.origin === "ai" ? "text-violet-400" : articleDnaVersion.origin === "system" ? "text-cyan-400" : "text-slate-500"}`}>{articleDnaVersion.origin === "ai" ? "IA aplicada" : articleDnaVersion.origin === "system" ? "Logica" : articleDnaVersion.origin}</span></div>) : <span className="text-[9px] text-slate-700">Pendente</span>}<button onClick={() => openSerpResult(art)} className={`rounded border px-1.5 py-0.5 text-[8px] font-semibold whitespace-nowrap ${serpIndicatorFor(art).className}`} title="Abrir as recomendações SERP junto às keywords">{serpIndicatorFor(art).label}</button></div></td>
<td className="px-3 py-2 text-center">{siloDnaVersion ? (<div className="flex flex-col items-center gap-0.5"><span className="rounded border border-emerald-900/60 bg-emerald-950/30 px-1.5 py-0.5 text-[8.5px] font-bold text-emerald-300" title={`Identidade: ${siloDnaVersion.versionId}`}>ID . v{siloDnaVersion.versionNumber}</span><span className={`text-[7.5px] font-semibold ${siloDnaVersion.origin === "ai" ? "text-violet-400" : siloDnaVersion.origin === "system" ? "text-cyan-400" : "text-slate-500"}`}>{siloDnaVersion.origin === "ai" ? "IA aplicada" : siloDnaVersion.origin === "system" ? "Logica" : siloDnaVersion.origin}</span></div>) : <span className="text-[9px] text-slate-700">Pendente</span>}</td>

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
                            <div className="flex flex-col items-end gap-1">
                              <span className="flex items-center justify-end gap-1 text-right text-[9px] font-bold uppercase tracking-wider text-slate-600" title="Slug, keyword principal e Silo travados. Hierarquia editavel.">
                                <ShieldCheck className="w-3 h-3" />
                                URL/Silo travados
                              </span>
                              {publicationUrlFor(art) && <button onClick={() => void handleVerifyPublication(art)} disabled={verificationBusy.has(art.id)} className="rounded border border-cyan-900/60 px-1.5 py-0.5 text-[8px] font-semibold text-cyan-400 hover:border-cyan-700 disabled:opacity-40" title="Verificação server-side da URL, canonical e sitemap">
                                {verificationBusy.has(art.id) ? "Verificando…" : "Verificar URL e canonical"}
                              </button>}
                              {publicationVerifications.find(item => item.articleId === articleEntityIdFor(art)) && <span className="text-[8px] text-slate-500">{publicationVerifications.find(item => item.articleId === articleEntityIdFor(art))?.status}</span>}
                            </div>
                          )}
                        </td>
                      </tr>

                      {/* Acordeão Expandido do Artigo */}
                      {isExpanded && (
                        <tr className={`${rowBg} border-b border-slate-900/30`}>
                          <td colSpan={12} className="py-4 px-10">
                            {art.aiReviewAnnotations.length > 0 && (
                              <section className="mb-3 rounded border border-violet-500/25 bg-violet-500/[.05] p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-[9px] font-bold uppercase tracking-widest text-violet-300">Alterações da IA aplicadas localmente</p>
                                    <p className="mt-1 text-[9px] text-slate-500">Use a própria planilha para mover, corrigir ou desfazer. Isto não aprova o artigo para a próxima etapa.</p>
                                  </div>
                                  {pendingAiReview && <button onClick={() => markAiReviewChecked(art)} className="rounded border border-violet-500/30 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-violet-300 hover:bg-violet-500/10">Marcar pente-fino concluído</button>}
                                </div>
                                <div className="mt-2 grid gap-2 lg:grid-cols-2">
                                  {art.aiReviewAnnotations.map(annotation => (
                                    <div key={annotation.id} className="rounded border border-slate-800 bg-[#08090c] p-2.5">
                                      <div className="flex items-center justify-between gap-2">
                                        <span className="text-[8px] font-bold uppercase tracking-wider text-violet-400">{String(annotation.action).replaceAll("_", " ")}</span>
                                        <span className="text-[8px] font-mono text-slate-600">{Math.round(annotation.confidence * 100)}%</span>
                                      </div>
                                      <p className="mt-1 text-[10px] text-slate-300">{annotation.summary}</p>
                                      {annotation.details.map((detail: string) => <p key={detail} className="mt-1 text-[9px] text-amber-400">• {detail}</p>)}
                                    </div>
                                  ))}
                                </div>
                              </section>
                            )}
                            {articleDnaVersion?.payload.intentProfile && (
                              <section className="mb-3 rounded border border-indigo-500/20 bg-indigo-500/[.035] p-3">
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-[9px]">
                                  <div><p className="text-[8px] font-bold uppercase tracking-wider text-indigo-300">Intenção principal</p><p className="mt-0.5 text-slate-200">{articleDnaVersion.payload.intentProfile.primaryIntent}</p><p className="text-[8px] text-slate-500">Origem: KeywordDNA da principal · {articleDnaVersion.payload.intentProfile.originalLabel || "rótulo não recebido"}</p></div>
                                  <div><p className="text-[8px] font-bold uppercase tracking-wider text-indigo-300">Arquitetura</p><p className="mt-0.5 text-slate-200">{articleDnaVersion.payload.architectureStatus || "não definida"}</p><p className="text-[8px] text-slate-500">Confirmação: {articleDnaVersion.payload.intentProfile.confirmation}</p></div>
                                  <div><p className="text-[8px] font-bold uppercase tracking-wider text-indigo-300">KGR</p><p className="mt-0.5 text-slate-200">{articleDnaVersion.payload.kgrIdentity?.bindingStatus || "não aplicável"}</p><p className="text-[8px] text-slate-500">Slug vinculado: {articleDnaVersion.payload.kgrIdentity?.boundSlug || "—"}</p></div>
                                  <div><p className="text-[8px] font-bold uppercase tracking-wider text-indigo-300">Publicação</p><p className="mt-0.5 text-slate-200">{articleDnaVersion.payload.publishedIdentityRef ? "publicado protegido" : "novo artigo"}</p><p className="truncate text-[8px] text-slate-500" title={articleDnaVersion.payload.publishedIdentityRef?.publishedUrl || "URL não recebida"}>{articleDnaVersion.payload.publishedIdentityRef?.publishedUrl || "URL não recebida"}</p><p className="truncate text-[8px] text-slate-500" title={articleDnaVersion.payload.canonical || "Canonical não verificado"}>{articleDnaVersion.payload.canonical || "Canonical não verificado"}</p></div>
                                </div>
                                {articleDnaVersion.payload.intentProfile.secondaryIntentSignals.length > 0 && <div className="mt-2 border-t border-slate-800/70 pt-2"><p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">Sinais secundários · não sobrescrevem a principal</p><div className="mt-1 flex flex-wrap gap-1.5">{articleDnaVersion.payload.intentProfile.secondaryIntentSignals.map(signal => <span key={signal.keywordId} className="rounded border border-slate-800 px-1.5 py-0.5 text-[8px] text-slate-400">{signal.keywordId}: {signal.intent} · {signal.compatibility}</span>)}</div></div>}
                              </section>
                            )}
                            {articleDnaVersion && (() => {
                              const policy = articleDnaVersion.payload.primaryKeywordPolicy || "unknown";
                              const policyLabel = policy === "locked" ? "PRINCIPAL TRAVADA" : policy === "revisable" ? "PRINCIPAL REVISÁVEL" : policy === "free" ? "PRINCIPAL LIVRE" : policy === "conflict" ? "POLÍTICA EM CONFLITO" : "POLÍTICA DESCONHECIDA";
                              const policyDescription = policy === "locked" ? "A principal está protegida por vínculo confirmado ou decisão consolidada." : policy === "revisable" ? "A URL, o slug e o canonical estão protegidos; a principal ainda pode ser comparada e substituída somente com decisão humana." : policy === "free" ? "A unidade nova está em formação; a principal permanece livre até a confirmação." : "Publicado sem política suficiente: a identidade estrutural é protegida, mas a principal não foi travada silenciosamente.";
                              const candidates = articleDnaVersion.payload.primaryKeywordCandidates || [];
                              const selectedCandidate = primaryDrafts[art.id] || articleDnaVersion.payload.principalKeywordId;
                              return <section className="mb-3 rounded border border-amber-500/25 bg-amber-500/[.035] p-3">
                                <div className="flex flex-wrap items-start justify-between gap-2"><div><p className="text-[8px] font-bold uppercase tracking-widest text-amber-300">Política da keyword principal</p><p className="mt-1 text-[12px] font-bold text-slate-100">{policyLabel}</p><p className="mt-1 max-w-3xl text-[9px] leading-relaxed text-amber-100/75">{policyDescription}</p></div><span className="rounded border border-slate-700 px-2 py-1 text-[8px] font-mono text-slate-400">Origem: {articleDnaVersion.payload.primaryKeywordPolicyContext?.source || "legacy"}</span></div>
                                <div className="mt-2 grid gap-2 text-[8.5px] sm:grid-cols-4"><span>Principal atual: <strong className="text-slate-200">{art.keywordPrincipal}</strong></span><span>Política recebida: <strong className="text-slate-200">{articleDnaVersion.payload.primaryKeywordPolicyContext?.sourcePolicy || policy}</strong></span><span>Volume: <strong className="text-slate-200">{articleDnaVersion.payload.primaryKeywordMetrics?.volumeSearch ?? "não recebido"}</strong></span><span>Resultados: <strong className="text-slate-200">{articleDnaVersion.payload.primaryKeywordMetrics?.resultCount ?? "não recebido"}</strong></span></div>
                                {art.isPublished && <p className="mt-2 rounded border border-emerald-900/50 bg-emerald-950/20 p-2 text-[8.5px] text-emerald-200/80">URL publicada, slug, canonical e marca permanecem protegidos em ambos os estados publicados.</p>}
                                {art.isPublished && policy === "revisable" && candidates.length > 0 && <div className="mt-2 flex flex-wrap items-end gap-2 border-t border-slate-800/70 pt-2"><label className="flex min-w-[240px] flex-1 flex-col gap-1 text-[8px] font-bold uppercase tracking-wider text-slate-500">Comparar/confirmar candidata<select value={selectedCandidate} onChange={event => setPrimaryDrafts(previous => ({ ...previous, [art.id]: event.target.value }))} className="rounded border border-slate-800 bg-[#06070a] px-2 py-1.5 text-[10px] font-normal normal-case text-slate-200 outline-none focus:border-amber-700"><option value={articleDnaVersion.payload.principalKeywordId}>{art.keywordPrincipal} (principal atual)</option>{candidates.map(candidate => <option key={candidate.keywordId} value={candidate.keywordId}>{candidate.keyword} (candidata)</option>)}</select></label><button type="button" onClick={() => void handleConfirmArticleArchitecture(art, selectedCandidate)} className="rounded border border-indigo-700 px-2.5 py-1.5 text-[8px] font-bold uppercase tracking-wider text-indigo-300 hover:border-indigo-500">Confirmar principal e arquitetura</button></div>}
                              </section>;
                            })()}
                            {articleDnaVersion?.payload.strategicPurpose && articleDnaVersion.payload.volumeStrategy && articleDnaVersion.payload.hierarchyStrategy && (
                              <section className="mb-3 rounded border border-teal-500/20 bg-teal-500/[.035] p-3">
                                <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4 text-[9px]">
                                  <div className="sm:col-span-2"><p className="text-[8px] font-bold uppercase tracking-wider text-teal-300">Propósito estratégico</p><p className="mt-0.5 text-slate-200">{articleDnaVersion.payload.strategicPurpose.summary}</p><p className="mt-1 text-[8px] text-slate-500">Necessidade: {articleDnaVersion.payload.strategicPurpose.searchNeed}</p></div>
                                  <div><p className="text-[8px] font-bold uppercase tracking-wider text-teal-300">Volume</p><p className="mt-0.5 text-slate-200">Principal: {articleDnaVersion.payload.volumeStrategy.primaryKeywordVolume ?? "desconhecido"}</p><p className="text-[8px] text-slate-500">Bruto: {articleDnaVersion.payload.volumeStrategy.grossCombinedVolume ?? "desconhecido"} · Ajustado: {articleDnaVersion.payload.volumeStrategy.adjustedCombinedVolume ?? "pendente"}</p><p className="text-[8px] text-slate-500">Sobreposição: {articleDnaVersion.payload.volumeStrategy.overlapRisk}</p></div>
                                  <div><p className="text-[8px] font-bold uppercase tracking-wider text-teal-300">Hierarquia</p><p className="mt-0.5 text-slate-200">{articleDnaVersion.payload.hierarchyStrategy.role} · score {Math.round(articleDnaVersion.payload.hierarchyStrategy.score * 100)}%</p><p className="text-[8px] text-slate-500">Rank: {articleDnaVersion.payload.hierarchyStrategy.rank ?? "não calculado"} · {articleDnaVersion.payload.hierarchyStrategy.status}</p></div>
                                </div>
                                <div className="mt-2 border-t border-slate-800/70 pt-2"><p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">Contribuição por KeywordDNA</p><div className="mt-1 grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">{articleDnaVersion.payload.keywordReferences.map(reference => <div key={reference.keywordId} className="rounded border border-slate-800 px-2 py-1.5"><p className="text-[8px] text-slate-200">{reference.keywordId} · {reference.role}</p><p className="mt-0.5 text-[8px] text-teal-300">{reference.contribution || "não definido"} · volume {reference.volume ?? "desconhecido"}</p><p className="mt-0.5 text-[8px] text-slate-500">{reference.purpose || reference.strategicContribution}</p></div>)}</div></div>
                                <div className="mt-2 text-[8px] text-slate-500">Racional: {articleDnaVersion.payload.hierarchyStrategy.rationale.join(" ")}</div>
                              </section>
                            )}
                            {articleDnaVersion && (() => {
                              const suggestion: EditorialUnitClassification = articleDnaVersion.payload.unitClassification || suggestEditorialUnitClassification({ principal: art.mainKeywordObj, article: articleDnaVersion.payload, published: art.isPublished });
                              const draft = unitDrafts[art.id] || { type: suggestion.type, landingPagePurpose: suggestion.landingPagePurpose || "unknown" };
                              const evidence = suggestion.evidence;
                              const statusLabel = suggestion.status === "human_confirmed" ? "Confirmado por pessoa" : suggestion.status === "conflict" ? "Conflito" : suggestion.status === "unknown" ? "Desconhecido" : "Sugestão aguardando confirmação";
                              return <section className="mb-3 rounded border border-cyan-500/20 bg-cyan-500/[.035] p-3">
                                <div className="flex flex-wrap items-start justify-between gap-3">
                                  <div>
                                    <p className="text-[8px] font-bold uppercase tracking-wider text-cyan-300">Tipo de unidade</p>
                                    <p className="mt-1 text-[9px] text-slate-400">A sugestão usa evidências disponíveis; ela não equivale a confirmação e não altera a identidade publicada.</p>
                                  </div>
                                  <span className={`rounded border px-2 py-1 text-[8px] font-bold uppercase tracking-wider ${suggestion.status === "human_confirmed" ? "border-emerald-800 text-emerald-300" : suggestion.status === "conflict" ? "border-rose-800 text-rose-300" : "border-amber-800 text-amber-300"}`}>{statusLabel}</span>
                                </div>
                                <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                                  <label className="flex flex-col gap-1 text-[8px] font-bold uppercase tracking-wider text-slate-500">Tipo sugerido / decisão<select value={draft.type} onChange={event => setUnitDrafts(previous => ({ ...previous, [art.id]: { ...draft, type: event.target.value as EditorialArticleUnitType, landingPagePurpose: event.target.value === "landing_page" ? draft.landingPagePurpose : "unknown" } }))} className="rounded border border-slate-800 bg-[#06070a] px-2 py-1.5 text-[10px] font-normal normal-case text-slate-200 outline-none focus:border-cyan-700">{(Object.keys(EDITORIAL_UNIT_LABELS) as EditorialArticleUnitType[]).map(type => <option key={type} value={type}>{EDITORIAL_UNIT_LABELS[type]}</option>)}</select></label>
                                  {draft.type === "landing_page" && <label className="flex flex-col gap-1 text-[8px] font-bold uppercase tracking-wider text-slate-500">Finalidade da landing<select value={draft.landingPagePurpose} onChange={event => setUnitDrafts(previous => ({ ...previous, [art.id]: { ...draft, landingPagePurpose: event.target.value as LandingPagePurpose } }))} className="rounded border border-slate-800 bg-[#06070a] px-2 py-1.5 text-[10px] font-normal normal-case text-slate-200 outline-none focus:border-cyan-700">{(Object.keys(LANDING_PURPOSE_LABELS) as LandingPagePurpose[]).map(purpose => <option key={purpose} value={purpose}>{LANDING_PURPOSE_LABELS[purpose]}</option>)}</select></label>}
                                  <div className="text-[9px] text-slate-400"><p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">Evidências</p><p className="mt-1">{evidence?.urlPath ? `URL ${evidence.urlPath}` : "URL não recebida"}</p><p>{evidence?.h1 || evidence?.title || evidence?.contentSignals?.join(" · ") || "Nenhum sinal textual recebido"}</p></div>
                                  <div className="text-[9px] text-slate-400"><p className="text-[8px] font-bold uppercase tracking-wider text-slate-500">Fonte</p><p className="mt-1">{suggestion.source} · confiança {suggestion.confidence !== undefined ? `${Math.round(suggestion.confidence * 100)}%` : "não recebida"}</p><p className="text-slate-500">KGR, intenção e publicação continuam vindos do KeywordDNA.</p></div>
                                </div>
                                <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-slate-800/70 pt-2"><button type="button" onClick={() => void handleEditorialUnitDecision(art, { type: draft.type, landingPagePurpose: draft.landingPagePurpose, status: draft.type === "other" ? "unknown" : "human_confirmed" })} className="rounded border border-emerald-900/70 px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider text-emerald-300 hover:border-emerald-700">Confirmar tipo</button><button type="button" onClick={() => void handleEditorialUnitDecision(art, { type: draft.type, landingPagePurpose: draft.landingPagePurpose, status: "conflict" })} className="rounded border border-rose-900/70 px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider text-rose-300 hover:border-rose-700">Marcar conflito</button><button type="button" onClick={() => void handleEditorialUnitDecision(art, { type: "other", status: "unknown" })} className="rounded border border-slate-800 px-2.5 py-1 text-[8px] font-bold uppercase tracking-wider text-slate-400 hover:border-slate-600">Manter desconhecido</button></div>
                                <div className="mt-3 rounded border border-indigo-900/50 bg-indigo-950/20 p-2 text-[9px] text-slate-300"><p className="font-bold uppercase tracking-wider text-indigo-300">Estratégia da validação</p>{articleDnaVersion.payload.serpStrategy ? <div className="mt-1 grid gap-1 sm:grid-cols-3"><span>Ciclo: {articleDnaVersion.payload.serpStrategy.lifecycleMode}</span><span>Competição: {articleDnaVersion.payload.serpStrategy.competitionStrategy}</span><span>Perfil: {articleDnaVersion.payload.serpStrategy.unitProfile}</span></div> : <p className="mt-1 text-slate-500">Estratégia não recebida nesta versão antiga; gerar uma nova classificação para projetá-la.</p>}</div>
                              </section>;
                            })()}
                            <ArticleDnaSummary
                              version={articleDnaVersion}
                              published={articleIdentityContext.publishedIdentityProtected && articleIdentityContext.principalProtected}
                            />
                            {art.isPublished && articleDnaVersion && !articleIdentityContext.principalProtected && (
                              <div className="mb-3 flex flex-wrap items-center justify-between gap-2 rounded border border-indigo-500/25 bg-indigo-500/[.04] p-2.5">
                                <p className="text-[8.5px] text-indigo-200/80">A principal ainda é candidata. Confirme a arquitetura para criar uma nova versão do ArticleDNA e mudar a próxima SERP para fortalecimento.</p>
                                <button onClick={() => void handleConfirmArticleArchitecture(art, primaryDrafts[art.id])} className="rounded border border-indigo-700 px-2 py-1 text-[8px] font-bold uppercase tracking-wider text-indigo-300 hover:border-indigo-500">Confirmar arquitetura</button>
                              </div>
                            )}
                            {renderSerpRecommendations(art)}

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

                                  {art.isPublished && (
                                    <div className="mb-2 rounded border border-amber-500/30 bg-amber-500/[.06] p-2.5">
                                      <p className="text-[8.5px] font-bold uppercase tracking-widest text-amber-300">{articleIdentityContext.principalProtected ? "KEYWORD PRINCIPAL PROTEGIDA" : "IDENTIDADE PUBLICADA PROTEGIDA"}</p>
                                      <p className="mt-1 text-[9px] leading-relaxed text-amber-100/80">{articleIdentityContext.principalProtected ? "A principal está confirmada; a SERP só fortalece o artigo ao redor dela." : "A URL está publicada, mas a principal ainda é candidata ou a arquitetura está pendente; a principal pode ser revisada na cópia de trabalho."}</p>
                                      <div className="mt-1 space-y-0.5 text-[8px] text-slate-500"><p>Modo: <span className="text-slate-300">{serpAssessmentModeLabel(articleIdentityContext.mode)}</span></p><p>URL publicada: <span className="text-slate-300">{publicationUrlFor(art) || "não recebida"}</span></p><p>Slug: <span className="text-slate-300">/{art.slug}</span> · Canonical: <span className="text-slate-300">{publicationCanonical || "não recebida"}</span></p></div>
                                      {articleIdentityContext.kgrIdentityProtected && <p className="mt-1 text-[8px] font-bold uppercase tracking-wider text-emerald-300">KGR confirmado · keyword principal e slug vinculados</p>}
                                    </div>
                                  )}

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
                                  {renderSerpRecommendationForKeyword(art, art.mainKeywordObj?.id, art.keywordPrincipal)}
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

                                                <td className="py-1 px-3 align-top"><div className="font-semibold text-slate-300">{sk.keyword}</div>{renderSerpRecommendationForKeyword(art, sk.id, sk.keyword)}</td>
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

      {/* Ações que dependem da seleção ficam sempre no rodapé, fora do scroll da planilha. */}
      {(selectedArticleIds.size > 0 || selectedSiloPageIds.size > 0) && (
        <footer className="flex shrink-0 items-center justify-between gap-3 overflow-x-auto border-t border-indigo-900/60 bg-[#0b0c10] px-3 py-2 shadow-2xl">
          {/* Contadores separados */}
          <div className="flex shrink-0 items-center gap-3">
            {selectedArticleIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="rounded bg-blue-600 px-2 py-0.5 text-[10px] font-bold text-white">{selectedArticleIds.size}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-slate-500">{selectedArticleIds.size === 1 ? "artigo selecionado" : "artigos selecionados"}</span>
              </div>
            )}
            {selectedSiloPageIds.size > 0 && (
              <div className="flex items-center gap-2">
                <span className="rounded bg-teal-600 px-2 py-0.5 text-[10px] font-bold text-white">{selectedSiloPageIds.size}</span>
                <span className="text-[9px] font-semibold uppercase tracking-wider text-teal-400">{selectedSiloPageIds.size === 1 ? "página de silo selecionada" : "páginas de silo selecionadas"}</span>
              </div>
            )}
          </div>

          {/* Ações contextuais */}
          <div className="flex shrink-0 items-center gap-2">
            {/* Status dropdown — funciona para artigos e SiloPages */}
            <label className="flex items-center gap-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-500">
              Status
              <select value={selectedStatusAction} onChange={event => void changeSelectedArticleStatus(event.target.value)} disabled={generatingStrategic}
                className="rounded border border-slate-800 bg-[#06070a] px-2 py-1.5 text-[10px] font-semibold normal-case text-slate-300 outline-none hover:border-indigo-700 disabled:opacity-40">
                <option value="" disabled>Mudar status…</option>
                <option value="awaiting_approval">Enviar para aprovação</option>
                <option value="approved">Aprovar propostas</option>
                <option value="sent_radar">Enviar aprovados ao Radar</option>
              </select>
            </label>

            {/* Ações exclusivas de artigos — só aparecem quando apenas artigos estão selecionados */}
            {selectedArticleIds.size > 0 && selectedSiloPageIds.size === 0 && (
              <>
                <button onClick={handleRevalidateStructure} disabled={generatingStrategic}
                  title="Revisar somente se cada keyword faz sentido no artigo atual; publicados e silos existentes têm prioridade"
                  className="flex items-center gap-1 rounded border border-violet-900/60 px-3 py-1.5 text-[10px] font-semibold text-violet-300 hover:border-violet-700 disabled:opacity-40">
                  {activeKeywordReviewTask ? <Loader2 className="h-3 w-3 animate-spin"/> : <Zap className="h-3 w-3"/>}
                  {activeKeywordReviewTask ? "Agrupando keywords…" : "Agrupar keywords em artigos (IA)"}
                </button>
                <button onClick={() => handlePipelineStep("Gerar DNA dos Artigos")} disabled={generatingStrategic} className="flex items-center gap-1 rounded border border-indigo-900/60 px-3 py-1.5 text-[10px] font-semibold text-indigo-300 hover:border-indigo-700 disabled:opacity-40">{activeArticleDnaTask ? <Loader2 className="h-3 w-3 animate-spin"/> : <Zap className="h-3 w-3"/>}{activeArticleDnaTask ? "Detectando ArticleDNA…" : "Detectar viés · ArticleDNA (IA)"}</button>
                <button onClick={() => handlePipelineStep("Gerar DNA dos Silos")} disabled={generatingStrategic} className="flex items-center gap-1 rounded border border-emerald-900/60 px-3 py-1.5 text-[10px] font-semibold text-emerald-300 hover:border-emerald-700 disabled:opacity-40">{activeSiloDnaTask ? <Loader2 className="h-3 w-3 animate-spin"/> : <Zap className="h-3 w-3"/>}{activeSiloDnaTask ? "Detectando SiloDNA…" : "Detectar viés · SiloDNA (IA)"}</button>
                <button onClick={openSerpPreview} disabled={generatingStrategic || serpBusy} className="flex items-center gap-1 rounded border border-cyan-900/60 px-3 py-1.5 text-[10px] font-semibold text-cyan-300 hover:border-cyan-700 disabled:opacity-40" title="Ação explícita: uma consulta textual por keyword selecionada">{serpBusy ? <Loader2 className="h-3 w-3 animate-spin"/> : <Search className="h-3 w-3"/>}Validar agrupamento pela SERP</button>
                <button onClick={handleDeleteSelectedNonPublished} className="flex items-center gap-1 rounded border border-rose-900/60 px-3 py-1.5 text-[10px] font-semibold text-rose-400 hover:border-rose-700"><Trash2 className="h-3 w-3"/>Apagar novos</button>
              </>
            )}

            {/* Ação exclusiva de SiloPage — só aparece quando apenas SiloPages estão selecionadas */}
            {selectedSiloPageIds.size > 0 && selectedArticleIds.size === 0 && (
              <button onClick={handleGenerateSelectedSiloPagesWithIA} disabled={generatingStrategic} className="flex items-center gap-1 rounded border border-teal-900/60 px-3 py-1.5 text-[10px] font-semibold text-teal-300 hover:border-teal-700 disabled:opacity-40" title="Detectar viés · Página do Silo (IA)">{activeSiloPageTask ? <Loader2 className="h-3 w-3 animate-spin"/> : <Zap className="h-3 w-3"/>}{activeSiloPageTask ? "Detectando Página…" : "Detectar viés · Página do Silo (IA)"}</button>
            )}

            {/* Ações de IA separadas quando ambos estão selecionados */}
            {selectedArticleIds.size > 0 && selectedSiloPageIds.size > 0 && (
              <>
                <button onClick={() => handlePipelineStep("Gerar DNA dos Artigos")} disabled={generatingStrategic} className="flex items-center gap-1 rounded border border-indigo-900/60 px-3 py-1.5 text-[10px] font-semibold text-indigo-300 hover:border-indigo-700 disabled:opacity-40">{activeArticleDnaTask ? <Loader2 className="h-3 w-3 animate-spin"/> : <Zap className="h-3 w-3"/>}ArticleDNA · {selectedArticleIds.size} artigo(s)</button>
                <button onClick={handleGenerateSelectedSiloPagesWithIA} disabled={generatingStrategic} className="flex items-center gap-1 rounded border border-teal-900/60 px-3 py-1.5 text-[10px] font-semibold text-teal-300 hover:border-teal-700 disabled:opacity-40">{activeSiloPageTask ? <Loader2 className="h-3 w-3 animate-spin"/> : <Zap className="h-3 w-3"/>}Página do Silo · {selectedSiloPageIds.size} página(s)</button>
              </>
            )}

            {/* Enviar ao Radar — sempre disponível */}
            <button onClick={sendSelectedToRadar} className="flex items-center gap-1 rounded border border-cyan-900/60 px-3 py-1.5 text-[10px] font-semibold text-cyan-300 hover:border-cyan-700"><ArrowRight className="h-3 w-3"/>Enviar ao Radar</button>
            <button onClick={() => { setSelectedArticleIds(new Set()); setSelectedSiloPageIds(new Set()); }} className="rounded border border-slate-800 px-3 py-1.5 text-[10px] text-slate-500 hover:text-slate-300">Limpar seleção</button>
          </div>
        </footer>
      )}

      {serpPreview && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-lg rounded border border-cyan-900/70 bg-[#0b0c10] shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-800 px-4 py-3"><div><p className="text-[10px] font-bold uppercase tracking-widest text-cyan-300">Validar agrupamento pela SERP</p><p className="mt-1 text-[9px] text-slate-500">Ação explícita · nenhuma consulta foi feita ainda</p></div><button onClick={() => setSerpPreview(null)} className="text-slate-500 hover:text-white"><X className="h-4 w-4"/></button></div>
            <div className="space-y-2 px-4 py-4 text-[10px] text-slate-300">
              <p><span className="text-slate-500">Artigos selecionados:</span> {serpPreview.groups.length}</p>
              <p><span className="text-slate-500">Keywords/consultas previstas:</span> {serpPreview.queryCount}</p>
              <p><span className="text-slate-500">Modo editorial:</span> {[...new Set(serpPreview.groups.map(group => serpAssessmentModeLabel(resolveArticleSerpIdentityContext({ published: Boolean(group.publishedAnchorId), principalKeywordId: group.principalSuggestion.keywordId, keywordUrlRelation: group.keywords.find(keyword => keyword.id === group.principalSuggestion.keywordId)?.keywordUrlRelation, architectureStatus: group.architectureStatus, kgrIdentity: group.kgrIdentity, slug: group.keywords.find(keyword => keyword.id === group.principalSuggestion.keywordId)?.slug_sugerido }).mode)))].join(" + ")}</p>
              <p><span className="text-slate-500">Coleta:</span> principal sempre consultada; no KGR confirmado, secundárias só entram se houver ambiguidade real. Cada consulta gera snapshot por resultado.</p>
              <p className="rounded border border-amber-900/50 bg-amber-950/20 p-2 text-amber-300">Aviso de crédito: esta ação acessa o provider SERP e pode consumir créditos. O Arquiteto não executará chamadas automáticas ou retries pagos.</p>
              <p className="text-slate-500">A resposta precisa conter a principal e as keywords efetivamente consultadas; toda a proveniência KeywordDNA permanece no assessment. O sucesso só ocorre depois da persistência local brand-scoped.</p>
            </div>
            <div className="flex justify-end gap-2 border-t border-slate-800 px-4 py-3"><button onClick={() => setSerpPreview(null)} disabled={serpBusy} className="rounded border border-slate-700 px-3 py-1.5 text-[10px] text-slate-400">Cancelar</button><button onClick={() => void confirmSerpValidation()} disabled={serpBusy} className="flex items-center gap-1 rounded border border-cyan-700 bg-cyan-950/30 px-3 py-1.5 text-[10px] font-semibold text-cyan-300 disabled:opacity-40">{serpBusy && <Loader2 className="h-3 w-3 animate-spin"/>}Confirmar validação SERP</button></div>
          </div>
        </div>
      )}

      <BackgroundTaskNotice tasks={architectTasks.slice(-4)} onDismiss={dismissBackgroundTask}/>

      <WorkflowImportDialog
        open={keywordImportOpen}
        title="Importar keywords aprovadas do Minerador"
        description="Todos os itens aprovados e publicados do Minerador aparecem aqui. Selecione os novos; itens sem silo entram como candidatos sem classificação, enquanto importados e publicados permanecem visíveis."
        rows={keywordImportPool}
        label={keyword => keyword.keyword}
        details={keyword => <span className="mt-1 block text-slate-500">{keyword.intent || "Intenção não informada"} · volume {keyword.volume_search || 0} · {keyword.siloName || "Sem silo/categoria"}</span>}
        disabled={keyword => keyword.status === "publicado" || effectiveImportedKeywordIdsForUi.has(keyword.id)}
        disabledReason={keyword => keyword.status === "publicado"
          ? "Publicado e já incorporado como âncora protegida"
          : "Já importado no Arquiteto"}
        status={keyword => keyword.status === "publicado" ? "published" : effectiveImportedKeywordIdsForUi.has(keyword.id) ? "sent_architect" : "approved"}
        loading={loadingKeywords}
        error={keywordImportError}
        onRetry={() => fetchMasterList()}
        onClose={() => setKeywordImportOpen(false)}
        onImport={importApprovedKeywords}
      />

      {dangerApproval && <DangerApprovalDialog open title={dangerApproval.title} description={dangerApproval.description}
        impact={dangerApproval.impact} verificationPhrase={dangerApproval.phrase} confirmLabel={dangerApproval.label}
        onCancel={() => setPendingDangerAction(null)} onConfirm={confirmDangerAction}/>}

      {isListModalOpen && (
        <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
          <div className="bg-[#0b0c10] border border-slate-800 w-full max-w-sm rounded shadow-2xl">
            <div className="px-4 py-3 border-b border-slate-800 flex items-center justify-between">
              <span className="font-bold text-[10px] text-white uppercase tracking-wider">Criar Novo Silo</span>
              <button onClick={() => setIsListModalOpen(false)} className="text-slate-500 hover:text-white cursor-pointer">
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleCreateList} className="p-4 flex flex-col gap-4">
              <section className="flex flex-col gap-3 rounded border border-indigo-900/50 bg-indigo-950/10 p-3">
                <div><p className="text-[9px] font-bold uppercase tracking-wider text-indigo-300">Estratégia do silo</p><p className="mt-1 text-[9px] text-slate-500">O nome e a entidade central definem o SiloDNA. A entidade não vira automaticamente keyword principal de artigo.</p></div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Nome do silo</label>
                  <input type="text" required placeholder="Ex: Captação de pacientes" value={newListName} onChange={e => setNewListName(e.target.value)} className="w-full bg-[#06070a] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-650 text-xs" />
                </div>
                <div className="flex flex-col gap-1">
                  <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Keyword ou entidade central</label>
                  <input type="text" required placeholder="Ex: captação de pacientes para clínicas" value={newListCentralEntity} onChange={e => setNewListCentralEntity(e.target.value)} className="w-full bg-[#06070a] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-indigo-650 text-xs" />
                  <p className="text-[8px] text-slate-600">Se existir uma KeywordDNA correspondente no Arquiteto, a referência real será preservada. Caso contrário, será apenas entidade manual.</p>
                </div>
              </section>
              <section className="flex flex-col gap-3 rounded border border-teal-900/50 bg-teal-950/10 p-3">
                <div><p className="text-[9px] font-bold uppercase tracking-wider text-teal-300">Página do silo</p><p className="mt-1 text-[9px] text-slate-500">SiloDNA e SiloPage têm versões e aprovações independentes.</p></div>
                <label className="flex items-center gap-2 text-[10px] text-slate-300"><input type="checkbox" checked={createSiloPage} onChange={e => setCreateSiloPage(e.target.checked)} className="accent-teal-500" />Criar também a Página do Silo</label>
                {createSiloPage && <>
                  <div className="flex flex-col gap-1">
                    <label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Slug</label>
                    <input type="text" required placeholder="/captacao-de-pacientes" value={newSiloPageSlug} onChange={e => setNewSiloPageSlug(e.target.value)} className="w-full bg-[#06070a] border border-slate-800 rounded px-2.5 py-1.5 font-mono text-slate-200 focus:outline-none focus:border-teal-650 text-xs" />
                    <p className="text-[8px] text-slate-600">Use o caminho iniciado por `/`. URL completa não é aceita neste campo.</p>
                  </div>
                  <div className="flex flex-col gap-1">
                    <span className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">Situação de publicação</span>
                    <div className="flex gap-3 text-[10px] text-slate-300"><label className="flex items-center gap-1.5"><input type="radio" name="silo-publication-status" checked={newSiloPagePublicationStatus === "new"} onChange={() => setNewSiloPagePublicationStatus("new")} className="accent-teal-500" />Novo</label><label className="flex items-center gap-1.5"><input type="radio" name="silo-publication-status" checked={newSiloPagePublicationStatus === "published"} onChange={() => setNewSiloPagePublicationStatus("published")} className="accent-teal-500" />Publicado</label></div>
                  </div>
                  {newSiloPagePublicationStatus === "published" && <div className="flex flex-col gap-1"><label className="text-[9px] font-bold text-slate-500 uppercase tracking-wider">URL publicada</label><input type="url" required placeholder="https://site.com/captacao-de-pacientes" value={newSiloPagePublishedUrl} onChange={e => setNewSiloPagePublishedUrl(e.target.value)} className="w-full bg-[#06070a] border border-slate-800 rounded px-2.5 py-1.5 text-slate-200 focus:outline-none focus:border-teal-650 text-xs" /><p className="text-[8px] text-amber-400">A URL será preservada e iniciará como Não verificada. Nenhuma confirmação online será inferida.</p></div>}
                </>}
              </section>
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
