# SDD — Persistência server-side de `results_allintitle`

Status: **Aprovada para implementação nesta solicitação.**

## Módulo e autorização

Módulo proprietário: Minerador.

Esta SDD cobre exclusivamente a persistência server-side de `results_allintitle` e a troca localizada do caminho de persistência do allintitle. Não autoriza alteração de schema, migration, RLS remota, autenticação global, importação, volume ou outros módulos.

## Problema

O Minerador já coleta `results_allintitle` pela Extensão, mas não possuía endpoint dedicado. O workspace atualizava `keywords_kgr` diretamente após receber o resultado, enquanto a arquitetura background-owned exige que a Extensão envie cada resultado ao servidor autenticado e que a interface só reflita a persistência confirmada.

## Contrato proposto

Endpoint:

`POST /api/extensao/marcas/[brandId]/keywords/resultados-allintitle`

Payload:

```json
{
  "operationRequestId": "uuid",
  "batchId": "uuid",
  "results": [
    {
      "requestId": "uuid",
      "keywordId": "uuid",
      "status": "success",
      "resultsAllintitle": 12,
      "measuredAt": "2026-07-29T12:00:00.000Z"
    }
  ]
}
```

O lote possui de 1 a 10 itens. `success` exige inteiro não negativo; `zero_results` exige exatamente `0`. Estados `unavailable`, `captcha`, `blocked`, `error`, `timeout` e `cancelled` não alteram a métrica.

Resposta por item:

```json
{
  "ok": true,
  "operationRequestId": "uuid",
  "batchId": "uuid",
  "results": [
    {
      "requestId": "uuid",
      "keywordId": "uuid",
      "outcome": "persisted",
      "resultsAllintitle": 12,
      "reason": null
    }
  ]
}
```

Os outcomes são `persisted`, `preserved`, `rejected` e `failed`. O endpoint não aceita `brandId` concorrente no corpo nem `actorUserId` como autoridade.

## Autenticação e autorização

A rota reutiliza `requireExtensionSessionProfile` e `requireTenantPermission` usados pelas rotas autenticadas da Extensão. O ator é derivado da sessão server-side; o `brandId` canônico vem da rota e cada `keywordId` é conferido em `keywords_kgr` dentro desse tenant. Marca divergente, sessão ausente, keyword inexistente ou keyword de outra marca são rejeitados.

## Persistência e idempotência

São usados somente os campos existentes de `keywords_kgr`. Sucesso e zero atualizam `results_allintitle` e preservam os demais campos. Falhas preservam o valor anterior e nunca gravam `null` ou inferem zero. Repetir o mesmo `brandId`, `keywordId`, `batchId`, `requestId` e valor é idempotente em efeito por atualizar a mesma linha.

## Consumidores e compatibilidade

- `minerador-extensao/background.js`: envia cada resultado terminal confirmado ao endpoint.
- `modules/minerador/minerador-workspace.tsx`: deixa de escrever diretamente `keywords_kgr` no fluxo allintitle e aplica na interface somente a resposta persistida.
- Leitores, exportações, volume, importação, KGR e consumidores de outros módulos continuam usando o campo existente sem alteração de schema.

## Correção localizada da pré-condição de silo — 2026-07-29

A implementação confirmou que o contrato do endpoint e o transporte background-owned já validavam a keyword por `keywordId` e `brandId`, sem exigir `lista_id` ou silo. A correção removeu somente os dois guards do workspace que exigiam vínculo a uma lista antes de iniciar e antes de reconciliar a medição. O payload, endpoint, schema, persistência server-side, isolamento tenantizado e sequência da Extensão permanecem inalterados.

Uma keyword é elegível quando possui ID técnico, texto não vazio, `brand_id` igual à marca ativa e seleção explícita. A ausência de silo, lista, categoria, ArticleDNA, SiloDNA, KGR ou intenção confirmada não bloqueia allintitle. IDs inválidos, texto ausente, registro não persistido e marca divergente agora retornam código, estágio e diagnóstico localizados.

## Riscos, rollback e testes

Riscos principais: sessão expirada, divergência de tenant, falha parcial e mudança no parser do Google. As barreiras são autenticação server-side, validação por item, outcomes explícitos, preservação em falhas e fixtures sem tráfego real.

Rollback local: remover a rota/serviço e restaurar somente o caminho allintitle anterior, sem rollback de banco e sem apagar dados já persistidos. Nenhuma migration, SQL remoto ou alteração de RLS é necessária.

Testes cobrem autenticação, tenant, item de outra marca, sucesso, zero, falhas, `null`, limite, idempotência, resposta parcial, background sem escrita direta e workspace sem persistência concorrente.
