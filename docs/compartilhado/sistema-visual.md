# Sistema visual canônico — Minerador Key

**Status documental:** `TARGET APPROVED` — planejamento estrutural visual; a implementação desta fundação não foi iniciada nesta tarefa.<br>
**Estado verificado:** `CURRENTLY IMPLEMENTED = PARTIAL`; os tokens base e o `ProductShell` existem, mas a topbar e o centro global de avisos ainda não existem como contratos/componentes canônicos.<br>
**Módulo proprietário:** infraestrutura compartilhada / sistema visual.<br>
**Limite desta revisão:** documentação somente; não autoriza alteração de frontend, shell, módulos, Supabase/schema ou operação remota.

## 1. Objetivo

A interface do Minerador Key deve ser legível, calma, profissional e coerente entre módulos. Deve ser confortável em dark mode, adequada para uso prolongado e funcional antes de decorativa.

Não deve parecer neon, excessivamente futurista, poluída, apertada, composta apenas por cards ou agressivamente contrastada.

Este documento orienta a composição visual sem autorizar redesign global, alteração de fluxos ou mudança de comportamento dos módulos.

## 2. Fonte de verdade

A precedência visual é:

1. este documento (`docs/compartilhado/sistema-visual.md`);
2. tokens e estilos globais existentes;
3. componentes compartilhados existentes;
4. padrões visuais já validados;
5. regra específica do módulo.

A skill `app-visual-system` é auxiliar e não substitui esta documentação canônica.

### Caminhos reais confirmados

- estilos globais: `app/globals.css`;
- componentes compartilhados: `components/`, incluindo `components/product-shell.tsx`, `components/editorial/operational-data-grid.tsx`, `components/editorial/operational-screen-shared.tsx` e `components/editorial/workflow-status.tsx`;
- implementação proprietária: `modules/`;
- Tailwind: v4, importado por `app/globals.css` com `@import "tailwindcss"` e `@theme inline`;
- não há `src/styles/`, `src/components/`, `tailwind.config.*` ou `check-visual-system.mjs` neste checkout.

O estado atual de `app/globals.css` foi auditado. Ele possui `--background`, `--foreground`, `--accent`, `--module-accent` e `--context-accent`, além dos mapeamentos Tailwind correspondentes. Isso é uma implementação parcial dos tokens-alvo; não representa ainda o contrato semântico completo abaixo.

O `ProductShell` é o shell compartilhado atual e já oferece acesso pessoal pela rota `/conta`. Não foram encontrados, no código ativo auditado, `GlobalTopbar`, `GlobalNoticeCenter`, `publishNotice` ou `NotificationBell` canônicos. Há notices e notificações locais em módulos distintos. Esses fatos são estado atual, não autorização para uma migração big-bang.

## 3. Tipografia

- Texto corrido: 15px ou 16px.
- Texto de interface, tabela e controles: mínimo de 14px.
- Texto auxiliar: 12px ou 13px somente para IDs, datas, contadores e metadados.
- Botões: mínimo de 14px.
- Título principal da tela: aproximadamente 24px.
- Título de seção: 18px ou 20px.
- Título de painel: 16px.
- Line-height de corpo: entre 1.5 e 1.6.
- No máximo três pesos de fonte por tela.

Não usar `text-xs` para texto essencial, contraste insuficiente para instruções importantes, títulos excessivamente grandes em telas operacionais ou mistura arbitrária de fontes. Reutilizar a família definida pelos estilos globais; não introduzir fonte nova sem decisão explícita.

## 4. Dark mode

Usar três níveis semânticos:

- **canvas:** fundo geral da tela;
- **surface:** agrupamento ou painel principal;
- **elevated surface:** menu, popover, diálogo ou elemento temporariamente elevado.

Regras:

- não usar preto puro como fundo principal;
- não usar branco puro em grandes blocos de texto;
- texto principal deve ser off-white;
- texto secundário deve continuar legível;
- bordas devem ser discretas;
- hierarquia deve vir de superfície, espaçamento e tipografia;
- evitar glow, neon e gradientes excessivos;
- não colocar bordas fortes em todos os containers;
- dark mode não é simples inversão do light mode.

## 5. Cores e contrato oficial

O alvo aprovado possui uma paleta única. Os valores brutos devem ficar somente
nos arquivos centrais de tokens; componentes consomem nomes semânticos e não
escolhem a cor a partir do módulo.

| Token semântico | Valor oficial | Uso canônico |
| --- | --- | --- |
| `background` | `#131413` | canvas global no dark mode |
| `foreground` | `#f3f4f6` | texto e elementos principais |
| `action-accent` | `#193cb8` | ação primária e interação de ação |
| `context-accent` | `#12A1E0` | contexto, título da área e informação neutra |
| `module-accent` | `#10DDE0` | identidade operacional do módulo |
| `positive-soft` | `#63F1AF` | seleção, reforço e marcação positiva auxiliar |
| `highlight` | `#C8FF00` | fixação, marcação especial ou re-encontro rápido |
| `success` | `#1fcb0a` | conclusão confirmada |
| `warning` | `#f79001` | atenção, risco ou degradação |
| `pending` | `#E6CE00` | revisão, espera ou decisão humana |
| `danger` | `#A61E1E` | falha, bloqueio ou ação destrutiva |
| `divider-dark` | `#212121` | divisor no dark mode |
| `divider-light` | `#d1d1d1` | divisor no light mode |

Os nomes CSS finais podem ser adaptados à convenção existente, desde que
preservem este contrato semântico e tenham uma única fonte central. A expansão
dos tokens atuais é trabalho futuro; esta tabela não declara que todos já estão
implementados.

### 5.1 Semântica obrigatória de status

| Status | Token | Significado |
| --- | --- | --- |
| `SUCCESS` | `success` | operação concluída, aprovação, publicação, persistência confirmada ou validação aprovada |
| `INFO` | `context-accent` | informação neutra, contexto ou orientação |
| `PENDING` | `pending` | revisão, aprovação aguardada, dado ausente, processamento incompleto ou decisão humana |
| `WARNING` | `warning` | atenção, risco, resultado parcial, condição degradada ou ação sensível |
| `ERROR` / `DANGER` | `danger` | falha, erro, bloqueio, destruição ou impossibilidade |

`SUCCESS` só pode ser emitido depois de uma confirmação real da operação. Não
se deve confundir `success` com `positive-soft`: o primeiro significa “deu
certo”; o segundo é apenas apoio visual. `highlight` não é sucesso genérico e
fica reservado para fixação, exceção ou destaque que precise ser reencontrado.

### 5.2 Cores proibidas e valores brutos

O frontend ativo não pode introduzir `purple`, `violet`, `indigo`, `fuchsia`,
`lavender`, `lilac` ou equivalentes roxo/violeta/azul-lilás. Também não pode
introduzir hex, `rgb`, `rgba`, `hsl`, `hsla` ou cores Tailwind fora do contrato
em componentes ativos. Valores brutos ficam somente nos arquivos centrais de
tokens. `transparent`, `currentColor`, `inherit` e derivações por alpha ou
`color-mix` dos tokens oficiais são permitidos.

Assets e logos externos devem ser classificados antes de qualquer automação;
esta regra não autoriza alteração automática desses ativos.

## 6. Botões

Variantes canônicas:

- `primary`;
- `secondary`;
- `ghost`;
- `danger`;
- `icon`.

Dimensões e regras:

- altura normal: 36px ou 40px;
- botão compacto de tabela: mínimo de 32px;
- botão somente com ícone: área mínima de 36 × 36px;
- texto mínimo de 14px;
- radius preferencial de 8px ou 10px;
- não usar texto minúsculo;
- não colorir todos os botões;
- não criar estilo exclusivo por tela;
- ícone sem texto deve ter tooltip ou nome acessível;
- implementar hover, focus-visible, active, disabled e loading quando aplicável.

## 7. Inputs e controles

Inputs e controles devem ter texto mínimo de 14px, labels visíveis, foco perceptível, erro e estado inválido visíveis e altura coerente com botões. Placeholder não substitui label. Controles compactos só devem ser usados quando a densidade da tabela ou planilha exigir.

## 8. Tabelas e planilhas

Para Minerador, Arquiteto, Radar, Planejador e Publicações:

- texto das células: mínimo de 14px;
- cabeçalho: 13px ou 14px;
- altura normal de linha: aproximadamente 44px;
- modo compacto: aproximadamente 40px;
- ações em área clicável adequada;
- seleção com fundo sutil;
- não usar cores saturadas em linhas completas;
- cabeçalhos, filtros e rodapés devem manter consistência.

Priorizar leitura e densidade controlada, sem reduzir texto essencial para caber mais conteúdo.

### 8.1 Operational Grid

O padrão compartilhado para mesas e listas operacionais densas é a família
**Operational Grid**. A referência principal é o Minerador, nas superfícies
Processar Keywords e Descobrir Keywords; essa referência não declara que os
demais módulos já foram migrados.

O contrato detalhado está em [Operational Grid](operational-grid.md). Ele
define uma composição comum de cabeçalho, linhas, seleção, pintura de seleção,
ordenação manual, sort, resize, scroll horizontal, detalhe expandido, ações em
lote e estado vazio. As regras de domínio permanecem nos adapters de cada
módulo; a primitive compartilhada não interpreta KeywordDNA, ArticleDNA,
ContentPlan ou PublicationRecord.

Aplicação planejada não é implementação concluída. O Minerador é a
**REFERENCE IMPLEMENTED**; a adoção **PLATFORM-WIDE** permanece planejada e
deve seguir a task de adoção gradual, com DOM real, interação manual e
aprovação além de testes/build.

## 9. Cards, seções e painéis

Usar card somente quando representar uma unidade conceitual real. Preferir agrupamento, espaçamento, títulos, divisores discretos e superfícies graduais.

Evitar card dentro de card, borda em todo bloco, sombra em todo painel, excesso de radius e caixas usadas para compensar falta de hierarquia.

## 10. Espaçamento e radius

Escala preferencial de espaçamento:

- 4px;
- 8px;
- 12px;
- 16px;
- 24px;
- 32px;
- 48px.

Radius permitidos:

- 6px;
- 10px;
- 14px;
- pill somente quando semanticamente necessário.

Evitar valores arbitrários sem justificativa de layout.

## 11. Badges e estados

Badges devem representar estados reais e não ser usados apenas como decoração. A semântica deve ser consistente para aprovado, aguardando aprovação, conflito, erro, sucesso, publicado, bloqueado, simulado, local e remoto.

Não depender apenas de cor para comunicar estado: combinar texto, ícone, posição ou outro sinal acessível.

## 12. Responsividade

Validar pelo menos 360px, 768px, 1024px e 1440px.

Em telas menores:

- preservar tamanho legível;
- empilhar quando necessário;
- evitar scroll horizontal fora das planilhas;
- manter ações acessíveis;
- reduzir decoração antes de reduzir texto.

## 13. Movimento

Usar animação somente quando ajudar a compreender abertura, mudança de estado, feedback ou navegação. Respeitar `prefers-reduced-motion`. Não usar animação apenas como decoração.

## 14. Padrões proibidos

São proibidos ou exigem decisão explícita:

- fontes pequenas para informações importantes;
- botões com baixa legibilidade;
- cores hardcoded espalhadas;
- novos gradientes aleatórios;
- glassmorphism;
- neon;
- glow;
- excesso de cards;
- excesso de sombras;
- vários radius concorrentes;
- mistura de bibliotecas de ícones;
- redesign fora do escopo;
- linguagem visual exclusiva para um módulo.

## 15. Checklist obrigatório

Antes de concluir uma tarefa frontend:

- verificar tipografia;
- verificar dark mode;
- verificar contraste confortável;
- verificar botões;
- verificar estados;
- verificar responsividade;
- verificar reutilização de componentes;
- verificar cores hardcoded;
- verificar que não houve redesign fora do escopo;
- realizar validação manual orientada.

Qualquer exceção visual deve ser registrada na documentação da tarefa, com justificativa e limite de escopo.

## 16. Fundação global: alvo e estado atual

O contrato abaixo é o destino compartilhado da plataforma. `TARGET APPROVED`
significa que a regra está aprovada para planejamento; não significa que o
componente já exista.

| Área | `TARGET APPROVED` | `CURRENTLY IMPLEMENTED` |
| --- | --- | --- |
| Tokens e paleta | paleta oficial e tokens semânticos únicos | parcial: `app/globals.css` possui os tokens base e acentos de contexto/módulo |
| Topbar | `GlobalTopbar` integrado ao `ProductShell` | não encontrado como componente canônico; o shell atual continua sendo `ProductShell` |
| Notices | `publishNotice()` → `GlobalNoticeCenter` → toast e sino | não encontrado; módulos ainda mantêm notices/notificações locais |
| Perfil | avatar com acesso à conta pessoal | acesso atual a `/conta` confirmado no shell |
| Sidebar | preservada, sem redesign nesta fase | existente no `ProductShell` |
| Planilhas | herança de tokens e estados, sem redesenho de grid | padronização estrutural ainda não iniciada |
| Guard visual | teste/lint contra cores proibidas e valores brutos | planejado, sem `check-visual-system.mjs` neste checkout |

## 17. Contrato de temas

### Dark mode

O dark mode usa `background = #131413`, `foreground = #f3f4f6` e
`divider-dark = #212121`. Hover, seleção, foco e disabled devem derivar dos
tokens oficiais, sem criar tonalidades independentes. A validação deve cobrir
contraste, legibilidade, foco perceptível e distinção entre superfície,
superfície elevada e canvas.

### Light mode

Se o produto oferecer light mode, o background deve derivar de `#f3f4f6`, o
foreground deve ser `#131413` e os divisores devem usar `divider-light =
#d1d1d1`. Os acentos permanecem os mesmos; não se cria uma segunda paleta de
marca. A existência de um tema light completo ainda não foi declarada como
implementada.

Scrollbars, bordas, focus, selected e disabled pertencem ao mesmo contrato de
tokens. Um módulo não pode definir essas cores de forma independente.

## 18. GlobalTopbar — arquitetura alvo

A arquitetura aprovada é:

```text
ProductShell
├── Sidebar
├── GlobalTopbar
└── Workspace
```

`GlobalTopbar` terá altura fixa de 40px, será persistente durante a navegação
normal e não deverá desmontar por troca comum de módulo. A integração futura
fica limitada à topbar; a Sidebar existente não está autorizada para
redesign.

Slots canônicos:

- **left:** título de página/área em `context-accent`; em `PAGE MODE`, título e
  abas; em `MODULE MODE`, título, voltar, avançar, histórico e pesquisa
  responsiva com largura máxima aproximada de 60ch;
- **center:** ações e ferramentas específicas do módulo, sem permitir que o
  módulo controle a estrutura global;
- **right:** `NotificationBell` e avatar/perfil; o avatar mantém o acesso à
  rota `/conta`.

Esta é uma arquitetura alvo. Não há `GlobalTopbar` implementado ou validado
no checkout atual.

## 19. GlobalNoticeCenter — contrato alvo

O fluxo compartilhado será:

```text
módulo → publishNotice() → GlobalNoticeCenter
       → toast imediato → NotificationBell / avisos recentes
```

Toast e sino representam o mesmo evento. Não devem existir dois sistemas
independentes de aviso para uma mesma operação. O contrato conceitual é:

```ts
publishNotice({
  severity,
  title,
  message,
  details?,
  copyPayload?,
  source?,
})
```

As únicas severidades são `SUCCESS`, `INFO`, `PENDING`, `WARNING` e `ERROR`.
O módulo escolhe a severidade; não escolhe a cor. `SUCCESS` só aparece depois
de persistência ou validação realmente confirmada.

### Retenção e diagnóstico

Na primeira fase, avisos operacionais permanecem apenas em memória/sessão:

```text
NOTICE_RETENTION_MS = 120000
```

O toast dura poucos segundos; o sino mantém o aviso recente até o TTL. Não
fazem parte deste escopo Supabase, banco, polling, websocket ou histórico
persistente. Notificação persistente será um sistema futuro separado.

Diagnósticos podem oferecer copiar, ver detalhes e fechar. O payload copiado
deve excluir tokens, cookies, secrets, credenciais, headers sensíveis,
`service_role` e dados privados desnecessários.

`GlobalNoticeCenter`, `publishNotice` e `NotificationBell` não foram
encontrados como implementação canônica no estado auditado; sua criação é
fase futura.

## 20. Planilhas

Nesta fundação, planilhas e grids somente herdam background, foreground,
bordas, scrollbars, seleção, foco, estados e notices. Não haverá redesenho de
grid, mudança de densidade estrutural ou alteração de contrato de dados. A
padronização estrutural das planilhas é uma tarefa sucessora.

## 21. Sequência futura e guard automatizado

Não será feito big-bang. A sequência planejada é:

1. consolidar tokens globais;
2. implementar e validar `GlobalTopbar`;
3. implementar e validar `GlobalNoticeCenter`;
4. inventariar topbars atuais;
5. inventariar notices atuais;
6. migrar gradualmente cada área, preservando consumidores;
7. remover duplicações somente após regressões e smoke manual;
8. tratar planilhas em etapa sucessora.

Um guard futuro de teste/lint deverá falhar quando componente ativo introduzir
`purple`, `violet`, `indigo`, `fuchsia`, `lilac`, `lavender` ou valores brutos
fora dos arquivos centrais autorizados. O guard deverá classificar assets/logos
externos antes de sinalizar uma exceção. A ausência desse guard hoje é uma
pendência explícita, não uma prova de conformidade total.

## 22. Registro estrutural e governança

O registro estrutural mínimo está em [SDD — fundação visual global](sdd-fundacao-visual-global.md).
Ele descreve alvo, escopo, migração gradual, gates, riscos e rollback visual;
não autoriza implementação nesta tarefa.

Não foi criado ADR novo: não há ADR visual aceito no conjunto auditado que
precise ser duplicado, e a decisão compartilhada fica registrada neste
documento canônico e na SDD específica. Caso a implementação altere uma
invariante arquitetônica posteriormente, a necessidade de ADR deverá ser
reavaliada antes do código.

## 23. Aceite documental

```text
GLOBAL_VISUAL_FOUNDATION_PLANNED = YES
OFFICIAL_COLOR_CONTRACT = PALETTE_AND_SEMANTIC_TOKENS_DEFINED
STATUS_COLOR_CONTRACT = SUCCESS_INFO_PENDING_WARNING_ERROR_DEFINED
PURPLE_VIOLET_INDIGO_LILAC_BAN = PLANNED_AS_ACTIVE_FRONTEND_GUARD
DARK_MODE_CONTRACT = DEFINED
LIGHT_MODE_CONTRACT = DEFINED_AS_OPTIONAL_TARGET
GLOBAL_TOPBAR_TARGET = DEFINED_NOT_IMPLEMENTED
GLOBAL_NOTICE_CENTER_TARGET = DEFINED_NOT_IMPLEMENTED
NOTICE_RETENTION = 120000_MS_MEMORY_OR_SESSION_ONLY
PERSISTENT_NOTIFICATION_SCOPE = OUT_OF_SCOPE_FUTURE_SYSTEM
SPREADSHEET_STANDARDIZATION = SUCCESSOR_TASK
IMPLEMENTATION_STATUS = NOT_STARTED_FOR_THIS_FOUNDATION
ADR_DECISION = NOT_CREATED_NON_REDUNDANT
SDD_DECISION = MINIMAL_SDD_CREATED_FOR_PLANNING
CODE_CHANGED = NO
SHELL_CHANGED = NO
MODULES_CHANGED = NO
REMOTE_OPERATION = NONE
```
