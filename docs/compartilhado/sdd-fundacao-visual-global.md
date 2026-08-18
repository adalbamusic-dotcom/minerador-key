# SDD — Fundação visual global

**Status:** `TARGET APPROVED` — planejamento estrutural visual; não autoriza implementação nesta tarefa.  
**Data:** 2026-08-13  
**Módulo proprietário:** infraestrutura compartilhada / sistema visual.  
**Implementação:** `CURRENTLY IMPLEMENTED = PARTIAL`; a fundação descrita aqui ainda não foi implementada como conjunto global.

## 1. Objetivo

Estabelecer um contrato visual único para o Minerador Key, compartilhado por
Marca, Minerador, Arquiteto, Radar, Planejador, Redator, Publicações, Conta e
Admin. O contrato impede que cada módulo defina sua própria paleta, status,
alertas, notices, topbar, bordas, scrollbars ou estados globais.

Este documento é estrutural e documental. Não altera componentes, frontend,
shell, módulos, contratos de dados, Supabase/schema ou operações remotas.

Fonte detalhada dos tokens e regras visuais: [Sistema visual canônico](sistema-visual.md).

## 2. Problema e decisão

O código atual possui tokens globais parciais em `app/globals.css`, um
`ProductShell` compartilhado e acesso a `/conta`, mas ainda não possui um
`GlobalTopbar`, um `GlobalNoticeCenter`, `publishNotice` ou
`NotificationBell` canônicos. Notices e notificações ainda aparecem em
estados locais de áreas diferentes.

A decisão aprovada é consolidar essas responsabilidades em um contrato
semântico compartilhado. Componentes consumidores escolhem semântica e
conteúdo; a fundação visual fornece tokens, estrutura e comportamento global.

Esta decisão registra o alvo, não uma conclusão de implementação.

## 3. Contrato visual aprovado

### 3.1 Tokens

A paleta oficial é definida exclusivamente em `sistema-visual.md` e contém:

`background #131413`, `foreground #f3f4f6`, `action-accent #193cb8`,
`context-accent #12A1E0`, `module-accent #10DDE0`, `positive-soft #63F1AF`,
`highlight #C8FF00`, `success #1fcb0a`, `warning #f79001`,
`pending #E6CE00`, `danger #A61E1E`, `divider-dark #212121` e
`divider-light #d1d1d1`.

Valores brutos ficam somente nos arquivos centrais de tokens. Componentes não
podem introduzir roxo, violeta, índigo, fúcsia, lavanda, lilás ou equivalentes,
nem hex/rgb/rgba/hsl/hsla ou cores Tailwind fora do contrato. Derivações
`transparent`, `currentColor`, `inherit`, alpha e `color-mix` de tokens
oficiais são permitidas. Assets e logos externos exigem classificação antes de
qualquer guard automático.

### 3.2 Status

As únicas severidades globais são `SUCCESS`, `INFO`, `PENDING`, `WARNING` e
`ERROR`. O mapeamento é `success`, `context-accent`, `pending`, `warning` e
`danger`, respectivamente. `SUCCESS` exige confirmação real; não é um estado
otimista. `positive-soft` serve somente como apoio visual e `highlight` fica
reservado para fixação, exceção ou destaque especial.

### 3.3 Temas

No dark mode, canvas, foreground e divisor base são `#131413`, `#f3f4f6` e
`#212121`. No light mode opcional, background deriva de `#f3f4f6`, foreground
é `#131413` e divisor é `#d1d1d1`; os acentos permanecem os mesmos. Hover,
selected, focus e disabled derivam dos tokens oficiais e devem passar por
verificação de contraste e legibilidade.

## 4. GlobalTopbar

### 4.1 Estrutura alvo

```text
ProductShell
├── Sidebar
├── GlobalTopbar
└── Workspace
```

O `GlobalTopbar` terá 40px, permanecerá montado durante a navegação normal e
será integrado de forma controlada ao `ProductShell`. A Sidebar atual não
entra em redesign nesta decisão.

### 4.2 Slots

- `left`: título da página/área em `context-accent`; em `PAGE MODE`, título e
  abas; em `MODULE MODE`, título, voltar, avançar, histórico e busca
  responsiva com máximo aproximado de 60ch;
- `center`: ações e ferramentas específicas do módulo;
- `right`: `NotificationBell` e avatar/perfil, com acesso a `/conta`.

O slot central não autoriza cada módulo a recriar a estrutura da topbar ou a
definir cores globais próprias.

## 5. GlobalNoticeCenter

O fluxo canônico será:

```text
módulo → publishNotice() → GlobalNoticeCenter
       → toast imediato → NotificationBell / avisos recentes
```

Toast e sino representam o mesmo evento. O contrato conceitual aceita:

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

O módulo informa `severity`, título e conteúdo; não informa cor. A retenção
inicial é somente em memória/sessão, com `NOTICE_RETENTION_MS = 120000`. O
toast permanece por poucos segundos e o sino mantém o aviso recente até o
TTL.

Ficam fora desta SDD: Supabase, banco, polling, websocket e histórico
persistente. Uma notificação persistente futura será outro sistema e outra
decisão. Diagnósticos copiáveis nunca devem incluir tokens, cookies, secrets,
credenciais, headers sensíveis, `service_role` ou dados privados
desnecessários.

## 6. Planilhas

Planilhas e grids herdarão background, foreground, bordas, scrollbars, seleção,
foco, status e notices. Não haverá redesign de grid, mudança estrutural de
densidade ou alteração de contrato nesta fundação. A padronização estrutural
das planilhas é sucessora independente.

## 7. Escopo e não escopo

### Incluído no alvo

- tokens semânticos globais;
- semântica única de status e alertas;
- integração controlada de `GlobalTopbar` ao shell;
- `GlobalNoticeCenter`, toast e sino como uma mesma notificação;
- retenção curta em memória/sessão;
- guard futuro contra cores proibidas e valores brutos;
- migração gradual por área com regressões e smoke manual.

### Não autorizado nesta tarefa

- implementação de componentes ou tokens no frontend;
- redesign da Sidebar;
- migração de grids;
- remoção imediata de notices locais;
- alteração de rotas, autenticação, contratos, persistência ou IA;
- Supabase/schema, migrations, dados ou operação remota;
- mudança de módulos fora da documentação compartilhada.

## 8. Estado atual auditado

| Evidência | Estado |
| --- | --- |
| `app/globals.css` | tokens base e acentos de contexto/módulo presentes; contrato completo ainda ausente |
| `ProductShell` | presente e compartilhado; Sidebar existente |
| acesso a `/conta` | presente no shell |
| `GlobalTopbar` | não encontrado como implementação canônica |
| `GlobalNoticeCenter` / `publishNotice` / `NotificationBell` | não encontrados como implementação canônica |
| notices locais | presentes em módulos e painéis distintos |
| guard `check-visual-system.mjs` | não existe neste checkout |
| grids/planilhas | sem padronização estrutural desta SDD |

O estado acima é separado de `TARGET APPROVED`. Nenhum item ausente é tratado
como implementado por esta documentação.

## 9. Sequência de implementação futura

Cada fase exige regressão do shell, navegação, responsividade e estados antes
de avançar:

1. consolidar tokens globais;
2. implementar `GlobalTopbar`;
3. implementar `GlobalNoticeCenter`;
4. inventariar topbars existentes;
5. inventariar notices existentes;
6. migrar gradualmente por área;
7. remover duplicações somente após validação;
8. tratar planilhas em tarefa sucessora.

### Gate de cada fase

- consumidores atuais mapeados;
- contrato visual e semântico preservado;
- regressões automatizadas do escopo aprovadas;
- smoke manual autenticado das áreas afetadas;
- contraste, foco, responsividade e reduced motion verificados;
- ausência de mistura de notices ou perda de mensagem;
- rollback visual disponível antes de remover o sucessor local.

## 10. Guard futuro

Após a consolidação dos tokens, criar um teste/lint direcionado que percorra
componentes ativos e falhe para:

- nomes/classe/valores `purple`, `violet`, `indigo`, `fuchsia`, `lilac` e
  `lavender`;
- hex, rgb, rgba, hsl, hsla e cores Tailwind fora dos arquivos centrais
  autorizados.

O guard precisa ignorar ou classificar explicitamente logos e assets externos,
e deve oferecer uma exceção documentada com limite de arquivo. A ausência do
guard nesta fase é uma pendência, não aprovação automática do código atual.

## 11. Riscos, compatibilidade e rollback

### Riscos

- topbars locais possuírem estados ou ações não mapeados;
- notices locais perderem detalhes ou duplicarem o toast global;
- contraste inadequado ao substituir cores ad hoc;
- remount do shell afetar estado de navegação;
- consumidores dependerem de mensagens locais para validação manual.

### Mitigações

- inventário antes de cada migração;
- adapter compatível para o contrato de notice;
- migração por área, sem big-bang;
- preservação do `ProductShell` e da Sidebar;
- regressões automatizadas e smoke manual autenticado;
- classificação explícita de implementação atual versus alvo.

### Rollback visual

Cada fase deve poder reverter a composição visual e o adapter da área sem
apagar dados, alterar persistência ou mudar contratos editoriais. A remoção de
duplicações só ocorre depois de comprovar que o sucessor exibe o mesmo evento,
detalhe, estado e acesso ao diagnóstico. Não há rollback remoto nesta SDD.

## 12. Dependências e decisões pendentes

Dependências:

- tokens centrais em `app/globals.css` ou sucessor autorizado;
- `ProductShell` e a arquitetura de contexto/navegação já documentada em
  [arquitetura do shell](arquitetura-shell-contexto-navegacao-global.md);
- inventário de notices e topbars locais;
- estratégia de teste/lint para o guard;
- validação manual autenticada após cada integração.

Decisões pendentes para a implementação:

- nomes CSS finais dos tokens semânticos;
- API concreta e armazenamento em memória/sessão do Notice Center;
- posição final dos slots da topbar em desktop e viewport estreito;
- regras de foco, teclado, reduced motion e leitura por tecnologias assistivas;
- critério de classificação de assets externos no guard.

Nenhuma pendência autoriza código ou operação remota nesta tarefa.

## 13. Aceite e governança

```text
GLOBAL_VISUAL_FOUNDATION_PLANNED = YES
TARGET_STATUS = APPROVED_FOR_STRUCTURAL_PLANNING
CURRENTLY_IMPLEMENTED = PARTIAL / FOUNDATION_NOT_STARTED
ADR_DECISION = NOT_CREATED; NO_RELEVANT_NON_REDUNDANT_ADR_IDENTIFIED
SDD_DECISION = CREATED_AS_MINIMAL_STRUCTURAL_RECORD
SPREADSHEET_STANDARDIZATION = SUCCESSOR_TASK
PERSISTENT_NOTIFICATION = OUT_OF_SCOPE
CODE_CHANGED = NO
SHELL_CHANGED = NO
MODULES_CHANGED = NO
REMOTE_OPERATION = NONE
```

Uma implementação futura deverá atualizar a distinção entre alvo e estado
real, registrar testes e smoke manual e só então declarar cada parte como
`CURRENTLY IMPLEMENTED`.
