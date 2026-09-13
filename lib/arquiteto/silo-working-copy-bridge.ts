import type { CanonicalSiloWorkingCopy } from "./canonical-workspace.ts";
import type { SiloWorkingCopy } from "./silo-formation.ts";
import type {
  HumanPillarSelection,
  SiloWorkingCopyExclusion,
  SiloWorkingCopyState,
} from "./silo-working-copy-record.ts";
import { SILO_WORKING_COPY_RPC_ERRORS } from "./silo-working-copy-record.ts";

/**
 * PONTE ENTRE A PROPOSTA LOCAL E A AUTORIDADE REMOTA.
 *
 * `formSiloWorkingCopies` continua produzindo a proposta inicial — é o que dá ao
 * humano algo para olhar antes de existir qualquer linha. Mas assim que existe
 * working copy REMOTA para o território, é ela que manda.
 *
 * Manter as duas como fonte deixaria a interface responder "qual é o Pilar?" de
 * dois jeitos, sem regra de desempate: a proposta local se reescreve a cada
 * `formSilosWorkingCopy` e a cada aplicação de IA, e a remota carrega a decisão
 * humana registrada. Elas não são a mesma coisa e não empatam.
 */

export const SILO_WORKING_COPY_AUTHORITY = ["REMOTE", "LOCAL_PROPOSAL"] as const;
export type SiloWorkingCopyAuthority = (typeof SILO_WORKING_COPY_AUTHORITY)[number];

export type AuthoritativeSiloWorkingCopy = {
  territoryRef: string;
  authority: SiloWorkingCopyAuthority;
  /** Presente somente quando a linha remota existe. */
  remote: CanonicalSiloWorkingCopy | null;
  /** Proposta local correspondente, quando houver. */
  proposal: SiloWorkingCopy | null;
  /** Só a linha remota tem lock; proposta não tem o que travar. */
  expectedLock: number | null;
  /** Depois da consolidação a WC vira leitura. */
  readOnly: boolean;
};

export type ResolveAuthoritativeInput = {
  remote: readonly CanonicalSiloWorkingCopy[];
  /** Propostas locais indexadas pelo território que as originou. */
  proposals: ReadonlyArray<{ territoryRef: string; proposal: SiloWorkingCopy }>;
  /** Territórios já consolidados — a WC deles não aceita mais edição. */
  consolidatedTerritoryRefs?: readonly string[];
};

/**
 * REMOTO VENCE. A proposta local só sobrevive enquanto não existe linha remota
 * para aquele território.
 */
export function resolveAuthoritativeSiloWorkingCopies(
  input: ResolveAuthoritativeInput,
): AuthoritativeSiloWorkingCopy[] {
  const consolidated = new Set(input.consolidatedTerritoryRefs || []);
  const proposalByTerritory = new Map(input.proposals.map(entry => [entry.territoryRef, entry.proposal]));
  const resolved: AuthoritativeSiloWorkingCopy[] = [];

  for (const remote of input.remote) {
    const territoryRef = remote.workingCopy.territoryRef;
    resolved.push({
      territoryRef,
      authority: "REMOTE",
      remote,
      proposal: proposalByTerritory.get(territoryRef) || null,
      expectedLock: remote.lockVersion,
      readOnly: consolidated.has(territoryRef),
    });
    proposalByTerritory.delete(territoryRef);
  }

  for (const [territoryRef, proposal] of proposalByTerritory) {
    resolved.push({
      territoryRef,
      authority: "LOCAL_PROPOSAL",
      remote: null,
      proposal,
      expectedLock: null,
      readOnly: consolidated.has(territoryRef),
    });
  }

  return resolved.sort((left, right) => left.territoryRef.localeCompare(right.territoryRef));
}

/**
 * Estado de CREATE derivado da proposta local.
 *
 * `workingCopyRef` fica de fora de propósito: o servidor o deriva do
 * territoryRef e recusa um draft que já o traga. `pillarSelection` nasce nula —
 * a sugestão da Lógica/IA vai para `pillarSuggestionArticleId`, e só decisão
 * humana preenche a seleção.
 */
export function draftSiloWorkingCopyFromProposal(input: {
  brandId: string;
  territoryRef: string;
  proposal: SiloWorkingCopy;
}): Omit<SiloWorkingCopyState, "workingCopyRef"> {
  const { proposal } = input;
  return {
    brandId: input.brandId,
    territoryRef: input.territoryRef,
    name: proposal.name,
    slug: proposal.slug,
    formationStatus: "draft",
    existingSiloId: proposal.existingSiloId,
    articleRefs: proposal.articleReferences.map(reference => ({
      articleId: reference.articleId,
      articleDnaVersionId: reference.articleDnaVersionId,
      articleDnaContentHash: reference.articleDnaContentHash,
    })),
    pillarSuggestionArticleId: proposal.pillarCandidateArticleId,
    pillarSelection: null,
    supportArticleIds: [...proposal.supportArticleIds],
    exclusions: [],
    reasons: [...proposal.reasons],
    conflicts: [...proposal.conflicts],
  };
}

/**
 * §1/§3 — A PROPOSTA RECONSTRUÍDA DO REMOTO.
 *
 * A homologação encontrou o fechamento canônico morrendo em
 * "A proposta local de skincare não está carregada": os 5 ArticleDNA já
 * existiam no servidor, o território estava confirmado, a working copy remota
 * tinha as referências — e mesmo assim a consolidação exigia um objeto que só
 * existe enquanto a aba Silos esteve aberta e ninguém deu F5.
 *
 * Isso é o inverso de `REMOTE_STATE_IS_AUTHORITY`. Com ArticleDNA canônico e
 * território confirmado, a arquitetura do Silo é DERIVÁVEL — e derivá-la aqui
 * não inventa nada: cada campo abaixo vem da linha remota ou dos artefatos
 * canônicos, e o que não vem de lá fica vazio em vez de ser adivinhado.
 *
 * Esta é a inversa de `draftSiloWorkingCopyFromProposal`. As duas juntas
 * fecham o ciclo remoto → proposta → remoto sem passar por memória de sessão.
 */
export function proposalFromRemoteWorkingCopy(input: {
  remote: CanonicalSiloWorkingCopy;
  /** Versão canônica de cada ArticleDNA referenciado, por articleId. */
  articleVersionById: ReadonlyMap<string, { versionId: string; contentHash: string; keywordReferences?: readonly { keywordId: string; keywordDnaVersionId: string; keywordDnaContentHash: string }[] }>;
}): SiloWorkingCopy {
  const state = input.remote.workingCopy;
  /*
   * O Pilar é o DECIDIDO. A sugestão não promove ninguém — e sem decisão a
   * proposta sai sem Pilar, para o portão da consolidação recusar em vez de
   * consolidar sobre um palpite.
   */
  const pillarArticleId = state.pillarSelection?.articleId ?? null;
  const excluded = new Set(state.exclusions.map(exclusion => exclusion.articleId));
  const referencias = state.articleRefs.filter(reference => !excluded.has(reference.articleId));

  return {
    // A identidade da proposta é a do Silo canônico quando ele existe; sem ele,
    // o território — nunca um contador de sessão, que mudaria a cada boot.
    id: state.existingSiloId || state.territoryRef,
    brandId: state.brandId,
    name: state.name,
    slug: state.slug,
    formationStatus: "draft",
    source: state.existingSiloId
      ? "existing"
      : referencias.length > 1 ? "new_candidate" : "insufficient_architecture",
    existingSiloId: state.existingSiloId,
    articleReferences: referencias.map(reference => ({
      articleId: reference.articleId,
      articleDnaVersionId: reference.articleDnaVersionId,
      articleDnaContentHash: reference.articleDnaContentHash,
      keywordDnaReferences: (input.articleVersionById.get(reference.articleId)?.keywordReferences || [])
        .map(item => ({
          keywordId: item.keywordId,
          keywordDnaVersionId: item.keywordDnaVersionId,
          keywordDnaContentHash: item.keywordDnaContentHash,
        })),
      role: reference.articleId === pillarArticleId ? "pillar_candidate" : "support",
      rationale: reference.articleId === pillarArticleId
        ? "Pilar decidido, lido da working copy remota."
        : "Suporte derivado da composição remota do Silo.",
    })),
    pillarCandidateArticleId: pillarArticleId,
    supportArticleIds: deriveSupportArticleIds({
      articleIds: referencias.map(reference => reference.articleId),
      pillarArticleId,
      exclusions: state.exclusions,
    }),
    // Pontuações são artefato da heurística que propôs, não do que foi decidido.
    // Reconstruí-las aqui seria inventar números que ninguém calculou.
    pillarScores: [],
    reservedCandidateIds: [],
    reasons: [...state.reasons],
    conflicts: [...state.conflicts],
    siloPage: {
      siloPageId: `${state.territoryRef}:page`,
      slug: state.slug,
      distinctFromPillar: true,
      pillarArticleId: null,
      supportArticleIds: referencias
        .map(reference => reference.articleId)
        .filter(articleId => articleId !== pillarArticleId),
      collisionReasons: [],
    },
    publishedProtection: {
      protected: false,
      siloPageIds: [],
      articleIds: [],
      protectedFields: [],
    },
  };
}

/**
 * Decisão humana de Pilar, pronta para persistir.
 *
 * `decidedOverArticleIds` é a composição VIGENTE no momento do clique. Sem ela,
 * aprovar o Pilar sobre A/B/C e persistir sobre A/B/D passaria — e é justamente
 * essa troca silenciosa que o registro existe para pegar.
 */
export function humanPillarSelection(input: {
  articleId: string;
  actorUserId: string;
  decidedAt: string;
  reason: string;
  currentArticleIds: readonly string[];
}): HumanPillarSelection {
  return {
    articleId: input.articleId,
    actorUserId: input.actorUserId,
    decidedAt: input.decidedAt,
    reason: input.reason,
    decidedOverArticleIds: [...new Set(input.currentArticleIds)].sort(),
  };
}

export function humanExclusion(input: {
  articleId: string;
  actorUserId: string;
  decidedAt: string;
  reason: string;
}): SiloWorkingCopyExclusion {
  return {
    articleId: input.articleId,
    actorUserId: input.actorUserId,
    decidedAt: input.decidedAt,
    reason: input.reason,
  };
}

/**
 * Suportes derivados da composição menos o Pilar e menos os excluídos.
 * Um artigo não é Pilar e Suporte ao mesmo tempo, nem Suporte e excluído.
 */
export function deriveSupportArticleIds(input: {
  articleIds: readonly string[];
  pillarArticleId: string | null;
  exclusions: readonly SiloWorkingCopyExclusion[];
}): string[] {
  const excluded = new Set(input.exclusions.map(exclusion => exclusion.articleId));
  return [...new Set(input.articleIds)]
    .filter(articleId => articleId !== input.pillarArticleId && !excluded.has(articleId))
    .sort();
}

/* ----------------------------- concorrência ------------------------------ */

export const SILO_WORKING_COPY_UI_OUTCOMES = [
  "APPLIED",
  "CONFLICT_RELOAD_REQUIRED",
  "READ_ONLY_ALREADY_CONSOLIDATED",
  "FAILED",
] as const;
export type SiloWorkingCopyUiOutcome = (typeof SILO_WORKING_COPY_UI_OUTCOMES)[number];

const STALE_CODE = SILO_WORKING_COPY_RPC_ERRORS.find(code => code === "STALE_WORKING_COPY") || "STALE_WORKING_COPY";
const CONSUMED_CODE = SILO_WORKING_COPY_RPC_ERRORS.find(code => code === "WORKING_COPY_ALREADY_CONSUMED")
  || "WORKING_COPY_ALREADY_CONSUMED";

/**
 * Classifica a falha de uma escrita na WC.
 *
 * `STALE_WORKING_COPY` NÃO vira retry automático e NÃO sobrescreve: reenviar com
 * o lock novo aplicaria a edição por cima de uma decisão que o usuário nunca
 * viu. Ele recarrega o remoto e informa o conflito — a resolução é humana.
 *
 * `WORKING_COPY_ALREADY_CONSUMED` significa território consolidado: a partir daí
 * a WC é histórico, e a interface fica somente-leitura.
 */
export function classifySiloWorkingCopyFailure(error: unknown): {
  outcome: SiloWorkingCopyUiOutcome;
  code: string | null;
  reloadRemote: boolean;
  message: string;
} {
  const code = readErrorCode(error);
  if (code === STALE_CODE) {
    return {
      outcome: "CONFLICT_RELOAD_REQUIRED",
      code,
      reloadRemote: true,
      message: "A working copy de Silo mudou no servidor desde que esta tela a carregou. Recarregamos o estado remoto; revise e refaça a decisão.",
    };
  }
  if (code === CONSUMED_CODE) {
    return {
      outcome: "READ_ONLY_ALREADY_CONSOLIDATED",
      code,
      reloadRemote: true,
      message: "Este território já foi consolidado. A working copy virou histórico e não aceita mais edição.",
    };
  }
  return {
    outcome: "FAILED",
    code,
    reloadRemote: false,
    message: error instanceof Error ? error.message : "A edição da working copy de Silo não foi persistida.",
  };
}

function readErrorCode(error: unknown): string | null {
  if (!error || typeof error !== "object") return null;
  const candidate = error as { code?: unknown; message?: unknown };
  if (typeof candidate.code === "string" && candidate.code.trim()) return candidate.code.trim();
  // A mensagem da rota carrega o código de domínio como prefixo.
  const message = typeof candidate.message === "string" ? candidate.message : "";
  const matched = SILO_WORKING_COPY_RPC_ERRORS.find(code => message.includes(code));
  return matched || null;
}

/* --------------------- território de uma proposta local ------------------- */

export const PROPOSAL_TERRITORY_ISSUES = ["NO_TERRITORY", "AMBIGUOUS_TERRITORY"] as const;
export type ProposalTerritoryIssue = (typeof PROPOSAL_TERRITORY_ISSUES)[number];

/**
 * Território de uma proposta local, LIDO dos ArticleDNAs que a compõem.
 *
 * A proposta local não carrega território — ela nasce de agrupamento de
 * ArticleDNAs. O território vem de cada `ArticleDNA.territoryRef`, e só vale se
 * todos concordarem: dois territórios diferentes no mesmo grupo é ambiguidade,
 * não empate a ser resolvido escolhendo o primeiro.
 */
export function resolveProposalTerritoryRef(input: {
  articleIds: readonly string[];
  territoryRefByArticleId: ReadonlyMap<string, string | null | undefined>;
}): { territoryRef: string | null; issue: ProposalTerritoryIssue | null } {
  const refs = [...new Set(
    input.articleIds
      .map(articleId => input.territoryRefByArticleId.get(articleId))
      .filter((ref): ref is string => typeof ref === "string" && ref.length > 0),
  )];
  if (!refs.length) return { territoryRef: null, issue: "NO_TERRITORY" };
  if (refs.length > 1) return { territoryRef: null, issue: "AMBIGUOUS_TERRITORY" };
  return { territoryRef: refs[0], issue: null };
}

/**
 * Working copy de território já consolidado é HISTÓRICO.
 *
 * O sinal canônico é o Território, não a própria WC: `formationStatus` só tem
 * `draft` e `ready_for_review`, de propósito — duplicar o ciclo de vida da
 * consolidação nesta linha criaria duas fontes para o mesmo fato.
 */
export function siloWorkingCopyIsReadOnly(
  remote: Pick<CanonicalSiloWorkingCopy, "workingCopy">,
  consolidatedTerritoryRefs: readonly string[],
): boolean {
  return consolidatedTerritoryRefs.includes(remote.workingCopy.territoryRef);
}

/** Territórios cuja consolidação já ocorreu — a WC deles fica read-only. */
export const consolidatedTerritoryRefsOf = (
  territories: ReadonlyArray<{ territoryRef: string; territory: { lifecycleStatus: string } }>,
): string[] => territories
  .filter(item => item.territory.lifecycleStatus === "consolidated")
  .map(item => item.territoryRef);

/* ------------------ a identidade da SiloPage vem do Silo ------------------ */

/**
 * DE ONDE VEM O ENDEREÇO DA SILOPAGE.
 *
 * Nunca do primeiro Article da composição. O Article é conteúdo dentro do
 * Silo; deixar o endereço da raiz depender de qual artigo ficou em primeiro na
 * lista faz a identidade da estrutura mudar quando a ordem muda — e endereço
 * publicado não se troca depois.
 *
 * A ordem de prioridade é a do patrimônio: se existe página no ar, a SiloPage
 * ADOTA aquela identidade; se não existe, vale o slug que um humano aprovou
 * para o Silo; só então o nome do Silo vira endereço.
 */
export const SILO_IDENTITY_SOURCES = [
  "PUBLISHED_STRUCTURE",
  "APPROVED_TERRITORY_SLUG",
  "TERRITORY_NAME",
] as const;
export type SiloIdentitySource = (typeof SILO_IDENTITY_SOURCES)[number];

export type SiloWorkingCopyIdentity = {
  name: string;
  slug: string;
  source: SiloIdentitySource;
  /** Identidade publicada a preservar na consolidação, quando existe. */
  publishedSlug: string | null;
  publishedCanonical: string | null;
  protectedIdentity: boolean;
};

const normalizeSlug = (value: string): string => value
  .normalize("NFD")
  .replace(/[\u0300-\u036f]/g, "")
  .toLowerCase()
  .replace(/[^a-z0-9]+/g, "-")
  .replace(/^-+|-+$/g, "");

export function resolveSiloWorkingCopyIdentity(input: {
  territoryName: string | null;
  centralEntity: string | null;
  publishedSlug: string | null;
  publishedCanonical: string | null;
  confirmedSlug: string | null;
  proposedSlug: string | null;
}): SiloWorkingCopyIdentity {
  const name = (input.territoryName || input.centralEntity || "Silo sem nome").trim();

  if (input.publishedSlug) {
    return {
      name,
      slug: normalizeSlug(input.publishedSlug),
      source: "PUBLISHED_STRUCTURE",
      publishedSlug: input.publishedSlug,
      publishedCanonical: absolutePublishedUrl(input.publishedCanonical),
      protectedIdentity: true,
    };
  }

  const aprovado = input.confirmedSlug || input.proposedSlug;
  return {
    name,
    slug: normalizeSlug(aprovado || name) || "silo",
    source: aprovado ? "APPROVED_TERRITORY_SLUG" : "TERRITORY_NAME",
    publishedSlug: null,
    publishedCanonical: input.publishedCanonical,
    protectedIdentity: false,
  };
}

/** Reescreve nome e slug da proposta local com a identidade do Silo. */
export function applySiloIdentityToProposal(
  proposal: SiloWorkingCopy,
  identity: SiloWorkingCopyIdentity,
): SiloWorkingCopy {
  return {
    ...proposal,
    name: identity.name,
    slug: identity.slug,
    // A SiloPage compartilha o endereço da raiz; ela é o universo, não o Pilar.
    siloPage: { ...proposal.siloPage, slug: identity.slug },
    reasons: [...proposal.reasons, identityReason(identity)],
  };
}

function identityReason(identity: SiloWorkingCopyIdentity): string {
  if (identity.source === "PUBLISHED_STRUCTURE") {
    return `Identidade adotada da estrutura publicada (${identity.publishedSlug}); URL e canonical são preservados.`;
  }
  if (identity.source === "APPROVED_TERRITORY_SLUG") {
    return `Identidade vinda do slug aprovado do Silo (/${identity.slug}).`;
  }
  return `Identidade derivada do nome do Silo (/${identity.slug}); nenhum slug aprovado foi declarado.`;
}

/**
 * A URL absoluta de uma URL normalizada do catálogo do site.
 *
 * O catálogo guarda host e caminho sem esquema — é assim que ele compara
 * páginas. O contrato da SiloPage exige URL de verdade. Recolocar o `https://`
 * é derivação do que já está gravado, não invenção: host e caminho continuam
 * sendo exatamente os observados no site.
 */
export function absolutePublishedUrl(normalized: string | null | undefined): string | null {
  const limpo = (normalized || "").trim();
  if (!limpo) return null;
  return /^[a-z]+:\/\//i.test(limpo) ? limpo : `https://${limpo.replace(/^\/+/, "")}`;
}
