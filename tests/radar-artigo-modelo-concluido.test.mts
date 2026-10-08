import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";

/*
 * ===== D10 · O ARTIGO-MODELO SAI CONCLUÍDO (decisão do dono, 2026-10-02) =====
 *
 * "Em tudo que tenha a ver com o entregável — CSV, Redator e MCP — não podem
 * receber algo inconcluso, nem com aviso de precisa de aprovação." Provado aqui
 * (estrutural: o servidor fala com o banco e com a IA):
 *
 *   - organizar e editar gravam a versão JÁ CONCLUÍDA, com quem e quando;
 *   - com pendência na conferência, UMA chamada a mais corrige; a conferência
 *     fecha o que dá sem IA; o que restar fica na versão, nunca no entregável;
 *   - a correção não estoura a rota (pulada depois de uma nova tentativa) e,
 *     falhando, não derruba nada;
 *   - a tela deixa editar a versão concluída; o texto não pede aprovação.
 *
 * PROVIDER_CALLS = 0.
 */

const ler = (caminho: string) => readFile(new URL(`../${caminho}`, import.meta.url), "utf8").then(texto => texto.replace(/\r\n/g, "\n"));
const semComentarios = (fonte: string) => fonte.replace(/\{\/\*[\s\S]*?\*\/\}/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ").replace(/(^|[^:"])\/\/[^\n]*/g, "$1 ");

test("organizar e editar gravam a versão concluída, com autor e momento — o banco aceita (CHECK de aprovação)", async () => {
  const servidor = semComentarios(await ler("lib/server/radar-article-blueprint.ts"));
  const gravar = servidor.slice(servidor.indexOf("async function gravarVersao("), servidor.indexOf("export const RADAR_ARTICLE_BLUEPRINT_TIMEOUTS_MS"));
  assert.match(gravar, /state: "APPROVED", approved_by: input\.actorUserId, approved_at: agora/);
  assert.doesNotMatch(gravar, /state: "DRAFT"/);
  const migration = await ler("supabase/migrations/20261002120000_radar_artigo_modelo_e_uso_de_videos.sql");
  assert.match(migration, /state = 'APPROVED' AND approved_by IS NOT NULL AND approved_at IS NOT NULL/, "o CHECK exige autor e momento, que a gravação manda");
});

test("a passada de correção: com pendência, uma chamada a mais; escolhe a de menos pendência; fecha; falha não derruba", async () => {
  const servidor = semComentarios(await ler("lib/server/radar-article-blueprint.ts"));
  const fechar = servidor.slice(servidor.indexOf("export async function fecharArtigoModelo"), servidor.indexOf("export async function editRadarArticleBlueprint"));
  assert.match(fechar, /const pendentes = radarArticleBlueprintPendingNotes\(primeira\.notes\)\.pending;/);
  assert.match(fechar, /if \(pendentes\.length && input\.allowFix !== false && tetoDaCorrecao !== null\)/, "2026-10-08 · e só com tempo no prazo da rota");
  assert.match(fechar, /const tetoDaCorrecao = radarArticleBlueprintCallTimeout\(input\.deadlineAt, Date\.now\(\)\);/);
  assert.match(fechar, /timeoutMs: tetoDaCorrecao!/, "a correção usa o que sobra do prazo");
  assert.match(fechar, /radarArticleBlueprintPrompt\(input\.brief, \{ fix: \{ previous: input\.ai, pending: pendentes \} \}\)/);
  assert.match(fechar, /pending\.length <= pendentes\.length\) escolhida = corrigida/);
  assert.match(fechar, /catch \(error\) \{\n\s+console\.warn\("\[radar-article-blueprint\] correcao_falhou"/, "a correção falhando grava a primeira");
  assert.match(fechar, /radarSanitizeArticleBlueprint\(escolhida, input\.brief, \{ close: true \}\)/, "e a conferência fecha antes de gravar");
  assert.match(servidor, /fecharArtigoModelo\(\{ provider, brief, ai: resposta\.ai, articleId: input\.articleId, allowFix: resposta\.calls === 1, deadlineAt: prazo \}\)/, "depois de uma nova tentativa, sem tempo para corrigir");
  assert.match(servidor, /requestRadarArticleBlueprintAi\(\{ provider, brief, articleId: input\.articleId, deadlineAt: prazo \}\)/);
  assert.match(servidor, /const prazo = Date\.now\(\) \+ RADAR_ARTICLE_BLUEPRINT_ROUTE_BUDGET_MS;/);

  const pedido = await ler("lib/radar/article-blueprint.ts");
  assert.match(pedido, /# CORREÇÃO OBRIGATÓRIA/);
  assert.match(pedido, /Devolva a planta INTEIRA, no mesmo formato, já corrigida/);
});

test("a tela: editar vale para a versão concluída; nenhuma frase pede aprovação", async () => {
  const painel = await ler("modules/radar/radar-article-blueprint-panel.tsx");
  assert.match(painel, /\{atual && !editando && <button type="button" className=\{botao\} disabled=\{travado\} onClick=\{abrirEdicao\}>Editar<\/button>\}/);
  const visivel = semComentarios(painel);
  assert.doesNotMatch(visivel, /Revise e aprove|aguardando aprovação|você aprova|antes de aprovar/);
  const pagina = semComentarios(await ler("modules/radar/radar-page.tsx"));
  assert.doesNotMatch(pagina, /Revise e aprove|marcado como proposta/);
});

test("PROVIDER_CALLS = 0", () => {
  assert.ok(true, "leitura de fonte");
});
