# Status e importações do fluxo editorial

## Regra operacional

Cada ferramenta possui sua própria fila. Um item permanece na etapa atual até
receber aprovação humana. A ferramenta seguinte não consome automaticamente
todo o conteúdo anterior: o usuário abre **Importar**, vê somente os aprovados,
seleciona o que deseja trabalhar e confirma.

O popup sempre lista **todos os aprovados** da etapa anterior. Itens já
importados continuam na lista para conferência, recebem o status da etapa de
destino e ficam desabilitados para impedir duplicação. “Selecionar todos” marca
somente os aprovados que ainda não foram importados.

Esse é o único padrão de entrada manual entre ferramentas. O Arquiteto não
possui mais o comando paralelo **Carregar**: ao abrir **Importar do Minerador**,
a fonte é atualizada e o popup mostra keywords aprovadas, itens já importados e
publicados. Publicados aparecem como âncoras protegidas. Keywords sem
silo/categoria também aparecem para não produzir uma lista falsamente vazia,
e podem ser selecionadas manualmente como candidatas **sem classificação**.
Essa importação não inventa silo: elas continuam impedidas de aprovação e de
avanço até a organização humana no Arquiteto.

Fluxo aplicado:

1. **Minerador:** keyword em processo, aprovada, rejeitada ou publicada.
2. **Arquiteto:** importa keywords aprovadas do Minerador; o artigo fica em
   processo, aguardando aprovação, aprovado ou publicado/protegido.
3. **Radar:** importa ArticleDNAs aprovados do Arquiteto; pesquisa e conflitos
   passam por revisão antes da aprovação.
4. **Planejador:** importa artigos aprovados do Radar; o ContentPlan precisa ser
   preparado, revisado e aprovado.
5. **Redator:** importa ContentPlans aprovados do Planejador; o documento fica
   em redação, aguardando aprovação ou aprovado.
6. **Publicações:** importa somente documentos aprovados no Redator. A
   importação os coloca na biblioteca/fila, sem publicar ou exportar.

## Estados apresentados

Os contratos continuam usando estados técnicos específicos de cada módulo,
mas a interface os agrupa em rótulos compreensíveis:

- **Em processo:** rascunho, pesquisa, planejamento ou redação em andamento.
- **Aguardando aprovação:** item enviado para decisão humana.
- **Aprovado:** concluído na etapa atual e disponível no popup seguinte.
- **Importado na próxima etapa:** o item original continua rastreável, mas já
  originou trabalho no módulo seguinte.
- **Publicado:** estado final protegido dos registros já existentes.
- **Bloqueado/com conflitos:** exige correção ou decisão antes de avançar.

## Segurança e persistência

- Importações são idempotentes e não criam duplicatas para o mesmo artigo.
- O servidor revalida marca, permissão, estado de origem e `lock_version`.
- Um rascunho do Redator não pode entrar em Publicações.
- Editar novamente um documento aprovado o devolve para redação e exige nova
  aprovação antes de outra importação.
- Publicados não perdem as proteções estruturais existentes.
- Enquanto a migration proposta não for aplicada, o fluxo crítico é recuperado
  automaticamente no mesmo navegador e isolado por marca. Isso inclui keywords
  já importadas no Arquiteto, DNAs aprovados, filas do Radar e Planejador,
  documentos e a fila de Publicações.
- Essa recuperação no navegador não finge ser persistência remota: outro
  navegador ou dispositivo não receberá esses estados até a migration ser
  revisada e aplicada manualmente.
- Ao abrir um popup de importação, a etapa atualiza a fonte autorizada da marca.
  Todos os aprovados aparecem; os já importados permanecem visíveis e
  desabilitados, sem duplicação.
- Nenhuma migration foi aplicada e nenhum dado remoto foi alterado nesta
  implementação.
