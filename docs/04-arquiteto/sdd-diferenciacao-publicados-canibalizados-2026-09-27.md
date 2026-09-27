# SDD — Diferenciar publicados que disputam o mesmo assunto (canibalização)

**Estado:** APROVADA pelo dono em 2026-09-27, como está. Q1: a IA propõe ângulos, com a menor autoridade. Q2: teto de US$ 0,50 por grupo, com uma confirmação por rodada. Q3: página que ranqueia não troca a principal.
**Módulo proprietário:** Arquiteto.
**Regras de base:** `docs/compartilhado/regras-serp-e-assuntos-2026-09-26.md` — A (SERP), D2.1 (Posto Livre/Travado), D2.2 (mesmo assunto pela SERP), D2.3 (volume primeiro), D6 (coleta nova com aviso).
**Não inclui:** apagar, despublicar, redirecionar (301) ou fundir páginas; mudar URL, slug, canonical ou marca; publicar no site.

## 1. Problema verificado

Pedido do dono, 2026-09-27:

> "esses artigos não podem simplesmente serem apagados, eles tem que ser melhorados, e não precisa de muita keywords para isso, basta ter uma duas com volume para cada uma".
>
> "A plataforma tem que estar na altura para de fato resolver e até de forma automática estas questões mesmo que tenha custos extras dos provider."

Medição no cache da AdalbaPro. Foi só leitura, sem custo, top 10 da união das 4 lentes.

**Pares de publicados com 3 ou mais páginas em comum: 13, em 4 famílias.**

| Família | Publicados que disputam |
|---|---|
| Plano de marketing | "plano de marketing para clínica de estética", "como criar um plano de marketing para clínica de estética" (7 páginas em comum), "plano de marketing estética: exemplos e templates", "checklist de plano de marketing…" |
| Atrair/captar em estética | "como atrair pacientes para clínica de estética" × "como captar clientes para clínica de estética" (6 em comum) — o caso trazido pelo dono |
| Atrair em consultório e clínica | "como atrair clientes para consultório", "como atrair pacientes para clínica", "como atrair pacientes para consultório odontológico" (3 a 5 em comum) |
| Campanhas e marketing | "campanhas … sem anúncios", "marketing para clínica de estética", "agência de marketing…", "modelos de campanha…", "promoções para estética" (3 a 4 em comum) |

O que os números mostram:

- **Quase nenhum publicado ranqueia.** Das 159 keywords no cache, o site aparece no top 10 em só 2: "campanhas … sem anúncios", em 4º no celular, e "modelos de campanha…", em 7º. Diferenciar é, portanto, de baixo risco: não há posição a perder.
- **O lote atual não tem com o que diferenciar.** Nenhuma das 133 keywords livres com volume divide a SERP com "atrair pacientes…" ou "captar clientes…". As keywords certas precisam ser buscadas fora do lote, no provider, com custo.
- **Hoje o sistema só avisa.** Ele diz "possível canibalização — avalie você" (`serp-subject-diagnosis.ts`) e para aí.

## 2. Ideia

Dois publicados que o Google trata como o mesmo assunto ganham **ângulos diferentes**, sem mudar endereço.

- Cada um recebe uma principal nova (só se o Posto for Livre) e 1 ou 2 secundárias, todas com volume.
- A SERP de um passa a ser diferente da SERP do outro.
- O slug continua o mesmo, então o ângulo precisa caber nele.

Exemplo, com as mesmas URLs:

| Página (slug fixo) | Ângulo | Busca de keywords perto de… |
|---|---|---|
| `como-captar-clientes-para-clinica-de-estetica` | Captação ativa: anúncios, tráfego pago, leads, Google Ads | "captar clientes", "anúncios para clínica de estética", "tráfego pago para estética" |
| `como-atrair-pacientes-para-clinica-de-estetica` | Atração orgânica: conteúdo, Instagram, indicação, Google Meu Negócio | "atrair pacientes", "instagram para clínica de estética", "marketing de indicação" |

O texto do ângulo é só uma hipótese. Quem decide se ele vale é o volume, e depois a SERP.

## 3. Fluxo

### 3.1 Detectar (grátis, cache)

- Montar grupos de publicados da mesma marca que dividem a SERP.
- Os níveis seguem D2.2: **Forte**, 3 ou mais páginas em comum; **Provável**, 2 páginas.
- Mostrar um painel **"Publicados que disputam o mesmo assunto"**:
  - uma linha por grupo, com os publicados, as páginas em comum e o Posto de cada um;
  - se algum deles ranqueia, a posição.

### 3.2 Propor ângulos (grátis; IA opcional)

Fontes, em ordem de autoridade:

1. **O que já separa os slugs.** Por exemplo, "captar clientes" contra "atrair pacientes", ou "checklist" contra "exemplos e templates" contra "como criar".
2. **O DNA.** Entidade, problema e intenção do KeywordDNA e do ArticleDNA.
3. **O que o Google já associa à URL.** Vem do `ranked_keywords` da própria página (pago, barato; ver 3.3).
4. **Proposta da IA, Camada 2.** Nome do ângulo e 3 a 5 sementes por página. É a autoridade mais baixa: nada da IA vale sem volume e sem SERP. Pode ser desligada.

### 3.3 Buscar keywords (pago, com prévia)

Para cada página do grupo:

- `ranked_keywords` da URL (DataForSEO Labs);
- `keyword_ideas` ou `related` com as sementes do ângulo, usando o mesmo núcleo da Pesquisa por Assunto;
- volume do Google Ads para as candidatas (sem custo).

**Filtro D2.3.** Só passa candidata com volume maior que zero. Ela também precisa caber no slug: dividir a entidade central do slug (por exemplo, "clínica de estética" ou "estética") ou dividir 2 ou mais páginas com a principal atual.

### 3.4 Validar pela SERP (pago, cache primeiro)

- Colher as 4 lentes das melhores candidatas: até 5 por página, ordenadas por volume.
- **Critério de separação.** A keyword proposta para uma página divide **no máximo 1** página do top 10 com as keywords propostas para as irmãs.
- **Critério de encaixe.** Ela divide **2 ou mais** páginas com a própria página: com a principal atual, com as keywords em que a URL já ranqueia ou com as outras escolhidas para ela.

### 3.5 Entregar a proposta

Uma proposta por grupo. Para cada página:

- ângulo;
- principal nova, só se o Posto for Livre, com volume maior que o da atual;
- 1 ou 2 secundárias com volume;
- páginas em comum com as irmãs, antes e depois;
- custo gasto.

Estados possíveis:

- **Diferenciado:** os dois critérios passam.
- **Diferenciação fraca:** a melhor possível, com o motivo. Por exemplo, "o Google ainda junta 2 páginas".
- **Sem saída pelo provider:** nenhuma candidata com volume cabe no slug. O sistema explica e deixa a decisão com o dono.

## 4. Custo

Preços que já estão no código:

- Labs: US$ 0,012 por tarefa + US$ 0,00012 por item;
- SERP: até US$ 0,0035 por lente.

Estimativa por página:

| Item | Custo |
|---|---|
| `ranked_keywords` + 1 a 2 buscas Labs | ~US$ 0,05 a 0,07 |
| SERP de 5 candidatas × 4 lentes | até ~US$ 0,07 |
| **Total por página** | **~US$ 0,12 a 0,15** |

- Um grupo de 2 páginas custa ~US$ 0,30.
- As 4 famílias da AdalbaPro somam ~14 páginas, **~US$ 2**.

Regras de custo:

- O plano mostra a faixa de custo antes de qualquer chamada.
- Uma confirmação vale para o grupo, ou para todos os grupos marcados.
- Teto de **US$ 0,50 por grupo**. Plano acima do teto é cortado, e a tela mostra o corte.
- Cache válido não cobra.
- Provider: só DataForSEO. Serper e RapidAPI nunca.
- Testes usam fixtures, sem custo.

## 5. Aplicar (decisão humana)

- **Aceitar grupo:** um clique, com confirmação e readback. Aplica usando os mesmos gravadores da troca de principal e do reforço (D2.1).
  - **Posto Livre:** troca a principal; a antiga vira secundária; entram as secundárias novas, até 6.
  - **Posto Travado:** só secundárias, com o aviso de que a diferenciação fica mais fraca.
- Cada página ganha, no ArticleDNA:
  - em `excludedSubjects`, o ângulo das irmãs;
  - uma **nota de diferenciação**, que desce ao Radar e ao Redator pelas linhas de `editorialContext`. Por exemplo: "não cobrir tráfego pago; é do artigo X; linkar para ele".
- O InternalLinkGraph recebe sugestões de link entre as irmãs.
- Nova versão, histórico e ator autenticado.
- URL, slug, canonical e marca nunca mudam.
- **Manter como está:** fica registrado e o grupo sai do painel até haver SERP nova.

## 6. Persistência e contrato

- A proposta fica em `editorial_workflow_items`, com `subject_type = 'differentiation_proposal'`, no estágio `arquiteto` e com `marca_id`. A coluna é texto livre (migration 0027), então **não precisa de migration**.
- O payload guarda:
  - o grupo;
  - a medida antes e depois;
  - as candidatas, com a origem de cada uma;
  - os custos;
  - o hash da prévia.
- Um único campo novo e opcional no ArticleDNA: a nota de diferenciação. É aditivo, porque o schema `.strict()` aceita campo opcional declarado. O campo `excludedSubjects` já existe.
- Rotas novas, com ator autenticado e `brandId` do servidor:
  - `POST /api/arquiteto/cannibalization/plan` (grátis);
  - `.../run` (pago, exige o hash da prévia);
  - `.../apply` (humano).
- Catálogo MCP (§17.1): a IA conectada pode detectar e montar a prévia. Aplicar só com o aceite humano no chat.

## 7. Riscos

- **Ângulo artificial.** Mitigação: volume e SERP decidem, e o estado "fraca" fica visível.
- **Slug que não comporta um ângulo distinto.** Mitigação: o critério de encaixe no slug; sem encaixe, "Sem saída", sem forçar.
- **Custo.** Mitigação: prévia, teto e cache.
- **Um publicado ranqueando que perde posição com a troca.** Mitigação: se a página aparece no top 10 para a principal atual, a troca da principal é bloqueada e só entram secundárias, com aviso.

## 8. Testes

- Detecção com os dados reais do cache: as 4 famílias.
- Separação e encaixe.
- Filtro de volume.
- Posto Livre e Posto Travado.
- Página que ranqueia sem troca.
- Teto de custo.
- Prévia com hash.
- Readback.
- Isolamento por `brandId`.
- Catálogo MCP.
- Nenhuma chamada paga nos testes.

## 9. Decisões para o dono

- **Q1.** A IA propõe ângulos e sementes (3.2, item 4)? Recomendado: **sim**, como a autoridade mais baixa.
- **Q2.** Teto de US$ 0,50 por grupo e uma confirmação por rodada? Recomendado: **sim**.
- **Q3.** Página que já ranqueia fica sem troca de principal? Recomendado: **sim**.

## 10. Implementação (2026-09-27)

Estado: **verificado no código e confirmado por testes locais** (fixtures, portas falsas e leitura real do cache da AdalbaPro; sem rede, sem crédito). **Não validado manualmente**: a homologação é do usuário. Nenhuma escrita remota, SQL, migration, chamada paga, servidor ou build.

| Item da SDD | Onde | Verificação |
|---|---|---|
| 3.1 Detectar (grátis) | `lib/arquiteto/published-differentiation.ts`, `POST /api/arquiteto/cannibalization/plan` | Teste com o cache real: 4 famílias e 13 pares Fortes; só 2 publicados ranqueiam (4º e 7º) |
| 3.2 Ângulos (IA opcional) | mesmo arquivo; IA validada, com a menor autoridade | Teste: id inventado recusado, 3 a 5 sementes |
| 3.3 e 3.4 Buscar e validar (pago) | `published-differentiation-run.ts`, `/run`, núcleo da Pesquisa por Assunto | Teste com portas falsas: cache primeiro, ledger, filtro D2.3, separação e encaixe |
| §4 Custo | plano com faixa, teto de US$ 0,50 no servidor, cortes, `planHash` | Teste: par atrair × captar de US$ 0,072 a 0,284; as 4 famílias até US$ 1,71 |
| 3.5 Proposta | avaliação por página e por grupo | Teste: Diferenciado, fraca e sem saída, com o motivo |
| §5 Aplicar | `published-differentiation-apply.ts`, `/apply`, writer canônico com releitura | Teste do servidor com banco em memória |
| Tela | `modules/arquiteto/published-differentiation-panel.tsx`, `published-differentiation-model.ts`, `use-published-differentiation.ts` | `tests/arquiteto-diferenciacao-publicados-tela.test.mts` (12) |
| MCP e catálogo | `plan_published_differentiation` (detectar e prévia); catálogo com os rótulos da tela | `test:agent` 56/56 |

Diferenças em relação ao texto acima:

- **Sem campo novo no ArticleDNA.** A nota vai no campo `differentiation`, que já existia, com o prefixo "Diferenciação: ". O link sugerido vai em `internalLinks` ("Link interno sugerido: "). O schema `.strict()` não mudou, então não há regra de deploy nova.
- **Estágio `architect`.** O CHECK de `editorial_workflow_items.stage` não aceita "arquiteto".
- **InternalLinkGraph.** A sugestão de link fica no ArticleDNA e na proposta. O grafo só recebe sugestão pela Proposal IA de Links Internos, que ainda não tem tela.
- **Keyword nova.** Não entra direto no ArticleDNA: vai ao Processador do Minerador ("Enviar ao Minerador"). Depois de aprovada, "Colocar no artigo" e um novo aceite completam a troca.

Correções da revisão (2026-09-27, confirmadas por teste; detalhes no estado atual do Arquiteto):

- **Uma rodada por prévia.** A proposta ganhou o estado `running`, reservado por `lock_version` antes de pagar. Outra rodada na mesma prévia é recusada sem pagar; a mesma rodada repetida devolve o resultado gravado.
- **Prévia nova não apaga o que foi pago nem desfaz "Manter".** Só "Planejar nova rodada" (tela) substitui a avaliação, que vai ao histórico da proposta. O MCP é recusado nos dois casos.
- **Separação (3.4)** medida contra a principal que a irmã mantém mais as propostas dela; o "depois" também conta a principal mantida. A antiga principal de quem troca vira secundária (§5) e deixa de ser o alvo da página.
- **Diferenciação fraca (3.5)** mostra a melhor possível só como evidência; ela não entra no aceite. O aceite leva por padrão só as páginas "Diferenciado".
- **Q3** relido do cache no aceite, como o Posto.

Pendências: homologação manual na AdalbaPro (detecção, prévia, rodada paga com confirmação, aceite com releitura, ledger com o módulo `arquiteto`); nota na investigação do Radar; grafo de links.
