# SDD — MCP ponta a ponta: do Assunto ao “Para escrever”

**Data:** 2026-09-30<br>
**Status:** APROVADA pelo dono em 2026-09-30, com a ordem F1 → F2 → F3a → F5 → F4 → F6 → F3b. Em implementação: F1.<br>
**Módulo proprietário:** Plataforma para agentes (MCP), com núcleos extraídos em Minerador, Arquiteto e Radar.<br>
**Base:** `sdd-plataforma-para-agentes-mcp-2026-09-26.md`, `sdd-adendo-decisao-humana-delegada-pelo-chat-2026-09-26.md`, `AGENTS.md` §17.1.

## 1. Objetivo

O dono quer poder dizer a uma IA conectada (Claude, ChatGPT):

> “Crie estes 5 Assuntos num Silo novo e leve até o fim.”

A IA deve conseguir:

1. pesquisar as keywords;
2. declarar os Assuntos;
3. criar o Silo;
4. formar e aprovar os artigos, sempre com o aceite do dono no chat;
5. ligar os artigos;
6. enviar ao Radar e investigar;
7. no fim, escolher entre escrever no Redator ou puxar o material do artigo, com a SERP, igual ao CSV “Para escrever”, para escrever no ambiente dela.

## 2. Contrato atual (verificado no código em 2026-09-30)

O MCP já cobre:

- declarar Assuntos;
- pesquisar e importar keywords por Assunto;
- Lógica;
- aprovar keywords (`decide_keywords`, com prévia, hash e `platform.decide`);
- enviar ao Arquiteto;
- `improve_articles` (melhorar publicados e formar artigo de Assunto);
- enviar do Radar ao Redator;
- todo o Redator.

O fluxo quebra em sete pontos, que hoje só existem na tela:

| # | Passo | Onde está a lógica hoje | Custo |
|---|---|---|---|
| 1 | Medir Volume | núcleo no servidor (`handleGoogleAdsKeywordMetrics`, já aceita contexto autorizado); a releitura e a classificação ficam no cliente | cota do Google Ads |
| 2 | Criar e confirmar Silo; pôr o Assunto no Silo | PATCH `/api/arquiteto/workspace` no servidor; a proposta, a identidade do Silo, a prontidão, o slug e o impacto em artigo aprovado são calculados só no cliente | grátis |
| 3 | Concluir a formação dos artigos novos | a orquestração inteira está no cliente (`confirmArticleFormation`, `runCanonicalSiloClosure`); rotas de artefato, marcador e consolidação no servidor | SERP e allintitle pagos; concluir é grátis |
| 4 | Links internos | montagem do grafo e das arestas no cliente; âncoras na rota com IA; aprovação por RPC | IA (Connection da marca) |
| 5 | Enviar ao Radar | payload montado no cliente; `import_radar` com a lógica dentro da rota, presa à sessão de cookie | grátis |
| 6 | Investigar e finalizar no Radar | orquestração e finalização (Google e YouTube) no cliente; a SERP do Radar paga as lentes faltantes sem plano | DataForSEO, IA, YouTube |
| 7 | Exportar “Para escrever” | conteúdo montado no servidor, mas ~600 linhas estão dentro da rota, presas à sessão de cookie | nenhum |

Achados que mudam o desenho:

- **O servidor exige menos que a tela.** Aprovar ArticleDNA, aprovar o grafo e confirmar Silo
  passam com `arquiteto:edit`. As ferramentas novas exigem a permissão `approve` explicitamente,
  como o `apply` do `improve_articles`.
- **Travas que só existem no cliente** e precisam ir para o servidor antes de qualquer
  ferramenta:
  - prontidão do Silo;
  - impacto em artigo aprovado;
  - slug do Silo manual;
  - portaria da formação;
  - portão do Radar (`buildRadarHandoffPlan`);
  - releitura do Volume.

## 3. Regra de construção (vale para todas as fases)

1. **Mesmo núcleo da tela.** Cada passo vira uma função de servidor em `lib/server/…`, feita das
   MESMAS funções puras que a tela já usa. A rota da tela passa a ser só adaptador dessa função, e
   a ferramenta MCP chama a mesma função. Nenhuma regra nasce na ferramenta, e nada de lógica de
   componente React é copiado.
2. **A tela não muda de comportamento.** Onde a tela orquestra, ela passa a chamar a rota nova do
   núcleo. Os testes da tela continuam valendo e são a prova disso.
3. **Decisão humana:**
   - `preview` não grava e devolve o `decisionHash`;
   - `apply` exige o mesmo hash, recalculado no servidor, mais `userConfirmation` e o escopo
     `platform.decide`;
   - a permissão exigida é a da tela (`approve`), e o autor é o dono do token;
   - o aceite fica auditado em `writer_mcp_call_events`.
4. **Custo:**
   - primeiro um `plan` grátis, com o custo;
   - depois `execute` com `provider.spend`, o `authorizedPlan` conferido no servidor e o aceite;
   - lente já guardada não é paga de novo;
   - teto por execução.
5. **Sempre fora do MCP, mesmo com aceite:**
   - excluir, restaurar e purgar;
   - publicar, registrar URL ou mudar canonical;
   - trocar a principal publicada ou o Posto;
   - gerir permissões e conexões;
   - migration, SQL e deploy.
6. **Resposta estreita**, paginada e dentro do teto de bytes. O que for cortado vai declarado em
   `trimmed`.
7. **Catálogo** (`lib/agent/platform-catalog.ts`) atualizado na mesma entrega de cada fase. O
   `npm run test:agent` precisa passar.

## 4. Proposta, por fases

Cada fase é uma entrega própria, com testes e homologação do dono antes da próxima.

### F1 — Medir Volume e “Para escrever” (núcleo já no servidor)

- **`measure_keywords`**: `plan` (quantas keywords, quantos lotes, aviso de cota) e `execute`
  (`minerador.write` + `provider.spend` + aceite).
  - Extrai de `minerador-workspace.tsx` a releitura e a classificação por keyword (confirmada,
    confirmada vazia, vazia, falhou).
  - A rota da tela passa a usar o mesmo núcleo.
- **`get_article_for_writing`** (só leitura; `platform.read` + `radar:view`): devolve, por artigo
  finalizado no Radar, o mesmo conteúdo do CSV “Para escrever”:
  - identidade, SEO, SERP das 4 lentes, perguntas, fontes, estrutura e identidade visual;
  - uma chamada por artigo, com fatiamento quando passar do teto.
  - A montagem sai da rota `/api/editorial/radar-export` para `lib/server/radar-writing-export.ts`,
    e a rota vira adaptador.
  - Grátis: não chama provider.

### F2 — Silo pelo MCP

- **`create_silo`** (`arquiteto.write`): cria o Silo candidato com nome e slug.
  - A normalização e a disponibilidade do slug passam para o servidor, com as mesmas funções.
- **`assign_to_silo`** (`preview` / `apply`): põe keywords e Assuntos no Silo.
  - Passa pelo mesmo `planSiloDecisionBatch`.
  - As travas vão para o servidor: artigo aprovado não perde keyword (a de 2026-09-30); publicada
    fica no Silo da URL.
- **`confirm_silo`** (`platform.decide` + `arquiteto:approve`): confirma o Silo, com a prontidão
  calculada no servidor.
- Com isso, o Assunto ganha `territoryRef`, e o `improve_articles` já forma o artigo dele.

### F3 — Fechar o Silo e formar artigos novos

- **F3a · `close_silo`** (`preview` / `apply`, `platform.decide` + `arquiteto:approve`): o
  fechamento canônico (SiloDNA e SiloPage aprovados) sai do cliente (`runCanonicalSiloClosure`)
  para um orquestrador de servidor, com releitura.
  - Resolve o caso dos 5 Assuntos: depois do `improve_articles`, o Silo fecha pelo MCP.
- **F3b · `form_new_articles`**: “Processar artigos” + “Concluir formação” para keywords livres e
  Sobras.
  - `plan` de SERP pago com `provider.spend`.
  - `apply` que aprova o ArticleDNA, com a portaria `validateFormationConclusion` no servidor.
  - É a maior extração do cliente e vem depois da F3a.

### F4 — Links internos

- **`process_internal_links`**: monta a cópia de trabalho e as arestas no servidor e pede as
  âncoras à IA da marca, com aviso de custo e aceite.
- **`approve_internal_links`** (`platform.decide` + `arquiteto:approve`).

### F5 — Enviar ao Radar

- **`send_to_radar`** (`preview` / `apply`, `platform.decide` + `arquiteto:approve` +
  `radar:create`):
  - marca “Pronto para Radar”, com o portão `buildRadarHandoffPlan` no servidor;
  - monta o payload do handoff no servidor;
  - chama o núcleo extraído de `import_radar`, que sai da rota presa à sessão.

### F6 — Investigar e finalizar no Radar

- **`investigate_article`**: `plan` grátis (lentes faltantes, SERP auxiliar das secundárias,
  YouTube e Amazon quando se aplicam) e `execute` com `provider.spend`.
  - Para o MCP, a SERP do Radar deixa de pagar lente faltante sem plano. A tela mantém o
    comportamento atual.
- **`finalize_investigation`** (`platform.decide` + `radar:approve`): congela o pacote.
  - A finalização do Google e do YouTube sai do cliente com as mesmas funções de `lib/radar`.
- Depois disso, `send_radar_to_writer` (já existe) ou `get_article_for_writing` (F1).

## 5. Consumidores e compatibilidade

- **Telas do Minerador, Arquiteto e Radar:** passam a chamar núcleos de servidor. As regras
  continuam as mesmas, e os testes das telas continuam valendo.
- **Rotas atuais:** mesmo contrato de entrada e saída. Viram adaptadores. Nenhuma é removida.
- **MCP existente:** as 34 ferramentas não mudam. As novas são aditivas.
- **Sem migration.** Tudo usa tabelas e RPCs existentes. Se alguma fase precisar de campo novo,
  para e pede adendo.

## 6. Riscos

- **Extração do cliente mudar o resultado da tela.** Mitigação: a extração vem antes da
  ferramenta, com teste de equivalência (mesmo payload antes e depois) e homologação do dono na
  tela.
- **Custo sem controle pelo agente.** Mitigação: plano e aceite obrigatórios, teto por execução e
  cache primeiro. A mudança da SERP do Radar (F6) vale só para o caminho do MCP.
- **Aprovação sem o dono.** Mitigação: `platform.decide` é opt-in, com hash e
  `userConfirmation`, e a permissão `approve` é conferida no servidor.
- **Tamanho.** A F3b e a F6 são grandes. Por isso vêm por último e cada uma pede homologação.

## 7. Rollback

- Cada ferramenta é removível sozinha, junto com a entrada do catálogo.
- Cada extração é reversível trocando o adaptador da rota de volta para o código anterior. As
  funções puras não mudam.
- Sem migration, não há dado a desfazer.

## 8. Testes

- **Por ferramenta:** escopo e permissão negados; hash velho (`decision_stale`); aceite ausente;
  plano de custo; releitura.
- **Por extração:** equivalência com a tela, usando fixtures e mocks.
- **Sem chamada paga e sem rede.**
- **Suítes:** `test:agent`, `test:arquiteto*`, Minerador, Radar e Redator.
- **Smoke real:** feito pelo dono, com a IA conectada.

## 10. Registro da F1 — 2026-09-30

**Implementada, confirmada por teste. Validação manual e smoke real: pendentes (dono).**

- **`measure_keywords`:**
  - núcleo em `lib/server/minerador-volume-measure.ts`; chama `handleGoogleAdsKeywordMetrics`
    com contexto autorizado, mais a releitura e a classificação da tela;
  - `plan` com `platform.read`; `execute` com `minerador.write` + `provider.spend` + `planHash` +
    aceite.
- **`get_article_for_writing`:**
  - núcleo em `lib/server/radar-portable-export-core.ts`, extraído da rota sem mudar o
    comportamento; a rota virou adaptador;
  - `platform.read` + `radar:view`; CSV em partes.
- Projeções puras em `lib/agent/platform-tool-projections.ts`.
- Catálogo: `minerador.measure_keywords` e `radar.export_for_writing` com `access: "tool"`.
- Suítes: `test:agent` 65, `test:radar` 2716, `test:redator` 358, `test:redator:mcp` 117,
  `test:mcp:runtime` 5. `tsc` e lint limpos.
- **Próxima fase:** F2 (Silo pelo MCP), depois da homologação do dono.

## 9. Autorização necessária

1. Aprovar esta SDD e a ordem das fases (F1 → F2 → F3a → F5 → F4 → F6 → F3b).
2. Cada fase entra só depois de o dono homologar a anterior.
3. Nenhuma fase autoriza migration, deploy ou chamada paga em teste.
