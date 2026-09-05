# Contrato de cor — mapeamento de dívida para tokens

Tabela operacional para converter cor legada em token semântico. Usar sempre
que tocar um arquivo com cor crua, e nunca inventar uma correspondência nova.

## Roxo — conversão obrigatória e imediata

Roxo é bloqueio, não dívida gradual (Regra 0 da skill). O mapeamento aplicado
na plataforma foi:

| Legado | Token | Motivo |
|---|---|---|
| `focus:border-indigo-600` | `focus:border-module-accent/45` | focus é interação |
| `hover:border-indigo-700` | `hover:border-module-accent/40` | hover é interação |
| `ring-indigo-400`, `ring-indigo-400/70` | `ring-module-accent/35` | ring é interação |
| `border-indigo-300` | `border-module-accent/40` | realce de hover em bloco |
| `border-indigo-900` | `border-divider` | era só estrutura |
| `border-indigo-900/40…/70` | `border-context-accent/25…/30` | painel informativo |
| `bg-indigo-950/20` | `bg-surface-subtle` | era superfície, não cor |
| `bg-indigo-950/50` | `bg-surface-elevated` | hover de superfície |
| `bg-indigo-950/10`, `/40` | `bg-context-accent/10` | fundo informativo |
| `bg-indigo-950/15`, `/25` | `bg-selected` | seleção real tem token próprio |
| `bg-indigo-500` | `bg-context-accent` | progresso é informação |
| `bg-indigo-600` | `bg-action-accent` | botão primário |
| `bg-indigo-50` | `bg-action-accent/5` | superfície clara do editor |
| `text-indigo-200/300/400` | `text-context-accent` | rótulo informativo |
| `text-indigo-300` em botão | `text-foreground/75` | label de controle é neutro |
| `text-indigo-600` | `text-action-accent` | link de ação |
| `text-violet-200/300` | `text-context-accent` | metadado de origem/estado |
| `text-violet-400` | `text-pending` | "revisar" é pendência |
| `border-violet-900 text-violet-300` em "Na fila" | `border-pending/40 text-pending` | espera é pendência |
| `#eef2ff`, `#312e81` (globals.css) | `color-mix` sobre `--action-accent` | superfície clara do editor |

## Cinzas e neutros

| Legado | Token |
|---|---|
| `bg-slate-950`, `bg-black`, `bg-[#08090c]`, `bg-[#090a0e]` | `bg-background` |
| `bg-slate-900`, `bg-[#0b0c10]`, `bg-[#0a0b0f]` | `bg-surface-subtle` |
| `bg-slate-800`, `bg-[#101116]`, `bg-[#17181d]` | `bg-surface-elevated` |
| `border-slate-800`, `border-slate-900`, `border-slate-850` | `border-divider` |
| `border-slate-700` | `border-divider` |
| `text-white`, `text-slate-50` | `text-foreground` |
| `text-slate-200`, `text-slate-300` | `text-foreground/85` |
| `text-slate-400`, `text-slate-500`, `text-slate-600` | `text-text-muted` |

`slate-850` **não existe no Tailwind** e não há config definindo-o: toda classe
que o usa não gera CSS nenhum. Trocar por `border-divider` corrige uma borda
que hoje simplesmente não é renderizada.

## Cores de status

| Legado | Token |
|---|---|
| `emerald-*`, `green-*` | `success` / `success-soft` |
| `amber-*`, `yellow-*` quando é espera | `pending` / `pending-soft` |
| `amber-*`, `orange-*` quando é risco | `warning` / `warning-soft` |
| `red-*`, `rose-*` | `danger` / `danger-soft` |
| `cyan-*`, `sky-*`, `blue-*` informativo | `context-accent` |
| `teal-*` | `context-accent` ou `module-accent` conforme intenção |

Ao converter `amber`, decidir pelo significado: **aguardando** é `pending`;
**risco ou resultado parcial** é `warning`. Não converter mecanicamente.

## Regras de derivação

Permitido: `transparent`, `currentColor`, `inherit`, alpha sobre token
(`text-context-accent/70`) e `color-mix` sobre token.

Proibido: hex, `rgb`, `hsl`, `oklch` fora de `app/globals.css`; classe de cor
Tailwind crua em componente; token novo criado dentro de módulo.

## Intensidades de referência

| Situação | Intensidade |
|---|---|
| borda de input em hover | `module-accent/20` a `/30` |
| borda de input em focus | `module-accent/40` a `/50` |
| ring de focus | `module-accent/20` a `/35` |
| borda de painel informativo | `context-accent/25` a `/30` |
| fundo de painel informativo | `context-accent/10` |
| fundo de badge de status | token `*-soft` (18%) |
| borda de badge de status | token a `/35` – `/45` |
