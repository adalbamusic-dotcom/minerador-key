import { manualSiloCandidateDraft } from "./silo-assignment.ts";

/**
 * O SILO DO PLANO CHEGA AO ARQUITETO JÁ CONFIRMADO — regras puras (SDD
 * `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 1, D1).
 *
 * Quando o envio ao Arquiteto recebe keywords de um grupo com plano declarado,
 * o Silo do plano é achado pela MESMA regra de "Processar arquitetura"
 * (`architecture-working-proposal.ts`, `pelaPlano`): o território já ligado ao
 * grupo (`editorial_groups.silo_id`), o existente com o mesmo slug, ou um
 * candidato novo com o nome e o slug do plano. A decisão humana é o cadastro do
 * plano; a proveniência do território diz isso.
 */

export type PlanSiloTerritoryView = {
  territoryRef: string;
  lifecycleStatus: string;
  slugs: ReadonlyArray<string | null | undefined>;
  /** Opcional: o nome reconhece o Silo do plano desfeito quando o slug não foi gravado. */
  name?: string | null;
};

export type PlanSiloChoice =
  | { kind: "linked" | "slug"; territoryRef: string; lifecycleStatus: string }
  /**
   * 2026-10-14 (caso WifiConecta, azul): o Silo do plano foi DESFEITO por
   * alguém. Ele não recebe membros e não nasce duplicado em silêncio: volta
   * só por "Recriar o Silo do plano" (decisão humana, com prévia).
   */
  | { kind: "rejected_by_human"; territoryRef: string }
  | { kind: "create" };

/** Territórios que ainda recebem membros (os mesmos da decisão de Silo). */
export const PLAN_SILO_ASSIGNABLE = new Set(["candidate", "confirmed"]);

/** A marca que o Silo do plano carrega desde que nasce (`declaredPlanSiloDraft`). */
export const DECLARED_PLAN_SILO_REASON_PREFIX = "Silo do plano declarado:";
export const DECLARED_PLAN_SILO_NOTE_PREFIX = "Plano declarado no cadastro:";

const nomeNormalizado = (valor: string | null | undefined) => String(valor || "").trim().toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "");

export function choosePlanSiloTerritory(input: {
  plan: { siloName: string; siloSlug: string | null };
  linkedTerritoryRef: string | null;
  territories: readonly PlanSiloTerritoryView[];
  slugOf: (text: string) => string;
}): PlanSiloChoice {
  const vivos = input.territories.filter(territory => PLAN_SILO_ASSIGNABLE.has(territory.lifecycleStatus));
  if (input.linkedTerritoryRef) {
    const ligado = vivos.find(territory => territory.territoryRef === input.linkedTerritoryRef);
    if (ligado) return { kind: "linked", territoryRef: ligado.territoryRef, lifecycleStatus: ligado.lifecycleStatus };
  }
  const slug = input.plan.siloSlug || input.slugOf(input.plan.siloName);
  const mesmoSlug = vivos.find(territory => territory.slugs.some(item => item && item === slug));
  if (mesmoSlug) return { kind: "slug", territoryRef: mesmoSlug.territoryRef, lifecycleStatus: mesmoSlug.lifecycleStatus };
  // Um Silo vivo vence; só então o que a pessoa desfez (ligado ao grupo, mesmo slug ou mesmo nome).
  const desfeito = input.territories.filter(territory => territory.lifecycleStatus === "rejected").find(territory =>
    territory.territoryRef === input.linkedTerritoryRef
    || territory.slugs.some(item => item && item === slug)
    || (territory.name !== undefined && nomeNormalizado(territory.name) !== "" && nomeNormalizado(territory.name) === nomeNormalizado(input.plan.siloName)));
  if (desfeito) return { kind: "rejected_by_human", territoryRef: desfeito.territoryRef };
  return { kind: "create" };
}

/**
 * 2026-10-15 (caso WifiConecta) · O SILO DO PLANO QUE JÁ EXISTE, para
 * "Processar arquitetura" — consolidado incluído. `editorial_groups.silo_id`
 * pode apontar para um território que não existe mais (o azul apontava para
 * `territory:09d9b92d…`), e o Silo consolidado fica fora do acervo que a
 * análise compara: sem isto, o plano ganhava "Silo proposto" a cada passada.
 * Ordem: onde as keywords do plano JÁ estão (um Silo só); o ligado ao grupo;
 * o de mesmo slug (o do plano ou o do nome; slugs propostos incluídos).
 * Desfeito ou arquivado nunca volta por aqui. Nenhum = `null` (proposta).
 */
export function planGroupTerritory(input: {
  plan: { siloName: string; siloSlug: string | null };
  linkedTerritoryRef: string | null;
  keywordTerritoryRefs: ReadonlyArray<string | null | undefined>;
  territories: readonly PlanSiloTerritoryView[];
  slugOf: (text: string) => string;
}): { territoryRef: string; name: string | null; slug: string | null } | null {
  const ativos = input.territories.filter(territory => territory.lifecycleStatus !== "rejected" && territory.lifecycleStatus !== "archived");
  const porRef = new Map(ativos.map(territory => [territory.territoryRef, territory]));
  const vista = (territory: PlanSiloTerritoryView) => ({ territoryRef: territory.territoryRef, name: territory.name ?? null, slug: territory.slugs.find((item): item is string => Boolean(item)) ?? null });
  const ondeEstao = [...new Set(input.keywordTerritoryRefs.filter((ref): ref is string => typeof ref === "string" && porRef.has(ref)))];
  if (ondeEstao.length === 1) return vista(porRef.get(ondeEstao[0])!);
  if (input.linkedTerritoryRef && porRef.has(input.linkedTerritoryRef) && (!ondeEstao.length || ondeEstao.includes(input.linkedTerritoryRef))) return vista(porRef.get(input.linkedTerritoryRef)!);
  if (ondeEstao.length > 1) return null;
  const slugs = new Set([input.plan.siloSlug, input.slugOf(input.plan.siloName)].filter((item): item is string => Boolean(item)));
  const mesmoSlug = ativos.find(territory => territory.slugs.some(item => item && slugs.has(item)));
  return mesmoSlug ? vista(mesmoSlug) : null;
}

/* ===================== 2026-10-15 · O SILO DO PLANO É O DNA DO PLANO ===================== */

/*
 * PALAVRAS DO DONO (15/10): "muitas vezes eu já tenho a keyword e o slug do
 * silo (…) o Google provider barra ele porque tem 0 volume e não cadastra ele
 * como keyword (…) o silo é um cluster só pra unir grupos, não precisa ter
 * volume (…) se ele não detectou uma keyword destinada para o silo, mas no DNA
 * já está definido, ele tem que fazer só isso, recriar e ir pra frente, os
 * dados são claros, não tem que tentar converter ninguém."
 *
 * A identidade do Silo do plano é o que o plano grava: nome, slug, objetivo,
 * Pilar e ordem (`editorial_groups.plan` + `keyword_subject.plan` de cada
 * artigo). A KEYWORD do Silo é OPCIONAL: 0 volume, não cadastrada ou não
 * enviada é estado normal — nunca erro nem pendência. Quando ela existe (o
 * texto é o nome ou o slug do Silo do plano), é a cabeça da SiloPage: nunca
 * vira artigo nem "não agrupada". Keyword que o plano declara como artigo
 * (Pilar ou Suporte) nunca é cabeça de Silo.
 */

/** O texto comparável do nome/slug do Silo: sem acento, sem caixa, só letras e números ("Wi-Fi e fibra óptica" → "wifiefibraoptica"). */
export function planSiloTextKey(value: string | null | undefined): string {
  return String(value ?? "").toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9]+/g, "");
}

/** O grupo com plano, na forma mínima que a identidade do Silo lê. */
export type PlanSiloIdentityPlan = { groupId: string; siloName: string; siloSlug: string | null };

/**
 * AS KEYWORDS DO SILO DO PLANO (cabeça da SiloPage), por texto: a keyword cujo
 * texto é o nome ou o slug do Silo do plano. Nunca a que o plano declara como
 * artigo. Texto que casa com mais de um plano não é reconhecido (ambíguo:
 * decisão humana). Devolve keywordId → groupId.
 */
export function planSiloHeadKeywordIds(input: {
  plans: readonly PlanSiloIdentityPlan[];
  keywords: readonly { keywordId: string; text: string }[];
  planArticleKeywordIds?: ReadonlySet<string>;
}): Map<string, string> {
  const artigos = input.planArticleKeywordIds ?? new Set<string>();
  const porChave = new Map<string, Set<string>>();
  for (const plan of input.plans) {
    for (const chave of [planSiloTextKey(plan.siloName), planSiloTextKey(plan.siloSlug)]) {
      if (!chave) continue;
      porChave.set(chave, new Set([...(porChave.get(chave) ?? []), plan.groupId]));
    }
  }
  const cabecas = new Map<string, string>();
  for (const keyword of input.keywords) {
    if (artigos.has(keyword.keywordId)) continue;
    const grupos = porChave.get(planSiloTextKey(keyword.text));
    if (grupos && grupos.size === 1) cabecas.set(keyword.keywordId, [...grupos][0]);
  }
  return cabecas;
}

/** A frase da keyword do Silo: reconhecida como cabeça, ou ausente — e ausente é normal. */
export function planSiloHeadSentence(input: { siloName: string; siloSlug: string | null; head: { keyword: string } | null }): string {
  if (input.head) return `Keyword do Silo: “${input.head.keyword}” — cabeça da SiloPage (nunca vira artigo nem “não agrupada”).`;
  return `Keyword do Silo: nenhuma no Arquiteto — normal (0 volume, não cadastrada, Silo não indexado). A identidade vem do plano: “${input.siloName}”${input.siloSlug ? ` · /${input.siloSlug}` : ""}.`;
}

/**
 * NUNCA CONVERTER ARTIGO EM SILO, NUNCA DOIS SILOS DO MESMO PLANO. Antes de
 * criar um Silo (manual, sugestão, "Usar como Silo"), a aba pergunta isto:
 * o nome/slug pedido é o de um Silo do plano, ou a keyword escolhida é artigo
 * do plano? Então a criação é recusada com o caminho ("Consolidar o Silo do
 * plano", que recria ou reusa o Silo exatamente com o nome e o slug do plano).
 * `null` = livre para seguir como sempre (marca sem plano).
 */
export function planSiloCreationRefusal(input: {
  name?: string | null;
  slug?: string | null;
  keywordIds?: readonly string[];
  plans: readonly (PlanSiloIdentityPlan & { groupLabel?: string })[];
  planArticleKeywordIds?: ReadonlySet<string>;
  existingTerritoryName?: (groupId: string) => string | null;
}): string | null {
  const artigos = input.planArticleKeywordIds ?? new Set<string>();
  const artigo = (input.keywordIds ?? []).find(id => artigos.has(id));
  if (artigo) return "Esta keyword é artigo do plano (Pilar ou Suporte): artigo do plano nunca vira Silo. O Silo do plano é o do cadastro — use “Consolidar o Silo do plano” na aba Silos.";
  const pedidos = new Set([planSiloTextKey(input.name), planSiloTextKey(input.slug)].filter(Boolean));
  if (!pedidos.size) return null;
  const plano = input.plans.find(plan => pedidos.has(planSiloTextKey(plan.siloName)) || pedidos.has(planSiloTextKey(plan.siloSlug)));
  if (!plano) return null;
  const existente = input.existingTerritoryName?.(plano.groupId) ?? null;
  return existente
    ? `“${plano.siloName}” é o Silo do plano${plano.groupLabel ? ` ${plano.groupLabel}` : ""} e já existe (“${existente}”): não se cria um segundo. Use “Consolidar o Silo do plano” na aba Silos.`
    : `“${plano.siloName}” é o Silo do plano${plano.groupLabel ? ` ${plano.groupLabel}` : ""}: ele é criado (ou recriado) com o nome e o slug do plano por “Consolidar o Silo do plano”, na aba Silos — não por aqui.`;
}

/** Em que pé está o Silo do plano, para a linha da aba Silos e o portão da aba Artigos. */
export type PlanSiloStage =
  /** Desfeito por alguém: volta por "Recriar o Silo do plano". */
  | "rejected"
  /** As keywords do plano estão em Silos diferentes: decisão humana em Silos. */
  | "split"
  /** Não existe: "Consolidar o Silo do plano" cria com nome, slug e objetivo do plano. */
  | "create"
  /** Existe como candidato: a consolidação confirma. */
  | "confirm"
  /** Existe e está confirmado, mas o grupo aponta para outro Silo ou há keyword do plano sem Silo. */
  | "link"
  /** Falta o par SiloDNA + SiloPage e o Pilar do plano já tem ArticleDNA: a consolidação grava o v1. */
  | "pair"
  /** O par existe com tema/Pilar/ordem fora do plano: a consolidação grava a versão seguinte. */
  | "fix"
  /** Silo pronto; o par espera o Pilar do plano ter ArticleDNA (aba Artigos, etapa 1). */
  | "wait_articles"
  /** Silo e página do Silo em dia. */
  | "done";

export type PlanSiloStatus = {
  stage: PlanSiloStage;
  /** A linha da aba Silos tem o que consolidar agora (o botão fica em destaque). */
  actionable: boolean;
  /** O Silo existe e está decidido (confirmado/consolidado): a aba Artigos pode formar. */
  readyForArticles: boolean;
  /** SiloDNA + SiloPage em dia com o plano: os links internos podem seguir. */
  pairCurrent: boolean;
  sentence: string;
};

const DECIDIDOS = new Set(["confirmed", "consolidated"]);

export function planSiloStatus(input: {
  siloName: string;
  territory: { territoryRef: string; lifecycleStatus: string; name?: string | null } | null;
  linkedTerritoryRef: string | null;
  rejected: boolean;
  split: boolean;
  /** Keywords do plano recebidas no Arquiteto ainda sem Silo. */
  keywordsWithoutSilo: number;
  pair: "missing" | "current" | "fix";
  pillarFormed: boolean;
}): PlanSiloStatus {
  const nome = input.territory?.name || input.siloName;
  const pronto = Boolean(input.territory && DECIDIDOS.has(input.territory.lifecycleStatus));
  const base = { readyForArticles: pronto, pairCurrent: pronto && input.pair === "current" };
  if (!input.territory && input.rejected) return { ...base, stage: "rejected", actionable: true, sentence: `O Silo do plano “${input.siloName}” foi desfeito: recrie-o (prévia antes; nada é apagado).` };
  if (input.split) return { ...base, stage: "split", actionable: false, sentence: "As keywords do plano estão em Silos diferentes: decida qual é o do plano antes de consolidar." };
  if (!input.territory) return { ...base, stage: "create", actionable: true, sentence: `O Silo do plano “${input.siloName}” ainda não existe: consolidar cria com o nome, o slug e o objetivo do plano (sem keyword do Silo, normal).` };
  if (!pronto) return { ...base, stage: "confirm", actionable: true, sentence: `O Silo do plano “${nome}” é candidato: consolidar o confirma com a identidade do plano.` };
  if (input.linkedTerritoryRef !== input.territory.territoryRef || input.keywordsWithoutSilo > 0) {
    return { ...base, stage: "link", actionable: true, sentence: `O Silo do plano “${nome}” existe${input.keywordsWithoutSilo ? `; ${input.keywordsWithoutSilo} keyword(s) do plano sem Silo entram nele` : ""}${input.linkedTerritoryRef !== input.territory.territoryRef ? "; o grupo volta a apontar para ele" : ""}.` };
  }
  if (input.pair === "fix") return { ...base, stage: "fix", actionable: true, sentence: `A página do Silo “${nome}” está fora do plano (tema, Pilar ou ordem): consolidar grava a versão seguinte.` };
  if (input.pair === "missing") {
    return input.pillarFormed
      ? { ...base, stage: "pair", actionable: true, sentence: `O Silo do plano “${nome}” está pronto: consolidar grava o SiloDNA e a SiloPage com o Pilar e a ordem do plano.` }
      : { ...base, stage: "wait_articles", actionable: false, sentence: `O Silo do plano “${nome}” está pronto. A página do Silo (SiloDNA e SiloPage) é gravada quando o Pilar do plano tiver ArticleDNA — forme os artigos na aba Artigos.` };
  }
  return { ...base, stage: "done", actionable: false, sentence: `O Silo do plano “${nome}” e a página dele seguem o plano.` };
}

/** O que a regra precisa do grupo com plano. */
export type DeclaredPlanGroupView ={ groupId: string; groupLabel: string; siloName: string; siloSlug: string | null; linkedTerritoryRef: string | null };

/** O que ela lê do território. */
export type DeclaredPlanTerritoryView = PlanSiloTerritoryView & {
  name?: string | null;
  reasons?: readonly string[] | null;
  provenanceNote?: string | null;
};

/** A vista do território (como gravado) para a regra do Silo do plano — a mesma na tela e no servidor. */
export function declaredPlanViewOfTerritory(territory: {
  territoryRef: string;
  lifecycleStatus: string;
  name?: string | null;
  reasons?: readonly string[] | null;
  provenance?: { note?: string | null } | null;
  slugState?: { publishedSlug?: string | null; confirmed?: string | null; proposals?: ReadonlyArray<{ slug: string }> | null } | null;
}): DeclaredPlanTerritoryView {
  return {
    territoryRef: territory.territoryRef,
    lifecycleStatus: territory.lifecycleStatus,
    slugs: [territory.slugState?.publishedSlug, territory.slugState?.confirmed, ...(territory.slugState?.proposals ?? []).map(proposal => proposal.slug)],
    name: territory.name ?? null,
    reasons: territory.reasons ?? [],
    provenanceNote: territory.provenance?.note ?? null,
  };
}

/** O território nasceu como Silo do plano (marca gravada no rascunho do plano)? */
export function territoryCarriesDeclaredPlanMark(territory: Pick<DeclaredPlanTerritoryView, "reasons" | "provenanceNote">): boolean {
  return (territory.reasons ?? []).some(reason => typeof reason === "string" && reason.startsWith(DECLARED_PLAN_SILO_REASON_PREFIX))
    || (typeof territory.provenanceNote === "string" && territory.provenanceNote.startsWith(DECLARED_PLAN_SILO_NOTE_PREFIX));
}

/**
 * DE QUAL GRUPO COM PLANO ESTE É O SILO? A MESMA regra que acha o Silo do
 * plano no envio (`choosePlanSiloTerritory`): ligado ao grupo, mesmo slug do
 * plano, ou a marca do plano com o mesmo nome. `plans === null` (os planos
 * ainda não foram lidos): a marca do plano basta — melhor recusar desfazer do
 * que desfazer o plano por falta de leitura.
 */
export function declaredPlanSiloGroupFor(
  territory: DeclaredPlanTerritoryView,
  plans: readonly DeclaredPlanGroupView[] | null,
  slugOf: (text: string) => string,
): { groupId: string | null; groupLabel: string; siloName: string } | null {
  const marcado = territoryCarriesDeclaredPlanMark(territory);
  if (plans === null) return marcado ? { groupId: null, groupLabel: "do cadastro", siloName: territory.name || "Silo do plano" } : null;
  for (const plan of plans) {
    const slug = plan.siloSlug || slugOf(plan.siloName);
    const ligado = plan.linkedTerritoryRef === territory.territoryRef;
    const mesmoSlug = territory.slugs.some(item => item && item === slug);
    const mesmoNome = marcado && nomeNormalizado(territory.name) !== "" && nomeNormalizado(territory.name) === nomeNormalizado(plan.siloName);
    if (ligado || mesmoSlug || mesmoNome) return { groupId: plan.groupId, groupLabel: plan.groupLabel, siloName: plan.siloName };
  }
  return null;
}

/**
 * "RECRIAR O SILO DO PLANO" — a prévia por keyword (decisão humana; nada é
 * apagado). Cada keyword do grupo recebida no Arquiteto: entra no Silo do
 * plano, já está nele, ou fica onde está com o motivo (publicada; num artigo
 * — mexer nela é revisão do artigo, não decisão de Silo).
 */
export type RecreatePlanSiloLine = {
  keywordId: string;
  keyword: string;
  outcome: "enters" | "already" | "stays_in_article" | "stays_published" | "not_received";
  reason: string;
};

export function planRecreatePlanSiloLines(input: {
  territoryRef: string;
  keywords: ReadonlyArray<{ keywordId: string; keyword: string; received: boolean; territoryRef: string | null; territoryLabel?: string | null; isPublished: boolean; articleLabel?: string | null; previousDecision?: string | null }>;
}): RecreatePlanSiloLine[] {
  return input.keywords.map(item => {
    const base = { keywordId: item.keywordId, keyword: item.keyword };
    if (!item.received) return { ...base, outcome: "not_received" as const, reason: "Ainda não está no Arquiteto: aprove e envie no Minerador; ela entra no Silo do plano ao chegar." };
    if (item.territoryRef === input.territoryRef) return { ...base, outcome: "already" as const, reason: "Já está no Silo do plano." };
    if (item.isPublished) return { ...base, outcome: "stays_published" as const, reason: "Publicada: fica no Silo que o site declara (URL, slug e canonical intocados)." };
    if (item.articleLabel) return { ...base, outcome: "stays_in_article" as const, reason: `Está no artigo “${item.articleLabel}”${item.territoryLabel ? ` (Silo ${item.territoryLabel})` : ""}: fica lá. Para trazê-la, use “Retirar artigo do Silo” nesse artigo e recrie de novo; mexer nela é revisão do artigo, não decisão de Silo.` };
    return { ...base, outcome: "enters" as const, reason: item.territoryRef
      ? `Sai de ${item.territoryLabel ? `“${item.territoryLabel}”` : "outro Silo"} (sem artigo) e entra no Silo do plano.`
      : `Entra no Silo do plano${item.previousDecision ? ` (antes: ${item.previousDecision})` : ""}.` };
  });
}

/** O texto da proveniência: quem decidiu é o cadastro do plano. */
export function declaredPlanSiloNote(input: { groupLabel: string; planVersion: number; actorUserId: string; at: string }): string {
  return `Plano declarado no cadastro: grupo ${input.groupLabel}, plano v${input.planVersion}, por ${input.actorUserId} em ${input.at.slice(0, 10)}.`;
}

/** O rascunho do território novo: nome e slug do plano, origem humana estratégica, ingestão por import. */
export function declaredPlanSiloDraft(input: {
  plan: { siloName: string; siloSlug: string | null };
  slugOf: (text: string) => string;
  note: string;
}): Record<string, unknown> {
  const base = manualSiloCandidateDraft({ name: input.plan.siloName, slug: input.plan.siloSlug || input.slugOf(input.plan.siloName) });
  return {
    ...base,
    architecturalOrigin: "manual_strategic",
    ingestionOrigin: "import",
    reasons: [`Silo do plano declarado: ${input.plan.siloName}.`],
    provenance: { producedBy: "human", adoptedFromScenarioType: null, humanAdjustmentCount: 1, note: input.note },
  };
}

/** Confirmar o território: só o estado do ciclo muda (a identidade e o slug ficam). */
export function confirmedTerritoryDraft(territory: Record<string, unknown>): Record<string, unknown> {
  return { ...territory, lifecycleStatus: "confirmed", decisionState: "confirmed" };
}
