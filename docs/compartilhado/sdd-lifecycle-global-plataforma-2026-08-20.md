# SDD — Lifecycle global da Plataforma

Status: Implementada localmente e aplicada remotamente com verificação pré-cleanup
Data: 2026-08-20
Módulo proprietário: Plataforma / contratos compartilhados de lifecycle
Consumidores: Minerador, Arquiteto, Radar, Planejador, Redator e Publicações

## Decisão

O lifecycle de entidades editoriais é um contrato compartilhado. Cada módulo
mantém a propriedade dos seus dados e handlers, mas não cria uma semântica de
exclusão concorrente para o mesmo subject.

O histórico de undo/redo e operações recentes da interface é
`SESSION_HISTORY`: memória do processo ou `sessionStorage` quando a sessão
precisar sobreviver a um reload. Ele não é auditoria, proveniência,
versionamento, proteção contra exclusão nem fonte canônica remota.

Versões consolidadas, ArticleDNA, SiloDNA, SiloPage, ContentPlan,
ContentDocument, PublicationRecord, usage, auditoria de segurança, eventos
administrativos, publicação e proveniência necessária permanecem
`CANONICAL_HISTORY` ou `AUDIT_HISTORY` conforme o contrato do recurso.

## Regra de publicação

`isPublished(subject)` é resolvido no servidor a partir de evidência real:
PublicationRecord publicado, cadeia real até PublicationRecord, estado
consolidado de publicação ou vínculo técnico/humano formal de site. Status
visual, ArticleDNA, workflow, aprovação, handoff, DNA, análise ou métrica não
promovem um subject a publicado.

O status legado `publicado` sem vínculo formal é mantido apenas como sinal de
diagnóstico e não ativa a janela recuperável. No estado remoto auditado,
`gel de unha volia` possui status legado, ArticleDNA `proposed`, workflow
`received` e zero PublicationRecord; portanto não há publicação real
comprovada.

## Política de exclusão

- `NOT_PUBLISHED`: confirmação digitada pelo nome exato do item, impacto
  calculado, uma RPC tipada e transacional, hard delete, readback e
  `partialDelete = false`;
- `PUBLISHED`: a mesma confirmação digitada pelo nome exato, retirada da
  operação normal, tombstone recuperável por 24 horas e restauração antes de
  `purge_after`;
- `now >= purge_after`: purge explícito server-side, transacional, tenant-safe,
  auditável e idempotente;
- nenhum processamento, métrica, Google Ads, DataForSEO, KGR, IA, DNA,
  aprovação ou handoff cria proteção de delete por si só.

O servidor revalida brand, actor e publicação dentro da mesma transação. Não
existe RPC genérica que receba tabela, coluna ou SQL dinâmico. O primeiro
consumer operacional do contrato é o Minerador/keyword; os demais módulos
consomem os tipos compartilhados e continuam sujeitos a handlers proprietários
quando seus contratos de delete forem habilitados.

## Impacto e dependências

Toda prévia deve declarar `root`, `ownedChildren`, `downstreamDrafts`,
`sharedReferences` e `publishedReferences`. Dependências são classificadas
como `OWNED_CHILD`, `SHARED_REFERENCE`, `DRAFT_DESCENDANT`,
`PUBLISHED_REFERENCE`, `CANONICAL_HISTORY` ou `SESSION_HISTORY`.

No Minerador, medições e proveniência própria são `OWNED_CHILD`; vínculos em
Discovery são `SHARED_REFERENCE` e apenas apontam para `NULL` quando permitido;
workflow sem evento de decisão é estado operacional removível; ArticleDNA,
status events e decision events append-only são `CANONICAL_HISTORY` e não são
apagados pela exclusão da keyword. Se um downstream operacional ainda não
possuir handler de remoção seguro, a RPC falha fechada antes de qualquer
mutação, em vez de deixar um rascunho quebrado.

## Estado auditado antes da implementação

Projeto remoto canônico: `hjjlntdpdgvpnazdztqw`.

No read-only audit de 2026-08-20 havia uma marca, sete keywords, dois
ArticleDNA `proposed`, dois workflow items `received`, zero ContentDocument,
zero PublicationRecord e zero evento de decisão. As duas linhagens que
chegaram ao Arquiteto são `campanha de trafego pago` e `gel de unha volia`;
os IDs e o plano de cleanup ficam em artefato separado e não autorizam
exclusão por texto.

## Schema e operação

A migration sucessora deve ser nova e idempotentemente pré-condicionada. Ela
adiciona o tombstone mínimo (`deleted_at`, `purge_after`, `deleted_by`), índice
de recuperação, resolver server-side de publicação, prévia de impacto e
RPCs tipadas de delete/restore/purge. As RPCs de compatibilidade do Minerador
apontam para o mesmo núcleo; não há CASCADE genérico, DDL remoto automático
nem exclusão de histórico canônico.

ACL: tabelas não recebem DELETE direto de clientes; a superfície mutável é a
RPC server-side autorizada. RLS, `brandId = public.marcas.id` e
`actorUserId = auth.uid()`/sessão canônica permanecem obrigatórios. O cliente
de API atual usa service client apenas depois de validar a sessão e a
permissão tenantizada; a RPC recebe o actor validado e repete a autorização.

## Rollback e gates

Rollback é artefato local de segurança e não é executado automaticamente.
Antes de qualquer escrita remota: projeto canônico, preflight, snapshot/
fingerprint, drift check e confirmação de que a migration não foi aplicada.
Qualquer falha interrompe o apply. Depois do apply: post-verifier, readback e
somente então plano de limpeza explicitamente comprovado.

## Limpeza de homologação

`marketing digital` e `gel de unha volia` são apenas candidatos. A allowlist
precisa conter brandId, IDs raiz, IDs de workflow/ArticleDNA e todos os
descendentes, com `PublicationRecord` ausente e relação com a homologação
comprovada. Qualquer ambiguidade preserva os dados e produz
`TEST_DATA_CLEANUP_AMBIGUOUS = YES`. Nenhum dado foi apagado durante a
auditoria inicial. Depois do post-verifier, a allowlist exata foi executada
pela RPC tipada: três raízes de homologação foram hard-deleted, dois
ArticleDNA canônicos foram preservados e nenhuma PublicationRecord foi
tocada. O readback confirmou ausência das raízes, dependências próprias,
vínculos Discovery e workflows previstos.

## Testes mínimos

Cobrir delete não publicado simples e processado, draft enviado ao Arquiteto,
publicado recuperável, restore dentro/fora da janela, purge expirado,
atomicidade, isolamento por brand, ausência de persistência remota para
histórico da sessão, preservação de versões canônicas e zero chamadas pagas.

## Interface compartilhada de confirmação — 2026-08-20

`components/lifecycle/delete-confirmation.tsx` é a superfície única para
confirmações de exclusão. Os modos hard delete e remoção recuperável exigem
que o usuário digite o nome exato do item; a comparação ignora espaços nas
extremidades e diferença de caixa. O botão permanece desabilitado até a
correspondência e Enter só confirma nesse estado. Fechar e reabrir limpa a
entrada. O impacto permanece curto, com detalhes adicionais recolhíveis
quando necessário, sem checkbox ou bloco técnico extenso.

Na homologação autenticada do Minerador, a variante hard delete foi aberta
sem executar a exclusão: o botão iniciou bloqueado, permaneceu bloqueado com
nome incorreto, habilitou com trim/caixa normalizados, Enter inválido não
confirmou, Escape fechou e a reabertura limpou o campo. A modal permaneceu
dentro da viewport em 360, 768 e 1440 pixels, sem overflow horizontal. A
variante recuperável está implementada pelo mesmo componente, mas ainda
aguarda registro publicado elegível no ambiente para smoke visual separado.

## Resultado da implementação — 2026-08-20

- `0047_global_lifecycle_delete_recovery_purge.sql` foi aplicada somente no
  projeto canônico após preflight, baseline, drift check e confirmação de que
  não estava aplicada.
- O post-verifier remoto passou com `structural_failures = 0` antes da
  limpeza, preservando os baselines de dados e catálogo externo capturados no
  preflight.
- A limpeza da homologação usou somente os UUIDs do
  `0047-test-cleanup-plan-2026-08-20.md`; retornou `partialDelete = false`.
- O smoke end-to-end novo pelas seis áreas ainda não foi executado. O
  contrato compartilhado e o handler operacional do Minerador estão ativos;
  handlers de exclusão dos demais módulos permanecem dependentes de seus
  contratos próprios.
