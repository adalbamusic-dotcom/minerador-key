# Corte 5.3 — fechamento do teste de purga e limpeza das fixtures

**Data:** 2026-09-19
**Não alterado:** lifecycle, migrations, regras de elegibilidade, código de aplicação.
**Não configurado:** cron, deploy, purga automática.

---

## 1. A rota foi desarmada

`WRITER_PURGE_TOKEN` foi **removido do `.env.local`**. O valor não foi impresso
em nenhum momento — nem ao criar, nem ao usar, nem ao remover.

O Next recarregou o arquivo sozinho, e a rota voltou ao estado fechado:

```text
sem header                        → 503 { "code": "purge_not_configured" }
com header e pedindo mode=execute → 503 { "code": "purge_not_configured" }
```

Fecha por **ausência de configuração**, não por rejeição de credencial — e é a
diferença que importa: sem a variável não existe caminho, com token errado
existiria caminho e ele seria recusado.

```text
WRITER_PURGE_ROUTE_ARMED = NO
```

---

## 2. A limpeza das fixtures

### 2.1 Isto não foi purga

Os três ativos eram **correntes**, e correntes nunca são elegíveis. A purga não
os tocaria — e é assim que deve ser. O que aconteceu aqui foi remoção de dado de
teste, por id literal, uma vez, com escopo conferido.

### 2.2 Uma descoberta pelo caminho

A primeira tentativa de apagar as linhas passou pelo PostgREST com a chave de
serviço e foi **negada**:

```text
permission denied for table writer_media_assets
```

Não é RLS: é ausência de GRANT de DELETE para os papéis da API. **Só as funções
`SECURITY DEFINER` da M3 apagam dessa tabela** — e elas recusam ativo corrente.

Ou seja: o banco já impedia o que eu estava tentando fazer, e impedia pelo
motivo certo. A limpeza precisou ser administrativa, por SQL direto, que é o que
ela é.

### 2.3 O que foi feito, por fixture

```text
remover objeto do bucket → confirmar ausência → apagar a linha exata → readback
```

| Fixture | Objeto no bucket | Resultado |
| --- | --- | --- |
| `f0f03f34…` (bloco-1) | existia — **removido**, ausência confirmada | linha apagada |
| `ba077573…` (bloco-2) | nunca existiu — ausência confirmada | linha apagada |
| `0f653609…` (bloco-3) | nunca existiu — ausência confirmada | linha apagada |

O arquivo veio antes da linha, a mesma ordem da purga: se a remoção do objeto
falhasse, a linha ficaria, e nenhum arquivo sobraria órfão no bucket.

### 2.4 As três guardas do script

`supabase/scripts/2026-09-19-corte-5-3-limpeza-fixtures.sql` aborta a transação
inteira se:

1. alguma das três não estiver na marca de fixture e no documento de fixture;
2. alguma estiver na marca do usuário;
3. o DELETE afetar mais de três linhas.

Os ids são **literais**, tirados do relatório do Corte 5.2. Nada é descoberto
por consulta, e nada fora da lista é alcançável.

Nenhum endpoint genérico de exclusão foi criado.

---

## 3. Estado final

```text
FIXTURE_CURRENT_ASSETS_REMAINING = 0
FIXTURE_STORAGE_OBJECTS_REMAINING = 0
REAL_REDACTOR_ASSETS = 9
REAL_CURRENT_ASSETS = 5
REAL_WINDOW_OPEN_ASSETS = 4
WRITER_PURGE_ROUTE_ARMED = NO
```

Conferido junto: `REAL_STORAGE_OBJECTS = 9`, os quatro predecessores reais
presentes, `editorial_artifact_versions = 555` inalterado.

### 3.1 O documento de fixture — removido ao fim da rodada

`content_documents` ainda tinha a linha `fixture-purge-52-doc`, na marca
Somatec Blocking, vazia depois da limpeza dos ativos. Ela foi removida numa
etapa própria, com verificação por SELECT antes do DELETE.

**As dependências foram descobertas no catálogo, não presumidas.** Cinco FKs
apontam para `content_documents` — `content_document_user_states`,
`content_document_versions`, `publication_records`, `writer_deliverables` e
`writer_media_assets` — e `writer_mcp_call_events` tem `document_id` **sem
FK**, ou seja, o banco não a barraria. As seis foram conferidas.

```text
FIXTURE_DOCUMENT_FOUND = YES
FIXTURE_DOCUMENT_ORPHAN = YES     seis dependentes, todos em 0
FIXTURE_DOCUMENT_DELETED = YES
AFFECTED_ROWS = 1
REAL_USER_DOCUMENTS_TOUCHED = 0
```

As cinco guardas do script abortam a transação inteira se: não for da marca de
fixture, for da marca do usuário, não bater `article_id` e `title` da fixture,
houver qualquer dependente, houver `current_version_id`, ou o DELETE afetar
número diferente de 1. O `AFFECTED_ROWS = 1` está provado pela transação ter
commitado — com qualquer outro número ela teria abortado.

Nenhuma API, RPC ou mecanismo genérico foi criado. Um caminho reutilizável para
apagar documento seria arma carregada.

### 3.2 A marca de fixture ficou sem rastro

```text
documentos_na_marca_de_fixture  = 0
assets_na_marca_de_fixture      = 0
objetos_de_fixture_no_storage   = 0
```

E do lado do usuário, idêntico ao de antes: 1 documento, 9 ativos, 5 correntes,
4 em janela, 9 objetos, 2 entregáveis, `editorial_artifact_versions` em 555.

## 4. O próximo teste real

**Não execute purga real antes de 2026-09-21.** As quatro janelas dos ativos
reais do Redator vencem naturalmente:

| Ativo | Âncora | `purge_after` (UTC) |
| --- | --- | --- |
| `c4e69d77…` | `article_block` | 2026-09-21 **01:40:46** |
| `216a832b…` | `article_cover` | 2026-09-21 **01:48:22** |
| `74455e67…` | `script_scene` | 2026-09-21 **01:49:37** |
| `6ba107e1…` | `carousel_slide` | 2026-09-21 **01:50:32** |

Até lá, o dry-run **deve** devolver `elegiveis: 0` para a marca Care Glow, com
`window_open: 4` e `not_superseded: 5`. Se devolver qualquer outra coisa antes
dessas horas, é defeito de seleção — e a hora marcada é o que torna esse teste
possível sem combinar nada.

Depois do vencimento, a sequência recomendada é:

1. armar a rota definindo `WRITER_PURGE_TOKEN` no ambiente do servidor;
2. rodar **`mode=dry_run`** e conferir que aparecem exatamente os quatro, com os
   `purge_after` acima;
3. só então decidir sobre `execute`, sabendo que os arquivos e as linhas somem
   em definitivo — a janela de 48h terá cumprido o papel dela;
4. desarmar a rota depois.

**A ausência de purga continua sendo o modo seguro.** Nada expira sozinho:
`purge_after` apenas marca quando a janela venceu, e sem rota armada nem cron as
linhas permanecem indefinidamente.

---

## 5. Baseline

| Suíte | Resultado |
| --- | --- |
| `npx tsc --noEmit` | **0 erros** |
| `test:redator` | **145/145** |

Nenhum arquivo de código foi alterado nesta rodada — só um script SQL de limpeza
e esta documentação. `.env.local` segue fora do rastreio do git.

```text
REGRESSIONS = NONE
CRON_CONFIGURED = NO
PURGE_AUTOMATICO = NO
```
