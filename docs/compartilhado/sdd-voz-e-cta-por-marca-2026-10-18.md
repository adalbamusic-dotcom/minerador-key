# SDD — Voz e CTA por marca: regras gerais + nicho da marca — 2026-10-18

> **Status: APROVADA (dono, 2026-10-18).** Direção e escopo. Na segunda rodada de perguntas, o dono escolheu "Seguir as recomendações" e, para as plantas gravadas, "Trocar o CTA na leitura":
> - Ficam globais também K8/K9, de 3 a 6 H2, imagens, links, fontes externas e o fechamento com um CTA só.
> - Sem Skill, vale o CTA neutro "Quer dar o próximo passo? Fale com a equipe da {marca}.".
> - O CTA sai do segmento da Skill pela keyword. A conferência aceita "Consultar", "Comparar" e "Ver".
> - Nada de troca manual do CTA no artigo: o ajuste é na Skill.
> - A V2 só vai ao ar depois que o dono aplicar a Skill v2 da AdalbaPro.
> - Nas plantas gravadas, na leitura e sem IA, só o texto padrão antigo literal é trocado pelo CTA escolhido. O resto se corrige com "Organizar de novo", quando o dono quiser.
> O dono escolheu a direção ("Regras gerais + nicho da marca", §1). O coordenador
> apresenta o escopo (§9) e as perguntas (§12) antes de qualquer código.
>
> Escrita sem código de produção, sem escrita no banco e sem chamada paga. Leitura
> remota só por `SELECT` (`npx supabase db query --linked -f`), em 2026-10-18.
> Commit, push, deploy, migration e SQL de escrita são do dono (`AGENTS.md` §15).
>
> **Módulo proprietário:** Radar (diretriz de voz, artigo-modelo, CSV "Para
> escrever", CSV de vídeo). Mudanças aditivas nos consumidores: Marca (proposta de
> texto no painel da Skill, como a D8 já faz), Redator (prompts), MCP e catálogo
> (`AGENTS.md` §4 e §17.1).
>
> **Esta SDD muda entregáveis protegidos pelo E0** por decisão do dono registrada
> aqui (§1). O E0 muda só nas chaves que a fase listar (D14 da SDD do Silo
> interligado; §7 desta).
>
> **Linhas citadas:** lidas em 2026-10-18. Outras frentes estão editando
> `lib/radar/**` agora; as linhas podem andar. A âncora é sempre o símbolo ou a frase
> citada.

## 0. Resumo para o dono

- **O defeito.** A diretriz de voz (2026-10-11) foi escrita com os exemplos da
  AdalbaPro (clínica, agência, "posts, feed, anúncio", "busca orgânica", "estrutura
  própria no Google"). Esses exemplos estão fixos no código e entram em **todo**
  entregável de **toda** marca. Por isso o CSV da WifiConecta saiu com texto de
  clínica e agência.
- **O CTA errado.** A Skill da WifiConecta não tem seção com "diagnóstico" no título.
  O código então usa o texto padrão "Peça um diagnóstico: olhamos como o seu negócio
  aparece hoje na busca…", que é texto de agência de SEO. 4 das 6 plantas aprovadas
  da WifiConecta gravaram esse texto.
- **A correção, na mesma linha** (nada paralelo, `AGENTS.md` §0.1):
  - ficam globais só as regras universais (§4.1);
  - exemplos de nicho, o conteúdo do fechamento em 4 tempos e o CTA vêm da Skill de
    voz de cada marca (§4.2);
  - o CTA da WifiConecta sai do segmento da Skill que casa com a intenção do artigo
    (§4.4);
  - sem a seção na Skill, o texto padrão é **neutro**, de nenhuma marca, e o painel
    da Marca propõe a seção que falta (§4.3).
- **A AdalbaPro não muda.** Os textos dela saem do código e vão para a Skill dela.
  Quem aplica o texto na Skill é o dono; o código nunca escreve a Skill (§5).
- **Nenhuma rota, botão, etapa ou painel novo.** Os mesmos núcleos e os mesmos
  botões: "Organizar o artigo-modelo", "Exportar CSV", Redator, MCP.

## 1. Decisão do dono (2026-10-18)

**DECIDIDO pelo dono em 2026-10-18. Escolha literal: "Regras gerais + nicho da
marca".**

Contexto apresentado ao dono: o CSV "para escrever" de um artigo da WifiConecta
(provedor de internet em São Paulo) saiu com texto de agência e clínica e com o CTA
errado.

O que a escolha significa, como o coordenador apresentou:

- Ficam globais só as regras universais da diretriz de comunicação humana
  (2026-10-11): voz humana, ritmo, sem FAQ, regras de keyword K1–K7, trava de fonte e
  entregável concluído.
- Os exemplos de nicho, o conteúdo do fechamento em 4 tempos e o CTA vêm da Skill de
  voz de cada marca (`brand_voice`).
- A WifiConecta usa o CTA do segmento da Skill que casa com a intenção do artigo.
  A Skill dela lista um CTA por segmento. Exemplos: Segmento E "Precisa contratar
  logo" → "Consultar cobertura agora"; A → "Consultar ofertas para meu CEP"; B →
  "Comparar planos disponíveis"; C → "Ver combos disponíveis"; D → "Verificar
  cobertura de fibra".
- A AdalbaPro mantém os exemplos de clínica e agência, dentro da Skill DELA.

Esta decisão **substitui**, a partir da fase V2 (§9):

- o Adendo G da SDD `docs/05-radar/sdd-diretriz-editorial-pela-serp-2026-10-02.md`
  onde ele torna os exemplos globais;
- o "texto padrão neutro" da D8 da SDD
  `docs/compartilhado/sdd-silo-interligado-seo-semantico-2026-10-14.md` §9.2/§16. Esse
  texto era neutro só no nome: falava de "como o seu negócio aparece hoje na busca".

Os documentos antigos ganham a marca **SUBSTITUÍDO (2026-10-18)** na mesma entrega da
fase (`AGENTS.md` §0.5).

## 2. O caso real (verificado)

Leitura remota de 2026-10-18, só `SELECT`. **Verificado (banco).**

- **Skill `brand_voice` da WifiConecta:** v1, estado `draft` (é a corrente para
  `resolveBrandSkill`), com 15 seções. Os títulos vêm com negrito e ponto escapado,
  por exemplo `**4\. Segmentos prioritários**`. Nenhum título fala de
  "diagnóstico".
- **Seção "4. Segmentos prioritários":** subtítulos `### **Segmento A — Econômico**`.
  Cada segmento tem os campos **Intenção**, **Buscas indicativas** (lista),
  **Dor dominante**, **Mensagem**, **Exemplo** e **CTA**:
  - A → "Consultar ofertas para meu CEP";
  - B → "Comparar planos disponíveis";
  - C → "Ver combos disponíveis";
  - D → "Verificar cobertura de fibra";
  - E começa ("Precisa contratar logo", "encontrar serviço disponível no
    endereço"), mas a leitura cortou o corpo em 2.500 caracteres. O CTA de E
    ("Consultar cobertura agora") é **relatado pelo dono**.
- **Outras seções da Skill:** "5. Particularidades de São Paulo" (cobertura por CEP;
  não presumir oferta em toda a capital) e "10. Jornada de conversão".
- **Skill `brand_voice` da AdalbaPro:** v1 `draft`, 16 seções ("4. Voz: firme,
  humana e provocadora", "11. Construção do artigo e transição comercial"…).
  **Também não tem "Oferta de diagnóstico".** Hoje a AdalbaPro usa o mesmo texto
  padrão.
- **Plantas do artigo-modelo (`radar_article_blueprints`):**

  | Marca | Estado | Versões | Artigos | Com o texto padrão antigo em `closing.diagnosis` e `closing.cta` |
  |---|---|---:|---:|---:|
  | WifiConecta | APPROVED | 6 | 6 | 4 |
  | AdalbaPro | APPROVED | 33 | 9 | 0 |
  | AdalbaPro | DRAFT | 5 | 1 | 0 |

- **A cadeia do CTA errado (Verificado no código):** nenhuma seção casa com
  `/\bdiagnostic[oa]s?\b/` (`lib/marca/brand-diagnosis-offer.ts:26`). Então
  `radarDiagnosisOfferOf` devolve `BRAND_DIAGNOSIS_OFFER_DEFAULT`
  (`lib/radar/brand-edge.ts:123-126`; `lib/marca/brand-diagnosis-offer.ts:35-36`).
  Na conclusão, a conferência troca o diagnóstico por esse texto
  (`lib/radar/article-blueprint.ts`, bloco "diagnosticoFalho", ~:4606-4610).
  Detalhe agravante: "Consultar", "Comparar" e "Ver" não estão no verbo de
  verificação (`VERIFICA`, `brand-edge.ts:64`). Mesmo um CTA certo da WifiConecta
  seria apontado como "o diagnóstico não diz o que a marca verifica" e trocado
  pelo texto padrão.

## 3. Contrato atual (verificado no código)

### 3.1 Onde o nicho está fixo

| Onde | O que diz (nicho da AdalbaPro) |
|---|---|
| `lib/radar/human-voice-guideline.ts:137-210` `RADAR_HUMAN_VOICE_RULES` | Exemplos e "como" de clínica e agência: "agência genérica de posts e anúncios e da vida refém do feed" (:150); "situação observável da clínica" (:158); "o marketing que te venderam para clínicas de estética" (:167); "no consultório", "Atendi 300 pacientes" (:181-184); anúncio de saúde e estética (:190-192); "dado real da clínica" (:197); níveis 3 e 2 com "posts, feed, anúncio, agência" e "busca orgânica… site, páginas de serviço, Perfil da Empresa" (:205-207). |
| `human-voice-guideline.ts:217-294` `RADAR_HUMAN_VOICE_SERP_RULES` | Exemplos "Captação de pacientes para dentista" em título, meta e início (:224-242); "autoridade-local" inteira (:253-258); "fechamento" ("estrutura própria no Google", "Eu olho seu site, seu perfil no Google…", :262-267); exemplos de "ressalvas" (:275-276). |
| `human-voice-guideline.ts:305-306` `RADAR_HUMAN_VOICE_CORE` | "posts, feed, anúncio e agência", "a busca orgânica explicada sem sigla, com a estrutura própria no Google", "anunciar saúde e estética", "dado real da clínica". |
| `human-voice-guideline.ts:314-315` `RADAR_HUMAN_VOICE_SERP_SUMMARY` | "sinais de autoridade local (site como captação local, …, diferença para a agência comum)"; "fechamento em 4 tempos (dor, estrutura própria no Google, facilidade, diagnóstico)". |
| `human-voice-guideline.ts:318-331` | `RADAR_HUMAN_VOICE_CLOSING_STEPS` e `RADAR_HUMAN_VOICE_LOCAL_AUTHORITY`, inteiros de nicho. |
| `human-voice-guideline.ts:111-112` `RADAR_CLOSING_SPECIALIST_RULE` | "o CTA único é o diagnóstico". |
| `human-voice-guideline.ts:341-347` `radarHumanVoicePromptBlock` | Regras 27 e 28 do pedido: "closing.structureShift (a mudança para a estrutura própria no Google)", "closing.diagnosis (o diagnóstico… o que a marca verifica)". |
| `human-voice-guideline.ts:361-370` | `radarHumanVoiceRedatorRule` (4 tempos e autoridade local de nicho) e `radarHumanVoiceVideoRule` ("o diagnóstico como CTA único"). |
| `lib/marca/brand-diagnosis-offer.ts:35-52` | `BRAND_DIAGNOSIS_OFFER_DEFAULT` e `BRAND_DIAGNOSIS_OFFER_PROPOSAL` ("seu perfil no Google e as perguntas que mais chegam na recepção"). |
| `lib/radar/brand-edge.ts:46, 64, 104` | `vsGeneric` = "contraste com a agência de posts e anúncios"; o verbo de verificação como exigência de todo CTA; a mensagem "olho seu site, seu perfil no Google…". |
| `lib/radar/article-blueprint.ts` (pedido de sistema) | Regra 24: "nunca 'clínicas … e pacientes que procuram ofertas'", "sites de cupom: o que a clínica ganha e perde". Regra 30: "uma página por tratamento com as perguntas da recepção… isso tem nome: Silo", "vsGeneric: o contraste com a agência de posts e anúncios", "o diagnóstico parte da 'Oferta de diagnóstico' do pacote". |
| `article-blueprint.ts:2023-2026` (pedido do usuário) | Bloco "# Oferta de diagnóstico (o CTA único, regra 30)". |
| `article-blueprint.ts` (leitura para o CSV, ~:5976-6005) | "- Contra o genérico (agência de posts e anúncios)"; "para quem já tentou posts, feed, anúncio e agência (nível 3)"; "a virada e o fim explicam a busca orgânica sem sigla (nível 2)". |
| `lib/redator/deliverable-seed.ts:182` | `CTA_DO_CARROSSEL` = "o CTA do artigo-modelo (o diagnóstico), a única chamada". |

### 3.2 Por onde a diretriz e a oferta viajam (consumidores)

- **Artigo-modelo:**
  - `article-blueprint.ts:1909` `...radarHumanVoicePromptBlock()`;
  - `:1755` `brief.diagnosisOffer = radarDiagnosisOfferOf(input.brandVoice.sections)`;
  - `:2014-2019` os trechos da Skill por assunto ("# Voz da marca — Skill …");
  - conferência ~:4597-4617; leitura da planta gravada ~:5395-5399.
- **CSV "Para escrever":**
  - `lib/radar/portable-writing-batch.ts:139` (`brandDiagnosisOffer`);
  - `lib/radar/portable-writing-export.ts:322, 3828` (`diagnosisOffer`);
  - `:3864-3882` `RADAR_WRITING_GENERAL_RULES`; a regra 12 é `radarHumanVoiceWritingRule()`;
  - `:4052` a linha "Voz da marca" (`radarHumanVoiceBrandVoiceRowNote`).
- **CSV de vídeo:** `lib/radar/portable-video-export.ts:3759, 3777, 3856`.
- **Material da linha do CSV:** `lib/radar/portable-writing-material.ts:143, 203-207`.
  Lê o CSV por **prefixo de rótulo**: "- Mudança para a estrutura própria: ",
  "CTA (a única chamada) — diagnóstico: ", "- Oferta de diagnóstico da Skill de voz
  da Marca (D8): ". Ele alimenta o Redator, o CSV de vídeo e `get_writer_brief`.
- **Redator:**
  - `lib/redator/prompts.ts:7, 132` (`HUMAN_VOICE_RULE`, constante de módulo, igual
    para toda marca);
  - `lib/server/writer-evidence-reader.ts:456-477` (a Skill corrente já vai como
    fundamento) e `:810`;
  - `lib/redator/deliverable-seed.ts:182, 392`.
- **MCP:**
  - `app/api/mcp/redator/route.ts:34, 130`;
  - `lib/agent/platform-catalog.ts:32, 1261` (`radarHumanVoiceCatalogNote`) e a nota
    F3 (~:1273);
  - `get_article_for_writing` e `get_video_material` entregam o material do CSV.
- **Marca:** `modules/marca/brand-skill-editor.tsx:9, 64, 209`. A proposta da D8
  aparece no bloco "Estrutura reconhecida" quando a `brand_voice` não tem seção de
  diagnóstico.
- **Régua de seções da Skill:** `lib/radar/brand-voice.ts:52-85`. Hoje "Segmentos
  prioritários" e "Jornada de conversão" caem no assunto `voice` (nenhum casa). A
  Skill vai inteira, mas nada lê o CTA de cada segmento.

### 3.3 O que já está certo e fica

A Skill corrente **já chega inteira** à IA em três lugares:

- no pedido do artigo-modelo, por trechos de assunto;
- na linha "Voz da marca" dos dois CSVs;
- nos fundamentos do Redator.

O defeito é, sobretudo, **subtrativo**: o texto global põe os exemplos de outra marca
por cima. E a precedência diz que "onde a Skill suaviza o tom, vale a diretriz"
(`RADAR_HUMAN_VOICE_PRECEDENCE`, `:309-310`).

## 4. Proposta

### 4.1 O que fica global (lista exata)

**Da escolha do dono (literal no §1):**

- **G1 — Voz humana**, como princípio, sem exemplo de nicho:
  - a SERP manda no conteúdo e a voz na forma;
  - sem eufemismo;
  - emoção que a leitora reconhece;
  - ironia contra a situação, nunca contra a leitora;
  - primeira pessoa só de quem assina, com relato delimitado.
- **G2 — Ritmo de fala, texto correto**, sem erro proposital
  (`RADAR_HUMAN_VOICE_INTENTIONAL_ERRORS = false`).
- **G3 — Sem FAQ** (`AGENTS.md` §13; regra geral 2 do CSV).
- **G4 — Keyword K1–K7:**
  - forma natural;
  - a principal uma vez no H1 e no SEO title, abrindo no máximo 1 das 3 opções;
  - 3 ângulos;
  - meta natural;
  - abertura nas ~100 primeiras palavras;
  - nenhum H2 abre pela keyword;
  - teto de 2 + palavras/600 e as variações da SERP.
- **G5 — Trava de fonte:**
  - `pending-claims.ts` e a regra 5;
  - a ressalva uma vez, onde a afirmação está;
  - escassez e urgência só com dado real **da marca** (a palavra "clínica" sai).
- **G6 — Entregável concluído** (D10).

**Regras da plataforma que não têm nicho.** Recomenda-se que continuem globais; o dono
confirma (§12, Q1):

- K8 (sem marca de processo) e K9 (sem isca);
- Regra 8 (3 a 6 H2);
- imagens (capa e 2 ou 3 respiros, `AGENTS.md` §13);
- links internos reais com âncora natural;
- fontes externas de autoridade (2026-10-14c);
- a **forma** do fechamento: 4 campos (dor → mudança → facilidade, quem faz é a marca
  → CTA) e **um CTA só**;
- o **arco de consciência como princípio neutro**: começa em quem já tentou o que é
  comum no nicho e termina explicando, sem jargão, a solução que a marca oferece.

A precedência global (`RADAR_HUMAN_VOICE_PRECEDENCE`) continua: a SERP manda na
substância; a Skill vale onde protege fato, oferta, preço, credencial ou dignidade.

### 4.2 O que vem da Skill de cada marca (nicho)

| Item | Hoje (global, da AdalbaPro) | Depois |
|---|---|---|
| N1 · exemplos de voz (bom/ruim) | `RULES` e `SERP_RULES` (good/bad/how) | da Skill (trechos de sempre). O global fica sem exemplo de domínio ou com exemplo abstrato ("três opções que começam pelas mesmas palavras"). |
| N2 · o que a leitora já tentou (nível 3) e a solução (nível 2) | "posts, feed, anúncio e agência" / "busca orgânica, estrutura própria no Google" | da Skill; sem ela, o princípio neutro do §4.1. |
| N3 · contraste com o genérico (`brandEdge.vsGeneric`) | "agência de posts e anúncios" | o rótulo vira "contraste com a oferta genérica que o topo da SERP mostra"; quem é o genérico vem da Skill e da SERP. |
| N4 · sinais de autoridade | `RADAR_HUMAN_VOICE_LOCAL_AUTHORITY` | da Skill; sem ela, "2 ou 3 sinais que a marca sustenta (o que ela verifica, faz ou mede), onde o trecho pedir". |
| N5 · conteúdo do fechamento em 4 tempos | `RADAR_HUMAN_VOICE_CLOSING_STEPS` | os 4 campos ficam (§4.5), com rótulos neutros; o conteúdo vem da Skill. |
| N6 · CTA | `BRAND_DIAGNOSIS_OFFER_DEFAULT` | da Skill, pela ordem do §4.4; sem ela, o neutro do §4.3. |
| N7 · restrições do nicho | "anunciar saúde e estética = dificuldade, não proibição" | da Skill (a da AdalbaPro passa a dizer; a da WifiConecta já diz "não garantir ausência de quedas…"). |

### 4.3 Como a Skill entrega, e o neutro quando falta

**A mesma régua de seções.** Não nasce leitor novo: `lib/radar/brand-voice.ts`
(`radarBrandVoiceSlotOf` e vizinhos) ganha as leituras abaixo. O título é limpo de
negrito, ponto escapado e numeração ("`**4\. Segmentos prioritários**`" →
"Segmentos prioritários").

1. **CTA por segmento.** É a seção cujo corpo traz blocos "Segmento <id> — <nome>",
   cada um com uma linha "CTA:". Do segmento, o leitor tira:
   - `id` e `nome`;
   - `intencao` (linha "Intenção:");
   - `buscas` (itens de "Buscas indicativas:");
   - `dor` ("Dor dominante:");
   - `cta` (o texto entre aspas de "CTA:").
2. **CTA único da marca.** É a seção "Oferta de diagnóstico" (D8, régua de hoje,
   `brand-diagnosis-offer.ts:26, 60-71`) ou uma seção "CTA" / "Chamada" de uma frase.
3. **Fechamento, contraste e sinais de autoridade:** continuam como trechos da Skill
   por assunto (`structure`, `reader`, `voice`), como hoje. Não há parse fino; a IA
   lê o texto da marca.

**Neutro quando falta.** Vale quando a Skill não tem nem segmento com CTA nem CTA
único, ou quando a marca não tem Skill:

- **CTA neutro proposto** (texto a aprovar pelo dono, §12 Q2): "Quer dar o próximo
  passo? Fale com a equipe da {nome da marca}."
  - Não tem preço, prazo, garantia nem serviço que a marca não declarou.
  - Não cita nenhum nicho.
  - Passa na régua de uma chamada só (`radarClosingCalls`).
- **Rótulos neutros** dos 4 campos e das linhas do CSV (§4.5).
- **O painel da Marca** (o mesmo bloco "Estrutura reconhecida" da D8,
  `brand-skill-editor.tsx:209`) mostra a **proposta de texto** da seção que falta:
  "CTA por intenção", com o molde de segmento (Intenção / Buscas indicativas / Dor /
  CTA). O dono aplica. **O código nunca escreve a Skill.** Nenhum botão novo: é a
  mesma proposta só de leitura que a D8 já mostra.

### 4.4 Regra intenção → segmento (pura, sem IA)

Entrada: a principal, as complementares e o funil e a intenção declarados do
artigo, já no pacote. Sai um CTA e o motivo.

1. **Casamento pelas buscas indicativas.** Para cada segmento, conta-se a maior
   sobreposição de palavras de conteúdo entre a principal e cada busca indicativa.
   A régua é a da keyword, sem funcionais e com plural simples (`conteudoDe` /
   `singular` de `human-voice-guideline.ts:385-395, 500`). As complementares só
   desempatam.
2. **Mínimo para casar:** pelo menos 2 palavras de conteúdo **e** pelo menos metade
   das palavras de conteúdo da principal.
3. **Desempate:**
   - primeiro, a "Intenção" do segmento contra o funil e a intenção declarados, por
     um mapa pequeno e fixo:
     - transacional ou local → contratar, disponível, endereço, CEP, cobertura;
     - investigação comercial → comparar, melhor, custo-benefício, qual;
     - informacional → entender, explicar, como;
   - depois, a ordem da Skill.
4. **Sem casamento:** vale o CTA único da Skill (§4.3 item 2); sem ele, o neutro.
5. **O que fica gravado:**
   - a planta grava o CTA escolhido em `closing.diagnosis`, o campo de sempre (sem
     campo novo no payload);
   - a nota do painel, o CSV e o MCP dizem a origem, como instrução concluída (D10).
     Exemplo: "CTA do Segmento B — Comparador da Skill: a busca indicativa 'Melhor
     plano de internet residencial' casa 3 de 3 palavras de 'planos de internet
     residencial'".

**Ilustração** (a fixture prova, §8; não é decisão): o Pilar "planos de internet
residencial" casa B (plano, internet, residencial = 3 de 3) acima de A ("Planos de
internet baratos" = 2 de 3) → "Comparar planos disponíveis".

### 4.5 A régua do fechamento (`brand-edge.ts`)

**Fica global:**

- os 4 campos preenchidos;
- a facilidade diz quem faz (eu, nós, a equipe ou o nome da marca:
  `radarClosingEaseNamesDoer`);
- **uma chamada só** (`radarClosingCalls` ≤ 1);
- nenhuma chamada fora do CTA.

**Vira regra do nicho:** o "verbo de verificação" (`VERIFICA`) só é exigido quando o
CTA vem da "Oferta de diagnóstico". É o caso da AdalbaPro, pela Skill dela. Com CTA
de segmento ou neutro, a conferência pede que `closing.diagnosis` **contenha o CTA
escolhido** e faça uma chamada só.

**Na conclusão** (`opcoes.close`), o campo falho vira o CTA escolhido pelo §4.4
(substitui a troca pelo texto padrão, ~:4606-4610).

**Chaves sem mudança no payload:** `pain`, `structureShift`, `ease` e `diagnosis`
continuam (compatibilidade do esquema). Mudam os **rótulos ditos**:

| Hoje | Depois |
|---|---|
| "Mudança para a estrutura própria" | "Mudança (o que a solução da marca muda)" |
| "Facilidade (quem faz é a marca)" | igual |
| "Diagnóstico (CTA único)" | "CTA único" |
| "CTA (a única chamada) — diagnóstico: " | "CTA (a única chamada): " |
| "- Oferta de diagnóstico da Skill de voz da Marca (D8): " | "- CTA da Skill de voz da Marca (<origem>): " |

`portable-writing-material.ts` muda **na mesma entrega** que lê os rótulos novos.
O CSV é montado na hora e nada relê um CSV gravado, então não há dupla leitura.

### 4.6 Plantas já gravadas

- **Leitura sem IA**, sem mudar o payload nem o hash, como a D6. Quando
  `closing.diagnosis` ou `closing.cta` é **literalmente** o texto padrão antigo, o
  CSV, o MCP e o material do Redator dizem o CTA escolhido hoje pelo §4.4, marcado
  "o texto padrão antigo saiu (SUBSTITUÍDO 2026-10-18)".
  - Isso afeta 4 plantas da WifiConecta e nenhuma da AdalbaPro (SELECT do §2).
  - O texto padrão foi uma queda automática do sistema, não decisão humana. O CTA
    escrito por gente ou pela IA e aprovado **não muda** (`AGENTS.md` §9).
- **Os outros campos dessas plantas** foram escritos sob o pedido com nicho da
  AdalbaPro ("estrutura própria no Google" na mudança, por exemplo). A leitura não
  os corrige sem IA. Recomendação: "Organizar de novo (IA)" nos 6 artigos da
  WifiConecta, pelo botão de sempre, com até 2 chamadas de IA por artigo. A decisão
  é do dono (§11).

### 4.7 Versões das regras

Mudam as datas, porque mudou regra:

- `RADAR_HUMAN_VOICE_GUIDELINE_VERSION` "2026-10-11" → "2026-10-18";
- `RADAR_CLOSING_RULES_VERSION` "2026-10-14b" → "2026-10-18";
- `RADAR_ARTICLE_BLUEPRINT_RULES_VERSION`.

A nota do catálogo (`radarHumanVoiceCatalogNote`) diz a mudança (`AGENTS.md` §17.1).

## 5. Migração da AdalbaPro (comportamento igual)

1. **Inventário dos textos que saem do global.** Cada frase de nicho do §3.1 vira uma
   linha numa fixture (`tests/fixtures/voz-nicho-adalbapro-2026-10-18.md`, nome a
   confirmar). É a prova do que saiu.
2. **Proposta da Skill v2 da AdalbaPro.** Sai no mesmo bloco do painel da Marca (D8),
   com as seções e o texto **literal** de hoje:
   - "Exemplos de voz";
   - "Consciência: o que a leitora já tentou e a solução";
   - "Contraste com o genérico" ("agência de posts e anúncios");
   - "Sinais de autoridade local" (os 4 de hoje);
   - "Fechamento em 4 tempos" (os passos de hoje);
   - "Restrição: anúncio de saúde e estética";
   - "Oferta de diagnóstico", com `BRAND_DIAGNOSIS_OFFER_DEFAULT` palavra por palavra.
     Assim a AdalbaPro continua com o mesmo CTA e com o verbo de verificação ativo.
3. **O dono aplica a Skill v2 na Marca**, numa versão nova pelo fluxo de sempre. O
   código não escreve a Skill.
4. **Portão:** a fase V2 (§9) só vai ao ar depois da Skill v2 da AdalbaPro aplicada.
   Se for antes, a AdalbaPro cai no neutro até a aplicação; o dono decide (§12 Q3).
5. **Paridade, por conteúdo e não byte a byte.** Com a fixture da Skill v2, o pedido,
   o CSV, o vídeo e o Redator da AdalbaPro precisam ter:
   - cada frase do inventário, uma vez (agora vinda da Skill);
   - o mesmo CTA;
   - a mesma conferência do diagnóstico.

   O arquivo inteiro não fica byte a byte igual: as frases mudam de lugar (da regra
   geral para "Voz da marca" e os trechos do pedido). Isso é dito, não escondido.

## 6. Riscos

| # | Risco | Mitigação |
|---|---|---|
| R1 | A AdalbaPro perde força se a Skill v2 não estiver aplicada no deploy | portão do §5.4; teste de paridade |
| R2 | Sem os exemplos globais, a voz fica mais fraca nas marcas com Skill rasa | a precedência global fica; o painel propõe as seções que faltam |
| R3 | O parser quebra no formato real (negrito, `\.`, `### **Segmento…**`) | fixture com o formato real dos títulos e campos (anonimizada onde preciso) |
| R4 | O segmento escolhido não é o certo | mínimo do §4.4, motivo dito no CSV, e o dono ajusta as "Buscas indicativas" da Skill |
| R5 | Muitas chaves do E0 mudam de uma vez | fase própria no `FASES_DO_E0`; o teste de escopo barra chave fora da lista |
| R6 | O pedido muda de tamanho | sai texto, então tende a encolher (bom para o corte de 2026-10-18); o guarda de tamanho (`tests/radar-artigo-modelo-saida-curta-2026-10-18.test.mts`) roda |
| R7 | Os rótulos do CSV mudam e o material do Redator e do vídeo deixa de ler | o parser muda junto; teste de ida e volta (CSV → material) |
| R8 | Os testes que fixam frases de nicho (`tests/radar-voz-humana-serp-2026-10-11.test.mts:309, 561-563`; `tests/radar-analise-competitiva-f3-2026-10-14.test.mts:213, 337-338, 361-378`) | reescritos para a regra nova, marcados SUBSTITUÍDO, nunca apagados em silêncio (`AGENTS.md` §0.5) |
| R9 | Outras frentes editam `lib/radar/**` agora | implementar depois que elas fecharem; âncoras por símbolo |
| R10 | Plantas gravadas com texto de nicho em outros campos | §4.6: leitura para o CTA; "Organizar de novo" é decisão do dono |

## 7. Compatibilidade, E0 e rollback

**Payload, rota e botão:**

- Nada muda no esquema da planta: as mesmas chaves de `closing` e de `brandEdge`.
- Nenhuma rota, nenhum botão, nenhuma etapa.
- O que muda é texto do pedido, dos CSVs, do Redator e do catálogo, e a fonte do CTA.

**E0.** Entra uma fase nova no `FASES_DO_E0`
(`tests/radar-entregaveis-escopo-2026-10-14.test.mts:46-130`), "F-V · voz e CTA por
marca (2026-10-18)", com a frase do §1 e as chaves exatas que a fase mudar.

- **Candidatas:**
  - `voz-humana/diretriz` e `voz-humana/textos`;
  - `*/artigo-modelo.pedido.system` e `*/artigo-modelo.pedido.user`;
  - `*/artigo-modelo.planta-congelada`, se o fechamento da bancada usa o texto padrão;
  - `*/csv-para-escrever` e `*/mcp.get_article_for_writing`;
  - `*/csv-video` e `*/mcp.get_video_material`;
  - `*/mcp.get_writer_brief.planta-aprovada`.
- **Ficam iguais, e o teste confere:**
  - `voz-humana/reguas`;
  - `ancoras-naturais/*`;
  - `identidade-de-publicacao/*`;
  - `fonte/*`;
  - `*/artigo-modelo.brief`, salvo se o nome da chave da oferta mudar.
- **O caminho que o E0 tira.** As fixtures do E0 são da Care Glow **sem** Skill
  (`brandVoice: { kind: "none" }`, `tests/entregaveis-intocados-2026-10-13.test.mts:373,
  382, 388, 442`). Depois da V2, o E0 passa a provar que **nenhum nicho vaza sem
  Skill**.
- **Cenários com Skill** (AdalbaPro v2, WifiConecta) vão num teste próprio, com o
  retrato próprio. Chave nova no E0 seria "nascer", e o teste de escopo barra.

**Rollback:**

- Reverter o código pelo git; o dono faz o commit.
- A Skill v2 da AdalbaPro pode ficar: com o global antigo de volta, as frases
  aparecem em dobro, sem quebrar nada.
- As plantas gravadas não foram tocadas (leitura só), e o E0 volta à tabela anterior.

## 8. Testes (fixtures, zero chamada paga, zero IA)

1. **Régua do segmento:**
   - fixture com a forma real da Skill da WifiConecta (títulos com `**` e `\.`, A–E);
   - casamento, mínimo, desempate e ordem;
   - "planos de internet residencial" → B;
   - uma busca de disponibilidade por CEP → o segmento que a declara;
   - sem casamento → CTA único → neutro.
2. **Sem vazamento de nicho.** Com a Skill da WifiConecta e com marca sem Skill,
   nenhum entregável contém: "clínica", "paciente", "consultório", "agência de posts",
   "posts, feed, anúncio", "busca orgânica", "estrutura própria no Google", "anunciar
   saúde e estética", "Peça um diagnóstico". Vale para o pedido (system e user), o
   CSV "Para escrever", o CSV de vídeo, o material do Redator, os prompts do Redator,
   a semente de roteiro e carrossel, e a nota do catálogo. (Teste estrutural com os
   comentários limpos antes do `doesNotMatch`.)
3. **Paridade da AdalbaPro** (§5.5), com a fixture da Skill v2.
4. **Conferência do fechamento:**
   - o CTA de segmento passa sem verbo de verificação;
   - a "Oferta de diagnóstico" continua exigindo o verbo;
   - duas chamadas falham;
   - na conclusão, o falho vira o CTA escolhido.
5. **Planta gravada:** o texto padrão antigo literal é trocado na leitura; o CTA
   aprovado de outro texto fica; o payload e o hash não mudam.
6. **Ida e volta CSV → material** com os rótulos novos (Redator, vídeo,
   `get_writer_brief`).
7. **Painel da Marca:** a proposta "CTA por intenção" aparece quando falta a seção;
   some quando a Skill tem segmento com CTA ou CTA único. Nenhum botão novo
   (`AGENTS.md` §0.3, forma da linha).
8. **DOM pelos botões de sempre:**
   - "Exportar CSV" ("Só os artigos selecionados") no Radar, com a bancada do export
     (PostgREST simulado): o arquivo baixado tem o CTA do segmento;
   - o painel "Artigo-modelo da SERP" mostra a nota de origem do CTA;
   - o Redator mostra o CTA no material.
9. **Suítes:** `test:radar`, `test:agent` (catálogo), o E0 e o escopo, o guarda de
   tamanho, e os cenários-ouro com um cenário novo "marca com segmentos de CTA" na
   mesma linha (`AGENTS.md` §0.3). Depois, TypeScript e lint direcionado.

## 9. Fases (critério de pronto)

| Fase | O quê | Pronto quando |
|---|---|---|
| **V0** | Inventário (§5.1), fixtures da Skill real (formato), teste do antes; nenhum entregável muda | fixture e teste verdes; E0 intocado |
| **V1** | Proposta da Skill v2 da AdalbaPro e do molde "CTA por intenção" no painel da Marca (só texto, mesmo bloco da D8) | o painel mostra as propostas; o dono aplica a Skill v2 da AdalbaPro (ação do dono) |
| **V2** | Corte global × nicho em `human-voice-guideline.ts`, `brand-edge.ts`, `brand-diagnosis-offer.ts` e `article-blueprint.ts`; leitor de segmentos em `brand-voice.ts`; regra do §4.4; rótulos e parser do material; Redator, vídeo e semente; catálogo; versões; E0 fase F-V; documentos SUBSTITUÍDO (diretriz, Adendo G, SDD do Silo D7/D8, spec e estado do Radar) | §8 verde; paridade da AdalbaPro; nenhum nicho sem Skill |
| **V3** | Leitura das plantas gravadas (§4.6) | as 4 plantas da WifiConecta saem com o CTA do segmento no CSV, sem mudar o payload |
| **V4** | Homologação do dono: exportar "Para escrever" de um artigo da WifiConecta e de um da AdalbaPro; decidir "Organizar de novo" nos 6 da WifiConecta | relato do dono; readback no banco das plantas reorganizadas, se houver |

## 10. O que NÃO muda

- Esquema da planta, `ArticleDNA` e `SiloDNA`; rotas e botões; quantas chamadas de
  IA "Organizar" faz.
- A trava de fonte, o D10, a precedência SERP > lógica > IA e as 4 lentes.
- As réguas de conferência que protegem fato e dignidade em qualquer marca: plano
  visual sem "antes e depois" nem promessa de resultado; leitor único; caso
  inventado. Elas citam saúde nos padrões, mas são guardas, não copy. Ficam como
  estão; avaliar falso negativo noutros nichos vai ao backlog.
- O papel do pedido ("editor-chefe de SEO de uma agência brasileira") é o da
  plataforma, não da marca. Fica.
- O CTA aprovado das plantas da AdalbaPro e qualquer CTA escrito por gente.

## 11. Autorização necessária (o que ainda depende do dono)

1. Confirmar o escopo (§9) e as perguntas (§12).
2. Aprovar o texto do CTA neutro e dos rótulos neutros.
3. **Aplicar a Skill v2 da AdalbaPro** na Marca (o código não escreve a Skill).
   Opcional: acrescentar o segmento E completo ou um "CTA padrão" à Skill da
   WifiConecta.
4. Autorizar a mudança do E0 na fase F-V (registrada aqui).
5. Decidir "Organizar de novo (IA)" nos 6 artigos da WifiConecta: chamada paga de
   IA, até 2 por artigo.
6. Commit, push e deploy.

## 12. Perguntas ao dono

- **Q1.** As regras sem nicho fora da lista literal continuam globais? São K8 e K9,
  a Regra 8, imagens, links, fontes externas, a forma de 4 campos com um CTA só, e o
  arco de consciência como princípio neutro. Recomendação: sim.
- **Q2.** Texto do CTA neutro: "Quer dar o próximo passo? Fale com a equipe da
  {marca}." serve?
- **Q3.** A V2 espera a Skill v2 da AdalbaPro aplicada (recomendado), ou pode ir
  antes, com a AdalbaPro no neutro por alguns dias?
- **Q4.** O CTA escolhido pelo segmento pode ser trocado por gente no artigo? Hoje
  não há campo para isso sem reorganizar. Recomendação: a troca é na Skill (Buscas
  indicativas), sem campo novo.
- **Q5.** Trocar na leitura só o texto padrão antigo literal (recomendado), ou
  reorganizar as 6 plantas da WifiConecta?

## 13. Ainda não verificado

- O CTA do Segmento E na Skill: a leitura foi cortada; o valor é o relatado pelo dono.
- As chaves exatas do E0 que mudam: só a implementação mostra; o §7 dá as candidatas.
- Se a bancada do E0 fecha o fechamento pelo texto padrão: decide se
  `*/artigo-modelo.planta-congelada` muda.
- O efeito no tamanho do pedido normal (a primeira chamada), medido só depois do
  corte.
