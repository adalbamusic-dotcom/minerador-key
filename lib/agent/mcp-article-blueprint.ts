import { parseWriterEvidenceSourceKey, WRITER_EVIDENCE_LIMITS } from "../redator/writer-evidence-catalog.ts";

/**
 * ===== 2026-10-09 · O ARTIGO-MODELO NO MCP (regra do dono) =====
 *
 * "Tudo que é de processos antigos tem que ser substituído pelos novos
 * processos dos pilotos." O artigo-modelo da SERP concluído (APPROVED, da
 * investigação congelada e do ArticleDNA vigentes) é a única estrutura de todo
 * entregável. No MCP isso vira três coisas, todas aqui, em domínio puro:
 *
 *   1. o ESTADO EXPLÍCITO quando a planta falta — `needs_article_blueprint`,
 *      com o que falta, onde organizar na tela e o teto do custo dito antes do
 *      clique. Organizar chama a IA (paga): é ato humano na tela; o MCP não
 *      organiza (escopo novo e SDD, decisão do dono);
 *   2. o briefing e os fundamentos do Redator sem o legado quando a planta
 *      falta: as sugestões gravadas no envio pelo modelo editorial antigo
 *      (`editorialContext`) saem, e o estado diz por quê;
 *   3. a evidência que era estrutura no processo antigo (o blueprint
 *      competitivo congelado e as amostras inteiras das corridas) continua
 *      legível como proveniência, marcada "matéria-prima, não estrutura".
 *
 * Os nomes de botão repetem os da tela (`modules/radar/radar-article-blueprint-panel.tsx`);
 * um teste do Radar confere que são os mesmos.
 */

/* ============================ o que a tela mostra ============================ */

/** Até 2 chamadas de IA por artigo: organizar e, se a resposta vier cortada ou a conferência apontar o que corrigir, mais 1. */
export const MCP_ARTICLE_BLUEPRINT_MAX_CALLS_PER_ARTICLE = 2;

export const mcpArticleBlueprintMaxCalls = (artigos: number) =>
  Math.max(1, Math.trunc(artigos)) * MCP_ARTICLE_BLUEPRINT_MAX_CALLS_PER_ARTICLE;

/** O mesmo texto de custo de todo botão que organiza ("+ até 2N chamadas de IA"). */
export const mcpArticleBlueprintCostLabel = (artigos: number) => `+ até ${mcpArticleBlueprintMaxCalls(artigos)} chamadas de IA`;

export const MCP_ARTICLE_BLUEPRINT_SCREEN = Object.freeze({
  where: "Radar → artigo finalizado → Pesquisa → Artigo-modelo da SERP",
  /** O botão do painel quando não há versão; com versão, é "Organizar de novo (IA)". */
  organize: "Organizar o artigo-modelo da SERP (IA)",
  organizeAgain: "Organizar de novo (IA)",
  /** O botão do envio ao Redator quando falta a planta. */
  organizeAndSend: `Organizar o artigo-modelo e enviar (${mcpArticleBlueprintCostLabel(1)})`,
});

/** A barra de lote do Radar (a seleção). */
export const mcpArticleBlueprintBatchLabel = (artigos: number) =>
  `Organizar o artigo-modelo (${artigos}) · ${mcpArticleBlueprintCostLabel(artigos)}`;

/** O botão do export quando falta a planta. */
export const mcpArticleBlueprintOrganizeAndExportLabel = (artigos: number) =>
  `Organizar ${artigos} artigo(s)-modelo e exportar (${mcpArticleBlueprintCostLabel(artigos)})`;

export type McpArticleBlueprintAction = {
  /** Organizar chama a IA: decisão humana, na tela. */
  who: "human";
  where: string;
  buttons: string[];
  cost: string;
  afterwards: string;
  /** O link da tela do artigo no Radar, quando a Marca é conhecida. */
  screen?: string;
};

/** A ação que a IA conectada mostra ao usuário quando a planta falta: onde, quais botões, o custo e o que fazer depois. */
export function mcpArticleBlueprintAction(input: {
  articles: number;
  afterwards: string;
  screen?: string | null;
  /** O botão do fluxo em que a recusa aconteceu (export ou envio), além do painel. */
  flowButton?: string | null;
}): McpArticleBlueprintAction {
  const artigos = Math.max(1, Math.trunc(input.articles));
  const botoes = [
    MCP_ARTICLE_BLUEPRINT_SCREEN.organize,
    ...(input.flowButton ? [input.flowButton] : []),
    ...(artigos > 1 ? [`${mcpArticleBlueprintBatchLabel(artigos)} (barra de lote do Radar)`] : []),
  ];
  return {
    who: "human",
    where: MCP_ARTICLE_BLUEPRINT_SCREEN.where,
    buttons: botoes,
    cost: `Até ${mcpArticleBlueprintMaxCalls(artigos)} chamadas de IA (DeepSeek da plataforma, cota da marca): 1 por artigo para organizar e, se a resposta vier cortada ou a conferência apontar o que corrigir, mais 1. O botão diz o custo antes do clique, e a tela pede confirmação. Pelo MCP não se organiza: mostre ao usuário onde clicar.`,
    afterwards: input.afterwards,
    ...(input.screen ? { screen: input.screen } : {}),
  };
}

/* ======================== o estado da planta no Redator ======================== */

/** A leitura do Redator (`readWriterApprovedArticleBlueprint`, só metadados), na forma que importa aqui. */
export type McpWriterBlueprintRead =
  | { kind: "approved"; meta: { id: string; versionNumber: number | null; approvedAt: string | null } }
  | { kind: "no_bundle" | "none" | "other_bundle" | "table_missing" | "read_failed"; reason: string };

/** O que saiu da resposta sem a planta, e por quê. */
type McpOmitted = { omitted?: string[]; omittedReason?: string };

export type McpArticleBlueprintState =
  | { status: "approved"; sourceKey: string; versionNumber: number | null; approvedAt: string | null }
  | ({ status: "needs_article_blueprint"; reason: string; message: string; action: McpArticleBlueprintAction } & McpOmitted)
  | ({ status: "blueprint_unavailable"; reason: string; message: string } & McpOmitted);

export const MCP_WRITER_NEEDS_ARTICLE_BLUEPRINT_MESSAGE =
  "Este documento não tem o artigo-modelo concluído do pacote entregue, e a escrita sai só por ele (H1, seções, links internos e CTA). Não escreva pela estrutura antiga do dossiê nem pelas sugestões gravadas no envio: mostre ao usuário onde organizar o artigo-modelo no Radar e, quando o pacote tiver mudado, reenvie ao Redator.";

export const MCP_WRITER_BLUEPRINT_UNAVAILABLE_MESSAGE =
  "Não foi possível conferir o artigo-modelo deste documento agora: tente de novo em instantes. Até lá, não escreva pela estrutura antiga do dossiê.";

/** O que o Redator recebe quando a planta falta: o estado, o motivo da leitura e a ação na tela. */
export function mcpArticleBlueprintStateOf(lido: McpWriterBlueprintRead, opcoes: { screen?: string | null } = {}): McpArticleBlueprintState {
  if (lido.kind === "approved") {
    return { status: "approved", sourceKey: `radar.blueprint/${lido.meta.id}`, versionNumber: lido.meta.versionNumber, approvedAt: lido.meta.approvedAt };
  }
  /* Sem tabela ou com o banco recusando, não dá para conferir: é falha, não "falta organizar" (a mesma régua do envio). */
  if (lido.kind === "read_failed" || lido.kind === "table_missing") {
    return { status: "blueprint_unavailable", reason: lido.reason, message: MCP_WRITER_BLUEPRINT_UNAVAILABLE_MESSAGE };
  }
  return {
    status: "needs_article_blueprint",
    reason: lido.reason,
    message: MCP_WRITER_NEEDS_ARTICLE_BLUEPRINT_MESSAGE,
    action: mcpArticleBlueprintAction({
      articles: 1,
      screen: opcoes.screen ?? null,
      afterwards: "Com o artigo-modelo concluído no Radar, releia get_writer_foundations. Se a investigação foi congelada de novo ou o ArticleDNA mudou depois do envio, reenvie o artigo ao Redator (send_radar_to_writer).",
    }),
  };
}

/** Por que as linhas do envio saem sem a planta. */
export const MCP_EDITORIAL_CONTEXT_OMITTED_REASON =
  "editorialContext saiu: sem o artigo-modelo concluído, as linhas gravadas no envio (onde virar, a seção da virada e a direção do H1) vinham do modelo editorial anterior ao artigo-modelo. O Assunto declarado continua no ArticleDNA (article.fields.subject nos fundamentos).";

/**
 * O briefing ou os fundamentos com o estado da planta. Com a planta, tudo como
 * era, mais o estado. Sem ela, nunca o legado: `editorialContext` sai (o motivo
 * vai no estado) e o próximo passo começa pelo que falta.
 */
export function mcpWithArticleBlueprintState<T extends Record<string, unknown>>(payload: T, estado: McpArticleBlueprintState): T & { articleBlueprintState: McpArticleBlueprintState } {
  if (estado.status === "approved") return { ...payload, articleBlueprintState: estado };
  const { editorialContext, ...resto } = payload as T & { editorialContext?: unknown };
  const tinhaLinhas = Array.isArray(editorialContext) && editorialContext.length > 0;
  const proximo = typeof resto.next === "string" ? { next: `${estado.message} ${resto.next}` } : {};
  return {
    ...resto,
    ...proximo,
    articleBlueprintState: tinhaLinhas ? { ...estado, omitted: ["editorialContext"], omittedReason: MCP_EDITORIAL_CONTEXT_OMITTED_REASON } : estado,
  } as unknown as T & { articleBlueprintState: McpArticleBlueprintState };
}

/* ===================== a evidência antiga, como proveniência ===================== */

/** O topo do dossiê congelado que era estrutura no processo antigo. */
const BUNDLE_MATERIA_PRIMA: Readonly<Record<string, string>> = Object.freeze({
  competitiveBlueprint: "o blueprint competitivo congelado no pacote (o modelo editorial anterior ao artigo-modelo)",
  formatBlueprints: "os blueprints de formato congelados (vídeo e review) do processo anterior, com roteiro, gancho e peças curtas pela amostra inteira",
  editorialOutputs: "as saídas editoriais que o blueprint antigo sugeria",
});

/** As corridas cruas: a amostra inteira, sem a régua de hoje. */
const CORRIDA_MATERIA_PRIMA: Readonly<Record<string, string>> = Object.freeze({
  "youtube.universe": "a amostra INTEIRA da coleta do YouTube, sem a régua de pertinência (mesmo público, público vizinho, tema geral)",
  "youtube.results": "os resultados crus de cada consulta do YouTube, sem a régua de pertinência",
  "amazon.products": "a prateleira inteira da coleta da Amazon, sem o filtro do alvo declarado",
  "amazon.results": "os resultados crus de cada consulta da Amazon, sem o filtro do alvo declarado",
});

export type McpRawMaterialMarker = { role: "raw_material"; rawMaterial: string };

/**
 * A chave pedida é matéria-prima, não estrutura? `null` = evidência comum.
 * Lê a chave pela gramática do Redator (`parseWriterEvidenceSourceKey`): a
 * família e o caminho, nunca o texto solto.
 */
export function mcpEvidenceRawMaterialOf(sourceKey: string): McpRawMaterialMarker | null {
  const chave = parseWriterEvidenceSourceKey(sourceKey);
  if (!chave) return null;
  let oQueE: string | null = null;
  if (chave.family === "radar.bundle") oQueE = BUNDLE_MATERIA_PRIMA[[...chave.basePath, ...chave.path][0] ?? ""] ?? null;
  else if (chave.family === "run" && chave.runAlias) oQueE = CORRIDA_MATERIA_PRIMA[chave.runAlias] ?? null;
  if (!oQueE) return null;
  const destino = chave.family === "run" && chave.runAlias?.startsWith("amazon.")
    ? "Produtos, critérios e faixas do review saem só dos compatíveis com o alvo, na investigação da Amazon congelada, e entram no artigo-modelo."
    : chave.family === "run"
      ? "Formato, faixa de duração por coorte e títulos de referência saem só dos vídeos pertinentes: use get_video_material."
      : "A estrutura, o roteiro, o gancho, os cortes e o formato saem do artigo-modelo concluído (articleBlueprint nos fundamentos e radar.blueprint/<id>) e, no vídeo, de get_video_material.";
  return {
    role: "raw_material",
    rawMaterial: `Matéria-prima, não estrutura: ${oQueE}. Serve como proveniência e insumo do gerador do artigo-modelo; não tire dela estrutura, roteiro, formato nem duração. ${destino}`,
  };
}

/** Bytes UTF-8 do JSON compacto (a mesma régua do teto das fatias). */
const bytesDe = (valor: unknown) => new TextEncoder().encode(JSON.stringify(valor) ?? "null").length;

/**
 * O teto que vai ao leitor quando a resposta leva o marcador: o pedido menos o
 * marcador, para a resposta inteira continuar no teto que a IA pediu.
 */
export function mcpRawMaterialMaxBytes(maxBytes: number | undefined, marcador: McpRawMaterialMarker): number {
  const pedido = maxBytes ?? WRITER_EVIDENCE_LIMITS.sliceDefaultBytes;
  return Math.max(WRITER_EVIDENCE_LIMITS.sliceMinBytes, pedido - bytesDe(marcador) - 32);
}

/** A fatia (ou o "não mudou") com o marcador. */
export function mcpEvidenceWithRawMaterial<T>(resultado: T, marcador: McpRawMaterialMarker | null): T | (T & McpRawMaterialMarker) {
  if (!marcador || !resultado || typeof resultado !== "object") return resultado;
  return { ...(resultado as T & object), ...marcador } as T & McpRawMaterialMarker;
}
