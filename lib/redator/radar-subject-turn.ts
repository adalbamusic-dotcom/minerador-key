import { radarSubjectCtaDirection } from "../radar/declared-subject.ts";
import { radarEditorialHeadingWithoutTemplate, type RadarEditorialSubjectTurn } from "../radar/editorial-article-model.ts";
import { radarSemanticStems } from "../radar/semantic-concept-model.ts";

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
  /**
   * 2026-10-08 (correção) · Aditivo: o título com que cada seção do modelo sai
   * no CSV "Para escrever" (a pergunta do leitor utilizável ou o cabeçalho sem
   * molde — `radarWritingSectionTitleResolver`). O envio o passa; sem ele (ou
   * quando ele não conhece a seção), o cabeçalho sem molde, como antes.
   */
  sectionTitle?: ((cabecalho: string) => string | null) | null;
}): string[] {
  const assunto = radarWriterSubjectOf(input.subject);
  if (!assunto) return [];
  /* A sugestão só vale para o MESMO Assunto: uma virada de outra frase seria de outro artigo. */
  const turn = input.turn && texto(input.turn.phrase) && normalizar(input.turn.phrase) === normalizar(assunto.phrase)
    ? input.turn
    : null;
  const principal = texto(input.principal);

  const posicao = turn?.suggestedPosition ?? null;
  /*
   * 2026-10-08 · P0-B (rodada dos 8 CSVs) · a seção nomeada sem o molde do
   * modelo ("Como X no dia a dia?", "O que considerar sobre X?", "Afinal, X?"),
   * pela mesma régua do CSV "Para escrever" — a linha continua igual à dele.
   */
  const semMolde = (cabecalho: string | null) => (cabecalho ? input.sectionTitle?.(cabecalho) || radarEditorialHeadingWithoutTemplate(cabecalho) || cabecalho : cabecalho);
  const secao = turn?.turnSection
    ? { ...turn.turnSection, heading: semMolde(turn.turnSection.heading) as string, hostHeading: semMolde(turn.turnSection.hostHeading) }
    : null;
  const contagem = secao ? `${secao.pages} de ${secao.sampleSize} página(s)` : "";
  const onde = secao?.source === "OBSERVED_GROUP"
    ? secao.placement === "COVERAGE_POINT" && secao.hostHeading
      ? `em ${entreAspas(secao.hostHeading)}, como ponto a cobrir (a amostra trata o Assunto em ${contagem})`
      : `na seção ${entreAspas(secao.heading)} (a amostra já trata o Assunto em ${contagem})`
    : posicao
      ? `depois de ${entreAspas(semMolde(posicao.afterHeading) as string)}`
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

/* ============================== 2026-10-09 · a virada pela planta ============================== */

/*
 * ===== 2026-10-09 · A VIRADA SAI DO ARTIGO-MODELO, NÃO DO MODELO EDITORIAL ANTIGO =====
 *
 * Regra do dono (2026-10-09): o processo do piloto substitui o antigo, e o
 * legado só sobrevive como matéria-prima do gerador. A "Virada", a "Seção da
 * virada" e a "Direção do H1" do Redator saíam da sugestão do modelo editorial
 * antigo (`articleModel.declaredSubject`), a mesma que o CSV "Para escrever"
 * deixou de escrever: ela agora vai ao PEDIDO do artigo-modelo, e a planta
 * concluída decide onde o Assunto entra. Aqui as linhas leem a PLANTA:
 *
 *   - a seção da planta que trata do Assunto (as raízes dele, fora as da
 *     principal, no H2, na pergunta do leitor, nos H3 e na resposta que abre)
 *     é onde virar; um H3 que o traz diz o H3;
 *   - sem seção que o trate, a virada fica no fechamento da planta, antes do CTA;
 *   - o H1 é o da planta: diz se ele já traz o Assunto; senão, o H1 é da
 *     principal e o Assunto entra na seção da virada;
 *   - o tronco e o destino continuam do ArticleDNA, como antes; não há "Alerta
 *     do Radar" (era leitura da amostra, não da planta).
 *
 * Os prefixos são os mesmos (`RADAR_WRITER_SUBJECT_LINE_PREFIXES`): o painel e
 * a semeadura leem as linhas como sempre. Sem Assunto: lista vazia. Sem a
 * planta em mãos (quem envia ainda não a passa): a virada aponta a seção do
 * artigo-modelo que tratar do Assunto, sem lugar inventado — e quem lê depois,
 * com a planta, troca a linha pela dela (`radarWriterEditorialContextWithBlueprint`).
 */
type SecaoDaPlantaComAssunto = { indice: number; h2: string; h3: string | null };

const registroDe = (valor: unknown): Record<string, unknown> | null =>
  (valor && typeof valor === "object" && !Array.isArray(valor) ? valor as Record<string, unknown> : null);
const textosDe = (valor: unknown): string[] => (Array.isArray(valor) ? valor : []).map(texto).filter((item): item is string => Boolean(item));

/* Mesma raiz quando uma começa pela outra (a mesma régua de pending-claims). */
const mesmaRaiz = (a: string, b: string) => a === b || (Math.min(a.length, b.length) >= 5 && (a.startsWith(b) || b.startsWith(a)));

/** As raízes que distinguem o Assunto: as dele, fora as da principal (sem nenhuma, todas as dele). */
function raizesDoAssunto(frase: string, principal: string | null): string[] {
  const todas = radarSemanticStems(frase).filter(raiz => raiz.length >= 3);
  const daPrincipal = radarSemanticStems(principal ?? "");
  const proprias = todas.filter(raiz => !daPrincipal.some(outra => mesmaRaiz(raiz, outra)));
  return proprias.length ? proprias : todas;
}

const tocaOAssunto = (textoLido: string, raizes: readonly string[]): number => {
  const doTexto = radarSemanticStems(textoLido);
  return raizes.filter(raiz => doTexto.some(outra => mesmaRaiz(raiz, outra))).length;
};

function secaoDaPlantaComAssunto(planta: Record<string, unknown> | null, raizes: readonly string[]): SecaoDaPlantaComAssunto | null {
  if (!planta || !raizes.length) return null;
  const minimo = Math.max(1, Math.ceil(raizes.length / 2));
  const secoes = (Array.isArray(planta.sections) ? planta.sections : []).map(registroDe).filter((item): item is Record<string, unknown> => Boolean(item && texto(item.h2)));
  let melhorNota = 0;
  let achada: SecaoDaPlantaComAssunto | null = null;
  for (const [indice, secao] of secoes.entries()) {
    const h2 = texto(secao.h2) as string;
    const nota = tocaOAssunto([h2, texto(secao.readerQuestion), ...textosDe(secao.h3), texto(secao.answerFirst)].filter(Boolean).join(" "), raizes);
    /* A primeira seção com a maior nota: empate fica com a que vem antes no artigo. */
    if (nota < minimo || nota <= melhorNota) continue;
    const noTitulo = tocaOAssunto([h2, texto(secao.readerQuestion)].filter(Boolean).join(" "), raizes) >= minimo;
    const h3 = noTitulo ? null : textosDe(secao.h3).find(item => tocaOAssunto(item, raizes) >= minimo) ?? null;
    melhorNota = nota;
    achada = { indice: indice + 1, h2, h3 };
  }
  return achada;
}

export function radarWriterSubjectTurnLinesFromBlueprint(input: {
  subject: unknown;
  /** O `blueprint` do artigo-modelo concluído (já lido); null = o pacote não tem planta concluída. */
  blueprint: unknown;
  principal: string | null | undefined;
}): string[] {
  const assunto = radarWriterSubjectOf(input.subject);
  if (!assunto) return [];
  const principal = texto(input.principal);
  const planta = registroDe(input.blueprint);
  const raizes = raizesDoAssunto(assunto.phrase, principal);
  const secao = secaoDaPlantaComAssunto(planta, raizes);
  const daPrincipal = principal ? `de ${principal}` : "da keyword principal";
  const destino = assunto.destinationUrl ? `; destino: ${assunto.destinationUrl}` : "";
  const onde = !planta
    ? "na seção do artigo-modelo concluído que tratar do Assunto (ou no fechamento, antes do CTA, se nenhuma tratar)"
    : secao
      ? secao.h3
        ? `no H3 ${entreAspas(secao.h3)} da seção ${entreAspas(secao.h2)} do artigo-modelo (seção ${secao.indice})`
        : `na seção ${entreAspas(secao.h2)} do artigo-modelo (seção ${secao.indice})`
      : "no fechamento do artigo-modelo, antes do CTA (a planta não dá seção própria ao Assunto)";

  const linhas = [
    comPontoFinal(`Tronco (Assunto): ${assunto.phrase}${assunto.note ? ` — ${semPontoFinal(assunto.note)}` : ""}`),
    `Virada: ${onde}, levar o leitor ${daPrincipal} a ${assunto.phrase}${destino}.`,
  ];
  if (secao) {
    linhas.push(secao.h3
      ? `Seção da virada: ${entreAspas(secao.h2)}, seção ${secao.indice} do artigo-modelo concluído, no H3 ${entreAspas(secao.h3)}.`
      : `Seção da virada: ${entreAspas(secao.h2)}, seção ${secao.indice} do artigo-modelo concluído.`);
  }

  const h1 = texto(registroDe(planta?.title)?.h1);
  if (h1 && raizes.length && tocaOAssunto(h1, raizes) >= Math.max(1, Math.ceil(raizes.length / 2))) {
    linhas.push(`Direção do H1: o H1 do artigo-modelo (${entreAspas(h1)}) já traz o Assunto.`);
  } else if (secao) {
    linhas.push(`Assunto em H2/H3 — o H1 é da principal${h1 ? `, como o do artigo-modelo (${entreAspas(h1)})` : ""}.`);
  } else {
    linhas.push(`Assunto no H1: o H1 é da principal${h1 ? `, como o do artigo-modelo (${entreAspas(h1)})` : ""}.`);
  }

  if (assunto.destinationUrl) {
    /* O destino do ArticleDNA fixado, o mesmo que o guardião confere. */
    linhas.push(`Destino da chamada: ${comPontoFinal(radarSubjectCtaDirection(assunto.destinationUrl))}`);
  }
  return linhas;
}

/** A linha é do Assunto (tronco, virada, seção, H1, destino ou alerta)? As outras linhas do envio (diferenciação…) ficam. */
const ehLinhaDoAssunto = (linha: string): boolean => {
  const P = RADAR_WRITER_SUBJECT_LINE_PREFIXES;
  return [P.trunk, P.turn, P.section, P.destination, P.alert, ...P.h1].some(prefixo => linha.startsWith(prefixo));
};

/**
 * 2026-10-09 · AS LINHAS DO ENVIO COM A VIRADA PELA PLANTA. Documento enviado
 * antes desta regra gravou a virada do modelo antigo; quem lê (fundamentos,
 * pacote da seção, semeadura, painel) troca as linhas do Assunto pelas da
 * planta e mantém as outras (a nota de diferenciação, por exemplo), na ordem.
 * Sem Assunto (do ArticleDNA fixado), as linhas voltam como estão.
 */
export function radarWriterEditorialContextWithBlueprint(
  linhas: readonly string[],
  input: { subject: unknown; blueprint: unknown; principal: string | null | undefined },
): string[] {
  const novas = radarWriterSubjectTurnLinesFromBlueprint(input);
  if (!novas.length) return [...linhas];
  return [...novas, ...linhas.filter(linha => !ehLinhaDoAssunto(linha))];
}
