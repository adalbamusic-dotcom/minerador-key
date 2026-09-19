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
 * tela mostra. Isso não é conveniência: é o que cumpre a regra de evidência.
 *
 * O enunciado proíbe incorporar automaticamente o texto integral de vídeos e
 * transcrições que o Radar não selecionou para este artigo. `RadarFoundations`
 * **só carrega conclusões agregadas** — contagens, padrões, lacunas, direções,
 * limitações. Não existe campo de transcrição nela. Então a regra é cumprida
 * por construção, e não por um filtro que alguém pode esquecer de aplicar.
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
import type { RadarFoundations } from "./radar-foundations.ts";
import type { WriterDeliverablePayload } from "./multiformat-contracts.ts";

/* ============================== a fonte ============================== */

export type SeedSource = {
  title: string;
  foundations: RadarFoundations;
  /** O artigo canônico, só quando finalizado. `null` quando ainda não é. */
  finalArticle: string | null;
};

/**
 * O texto do artigo, e só quando ele está **aprovado**.
 *
 * Um artigo em escrita é material instável: semear o roteiro com ele hoje e
 * refinalizá-lo amanhã deixaria o derivado citando uma versão que não existe
 * mais. Aprovado é o único estado em que o artigo é fonte narrativa.
 */
export function finalArticleText(document: ContentDocument | null | undefined): string | null {
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

/* ============================== o contexto ============================== */

const secao = (nome: string, itens: readonly string[]): string[] =>
  itens.length ? [`${nome}:`, ...itens.map(item => `- ${item}`)] : [];

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

  linhas.push(...secao("Recomendação editorial do Radar (recomendação, não obrigação)",
    f.recommendations.map(item => [item.label, item.objective, item.reason && `razão: ${item.reason}`]
      .filter(Boolean).join(" — "))));

  linhas.push(...secao("Camadas de pesquisa",
    f.research.map(camada => `${camada.label} (${camada.role === "PRIMARY" ? "primária" : "apoio"}): ${camada.queries} consulta(s), ${camada.items} item(ns) observado(s)`)));

  if (f.youtube) {
    linhas.push(`YouTube observado: ${f.youtube.comparableVideos} vídeo(s) comparáveis, ${f.youtube.longForm} long-form e ${f.youtube.shorts} shorts${f.youtube.durationRange ? ` · duração ${f.youtube.durationRange}` : ""}`);
    linhas.push(...secao("Padrões de título observados", f.youtube.titlePatterns));
    linhas.push(...secao("Lacunas que ninguém cobriu", f.youtube.gaps));
    if (f.youtube.format) linhas.push(`Formato vencedor: ${f.youtube.format}`);
    if (f.youtube.hookDirection) linhas.push(`Direção de gancho: ${f.youtube.hookDirection.statement}`);
    if (f.youtube.tone) linhas.push(`Tom: ${f.youtube.tone}`);
    if (f.youtube.languageDirection) linhas.push(`Linguagem: ${f.youtube.languageDirection}`);
    linhas.push(...secao("Estrutura sugerida pelo blueprint",
      f.youtube.script.map(parte => `${parte.block}: ${parte.direction}`)));
  }
  if (f.multimodal?.crossSerp.length) {
    linhas.push(`Cruzamento de SERPs: ${f.multimodal.crossSerp.map(item => `${item.signal} (${item.count})`).join(" · ")}`);
  }

  linhas.push(...secao("Precisa responder", f.mustAnswer));
  linhas.push(...secao("Precisa cobrir", f.mustCover));
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
  "Escreva em português do Brasil.",
].join("\n");

/**
 * ===== O ENVELOPE PRECISA SER DECLARADO NO PRÓPRIO PROMPT =====
 *
 * A camada compartilhada manda `response_format: { type: "json_object" }`, e a
 * API **recusa com HTTP 400** quando a palavra "json" não aparece em nenhuma
 * mensagem. Descobri isso com a rota respondendo 400 na primeira chamada real —
 * os testes não pegavam, porque o schema do Zod valida a RESPOSTA e nunca é
 * enviado ao provider. Declarar a forma aqui também é o que faz o modelo
 * devolver as chaves certas, em vez de um JSON plausível com nomes próprios.
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
  "Você monta a PRIMEIRA VERSÃO de um roteiro audiovisual a partir de uma investigação de conteúdo.",
  "O resultado é um rascunho para uma pessoa editar, não um roteiro final.",
  REGRAS_COMUNS,
  "Cada cena precisa ter função própria: abertura, desenvolvimento e fechamento se distinguem.",
  "`narration` é o que se fala. `onScreenText` é o que aparece escrito na tela — curto, não é a narração repetida.",
  "`visualDirection` descreve o que se vê. `technicalDirection` é observação de produção.",
  ENVELOPE_ROTEIRO,
].join("\n\n");

export const CAROUSEL_SEED_SYSTEM_PROMPT = [
  "Você monta a PRIMEIRA VERSÃO de um carrossel a partir de uma investigação de conteúdo.",
  "O resultado é um rascunho para uma pessoa editar, não um carrossel final.",
  REGRAS_COMUNS,
  "Carrossel não é roteiro fatiado: cada slide precisa se sustentar sozinho na rolagem.",
  "`heading` é curto e carrega a ideia. `body` cabe em poucas linhas lidas no celular.",
  ENVELOPE_CARROSSEL,
].join("\n\n");

const comContexto = (pedido: string, source: SeedSource) =>
  [pedido, "", "=== CONTEXTO ===", ...seedContextLines(source)].join("\n");

export const buildScriptSeedPrompt = (source: SeedSource) =>
  comContexto("Monte o roteiro inicial com 4 a 8 cenas.", source);

export const buildCarouselSeedPrompt = (source: SeedSource) =>
  comContexto("Monte o carrossel inicial com 5 a 8 slides.", source);

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
