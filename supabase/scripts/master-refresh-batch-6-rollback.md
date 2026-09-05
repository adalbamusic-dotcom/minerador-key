# Master Refresh Batch 6 — rollback

`ROLLBACK_MODE = RESTORE_FROM_VERIFIED_EXPORT`.

Não existe rollback automático honesto depois do DROP. Se a migration falhar antes do commit, o PostgreSQL reverte a transação. Depois do commit, restauração exige:

1. parar e não iniciar o Batch 7;
2. recriar `migration_backup` e as seis tabelas conforme a migration histórica `0005`/snapshot original;
3. importar os seis JSONL integrais em `docs/00-produto/auditorias/exports/master-refresh-gates-2026-08-17/`;
4. conferir as seis contagens, fingerprints MD5 remotos e SHA-256 locais do manifesto;
5. não usar `CASCADE` e não restaurar qualquer linha em `public` automaticamente.

Esse procedimento só pode ser executado mediante autorização específica de restore.
