# REDATOR_DOSSIER_SURFACE_1 — verificação ao vivo

**2026-09-19 · 09:25 UTC** · **nenhum código escrito nesta rodada**

---

## 1. A superfície já existe na árvore de trabalho

Não implementei nada: `REDATOR_DOSSIER_SURFACE_1` já estava feito quando a
rodada chegou.

| Arquivo | Estado | Escrito em (UTC) |
| --- | --- | --- |
| `lib/redator/radar-foundations.ts` | commitado | tocado 09:17 |
| `modules/redator/writer-radar-foundations-panel.tsx` | **não commitado** (`??`) | 09:17 |
| `modules/redator/writer-derived-environment.tsx` | modificado | 09:17 |
| `components/editorial/professional-writer.tsx` | modificado | 09:17 |
| `tests/redator-radar-foundations-1.test.mts` | commitado | 09:12 |

**É por isto que você não viu nada.** A evidência visual do enunciado é da sua
sessão das **08:20–08:23**; o código entrou na árvore às **09:12–09:17**. Não há
sobreposição. E no momento em que fui verificar, **nada estava escutando na porta
3000** — nenhum processo `node` no ar.

Subi o dev server (`next dev`, Turbopack, pronto em 608 ms) e verifiquei no
navegador, com sessão real.

---

## 2. O que a tela mostra agora

### 2.1 Artigo — documento *"skin care noturno"* (perfil YOUTUBE)

```text
data-radar-foundations = "presente"
data-radar-foundations-profile = "YOUTUBE"
seções: recommendation · keyword · research · youtube · blueprint
        · evidence · limitations · writer-may-not
data-radar-research-layer = youtube
data-radar-editorial-output = ARTICLE
```

### 2.2 Roteiro e Carrossel — documento *"skincare para pele oleosa"* (perfil GOOGLE)

```text
data-radar-foundations = "presente"   (nas duas abas, sem cena aberta)
data-storyboard-lateral = presente
seções: recommendation · keyword · research · evidence · coverage
        · limitations · writer-may-not
data-metadados-opcionais → open = false
```

Conteúdo real lido da tela:

* **Recomendação:** "Artigo — *recomendação do Radar — não limita o formato*";
* **Pesquisa:** "Google · primária · 4 consulta(s) · 10 resultado(s) observado(s)";
* **SERP e evidências:** "Fonte: WEB_SERP · Páginas comparáveis: 10";
* **Precisa responder:** "O que é a pele oleosa?", "Skincare para pele oleosa:
  como fazer para controlar brilho e acne?", …;
* **O Redator não pode:** "trocar a keyword principal", "reconfigurar o Silo",
  "remover uma cobertura obrigatória", "alterar a intenção declarada do artigo", …

### 2.3 Uma ressalva honesta sobre os campos de YouTube

O enunciado pede, para o Roteiro, *pesquisa YouTube · consultas · vídeos
observados · long-form × shorts · blueprint multimodal*. Esses blocos **existem e
renderizam** — estão visíveis no Artigo do documento de perfil YOUTUBE (§2.1).

No documento da homologação (*"skincare para pele oleosa"*) eles **não aparecem
porque o Radar nunca observou YouTube ali**: o bundle tem camada `google` e
nenhum `competitiveBlueprint` de perfil YOUTUBE. A projeção devolve `youtube:
null` e o painel omite a seção, em vez de mostrar "0 long-form × 0 shorts", que
seria uma afirmação falsa sobre a investigação.

Isto é comportamento correto, não lacuna. Mas significa que **ver esses campos
nesse documento exige uma investigação YouTube no Radar**, não uma mudança no
Redator.

---

## 3. Critérios

```text
DOSSIER_VISIBLE_IN_SCRIPT = YES        (aba Roteiro, painel direito, sem cena aberta)
DOSSIER_VISIBLE_IN_CAROUSEL = YES      (aba Carrossel, mesma projeção)
DOSSIER_VISIBLE_IN_ARTICLE = YES       (painel direito do artigo)
EDITORIAL_OUTPUT_BLOCKS_DERIVED_FORMATS = NO
RAW_DOSSIER_DUPLICATED_IN_DELIVERABLE = NO
PROVIDER_CALL_REQUIRED = NO
MIGRATION_REQUIRED = NO

SHARED_PROJECTION = lib/redator/radar-foundations.ts — uma leitura, três ambientes
OPTIONAL_METADATA_COLLAPSED = YES      (useState(false), <details open={...}>)
SCENE_SELECTED_SWAPS_RIGHT_PANEL = YES (cenaSelecionada ? mídia : fundamentos)
CODE_WRITTEN_THIS_ROUND = NO
```

Como cada um foi provado:

| Marcador | Prova |
| --- | --- |
| `EDITORIAL_OUTPUT_BLOCKS_DERIVED_FORMATS = NO` | a recomendação é `ARTICLE` e as abas **Roteiro** e **Carrossel** abriram e operaram normalmente; `editorialOutput` só aparece em `radar-foundations.ts` como recomendação, em nenhuma condição de fluxo |
| `RAW_DOSSIER_DUPLICATED_IN_DELIVERABLE = NO` | nenhuma ocorrência de `dossier`/`importedContext` em `deliverable-lifecycle.ts`, `writer-deliverables.ts` ou no ambiente derivado |
| `PROVIDER_CALL_REQUIRED = NO` | o painel não tem `fetch`, `useEffect` nem chamada de IA — só `useMemo` sobre o documento |

Bateria: `tsc` **0** · `redator-radar-foundations-1` **11/11** ·
`test:redator` **277/277**.

---

## 4. O que isto explica das duas rodadas anteriores

A tela do Roteiro mostra hoje, no documento certo:

```text
Finalizado · Roteiro e storyboard · derivado de "skincare para pele oleosa" · 2 cenas · v5
```

**2 cenas, v5** — o `lock_version` 5 do banco. O Carrossel idem, com 2 slides e
os textos "TESTE DO CARROSSEL CENA 1 TESTE2" / "CENA 2 TESTE2".

O enunciado descreve "**0 cenas / novo rascunho**". Isso não é o entregável
finalizado: é o Roteiro do **outro** documento — *"skin care noturno"*, que nunca
teve entregável. Ali o ambiente nasce vazio, como deve.

E é a explicação do Corte 6A.11: o clique em **Reabrir para edição** não produziu
nenhum `UPDATE` porque, naquele documento, **não havia entregável para reabrir**.
O defeito não estava na reabertura — estava em qual documento a tela tinha
aberto.

---

## 5. Duas coisas que eu fiz e que precisam ficar registradas

**Subi o dev server.** Ele não estava no ar. `preview_start` com a configuração
`minerador-key-start` do `.claude/launch.json`.

**Meus carregamentos gravaram `last_opened_at`.** É o que abrir a tela faz. Três
`POST /api/editorial/documents` por carga. Estado atual: *"skincare para pele
oleosa"* é o mais recente (09:22:30) e **é o documento ativo agora** — que é o
que a sua homologação precisa.

### 5.1 Um defeito aberto que a verificação revelou

No **primeiro** carregamento, a tela gravou os dois documentos:

```text
09:21:20.611   skincare para pele oleosa   ← resolução correta, por lastOpenedAt
09:21:23.284   skin care noturno           ← 2,7 s depois, contaminação
```

Não é laço — dois sinais 12 s depois vieram idênticos, estabilizou. Mas
significa que o Corte 6A.10 **não fechou o caso inteiro**: existe uma janela, na
montagem, em que a resolução cai no `fallback` e `shouldPersistLastOpened` a
deixa gravar. Eu argumentei no 6A.10 que "o fallback só é alcançado quando não há
o que preservar" — a leitura ao vivo mostra que isso não vale durante a carga
assíncrona.

```text
ACTIVE_DOCUMENT_FALLBACK_STILL_PERSISTS = YES
CORTE_6A10_FULLY_CLOSED = NO
```

Não corrigi: está fora do escopo desta rodada. Fica registrado para um corte
próprio — a correção provável é não gravar quando `origin === "fallback"` e
`userStates` ainda não chegou, o que exige distinguir "não há estado" de "o
estado ainda não carregou".
