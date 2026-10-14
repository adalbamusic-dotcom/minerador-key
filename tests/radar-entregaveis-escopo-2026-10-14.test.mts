import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * ===== 2026-10-14 · D14 · O E0 MUDA SÓ NAS CHAVES AUTORIZADAS, FASE A FASE =====
 *
 * SDD `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §12.3
 * (D14, decidida pelo dono em 2026-10-14: "sim, pode sim, e do MCP também é uma
 * boa ideia, pode implementar"). O E0 (`tests/entregaveis-intocados-2026-10-13.test.mts`)
 * continua sendo a prova de escopo: a tabela `RETRATO` dele só pode mudar nas
 * chaves que a fase autorizou. Este teste compara a tabela de hoje com a cópia
 * congelada em 2026-10-13 (`tests/fixtures/entregaveis-2026-10-13.sha256.json`) e
 * falha quando:
 *   - uma chave FORA da lista autorizada mudou, sumiu ou nasceu;
 *   - a cópia congelada foi alterada (ela é auditoria, não se atualiza).
 *
 * Cada fase acrescenta a sua lista abaixo, com a decisão e o porquê. O que não
 * está numa lista continua byte a byte o de 2026-10-13.
 */

type Foto = { sha256: string; bytes: number };

const CONGELADA = JSON.parse(readFileSync(new URL("./fixtures/entregaveis-2026-10-13.sha256.json", import.meta.url), "utf8")) as { retrato: Record<string, Foto> };

/** A tabela RETRATO do E0, lida do arquivo (ela é uma constante interna do teste). */
function retratoDoE0(): Record<string, Foto> {
  const fonte = readFileSync(new URL("./entregaveis-intocados-2026-10-13.test.mts", import.meta.url), "utf8");
  const inicio = fonte.indexOf("const RETRATO: Retrato = {");
  assert.ok(inicio >= 0, "a tabela RETRATO do E0 não foi encontrada");
  const fim = fonte.indexOf("\n};", inicio);
  const tabela: Record<string, Foto> = {};
  for (const linha of fonte.slice(inicio, fim).split("\n")) {
    const lida = linha.match(/^\s*"([^"]+)":\s*\{\s*sha256:\s*"([0-9a-f]{64})",\s*bytes:\s*(\d+)\s*\},?\s*(?:\/\/.*)?$/);
    if (lida) tabela[lida[1]] = { sha256: lida[2], bytes: Number(lida[3]) };
  }
  return tabela;
}

/*
 * AS CHAVES AUTORIZADAS, POR FASE. Um padrão que começa por asterisco e barra
 * casa pelo SUFIXO depois da barra (o sufixo "/csv-para-escrever" vale para todo
 * cenário); sem o asterisco, o nome inteiro.
 */
type Fase = { fase: string; decisao: string; chaves: readonly string[] };
export const FASES_DO_E0: readonly Fase[] = [
  { fase: "F0", decisao: "fixture e teste do antes: nenhum entregável muda", chaves: [] },
  {
    fase: "F1",
    decisao: "título e keyword (D4, D5 e D6; regras 2026-10-14): o pedido e a planta congelada (regra 28 nova, title.principalNatural, semanticVariants, rulesVersion), o CSV 'Para escrever' e o MCP que o entrega (título sem marca de processo, K1–K9 como instrução concluída), a diretriz de voz (regras titulo, meta e inicio; resumo; Redator; catálogo). O CSV de vídeo, o Redator (documento, fundamentos e get_writer_brief), as âncoras, a identidade de publicação e a fonte dos handlers ficam iguais.",
    chaves: [
      "*/artigo-modelo.pedido.system",
      "*/artigo-modelo.pedido.user",
      "*/artigo-modelo.planta-congelada",
      "*/csv-para-escrever",
      "*/mcp.get_article_for_writing",
      "voz-humana/diretriz",
      "voz-humana/textos",
    ],
  },
  {
    fase: "F-S",
    decisao: "item novo (§16.1): a SERP crua por artigo é arquivo novo e ferramenta nova (get_article_serp_raw); o CSV 'Para escrever', get_article_for_writing e a fonte dos handlers do E0 ficam iguais",
    chaves: [],
  },
  {
    fase: "F2",
    decisao: "links obrigatórios do grafo e trilha no Radar (D1, D2, D3, D6 e D10): o pacote do pedido (cada candidato K grava a obrigação, priority), o pedido (regra 6 com a malha do Silo e a obrigação em cada K), a planta congelada (os candidatos com priority; fechando, o obrigatório no corpo), o CSV 'Para escrever' e o MCP que o entrega (a linha 'Malha do Silo' e a trilha 'Continue no Silo' na coluna links_internos, a trilha e a medida na estrutura). O CSV de vídeo, o Redator (documento, fundamentos e get_writer_brief), as âncoras (régua), a identidade de publicação, a diretriz de voz e a fonte dos handlers ficam iguais.",
    chaves: [
      "*/artigo-modelo.brief",
      "*/artigo-modelo.pedido.system",
      "*/artigo-modelo.pedido.user",
      "*/artigo-modelo.planta-congelada",
      "*/csv-para-escrever",
      "*/mcp.get_article_for_writing",
    ],
  },
  {
    fase: "F3",
    decisao: "análise competitiva, diferencial da marca e fechamento (D7, D8, D11, D12 e D13; regras 2026-10-14b): o pacote do pedido (a leitura competitiva da SERP já coletada: amostra relevante, faixa de referência e os conjuntos T, M+, N e U como evidência; as medidas da amostra relevante), o pedido (regras 29 e 30, o fechamento em 4 campos, a oferta de diagnóstico), a planta congelada (rulesVersion, as evidências T, M+, N e U e as medidas da amostra relevante), o CSV 'Para escrever' e o MCP que o entrega (cobrir_e_superar nos quatro blocos, a amostra relevante na serp_resumida, a faixa de referência e a fala do especialista fora do CTA na estrutura, o SEO antigo no título, a regra das ressalvas na regra geral 12) e a diretriz de voz (regra 'fechamento' com D7, regra nova 'ressalvas', a regra 28 e o catálogo). O CSV de vídeo e get_video_material (F6), o Redator (documento, fundamentos e get_writer_brief), as âncoras, a identidade de publicação, as réguas da voz e a fonte dos handlers ficam iguais.",
    chaves: [
      "*/artigo-modelo.brief",
      "*/artigo-modelo.pedido.system",
      "*/artigo-modelo.pedido.user",
      "*/artigo-modelo.planta-congelada",
      "*/csv-para-escrever",
      "*/mcp.get_article_for_writing",
      "voz-humana/diretriz",
      "voz-humana/textos",
    ],
  },
  {
    fase: "F-A",
    decisao: "item novo (§16.2), fase A: coleta e conferência das fontes externas de autoridade no ANALYZE, gravadas na versão da análise; a escrita não lê nada novo",
    chaves: [],
  },
  {
    fase: "F-B",
    /* 2026-10-14c · SDD silo interligado · F-B · decisão do dono (frase do §1 e autorização do §16.2: "pode implementar"). */
    decisao: "item novo (§16.2), fase B: as fontes externas de autoridade conferidas no texto (regras 2026-10-14c): o pedido (regra 7 nova: de 2 a 5 links externos no corpo com as fontes X, na frase que sustentam, âncora no nome da entidade, nenhuma URL fora das verificadas, a afirmação de saúde sem fonte não é afirmada), a planta congelada (rulesVersion) e a nota do catálogo da diretriz de voz (voz-humana/textos). Sem o registro da conferência no pacote — todos os cenários do E0 —, o pacote do pedido, o pedido do usuário, o CSV 'Para escrever', get_article_for_writing, o CSV de vídeo, o Redator, as âncoras, a identidade de publicação, as réguas da voz e a fonte dos handlers ficam iguais (o guarda de tamanho do CSV não muda).",
    chaves: [
      "*/artigo-modelo.pedido.system",
      "*/artigo-modelo.planta-congelada",
      "voz-humana/textos",
    ],
  },
];

const casa = (chave: string, padrao: string) => (padrao.startsWith("*/") ? chave.endsWith(padrao.slice(1)) : chave === padrao);
const autorizada = (chave: string) => FASES_DO_E0.some(fase => fase.chaves.some(padrao => casa(chave, padrao)));

test("D14 · a cópia congelada do E0 de 2026-10-13 continua com as 105 entradas de origem", () => {
  assert.equal(Object.keys(CONGELADA.retrato).length, 105);
  assert.equal(CONGELADA.retrato["silo-pilar-e-suportes/csv-para-escrever"].sha256, "4be7e971c7c13357c3c65bbf62290bdd6d6cfbbf9ab09aa2aa98a868e0066f1d");
});

test("D14 · fora das chaves autorizadas pelas fases, o RETRATO do E0 é o de 2026-10-13", () => {
  const hoje = retratoDoE0();
  const fora: string[] = [];
  for (const chave of new Set([...Object.keys(CONGELADA.retrato), ...Object.keys(hoje)])) {
    if (autorizada(chave)) continue;
    const antes = CONGELADA.retrato[chave];
    const agora = hoje[chave];
    if (!antes) fora.push(`NASCEU ${chave}`);
    else if (!agora) fora.push(`SUMIU ${chave}`);
    else if (antes.sha256 !== agora.sha256 || antes.bytes !== agora.bytes) fora.push(`MUDOU ${chave}`);
  }
  assert.deepEqual(fora, [], "chave fora da lista autorizada mudou: mudar entregável exige decisão do dono registrada numa SDD");
});

test("D14 · cada chave autorizada existe no retrato congelado (a lista não autoriza chave inventada)", () => {
  for (const fase of FASES_DO_E0) {
    for (const padrao of fase.chaves) {
      assert.ok(Object.keys(CONGELADA.retrato).some(chave => casa(chave, padrao)), `${fase.fase}: "${padrao}" não casa com nenhuma chave do E0`);
    }
  }
});
