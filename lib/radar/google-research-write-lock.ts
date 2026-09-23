/**
 * ===== A FRONTEIRA DE ESCRITA DA INVESTIGAÇÃO GOOGLE — RADAR_FINAL_2.3 · §2 e §3 =====
 *
 * ==================== O QUE FALTAVA, E POR QUE IMPORTA ====================
 *
 * YouTube e Amazon travam o perfil no FINALIZE: a tela recusa START, a rota
 * recusa análise nova, e a fotografia não é reescrita em silêncio.
 *
 * O Google nunca teve isso. A auditoria do 2.2 encontrou TRÊS caminhos que
 * alteram a matéria-prima competitiva — curadoria, extração em lote e a tela de
 * análise legada — e nenhum deles pergunta se a investigação já foi congelada.
 * Todos convergem para a mesma rota de gravação.
 *
 * Sem essa fronteira, uma extração nova depois do FINALIZE trocaria as páginas
 * sob uma fotografia já assinada: o `finalizedBundle` continuaria dizendo
 * "8 páginas comparáveis" enquanto a versão corrente teria outras 18.
 *
 * ==================== UMA AUTORIDADE, NÃO CINCO `if` ====================
 *
 * §3: todos os caminhos consultam ESTA função. Espalhar `if (finalizedBundle)`
 * por handler produziria cinco regras que divergem — e a que esquecesse a
 * checagem seria justamente a que ninguém testa.
 *
 * ==================== O QUE ELA NÃO TRAVA ====================
 *
 * Escrita que não toca a composição competitiva continua livre: aprovar, anotar,
 * registrar o envio ao Planejador, congelar. Travar tudo faria o FINALIZE
 * impedir o próprio handoff.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

export const RADAR_GOOGLE_WRITE_STATES = ["OPEN", "FINALIZED_LOCKED"] as const;
export type RadarGoogleWriteState = typeof RADAR_GOOGLE_WRITE_STATES[number];

export const RADAR_GOOGLE_RESEARCH_FINALIZED = "RADAR_GOOGLE_RESEARCH_FINALIZED" as const;

export const RADAR_GOOGLE_FINALIZED_MESSAGE =
  "A investigação está finalizada. Reabra a investigação antes de alterar a amostra competitiva.";

/**
 * ============ §2 · O QUE CONTA COMO ESCRITA COMPETITIVA ============
 *
 * A lista é dos CAMPOS, não dos botões. Um caminho novo que mexa em qualquer um
 * deles cai na trava sem precisar ser lembrado — e foi por não haver uma lista
 * assim que três caminhos ficaram descobertos até aqui.
 */
export const RADAR_GOOGLE_COMPETITIVE_FIELDS = [
  "extractions",
  "extractionIds",
  "extractionFailures",
  "selectedCompetitorIds",
  "serpDecisions",
  "serpSnapshotId",
  /*
   * O BENCHMARK E O MODELO DERIVAM DA COMPOSIÇÃO.
   *
   * Recalculá-los sobre outra amostra muda a conclusão sob a mesma fotografia —
   * que é o mesmo estrago, por um caminho mais discreto.
   */
  "benchmark",
  "semanticTerms",
  "structuralDecisions",
  "competitiveness",
  "deepResearch",
] as const;

export type RadarGoogleCompetitiveField = typeof RADAR_GOOGLE_COMPETITIVE_FIELDS[number];

const objeto = (valor: unknown): Record<string, unknown> | null =>
  valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null;

/**
 * A investigação Google deste artigo está congelada?
 *
 * `finalizedBundle` é a fotografia canônica daquele pipeline. Ela é a mesma
 * autoridade que a prontidão do handoff consulta — e é por isso que reabrir,
 * que a limpa, destrava a escrita sem precisar de um segundo mecanismo (§5).
 */
export function radarGoogleResearchIsFinalized(payload: unknown): boolean {
  return Boolean(objeto(objeto(payload)?.finalizedBundle));
}

export const RADAR_GOOGLE_SERP_FINALIZED_MESSAGE =
  "A investigação está finalizada: a SERP congelada não é atualizada nem recoletada. Reabra a investigação antes de coletar de novo.";

export type RadarGoogleSerpWriteDecision = {
  state: RadarGoogleWriteState;
  allowed: boolean;
  code: typeof RADAR_GOOGLE_RESEARCH_FINALIZED | null;
  message: string | null;
};

/**
 * ===== A COLETA DA SERP SOB A FOTOGRAFIA — SDD do Radar, R1b =====
 *
 * Toda coleta nova — "Atualizar SERP", a pesquisa auxiliar, a recoleta paga e,
 * quando existir, a que viria inteira do cache — escreve uma SERP que a
 * investigação congelada não leu. A pergunta é a mesma de
 * `radarGoogleResearchIsFinalized`, sobre a versão CORRENTE gravada; não há
 * outro critério de congelamento.
 */
export function radarGoogleSerpWriteLock(current: unknown): RadarGoogleSerpWriteDecision {
  if (!radarGoogleResearchIsFinalized(current)) return { state: "OPEN", allowed: true, code: null, message: null };
  return { state: "FINALIZED_LOCKED", allowed: false, code: RADAR_GOOGLE_RESEARCH_FINALIZED, message: RADAR_GOOGLE_SERP_FINALIZED_MESSAGE };
}

export const RADAR_GOOGLE_FROZEN_BUNDLE_MESSAGE =
  "A fotografia congelada não é reescrita. Reabra a investigação antes de congelar de novo.";

/**
 * A FOTOGRAFIA GRAVADA É A MESMA QUE A ESCRITA CARREGA?
 *
 * Comparação por conteúdo, com as chaves ordenadas: a linha do banco e o corpo
 * do pedido podem trazer as mesmas chaves em ordem diferente, e isso não é
 * reescrita.
 */
function serializacaoEstavel(valor: unknown): string {
  if (valor === null || typeof valor !== "object") return JSON.stringify(valor) ?? "null";
  if (Array.isArray(valor)) return `[${valor.map(serializacaoEstavel).join(",")}]`;
  const registro = valor as Record<string, unknown>;
  return `{${Object.keys(registro).filter(chave => registro[chave] !== undefined).sort()
    .map(chave => `${JSON.stringify(chave)}:${serializacaoEstavel(registro[chave])}`).join(",")}}`;
}

export type RadarGoogleWriteDecision = {
  state: RadarGoogleWriteState;
  allowed: boolean;
  /** Os campos competitivos que ESTA escrita toca. Vazio quando não toca nenhum. */
  competitiveFields: RadarGoogleCompetitiveField[];
  /** A escrita troca a própria fotografia congelada, sem reabrir? */
  frozenBundleRewritten: boolean;
  code: typeof RADAR_GOOGLE_RESEARCH_FINALIZED | null;
  message: string | null;
};

/**
 * ============ A DECISÃO — E ELA COMPARA, NÃO PRESUME ============
 *
 * Uma escrita só é "competitiva" quando MUDA um campo competitivo. Marcar toda
 * gravação que CARREGA `extractions` faria o FINALIZE bloquear até o próprio
 * congelamento — porque a sucessora que grava a fotografia carrega o payload
 * inteiro, `extractions` incluídas, sem alterá-las.
 *
 * A comparação é por conteúdo serializado: é o que o banco guarda, e é o que
 * distingue "passou adiante" de "trocou".
 */
export function radarGoogleResearchWriteLock(input: {
  /** A versão CORRENTE gravada — a autoridade, nunca a cópia de leitura. */
  current: unknown;
  /** O payload que a escrita quer persistir. */
  next: unknown;
}): RadarGoogleWriteDecision {
  const atual = objeto(input.current);
  const proximo = objeto(input.next);

  const mudou = (campo: RadarGoogleCompetitiveField) =>
    JSON.stringify(atual?.[campo] ?? null) !== JSON.stringify(proximo?.[campo] ?? null);

  const competitiveFields = RADAR_GOOGLE_COMPETITIVE_FIELDS.filter(mudou);

  if (!radarGoogleResearchIsFinalized(atual)) {
    return { state: "OPEN", allowed: true, competitiveFields, frozenBundleRewritten: false, code: null, message: null };
  }

  /*
   * §5 · REABRIR É A ÚNICA PORTA — e ela se reconhece aqui.
   *
   * A escrita que LIMPA a fotografia é o próprio reabrir. Bloqueá-la trancaria
   * a investigação para sempre: a única saída exigiria a trava que a impede.
   */
  if (!radarGoogleResearchIsFinalized(proximo)) {
    return { state: "OPEN", allowed: true, competitiveFields, frozenBundleRewritten: false, code: null, message: null };
  }

  /*
   * ===== A FOTOGRAFIA TAMBÉM NÃO É REESCRITA — SDD do Radar, R1 =====
   *
   * O standing da SERP é avaliado UMA vez, no congelamento, e mora dentro da
   * fotografia. Uma escrita que chegasse com outra fotografia — sem o standing,
   * com outro standing, com outro hash — trocaria o que o dossiê entrega sem
   * reabrir nada. Congelar de novo exige reabrir antes.
   */
  if (serializacaoEstavel(atual?.finalizedBundle) !== serializacaoEstavel(proximo?.finalizedBundle)) {
    return {
      state: "FINALIZED_LOCKED",
      allowed: false,
      competitiveFields,
      frozenBundleRewritten: true,
      code: RADAR_GOOGLE_RESEARCH_FINALIZED,
      message: RADAR_GOOGLE_FROZEN_BUNDLE_MESSAGE,
    };
  }

  if (!competitiveFields.length) {
    /* Aprovar, anotar, registrar o envio: nada disso troca a amostra. */
    return { state: "FINALIZED_LOCKED", allowed: true, competitiveFields: [], frozenBundleRewritten: false, code: null, message: null };
  }

  return {
    state: "FINALIZED_LOCKED",
    allowed: false,
    competitiveFields,
    frozenBundleRewritten: false,
    code: RADAR_GOOGLE_RESEARCH_FINALIZED,
    message: RADAR_GOOGLE_FINALIZED_MESSAGE,
  };
}
