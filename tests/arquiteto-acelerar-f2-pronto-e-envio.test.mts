import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

/*
 * SDD `docs/compartilhado/sdd-acelerar-fluxo-do-plano-2026-10-13.md`, item 5
 * (F2): depois do grafo aprovado, "Marcar Pronto para Radar e enviar os N
 * artigos deste Silo" numa decisão — prévia por artigo, marcação com releitura,
 * envio só depois (com recusa por artigo) e os dois botões de sempre mantidos.
 * Leitura estrutural da tela, sem comentários.
 */

const semComentarios = (texto: string) => texto
  .replace(/\/\*[\s\S]*?\*\//g, "")
  .split("\n")
  .filter(linha => !linha.trimStart().startsWith("//"))
  .join("\n");
const workspace = semComentarios(readFileSync("modules/arquiteto/arquiteto-workspace.tsx", "utf8"));

test("item 5 · o botão aparece só com o grafo aprovado e atual, e abre a prévia pelo mesmo portão", () => {
  assert.match(workspace, /\{linksApprovedGraph && !linksPhaseReading\.graphStale && !linksIsDirty && linksSiloArticleIds\.length > 0 && \(/);
  assert.match(workspace, /`Marcar Pronto para Radar e enviar os \$\{linksSiloArticleIds\.length\} artigos deste Silo`/);
  assert.match(workspace, /setSelectedArticleIds\(new Set\(linksSiloArticleIds\)\);\s*setReadySendPreviewOpen\(true\);/);
  const previa = workspace.slice(workspace.indexOf("{readySendPreviewOpen && (() => {"), workspace.indexOf("architect-links-ready-and-send-confirm"));
  assert.match(previa, /planReadyForRadarBatch\(selectedArticleOperational\.map\(item => item\.input\)\)/);
  assert.match(previa, /architectArticleNoticeLabel\(\{ subjectPhrase:/, "cada artigo por Assunto, principal e slug");
  // Os dois botões de sempre continuam.
  assert.match(workspace, /data-testid="architect-links-confirm"/);
  assert.match(workspace, /<ArrowRight className="h-3 w-3"\/>Enviar ao Radar<\/button>/);
});

test("item 5 · marcar primeiro (com releitura); só então enviar; nada é enviado se a marcação falhar", () => {
  assert.match(workspace, /const markSelectedReadyForRadar = async \(depoisDaSerp = false\): Promise<"marked" \| "already" \| "serp_reread" \| "none" \| "failed">/);
  const seguir = workspace.slice(workspace.indexOf("const seguirParaEnvio = ("), workspace.indexOf("const seguirParaEnvioRef = useRef("));
  assert.match(seguir, /if \(desfecho === "marked" \|\| desfecho === "already"\) setReadySendStage\("send"\);/);
  assert.match(seguir, /Nada foi enviado ao Radar/);
  const confirmar = workspace.slice(workspace.indexOf("const confirmReadySend = async"), workspace.indexOf("const confirmReadySend = async") + 400);
  assert.match(confirmar, /readySendChainRef\.current = true;\s*const desfecho = await markReadyRef\.current\(\);\s*seguirParaEnvioRef\.current\(desfecho\);/);
  // A SERP velha relida no meio continua a cadeia depois da marcação refeita.
  assert.match(workspace, /void markReadyRef\.current\(true\)\.then\(desfecho => seguirParaEnvioRef\.current\(desfecho\)\);/);
});

test("item 5 · o envio sai num render seguinte e recusa por artigo: estreita a seleção aos prontos e diz quem ficou", () => {
  const efeito = workspace.slice(workspace.indexOf("if (readySendStage !== \"send\" || updating || serpBusy) return;"), workspace.indexOf("const linksSiloArticleIds = useMemo("));
  assert.match(efeito, /canSendToRadar\(item\.state\.workflowStatus\) && !item\.input\.gateIssues\.length/);
  assert.match(efeito, /setSelectedArticleIds\(new Set\(ficam\)\);/);
  assert.match(efeito, /não vão ao Radar agora/);
  assert.match(efeito, /void sendToRadarRef\.current\(\);/);
});
