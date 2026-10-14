import { keywordSubjectBlocksDeletion } from "../lib/minerador/keyword-subject.ts";
import { PlanFakeDb, type Row } from "./plano-declarado-fake-db.mts";

/**
 * BANCO DE MENTIRA DA F7 "EXCLUIR TUDO DA COR" — em memória, sem rede.
 *
 * O `PlanFakeDb` de sempre (tabelas, view de resumo dos grupos, update com
 * releitura) + as RPCs que o núcleo chama:
 *
 *   - `lifecycle_preview_minerador_keywords`: o impacto de sempre por id
 *     (`recoverable` para as publicadas, `blocked` para as com documento no
 *     Redator, `hard` para o resto);
 *   - `lifecycle_delete_group_keywords_contract` e `lifecycle_delete_group_keywords`
 *     (M-E): só existem com `meAplicada = true`; sem ela, o erro do PostgREST
 *     para função ausente (PGRST202).
 *
 * A RPC da M-E segue o SQL da migration: confere bloco (1–100), grupo da marca
 * e "todas vivas desta cor"; LIBERA o Assunto (tira `keyword_subject.plan` e a
 * marca de principal; grava o marcador de liberação com a via da exclusão da cor);
 * e só ENTÃO roda o ciclo de vida de sempre — que recusa publicada sem a
 * declaração, descendente no Redator e, como o gatilho do banco
 * (`keywordSubjectBlocksDeletion` é o espelho dele), Assunto ainda protegido.
 * Qualquer recusa desfaz o bloco inteiro (inclusive a liberação): é uma transação.
 *
 * NENHUM banco real é tocado. Fora dos globs das suítes.
 */

type RpcResult = { data: unknown; error: { code: string; message: string } | null };

const erro = (message: string, code = "P0001"): RpcResult => ({ data: null, error: { code, message } });
const isObj = (value: unknown): value is Row => Boolean(value) && typeof value === "object" && !Array.isArray(value);

/** O espelho em TS do passo 1 da RPC (a liberação), igual ao SQL da M-E. */
export function liberacaoDaCor(semantic: Row, input: { actorId: string; requestId: string; at: string }): Row {
  const assunto = semantic.keyword_subject;
  const temAlgo = (isObj(assunto) && (isObj(assunto.plan) || isObj(assunto.entry))) || "keyword_declared_principal" in semantic;
  if (!temAlgo) return semantic;
  const novo = structuredClone(semantic);
  if (isObj(novo.keyword_subject)) delete (novo.keyword_subject as Row).plan;
  delete novo.keyword_declared_principal;
  novo.keyword_subject_release = { requestId: input.requestId, reason: "Excluir tudo da cor", actorId: input.actorId, at: input.at, via: "excluir_cor" };
  return novo;
}

export class CorFakeDb extends PlanFakeDb {
  meAplicada = true;
  publicadas = new Set<string>();
  bloqueadas = new Set<string>();
  /** Recusa a N-ésima chamada da RPC da M-E (1 = a primeira) com o código dado. */
  recusarChamada: { n: number; code: string } | null = null;
  rpcLog: Array<{ name: string; args: Row }> = [];
  /** Por chamada da M-E: os ids liberados e os excluídos, na ordem em que aconteceram. */
  transacoes: Array<{ ok: boolean; passos: string[] }> = [];
  private chamadasDaMe = 0;

  async rpc(name: string, args: Row = {}): Promise<RpcResult> {
    this.rpcLog.push({ name, args: structuredClone(args) });
    if (name === "lifecycle_preview_minerador_keywords") {
      const ids = (args.p_keyword_ids as string[]) ?? [];
      const items = ids.map(id => {
        const row = this.rows("minerador_keywords").find(item => item.id === id && item.brand_id === args.p_brand_id);
        return {
          root: { id, label: row?.keyword ?? "" },
          mode: this.publicadas.has(id) ? "recoverable" : this.bloqueadas.has(id) ? "blocked" : "hard",
          recoveryState: "active",
        };
      });
      return { data: { items }, error: null };
    }
    if (name === "lifecycle_delete_group_keywords_contract") {
      return this.meAplicada
        ? { data: { operation: "lifecycle_delete_group_keywords", version: 1, maxIds: 100, via: "excluir_cor" }, error: null }
        : erro("Could not find the function public.lifecycle_delete_group_keywords_contract without parameters in the schema cache", "PGRST202");
    }
    if (name === "lifecycle_delete_group_keywords") {
      if (!this.meAplicada) return erro("Could not find the function public.lifecycle_delete_group_keywords(p_actor_user_id, p_allow_recoverable, p_brand_id, p_group_id, p_keyword_ids, p_request_id) in the schema cache", "PGRST202");
      this.chamadasDaMe += 1;
      if (this.recusarChamada && this.recusarChamada.n === this.chamadasDaMe) {
        this.transacoes.push({ ok: false, passos: [] });
        return erro(this.recusarChamada.code);
      }
      return this.grupoDelete(args);
    }
    return erro(`Could not find the function public.${name}`, "PGRST202");
  }

  /** A exclusão comum, SEM a liberação (o que o gatilho recusaria). */
  async exclusaoComum(brandId: string, ids: string[], allowRecoverable = false) {
    const fotografia = structuredClone(this.tables.minerador_keywords);
    const resultado = this.cicloDeVida(brandId, ids, allowRecoverable, []);
    if (resultado.error) this.tables.minerador_keywords = fotografia;
    return resultado;
  }

  private grupoDelete(args: Row): RpcResult {
    const ids = [...new Set(((args.p_keyword_ids as string[]) ?? []).filter(Boolean))].sort();
    if (!ids.length || ids.length > 100 || !args.p_brand_id || !args.p_group_id || !args.p_actor_user_id || !args.p_request_id) return erro("GROUP_DELETE_INVALID");
    const grupo = this.rows("editorial_groups").find(item => item.id === args.p_group_id && item.marca_id === args.p_brand_id);
    if (!grupo) return erro("GROUP_DELETE_OUTSIDE_GROUP");
    const vivas = this.rows("minerador_keywords").filter(row => row.brand_id === args.p_brand_id && ids.includes(row.id as string) && row.group_id === args.p_group_id && !row.deleted_at);
    if (vivas.length !== ids.length) return erro("GROUP_DELETE_OUTSIDE_GROUP");
    const fotografia = structuredClone(this.tables.minerador_keywords);
    const passos: string[] = [];
    // 1. a liberação (antes da exclusão, na mesma "transação").
    const liberadas: string[] = [];
    for (const row of vivas) {
      const antes = row.analise_semantica as Row;
      const depois = liberacaoDaCor(antes, { actorId: String(args.p_actor_user_id), requestId: String(args.p_request_id), at: "2026-10-14T12:00:00.000Z" });
      if (depois !== antes) {
        row.analise_semantica = depois;
        liberadas.push(row.id as string);
        passos.push(`libera:${row.id}`);
      }
    }
    // 2. o ciclo de vida de sempre; qualquer recusa desfaz TUDO (inclusive a liberação).
    const resultado = this.cicloDeVida(String(args.p_brand_id), ids, args.p_allow_recoverable === true, passos);
    if (resultado.error) {
      this.tables.minerador_keywords = fotografia;
      this.transacoes.push({ ok: false, passos: [] });
      return { data: null, error: resultado.error };
    }
    this.transacoes.push({ ok: true, passos });
    return { data: { ...(resultado.data as Row), releasedSubjectIds: liberadas.sort(), requestId: args.p_request_id, groupId: args.p_group_id, via: "excluir_cor" }, error: null };
  }

  private cicloDeVida(brandId: string, ids: string[], allowRecoverable: boolean, passos: string[]): RpcResult {
    const linhas = ids.map(id => this.rows("minerador_keywords").find(row => row.id === id && row.brand_id === brandId));
    if (linhas.some(row => !row)) return erro("KEYWORD_DELETE_NOT_FOUND");
    const publicadas = ids.filter(id => this.publicadas.has(id));
    if (!allowRecoverable && publicadas.length) return erro(`KEYWORD_DELETE_REQUIRES_RECOVERABLE_FLOW: ${publicadas.join(", ")}`);
    if (ids.some(id => this.bloqueadas.has(id))) return erro("LIFECYCLE_DRAFT_DESCENDANT_REQUIRES_OWNER");
    const hard: string[] = [];
    const recoverable: string[] = [];
    for (const row of linhas as Row[]) {
      // O gatilho minerador_keywords_recusa_exclusao_com_assunto (DELETE e ida para a lixeira).
      if (keywordSubjectBlocksDeletion(row.analise_semantica as Row)) return erro(`KEYWORD_DELETE_SUBJECT_PROTECTED: a keyword "${row.keyword}" carrega o Assunto do plano do Silo.`);
      if (this.publicadas.has(row.id as string)) {
        row.deleted_at = "2026-10-14T12:00:00.000Z";
        row.purge_after = "2026-10-15T12:00:00.000Z";
        recoverable.push(row.id as string);
        passos.push(`lixeira:${row.id}`);
      } else {
        hard.push(row.id as string);
        passos.push(`apaga:${row.id}`);
      }
    }
    this.tables.minerador_keywords = this.rows("minerador_keywords").filter(row => !hard.includes(row.id as string));
    return { data: { hardDeletedIds: hard.sort(), recoverableIds: recoverable.sort(), partialDelete: false }, error: null };
  }
}

export type { Row };
