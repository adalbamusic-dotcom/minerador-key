/**
 * ===== AS POSIÇÕES ONDE UMA IMAGEM PODE MORAR, COM NOME HUMANO =====
 *
 * Puro: sem I/O, sem `server-only`. Converte o que o documento e os entregáveis
 * já têm — blocos, cenas, slides — na lista de âncoras que o painel oferece.
 *
 * ==================== RÓTULO NÃO É TIPO TÉCNICO ====================
 *
 * `image_brief` e `paragraph` são nomes do contrato, não do ofício de quem
 * escreve. Quem escolhe onde a imagem vai precisa ler "Imagem planejada · …" ou
 * "H2 · …", com o começo do próprio texto para reconhecer o lugar. O id técnico
 * continua existindo, mas do lado de dentro: ele é `ref`, nunca rótulo.
 *
 * ==================== article_break NÃO ENTRA ====================
 *
 * Respiro não tem identidade estável — não existe bloco de respiro no
 * `ContentBlockSchema`. Nada aqui o produz, e o teste prova a ausência.
 */

import type { MediaAnchorKind } from "./media-anchor.ts";

export type MediaAnchorTarget = {
  kind: MediaAnchorKind;
  /** O id técnico. Interno: identifica, não é mostrado como rótulo. */
  ref: string;
  /** O que a pessoa lê. */
  label: string;
  /** Agrupador na lista, para separar capa de blocos, cenas de slides. */
  group: string;
};

/** Nome humano de cada tipo de bloco. O contrato não vaza para a tela. */
const NOME_DO_BLOCO: Record<string, string> = {
  paragraph: "Parágrafo",
  list: "Lista",
  table: "Tabela",
  quote: "Citação",
  internal_link: "Link interno",
  external_source: "Fonte externa",
  CTA: "Chamada",
  image_brief: "Imagem planejada",
  note: "Nota",
  source: "Fonte",
  product_block: "Produto",
  comparison: "Comparativo",
};

/** Corta sem cortar palavra no meio quando dá, e sem prometer o que não cabe. */
function resumo(texto: string, limite = 48): string {
  const limpo = String(texto || "").replace(/\s+/g, " ").trim();
  if (limpo.length <= limite) return limpo;
  const corte = limpo.slice(0, limite);
  const espaco = corte.lastIndexOf(" ");
  return `${espaco > limite * 0.6 ? corte.slice(0, espaco) : corte}…`;
}

type BlocoCru = { id: string; type: string } & Record<string, unknown>;

/** `H2 · texto`, `Parágrafo · texto`, `Imagem planejada · objetivo`. */
export function labelForBlock(bloco: BlocoCru): string {
  if (bloco.type === "heading") {
    const nivel = Number(bloco.level) || 1;
    return `H${nivel} · ${resumo(String(bloco.text ?? "")) || "sem título"}`;
  }
  const nome = NOME_DO_BLOCO[bloco.type] || bloco.type;
  const trecho = resumo(String(
    bloco.text ?? bloco.objective ?? bloco.title ?? bloco.anchor ?? bloco.claim ?? ""));
  return trecho ? `${nome} · ${trecho}` : nome;
}

/**
 * As âncoras do ARTIGO: a capa, mais um por bloco.
 *
 * A capa ancora no próprio `documentId` — ela é uma por documento e não tem
 * entidade própria no contrato. O índice único parcial da M3 garante que
 * continue sendo uma.
 *
 * Todo bloco entra. Todos têm `id` estável por `BlockBaseSchema`, e decidir
 * quais "merecem" imagem seria eu inventando uma regra editorial que ninguém
 * pediu — quem escreve sabe onde a imagem faz sentido.
 */
export function articleAnchorTargets(input: {
  documentId: string;
  title: string;
  blocks: readonly BlocoCru[];
}): MediaAnchorTarget[] {
  const capa: MediaAnchorTarget = {
    kind: "article_cover", ref: input.documentId,
    label: "Capa do artigo", group: "Artigo",
  };
  const blocos = input.blocks
    .filter(bloco => typeof bloco?.id === "string" && bloco.id.length > 0)
    .map(bloco => ({
      kind: "article_block" as const, ref: bloco.id,
      label: labelForBlock(bloco), group: "Blocos do artigo",
    }));
  return [capa, ...blocos];
}

/** `Cena 1 · narração`. A ordem declarada manda, não a posição no array. */
export function scriptAnchorTargets(scenes: readonly Record<string, unknown>[]): MediaAnchorTarget[] {
  return [...scenes]
    .filter(cena => typeof cena?.id === "string" && String(cena.id).length > 0)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((cena, indice) => ({
      kind: "script_scene" as const,
      ref: String(cena.id),
      label: `Cena ${(Number(cena.order) || indice) + 1} · ${resumo(String(cena.narration ?? cena.visualDirection ?? "")) || "sem narração"}`,
      group: "Cenas do roteiro",
    }));
}

/** `Slide 1 · título`. */
export function carouselAnchorTargets(slides: readonly Record<string, unknown>[]): MediaAnchorTarget[] {
  return [...slides]
    .filter(slide => typeof slide?.id === "string" && String(slide.id).length > 0)
    .sort((a, b) => (Number(a.order) || 0) - (Number(b.order) || 0))
    .map((slide, indice) => ({
      kind: "carousel_slide" as const,
      ref: String(slide.id),
      label: `Slide ${(Number(slide.order) || indice) + 1} · ${resumo(String(slide.heading ?? slide.body ?? "")) || "sem título"}`,
      group: "Slides do carrossel",
    }));
}

/* ==========================================================================
 * O ESTADO DE UMA POSIÇÃO — o que o painel precisa saber para se desenhar
 * ========================================================================== */

export type PanelAsset = {
  id: string;
  status: "prompt_ready" | "uploaded" | "reviewed";
  anchorKind: MediaAnchorKind | null;
  anchorRef: string | null;
  fileHash: string | null;
  altText: string;
  objective: string;
  prompt: string;
  supersededAt: string | null;
};

export type AnchorState = {
  /** Quem ocupa a posição HOJE. Ancorado e não substituído. */
  current: PanelAsset | null;
  /** Briefings sem arquivo, disponíveis para receber upload. */
  briefings: PanelAsset[];
  /** Com arquivo confirmado e sem posição: podem assumir ou substituir. */
  candidates: PanelAsset[];
  /** Substituídos que ainda estão na janela. Histórico, nunca imagem atual. */
  superseded: PanelAsset[];
};

/**
 * A linha crua de `writer_media_assets` vira o que o painel entende.
 *
 * Um mapeador só, usado por artigo, roteiro e carrossel. Dois mapeadores
 * divergiriam num campo — provavelmente `superseded_at` —, e o ambiente que
 * esquecesse dele passaria a mostrar o predecessor como imagem atual.
 */
export function mediaRowsToPanelAssets(rows: unknown): PanelAsset[] {
  if (!Array.isArray(rows)) return [];
  return rows.map((item: Record<string, unknown>) => ({
    id: String(item.id),
    status: item.status as PanelAsset["status"],
    anchorKind: (item.anchor_kind as MediaAnchorKind | null) ?? null,
    anchorRef: (item.anchor_ref as string | null) ?? null,
    fileHash: (item.file_hash as string | null) ?? null,
    altText: String(item.alt_text ?? ""),
    objective: String(item.objective ?? ""),
    prompt: String(item.prompt ?? ""),
    supersededAt: (item.superseded_at as string | null) ?? null,
  }));
}

/**
 * ===== O PREDECESSOR É LIFECYCLE, NUNCA SEGUNDA IMAGEM ATUAL =====
 *
 * Um ativo substituído MANTÉM a âncora — é o registro de onde ele vivia, e é o
 * que torna a recuperação nas 48h possível. Se o painel filtrasse só por
 * âncora, ele apareceria como segundo "atual" da mesma posição.
 *
 * `current` exige âncora **e** `superseded_at` nulo **e** arquivo confirmado.
 * É a mesma condição do índice único parcial da M3, e por isso `current` nunca
 * é ambíguo.
 */
export function anchorStateFor(target: MediaAnchorTarget, assets: readonly PanelAsset[]): AnchorState {
  const naPosicao = assets.filter(a => a.anchorKind === target.kind && a.anchorRef === target.ref);
  const comArquivo = (a: PanelAsset) => Boolean(a.fileHash) && (a.status === "uploaded" || a.status === "reviewed");

  return {
    current: naPosicao.find(a => !a.supersededAt && comArquivo(a)) ?? null,
    superseded: naPosicao.filter(a => Boolean(a.supersededAt)),
    briefings: assets.filter(a => !a.anchorKind && !a.supersededAt && a.status === "prompt_ready"),
    candidates: assets.filter(a => !a.anchorKind && !a.supersededAt && comArquivo(a)),
  };
}

/** O que a tela oferece depende só de haver ou não imagem atual. */
export type PanelAction = "registrar_briefing" | "anexar_imagem" | "substituir_imagem" | "editar_alt" | "editar_briefing";

export function actionsFor(state: AnchorState): PanelAction[] {
  return state.current
    ? ["substituir_imagem", "editar_alt", "editar_briefing"]
    : ["registrar_briefing", "anexar_imagem"];
}
