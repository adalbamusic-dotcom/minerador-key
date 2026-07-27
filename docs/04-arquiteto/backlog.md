# Backlog — Arquiteto

## Regra compartilhada KGR/formação — concluído localmente em 2026-07-21

- SDD e ADR registrados.
- Contratos e gate determinísticos adicionados sem reprocessamento ou migration.
- Fixtures cobrem limite de seis, intenção incompatível, cobertura de volume e KGR não confirmado.
- Pendente: aprovação/validação humana autenticada e confirmação remota do Minerador.

## Entregue nesta etapa — correção semântica do avaliador SERP (2026-07-21)

- SDD: `docs/04-arquiteto/propostas/2026-07-21-correcao-avaliador-serp-intencao-kgr.md`; ADR: `docs/00-produto/decisoes/ADR-012-avaliador-serp-intencao-e-kgr-leve.md`.
- `ArticleIntentProfile` ancorado na principal, labels equivalentes normalizadas e sinais de secundárias preservados sem sobrescrever a intenção central.
- Hierarquia separada de formato; snippets tratados como evidência parcial; confiança explícita e gating de recomendações destrutivas.
- Perfil `kgr_light` reduz consultas e mantém todas as referências KeywordDNA; assessment v1 permanece e pode ser marcado desatualizado antes da v2.
- Proveniência Minerador→Arquiteto corrigida para URL publicada, canonical, slug e status.
- **Verificado:** `test:arquiteto` 70/70; testes de provider somente com fixtures. **Pendente:** `test:operational`, TypeScript, lint/build finais e validação browser autenticada.
- **Andamento 2026-07-20:** reparada a regressão que deixava keywords aprovadas recém-importadas fora da `masterList`; a seleção agora é reconciliada com o workspace existente sem reagrupar durante a leitura.
  - **Arquivos alterados nesta etapa:** `app/(brand)/[brandRef]/arquiteto/page.tsx`, `modules/arquiteto`, `tests/operational-flow.test.mts`, `docs/04-arquiteto/estado-atual.md`, `docs/04-arquiteto/backlog.md`
  - **Evidências:** `test:arquiteto` 48/48, `test:operational` 49/49, `npm run build` e `git diff --check` passaram.
  - **Pendente:** validação manual com snapshot exportado e leitura real por marca; `tsc` completo e lint permanecem bloqueados por problemas fora/anteriores ao reparo.
## Agora
- **Objetivo:** restaurar a integridade de importação e hidratação sem executar IA nova.
  - **Módulo proprietário:** Arquiteto
  - **Arquivos permitidos:** `app/(brand)/[brandRef]/arquiteto/page.tsx`, `modules/arquiteto`, `lib/arquiteto/**`, `lib/editorial/architect-recovery.ts`, testes e docs do módulo
  - **Arquivos proibidos:** migrations, Minerador e módulos consumidores sem SDD
  - **Dependências:** snapshot completo, dados de diagnóstico e autorização para leitura
  - **Riscos:** perder recovery válido ou promover índice inconsistente
  - **Critério de aceite:** cada keyword importada tem localização; grupos/artigos recuperáveis reaparecem; nenhuma origem é apagada
  - **Testes obrigatórios:** `test:arquiteto`, `test:operational`, validação manual com snapshot
## Próximo
- **Objetivo:** formalizar proposta de persistência/hidratação de SiloPage, se necessária.
  - **Módulo proprietário:** Arquiteto
  - **Arquivos permitidos:** `docs/04-arquiteto/propostas/**`
  - **Arquivos proibidos:** código e migrations antes de aprovação
  - **Dependências:** resultado da reconciliação
  - **Riscos:** mudar contrato compartilhado
  - **Critério de aceite:** SDD com consumidores, rollback e testes
  - **Testes obrigatórios:** revisão de contrato
## Depois
Nenhuma tarefa aprovada.

## Entregue nesta etapa — política da principal do Minerador (2026-07-22)

- SDD: `docs/04-arquiteto/propostas/2026-07-22-consumo-politica-principal-minerador.md`; decisão: `docs/00-produto/decisoes/ADR-016-politica-principal-minerador-arquiteto.md`.
- Consumo determinístico de `primary_keyword_policy` (`locked`, `reviewable`, `free`) com efetivos `locked`, `revisable`, `free`, `conflict` e `unknown`; publicado sozinho não trava a principal.
- ArticleDNA preserva política original/efetiva, contexto humano, métricas da principal, candidatas, decisão, URL, slug, canonical, publicação, relação e snapshots KeywordDNA.
- `ArticleControlContext` separa política/proteção da principal de URL/slug/canonical/marca e expõe o motivo da proteção.
- `kgr_decisao=NAO`/`not_applicable` explícito vira `competitive`; KGR confirmado continua `kgr_light`; ausência não vira não-KGR.
- Confirmação humana permite substituir candidata, cria sucessora versionada, trava a nova principal e conduz a SERP seguinte para `fortalecimento`.
- **Validação:** `test:arquiteto` 89/89, `test:operational` 49/49, `tsc --noEmit`, lint focado do domínio/API e build passaram; lint completo da página mantém dívida legada. Browser autenticado, reload real, Supabase/RLS e provider real ainda pendentes.
## Bloqueado
Novas operações de IA até confirmação da integridade.
## Descartado
Limpar localStorage/IndexedDB para "resolver" inconsistência.

## Entregue nesta etapa — SERP de formação e identidade publicada (2026-07-21)

- SDD e ADR registrados.
- Preservação integral da KeywordDNA nos `ArticleKeywordReference` e na transferência aprovada ao Radar.
- Assessment SERP por artigo/keyword, snapshots, hash, recomendações e decisões humanas persistidas por marca.
- Proteção de publicados, identidade sem URL inventada, link seguro e verificação server-side de URL/canonical/sitemap quando fornecido.
- Coluna independente `APROVAÇÃO`, sem criar estado novo.
- **Pendente:** validação manual autenticada; nenhum provider real foi chamado. O build compilou, mas a geração estática falhou em `/admin/marcas` com erro de invariável do Next fora do escopo.
## Concluídos recentes
Auditoria documental inicial em 2026-07-20.

## Entregue nesta correção — visibilidade SERP por keyword (2026-07-21)

- Indicador de estado SERP na linha do artigo, com versão e estados de erro/conflito/desatualização.
- Fechamento do preview somente após persistência; expansão automática, aba de suporte e foco na linha sem reload.
- Recomendação renderizada junto à keyword principal ou de suporte, com justificativa, status, data, conflitos e ações `Seguir recomendação`/`Ignorar`.
- Associação determinística por `articleId + keywordId + keywordDnaVersionId`; ordem da lista, texto e índice não participam do vínculo.
- Resultado incompleto ou não hidratado é visível como `Recomendação SERP não associada`, com IDs de KeywordDNA e ArticleDNA.
- **Pendente:** validação manual autenticada do fluxo completo, sem executar chamada paga automaticamente.

## Entregue nesta correção — modos SERP (2026-07-21)

- `assessmentMode: formacao` para artigos novos e `assessmentMode: fortalecimento` para publicados.
- Principal publicada exibida como protegida; conflitos viram oportunidades de fortalecimento, não troca de identidade.
- Ações estruturais antigas permanecem bloqueadas no domínio, inclusive remoção da principal.
- Recomendações de atualização e artigo complementar são registradas como decisão humana sem criar artigo automaticamente.
- Textos corrompidos da UI corrigidos e cobertos por teste de fonte UTF-8.
- **Pendente:** validação manual autenticada dos dois modos e confirmação visual de reload/persistência.

## Entregue nesta etapa — contexto URL/arquitetura/KGR (2026-07-21)

- Contratos aditivos e retrocompatíveis para relação keyword↔URL, situação arquitetural e identidade KGR.
- Três modos SERP resolvidos pelo contexto recebido, com `arquitetura_publicado` para publicado ainda não consolidado.
- Proteção independente de URL/slug/canonical/marca, principal confirmada e vínculo KGR confirmado.
- Confirmação arquitetural cria sucessora real do ArticleDNA e preserva a identidade publicada.
- Radar recebe os campos sem alteração de UI/workflow.
- **Verificado:** `test:arquiteto` 63/63, `test:operational` 49/49, TypeScript, lint focado, build e `git diff --check` passaram.
- **Pendente:** validação manual autenticada de candidato publicado, confirmação, KGR confirmado/candidato, reload, troca de marca e envio ao Radar; nenhuma chamada real foi executada.

## Entregue nesta etapa — ArticleDNA estratégico (2026-07-21)

- SDD: `docs/04-arquiteto/propostas/2026-07-21-article-dna-estrategia-kgr-volume-hierarquia.md`; decisão registrada em `docs/00-produto/decisoes/ADR-013-article-dna-contexto-estrategico.md`.
- ArticleDNA agora entrega estratégias determinísticas de intenção, KGR, volume, hierarquia, propósito e contribuição individual, sem duplicar a origem KeywordDNA.
- `ArticleControlContext` é a projeção compartilhada e retrocompatível; o Radar recebe apenas um campo opcional, sem alteração de UI/workflow.
- **Verificado:** `test:arquiteto` 74/74, `test:operational` 49/49, TypeScript, lint focado e `npm run build`.
- **Pendente:** validação manual autenticada, provider/SERP reais e confirmação do schema remoto/RLS.

## Entregue nesta etapa — perfis de unidades KGR/não KGR e SERP (2026-07-22)

- Classificação aditiva de artigo, serviço, landing, categoria e outro, com evidências e confirmação humana.
- Propósito editorial com objetivo, necessidade de busca, conversão e indexação.
- Estratégia SERP combinando ciclo editorial, competição e perfil da unidade sem enumeração única.
- KGR confirmado em `kgr_light`, não KGR explícito em `competitive`, ausência/candidato/conflito em `unknown`.
- Proteção de publicados, histórico de assessments e sucessor versionado para decisões humanas.
- **Verificado:** `test:arquiteto` 83/83 e TypeScript.
- **Pendente:** `test:operational`, build, validação manual autenticada, providers reais e schema remoto/RLS.

## Entregue nesta etapa — criador manual de SiloDNA/SiloPage (2026-07-21)

- Modal não solicita mais `Nicho`; exige nome e keyword/entidade central.
- Criação somente de SiloDNA funciona mesmo sem artigos e não inventa KeywordDNA.
- Criação opcional de SiloPage preserva slug, situação, URL publicada e verificação inicial em contratos separados.
- `published` exige URL no domínio da marca ativa, mas inicia como `not_checked`; URL, slug e canonical não são sobrescritos automaticamente.
- **Verificado:** `test:arquiteto` 78/78, `test:operational` 49/49, TypeScript, lint focado e build.
- **Pendente:** roteiro manual autenticado, conferência online explícita e confirmação do schema remoto/RLS.

## Consolidacao fisica concluida - 2026-07-23
- Implementacoes exclusivas da area permanecem em modules/arquiteto; nenhum contrato ou rota foi alterado nesta etapa.
- Validacao manual autenticada e persistencia remota seguem pendentes.

## Acesso autenticado a listas_kgr — 2026-07-24

- Causa compartilhada diagnosticada: o cliente browser não propagava corretamente o token Supabase; o Arquiteto ainda tentava `setSession` com `refresh_token` vazio.
- Correção local: Arquiteto e Minerador compartilham `lib/supabase/browser-authenticated-client.ts`; o Arquiteto também restringe keywords por `brand_id` antes de aceitar keywords sem `lista_id`.
- O log de falha de `listas_kgr` preserva código, tabela, operação, status e mensagem, sem expor tokens.
- Sem alteração de RLS, grants, migration, keywords, `lista_id`, `brand_id`, owner ou memberships.
- Pendente: smoke test manual autenticado e confirmação online; nenhum SQL remoto foi executado nesta correção.

## Ciclo JWT NextAuth → Supabase — concluído localmente — 2026-07-24

- Implementado refresh server-side do JWT Supabase com margem de 60 segundos e lock por refresh token.
- Cliente compartilhado usa callback `accessToken` dinâmico; SELECT do ecossistema possui no máximo um retry após JWT expirado.
- Google OAuth foi separado do JWT Supabase; erros registram somente código, tabela, operação, status e `tokenExpired`.
- Pendente: reiniciar o servidor, sair/entrar novamente e executar smoke test manual autenticado no Arquiteto. Migrations 0005/0006 não devem ser reexecutadas.

## Diagnóstico final da sessão NextAuth → Supabase — concluído localmente — 2026-07-24

- Concluído: Arquiteto e Minerador compartilham resultado estruturado e diagnóstico seguro da sessão Supabase.
- Concluído: erro de sessão expirada é reservado para `SUPABASE_TOKEN_EXPIRED`; falha de refresh possui mensagem própria.
- Pendente: login Google real e confirmação da configuração remota do provider; nenhuma operação remota foi executada.

## Fechamento da sessão incompleta Google → Supabase Auth — concluído localmente — 2026-07-24

- Concluído: o Arquiteto não é alcançado com `supabaseAuth.status = error`; o callback falho retorna reason seguro e exige novo login.
- Concluído: Credentials continua validando access/refresh token real do Supabase.
- Pendente: smoke test Google real e confirmação da configuração remota do provider.
