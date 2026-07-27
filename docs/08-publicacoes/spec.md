# Spec — Publicações
## 1. Propósito
Receber documentos aprovados, preparar o registro de publicação, exportar pacotes operacionais e registrar publicação manual e atualizações.
## 2. Responsabilidades
Exibir planilha, importar documentos aprovados, controlar biblioteca/fila, gerar arquivos reais, representar destino/status, registrar URL final e manter histórico operacional.
## 3. Fora de responsabilidade
Não redige documento nem envia automaticamente a CMS externo.
## 4. Entidades
OperationalPublication e PublicationRecord.
## 5. Jornada
Selecionar documentos aprovados no Redator, importar de forma idempotente e acompanhar status.
## 6. Regras de negócio
Somente documento aprovado é importável; marca e lock devem coincidir; publicados preservam campos estruturais; URL final não é inventada nem trocada neste fluxo; exportação é confirmada antes do registro; pedido de atualização mantém o item `published` para preservar o guard do Redator.
## 7. Estados
Rascunho, escrita, revisão, aprovado, pronto para exportar, fila, exportado, publicado, bloqueado e arquivado.
## 8. Ações
Importar, colocar na fila, exportar Markdown/JSON/CSV, registrar destino e URL, marcar publicação manual, solicitar atualização, reeditar e acompanhar histórico.
## 9. Entradas
Documento aprovado, ContentPlan e ArticleDNA referenciados.
## 10. Saídas
Registro de publicação preparado para destino.
## 11. Contratos com outros módulos
Consome Redator e published guard de Arquiteto.
## 12. Proteções
Marca, lock, status de origem e campos estruturais de publicado.
## 13. Casos de borda
Documento não aprovado, reimportação e destino ausente.
## 14. Arquitetura técnica atual aprovada
`PublicationsPage`, `PublicationRepository` e comando editorial de importação.
## 15. Critérios de aceite
Importação é idempotente e não permite avanço de documento não aprovado; a fila só avança em ordem; arquivos são baixados sem CMS; publicação exige destino e URL válida; atualização/reedição preserva slug, canonical, keyword principal, marca e URL publicada.
## 16. Fora do escopo atual
Entrega a CMS ou publicação externa real.
## 17. Arquivos pertencentes ao módulo
`app/(brand)/[brandRef]/publicacoes/page.tsx`, `modules/publicacoes/publications-page.tsx`.
## 18. Arquivos compartilhados consumidos
Fluxo operacional, contexto e repositórios editoriais.
## 19. Arquivos proibidos sem autorização
Redator, migrations, integrações externas e contratos compartilhados.
