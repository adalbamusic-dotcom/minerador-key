/**
 * ===== PACOTE DE EVIDÊNCIA POR SEÇÃO · IA INTERNA (puro) =====
 *
 * SDD: docs/07-redator/propostas/sdd-leitor-evidencias-redator-2026-09-23.md
 * §4.4 ("IA interna") e §4.5 (guardas); adendo D1 e D9.
 *
 * A IA interna (seção e melhoria) recebia só o título, as instruções e os
 * blocos anteriores: nada do dossiê. Agora o SERVIDOR monta, a partir da
 * linha do documento, um pacote de no máximo 24 kB com:
 *
 *   - os fundamentos (guardas, o que o Redator não pode redefinir, contexto
 *     da keyword, projeção editorial do ArticleDNA, especialista, vídeo,
 *     conflitos, limitações e pendências do pacote);
 *   - as fatias ligadas à seção: perguntas, lacunas, entidades e afirmações
 *     de autoridade (claims e conflito mercado × fato), com as que casam com o
 *     título da seção na frente;
 *   - a lista das chaves que a IA pode citar ao apontar divergência.
 *
 * O servidor nunca confia em evidência vinda do navegador. Este módulo só
 * projeta, ordena e corta o que o servidor leu; não lê banco.
 */

import { z } from "zod";
import type { RadarEvidenceSource } from "../radar/evidence-authority.ts";
import {
  WRITER_EVIDENCE_GUARDS,
  truncateWriterThirdPartyText,
  writerEvidenceHierarchyOf,
  writerEvidenceJsonBytes,
} from "./writer-evidence-catalog.ts";

export const WRITER_SECTION_PACKAGE_MAX_BYTES = 24_576;

/**
 * AS SEÇÕES DO DOSSIÊ QUE O PACOTE LÊ, por caminho. Os seis primeiros são os
 * dos fundamentos (59.938 B medidos em 2026-09-23 no documento GOOGLE); os
 * quatro últimos são as fatias da seção — lacunas (15 kB), entidades (19 kB)
 * e as afirmações de autoridade, dentro de `authorityEvidence` (33 kB no
 * total medido). Nenhum passa de 36 kB; o maior do dossiê (1,4 MB) fica fora.
 */
export const WRITER_SECTION_BUNDLE_PATHS: ReadonlyArray<readonly string[]> = Object.freeze([
  ["conflicts"], ["limitations"], ["specialist"], ["video"], ["observed", "competitors"],
  ["observed", "questions"], ["observed", "gaps"], ["observed", "entities"],
  ["observed", "authorityEvidence", "claims"], ["observed", "authorityEvidence", "marketVsFactConflicts"],
]);

type Linha = Record<string, unknown>;

/** O que o servidor leu, cru, pela regra de parse do dono do documento. */
export type WriterSectionMaterial = {
  documentId: string;
  articleId: string;
  documentHash: string;
  writerMayNot: readonly string[];
  keywordContext: unknown;
  bundle: { bundleId: string; bundleHash: string; researchProfile: string; observedAt: string | null; serpAuthoritative: boolean | null } | null;
  article: { versionId: string; contentHash: string | null; fields: Linha } | null;
  /**
   * SDD do Assunto, F4.1 · as linhas que o envio gravou com Assunto (onde
   * virar, seção da virada, direção do H1, destino, alerta). Opcional: sem
   * elas, o pacote sai byte a byte como antes.
   */
  editorialContext?: readonly string[];
  pendingDecisions: readonly unknown[];
  /** Seções do dossiê pelo caminho pontuado de `WRITER_SECTION_BUNDLE_PATHS`. */
  sections: Readonly<Record<string, unknown>>;
  absent: ReadonlyArray<{ field: string; reason: string }>;
};

export type WriterSectionFocus = { kind: "section" | "improve"; id: string | null; label: string };

export type WriterSectionSource = { sourceKey: string; level: RadarEvidenceSource; frozen: boolean };

export type WriterSectionEvidencePackage = {
  kind: "writer_section_evidence";
  documentId: string;
  articleId: string;
  documentHash: string;
  focus: WriterSectionFocus;
  guards: readonly string[];
  howToUse: string;
  writerMayNot: readonly string[];
  keywordContext: unknown;
  article: { sourceKey: string; versionId: string; fields: Linha } | null;
  /** As linhas do Assunto gravadas no envio (F4.1). Ausente sem elas. */
  editorialContext?: string[];
  bundle: { bundleId: string; bundleHash: string; researchProfile: string; observedAt: string | null; serpAuthoritative: boolean | null } | null;
  sources: WriterSectionSource[];
  questions: Array<{ id: string | null; question: string; pages: number | null; status: string | null; declaredByArticle: boolean | null; matchesSection: boolean }>;
  gaps: Array<{ subject: string; against: string | null; pagesCovering: number | null; sampleSize: number | null; evidence: string | null; matchesSection: boolean }>;
  entities: { article: string[]; observed: Array<{ label: string; kind: string; pages: number | null; matchesSection: boolean }> };
  claims: Array<{ claimId: string | null; claim: string; claimType: string | null; ymyl: string | null; recurrence: string | null; confidence: string | null; matchesSection: boolean }>;
  marketVsFact: Array<{ claimId: string | null; claim: string; market: string | null; factual: string | null; impact: string | null; matchesSection: boolean }>;
  specialist: { preparedRequirements: number | null; notApproved: number | null; rejected: number | null; items: Array<Linha> } | null;
  video: { summary: unknown; results: Array<{ topic: string | null; state: string | null; relatedSectionTitle: string | null; extracts: number; matchesSection: boolean }> } | null;
  competitors: Array<{ title: string | null; domain: string | null; bestRank: number | null }>;
  conflicts: unknown[];
  limitations: unknown[];
  pendingDecisions: unknown[];
  absent: Array<{ field: string; reason: string }>;
  trimmed: Array<{ field: string; kept: number; total: number; readAt: string }>;
};

/* ============================ relevância ============================ */

const PALAVRAS_VAZIAS = new Set([
  "a", "o", "as", "os", "de", "da", "do", "das", "dos", "e", "em", "no", "na", "nos", "nas", "um", "uma", "uns", "umas",
  "para", "pra", "por", "com", "sem", "que", "como", "mais", "menos", "sobre", "ao", "aos", "se", "ou", "ser", "sao",
  "qual", "quais", "quando", "onde", "porque", "pode", "posso", "voce", "sua", "seu", "suas", "seus", "isso", "esse",
  "essa", "este", "esta", "entre", "ate", "tambem", "muito", "muita", "cada", "the", "and", "for", "with",
]);

const normalizar = (texto: string) => texto.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase("pt-BR");

/** As palavras que importam num título: sem acento, sem palavra vazia, com 3 letras ou mais — e números, que distinguem ("10 passos"). */
export function writerSectionTokens(texto: string): string[] {
  const vistos = new Set<string>();
  for (const parte of normalizar(texto).split(/[^a-z0-9]+/)) {
    if ((parte.length >= 3 || /^\d+$/.test(parte)) && !PALAVRAS_VAZIAS.has(parte)) vistos.add(parte);
  }
  return [...vistos];
}

/** Mesma palavra, ou plural/flexão curta: "oleosa" casa com "oleosas" e "oleos". */
const casam = (a: string, b: string) => a === b || (a.length >= 5 && b.length >= 5 && (a.startsWith(b.slice(0, 5)) && b.startsWith(a.slice(0, 5))));

/** Quantas palavras do título aparecem no texto do item. 0 = não casa com a seção. */
export function writerSectionScore(tokensDaSecao: readonly string[], ...textos: unknown[]): number {
  if (!tokensDaSecao.length) return 0;
  const doItem = writerSectionTokens(textos.filter((valor): valor is string => typeof valor === "string").join(" "));
  return tokensDaSecao.filter(token => doItem.some(outro => casam(token, outro))).length;
}

/* ============================ projeções ============================ */

const texto = (valor: unknown): string | null => (typeof valor === "string" && valor.trim() ? valor : null);
const numero = (valor: unknown): number | null => (typeof valor === "number" && Number.isFinite(valor) ? valor : null);
const registro = (valor: unknown): Linha | null => (valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Linha : null);
const lista = (valor: unknown): unknown[] => (Array.isArray(valor) ? valor : []);
const registros = (valor: unknown): Linha[] => lista(valor).map(registro).filter((item): item is Linha => Boolean(item));

const cortar = (valor: unknown, limite: number): string | null => {
  const linha = texto(valor);
  if (!linha) return null;
  const caracteres = [...linha];
  return caracteres.length > limite ? `${caracteres.slice(0, limite).join("")}…` : linha;
};

/** Ordena pela nota de relevância, estável pela ordem do Radar. */
function porRelevancia<T>(itens: T[], nota: (item: T) => number): Array<T & { matchesSection: boolean }> {
  return itens
    .map((item, indice) => ({ item, indice, pontos: nota(item) }))
    .sort((a, b) => b.pontos - a.pontos || a.indice - b.indice)
    .map(({ item, pontos }) => ({ ...item, matchesSection: pontos > 0 }));
}

/* ============================== corte ============================== */

const LIMITE_INICIAL = Object.freeze({
  questions: 30, gaps: 20, claims: 20, marketVsFact: 10, "entities.observed": 30, "entities.article": 30,
  competitors: 5, "video.results": 10, conflicts: 10, limitations: 10, pendingDecisions: 20, "specialist.items": 10,
});

/** As listas que podem ceder para caber em 24 kB, e a ordem de desempate. */
const CORTAVEIS = [
  "competitors", "video.results", "entities.observed", "marketVsFact", "conflicts", "limitations", "gaps", "claims",
  "entities.article", "pendingDecisions", "questions", "specialist.items",
] as const;
type Cortavel = (typeof CORTAVEIS)[number];

/** Só cedem na última fase: a especialista aceita, as pendências e os conflitos do pacote (invariante 27). */
const PROTEGIDAS_ATE_O_FIM: ReadonlySet<Cortavel> = new Set(["specialist.items", "pendingDecisions", "conflicts"]);

const ONDE_LER: Readonly<Record<Cortavel, string>> = Object.freeze({
  competitors: "radar.bundle.observed.competitors",
  "video.results": "radar.bundle.video",
  "entities.observed": "radar.bundle.observed.entities",
  "entities.article": "radar.bundle.observed.entities",
  marketVsFact: "radar.bundle.observed.authorityEvidence",
  claims: "radar.bundle.observed.authorityEvidence",
  gaps: "radar.bundle.observed.gaps",
  questions: "radar.bundle.observed.questions",
  conflicts: "radar.bundle.conflicts",
  limitations: "radar.bundle.limitations",
  pendingDecisions: "get_writer_document",
  "specialist.items": "radar.bundle.specialist",
});

function lerLista(pacote: Linha, caminho: string): unknown[] | null {
  const [topo, filho] = caminho.split(".");
  const alvo = filho ? registro(pacote[topo])?.[filho] : pacote[topo];
  return Array.isArray(alvo) ? alvo : null;
}

function gravarLista(pacote: Linha, caminho: string, valor: unknown[]): Linha {
  const [topo, filho] = caminho.split(".");
  if (!filho) return { ...pacote, [topo]: valor };
  return { ...pacote, [topo]: { ...(registro(pacote[topo]) ?? {}), [filho]: valor } };
}

/* ============================== montagem ============================== */

const COMO_USAR = [
  "Pacote de pesquisa do servidor, não matéria-prima para copiar.",
  "Hierarquia: especialista aceito > SERP vigente (só se o Radar a declarou) > outras evidências do Radar > hipótese do DNA.",
  "Confronte o DNA com a evidência: se ela contradiz ou não sustenta o DNA, não escreva contra ele em silêncio nem o redefina;",
  "devolva um alerta com targetKind, dnaClaimPath e evidenceSourceKey (uma das chaves de `sources`).",
  "Perguntas observadas orientam a cobertura dentro do texto; nunca viram seção de FAQ.",
].join(" ");

/**
 * MONTA O PACOTE, ≤ 24 kB. `null` só se nem os campos fixos couberem — o
 * chamador escreve sem pacote e declara a ausência.
 */
export function buildWriterSectionEvidencePackage(material: WriterSectionMaterial, focus: WriterSectionFocus): WriterSectionEvidencePackage | null {
  const tokens = writerSectionTokens(focus.label);
  const secao = (caminho: string) => material.sections[caminho];
  const autoritativa = material.bundle?.serpAuthoritative === true;
  const nivel = (caminho: string[]) => writerEvidenceHierarchyOf({ family: "radar.bundle", bundlePath: caminho, serpAuthoritative: autoritativa }).level;

  const perguntas = porRelevancia(registros(secao("observed.questions")), item =>
    writerSectionScore(tokens, item.canonicalQuestion, ...lista(item.variants), item.conceptLabel))
    .map(item => ({
      id: texto(item.id), question: cortar(item.canonicalQuestion, 240) ?? "", pages: numero(item.pages), status: texto(item.status),
      declaredByArticle: typeof item.declaredByArticle === "boolean" ? item.declaredByArticle : null, matchesSection: item.matchesSection,
    }))
    .filter(item => item.question);

  const lacunas = porRelevancia(registros(secao("observed.gaps")), item => writerSectionScore(tokens, item.subject, item.evidence))
    .map(item => ({
      subject: cortar(item.subject, 200) ?? "", against: texto(item.against), pagesCovering: numero(item.pagesCovering),
      sampleSize: numero(item.sampleSize), evidence: cortar(item.evidence, 300), matchesSection: item.matchesSection,
    }))
    .filter(item => item.subject);

  const entidadesCruas = registro(secao("observed.entities"));
  const observadas = porRelevancia(([
    ["shared", entidadesCruas?.shared], ["related", entidadesCruas?.related], ["marketOnly", entidadesCruas?.marketOnly],
  ] as const).flatMap(([kind, valor]) => registros(valor).map(item => ({ label: cortar(item.label, 120) ?? "", kind, pages: numero(item.pages) }))),
  item => writerSectionScore(tokens, item.label)).filter(item => item.label);
  const entidadesDoArtigo = lista(entidadesCruas?.article).map(item => cortar(item, 120)).filter((item): item is string => Boolean(item));

  const afirmacoes = porRelevancia(registros(secao("observed.authorityEvidence.claims")), item => writerSectionScore(tokens, item.canonicalClaim))
    .map(item => ({
      claimId: texto(item.claimId), claim: cortar(item.canonicalClaim, 300) ?? "", claimType: texto(item.claimType),
      ymyl: texto(registro(item.ymyl)?.relevance), recurrence: texto(registro(item.market)?.recurrence), confidence: texto(item.confidence),
      matchesSection: item.matchesSection,
    }))
    .filter(item => item.claim);

  const mercadoVersusFato = porRelevancia(registros(secao("observed.authorityEvidence.marketVsFactConflicts")), item =>
    writerSectionScore(tokens, item.canonicalClaim, item.marketObservation, item.factualPosition))
    .map(item => ({
      claimId: texto(item.claimId), claim: cortar(item.canonicalClaim, 300) ?? "", market: cortar(item.marketObservation, 300),
      factual: cortar(item.factualPosition, 300), impact: cortar(item.impact, 200), matchesSection: item.matchesSection,
    }))
    .filter(item => item.claim);

  const especialistaCru = registro(secao("specialist"));
  const especialista = especialistaCru ? {
    preparedRequirements: numero(especialistaCru.preparedRequirements),
    notApproved: numero(especialistaCru.notApproved),
    rejected: numero(especialistaCru.rejected),
    items: porRelevancia(registros(especialistaCru.items), item => writerSectionScore(tokens, item.requirementQuestion, item.extractedSummary, item.editorialUse))
      .map(item => ({
        requirementId: texto(item.requirementId), question: cortar(item.requirementQuestion, 300), summary: cortar(item.extractedSummary ?? item.originalText, 600),
        editorialUse: cortar(item.editorialUse, 300), quote: cortar(item.quote, 300), decision: texto(item.humanDecision),
        expert: texto(registro(item.expert)?.displayName), matchesSection: item.matchesSection,
      })),
  } : null;

  const videoCru = registro(secao("video"));
  const video = videoCru ? {
    summary: videoCru.summary ?? null,
    results: porRelevancia(registros(videoCru.results), item => writerSectionScore(tokens, item.topic, item.relatedSectionTitle))
      .map(item => ({
        topic: cortar(item.topic, 160), state: texto(item.state), relatedSectionTitle: cortar(item.relatedSectionTitle, 160),
        extracts: lista(item.extracts).length, matchesSection: item.matchesSection,
      })),
  } : null;

  const concorrentes = registros(secao("observed.competitors"))
    .map(item => {
      const posicoes = lista(item.ranks).map(posicao => numero(registro(posicao)?.rank)).filter((rank): rank is number => rank !== null);
      return { title: cortar(item.title, 120), domain: texto(item.domain), bestRank: posicoes.length ? Math.min(...posicoes) : null };
    })
    .sort((a, b) => (a.bestRank ?? Number.MAX_SAFE_INTEGER) - (b.bestRank ?? Number.MAX_SAFE_INTEGER));

  const fontes: WriterSectionSource[] = [];
  if (material.bundle) {
    const presentes: Array<[string, string[]]> = [
      ["observed.questions", ["observed", "questions"]], ["observed.gaps", ["observed", "gaps"]], ["observed.entities", ["observed", "entities"]],
      ["observed.authorityEvidence.claims", ["observed", "authorityEvidence"]], ["observed.competitors", ["observed", "competitors"]],
      ["specialist", ["specialist"]], ["video", ["video"]], ["conflicts", ["conflicts"]], ["limitations", ["limitations"]],
    ];
    for (const [lido, caminho] of presentes) {
      if (secao(lido) === undefined || secao(lido) === null) continue;
      fontes.push({ sourceKey: `radar.bundle.${caminho.join(".")}`, level: nivel(caminho), frozen: true });
    }
  }
  if (material.article) fontes.push({ sourceKey: `dna.article/${material.article.versionId}`, level: "ARTICLE_DNA_HYPOTHESIS", frozen: false });

  const conflitos = truncateWriterThirdPartyText(lista(secao("conflicts"))).value as unknown[];
  const limitacoes = truncateWriterThirdPartyText(lista(secao("limitations"))).value as unknown[];

  let pacote: Linha = {
    kind: "writer_section_evidence",
    documentId: material.documentId,
    articleId: material.articleId,
    documentHash: material.documentHash,
    focus: { kind: focus.kind, id: focus.id, label: cortar(focus.label, 300) ?? "" },
    guards: WRITER_EVIDENCE_GUARDS,
    howToUse: COMO_USAR,
    writerMayNot: [...material.writerMayNot],
    keywordContext: material.keywordContext ?? null,
    article: material.article ? { sourceKey: `dna.article/${material.article.versionId}`, versionId: material.article.versionId, fields: material.article.fields } : null,
    ...(material.editorialContext?.length ? { editorialContext: [...material.editorialContext] } : {}),
    bundle: material.bundle,
    sources: fontes,
    questions: perguntas,
    gaps: lacunas,
    entities: { article: entidadesDoArtigo, observed: observadas },
    claims: afirmacoes,
    marketVsFact: mercadoVersusFato,
    specialist: especialista,
    video,
    competitors: concorrentes,
    conflicts: conflitos,
    limitations: limitacoes,
    pendingDecisions: [...material.pendingDecisions],
    absent: [...material.absent],
  };

  const trimmed: WriterSectionEvidencePackage["trimmed"] = [];
  const registrarCorte = (campo: Cortavel, total: number, kept: number) => {
    const existente = trimmed.find(item => item.field === campo);
    if (existente) existente.kept = kept;
    else trimmed.push({ field: campo, kept, total, readAt: ONDE_LER[campo] });
  };
  for (const [campo, limite] of Object.entries(LIMITE_INICIAL) as Array<[Cortavel, number]>) {
    const atual = lerLista(pacote, campo);
    if (atual && atual.length > limite) {
      registrarCorte(campo, atual.length, limite);
      pacote = gravarLista(pacote, campo, atual.slice(0, limite));
    }
  }

  /*
   * CEDE PRIMEIRO A LISTA MAIS PESADA, pela metade, até caber. Na primeira
   * fase, o que casa com a seção (na frente de cada lista) não sai, e a
   * especialista, as pendências e os conflitos ficam inteiros; só se ainda
   * não couber, a segunda fase corta sem piso. Lista pequena não zera por
   * causa de uma grande.
   */
  const medir = () => writerEvidenceJsonBytes({ ...pacote, trimmed });
  const casamNaFrente = (itens: unknown[]) => {
    let quantos = 0;
    for (const item of itens) { if (registro(item)?.matchesSection !== true) break; quantos += 1; }
    return quantos;
  };
  for (const fase of ["preserva_a_secao", "sem_piso"] as const) {
    while (medir() > WRITER_SECTION_PACKAGE_MAX_BYTES) {
      let maisPesada: { campo: Cortavel; itens: unknown[]; piso: number; bytes: number } | null = null;
      for (const campo of CORTAVEIS) {
        if (fase === "preserva_a_secao" && PROTEGIDAS_ATE_O_FIM.has(campo)) continue;
        const itens = lerLista(pacote, campo);
        if (!itens || !itens.length) continue;
        const piso = fase === "preserva_a_secao" ? casamNaFrente(itens) : 0;
        if (itens.length <= piso) continue;
        const bytes = writerEvidenceJsonBytes(itens);
        if (!maisPesada || bytes > maisPesada.bytes) maisPesada = { campo, itens, piso, bytes };
      }
      if (!maisPesada) break;
      const { campo, itens, piso } = maisPesada;
      const manter = Math.max(piso, Math.floor(itens.length / 2));
      registrarCorte(campo, trimmed.find(item => item.field === campo)?.total ?? itens.length, manter);
      pacote = gravarLista(pacote, campo, itens.slice(0, manter));
    }
    if (medir() <= WRITER_SECTION_PACKAGE_MAX_BYTES) break;
  }
  const final = { ...pacote, trimmed } as WriterSectionEvidencePackage;
  return writerEvidenceJsonBytes(final) <= WRITER_SECTION_PACKAGE_MAX_BYTES ? final : null;
}

/**
 * A CHAVE CITADA ESTÁ NO PACOTE? Aceita a chave listada ou uma descida dela
 * (`radar.bundle.observed.questions#3`). Chave fora do pacote não vira
 * evidência de divergência: a IA só pode citar o que recebeu.
 */
export function writerSectionSourceOf(pacote: Pick<WriterSectionEvidencePackage, "sources"> | null, citada: string | null | undefined): WriterSectionSource | null {
  if (!pacote || !citada) return null;
  const chave = citada.trim();
  return pacote.sources.find(fonte => chave === fonte.sourceKey || chave.startsWith(`${fonte.sourceKey}#`) || chave.startsWith(`${fonte.sourceKey}.`)) ?? null;
}

/* ======================== o que o modelo devolve ======================== */

/**
 * UM ALERTA DA IA INTERNA. Texto livre, como antes, ou o objeto que aponta
 * alvo, afirmação do DNA e evidência. Os campos do objeto são texto: tipo de
 * alvo desconhecido ou chave fora do pacote é tratado no registro, sem
 * derrubar a proposta inteira.
 */
export const WriterAiAlertSchema = z.union([
  z.string().trim().min(1).max(1000),
  z.object({
    message: z.string().trim().min(1).max(1000),
    targetKind: z.string().trim().max(40).optional(),
    keywordId: z.string().trim().max(300).optional(),
    dnaClaimPath: z.string().trim().max(500).optional(),
    evidenceSourceKey: z.string().trim().max(300).optional(),
    evidencePath: z.string().trim().max(500).optional(),
  }),
]);
export type WriterAiAlert = z.infer<typeof WriterAiAlertSchema>;

export const writerAiAlertMessage = (alerta: WriterAiAlert): string => (typeof alerta === "string" ? alerta : alerta.message);

export const WriterSectionProviderSchema = z.object({
  paragraphs: z.array(z.string().trim().min(1).max(4000)).min(1).max(8),
  alerts: z.array(WriterAiAlertSchema).max(20).default([]),
});

/**
 * O QUE A TELA DIZ SOBRE OS ALERTAS DA IA INTERNA depois da proposta: quantos
 * viraram divergência para decisão humana e quantos não (e por quê, quando é
 * a migration). Texto vazio quando não houve alerta. Aceita `unknown` porque
 * lê a resposta da rota.
 */
export function writerAlertRegistrationNotice(valor: unknown): string {
  const lido = registro(valor);
  if (!lido || lido.status === "none") return "";
  const gravados = Array.isArray(lido.recorded) ? lido.recorded.length : 0;
  const naoGravados = Array.isArray(lido.notRecorded) ? lido.notRecorded.length : 0;
  if (lido.status === "migration_pendente") return ` ${naoGravados} alerta(s) da IA não registrado(s): migration pendente.`;
  if (!gravados && !naoGravados) return "";
  return ` ${gravados} alerta(s) da IA registrado(s) como divergência para decisão humana${naoGravados ? `; ${naoGravados} não registrado(s)` : ""}.`;
}

export const WriterImproveProviderSchema = z.object({
  replacementText: z.string().trim().min(1).max(12000),
  alerts: z.array(WriterAiAlertSchema).max(20).default([]),
});
