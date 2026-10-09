import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

import { ARTIGO, contextoDePesquisa, entradaGoogle, vistaDoGoogleSobre } from "./radar-portable-writing-fixtures.mts";
import { plantaDe } from "./radar-piloto-planta-fixtures-2026-10-09.mts";
import { planoCurto, planoDeVideo } from "./redator-piloto-plano-fixtures-2026-10-09.mts";
import { buildRadarVideoExportArticle, radarVideoPlan } from "../lib/radar/portable-video-export.ts";
import type { RadarArticleResearchContext } from "../lib/radar/article-research-context.ts";
import type { RadarEditorialArticleModel } from "../lib/radar/editorial-article-model.ts";
import type { RadarArticleBlueprintPayload } from "../lib/radar/article-blueprint.ts";
import { radarFoundationsOfDossier } from "../lib/redator/radar-foundations.ts";
import {
  CAROUSEL_SEED_SYSTEM_PROMPT,
  SCRIPT_SEED_SYSTEM_PROMPT,
  SEED_OUT_OF_PUBLISHABLE_TITLE,
  SEED_VIDEO_PLAN_SECTION_TITLE,
  buildCarouselSeedPrompt,
  buildScriptSeedPrompt,
  seedContextLines,
  seedPartsCount,
  seedPlanRefusal,
} from "../lib/redator/deliverable-seed.ts";
import { writerSeedPlanOf, type WriterSeedPorts } from "../lib/server/writer-seed.ts";

/*
 * ===== 2026-10-09 · O ROTEIRO, OS CORTES E O CARROSSEL DO REDATOR PELO PILOTO =====
 *
 * Regra do dono (2026-10-09): "tudo que é de processos antigos tem que ser
 * substituído pelos novos processos dos pilotos". A semeadura de roteiro e
 * carrossel do Redator lia o blueprint antigo do YouTube (formato vencedor,
 * gancho, tom, linguagem, "estrutura sugerida") e pedia um número fixo de cenas
 * e de slides. Agora ela lê o MESMO plano que o CSV de vídeo monta
 * (`radarVideoPlan`), pela MESMA montagem do export, sobre a planta concluída:
 *
 *   1. o plano da semeadura é byte a byte o da função do CSV de vídeo;
 *   2. capítulos = seções da planta; cenas e lâminas pela régua do CSV
 *      (o CSV diz as mesmas contagens na linha);
 *   3. sem planta concluída (ou com rascunho, ou de outro congelamento): estado
 *      explícito ANTES de qualquer IA, nunca estrutura de outro lugar;
 *   4. formato curto: a série são os cortes; sem corte, recusa concluída;
 *   5. com Assunto, a virada da semeadura sai da planta lida;
 *   6. nada de número fixo nem de rótulo legado; o pedido sai concluído (D10).
 *
 * PROVIDER_CALLS = 0: a rede é recusada abaixo; a montagem é injetada.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

const semComentarios = (caminho: string) => readFileSync(new URL(caminho, import.meta.url), "utf8")
  .replace(/\r\n/g, "\n").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");

const CONGELADO = "2026-10-01T10:00:00.000Z";
const DNA = "dna-v1";
const BUNDLE = "bundle-hash-1";

type Planta = RadarArticleBlueprintPayload;

/** A montagem do export de bancada: a entrada do Google e a planta concluída que a leitura do CSV entregaria. */
function portasCom(entrada: ReturnType<typeof entradaGoogle>, planta: Planta | null, opcoes: { congeladoEm?: string; dna?: string } = {}): WriterSeedPorts {
  return {
    assemble: async () => ({
      exportedAt: "2026-10-09T12:00:00.000Z",
      montadas: [{ articleId: ARTIGO, entrada, lentes: [], youtube: null, bundleHash: BUNDLE, blueprint: planta, lentesCongeladas: null }],
      identificacao: [], recusados: [], publicacoes: new Map(), lentes: [], plano: null, planoDaSelecao: null,
      brandVoice: { kind: "none" },
      congelamentos: new Map([[ARTIGO, {
        frozenAt: opcoes.congeladoEm ?? CONGELADO, frozenBundleId: null, frozenBundleHash: null,
        articleDnaVersionId: opcoes.dna ?? DNA, articleDnaContentHash: null, articleDnaFrom: null, articleDnaUntil: null,
      }]]),
    }) as never,
    blueprintMeta: async () => (planta ? { id: "planta-1", versionNumber: 2, approvedAt: "2026-10-02T11:00:00+00:00" } : null),
  };
}

const pedidoDoDocumento = (editorialContext: readonly string[] = []) => ({
  brandId: "marca-1", actorUserId: "ator-1", articleId: ARTIGO,
  bundleObservedAt: CONGELADO, articleDnaVersionId: DNA,
  keywords: { principal: "skincare facial", secondary: [] },
  editorialContext,
});

const fundamentos = () => radarFoundationsOfDossier({
  researchProfile: "GOOGLE", bundleId: "bundle-1", bundleHash: BUNDLE,
  keywordContext: { principal: "skincare facial", secondary: [], narrativeReinforcements: [], resolution: "ARTICLE_DNA_HYDRATION" },
  writerMayNot: ["trocar a keyword principal"],
  bundle: { observedAt: CONGELADO, research: { google: { role: "PRIMARY", counts: { queries: 4, items: 40 }, frozenAt: CONGELADO, limitations: [] } }, limitations: ["amostra de 10 páginas"] },
})!;

const pronto = (lido: Awaited<ReturnType<typeof writerSeedPlanOf>>) => {
  assert.equal(lido.plano.kind, "ready", JSON.stringify(lido.plano));
  return (lido.plano as Extract<typeof lido.plano, { kind: "ready" }>).plan;
};

/* ============================ o plano é o do CSV ============================ */

test("roteiro · o plano da semeadura é o da função do CSV de vídeo (`radarVideoPlan`), pela montagem do export, e os capítulos são as seções da planta", async () => {
  const entrada = entradaGoogle();
  const planta = plantaDe(entrada, { articleId: ARTIGO });
  const lido = await writerSeedPlanOf(pedidoDoDocumento(), portasCom(entrada, planta));
  const plano = pronto(lido);
  assert.deepEqual(plano, radarVideoPlan(entrada, { youtube: null, brandVoiceActive: false, brandVoice: { kind: "none" } as never, blueprint: planta, lentesCongeladas: null, lensDigests: null }));
  assert.deepEqual(plano.capitulos.map(capitulo => capitulo.titulo), planta.blueprint.sections.map(secao => secao.h2), "um capítulo por seção da planta, na ordem");
  /* A projeção da MESMA planta vai junto (a semeadura e o painel a leem). */
  assert.equal(lido.articleBlueprint?.h1, planta.blueprint.title.h1);
  assert.deepEqual(lido.articleBlueprint?.sections.map(secao => secao.h2), planta.blueprint.sections.map(secao => secao.h2));
  assert.deepEqual(lido.editorialContext, [], "sem Assunto, nenhuma linha");
});

test("roteiro · cenas e lâminas pela régua do CSV: a linha do CSV de vídeo diz as MESMAS contagens que o pedido da semeadura", async () => {
  const entrada = entradaGoogle();
  const planta = plantaDe(entrada, { articleId: ARTIGO });
  const plano = pronto(await writerSeedPlanOf(pedidoDoDocumento(), portasCom(entrada, planta)));
  const n = plano.capitulos.length;
  assert.equal(plano.formato.curto, false, "sem amostra pertinente do YouTube, o vídeo segue o artigo-modelo em formato longo");

  const linha = buildRadarVideoExportArticle(entrada, { position: 1, youtube: null, blueprint: planta }).row;
  assert.ok(linha.diretrizes_de_roteiro.includes(`Capítulos do vídeo principal (${n}, da planta do artigo-modelo da SERP`), linha.diretrizes_de_roteiro);
  assert.ok(linha.cortes_para_redes.includes(`Carrossel (Instagram e LinkedIn), ${seedPartsCount(plano, "carousel")} lâminas`), linha.cortes_para_redes);

  const fonte = { title: "Skincare facial", foundations: fundamentos(), finalArticle: null, plan: plano };
  const roteiro = buildScriptSeedPrompt(fonte);
  assert.ok(roteiro.startsWith(`Monte o roteiro com ${n + 2} cenas: a abertura pelo gancho do plano, uma cena por capítulo do plano do vídeo (${n}), na ordem dos capítulos, e o fechamento com o CTA do artigo-modelo.`), roteiro.split("\n")[0]);
  const carrossel = buildCarouselSeedPrompt(fonte);
  assert.ok(carrossel.startsWith(`Monte o carrossel com ${n + 2} slides: a capa (o H1 do artigo-modelo, como chamada para o público), um slide por capítulo do plano do vídeo (${n}), na ordem`), carrossel.split("\n")[0]);

  /* O contexto diz o plano inteiro: formato e motivo, gancho, premissa, os capítulos e por que nenhum vira corte. */
  const linhas = seedContextLines(fonte);
  assert.ok(linhas.includes(`${SEED_VIDEO_PLAN_SECTION_TITLE}:`));
  assert.ok(linhas.includes(`- Formato do vídeo: vídeo longo pelo artigo-modelo — ${plano.formato.motivo}.`), linhas.join("\n"));
  assert.ok(linhas.includes(`- Gancho: ${plano.gancho}`));
  for (const capitulo of plano.capitulos) assert.ok(linhas.some(item => item.startsWith(`  ${capitulo.numero}. ${capitulo.titulo}`)), capitulo.titulo);
  assert.ok(linhas.includes("- Cortes: nenhum capítulo funciona sozinho como vídeo curto nesta planta."));
  assert.ok(linhas.some(item => item.startsWith("- Sem corte: capítulo 1 (sem demonstração definida na planta)")), linhas.join("\n"));
});

/* ============================ sem planta concluída ============================ */

test("roteiro · sem planta concluída (ausente ou rascunho) ou de outro congelamento, o estado é explícito e nenhuma estrutura vem de outro lugar", async () => {
  const entrada = entradaGoogle();
  const planta = plantaDe(entrada, { articleId: ARTIGO });

  const semPlanta = await writerSeedPlanOf(pedidoDoDocumento(), portasCom(entrada, null));
  assert.equal(semPlanta.plano.kind, "needs_article_blueprint");
  assert.equal(semPlanta.articleBlueprint, null);
  assert.match((semPlanta.plano as { reason: string }).reason, /organize-o no Radar \(Pesquisa → Artigo-modelo da SERP; até 2 chamadas de IA por artigo, ditas no botão\)/);

  const rascunho = await writerSeedPlanOf(pedidoDoDocumento(), portasCom(entrada, { ...planta, approval: "DRAFT" } as Planta));
  assert.equal(rascunho.plano.kind, "needs_article_blueprint", "rascunho não é planta concluída");

  const outroCongelamento = await writerSeedPlanOf(pedidoDoDocumento(), portasCom(entrada, planta, { congeladoEm: "2026-10-05T10:00:00.000Z" }));
  assert.equal(outroCongelamento.plano.kind, "other_investigation");
  const outroDna = await writerSeedPlanOf(pedidoDoDocumento(), portasCom(entrada, planta, { dna: "dna-v2" }));
  assert.equal(outroDna.plano.kind, "other_investigation", "invariante 30: a planta de outro ArticleDNA não vale para este documento");

  /* A rota recusa ANTES de qualquer chamada de IA (409; 503 só quando a leitura das plantas falha). */
  const rota = semComentarios("../app/api/redator/seed/route.ts");
  const recusa = rota.indexOf('if (!plan || plan.kind !== "ready")');
  const semPartes = rota.indexOf("const recusa = seedPlanRefusal(plan.plan, input.kind);");
  const primeiraIa = rota.indexOf("generateStructuredAI({");
  assert.ok(recusa > 0 && semPartes > recusa && primeiraIa > semPartes, "o plano é conferido antes da IA");
  assert.match(rota, /status: code === "blueprint_unavailable" \? 503 : 409/);
  assert.match(rota, /code: "seed_plan_without_parts"/);
});

/* ============================ formato curto ============================ */

test("curto · a série de vídeos curtos são os cortes do plano; sem corte, a recusa diz o motivo de cada capítulo", () => {
  const curto = planoCurto();
  assert.equal(seedPartsCount(curto, "video_script"), curto.cortes.length);
  assert.equal(seedPartsCount(curto, "carousel"), curto.capitulos.length + 2, "o carrossel continua pela planta");
  const fonte = { title: "Skincare", foundations: fundamentos(), finalArticle: null, plan: curto };
  assert.ok(buildScriptSeedPrompt(fonte).startsWith(`Monte o roteiro da série de vídeos curtos com ${curto.cortes.length} cena(s): uma por corte do plano do vídeo, na ordem dos cortes`));
  assert.ok(seedContextLines(fonte).includes(`- Série de vídeos curtos (os capítulos que funcionam sozinhos, pela utilidade): ${curto.cortes.length}`));

  const semCorte = planoCurto({ cortes: [] });
  const recusa = seedPlanRefusal(semCorte, "video_script")!;
  assert.match(recusa, /^O formato decidido é curto \(os Shorts lideram a amostra pertinente/);
  assert.match(recusa, /capítulo 2: a ideia única pede fonte; capítulo 3: sem demonstração na planta/);
  assert.equal(seedPlanRefusal(semCorte, "carousel"), null, "o carrossel não depende dos cortes");
  assert.match(seedPlanRefusal(planoDeVideo({ capitulos: [] }), "carousel")!, /não tem seções que virem capítulos/);
  assert.equal(seedPlanRefusal(planoDeVideo(), "video_script"), null);
});

/* ============================ a trava ============================ */

test("trava · o que a trava do CSV de vídeo tirou do texto publicável chega à semente como 'Fica fora', e a regra comum a proíbe em gancho, cena, slide e CTA", () => {
  const plano = planoDeVideo();
  const linhas = seedContextLines({ title: "Skincare", foundations: fundamentos(), finalArticle: null, plan: plano });
  assert.ok(linhas.includes(`${SEED_OUT_OF_PUBLISHABLE_TITLE}:`));
  assert.ok(linhas.includes('- Capítulo 2: "O hidratante certo reduz a oleosidade em uma semana." — afirmação sobre conversão do público sem fonte'), linhas.join("\n"));
  assert.ok(linhas.includes("     Na fala, só delimitada: O hidratante certo reduz a oleosidade em uma semana."));
  for (const sistema of [SCRIPT_SEED_SYSTEM_PROMPT, CAROUSEL_SEED_SYSTEM_PROMPT]) {
    assert.match(sistema, /em 'Fica fora do texto publicável' não vira afirmação no gancho, nas cenas, nos slides, na legenda nem no closingCta/);
    assert.match(sistema, /o closingCta é o CTA do artigo-modelo, a única chamada; a leitura seguinte, quando houver, nunca vira segunda chamada/);
  }
});

/* ============================ com Assunto ============================ */

test("Assunto · a virada da semeadura sai da planta lida: as linhas antigas do envio são trocadas, as outras ficam", async () => {
  const assunto = { phrase: "Rotina de skincare facial", note: null, destinationUrl: null };
  const base = contextoDePesquisa();
  const contexto = { ...base, article: { ...base.article, subject: { ...assunto } } } as RadarArticleResearchContext;
  const vista = vistaDoGoogleSobre(contexto);
  const entrada = entradaGoogle({ articleModel: vista.articleModel as RadarEditorialArticleModel, googleObserved: vista.observed, researchContext: contexto });
  const planta = plantaDe(entrada, { articleId: ARTIGO });
  const gravadas = [
    "Tronco (Assunto): Rotina de skincare facial.",
    "Virada: onde quem redige decidir (sem sinal na SERP), levar o leitor de skincare facial a Rotina de skincare facial.",
    "Assunto no H1: sem sinal na SERP, quem redige decide. O H1 é da principal.",
    "Diferenciação: o artigo publicado vizinho cobre a limpeza; este fica com a ordem dos passos.",
  ];
  const lido = await writerSeedPlanOf(pedidoDoDocumento(gravadas), portasCom(entrada, planta));
  pronto(lido);
  const linhas = lido.editorialContext!;
  assert.ok(linhas.includes(`Virada: na seção "${planta.blueprint.sections[0].h2}" do artigo-modelo (seção 1), levar o leitor de skincare facial a Rotina de skincare facial.`), linhas.join("\n"));
  assert.ok(linhas.includes(`Seção da virada: "${planta.blueprint.sections[0].h2}", seção 1 do artigo-modelo concluído.`));
  assert.equal(linhas.some(item => /sem sinal na SERP/.test(item)), false, "nada da régua antiga");
  assert.equal(linhas.at(-1), gravadas[3], "a linha de diferenciação continua, no fim");
});

/* ============================ nada do legado ============================ */

test("legado · a semeadura não tem número fixo de cenas ou slides nem os rótulos do blueprint antigo do YouTube", () => {
  const semente = semComentarios("../lib/redator/deliverable-seed.ts");
  assert.doesNotMatch(semente, /\b4 a 8\b|\b5 a 8\b|entre 4 e 8|entre 5 e 8|de 4 a 8|de 5 a 8/);
  assert.doesNotMatch(semente, /Estrutura sugerida|Formato vencedor|Direção do gancho|Tom:|Linguagem:|hookDirection|titleDirections|languageDirection|\.script\b/);
  const painel = semComentarios("../modules/redator/writer-radar-foundations-panel.tsx");
  assert.doesNotMatch(painel, /Estrutura sugerida|Formato vencedor|Blueprint multimodal|"Gancho"|>Gancho|>Tom<|>Linguagem<|hookDirection|languageDirection/);
});

/* ============================ D10 ============================ */

const PALAVRAS_D10 = /pend[êe]ncia|aguardando aprova|rascunho|fonte a obter|preencher|peça ao arquiteto|confira se a coleta traz/i;

test("D10 · o pedido da semeadura (sistema e usuário) e as recusas saem concluídos", async () => {
  const entrada = entradaGoogle();
  const planta = plantaDe(entrada, { articleId: ARTIGO });
  const plano = pronto(await writerSeedPlanOf(pedidoDoDocumento(), portasCom(entrada, planta)));
  const fonte = { title: "Skincare facial", foundations: fundamentos(), finalArticle: null, plan: plano };
  for (const texto of [SCRIPT_SEED_SYSTEM_PROMPT, CAROUSEL_SEED_SYSTEM_PROMPT, buildScriptSeedPrompt(fonte), buildCarouselSeedPrompt(fonte)]) {
    assert.doesNotMatch(texto, PALAVRAS_D10);
  }
  const recusas = [
    seedPlanRefusal(planoCurto({ cortes: [] }), "video_script"),
    seedPlanRefusal(planoDeVideo({ capitulos: [] }), "carousel"),
    ((await writerSeedPlanOf(pedidoDoDocumento(), portasCom(entrada, null))).plano as { reason: string }).reason,
    ((await writerSeedPlanOf(pedidoDoDocumento(), portasCom(entrada, planta, { congeladoEm: "2026-10-05T10:00:00.000Z" }))).plano as { reason: string }).reason,
  ];
  for (const recusa of recusas) assert.doesNotMatch(String(recusa), PALAVRAS_D10);
});

test("PROVIDER_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
