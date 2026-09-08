# Estado atual — Radar

## Purga administrativa de Arquiteto e Radar — Care Glow — 2026-09-08

```text
STATUS            = SCRIPT PRONTO, NAO EXECUTADO
AUTORIZACAO       = responsavel pela marca, explicita, registrada nesta entrada
MARCA ALVO        = 09762023-d0d4-4c24-b34e-d0fdfd43f891 (Care Glow)
ESCOPO            = stage IN ('architect','radar') + artefatos article_dna/silo_dna/silo_page
PRESERVADO        = Marca, Minerador, Planejador, Redator, Publicacoes,
                    usuarios, permissoes, integracoes e TODAS as outras marcas
SQL_EXECUTADO_POR_MIM = 0
```

**Natureza.** Não é saneamento de defeito. A auditoria de 2026-09-06 provou os
registros íntegros e a continuidade validada. Isto é **descarte deliberado de
trabalho**, decidido pelo responsável pela marca. A regra "proibido limpar dados
para corrigir problema de interface" **permanece válida** e não é revogada por
esta operação — ela não se aplica porque não há problema de interface a corrigir.

**Levantamento inicial informado** (a conferir na execução): 115 versões de
ArticleDNA, 9 revisões de arquitetura por IA, 21 registros de trabalho do
Arquiteto, 4 artigos do Radar, 10 eventos de importação, 9 snapshots e 6
revisões SERP. Zero SiloDNA/SiloPage e zero grafos de links.

### O script — arquivo único

`supabase/scripts/2026-09-08-descarte-arquiteto-radar-care-glow.sql`

**SQL PostgreSQL puro**, para copiar e colar no editor do Supabase. Sem
`\set`, sem placeholder, sem substituição manual — a marca já está fixa no
próprio script. Tudo dentro de um `DO` block, que é uma transação implícita:
qualquer exceção desfaz tudo, inclusive o estado dos gatilhos.

**Backup dispensado por decisão explícita.** Este é descarte DEFINITIVO, sem
restauração. Está escrito no cabeçalho do script para ninguém supor o
contrário depois.

Executar **duas vezes**: primeiro com `v_simular := true` (percorre tudo,
imprime o manifesto e aborta de propósito), depois com `false`. Uma terceira,
de volta em `true` sobre o estado já vazio, prova idempotência.

### Garantias embutidas no script

- **Identidade validada** antes de qualquer remoção; marca inexistente aborta.
- **Condições positivas** para `architect` e `radar` — `stage <> 'architect'`
  foi eliminado, porque excluir pelo complemento apagaria estágio futuro que
  ninguém revisou.
- **Dependências abortam com os ids à vista:** Planejador, ContentPlan que cite o
  artigo no payload, Redator, Publicações, e entidade que apareça em outra marca.
- **Uma transação**, com `lock_timeout` e `statement_timeout`; dependentes
  removidos antes das origens; nenhum `UPDATE` anulando referência para
  contornar validação.
- **Gatilhos append-only nomeados um a um** (`editorial_artifact_versions`,
  `version_status_events`, `decision_events`, `serp_snapshots`,
  `serp_reviews`), com o estado REAL lido de `pg_trigger.tgenabled` e **reposto tal como
  estava** (O/D/R/A), verificado depois. Nenhuma função, FK ou validação é removida.
- **Preservação comprovada por hash de ids**, não só contagem — Minerador, outras
  marcas e outros artefatos.
- **Órfãos verificados** em `version_status_events` e `decision_events`.
- **Qualquer divergência levanta exceção** e desfaz tudo.
- **`:simular = true`** roda o caminho inteiro e aborta de propósito no fim.

### O que o script NÃO faz — é seu

1. **Rodar a exportação antes.** Sem ela a purga é irreversível.
2. **Conferir Arquiteto e Radar vazios nas duas sessões**, pelo servidor. Se vier
   conteúdo, é recuperação local — não dado remoto.
3. **Não limpar `localStorage` indiscriminadamente.** Confirmar que recuperação
   local antiga não repovoou o servidor.
4. **Reexecutar com `:simular = true`** sobre o estado já vazio, provando
   idempotência.
5. Registrar aqui o resultado por tabela e a validação nas duas sessões.

### Pendência separada

A **ausência de seleção e exclusão na aba Silos** fica registrada como correção
funcional própria, no backlog. Não é motivo desta purga nem é resolvida por ela.

## Continuidade entre sessões — base validada — 2026-09-06

```text
RECUPERACAO_ENTRE_SESSOES = VALIDADA (cenario Care Glow)
LIMPEZA_DE_DADOS          = NAO NECESSARIA
RECRIACAO_DE_BANCO        = NAO NECESSARIA
ALTERACAO_DA_FUNDACAO     = NAO NECESSARIA
CAUSA_RAIZ                = NAO IDENTIFICADA (ver "limites" abaixo)
```

> **Recuperação dos artigos e da SERP entre sessões: validada no cenário Care
> Glow. A investigação não demonstrou necessidade de limpeza, recriação do banco
> ou alteração da fundação global.**

- **Verificado remotamente, somente leitura** (consultas do usuário, 06/09/2026):
  três itens do Radar encontrados e válidos, incluindo "serum facial principia" e
  "mascara de skincare"; 100 versões editoriais e 111 eventos examinados sem
  incompatibilidade; cinco snapshots SERP válidos, sendo dois da máscara com sete
  resultados cada.
- **Validação manual:** após limpar o cache dos dois navegadores e reiniciar,
  **ambos recuperaram os três artigos e a SERP existente**. Capturas de
  06/09/2026, entre 04:43 e 04:46, anexadas como evidência.
- **Correções aplicadas no período** — nenhuma delas comprovada como a causa:
  - leitura resiliente por linha nos leitores de workflow, artefatos e eventos
    (`lib/editorial/partial-read.ts`, `lib/server/editorial-repositories.ts`);
  - isolamento por repositório no `GET /api/editorial/workspace`
    (`Promise.allSettled`), com a seção que falha **nomeada** em vez de
    derrubar a resposta inteira;
  - `persisted_data_invalid` (502) separado de `invalid_brand_id` (400) — dado
    persistido ruim deixou de ser reportado como "Marca inválida";
  - `requestId` em toda resposta e no log, com contagens por repositório,
    estado da leitura e seções que falharam, sem segredos;
  - falha da escrita do workflow deixou de ser reportada como importação
    concluída, e 4xx deixou de degradar o modo de persistência da leitura.

### Limites desta validação

- **A causa raiz NÃO foi identificada.** A hipótese de linha incompatível foi
  **falsificada** pelas consultas remotas (3/3 itens passam no schema). O
  isolamento da agregação é a explicação mais plausível entre as mudanças
  aplicadas, mas **plausível não é identificado**: reinício do servidor e
  limpeza de cache aconteceram no mesmo intervalo.
- **Como fechar isso, se voltar a ocorrer:** o log do `GET` agora traz
  `requestId` e `failedSections`. Uma ocorrência com `failedSections` não
  vazio identifica a seção; vazio elimina a agregação como causa.
- **O Radar não está concluído** e a plataforma não está homologada. Ver o
  backlog.

### Referências canônicas

Identidade, tenantização, autorização, persistência e versionamento seguem a
fundação global — este documento não redefine nenhuma delas. Ver
`docs/00-produto/auditorias/reconciliacao-mesa-editorial-2026-09-06.md` e
`docs/05-radar/adendo-sdd-persistencia-verificavel.md`.

## Correção funcional — readback remoto da aprovação SERP após F5 — 2026-08-27

- **Verificado remotamente, somente leitura:** existem aprovações append-only
  reais para o artigo `group-11aenvf`, ligadas ao snapshot remoto atual v3,
  ao `ArticleDNA` atual e à seleção humana
  `organic:2|organic:4|organic:5|organic:7`.
- **Causa corrigida no código:** o painel de Revisão dependia do loader amplo
  do workspace e de um `serpPersistenceMode` global. Quando o recovery local
  era aplicado antes/depois dessa carga, uma aprovação remota já existente
  aparecia como “Aprovação local não confirmada”. Não era ausência de write
  remoto nem aprovação de snapshot antigo.
- **Implementado:** `GET /api/editorial/serp` faz readback autenticado e
  estrito por marca, artigo, versão do ArticleDNA e alias do snapshot. O
  cliente hidrata somente as revisões desse snapshot e mantém confirmação
  remota por snapshot, protegida contra resposta obsoleta durante write ou
  nova leitura.
- **Semântica:** aprovação histórica permanece no Histórico, mas só fecha a
  revisão atual quando o snapshot e o fingerprint explícito de curadoria ainda
  correspondem. Mudança de curadoria reabre a revisão; snapshot novo não herda
  aprovação anterior; registro legado sem fingerprint é preservado como
  comparabilidade desconhecida.
- **Validação manual autenticada:** após F5, seleção do artigo e abertura de
  SERP → Revisão mostraram `SERP aprovada` e a nota da aprovação remota atual.
  Nenhuma nova aprovação, coleta DataForSEO, ExternalEvidence ou escrita remota
  foi feita nesta correção.

## Referência opcional ao InternalLinkGraph — fundação confirmada 2026-08-27

O `RadarPlannerHandoff` v2 aceita `internalLinkGraphRef` opcional e
retrocompatível. Quando houver grafo aprovado, o Radar/Planejador recebe sua
identidade, versão e hashes como contexto; o Radar não altera source, target,
direção ou relações. O contrato do grafo continua propriedade do Arquiteto,
com fundação remota, readback e isolamento cross-brand confirmados. A
implementação funcional da aba permanece no Arquiteto; o Radar apenas consome
a referência quando ela for enviada.

## Consolidação dos gates e abertura da fase funcional — 2026-08-26

```text
RADAR_STRUCTURAL_PREREQUISITES=READY
RADAR_SERP_FOUNDATION=READY
RADAR_TELEGRAM_FOUNDATION=READY
RADAR_PLANNER_HANDOFF=READY
READY_FOR_RADAR_FUNCTIONAL_IMPLEMENTATION=YES
```

O Radar está liberado para a próxima fase: `Especialista → ExpertBrief →
ExpertContribution → Evidence`. A fundação Telegram/Experts foi verificada
remotamente e o isolamento cross-brand foi comprovado com JWT autenticado
real. Essa evidência não equivale a inbound Telegram real, texto/áudio E2E ou
Speech real, que continuam pendentes de homologação manual.

O ledger `telegram_inbound_updates` permanece global e pré-routing: não é uma
entidade editorial tenantizada, não é acessível por `authenticated` e só
promove contexto após binding explícito, `brandId`, `expertId` e
`briefId/articleDnaVersionId`. A regra completa e a evidência de limpeza dos
fixtures estão em `docs/compartilhado/sdd-telegram-expert-contribution-platform.md`.

O smoke JWT comprovou Care Glow permitido, Brand B negada, leituras/escritas
cross-brand negadas e guards compostos de Expert, Brief, Contribution e Job.
`CROSS_BRAND_FK_GUARDS=PARTIAL` refere-se somente ao ledger global, protegido
no routing server-side. Fixtures, membership e Brand temporária foram
removidas; duas identidades Auth temporárias permanecem sem acesso e aguardam
autorização separada para exclusão.

O handoff Radar → Planejador v2 está `PASS`, retrocompatível e sem mudança de
banco; `ContentPlan` continua separado. Novas coletas SERP usam somente
DataForSEO. Snapshots históricos `provider=serper` continuam legíveis e podem
participar de handoff histórico aprovado, sem nova chamada Serper.

> Os lotes R5, R6 e R7 abaixo são snapshots de execução anteriores ao gate de
> 2026-08-26. Valores `BLOCKED_BY_DATABASE`, `PARTIAL` ou
> `STRUCTURAL_CHANGE_REQUIRED` neles preservados são históricos e não o estado
> vigente desta abertura funcional.

## Handoff canônico Radar → Planejador — 2026-08-26

- **Implementado localmente:** `RadarPlannerHandoff` v2 aditivo e hashado,
  com `brandId`, `articleId`, `articleDnaVersionId`, referência de SiloDNA,
  relatório consolidado aprovado, SERP, proveniência, decisões humanas,
  `ExpertEvidence[]` opcional e `ProductEvidence[]` compatível.
- **Gate:** somente `APPROVED` gera o envelope; `ContentPlan` continua sendo
  entidade própria do Planejador. Novas coletas usam somente DataForSEO,
  enquanto pacotes históricos Serper válidos/aprovados permanecem legíveis e
  podem gerar handoff preservando `provider=serper` na provenance.
- **Persistência:** o workflow JSONB existente recebe o adaptador em
  `RadarAnalysis.plannerPackage` e `PlannerItem.radarHandoff`; nenhum schema ou
  migration foi alterado.
- **Pendente:** executar SERP DataForSEO autenticada quando necessário,
  confirmar persistência/readback/reload e validar o handoff com dados reais no
  navegador. Inbound Telegram, texto/áudio E2E e Speech real permanecem
  pendentes. Nenhuma chamada paga foi executada nesta consolidação.

## Consolidação canônica e abertura da fase Radar — 2026-08-25

- **Fundação:** `PLATFORM_INTEGRATION_FOUNDATION = READY` e
  `READY_FOR_RADAR_DEVELOPMENT = YES`.
- **Infraestrutura:** DataForSEO é a SERP compartilhada do Radar; DeepSeek,
  Google Cloud Speech/Storage, YouTube e Telegram permanecem operações da
  Plataforma, não providers/quotas/Connections do módulo.
- **Telegram:** Bot global configurado, `getMe = PASS`, webhook não configurado
  e inbound E2E pendente. O Radar só recebe contribuição quando binding,
  especialista, `briefId` e artigo/versão estão explícitos.
- **Limites:** Connection `READY` não prova coleta real, persistência remota,
  operação paga ou aprovação editorial. Nenhuma chamada paga foi executada
  nesta consolidação.

## Contrato de entradas externas — 2026-08-25

- **Preparado localmente:** contratos e rota de `ExpertBrief`/`ExpertContribution`, preservando texto/arquivo original, transcrição e organização como camadas distintas.
- **Verificado no código:** Telegram apenas entrega contribuição ao `brief_id` explicitamente selecionado; Updates são deduplicados e mídia pesada segue para `external_processing_jobs`/Local Worker.
- **Fronteira preservada:** nenhuma alteração foi feita no agrupamento, ArticleDNA, SiloDNA, SiloPage, publicação ou workflow editorial do Radar. A UI editorial futura continua dependente de decisão própria.
- **Pendente:** migration remota, configuração do webhook público, worker autenticado, consumidores editoriais e validação manual. Bot Token/Secret e `getMe` já estão registrados como configurados.

> Os blocos datados anteriores à consolidação de 2026-08-25 são snapshots de
> implementação e validação, preservados para proveniência. Quando mencionam
> provider SERP legado, isso não representa o contrato operacional vigente.

> **Estado documental vigente — 2026-08-25:** as rotas atuais são `app/(brand)/[brandRef]/radar/page.tsx` e `app/(brand)/[brandRef]/radar/[articleId]/page.tsx`; a referência posterior a `/{brandUserId}/radar` é alias histórico. O Radar consome ArticleDNA e evidências recebidas, não reagrupa keywords nem troca principal. A persistência remota usa as relações existentes do schema canônico `0027`; a migration `0003_radar_serp_snapshots.sql` não deve ser aplicada. O fallback local não é persistência remota.

## Histórico — implementação legada de SERP — 2026-07-21 (superseded)

O item Radar já recebe `arquitetoStrategyContext` opcional; a extensão permanece compatível com ArticleDNA antigo. A validação local confirma transferência de referências e contexto, sem SERP real, provider externo ou escrita remota.

- **Última atualização:** 2026-07-20.
- **Snapshot histórico:** provider SERP legado server-side, normalização de resultados, diagnóstico determinístico, timeout, erros explícitos, hash e versionamento.
- **Snapshot histórico:** `POST /api/editorial/serp` com autenticação, autorização por marca/módulo, resolução server-side da keyword e ações de coleta/revisão.
- **Snapshot histórico:** UI com ação separada `Coletar SERP` e `Simular`, histórico de snapshots, PAA, related searches, diagnóstico e decisão humana.
- **Snapshot histórico:** recuperação local por marca e tentativa de persistência remota append-only.
- **Snapshot histórico:** Planejador recebe referência de SERP somente quando a pesquisa real foi aprovada.
- **Persistência remota:** usa as relações existentes do schema canônico `0027`; `0003_radar_serp_snapshots.sql` não deve ser aplicada.
- **Configuração:** a presença/validade da chave em `.env.local` não foi confirmada por chamada real; nenhuma chave foi impressa, registrada ou reutilizada.
- **Chamada paga no snapshot:** nenhuma consulta real ao provider SERP legado foi executada automaticamente. Os testes usam `fetch` mockado.
- **Testes confirmados:** 16 testes específicos do Radar e 103 regressões editoriais passam, incluindo persistência/fallback, navegação, hidratação, envelope cliente→rota, provider Serper, pipeline editorial, fluxo operacional e domínio do Arquiteto; TypeScript, build, lint direcionado do escopo Radar e `git diff --check` passam. O lint amplo do monólito do Arquiteto ainda contém falhas legadas de `any`/React Compiler.
- **Correção de hidratação implementada:** o Radar agora recebe um snapshot aditivo de keyword/silo no import do Arquiteto, reconcilia itens antigos sem hidratação no reload, aceita aliases `pub-k-*` e resolve a keyword no servidor por vínculo canônico e marca.
- **Causa comprovada da falha anterior:** `/api/inteligencia` excluía keywords com `lista_id` nulo embora o Arquiteto as incluísse; o import persistia somente IDs; e os resolvers cliente/servidor exigiam igualdade literal e não reconheciam o alias publicado. Isso produzia simultaneamente `Keyword não hidratada`, `Keyword pendente` e coleta desabilitada.
- **Causa comprovada da falha UUID:** `lookupIds` ainda continha `pub-k-ddf1581f-60d6-4131-a8a6-90c6365f5acc` quando chegava a `.in("id", lookupIds)` em `keywords_kgr`; essa coluna é UUID. A mesma validação foi aplicada a `briefings_artigos.id` e `listas_kgr.id`.
- **Consumo do provider legado:** por ordem do fluxo, a resolução do artigo/keyword e as consultas UUID ocorrem antes de `collectSerperSnapshot`; a falha UUID observada não alcançou a chamada externa. Nenhum log ou teste desta correção executou provider real.
- **Fallback SERP implementado:** quando os repositórios editoriais ou a migration remota não estão disponíveis, a rota usa o ArticleDNA e o envelope editorial hashado enviados pelo workspace, mantém autenticação, validação de marca e gates de conflito, coleta a SERP real no servidor e retorna `persistenceMode: local`; o snapshot é incorporado e salvo na recuperação local antes de informar sucesso.
- **Navegação corrigida:** `Abrir no Radar` expande o detalhe local com SERP, PAA, relacionados, diagnóstico, histórico e revisão. `Ver no Arquiteto` é a ação separada; o deep-link é consumido uma vez, compara Sets antes de atualizar e remove `articleId` da URL depois de resolver.
- **Erros estruturados:** configuração ausente, migration/tabela ausente, conexão indisponível, não autenticado, permissão negada, provider e timeout não compartilham mais uma mensagem genérica.
- **Validação visual pendente:** o navegador local não possuía sessão/marca autorizada nesta execução; portanto o artigo real ainda precisa ser conferido manualmente na planilha do Radar após login.
- **Limitação atual:** a confirmação end-to-end ainda requer uma execução manual autenticada, com uma única keyword, depois que a migration for aplicada ou o fallback local for conscientemente aceito.
- **Limitação atual:** classificação de tipo, intenção, entidades e conflitos é heurística determinística; exige revisão humana.
- **Limitação atual:** fontes externas e originalidade fora da SERP real continuam sem provedor próprio integrado.
- **Correção da fronteira editorial:** a UI do Radar não envia mais `hydration` como única recuperação. Antes de `collect` ou `review`, o cliente monta `RadarSerpResolutionEnvelope` com `schemaVersion`, `radarItemId`, versão/hash do ArticleDNA, keyword principal textual, alias/canonical/source IDs, silo, origem Arquiteto→Radar e `snapshotHash` SHA-256.
- **Validação server-side histórica:** o Route Handler revalida o hash, marca, artigo, item Radar, versão do ArticleDNA, papel principal e vínculo da keyword. Divergências entre envelope, ArticleDNA ou keyword canônica remota bloqueiam antes de `collectSerperSnapshot`.
- **Resolução registrada:** `resolutionMode` distingue `remote_canonical` de `local_recovery`; `canonicalRemoteVerified` fica persistido no `SerpCollectionRecord` e no `SerpResearchSnapshot`. A fonte remota vence quando encontrada; o envelope textual só é usado quando a resolução canônica não está disponível e os gates locais permanecem válidos.
- **Causa comprovada da falha de hidratação anterior:** a tabela renderizava o texto por `pipeline.snapshot.keywords`, mas o POST enviava apenas `row.hydration`; para o artigo antigo essa hidratação era nula. O servidor recebia ArticleDNA e nenhum texto editorial, falhando antes do provedor com a mensagem de keyword ausente.
- **Testes da fronteira histórica:** `tests/radar-resolution-envelope.test.mts` cobre serialização cliente→rota, alias `pub-k-ddf1581f-60d6-4131-a8a6-90c6365f5acc`, hash adulterado, texto técnico e conflito remoto. Nenhuma chamada real foi feita.

## Correção bloqueadora de hidratação — 2026-07-20

- O snapshot SERP v1 não foi apagado. O estado `Aguardando revisão · v1` da planilha e os registros local/remoto continuam sendo a evidência de recuperação; esta correção não coleta novamente, não limpa storage e não reimporta o artigo.
- A causa era estrutural: a URL podia receber o alias publicado `pub-k-*`, enquanto o item Radar possui uma chave canônica estável (`RadarItem.id`, atualmente `radar:<articleId>`). A rota agora resolve o item por chave canônica ou alias somente quando o alias é inequívoco e redireciona preservando a aba solicitada.
- `SerpSnapshot`/`SerpReview` agora são tratados como entidades independentes de `RadarAnalysis`. Resumo, SERP, concorrentes, estrutura, semântica, decisões e histórico renderizam o snapshot/revisão/DNAs disponíveis antes do início da análise.
- O reload reconcilia itens Radar remotos e locais preservando versões locais de `RadarAnalysis`; registros SERP locais válidos também permanecem quando a resposta remota está vazia ou incompleta. Iniciar análise é idempotente e referencia o snapshot existente sem criar nova coleta.
## Implementacao adicional - 2026-07-20

- Pagina `/radar/[articleId]` com sete abas estaveis, escolha humana entre KGR leve e Competitivo completo, curadoria granular da SERP, selecao sem ocultacao de itens, extracao explicita de concorrentes e historico de versoes.
- Benchmark estrutural e semantico informacional, decisoes de requisitos `required/recommended/optional/discarded`, enforcement consultivo ou requerido, classificacao indicativa de competitividade e pacote versionado para o Planejador.
- Extrator server-side com defesa SSRF e falhas isoladas por URL; testes usam exclusivamente fixture HTML e DNS controlado.
- Persistencia append-only no payload JSONB do item Radar quando remoto esta disponivel; fallback local marcado sem recolher SERP ou reextrair paginas.
- Limites: execucao manual autenticada ainda e necessaria para validar permissao, marca, recovery remoto e comportamento visual. Nao houve chamada Serper, scraping externo, migration, commit ou deploy.

## Correção estrutural — 2026-07-20

- Causa dos metadados sem resultados: o reload remoto substituía o registro local pelo mesmo `id` mesmo quando o payload remoto tinha somente metadados; a página nova também lia exclusivamente `research`, ignorando `snapshot.results` legado. O payload local completo não havia sido apagado.
- O merge agora preserva o registro mais rico quando a versão/hash são compatíveis, usa o remoto completo mais recente, combina payloads do mesmo snapshot e bloqueia conflito de contexto ou hash. Conflitos ficam visíveis no Radar.
- A página usa `articleDnaVersionId` como chave canônica limpa; `radar:<articleId>`, `articleId`, `pub-k-*` e aliases de hidratação são apenas compatibilidade com redirect `replace` e aba preservada.
- A visão do snapshot recupera `organicResults`, PAA, related, Knowledge Graph e diagnóstico do payload canônico ou legado. Resultado, estrutura, semântica e estados vazios deixam de depender de `RadarAnalysis`.
- O modo com KGR/volume ausentes não sugere Competitivo completo por falha de hidratação: usa sugestão KGR leve com confiança baixa e explica a ausência.
- `RadarEvidencePackage` substitui a transferência de decisões finais: leva evidências observadas, curadoria, concorrência, estrutura descritiva, semântica, conflitos, proveniência e hash; não leva metas finais, outline ou requisitos do Guardião.

## Identidade editorial e proteção compreensível — 2026-07-20

- A página própria agora apresenta Identidade editorial, Estratégia recebida do Arquiteto, Contexto do silo, comparação DNA x SERP, progresso e Próxima ação.
- Publicados exibem `Publicado e protegido`; keyword principal, slug, canonical, marca e URL estrutural são preservados e somente leitura. Artigos novos também apontam alterações para o Arquiteto.
- IDs técnicos ficam recolhidos em `Ver proveniência e IDs`; o cabeçalho usa título, publicação, silo, ArticleDNA e evidências.
- Keywords sem conflito não bloqueiam aprovação por falta de nota. Somente `Revisar no Arquiteto` exige justificativa.
- Campos temporários de curadoria são salvos ao sair do campo; reload, troca de aba e digitação não consolidada não criam novas versões.
- Listas de entidades e termos semânticos usam chaves React compostas com índice estável da renderização; valores repetidos como `estratégia` e `tráfego` não geram mais avisos de identidade duplicada.
- **Limitação de validação:** o build/tsc global está bloqueado por alterações independentes e ainda inconsistentes em `components/planejador/` e `lib/planejador/` (`publicationIdentity`/`EditorialBriefingDto`). O lint e os testes direcionados do Radar passam; o módulo Planejador não foi alterado nesta tarefa.

## Contexto KGR, volume e identidade estratégica — 2026-07-21

- Auditoria confirmou que o Radar já recebe `ArticleKgrIdentity`, `ArticleVolumeStrategy`, `ArticleHierarchyStrategy`, `ArticleControlContext` e referências de KeywordDNA através de `RadarItem.arquitetoStrategyContext`; nenhum contrato do Arquiteto foi alterado.
- O novo normalizador `lib/radar/strategy-context.ts` transforma somente esses dados recebidos em `RadarKgrStrategy`. A tela mostra classificação e origem, principal, slug, alinhamento, composição, limite de seis, volumes, aviso de sobreposição, papéis, hierarquia e proteção de publicação.
- A sugestão de modo respeita uma classificação KGR recebida mesmo quando score/volume atuais não atenderiam silenciosamente ao threshold estrito. Ausência continua honesta como `Classificação KGR não recebida`.
- Artigos novos com slug desalinhado apontam revisão no Arquiteto; publicados permanecem protegidos e não são bloqueados. Overflow legado acima de seis referências fica visível e bloqueia apenas a consolidação de novo pacote.
- `RadarEvidencePackage.kgrStrategy` é aditivo e participa do hash do pacote. O pacote não recebe outline, metas finais, CTA, densidade, requisitos do Guardião ou alterações de DNA.
- Arquivos desta rodada: `lib/radar/strategy-context.ts`, `lib/radar/analysis-contracts.ts`, `lib/radar/evidence-package.ts`, `components/radar/radar-analysis-page.tsx`, `tests/radar-kgr-context.test.mts`, SDD e documentação do Radar.
- Testes focados: 24 passaram. Lint direcionado do Radar passou. O build deve ser executado novamente; `tsc --noEmit` global permanece limitado por erros existentes em `lib/planejador/**` e `tests/site-kgr-contract.test.mts`, sem alteração nesses arquivos.

## Relatorio competitivo - 2026-07-28

- **Verificado no codigo:** `RadarCompetitiveReport` aditivo registra referencias de identidade/DNAs/SERP/analise, workflow, respostas, perguntas, concorrentes, benchmark comparavel, frequencias observadas, semantica, links, elementos visuais, necessidades, limitacoes, hash e proveniencia.
- **Verificado no codigo:** a aprovacao do Radar consolida o relatorio na mesma versao e o inclui no `RadarEvidencePackage`; o pacote preserva a fronteira do Planejador e nao envia outline, CTA, densidade ou metas finais.
- **Confirmado por teste:** `tests/radar-competitive-report.test.mts` cobre amostra pequena, exclusao de video/parcial, resposta pendente, frequencia body-only, hash e pacote aditivo. Build, TypeScript e lint direcionado do Radar passam.
- **Ainda nao verificado:** aprovacao e persistencia remota com artigo real, navegacao autenticada, e validacao visual manual nos quatro breakpoints. Nenhuma chamada real Serper ou escrita remota foi feita.
- **Limitacao conhecida:** `tests/radar-hydration.test.mts` continua falhando em fixture legado do Arquiteto por `fallbackHierarchyStrategy` sem `score/components`; nao foi alterado por permanecer fora do escopo Radar.

## Fechamento de usabilidade e coerência — 2026-07-21

- Estados de investigação, publicação da versão e transferência ao Planejador foram separados na página própria. Itens orgânicos pendentes continuam impedindo a conclusão da investigação; envio anterior não conclui a versão atual.
- `plannerTransfer` registra a versão enviada sem substituir o pacote anterior nem duplicar artigo ou `ContentPlan`; a interface diferencia versão corrente, aprovada, enviada e atualização disponível.
- Canonical, URL estrutural e estado de publicação agora distinguem dado não recebido nesta etapa de ausência confirmada. Nenhuma URL é inventada; publicados permanecem protegidos e artigos novos apontam a revisão para o Arquiteto.
- Formatos SERP foram classificados. Apenas artigos editoriais completos entram no benchmark; vídeos, parciais e demais formatos ficam visíveis e explicitamente excluídos da amostra comparável.
- Semântica foi organizada em conteúdo relevante, navegação, legal e plataforma. Termos de ruído continuam visíveis e podem ser recuperados ou ignorados com nova versão de evidência.
- Arquivos principais: `components/radar/radar-analysis-page.tsx`, `lib/radar/analysis-contracts.ts`, `lib/radar/analysis-insights.ts`, `lib/radar/workflow-insights.ts`, `lib/radar/evidence-package.ts`, `tests/radar-usability.test.mts` e `tests/radar-navigation.test.mts`.
- Testes confirmados nesta rodada: 19 testes focados do Radar, `tsc --noEmit` e lint direcionado do escopo Radar. Nenhuma chamada real Serper, escrita remota, migration, commit ou deploy foi executada.
- Validação pendente: quatro cenários manuais (artigo novo, publicado, SERP pendente e atualização após envio) e uma única coleta Serper autenticada acionada explicitamente pelo usuário.

## Seleção, amostra e prévia do relatório — 2026-07-29

- Verificado no código: a seleção de uma referência principal ou de apoio já a coloca na fila de análise; a tela não possui checkbox nem ação individual de extração. Formato, artigo próprio e exclusão têm funções próprias e mutuamente exclusivas.
- Verificado no código: a ação coletiva mostra `Analisar referências selecionadas (N)`, fica desabilitada como `Análise da amostra atualizada` quando não há páginas novas e não reprocessa URLs já extraídas. Decisões, motivos e notas continuam em sucessoras versionadas do payload existente.
- Verificado no código: o progresso agora usa `Relatório gerado`, e a próxima ação distingue páginas pendentes, amostra observada, prévia revisável, aprovação humana e transferência.
- Verificado no código: cada alteração de curadoria ou análise gera uma prévia `RadarCompetitiveReport` draft antes da aprovação. O relatório detalhado possui um único título com modo, status e versão; inclui amostra, referências por função, perfil, keywords observadas, semântica, respostas, DNA, necessidades, visuais, links e limitações.
- Verificado no código: uma página comparável é exibida como valor observado, sem média/mediana de mercado; KGR leve não exige três páginas para gerar prévia.
- Confirmado por teste: suíte focada desta rodada com 32/32 testes, `tsc --noEmit`, lint direcionado e build passaram. A suíte ampla `tests/radar*.test.mts` ficou em 58/59; a única falha continua sendo o fixture legado fora do escopo em `tests/radar-hydration.test.mts` (`fallbackHierarchyStrategy` sem `score/components`).
- Ainda não verificado: comportamento autenticado no navegador, persistência remota, coleta real Serper, extração de páginas externas, responsividade e contraste em light/dark. Nenhuma escrita remota, migration, commit ou deploy foi executada.

## Painel de progresso restrito ao Resumo — 2026-07-29

- Verificado no código: o painel completo de fluxo e progresso pertence exclusivamente ao Resumo. As demais áreas mostram somente orientações contextuais relacionadas à tarefa atual.

## Correção da resolução da aba Análise da amostra — 2026-07-29

- Causa registrada: a página consultava `tabAliases[requestedTab]` diretamente, sem normalização centralizada do parâmetro e sem cobertura explícita para variantes legadas. A renderização, o cabeçalho e o estado visual dependiam desse lookup bruto.
- Verificado no código: `resolveRadarTab` agora normaliza espaços/caixa, resolve `analise-amostra`, `analise_amostra` e `analysis` para a seção canônica e usa `resumo` somente para valores desconhecidos. O mesmo estado resolvido controla o botão ativo, `Etapa atual` e o componente renderizado.
- Confirmado por teste: a URL `?tab=analise-amostra` resolve para a Análise da amostra; o conteúdo do Resumo não é montado nessa área; o retorno para Resumo restaura o painel; troca de aba não cria versão e os aliases/ fallback permanecem cobertos.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/radar; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Adicionado wrapper canônico `/{brandRef}/radar`; pesquisa, evidências e persistência existente foram preservadas.

## Correção localizada — navegação canônica do artigo — 2026-07-28

- **Verificado no código:** a origem do 404 era `modules/radar/radar-page.tsx`, que montava `/radar/{row.articleId}`. A rota vigente é `app/(brand)/[brandRef]/radar/[articleId]/page.tsx`.
- **Verificado no código:** o destino agora é `/{brandRef}/radar/{articleDnaVersionId}`. O `brandRef` é preservado da rota tenantizada e o ID é obtido por `radarCanonicalRouteKey`; `pub-k-*`, ID do relatório e ID de snapshot continuam somente compatibilidade/resolução, não destino novo.
- **Verificado no código:** `requireTenantModule(brandRef, "radar")` valida sessão, marca e módulo antes da página; o pipeline exibido permanece escopado à marca ativa, sem busca global ou fallback para outro tenant.
- **Verificado no código:** Radar, Arquiteto, Planejador, detalhe do Radar e helper operacional não montam mais o detalhe global `/radar/{id}`. Sem `brandRef` válido, as ações ficam desabilitadas com `Contexto da marca não disponível`.
- **Confirmado por teste:** `tests/radar-canonical-navigation.test.mts`, `tests/radar-route-resolution.test.mts` e `tests/tenant-routing.test.mts` passam (11 testes).
- **Ainda não verificado:** smoke test autenticado em Adalba/Lindisse, abertura real do artigo e isolamento observado no navegador; nenhum relatório, SERP, persistência, migration ou provider foi alterado nesta correção.


## Reorganização do fluxo por modo — 2026-07-29

- Verificado no código: o detalhe do Radar usa cinco áreas (Resumo, Selecionar referências, Análise da amostra, Relatório, Histórico), com modo e etapa atual no cabeçalho e progresso único em seis estados.
- Verificado no código: a sugestão de modo respeita KGR recebido, mantém ausência explícita e não inicia coleta automática. A decisão humana pode substituir a sugestão antes da criação da versão de análise.
- Verificado no código: a seleção mantém todos os resultados da SERP visíveis; artigo próprio não é enviado para extração/benchmark, e formatos de vídeo/social/outros são referências de formato fora do benchmark editorial.
- Verificado no código: a análise da amostra separa estrutura, páginas analisadas, formatos, semântica central/relevante/ignorada e recuperação manual. O relatório recebe título por modo e a aprovação/envio continuam usando RadarCompetitiveReport e RadarEvidencePackage existentes.
- Confirmado por teste: tests/radar-flow-organization.test.mts, tests/radar-navigation.test.mts, tests/radar-usability.test.mts, tests/radar-analysis.test.mts, tests/radar-kgr-context.test.mts e tests/radar-competitive-report.test.mts passam (25 testes focados); tsc --noEmit e lint direcionado do escopo alterado passam.
- Ainda não verificado: navegação autenticada, persistência remota, isolamento observado no navegador, responsividade real em 360/768/1024/1440 e contraste visual em light/dark. Nenhuma coleta real Serper, escrita remota, migration, commit ou deploy foi executada nesta rodada.
- Contratos preservados: não foram criadas entidades, migrations ou alterações em ArticleDNA, SiloDNA, KeywordDNA, slug, canonical, marca, URL, ContentPlan ou lógica interna do Planejador.

## Adapter SERP compatível com o schema canônico — 2026-08-25

- **Verificado no código:** `editorial_serp_snapshots` e `editorial_serp_reviews` são consumidas pelo adapter do Radar com os campos de `0027`: UUIDs, `snapshot_version`, `source_version_id`, `previous_snapshot_id`, hash, ator e timestamp.
- **Implementado:** novos IDs de snapshot e revisão são UUID puros; IDs textuais `serp:*` e `serp-review:*` não chegam às colunas UUID. Um `previousSnapshotId` textual é resolvido contra o snapshot da mesma marca/artigo quando possível; sem correspondência, o boundary persiste `null` e preserva o payload legado.
- **Implementado:** `source_version_id` recebe exclusivamente o `articleDnaVersionId` canônico; `brandId` permanece o tenant; valores de provider e payload legado continuam legíveis apenas como histórico.
- **Confirmado por teste:** 17 testes direcionados de persistência Radar/repositories passam; não há chamada externa nos testes.
- **Banco:** `DATABASE_CHANGE_REQUIRED = NO`; nenhuma migration, DDL, escrita remota ou smoke real foi executado nesta rodada.
- **Pendente:** smoke manual DataForSEO → INSERT → readback → reload → histórico.

## Smoke real DataForSEO end-to-end — 2026-08-25

- **Contexto confirmado:** `brandId=09762023-d0d4-4c24-b34e-d0fdfd43f891`, `articleId=group-11aenvf`, `articleDnaVersionId=d6aca87b-66e5-48ac-b8a2-7c7e10236fe4`, keyword principal `marketing online`, provider `dataforseo`.
- **PASS:** uma chamada real DataForSEO percorreu a rota canônica do Radar, a resolução global, a normalização e a persistência 0027. Não houve chamada Serper nem review automática.
- **Snapshot remoto confirmado:** `id=f60d794f-71aa-427c-b53a-843045a0d5a3`, `source_version_id=d6aca87b-66e5-48ac-b8a2-7c7e10236fe4`, `snapshot_version=2`, `previous_snapshot_id=5227798f-0700-430a-8a25-b842d234b468`, provider `dataforseo`, payload normalizado e timestamps válidos.
- **Readback/reload/histórico:** o `SerpSnapshotRepository` recuperou o snapshot em duas leituras independentes, marcou o envelope como `persistenceMode=remote` na fronteira de leitura e listou dois snapshots DataForSEO do artigo; nenhum review foi criado automaticamente.
- **Limitação externa observada:** `GET /api/editorial/workspace` retorna 503 porque `public.brand_invitations` não está no schema cache remoto. O smoke não aplicou migration nem alterou esse módulo; o contexto e os readbacks do Radar foram validados pelos repositórios canônicos específicos.
- **Ledger:** não existe capability remota `dataforseo.serp_compatibility` no catálogo; por isso o fluxo não criou evento adicional em `integration_usage_events`. O crédito da única chamada externa foi consumido pelo provider; não foi criado registro manual posterior.
- **Resultado:** `DATAFORSEO_REAL_CALLS=1`, `REMOTE_WRITES=1 snapshot`, `MIGRATIONS=0`, `SERPER_CALLS=0`, `DATABASE_CHANGE_REQUIRED=NO`. O Radar SERP real está validado end-to-end dentro do escopo do Radar; a limitação do workspace geral permanece pendente fora desta correção.

## Lote Radar R2 — telas avançadas e navegação do Workbench — 2026-08-25

- **Verificado no código:** as seis etapas do Workbench agora navegam diretamente para `serp`, `referencias`, `analise-serp`, `evidencias-adicionais` e `relatorio`, preservando `brandRef`, `articleDnaVersionId` e o artigo selecionado. O clique de etapa não cria versão; a ação separada de SERP continua explícita.
- **Implementado:** a tela SERP mostra keyword, provider, targeting, snapshot atual, versão, captura, tipos, preview, histórico, previous snapshot, persistência e comparação descritiva. Abrir a tela não chama provider; `Atualizar SERP` é a única ação de coleta.
- **Implementado:** Referências recebeu busca, filtros por função, pendências, motivos, restauração e ação coletiva de análise. Análise SERP exibe necessidades, lacunas, conflitos, oportunidades e fontes observadas, sem transferir decisão ao Planejador.
- **Implementado:** Evidências adicionais foi organizada em seções internas e permanece explicitamente em fixture local. Telegram global, binding e persistência remota de contribuições não foram conectados.
- **Implementado:** o Workbench mostra resumo de atividade derivado do estado existente do artigo; o Perfil expandido ganhou acesso rápido às áreas detalhadas sem criar versão.
- **Confirmado por teste:** 21 testes R2, 33 testes direcionados do fluxo e 10 testes de persistência com loader passam. Lint direcionado passa e o guardião visual passa nas cinco superfícies novas.
- **Limitações:** `pnpm build` foi bloqueado pelo download de `Geist`/`Geist Mono` no ambiente; `tsc` global mantém erros preexistentes em `lib/minerador/keyword-qualification.ts` e regex legadas. A inspeção visual autenticada não foi concluída porque a sessão local abriu em `/login`.
- **Governança:** `DATABASE_CHANGE_REQUIRED=YES` para a fundação Telegram; `PLANNER_GERAL_REQUIRED=YES`; nenhuma migration, escrita remota, chamada DataForSEO/Serper ou deploy foi executado nesta rodada.

## Lote Radar R3 — Workbench consolidado — 2026-08-25

- **Verificado no código:** o Workbench principal agora organiza `SERP → Amazon → Conteúdo → Especialista` em quatro áreas expansíveis no mesmo contexto; somente uma área fica aberta por vez.
- **Implementado:** SERP concentra coleta explícita, referências e análise da amostra; Amazon permanece como contrato visual/local não aplicável, sem provider ou `ProductEvidence`; Conteúdo espelha ArticleDNA, sinais SERP e necessidades; Especialista mantém conteúdo existente, incluindo YouTube, separado da SERP e usa somente a fixture local já existente.
- **Implementado:** o relatório consolidado fica abaixo das quatro áreas e mantém aprovação/transferência pelos fluxos detalhados compatíveis. A tabela e o Perfil expandido consomem o mesmo `RadarR3Model` e a mesma próxima ação, preservando `brandId` e `articleDnaVersionId`.
- **Implementado:** o painel global de atividade deixou de ser renderizado no Workbench R3; permanece apenas a última atividade compacta. Nenhuma troca visual cria versão, chama provider ou altera ArticleDNA/SiloDNA/KeywordDNA.
- **Confirmado por teste:** 27 testes focados do Radar, incluindo 6 novos testes R3, passam; lint do código alterado, guardião visual e `git diff --check` passam.
- **Validado manualmente:** Workbench, expansão de SERP/Amazon/Conteúdo/Especialista, subárea de análise, Perfil espelhado e tabela em sessão autenticada, com viewport padrão e 360/768/1024/1440 px no tema escuro. **Ainda não verificado:** tema claro e aprovação/transferência por interação no navegador. Não houve chamada Amazon/Telegram/DataForSEO, escrita remota, migration, commit, push ou deploy nesta rodada.
- **Governança:** a fundação Telegram continua `TELEGRAM_RADAR_BACKEND_READY=PARTIAL`, `DATABASE_CHANGE_REQUIRED=YES` e `PLANNER_GERAL_REQUIRED=YES`; o R3 não cria schema nem desbloqueia essa dependência.

## Lote Radar R3.1 — refinamento do Workbench — 2026-08-25

- **Implementado:** o Workbench não exibe mais `Detalhe compatível` como ação global nem a faixa redundante `Área ativa`; a próxima ação permanece informativa no cabeçalho e as ações executáveis continuam nas áreas correspondentes.
- **Implementado:** SERP, Amazon, Conteúdo, Especialista e Relatório mantêm seus aprofundamentos dentro das próprias expansões. O dossiê de Conteúdo prioriza Silo, Função e estado do SiloDNA; IDs, snapshots, version IDs e hashes ficam em `Proveniência / detalhes técnicos` recolhido.
- **Preservado:** handlers, hrefs e rotas canônicas/legadas continuam no código para deep links e compatibilidade; a remoção é apenas da apresentação global do Workbench.
- **Validado manualmente:** sessão autenticada confirmou 4 cards, SERP/Conteúdo/Especialista expansíveis, Perfil, tabela, ausência de overflow horizontal e detalhes técnicos recolhidos em 768/1024/1440 px no tema escuro. A captura por API não é suportada pela conexão Chrome usada nesta rodada.
- **Ainda não verificado:** tema claro e aprovação/transferência por interação; nenhuma chamada externa, escrita remota, migration, alteração de contrato ou criação de versão foi executada.

## Lote Radar R3.2 — fila sequencial e Workbench contextual — 2026-08-25

- **Implementado:** o Workbench não escolhe mais um artigo automaticamente. Sem seleção, mostra `Selecione um artigo para trabalhar` e quatro cards desabilitados; com seleção, o cabeçalho identifica o artigo e todos os dados são derivados do mesmo `RadarR3Model` usado pela tabela e pelo Perfil.
- **Implementado:** a linha da planilha pode ativar o artigo por clique ou teclado, mantém a seleção visual e troca o contexto completo do Workbench. A expansão local é reiniciada na troca de artigo para impedir vazamento de área ou estado entre artigos; os handlers, aliases e rotas legadas permanecem preservados.
- **Implementado:** SERP, Amazon, Conteúdo e Especialista são cards compactos com resumo, status e chevron; somente uma área expande por vez. Amazon continua `Não aplicável`, sem chamada externa. O relatório consolidado virou `<details>` recolhido, com faixa horizontal compacta e prévia/ações somente sob demanda.
- **Implementado:** o Workbench passou a ser um bloco `shrink-0` sem altura rígida e a planilha ocupa o restante flexível da viewport. A mudança compartilhada em `components/editorial/operational-data-grid.tsx` é aditiva: consumidores existentes sem `activeRowId`/`onRowActivate` preservam o comportamento anterior.
- **Confirmado por teste:** 17 testes focados R3/R3.1/R3.2 passam, incluindo estado sem seleção, isolamento entre artigos, cards desabilitados, Amazon não aplicável, relatório recolhido, modelo compartilhado e ausência de provider no render.
- **Validado manualmente:** sessão autenticada em tema escuro confirmou estado vazio, seleção pela planilha, título/metadados do artigo, SERP/Conteúdo exclusivos, exclusividade de expansão, relatório fechado/aberto e domínio sem overflow horizontal em 1440, 1024, 768 e 360 px. O dataset disponível nesta sessão tinha um artigo, portanto a troca visual entre dois artigos foi coberta pelo teste de modelos isolados, não por duas linhas reais.
- **Ainda não verificado:** tema claro, aprovação/transferência por interação e smoke remoto. Nesta rodada não houve chamada DataForSEO, Serper, Telegram, Amazon ou outro provider; não houve migration, schema/RLS, escrita remota, criação de versão, commit, push ou deploy.

## Lote Radar R4 — fila sequencial e foco por artigo — 2026-08-25

### IMPLEMENTED — verificado no código

- O Workbench fechado mantém somente `Radar Workbench`, `Trabalhando em`, o título do artigo focado e os quatro cards fixos `SERP`, `Amazon`, `Conteúdo` e `Especialista`. Sem foco, mostra `Selecione um artigo para trabalhar`; os cards permanecem neutros, desabilitados e não repetem a mensagem.
- `focusedArticleId` e `selectedArticleIds[]` são estados distintos. O clique/teclado da linha define foco sem alterar a seleção coletiva; checkbox e seleção alimentam exclusivamente a barra inferior. O Perfil expandido continua usando o mesmo modelo do artigo da linha.
- O estado local por artigo cobre fila SERP, tópicos, especialista e relatório. A tabela mostra status do processo correto, incluindo processamento SERP, revisão SERP, resposta do especialista e relatório pronto para revisão.
- A barra inferior existente recebeu `RadarR4BulkOperationsBar`, com contagem selecionada, ações contextuais e seletor local `eligible / alreadyDone / blocked` por operação. O grid compartilhado foi estendido de forma aditiva com `renderBulkBar`; consumidores que usam `bulkActions` permanecem compatíveis.
- A fila SERP local deduplica artigos e usa `QUEUED`, `RUNNING`, `WAITING_REVIEW`, `COMPLETED`, `FAILED_RETRYABLE` e `FAILED_FINAL`. O lote somente começa por ação explícita; seleção, foco e abertura não coletam SERP.
- A revisão humana permanece uma fila: após coleta o item vai para `WAITING_REVIEW`, a planilha expõe o estado e o painel SERP oferece anterior/próxima pendente sem nova rota.
- Preparação de tópicos, aprovação em lote, preparação de relatório e estados da fila do especialista foram adicionados como estado de sessão por artigo. A aprovação humana continua separada do envio.
- Avisos usam o bridge de avisos da sessão existente; não foi criada tabela de notificações. Rotas, aliases, handlers canônicos e deep links legados foram preservados.

### LOCAL_ONLY — confirmado por teste, não remoto

- `prepareRadarR4Topics` gera propostas determinísticas locais a partir do ArticleDNA, resumo e evidências observadas, com saída `TOPICS_READY_FOR_REVIEW`. Não há chamada DeepSeek automática nem envio automático.
- Aprovação de tópicos, relatório pronto para revisão e estados `READY_TO_SEND` são apenas estado de sessão e não criam versão, ContentPlan, ExpertEvidence ou registro remoto.
- A fixture detalhada do especialista continua disponível para validação de interface, mas envio, recebimento, áudio, transcrição e organização são simulados/localizados.

### BLOCKED_BY_DATABASE — não atravessado nesta tarefa

- `BATCH_PROCESSING_CAN_REUSE_EXISTING_JOBS = PARTIAL`: `external_processing_jobs` e o Local Worker existentes cobrem a fundação de processamento de contribuições Telegram, mas não há consumidor canônico genérico para lote SERP. Não foi criada tabela, queue, migration, RLS ou backend paralelo.
- O pipeline `Telegram → Contribution → áudio/STT/Storage → organização DeepSeek` permanece bloqueado pela fundação remota e pelo gate do Planner Geral. Não foi afirmada automação real.

### PLANNED — ainda não verificado

- Worker/consumer genérico de lote SERP, persistência remota de jobs e integração remota da contribuição exigem decisão estrutural do Planner Geral e autorização própria.
- Execução autenticada de um lote real, readback/reload remoto, tema claro e aprovação/transferência por interação no navegador permanecem validações posteriores.

### Confirmado nesta rodada

- 22 testes direcionados R3/R3.1/R3.2/R4 passam; lint do código alterado passa; nenhum provider, Telegram, DeepSeek, migration, escrita remota, commit, push ou deploy foi executado.
- `tsc --noEmit` permanece bloqueado somente por `lib/minerador/keyword-qualification.ts` e três regex TS1501 em `tests/agency-adalba-platform-internal.test.mts`; não há erro TypeScript novo no escopo R4.

## Lote Radar R4.1 — refinamento fila sequencial e revisão por processo — 2026-08-26

- **Implementado e confirmado no código:** `focusedArticleId` permanece separado de `selectedArticleIds[]`; a planilha governa o foco operacional e a Bulk Operations Bar governa somente ações coletivas. Cada artigo mantém SERP, Amazon, tópicos, especialista e relatório independentes.
- **Implementado e confirmado por teste:** a elegibilidade agora diferencia `eligible`, `alreadyDone`, `blocked` e `notApplicable`; revisão e aprovação SERP são ações distintas; falha final não entra novamente na fila; Amazon expõe `AMAZON_APPLICABLE`, `AMAZON_NOT_APPLICABLE`, `AMAZON_PENDING` e `AMAZON_REVIEWED` localmente.
- **Implementado e confirmado por teste:** o contexto do especialista reúne ArticleDNA, análise SERP, estado Amazon e material existente; a pauta pode ser editada, removida, adicionada e reordenada localmente antes do gate `READY_TO_SEND`.
- **Implementado e confirmado no render:** a planilha continua dominante; em 1440/1024 px o Workbench fechado ficou em aproximadamente 31,7% da altura útil, sem altura rígida e sem overflow horizontal. O estado vazio mostra exatamente `Selecione um artigo para trabalhar` e cards neutras desabilitadas.
- **Confirmado nesta rodada:** 24 testes direcionados R3/R3.1/R3.2/R4 passam; ESLint direcionado, suíte visual 20/20, guardião visual e `git diff --check` passam. Render autenticado em tema escuro foi conferido em 1440/1024/768/360 px, com foco, seleção, barra coletiva, expansão contextual e planilha abaixo.
- **Ainda não verificado:** tema claro por screenshot, lote real com provider, readback/reload remoto, aprovação/transferência via interação autenticada, Telegram/DeepSeek/STT/Storage reais e worker genérico.
- **Limites preservados:** nenhuma chamada DataForSEO, Amazon, Telegram ou outro provider; nenhuma migration, schema/RLS, escrita remota, criação de versão, commit, push ou deploy. Os erros globais de TypeScript permanecem nos arquivos já conhecidos de Minerador/testes e não surgiram no escopo Radar.

## RADAR R5 — fila sequencial e preparação de especialista — 2026-08-26

- **Auditoria autenticada somente leitura:** a marca Care Glow apresentou 1 artigo real na planilha (`Cobrir com clareza o tema “marketing online”.`), 1 artigo elegível para SERP, 0 artigos com snapshot SERP real existente e 0 artigos observados em estágio posterior nesta sessão. A leitura SQL read-only do catálogo remoto foi recusada pelo guard de autorização; não foi contornada.
- **Implementado no código:** o lote SERP continua usando `pipeline.collectSerp`, que chama exclusivamente o handler canônico `POST /api/editorial/serp`. A execução no cliente é sequencial, mantém estado por artigo (`QUEUED`, `RUNNING`, `WAITING_REVIEW`, `COMPLETED`, `FAILED_RETRYABLE`, `FAILED_FINAL`) e continua para o próximo item depois de uma falha.
- **Implementado no código:** o processamento padrão não reprocessa snapshot real existente. Itens já processados ficam `ALREADY_DONE` e aparecem somente como `refreshSerp` mediante ação explícita. A classificação também separa `ELIGIBLE`, `REQUIRES_EXPLICIT_REFRESH` e `BLOCKED`.
- **Implementado no código:** reload/reidratação deriva `WAITING_REVIEW` ou `COMPLETED` de `editorial_serp_snapshots`/`editorial_serp_reviews` já carregados pelo pipeline. A fila em andamento ainda é estado da sessão porque não foi criada persistência/job genérico novo; essa é a limitação de durabilidade declarada.
- **Implementado no código:** `reviewSerp` deixou de marcar a fila como concluída sem decisão. A revisão individual do Workbench chama o consumidor canônico e só então conclui o artigo; a fila de revisão oferece artigo anterior/próximo sem misturar o contexto do Workbench.
- **Implementado no código:** o progresso compacto aparece somente enquanto o lote possui itens não concluídos e oferece `Ver pendentes`/`Ver falhas`. A seleção múltipla continua pertencendo à planilha e o foco continua pertencendo a um único artigo.
- **Implementado no código:** a preparação de pautas usa contexto do ArticleDNA, necessidades/lacunas e diagnóstico SERP, referências aprovadas, estado Amazon e material existente disponível no artigo. Cada artigo é processado independentemente; falha em um artigo vira `FAILED_RETRYABLE` sem invalidar os demais.
- **Implementado no código:** `POST /api/editorial/radar-topics` usa `resolvePipelineContext`, `resolveDeepSeekCanonicalConfig` e `generateStructuredAI`. O contrato exige 3–5 pautas com origem, justificativa e necessidade; a resposta é cópia de trabalho local, exige revisão individual e não cria artigo, versão ou envio Telegram.
- **Implementado no código:** pautas podem ser editadas, removidas, adicionadas, reordenadas, desfeitas/refeitas e marcadas individualmente como revisadas. A aprovação coletiva só fica elegível depois que todas as pautas daquele artigo passaram pelo gate individual.
- **Classificação de execução:** `SERP_BATCH_RUNTIME=IMPLEMENTED_NOT_SMOKED`; `PARTIAL_FAILURE_HANDLING=IMPLEMENTED_NOT_SMOKED`; `RELOAD_RECOVERY=IMPLEMENTED_NOT_SMOKED`; `SERP_REVIEW_QUEUE=IMPLEMENTED_NOT_SMOKED`; `REAL_EXPERT_CONTEXT=IMPLEMENTED_NOT_SMOKED`; `DEEPSEEK_TOPIC_PIPELINE=IMPLEMENTED_NOT_SMOKED`; `TOPIC_REVIEW_QUEUE=IMPLEMENTED_NOT_SMOKED`.
- **Durabilidade:** `SERP_BATCH_DURABILITY=PARTIAL_EXISTING_SNAPSHOTS_REVIEWS_ONLY`; snapshots/revisões existentes são reutilizados, mas `QUEUED/RUNNING` não foram promovidos a job remoto novo.
- **Telegram:** `TELEGRAM_REMOTE_FOUNDATION=AWAITING_READ_ONLY_AUTHORIZATION`; `REAL_TELEGRAM_SEND=BLOCKED_BY_DATABASE`; `REAL_TELEGRAM_RECEIVE=BLOCKED_BY_DATABASE`; `TELEGRAM_TEXT_E2E=AWAITING_MANUAL_TEST`; áudio permanece posterior ao smoke de texto. Nenhum arquivo de Telegram, schema, migration ou RLS foi alterado.
- **Nesta rodada:** `REAL_DATAFORSEO_CALLS=0`, `REAL_DEEPSEEK_CALLS=0`, `REAL_TELEGRAM_CALLS=0`, `REMOTE_WRITES=0`, `DATABASE_CHANGE_REQUIRED=NO`. O route handler DeepSeek foi apenas implementado; não foi invocado.
- **Validação:** 24 testes direcionados R3/R4/R5 passaram; ESLint direcionado não apresentou erro; a suíte ampla Radar terminou em 103/105, mantendo a fixture legada de hidratação (`fallbackHierarchyStrategy` sem `score/components`) e o erro de resolução ESM preexistente de `lib/server/serp-persistence-adapter.ts` fora do escopo. O TypeScript global também permanece limitado por `lib/minerador/keyword-qualification.ts`, `modules/arquiteto/arquiteto-workspace.tsx` e três regex TS1501 em `tests/agency-adalba-platform-internal.test.mts`; nenhum desses arquivos foi alterado nesta continuidade. Smoke autenticado de lote, revisão, DeepSeek, readback remoto e tema claro continuam não verificados.

## RADAR R6 — fila sequencial, contexto de especialista e relatório consolidado — 2026-08-26

- **Implementado localmente:** o Radar agora possui o builder canônico `buildExpertTopicContext(articleId)`. Ele reúne o ArticleDNA correto, referências de KeywordDNA, SiloDNA recebido, SERP revisada, referências aprovadas, necessidades, lacunas, conflitos, estado Amazon e material existente do especialista. Os IDs de proveniência vêm somente dos envelopes, snapshots e registros locais já recebidos; nenhum ID de pauta é enviado como identidade de fonte.
- **Implementado localmente:** `POST /api/editorial/radar-topics` usa exclusivamente o consumer canônico DeepSeek server-side, exige 3–5 perguntas com origem, justificativa, necessidade e referência e devolve cópia de trabalho em `TOPICS_READY_FOR_REVIEW`. A validação local rejeita repetição, pergunta já conhecida, origem ausente ou referência que não pertence ao contexto. `DEEPSEEK_RUNTIME=IMPLEMENTED_NOT_SMOKED`; `DEEPSEEK_REAL_SMOKE=AWAITING_AUTHORIZATION`.
- **Implementado localmente e confirmado por teste:** cada pauta preserva origem combinada, referência, necessidade, motivo e material complementar. A expansão Especialista permite editar, adicionar, remover, reordenar, desfazer/refazer e revisar individualmente. O estado `Proposto pela IA` permanece distinto de `Aprovado para envio`; a aprovação coletiva só fica disponível quando todas as pautas do artigo foram revisadas.
- **Implementado localmente:** o Dossiê Conteúdo mostra perguntas preparadas como solicitações, necessidades, lacunas, estado da revisão e material relacionado. Perguntas não são `ExpertEvidence`; contribuição recebida/revisada continua sendo o único caminho para evidência do especialista.
- **Implementado localmente e confirmado por teste:** o modelo `RadarR6ConsolidatedReport` reúne ArticleDNA, evidências SERP, Amazon quando aplicável e `ExpertEvidence` quando existir, mantendo IDs e proveniência. O relatório pode ser prévia sem especialista quando `NOT_REQUIRED`; quando a contribuição é necessária, exibe pendência e não é final. `REPORT_GENERATED`, `REPORT_REVIEWED` e `REPORT_APPROVED` permanecem gates separados. A aprovação local exige SERP revisada, relatório revisado e ausência de contribuição pendente; não cria versão remota nem envia automaticamente ao Planejador.
- **Implementado localmente e confirmado no render:** o relatório fica recolhido em uma faixa compacta abaixo das quatro áreas congeladas. Ao abrir, mostra resumo, evidências, necessidades, lacunas, conflitos, recomendações e proveniência sem transformar o painel em superfície permanente dominante. O Workbench e a planilha preservam o comportamento R3/R4/R5.
- **Handoff:** `PLANNER_HANDOFF_CONTRACT=STRUCTURAL_CHANGE_REQUIRED`. O pacote atual aceito pelo Planejador preserva ArticleDNA/SiloDNA/SERP e decisões do Radar, mas não possui campos aditivos para Amazon/ExpertEvidence do modelo R6. A mudança exigiria consumidor/contrato compartilhado; portanto o resultado é `BLOQUEADO — PLANNER GERAL` e nenhum arquivo do Planejador foi alterado.
- **Telegram:** `TELEGRAM_REMOTE_FOUNDATION=PARTIAL`: migration, contratos e repositórios locais existem, mas não há confirmação autorizada de aplicação remota, RLS, webhook, bot global ou readback das seis tabelas. Por isso `REAL_TELEGRAM=BLOCKED_BY_DATABASE`, `EXPERT_BRIEF_RUNTIME=BLOCKED_BY_DATABASE`, `TELEGRAM_BINDING_RUNTIME=BLOCKED_BY_DATABASE`, `TELEGRAM_TEXT_SEND=BLOCKED_BY_DATABASE` e `TELEGRAM_TEXT_END_TO_END=BLOCKED_BY_DATABASE`. A mensagem técnica só aparece quando o especialista alcança `READY_TO_SEND`; a UI normal não é poluída.
- **Conteúdo e áudio:** YouTube, podcast, vídeo, áudio e documento podem ser registrados localmente em `LINK_REGISTERED`, `AWAITING_FILE` ou `IGNORED_FOR_ARTICLE`; nenhum download é executado. O contrato local de contribuição já separa original, referência de armazenamento, transcrição e material organizado, mas STT não foi implementado nem executado: `YOUTUBE_EXISTING_CONTENT=LOCAL_ONLY` e `AUDIO_CONTRACT_READINESS=IMPLEMENTED_NOT_SMOKED`.
- **Validação desta continuidade:** 30 testes direcionados R3/R4/R5/R6 passaram; ESLint direcionado, guardião visual e suíte visual 20/20 passaram. O build Next/Turbopack compilou e parou na checagem TypeScript por erros globais preexistentes em `lib/minerador/keyword-qualification.ts` e três regex TS1501 em `tests/agency-adalba-platform-internal.test.mts`. A suíte ampla Radar terminou em 109/111, mantendo os dois failures conhecidos de hidratação legada e resolução ESM do adapter de persistência. Não foram executadas chamadas DataForSEO, DeepSeek ou Telegram, migrations, escrita remota, criação de versão, commit, push ou deploy.
- **Ainda não verificado:** smoke autenticado do DeepSeek, ExpertBrief/binding/Telegram texto real, resposta recebida pelo webhook, readback remoto, Amazon real, STT/Storage, tema claro e handoff R6 para o Planejador. `REAL_DATAFORSEO_CALLS=0`, `REAL_DEEPSEEK_CALLS=0`, `REAL_TELEGRAM_CALLS=0`, `REMOTE_WRITES=0`, `DATABASE_CHANGE_REQUIRED=NO`, `PLANNER_GERAL_BLOCKERS=YES`.

## RADAR R7 — fila sequencial, evidência e isolamento de fixtures — 2026-08-26

- **Implementado localmente:** `lib/radar/r7-sequential.ts` formaliza a matriz de estado por área (`SERP`, `Amazon`, `Conteúdo`, `Especialista`, `Relatório`) e diferencia `DERIVED_FROM_REAL_DATA`, `PERSISTED`, `RECONSTRUCTIBLE`, `LOCAL_ONLY` e `FIXTURE`. Estado local de sessão não é apresentado como persistência ou readback remoto.
- **Implementado e confirmado por teste:** o contexto de `buildExpertTopicContext(articleId)` continua vinculado ao `articleId`, `brandId`, ArticleDNA/version, KeywordDNA, SiloDNA, snapshot/revisão SERP e referências aprovadas. Um fixture de artigo de marketing não recebe perguntas ou material médico da fixture do especialista.
- **Implementado e confirmado por teste:** `parseRadarR7TopicResponse` aceita o envelope canônico `topics` com 3–5 pautas, valida schema, duplicidade, perguntas conhecidas, origem, referência e relação da necessidade com ArticleDNA/SiloDNA/SERP/Amazon. Resposta truncada, inválida ou fora do escopo falha fechada.
- **Implementado:** falha de preparação DeepSeek preserva as pautas e a proveniência válidas que já estavam na sessão; apenas o estado do processamento muda para `FAILED_RETRYABLE`. A resposta válida nova continua como cópia de trabalho em `TOPICS_READY_FOR_REVIEW`.
- **Implementado:** o painel de contribuição médica só é renderizado quando `showLocalFixture` é explicitamente habilitado por teste. No fluxo real, a interface informa que a fixture está disponível apenas em modo de teste e não representa Telegram conectado.
- **Implementado e confirmado por teste:** o Dossiê Conteúdo separa `Solicitações`, `Perguntas`, `Contribuições` e `ExpertEvidence`, com origem/estado explícitos. Solicitação ou pauta local não vira evidência; contribuição remota não verificada permanece ausente.
- **Implementado e confirmado por teste:** o relatório cobre os cenários sem especialista, especialista pendente, `ExpertEvidence` revisada e Amazon pendente. `AMAZON_PENDING`/`AMAZON_APPLICABLE` não revisado bloqueia a aprovação. Ações locais são `gerar/atualizar → revisar → aprovar`; nenhuma delas cria versão ou aprovação remota.
- **Implementado e confirmado por teste:** aprovação local guarda um fingerprint das evidências usadas. Snapshot, referência, Amazon ou `ExpertEvidence` novos tornam o relatório `stale`, removem a aparência de aprovado e exigem nova geração/revisão; a evidência nova não entra silenciosamente em uma aprovação anterior.
- **Implementado localmente:** pipelines de fixture de texto e áudio mantêm Update → binding → brief → contribuição → Radar sem escrita remota. Original, transcrição e organização são camadas distintas; a faixa de origem `Áudio 2 · 00:41–01:13` chega à evidência local sem chamada STT/Storage.
- **Auditoria do Local Worker:** o código já cobre claim/lease, release, conclusão, retry com backoff e estados de falha; a migration local declara `heartbeat_at` e `original_asset_uri`. Não há readback remoto autorizado nesta continuidade, não há helper explícito de heartbeat e `insertTelegramContribution` ainda não comprova writeback `originalAssetUri → expert_contributions.original_asset_uri`; portanto `LOCAL_WORKER_READINESS=IMPLEMENTED_NOT_SMOKED` e não foi feita alteração estrutural.
- **Handoff:** a auditoria Radar → Planejador confirma que o pacote aceito pelo consumer atual representa ArticleDNA/SERP/análise/decisões, mas não Amazon/ExpertEvidence completos, fingerprint de aprovação ou as camadas locais de contribuição. `PLANNER_CONTRACT_AUDIT=STRUCTURAL_CHANGE_REQUIRED` e `PLANNER_ADAPTER=BLOCKED_BY_PLANNER_GERAL`; nenhum arquivo do Planejador foi alterado.
- **Fundação remota:** não foi repetida a leitura SQL recusada pelo guard. As seis tabelas Telegram, RLS, webhook, bot, worker remoto e readback continuam sem confirmação nesta tarefa: `TELEGRAM_REMOTE_FOUNDATION=BLOCKED_BY_DATABASE`, `REAL_TELEGRAM_CALLS=0` e `REMOTE_WRITES=0`.
- **DeepSeek:** a rota canônica server-side continua preparada para uma chamada única somente por ação explícita e Connection autorizada. Nenhuma chamada real foi executada: `DEEPSEEK_OUTPUT_VALIDATION=LOCAL_VALIDATED`, `DEEPSEEK_REAL_SMOKE=AWAITING_AUTHORIZATION`.
- **Validação automatizada desta continuidade:** 19 testes R7/R6/especialista passaram; ESLint do código Radar alterado e do teste R7 com `--no-ignore` passaram; guardião visual e suíte visual 20/20 passaram. A suíte ampla Radar ficou em 118/120, mantendo somente a fixture legada de hidratação (`fallbackHierarchyStrategy` sem `score/components`) e o import ESM sem extensão de `lib/editorial/contracts` no teste de persistência. `git diff --check` não encontrou erro de whitespace.
- **Validação visual autenticada:** em tema escuro, a sessão local confirmou estado vazio após reload, seleção do artigo real, quatro cards, Especialista sem conteúdo médico da fixture, relatório compacto/recolhido, planilha abaixo e `scrollWidth=clientWidth` no viewport disponível de 1920×897. O Workbench fechado mediu 331 px, aproximadamente 36,9% da altura útil nesse viewport; a validação anterior do R4.1 mediu aproximadamente 31,7% em 1440/1024 px. Tema claro, screenshot nos quatro breakpoints nesta continuidade e artigos reais em estágios diferentes continuam não verificados.
- **Limites preservados:** `DATABASE_CHANGE_REQUIRED=NO`, `PLANNER_GERAL_BLOCKERS=YES`, `REAL_DEEPSEEK_CALLS=0`, `REAL_TELEGRAM_CALLS=0`, `REAL_STT_CALLS=0`, `REMOTE_WRITES=0`; nenhuma migration, schema/RLS, chamada paga, commit, push ou deploy foi executado.

## Fase funcional 1 — Especialista / ExpertBrief — 2026-08-26

- **Implementado no código:** a área Especialista do Workbench e o detalhe
  canônico do artigo usam o painel real de ExpertBrief. O painel só é
  hidratado com artigo selecionado e contexto `ArticleDNA` correspondente;
  seleção de artigo continua trocando o Workbench inteiro sem compartilhar
  estado com outra linha da planilha.
- **Implementado no código:** `GET /api/editorial/expert-briefs` lista
  somente `brand_experts.status = active`, retorna apenas o estado resumido do
  binding e filtra briefs pela combinação exata de Marca, artigo, versão e
  especialista. IDs técnicos ficam no bloco recolhido de proveniência.
- **Implementado no código:** `POST` cria `expert_briefs` em `draft` e `PATCH`
  atualiza o `briefId` existente. Ambos fazem leitura de confirmação após a
  escrita e só retornam `remote_readback_confirmed` quando o registro lido
  ainda corresponde ao contexto solicitado. Repetição de salvamento usa PATCH
  e não cria nova pauta.
- **Implementado no código:** necessidades, `LACUNAS OBSERVADAS`, perguntas
  editáveis, adição, remoção, reordenação, criação de pauta, salvamento,
  revisão humana e seleção do histórico estão separados. Sugestões DeepSeek
  permanecem uma ação explícita e cópia de trabalho; não existe aprovação
  automática.
- **Limite de transporte:** o salvamento não emite Telegram, não cria token de
  seleção e não chama provider. Binding configurado/não vinculado é apenas
  informação; contribuição recebida e `ExpertEvidence` continuam ausentes até
  seus caminhos canônicos. A fixture médica não é renderizada na rota real do
  artigo.
- **Arquivos principais desta fase:**
  `app/api/editorial/expert-briefs/route.ts`,
  `lib/server/telegram/persistence.ts`,
  `lib/server/expert-contribution-contracts.ts`,
  `lib/radar/expert-brief.ts`,
  `modules/radar/radar-expert-brief-panel.tsx`,
  `modules/radar/radar-r3-specialist-panel.tsx`,
  `modules/radar/radar-r3-workbench.tsx`,
  `modules/radar/radar-page.tsx` e
  `modules/radar/radar-analysis-page.tsx`.
- **Validação automatizada:** 54 testes direcionados Radar/ExpertBrief/R6/R7
  passaram; a suíte visual passou 20/20; o guardião visual passou; ESLint
  direcionado passou; `git diff --check` não encontrou erro de whitespace. A
  suíte ampla Radar passou 132/134, mantendo somente a fixture legada de
  hidratação (`fallbackHierarchyStrategy` sem `score/components`) e o import
  ESM sem extensão de `lib/editorial/contracts` no teste de persistência.
  O build Next/Turbopack compilou o código e parou apenas na checagem
  TypeScript pelos erros globais já conhecidos em
  `lib/minerador/keyword-qualification.ts` e nas três regex TS1501 de
  `tests/agency-adalba-platform-internal.test.mts`.
- **Não verificado remotamente:** não houve smoke autenticado Care Glow,
  escrita/readback/reload em Supabase, teste negativo cross-tenant, chamada
  DeepSeek, Telegram, DataForSEO, áudio, STT ou Storage nesta continuidade.
  Portanto `READY_FOR_RADAR_EXPERTBRIEF_FLOW=NO`,
  `EXPERTBRIEF_REMOTE_READBACK=IMPLEMENTED_NOT_SMOKED`,
  `REAL_DEEPSEEK_CALLS=0`, `REAL_TELEGRAM_CALLS=0` e `REMOTE_WRITES=0`.
- **Validação visual desta fase:** o servidor local respondeu e o navegador
  alcançou a tela de login, mas não havia sessão autenticada/marca disponível
  para abrir um artigo real. Assim, o painel ExpertBrief, o readback visual e
  o screenshot autenticado continuam pendentes; a validação disponível nesta
  continuidade é automatizada/estática e o guardião visual.
- **Limites preservados:** nenhuma migration, schema/RLS, contrato do
  Planejador, Arquiteto, Minerador, ArticleDNA, SiloDNA, provider ou deploy foi
  alterado/executado. Os erros globais de TypeScript conhecidos permanecem
  fora do escopo Radar.

## Fase funcional 1B — Smoke remoto ExpertBrief — 2026-08-26

- **Correção Radar aplicada antes da leitura remota:** o Workbench estava
  enviando a identidade do item operacional (`row.id`) ao construtor de
  contexto. O fluxo canônico exige `row.articleId`; a troca foi localizada em
  `modules/radar/radar-page.tsx` e recebeu regressão em
  `tests/radar-expert-brief.test.mts`. Nenhum contrato, schema ou dado remoto
  foi alterado.
- **Sessão e contexto:** `AUTHENTICATED_SESSION=PASS` na sessão Chrome já
  autenticada da Care Glow. A tela exibiu o artigo
  `articleId=group-11aenvf`, `ArticleDNA v2`,
  `articleDnaVersionId=d6aca87b-66e5-48ac-b8a2-7c7e10236fe4` e
  `brandId=09762023-d0d4-4c24-b34e-d0fdfd43f891`. O painel ExpertBrief deixou
  de ficar bloqueado por hidratação e fez a leitura contextual normal.
- **Leitura remota de especialistas:** `EXPERT_LIST_REMOTE=PASS_EMPTY`.
  A resposta exibida pela interface foi “Nenhum especialista cadastrado nesta
  Marca”. Não havia especialista ativo utilizável para selecionar; nenhum
  especialista de smoke foi criado.
- **Smoke interrompido por pré-condição:**
  `EXPERTBRIEF_REMOTE_CREATE=NOT_ATTEMPTED_PREREQUISITE`,
  `EXPERTBRIEF_REMOTE_READBACK=NOT_ATTEMPTED`,
  `EXPERTBRIEF_REMOTE_RELOAD=NOT_ATTEMPTED`,
  `EXPERTBRIEF_REMOTE_UPDATE=NOT_ATTEMPTED` e
  `EXPERTBRIEF_IDEMPOTENCE=NOT_ATTEMPTED`. Não houve binding selecionável,
  múltiplas pautas ou teste cross-tenant nesta etapa.
- **Gate e efeitos externos:** `READY_FOR_RADAR_EXPERTBRIEF_FLOW=NO`,
  `DATABASE_CHANGE_REQUIRED=NO`, `EXPERT_EVIDENCE_CREATED=NO`,
  `REMOTE_WRITES=0`, `REAL_DATAFORSEO_CALLS=0`, `REAL_DEEPSEEK_CALLS=0`,
  `REAL_TELEGRAM_CALLS=0` e `REAL_GOOGLE_CLOUD_CALLS=0`. O bloqueio é de
  cadastro/seleção do especialista na marca, não de schema observado; não foi
  contornado por banco, fixture ou provider.
- **Validação visual/manual:** o estado autenticado foi conferido em tema
  escuro a 1920×897, com artigo selecionado, quatro áreas do Workbench,
  Especialista expandido, mensagem de lista vazia, necessidades/lacunas e
  ausência de overflow horizontal (`scrollWidth=clientWidth`). Screenshot,
  Workbench recolhido e planilha dominante foram validados nesse estado; o
  screenshot do fluxo completo com especialista/pauta, criação, readback e
  reload do registro real continuam pendentes até existir especialista ativo e
  autorização para a gravação remota.

## Fase funcional real — ExpertBrief → Telegram → contribuição → áudio — 2026-08-26

- **Implementado no código:** o fluxo Radar-only agora cobre o caminho
  `ExpertBrief → binding explícito → envio Telegram → inbound por brief →
  ExpertContribution`. A criação/salvamento continua sem provider automático;
  o envio usa a ação explícita `Enviar ao especialista`, claim antes do
  provider, readback após o envio e retry idempotente quando o brief já está
  confirmado como enviado.
- **Implementado no código:** o webhook resolve a contribuição por binding,
  `selected_brief_id` e brief enviado. Não usa telefone, “última pauta” ou
  fallback de Marca. Update, contribuição original, estado
  `awaiting_review` e job de mídia preservam `brandId`, `expertId`, `briefId` e
  `contributionId` com filtros exatos.
- **Implementado no código:** o Dossiê separa solicitação, contribuição
  recebida, original, transcrição e organização. `ExpertEvidence` é uma
  projeção do conteúdo remoto mais decisão humana local; revisão pendente ou
  conteúdo ilegível não é promovido. A revisão oferece decisão, classificação
  e relação com necessidade sem criar tabela nova. O relatório de detalhe
  mostra ExpertEvidence de forma compacta e o handoff v2 recebe somente
  evidências já revisadas.
- **Implementado no código:** a cadeia do worker local cobre preservação do
  asset original em `expert_contributions.original_asset_uri`, follow-up de
  voz/áudio, Speech-to-Text longo server-side e organização estruturada via
  DeepSeek canônico. Original, `transcript_text` e `organization_payload` são
  writebacks separados; a organização recebe `humanDecisionRequired=true` e
  nunca substitui a transcrição bruta. `npm run local-worker:once` executa
  somente um ciclo quando `LOCAL_WORKER_RUN=1` e
  `LOCAL_WORKER_ACTOR_USER_ID` estão configurados.
- **Implementado no código:** o detalhe reconsulta o ExpertBrief remoto por
  artigo/versão, bloqueia aprovação/handoff diante de erro, pendência ou
  conteúdo não legível e compara o conjunto atual com o handoff aprovado.
  Nova contribuição ou novo conteúdo na mesma contribuição reabre a revisão;
  não mantém `APPROVED` silenciosamente.
- **Classificação desta continuidade:**
  `EXPERTBRIEF_REMOTE=IMPLEMENTED_NOT_SMOKED`;
  `DEEPSEEK_TOPIC_REAL=IMPLEMENTED_NOT_SMOKED`;
  `TELEGRAM_BINDING_REAL=IMPLEMENTED_NOT_SMOKED`;
  `TELEGRAM_OUTBOUND_TEXT=IMPLEMENTED_NOT_SMOKED`;
  `TELEGRAM_INBOUND_TEXT=IMPLEMENTED_NOT_SMOKED`;
  `EXPERT_CONTRIBUTION_REMOTE=IMPLEMENTED_NOT_SMOKED`;
  `EXPERT_EVIDENCE_REAL=IMPLEMENTED_NOT_SMOKED`;
  `LOCAL_WORKER=IMPLEMENTED_NOT_SMOKED`;
  `GCS=IMPLEMENTED_NOT_SMOKED`; `SPEECH_TO_TEXT=IMPLEMENTED_NOT_SMOKED`;
  `DEEPSEEK_ORGANIZATION=IMPLEMENTED_NOT_SMOKED`.
- **Remote/manual:** não houve chamada de provider, envio Telegram, escrita
  remota ou execução do worker nesta continuidade. O último smoke autenticado
  conhecido retornou `EXPERT_LIST_REMOTE=PASS_EMPTY` para Care Glow; sem
  especialista ativo não foi possível avançar para criação de pauta, binding,
  resposta humana, áudio ou handoff real. `MANUAL_TELEGRAM_ACTION_REQUIRED`
  ainda não foi alcançado.
- **Validação automatizada:** 40 testes focados Radar/Telegram/worker/R6/R7
  passaram; a suíte ampla Radar passou 141/143, mantendo somente a fixture
  legada de hidratação (`fallbackHierarchyStrategy` sem `score/components`) e
  o import ESM sem extensão de `lib/editorial/contracts` no teste de
  persistência. A suíte visual passou 20/20, o guardião visual passou, ESLint
  dos arquivos de código alterados passou e `git diff --check` passou.
  TypeScript global continua falhando somente em
  `lib/minerador/keyword-qualification.ts` e nas três regex TS1501 de
  `tests/agency-adalba-platform-internal.test.mts`; nenhum erro novo do Radar
  foi encontrado. O build Next/Turbopack foi bloqueado antes da compilação
  final pela indisponibilidade de rede para baixar Geist/Geist Mono em
  `fonts.googleapis.com`.
- **Limites:** `DATABASE_CHANGE_REQUIRED=NO`; nenhuma migration, schema/RLS,
  contrato do Planejador, Arquiteto, Minerador, provider, commit, push ou
  deploy foi executado. Validação visual autenticada clara/escura do fluxo
  completo, persistência/readback real e isolamento cross-tenant continuam
  pendentes.

## Regressão funcional — identidade do Radar e SERP real — 2026-08-26

- **Correção implementada:** o resolver server-side agora aceita o UUID
  canônico da linha de workflow e o alias local legado `radar:<articleId>`
  somente quando marca, artigo, versão do ArticleDNA e envelope de
  transferência coincidem. Um workflow de outra marca, artigo ou versão
  continua bloqueado com a mensagem canônica de conflito.
- **Correção implementada:** `modules/radar/radar-page.tsx` mantém `row.id`
  apenas para seleção, foco e transições que ainda recebem a identidade
  técnica da linha. SERP, fila sequencial, snapshots R4, estado local,
  especialista, tópicos, relatório e callbacks editoriais usam o
  `row.articleId` canônico; a coleta transporta o `articleDnaVersionId` do
  artigo selecionado.
- **Teste automatizado:** 58 testes direcionados Radar/R3/R4/R5/R6/R7 e
  envelope de resolução passaram. A regressão cobre `row.id != row.articleId`,
  os dois formatos compatíveis de identidade do workflow, rejeição de item
  divergente e ausência de provider durante render/hidratação.
- **Validação local:** ESLint direto nos arquivos alterados passou com
  avisos preexistentes; `check:visual-system` passou; `git diff --check`
  passou. `tsc --noEmit` continua bloqueado somente pelos quatro erros globais
  conhecidos em `lib/minerador/keyword-qualification.ts` e nas três regex
  TS1501 de `tests/agency-adalba-platform-internal.test.mts`; nenhum erro novo
  do Radar foi encontrado.
- **Sessão reproduzida:** Care Glow autenticada, `brandId=09762023-d0d4-4c24-b34e-d0fdfd43f891`,
  `articleId=group-11aenvf`, `focusedArticleId=radar:group-11aenvf`,
  `articleDnaVersionId=d6aca87b-66e5-48ac-b8a2-7c7e10236fe4` e ArticleDNA v2.
  A notificação era um falso conflito da representação técnica versus
  editorial; a guarda para divergência real foi preservada.
- **Ainda pendente:** a única chamada real DataForSEO, INSERT/readback do
  snapshot, reload completo sem nova chamada, histórico e revisão humana
  exigem smoke autenticado controlado e confirmação imediatamente antes da
  ação. Nesta correção `REAL_DATAFORSEO_CALLS=0`, `SERPER_CALLS=0`,
  `REMOTE_WRITES=0`, `DATABASE_CHANGE_REQUIRED=NO` e `MIGRATIONS_CREATED=0`.
  O ExpertBrief não foi retomado nesta continuidade.

## Correção funcional imediata — SERP unificada no Workbench — 2026-08-26

- **Implementado:** a expansão SERP do Workbench R3 passou a concentrar o
  fluxo normal completo: coleta compacta, seleção/classificação dos resultados
  orgânicos, análise das páginas selecionadas, revisão humana, aprovação e
  histórico. O botão `Curadoria detalhada` foi removido dessa experiência;
  a rota antiga e seus aliases continuam disponíveis para deep link, histórico,
  diagnóstico e etapas editoriais adjacentes.
- **Fonte única da curadoria:** `RadarAnalysisVersion.payload.serpDecisions`
  continua sendo o estado canônico. A decisão histórica `organic:<position>`
  foi preservada para compatibilidade, mas toda projeção é ligada ao snapshot
  atual por `snapshotId`, versão e hash; a chave de renderização também inclui
  URL e não depende do índice visual da lista. Análise, revisão e aprovação
  consomem a mesma seleção.
- **Persistência:** iniciar a curadoria e cada decisão humana criam uma
  sucessora da análise existente e passam por `saveRadarAnalysis`; o caminho
  remoto exige readback do artigo, versão e snapshot correspondentes. O
  fallback local atualiza a cópia de trabalho e a recuperação do navegador,
  mas nunca é apresentado como sucesso remoto. A revisão SERP reutiliza o
  endpoint/repositório existente, com confirmação do registro retornado e
  readback das revisões.
- **Análise e revisão:** a extração usa somente concorrentes/referências
  selecionados; PAA, relacionadas e Knowledge Graph ficam como evidência
  complementar recolhível. A revisão mostra concorrentes selecionados,
  referências aprovadas, necessidades, lacunas e conflitos antes da aprovação.
  A aprovação fica bloqueada sem snapshot real, análise compatível ou decisões
  orgânicas pendentes resolvidas; os complementares são contexto somente
  leitura e não bloqueiam a aprovação da SERP. Nenhum sucesso remoto é emitido
  antes de write/readback confirmados.
- **Auditoria da curadoria legada:** nenhuma operação necessária ao fluxo SERP
  normal depende mais de `radar-analysis-page.tsx`. A página antiga preserva o
  relatório detalhado, sinais de evidência adicionais, ExpertBrief/handoff,
  histórico e compatibilidade de rotas; essas superfícies não substituem a
  seleção, análise ou revisão inline.
- **Matriz de integração auditada:**

  | Função | Componente/handler | Estado | Persistência | Workbench normal |
  |---|---|---|---|---|
  | Resultados orgânicos | `RadarR3SerpPanel` / `RadarSerpView` | snapshot atual | leitura do workspace | Sim |
  | Seleção, exclusão e classificação | `persistSerpDecision` | `serpDecisions` da análise | `saveRadarAnalysis` + readback | Sim |
  | Análise de páginas | `analyzeSerpSelection` / extract existente | sucessora da análise | endpoint de extração + análise/readback | Sim |
  | Revisão e aprovação SERP | `reviewSerpForArticle` / `pipeline.reviewSerp` | `serpReviews` | `/api/editorial/serp` + repository/readback | Sim |
  | Histórico | `RadarR3SerpPanel` e rota legada | `records` do artigo | workspace remoto ou recuperação local | Sim |
  | Relatório detalhado, ExpertBrief e handoff | `radar-analysis-page.tsx` | etapa adjacente/compatibilidade | contratos existentes | Não necessário para SERP |

- **Validação automatizada desta continuidade:** 63 testes direcionados
  Radar/R3/R4/R5/R6/R7, envelope, contratos DataForSEO e Workbench passaram;
  ESLint dos arquivos alterados passou com avisos preexistentes, o guardião
  visual passou e `git diff --check` não encontrou erro de whitespace.
  `tsc --noEmit` permanece bloqueado pelos quatro erros globais conhecidos em
  `lib/minerador/keyword-qualification.ts` e nas três regex TS1501 de
  `tests/agency-adalba-platform-internal.test.mts`; nenhum erro novo do Radar
  foi encontrado.
- **Gates desta tarefa:**
  `SERP_SAME_PAGE_FLOW=IMPLEMENTED_LOCAL`;
  `COMPETITOR_SELECTION=IMPLEMENTED_TESTED`;
  `ANALYSIS_USES_SELECTED_COMPETITORS=IMPLEMENTED_TESTED`;
  `HUMAN_REVIEW=IMPLEMENTED_TESTED`;
  `APPROVED_REVIEW_MATCHES_SELECTION=IMPLEMENTED_TESTED`;
  `SERP_APPROVAL_REMOTE_WRITE=IMPLEMENTED_NOT_SMOKED`;
  `SERP_APPROVAL_READBACK=IMPLEMENTED_NOT_SMOKED`;
  `COMPETITOR_SELECTION_RELOAD=NOT_VERIFIED`;
  `CURATION_PARITY=PASS_FOR_NORMAL_SERP_FLOW` e
  `CURATION_DETAIL_BUTTON_REQUIRED=NO`.
- **Remote/manual:** snapshot real, write/readback/reload/aprovação autenticados
  não foram executados nesta continuidade porque a sessão atual não exibiu
  um snapshot SERP disponível e não houve autorização para chamar DataForSEO.
  `REAL_DATAFORSEO_CALLS=0`, `REMOTE_WRITES=0`, `DATABASE_CHANGE_REQUIRED=NO`
  e `MIGRATIONS_CREATED=0`. A validação remota de seleção pós-F5 e aprovação
  permanece pendente.

## Gate real — correção de readback da curadoria — 2026-08-26

- **Correção implementada:** `WorkflowRepository.appendRadarAnalysis` agora
  normaliza `created_at`/`updated_at` para ISO antes de validar o `RadarItem`.
  O erro anterior de `Invalid ISO datetime` deixava a API incapaz de aceitar
  a análise apesar de o fluxo local estar correto.
- **Correção implementada:**
  `GET /api/editorial/radar-analysis` oferece readback autenticado e estreito
  por `brandId`, `articleId` e, opcionalmente, `versionId`. A resposta separa
  o `radarItemId` canônico (`row.id`/UUID do workflow) do
  `payloadRadarItemId` lógico (`radar:<articleId>`), preservando a distinção
  entre identidade técnica e editorial.
- **Correção implementada:** o POST retorna a identidade da linha criada;
  o cliente compara versão, marca, artigo, ArticleDNA, snapshot, hash,
  decisões orgânicas e seleção antes de declarar readback confirmado. Após
  reload, o hook `useRadarAnalysisReadback` reidrata as análises por artigo
  sem coletar SERP e atualiza o `row.id` canônico quando a linha remota está
  disponível.
- **Validação automatizada:** 63 testes direcionados Radar/R3/R4/R5/R6/R7,
  envelope, Workbench e DataForSEO passaram. `check:visual-system` passou;
  `git diff --check` não encontrou erro de whitespace. ESLint dos arquivos
  Radar alterados não apresentou erro; permanece apenas o aviso preexistente
  de `handleExpertEvidenceChange` não utilizado em `radar-page.tsx`.
  `tsc --noEmit` continua bloqueado somente por
  `lib/minerador/keyword-qualification.ts` e três regex TS1501 em
  `tests/agency-adalba-platform-internal.test.mts`.
- **Sessão manual:** Care Glow autenticada, `brandId=09762023-d0d4-4c24-b34e-d0fdfd43f891`,
  `articleId=group-11aenvf`, ArticleDNA v2,
  `articleDnaVersionId=d6aca87b-66e5-48ac-b8a2-7c7e10236fe4`, snapshot real
  DataForSEO v3 com 8 resultados. O reload não disparou coleta; a curadoria
  persistida/localmente recuperável reapareceu com 8 decisões pendentes.
- **Gate remoto ainda não homologado:** uma tentativa anterior de iniciar a
  curadoria recebeu resposta de gravação, mas terminou sem readback remoto
  confirmado antes desta correção; não foram feitas novas decisões, aprovação
  ou atualização DataForSEO. Portanto:
  `COMPETITOR_SELECTION_REMOTE_WRITE=ATTEMPTED_UNCONFIRMED`;
  `COMPETITOR_SELECTION_REMOTE_READBACK=NOT_VERIFIED`;
  `REAL_DATAFORSEO_CALLS=0`; `SERPER_CALLS=0`;
  `REMOTE_WRITES=1_ATTEMPTED_UNCONFIRMED`;
  `RADAR_SERP_OPERATIONAL=NOT_HOMOLOGATED`.
- **Limite externo:** a seleção A/B/C, aprovação, atualização única do
  snapshot, screenshots do fluxo completo e retomada do ExpertBrief/Telegram
  exigem confirmação imediata para novas ações remotas; não houve migration,
  schema/RLS, contrato compartilhado, commit, push ou deploy.

## Bug prioritário — estabilidade da seleção SERP — 2026-08-26

- **Auditoria concluída:** no Workbench, a caixa de seleção e o contador/ação
  não liam exatamente o mesmo caminho. A caixa consultava
  `model.references`, enquanto a contagem e `Analisar selecionadas` usavam os
  selectors de `serp-curation.ts`. A seleção agora é projetada uma única vez
  por resultado em `buildRadarSerpSelectionProjection`; a projeção também
  deriva o papel editorial, a seleção e as chaves elegíveis.
- **Mapa de fontes:**
  `UI_SELECTION_SOURCE=buildRadarSerpSelectionProjection(...).rows[].selected`;
  `ACTION_ENABLE_SOURCE=radarAnalysisCandidates(...)`, derivado da mesma
  projeção, combinado somente com `onAnalyzeSelected`, ação em andamento e
  revisão. `persistSerpDecision`, contagem, análise, revisão e aprovação
  recebem o mesmo escopo explícito de marca, artigo e ArticleDNA, além do
  snapshot compatível, sem misturar estados de outra linha.
- **Identidade e escopo:** a decisão persistida histórica
  `organic:<position>` foi preservada por compatibilidade. A projeção só é
  compatível com o snapshot atual; o React key inclui `snapshotId`, posição e
  URL. O Workbench só recebe a análise depois de conferir `brandId`,
  `articleId`, `articleDnaVersionId`, snapshot, versão e hash.
- **Readback stale:** `lib/radar/analysis-readback.ts` adiciona revisão de
  request, contador de writes em andamento e fingerprint de `row.id`,
  `brandId`, `articleId`, `articleDnaVersionId`, `lockVersion`, snapshot
  (id/versão/hash) e versões da análise. Hidratação antiga não pode
  sobrescrever uma escrita/interação posterior; `lockVersion` remoto também
  não regride o estado local. A hidratação é rearmada apenas quando muda a
  marca/snapshot, artigo ou versão do ArticleDNA, não a cada render.
- **Mutabilidade/memoização:** a projeção é pura; `Map`, `Set` e arrays usados
  pela seleção são novas referências ou somente leitura. O estado de
  sincronização fica restrito a `useRef`; não há `React.memo` ou selector
  memoizado mantendo uma seleção antiga. As dependências do callback incluem
  o workspace que fornece a identidade e a chave de hidratação inclui a
  unidade canônica do artigo.
- **Testes automatizados:** 69 testes direcionados Radar/R3/R4/R5/R6/R7,
  envelope, DataForSEO, Workbench e readback passaram. Foram incluídos testes
  de igualdade entre seleção visível/canônica/eligibility, classificação de
  formato, imutabilidade em dez ciclos, troca de artigo/snapshot, requests
  concorrentes e readback obsoleto.
- **Validação local:** ESLint dos arquivos de implementação passou sem erro
  (permanece o aviso preexistente de `handleExpertEvidenceChange`; arquivos
  `.mts` são ignorados pela configuração). `check:visual-system` passou e
  `git diff --check` passou. `tsc --noEmit` continua bloqueado somente por
  `lib/minerador/keyword-qualification.ts` e pelas três regex TS1501 em
  `tests/agency-adalba-platform-internal.test.mts`.
- **Browser/remote:** a reprodução autenticada de dez ciclos não foi
  executada nesta correção, pois cada decisão do Workbench chama write/readback
  remoto e o gate do anexo determina interromper o smoke enquanto a
  estabilidade não estiver homologada. Não houve DataForSEO, Serper ou nova
  escrita remota nesta tarefa.
- **Relatório do gate:**
  `SERP_SELECTION_BUG_REPRODUCED=REPORTED_CODE_PATH_DIVERGENCE; BROWSER_NOT_REPRODUCED`;
  `VISIBLE_SELECTED_COUNT=2` e `CANONICAL_SELECTED_COUNT=2` na fixture;
  `ACTION_ENABLE_SYNC=PASS_LOCAL_TESTS`;
  `TEN_CYCLE_BROWSER_TEST=NOT_EXECUTED`;
  `NO_RESTART_REQUIRED=PASS_FOR_LOCAL_STATE_GUARD`;
  `SERP_SELECTION_STABILITY=IMPLEMENTED_AND_LOCALLY_TESTED; BROWSER_NOT_VERIFIED`;
  `READY_TO_RESUME_REMOTE_SMOKE=NO`.

## Correção urgente — foco da linha versus seleção coletiva — 2026-08-27

- **Contrato canônico implementado:** `focusedArticleId` representa somente o
  `articleId` do artigo aberto no Workbench; `selectedArticleIds` representa
  somente os artigos marcados para operações em lote. O `OperationalDataGrid`
  mantém seu estado interno de checkbox como `bulkSelected` por `row.id` e o
  Radar converte esse retorno para `articleId`, sem unificar os estados.
- **Clique isolado:** a linha normal chama apenas o foco contextual; checkbox
  de linha e checkbox do cabeçalho interrompem `pointerdown`/`click` antes do
  handler da linha e alteram somente a seleção coletiva. O chevron também
  interrompe propagação e conserva sua expansão explícita, sem alternar o
  checkbox.
- **Contexto correto:** o Workbench é resolvido por `focusedArticleId` e
  transformado no `row.id` técnico apenas para destacar a linha correta. A
  Bulk Bar continua recebendo exclusivamente as linhas entregues pelo estado
  de checkbox do grid. Navegação adjacente, fila e revisão individual também
  passam a gravar o `articleId` canônico.
- **Visual:** o foco não usa mais a superfície forte `bg-selected` no Radar;
  usa borda lateral contextual, superfície discreta e o rótulo pequeno
  `Em foco`. A seleção em lote usa o checkbox e uma superfície complementar
  semântica `positive-soft`. Os consumidores anteriores do grid preservam os
  defaults por compatibilidade.
- **Testes automatizados:** 69 testes direcionados Radar/R3/R4/R5/R6/R7,
  envelope, DataForSEO, Workbench e readback passaram, incluindo asserções
  estáticas para identidades distintas, propagação, classes de estado e
  dependências separadas. ESLint dos dois arquivos de implementação passou
  sem erro; permanece o aviso preexistente de
  `handleExpertEvidenceChange` não utilizado.
- **Validação local:** `pnpm run check:visual-system` passou no conjunto
  oficial de quatro arquivos; `git diff --check` passou. A varredura direta
  de `radar-page.tsx` ainda encontra classes não semânticas preexistentes nas
  áreas legadas de análise/revisão (linhas 681 e 688), não introduzidas por
  esta correção. `tsc --noEmit` continua bloqueado pelos quatro erros globais
  já conhecidos: `lib/minerador/keyword-qualification.ts` e três regex TS1501
  em `tests/agency-adalba-platform-internal.test.mts`.
- **Browser:** não foi possível executar os seis cenários físicos nesta
  continuidade porque não há conector de navegador/Chrome disponível no
  ambiente atual. Portanto, propagação real, centro visual do checkbox, área
  vazia, chevron e ausência de restart permanecem `NOT_VERIFIED` no navegador.
- **Remoto:** a correção não chama provider, não grava SERP, não usa
  ExpertBrief/Telegram e não altera schema, RLS, migration ou persistência
  remota. Não houve DataForSEO, Serper, escrita remota, commit, push ou deploy.
- **Aceite local:**
  `ROW_CLICK_FOCUSES_ARTICLE=PASS_LOCAL_STATIC`;
  `CHECKBOX_CLICK_SELECTS_BULK=PASS_LOCAL_STATIC`;
  `CHECKBOX_DOES_NOT_TRIGGER_ROW=PASS_LOCAL_STATIC`;
  `ROW_DOES_NOT_TOGGLE_CHECKBOX=PASS_LOCAL_STATIC`;
  `FOCUSED_ARTICLE_INDEPENDENT_FROM_BULK=PASS_LOCAL_STATIC`;
  `WORKBENCH_USES_FOCUS=PASS_LOCAL_STATIC`;
  `BULK_BAR_USES_CHECKBOX_SELECTION=PASS_LOCAL_STATIC`;
  `FOCUS_VISUAL_NOT_CONFUSED_WITH_BULK_SELECTION=PASS_LOCAL_STATIC`;
  `NO_RESTART_REQUIRED=IMPLEMENTED_LOCAL; BROWSER_NOT_VERIFIED`.

## Correção do modelo de seleção da planilha — 2026-08-27

- **Implementado:** o estado local canônico do Radar agora acopla
  `selectedArticleIds[]` e `activeArticleId`: qualquer artigo aberto no
  Workbench está marcado e qualquer conjunto de checks mantém um artigo ativo.
  Checkbox e clique normal de linha selecionam e ativam o mesmo `articleId`;
  a multiseleção preserva todos os checks e muda apenas o contexto ativo.
- **Transições:** desmarcar uma linha não ativa conserva o Workbench; desmarcar
  a ativa escolhe a última seleção restante; desmarcar a última esvazia o
  Workbench. Marcar o cabeçalho seleciona as linhas visíveis com ativo
  determinístico e desmarcá-lo limpa todo o conjunto. O chevron continua
  restrito à expansão de perfil.
- **Limites preservados:** a correção é front-first e local: não alterou SERP,
  curadoria, DataForSEO, ExpertBrief, Telegram, schema, RLS, migration ou
  contratos remotos. Não cria versão e não faz chamada externa.
- **Testado localmente:** 74 testes direcionados Radar/R3/R4/R5/R6/R7,
  envelope, DataForSEO, Workbench, readback e seleção da planilha passaram.
  O teste novo cobre checkbox/linha, multiseleção, cabeçalho, fallback ao
  desmarcar o ativo, limpeza final e rejeição dos estados impossíveis.
  ESLint passou sem erro (permanece o aviso preexistente de
  `handleExpertEvidenceChange`), `check:visual-system` oficial passou e
  `git diff --check` passou. `tsc --noEmit` continua bloqueado somente por
  `lib/minerador/keyword-qualification.ts` e pelas três regex TS1501 em
  `tests/agency-adalba-platform-internal.test.mts`.
- **Validação visual:** a mudança reutiliza tokens semânticos e o guardião
  oficial aprovou. O script auxiliar referido pela skill visual não existe no
  checkout; portanto não há uma segunda varredura específica a declarar.
- **Ainda a validar:** a homologação autenticada dos sete passos da planilha
  permanece pendente: o navegador disponível não tem aba/sessão autenticada e
  não há servidor local em escuta. Não foi iniciado ou reiniciado servidor,
  nem foi acionado provider.

## SERP — subnavegação contextual do processo — 2026-08-27

- **Implementado:** a expansão SERP agora concentra Coleta, Concorrentes,
  Análise, Evidências, Revisão e Histórico em subabas contextuais locais. A
  seleção e a análise continuam vinculadas ao snapshot/artigo atual; trocar
  artigo remonta o painel com a etapa sugerida para o novo contexto.
- **Limites preservados:** nenhuma subaba cria rota, versão, persistência,
  chamada DataForSEO ou aprovação automática. Ações de coleta, análise e
  revisão preservam seus handlers explícitos; Anterior/Próxima pendente foram
  rebaixados para Revisão.
- **Evidências:** a visão separa SerpEvidence, ExternalEvidence,
  ExpertEvidence e ProductEvidence sem criar schema, inferir URL como
  evidência ou persistir ExternalEvidence.
- **Testado localmente:** 69 testes direcionados Radar/R3/R4/R5/R6/R7,
  DataForSEO, curadoria, Workbench, fila e subnavegação passaram. A nova
  cobertura valida as seis subabas, status compacto, nextSerpStep, estado de
  análise reaberta, ausência de rota/provider pela navegação e permanência da
  aprovação na Revisão. ESLint passou sem erros, check:visual-system e
  git diff --check passaram.
- **TypeScript:** tsc --noEmit permanece bloqueado por problemas globais fora
  desta frente: lib/minerador/keyword-qualification.ts, três regex TS1501 em
  tests/agency-adalba-platform-internal.test.mts e o import ausente já
  presente em modules/planejador/index.ts.
- **Pendente:** validação autenticada dos doze passos de navegação SERP e
  confirmação visual responsiva. Não há servidor local em escuta nem aba/sessão
  autenticada disponível; nenhum processo foi iniciado ou reiniciado e não
  houve chamada de provider nesta tarefa.

## Homologação autenticada da curadoria SERP — 2026-08-27

- **Validado manualmente no navegador autenticado:** no artigo `Cobrir com
  clareza o tema “marketing online”.`, as quatro decisões pendentes foram
  concluídas com motivo específico baseado em título, domínio, formato e
  intenção observados: posições 6 (FGV), 8 (Programa Avançar), 9 (Mundo do
  Marketing) e 10 (Quero Bolsa) ficaram como `Ignorado`. A tela passou a
  mostrar 4 concorrentes selecionados e 0 pendências, inclusive após F5.
- **Curadoria e análise:** o produto informou write e readback na alteração de
  cada decisão; após a análise explícita, o painel registrou 4 referências
  selecionadas/analisadas, 2 necessidades, 2 lacunas e 2 conflitos. A
  navegação de Coleta, Concorrentes, Análise, Evidências, Revisão e Histórico
  foi conferida no mesmo contexto do artigo. Isso confirma a preservação
  visual da seleção e que a análise usa a amostra humana; não substitui uma
  leitura independente do banco.
- **Aprovação — bloqueio real:** a ação `Aprovar SERP` respondeu com write e
  readback confirmados e o Histórico reidratado mostra `Revisão atual:
  approved`. Contudo, após F5 a subaba Revisão mostra `Aprovação local não
  confirmada`, pois o cliente está em `serpPersistenceMode=local_fallback`.
  Portanto, a aprovação remota não pode ser declarada confirmada por este
  smoke; não foi repetida uma escrita append-only apenas para mascarar o gate.
- **Diagnóstico no código:** o carregamento operacional só marca o conjunto
  como `server` quando snapshot e reviews remotos estão simultaneamente
  disponíveis. A recuperação local conserva a revisão para continuidade, mas
  não pode provar a leitura remota. A extensão do navegador bloqueou a
  navegação direta ao endpoint JSON (`ERR_BLOCKED_BY_CLIENT`) e não expõe o
  resultado da requisição interna; não houve leitura de cookies, bypass de
  autenticação, SQL, schema, migration ou RLS.
- **Gates deste smoke:** `HUMAN_CURATION_DELEGATED=YES`;
  `PENDING_RESULTS_REVIEWED=4`;
  `COMPETITOR_SELECTION_RELOAD=PASS_VISIBLE`;
  `CURATION_CHANGE_REOPENS_ANALYSIS=PASS`;
  `ANALYSIS_USES_SELECTED_COMPETITORS=PASS`;
  `SERP_APPROVAL_RELOAD=FAIL_REMOTE_CONFIRMATION`;
  `RADAR_SERP_OPERATIONAL=BLOCKED`;
  `REAL_DATAFORSEO_CALLS=0`; `SERPER_CALLS=0`.
- **Limite:** ExternalEvidence e a atualização única DataForSEO permanecem
  bloqueadas até uma confirmação remota verdadeira da aprovação após reload.
- **Regressão local desta continuidade:** 63 testes direcionados Radar/R3/R4/
  R5/R6/R7, curadoria, DataForSEO, Workbench, fila, subnavegação e readback
  passaram. ESLint direcionado, `check:visual-system` e `git diff --check`
  passaram; o checkout preexistente e suas alterações não relacionadas foram
  preservados.
