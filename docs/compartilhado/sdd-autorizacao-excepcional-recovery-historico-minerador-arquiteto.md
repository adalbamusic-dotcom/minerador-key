# SDD — autorização excepcional de recovery histórico Minerador → Arquiteto

**Módulo proprietário:** Fundação de autorização / recovery histórico Minerador → Arquiteto  
**Tipo:** mudança estrutural de autorização, schema e auditoria  
**Status:** Aprovado para implementação local da camada transacional  
**Implementação:** 0030 aplicada e verificada remotamente conforme relato do usuário; RPCs e writer ainda não realizados  
**Operações remotas desta fase:** Nenhuma  
**Classificação:** `READY_FOR_TRANSACTIONAL_RPCS_LOCAL_IMPLEMENTATION`

## 1. Decisão proposta

Formalizar a operação excepcional:

```text
historical_import_recovery:execute
```

Ela permite exclusivamente criar o guard canônico `historical_import_protected` para keywords históricas elegíveis da Brand indicada. Não é uma ação editorial cotidiana, não cria ArticleDNA e não substitui o handoff normal.

Esta operação não é equivalente a `arquiteto:create`, `marca:manage`, `arquiteto:manage`, a uma capability operacional de Agency, nem ao papel global `admin`.

## 2. Escopo e invariantes

Todo grant e toda execução são vinculados a `marca_id = public.marcas.id`.

- não há grant global;
- nome, slug, owner, e-mail, armazenamento local e seleção de UI não substituem `marca_id`, `actor_user_id` ou IDs reais de keyword;
- Agency não se torna tenant: a Brand continua sendo a fronteira da autorização;
- o grant não cria acesso editorial geral, membership, ownership nem vínculo Agency → Brand;
- o estado `publicado` continua sob a proteção canônica própria e não recebe guard histórico redundante.

O candidato de recovery deverá ter marcador histórico válido, pertencer à Brand solicitada, não estar publicado ou protegido por regra equivalente e não possuir workflow canônico existente.

## 3. Atores: recebimento, concessão e execução

### Quem pode receber um grant

Podem ser destinatários, somente mediante concessão explícita por Brand:

- owner da Brand;
- Brand admin;
- Admin global de suporte;
- membro da Brand ou actor de Agency, quando uma decisão humana de delegação específica o permitir.

Esses papéis são apenas elegibilidade para receber. Nenhum deles recebe o grant automaticamente.

### Quem pode conceder ou revogar

Na primeira versão, somente Admin global de Plataforma poderá conceder, renovar por nova concessão ou revogar o grant. O emissor deve ser autenticado, ser provado no banco por `canonical_assert_rpc_actor(...)` e `canonical_actor_is_global_admin(...)`, e ser registrado no grant ou na revogação.

Conceder não equivale a executar. Um Admin global pode, em tese, receber grant para si, mas somente uma linha explícita, com motivo, validade e Brand, poderá fazê-lo; `perfis.role = admin` não é bypass. A autoridade de Plataforma administra somente o lifecycle do grant: não substitui `canonical_actor_can_access_brand(...)` na execução e não torna o Admin global owner, membro ou executor operacional da Brand.

### Quem pode executar

O executor precisa, simultaneamente:

1. possuir sessão autenticada e `actorUserId` válido;
2. informar Brand explícita e válida;
3. possuir acesso canônico atual àquela Brand por relação independente já reconhecida pelo contrato;
4. possuir grant ativo, não expirado e não revogado para `historical_import_recovery:execute` naquela Brand;
5. passar as validações próprias do writer para cada keyword selecionada.

Assim, um grant isolado não cria acesso à Brand, e o acesso normal isolado não autoriza recovery. Um Admin global sem relacionamento canônico atual com a Brand não pode executar só por possuir o papel ou o grant. A Agency também não herda a operação por `arquiteto`, `brand_data`, owner ou `agency_admin`.

## 4. Heranças proibidas

São expressamente proibidas as seguintes composições automáticas:

- `canonical_actor_can_use_brand_action(..., 'arquiteto', 'create')`;
- `marca:manage`, `arquiteto:manage` ou outro `module:action` cotidiano;
- capability `arquiteto`, `brand_data` ou qualquer capability operacional atual da Agency;
- `perfis.role = 'admin'` sem grant explícito e sem acesso canônico atual à Brand;
- `service_role` como bypass do ator humano autorizado;
- owner, membership, nome, slug, e-mail ou marker local como prova suficiente por si só.

## 5. Persistência proposta

O schema atual não possui uma relação temporal, revogável e auditável entre Brand, ator e operação excepcional. Portanto, `EXISTING_SCHEMA_SUFFICIENT` é falso.

### 5.1 Grants

Propor a tabela `public.brand_exceptional_operation_grants`:

| Campo | Contrato |
| --- | --- |
| `id` | UUID técnico do grant. |
| `marca_id` | FK para `public.marcas(id)`, `ON DELETE RESTRICT`. |
| `actor_user_id` | FK para `auth.users(id)`, `ON DELETE RESTRICT`. |
| `operation` | Inicialmente somente `historical_import_recovery:execute`; extensível apenas por nova SDD. |
| `status` | `active`, `expired` ou `revoked`; nunca apagado como fluxo normal. |
| `granted_by_actor_user_id` | FK para `auth.users(id)`, `ON DELETE RESTRICT`. |
| `granted_at` | instante de emissão. |
| `expires_at` | obrigatório, posterior a `granted_at`. |
| `revoked_at` / `revoked_by_actor_user_id` | revogação auditável; FK `ON DELETE RESTRICT` para o ator quando presente. |
| `reason` | motivo obrigatório, persistido como `btrim(reason)`, entre 1 e 500 caracteres após canonicalização; sem segredo, token ou payload editorial. |

Um grant é utilizável somente quando `status = active`, `revoked_at IS NULL` e `expires_at > now()`. A expiração é obrigatória na primeira versão. A renovação cria nova concessão com novo período, preservando a anterior como revogada ou expirada; nunca altera `expires_at` da mesma linha.

Existe no máximo um grant ativo por `(marca_id, actor_user_id, operation)`, garantido por índice único parcial `WHERE status = 'active'`. Antes de uma nova concessão, a operação emissora deve, na mesma transação:

1. transicionar `active` vencido para `expired`;
2. rejeitar como conflito um `active` ainda válido;
3. inserir nova linha somente quando não restar `active` válido.

O índice de lookup inclui `(marca_id, actor_user_id, operation, status, expires_at)`. A transição explícita evita depender de predicado temporal volátil e preserva o histórico de grants vencidos e revogados.

### 5.2 Auditoria de execução

Propor tabela append-only `public.brand_exceptional_operation_execution_events`, separada de Usage de integrações, com um evento por guard/keyword:

- `id`, `execution_request_id`, `marca_id`, `operation`, `grant_id`, `actor_user_id` e `workflow_item_id`;
- `occurred_at`;
- resultado MVP `created` ou `already_protected`.

`execution_request_id` identifica a execução em lote e é compartilhado pelos eventos daquela solicitação. `workflow_item_id` referencia diretamente `public.editorial_workflow_items(id)` com `ON DELETE RESTRICT`. As FKs para grant, Brand e identidades também usam `ON DELETE RESTRICT`. A idempotência da auditoria é garantida por `UNIQUE (execution_request_id, workflow_item_id)`.

Não há JSON de guards nem join table adicional. O evento não substitui os registros de `editorial_workflow_items`; ele prova a autorização e a execução excepcional.

## 6. Helpers e fronteira server-side

O helper dedicado abaixo já foi introduzido pela 0030 e relatado como verificado remotamente:

```text
canonical_actor_can_execute_brand_exceptional_operation(
  target_brand_id,
  target_actor_user_id,
  target_operation
)
```

Ele deve verificar sessão/ator no boundary server-side, acesso canônico atual à Brand e grant ativo para a operação. Não deve delegar a decisão para o browser, para RLS permissiva nem reutilizar diretamente `canonical_actor_can_use_brand_action`.

O writer futuro deverá chamar esse helper dentro da RPC antes de qualquer escrita e permanecer separado de `POST /api/arquiteto/handoff`. As RPCs devem ainda chamar `canonical_assert_rpc_actor(...)`, usar UUIDs reais, `SECURITY DEFINER`, `search_path = pg_catalog, public, pg_temp` e grants mínimos. Nenhum segredo ou service role pode chegar ao navegador.

## 7. Writer futuro e boundary editorial

O writer futuro será server-side, explícito, idempotente e Brand-scoped.

### 7.1 Atomicidade do lote e do item

O recovery usa atomicidade **por item**. Não existe uma transação única para todo o lote de `keywordIds`.

Antes de qualquer escrita, a requisição valida autenticação, `actorUserId`, Brand explícita, acesso canônico atual, grant ativo para `historical_import_recovery:execute`, payload e `executionRequestId` válido. Falha em qualquer gate global aborta a requisição inteira com zero guards e zero execution events.

Depois do gate global, cada keyword é independente. Item publicado, `received`, inválido ou em conflito não reverte itens válidos já confirmados nem impede o processamento dos itens seguintes.

Para um novo guard, criar `historical_import_protected`, realizar readback e registrar o execution event devem pertencer à **mesma transação de banco por keyword**. Se readback ou evento falhar, o guard recém-criado daquele item não pode permanecer confirmado. O runtime TypeScript não pode simular essa transação por uma sequência de chamadas Supabase independentes.

O guard `historical_import_protected` já existente não cria nova linha e resulta em `already_protected`, com event idempotente para o mesmo `executionRequestId`. A unicidade de workflow e `UNIQUE (execution_request_id, workflow_item_id)` continuam obrigatórias.

Resultados da resposta por item:

- `created`;
- `already_protected`;
- `published_protected`;
- `received_conflict`;
- `invalid_or_stale`;
- `failed`.

O resumo do lote deve ser explícito e não pode reportar sucesso total quando houver conflito ou falha. Apenas `created` e `already_protected` registram execution event; os demais resultados não criam event de guard. Não há JSON de guards, tabela N:N ou propagação de keyword para módulos posteriores.

### 7.2 RPC transacional sucessora obrigatória

A auditoria local confirmou que os repositórios atuais escrevem e leem `editorial_workflow_items` por chamadas Supabase independentes e não existe RPC que una guard, readback e `brand_exceptional_operation_execution_events`. Portanto, o writer exige uma RPC transacional sucessora antes da implementação runtime.

O próximo artefato candidato é `0031_exceptional_operation_transactional_rpcs.sql`; `0031` é o próximo número local livre nesta revisão e deve ser reconfirmado antes de qualquer implementação. Ele não altera a 0030 nem cria tabelas novas.

#### Contrato da RPC por keyword

```text
canonical_execute_historical_import_recovery_item(
  target_brand_id uuid,
  target_actor_user_id uuid,
  target_execution_request_id uuid,
  target_keyword_id uuid
)
```

A operação é fixa em `historical_import_recovery:execute`. A RPC não aceita `grant_id`, `workflow_item_id`, estado, resultado, payload editorial ou operation fornecidos pelo chamador. Ela resolve internamente o grant ativo aplicável e devolve somente `result`, `workflow_item_id` e `execution_event_id`, sem payload editorial, keyword, token ou segredo.

A ordem determinística é obrigatória:

1. chamar `canonical_assert_rpc_actor(target_actor_user_id)` e validar os quatro UUIDs;
2. chamar `canonical_actor_can_execute_brand_exceptional_operation(target_brand_id, target_actor_user_id, 'historical_import_recovery:execute')`; em falso, abortar sem escrita;
3. resolver internamente o grant ativo, não revogado e não vencido que fundamenta o helper;
4. localizar a keyword por `keywords_kgr.id` e `brand_id`; ausente ou de outra Brand retorna `invalid_or_stale`, sem escrita;
5. localizar de forma determinística o workflow canônico da keyword, respeitando a unicidade existente;
6. somente se não houver workflow, avaliar `keyword.status = publicado`;
7. somente sem workflow e sem publicação criar o guard `historical_import_protected` com os campos canônicos existentes; nunca criar ArticleDNA, workflow ou payload editorial.

Quando existir workflow, a RPC deve primeiro procurar o evento por `(execution_request_id, workflow_item_id)`. Se existir, retorna o resultado originalmente registrado. Se houver guard `historical_import_protected` e não houver evento para aquela request, insere o único evento `already_protected` e o retorna. Estado `received` resulta em `received_conflict`, sem escrita e sem evento. Outro estado de workflow é erro contratual sanitizado, sem overwrite; o writer converte-o em `failed` no resumo do lote.

Sem workflow, keyword `publicado` resulta em `published_protected`, sem escrita e sem evento. Keyword inexistente, de outra Brand ou obsoleta resulta em `invalid_or_stale`, sem escrita e sem evento. Os únicos eventos persistidos continuam sendo `created` e `already_protected`, como definido na 0030.

Criar o guard, confirmar seu readback, inserir o evento `created` e devolver o resultado devem ocorrer na mesma transação PostgreSQL do item. `UNIQUE (execution_request_id, workflow_item_id)` deve ser resolvido por insert/readback idempotente dentro da RPC: retry da mesma request devolve o resultado original (`created` continua `created`); request nova para guard existente gera `already_protected`. Falha em qualquer etapa reverte o guard daquele item. Não é permitido simular essa atomicidade em TypeScript com chamadas independentes.

Para cada ID selecionado, o writer futuro deverá:

1. validar os gates globais uma vez antes de iniciar o lote;
2. chamar a RPC uma vez por keyword, sem transação global;
3. conservar o resultado explícito por item (`created`, `already_protected`, `published_protected`, `received_conflict`, `invalid_or_stale` ou `failed`);
4. retornar resumo que não mascare conflito ou falha como sucesso total.

#### RPCs administrativas de grants

As tabelas da 0030 não concedem escrita a `authenticated`; portanto a emissão precisa de RPC administrativa dedicada, server-side, também na migration sucessora. Ela deve receber apenas emissor, Brand, destinatário, `expires_at` e `reason`; fixar a operation; canonicalizar `reason` com `btrim`; validar 1..500 caracteres; validar o emissor com `canonical_assert_rpc_actor(...)` e `canonical_actor_is_global_admin(...)`; e registrar `granted_by_actor_user_id` a partir do emissor autenticado.

Na mesma transação, a emissão deve bloquear o grant ativo equivalente quando existente, expirar `active` vencido, rejeitar `active` ainda válido e inserir uma nova linha apenas sem active válido. O índice único parcial permanece a proteção definitiva contra corrida de inserção; conflito concorrente deve retornar erro explícito, nunca sobrescrever validade. A RPC não pode receber status, `revoked_at`, `granted_by_actor_user_id` arbitrário nem operation do chamador.

Revogação requer RPC administrativa dedicada como fronteira de autorização, embora sua mutação seja somente a transição atômica de uma linha `active` para `revoked`. Ela deve autenticar e exigir Admin global no banco, bloquear o grant alvo, preencher `revoked_at` e `revoked_by_actor_user_id`, preservar `reason` e nunca apagar o registro. Não exige uma segunda unidade transacional multi-item, mas não pode ser UPDATE direto do runtime nem usar bypass global inventado.

O boundary permanece:

```text
Minerador → keyword como insumo → Arquiteto → ArticleDNA
```

Depois de ArticleDNA, Radar, Planejador, Redator e Publicações operam artigos e entidades sucessoras; keyword fica somente como proveniência. Esses módulos não são consumidores deste contrato.

## 8. RLS, grants e migração futura

Uma migration sucessora será obrigatória. Ela deverá incluir, antes da aplicação remota:

1. preflight read-only e snapshot de schema, ACL/RLS, definições e dados de grants/eventos antes da aplicação;
2. criação aditiva somente das RPCs de item, emissão e revogação, sem nova tabela e sem alteração da 0030;
3. `SECURITY DEFINER`, owner administrativo `postgres`, `search_path = pg_catalog, public, pg_temp` e `VOLATILE` para as RPCs mutáveis;
4. nenhum EXECUTE para `PUBLIC`, `anon` ou `authenticated`; `service_role` é o único consumidor de aplicação autorizado, com EXECUTE; EXECUTE do owner administrativo é permitido;
5. autorização obrigatória dentro de cada RPC, sem confiar no service role como bypass;
6. post-verifier de catálogo para assinatura, owner, `SECURITY DEFINER`, `search_path`, ACL, ausência de tabelas novas, constraints 0030, idempotência e resultado dos caminhos de erro somente por inspeção estática/fixtures locais;
7. rollback que desabilite ou revogue somente EXECUTE das RPCs novas, preservando grants, eventos e guards como evidência.

Não há migration sucessora, SQL remoto, RPC, grant real ou backfill autorizado por esta atualização documental.

## 9. Consumidores futuros limitados

- superfície administrativa que concede, renova ou revoga grants;
- preview server-side de recovery;
- writer histórico server-side;
- modal do Arquiteto que explica a proteção, sem conceder nem executar;
- auditoria sanitizada.

Não inclui Radar, Planejador, Redator ou Publicações.

## 10. Riscos e rollback conceitual

Riscos a prevenir:

- elevar permissões editoriais cotidianas para recovery excepcional;
- bypass de Admin global ou Agency;
- grant fora da Brand ou persistente além do necessário;
- uso de grant expirado/revogado;
- criação de guard para keyword publicada, de outra Brand ou com workflow;
- reexecução não idempotente, conflito de grant ativo, perda de marcador local ou falta de evidência;
- confirmar guard sem event/readback por falta de transação real;
- exposição de IDs, payloads, tokens ou motivos sensíveis na UI/log.

Rollback conceitual de uma implementação futura:

1. desabilitar o endpoint/RPC de emissão e writer após decisão humana;
2. revogar grants ainda ativos;
3. manter grants, eventos e guards como evidência histórica;
4. não apagar `historical_import_protected`, ArticleDNA, workflow ou armazenamento local;
5. executar readback e auditoria antes de qualquer nova proposta de reversão.

## 11. Critérios para aprovação e implementação futura

- aprovação humana desta SDD e da política de delegação;
- definição da migration sucessora de RPC transacional, preflight, snapshot, rollback e post-verifier;
- revisão de RLS/ACL e helpers server-side;
- testes de grant ativo, expirado, revogado, Brand divergente, ausência de acesso, Admin global sem bypass, Agency sem herança ampla, publicado, workflow existente, idempotência e auditoria;
- smoke remoto somente após autorização específica.

Esta atualização não autoriza grant real, writer runtime, guard remoto, recovery, backfill, SQL remoto, aplicação de migration, limpeza de storage, commit, push ou deploy. A implementação do writer permanece bloqueada até a RPC transacional sucessora ser aprovada e aplicada.
