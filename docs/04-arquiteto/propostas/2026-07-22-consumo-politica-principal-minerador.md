# SDD — Consumo da política da principal publicada do Minerador

## Módulo proprietário

Arquiteto.

## Problema

O Minerador grava a política da keyword principal em `analise_semantica`, mas o
Arquiteto atualmente mantém somente uma projeção parcial em
`ArchitectKeyword`. Com isso, um ArticleDNA não registra a política original e
a normalizada, o `ArticleControlContext` não explica o motivo da proteção da
principal e a resolução do ciclo ainda pode tratar publicação isolada como
proteção da principal.

## Fontes auditadas

- `lib/minerador/primary-keyword-policy.ts`
- `lib/minerador/kgr-applicability.ts`
- `lib/editorial/adapters.ts`
- `app/(brand)/[brandRef]/arquiteto/page.tsx`
- contratos e adaptadores em `lib/arquiteto/**`
- ADR-008 do Minerador e ADRs de identidade publicada, ArticleDNA estratégico,
  SERP e perfis de unidade

## Dados de entrada preservados

O consumidor lê, sem regravar o Minerador:

- `primary_keyword_policy`: `locked`, `reviewable` ou `free`;
- `primary_keyword_published_original`, `primary_keyword_current`;
- `primary_keyword_policy_actor`, `primary_keyword_policy_at`,
  `primary_keyword_policy_version`, `primary_keyword_policy_history`,
  `primary_keyword_policy_reason` e `primary_keyword_review_required`;
- `kgr_aplicabilidade`/`kgr_decisao` somente quando a decisão é explícita e
  humana;
- volume, resultados, score, intenção, URL, slug, canonical, publicação,
  relação URL/keyword, evidências e snapshots integrais de KeywordDNA.

## Decisão

Adicionar uma projeção aditiva e retrocompatível no limite do Arquiteto:

1. `PrimaryKeywordPolicy` do Arquiteto aceita `locked`, `reviewable`, `free`,
   `conflict` e `unknown`. A política original e sua proveniência ficam no
   contexto recebido; nenhuma inferência textual de slug, score ou volume cria
   confirmação.
2. `ArticleDNA` registra política efetiva, contexto original, candidatos de
   principal e decisão humana quando existirem.
3. `ArticleControlContext.primaryKeyword` expõe `policy`, `protected` e
   `protectionReason`, mantendo aliases existentes para não quebrar
   consumidores.
4. A resolução do ciclo é determinística:
   - unidade nova: `formacao`/`free`;
   - publicado `reviewable`: `arquitetura_publicado`, principal candidata;
   - publicado `locked`, arquitetura confirmada ou vínculo KGR confirmado:
     `fortalecimento`, principal protegida;
   - publicado sem informação suficiente: `arquitetura_publicado`, política
     `unknown`/`conflict`, nunca bloqueio silencioso da principal.
5. URL publicada, slug, canonical e marca continuam protegidos em qualquer
   estado publicado. A principal só fica protegida quando a política efetiva
   for `locked` ou houver confirmação arquitetural/KGR equivalente.
6. A confirmação humana de uma candidata cria sucessora do ArticleDNA,
   preserva a versão anterior, promove a nova principal, confirma a relação,
   grava a decisão, torna a política efetiva `locked`, preserva a identidade
   publicada e conduz a próxima SERP para `fortalecimento`.

## Compatibilidade e limites

Os campos novos são opcionais. Registros antigos continuam válidos; publicado
sem política explícita não será travado pelo Arquiteto apenas por possuir
`status=publicado`. Nenhum registro será reprocessado em lote, nenhuma fonte
vizinha será alterada, e não haverá limpeza de localStorage/IndexedDB ou
chamada real de IA/Serper em testes.

## Snapshot e rollback

Antes das mutações de cópia de trabalho, o snapshot existente de recuperação do
Arquiteto e o histórico local de `masterList`/ArticleDNA permanecem como
rollback. A implementação não altera persistência remota nem migração. O
rollback da mudança de contrato consiste em remover somente os campos
opcionais adicionados dos sucessores locais; versões anteriores permanecem
intactas.

## Validação planejada

Fixtures cobrirão principal travada, revisável, livre, publicado sem política,
não KGR explícito, KGR confirmado, proteção independente de URL/principal,
troca supervisionada, confirmação humana, reload e transporte ao Radar.
