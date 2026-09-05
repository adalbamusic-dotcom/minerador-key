# SDD — Persistência do avatar pessoal

**Status:** `APPROVED_LOCAL_PREPARATION`

## Evidência do contrato atual

- `auth.users.user_metadata.full_name` já é usado pelo cadastro, pela sessão
  Supabase e pela página pessoal. A edição do nome pode reutilizar esse
  contrato, com readback pela própria API Auth.
- O código ativo não possui bucket, policy de Storage, `avatar_path`,
  `avatar_url` persistido por aplicação ou repository de upload.
- `public.perfis` é usado para papel global e autorização; não é fonte de
  arquivo ou de apresentação de avatar.
- A sessão lê `user_metadata.avatar_url` quando uma imagem externa já existe,
  mas não há contrato para criar, substituir, remover ou proteger essa URL.

## Contrato aprovado

1. O bucket exclusivo é `profile-avatars`, público somente para leitura estável
   da foto; as policies limitam escrita, alteração e remoção ao próprio
   `auth.uid()`.
2. O único caminho permitido é `{auth.uid()}/avatar.webp`; Brand, Agency, slug
   e nome de arquivo não participam da autorização.
3. A entrada aceita JPEG/PNG/WEBP; o cliente recorta 1:1 e envia somente WEBP
   256×256, limitado a 5 MB pelo bucket e pelas validações da interface.
4. A referência canônica única é `auth.users.user_metadata.avatar_url`, usada
   pela sessão, Perfil, `GlobalTopbar` e `ProfilePopover`.
5. O fluxo só publica sucesso após confirmar o objeto via Storage e a URL via
   `auth.getUser()`.

## Consumidores

`PersonalAccountPage`, `ProfilePopover` da `GlobalTopbar` e o contexto de
sessão devem consumir a mesma identidade. Agência e Marca permanecem donas de
seus dados organizacionais; nenhuma membership ou autorização é alterada.

## Implementação local desta revisão

A página seleciona, recorta, reposiciona, aplica zoom e comprime a imagem antes
do upload. O arquivo é enviado somente para o caminho do ator autenticado; a
URL retornada é salva no metadata Auth e lida novamente antes da confirmação.
A migration `0045_profile_avatar_storage.sql` e a configuração local do bucket
foram preparadas, mas não foram aplicadas remotamente nesta etapa.

## Rollback

O rollback deve remover somente as quatro policies e o bucket `profile-avatars`
se não houver objetos dependentes, além de restaurar o comportamento sem upload.
Não deve apagar metadata Auth nem Brands/Agencies. A execução remota do rollback
não faz parte desta revisão.
