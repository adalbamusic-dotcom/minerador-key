# Corte 4 — a mídia virou operável, e foi exercitada de verdade

**Data:** 2026-09-18
**Não executado:** migration, DDL, deploy, commit, push, purge.
**Executado:** o fluxo real de mídia pela interface, contra o banco remoto.

A rodada anterior fechou com `writer_media_assets` vazia: a UI não tinha como
executar o fluxo. Esta fecha com **duas linhas reais criadas pelo navegador**,
uma corrente e uma em janela de 48h, com todos os invariantes conferidos no
remoto.

---

## 1. O defeito, e o que o fechou

As duas metades do fluxo estavam em telas diferentes, e nenhuma era completa:

| Antes | Painel de âncora | Formulário | Upload |
| --- | --- | --- | --- |
| Artigo | sim | **não** | **não** |
| Roteiro / Carrossel | **não** | sim (seção global) | sim |

No Artigo o painel mandava *"registre o prompt e anexe a imagem"* apontando para
controles que não existiam ali. No ambiente derivado havia uma seção global
"Prompts e imagens" — um formulário com seletor de "uso", longe da cena a que
cada prompt pertencia, e nenhum briefing ocupava posição alguma.

**Agora é um painel só, nos três ambientes**, e a posição é o assunto.

---

## 2. O painel operacional

`modules/redator/writer-media-anchor-panel.tsx` — painel lateral direito,
contextual, sem seção global e sem faixa horizontal nova.

| Capacidade pedida | Onde |
| --- | --- |
| selecionar o anchor | seletor agrupado dentro do painel |
| carregar o estado do anchor | `anchorStateFor`, recarregado a cada troca |
| mostrar se existe imagem atual | `data-media-estado-atual` / `data-media-estado-vazio` |
| registrar briefing/prompt | `[Registrar briefing]` |
| anexar/uploadar arquivo | `<input type="file">` PNG/JPEG/WebP |
| progresso/estado do upload | `data-media-progresso`, cinco etapas nomeadas |
| confirmar hash/readback | o fluxo aborta se o servidor não devolver `fileHash` |
| renderizar preview | `data-media-preview`, URL assinada |
| editar alt text | `[Editar alt text]` com readback |
| substituir a imagem atual | `[Substituir imagem]` |
| erro de conflito/readback | frases distintas por `refusal` |
| predecessor só no lifecycle | `anchorStateFor` separa `current` de `superseded` |

O seletor vive **dentro** do painel. Assim o mesmo componente serve artigo,
roteiro e carrossel sem cada tela reimplementar a seleção — e sem que uma delas
esqueça de filtrar `superseded_at` e passe a mostrar o predecessor como atual.

### 2.1 Os botões dependem só de haver imagem

```text
posição vazia    [Registrar briefing]  [Anexar imagem]
posição ocupada  [Substituir imagem]   [Editar alt text]  [Editar briefing]
```

Com imagem no lugar, `Anexar` não aparece: sugeriria acumular duas na mesma
posição, que é exatamente o que a M3 impede.

### 2.2 A sequência é a do servidor, num clique

Pedir que a pessoa orquestrasse briefing, upload e ancoragem em três cliques
transferiria para a mão de quem escreve a ordem que protege a imagem no ar.

```text
criar briefing sucessor SEM âncora
→ upload  (magic bytes, sha256, readback do Storage)
→ conferir fileHash — sem ele, nada é trocado
→ posição vazia  → anchor
   posição ocupada → replace
→ readback
→ recarregar o painel
```

Nenhum arquivo antigo é sobrescrito: `upsert: false` no Storage, e trocar imagem
sempre cria ativo novo.

---

## 3. Preview com bucket privado

`writer-media` continua privado. Abrir o bucket exporia o acervo editorial de
todas as marcas a quem descobrisse um caminho — e os caminhos são previsíveis,
porque contêm o id da marca.

`signWriterMediaPreview` emite **URL assinada de 60 segundos**, depois de o
servidor confirmar sessão, permissão na marca e que o ativo pertence a ela. O
caminho vem do **banco**, nunca do cliente: um caminho vindo da requisição
deixaria assinar qualquer objeto do bucket, inclusive de outra marca.

Nenhum token bruto vai ao navegador — a service key assina qualquer coisa neste
projeto e não sai do servidor. A resposta vai com `Cache-Control: no-store,
private`, porque uma URL de 60s não pode ficar em cache de proxy.

Conferido no navegador: a imagem carregou (`naturalWidth` 64), a URL é assinada,
e não há chave nela.

---

## 4. Rótulos humanos

`lib/redator/media-anchor-targets.ts` converte contrato em nome de ofício:

```text
Capa do artigo
Comparativo · Comparação
H1 · aqui tem que ir o h1
H2 · estrutura de site aqui na lista de key
Parágrafo · aqui o parágrafo
Imagem planejada · Definir objetivo
Cena 1 · …          Slide 1 · …
```

`image_brief`, `paragraph` e `heading` **não aparecem** como rótulo. O id técnico
continua sendo a referência, dentro do `value` da opção.

Todo bloco entra como posição possível. Decidir quais "merecem" imagem seria eu
inventando regra editorial — quem escreve sabe onde a imagem faz sentido.

---

## 5. Os três ambientes

| Ambiente | Posições | Origem |
| --- | --- | --- |
| Artigo | capa + um por bloco | `articleAnchorTargets` |
| Roteiro | uma por cena | `scriptAnchorTargets` — `VideoScene.id` |
| Carrossel | uma por slide | `carouselAnchorTargets` — `CarouselSlide.id` |

Cenas e slides saem na ordem **declarada** (`order`), não na posição do array.
Sem `id` estável não vira posição — não se inventa referência.

`article_break` não existe em lugar nenhum: ausência verificada em quatro
arquivos pelo teste 14.

---

## 6. A verificação de verdade

Não bastava provar que os controles existem — foi isso que eu disse na rodada
passada, e a tabela estava vazia. Desta vez o fluxo foi executado **pelo
navegador, contra o banco remoto**.

### 6.1 O que foi feito

Numa posição `article_block` do rascunho aberto — o bloco `Imagem planejada`,
que é literalmente o lugar de uma imagem:

1. briefing preenchido e submetido pelo painel;
2. PNG 64×64 gerado no navegador e enviado pelo `<input type="file">`;
3. servidor conferiu magic bytes, hash e releitura do Storage;
4. primeira ancoragem → **"Imagem ancorada nesta posição."**;
5. `Ver imagem` → preview assinado carregou;
6. segundo PNG 48×48 enviado → **"Imagem substituída. A anterior entrou na janela de 48 horas."**

### 6.2 O readback remoto

```text
assets = 2 · ancorados_atuais = 1 · em_janela = 1 · briefings_sem_arquivo = 0

ATUAL        37a20267…  hash d50256420311  anchor article_block/4caff6d5…
                        superseded_at null · purge_after null
PREDECESSOR  c4e69d77…  hash 7d1984cd9e36  anchor article_block/4caff6d5…  (o MESMO)
                        superseded_at 01:40:46 · purge_after 2026-09-21T01:40:46
                        replaced_by_asset_id → 37a20267…
```

```text
MESMO_ANCHOR = YES
PREDECESSOR_SUPERSEDED = YES
REPLACED_BY_APONTA_SUCESSOR = YES
PURGE_AFTER_48H = YES              janela restante: 1 day 23:59:38
SUCESSOR_NAO_SUPERSEDED = YES
EXACTLY_ONE_CURRENT_PER_ANCHOR = PASS
CURRENT_COM_PURGE_AFTER = 0 · JANELA_INCOERENTE = 0 · SUPERSEDED_SEM_SUCESSOR = 0
ELEGIVEIS_A_PURGE_AGORA = 0
```

### 6.3 Duas linhas reais ficaram no seu rascunho

Os dois ativos acima **existem** e estão no seu documento — a imagem atual é um
quadrado laranja de 48×48, e o predecessor um azul de 64×64 em janela até
21/09 às 01:40. Não os apaguei: remover exigiria DELETE, e purga está fora desta
rodada.

Eles são úteis como ponto de partida da sua homologação: a posição já mostra
preview, substituição e histórico. Para trocá-los, basta usar `Substituir
imagem` na mesma posição — o fluxo é o mesmo.

---

## 7. Testes

`tests/redator-media-ui-operacional.test.mts` — **16/16**, em `test:redator`.

| Cobertura pedida | Teste |
| --- | --- |
| anchor vazio mostra "Anexar imagem" | 01 |
| anchor ocupado oferece "Substituir imagem" | 02 |
| upload confirmado cria imagem atual | 03 |
| sucessor nasce sem anchor | 04 |
| predecessor só no lifecycle | 05 |
| exatamente um asset atual por anchor | 06 |
| artigo / cena / slide isolados | 07 |
| `article_break` não aparece | 14 |
| rótulos humanos | 08, 09 |
| primeira ancoragem funciona | 11 + §6 |
| upload/readback falho não troca imagem | 11 |
| substituição atualiza preview | 11 + §6 |
| preview usa acesso privado seguro | 12 |
| nenhuma nova barra horizontal | 13 |
| alt text persiste | 15 |
| conflito/readback com frase | 16 |
| cross-brand recusado | `redator-media-anchor` 09 |

### 7.1 A bateria

| Suíte | Baseline | Agora | Delta |
| --- | --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** | 0 |
| `test:redator` | 104/104 | **120/120** | +16 |
| `test:redator:mcp` | 2/2 | **2/2** | 0 |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** | 0 |
| `test:radar` | 2236/2236 | **2236/2236** | 0 |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** | 0 |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** | 0 |
| `eslint` nos arquivos tocados | 0 | **0** | 0 |

Um teste precisou ser atualizado: `redator-media-anchor` 18 exigia a guarda
`!target` e `data-redator-media-target` no Redator. O seletor mudou de arquivo
neste corte — descrição de superfície movida, não defeito.

---

## 8. Arquivos

**Criados:**
```
lib/redator/media-anchor-targets.ts            posições, rótulos e estado por âncora
tests/redator-media-ui-operacional.test.mts    16 testes
```

**Alterados:**
```
modules/redator/writer-media-anchor-panel.tsx  reescrito: superfície operacional
modules/redator/writer-derived-environment.tsx seção global → painel por cena/slide
components/editorial/professional-writer.tsx   painel recebe as posições do artigo
lib/server/writer-media-lifecycle.ts           preview assinado + edição de briefing
app/api/redator/media-anchor/route.ts          ações preview e update_brief
```

**Não tocados:** banco, migrations, Radar, Arquiteto, Minerador, Publicações,
DNA, SERP. Nenhuma purga.

---

```text
MEDIA_PANEL_OPERATIONAL = YES
COVER_UPLOAD_AVAILABLE = YES
ARTICLE_BLOCK_UPLOAD_AVAILABLE = YES
SCRIPT_SCENE_UPLOAD_AVAILABLE = YES
CAROUSEL_SLIDE_UPLOAD_AVAILABLE = YES
PRIVATE_MEDIA_PREVIEW = YES — URL assinada de 60s, caminho vindo do banco
MEDIA_REPLACEMENT_UI = YES
ARTICLE_BREAK_SUPPORTED = NO
REAL_UPLOAD_FROM_UI = YES — verificado pelo navegador, 2 linhas reais
REAL_REPLACEMENT_FROM_UI = YES
IMAGE_RENDERED_AT_ANCHOR = YES
PURGE_IMPLEMENTED = NO
REGRESSIONS = NONE
```

### O que continua sendo seu

Exercitei `article_block` ponta a ponta. **Capa, cena e slide foram provados por
teste e pela mesma fiação, não por clique** — a capa usa o mesmo caminho com
outro `anchor_kind`, e cena/slide dependem de existir roteiro ou carrossel
salvo, que este documento ainda não tem. Se quiser, na próxima rodada eu crio um
entregável de rascunho e exercito os outros três também.
