# Estado atual — Minerador

> **Estado documental vigente — 2026-07-27:** os blocos que descrevem 0005/0006 como “não aplicadas” são registros pré-aplicação. O resultado remoto posterior informa 0006 aplicada e `READY`; não reexecutar nem reverter 0005/0006. Persistem como pendências somente validação manual autenticada, RLS real e demais verificações explicitamente indicadas.

## Fotografia operacional datada — 2026-07-27

O relatório local da janela de tenantização registra 147 keywords, sendo 126 sem lista e 21 com lista, e 0 sem `brand_id`. Esta é uma fotografia operacional datada, não um invariante nem uma consulta remota executada nesta passada; divergência futura deve ser registrada antes de qualquer reconciliação.

## Implementação Site/Sitemap — 2026-07-21

- **Implementado localmente:** a ação explícita `Conferir com o site` carrega o workspace Site/Sitemap da marca ativa, monta prévia somente leitura e exige confirmação antes da importação.
- **Proveniência:** novas keywords recebem ID real, lista de destino, status `bruto`, métricas/intenção nulas e evidência versionada em `analise_semantica.site_origin`/`site_origins`.
- **Existentes:** preservam ID, status, métricas, intenção e DNA; a evidência é atualizada de modo aditivo e retorna `evidence_updated` ou `no_change`.
- **Dimensões separadas:** o Minerador exibe situação técnica da URL, publicação observada, relação keyword↔URL e situação arquitetural. Não forma artigo nem altera Arquiteto.
- **Proteções:** workspace inválido gera erro explícito; candidatos de outra marca, ignorados ou sem catálogo válido não entram na prévia; não há sincronização durante hidratação.
- **Testes locais:** `node --disable-warning=MODULE_TYPELESS_PACKAGE_JSON --test tests/marca-site.test.mts` passou 14/14. Não foram feitos `npm test`, escrita remota, migration, chamada de IA/SERP ou limpeza de armazenamento.
- **Limitações:** Supabase/RLS, browser autenticado, reload remoto e correções estruturais M-01–M-05 permanecem não verificados; a hidratação existente não foi reconstruída nesta integração.

## Regra compartilhada — 2026-07-21

A importação Site → `keywords_kgr` continua seletiva e idempotente, com IDs reais, status `bruto` e `analise_semantica.site_origin` contendo URL, catálogo, campos observados e coerência de slug. A qualificação real de KGR/volume/intenção e a validação de schema remoto continuam não verificadas nesta etapa.
- **Última auditoria:** 2026-07-20, leitura de código, testes locais e build; relatório em `docs/03-minerador/propostas/auditoria-de-saude-do-minerador.md`.
- **Funcionando no código:** importação CSV/manual, planilha, filtros, KGR, status, seleção, exportação, histórico, visões, extensão e KeywordDNA lógico.
- **Confirmado por teste:** `test:arquiteto` 48/48, `test:operational` 49/49, `test:editorial` 20/20, `test:authz` 4/4, sintaxe da extensão, `git diff --check` e `npm run build`.
- **Parcial:** integração KeywordDNA → Arquiteto; a leitura é remota/legada, mas a decisão de importação é mantida em índice local por marca.
- **Risco confirmado no código:** keywords sem lista podem entrar em qualquer marca; o carregamento executa deduplicação, atualização de nicho e persistência de DNA; alguns lotes não confirmam erro por item.
- **Risco de workflow:** importação manual aceita `publicado` diretamente e a ação em massa não exige silo/aprovação anterior.
- **Local:** seleção, histórico em memória, visões em `localStorage`, índice `architectImportedKeywordIds` e recovery do pipeline por marca.
- **Persistido no código:** `listas_kgr`, `keywords_kgr`, `briefings_artigos` e marcas são acessados; schema remoto, RLS e triggers instalados ainda não foram verificados.
- **Externo/simulado:** volume, análise semântica, nicho/intenção, briefing, Google Autocomplete e Google Sheets dependem de APIs externas; não foram chamados nesta auditoria.
- **Última validação manual:** ainda não verificada.
- **Bloqueado:** snapshot/SQL remoto, browser autenticado, extensão carregada e correções estruturais aguardam execução/autorização do usuário.
- **Arquivos centrais:** `app/(brand)/[brandRef]/minerador/page.tsx`, `minerador-extensao/background.js`, `minerador-extensao/popup.js`.
- **Diferença spec/implementação:** módulo funcional e monolítico como aprovado, mas com divergências de escopo por marca, mutações no carregamento e transferência não persistida; não reconstruir nesta fase.
## Fase B - aplicabilidade KGR e consolidacao Site/Sitemap - 2026-07-22

- Implementado localmente: decisao humana `applicable`/`not_applicable`/`pending`, rotulo `SIM`/`NAO`/`PENDENTE`, origem, ator, data, versao, justificativa e historico em `analise_semantica`.
- Implementado localmente: medicao separada (`with_score`, `without_data`, `invalid`), filtros, ordenacao previsivel e exportacao com aplicabilidade separada da pontuacao numerica.
- Implementado localmente: `NÃO` nao e usado como score e volume/resultados/score nao sao apagados por uma decisao de inaplicabilidade.
- Removido do Minerador: botao, modal e handlers exclusivos de `Gerar Briefing (Silo)`; endpoint e consumidores proprietarios existentes foram preservados.
- Implementado localmente: conferencia Site/Sitemap no rodape operacional e consolidacao aditiva de URL, resolved URL, canonical, publicacao e silo existente escolhido (`siloId`/`siloName`). Nenhum silo novo, slug ou identidade publicada e inferido.
- Testes locais: fixtures KGR, Marca/Site e contrato Site/KGR passaram; `npx tsc --noEmit` passou. Browser autenticado, Supabase/RLS e persistencia remota permanecem nao verificados.
- Nao executados: migration, escrita remota, chamadas de IA/SERP/API paga, limpeza de storage, commit, push ou deploy.
## Fase B.1 - correcoes de fluxo e interface - 2026-07-22

- Causa confirmada da perda de contexto: `fetchData()` era chamado apos a qualificacao, reativava loading, substituia a colecao, redefinia `targetListId`, limpava `selectedIds` e ocultava a posicao de trabalho. A hidratacao inicial tambem nao tinha deduplicacao de requests em voo.
- Corrigido localmente: qualificacao, importacoes e mutations atualizam somente linhas afetadas; selecao, busca, filtros, ordenacao e linha expandida sao preservados quando aplicavel. O carregamento inicial e deduplicado por marca/sessao/token.
- Corrigido localmente: `Conferir com o site` foi colocado na barra inferior e filtra candidatas pelo conjunto selecionado; a previa e confirmacao permanecem explicitas.
- Corrigido localmente: KGR e Intencao sao somente informativos na tabela. Decisoes KGR sao em massa e a aprovacao bloqueia itens sem medicao valida.
- Implementado localmente: painel recolhivel `Organizar`, contador, limpeza de filtros e taxonomia de intencao retrocompativel.
 - Limitacao: mutacoes de hidratacao historicas (deduplicacao, nicho e DNA logico) permanecem existentes e nao foram reconstruidas nesta correcao pontual; nao houve browser autenticado ou escrita remota.

## Fase B.2 - qualificacao de volume e preservacao de metadados - 2026-07-22
- Causa confirmada: `handleBatchQualify` tratava erro ou ausencia de item na resposta como `volume = null` e persistia `volume_search`, `kgr_score` e `volume_source`, permitindo apagar metricas validas.
- Corrigido localmente: falha HTTP, resposta invalida ou ausencia de medicao interrompe a qualificacao antes de qualquer update destrutivo; medicao valida altera somente volume, fonte real e KGR quando recalculavel.
- Corrigido localmente: `/api/volume` normaliza respostas, retorna somente mediacoes vinculadas e bloqueia explicitamente o endpoint `website-analyze-and-seo-audit-pro`/`aiseo.php`, que nao possui contrato de volume.
- Nao executado: chamada externa RapidAPI/Keywords Everywhere, browser autenticado, escrita remota fora do fluxo da aplicacao, migration, commit, push ou deploy.

## Fase B.3 - Google Keyword Insight - 2026-07-22
- Configurado localmente: `RAPIDAPI_HOST=google-keyword-insight1.p.rapidapi.com` e `RAPIDAPI_URL=https://google-keyword-insight1.p.rapidapi.com/keysuggest`.
- Chamada manual unica: `GET /keysuggest?keyword=seo%20para%20clinicas&location=BR&lang=pt`, URL registrada sem chave, HTTP `200 OK`.
- Resposta observada: array com objetos; keyword exata em `text`, volume em `volume`, e campos adicionais `competition_level`, `competition_index`, `low_bid`, `high_bid` e `trend`.
- Headers observados: `x-ratelimit-requests-limit=20` e `x-ratelimit-requests-remaining=18`; nenhum custo monetario foi informado pela resposta.
- Fixture anonimizada: `tests/google-keyword-insight-response.fixture.ts`. O payload nao informa campo de localizacao; portanto o resultado e tratado como volume solicitado para BR, sem afirmar comprovacao adicional no corpo.
- Nao executado: lote de producao, escrita remota, migration, commit, push ou deploy.

## Fase B.4 - Trending Insight sem volume - 2026-07-22
- Fixture literal recebido: array com `success`, `meta.keyword`, `meta.country`, `generatedAt`, `data.top` e `data.rising`; cada item possui `query` e `value`.
- Decisao implementada apenas no normalizador: `value` e tratado como indice de tendencia, nao como volume. A keyword solicitada sem campo de volume retorna erro estruturado e preserva todas as metricas existentes.
- `not_found` ocorre quando `meta.keyword` diverge da keyword solicitada; schema parcial ou invalido retorna erro. Nenhuma chamada externa, rota, front-end ou persistencia foi alterada nesta fase.

## Fase B.5 - Keyword Magic Tool - 2026-07-22
- Fixture representativa derivada da resposta 200 recebida: objeto `keyword_ideas[]`, keyword em `keyword` e volume em `search volume`.
- Implementado localmente somente no normalizador: correspondencia exata retorna volume; keyword ausente retorna `not_found`; volume invalido retorna `error`, sem gerar patch destrutivo.
- Metadados observados (`Keyword Difficulty %`, label, CPC e `Trend`) permanecem fora da persistencia atual e nao alteram `results_allintitle`.
- Limitacao: o payload nao informou metodo, query string nem corpo exigidos por `/searchby-country-url`; nenhuma chamada externa nem alteracao da rota foi realizada.

## Fase B.6 - SEO Keyword Research - 2026-07-22
- Configurado localmente: host `seo-keyword-research8.p.rapidapi.com`, endpoint `GET /keyword-research`, com `keyword` e `country=br`.
- Chamada manual unica: `GET /keyword-research?keyword=seo%20para%20clinicas&country=br`, HTTP `200 OK`; `result[0].keyword` correspondeu exatamente e `avg_monthly_searches` foi `10`.
- Headers observados: `x-ratelimit-requests-limit=25` e `x-ratelimit-requests-remaining=23`. Nenhum custo monetario foi informado pela resposta.
- Implementado localmente: normalizador fixture-based por correspondencia exata em `result[].keyword`/`avg_monthly_searches`; rota devolve `success`, `not_found` ou `error` por keyword e preserva resultados/KGR em falha.
- Nao executado: lote de producao, browser autenticado, escrita remota, migration, commit, push ou deploy.

## Fase B.3 complementar - hidratação, resultados existentes e barra - 2026-07-22
- Corrigido localmente: a tabela nao mantem mais copia derivada em estado; a visao e calculada por `useMemo` diretamente de `keywords`, filtros, listas e ordenacao. O filtro inicial de status e `Todos`.
- Corrigido localmente: abrir/fechar `Organizar` nao altera a colecao exibida, nem completa metadados ou dispara chamada remota.
- Mantido: `results_allintitle` ja persistido e preservado; volume valido recalcula KGR somente quando o resultado existe. Nenhuma rota/provedor de resultados foi criado.
- Corrigido localmente: uma unica barra inferior integra contador, mover para silo, conferencia Site/Sitemap, qualificacao, decisao KGR, publicacao, processamento e exclusao.

## Fase B.4 — restauração da última organização - 2026-07-22

- Implementado localmente: a preferência `minerador-pro:last-view:<usuário>:<marca>:minerador` é lida fora do painel `Organizar`, apenas após usuário, marca e coleção local estarem resolvidos.
- Compatibilidade: o leitor é proprietário do Minerador, reutiliza a chave e os valores existentes, adapta status legados e rejeita valores inválidos sem remover itens de `localStorage`.
- Interface: o botão exibe os critérios ativos pelo nome, como `Publicados`; abrir ou fechar o painel não aplica nem recalcula a organização.
- Não alterado: volume, `results_allintitle`, cálculo KGR, persistência do domínio, Supabase, migrations e componentes compartilhados.
- Complemento: a restauração usa chave hidratada explícita, ocorre uma vez por identidade e apresenta estado breve antes da pintura; a persistência compara o conteúdo antes de gravar. O resumo mostra até três filtros em ordem estável e expõe todos no tooltip quando truncado.

## Métricas independentes da aplicabilidade KGR - 2026-07-22

- Corrigido localmente: medição não depende mais de `kgr_score` ou da aplicabilidade. Estados: Sem medição, Parcial, Completa e Inválida.
- Interface: detalhe separado em Métricas, Estratégia KGR e Decisão humana; `Não aplicável` não oculta volume/resultados e mostra pontuação não utilizada.
- Mantido: decisão humana não altera `volume_search`, `results_allintitle` ou `kgr_score`; Arquiteto não foi alterado.

## Política da keyword principal publicada - 2026-07-22

- Implementado localmente: `locked`, `reviewable` e `free` em metadado aditivo; publicado legado é travado por padrão.
- Interface: badge de política e bloco Identidade publicada, com ação humana confirmada para alternar travada/revisável sem tocar URL, slug, canonical ou keyword.
- Contrato: o normalizador aditivo do Arquiteto recebe política e contexto, mas não foi alterada a formação de artigos nem há substituição automática.

## Coleta `allintitle` pela extensão — 2026-07-22

- Implementado localmente: ponte conectada explicitamente pelo popup na aba do Minerador, disponibilidade detectável, lote limitado (padrão 5, máximo 10), uma aba Google reutilizável e uma consulta por vez.
- Implementado localmente: parser fixture-based para contagem internacional/portuguesa, zero explícito, ausência, CAPTCHA, consentimento e bloqueio; CAPTCHA/bloqueio pausa o lote e oferece retomar ou cancelar.
- Implementado localmente: prévia antes de persistir, exclusão individual de resultados, patch localizado de `results_allintitle` com proveniência em `analise_semantica` e recálculo de KGR somente quando permitido.
- Permissões novas: `scripting`, `https://www.google.com/*` e `https://www.google.com.br/*`, justificadas somente para injetar o leitor na aba de medição. Não há permissão global para o painel.
- Pendente: usuário recarregar a extensão e executar o roteiro manual autenticado; não foram feitas buscas reais ao Google, escrita remota, migration, limpeza de storage, commit, push ou deploy.

### Correção do fluxo individual — 2026-07-23

- Implementado localmente: uma keyword não monta a prévia de lote. A extensão precisa estar disponível antes da solicitação; ausência mostra instrução compacta e não abre Google nem altera métricas.
- Implementado localmente: `success` e `zero_results` de uma keyword validam marca, ID, texto e seleção antes de atualizar somente a linha confirmada. CAPTCHA mantém controles compactos de retomar/cancelar; bloqueio, ausência e erro preservam dados.
- Mantido: duas ou mais keywords usam a prévia com confirmação humana, sem reload, sem `fetchData()` e sem alteração do provedor de volume.

### Correção localizada — handshake da extensão com a aba do Minerador — 2026-07-23

- Implementado localmente: o popup, service worker, bridge e `/minerador` agora concluem conexão somente após `ping` e ACK da página com `requestId`, origem, módulo e versão do protocolo conferidos.
- Sessão: a confirmação é registrada apenas em `chrome.storage.session`, vinculada a `tabId`, origem, `minerador`, versão `1` e data; sessão antiga não é aceita sem novo ping e o fechamento da aba remove o registro.
- Segurança: somente `http://localhost:3000/minerador`, `http://127.0.0.1:3000/minerador` e origem de produção configurada explicitamente podem conectar. Falha de ping/ACK bloqueia a abertura do lote e qualquer navegação ao Google.
- Interface: popup informa desconectado, verificando, conectado, incompatível ou conexão perdida sem falso sucesso. A página permanece sem barra fixa adicional.
- Não validado nesta execução: extensão carregada no Chrome e handshake manual autenticado; não houve consulta Google, escrita remota, migration, limpeza de storage, commit, push ou deploy.

### Correção diagnóstica — allintitle e volume zero — 2026-07-23

- Causa localizada no código: após o handshake, o controlador reduzia falhas de navegação, injeção e reader a `measurement_error`; a espera de navegação não comprovava que o `complete` pertencia à consulta solicitada.
- Corrigido localmente: etapas diagnósticas versionadas, URL de busca confirmada, timeout explícito, reader no frame principal e falhas específicas como `unexpected_navigation`, `reader_injection_failed` e `reader_no_response`.
- Interface: falhas de allintitle/extensão/volume permanecem até fechamento ou nova ação, mostram etapa/código e permitem copiar o diagnóstico ou repetir a seleção, sem stack trace.
- Volume: `0` só é aceito quando `result[].keyword` corresponde exatamente e `avg_monthly_searches` é um número JSON explícito igual a zero. Campo ausente, nulo, texto ou sugestão não cria patch.
- Limitação: a coleta real no Google continua pendente de validação manual; nenhuma consulta externa foi executada.

### Correção localizada — destino do popup da extensão — 2026-07-23

- Causa confirmada: o botão do popup usava `PANEL_URL` literalmente. Uma configuração legada com `/admin/marcas` abria a rota incompatível antes da tentativa de conexão; o login da extensão não cria nem redireciona abas.
- Corrigido localmente: `PANEL_URL` é usado somente como origem e o botão **Abrir Minerador** sempre deriva `/minerador`. A conexão continua sem abrir, navegar ou alterar a aba ativa.
- Validação: `/minerador`, `/minerador/`, query e hash locais são aceitos; `/admin/marcas`, `/marca` e origens externas permanecem rejeitados. A mensagem informa a rota incompatível e orienta abrir o Minerador.
# Roteamento tenant — 2026-07-23

### Compatibilização com `keywords_kgr.brand_id` obrigatório — 2026-07-24

- Implementado localmente: o workspace do Minerador carrega listas por `marca_id` e keywords por `brand_id`, sem fallback para carregar todos os tenants quando não há marca ativa.
- Implementado localmente: imports CSV/manual, import Site/Sitemap e criação de lista enviam o tenant explícito; atualizações e exclusões restringem `brand_id`; movimentação valida a lista de destino.
- Implementado localmente: `/api/analyze` e `/api/process-intent-niche` recebem a marca ativa, autorizam o tenant e atualizam a keyword com filtro de `brand_id`; `assertKeywordBelongsToMarca` usa `brand_id` também para keywords sem lista.
- Implementado localmente: preview e persistência Site/Sitemap filtram lista e keyword pelo tenant autorizado.
- Rollout: o código assume schema pós-0005 e não deve ser executado antes da migration. A ordem obrigatória é maintenance/read-only, snapshot/dry-run, migration, smoke test autenticado, deploy dos consumidores e desbloqueio.
- Fora do escopo: Arquiteto, Radar, Planejador e `app/api/inteligencia`/`app/api/editorial/serp` foram auditados e permanecem para rodada proprietária separada.
- Não validado: migration remota, RLS remoto, browser autenticado, smoke test remoto, commit, push, deploy e chamadas pagas de IA.
# Consolidacao fisica dos modulos - 2026-07-23
- Tenantizacao 0005 - endurecimento final local - 2026-07-24: `CAUSA NAO COMPROVADA`; o escritor legado sem filtro de tenant e compativel com o incidente, mas nao existe prova local de clique ou de execucao.
- Implementado localmente na infraestrutura compartilhada: lock com timeout de 10 segundos antes de qualquer snapshot ou escrita, sem desabilitar triggers.
- Implementado localmente: guard transacional somente com `keywords_kgr.id` e `lista_id`, seguido de comparacao exata por `FULL JOIN`/`IS DISTINCT FROM` antes do `COMMIT`.
- Garantia: o backfill altera apenas `brand_id`; `lista_id` permanece nullable e os totais atuais esperados sao 147 keywords, 126 sem lista e 21 com lista.
- Dry-run e snapshot manual continuam somente leitura; backups preservados sao reportados sem restauracao.
- Rollback continua assistido e nao altera `lista_id` nem restaura linhas completas de keywords.
- Migration nao aplicada, SQL remoto nao executado, browser autenticado nao validado e aplicativo deve permanecer encerrado durante a janela controlada.

## Reconciliacao tenant 0006 - 2026-07-24

- Preparada localmente a migration `0006_reconcile_tenant_security.sql` para corrigir apenas seguranca pos-0005.
- Nenhum backfill sera repetido; keywords, `lista_id`, `brand_id`, owner, listas e memberships permanecem protegidos.
- O Minerador depende do schema pos-0005 e deve permanecer encerrado durante a janela de 0006.
- Validacao remota das funcoes, grants, policies e constraints ainda pendente; 0006 nao aplicada.

## FK canônica de lista — 2026-07-24

- Autorizada a consolidação de `fk_keywords_kgr_lista_0005` com `ON DELETE RESTRICT`.
- `keywords_kgr_lista_id_fkey` é tratada como legado `ON DELETE CASCADE`; a 0006 valida os atributos semânticos do catálogo antes de removê-la e exibe as definições textuais somente para diagnóstico.
- A precondição da 0006 aceita `search_path` normalizado como `public,pg_temp` ou `pg_catalog,public,pg_temp`; somente a pós-condição exige `pg_catalog,public,pg_temp`. O dry-run sinaliza reconciliação sem bloquear, enquanto a validation permanece bloqueada até a aplicação.
- `lista_id` permanece nullable e nenhuma keyword, lista, `brand_id`, owner ou membership é alterada.
- Auditoria local não encontrou exclusão direta de `listas_kgr` no Minerador ou no Arquiteto; o Arquiteto apenas desagrupa o silo na organização local.
- Migration, rollback e validação remotos continuam pendentes; aplicação exige revisão humana do dry-run.
- Implementacao proprietaria consolidada em modules/minerador; wrappers canonicos permanecem finos.
- Suite focada desta rodada: 212/212; browser autenticado, persistencia remota e build continuam pendentes.

## Resultado remoto da migration 0006 — 2026-07-24

- A 0006 foi aplicada remotamente; a transação principal foi consolidada e a validation pós-migration retornou `READY`.
- O erro `42P01` ocorreu somente no diagnóstico pós-`COMMIT`, porque `pg_temp.tenant_0006_snapshot` já havia sido removido por `ON COMMIT DROP`.
- Não há perda de dados reportada. Não reexecutar a migration e não executar rollback.
- O epílogo local foi corrigido para terminar imediatamente em `COMMIT;`, preservando as validações críticas antes do commit.

## Diagnóstico de acesso autenticado às listas — 2026-07-24

- Causa comprovada: o cliente browser do Minerador era criado apenas com a URL e a anon key; o `session.accessToken` do NextAuth não era enviado ao PostgREST.
- Correção: o Minerador passou a usar `lib/supabase/browser-authenticated-client.ts`, que envia o bearer da sessão sem service role; consultas continuam protegidas por sessão e `brand_id`.
- Nenhuma regra de RLS, grant, migration, keyword, `lista_id`, `brand_id`, owner ou membership foi alterada. A validação manual autenticada do Minerador ainda está pendente.
- Verificação local: 95 testes focados, TypeScript, build e `git diff --check` passaram; ESLint do factory/teste passou. O lint integral do workspace mantém erros legados de `any`/hooks, fora desta correção.

## Ciclo JWT NextAuth → Supabase — 2026-07-24

- Causa adicional corrigida: o bearer fixo expirava porque o callback JWT não guardava/renovava o `refresh_token` do Supabase; `session.accessToken` também podia carregar indevidamente um token Google.
- `session.accessToken` agora representa somente JWT Supabase. O token Google fica separado e é usado apenas no endpoint server-side de Google Sheets.
- O cliente browser consulta `getSession()` no momento da requisição, valida `sub`, `aud`, `role` e `exp`, aplica margem de 60 segundos e não devolve token vencido.
- Refresh Supabase ocorre no callback JWT server-side, com compartilhamento de uma única promessa por refresh token; falha gera `SUPABASE_TOKEN_REFRESH_FAILED`, sem fallback anon.
- SELECT tenantizado pode repetir uma vez após erro JWT expirado; escritas não são repetidas automaticamente. Smoke test autenticado ainda está pendente.

### Diagnóstico final da sessão NextAuth → Supabase — 2026-07-24

- Corrigida a classificação que mostrava “sessão expirou” para qualquer erro de autenticação. O Minerador agora diferencia `NEXTAUTH_SESSION_MISSING`, `GOOGLE_ID_TOKEN_MISSING`, `SUPABASE_GOOGLE_EXCHANGE_FAILED`, `SUPABASE_ACCESS_TOKEN_MISSING`, `SUPABASE_REFRESH_TOKEN_MISSING`, `SUPABASE_TOKEN_INVALID_CLAIMS`, `SUPABASE_TOKEN_EXPIRED` e `SUPABASE_TOKEN_REFRESH_FAILED`.
- O resultado do token é estruturado (`ok`, `token`, `reason`, `expiresAt`) e o log contém apenas diagnóstico seguro; nenhum JWT, cookie, refresh token, Authorization ou segredo é registrado.
- `SUPABASE_SESSION_READY` limpa erros antigos. A configuração remota do provider Google permanece requisito externo, não alterado nem testado por login real.
- O fluxo de login não redireciona ao Minerador quando `session.supabaseAuth.status` não é `ready`; falhas Google/Supabase interrompem o callback e exigem novo login.

- Adicionado wrapper canônico `/{brandRef}/minerador`; a implementação funcional permanece em `modules/minerador` e o contrato de cache por marca foi preservado.

## Marcas autenticadas e handshake v2 da extensão — 2026-07-24

- Implementado localmente: `/api/extensao/marcas` valida Bearer Supabase server-side, resolve a identidade pelo `sub` validado e retorna somente marcas com acesso ao Minerador.
- Implementado localmente: `/api/extensao/marcas/{brandId}/listas` revalida o token, a capacidade e o tenant, retornando apenas `listas_kgr` da marca autorizada.
- Implementado localmente: popup com Marca sempre visível, seleção automática para uma marca, dropdown para várias, estados persistentes de erro/zero marcas/retry e lista dependente da marca.
- Implementado localmente: rota contextual `/{brandRef}/minerador`; o popup trata `brandRef` como referência opaca e não o converte em `brandId`.
- Implementado localmente: handshake v2 com `actorUserId`, `activeBrandId`, `activeBrandRef`, acesso confirmado e sessão transitória por aba/marca. Divergência bloqueia mineração e allintitle.
- Implementado localmente: rate limit em memória de 60 requisições por usuário/minuto e logs estruturados sem tokens; proteção distribuída permanece pendente.
- Testes locais: TypeScript, sintaxe dos scripts da extensão, handshake/rota/contrato e tenant-routing. Login real, Chrome manual, Supabase autenticado, RLS, consulta Google, escrita remota e deploy permanecem não verificados.
## Diagnóstico do endpoint de marcas da extensão — 2026-07-24

- Correção local: o popup agora constrói a URL da API exclusivamente a partir da origem configurada em `PANEL_URL` e exige o prefixo `/api/extensao/`; não usa origem relativa da extensão, aba ativa ou rota legada.
- Correção local: respostas não-OK são lidas antes do erro e preservam `status`, `code`, `message` e `requestId`; a resposta server-side mantém `ok`, `code`, `message`, `error` e `requestId` sem expor token.
- Correção local: o popup mostra estados distintos para rede, token ausente/inválido, token expirado, identidade sem vínculo, acesso negado e falha interna, com retry e diagnóstico copiável sem JWT.
- Correção local: login da extensão conserva `access_token`, `refresh_token`, `expires_at` e `user_id`; token expirado tenta refresh Supabase uma única vez e, se falhar, exige novo login.
- Causa do teste manual ainda não comprovada: não houve Chrome autenticado disponível nesta execução; o popup anterior escondia a primeira resposta HTTP e o código retornado, impedindo distinguir rede, token e autorização.
- Pendente: executar o roteiro manual autenticado e registrar status HTTP, código, requestId e marca retornada; não declarar a lista real homologada antes dessa evidência.

## Preflight operacional da extensão — 2026-07-25

- Corrigida a divergência entre popup, `chrome.storage.session`, bridge e workspace: a sessão continua indexada por `tabId` e agora é comparada com ator, `brandId`, `brandRef`, origem, pathname canônico, módulo e protocolo antes do allintitle.
- O ACK v2 da rota contextual exige `requestId`, `actorUserId`, marca autorizada, `pathname` sem query/hash e `timestamp`; ACK incompleto ou divergente não grava sessão.
- O preflight retorna `connected`, `code`, `message` e `session`. Códigos preservados: `connected`, `session_missing`, `tab_mismatch`, `brand_mismatch`, `actor_mismatch`, `route_mismatch`, `protocol_mismatch`, `ack_timeout`, `bridge_unavailable` e `access_not_confirmed`.
- A marca carregada no popup não é apresentada como conexão; a conexão só é exibida depois de ACK v2 e a validação operacional da aba atual.
- O Minerador exibe a causa específica e oferece reconexão/tentativa, diagnóstico copiável e fechamento; falha de preflight não abre consulta Google nem altera métricas existentes.
- Validação local: 18 testes focados, sintaxe da extensão e TypeScript passaram. Chrome autenticado, service worker suspenso, múltiplas abas/marcas e consulta Google permanecem pendentes por não haver uma aba local autenticada disponível; nenhuma chamada externa foi executada.

## Correção do retorno terminal do allintitle — 2026-07-26

- Causa localizada no fluxo: `bridge_error` e `batch_completed` apenas alteravam o estado da extensão, mas não encerravam a execução individual; o retorno final também não carregava o mesmo `requestId` até o workspace. Reader sem resposta e callback vazio do bridge podiam deixar a interface sem uma conclusão explícita.
- Corrigido localmente: timeout por item e timeout total, resultado final com `requestId`, `keywordId`, `brandId`, etapa e código, reader com resposta estruturada mesmo em exceção, bridge com erro para callback vazio e encerramento da execução individual em erro, resposta ausente ou divergente.
- Estados terminais tratados: `success`, `zero_results`, `unavailable`, `captcha`, `blocked`, `error`, `timeout` e `cancelled`. Falhas preservam volume, resultado anterior e demais metadados; retry usa nova operação somente para a keyword individual.
- Validação local: testes de parser/patch, terminação, bridge/reader, interface e handshake passaram; sintaxe dos scripts passou. Consulta Google real, Chrome autenticado, escrita remota, migration, commit, push e deploy não foram executados.

## Correlacao do retorno individual allintitle — 2026-07-26

- Causa localizada: a bridge espalhava a resposta depois do `requestId` raiz, permitindo que um campo ausente ou divergente sobrescrevesse a correlacao original; o workspace tambem tratava retorno sem ID como `request_mismatch`.
- Corrigido localmente: `requestId` agora e obrigatorio no pedido interno, preservado como campo autoritativo pela bridge/background/reader e carregado em progresso, resultado, pausa, cancelamento, retomada e `batch_completed`. `batchId` continua separado e `keywordId`/`brandId` sao validados individualmente.
- Resposta sem ID recebe `response_missing_request_id`; divergencia recebe `request_mismatch`; resposta de lote anterior e ignorada como `stale_response`, sem persistencia.
- Nenhuma chamada ao Google, escrita remota, migration, limpeza de armazenamento, commit, push ou deploy foi executada. Validacao manual autenticada continua pendente.

## Coerencia de volume zero e KGR — 2026-07-26

- Causa localizada: `buildVolumeMetricPatch` atualizava `volume_search` para zero, mas omitia `kgr_score: null`; o score calculado com volume anterior permanecia visivel.
- Corrigido localmente: zero numerico da keyword exata passa a registrar `volume_measurement.status = zero_confirmed`, fonte/data/match, preserva `results_allintitle` e invalida o KGR atual. O KGR anterior e guardado em `kgr_score_history`.
- Erros, ausencia, `null`, string vazia, schema invalido, keyword divergente e sugestao relacionada continuam sem patch destrutivo.
- Adicionada deteccao somente leitura de inconsistencias volume/KGR e previa diagnostica em desenvolvimento. Nenhuma correcao em massa ou escrita remota foi executada.
## Bridge reinjetável e diagnóstico classificatório — 2026-07-27

- Corrigido localmente: a bridge não usa mais um booleano global que mantinha contexto obsoleto após reload da extensão. Cada instância possui versão, `instanceId` e `dispose`, remove listeners nomeados e pode ser reinjetada sem reload da página.
- Corrigido localmente: o background reinjeta, aguarda `bridge_ready`, valida bridge/protocolo e só então envia o ping v2. Contexto invalidado, `lastError`, bridge ausente e versão incompatível possuem códigos distintos.
- Corrigido localmente: a prévia de volume/KGR separa `measurement_pending`, `zero_unconfirmed`, `not_applicable` e `inconsistent`; somente a última categoria representa incompatibilidade comprovada. A prévia é somente leitura e seus contadores são derivados dos registros atuais.
- Nenhum volume, `results_allintitle`, KGR, histórico ou dado remoto foi alterado; consulta Google, provider, migration, commit, push e deploy não foram executados.
- Validação manual em Chrome após reload da extensão e smoke test autenticado continuam pendentes.
## Qualificação simplificada e ACK da página — 2026-07-27

- Concluído localmente: `Qualificar volume (KGR calculado)` deixou de iniciar silenciosamente o allintitle; a medição allintitle agora é acionada explicitamente pelo botão próprio.
- Concluído localmente: KGR passou a ser nomeado como cálculo técnico/recalculado, separando-o de volume e resultados medidos.
- Concluído localmente: erros do provedor de volume preservam HTTP/mensagem segura quando disponíveis e aparecem na notificação por keyword; falhas não escrevem `null`.
- Concluído localmente: listener de ACK da página foi separado do estado do lote; ACK negativo estruturado evita transformar divergência conhecida em `ack_timeout`; preflight foi ampliado para tolerar o ciclo de reinjeção e despertar do service worker.
- Removida da interface principal a prévia diagnóstica inflada de volume/KGR; a classificação permanece somente em código/testes/documentação.
- Nenhum schema, migration, parser Google, autenticação, Arquiteto ou dado persistido foi alterado; nenhuma chamada externa foi executada.
## Fluxos separados de métrica, decisão e handshake — 2026-07-27

- Volume é medido exclusivamente pela rota do provedor; `results_allintitle` é medido explicitamente pela extensão; a decisão KGR calcula localmente apenas quando aplicável e com volume/resultados válidos.
- O responder de handshake agora vive na rota contextual do Minerador e publica `page_handshake_ready` antes do ACK; o background valida ator, marca, rota e acesso antes do ping e registra o último estágio confirmado no diagnóstico.
- HTTP 429 da RapidAPI encerra o lote sem retry e retorna somente `Não foi possível coletar volume.`. Itens não processados são identificados internamente; nenhum volume, KGR, `results_allintitle` ou metadado anterior é apagado.
- Validação local: 39 testes focados, TypeScript, sintaxe da extensão e `git diff --check` passaram. RapidAPI, Google, Chrome autenticado, Supabase remoto, migration, commit, push e deploy não foram executados.
