/**
 * SMOKE SÓ DE LEITURA do retrato da marca que as IAs recebem pelo MCP.
 *
 * Roda o MESMO leitor das ferramentas (`readPlatformState`, busca de tema e
 * próximos passos) contra o banco real, para conferir que os caminhos jsonb e
 * os filtros devolvem o que a tela mostra. Nenhuma escrita, nenhuma chamada
 * paga.
 *
 *   node --conditions=react-server --import ./scripts/node-ts-register.mjs \
 *     scripts/agent-platform-state-smoke.mts <brandId> ["tema"]
 */
import { readFileSync } from "node:fs";

for (const linha of readFileSync(new URL("../.env.local", import.meta.url), "utf8").split(/\r?\n/)) {
  const match = linha.match(/^([A-Z0-9_]+)=(.*)$/);
  if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^"|"$/g, "");
}

const [brandId, tema] = process.argv.slice(2);
if (!brandId) {
  console.error("uso: agent-platform-state-smoke.mts <brandId> [tema]");
  process.exit(1);
}

const { readPlatformState, readPublishedPagesForMatching, topicCandidatesFrom } = await import("../lib/server/agent-platform-state.ts");
const { resolveNextActions } = await import("../lib/agent/next-actions.ts");
const { lookupTopic } = await import("../lib/agent/topic-match.ts");

const inicio = Date.now();
const estado = await readPlatformState(brandId);
const bytes = Buffer.byteLength(JSON.stringify(estado));

console.log(`# ${estado.brand.brandName} — lido em ${Date.now() - inicio} ms, ${(bytes / 1024).toFixed(1)} kB`);
console.log("telas:", estado.brand.screens.minerador);
console.log("minerador:", JSON.stringify({ total: estado.minerador.total, byStatus: estado.minerador.byStatus, assuntos: estado.minerador.subjects.length, aprovadasNaoEnviadas: estado.minerador.approvedNotSentIds.length }));
console.log("arquiteto: recebidas", estado.arquiteto.receivedKeywords, "· artigos", estado.arquiteto.articles.length, "· silos", estado.arquiteto.silos.length);
for (const artigo of estado.arquiteto.articles.slice(0, 8)) {
  console.log("  artigo:", JSON.stringify({ id: artigo.articleId.slice(-12), promessa: artigo.promise.slice(0, 60), slug: artigo.slug, principal: artigo.principalKeyword, hierarquia: artigo.hierarchy, etapa: artigo.workflowState, silo: artigo.siloId?.slice(-12) }));
}
for (const silo of estado.arquiteto.silos) {
  console.log("  silo:", JSON.stringify({ nome: silo.name, pilar: silo.pillarArticleId?.slice(-12), suportes: silo.supportArticleIds.length, formacao: silo.formationStatus, pagina: silo.page }));
}
console.log("radar:", JSON.stringify(estado.radar.items.map(item => item.state)));
console.log("redator:", JSON.stringify(estado.redator.documents.map(documento => ({ titulo: documento.title.slice(0, 50), status: documento.status }))));
console.log("publicados:", estado.published.total, "·", estado.published.pages.slice(0, 3).map(page => page.url).join(" | "));
if (estado.truncated.length) console.log("cortes:", estado.truncated);

console.log("\n# próximos passos");
const { actions, playbook } = resolveNextActions(estado);
for (const acao of actions) console.log(`- [${acao.who}] ${acao.title} — ${acao.reason}`);
if (playbook) console.log("playbook sugerido:", playbook);

if (tema) {
  const publicados = await readPublishedPagesForMatching(brandId);
  const busca = lookupTopic(tema, topicCandidatesFrom(estado, publicados));
  console.log(`\n# tema "${tema}"`);
  console.log(busca.reading);
  for (const item of [...busca.same, ...busca.related].slice(0, 8)) console.log(`  ${item.score}/${item.fit} ${item.kind} · ${item.text.slice(0, 70)} · ${item.where}`);
}
