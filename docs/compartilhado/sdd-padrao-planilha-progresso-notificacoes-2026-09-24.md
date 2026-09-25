# SDD — Planilha padrão, processos em lote progressivos e sino sem cards — 2026-09-24

> **Estado: APROVADA pelo dono do produto em 2026-09-24.** Q1 a Q9 fechadas (seção 14). Execução por fatias, na ordem da seção 9; cada fatia termina com testes e validação na tela pelo usuário.
> Esta SDD não autoriza código, migration, SQL remoto, chamada paga nem alteração de `localStorage`.
> Cada fatia da seção 9 só começa depois da aprovação desta SDD **e** da autorização da fatia.
> Revisada em 2026-09-24 contra a cópia de trabalho: sino e selects como entregas do outro workflow, seleção mista "pula e conta", marcadores de "processado" por coluna, `runBackgroundTask` fora do runner, ciclo de vida do provider, timeout com reconciliação, Importar do Descobrir fora dos blocos, Marca local, técnica de largura e decisões Q7 a Q9.

Grau de cada afirmação, como pede `AGENTS.md` §1:

- **[V] Verificado no código:** conferido em `a1beeb7` (branch `resgate/trabalho-nao-commitado-2026-09-05`), com `caminho:linha`.
- **[H] Hipótese técnica:** deduzida do código e da especificação do CSS; ainda não provada no DOM real.
- **[P] Proposto:** desenho desta SDD. Não existe no código.
- **[A] Em andamento:** outro workflow está gravando agora no Minerador. Na cópia de trabalho de 2026-09-24 já aparecem alterados `lib/minerador/keyword-page-type.ts`, `lib/minerador/keyword-vinculo.ts`, `lib/minerador/vinculo-batch.ts`, `lib/minerador/vinculo-screen.ts`, `lib/minerador/table-view.ts`, `modules/minerador/minerador-workspace.tsx`, `modules/minerador/discovery/discovery-table-placeholder.tsx`, `discovery-search-row.tsx`, `discovery-source-controls.tsx` e o novo `lib/minerador/discovery-table-cells.ts`. As linhas desses arquivos vão mudar. Por isso, nesta SDD, o que é do Minerador é citado **pelo nome do símbolo**. A linha é referência de `a1beeb7`, salvo quando marcada "cópia de trabalho".
- **Entregas pedidas ao outro workflow [A]** (esta SDD **não** as reimplementa; a F0 valida e congela o que ele entregar): os 4 seletores separados no rodapé; os 4 potenciais + 4 declarados no Potencial de página; Importar CSV e Colar lista na barra global do Processador; o conteúdo do "Organizar" (sem Silo, KGR num grupo, Relação com URL dentro de Vínculo, Arquitetura como com/sem processo); os selects no escuro; o Descobrir sem Histórico e Targeting; o helper de progresso em lote; e **a mudança do sino** (`components/global-notice-center.tsx`). Em 2026-09-24 o sino ainda **não tem diff**: `publishNotice` continua chamando `setAutoOpenNotice` (`global-notice-center.tsx:110`) [V]. O helper de progresso em lote também ainda não existe na cópia de trabalho [V].

Precedência: abaixo de invariantes e ADRs, acima de spec e código (`AGENTS.md` §1). Esta SDD obedece à SDD de egress (`docs/compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md`, R1 a R24), ao contrato do Operational Grid (`docs/compartilhado/operational-grid.md`) e ao sistema visual (`docs/compartilhado/sistema-visual.md`).

---

## 1. Resumo para o dono do produto

**O que você pediu.** A planilha do **Minerador · Processador** passa a ser o **modelo de todas as planilhas** da plataforma: visual, navegação, seletores, filtros, cores, estrutura, tamanho e comportamento. Todo processo em lote, em qualquer área, passa a andar em partes e a mostrar o andamento: quantas já fez, quantas faltam, quantas falharam. O sino deixa de abrir cards: ele só marca que há aviso novo.

**Como vai ser feito.** Primeiro termina o trabalho que está sendo feito agora no Minerador (Processador e Descobrir). Aí o Minerador fica **congelado como modelo**. As peças dele saem para uma pasta compartilhada. Cada área passa a usar essas mesmas peças, uma de cada vez, na ordem do fluxo: Marca, Minerador, Arquiteto, Radar, Redator, Publicações, Conta e Admin. Nenhuma área ganha visual próprio.

**O que muda para você, em todas as áreas.**

| O quê | Como fica |
| --- | --- |
| Cabeçalho da planilha | Fica **preso no topo** ao rolar a lista. |
| Coluna principal (keyword, ou o título do artigo) | Fica com **todo o espaço que sobra**. Nunca é cortada: se não couber numa linha, quebra e aparece inteira, com o slug também inteiro. As outras colunas ficam só do tamanho necessário. |
| Células de número | **"—"**: nunca passou pelo processo. **"0" cinza**: passou pelo processo e não veio dado (o dado continua vazio no banco, o "0" é só visual e não entra em KGR, filtro nem elegibilidade). **"0" normal**: o provider mediu zero de verdade (ex.: allintitle 0, o melhor caso de KGR). Como separar os dois "0" sem depender só da cor é a decisão **Q8**. **"Erro"** em destaque de erro: o processo falhou, e o motivo aparece ao passar o mouse. **"Medindo…"**: está rodando agora. Só vira "0 cinza" a coluna que tem um marcador gravado de "processado" (seção 5.2.1); sem marcador, continua "—". |
| Seletores (selects) | Legíveis nos dois temas: no escuro a lista abre escura; no claro, clara. |
| Barra global da área | As ações da área ficam na barra do topo: no Processador, **Organizar**, **Importar CSV**, **Colar lista** e **Exportar**. |
| Rodapé de ações em grupo | **Um seletor para cada escolha humana**, cada um com as suas opções. No Minerador: KGR, Posto de principal, Potencial de página (4 potenciais + 4 declarados) e Assunto. As mesmas escolhas da Revisão Humana. Seleção mista **não bloqueia**: o que não se aplica é pulado e contado (ex.: "3 keywords são Assunto e foram puladas: o KGR não se aplica a Assunto"). No celular, os seletores vão para "Mais ações". |
| Processos em lote | Andam **em partes** (blocos). Uma faixa no rodapé mostra, por exemplo: *"Resultados · 5 de 30 feitas · faltam 25 · 1 falha · bloco 2 de 6 rodando há 14 s"*. Se nada avançar por muito tempo, a faixa **avisa** e oferece esperar ou parar. Se você mudar de área, um marcador pequeno ao lado do sino continua contando. |
| Parar | Botão **Parar**: termina o bloco que está rodando e para. O que já foi feito fica gravado. Nada é desfeito. |
| Recarregar a página | O lote vive na aba. Recarregar ou fechar para os blocos que faltam; o que já voltou fica gravado, e o navegador pede confirmação antes de sair. Aceitar esse limite é a decisão **Q9**. |
| Falhas | São **contadas**, com o motivo de cada uma. Uma falha não derruba o lote: os blocos seguintes continuam. Só param todos quando a falha vale para todos (por exemplo, crédito do provider acabou). |
| Sino | **Não abre mais cards.** Só marca o número de avisos não lidos. No fim de cada lote entra **um** aviso com o resumo, e não um por item. O andamento nunca vai para o sino: fica na faixa. |

**O que NÃO muda.**

- Nenhum dado muda de formato. Nenhuma migration. Nenhuma tabela nova. Por isso **Importar do Descobrir não é dividido em blocos** nesta SDD: cada bloco viraria um registro de importação próprio no banco (seção 5.5).
- **Nenhuma leitura nova do banco.** O andamento é contado no seu navegador, sem consultar o banco de tempos em tempos (a SDD de egress proíbe isso).
- **Nenhum custo novo.** Dividir em blocos não repete cobrança: você confirma o custo uma vez, para o lote inteiro, como hoje.
- As suas preferências salvas no navegador (colunas, ordem, visões) são mantidas.
- A regra de cada área (KGR, ArticleDNA, evidência, publicação) continua sendo da própria área. A planilha padrão só mostra.
- O Planejador está fora do fluxo desde 2026-09-18 e fica como está.

**O que precisa de você.** Aprovar esta SDD e responder às 9 decisões da seção 14. Cada uma já vem com a recomendação.

---

## 2. Identificação

| Campo | Valor |
| --- | --- |
| Estado | **APROVADA** em 2026-09-24 |
| Data | 2026-09-24 |
| Aprovador | dono do produto |
| Pedido de origem | Dono do produto, 2026-09-24: planilha do Minerador · Processador como padrão de todas as planilhas; processos em lote escalonados com andamento visível; sino sem cards; "aplicado e padronizado em todos os processos para todas as áreas e módulos, a nível da plataforma". |
| Módulo proprietário | **Por fatia** (`AGENTS.md` §3). F1: shell global (sino e tema). F2 e F3: **Minerador**, dono do modelo, que extrai as peças para `components/`. F4 em diante: o módulo que adota. |
| Classe | **Estrutural** (`AGENTS.md` §4): substitui componente compartilhado (`OperationalDataGrid`), muda o comportamento documentado do `GlobalNoticeCenter` (`sistema-visual.md` §24), muda a forma como as rotas pagas são chamadas em lote (em blocos) e **acrescenta um provider global** (`BatchRunProvider` em `components/providers.tsx`, montado por `app/layout.tsx:48`). Esse provider é **hidratação global** no sentido de `AGENTS.md` §4 e fica declarado aqui: guarda só estado de execução em memória, não lê banco, não lê `localStorage` e não hidrata dado de domínio. |
| Migration | **Nenhuma.** |
| Chamada paga | **Nenhuma nova.** Testes usam fixtures. O smoke manual de lote pago (Resultados, SERP) é do usuário, com autorização explícita. |
| Relação com documentos existentes | Executa a adoção planejada em `docs/compartilhado/operational-grid.md` §5, §14 e §15, e em `docs/compartilhado/task-operational-grid-adoption.md` (R1 a R6 continuam PENDING, `:128-141`). O inventário da seção 4 desta SDD é a entrega de R1. |

---

## 3. Premissas

1. **O modelo é o Minerador · Processador depois do trabalho de 2026-09-24** [A]. Nada é extraído antes de o outro workflow fechar e a suíte do Minerador estar verde. O "modelo" hoje **não é um só**: Processador e Descobrir divergem em técnica de largura e em tamanho de fonte (seção 4.2 e Q7). A F0 registra as duas formas e a F2 escolhe uma.
2. **A planilha padrão é só apresentação e gesto.** Não interpreta KeywordDNA, ArticleDNA, evidência nem PublicationRecord. A regra de domínio fica no adapter de cada módulo (`operational-grid.md` §4 e §5).
3. **O andamento vive no cliente.** A SDD de egress veta polling e Realtime enquanto o disparo for caro (R11, R12). O navegador divide o lote em blocos, conta o que voltou e mostra.
4. **O "0" cinza nunca é gravado.** Volume ausente não é zero (ADR-020, citado em `lib/minerador/discovery-table-cells.ts`). Filtro, ordenação, KGR e elegibilidade tratam a célula como ausente.
5. **"Processado" precisa vir de um marcador que a tela já lê, coluna por coluna** (seção 5.2.1). Estado de tentativa guardado só no React some ao recarregar (`lib/minerador/process-state.ts:10`, `MineradorAttemptState`) [V]. O estado "atual" de `resolveMineradorProcessState` **não serve** de marcador de "processado sem dado", porque exige número medido (seção 5.2.1) [V]. Se uma coluna não tiver marcador persistido já lido pela tela, a célula mostra "—", e criar o marcador é mudança de contrato de dados daquele módulo, fora desta SDD.
6. **Ordem de adoção:** `Marca → Minerador → Arquiteto → Radar → Redator → Publicações → Conta → Admin`. O Planejador está fora do fluxo desde 2026-09-18 (invariantes 47 a 49; `tests/planejador-fora-do-pipeline.test.mts`) e não é migrado. **Exceção com dependência técnica comprovada** (`AGENTS.md` §18, "não alterar a ordem sem dependência técnica comprovada"): as peças compartilhadas só existem depois de extraídas do Minerador. Por isso F2 e F3 (extração no Minerador) vêm antes da F4 (Marca). A Marca continua sendo a **primeira área a adotar** peças já extraídas, e o fechamento do Minerador (F5) vem depois dela.

---

## 4. Contrato atual por módulo

### 4.1 Minerador · Processador — o modelo

| Peça | Onde | Estado |
| --- | --- | --- |
| Tabela | `modules/minerador/minerador-workspace.tsx:3587`, `<colgroup>` em `:3588-3590` | [V] |
| Cabeçalho | `KeywordTableHeader` com `sticky top-0 z-20` (`:3593`) | [V] |
| Invólucro | `KeywordTableShell scroll="x"` (`:3545`), que aplica `overflow-x-auto overflow-y-visible` (`modules/minerador/keyword-table/keyword-table-shell.tsx:7`) | [V] |
| Cabeçalho fixo | Pelo CSS, `overflow-y: visible` vira `auto` quando `overflow-x` não é `visible`. O shell vira o contêiner do `sticky`, mas não rola na vertical, então o cabeçalho não prende quando a página rola. Na cópia de trabalho o Processador continua com `scroll="x"`; o Descobrir já passou a `scroll="both"` com `max-h-[calc(100dvh-2.5rem)]`, que é a opção A da seção 5.1 [A]. | [H] |
| Colunas | drag, #, seleção, Palavra-Chave, Vínculo, Resultados, Volume, KGR, CPC, KD, Intenção, Nicho, Funil, Status. Larguras em `:255-258`, limites em `:259-263`. Keyword: `min 240`, `max 1200`, `flexible`. **Intenção e Nicho também são `flexible`** (`min 104`, `max 420`, `:261`). | [V] |
| Larguras | `resolveKeywordTableResponsiveWidths` (`modules/minerador/keyword-table/use-keyword-table-responsive-widths.ts:62-94`) encolhe as flexíveis primeiro, depois as normais, por último as protegidas. A keyword é flexível, logo está entre as primeiras a encolher, e nada lhe dá a sobra. Técnica: `table-fixed` com `minWidth` calculado (cópia de trabalho `:3622`). | [V] |
| Fonte | Tabela em `text-[12.5px]` (cópia de trabalho `:3622`); o arquivo tem 23 `text-[10px]` e 18 `text-[11px]`. Fica abaixo do mínimo de 14px para célula de tabela (`sistema-visual.md` §8). O Descobrir já usa `text-sm` (14px). Ver Q7. | [V] |
| Célula da keyword | Quebra sem cortar (`:3837-3847`, `whitespace-normal break-words`) | [V] |
| Barra global | Registrada na `GlobalTopbar` por `registerControls` (cópia de trabalho `:3285-3335`): Organizar, `discoverySourceActions` (Importar CSV e Colar lista, que abrem o modal "Esta lista é") [A] e Exportar. Em `a1beeb7`, o `<input type="file" hidden>` (`:3381`) não tinha nenhum `.click()`: não havia como importar CSV pela barra. O botão Exportar tem cor fixa e fonte de 11px (`border-slate-800`, `text-emerald-500`, `text-[11px]`). | [V] [A] |
| Filtros ("Organizar") | Painel começa em `:3389`. Cores fixas no código (`bg-[#0b0c10]`, `border-slate-900`, `text-slate-*`): 68 ocorrências de `bg-[#`, `text-slate-` ou `border-slate-` no arquivo. | [V] [A] |
| Rodapé | `KeywordTableBulkBarShell` (`keyword-table-bulk-bar-shell.tsx:4`): fixo, `h-11`, `left=var(--minerador-sidebar-width)`. Em `a1beeb7`: um select KGR (`:4239`), um select Vínculo que juntava Assunto, Tipo de página e Posto (`:4254-4268`) e um select Status (`:4280`). Na cópia de trabalho [A]: KGR mais os três de `VINCULO_BATCH_CHOICE_GROUPS` (`lib/minerador/vinculo-screen.ts`: Posto, Potencial com 8 opções em `optgroup` Potencial/Declarado, Assunto), mais Status. | [V] [A] |
| Rodapé no celular | Abaixo de `sm` (640px), os selects do rodapé são `hidden … sm:block` e reaparecem **dentro de "Mais ações"** como selects com rótulo (`sm:hidden`, `a1beeb7:4308-4340`). Não somem. | [V] |
| Seleção mista com Assunto | O KGR em grupo **tira o Assunto do lote, aplica nas demais e conta as puladas** (`partitionSubjectKeywords` e `describeSubjectSkipped`, cópia de trabalho `:2604-2605`). O Posto em grupo pula com os motivos `subject_declared` e `not_published` (`planVinculoBatch`, `lib/minerador/vinculo-batch.ts`). O Potencial de página em grupo **não pula a publicada**: grava o que foi escolhido, inclusive "potencial" (`setKeywordPageType` recebe `published` e não recusa). | [V] [A] |
| Selects no escuro | Em `a1beeb7`: `bg-transparent` (`:4245`, `:4260`, `:4286`) e nenhum `color-scheme` no projeto. Na cópia de trabalho [A]: `scheme-dark` **fixo** em quatro arquivos: `minerador-workspace.tsx:387` (`BULK_SELECT_THEME = "scheme-dark *:bg-background *:text-foreground"`), `discovery-search-row.tsx:11`, `discovery-source-controls.tsx:114` e `discovery-table-placeholder.tsx:90`. Com `scheme-dark` fixo, a lista nativa abre escura também no tema claro (`[data-theme="light"]`, `app/globals.css:57`). `*:bg-background` e `*:text-foreground` são tokens e acompanham o tema. | [V]; efeito no tema claro: [H] |
| "—" e "-" | Resultados e Volume mostram `"-"` (hífen) quando `null` (`:3940-3942`, `:3953`); KD mostra `"—"` (`:4014`). | [V] |
| Marcador de processado | `resolveMineradorProcessState` (`lib/minerador/process-state.ts:117`) só marca Volume e Resultados como "atuais" com medição numérica válida. **Não distingue "processado sem dado"**. Os marcadores candidatos por coluna estão na seção 5.2.1. | [V] |
| Seleção | `useKeywordTableSelection` sobre as linhas visíveis (`:493-494`) | [V] |
| Motor de progresso | `BulkProgressState` (`:274-338`); `startBulkProgress` (`:724`), `updateBulkProgress` (`:743`), `finish`. Um lock (`bulkProgressLockRef`) impede dois lotes ao mesmo tempo. A barra fica dentro do rodapé (`:4393-4428`, `role="progressbar"`) e só existe com seleção. | [V] |
| Lógica | Derivação local com `updateBulkProgress(index+1)` a cada item; a gravação vem depois, em blocos de 20, **sem progresso**. | [V] |
| Resultados | `handleBatchAllintitle` (`:2989`) envia **um único `fetch`** com todos os ids. A rota aceita até 1000 (`app/api/minerador/marcas/[brandId]/dataforseo/allintitle/route.ts:34`), processa em sequência e não declara `maxDuration`. No cliente, `current` fica em 0 até o fim: "só mostra o começo e o final". | [V] |
| Volume | `handleBatchQualify` (`:3112`): um único `fetch`; mesmo sintoma. | [V] |
| Idempotência | `operationRequestId` (uuid) no corpo (`route.ts:28`); a chave do ledger é `dataforseo:{operationRequestId}:{kind}:{id}` (`route.ts:136-137`). | [V] |
| Readback | `readCanonicalKeywordRows` (`:571-585`) faz `select("*")` em blocos de 200 na tabela completa (`MINERADOR_KEYWORDS_TABLE`, padrão) e **substitui o `KeywordItem` inteiro** no estado. Aceita `source` para ler da view podada `MINERADOR_LISTING_VIEW` (`lib/minerador/listing-payload.ts:102`), que a listagem já usa, com recuo para a tabela quando a view não existe (`42P01`/`PGRST205`, cópia de trabalho `:374-380`). Fere R5 da SDD de egress. | [V] |
| Avisos | `showNotification` (`:689`) chama `publishNotice`; 111 chamadas; o início de lote publica INFO `persistent`. | [V] |

### 4.2 Minerador · Descobrir

| Peça | Onde | Estado |
| --- | --- | --- |
| Tabela | `modules/minerador/discovery/discovery-table-placeholder.tsx` | [V] [A] |
| Colunas | Keyword, Relação, Resultados, Volume, **Histórico**, CPC, Concorrência Ads, Intenção preliminar, Funil preliminar, **Targeting**, Situação (+ Perspectiva no modo cliente) | [V] [A]: o dono pediu tirar Histórico e Targeting |
| Keyword cortada | Em `a1beeb7`, `keywordCell` com `max-w-[380px] truncate` | [V] [A] |
| Largura e rolagem (cópia de trabalho) | **Layout automático**: sem `table-fixed` e sem `minWidth` na tabela, fixado por `tests/minerador-table-responsive-scroll.test.mts` (`doesNotMatch(discovery, /table-fixed\|minWidth:/)`). Shell `scroll="both"` com altura presa (`discovery-table-placeholder.tsx:293`). Fonte `text-sm`. Diverge do Processador. | [A] |
| Importar | Idempotência por `importRequestId`: cada id vira uma linha em `minerador_discovery_import_batches`, e reusar o id com outra seleção devolve `MINERADOR_DISCOVERY_IMPORT_REQUEST_REUSED` (`app/api/minerador/marcas/[brandId]/discovery/import/route.ts:157-190`). | [V] |
| Seleção | Em `a1beeb7`, `useKeywordTableSelection(baseIds)` recebia todas as candidatas, e `toggleVisible` marcava também as ocultas pelos filtros. Na cópia de trabalho já passa `selectionScopeIds`. | [V] [A] |
| Três estados da célula | Já existe, só para o Descobrir: `DiscoveryCellTone = "value" \| "processed_empty" \| "not_processed" \| "error" \| "pending"` (`lib/minerador/discovery-table-cells.ts`, arquivo novo, não commitado). | [A] |
| Lote | Volume, SEO e Importar: um `fetch` cada, sem barra, só um aviso PENDING no início e outro no fim. | [V] |

### 4.3 Minerador · Pesquisa por Assunto e diálogos

- `subject-search-results.tsx:169-171` reusa `KeywordTableHeader` com `sticky` [V].
- `discovery-source-controls.tsx:406` e `subject-search-dialogs.tsx:104` são tabelas simples de prévia dentro de diálogo [V].

### 4.4 Marca

- `modules/marca/site-sitemap-panel.tsx:263-265`: três tabelas (`min-w-[1060px]`, `min-w-[720px]`, `min-w-[980px]`) [V].
- `brand-page.tsx:160`: tabela da equipe (`min-w-[900px]`) [V].
- `persist` (`site-sitemap-panel.tsx:121-123`) grava o workspace do site **no navegador** (`saveBrandSiteWorkspace` → IndexedDB ou `localStorage`, `lib/marca/site-store.ts:24-27`, `persistenceMode: "local_fallback"`), **não no banco**. É armazenamento de recuperação, não persistência canônica (`AGENTS.md` §10) [V].
- `verifySelected` (`:173`) é o único lote de rede: um `fetch` por URL, em série, **sem progresso**, e salva o workspace local **uma vez no fim**. Uma falha no meio lança erro antes do `persist`, e o que já foi verificado se perde [V].
- `extractSelected` (`:181`) e `reextractEntries` (`:175-179`) são **cálculo local, sem rede**. Não há lote de rede a escalonar [V].

### 4.5 Arquiteto

- Tabela de artigos: `modules/arquiteto/arquiteto-workspace.tsx:15532`, dentro de `overflow-x-auto` (`:15531`), `thead sticky top-0` (`:15536`). Mesmo problema de `sticky` do Processador [H]. Colunas em `:572-589` [V].
- Importa do Minerador `keyword-table-resize` e `use-keyword-table-responsive-widths` (`:292-293`) [V].
- Seleção própria (`lastSelectionAnchorId`). Rodapé (`:16900-16975`) não é fixo: `shrink-0 overflow-x-auto` [V].
- Outras tabelas: `:17074`, `article-formation-review.tsx:728`, `serp-paid-plan-dialog.tsx:55`; linhas de Silos em `territorial-workspace-rows.tsx` [V].
- Tarefas em segundo plano: `runBackgroundTask` (`components/editorial-pipeline-context.tsx:425-459`; contrato em `lib/editorial/background-tasks.ts`) deduplica por ator, marca e tipo. `BackgroundTaskInput` é um `execute(update)` **opaco**: a própria tarefa reporta `update({message,current,total})` e devolve um `result`. Só aplica mudanças se ator e `sessionEpoch` forem os mesmos da partida (`:437`). Usos: `:2135` (lógica), `:4072` (revisão por IA), `:4316` (ArticleDNA), `:4374` (SiloDNA), `:4466` (SiloPage). O estado fica em `backgroundTasks` do estado editorial da marca, e o Arquiteto **consome o `result` depois**, mesmo se tiver sido remontado, com `consumeBackgroundTask` (`arquiteto-workspace.tsx:4699-4811`) [V].
- Exibição: `components/editorial/background-task-notice.tsx`, um **card flutuante** no canto inferior direito, com cores fixas, usado em `:16976` [V].
- SERP por keyword em lotes de 6 (`:9209-9227`), texto "x/y" via `serpProgress` (`:8225`); SERP territorial em uma chamada (`:8464`) [V].
- 51 ocorrências de cor fixa [V].

### 4.6 Radar

- Planilha: `modules/radar/radar-page.tsx:4563`, `OperationalDataGrid` com `renderBulkBar={rows => <RadarR4BulkOperationsBar …/>}` [V].
- Tabelas soltas: `radar-r3-serp-panel.tsx:410` (`min-w-[900px]`), `radar-r3-workbench.tsx:952`, `radar-r3-research-details.tsx:168`, `radar-r3-content-dossier.tsx:55,104,214` [V].
- Fila SERP (`radar-page.tsx:1606-1636`): um artigo por vez, estados QUEUED, RUNNING, WAITING_REVIEW, COMPLETED, FAILED_RETRYABLE, FAILED_FINAL. Resumo em `buildRadarR5QueueProgress` (`lib/radar/r5-sequential.ts:122-136`), exibido por `RadarR5QueueProgress` (`radar-r4-bulk-operations-bar.tsx:65`). É a melhor contagem por estado da plataforma [V].
- Extração de concorrência (`:3530-3600`): lotes de 5, e o progresso sai como `setNotice("Analisando páginas x de N…")` (`:3588`), que `useNoticeBridge` (`:975`) transforma em **uma notificação por passo** [V].
- Verificação de fontes em lotes (`:3743`) [V].

### 4.7 Redator

- Não tem planilha de dados; `writer-page.tsx` é um editor [V]. Não tem lote.

### 4.8 Publicações

- `modules/publicacoes/publications-workspace.tsx:176`: `OperationalDataGrid`, rota viva [V].
- `publications-page.tsx:48` é exportado (`modules/publicacoes/index.ts`), mas nenhuma rota o importa: parece legado [V].
- Só ações por linha [V].

### 4.9 Conta

- `account-page.tsx:69`: matriz de permissões com `bg-slate-900` fixo [V].
- `agency-workspace-controls.tsx:90` (membros) e `agency-mcp-panel.tsx:206` (grants) [V].
- Só ações por linha [V].

### 4.10 Admin

- Não usa `<table>`: listas `<ul>` e grids (`users-admin-panel.tsx:26`, `agencies-admin-panel.tsx:139-142`, `platform-integrations-panel.tsx:559-604`) [V]. Não tem lote.

### 4.11 Planejador (fora do fluxo)

- `planner-page.tsx:68` usa `OperationalDataGrid` [V].

### 4.12 Componente compartilhado existente: `components/editorial/operational-data-grid.tsx`

Segunda implementação, diferente do modelo [V]:

- paginação de 25 a 200 ou "all" (`:113`);
- primeira coluna `sticky left` (`:186`, `:191`);
- células com `truncate` (`:191`): **corta a coluna principal**;
- redimensionamento próprio, 64 a 800 px (`:134-137`), sem prioridade de colunas;
- largura mínima de 960 px (`:184`);
- rodapé não fixo, com `overflow-x-auto` (`:196`);
- rolagem vertical interna (`:183`, `min-h-0 flex-1 overflow-auto`): o cabeçalho `sticky` funciona aqui;
- grava `localStorage` **a cada evento de rolagem**, sem limitar a frequência e sem try/catch (`:183`); a restauração lê `${storageKey}:scroll` (`:109`);
- visões salvas por `compact-saved-views.tsx`, chave `minerador-pro:last-view:…`.

Consumidores: Radar, Planejador e Publicações (duas telas). Testes que dependem dele: 9 (`operational-flow`, `planner-global-topbar`, `publicacoes-global-topbar`, `radar-*`) [V].

### 4.13 Notificações e sino

- `GlobalNoticeProvider` (`components/global-notice-center.tsx:96`) guarda os avisos em memória, por escopo. É montado em `components/providers.tsx:17`, junto do `EditorialPipelineProvider` (`:20`) [V].
- A mudança do sino foi pedida ao outro workflow [A]. Em 2026-09-24 o arquivo ainda não tem diff [V].
- `publishNotice` **sempre** chama `setAutoOpenNotice(record)` (`:110`) [V].
- `NotificationBell` (`:266`) consome `autoOpenNotice` (`:351-362`) e abre o painel em **preview** a cada aviso novo; fecha sozinho depois de `NOTICE_PREVIEW_DURATION_MS = 5_000` (`lib/visual-notice-contract.ts:2`). **Estes são os "cards" que o dono quer tirar** [V].
- Toast só com `showToast` (`:112`) [V].
- Contador de não lidos: `unreadCount` (`:161`), badge em `:437` [V].
- Comportamento documentado como validado em `sistema-visual.md` §24 ("Avisos novos abrem o painel em preview curto") e exigido por `tests/visual-foundation.test.mts:120` (`assert.match(provider, /autoOpenNotice/)`) [V].
- Produtores: Minerador (`publishNotice` direto e `useNoticeBridge`), Arquiteto (`publishNotice`, 307 chamadas, e o card `BackgroundTaskNotice`), Radar (`useNoticeBridge`, 154 `setNotice`), Marca, Planejador, Publicações, Conta e Admin (`useNoticeBridge`) [V].

---

## 5. Padrão proposto: peças compartilhadas e API

Todas as peças abaixo são [P]. Nascem da extração do Minerador, depois que o modelo congelar (F0). Os nomes são propostos; a implementação pode ajustar a grafia, mas não o contrato.

Local: `components/operational-grid/` (componentes React) e `lib/operational-grid/` (funções puras, testáveis com `node --test`). Nenhuma peça importa de `modules/**`. Nenhuma conhece KeywordDNA, ArticleDNA ou outra regra de domínio.

### 5.1 Tabela padrão

Origem: `KeywordTableShell`, `KeywordTableHeader`, `KeywordTableEmptyState`, `keyword-table-order`, `keyword-table-resize`, `use-keyword-table-selection`, `use-keyword-table-responsive-widths`.

```ts
type OperationalGridColumn<Row> = {
  id: string;
  header: ReactNode;
  /** Exatamente uma coluna por tabela: recebe a sobra e nunca é cortada. */
  role?: "principal";
  /** Largura "do necessário" para as demais. */
  width: number;
  min?: number;                       // padrão 56
  max?: number;                       // ignorado na principal
  priority?: "protected" | "normal";  // ordem de sacrifício
  align?: "start" | "end";            // números: "end"
  sortValue?: (row: Row) => string | number | null;
  render: (row: Row) => ReactNode;
};

type OperationalGridProps<Row> = {
  rows: readonly Row[];               // já filtradas e ordenadas pelo adapter
  rowId: (row: Row) => string;
  columns: readonly OperationalGridColumn<Row>[];
  selection?: OperationalGridSelection; // ver abaixo
  ordering?: { mode: "manual" | "sort"; onReorder?: (ids: string[]) => void };
  detail?: (row: Row) => ReactNode;     // slot de detalhe (expansor)
  empty: { title: string; description?: string; action?: ReactNode };
  storageKey: string;                   // preferências do leitor; chaves antigas preservadas (§10)
  "aria-label": string;
};

function useOperationalGridSelection(visibleIds: readonly string[]): OperationalGridSelection;
// toggleVisible, Shift+clique e pintura operam SÓ sobre visibleIds, na ordem da tela.

function resolveOperationalGridWidths(input: {
  available: number;
  columns: readonly { id: string; role?: "principal"; width: number; min?: number; max?: number; priority?: "protected" | "normal" }[];
  humanResized: Readonly<Record<string, number>>;
}): { widths: Record<string, number>; needsHorizontalScroll: boolean };
```

**Técnica de largura: uma só para a plataforma.** Hoje há duas: o Processador usa `table-fixed` com larguras calculadas em JS; o Descobrir passou a layout automático [A] (seções 4.1 e 4.2). A F2 escolhe **uma**, com prova no DOM em 1440/1024/768/360, e a outra tabela do Minerador converge na F5.

- **Recomendada: layout automático com largura humana explícita.** O conteúdo define "o necessário" de cada coluna, sem medição em JS. As não principais recebem `white-space: nowrap` e largura mínima de conteúdo; a principal recebe a sobra. Largura redimensionada pelo humano vira `width` explícita na `<col>` daquela coluna. A tabela ganha `min-width` igual à soma dos mínimos, e só abaixo dela aparece a barra horizontal. Nesse caso, `resolveOperationalGridWidths` se reduz a calcular esse mínimo e aplicar as larguras humanas.
- **Alternativa: `table-fixed` com `resolveOperationalGridWidths` completo.** Larguras determinísticas e iguais entre linhas, mas "o necessário" vira preset fixo por coluna, que não acompanha o conteúdo.
- Critério de escolha: a keyword nunca é cortada; o cabeçalho continua alinhado com o corpo durante a rolagem; o redimensionamento e a ordem salvos continuam funcionando; nenhum salto de largura quando o readback troca linhas.

Regras de largura (valem para as duas técnicas):

1. As colunas não principais ficam com a largura "do necessário" (conteúdo, preset ou largura redimensionada pelo humano).
2. A principal recebe `available − soma(demais)`, sem teto.
3. Faltando espaço, encolhe nesta ordem: não principais `normal` → não principais `protected` → a principal, **só até o `min` dela** → barra horizontal.
4. Largura redimensionada pelo humano nunca é encolhida de volta (regra atual, descrita no comentário de `resolveKeywordTableResponsiveWidths`).
5. **Só a principal recebe a sobra.** Isso muda o Processador: hoje Intenção e Nicho também são `flexible` e disputam a sobra (`:261`). Na planilha padrão, as duas passam a colunas "do necessário". A mudança é registrada na F2 e validada no DOM.

Regras da principal: texto inteiro, `whitespace-normal break-words`, nunca `truncate`; slug abaixo, inteiro. No Minerador e em toda coluna que é keyword, usa o token `keyword` (`sistema-visual.md` §5.0.1). Nas outras áreas (título de artigo, URL), usa `foreground` com peso semibold.

**Cabeçalho fixo** — escolha técnica, a provar no DOM (F2):

- **A (recomendada):** o shell vira o contêiner de rolagem vertical **e** horizontal, com altura presa ao espaço útil da área (viewport menos topbar, cabeçalho da área e rodapé). A página deixa de rolar, então continua havendo **uma só** rolagem vertical (`operational-grid.md` §9). É o arranjo em que o `sticky` já funciona hoje em `OperationalDataGrid` (`:183`), e o que o Descobrir já adotou na cópia de trabalho (`scroll="both"` com altura presa) [A].
- **B (plano B):** cabeçalho fora do contêiner com rolagem horizontal, sincronizado por `scrollLeft`.

A posição de rolagem salva passa a ser gravada com frequência limitada (no máximo a cada 250 ms) e dentro de try/catch, com a mesma chave `${storageKey}:scroll`.

### 5.2 Célula de métrica com três estados (mais "rodando")

Origem: `lib/minerador/discovery-table-cells.ts` [A], promovido a genérico.

```ts
type MetricCellTone = "value" | "processed_empty" | "not_processed" | "error" | "pending";
type MetricCellDisplay = { tone: MetricCellTone; text: string; hint?: string };

/** Cada adapter responde com o dado que a tela já leu. Nenhuma leitura nova. */
function resolveMetricCell(input: {
  value: number | null | undefined;
  format: (value: number) => string;
  processed: boolean;          // marcador persistido já lido (premissa 5)
  failed?: { reason: string }; // falha persistida ou da execução atual
  running?: boolean;           // execução atual, só em memória
}): MetricCellDisplay;

function MetricCell(props: { display: MetricCellDisplay; align?: "end" }): JSX.Element;

/** Filtro, ordenação, KGR e elegibilidade usam isto, e não o texto. */
function metricCellIsAbsent(display: MetricCellDisplay): boolean; // true para tudo que não é "value"
```

| Tom | Texto | Cor (token) | Dica (`title` e texto para leitor de tela) |
| --- | --- | --- | --- |
| `value` | o número formatado, **inclusive 0 medido** | `foreground`, `tabular-nums` | — |
| `processed_empty` | `0`, com sinal não cromático definido pela Q8 | `text-muted` | "Processado, sem dado" |
| `not_processed` | `—` (travessão U+2014, nunca hífen) | `text-muted` (mesmo token, sem alpha extra; o glifo já diferencia) | "Ainda não processado" |
| `error` | `Erro` (ou `Pausada`) | texto `foreground` sobre fundo `danger-soft`, borda `danger` | "Falha no processo: {motivo}" |
| `pending` | `Medindo…` | `pending` | "Medição em andamento" |

Contraste do erro: `danger` (#A61E1E) sobre o fundo escuro (#131413) dá cerca de 2,5:1, abaixo do AA para texto de 14px. Por isso o texto não usa `danger`: usa `foreground` sobre `danger-soft` (cerca de 15:1), e a cor de erro fica na borda e no fundo. Os valores são dos tokens de `app/globals.css:4`, `:32` e `:52` [V]; o contraste foi calculado, não medido no DOM [H].

**Dois zeros.** O `0` medido (allintitle 0, volume `zero_confirmed`, que a tela já chama de "0 confirmado" em `lib/minerador/volume-kgr-consistency.ts:90`) é `value`. O `0` de "processado sem dado" é `processed_empty`. Só a cor não basta para separá-los (seção 7). O sinal extra é a decisão **Q8**.

Estado "desatualizado" (`stale`), onde existir, continua sendo selo do adapter e não um sexto tom.

#### 5.2.1 De onde vem "processado", por coluna do Processador

"Atual" em `resolveMineradorProcessState` exige número medido: Volume depende de `isValidGoogleAdsDemandMeasurement`, que pede `averageMonthlySearches` ou `rawVolume` numérico (`lib/minerador/google-ads-demand.ts:236-239`); Resultados depende de `isValidDataForSeoAllintitleMeasurement`, que pede resultado numérico (`lib/minerador/dataforseo-competition.ts:83-86`) [V]. Usado como marcador, todo "processado sem dado" cairia em "—". O adapter do Minerador usa, por coluna:

| Coluna | Marcador candidato de "processado" (campo já lido pela tela) | Marcador de erro | Estado |
| --- | --- | --- | --- |
| Resultados (allintitle) | `allintitle_measurement` válido. Allintitle 0 é **medição** (`value`), não "sem dado". `deriveDataForSeoCompetitionState` devolve `unavailable` para número sem proveniência válida (`:97-103`). | `allintitle_last_error` (`buildDataForSeoKeywordFailureSemantic`, `lib/minerador/dataforseo-allintitle.ts:127-145`) | [V]. Resultados quase nunca terá `processed_empty`. |
| Volume | `hasGoogleAdsDemandEvidence` (`google-ads-demand.ts:246-261`): aceita medição com `measuredAt` sem número, e elegibilidade medida. `zero_confirmed` é `value`. | a definir | [V] a função; **ainda não verificado** se a rota grava algo quando o Google Ads não devolve a keyword (`volume-provider.ts:89` devolve `not_found`). |
| KD | `canonicalSnapshot.metrics.kd` com `source === "processor"` e `value === null`: a tela já diz "Keyword Overview revalidado no Processador; KD não retornado" (cópia de trabalho `:3760-3769`). | falha do overview (`overviewFailures` na resposta da rota) | [V] o marcador; **ainda não verificado** se a falha do overview fica gravada. |
| CPC | `canonicalSnapshot.metrics.cpc` com `source === "processor"` e `sortValue === null`: "CPC não retornado" (cópia de trabalho `:3746-3753`). | — | [V] |
| KGR | Derivado: "processado" quando Volume e Resultados estão processados. Com um deles `processed_empty`, o KGR é `processed_empty` e **não é calculado**. | herdado das duas colunas | [P] |

**Pré-condição da F2:** provar com fixture, para Volume e KD, o que a rota grava quando o provider volta vazio. Se não gravar nada, a coluna fica em "—" até existir marcador, e criar o marcador é mudança de contrato de dados fora desta SDD (premissa 5).

### 5.3 Filtros de visualização

Origem: painel "Organizar" do Processador (`KeywordTableOrganizeButton` e o painel em `minerador-workspace.tsx`).

```ts
type ViewFilterGroup = {
  id: string;
  label: string;
  multiple: boolean;
  options: readonly { value: string; label: string; count?: number }[];
};
type ViewFilterState = Record<string, readonly string[]>;

function OrganizeButton(props: { activeCount: number; onOpen: () => void }): JSX.Element;
function ViewFiltersPanel(props: {
  groups: readonly ViewFilterGroup[];
  value: ViewFilterState;
  onChange: (next: ViewFilterState) => void;
  onClear: () => void;
}): JSX.Element;
function applyViewFilters<Row>(rows: readonly Row[], state: ViewFilterState, matchers: Record<string, (row: Row, values: readonly string[]) => boolean>): Row[];
```

O filtro é local: filtra linhas já carregadas. O estado pode ficar no `localStorage` como conveniência do leitor, com a chave atual de cada módulo. Os grupos de cada módulo são do adapter. No Minerador, o conteúdo pedido pelo dono em 2026-09-24 (sem Silo; KGR num grupo só; Relação com URL dentro de Vínculo; Arquitetura como com processo/sem processo) é feito pelo outro workflow [A] e entra no modelo congelado.

### 5.4 Rodapé de ações em grupo: um seletor por escolha humana

Origem: `KeywordTableBulkBarShell` e os selects do rodapé do Processador.

```ts
type BulkSkip = { id: string; reason: string };        // reason: código do adapter, ex. "subject_declared"

type BulkChoicePlan = {
  apply: readonly string[];                             // ids que recebem a escolha
  skipped: readonly BulkSkip[];                         // ids pulados, com motivo
  summary: string;                                      // "3 keywords são Assunto e foram puladas: …"
};

type BulkChoice = {
  id: string;                 // "kgr", "post", "page-type", "subject"
  label: string;              // rótulo visível
  options: readonly { value: string; label: string; group?: string }[]; // group: "Potencial" | "Declarado"
  /** Só quando NENHUM item da seleção pode receber a escolha; seleção mista nunca desabilita. */
  disabledReason?: string | null;
  /** O adapter separa o que se aplica do que é pulado, antes de confirmar. */
  plan: (value: string, ids: readonly string[]) => BulkChoicePlan;
  onApply: (value: string, plan: BulkChoicePlan) => void; // abre o runner (5.5) só com plan.apply
};

type BulkAction = {
  id: string;
  label: string;
  icon: ReactNode;
  onRun: (ids: readonly string[]) => void;
  tone?: "default" | "primary" | "danger";
  /** Menor número = fica visível por mais tempo; o resto vai para "Mais ações". */
  overflowPriority: number;
  disabledReason?: string | null;
};

function BulkActionBar(props: {
  selectedCount: number;
  summary?: ReactNode;
  choices: readonly BulkChoice[];
  actions: readonly BulkAction[];
  onClear: () => void;
}): JSX.Element;
```

Regras:

- **Um select por escolha**, cada um com as suas opções. Nunca um select que junta escolhas diferentes.
- As escolhas do rodapé são **as mesmas** da Revisão Humana, com o mesmo rótulo e as mesmas opções.
- **Seleção mista: pula e conta, nunca bloqueia.** É a regra que o modelo já segue [V] [A]: o KGR em grupo tira o Assunto do lote e avisa quantas saíram (`partitionSubjectKeywords`, `describeSubjectSkipped`); o Posto pula com `subject_declared` e `not_published` (`planVinculoBatch`). O `BulkChoice.plan` generaliza isso: a confirmação mostra "aplica em N, pula M" com os motivos, e o runner recebe só `plan.apply`. As puladas entram na contagem `skipped` do runner (5.5), com o motivo. `disabledReason` só existe quando **nenhum** item pode receber a escolha (ex.: seleção só de Assunto no KGR).
- A regra de exclusão é do adapter. No Minerador: Assunto é pulado no **KGR** e no **Posto de principal**; **Potencial de página** vale também para Assunto. O Potencial de página mostra 8 opções em dois grupos (4 potenciais e 4 declarados), vindas de `keywordPageTypeChoices()` (`lib/minerador/keyword-page-type.ts`) [A].
- **Publicada no Potencial de página em grupo.** Na linha, a publicada só oferece os 4 declarados (`keywordPageTypeChoices({ published: true })`) [V]. No rodapé, com seleção mista, o select mostra as 8; escolher um **potencial** pula as publicadas com o motivo "publicada: só declarado" e aplica nas demais [P]. Hoje o plano do lote **não** pula: grava "potencial" também na publicada [V]. Essa correção é do adapter do Minerador; se o outro workflow não a entregar, entra na F2.
- Escolhas que são de cada item (URL a conferir, confirmar publicada, nota e página de destino do Assunto) **não** entram no rodapé (mesma regra da SDD do Assunto, Q5).
- Uma linha só, `h-11`, fixa ao viewport. O que não cabe vai para "Mais ações" pela ordem de `overflowPriority`; os selects de escolha humana não vão para o menu antes das ações secundárias.
- **Abaixo de 640px** (`sm`), todos os selects de escolha humana saem da linha e aparecem **dentro de "Mais ações"**, cada um com rótulo visível, na mesma ordem do rodapé. É o comportamento atual do Processador (`a1beeb7:4308-4340`) [V] e passa a ser regra do `BulkActionBar`.

**Barra global da área.** As ações que valem para a lista inteira ficam na barra do topo, registradas por `registerControls` na `GlobalTopbar`, e não dentro da tabela. No Processador: Organizar (abre 5.3), Importar CSV, Colar lista [A] e Exportar. O padrão fixa a ordem (Organizar → entradas → saídas), só tokens (o Exportar atual tem `border-slate-800` e `text-emerald-500`) e fonte de pelo menos 14px, ou o tamanho que a Q7 decidir.
- Aplicar uma escolha em grupo usa o runner (5.5): o texto de andamento é o mesmo de qualquer lote.

### 5.5 Runner de lote progressivo

Origem: `BulkProgressState` e `startBulkProgress`/`updateBulkProgress` do Processador e a contagem por estado do Radar. `runBackgroundTask` do Arquiteto **não** é absorvido (regra 10). Se o helper que o outro workflow está criando [A] tiver a mesma forma, ele é promovido; se não, vira adapter deste contrato.

```ts
type BatchItemOutcome = {
  id: string;
  status: "succeeded" | "empty" | "failed" | "skipped";
  reason?: string;
  /** "final" para o lote inteiro (sem crédito, sem permissão); "retryable" só este item/bloco. */
  failureKind?: "retryable" | "final";
};

type ProgressiveBatchInput<Item> = {
  /** Deduplica: um lote por ator + marca + operação ao mesmo tempo. */
  key: { actorUserId: string; brandId: string; operation: string };
  /** Lotes do mesmo grupo não rodam juntos (preserva o lock atual do Minerador). */
  exclusiveGroup?: string;
  label: string;                     // "Resultados", "ArticleDNA"
  items: readonly Item[];
  itemId: (item: Item) => string;
  chunkSize: number;                 // por operação (tabela abaixo)
  chunkTimeoutMs: number;            // ver regra 5: o que acontece depende de onTimeout
  /** "abort": rota sem custo e sem gravação lenta. "reconcile": rota paga ou que grava (regra 11). */
  onTimeout: "abort" | "reconcile";
  stallAfterMs: number;              // sem avanço: a faixa pergunta "esperar ou parar"
  retry: { attempts: 0 | 1 };        // a nova tentativa reusa o MESMO operationRequestId
  /**
   * Chamada à rota. Só pode capturar dados imutáveis da partida (brandId, actorUserId, ids,
   * cliente Supabase). Nunca setState, ref ou closure do componente (regra 7).
   */
  runChunk: (chunk: readonly Item[], context: {
    chunkIndex: number;
    chunkCount: number;
    operationRequestId: string;      // um por bloco, estável entre tentativas
    signal: AbortSignal;
  }) => Promise<{ outcomes: BatchItemOutcome[]; rows?: readonly unknown[] }>;
  /** Readback só dos ids do bloco, com projeção estreita (seção 8). Devolve linhas; não mexe em estado. */
  readback?: (ids: readonly string[], signal: AbortSignal) => Promise<readonly unknown[]>;
};

/** Onde o módulo recolhe as linhas lidas pelo runner, montado ou remontado (regra 7). */
function useBatchRunResults(scope: { brandId: string; operation: string }): {
  pending: readonly { runId: string; rows: readonly unknown[] }[];
  consume: (runId: string) => void;   // mesmo padrão de consumeBackgroundTask
};

type BatchRunState = {
  id: string;
  label: string;
  status: "running" | "stopping" | "completed" | "partial" | "stopped" | "failed";
  total: number;
  done: number;          // succeeded + empty + failed + skipped
  succeeded: number;
  empty: number;
  failed: number;
  skipped: number;
  remaining: number;     // total − done
  chunk: { index: number; count: number; size: number; startedAt: string } | null;
  startedAt: string;
  lastAdvanceAt: string;
  stalled: boolean;
  failures: readonly { id: string; reason: string }[];
};

function useBatchRunner(): {
  start<Item>(input: ProgressiveBatchInput<Item>): string | null; // null = já existe um igual
  stop(runId: string): void;          // termina o bloco atual e para
  runs: readonly BatchRunState[];
};

function formatBatchProgress(state: BatchRunState): string;
// "Resultados · 5 de 30 feitas · faltam 25 · 1 falha · bloco 2 de 6 rodando há 14 s"
```

Regras:

1. **Blocos em sequência, um por vez.** Cada bloco é uma chamada comum à rota que já existe, com a lista menor. A rota não muda de contrato.
2. **Confirmação de custo uma vez**, para o lote inteiro, antes de começar. Os blocos não pedem nova confirmação e não somam custo além do confirmado.
3. **Falha não derruba o lote.** Item ou bloco com falha `retryable` é contado e o runner segue. Falha `final` (sem crédito, sem permissão, marca trocada) para o lote e declara: "Parado: {motivo}. 10 de 30 feitas, 20 não iniciadas".
4. **Nova tentativa reusa o `operationRequestId` do bloco.** A chave do ledger é por `operationRequestId` e alvo (`route.ts:136-138`), mas serve **só para registrar o uso**: não impede a rota de chamar o provider de novo para o mesmo alvo [V, conferido pelo revisor]. Por isso **rota paga usa `attempts: 0`**. Ligar `attempts: 1` numa rota paga exige antes que a rota pule alvo já medido com o mesmo pedido, o que é mudança de rota fora desta SDD.
5. **Nunca trava sem dizer.** `stallAfterMs` sem avanço marca `stalled` e a faixa oferece "Continuar esperando" ou "Parar". Com `onTimeout: "abort"`, `chunkTimeoutMs` aborta o bloco e conta falha `retryable`. Com `onTimeout: "reconcile"`, segue a regra 11. O relógio do "há 14 s" é local, sem rede.
6. **Parar** muda para `stopping`, espera o bloco atual e fecha em `stopped`, com o parcial declarado. Nada é desfeito.
7. **Ciclo de vida fora do módulo.** O `BatchRunProvider` fica em `components/providers.tsx`, ao lado do `GlobalNoticeProvider` (hidratação global declarada na seção 2). Por isso:
   - `runChunk` e `readback` só capturam dados imutáveis da partida (marca, ator, ids, cliente). Nenhum `setKeywords`, nenhuma ref do componente. O lock atual do Processador (`bulkProgressLockRef`) vira `exclusiveGroup` no provider.
   - As linhas lidas vão para uma **caixa de saída em memória** do provider, por marca e operação, limitada aos ids do lote. O módulo montado aplica as linhas por `useBatchRunResults` e chama `consume`. Se o usuário trocou de área, as linhas esperam na caixa, e o módulo remontado as aplica **sem nova leitura** (egress). É o mesmo padrão de `consumeBackgroundTask` no Arquiteto (`arquiteto-workspace.tsx:4699-4811`).
   - Ao aplicar, a linha lida só substitui a da tela se o id pertencer à marca ativa; séries de medição já hidratadas na tela são preservadas com `withMeasurementSeries` (seção 8).
   - **Troca de marca:** o lote continua com a marca da partida (os pedidos levam o `brandId` da partida). A faixa mostra só lotes da marca ativa; o marcador do topo conta os das outras. Linhas de uma marca nunca são aplicadas na tela de outra.
   - **Troca de ator ou de sessão:** como em `runBackgroundTask` (`editorial-pipeline-context.tsx:437`), o runner guarda `actorUserId` e `sessionEpoch` da partida. Se mudarem, o lote para antes do próximo bloco com falha `final` ("sessão trocada"), e a caixa de saída daquele lote é descartada sem aplicar nada.
   - Recarregar ou fechar a aba interrompe os blocos que faltam (o que já voltou está gravado); enquanto houver lote rodando, o navegador pede confirmação antes de sair (`beforeunload`). Aceitar esse limite é a Q9.
8. **O estado do runner fica só em memória.** Não vai para `localStorage`, IndexedDB, estado editorial persistido nem banco (`AGENTS.md` §10). Depois de recarregar, nada finge estar rodando.
9. **Início por evento, nunca por efeito de montagem.** Evita o disparo em dobro do Strict Mode (R13).
10. **`runBackgroundTask` não passa pelo runner.** O contrato dele é outro: `execute(update)` opaco, com progresso autorreportado e um `result` que o Arquiteto consome depois (seção 4.5). Com `chunkSize: 1` o total viraria 1 e o andamento real sumiria. Decisão: **o motor de `runBackgroundTask` fica como está** (mesma assinatura, mesmo `result`, mesmo `consumeBackgroundTask`). Muda só a apresentação: a faixa (5.6) e o marcador do topo leem também `backgroundTasks`, por um adaptador puro `backgroundTaskToRunState(task): BatchRunState` que usa `current` e `total` reportados pela tarefa. `EditorialBackgroundTask` não muda.
11. **Timeout em rota paga ou que grava (`onTimeout: "reconcile"`).** Abortar o `fetch` no navegador **não para o servidor**: a rota do allintitle segue o laço `for (const target of targets)` sem ler `request.signal` (`route.ts:695`), cobrando e gravando [V]. Por isso, nesses casos:
    - o timeout só encerra a espera; o bloco fica "sem resposta", não "Erro";
    - o runner faz o `readback` dos ids do bloco e classifica: medição nova gravada conta `succeeded`; sem medição nova conta `failed` com motivo "sem confirmação do servidor", **sem nova tentativa automática** (pode ter sido cobrado);
    - o próximo bloco só começa depois desse readback e de uma folga (`settleMs`, inicial 30 s), para não rodar dois blocos ao mesmo tempo no servidor e não somar limite de taxa;
    - a célula de item sem confirmação mostra "Erro" com a dica "sem confirmação; confira antes de repetir", nunca um sucesso falso.

Tamanho inicial de bloco (ajustável na implementação, sempre abaixo do limite de tempo da rota):

| Operação | Bloco | Motivo |
| --- | --- | --- |
| Minerador · Resultados (DataForSEO: allintitle, KD, CALL 3 e lentes, em sequência) | 5, **a confirmar** | A rota processa um alvo por vez e não declara `maxDuration`; lote de 1000 num só `fetch` arrisca timeout. `onTimeout: "reconcile"`. |
| Minerador · Volume (Google Ads) | 200 | A rota já divide por 10.000; o bloco é para o andamento ser visível. `onTimeout: "reconcile"`. |
| Minerador · Lógica (gravação), KGR, Revisão, Vínculo, Status | 20 | Mesmo tamanho da gravação atual. |
| Minerador · Descobrir: Volume, SEO | 200 / 5 | Mesmos motivos. `onTimeout: "reconcile"`. |
| Minerador · Descobrir: Importar | **fora dos blocos** | Cada `importRequestId` vira uma linha em `minerador_discovery_import_batches` (seção 4.2). Dividir mudaria o registro de importação, que é workflow e auditoria (`AGENTS.md` §4 e §10). Continua um pedido só; a faixa mostra andamento indeterminado com tempo decorrido. Dividir exige desenho próprio (id de bloco derivado do id do lote e estável entre tentativas) em adendo. |
| Arquiteto · ArticleDNA, SiloDNA, SiloPage, revisão por IA, lógica | — | `runBackgroundTask`, sem runner (regra 10); só a apresentação muda. |
| Arquiteto · SERP por keyword | 6 | Mesmo lote de hoje (`:9209-9227`). |
| Radar · fila SERP | 1 | Já é um artigo por vez; muda só a apresentação. |
| Radar · extração de concorrência, verificação de fontes | 5 | Mesmo lote de hoje. |
| Marca · verificar páginas do sitemap | 10 | Único lote de rede da Marca (seção 4.4). Salvar a recuperação local por bloco depende da Q4. |
| Marca · extrair candidatos | **fora do runner** | Cálculo local, sem rede (seção 4.4). |

**Pré-condição da F3 para o bloco de Resultados:** medir o tempo por alvo (allintitle, KD, CALL 3 e lentes) antes de fixar o tamanho. Com fixtures não se mede; a medição vem dos tempos de lotes reais já executados, ou de um smoke pago que só o usuário executa, com autorização (`AGENTS.md` §15). O bloco precisa caber com folga no limite de tempo da rota.

`maxDuration` nas rotas longas: só se o bloco não bastar, e só depois de consultar `node_modules/next/dist/docs/` (Next.js 16), como pede `AGENTS.md`.

### 5.6 Faixa de andamento e marcador no topo

```ts
function BatchProgressStrip(props: { scope: { module: string; brandId: string } }): JSX.Element | null;
function BatchProgressIndicator(): JSX.Element | null; // ao lado do sino, na GlobalTopbar
```

- A **faixa** fica fixa no rodapé, logo acima do `BulkActionBar`, e continua visível mesmo se a seleção for limpa. Mostra `formatBatchProgress`, a barra (`role="progressbar"`), a contagem de falhas (abre a lista com id e motivo) e o botão **Parar**.
- Com total conhecido, a barra é determinada. Sem total (SERP territorial numa chamada só), é indeterminada e o texto mostra o tempo decorrido.
- O **marcador** aparece ao lado do sino quando há lote rodando em outra área: "Resultados 5/30". Clicar volta para a tela do lote.
- Não existe card flutuante de tarefa.

### 5.7 Sino sem cards

```ts
// lib/visual-notice-contract.ts
export const NOTICE_AUTO_OPEN_PREVIEW = false; // rollback: true
```

- **Quem faz:** a mudança foi pedida ao outro workflow [A]. Esta SDD fixa o **contrato** que a entrega precisa cumprir; não a reimplementa. Se a entrega vier com outra forma (por exemplo, sem a constante), a F1 só adapta o necessário para cumprir as regras abaixo e o rollback.
- `publishNotice` mantém a assinatura. Com `NOTICE_AUTO_OPEN_PREVIEW = false`, deixa de chamar `setAutoOpenNotice`; o sino só atualiza o contador.
- O painel só abre quando o usuário clica no sino.
- O badge usa o token `danger` quando existe ERROR não lido; o `aria-label` diz "inclui erro" (recomendação da decisão Q1).
- **Andamento nunca vai para o sino.** Um lote publica **um** aviso, no fim: SUCCESS só se tudo foi confirmado; WARNING se parcial ou parado; ERROR se nada deu certo. O aviso INFO `persistent` do início de lote do Processador deixa de existir.
- O Radar para de mandar "Analisando páginas x de N" por `setNotice`: esse texto passa para o runner. `useNoticeBridge` não muda de contrato.
- Toast continua só por `showToast` explícito.

---

## 6. Regras visuais

Base: `docs/compartilhado/sistema-visual.md` e `.agents/skills/app-visual-system/references/operational-grid-layout.md`.

1. **Só tokens.** Nenhum hex, `rgb`, `slate-*` ou `bg-[#…]` nas peças novas nem nas telas que adotarem (§5.2). As 68 ocorrências do Processador e as 51 do Arquiteto saem **nas partes tocadas** pela fatia.
2. **Superfícies:** tabela em `surface-subtle`; cabeçalho em `surface-subtle` opaco (senão as linhas aparecem por baixo ao rolar); painel de filtros, menus e rodapé em `surface-elevated`; divisores em `divider`.
3. **Texto:** células com pelo menos 14px; cabeçalho com 13 ou 14px; linha de ~44px, compacta ~40px (§8). O Processador hoje usa 12,5px na tabela e 10–11px em selos e botões (seção 4.1). Adotar 14px muda o "tamanho" que o dono elogiou; manter 12,5px descumpre §8. **Decisão Q7.**
4. **Keyword:** token `keyword`, exclusivo de keyword (§5.0.1). Outras colunas principais usam `foreground` semibold.
5. **Status** pela semântica de §5.1: `success`, `context-accent`, `pending`, `warning`, `danger`. Nada de linha inteira colorida.
6. **Selects:** `color-scheme: dark` em `:root` e `color-scheme: light` em `[data-theme="light"]` (`app/globals.css:3` e `:57`), **uma vez, no CSS global**. As classes locais `scheme-dark` fixas da cópia de trabalho (`minerador-workspace.tsx:387`, `discovery-search-row.tsx:11`, `discovery-source-controls.tsx:114`, `discovery-table-placeholder.tsx:90`) [A] saem, porque deixam a lista escura também no tema claro. O `*:bg-background *:text-foreground` do `BULK_SELECT_THEME` usa tokens e acompanha o tema, mas vira regra global de `select option` em `app/globals.css`, para não ser repetido arquivo por arquivo. Select com `bg-surface-elevated text-foreground border-divider`, nunca só `bg-transparent`. Declarar `color-scheme` muda também campo de data, barra de rolagem e autofill em todas as telas: a F1 valida isso nos dois temas.
7. **Botões** nas variantes de §6; ícone sozinho com área de 36 × 36 e nome acessível.
8. **Faixa de andamento:** fundo `surface-elevated`; barra em `context-accent` enquanto roda, `success` no fim completo, `warning` no parcial, `danger` quando para por falha final.
9. **Responsividade:** validar em 1440, 1024, 768 e 360 px. A tabela continua tabela (não vira card). Em 360 px a barra horizontal é permitida (`operational-grid.md` §9). Abaixo de 640px, as escolhas humanas do rodapé ficam em "Mais ações" (5.4).
10. **Guard automático:** `scripts/check-visual-system.mjs` já existe e varre `app/`, `components/` e `modules/`, com baseline que só pode diminuir (`sistema-visual.md` §21; `package.json:10`) [V]. Cobre `components/operational-grid/` sem extensão. `pnpm run check:visual-system` entra no gate de **cada** fatia; a baseline não pode crescer.

---

## 7. Acessibilidade

- `<table>` de verdade, `th scope="col"`, `aria-sort` nas colunas ordenadas e `aria-label` na tabela.
- Caixa de seleção com rótulo ("Selecionar {keyword}"). `aria-selected` na linha. Shift com clique também pelo teclado (Shift + Espaço).
- Célula de métrica **não depende só de cor**: "—", "Erro" e "Medindo…" são textos diferentes. Os dois "0" (medido e "processado sem dado") têm o mesmo texto; o que os separa além da cor é a decisão Q8. Em qualquer resposta, o leitor de tela ouve "0, processado sem dado" no segundo caso, e a dica existe também como texto.
- Cabeçalho fixo não prende o foco: Tab percorre a tabela na ordem visual.
- Rodapé: cada select com `<label>` visível ou `aria-label`; motivo de desabilitado em `aria-describedby`.
- Faixa: `role="progressbar"` com `aria-valuenow` e `aria-valuemax` (sem `aria-valuenow` quando indeterminada); o texto fica numa região `aria-live="polite"` que anuncia no máximo a cada 5 s ou a cada 10%, para não inundar o leitor de tela. O fim do lote é anunciado uma vez.
- "Parar" e "Continuar esperando" alcançáveis pelo teclado.
- Sino: `aria-label` com o número de não lidos e "inclui erro" quando houver.
- Foco visível em tudo (`module-accent`), como em §6 do sistema visual.

---

## 8. Egress: nada de leitura nova

| Peça | Leitura | Regra |
| --- | --- | --- |
| Tabela, filtros, larguras | Nenhuma: usam linhas já carregadas. | R8 |
| Célula de métrica | Nenhuma: o marcador de processado vem dos campos que a tela já lê (seção 5.2.1). Coluna sem marcador mostra "—" até ter um. | premissa 5 |
| Runner | **Nenhum polling, nenhum Realtime.** O andamento é contado com as respostas dos blocos. | R11, R12 |
| Readback por bloco | Só os ids do bloco, lidos de `MINERADOR_LISTING_VIEW` (`lib/minerador/listing-payload.ts:102`), com a **mesma forma** que a listagem já consome, e com o recuo atual para a tabela quando a view não existe. Como `readCanonicalKeywordRows` substitui o `KeywordItem` inteiro, a linha podada é juntada ao estado com `withMeasurementSeries` (`listing-payload.ts:91`), para não apagar séries de medição já hidratadas ao expandir. A soma dos readbacks por bloco lê **os mesmos ids** que o readback único de hoje. Que cada linha pesa menos é **hipótese** [H] até o teste R16 fixar a fonte e a projeção e uma medição comparar os bytes. | R5, R6, R16 |
| Reconciliação de timeout | Só em rota paga ou que grava, e só quando um bloco estoura o tempo: um readback dos ids daquele bloco, pela mesma projeção. | R5, R6 |
| Rotas em lote | Mesmo corpo, lista menor. A rota continua gravando e devolvendo o que devolve hoje. | R6 |
| Sino | Em memória. Sem mudança. | §19 do sistema visual |
| Preferências | `localStorage` só como conveniência do leitor, com as chaves de hoje. A posição de rolagem é gravada com frequência limitada. | `AGENTS.md` §10 |

Mais requisições, com o mesmo total de ids lidos. O teste da forma da leitura (R16) fixa a fonte (`MINERADOR_LISTING_VIEW`), a projeção e o filtro por `brand_id` do readback por bloco. A redução de bytes só vira [V] depois dessa prova.

---

## 9. Plano de adoção em fatias

Cada fatia: módulo proprietário único, suíte do módulo verde, TypeScript, lint direcionado, `pnpm run check:visual-system` sem crescer a baseline, `git diff --check`, e **validação manual pelo usuário** no DOM real (memória do projeto: homologação manual é do usuário). Ao fechar, atualiza `estado-atual.md` e `backlog.md` do módulo (`AGENTS.md` §17). Commit é do usuário.

**Por que F2 e F3 (Minerador) vêm antes da F4 (Marca):** dependência técnica. A Marca só pode adotar peças que já existam em `components/operational-grid/`, e elas nascem da extração do modelo. A Marca continua sendo a primeira área a **adotar**; o fechamento do Minerador (F5) vem depois dela (premissa 6).

### F0 · Pré-condição: congelar o modelo (Minerador)

- O outro workflow fecha o trabalho de 2026-09-24 no Processador e no Descobrir; a suíte do Minerador fica verde.
- **Conferência das entregas [A]** (lista no topo desta SDD): 4 seletores separados; 8 opções no Potencial; Importar CSV e Colar lista na barra global; conteúdo do Organizar; Descobrir sem Histórico e Targeting; selects no escuro; helper de progresso; mudança do sino. O que foi entregue é validado contra esta SDD e congelado; o que não foi entregue entra na fatia indicada (sino e selects na F1; o resto na F2 ou F3).
- Registro das duas formas que divergem hoje (largura e fonte, premissa 1) e do estado dos marcadores da seção 5.2.1.
- Inventário dos símbolos do modelo (nome, arquivo, testes que o fixam) registrado no `estado-atual.md` do Minerador. É a entrega de R1 de `task-operational-grid-adoption.md`.
- Nada é extraído antes disso.

### F1 · Plataforma: sino e selects (shell global)

| Tela | O que muda |
| --- | --- |
| Todas | O sino deixa de abrir preview; badge `danger` com erro não lido (5.7). **Se o outro workflow já entregou**, a F1 só valida contra 5.7, completa o que faltar (badge, rollback), ajusta o teste e o `sistema-visual.md` §24. Se não entregou, a F1 implementa. |
| Todas | `color-scheme` nos dois temas em `app/globals.css`; saem os `scheme-dark` fixos dos quatro arquivos do Minerador; selects legíveis no escuro e no claro (§6.6). |
| Minerador · Processador | O aviso INFO `persistent` de início de lote sai. |

Documentos: `sistema-visual.md` §19 e §24. Testes: `tests/visual-foundation.test.mts:120` hoje só exige que o nome `autoOpenNotice` apareça (`assert.match(provider, /autoOpenNotice/)`), e continuaria passando com o nome no código e o preview desligado ou ligado. O teste passa a exigir `NOTICE_AUTO_OPEN_PREVIEW` e a ausência de abertura automática em `publishNotice`, com comentários removidos antes de casar. Rollback: a constante volta a `true`.

É a fatia mais barata e resolve dois pedidos em todas as áreas de uma vez. **Não roda em paralelo com o outro workflow:** toca `global-notice-center.tsx` (pedido a ele) e os quatro arquivos do Minerador com `scheme-dark`. Começa depois da F0.

### F2 · Extração da planilha padrão (Minerador)

- Cria `components/operational-grid/*` e `lib/operational-grid/*` a partir de `modules/minerador/keyword-table/*`, das células e do painel de filtros (5.1 a 5.4).
- `modules/minerador/keyword-table/*` vira reexportação fina por um ciclo, para o Arquiteto (`:292-293`) e os 12 testes da cópia de trabalho que citam `keyword-table` (9 deles pelo caminho `keyword-table/`; um, `minerador-discovery-planilha`, é novo do outro workflow) não quebrarem no mesmo passo. Os testes são atualizados na própria fatia, um a um, com comentários removidos antes de `doesNotMatch` (memória do projeto).
- Escolhe a técnica única de largura (5.1) e o tamanho de fonte conforme a Q7.
- Pré-condição: fixture prova o que as rotas de Volume e KD gravam quando o provider volta vazio (5.2.1).
- O Processador passa a usar as peças compartilhadas. Muda na tela:
  - cabeçalho fixo (opção A, provada no DOM);
  - keyword com a sobra, nunca cortada; demais colunas do tamanho necessário. **Intenção e Nicho deixam de ser `flexible`** (5.1, regra 5);
  - Resultados, Volume, KD, CPC e KGR com `MetricCell` ("-" vira "—"; "0" cinza só onde houver marcador; "Erro"; sinal da Q8);
  - rodapé com `BulkChoice.plan` (pula e conta; publicada pulada no "potencial" em grupo, se o outro workflow não tiver feito);
  - barra global, filtros e estado vazio só com tokens.
- Gate: DOM real em 1440/1024/768/360, dark e light, com painel de filtros aberto e rodapé visível; a rolagem se mantém depois do readback.

### F3 · Runner de lote progressivo (Minerador)

- Cria o runner, o `BatchRunProvider` em `components/providers.tsx`, a caixa de saída (`useBatchRunResults`), a faixa e o marcador (5.5 e 5.6).
- Processador: Resultados, Volume, Lógica (inclusive a gravação), Conferir site, KGR, Revisão, Vínculo e Status passam pelo runner. O texto "n/N" atual vira `formatBatchProgress`. O lock atual vira `exclusiveGroup`. `runChunk` e `readback` deixam de usar estado do componente (5.5, regra 7).
- Descobrir: Volume e SEO passam pelo runner (hoje não têm barra). **Importar fica fora dos blocos** (5.5, tabela).
- `readCanonicalKeywordRows` troca `select("*")` na tabela pela leitura de `MINERADOR_LISTING_VIEW`, por bloco, com `withMeasurementSeries` ao aplicar (seção 8).
- Rotas pagas com `onTimeout: "reconcile"` (5.5, regra 11).
- Pré-condição do bloco de Resultados: tempo por alvo medido (5.5).
- Rota paga fica com `attempts: 0`; teste com fixture fixa que nenhuma rota paga é repetida pelo runner (5.5, regra 4).
- Gate: lote de 30 ou mais keywords em Volume e em Resultados, com o texto avançando bloco a bloco, falha simulada contada, timeout simulado reconciliado por readback, Parar no meio, troca de área durante o lote (linhas aplicadas ao voltar, sem releitura) e troca de marca durante o lote. O smoke real de Resultados é pago: executa o usuário, com autorização.

### F4 · Marca

| Tela | O que muda |
| --- | --- |
| Site · sitemap (`site-sitemap-panel.tsx:263-265`) | Três tabelas passam à planilha padrão: URL como coluna principal, cabeçalho fixo, `MetricCell` onde houver número. |
| Site · verificar páginas (`:173`) | Passa pelo runner (blocos de 10), com andamento e falhas contadas: uma URL com falha não derruba as outras. Salvar a **recuperação local** (IndexedDB ou `localStorage`) a cada bloco, se a Q4 for aprovada. Nada passa a ir para o banco. |
| Site · extrair candidatos (`:181`) | Fica fora do runner: é cálculo local, sem rede. Sem mudança de comportamento. |
| Equipe (`brand-page.tsx:160`) | Shell, cabeçalho fixo, tokens. Sem rodapé em grupo (só ações por linha). |

### F5 · Minerador: fechamento

- Descobrir passa inteiro à planilha padrão: converge para a técnica de largura escolhida na F2; a keyword nunca cortada; seleção pelas visíveis garantida pelo contrato de `useOperationalGridSelection`; `DiscoveryCellTone` vira `MetricCellTone`.
- Pesquisa por Assunto (`subject-search-results.tsx:169-171`) e as prévias em diálogo usam o shell e o cabeçalho compartilhados.
- As reexportações de `modules/minerador/keyword-table/*` saem quando o Arquiteto (F6) deixar de importá-las.

### F6 · Arquiteto (três subfatias: o arquivo tem 17 mil linhas)

| Subfatia | Tela | O que muda |
| --- | --- | --- |
| F6a | Tabela de artigos (`arquiteto-workspace.tsx:15532`) | Planilha padrão, cabeçalho fixo, principal com a sobra (keyword principal com token `keyword`), seleção compartilhada no lugar de `lastSelectionAnchorId`, `BulkActionBar` fixo no lugar do rodapé em `:16900-16975`, com um select por escolha humana do Arquiteto. |
| F6b | Tarefas (`:2135`, `:4072`, `:4316`, `:4374`, `:4466`) e SERP (`:8225`, `:8464`, `:9209-9227`) | Tarefas: o motor de `runBackgroundTask` não muda; a faixa e o marcador passam a mostrá-las por `backgroundTaskToRunState` (5.5, regra 10). SERP por keyword passa pelo runner; SERP territorial fica numa chamada, com faixa indeterminada. O card `BackgroundTaskNotice` (`:16976`) sai se Q2 for aprovada. |
| F6c | Silos (`territorial-workspace-rows.tsx`), `:17074`, `article-formation-review.tsx:728`, `serp-paid-plan-dialog.tsx:55` | Shell e tokens; a prévia em diálogo continua simples. As regras de fronteira do Silo ficam no adapter. |

### F7 · Radar

| Tela | O que muda |
| --- | --- |
| Planilha (`radar-page.tsx:4563`) | Sai de `OperationalDataGrid` para a planilha padrão. O expansor vira o slot `detail` (guarda: `radar-fix-expansor-planilha.test`). `RadarR4BulkOperationsBar` vira `BulkActionBar`. A paginação depende de Q5. |
| Fila SERP (`:1606-1636`) | O motor não muda. A contagem de `buildRadarR5QueueProgress` passa a ser mostrada pela faixa. Nova tentativa de FAILED_RETRYABLE continua exigindo clique humano: o runner nunca dispara coleta paga sozinho. |
| Extração de concorrência (`:3530-3600`) e fontes (`:3743`) | Passam pelo runner. "Analisando páginas x de N" sai do sino. |
| Tabelas soltas (`radar-r3-serp-panel.tsx:410`, `radar-r3-workbench.tsx:952`, `radar-r3-research-details.tsx:168`, `radar-r3-content-dossier.tsx:55,104,214`) | Shell, cabeçalho fixo, coluna principal e tokens. Sem rodapé em grupo. |

### F8 · Redator

- Não há planilha nem lote. Herda a F1 (sino). Se aparecer lista auxiliar densa, ela usa a planilha padrão. Nenhuma mudança de código prevista.

### F9 · Publicações

- `publications-workspace.tsx:176` passa à planilha padrão; paginação conforme Q5; só ações por linha.
- `publications-page.tsx`: confirmar que é legado e remover numa tarefa própria, fora desta SDD.

### F10 · Conta

- `account-page.tsx:69` (matriz de permissões): tokens no lugar de `bg-slate-900`, cabeçalho fixo. Continua matriz, não planilha de dados.
- `agency-workspace-controls.tsx:90` e `agency-mcp-panel.tsx:206`: shell, cabeçalho fixo, tokens.

### F11 · Admin

- Recomendação: **não converter** as listas em planilha (são curtas, não têm lote). Herda a F1. Converter só se você pedir.

### F12 · Aposentar `OperationalDataGrid`

- Só depois de Radar e Publicações migrarem **e** de decidida a Q6 (Planejador). Até lá, o componente fica como está, sem mudança.

---

## 10. Compatibilidade

| Contrato | Como fica |
| --- | --- |
| `publishNotice`, `useNoticeBridge`, `NoticeRecord` | Mesma assinatura. Muda só o comportamento de abrir preview (constante). |
| `runBackgroundTask`, `EditorialBackgroundTask`, `consumeBackgroundTask` | Intocados: mesmo motor, mesma assinatura, mesmo `result`. Só a apresentação muda (5.5, regra 10). |
| `components/providers.tsx` | Ganha o `BatchRunProvider` (estado em memória). Consumidores atuais dos outros providers não mudam. |
| `OperationalDataGrid` | Intocado até a F12. |
| `modules/minerador/keyword-table/*` | Reexportação por um ciclo (F2 a F5/F6). |
| Rotas de API em lote | Mesmo corpo e mesma resposta; recebem listas menores. `operationRequestId` passa a ser um por bloco nas rotas de medição (allintitle e volume), cuja chave do ledger já é por pedido e alvo (`route.ts:136-138`). **Não vale para Importar do Descobrir**, em que o `importRequestId` é registro de importação: essa rota não é dividida (5.5). |
| Dados | Nenhum formato muda. O "0" nunca é gravado. Nenhum registro de importação novo. |
| Marca · workspace do site | Continua local (IndexedDB ou `localStorage`), com a mesma chave e o mesmo schema. Só muda a frequência de gravação da recuperação, se a Q4 for aprovada. |
| `localStorage` | Chaves atuais preservadas: `minerador-pro:last-view:…`, `${storageKey}:scroll` e as chaves de largura, ordem e filtros do Minerador (inventário na F0). Nenhuma chave é apagada (`AGENTS.md` §10). |
| Arquivo compartilhado mexido por outro módulo | Registrado em cada fatia: arquivo, motivo, consumidores preservados, testes (`AGENTS.md` §4). |

---

## 11. Rollback

- Cada fatia é um commit separado (feito pelo usuário) e volta com revert, sem dado a restaurar.
- Sino: `NOTICE_AUTO_OPEN_PREVIEW = true` devolve o preview.
- Runner: `chunkSize` igual ao total devolve o comportamento de um único `fetch`, por operação. Tirar o `BatchRunProvider` de `components/providers.tsx` exige antes voltar os módulos ao progresso local.
- Planilha: enquanto houver reexportação e enquanto `OperationalDataGrid` existir, voltar um consumidor é trocar o import.
- Lote parado ou interrompido deixa gravado o que já voltou. É o mesmo efeito de ter rodado aqueles itens um a um hoje; não há o que desfazer.
- Nenhuma migration, então nenhum rollback de banco.

---

## 12. Testes e validação

Todos com fixtures e mocks, sem chamada paga (`AGENTS.md` §9 e §16).

**Funções puras (`node --test`)**

- `resolveOperationalGridWidths`: a principal recebe a sobra; nunca fica abaixo do `min`; a ordem de sacrifício é normal → protegida → principal; largura redimensionada pelo humano é respeitada; `needsHorizontalScroll` só abaixo da soma dos mínimos.
- `resolveMetricCell`: os 5 tons; `metricCellIsAbsent` é verdadeiro para "0"; filtro, ordenação, KGR e elegibilidade não mudam com a célula "0".
- `applyViewFilters`: grupos múltiplos e simples; limpar.
- Runner: divisão em blocos; contagem de `succeeded`, `empty`, `failed` e `skipped`; `remaining`; falha `retryable` não para; falha `final` para e declara o parcial; Parar termina o bloco; com `onTimeout: "abort"` o timeout vira falha; com `"reconcile"` o timeout faz readback dos ids do bloco, classifica, não repete e só inicia o próximo bloco depois da folga; nova tentativa reusa o `operationRequestId` e nunca ocorre em rota paga; dedupe por ator, marca e operação; `exclusiveGroup`; troca de ator ou `sessionEpoch` para o lote e descarta a caixa de saída; linhas de outra marca nunca são entregues; módulo remontado recebe as linhas pela caixa de saída sem nova leitura; `formatBatchProgress` produz "5 de 30 feitas · faltam 25".
- `backgroundTaskToRunState`: usa `current` e `total` reportados; não perde `result`.
- `useOperationalGridSelection`: "selecionar visíveis" nunca marca linha oculta; Shift com clique segue a ordem da tela.
- Adapter do rodapé do Minerador: 4 selects separados; seleção mista com Assunto **pula e conta** no KGR e no Posto, sem desabilitar; seleção só de Assunto desabilita KGR e Posto com motivo; Potencial de página com 8 opções no rodapé; "potencial" em grupo pula as publicadas com motivo; na linha da publicada, só os 4 declarados.
- Marcadores de "processado" por coluna (5.2.1): fixture de provider vazio para Volume e KD; allintitle 0 sai como `value`, não como `processed_empty`.

**Estruturais** (comentários removidos antes de casar)

- Peças novas sem cor fixa: o guard `scripts/check-visual-system.mjs` já varre `components/` [V]; `pnpm run check:visual-system` em cada fatia, sem crescer a baseline.
- Nenhum `scheme-dark` fixo em `modules/` depois da F1.
- `color-scheme` presente nos dois temas em `app/globals.css`.
- Readback por bloco lê de `MINERADOR_LISTING_VIEW`, sem `select("*")` na tabela completa, com filtro por `brand_id` e `withMeasurementSeries` ao aplicar (R16).
- `publishNotice` não abre preview com a constante em `false`.
- `components/operational-grid/**` não importa de `modules/**`.

**Testes que mudam, e por quê**

- `tests/visual-foundation.test.mts:120` (preview do sino): a regex `/autoOpenNotice/` casa só com o nome e não prova o comportamento; passa a exigir a constante e a ausência de abertura automática.
- `tests/minerador-bulk-progress.test.mts:29-33` (nomes `startBulkProgress`/`updateBulkProgress` e o "—" do percentual indeterminado).
- Os 12 testes da cópia de trabalho que citam `keyword-table` (9 pelo caminho `keyword-table/`), entre eles `keyword-table-infrastructure`, `table-responsive-scroll`, `column-width-priority` e `bulk-bar-visual`. Alguns já foram alterados pelo outro workflow [A]; a F2 parte da versão congelada na F0.
- Os 9 que dependem de `OperationalDataGrid`, na fatia do consumidor.

Bateria de mutantes: só com a suíte verde e avisando antes, porque o `next dev` compila o código mutado (memória do projeto).

**Validação manual (usuário), por fatia**

- Cabeçalho preso ao rolar; keyword inteira; selects no escuro e no claro; 1440/1024/768/360.
- Lote de 30 ou mais com o texto avançando, uma falha contada, Parar, troca de área, e o sino só marcando.
- TypeScript, build e testes não provam a interface (`AGENTS.md` §16).

---

## 13. Riscos

| # | Risco | Mitigação |
| --- | --- | --- |
| 1 | O outro workflow ainda está editando o Minerador; extrair antes gera conflito. | F0: extração só depois de fechado e verde; a SDD cita símbolos. |
| 2 | O cabeçalho fixo pela opção A muda quem rola (página → tabela) e pode esconder conteúdo abaixo da tabela. | Provar no DOM na F2; plano B pronto. |
| 3 | Keyword nunca cortada faz a barra horizontal aparecer mais cedo em notebook. | A principal encolhe até o `min` (240) antes da barra; as demais já estão no necessário. |
| 4 | Mais blocos = mais requisições ao provider; limite de taxa do DataForSEO ou cota do Google Ads. | Blocos em sequência, um por vez; falha de limite é `retryable`; tamanho ajustável. |
| 5 | Nova tentativa em rota paga cobrar duas vezes. | `attempts: 0` em rota paga; a chave do ledger só registra uso e não evita nova chamada (5.5, regra 4). |
| 6 | Sem preview, um erro passa despercebido. | Badge `danger` (Q1); o erro também fica na faixa e na célula. |
| 7 | `color-scheme` muda campos nativos em todas as telas. | F1 valida data, barra de rolagem e autofill nos dois temas. |
| 8 | Runner no layout sobrevive à troca de marca, de ator e de área. | A chave inclui `brandId`; linhas só vão para a tela da marca da partida; troca de ator ou `sessionEpoch` para o lote e descarta a caixa de saída; o readback confere `brand_id` (R4); 5.5, regra 7. |
| 9 | O Arquiteto é grande e tem seleção própria. | Três subfatias; o adapter guarda as regras do Silo. |
| 10 | Radar perde paginação ou visões salvas. | Q5; chave `minerador-pro:last-view:…` preservada; guarda do expansor. |
| 11 | Marca muda de "salvar a recuperação local só no fim" para "a cada bloco"; alguém pode ler isso como persistência. | Q4, decisão sua; a tela continua dizendo "IndexedDB local" ou "localStorage local" (`site-sitemap-panel.tsx:123`), sem sucesso de banco. |
| 12 | Teste estrutural casa com o próprio comentário; regex com barra invertida se perde no Bash. | Remover comentários antes de casar; escrever testes com Write (memória do projeto). |
| 13 | Timeout no cliente com o servidor ainda medindo e cobrando: célula "Erro" num item gravado e pago, e dois blocos ao mesmo tempo no servidor. | `onTimeout: "reconcile"`: readback do bloco, sem nova tentativa automática, folga antes do próximo bloco (5.5, regra 11). |
| 14 | Caixa de saída em memória cresce com lotes grandes não consumidos. | Limitada aos ids do lote; descartada no `consume`, na troca de ator ou sessão e ao recarregar. |
| 15 | O outro workflow entrega algo diferente do contrato desta SDD (sino, selects, rodapé). | F0 confere cada entrega [A] e decide: congela, ajusta na F1/F2 ou devolve. |
| 16 | Subir a fonte para 14px (Q7) aumenta a largura mínima da tabela e a barra horizontal aparece antes. | Medir no DOM na F2, nas quatro larguras. |

---

## 14. Decisões Q1 a Q9: fechadas em 2026-09-24

Q2, Q5, Q7 e Q9 foram **respondidas pelo dono** (as quatro com a recomendação). Q1, Q3, Q4, Q6 e Q8 seguem a recomendação, apresentada ao dono sem veto; Q8 confirma a escolha dele de "0" cinza para processado sem dado.

Registro das perguntas e recomendações:

| # | Pergunta | Recomendação |
| --- | --- | --- |
| **Q1** | Um aviso de **erro** deve abrir o painel do sino sozinho? | **Não.** O sino fica vermelho e diz "inclui erro". O erro também aparece na faixa do lote e na célula ("Erro"). |
| **Q2** | O card "tarefa em segundo plano" do Arquiteto (canto inferior direito) sai? | **Sim.** Vira a mesma faixa de andamento das outras áreas, com o marcador ao lado do sino. |
| **Q3** | O botão **Parar** termina o bloco atual e para, mantendo o que já foi feito? | **Sim.** Nada é desfeito; o aviso final diz quantas foram feitas e quantas ficaram. |
| **Q4** | Na Marca, a verificação das páginas do sitemap passa a **salvar a cópia local de recuperação** (no navegador) a cada bloco de 10 URLs, em vez de só no fim? | **Sim.** Hoje uma falha no meio perde tudo o que já foi verificado. Isso é recuperação local, não gravação no banco: o workspace do site da Marca continua no navegador, como hoje. Levá-lo ao banco é outra decisão, fora desta SDD. |
| **Q5** | Radar e Publicações perdem a **paginação** e passam a uma rolagem só, como no Minerador? | **Sim**, com o volume de hoje. Reabrir se alguma tela passar de ~1000 linhas (desempenho ainda não medido). |
| **Q6** | O Planejador (fora do fluxo) fica no componente antigo? | **Sim**, congelado. O componente antigo só sai quando o Planejador voltar ao fluxo ou for removido. |
| **Q7** | Tamanho do texto da planilha padrão: manter os **12,5px** do Processador (com selos de 10 e 11px), de que você gostou, ou subir para os **14px** que o sistema visual exige para célula de tabela (o Descobrir já usa 14px)? | **14px nas células e nos controles; 13px no cabeçalho**, como pede `sistema-visual.md` §8. A densidade se mantém pela altura de linha compacta (~40px) e pelas colunas "do necessário". Se preferir manter 12,5px, o sistema visual precisa de uma exceção registrada para planilha densa, aprovada por você. |
| **Q8** | Como separar, na tela, o **"0" medido** (o provider mediu zero de verdade: allintitle 0, volume "0 confirmado") do **"0" cinza** (processado, sem dado)? | **"0" cinza com sublinhado pontilhado** (o mesmo sinal de "tem dica") e a dica "Processado, sem dado"; o leitor de tela ouve "0, processado sem dado". O "0" medido fica na cor normal, sem sublinhado. Assim a diferença não depende só da cor. Alternativa: texto distinto ("s/d"), mais claro, mas deixa de ser o "0" que você pediu. |
| **Q9** | O lote roda na aba do navegador. **Recarregar ou fechar a aba para os blocos que faltam** (o que já voltou fica gravado, e o navegador pede confirmação antes de sair). Aceita esse limite? | **Sim, por agora.** A alternativa é uma fila no servidor, que continua sem a aba aberta; mas ela exige consultar o andamento de tempos em tempos, e a SDD de egress hoje proíbe isso para disparo caro (R11, R12). Reabrir quando a SDD de egress liberar, com SDD própria. |

Escolhas técnicas que **não** dependem de você e ficam com a implementação, dentro das regras acima: técnica de largura (5.1, com prova no DOM), opção A ou B do cabeçalho fixo, tamanho exato de cada bloco, `settleMs`, `maxDuration`.

---

## 15. Autorização necessária

| O quê | Quem autoriza | Quando |
| --- | --- | --- |
| Esta SDD (substituição de componente compartilhado, mudança do sino documentado, lote em blocos nas rotas pagas, provider global em `components/providers.tsx`) | Dono do produto | Antes de qualquer código |
| Respostas Q1 a Q9 | Dono do produto | Junto com a aprovação, ou antes da fatia que depende de cada uma (Q7 e Q8 antes da F2; Q9 antes da F3; Q4 antes da F4) |
| Início de cada fatia (F1 a F12) | Dono do produto | Uma a uma; F2 só depois de F0 |
| Smoke real com chamada paga (Resultados, SERP) | Usuário | Explícita, por operação (`AGENTS.md` §15) |
| Commit, push e deploy | Usuário | Sempre |
| Migration, SQL remoto, limpeza de `localStorage` | — | **Nenhuma prevista.** Se aparecer necessidade, a fatia para e abre adendo. |

Documentos a atualizar quando cada fatia fechar: `docs/compartilhado/operational-grid.md` (§5, §13, §14 e §17), `docs/compartilhado/task-operational-grid-adoption.md` (§8), `docs/compartilhado/sistema-visual.md` (§8.1, §19 e §24) e o `estado-atual.md` e `backlog.md` do módulo da fatia.

### Decisão

- [ ] aprovada para documentação somente
- [ ] aprovada para implementação por fatias, no escopo descrito
- [ ] bloqueada: decisão humana pendente
- Decisão, data e aprovador:

---

## 16. Estado da cópia de trabalho depois das entregas pedidas ao outro workflow (2026-09-24)

**Verificado no código e confirmado por teste; validado manualmente: não.** Esta seção atualiza as marcas [A] das seções 4 e 5: onde elas dizem que o Processador está em `scroll="x"`, com a keyword `flexible`, sem o helper de progresso ou com o sino abrindo cards, a cópia de trabalho já mudou.

| Entrega | Estado na cópia de trabalho |
| --- | --- |
| Invólucro do Processador | `KeywordTableShell scroll="both"` com `max-h-[calc(100dvh-2.5rem)]` (opção A da 5.1), igual ao Descobrir; `thead` sticky prende ao rolar. |
| Coluna principal | Restrição nova `fill: true` em `use-keyword-table-responsive-widths.ts` (aditiva: sem `fill`, resultado idêntico, o Arquiteto não muda). A keyword fica com a sobra, encolhe por último e quebra linha; slug em 14px. No Descobrir, layout automático com a keyword sem largura e `whitespace-normal break-words`. |
| Células de métrica | `lib/minerador/processor-table-cells.ts` e `lib/minerador/discovery-table-cells.ts`: "—", "0" apagado com "Processado, sem dado", "Erro" em `text-warning`, "Medindo…". Só leitura do que a tela já carrega. A decisão Q8 (dois "0") continua valendo: o "0" medido de verdade é número normal. |
| Marcador "processado sem dado" (premissa 5) | Não criado. A keyword que o Google Ads não devolve (Processador) e a candidata sem média no "Atualizar métricas" (Descobrir) mostram o "0" apagado **só nesta sessão**, por marca local; ao recarregar voltam a "—". Gravar o marcador muda o contrato de escrita da rota e fica para a F2 com adendo. |
| Selects | Tema compartilhado `NATIVE_SELECT_THEME` (`lib/ui/native-select-theme.ts`): `scheme-dark`, `scheme-light` com `.light`/`[data-theme="light"]`, opções com `**:bg-background **:text-foreground` (alcança optgroup). Rodapé, Mais ações, Organizar, "Organização das linhas" e Revisão Humana. |
| Rodapé | 4 seletores (KGR, Posto, Potencial, Assunto), todos com confirmação. Grupo de ações com `overflow-x-auto` (nada cortado em silêncio); seletores no rodapé a partir de `2xl`, Status e Excluir a partir de 1800px, e em "Mais ações" abaixo disso. |
| Helper de progresso | `lib/ui/batch-progress.ts` (`runProgressiveBatch`, `formatBatchProgress`, `formatBatchProgressCompact`, `formatBatchElapsed`, `reclassifyBatchItemsAsFailed`). O snapshot ganhou `chunkStartedAtMs` opcional. No cartão do rodapé: "5 de 30 · faltam 25" e, embaixo, "Resultados · bloco 2 de 6 · há 40s". Nos avisos do fim, o texto longo. |
| Timeout por bloco | **Não implementado.** O relógio do bloco mostra que o lote segue vivo, mas um bloco que nunca volta fica esperando. O `onTimeout: "reconcile"` da 5.5 (readback dos ids do bloco, sem repetir rota paga) continua sendo da F3. |
| Sino | `NOTICE_AUTO_OPEN_PREVIEW = false` e `NOTICE_TOAST_ENABLED = false` (`lib/visual-notice-contract.ts`); `publishNotice` só marca o contador; marcador `bg-danger` com erro não lido. |
| Organizar do Processador | Sem Silo; KGR num seletor (Aplicabilidade e Cálculo); Relação com URL dentro de Vínculo; "Processo" com/sem no lugar de Arquitetura (sentido atual: passou pela Lógica, Volume ou Resultados; a confirmar com o dono). |

**Fora desta rodada, como previsto:** `BatchRunProvider` global, marcador ao lado do sino, caixa de saída entre áreas, reconciliação de timeout e adoção nas outras áreas (F1 em diante).

**Suítes por nome** (base `baseline.json` desta sessão): Minerador 1106 testes, 27 falhas, nenhuma nova (saiu 1 da base: o espaçamento do Descobrir); `test:arquiteto` 2354/2 antigas; `test:arquiteto:servidor` 52/0; `test:editorial` 174/4 antigas; `test:operational` 51/10 antigas; `test:visual-system` 28/5 antigas; `test:radar` 2685/0. `tsc --noEmit` sem erros.
