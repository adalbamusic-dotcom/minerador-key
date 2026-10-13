/**
 * ===== APLICAR O PLANO DECLARADO A UM SILO JÁ CONSOLIDADO (2026-10-12) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §11,
 * passo 7, e D7 da §17 ("o Pilar é o artigo 1"). O Pilar declarado só entrava
 * em Silo AINDA NÃO consolidado (`chooseSiloWorkingCopyPillar` no fechamento e
 * na formação manual); o fechamento pula território consolidado. Aqui está o
 * caminho para o Silo que já tem SiloDNA e SiloPage aprovados:
 *
 *   prévia (Pilar, suportes, ordem, nome, objetivo, slug quando não publicado)
 *   → decisão humana explícita → SiloDNA e SiloPage v+1, relidos.
 *
 * O MESMO núcleo do fechamento decide o plano (`resolveDeclaredSiloPlan`,
 * `applyDeclaredSiloIdentity`); a escrita é a do par canônico
 * (`persistSiloPairAtomic`), como em "Retirar artigo do Silo". Versões
 * consolidadas são imutáveis: nada é reescrito, nasce a versão seguinte — e só
 * com mudança real. URL, slug e canonical publicados nunca mudam; Pilar atual
 * publicado que sairia do posto é conflito explícito (análogo à principal
 * publicada, AGENTS.md §11). Artigo fora do plano não é tirado em silêncio: a
 * prévia recusa e aponta "Retirar artigo do Silo".
 *
 * Este módulo monta o PLANO das escritas e as recusas; não grava nada.
 * Domínio puro: sem React, sem storage, sem rede.
 */
import { SiloDNASchema, SiloPageSchema, type ArticleDNA, type SiloDNA, type SiloPage, type VersionEnvelope, type VersionReference } from "./contracts.ts";
import { createVersionEnvelope, toVersionReference } from "./versioning.ts";
import type { DeclaredSiloPlan } from "../minerador/declared-plan.ts";
import { applyDeclaredSiloIdentity, declaredPlanEntryForUnit, resolveDeclaredSiloPlan, type DeclaredSiloPlanEntry, type DeclaredSiloPlanUnit } from "./silo-declared-plan.ts";
import { articleWithdrawalLabel, SHALLOW_SILO_GAP, SHALLOW_SILO_PENDING } from "./silo-article-withdrawal.ts";

/** Rótulos da tela e do catálogo do MCP: um texto só. */
export const SILO_DECLARED_PLAN_ACTION_LABEL = "Aplicar o plano declarado ao Silo" as const;
export const SILO_DECLARED_PLAN_CONFIRM_LABEL = "Confirmar o plano no Silo" as const;
export const SILO_DECLARED_PLAN_ROUTE = "/api/arquiteto/silo-declared-plan" as const;

/** O aviso do grafo de links: o caminho existente (aba Links internos) refaz a base. */
export const SILO_DECLARED_PLAN_GRAPH_WARNING = "O grafo de links internos foi gerado sobre a versão anterior do Silo: na aba Links internos, processe os links de novo — a base passa para a versão nova, as arestas que ainda cabem nos papéis novos (Pilar/Suporte) vão junto e as que não cabem saem com o motivo.";

export const SILO_DECLARED_PLAN_REFUSALS = {
  SILO_NOT_FOUND: "Este Silo não tem SiloDNA nesta marca.",
  SILO_NOT_APPROVED: "A versão vigente do SiloDNA não está aprovada: consolide o Silo antes de aplicar o plano.",
  STALE_SILO: "O Silo mudou depois da prévia. Abra a prévia de novo.",
  SILO_PAGE_NOT_FOUND: "O Silo não tem SiloPage: o par SiloDNA + SiloPage precisa existir para versionar junto.",
  SILO_PAIR_INCOHERENT: "A SiloPage vigente não aponta para a versão vigente do SiloDNA; recarregue antes de aplicar o plano.",
  SILO_ARTICLE_MISSING: "Um artigo do Silo não tem versão vigente ativa (rejeitada ou fora do acervo): recarregue a mesa.",
  NO_DECLARED_PLAN: "Os artigos deste Silo não têm plano declarado aprovado: importe o plano no Minerador (\"Importar plano do Silo\") e reaprove os Assuntos.",
  NON_PLAN_ARTICLES: "Há artigo no Silo fora do plano declarado.",
  PLAN_NOT_APPLICABLE: "O plano declarado não vale para os artigos deste Silo.",
  PILLAR_PUBLISHED: "O Pilar atual está publicado: trocar o Pilar de uma página no ar é conflito que esta ação não resolve (URL, slug e canonical ficam como estão). Decida no Silo antes.",
} as const;
export type SiloDeclaredPlanRefusalCode = keyof typeof SILO_DECLARED_PLAN_REFUSALS;
export type SiloDeclaredPlanRefusal = { ok: false; code: SiloDeclaredPlanRefusalCode; message: string;
  /** SDD acelerar 2026-10-13, item 10 (aditivo): em NON_PLAN_ARTICLES, os artigos fora do plano — a prévia oferece retirá-los. */
  articleIds?: string[] };

type Status = { versionId: string; status: string };

export type SiloDeclaredPlanInput = {
  brandId: string;
  siloId: string;
  /** Versões vigentes (ou todas) de SiloDNA e SiloPage da marca. */
  siloDnaVersions: readonly VersionEnvelope<SiloDNA>[];
  siloPageVersions: readonly VersionEnvelope<SiloPage>[];
  /** ArticleDNA ATIVOS (versão vigente não rejeitada) da marca. */
  articleDnaVersions: readonly VersionEnvelope<ArticleDNA>[];
  statuses: readonly Status[];
  /** Os artigos do plano, do pacote aprovado de cada Assunto. */
  entries: readonly DeclaredSiloPlanEntry[];
  /** O Silo planejado de cada grupo (`editorial_groups.plan`). */
  groupPlans: ReadonlyMap<string, DeclaredSiloPlan>;
  /** A versão do SiloDNA que a prévia mostrou: diferente da vigente = recusa. */
  expectedSiloDnaVersionId?: string | null;
};

export type SiloDeclaredPlanApplicationPlan = {
  ok: true;
  /** `true` = o Silo já segue o plano: nenhuma versão nova. */
  unchanged: boolean;
  siloId: string;
  siloName: string;
  groupId: string;
  planVersion: number;
  current: { siloDna: VersionEnvelope<SiloDNA>; siloPage: VersionEnvelope<SiloPage> };
  nextSiloDna: SiloDNA;
  /** `siloDnaRef` é trocado pela versão nova na montagem dos envelopes. */
  nextSiloPage: SiloPage;
  statuses: { siloDna: string; siloPage: string };
  pillar: { from: { articleId: string; label: string } | null; to: { articleId: string; label: string } };
  narrativeOrder: Array<{ articleId: string; label: string }>;
  /** A decisão registrada: "Pilar declarado no plano por <ator> em <data>". */
  decisionReason: string;
  changes: string[];
  warnings: string[];
};

const refuse = (code: SiloDeclaredPlanRefusalCode, detail?: string): SiloDeclaredPlanRefusal => ({ ok: false, code, message: detail ? `${SILO_DECLARED_PLAN_REFUSALS[code]} ${detail}` : SILO_DECLARED_PLAN_REFUSALS[code] });

function latestBy<T>(versions: readonly VersionEnvelope<T>[], match: (version: VersionEnvelope<T>) => boolean): VersionEnvelope<T> | null {
  return versions.filter(match).reduce<VersionEnvelope<T> | null>((atual, version) => (!atual || version.versionNumber > atual.versionNumber ? version : atual), null);
}

const canonical = (value: unknown): unknown => Array.isArray(value)
  ? value.map(canonical)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.entries(value as Record<string, unknown>).filter(([, item]) => item !== undefined).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, item]) => [key, canonical(item)]))
    : value;
/** JSON estável: a mesma estrutura com chaves em outra ordem dá o mesmo texto. */
export const stableJson = (value: unknown) => JSON.stringify(canonical(value));

const unitOf = (version: VersionEnvelope<ArticleDNA>): DeclaredSiloPlanUnit => ({
  ref: version.payload.articleId,
  principalKeywordId: version.payload.principalKeywordId,
  keywordIds: version.payload.keywordReferences.map(reference => reference.keywordId),
  subjectKeywordId: version.payload.subject?.keywordId ?? null,
});

const SECTION_HEADING_PREFIX = (centralEntity: string) => `${centralEntity}: `;

/**
 * O plano da aplicação. Puro: a mesma entrada dá o mesmo plano, e nada é gravado.
 */
export function planSiloDeclaredPlanApplication(input: SiloDeclaredPlanInput): SiloDeclaredPlanApplicationPlan | SiloDeclaredPlanRefusal {
  const statusDe = new Map(input.statuses.map(item => [item.versionId, item.status]));
  const dna = latestBy(input.siloDnaVersions, version => version.payload.siloId === input.siloId && (!version.payload.brandId || version.payload.brandId === input.brandId));
  if (!dna) return refuse("SILO_NOT_FOUND");
  if (statusDe.get(dna.versionId) !== "approved") return refuse("SILO_NOT_APPROVED");
  if (input.expectedSiloDnaVersionId && input.expectedSiloDnaVersionId !== dna.versionId) return refuse("STALE_SILO");
  const page = latestBy(input.siloPageVersions, version => version.payload.siloId === input.siloId && version.payload.brandId === input.brandId);
  if (!page) return refuse("SILO_PAGE_NOT_FOUND");
  if (page.payload.siloDnaRef.versionId !== dna.versionId) return refuse("SILO_PAIR_INCOHERENT");

  const silo = dna.payload;
  const artigos = new Map<string, VersionEnvelope<ArticleDNA>>();
  for (const version of input.articleDnaVersions) {
    if (version.payload.brandId !== input.brandId) continue;
    const atual = artigos.get(version.payload.articleId);
    if (!atual || version.versionNumber > atual.versionNumber) artigos.set(version.payload.articleId, version);
  }
  const label = (articleId: string) => {
    const version = artigos.get(articleId);
    return version ? articleWithdrawalLabel(version.payload) : articleId;
  };
  const atuaisIds = [...new Set([silo.pillarArticleId, ...silo.supportArticleIds].filter((id): id is string => Boolean(id)))];
  if (atuaisIds.some(id => !artigos.has(id))) return refuse("SILO_ARTICLE_MISSING");

  // O grupo do plano: o dos artigos que já estão no Silo.
  const entradaDe = (articleId: string) => declaredPlanEntryForUnit(unitOf(artigos.get(articleId)!), input.entries);
  const grupos = [...new Set(atuaisIds.map(entradaDe).filter((entry): entry is DeclaredSiloPlanEntry => Boolean(entry)).map(entry => entry.plan.groupId))];
  if (!grupos.length) return refuse("NO_DECLARED_PLAN");
  if (grupos.length > 1) return refuse("PLAN_NOT_APPLICABLE", `Os artigos do Silo vêm de ${grupos.length} grupos com plano.`);
  const grupo = grupos[0];
  const entradasDoGrupo = input.entries.filter(entry => entry.plan.groupId === grupo);

  const semPlano = atuaisIds.filter(id => entradaDe(id)?.plan.groupId !== grupo);
  if (semPlano.length) {
    return { ...refuse("NON_PLAN_ARTICLES", `Fora do plano: ${semPlano.map(id => `“${label(id)}”`).join(", ")}. Marque “retirar do Silo” na prévia (ou retire pelo “Retirar artigo do Silo”) antes de aplicar o plano.`), articleIds: semPlano };
  }

  // Artigos do plano que ainda não estão no Silo: entram quando já são deste Silo (siloId ou território) e de nenhum outro.
  const outrosSilos = new Set<string>();
  const vigentesPorSilo = new Map<string, VersionEnvelope<SiloDNA>>();
  for (const version of input.siloDnaVersions) {
    if (version.payload.siloId === input.siloId || (version.payload.brandId && version.payload.brandId !== input.brandId)) continue;
    const atual = vigentesPorSilo.get(version.payload.siloId);
    if (!atual || version.versionNumber > atual.versionNumber) vigentesPorSilo.set(version.payload.siloId, version);
  }
  for (const version of vigentesPorSilo.values()) for (const id of [version.payload.pillarArticleId, ...version.payload.supportArticleIds]) if (id) outrosSilos.add(id);
  const avisos: string[] = [];
  const extras: string[] = [];
  for (const version of artigos.values()) {
    const id = version.payload.articleId;
    if (atuaisIds.includes(id)) continue;
    const entrada = declaredPlanEntryForUnit(unitOf(version), entradasDoGrupo);
    if (!entrada) continue;
    const desteSilo = version.payload.siloId === input.siloId || Boolean(silo.territoryRef && version.payload.territoryRef === silo.territoryRef);
    if (!desteSilo || outrosSilos.has(id)) {
      avisos.push(`O artigo ${entrada.plan.order} do plano (“${label(id)}”) é de outro Silo e não entra por aqui.`);
      continue;
    }
    extras.push(id);
  }
  const unidades = [...atuaisIds, ...extras].map(id => unitOf(artigos.get(id)!));
  const presentes = new Set(unidades.map(unit => declaredPlanEntryForUnit(unit, entradasDoGrupo)?.subjectKeywordId).filter(Boolean));
  for (const entrada of [...entradasDoGrupo].sort((a, b) => a.plan.order - b.plan.order)) {
    if (!presentes.has(entrada.subjectKeywordId)) avisos.push(`O artigo ${entrada.plan.order} do plano ainda não tem ArticleDNA neste Silo: forme-o em Artigos → “Formar os artigos do plano” e aplique o plano de novo para ele entrar.`);
  }

  const resolucao = resolveDeclaredSiloPlan({ units: unidades, entries: entradasDoGrupo });
  if (!resolucao.applies) return refuse("PLAN_NOT_APPLICABLE", resolucao.warnings.join(" "));
  const pilar = resolucao.pillarRef;
  const ordem = resolucao.orderedRefs;
  const pilarAtual = silo.pillarArticleId;
  if (pilarAtual && pilarAtual !== pilar && artigos.get(pilarAtual)?.payload.publishedIdentityRef) return refuse("PILLAR_PUBLISHED");

  const suportes = ordem.slice(1);
  const ordemDe = (id: string) => declaredPlanEntryForUnit(unitOf(artigos.get(id)!), entradasDoGrupo)?.plan.order ?? null;
  const razaoSuporte = (id: string) => `Suporte declarado no plano (artigo ${ordemDe(id) ?? "?"}).`;
  const articleReferences = ordem.map(id => ({
    articleId: id,
    articleDnaVersionId: artigos.get(id)!.versionId,
    articleDnaContentHash: artigos.get(id)!.contentHash,
    role: id === pilar ? "Pilar" as const : "Suporte" as const,
  }));
  const articleRoles = ordem.map(id => ({ articleId: id, role: id === pilar ? "Pilar" : "Suporte", reason: id === pilar ? `${resolucao.reason}.` : razaoSuporte(id) }));
  const linkMap = suportes.map(id => ({ fromArticleId: id, toArticleId: pilar, reason: "Suporte aprofunda o universo e retorna ao Pilar." }));
  const sinalAnterior = new Map(silo.hierarchySignals.map(signal => [signal.articleDnaId, signal]));
  const hierarchySignals = ordem.map((id, index) => {
    const anterior = sinalAnterior.get(id);
    const payload = artigos.get(id)!.payload;
    const kgr = payload.kgrIdentity?.kgrValue;
    return {
      articleDnaId: id,
      principalVolume: anterior?.principalVolume ?? payload.primaryKeywordMetrics?.volumeSearch ?? null,
      combinedVolume: anterior?.combinedVolume ?? payload.keywordStrategy?.combinedVolume ?? null,
      tailLength: anterior?.tailLength ?? 0,
      kgrScore: anterior?.kgrScore ?? (typeof kgr === "number" && kgr >= 0 ? kgr : null),
      semanticCentrality: anterior?.semanticCentrality ?? 0,
      intentBreadth: anterior?.intentBreadth ?? payload.keywordReferences.length,
      suggestedRole: index === 0 ? "pillar" as const : "support" as const,
      supportOrder: index === 0 ? null : index,
      rationale: index === 0 ? `${resolucao.reason}.` : razaoSuporte(id),
    };
  });
  const keywordPackageRefs = [...new Map(ordem.flatMap(id => artigos.get(id)!.payload.keywordReferences)
    .filter(reference => reference.approvedPackageRef)
    .map(reference => [reference.keywordId, { keywordId: reference.keywordId, version: reference.approvedPackageRef!.version, contentHash: reference.approvedPackageRef!.contentHash, approvedAt: reference.approvedPackageRef!.approvedAt }] as const)).values()]
    .sort((left, right) => left.keywordId.localeCompare(right.keywordId));
  const serpRefs = [...new Map(ordem.map(id => artigos.get(id)!.payload.serpAssessmentRef).filter((ref): ref is VersionReference => Boolean(ref)).map(ref => [ref.versionId, ref] as const)).values()];
  const linhasSerp = ordem.flatMap(id => {
    const anteriores = (silo.serpGuidelines || []).filter(line => line.startsWith(`${id}:`));
    return anteriores.length ? anteriores : [`${id}: Nenhuma diretriz SERP nova; preservar a evidência disponível ou registrar insuficiência.`];
  });
  const planoDoGrupo = input.groupPlans.get(grupo) ?? null;
  const nome = planoDoGrupo?.siloName?.trim() || silo.name || silo.centralEntity;
  const objetivo = planoDoGrupo?.objective?.trim() || silo.objective;
  const raso = suportes.length === 0;

  const nextSiloDna = SiloDNASchema.parse({
    ...silo,
    name: nome,
    objective: objetivo,
    pillarArticleId: pilar,
    supportArticleIds: suportes,
    articleReferences,
    articleRoles,
    narrativeOrder: ordem,
    linkMap,
    hierarchySignals,
    ...(keywordPackageRefs.length || silo.keywordPackageRefs ? { keywordPackageRefs } : {}),
    ...(serpRefs.length || silo.serpAssessmentRefs ? { serpAssessmentRefs: serpRefs } : {}),
    ...(silo.serpGuidelines || linhasSerp.length ? { serpGuidelines: linhasSerp } : {}),
    gaps: raso ? (silo.gaps.includes(SHALLOW_SILO_GAP) ? silo.gaps : [...silo.gaps, SHALLOW_SILO_GAP]) : silo.gaps.filter(gap => gap !== SHALLOW_SILO_GAP),
    humanPendingDecisions: raso ? silo.humanPendingDecisions : silo.humanPendingDecisions.filter(item => item !== SHALLOW_SILO_PENDING),
  });

  // A SiloPage: slug do plano só quando nada está no ar e não há canonical declarado.
  const atual = page.payload;
  const publicada = atual.publicationStatus === "published" || Boolean(atual.publishedUrl);
  const identidade = applyDeclaredSiloIdentity(
    { name: nome, slug: atual.slug, protectedIdentity: publicada || Boolean(atual.canonical), publishedSlug: publicada ? atual.slug : null },
    planoDoGrupo,
    { pagePublished: publicada },
  );
  const slug = identidade.slug;
  const prefixo = SECTION_HEADING_PREFIX(silo.centralEntity);
  const secaoDe = new Map(atual.sections.flatMap(section => section.linkedArticleIds.map(id => [id, section] as const)));
  const sections = ordem.map((id, index) => {
    const anterior = secaoDe.get(id);
    const titulo = id === pilar ? `${silo.centralEntity}: visão geral` : `${silo.centralEntity}: aprofundamento ${index}`;
    return {
      id: `section:${index + 1}`,
      // Título escrito por gente fica; o título gerado acompanha o papel e a ordem novos.
      heading: anterior && !anterior.heading.startsWith(prefixo) ? anterior.heading : titulo,
      objective: anterior?.objective ?? `Conectar o leitor ao tema ${silo.centralEntity.toLowerCase()}.`,
      linkedArticleIds: [id],
    };
  });
  const nextSiloPage = SiloPageSchema.parse({
    ...atual,
    slug,
    breadcrumbs: atual.breadcrumbs.map(crumb => (crumb.slug === atual.slug ? { ...crumb, slug } : crumb)),
    metaDescription: atual.metaDescription === silo.objective ? objetivo : atual.metaDescription,
    sections,
    pillarArticleId: pilar,
    supportArticleIds: suportes,
  });

  const unchanged = stableJson(nextSiloDna) === stableJson(silo) && stableJson({ ...nextSiloPage, siloDnaRef: null }) === stableJson({ ...atual, siloDnaRef: null });

  const changes: string[] = [];
  if (pilarAtual !== pilar) changes.push(`Pilar: ${pilarAtual ? `“${label(pilarAtual)}”` : "nenhum"} → “${label(pilar)}” (${resolucao.reason}).`);
  const entram = suportes.filter(id => !silo.supportArticleIds.includes(id) && id !== pilarAtual);
  const viramSuporte = pilarAtual && pilarAtual !== pilar && suportes.includes(pilarAtual) ? [pilarAtual] : [];
  if (viramSuporte.length) changes.push(`“${label(viramSuporte[0])}” deixa de ser o Pilar e fica como suporte.`);
  if (entram.length) changes.push(`Entram como suporte: ${entram.map(id => `“${label(id)}”`).join(", ")}.`);
  if (stableJson(ordem) !== stableJson(silo.narrativeOrder)) changes.push(`Ordem de leitura do plano: ${ordem.map((id, index) => `${index + 1}. “${label(id)}”`).join(" · ")}.`);
  if (nome !== (silo.name || silo.centralEntity)) changes.push(`Nome do Silo: “${silo.name || silo.centralEntity}” → “${nome}”.`);
  if (objetivo !== silo.objective) changes.push("Objetivo do Silo: passa a ser o objetivo declarado no plano.");
  if (slug !== atual.slug) changes.push(`Slug da SiloPage: \`${atual.slug}\` → \`${slug}\` (a página ainda não está publicada).`);
  else if (planoDoGrupo?.siloSlug && planoDoGrupo.siloSlug !== atual.slug) avisos.push(`O slug do plano (\`${planoDoGrupo.siloSlug}\`) não foi aplicado: a SiloPage está publicada ou já tem canonical — URL, slug e canonical ficam como estão.`);
  else changes.push(`Slug \`${slug}\`, URL e canonical ficam como estão.`);
  if (!unchanged) changes.push(`SiloDNA v${dna.versionNumber} → v${dna.versionNumber + 1} e SiloPage v${page.versionNumber} → v${page.versionNumber + 1}, apontando para o SiloDNA novo. As versões aprovadas de hoje ficam no histórico.`);
  if (!unchanged) avisos.push(SILO_DECLARED_PLAN_GRAPH_WARNING);

  return {
    ok: true,
    unchanged,
    siloId: input.siloId,
    siloName: silo.name || silo.centralEntity,
    groupId: grupo,
    planVersion: resolucao.planVersion,
    current: { siloDna: dna, siloPage: page },
    nextSiloDna,
    nextSiloPage,
    statuses: { siloDna: "approved", siloPage: statusDe.get(page.versionId) || "proposed" },
    pillar: { from: pilarAtual ? { articleId: pilarAtual, label: label(pilarAtual) } : null, to: { articleId: pilar, label: label(pilar) } },
    narrativeOrder: ordem.map(id => ({ articleId: id, label: label(id) })),
    decisionReason: resolucao.reason,
    changes: unchanged ? ["O Silo já segue o plano declarado: nenhuma versão nova."] : changes,
    warnings: avisos,
  };
}

/** Os envelopes: SiloDNA vN+1 e SiloPage vN+1 apontando para ele. Só com mudança real. */
export async function buildSiloDeclaredPlanVersions(
  plan: SiloDeclaredPlanApplicationPlan,
  actorId: string,
): Promise<{ siloDna: VersionEnvelope<SiloDNA>; siloPage: VersionEnvelope<SiloPage> }> {
  if (plan.unchanged) throw new Error("Sem mudança real: nenhuma versão nova do Silo.");
  const changeReason = `Plano declarado aplicado ao Silo por decisão humana: Pilar “${plan.pillar.to.label}”, ordem do plano (v${plan.planVersion}). ${plan.decisionReason}.`;
  const siloDna = await createVersionEnvelope<SiloDNA>({
    entityId: plan.current.siloDna.entityId,
    versionNumber: plan.current.siloDna.versionNumber + 1,
    previousVersionId: plan.current.siloDna.versionId,
    origin: "human",
    changeReason,
    createdBy: actorId,
    payload: plan.nextSiloDna,
  });
  const siloPage = await createVersionEnvelope<SiloPage>({
    entityId: plan.current.siloPage.entityId,
    versionNumber: plan.current.siloPage.versionNumber + 1,
    previousVersionId: plan.current.siloPage.versionId,
    origin: "human",
    changeReason,
    createdBy: actorId,
    payload: SiloPageSchema.parse({ ...plan.nextSiloPage, siloDnaRef: toVersionReference(siloDna) }),
  });
  return { siloDna, siloPage };
}
