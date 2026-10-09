"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  RADAR_ARTICLE_BLUEPRINT_CONTINUATION_LABEL,
  radarArticleBlueprintContinuationOf,
  radarArticleBlueprintParagraphPlan,
  radarArticleBlueprintPublishedMapLine,
  radarArticleBlueprintPublishedMapReading,
  radarArticleBlueprintReportFacts,
  radarArticleBlueprintRulesNoticeText,
  type RadarArticleBlueprintEdit,
  type RadarArticleBlueprintPayload,
  type RadarArticleBlueprintReportFacts,
  type RadarArticleBlueprintSkeletonItem,
} from "@/lib/radar/article-blueprint";
import { radarArticleBlueprintInvestigationRefOf, radarArticleBlueprintOfPanelFreeze, type RadarArticleBlueprintPanelFreeze } from "@/lib/radar/article-blueprint-freeze";
import type { RadarPhase1Action } from "@/lib/radar/serp-phase1";
import type { RadarPrimarySearchMode } from "@/lib/radar/search-mode";
import { RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS, radarFinalizeWithAiLabel, radarPhase1WithAutoFinalize } from "@/lib/radar/operational-actions";

/**
 * ===== O ARTIGO-MODELO NA TELA (SDD diretriz editorial, Adendo A, D5 — 2026-10-02) =====
 *
 * "IA analisa → aplica na cópia → humano revisa e aprova." Gerar é um clique
 * explícito, com o custo dito antes; o que a IA devolve aparece inteiro — medidas,
 * keywords, seções, links, imagens — com as correções do servidor; o dono edita
 * (outra versão) e aprova.
 *
 * 2026-10-02 · O ARTIGO-MODELO DA SERP (decisão do dono). O painel deixou de ser
 * "coisa à parte": mora dentro da Pesquisa, logo abaixo do modelo do artigo que
 * a SERP monta. "A SERP monta o esqueleto; a IA organiza; você aprova." A
 * organização é pedida ao finalizar (o botão avisa a chamada de IA); falha da IA
 * não desfaz o finalizar — o painel mostra o erro e oferece organizar de novo.
 * Cada seção diz de onde veio (ids M do esqueleto e evidências). Enquanto não
 * aprovado, o CSV já sai com a proposta, marcada; aprovado, a marca some.
 */

type Versao = {
  id: string;
  versionNumber: number;
  state: "DRAFT" | "APPROVED";
  origin: "ai" | "human_edit";
  /** 2026-10-02 · O congelamento da investigação a que a versão pertence (a rota já o devolve). */
  bundleHash?: string;
  payload: RadarArticleBlueprintPayload;
  validation: string[];
  createdAt: string;
  approvedAt: string | null;
};

/* ============================== a versão do pacote vigente ============================== */

/* 2026-10-08 · P0-A · `createdAt` e `payload` (opcionais) dão a investigação em que a versão nasceu. */
type VersaoParaEscolha = Pick<Versao, "versionNumber" | "state" | "origin" | "bundleHash"> & { createdAt?: string | null; payload?: unknown };

/** 2026-10-08 · P0-A · a referência do congelamento que a versão gravou (ausente na versão antiga). */
const referenciaDaVersao = (versao: VersaoParaEscolha) => radarArticleBlueprintInvestigationRefOf((versao.payload as { investigationRef?: unknown } | null | undefined)?.investigationRef);

/**
 * 2026-10-02 · QUAL VERSÃO O PAINEL MOSTRA — a mesma regra do export.
 *
 * Revisão da frente: o painel mostrava sempre `versoes[0]` — a mais nova de
 * QUALQUER congelamento — e dizia que o CSV saía com ela. O export
 * (`radarArticleBlueprintExportChoice`) leva a APROVADA mais nova do pacote
 * vigente e, sem ela, a proposta mais nova dele. Agora o painel mostra essa.
 *
 * O pacote vigente é `vigente` quando quem chama o sabe. Sem ele, é o da
 * versão mais nova que a IA organizou: organizar sempre usa o congelamento
 * atual, e a edição do dono copia o da versão que editou. Versões sem
 * congelamento informado (resposta antiga da rota) caem na regra de antes: a
 * mais nova.
 *
 * Devolve também a mais nova quando ela é de OUTRO congelamento (para o aviso)
 * e a proposta deste congelamento mais nova que a aprovada (que o dono pode
 * revisar e aprovar; até lá, o CSV segue com a aprovada).
 *
 * 2026-10-08 · P0-A · `congelamento` (opcional): o pacote congelado que a página
 * conhece (`finalizedBundle`: instante, id e hash). A página passa em `vigente`
 * o hash do pacote CONGELADO, e a versão guarda o hash do DOSSIÊ — os dois
 * nunca batiam, e o painel dizia "outro congelamento" de toda versão. Agora a
 * versão é do vigente pelo hash (como antes), pelo hash congelado que ela
 * gravou ou, com `congelamento`, pela regra do export sem o ArticleDNA
 * (`radarArticleBlueprintOfPanelFreeze`): a versão antiga organizada depois do
 * congelamento vigente continua sendo a que vai aos entregáveis.
 */
export function radarArticleBlueprintPanelChoice<V extends VersaoParaEscolha>(versoes: readonly V[], vigente: string | null = null, congelamento: RadarArticleBlueprintPanelFreeze | null = null): {
  shown: V | null;
  currentBundleHash: string | null;
  /**
   * 2026-10-02 · Aditivo (revisão): o congelamento vigente foi INFORMADO por
   * quem chama. Falso = deduzido das versões: aí o painel não pode afirmar que
   * a versão mostrada vai ao CSV e ao Redator — a investigação pode ter sido
   * refinalizada com a IA falhando, e a versão deduzida ser de outro pacote.
   */
  currentConfirmed: boolean;
  /**
   * 2026-10-08 (correção) · Aditivo: a versão mostrada é, CONFERIDO, a que vai ao
   * CSV, ao Redator e ao MCP — o congelamento vigente foi informado e a versão
   * casa pelo hash ou pela referência gravada (com o ArticleDNA da página,
   * quando ele veio). A versão antiga reconhecida pelo relógio não tem o
   * ArticleDNA conferido aqui: o painel não afirma que ela vai.
   */
  deliveryConfirmed: boolean;
  newestFromOtherFreeze: V | null;
  newerDraft: V | null;
} {
  const confirmado = Boolean(vigente || congelamento);
  const ordem = [...versoes].sort((a, b) => b.versionNumber - a.versionNumber);
  const maisNova = ordem[0] ?? null;
  if (!maisNova) return { shown: null, currentBundleHash: vigente, currentConfirmed: confirmado, deliveryConfirmed: false, newestFromOtherFreeze: null, newerDraft: null };
  if (!vigente && !congelamento && ordem.every(item => !item.bundleHash)) return { shown: maisNova, currentBundleHash: null, currentConfirmed: false, deliveryConfirmed: false, newestFromOtherFreeze: null, newerDraft: null };
  const pacote = vigente || (congelamento ? null : ordem.find(item => item.origin === "ai" && item.bundleHash)?.bundleHash || ordem.find(item => item.bundleHash)?.bundleHash || null);
  /* 2026-10-08 · P0-A · a regra pura do congelamento recebe as versões com id, data e a referência gravada. */
  const metas = ordem.map((item, indice) => ({ id: String(indice), bundleHash: item.bundleHash || "", versionNumber: item.versionNumber, state: item.state, createdAt: item.createdAt ?? null, investigationRef: (item.payload as { investigationRef?: unknown } | null | undefined)?.investigationRef }));
  const porHash = (item: V) => Boolean(pacote && item.bundleHash === pacote);
  const pelaReferencia = (item: V) => {
    const ref = referenciaDaVersao(item);
    if (!ref) return false;
    if (congelamento) return radarArticleBlueprintOfPanelFreeze(metas[ordem.indexOf(item)], metas, congelamento);
    return Boolean(pacote && ref.frozenBundleHash === pacote);
  };
  const doVigente = (item: V) => porHash(item) || pelaReferencia(item)
    || Boolean(congelamento && radarArticleBlueprintOfPanelFreeze(metas[ordem.indexOf(item)], metas, congelamento));
  /*
   * 2026-10-08 (correção) · A MESMA REGRA DO EXPORT (`radarArticleBlueprintPick`):
   * rascunho só pelo hash exato; pelo congelamento, só a CONCLUÍDA. O painel
   * mostrava o rascunho antigo do mesmo congelamento como "vai ao CSV assim
   * mesmo", e o CSV saía sem artigo-modelo.
   */
  /*
   * 2026-10-09 · O ARTIGO-MODELO OBRIGATÓRIO: só a CONCLUÍDA vai às entregas (o
   * export, o Redator e o MCP não leem rascunho). O rascunho antigo do vigente
   * deixa de ser "o que vai ao CSV" e fica à mão (`newerDraft`) para concluir.
   */
  const aprovada = ordem.find(item => item.state === "APPROVED" && doVigente(item)) ?? null;
  const shown = aprovada;
  const newerDraft = ordem.filter(doVigente).find(item => item.state === "DRAFT" && (!aprovada || item.versionNumber > aprovada.versionNumber)) ?? null;
  return {
    shown,
    currentBundleHash: pacote,
    currentConfirmed: confirmado,
    deliveryConfirmed: Boolean(confirmado && shown && (porHash(shown) || (pelaReferencia(shown) && congelamento?.articleDnaVersionId))),
    newestFromOtherFreeze: doVigente(maisNova) ? null : maisNova,
    newerDraft,
  };
}

/**
 * 2026-10-02 · O RÓTULO DO ESTADO (revisão). "Vai ao CSV e ao Redator" só
 * quando é verdade conferida: a versão é a escolhida pela regra do export E o
 * congelamento vigente foi informado ao painel. Sem isso, a aprovada diz que
 * vai se for do congelamento vigente — o painel não afirma o que não sabe.
 */
export function radarArticleBlueprintPanelStateLabel(versao: Pick<Versao, "state" | "origin">, vaiAoCsvConferido: boolean, semArticleDnaConferido = false): string {
  /* 2026-10-02 · D10 · organizar e editar gravam a versão concluída: ela é a que vai ao CSV, ao Redator e ao MCP. */
  if (versao.state === "APPROVED") {
    if (vaiAoCsvConferido) return "Concluído — vai ao CSV, ao Redator e ao MCP";
    /* 2026-10-08 (correção) · do congelamento vigente, mas sem o ArticleDNA conferido aqui (versão antiga, ou a página não o informou). */
    return semArticleDnaConferido ? "Concluído — do congelamento vigente; vai aos entregáveis se o ArticleDNA não mudou desde a organização" : "Concluído — vai aos entregáveis se for do congelamento vigente";
  }
  /* 2026-10-09 · o artigo-modelo obrigatório: só a versão concluída vai às entregas; o rascunho antigo não. */
  return "Versão antiga em rascunho — não vai às entregas; conclua esta versão ou organize de novo";
}

type SecaoEditada = { h2: string; readerQuestion: string; answerFirst: string; remove: boolean };

/* ============================== o encadeamento ============================== */

/**
 * 2026-10-02 · A ORGANIZAÇÃO DE UM ARTIGO, como a tela a acompanha. A página
 * cria o trabalho depois do finalizar confirmado; o painel só o mostra.
 */
export type RadarArticleBlueprintJob = {
  articleId: string;
  state: "running" | "done" | "failed";
  message: string | null;
  /** Marca de tempo do evento: o painel relê as versões quando ela muda. */
  at: number;
  position: { index: number; total: number };
};

export type RadarArticleBlueprintOrganizeResult = { ok: true; versionNumber: number | null } | { ok: false; message: string };

export const RADAR_ARTICLE_BLUEPRINT_ROUTE = "/api/editorial/radar-article-blueprint";

/** Uma chamada de IA, ou N no lote — a frase que o botão e o aviso usam. */
export const radarArticleBlueprintCallsLabel = (artigos: number) => (artigos === 1 ? "1 chamada de IA" : `${artigos} chamadas de IA`);

/*
 * ===== 2026-10-09 · O CUSTO DITO NO BOTÃO, ANTES DO CLIQUE (regra do dono) =====
 *
 * "Sem importar os custos": toda entrega exige o artigo-modelo e, quando ele
 * falta, a operação o organiza — com o teto dito no próprio botão. O teto real
 * por artigo é 2 chamadas: a que organiza e UMA a mais, que é a nova tentativa
 * (resposta cortada ou fora do formato) OU a passada de correção (a
 * conferência apontou o que corrigir) — nunca as duas
 * (`generateRadarArticleBlueprint`: `allowFix` só depois de 1 chamada).
 */
/* 2026-10-09 (correção) · o teto vem de uma constante só (a mesma dos botões de finalizar). */
export const RADAR_ARTICLE_BLUEPRINT_MAX_CALLS_PER_ARTICLE = RADAR_ARTICLE_BLUEPRINT_MAX_AI_CALLS;

/** O teto do lote: até 2 chamadas por artigo. */
export const radarArticleBlueprintMaxCalls = (artigos: number) => Math.max(0, Math.trunc(artigos)) * RADAR_ARTICLE_BLUEPRINT_MAX_CALLS_PER_ARTICLE;

/** "+ até 2N chamadas de IA" — o mesmo texto em todo botão que organiza. */
export const radarArticleBlueprintCostLabel = (artigos: number) => `+ até ${radarArticleBlueprintMaxCalls(artigos)} chamadas de IA`;

/** O botão do export quando falta o artigo-modelo. */
export const radarArticleBlueprintOrganizeAndExportLabel = (artigos: number) =>
  `Organizar ${artigos} artigo(s)-modelo e exportar (${radarArticleBlueprintCostLabel(artigos)})`;

/** O botão do envio ao Redator quando falta o artigo-modelo. */
export const RADAR_ARTICLE_BLUEPRINT_ORGANIZE_AND_SEND_LABEL = `Organizar o artigo-modelo e enviar (${radarArticleBlueprintCostLabel(1)})`;

/** O botão da barra de lote (a seleção, ou o Silo dela). */
export const radarArticleBlueprintBatchLabel = (artigos: number, escopo: "selecao" | "silo" = "selecao") =>
  `${escopo === "silo" ? "Organizar o artigo-modelo do Silo" : "Organizar o artigo-modelo"} (${artigos}) · ${radarArticleBlueprintCostLabel(artigos)}`;

/** A confirmação: o custo inteiro, com a passada de correção e o teto por artigo. */
export function radarArticleBlueprintCostConfirmation(artigos: number): string {
  const total = Math.max(1, Math.trunc(artigos));
  const teto = radarArticleBlueprintMaxCalls(total);
  return [
    total === 1
      ? `Isto faz até ${teto} chamadas de IA (DeepSeek, cota da marca) sobre a investigação congelada: 1 para organizar o artigo-modelo e, se a resposta vier cortada ou a conferência apontar o que corrigir, mais 1 — a nova tentativa ou a passada de correção, nunca as duas.`
      : `Isto faz até ${teto} chamadas de IA (DeepSeek, cota da marca), em série, um artigo por vez: 1 por artigo para organizar o artigo-modelo e, se a resposta vier cortada ou a conferência apontar o que corrigir, mais 1 — a nova tentativa ou a passada de correção (no máximo ${RADAR_ARTICLE_BLUEPRINT_MAX_CALLS_PER_ARTICLE} por artigo).`,
    "Cada artigo pode levar até 4 minutos; a falha de um não para os outros e não desfaz nenhuma investigação.",
  ].join(" ");
}

/**
 * 2026-10-09 · O QUE A ROTA DE EXPORT DISSE QUE FALTA. A resposta 409
 * `needs_article_blueprint` traz os artigos pelo título; o que não tiver a
 * forma esperada é descartado. `null` = a resposta não é essa recusa.
 */
export function radarExportMissingArticleBlueprints(corpo: unknown): Array<{ articleId: string; title: string }> | null {
  const lido = corpo as { code?: unknown; missingArticleBlueprints?: unknown } | null;
  if (!lido || typeof lido !== "object" || lido.code !== "needs_article_blueprint" || !Array.isArray(lido.missingArticleBlueprints)) return null;
  const itens = (lido.missingArticleBlueprints as unknown[])
    .filter((item): item is { articleId: string; title?: unknown } => Boolean(item) && typeof (item as { articleId?: unknown }).articleId === "string" && Boolean((item as { articleId: string }).articleId.trim()))
    .map(item => ({ articleId: item.articleId, title: typeof item.title === "string" && item.title.trim() ? item.title.trim() : "artigo sem título conhecido" }));
  return itens.length ? itens : null;
}

/** 2026-10-09 · O aviso do export que parou: o que falta, pelo título, e o caminho (o botão com o custo). */
export function radarExportMissingArticleBlueprintNotice(faltando: ReadonlyArray<{ title: string }>): string {
  const nomes = faltando.slice(0, 5).map(item => `"${item.title}"`).join(", ");
  const resto = faltando.length > 5 ? ` e mais ${faltando.length - 5}` : "";
  return `Toda entrega sai pelo artigo-modelo, e ${faltando.length === 1 ? "este artigo ainda não tem o dele" : `${faltando.length} artigos ainda não têm o deles`}: ${nomes}${resto}. Use "${radarArticleBlueprintOrganizeAndExportLabel(faltando.length)}" para organizar em série e exportar no fim.`;
}

/**
 * 2026-10-02 · O BOTÃO DE FINALIZAR DIZ QUE INCLUI A IA.
 *
 * A ação, o id e o handler continuam os da Fase 1 (`radarPhase1Action`): só o
 * rótulo e o ⓘ ganham o aviso da chamada de IA que vem depois do congelamento.
 */
export function radarPhase1WithArticleBlueprint(acao: RadarPhase1Action, artigos = 1): RadarPhase1Action {
  if (acao.id !== "FINALIZE_SERP") return acao;
  /*
   * 2026-10-09 (correção) · o TETO no rótulo ("inclui até 2 chamadas de IA"), a
   * mesma frase dos botões de finalizar do YouTube e da Amazon e do export.
   */
  const teto = radarArticleBlueprintMaxCalls(Math.max(1, artigos));
  return {
    ...acao,
    label: artigos <= 1 ? radarFinalizeWithAiLabel(acao.label) : `${acao.label} · inclui até ${teto} chamadas de IA`,
    info: [
      acao.info,
      `Depois de congelar, a IA organiza o artigo-modelo da SERP sobre o pacote congelado: até ${teto} chamadas de IA (DeepSeek, cota da marca) — 1 por artigo para organizar e, se a resposta vier cortada ou a conferência apontar o que corrigir, mais 1, nunca as duas.`,
      "Se a IA falhar, a investigação continua finalizada e o painel \"Artigo-modelo da SERP\" oferece organizar de novo. O artigo-modelo sai concluído: com pendência na conferência, a IA corrige numa chamada a mais.",
    ].filter(Boolean).join(" "),
  };
}

/**
 * ====== 2026-10-08 · O BOTÃO DA FASE 1 COMO A TELA O MOSTRA — uma montagem só ======
 *
 * O botão da Fase 1 passa por dois invólucros de texto (o "e finaliza" da
 * análise e o "inclui 1 chamada de IA" do finalizar). A frase do automático,
 * quando parava, nomeava "Finalizar pesquisa" fixo — enquanto a tela mostrava
 * "Analisar concorrência · e finaliza (+ 1 chamada de IA)". O dono leu
 * "revise e use Finalizar pesquisa" e não achou botão nenhum com esse nome.
 *
 * O `Phase1Button` e a frase de parada usam ESTA função: o nome dito é o nome
 * que está na tela, naquele estado.
 */
export function radarPhase1Visible(acao: RadarPhase1Action, mode: RadarPrimarySearchMode = "WEB"): RadarPhase1Action {
  /* 2026-10-08 · o modo decide a nota do ⓘ: a regra nova é só do Google. */
  return radarPhase1WithArticleBlueprint(radarPhase1WithAutoFinalize(acao, mode));
}

/** O rótulo do botão da Fase 1 na tela, ou `null` quando não há botão que resolva (ação NONE ou desabilitada). */
export function radarPhase1VisibleLabel(acao: RadarPhase1Action | null | undefined, mode: RadarPrimarySearchMode = "WEB"): string | null {
  if (!acao || acao.id === "NONE" || !acao.enabled) return null;
  return radarPhase1Visible(acao, mode).label;
}

/** POST "generate": organizar o artigo-modelo da SERP de um artigo finalizado. */
export async function postRadarArticleBlueprintOrganize(input: { brandId: string; articleId: string; ifMissing?: boolean; fetchImpl?: typeof fetch }): Promise<RadarArticleBlueprintOrganizeResult> {
  try {
    const resposta = await (input.fetchImpl ?? fetch)(RADAR_ARTICLE_BLUEPRINT_ROUTE, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "generate", brandId: input.brandId, articleId: input.articleId, confirmPaid: true, ...(input.ifMissing ? { ifMissing: true } : {}) }),
    });
    const corpo = await resposta.json().catch(() => ({})) as { success?: boolean; error?: string; notes?: string[]; version?: { versionNumber?: unknown } };
    if (!resposta.ok || !corpo.success) return { ok: false, message: [corpo.error || "A IA não organizou o artigo-modelo da SERP.", ...(corpo.notes || [])].join(" ") };
    return { ok: true, versionNumber: typeof corpo.version?.versionNumber === "number" ? corpo.version.versionNumber : null };
  } catch {
    return { ok: false, message: "Sem resposta do servidor ao organizar o artigo-modelo da SERP." };
  }
}

/**
 * 2026-10-02 · EM SÉRIE, UM POR VEZ, COM PROGRESSO.
 *
 * Um artigo depois do outro: N artigos são N chamadas de IA, nunca em paralelo.
 * A falha de um não para os outros e não desfaz nenhum finalizar.
 */
export async function organizeRadarArticleBlueprintsInSeries(input: {
  articleIds: readonly string[];
  organize: (articleId: string) => Promise<RadarArticleBlueprintOrganizeResult>;
  onProgress?: (job: RadarArticleBlueprintJob) => void;
  now?: () => number;
}): Promise<{ done: string[]; failed: Array<{ articleId: string; message: string }> }> {
  const ids = [...new Set(input.articleIds.filter(Boolean))];
  const agora = input.now ?? Date.now;
  const done: string[] = [];
  const failed: Array<{ articleId: string; message: string }> = [];
  for (const [indice, articleId] of ids.entries()) {
    const position = { index: indice + 1, total: ids.length };
    input.onProgress?.({ articleId, state: "running", message: null, at: agora(), position });
    let resultado: RadarArticleBlueprintOrganizeResult;
    try {
      resultado = await input.organize(articleId);
    } catch {
      resultado = { ok: false, message: "A organização do artigo-modelo da SERP falhou antes de chegar ao servidor." };
    }
    if (resultado.ok) done.push(articleId);
    else failed.push({ articleId, message: resultado.message });
    input.onProgress?.({ articleId, state: resultado.ok ? "done" : "failed", message: resultado.ok ? null : resultado.message, at: agora(), position });
  }
  return { done, failed };
}

/** O aviso do fim do lote (ou do artigo único). */
export function radarArticleBlueprintSeriesSummary(resultado: { done: readonly string[]; failed: ReadonlyArray<{ message: string }> }): string {
  const total = resultado.done.length + resultado.failed.length;
  if (!resultado.failed.length) {
    return total === 1
      ? "Artigo-modelo da SERP organizado e concluído: já vai ao CSV, ao Redator e ao MCP. Para mudar, edite em Pesquisa → Artigo-modelo da SERP; a edição vira a versão vigente."
      : `Artigo-modelo da SERP organizado e concluído em ${total} artigo(s) (${radarArticleBlueprintCallsLabel(total)}). Para mudar, edite em Pesquisa → Artigo-modelo da SERP.`;
  }
  const primeira = resultado.failed[0].message;
  return total === 1
    ? `A investigação continua finalizada, mas a IA não organizou o artigo-modelo da SERP: ${primeira} Use "Organizar de novo (IA)" em Pesquisa → Artigo-modelo da SERP.`
    : `Artigo-modelo da SERP: ${resultado.done.length} organizado(s) e ${resultado.failed.length} com falha (${radarArticleBlueprintCallsLabel(total)} no lote). As investigações continuam finalizadas; a primeira falha: ${primeira}`;
}

/**
 * ===== 2026-10-09 · ORGANIZAR O QUE FALTA E SEGUIR (export e envio ao Redator) =====
 *
 * A operação que exige o artigo-modelo organiza os que faltam, EM SÉRIE (a
 * mesma `organizeRadarArticleBlueprintsInSeries`, com progresso), e só segue
 * — exporta ou envia — quando todos ficaram concluídos. Com falha, não segue:
 * a entrega sairia sem a planta, e a regra é que nenhuma sai pelo processo
 * antigo. O que falhou volta para quem chama oferecer de novo.
 */
export async function organizeRadarArticleBlueprintsThenRun<R>(input: {
  articleIds: readonly string[];
  organize: (articleId: string) => Promise<RadarArticleBlueprintOrganizeResult>;
  run: () => Promise<R>;
  onProgress?: (job: RadarArticleBlueprintJob) => void;
  now?: () => number;
}): Promise<{ done: string[]; failed: Array<{ articleId: string; message: string }>; ran: false } | { done: string[]; failed: []; ran: true; result: R }> {
  const serie = await organizeRadarArticleBlueprintsInSeries({ articleIds: input.articleIds, organize: input.organize, onProgress: input.onProgress, now: input.now });
  if (serie.failed.length) return { done: serie.done, failed: serie.failed, ran: false };
  return { done: serie.done, failed: [], ran: true, result: await input.run() };
}

/** O progresso dito enquanto a série roda (o aviso do topo da página). */
export function radarArticleBlueprintProgressNotice(job: RadarArticleBlueprintJob, depois: "exportar" | "enviar" | null = null): string {
  const seguir = depois === "exportar" ? " Ao terminar, o arquivo é exportado." : depois === "enviar" ? " Ao terminar, o artigo é enviado ao Redator." : "";
  return job.position.total > 1
    ? `Organizando o artigo-modelo com a IA: ${job.position.index} de ${job.position.total}…${seguir}`
    : `Organizando o artigo-modelo com a IA…${seguir}`;
}

/**
 * 2026-10-09 · O FIM DO LOTE DA BARRA. A barra organiza "só se faltar"
 * (`ifMissing`): o artigo que já tem o artigo-modelo da investigação vigente
 * não paga de novo, e a rota não diz quais pagaram — a frase não conta
 * chamadas que podem não ter acontecido.
 */
export function radarArticleBlueprintBatchSummary(resultado: { done: readonly string[]; failed: ReadonlyArray<{ message: string }> }): string {
  const total = resultado.done.length + resultado.failed.length;
  if (!resultado.failed.length) {
    return `Artigo-modelo conferido em ${total} artigo(s): os que não tinham foram organizados e concluídos; os que já tinham o da investigação vigente não pagaram de novo. Já vão ao CSV, ao Redator e ao MCP.`;
  }
  return `Artigo-modelo: ${resultado.done.length} pronto(s) e ${resultado.failed.length} com falha. As investigações continuam finalizadas; a primeira falha: ${resultado.failed[0].message} Use o botão de novo para os que faltam.`;
}

/* ============================== a leitura ============================== */

const botao = "inline-flex min-h-10 items-center justify-center rounded-md border border-divider px-3 py-2 text-sm font-medium text-foreground transition-colors hover:border-context-accent hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const botaoPrincipal = "inline-flex min-h-10 items-center justify-center rounded-md border border-context-accent px-3 py-2 text-sm font-medium text-foreground transition-colors hover:text-context-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-focus disabled:cursor-not-allowed disabled:opacity-50";
const campo = "mt-1 w-full rounded-md border border-divider bg-surface-elevated px-3 py-2 text-sm leading-6 text-foreground";
const bloco = "rounded-md border border-divider bg-surface-subtle p-3";

/* 2026-10-02 · estado com a semântica do sistema visual: aprovação é success; proposta e edição aguardam decisão humana (pending). O rótulo: `radarArticleBlueprintPanelStateLabel`. */
const corDoEstado = (versao: Versao) => versao.state === "APPROVED" ? "border-success/40 text-success" : "border-pending/40 text-pending";

type Leitura = { versions: Versao[] } | { error: string; missingTable: boolean };

/** Só busca; quem chama aplica o resultado (o efeito não muda estado antes da resposta). */
async function lerVersoes(brandId: string, articleId: string): Promise<Leitura> {
  try {
    const resposta = await fetch(`${RADAR_ARTICLE_BLUEPRINT_ROUTE}?brandId=${encodeURIComponent(brandId)}&articleId=${encodeURIComponent(articleId)}`, { cache: "no-store" });
    const corpo = await resposta.json().catch(() => ({})) as { success?: boolean; versions?: Versao[]; error?: string };
    if (!resposta.ok || !corpo.success) {
      const semTabela = /radar_article_blueprints|does not exist|schema cache/i.test(corpo.error || "");
      return {
        missingTable: semTabela,
        error: semTabela ? "O artigo-modelo ainda não tem tabela no banco: aplique a migration 20261002120000 antes de usar." : corpo.error || "Não foi possível ler o artigo-modelo.",
      };
    }
    return { versions: corpo.versions || [] };
  } catch {
    return { error: "Sem resposta do servidor ao ler o artigo-modelo.", missingTable: false };
  }
}

/**
 * 2026-10-02 · O ARTIGO-MODELO PARA O RELATÓRIO. Só leitura (GET): a versão do
 * pacote vigente pela mesma regra do painel e do export, resumida para os
 * pilares de estrutura e links. `null` enquanto lê, sem versão ou com erro —
 * e aí o Relatório fica com a leitura de antes.
 */
/** 2026-10-08 (correção) · o congelamento da página (`finalizedBundle`) com o ArticleDNA que ela conhece; sem pacote congelado, null. */
export function radarArticleBlueprintFreezeOf(congelado: { frozenAt: string; bundleId?: string | null; bundleHash?: string | null } | null | undefined, articleDnaVersionId: string | null): RadarArticleBlueprintPanelFreeze | null {
  if (!congelado) return null;
  return { frozenAt: congelado.frozenAt, bundleId: congelado.bundleId ?? null, bundleHash: congelado.bundleHash ?? null, ...(articleDnaVersionId ? { articleDnaVersionId } : {}) };
}

/**
 * 2026-10-09 · O CONGELAMENTO DO ARTIGO-MODELO SEM O GOOGLE. O painel só
 * aparecia com o pacote congelado do Google; o artigo de Amazon (ou de
 * YouTube) congelado sem ele ficava sem artigo-modelo na tela. A precedência é
 * a do servidor (`radarFrozenObservedAtOfAnalysis`): Google, Amazon, YouTube.
 */
export function radarArticleBlueprintFreezeOfInvestigation(
  congelamentos: {
    google: { frozenAt: string; bundleId?: string | null; bundleHash?: string | null } | null | undefined;
    amazon?: { finalizedAt?: string | null } | null;
    youtube?: { finalizedAt?: string | null } | null;
  },
  articleDnaVersionId: string | null,
): RadarArticleBlueprintPanelFreeze | null {
  /*
   * O congelamento da Amazon que a página conhece também confere a planta (a
   * mesma regra do export): `amazon` informado (mesmo nulo) vira `amazonFrozenAt`;
   * ausente, o painel não confere a Amazon, como antes.
   */
  const daAmazon = congelamentos.amazon === undefined ? {} : { amazonFrozenAt: congelamentos.amazon?.finalizedAt || null };
  if (congelamentos.google) {
    const doGoogle = radarArticleBlueprintFreezeOf(congelamentos.google, articleDnaVersionId);
    return doGoogle ? { ...doGoogle, ...daAmazon } : null;
  }
  const instante = congelamentos.amazon?.finalizedAt || congelamentos.youtube?.finalizedAt || null;
  const semGoogle = instante ? radarArticleBlueprintFreezeOf({ frozenAt: instante }, articleDnaVersionId) : null;
  return semGoogle ? { ...semGoogle, ...daAmazon } : null;
}

/**
 * 2026-10-09 · A ENTREGA PELO PAINEL: há artigo-modelo concluído do
 * congelamento vigente (a regra do painel, a mesma do export)? É o que decide,
 * na tela, "Enviar ao Redator" ou "Organizar o artigo-modelo e enviar". O
 * servidor confere de novo, com o ArticleDNA, antes de criar o documento.
 */
/*
 * 2026-10-09 (correção) · "unreadable": a LEITURA das versões falhou (rede, servidor
 * ou tabela ausente). Não é "falta organizar": a tela não oferece a organização
 * paga quando o problema é ler — diz que não conferiu e pede para tentar de novo.
 */
export type RadarArticleBlueprintDelivery = "loading" | "approved" | "missing" | "unreadable";

export function radarArticleBlueprintDeliveryOf<V extends VersaoParaEscolha>(versoes: readonly V[], vigente: string | null, congelamento: RadarArticleBlueprintPanelFreeze | null): "approved" | "missing" {
  const escolha = radarArticleBlueprintPanelChoice(versoes, vigente, congelamento);
  return escolha.shown?.state === "APPROVED" && escolha.currentConfirmed ? "approved" : "missing";
}

/**
 * ===== 2026-10-09 · O BOTÃO QUE ORGANIZA, COM O CUSTO ANTES DO CLIQUE =====
 *
 * Um só desenho para o export, a barra de lote e o envio ao Redator: o rótulo
 * já diz o teto ("+ até 2N chamadas de IA"); o clique abre a confirmação, que
 * cita a passada de correção; só "Confirmar e organizar" chama a IA.
 */
/* `open`/`onOpenChange` (opcionais): a confirmação aberta por fora (o botão do card do export abre a mesma confirmação). */
export function RadarArticleBlueprintCostAction({ articles, label, onConfirm, disabled = false, testId, open, onOpenChange }: { articles: number; label: string; onConfirm: () => void; disabled?: boolean; testId: string; open?: boolean; onOpenChange?: (aberto: boolean) => void }) {
  const [confirmandoAqui, setConfirmandoAqui] = useState(false);
  const confirmando = open ?? confirmandoAqui;
  const setConfirmando = (aberto: boolean) => { setConfirmandoAqui(aberto); onOpenChange?.(aberto); };
  if (confirmando) {
    return <div className={bloco} data-testid={`${testId}-confirm`}>
      <p className="text-sm leading-6 text-foreground">{radarArticleBlueprintCostConfirmation(articles)}</p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" className={botaoPrincipal} disabled={disabled} onClick={() => { setConfirmando(false); onConfirm(); }} data-testid={`${testId}-confirmar`}>Confirmar e organizar</button>
        <button type="button" className={botao} onClick={() => setConfirmando(false)}>Cancelar</button>
      </div>
    </div>;
  }
  return <button type="button" className={botaoPrincipal} disabled={disabled || articles < 1} onClick={() => setConfirmando(true)} data-testid={testId}>{label}</button>;
}

export function useRadarArticleBlueprintForReport(brandId: string | null, articleId: string | null, currentBundleHash: string | null, currentFreeze: RadarArticleBlueprintPanelFreeze | null = null): ({ approval: "APPROVED" | "DRAFT" } & RadarArticleBlueprintReportFacts) | null {
  const [versoes, setVersoes] = useState<Versao[] | null>(null);
  useEffect(() => {
    if (!brandId || !articleId || !currentBundleHash) return;
    let vivo = true;
    void lerVersoes(brandId, articleId).then(leitura => { if (vivo) setVersoes("error" in leitura ? [] : leitura.versions); });
    return () => { vivo = false; };
  }, [brandId, articleId, currentBundleHash]);
  if (!versoes || !currentBundleHash) return null;
  /* 2026-10-08 · P0-A · a versão do congelamento vigente pela regra do painel (o hash da página é o do pacote congelado, não o do dossiê). */
  const escolhida = radarArticleBlueprintPanelChoice(versoes, currentBundleHash, currentFreeze).shown;
  if (!escolhida) return null;
  return { approval: escolhida.state, ...radarArticleBlueprintReportFacts(escolhida.payload) };
}

/** 2026-10-02 · De onde a seção veio: as seções M do esqueleto e as evidências, pelo que a versão guardou. */
function origemDaSecao(payload: RadarArticleBlueprintPayload, ids: readonly string[]): string[] {
  const doEsqueleto = new Map((payload.skeleton || []).map(item => [item.id, item]));
  const daEvidencia = new Map(payload.evidence.map(item => [item.id, item]));
  return [...new Set(ids)].map(id => {
    const secao = doEsqueleto.get(id);
    if (secao) return `${id} "${secao.heading}"`;
    const evidencia = daEvidencia.get(id);
    return evidencia ? `${id} (${evidencia.kind})` : null;
  }).filter((item): item is string => Boolean(item));
}

/**
 * 2026-10-08 · B7 · A PLANTA MONTADA COM REGRAS ANTERIORES. Tela operacional
 * (não é entregável): a versão sem a versão das regras atuais é dita, e o
 * caminho é o "Organizar de novo (IA)" que já existe — nenhum botão novo. O
 * entregável continua saindo concluído com ela.
 */
export function RadarArticleBlueprintRulesNotice({ payload }: { payload: Pick<RadarArticleBlueprintPayload, "rulesVersion"> }) {
  /* 2026-10-09 (correção) · o texto diz o que falta pela versão gravada (`radarArticleBlueprintRulesNoticeText`). */
  const aviso = radarArticleBlueprintRulesNoticeText(payload);
  if (!aviso) return null;
  return <p className="text-sm leading-6 text-pending" role="status" data-testid="radar-article-blueprint-rules-outdated">
    {aviso}
  </p>;
}

const marcasDoEsqueleto = (item: RadarArticleBlueprintSkeletonItem) => [
  ...(item.mustCover ? ["obrigatória"] : []),
  ...(item.needsSource ? ["precisa de fonte"] : []),
  ...(item.outOfScope ? ["fora do escopo"] : []),
];

/**
 * `currentBundleHash` (2026-10-02, opcional): o congelamento vigente, quando a
 * página o conhece. Sem ele, o painel o deduz das versões (ver
 * `radarArticleBlueprintPanelChoice`).
 *
 * 2026-10-02 · revisão: a dedução não enxerga a refinalização em que a IA
 * falhou (o congelamento novo ainda não tem versão). A página que mostra o
 * painel conhece o pacote congelado e deve passá-lo; sem ele, o painel mostra
 * a versão deduzida mas não afirma que ela vai ao CSV e ao Redator.
 */
/*
 * 2026-10-08 · P0-A · `currentFreeze` (opcional): o pacote congelado vigente
 * (`finalizedBundle`). Com ele, a versão organizada sobre este congelamento é
 * reconhecida mesmo com o hash do dossiê mudado por código — a mesma regra que
 * o export, o Redator e o MCP aplicam (lá, também com o ArticleDNA).
 */
/*
 * 2026-10-09 · `onDeliveryChange` (opcional): o painel diz à página se há
 * artigo-modelo concluído do congelamento vigente ("approved"), se falta
 * ("missing") ou se ainda lê ("loading"). A página decide por ele o botão do
 * envio ao Redator, sem ler as versões uma segunda vez.
 */
export function RadarArticleBlueprintPanel({ brandId, articleId, job = null, currentBundleHash = null, currentFreeze = null, onDeliveryChange }: { brandId: string; articleId: string; job?: RadarArticleBlueprintJob | null; currentBundleHash?: string | null; currentFreeze?: RadarArticleBlueprintPanelFreeze | null; onDeliveryChange?: (entrega: RadarArticleBlueprintDelivery) => void }) {
  const [versoes, setVersoes] = useState<Versao[]>([]);
  /* 2026-10-02 · o dono pode abrir a proposta mais nova do mesmo congelamento para revisar e aprovar. */
  const [revisarNova, setRevisarNova] = useState(false);
  const [carregando, setCarregando] = useState(true);
  /* Sem a tabela, gerar gastaria a chamada paga sem ter onde gravar. */
  const [semTabela, setSemTabela] = useState(false);
  /* 2026-10-09 (correção) · a leitura falhou: a entrega é "não conferida", nunca "falta". */
  const [leituraFalhou, setLeituraFalhou] = useState(false);
  const [ocupado, setOcupado] = useState<"" | "generate" | "edit" | "approve">("");
  const [confirmando, setConfirmando] = useState(false);
  const [editando, setEditando] = useState(false);
  const [aviso, setAviso] = useState<{ ok: boolean; texto: string } | null>(null);
  const [rascunho, setRascunho] = useState<{ h1: string; seoTitle: string; metaDescription: string; promise: string; openingQuestion: string; secoes: SecaoEditada[] } | null>(null);

  const aplicar = useCallback((leitura: Leitura) => {
    if ("error" in leitura) { setAviso({ ok: false, texto: leitura.error }); setSemTabela(leitura.missingTable); setLeituraFalhou(true); setVersoes([]); } else { setSemTabela(false); setLeituraFalhou(false); setVersoes(leitura.versions); }
    setCarregando(false);
  }, []);
  const carregar = useCallback(async () => aplicar(await lerVersoes(brandId, articleId)), [aplicar, brandId, articleId]);

  /*
   * 2026-10-02 · a organização pedida pela página terminou (feita ou falha):
   * relê as versões. Só leitura — nenhuma chamada de IA nasce de efeito.
   */
  const fimDoTrabalho = job && job.articleId === articleId && job.state !== "running" ? job.at : null;
  useEffect(() => {
    let vivo = true;
    void lerVersoes(brandId, articleId).then(leitura => { if (vivo) aplicar(leitura); });
    return () => { vivo = false; };
  }, [aplicar, brandId, articleId, fimDoTrabalho]);

  /* 2026-10-02 · a versão do pacote vigente (a mesma regra do export), não a mais nova de qualquer congelamento. */
  const escolha = radarArticleBlueprintPanelChoice(versoes, currentBundleHash, currentFreeze);

  /* 2026-10-09 · a entrega, dita à página quando muda (a chamada mais nova é lida por ref: o efeito não depende da identidade dela). */
  const entrega: RadarArticleBlueprintDelivery = carregando || (job?.articleId === articleId && job.state === "running")
    ? "loading"
    : leituraFalhou
      ? "unreadable"
      : radarArticleBlueprintDeliveryOf(versoes, currentBundleHash, currentFreeze);
  const avisarEntrega = useRef(onDeliveryChange);
  useEffect(() => { avisarEntrega.current = onDeliveryChange; });
  useEffect(() => { avisarEntrega.current?.(entrega); }, [entrega]);
  const vaiAoCsv = escolha.shown;
  const atual = (revisarNova && escolha.newerDraft) || vaiAoCsv;
  /* 2026-10-02 · revisão: "vai ao CSV e ao Redator" só com o congelamento vigente informado pela página. */
  /* 2026-10-08 (correção) · conferido = hash exato ou referência gravada (com o ArticleDNA da página); a versão antiga pelo relógio não afirma. */
  const vaiAoCsvConferido = Boolean(atual && atual === vaiAoCsv && escolha.deliveryConfirmed);
  const b = atual?.payload.blueprint || null;
  const organizandoPelaPagina = Boolean(job && job.articleId === articleId && job.state === "running");
  const falhaDaPagina = job && job.articleId === articleId && job.state === "failed" ? job.message : null;

  const enviar = async (acao: "generate" | "edit" | "approve", extra: Record<string, unknown> = {}) => {
    setOcupado(acao);
    setAviso(null);
    try {
      const resposta = await fetch(RADAR_ARTICLE_BLUEPRINT_ROUTE, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: acao, brandId, articleId, ...extra }),
      });
      const corpo = await resposta.json().catch(() => ({})) as { success?: boolean; error?: string; notes?: string[] };
      if (!resposta.ok || !corpo.success) {
        setAviso({ ok: false, texto: [corpo.error || "A ação não foi concluída.", ...(corpo.notes || [])].join(" ") });
        return;
      }
      setAviso({ ok: true, texto: acao === "generate" ? "Artigo-modelo da SERP organizado e concluído: já vai aos entregáveis." : acao === "edit" ? "Edição salva como a versão vigente: já vai aos entregáveis." : "Versão concluída: já vai ao CSV, ao Redator e ao MCP." });
      setEditando(false);
      setConfirmando(false);
      setRevisarNova(false);
      await carregar();
    } catch {
      setAviso({ ok: false, texto: "Sem resposta do servidor. Atualize a área antes de tentar de novo." });
    } finally {
      setOcupado("");
    }
  };

  const abrirEdicao = () => {
    if (!b) return;
    setRascunho({
      h1: b.title.h1, seoTitle: b.title.seoTitle, metaDescription: b.title.metaDescription, promise: b.promise,
      openingQuestion: b.opening.readerQuestion,
      secoes: b.sections.map(secao => ({ h2: secao.h2, readerQuestion: secao.readerQuestion, answerFirst: secao.answerFirst, remove: false })),
    });
    setEditando(true);
  };

  const salvarEdicao = () => {
    if (!b || !rascunho || !atual) return;
    const edit: RadarArticleBlueprintEdit = {
      promise: rascunho.promise,
      title: { h1: rascunho.h1, seoTitle: rascunho.seoTitle, metaDescription: rascunho.metaDescription },
      openingQuestion: rascunho.openingQuestion,
      sections: rascunho.secoes.map((secao, index) => ({ index, ...(secao.remove ? { remove: true } : { h2: secao.h2, readerQuestion: secao.readerQuestion, answerFirst: secao.answerFirst }) })),
    };
    void enviar("edit", { blueprintId: atual.id, edit });
  };

  const candidato = (id: string) => atual?.payload.linkCandidates.find(item => item.id === id);
  const m = atual?.payload.measures;
  /* 2026-10-08 · B8 · os parágrafos pela faixa de palavras (a mesma conta do CSV); B1 · o mapa da página publicada. */
  const paragrafos = m && b ? radarArticleBlueprintParagraphPlan(m, b.sections.map(secao => secao.paragraphs)) : null;
  const mapaPublicado = atual ? radarArticleBlueprintPublishedMapReading(atual.payload) : [];
  const esqueleto = atual?.payload.skeleton || [];
  const descartados = b?.discarded || [];
  const travado = Boolean(ocupado) || organizandoPelaPagina;
  const rotuloDeOrganizar = atual || versoes.length || falhaDaPagina ? "Organizar de novo (IA)" : "Organizar o artigo-modelo da SERP (IA)";

  return <section className="space-y-3 rounded-md border border-divider bg-surface p-3" data-testid="radar-article-blueprint">
    <div className="flex flex-wrap items-start justify-between gap-2">
      <div>
        <h3 className="text-base font-semibold text-foreground">Artigo-modelo da SERP</h3>
        <p className="mt-1 text-sm leading-6 text-text-muted">A SERP monta o esqueleto, a IA organiza e corrige o que a conferência apontar, e a planta sai concluída para o CSV, o Redator e o MCP. Para mudar, edite: a edição vira a versão vigente.</p>
      </div>
      {atual && <span className={`rounded-full border px-3 py-1 text-sm ${corDoEstado(atual)}`} data-testid="radar-article-blueprint-state">v{atual.versionNumber} · {radarArticleBlueprintPanelStateLabel(atual, vaiAoCsvConferido, Boolean(atual && atual === vaiAoCsv && escolha.currentConfirmed && !escolha.deliveryConfirmed))}</span>}
    </div>

    {carregando && <p className="text-sm text-text-muted">Lendo o artigo-modelo…</p>}
    {organizandoPelaPagina && <p className="text-sm text-pending" role="status" data-testid="radar-article-blueprint-organizing">
      Organizando o artigo-modelo da SERP com a IA{job && job.position.total > 1 ? ` (${job.position.index} de ${job.position.total})` : ""}… a investigação já está finalizada.
    </p>}
    {falhaDaPagina && !ocupado && <p className="text-sm text-warning" role="status" data-testid="radar-article-blueprint-job-failed">A investigação está finalizada, mas a IA não organizou o artigo-modelo: {falhaDaPagina}</p>}
    {aviso && <p className={`text-sm ${aviso.ok ? "text-success" : "text-warning"}`} role="status">{aviso.texto}</p>}
    {!carregando && atual && !organizandoPelaPagina && <RadarArticleBlueprintRulesNotice payload={atual.payload} />}
    {/* 2026-10-02 · a versão mais nova de outro congelamento não é a que vai ao CSV: o painel diz qual vai. */}
    {!carregando && escolha.newestFromOtherFreeze && <p className="text-sm leading-6 text-warning" role="status" data-testid="radar-article-blueprint-other-freeze">
      A versão mais nova (v{escolha.newestFromOtherFreeze.versionNumber}) é de outro congelamento da investigação: ela não vai ao CSV nem ao Redator. {vaiAoCsv
        ? escolha.currentConfirmed
          ? `Aqui está a v${vaiAoCsv.versionNumber}, do pacote vigente: é ela que vai ao CSV.`
          : `Aqui está a v${vaiAoCsv.versionNumber}, do congelamento da organização mais recente: vai ao CSV se ele ainda for o vigente.`
        : "Nenhuma versão é do pacote vigente: organize de novo. Os CSVs, o envio ao Redator e o MCP exigem o artigo-modelo desta investigação."}
    </p>}
    {!carregando && escolha.newerDraft && vaiAoCsv && <div className={`${bloco} flex flex-wrap items-center justify-between gap-2`} data-testid="radar-article-blueprint-newer-draft">
      <p className="text-sm leading-6 text-pending">Há uma versão antiga em rascunho mais nova (v{escolha.newerDraft.versionNumber}). Os entregáveis seguem com a concluída (v{vaiAoCsv.versionNumber}); conclua o rascunho se ele for o certo.</p>
      <button type="button" className={botao} onClick={() => { setRevisarNova(!revisarNova); setEditando(false); }}>{revisarNova ? `Voltar à concluída (v${vaiAoCsv.versionNumber})` : `Ver o rascunho v${escolha.newerDraft.versionNumber}`}</button>
    </div>}
    {/* 2026-10-09 · só o rascunho antigo desta investigação: ele não vai às entregas; concluí-lo (sem IA) ou organizar de novo. */}
    {!carregando && escolha.newerDraft && !vaiAoCsv && !revisarNova && <div className={`${bloco} flex flex-wrap items-center justify-between gap-2`} data-testid="radar-article-blueprint-draft-only">
      <p className="text-sm leading-6 text-pending">Esta investigação tem só uma versão antiga em rascunho (v{escolha.newerDraft.versionNumber}). Os CSVs, o envio ao Redator e o MCP exigem a versão concluída: conclua o rascunho, se ele for o certo, ou organize de novo.</p>
      <button type="button" className={botao} onClick={() => { setRevisarNova(true); setEditando(false); }}>{`Ver o rascunho v${escolha.newerDraft.versionNumber}`}</button>
    </div>}
    {!carregando && !atual && !escolha.newerDraft && !organizandoPelaPagina && !falhaDaPagina && !semTabela && <p className="text-sm leading-6 text-text-muted" data-testid="radar-article-blueprint-empty">
      Ainda não há artigo-modelo organizado para esta investigação (por exemplo, ela foi finalizada antes desta etapa existir). Organize quando quiser: a IA trabalha sobre o pacote congelado.
    </p>}

    {!carregando && (confirmando
      ? <div className={bloco} data-testid="radar-article-blueprint-confirm">
        {/* 2026-10-09 · a confirmação cita a passada de correção: até 2 chamadas, a nova tentativa ou a correção, nunca as duas. */}
        <p className="text-sm leading-6 text-foreground">{radarArticleBlueprintCostConfirmation(1)}</p>
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className={botaoPrincipal} disabled={travado} onClick={() => void enviar("generate", { confirmPaid: true })}>{ocupado === "generate" ? "Organizando…" : "Confirmar e organizar"}</button>
          <button type="button" className={botao} disabled={travado} onClick={() => setConfirmando(false)}>Cancelar</button>
        </div>
      </div>
      : <div className="flex flex-wrap gap-2">
        <button type="button" className={atual ? botao : botaoPrincipal} disabled={travado || semTabela} onClick={() => setConfirmando(true)} data-testid="radar-article-blueprint-generate">{rotuloDeOrganizar}</button>
        {atual && !editando && <button type="button" className={botao} disabled={travado} onClick={abrirEdicao}>Editar</button>}
        {atual && atual.state === "DRAFT" && !editando && <button type="button" className={botaoPrincipal} disabled={travado} onClick={() => void enviar("approve", { blueprintId: atual.id })} data-testid="radar-article-blueprint-approve">{ocupado === "approve" ? "Concluindo…" : "Concluir esta versão"}</button>}
      </div>)}

    {atual && atual.validation.length > 0 && <div className={bloco}>
      <p className="text-sm font-semibold text-foreground">O servidor conferiu a resposta da IA contra o pacote:</p>
      <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-text-muted">{atual.validation.map(item => <li key={item}>{item}</li>)}</ul>
    </div>}

    {editando && rascunho && <div className={`${bloco} space-y-3`} data-testid="radar-article-blueprint-edit">
      <label className="block text-sm text-foreground">H1<input className={campo} value={rascunho.h1} onChange={evento => setRascunho({ ...rascunho, h1: evento.target.value })} /></label>
      <label className="block text-sm text-foreground">SEO title<input className={campo} value={rascunho.seoTitle} onChange={evento => setRascunho({ ...rascunho, seoTitle: evento.target.value })} /></label>
      <label className="block text-sm text-foreground">Meta description<textarea className={campo} rows={2} value={rascunho.metaDescription} onChange={evento => setRascunho({ ...rascunho, metaDescription: evento.target.value })} /></label>
      <label className="block text-sm text-foreground">Promessa<textarea className={campo} rows={2} value={rascunho.promise} onChange={evento => setRascunho({ ...rascunho, promise: evento.target.value })} /></label>
      <label className="block text-sm text-foreground">Pergunta da abertura<input className={campo} value={rascunho.openingQuestion} onChange={evento => setRascunho({ ...rascunho, openingQuestion: evento.target.value })} /></label>
      {rascunho.secoes.map((secao, indice) => <fieldset key={indice} className="rounded-md border border-divider p-3">
        <legend className="px-1 text-sm font-semibold text-foreground">Seção {indice + 1}</legend>
        <label className="flex items-center gap-2 text-sm text-text-muted"><input type="checkbox" checked={secao.remove} onChange={evento => setRascunho({ ...rascunho, secoes: rascunho.secoes.map((item, i) => i === indice ? { ...item, remove: evento.target.checked } : item) })} />Remover esta seção</label>
        {!secao.remove && <>
          <label className="mt-2 block text-sm text-foreground">H2<input className={campo} value={secao.h2} onChange={evento => setRascunho({ ...rascunho, secoes: rascunho.secoes.map((item, i) => i === indice ? { ...item, h2: evento.target.value } : item) })} /></label>
          <label className="mt-2 block text-sm text-foreground">Pergunta do leitor<input className={campo} value={secao.readerQuestion} onChange={evento => setRascunho({ ...rascunho, secoes: rascunho.secoes.map((item, i) => i === indice ? { ...item, readerQuestion: evento.target.value } : item) })} /></label>
          <label className="mt-2 block text-sm text-foreground">Abre respondendo<textarea className={campo} rows={2} value={secao.answerFirst} onChange={evento => setRascunho({ ...rascunho, secoes: rascunho.secoes.map((item, i) => i === indice ? { ...item, answerFirst: evento.target.value } : item) })} /></label>
        </>}
      </fieldset>)}
      <div className="flex flex-wrap gap-2">
        <button type="button" className={botaoPrincipal} disabled={travado} onClick={salvarEdicao}>{ocupado === "edit" ? "Salvando…" : "Salvar como nova versão"}</button>
        <button type="button" className={botao} disabled={travado} onClick={() => setEditando(false)}>Cancelar</button>
      </div>
    </div>}

    {atual && <p className="text-sm text-text-muted" data-testid="radar-article-blueprint-voice">{atual.payload.brandVoice
      ? `Voz da marca usada: Skill "${atual.payload.brandVoice.name}" v${atual.payload.brandVoice.version}.`
      : "Organizado sem Skill de voz na Marca."}{atual.payload.unit ? ` Tipo da unidade: ${atual.payload.unit.label}${atual.payload.unit.format ? ` · formato ${atual.payload.unit.format}` : ""}.` : ""}</p>}

    {atual && b && m && !editando && <div className="space-y-3" data-testid="radar-article-blueprint-view">
      {esqueleto.length > 0 && <details className={bloco} data-testid="radar-article-blueprint-skeleton">
        <summary className="cursor-pointer text-sm font-semibold text-foreground">Esqueleto da SERP · {esqueleto.length} seção(ões) que a IA organizou</summary>
        <ul className="mt-2 space-y-1 text-sm leading-6 text-text-muted">{esqueleto.map(item => <li key={item.id} className={item.level === 3 ? "pl-4" : undefined}>
          <span className="font-medium text-foreground">{item.id}</span> · H{item.level} · {item.heading}{marcasDoEsqueleto(item).length ? ` · ${marcasDoEsqueleto(item).join(" · ")}` : ""}
        </li>)}</ul>
      </details>}
      <div className={bloco}>
        <p className="text-sm font-semibold text-foreground">Medidas do plano × concorrentes comparáveis ({m.serp.comparablePages})</p>
        <dl className="mt-2 grid gap-2 sm:grid-cols-3 lg:grid-cols-4">
          {([
            ["Palavras", m.plan.wordsMin && m.plan.wordsMax ? `${m.plan.wordsMin}–${m.plan.wordsMax}` : "—", m.serp.words.median ?? "—"],
            ["H2", m.plan.sections, m.serp.h2 ?? "—"],
            ["H3", m.plan.h3, m.serp.h3 ?? "—"],
            ["Parágrafos", paragrafos ? `${paragrafos.min}–${paragrafos.max}` : m.plan.paragraphs, m.serp.paragraphs ?? "—"],
            ["Negritos", m.plan.bold, "—"],
            ["Imagens", `${m.plan.images} (capa + ${m.plan.respites})`, m.serp.images ?? "—"],
            ["Links internos", m.plan.internalLinks, "—"],
            ["Links externos", m.plan.externalLinks, "—"],
          ] as Array<[string, string | number, string | number]>).map(([rotulo, plano, serp]) => <div key={rotulo}>
            <dt className="text-sm text-text-muted">{rotulo}</dt>
            <dd className="text-sm font-medium text-foreground">{plano} <span className="font-normal text-text-muted">· SERP {serp}</span></dd>
          </div>)}
        </dl>
      </div>
      {mapaPublicado.length > 0 && <div className={bloco} data-testid="radar-article-blueprint-published-map">
        <p className="text-sm font-semibold text-foreground">Página publicada → planta ({mapaPublicado.length} H2 atuais)</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-text-muted">{mapaPublicado.map(item => <li key={item.current}>
          <span className="text-foreground">“{item.current}”</span> → {radarArticleBlueprintPublishedMapLine(item)}{item.origin === "match" && item.kind === "ABSORBED" ? " · casado pelo título" : ""}
        </li>)}</ul>
      </div>}
      <div className={bloco}>
        <p className="text-sm font-semibold text-foreground">H1: {b.title.h1}</p>
        <p className="mt-1 text-sm text-text-muted">SEO title: {b.title.seoTitle}</p>
        <p className="text-sm text-text-muted">Meta: {b.title.metaDescription}</p>
        <p className="mt-2 text-sm text-foreground">Leitor: {b.reader}</p>
        <p className="text-sm text-foreground">Promessa: {b.promise}</p>
        <p className="text-sm text-foreground">Ângulo: {b.angle.statement}</p>
        {/* 2026-10-02 · campo que veio vazio não deixa rótulo solto. */}
        {b.keywordPlan.reading && <p className="mt-2 text-sm text-foreground">Keywords: {b.keywordPlan.reading}</p>}
        <ul className="mt-1 list-disc pl-5 text-sm leading-6 text-text-muted">{b.keywordPlan.complementary.map(item => <li key={item.keyword}>{item.keyword}{item.placement ? ` → ${item.placement}` : ""}{item.reason ? ` (${item.reason})` : ""}</li>)}</ul>
        {b.keywordPlan.slugNote && <p className="mt-1 text-sm text-warning">Slug × principal: {b.keywordPlan.slugNote}</p>}
        <p className="mt-2 text-sm text-foreground">Abertura: responder “{b.opening.readerQuestion}”{b.opening.direction ? ` — ${b.opening.direction}` : ""}</p>
      </div>
      <ol className="space-y-2">{b.sections.map((secao, indice) => {
        const origem = origemDaSecao(atual.payload, [...(secao.from || []), ...secao.evidence]);
        const semOrigem = Array.isArray(secao.from) && !origem.length;
        return <li key={`${indice}-${secao.h2}`} className={bloco}>
          <p className="text-sm font-semibold text-foreground">H2 · {secao.h2}</p>
          {origem.length > 0 && <p className="mt-1 text-sm text-text-muted" data-testid="radar-article-blueprint-origin">Vem da SERP: {origem.join(" · ")}</p>}
          {semOrigem && <p className="mt-1 text-sm text-text-muted" data-testid="radar-article-blueprint-no-origin">Proposta editorial do artigo: não vem de uma seção da SERP.</p>}
          <p className="mt-1 text-sm text-text-muted">Pergunta: {secao.readerQuestion}</p>
          <p className="text-sm text-foreground">Abre respondendo: {secao.answerFirst}</p>
          {secao.h3.length > 0 && <ul className="mt-1 list-disc pl-5 text-sm text-text-muted">{secao.h3.map(h3 => <li key={h3}>H3 · {h3}</li>)}</ul>}
          <p className="mt-1 text-sm text-text-muted">~{paragrafos?.perSection[indice] ?? secao.paragraphs} parágrafo(s){secao.bold.length ? ` · negrito: ${secao.bold.join(", ")}` : ""}{secao.image ? ` · imagem ${secao.image}` : ""}{secao.specialist ? ` · especialista ${secao.specialist}` : ""}</p>
          {secao.internalLinks.map(link => <p key={`${link.candidate}-${link.anchor}`} className="text-sm text-foreground">Link interno: “{link.anchor}” → {candidato(link.candidate)?.label || link.candidate}{candidato(link.candidate)?.destination ? ` (${candidato(link.candidate)?.destination})` : ""}</p>)}
          {secao.externalLinks.map(link => <p key={link.claim} className="text-sm text-foreground">Link externo: {link.claim} → {link.source || `fonte a obter (${link.sourceType || "fonte oficial"})`}</p>)}
        </li>;
      })}</ol>
      {descartados.length > 0 && <div className={bloco} data-testid="radar-article-blueprint-discarded">
        <p className="text-sm font-semibold text-foreground">Descartado do esqueleto da SERP</p>
        <ul className="mt-1 list-disc space-y-1 pl-5 text-sm leading-6 text-text-muted">{descartados.map(item => <li key={item.id}>{origemDaSecao(atual.payload, [item.id])[0] || item.id}{item.reason ? ` — ${item.reason}` : ""}</li>)}</ul>
      </div>}
      <div className={bloco}>
        <p className="text-sm text-foreground">Fechamento: {b.closing.turn}{b.closing.specialist ? ` (voz do especialista ${b.closing.specialist})` : ""}</p>
        <p className="text-sm text-foreground">CTA: {b.closing.cta}</p>
        {/* 2026-10-09 (correção) · a leitura do piloto: o próximo passo que chama não aparece; o que só aponta a leitura seguinte é opcional. */}
        {radarArticleBlueprintContinuationOf(b.closing.nextStep) && <p className="text-sm text-text-muted">{RADAR_ARTICLE_BLUEPRINT_CONTINUATION_LABEL}: {radarArticleBlueprintContinuationOf(b.closing.nextStep)}</p>}
        {b.eeat.length > 0 && <p className="mt-1 text-sm text-text-muted">E-E-A-T: {b.eeat.join(" · ")}</p>}
      </div>
      <div className={bloco}>
        <p className="text-sm font-semibold text-foreground">Plano visual</p>
        <ul className="mt-1 space-y-2 text-sm leading-6 text-text-muted">{b.visual.map(item => <li key={item.slot}><strong className="text-foreground">{item.slot === "CAPA" ? "Capa" : `Respiro ${item.slot.slice(1)}`}</strong>{item.section ? ` · ${item.section}` : ""}{item.concept ? ` — ${item.concept}` : ""}<br />Prompt: {item.prompt}{item.alt || item.caption ? <><br />{[item.alt ? `ALT: ${item.alt}` : "", item.caption ? `Legenda: ${item.caption}` : ""].filter(Boolean).join(" · ")}</> : null}</li>)}</ul>
      </div>
    </div>}
  </section>;
}
