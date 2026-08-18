# Fase 2C.2 - hierarquia visual Admin, Agencia e Marca

## Estado local verificado

- `/admin` resolve `perfis.role = 'admin'` no layout server-side antes de renderizar o shell. A antiga espera visual de confirmacao global foi removida do fluxo autorizado.
- Os limites `loading.tsx` de marca e agencia deixam o shell montado e ocupam somente a area de conteudo.
- `/admin/marcas` continua com a lista global, mas apresenta registro estrutural: marca, agencia vinculada, owner, status, memberships e acoes administrativas.
- `/agencias/{agencyRef}/marcas` apresenta os cards ricos das marcas ativas da agencia. O card so exibe `Entrar na marca` quando a autorizacao editorial individual ja foi confirmada pelo resolvedor server-side.
- O vinculo de agencia continua separado de owner e de acesso editorial. Nenhuma operacao remota foi realizada.

## Homologacao manual pendente

1. Abrir `/admin` e `/admin/marcas`.
2. Abrir a Agencia Adalba e sua rota `marcas`.
3. Entrar em Adalba, voltar a agencia e entrar em Lindisse.
4. Confirmar que nao ha tela cheia de transicao e que o shell permanece visivel nas trocas.

Google Ads permanece fora desta alteracao. A homologacao geral continua pendente do roteiro manual autenticado.
