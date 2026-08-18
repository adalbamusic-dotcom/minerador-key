# Adendo estrutural 0036 — renomeação das entidades canônicas do Minerador

- **Módulo proprietário:** Minerador
- **Tipo:** decisão estrutural e gate de aplicação manual
- **Migration:** `supabase/migrations/0036_rename_minerador_keyword_entities.sql`
- **Status:** aprovado para aplicação manual remota
- **Operação remota do agente:** `NONE`

## Decisão

Autorizar a aplicação manual da 0036 para renomear as relações existentes:

```text
public.keywords_kgr  -> public.minerador_keywords
public.listas_kgr    -> public.minerador_keyword_lists
```

O rename é sem cópia, recriação ou apagamento de dados. A migration 0036 e as
migrations históricas permanecem sem alteração neste adendo.

## Justificativa canônica

Keyword é a entidade operacional canônica do Minerador. KGR permanece como
métrica, triagem e qualificação; não define a identidade física da entidade.
O Minerador continua sendo o único módulo que opera keywords, e o Arquiteto
recebe keywords aprovadas como insumo sem perder a proveniência nas etapas
posteriores.

## Contratos preservados

- `brandId` continua sendo o tenant editorial canônico.
- `lista_id` continua opcional.
- KGR, allintitle, volume e demais métricas permanecem preservados.
- RLS, grants, policies e isolamento por Brand permanecem preservados.
- keyword → Brand permanece `ON DELETE RESTRICT`.
- keyword → lista permanece `ON DELETE RESTRICT`.
- lista → Brand permanece `ON DELETE RESTRICT`.
- measurement → keyword permanece `ON DELETE CASCADE` intencional.
- `briefings_artigos.silo_id` → lista permanece temporariamente por
  compatibilidade.

## Limpeza incorporada

A 0036 remove somente a FK histórica redundante:

```text
listas_kgr_marca_id_fkey        ON DELETE CASCADE  -> removida
fk_listas_kgr_marca_0005        ON DELETE RESTRICT -> preservada
```

Não há remoção de tabelas, dados, RLS, policies, grants, métricas, listas ou
vínculos editoriais. A dependência de `briefings_artigos.silo_id` não faz parte
desta limpeza.

## Consumidores, risco e mitigação

Todos os consumidores runtime ativos foram adaptados localmente para os nomes
canônicos. Referências em migrations históricas permanecem históricas e não
são alteradas.

O risco principal é a existência de função, FK, policy, trigger ou consumidor
ativo ainda referenciando os nomes antigos. O gate foi mitigado por:

- preflight remoto read-only;
- par histórico CASCADE/RESTRICT validado antes do apply;
- rewrite explícito das funções mapeadas;
- post-verifier estrito;
- regressões locais do Minerador e do handoff para o Arquiteto;
- confirmação de que as tabelas estão atualmente vazias.

## Rollback

Existe rollback local preparado para o rename reverso. Ele é somente assistido,
não está autorizado para execução automática e não deve ser executado sem nova
revisão humana e evidência do estado remoto.

## Evidência do gate

Os valores abaixo foram informados como resultado do preflight remoto deste
gate; nenhuma consulta ou alteração remota foi executada pelo agente nesta
tarefa.

```text
EXPECTED_PRE_MIGRATION_PAIR = PASS
PRECHECK_GATE = READY
structural_failures = 0

keywords_kgr rows = 0
listas_kgr rows = 0
RLS = PASS

external_catalog:
rows=7075
fingerprint=b0e37afd4f93e0727bda633a834f3ea2

target_shape:
rows=48
fingerprint=ff287ace547da5adaa424e5558fa1df2
```

## Aceite e limites

```text
0036_STRUCTURAL_DECISION = APPROVED_FOR_MANUAL_REMOTE_APPLY
REMOTE_OPERATION = NONE
```

Os testes locais informados para este gate permanecem aprovados: regressão do
Minerador, handoff do Arquiteto, TypeScript, build, lint direcionado e
`git diff --check`.

Este adendo autoriza somente a aplicação manual da migration pelo responsável
humano. Não autoriza execução remota pelo agente, commit, push, deploy, mudança
de código, alteração de schema fora da 0036 ou atualização de
`estado-atual.md`/`backlog.md`. A consolidação desses documentos fica reservada
para o fechamento do bloco.
