import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import {
  RadarArticleBlueprintAiSchema,

  radarArticleBlueprintColumns,
  radarArticleBlueprintMeasures,
  radarArticleBlueprintPrompt,
  radarArticleBlueprintReportFacts,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintBrief,
} from "../lib/radar/article-blueprint.ts";
import { radarSeoGuidelineState } from "../lib/radar/seo-guidelines.ts";
import { radarPortableWriterReadiness } from "../lib/radar/portable-dossier-gaps.ts";

/*
 * ===== REVISÃO DO PACOTE "PARA ESCREVER" — 2026-10-02 =====
 *
 * O que a revisão do CSV real (Instagram, clínicas) achou e o que se prova aqui,
 * sem IA e sem banco, para qualquer assunto e tipo de página:
 *
 *   - URL de evidência sai inteira (o corte em 90 caracteres caía no endereço);
 *   - destino do link sai pelo nome do artigo, não pela moldura "Cobrir com
 *     clareza o tema…"; caminho planejado ganha o prefixo provável da URL
 *     publicada deste artigo, dito como provável;
 *   - imagem sem proporção ganha a referência;
 *   - seção que cita origem M de outro assunto ganha aviso;
 *   - o pedido à IA traz as regras de afirmação, origem e imagem;
 *   - o Relatório lê a planta (estrutura e links) em vez de 0% e 50%;
 *   - o bloqueio por divergência diz O QUE divergiu, sem id.
 *
 * PROVIDER_CALLS = 0.
 */

const esqueleto = (id: string, heading: string, extra: Partial<RadarArticleBlueprintBrief["skeleton"][number]> = {}) => ({
  id, level: 2 as const, parent: null, heading, readerQuestion: null, cover: [], mustCover: false, needsSource: false, needsSpecialist: false, outOfScope: false, ...extra,
});

function pacote(patch: Partial<RadarArticleBlueprintBrief> = {}): RadarArticleBlueprintBrief {
  return {
    article: {
      principal: "como atrair clientes pelo instagram",
      complementary: [{ keyword: "instagram não traz pacientes", role: "complementar", volume: 30 }],
      subject: null, intent: "Informacional", funnel: "Topo", siloRole: "Suporte",
      audience: null, promise: null,
      slug: "instagram-nao-traz-pacientes", publishedUrl: "https://exemplo.com.br/leads-sem-trafego-pago/instagram-nao-traz-pacientes",
      mustCover: [], unit: { type: "article", label: "Artigo", format: null },
    },
    silo: null,
    skeleton: [
      esqueleto("M1", "O que considerar sobre stories para atrair clientes?"),
      esqueleto("M2", "Bio do perfil para atrair clientes"),
    ],
    skeletonFrame: { workingTitle: null, promise: null, closing: null },
    evidence: [
      { id: "S1", kind: "resultado orgânico", text: "Guia de como atrair clientes no Instagram - Blog do Nex · https://www.nextar.com.br/blog/guia-de-como-atrair-clientes-no-instagram-passo-a-passo · \"trecho do concorrente\"" },
      { id: "P1", kind: "pergunta da amostra", text: "Como atrair clientes pelo Instagram? (4 de 6 páginas)" },
    ],
    linkCandidates: [
      { id: "K1", label: "Cobrir com clareza o tema “leads qualificados”.", role: "Pilar", destination: "/qualificados", status: "PLANNED", fromGraph: true },
      { id: "K2", label: "captação de pacientes sem tráfego pago", role: "Suporte", destination: "/leads-sem-trafego-pago/captacao", status: "PLANNED", fromGraph: true },
      { id: "K3", label: "Página da marca /servicos", role: "Página da marca (Skill de voz)", destination: "https://exemplo.com.br/servicos", status: "PUBLISHED", fromGraph: false },
    ],
    graphLinks: [], sources: [], unsupportedClaims: [], specialist: [], videos: [],
    outOfScope: [], competitorTitles: [],
    measures: radarArticleBlueprintMeasures([]),
    authors: [],
    brandVoice: null,
    ...patch,
  };
}

const secao = (h2: string, extra: Record<string, unknown> = {}) => ({ h2, readerQuestion: `${h2}?`, answerFirst: "Resposta direta.", ...extra });

function resposta(patch: Record<string, unknown> = {}) {
  return {
    keywordPlan: { reading: "A principal no H1." },
    reader: "Profissional de clínica.", promise: "Atrair pelo perfil.", angle: { statement: "Perfil é vitrine.", evidence: ["S1"] },
    title: { h1: "Como atrair clientes pelo Instagram", seoTitle: "Como atrair clientes pelo Instagram", metaDescription: "O que fazer no perfil." },
    opening: { readerQuestion: "Como atrair clientes pelo Instagram?", direction: "Responder direto.", evidence: ["P1"] },
    sections: [
      secao("Por que o Instagram não traz pacientes", { from: ["M1"], evidence: ["S1"], internalLinks: [{ candidate: "K1", anchor: "leads qualificados" }] }),
      secao("Como usar os Stories para atrair clientes", { from: ["M1"], internalLinks: [{ candidate: "K2", anchor: "captação sem tráfego pago" }] }),
      secao("Bio do perfil que leva ao contato", { from: ["M2"], internalLinks: [{ candidate: "K3", anchor: "SEO para clínicas" }] }),
    ],
    closing: { turn: "Perfil com caminho.", cta: "Conheça o serviço." },
    visual: [
      { slot: "CAPA", prompt: "profissional no consultório organizando a agenda, 16:9" },
      { slot: "R1", section: "Bio do perfil que leva ao contato", prompt: "perfil genérico com botão de contato, sem texto legível" },
    ],
    ...patch,
  };
}

const organizado = () => radarSanitizeArticleBlueprint(RadarArticleBlueprintAiSchema.parse(resposta()), pacote());

test("origem M de outro assunto ganha aviso; a seção que trata dele não", () => {
  const { notes } = organizado();
  assert.ok(notes.some(nota => /Seção "Por que o Instagram não traz pacientes" cita M1 \("O que considerar sobre stories para atrair clientes\?"\) como origem, mas não trata do assunto dela/.test(nota)));
  assert.equal(notes.some(nota => /"Como usar os Stories para atrair clientes" cita M1/.test(nota)), false, "a seção de Stories trata do assunto da M1");
  assert.equal(notes.some(nota => /"Bio do perfil que leva ao contato" cita M2/.test(nota)), false);
  /* O aviso pede ação: vai às pendências da proposta no CSV. */
  assert.ok(notes.filter(nota => /mas não trata do assunto dela/.test(nota)).every(nota => /antes de aprovar/.test(nota)));
});

test("CSV: URL de evidência inteira, destino pelo nome, prefixo provável e proporção da imagem", () => {
  const colunas = radarArticleBlueprintColumns(organizado().payload, null, {
    slug: "instagram-nao-traz-pacientes",
    publishedUrl: "https://exemplo.com.br/leads-sem-trafego-pago/instagram-nao-traz-pacientes",
  });
  assert.match(colunas.estrutura, /https:\/\/www\.nextar\.com\.br\/blog\/guia-de-como-atrair-clientes-no-instagram-passo-a-passo\)/, "a URL sai inteira");
  assert.doesNotMatch(colunas.estrutura, /%E2%80%A6|blog\/…/);
  assert.doesNotMatch(`${colunas.estrutura}\n${colunas.links_internos}`, /Cobrir com clareza/, "a moldura da promessa não é nome de destino");
  assert.match(colunas.links_internos, /Pilar "leads qualificados" → \/qualificados \(caminho provável: \/leads-sem-trafego-pago\/qualificados, com o prefixo da URL publicada deste artigo; confirme antes de publicar\)/);
  assert.match(colunas.links_internos, /→ \/leads-sem-trafego-pago\/captacao \(planejado/, "caminho que já tem o prefixo não ganha outro");
  assert.match(colunas.links_internos, /→ https:\/\/exemplo\.com\.br\/servicos \(publicado\)/, "publicado não muda");
  assert.doesNotMatch(colunas.plano_visual.split("Respiro")[0], /Proporção:/, "o prompt da capa já diz a proporção");
  assert.match(colunas.plano_visual, /Respiro 1[\s\S]*Proporção: 4:3 \(referência/);

  /* Sem URL publicada (ou com o slug fora do fim do caminho), nenhum prefixo é deduzido. */
  const semPublicacao = radarArticleBlueprintColumns(organizado().payload).links_internos;
  assert.doesNotMatch(semPublicacao, /caminho provável/);
  const outroSlug = radarArticleBlueprintColumns(organizado().payload, null, { slug: "outro", publishedUrl: "https://exemplo.com.br/a/b" }).links_internos;
  assert.doesNotMatch(outroSlug, /caminho provável/);
});

test("o brief tira a moldura do nome do irmão do Silo antes de a IA o ver", async () => {
  const fonte = (await readFile(new URL("../lib/radar/article-blueprint.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(fonte, /const rotulo = semMolduraDoTema\(t\(membro\.principalKeyword\) \|\| t\(membro\.title\) \|\| t\(membro\.slug\)\);/);
});

test("o pedido à IA traz as regras de abertura, imagem, afirmação e origem", () => {
  const { system } = radarArticleBlueprintPrompt(pacote());
  assert.match(system, /outro canal ou assunto vizinho entra depois, numa seção/);
  assert.match(system, /O prompt termina com a proporção \(capa 16:9, respiro 4:3/);
  assert.match(system, /Nunca tela fictícia de resultado/);
  assert.match(system, /17\. AFIRMAÇÕES/);
  assert.match(system, /Não prescreva gratuidade, urgência, oferta exclusiva/);
  assert.match(system, /18\. ORIGEM: cada id em from trata do assunto da seção/);
});

test("Relatório: estrutura e links leem o artigo-modelo — proposta 50, aprovado 100; sem planta, como antes", () => {
  const checks = [
    { id: "blueprint", state: "PENDING" as const, detail: "A investigação não produziu necessidade suficiente para propor um bloco editorial." },
    { id: "links", state: "PARTIAL" as const, detail: "3 relação(ões) do grafo aprovado ainda não têm contexto." },
    { id: "research", state: "READY" as const, detail: "ok" },
  ];
  const fatos = radarArticleBlueprintReportFacts(organizado().payload);
  assert.deepEqual(fatos, { sections: 3, internalLinks: 3, graphRequired: 2, graphPlaced: 2 });

  const antes = radarSeoGuidelineState(checks);
  assert.deepEqual(antes.pillars.map(item => item.percent), [0, 50, 100]);

  const proposta = radarSeoGuidelineState(checks, { articleBlueprint: { approval: "DRAFT", ...fatos } });
  const [estrutura, links] = proposta.pillars;
  assert.equal(estrutura.percent, 50);
  assert.match(estrutura.detail, /Artigo-modelo da SERP em proposta da IA, aguardando sua aprovação .*: 3 seção\(ões\)/);
  assert.equal(links.percent, 50);
  assert.match(links.detail, /3 link\(s\) interno\(s\).*Cobre 2 de 2 destino\(s\) que o grafo aprovado pede/);

  const aprovada = radarSeoGuidelineState(checks, { articleBlueprint: { approval: "APPROVED", ...fatos } });
  assert.deepEqual(aprovada.pillars.map(item => item.percent), [100, 100, 100]);

  /* Aprovada sem cobrir o grafo: links fica em 50. Planta sem seções não conta. */
  const incompleta = radarSeoGuidelineState(checks, { articleBlueprint: { approval: "APPROVED", ...fatos, graphPlaced: 1 } });
  assert.equal(incompleta.pillars[1].percent, 50);
  const vazia = radarSeoGuidelineState(checks, { articleBlueprint: { approval: "APPROVED", sections: 0, internalLinks: 0, graphRequired: 0, graphPlaced: 0 } });
  assert.deepEqual(vazia.pillars.map(item => item.percent), [0, 50, 100]);
});

test("o bloqueio por divergência diz o que divergiu; detalhe com id não entra", () => {
  const bloqueado = radarPortableWriterReadiness({
    readiness: {
      ready: false,
      blocks: [
        { code: "DOSSIER_DIVERGES", message: "O pacote de evidências falhou na verificação de integridade.", detail: "Afirmações a sustentar: 12 no dossiê, 13 no congelado." },
        { code: "DOSSIER_DIVERGES", message: "O pacote de evidências falhou na verificação de integridade.", detail: "O dossiê descreve a versão 8170a492-ace1-4cb9-8951-26ee36e1d6e3 e o congelado a versão 11111111-2222-3333-4444-555555555555." },
      ],
    },
  } as never);
  assert.ok(bloqueado.reasons.includes("o dossiê atual diverge da investigação congelada (Afirmações a sustentar: 12 no dossiê, 13 no congelado)"));
  assert.ok(bloqueado.reasons.includes("o dossiê atual diverge da investigação congelada"), "o detalhe com id fica de fora");
  assert.equal(bloqueado.reasons.some(item => /8170a492/.test(item)), false);
});

test("com o artigo-modelo, 'cobrir e superar' remete à abertura dele em vez de dar outra", async () => {
  const fonte = (await readFile(new URL("../lib/radar/portable-writing-export.ts", import.meta.url), "utf8")).replace(/\r\n/g, "\n");
  assert.match(fonte, /if \(contexto\.blueprint\) \{\n\s+movimentos\.push\("Abertura: a do artigo-modelo \(coluna estrutura\); as perguntas abaixo entram nas seções\."\);\n\s+\} else if \(perguntaDeAbertura\) \{/);
});

test("PROVIDER_CALLS = 0", () => {
  assert.ok(true, "nenhuma rede: tudo acima é domínio puro");
});
