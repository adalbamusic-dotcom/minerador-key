# Registro do teste local pelos botões, 18 e 19/10/2026 (congelado)

Este é um registro datado. Ele não substitui o `estado-atual.md` de cada módulo.

- **Teste:** feito no navegador local (`http://localhost:3000`), com cliques de mouse nos botões de sempre.
- **Banco:** remoto de produção, consultado só por SELECT para conferir o que cada botão gravou.
- **Teto do dono:** US$ 5 para SERP e IA.

**Situação: PAUSADO por decisão do dono em 19/10.** Ele vai testar à mão depois. Pediu para deixar tudo aplicado e documentado.

## 1. WifiConecta — grupo Amarelo ("Planos e contratação"): CONCLUÍDO

| Etapa | Resultado | Como foi conferido |
|---|---|---|
| Arquiteto | A Instalação ganhou reforço (v3, 5 keywords) | Botão; banco |
| Radar | Os 8 artigos finalizados, com artigo-modelo concluído; a Instalação v3 foi adotada pelo "Ver e adotar" | Botão; banco |
| Enviar ao Redator | Os 8 em `sent_writer`; 8 documentos em `content_documents` (status `planned`, de 0,8 a 1,7 MB comprimidos) | Botão "Enviar ao Redator"; SELECT em `editorial_workflow_items` |
| Redator | A lista mostra os artigos do amarelo | Tela |

Defeitos achados e corrigidos pelo caminho:

1. **Artigo-modelo cortado.** O raciocínio do modelo consumia o limite de tokens. Agora o OpenRouter roda com `effort: "none"`.
2. **Artigo-modelo recusado com 422.** O filtro de "fora do território" removia demais. Siglas curtas (cep, tim) passaram a contar como território.
3. **Chaves duplicadas de concorrente.** O id do concorrente agora é o SHA-256 da URL.
4. **Investigação congelada não adotada.** O Radar recusava adotar a investigação congelada da Instalação v3; agora o "Ver e adotar" congela de novo na versão nova.
5. **Enviar ao Redator: 500 por tempo limite e 401.**
   - Leituras mais estreitas, `return=minimal` e nova tentativa no 401.
   - Os 3 maiores (de 10 a 11 MB) continuaram estourando os 8 s do banco. O dono aplicou em 19/10 a migration `20261019120000_documento_do_radar_gravacao_com_tempo_proprio.sql`: a mesma gravação, com 60 s só nessa chamada.
   - Depois disso, os 3 passaram pelo botão.
6. **Seleção múltipla da planilha do Radar:** não era defeito. O "Enviar ao Redator (N)" conta só os artigos elegíveis da seleção. Entrou o teste `tests/radar-selecao-em-lote-planilha.test.mts`.

Risco aberto: o salvamento automático do Redator regrava o documento inteiro e pode bater no limite nos documentos grandes.

## 2. WifiConecta — grupo Azul: CANCELADO

O dono apagou o grupo e vai testá-lo à mão depois.

## 3. AdalbaPro — grupo Verde (25 publicados): Minerador CONCLUÍDO, Arquiteto PAUSADO

### Minerador (regra "Assunto pela principal e volume", SDD de 18/10)

1. **Aprovar e enviar, nas 25.** A 1ª tentativa deu 503: gravou o Assunto em 6 keywords e a tela disse "Nada foi gravado".
   - **Causa:** o compare-and-swap mandava o DNA inteiro na URL, que passava do limite do gateway.
   - **Conserto:** filtro por chave de topo e releitura antes de gravar (`lib/minerador/semantic-snapshot-guard.ts`); resultado contado keyword por keyword; desfecho `failed`.
   - **2ª tentativa:** 25 de 25 concluídas, 0 falhas, conferido na releitura.
   - **Banco:**
     - 16 keywords com o Assunto pela origem `zero`;
     - "como atrair pacientes para clínica" foi segurada, porque com o Assunto deixaria de poder ser aprovada (decisão pendente, abaixo);
     - as 25 estão aprovadas.
2. **Volume baixo.** 64e259d6 e 24679c44 seguiram pelo painel: "Usar como Assunto do artigo" → "Revisar mudança" → "Gravar" → "Aprovar e enviar". No banco ficaram com a origem `low` e o status aprovado.
3. **Não testado:** a edição do título do Assunto no painel ficou para o teste manual.

### Arquiteto ("Melhorar publicados…"): PAUSADO, nada gravado

A 1ª prévia, já com a SERP, propunha tirar o reforço dos publicados. Quatro defeitos foram corrigidos (situações RF25, RF26, RF13, G19, G20 e V7 em `docs/04-arquiteto/situacoes-resolvidas.md`):

1. "Informativo × Informativa" era tratado como intenção diferente.
2. Secundárias saíam por divergência de intenção só no DNA, sem a SERP decidir.
3. "agencia de marketing em são paulo" saía como "busca local" na cidade da própria marca.
4. A coleta paga deixava parte sem pagar e pedia de novo; a guarda de retrabalho derrubava a coleta inteira, sem aviso.

**Cobrança do dono em 19/10, que motivou a pausa:** a prévia mantinha as principais ruins do primeiro teste, sem relação semântica com o slug. Exemplos:
- "captação de pacientes dentista" em /captacao-de-pacientes-sem-trafego-pago;
- "como atrair clientes pelo instagram" em /instagram-nao-traz-pacientes.

A régua do núcleo do slug era só de palavras e ignorava o modificador que define o artigo. A prévia também não vigiava a canibalização entre os artigos do grupo.

**Decisões do dono em 19/10, aplicadas na entrega em curso:**
- No refazer de um publicado, a keyword do slug é o Assunto. A principal e as secundárias são reavaliadas contra ele pelo SEO semântico (entidade, intenção, problema e modificador), com a SERP confirmando.
- Uma principal antiga sem relação semântica não fica.
- Canibalização entre os artigos do grupo: a keyword que serve a outro Assunto é proposta para o artigo certo.
- Ao refazer, coleta-se SERP nova na localidade da marca. A SERP nacional anterior não vale como prova.
- A coleta de uma keyword sozinha não entra no registro da guarda de retrabalho, e a recoleta não é barrada.
- A mesma régua vale em todos os caminhos da área (§0.5): a mesa D2.1, "Reforçar publicados" e `proposePublishedPrimarySwap`.

O roteiro de teste manual do Verde fica no `docs/04-arquiteto/estado-atual.md`.

## 4. Gasto registrado nesta rodada (19/10)

- DataForSEO: 76 consultas no "Melhorar publicados…" do Verde (64 às 01:33–01:41 UTC e 12 às 02:18–02:19 UTC), cerca de US$ 0,27.
- IA: 1 leitura da lista (OpenRouter).
- A execução `191d7c0e` ficou com 72 consultas reservadas e não pagas. Abrir "Melhorar publicados…" no Verde retoma essa coleta (até US$ 0,252, dentro do aceite das 02:17). Com a regra nova de recoleta, convém conferir a prévia antes de aceitar.

## 5. Decisões pendentes do dono

1. **Volume importado não confirmado** de "como atrair pacientes para clínica" (10). A régua do Assunto lê zero, mas a aprovação exige o Volume medido. Qual vale?
2. **Intenção "Local"** no DNA de "como atrair pacientes para clínica de estética": ela barra principais informativas. Corrigir no Minerador ou deixar a SERP de São Paulo decidir?
3. **Pendentes de antes:**
   - migration de Suspender/Revogar convite e o PATCH de convites;
   - migration para o documento do Redator não prender a keyword;
   - o atalho de lote "do Silo" perdido;
   - o corte de 500 mil habitantes do território (D11);
   - a voz e o CTA por marca, depois da Skill v2 da AdalbaPro;
   - a limpeza de botões duplicados (por exemplo, "Aprovar e enviar" aparece na barra do topo e no rodapé do Minerador).
4. **Salvamento automático do Redator** nos documentos de 10 MB: pode estourar o tempo limite. Referenciar o pacote em vez de copiar pede SDD.
