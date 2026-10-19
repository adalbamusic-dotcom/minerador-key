/**
 * ===== A ÚNICA PORTA DA TELA PARA A FRONTEIRA — RADAR_TO_WRITER_HANDOFF_1 =====
 *
 * ================== POR QUE ISTO EXISTE COMO MÓDULO ==================
 *
 * Este módulo era o cliente do Planejador. Ele não foi copiado para o Redator:
 * foi MOVIDO. Copiar deixaria dois clientes vivos, cada um com sua tradução de
 * recusa — e a tela acabaria mostrando "bloqueado" para um e "falhou" para o
 * outro diante do mesmo motivo.
 *
 * O Planejador saiu do fluxo operacional; o destino da entrega é o Redator.
 * Aqui existe UMA chamada, e ela é a mesma para um artigo ou para trinta. O
 * lote é orquestração — ele repete esta porta, não abre outra.
 *
 * ================== O DESFECHO É POR ARTIGO — §5 ==================
 *
 * Um artigo bloqueado não pode fabricar sucesso nos outros nem esconder os que
 * passaram. Por isso o resultado é uma lista, e o resumo é derivado dela.
 */

/** §5 · o vocabulário do desfecho, por artigo. */
export const RADAR_HANDOFF_OUTCOMES = [
  "IMPORTED",
  "ALREADY_IMPORTED",
  "TRANSITION_COMPLETED",
  "BLOCKED_NOT_READY",
  "BLOCKED_STALE",
  "FAILED",
] as const;
export type RadarHandoffOutcome = typeof RADAR_HANDOFF_OUTCOMES[number];

export type RadarHandoffItemResult = {
  articleId: string;
  outcome: RadarHandoffOutcome;
  /** A frase de quem opera. O código técnico fica em `code`. */
  message: string;
  code: string | null;
};

/**
 * DE QUE FORMA CADA RECUSA VIRA DESFECHO.
 *
 * A tradução mora num lugar só porque ela decide o que a tela mostra como
 * "bloqueado" e o que ela mostra como "falhou" — e as duas pedem ações
 * diferentes de quem opera: uma é trabalho de investigação, a outra é problema
 * de infraestrutura.
 */
export function radarHandoffOutcomeOfCode(code: string | null | undefined): RadarHandoffOutcome {
  if (code === "radar_handoff_blocked_stale") return "BLOCKED_STALE";
  if (code === "radar_handoff_blocked"
    || code === "radar_research_not_finalized"
    || code === "radar_not_approved"
    || code === "radar_bundle_unavailable"
    /*
     * Documento já existente é BLOQUEIO, não falha.
     *
     * Alguém escreveu sobre o pacote anterior e a base não é substituída aqui.
     * Classificá-lo como falha mandaria quem opera procurar problema de
     * infraestrutura onde existe decisão editorial pendente.
     */
    || code === "radar_handoff_document_exists"
    || code === "radar_handoff_inconsistent"
    /* 2026-10-09 · sem o artigo-modelo concluído o artigo NÃO está pronto: é bloqueio (o caminho é organizar), não falha. */
    || code === "radar_handoff_article_blueprint_missing") return "BLOCKED_NOT_READY";
  return "FAILED";
}

const OUTCOME_OF_CHANGE: Record<string, RadarHandoffOutcome> = {
  CREATED: "IMPORTED",
  NEW_VERSION: "IMPORTED",
  TRANSITION_COMPLETED: "TRANSITION_COMPLETED",
  DOCUMENT_COMPLETED: "TRANSITION_COMPLETED",
  ALREADY_IMPORTED: "ALREADY_IMPORTED",
};

/**
 * ============ A CHAMADA — UMA, PARA UM ARTIGO ============
 *
 * Ela NUNCA lança: o lote precisa continuar depois de um artigo que falhou, e
 * uma exceção no meio da lista esconderia os que já tinham passado.
 */
/**
 * 2026-10-19 · RENOVAR A SESSÃO É DA SESSÃO, NÃO DO LOTE.
 *
 * O lote de 8 (WifiConecta) levou 4 respostas 401 "sessão Supabase ausente" no
 * meio da fila: o token venceu entre um artigo e outro, a sessão estava válida
 * logo depois, e o lote seguia mandando o token velho. A renovação é a do
 * cliente de sempre (`auth.refreshSession()` do cliente do navegador, o mesmo
 * de `withSupabaseSelectRetry`); devolve `true` só quando voltou sessão.
 */
export type RadarHandoffSessionRefresh = () => Promise<boolean>;

async function renovarSessaoDoNavegador(): Promise<boolean> {
  try {
    const { getBrowserSupabaseClient } = await import("../supabase/browser-client");
    const { data, error } = await getBrowserSupabaseClient().auth.refreshSession();
    return !error && Boolean(data?.session?.access_token);
  } catch {
    return false;
  }
}

export async function postRadarWriterHandoff(input: {
  brandId: string;
  articleId: string;
  fetchImpl?: typeof fetch;
  /** A renovação da sessão; ausente, a do cliente do navegador. */
  refreshSession?: RadarHandoffSessionRefresh;
}): Promise<RadarHandoffItemResult> {
  const chamar = input.fetchImpl || fetch;
  const enviar = () => chamar("/api/editorial/radar-writer-handoff", {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify({ brandId: input.brandId, articleId: input.articleId }),
  });

  try {
    let resposta = await enviar();
    /*
     * 401 = a sessão venceu no caminho. Renova e tenta ESTE artigo UMA vez;
     * sem sessão nova, ou com outro 401, o desfecho é a recusa de sempre. O
     * envio é idempotente (o documento é a chave), então repetir não duplica.
     */
    if (resposta.status === 401) {
      const renovou = await (input.refreshSession || renovarSessaoDoNavegador)().catch(() => false);
      if (renovou) resposta = await enviar();
    }
    const corpo = await resposta.json().catch(() => ({} as Record<string, unknown>));

    if (!resposta.ok || !corpo?.success) {
      const code = typeof corpo?.code === "string" ? corpo.code : null;
      return {
        articleId: input.articleId,
        outcome: radarHandoffOutcomeOfCode(code),
        message: typeof corpo?.error === "string" ? corpo.error : "Não foi possível enviar ao Redator.",
        code,
      };
    }

    const change = typeof corpo.change === "string" ? corpo.change : "CREATED";
    return {
      articleId: input.articleId,
      outcome: OUTCOME_OF_CHANGE[change] || "IMPORTED",
      message: typeof corpo.headline === "string" ? corpo.headline : "Pacote enviado ao Redator.",
      code: null,
    };
  } catch (erro) {
    return {
      articleId: input.articleId,
      outcome: "FAILED",
      message: erro instanceof Error ? erro.message : "Falha no envio ao Redator.",
      code: null,
    };
  }
}

/**
 * ============ §4 · O LOTE É ORQUESTRAÇÃO, E SÓ ============
 *
 * Ele não monta dossiê, não grava dossiê, não decide prontidão e não cria
 * documento. Ele repete a mesma porta e junta os desfechos.
 *
 * SEQUENCIAL de propósito: cada handoff escreve uma versão nova da análise sob
 * trava otimista. Dispará-los em paralelo faria N escritas disputarem o mesmo
 * lock, e a metade perdedora falharia por concorrência — não por não estar
 * pronta, que é a única recusa que interessa a quem opera.
 */
export async function postRadarWriterHandoffBatch(input: {
  brandId: string;
  articleIds: readonly string[];
  fetchImpl?: typeof fetch;
  refreshSession?: RadarHandoffSessionRefresh;
}): Promise<RadarHandoffItemResult[]> {
  const resultados: RadarHandoffItemResult[] = [];
  for (const articleId of input.articleIds) {
    resultados.push(await postRadarWriterHandoff({
      brandId: input.brandId, articleId, fetchImpl: input.fetchImpl, refreshSession: input.refreshSession,
    }));
  }
  return resultados;
}

/**
 * §8 · O RESUMO — e ele nunca declara sucesso global sobre um lote com bloqueio.
 *
 * "8 enviados" sozinho, num lote de 11, esconderia três artigos que ninguém vai
 * reabrir. A frase carrega as três contagens porque as três pedem ação
 * diferente.
 */
export function radarWriterHandoffBatchSummary(resultados: readonly RadarHandoffItemResult[]): string {
  const contar = (...alvos: RadarHandoffOutcome[]) =>
    resultados.filter(item => alvos.includes(item.outcome)).length;

  const enviados = contar("IMPORTED", "TRANSITION_COMPLETED");
  const jaEnviados = contar("ALREADY_IMPORTED");
  const bloqueados = contar("BLOCKED_NOT_READY", "BLOCKED_STALE");
  const falhas = contar("FAILED");

  const partes: string[] = [];
  if (enviados) partes.push(`${enviados} enviado(s)`);
  if (jaEnviados) partes.push(`${jaEnviados} já enviado(s)`);
  if (bloqueados) partes.push(`${bloqueados} bloqueado(s)`);
  if (falhas) partes.push(`${falhas} com falha`);

  return partes.length ? partes.join(" · ") : "Nenhum artigo elegível no lote.";
}
