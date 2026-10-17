import "server-only";
import { readKnownVolume, type KnownVolume } from "@/lib/editorial/known-before-search";
import { serpIdentityPrincipalCheck, type SerpIdentityArticle, type SerpIdentityCheck, type SerpIdentityRow } from "@/lib/arquiteto/article-batch-serp";

/*
 * LER ANTES DE BUSCAR — o leitor do servidor (F3, SDD
 * `docs/compartilhado/sdd-arquiteto-so-le-e-listas-leves-2026-10-13.md`, item 3).
 *
 * Lê do BANCO, por id e em projeção estreita (nunca do pedido do navegador e
 * nunca o `analise_semantica` inteiro), o que decide se uma busca paga é
 * necessária: o volume da coluna, a fonte, a medição gravada (só data, média e
 * provider) e a elegibilidade ("sem média" do Google Ads). Só leitura: nenhum
 * caminho daqui escreve.
 */

export const KNOWN_BEFORE_SEARCH_COLUMNS = [
  "id",
  "keyword",
  "volume_search",
  "volume_source",
  "volume_eligibility:analise_semantica->volume_eligibility",
  "volume_measured_at:analise_semantica->volume_measurement->>measuredAt",
  "volume_measured_average:analise_semantica->volume_measurement->averageMonthlySearches",
  "volume_measured_provider:analise_semantica->volume_measurement->>provider",
].join(",");

const LOTE = 200;

export type KnownKeyword = {
  id: string;
  keyword: string;
  /** A coluna `volume_search` como está no banco (`undefined` = a leitura não trouxe a coluna). */
  volumeSearch: number | null | undefined;
  volumeSource: string | null;
  volume: KnownVolume;
};

type Linha = Record<string, unknown>;
type ClienteLeitura = { from: (table: string) => unknown };

/** A linha estreita volta a ter a forma que `readKnownVolume` lê. */
export function knownKeywordFromRow(linha: Linha, now: Date): KnownKeyword | null {
  const id = typeof linha.id === "string" ? linha.id : null;
  if (!id) return null;
  const volumeSearch = "volume_search" in linha ? (typeof linha.volume_search === "number" && Number.isFinite(linha.volume_search) ? linha.volume_search : null) : undefined;
  const volumeSource = typeof linha.volume_source === "string" ? linha.volume_source : null;
  const medicao = linha.volume_measured_at !== undefined || linha.volume_measured_average !== undefined || linha.volume_measured_provider !== undefined
    ? { measuredAt: linha.volume_measured_at ?? null, averageMonthlySearches: linha.volume_measured_average ?? null, provider: linha.volume_measured_provider ?? null }
    : undefined;
  const semantic: Record<string, unknown> = {};
  if (linha.volume_eligibility && typeof linha.volume_eligibility === "object") semantic.volume_eligibility = linha.volume_eligibility;
  if (medicao) semantic.volume_measurement = medicao;
  return {
    id,
    keyword: typeof linha.keyword === "string" ? linha.keyword : "",
    volumeSearch,
    volumeSource,
    volume: readKnownVolume({ volume_search: volumeSearch ?? null, volume_source: volumeSource, analise_semantica: semantic }, now),
  };
}

/**
 * Normalizada → volume que já temos (número medido, ou `null` para "sem média"
 * há menos de 30 dias). A keyword que falta medir fica FORA do mapa: só ela vai
 * ao Google Ads.
 */
export function knownVolumesByNormalized(brand: ReadonlyMap<string, { keywordId: string; known: KnownVolume }> | null | undefined): Map<string, number | null> {
  const mapa = new Map<string, number | null>();
  for (const [normalizada, { known }] of brand ?? []) {
    if (known.state === "measured") mapa.set(normalizada, known.volume);
    else if (known.state === "no_average") mapa.set(normalizada, null);
  }
  return mapa;
}

/**
 * As keywords da marca ativa, pelos ids pedidos, com o que já sabemos de cada
 * uma. `readFailed` = o banco não respondeu: quem chama decide (nunca paga às
 * cegas pelo que não conseguiu conferir).
 */
export async function readKnownBeforeSearch(client: ClienteLeitura, brandId: string, keywordIds: readonly string[], now: Date = new Date()): Promise<{ keywords: Map<string, KnownKeyword>; readFailed: boolean }> {
  const keywords = new Map<string, KnownKeyword>();
  const ids = [...new Set(keywordIds.filter(id => typeof id === "string" && id.trim() && !id.startsWith("territory:")))];
  if (!ids.length) return { keywords, readFailed: false };
  try {
    for (let inicio = 0; inicio < ids.length; inicio += LOTE) {
      const lote = ids.slice(inicio, inicio + LOTE);
      const consulta = (client.from("minerador_keywords") as { select: (c: string) => { eq: (k: string, v: string) => { is: (k: string, v: null) => { in: (k: string, v: string[]) => PromiseLike<{ data: unknown; error: unknown }> } } } })
        .select(KNOWN_BEFORE_SEARCH_COLUMNS).eq("brand_id", brandId).is("deleted_at", null).in("id", lote);
      const resultado = await consulta;
      if (resultado.error) throw new Error("falha na leitura do que já sabemos");
      for (const linha of (Array.isArray(resultado.data) ? resultado.data : []) as Linha[]) {
        const lida = knownKeywordFromRow(linha, now);
        if (lida) keywords.set(lida.id, lida);
      }
    }
    return { keywords, readFailed: false };
  } catch {
    return { keywords: new Map(), readFailed: true };
  }
}

/*
 * 2026-10-17 · A PRINCIPAL DE IDENTIDADE, CONFERIDA NO BANCO (a régua única
 * da coleta, `serpCollectionAllowed`: sem volume, só a principal de identidade
 * do artigo tem a SERP coletada). O servidor não confia no pedido: relê dos
 * dados gravados — o pacote aprovado que o Arquiteto recebeu
 * (`editorial_workflow_items`, etapa architect: plano, título do Assunto,
 * marca de principal declarada e Vínculo publicado), o status legado da keyword
 * e o ArticleDNA vigente em que ela aparece — e responde pela MESMA função da
 * tela (`serpIdentityPrincipalCheck`). Projeção estreita, nunca o pacote
 * inteiro. Leitura que falha = `readFailed`: quem chama recusa (nada é pago às
 * cegas). Só leitura.
 */
const IDENTITY_PACKAGE_COLUMNS = [
  "subject_id",
  "state",
  "pkg_keyword:payload->approvedDna->>keyword",
  "pkg_brand:payload->approvedDna->>brandId",
  "keyword_subject:payload->approvedDna->analiseSemantica->keyword_subject",
  "keyword_declared_principal:payload->approvedDna->analiseSemantica->keyword_declared_principal",
  "site_origin:payload->approvedDna->analiseSemantica->site_origin",
].join(",");
const IDENTITY_ARTICLE_COLUMNS = [
  "version_id",
  "entity_id",
  "version_number",
  "principal:payload->>principalKeywordId",
  "subject:payload->subject->>keywordId",
  "subject_phrase:payload->subject->>phrase",
  "secondary:payload->secondaryKeywordIds",
  "reinforcement:payload->narrativeReinforcementIds",
  "published_slug:payload->publishedIdentityRef->>slug",
  "published_url:payload->publishedIdentityRef->>publishedUrl",
].join(",");

type Consulta = { select: (c: string) => Consulta; eq: (k: string, v: unknown) => Consulta; is: (k: string, v: null) => Consulta; in: (k: string, v: readonly string[]) => PromiseLike<{ data: unknown; error: unknown }> };
const textoDe = (value: unknown): string | null => typeof value === "string" && value.trim() ? value.trim() : null;
const objetoDe = (value: unknown): Record<string, unknown> | null => value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
const idsDe = (value: unknown): string[] => Array.isArray(value) ? value.map(textoDe).filter((id): id is string => Boolean(id)) : [];

async function linhasDe(client: ClienteLeitura, tabela: string, colunas: string, filtros: (consulta: Consulta) => Consulta, coluna: string, ids: readonly string[]): Promise<Linha[]> {
  const linhas: Linha[] = [];
  for (let inicio = 0; inicio < ids.length; inicio += LOTE) {
    const resultado = await filtros((client.from(tabela) as Consulta).select(colunas)).in(coluna, ids.slice(inicio, inicio + LOTE));
    if (resultado.error) throw new Error(`falha na leitura de ${tabela}`);
    linhas.push(...((Array.isArray(resultado.data) ? resultado.data : []) as Linha[]));
  }
  return linhas;
}

export async function readSerpIdentityPrincipals(client: ClienteLeitura, brandId: string, keywordIds: readonly string[]): Promise<{ checks: Map<string, SerpIdentityCheck>; readFailed: boolean }> {
  const checks = new Map<string, SerpIdentityCheck>();
  const ids = [...new Set(keywordIds.filter(id => typeof id === "string" && id.trim() && !id.startsWith("territory:")))];
  if (!ids.length) return { checks, readFailed: false };
  try {
    const pacotes = new Map<string, SerpIdentityRow>();
    const lerPacotes = async (alvos: readonly string[]) => {
      const linhas = await linhasDe(client, "editorial_workflow_items", IDENTITY_PACKAGE_COLUMNS,
        consulta => consulta.eq("marca_id", brandId).eq("subject_type", "keyword").eq("stage", "architect"), "subject_id", alvos);
      for (const linha of linhas) {
        const id = textoDe(linha.subject_id);
        // Só o item recebido, com o pacote DESTA marca.
        if (!id || (textoDe(linha.state) ?? "received") !== "received" || (textoDe(linha.pkg_brand) && linha.pkg_brand !== brandId)) continue;
        const semantica: Record<string, unknown> = {};
        for (const chave of ["keyword_subject", "keyword_declared_principal", "site_origin"] as const) if (linha[chave] !== null && linha[chave] !== undefined) semantica[chave] = linha[chave];
        pacotes.set(id, { keywordId: id, keyword: textoDe(linha.pkg_keyword) ?? "", packageSemantic: textoDe(linha.pkg_keyword) ? semantica : null, status: null });
      }
    };
    await lerPacotes(ids);
    // O Assunto que declarou a principal (marca recíproca): o título e o slug do plano moram nele.
    const assuntos = [...new Set([...pacotes.values()].map(linha => textoDe(objetoDe(linha.packageSemantic?.keyword_declared_principal)?.subjectKeywordId)).filter((id): id is string => Boolean(id) && !pacotes.has(id!)))];
    if (assuntos.length) await lerPacotes(assuntos);
    // O status legado ("publicado") da keyword: a outra porta do publicado (U1).
    const comUuid = ids.filter(id => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id));
    const status = comUuid.length ? await linhasDe(client, "minerador_keywords", "id,status", consulta => consulta.eq("brand_id", brandId).is("deleted_at", null), "id", comUuid) : [];
    for (const linha of status) { const id = textoDe(linha.id); const pacote = id ? pacotes.get(id) : undefined; if (pacote) pacote.status = textoDe(linha.status); }
    // O ArticleDNA vigente em que ela aparece (como principal ou como Assunto), pela maior versão de cada artigo.
    const doArtigo = (filtro: string) => linhasDe(client, "editorial_artifact_versions", IDENTITY_ARTICLE_COLUMNS,
      consulta => consulta.eq("marca_id", brandId).eq("artifact_type", "article_dna"), filtro, ids);
    const achadas = [...await doArtigo("payload->>principalKeywordId"), ...await doArtigo("payload->subject->>keywordId")];
    const entidades = [...new Set(achadas.map(linha => textoDe(linha.entity_id)).filter((id): id is string => Boolean(id)))];
    const versoes = entidades.length ? await linhasDe(client, "editorial_artifact_versions", IDENTITY_ARTICLE_COLUMNS,
      consulta => consulta.eq("marca_id", brandId).eq("artifact_type", "article_dna"), "entity_id", entidades) : [];
    const vigente = new Map<string, Linha>();
    for (const linha of [...achadas, ...versoes]) {
      const entidade = textoDe(linha.entity_id);
      if (!entidade) continue;
      const atual = vigente.get(entidade);
      if (!atual || Number(linha.version_number) > Number(atual.version_number)) vigente.set(entidade, linha);
    }
    const artigos: SerpIdentityArticle[] = [...vigente.values()].map(linha => {
      const principal = textoDe(linha.principal);
      return {
        principalKeywordId: principal,
        subjectKeywordId: textoDe(linha.subject),
        keywordIds: [...new Set([...(principal ? [principal] : []), ...idsDe(linha.secondary), ...idsDe(linha.reinforcement)])],
        subjectPhrase: textoDe(linha.subject_phrase),
        publishedSlug: textoDe(linha.published_slug) ?? (textoDe(linha.published_url)?.split("/").filter(Boolean).at(-1) ?? null),
      };
    });
    // O Assunto do artigo em que ela é a principal: o slug do plano mora no pacote dele.
    const assuntosDosArtigos = [...new Set(artigos.filter(artigo => artigo.principalKeywordId && ids.includes(artigo.principalKeywordId)).map(artigo => artigo.subjectKeywordId).filter((id): id is string => Boolean(id) && !pacotes.has(id!)))];
    if (assuntosDosArtigos.length) await lerPacotes(assuntosDosArtigos);
    for (const id of ids) checks.set(id, serpIdentityPrincipalCheck({ keywordId: id, rowOf: keywordId => pacotes.get(keywordId), articles: artigos }));
    return { checks, readFailed: false };
  } catch {
    return { checks: new Map(), readFailed: true };
  }
}
