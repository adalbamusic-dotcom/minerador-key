# RADAR / ARQUITETO R10.1C — Rematerialização e smoke real

Data: 2026-09-07 · Lote: R10.1C

```
PROVIDER_CALLS = 0
MIGRATIONS = 0
REMOTE_WRITES = 0
```

---

## 0 · O que não foi executado, e por quê

**A rematerialização dos cinco artigos e o smoke real não foram executados.**
Este lote inteiro depende de escrever e ler o banco do Minerador Key, que **não
é alcançável desta sessão**.

Verificado de novo agora, não presumido: o conector Supabase lista
`betinna` (`grdiuggfklaoqhvnctto`) e `somatec` (`iwtltrzpzidehumypepy`) —
nenhum dos dois tem `editorial_workflow_items` nem `minerador_keywords`
(`to_regclass` devolveu `null` para as duas tabelas nos dois projetos, no R10).

Então:

```
ARTICLES_REMATERIALIZED = 0
ARTICLES_SUCCESS = 0
ARTICLES_FAILED = 0 (nenhuma tentativa; o pré-requisito não existe aqui)
```

O que este lote entrega no lugar: **o caminho canônico localizado e provado no
código**, o comportamento exato a esperar, e a verificação para conferir o
resultado depois que você executar.

---

## 1 · O caminho canônico — provado no código

A rematerialização **já existe** e não precisa de código novo. É o
*concluir a formação novamente* do Arquiteto
(`modules/arquiteto/arquiteto-workspace.tsx:8769`):

```
deterministicArticleDnaPayload(grupo, brandId)   ← reconstrói TODAS as referências
  └─ articleKeywordReference(...)                ← aqui entra semanticQualificationRef (R10.1B)
confirmedArticlePayload(base, principalKeywordId, actorId)
materializeArticleSiloId({ article, siloVersions })
createVersionEnvelope({
  versionNumber: (vigente?.versionNumber || 0) + 1,
  previousVersionId: vigente?.versionId || null,
  changeReason: "Formação concluída novamente: composição revisada e ArticleDNA aprovado.",
})
persistArquitetoArtifact({ artifactType: "article_dna", action: "edit", status: "approved" })
```

Nenhum `UPDATE` direto, nenhuma edição de JSON: sucessora com
`previousVersionId`, novo `contentHash` e `changeReason` explícito. **Fixado em
teste** (`REMATERIALIZAÇÃO · a reformação real reconstrói as referências e
sucede a versão vigente`).

### O guarda que muda a expectativa do smoke

```ts
if (persistido.persistence === "UNCHANGED") continue;
```

**Conteúdo idêntico não cria versão.** Consequência prática, e ela não é falha:

- keyword **com** qualificação semântica na origem → o payload muda → **nasce a
  sucessora**;
- keyword **sem** qualificação na origem → o payload é idêntico → **UNCHANGED**,
  nenhuma versão nova, e o fundamento continua declarado como ausente.

Ou seja: a rematerialização só produz versão onde há fundamento novo a
incorporar. É exatamente a regra "se a origem não possuir, manter estado
explícito".

---

## 2 · O que já está provado, sem o banco

`tests/radar-r10-1b-fundacao-keywords.test.mts` — 11 testes, todos passando:

| | Garantia |
|---|---|
| B, D | todo papel recebe `keywordDnaSnapshot`; envelope idêntico para os três |
| C | a qualificação é incorporada na formação, para principal, secundária e reforço |
| P | sem origem completa nada é inventado; evidência não conclusiva viaja vazia e diz que é vazia |
| E | formar a referência não muta a keyword de entrada |
| L | o Radar resolve o fundamento novo sem código especial |
| M | a UI mostra intenção consolidada, funil, estado, versão, hash e data |
| N | o motor consome a intenção consolidada e muda a leitura da SERP |
| E, I | campo aditivo: versão antiga continua válida e a ausência é declarada |
| J, K | a incorporação não toca principal, papéis nem Silo |
| **rematerialização** | `confirmedArticlePayload` preserva a qualificação de todas as keywords, com composição idêntica |
| **rematerialização** | o caminho real reconstrói as referências, sucede a versão vigente e não muta in-place |

---

## 3 · Como executar, e o que conferir

### Passo 1 — pré-check (SELECT, sem escrita)

```sql
SELECT v.entity_id AS article_id, v.version_id, v.version_number, v.content_hash,
       v.payload->>'principalKeywordId'      AS principal,
       jsonb_array_length(v.payload->'keywordReferences') AS keywords,
       v.payload->>'siloId'                  AS silo,
       v.payload->>'hierarchy'               AS hierarquia,
       (SELECT count(*) FROM jsonb_array_elements(v.payload->'keywordReferences') r
         WHERE r ? 'keywordDnaSnapshot')      AS com_snapshot,
       (SELECT count(*) FROM jsonb_array_elements(v.payload->'keywordReferences') r
         WHERE r ? 'semanticQualificationRef') AS com_qualificacao
FROM public.editorial_artifact_versions v
WHERE v.marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891'
  AND v.artifact_type = 'article_dna'
  AND v.version_id IN (
    SELECT DISTINCT ON (entity_id) version_id
    FROM public.editorial_artifact_versions
    WHERE marca_id = '09762023-d0d4-4c24-b34e-d0fdfd43f891' AND artifact_type = 'article_dna'
    ORDER BY entity_id, version_number DESC
  )
ORDER BY v.entity_id;
```

`com_qualificacao` é a coluna decisiva: hoje deve vir `0` em todas as linhas.

### Passo 2 — rematerializar

No Arquiteto, para cada um dos cinco artigos: **concluir a formação novamente**.
Não editar composição, principal, papéis nem Silo — o enriquecimento é
automático a partir do que o handoff traz.

### Passo 3 — conferir o resultado

Rodar o mesmo SELECT. O esperado:

- `version_number` +1 e `content_hash` diferente **apenas** nos artigos cujas
  keywords têm qualificação na origem;
- `com_qualificacao` igual a `keywords` nesses artigos;
- artigos sem qualificação upstream: **versão inalterada** (UNCHANGED).

E no Radar, em **Conteúdo → Fundamentos do artigo**: contagem de keywords igual
à do Arquiteto, e cada perfil com intenção consolidada, funil, estado da
evidência, versão e hash da qualificação.

---

## 4 · Entrega

Por artigo — todos no mesmo estado:

```
ARTICLE = skin care principia | cremes skin care | skin care coreano |
          mascara de skincare | serum facial principia
OLD_VERSION = BLOQUEADO (exige o SELECT do passo 1)
NEW_VERSION = NÃO EXECUTADO
PREVIOUS_VERSION_OK = garantido pelo pipeline (provado em teste)
KEYWORDS = BLOQUEADO
FOUNDATIONS_COMPLETE = NÃO EXECUTADO
SEMANTIC_QUALIFICATIONS_RESOLVED = NÃO EXECUTADO
RADAR_VERSION_MATCH = NÃO EXECUTADO
RADAR_UI_KEYWORDS = NÃO EXECUTADO
RADAR_ENGINE_KEYWORDS = NÃO EXECUTADO
F5_SURVIVES = NÃO EXECUTADO
```

Resumo:

```
ARTICLES_REMATERIALIZED = 0
ARTICLES_SUCCESS = 0
ARTICLES_FAILED = 0

SKIN_CARE_PRINCIPIA_ARTICLE_KEYWORDS = BLOQUEADO
SKIN_CARE_PRINCIPIA_RADAR_KEYWORDS   = BLOQUEADO
SKIN_CARE_PRINCIPIA_FULL_FOUNDATIONS = BLOQUEADO

PRIMARY_FOUNDATION_COMPLETE       = YES no pipeline (provado em teste)
SECONDARY_FOUNDATION_COMPLETE     = YES no pipeline
REINFORCEMENT_FOUNDATION_COMPLETE = YES no pipeline

ARTICLE_IMMUTABILITY_PRESERVED = YES (nenhuma escrita; e o caminho é sucessora)
HISTORY_PRESERVED = YES (previousVersionId no pipeline, provado em teste)

RADAR_ENGINE_RECEIVES_FULL_FOUNDATIONS = YES (provado em teste)
RADAR_UI_MATCHES_FOUNDATIONS = YES (mesma projeção, provado em teste)

RADAR_TESTS_TOTAL = 362
RADAR_TESTS_PASS  = 362
RADAR_TESTS_FAIL  = 0

ARQUITETO_TESTS_TOTAL = 1525
ARQUITETO_TESTS_PASS  = 1524
ARQUITETO_TESTS_FAIL  = 1 (pré-existente e alheio — ver abaixo)

PROVIDER_CALLS = 0
MIGRATIONS = 0
TYPECHECK_ERRORS = 0

READY_FOR_R10_2 = NÃO — o R10.2 depende de fundamentos completos em dados
  reais, e a rematerialização ainda não foi executada. O código está pronto;
  falta rodar o passo 2 e conferir o passo 3.
```

### A falha alheia, registrada separadamente

`Minerador qualifica somente por ação explícita e não chama IA no motor lógico`
espera a string `Processar lógica` num componente do Minerador.
`git diff --stat lib/minerador` está vazio nesta sessão: a divergência vem do
working tree de outro lote e não tem relação com R10.1B/C.
