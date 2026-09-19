# Relatório — RADAR_VISUAL_CONTRACT_1 — planilha e Radar no contrato visual — 2026-09-19

## Pedido

"A planilha e todo o demais com o layout de acordo às diretrizes e às cores
da marca."

## Fonte de verdade usada

1. `.agents/skills/app-visual-system/SKILL.md` (skill executável);
2. `docs/compartilhado/sistema-visual.md` (documento canônico);
3. `references/color-contract.md` (mapa cor legada → token, por significado);
4. `references/operational-grid-layout.md` (contrato visual da planilha);
5. `scripts/check-visual-system.mjs` (guard) + `scripts/visual-system-baseline.json`.

Nenhum token foi criado. Nenhuma cor foi escolhida em componente.

## O que o guard encontrou (modo estrito, antes)

```text
components/editorial/operational-data-grid.tsx     39  hex cru, slate-*, slate-850 (não existe: bordas
                                                        NÃO renderizadas), fontes 8–10px
components/editorial/operational-screen-shared.tsx 16  card/Field/Metric com hex, slate-*, fontes 8–11px
modules/radar/radar-analysis-page.tsx              58  teal/emerald/amber/orange/slate, fontes 9–11px
modules/radar/competitive-report-panel.tsx          3  (87 classes cruas) slate/white/amber/emerald
modules/radar/radar-page.tsx                        2  detalhe legado com slate/red/amber
app/(brand)/[brandRef]/radar/[articleId]/page.tsx   1
os outros 13 arquivos do Radar                      0  já estavam no contrato
```

## Conversão — por significado, não mecânica

| Legado | Token | Motivo |
| --- | --- | --- |
| `bg-[#08090c]`, `bg-[#0a0b0f]`, `bg-slate-950` | `bg-background` | canvas |
| `bg-[#0b0c10]`, `bg-[#101116]`, `bg-slate-900/35` | `bg-surface-subtle` | superfície da grade e do cabeçalho |
| popover de colunas `bg-[#0b0c10]` | `bg-surface-elevated` | elemento flutuante |
| `border-slate-700/800/850/900` | `border-divider` | estrutura neutra |
| `text-white`, `text-slate-100…300` | `text-foreground` / `text-foreground/85` | texto principal |
| `text-slate-400…700` | `text-text-muted` | label, contador, texto auxiliar |
| `red-*` (erro da grade, botão de recusa) | `danger` / `danger-soft` | falha, bloqueio |
| `emerald-*` (aprovado, publicado, alinhado, protegido) | `success` / `success-soft` | conclusão confirmada |
| `amber-*` em "não aprovado", "parcialmente alinhado" | `pending` | espera, decisão humana |
| `amber-*`/`orange-*` em parcial, simulado, limitação, erro de extração, aviso | `warning` / `warning-soft` | atenção, resultado parcial |
| `teal-*` em rótulo, link, borda de painel informativo | `context-accent` (/30 borda, /10 fundo) | informação |
| `teal-*` em hover/ring/aba ativa | `module-accent/40`, `/35`, `/50` + `bg-selected` | interação |
| `text-[8px]…[11px]` | `text-[12px]` | piso absoluto |
| tabela `text-[10px]` | `text-sm` (14px) | célula: mínimo 14px (sistema visual §8) |

Contrato da planilha aplicado ao `OperationalDataGrid`: cabeçalho sticky em
`surface-subtle` com label em `text-muted`; células em 14px; controles em 12px;
o `<td>` do detalhe expandido carrega `border-l-2 border-l-module-accent`
(operational-grid-layout §5) — antes o painel abria sem a faixa que o liga à
linha.

`slate-850` merece registro: não existe no Tailwind, então **toda borda que o
usava não era renderizada**. As bordas do cabeçalho, da coluna fixa e da linha
expandida passam a existir de fato.

## Escopo compartilhado — declarado

`operational-data-grid.tsx` e `operational-screen-shared.tsx` são consumidos
também por Minerador, Arquiteto, Planejador e Publicações. A mudança é de
token (mesma geometria) mais o tamanho-base da tabela (10px → 14px): células
que não fixam tamanho próprio ficam maiores em todos os módulos. O sistema
visual diz que não existe segundo estilo de tabela, e o piso é o mesmo para
todos — por isso a conversão foi feita no compartilhado, não copiada para o
Radar.

`modules/arquiteto/territorial-workspace-rows.tsx:181` tinha um **comentário**
com as palavras vetadas pela Regra 0 (o guard lê comentários) e bloqueava o
`--update-baseline` da plataforma inteira. O comentário foi reescrito; nenhum
código do Arquiteto mudou.

## Verificação

```text
guard estrito (19 arquivos do Radar + 2 compartilhados
  + modules/redator/writer-radar-foundations-panel.tsx)   0 violações
guard global                                              0 roxo · FALHA por dívida que CRESCEU em 7 arquivos
                                                          que este corte não tocou (ver abaixo)
baseline                                                  reescrito a partir do HEAD removendo só os 6
                                                          arquivos zerados aqui — nenhum aumento foi travado
tsc                                                       limpo
eslint (5 arquivos)                                       0 erros · avisos pré-existentes
test:radar                                                2259/2259 (+4 em tests/radar-visual-contract-1.test.mts)
test:marca                                                106/106
test:visual-system                                        24/28 — 4 falhas PRÉ-EXISTENTES (pino de keyword ausente
                                                          já no HEAD; R2.4/R2.5/R2.6 leem arquivos do Arquiteto
                                                          que não foram tocados)
test:arquiteto / editorial / operational                  2 / 4 / 10 falhas PRÉ-EXISTENTES, mesmas listas de antes,
                                                          nenhuma lê arquivo tocado
PROVIDER_CALLS = 0 · AI_CALLS = 0 · MIGRATIONS = 0
```

## Encontrado no caminho — e o que foi feito com isso

**Dívida minha, do corte anterior.** `modules/redator/writer-radar-foundations-panel.tsx`
(REDATOR_DOSSIER_SURFACE_1) nasceu copiando o estilo do aside do Redator:
`slate-*`, `slate-850` e fontes de 9–11px — 23 itens. Convertido para tokens e
piso de 12px neste corte; guard estrito zerado.

**Dívida de outras sessões, não travada.** O primeiro `--update-baseline`
gravaria como "tolerado" o crescimento abaixo — e o baseline só pode diminuir.
Ele foi reescrito a partir do HEAD, removendo apenas os arquivos zerados aqui.
O guard global segue FALHANDO, e é isso que ele deve dizer:

```text
components/editorial/professional-writer.tsx     43 (baseline 40)  aside com slate-850/#090a0e/9px — linhas não deste corte
components/editorial/workflow-status.tsx         54 (baseline 53)
modules/arquiteto/arquiteto-workbench.tsx         3 (baseline 0)
modules/arquiteto/arquiteto-workspace.tsx       108 (baseline 97)
modules/minerador/minerador-workspace.tsx       169 (baseline 168)
modules/publicacoes/publications-workspace.tsx   29 (baseline 25)
modules/redator/writer-media-anchor-panel.tsx    14 (baseline 0)
```

Nenhum deles é renderizado pela tela do Radar (`workflow-status` não é usado
pela planilha do Radar). Limpá-los é corte próprio, módulo a módulo.

## O que fica com o USER (gate visual da skill)

`código → DOM/render real → screenshot → validação manual → aprovação`. Teste
não é aprovação visual. Conferir no navegador, em dark mode, 1440 e 1024px:
planilha do Radar (cabeçalho, bordas agora visíveis, linha expandida com a
faixa), cards do topo, painéis do workbench, e a rota `/radar/[articleId]`.

## Dívida que permanece (fora deste corte)

- `text-xs` (12px) em texto que a diretriz trata como essencial dentro dos
  painéis do Radar — o guard aceita (piso), a diretriz pede 14px; é ajuste de
  densidade, tela a tela;
- `btn` compartilhado com `h-7` (28px) — a diretriz pede 32px para botão de
  tabela; mudar a altura mexe em todos os módulos e pede validação própria;
- Minerador e Arquiteto ainda têm `text-[10px]/[11px]` nas células deles
  (baseline), fora do escopo do Radar.
