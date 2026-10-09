/**
 * ===== SEMEAR ROTEIRO E CARROSSEL A PARTIR DOS FUNDAMENTOS DO RADAR =====
 *
 * ==================== O QUE ESTE MÓDULO NÃO FAZ ====================
 *
 * Não chama IA, não toca em rede, não conhece Supabase. Ele constrói o contexto
 * e os prompts, e traduz a resposta do modelo para os contratos que já existem.
 * A chamada em si mora na rota, no caminho canônico (`resolveDeepSeekCanonical
 * Config` + `generateStructuredAI`) que o `/api/redator/section` já usa.
 *
 * ==================== A FONTE É A PROJEÇÃO, NÃO O BUNDLE ====================
 *
 * O contexto é montado a partir de `RadarFoundations` — a mesma projeção que a
 * tela mostra — e do PLANO DO VÍDEO. Isso não é conveniência: é o que cumpre a
 * regra de evidência.
 *
 * O enunciado proíbe incorporar automaticamente o texto integral de vídeos e
 * transcrições que o Radar não selecionou para este artigo. `RadarFoundations`
 * e o plano **só carregam conclusões agregadas** — contagens, a decisão de
 * formato, os capítulos da planta, os cortes, as limitações. Não existe campo
 * de transcrição neles.
 *
 * ==================== 2026-10-09 · O PROCESSO DO PILOTO (regra do dono) ====================
 *
 * "Tudo que é de processos antigos tem que ser substituído pelos novos
 * processos dos pilotos." O roteiro, os cortes e o carrossel do Redator saíam
 * do blueprint antigo do YouTube (formato vencedor, direção de gancho, tom,
 * linguagem e a "estrutura sugerida", o roteiro genérico da amostra inteira) e
 * de "4 a 8 cenas" / "5 a 8 slides" fixos. Agora saem do MESMO plano que monta
 * o CSV de vídeo (`radarVideoPlan`, lib/radar/portable-video-export.ts): a
 * planta APPROVED pela leitura compartilhada, a trava por sentido, a amostra
 * pertinente, a decisão única de formato, os capítulos da planta e os cortes
 * pela utilidade. As contagens seguem a régua do CSV de vídeo:
 *
 *   - roteiro longo: a abertura pelo gancho, um capítulo por seção da planta e
 *     o fechamento com o CTA (capítulos + 2 cenas);
 *   - formato curto: a série de vídeos curtos são os cortes da planta (uma cena
 *     por corte escolhido pela utilidade);
 *   - carrossel: a capa, uma lâmina por capítulo e a lâmina do CTA
 *     (capítulos + 2 lâminas), como "Carrossel … N lâminas" do CSV.
 *
 * Sem o artigo-modelo concluído não há plano, e a semeadura não roda: a rota
 * responde o estado explícito (`needs_article_blueprint`) e a tela aponta o
 * Radar. Nenhuma estrutura de outro lugar.
 *
 * ==================== DOIS FORMATOS, DUAS GERAÇÕES ====================
 *
 * Roteiro e carrossel têm prompts próprios e chamadas próprias. Converter cena
 * em slide mecanicamente produziria um carrossel com a cadência de um vídeo —
 * e o enunciado proíbe exatamente isso.
 *
 * ==================== A RECOMENDAÇÃO NÃO É PORTÃO ====================
 *
 * `editorialOutput = ARTICLE` entra no contexto como recomendação declarada do
 * Radar, para o modelo saber de onde veio o material. Nada aqui lê esse campo
 * para decidir se pode gerar.
 */

import type { ContentDocument } from "../arquiteto/contracts.ts";
import { z } from "zod";
import { novaCena } from "./script-scenes.ts";
import { radarFoundationsSubjectOf, type RadarFoundations } from "./radar-foundations.ts";
import { radarBrandVoiceDeliverableLabel } from "../radar/brand-voice.ts";
import type { RadarVideoPlan } from "../radar/portable-video-export.ts";
import { WRITER_BLUEPRINT_CONTINUATION_LABEL } from "./writer-evidence-catalog.ts";
import type { WriterDeliverablePayload } from "./multiformat-contracts.ts";

/* ============================== a fonte ============================== */

/**
 * 2026-10-09 · O plano do vídeo que a semeadura recebe: o MESMO do CSV de vídeo
 * (`radarVideoPlan`), lido no servidor sobre a planta APPROVED do pacote.
 */
export type SeedVideoPlan = RadarVideoPlan;

export type SeedSource = {
  title: string;
  foundations: RadarFoundations;
  /** O artigo canônico, só quando finalizado. `null` quando ainda não é. */
  finalArticle: string | null;
  /** 2026-10-09 · O plano do vídeo pela leitura do CSV de vídeo. Obrigatório: sem ele, não há semeadura. */
  plan: SeedVideoPlan;
};

/**
 * O texto do artigo, e só quando ele está **aprovado**.
 *
 * Um artigo em escrita é material instável: semear o roteiro com ele hoje e
 * refinalizá-lo amanhã deixaria o derivado citando uma versão que não existe
 * mais. Aprovado é o único estado em que o artigo é fonte narrativa.
 */
export function finalArticleText(document: Pick<ContentDocument, "status" | "blocks"> | null | undefined): string | null {
  if (!document || document.status !== "aprovado") return null;
  const linhas: string[] = [];
  for (const bloco of document.blocks) {
    if (bloco.type === "heading" && bloco.text.trim()) linhas.push(`## ${bloco.text.trim()}`);
    else if (bloco.type === "paragraph" && bloco.text.trim()) linhas.push(bloco.text.trim());
    else if (bloco.type === "list") linhas.push(...bloco.items.filter(item => item.trim()).map(item => `- ${item.trim()}`));
    else if (bloco.type === "quote" && bloco.text.trim()) linhas.push(`> ${bloco.text.trim()}`);
  }
  const texto = linhas.join("\n").trim();
  return texto ? texto : null;
}

/* ============================== a recusa ============================== */

/**
 * 2026-10-09 · QUANDO A SEMEADURA NÃO RODA, PELO PLANO (a mesma régua do CSV de
 * vídeo): o formato curto sem nenhum capítulo que funcione sozinho não tem
 * roteiro curto a semear; o plano sem capítulo da planta não tem roteiro nem
 * carrossel. A frase é concluída (D10) e diz o motivo de cada capítulo.
 * `null` = semeia.
 */
export function seedPlanRefusal(plan: SeedVideoPlan, kind: "video_script" | "carousel"): string | null {
  if (!plan.capitulos.length) return "O artigo-modelo concluído deste pacote não tem seções que virem capítulos: não há roteiro nem carrossel a semear por ele.";
  if (kind === "video_script" && plan.formato.curto && !plan.cortes.length) {
    const motivos = plan.semCorte.map(item => `capítulo ${item.capitulo}: ${item.motivo}`).join("; ");
    return `O formato decidido é curto (${plan.formato.motivo}), e nenhum capítulo do artigo-modelo funciona sozinho como vídeo curto${motivos ? ` (${motivos})` : ""}: não há roteiro curto a semear.`;
  }
  return null;
}

/* ============================== o contexto ============================== */

const secao = (nome: string, itens: readonly string[]): string[] =>
  itens.length ? [`${nome}:`, ...itens.map(item => `- ${item}`)] : [];

/** O cabeçalho das linhas do Assunto no contexto da semeadura (F4.2). */
export const SEED_SUBJECT_SECTION_TITLE =
  "Assunto (tronco) e virada — faça a virada da principal para o Assunto onde o artigo-modelo indica; não troque nem remova o Assunto";
/** Linhas do envio sem a do tronco: entram, mas não se apresentam como Assunto. */
export const SEED_EDITORIAL_CONTEXT_SECTION_TITLE = "Contexto editorial do envio do Radar";

/** O cabeçalho da voz da marca no contexto da semeadura (2026-10-02). */
export const SEED_BRAND_VOICE_SECTION_TITLE = "Voz da marca (copy e CTA)";
/** O cabeçalho do artigo-modelo aprovado no contexto da semeadura (2026-10-02; 2026-10-09: a planta inteira, não só o fechamento). */
export const SEED_BLUEPRINT_SECTION_TITLE = "Artigo-modelo da SERP concluído no Radar (a referência do roteiro e do carrossel)";

/** 2026-10-08 · O cabeçalho das frases do artigo-modelo que só entram com fonte (régua por frase do Radar). */
export const SEED_BLUEPRINT_NEEDS_SOURCE_TITLE =
  "Frases do artigo-modelo que só entram com fonte (sem fonte neste contexto, delimite como orientação ou possibilidade, ou deixe fora; o motivo não vai ao texto)";

/** 2026-10-09 · O cabeçalho do plano do vídeo (o mesmo do CSV de vídeo). */
export const SEED_VIDEO_PLAN_SECTION_TITLE = "Plano do vídeo pelo artigo-modelo (o mesmo do CSV de vídeo)";
/** 2026-10-09 · O cabeçalho do que a trava tirou do texto publicável (cena, lâmina, legenda e CTA). */
export const SEED_OUT_OF_PUBLISHABLE_TITLE =
  "Fica fora do texto publicável (sem fonte do pacote não entra em cena falada como fato, lâmina, legenda nem CTA; na fala, só delimitada)";

/* Os campos do topo da planta que a semeadura repete: só as frases deles entram na lista (as outras não estão no contexto). */
const CAMPOS_DA_SEMENTE: ReadonlySet<string> = new Set(["title.h1", "promise", "closing.cta", "closing.nextStep"]);

/* As linhas duram ~minutos: mm:ss. */
const duracao = (segundos: number) => {
  const total = Math.max(0, Math.round(segundos));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
};
const faixaDe = (faixa: { min: number; max: number } | null) => (faixa ? `${duracao(faixa.min)} a ${duracao(faixa.max)}` : null);

/**
 * A voz da marca e o artigo-modelo. A voz entra só nos trechos que servem à
 * copy: CTA e transição comercial; voz e vocabulário.
 *
 * 2026-10-08 · D10 no rótulo da voz: o rótulo é o de entregável do Radar
 * (`radarBrandVoiceDeliverableLabel`): a ativa é dita "ativa"; qualquer outra,
 * "versão corrente na Marca".
 *
 * 2026-10-09 · Do artigo-modelo entra a planta inteira que o derivado segue —
 * H1, promessa, leitor, as seções (pergunta do leitor e resposta que abre) e o
 * fechamento —, e não mais só o fechamento: os capítulos, as cenas e as
 * lâminas são as seções dela. O CTA é a única chamada; o próximo passo que
 * sobra na leitura é a leitura seguinte, opcional.
 */
function linhasDaVozEDoArtigoModelo(f: RadarFoundations): string[] {
  const linhas: string[] = [];
  const voz = f.brandVoice;
  if (voz) {
    /* O rótulo só interpola a versão: sem número, "v?", como antes. */
    linhas.push(`${SEED_BRAND_VOICE_SECTION_TITLE}: ${radarBrandVoiceDeliverableLabel({ name: voz.name, version: (voz.version ?? "?") as number, status: voz.status })}`);
    if (voz.cta) linhas.push("CTA e transição comercial, como a marca escreveu:", voz.cta);
    if (voz.voice) linhas.push("Voz, tom e vocabulário, como a marca escreveu:", voz.voice);
  }
  const planta = f.articleBlueprint;
  if (planta) {
    linhas.push(`${SEED_BLUEPRINT_SECTION_TITLE}: v${planta.version ?? "?"}`);
    if (planta.h1) linhas.push(`- H1: ${planta.h1}`);
    if (planta.promise) linhas.push(`- Promessa: ${planta.promise}`);
    if (planta.reader) linhas.push(`- Leitor: ${planta.reader}`);
    planta.sections.forEach((parte, indice) => {
      linhas.push(`- Seção ${indice + 1}: ${parte.h2}${parte.readerQuestion ? ` — pergunta do leitor: ${parte.readerQuestion}` : ""}${parte.answerFirst ? ` — resposta que abre: ${parte.answerFirst}` : ""}`);
    });
    if (planta.closing?.cta) linhas.push(`- CTA (a única chamada): ${planta.closing.cta}`);
    if (planta.closing?.nextStep) linhas.push(`- ${WRITER_BLUEPRINT_CONTINUATION_LABEL}: ${planta.closing.nextStep}`);
    /*
     * Só as frases que ESTE contexto repete: o H1, a promessa, o CTA e a leitura
     * seguinte; e, por seção, a resposta que abre. As frases da explicação e da
     * prática já passaram pela trava do plano do vídeo ("Fica fora do texto
     * publicável" e "Na fala, só delimitada").
     */
    linhas.push(...secao(SEED_BLUEPRINT_NEEDS_SOURCE_TITLE, [
      ...(planta.needsSource ?? []).filter(item => CAMPOS_DA_SEMENTE.has(item.field)).map(item => `"${item.sentence}" — ${item.label}`),
      ...planta.sections.flatMap((parte, indice) => (parte.needsSource ?? []).filter(item => item.field === "answerFirst").map(item => `Seção ${indice + 1}: "${item.sentence}" — ${item.label}`)),
    ]));
  }
  return linhas;
}

/**
 * 2026-10-09 · O PLANO DO VÍDEO, linha por linha (o mesmo do CSV de vídeo): o
 * formato decidido pela amostra pertinente e o motivo, a faixa da coorte, o
 * gancho, a premissa, os capítulos da planta, os cortes pela utilidade (no
 * formato curto, a série) e o que a trava tirou do texto publicável.
 */
function linhasDoPlano(plano: SeedVideoPlan): string[] {
  const amostra = plano.amostra;
  const formato = plano.formato.curto ? "formato curto (série de vídeos curtos, recorte da planta)" : "vídeo longo pelo artigo-modelo";
  const linhas = [
    `${SEED_VIDEO_PLAN_SECTION_TITLE}:`,
    `- Formato do vídeo: ${formato} — ${plano.formato.motivo}.`,
    ...(faixaDe(plano.formato.faixa) ? [`- Duração de referência (P25–P75 da coorte pertinente do formato decidido, não é meta): ${faixaDe(plano.formato.faixa)}`] : []),
    ...(amostra ? [`- Amostra pertinente do YouTube: ${amostra.longos.coorte.videoCount} vídeo(s) longo(s) e ${amostra.curtos.coorte.videoCount} Short(s) do mesmo público, de público vizinho ou do tema geral; ${amostra.foraDaConta.FORA + amostra.foraDaConta.OUTRO} fora da conta (outro assunto)`] : []),
    `- Gancho: ${plano.gancho}`,
    ...(plano.premissa ? [`- Premissa: ${plano.premissa}`] : []),
    `- Capítulos (as seções do artigo-modelo, na ordem): ${plano.capitulos.length}`,
    ...plano.capitulos.flatMap(capitulo => [
      `  ${capitulo.numero}. ${capitulo.titulo}${capitulo.pergunta ? ` — pergunta do público: ${capitulo.pergunta}` : ""}`,
      ...(capitulo.entregar ? [`     Entregar: ${capitulo.entregar}`] : []),
      ...capitulo.explicar.map(item => `     Explicar: ${item}`),
      ...(capitulo.mostrar ? [`     Mostrar: ${capitulo.mostrar}`] : []),
      ...(capitulo.antesDeAfirmar ? [`     Antes de afirmar: ${capitulo.antesDeAfirmar}`] : []),
      ...capitulo.falaDelimitada.map(item => `     Na fala, só delimitada: ${item}`),
    ]),
    ...(plano.cortes.length
      ? [
        plano.formato.curto ? `- Série de vídeos curtos (os capítulos que funcionam sozinhos, pela utilidade): ${plano.cortes.length}` : `- Cortes (até 3, pela utilidade): ${plano.cortes.length}`,
        ...plano.cortes.map(corte => `  Corte ${corte.numero} (capítulo ${corte.capitulo}, ${corte.titulo}): gancho "${corte.gancho}"; ideia: ${corte.ideia}; mostrar: ${corte.mostrar}${corte.fonte ? `; fonte: ${corte.fonte}` : ""}`),
      ]
      : ["- Cortes: nenhum capítulo funciona sozinho como vídeo curto nesta planta."]),
    ...(plano.semCorte.length ? [`- Sem corte: ${plano.semCorte.map(item => `capítulo ${item.capitulo} (${item.motivo})`).join("; ")}`] : []),
    ...secao(SEED_OUT_OF_PUBLISHABLE_TITLE, plano.foraDoPublicavel.map(item => `${item.onde}: "${item.frase}" — ${item.motivo}`)),
  ];
  return linhas;
}

/**
 * O contexto de produção, em linhas. Texto e não JSON de propósito: o modelo lê
 * melhor, e o que sai daqui aparece inteiro no log quando alguém precisar
 * entender de onde uma cena veio.
 */
export function seedContextLines(source: SeedSource): string[] {
  const f = source.foundations;
  const linhas: string[] = [
    `Tema: ${source.title}`,
    `Investigação: ${f.profileLabel}${f.observedAt ? ` · congelada em ${f.observedAt}` : ""}`,
  ];

  if (f.keyword.principal) linhas.push(`Keyword principal: ${f.keyword.principal}`);
  if (f.keyword.secondary.length) linhas.push(`Keywords secundárias: ${f.keyword.secondary.join(" · ")}`);
  if (f.keyword.reinforcements.length) linhas.push(`Reforços narrativos: ${f.keyword.reinforcements.join(" · ")}`);

  /*
   * SDD do Assunto, F4.2 · as linhas do envio, pela MESMA projeção que o
   * painel mostra (2026-10-09: com a virada lida da planta, no servidor).
   * Roteiro e carrossel também fazem a virada da principal para o Assunto.
   * Sem Assunto, a projeção não traz a chave e o contexto sai como era.
   */
  const linhasDoEnvio = f.editorialContext ?? [];
  linhas.push(...secao(radarFoundationsSubjectOf(f) ? SEED_SUBJECT_SECTION_TITLE : SEED_EDITORIAL_CONTEXT_SECTION_TITLE, linhasDoEnvio));

  /*
   * 2026-10-09 (correção) · A "Recomendação editorial do Radar" SAIU DO PROMPT.
   * Ela vinha de `bundle.editorialOutputs` — a saída do multiformato (SHORTS ×
   * vídeo longo pela amostra inteira) e a do blueprint competitivo —, e caía ao
   * lado do "Formato do vídeo" do plano: duas decisões de formato no mesmo
   * pedido, às vezes contrárias. O formato é o do plano (`radarVideoFormatDecision`);
   * o legado fica só como matéria-prima do gerador do artigo-modelo.
   */
  linhas.push(...secao("Camadas de pesquisa",
    f.research.map(camada => `${camada.label} (${camada.role === "PRIMARY" ? "primária" : "apoio"}): ${camada.queries} consulta(s), ${camada.items} item(ns) observado(s)`)));

  if (f.multimodal?.crossSerp.length) {
    linhas.push(`Cruzamento de SERPs: ${f.multimodal.crossSerp.map(item => `${item.signal} (${item.count})`).join(" · ")}`);
  }
  if (f.review) {
    linhas.push(...secao(`Review (Amazon congelada${f.review.intent ? `, ${f.review.intent}` : ""})`, [
      `${f.review.products} produto(s) observado(s)${f.review.output ? ` · saída comercial: ${f.review.output}` : ""}`,
      ...(f.review.comparisonAxes.length ? [`Critérios de comparação: ${f.review.comparisonAxes.join(" · ")}`] : []),
      ...f.review.priceBands,
      "Só os produtos da shortlist congelada entram como produto; preço e nota são da coleta, sem prometer preço atual nem tratar nota como prova de qualidade.",
    ]));
  }

  /*
   * 2026-10-02 · SDD diretriz editorial, Adendos A e C · a voz da marca e o
   * artigo-modelo aprovado, lidos ao vivo pela semeadura. 2026-10-09 · a planta
   * inteira e o plano do vídeo (o mesmo do CSV de vídeo) são a referência.
   */
  linhas.push(...linhasDaVozEDoArtigoModelo(f));
  linhas.push(...linhasDoPlano(source.plan));

  /*
   * 2026-10-09 (correção) · "Precisa responder" e "Precisa cobrir" SAÍRAM. Eram
   * as perguntas e os conceitos do blueprint competitivo antigo, só sem ruído —
   * sem o "Não cobrir" do pacote e do Silo e sem as exclusões do reajuste do
   * ArticleDNA, que o CSV aplica: a pergunta de um assunto excluído chegava ao
   * roteiro como exigência. As perguntas do público já vêm nos capítulos do
   * plano (as seções do artigo-modelo, com as exclusões aplicadas).
   */
  if (f.evidence.sources.length) linhas.push(`Fontes de evidência: ${f.evidence.sources.join(" · ")}`);
  if (f.evidence.observedPages !== null) linhas.push(`Páginas comparáveis observadas: ${f.evidence.observedPages}`);
  linhas.push(...secao("Limitações declaradas da investigação", f.limitations));
  linhas.push(...secao("O Redator NÃO pode", f.writerMayNot));

  if (source.finalArticle) {
    linhas.push("", "Artigo canônico já finalizado (fonte narrativa adicional):", source.finalArticle);
  }

  return linhas;
}

/* ============================== os prompts ============================== */

const REGRAS_COMUNS = [
  "Use exclusivamente o contexto abaixo. Não invente dado, número, estudo, marca ou citação que não esteja ali.",
  "As conclusões do Radar são agregadas. Não atribua fala a nenhum vídeo, canal ou página específicos.",
  "Respeite integralmente a lista 'O Redator NÃO pode'.",
  "As limitações declaradas são reais: não afirme com certeza o que a investigação não sustenta.",
  "Não gere nem sugira FAQ ou bloco de perguntas frequentes (AGENTS.md §13): perguntas observadas orientam a cobertura.",
  /*
   * 2026-10-09 · O ARTIGO-MODELO É A REFERÊNCIA (regra do piloto): as cenas e
   * as lâminas seguem os capítulos do plano do vídeo, que são as seções da
   * planta; o CTA é o da planta, a única chamada.
   */
  "O artigo-modelo da SERP e o plano do vídeo são a referência: as cenas e as lâminas seguem os capítulos do plano (as seções do artigo-modelo), na ordem; o closingCta é o CTA do artigo-modelo, a única chamada; a leitura seguinte, quando houver, nunca vira segunda chamada.",
  /*
   * 2026-10-02 · SDD diretriz editorial, Adendos A e C: a voz da marca vale
   * "inclusive nos CTAs".
   */
  "Quando o contexto trouxer 'Voz da marca (copy e CTA)', escreva gancho, texto, legenda e closingCta nessa voz, sem o que ela proíbe. A voz e o artigo-modelo não mudam keyword, intenção nem fatos.",
  /* 2026-10-08 · a régua por frase do Radar; 2026-10-09 · e a trava do CSV de vídeo. */
  "Frase listada em 'Frases do artigo-modelo que só entram com fonte' ou em 'Fica fora do texto publicável' não vira afirmação no gancho, nas cenas, nos slides, na legenda nem no closingCta: na fala, só delimitada (orientação ou possibilidade); em texto na tela, lâmina e legenda, fica fora.",
  /* 2026-10-09 · D10: o entregável sai concluído (a regra diz a família, sem ensinar as palavras). */
  "O texto sai concluído: sem marca de trabalho por fazer (item em aberto, espera de aprovação, versão provisória, fonte que ainda falta, campo a completar ou pedido a outra área); o que não se sustenta fica fora, e o motivo vai em notes.",
  "Escreva em português do Brasil.",
].join("\n");

/**
 * ===== O ENVELOPE PRECISA SER DECLARADO NO PRÓPRIO PROMPT =====
 *
 * A camada compartilhada manda `response_format: { type: "json_object" }`, e a
 * API **recusa com HTTP 400** quando a palavra "json" não aparece em nenhuma
 * mensagem. Declarar a forma aqui também é o que faz o modelo devolver as
 * chaves certas, em vez de um JSON plausível com nomes próprios.
 */
const ENVELOPE_ROTEIRO = [
  "Devolva JSON com as chaves:",
  "objective, audience, channel, openingHook, closingCta (strings),",
  "notes (lista de strings),",
  "scenes (lista de objetos com: title, durationSeconds inteiro em segundos, narration, onScreenText, visualDirection, technicalDirection).",
  "Não inclua nenhuma outra chave.",
].join(" ");

const ENVELOPE_CARROSSEL = [
  "Devolva JSON com as chaves:",
  "objective, audience, channel, caption, closingCta (strings),",
  "notes (lista de strings),",
  "slides (lista de objetos com: heading, body).",
  "Não inclua nenhuma outra chave.",
].join(" ");

export const SCRIPT_SEED_SYSTEM_PROMPT = [
  "Você monta a PRIMEIRA VERSÃO de um roteiro audiovisual a partir de uma investigação de conteúdo e do artigo-modelo da SERP.",
  "O resultado é uma primeira versão para uma pessoa editar, não um roteiro final.",
  REGRAS_COMUNS,
  "Cada cena tem função própria: a abertura pelo gancho do plano, uma cena por capítulo (ou por corte, no formato curto) e o fechamento com o CTA.",
  "`narration` é o que se fala. `onScreenText` é o que aparece escrito na tela — curto, não é a narração repetida.",
  "`visualDirection` descreve o que se vê (o 'Mostrar' do capítulo ou do corte). `technicalDirection` é observação de produção.",
  ENVELOPE_ROTEIRO,
].join("\n\n");

export const CAROUSEL_SEED_SYSTEM_PROMPT = [
  "Você monta a PRIMEIRA VERSÃO de um carrossel a partir de uma investigação de conteúdo e do artigo-modelo da SERP.",
  "O resultado é uma primeira versão para uma pessoa editar, não um carrossel final.",
  REGRAS_COMUNS,
  "Carrossel não é roteiro fatiado: cada slide precisa se sustentar sozinho na rolagem, com uma mensagem só.",
  "`heading` é curto e carrega a ideia. `body` cabe em poucas linhas lidas no celular.",
  ENVELOPE_CARROSSEL,
].join("\n\n");

const comContexto = (pedido: string, source: SeedSource) =>
  [pedido, "", "=== CONTEXTO ===", ...seedContextLines(source)].join("\n");

/**
 * 2026-10-09 · QUANTAS CENAS E QUANTAS LÂMINAS: a régua do CSV de vídeo, não um
 * número fixo. Roteiro longo: a abertura, um capítulo por seção da planta e o
 * fechamento. Formato curto: uma cena por corte (a série). Carrossel: a capa,
 * uma lâmina por capítulo e a do CTA.
 */
export function seedPartsCount(plan: SeedVideoPlan, kind: "video_script" | "carousel"): number {
  if (kind === "carousel") return plan.capitulos.length + 2;
  return plan.formato.curto ? plan.cortes.length : plan.capitulos.length + 2;
}

export const buildScriptSeedPrompt = (source: SeedSource) => {
  const plano = source.plan;
  const cenas = seedPartsCount(plano, "video_script");
  return comContexto(plano.formato.curto
    ? `Monte o roteiro da série de vídeos curtos com ${cenas} cena(s): uma por corte do plano do vídeo, na ordem dos cortes, cada uma com o gancho no primeiro segundo, a ideia única, o que mostrar e um CTA para o artigo.`
    : `Monte o roteiro com ${cenas} cenas: a abertura pelo gancho do plano, uma cena por capítulo do plano do vídeo (${plano.capitulos.length}), na ordem dos capítulos, e o fechamento com o CTA do artigo-modelo.`, source);
};

export const buildCarouselSeedPrompt = (source: SeedSource) => {
  const plano = source.plan;
  return comContexto(`Monte o carrossel com ${seedPartsCount(plano, "carousel")} slides: a capa (o H1 do artigo-modelo, como chamada para o público), um slide por capítulo do plano do vídeo (${plano.capitulos.length}), na ordem, e o slide final com o CTA para o artigo, sem prometer resultado.`, source);
};

/* ====================== o que o modelo pode devolver ====================== */

/*
 * Os schemas abaixo são deliberadamente um subconjunto dos contratos de
 * entregável: só os campos que fazem sentido uma máquina propor. `id`, `order`,
 * `storyboard`, `sourceRefs` e `sourceDocumentHash` são identidade e
 * proveniência — quem decide é o servidor, não o modelo.
 */

const ProviderSceneSchema = z.object({
  title: z.string().trim().max(300).default(""),
  durationSeconds: z.number().int().min(0).max(3600).default(0),
  narration: z.string().trim().max(12000).default(""),
  onScreenText: z.string().trim().max(3000).default(""),
  visualDirection: z.string().trim().max(6000).default(""),
  technicalDirection: z.string().trim().max(6000).default(""),
}).strict();

export const ProviderScriptSeedSchema = z.object({
  objective: z.string().trim().max(4000).default(""),
  audience: z.string().trim().max(2000).default(""),
  channel: z.string().trim().max(300).default(""),
  openingHook: z.string().trim().max(3000).default(""),
  closingCta: z.string().trim().max(3000).default(""),
  notes: z.array(z.string().trim().max(2000)).max(50).default([]),
  scenes: z.array(ProviderSceneSchema).min(1).max(20),
}).strict();

const ProviderSlideSchema = z.object({
  heading: z.string().trim().max(500).default(""),
  body: z.string().trim().max(3000).default(""),
}).strict();

export const ProviderCarouselSeedSchema = z.object({
  objective: z.string().trim().max(4000).default(""),
  audience: z.string().trim().max(2000).default(""),
  channel: z.string().trim().max(300).default(""),
  caption: z.string().trim().max(12000).default(""),
  closingCta: z.string().trim().max(3000).default(""),
  notes: z.array(z.string().trim().max(2000)).max(50).default([]),
  slides: z.array(ProviderSlideSchema).min(1).max(20),
}).strict();

export type ProviderScriptSeed = z.infer<typeof ProviderScriptSeedSchema>;
export type ProviderCarouselSeed = z.infer<typeof ProviderCarouselSeedSchema>;

/* ====================== a tradução para o contrato ====================== */

type BaseScript = Extract<WriterDeliverablePayload, { kind: "video_script" }>;
type BaseCarousel = Extract<WriterDeliverablePayload, { kind: "carousel" }>;

/**
 * O id da cena é gerado por fora, como em todo o resto do módulo de cenas: ele é
 * a âncora da mídia, e sortear aqui faria o teste depender de aleatoriedade para
 * provar unicidade.
 */
export type GeradorDeId = () => string;

export function scriptPayloadFromSeed(input: {
  base: BaseScript; seed: ProviderScriptSeed; novoId: GeradorDeId;
}): BaseScript {
  /* `novaCena` dá a forma completa — inclusive `storyboard: null` e `sourceRefs: []`. */
  const scenes = input.seed.scenes.map((cena, indice) => ({
    ...novaCena(input.novoId(), indice),
    title: cena.title,
    durationSeconds: cena.durationSeconds,
    narration: cena.narration,
    onScreenText: cena.onScreenText,
    visualDirection: cena.visualDirection,
    technicalDirection: cena.technicalDirection,
  }));
  return {
    ...input.base,
    objective: input.seed.objective || input.base.objective,
    audience: input.seed.audience || input.base.audience,
    channel: input.seed.channel || input.base.channel,
    openingHook: input.seed.openingHook,
    closingCta: input.seed.closingCta,
    notes: input.seed.notes,
    /* A duração total é a soma das cenas: dois números que discordam viram bug de leitura. */
    durationSeconds: scenes.reduce((total, cena) => total + cena.durationSeconds, 0),
    scenes,
  };
}

export function carouselPayloadFromSeed(input: {
  base: BaseCarousel; seed: ProviderCarouselSeed; novoId: GeradorDeId;
}): BaseCarousel {
  return {
    ...input.base,
    objective: input.seed.objective || input.base.objective,
    audience: input.seed.audience || input.base.audience,
    channel: input.seed.channel || input.base.channel,
    caption: input.seed.caption,
    closingCta: input.seed.closingCta,
    notes: input.seed.notes,
    slides: input.seed.slides.map((slide, indice) => ({
      id: input.novoId(), order: indice,
      heading: slide.heading, body: slide.body,
      visual: null, sourceRefs: [],
    })),
  };
}

/**
 * Já existe trabalho neste entregável?
 *
 * Semear por cima do que a pessoa escreveu seria destruir trabalho. O botão de
 * semear só aparece quando não há conteúdo útil — e "útil" é: tem parte, ou tem
 * algum campo de texto preenchido.
 */
export function deliverableHasWork(payload: WriterDeliverablePayload | null | undefined): boolean {
  if (!payload) return false;
  const partes = payload.kind === "video_script" ? payload.scenes.length : payload.slides.length;
  if (partes > 0) return true;
  const textos = payload.kind === "video_script"
    ? [payload.openingHook, payload.closingCta, payload.objective, payload.audience]
    : [payload.caption, payload.closingCta, payload.objective, payload.audience];
  return textos.some(texto => texto.trim().length > 0);
}
