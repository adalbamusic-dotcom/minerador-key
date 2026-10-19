/**
 * ===== RETIRAR ARTIGO DO SILO (F4) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §11,
 * passo 6: desfazer um artigo que entrou no Silo e não pertence ao plano, SEM
 * APAGAR NADA. Uma ação só, com duas escritas:
 *
 *   1. o evento `rejected` na versão vigente do ArticleDNA, com o motivo;
 *   2. a versão nova do par SiloDNA + SiloPage sem o artigo (pelo mesmo
 *      `persistSiloPairAtomic` do par canônico).
 *
 * Este módulo monta o PLANO dessas escritas e as recusas; não grava nada. O
 * servidor (`lib/server/arquiteto-silo-article-withdrawal.ts`) lê os artefatos
 * da marca, chama isto, grava e relê.
 *
 * O que NUNCA sai por aqui: o Pilar (troque o Pilar antes), artigo publicado
 * (URL e canonical não mudam por esta ação) e artigo que já seguiu para o
 * Radar, o Redator ou Publicações.
 *
 * O tamanho mínimo segue a consolidação: Silo confirmado pode ficar raso (só o
 * Pilar), e a rasura vira dívida escrita no SiloDNA. Abaixo do mínimo do plano
 * (`SILO_ARTICLE_RANGE.min`) é aviso, não recusa.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */
import { SiloDNASchema, SiloPageSchema, type ArticleDNA, type SiloDNA, type SiloPage, type VersionEnvelope, type VersionStatusEvent } from "./contracts.ts";
import { createVersionEnvelope, toVersionReference } from "./versioning.ts";
import { SILO_ARTICLE_RANGE } from "../agent/silo-plan.ts";

/** Rótulos da tela e do catálogo do MCP: um texto só. */
export const SILO_ARTICLE_WITHDRAWAL_ACTION_LABEL = "Retirar artigo do Silo" as const;
export const SILO_ARTICLE_WITHDRAWAL_CONFIRM_LABEL = "Confirmar retirada" as const;
export const SILO_ARTICLE_WITHDRAWAL_ROUTE = "/api/arquiteto/silo-article-withdrawal" as const;

/** A mesma frase de dívida que a consolidação escreve num Silo sem suporte. */
export const SHALLOW_SILO_GAP = "Silo raso: nenhum Article de suporte na composição consolidada.";
export const SHALLOW_SILO_PENDING ="Revisão de segunda passada: definir os Articles de suporte que dão profundidade a este Silo.";

export const SILO_ARTICLE_WITHDRAWAL_REASON_MIN = 3;
export const SILO_ARTICLE_WITHDRAWAL_REASON_MAX = 500;
/** Quebras de linha, inclusive os separadores Unicode que colam de editores (como em `keyword-subject.ts`). */
const LINE_BREAKS = [String.fromCharCode(13), String.fromCharCode(10), String.fromCharCode(0x2028), String.fromCharCode(0x2029)];

export const SILO_ARTICLE_WITHDRAWAL_REFUSALS = {
  REASON_REQUIRED: `Escreva o motivo da retirada (de ${SILO_ARTICLE_WITHDRAWAL_REASON_MIN} a ${SILO_ARTICLE_WITHDRAWAL_REASON_MAX} caracteres, numa linha).`,
  SILO_NOT_FOUND: "Este Silo não tem SiloDNA nesta marca.",
  SILO_NOT_APPROVED: "A versão vigente do SiloDNA não está aprovada: consolide o Silo antes de retirar artigos.",
  STALE_SILO: "O Silo mudou depois da prévia. Abra a prévia de novo.",
  SILO_PAGE_NOT_FOUND: "O Silo não tem SiloPage: o par SiloDNA + SiloPage precisa existir para versionar junto.",
  SILO_PAIR_INCOHERENT: "A SiloPage vigente não aponta para a versão vigente do SiloDNA; recarregue antes de retirar.",
  ARTICLE_NOT_IN_SILO: "Este artigo não está no Silo.",
  ARTICLE_IS_PILLAR: "Este artigo é o Pilar do Silo: troque o Pilar antes de retirá-lo, ou desfaça o Silo inteiro (“Desfazer Silo”, Pilar incluído).",
  ARTICLE_NOT_FOUND: "O ArticleDNA deste artigo não foi encontrado nesta marca.",
  /** SUBSTITUÍDO em 2026-10-18 (o dono: "tem que poder apagar … não interessa qual seja o estado"): não recusa mais; vira aviso da prévia. */
  ARTICLE_PUBLISHED: "Este artigo está publicado: publicado não sai por aqui (URL, slug e canonical ficam como estão).",
  /** SUBSTITUÍDO em 2026-10-18: não recusa mais; o item adiante sai da operação (estado "retirado") na mesma ação. */
  ARTICLE_IN_DOWNSTREAM: "Este artigo já seguiu para outra etapa (Radar, Redator ou Publicações): retire por lá antes.",
} as const;
export type SiloArticleWithdrawalRefusalCode = keyof typeof SILO_ARTICLE_WITHDRAWAL_REFUSALS;

type Status = { versionId: string; status: string };

export type SiloArticleWithdrawalInput = {
  brandId: string;
  siloId: string;
  articleId: string;
  reason: string;
  siloDnaVersions: readonly VersionEnvelope<SiloDNA>[];
  siloPageVersions: readonly VersionEnvelope<SiloPage>[];
  articleDnaVersions: readonly VersionEnvelope<ArticleDNA>[];
  /** Status das versões (a coluna da linha; a mesma leitura da mesa). */
  statuses: readonly Status[];
  /** Etapas posteriores em que o artigo já tem item (radar, writer, publications). */
  downstreamStages?: readonly string[];
  /** A versão do SiloDNA que a prévia mostrou: diferente da vigente = recusa. */
  expectedSiloDnaVersionId?: string | null;
  /** Só a prévia: o motivo ainda não foi escrito (a tela pede depois de mostrar o que muda). */
  previewOnly?: boolean;
};

export type SiloArticleWithdrawalPlan = {
  ok: true;
  siloId: string;
  siloName: string;
  current: { siloDna: VersionEnvelope<SiloDNA>; siloPage: VersionEnvelope<SiloPage> };
  /** O SiloDNA novo, já validado pelo contrato. */
  nextSiloDna: SiloDNA;
  /** A SiloPage nova; `siloDnaRef` é trocado pela versão nova na montagem dos envelopes. */
  nextSiloPage: SiloPage;
  /** Os status das versões novas: o do par vigente, sem escalar nada. */
  statuses: { siloDna: string; siloPage: string };
  article: { articleId: string; versionId: string; label: string; keywordIds: string[] };
  reason: string;
  remainingArticleIds: string[];
  /** 2026-10-14 · aditivo: o artigo só apontava para o Silo; sai só com o evento `rejected`, o par não muda. Ausente = o par muda (como antes). */
  pairUnchanged?: true;
  /** O que muda, em frases para a prévia. */
  changes: string[];
  warnings: string[];
  /** 2026-10-18 · aditivo: as etapas adiante onde o artigo tem item (saem da operação na mesma ação). */
  downstreamStages?: string[];
};

export type SiloArticleWithdrawalRefusal = { ok: false; code: SiloArticleWithdrawalRefusalCode; message: string };

const refuse = (code: SiloArticleWithdrawalRefusalCode): SiloArticleWithdrawalRefusal => ({ ok: false, code, message: SILO_ARTICLE_WITHDRAWAL_REFUSALS[code] });

function latestBy<T>(versions: readonly VersionEnvelope<T>[], match: (version: VersionEnvelope<T>) => boolean): VersionEnvelope<T> | null {
  return versions.filter(match).reduce<VersionEnvelope<T> | null>((atual, version) => (!atual || version.versionNumber > atual.versionNumber ? version : atual), null);
}

/** O texto do artigo para a tela: a principal, nunca o id. */
export function articleWithdrawalLabel(article: ArticleDNA): string {
  const referencia = article.keywordReferences.find(reference => reference.keywordId === article.principalKeywordId);
  const frase = referencia?.keywordDnaSnapshot?.sourceKeywordSnapshot.keyword;
  return typeof frase === "string" && frase.trim() ? frase.trim() : article.suggestedSlug || article.articleId;
}

/**
 * O plano da retirada. Puro: a mesma entrada dá o mesmo plano, e nada é gravado.
 */
export function planSiloArticleWithdrawal(input: SiloArticleWithdrawalInput): SiloArticleWithdrawalPlan | SiloArticleWithdrawalRefusal {
  const motivo = input.reason.trim();
  if (!input.previewOnly && (motivo.length < SILO_ARTICLE_WITHDRAWAL_REASON_MIN || motivo.length > SILO_ARTICLE_WITHDRAWAL_REASON_MAX || LINE_BREAKS.some(quebra => motivo.includes(quebra)))) return refuse("REASON_REQUIRED");

  const statusDe = new Map(input.statuses.map(item => [item.versionId, item.status]));
  const dna = latestBy(input.siloDnaVersions, version => version.payload.siloId === input.siloId && (!version.payload.brandId || version.payload.brandId === input.brandId));
  if (!dna) return refuse("SILO_NOT_FOUND");
  if (statusDe.get(dna.versionId) !== "approved") return refuse("SILO_NOT_APPROVED");
  if (input.expectedSiloDnaVersionId && input.expectedSiloDnaVersionId !== dna.versionId) return refuse("STALE_SILO");
  const page = latestBy(input.siloPageVersions, version => version.payload.siloId === input.siloId && version.payload.brandId === input.brandId);
  if (!page) return refuse("SILO_PAGE_NOT_FOUND");
  if (page.payload.siloDnaRef.versionId !== dna.versionId) return refuse("SILO_PAIR_INCOHERENT");

  const silo = dna.payload;
  const sai = input.articleId;
  const noSilo = silo.pillarArticleId === sai || silo.supportArticleIds.includes(sai) || silo.articleReferences.some(reference => reference.articleId === sai);
  /*
   * 2026-10-14 (caso WifiConecta, ArticleDNA `melhor-para-jogos-online`) · O
   * ARTIGO QUE SÓ APONTA PARA O SILO. A melhoria formou o artigo com o Silo no
   * próprio DNA (`siloId`/`territoryRef`), mas o SiloDNA consolidado é anterior
   * e não o lista. Antes: "Este artigo não está no Silo." — e as keywords dele
   * ficavam presas sem caminho. Agora a retirada vale para ele também, só com
   * o evento `rejected` (o par SiloDNA + SiloPage não muda: não há o que tirar).
   */
  const artigoVigente = noSilo ? null : latestBy(input.articleDnaVersions, version => version.payload.articleId === sai && version.payload.brandId === input.brandId);
  const soApontaParaOSilo = Boolean(artigoVigente && (artigoVigente.payload.siloId === input.siloId || artigoVigente.payload.territoryRef === input.siloId));
  if (!noSilo && !soApontaParaOSilo) return refuse("ARTICLE_NOT_IN_SILO");
  if (silo.pillarArticleId === sai) return refuse("ARTICLE_IS_PILLAR");

  const artigo = artigoVigente ?? latestBy(input.articleDnaVersions, version => version.payload.articleId === sai && version.payload.brandId === input.brandId);
  if (!artigo) return refuse("ARTICLE_NOT_FOUND");
  /*
   * 2026-10-18 (decisão do dono, literal: "tem que poder apagar sim não interessa qual seja o estado … e alerta falando o
   * que está apagando") · SUBSTITUÍDAS as recusas ARTICLE_PUBLISHED e ARTICLE_IN_DOWNSTREAM: o publicado sai de vigência no
   * Arquiteto (no site nada muda) e o item adiante sai da operação (estado "retirado", a investigação fica), ditos na prévia.
   */
  const etapasAdiante = [...new Set(input.downstreamStages ?? [])].sort();
  const nomeDaEtapa: Record<string, string> = { radar: "Radar", writer: "Redator", publications: "Publicações" };
  const avisosDoEstado = [
    ...(artigo.payload.publishedIdentityRef ? ["Este artigo está publicado: no site nada muda (URL, slug e canonical ficam como estão); no Arquiteto o ArticleDNA sai de vigência."] : []),
    ...(etapasAdiante.length ? [`Este artigo já seguiu para o ${etapasAdiante.map(etapa => nomeDaEtapa[etapa] || etapa).join(" e ")}: o item sai da operação (“retirado”); a investigação e o documento ficam como histórico.`] : []),
  ];

  if (soApontaParaOSilo) {
    const label = articleWithdrawalLabel(artigo.payload);
    const restantes = [silo.pillarArticleId, ...silo.supportArticleIds].filter((id): id is string => Boolean(id));
    return {
      ok: true,
      siloId: input.siloId,
      siloName: silo.name || silo.centralEntity,
      current: { siloDna: dna, siloPage: page },
      nextSiloDna: silo,
      nextSiloPage: page.payload,
      statuses: { siloDna: "approved", siloPage: statusDe.get(page.versionId) || "proposed" },
      article: { articleId: sai, versionId: artigo.versionId, label, keywordIds: artigo.payload.keywordReferences.map(reference => reference.keywordId) },
      reason: motivo,
      remainingArticleIds: restantes,
      pairUnchanged: true,
      changes: [
        `ArticleDNA de “${label}”: a versão vigente (v${artigo.versionNumber}) recebe o status “rejeitado” com o motivo. Nada é apagado.`,
        `SiloDNA v${dna.versionNumber} e SiloPage v${page.versionNumber} não mudam: este artigo aponta para o Silo, mas não entrou na composição consolidada.`,
        `As ${artigo.payload.keywordReferences.length} keyword(s) dele ficam livres (voltam para “Keywords não agrupadas” do grupo delas) e podem formar o artigo do plano a que pertencem.`,
      ],
      warnings: avisosDoEstado,
      downstreamStages: etapasAdiante,
    };
  }

  const fica = (id: string) => id !== sai;
  const suportes = silo.supportArticleIds.filter(fica);
  const referencias = silo.articleReferences.filter(reference => fica(reference.articleId));

  // As keywords que SÓ o artigo retirado trazia saem da proveniência de insumo;
  // keyword de artigo que não se conseguiu ler fica (ausência não vira remoção).
  const versaoPorId = new Map(input.articleDnaVersions.map(version => [version.versionId, version.payload]));
  const keywordsQueFicam = new Set<string>();
  let leituraIncompleta = false;
  for (const reference of referencias) {
    const payload = versaoPorId.get(reference.articleDnaVersionId);
    if (!payload) { leituraIncompleta = true; continue; }
    payload.keywordReferences.forEach(item => keywordsQueFicam.add(item.keywordId));
  }
  const keywordsDoArtigo = artigo.payload.keywordReferences.map(reference => reference.keywordId);
  const keywordPackageRefs = silo.keywordPackageRefs?.filter(ref => leituraIncompleta || !keywordsDoArtigo.includes(ref.keywordId) || keywordsQueFicam.has(ref.keywordId));

  // A referência de SERP do artigo sai só quando nenhum artigo que fica a usa.
  const serpDoArtigo = artigo.payload.serpAssessmentRef?.entityId ?? null;
  const serpQueFica = new Set(referencias.flatMap(reference => {
    const payload = versaoPorId.get(reference.articleDnaVersionId);
    return payload?.serpAssessmentRef ? [payload.serpAssessmentRef.entityId] : [];
  }));
  const serpAssessmentRefs = silo.serpAssessmentRefs?.filter(ref => !serpDoArtigo || ref.entityId !== serpDoArtigo || serpQueFica.has(ref.entityId) || leituraIncompleta);

  const raso = suportes.length === 0;
  const nextSiloDna = SiloDNASchema.parse({
    ...silo,
    supportArticleIds: suportes,
    articleReferences: referencias,
    articleRoles: silo.articleRoles.filter(role => fica(role.articleId)),
    narrativeOrder: silo.narrativeOrder.filter(fica),
    linkMap: silo.linkMap.filter(link => fica(link.fromArticleId) && fica(link.toArticleId)),
    hierarchySignals: silo.hierarchySignals
      .filter(signal => fica(signal.articleDnaId))
      .map(signal => ({ ...signal, supportOrder: signal.articleDnaId === silo.pillarArticleId ? null : (suportes.indexOf(signal.articleDnaId) + 1 || null) })),
    ...(silo.serpGuidelines ? { serpGuidelines: silo.serpGuidelines.filter(line => !line.startsWith(`${sai}:`)) } : {}),
    ...(serpAssessmentRefs ? { serpAssessmentRefs } : {}),
    ...(keywordPackageRefs ? { keywordPackageRefs } : {}),
    gaps: raso && !silo.gaps.includes(SHALLOW_SILO_GAP) ? [...silo.gaps, SHALLOW_SILO_GAP] : silo.gaps,
    humanPendingDecisions: raso && !silo.humanPendingDecisions.includes(SHALLOW_SILO_PENDING) ? [...silo.humanPendingDecisions, SHALLOW_SILO_PENDING] : silo.humanPendingDecisions,
  });

  const nextSiloPage: SiloPage = {
    ...page.payload,
    supportArticleIds: page.payload.supportArticleIds.filter(fica),
    sections: page.payload.sections.map(section => ({ ...section, linkedArticleIds: section.linkedArticleIds.filter(fica) })),
  };

  const label = articleWithdrawalLabel(artigo.payload);
  const restantes = [silo.pillarArticleId, ...suportes].filter((id): id is string => Boolean(id));
  const secoes = page.payload.sections.filter(section => section.linkedArticleIds.includes(sai)).length;
  const changes = [
    `SiloDNA v${dna.versionNumber} → v${dna.versionNumber + 1}: “${label}” sai dos suportes, da ordem de leitura, dos papéis e do mapa de links.`,
    `SiloPage v${page.versionNumber} → v${page.versionNumber + 1}, apontando para o SiloDNA novo${secoes ? ` (sai de ${secoes} seção(ões))` : ""}; slug, URL e canonical ficam como estão.`,
    `ArticleDNA de “${label}”: a versão vigente (v${artigo.versionNumber}) recebe o status “rejeitado” com o motivo. Nada é apagado.`,
    `O Silo fica com ${restantes.length} artigo(s): o Pilar e ${suportes.length} suporte(s).`,
  ];
  const warnings: string[] = [...avisosDoEstado];
  if (restantes.length < SILO_ARTICLE_RANGE.min) {
    warnings.push(`O Silo fica abaixo do mínimo do plano (${SILO_ARTICLE_RANGE.min} artigos)${raso ? "; a rasura fica registrada como dívida no SiloDNA" : ""}.`);
  }
  warnings.push("O grafo de links internos foi gerado sobre a versão anterior do Silo: gere de novo depois da retirada.");

  return {
    ok: true,
    siloId: input.siloId,
    siloName: silo.name || silo.centralEntity,
    current: { siloDna: dna, siloPage: page },
    nextSiloDna,
    nextSiloPage,
    statuses: { siloDna: "approved", siloPage: statusDe.get(page.versionId) || "proposed" },
    article: { articleId: sai, versionId: artigo.versionId, label, keywordIds: keywordsDoArtigo },
    reason: motivo,
    remainingArticleIds: restantes,
    changes,
    warnings,
    downstreamStages: etapasAdiante,
  };
}

/**
 * UUID determinístico (a partir de SHA-256): a mesma retirada repetida grava o mesmo evento.
 * 2026-10-18 · exportado (aditivo): o "Desfazer Silo" do Silo inteiro grava o MESMO evento `rejected` com a mesma regra de id.
 */
export async function deterministicUuid(seed: string): Promise<string> {
  const bytes = new Uint8Array(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(seed))).slice(0, 16);
  bytes[6] = (bytes[6] & 0x0f) | 0x50;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;
  const hex = [...bytes].map(byte => byte.toString(16).padStart(2, "0")).join("");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export type SiloArticleWithdrawalVersions = {
  siloDna: VersionEnvelope<SiloDNA>;
  siloPage: VersionEnvelope<SiloPage>;
  rejection: VersionStatusEvent;
};

/**
 * Os envelopes da retirada: SiloDNA vN+1, SiloPage vN+1 apontando para ele e o
 * evento `rejected` da versão vigente do ArticleDNA. O id do evento é
 * determinístico pela versão do artigo e pela versão do Silo: repetir a ação
 * depois de uma falha no par não duplica o evento.
 */
export async function buildSiloArticleWithdrawalVersions(
  plan: SiloArticleWithdrawalPlan,
  actorId: string,
  occurredAt: string = new Date().toISOString(),
): Promise<SiloArticleWithdrawalVersions> {
  const changeReason = `Artigo “${plan.article.label}” retirado do Silo por decisão humana: ${plan.reason}`;
  const siloDna = await createVersionEnvelope<SiloDNA>({
    entityId: plan.current.siloDna.entityId,
    versionNumber: plan.current.siloDna.versionNumber + 1,
    previousVersionId: plan.current.siloDna.versionId,
    origin: "human",
    changeReason,
    createdBy: actorId,
    payload: plan.nextSiloDna,
  });
  const pagePayload = SiloPageSchema.parse({ ...plan.nextSiloPage, siloDnaRef: toVersionReference(siloDna) });
  const siloPage = await createVersionEnvelope<SiloPage>({
    entityId: plan.current.siloPage.entityId,
    versionNumber: plan.current.siloPage.versionNumber + 1,
    previousVersionId: plan.current.siloPage.versionId,
    origin: "human",
    changeReason,
    createdBy: actorId,
    payload: pagePayload,
  });
  const rejection: VersionStatusEvent = {
    eventId: await deterministicUuid(`silo-article-withdrawal|${plan.article.versionId}|${plan.current.siloDna.versionId}`),
    versionId: plan.article.versionId,
    status: "rejected",
    actorId,
    reason: `Retirado do Silo “${plan.siloName}”: ${plan.reason}`,
    occurredAt,
  };
  return { siloDna, siloPage, rejection };
}
