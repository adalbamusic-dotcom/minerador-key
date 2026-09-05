> **HISTÓRICO — NÃO OPERACIONAL — 2026-08-27**
>
> Registro preservado durante a consolidação documental. Não é fonte de verdade nem autoriza implementação; consulte as fontes canônicas ativas em `docs/README.md`.

# Pedido estrutural #1 — InternalLinkGraph do Arquiteto

**Status:** aprovada para implementação local; migrations preparadas para
aplicação remota manual; nenhuma migration foi aplicada remotamente
**Data da decisão:** 2026-08-26
**Origem:** fila de consolidação canônica A1–A20, auditoria de 2026-08-25
**Destino:** Planner Geral / fundação compartilhada
**Módulo proprietário do comportamento:** Arquiteto

Este documento é a SDD e o contrato da mudança. A autorização vigente cobre
somente arquivos, migrations, contratos, services, testes e documentação
locais, além de auditoria remota read-only. Não autoriza aplicar migrations,
executar DDL/DML remoto, criar dados, chamar providers pagos, fazer commit,
push ou deploy.

## Problema

A visão canônica do Arquiteto inclui a área Links Internos. O Arquiteto deve
definir quem se conecta com quem, em qual direção, por qual relação, com qual
prioridade, justificativa semântica e conceitos de âncora.

No código atual existem representações parciais:

- SiloDNA.linkMap;
- ArticleDNA.internalLinks;
- ContentPlanInternalLink;
- ContentDocument.linkMap;
- InternalLinkAssignment e AnchorCandidate no contrato operacional.

Esses formatos pertencem a momentos diferentes do fluxo. Nenhum é o
InternalLinkGraph canônico.

## Regra do produto

O InternalLinkGraph é a fonte de verdade das relações editoriais. A
visualização React Flow, o ContentPlan, o ContentDocument e a publicação são
projeções/consumidores posteriores.

O Arquiteto define relação, origem, destino, direção, tipo, prioridade, motivo
semântico e conceitos de âncora. O Planejador escolhe seção/contexto e
quantidade. O Redator escolhe frase e âncora final natural. Publicações valida
URL e integridade. Radar acrescenta evidências sem redesenhar silenciosamente.

Relações mínimas:

- Pilar → Suporte;
- Suporte → Pilar;
- Suporte → Suporte somente quando houver relação semântica real;
- SiloPage → Article quando a arquitetura exigir.

A âncora não é uma string obrigatória derivada por split da keyword.

## Por que o Arquiteto atual não consegue representar

O contrato atual não possui um objeto que reúna:

- identidade da versão do grafo;
- brandId e ownership;
- conjunto de nós e referência de versão de cada ArticleDNA/SiloDNA/SiloPage;
- conjunto de arestas direcionadas;
- tipo e prioridade da relação;
- motivo semântico e evidências;
- anchor concepts e candidatos;
- estado da aresta;
- aprovação humana;
- hash, sucessor e proveniência;
- conflitos, stale e readback.

A lista linkMap do SiloDNA não distingue todos esses estados. A lista
internalLinks do ArticleDNA não é um grafo entre artigos. O
InternalLinkAssignment pertence ao ContentPlan/fluxo operacional e já exige
targetSlug e candidatos para uma etapa posterior. Usar qualquer um deles como
fonte canônica perderia responsabilidade e proveniência.

## Contratos e persistência atuais auditados

- ArticleDNA possui internalLinks como lista de referências simples.
- SiloDNA possui linkMap com fromArticleId, toArticleId e reason.
- ContentPlan possui links com targetArticleId, targetSlug, reason, posição,
  candidatos, required, status e humanApproved.
- ContentDocument possui linkMap e blocos internal_link.
- O repositório de artefatos versionados conhece article_dna, silo_dna,
  silo_page e content_plan; não conhece internal_link_graph.
- As migrations locais sucessoras 0027–0029 não definem entidade de grafo.
- Não foi localizada tabela, route ou repository canônico de grafo no código
  ativo auditado.

## Mudança mínima necessária

O Planner Geral deve decidir uma das alternativas abaixo, sem assumir nenhuma:

1. novo tipo de artefato versionado para InternalLinkGraph; ou
2. extensão formal de um artefato compartilhado já existente, com ownership,
   versionamento e handoff explícitos.

A decisão precisa definir, no mínimo:

### Identidade e tenant

- graphId;
- brandId canônico;
- actorUserId;
- versão, hash, createdAt e sucessor;
- referências de versão para ArticleDNA, SiloDNA e SiloPage;
- proteção contra mistura entre Brands.

### Nós

- ArticleDNA, SiloDNA e SiloPage permitidos;
- tipo do nó;
- referência canônica do artefato;
- status de identidade/publicação;
- preservação de URL, slug e canonical em publicados.

### Arestas

- edgeId;
- sourceNodeId e targetNodeId;
- direção;
- relação conceitual;
- prioridade;
- motivo semântico;
- evidências;
- anchor concepts;
- candidatos de âncora;
- status e decisão humana;
- indicação de requisito para a próxima etapa.

### Estados e versionamento

- rascunho/proposta/revisão/aprovado/bloqueado;
- stale quando o próprio nó referenciado mudar;
- aprovação humana separada de proposta IA;
- nova versão somente com mudança real;
- readback da versão e hash persistidos.

### Handoffs

- Arquiteto → Radar: o grafo não vira SERP nem permite regrouping;
- Arquiteto → Planejador: relações e conceitos, não parágrafo/quantidade final;
- Planejador → Redator: contexto e quantidade planejada;
- Redator → Publicações: URL/âncora final e integridade;
- Publicações → histórico: validação da URL sem reescrever decisão arquitetural.

## Consumidores

- Arquiteto: formação, revisão e edição humana;
- Radar: evidência/oportunidade sem alteração silenciosa;
- Planejador: seleção de seção, contexto e quantidade;
- Redator: escrita natural;
- Publicações: integridade e URL;
- futura UI React Flow: projeção visual.

Nenhum desses consumidores deve ser alterado por esta proposta antes da
decisão do contrato.

## Tenant/RLS

A identidade do tenant é brandId = public.marcas.id. O contrato deve exigir
brandId em todos os artefatos e impedir leitura/escrita cruzada. O Planner
Geral deve definir as policies/RLS e o comportamento de readback com
authenticated/service_role conforme a fundação vigente.

Não usar localStorage ou IndexedDB como substituto de persistência canônica e
não criar fallback local para esconder ausência remota.

## Versionamento, snapshot e rollback

Antes de alterar grafo consolidado:

- preservar a versão anterior;
- criar sucessora append-only;
- registrar actor, motivo e referências;
- manter hash e proveniência;
- permitir retorno à versão anterior sem apagar histórico;
- invalidar somente relações dependentes de nó que realmente mudou.

## Risco

Sem este contrato:

- o Arquiteto pode perder direção ou motivo;
- o Planejador pode interpretar uma lista como decisão final de âncora;
- Redator pode receber relação sem contexto;
- React Flow pode virar fonte de verdade acidental;
- mudanças de uma etapa podem sobrescrever outra;
- links de Brands diferentes podem misturar;
- publicado pode perder URL/slug/canonical.

## Rollback

O rollback da mudança estrutural deve ser versionado e reversível: manter o
artefato/contrato anterior, suspender novos writes do grafo, preservar os
artefatos ArticleDNA/SiloDNA/SiloPage e impedir qualquer migração destrutiva.
O plano específico de rollback pertence ao Planner Geral após escolher a
alternativa de contrato.

## Testes necessários

Antes de liberar consumidores:

- isolamento por brandId e RLS;
- criação, atualização e readback do grafo;
- hash/version/sucessor;
- nó publicado preserva URL, slug e canonical;
- arestas não aceitam IDs de outra Brand;
- proposal IA não vira aprovação;
- mudança de ArticleDNA marca apenas relações dependentes como stale;
- relation types e anchor concepts preservam proveniência;
- Radar não reagrupa;
- Planejador recebe relação sem âncora literal obrigatória;
- Redator recebe contexto/quantidade e consegue produzir âncora natural;
- Publicações valida URL final;
- React Flow não grava estado fora do contrato;
- fixtures sem chamadas pagas.

## Bloqueia

Bloqueia:

- área Links Internos como fonte de verdade;
- handoff completo ao Planejador/Redator/Publicações;
- editor React Flow real.

Não bloqueia:

- Artigos e ArticleDNA;
- Silos e SiloDNA/SiloPage;
- edição manual de artigos;
- validação SERP existente;
- proposta de IA;
- lotes locais de proveniência e gates.

## Fora do escopo funcional

Não inclui:

- aplicação remota de migration;
- execução remota de SQL;
- smoke remoto com dados reais;
- alteração de provider;
- MCP;
- React Flow;
- mudança no Radar, Planejador, Redator ou Publicações;
- limpeza ou regravação de dados;
- chamada externa.

## Registro de implementação local — 2026-08-26

O pedido foi aprovado e implementado localmente em duas migrations separáveis:

- `supabase/migrations/20260826225145_internal_link_graph_foundation.sql`;
- `supabase/migrations/20260826225154_silo_pair_atomicity.sql`.

### InternalLinkGraph

O contrato local agora possui `internal_link_graphs`,
`internal_link_graph_nodes`, `internal_link_graph_edges`,
`internal_link_graph_proposals` e `internal_link_graph_working_copies`. As
versões, nós, arestas e propostas aprováveis exigem `marca_id`, usam
`ON DELETE RESTRICT`, RLS e policies tenantizadas, preservam versionamento
append-only e diferenciam proposta de aprovação. A working copy é uma relação
persistente separada, editável por `PATCH`, com `lock_version` para concorrência
e sem crescimento de versão editorial a cada salvamento.

O grafo aceita somente nós `SILO_PAGE` e `ARTICLE_DNA`, referências de versão
verificáveis, arestas dirigidas, relações mínimas, motivo, prioridade,
conceitos de âncora, origem e proveniência. Self-link, aresta dirigida
duplicada, referência cross-Brand, predecessor incorreto e hash divergente
são rejeitados. KeywordDNA não é nó e SiloPage não é Pilar.

`contentHash` é calculado somente sobre a estrutura canônica do grafo:
referências, nós e arestas normalizados deterministicamente. `warnings` e
`conflicts` continuam preservados como diagnóstico/proposta no payload, mas
não são estado estrutural aprovado; uma alteração somente nesses campos não
cria uma nova versão do grafo. Metadados de layout/viewport também não entram
no hash.

`public.persist_internal_link_graph(uuid,uuid,text,jsonb)` repete as
validações de actor/Brand/ação, adquire lock por Brand/Graph, persiste parent,
nodes e edges e retorna o readback. É `SECURITY INVOKER`, fixa
`search_path` e recebe EXECUTE somente de `service_role`; a rota server-side
resolve previamente o contexto canônico.

### Atomicidade do par

`public.persist_silo_pair_atomic(uuid,uuid,text,jsonb,jsonb,text,text)`
substitui, no caminho de consolidação humana, a sequência
`write/readback → write/readback`. A função valida actor, Brand, identidade,
versões, hashes e referência SiloPage → SiloDNA, usa lock transacional por
Brand/Silo e executa os dois inserts dentro da mesma transação. Falha em
qualquer etapa aborta o par inteiro. SiloDNA e SiloPage continuam entidades,
versionamentos e aprovações distintos.

O catálogo de listas e o workflow continuam fora desse boundary de artefatos;
essa limitação é explícita e não é apresentada como atomicidade total do
fluxo editorial.

### Código e handoff

O Arquiteto usa `/api/arquiteto/silo-pair` e o repository server-side
`persistSiloPairAtomic`. A consolidação do workspace chama uma única operação
pareada e faz readback das duas entidades. O graph possui rotas server-side de
leitura, persistência e propostas. O `RadarPlannerHandoff` recebeu somente a
referência opcional `internalLinkGraphRef`, preservando itens antigos e sem
permitir que Radar altere a estrutura do grafo.

### Rollback local

Os artefatos de rollback são:

- `supabase/rollback/20260826225145_internal_link_graph_foundation.rollback.sql`;
- `supabase/rollback/20260826225154_silo_pair_atomicity.rollback.sql`.

O primeiro remove as RPCs, working copy, propostas, edges, nodes, graph e
guards na ordem correta; o segundo remove somente a RPC pareada. Ambos usam `BEGIN/COMMIT`,
não usam `CASCADE`, não removem artefatos editoriais existentes e não são
executados automaticamente.

### Evidência e estado

Testes locais focados de domínio/estrutura passaram **13/13**. Os preflights
`supabase/scripts/internal-link-graph-foundation-preflight-read-only.sql` e
`supabase/scripts/silo-pair-atomicity-preflight-read-only.sql` são
catalog-only, retornam quatro colunas (`check_name`, `object_name`, `observed`,
`verdict`) e não contêm DDL, DML ou TEMP. O resultado remoto do estado
pré-aplicação está registrado abaixo; a validação pós-apply ainda depende da
execução manual das migrations.

```text
LOCAL_CONTRACTS = IMPLEMENTED
LOCAL_MIGRATIONS = READY
LOCAL_ROLLBACK = READY_NOT_AUTOMATIC
REMOTE_MIGRATIONS = NOT_APPLIED
REMOTE_PREFLIGHT = PASS_PRE_APPLY_READ_ONLY
REMOTE_WRITES = 0
PAID_AI_CALLS = 0
```

O preflight remoto read-only registrado foi executado no projeto vinculado
antes da adição local da working copy. Para o InternalLinkGraph, os quatro
alvos e as seis funções alvo então auditados estavam ausentes, as três relações
prévias (`marcas`,
`editorial_artifact_versions` e `auth.users`), os três helpers canônicos e os
papéis `anon`/`authenticated`/`service_role` estavam presentes; o contrato
posterior registrou 16 FKs `RESTRICT`, 9 triggers e 6 funções de guarda como
informação para o pós-apply. Para a atomicidade, a RPC alvo estava ausente, as
14 colunas do artefato, a relação, a função e a trigger de validação de origem
estavam presentes, e o RLS do artefato estava habilitado. A nova relação e a
RPC de working copy ainda exigem preflight remoto próprio antes da aplicação.
Nenhum desses comandos aplicou DDL/DML.

**Ordem manual após preflight:** aplicar primeiro
`20260826225145_internal_link_graph_foundation.sql`; confirmar seu readback;
aplicar depois `20260826225154_silo_pair_atomicity.sql`; confirmar o readback
do par. Nenhuma dessas ações remotas foi executada pelo agente.


