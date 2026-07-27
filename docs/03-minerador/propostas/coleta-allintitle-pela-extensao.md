# SDD â€” Coleta de `results_allintitle` pela extensÃ£o do Minerador

**Status:** implementada localmente; validaÃ§Ã£o manual da extensÃ£o e do Google pendente
**MÃ³dulo proprietÃ¡rio:** Minerador
**Componente afetado:** extensÃ£o Chrome `minerador-extensao/`
**Data:** 2026-07-22

## DecisÃ£o e limite

Esta proposta introduz uma mediÃ§Ã£o explÃ­cita de resultados `allintitle` no navegador, acionada a partir de uma seleÃ§Ã£o real no Minerador. Ela nÃ£o autoriza implementaÃ§Ã£o, buscas no Google, escrita no Supabase, migration, nem alteraÃ§Ã£o no Arquiteto.

`volume_search` e `results_allintitle` continuam mÃ©tricas independentes. A ausÃªncia, falha ou bloqueio da mediÃ§Ã£o de resultados nÃ£o pode apagar volume, resultado ou KGR previamente persistidos. KGR sÃ³ pode ser recalculado apÃ³s confirmaÃ§Ã£o de uma mediÃ§Ã£o numÃ©rica vÃ¡lida, quando volume tambÃ©m existir e a estratÃ©gia KGR for aplicÃ¡vel.

## Auditoria do estado atual

| Ãrea | EvidÃªncia atual | ConsequÃªncia para a proposta |
| --- | --- | --- |
| Manifest | MV3, `activeTab` e `storage`; host permissions para `suggestqueries.google.com` e Supabase. | NÃ£o hÃ¡ permissÃ£o nem content script para ler Google Search. |
| Service worker | `background.js` recebe apenas `{ action: "mine" }`, consulta Autocomplete em loop e grava novas keywords diretamente em `keywords_kgr`. | O canal `chrome.runtime` e o trabalho assÃ­ncrono sÃ£o reutilizÃ¡veis, mas o fluxo de gravaÃ§Ã£o direta nÃ£o Ã© adequado para a mediÃ§Ã£o proposta. |
| Popup | Login Supabase, resoluÃ§Ã£o de perfil e marca/lista; envia `mine`; abre uma aba do painel somente por `tabs.create`. | A sessÃ£o, a associaÃ§Ã£o de marca e o botÃ£o explÃ­cito sÃ£o referÃªncias reutilizÃ¡veis; nÃ£o existe coordenaÃ§Ã£o a partir da seleÃ§Ã£o do painel. |
| Content scripts | Nenhum declarado no manifest. | SerÃ¡ necessÃ¡rio um content script especÃ­fico e limitado Ã s pÃ¡ginas de busca permitidas. |
| Aba de busca | NÃ£o hÃ¡ uso de `tabs.query`, `tabs.update`, `tabs.onUpdated` ou identificaÃ§Ã£o de aba de trabalho. | SerÃ¡ necessÃ¡rio um controlador que crie ou reutilize uma Ãºnica aba. |

### AplicaÃ§Ã£o Minerador

- `results_allintitle` jÃ¡ Ã© um campo numÃ©rico de `keywords_kgr`; Ã© exibido, exportado e importado na tabela.
- O patch de volume em `lib/minerador/volume-provider.ts` preserva `results_allintitle` e somente recalcula `kgr_score` quando hÃ¡ volume vÃ¡lido e resultado numÃ©rico existente.
- O botÃ£o atual `Qualificar (Volume & KGR)` chama apenas `/api/volume`; seu comentÃ¡rio histÃ³rico menciona resultados, mas ele nÃ£o os coleta.
- `/api/mine` Ã© um fluxo legado de Autocomplete com NextAuth e Google Sheets. Ele cria links `https://www.google.com/search?q=allintitle:<keyword>` na planilha, mas nÃ£o mede nem persiste a contagem. NÃ£o deve ser reutilizado como rota de coleta.
- Consumidores atuais do campo: tabela e detalhe do Minerador, filtros/ordenaÃ§Ã£o/estado de mediÃ§Ã£o, exportaÃ§Ã£o CSV, importaÃ§Ã£o CSV e `app/api/generate-briefing`. O Arquiteto nÃ£o Ã© alterado por esta proposta.

## Fluxo proposto

```text
seleÃ§Ã£o explÃ­cita no Minerador
â†’ prÃ©-validaÃ§Ã£o local de keywordId e brandId reais
â†’ extensÃ£o recebe lote pequeno
â†’ uma aba de trabalho Ã© criada ou reutilizada
â†’ consulta allintitle:"keyword" por item, respeitando intervalo
â†’ content script extrai e classifica a pÃ¡gina
â†’ resultados individuais retornam ao Minerador, inclusive fora de ordem
â†’ prÃ©via sem escrita
â†’ confirmaÃ§Ã£o humana explÃ­cita
â†’ persistÃªncia validada por usuÃ¡rio/marca no servidor
â†’ patch localizado da linha e recÃ¡lculo seguro de KGR
```

Cancelar encerra o controlador, remove listeners e impede novas navegaÃ§Ãµes. Resultados jÃ¡ recebidos podem permanecer apenas na prÃ©via atÃ© a confirmaÃ§Ã£o; nÃ£o hÃ¡ persistÃªncia automÃ¡tica ao terminar, recarregar a aplicaÃ§Ã£o ou fechar o popup.

## Contrato aditivo proposto

O transporte entre painel e extensÃ£o deve usar mensagens versionadas e um `requestId` gerado no painel. A extensÃ£o nunca cria `keywordId` nem troca `brandId`.

```ts
type AllintitleMeasurementRequest = {
  type: "minerador.allintitle.measure.v1";
  requestId: string;
  brandId: string;
  items: Array<{ keywordId: string; keyword: string }>;
  options: { intervalMs: number; maxItems: number };
};

type AllintitleMeasurementResult = {
  type: "minerador.allintitle.result.v1";
  requestId: string;
  keywordId: string;
  brandId: string;
  keyword: string;
  query: string;
  resultsAllintitle?: number;
  status: "success" | "zero_results" | "unavailable" | "captcha" | "blocked" | "error";
  source: "google_search_extension";
  measuredAt: string;
  error?: { code: string; message: string };
};
```

`success` exige inteiro finito maior que zero. `zero_results` exige prova explÃ­cita da pÃ¡gina de que nÃ£o houve resultado e deve carregar `resultsAllintitle: 0`. Os demais estados nÃ£o carregam nÃºmero e nunca representam zero. A aplicaÃ§Ã£o deve correlacionar pelo par `requestId` + `keywordId`, aceitar respostas fora de ordem e rejeitar item de outra marca, keyword divergente ou requisiÃ§Ã£o expirada/cancelada.

O retorno para persistÃªncia deve ser uma segunda aÃ§Ã£o explÃ­cita do usuÃ¡rio, contendo somente resultados em `success` ou `zero_results`. A rota/aÃ§Ã£o de confirmaÃ§Ã£o ainda deve ser definida no SDD de implementaÃ§Ã£o, mas obrigatoriamente autentica o usuÃ¡rio no servidor, verifica a pertenÃ§a de cada keyword Ã  `brandId` ativa e aplica atualizaÃ§Ãµes idempotentes por `keywordId`.

## Leitura do Google e permissÃµes

Propor uma permissÃ£o mÃ­nima e revisÃ¡vel para a famÃ­lia de URLs efetivamente escolhida, por exemplo a busca Google e seus caminhos de consentimento. O manifest nÃ£o deve receber uma permissÃ£o global sem revisÃ£o. A implementaÃ§Ã£o deverÃ¡:

- adicionar somente os `host_permissions` necessÃ¡rios para a busca e, se indispensÃ¡vel, consentimento/redirecionamento;
- declarar um content script restrito a essas URLs, ou injetÃ¡-lo programaticamente com permissÃ£o equivalente;
- incluir a permissÃ£o de abas somente se `tabs`/`scripting` for realmente necessÃ¡ria para criar, atualizar e observar a aba reutilizada;
- manter `storage` para estado transitÃ³rio mÃ­nimo, sem gravar resultados confirmados nele;
- nÃ£o expor token, senha ou chave de serviÃ§o no content script ou em mensagens.

O leitor deve validar que a consulta exibida corresponde a `allintitle:"<keyword>"` normalizada. Ele deve combinar sinais sem depender de um seletor Ãºnico: texto-resumo de resultados, regiÃµes conhecidas de estatÃ­sticas, metadados/DOM acessÃ­vel e mensagens explÃ­citas de ausÃªncia. CAPTCHA, pÃ¡gina de consentimento, bloqueio, redirecionamento, HTML sem contagem e keyword divergente sÃ£o classificaÃ§Ãµes, nÃ£o valores numÃ©ricos.

## PersistÃªncia e idempotÃªncia

No momento da confirmaÃ§Ã£o, cada `success` ou `zero_results` produz um patch localizado em `keywords_kgr`:

- `results_allintitle` recebe apenas inteiro finito nÃ£o negativo comprovado;
- metadados aditivos de fonte, data, consulta e estado devem ser preservados no campo de evidÃªncia jÃ¡ compatÃ­vel, apÃ³s auditoria do formato atual;
- `volume_search` e os metadados de volume nunca sÃ£o alterados por esta confirmaÃ§Ã£o;
- para `unavailable`, `captcha`, `blocked` e `error`, nÃ£o hÃ¡ patch de resultado nem `null` persistido;
- repetir a mesma mediÃ§Ã£o confirmada Ã© idempotente; uma confirmaÃ§Ã£o mais recente e vÃ¡lida pode substituir somente o resultado, mantendo a proveniÃªncia anterior quando o modelo atual permitir;
- se o resultado e o volume forem vÃ¡lidos, o KGR Ã© recalculado somente conforme a aplicabilidade jÃ¡ decidida. Caso contrÃ¡rio, o KGR existente nÃ£o Ã© apagado.

NÃ£o hÃ¡ autorizaÃ§Ã£o nesta proposta para mudar schema. Antes da implementaÃ§Ã£o, deve-se auditar a coluna de evidÃªncia disponÃ­vel, RLS e o mecanismo de autenticaÃ§Ã£o da aplicaÃ§Ã£o para decidir se os metadados cabem de forma retrocompatÃ­vel ou se exigem uma proposta estrutural separada.

## CoordenaÃ§Ã£o, limites e recuperaÃ§Ã£o

- A aÃ§Ã£o nasce exclusivamente da seleÃ§Ã£o no painel e mostra o lote, marca e intervalo antes de iniciar.
- O tamanho mÃ¡ximo inicial deve ser pequeno e configurÃ¡vel; o valor concreto sÃ³ serÃ¡ decidido apÃ³s teste manual autorizado.
- Uma Ãºnica aba identificada pelo `requestId` Ã© reutilizada sequencialmente. Fechamento da aba, perda do service worker ou recarregamento do painel conclui os itens pendentes como `error`/`unavailable` na prÃ©via, sem escrita.
- O retry Ã© manual, explÃ­cito e limitado somente aos estados falhos. Nunca tenta novamente `success` ou `zero_results` sem nova seleÃ§Ã£o.
- A troca de marca cancela a prÃ©via ativa e invalida mensagens da marca anterior.
- O painel mostra fontes separadas: volume da API e resultados da extensÃ£o. Falha em uma mÃ©trica nÃ£o bloqueia a outra.
- Caso a extensÃ£o esteja indisponÃ­vel, o painel mantÃ©m a seleÃ§Ã£o e oferece instruÃ§Ã£o de conexÃ£o/repetiÃ§Ã£o; nÃ£o usa fallback silencioso de API nem infere a contagem por link.

## Testes previstos

Os testes devem usar fixtures HTML locais e um adaptador de mensagens/fake de aba; nenhuma consulta Google real serÃ¡ feita pela suÃ­te.

| Grupo | Casos obrigatÃ³rios |
| --- | --- |
| Leitor | contagem comum, zero explÃ­cito, nÃºmero formatado, contagem ausente, CAPTCHA, consentimento, redirecionamento, keyword divergente e idioma/localizaÃ§Ã£o. |
| Controlador | uma aba reutilizada, ordem de navegaÃ§Ã£o, respostas fora de ordem, aba fechada, cancelamento, intervalo e retry apenas dos falhos. |
| Contrato | duas marcas, `keywordId` real, `requestId`, resultado de outra marca rejeitado e extensÃ£o indisponÃ­vel. |
| PersistÃªncia | prÃ©via sem escrita, confirmaÃ§Ã£o explÃ­cita, idempotÃªncia, falha parcial, resultado anterior preservado, erro sem `null`, zero somente explÃ­cito e atualizaÃ§Ã£o localizada. |
| MÃ©tricas | volume e resultado independentes; KGR apenas com ambas as mÃ©tricas vÃ¡lidas e aplicabilidade correspondente. |

## Arquivos previstos para uma implementaÃ§Ã£o futura

- `minerador-extensao/manifest.json` â€” permissÃµes mÃ­nimas e content script;
- `minerador-extensao/background.js` â€” controlador de lote e aba reutilizÃ¡vel;
- novo leitor/content script de resultados Google e fixtures locais;
- `minerador-extensao/popup.*` somente se for necessÃ¡rio expor conexÃ£o/estado da extensÃ£o;
- `app/(brand)/[brandRef]/minerador/page.tsx` e `modules/minerador` â€” prÃ©via, confirmaÃ§Ã£o e atualizaÃ§Ã£o localizada;
- nova rota/aÃ§Ã£o autenticada do Minerador, se a integraÃ§Ã£o nÃ£o puder usar um contrato existente sem abrir uma fronteira insegura;
- testes focados e documentaÃ§Ã£o de operaÃ§Ã£o.

Qualquer mudanÃ§a em componentes compartilhados, schema, RLS ou contrato do Arquiteto interrompe esta implementaÃ§Ã£o futura para proposta adicional e autorizaÃ§Ã£o.

## Compatibilidade, riscos e rollback

A mudanÃ§a Ã© aditiva: leitores atuais de `results_allintitle` continuam recebendo `number | null`, e os estados operacionais propostos ficam em metadados de mediÃ§Ã£o, nÃ£o em enums de status da keyword. O fluxo de volume e o Autocomplete atual permanecem independentes.

Os riscos principais sÃ£o mudanÃ§a de HTML do Google, CAPTCHA/bloqueio, requisitos de consentimento, mensagens obsoletas apÃ³s reload e tentativa de gravar em marca errada. As barreiras sÃ£o mÃºltiplos sinais de leitura, estados explÃ­citos sem inferÃªncia, `requestId`, validaÃ§Ã£o servidor-side da marca, prÃ©via/confirmaÃ§Ã£o e patches que nunca enviam `null` em falha.

Rollback: desativar o comando de coleta e remover as permissÃµes/content script adicionados em uma entrega futura. Como a mediÃ§Ã£o sÃ³ grava apÃ³s confirmaÃ§Ã£o e preserva proveniÃªncia, nÃ£o hÃ¡ limpeza automÃ¡tica nem reversÃ£o de dados por script.

## CritÃ©rios de aceite para futura implementaÃ§Ã£o

1. A extensÃ£o retorna um resultado correlacionado para cada keyword selecionada, sem misturar marcas.
2. Apenas zero explÃ­cito Ã© persistido como `0`; qualquer ausÃªncia de nÃºmero preserva o valor anterior.
3. O usuÃ¡rio vÃª a prÃ©via e confirma antes de qualquer escrita.
4. O lote pode ser cancelado e repetido somente nos itens falhos.
5. Volume, `results_allintitle` e decisÃ£o KGR permanecem dimensÃµes independentes.
6. Os testes com fixtures cobrem todos os estados e nÃ£o fazem trÃ¡fego real ao Google.

## ImplementaÃ§Ã£o local â€” 2026-07-22

Foi implementado o contrato aditivo `minerador.allintitle.*.v1` entre a pÃ¡gina e a extensÃ£o. Por seguranÃ§a, a ponte nÃ£o recebe host permission global: o usuÃ¡rio abre o popup na prÃ³pria aba do Minerador e usa **Conectar esta aba do Minerador**, que injeta a ponte com a permissÃ£o existente `activeTab`. O painel entÃ£o verifica disponibilidade por evento; sem ponte, volume continua independente e a prÃ©via informa como conectÃ¡-la.

O service worker cria uma aba Google nÃ£o ativa e a reutiliza sequencialmente. `scripting` Ã© usado somente nessa aba e somente apÃ³s uma solicitaÃ§Ã£o explÃ­cita. As Ãºnicas host permissions novas sÃ£o `https://www.google.com/*` e `https://www.google.com.br/*`; elas permitem a leitura local do resultado, nÃ£o fornecem escrita de domÃ­nio. O estado transitÃ³rio mÃ­nimo do lote Ã© guardado em `chrome.storage.session`.

O leitor possui fallbacks de regiÃµes de resultados, texto de status e corpo da pÃ¡gina; classifica CAPTCHA, consentimento, bloqueio, ausÃªncia e zero explÃ­cito sem inferir zero. CAPTCHA/bloqueio pausa o lote, foca a aba e exige `Retomar` ou `Cancelar`. O limite padrÃ£o Ã© 5 e o mÃ¡ximo Ã© 10, com uma consulta e uma aba por vez, intervalo conservador de 3,5 segundos.

O Minerador mostra prÃ©via por keyword, permite excluir resultados vÃ¡lidos e persiste apenas `success` numÃ©rico ou `zero_results` explÃ­cito apÃ³s confirmaÃ§Ã£o. O patch localizado preserva volume, intenÃ§Ã£o, nicho, silo, publicaÃ§Ã£o, URL, canonical, polÃ­tica principal e demais metadados; registra proveniÃªncia/histÃ³rico em `analise_semantica` e recalcula KGR apenas fora de `not_applicable` quando jÃ¡ hÃ¡ volume vÃ¡lido. Falhas, bloqueios, cancelamentos e dados ausentes nÃ£o persistem `null` nem alteram resultado existente.

Nenhuma chamada ao Google, escrita no Supabase, migration, limpeza de armazenamento, commit, push ou deploy foi executado nesta implementaÃ§Ã£o. A validaÃ§Ã£o real permanece manual.

### Correlacao corrigida do retorno individual

O contrato implementado exige `requestId` no pedido e preserva esse valor sem substituicao desde o workspace ate o reader e de volta pela bridge. `batchId` identifica apenas o lote, inclusive quando ele possui uma keyword. `batch_completed`, cancelamento e retomada tambem carregam a correlacao da operacao. O workspace rejeita retorno sem ID com `response_missing_request_id`, divergencia com `request_mismatch` e ignora retorno de lote anterior como `stale_response`; nenhuma dessas situacoes persiste `null` ou altera resultado existente.
