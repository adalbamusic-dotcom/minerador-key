# Relatório de reconciliação da mesa editorial

**Data:** 2026-09-06 · **Módulo proprietário:** Radar · **Escopo:** auditoria, sem execução de saneamento.

---

## Grau de evidência — leia antes do resto

Este relatório mistura três coisas que **não** têm o mesmo peso. A distinção foi
acrescentada em 2026-09-06 depois de o texto original tratar as três como uma só.

| Grau | O que significa | Nesta auditoria |
|---|---|---|
| **Risco confirmado no código** | Lido na fonte, verificável por qualquer um | `Schema.parse()` dentro do laço, sem `try` por linha, em `WorkflowRepository.list` e `ArtifactRepository.list`. **Confirmado.** |
| **Causa reproduzida** | O defeito foi disparado com o dado real | **NÃO reproduzido.** Nenhum registro concreto foi identificado como o que quebra o parse. |
| **Estado remoto verificado** | Consultado no banco | **NÃO verificado.** Nenhum SQL foi executado por mim. |

**O que isso implica.** A correção entregue elimina um risco real e demonstrável:
a partir de agora, um registro incompatível não derruba os demais. Mas **não está
provado** que era ele a causa do sintoma relatado. Pode haver outra, ou mais de
uma.

O que fecha a questão é a §2: se as consultas devolverem linhas do Radar e a
interface passar a mostrá-las com o diagnóstico novo, a causa era esta. Se
devolverem vazio, a escrita é o alvo e o Escopo 1 do adendo continua de pé.

---

## Resposta direta (com a ressalva acima)

**Não há evidência de que algo tenha acontecido com o banco de dados.** Há um
defeito de leitura confirmado no código que, se disparado, faz a mesa parecer
vazia sem que nada tenha sido perdido.

O defeito: **uma única linha fora do schema derruba a leitura da mesa inteira**
daquele módulo. Nada é perdido — o leitor é que desiste de todos por causa de um.
Isso agora está corrigido, e um registro incompatível passa a ser nomeado em vez
de sumir com o resto.

E a consequência prática mais importante deste relatório: **limpar a mesa seria o
pior movimento possível.** Apagaria trabalho real para esconder um defeito de
contrato — exatamente o que o critério de conclusão da sua própria especificação
proíbe.

---

## 1. O risco confirmado, com o código

### 1.1 O RLS não participa disso

O cliente server-side usa **service role**:

```ts
// lib/server/editorial-db.ts:21
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
```

Service role **bypassa RLS**. Logo a policy `canonical_actor_can_access_brand`
não bloqueia a escrita nem filtra a leitura. A autorização acontece na
**aplicação** (`requireCanonicalSessionProfile` + `assertEditorialPermission`), e
falta de permissão vira **403**, não lista vazia.

> Isso **elimina** a hipótese de RLS que eu mesmo levantei no adendo anterior.
> Está corrigido aqui, e o adendo precisa ser lido com esta ressalva.

### 1.2 O leitor derruba tudo por causa de um

```ts
// lib/server/editorial-repositories.ts:99-105  (WorkflowRepository.list)
for (const row of data || []) {
  if (row.stage === "radar")   radar.push(RadarItemSchema.parse({ ... }));
  if (row.stage === "planner") planner.push(PlannerItemSchema.parse({ ... }));
}
```

`.parse()` **lança**. Não há `try` por linha. Uma linha do Radar cujo payload não
casa com o `RadarItemSchema` vigente derruba `list()` inteiro — e junto vão **os
artigos bons e os itens do Planejador da mesma marca**.

O mesmo padrão está no leitor de artefatos:

```ts
// lib/server/editorial-repositories.ts:84-86  (ArtifactRepository.readAll)
if (row.artifact_type === "article_dna")   articles.push(VersionedArticleDNASchema.parse(...));
if (row.artifact_type === "silo_dna")      silos.push(VersionedSiloDNASchema.parse(...));
if (row.artifact_type === "content_plan")  plans.push(VersionedContentPlanSchema.parse(...));
```

**É sistêmico:** 18 chamadas de `.parse()` estrito contra 2 de `safeParse` no
arquivo. ArticleDNA, SiloDNA e ContentPlan têm o mesmo modo de falha; hoje eles
carregam porque as linhas deles ainda casam.

### 1.3 Por que "estava bem" e deixou de estar

O `RadarItem` ganhou campos ao longo do trabalho recente — `analysisVersions`,
`hydration`, `arquitetoStrategyContext`, `arquitetoKgrIdentity`,
`arquitetoSerpProvenance`, `arquitetoInternalLinks`. O Radar tem hoje **~35
módulos novos e 9 modificados** que estiveram 19 dias sem commit.

Linha gravada sob um shape, lida sob o seguinte: o schema evoluiu e o leitor não
tolera o passado. **Não houve corrupção. Houve deriva de contrato sem política
de leitura de versões antigas.**

### 1.4 A cadeia completa do sintoma

| Observado | Explicação |
|---|---|
| "2 item(ns) enviado(s)" | O POST grava mesmo. Service role, sem RLS no caminho. |
| Sobrevive ao F5 no navegador A | `localStorage` (`minerador-pro:workflow-recovery:<user>:<brand>`) |
| Não aparece no navegador B | O GET **falha**; B não tem recuperação local para mascarar |
| "Não foi possível carregar os artigos desta marca" | É a mensagem de `persistenceMode !== "server"` — o GET falhou de verdade |
| Limpou o cache e sumiu tudo | Sem `localStorage`, o que sobra é o GET quebrado |
| Abrir o Arquiteto "trouxe de volta" | Outro leitor, outra tabela — os artefatos ainda parseiam |

Tudo consistente com **um leitor que falha inteiro**, e com nada mais.

---

## 2. Como confirmar antes de corrigir

Somente leitura. **Se `count` for maior que zero, a escrita funciona e o
diagnóstico está fechado.**

```sql
-- 1 · As linhas existem?
select stage, state, count(*) as linhas
from public.editorial_workflow_items
where marca_id = '<BRAND_ID>' and stage in ('radar','planner')
group by stage, state;

-- 2 · Quais linhas o schema atual recusaria (campos exigidos ausentes)
select id, article_id, stage, lock_version, updated_at,
       (payload ? 'hydration')        as tem_hydration,
       (payload ? 'analysisVersions') as tem_analysis,
       (payload ? 'title')            as tem_title,
       (payload ? 'siloId')           as tem_silo,
       jsonb_object_keys_count(payload) as chaves
from public.editorial_workflow_items
where marca_id = '<BRAND_ID>' and stage = 'radar'
order by updated_at desc;
```

Se a função `jsonb_object_keys_count` não existir, troque a última coluna por
`(select count(*) from jsonb_object_keys(payload))`.

```sql
-- 3 · A linha mais antiga e a mais nova têm o mesmo formato?
select id, updated_at, jsonb_pretty(payload) as payload
from public.editorial_workflow_items
where marca_id = '<BRAND_ID>' and stage = 'radar'
order by updated_at asc limit 1;
```

Comparar o resultado de (3) com o `RadarItemSchema` mostra **qual campo** quebra
o parse. Esse campo é a resposta.

---

## 3. Como tem que ser feito

### 3.1 O princípio

> **Uma linha inválida é um problema daquela linha.**
> Nunca de todas as outras.

E o corolário, que a sua especificação já exige e eu subscrevo: **não enfraquecer
a validação para o fluxo passar.** O schema não muda. O que muda é o leitor
parar de tratar "uma linha velha" como "a marca não existe".

### 3.2 O contrato de leitura resiliente

```ts
type LeituraDeLinha<T> =
  | { ok: true; item: T }
  | { ok: false; id: string; articleId: string | null;
      motivo: "schema_incompativel"; caminhos: string[] };

type LeituraDaMesa<T> = {
  itens: T[];              // as linhas que parseiam — a mesa utilizável
  incompativeis: Array<{ id, articleId, caminhos }>;  // nomeadas, não escondidas
};
```

Requisitos:

1. **`safeParse` por linha.** Sucesso entra em `itens`; falha entra em
   `incompativeis` com id, `article_id` e os `path` do Zod.
2. **Nunca descartar em silêncio.** Linha incompatível é reportada ao cliente e
   aparece na interface como *"N registro(s) em formato anterior"*, com o motivo.
3. **Nunca apagar.** O leitor não corrige nem remove nada. Reconciliar é decisão
   humana posterior.
4. **Nunca promover.** Linha incompatível não vira "aprovada", nem é completada
   com valores default para satisfazer o schema.
5. **A falha do leitor é distinta da mesa vazia.** Quatro estados diferentes hoje
   colapsados em "lista vazia": **vazio real**, **acesso negado**, **falha de
   leitura**, **payload inválido**. Cada um com sua mensagem e sua ação.

### 3.3 A ordem da correção

| # | O quê | Por quê primeiro |
|---|---|---|
| 1 | `safeParse` por linha em `WorkflowRepository.list` | Devolve a mesa hoje, sem tocar em dado |
| 2 | Mesmo tratamento em `ArtifactRepository.readAll` | Mesmo defeito, ainda latente |
| 3 | Distinguir os quatro estados no GET | Encerra o diagnóstico às cegas |
| 4 | `test:radar` + as 2 fixtures desatualizadas | 36 testes do Radar não rodam em suíte nenhuma |
| 5 | Readback por artigo na importação | Fim do "item construído localmente" |
| 6 | Hidratação sem misturar remoto vazio com local | Fim do falso "sobrevive ao F5" |

**Passos 1 a 3 provavelmente resolvem o sintoma relatado** e não alteram
contrato, dado nem migration. São reversíveis e cabem numa entrega.

### 3.4 O que NÃO fazer

- **Não limpar a mesa.** Nenhuma exclusão é necessária, e a auditoria mostra que
  ela destruiria trabalho para esconder um defeito de leitura.
- **Não alterar Auth, RLS ou fundação global.** O service role já bypassa RLS; o
  sintoma não vem de lá.
- **Não afrouxar schema** com `.passthrough()` ou campos opcionais só para o
  parse passar. Isso troca um defeito visível por um silencioso.
- **Não recoletar SERP paga** para resolver falha de leitura.
- **Não reabrir o Master Refresh.**

---

## 4. Mapa da mesa — módulo → artefato → tabela → API

Levantado do código, verificável.

| Área | Artefato que entrega | Tabela canônica | Onde é lido/escrito |
|---|---|---|---|
| Marca | BrandDNA | `editorial_artifact_versions` | `lib/server/brand-dna.ts` |
| Minerador | KeywordDNA | `minerador_keywords`, `minerador_keyword_lists` | 51 e 19 referências |
| Arquiteto | ArticleDNA, SiloDNA, SiloPage | `editorial_artifact_versions` | `arquiteto-silo-consolidation-adapter.ts` |
| Arquiteto | Território, working copy de Silo | `editorial_workflow_items` (`subject_type` próprio) | `arquiteto-territory-store.ts`, `arquiteto-silo-working-copy-store.ts` |
| Radar | RadarItem, investigação | `editorial_workflow_items` (`stage='radar'`) | `editorial-repositories.ts` |
| Radar | SERP | `editorial_serp_snapshots`, `editorial_serp_reviews` | `editorial-repositories.ts`, `pipeline-repositories.ts` |
| Planejador | ContentPlan | `editorial_artifact_versions`, `editorial_workflow_items` (`stage='planner'`) | `editorial-repositories.ts` |
| Redator | ContentDocument | `content_documents`, `content_document_versions` | 9 referências |
| Publicações | PublicationRecord | `publication_records` | 12 referências |
| Transversal | Decisões | `editorial_decision_events` | `editorial-repositories.ts` |
| Transversal | Status de versão | `editorial_version_status_events` | 4 arquivos |

**A metáfora se sustenta no desenho.** `editorial_workflow_items` é a mesa: cada
área ocupa uma faixa por `subject_type` + `stage`, e o artigo atravessa ganhando
forma. `editorial_artifact_versions` é a prateleira das peças prontas —
imutáveis, com hash e autoria.

O que faltou não foi a mesa. Foi **a regra de como ler uma peça montada numa
versão anterior da linha de montagem**.

---

## 5. Matriz de reconciliação dos 8 artigos

A preencher com o resultado das consultas da §2. Sem isso, cada célula é palpite.

| # | Artigo | ArticleDNA v/hash | Aprovação | Silo / procedência | Linha Radar | SERP (snap/hash/qtd) | Sessão A | Sessão B | Classificação |
|---|---|---|---|---|---|---|---|---|---|
| 1 | serum facial principia | | | | | | | | |
| 2 | mascara de skincare | | | | | | | | |
| 3 | cremes skin care | | | | | | | | |
| 4 | retinol creamy antes e depois | | | | | | | | |
| 5 | skin care pele oleosa | | | | | | | | |
| 6 | skin care coreano | | | | | | | | |
| 7 | skin care principia | | | | | | | | |
| 8 | skin care caseiro | | | | | | | | |

**Classificações:** `íntegra` · `desatualizada` · `referência ausente` ·
`duplicidade` · `divergência local/remota` · `acesso negado` ·
`ainda não verificada`.

Começar pelos artigos 1 e 2 — são os testados — e só então ampliar.

---

## 6. Como tem que ser documentado

| Documento | O que registra | Quando muda |
|---|---|---|
| `docs/05-radar/estado-atual.md` | Entrada nova no topo, com bloco de flags e o que foi corrigido | A cada correção entregue |
| `docs/05-radar/backlog.md` | O que ficou aberto, com dono | A cada achado não resolvido |
| Adendo de SDD | Contrato atual → proposto, consumidores, compatibilidade, rollback, testes | Só para mudança estrutural |
| `docs/05-radar/spec.md` | Só regra **permanente** | Raramente |
| ADR | Só decisão **arquitetônica** | Raramente |
| Este relatório | Auditoria e matriz | Ao completar a matriz |

**A distinção obrigatória em todo registro** — foi a ausência dela que sustentou
o problema por tanto tempo:

```
CÓDIGO_CORRIGIDO      = sim/não
TESTE_AUTOMATIZADO    = sim/não
PERSISTÊNCIA_VALIDADA = sim/não   ← só com readback em duas sessões
```

As três são independentes. Nenhuma implica a outra, e "aviso verde" não é
nenhuma das três.

**Separar sempre a natureza da evidência:** código lido · teste executado ·
consulta remota · validação manual · relato. Um modal vazio e uma notificação de
sucesso **não são evidência sobre o banco**.

---

## 7. Contratos a respeitar

1. **Cada área acrescenta, nenhuma sobrescreve** a decisão consolidada da
   anterior.
2. **Três coisas distintas:** cópia de trabalho (editável, persistida), versão
   consolidada (imutável, com hash e autoria) e decisão humana (vinculada à
   versão revisada).
3. **Status editorial, publicação e transferência são independentes.**
4. **Cache serve à apresentação e recuperação.** Nunca prova aprovação nem
   gravação.
5. **Proveniência viaja junto:** marca, identidade do artigo, versão de origem.
6. **Recuperação local é exibida separadamente**, marcada como não sincronizada
   — nunca somada ao remoto sob o mesmo rótulo.
7. **Mudança material não herda aprovação anterior.**
8. **Alteração estrutural passa por adendo de SDD** antes do código.

---

## 8. Critérios de conclusão

- [ ] Os mesmos artigos e versões aparecem em **duas sessões autorizadas**
- [ ] Abrir o Radar **direto** funciona, sem passar pelo Arquiteto
- [ ] SERP e decisões humanas reconstruídas do servidor após recarga
- [ ] Aprovação corresponde à versão revisada
- [ ] **Zero perda** de keywords, evidências, histórico ou identidade publicada
- [ ] Erros e resultados parciais apresentados corretamente
- [ ] **Nenhuma exclusão foi necessária**

O último é o mais importante deste relatório. Se em algum momento a correção
exigir apagar registro, a hipótese está errada — volte à §2.

---

## 9. Pendências fora deste escopo

| Item | Dono | Registro |
|---|---|---|
| 36 testes do Radar não rodam (sem `test:radar`); 2 com fixture desatualizada | Radar | `parecer-2026-09-05` |
| 2 campos de contrato escritos e nunca lidos (`arquitetoSerpProvenance`, `arquitetoInternalLinks`) | Radar + Arquiteto | `parecer-2026-09-05` |
| Duas autoridades de aprovação (Workbench local vs página de detalhe) | Radar | `parecer-2026-09-05` |
| 263 arquivos de teste órfãos no repositório inteiro | Planner Geral | este relatório |
| 5 erros de TypeScript pré-existentes | Planner Geral | não atribuir a esta correção |
| `siloId` materializado nas sucessoras | Arquiteto | independente, não bloqueia |
