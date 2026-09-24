import { radarSubjectCtaDirection } from "../radar/declared-subject.ts";
import type { RadarEditorialSubjectTurn } from "../radar/editorial-article-model.ts";

/**
 * ===== A VIRADA PARA O ASSUNTO, ENTREGUE AO REDATOR — SDD do Assunto, F4.1 =====
 *
 * O dono pediu que o Assunto chegue ao Redator "já definido, validado,
 * reforçado e com todo o contexto", e que o artigo faça a virada para ele.
 * O tronco (frase, nota, destino) já chega pela projeção do ArticleDNA nos
 * fundamentos. Faltava ONDE virar e a DIREÇÃO DO H1 — a sugestão que o Radar
 * calculou no artigo-modelo (F3.1, `articleModel.declaredSubject`).
 *
 * ==================== POR QUE LINHAS, E NÃO O DOSSIÊ ====================
 *
 * O artigo-modelo NÃO está no dossiê: o `RadarEvidenceBundle` V3 leva a
 * fotografia observada (`observed`) e o blueprint competitivo, mas nem o
 * artigo-modelo nem as seções do blueprint editorial congelado
 * (`finalizedBundle.blueprint.sections`, onde mora a seção sintética da
 * virada). Derivar na leitura daria no máximo o sinal do H1, a partir de
 * `observed.declaredSubject`; a seção que carrega a virada e a posição
 * sugerida dependem das seções do artigo-modelo, que o Redator não recebe.
 *
 * E o bundle tem schema `.strict()` e hash: acrescentar o artigo-modelo nele
 * mudaria o contrato congelado e o rollback. Por isso a via é a menos
 * invasiva: no envio, LINHAS CURTAS em `importedContext.editorialContext`
 * (campo que já existe e ia vazio). O dossiê continua lido, nunca copiado
 * (invariante 78): as linhas vêm do artigo-modelo, que está FORA do dossiê.
 *
 * ==================== O MESMO TEXTO DO CSV ====================
 *
 * "Virada" e "Direção do H1" dizem exatamente o que o CSV "Para escrever"
 * diz (`lib/radar/portable-writing-export.ts`, F4.3): quem escreve pelo CSV e
 * quem escreve pelo MCP lê a mesma sugestão. Um teste compara as duas.
 * O destino vai como foi declarado (o CSV limpa parâmetros de campanha por
 * higiene de planilha; aqui o destino é o que o guardião confere).
 *
 * Sem Assunto: lista vazia, e o documento fica byte a byte como era.
 *
 * Domínio puro: sem fetch, sem storage, sem provider.
 */

export type RadarWriterSubject = { phrase: string; note: string | null; destinationUrl: string | null };

const texto = (valor: unknown): string | null =>
  typeof valor === "string" && valor.trim() ? valor.replace(/\s+/g, " ").trim() : null;

/** O Assunto do ArticleDNA (ou de qualquer leitura dele), reduzido ao que a escrita usa. */
export function radarWriterSubjectOf(valor: unknown): RadarWriterSubject | null {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return null;
  const bruto = valor as Record<string, unknown>;
  const phrase = texto(bruto.phrase);
  if (!phrase) return null;
  return { phrase, note: texto(bruto.note), destinationUrl: texto(bruto.destinationUrl) };
}

/* Os mesmos acabamentos do CSV, para a frase sair igual nos dois lugares. */
const semPontoFinal = (valor: string): string => valor.trim().replace(/[.;:\s]+$/, "");
const comPontoFinal = (valor: string): string => {
  const corpo = valor.trim();
  return !corpo || /[.!?…:]$/.test(corpo) ? corpo : `${corpo}.`;
};
const entreAspas = (valor: string) => `"${semPontoFinal(valor).replace(/^["“]|["”]$/g, "")}"`;
const normalizar = (valor: string) =>
  valor.toLowerCase().normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[^a-z0-9\s]/g, " ").replace(/\s+/g, " ").trim();

/** Sem sinal na SERP, a linha do H1 devolve a decisão a quem redige (igual ao CSV). */
export const RADAR_WRITER_SUBJECT_H1_NO_SIGNAL = "Assunto no H1: sem sinal na SERP, quem redige decide. O H1 é da principal.";

/** O prefixo de cada linha: é por ele que teste e leitor reconhecem a linha. */
export const RADAR_WRITER_SUBJECT_LINE_PREFIXES = Object.freeze({
  trunk: "Tronco (Assunto): ",
  turn: "Virada: ",
  section: "Seção da virada: ",
  h1: ["Direção do H1: ", "Assunto em H2/H3", "Assunto no H1: "],
  destination: "Destino da chamada: ",
  alert: "Alerta do Radar sobre o Assunto: ",
});

const LUGAR_DA_SECAO: Record<RadarEditorialSubjectTurn["turnSection"]["placement"], (host: string | null) => string> = {
  H2: () => "como H2",
  H3: host => (host ? `como H3 em ${entreAspas(host)}` : "como H3"),
  COVERAGE_POINT: host => (host ? `como ponto a cobrir em ${entreAspas(host)}` : "como ponto a cobrir"),
  ALONE: () => "como a única seção exigida (a amostra não deu seção para hospedá-la)",
};

/**
 * AS LINHAS DA VIRADA, na ordem em que quem escreve precisa delas: o tronco,
 * onde virar, a seção que o Radar exigiu, a direção do H1, o destino da
 * chamada e o alerta. `turn` é a sugestão do Radar; sem ela (artigo sem
 * fotografia do Google, ou virada de outro Assunto), as linhas dizem que a
 * decisão é de quem redige — nunca inventam lugar.
 */
export function radarWriterSubjectTurnLines(input: {
  subject: unknown;
  turn?: RadarEditorialSubjectTurn | null;
  principal: string | null | undefined;
}): string[] {
  const assunto = radarWriterSubjectOf(input.subject);
  if (!assunto) return [];
  /* A sugestão só vale para o MESMO Assunto: uma virada de outra frase seria de outro artigo. */
  const turn = input.turn && texto(input.turn.phrase) && normalizar(input.turn.phrase) === normalizar(assunto.phrase)
    ? input.turn
    : null;
  const principal = texto(input.principal);

  const posicao = turn?.suggestedPosition ?? null;
  const secao = turn?.turnSection ?? null;
  const contagem = secao ? `${secao.pages} de ${secao.sampleSize} página(s)` : "";
  const onde = secao?.source === "OBSERVED_GROUP"
    ? secao.placement === "COVERAGE_POINT" && secao.hostHeading
      ? `em ${entreAspas(secao.hostHeading)}, como ponto a cobrir (a amostra trata o Assunto em ${contagem})`
      : `na seção ${entreAspas(secao.heading)} (a amostra já trata o Assunto em ${contagem})`
    : posicao
      ? `depois de ${entreAspas(posicao.afterHeading)}`
      : secao?.placement === "COVERAGE_POINT" && secao.hostHeading
        ? `como ponto a cobrir em ${entreAspas(secao.hostHeading)} (lugar deixado pelo Radar sem sinal na SERP; quem redige pode mudar)`
        : "onde quem redige decidir (sem sinal na SERP)";

  const linhas = [
    comPontoFinal(`Tronco (Assunto): ${assunto.phrase}${assunto.note ? ` — ${semPontoFinal(assunto.note)}` : ""}`),
    `Virada: ${onde}, levar o leitor ${principal ? `de ${principal}` : "da keyword principal"} a ${assunto.phrase}${assunto.destinationUrl ? `; destino: ${assunto.destinationUrl}` : ""}.`,
  ];

  if (secao) {
    linhas.push(secao.source === "OBSERVED_GROUP"
      ? `Seção da virada: ${entreAspas(secao.heading)}, ${LUGAR_DA_SECAO[secao.placement](secao.hostHeading)}: é o bloco da amostra que já trata o Assunto (${contagem}).`
      : `Seção da virada: ${entreAspas(secao.heading)}, ${LUGAR_DA_SECAO[secao.placement](secao.hostHeading)}: exigida pelo ArticleDNA sem página na amostra; o título é de trabalho do Radar, reescreva para o leitor.`);
  }

  const complemento = turn?.h1Complement ?? null;
  if (complemento?.suggested) {
    linhas.push(`Direção do H1: ${principal || "keyword principal"} + complemento "${semPontoFinal(complemento.complement || assunto.phrase)}" (sugestão do Radar; a decisão é de quem redige).`);
  } else if ((complemento?.headingPages ?? 0) > 0) {
    linhas.push("Assunto em H2/H3 — o H1 é da principal.");
  } else {
    linhas.push(RADAR_WRITER_SUBJECT_H1_NO_SIGNAL);
  }

  if (assunto.destinationUrl) {
    /* O destino do ArticleDNA fixado, o mesmo que o guardião confere. */
    linhas.push(`Destino da chamada: ${comPontoFinal(radarSubjectCtaDirection(assunto.destinationUrl))}`);
  }
  const alerta = texto(turn?.alert);
  if (alerta) linhas.push(`Alerta do Radar sobre o Assunto: ${alerta}`);
  return linhas;
}
