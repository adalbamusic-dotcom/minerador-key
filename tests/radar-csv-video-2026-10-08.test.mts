import assert from "node:assert/strict";
import test from "node:test";
import {
  buildRadarVideoExportArticle,
  radarPortableVideoExport,
  radarVideoH3IsAction,
  radarVideoPremise,
} from "../lib/radar/portable-video-export.ts";
import {
  RadarArticleBlueprintAiSchema,
  buildRadarArticleBlueprintBrief,
  radarSanitizeArticleBlueprint,
  type RadarArticleBlueprintPayload,
} from "../lib/radar/article-blueprint.ts";
import type { RadarBrandVoice, RadarBrandVoiceState } from "../lib/radar/brand-voice.ts";
import type { RadarPortableExportInput } from "../lib/radar/portable-export.ts";
import { ARTIGO, EXPORTADO_EM, entradaGoogle, entradaGoogleSaude } from "./radar-portable-writing-fixtures.mts";

/*
 * ===== 2026-10-08 · O CSV DE VÍDEO DEPOIS DO CASO REAL DE 08/10 (Grupo D do desenho) =====
 *
 * O CSV de vídeo de "como atrair clientes pelo instagram" (08/10) saiu com:
 *   D1 · "3 ideia(s) escolhida(s) … pela utilidade isolada" e cortes em 0, 0 e 1 de 4;
 *   D2 · o corte 1 com a ideia "A atenção no feed é passageira…" e a cena "só o
 *        primeiro passo — O papel do algoritmo…" (o tema da afirmação travada);
 *   D3 · "N telas, uma por passo" com H3 SUBSTANTIVOS ("O papel do algoritmo…");
 *   D4 · "lista, como em 6 de 6 páginas concorrentes" (soava como carrossel observado);
 *   D5 · "canais que convertem" na lâmina 4 e no corte 2, e "(fonte a obter:
 *        oficial ou verificada)" no roteiro — D10.
 *
 * A planta abaixo imita as cinco seções do caso real (fixture inventada a partir
 * do extrato; nada lido do arquivo do dono). PROVIDER_CALLS = 0 e AI_CALLS = 0.
 */

const idasAoServidor: string[] = [];
Object.defineProperty(globalThis, "fetch", {
  value: (entrada: unknown) => {
    idasAoServidor.push(String((entrada as { url?: string })?.url || entrada));
    return Promise.reject(new Error("REDE PROIBIDA NESTE GATE"));
  },
  writable: true, configurable: true,
});

/* ============================== as fixtures ============================== */

const PRINCIPAL = "como atrair clientes pelo instagram";
const DESTINO = "https://adalbapro.com.br/leads-sem-trafego-pago/instagram-nao-traz-pacientes";
const TESE = "Mostrar por que o Instagram, sozinho, não enche a agenda e como usar a plataforma de forma estratégica para atrair clientes, sem depender de tráfego pago.";

function entradaDoCaso(extra: Partial<RadarPortableExportInput> = {}): RadarPortableExportInput {
  const base = entradaGoogle();
  return { ...base, article: { ...base.article, principalKeyword: PRINCIPAL, secondaryKeywords: [], canonical: DESTINO }, ...extra };
}

type SecaoDaPlanta = RadarArticleBlueprintPayload["blueprint"]["sections"][number];

/* A planta pelo caminho real (brief + saneamento), com as seções sob medida e sem evidência por padrão (o caso real: "pergunta sem demanda medida"). */
function plantaDe(entrada: RadarPortableExportInput, secoes: Array<Partial<SecaoDaPlanta> & { h2: string }>, ajustes: { promise?: string; opening?: string; h1?: string } = {}): RadarArticleBlueprintPayload {
  const brief = buildRadarArticleBlueprintBrief({ entrada, silo: null, articleId: ARTIGO, publication: null });
  const ai = RadarArticleBlueprintAiSchema.parse({
    keywordPlan: { reading: "A principal no título." }, reader: "Donas de clínica.", promise: ajustes.promise ?? TESE, angle: { statement: "Ângulo." },
    title: { h1: ajustes.h1 ?? "Como atrair clientes pelo Instagram (sem cair na ilusão de que ele enche a agenda)", seoTitle: "SEO", metaDescription: "Meta." },
    opening: { readerQuestion: ajustes.opening ?? "Como atrair clientes pelo Instagram?", direction: "Responder." },
    sections: ["Base", "Meio", "Fim"].map(h2 => ({ h2, readerQuestion: `${h2}?`, answerFirst: "Resposta direta.", from: [], practical: null })),
    closing: { turn: "Virada.", cta: "CTA." },
    visual: [{ slot: "CAPA", prompt: "consultório" }, { slot: "R1", prompt: "agenda" }, { slot: "R2", prompt: "recepção" }],
  });
  const planta = { ...radarSanitizeArticleBlueprint(ai, brief).payload, approval: "APPROVED" as const };
  const base = planta.blueprint.sections[0];
  return {
    ...planta,
    blueprint: { ...planta.blueprint, sections: secoes.map(secao => ({ ...base, readerQuestion: `${secao.h2}?`, practical: null, h3: [], evidence: [], from: [], externalLinks: [], ...secao })) },
  };
}

/* As cinco seções do caso real de 08/10, como o extrato as mostra (H3, resposta, explicar e o link sem fonte do capítulo 1). */
const SECOES_DO_CASO: Array<Partial<SecaoDaPlanta> & { h2: string }> = [
  {
    h2: "O que o Instagram faz bem (e o que ele não faz)", readerQuestion: "O Instagram realmente serve para atrair clientes?",
    answerFirst: "O Instagram foi feito para entretenimento, não para agendar consultas.",
    explain: ["O algoritmo prioriza conteúdo que gera interação, não necessariamente o que leva a agendamentos", "A atenção no feed é passageira; a decisão de marcar consulta envolve confiança e necessidade."],
    h3: ["O papel do algoritmo na entrega de conteúdo", "Por que seguidores não são sinônimo de pacientes"],
    externalLinks: [{ claim: "O algoritmo do Instagram prioriza conteúdo com alto engajamento", sourceType: "oficial", source: null }],
  },
  {
    h2: "Instagram não traz pacientes: por que isso acontece?", readerQuestion: "Por que meu Instagram não traz pacientes, mesmo com muitos seguidores?",
    answerFirst: "O conteúdo do Instagram é consumido de passagem, sem o compromisso de uma necessidade imediata.",
    explain: ["Pacientes com dor ou necessidade procuram no Google, não no Instagram."],
    h3: ["A natureza do conteúdo no Instagram", "A falta de intenção de busca do usuário", "O mito do 'postar todo dia'"],
  },
  {
    h2: "Como usar o Instagram para atrair clientes de forma estratégica", readerQuestion: "Então como eu posso usar o Instagram para atrair clientes?",
    answerFirst: "Use o Instagram como vitrine para gerar autoridade e relacionamento, direcionando o público para canais que convertem, como o site e o WhatsApp.",
    explain: ["A bio deve deixar claro quem você atende e como agendar."],
    h3: ["Otimize seu perfil para conversão", "Crie conteúdo que responda às dúvidas do paciente", "Use stories para mostrar bastidores e humanizar"],
  },
  {
    h2: "Estratégias práticas para atrair clientes pelo Instagram", readerQuestion: "Quais ações concretas posso aplicar hoje no meu Instagram?",
    answerFirst: "Aplique táticas como parcerias com influenciadores locais, uso de hashtags relevantes e interação ativa com a audiência.",
    explain: ["Influenciadores locais podem ampliar seu alcance para o público certo", "Hashtags e geolocalização ajudam a ser encontrado por quem está perto."],
    h3: ["Parcerias com influenciadores e perfis locais", "Uso inteligente de hashtags e geolocalização", "Interação e networking na plataforma"],
  },
  {
    h2: "O que fazer quando o Instagram não é suficiente", readerQuestion: "E se mesmo com estratégia o Instagram não trouxer pacientes?",
    answerFirst: "Combine o Instagram com presença orgânica em outros canais e site otimizado para captar pacientes com intenção de busca.",
    explain: ["Um site otimizado converte visitantes em agendamentos."],
    h3: ["A importância do Google para clínicas", "Como o site e o SEO complementam o Instagram", "Integrando canais para uma estratégia completa"],
  },
];

const linhaDe = (entrada: RadarPortableExportInput, contexto: Partial<Parameters<typeof buildRadarVideoExportArticle>[1]> = {}) =>
  buildRadarVideoExportArticle(entrada, { position: 1, youtube: null, ...contexto }).row;

/* O texto publicável da linha: lâminas e ideias dos cortes. */
const publicaveis = (cortes: string) => cortes.split("\n").filter(linha => linha.startsWith("- Lâmina") || /^ {3}Ideia única: /.test(linha));

const VOZ: RadarBrandVoice = {
  versionId: "voz-1", version: 1, name: "AdalbaPro", contentHash: "sha256:voz", status: "active", title: "AdalbaPro",
  sections: [
    { heading: "1. Público prioritário", body: "Donas de clínicas de estética e consultórios, com menor dependência da exposição constante nas redes." },
    { heading: "2. Voz", body: "Linguagem próxima e adulta." },
    { heading: "3. Construção do artigo e transição comercial", body: "Resposta direta, depois a oferta." },
  ],
  markdown: "## 1. Público prioritário\n\nDonas de clínicas de estética e consultórios, com menor dependência da exposição constante nas redes.\n\n## 2. Voz\n\nLinguagem próxima e adulta.\n\n## 3. Construção do artigo e transição comercial\n\nResposta direta, depois a oferta.",
};

/* ================================ D3 ================================ */

test("D3 · H3 é passo só quando é AÇÃO (imperativo, infinitivo, \"Como + infinitivo\", \"Passo N\"); substantivo é tópico — os 15 H3 do caso real", () => {
  const doCaso = SECOES_DO_CASO.flatMap(secao => secao.h3 || []);
  const acoes = doCaso.filter(radarVideoH3IsAction);
  assert.deepEqual(acoes, ["Otimize seu perfil para conversão", "Crie conteúdo que responda às dúvidas do paciente", "Use stories para mostrar bastidores e humanizar"], "do caso real, só o capítulo 3 tem passos");
  for (const acao of [
    "Escolher o tema", "Gravar os stories", "Como medir o perfil sem número inventado", "Como se posicionar no feed", "Passo 1: o briefing", "1. Defina sua oferta",
    "Ajuste o perfil", "Faça parcerias locais", "Mostre o antes", "Posicione-se como referência", "Selecione os destaques", "Compartilhe bastidores",
    "Publique carrosséis educativos", "Conheça seu público", "Inclua o link de agendamento", "Mantenha a constância", "Planeje a semana", "Peça um depoimento",
  ]) assert.equal(radarVideoH3IsAction(acao), true, acao);
  for (const topico of [
    "Perfil antes", "O ajuste", "Diagnóstico do perfil", "Análise de métricas", "Cliente ideal", "Agenda cheia", "Vitrine do perfil", "Site otimizado",
    "Banner do site", "Newsletter semanal", "Influencer marketing", "Dengue: sintomas", "Destaque do perfil", "Teste A/B", "Escolha do tema",
    "Manicure e pedicure", "Investir em anúncio vale a pena?", "Avatar do cliente", "Online e offline", "Coordenação da equipe", "Saúde da pele",
    /* Empréstimo em "-er" fora da lista: a forma estrangeira (w, k, consoante dobrada) não é infinitivo português. */
    "Follower engajado", "Tracker de métricas",
  ]) assert.equal(radarVideoH3IsAction(topico), false, topico);
});

/* ================================ D1 + D3 + D4 + D5 no caso real ================================ */

test("caso real · nenhum corte em 0 de 4, os tópicos viram PONTOS (não passos), a lista é das páginas e \"canais que convertem\" sai do publicável", () => {
  const entrada = entradaDoCaso();
  const row = linhaDe(entrada, { blueprint: plantaDe(entrada, SECOES_DO_CASO) });
  const cortes = row.cortes_para_redes;
  /* D1: os portões não completam a conta — o capítulo 3 passa neles e fica em 0 de 4. */
  assert.match(cortes, /^Cortes \(Shorts, Reels e TikTok\): nenhum corte nesta linha — os capítulos que funcionam sozinhos \(pergunta própria, frase publicável e demonstração definida\) ficaram em 0 de 4 de utilidade/m);
  assert.doesNotMatch(cortes, /ideias? escolhidas?|ideia\(s\) escolhida\(s\)|^\d+\. Do capítulo /m, "nenhum corte escolhido");
  assert.match(cortes, /^Capítulos sem corte: 1 \(sem demonstração definida na planta: os subtítulos são tópicos, não ações\) · 2 \(sem demonstração definida na planta: os subtítulos são tópicos, não ações\) · 3 \(utilidade 0 de 4: o corte pede ao menos 1 ponto — pergunta com demanda, uma ação ou oportunidade na SERP\) · 4 \(sem demonstração definida na planta: os subtítulos são tópicos, não ações\) · 5 \(sem demonstração definida na planta: os subtítulos são tópicos, não ações\)\.$/m);
  assert.match(row.storyboard_visual, /^Storyboard dos cortes: nenhum corte nesta linha \(o motivo de cada capítulo está em cortes_para_redes\)\.$/m);
  assert.match(row.cadeia_competitiva, /^- Formato: capítulo 3 do vídeo longo · sem corte: utilidade 0 de 4: o corte pede ao menos 1 ponto — /m);
  /* O prompt não pede corte que não existe (a IA inventaria um). */
  assert.match(row.prompt, /^Escreva o roteiro de um vídeo para o YouTube e o carrossel sobre /m);
  assert.match(row.prompt, /^2\) Cortes: esta linha não tem corte de capítulo \(nenhum capítulo com utilidade para corte; o motivo de cada um está em cortes_para_redes\) — não escreva corte de capítulo para ela\.$/m);
  /*
   * 2026-10-08 (correção da revisão) · a frase ABSOLUTA do caso real ("procuram
   * no Google, não no Instagram") sumia calada: o filtro de absoluta rodava
   * antes da trava. Agora ela é listada no "Fica fora", com o motivo, e contada
   * no pode_gravar — e continua fora do vídeo, também da fala.
   */
  assert.match(cortes, /^- Capítulo 1 · lâmina 2: "O Instagram foi feito para entretenimento, não para agendar consultas" — regra universal sem fonte: fica fora do vídeo, também da fala; /m);
  assert.match(cortes, /^- Capítulo 2 · lâmina 3: "Pacientes com dor ou necessidade procuram no Google, não no Instagram" — regra universal sem fonte: fica fora do vídeo, também da fala\.$/m);
  assert.doesNotMatch(row.diretrizes_de_roteiro, /procuram no Google, não no Instagram|foi feito para entretenimento/, "a absoluta não volta à fala");
  const listadas = cortes.slice(cortes.indexOf("Fica fora do texto publicável")).split("\n").filter(linha => linha.startsWith("- ")).reduce((soma, linha) => soma + (linha.match(/" — /g) || []).length, 0);
  assert.match(row.pode_gravar, new RegExp(`^- ${listadas} frase\\(s\\) que pedem fonte saíram do texto publicável`, "m"), "o pode_gravar conta o que a lista mostra");

  /* D3: tópico nunca é dito passo — nem na tela, nem na lâmina, nem no storyboard, nem na cadeia. */
  const todaLinha = Object.values(row).join("\n");
  for (const topico of ["O papel do algoritmo", "A natureza do conteúdo", "Parcerias com influenciadores", "A importância do Google"]) {
    assert.doesNotMatch(todaLinha, new RegExp(`(?:uma por passo|passos em lista|primeiro passo|passos:)[^\\n]*${topico}`), `tópico como passo: ${topico}`);
  }
  assert.match(cortes, /^- Lâmina 2: [^\n]* · Visual: os pontos do capítulo em lista: O papel do algoritmo na entrega de conteúdo; Por que seguidores não são sinônimo de pacientes\.$/m);
  assert.match(cortes, /^- Lâmina 4: [^\n]* · Visual: os passos em lista: Otimize seu perfil para conversão; Crie conteúdo que responda às dúvidas do paciente; Use stories para mostrar bastidores e humanizar\.$/m);
  assert.match(row.diretrizes_de_roteiro, /^ {3}Mostrar na tela: sem demonstração na planta \(capítulo explicativo\) — contexto visual: os pontos do capítulo na tela, um por vez: A natureza do conteúdo no Instagram; A falta de intenção de busca do usuário; O mito do 'postar todo dia'; este capítulo não vira corte\.$/m);
  assert.match(row.storyboard_visual, /^- Cena 1 · [^\n]*imagem: capítulo explicativo \(sem demonstração\): os pontos do capítulo na tela, um por vez: O papel do algoritmo/m);
  assert.match(row.storyboard_visual, /^- Cena 3 · [^\n]*imagem: 3 telas, uma por passo: Otimize seu perfil para conversão; /m);

  /* D4: a lista é a estrutura das PÁGINAS lidas, dita uma vez; carrossel ninguém contou. */
  assert.doesNotMatch(row.storyboard_visual, /como em \d+ de \d+ páginas concorrentes/);
  assert.match(row.storyboard_visual, /^Por que em lista: é a estrutura das páginas concorrentes lidas \(\d+ de \d+ usam listas\), não uma contagem de carrosséis — o Radar não lê as lâminas dos carrosséis\.$/m);

  /* D5 (a trava por sentido do Grupo A, de ponta a ponta): conversão e plataforma saem do publicável; a tese e a orientação ficam. */
  for (const linha of publicaveis(cortes)) assert.doesNotMatch(linha, /canais que convertem|converte visitantes|algoritmo prioriza|ampliar seu alcance|geolocalização ajudam/, linha);
  assert.match(cortes, /^- Capítulo 3 · lâmina 4: "Use o Instagram como vitrine[^"]*" — afirmação sobre conversão do público sem fonte \(regra 17 da planta\)\.$/m);
  assert.match(cortes, /^- Capítulo 5 · lâmina 6: "Um site otimizado converte visitantes em agendamentos" — afirmação sobre conversão do público sem fonte \(regra 17 da planta\)\.$/m);
  assert.match(cortes, /^- Lâmina 4: [^\n]*Apoio \(texto publicável\): A bio deve deixar claro quem você atende e como agendar\. · /m, "a orientação passa e vira o Apoio");
  assert.match(cortes, /^- Lâmina 1 \(capa\): Como atrair clientes pelo Instagram \(sem cair na ilusão de que ele enche a agenda\)\.$/m, "a tese do dono passa (polaridade)");
  assert.match(row.diretrizes_de_roteiro, /^Premissa do vídeo: O vídeo mostra por que o Instagram, sozinho, não enche a agenda/m);
  /* D10 no "Antes de afirmar": a regra concluída, sem "fonte a obter". */
  assert.match(row.diretrizes_de_roteiro, /^ {3}Antes de afirmar: O algoritmo do Instagram prioriza conteúdo com alto engajamento \(a planta pede fonte oficial ou verificada; o pacote não tem\); sem fonte, diga de forma delimitada\.$/m);
});

/*
 * 2026-10-08 (correção da revisão) · zero corte de capítulo E um fato com fonte
 * no pacote: a coluna dizia "nenhum corte nesta linha" e logo abaixo "1. Um
 * fato com fonte…", enquanto o prompt mandava não escrever corte. O fato sai
 * sem número, como vídeo curto à parte, e o prompt cita a exceção.
 */
test("D1 (correção) · zero corte de capítulo com fato com fonte: o fato sai sem número e o prompt cita a exceção", () => {
  const entrada = entradaDoCaso();
  const comFato = (observado: unknown) => {
    const autoridade = (observado as { authorityEvidence?: Record<string, unknown> } | null)?.authorityEvidence;
    if (autoridade) autoridade.factualEvidence = [{ claim: "Perfis com bio clara recebem mais contatos", supportType: "SUPPORTS", sourceUrl: "https://exemplo.gov.br/estudo", sourceTitle: "Estudo oficial", classification: "OFFICIAL" }];
  };
  comFato(entrada.googleObserved);
  comFato((entrada.dossierGaps as unknown as { observed?: unknown } | null)?.observed);
  const row = linhaDe(entrada, { blueprint: plantaDe(entrada, SECOES_DO_CASO) });
  assert.match(row.cortes_para_redes, /^Cortes \(Shorts, Reels e TikTok\): nenhum corte nesta linha — /m);
  assert.match(row.cortes_para_redes, /^Fora dos capítulos: um fato com fonte, dito em uma frase e com a fonte na legenda, rende um vídeo curto à parte\.$/m);
  assert.doesNotMatch(row.cortes_para_redes, /^\d+\. Um fato com fonte/m, "lista numerada logo depois de \"nenhum corte\" contradiz a linha");
  assert.match(row.prompt, /^2\) Cortes: esta linha não tem corte de capítulo [^\n]* — não escreva corte de capítulo para ela; o fato com fonte de cortes_para_redes pode virar um vídeo curto à parte, com a fonte na legenda\.$/m);
});

/* ================================ D1 ================================ */

test("D1 · com 1 ponto vira corte e o cabeçalho diz o número real, com concordância; quem fica em 0 diz o mínimo", () => {
  const entrada = entradaDoCaso();
  /* O capítulo 5 escrito com AÇÕES e ligado a uma lacuna do pacote (G1): 1 ponto de utilidade. */
  const secoes = SECOES_DO_CASO.map((secao, indice) => (indice === 4
    ? { ...secao, h3: ["Cadastre a clínica no Perfil da Empresa no Google", "Otimize o site para buscas da região", "Integre o Instagram ao WhatsApp"], evidence: ["G1"] }
    : secao));
  const planta = plantaDe(entrada, secoes);
  assert.ok(planta.evidence.some(item => item.id === "G1"), "a lacuna G1 existe no pacote da fixture");
  const row = linhaDe(entrada, { blueprint: planta });
  const cortes = row.cortes_para_redes;
  assert.match(cortes, /^Cortes sugeridos \(Shorts, Reels e TikTok\): 1 ideia escolhida dos capítulos pela utilidade isolada \(pergunta com demanda, funciona sozinha, uma demonstração, oportunidade na SERP\), só com 1 ponto ou mais de 4; /m);
  assert.deepEqual(cortes.split("\n").map(linha => linha.match(/^(\d+)\. Do capítulo (\d+) \(/)).filter(Boolean).map(casado => Number(casado![2])), [5]);
  assert.match(cortes, /^ {3}Utilidade 1 de 4: pergunta sem demanda medida na SERP · funciona sozinha · 3 passos \([^)]+\) · lacuna G1\.$/m);
  assert.match(cortes, /^Capítulos sem corte: [^\n]*3 \(utilidade 0 de 4: o corte pede ao menos 1 ponto — pergunta com demanda, uma ação ou oportunidade na SERP\)/m);
  assert.doesNotMatch(cortes, /empatada com os escolhidos/, "0 de 4 não é empate com quem tem 1");
  assert.match(row.prompt, /^2\) Os cortes desta linha \(até 3, escolhidos por utilidade\) /m);
  assert.match(row.prompt, /^Escreva o roteiro de um vídeo para o YouTube, os cortes e o carrossel sobre /m);
});

/* ================================ D2 ================================ */

test("D2 · a cena do corte casa com a ideia: o passo que ela nomeia ou, sem casamento, a própria ideia numa situação — nunca \"o primeiro passo\" por posição", () => {
  const entrada = entradaDoCaso();
  const passos = "grave os stories na segunda; publique o carrossel na quarta; responda o direct na sexta";
  const comIdeia = (answerFirst: string) => linhaDe(entrada, { blueprint: plantaDe(entrada, [{ h2: "Rotina da semana", readerQuestion: "Como organizar a semana no Instagram?", answerFirst, practical: passos, evidence: ["G1"] }]) });

  /* A ideia nomeia UM passo: o corte mostra esse. */
  const umPasso = comIdeia("Publique o carrossel no meio da semana para manter a constância.");
  assert.match(umPasso.cortes_para_redes, /^ {3}Mostrar: só o passo que a ideia nomeia — publique o carrossel na quarta — num exemplo fictício identificado como ilustrativo; os outros passos ficam no vídeo longo\.$/m);
  assert.match(umPasso.cortes_para_redes, /^ {3}Utilidade 1 de 4: [^\n]* · 3 passos \(o corte usa o que a ideia nomeia\) · lacuna G1\.$/m);
  assert.match(umPasso.cortes_para_redes, /^ {3}Origem recomendada: gravar à parte com fala própria — motivo: a demonstração tem 3 passos e o corte usa só o que a ideia nomeia\. /m);
  assert.match(umPasso.storyboard_visual, /^- Corte 1 \(capítulo 1\): tela 1: "Como organizar a semana no Instagram\?" · tela 2: o passo que a ideia nomeia "publique o carrossel na quarta" · tela final: o CTA do corte\.$/m);

  /* A ideia não nomeia passo nenhum (o caso real: "A atenção no feed é passageira…"): a cena é a ideia, não o primeiro passo. */
  const nenhum = comIdeia("A atenção no feed é passageira; a decisão de marcar consulta envolve confiança e necessidade.");
  assert.match(nenhum.cortes_para_redes, /^ {3}Mostrar: a ideia numa situação — A atenção no feed é passageira — num exemplo fictício identificado como ilustrativo; os passos do capítulo ficam no vídeo longo\.$/m);
  assert.match(nenhum.cortes_para_redes, /^ {3}Utilidade 1 de 4: [^\n]* · 3 passos \(o corte mostra a ideia numa situação\) · lacuna G1\.$/m);
  assert.match(nenhum.storyboard_visual, /^- Corte 1 \(capítulo 1\): [^\n]*tela 2: a ideia numa situação "A atenção no feed é passageira" · tela final: o CTA do corte\.$/m);
  for (const linha of [nenhum.cortes_para_redes, nenhum.storyboard_visual, umPasso.cortes_para_redes, umPasso.storyboard_visual]) {
    assert.doesNotMatch(linha, /primeiro passo/, "a cena nunca é escolhida só pela posição");
  }
});

/* ================================ D5 ================================ */

test("D5 · a pergunta do gancho e a premissa passam pela régua por frase (sentido e polaridade); a tese do dono continua", () => {
  const entrada = entradaDoCaso();
  /* A pergunta da abertura reproduz o link sem fonte da planta: o gancho abre pelo tema e a pergunta vai para o "Fica fora". */
  const pergunta = "O Instagram atrai clientes porque o algoritmo prioriza conteúdo com alto engajamento?";
  const comPergunta = linhaDe(entrada, { blueprint: plantaDe(entrada, SECOES_DO_CASO, { opening: pergunta }) });
  const gancho = comPergunta.diretrizes_de_roteiro.split("\n")[0];
  assert.match(gancho, /^Gancho \(primeiros 15 segundos\): abra pelo próprio tema, "como atrair clientes pelo instagram"/);
  assert.doesNotMatch(gancho, /respondendo/, "a pergunta travada não abre o gancho");
  assert.match(comPergunta.cortes_para_redes, /^- Pergunta do gancho: "O Instagram atrai clientes porque o algoritmo prioriza conteúdo com alto engajamento\?" — a planta pede fonte oficial ou verificada: "O algoritmo do Instagram prioriza conteúdo com alto engajamento"\.$/m);

  /* A promessa que afirma CONVERSÃO sem fonte não vira premissa — cai para a abertura, como a promessa absoluta. */
  const conversao = "Mostrar que o site converte visitantes em agendamentos.";
  const comConversao = linhaDe(entrada, { blueprint: plantaDe(entrada, SECOES_DO_CASO, { promise: conversao }) });
  assert.match(comConversao.diretrizes_de_roteiro, /^Premissa do vídeo: O vídeo responde "Como atrair clientes pelo Instagram\?" com o que a pesquisa sustenta\.$/m);
  assert.match(comConversao.cortes_para_redes, /^- Premissa do vídeo: "Mostrar que o site converte visitantes em agendamentos" — afirmação sobre conversão do público sem fonte \(regra 17 da planta\)\.$/m);

  /*
   * Tudo travado ao mesmo tempo — H1 que afirma conversão, promessa de
   * conversão e a pergunta da abertura com o link sem fonte: a reserva (a
   * pergunta) também passa pela régua; a capa diz o que pôr e não há premissa.
   */
  const tudoTravado = linhaDe(entrada, { blueprint: plantaDe(entrada, SECOES_DO_CASO, { h1: "O Instagram enche a agenda da clínica", promise: conversao, opening: pergunta }) });
  assert.match(tudoTravado.cortes_para_redes, /^- Lâmina 1 \(capa\): o problema do tema em uma frase\.$/m);
  assert.doesNotMatch(tudoTravado.diretrizes_de_roteiro, /^Premissa do vídeo:/m);
  assert.doesNotMatch(tudoTravado.diretrizes_de_roteiro, /algoritmo prioriza conteúdo com alto engajamento\?/, "a pergunta travada não volta pela premissa de reserva");
  assert.match(tudoTravado.cortes_para_redes, /^- Capa do carrossel \(lâmina 1\): "O Instagram enche a agenda da clínica" — afirmação sobre conversão do público sem fonte \(regra 17 da planta\)\.$/m);

  /* Sem a trava da linha (a premissa lida sozinha), vale o detector por sentido — e a tese continua. */
  assert.equal(radarVideoPremise(plantaDe(entrada, SECOES_DO_CASO, { promise: conversao })), 'O vídeo responde "Como atrair clientes pelo Instagram?" com o que a pesquisa sustenta.');
  assert.equal(radarVideoPremise(plantaDe(entrada, SECOES_DO_CASO)), "O vídeo mostra por que o Instagram, sozinho, não enche a agenda e como usar a plataforma de forma estratégica para atrair clientes, sem depender de tráfego pago.");
});

/* ================================ D10 · o arquivo inteiro ================================ */

/*
 * As palavras de espera aberta que o D10 proíbe em todo entregável (a lista do desenho de 08/10, mais as que o CSV de vídeo já proibia).
 * "pendência" com fronteira: a Skill real fala em "menor dependência da exposição constante nas redes", e isso não é espera aberta.
 */
/* 2026-10-08 (correção da revisão) · e as esperas antigas: "a definir" e "conferir antes". */
const D10_PROIBIDAS = [/\bpend[eê]ncia/i, /pendente de/i, /aguardando aprova/i, /aguardando/i, /confira antes de aprovar/i, /rascunho/i, /fonte a obter/i, /preencher/i, /falta conferir/i, /\ba definir\b/i, /conferir antes/i];

test("D10 · o CSV de vídeo INTEIRO (Marca, Voz da marca e as linhas) sai concluído com a Skill em qualquer estado — nenhuma palavra proibida", () => {
  const entrada = entradaDoCaso();
  const planta = plantaDe(entrada, SECOES_DO_CASO);
  for (const status of ["active", "draft", "pending_approval"]) {
    const brandVoice: RadarBrandVoiceState = { kind: "available", voice: { ...VOZ, status } };
    const { csv } = radarPortableVideoExport({
      /* 2026-10-08 (correção da revisão) · a linha de saúde traz o especialista que responde outra coisa e a linha sem artigo-modelo nem público. */
      articles: [{ entrada, blueprint: planta }, { entrada: entradaGoogle() }, { entrada: entradaGoogleSaude() }],
      today: EXPORTADO_EM,
      brandVoice,
    });
    /* Os caminhos que já escreveram espera aberta estão no arquivo: o link sem fonte, a lista "Fica fora" e o rótulo da voz. */
    assert.match(csv, /a planta pede fonte oficial ou verificada; o pacote não tem/, status);
    assert.match(csv, /Fica fora do texto publicável/, status);
    assert.match(csv, /menor dependência da exposição/, "o texto da Skill viaja inteiro (e \"dependência\" não é espera aberta)");
    /* O CSV dobra as aspas dentro da célula. */
    assert.match(csv, status === "active" ? /Skill ""AdalbaPro"" v1 \(ativa na Marca\)/ : /Skill ""AdalbaPro"" v1 \(versão corrente na Marca\)/, status);
    for (const proibida of D10_PROIBIDAS) assert.doesNotMatch(csv, proibida, `D10 com a Skill em ${status}: ${proibida}`);
  }
});

test("PROVIDER_CALLS = 0 e AI_CALLS = 0", () => {
  assert.deepEqual(idasAoServidor, []);
});
