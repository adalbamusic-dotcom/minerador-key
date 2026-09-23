# Adendo — Intenção e funil pelas 4 lentes, classificador v4 — 2026-09-23

## Identificação

- **Módulo proprietário:** Minerador. **Arquivos compartilhados:** o contrato do cache de SERP (`lib/editorial/serp-cache.ts`), com mudança aditiva.
- **Autorização do usuário (2026-09-23):**
  - *"pode aplicar já nele as 4 lentes, por que justamente na intenção e funil que a gente sofre muitas vezes por falta de dados ou evidência"*;
  - *"pode fazer sim, vamos processar ele de maneira inteligente, com o fim de obter dados precisos, por isso eu insisto e utilizar as 4 lentes em todas as áreas e em todos os processos da plataforma"*.
- **Por que é adendo e não ajuste localizado:** a SERP conclusiva prevalece no leitor canônico (`lib/minerador/logical-read-model.ts`) e dispara o rebaixamento de aprovadas (`lib/minerador/approved-package.ts`). Mudar o que conta como conclusivo muda workflow (`AGENTS.md` §4 e seção de governança).
- **Base medida:** mapeamento de 2026-09-23 com três verificadores adversariais. Arquivos: `scratchpad/plataforma-4lentes-resultado.json`, e a seção E7 da [SDD de egress](../../compartilhado/sdd-uso-supabase-orcamento-egress-2026-09-23.md).

## 1. O que foi medido

- **Qualificações vigentes:** das 134 keywords vivas com Qualificação, a intenção está conclusiva em 71, mista em 52 e fraca ou insuficiente em 11. 100 das 134 ainda são da derivação v2.
- **O "Ambíguo" da tela vem da lógica lexical** (`keyword-dna-engine` → estado `ambiguous`), não da SERP. 49 intenções e 47 funis já estão conclusivos na Qualificação, mas aparecem "Ambíguo" porque falta a projeção `evidencia_serp` na linha. Das 49, 47 são da derivação v2.
- **A cobertura baixa está concentrada numa marca** (cobertura média 0,52; 510 de 1.068 itens da amostra sem leitura). Não há corpo guardado dessa marca para medir o efeito das regras novas.
- **Nas duas SERPs reais disponíveis**, a v4 muda o estado de 1 eixo em 4: a intenção de "skin care noturno", de mista para conclusiva. Nos outros três eixos, a v4 muda só a forma de concluir: por dominância, e não pelo reforço dos blocos.
- **As 4 lentes acrescentam 1 a 4 URLs distintas às 20 da canônica** (ESTIMADO, pela divergência medida de 0,061 e 0,174). O valor delas está em outro lugar: concordância entre aparelhos, blocos que só aparecem num aparelho e a divergência entre desktop e mobile.

## 2. Classificador v4 (`SERP_DERIVATION_VERSION = "serp-semantic-derivation-v4"`)

Os limiares não mudam: observados ≥ 5, cobertura ≥ 0,5, dominância ≥ 0,6, ou ≥ 0,5 com reforço ≥ 2. Empate continua misto.

- **R1 — palavra inteira.** O termo casa só como palavra inteira, depois da normalização. É higiene: sem efeito medido.
- **R2 — placar por campo.** Substitui a regra "o primeiro marcador que casa vence". O título pesa 2; snippet, descrição, pre/extended snippet e breadcrumb pesam 1. **Os tokens da URL pesam 0** (invariante 13: intenção não se promove por URL ou slug). A URL continua valendo só pelos sinais estruturais que já existem. Empate de placar segue a ordem atual: Local > Transacional > Comercial > Informativa. A amostra grava, por item, o placar que decidiu.
- **R4 — conteúdo em rede social.** Em host de rede social, caminho de conteúdo (`/reel/`, `/reels/`, `/p/`, `/tv/`, `/video/`, `/watch`, `/posts/`, `/pulse/`, `/status/`, `/shorts/`) não é perfil nem página de produto: cai na leitura de texto.
- **R5 — varejista no bloco de produtos.** Um orgânico sem marcador de texto, sem sinal editorial e sem data vira Transacional/BOFU quando o domínio registrável ou o `website_name` dele é **exatamente igual**, depois de normalizado, a um seller do bloco `popular_products` da mesma SERP. O sinal grava o seller que casou.
- **R6 — títulos de lista.** Título que começa com número seguido de substantivo de lista (passos, dicas, erros, etapas, formas, maneiras, motivos, cuidados) vira Informativa/TOFU.
- **R7 — pesos novos de bloco:**
  - `short_videos`, `top_stories` e `scholarly_articles`: Informativa/TOFU, peso 1;
  - `google_reviews`, `third_party_reviews`, `perspectives` e `discussions_and_forums`: registrados com **peso 0** até decisão do usuário.
- **R8 — URL distinta.** Os orgânicos são deduplicados por URL normalizada: host sem `www` e caminho sem barra final. Variantes de query não contam duas vezes.
- **Fora:** ampliar o vocabulário (na medição, derrubou a dominância). Só por decisão do usuário.
- **Versão nova da Qualificação só quando a leitura muda** (`AGENTS.md` §9).

## 3. Intenção e funil pelas 4 lentes

1. **Entrada.**
   - Lente canônica (desktop-windows): corpo podado, depth 20.
   - Lentes extras (desktop-macos, mobile-android, mobile-ios): **sempre o `organicDigest`**, montado do corpo em memória na coleta e lido do cache no acerto. É o mesmo caminho nos dois casos, para o resultado ser determinístico.
2. **`organicDigest` na observação do cache**, campo aditivo e opcional:
   - top 10, com todos os campos que o classificador lê (posição, url, domínio, título, snippet, descrição, pre/extended snippet, breadcrumb, `website_name`, data, `is_featured_snippet`, preço, nota, faq, tipo);
   - os sellers de `popular_products` e os tipos de bloco.
   - Tamanho a remedir; ~5 kB por lente, ESTIMADO. As lentes extras continuam sem corpo.
3. **Leitura por lente:** o classificador v4 lê o top 10 de cada lente e produz valor, força, cobertura e dominância por lente.
4. **Agregado:**
   - união dos orgânicos por URL normalizada (canônica com 20, extras com 10);
   - cada URL conta **uma vez**, com a máscara das lentes em que apareceu;
   - o rótulo da URL é a maioria entre as lentes que a leram;
   - os mesmos limiares.
5. **Blocos:** um tipo só reforça se aparecer em **2 ou mais lentes**. Bloco de uma lente só vira informação de aparelho ("Shopping só no mobile").
6. **Concordância entre lentes** (4/4, 3/4) é registrada e exibida, mas **não é reforço**: as lentes não são amostras independentes.
7. **`deviceSplit`** registra quando o agregado desktop difere do mobile. É sinal, nunca uma força nova.
8. **Lente faltante** fica registrada em `lensesMissing`. Com 1 de 4 lentes, o resultado equivale à leitura de uma lente.
9. **Datas:** lentes com mais de 7 dias de diferença são marcadas "lentes de datas diferentes", com recoleta paga **só por ação do usuário**. Nunca automática (`AGENTS.md` §7).
10. **Proveniência:** cada lente grava `collectedAt`, `providerRequestId` e `collectedBy`. O Minerador pode derivar de entrada coletada por outro módulo da mesma marca, mas a origem fica visível.

## 4. Persistência e contrato

- **Qualificação** (`schemaVersion` v1): ganha o bloco aditivo `lensEvidence`, com leitura por lente, concordância, `deviceSplit`, `lensesMissing` e datas.
  - Ausência do bloco significa Qualificação legada de uma lente.
  - `query.device` continua `desktop` e ganha `query.lenses`.
  - A amostra persiste os orgânicos distintos com máscara de lentes e placar.
  - Os parsers (`parseKeywordSemanticQualification`, `readSerpEvidenceRecord`, `invalidateSerpEvidence`) preservam os campos novos.
  - `repeatsCurrent` e `predatesCurrent` comparam o conjunto de fontes por lente.
- **`evidencia_serp` na linha:**
  - ganha o resumo das lentes (observadas, concordância por eixo);
  - ganha, por eixo misto, os dois rótulos principais e a cobertura, para a R9;
  - **teto de 700 B, fixado por teste** (a listagem lê a linha: R8 da SDD de egress).
- **R9 — rótulo:** quando a Qualificação vigente está mista com cobertura ≥ 0,5, a tela mostra **"Misto na SERP (A × B)"** em vez do "Ambíguo" da lógica. O valor canônico e a assinatura do pacote aprovado não mudam: a assinatura cobre `canonical.intent`, não o rótulo. Isso fica confirmado por teste.
- **Handoff ao Arquiteto:** mesma forma, mais um campo opcional `lenses`.

## 5. Governança

- **Aprovadas:** uma leitura v4 conclusiva diferente rebaixa para `em_revisao`, como já acontece hoje; nunca muda em silêncio.
- **Decisão humana:** a regra vigente põe a SERP conclusiva acima da decisão humana no leitor canônico (spec §58 A.2). Há 7 keywords com decisão humana de intenção. A dry-run lista "decisão humana superada pela SERP", e a tela sinaliza.
- **Sem chamada paga implícita:** a v4 lê o que a cobertura das 4 lentes já coleta.
- **Testes com fixtures e mocks:**
  - equivalência entre coleta e acerto de cache;
  - teto de 700 B;
  - assinatura do pacote aprovado inalterada;
  - bloco em uma lente não fecha eixo;
  - empate continua misto;
  - parsers preservam os campos novos.

## 6. Fora deste adendo (ondas seguintes)

- **Backfill de `evidencia_serp` (Onda 0):** decisão do usuário. Rodar agora projeta leituras v2 e causa dupla rotatividade de aprovações. Recomendado: depois da v4 e de uma recoleta.
- **Recoleta das 134 keywords:** ~US$ 4,2 a 4,8 com allintitle e KD. Só por ação do usuário.
- **Arquiteto nas 4 lentes (onda 2):** coletores da lente canônica gravando em depth 20, para a CALL 3 não pagar de novo.
- **Radar (onda 3):** SDD própria. O `serpStanding` é calculado uma vez no FINALIZE, e o "Atualizar SERP" é recusado depois do congelamento.
- **YouTube e Amazon:** medir device antes de qualquer adoção.
- **Sinal `search_intent_info` do DataForSEO Labs:** já pago e hoje excluído do caminho canônico. Decidir se entra como corroboração registrada.

## 7. Estado

Autorizado pelo usuário quanto à direção. **Implementado e confirmado por teste em 2026-09-23. Validação manual pendente.** Ajustes pedidos pelo usuário entram como revisão deste adendo. A regra permanente foi registrada na §77 da [spec](../spec.md).

## 8. Revisão de implementação — 2026-09-23

Cada etapa teve implementação, dois revisores adversariais e correção. Nenhuma chamada paga, migration ou escrita remota.

**Onde o código diverge do texto acima, e por quê:**

| Item | Texto do adendo | Implementado | Motivo |
| --- | --- | --- | --- |
| R1 | palavra inteira | palavra inteira **com plural simples** (s/es); termo que a v3 escrevia exato ("kit ", "vs ") segue exato | a palavra inteira pura perdia "preços", "reviews", "ofertas", que a v3 lia; o alvo era só não casar "melhor" em "melhorar" |
| R2 | breadcrumb pesa 1 | só o **rótulo humano** do breadcrumb pesa 1; o trecho que repete host e caminho pesa 0 | no desktop, o breadcrumb da DataForSEO repete a URL: pesar 1 fazia o slug decidir (invariante 13; achado dos dois revisores) |
| R2 | placar por campo | um voto por campo e por rótulo; descrição ou snippet é um campo só | repetir termo não compra peso |
| R5 | domínio registrável | nome do domínio registrável sem o sufixo público (lista fechada de sufixos de 2 níveis), chave mínima de 3 caracteres | igualdade continua exata |
| R6 | vira Informativa/TOFU | **preenche** o eixo vazio; não sobrepõe o texto | "5 erros ao comprar sérum" continua Transacional. Sobrepor é decisão do usuário |
| R8 | query descartada | em `/watch` o parâmetro `v` é mantido (fechado por host) | a regra literal fundia dois vídeos diferentes do YouTube na SERP real |
| Digest | na observação | chave própria `payload.digest`, com modo de leitura `digest` | o modo `observation` da SERP por keyword do Arquiteto não passou a baixar o digest (teste) |
| Digest | nas extras | em toda lente não canônica, inclusive quando quem coleta é o Arquiteto | senão, entradas do Arquiteto nunca serviriam ao Minerador |
| `evidencia_serp` | `{observadas, concordancia}` | `lentes: {lidas, intent, funnel}` | o formato aninhado mediu 713 B no pior caso; o plano mede 693 de 700. A invalidação com motivo tem teto próprio de 700 + 300 B |
| Blocos | reforço com ≥ 2 lentes | com 1 lente lida, reforça como antes; nas extras, só os blocos do top 10 | equivalência com a leitura de uma lente |
| R9 | rótulo no lugar de "Ambíguo" | só onde a tela mostraria "Ambíguo"; "Pendente" e "Indeterminado" não mudam | — |

**Medido** (offline, nas duas SERPs reais disponíveis, ambas desktop-windows de skincare):
- **v3 → v4:** 1 eixo em 4 muda de estado. A intenção de "skin care noturno" vai de mista (0,40) para conclusiva por dominância (0,80). "skincare facial" continua conclusiva nos dois eixos, pelo reforço do PAA.
- **4 lentes, cenários SINTÉTICOS** (não há SERP real mobile nem macOS):
  - URLs novas na união podem fechar eixo misto: 0,50 → 0,615;
  - desktop informativo × mobile transacional abre um eixo que estava fechado;
  - um bloco visto só na canônica deixa de reforçar.
- **Tamanhos:**
  - digest de 2,8 a 5,7 kB por lente extra;
  - Qualificação de ~3,7 kB (vigentes) para 6,6 a 9,2 kB;
  - `evidencia_serp` de 559 a 693 B.
- **Vigentes hoje:** 134 (100 v2, 34 v3, 0 v4), 0 entradas no cache. **Nada muda até uma execução de Resultados.**

**Efeitos na próxima execução de Resultados** (ativação imediata):
- **Versões:** toda keyword processada ganha versão nova da Qualificação, também no acerto de cache, e a `evidencia_serp` é regravada. As 103 linhas sem projeção passam a ter uma.
- **Aprovadas com assinatura v1 (29):** a v1 cobre o `analise_semantica` inteiro, então **a primeira gravação da projeção as leva a `em_revisao`**, qualquer que seja a leitura. Isso já existia (§63) e coincide com a ativação. O backfill existente re-assina v1 → v2 as que ainda batem, antes de projetar.
- **Aprovadas por reforço:** 23 intenções e 14 funis conclusivos só pelo reforço (9 e 8 em aprovadas) ficam expostos à regra de bloco em ≥ 2 lentes.
- **Decisões humanas:** 7 decisões humanas de intenção (2 em aprovadas), hoje todas sobre leitura não conclusiva. Uma leitura v4 conclusiva passa por cima delas, pela §63 (`HUMAN_CAN_OVERRIDE_VALID_CONCLUSIVE_SERP = NO`).
- **Egress:** a reexecução em cache lê o digest das 3 extras, ~18 kB por alvo, ~3,6 MB por lista de 200 (ESTIMADO). A coleta nova não tem egress extra.

**Pendente:**
- dry-run de aprovadas que rebaixariam e sinal na tela de "decisão humana superada pela SERP" (§5);
- enxugar a resposta da rota (a amostra inteira vai ao navegador, ~+2 kB por alvo);
- mostrar as lentes nas telas do Arquiteto (o handoff já leva `lenses`);
- ler o digest só depois da quota;
- fixtures reais mobile e macOS (3 chamadas pagas, por autorização).
