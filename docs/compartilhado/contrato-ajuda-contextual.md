# Contrato compartilhado — Ajuda contextual por área

**Status:** implementado localmente na Fase 1; conteúdo completo por área ainda
é incremental.<br>
**Módulo proprietário:** Interface / sistema de ajuda compartilhado da
Plataforma.<br>
**Persistência:** temporária no cliente; não há entidade, migration ou
operação remota.

## Objetivo

O painel de ajuda contextual explica a área operacional atualmente aberta sem
substituir o `InfoHint`. Ele é acionado na `GlobalTopbar`, abre um drawer fixo
à direita e mantém a tela sob ele sem reflow.

## Escopo de rotas

O trigger aparece somente nas rotas tenantizadas de:

`Marca`, `Minerador`, `Arquiteto`, `Radar`, `Planejador`, `Redator` e
`Publicações`.

A área é resolvida por `brandRef` validado e pelo segmento canônico do módulo;
a raiz de uma marca representa `Marca`. Admin, Conta/Perfil, login, cadastro,
seleção de contexto, agência e rotas públicas não recebem o trigger.

Não existe fallback para outra área. Quando a área é válida, mas ainda não
possui tópicos publicados no contrato local, o painel mostra:
`Ajuda desta área ainda não disponível.`

## Contrato de conteúdo

O contrato TypeScript está em `lib/context-help.ts`:

```ts
type ContextHelpTopic = {
  id: string;
  title: string;
  summary: string;
  description: string;
  sections?: readonly { heading: string; body: string }[];
  howToUse?: readonly string[];
  keywords?: readonly string[];
  futureArticleUrl?: string;
};
```

Cada módulo é dono dos seus textos. O shell somente resolve a área e renderiza
o contrato; não aceita HTML remoto, não chama IA e não inventa conteúdo. O
registro compartilhado em `lib/context-help-registry.ts` deve apontar para o
arquivo local do módulo, sem copiar seus textos para a interface global.

O piloto real do Minerador vive em `modules/minerador/context-help.ts` e cobre:
`Sobre o Minerador`, `Conferir site`, `Lógica`, `Volume`, `Resultados`, `IA` e
`Revisão Humana`. Os textos devem continuar coerentes com handlers, contratos
e estado atual do módulo; estados não confirmados devem permanecer explícitos.

## Comportamento e acessibilidade

- O trigger usa o `InfoHint` compartilhado com o título `Ajuda desta área`.
- O drawer possui busca somente sobre os tópicos carregados da área atual.
- A busca normaliza maiúsculas, acentos e espaços.
- A seleção abre detalhe no próprio drawer e oferece retorno à lista.
- `Escape` e o botão de fechar encerram o drawer e devolvem o foco ao trigger.
- O drawer mantém foco navegável por teclado e não cria nested button.
- O conteúdo essencial da operação continua visível na tela; a ajuda é
  complementar.
- O drawer não contém CTA, formulário ou chamada remota.

## Regras visuais

O padrão segue o sistema visual e a Quiet UI existentes: superfície elevada
neutra, borda discreta, texto legível, foco semântico, `max-w-sm` no desktop e
largura total em viewport estreita. A validação mínima cobre 360, 768, 1024 e
1440px, em light e dark mode, sem scroll horizontal.

O painel é um padrão diferente do `InfoHint`: o primeiro suporta lista, busca e
detalhe; o segundo continua sendo uma explicação curta sem interação interna.
