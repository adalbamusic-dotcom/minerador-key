# Diagnóstico do modelo de status do Arquiteto

## Problema observado

As ações retornavam:
- "Nenhum artigo novo válido foi encontrado na seleção."
- "Os artigos selecionados já estão aprovados ou não correspondem a grupos novos válidos."
- "0 artigo(s) enviado(s) ao Radar; 1 já existente(s) ou inválido(s)."

A interface permitia trabalhar apenas com grupos novos, bloqueando artigos publicados no fluxo Arquiteto → Radar.

## Causa raiz

Três gates no `app/(workspace)/arquiteto/page.tsx` bloqueavam artigos publicados:

### Gate 1: `articleWorkflowStatus` (linha 1283)

```ts
// ANTES — retornava "published" imediatamente, ignorando ArticleDNA
if (art.isPublished) return "published";
```

O status visual "published" não permitia que o artigo mostrasse "awaiting_approval" ou "approved", mesmo se tivesse ArticleDNA gerado e aprovado.

### Gate 2: `prepareSelectedLogicalArticleDnas` (linha 1332)

```ts
// ANTES — pulava publicados, impedindo criação de ArticleDNA-base
if (group.publishedAnchorId) continue;
```

Publicados nunca recebiam ArticleDNA determinístico nem eventos de "proposed"/"approved", então não passavam no `articleApprovalIssues`.

### Gate 3: `sendSelectedApprovedToRadar` (linha 1316)

```ts
// Filtra por acceptedArticleDnas[id] — se o publicado não tem ArticleDNA no estado, é filtrado
.filter((id): id is string => Boolean(id) && Boolean(acceptedArticleDnas[id]));
```

O `importApprovedToRadar` chama `approvedArticleVersions` que filtra por `articleApprovalIssues === 0`, que inclui `hasHumanApproval`. Sem os gates 1 e 2 corrigidos, publicados nunca chegavam aqui.

## Correção aplicada

### Gate 1 corrigido

```ts
// DEPOIS — checa ArticleDNA, approval e Radar antes de retornar "published"
const articleEntityId = art.isPublished
  ? art.mainKeywordObj?.id
  : art.mainKeywordObj?.provisionalGroupId || art.briefingId;
if (articleEntityId && radarItems.some(item => item.articleId === articleEntityId)) return "sent_radar";
const articleVersion = articleEntityId ? acceptedArticleDnas[articleEntityId] : undefined;
const versionStatus = articleVersion ? effectiveVersionStatus(articleVersion.versionId, versionEvents) : null;
if (versionStatus === "approved") return "approved";
if (articleVersion && versionStatus !== "rejected" && versionStatus !== "superseded") return "awaiting_approval";
if (art.isPublished) return "published";
return "draft";
```

### Gate 2 corrigido

```ts
// DEPOIS — publicados também recebem ArticleDNA-base e eventos
const entityId = group.publishedAnchorId || group.id;
// (removido o `if (group.publishedAnchorId) continue;`)
```

### Gate 3

O `sendSelectedApprovedToRadar` já usava o ID correto para publicados (`art.mainKeywordObj?.id`). O problema era que o ArticleDNA nunca existia no estado por causa do gate 2. Com o gate 2 corrigido, o fluxo funciona.

## Três dimensões de status

### 1. Estado editorial (WorkflowStatusBadge)

Controlado por `articleWorkflowStatus`:

| Status | Significado | Quando |
|--------|-------------|--------|
| `draft` | Em processo | Sem ArticleDNA |
| `awaiting_approval` | Aguardando aprovação | ArticleDNA gerado, status "proposed" |
| `approved` | Aprovado | ArticleDNA com status "approved" |
| `sent_radar` | Importado no Radar | ArticleDNA no `radarItems` |
| `published` | Publicado | Sem ArticleDNA, mas artigo já publicado no site |

### 2. Identidade e versão (ID · v1)

Controlado por `acceptedArticleDnas[entityId]` e `acceptedSiloDnas[siloId]`:

| Rótulo | Significado |
|--------|-------------|
| `ID · v1` | Identidade estratégica versão 1 |
| `ID · v2` | Revisão consolidada |
| `Pendente` | ArticleDNA/SiloDNA ainda não gerado |

### 3. Origem/última alteração

Controlado por `version.origin`:

| Rótulo | Origin |
|--------|--------|
| `IA aplicada` | `ai` |
| `Revisão humana` | `human` |
| `Lógica` | `system` |

## Fluxo completo corrigido

```
ArticleDNA gerado (IA ou lógica)
→ status "proposed" → "IA aplicada" ou "Lógica"
→ artigo mostra "Aguardando aprovação"
→ revisão manual inline
→ SiloDNA gerado (sem precisar aprovar ArticleDNA antes)
→ aprovação final (valida ArticleDNA + SiloDNA + silo + keywords)
→ status "approved"
→ "Enviar ao Radar"
→ status "sent_radar"
```

Publicados seguem o mesmo fluxo, com proteções estruturais ativas:
- keyword principal não pode ser trocada
- slug não pode ser alterado
- silo não pode ser mudado automaticamente
- canonical preservado

## Arquivos modificados

- `app/(workspace)/arquiteto/page.tsx` — gates 1, 2 e 3 corrigidos
