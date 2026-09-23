import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import {
  SERP_CACHE_STAGE,
  SERP_CACHE_SUBJECT_TYPE,
  SerpCacheMetaSchema,
  SerpCacheObservationSchema,
  SerpOrganicDigestSchema,
  buildSerpCacheRow,
  serpCacheFreshness,
  type SerpCacheMeta,
  type SerpCacheObservation,
  type SerpCachePayload,
  type SerpOrganicDigest,
} from "@/lib/editorial/serp-cache";

/**
 * Persistência do cache temporário de SERP em `editorial_workflow_items`.
 *
 * Sem DDL: `subject_type` próprio, estágio `minerador`, mesma chave única
 * (marca, subject_type, subject_id, stage) que os outros registros usam.
 *
 * Cada leitura e escrita segue as regras vigentes da SDD de egress
 * (docs/compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md):
 *
 *   R4  toda consulta filtra `marca_id`, mesmo com service role;
 *   R5  nenhum `select("*")`: colunas explícitas;
 *   R6  a escrita devolve só `id,lock_version`, nunca a linha;
 *   R8  quem agrupa lê só `meta` + `observation` (~1 KB); o corpo trafega
 *       apenas para quem precisa normalizar.
 *
 * O caminho `payload->campo` com apelido é sintaxe do PostgREST suportada
 * pelo `postgrest-js` instalado; é o que impede o corpo de viajar junto.
 */

/** O mínimo que o store precisa. `PipelineContext` satisfaz. */
export type SerpCacheContext = {
  readonly supabase: SupabaseClient;
  readonly brandId: string;
  /** Vai para `created_by`/`updated_by`: a tabela exige um usuário real. */
  readonly actorUserId: string;
};

/**
 * `digest` (aditivo, 2026-09-23): `meta` + o digest orgânico (~5 KB), para quem
 * CLASSIFICA uma lente sem corpo — a intenção e o funil do Minerador pelas
 * quatro lentes. Nenhum leitor de `observation` passa a trazê-lo.
 */
export type SerpCacheReadMode = "meta" | "observation" | "body" | "digest";

export type SerpCacheStoredEntry = {
  subjectId: string;
  meta: SerpCacheMeta;
  observation?: SerpCacheObservation;
  body?: Record<string, unknown>;
  digest?: SerpOrganicDigest;
};

const COLUNAS: Record<SerpCacheReadMode, string> = {
  meta: "subject_id,meta:payload->meta",
  observation: "subject_id,meta:payload->meta,observation:payload->observation",
  body: "subject_id,meta:payload->meta,body:payload->body",
  digest: "subject_id,meta:payload->meta,digest:payload->digest",
};

/**
 * Lote de ids por consulta. O `.in(...)` vai na URL; 100 é o lote que o
 * repositório já usa no Minerador Discovery.
 */
export const SERP_CACHE_READ_CHUNK = 100;

function erro(contexto: string, causa: { message?: string; code?: string } | null) {
  return new Error(`${contexto}: ${causa?.message || "falha desconhecida"}${causa?.code ? ` (${causa.code})` : ""}`);
}

/**
 * Lê as entradas pedidas, na camada pedida. Entrada que não passa no
 * contrato vira ausência — nunca dado meio lido.
 */
export async function readSerpCacheEntries(
  context: SerpCacheContext,
  subjectIds: readonly string[],
  mode: SerpCacheReadMode,
): Promise<Map<string, SerpCacheStoredEntry>> {
  const unicos = [...new Set(subjectIds)];
  const encontradas = new Map<string, SerpCacheStoredEntry>();
  for (let inicio = 0; inicio < unicos.length; inicio += SERP_CACHE_READ_CHUNK) {
    const lote = unicos.slice(inicio, inicio + SERP_CACHE_READ_CHUNK);
    const resultado = await context.supabase
      .from("editorial_workflow_items")
      .select(COLUNAS[mode])
      .eq("marca_id", context.brandId)
      .eq("subject_type", SERP_CACHE_SUBJECT_TYPE)
      .eq("stage", SERP_CACHE_STAGE)
      .in("subject_id", lote);
    if (resultado.error) throw erro("Leitura do cache de SERP", resultado.error);

    for (const linha of (resultado.data || []) as unknown as Array<Record<string, unknown>>) {
      const subjectId = typeof linha.subject_id === "string" ? linha.subject_id : null;
      const meta = SerpCacheMetaSchema.safeParse(linha.meta);
      if (!subjectId || !meta.success) continue;
      const entrada: SerpCacheStoredEntry = { subjectId, meta: meta.data };
      if (mode === "observation") {
        const observacao = SerpCacheObservationSchema.safeParse(linha.observation);
        if (!observacao.success) continue;
        entrada.observation = observacao.data;
      }
      if (mode === "body") {
        const corpo = linha.body;
        if (!corpo || typeof corpo !== "object" || Array.isArray(corpo)) continue;
        entrada.body = corpo as Record<string, unknown>;
      }
      if (mode === "digest") {
        /*
         * Ao contrário da observação e do corpo, o digest ausente NÃO tira a
         * entrada: ela continua valendo para quem só pergunta se a lente está
         * no cache (a cobertura não paga de novo). Quem classifica trata a
         * entrada sem digest como lente faltante.
         */
        const digest = SerpOrganicDigestSchema.safeParse(linha.digest);
        if (digest.success) entrada.digest = digest.data;
      }
      encontradas.set(subjectId, entrada);
    }
  }
  return encontradas;
}

/**
 * `kept`: a escrita era SEM corpo e a entrada gravada tem corpo e ainda vale —
 * ela fica, porque serve a todo leitor que a escrita sem corpo serviria e
 * também a quem precisa do corpo.
 */
export type SerpCacheWriteOutcome = "created" | "updated" | "concurrent" | "kept";

/**
 * A procura de uma escrita SEM corpo também pergunta se a gravada tem corpo —
 * por um marcador de texto, nunca pelo corpo (R8). Todo corpo gravado passou
 * pela normalização, que recusa `status_code` raiz diferente de 20000: o
 * marcador só é nulo quando não há corpo. E pergunta a profundidade gravada:
 * uma entrada mais rasa que o pedido não o atende.
 */
const PROCURA = "id,lock_version,source_entity_id,collectedAt:payload->meta->>collectedAt";
const PROCURA_SEM_CORPO = `${PROCURA},bodyStatus:payload->body->>status_code,bodyDepth:payload->meta->>depth`;

type EntradaProcurada = { id: string; lock_version: number; source_entity_id?: unknown; collectedAt?: unknown; bodyStatus?: unknown; bodyDepth?: unknown };

/**
 * Grava a entrada, criando ou sucedendo a anterior.
 *
 * O cache é otimização: a SERP já está na mão de quem chamou. Por isso uma
 * corrida — outra aba ou outro módulo gravando a mesma chave ao mesmo tempo —
 * não é erro: a outra coleta é tão válida quanto esta, e o resultado é
 * `concurrent`. Nenhuma nova tentativa, nenhuma chamada paga repetida.
 */
export async function writeSerpCacheEntry(
  context: SerpCacheContext,
  payload: SerpCachePayload,
): Promise<SerpCacheWriteOutcome> {
  const pedida = buildSerpCacheRow(payload);
  const semCorpo = payload.body === undefined;
  // `string`, não a união dos dois literais: o parser de tipos do postgrest-js recusa a união.
  const colunasDaProcura: string = semCorpo ? PROCURA_SEM_CORPO : PROCURA;
  const procura = await context.supabase
    .from("editorial_workflow_items")
    .select(colunasDaProcura)
    .eq("marca_id", context.brandId)
    .eq("subject_type", pedida.subjectType)
    .eq("stage", pedida.stage)
    .eq("subject_id", pedida.subjectId)
    .maybeSingle();
  if (procura.error) throw erro("Leitura da entrada de cache de SERP", procura.error);
  const atual = { data: procura.data as unknown as EntradaProcurada | null };

  /*
   * O cache só anda para a frente. Duas requisições pagando a mesma chave: a
   * que começou antes termina depois e grava uma coleta mais VELHA por cima da
   * nova. A mais nova fica — a outra perdeu a corrida.
   */
  const gravadaEm = Date.parse(String(atual.data?.collectedAt ?? ""));
  if (Number.isFinite(gravadaEm) && gravadaEm > Date.parse(payload.meta.collectedAt)) return "concurrent";

  /*
   * Uma escrita sem corpo NUNCA apaga o corpo de uma entrada que ainda vale e
   * atende a profundidade pedida. Acontece numa corrida (o Arquiteto gravou a
   * lente com corpo entre a consulta e a gravação do Minerador). Trocar a
   * entrada completa por uma sem corpo faria o próximo leitor de corpo pagar
   * de novo o que já estava pago. A vencida pode ser trocada: nenhum leitor a
   * aceitaria. A mais RASA que o pedido também: mantê-la faria quem pediu a
   * profundidade maior ver falta e pagar de novo a cada execução, até ela
   * vencer; trocada, só o leitor de corpo raso paga uma vez. O `lock_version`
   * do UPDATE abaixo cobre o corpo que chegar depois desta procura: a escrita
   * perde a corrida e não grava.
   */
  const corpoGravado = atual.data?.bodyStatus;
  if (semCorpo && atual.data && corpoGravado !== null && corpoGravado !== undefined) {
    const vigente = serpCacheFreshness({ collectedAt: String(atual.data.collectedAt ?? "") }, { now: new Date(payload.meta.collectedAt) });
    const profundidadeGravada = Number(atual.data.bodyDepth);
    const atendeProfundidade = Number.isFinite(profundidadeGravada) && profundidadeGravada >= payload.meta.depth;
    if (vigente.fresh && atendeProfundidade) return "kept";
  }

  /*
   * Uma coleta sem keyword (pergunta territorial por texto) que sucede uma
   * entrada presa a uma keyword do acervo HERDA a keyword. Sem isso a entrada
   * perderia o vínculo e sobreviveria à exclusão da keyword como órfã.
   */
  const anterior = (atual.data as { source_entity_id?: unknown } | null)?.source_entity_id;
  const keywordHerdada = !payload.meta.keywordId && typeof anterior === "string" && anterior && anterior !== pedida.subjectId
    ? anterior
    : null;
  const linha = keywordHerdada
    ? buildSerpCacheRow({ ...payload, meta: { ...payload.meta, keywordId: keywordHerdada } })
    : pedida;

  if (!atual.data) {
    const criada = await context.supabase
      .from("editorial_workflow_items")
      .insert({
        marca_id: context.brandId,
        subject_type: linha.subjectType,
        subject_id: linha.subjectId,
        article_id: linha.articleId,
        stage: linha.stage,
        state: linha.state,
        source_entity_id: linha.sourceEntityId,
        payload: linha.payload,
        created_by: context.actorUserId,
        updated_by: context.actorUserId,
      })
      .select("id,lock_version")
      .maybeSingle();
    if (criada.error?.code === "23505") return "concurrent";
    if (criada.error) throw erro("Gravação do cache de SERP", criada.error);
    return "created";
  }

  const atualizada = await context.supabase
    .from("editorial_workflow_items")
    .update({
      state: linha.state,
      source_entity_id: linha.sourceEntityId,
      payload: linha.payload,
      updated_by: context.actorUserId,
    })
    .eq("id", (atual.data as { id: string }).id)
    .eq("marca_id", context.brandId)
    .eq("lock_version", (atual.data as { lock_version: number }).lock_version)
    .select("id,lock_version")
    .maybeSingle();
  if (atualizada.error) throw erro("Atualização do cache de SERP", atualizada.error);
  // Sem linha devolvida: outro escritor passou na frente com lock novo.
  return atualizada.data ? "updated" : "concurrent";
}
