import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

/*
 * ===== AMAZON_BLUEPRINT_SURFACE_1.3 · A HIERARQUIA DA TELA =====
 *
 * ==================== O QUE ESTAVA ABERTO E NÃO DEVIA ====================
 *
 * A aba da Amazon abria com "O que a pesquisa encontrou": quatro cards de
 * evidência, as recomendações derivadas da coleta e as buscas relacionadas —
 * tudo aberto, tudo ANTES do blueprint comercial.
 *
 * É o mesmo defeito que o Google fechou no EDITORIAL_BLUEPRINT_1 e o YouTube no
 * PROFILES_2.1: a evidência ocupando, como superfície principal, o lugar do que
 * se vai produzir. A pessoa abre a aba para montar a seção comercial e recebe
 * primeiro a prova de que a prateleira existe.
 *
 * §10 · NADA É REMOVIDO. Tudo continua na tela, a um clique.
 *
 * PROVIDER_CALLS = 0 — este gate é de leitura de fonte, sem runtime.
 */

const painel = () => readFile(new URL("../modules/radar/radar-amazon-search-panel.tsx", import.meta.url), "utf8");
const blueprint = () => readFile(new URL("../modules/radar/radar-profile-blueprint.tsx", import.meta.url), "utf8");

/**
 * O CORPO DA VISÃO NORMAL: do fim do cabeçalho até a primeira porta recolhida.
 *
 * Comentários saem: descrever o defeito corrigido é o oposto de tê-lo de volta.
 */
async function visaoNormal() {
  const fonte = (await painel())
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, " ")
    .replace(/\/\*[\s\S]*?\*\//g, " ");
  /*
   * A JANELA COMEÇA NO RESUMO, e não no blueprint.
   *
   * Começar no blueprint deixaria de fora tudo que fosse reintroduzido ACIMA
   * dele — que é exatamente onde os cards e as buscas relacionadas moravam.
   */
  const inicio = fonte.indexOf('data-testid="radar-amazon-package"');
  const fim = fonte.indexOf('data-testid="radar-amazon-competitive-evidence"');
  assert.ok(inicio > 0, "o resumo da pesquisa abre a visão normal");
  assert.ok(fim > inicio, "a porta de evidência vem depois dele");
  return { fonte, inicio, fim };
}

/* ============ §1 · O BLUEPRINT É A PRIMEIRA SUPERFÍCIE ============ */

test("§1 · o blueprint comercial vem antes de qualquer evidência", async () => {
  const fonte = await painel();

  const ondeBlueprint = fonte.indexOf("{editorialModel && <RadarProfileBlueprintSection");
  const ondeCards = fonte.indexOf('data-testid="radar-amazon-observed"');
  const ondeEvidencia = fonte.indexOf('data-testid="radar-amazon-competitive-evidence"');

  assert.ok(ondeBlueprint > 0 && ondeCards > 0 && ondeEvidencia > 0, "as três superfícies existem");
  assert.ok(ondeBlueprint < ondeEvidencia, "§1 · o produto editorial abre a leitura");
  assert.ok(ondeCards > ondeEvidencia, "§2 · os cards estão DENTRO da evidência, depois da porta");
});

/* ============ §2, §3 e §4 · O QUE SAIU DA VISÃO NORMAL ============ */

test("§2 · 'O que a pesquisa encontrou' está dentro da evidência competitiva", async () => {
  const fonte = await painel();

  const abrePorta = fonte.lastIndexOf("<details", fonte.indexOf('data-testid="radar-amazon-competitive-evidence"'));
  const ondeCards = fonte.indexOf('data-testid="radar-amazon-observed"');

  /*
   * A CONTENÇÃO É DE VERDADE, não de ordem no arquivo.
   *
   * Um bloco colado logo DEPOIS do `</details>` continuaria "vindo depois da
   * porta" e estaria aberto na visão normal do mesmo jeito. A verificação conta
   * a profundidade de `<details>` até o nó.
   */
  const entre = fonte.slice(abrePorta, ondeCards);
  const profundidade = (entre.match(/<details/g) || []).length - (entre.match(/<\/details>/g) || []).length;
  assert.ok(profundidade >= 1, "os cards vivem dentro do disclosure de evidência");
});

test("§3 e §4 · nada de buscas relacionadas nem blueprint antigo soltos", async () => {
  const { fonte, inicio, fim } = await visaoNormal();
  const normal = fonte.slice(inicio, fim);

  /* §3 · BUSCAS_RELACIONADAS_SOLTAS = 0. */
  assert.equal(/radar-amazon-related-searches/.test(normal), false, "buscas relacionadas soltas na visão normal");

  /* §4 · BLUEPRINT_COMPETITIVO_FORA_DE_DISCLOSURE = 0. */
  assert.equal(/RadarCompetitiveBlueprintSection/.test(normal), false, "o blueprint competitivo antigo está solto");

  /* E os quatro cards também não estão lá. */
  assert.equal(/radar-amazon-observed/.test(normal), false);
  assert.equal(/radar-amazon-card-recommended/.test(normal), false, "recomendações derivadas da coleta soltas");
});

/* ============ §5 · O QUE A VISÃO NORMAL MOSTRA ============ */

test("§5 · a visão normal mostra o resumo, o blueprint e as portas — e só", async () => {
  const fonte = await painel();

  /* O resumo curto dos três números continua no pacote, acima do blueprint. */
  const ondePacote = fonte.indexOf('data-testid="radar-amazon-package"');
  const ondeBlueprint = fonte.indexOf("{editorialModel && <RadarProfileBlueprintSection");
  assert.ok(ondePacote > 0 && ondePacote < ondeBlueprint, "o resumo curto abre a aba");
  assert.match(fonte, /resultado\(s\) observado\(s\) · \$\{counts\.eligible\} compatível\(is\)/);

  /* Produtos selecionados, links e limitações vivem dentro do blueprint. */
  const modelo = await blueprint();
  assert.match(modelo, /data-testid="radar-profile-promotion-links"/);
  assert.match(modelo, /data-testid="radar-profile-limitations"/);
  assert.match(modelo, /data-testid="radar-profile-shortlist-status"/);
});

/* ============ §6 a §9 · TUDO RECOLHIDO POR PADRÃO ============ */

test("§6, §7, §8 e §9 · nenhuma porta nasce aberta", async () => {
  /*
   * `<details>` sem `open` é fechado. Um `open` aqui devolveria a tela ao
   * estado que este gate corrige — e ele é fácil de acrescentar sem perceber.
   */
  /*
   * `open` COMO ATRIBUTO, e não como propriedade lida.
   *
   * `onToggle={evento => (evento.currentTarget as HTMLDetailsElement).open}` é
   * leitura de estado e vive dentro da mesma tag. Uma varredura por `open` solto
   * acusaria o lazy-loading das portas pelo código que as faz funcionar.
   */
  const atributoOpen = /(^|\s)open(\s*=|\s*\/?>|\s)/;

  for (const [nome, fonte] of [["painel", await painel()], ["blueprint", await blueprint()]] as const) {
    const aberturas = [...fonte.matchAll(/<details[\s\S]*?>/g)].map(item => item[0]);
    assert.ok(aberturas.length > 0, `${nome}: há portas para verificar`);
    for (const tag of aberturas) {
      /*
       * A TAG INTEIRA — cortá-la no `onToggle` deixaria de fora tudo que viesse
       * depois do handler, e `open` cabe ali tão bem quanto antes dele.
       *
       * O `.open` lido no handler não confunde: a expressão exige espaço ou
       * início antes de `open`, e ali o caractere anterior é um ponto.
       */
      assert.equal(atributoOpen.test(tag), false, `${nome}: porta aberta por padrão — ${tag.slice(0, 80)}`);
    }
  }

  const modelo = await blueprint();
  /* §6 · "Critérios, faixas e reputação" é uma porta, não uma lista aberta. */
  const derivadas = modelo.indexOf('data-testid="radar-profile-derived-list"');
  assert.ok(derivadas > 0);
  assert.match(modelo.slice(derivadas - 120, derivadas), /<details/, "as derivadas ficam recolhidas");

  const fonte = await painel();
  /* §7, §8 e §9 · evidência, universo observado e proveniência. */
  for (const marca of ["radar-amazon-competitive-evidence", "radar-amazon-sample", "radar-amazon-provenance"]) {
    const onde = fonte.indexOf(`data-testid="${marca}"`);
    assert.ok(onde > 0, `${marca} existe`);
    const abre = fonte.lastIndexOf("<details", onde);
    assert.ok(abre > 0 && abre < onde, `${marca} é uma porta`);
    /* A fatia inteira da tag: `open` pode ser acrescentado depois do handler. */
    assert.equal(atributoOpen.test(fonte.slice(abre, onde)), false, `${marca} nasce aberta`);
  }
});

/* ============ §10 · NENHUM DADO É REMOVIDO ============ */

test("§10 · tudo continua na tela — a porta só mudou de lugar", async () => {
  const fonte = await painel();

  /*
   * Cada peça que saiu da visão normal precisa continuar existindo. Um gate de
   * UX que apaga dado não é reorganização: é perda.
   */
  for (const marca of [
    "radar-amazon-observed",
    "radar-amazon-card-recommended",
    "radar-amazon-related-searches",
    "RadarCompetitiveBlueprintSection",
    "{evidenceExtras}",
  ]) {
    assert.ok(fonte.includes(marca), `§10 · sumiu da tela: ${marca}`);
  }

  /*
   * E A PORTA ABRE SEMPRE QUE HÁ O QUE MOSTRAR.
   *
   * A condição era só de ANÁLISE. Movidos para dentro, os cards herdariam essa
   * condição e sumiriam numa coleta ainda não analisada — que é justamente
   * quando a pessoa mais quer olhar a prateleira.
   */
  assert.match(fonte, /projecao\.state === "PARTIAL_SUPPORT_FAILED" \|\| cards\.length > 0/);
});

/* ============ §11 · ELIGIBLE = 0 NÃO ATRAVESSA ============ */

test("§11 · ranking sem candidato não permite Enviar ao Planejador", async () => {
  const pagina = await readFile(new URL("../modules/radar/radar-page.tsx", import.meta.url), "utf8");

  assert.match(pagina, /const rankingSemCandidato = \(\(\) => \{/);
  assert.match(pagina, /eligible: Boolean\(perfil\) && !noRedator && !rankingSemCandidato/);

  /* §11 · e a recusa diz o que corrigir, em vez de só apagar o botão. */
  assert.match(pagina, /revise o tipo de produto e o filtro de marca antes de enviar/i);

  /* Só as formas que prometem ranking são afetadas — um guia não tem shortlist. */
  const inicio = pagina.indexOf("const rankingSemCandidato");
  const corpo = pagina.slice(inicio, inicio + 900);
  assert.match(corpo, /tipo !== "TOP_BEST" && tipo !== "TOP_VALUE" && tipo !== "BEST_FOR_USE_CASE"/);
  assert.match(corpo, /radarAmazonEligibleCandidates\(\{/);
});

test("§11 · o blueprint continua dizendo o bloqueio e a correção", async () => {
  const modelo = await blueprint();

  assert.match(modelo, /data-testid="radar-profile-shortlist-status"/);
  assert.match(modelo, /data-testid="radar-profile-shortlist-fix"/);
  assert.match(modelo, /data-state=\{model\.shortlistStatus\.state\}/);
});

/* ============ O QUE ESTE GATE NÃO PODE TER TOCADO ============ */

test("GOOGLE_CHANGED = NO e YOUTUBE_CHANGED = NO", async () => {
  const google = await readFile(new URL("../modules/radar/radar-article-model.tsx", import.meta.url), "utf8");
  const youtube = await readFile(new URL("../modules/radar/radar-youtube-search-panel.tsx", import.meta.url), "utf8");

  /*
   * A MARCA PRECISA SER DESTE GATE.
   *
   * O Google teve o próprio 1.3 (RADAR_EDITORIAL_BLUEPRINT_1.3) e as marcas
   * dele estão lá por direito. Varrer por "1.3" acusaria o arquivo pela própria
   * história — foi o erro que o 1.2 já cometeu uma vez.
   */
  for (const [nome, fonte] of [["Google", google], ["YouTube", youtube]] as const) {
    assert.equal(
      /AMAZON_BLUEPRINT_SURFACE/.test(fonte),
      false,
      `${nome} recebeu ajuste deste gate`,
    );
  }

  /*
   * E a casca compartilhada continua servindo aos dois perfis: o que mudou no
   * blueprint de perfil vale para YouTube e Amazon, que é o ponto dela.
   */
  assert.match(youtube, /RadarProfileBlueprintSection/);
});

test("MIGRATIONS = 0 e ARTICLE_DNA_MUTATED = NO", async () => {
  const arquiteto = await readFile(new URL("../lib/arquiteto/contracts.ts", import.meta.url), "utf8");
  assert.equal(/shortlistStatus|comparisonCriteria|promotionLinks/.test(arquiteto), false);
});
