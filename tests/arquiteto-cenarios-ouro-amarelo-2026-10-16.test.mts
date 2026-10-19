import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { register } from "node:module";
import { mock, test } from "node:test";
import { ArticleDNASchema, ProvisionalArticleGroupSchema } from "../lib/arquiteto/contracts.ts";
import { SERP_SUBJECT_LENS_LABELS } from "../lib/arquiteto/serp-subject-overlap.ts";
import { normalizeKeyword } from "../lib/minerador/keyword-import-core.ts";
import { ATOR, linhaDaMesa } from "./arquiteto-assunto-fixtures.mts";
import { planGroupSiloClosure, planSheetConclusionChecklist, planSheetPreviewLines, planSheetSequence, planSheetWorkingCopyLines } from "../lib/arquiteto/plan-article-sheet.ts";
import { resolveSiloDeclaredGroup } from "../lib/arquiteto/silo-declared-plan.ts";
import { NO_REINFORCEMENT_FOUND_LABEL } from "../lib/arquiteto/article-improvement.ts";
import { improvementReadingLines } from "../lib/arquiteto/article-improvement-next-step.ts";
import { choosePlanSiloTerritory, declaredPlanSiloGroupFor, declaredPlanViewOfTerritory, resolveLinksSilo } from "../lib/arquiteto/declared-plan-silo.ts";
import { keywordIdsInArticleDnas, splitUngroupedBySubjectAnchor } from "../lib/arquiteto/declared-subject.ts";
import { territoryUndoRefusals, territoryUndoWholeSiloReasons } from "../lib/arquiteto/territory-undo.ts";

/*
 * CENÁRIO-OURO DO AMARELO DA WIFICONECTA (16/10) — SDD
 * `docs/compartilhado/sdd-linha-unica-do-arquiteto-2026-10-16.md` §15
 * ("Roteiro do grupo com plano"), obrigatório pelo §0.3 do AGENTS.md.
 *
 * Dados do caso real (SELECT de 16/10): 8 artigos do plano "Planos e
 * contratação"; Travados com volume — internet residencial barata (1.600),
 * internet no meu cep (720), combo internet e celular (720), instalação de
 * internet residencial (170); Livres SEM volume (volume nulo) — como escolher
 * plano de internet residencial (Pilar), claro vivo ou tim internet
 * residencial, quantos mega de internet preciso, combo internet tv streaming.
 * Slugs, detalhes e entidades do DNA são os do banco. A SERP da principal dos
 * Travados está no cache (perguntas, relacionadas e títulos reais, resumidos).
 * A marca não tem outras keywords nessa cor.
 *
 * Esperado (passos 3a, 3b e 4 do roteiro):
 *  - a busca nova (Google Ads, grátis) semeia do plano e do DNA, não do título;
 *  - os 4 Travados ganham secundárias NOVAS pela linha de copy e pela SERP da
 *    principal em cache, sem pagar SERP de candidata; a principal fica;
 *  - 2026-10-17 · PRINCIPAL DE IDENTIDADE (dono: "Se o termo principal tem
 *    pouco volume, mas faz sentido preservá-lo por ser a identidade do
 *    assunto/tema… as keywords mais amplas podem reforçar o contexto"): os 4
 *    Livres SEM volume estão no título e no slug do plano, então a principal
 *    FICA; as buscas mais amplas (no Pilar, "planos de internet residencial"
 *    6.600, "plano de internet residencial" 2.900… — os dados reais) entram
 *    como secundárias. SUBSTITUÍDO: "os 4 Livres ganham proposta de troca por
 *    uma keyword NOVA" (16/10);
 *  - 2026-10-17 (tarde) · A RÉGUA ÚNICA DA COLETA (dono: "implementa a sua
 *    recomendação"): a principal de identidade SEM volume TEM a SERP coletada
 *    na primeira coleta do artigo — mostra o que o Google exibe para a frase
 *    exata do artigo. A única coleta paga é a da principal de cada Livre
 *    (4 lentes cada, 16 consultas, até US$ 0,056), dita antes por artigo
 *    ("SERP da principal de identidade “…”: 4 consultas, até US$ 0,014 — para
 *    ver o que o Google mostra para a frase do artigo"), com a autorização; a
 *    secundária de mais volume NÃO é coletada por padrão (gasto duplo) e o
 *    parecer usa a SERP da principal. SUBSTITUÍDO: "a principal sem volume não
 *    tem SERP coletada; a coleta paga é a da secundária de mais volume (D2a)"
 *    (manhã de 17/10);
 *  - 2026-10-17 (noite) · "PILAR TROCA, SUPORTES FICAM" (dono): o Pilar (l1),
 *    Livre e sem volume, recebe a proposta do termo-cabeça com volume que leva o
 *    núcleo do slug ("planos de internet residencial", 6.600); "plano de internet
 *    residencial" (2.900) fica secundária; "como escolher…" fica como o Assunto.
 *    A SERP paga do Pilar é a do termo-cabeça. Os 3 Suportes Livres ficam;
 *  - UMA confirmação incorpora as novas (import, Lógica, Volume pela medição
 *    da prévia, aprovação, envio) e grava os 8 ArticleDNAs;
 *  - nada que veio do Minerador é alterado (as 8 originais byte a byte) e
 *    nenhuma sugestão nova vai para "Sugestões do Arquiteto".
 *
 * Nenhuma rede (fetch lança), nenhum banco, nenhum provider real.
 */

register(`data:text/javascript,${encodeURIComponent(`export async function resolve(s,c,n) {
  if(s==='next/server') return {shortCircuit:true,url:'data:text/javascript,'+encodeURIComponent('export class NextRequest extends Request {}')}; return n(s,c); }`)}`);
let chamadasDeRede = 0;
globalThis.fetch = (async () => { chamadasDeRede += 1; throw new Error("Rede proibida no cenário-ouro do amarelo."); }) as typeof fetch;

const MARCA = "d4fa133a-13bd-4bf7-bfd1-d0f22253f223";
const AMARELO = "36300396-90cc-4af6-9741-f2811251b584";
const TERRITORIO = "territory:2318febb-f4c7-4036-ac8c-b7416be0de3c";
const sha = (c: string) => `sha256:${c.repeat(64)}`;
type Row = Record<string, any>;

/* ------------------------------------------------------ o plano amarelo */

type LinhaAmarela = { id: string; keyword: string; titulo: string; order: number; role: "Pilar" | "Suporte"; slug: string; scope: string; entity: string; intent: string | null; volume: number | null; lock: "locked" | "free" };
const PLANO: LinhaAmarela[] = [
  { id: "l1", keyword: "como escolher plano de internet residencial", titulo: "Como escolher um plano de internet residencial sem cair em uma oferta ruim", order: 1, role: "Pilar", slug: "como-escolher-plano-internet-residencial", scope: "Escolha de plano: cobertura, necessidade de uso, custo total, tecnologia, contrato e encaminhamento", entity: "plano", intent: "Informativo", volume: null, lock: "free" },
  { id: "t1", keyword: "internet residencial barata", titulo: "Internet residencial barata: o que comparar além da mensalidade", order: 2, role: "Suporte", slug: "internet-residencial-barata", scope: "Diferença entre preço promocional e custo real; reajuste, multa, instalação e serviços adicionais", entity: "internet residencial", intent: null, volume: 1600, lock: "locked" },
  { id: "l2", keyword: "claro vivo ou tim internet residencial", titulo: "Claro, Vivo ou TIM para casa: como comparar onde você mora", order: 3, role: "Suporte", slug: "claro-vivo-tim-internet-residencial", scope: "Critérios condicionais por endereço, tecnologia, atendimento e contrato; provedores regionais", entity: "claro vivo ou tim internet", intent: null, volume: null, lock: "free" },
  { id: "t3", keyword: "internet no meu cep", titulo: "Como saber quais operadoras de internet atendem minha rua e meu CEP", order: 4, role: "Suporte", slug: "operadoras-internet-no-meu-cep", scope: "Diferença entre CEP e endereço completo, prédio, porta disponível e viabilidade técnica", entity: "internet", intent: null, volume: 720, lock: "locked" },
  { id: "l3", keyword: "quantos mega de internet preciso", titulo: "300, 500, 600 Mega ou 1 Giga: quantos Mega você realmente precisa?", order: 5, role: "Suporte", slug: "quantos-mega-de-internet-preciso", scope: "Dimensionamento por pessoas, dispositivos simultâneos e atividades; upload e Wi-Fi", entity: "quantos mega", intent: null, volume: null, lock: "free" },
  { id: "t2", keyword: "combo internet e celular", titulo: "Combo de internet e celular vale a pena? Veja o que entra na conta", order: 6, role: "Suporte", slug: "combo-internet-e-celular-vale-a-pena", scope: "Comparar combo vs contratos separados, franquia, portabilidade, desconto e permanência", entity: "combo internet celular", intent: null, volume: 720, lock: "locked" },
  { id: "l4", keyword: "combo internet tv streaming", titulo: "Internet, TV Box e streaming: quando compensa contratar tudo junto?", order: 7, role: "Suporte", slug: "combo-internet-tv-streaming-vale-a-pena", scope: "Acesso a aplicativos, modalidade, telas, canais, duração dos benefícios e titularidade", entity: "combo internet tv streaming", intent: null, volume: null, lock: "free" },
  { id: "t4", keyword: "instalação de internet residencial", titulo: "Instalação de internet: taxas, prazo e quando chega a primeira fatura", order: 8, role: "Suporte", slug: "instalacao-internet-primeira-fatura", scope: "Instalação, agendamento, viabilidade, cobrança inicial e fidelidade", entity: "instalacao", intent: null, volume: 170, lock: "locked" },
];
const TRAVADOS = PLANO.filter(l => l.lock === "locked").map(l => l.id);
const LIVRES = PLANO.filter(l => l.lock === "free").map(l => l.id);

/** O que a SERP da principal de cada Travado JÁ mostra no cache (resumo do SELECT de 16/10). */
/** Os domínios concorrentes reais (vivo.com.br, claro.com.br, tim.com.br…): de onde o motor tira o nome das operadoras. */
const DOMINIOS = ["vivo.com.br", "claro.com.br", "tim.com.br", "melhorplano.net"];
const VOCAB: Record<string, { questions: string[]; relatedSearches: string[]; titles: string[]; domains: string[] }> = {
  "internet residencial barata": { questions: ["Qual é o pacote de internet residencial mais barato?", "Tem internet de R$50?", "Qual o preço da internet mais barata?"], relatedSearches: ["Plano internet residencial", "Preço internet residencial", "Internet residencial barata sp", "Vivo internet residencial", "Internet boa e barata com wifi"], titles: ["Internet residencial barata: 11 planos em Outubro 2026", "Claro Fibra | A partir de R$49,90"], domains: DOMINIOS },
  "combo internet e celular": { questions: ["Qual o melhor combo internet e celular?", "Qual é o combo TV, internet e telefone mais barato?"], relatedSearches: ["Claro combo internet e celular", "Melhor combo internet e celular", "Combo claro tv internet e celular", "Combo tv e internet residencial", "Combo internet e celular vale a pena"], titles: ["Vivo Total | Combo de internet fibra + celular pós-pago", "TIM Ultracombo: internet fibra e plano de celular"], domains: DOMINIOS },
  "internet no meu cep": { questions: ["Como saber qual provedor de internet tem na minha rua?", "Como saber qual internet pega no meu CEP?"], relatedSearches: ["Internet no meu bairro", "Comparador de planos de internet", "Melhor internet no meu cep", "Internet fibra no meu cep", "Internet no meu endereço"], titles: ["Cobertura de Internet: Guia Prático para Verificar no seu Endereço"], domains: DOMINIOS },
  "instalação de internet residencial": { questions: ["Como é feita a instalação de internet?", "Quanto custa internet para um apartamento?"], relatedSearches: ["Plano internet residencial", "Internet residencial wifi", "Internet barata para casa"], titles: ["Planos de internet residencial em Belo Horizonte"], domains: DOMINIOS },
  /*
   * 2026-10-17 (noite) · a SERP da principal de IDENTIDADE dos Livres também é lida do cache depois da coleta (G6): o
   * vocabulário dela guia o reforço (antes, só a principal com volume tinha vocabulário). Resumo do SELECT real de 17/10.
   */
  "claro vivo ou tim internet residencial": { questions: ["Qual a melhor internet, da TIM ou da Vivo?", "Qual a melhor internet residencial TIM ou Vivo?"], relatedSearches: ["Tim vivo ou claro qual melhor", "Vivo ou claro qual a melhor internet residencial", "Tim claro ou vivo", "Claro internet residencial", "Vivo fibra"], titles: ["Vivo vs Claro vs TIM Fibra 2026: Qual a Melhor Internet Residencial?", "TIM Fibra ou Vivo Fibra: Qual é a Melhor Internet para Você?"], domains: ["reddit.com", "techtudo.com.br", "tim.com.br", "claromulti.com.br"] },
  "combo internet tv streaming": { questions: ["Qual a melhor internet com TV?", "Tem algum combo de streaming?", "Qual o melhor pacote de internet e TV por assinatura?"], relatedSearches: ["Plano internet mais streaming", "Combo tv e internet barato", "Plano claro residencial tv e internet", "Internet com streaming incluso", "Streaming tv por assinatura", "Planos tv box"], titles: ["Internet com streaming e Globoplay incluso - Nio Fibra", "Pacote de TV com Internet Fibra barato"], domains: ["ofertasclaro.com.br", "niointernet.com.br", "claro.com.br", "vivo.com.br"] },
};

/** As ideias do Google Ads (fixture), com o volume medido. As de fora do assunto têm de cair. */
const IDEIAS: Array<[string, number]> = [
  ["preço internet residencial", 170], ["internet residencial mais barata", 320],
  ["melhor combo internet e celular", 210], ["combo internet e celular vale a pena", 110], ["combo claro tv internet e celular", 880],
  ["operadoras que atendem meu cep", 320], ["melhor internet no meu cep", 260],
  // As do Pilar, com os números reais da execução 4bbcf025 (17/10): variantes da MESMA busca (singular/plural/ordem),
  // nunca divididas com "internet residencial barata"; nenhuma tem o "como escolher" da principal.
  ["planos de internet residencial", 6600], ["plano de internet residencial", 2900], ["plano internet residencial", 1000],
  ["melhores planos de internet residencial", 480], ["melhor plano de internet residencial", 260],
  ["quantos mega de internet eu preciso", 90], ["quantos mega preciso", 50],
  // 2026-10-17 (noite) · REAIS (execuções 5afa893a e 4bbcf025 da WifiConecta): as 4 grafias da MESMA busca da Vivo que
  // ocupavam as 4 vagas de "Claro, Vivo ou TIM"; as comparações entre as operadoras; o combo com TV e celular.
  ["internet residencial vivo", 2400], ["vivo residencial internet", 1600], ["internet da vivo residencial", 1300], ["internet residencial da vivo", 170],
  ["tim claro ou vivo", 90], ["vivo ou tim qual a melhor internet", 30],
  ["combo tv internet e celular", 320], ["combo tv e celular", 10],
  // Fora do assunto, cabeça de outro artigo ou busca local: medidas ou não, nunca entram.
  // 2026-10-18 · SUBSTITUÍDO "instalação de internet" (1.900, fixture) aqui: a cabeça da faceta da instalação é da semente
  // curta da faceta (abaixo, com os números REAIS do refazedor) e reforça o Suporte da instalação (não é cabeça do Pilar).
  ["entra na conta do google", 90500], ["qual é o meu cep", 74000], ["primeira fatura claro", 1900],
  ["vivo internet residencial", 22200], ["internet residencial barata sp", 90], ["internet com tv por assinatura", 1000],
];
/*
 * 2026-10-17 (noite) · O GOOGLE ADS SÓ DEVOLVE AS RELACIONADAS PARA A SEMENTE CURTA (o real: 2 ideias para "combo internet
 * tv streaming" + o slug, 6 para "instalação de internet residencial" + o slug). Estas só voltam quando a chamada leva a
 * semente curta da entidade ou da faceta do Assunto — com as sementes antigas, os 3 artigos ficavam sem reforço.
 * Claro e TIM e as de TV são REAIS (execução 4bbcf025); as de instalação e de streaming são de fixture (o Google Ads
 * não foi chamado com estas sementes ainda).
 */
const IDEIAS_POR_SEMENTE: Array<{ semente: string; ideias: Array<[string, number]> }> = [
  { semente: "claro internet residencial", ideias: [["claro internet residencial", 49500], ["claro residencial internet", 1900], ["internet residencial da claro", 210]] },
  { semente: "tim internet residencial", ideias: [["tim internet residencial", 12100], ["tim residencial internet", 480], ["internet residencial da tim", 390]] },
  // "tv box sem internet" (real, 110) nega a entidade central do artigo de TV ("internet"): outra intenção, fica fora e é dita.
  { semente: "combo internet tv", ideias: [["internet e tv residencial", 170], ["tv e internet residencial", 110], ["plano de internet e tv residencial", 110], ["tv box sem internet", 110]] },
  { semente: "combo internet streaming", ideias: [["combo internet e streaming", 210], ["combo de internet e streaming", 50]] },
  { semente: "taxas de instalação de internet", ideias: [["taxa de instalação de internet", 260], ["prazo de instalação de internet", 90], ["primeira fatura de internet", 50]] },
  /*
   * 2026-10-18 · REAIS (refazedor da WifiConecta, 18/10): a semente curta da cabeça da faceta ("instalação de internet")
   * traz a cabeça da PRÓPRIA faceta do Suporte. "internet instalação" e "instalação internet" têm o mesmo volume (880): o
   * Google Ads agrupa as grafias da mesma busca — é uma linha só (RF19).
   */
  { semente: "instalação de internet", ideias: [["internet instalação", 880], ["instalação internet", 880], ["instalação de internet", 720]] },
];
const VOLUME_DA_IDEIA = new Map([...IDEIAS, ...IDEIAS_POR_SEMENTE.flatMap(g => g.ideias)].map(([k, v]) => [normalizeKeyword(k), v]));
// Fora: sem o assunto, local, cabeça mais ampla de um Suporte, a busca com marca num artigo que não nomeia a marca e a palavra própria de outro artigo.
// 2026-10-18 · "instalação de internet" SAIU desta lista (é a cabeça da faceta do t4 e o reforça); entra "instalação internet",
// a mesma linha do Google Ads de "internet instalação" (a mesma busca, o mesmo volume): não ocupa outra vaga.
const FORA = ["entra na conta do google", "qual é o meu cep", "primeira fatura claro", "vivo internet residencial", "internet residencial barata sp", "instalação internet", "combo claro tv internet e celular", "claro internet residencial", "tim internet residencial", "combo tv e celular", "tv box sem internet"];
/**
 * O que cada artigo deve receber (keyword nova → artigo). 2026-10-17 · nos Livres a principal FICA (identidade:
 * está no título e no slug do plano) e é a SERP DELA a paga na primeira coleta; `base` é a secundária de mais volume,
 * que deixou de ser coletada por padrão (continua opcional, para mais evidência).
 * 2026-10-17 (noite) · `novas` é a cópia de trabalho DEPOIS da coleta (a SERP da principal de identidade, no cache, guia
 * o reforço); `previa`, quando difere, é a de antes da coleta (l4: as de TV pedem a SERP dela).
 *  - l1: SUBSTITUÍDO "as 5 variantes": "plano internet residencial" é a terceira grafia da mesma busca — no máximo duas;
 *  - l2: reforço equilibrado por entidade (Claro, Vivo, TIM) e comparações; a Vivo não ocupa mais as 4 vagas;
 *  - l4: as de TV e as de streaming; "combo tv internet e celular" fica no t2 (leva a principal inteira dele);
 *  - t4: as sementes das facetas (taxas, prazo, primeira fatura) trazem o reforço que faltava;
 *  - t4, 2026-10-18 · a cabeça da PRÓPRIA faceta ("instalação de internet" 720 e "internet instalação" 880) reforça o
 *    contexto do Suporte — SUBSTITUÍDO "fica fora como cabeça do Pilar": cabeça do Pilar é só a do núcleo do Pilar/Silo.
 */
const ESPERADO: Record<string, { base?: string; novas: string[]; previa?: string[] }> = {
  t1: { novas: ["preço internet residencial", "internet residencial mais barata"] },
  t2: { novas: ["melhor combo internet e celular", "combo internet e celular vale a pena", "combo tv internet e celular"] },
  t3: { novas: ["operadoras que atendem meu cep", "melhor internet no meu cep"] },
  t4: { novas: ["taxa de instalação de internet", "prazo de instalação de internet", "primeira fatura de internet", "internet instalação", "instalação de internet"] },
  l1: { base: "planos de internet residencial", novas: ["planos de internet residencial", "plano de internet residencial", "melhores planos de internet residencial", "melhor plano de internet residencial"] },
  l2: { base: "internet residencial vivo", novas: ["internet residencial vivo", "claro residencial internet", "tim residencial internet", "tim claro ou vivo", "vivo ou tim qual a melhor internet"] },
  l3: { base: "quantos mega de internet eu preciso", novas: ["quantos mega de internet eu preciso", "quantos mega preciso"] },
  l4: { base: "combo internet e streaming", novas: ["combo internet e streaming", "combo de internet e streaming", "internet com tv por assinatura", "internet e tv residencial", "plano de internet e tv residencial"], previa: ["combo internet e streaming", "combo de internet e streaming"] },
};
const naPrevia = (id: string) => ESPERADO[id].previa ?? ESPERADO[id].novas;
/*
 * 2026-10-17 (noite) · DECISÃO DO DONO: "PILAR TROCA, SUPORTES FICAM". O Pilar (l1) é Livre e sem volume; mesmo com a
 * principal de identidade, ele recebe a proposta do termo-cabeça com volume que leva o núcleo do slug (plano + internet +
 * residencial) e a centralidade: entre "planos de internet residencial" (6.600) e "plano de internet residencial" (2.900)
 * — a mesma busca, as duas levam o núcleo, mesma cauda —, a de mais volume. A outra fica secundária; "como escolher…"
 * fica como o Assunto (âncora), com o título e o slug do plano. Os 3 Suportes de identidade continuam com a principal.
 */
const PILAR_CABECA = "planos de internet residencial";
const SUPORTES_LIVRES = LIVRES.filter(id => id !== "l1");
/*
 * 2026-10-18 · SUBSTITUÍDO "Pilar troca, Suportes ficam" (SDD do Assunto pela principal §6.3-b, cenário Z12): o Suporte de
 * volume 0 ("sem média") também recebe a proposta — a principal nova é a FACETA dele com volume, que leva o núcleo do slug
 * e cabe no Assunto (régua c). No amarelo só o l3 tem essa faceta: "quantos mega de internet eu preciso" (90), a mesma
 * busca de "quantos mega de internet preciso" (sem média). O l2 e o l4 só têm pedaços da principal (cabeças do Pilar ou
 * das operadoras): a principal fica, a prévia diz "Volume 0 sem candidata", e as mais amplas reforçam o contexto.
 */
const SUPORTE_TROCA: Record<string, string> = { l3: "quantos mega de internet eu preciso" };
const SUPORTES_QUE_FICAM = SUPORTES_LIVRES.filter(id => !SUPORTE_TROCA[id]);
/** A principal de cada Livre depois da prévia: o Pilar ganha o termo-cabeça; o l3 a faceta com volume; os outros Suportes ficam. */
const principalDoLivre = (id: string) => id === "l1" ? PILAR_CABECA : SUPORTE_TROCA[id] ?? PLANO.find(l => l.id === id)!.keyword;
/** A SERP paga na primeira coleta: a da principal de cada Livre (a do Pilar é a do termo-cabeça, com volume). */
const SERP_PAGA = LIVRES.map(id => normalizeKeyword(principalDoLivre(id))).sort();

/* ------------------------------------------------------ estado em memória */

const clone = (v: any) => structuredClone(v);
const jsonb = (v: any): any => Array.isArray(v) ? v.map(jsonb) : v && typeof v === "object" ? Object.fromEntries(Object.entries(v).filter(([, x]) => x !== undefined).sort(([p], [q]) => q.length - p.length || (p < q ? 1 : -1)).map(([k, x]) => [k, jsonb(x)])) : v;
const json = (data: any) => new Response(JSON.stringify({ success: true, data }));
/** O Minerador (a tabela da marca) e a mesa do Arquiteto (só as recebidas). */
let minerador: Row[] = [], mesa: Row[] = [];
let gravacoes: Array<{ type: string; status: string; version: any }> = [], journal: any[] = [], assessments: any[] = [], marker: any = null;
let serpEmCache = new Set<string>(), pagas: string[] = [], pago = 0, sementes: string[][] = [], medicoes: string[][] = [], sugestoes: any[] = [], observeFlags: boolean[] = [], parecerPelasSustentacoes: string[] = [];
const chamadas = { import: [] as string[], logic: [] as string[], measure: [] as string[], approve: [] as string[], handoff: [] as string[] };
let proximoId = 0;
const artigos = () => gravacoes.filter(g => g.type === "article_dna").map(g => g.version);
const vigentes = () => { const por = new Map<string, any>(); for (const v of artigos()) if (!por.has(v.entityId) || por.get(v.entityId).versionNumber < v.versionNumber) por.set(v.entityId, v); return [...por.values()]; };
const doMinerador = (id: string) => minerador.find(r => r.id === id);

class Query {
  filters: [string, any][] = [];
  eq(k: string, v: any) { this.filters.push([k, v]); return this; }
  select() { return this; }
  gte() { return this; }
  order() { return this; }
  limit() { return this; }
  matches(r: any) { return this.filters.every(([k, v]) => k.startsWith("payload->>") ? r.payload?.[k.slice(10)] === v : r[k] === v); }
  async maybeSingle() { return { data: clone(journal.find(r => this.matches(r)) ?? null), error: null }; }
  then(resolve: any, reject: any) { return Promise.resolve({ data: journal.filter(r => this.matches(r)).reverse().map(clone), error: null }).then(resolve, reject); }
}
const contexto = () => ({ brandId: MARCA, actorUserId: ATOR, module: "arquiteto", action: "edit", supabase: { from: () => new Query() } }) as any;
const autorizados: string[] = [];
const metrica = (keyword: string, media: number) => ({ keyword, normalizedKeyword: normalizeKeyword(keyword), averageMonthlySearches: media, monthlySearchVolumes: [], competition: null, competitionIndex: null, lowTopOfPageBidMicros: null, highTopOfPageBidMicros: null, averageCpcMicros: null, currencyCode: "BRL", timeZone: "America/Sao_Paulo", targeting: {}, customerId: "******7890", provider: "google_ads", providerVersion: "v25", measuredAt: "2026-10-16T22:00:00.000Z", canonicalKeyword: keyword, closeVariants: [], normalizedCloseVariants: [], matchedRequestedKeywords: [keyword] });
const runtime = () => {
  const context = contexto();
  return {
    context,
    authorize: async (module: string, action: string) => { autorizados.push(`${module}:${action}`); return { ...context, module, action }; },
    // A medição do Google Ads (grátis, cota) da prévia: a confirmação grava ESTA medição (replay), sem consultar de novo.
    measureVolumes: async (keywords: readonly string[]) => {
      medicoes.push([...keywords]);
      return { metrics: keywords.filter(k => VOLUME_DA_IDEIA.has(normalizeKeyword(k))).map(k => ({ metric: metrica(k, VOLUME_DA_IDEIA.get(normalizeKeyword(k))!), requestId: "ads-metricas" })), unmatched: keywords.filter(k => !VOLUME_DA_IDEIA.has(normalizeKeyword(k))) };
    },
  } as any;
};

/* ----------------------------------------------------------- os dublês */

/** O Silo do plano amarelo como o store o devolve; `estado` muda para "consolidated" depois do Concluir (o banco de 18/10). */
const territorioDoPlano = (estado: "confirmed" | "consolidated") => ({ territoryRef: TERRITORIO, lockVersion: estado === "consolidated" ? 4 : 1, territory: { name: "Planos e contratação", lifecycleStatus: estado, centralEntity: "planos de internet", macroIntent: "Informativa", reasons: [], slugState: { publishedSlug: null, confirmed: "planos-e-contratacao", proposals: [] } } });
let territoriosDoStore: any[] = [territorioDoPlano("confirmed")];
const territoriosCriados: any[] = [];
mock.module("../lib/server/arquiteto-territory-store.ts", { namedExports: {
  listTerritoryWorkflowItems: async () => clone(territoriosDoStore),
  // 2026-10-18 · criar território é o defeito do duplicado: fica registrado (e a asserção diz se aconteceu).
  createTerritoryWorkflowItem: async (_c: any, draft: any) => { territoriosCriados.push(clone(draft)); return { territoryRef: "territory:duplicado", lockVersion: 1, territory: { ...clone(draft), territoryRef: "territory:duplicado" } }; },
  updateTerritoryWorkflowItem: async () => { throw new Error("atualizar território não é esperado"); },
} });
/* 2026-10-18 · os grupos (a etiqueta amarela com o plano e o silo_id) para o envio das keywords novas ao Arquiteto. */
let siloDoGrupo: string | null = TERRITORIO;
const ligacoesDoGrupo: string[] = [];
const gruposActual = await import("../lib/editorial/article-groups-store.ts");
mock.module("../lib/editorial/article-groups-store.ts", { namedExports: { ...gruposActual,
  readKeywordGroupInfo: async (_client: any, _brand: string, ids: readonly string[]) => ({ ok: true, info: new Map(ids.map(id => [id, { keyword: doMinerador(id)?.keyword ?? null, groupId: doMinerador(id)?.group_id ?? AMARELO }])) }),
} });
const planosActual = await import("../lib/editorial/editorial-groups-store.ts");
mock.module("../lib/editorial/editorial-groups-store.ts", { namedExports: { ...planosActual,
  listEditorialGroupPlans: async () => ({ ok: true, groups: [{ id: AMARELO, name: "Planos e contratação", color: "amarelo", origin: "declared_plan", status: "active", plan: { siloName: "Planos e contratação", siloSlug: "planos-de-internet", objective: null, articleCount: 8 }, planVersion: 3, planHash: null, siloId: siloDoGrupo, lockVersion: 1 }] }),
  linkEditorialGroupSilo: async (_client: any, input: any) => { ligacoesDoGrupo.push(input.siloId); return { ok: true }; },
} });
mock.module("../lib/arquiteto/canonical-workspace.ts", { namedExports: { buildCanonicalWorkflowWorkspaceItems: (_w: any, k: any) => k } });
const recortado = (filtro: any) => {
  const tudo = { workflowItems: [], keywords: clone(mesa), articleDnas: clone(vigentes()), siloDnas: [] };
  if (!filtro || filtro.kind === "all") return tudo;
  const grupo = (id: string) => doMinerador(id)?.group_id ?? null;
  const dentro = (id: string) => filtro.kind === "none" ? !grupo(id) : grupo(id) === filtro.groupId;
  return { ...tudo, keywords: tudo.keywords.filter((k: any) => dentro(k.id)), articleDnas: tudo.articleDnas.filter((a: any) => a.payload.keywordReferences.some((r: any) => dentro(r.keywordId))) };
};
mock.module("../lib/server/arquiteto-workspace.ts", { namedExports: {
  loadCanonicalArquitetoWorkspace: async (_c: any, options: any = {}) => recortado(options.groupFilter),
  // O envio ao Arquiteto (núcleo do Minerador): a keyword chega à mesa como recebida.
  createMineradorArquitetoHandoff: async (_c: any, ids: string[]) => {
    chamadas.handoff.push(...ids);
    for (const id of ids) {
      const linha = doMinerador(id)!;
      mesa.push({ ...clone(linha), territoryRef: null, isPublished: false, primaryKeywordPolicy: "free", keywordDnaRef: { entityId: id, versionId: `${id}:v1`, contentHash: sha("c") }, canonicalWorkflow: { id: `workflow-${id}`, state: "received", lockVersion: 1, payload: { semanticQualification: { intent: linha.intent }, approvedDna: { analiseSemantica: clone(linha.analise_semantica) } } } });
    }
  },
} });
mock.module("../lib/server/arquiteto-differentiation-store.ts", { namedExports: {
  readDifferentiationBrandKeywords: async () => ({ pages: [], publishedNormalized: new Set(), existingByNormalized: new Map(minerador.map(r => [normalizeKeyword(r.keyword), r.id])), knownVolumeByNormalized: new Map(), rowsRead: minerador.length }),
  readPrincipalSerpVocabulary: async (_c: any, principals: Array<{ keywordId: string; keyword: string }>) => new Map(principals.flatMap(p => { const v = VOCAB[normalizeKeyword(p.keyword)]; return v && serpEmCache.has(normalizeKeyword(p.keyword)) ? [[p.keywordId, { keywordId: p.keywordId, ...v, lenses: 4 }]] : []; })),
  // Cada keyword com a SERP no cache tem o seu próprio top 10 (as 4 lentes); sem SERP, as 4 lentes faltam.
  readPublishedFootprints: async (_c: any, queries: any[]) => ({
    missingLenses: queries.filter(q => !serpEmCache.has(normalizeKeyword(q.keyword))).flatMap(q => SERP_SUBJECT_LENS_LABELS.map(lens => ({ keywordId: q.keywordId, lens, reason: "sem entrada no cache" }))),
    footprints: queries.filter(q => serpEmCache.has(normalizeKeyword(q.keyword))).map(q => ({ ...q, lenses: SERP_SUBJECT_LENS_LABELS.map(lens => ({ lens, urls: Array.from({ length: 10 }, (_, i) => `https://${normalizeKeyword(q.keyword).replace(/\s+/g, "-")}.example.org/p${i}`), domains: null, collectedAt: "2026-10-16T21:00:00.000Z" })) })),
  }),
} });
mock.module("../lib/server/arquiteto-differentiation-runtime.ts", { namedExports: {
  readGoogleAdsAverageVolumes: async () => { throw new Error("a medição vai pela porta measureVolumes do cenário"); },
  proposeArticleImprovementAiPicks: async () => { throw new Error("IA real proibida no cenário"); },
} });
// A rota do parecer: plano (o que falta pagar), coleta paga (só com o autorizado) e a leitura só do cache.
mock.module("../lib/server/arquiteto-serp-http.ts", { namedExports: { handleArchitectFormationSerp: async (req: Request) => {
  const body = await req.json();
  for (const group of body.groups) ProvisionalArticleGroupSchema.parse(group);
  const observavel = (group: any, k: any) => k.id === group.principalSuggestion.keywordId || (k.volume_search ?? 0) > 0;
  if (body.mode === "plan") {
    const faltam = [...new Set(body.groups.flatMap((g: any) => g.keywords.filter((k: any) => observavel(g, k) && !serpEmCache.has(normalizeKeyword(k.keyword))).map((k: any) => normalizeKeyword(k.keyword))))] as string[];
    const detalhes = faltam.flatMap(keyword => SERP_SUBJECT_LENS_LABELS.map(lens => ({ keyword, lens, reason: "sem entrada" })));
    return json({ plan: { paidQueries: detalhes.length, estimatedCostUsd: { min: Number((detalhes.length * 0.002375).toFixed(6)), max: Number((detalhes.length * 0.0035).toFixed(6)) }, missingDetails: detalhes } });
  }
  if (body.authorizedPaidQueries > 0) {
    // Coleta paga: só a principal de cada grupo (os grupos pagos da melhoria são de UMA keyword).
    for (const group of body.groups) for (const k of group.keywords) if (observavel(group, k) && !serpEmCache.has(normalizeKeyword(k.keyword))) { serpEmCache.add(normalizeKeyword(k.keyword)); pagas.push(k.keyword); pago += SERP_SUBJECT_LENS_LABELS.length; }
    return json({});
  }
  assert.equal(body.cacheOnly, true, "nenhuma chamada paga implícita");
  observeFlags.push(body.observeCachedSupportsOnly === true);
  for (const group of body.groups) {
    const principal = group.keywords.find((k: any) => k.id === group.principalSuggestion.keywordId);
    /*
     * D2(a), como a rota real (`selectDeclaredPrincipalSupports`): a principal DECLARADA no plano, sem volume e sem
     * SERP, não é consultada; o parecer vem das sustentações com volume e as 4 lentes no cache. Sem nenhuma, sem parecer.
     */
    const apoios = group.keywords.filter((k: any) => k.id !== principal.id && (k.volume_search ?? 0) > 0 && serpEmCache.has(normalizeKeyword(k.keyword))).sort((a: any, b: any) => b.volume_search - a.volume_search);
    const pelasSustentacoes = !serpEmCache.has(normalizeKeyword(principal.keyword)) && Boolean(principal.analise_semantica?.keyword_declared_principal) && !((principal.volume_search ?? 0) > 0) && apoios.length > 0;
    if (!serpEmCache.has(normalizeKeyword(principal.keyword)) && !pelasSustentacoes) continue; // sem a SERP da principal nem D2a, sem parecer (nada pago)
    const observadas = group.keywords.filter((k: any) => (k.id === principal.id && !pelasSustentacoes) || serpEmCache.has(normalizeKeyword(k.keyword)));
    const supportBasis = pelasSustentacoes ? { kind: "declared_principal_supports", principalKeywordId: principal.id, anchorKeywordId: apoios[0].id, supportKeywordIds: apoios.map((k: any) => k.id), reason: `O parecer vem das sustentações com SERP no cache (${apoios.map((k: any) => k.keyword).join(", ")}).` } : undefined;
    const record = { candidateRef: group.id, payload: { formationBaseHash: body.formationBaseHashes[group.id], verdict: "INCONCLUSIVE", interpretation: { lenses: { perLens: SERP_SUBJECT_LENS_LABELS.map(lens => ({ lens, pairs: [] })), requested: SERP_SUBJECT_LENS_LABELS, observed: SERP_SUBJECT_LENS_LABELS, missing: [] } }, assessment: { id: `assessment:${group.id}`, contentHash: sha("b"), keywordDnaReferences: group.keywordIds.map((keywordId: string) => ({ keywordId })), recommendations: observadas.map((k: any) => ({ keywordId: k.id, currentRole: group.roles[k.id] })), ...(supportBasis ? { supportBasis } : {}) } } };
    if (pelasSustentacoes) parecerPelasSustentacoes.push(principal.keyword);
    assessments = [...assessments.filter(a => a.candidateRef !== group.id), record];
  }
  return json({});
} } });
mock.module("../lib/server/arquiteto-article-serp-store.ts", { namedExports: {
  listArticleFormationSerpAssessments: async () => clone(assessments),
  saveArticleFormationSerpAssessment: async (_c: any, input: any) => { const record = { candidateRef: input.candidateRef, payload: { ...clone(input), humanResolution: null } }; assessments = [...assessments.filter(a => a.candidateRef !== input.candidateRef), record]; return record; },
  resolveArticleFormationSerpAssessment: async (_c: any, input: any) => { const a = assessments.find(item => item.candidateRef === input.candidateRef); a.payload.humanResolution = clone(input.resolution); return a; },
  readbackArticleFormationSerpAssessment: async (_c: any, id: string) => clone(assessments.find(a => a.candidateRef === id)),
  findArticleFormationSerpAssessment: async (_c: any, id: string) => clone(assessments.find(a => a.candidateRef === id)) ?? null,
} });
mock.module("../lib/server/arquiteto-workspace-http.ts", { namedExports: { handleArchitectWorkspacePatch: async (req: Request) => {
  const body = await req.json();
  // A cópia de trabalho do ARQUITETO (item de workflow): nunca a linha do Minerador.
  for (const u of body.updates) { const r = mesa.find(item => item.canonicalWorkflow.id === u.workflowItemId)!; assert.equal(u.expectedLock, r.canonicalWorkflow.lockVersion); Object.assign(r, u.assignment); Object.assign(r.canonicalWorkflow.payload, u.assignment); r.canonicalWorkflow.lockVersion++; }
  return json({});
} } });
mock.module("../lib/server/arquiteto-persistence.ts", { namedExports: { appendArquitetoArtifact: async (_c: any, type: string, version: any, status = "proposed") => {
  if (type === "article_dna") ArticleDNASchema.parse(version.payload);
  gravacoes.push({ type, status, version: clone(version) });
  return { version, status: "PERSISTED" };
} } });
mock.module("../lib/server/arquiteto-article-formation-marker-store.ts", { namedExports: {
  readArticleFormationMarker: async () => clone(marker), saveArticleFormationMarker: async (_c: any, payload: any) => { marker = { payload: clone(payload) }; }, readbackArticleFormationMarker: async () => clone(marker),
} });
mock.module("../lib/server/pipeline-repositories.ts", { namedExports: { WorkflowRepository: class {
  context: any; constructor(c: any) { this.context = c; }
  async create(input: any) { journal.push({ id: `journal-${journal.length}`, marca_id: this.context.brandId, subject_type: input.subjectType, subject_id: input.subjectId, stage: input.stage, payload: jsonb(clone(input.payload)), lock_version: 1 }); }
  async update(id: string, lock: number, input: any) { const r = journal.find(item => item.id === id && item.marca_id === this.context.brandId); assert.equal(r.lock_version, lock); Object.assign(r, { ...clone(input), ...(input.payload ? { payload: jsonb(clone(input.payload)) } : {}) }); r.lock_version++; return { data: clone(r) }; }
} } });
/* Os núcleos do MINERADOR: só podem tocar as linhas que o import da confirmação criou. */
const subjectImportActual = await import("../lib/minerador/subject-discovery-import.ts");
mock.module("../lib/minerador/subject-discovery-import.ts", { namedExports: { ...subjectImportActual, importSubjectDiscoveryWithCore: async (input: any) => {
  const linhas = input.request.items.map((item: any, index: number) => {
    const normalizado = normalizeKeyword(item.keyword);
    assert.ok(!minerador.some(r => normalizeKeyword(r.keyword) === normalizado), `“${item.keyword}” já existia: o Arquiteto não pode importá-la`);
    const id = `nova-${++proximoId}`;
    chamadas.import.push(item.keyword);
    // O grupo do Assunto vai só para a linha NOVA (stampSubjectGroup).
    minerador.push({ id, keyword: item.keyword, brand_id: MARCA, status: "Bruto", intent: "Pendente", volume_search: null, volume_source: null, group_id: AMARELO, analise_semantica: { subject_discovery: { version: 1, searches: [], subjectKeywordIds: input.request.subjectKeywordId ? [input.request.subjectKeywordId] : [] } } });
    return { index, keyword: item.keyword, normalizedKeyword: normalizado, outcome: "created", keywordId: id, reason: null };
  });
  if (input.runLogic) await input.runLogic(linhas.map((l: any) => l.keywordId));
  return { ok: true, importRequestId: input.request.importRequestId, searchId: input.request.searchId, rows: linhas, notAffected: [], counts: {} };
} } });
mock.module("../lib/server/minerador-keyword-decision-core.ts", { namedExports: {
  runKeywordLogicWithCore: async (input: any) => {
    for (const id of input.keywordIds) { const r = doMinerador(id)!; assert.ok(String(id).startsWith("nova-"), "a Lógica só nas criadas"); chamadas.logic.push(id); r.intent = "Informativo"; r.analise_semantica = { ...r.analise_semantica, intencao_principal: "Informativo" }; }
    return { readbackConfirmed: true, missingIds: [], applied: input.keywordIds.length, unchanged: 0, failed: 0 };
  },
  readDecisionKeywords: async (_b: string, ids: string[]) => ({ rows: ids.map(id => clone(doMinerador(id))), missingCount: 0 }),
  keywordDecisionEntries: (rows: any[]) => rows.map(r => ({ keywordId: r.id, keyword: r.keyword, outcome: "approve", blockers: [] })),
  applyKeywordDecisionEntries: async (input: any) => { for (const r of input.rows) { assert.ok(String(r.id).startsWith("nova-"), "a aprovação só nas criadas"); chamadas.approve.push(r.id); doMinerador(r.id)!.status = "aprovado"; } return input.rows.map(() => ({ outcome: "applied" })); },
} });
mock.module("../lib/server/minerador-google-ads-metrics-http.ts", { namedExports: { handleGoogleAdsKeywordMetrics: async (req: Request, _p: any, _c: any, options: any = {}) => {
  assert.ok(options.replay, "a confirmação grava a medição da prévia, sem consultar o Google Ads de novo");
  const body = await req.json();
  const lido = await options.replay({ keywords: body.keywordIds.map((id: string) => doMinerador(id)!.keyword) });
  for (const [i, id] of body.keywordIds.entries()) { assert.ok(String(id).startsWith("nova-")); const r = doMinerador(id)!; r.volume_search = lido.metrics[i].averageMonthlySearches; r.volume_source = "google_ads"; }
  return json({});
} } });
mock.module("../lib/server/minerador-volume-measure.ts", { namedExports: { measureKeywordVolume: async (ctx: any, ids: string[], deps: any = {}) => {
  assert.ok(deps.measure, "sem a medição guardada, o cenário não aceita medir de novo");
  chamadas.measure.push(...ids);
  await deps.measure(new Request("http://localhost/medir", { method: "POST", body: JSON.stringify({ keywordIds: ids }) }), { params: Promise.resolve({ brandId: MARCA }) }, ctx);
  return { outcomes: ids.map(id => { const r = doMinerador(id)!; return { keywordId: id, keyword: r.keyword, outcome: r.volume_source === "google_ads" ? "confirmed" : "failed", volume: r.volume_search }; }) };
} } });
mock.module("../lib/server/google-ads-canonical.ts", { namedExports: {
  resolveGoogleAdsCanonicalContext: async () => ({ customerId: "1234567890", managerCustomerId: null, targeting: null }),
  createGoogleAdsCanonicalClient: async () => ({ client: {} }), targetingToProviderInput: () => ({}), defaultGoogleAdsCanonicalTargeting: () => ({}),
} });
/** 2026-10-17 (noite) · a busca nova que não traz nada (o caso da Livre de identidade sem nenhuma candidata). */
let semIdeias = false;
/** 2026-10-17 (noite) · o Google Ads que não devolve nada para as facetas da instalação (o caso do "adequado" falso). */
let semFacetasDaInstalacao = false;
/** 2026-10-18 · o Google Ads que ainda não devolveu a cabeça da faceta da instalação (o artigo formado com poucas keywords). */
let semCabecaDaInstalacao = false;
mock.module("../lib/google/ads/keyword-ideas.ts", { namedExports: { generateGoogleAdsKeywordIdeas: async (_client: any, input: any) => {
  sementes.push([...input.seed.keywords]);
  const pedidas = new Set((input.seed.keywords as string[]).map(normalizeKeyword));
  const curtas = IDEIAS_POR_SEMENTE.filter(g => pedidas.has(normalizeKeyword(g.semente)) && !(semFacetasDaInstalacao && /instala/.test(g.semente)) && !(semCabecaDaInstalacao && g.semente === "instalação de internet")).flatMap(g => g.ideias);
  return { ideas: semIdeias ? [] : [...IDEIAS, ...curtas].map(([keyword]) => ({ keyword })), nextPageToken: null, requestId: "ads-ideias" };
} } });
mock.module("../lib/server/arquiteto-published-reinforcement.ts", { namedExports: { stableUuid: (...parts: string[]) => { const h = createHash("sha256").update(parts.join("|")).digest("hex"); return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`; } } });
mock.module("../lib/server/arquiteto-minerador-suggestions.ts", { namedExports: { recordArquitetoMineradorSuggestionsSafely: async (_c: any, input: any) => { sugestoes.push(clone(input)); return { recorded: input.drafts.length, recordKey: "registro" }; } } });
const { handleArticleImprovement } = await import("../lib/server/arquiteto-article-improvement.ts");
const { materializeDeclaredPlanSilo } = await import("../lib/server/arquiteto-declared-plan-silo.ts");

/* ---------------------------------------------------------------- a mesa */

function linhaDoPlano(l: LinhaAmarela): Row {
  const semantic = {
    dna_origem: "logico_deterministico", entidade_central: l.entity, intencao_principal: l.intent ?? "Pendente",
    ...(l.volume ? { volume_measurement: { provider: "google_ads", averageMonthlySearches: l.volume, measuredAt: "2026-10-10T10:00:00+00:00" } } : {}),
    // 2026-10-17 · as Livres foram MEDIDAS e o Google Ads não tem número de buscas para elas (T6; "sem média" vale 30 dias, por isso a data é relativa).
    ...(l.volume ? {} : { volume_eligibility: { status: "unavailable", provider: "google_ads", measuredAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(), averageMonthlySearches: null } }),
    keyword_subject: { declared: true, note: null, destinationUrl: null, destinationCheck: null, entry: { title: l.titulo, source: "cadastro" }, plan: { groupId: AMARELO, planVersion: l.lock === "locked" ? 3 : 2, order: l.order, role: l.role, scope: l.scope, slug: l.slug, lock: l.lock, declaredPrincipal: { keywordId: l.id, phrase: l.keyword } } },
    keyword_subject_actor: ATOR, keyword_subject_at: "2026-10-16T10:00:00+00:00", keyword_subject_origin: "import",
    keyword_declared_principal: { subjectKeywordId: l.id, groupId: AMARELO, planVersion: l.lock === "locked" ? 3 : 2 },
  };
  const base = linhaDaMesa({ id: l.id, keyword: l.keyword, brandId: MARCA, semantic }) as Row;
  return {
    ...base, intent: l.intent ?? "Pendente", volume_search: l.volume, volume_source: l.volume ? "google_ads" : "real", group_id: AMARELO,
    isPublished: false, primaryKeywordPolicy: "free", territoryRef: TERRITORIO,
    keywordDnaRef: { entityId: l.id, versionId: `${l.id}:v1`, contentHash: sha("a") },
    canonicalWorkflow: { ...base.canonicalWorkflow, id: `workflow-${l.id}`, lockVersion: 1, payload: { ...base.canonicalWorkflow.payload, semanticQualification: l.intent ? { intent: l.intent } : {} } },
  };
}
/** Os campos que são do Minerador: a confirmação não pode mudar nenhum deles nas 8 originais. */
const doMineradorDe = (r: Row) => JSON.stringify({ keyword: r.keyword, status: r.status, intent: r.intent, volume_search: r.volume_search, volume_source: r.volume_source, group_id: r.group_id, analise_semantica: r.analise_semantica });

function zerar() {
  mesa = PLANO.map(linhaDoPlano);
  minerador = mesa.map(r => ({ id: r.id, keyword: r.keyword, brand_id: MARCA, status: r.status, intent: r.intent, volume_search: r.volume_search, volume_source: r.volume_source, group_id: AMARELO, analise_semantica: clone(r.analise_semantica) }));
  gravacoes = []; journal = []; assessments = []; marker = null; pagas = []; pago = 0; sementes = []; medicoes = []; sugestoes = []; observeFlags = []; parecerPelasSustentacoes = []; semIdeias = false; semFacetasDaInstalacao = false; semCabecaDaInstalacao = false;
  for (const lista of Object.values(chamadas)) lista.length = 0;
  autorizados.length = 0; proximoId = 0;
  territoriosDoStore = [territorioDoPlano("confirmed")]; territoriosCriados.length = 0; siloDoGrupo = TERRITORIO; ligacoesDoGrupo.length = 0;
  // A SERP das 4 lentes da principal de cada Travado já está no cache (coletada em 16/10).
  serpEmCache = new Set(PLANO.filter(l => l.volume).map(l => normalizeKeyword(l.keyword)));
}
const prepare = (extra: Record<string, unknown> = {}) => handleArticleImprovement(runtime(), { brandId: MARCA, action: "prepare", group: AMARELO, ...extra } as any);
async function aplicarTudo(run: any, extra: Record<string, unknown> = {}) {
  let fim = await handleArticleImprovement(runtime(), { brandId: MARCA, action: "apply", runId: run.runId, decisionHash: run.decisionHash, ...extra } as any);
  for (let volta = 0; fim.state !== "complete" && volta < 20; volta += 1) fim = await handleArticleImprovement(runtime(), { brandId: MARCA, action: "apply", runId: run.runId, decisionHash: run.decisionHash } as any);
  return fim;
}
const palavra = (run: any, id: string) => run.keywords.find((k: any) => k.id === id)?.keyword ?? mesa.find(r => r.id === id)?.keyword ?? id;

/* =================================================================== */

test("amarelo · §15 de ponta a ponta: sementes do plano e do DNA, reforço pela SERP da principal em cache, os 4 Livres de identidade FICAM com a principal e recebem as mais amplas como secundárias, a SERP paga é a da principal de identidade de cada Livre (1ª coleta, 16 consultas, até US$ 0,056; a secundária não) e UMA confirmação incorpora tudo sem tocar o que veio do Minerador", async () => {
  zerar();
  const originais = new Map(minerador.map(r => [r.id, doMineradorDe(r)]));

  // 0 · os 4 Travados formam o v1 com 1 keyword (o que aconteceu em 16/10, pela planilha do plano).
  const formacao = await prepare({ targetIds: TRAVADOS, origin: "plan_sheet" });
  assert.deepEqual(formacao.proposals.filter((p: any) => p.status === "ready").map((p: any) => p.targetId).sort(), [...TRAVADOS].sort(), JSON.stringify(formacao.proposals.map((p: any) => [p.targetId, p.status, p.reasons])));
  const v1 = await aplicarTudo(formacao);
  assert.equal(v1.state, "complete", JSON.stringify(v1.outcomes));
  assert.equal(vigentes().length, 4);
  for (const dna of vigentes()) assert.equal(dna.payload.keywordReferences.length, 1, "v1 com uma keyword, como no banco");

  // A · a prévia (grátis): busca nova no Google Ads semeada pelo plano e pelo DNA; nada pago, nada gravado.
  const previa = await prepare({ discover: true });
  assert.equal(pago, 0, "a prévia não paga SERP");
  assert.equal(gravacoes.length, 4, "a prévia não grava artigo");
  assert.deepEqual(chamadas, { import: [], logic: [], measure: [], approve: [], handoff: [] }, "a prévia não toca o Minerador");
  assert.ok(sementes.length > 0 && sementes.length <= 16, `até 2 chamadas por artigo: ${sementes.length}`);
  // Toda chamada semeia do plano ou do DNA: a principal, o slug, a entidade do DNA (a 2ª chamada, quando a 1ª não traz nada novo).
  const doPlanoOuDoDna = new Set(PLANO.flatMap(l => [l.keyword, l.slug.replace(/-/g, " "), l.entity]).map(normalizeKeyword));
  for (const lista of sementes) {
    assert.ok(lista.some(semente => doPlanoOuDoDna.has(normalizeKeyword(semente))), `semente sem o plano nem o DNA: ${JSON.stringify(lista)}`);
    assert.ok(lista.every(semente => !/entra na conta|primeira fatura claro/.test(semente)), "nunca pedaço do título");
  }
  // 2026-10-17 (noite) · as sementes CURTAS saem do plano: uma por entidade do Assunto e uma por faceta depois dos dois-pontos.
  const pedidas = new Set(sementes.flat().map(normalizeKeyword));
  for (const curta of ["claro internet residencial", "vivo internet residencial", "tim internet residencial", "combo internet tv", "combo internet streaming", "instalação de internet", "taxas de instalação de internet", "prazo de instalação de internet", "primeira fatura internet"]) {
    assert.ok(pedidas.has(normalizeKeyword(curta)), `semente curta do plano: “${curta}” (${JSON.stringify(sementes)})`);
  }
  const medidas = medicoes.flat().map(normalizeKeyword);
  // 2026-10-17 (noite) · SUBSTITUÍDO "internet com tv por assinatura nem é medida": ela leva o artigo de TV e streaming com uma
  // palavra fora da linha — é medida (grátis) e a SERP da principal de identidade, coletada depois, decide (entra no l4).
  for (const fora of ["entra na conta do google", "qual é o meu cep", "primeira fatura claro"]) assert.ok(!medidas.includes(normalizeKeyword(fora)), `“${fora}” está fora da linha de copy: nem é medida`);
  assert.ok(medidas.includes(normalizeKeyword("internet com tv por assinatura")), "a que leva o artigo com uma palavra fora da linha é medida");
  const de = (run: any, id: string) => run.proposals.find((p: any) => p.targetId === id);
  for (const id of TRAVADOS) {
    const p = de(previa, id);
    assert.equal(p.status, "ready", `${id}: ${JSON.stringify(p.reasons)}`);
    assert.equal(p.principalId, id, `${id}: Travada, a principal fica`);
    assert.equal(p.evidenceBasis, "copy_line");
    assert.deepEqual(p.addIds.map((k: string) => palavra(previa, k)).sort(), [...ESPERADO[id].novas].sort(), `${id}: ${JSON.stringify(p.reasons)}`);
    assert.ok(p.reasons.some((r: string) => /em cache, grátis|mesma busca da principal|Assunto, slug e DNA/.test(r)), JSON.stringify(p.reasons));
  }
  // 2026-10-17 · Principal de identidade: os 3 Suportes Livres sem volume estão no título e no slug do plano — a principal FICA e as mais amplas reforçam.
  // 2026-10-17 (noite) · SUBSTITUÍDO "os 4 Livres" — o Pilar troca pelo termo-cabeça ("Pilar troca, Suportes ficam", abaixo).
  // 2026-10-18 · o l3 recebe a proposta da faceta com volume (Z12); a "sem média" sai das keywords e fica como o Assunto.
  for (const [id, nova] of Object.entries(SUPORTE_TROCA)) {
    const p = de(previa, id), linha = PLANO.find(l => l.id === id)!;
    assert.equal(palavra(previa, p.principalId), nova, `${id}: a faceta com volume assume (${JSON.stringify(p.reasons)})`);
    assert.ok(!p.memberIds.includes(id), `${id}: a keyword do Assunto sai das keywords (fica como o Assunto)`);
    assert.ok(p.reasons.some((r: string) => r.startsWith(`Assunto pela principal (SDD 2026-10-18): “${linha.keyword}” tem volume 0; “${nova}” (90) assume como principal`)), JSON.stringify(p.reasons));
  }
  for (const id of SUPORTES_QUE_FICAM) {
    const p = de(previa, id), linha = PLANO.find(l => l.id === id)!;
    assert.equal(p.principalId, id, `${id}: a principal de identidade fica (${JSON.stringify(p.reasons)})`);
    assert.deepEqual(p.addIds.map((k: string) => palavra(previa, k)).sort(), [...naPrevia(id)].sort(), `${id}: as mais amplas entram como secundárias (${JSON.stringify(p.reasons)})`);
    assert.deepEqual(p.memberIds.map((k: string) => palavra(previa, k)).sort(), [linha.keyword, ...naPrevia(id)].sort(), `${id}: membros`);
    assert.equal(p.needsValidation, true, `${id}: falta a SERP da principal de identidade (a primeira coleta do artigo, paga)`);
    // 2026-10-18 · SUBSTITUÍDO "Principal de identidade: … fica como principal": o volume 0 libera, mas nenhuma faceta com volume passa na régua c.
    assert.ok(p.reasons.some((r: string) => r.startsWith(`Volume 0 sem candidata: “${linha.keyword}” tem volume 0 e fica livre`)), JSON.stringify(p.reasons));
    assert.ok(!p.reasons.some((r: string) => /assume como principal/.test(r)), `${id}: nenhuma troca proposta`);
    // 2026-10-17 · a prévia de custo por artigo: o propósito, as consultas e o teto; a secundária de mais volume fica opcional.
    const fixo = (texto: string) => texto.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    assert.match(p.reasons.join(" "), new RegExp(fixo(`SERP da principal de identidade “${linha.keyword}” (sem buscas no Google Ads): 4 consultas, até US$ 0,014 — para ver o que o Google mostra para a frase do artigo. É a primeira coleta do artigo no DataForSEO`)));
    assert.match(p.reasons.join(" "), new RegExp(fixo(`A secundária de mais volume (“${ESPERADO[id].base}”) não é coletada por padrão; colete pelo artigo se quiser mais evidência.`)));
    assert.ok(!p.reasons.some((r: string) => /a SERP dela não é coletada/.test(r)), `${id}: SUBSTITUÍDO — a SERP da principal de identidade é coletada`);
  }
  /*
   * 2026-10-17 (noite) · "PILAR TROCA, SUPORTES FICAM": o Pilar sem volume ganha a proposta do termo-cabeça com volume
   * que leva o núcleo do slug ("planos de internet residencial", 6.600); "plano de internet residencial" (2.900), a mesma
   * busca, fica secundária; "como escolher…" sai das keywords e fica como o Assunto (âncora). Proposta, decisão do dono.
   */
  {
    const p = de(previa, "l1"), linha = PLANO.find(l => l.id === "l1")!;
    assert.equal(palavra(previa, p.principalId), PILAR_CABECA, `l1: o termo-cabeça assume (${JSON.stringify(p.reasons)})`);
    assert.equal(p.currentPrimaryId, "l1");
    assert.ok(!p.memberIds.includes("l1"), "a frase do plano sai das keywords (fica como o Assunto)");
    assert.deepEqual(p.memberIds.map((k: string) => palavra(previa, k)).sort(), [...naPrevia("l1")].sort(), "l1: membros = o termo-cabeça e as secundárias");
    assert.ok(p.memberIds.some((k: string) => palavra(previa, k) === "plano de internet residencial"), "a outra variante fica secundária");
    const motivo = p.reasons.join(" ");
    assert.match(motivo, /Pilar sem volume troca pelo termo-cabeça: “planos de internet residencial” \(6600\) assume como principal do Pilar — é o termo-cabeça com volume que leva o núcleo do slug \(plano \+ internet \+ residencial\) e a centralidade do Silo/);
    assert.match(motivo, /“plano de internet residencial” \(2900\) é a mesma busca e fica como secundária/);
    assert.match(motivo, new RegExp(`“${linha.keyword}” continua no artigo como o Assunto \\(âncora\\), e o título e o slug do plano ficam\\. Proposta: decisão sua na prévia`));
    assert.ok(!motivo.includes(`Principal de identidade: “${linha.keyword}”`), "o Pilar não ouve 'fica como principal'");
    assert.equal(p.needsValidation, true, "falta a SERP do termo-cabeça (a primeira coleta do Pilar, paga, custo antes)");
  }
  for (const p of previa.proposals) for (const id of p.memberIds) assert.ok(!FORA.includes(palavra(previa, id)), `${p.targetId}: “${palavra(previa, id)}” não podia entrar`);
  // Regras do Silo (2026-10-17): as variantes da MESMA busca vão todas para o Pilar; a busca com marca só vai para o artigo que nomeia as operadoras.
  const ondeEsta = (texto: string) => previa.proposals.filter((p: any) => p.memberIds.some((id: string) => palavra(previa, id) === texto)).map((p: any) => p.targetId);
  assert.deepEqual(ondeEsta("planos de internet residencial"), ["l1"]);
  assert.deepEqual(ondeEsta("plano de internet residencial"), ["l1"]);
  assert.deepEqual(ondeEsta("plano internet residencial"), [], "2026-10-17 (noite) · a terceira grafia da mesma busca não entra em nenhum artigo");
  assert.deepEqual(ondeEsta("vivo internet residencial"), [], "cabeça de 22.200 num Suporte: fica fora (só o Pilar recebe a cabeça mais ampla)");
  assert.deepEqual(ondeEsta("combo claro tv internet e celular"), [], "marca num artigo que não nomeia a operadora: fora");
  /*
   * 2026-10-17 (noite) · ASSUNTO COMPARATIVO COM VÁRIAS ENTIDADES ("Claro, Vivo ou TIM"): uma de cada operadora e as
   * comparações; as 4 grafias da mesma busca da Vivo não ocupam mais o artigo (no máximo 2, e a Vivo só tem a parte dela);
   * as cabeças de cada operadora (49.500, 22.200, 12.100) ficam fora num Suporte.
   */
  for (const texto of ["internet residencial vivo", "claro residencial internet", "tim residencial internet", "tim claro ou vivo"]) assert.deepEqual(ondeEsta(texto), ["l2"], texto);
  const daVivo = de(previa, "l2").memberIds.filter((id: string) => /vivo/.test(palavra(previa, id)) && !/claro|tim/.test(palavra(previa, id)));
  assert.equal(daVivo.length, 1, `uma só da Vivo: ${JSON.stringify(daVivo.map((id: string) => palavra(previa, id)))}`);
  for (const texto of ["vivo residencial internet", "internet da vivo residencial", "internet residencial da vivo"]) assert.deepEqual(ondeEsta(texto), [], `${texto}: a mesma busca da Vivo já está no artigo`);
  // TV + celular + internet: "combo tv internet e celular" leva a principal INTEIRA do t2 ("combo internet e celular") e só acrescenta "tv" — fica no t2;
  // "combo tv e celular" leva "celular", a palavra própria do t2, sem a principal de ninguém: não reforça o l4.
  assert.deepEqual(ondeEsta("combo tv internet e celular"), ["t2"]);
  assert.deepEqual(ondeEsta("combo tv e celular"), []);
  // A conta paga (2026-10-17, régua única): só a primeira SERP da PRINCIPAL DE IDENTIDADE de cada Livre (4 lentes cada) = 16 consultas,
  // até US$ 0,056 (US$ 0,014 por artigo). A secundária de mais volume não entra por padrão (evita o gasto duplo).
  // 2026-10-17 (noite) · a do Pilar é a SERP do termo-cabeça (com volume): "como escolher…" deixa de ser a principal e não é paga.
  assert.equal(previa.costs.paidQueries, 16, JSON.stringify(previa.costs.missingDetails));
  assert.deepEqual([...new Set(previa.costs.missingDetails.map((d: any) => d.keyword))].sort(), SERP_PAGA);
  assert.ok(!previa.costs.missingDetails.some((d: any) => SUPORTES_QUE_FICAM.some(id => normalizeKeyword(ESPERADO[id].base!) === d.keyword)), "a secundária de mais volume não é coletada por padrão");
  assert.equal(previa.costs.estimatedCostUsd.max, 0.056);
  assert.ok(observeFlags.length > 0 && observeFlags.every(Boolean), "o parecer pelo cache sai pela SERP da principal (apoio sem SERP fica não observado)");
  assert.equal(sugestoes.length, 0, "keyword nova não vira 'Sugestões do Arquiteto'");

  // A · preparar de novo com os mesmos insumos: a MESMA rodada continua (nada a refazer), sem chamada nova.
  const chamadasAntes = sementes.length;
  const deNovo = await prepare({ discover: true });
  assert.equal(deNovo.runId, previa.runId, "a mesma rodada");
  assert.equal(sementes.length, chamadasAntes, "a busca não é repetida");
  assert.match(deNovo.rework?.message ?? "", /parou antes da coleta paga da SERP \(16 consulta\(s\) no DataForSEO\)\. Não há nada a refazer/);

  // B · a coleta paga, com a autorização: só a principal de identidade de cada Livre (a frase do artigo).
  let coleta = await handleArticleImprovement(runtime(), { brandId: MARCA, action: "collect", runId: previa.runId, decisionHash: previa.decisionHash, authorizedCostUsd: 0.06 } as any);
  for (let volta = 0; coleta.state === "collecting" && volta < 10; volta += 1) coleta = await handleArticleImprovement(runtime(), { brandId: MARCA, action: "collect", runId: previa.runId, decisionHash: coleta.decisionHash } as any);
  assert.equal(coleta.state, "prepared");
  assert.equal(pago, 16);
  assert.deepEqual(pagas.map(normalizeKeyword).sort(), SERP_PAGA, "só a SERP da principal de cada Livre (a de identidade dos Suportes; o termo-cabeça do Pilar); nenhuma secundária nem candidata foi paga");
  for (const id of [...TRAVADOS, ...LIVRES]) assert.equal(de(coleta, id).status, "ready", `${id}: ${JSON.stringify(de(coleta, id).reasons)}`);
  // 2026-10-17 (noite) · com a SERP da principal de identidade no cache, o vocabulário DELA guia o reforço (l4: as de TV entram).
  for (const id of [...TRAVADOS, ...LIVRES]) assert.deepEqual(de(coleta, id).addIds.map((k: string) => palavra(coleta, k)).sort(), [...ESPERADO[id].novas].sort(), `${id} depois da coleta: ${JSON.stringify(de(coleta, id).reasons)}`);
  assert.ok(!de(coleta, "l4").memberIds.some((id: string) => /celular/.test(palavra(coleta, id))), "o l4 não leva a palavra própria do t2");
  // A candidata que NEGA a entidade do artigo ("sem internet") fica fora, antes e depois da coleta, e a prévia diz por quê.
  for (const run of [previa, coleta]) {
    assert.ok(!run.proposals.some((p: any) => p.memberIds.some((id: string) => palavra(run, id) === "tv box sem internet")), "“tv box sem internet” não entra em artigo nenhum");
    assert.match(de(run, "l4").reasons.join(" "), /“tv box sem internet” \(110\) fica fora: contradiz o Assunto: sem internet\./);
  }
  // O artigo forma com a principal de identidade SEM volume e o parecer usa a SERP DELA (não é mais D2a), sem trocar a principal.
  assert.deepEqual(parecerPelasSustentacoes, [], "com a SERP da principal de identidade no cache, o parecer usa ela");
  for (const [id, nova] of Object.entries(SUPORTE_TROCA)) assert.equal(palavra(coleta, de(coleta, id).principalId), nova, id + ": a faceta com volume continua proposta depois da coleta");
  for (const id of SUPORTES_QUE_FICAM) assert.equal(de(coleta, id).principalId, id, `${id}: a principal fica depois da coleta`);
  assert.equal(palavra(coleta, de(coleta, "l1").principalId), PILAR_CABECA, "l1: o Pilar continua com a proposta do termo-cabeça depois da coleta");
  assert.deepEqual(chamadas, { import: [], logic: [], measure: [], approve: [], handoff: [] }, "a coleta não toca o Minerador");

  // C · UMA confirmação: sem o aceite explícito das novas, nada é gravado.
  await assert.rejects(() => handleArticleImprovement(runtime(), { brandId: MARCA, action: "apply", runId: previa.runId, decisionHash: coleta.decisionHash } as any), /approveNewKeywords/);
  assert.equal(chamadas.import.length, 0); assert.equal(gravacoes.length, 4);
  const fim = await aplicarTudo({ runId: previa.runId, decisionHash: coleta.decisionHash }, { approveNewKeywords: true });
  assert.equal(fim.state, "complete", JSON.stringify(fim.outcomes));
  assert.ok(fim.outcomes.every((o: any) => o.status === "improved" || o.status === "dna_created"), JSON.stringify(fim.outcomes));
  for (const permissao of ["minerador:create", "minerador:edit", "minerador:approve", "arquiteto:create", "arquiteto:approve"]) assert.ok(autorizados.includes(permissao), `pediu ${permissao}`);
  // Entraram as novas (2026-10-18: mais as 2 da cabeça da faceta da instalação) — e só elas — pelos núcleos do Minerador.
  const todasNovas = Object.values(ESPERADO).flatMap(e => e.novas);
  assert.deepEqual([...chamadas.import].sort(), [...new Set(todasNovas)].sort());
  for (const lista of [chamadas.logic, chamadas.measure, chamadas.approve, chamadas.handoff] as string[][]) assert.ok(lista.length === todasNovas.length && lista.every(id => id.startsWith("nova-")), JSON.stringify(lista));
  assert.equal(pago, 16, "a confirmação não paga nada");
  // Os 8 ArticleDNAs: Travados v2 com as novas como secundárias; Livres v1 com a principal de identidade (sem volume), as mais amplas, o Assunto e o slug do plano.
  const porAssunto = new Map(vigentes().map(v => [v.payload.subject?.keywordId, v.payload]));
  for (const l of PLANO) {
    const dna = porAssunto.get(l.id);
    assert.ok(dna, `${l.id}: artigo gravado`);
    const textos = dna.keywordReferences.map((r: any) => mesa.find(m => m.id === r.keywordId)?.keyword);
    if (l.id === "l1") {
      // 2026-10-17 (noite) · o Pilar grava com o termo-cabeça como principal; a frase do plano é o Assunto (fora das seis), com o slug do plano.
      assert.equal(mesa.find(m => m.id === dna.principalKeywordId)?.keyword, PILAR_CABECA, "l1: o termo-cabeça é a principal");
      assert.ok(!textos.includes(l.keyword), "l1: a frase do plano não é keyword do artigo (é o Assunto)");
      assert.equal(dna.subject?.keywordId, "l1", "l1: a frase do plano fica como o Assunto (âncora)");
      assert.deepEqual([...textos].sort(), [...ESPERADO.l1.novas].sort());
      assert.ok(dna.serpAssessmentRef, "l1: aprovado com o parecer da SERP do termo-cabeça");
      assert.equal(dna.suggestedSlug, l.slug, "l1: o slug do plano fica");
      assert.equal(dna.hierarchy, l.role);
      assert.equal(dna.promise, l.scope);
      continue;
    }
    // 2026-10-18 · Z12: o l3 grava com a faceta com volume como principal; a "sem média" fica como o Assunto (fora das seis), com o slug do plano.
    if (SUPORTE_TROCA[l.id]) {
      assert.equal(mesa.find(m => m.id === dna.principalKeywordId)?.keyword, SUPORTE_TROCA[l.id], `${l.id}: a faceta com volume é a principal`);
      assert.ok(!textos.includes(l.keyword), `${l.id}: a keyword do Assunto não é keyword do artigo`);
      assert.equal(dna.subject?.keywordId, l.id, `${l.id}: fica como o Assunto`);
      assert.equal(dna.suggestedSlug, l.slug, `${l.id}: o slug do plano fica`);
      assert.ok(dna.serpAssessmentRef, `${l.id}: aprovado com o parecer`);
      continue;
    }
    assert.equal(dna.principalKeywordId, l.id, `${l.id}: a principal continua a mesma (Travada, ou Suporte Livre de identidade)`);
    assert.deepEqual(textos.filter((t: string) => t !== l.keyword).sort(), [...ESPERADO[l.id].novas].sort());
    if (l.lock === "free") {
      assert.ok(textos.includes(l.keyword), `${l.id}: a principal de identidade está entre as keywords`);
      assert.ok(dna.serpAssessmentRef, `${l.id}: aprovado com o parecer da SERP da principal de identidade`);
      assert.equal(dna.suggestedSlug, l.slug, `${l.id}: o slug do plano fica`);
    }
    assert.equal(dna.hierarchy, l.role, `${l.id}: hierarquia = papel do plano`);
    assert.equal(dna.promise, l.scope, `${l.id}: promessa = detalhes do plano`);
  }
  // Guarda: nada que veio do Minerador foi escrito (as 8 originais byte a byte, nos campos do Minerador).
  for (const [id, antes] of originais) assert.equal(doMineradorDe(doMinerador(id)!), antes, `${id}: o Arquiteto mexeu em keyword do Minerador`);
  assert.equal(sugestoes.length, 0);
  assert.equal(chamadasDeRede, 0);
});

test("amarelo · guarda: a ideia que JÁ existe no Minerador (qualquer status) é só lida — nunca importada, medida, processada nem aprovada; e sem a permissão de aprovar no Minerador nada é gravado", async () => {
  zerar();
  // "melhor internet no meu cep" já existe no Minerador (bruta, outro status, sem volume, não enviada ao Arquiteto).
  minerador.push({ id: "ja-existe", keyword: "melhor internet no meu cep", brand_id: MARCA, status: "Bruto", intent: "Pendente", volume_search: null, volume_source: null, group_id: null, analise_semantica: { nota: "do dono" } });
  const antes = doMineradorDe(doMinerador("ja-existe")!);
  const previa = await prepare({ discover: true });
  const t3 = previa.proposals.find((p: any) => p.targetId === "t3")!;
  assert.ok(!t3.memberIds.some((id: string) => palavra(previa, id) === "melhor internet no meu cep"), "sem volume conhecido e já no Minerador: não entra pelo Arquiteto");
  assert.ok(!medicoes.flat().map(normalizeKeyword).includes(normalizeKeyword("melhor internet no meu cep")), "nunca medida de novo pelo Arquiteto");
  assert.ok(previa.keywords.some((k: any) => k.knownInMinerador?.keywordId === "ja-existe" || normalizeKeyword(k.keyword) !== normalizeKeyword("melhor internet no meu cep")));
  // Sem a permissão de aprovar no Minerador, a confirmação recusa ANTES de escrever.
  const semAprovar: any = { ...runtime(), authorize: async (module: string, action: string) => { if (module === "minerador" && action === "approve") throw new Error("sem permissão"); return { ...contexto(), module, action }; } };
  const prontas = previa.proposals.filter((p: any) => p.status === "ready").map((p: any) => p.targetId);
  assert.ok(prontas.length > 0);
  assert.ok(previa.proposals.filter((p: any) => p.status === "ready").some((p: any) => p.addIds.some((id: string) => previa.keywords.find((k: any) => k.id === id)?.external)), JSON.stringify(previa.proposals.map((p: any) => [p.targetId, p.status, p.addIds.map((id: string) => palavra(previa, id))])));
  await assert.rejects(() => handleArticleImprovement(semAprovar, { brandId: MARCA, action: "apply", runId: previa.runId, decisionHash: previa.decisionHash, targetIds: prontas, approveNewKeywords: true } as any), /minerador:approve/);
  assert.deepEqual(chamadas, { import: [], logic: [], measure: [], approve: [], handoff: [] });
  assert.equal(gravacoes.length, 0);
  assert.equal(doMineradorDe(doMinerador("ja-existe")!), antes);
});

/* =================================================================== */
/*
 * 2026-10-17 (noite) · O DONO, depois do deploy, no amarelo: "o arquiteto ainda não está cumprindo o papel dele… ficou
 * travado… Estes dois botões ficam sem estar habilitados: Reprocessar artigos, Concluir formação… cadê as keywords de
 * reforço?… 3 botões já é suficiente… na mesma linha de processo". O caminho EXATO dos 3 botões da barra (as 8 linhas do
 * plano marcadas, `origin: "plan_sheet"`): Processar = a leitura com o reforço (Google Ads, grátis) e o custo da SERP
 * das principais de identidade → a coleta (a única confirmação do Processar) → Concluir = o checklist e UMA
 * confirmação → o Silo do plano fecha no mesmo ato. O estado de partida é o do banco (SELECT de 17/10): os 4 Travados
 * com v1 só com a principal; os 4 Livres sem ArticleDNA.
 */
const linhaDaPlanilha = (l: LinhaAmarela) => {
  const dna = vigentes().find(v => v.payload.subject?.keywordId === l.id);
  return {
    keywordId: l.id, keyword: l.keyword, groupId: AMARELO, role: l.role, order: l.order,
    formation: dna ? { state: "formed" as const, version: dna.versionNumber, articleId: dna.payload.articleId, principalKeywordId: dna.payload.principalKeywordId, label: `Formado · v${dna.versionNumber}` } : { state: "awaiting" as const, version: null, articleId: null, principalKeywordId: null, label: "Aguardando formação" },
    lock: { state: l.lock, label: l.lock === "locked" ? "Travada" : "Livre", why: "" },
    ...(l.lock === "free" ? { identityPrincipal: true } : {}),
  };
};
const processadasDe = (run: any) => new Set<string>([...run.proposals.filter((p: any) => !p.needsValidation).map((p: any) => p.targetId), ...(run.refusedTargets ?? []).map((r: any) => r.id)]);
async function coletar(run: any) {
  let coleta = await handleArticleImprovement(runtime(), { brandId: MARCA, action: "collect", runId: run.runId, decisionHash: run.decisionHash, authorizedCostUsd: run.costs.estimatedCostUsd.max } as any);
  for (let volta = 0; coleta.state === "collecting" && volta < 10; volta += 1) coleta = await handleArticleImprovement(runtime(), { brandId: MARCA, action: "collect", runId: run.runId, decisionHash: coleta.decisionHash } as any);
  return coleta;
}

test("amarelo · OS 3 BOTÕES pela barra: Processar (reforço grátis + custo da SERP das 4 principais de identidade, 16 consultas, até US$ 0,056) → coleta → reforço para os 8 → Concluir (checklist ✓, UMA confirmação) → 4 v1 + 4 v2, novas incorporadas, originais intactas, Silo pronto no mesmo ato e do grupo amarelo → o refazedor é o passo seguinte", async () => {
  zerar();
  const originais = new Map(minerador.map(r => [r.id, doMineradorDe(r)]));
  const v1 = await aplicarTudo(await prepare({ targetIds: TRAVADOS, origin: "plan_sheet" }));
  assert.equal(v1.state, "complete", "o estado do banco: os 4 Travados com v1");
  const versoesAntes = new Map(vigentes().map(v => [v.payload.subject?.keywordId, v.versionNumber]));
  const linhas = PLANO.map(linhaDaPlanilha);
  assert.equal(planSheetSequence({ rows: linhas, processedIds: new Set(), pendingIds: new Set() }).step, "process", "(a) no começo, só o Processar é o passo");

  // 1 · PROCESSAR ARTIGOS — o MESMO pedido da barra para as 8 linhas.
  const processado = await prepare({ targetIds: PLANO.map(l => l.id), origin: "plan_sheet", discover: true });
  assert.equal(processado.origin, "plan_sheet");
  assert.equal(processado.discovery?.requested, true, "a busca do reforço roda sozinha (sem o botão 'Buscar keywords novas no Google Ads')");
  assert.ok(sementes.length > 0);
  assert.equal(gravacoes.length, 4, "Processar não grava artigo");
  assert.deepEqual(chamadas, { import: [], logic: [], measure: [], approve: [], handoff: [] }, "Processar não toca o Minerador");
  assert.equal(processado.costs.paidQueries, 16);
  assert.equal(processado.costs.estimatedCostUsd.max, 0.056);
  assert.deepEqual([...new Set(processado.costs.missingDetails.map((d: any) => d.keyword))].sort(), SERP_PAGA, "a SERP paga é só a da principal de cada Livre (a do Pilar: o termo-cabeça)");
  assert.match(processado.reading?.sentences.missing ?? "", /^Falta: 16 consulta\(s\) de SERP/, "nunca 'Falta: nada' com a SERP por pagar");
  const copia = planSheetWorkingCopyLines(processado, linhas);
  for (const id of TRAVADOS) assert.match(copia.find(c => c.keywordId === id)!.text, /^Cópia de trabalho \(nada gravado\): principal “.+” \(Travada, fica\) · secundárias: .*, nova\)/, id);
  for (const [id, nova] of Object.entries(SUPORTE_TROCA)) assert.ok(copia.find(c => c.keywordId === id)!.text.includes("principal “" + nova + "” (troca proposta: “" + PLANO.find(l => l.id === id)!.keyword + "” → esta; decisão sua)"), copia.find(c => c.keywordId === id)!.text);
  for (const id of SUPORTES_QUE_FICAM) assert.match(copia.find(c => c.keywordId === id)!.text, /\(identidade, fica\) · secundárias: .*\. Falta a SERP da principal: “Processar artigos” coleta, com o custo antes\.$/, id);
  // 2026-10-17 (noite) · o Pilar: a troca proposta pelo termo-cabeça, na cópia de trabalho (nada gravado; decisão do dono).
  assert.match(copia.find(c => c.keywordId === "l1")!.text, /principal “planos de internet residencial” \(troca proposta: “como escolher plano de internet residencial” → esta; decisão sua\) · secundárias: .*“plano de internet residencial”/);
  assert.equal(planSheetSequence({ rows: linhas, processedIds: processadasDe(processado), pendingIds: new Set() }).step, "process", "com a SERP por pagar, o passo 1 não terminou para os Livres");

  const coleta = await coletar(processado);
  assert.equal(coleta.state, "prepared");
  assert.equal(pago, 16);
  for (const p of coleta.proposals) assert.equal(p.status, "ready", `${p.targetId}: ${JSON.stringify(p.reasons)}`);
  const pendentes = new Set<string>(coleta.proposals.filter((p: any) => p.status === "ready").map((p: any) => p.targetId));
  assert.equal(planSheetSequence({ rows: linhas, processedIds: processadasDe(coleta), pendingIds: pendentes }).step, "conclude", "(b) depois do Processar, o Concluir é o passo");

  // 2 · CONCLUIR FORMAÇÃO — a prévia e o checklist da finalização.
  const previa = planSheetPreviewLines(coleta, linhas);
  assert.ok(previa.every(l => l.kind === "will_write"), JSON.stringify(previa));
  for (const id of TRAVADOS) assert.match(previa.find(l => l.keywordId === id)!.sentence, /^Vai gravar: nova versão \(v2\) · principal/, id);
  for (const [id, nova] of Object.entries(SUPORTE_TROCA)) assert.ok(previa.find(l => l.keywordId === id)!.sentence.startsWith("Vai gravar: primeiro ArticleDNA (v1) · principal “" + nova + "” (troca proposta"), previa.find(l => l.keywordId === id)!.sentence);
  for (const id of SUPORTES_QUE_FICAM) assert.match(previa.find(l => l.keywordId === id)!.sentence, /^Vai gravar: primeiro ArticleDNA \(v1\) · principal “.+” \(identidade, fica\)/, id);
  assert.match(previa.find(l => l.keywordId === "l1")!.sentence, /^Vai gravar: primeiro ArticleDNA \(v1\) · principal “planos de internet residencial” \(troca proposta: “como escolher plano de internet residencial” → esta; decisão sua\)/);
  assert.ok(previa.every(l => !/Procurar outra principal|Buscar sustentação/.test(l.sentence)), "a regra da principal de identidade chega ao Concluir");
  const checklist = planSheetConclusionChecklist({ lines: previa, rows: linhas, proposals: coleta.proposals, groupRows: linhas });
  assert.deepEqual(checklist.map(item => [item.key, item.ok]), [["principal", true], ["reforco", true], ["serp", true], ["plano", true], ["silo", true]], JSON.stringify(checklist));
  assert.match(checklist.find(item => item.key === "silo")!.detail, /^fecha neste ato/);
  const fim = await aplicarTudo({ runId: processado.runId, decisionHash: coleta.decisionHash }, { approveNewKeywords: true });
  assert.equal(fim.state, "complete", JSON.stringify(fim.outcomes));
  assert.equal(pago, 16, "a confirmação não paga nada");
  const dnas = vigentes();
  assert.equal(dnas.length, 8);
  for (const l of PLANO) {
    const dna = dnas.find(v => v.payload.subject?.keywordId === l.id)!;
    assert.ok(dna, l.id);
    assert.equal(dna.versionNumber, l.lock === "locked" ? versoesAntes.get(l.id)! + 1 : 1, `${l.id}: ${l.lock === "locked" ? "v2 (reforço)" : "v1"}`);
    if (l.id === "l1") assert.equal(mesa.find(m => m.id === dna.payload.principalKeywordId)?.keyword, PILAR_CABECA, "l1: o Pilar grava com o termo-cabeça");
    else if (SUPORTE_TROCA[l.id]) assert.equal(mesa.find(m => m.id === dna.payload.principalKeywordId)?.keyword, SUPORTE_TROCA[l.id], `${l.id}: grava com a faceta com volume (Z12)`);
    else assert.equal(dna.payload.principalKeywordId, l.id, `${l.id}: a principal fica (Travada ou Suporte de identidade)`);
    assert.ok(dna.payload.keywordReferences.length > 1, `${l.id}: com reforço`);
    assert.equal(dna.payload.hierarchy, l.role);
    assert.ok(dna.payload.serpAssessmentRef, `${l.id}: aprovado com o parecer`);
  }
  assert.ok(chamadas.import.length > 0 && chamadas.handoff.length === chamadas.import.length && (chamadas.handoff as unknown[]).every(id => String(id).startsWith("nova-")), "só as novas pelos núcleos do Minerador");
  for (const [id, antes] of originais) assert.equal(doMineradorDe(doMinerador(id)!), antes, `${id}: o Arquiteto mexeu em keyword do Minerador`);
  assert.equal(sugestoes.length, 0);

  // O Silo do plano fecha no MESMO ato (a tela grava o par pelo fechamento canônico): pronto, Pilar "como escolher…", a ordem do plano; e é do grupo amarelo.
  const fechamento = planGroupSiloClosure({ planRows: PLANO.map(l => ({ keywordId: l.id, keyword: l.keyword, role: l.role, order: l.order })), articles: dnas.map(v => ({ articleId: v.payload.articleId, subjectKeywordId: v.payload.subject?.keywordId ?? null, territoryRef: v.payload.territoryRef ?? null })) });
  assert.equal(fechamento.state, "ready", JSON.stringify(fechamento));
  if (fechamento.state === "ready") {
    assert.equal(fechamento.territoryRef, TERRITORIO);
    assert.equal(fechamento.pillarArticleId, dnas.find(v => v.payload.subject?.keywordId === "l1")!.payload.articleId);
    assert.deepEqual(fechamento.orderedArticleIds, [...PLANO].sort((a, b) => a.order - b.order).map(l => dnas.find(v => v.payload.subject?.keywordId === l.id)!.payload.articleId));
  }
  const grupo = resolveSiloDeclaredGroup({ articles: dnas.map(v => ({ articleId: v.payload.articleId, subjectKeywordId: v.payload.subject?.keywordId ?? null })), keywordGroupById: new Map(PLANO.map(l => [l.id, AMARELO])) });
  assert.equal(grupo.groupId, AMARELO, "a consolidação de sempre liga o grupo amarelo ao Silo (linkDeclaredPlanGroupToSilo, depois do readback)");
  assert.equal(planSheetSequence({ rows: PLANO.map(linhaDaPlanilha), processedIds: new Set(), pendingIds: new Set() }).step, "improve", "(c) depois do Concluir, o refazedor é o passo");
  assert.equal(chamadasDeRede, 0);
});

test("amarelo · a Livre de IDENTIDADE sem nenhuma candidata (a busca nova não traz nada) forma só com a principal: a SERP dela é a coleta paga e o Concluir NÃO a recusa (a causa do 'use Procurar outra principal' nos 4 Livres, 17/10)", async () => {
  zerar(); semIdeias = true;
  const processado = await prepare({ targetIds: LIVRES, origin: "plan_sheet", discover: true });
  for (const id of LIVRES) {
    const p = processado.proposals.find((x: any) => x.targetId === id)!;
    assert.equal(p.principalId, id, `${id}: a principal de identidade fica`);
    assert.deepEqual(p.memberIds, [id], `${id}: forma só com a principal (antes: zero membros, "evidência insuficiente")`);
    assert.equal(p.needsValidation, true, `${id}: falta a SERP da principal`);
    assert.match(p.reasons.join(" "), /SERP da principal de identidade “.+” \(sem buscas no Google Ads\): 4 consultas, até US\$ 0,014/);
    assert.match(p.reasons.join(" "), /sem reforço novo nesta leitura/);
  }
  assert.equal(processado.costs.paidQueries, 16);
  const linhas = PLANO.filter(l => l.lock === "free").map(linhaDaPlanilha);
  assert.ok(planSheetPreviewLines(processado, linhas).every(l => l.kind === "needs_serp" && !/Procurar outra principal/.test(l.sentence)));
  const coleta = await coletar(processado);
  for (const p of coleta.proposals) assert.equal(p.status, "ready", `${p.targetId}: ${JSON.stringify(p.reasons)}`);
  const fim = await aplicarTudo({ runId: processado.runId, decisionHash: coleta.decisionHash });
  assert.equal(fim.state, "complete", JSON.stringify(fim.outcomes));
  for (const id of LIVRES) {
    const dna = vigentes().find(v => v.payload.subject?.keywordId === id)!;
    assert.deepEqual(dna.payload.keywordReferences.map((r: any) => r.keywordId), [id]);
    assert.ok(dna.payload.serpAssessmentRef, `${id}: aprovado com o parecer da SERP da principal de identidade`);
  }
  assert.deepEqual(chamadas.import, [], "sem keyword nova, nada no Minerador");
  assert.equal(chamadasDeRede, 0);
});

/*
 * 2026-10-17 (noite) · TESTE DO COORDENADOR NO AR: "Instalação de internet: taxas, prazo e quando chega a primeira fatura"
 * (Travada, 170) saiu "Já formado e adequado: nada a gravar" com 1 keyword só — a busca não tinha achado reforço (as
 * sementes eram a principal e o slug inteiros). "Adequado" só com reforço suficiente: com vaga e nada achado, a linha diz
 * "Sem keyword de reforço encontrada" e o motivo; com a semente curta da faceta, o reforço vem e a linha grava.
 */
test("amarelo · 'adequado' só com reforço suficiente: a Travada da instalação sem ideia que caiba diz 'Sem keyword de reforço encontrada' e o motivo (nunca 'Já formado e adequado'); com a semente da faceta, o reforço vem", async () => {
  zerar(); semFacetasDaInstalacao = true;
  const v1 = await aplicarTudo(await prepare({ targetIds: TRAVADOS, origin: "plan_sheet" }));
  assert.equal(v1.state, "complete", JSON.stringify(v1.outcomes));
  const t4 = PLANO.find(l => l.id === "t4")!;
  const sem = await prepare({ targetIds: ["t4"], origin: "plan_sheet", discover: true });
  const p = sem.proposals.find((x: any) => x.targetId === "t4")!;
  assert.equal(p.status, "adequate", JSON.stringify(p.reasons));
  assert.deepEqual(p.addIds, []);
  const motivo = p.reasons.find((r: string) => r.startsWith(NO_REINFORCEMENT_FOUND_LABEL)) ?? "";
  // 2026-10-18 · SUBSTITUÍDO "“instalação de internet” (1900) é mais ampla que a principal (cabeça do Pilar)": a cabeça da
  // faceta reforça o Suporte (cenário G); sem nenhuma ideia da instalação, a linha diz que nenhuma coube.
  assert.match(motivo, /nenhuma keyword com volume da lista da marca nem das ideias do Google Ads desta leitura cabe no Assunto, no slug e no DNA do artigo/, JSON.stringify(p.reasons));
  assert.doesNotMatch(p.reasons.join(" "), /cabeça do Pilar/, "a faceta do Suporte nunca é dita 'cabeça do Pilar'");
  const [linha] = planSheetPreviewLines(sem, [linhaDaPlanilha(t4)]);
  assert.equal(linha.kind, "adequate");
  assert.match(linha.sentence, /^Sem keyword de reforço encontrada: .* Nada a gravar\.$/);
  assert.doesNotMatch(linha.sentence, /adequad/i, "nunca 'adequado' com vaga e sem reforço");
  assert.ok(sementes.flat().some(s => normalizeKeyword(s) === normalizeKeyword("taxas de instalação de internet")), "a semente da faceta foi pedida");
  // O Google Ads que responde à semente da faceta: o MESMO Processar traz o reforço (refazer com o motivo dito, sem caminho novo).
  semFacetasDaInstalacao = false;
  const com = await prepare({ targetIds: ["t4"], origin: "plan_sheet", discover: true, reworkOverride: { reason: "o Google Ads respondeu às facetas" } });
  const q = com.proposals.find((x: any) => x.targetId === "t4")!;
  assert.equal(q.status, "ready", JSON.stringify(q.reasons));
  assert.deepEqual(q.addIds.map((k: string) => palavra(com, k)).sort(), [...ESPERADO.t4.novas].sort());
  assert.match(planSheetPreviewLines(com, [linhaDaPlanilha(t4)])[0].sentence, /^Vai gravar: nova versão \(v2\)/);
  assert.equal(chamadasDeRede, 0);
});

/* =================================================================== */
/*
 * 2026-10-18 · DEPOIS DO CONCLUIR (teste no ar, verificado pelo coordenador no navegador e por SELECT). O dono rodou
 * Processar → Concluir no amarelo: 8 ArticleDNA aprovados, 32 keywords novas, SiloDNA v1 + SiloPage v1 do
 * territory:2318febb (consolidado, ligado ao grupo). Depois disso:
 *  A · às 01:10 UTC nasceu territory:c8c9ee94 "Planos e contratação", confirmado e VAZIO — o envio das keywords novas
 *      de uma segunda confirmação procurava o Silo do plano só entre candidate/confirmed e não via o consolidado;
 *  B · "Keywords sem artigo · 32": as 32 estavam DENTRO dos ArticleDNAs, mas sem `clusterId` na cópia de trabalho;
 *  C · Links internos: com os 8 marcados, o Silo deles não era achado ("Selecione o Silo do grafo…");
 *  D · o refazedor mostrava só "Já feito com os mesmos insumos" e tirava da busca nova os 4 Assuntos "com lista".
 * A MESMA linha de sempre; nenhuma porta nova.
 */
async function processarEConcluir() {
  await aplicarTudo(await prepare({ targetIds: TRAVADOS, origin: "plan_sheet" }));
  const processado = await prepare({ targetIds: PLANO.map(l => l.id), origin: "plan_sheet", discover: true });
  const coleta = await coletar(processado);
  const fim = await aplicarTudo({ runId: processado.runId, decisionHash: coleta.decisionHash }, { approveNewKeywords: true });
  assert.equal(fim.state, "complete", JSON.stringify(fim.outcomes));
  // O fechamento do Silo do plano no mesmo ato (a tela grava o par; o território fica consolidado, como no banco).
  territoriosDoStore = [territorioDoPlano("consolidated")];
}

test("amarelo · depois do Concluir · A: o envio das keywords NOVAS ao Arquiteto acha o Silo do plano FECHADO (consolidado, ligado ao grupo) — nenhum Silo novo nasce; o duplicado vazio de 18/10 sai pelo “Desfazer Silo” de sempre", async () => {
  zerar();
  await processarEConcluir();
  const novas = chamadas.handoff.slice(0, 3);
  assert.ok(novas.length > 0, "há keywords novas da confirmação");
  // O mesmo núcleo que o envio chama depois da releitura do recebimento (createMineradorArquitetoHandoff → materializeDeclaredPlanSilo).
  const saida = await materializeDeclaredPlanSilo(contexto(), novas);
  assert.deepEqual(territoriosCriados, [], "nenhum território criado: o Silo do plano é o consolidado");
  assert.equal(saida.length, 1);
  assert.equal(saida[0].territoryRef, TERRITORIO);
  assert.equal(saida[0].territory, "linked");
  assert.match(saida[0].message, /já está fechado \(SiloDNA e SiloPage\): nenhum Silo novo; as keywords novas entram nele pelo artigo/);
  assert.deepEqual(ligacoesDoGrupo, [], "o grupo já está ligado: nada religado");
  // Sem o silo_id no grupo, o consolidado de mesmo slug também é achado (nunca um segundo).
  siloDoGrupo = null;
  territoriosDoStore = [{ ...territorioDoPlano("consolidated"), territory: { ...territorioDoPlano("consolidated").territory, slugState: { publishedSlug: null, confirmed: null, proposals: [{ slug: "planos-de-internet", source: "human", rationale: "Proposta declarada na criação manual do silo." }] } } }];
  const semLigacao = await materializeDeclaredPlanSilo(contexto(), novas);
  assert.deepEqual(territoriosCriados, []);
  assert.equal(semLigacao[0].territory, "slug");
  assert.deepEqual(ligacoesDoGrupo, [TERRITORIO], "o grupo sem silo_id é ligado ao Silo do plano que já existe");

  // A regra pura: o consolidado ligado vence; entre os de mesmo slug, o fechado vem antes do duplicado confirmado.
  const slugOf = (texto: string) => normalizeKeyword(texto).replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  const PLANO_AMARELO = { siloName: "Planos e contratação", siloSlug: "planos-de-internet" };
  const DUPLICADO = "territory:c8c9ee94-fe9a-429f-9358-be866e325b1f";
  const vistas = [
    { territoryRef: DUPLICADO, lifecycleStatus: "confirmed", slugs: [null, null, "planos-de-internet"], name: "Planos e contratação" },
    { territoryRef: TERRITORIO, lifecycleStatus: "consolidated", slugs: [null, null, "planos-de-internet"], name: "Planos e contratação" },
  ];
  assert.deepEqual(choosePlanSiloTerritory({ plan: PLANO_AMARELO, linkedTerritoryRef: TERRITORIO, territories: vistas, slugOf }), { kind: "linked", territoryRef: TERRITORIO, lifecycleStatus: "consolidated" });
  assert.deepEqual(choosePlanSiloTerritory({ plan: PLANO_AMARELO, linkedTerritoryRef: null, territories: vistas, slugOf }), { kind: "slug", territoryRef: TERRITORIO, lifecycleStatus: "consolidated" });
  // O duplicado (vazio) não é o Silo do plano: o "Desfazer Silo" de sempre o desfaz (nada é apagado); o Silo do plano continua protegido.
  const planos = [{ groupId: AMARELO, groupLabel: "Amarelo (Planos e contratação)", siloName: PLANO_AMARELO.siloName, siloSlug: PLANO_AMARELO.siloSlug, linkedTerritoryRef: TERRITORIO }];
  const vivos = new Set([TERRITORIO, DUPLICADO]);
  const visao = (ref: string, estado: string) => declaredPlanViewOfTerritory({ territoryRef: ref, lifecycleStatus: estado, name: "Planos e contratação", reasons: ["Silo do plano declarado: Planos e contratação."], provenance: { note: "Plano declarado no cadastro: grupo Amarelo (Planos e contratação), plano v3." }, slugState: { publishedSlug: null, confirmed: null, proposals: [{ slug: "planos-de-internet" }] } });
  assert.equal(declaredPlanSiloGroupFor(visao(DUPLICADO, "confirmed"), planos, slugOf, vivos), null, "o duplicado não é o Silo do plano");
  assert.equal(declaredPlanSiloGroupFor(visao(TERRITORIO, "consolidated"), planos, slugOf, vivos)?.groupId, AMARELO, "o ligado ao grupo é o Silo do plano");
  assert.equal(declaredPlanSiloGroupFor(visao(DUPLICADO, "confirmed"), planos, slugOf)?.groupId, AMARELO, "sem a leitura dos vivos, a regra de antes (fecha para o lado seguro)");
  const dnas = vigentes();
  const territorioDuplicado = { territoryRef: DUPLICADO, name: "Planos e contratação", centralEntity: null, lifecycleStatus: "confirmed", publicationProtection: "none", slugState: { publishedSlug: null, publishedCanonical: null, confirmed: null, proposals: [] }, existingSiloRef: null, consolidation: null } as any;
  const aprovados = dnas.map(v => ({ articleId: v.payload.articleId, territoryRef: v.payload.territoryRef ?? null, keywordIds: v.payload.keywordReferences.map((r: any) => r.keywordId) }));
  const artefatos = [{ kind: "silo_dna" as const, territoryRef: TERRITORIO, status: "approved" }, { kind: "silo_page" as const, territoryRef: TERRITORIO, status: "approved" }];
  assert.deepEqual(territoryUndoRefusals({ territory: territorioDuplicado, members: [], approvedArticles: aprovados, siloArtifacts: artefatos, declaredPlan: null }), [], "o duplicado vazio pode ser desfeito");
  // 2026-10-18 (decisão do dono "Manter em duas etapas") · SUBSTITUI "o Silo do plano nunca sai pelo Desfazer": ele sai
  // pelo MESMO "Desfazer Silo", como o Silo INTEIRO (artigos, Pilar incluído, e o par), com a prévia e a confirmação forte;
  // nunca pelo lote dos sugeridos e nunca sem a confirmação.
  const doPlanoConsolidado = { territory: { ...territorioDuplicado, territoryRef: TERRITORIO, lifecycleStatus: "consolidated" }, members: [], approvedArticles: aprovados, siloArtifacts: artefatos, declaredPlan: { groupLabel: "Amarelo", siloName: "Planos e contratação" } };
  assert.deepEqual(territoryUndoRefusals(doPlanoConsolidado), [], "o Silo do plano consolidado pode ser desfeito inteiro");
  const porque = territoryUndoWholeSiloReasons(doPlanoConsolidado);
  assert.ok(porque.includes("consolidated") && porque.includes("declared_plan") && porque.includes("silo_pair"), `…mas só como o Silo inteiro (prévia e confirmação forte): ${porque.join(", ")}`);
  assert.equal(chamadasDeRede, 0);
});

test("amarelo · depois do Concluir · B: as keywords novas que a confirmação gravou DENTRO dos ArticleDNAs contam como no artigo (nunca 'Keywords sem artigo'); nada é gravado no Minerador", async () => {
  zerar();
  await processarEConcluir();
  const minerAntes = JSON.stringify(minerador);
  const novas = [...chamadas.handoff];
  assert.ok(novas.length >= 15, `as novas da confirmação: ${novas.length}`);
  // A tela recebe as novas sem `clusterId` na cópia de trabalho (o item do envio não tem artigo): elas chegam como "não agrupadas".
  const vista = splitUngroupedBySubjectAnchor({ ungroupedKeywordIds: novas, articles: [], isDeclaredSubject: () => false, inArticleKeywordIds: keywordIdsInArticleDnas(vigentes().map(v => v.payload)) });
  assert.deepEqual(vista.ungrouped, [], "nenhuma nova em 'Keywords sem artigo'");
  assert.deepEqual([...vista.inArticle!].sort(), [...novas].sort(), "todas estão no artigo (ArticleDNA vigente)");
  // A keyword que NENHUM ArticleDNA referencia continua "sem artigo" (nada some, só muda de lista).
  const solta = splitUngroupedBySubjectAnchor({ ungroupedKeywordIds: ["solta-1"], articles: [], isDeclaredSubject: () => false, inArticleKeywordIds: keywordIdsInArticleDnas(vigentes().map(v => v.payload)) });
  assert.deepEqual(solta.ungrouped.map(item => item.keywordId), ["solta-1"]);
  assert.equal(JSON.stringify(minerador), minerAntes, "a leitura não grava nada");
});

test("amarelo · depois do Concluir · C: Links internos — com a etiqueta amarela, o Silo da cor com SiloDNA + SiloPage é escolhido sozinho (mesmo com o azul na marca); sem cor, o seletor de sempre lista só os Silos com o par", () => {
  const AZUL_SILO = "territory:5e689f8c-8f06-4e65-94c4-b3cd7ac906cc";
  const contextos = [{ siloId: AZUL_SILO, territoryRef: AZUL_SILO }, { siloId: TERRITORIO, territoryRef: TERRITORIO }];
  assert.deepEqual(resolveLinksSilo({ contexts: contextos, selected: null, colorSiloRefs: [TERRITORIO] }), { siloId: TERRITORIO, byColor: true, colorWaiting: false }, "a cor decide: o amarelo, não o primeiro da lista");
  assert.deepEqual(resolveLinksSilo({ contexts: contextos, selected: AZUL_SILO, colorSiloRefs: [TERRITORIO] }).siloId, TERRITORIO, "com a cor ativa, o Silo de outra cor não fica escolhido");
  assert.deepEqual(resolveLinksSilo({ contexts: contextos, selected: TERRITORIO, colorSiloRefs: null }), { siloId: TERRITORIO, byColor: false, colorWaiting: false }, "sem cor: a escolha do seletor");
  assert.equal(resolveLinksSilo({ contexts: contextos, selected: null, colorSiloRefs: null }).siloId, AZUL_SILO, "sem cor e sem escolha: o primeiro com o par");
  assert.deepEqual(resolveLinksSilo({ contexts: [contextos[0]], selected: null, colorSiloRefs: [TERRITORIO] }), { siloId: AZUL_SILO, byColor: false, colorWaiting: true }, "a cor com Silo ainda sem o par diz que espera o fechamento");
});

test("amarelo · depois do Concluir · D: o refazedor ('Melhorar publicados…') LÊ os 8 artigos (o que tem, o que falta, a proposta) e a busca nova roda também para os Assuntos 'com lista' (SUBSTITUI o F5 de 12/10)", async () => {
  zerar();
  await processarEConcluir();
  const chamadasAntes = sementes.length;
  const refazedor = await prepare({ targetIds: PLANO.map(l => l.id), discover: true });
  assert.ok(!refazedor.notices.some((n: string) => /com lista da Pesquisa por Assunto do Minerador não entram na busca nova/.test(n)), JSON.stringify(refazedor.notices));
  const comVaga = refazedor.targets.filter((t: any) => t.memberIds.length < 6).map((t: any) => t.id);
  assert.ok(comVaga.length > 0);
  assert.ok(sementes.length > chamadasAntes || comVaga.every((id: string) => refazedor.discovery?.gapTargetIds.includes(id) === false), "a busca nova roda para quem ainda pede reforço");
  const leitura = improvementReadingLines({ proposals: refazedor.proposals, targets: refazedor.targets, keywordName: id => palavra(refazedor, id ?? ""), max: 6 });
  assert.equal(leitura.length, 8, "uma leitura por artigo lido");
  for (const linha of leitura) {
    assert.match(linha.has, /^\d+ keywords? hoje$/, linha.theme);
    assert.match(linha.missing, /^(cabem mais \d+|cheio \(6 de 6\))/, linha.theme);
    assert.ok(linha.proposal.length > 0, linha.theme);
  }
  const instalacao = leitura.find(l => l.targetId === "t4")!;
  const t4 = refazedor.targets.find((t: any) => t.id === "t4")!;
  assert.equal(instalacao.has, `${t4.memberIds.length} keywords hoje`);
  // 2026-10-18 · com a cabeça da própria faceta ("instalação de internet", "internet instalação"), o Suporte da instalação sai cheio do Concluir.
  assert.equal(t4.memberIds.length, 6, JSON.stringify(t4.memberIds.map((id: string) => palavra(refazedor, id))));
  assert.equal(instalacao.missing.split(";")[0], "cheio (6 de 6)");
  assert.equal(chamadasDeRede, 0);
});

/*
 * 2026-10-17 (noite) · F · "PILAR TROCA, SUPORTES FICAM" NO REFAZEDOR: o Pilar já formado com a principal de identidade
 * (sem volume) recebe, em "Melhorar publicados…", a proposta do termo-cabeça com volume que leva o núcleo do slug — com
 * as keywords que JÁ existem na marca (as do banco: "planos de internet residencial" 6.600 e "plano de internet
 * residencial" 2.900). Proposta na prévia; o dono confirma; a frase do plano fica como o Assunto.
 */
test("amarelo · F: o Pilar JÁ FORMADO com a principal de identidade recebe no refazedor a proposta do termo-cabeça (as keywords da marca), grava v2 com ele como principal e a frase do plano como o Assunto; os Suportes ficam", async () => {
  zerar(); semIdeias = true;
  // O Pilar formado só com a principal de identidade (v1), como no banco antes de 18/10.
  const formado = await prepare({ targetIds: ["l1"], origin: "plan_sheet", discover: true });
  const v1 = await aplicarTudo({ runId: formado.runId, decisionHash: (await coletar(formado)).decisionHash });
  assert.equal(v1.state, "complete", JSON.stringify(v1.outcomes));
  assert.equal(vigentes().find(v => v.payload.subject?.keywordId === "l1")!.payload.principalKeywordId, "l1");
  // As keywords da marca que o Pilar pode receber (aprovadas, recebidas, do grupo e do Silo, com volume do Google Ads).
  for (const [id, keyword, volume] of [["k-planos", "planos de internet residencial", 6600], ["k-plano", "plano de internet residencial", 2900], ["k-melhores", "melhores planos de internet residencial", 480]] as const) {
    // Como no banco (SELECT de 18/10): a Lógica do Minerador JÁ rodou nelas e deixou a intenção "Pendente" (ambígua).
    const semantic = { dna_origem: "logico_deterministico", logicProcessedAt: "2026-10-18T00:54:30.000Z", entidade_central: "plano", intencao_principal: "Pendente", subject_discovery: { version: 1, searches: [], subjectKeywordIds: ["l1"] } };
    const base = linhaDaMesa({ id, keyword, brandId: MARCA, semantic }) as Row;
    mesa.push({ ...base, intent: "Pendente", volume_search: volume, volume_source: "google_ads", group_id: AMARELO, isPublished: false, primaryKeywordPolicy: "free", territoryRef: TERRITORIO, keywordDnaRef: { entityId: id, versionId: `${id}:v1`, contentHash: sha("d") }, canonicalWorkflow: { ...base.canonicalWorkflow, id: `workflow-${id}`, lockVersion: 1 } });
    minerador.push({ id, keyword, brand_id: MARCA, status: "aprovado", intent: "Pendente", volume_search: volume, volume_source: "google_ads", group_id: AMARELO, analise_semantica: clone(semantic) });
  }
  const antes = new Map(minerador.map(r => [r.id, doMineradorDe(r)]));
  const refazedor = await prepare({ targetIds: ["l1", "l2"], discover: true });
  const p = refazedor.proposals.find((x: any) => x.targetId === "l1")!;
  assert.equal(p.principalId, "k-planos", `o termo-cabeça assume: ${JSON.stringify(p.reasons)}`);
  assert.equal(p.needsMinerador, undefined, "a Lógica já rodou nelas (intenção 'Pendente'): não é 'Precisa do Minerador' — a SERP decide a intenção");
  assert.ok(p.memberIds.includes("k-plano"), "a outra variante fica secundária");
  assert.ok(!p.memberIds.includes("l1"), "a frase do plano sai das keywords (fica como o Assunto)");
  assert.match(p.reasons.join(" "), /Pilar sem volume troca pelo termo-cabeça: “planos de internet residencial” \(6600\) assume como principal do Pilar.*“plano de internet residencial” \(2900\) é a mesma busca e fica como secundária/);
  // O Suporte de identidade (l2) continua com a principal.
  assert.equal(refazedor.proposals.find((x: any) => x.targetId === "l2")!.principalId, "l2");
  // A leitura do refazedor mostra a proposta do Pilar.
  const linhaDoPilar = improvementReadingLines({ proposals: refazedor.proposals, targets: refazedor.targets, keywordName: id => palavra(refazedor, id ?? ""), max: 6 }).find(l => l.targetId === "l1")!;
  assert.match(linhaDoPilar.proposal, /^Proposta: principal: como escolher plano de internet residencial → planos de internet residencial/);
  // A SERP do termo-cabeça (com volume) é a coleta paga, custo antes; depois, o dono confirma e grava.
  const coleta = p.needsValidation ? await coletar(refazedor) : refazedor;
  assert.equal(coleta.proposals.find((x: any) => x.targetId === "l1")!.status, "ready", JSON.stringify(coleta.proposals.find((x: any) => x.targetId === "l1")!.reasons));
  const fim = await aplicarTudo({ runId: refazedor.runId, decisionHash: coleta.decisionHash }, { targetIds: ["l1"] });
  assert.equal(fim.state, "complete", JSON.stringify(fim.outcomes));
  const v2 = vigentes().find(v => v.payload.subject?.keywordId === "l1")!;
  assert.equal(v2.versionNumber, 2, JSON.stringify(fim.outcomes));
  assert.equal(v2.payload.principalKeywordId, "k-planos");
  assert.equal(v2.payload.subject?.keywordId, "l1", "a frase do plano é o Assunto (âncora)");
  assert.equal(v2.payload.suggestedSlug, "como-escolher-plano-internet-residencial", "o slug do plano fica");
  assert.equal(v2.payload.hierarchy, "Pilar");
  assert.ok(v2.payload.serpAssessmentRef);
  for (const [id, valor] of antes) assert.equal(doMineradorDe(doMinerador(id)!), valor, `${id}: o Arquiteto mexeu em keyword do Minerador`);
  assert.deepEqual(chamadas.import, [], "keyword que já existe na marca nunca é importada");
  assert.equal(chamadasDeRede, 0);
});

/* =================================================================== */
/*
 * 2026-10-18 · G · A CABEÇA DA FACETA DO SUPORTE NÃO É A CABEÇA DO PILAR (teste no ar do coordenador, 17–18/10, no
 * refazedor do amarelo). O Suporte "Instalação de internet: taxas, prazo e quando chega a primeira fatura" (Travada,
 * "instalação de internet residencial", 170; slug instalacao-internet-primeira-fatura) ficou com poucas keywords: o
 * refazedor recusava "internet instalação" (880), "instalação internet" (880) e "instalação de internet" (720) como "mais
 * ampla que a principal (cabeça do Pilar)" — a regra do termo-cabeça (só no Pilar) aplicada à faceta do próprio Suporte;
 * com 170 buscas na principal, toda busca mais ampla da faceta passava por "cabeça do Pilar". Pelos botões de sempre:
 * "Processar artigos" → "Concluir formação" (o artigo forma com o que o Google Ads trouxe então) → "Melhorar
 * publicados…" (o refazedor: prepare → apply na rota de sempre). Nenhuma porta nova.
 */
test("amarelo · G: no refazedor ('Melhorar publicados…'), o Suporte da instalação recebe a cabeça da PRÓPRIA faceta — “instalação de internet” (720) e UMA grafia de 880 (a outra é a mesma linha do Google Ads) — como secundárias de contexto; a cabeça do núcleo do Pilar continua só no Pilar; o mesmo no refazedor de um artigo só", async () => {
  zerar(); semCabecaDaInstalacao = true;
  await processarEConcluir();
  const doT4 = (run: any) => run.proposals.find((x: any) => x.targetId === "t4")!;
  const textoDe = (id: string) => mesa.find(m => m.id === id)?.keyword ?? id;
  const antes = vigentes().find(v => v.payload.subject?.keywordId === "t4")!;
  const keywordsAntes = antes.payload.keywordReferences.map((r: any) => textoDe(r.keywordId));
  assert.deepEqual([...keywordsAntes].sort(), ["instalação de internet residencial", "prazo de instalação de internet", "primeira fatura de internet", "taxa de instalação de internet"].sort(), "o ponto de partida: a instalação formada com poucas keywords (cabem mais 2)");
  const originais = new Map(minerador.map(r => [r.id, doMineradorDe(r)]));
  const importadasAntes = chamadas.import.length;
  // O Google Ads agora devolve a cabeça da faceta (os números reais do refazedor).
  semCabecaDaInstalacao = false;
  const refazedor = await prepare({ targetIds: PLANO.map(l => l.id), discover: true });
  const p = doT4(refazedor);
  assert.equal(p.status, "ready", JSON.stringify(p.reasons));
  assert.equal(p.principalId, "t4", "Travada: a principal fica");
  assert.deepEqual(p.addIds.map((id: string) => palavra(refazedor, id)).sort(), ["instalação de internet", "internet instalação"].sort(), JSON.stringify(p.reasons));
  assert.equal(p.memberIds.length, 6, "cheio, sem passar do teto");
  assert.ok(!refazedor.proposals.some((x: any) => x.memberIds.some((id: string) => palavra(refazedor, id) === "instalação internet")), "a mesma linha do Google Ads (880 = 880, a mesma busca) não ocupa outra vaga");
  assert.ok(!refazedor.proposals.some((x: any) => x.reasons.some((r: string) => /instala[^”]*” \(\d+\) é mais ampla que a principal \(cabeça do Pilar\)/.test(r))), "a faceta do Suporte nunca é 'cabeça do Pilar'");
  // A cabeça do núcleo do Pilar/Silo continua só no Pilar: nenhuma vaza para um Suporte.
  for (const cabeca of ["planos de internet residencial", "plano de internet residencial", "plano internet residencial"]) {
    for (const x of refazedor.proposals.filter((y: any) => y.targetId !== "l1")) assert.ok(!x.memberIds.some((id: string) => palavra(refazedor, id) === cabeca), `${x.targetId}: “${cabeca}” é do Pilar`);
  }
  // O refazedor de UM artigo só (o Pilar fora da leitura): o núcleo do Pilar vem do servidor (`planPillar`) — o mesmo resultado.
  const so = await prepare({ targetIds: ["t4"], discover: true });
  assert.equal(so.targets.find((t: any) => t.id === "t4")?.planPillar?.slug, "como-escolher-plano-internet-residencial", "o servidor leu o Pilar do mesmo plano");
  assert.deepEqual(doT4(so).addIds.map((id: string) => palavra(so, id)).sort(), ["instalação de internet", "internet instalação"].sort(), JSON.stringify(doT4(so).reasons));
  // "Confirmar" no refazedor: versão nova com as duas, incorporadas pelos núcleos do Minerador; nada do Minerador é mexido.
  const coleta = p.needsValidation ? await coletar(refazedor) : refazedor;
  const fim = await aplicarTudo({ runId: refazedor.runId, decisionHash: coleta.decisionHash }, { targetIds: ["t4"], approveNewKeywords: true });
  assert.equal(fim.state, "complete", JSON.stringify(fim.outcomes));
  const depois = vigentes().find(v => v.payload.subject?.keywordId === "t4")!;
  assert.equal(depois.versionNumber, antes.versionNumber + 1);
  assert.equal(depois.payload.principalKeywordId, "t4");
  assert.deepEqual(depois.payload.keywordReferences.map((r: any) => textoDe(r.keywordId)).sort(), [...keywordsAntes, "instalação de internet", "internet instalação"].sort());
  assert.deepEqual(chamadas.import.slice(importadasAntes).sort(), ["instalação de internet", "internet instalação"].sort(), "só as 2 novas pelos núcleos do Minerador");
  for (const [id, valor] of originais) assert.equal(doMineradorDe(doMinerador(id)!), valor, `${id}: o Arquiteto mexeu em keyword do Minerador`);
  assert.equal(chamadasDeRede, 0);
});
