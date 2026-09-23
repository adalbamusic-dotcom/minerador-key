import type { ArticleDNA, SiloDNA, VersionEnvelope } from "../arquiteto/contracts.ts";
import type { SerpCollectionRecord, SerpReviewRecord } from "../editorial/contracts.ts";
import { normalizeSerpCacheKeyword } from "../editorial/serp-cache.ts";
import type { RadarAnalysisVersion } from "./analysis-contracts.ts";
import type { RadarArticleResearchContext } from "./article-research-context.ts";
import type { RadarEvidenceBundle } from "./evidence-bundle.ts";
import { radarFrozenObservedAtOfAnalysis } from "./evidence-bundle-runtime.ts";
import { radarFrozenSerpStandingOf } from "./investigation-finalization.ts";
import type { RadarKeywordContext } from "./keyword-context.ts";
import type { RadarPlannerHandoffReadiness } from "./planner-handoff.ts";
import type { RadarPortableDossierGapsInput } from "./portable-dossier-gaps.ts";
import {
  buildRadarPortableExportRow,
  radarPortableExportCsv,
  type RadarPortableExportInput,
  type RadarPortableExportRow,
} from "./portable-export.ts";
import {
  radarPortableLinkedSerpRecord,
  radarPortableNewerSerpCollection,
  radarPortableResearchLimitations,
  type RadarPortableFrozenLensesInput,
  type RadarPortableNewerSerpCollection,
  type RadarPortableSerpLensKeyword,
  type RadarPortableSerpLensLookup,
  type RadarPortableSerpObservedInput,
} from "./portable-serp-observed.ts";
import {
  radarSiloMemberDescriptorsOfArticleDnas,
  type RadarSiloExportMember,
  type RadarSiloExportMemberDescriptor,
  type RadarSiloExportPlan,
} from "./portable-silo-export.ts";
import { latestRadarR5SerpReview } from "./r5-sequential.ts";
import type { RadarResearchProfile } from "./research-profile.ts";

/**
 * ===== A MONTAGEM DO LOTE DO EXPORT PORTÁTIL — as pontes puras da rota =====
 *
 * ==================== POR QUE ESTE ARQUIVO EXISTE ====================
 *
 * A rota `app/api/editorial/radar-export` lê o banco; os módulos
 * `portable-serp-observed`, `portable-dossier-gaps` e `portable-silo-export`
 * projetam. Entre os dois fica uma escolha que precisa de teste: QUAL snapshot,
 * QUAL revisão, QUAIS decisões, QUAIS keywords, QUAL silo. Deixá-la dentro da
 * rota só seria testável com banco — e regra de negócio escondida atrás de I/O
 * é regra que ninguém protege.
 *
 * Aqui ela é pura: recebe o que a rota já leu e devolve as entradas das
 * colunas novas. A rota só chama.
 *
 * ==================== O QUE NÃO SE FAZ AQUI ====================
 *
 * Nenhuma leitura, nenhum relógio, nenhuma coleta. A leitura do cache de SERP
 * é injetada (`radarPortableExportReadLenses`), e é por isso que a falha dela
 * pode ser provada sem banco: ela vira "cache indisponível" na coluna, nunca
 * um export derrubado.
 *
 * Domínio puro: sem fetch, sem storage, sem provider, sem React.
 */

/* ============================== a SERP do artigo ============================== */

type PayloadDaAnalise = RadarAnalysisVersion["payload"];

/**
 * ===== A SERP OBSERVADA: a que o DOSSIÊ referencia, nunca "a mais recente" =====
 *
 * O `observed` do Google é montado sobre o snapshot mais recente; o dossiê
 * congelado referencia o da análise (`research.google.refs`). No YouTube e na
 * Amazon, a mesma camada aponta para o snapshot de APOIO. A coluna descreve a
 * SERP que a investigação analisou, e avisa quando há coleta posterior.
 *
 * ==================== A CURADORIA SÓ ONDE ELA DESCREVE ESTA SERP ====================
 *
 * `serpDecisions` são chaves POSICIONAIS da SERP canônica da análise. Numa
 * SERP de apoio, a posição 3 é outra página — aplicar a decisão ali diria que
 * alguém aprovou o que ninguém viu. Por isso a curadoria só atravessa quando a
 * camada é a principal e o registro vinculado é o da análise.
 */
export function radarPortableExportSerpObservedInput(input: {
  /** Os snapshots já lidos pela rota (`SerpSnapshotRepository.list`), o lote inteiro. */
  records: readonly SerpCollectionRecord[];
  articleId: string;
  bundle: Pick<RadarEvidenceBundle, "research">;
  /**
   * O payload INTEIRO da análise corrente: além da curadoria e das consultas,
   * o instante do congelamento é lido do perfil que manda (Amazon, YouTube ou
   * Google), pela mesma função de `research_status_md`.
   */
  analysis: Pick<PayloadDaAnalise, "serpDecisions" | "deepResearch" | "serpSnapshotId">;
  /** `listReviews(brandId)`, uma leitura por lote. */
  reviews: readonly SerpReviewRecord[];
  /** `false` quando a leitura das revisões falhou: a coluna diz "não lida", nunca "aguardando". */
  reviewsReadable: boolean;
}): RadarPortableSerpObservedInput {
  const camada = input.bundle.research.google;
  const { record, issue } = radarPortableLinkedSerpRecord(input.records, camada);
  const daAnalise = Boolean(record && input.analysis.serpSnapshotId
    && (record.id === input.analysis.serpSnapshotId || record.research?.id === input.analysis.serpSnapshotId));

  return {
    snapshot: record?.research ?? null,
    unavailableReason: issue,
    serpRole: camada?.role ?? null,
    /*
     * O CONGELAMENTO É O DA INVESTIGAÇÃO, não o da camada.
     *
     * Na SERP de apoio (YouTube/Amazon), `camada.frozenAt` é a data da COLETA
     * de apoio (`camadaDeApoioDoGoogle` grava `collectedAt` ali). A coluna
     * dizia "Congelamento da investigação: <data da coleta de apoio>", e a
     * mesma linha trazia outra data em `research_status_md`. Agora as duas
     * saem da mesma função. Na principal do Google elas já coincidiam; a
     * camada só responde quando a análise não gravou o instante.
     */
    frozenAt: radarFrozenObservedAtOfAnalysis(input.analysis) ?? (camada?.role === "PRIMARY" ? camada.frozenAt ?? null : null),
    review: record ? latestRadarR5SerpReview([...input.reviews], record.id) : null,
    reviewReadable: input.reviewsReadable,
    serpDecisions: camada?.role === "PRIMARY" && daAnalise ? input.analysis.serpDecisions || [] : [],
    deepResearchQueries: input.analysis.deepResearch?.queries ?? [],
    newerCollection: radarPortableNewerSerpCollection(input.records, input.articleId, record),
  };
}

/* ============================ as lacunas do dossiê ============================ */

/**
 * ===== O QUE O REDATOR LÊ DO DOSSIÊ E O CSV NÃO DIZIA =====
 *
 * A prontidão é a MESMA que o Redator usa para recusar (`dossier.readiness`),
 * mais a identidade do ArticleDNA (versão e impressão), que ele também exige.
 *
 * `serpStandingFrozen`: só o Google grava a situação da SERP no congelamento.
 * No YouTube e na Amazon o dossiê carrega o valor PADRÃO, que não é avaliação
 * de ninguém — e a célula diz isso em vez de apresentá-lo como veredito.
 */
export function radarPortableExportDossierGapsInput(input: {
  /**
   * O payload INTEIRO da análise corrente: o instante do congelamento é lido
   * do perfil que manda (Amazon, YouTube ou Google), como no envio ao Redator.
   */
  analysis: { finalizedBundle?: unknown };
  profile: RadarResearchProfile;
  bundle: RadarEvidenceBundle;
  readiness: RadarPlannerHandoffReadiness;
  article: { articleDnaVersionId: string | null | undefined; articleDnaContentHash: string | null | undefined };
  exportedAt: string;
  /**
   * A coleta de SERP posterior à investigação, quando existe
   * (`serpObserved.newerCollection`). As colunas de evidência saem do
   * `observed`, que é montado sobre a coleta MAIS RECENTE — e a célula da
   * situação precisa dizer isso, não só a coluna da SERP.
   */
  newerSerpCollection?: RadarPortableNewerSerpCollection | null;
}): RadarPortableDossierGapsInput {
  return {
    status: {
      frozenObservedAt: radarFrozenObservedAtOfAnalysis(input.analysis),
      bundle: input.bundle,
      readiness: input.readiness,
      articleDnaIdentityComplete: Boolean(input.article.articleDnaVersionId && input.article.articleDnaContentHash),
      serpStandingFrozen: input.profile === "GOOGLE" ? radarFrozenSerpStandingOf(input.analysis.finalizedBundle) !== null : false,
      exportedAt: input.exportedAt,
      newerSerpCollection: input.newerSerpCollection ?? null,
      /* As lentes do pacote: o mesmo dossiê, a mesma régua de `serp_lenses_*`. */
      frozenLenses: {
        profile: input.profile,
        block: input.profile === "GOOGLE" ? input.bundle.serpLenses ?? null : null,
        frozenAt: radarFrozenObservedAtOfAnalysis(input.analysis),
      },
    },
    observed: input.bundle.observed,
  };
}

/* ============================ as lentes do pacote ============================ */

/**
 * ===== AS LENTES QUE O PACOTE ENTREGA AO REDATOR, PARA A COLUNA DE LENTES =====
 *
 * A cópia é a do DOSSIÊ (`bundle.serpLenses`): o mesmo bloco que o Planejador
 * e o Redator recebem, lido do bundle congelado só no perfil Google. Nada de
 * cache nem de snapshot vivo — o cache entra na mesma coluna, depois, como
 * observação fora do pacote.
 *
 * Os snapshots já lidos pela rota servem só para dar NOME à consulta canônica
 * congelada (o bloco guarda o id dela, que não sai) e para dizer se ela é a
 * mesma SERP de `serp_observed_md`. A coleta só vale quando id E assinatura
 * batem com o bloco: registro com o mesmo id e outro conteúdo não é a SERP
 * que o pacote congelou.
 */
export function radarPortableExportFrozenLensesInput(input: {
  profile: RadarResearchProfile;
  bundle: Pick<RadarEvidenceBundle, "serpLenses" | "research">;
  /** O payload da análise corrente: o instante do congelamento sai dele. */
  analysis: unknown;
  records?: readonly SerpCollectionRecord[];
}): RadarPortableFrozenLensesInput {
  const block = input.profile === "GOOGLE" ? input.bundle.serpLenses ?? null : null;
  const base = { profile: input.profile, block, frozenAt: radarFrozenObservedAtOfAnalysis(input.analysis) };
  if (!block?.canonicalSnapshotId) return base;

  const ehACongelada = (registro: SerpCollectionRecord | null | undefined): registro is SerpCollectionRecord & { research: NonNullable<SerpCollectionRecord["research"]> } =>
    Boolean(registro?.research
      && (registro.id === block.canonicalSnapshotId || registro.research.id === block.canonicalSnapshotId)
      && registro.research.contentHash === block.canonicalSnapshotHash);
  const congelada = (input.records || []).find(ehACongelada) ?? null;
  const vinculada = radarPortableLinkedSerpRecord(input.records || [], input.bundle.research.google).record;
  return {
    ...base,
    canonicalQuery: congelada?.research.query ?? null,
    sameSerpAsObserved: vinculada ? ehACongelada(vinculada) : null,
  };
}

/**
 * As limitações do dossiê para o CSV: as que o congelamento escreveu sobre as
 * lentes saem portáteis (sem o motivo cru da coleta); as outras, como estão.
 */
export function radarPortableExportResearchLimitations(bundle: Pick<RadarEvidenceBundle, "limitations" | "serpLenses">): string[] {
  return radarPortableResearchLimitations(bundle.limitations, bundle.serpLenses);
}

/* ============================== a SERP por lente ============================== */

/* Sem acento: serve SÓ para achar o id da keyword quando o texto exato não casa. */
const normalizar = (valor: string) =>
  valor.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/\s+/g, " ").trim();

/* Espaço colapsado: a mesma limpeza do pedido ao cache (`radarPortableSerpLensRequests`). */
const colapsado = (valor: string | null | undefined): string => (valor || "").replace(/\s+/g, " ").trim();

/**
 * A CHAVE DE UMA KEYWORD NO CACHE — a mesma no pedido, no índice e na coluna.
 *
 * `normalizeSerpCacheKeyword` MANTÉM os acentos: "óleo de rosa mosqueta" e
 * "oleo de rosa mosqueta" são duas consultas para o cache, duas SERPs que o
 * Minerador pagou. Deduplicar sem acento fazia a variante sumir da coluna de
 * lentes sem nenhum aviso. E o espaço interno é colapsado dos DOIS lados: sem
 * isso, "rosa  mosqueta" era lida e acertada, mas o índice não a entregava ao
 * artigo, e a coluna dizia "nenhuma coleta" de uma lente que estava no cache.
 */
const chaveDoCache = (valor: string | null | undefined): string => normalizeSerpCacheKeyword(colapsado(valor));

/**
 * ===== AS KEYWORDS DO ARTIGO QUE VÃO AO CACHE =====
 *
 * A principal e as secundárias — as que o artigo PROMETE cobrir. Reforço
 * narrativo não tem SERP própria no desenho do Arquiteto, e pedir quatro
 * lentes para cada um multiplicaria a leitura sem mudar o que se escreve.
 *
 * O texto vem do contexto de keyword do DOSSIÊ (o mesmo que o Redator recebe);
 * o id da keyword só acompanha o pedido ao cache e nunca é exportado.
 */
export function radarPortableExportLensKeywords(input: {
  keywordContext: Pick<RadarKeywordContext, "principal" | "secondary">;
  researchContext?: Pick<RadarArticleResearchContext, "keywords"> | null;
}): RadarPortableSerpLensKeyword[] {
  /* O id pelo texto exato (chave do cache); sem ele, pelo texto sem acento. */
  const idPorChave = new Map<string, string>();
  const idSemAcento = new Map<string, string>();
  for (const keyword of input.researchContext?.keywords || []) {
    const textoDaKeyword = keyword?.identity?.text;
    const id = keyword?.identity?.keywordId;
    if (!textoDaKeyword || !id) continue;
    if (!idPorChave.has(chaveDoCache(textoDaKeyword))) idPorChave.set(chaveDoCache(textoDaKeyword), id);
    if (!idSemAcento.has(normalizar(textoDaKeyword))) idSemAcento.set(normalizar(textoDaKeyword), id);
  }

  const vistas = new Set<string>();
  const saida: RadarPortableSerpLensKeyword[] = [];
  const incluir = (textoDaKeyword: string | null | undefined, role: RadarPortableSerpLensKeyword["role"]) => {
    const limpo = colapsado(textoDaKeyword);
    const chave = chaveDoCache(limpo);
    if (!chave || vistas.has(chave)) return;
    vistas.add(chave);
    saida.push({ keyword: limpo, role, keywordId: idPorChave.get(chave) ?? idSemAcento.get(normalizar(limpo)) ?? null });
  };
  incluir(input.keywordContext.principal, "principal");
  for (const secundaria of input.keywordContext.secondary) incluir(secundaria, "secundaria");
  return saida;
}

export type RadarPortableExportLensReading = {
  lookups: readonly RadarPortableSerpLensLookup[];
  readFailed: boolean;
};

/**
 * ===== AS LEITURAS DE CADA ARTIGO, SEM VARRER O LOTE INTEIRO =====
 *
 * A leitura é uma só para o lote; a coluna de cada artigo só precisa das
 * lentes das keywords DELE. Indexar uma vez pela keyword normalizada (a mesma
 * normalização da chave do cache) evita que quinhentos artigos percorram,
 * cada um, as leituras dos outros quatrocentos e noventa e nove.
 */
export function radarPortableExportLensLookupsFor(
  lookups: readonly RadarPortableSerpLensLookup[],
): (keywords: readonly RadarPortableSerpLensKeyword[]) => RadarPortableSerpLensLookup[] {
  const porKeyword = new Map<string, RadarPortableSerpLensLookup[]>();
  for (const consulta of lookups) {
    const chave = chaveDoCache(consulta.request.query.keyword);
    porKeyword.set(chave, [...(porKeyword.get(chave) || []), consulta]);
  }
  return keywords => [...new Set(keywords.map(item => chaveDoCache(item.keyword)))]
    .flatMap(chave => porKeyword.get(chave) || []);
}

/**
 * ===== UMA LEITURA DO CACHE PARA O LOTE — e a falha não derruba o export =====
 *
 * O cache de SERP é CONTEXTO: ele diz o que as quatro lentes mostram hoje. A
 * investigação congelada não depende dele. Se o banco recusar a leitura, ou a
 * configuração dos códigos de localidade estiver inválida, o arquivo sai do
 * mesmo jeito — e cada lente diz "a leitura do cache falhou nesta exportação",
 * que é diferente de "nenhuma coleta".
 */
export async function radarPortableExportReadLenses(
  ler: () => Promise<readonly RadarPortableSerpLensLookup[]>,
  aoFalhar?: (erro: unknown) => void,
): Promise<RadarPortableExportLensReading> {
  try {
    return { lookups: await ler(), readFailed: false };
  } catch (erro) {
    aoFalhar?.(erro);
    return { lookups: [], readFailed: true };
  }
}

/** O que a rota guardou de cada artigo finalizado, antes de o lote fechar. */
export type RadarPortableExportAssembledArticle = {
  articleId: string;
  entrada: RadarPortableExportInput;
  lentes: readonly RadarPortableSerpLensKeyword[];
  /**
   * As lentes congeladas no pacote (`radarPortableExportFrozenLensesInput`).
   * Com elas, `serp_lenses_*` abre pela cópia congelada e rotula o cache como
   * observação fora do pacote. Sem elas, a coluna sai como antes.
   */
  lentesCongeladas?: RadarPortableFrozenLensesInput | null;
};

/**
 * ===== AS LINHAS DO LOTE — as lentes e o contexto do silo entram AQUI =====
 *
 * As duas colunas que dependem do LOTE (lentes e silo) só existem depois do
 * laço por artigo. Enquanto isto morava na rota, a ligação
 * `siloContext ← plano.contextByArticleId` podia sumir sem nenhum teste
 * vermelho — e os CSVs por silo sairiam sem o contexto do silo, que é o
 * núcleo do pedido. Aqui ela tem teste com o plano real.
 *
 * Sem plano (dossiê avulso), a linha não ganha contexto de silo: com só parte
 * do silo no pedido, ele chamaria de "não enviado" o irmão não selecionado.
 */
export function radarPortableExportRows(input: {
  articles: readonly RadarPortableExportAssembledArticle[];
  lenses: RadarPortableExportLensReading;
  plan: Pick<RadarSiloExportPlan, "contextByArticleId"> | null;
}): Map<string, RadarPortableExportRow> {
  const lentesDe = radarPortableExportLensLookupsFor(input.lenses.lookups);
  const linhas = new Map<string, RadarPortableExportRow>();
  for (const artigo of input.articles) {
    linhas.set(artigo.articleId, buildRadarPortableExportRow({
      ...artigo.entrada,
      serpLenses: {
        keywords: artigo.lentes,
        lookups: lentesDe(artigo.lentes),
        readFailed: input.lenses.readFailed,
        ...(artigo.lentesCongeladas ? { frozen: artigo.lentesCongeladas } : {}),
      },
      siloContext: input.plan?.contextByArticleId[artigo.articleId] ?? null,
    }));
  }
  return linhas;
}

/* ================================== o silo ================================== */

const textoLimpo = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");

/**
 * ===== O SILO DE UM ARTIGO RECUSADO ANTES DE O ITEM SER LIDO =====
 *
 * O `RadarItem.siloId` só é lido quando o artigo chega às autoridades. Um
 * artigo recusado antes disso (sem ArticleDNA, sem investigação) ainda precisa
 * aparecer como FALTANTE no silo dele — senão o silo sairia "completo" com um
 * buraco. A composição do SiloDNA mais recente da marca diz a que silo ele
 * pertence; se nenhum o lista, ele fica sem silo, e o aviso diz isso.
 */
export function radarSiloIdFromComposition(
  articleId: string,
  siloVersions: readonly VersionEnvelope<SiloDNA>[],
  brandId?: string | null,
): string | null {
  const recentes = new Map<string, VersionEnvelope<SiloDNA>>();
  for (const versao of siloVersions) {
    const siloId = textoLimpo(versao?.payload?.siloId);
    if (!siloId) continue;
    if (brandId && versao.payload.brandId && versao.payload.brandId !== brandId) continue;
    const atual = recentes.get(siloId);
    if (!atual || versao.versionNumber > atual.versionNumber) recentes.set(siloId, versao);
  }
  for (const [siloId, versao] of recentes) {
    const dna = versao.payload;
    const membros = new Set([
      dna.pillarArticleId,
      ...(dna.narrativeOrder || []),
      ...(dna.supportArticleIds || []),
      ...(dna.articleReferences || []).map(referencia => referencia.articleId),
    ].map(textoLimpo).filter(Boolean));
    if (membros.has(articleId)) return siloId;
  }
  return null;
}

/**
 * ===== COMO DESCREVER UM MEMBRO DO SILO QUE NÃO ESTÁ NO LOTE =====
 *
 * O slug vem do descritor do módulo do silo (publicado vence sugerido). O
 * título é a PROMESSA do ArticleDNA — a mesma frase que vira `RadarItem.title`
 * na importação (`operational-flow.ts`) —, para que o membro "não enviado ao
 * Radar" apareça com o nome que as pessoas reconhecem, e nunca pelo id.
 */
export function radarSiloMemberDescriptorsWithTitles(
  versoes: readonly VersionEnvelope<ArticleDNA>[],
  brandId?: string | null,
): RadarSiloExportMemberDescriptor[] {
  const promessa = new Map<string, { numero: number; titulo: string }>();
  for (const versao of versoes) {
    const articleId = textoLimpo(versao?.payload?.articleId);
    if (!articleId || (brandId && versao.payload.brandId !== brandId)) continue;
    const atual = promessa.get(articleId);
    if (!atual || versao.versionNumber > atual.numero) promessa.set(articleId, { numero: versao.versionNumber, titulo: textoLimpo(versao.payload.promise) });
  }
  return radarSiloMemberDescriptorsOfArticleDnas(versoes, brandId).map(descritor => ({
    ...descritor,
    title: promessa.get(descritor.articleId)?.titulo || null,
  }));
}

/** Um faltante, como a tela o mostra: pelo título, nunca pelo id. */
export type RadarPortableExportSiloPending = {
  title: string;
  status: string;
  reason: string | null;
};

export type RadarPortableExportSiloFile = {
  filename: string;
  csv: string;
  silo: {
    /** O nome do silo, "Silo sem nome N" ou "Sem silo". */
    name: string;
    kind: "silo" | "no_silo";
    partial: boolean;
    exported: number;
    total: number;
    pending: RadarPortableExportSiloPending[];
    warnings: string[];
  };
};

const rotuloDoMembro = (membro: Pick<RadarSiloExportMember, "title" | "principalKeyword" | "slug">): string =>
  membro.title || membro.principalKeyword || membro.slug || "artigo sem título conhecido";

const pendenteDe = (membro: RadarSiloExportMember): RadarPortableExportSiloPending => ({
  title: rotuloDoMembro(membro),
  status: membro.statusLabel,
  reason: membro.reason,
});

/**
 * ===== UM CSV POR SILO, NA ORDEM DO SILO =====
 *
 * As linhas já foram montadas pela rota, pela MESMA cadeia do dossiê avulso;
 * o plano só diz quais entram em cada arquivo e em que ordem. `articleIds` do
 * plano são internos — servem para casar plano e linha e não saem daqui: o
 * faltante vai para a tela pelo título e pela situação.
 */
export function radarPortableExportSiloFiles(input: {
  plan: Pick<RadarSiloExportPlan, "files">;
  rowsByArticleId: ReadonlyMap<string, RadarPortableExportRow>;
}): RadarPortableExportSiloFile[] {
  return input.plan.files.map(arquivo => {
    const linhas = arquivo.articleIds
      .map(articleId => input.rowsByArticleId.get(articleId))
      .filter((linha): linha is RadarPortableExportRow => Boolean(linha));
    return {
      filename: arquivo.filename,
      csv: radarPortableExportCsv(linhas),
      silo: {
        name: arquivo.siloLabel,
        kind: arquivo.kind,
        partial: arquivo.partial,
        exported: linhas.length,
        total: arquivo.total,
        pending: arquivo.pending.map(pendenteDe),
        warnings: arquivo.warnings,
      },
    };
  });
}

/** Os silos sem nenhum artigo finalizado: sem arquivo, com os faltantes pelo título. */
export function radarPortableExportEmptySilos(plan: Pick<RadarSiloExportPlan, "emptySilos">): Array<{ name: string; pending: RadarPortableExportSiloPending[] }> {
  return plan.emptySilos.map(silo => ({ name: silo.siloLabel, pending: silo.pending.map(pendenteDe) }));
}
