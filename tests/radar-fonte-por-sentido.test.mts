import assert from "node:assert/strict";
import test from "node:test";
import {
  RADAR_BEHAVIOR_CLAIM_REASON,
  RADAR_CONVERSION_CLAIM_REASON,
  RADAR_PLATFORM_CLAIM_REASON,
  radarClaimGate,
  radarPendingClaims,
  radarPlatformClaimKind,
  radarSentenceNeedsSource,
  type RadarPendingClaim,
} from "../lib/radar/pending-claims.ts";
import type { RadarArticleBlueprintPayload } from "../lib/radar/article-blueprint.ts";

/*
 * ===== 2026-10-08 · A TRAVA DE FONTE POR SENTIDO (desenho dos entregáveis, Grupo A2) =====
 *
 * No CSV de vídeo real de 08/10, "Um site otimizado converte visitantes em
 * agendamentos" foi travada, mas "canais que convertem, como o site e o
 * WhatsApp" saiu publicada (lâmina 4 e corte 2); e "Pacientes com dor ou
 * necessidade procuram no Google, não no Instagram" — comportamento do público
 * sem fonte — não tinha régua. A régua por frase (`radarSentenceNeedsSource`)
 * serve ao CSV para escrever, ao CSV de vídeo e ao Redator: a mesma porta do
 * vídeo, dita para quem marca a frase no texto.
 *
 * Domínio puro: sem rede, sem banco, sem provider.
 */

const D10 = /fonte a obter|pend[eê]ncia|pendente de|preencher|rascunho|aguardando aprova/i;

test("os casos do CSV real: conversão e comportamento do público pedem fonte; a tese do dono e a orientação passam", () => {
  for (const [frase, kind, reason, label] of [
    ["canais que convertem, como o site e o WhatsApp", "CONVERSAO", RADAR_CONVERSION_CLAIM_REASON, "afirmação sobre conversão do público"],
    ["Um site otimizado converte visitantes em agendamentos.", "CONVERSAO", RADAR_CONVERSION_CLAIM_REASON, "afirmação sobre conversão do público"],
    ["Pacientes com dor ou necessidade procuram no Google, não no Instagram.", "COMPORTAMENTO", RADAR_BEHAVIOR_CLAIM_REASON, "afirmação sobre comportamento do público"],
  ] as const) {
    const veredito = radarSentenceNeedsSource(frase);
    assert.deepEqual(veredito, { needs: true, reason, label, kind, source: null }, frase);
  }
  /* A tese do dono passa pela polaridade: nega o efeito, não afirma nada que peça fonte. */
  for (const frase of [
    "O Instagram, sozinho, não enche a agenda.",
    "Mostrar por que o Instagram, sozinho, não enche a agenda e como usar a plataforma de forma estratégica.",
    "Como atrair clientes pelo Instagram (sem cair na ilusão de que ele enche a agenda)",
    "Instagram não traz pacientes",
    /* Orientação: imperativo, "deve", infinitivo de finalidade. */
    "A bio deve deixar claro quem você atende e como agendar.",
    "Otimize seu perfil para conversão.",
    "Use o Instagram como vitrine para gerar autoridade e relacionamento.",
  ]) assert.deepEqual(radarSentenceNeedsSource(frase), { needs: false, reason: "", label: "", kind: "LIVRE", source: null }, frase);
});

test("com fonte do pacote, a frase passa e leva a fonte; sem a fonte, a mesma frase pede fonte", () => {
  const fonte = { id: "X1", url: "https://fonte-oficial.exemplo/conversao-de-sites", titulo: "Estudo de conversão" };
  const pendentes: RadarPendingClaim[] = [{ texto: "Sites otimizados convertem visitantes em agendamentos", origem: "PLANTA", fonte, secao: 2 }];
  const frase = "Um site otimizado converte visitantes em agendamentos.";
  const comFonte = radarSentenceNeedsSource(frase, { pendentes, secao: 2 });
  assert.equal(comFonte.needs, false);
  assert.equal(comFonte.kind, "COM_FONTE");
  assert.deepEqual(comFonte.source, fonte);
  assert.equal(comFonte.reason, "fonte do pacote X1: Estudo de conversão (https://fonte-oficial.exemplo/conversao-de-sites)");
  assert.equal(comFonte.label, "", "quem tem fonte não leva o rótulo \"precisa de fonte\"");
  /* A fonte vence o detector por sentido — e sem ela o detector volta a valer. */
  assert.equal(radarSentenceNeedsSource(frase).needs, true);
  /* O link da planta SEM fonte trava pelo link, com o motivo concluído (D10). */
  const semFonte = radarSentenceNeedsSource(frase, { pendentes: [{ ...pendentes[0], fonte: null }], secao: 2 });
  assert.equal(semFonte.needs, true);
  assert.equal(semFonte.kind, "PLANTA");
  assert.equal(semFonte.reason, "a planta pede fonte oficial ou verificada: \"Sites otimizados convertem visitantes em agendamentos\"");
  assert.equal(semFonte.label, "afirmação que a planta liga a fonte oficial ou verificada");
});

test("polaridade: a negação ANTES do verbo, na mesma oração, libera; a do lugar ou a de outra oração não", () => {
  const pares: Array<[string, boolean]> = [
    ["O Instagram traz pacientes para a clínica.", true],
    ["O Instagram não traz pacientes para a clínica.", false],
    ["O feed converte seguidores em pacientes.", true],
    ["O feed não converte seguidores em pacientes.", false],
    ["Pacientes procuram dentista no Google.", true],
    ["Pacientes não procuram dentista no Instagram.", false],
    /* O contraste nega o LUGAR, não o verbo: continua afirmando onde o público procura. */
    ["Pacientes procuram no Google, não no Instagram.", true],
    /* A negação não atravessa a vírgula: "é o site que converte" é afirmação. */
    ["Não é o Instagram que traz pacientes, é o site que converte.", true],
    ["Não basta postar, o site converte visitantes em pacientes.", true],
  ];
  for (const [frase, precisa] of pares) assert.equal(radarSentenceNeedsSource(frase).needs, precisa, frase);
});

test("o efeito comercial em várias formas pede fonte; o efeito que não é resultado comercial, o modal e a pergunta passam", () => {
  for (const frase of [
    "Conteúdo educativo gera agendamentos.",
    "Conteúdo educativo atrai pacientes qualificados.",
    "Stories enchem a agenda da clínica.",
    "Seguidores viram pacientes quando o perfil é claro.",
    "O Instagram transforma seguidores em pacientes.",
    "Depoimentos aumentam as vendas.",
    "Esse post leva a agendamentos.",
  ]) assert.equal(radarPlatformClaimKind(frase), "CONVERSAO", frase);
  for (const frase of [
    "Conteúdo educativo gera confiança e posiciona você como autoridade.",
    "Um site otimizado pode converter visitantes em agendamentos.",
    "O Instagram traz pacientes?",
    "Postar com frequência não garante relevância nem conversão.",
  ]) assert.equal(radarPlatformClaimKind(frase), null, frase);
});

test("comportamento do público: o público como sujeito; preposição, substantivo e passiva não contam", () => {
  for (const frase of [
    "Quem tem dor procura no Google.",
    "A maioria dos pacientes chega pelo Google.",
    "Hoje, clientes decidem pela confiança.",
    "As pessoas buscam no Google, e não no Instagram.",
  ]) assert.equal(radarPlatformClaimKind(frase), "COMPORTAMENTO", frase);
  for (const frase of [
    "Escreva para quem procura clareamento.",
    "Mostre ao paciente onde ele agenda.",
    "A procura por atendimento começa na busca, não no feed.",
    "Mostre o caminho da busca até o agendamento.",
    /* Limite declarado: comportamento na voz passiva, sem o público como sujeito. */
    "O conteúdo do Instagram é consumido de passagem, sem o compromisso de uma necessidade imediata.",
  ]) assert.equal(radarPlatformClaimKind(frase), null, frase);
});

test("finalidade da plataforma pede fonte nos dois sentidos; finalidade sem plataforma passa", () => {
  for (const frase of [
    "O Instagram foi feito para entretenimento, não para agendar consultas.",
    "O Instagram não serve para vender.",
    "O WhatsApp só serve para fechar a consulta.",
  ]) {
    const veredito = radarSentenceNeedsSource(frase);
    assert.equal(veredito.kind, "PLATAFORMA", frase);
    assert.equal(veredito.reason, RADAR_PLATFORM_CLAIM_REASON);
    assert.equal(veredito.label, "afirmação sobre plataforma");
  }
  assert.equal(radarSentenceNeedsSource("Este guia foi feito para dentistas.").needs, false);
  assert.equal(radarSentenceNeedsSource("A bio serve para dizer quem você atende.").needs, false);
});

test("as afirmações do mercado chegam pela régua por frase, com o motivo e o rótulo de cada origem", () => {
  const pendentes: RadarPendingClaim[] = [
    { texto: "Clareamento com bicarbonato desgasta o esmalte do dente", origem: "MERCADO_SEM_FONTE", fonte: null, secao: null },
    { texto: "Protetor solar com FPS 30 bloqueia a radiação UVA", origem: "MERCADO_X_FONTE", fonte: null, secao: null },
  ];
  const semFonte = radarSentenceNeedsSource("O bicarbonato desgasta o esmalte.", { pendentes });
  assert.equal(semFonte.kind, "MERCADO_SEM_FONTE");
  assert.equal(semFonte.label, "o mercado repete sem fonte");
  assert.match(semFonte.reason, /^o mercado repete sem fonte: "Clareamento com bicarbonato/);
  const contra = radarSentenceNeedsSource("O protetor solar bloqueia a radiação.", { pendentes });
  assert.equal(contra.kind, "MERCADO_X_FONTE");
  assert.equal(contra.label, "a fonte contradiz ou condiciona o que o mercado repete");
});

test("uma régua só: o veredito por frase é a porta do vídeo, e nenhum motivo ou rótulo sai com espera aberta (D10)", () => {
  const pendentes: RadarPendingClaim[] = [
    { texto: "O algoritmo do Instagram prioriza conteúdo com alto engajamento", origem: "PLANTA", fonte: null, secao: 0 },
    { texto: "Clareamento com bicarbonato desgasta o esmalte do dente", origem: "MERCADO_SEM_FONTE", fonte: null, secao: null },
  ];
  const comuns = new Set(["instagram"]);
  for (const [frase, secao] of [
    ["O algoritmo prioriza conteúdo que gera interação", 0],
    ["O bicarbonato desgasta o esmalte", null],
    ["canais que convertem, como o site e o WhatsApp", 1],
    ["Pacientes com dor ou necessidade procuram no Google, não no Instagram.", 1],
    ["Hashtags e geolocalização ajudam a ser encontrado por quem está perto.", 2],
    ["O Instagram, sozinho, não enche a agenda.", 1],
    ["A bio deve deixar claro quem você atende e como agendar.", 1],
    ["", null],
  ] as const) {
    const veredito = radarSentenceNeedsSource(frase, { pendentes, secao, comuns });
    assert.equal(veredito.needs, radarClaimGate(frase, pendentes, secao, { comuns }).estado === "TRAVADA", frase);
    assert.doesNotMatch(`${veredito.reason} ${veredito.label}`, D10, frase);
  }
});

test("radarPendingClaims sem as projeções do pacote: só os links da planta, com a fonte quando ligada", () => {
  const planta = {
    sources: [{ id: "X1", url: "https://fonte.exemplo/stories", title: "Fonte", claim: "Stories com enquete aumentam as respostas" }],
    blueprint: {
      sections: [
        { externalLinks: [{ claim: "O algoritmo do Instagram prioriza conteúdo com alto engajamento", sourceType: "oficial", source: null }] },
        { externalLinks: [{ claim: "Stories com enquete aumentam as respostas no direct", sourceType: "oficial", source: "X1" }, { claim: "  ", sourceType: "", source: null }] },
      ],
    },
  } as unknown as RadarArticleBlueprintPayload;
  assert.deepEqual(radarPendingClaims(null, planta), [
    { texto: "O algoritmo do Instagram prioriza conteúdo com alto engajamento", origem: "PLANTA", fonte: null, secao: 0 },
    { texto: "Stories com enquete aumentam as respostas no direct", origem: "PLANTA", fonte: { id: "X1", url: "https://fonte.exemplo/stories", titulo: "Fonte" }, secao: 1 },
  ]);
  assert.deepEqual(radarPendingClaims(null, null), []);
});

/*
 * 2026-10-08 (correção da revisão) · a régua errava nos dois sentidos. Travava
 * orientação — o próximo passo REAL do artigo-modelo de 08/10 ia para "só entra
 * com fonte" no Redator e na semente do roteiro —, a tese negada com mecanismo
 * na frase, o modal, a finalidade do guia e o público que só define o sujeito;
 * e deixava passar efeito comercial do próprio caso real ("poucos se tornam
 * pacientes") e da legenda real ("capta pacientes").
 */
const PROXIMO_PASSO_REAL = "Acesse a página de SEO para clínicas e descubra como aparecer no Google quando o paciente procura.";

test("orientação não é afirmação: o próximo passo real, o imperativo com \"o que\"/\"quando\", o orientar contra e o modal passam", () => {
  for (const frase of [
    PROXIMO_PASSO_REAL,
    "Esteja no Google quando o paciente procura uma clínica perto de casa.",
    "Entenda o que seus clientes procuram antes de planejar o conteúdo.",
    "Anote quando o cliente decide agendar e o que ele perguntou antes.",
    "Mostre no perfil o que o paciente procura: serviço, região e como agendar.",
    "Use hashtags locais para ajudar quem está perto a encontrar a clínica.",
    "Evite dizer que o algoritmo prioriza vídeos curtos.",
    "Não prometa que o Instagram traz pacientes.",
    "Hashtags podem ajudar a clínica a ser encontrada por quem está perto.",
    "Influenciadores locais podem ampliar seu alcance para o público certo.",
    "O Instagram pode priorizar outros formatos no próximo ano.",
    /* A oração temporal é condição, não afirmação. */
    "O Perfil da Empresa no Google aparece quando o paciente pesquisa um serviço perto dele.",
  ]) assert.deepEqual(radarSentenceNeedsSource(frase), { needs: false, reason: "", label: "", kind: "LIVRE", source: null }, frase);
  /* Quem orienta contra não afirma o que manda evitar — mas a causa que ele dá é afirmação. */
  assert.equal(radarPlatformClaimKind("Evite postar só no feed, porque o algoritmo penaliza quem não usa reels."), "PLATAFORMA");
  /* Orientar com a afirmação dentro ("explique QUE …") continua afirmando; e o efeito conjugado, sem modal, continua travando. */
  assert.equal(radarPlatformClaimKind("Explique que pacientes procuram no Google, não no Instagram."), "COMPORTAMENTO");
  assert.equal(radarPlatformClaimKind("Use o Instagram como vitrine, direcionando o público para canais que convertem, como o site e o WhatsApp."), "CONVERSAO");
  assert.equal(radarPlatformClaimKind("Hashtags e geolocalização ajudam a ser encontrado por quem está perto."), "PLATAFORMA");
  assert.equal(radarPlatformClaimKind("O Instagram prioriza vídeos curtos."), "PLATAFORMA");
  /* Sem imperativo, o "o que" do público continua sendo afirmação de comportamento. */
  assert.equal(radarPlatformClaimKind("Isso é o que os pacientes procuram no Google, não no Instagram."), "COMPORTAMENTO");
});

test("a tese negada passa mesmo com mecanismo na frase; a afirmada trava pela conversão", () => {
  assert.equal(radarPlatformClaimKind("O engajamento não garante pacientes."), null);
  assert.equal(radarPlatformClaimKind("O engajamento garante pacientes."), "CONVERSAO");
  /* O efeito de plataforma que não é comercial continua nos dois sentidos. */
  assert.equal(radarPlatformClaimKind("Stories com enquetes aumentam o engajamento."), "PLATAFORMA");
});

test("finalidade: só com a plataforma (ou o pronome que a retoma) como sujeito; a do guia e a do artigo passam", () => {
  for (const frase of [
    "Este guia foi pensado para profissionais de saúde que usam o Instagram.",
    "O artigo foi feito para quem quer atrair clientes pelo Instagram.",
    "Este conteúdo é pensado para clínicas que já têm site.",
    "O passo a passo foi criado para quem nunca usou o Instagram para negócios.",
  ]) assert.equal(radarSentenceNeedsSource(frase).needs, false, frase);
  for (const frase of [
    /* As frases do caso real: o pronome retoma o Instagram; a coordenada tem o Instagram como sujeito. */
    "O Instagram não traz pacientes porque ele foi feito para entretenimento e descoberta, não para a decisão de agendar uma consulta.",
    "O Instagram é ótimo para gerar visibilidade e engajamento, mas não foi desenhado para converter seguidores em pacientes automaticamente.",
    "O site foi criado para converter.",
  ]) assert.equal(radarPlatformClaimKind(frase), "PLATAFORMA", frase);
});

test("o público que só define o sujeito e a tentativa (\"busca atrair\") passam; o comportamento afirmado trava", () => {
  for (const frase of [
    "Quem busca atrair clientes pelo Instagram precisa de um perfil claro.",
    "Quem procura um dentista quer saber se a clínica atende perto.",
    "Pacientes que procuram tratamento merecem respostas claras.",
    /* Só a tentativa, sem verbo normativo depois: "busca atrair" é "quer atrair". */
    "Quem busca atrair pacientes pelo Instagram encontra aqui um passo a passo.",
  ]) assert.equal(radarSentenceNeedsSource(frase).needs, false, frase);
  for (const frase of [
    "Quem pesquisa no Google já quer agendar.",
    "Pacientes que chegam pelo Google já vêm decididos.",
    "Clientes buscam confiança antes de agendar.",
    "A maioria das pessoas desiste de agendar quando não acha o preço.",
  ]) assert.equal(radarPlatformClaimKind(frase), "COMPORTAMENTO", frase);
});

test("efeito comercial do caso real e formas comuns pedem fonte — com a polaridade", () => {
  for (const frase of [
    /* O caso real (seção 1 do artigo-modelo de 08/10) e a legenda real do Respiro 3. */
    "Muitos perfis têm milhares de seguidores, mas poucos se tornam pacientes.",
    "A presença no Google capta pacientes com intenção de busca.",
    "Clínicas com site recebem mais pacientes.",
    "Clientes vindos do Google fecham mais.",
    "O WhatsApp é a ferramenta que fecha a venda.",
    "A agenda enche quando a clínica aparece no Google.",
    "Um perfil claro faz a agenda encher.",
  ]) assert.equal(radarPlatformClaimKind(frase), "CONVERSAO", frase);
  assert.equal(radarPlatformClaimKind("O Reels dá mais alcance que o carrossel."), "PLATAFORMA");
  /* Sem a plataforma como sujeito: o mecanismo (alcance) com o efeito "dá mais". */
  assert.equal(radarPlatformClaimKind("Vídeo curto dá mais alcance que foto."), "PLATAFORMA");
  for (const frase of [
    "Nem todo seguidor se torna paciente.",
    "A agenda não enche só com posts.",
    "A clínica recebe pacientes de segunda a sexta.",
    "Combine o Instagram com o site para captar pacientes com intenção de busca.",
  ]) assert.equal(radarPlatformClaimKind(frase), null, frase);
});
