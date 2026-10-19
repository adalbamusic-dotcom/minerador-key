/**
 * ===== TODOS OS AVISOS NO SINO — 2026-10-18 (regra do dono) =====
 *
 * Literal do dono: "estes e todos os avisos têm que estar dentro do sino".
 * Resultado de ação (sucesso, falha, parcial, atenção, informação), resumo de
 * lote, falha de leitura e resultado de importação/exportação vão para o sino
 * (`publishNotice` / `useNoticeBridge`, `components/global-notice-center.tsx`).
 * Ficam na tela: andamento, prévia com Confirmar/Cancelar, motivo ao lado do
 * botão desligado, validação de campo, estado vazio e o conteúdo dos painéis.
 *
 * Esta guarda é ESTRUTURAL e lê o código SEM comentários (um comentário que
 * explica uma ausência casaria com a própria busca pela ausência). Ela prova
 * duas coisas por área: a faixa que saiu não voltou, e o aviso continua
 * chegando ao sino pela ponte de sempre.
 */

import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";

/** Comentários de bloco, de JSX (`{/* … *\/}` cai no de bloco) e de linha saem antes de procurar. */
const semComentarios = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const fonte = (caminho: string) => semComentarios(readFileSync(new URL(`../${caminho}`, import.meta.url), "utf8"));

test("Marca · as faixas de resultado saíram; o aviso vai para o sino com o tom", () => {
  const pagina = fonte("modules/marca/brand-page.tsx");
  assert.doesNotMatch(pagina, /function Message\(/, "a faixa amarela da Marca saiu");
  assert.doesNotMatch(pagina, /\{message && <Message/);
  assert.doesNotMatch(pagina, /invitationsReadError \? <Message/);
  assert.match(pagina, /useNoticeBridge\(\{ notice: message, module: "marca", area: "Marca"/);
  assert.match(pagina, /useNoticeBridge\(\{ notice: invitationsReadError \?/, "a falha de leitura dos convites vai para o sino");
  assert.match(pagina, /setMessage\(\{ type: "success", message: "Marca atualizada\." \}\)/);

  const identidade = fonte("modules/marca/brand-dna-panel.tsx");
  assert.doesNotMatch(identidade, /\{message && <p role="status"/);
  assert.match(identidade, /useNoticeBridge\(\{ notice: message, module: "marca"/);

  const entrada = fonte("modules/marca/marca-page-entry.tsx");
  assert.doesNotMatch(entrada, /\{message && <p role="status"/);
  assert.match(entrada, /useNoticeBridge\(\{ notice: message, module: "marca"/);

  const site = fonte("modules/marca/site-sitemap-panel.tsx");
  assert.doesNotMatch(site, /\{notice && <p role=/);
  assert.doesNotMatch(site, /\{parseError && <p role="alert"/);
  assert.match(site, /useNoticeBridge\(\{ notice, module: "marca", area: "Site e Sitemap"/);
  assert.match(site, /useNoticeBridge\(\{ notice: parseError \?/);
  assert.match(site, /\{listError && <p role="alert"/, "o motivo ao lado do botão de enviar fica na tela");

  const skills = fonte("modules/marca/brand-skills-panel.tsx");
  assert.doesNotMatch(skills, /\{error \? <p role="alert" className=\{internalNoticeWarning\}>/);
  assert.doesNotMatch(skills, /\{message \? <p role="status"/);
  assert.match(skills, /useNoticeBridge\(\{ notice: error, module: "marca", area: "Skills e prompts", title: "Marca · Skills", fallbackSeverity: "ERROR" \}\)/);
  assert.match(skills, /useNoticeBridge\(\{ notice: message, module: "marca", area: "Skills e prompts"/);

  const especialistas = fonte("modules/marca/brand-experts-panel.tsx");
  assert.doesNotMatch(especialistas, /\{error \? <p role="alert"/);
  assert.doesNotMatch(especialistas, /\{notice \? <p role="status"/);
  assert.match(especialistas, /useNoticeBridge\(\{ notice: error, module: "marca"/);
  assert.match(especialistas, /useNoticeBridge\(\{ notice, module: "marca"/);

  const ads = fonte("modules/marca/google-ads-connection-panel.tsx");
  assert.doesNotMatch(ads, /\{message && <p role=\{message\.startsWith/);
  assert.match(ads, /\{validationError && <p role="alert"/, "a validação do Customer ID fica ao lado do campo");
});

test("Conta · resultado e falha no sino; validação do campo fica ao lado do campo", () => {
  const marcas = fonte("modules/conta/agency-brands-management.tsx");
  assert.doesNotMatch(marcas, /\{createdBrandName \? <p role="status"/);
  assert.match(marcas, /useNoticeBridge\(\{ notice: createdBrandName \?/);

  const ia = fonte("modules/conta/ai-connections-panel.tsx");
  assert.doesNotMatch(ia, /\{message \? <p role="status"/);
  assert.doesNotMatch(ia, /\{error \? <p role="alert"/);
  assert.match(ia, /useNoticeBridge\(\{ notice: error, module: "perfil"/);
  assert.match(ia, /useNoticeBridge\(\{ notice: message, module: "perfil"/);

  for (const caminho of ["modules/conta/agency-workspace-controls.tsx", "modules/conta/agency-integrations-page.tsx"]) {
    const src = fonte(caminho);
    assert.doesNotMatch(src, /function Result\(/, `${caminho}: a faixa de resultado saiu`);
    assert.doesNotMatch(src, /<Result message=/);
    assert.match(src, /fallbackSeverity: "ERROR" \}\);\s*useNoticeBridge\(\{ notice: message,/, `${caminho}: erro e resultado, cada um com o seu tom`);
  }

  const perfil = fonte("modules/conta/profile-identity-editor.tsx");
  assert.doesNotMatch(perfil, /setNameStatus\(\{ tone: "success"/, "o resultado do nome vai só para o sino");
  assert.doesNotMatch(perfil, /setAvatarStatus\(\{ tone: "success"/, "o resultado da foto vai só para o sino");
  assert.match(perfil, /setNameStatus\(\{ tone: "error", message: "Informe um nome para a identidade\." \}\)/, "a validação do campo fica");
  assert.match(perfil, /publishProfileNotice\("SUCCESS", "Perfil atualizado", "O nome foi salvo e confirmado\."/);
});

test("Admin · as faixas de erro e de resultado saíram; o erro também vai para o sino", () => {
  for (const [caminho, area] of [
    ["modules/admin/agencies-admin-panel.tsx", "Agências"],
    ["modules/admin/communication-admin-panel.tsx", "Comunicação"],
    ["modules/admin/platform-integrations-panel.tsx", "Integrações"],
  ] as const) {
    const src = fonte(caminho);
    assert.doesNotMatch(src, /\{error \? <p role="alert"/, `${caminho}: a faixa de erro saiu`);
    assert.doesNotMatch(src, /\{notice \? <p role="status"/, `${caminho}: a faixa de resultado saiu`);
    assert.match(src, new RegExp(`useNoticeBridge\\(\\{ notice: error, module: "admin", area: "${area}"`), `${caminho}: o erro vai para o sino`);
    assert.match(src, new RegExp(`useNoticeBridge\\(\\{ notice, module: "admin", area: "${area}"`));
  }
  const marcas = fonte("modules/admin/brands-admin-panel.tsx");
  assert.doesNotMatch(marcas, /\{error \? <p role="alert"/);
  assert.match(marcas, /brands\.length === 0 && !error \?/, "falha de leitura não vira \"Nenhuma marca\"");
  const usuarios = fonte("modules/admin/users-admin-panel.tsx");
  assert.doesNotMatch(usuarios, /\{notice && <p role="status"/);
  assert.match(usuarios, /useNoticeBridge\(\{ notice, module: "admin", area: "Usuários"/);
});

test("Publicações · a faixa do topo saiu; o tom vai para o sino", () => {
  const src = fonte("modules/publicacoes/publications-workspace.tsx");
  assert.doesNotMatch(src, /\{notice && <div className="shrink-0 border-b border-amber/);
  assert.match(src, /useNoticeBridge\(\{ notice, module: "publicacoes"/);
  assert.match(src, /setNotice\(\{ type: "success", message: "Ação de Publicações salva\." \}\)/);
  assert.match(src, /setNotice\(\{ type: "success", message: "Manifesto CSV exportado\." \}\)/);
});

test("Redator · mídia e entregável: o desfecho no sino; o andamento fica ao lado do botão", () => {
  const midia = fonte("modules/redator/writer-media-anchor-panel.tsx");
  assert.doesNotMatch(midia, /data-media-mensagem/, "a linha de resultado da mídia saiu");
  assert.doesNotMatch(midia, /etapa === "concluido" && !mensagem/);
  assert.match(midia, /data-media-progresso/, "o andamento fica");
  assert.match(midia, /useNoticeBridge\(\{ notice: aviso, module: "redator"/);
  assert.match(midia, /setMensagem\(erro instanceof Error \? erro\.message : "Falha ao anexar imagem\.", true\)/, "falha vai como erro");

  const ambiente = fonte("modules/redator/writer-derived-environment.tsx");
  assert.doesNotMatch(ambiente, /data-deliverable-erro/);
  assert.match(ambiente, /tom === "erro" \? \{ type: "error", message \}/);
});

test("Minerador · as faixas acima da tabela da Descoberta saíram", () => {
  const pagina = fonte("modules/minerador/discovery/discovery-keywords-page.tsx");
  assert.doesNotMatch(pagina, /\{notice && <p className="mt-3 rounded border border-danger/);
  assert.match(pagina, /useNoticeBridge\(\{ notice, module: "minerador", area: "Descoberta de keywords"/);
  const tabela = fonte("modules/minerador/discovery/discovery-table-placeholder.tsx");
  assert.doesNotMatch(tabela, /\{inlineNotice && <p/);
  assert.match(tabela, /useNoticeBridge\(\{ notice: inlineNotice, module: "minerador"/);
});

/*
 * 2026-10-18 · SDD padrão de planilha §5.7: "Andamento nunca vai para o sino. Um
 * lote publica um aviso, no fim". Os avisos PENDING do início ("Atualizando…",
 * "Medindo…", "Enviando…", "Consultando…") saíram; o andamento fica no botão e
 * na barra do rodapé. Cada lote publica um aviso só, no fim, com o tom.
 */
test("Minerador · o início do lote não vai ao sino; o fim publica um aviso com o tom (SDD §5.7)", () => {
  const arquivos = [
    "modules/minerador/minerador-workspace.tsx",
    "modules/minerador/discovery/discovery-keywords-page.tsx",
    "modules/minerador/discovery/discovery-table-placeholder.tsx",
  ];
  for (const caminho of arquivos) {
    const codigo = fonte(caminho);
    assert.doesNotMatch(codigo, /severity: "PENDING"/, `${caminho}: nenhum aviso de andamento no sino`);
    assert.doesNotMatch(codigo, /publishNotice\(\{[^}]*message: `(Atualizando|Medindo|Enviando)/, `${caminho}: nada de "Atualizando/Medindo/Enviando…" no sino`);
    assert.doesNotMatch(codigo, /showNotification\("info", `(Atualizando|Medindo|Enviando|Processando)/, `${caminho}: nem pelo atalho do Processador`);
  }
  const tabela = fonte("modules/minerador/discovery/discovery-table-placeholder.tsx");
  /* Atualizar métricas: um aviso no fim, sucesso ou falha. */
  const volume = tabela.slice(tabela.indexOf("const measureVolume"), tabela.indexOf("const measureAllintitle"));
  assert.equal((volume.match(/publishNotice\(/g) || []).length, 2, "um de sucesso, um de falha — e só no fim");
  assert.match(volume, /severity: "SUCCESS", title: "Métricas atualizadas"/);
  assert.match(volume, /severity: "ERROR", title: "Atualização de métricas"/);
  /* Medir resultados: SUCCESS só com todas medidas, WARNING parcial, ERROR sem nenhuma. */
  const medicao = tabela.slice(tabela.indexOf("const measureAllintitle"), tabela.indexOf("const importSelected"));
  assert.match(medicao, /const severidade = measuredCount >= pedidas \? "SUCCESS" : measuredCount > 0 \? "WARNING" : "ERROR";/);
  /* Enviar ao Processador: o tom do resultado (sucesso, parcial, falha). */
  const importacao = tabela.slice(tabela.indexOf("const importSelected"));
  assert.match(importacao, /const severity = result\.failed === 0 && succeeded \? "SUCCESS" : succeeded \? "WARNING" : "ERROR";/);
  /* A busca da Descoberta: o fim com o tom (parcial vira WARNING). */
  const pagina = fonte("modules/minerador/discovery/discovery-keywords-page.tsx");
  const busca = pagina.slice(pagina.indexOf("const discover = async"), pagina.indexOf("const acceptSourceResult"));
  assert.match(busca, /severity: payload\.partial \? "WARNING" : "SUCCESS"/);
  assert.match(busca, /severity: "ERROR", title: "Descoberta de keywords"/);
  /* O Processador: o lote progressivo diz o andamento na barra do rodapé, não no sino. */
  const processador = fonte("modules/minerador/minerador-workspace.tsx");
  assert.match(processador, /bulkProgress\.status === "processing" \? bulkProgress\.message \|\| bulkProgressMeta\.processingLabel/);
});

test("Radar · as faixas do topo saíram; o resultado vai ao sino com o tom; o andamento fica numa linha só", () => {
  const pagina = fonte("modules/radar/radar-page.tsx");
  assert.doesNotMatch(pagina, /\{notice && <div className="shrink-0 border-b border-warning/, "a faixa amarela do topo (a do \"Artigo-modelo: 0 pronto(s) e 1 com falha\") saiu");
  assert.doesNotMatch(pagina, /data-testid="radar-export-notice"/, "a faixa do export saiu");
  assert.doesNotMatch(pagina, /data-testid="radar-local-recovery-warning"/, "a faixa da recuperação local saiu");
  assert.match(pagina, /useNoticeBridge\(\{ notice: resultadoDoAviso\(notice\), module: "radar"/, "só o resultado vai ao sino");
  assert.match(pagina, /useNoticeBridge\(\{ notice: pipeline\?\.localRecoveryWarning \|\| ""/);
  assert.match(pagina, /data-testid="radar-andamento"/, "o andamento fica na tela");
  assert.match(pagina, /setNotice\(emAndamento\(`Analisando páginas \$\{processadas\} de \$\{candidates\.length\}…`\)\)/, "\"Analisando páginas x de N\" é andamento, não aviso");
  /* 2026-10-18 · o lote do artigo-modelo entrou no "Pesquisar e finalizar": um aviso só no fim, com o tom do lote. */
  assert.match(pagina, /setNotice\(avisoDoLote\(\{ done: confirmados\.filter\(item => item\.status !== "REFUSED"\)/, "o resumo do lote vai com o tom do lote");
  assert.match(pagina, /data-testid="radar-planilha-leitura-falhou"/, "a falha de leitura da lista, que tem o botão \"Tentar carregar novamente\", fica na tela");
  assert.match(pagina, /renderBulkBar=\{rows => <div className="flex min-w-0 flex-wrap/, "a barra de lote quebra linha em vez de cortar botão");

  for (const [caminho, sumiu] of [
    ["modules/radar/radar-analysis-page.tsx", /\{notice && <div className="border-b border-warning/],
    ["modules/radar/radar-expert-brief-panel.tsx", /data-testid="radar-specialist-direct-outcome"/],
    ["modules/radar/radar-architect-update-panel.tsx", /data-testid="radar-architect-update-error"/],
    ["modules/radar/radar-refreeze-panel.tsx", /data-testid=\{`\$\{prefixo\}-error`\}/],
    ["modules/radar/radar-silo-links-panel.tsx", /\{erro && <p/],
    ["modules/radar/radar-article-blueprint-panel.tsx", /data-testid="radar-article-blueprint-job-failed"/],
    ["modules/radar/expert-contribution-panel.tsx", /\{notice && <p/],
  ] as const) {
    const src = fonte(caminho);
    assert.doesNotMatch(src, sumiu, `${caminho}: a linha de aviso saiu`);
    assert.match(src, /useNoticeBridge\(/, `${caminho}: o aviso vai ao sino`);
  }
  const especialista = fonte("modules/radar/radar-expert-brief-panel.tsx");
  assert.doesNotMatch(especialista, /\{error && <p className="rounded-md border border-warning/);
  assert.doesNotMatch(especialista, /\{notice && <p className="rounded-md border border-divider/);

  const barra = fonte("modules/radar/radar-r4-bulk-operations-bar.tsx");
  assert.doesNotMatch(barra, /Lote encerrado\./, "o lote encerrado não fica como faixa: o desfecho vai ao sino");
  assert.match(barra, /if \(!progress \|\| !progress\.active\) return null;/);
  assert.match(barra, /className="flex min-w-0 flex-wrap items-center gap-2" data-testid="radar-r4-bulk-bar"/);
});

test("Componentes · a ponte do sino, o cartão de tarefas, o Redator e o rodapé da planilha", () => {
  const centro = fonte("components/global-notice-center.tsx");
  assert.match(centro, /if \(!publishNotice\) return;/, "fora do provider (teste isolado) a ponte não derruba a tela");
  assert.doesNotMatch(centro, /without replacing\s+\* the module's immediate feedback/);

  const cartao = fonte("components/editorial/background-task-notice.tsx");
  assert.match(cartao, /const tasks = todas\.filter\(task => task\.status === "queued" \|\| task\.status === "running"\);/, "o cartão é só andamento");
  const arquiteto = fonte("modules/arquiteto/arquiteto-workspace.tsx");
  assert.match(arquiteto, /showNotification\("error", `\$\{task\.label\}: /, "a tarefa que falhou vai ao sino");

  const redator = fonte("components/editorial/professional-writer.tsx");
  assert.match(redator, /useNoticeBridge\(\{ notice: avisoDoRedator, module: "redator"/);
  for (const texto of ["Guardião atualizado; a decisão continua humana.", "Pacote entregue a Publicações e confirmado na leitura remota.", "Proposta aplicada como novos parágrafos editáveis.", "URL inválida; o link não foi inserido."]) {
    const inicio = redator.indexOf(texto);
    assert.ok(inicio > 0, texto);
    assert.doesNotMatch(redator.slice(Math.max(0, inicio - 40), inicio), /setSaveMessage\(/, `"${texto}" vai ao sino, não à linha da barra`);
  }
  assert.match(redator, /setSaveMessage\("Analisando o documento…"\)/, "o andamento continua na linha da barra");

  const grade = fonte("components/editorial/operational-data-grid.tsx");
  assert.match(grade, /<footer className=\{`flex shrink-0 flex-wrap items-center justify-between gap-2 border-t/, "o rodapé quebra linha em vez de cortar");
  assert.doesNotMatch(grade.slice(grade.indexOf("<footer"), grade.indexOf("<footer") + 200), /overflow-x-auto/);
});

test("Arquiteto · resumo do lote, falhas e desfechos no sino; prévia, andamento e retomada na tela", () => {
  const planilha = fonte("modules/arquiteto/plan-article-sheet.tsx");
  assert.doesNotMatch(planilha, /data-testid="architect-plan-sheet-summary"/, "o resumo do lote não é faixa na tela");
  assert.doesNotMatch(planilha, /\{error && <p role="alert"/);
  assert.match(planilha, /onNotifyRef\.current\?\.\(summary\.tone === "neutral" \? "info" : summary\.tone, summary\.text\)/);
  assert.match(planilha, /onNotifyRef\.current\?\.\("error", error\)/);
  assert.match(planilha, /data-testid="architect-plan-sheet-resume"/, "a retomada (com botão) fica");
  assert.match(planilha, /data-testid="architect-plan-row-result"/, "o resultado de cada linha é conteúdo da tabela");

  const melhoria = fonte("modules/arquiteto/article-improvement-panel.tsx");
  assert.doesNotMatch(melhoria, /\{error && <p role="alert"/);
  assert.doesNotMatch(melhoria, /run\.notices\)\]\.filter\([^)]*\)\.map\(\(notice, i\) => <p/);
  assert.match(melhoria, /onNotifyRef\.current\?\.\("error", error\)/);

  const reforco = fonte("modules/arquiteto/published-reinforcement-panel.tsx");
  assert.doesNotMatch(reforco, /data-testid="architect-reinforcement-outcome"/);
  assert.doesNotMatch(reforco, /\{search\.message && !rodando && <p/);
  const ganchoDoReforco = fonte("modules/arquiteto/use-published-reinforcement.ts");
  assert.match(ganchoDoReforco, /onNotify\?\.\(desfecho\.tone, \[desfecho\.message, \.\.\.desfecho\.lines\]\.join\(" · "\)\)/);
  assert.match(ganchoDoReforco, /onNotifyRef\.current\?\.\(search\.run\?\.pages\.some\(page => page\.state === "ads_error"\) \? "warning" : "info", texto\)/);

  const arquitetura = fonte("modules/arquiteto/architecture-panel.tsx");
  assert.doesNotMatch(arquitetura, /data-testid="architect-architecture-confirmed"/);

  const tela = fonte("modules/arquiteto/arquiteto-workspace.tsx");
  assert.doesNotMatch(tela, /\{linksError && <p/, "a faixa de erro da aba Links saiu");
  assert.doesNotMatch(tela, /\{siloWorkingCopyConflict && \(/, "a faixa repetida do conflito saiu");
  assert.match(tela, /onNotify: showNotification,/, "as linhas do plano publicam pelo aviso de sempre");
  assert.match(tela, /onNotify=\{showNotification\}/, "o refazedor publica pelo aviso de sempre");
  for (const texto of ["A alteração não corresponde ao contrato do grafo.", "A relação não corresponde ao contrato canônico."]) {
    const trecho = tela.slice(tela.indexOf(texto), tela.indexOf(texto) + 220);
    assert.match(trecho, /setLinksError\(mensagem\);\s*showNotification\("error", mensagem\);/, `a falha "${texto}" da aba Links vai ao sino`);
  }
  const leitura = tela.slice(tela.indexOf("Não foi possível carregar o InternalLinkGraph canônico."), tela.indexOf("Não foi possível carregar o InternalLinkGraph canônico.") + 260);
  assert.match(leitura, /showNotification\("error", message\);/, "a falha de leitura da aba Links vai ao sino");
});
