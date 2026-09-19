# Corte 4.1 — os quatro anchors de mídia, homologados pela interface real

**Data:** 2026-09-18
**Não executado:** migration, DDL, purge, deploy, commit, push. Nenhum ativo apagado.
**Executado:** o fluxo completo pela UI, nos quatro anchors, contra o banco remoto.

Nove ativos reais, cinco posições ocupadas, quatro substituições. Todos os
invariantes conferidos no remoto.

---

## 1. Capa — `article_cover`

Posição `Capa do artigo`, que ancora no próprio `documentId`.

```text
briefing preenchido no painel
→ PNG 80×80 enviado      → "Imagem ancorada nesta posição."   hash ffae02b2a5d6…
→ Ver imagem             → preview assinado carregou, 80px
→ PNG 96×96 enviado      → "Imagem substituída. A anterior entrou na janela de 48 horas."
                            hash 2a13438f5998… · 1 versão anterior em janela
```

No banco: `anchor_kind = article_cover`, `anchor_ref` = o id do documento,
`role = cover`. Uma atual, predecessor com o **mesmo** anchor histórico,
`replaced_by_asset_id` apontando para a sucessora e
`purge_after = superseded_at + 48h`.

---

## 2. Roteiro — `script_scene`

O rascunho foi criado **pelo fluxo normal do Redator**, sem atalho SQL: aba
`Roteiro e storyboard` → `Adicionar cena` duas vezes → narração preenchida →
`Salvar rascunho` → *"Rascunho salvo e confirmado no servidor."*

**`Canal` ficou vazio** e nenhum briefing legado foi criado. O campo é opcional
no contrato (`z.string().max(300)`), e preenchê-lo só para o teste passar seria
adulterar a condição que se quer provar.

Antes de existir cena, o painel **não aparece** — `targets.length === 0` devolve
`null`. Depois do save, as duas posições surgiram com rótulo humano:

```text
Cena 1 · Cena 1 de homologação do anchor script_scene
Cena 2 · Cena 2 de homologação do anchor script_scene
```

Na Cena 1: PNG 72×72 → ancorado; preview carregou em 72px; PNG 56×56 →
substituído, uma versão anterior em janela.

**Isolamento:** a Cena 2 seguiu vazia, oferecendo `[Registrar briefing]` e
`[Anexar imagem]` — nenhum vestígio da operação na Cena 1.

---

## 3. Carrossel — `carousel_slide`

Mesmo caminho: `Adicionar slide` duas vezes, títulos preenchidos, salvo pelo
fluxo normal.

```text
Slide 1 → imagem A (64×64, hash a76415c32117…)
        → imagem B (88×88, hash 5fbdb0c99d6f…)   A entrou em janela
Slide 2 → imagem C (40×40, hash a18ff4caceaf…)   sem histórico
```

**Substituir o Slide 1 não alterou o Slide 2.** Conferido nos dois sentidos:
depois de ancorar C no Slide 2, o Slide 1 continuava com B e uma versão
anterior; o Slide 2 continuava com C e sem histórico.

Os dois slides têm `anchor_kind = carousel_slide` e `anchor_ref` diferentes —
`31a5541c…` e `bafdabf4…` —, e o índice único parcial trata cada par como uma
posição própria.

---

## 4. Persistência

### 4.1 F5

Depois de recarregar a página, nos três ambientes:

| Posição | Estado após F5 | Preview |
| --- | --- | --- |
| Capa do artigo | hash `2a13438f5998…` + 1 anterior | carregou, 96px |
| Cena 1 | hash `80c32424ed88…` + 1 anterior | carregou, 56px |
| Cena 2 | vazia | — |
| Slide 1 | hash `5fbdb0c99d6f…` + 1 anterior | — |
| Slide 2 | hash `a18ff4caceaf…`, sem histórico | — |

O preview volta a carregar porque a URL assinada é **pedida de novo** a cada
visualização — ela dura 60s e não é guardada. Nada do estado de mídia vem de
`localStorage`.

### 4.2 Segunda aba, estado de cliente novo

Aba nova, React montado do zero, nenhuma memória em processo: a capa apareceu
com o mesmo hash, o mesmo histórico e o preview carregou. O estado é remoto.

### 4.3 O que NÃO foi feito

Uma segunda **sessão autenticada** — outro usuário ou outro navegador — exigiria
fazer login, e eu não insiro credenciais. A aba nova prova ausência de estado em
memória, e o readback remoto (§5) prova que a autoridade é o banco; nenhum dos
dois substitui a checagem com outra conta.

```text
SECOND_SESSION_VALIDATION = NOT_RUN
```

---

## 5. Readback remoto

```text
assets = 9 · ancorados_atuais = 5 · em_janela = 4 · briefings_sem_arquivo = 0

CURRENT_COM_PURGE_AFTER  = 0
JANELA_INCOERENTE        = 0
SUPERSEDED_SEM_SUCESSOR  = 0
ELEGIVEIS_A_PURGE_AGORA  = 0
```

**Um atual por âncora — PASS nas cinco:**

| `anchor_kind` | `anchor_ref` | atuais |
| --- | --- | --- |
| `article_cover` | o `documentId` | 1 |
| `article_block` | `4caff6d5…` | 1 |
| `script_scene` | `036e2252…` | 1 |
| `carousel_slide` | `31a5541c…` (Slide 1) | 1 |
| `carousel_slide` | `bafdabf4…` (Slide 2) | 1 |

**Quatro pares de substituição, todos íntegros:**

```text
MESMO_ANCHOR = YES · PREDECESSOR_SUPERSEDED = YES
REPLACED_BY_APONTA_SUCESSOR = YES · PURGE_AFTER_48H = YES
SUCESSOR_NAO_SUPERSEDED = YES
```

---

## 6. Os ativos criados — para limpeza futura controlada

**Purga não existe.** Nada foi apagado, e nada expira sozinho: `purge_after`
apenas marca quando a janela vence; sem rota nem cron, as linhas permanecem.

Marca `09762023-d0d4-4c24-b34e-d0fdfd43f891`, documento
`redator:…:e42cd892-c5c8-408d-8f12-8128f5310828`.

| Anchor | Papel | `id` | Janela |
| --- | --- | --- | --- |
| `article_block` / `4caff6d5…` | predecessor | `c4e69d77-8151-4742-8ec5-662ac6b78b54` | 21/09 01:40 |
| | **atual** | `37a20267-e5f2-4685-8c45-4815bb4e7c3b` | — |
| `article_cover` / documento | predecessor | `216a832b-07db-49f3-b8a7-80af8188dfd7` | 21/09 01:48 |
| | **atual** | `a559a9b5-36ab-42bb-9c62-e48757c8da6b` | — |
| `script_scene` / `036e2252…` | predecessor | `74455e67-2c0f-4b71-8c4a-f68acba72677` | 21/09 01:49 |
| | **atual** | `7d9094ed-2fe0-48c3-a41e-ccd6a7a9ad43` | — |
| `carousel_slide` / `31a5541c…` | predecessor | `6ba107e1-de51-4452-9b1f-3ee11707a5de` | 21/09 01:50 |
| | **atual** | `85de804b-2a60-473c-872c-7ab9aeadf13d` | — |
| `carousel_slide` / `bafdabf4…` | **atual** | `ed42f35e-7404-4e6e-bef5-937075e5339b` | — |

Cada linha tem um objeto correspondente no bucket privado `writer-media`, em
`{marca}/42d4ffc2ee8411388e2829cd6763992e/{assetId}.png`. Apagar a linha **não**
remove o objeto — é por isso que a purga é CLAIM + remoção no Storage + CONFIRM,
nessa ordem.

Também foram criados, pelo fluxo normal: **um entregável de roteiro** com duas
cenas e **um de carrossel** com dois slides, no mesmo documento. São rascunhos de
homologação, e ficam.

Para substituir qualquer imagem, basta usar `Substituir imagem` na posição — o
caminho é o mesmo e não precisa de limpeza prévia.

---

## 7. `article_break`

Continua fora. Nenhuma posição de respiro foi oferecida em nenhum dos três
ambientes, e nada foi inventado como identidade.

```text
ARTICLE_BREAK_SUPPORTED = NO
```

---

## 8. Baseline

| Suíte | Baseline | Agora |
| --- | --- | --- |
| `npx tsc --noEmit` | 0 | **0** |
| `test:redator` | 120/120 | **120/120** |
| `test:redator:mcp` | 2/2 | **2/2** |
| `test:editorial` | 60/64 | **60/64 — as mesmas 4** |
| `test:radar` | 2236/2236 | **2236/2236** |
| `operational-flow` | 41/51 | **41/51 — as mesmas 10** |
| `planejador-fora-do-pipeline` | 16/16 | **16/16** |

Nenhum arquivo de código foi alterado nesta rodada: ela foi de execução e
verificação, não de construção.

---

```text
ARTICLE_BLOCK_UI_E2E = PASS
ARTICLE_COVER_UI_E2E = PASS
SCRIPT_SCENE_UI_E2E = PASS
CAROUSEL_SLIDE_UI_E2E = PASS
F5_REMOTE_PERSISTENCE = PASS
SECOND_SESSION_VALIDATION = NOT_RUN — exigiria login, que eu não faço
ARTICLE_BREAK_SUPPORTED = NO
PURGE_IMPLEMENTED = NO
REGRESSIONS = NONE
```
