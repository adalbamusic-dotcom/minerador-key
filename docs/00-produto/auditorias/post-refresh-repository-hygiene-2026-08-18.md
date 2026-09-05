# Higiene documental pós-refresh — 2026-08-18

## Escopo

Esta auditoria registra a consolidação documental e a limpeza local após o
Master Refresh. Não houve alteração de runtime, banco remoto, migration,
secrets ou provider.

## KEEP_CANONICAL

- `supabase/migrations/*.sql`, incluindo `0043`, `0044` e os migrations dos
  Master Refresh Batches.
- Baseline canônico final de 2026-08-17 e seu verificador read-only.
- Scripts operacionais e verificadores que ainda têm consumidor em testes,
  documentação vigente ou operação atual. Preflights, post-verifiers e
  rollbacks referenciados continuam preservados para não quebrar esses
  consumidores.
- Documentação canônica, `AGENTS.md`, código atual, `.env.example` e o
  diretório `docs/_arquivo/` já existente.

## ARCHIVE_HISTORY

- A documentação histórica continua seguindo `docs/_arquivo/2026-07-
  documentacao-legada/`.
- Nenhum script operacional foi movido para arquivo nesta rodada: a opção
  conservadora foi preservar preflights, post-verifiers e rollbacks enquanto
  ainda podem servir de evidência do refresh ou de diagnóstico.

## DELETE_DISPOSABLE

Foram removidos somente artefatos locais sem referência operacional, sem papel
canônico e sem informação histórica única:

- `arquivos-nao-rastreados.txt`;
- `backlog-google-ads-final.txt`;
- os `diff-*.patch` e `diff-*.txt` temporários da raiz;
- os `resultado-google-ads-foundation*.txt` e `status-*.txt` temporários da
  raiz;
- `.next-codex-verify/` e `tsconfig.tsbuildinfo`, caches/saídas geradas de
  verificação local.

Os nomes removidos foram conferidos contra referências ativas antes da
remoção. O relatório histórico de governança foi atualizado para qualificar
essas referências como histórico, não como arquivos ainda existentes.

## Limpeza agressiva de scripts — 2026-08-18

- `43` scripts rastreados de `supabase/scripts/` sem referência ativa foram
  removidos: diagnósticos, readbacks, preflights, post-verifiers, rollbacks e
  scripts intermediários de fases/Batches encerrados.
- `supabase/rollback/0002_operational_editorial_flow.rollback.sql` e
  `supabase/rollback/master-refresh-batch-1-writers.rollback.md` foram
  removidos por estarem encerrados e sem consumidor operacional; o histórico
  permanece no Git.
- Os rollbacks `0005` e `0006` foram preservados porque ainda são lidos por
  testes de contrato. Os scripts dos Batches 5–7 não rastreados também foram
  preservados: sem commit, não há recuperação Git garantida para eles.
- O verificador `supabase/scripts/master-refresh-batch-7-canonical-baseline-
  read-only.sql` permanece preservado.

## Integridade

- `APPLIED_MIGRATIONS_DELETED = 0`.
- O baseline `f058b86b56e6d99ab24dac967241c221` permanece presente.
- O verificador final do baseline permanece presente.
- Nenhuma rota, API, payload, tabela, coluna, `artifact_type` ou contrato foi
  alterado nesta consolidação.
- Alterações de código/runtime existentes no checkout pertencem a tarefas
  anteriores e foram preservadas; esta tarefa só alterou documentação e
  removeu os descartáveis acima.
