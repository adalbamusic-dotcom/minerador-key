# Estado atual — Arquiteto

## Correção do ciclo da GlobalTopbar e validação visual — 2026-08-14

- **Causa confirmada no código:** o Arquiteto reconstruía `globalTopbarControls` quando handlers locais eram recriados. O efeito de registro dependia do objeto inteiro; cada nova identidade executava cleanup, `unregisterControls` e novo `setControls` no provider, que re-renderizava a árvore e podia terminar em `Maximum update depth exceeded`.
- **Correção local:** `GlobalTopbarControlsProvider` mantém callbacks estáveis, ignora registros com a mesma identidade e expõe atualização separada por `moduleId`. O Arquiteto guarda handlers mutáveis em `topbarHandlersRef`, registra uma vez por montagem/troca de módulo e atualiza somente o valor dos controles. O cleanup valida o módulo antes de remover o registro, protegendo contra cleanup obsoleto.
- **Preservação:** busca, filtros, histórico, undo/redo, processamento lógico, importação, criação de silo, exportação, navegação entre módulos, seleção, persistência, workflow, contratos e dados não foram redesenhados nem alterados por esta correção.
- **Histórico visual:** o botão global agora identifica seu módulo. O `HistoryControls` recebeu variante semântica opt-in usada somente pelo Arquiteto; o popover é ancorado no botão da GlobalTopbar, abre abaixo dele e fecha por clique externo, Escape ou botão de fechar. O consumidor legado permanece disponível para os demais módulos.
- **Tokens:** o conteúdo ativo do Arquiteto usa superfícies/divisores/estados semânticos e não contém classes roxo/violeta/índigo, hex ou `bg-black`/`text-white`/`border-white`. A GlobalTopbar foi preservada visualmente.
- **Verificado por testes:** testes direcionados do ciclo/visual/seleção `30/30` (4 topbar, 9 seleção, 17 fundação visual), `test:arquiteto` `101/101` e `check:visual-system = PASS`.
- **Validado manualmente no Chrome:** rota Arquiteto, topbar, workspace vazio, busca, filtros, histórico ancorado, fechamento externo, modal de silo sem submissão, modal de importação vazio, exportação e navegação foram exercitados. Após recarga limpa, não houve erro novo durante essas interações.
- **Limitação real:** a Brand ativa retornou `0 artigos` no workspace canônico. Não foram criadas keywords, importações ou escritas remotas para fabricar dados; estados carregado, selecionado, expandido, conflito, revisável, ArticleDNA/SiloDNA e teste físico de pintura em linhas reais continuam pendentes. A captura real disponível é [`arquiteto-validation-empty-2026-08-14.png`](C:/Users/Adalba/.codex/arquiteto-validation-empty-2026-08-14.png) e o popover é [`arquiteto-validation-history-2026-08-14.png`](C:/Users/Adalba/.codex/arquiteto-validation-history-2026-08-14.png).
- **Bloqueios do checkout:** `pnpm run build` compilou o código, mas falhou no type-check por três `TS1501` preexistentes em `tests/agency-adalba-platform-internal.test.mts` (flags regex ES2018). `test:operational` mantém quatro asserções antigas incompatíveis com o código atual, fora da causa desta tarefa. O lint amplo mantém erros legados de `any`/imports na página; não foi usado para declarar a correção como inválida.

## Fase 2 — preflight da limpeza estrutural — 2026-08-12

- **Preparado localmente:** `supabase/scripts/structural-cleanup-preflight-read-only.sql` executa uma única consulta read-only para os candidatos exclusivos de 0030 e `tenant_0016_agency_role_rollback`.
- **Cobertura:** existência, contagens, FKs de entrada/saída e `ON DELETE`, `pg_depend`, views/materialized views, funções/procedures, referências de source, índices, constraints, RLS, policies, ACL, owner e trigger real dos execution events.
- **Preservação explícita:** `pipeline_editorial_protect_append_only()` e seus consumidores canônicos 0027/0028 permanecem fora do conjunto de remoção.
- **Classificação local esperada:** 0030 (duas tabelas, helper e trigger exclusivo) e 0016 rollback são `DROP_CANDIDATE`; a confirmação `DROP_SAFE` depende do catálogo remoto e de zero linhas/dependências externas.
- **Numeração registrada na preparação:** migrations locais chegavam a `0030`; `0031` não pode ser reutilizada; `0032` foi o próximo número sucessor preparado.
- **Estado naquele gate:** `STRUCTURAL_CLEANUP_PREFLIGHT = READY`; a aplicação e o post-verifier da 0032 estão registrados nas seções posteriores deste documento.

## Fase 1 — zero legacy runtime do recovery histórico — 2026-08-12

- **Removido localmente após auditoria de consumidores:** `lib/arquiteto/legacy-handoff-reconciliation.ts`, `app/api/arquiteto/handoff/preview/route.ts` e `app/api/arquiteto/handoff/rebaseline/route.ts`.
- **Removidos junto:** schemas/clientes de prévia, modal sem disparador, tipos, planos, mensagens e testes exclusivos do rebaseline histórico.
- **Handoff normal preservado:** `POST /api/arquiteto/handoff` agora usa somente `prepareCanonicalHandoff()` e `createMineradorArquitetoHandoff()`. Ele aceita `aprovado`/`publicado`, cria apenas `keyword/architect/received`, confirma o readback e trata workflow remoto não-`received` como conflito; não converte marcador histórico em `received`.
- **Preservado por consumidor ativo:** `resolvePipelineContext()`, `editorial_workflow_items`, `pipeline-repositories.ts`, `editorial-repositories.ts`, `/api/arquiteto/workspace`, `/api/arquiteto/artifacts`, `/api/editorial/*`, `browser-artifact-store.ts`, `briefings_artigos`, `/api/editorial/workspace`, adapters atuais e recovery local do Arquiteto/Redator.
- **Preservado por consumidor ativo:** `lib/legacy-routing.ts` continua importado por `proxy.ts` e coberto pelos testes de tenant/routing; não foi removido por não satisfazer `RUNTIME_CONSUMERS = 0`.
- **Não tocado:** banco, migrations, 0030, `tenant_0016_agency_role_rollback`, `minerador_google_ads_connections`, localStorage e IndexedDB.
- **Estado:** `REMOVED_RUNTIME_LEGACY`; `ZERO_RUNTIME_CONSUMERS = PASS` para o conjunto removido e `FAIL` para `lib/legacy-routing.ts`/recovery local ativo. Nenhuma operação remota foi executada.

## Correção do read-model do handoff canônico — 2026-08-12

- **Verificado no código:** o POST de `Importar do Minerador` chama `POST /api/arquiteto/handoff`, resolve `brandId` e `actorUserId` no servidor por `resolvePipelineContext()`, lê `keywords_kgr` da mesma Brand, grava `editorial_workflow_items` como `keyword/architect/received` e confirma o readback antes de responder `PERSISTED` ou `UNCHANGED`.
- **Corrigido localmente:** o merge do workspace removia todos os itens com origem `CANONICAL_REMOTE`, inclusive handoffs `received` sem ArticleDNA. O read-model agora preserva o handoff canônico até que um ArticleDNA da mesma keyword o substitua por identidade técnica.
- **Preservado como histórico fora do runtime normal:** eventual guard `historical_import_protected` não é lido nem convertido pelo handoff normal; nenhum recovery, backfill, storage local, migration ou RPC excepcional foi alterado.
- **Diagnóstico preparado:** `supabase/scripts/minerador-arquiteto-handoff-diagnostic-read-only.sql` conta somente metadados por `brandId` canônico informado manualmente; não usa nome, slug, owner ou conteúdo editorial.
- **Validado manualmente pelo usuário:** `SMOKE_NOVO_PIPELINE_PERSISTENCE = PASS`. Em dois navegadores, uma keyword nova aprovada gerou workflow remoto, formou ArticleDNA e o artefato permaneceu após F5, reinício da aplicação e retorno ao outro navegador.

## Correção da autoridade de importabilidade entre navegadores — 2026-08-12

- **Causa confirmada no código:** `architectImportedKeywordIds` é um campo legado de recovery salvo no `localStorage`, sob a chave `minerador-pro:workflow-recovery:${actorUserId}:${brandId}`. O modal o tratava como bloqueio definitivo; por isso navegadores com snapshots locais diferentes exibiam elegibilidade diferente para a mesma Brand.
- **Corrigido localmente:** `GET /api/arquiteto/workspace` agora calcula a importabilidade no servidor a partir de `keywords_kgr`, de todos os workflows `keyword/architect` da Brand e das referências de ArticleDNA canônicas. O cliente recebe essa classificação e não usa `localStorage`, IndexedDB ou marcador transitório para habilitar ou desabilitar a importação.
- **Decisão canônica atual:** workflow remoto `received`, outro workflow remoto incompatível ou keyword já referenciada por ArticleDNA determinam a elegibilidade. `publicado` recebe a classificação de proteção editorial, mas permanece elegível para reconstrução conforme o handoff normal; marcadores e guards históricos não são consultados pelo runtime.
- **Storage preservado:** nenhuma chave foi apagada. `architectImportedKeywordIds`, artefatos de recovery em IndexedDB e cópias legadas em `localStorage` permanecem somente como material de recovery/auditoria; não são autoridade de elegibilidade.
- **Pendente de validação manual:** abrir `Importar do Minerador` nos navegadores A e B, mesma conta e Brand, comparar as mesmas keywords e repetir logout/login, confirmando a mesma decisão canônica e a permanência do ArticleDNA. Nenhuma conclusão operacional é declarada antes dessa comparação.

## Histórico arquivado — Historical Import Guard do handoff legado (2026-08-12)

O runtime de recovery/rebaseline histórico foi abandonado na Fase 1. Esta
seção preserva o contexto documental, mas não descreve uma superfície ativa.
Não há writer, rota de recovery, criação de `historical_import_protected`,
backfill ou operação remota autorizada por este registro. O handoff normal usa
somente o caminho canônico descrito no bloco da Fase 1 acima.

> **Estado documental vigente — 2026-07-27:** a rota atual é `app/(brand)/[brandRef]/arquiteto/page.tsx`; a referência posterior a `/{brandUserId}/arquiteto` é alias histórico. O reparo de leitura/recovery continua sem reagrupamento automático e a conclusão operacional ainda depende de validação manual com snapshot, localização e isolamento por marca.

## Planilha operacional — padrão visual do Minerador (2026-07-31)

- **Referência verificada no código:** `modules/minerador/minerador-workspace.tsx` usa barra operacional compacta, `table-fixed`, `border-collapse`, `min-w-[110rem]`, overflow horizontal no container da planilha, cabeçalho escuro fixo, células com separadores `border-slate-800/60`, linhas neutras, hover cinza e seleção índigo discreta.
- **Aplicação local no Arquiteto:** `modules/arquiteto/arquiteto-workspace.tsx` agora reutiliza essa geometria para barra superior e inferior, container, tabela, cabeçalho, colunas técnicas, linhas de artigo, badges, selects e checkbox. A keyword principal é a única coluna textual elástica; silos continuam linhas agrupadoras compactas e preservam somente seu indicador semântico lateral.
- **Preservação:** nenhuma alteração em contratos, persistência, dados, filtros, ordenação, handlers, ArticleDNA, SiloDNA, SERP ou no controlador `article-selection.ts`. Clique, Ctrl/Cmd, Shift, pintura por arraste, teclado e ações em lote permanecem fora desta alteração.
- **Ainda pendente:** comparação manual autenticada Minerador × Arquiteto em 360/768/1024/1440px, inclusive hover, seleção, foco, disabled e scrollbar. Nenhuma equivalência visual é declarada antes dessa verificação.

## Histórico de segurança como popover (2026-07-31)

- **Correção local:** o Arquiteto passa `presentation="popover"` para `HistoryControls`; o histórico deixa de abrir como drawer lateral e aparece abaixo do botão Histórico, antes da planilha.
- **Interação preservada:** o popover fecha por clique fora, `Escape` ou botão de fechar. A ancoragem compartilhada foi corrigida de forma retrocompatível para alinhar a borda esquerda ao botão disparador e respeitar a viewport; o Minerador, único outro consumidor do modo popover, preserva seus handlers e passa a receber o mesmo alinhamento correto.

## Entrada sem recarga duplicada da planilha (2026-07-31)

- **Causa confirmada:** após autenticar/entrar no Arquiteto, a sincronização de sessão e o efeito da assinatura de importação chamavam `fetchMasterList` em paralelo, reapresentando a mesma planilha duas vezes.
- **Correção:** a sincronização de sessão agora atualiza somente os silos; a assinatura `importedKeywordSignature` continua como fonte única do carregamento inicial e de recargas por alteração efetiva de importação. Recargas explícitas após salvar, importar ou usar `Tentar novamente` foram preservadas.

## Superfície operacional sem barra de recovery e sem refresh visível (2026-07-31)

- **Removido da interface:** a barra `Recuperação segura`, `Resetar não-publicados` e o contador passivo de conflitos lógicos. Nenhum artefato, snapshot, função de recovery ou regra de integridade foi apagado.
- **Refresh:** quando a planilha já possui itens recuperados ou carregados, a atualização de silos ocorre em segundo plano e não substitui a tabela por um spinner. O spinner permanece reservado ao primeiro carregamento sem itens.

## Regra compartilhada de formação — 2026-07-21

Implementados localmente o gate de uma principal/até cinco apoios, a estratégia aditiva do ArticleDNA (`keywordStrategy`) e sinais de hierarquia do SiloDNA. Volume ausente permanece parcial/indisponível; score, slug ou similaridade não confirmam KGR. Artigos publicados permanecem protegidos e o Radar recebe somente contexto de leitura.

## Correção do avaliador SERP, intenção e KGR leve (2026-07-21)

- **Implementado:** `intentProfile` no ArticleDNA, normalização determinística de intenção com preservação do rótulo original e compatibilidade individual das secundárias/reforços; CTA e hierarquia não alteram a intenção central.
- **Implementado:** sanitização proprietária no Arquiteto para eliminar falsos conflitos de labels equivalentes, hierarquia comparada como formato e ausência em snippets. A evidência fraca aparece como limitação e não gera separação.
- **Implementado:** `validationProfile` com `kgr_light`; principal obrigatória, secundárias condicionais à ambiguidade, referências integrais preservadas e `queriedKeywordDnaIds` explícitos. Confiança baixa/inconclusiva impede ações destrutivas.
- **Implementado:** ingestão aditiva preserva URL publicada, canonical, slug e status; ArticleDNA exibe intenção/origem, arquitetura, KGR, publicação e identidade URL/canonical quando recebidos.
- **Implementado:** assessment anterior permanece no histórico e é marcado `Desatualizado por correção do avaliador`; nova execução explícita gera v2.
- **Verificado em fixtures:** `test:arquiteto` 70/70. Nenhuma chamada real Serper, escrita remota, migration, limpeza de armazenamento ou validação browser autenticada foi executada.
- **Limitações:** ainda pendem validação manual autenticada do preview/URL/reload/troca de marca e confirmação do schema remoto/RLS. O Radar não foi alterado.
- **Correção de deep-link (2026-07-20):** a seleção externa Radar → Arquiteto agora usa solicitação consumível por marca, compara expansão/seleção antes de chamar setters e remove `articleId` da URL após encontrar o artigo. O artigo publicado continua sendo apenas selecionado; não é recriado nem reimportado.
- **Reparo de integridade (2026-07-20):** a leitura do workspace voltou a incluir keywords aprovadas cujo ID está no índice de importação, sem deixar de preservar linhas já renderizadas. A leitura continua sem reagrupar automaticamente e uma falha de leitura não marca a assinatura como carregada.
- **Evidências do reparo:** `test:arquiteto` (48/48), `test:operational` (49/49), `npm run build` e `git diff --check` passaram.
- **Limitações:** a validação visual autenticada do deep-link e do snapshot ainda não foi repetida nesta execução; lint amplo do monólito pode continuar exibindo avisos legados, mas o lint do escopo alterado e o build passam.
- **Critério ainda aberto:** não marcar a tarefa como concluída enquanto a validação manual com snapshot não confirmar localização, recuperação e isolamento por marca.
- **Última auditoria:** 2026-07-20, leitura de código e testes de domínio/fluxo.
- **Funcionando:** agrupamento lógico, agrupamento por IA, ArticleDNA, SiloDNA, anotações, proteção de publicados e envio ao Radar existem no código. **Verificado no código; regras principais confirmadas por teste.**
- **Parcial:** SiloPage possui contrato e rota; hidratação/persistência no workspace ainda não foi confirmada como completa.
- **Simulado:** parte do pipeline pode usar fallback/local; não confundir com persistência server-side.
- **Local:** recovery por marca em `localStorage`; artefatos do Arquiteto em IndexedDB. **Verificado no código.**
- **Persistido:** ArticleDNA/SiloDNA e eventos possuem repositórios/migration previstos; execução remota não verificada.
- **Corrigido em código:** o loop `Maximum update depth exceeded` no recebimento de navegação externa; a busca continua dependente de `masterList`, mas a solicitação já consumida não reaplica estado.
- **Regressões/bugs:** a correção visual ainda aguarda reprodução manual autenticada; os testes cobrem resolução, idempotência, IDs ausentes, Sets já corretos e mudança para outro artigo.
- **Arquivos centrais:** `app/(brand)/[brandRef]/arquiteto/page.tsx`, `lib/arquiteto/**`, `lib/editorial/architect-recovery.ts`.
- **Testes:** `tests/arquiteto-domain.test.mts`, `tests/operational-flow.test.mts` cobrem contratos, published guard, recovery e preflight.
- **Última validação manual:** ainda não verificada nesta sprint.
- **Diferença spec/implementação:** não marcar como concluído; integridade de importação/hidratação é pré-requisito aberto.

## Implementação SERP e identidade publicada (2026-07-21)

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-21-serp-formacao-identidade-publicada.md`, contratos opcionais de snapshot integral da KeywordDNA, assessment SERP versionado, decisões por keyword, identidade publicada coerente/divergente/ausente e verificação server-side.
- **Interface:** botão `Validar agrupamento pela SERP` imediatamente depois de `Detectar viés SiloDNA (IA)`, preview com custo/consultas, recomendações `Seguir recomendação`/`Ignorar`, link publicado com `noopener noreferrer` e coluna independente `APROVAÇÃO`.
- **Persistência:** assessments, snapshots, decisões, histórico e verificações são armazenados por marca no artefato IndexedDB existente, com fallback local já identificado; a UI só anuncia sucesso após a escrita.
- **Transferência:** itens aprovados enviados ao Radar carregam referências KeywordDNA e assessment de formação de modo aditivo; UI e workflow Radar não foram alterados.
- **Verificado em código/testes:** `test:arquiteto` 54/54, `test:operational` 49/49, `tsc --noEmit` e `git diff --check` passaram. Nenhuma chamada real Serper, escrita remota ou validação browser autenticada foi executada.
- **Limitações abertas:** o build atual compilou e terminou TypeScript, mas falhou na prerenderização fora do escopo em `/admin/marcas` com `Invariant: Expected workStore to be initialized`; ainda é necessária validação manual autenticada do preview, uma coleta explícita, reload/troca de marca, link e verificação online.

## Correção de visibilidade SERP por keyword (2026-07-21)

- **Causa confirmada:** o assessment era persistido no artefato IndexedDB brand-scoped, mas a planilha só o mostrava como uma lista solta dentro do artigo expandido; não havia indicador na linha, abertura automática após confirmação nem vínculo visual obrigatório com cada keyword.
- **Correção:** cada linha de artigo exibe `SERP não analisada`, `SERP processando`, `SERP pronta · vN`, `SERP com conflito`, `SERP desatualizada` ou `SERP com erro`. Após persistência bem-sucedida, o artigo é expandido, a aba de suporte é aberta e a linha recebe foco sem reload.
- **Associação:** a renderização usa `articleId`, `keywordId` e `keywordDnaVersionId` contra as referências do assessment. Recomendações não associadas ou com versão divergente aparecem explicitamente com `KeywordDNA` e `ArticleDNA`; nunca são descartadas silenciosamente.
- **Preservação:** falhas e assessments incompletos não substituem o assessment anterior válido; ações em publicados continuam protegidas e as recomendações permanecem sujeitas a decisão humana.
- **Verificado:** `test:arquiteto` 56/56, `test:operational` 49/49, `tsc --noEmit` e `git diff --check`. O build compilou o código, mas a geração estática falhou em `/admin/marcas`, fora do Arquiteto. Ainda pendem validação browser autenticada e uma coleta real explícita.

## Separação SERP de formação e fortalecimento (2026-07-21)

- **Causa:** o assessment anterior possuía somente o modo de coleta `keyword_individual`; o domínio não recebia o estado editorial publicado e aplicava semântica de formação ao principal protegido.
- **Correção:** assessments novos recebem `assessmentMode: formacao|fortalecimento`. Publicados usam `SERP de fortalecimento`, com a principal como âncora e recomendações de intenção/conteúdo ao redor da identidade existente.
- **Proteções:** `tornar_principal`, `separar_artigo` e `retirar_do_artigo` continuam bloqueados para a principal publicada no domínio. A interface não oferece `Seguir recomendação` para ela; oferece registro de proposta de atualização ou ignorar.
- **Secundárias:** podem receber manutenção, remoção ou proposta complementar na cópia de trabalho, sem alterar principal, slug, canonical ou URL.
- **Codificação:** corrigidas as duas strings corrompidas da UI; o teste agora rejeita mojibake no arquivo da planilha.
- **Pendente:** validação manual autenticada com artigo novo e publicado, sem provider real nos testes.

## Contexto rico de URL, arquitetura e KGR (2026-07-21)

- **Implementado:** contratos opcionais para relação keyword↔URL, situação arquitetural e `ArticleKgrIdentity`, com aliases português/legado normalizados no consumidor do Arquiteto.
- **ArticleDNA:** referências preservam relação/evidência; o payload preserva situação arquitetural, designação KGR, principal KeywordDNA, slug vinculado e proveniência. Score KGR ou coincidência textual não confirmam vínculo.
- **SERP:** resolução determinística em `formacao`, `arquitetura_publicado` e `fortalecimento`; publicados sem confirmação não entram automaticamente em fortalecimento.
- **Proteções:** publicado sempre protege URL, slug, canonical e marca; principal só quando arquitetura/principal estão confirmadas ou KGR está explicitamente confirmado. KGR confirmado também protege o par principal+slug fora da publicação.
- **Transferência:** Radar recebe campos opcionais aditivos; UI/workflow do Radar não foram alterados.
- **Verificado em código/testes:** fixtures cobrem aliases, três modos, candidata editável, KGR protegido, nova versão na confirmação arquitetural e preservação ao Radar; `test:arquiteto` 63/63, `test:operational` 49/49, TypeScript, lint focado, build e `git diff --check` passaram. Validação browser/authenticated e provider real permanecem pendentes.

## ArticleDNA estratégico de KGR, volume e hierarquia (2026-07-21)

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-21-article-dna-estrategia-kgr-volume-hierarquia.md` e projeções aditivas `volumeStrategy`, `hierarchyStrategy` e `strategicPurpose` no ArticleDNA.
- **Implementado:** referências individuais preservam papel, volume conhecido/desconhecido, contribuição e propósito. `null` não é convertido em volume zero; reforços narrativos não recebem volume incremental artificial.
- **Implementado:** KGR explícito nasce candidato com slug derivado da principal, divergência vira conflito e confirmação arquitetural humana cria sucessora com o par principal–slug confirmado.
- **Implementado:** `ArticleControlContext` concentra intenção herdada, KGR, volume, hierarquia, propósito e ações protegidas. Radar recebe essa projeção em campo opcional único; nenhuma UI/workflow de consumidor foi alterada.
- **Implementado:** painel expandido do Arquiteto exibe propósito, volume, score/racional de hierarquia e contribuição por KeywordDNA.
- **Verificado:** `test:arquiteto` 74/74, `test:operational` 49/49, `tsc --noEmit`, lint focado e `npm run build` passaram. Nenhuma chamada real de IA/Serper, escrita remota, migration, limpeza de storage ou validação browser autenticada foi executada.
- **Limitações:** provider real, SERP real, navegador autenticado e schema remoto/RLS permanecem não verificados; mudanças de consumidores continuam limitadas ao transporte opcional.

## Perfis estratégicos de unidades e SERP (2026-07-22)

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-22-perfis-unidades-kgr-nao-kgr-serp.md` e ADR-015. ArticleDNA e `ArticleControlContext` receberam campos opcionais para classificação da unidade, propósito e estratégia SERP.
- **Tipos:** artigo, página de serviço, landing page, página de categoria e outro; landing mantém finalidade SEO, campanha, híbrida ou desconhecida. Sugestões mostram evidências e não equivalem a confirmação.
- **Estratégia:** ciclo, competição e perfil SERP são resolvidos em dimensões independentes. KGR confirmado usa `kgr_light`; não KGR explícito usa `competitive`; ausência/candidato/conflito usa `unknown`.
- **Interface:** painel expandido permite confirmar, alterar, marcar conflito ou manter desconhecido. A decisão cria sucessora humana do ArticleDNA, preserva identidade publicada e marca assessments anteriores como desatualizados sem apagar histórico.
- **Transporte:** o Radar recebe a projeção opcional pelo `ArticleControlContext`; sua UI/workflow não foram alterados. `EditorialUnitType` operacional permanece `article|silo_page`.
- **Verificado:** `test:arquiteto` 83/83 e TypeScript após a implementação. Ainda pendem `test:operational`, build, validação browser autenticada, provider/SERP real e schema remoto/RLS.

## Criador manual de SiloDNA e SiloPage (2026-07-21)

## Consumo da política da principal do Minerador — 2026-07-22

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-22-consumo-politica-principal-minerador.md` e ADR-016 registram o consumo aditivo de `primary_keyword_policy` e seu contexto humano.
- **Campos recebidos:** o adaptador reconhece política, principal publicada original/atual, ator, data, versão, motivo, histórico, `kgr_decisao`/`kgr_aplicabilidade`, intenção, volume, resultados, score, URL, slug, canonical, relação e evidências; snapshots integrais continuam no `KeywordDnaProvenanceSnapshot`.
- **Resolução:** `locked`/confirmação consolidada usa `fortalecimento`; `reviewable` usa `arquitetura_publicado`; unidade nova usa `formacao`; publicado sem política fica `unknown`. `not_applicable` explícito usa competição `competitive`; KGR confirmado usa `kgr_light`; ausência/candidato fica `unknown`.
- **Proteções:** URL, slug, canonical e marca publicados são independentes da proteção da principal. Principal revisável permanece editável; principal travada não pode ser substituída por recomendação estrutural.
- **ArticleDNA/Contexto:** política efetiva, origem/histórico, métricas, candidatas, decisão e `protectionReason` são opcionais e retrocompatíveis. A confirmação humana cria sucessora e recalcula a próxima SERP para fortalecimento sem alterar a identidade publicada.
- **Verificado:** `test:arquiteto` 89/89, `test:operational` 49/49, `tsc --noEmit`, lint focado do domínio/API e `npm run build` passaram. O lint da página completa mantém apenas dívida legada; reload autenticado e provider real permanecem validações manuais separadas desta etapa.

- **Implementado:** SDD `docs/04-arquiteto/propostas/2026-07-21-criador-manual-silo-silopage.md` e decisão `docs/00-produto/decisoes/ADR-014-criacao-manual-silo-silopage.md`.
- **Modal:** removido `Nicho (opcional)`. O formulário agora exige nome do silo e keyword/entidade central, sem transformar a entidade automaticamente em principal de artigo.
- **SiloDNA:** criação manual pode iniciar sem artigos, preserva marca, nome, entidade central, origem manual e referência real opcional de KeywordDNA.
- **SiloPage:** criação opcional com slug, situação `Novo`/`Publicado`, URL publicada obrigatória em publicado e verificação inicial `not_applicable`/`not_checked`. A URL é preservada e publicada não significa verificada.
- **Proteções:** slug inválido/conflitante e URL fora do domínio da marca ativa são rejeitados; canonical permanece separado; nenhum artigo, grupo ou KeywordDNA existente é alterado.
- **Verificado:** `test:arquiteto` 78/78, `test:operational` 49/49, TypeScript, lint focado e build com 50 páginas. Nenhuma verificação online real foi executada.
- **Limitações:** reload autenticado, conferência online, schema remoto/RLS e persistência remota ponta a ponta permanecem pendentes.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/arquiteto; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Adicionado wrapper canônico `/{brandRef}/arquiteto`; nenhum contrato interno de formação foi refeito.

## Diagnóstico de acesso autenticado às listas — 2026-07-24

- Causa compartilhada confirmada: o cliente browser não propagava corretamente o token da sessão Supabase; o Arquiteto ainda tentava `setSession` com `refresh_token` vazio.
- Correção: Arquiteto e Minerador compartilham `lib/supabase/browser-authenticated-client.ts`; o Arquiteto também filtra `keywords_kgr` por `brand_id`.
- O erro de carregamento agora preserva código, tabela, operação, status e mensagem no log interno, sem tokens. RLS, grants e regras editoriais permanecem intactos; smoke test autenticado segue pendente.
- Verificação local: 95 testes focados, TypeScript, build e `git diff --check` passaram; ESLint do factory/teste passou. O lint integral do workspace mantém erros legados de `any`/hooks, fora desta correção.

## Ciclo JWT NextAuth → Supabase — 2026-07-24

- Causa adicional corrigida: o bearer fixo expirava porque o callback JWT não guardava/renovava o `refresh_token` do Supabase; `session.accessToken` também podia carregar indevidamente um token Google.
- Arquiteto e Minerador usam a mesma factory dinâmica; consultas revalidam a sessão, aplicam margem de 60 segundos e preservam `marca_id`/`brand_id`.
- Erros registram somente operação, tabela, código, status, diagnóstico seguro e `tokenExpired`; a UI reserva “sessão expirada” para expiração efetiva ou falha de refresh, sem expor JWT ou refresh token.
- SELECT do ecossistema pode repetir uma vez após JWT expirado; escritas não recebem retry automático. Smoke test autenticado e Google OAuth real seguem pendentes.

### Diagnóstico final da sessão NextAuth → Supabase — 2026-07-24

- Corrigida a classificação que mostrava “sessão expirou” para qualquer erro de autenticação. O Arquiteto compartilha o mesmo resultado estruturado e os mesmos códigos seguros do Minerador.
- SELECTs tenantizados só prosseguem com `SUPABASE_SESSION_READY`; ausência de sessão, troca Google, token, claims e refresh são diferenciados sem fallback anon.
- A configuração remota do provider Google permanece requisito externo, não alterado nem testado por login real.
- O fluxo de login não redireciona ao Arquiteto quando `session.supabaseAuth.status` não é `ready`; falhas Google/Supabase interrompem o callback e exigem novo login.

## Refinamento visual do Arquiteto — 2026-07-27

- **Verificado no código:** a rota tenantizada `app/(brand)/[brandRef]/arquiteto/page.tsx` continua fina e a implementação proprietária permanece em `modules/arquiteto/arquiteto-workspace.tsx`; nenhuma regra, contrato, handler, persistência ou workflow foi alterado.
- **Diagnóstico visual:** a tela usava `font-mono` como fonte global, controles e informações essenciais abaixo de 14px, barra superior sem grupos funcionais, estados com baixo contraste/áreas clicáveis pequenas e expansão com caixas concorrentes.
- **Ajustes visuais:** barra superior agrupada em inspeção, processamento/importação e operações secundárias; tabela com cabeçalho, linha, seleção, foco, keyword principal e URL mais legíveis; resumo expandido reorganizado visualmente para intenção, política, KGR, publicação, propósito, unidade, ArticleDNA, SERP, abas e recomendações; recuperação, badges e ações receberam variantes com foco visível e áreas maiores.
- **Componentes/tokens reutilizados:** `WorkflowStatusBadge`, `HistoryControls`, `ArticleDnaSummary`, `ArchitectRecoveryPanel`, tokens `background`/`foreground` e escala Tailwind existente; foi adicionada apenas a prop visual aditiva `density` ao badge/histórico compartilhados, sem alterar o padrão dos consumidores atuais.
- **Verificado por testes:** `test:arquiteto` 89/89, `test:operational` 49/49, `tsc --noEmit`, `npm run build` e `git diff --check`; o build gerou 47 páginas estáticas. O lint direcionado reproduz a dívida legada da página consolidada.
- **Ainda não verificado:** navegador autenticado, light/dark real, 360/768/1024/1366/1440px, teclado, hover, loading, erro e conflito. O lint da página consolidada mantém dívida legada já existente; não foi corrigida nesta tarefa visual.

## Correção da regressão visual e densidade operacional — 2026-07-27

- **Relatado e confirmado no código:** o refinamento anterior elevou o topo para `min-h-16`, aplicou badges confortáveis nas linhas, manteve a tabela em `min-w-[1360px]` sem rolagem horizontal própria, comprimiu a keyword em uma única linha e deixou o rodapé com ações em `text-[9px]`.
- **Correção visual aplicada:** topo em 48px com controles compactos; recuperação como barra secundária; linhas e cabeçalho com densidade controlada; keyword separada em principal + identidade técnica; rodapé com controles de 32px e texto legível; superfícies, bordas e sombras suavizadas.
- **Scroll:** rolagem horizontal ficou confinada ao container da tabela e o scroll vertical ao canvas do Arquiteto. Foi criado estilo de scrollbar escopado `.architect-scrollbar`, usando `--foreground`, sem alterar outros módulos.
- **Preservação:** nenhum handler, estado, contrato, entidade, seleção, filtro, rota, API, persistência, hidratação ou regra editorial foi alterado. O scrollbar e as classes são exclusivamente visuais.
- **Verificado por testes:** `test:arquiteto` 89/89, `test:operational` 49/49, `tsc --noEmit`, `npm run build` com 47 páginas e `git diff --check`.
- **Ainda não verificado:** navegador autenticado real em 100% nos tamanhos 1366×768, 1440×900 e 1920×1080, além de light/dark, estados de interação e ausência de truncamento em dados reais.

## Diagnóstico do contrato de readback canônico — 2026-08-11

- **Causa confirmada do erro:** no caminho idempotente, `ArtifactVersionRepository` consultava apenas `version_id`, `version_number` e `content_hash` para produzir `UNCHANGED`. O mapeador server-side exigia o envelope completo (`entity_id`, origem, timestamps, autor, payload e demais campos), portanto a validação do `Versioned*Schema` falhava antes de a resposta chegar ao cliente.
- **Correção local:** a leitura da versão mais recente agora usa a linha completa; `PERSISTED` e `UNCHANGED` passam pelo mesmo mapeamento canônico. A rota traduz explicitamente `status` do repositório para `persistence` no contrato HTTP consumido pelo cliente.
- **Diagnóstico seguro:** falhas de forma registram somente tipos/presença de campos e caminhos de validação, sem payload, UUID, token, sessão ou segredo; a mensagem pública continua genérica.
- **Fonte atual da tela:** `MIXED`: a hidratação canônica usa `/api/arquiteto/artifacts`, enquanto o contexto editorial legado ainda lê `/api/editorial/workspace` e os mecanismos de recovery local/IndexedDB continuam preservados. Isso não é prova de readback remoto exclusivo.
- **Verificado localmente:** contrato canônico 6/6, `test:arquiteto` 89/89, runtime do pipeline 7/7, TypeScript, ESLint direcionado e `git diff --check` passaram.
- **Pendente:** smoke autenticado de leitura/persistência contra o schema remoto já aplicado. Nenhuma operação remota, chamada de IA/SERP ou aprovação artificial de ArticleDNA foi executada.

## Fresh-origin readback canônico — 2026-08-12

- **Reprodução:** na origem `s-smoke`, com a mesma identidade e Brand ativa, o GET canônico retornou uma linha `article_dna` e falhou no mapper por `createdAt` em formato de timestamp do banco incompatível com o `z.string().datetime()` estrito. O diagnóstico foi sanitizado por linha; nenhum payload editorial foi impresso.
- **Correção:** o mapper server-side normaliza somente timestamps de banco reconhecíveis para ISO UTC antes do schema parser. Formatos realmente inválidos continuam falhando explicitamente com `rowIndex`, `artifactType`, `versionNumber`, `payloadType`, schema, path e código sanitizados.
- **Invariantes:** o GET agora confirma também `marca_id`, `payload.brandId` e a correspondência entre `entity_id` e a identidade do payload. Não há fallback de recovery para mascarar erro canônico.
- **Resultado observado:** após reload em `s-smoke`, a mensagem de artifact inválido desapareceu; o parser atual aceitou o retorno canônico. A UI ainda exibe estado vazio porque sua reconstrução visual depende da lista editorial, o que não invalida o readback do artifact.
- **Fonte:** `CANONICAL_REMOTE` no readback do artifact; `LOCAL_RECOVERY` não foi usado como prova nem inspecionado/limpo. O workspace de `localhost` permanece uma superfície `MIXED` e não é baseline do smoke.
- **Estado:** `ARQUITETO_CANONICAL_READBACK_CONTRACT_FIXED`; nenhum artifact foi criado, apagado ou alterado remotamente. IA/SERP permanecem indisponíveis.

## Histórico arquivado — Rebase canônico do patrimônio Minerador → Arquiteto — 2026-08-12

O rebaseline histórico, seu bootstrap e seus preflights permanecem apenas
como contexto/artefatos arquivados. Não existe mais rota runtime de
`rebaseline`, não existe transição automática de `historical_import_protected`
para `received` e nenhum writer ou backfill deve ser criado nesta Fase 1.
O fluxo vigente é o handoff normal server-side e idempotente descrito no
registro da Fase 1.

## Inventário e preparação do reset downstream da Adalba — 2026-08-12

- **Escopo preservado:** `listas_kgr`, `keywords_kgr`, status de keyword, evidências de URL/canonical do Minerador, identidades, marcas e Agências ficam fora de qualquer manifesto de reset. Publicações/briefings com status publicado ou URL/canonical não podem ser selecionados.
- **Inventário preparado:** `supabase/scripts/adalba-editorial-downstream-inventory-read-only.sql` usa a Brand fixa Adalba, uma única tabela sanitizada e somente leitura. As contagens e a classificação real continuam **PENDENTES DE CONFIRMAÇÃO NO CATÁLOGO REMOTO**.
- **Ordem e bloqueio técnico:** `editorial_artifact_versions`, `content_document_versions`, `editorial_serp_snapshots` e `editorial_serp_reviews` são append-only pelas migrations 0027/0028. O SQL proposto se recusa a tocar esses objetos; não existe reset canônico completo sem decisão estrutural futura. Somente workflow selecionado, estado por usuário, view salva, documento sem versão, PublicationRecord não publicado e briefing legado não publicado podem sequer entrar na proposta atual, sempre por manifesto explícito e revisado.
- **Estado:** nenhum SQL remoto, dado, migration, 0031, recovery histórico, provider ou limpeza de storage foi executado.

## Reset de dados de desenvolvimento e nova época canônica — 2026-08-12

- **Scripts de reset locais:** `supabase/scripts/development-data-reset-dry-run.sql` é agora uma única consulta CTE/`VALUES` 100% read-only, sem transação auxiliar, temporárias ou objetos de sessão. Retorna um único result set sanitizado com manifesto, FKs, ordem, self-FKs, proteções, Admin, ambiente, contagens e veredicto final. `supabase/scripts/development-data-reset-real.sql` mantém `BEGIN`/`COMMIT` na própria execução e usa somente arrays, records e variáveis locais para o manifesto, snapshot das proteções e contagens; nenhuma relação auxiliar é criada. Falha em qualquer gate provoca `RAISE` e rollback transacional automático. `supabase/scripts/development-data-reset-verifier-read-only.sql` continua somente leitura e sem temporárias.
- **Correção de preflight:** dry-run v6, reset-real v7 e verifier v4 consideram `O`, `R` e `A` como modos de trigger habilitados e somente bloqueiam `D`/ausência. O `FK_ORDER_GATE` considera apenas FKs entre tabelas diferentes; o `SELF_FK_GATE` inventaria cada self-FK em tabela do manifesto e só aprova reset integral. Os quatro self-FKs reportados no catálogo remoto ficam cobertos como `SAFE_FULL_TABLE_RESET`. O ciclo cruzado `content_documents.current_version_id`/`content_document_versions.document_id` continua tratado pelo `UPDATE` do ponteiro antes das exclusões. A abordagem anterior com `_development_reset_manifest` e `_development_reset_gate_results` foi abandonada após falhas repetidas de lifecycle no SQL Editor.
- **FK gate endurecido:** o primeiro reset real foi revertido integralmente antes do `COMMIT` por `tenant_0016_agency_role_rollback.membership_id → agency_memberships.id ON DELETE RESTRICT`. A tabela é captura histórica da transição 0016, não fonte de verdade do runtime canônico; suas linhas de homologação entram no reset antes de `agency_memberships`. O manifesto agora cobre dependências conhecidas e o catálogo reprova, em uma única execução, qualquer FK filha externa ao plano ou ordem topológica inválida. A única aresta cíclica explicitamente neutralizada é `content_documents.current_version_id → content_document_versions`, anulada na mesma transação antes de apagar as versões e o documento.
- **Dados propostos para limpeza:** Discovery/Minerador, editorial canônico, comunicação/onboarding, dados de Agency/Brand, conexões de integração não-plataforma, uso de integrações e dados excepcionais 0030. O script bloqueia se houver dependência catalogada fora do conjunto revisado ou tabela de activity/notification ainda não classificada.
- **Append-only:** as proteções de publicado, DiscoveryRun, artifacts, SERP, versões de documento, usage events e execution events 0030 são capturadas, desabilitadas apenas durante a transação e verificadas como restauradas antes do resultado. Falha em qualquer etapa reverte a transação inteira.
- **Guards de mutação:** o catálogo/migrations foi auditado para 45 triggers não internos de `UPDATE`/`DELETE` nas 60 tabelas: 23 `SUSPEND_DURING_DEV_RESET` e 22 `SAFE_TO_KEEP_ENABLED`, sem classificação `INVESTIGATE` conhecida localmente. A trigger real `public.brand_memberships.trg_tenant_0005_protect_last_owner`, função `public.tenant_0005_protect_last_owner()`, é suspensa somente durante a mesma transação e entra no snapshot/restauração. O `MUTATION_TRIGGER_GATE` reprova qualquer trigger adicional, divergente ou sem classificação exata; os guards diferidos da 0021 (`agencies`/`agency_memberships`) e os append-only legados e canônicos também fazem parte do registro.
- **Legado para limpeza posterior ao smoke:** `historical_import_protected`/0030 e `architectImportedKeywordIds` não voltam a autorizar bloqueio normal; recovery em navegador (`architect-recovery`, `browser-artifact-store` e rascunho local do Redator) fica **INVESTIGAR**; `/api/editorial/workspace`, `briefings_artigos` e consumidores legados ficam **REMOVER APÓS SMOKE** ou **INVESTIGAR** conforme o inventário remoto. Os resolvedores server-side canônicos e `resolvePipelineContext()` ficam **MANTER**.
- **Gate de reimportação:** **PASS_WITH_MANUAL_REBUILD**. A ausência de `Silo`/`Lista` no CSV não é blocker: após recriar a Brand, o usuário recria manualmente cada lista/grupo, seleciona-a como destino e importa o CSV correspondente. A ausência de `site_origin/site_origins`, URL e canonical também é deliberada: o CSV separado de `publicado` preserva o dado-fonte e o mecanismo atual do Minerador será executado novamente para reconstruir/comprovar evidência de Site/Sitemap, URL e canonical. Não há restauração de IDs, lista antiga, `brand_id`, markers do Arquiteto ou qualquer outro estado histórico.
- **Pendente:** executar manualmente somente o dry-run v6 e revisar `MANIFEST_COUNT = PASS`, `FK_DEPENDENCY_GATE = PASS`, `FK_ORDER_GATE = PASS`, `SELF_FK_GATE = PASS`, `PROTECTION_GATE = PASS`, `ADMIN_GATE = PASS`, `VERDICT_FINAL = PASS` e zero `FAIL` antes de qualquer novo reset real. O reset e o verifier continuam operações manuais; a reconstrução posterior deve ocorrer somente pelos fluxos correntes do produto.
- **Correção do reset real v7:** após o abort por `42702` no `MUTATION_TRIGGER_GATE`, todas as agregações sobre FKs/self-FKs/triggers e todas as leituras de `jsonb_to_recordset` foram revisadas com aliases explícitos (`l`, `fc`, `sfc`, `mi`, `x`), sem alterar o dry-run v6, o manifesto ou os gates. A validação local confirmou uma transação `BEGIN`/`COMMIT`, sem `TEMP`/`pg_temp`, e o reset real fica liberado diretamente para nova execução manual, sujeito ao acknowledgment e aos gates remotos.

## Seleção livre, intervalos e arraste na planilha (2026-07-29)

- **Implementado no Arquiteto:** `selectedArticleIds` continua sendo o único conjunto de seleção. Clique comum e Ctrl/Cmd alternam somente a linha e atualizam `lastSelectionAnchorId`; Shift usa a ordem visual filtrada e agrupada; Ctrl/Cmd+Shift adiciona o intervalo.
- **Arraste:** Pointer Events iniciados exclusivamente no checkbox de artigo usam tolerância de 5px, modo de marcar/desmarcar definido pela linha inicial, processamento idempotente por ID e encerramento por `pointerup`, `pointercancel`, perda de captura e `blur`. O clique final não duplica o gesto.
- **Cabeçalho e filtros:** o checkbox do cabeçalho usa somente artigos visíveis, possui estado indeterminado e preserva seleções ocultas. A contagem distingue total e visíveis; filtros, busca, ordenação, agrupamento e troca de marca não reutilizam seleção de outro contexto.
- **Acessibilidade:** os checkboxes nativos preservam Tab, foco, Space, `aria-label` e `aria-checked`; a mudança visual ficou restrita ao estado indeterminado e ao contador solicitado.
- **Verificado:** teste direcionado `tests/arquiteto-selection.test.mts` 8/8, `test:arquiteto` 89/89, `test:operational` 49/49, TypeScript, lint dos arquivos novos, build com 47 rotas e `git diff --check` passaram.
- **Limites:** lint da página consolidada ainda reproduz a dívida legada de `any`/hooks; nenhuma API, persistência, storage, migration, chamada paga, Minerador ou outro módulo foi alterado. Arraste e teclado ainda aguardam validação manual real no navegador autenticado.

## Correção do arraste por coordenadas (2026-07-29)

- **Causa confirmada no código:** o gesto dependia de `pointerenter` nos checkboxes e não capturava o ponteiro inicial; ao sair do primeiro controle, o navegador podia continuar a seleção nativa de texto sem processar as linhas atravessadas.
- **Correção:** o checkbox inicial usa `setPointerCapture`; as `<tr>` visíveis são registradas por ID, seus limites vêm de `getBoundingClientRect()` e `clientY` resolve a linha atual. A aplicação percorre os índices intermediários da ordem visual, sem depender de `event.target` ou `pointerenter`.
- **Proteção:** após 5px, o gesto chama `preventDefault()`, aplica `user-select: none` temporário no `body`, bloqueia o clique posterior, libera a captura e restaura o estilo original. Clique sem deslocamento continua sendo clique normal.
- **Verificado no código/teste:** `tests/arquiteto-selection.test.mts` 8/8, incluindo faixa nos dois sentidos, `getBoundingClientRect`, captura/liberação e ausência de `pointerenter`. Validação manual no Chrome ainda precisa ser repetida pelo usuário; não declaro o arraste manualmente validado nesta etapa.

## Pintura por snapshot durante o arraste (2026-07-30)

- **Correção:** a pintura agora congela `initialSelectedIds`, `anchorId` e `mode` no `pointerdown`. Cada `pointermove` usa `document.elementFromPoint(clientX, clientY)` e `data-article-selection-id` para localizar a checkbox atual.
- **Comportamento:** `applySelectionPaint` recalcula imediatamente o intervalo inclusivo desde a âncora; avançar amplia a pintura e voltar reduz o intervalo, restaurando a seleção inicial fora dele. Seleções ocultas permanecem preservadas.
- **Proteções:** a tolerância passou a 4px; somente após ultrapassá-la ocorre `preventDefault`, bloqueio temporário de seleção de texto e atualização de `selectedArticleIds`. `pointerup`/`pointercancel` apenas encerram e suprimem o clique sintético.
- **Verificado:** testes direcionados 9/9 cobrem pintura para frente, retorno, modo desmarcar e seleção oculta. No Chrome autenticado, o caminho de mouse foi validado para avanço, retorno e ausência de seleção nativa de texto; touchpad físico específico permanece pendente.
## Métricas Ads e KGR opcional — 2026-08-03

- **Verificado no código:** o contrato do Arquiteto aceita `demandEvidence` opcional, com KGR histórico, métricas Ads normalizadas, séries mensais, CPC/competição Ads, tendência/sazonalidade, close variants e referência de snapshot.
- **Verificado no código:** ausência e `null` permanecem indisponíveis; zero recebido continua zero. KGR ausente não impede a formação.
- **Verificado no código:** ArticleDNA e ArticleControlContext transportam a evidência sem alterar o limite de uma principal e até cinco apoios; snapshot de proveniência remove identificadores de conta e payload bruto.
- **Verificado no código:** o Arquiteto não chama Google Ads e não altera o Minerador; Serper permanece independente.
- **Verificado por teste:** KGR opcional, preservação de null/zero, separação Ads, close variants, snapshot e não escolha por volume.
- **Ainda não verificado:** importação autenticada de uma keyword realmente enriquecida no Minerador e persistência remota da medição. Nenhuma chamada paga ou migration foi executada.
- **Persistência canônica do primeiro consumidor — 2026-08-11:** ArticleDNA, SiloDNA e SiloPage agora passam por `resolvePipelineContext()` e pelo `ArtifactVersionRepository` server-side, com `brandId` explícito, actor Supabase SSR, append-only, hash idempotente e confirmação `PERSISTED`/`UNCHANGED` antes do sucesso.
- **SiloPage:** a persistência exige `source_version_id` de SiloDNA canônico da mesma Brand; referências locais ausentes não são convertidas em sucesso remoto.
- **Leitura:** `/api/arquiteto/artifacts` reconcilia os artefatos canônicos por Brand. Recuperação local/IndexedDB continua preservada como compatibilidade e não substitui uma falha remota.
- **Escopo:** `sendWorkflowCommand()`, Radar, Minerador, migrations, schema e handoffs não foram alterados. A tabela de status-events prevista no legado ainda não faz parte de 0027; a UI reconstrói o status atual do artefato somente para leitura.
- **Verificado localmente:** teste canônico 6/6, `test:arquiteto` 89/89, runtime 7/7, TypeScript, ESLint dos arquivos novos/rotas e `git diff --check`. Nenhum smoke remoto foi executado.
- **Estado:** `IMPLEMENTED_LOCAL`, `TESTED_LOCAL`, `REMOTE_SMOKE_PENDING`; próximo gate: `READY_FOR_ARQUITETO_CANONICAL_PERSISTENCE_REMOTE_SMOKE`.

## Bootstrap canônico do workspace em fresh origin — 2026-08-11

- **Cadeia anterior:** as linhas exibidas nascem em `masterList`, montada por `fetchMasterList()` a partir de `listas_kgr`, `keywords_kgr` e `briefings_artigos`; o contexto editorial também continua consumindo `/api/editorial/workspace` e recovery local como superfície legada/mista. O GET `/api/arquiteto/artifacts` apenas preenchia os mapas `acceptedArticleDnas`, `acceptedSiloDnas` e `acceptedSiloPages`.
- **Causa confirmada:** o readback `CANONICAL_REMOTE` era válido, mas não havia adapter entre `VersionEnvelope<ArticleDNA>` e as linhas mínimas que `articlesList` deriva de `masterList`; por isso a tela podia ficar vazia mesmo com ArticleDNA remoto aceito.
- **Implementação local:** `lib/arquiteto/canonical-bootstrap.ts` materializa somente campos já presentes no contrato. A keyword é lida do snapshot sanitizado `keywordDnaSnapshot.sourceKeywordSnapshot.keyword`; slug, hierarquia, intenção, métricas, silo, Brand e entidade vêm do próprio payload/envelope. Sem esse snapshot, o resultado é `INVALID_ARTIFACT`/contract gap explícito, sem defaults editoriais.
- **Precedência:** `CANONICAL_REMOTE` substitui cópia equivalente usando somente `keywordId` ou identidade de entidade (`entityId`/cluster); `LOCAL_RECOVERY` exclusivo é preservado; itens legados recebem `LEGACY_REMOTE`. Não há comparação por nome, slug, owner ou e-mail, e o adapter ignora outra Brand.
- **Erros:** a rota mantém `NO_DATA` como lista vazia; `QUERY_FAILURE`, `SCHEMA_MISSING`, `NOT_AUTHORIZED` e `INVALID_ARTIFACT` preservam código e não são convertidos em empty state. Readback estrutural inválido agora usa `INVALID_ARTIFACT` com diagnóstico sanitizado.
- **Verificado localmente:** fresh-origin, precedência, recovery-only, não duplicação, isolamento de Brand, contract gap e `NO_DATA` estão cobertos; persistência/readback canônico 11/11, `test:arquiteto` 89/89, pipeline runtime 7/7, TypeScript, ESLint dos arquivos afetados e `git diff --check` passaram.
- **Validação manual:** a sessão autenticada abriu `s-smoke`, mas o servidor local ficou preso em `Failed to fetch` de uma chamada legada e não permitiu concluir o smoke visual. Nenhum storage foi inspecionado, limpo ou promovido; nenhuma escrita remota, IA ou SERP foi executada.
- **Estado:** `READY_FOR_ARQUITETO_FRESH_ORIGIN_SMOKE`; não declarar homologação total. O handoff Minerador → Arquiteto e SiloDNA/SiloPage continuam fora desta etapa.

## Regressão do bootstrap após nova sessão — 2026-08-11

- **Causa confirmada:** o efeito de bootstrap dependia de comandos recriados pelo `EditorialPipelineContext`; os próprios setters do bootstrap atualizavam esse contexto e disparavam novas leituras canônicas em ciclo. O loading da origem legada também não podia governar a renderização canônica.
- **Correção local:** `modules/arquiteto/arquiteto-workspace.tsx` agora mantém estado explícito `LOADING`/`LOADED`/`EMPTY`/`ERROR`, finaliza sucesso, erro e cancelamento, materializa o remoto sem exigir `masterList` legado e mantém legacy/recovery como fontes complementares. Nenhuma nova importação, persistência ou operação remota foi adicionada.
- **Validação manual autenticada:** após reload/restart, o workspace exibiu 2 artigos sem spinner nem erro canônico, mesmo com a chamada legada `/api/editorial/workspace` falhando. IA, SERP, escrita remota e limpeza de storage não foram executadas.
- **Estado:** `READY_FOR_ARQUITETO_BOOTSTRAP_REGRESSION_SMOKE`; homologação remota e o handoff Minerador → Arquiteto continuam fora desta etapa.

## Handoff canonico Minerador -> Arquiteto - implementacao local - 2026-08-11

- **Entrada protegida:** `POST /api/arquiteto/handoff` recebe `brandId` e IDs de keywords; `resolvePipelineContext({ brandId, module: "arquiteto", action: "create" })` resolve actor, sessao e autorizacao no servidor.
- **Ledger:** cada keyword valida da mesma Brand gera, quando necessario, um `editorial_workflow_items` com `subject_type = keyword`, `stage = architect`, `source_entity_id` igual ao ID canonico da keyword, origem `MINERADOR` e estado `received`. Nao ha copia do conteudo de `keywords_kgr`.
- **Idempotencia:** a unicidade de Brand, tipo, subject e etapa evita duplicacao; a rota retorna `PERSISTED` ou `UNCHANGED` depois da operacao remota.
- **Workspace:** `GET /api/arquiteto/workspace?brandId=...` monta o read model a partir do ledger, das keywords referenciadas e dos ultimos ArticleDNA/SiloDNA/SiloPage relacionados. Keyword sem ArticleDNA permanece visivel sem agrupamento.
- **Precedencia:** `CANONICAL_REMOTE` e a origem operacional. `/api/editorial/workspace`, localStorage e IndexedDB continuam apenas como legado/recovery e nao determinam o `masterList` novo.
- **Ainda nao verificado:** smoke autenticado remoto, repeticao idempotente, isolamento entre duas Brands e leitura apos nova sessao. IA, SERP, schema, migration e providers nao foram tocados.

## Diagnostico da divergencia do handoff canonico - 2026-08-12

- **Marcador do modal:** `effectiveImportedKeywordIdsForUi` nao e uma leitura direta do ledger. Sua precedencia e recovery plan/audit em memoria, `masterList` renderizada e, como fallback, `architectImportedKeywordIds` do contexto editorial.
- **Persistencia do marcador:** `architectImportedKeywordIds` e recuperado e salvo em `localStorage` por actor + Brand. Portanto, o rotulo `Ja importado no Arquiteto` pode ser `LOCAL_STORAGE`/`IN_MEMORY`, mesmo sem workflow canônico remoto.
- **Fonte do workspace:** `GET /api/arquiteto/workspace` filtra `editorial_workflow_items` por `marca_id` e `stage = architect`; a projecao aceita somente `subject_type = keyword` cujo `subject_id` resolve para `keywords_kgr` da mesma Brand. `state`, `source_entity_id`, `source_version_id` e payload sao carregados, mas nao filtram a entrada atual.
- **Estado:** divergencia relatada pelo usuario e confirmada no contrato local. O diagnostico remoto read-only foi preparado; nao houve repair, reimportacao forcada, backfill, limpeza de storage ou operacao remota.

## Limpeza estrutural sucessora 0032 — 2026-08-12

- **Evidência remota relatada:** o targeted preflight read-only classificou como `DROP_SAFE` as tabelas vazias e o helper exclusivos do recovery histórico 0016/0030; não foram encontrados consumidores runtime locais ou dependências externas bloqueadoras.
- **Preservação:** `public.pipeline_editorial_protect_append_only()` e os quatro consumidores canônicos — `content_document_versions_append_only_trg`, `editorial_artifact_versions_append_only_trg`, `editorial_serp_reviews_append_only_trg` e `editorial_serp_snapshots_append_only_trg` — permanecem fora do manifesto de remoção.
- **Preparação local:** SDD curta, migration sucessora 0032, preflight read-only, post-verifier read-only e rollback local/documental foram preparados. O nome real truncado da trigger 0030 é `brand_exceptional_operation_execution_events_append_only_trg_00`.
- **Estado de preparação:** `0030 runtime/schema = REMOVAL_PREPARED`, `0016 rollback table = REMOVAL_PREPARED`, `STRUCTURAL_CLEANUP_0032 = READY_FOR_MANUAL_APPLY`. 0031 continua reservada/abandonada; o resultado de aplicação está registrado abaixo.

## Resultado remoto da limpeza estrutural 0032 — 2026-08-12

- **Aplicação:** o usuário informou `MIGRATION_0032 = APPLIED` com sucesso.
- **Remoção:** helper 0030, três tabelas candidatas e trigger exclusiva foram confirmados ausentes pelo post-verifier.
- **Preservação:** 12/12 tabelas não-alvo, RLS/ACL/policies reportadas, `pipeline_editorial_protect_append_only()` e os quatro consumidores canônicos passaram; `TARGET_REMOVAL = PASS`, `PRESERVED_OBJECT_CHECKS = PASS` e `SHARED_APPEND_ONLY = PASS`.
- **Lacuna:** nenhum artefato pré-aplicação com o fingerprint do mesmo conjunto `public/non-target-catalog` foi encontrado localmente. `PRE_APPLY_FINGERPRINT = NOT_CAPTURED`; o hash pós-aplicação não será usado como baseline retroativo.
- **Verifier local:** `supabase/scripts/structural-cleanup-0032-post-verification-read-only.sql` está na versão v3; relações/função removidas são verificadas somente por catálogo, e o placeholder continua como `EVIDENCE_GAP`, sem falso FAIL estrutural.
- **Estado:** `STRUCTURAL_CLEANUP_0032 = PASS_WITH_DOCUMENTED_FINGERPRINT_EVIDENCE_GAP`. Não reaplicar 0032, não restaurar objetos e não alterar o schema por causa desta lacuna documental.
