/**
 * O QUE O BOTÃO GRAVOU, DITO EM PORTUGUÊS SIMPLES (2026-09-28).
 *
 * O dono clicou "Reprocessar artigos" e leu SUCCESS com
 * "ARTICLES_PROCESSED = 21 · … · READY_TO_CONCLUDE = 21", mas a tabela
 * continuou igual: "não está dando pra entender nada. Mas fala que deu
 * sucesso; mas sucesso onde?". Os 21 eram publicados, que nunca passam por
 * "Concluir formação", e nada tinha sido gravado nos artigos.
 *
 * Aqui mora a frase de cada desfecho, com três perguntas respondidas sempre:
 * o que foi feito (e quanto custou), o que foi GRAVADO (só o confirmado na
 * releitura) e o que NÃO foi, com o próximo passo pelo nome do botão.
 *
 *   sucesso  só quando algo foi gravado e confirmado, sem pendência — e nunca
 *            no Processar: ele grava só o parecer da SERP, nenhum artigo muda
 *            (SUCCESS ali era lido como "o artigo mudou");
 *   info     nada foi gravado (análise, leitura do cache, prévia);
 *   aviso    ficou pendência ou falha.
 *
 * O readout técnico (`formatArticleRunReadout`, com os códigos do §4) continua
 * no domínio para os testes e a homologação; a notificação não o mostra mais.
 *
 * Domínio puro: sem React, sem rede.
 */
import type { ArticleRunRow } from "./process-observability.ts";

export type PlainTone = "success" | "info" | "warning";
export type PlainOutcome = { tone: PlainTone; message: string };

/** Os nomes dos botões que gravam, como a tela os mostra. */
export const REINFORCE_PUBLISHED_STEP = "Reforçar publicados";
/** Onde o botão mora, dito junto com o nome. */
export const REINFORCE_PUBLISHED_WHERE = 'tabela no painel "Mesmo assunto no Google", botão "Gravar reforços"';
export const CONCLUDE_FORMATION_STEP = "Concluir formação";

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

/**
 * Processar/Reprocessar artigos. `publishedRefs` são os candidatos que são
 * artigos publicados: para eles o próximo passo é "Reforçar publicados", nunca
 * "Concluir formação". `opinionsWritten` conta os pareceres da SERP gravados
 * NESTA execução e confirmados na releitura (0 quando tudo veio do cache).
 */
export function describeArticleRunPlain(input: {
  rows: readonly ArticleRunRow[];
  publishedRefs: ReadonlySet<string>;
  opinionsWritten: number;
}): PlainOutcome {
  const total = input.rows.length;
  if (!total) return { tone: "info", message: "Nenhum artigo selecionado foi analisado. Nada foi gravado." };
  const coletados = input.rows.filter(row => row.serpSource === "COLLECTED").length;
  const doCache = input.rows.filter(row => row.serpSource === "REUSED").length;
  const semSerp = input.rows.filter(row => row.serpSource === null).length;
  const publicados = input.rows.filter(row => input.publishedRefs.has(row.articleId)).length;
  const novosProntos = input.rows.filter(row => !input.publishedRefs.has(row.articleId) && row.readyToConclude).length;
  const novosBloqueados = input.rows.filter(row => !input.publishedRefs.has(row.articleId) && row.blocked).length;

  const partes: string[] = [];
  const artigos = plural(total, "artigo analisado", "artigos analisados");
  if (!coletados && !semSerp) partes.push(`${artigos} pelo cache, sem custo.`);
  else {
    const fontes = [
      coletados ? `${coletados} com SERP coletada agora (paga)` : "",
      doCache ? `${doCache} pelo cache (sem custo)` : "",
      semSerp ? `${semSerp} sem SERP vigente` : "",
    ].filter(Boolean);
    partes.push(`${artigos}: ${fontes.join(", ")}.`);
  }
  const gravados = Math.max(0, Math.floor(input.opinionsWritten));
  partes.push(gravados
    ? `Gravado: o parecer da SERP de ${plural(gravados, "artigo", "artigos")}, confirmado na releitura. As keywords dos artigos ainda não foram gravadas.`
    : "Nada foi gravado ainda.");
  const passos = [
    publicados ? `${publicados === 1 ? "o publicado" : `os ${publicados} publicados`}: "${REINFORCE_PUBLISHED_STEP}" (${REINFORCE_PUBLISHED_WHERE})` : "",
    novosProntos ? `${novosProntos === 1 ? "o artigo novo" : `os ${novosProntos} artigos novos`}: "${CONCLUDE_FORMATION_STEP}"` : "",
  ].filter(Boolean);
  if (passos.length) partes.push(`Para gravar ${passos.join("; ")}.`);
  if (novosBloqueados) partes.push(`${plural(novosBloqueados, "artigo novo ainda está bloqueado", "artigos novos ainda estão bloqueados")} para concluir (o motivo vem no aviso seguinte).`);
  const pendencia = semSerp > 0 || novosBloqueados > 0;
  // Só o parecer da SERP é gravado aqui; nenhum artigo muda: nunca SUCCESS.
  return { tone: pendencia ? "warning" : "info", message: partes.join(" ") };
}

/** "Analisando…": a execução ainda vai ler o cache ou pagar; nada foi gravado. */
export function describeArticleRunStartPlain(input: { candidates: number; withoutOpinion: number }): PlainOutcome {
  return {
    tone: "info",
    message: `${plural(input.candidates, "artigo selecionado", "artigos selecionados")}. Analisando a SERP de ${plural(input.withoutOpinion, "artigo sem parecer vigente", "artigos sem parecer vigente")} (cache primeiro). Nada foi gravado ainda.`,
  };
}

/**
 * O allintitle da Principal. `measured` foi medido agora e gravado (a rota
 * devolve a linha gravada); `reused` já estava medido nos últimos 30 dias e
 * nada novo foi gravado; sem volume não há KGR e nada é medido.
 */
export function describeAllintitlePlain(input: {
  measured: number;
  reused: number;
  withoutVolume: number;
  outsideWorkingCopy: number;
  failures: readonly string[];
}): PlainOutcome {
  const partes = [
    input.measured ? `${plural(input.measured, "Principal medida agora e gravada", "Principais medidas agora e gravadas")}` : "",
    input.reused ? `${plural(input.reused, "já estava medida", "já estavam medidas")} nos últimos 30 dias (sem custo)` : "",
    input.withoutVolume ? `${plural(input.withoutVolume, "Principal sem volume não foi medida", "Principais sem volume não foram medidas")} (sem volume não há KGR)` : "",
    input.outsideWorkingCopy ? `${input.outsideWorkingCopy} fora da cópia de trabalho` : "",
  ].filter(Boolean);
  const falhas = input.failures.length ? ` ${plural(input.failures.length, "falha", "falhas")}: ${input.failures.slice(0, 2).join("; ")}.` : "";
  const nada = input.measured ? "" : " Nada foi gravado.";
  return {
    tone: input.failures.length ? "warning" : input.measured ? "success" : "info",
    message: `Allintitle da Principal: ${partes.join("; ") || "nenhuma Principal para medir"}.${falhas}${nada}`,
  };
}
