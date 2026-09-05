# Smoke manual controlado — Fase 2C (SiloWorkingCopy → Consolidação → SiloPage)

Roteiro de execução **manual**, na interface e com SQL somente-leitura de conferência.
Quem executa é o PLANNER. Nada aqui roda automaticamente.

- `PROVIDER_CALLS = 0` — nenhum passo aciona IA, SERP, DataForSEO ou Google Ads.
- `NEW_DDL = 0`, `NEW_MIGRATION = 0` — as duas migrations da 2C já estão aplicadas.
- Todo SQL abaixo é `SELECT`. Nenhum passo escreve por SQL.

## Placeholders

| Placeholder | Como obter |
|---|---|
| `<BRAND_ID>` | `public.marcas.id` da marca ativa na sessão |
| `<TERRITORY_REF>` | `territory:<uuid>` do território **confirmado** que será consolidado |
| `<WORKING_COPY_REF>` | `silo-working-copy:<TERRITORY_REF>` — derivado, nunca digitado |
| `<ACTOR_USER_ID>` | `auth.uid()` da sessão que está clicando |

Nenhum deles é fixo no código. Não substituir por valor de outra marca.

## Pré-condições

1. Sessão autenticada com acesso ao módulo `arquiteto` da marca.
2. Um Território com `lifecycleStatus = confirmed` e `decisionState = confirmed`.
3. Pelo menos 2 ArticleDNA aprovados, todos com o **mesmo** `territoryRef`.
   Grupo com dois territórios diferentes é recusado como `AMBIGUOUS_TERRITORY`
   e a proposta fica só local — isso é comportamento esperado, não falha.

Conferência (somente leitura):

```sql
select subject_id, state, lock_version,
       payload->'territory'->>'lifecycleStatus' as lifecycle,
       payload->'territory'->>'decisionState'   as decision
from public.editorial_workflow_items
where marca_id = '<BRAND_ID>'
  and subject_type = 'territory'
  and subject_id = '<TERRITORY_REF>';
```

---

## A · Criar a working copy

Aba **Silos** → **Gerar DNA dos Silos** (formação da working copy).

Esperado: notificação de *working copy criada no servidor e confirmada por readback*.
O card passa a exibir o selo **Remota**.

## B · Readback

```sql
select subject_id, state, lock_version,
       payload->'workingCopy'->>'territoryRef'            as territory_ref,
       payload->'workingCopy'->'pillarSelection'          as pillar_selection,
       payload->'workingCopy'->'supportArticleIds'        as supports,
       payload->'workingCopy'->'exclusions'               as exclusions
from public.editorial_workflow_items
where marca_id = '<BRAND_ID>'
  and subject_type = 'silo_working_copy'
  and subject_id = '<WORKING_COPY_REF>';
```

Esperado: `pillar_selection` **null**. A sugestão da Lógica vive em
`pillarSuggestionArticleId`, e sugestão não é decisão.

Anotar `lock_version` como `LOCK_B`.

## C · Reload

Recarregar a página (F5). O card deve voltar com o selo **Remota** e a mesma
composição. Se a proposta local reaparecer como autoridade, é falha.

## D · Selecionar o Pilar (decisão humana)

No card, escolher o Pilar no seletor.

Esperado: *Pilar humano persistido na working copy remota*.

```sql
select lock_version,
       payload->'workingCopy'->'pillarSelection'->>'articleId'   as pillar,
       payload->'workingCopy'->'pillarSelection'->>'actorUserId' as actor,
       payload->'workingCopy'->'pillarSelection'->>'decidedAt'   as decided_at,
       payload->'workingCopy'->'pillarSelection'->'decidedOverArticleIds' as decided_over
from public.editorial_workflow_items
where marca_id = '<BRAND_ID>' and subject_id = '<WORKING_COPY_REF>';
```

Esperado: `actor = <ACTOR_USER_ID>`, `decided_over` com a composição vigente,
`lock_version = LOCK_B + 1`.

## E · Suportes e exclusões

Usar **Excluir um Article deste Silo** para excluir um artigo.

Esperado: o excluído sai de `supportArticleIds` **na mesma escrita**, e aparece
em `exclusions` com ator, momento e motivo. Reexecutar o SELECT de B.

## F · Update PASS

Trocar o Pilar de novo. Esperado: sucesso, `lock_version` incrementa.

## G · Update STALE — deve BLOQUEAR

1. Abrir a mesma marca em **duas abas**.
2. Na aba 1, trocar o Pilar (lock avança).
3. Na aba 2 (sem recarregar), trocar o Pilar.

Esperado na aba 2:
- recusa `STALE_WORKING_COPY`;
- aviso visível: *a working copy mudou no servidor…*;
- o estado remoto é recarregado;
- **nada foi sobrescrito** — reexecutar o SELECT de D e confirmar que o Pilar é
  o da aba 1.

Não deve haver retry automático.

## H · Montar SiloDNA/SiloPage e consolidar

Clicar em **Confirmar e consolidar SiloDNA e SiloPage**.

O que o servidor faz (nenhum destes gates é do browser):
readiness → confirmação humana → binding semântico → ArticleDNA version/hash →
Território (incluindo `territoryNarrative`) → identidade publicada → proveniência.

## I/J · Status independentes

Esperado após a consolidação:
- `siloDnaStatus = approved` (decisão humana de consolidação);
- `siloPageStatus = proposed`.

A SiloPage **não** sobe junto. Para aprová-la é preciso decisão própria, que
carrega `siloPageVersionId`, `siloPageContentHash` e `siloDnaVersionId`.
Tentar `siloPageStatus = approved` sem essa decisão deve recusar com
`SILO_PAGE_APPROVAL_GATE_MISSING`.

## K/L/M/N · Readback dos quatro artefatos

```sql
-- Território consolidado
select subject_id, payload->'territory'->>'lifecycleStatus' as lifecycle,
       payload->'territory'->'consolidation' as consolidation
from public.editorial_workflow_items
where marca_id = '<BRAND_ID>' and subject_id = '<TERRITORY_REF>';

-- SiloDNA e SiloPage versionados
select artifact_type, version_id, version_number, content_hash, created_at,
       payload->>'territoryRef'      as territory_ref,
       payload->>'workingCopyRef'    as working_copy_ref,
       payload->'territoryNarrative' as territory_narrative
from public.editorial_artifact_versions
where marca_id = '<BRAND_ID>'
  and artifact_type in ('silo_dna','silo_page')
order by created_at desc
limit 4;
```

Esperado:
- Território em `consolidated`, com `consolidation` apontando SiloDNA e SiloPage;
- `territory_narrative` do SiloDNA **idêntica** à `narrative` do Território;
- `working_copy_ref` e `workingCopyLockVersion` presentes.

Anotar `version_id` e `created_at` do SiloDNA como `VID` e `CREATED_AT`.

## O · Retry do MESMO envelope

Sem recarregar, clicar em consolidar de novo.

Esperado: replay idempotente. **Nenhuma versão nova**:

```sql
select count(*) as versoes, min(created_at) as primeira, max(created_at) as ultima
from public.editorial_artifact_versions
where marca_id = '<BRAND_ID>' and artifact_type = 'silo_dna'
  and payload->>'territoryRef' = '<TERRITORY_REF>';
```

`versoes` não pode aumentar, e `version_id` continua `VID` com `created_at`
igual a `CREATED_AT`. Se surgir `version_id` novo, o envelope foi reconstruído —
é exatamente o defeito que o dono do envelope existe para impedir.

## P/Q · Alterar a WC depois da consolidação — deve BLOQUEAR

Tentar trocar o Pilar no card já consolidado.

Esperado:
- os controles ficam **desabilitados** (card com selo *Consolidada*);
- se forçado por rota, recusa `WORKING_COPY_ALREADY_CONSUMED` e a interface
  entra em somente-leitura.

---

## Registro do resultado

| Passo | Esperado | Observado |
|---|---|---|
| A | WC criada + readback | |
| B | `pillarSelection = null` | |
| C | autoridade remota após reload | |
| D | Pilar humano com ator/momento/motivo/composição | |
| E | exclusão sai dos Suportes na mesma escrita | |
| F | update PASS, lock incrementa | |
| G | `STALE_WORKING_COPY`, sem sobrescrever | |
| H | consolidação pelo caminho canônico | |
| I/J | `approved` / `proposed`, independentes | |
| K–N | quatro artefatos + narrativa preservada | |
| O | replay sem versão nova | |
| P/Q | `WORKING_COPY_ALREADY_CONSUMED` | |
