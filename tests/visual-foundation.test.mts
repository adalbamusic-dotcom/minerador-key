import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import test from "node:test";
import {
  createNoticeRecord,
  formatNoticeDiagnostic,
  NOTICE_PREVIEW_DURATION_MS,
  NOTICE_SEVERITIES,
  noticeToneToken,
  sanitizeCopyPayload,
  validateNoticeInput,
} from "../lib/visual-notice-contract.ts";
import { resolveNoticeScope } from "../lib/visual-notice-scope.ts";

const root = new URL("../", import.meta.url);
const read = (file: string) => readFile(new URL(file, root), "utf8");

test("tokens visuais oficiais e temas permanecem centralizados", async () => {
  const css = await read("app/globals.css");
  for (const value of ["#131413", "#f3f4f6", "#193cb8", "#12A1E0", "#10DDE0", "#63F1AF", "#C8FF00", "#1fcb0a", "#f79001", "#E6CE00", "#A61E1E", "#212121", "#d1d1d1"]) {
    assert.match(css, new RegExp(value.replace("#", "\\#")));
  }
  assert.match(css, /--color-success: var\(--success\)/);
  assert.match(css, /--color-danger: var\(--danger\)/);
  assert.match(css, /data-theme="light"/);
});

test("severidades globais mapeiam para tokens semânticos e histórico de sessão", () => {
  assert.deepEqual(NOTICE_SEVERITIES, ["SUCCESS", "INFO", "PENDING", "WARNING", "ERROR"]);
  assert.equal(noticeToneToken("SUCCESS"), "success");
  assert.equal(noticeToneToken("INFO"), "context-accent");
  assert.equal(noticeToneToken("PENDING"), "pending");
  assert.equal(noticeToneToken("WARNING"), "warning");
  assert.equal(noticeToneToken("ERROR"), "danger");
  const fixture = NOTICE_SEVERITIES.map((severity, index) => createNoticeRecord({
    severity,
    title: `Fixture ${severity}`,
    message: "Aviso de regressão visual.",
    source: severity === "SUCCESS" ? "persistence" : "validation",
    confirmed: severity === "SUCCESS",
  }, 100 + index, `fixture-${severity}`));
  assert.deepEqual(fixture.map((notice) => notice.severity), [...NOTICE_SEVERITIES]);
  assert.equal(fixture[0].readState, "unread");
  assert.equal(fixture[0].readAt, null);
  assert.equal(NOTICE_PREVIEW_DURATION_MS, 5_000);
});

test("escopo de notice usa somente o tenant canônico e separa áreas", () => {
  const brandId = "09762023-d0d4-4c24-b34e-d0fdfd43f891";
  const otherBrandId = "19762023-d0d4-4c24-b34e-d0fdfd43f891";
  const agencyId = "29762023-d0d4-4c24-b34e-d0fdfd43f891";
  const minerador = resolveNoticeScope(`/care-glow--${brandId}/minerador`);
  const radar = resolveNoticeScope(`/care-glow--${brandId}/radar`);
  const radarDetail = resolveNoticeScope(`/care-glow--${brandId}/radar/article-123`);
  const otherBrand = resolveNoticeScope(`/outra-marca--${otherBrandId}/minerador`);
  const agency = resolveNoticeScope(`/agencias/adalbapro--${agencyId}/integracoes`);
  const admin = resolveNoticeScope("/admin");

  assert.equal(minerador?.key, `brand:${brandId}:minerador`);
  assert.equal(minerador?.brandId, brandId);
  assert.equal(radar?.key, `brand:${brandId}:radar`);
  assert.equal(radarDetail?.key, `brand:${brandId}:radar`);
  assert.notEqual(minerador?.key, radar?.key);
  assert.equal(otherBrand?.key, `brand:${otherBrandId}:minerador`);
  assert.notEqual(minerador?.key, otherBrand?.key);
  assert.equal(agency?.key, `agency:${agencyId}:agencia`);
  assert.equal(admin?.key, "global:admin");
  assert.equal(resolveNoticeScope("/rota-desconhecida"), null);
});

test("SUCCESS de persistência exige confirmação real", () => {
  assert.throws(() => validateNoticeInput({ severity: "SUCCESS", title: "Salvo", message: "Salvo", source: "persistence" }), /confirmação real/);
  assert.doesNotThrow(() => validateNoticeInput({ severity: "SUCCESS", title: "Salvo", message: "Salvo", source: "persistence", confirmed: true }));
});

test("diagnóstico sanitiza segredos e preserva o contrato do notice", () => {
  const notice = createNoticeRecord({
    severity: "ERROR",
    title: "Falha de validação",
    message: "authorization=Bearer secret-value",
    details: "A operação foi bloqueada.",
    metadata: { summary: "4 encontradas · 4 aprovadas", token: "must-not-persist" },
    source: "validation",
    copyPayload: { token: "secret", authorization: "Bearer secret", safe: "kept" },
  }, 100, "notice-test");
  const diagnostic = formatNoticeDiagnostic(notice);
  assert.equal(notice.id, "notice-test");
  assert.equal(notice.metadata?.summary, "4 encontradas · 4 aprovadas");
  assert.match(diagnostic, /safe/);
  assert.doesNotMatch(diagnostic, /secret-value|Bearer secret/);
  assert.doesNotMatch(diagnostic, /"token"|"authorization"|must-not-persist/);
  assert.deepEqual(sanitizeCopyPayload({ cookie: "private", nested: { value: "ok" } }), { nested: { value: "ok" } });
});

test("guard visual passa na fundação e detecta regressões proibidas", async () => {
  const result = spawnSync(process.execPath, ["scripts/check-visual-system.mjs"], { cwd: new URL("../", import.meta.url), encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  const { findVisualViolations } = await import("../scripts/check-visual-system.mjs");
  assert.ok(findVisualViolations("<div className=\"text-purple-500\" style={{ color: '#fff' }} />").length >= 2);
});

test("topbar, provider e piloto Minerador compartilham a infraestrutura", async () => {
  const [topbar, provider, shell, minerador] = await Promise.all([
    read("components/global-topbar.tsx"),
    read("components/global-notice-center.tsx"),
    read("components/product-shell.tsx"),
    read("modules/minerador/minerador-workspace.tsx"),
  ]);
  assert.match(topbar, /h-10/);
  assert.match(topbar, /data-topbar-mode/);
  assert.match(topbar, /data-topbar-center-slot/);
  assert.match(provider, /setNotices/);
  assert.match(provider, /setToast\(input\.showToast && scope \? record : null\)/);
  assert.doesNotMatch(provider, /NOTICE_RETENTION_MS|setInterval/);
  assert.match(provider, /createPortal/);
  assert.match(provider, /className="fixed z-50/);
  assert.match(provider, /updatePanelPosition/);
  assert.match(provider, /visibleNotices/);
  assert.match(provider, /autoOpenNotice/);
  assert.match(provider, /onPointerEnter={markPanelInteracting}/);
  assert.match(shell, /<GlobalTopbar \/>/);
  assert.doesNotMatch(shell, /Notifica.*ainda n.o dispon.vel/);
  assert.match(minerador, /useNoticeCenter/);
  assert.match(minerador, /useGlobalTopbarControlsRegistration/);
  assert.doesNotMatch(minerador, /notificationTimerRef|setNotification\(/);
});

test("Notification Center preserva histórico e oferece fechamento acessível", async () => {
  const provider = await read("components/global-notice-center.tsx");
  assert.match(provider, /markNoticeRead/);
  assert.match(provider, /markAllNoticesRead/);
  assert.match(provider, /const dismissNotice = markNoticeRead/);
  assert.match(provider, /pointerdown/);
  assert.match(provider, /event\.key !== "Escape"/);
  assert.match(provider, /aria-controls=\{panelId\}/);
  assert.match(provider, /const panelId = "global-notification-center"/);
  assert.match(provider, /formatNoticeTime\(notice.createdAt\)/);
  assert.match(provider, /Histórico operacional desta sessão · disponível até recarregar ou sair\./);
  assert.match(provider, /Marcar todos como lidos/);
  assert.match(provider, /Marcar como lido/);
  assert.match(provider, /consumeAutoOpenNotice/);
  assert.match(provider, /NOTICE_PREVIEW_DURATION_MS/);
});

test("R1 mantém alinhamento, ordem, busca responsiva e perfil compacto", async () => {
  const [topbar, shell] = await Promise.all([read("components/global-topbar.tsx"), read("components/product-shell.tsx")]);
  const titlePosition = topbar.indexOf("<h1");
  const undoPosition = topbar.indexOf('aria-label={moduleControls.history.undoLabel || "Desfazer"}');
  assert.ok(titlePosition >= 0 && undoPosition > titlePosition, "o título deve aparecer antes dos controles operacionais do módulo");
  assert.match(topbar, /max-w-\[50ch\]/);
  assert.doesNotMatch(topbar, /maxLength/);
  assert.match(topbar, /pageActions/);
  assert.match(topbar, /ProfilePopover/);
  assert.match(topbar, /SessionLogoutButton/);
  assert.match(topbar, /aria-haspopup="dialog"/);
  assert.doesNotMatch(topbar, /max-w-28/);
  assert.match(shell, /h-10 min-h-10 items-center justify-between border-b border-divider/);
  assert.match(shell, /border-r border-divider/);
});

test("R1.1 mantém o popover do perfil fora do clipping do slot direito", async () => {
  const topbar = await read("components/global-topbar.tsx");
  assert.match(topbar, /items-center justify-end gap-1 overflow-visible/);
  assert.doesNotMatch(topbar, /items-center justify-end gap-1 overflow-hidden/);
  assert.match(topbar, /absolute right-0 top-full z-50/);
});

test("R2 mantém cards flutuantes neutros e severidade apenas semântica", async () => {
  const [topbar, notice] = await Promise.all([read("components/global-topbar.tsx"), read("components/global-notice-center.tsx")]);
  assert.doesNotMatch(topbar, /border-border/);
  assert.doesNotMatch(notice, /border-border/);
  assert.match(topbar, /border-divider bg-surface-elevated/);
  assert.match(notice, /border-divider bg-surface-elevated/);
  assert.match(notice, /border-divider bg-surface-subtle/);
  assert.match(notice, /SUCCESS: "text-success"/);
  assert.match(notice, /INFO: "text-context-accent"/);
  assert.match(notice, /PENDING: "text-pending"/);
  assert.match(notice, /WARNING: "text-warning"/);
  assert.match(notice, /ERROR: "text-danger"/);
  assert.doesNotMatch(notice, /bg-(?:success-soft|pending-soft|warning-soft|danger-soft)/);
});

test("R2.1 conecta a Topbar aos controles canônicos do Minerador", async () => {
  const [topbar, minerador, historyControls, shell] = await Promise.all([
    read("components/global-topbar.tsx"),
    read("modules/minerador/minerador-workspace.tsx"),
    read("components/editorial/history-controls.tsx"),
    read("components/product-shell.tsx"),
  ]);
  assert.match(topbar, /className="truncate text-sm font-semibold uppercase text-context-accent"/);
  assert.match(topbar, /marca: "Marca"/);
  assert.match(topbar, /moduleControls\.search\.getValue\(\)/);
  assert.match(topbar, /moduleControls\.search\?\.setValue/);
  assert.match(topbar, /moduleControls\.history\.getCount\(\)/);
  assert.match(topbar, /moduleControls\.history\.open/);
  assert.doesNotMatch(topbar, /searchValue|historyEntries|global-topbar-search.*CustomEvent/);
  assert.match(minerador, /const \[searchQuery, setSearchQuery\] = useState/);
  assert.match(minerador, /getValue: \(\) => searchQuery/);
  assert.match(minerador, /setValue: \(value\) => setSearchQuery\(value\)/);
  assert.match(minerador, /getCount: \(\) => keywordHistory\.entries\.length/);
  assert.match(minerador, /moduleId="minerador"/);
  assert.match(minerador, /global-topbar-history/);
  assert.match(historyControls, /global-topbar-history/);
  assert.match(shell, /GlobalTopbarControlsProvider/);
  assert.doesNotMatch(minerador, /global-topbar-search.*addEventListener/);
});

test("R2.2C mantém ícones curvos e interação discreta nos campos globais", async () => {
  const [topbar, css] = await Promise.all([read("components/global-topbar.tsx"), read("app/globals.css")]);
  assert.doesNotMatch(topbar, /router\.back\(\)|router\.forward\(\)|window\.history\.(back|forward)\(\)/);
  assert.match(topbar, /import \{ CornerUpLeft, CornerUpRight, History, Search \} from "lucide-react"/);
  assert.match(topbar, /<CornerUpLeft className="h-4 w-4"/);
  assert.match(topbar, /<CornerUpRight className="h-4 w-4"/);
  assert.doesNotMatch(topbar, /ArrowLeft|ArrowRight/);
  assert.match(topbar, /h-7 w-7[^\n]*rounded-full[^\n]*border border-divider bg-surface-subtle[^\n]*aria-label=\{moduleControls\.history\.undoLabel \|\| "Desfazer"\}/);
  assert.match(topbar, /h-7 w-7[^\n]*rounded-full[^\n]*border border-divider bg-surface-subtle[^\n]*aria-label=\{moduleControls\.history\.redoLabel \|\| "Refazer"\}/);
  assert.doesNotMatch(topbar, /aria-label=\{moduleControls\.history\.(?:undoLabel|redoLabel)[^\n]*rounded-md/);
  assert.match(topbar, /undoTitle \|\| "Desfazer última alteração"/);
  assert.match(topbar, /redoTitle \|\| "Refazer alteração"/);
  assert.match(topbar, /<History className="h-4 w-4"/);
  assert.match(topbar, /aria-label=\{moduleControls\.history\.historyLabel \|\| "Histórico"\}/);
  assert.match(topbar, /historyTitle\?\.\(moduleControls\.history\.getCount\(\)\) \|\| `Histórico/);
  const searchInputLine = topbar.match(/<input id="global-topbar-search"[^\n]+/)?.[0] ?? "";
  assert.notEqual(searchInputLine, "");
  assert.match(searchInputLine, /border border-divider/);
  assert.match(searchInputLine, /hover:border-module-accent\/25/);
  assert.match(searchInputLine, /hover:ring-1 hover:ring-module-accent\/10/);
  assert.match(searchInputLine, /focus:border-module-accent\/45/);
  assert.match(searchInputLine, /focus:ring-2 focus:ring-module-accent\/25/);
  assert.doesNotMatch(searchInputLine, /divider-light|action-accent|context-accent/);
  assert.doesNotMatch(searchInputLine, /(?:purple|violet|indigo)/i);
  assert.match(css, /--module-accent:/);
  assert.match(css, /--scrollbar-thumb: color-mix\(in srgb, var\(--divider-light\)/);
  assert.match(css, /--scrollbar-thumb: color-mix\(in srgb, var\(--divider-dark\)/);
  assert.match(css, /scrollbar-width: thin/);
  assert.match(css, /\*::-webkit-scrollbar-thumb/);
  assert.match(css, /\*::-webkit-scrollbar-corner/);
  assert.doesNotMatch(css, /--scrollbar-(?:thumb|track|corner)[^\n]*#(?:fff|ffffff|000|000000)/i);
});

test("R2.3A torna a GlobalTopbar operacional e absorve a barra do Minerador", async () => {
  const [topbar, minerador, shell] = await Promise.all([
    read("components/global-topbar.tsx"),
    read("modules/minerador/minerador-workspace.tsx"),
    read("components/product-shell.tsx"),
  ]);

  assert.doesNotMatch(topbar, /router\.back\(\)|router\.forward\(\)|window\.history\.(back|forward)\(\)/);
  assert.match(topbar, /canUndo: \(\) => boolean/);
  assert.match(topbar, /canRedo: \(\) => boolean/);
  assert.match(topbar, /updateControls: \(controls: GlobalTopbarModuleControls\) => void/);
  assert.match(topbar, /onClick=\{moduleControls\.history\.undo\}/);
  assert.match(topbar, /onClick=\{moduleControls\.history\.redo\}/);
  assert.match(topbar, /moduleControls\?\.actions \?\? moduleActions/);
  assert.match(minerador, /const topbarHistoryCount = keywordHistory\.entries\.length/);
  assert.match(minerador, /const topbarCanUndo = keywordHistory\.canUndo/);
  assert.match(minerador, /const topbarCanRedo = keywordHistory\.canRedo/);
  assert.match(minerador, /undo: undoKeywords/);
  assert.match(minerador, /redo: redoKeywords/);
  assert.match(minerador, /actions: <div/);
  assert.match(minerador, /organizeFilterSummary/);
  assert.match(minerador, /title="Exportar selecionadas para CSV"/);
  assert.match(minerador, /tabs: sectionTabs/);
  assert.match(minerador, /<AppMenu active="minerador"/);
  assert.doesNotMatch(minerador, /BARRA UNICA: FERRAMENTAS DO MINERADOR/);
  assert.match(minerador, /<HistoryControls moduleId="minerador" showHistory=\{false\} showUndoRedo=\{false\}/);
  assert.match(shell, /<GlobalTopbar \/>/);
});

test("R2.3B mantém as duas abas do Minerador no mesmo slot global", async () => {
  const [topbar, tabs, discovery, process] = await Promise.all([
    read("components/global-topbar.tsx"),
    read("modules/minerador/minerador-section-tabs.tsx"),
    read("modules/minerador/discovery/discovery-keywords-page.tsx"),
    read("modules/minerador/minerador-workspace.tsx"),
  ]);

  assert.match(topbar, /tabs\?: ReactNode/);
  assert.match(topbar, /data-topbar-module-tabs/);
  // A topbar não reserva mais gutter: a barra vertical fica colada na borda da tela.
  assert.doesNotMatch(topbar, /scrollbar-gutter/);
  assert.ok(topbar.indexOf("data-topbar-module-tabs") < topbar.indexOf("<NotificationBell />"));
  assert.match(tabs, /data-minerador-section-tabs/);
  assert.match(tabs, /grid h-8 w-40 shrink-0 grid-cols-2/);
  assert.match(tabs, /inline-flex h-7 w-full items-center justify-center rounded-md border px-3/);
  assert.match(tabs, /GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY/);
  assert.match(tabs, /active === control\.id/);
  assert.match(tabs, /hover:border-module-accent\/30/);
  assert.doesNotMatch(tabs, /(?:purple|violet|indigo)/i);
  const css = await read("app/globals.css");
  // Nenhuma faixa reservada: a barra vertical encosta na borda direita da tela.
  // Proíbe a declaração ativa, não a menção — o comentário que explica a regra pode citá-la.
  assert.doesNotMatch(css, /^\s*scrollbar-gutter\s*:/m);
  assert.match(css, /html \{[\s\S]*scrollbar-width: thin;/);
  assert.match(discovery, /useGlobalTopbarControlsRegistration/);
  assert.match(discovery, /tabs: <MineradorSectionTabs brandRef=\{brandRef\} \/>/);
  assert.doesNotMatch(discovery, /ModuleHeader/);
  assert.match(process, /tabs: sectionTabs/);
  assert.doesNotMatch(discovery, /actions=\{<MineradorSectionTabs/);
});

test("R2.3C compartilha tipografia compacta sem alterar a geometria das tabs", async () => {
  const [topbar, tabs, typography] = await Promise.all([
    read("components/global-topbar.tsx"),
    read("modules/minerador/minerador-section-tabs.tsx"),
    read("components/global-topbar-control.ts"),
  ]);

  assert.match(typography, /GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY = "text-xs font-medium leading-5"/);
  assert.match(topbar, /GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY/);
  assert.match(tabs, /GLOBAL_TOPBAR_CONTROL_TYPOGRAPHY/);
  assert.match(tabs, /grid h-8 w-40 shrink-0 grid-cols-2[\s\S]*lg:w-72/);
  assert.match(tabs, /inline-flex h-7 w-full items-center justify-center rounded-md border px-3/);
  assert.doesNotMatch(tabs, /text-sm font-semibold/);
  assert.doesNotMatch(tabs, /text-base|font-bold/);
});

test("R2.3 conecta o Arquiteto à busca e ao histórico globais sem duplicar estado", async () => {
  const [arquiteto, historyControls] = await Promise.all([
    read("modules/arquiteto/arquiteto-workspace.tsx"),
    read("components/editorial/history-controls.tsx"),
  ]);

  assert.match(arquiteto, /useGlobalTopbarControlsRegistration/);
  assert.match(arquiteto, /moduleId: "arquiteto"/);
  assert.match(arquiteto, /getValue: \(\) => searchQuery/);
  assert.match(arquiteto, /setValue: \(value\) => setSearchQuery\(value\)/);
  assert.match(arquiteto, /getCount: \(\) => masterHistory\.entries\.length/);
  assert.match(arquiteto, /detail: \{ module: "arquiteto" \}/);
  assert.equal((arquiteto.match(/const \[searchQuery,\s+setSearchQuery\]\s+=\s+useState/g) ?? []).length, 1);
  assert.doesNotMatch(arquiteto, /placeholder="Buscar\.\.\."/);
  assert.match(arquiteto, /<HistoryControls moduleId="arquiteto" showHistory=\{false\} showUndoRedo=\{false\} visualVariant="semantic"/);
  assert.match(historyControls, /showHistory\?: boolean/);
  assert.match(historyControls, /\{showHistory && <button/);
  assert.match(historyControls, /data-global-topbar-history-button/);
  assert.match(historyControls, /popoverTriggerRef/);
  assert.match(arquiteto, /filterHierarquia/);
  assert.match(arquiteto, /filterStatus/);
  assert.match(arquiteto, /onUndo=\{undoMasterList\} onRedo=\{redoMasterList\}/);
  assert.doesNotMatch(arquiteto, /fetch\([^\n]*global-topbar/);
});

test("R2.4 absorve a operação completa do Arquiteto na GlobalTopbar", async () => {
  const [topbar, arquiteto, controls, workbench] = await Promise.all([
    read("components/global-topbar.tsx"),
    read("modules/arquiteto/arquiteto-workspace.tsx"),
    read("components/global-topbar-control.ts"),
    read("modules/arquiteto/arquiteto-workbench.tsx"),
  ]);

  assert.match(controls, /GLOBAL_TOPBAR_ACTION_CONTROL/);
  assert.match(topbar, /moduleControls\?\.actions \?\? moduleActions/);
  assert.match(topbar, /arquitetoLayout = model\.moduleId === "arquiteto"/);
  assert.match(topbar, /flex-1 xl:flex-\[0\.6\]/);
  assert.match(topbar, /flex-1 xl:flex-\[1\.4\]/);
  assert.match(arquiteto, /actions: <div[^>]+data-arquiteto-topbar-actions/);
  assert.match(arquiteto, /value=\{filterHierarquia\}/);
  assert.match(arquiteto, /setFilterHierarquia\(event\.target\.value\)/);
  assert.match(arquiteto, /value=\{filterStatus\}/);
  assert.match(arquiteto, /setFilterStatus\(event\.target\.value\)/);
  assert.match(arquiteto, /topbarHandlersRef\.current\.processDeterministicStructure/);
  assert.match(arquiteto, /tabs: <nav[^>]+role="tablist"[^>]+data-arquiteto-topbar-tabs/);
  assert.match(workbench, /architect-process-/);
  assert.doesNotMatch(arquiteto, /contextExpanded|setContextExpanded|architect-context-toggle/);
  assert.match(arquiteto, /architect-process-context-panel/);
  assert.match(arquiteto, /setKeywordImportOpen\(true\); void topbarHandlersRef\.current\.fetchMasterList\(\)/);
  assert.match(arquiteto, /onClick=\{\(\) => \{ setNewListName\(""\); setNewSiloSlug\(""\); setSlugManuallyEdited\(false\); setIsListModalOpen\(true\); \}\}/);
  assert.match(arquiteto, /Exportação iniciada/);
  assert.match(arquiteto, /gap-1 overflow-x-auto xl:overflow-visible/);
  assert.doesNotMatch(arquiteto, /data-arquiteto-topbar-actions[^>]*overflow-x-scroll/);
  assert.match(arquiteto, /title: workspaceMode === "silos" \? "Formar a working copy provisória dos Silos" : "Processar lógica sem IA"/);
  assert.match(arquiteto, /title="Selecionar keywords aprovadas no Minerador"/);
  assert.match(arquiteto, /title="Criar novo Silo"/);
  assert.match(arquiteto, /title="Exportar planilha"/);
  assert.match(controls, /items-center gap-1 rounded-md[^`]*px-1/);
  assert.match(arquiteto, /<HistoryControls moduleId="arquiteto" showHistory=\{false\} showUndoRedo=\{false\} visualVariant="semantic"/);
  assert.match(topbar, /data-global-topbar-history-button=\{moduleControls\.moduleId\}/);
  assert.doesNotMatch(arquiteto, /BARRA UNICA|sticky top-0 z-40 flex h-10/);
  assert.doesNotMatch(arquiteto, /<span className="shrink-0 text-sm font-semibold text-slate-300">Arquiteto<\/span>/);
  assert.doesNotMatch(arquiteto, /router\.(back|forward)\(\)|window\.history\.(back|forward)\(\)/);
});

test("R2.5 impede o ciclo de registro dos controles do Arquiteto", async () => {
  const [provider, arquiteto] = await Promise.all([
    read("components/global-topbar.tsx"),
    read("modules/arquiteto/arquiteto-workspace.tsx"),
  ]);

  assert.match(provider, /const registerControls = useCallback\([\s\S]*setControls\(\(current\) => current === nextControls \? current : nextControls\)[\s\S]*, \[\]\)/);
  assert.match(provider, /const unregisterControls = useCallback\([\s\S]*current\?\.moduleId === moduleId \? null : current[\s\S]*, \[\]\)/);

  assert.match(arquiteto, /const topbarHandlersRef = useRef\(\{ fetchMasterList, processDeterministicStructure, showNotification, undoMasterList, redoMasterList \}\)/);
  assert.match(arquiteto, /topbarHandlersRef\.current\.fetchMasterList/);
  assert.match(arquiteto, /topbarHandlersRef\.current\.processDeterministicStructure/);
  assert.match(arquiteto, /topbarHandlersRef\.current\.undoMasterList/);
  assert.match(arquiteto, /topbarHandlersRef\.current\.redoMasterList/);

  const controlsBlockStart = arquiteto.indexOf("const globalTopbarControls = useMemo");
  const controlsBlockEnd = arquiteto.indexOf("const dangerApproval", controlsBlockStart);
  assert.ok(controlsBlockStart >= 0 && controlsBlockEnd > controlsBlockStart, "bloco de controles do Arquiteto não encontrado");
  const controlsBlock = arquiteto.slice(controlsBlockStart, controlsBlockEnd);
  const dependencyLine = controlsBlock.match(/\}, \[[^\n]+\]\);/)?.[0] || "";
  assert.notEqual(dependencyLine, "", "dependências do useMemo da Topbar não encontradas");
  assert.doesNotMatch(dependencyLine, /fetchMasterList|processDeterministicStructure|showNotification|undoMasterList|redoMasterList/);
  assert.match(controlsBlock, /registerControls\(globalTopbarControlsRef\.current\)/);
  assert.match(controlsBlock, /return \(\) => unregisterControls\("arquiteto"\)/);
  assert.match(controlsBlock, /updateControls\(globalTopbarControls\)/);
  assert.match(controlsBlock, /\[registerControls, unregisterControls\]/);
});

test("R2.6 mantém o Arquiteto sem roxo e usa tokens semânticos no conteúdo", async () => {
  const arquiteto = await read("modules/arquiteto/arquiteto-workspace.tsx");
  assert.doesNotMatch(arquiteto, /(?:purple|violet|indigo|fuchsia|lilac|lavender|roxo|violeta|lilás|lilas)/i);
  assert.doesNotMatch(arquiteto, /#[0-9a-f]{3,8}/i);
  assert.doesNotMatch(arquiteto, /\bbg-black|\btext-white|\bborder-white/);
  for (const token of ["bg-background", "bg-surface-subtle", "bg-surface-elevated", "border-divider", "text-module-accent", "text-context-accent", "text-success", "text-warning", "text-danger", "focus:ring-module-accent"]) {
    assert.match(arquiteto, new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `token ausente: ${token}`);
  }
  assert.equal((arquiteto.match(/const \[searchQuery,\s+setSearchQuery\]\s+=\s+useState/g) ?? []).length, 1);
});
