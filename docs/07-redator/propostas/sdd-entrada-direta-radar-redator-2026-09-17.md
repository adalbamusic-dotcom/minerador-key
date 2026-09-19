# SDD — Entrada direta Radar → Redator, sem ContentPlan

**Data:** 2026-09-17 · **Módulo proprietário:** Redator
**Compartilhados afetados:** contratos editoriais, persistência, consumidor Publicações

---

## 1. O problema

Hoje um documento só nasce por `startWriting(plannerItemId)`, que exige plano
editorial **aprovado**:

```ts
if (item.state !== "approved" && item.state !== "sent_writer")
  throw new Error("Apenas planos editoriais aprovados podem seguir para o Redator.");
```

E o estado vazio do Redator manda o usuário embora:

> "Aprove um plano editorial e use 'Redigir artigo' no Planejador."

O Radar já produz um pacote canônico completo — análise, blueprint, dossiê de
evidências com hash, contexto de keywords, fundamentos do artigo. Passar por um
ContentPlan só para chegar ao Redator obriga a criar um artefato que ninguém
pediu, e que não acrescenta nada ao que o Radar já resolveu.

**Este SDD abre a entrada direta.** O ContentPlan deixa de ser requisito; não
deixa de existir.

---

## 2. Verificação do schema efetivo — antes de qualquer código

A ordem pedia conferir a nulabilidade real, porque as migrations divergem:

| Migration | `content_documents.content_plan_version_id` |
|---|---|
| `0002_operational_editorial_flow` | `text NOT NULL REFERENCES …` |
| `0028_editorial_documents_and_views` | `text REFERENCES …` (nulável) |

**Consultado no banco (somente leitura, 2026-09-17):**

```
content_documents.content_plan_version_id   → is_nullable = YES
content_documents.article_dna_version_id    → is_nullable = YES
publication_records.content_plan_version_id → is_nullable = YES
publication_records.planner_item_id         → a coluna NÃO EXISTE
```

> ### NENHUMA MIGRATION É NECESSÁRIA
>
> A 0028 prevaleceu sobre a 0002. O banco já aceita documento sem plano, e
> `publication_records` nunca teve `planner_item_id` — esse campo só existe no
> contrato de aplicação.
>
> O bloqueio é **inteiramente de contrato Zod**, não de DDL. Preparar migration
> aqui seria escrever DDL para um problema que não existe.

---

## 3. Contrato — `ContentDocument` v2

### 3.1 Por que união discriminada, e não campo opcional

Tornar `contentPlanRef` opcional no v1 deixaria **um documento v1 sem plano**
passar no schema. O plano é obrigatório na origem Planejador e inexistente na
origem Radar; um schema que aceita os dois estados em qualquer origem não
descreve nenhuma das duas.

A união por `schemaVersion` mantém o v1 exatamente como está — nada a migrar,
nada a reler — e o v2 nasce com a obrigação que lhe cabe.

```ts
ContentDocumentSchema = z.discriminatedUnion("schemaVersion", [
  ContentDocumentV1Schema,   // schemaVersion: 1 · contentPlanRef OBRIGATÓRIO
  ContentDocumentV2Schema,   // schemaVersion: 2 · radarOrigin OBRIGATÓRIO, SEM contentPlanRef
]);
```

### 3.2 O que o v2 acrescenta

```ts
radarOrigin: {
  radarItemId, articleId,
  analysisVersionId, analysisVersionNumber,
  evidenceBundleHash,        // o hash do dossiê congelado
  articleDnaVersionId, articleDnaContentHash,
  siloDnaVersionId | null,
  importedAt, importedBy,
}
```

`evidenceBundleHash` é o que amarra o documento ao pacote **daquela rodada**. Sem
ele, uma nova análise do mesmo artigo seria indistinguível da que originou o
texto — e é essa distinção que sustenta "Atualização disponível".

### 3.3 O que NÃO entra

- **`contentPlanRef` no v2.** Nem opcional, nem com id fictício. Um documento sem
  plano que carrega uma referência inventada mente para todo consumidor a
  jusante, e o `strict()` do v2 recusa a chave.
- **ContentPlan intermediário.** Nenhum artefato é criado para satisfazer o
  caminho antigo.
- **Item no Planejador.** O envio não cria nem transiciona `plannerItems`.

### 3.4 Contexto importado é distinguível do texto escrito

O contexto do Radar entra em `importedContext`, com proveniência própria, e
**nunca** dentro de `blocks` ou `editorContent`. Quem escreve precisa saber, olhando,
o que veio da investigação e o que ele mesmo redigiu. Misturar os dois faria o
autosave gravar evidência como se fosse redação.

---

## 4. Contrato — Publicações

O bloqueio está no Zod, não no banco:

```ts
// hoje
plannerItemId: z.string(), contentPlanVersionId: z.string(),
// proposto
plannerItemId: z.string().nullable().default(null),
contentPlanVersionId: z.string().nullable().default(null),
```

Aditivo para o registro antigo: quem já tem os dois preenchidos continua
válido. E `radarOrigin` opcional no registro identifica a procedência.

**Invariante que substitui a obrigatoriedade:** todo registro precisa de
**pelo menos uma** origem declarada — plano OU Radar. Nenhuma origem é registro
órfão, e o schema recusa. Trocar "sempre tem plano" por "sempre tem alguma
origem" preserva a garantia real sem exigir o artefato errado.

---

## 5. Serviço de envio (Radar → Redator)

### 5.1 Fronteira

O comando recebe **marca, artigos selecionados e as referências das versões
exibidas**. O servidor **carrega os dados canônicos** — o cliente não envia
dossiê, nem contexto, nem briefing. As referências exibidas servem só para
detectar que a tela está olhando uma versão que já não é a atual.

### 5.2 Reuso obrigatório

`resolveRadarCanonicalDossier` de `lib/server/radar-canonical-dossier.ts`. Ele
já existe exatamente por este motivo, e o próprio módulo explica:

> "Havia duas formas de conseguir isso: escrever um teste que compara as duas
> saídas, ou fazer as duas saírem do MESMO código. A segunda não pode falhar."

Nada de reconstruir pelo CSV, por estado React ou por gerador novo de briefing.

### 5.3 Gates

| Verificação | Recusa |
|---|---|
| Sessão e permissão de leitura no Radar | `NAO_AUTORIZADO` |
| Permissão de edição no Redator | `NAO_AUTORIZADO` |
| Registros pertencem à marca | `OUTRA_MARCA` |
| Pacote existe | `PACOTE_INEXISTENTE` |
| Pacote finalizado/congelado (readiness canônica, não o texto da tela) | `PACOTE_NAO_FINALIZADO` |
| Versão exibida == versão atual | `PACOTE_DESATUALIZADO` |
| Identidade íntegra (article/analysis/hash) | `IDENTIDADE_INCONSISTENTE` |

**Pendências editoriais declaradas NÃO bloqueiam** a criação do rascunho — decisão
do usuário. Elas viajam para o documento **como pendências**, nunca como
resolvidas.

### 5.4 Desfechos por item

`criado` · `ja_existente` · `atualizacao_disponivel` · `bloqueado` · `falha`

- **Idempotência** por marca + artigo: repetir devolve o documento existente.
- **Documento existente é preservado**, inclusive legado v1. Origem diferente →
  `atualizacao_disponivel`; a base e o texto **não** são substituídos neste corte.
- **Lote processa por artigo**: sucesso de um não se perde pela falha de outro.
- **Sucesso só depois de gravar, reler e validar** o documento remoto e suas
  referências. Falha parcial permite repetir sem documento local fantasma.

### 5.5 O que não acontece

Zero IA, zero SERP, zero provider. Título, evidências e URLs vêm do que existe —
nada é inventado. O Radar **não** é marcado como "enviado ao Planejador": o
histórico registra a origem real.

---

## 6. Interface

### A transferência é UMA, e começa no Radar

A ação canônica chama-se **"Enviar ao Redator"** e vive no Radar — em R3, em R4
e na página de análise. O Redator **recebe**; ele não busca.

Chamar a entrada de "Importar do Radar" no Redator criaria uma segunda
autoridade de transferência sobre o mesmo fato. Duas portas para a mesma
travessia significam dois lugares decidindo se o pacote está pronto, e nada
garante que decidam igual. O nome importa porque descreve quem tem a autoridade:
quem finaliza a investigação é quem a entrega.

- **"Enviar ao Redator"** é a entrada principal, individual e em lote, no Radar.
- Elegíveis, já enviados e bloqueados com motivo; pendências revisáveis antes.
- O estado vazio do Redator deixa de mandar aprovar plano e passa a apontar para
  o Radar — orientação, **não** um segundo botão de transferência.
- O botão do Planejador permanece como **caminho histórico** para planos
  aprovados, sem ganhar competência nova.
- Fundamentos mostram origem Radar, versão, contexto e evidências; nenhum acesso
  obrigatório a `contentPlanRef` no caminho novo.
- **Pendências em painel próprio.** Bloqueantes impedem aprovação final no
  servidor e a transferência como aprovado para Publicações — **não** impedem
  escrever e salvar.
- Nesta entrega, pendência bloqueante se resolve no módulo proprietário. **Não**
  existe botão local que as considere resolvidas.
- `brandRef` preservado nos links internos.
- Editor, autosave, histórico, recuperação e concorrência **intocados**.

---

## 7. Compatibilidade e rollback

| Dimensão | Efeito |
|---|---|
| Documentos v1 | Inalterados. A união aceita o v1 exatamente como era. |
| Publicações antigas | Inalteradas. Os campos viram nuláveis; o preenchido continua válido. |
| Fluxo do Planejador | Intacto. `startWriting` não é tocado. |
| Banco | **Nenhuma alteração.** Colunas já nuláveis. |
| Rollback | Remover o ramo v2 da união e a rota nova. Documentos v2 já gravados **deixariam de ser legíveis** — este é o único ponto sem volta limpa, e está registrado aqui de propósito. |

---

## 8. Testes

Automatizados, sem chamada paga:

1. Envio sem ContentPlan e sem item no Planejador
2. Paridade do contexto com `resolveRadarCanonicalDossier`
3. Rascunho com pendências permitido; aprovação bloqueada quando aplicável
4. Recusa de pacote não finalizado, versão alterada e acesso entre marcas
5. Repetição, concorrência e lote misto sem duplicação nem perda de sucessos
6. Falha de gravação/readback sem sucesso visual; repetição completa
7. Documento existente preservado diante de pacote novo
8. v1 e o caminho histórico do Planejador continuam funcionando
9. Salvar, ler e entrar em Publicações com documento v2 sem referência a plano

**A homologação funcional é do usuário** — enviar, escrever, salvar,
recarregar, conferir em outra sessão e validar a entrega a Publicações. O roteiro
vai junto com a entrega, e os resultados automatizados ficam separados da
validação manual.

---

## 9. Fora deste corte

Mover o Planejador para Marca · remover DeepSeek · MCP · formatos novos ·
alterar pesquisa e formação · atualizar a base de documentos já existentes
diante de pacote novo.

---

## Implementado — `RADAR_TO_WRITER_HANDOFF_1` — 2026-09-17

Este SDD deixou de ser proposta.

O domínio que ele especificou (`lib/redator/radar-import.ts`) existia desde
então **sem nenhum chamador de produção**. O gate `RADAR_TO_WRITER_HANDOFF_1` o
ligou e foi além do escopo original: o Planejador saiu do pipeline operacional
inteiro, não apenas do caminho até o Redator.

O que mudou em relação ao que está escrito acima:

- a entrada não é um botão no Redator, e sim a **entrega do Radar**
  (`sendRadarToWriter`), com recibo gravado, readback e transição de esteira;
- `ImportedRadarContextSchema` ganhou `dossier`: o documento carrega a
  estrutura canônica inteira, não só a origem por hash;
- `RADAR_WRITER_MAY_NOT` viaja dentro do pacote;
- `ContentDocumentRepository.create` passou a aceitar `planVersionId: null`, que
  era o único bloqueio real — exatamente como esta análise previu.

A verificação de schema registrada na seção 2 continua valendo e é a base do
`MIGRATIONS = NO` do gate.

Detalhe da rodada:
[relatório datado](../../00-produto/auditorias/relatorio-radar-to-writer-handoff-2026-09-17.md).
