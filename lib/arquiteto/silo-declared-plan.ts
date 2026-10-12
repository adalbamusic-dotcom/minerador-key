/**
 * ===== O PLANO DECLARADO NO SILO (F4) =====
 *
 * SDD `docs/compartilhado/sdd-plano-declarado-e-grupos-2026-10-12.md` §5.4 e
 * §6.2-6; D7 (o Pilar é o artigo que o dono declarou) e D11 da §17.
 *
 * O plano já diz quem é o Pilar, em que ordem os artigos se leem e como o Silo
 * se chama. Isso é DECISÃO HUMANA anterior ao fechamento — não heurística. Este
 * módulo lê o plano e responde se ele vale para um conjunto de artigos:
 *
 *   - todos os artigos são de Assuntos COM plano;
 *   - todos do MESMO grupo;
 *   - exatamente UM com papel "Pilar".
 *
 * Qualquer outra situação devolve `applies: false` com o aviso do porquê, e o
 * chamador segue a regra de hoje (cobertura no fechamento, Pilar nulo na cópia).
 * Sem nenhum artigo com plano não há aviso nenhum: a saída é a de sempre.
 *
 * Domínio puro: sem React, sem storage, sem rede.
 */
import type { DeclaredArticlePlan, DeclaredSiloPlan } from "../minerador/declared-plan.ts";
import { resolveKeywordSubject } from "../minerador/keyword-subject.ts";

/** O começo da razão gravada na decisão de Pilar: a tela e os testes leem por aqui. */
export const DECLARED_PILLAR_REASON_PREFIX = "Pilar declarado no plano" as const;

/** Um artigo do plano, lido do PACOTE APROVADO do Assunto, com a autoria da declaração. */
export type DeclaredSiloPlanEntry = {
  subjectKeywordId: string;
  plan: DeclaredArticlePlan;
  /** `auth.users.id` de quem declarou (ou rótulo legível, quando o chamador o tem). */
  declaredBy: string | null;
  declaredAt: string | null;
};

/** Um artigo do Silo como a resolução o enxerga: formação concluída ou ArticleDNA. */
export type DeclaredSiloPlanUnit = {
  /** `candidateRef` da formação ou `articleId` do ArticleDNA. */
  ref: string;
  principalKeywordId: string;
  keywordIds: readonly string[];
  /** O Assunto preso ao ArticleDNA (`subject.keywordId`), quando já existe. */
  subjectKeywordId?: string | null;
};

export type DeclaredSiloPlanResolution =
  | {
    applies: true;
    groupId: string;
    planVersion: number;
    pillarRef: string;
    /** Pilar primeiro; os demais na `order` do plano. */
    orderedRefs: string[];
    /** "Pilar declarado no plano por <ator> em <data>". */
    reason: string;
    declaredBy: string | null;
    declaredAt: string | null;
    warnings: [];
  }
  | { applies: false; warnings: string[] };

const text = (value: unknown): string | null => (typeof value === "string" && value.trim() ? value.trim() : null);

function dateLabel(value: string | null): string {
  const valor = text(value);
  if (!valor) return "data não registrada";
  const iso = /^(\d{4}-\d{2}-\d{2})/.exec(valor);
  return iso ? iso[1] : valor;
}

/** A razão da decisão de Pilar que vem do plano. Uma escrita só. */
export function declaredPillarReason(declaredBy: string | null, declaredAt: string | null): string {
  return `${DECLARED_PILLAR_REASON_PREFIX} por ${text(declaredBy) ?? "autor não registrado"} em ${dateLabel(declaredAt)}`;
}

/**
 * A autoria da declaração do Assunto, lida do PACOTE APROVADO quando ele existe
 * (é de lá que o plano saiu) e, sem pacote, da linha viva. Só leitura.
 */
export function declaredSubjectAuthorship(row: Record<string, unknown>): { declaredBy: string | null; declaredAt: string | null } {
  const asRecord = (value: unknown): Record<string, unknown> | null => {
    if (value && typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
    if (typeof value === "string" && value.trim().startsWith("{")) {
      try {
        const parsed = JSON.parse(value);
        return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed as Record<string, unknown> : null;
      } catch {
        return null;
      }
    }
    return null;
  };
  const doPacote = asRecord(asRecord(asRecord(asRecord(row.canonicalWorkflow)?.payload)?.approvedDna)?.analiseSemantica);
  const pacote = doPacote ? resolveKeywordSubject(doPacote) : null;
  if (pacote?.declared && (pacote.actorId || pacote.declaredAt)) return { declaredBy: pacote.actorId, declaredAt: pacote.declaredAt };
  const viva = resolveKeywordSubject(asRecord(row.analise_semantica));
  return { declaredBy: viva.actorId, declaredAt: viva.declaredAt };
}

/**
 * Qual artigo do plano é esta unidade?
 *
 * Na ordem: o Assunto preso ao ArticleDNA; a principal declarada; o próprio
 * Assunto como principal; o Assunto como membro. Dois candidatos pelo mesmo
 * critério = ambíguo, e ambíguo não é plano.
 */
function entryFor(unit: DeclaredSiloPlanUnit, entries: readonly DeclaredSiloPlanEntry[]): DeclaredSiloPlanEntry | null {
  const unico = (lista: DeclaredSiloPlanEntry[]) => (lista.length === 1 ? lista[0] : null);
  const assunto = text(unit.subjectKeywordId);
  if (assunto) {
    const preso = entries.filter(entry => entry.subjectKeywordId === assunto);
    if (preso.length) return unico(preso);
  }
  const principal = String(unit.principalKeywordId);
  const pelaPrincipalDeclarada = entries.filter(entry => entry.plan.declaredPrincipal?.keywordId === principal);
  if (pelaPrincipalDeclarada.length) return unico(pelaPrincipalDeclarada);
  const assuntoComoPrincipal = entries.filter(entry => entry.subjectKeywordId === principal);
  if (assuntoComoPrincipal.length) return unico(assuntoComoPrincipal);
  const membros = new Set(unit.keywordIds.map(String));
  return unico(entries.filter(entry => membros.has(entry.subjectKeywordId)));
}

/**
 * O plano vale para estes artigos? Puro e determinístico: a mesma entrada dá a
 * mesma resposta no fechamento automático, na consolidação e no teste.
 */
export function resolveDeclaredSiloPlan(input: {
  units: readonly DeclaredSiloPlanUnit[];
  entries: readonly DeclaredSiloPlanEntry[];
}): DeclaredSiloPlanResolution {
  if (!input.units.length || !input.entries.length) return { applies: false, warnings: [] };
  const pares = input.units.map(unit => ({ unit, entry: entryFor(unit, input.entries) }));
  const comPlano = pares.filter((par): par is { unit: DeclaredSiloPlanUnit; entry: DeclaredSiloPlanEntry } => Boolean(par.entry));
  // Nenhum artigo com plano: nada a dizer, a regra de hoje vale inteira.
  if (!comPlano.length) return { applies: false, warnings: [] };

  const avisos: string[] = [];
  const semPlano = pares.filter(par => !par.entry).map(par => par.unit.ref);
  if (semPlano.length) avisos.push(`${semPlano.length} artigo(s) do Silo sem plano declarado (${semPlano.join(", ")}).`);
  const grupos = [...new Set(comPlano.map(par => par.entry.plan.groupId))];
  if (grupos.length > 1) avisos.push(`Os artigos do Silo vêm de ${grupos.length} grupos diferentes.`);
  const repetidos = comPlano.filter((par, index) => comPlano.findIndex(outro => outro.entry.subjectKeywordId === par.entry.subjectKeywordId) !== index);
  if (repetidos.length) avisos.push("Dois artigos do Silo respondem ao mesmo artigo do plano.");
  const pilares = comPlano.filter(par => par.entry.plan.role === "Pilar");
  if (pilares.length === 0) avisos.push("Nenhum artigo do Silo foi declarado Pilar no plano.");
  if (pilares.length > 1) avisos.push(`${pilares.length} artigos do Silo foram declarados Pilar no plano.`);

  if (avisos.length) {
    return { applies: false, warnings: [`Plano declarado não aplicado ao Silo; vale a regra de hoje. ${avisos.join(" ")}`] };
  }

  const pilar = pilares[0];
  const demais = comPlano
    .filter(par => par !== pilar)
    .sort((esquerda, direita) => esquerda.entry.plan.order - direita.entry.plan.order || esquerda.unit.ref.localeCompare(direita.unit.ref));
  return {
    applies: true,
    groupId: grupos[0],
    planVersion: Math.max(...comPlano.map(par => par.entry.plan.planVersion)),
    pillarRef: pilar.unit.ref,
    orderedRefs: [pilar.unit.ref, ...demais.map(par => par.unit.ref)],
    reason: declaredPillarReason(pilar.entry.declaredBy, pilar.entry.declaredAt),
    declaredBy: pilar.entry.declaredBy,
    declaredAt: pilar.entry.declaredAt,
    warnings: [],
  };
}

/**
 * O Pilar declarado sobre as FORMAÇÕES concluídas de um Silo, no formato que
 * `buildCanonicalSiloClosurePlan({ declaredPillar })` recebe. `null` = o plano
 * não vale para estas formações (ou não há plano): a cobertura decide.
 */
export function declaredPillarForFormations(
  formations: ReadonlyArray<{ candidateRef: string; principalKeywordId: string; members: ReadonlyArray<{ keywordId: string }> }>,
  entries: readonly DeclaredSiloPlanEntry[],
): { pillarRef: string; orderedRefs: string[]; reason: string } | null {
  const resolucao = resolveDeclaredSiloPlan({
    units: formations.map(item => ({ ref: item.candidateRef, principalKeywordId: item.principalKeywordId, keywordIds: item.members.map(member => member.keywordId) })),
    entries,
  });
  return resolucao.applies ? { pillarRef: resolucao.pillarRef, orderedRefs: resolucao.orderedRefs, reason: resolucao.reason } : null;
}

/**
 * Ordena ids pela ordem declarada, com um Pilar fixo à frente. Quem não está no
 * plano mantém a ordem relativa, no fim. Nenhum id some nem aparece.
 */
export function orderIdsByDeclaredPlan(ids: readonly string[], orderedRefs: readonly string[], pillarId: string | null): string[] {
  const posicao = new Map(orderedRefs.map((ref, index) => [ref, index]));
  const restantes = ids.filter(id => id !== pillarId);
  const ordenados = restantes
    .map((id, index) => ({ id, index }))
    .sort((esquerda, direita) => (posicao.get(esquerda.id) ?? Number.MAX_SAFE_INTEGER) - (posicao.get(direita.id) ?? Number.MAX_SAFE_INTEGER) || esquerda.index - direita.index)
    .map(item => item.id);
  return pillarId && ids.includes(pillarId) ? [pillarId, ...ordenados] : ordenados;
}

/**
 * F4 — DE QUAL GRUPO É ESTE SILO? (`editorial_groups.silo_id`, §6.2-6.)
 *
 * O Silo é do grupo quando TODOS os seus artigos têm Assunto e todos esses
 * Assuntos estão no mesmo grupo (`minerador_keywords.group_id`). Artigo sem
 * Assunto, Assunto sem grupo ou dois grupos = sem vínculo, com o motivo. Se o
 * grupo tem plano quem confere é o servidor, na leitura do grupo.
 */
export function resolveSiloDeclaredGroup(input: {
  articles: ReadonlyArray<{ articleId: string; subjectKeywordId: string | null }>;
  keywordGroupById: ReadonlyMap<string, string | null>;
}): { groupId: string; reason: null } | { groupId: null; reason: string } {
  if (!input.articles.length) return { groupId: null, reason: "O Silo não tem artigos." };
  const semAssunto = input.articles.filter(article => !text(article.subjectKeywordId));
  if (semAssunto.length) return { groupId: null, reason: `${semAssunto.length} artigo(s) do Silo sem Assunto.` };
  const grupos = input.articles.map(article => input.keywordGroupById.get(String(article.subjectKeywordId)) ?? null);
  if (grupos.some(grupo => !grupo)) return { groupId: null, reason: "Há Assunto do Silo sem grupo." };
  const distintos = [...new Set(grupos as string[])];
  if (distintos.length !== 1) return { groupId: null, reason: `Os Assuntos do Silo estão em ${distintos.length} grupos.` };
  return { groupId: distintos[0], reason: null };
}

/** Identidade mínima que a consolidação usa (`SiloWorkingCopyIdentity`). */
type IdentityLike = { name: string; slug: string; protectedIdentity: boolean; publishedSlug: string | null };

/**
 * Nome e slug do Silo vindos do plano do grupo.
 *
 * O nome vem sempre do plano. O slug só quando nada está no ar: SiloPage
 * publicada ou estrutura publicada adotada nunca trocam de endereço.
 */
export function applyDeclaredSiloIdentity<T extends IdentityLike>(
  identity: T,
  groupPlan: Pick<DeclaredSiloPlan, "siloName" | "siloSlug"> | null | undefined,
  options: { pagePublished: boolean },
): T {
  if (!groupPlan) return identity;
  const nome = text(groupPlan.siloName) ?? identity.name;
  const slugDoPlano = text(groupPlan.siloSlug)?.replace(/^\/+|\/+$/g, "") || null;
  const slugProtegido = options.pagePublished || identity.protectedIdentity || Boolean(identity.publishedSlug);
  return { ...identity, name: nome, slug: !slugProtegido && slugDoPlano ? slugDoPlano : identity.slug };
}
