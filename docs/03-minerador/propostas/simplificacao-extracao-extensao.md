# SDD â€” SimplificaÃ§Ã£o da extraÃ§Ã£o da extensÃ£o do Minerador

**Status:** aprovada e implementada localmente; homologacao manual pendente

> **Nota de prevalencia:** o bloco de lacuna abaixo e o registro anterior a esta autorizacao. O contrato e a implementacao vigentes estao no registro de implementacao local ao final deste documento.
**MÃ³dulo proprietÃ¡rio:** Minerador
**Componente principal:** extensÃ£o Chrome do Minerador
**Data:** 2026-07-27

> **Lacuna bloqueadora para implementaÃ§Ã£o â€” 2026-07-27:** a SDD define o
> fluxo e um formato conceitual, mas nÃ£o aprova o endpoint canÃ´nico, o
> payload persistente final nem a estratÃ©gia de compatibilidade entre o
> popup, o service worker e a aplicaÃ§Ã£o. O contrato referenciado em
> `docs/00-produto/contratos/importacoes.md` tambÃ©m nÃ£o existe neste
> checkout. Conforme a instruÃ§Ã£o de implementaÃ§Ã£o, o cÃ³digo fica bloqueado
> atÃ© essa lacuna ser resolvida.

## 1. Objetivo e fronteiras

Esta proposta reformula a extraÃ§Ã£o da extensÃ£o para que ela descubra,
filtre, meÃ§a e envie keywords brutas ao Minerador sem decidir lista,
projeto, categoria, artigo ou silo.

O fluxo proposto Ã©:

```text
marca autorizada
â†’ intenÃ§Ã£o desejada
â†’ etapa do funil
â†’ keyword semente
â†’ sugestÃµes
â†’ prÃ©via e seleÃ§Ã£o humana
â†’ allintitle em lote pequeno
â†’ filtro de resultados
â†’ volume somente das sobreviventes
â†’ filtro de volume
â†’ confirmaÃ§Ã£o humana
â†’ importaÃ§Ã£o como keyword bruta, sem silo
```

A extensÃ£o continua responsÃ¡vel por descoberta, origem, localidade, pistas
de intenÃ§Ã£o, resultados allintitle e coordenaÃ§Ã£o da mediÃ§Ã£o. O Minerador
continua responsÃ¡vel por persistÃªncia, revisÃ£o humana, KeywordDNA e cÃ¡lculo
de KGR. O Arquiteto continua responsÃ¡vel por agrupamento, artigos, keyword
principal e silos.

Esta SDD nÃ£o implementa cÃ³digo, nÃ£o altera schema, nÃ£o cria migration, nÃ£o
executa SQL ou escrita remota e nÃ£o faz consultas ao Google, RapidAPI, Maps
ou qualquer outro provedor.

## 2. Auditoria do estado atual

### 2.1 ExtensÃ£o e permissÃµes

O `manifest.json` atual usa Manifest V3 e possui:

- permissÃµes `activeTab`, `storage` e `scripting`;
- host permissions para Google Suggest, Google Search, consentimento do
  Google, Supabase e os hosts locais da aplicaÃ§Ã£o;
- popup, service worker em `background.js`, scripts de bridge e reader de
  allintitle.

As permissÃµes atuais jÃ¡ cobrem a base tÃ©cnica para sugestÃµes e para a aba
reutilizada de allintitle. A reformulaÃ§Ã£o nÃ£o precisa de Google Maps nesta
fase. Qualquer novo host para uma fonte de municÃ­pios deve ser evitado atÃ©
que uma fonte interna ou estÃ¡tica seja escolhida e aprovada.

### 2.2 AutenticaÃ§Ã£o, marca e handshake

O popup mantÃ©m sessÃ£o Supabase em `chrome.storage.local`, usa Bearer para os
endpoints da aplicaÃ§Ã£o e consulta `/api/extensao/marcas`. Essa rota devolve
somente marcas autorizadas, com `brandId`, `brandRef` e nome. O handshake do
Minerador confirma a marca da aba por `activeBrandId` e bloqueia divergÃªncia.

O novo fluxo deve preservar esse contrato: `brandId` Ã© obrigatÃ³rio, deve ser
um ID real retornado pela fonte autenticada e precisa coincidir com a marca
confirmada pela aba antes de medir ou importar. Nome e `brandRef` servem para
apresentaÃ§Ã£o e rota, nunca para isolamento.

### 2.3 Lista e projeto no fluxo atual

O popup atual contÃ©m `Salvar na Lista / Projeto`, carrega listas por
`/api/extensao/marcas/{brandId}/listas`, restaura `listId` salvo e impede o
inÃ­cio sem lista. A mensagem `mine` envia `listaId` e `marcaId`.

O service worker ainda possui o fluxo legado `executeMining`, que:

1. consulta keywords existentes por `lista_id` e `brand_id`;
2. consulta sugestÃµes do Google por localidade e letra;
3. deduplica dentro da lista;
4. grava diretamente em `keywords_kgr` com `lista_id`, `brand_id` e
   `status: "bruto"`.

HÃ¡ uma divergÃªncia adicional: o listener legado de `mine` lÃª
`request.brand`, enquanto o popup envia `marcaId`. Essa incompatibilidade
deve ser coberta por teste e resolvida na futura implementaÃ§Ã£o do novo
contrato; nÃ£o Ã© corrigida nesta SDD.

TambÃ©m existe o caminho de `app/api/mine/route.ts`, que recebe somente
`seed` e `locations`, consulta Google Suggest e cria uma planilha. Ele nÃ£o
recebe `brandId` ou `listId` e nÃ£o Ã© um endpoint de importaÃ§Ã£o para
`keywords_kgr`. Portanto, a futura implementaÃ§Ã£o precisa escolher uma Ãºnica
fronteira de importaÃ§Ã£o autenticada e manter o caminho legado compatÃ­vel
durante a transiÃ§Ã£o.

### 2.4 Schema e isolamento

A auditoria das migrations 0005/0006 confirma:

- `keywords_kgr.brand_id` Ã© obrigatÃ³rio e referencia `marcas`;
- `keywords_kgr.lista_id` Ã© anulÃ¡vel;
- `lista_id`, quando preenchido, deve apontar para uma lista da mesma marca;
- hÃ¡ proteÃ§Ã£o por RLS e permissÃµes de marca/mÃ³dulo;
- existem keywords sem lista no estado preservado do banco, portanto a
  tabela e a aplicaÃ§Ã£o jÃ¡ precisam suportar esse estado;
- nÃ£o foram identificadas colunas canÃ´nicas `silo_id` ou `category_id` em
  `keywords_kgr`.

ConclusÃ£o: remover `listId` da extensÃ£o Ã© viÃ¡vel sem migration, desde que o
futuro endpoint aceite `lista_id = null` ou omita o campo, mantenha
`brand_id`, respeite autenticaÃ§Ã£o/RLS e nÃ£o tente usar uma lista artificial.
Isso nÃ£o autoriza alterar o schema nem garante que todos os contratos atuais
aceitem o novo payload; a compatibilidade precisa ser validada antes do
cÃ³digo.

### 2.5 Taxonomia, mÃ©tricas e allintitle

O Minerador jÃ¡ possui a taxonomia canÃ´nica:

`informational`, `commercial_investigation`, `transactional`,
`navigational`, `local`, `mixed` e `unknown`.

NÃ£o foi localizado um classificador canÃ´nico reutilizÃ¡vel de funil. A
taxonomia existente normaliza intenÃ§Ã£o, mas nÃ£o transforma automaticamente
uma sugestÃ£o do Autocomplete em intenÃ§Ã£o final ou etapa de funil.

O leitor de allintitle jÃ¡ distingue `success`, `zero_results`,
`unavailable`, `captcha`, `blocked` e `error`, valida a consulta e devolve
um nÃºmero somente quando a pÃ¡gina o confirma. O service worker jÃ¡ tem lote
sequencial, aba reutilizÃ¡vel, limite baixo, intervalo conservador,
cancelamento e pausa para bloqueio/CAPTCHA. Esses componentes sÃ£o
reutilizÃ¡veis.

Volume e resultados sÃ£o fontes independentes. A API de volume deve ser
chamada somente para as keywords selecionadas apÃ³s o filtro preliminar e,
preferencialmente, apÃ³s o filtro de resultados. KGR Ã© cÃ¡lculo local com
volume e `results_allintitle`; nÃ£o Ã© mediÃ§Ã£o da extensÃ£o.

## 3. DecisÃµes funcionais aprovadas

### 3.1 Sem lista, projeto, categoria ou silo

O popup futuro nÃ£o terÃ¡ seletor, campo oculto, preferÃªncia ou validaÃ§Ã£o de:

- `listId`;
- lista editorial;
- projeto;
- categoria;
- silo.

Uma keyword nova serÃ¡ criada no escopo da marca com estado inicial
equivalente a `bruto`, origem `extension`, sem artigo e sem agrupamento.
Na interface, `lista_id` ausente deve ser apresentado como `Sem
Silo/Categoria`, sem criar registro com esse nome.

Para keywords jÃ¡ existentes, o processo serÃ¡ idempotente por marca e texto
normalizado. Ele nÃ£o poderÃ¡ remover lista, silo existente, intenÃ§Ã£o humana,
volume, resultados, KGR, KeywordDNA, publicaÃ§Ã£o, URL ou canonical. PoderÃ¡
acrescentar evidÃªncia de origem e localidade somente em formato aditivo e
compatÃ­vel com o contrato aprovado.

### 3.2 IntenÃ§Ã£o desejada

O popup terÃ¡ seleÃ§Ã£o mÃºltipla usando a taxonomia canÃ´nica:

- Comercial investigativa;
- Transacional;
- Local;
- Informativa;
- Navegacional;
- Mista;
- Todas / nÃ£o definir.

O padrÃ£o serÃ¡ comercial investigativa, transacional e local. Informativa
ficarÃ¡ desmarcada. A escolha serÃ¡ uma preferÃªncia de extraÃ§Ã£o e um
`intentHint`, com origem equivalente a `extension_user_hint`; nunca serÃ¡
gravada como decisÃ£o final sem confirmaÃ§Ã£o no Minerador.

As sugestÃµes que nÃ£o puderem ser classificadas nÃ£o serÃ£o apagadas. SerÃ£o
mostradas na prÃ©via, desmarcadas por padrÃ£o e identificadas como pendentes.
O Autocomplete nÃ£o serÃ¡ apresentado como fonte de intenÃ§Ã£o estruturada.

### 3.3 Etapa do funil

O popup terÃ¡ BOFU, MOFU e Todas. O padrÃ£o serÃ¡ BOFU. BOFU deve favorecer
termos de contrataÃ§Ã£o, preÃ§o, orÃ§amento, serviÃ§o, agendamento, compra,
fornecedor, soluÃ§Ã£o, comparaÃ§Ã£o prÃ³xima da decisÃ£o e busca local acionÃ¡vel.

BOFU nÃ£o substitui a intenÃ§Ã£o. Os dois sinais permanecem separados. Como
nÃ£o hÃ¡ classificador reutilizÃ¡vel de funil no estado atual, a implementaÃ§Ã£o
deve manter `funnelHint` explÃ­cito, indicar a origem e nÃ£o declarar uma
aprovaÃ§Ã£o automÃ¡tica. Se nÃ£o houver evidÃªncia suficiente, a keyword continua
na prÃ©via como pendente.

### 3.4 Resultado allintitle e zero confirmado

O filtro terÃ¡ mÃ­nimo 0 e mÃ¡ximo aberto por padrÃ£o. Os limites serÃ£o
inclusivos e nÃ£o haverÃ¡ mÃ­nimo implÃ­cito de 1. Presets podem incluir
qualquer valor, 0â€“10, 0â€“50, 0â€“100 e personalizado.

`results_allintitle = 0` Ã© valor real quando o parser confirmar zero. NÃ£o
deve virar `null` nem 1. Com volume vÃ¡lido maior que zero, KGR pode ser
`0,000`. A interface deve distinguir zero confirmado de pendente,
indisponÃ­vel, falha e nÃ£o medido.

### 3.5 Volume

O filtro terÃ¡ mÃ­nimo 50 e mÃ¡ximo aberto por padrÃ£o. O valor Ã© apenas um
critÃ©rio de seleÃ§Ã£o: volume 10 continua 10, volume 40 continua 40 e volume
100 continua 100. Nenhum arredondamento, estimativa ou alteraÃ§Ã£o de valor
real serÃ¡ aplicado.

Keywords abaixo do mÃ­nimo permanecem na prÃ©via e podem ser incluÃ­das
manualmente. Elas nÃ£o consomem volume enquanto nÃ£o forem selecionadas.

## 4. LocalizaÃ§Ã£o

O paÃ­s serÃ¡ fixo em Brasil, apresentado como somente leitura, com
`countryCode: "BR"`.

Busca nacional (`Brasil Geral`) virÃ¡ marcada por padrÃ£o e serÃ¡ independente
da seleÃ§Ã£o de estados. Os 26 estados e o Distrito Federal virÃ£o selecionados
por padrÃ£o, com aÃ§Ãµes Selecionar todos e Limpar seleÃ§Ã£o. Desmarcar estados
nÃ£o poderÃ¡ apagar municÃ­pios previamente escolhidos sem confirmaÃ§Ã£o.

MunicÃ­pios serÃ£o pesquisÃ¡veis e selecionÃ¡veis por estado, com remoÃ§Ã£o,
visualizaÃ§Ã£o dos selecionados e entrada manual quando a fonte nÃ£o encontrar
o municÃ­pio. O popup nÃ£o carregarÃ¡ todos os municÃ­pios de uma vez.

O contrato proposto Ã©:

```ts
type LocationTarget = {
  countryCode: "BR";
  stateCode?: string;
  municipalityName?: string;
  ibgeCode?: string;
  placeId?: string;
};
```

`ibgeCode` serÃ¡ preferido quando houver fonte canÃ´nica. `placeId` fica
reservado para futura integraÃ§Ã£o; Google Maps nÃ£o serÃ¡ ativado nesta fase.

A fonte de municÃ­pios ainda precisa ser escolhida entre lista estÃ¡tica
versionada, endpoint interno somente leitura ou fonte oficial jÃ¡ disponÃ­vel.
Testes usarÃ£o fixtures locais e nÃ£o dependerÃ£o de API externa.

Cada contexto habilitado serÃ¡ contabilizado antes da extraÃ§Ã£o. A fÃ³rmula Ã©
dinÃ¢mica: 1 nacional + estados selecionados + municÃ­pios selecionados. O
exemplo 1 + 27 + 8 = 36 representa uma configuraÃ§Ã£o possÃ­vel, nÃ£o um lote
obrigatÃ³rio. OperaÃ§Ãµes grandes serÃ£o divididas em lotes confirmados pelo
usuÃ¡rio.

Keywords repetidas em Brasil, estado e municÃ­pio formarÃ£o uma Ãºnica keyword,
com `locations` acumuladas. O texto da keyword continua diferenciando, por
exemplo, `seo para clÃ­nicas` de `seo para clÃ­nicas em Campinas`.

## 5. Contrato proposto

O contrato futuro deve ser versionado e aditivo, usando nomes reais do
projeto apÃ³s a validaÃ§Ã£o do endpoint de importaÃ§Ã£o:

```ts
type ExtensionKeywordImport = {
  brandId: string;
  keyword: string;
  source: "extension";
  status: "bruto";
  listId?: null;
  siloId?: null;
  categoryId?: null;
  intentHint?: CanonicalIntentKey[];
  funnelHint?: "BOFU" | "MOFU";
  resultsAllintitle?: number;
  resultsStatus?: "success" | "zero_results" | "unavailable" | "captcha" | "blocked" | "error";
  resultsSource?: string;
  resultsMeasuredAt?: string;
  volume?: number;
  volumeStatus?: string;
  volumeSource?: string;
  volumeMeasuredAt?: string;
  locations: LocationTarget[];
  extractionBatchId: string;
};
```

Esse tipo Ã© proposta de contrato, nÃ£o schema implementado. `siloId` e
`categoryId` nÃ£o devem ser enviados para uma tabela que nÃ£o os possui. A
representaÃ§Ã£o persistente de pistas, evidÃªncias, localizaÃ§Ãµes e estados de
mediÃ§Ã£o deve reutilizar campos reais jÃ¡ suportados, provavelmente de forma
aditiva em `analise_semantica`, somente depois de validar consumidores e
limites.

O fluxo deve separar trÃªs mensagens:

1. **prÃ©via:** candidatos, deduplicaÃ§Ã£o, evidÃªncias e seleÃ§Ã£o;
2. **mediÃ§Ã£o:** resultados e volume por keyword, sem persistÃªncia destrutiva;
3. **confirmaÃ§Ã£o/importaÃ§Ã£o:** somente itens aprovados pelo usuÃ¡rio.

O endpoint futuro deve ser server-side e autenticado. O `brandId` recebido
do popup Ã© uma intenÃ§Ã£o de escopo, nÃ£o uma autorizaÃ§Ã£o: o servidor deve
comparÃ¡-lo com a lista de marcas autorizadas e com o `activeBrandId` da aba.
A extensÃ£o nÃ£o deve gravar diretamente no Supabase no novo fluxo.

## 6. Ordem operacional e limites

1. Resolver sessÃ£o, marcas autorizadas e marca ativa.
2. Exigir `brandId` real e confirmaÃ§Ã£o do handshake.
3. Validar semente, localidades, filtros e limite de contextos.
4. Extrair sugestÃµes sequencialmente.
5. Deduplicar por marca, keyword normalizada e evidÃªncias de localizaÃ§Ã£o.
6. Aplicar apenas filtro preliminar transparente; manter descartados visÃ­veis.
7. Mostrar prÃ©via e exigir seleÃ§Ã£o explÃ­cita.
8. Medir allintitle em lote padrÃ£o de atÃ© 10, uma consulta por vez.
9. Pausar para CAPTCHA/bloqueio e permitir retomada ou cancelamento.
10. Filtrar resultados com zero elegÃ­vel.
11. Medir volume apenas das sobreviventes selecionadas.
12. Aplicar o filtro de volume sem modificar mÃ©tricas.
13. Mostrar prÃ©via final, duplicidade e pendÃªncias.
14. Importar somente apÃ³s confirmaÃ§Ã£o.

NÃ£o haverÃ¡ paralelismo de localidades nem chamadas automÃ¡ticas para todas as
sugestÃµes. O limite atual do allintitle, o intervalo conservador, a pausa
humana e o cancelamento devem ser preservados. O limite de sugestÃµes e o
tempo mÃ¡ximo por execuÃ§Ã£o devem ser configurÃ¡veis e visÃ­veis antes do inÃ­cio;
qualquer lote acima do limite serÃ¡ dividido.

## 7. PrÃ©via e estados

A prÃ©via deve mostrar keyword, localidades, intenÃ§Ã£o e funil preliminares,
origem/confianÃ§a quando houver, resultado allintitle e estado da mediÃ§Ã£o,
faixa de resultados, volume e faixa de volume, existÃªncia anterior,
duplicidade e seleÃ§Ã£o para importaÃ§Ã£o.

Nenhum item serÃ¡ apresentado como importado antes da confirmaÃ§Ã£o real.
Falha parcial preserva os sucessos e deixa cada item com estado prÃ³prio.
AusÃªncia de nÃºmero nunca serÃ¡ convertida em zero.

Mensagens persistentes devem distinguir marca ausente, semente vazia,
localidade ausente, faixa invÃ¡lida, lote excessivo, pendÃªncias, CAPTCHA,
bloqueio, cota do provedor, municÃ­pio nÃ£o encontrado e falta de suporte do
endpoint a keyword sem lista.

## 8. Consumidores e compatibilidade

Devem ser auditados e testados antes da implementaÃ§Ã£o:

- `popup.html` e `popup.js`, incluindo preferÃªncias e lista salva;
- `background.js`, `executeMining`, deduplicaÃ§Ã£o e escrita direta;
- `app/api/mine/route.ts`, que hoje Ã© o caminho de Google Suggest/planilha;
- `/api/extensao/marcas` e `/api/extensao/marcas/{brandId}/listas`;
- `keywords_kgr`, `listas_kgr`, `brand_id`, `lista_id`, RLS e permissÃµes;
- carregamento, filtros, exportaÃ§Ã£o e apresentaÃ§Ã£o de keywords sem lista;
- importaÃ§Ã£o Site/Sitemap e evidÃªncias em `analise_semantica`;
- handshake, allintitle, volume e consumidores do Minerador;
- registros e preferÃªncias antigas da extensÃ£o.

O contrato de lista pode ser removido do popup porque `lista_id` Ã© anulÃ¡vel
no banco e `brand_id` Ã© o isolamento obrigatÃ³rio. Entretanto, o contrato
operacional atual ainda exige lista, a deduplicaÃ§Ã£o estÃ¡ escopada Ã  lista e
hÃ¡ uma escrita direta no Supabase. Portanto, a remoÃ§Ã£o sÃ³ Ã© segura quando
esses trÃªs pontos forem substituÃ­dos por importaÃ§Ã£o autenticada, deduplicaÃ§Ã£o
por marca e tratamento explÃ­cito de item sem lista.

Registros antigos com lista permanecem intactos. Registros antigos sem lista
continuam renderizÃ¡veis. NÃ£o se deve reclassificar ou mover keywords para
acomodar a extensÃ£o.

## 9. PreferÃªncias

Podem ser preservadas preferÃªncias de marca, intenÃ§Ã£o, funil, faixas,
busca nacional, estados e municÃ­pios. A chave futura deve ser vinculada ao
usuÃ¡rio autenticado e Ã  marca real, com versÃ£o do contrato.

Na restauraÃ§Ã£o, validar marca, valores, estados e municÃ­pios; ignorar apenas
a preferÃªncia incompatÃ­vel; nÃ£o limpar `chrome.storage`, `localStorage` ou
IndexedDB; nÃ£o usar preferÃªncias como fonte de verdade das keywords.

PreferÃªncias antigas contendo `listId` nÃ£o devem reintroduzir o seletor. Elas
podem ser ignoradas de forma aditiva e nÃ£o destrutiva, preservando o restante
da configuraÃ§Ã£o.

## 10. Riscos e mitigaÃ§Ã£o

| Risco | MitigaÃ§Ã£o proposta |
|---|---|
| Keyword sem lista nÃ£o aparecer | teste de leitura, tabela, exportaÃ§Ã£o e importaÃ§Ã£o com `lista_id` nulo |
| RLS depender de lista | confirmar policies por `brand_id`/permissÃ£o antes do endpoint |
| perda de escopo | resolver marca no servidor e comparar `brandId` com `activeBrandId` |
| duplicidade por localidade | identidade por marca + texto normalizado; localidades como evidÃªncia |
| `intentHint` virar decisÃ£o | origem explÃ­cita e revisÃ£o humana no Minerador |
| BOFU ser inferido incorretamente | tratar como preferÃªncia/hint e mostrar pendÃªncia |
| excesso de consultas | limite visÃ­vel, lote pequeno, sequÃªncia e confirmaÃ§Ã£o |
| CAPTCHA ou bloqueio | estados individuais, pausa, retomada e cancelamento |
| cota de volume | medir somente sobreviventes e preservar dados anteriores |
| zero confundido com ausÃªncia | estado explÃ­cito `zero_results` e testes de KGR zero |
| popup carregar municÃ­pios demais | busca condicionada por estado e fixtures |
| preferÃªncias incompatÃ­veis | versÃ£o, escopo por usuÃ¡rio/marca e validaÃ§Ã£o |
| versÃµes diferentes da extensÃ£o e app | handshake/protocolo versionado e rollout gradual |
| dois caminhos de importaÃ§Ã£o divergentes | manter legado durante transiÃ§Ã£o e definir endpoint canÃ´nico |
| escrita direta da extensÃ£o | mover importaÃ§Ã£o para fronteira server-side autenticada |

## 11. Arquivos previstos para uma futura implementaÃ§Ã£o

Os arquivos abaixo sÃ£o previsÃ£o, nÃ£o foram alterados nesta execuÃ§Ã£o:

- `minerador-extensao/popup.html`: remover lista e adicionar controles;
- `minerador-extensao/popup.js`: estado, preferÃªncias, localidades, prÃ©via e
  confirmaÃ§Ã£o;
- `minerador-extensao/background.js`: orquestraÃ§Ã£o sem lista e sem escrita
  direta no Supabase;
- `minerador-extensao/manifest.json`: somente se a fonte de municÃ­pios
  aprovada exigir host adicional;
- `app/api/extensao/...`: endpoint autenticado de prÃ©via/mediÃ§Ã£o/importaÃ§Ã£o,
  se essa for a fronteira aprovada;
- `lib/minerador/...`: contratos puros, deduplicaÃ§Ã£o, estados e adaptadores;
- `tests/...`: fixtures locais da extensÃ£o, contratos, filtros, idempotÃªncia,
  multi-marca e regressÃµes.

Nenhum novo arquivo de cÃ³digo foi criado por esta proposta.

## 12. Testes propostos

Os testes devem ser locais e baseados em fixtures, sem Google real, RapidAPI,
Supabase remoto ou Maps:

- remoÃ§Ã£o de lista: criaÃ§Ã£o sem `listId`, `brandId` preservado, exibiÃ§Ã£o Sem
  Silo/Categoria, nenhuma lista artificial e keyword existente intacta;
- intenÃ§Ã£o/funil: BOFU padrÃ£o, trÃªs intenÃ§Ãµes padrÃ£o, informativa desmarcada,
  seleÃ§Ã£o mÃºltipla, ausÃªncia de intenÃ§Ã£o e hint sem aprovaÃ§Ã£o;
- resultados: sucesso, zero confirmado, pendente, indisponÃ­vel, CAPTCHA,
  bloqueio, erro, preservaÃ§Ã£o de resultado anterior e KGR zero;
- volume: mÃ­nimo 50, preservaÃ§Ã£o do valor real, filtro sem mutaÃ§Ã£o, cota,
  falha parcial e nenhuma chamada para descartados;
- localidades: Brasil fixo, busca nacional, 27 UFs, selecionar/limpar todos,
  busca municipal, seleÃ§Ã£o mÃºltipla, municÃ­pio manual, IBGE, estimativa e
  deduplicaÃ§Ã£o;
- autenticaÃ§Ã£o: sessÃ£o ausente, marca Ãºnica, mÃºltiplas marcas, marca nÃ£o
  autorizada, `brandId` divergente e `activeBrandId` divergente;
- operacional: limite de lote, resposta fora de ordem, retry seletivo,
  cancelamento, reload da aplicaÃ§Ã£o e compatibilidade de protocolo;
- regressÃ£o: handshake, allintitle, volume, filtros, exportaÃ§Ã£o, keywords
  sem lista e confirmaÃ§Ã£o de que Arquiteto nÃ£o foi alterado.

## 13. Rollback

O rollout deve ser protegido por flag/protocolo versionado. Em caso de falha,
reexibir o fluxo legado somente como fallback temporÃ¡rio, sem tornar a lista
obrigatÃ³ria para os dados jÃ¡ importados. O rollback deve preservar listas,
keywords, marca, intenÃ§Ã£o, volume, resultados, KGR, evidÃªncias, publicaÃ§Ã£o,
URL, canonical e preferÃªncias.

NÃ£o limpar nenhum armazenamento local e nÃ£o mover ou apagar registros para
voltar ao fluxo anterior. Registros criados pelo novo fluxo devem continuar
vÃ¡lidos como keywords brutas sem lista, desde que o endpoint aprovado tenha
validado marca e RLS.

## 14. Bloqueios e decisÃµes antes do cÃ³digo

1. Escolher a fronteira canÃ´nica de importaÃ§Ã£o: substituir o caminho direto
   do service worker por endpoint server-side ou adaptar uma rota existente.
2. Confirmar o envelope persistente para `intentHint`, `funnelHint`,
   `locations`, evidÃªncia e estados de mediÃ§Ã£o sem criar schema incompatÃ­vel.
3. Escolher a fonte de municÃ­pios e a polÃ­tica de atualizaÃ§Ã£o dos cÃ³digos
   IBGE.
4. Definir limite mÃ¡ximo de contextos, tempo e quantidade de sugestÃµes por
   execuÃ§Ã£o.
5. Confirmar a identidade de deduplicaÃ§Ã£o por marca quando a keyword jÃ¡
   existir em uma ou mais listas.
6. Definir o perÃ­odo de compatibilidade entre popup, service worker e app.
7. Confirmar que o consumidor de exportaÃ§Ã£o e os filtros exibem keywords sem
   lista antes de remover o seletor.

Nenhum desses bloqueios deve ser resolvido com migration, alteraÃ§Ã£o remota ou
heurÃ­stica silenciosa.

## Registro da implementacao local - 2026-07-27

A autorizacao explicita para implementar esta SDD resolveu a lacuna operacional registrada acima. O contrato efetivamente implementado e:

- `POST /api/extensao/marcas/{brandId}/keywords/import`: requer Bearer valido, permissao do tenant Minerador e corpo com `extractionBatchId` e `items`. O servidor confirma o lote, deduplica por `brandId` + keyword normalizada e grava somente apos a confirmacao autenticada.
- Keyword nova: `keyword`, `brand_id`, `lista_id: null`, `status: bruto`, `location` e envelope aditivo `analise_semantica.extension_import` com origem, lote, localidades, hints e ultima medicao.
- Keyword existente: nenhum campo de identidade, lista, status editorial, principal ou KGR e substituido; somente `analise_semantica` recebe evidencia aditiva.
- `POST /api/extensao/marcas/{brandId}/volume`: requer o mesmo contexto autorizado, consulta o provider somente server-side e nao persiste volume.
- O service worker novo extrai sem Supabase, executa allintitle sequencialmente e transmite a previa ao popup. A funcao legada de escrita permanece isolada e nao e invocada pelo popup novo.
- Localidades usam Brasil, UFs estaticas no popup e municipio manual; nao foi adicionado host ou consulta externa de Maps/municipios.

Validacao local: 18 testes focados, sintaxe da extensao, ESLint direcionado, TypeScript, build Next.js 16 e `git diff --check` passaram. Homologacao manual autenticada ainda e pendente.

## 15. Arquivos alterados nesta SDD

Somente esta proposta e o registro correspondente no backlog. NÃ£o houve
alteraÃ§Ã£o de cÃ³digo, schema, migration, SQL, dados locais/remotos,
armazenamento, extensÃ£o carregada, Google, RapidAPI, Google Maps, commit,
push ou deploy.

O paragrafo acima e historico da proposta antes da autorizacao. Ele nao descreve o estado atual do codigo; a secao de registro de implementacao local e a fonte vigente para esta SDD.
