# Estado atual — Admin, autenticação e ownership — 2026-07-26

- Cadastro de marca exige owner Auth existente por e-mail ou UUID.
- O Route Handler cria `marcas.owner_user_id`, `status = active` e membership `owner` consistente, com compensação segura para falhas posteriores.
- O Admin global permanece `d67ebbad-a590-45f8-8bb5-a19c6241ac1b` e não vira owner automaticamente.
- Smoke test autenticado e persistência remota permanecem pendentes; nenhuma operação remota foi executada.
