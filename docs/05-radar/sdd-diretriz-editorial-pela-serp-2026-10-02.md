# SDD — Radar: diretriz editorial guiada pela SERP, com a voz do especialista — 2026-10-02

**Status:** APROVADA pelo dono em 2026-10-02: D1 = F1 já; D2 = F2 em seguida; D3 = o parecer do
"Eu mesmo" entra já aceito; D4 = os três itens de vídeo (SERP, biblioteca da marca, YouTube vira roteiro).<br>
**Módulo proprietário:** Radar. Consumidores preservados: Redator (lê o dossiê) e o CSV "para escrever".<br>
**Origem:** primeiro artigo real fechado pelo Radar ("instagram não traz pacientes", 2026-10-02). O CSV
trouxe pesquisa aproveitável, mas a diretriz de escrita saiu errada: um redator que obedecesse ao
arquivo escreveria sobre recursos genéricos do Instagram, abrindo com influenciadores de IA.

## 1. Pedido do dono

- A SERP manda: ela tem a última palavra sobre intenção, funil e o que o artigo precisa cobrir para
  competir pela posição. Do Arquiteto ao Radar, tudo se apoia em evidência real.
- O Radar junta o que há de bom (SERP nas 4 lentes, perguntas, AI Overview, concorrentes, ArticleDNA,
  especialista) numa direção clara, para competir no Google.
- Fundamentos obrigatórios em todo artigo: termos semânticos (LSI) e linguagem natural (PNL), leitura
  do BERT (responder a pergunta com clareza, no contexto), autoridade E-E-A-T e cuidado YMYL.
- A voz do especialista é parte importante do artigo, principalmente na última virada e no CTA.
- O CSV leva os prompts das imagens (capa e respiros), com ALT e legenda.

## 2. Diagnóstico (verificado no código)

| Sintoma no CSV | Causa |
|---|---|
| Seções "O que considerar sobre 2. Aproveite os recursos do Instagram?" | Candidatos a seção são H2 crus dos concorrentes (`semantic-concept-model.ts:457`, `:578`). Nenhuma normalização tira numeração de lista ("2.", "7.", "10 principais"). O molde de último recurso é `editorial-article-model.ts:458`, e a escada de regex (`:385-472`) falha porque o número vem antes. |
| Qualquer listicle genérico vira seção | "Alinhado" = compartilhar uma raiz com o território (`editorial-article-model.ts:310-319`, `:1316-1327`). A palavra "instagram" basta. Não há teste de aderência à intenção nem à entidade central. |
| Abertura: "10 principais influencers de IA do Instagram…" | `perguntaDeAberturaDe` (`portable-writing-export.ts:1096`) pega a unidade CORE com mais páginas. A recorrência é inflada pela fusão por faceta (`semantic-concept-model.ts:511`, "porque" → CAUSE em `:157`), e o desempate alfabético põe o dígito na frente (`ai-discovery-context.ts:877`). |
| H1 "Como o que considerar sobre 2. Aproveite…" | O H1 cola "Como" sobre o cabeçalho já moldado (`editorial-article-model.ts:1537-1593`, `nucleoDeAcao` em `:724`). |
| Promessa genérica | Sem função editorial reconhecida, tudo vira COVERAGE e a promessa é "encontra respondido o que foi procurar" (`:1633-1645`). |
| Fechamento e CTA sobre "2. Aproveite os recursos" | Derivam do mesmo cabeçalho (`:1678-1688`). O especialista nunca é roteado para lá: o tipo do parecer (FECHAMENTO, CTA, DIRETRIZ) não atravessa (`portable-annex-context.ts:164-177`). |
| "Sustentar X como diferencial" para temas raros e fora do assunto | Diferencial = conceito ancorado abaixo do limiar de recorrência, mesmo de 1 página (`competitive-observed-model.ts:793-815`), sem filtro de relevância; o CSV nem checa `foraDoEscopo` (`portable-writing-export.ts:1125`). |
| Especialista: "sem contribuição aceita" | O parecer chegou e está aguardando aceite (conferido no banco: tipo FECHAMENTO, status RECEIVED). O CSV só mostra aceitos e esconde o pendente (`portable-writing-export.ts:1366`). |
| Plano visual sem prompt, ALT e legenda | Estrutural: o gerador usa promessa, objetivo e cabeçalhos (`portable-identity.ts:337-449`), e o filtro do CSV descarta exatamente esses textos como "moldura" (`portable-writing-export.ts:1428-1467`). |
| L1 "destino não resolvido" | O Pilar ainda não está publicado (`article-formation:…`); o Radar não lê o slug planejado (`suggestedSlug` existe no Arquiteto). |
| "Fontes verificadas: nenhuma" | `buildRadarFactualEvidence` (`source-authority.ts:358`) não tem chamador em produção. |
| LSI/PNL/BERT ausentes; YMYL "nenhuma" | O Radar só tem termos de cabeçalho (`semantic-concept-model.ts:27` diz "não é densidade LSI"); o enriquecimento semântico está desligado (`:737`). YMYL é regex sobre palavras de saúde (`editorial-policy.ts:39-92`). |

**Conclusão:** a pesquisa (SERP, 4 lentes, perguntas, AI Overview, concorrentes) é boa. A falha está na
**síntese editorial**, que é léxica e baseada em cabeçalhos de concorrentes. Corrigir regex por regex
melhora o pior, mas não produz promessa, H1, ângulo e fechamento competentes.

## 3. Proposta em fases

### F1 — Correções determinísticas (sem contrato novo; pode começar já)

1. **Especialista visível e roteado.**
   - CSV e Relatório mostram o parecer pendente ("1 parecer aguardando aceite no Radar: não entra no
     texto até ser aceito"), e o envio ao Redator avisa.
   - O tipo do parecer atravessa até o CSV: FECHAMENTO vira o **Fechamento**, CTA vira a **Chamada
     final**, DIRETRIZ entra nas regras do artigo. A voz do especialista passa a conduzir a última
     virada e o CTA (citada como fala dele, sem inventar credencial).
2. **Limpeza de cabeçalhos:** tirar numeração e contagem de listicle ("2.", "7.", "10 principais",
   "15 ideias") antes de qualquer uso como seção, pergunta ou termo.
3. **Aderência à intenção:** abertura, seção e diferencial exigem tocar a entidade central do artigo
   e a intenção (não só uma raiz como "instagram"); diferencial exige ao menos 2 páginas ou uma
   pergunta/PAA que o peça, e respeita `foraDoEscopo`.
4. **Link para Pilar não publicado:** usar a URL planejada (SiloPage + `suggestedSlug`) marcada "a
   publicar", em vez de "destino não resolvido".
5. **Plano visual com conteúdo:** prompt, ALT e legenda por imagem, montados a partir da pergunta da
   seção, do conceito e da entidade central, no tom visual da regra 8 do arquivo.

### F2 — Diretriz editorial sintetizada pela IA, revisada por humano (contrato novo)

- **Entrada:** a SERP congelada (4 lentes, orgânicos, PAA, AI Overview, buscas relacionadas, conceitos
  com cobertura, lacunas), o ArticleDNA (principal, complementares, Assunto, papel no Silo, destino), o
  parecer aceito do especialista e as regras da marca.
- **Saída estruturada (`editorialDirection`):** promessa concreta; leitor; abertura (pergunta que o
  leitor tem, respondida no 1º parágrafo); H1 e alternativas; seções H2 com a pergunta que cada uma
  responde, as evidências que a sustentam (ids do pacote) e os termos LSI/entidades a nomear;
  diferenciais justificados pela intenção; virada final e CTA **com a voz do especialista**; plano
  visual (capa e 2–3 respiros com prompt, ALT e legenda); sinais E-E-A-T e cuidado YMYL.
- **Validador do servidor recusa:** título ou frase copiados de concorrente, numeração, id inventado,
  seção fora da intenção, afirmação factual sem fonte do pacote.
- **Decisão humana:** "IA analisa → aplica na cópia → humano revisa e aprova" no Radar, antes de
  finalizar. Sem aprovação, nada vai ao pacote.
- **Pacote e CSV:** campo novo e opcional no dossiê (chave ausente fora do hash: dossiês antigos
  mantêm o hash). O CSV usa a diretriz aprovada quando existe; sem ela, a F1.
- **Custo:** 1 chamada de IA por artigo, mostrada antes, como as outras.

### F3 — Fontes verificadas (depois)

Ligar a verificação factual (`buildRadarFactualEvidence`) às afirmações que pedem fonte. Custo e escopo
em adendo próprio.

## 4. Compatibilidade, riscos e rollback

- **F1** muda só textos derivados; os testes que prendem os textos atuais serão reescritos. Dossiês
  já entregues não são recalculados.
- **F2** acrescenta um campo opcional; quem não o conhece ignora. Rollback: desligar a etapa; o CSV
  volta à F1.
- **Risco:** IA inventar. Mitigação: validador do servidor, ids conferidos contra o pacote, revisão
  humana obrigatória.

## 5. Testes

- F1: o caso real (instagram) vira fixture. Esperado: nenhuma seção com numeração ou fora da intenção;
  abertura aderente; especialista pendente visível; fechamento/CTA com o parecer quando aceito; plano
  visual com prompt, ALT e legenda; link do Pilar com URL planejada.
- F2: validador (cópia, numeração, id inventado, fora da intenção), revisão humana, hash dos dossiês
  antigos inalterado, CSV com e sem diretriz. Testes sem IA paga (fixtures).
- Suítes `test:radar`, `test:redator`, `test:agent` (catálogo atualizado), `tsc`.

## 6. Decisões do dono

- **D1:** aprovar a F1 (começa já, sem contrato novo).
- **D2:** aprovar a F2 (diretriz pela IA com revisão humana; campo novo no dossiê).
- **D3:** o parecer escrito por quem está logado ("Eu mesmo") entra já aceito, ou continua pela revisão
  (decisão D2 da SDD de 2026-09-30)?
- **D4:** vídeos — o que falta: (a) usar os vídeos que aparecem na SERP como sinal de formato e sugestão
  de embed; (b) a biblioteca de vídeos da marca no artigo; (c) o acréscimo YouTube virar roteiro no Redator.
