import {
  countSubjectAnchors,
  planSubjectAttachment,
  readArchitectSubjectStanding,
  resolveAttachedSubjectStanding,
  subjectTrunkLabel,
  SUBJECT_ANOTHER_ATTACHED_REASON,
  SUBJECT_AWAITING_SUPPORT_LABEL,
  type ArchitectSubjectStanding,
  type AttachedSubjectStanding,
  type SubjectAnchorCarrier,
} from "../../lib/arquiteto/declared-subject.ts";
import type { DeclaredSubject, EditorialArticleUnitType } from "../../lib/arquiteto/contracts.ts";
import { newFormationRef, type FormationKeywordLike, type FormationPatch } from "../../lib/arquiteto/article-formation-editing.ts";
import { MAX_ARTICLE_KEYWORDS, suggestPrincipal, type ArticleFormationKeyword } from "../../lib/arquiteto/article-formation.ts";

/**
 * O ASSUNTO NA TELA DO ARQUITETO — regras puras (SDD 2026-09-24, F2.2 a F2.4).
 *
 * Aqui não há React, rede nem armazenamento: só o que a tela decide sozinha e
 * precisa ser igual toda vez. Quem decide o Assunto é o domínio
 * (`lib/arquiteto/declared-subject.ts`); este módulo só monta o que a mesa
 * mostra a partir das respostas dele.
 */

type SubjectRow = Record<string, unknown>;

/** A SERP da frase é opcional e mora no Minerador (P7, F2.4 passo 4). */
export const SUBJECT_PHRASE_SERP_HINT =
  "A SERP da frase do Assunto é opcional. Se quiser medi-la, use Resultados no Processador do Minerador: a medição entra no pacote aprovado e passa a valer aqui. O Arquiteto não faz chamada paga para a frase.";

/** A principal sai entre as marcadas, pela regra de sempre (F2.4 passo 2, D1). */
export const SUBJECT_SUPPORT_PRINCIPAL_HINT =
  "A principal sai entre as keywords marcadas, pela regra de sempre (publicada, centralidade, volume). O Assunto fica como tronco: não vira principal nem dá o slug.";

/** O vínculo da formação sem Definição fica gravado na cópia de trabalho (item da principal). */
export const SUBJECT_WORKING_ANCHOR_NOTE =
  "Preso na formação e gravado na cópia de trabalho. Vai para a Definição do artigo quando a formação for concluída.";

/** Prender numa Definição já gravada cria versão nova; a aprovada fica no histórico. */
export const SUBJECT_VERSION_NOTE =
  "Prender ou soltar numa Definição do artigo já gravada cria uma versão nova, em revisão. A versão aprovada continua no histórico; o Radar recebe o Assunto quando a formação for concluída de novo.";

/** O Silo com página consolidada não recebe versão nova por aqui. */
export const SUBJECT_SILO_PAGE_GUARD =
  "Este Silo já tem página consolidada ligada à versão atual da Arquitetura do silo. Prender o Assunto aqui criaria outra versão e desalinharia a página; isso fica para a consolidação do Silo.";

/** Uma unidade tem um Assunto só (D3): o mesmo texto da recusa do domínio. */
export const SUBJECT_ONE_PER_UNIT = SUBJECT_ANOTHER_ATTACHED_REASON;

/** Prender em Silo: o que a sugestão alcança hoje. */
export const SUBJECT_SILO_SCOPE_NOTE =
  "O Assunto do Silo vira sugestão para os artigos dele, e cada artigo confirma. Silo com página consolidada fica de fora: a consolidação do Silo ainda não carrega o Assunto.";

/** Definição gravada que o cenário atual não descreve mais (acervo). */
export const SUBJECT_LEGACY_DEFINITION_NOTE =
  "Definição do artigo fora do cenário atual. O Assunto continua preso nela até alguém soltá-lo.";

/** Sustentação sem Silo confirmado não forma artigo (WITHOUT_SILO). */
export const SUBJECT_SUPPORT_WITHOUT_SILO =
  "Sem Silo confirmado: confirme o Silo desta keyword antes de formar o artigo.";

export const SUBJECT_WITHDRAWN_LABEL = "Assunto retirado no Minerador" as const;

const UNIT_LABELS: Record<EditorialArticleUnitType, string> = {
  article: "Artigo",
  service_page: "Página de serviço",
  landing_page: "Landing page",
  category_page: "Página de categoria",
  other: "Outra unidade",
};

/** Nome da unidade do ArticleDNA na tela. Sem tipo declarado, é artigo. */
export function subjectUnitLabel(type: EditorialArticleUnitType | null | undefined): string {
  return type && type in UNIT_LABELS ? UNIT_LABELS[type] : UNIT_LABELS.article;
}

/** O que a mesa sabe do Assunto de cada keyword, lido uma vez pelo domínio. */
export function readSubjectStandings(keywords: readonly SubjectRow[]): Map<string, ArchitectSubjectStanding> {
  const mapa = new Map<string, ArchitectSubjectStanding>();
  for (const keyword of keywords) {
    const id = String(keyword.id ?? "");
    if (!id) continue;
    mapa.set(id, readArchitectSubjectStanding(keyword));
  }
  return mapa;
}

/** Os Assuntos declarados sem Volume validado: fora da formação automática. */
export function heldOutSubjectIds(standings: ReadonlyMap<string, ArchitectSubjectStanding>): Set<string> {
  const ids = new Set<string>();
  for (const standing of standings.values()) {
    if (standing.heldOutOfFormation) ids.add(standing.keywordId);
  }
  return ids;
}

/**
 * Os troncos da cópia de trabalho que ainda não viraram Definição do artigo.
 *
 * Só vale o vínculo cujo `candidateRef` existe no cenário de agora: o ref de
 * candidato calculado muda quando a principal muda, e uma formação desfeita
 * some. Vínculo velho não ancora nada — o Assunto volta a "aguardando
 * sustentação" em vez de virar "tronco" sem artigo. O que já tem Definição
 * responde por ela, nunca pelos dois lados.
 */
export function workingSubjectCarriers(input: {
  workingAnchors: ReadonlyMap<string, string>;
  materializedRefs: ReadonlySet<string>;
  /** `candidateRef` vivo → principal do candidato. */
  liveCandidates: ReadonlyMap<string, string>;
}): SubjectAnchorCarrier[] {
  const carriers: SubjectAnchorCarrier[] = [];
  for (const [ref, subjectKeywordId] of input.workingAnchors) {
    if (input.materializedRefs.has(ref) || !input.liveCandidates.has(ref)) continue;
    carriers.push({ subjectKeywordId, principalKeywordId: input.liveCandidates.get(ref) ?? null });
  }
  return carriers;
}

/** Só os vínculos da sessão cujo candidato existe agora. */
export function liveWorkingSubjectAnchors(input: {
  workingAnchors: ReadonlyMap<string, string>;
  liveCandidates: ReadonlyMap<string, string>;
}): Map<string, string> {
  return new Map([...input.workingAnchors].filter(([ref]) => input.liveCandidates.has(ref)));
}

/**
 * Um plano de formação gravado muda o `candidateRef` do artigo (o candidato
 * calculado ganha `article-formation:` na primeira decisão humana; juntar leva
 * a direita para o ref da esquerda). O vínculo da sessão acompanha o artigo:
 * vai para o ref que recebe a MAIORIA dos membros de antes, e no empate para o
 * ref da principal de antes. Membro sem patch fica no ref de antes.
 *
 * Nunca troca Assunto: se o destino já tem outro Assunto, ou está reservado
 * a um Assunto que a própria ação vai prender (`reservedRefs`), o vínculo não
 * se move e deixa de valer (o Assunto volta a "aguardando sustentação").
 */
export function migrateWorkingSubjectAnchors(input: {
  anchors: ReadonlyMap<string, string>;
  /** Candidatos ANTES do plano. */
  candidates: readonly { candidateRef: string; principalKeywordId: string; keywordIds: readonly string[] }[];
  patches: readonly { keywordId: string; assignment: { articleFormationRef: string } }[];
  reservedRefs?: ReadonlySet<string>;
}): Map<string, string> {
  const destino = new Map(input.patches.map(patch => [patch.keywordId, patch.assignment.articleFormationRef]));
  const porRef = new Map(input.candidates.map(candidate => [candidate.candidateRef, candidate]));
  const saida = new Map(input.anchors);
  for (const [ref, subjectKeywordId] of input.anchors) {
    const candidato = porRef.get(ref);
    if (!candidato || !candidato.keywordIds.length) continue;
    const contagem = new Map<string, number>();
    for (const keywordId of candidato.keywordIds) {
      const para = destino.get(keywordId) ?? ref;
      contagem.set(para, (contagem.get(para) || 0) + 1);
    }
    const maior = Math.max(...contagem.values());
    const lideres = [...contagem.entries()].filter(([, total]) => total === maior).map(([para]) => para);
    const novo = lideres.length === 1 ? lideres[0] : destino.get(candidato.principalKeywordId) ?? ref;
    if (novo === ref || input.reservedRefs?.has(novo)) continue;
    const ocupado = saida.get(novo);
    if (ocupado && ocupado !== subjectKeywordId) continue;
    saida.delete(ref);
    saida.set(novo, subjectKeywordId);
  }
  return saida;
}

/**
 * O território de cada Silo com Assunto, para sugerir o mesmo Assunto aos
 * artigos dele (F2.4 passo 6).
 *
 * A Arquitetura do silo consolidada declara `territoryRef`. A que nasce pela
 * revisão de Silos não declara: o território sai dos artigos que ela
 * referencia, e só quando todos apontam para o mesmo — território ambíguo
 * não recebe sugestão.
 */
export function siloSubjectTerritories(input: {
  silos: readonly {
    siloId: string;
    name?: string | null;
    territoryRef?: string | null;
    articleReferences?: readonly { articleId: string }[];
    subject?: DeclaredSubject | null;
  }[];
  articleTerritoryOf: (articleId: string) => string | null;
}): Map<string, { siloId: string; name: string | null; subject: DeclaredSubject }> {
  const mapa = new Map<string, { siloId: string; name: string | null; subject: DeclaredSubject }>();
  for (const silo of input.silos) {
    if (!silo.subject) continue;
    let territorio = silo.territoryRef || null;
    if (!territorio) {
      const territorios = new Set((silo.articleReferences || []).map(reference => input.articleTerritoryOf(reference.articleId)));
      territorio = territorios.size === 1 ? [...territorios][0] : null;
    }
    if (!territorio || mapa.has(territorio)) continue;
    mapa.set(territorio, { siloId: silo.siloId, name: silo.name ?? null, subject: silo.subject });
  }
  return mapa;
}

export type SubjectFilterEntry = {
  keywordId: string;
  phrase: string;
  note: string | null;
  destinationUrl: string | null;
  volumeValidated: boolean;
  /** Em quantos artigos o Assunto é tronco. */
  articleCount: number;
  /** "Assunto · tronco de N artigos", "aguardando sustentação" ou "retirado". */
  label: string;
  /** Declarado no pacote, recebido e com pacote aprovado: pode ser preso. */
  attachable: boolean;
  /** Preso em algum artigo, mas o pacote atual não declara mais. */
  withdrawn: boolean;
};

/**
 * O filtro "Assuntos" da mesa: cada Assunto recebido, com a contagem de
 * artigos que ele sustenta. Um Assunto retirado no Minerador que continua
 * preso em algum artigo continua listado, para o humano decidir soltar.
 */
export function buildSubjectFilterEntries(input: {
  brandId: string;
  standings: ReadonlyMap<string, ArchitectSubjectStanding>;
  anchors: readonly SubjectAnchorCarrier[];
}): SubjectFilterEntry[] {
  const entries: SubjectFilterEntry[] = [];
  for (const standing of input.standings.values()) {
    if (standing.brandId !== input.brandId) continue;
    const articleCount = countSubjectAnchors(standing.keywordId, input.anchors);
    const declaredHere = standing.declared && standing.received;
    if (!declaredHere && articleCount === 0) continue;
    const withdrawn = !standing.declared && articleCount > 0;
    entries.push({
      keywordId: standing.keywordId,
      phrase: standing.phrase || standing.keywordId,
      note: standing.note,
      destinationUrl: standing.destinationUrl,
      volumeValidated: standing.volumeValidated,
      articleCount,
      label: withdrawn ? SUBJECT_WITHDRAWN_LABEL : articleCount > 0 ? subjectTrunkLabel(articleCount) : SUBJECT_AWAITING_SUPPORT_LABEL,
      attachable: declaredHere && standing.approvedPackageRef !== null,
      withdrawn,
    });
  }
  return entries.sort((left, right) =>
    left.phrase.localeCompare(right.phrase, "pt-BR") || (left.keywordId < right.keywordId ? -1 : left.keywordId > right.keywordId ? 1 : 0));
}

/** Filtra a lista da mesa pelo Assunto escolhido. Sem filtro, a lista volta intacta. */
export function filterBySubject<T>(items: readonly T[], subjectKeywordId: string | null, anchorOf: (item: T) => string | null): T[] {
  if (!subjectKeywordId) return [...items];
  return items.filter(item => anchorOf(item) === subjectKeywordId);
}

export type SubjectAttachTargetInput = {
  ref: string;
  kind: "article" | "silo";
  label: string;
  unitType?: EditorialArticleUnitType | null;
  principalKeywordId: string | null;
  keywords?: readonly { keywordId: string; role: string }[];
  excludedSubjects?: readonly string[];
  /** O Assunto preso hoje, se houver. */
  currentSubjectKeywordId: string | null;
  /** Recusa da própria tela, antes do domínio (ex.: Silo com página consolidada). */
  blockedReason?: string | null;
  /** Tem Definição gravada: prender cria versão nova. Sem ela, é a formação desta sessão. */
  persisted: boolean;
};

export type SubjectAttachOption = {
  ref: string;
  kind: "article" | "silo";
  label: string;
  unitLabel: string;
  persisted: boolean;
  alreadyAttached: boolean;
  /** Motivo em uma frase quando não pode prender; `null` quando pode. */
  refusal: string | null;
};

/**
 * Para cada unidade, se o Assunto pode ser preso nela e, se não, por quê.
 * A resposta é a do domínio (`planSubjectAttachment`); a tela só a mostra.
 */
export function subjectAttachOptions(input: {
  brandId: string;
  subjectKeyword: SubjectRow;
  actorUserId: string | null;
  attachedAt: string;
  targets: readonly SubjectAttachTargetInput[];
}): SubjectAttachOption[] {
  const subjectId = String(input.subjectKeyword.id ?? "");
  return input.targets.map(target => {
    const base = {
      ref: target.ref,
      kind: target.kind,
      label: target.label,
      unitLabel: target.kind === "silo" ? "Silo" : subjectUnitLabel(target.unitType),
      persisted: target.persisted,
    };
    if (target.currentSubjectKeywordId === subjectId) return { ...base, alreadyAttached: true, refusal: null };
    if (target.currentSubjectKeywordId) return { ...base, alreadyAttached: false, refusal: SUBJECT_ONE_PER_UNIT };
    if (target.blockedReason) return { ...base, alreadyAttached: false, refusal: target.blockedReason };
    const plan = planSubjectAttachment({
      brandId: input.brandId,
      keyword: input.subjectKeyword,
      actorUserId: input.actorUserId ?? "",
      attachedAt: input.attachedAt,
      target: target.kind === "article"
        ? { principalKeywordId: target.principalKeywordId, keywords: target.keywords, excludedSubjects: target.excludedSubjects }
        : null,
    });
    return { ...base, alreadyAttached: false, refusal: plan.ok ? null : plan.reason };
  });
}

/**
 * O aviso do Assunto preso: com snapshot (Definição gravada), pelo domínio;
 * sem snapshot (formação desta sessão), pela declaração atual do pacote.
 * O aviso nunca solta nem troca nada.
 */
export function attachedSubjectWarning(input: {
  subject: DeclaredSubject | null;
  subjectKeywordId: string;
  keyword: SubjectRow | null | undefined;
}): AttachedSubjectStanding {
  if (input.subject) return resolveAttachedSubjectStanding({ subject: input.subject, keyword: input.keyword });
  if (!input.keyword) {
    return { state: "not_in_mesa", warning: "A keyword deste Assunto não está mais na mesa do Arquiteto. Solte o Assunto antes de concluir a formação." };
  }
  const standing = readArchitectSubjectStanding(input.keyword);
  if (!standing.declared) {
    return {
      state: "withdrawn",
      warning: `O Minerador retirou a declaração do Assunto "${standing.phrase || input.subjectKeywordId}". Solte o Assunto: sem a declaração ele não vai para a Definição do artigo.`,
    };
  }
  return { state: "current", warning: null };
}

export type SupportFormationRefusalCode =
  | "NONE_MARKED"
  | "OVER_CEILING"
  | "SUBJECT_MARKED"
  | "ALREADY_IN_ARTICLE"
  | "WITHOUT_SILO"
  | "NOT_SAME_SILO"
  | "NO_ELIGIBLE_PRINCIPAL"
  | "WITHOUT_WORKFLOW_ITEM";

export type SupportFormationPlan =
  | {
    ok: true;
    formationRef: string;
    siloRef: string;
    principalKeywordId: string;
    principalReasons: string[];
    patches: FormationPatch[];
  }
  | { ok: false; code: SupportFormationRefusalCode; reason: string };

const refuseSupport = (code: SupportFormationRefusalCode, reason: string): SupportFormationPlan => ({ ok: false, code, reason });

/**
 * O artigo novo em torno do Assunto, a partir das sustentações que o humano
 * marcou (F2.4 passo 2). Puro: devolve os patches da cópia de trabalho, pelo
 * mesmo formato das outras edições da formação.
 *
 * A principal sai ENTRE as marcadas por `suggestPrincipal`, a regra da
 * formação. O Assunto nunca é marcado nem vira membro: ele é o tronco, preso
 * ao artigo depois, fora de `clusterId` e do teto.
 */
export function planSubjectSupportFormation(input: {
  subjectKeywordId: string;
  marked: readonly ArticleFormationKeyword[];
  siloRefOf: (keywordId: string) => string | null;
  keywords: readonly FormationKeywordLike[];
  memberKeywordIds?: ReadonlySet<string>;
  siloTokens?: ReadonlySet<string>;
  mintUuid: string;
  decidedAt: string;
}): SupportFormationPlan {
  const marked = [...new Map(input.marked.map(keyword => [keyword.keywordId, keyword])).values()];
  if (!marked.length) return refuseSupport("NONE_MARKED", "Marque pelo menos uma keyword de sustentação.");
  if (marked.length > MAX_ARTICLE_KEYWORDS) {
    return refuseSupport("OVER_CEILING", `Um artigo reúne no máximo ${MAX_ARTICLE_KEYWORDS} keywords; ${marked.length} foram marcadas.`);
  }
  if (marked.some(keyword => keyword.keywordId === input.subjectKeywordId)) {
    return refuseSupport("SUBJECT_MARKED", "O Assunto é o tronco do artigo e não entra como keyword de sustentação.");
  }
  const jaEmArtigo = marked.filter(keyword => input.memberKeywordIds?.has(keyword.keywordId));
  if (jaEmArtigo.length) {
    return refuseSupport("ALREADY_IN_ARTICLE", `${jaEmArtigo.map(keyword => `"${keyword.keyword}"`).join(", ")} já está em artigo decidido. Mova pela revisão da formação.`);
  }
  const silos = new Set(marked.map(keyword => input.siloRefOf(keyword.keywordId)));
  if (silos.has(null)) {
    return refuseSupport("WITHOUT_SILO", "Toda keyword de sustentação precisa estar num Silo confirmado antes de formar o artigo.");
  }
  if (silos.size > 1) {
    return refuseSupport("NOT_SAME_SILO", "As keywords de sustentação precisam estar no mesmo Silo: um artigo não atravessa Silos.");
  }
  const siloRef = [...silos][0] as string;

  const elegiveis = marked.filter(keyword => !keyword.subjectHeldOut);
  const principal = suggestPrincipal({ keywords: elegiveis, siloTokens: input.siloTokens });
  if (!principal) {
    return refuseSupport("NO_ELIGIBLE_PRINCIPAL", "Nenhuma keyword marcada pode ser principal: marque pelo menos uma com Volume validado.");
  }

  const formationRef = newFormationRef(input.mintUuid);
  const patches: FormationPatch[] = [];
  for (const keyword of marked) {
    const item = input.keywords.find(entry => entry.keywordId === keyword.keywordId);
    if (!item) {
      return refuseSupport("WITHOUT_WORKFLOW_ITEM", `"${keyword.keyword}" não tem item canônico no Arquiteto para receber a decisão.`);
    }
    patches.push({
      workflowItemId: item.workflowItemId,
      expectedLock: item.lockVersion,
      keywordId: keyword.keywordId,
      assignment: {
        articleFormationRef: formationRef,
        articleFormationDecision: {
          operation: "merge",
          role: keyword.keywordId === principal.keywordId ? "principal" : "secundaria",
          reason: "sustentação do Assunto confirmada em revisão humana",
          source: "human",
          decidedAt: input.decidedAt,
        },
      },
    });
  }
  return { ok: true, formationRef, siloRef, principalKeywordId: principal.keywordId, principalReasons: principal.reasons, patches };
}
