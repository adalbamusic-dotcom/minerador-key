import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { articleParentLabel, readArticleParent } from "../lib/arquiteto/article-parent-binding.ts";

/* ------------- §5 territoryRef não significa "sem silo" ------------------- */

test("território confirmado dá pai editorial mesmo sem siloId canônico", () => {
  const leitura = readArticleParent({
    territoryRef: "territory:skincare-facial",
    territoryName: "Skincare Facial",
    territoryConfirmed: true,
    canonicalSiloId: null,
  });
  assert.equal(leitura.state, "TERRITORY_CONFIRMED");
  assert.equal(leitura.hasParent, true, "o Silo foi confirmado por decisão humana: o artigo já pertence a ele");
  assert.equal(leitura.label, "Skincare Facial");
  // O que falta é a consolidação, e é isso que a tela diz — não "sem silo".
  assert.match(articleParentLabel(leitura), /Skincare Facial · consolidação canônica pendente/);
  assert.doesNotMatch(articleParentLabel(leitura), /[Ss]em [Ss]ilo/);
});

test("só a ausência de territoryRef é ausência de pai", () => {
  const semPai = readArticleParent({
    territoryRef: null, territoryName: null, territoryConfirmed: false, canonicalSiloId: null,
  });
  assert.equal(semPai.state, "NO_PARENT");
  assert.equal(semPai.hasParent, false);
  assert.match(articleParentLabel(semPai), /Sem Silo/);
});

test("silo canônico não anuncia pendência nenhuma", () => {
  const canonico = readArticleParent({
    territoryRef: "territory:anti-idade",
    territoryName: "Anti-idade e Retinol",
    territoryConfirmed: true,
    canonicalSiloId: "silo-77",
    canonicalSiloName: "Anti-idade e Retinol",
  });
  assert.equal(canonico.state, "CANONICAL_SILO");
  assert.equal(canonico.pending, null);
  assert.equal(articleParentLabel(canonico), "Anti-idade e Retinol");
});

test("território ainda candidato diz que falta confirmar, não que falta silo", () => {
  const candidato = readArticleParent({
    territoryRef: "territory:barreira",
    territoryName: "Barreira e Reparação",
    territoryConfirmed: false,
    canonicalSiloId: null,
  });
  assert.equal(candidato.state, "TERRITORY_CANDIDATE");
  assert.match(articleParentLabel(candidato), /confirmação do Silo pendente/);
});

/* --------- §6/§7 as telas não podem voltar a ler `siloId` como pai -------- */

const workspace = readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8");

test("grade e Links agrupam pelo pai editorial, não pelo siloId canônico", () => {
  assert.match(workspace, /const articleParentFor = \(art: \(typeof articlesList\)\[number\]\) =>/);
  // O agrupamento fora da aba Artigos passou a usar o território.
  assert.match(workspace, /const key = pai\.territoryRef \? `territory:\$\{pai\.territoryRef\}` : "sem-silo";/);
  assert.doesNotMatch(workspace, /const hasCanonicalSilo = typeof art\.siloId === "string" && art\.siloId\.trim\(\)\.length > 0;/);
  // "Pronto para Silos" na coluna Silo dizia que o artigo ainda não pertencia
  // a nenhum; ele já pertence desde a confirmação do território.
  assert.doesNotMatch(workspace, /\{articleSiloReadiness\.label\}<\/span>/);
});

test("status e aprovação da grade leem o mesmo ArticleDNA do painel", () => {
  // Duas chaves faziam o mesmo artigo aparecer Consolidado e Em processo.
  const leituras = workspace.match(/articleDnaEntryFor\(\{ articleId: articleEntityId, candidateRef: art\.candidateRef \}\)/g) || [];
  assert.ok(leituras.length >= 2, `esperado status e aprovação pelo resolvedor único, achei ${leituras.length}`);
});

/* ---------- §3 concluir formação é a aprovação final do Article ----------- */

test("concluir formação materializa o ArticleDNA já aprovado", () => {
  // Materializar como proposta e exigir um segundo clique criava duas decisões
  // humanas para um único ato editorial.
  assert.match(workspace, /status: "approved",\r?\n        \}\);/);
  assert.doesNotMatch(workspace, /status: "proposed",\r?\n        \}\);/);
  assert.match(workspace, /const confirmado = confirmedArticlePayload\(/);
  assert.match(workspace, /createStatusEvent\(canonico\.versionId, "approved", actorId,/);
  // E o artefato sai COMPLETO: território e Silo canônico. Emitir `siloId:
  // null` fazia a fase seguinte terminar o serviço desta.
  assert.match(workspace, /const materializado = materializeArticleSiloId\(\{/);
  assert.match(workspace, /const payload = materializado\.payload;/);
});

test("o cabeçalho do grupo não redecide o que o agrupamento já nomeou", () => {
  // Duas decisões para a mesma pergunta: o agrupamento resolvia pelo pai e o
  // cabeçalho voltava a exigir `siloId` canônico, escrevendo ARTIGOS SEM SILO
  // por cima de três Silos confirmados.
  assert.doesNotMatch(workspace, /hasCanonicalSilo \|\| articleMode \? group\.siloName : "ARTIGOS SEM SILO"/);
  // O rótulo só pode nascer no agrupamento — uma vez por projeção, e nunca
  // outra vez na hora de desenhar o cabeçalho.
  const atribuicoes = workspace.split("\n")
    .filter(line => !line.trim().startsWith("*") && !line.trim().startsWith("//") && !line.trim().startsWith("/*"))
    .filter(line => line.includes('"ARTIGOS SEM SILO"'));
  assert.equal(atribuicoes.length, 2, `esperado só os dois fallbacks do agrupamento:\n${atribuicoes.join("\n")}`);
});

test("a aba Links não oferece trocar de Silo a quem tem Silo confirmado", () => {
  // O seletor mostrava "Sem silo" como valor corrente de um artigo cujo Silo
  // foi decidido na fase Silos.
  assert.match(workspace, /Silo definido na fase Silos/);
});
