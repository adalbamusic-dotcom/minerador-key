# SDD — Veredito próprio para artigo de uma keyword — 2026-09-23

**Módulo:** Arquiteto. **Status:** **PROPOSTA para decisão do usuário.** Não será implementada agora. Nenhum código, schema ou dado foi alterado.

## Problema

O parecer de formação (`lib/arquiteto/article-serp-interpretation.ts`) responde duas perguntas: quem encabeça a página e se as buscas cabem numa página só. Em artigo de **uma** keyword, a segunda pergunta não tem par para comparar:

- `resolvePrincipalVerdict` devolve `PRINCIPAL_SUPPORTED`, com a razão "cabeceira por definição" (`:194-202`);
- `resolveGroupVerdict` devolve `INCONCLUSIVE` com `total = 0` (`:270-278`);
- `interpretArticleSerp` traduz grupo `INCONCLUSIVE` em veredito `INCONCLUSIVE` (`:409-415`);
- a recomendação sai "Decidir explicitamente: a evidência não confirma nem rejeita".

**Medido** (SQL agregado no remoto, 2026-09-23): dos 5 pareceres de formação, **4 são de artigo de uma keyword, e os 4 saem `INCONCLUSIVE` por construção**. O quinto, com 3 buscas de apoio, é `COMPATIBLE`.

**Efeito:**
- no gate (`lib/arquiteto/article-serp-gate.ts:261-272`), fora da fase 1, `current_inconclusive_unresolved` **bloqueia** a conclusão e pede decisão humana;
- na fase 1 (`PHASE1_UNRESOLVED_SERP_BLOCKS_CONCLUSION = false`), não bloqueia, mas o artigo aparece como "inconclusiva";
- nos dois casos, o sistema pagou a SERP e não disse nada sobre ela. O mercado foi consultado e a resposta foi descartada por falta de uma pergunta que coubesse no caso.

A correção do kgr_light (adendo das 4 lentes, A1) **aumenta** esse caso: um artigo kgr_light com principal clara passa a ter uma keyword observada.

## Proposta

Para artigo com **uma keyword observada**, a pergunta de grupo deixa de ser "estas buscas cabem numa página?" e passa a ser **"a SERP sustenta esta busca como esta unidade editorial?"**.

1. **Novo valor de grupo `SINGLE_KEYWORD`** em `GROUP_VERDICTS`. Diz "não se aplica: uma busca só", no lugar de `INCONCLUSIVE`. `interpretation.groupVerdict` é `z.string()` no registro (`article-serp-record.ts:94`), então o schema gravado não quebra.
2. **Leitura de aderência**, só com dados que o parecer já tem. Nas 4 lentes, quando o adendo estiver implementado, a leitura vale por maioria de lentes. Com uma lente, vale a leitura dela.
   - **Tipo dominante contra unidade.** A SERP é dominada por `product`, `category` ou `local`, e a unidade confirmada é `article`. Isso é desalinhamento: a SERP pede outra página. Unidade não confirmada conta como `article`, e isso é declarado na razão.
   - **Intenção observada contra esperada.** Só pesa quando a intenção esperada é conhecida. `unknown` do Minerador não é conflito, a mesma regra do gate (`serpVerdictOfAssessment`, `:351-360`).
   - **Suficiência.** Menos de 5 orgânicos ou intenção observada `misto`/`indefinido` dá leitura insuficiente.
   - **Canibalização no lote (opcional, D3).** Sobreposição `forte` (≥ 3 URLs) com a principal de outro artigo do mesmo lote, já consultada na mesma execução. Custa 0 chamada. O parecer aponta, e a fusão é humana.
3. **Veredito, com os mesmos três valores** (`ARTICLE_SERP_VERDICTS` não muda):
   - `COMPATIBLE`: aderência sem desalinhamento e leitura suficiente;
   - `DIVERGENCE`: desalinhamento de unidade na maioria das lentes, ou canibalização forte, com recomendação concreta ("a SERP pede página de produto"; "avaliar fundir com X"). Nunca aplicada: a composição e a principal só mudam por decisão humana (`AGENTS.md` §9 e §11);
   - `INCONCLUSIVE`: leitura insuficiente, ou lentes em desacordo sobre o tipo dominante.
4. **Principal:** continua `PRINCIPAL_SUPPORTED`. Não há alternativa a apontar.
5. **Registros antigos:**
   - os que têm `interpretation` gravada **não são recalculados**, porque a explicação gravada é a que vale;
   - os legados sem `interpretation` são reconstruídos por `articleSerpParecerFromAssessment` e passariam pela regra nova. Decisão D2: aplicar a regra nova ou congelar a reconstrução na regra antiga.

## Classe e consumidores

**Structural.** É um novo valor no enum do parecer e muda o que o veredito significa para uma classe inteira de artigos.

Consumidores (grep):
- `app/api/arquiteto/serp/route.ts`;
- `lib/arquiteto/article-serp-record.ts`;
- `lib/server/arquiteto-article-serp-store.ts`;
- `modules/arquiteto/arquiteto-workspace.tsx`;
- `modules/arquiteto/article-formation-review.tsx`, com os rótulos de grupo;
- `tests/arquiteto-article-serp-interpretation.test.mts`.

O gate lê só o veredito e não muda.

## Riscos

- **`COMPATIBLE` para uma keyword pode parecer aval de viabilidade.** A razão precisa dizer o que foi e o que não foi avaliado: aderência de tipo e de intenção, e não força competitiva nem KGR, que é do Minerador.
- **Unidade não confirmada tratada como `article`** pode gerar `DIVERGENCE` em página de serviço ainda não classificada. Mitigação: sem unidade confirmada, o desalinhamento sai `INCONCLUSIVE` com a razão. Decisão D1.
- **Mudança de contagem na mesa:** artigos hoje "inconclusivos" passam a "sustentados" ou "divergentes". É uma avaliação nova da mesma base, sem reescrever parecer gravado.

## Testes planejados

Todos com fixtures, sem rede:
- uma keyword com SERP de artigo dá `COMPATIBLE`;
- SERP de produto com unidade `article` confirmada dá `DIVERGENCE`, e sem unidade confirmada dá `INCONCLUSIVE`;
- intenção esperada `unknown` não gera conflito;
- menos de 5 orgânicos dá `INCONCLUSIVE`;
- grupo com 2 ou mais keywords não muda (regressão);
- registro gravado com `interpretation` não é recalculado;
- parser aceita `SINGLE_KEYWORD`;
- canibalização só com principal do mesmo lote e da mesma marca.

## Rollback

Reverter a função. Pareceres gravados com `SINGLE_KEYWORD` continuam legíveis, porque `groupVerdict` é texto. A tela precisa de rótulo de reserva para valor desconhecido.

## Decisões do usuário

- **D1.** Sem unidade confirmada, desalinhamento de tipo vira `INCONCLUSIVE` (recomendado) ou `DIVERGENCE`.
- **D2.** Legado sem `interpretation`: reconstruir com a regra nova ou com a antiga.
- **D3.** Incluir a canibalização no lote agora ou deixá-la para uma etapa própria.
- **D4.** Aprovar esta SDD. Até lá, o artigo de uma keyword continua `INCONCLUSIVE`, como hoje.
