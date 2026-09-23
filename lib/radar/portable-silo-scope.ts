import type { SiloDNA, VersionEnvelope } from "../arquiteto/contracts.ts";

/**
 * ===== O ESCOPO E OS AVISOS DO EXPORT POR SILO — o lado da tela =====
 *
 * ==================== POR QUE ISTO NÃO MORA NO COMPONENTE ====================
 *
 * Três decisões da tela precisam de teste e não de clique:
 *
 *   1. QUAIS artigos vão no pedido. Com seleção, os silos das linhas
 *      selecionadas INTEIROS — um silo pela metade é justamente o que o
 *      export por silo existe para evitar. Sem seleção, todos os silos.
 *   2. A PRÉVIA da contagem, pelo `siloId` do item e pelo SiloDNA — nunca pelo
 *      rótulo de silo da planilha, que procura nas listas do Minerador.
 *   3. O AVISO: parcial é WARNING, com os faltantes pelo TÍTULO; e um
 *      download nunca é anunciado como "sucesso confirmado" — o navegador
 *      recebeu o arquivo, e só quem clicou sabe se ele foi salvo.
 *
 * Domínio puro: sem fetch, sem storage, sem React. Nenhum id sai daqui para
 * texto: o `articleId` só serve para montar o pedido.
 */

/** O recorte do `RadarItem` que a tela tem em mãos. */
export type RadarSiloScopeItem = {
  articleId: string;
  siloId?: string | null;
  title?: string | null;
  slug?: string | null;
  unitType?: string | null;
};

export type RadarSiloScopeSiloVersions = Readonly<Record<string, VersionEnvelope<SiloDNA> | undefined>>;

export type RadarSiloExportScope = {
  mode: "selection" | "all";
  /** O pedido: todos os artigos dos silos escolhidos, sem a SiloPage. */
  articleIds: string[];
  silos: Array<{ label: string; inRadar: number; inSiloDna: number }>;
  /** Artigos do escopo sem silo registrado: saem num arquivo à parte. */
  withoutSilo: number;
};

const texto = (valor: unknown): string => (typeof valor === "string" ? valor.trim() : "");

/* A SiloPage não tem dossiê do Radar: ela entra como contexto do silo, nunca como linha. */
const ehArtigo = (item: RadarSiloScopeItem) => texto(item.unitType) !== "silo_page" && Boolean(texto(item.articleId));

/** O nome do silo vem do SiloDNA; sem nome, a tela diz isso — nunca mostra o id. */
function rotuloDoSilo(siloId: string, versoes: RadarSiloScopeSiloVersions): string {
  return texto(versoes[siloId]?.payload?.name) || "Silo sem nome";
}

/** Quantos artigos a composição do SiloDNA declara (Pilar, ordem, suportes e referências). */
function membrosDoSiloDna(siloId: string, versoes: RadarSiloScopeSiloVersions): number {
  const dna = versoes[siloId]?.payload;
  if (!dna) return 0;
  return new Set([
    dna.pillarArticleId,
    ...(dna.narrativeOrder || []),
    ...(dna.supportArticleIds || []),
    ...(dna.articleReferences || []).map(referencia => referencia.articleId),
  ].map(texto).filter(Boolean)).size;
}

/**
 * ===== O ESCOPO: O SILO INTEIRO, SEMPRE =====
 *
 * Selecionar um artigo de um silo pede o silo dele INTEIRO: o pedido leva os
 * irmãos também, e o servidor diz quem não está finalizado. Linha selecionada
 * sem silo vai sozinha, para o arquivo "sem silo".
 */
export function radarSiloExportScope(input: {
  items: readonly RadarSiloScopeItem[];
  selectedArticleIds: Iterable<string>;
  siloVersions: RadarSiloScopeSiloVersions;
}): RadarSiloExportScope {
  const selecionados = new Set([...input.selectedArticleIds].map(texto).filter(Boolean));
  const itens = input.items.filter(item => Boolean(texto(item.articleId)));
  const modo: RadarSiloExportScope["mode"] = selecionados.size ? "selection" : "all";

  let alvo: RadarSiloScopeItem[];
  if (modo === "selection") {
    const escolhidos = itens.filter(item => selecionados.has(texto(item.articleId)));
    const silosEscolhidos = new Set(escolhidos.map(item => texto(item.siloId)).filter(Boolean));
    alvo = itens.filter(item => ehArtigo(item) && (
      silosEscolhidos.has(texto(item.siloId))
      || (!texto(item.siloId) && selecionados.has(texto(item.articleId)))
    ));
  } else {
    alvo = itens.filter(ehArtigo);
  }

  const vistos = new Set<string>();
  const articleIds: string[] = [];
  const porSilo = new Map<string, number>();
  let semSilo = 0;
  for (const item of alvo) {
    const id = texto(item.articleId);
    if (vistos.has(id)) continue;
    vistos.add(id);
    articleIds.push(id);
    const siloId = texto(item.siloId);
    if (siloId) porSilo.set(siloId, (porSilo.get(siloId) || 0) + 1);
    else semSilo += 1;
  }

  return {
    mode: modo,
    articleIds,
    silos: [...porSilo.entries()].map(([siloId, quantos]) => ({
      label: rotuloDoSilo(siloId, input.siloVersions),
      inRadar: quantos,
      inSiloDna: membrosDoSiloDna(siloId, input.siloVersions),
    })),
    withoutSilo: semSilo,
  };
}

/** A prévia que acompanha o item do menu: contagem, sem prometer finalizados. */
export function radarSiloExportPreview(escopo: RadarSiloExportScope): string {
  if (!escopo.articleIds.length) return "Nenhum artigo do Radar neste escopo.";
  const silos = escopo.silos.length;
  const noRadar = escopo.silos.reduce((total, silo) => total + silo.inRadar, 0);
  const noDna = escopo.silos.reduce((total, silo) => total + silo.inSiloDna, 0);
  const partes = [
    `${escopo.mode === "selection" ? "Silos da seleção" : "Todos os silos"}: ${silos} silo(s)`,
    `${noRadar} artigo(s) no Radar`,
    ...(noDna ? [`${noDna} no SiloDNA`] : []),
    ...(escopo.withoutSilo ? [`${escopo.withoutSilo} sem silo`] : []),
  ];
  return partes.join(" · ");
}

/**
 * ===== O TETO DE ARTIGOS POR PEDIDO — o MESMO do schema da rota =====
 *
 * `POST /api/editorial/radar-export` recusa mais de 500 `articleIds` com 400
 * "Pedido de exportação inválido." — e "Silos completos" sem seleção manda
 * TODOS os artigos do Radar. Numa marca grande, o export recomendado caía
 * nessa frase genérica, sem arquivo e sem dizer o que fazer. A rota importa
 * esta constante: o teto da tela e o do servidor não têm como divergir.
 */
export const RADAR_EXPORT_MAX_ARTICLES = 500;

/** Escopo acima do teto: o aviso ANTES do pedido, com o que fazer. `null` quando cabe. */
export function radarSiloExportScopeLimitNotice(escopo: Pick<RadarSiloExportScope, "articleIds" | "mode">): RadarExportNotice | null {
  if (escopo.articleIds.length <= RADAR_EXPORT_MAX_ARTICLES) return null;
  return {
    type: "warning",
    message: `${escopo.mode === "all" ? "Todos os silos somam" : "Os silos da seleção somam"} ${escopo.articleIds.length} artigos do Radar, acima do limite de ${RADAR_EXPORT_MAX_ARTICLES} por exportação. Selecione alguns silos na planilha e exporte em partes; nada foi pedido ao servidor.`,
  };
}

/**
 * ===== O SILO SELECIONADO PELA METADE =====
 *
 * Ao exportar dossiês AVULSOS, um silo com parte dos artigos selecionada sai
 * sem os irmãos — e quem escreve fora não sabe que eles existem. Não é erro:
 * é o caso em que a tela recomenda o export por silo.
 */
export function radarPartiallySelectedSilos(input: {
  items: readonly RadarSiloScopeItem[];
  selectedArticleIds: Iterable<string>;
  siloVersions: RadarSiloScopeSiloVersions;
}): Array<{ label: string; selected: number; total: number }> {
  const selecionados = new Set([...input.selectedArticleIds].map(texto).filter(Boolean));
  if (!selecionados.size) return [];
  const porSilo = new Map<string, { selected: number; total: number }>();
  for (const item of input.items) {
    const siloId = texto(item.siloId);
    if (!siloId || !ehArtigo(item)) continue;
    const atual = porSilo.get(siloId) || { selected: 0, total: 0 };
    atual.total += 1;
    if (selecionados.has(texto(item.articleId))) atual.selected += 1;
    porSilo.set(siloId, atual);
  }
  return [...porSilo.entries()]
    .filter(([, contagem]) => contagem.selected > 0 && contagem.selected < contagem.total)
    .map(([siloId, contagem]) => ({ label: rotuloDoSilo(siloId, input.siloVersions), ...contagem }));
}

/* ============================== os avisos ============================== */

export type RadarExportNotice = { type: "info" | "warning" | "error"; message: string };

export type RadarExportRefusal = { articleId: string; code?: string; reason: string };

export type RadarSiloExportPendingView = { title: string; status: string; reason?: string | null };

/** O que a tela lê da resposta da rota (os campos novos são todos opcionais). */
export type RadarSiloExportResponseView = {
  exported?: number;
  refused?: readonly RadarExportRefusal[];
  files?: ReadonlyArray<{ filename: string; silo: { name: string; partial: boolean; exported: number; total: number; pending: readonly RadarSiloExportPendingView[] } }>;
  emptySilos?: ReadonlyArray<{ name: string; pending: readonly RadarSiloExportPendingView[] }>;
  warnings?: readonly string[];
  serpCacheReadFailed?: boolean;
};

const entreAspas = (valor: string) => `"${valor}"`;

const faltantesEmTexto = (pendentes: readonly RadarSiloExportPendingView[]): string =>
  pendentes.map(item => `${entreAspas(item.title)} (${item.status})`).join(", ");

/**
 * ===== A RECUSA DO LOTE INTEIRO, COM O QUE O SERVIDOR DISSE =====
 *
 * Quando nenhum artigo está finalizado, a rota responde 409 com `refused` e,
 * no export por silo, `emptySilos`. Um `Error` comum levaria só a frase, e a
 * tela voltaria a dizer "não foi possível" sem dizer QUEM ficou de fora. A
 * classe carrega as duas listas, já saneadas — o que não tiver a forma
 * esperada é descartado, nunca exibido cru.
 */
export class RadarExportRefusedError extends Error {
  readonly refused: RadarExportRefusal[];
  readonly emptySilos: Array<{ name: string; pending: RadarSiloExportPendingView[] }>;

  constructor(message: string, refused?: unknown, emptySilos?: unknown) {
    super(message);
    this.name = "RadarExportRefusedError";
    this.refused = (Array.isArray(refused) ? refused : [])
      .filter((item): item is { articleId: string; reason?: unknown; code?: unknown } => Boolean(item) && typeof (item as { articleId?: unknown }).articleId === "string")
      .map(item => ({ articleId: item.articleId, reason: texto(item.reason), code: texto(item.code) || undefined }));
    this.emptySilos = (Array.isArray(emptySilos) ? emptySilos : [])
      .filter((silo): silo is { name: string; pending?: unknown } => Boolean(silo) && typeof (silo as { name?: unknown }).name === "string")
      .map(silo => ({
        name: silo.name,
        pending: (Array.isArray(silo.pending) ? silo.pending : [])
          .filter((item): item is { title: string; status?: unknown } => Boolean(item) && typeof (item as { title?: unknown }).title === "string")
          .map(item => ({ title: item.title, status: texto(item.status) || "situação não informada" })),
      }));
  }
}

/** A falha do export em aviso: a frase do servidor, quem ficou de fora e o que falta em cada silo. */
export function radarExportFailureNotice(erro: unknown, padrao: string, titleOf: (articleId: string) => string | null): RadarExportNotice {
  const mensagem = erro instanceof Error && erro.message ? erro.message : padrao;
  if (!(erro instanceof RadarExportRefusedError)) return { type: "error", message: mensagem };
  const recusados = radarRefusedLabels(erro.refused, titleOf);
  return {
    type: "error",
    message: [
      mensagem,
      ...(recusados.length ? [`Ficaram de fora: ${recusados.join("; ")}.`] : []),
      ...erro.emptySilos.filter(silo => silo.pending.length).map(silo => `Faltam em ${entreAspas(silo.name)}: ${faltantesEmTexto(silo.pending)}.`),
    ].join(" "),
  };
}

/** O recusado pelo TÍTULO que a tela conhece; sem título, o slug; nunca o id. */
export function radarRefusedLabels(refused: readonly RadarExportRefusal[] | undefined, titleOf: (articleId: string) => string | null): string[] {
  return (refused || []).map(item => `${entreAspas(titleOf(item.articleId) || "artigo sem título conhecido")} (${texto(item.reason).replace(/[.\s]+$/, "") || "sem motivo informado"})`);
}

const AVISO_DO_CACHE = "A leitura do cache de SERP falhou nesta exportação: as colunas de SERP por lente dizem isso em cada artigo.";

/**
 * ===== O AVISO DO EXPORT POR SILO =====
 *
 * O arquivo foi ENTREGUE AO NAVEGADOR — é tudo o que a tela sabe. Parcial,
 * silo vazio, recusa e cache ilegível viram WARNING; os faltantes vão pelo
 * título, com a situação de cada um.
 *
 * ==================== QUEM FICOU DE FORA, E POR QUÊ ====================
 *
 * Os avisos do plano nomeiam os faltantes de cada SILO, mas não o artigo sem
 * silo que foi recusado (o plano só o conta) nem o MOTIVO de recusa nenhuma —
 * e "não finalizado" cobria também "ArticleDNA não encontrado" e "pacote
 * indisponível". A tela mostrava ATENÇÃO sem dizer quem saiu. Agora cada
 * recusa aparece pelo título, com o motivo do servidor, como no avulso.
 */
export function radarSiloExportNotice(input: {
  response: RadarSiloExportResponseView;
  delivered: { filename: string; files: number } | null;
  /** O título que a tela conhece para um artigo recusado (nunca o id). */
  titleOf: (articleId: string) => string | null;
}): RadarExportNotice {
  const r = input.response;
  const vazios = (r.emptySilos || []).filter(silo => silo.pending.length);
  const recusados = radarRefusedLabels(r.refused, input.titleOf);
  const linhas = [
    input.delivered
      ? `Arquivo entregue ao navegador para download: ${input.delivered.filename} (${input.delivered.files} CSV, ${r.exported ?? 0} dossiê(s)). Confira se ele foi salvo na sua pasta de downloads.`
      : "Nenhum arquivo foi gerado.",
    ...(r.warnings || []),
    ...vazios.map(silo => `Faltam em ${entreAspas(silo.name)}: ${faltantesEmTexto(silo.pending)}.`),
    ...(recusados.length ? [`Ficaram de fora: ${recusados.join("; ")}.`] : []),
    ...(r.serpCacheReadFailed ? [AVISO_DO_CACHE] : []),
  ];
  const alerta = !input.delivered
    || Boolean((r.warnings || []).length || vazios.length || (r.refused || []).length || r.serpCacheReadFailed
      || (r.files || []).some(arquivo => arquivo.silo.partial));
  return { type: !input.delivered ? "error" : alerta ? "warning" : "info", message: linhas.join(" ") };
}

/**
 * ===== O AVISO DOS DOSSIÊS AVULSOS =====
 *
 * O download é o de sempre; o que muda é que a recusa deixa de ser ignorada
 * (cada artigo de fora aparece pelo título, com o motivo) e que um silo
 * selecionado pela metade ganha a recomendação do export por silo.
 */
export function radarDossierExportNotice(input: {
  headline: string | null | undefined;
  refused: readonly RadarExportRefusal[] | undefined;
  titleOf: (articleId: string) => string | null;
  partialSilos: ReadonlyArray<{ label: string; selected: number; total: number }>;
  serpCacheReadFailed?: boolean;
}): RadarExportNotice {
  const recusados = radarRefusedLabels(input.refused, input.titleOf);
  const linhas = [
    texto(input.headline) || "Dossiês entregues ao navegador para download.",
    ...(recusados.length ? [`Ficaram de fora: ${recusados.join("; ")}.`] : []),
    ...(input.partialSilos.length
      ? [`Recomendado: exportar o silo completo (Exportar ▾ › Silos completos · um CSV por silo). Selecionados só em parte: ${input.partialSilos.map(silo => `${entreAspas(silo.label)} (${silo.selected} de ${silo.total} artigos do Radar)`).join(", ")}.`]
      : []),
    ...(input.serpCacheReadFailed ? [AVISO_DO_CACHE] : []),
  ];
  const alerta = Boolean(recusados.length || input.partialSilos.length || input.serpCacheReadFailed);
  return { type: alerta ? "warning" : "info", message: linhas.join(" ") };
}
