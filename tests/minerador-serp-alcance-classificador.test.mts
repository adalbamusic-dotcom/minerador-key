import assert from "node:assert/strict";
import test from "node:test";
import { deriveSerpSemanticEvidence } from "../lib/minerador/serp-semantic-evidence.ts";

/**
 * ALCANCE do classificador: o que ele consegue LER, separado da força.
 *
 * A força já é medida em `minerador-serp-coverage-dominance`. Aqui o que está
 * sob teste é a cobertura: resultado que o classificador não lê vira
 * "indefinido" e derruba o eixo inteiro, mesmo quando a SERP é óbvia para um
 * humano. Cada regra abaixo nasceu de uma SERP real em que isso aconteceu.
 *
 * REAL_PROVIDER_CALLS_IN_TESTS = 0.
 */

type Item = Record<string, unknown>;

function evidenceFrom(organic: Item[], features: Item[] = []) {
  return deriveSerpSemanticEvidence({
    body: {
      tasks: [{
        id: "task-1",
        result: [{
          keyword: "kw teste",
          location_code: 2076,
          language_code: "pt",
          items: [
            ...organic.map((item, index) => ({ type: "organic", rank_group: index + 1, domain: `site${index}.com.br`, ...item })),
            ...features,
          ],
        }],
      }],
    },
    keyword: "kw teste",
    locationCode: 2076,
    languageCode: "pt",
    providerRequestId: "task-1",
    operationRequestId: "op-1",
    collectedAt: "2026-09-18T00:00:00.000Z",
  })!;
}

/** Título mudo de propósito: quem precisa classificar é a URL. */
const mute = { title: "Página", description: "sem marcador de texto" };

test("referência enciclopédica é lida como Informativa/TOFU", () => {
  const evidence = evidenceFrom([
    { ...mute, url: "https://pt.wikipedia.org/wiki/Comando_num%C3%A9rico_computadorizado" },
    { ...mute, url: "https://www.dicio.com.br/cnc/" },
    { ...mute, url: "https://www.significados.com.br/cnc/" },
    { ...mute, url: "https://www.britannica.com/technology/cnc" },
    { ...mute, url: "https://michaelis.uol.com.br/busca?palavra=cnc" },
  ]);
  assert.equal(evidence.intent.coverage, 1, "cinco verbetes, cinco leituras");
  assert.equal(evidence.intent.value, "Informativa");
  assert.equal(evidence.funnel.value, "TOFU");
  assert.ok(evidence.sample.every(item => item.signals.includes("referência enciclopédica")));
});

test("blog no subdomínio conta tanto quanto /blog/ no caminho", () => {
  const caminho = evidenceFrom(Array.from({ length: 5 }, (_, index) => ({ ...mute, url: `https://exemplo.com.br/blog/texto-${index}` })));
  const subdominio = evidenceFrom(Array.from({ length: 5 }, (_, index) => ({ ...mute, url: `https://blog.exemplo.com.br/texto-${index}` })));
  assert.equal(caminho.intent.coverage, 1);
  // O defeito: a mesma página de blog ficava ilegível quando endereçada por
  // subdomínio, e a cobertura caía a zero.
  assert.equal(subdominio.intent.coverage, 1);
  assert.equal(subdominio.intent.value, "Informativa");
  assert.equal(subdominio.funnel.value, "TOFU");
  assert.ok(subdominio.sample.every(item => item.signals.includes("página editorial")));

  for (const host of ["noticias", "revista", "magazine"]) {
    const outro = evidenceFrom([{ ...mute, url: `https://${host}.exemplo.com.br/texto` }]);
    assert.equal(outro.sample[0].intent, "Informativa", `${host}. também é editorial`);
  }
});

test("perfil em rede social é Navegacional e não coloca ninguém no funil", () => {
  const evidence = evidenceFrom([
    { ...mute, url: "https://www.instagram.com/marca/" },
    { ...mute, url: "https://www.facebook.com/marca" },
    { ...mute, url: "https://br.linkedin.com/company/marca" },
    { ...mute, url: "https://www.tiktok.com/@marca" },
    { ...mute, url: "https://www.reclameaqui.com.br/empresa/marca/" },
  ]);
  assert.equal(evidence.intent.value, "Navegacional");
  assert.ok(evidence.sample.every(item => item.signals.includes("perfil em rede social")));
  // Presença de marca não é etapa de jornada: o Funil continua sem leitura.
  assert.equal(evidence.funnel.classified, 0);
  assert.equal(evidence.funnel.value, null);
  assert.equal(evidence.funnel.strength, "insufficient");
});

test("raiz de domínio é o sinal mais fraco e só entra quando nada mais leu", () => {
  const raiz = evidenceFrom(Array.from({ length: 5 }, (_, index) => ({ ...mute, url: `https://marca${index}.com.br/` })));
  assert.equal(raiz.intent.value, "Navegacional");
  assert.ok(raiz.sample.every(item => item.signals.includes("raiz do domínio")));
  assert.equal(raiz.funnel.classified, 0, "raiz de domínio também não posiciona no funil");

  // Texto explícito vence o palpite estrutural: a raiz não sequestra a leitura.
  const comTexto = evidenceFrom([{ title: "Comprar tornos CNC com frete grátis", description: "preco e cupom", url: "https://marca.com.br/" }]);
  assert.equal(comTexto.sample[0].intent, "Transacional");
  assert.equal(comTexto.sample[0].funnel, "BOFU");
});

test("marcadores de explicação técnica passaram a ser lidos", () => {
  // Vindos da SERP real de "cnc": nenhum destes títulos era classificável antes.
  const evidence = evidenceFrom([
    { title: "Entenda o comando numérico computadorizado", description: "" },
    { title: "Conceito e história do CNC", description: "" },
    { title: "Definição de usinagem CNC", description: "" },
    { title: "Aplicações da tecnologia CNC na indústria", description: "" },
    { title: "Como funciona uma máquina CNC", description: "" },
    { title: "Saiba mais sobre tornos CNC", description: "" },
  ]);
  assert.equal(evidence.intent.coverage, 1);
  assert.equal(evidence.intent.value, "Informativa");
  assert.equal(evidence.intent.strength, "conclusive");
  assert.equal(evidence.funnel.value, "TOFU");
});

test("as regras novas não inventam leitura onde a SERP é muda", () => {
  const evidence = evidenceFrom(Array.from({ length: 6 }, (_, index) => ({
    title: `Modelo ${index}`,
    description: "linha industrial",
    url: `https://fabricante${index}.com.br/equipamentos/modelo-${index}`,
  })));
  assert.equal(evidence.intent.classified, 0, "sem marcador, sem host conhecido e sem raiz: continua indefinido");
  assert.equal(evidence.intent.value, null);
  assert.equal(evidence.intent.strength, "insufficient");
});
