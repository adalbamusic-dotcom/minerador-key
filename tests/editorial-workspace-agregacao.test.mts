import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/**
 * A MESA NÃO CAI INTEIRA POR CAUSA DE UMA GAVETA.
 *
 * O GET do workspace agrega OITO repositórios. Com `Promise.all`, falha em
 * documentos, convites ou preferências derrubava a resposta inteira e apagava
 * os artigos do Radar que tinham sido lidos sem problema nenhum.
 *
 * As consultas diretas ao Supabase mostraram 3/3 itens do Radar passando no
 * schema. Ou seja: a linha incompatível NÃO era a causa, e a perda acontece
 * entre o banco e a tela. Este arquivo trava os defeitos desse trecho.
 */

const read = (relative: string) => readFileSync(new URL("../" + relative, import.meta.url), "utf8");
const ROUTE = "app/api/editorial/workspace/route.ts";

const executable = (source: string) =>
  source.split("\n").filter(line => {
    const trimmed = line.trim();
    return !trimmed.startsWith("*") && !trimmed.startsWith("/*") && !trimmed.startsWith("//");
  }).join("\n");

test("01 · os repositórios são isolados: um que falha não derruba os outros", () => {
  const rota = executable(read(ROUTE));
  assert.match(rota, /Promise\.allSettled\(\[/, "agregação isolada por seção");
  assert.ok(!rota.includes("Promise.all(["), "não sobrou Promise.all derrubando tudo");
  assert.match(rota, /resultado\.status === "fulfilled"/);
});

test("02 · falha de documentos, convites ou preferências NÃO vira marca vazia", () => {
  const rota = executable(read(ROUTE));
  // Só a queda do próprio workflow torna a mesa do Radar ilegível.
  assert.match(rota, /const workflowCaiu = falhas\.some\(falha => falha\.secao === "workflow"\)/);
  assert.match(rota, /workflowCaiu\s*\?\s*"read_failure"/);
  // E a seção que caiu é NOMEADA na resposta.
  assert.match(rota, /Seção\(ões\) que não puderam ser lidas/);
  assert.match(rota, /falha\.secao/);
});

test("03 · as oito seções têm nome próprio", () => {
  const rota = executable(read(ROUTE));
  for (const secao of ["workflow", "artifacts", "documents", "publications", "invitations", "views", "serpSnapshots", "serpReviews"]) {
    assert.ok(rota.includes(`"${secao}"`), `a seção ${secao} precisa ser nomeável no diagnóstico`);
  }
});

test("04 · dado persistido inválido NÃO é reportado como marca inválida", () => {
  const rota = executable(read(ROUTE));
  // O erro de entrada continua 400 e tem código próprio.
  assert.match(rota, /code: "invalid_brand_id"/);
  assert.match(rota, /status: 400/);
  // O erro de dado persistido é outro código, outro status e nomeia as seções.
  assert.match(rota, /code: "persisted_data_invalid"/);
  assert.match(rota, /status: 502/);
  assert.match(rota, /sections: secoes/);
  // O parse do payload persistido não pode mais lançar para o catch genérico.
  assert.match(rota, /PersistedEditorialWorkspaceSchema\.safeParse\(montado\)/);
  assert.ok(!rota.includes("PersistedEditorialWorkspaceSchema.parse("), "sem parse estrito no caminho persistido");
});

test("05 · a entrada é validada separadamente do dado persistido", () => {
  const rota = executable(read(ROUTE));
  const entrada = rota.indexOf("QuerySchema.parse(");
  const agregacao = rota.indexOf("Promise.allSettled([");
  assert.ok(entrada > 0 && entrada < agregacao, "marcaId é validado antes de ler o banco");
  // O catch final não converte mais ZodError em "Marca inválida".
  const catchFinal = rota.slice(rota.lastIndexOf("} catch (error) {"));
  assert.ok(!catchFinal.includes("Marca inválida"), "o catch genérico não rotula mais dado ruim como marca inválida");
});

test("06 · o diagnóstico é rastreável e não vaza segredo", () => {
  const rota = executable(read(ROUTE));
  assert.match(rota, /const requestId = crypto\.randomUUID\(\)/);
  assert.match(rota, /requestId, data: parsed\.data/, "o id volta ao cliente");
  assert.match(rota, /console\.info\("\[workspace\] leitura"/);
  // Contagens e identidades, nunca credencial ou payload editorial inteiro.
  assert.match(rota, /radarArticleIds: workflow\.radar\.map/);
  for (const proibido of ["token", "cookie", "authorization", "serviceRole", "SERVICE_ROLE"]) {
    assert.ok(!rota.toLowerCase().includes(proibido.toLowerCase() + ":"), `o log não pode carregar ${proibido}`);
  }
});

test("07 · todo desfecho carrega o requestId, inclusive as falhas", () => {
  const rota = executable(read(ROUTE));
  const respostas = rota.split("NextResponse.json(").slice(1);
  assert.ok(respostas.length >= 4, "há mais de um desfecho");
  for (const resposta of respostas) {
    const corpo = resposta.slice(0, resposta.indexOf("}, {") + 1 || 200);
    assert.match(corpo, /requestId/, `resposta sem requestId: ${corpo.slice(0, 80)}`);
  }
});
