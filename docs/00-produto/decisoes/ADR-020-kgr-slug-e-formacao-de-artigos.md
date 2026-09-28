# ADR-020 — KGR, slug e formação de artigos

- **Status:** Aceita para implementação aditiva em 2026-07-21
- **Módulo proprietário da decisão:** Arquiteto
- **Módulos consumidores:** Marca/Site/Sitemap, Minerador e Radar

## Contexto

URL, slug, H1, title e meta description encontrados no Site são sinais úteis,
mas não são qualificação de keyword. KGR depende de qualificação real do
Minerador e o artigo só deve ser formado pelo Arquiteto. A SERP do Radar deve
validar o artigo já formado, preservando a decisão editorial.

## Decisão

1. Site observa e sugere; nunca confirma KGR, volume, resultados, intenção ou
   ArticleDNA.
2. Minerador é a autoridade de qualificação de keyword e KGR.
   *Emendado em 2026-09-28 (adendo abaixo): o KGR passa a ser opcional, com
   padrão "não aplicável", no Minerador (por keyword) e no Arquiteto (por
   artigo).*
3. Arquiteto forma um artigo com exatamente uma principal e até cinco apoios,
   com teto de seis referências.
4. A principal define intenção dominante, problema, promessa, audiência, slug
   candidato, KGR, volume principal e limites editoriais.
   *Emendado em 2026-09-24 pelo
   [ADR-022](ADR-022-assunto-tronco-editorial.md): a principal continua
   definindo slug, KGR e volume principal. Quando o humano declara um
   Assunto, é ele o fundamento do artigo, e a principal passa a ser a âncora
   de busca.*
5. Secundárias só entram quando há compatibilidade de intenção, semântica,
   resposta em uma página, ganho real, narrativa natural e baixa
   canibalização relevante.
6. Volume ausente é parcial/indisponível, nunca zero implícito; reforço
   narrativo não recebe volume inventado.
7. Silo/Pilar/Suporte é sugerido por sinais combinados e exige revisão humana.
8. Publicados preservam slug, canonical, URL, marca e principal protegida; o
   sistema propõe reforços e conflitos sem sobrescrever a identidade.
9. Radar recebe o ArticleDNA formado em modo somente leitura da estratégia.

## Consequências

- A formação fica auditável por IDs, versões, evidências e racional.
- A ausência de KGR ou volume torna-se visível e não é convertida em fato.
- O Site e o Minerador permanecem desacoplados por um contrato de evidência.
- O limite de seis impede artigos inflados e deixa a seleção humana explícita.
- Contratos novos são opcionais; não há migration nem reprocessamento.
- Será necessário manter testes de compatibilidade para ArticleDNA e Radar
  antigos.

## Alternativas rejeitadas

- Confirmar KGR por score, slug semelhante ou volume.
- Deixar Site ou Radar escolherem a principal.
- Somar volume ausente como zero sem aviso.
- Reagrupar automaticamente no Radar.
- Alterar identidade de conteúdo publicado para corrigir uma sugestão.

## Adendo 2026-09-28 — KGR opcional, padrão "não aplicável"

- **Status:** decisão do dono do produto em 2026-09-28 ("vamos aplicar").
  SDD: `docs/compartilhado/sdd-serp-no-artigo-e-kgr-opcional-2026-09-28.md`,
  APROVADA. Implementação: Planejado.
- **Motivo:** o KGR raramente se aplica. Tratado como padrão, ele exigia
  consulta paga (allintitle) e decisão humana obrigatória em toda keyword.
  O dono quer gastar menos no provider e não guardar dado inútil.

### Decisão

1. **O padrão é "KGR não aplicável"**, no Minerador (por keyword) e no
   Arquiteto (por artigo). Aplicar o KGR é escolha **manual e humana**.
   - Nenhum score, faixa ou IA aplica o KGR sozinho.
   - O KGR pleno automático (score < 0,25 virar "Sim" sem decisão humana)
     deixa de valer para avaliações novas.
2. **Fórmula:** KGR = allintitle ÷ volume. É bom quando fica abaixo de 0,25
   (limite estrito, como antes).
3. **Faixa de volume de interesse para KGR: 150 a 550.** Ela é só
   informação na tela. Nunca é gate e nunca aplica o KGR.
4. **No Minerador,** a decisão de KGR deixa de ser exigida para aprovar e
   para concluir a Revisão Humana. O seletor por keyword continua, com padrão
   "Não aplicável". "Pendente" fica só como leitura de valor legado.
5. **No Arquiteto,** cada artigo tem a escolha **"Aplicar KGR"** (padrão:
   não).
   - O allintitle da principal é medido pelo Arquiteto (uma consulta, cache
     primeiro), e o KGR do artigo pode ser recalculado por ação humana.
   - O Arquiteto não grava na linha do Minerador.
6. **O score continua sendo um fato técnico.** Quando há medição, ele é
   calculado e guardado. A aplicabilidade decide só o **uso** do KGR.

### O que continua valendo

- **Os itens 1 a 9 acima.** O item 2 é emendado só quanto ao padrão e à
  obrigatoriedade: o Minerador continua sendo a autoridade da qualificação da
  keyword quando o humano aplica o KGR nela.
- **A principal continua definindo** slug, volume principal e, quando
  aplicado, o KGR do artigo.
- **O que já foi decidido fica:**
  - decisões humanas registradas e vínculos KGR confirmados continuam
    prevalecendo e travando slug e principal;
  - ArticleDNA aprovado continua imutável;
  - identidades gravadas pela regra antiga são lidas como estão, sem nova
    versão automática.
- **Valores `pending` já gravados não são apagados.** Eles são lidos como
  "não aplicado".

### Consequências

- Menos consulta paga e menos decisão obrigatória. O KGR vira ferramenta do
  humano, não pedágio da aprovação.
- Artigos novos deixam de cair no perfil `kgr_light` da SERP sem decisão
  humana. O plano de SERP desses artigos cobre todas as keywords com volume
  nas 4 lentes.
- O sinal `kgrOpportunity` do motor de candidatas (volume ≥ 120) e o filtro
  do Descobrir (120–499) não mudam neste adendo. Alinhar os dois à faixa
  150–550 exige fatia própria, com testes de formação.
