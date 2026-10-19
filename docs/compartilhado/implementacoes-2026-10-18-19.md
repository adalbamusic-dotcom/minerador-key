# Implementações de 18 e 19/10/2026 (consolidado)

Este documento reúne as implementações feitas nestes dois dias, por área. Cada uma traz a regra do dono que a motivou, os arquivos principais, os testes e o estado.

Ele não substitui o `estado-atual.md`, o `backlog.md` nem o `situacoes-resolvidas.md` de cada módulo, que trazem o detalhe. O registro dos testes pelos botões está em `registro-teste-local-pelos-botoes-2026-10-18-19.md`.

**Legenda de estado (AGENTS §1):**
- **Código:** verificado no código.
- **Teste:** confirmado por teste.
- **Botão:** validado pelo botão no navegador local, com leitura do banco por SELECT.
- **Pendente:** depende de decisão ou ação do dono.

**Commit e deploy:** nenhuma destas mudanças foi commitada nem foi para deploy. O dono faz o commit e o deploy, e só com `npm run test:regressao` verde.

---

## 0. Regras globais (AGENTS.md §0) e a bateria de regressão

| O quê | Onde | Estado |
|---|---|---|
| Teste real é pelos botões que o humano usa; o banco só é lido | AGENTS.md §0.3; memória `testar-pelos-botoes-do-humano` | Regra |
| Botão novo só no lugar dos botões da etapa; InfoHint em todo botão e etapa; tutorial por área no "?" | AGENTS.md §0.1 | Regra |
| Nada vai para deploy sem a bateria verde no local | AGENTS.md §0.3 | Regra |
| Bateria `npm run test:regressao` (TypeScript + suítes de cada área, com teto das falhas antigas: minerador:todos 25, editorial 4, authz 2) | `scripts/regressao.mjs`, `package.json` | Código e teste |
| Agente `regressao`, que roda a bateria e diz se pode ir para o deploy | `.claude/agents/regressao.md` | Código |
| Inventário de botões e da linha de cada área (decisão: "Só os defeitos agora") | `docs/compartilhado/inventario-botoes-e-linha-2026-10-18.md` | Documento |

## 1. Avisos no sino (todas as áreas)

- **Regra do dono:** todo aviso de processo aparece dentro do sino.
- **O que mudou:** os avisos de fundo e de resultado de todas as áreas passaram para o centro de avisos (`components/global-notice-center.tsx` e `components/editorial/background-task-notice.tsx`).
- **Teste:** `tests/avisos-no-sino-2026-10-18.test.mts`.
- **Estado:** código e teste.

## 2. Tudo pode ser apagado, em qualquer estado

- **Regra do dono:** tudo pode ser apagado, com seleção, confirmação forte e aviso do que sai. Publicado vai para a lixeira de 24 h.
- **Minerador:**
  - a exclusão desmonta o que está no Arquiteto (`lib/minerador/architect-dismantle.ts`, `keyword-delete-core.ts`, `group-delete-all*.ts`);
  - a prévia mostra o que sai em cada área.
- **Radar:** retirada do item (`lib/server/radar-item-withdrawal.ts`).
- **Arquiteto:** "Desfazer Silo" aceita qualquer estado (`lib/server/arquiteto-territory-undo.ts`, `arquiteto-silo-article-withdrawal.ts`).
- **Telas:** `components/lifecycle/delete-confirmation.tsx` e `components/editorial/group-delete-all-dialog.tsx`.
- **Testes:**
  - `tests/minerador-exclusao-confirmacao-forte-dom.test.mts`;
  - `tests/arquiteto-desfazer-silo*.test.mts`;
  - `tests/arquiteto-cenarios-ouro-apagar-tudo-2026-10-18.test.mts`.
- **Estado:** código e teste.
- **Pendente:** migration proposta para o documento do Redator não prender a keyword (`20261018120000_documento_do_redator_nao_prende_a_keyword`, não escrita).

## 3. Marca

| O quê | Arquivos | Estado |
|---|---|---|
| **Localidade da SERP por marca (L1–L4).** A coleta usa a localidade do mercado da marca. São Paulo (cidade), código 1001773, conferido no CSV público da DataForSEO. Gravada na WifiConecta e na AdalbaPro pela tela da Marca. | `lib/marca/brand-serp-location.ts` (catálogo `2026-10-18-br-sp`), `lib/server/brand-serp-target.ts`, `lib/radar/territory-gazetteer.ts`; SDD `sdd-localidade-serp-por-marca-2026-10-18.md` | Código, teste (`radar-localidade-serp-por-marca-2026-10-18`, 18/18) e botão |
| **Cancelar convite:** feito por PATCH. Suspender e Revogar ficam desabilitados até existir a migration. | `app/api/editorial/invitations/route.ts`, `modules/marca/*` | Código e teste (`marca-defeitos-2026-10-18`). **Pendente:** migration e aceite do PATCH |
| **Voz e CTA por marca:** SDD aprovada (regras universais globais; nicho, fechamento e CTA da Skill da marca; troca do CTA na leitura) | `sdd-voz-e-cta-por-marca-2026-10-18.md` | **Pendente:** implementação depois da Skill v2 da AdalbaPro |

## 4. Minerador — "Assunto pela principal e volume" (SDD de 18/10)

| Fase | O que entrega | Arquivos principais |
|---|---|---|
| F0 | Régua do volume: zero (medido 0 ou "sem média"), baixo (1 a 39), com volume (40 ou mais) e desconhecido; a origem é gravada em `keyword_subject_basis` | `lib/minerador/keyword-subject.ts` |
| F1 | Destino "Keyword (sem Silo)" no cadastro de Assuntos, no MCP e no "Converter formato anterior" | `declared-plan.ts`, `declared-plan-import-core.ts`, `subject-conversion-core.ts` |
| F2 | Painel do KeywordDNA: "Editar Assunto", "Usar como Assunto do artigo" (volume baixo) e "Cadastrar Assunto", com revisar → gravar → reaprovar | `modules/minerador/subject-article-editor.tsx`, `components/editorial/dna-panels.tsx` |
| F3–F4 | "Aprovar e enviar": a página publicada de volume 0 vira o Assunto antes de aprovar | `approve-and-send-core.ts`, `lib/server/minerador-approve-and-send.ts`, `approve-and-send-dialog.tsx` |
| F5 | Arquiteto: a principal segue o volume; a página com o Assunto vira o subject do ArticleDNA (ver §5 sobre o que foi substituído em 19/10) | `lib/arquiteto/article-improvement*.ts`, `canonical-bootstrap.ts`, `published-reinforcement.ts` |
| F6 | Documentação, tutorial e catálogo | `docs/03-minerador/*`, `docs/04-arquiteto/*`, `context-help.ts`, `lib/agent/platform-catalog.ts` |

**Defeito de 19/10 no "Aprovar e enviar":**
- **Sintoma:** 503 depois de gravar o Assunto em só 6 de 17 keywords, e a tela dizia "Nada foi gravado".
- **Causa:** o compare-and-swap mandava o DNA inteiro na URL, que passava do limite do gateway.
- **Conserto:**
  - `lib/minerador/semantic-snapshot-guard.ts`: filtro por chave de topo e releitura antes do UPDATE;
  - resultado por keyword, com o desfecho `failed`;
  - retomada pelo mesmo botão;
  - a tela só diz "Nada foi gravado" quando a rota garante isso.
- **Testes:**
  - `tests/assunto-pela-principal-cenarios.test.mts` (Z13);
  - `tests/minerador-assunto-pela-principal-dom.test.mts`.

**Estado:** código, teste e botão. No grupo Verde da AdalbaPro:
- 25 de 25 concluídas;
- 16 com o Assunto pela origem `zero` e 2 pela origem `low`, conferido por SELECT;
- a edição do título do Assunto não foi testada pelo botão.

**Pendente:** o volume importado não confirmado de "como atrair pacientes para clínica" (a régua lê 0; a aprovação exige o Volume medido).

## 5. Arquiteto — "Melhorar publicados…" (o refazedor)

### 5.1 Consertos de 19/10 (código e teste; o botão foi interrompido)

| Situação | O que mudou | Arquivos |
|---|---|---|
| RF25 | Intenção comparada pela família ("Informativo" = "Informativa"), com um normalizador só; régua única do funil | `lib/arquiteto/keyword-dna-signals.ts` (`intentComparisonKey`, `funnelComparisonKey`) e os 8 pontos que comparavam texto cru |
| RF26 | Uma secundária de publicado só sai por intenção quando a SERP decide nas duas pontas, com as 4 lentes; divergência só no DNA não tira | `article-improvement.ts` (`principalSubjectConflictDetail`, `enforcePageSubject`), `lib/server/arquiteto-article-improvement.ts` |
| RF13 | A cidade da marca não conta como "busca local de fora" (`foreignLocalSearch`, `isBrandLocality`, `withoutBrandLocality`) | `article-improvement.ts`, `published-reinforcement.ts` |
| G19 | A coleta paga cobre todas as principais contadas no custo; não pede de novo as mesmas consultas | `lib/server/arquiteto-article-improvement.ts` (`refreshPlan`, `needsValidation`) |
| G20 | A guarda de retrabalho barra um grupo, nunca a coleta inteira; o grupo barrado vira aviso e não é cobrado | `lib/server/arquiteto-article-improvement.ts` |
| V7 | A coleta que para aparece no painel e no sino ("12 de 84 pagas"), e o mesmo Confirmar vira "Continuar a coleta autorizada" | `modules/arquiteto/article-improvement-panel.tsx` |

**Testes:**
- `tests/arquiteto-cenarios-ouro-verde-2026-10-19.test.mts`;
- `tests/arquiteto-cenarios-ouro-servidor-2026-10-16.test.mts` (V2, V4 e V5);
- `tests/arquiteto-article-improvement-dom.test.mts`.

### 5.2 Decisões do dono de 19/10, aplicadas (ver o `estado-atual.md` do Arquiteto)

- **Assunto como âncora:** no refazer de um publicado, a keyword do slug é o Assunto. A principal e as secundárias são reavaliadas contra ele pelo SEO semântico: entidade, intenção, problema e o modificador que define o artigo, com a SERP confirmando.
- **Principal antiga:** sem relação semântica com o Assunto, ela não fica.
  - SUBSTITUÍDO: "a principal do modo antigo fica se passar na régua c (núcleo do slug por palavras)".
- **Canibalização entre os artigos do grupo/Silo:** a prévia propõe mover para o artigo certo a keyword que serve a outro Assunto.
- **SERP ao refazer:** coleta nova na localidade da marca, e a SERP nacional anterior não vale como prova. A coleta de uma keyword sozinha não entra no registro da guarda de retrabalho.
- **A mesma régua em todos os caminhos da área (§0.5):** a mesa D2.1, "Reforçar publicados" e `proposePublishedPrimarySwap`.

**Estado:** código e teste; a bateria `npm run test:regressao` passou verde. Ainda não foi testado pelo botão: o teste manual é do dono, e o roteiro está em `docs/04-arquiteto/estado-atual.md`.

**Causas achadas no diagnóstico (SELECT nos ArticleDNA do Verde):**
- **Régua c só por palavras:** contava as duas palavras antes de "para/sem" e ignorava o modificador que define o artigo.
- **"Volume 0 sem candidata":** mantinha a principal ruim "por enquanto".
- **Keywords presas ao artigo:** as que já estavam num artigo nunca eram realocadas.
- **SERP nacional decidindo:** a SERP nacional antiga decidia a intenção.
- **Guarda de retrabalho:** barrava a recoleta.
- **Singular × plural:** "clinica" × "clinicas" contava como públicos diferentes.

**O que mudou:**
- **A principal precisa respeitar o que define o artigo** (`lib/arquiteto/article-improvement.ts`: `subjectDefiningModifiers`, `principalLosesDefiningModifier`, `principalFitsSubject`). Isso inclui restrição ("sem tráfego pago"), negação ("não traz"), comparação e nicho.
  - Quando a principal antiga não cabe, ela deixa o posto.
  - Quando não há candidata, a página do Assunto vira a principal ("foco") e a vaga com volume fica aberta.
- **Canibalização entre os artigos do grupo** (`reorganizePublishedSubjects`):
  - a mesma linha do Google Ads conta uma vez;
  - a mesma busca fica num artigo só;
  - a keyword que serve a outro Assunto vai para o artigo dele, com o par "vai para / vem do" (`improvementMovePairRefusal`, `improvementMoveOrder`).
- **SERP da localidade:** com a marca numa cidade, a SERP nacional não decide. O refazer leva o motivo e a guarda não barra a recoleta. A coleta de uma keyword só não entra no registro da guarda (`lib/server/arquiteto-serp-http.ts`).
- **IA:** recebe `assunto` e `oQueDefine`.
- **§0.5, os três caminhos antigos:** `proposePublishedPrimarySwap`, a mesa D2.1/"Reforçar publicados" (`buildPublishedSwapArticlePayload`) e a diferenciação passaram a usar a mesma régua.

**Documentação e testes:**
- Docs: spec do Arquiteto §48; `situacoes-resolvidas.md` com T15, U19, G21 e Z11, mais 6 regras marcadas SUBSTITUÍDO; SDD de 18/10 (§6.3-c e R7 substituídos); catálogo MCP; tutorial.
- Cenários: `tests/arquiteto-cenarios-ouro-verde-2026-10-19.test.mts` (V6 a V11).

**Previsão para o Verde** (simulada, sem SERP nova):
- **Principal nova em 2 artigos.**
- **13 artigos ficam com o Assunto como foco.**
- **Saem:**
  - "captação de pacientes dentista";
  - as keywords de preço e "harmonização facial feminino";
  - as buscas repetidas em dois artigos.
- **Mudam de artigo:**
  - "como atrair pacientes para o consultório" vai para o artigo odontológico;
  - "plano de marketing exemplo" vai para "exemplos e templates".
- **SERP nova:** cerca de 68 consultas, até ~US$ 0,24.

**Decisões pendentes do dono:**
1. Com o nicho contando como o que define o artigo, 13 de 17 páginas ficam com o Assunto como foco. Confirma?
2. O Confirmar grava a página como principal sem volume. Ou essas linhas devem esperar uma principal com volume?
3. A recoleta paga só a lente que falta no cache de 30 dias. SERP nova mesmo com o cache válido?
4. Mover keywords entre publicados: os 2 artigos que estão no Redator recebem "Atualização disponível".
5. "harmonização facial o que é" fica como contexto ou sai?
6. A troca pelo "Reforçar publicados" com Assunto não foi testada de ponta a ponta.

## 6. Radar

| O quê | Arquivos | Estado |
|---|---|---|
| **Artigo-modelo cortado:** o raciocínio consumia o limite. O OpenRouter roda com `effort: "none"`, exceto nos modelos "-pro"; a mensagem de falha diz os tokens. | `lib/server/openrouter-provider.ts`, `lib/radar/article-blueprint.ts`, `lib/server/radar-article-blueprint.ts` | Código, teste e botão |
| **Filtro de fora do escopo:** siglas curtas (cep, tim) contam como território; seções de identidade nunca saem. | `lib/radar/out-of-scope.ts`, `editorial-article-model.ts`, `portable-writing-export.ts` | Código, teste e botão |
| **Id do concorrente:** SHA-256 da URL, sem chaves React duplicadas. | `lib/radar/competitor-extractor.ts` | Código e teste |
| **"Estado SEO" estável e pesquisa em lote:** os dois botões de lote foram reunidos em "Pesquisar e finalizar". | `lib/radar/research-batch.ts`, `modules/radar/radar-r4-bulk-operations-bar.tsx` | Código e teste |
| **Adoção de investigação congelada:** "Ver e adotar" congela de novo na versão nova, coletando só as keywords novas. | `lib/radar/architect-update.ts`, `lib/server/radar-architect-adoption.ts` | Código, teste e botão |
| **Enviar ao Redator: 500 e 401.** Leituras estreitas, `return=minimal` e nova tentativa no 401. Gravação do documento com tempo próprio, migration aplicada pelo dono em 19/10. | `lib/radar/writer-handoff-client.ts`, `lib/server/editorial-repositories.ts`, `supabase/migrations/20261019120000_documento_do_radar_gravacao_com_tempo_proprio.sql` | Código, teste (`radar-envio-redator-lote-grande-2026-10-19`) e botão: 8 de 8 do amarelo enviados |
| **Seleção em lote da planilha:** não era defeito. Entrou um teste que guarda o caso. | `tests/radar-selecao-em-lote-planilha.test.mts` | Teste |

**Riscos registrados:**
- O salvamento automático do Redator nos documentos de 10 MB pode estourar o tempo limite.
- Referenciar o pacote em vez de copiá-lo pede SDD.

## 7. Redator e Publicações

- **Redator:**
  - o custo da IA aparece antes;
  - cancelar não chama a IA;
  - desfazer limitado à aba Artigo.
  - Arquivos: `components/editorial/professional-writer.tsx`, `lib/redator/action-feedback.ts`. Teste: `tests/redator-defeitos-2026-10-18-dom.test.mts`.
- **Publicações:**
  - a entrega chega à Fila (`modules/publicacoes/publications-workspace.tsx`, `lib/server/writer-publication-handoff.ts`);
  - teste: `tests/publicacoes-entrega-chega-a-fila-2026-10-18.test.mts`.
- **Estado:** código e teste.

## 8. Tutorial do "?" e InfoHints

- **O que entrou:** tutorial por área e etapa nas 6 áreas (`modules/*/context-help.ts`, `lib/context-help-registry.ts`).
- **Teste:** `tests/context-help.test.mts`, suíte "ajuda (tutorial)" da bateria.
- **Estado:** código e teste.

## 9. Pendências do dono (resumo)

1. O volume importado não confirmado de "como atrair pacientes para clínica".
2. A intenção "Local" no DNA de "como atrair pacientes para clínica de estética".
3. A migration de Suspender/Revogar convite e o aceite do PATCH de convites.
4. A migration para o documento do Redator não prender a keyword.
5. O atalho de lote "do Silo" perdido.
6. O corte de 500 mil habitantes do território (D11).
7. A voz e o CTA por marca, depois da Skill v2 da AdalbaPro.
8. A limpeza de botões duplicados, por exemplo "Aprovar e enviar" na barra do topo e no rodapé do Minerador.
9. Salvamento automático do Redator e pacote referenciado em vez de copiado (SDD).
10. Antes do deploy: o dono roda `npm run test:regressao`, faz o commit e o deploy.
