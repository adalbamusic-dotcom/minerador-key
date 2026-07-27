# Estado atual — Radar

> **Estado documental vigente — 2026-07-27:** as rotas atuais são `app/(brand)/[brandRef]/radar/page.tsx` e `app/(brand)/[brandRef]/radar/[articleId]/page.tsx`; a referência posterior a `/{brandUserId}/radar` é alias histórico. O Radar consome ArticleDNA e evidências recebidas, não reagrupa keywords nem troca principal. O provider Serper está integrado server-side; os testes automatizados usam fixtures; nenhuma coleta real autenticada foi validada; a persistência remota depende da migration `0003_radar_serp_snapshots.sql` e de validação manual; o fallback local não é persistência remota.

## Regra compartilhada — 2026-07-21

O item Radar já recebe `arquitetoStrategyContext` opcional; a extensão permanece compatível com ArticleDNA antigo. A validação local confirma transferência de referências e contexto, sem SERP real, provider externo ou escrita remota.

- **Última atualização:** 2026-07-20.
- **Implementado:** provider Serper server-side, normalização de resultados, diagnóstico determinístico, timeout, erros explícitos, hash e versionamento.
- **Implementado:** `POST /api/editorial/serp` com autenticação, autorização por marca/módulo, resolução server-side da keyword e ações de coleta/revisão.
- **Implementado:** UI com ação separada `Coletar SERP` e `Simular`, histórico de snapshots, PAA, related searches, diagnóstico e decisão humana.
- **Implementado:** recuperação local por marca e tentativa de persistência remota append-only.
- **Implementado:** Planejador recebe referência de SERP somente quando a pesquisa real foi aprovada.
- **Persistência remota:** depende da aplicação manual de `supabase/migrations/0003_radar_serp_snapshots.sql`; a migration não foi executada por esta tarefa.
- **Configuração:** a presença/validade da chave em `.env.local` não foi confirmada por chamada real; nenhuma chave foi impressa, registrada ou reutilizada.
- **Chamada paga:** nenhuma consulta real à Serper foi executada automaticamente. Os testes usam `fetch` mockado.
- **Testes confirmados:** 16 testes específicos do Radar e 103 regressões editoriais passam, incluindo persistência/fallback, navegação, hidratação, envelope cliente→rota, provider Serper, pipeline editorial, fluxo operacional e domínio do Arquiteto; TypeScript, build, lint direcionado do escopo Radar e `git diff --check` passam. O lint amplo do monólito do Arquiteto ainda contém falhas legadas de `any`/React Compiler.
- **Correção de hidratação implementada:** o Radar agora recebe um snapshot aditivo de keyword/silo no import do Arquiteto, reconcilia itens antigos sem hidratação no reload, aceita aliases `pub-k-*` e resolve a keyword no servidor por vínculo canônico e marca.
- **Causa comprovada da falha anterior:** `/api/inteligencia` excluía keywords com `lista_id` nulo embora o Arquiteto as incluísse; o import persistia somente IDs; e os resolvers cliente/servidor exigiam igualdade literal e não reconheciam o alias publicado. Isso produzia simultaneamente `Keyword não hidratada`, `Keyword pendente` e coleta desabilitada.
- **Causa comprovada da falha UUID:** `lookupIds` ainda continha `pub-k-ddf1581f-60d6-4131-a8a6-90c6365f5acc` quando chegava a `.in("id", lookupIds)` em `keywords_kgr`; essa coluna é UUID. A mesma validação foi aplicada a `briefings_artigos.id` e `listas_kgr.id`.
- **Consumo Serper:** por ordem do fluxo, a resolução do artigo/keyword e as consultas UUID ocorrem antes de `collectSerperSnapshot`; a falha UUID observada não alcançou a chamada externa. Nenhum log ou teste desta correção executou a Serper real.
- **Fallback SERP implementado:** quando os repositórios editoriais ou a migration remota não estão disponíveis, a rota usa o ArticleDNA e o envelope editorial hashado enviados pelo workspace, mantém autenticação, validação de marca e gates de conflito, coleta a SERP real no servidor e retorna `persistenceMode: local`; o snapshot é incorporado e salvo na recuperação local antes de informar sucesso.
- **Navegação corrigida:** `Abrir no Radar` expande o detalhe local com SERP, PAA, relacionados, diagnóstico, histórico e revisão. `Ver no Arquiteto` é a ação separada; o deep-link é consumido uma vez, compara Sets antes de atualizar e remove `articleId` da URL depois de resolver.
- **Erros estruturados:** configuração ausente, migration/tabela ausente, conexão indisponível, não autenticado, permissão negada, provider e timeout não compartilham mais uma mensagem genérica.
- **Validação visual pendente:** o navegador local não possuía sessão/marca autorizada nesta execução; portanto o artigo real ainda precisa ser conferido manualmente na planilha do Radar após login.
- **Limitação atual:** a confirmação end-to-end ainda requer uma execução manual autenticada, com uma única keyword, depois que a migration for aplicada ou o fallback local for conscientemente aceito.
- **Limitação atual:** classificação de tipo, intenção, entidades e conflitos é heurística determinística; exige revisão humana.
- **Limitação atual:** fontes externas e originalidade fora da SERP real continuam sem provedor próprio integrado.
- **Correção da fronteira editorial:** a UI do Radar não envia mais `hydration` como única recuperação. Antes de `collect` ou `review`, o cliente monta `RadarSerpResolutionEnvelope` com `schemaVersion`, `radarItemId`, versão/hash do ArticleDNA, keyword principal textual, alias/canonical/source IDs, silo, origem Arquiteto→Radar e `snapshotHash` SHA-256.
- **Validação server-side:** o Route Handler revalida o hash, marca, artigo, item Radar, versão do ArticleDNA, papel principal e vínculo da keyword. Divergências entre envelope, ArticleDNA ou keyword canônica remota bloqueiam antes de `collectSerperSnapshot`.
- **Resolução registrada:** `resolutionMode` distingue `remote_canonical` de `local_recovery`; `canonicalRemoteVerified` fica persistido no `SerpCollectionRecord` e no `SerpResearchSnapshot`. A fonte remota vence quando encontrada; o envelope textual só é usado quando a resolução canônica não está disponível e os gates locais permanecem válidos.
- **Causa comprovada da falha de hidratação anterior:** a tabela renderizava o texto por `pipeline.snapshot.keywords`, mas o POST enviava apenas `row.hydration`; para o artigo antigo essa hidratação era nula. O servidor recebia ArticleDNA e nenhum texto editorial, falhando antes do provedor com a mensagem de keyword ausente.
- **Testes da fronteira:** `tests/radar-resolution-envelope.test.mts` cobre serialização cliente→rota, alias `pub-k-ddf1581f-60d6-4131-a8a6-90c6365f5acc`, hash adulterado, texto técnico e conflito remoto. Nenhuma chamada Serper real foi feita.

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

## Fechamento de usabilidade e coerência — 2026-07-21

- Estados de investigação, publicação da versão e transferência ao Planejador foram separados na página própria. Itens orgânicos pendentes continuam impedindo a conclusão da investigação; envio anterior não conclui a versão atual.
- `plannerTransfer` registra a versão enviada sem substituir o pacote anterior nem duplicar artigo ou `ContentPlan`; a interface diferencia versão corrente, aprovada, enviada e atualização disponível.
- Canonical, URL estrutural e estado de publicação agora distinguem dado não recebido nesta etapa de ausência confirmada. Nenhuma URL é inventada; publicados permanecem protegidos e artigos novos apontam a revisão para o Arquiteto.
- Formatos SERP foram classificados. Apenas artigos editoriais completos entram no benchmark; vídeos, parciais e demais formatos ficam visíveis e explicitamente excluídos da amostra comparável.
- Semântica foi organizada em conteúdo relevante, navegação, legal e plataforma. Termos de ruído continuam visíveis e podem ser recuperados ou ignorados com nova versão de evidência.
- Arquivos principais: `components/radar/radar-analysis-page.tsx`, `lib/radar/analysis-contracts.ts`, `lib/radar/analysis-insights.ts`, `lib/radar/workflow-insights.ts`, `lib/radar/evidence-package.ts`, `tests/radar-usability.test.mts` e `tests/radar-navigation.test.mts`.
- Testes confirmados nesta rodada: 19 testes focados do Radar, `tsc --noEmit` e lint direcionado do escopo Radar. Nenhuma chamada real Serper, escrita remota, migration, commit ou deploy foi executada.
- Validação pendente: quatro cenários manuais (artigo novo, publicado, SERP pendente e atualização após envio) e uma única coleta Serper autenticada acionada explicitamente pelo usuário.
# Roteamento tenant — 2026-07-23
# Consolidacao fisica dos modulos - 2026-07-23
- Implementacao proprietaria consolidada em modules/radar; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

- Adicionado wrapper canônico `/{brandRef}/radar`; pesquisa, evidências e persistência existente foram preservadas.
