# Adendo SDD — Nome confirmado no ADMIN_TRUSTED_INVITE

**Módulo proprietário:** Admin Trusted Invite / Agency Onboarding

**Data:** 2026-08-13

**Status:** Implementado e homologado manualmente

**Implementação:** Realizada pela RPC transacional da migration 0039

**Migration:** `0039_trusted_invite_confirmed_agency_name.sql` aplicada e
post-verificada

**Operações remotas:** Aplicação e pós-verificação da 0039 foram relatadas
como concluídas antes desta atualização; nenhuma operação remota foi
executada nesta atualização documental.

## 1. Decisão

No fluxo `ADMIN_TRUSTED_INVITE`, `agency_invitations.proposed_agency_name`
continua obrigatório, mas passa a representar uma proposta editável pelo
convidado antes do aceite final.

O valor inicial continua sendo informado pelo Admin. O valor final confirmado
pelo convidado deve ser usado tanto em:

```text
agency_invitations.proposed_agency_name
agencies.name
```

O fluxo `PUBLIC_FREE_TRIAL` permanece inalterado. Templates e infraestrutura
de Communication não fazem parte deste adendo.

## 2. Permissão e estado editável

A edição somente é permitida quando todos os requisitos forem verdadeiros:

- ator autenticado;
- e-mail da sessão igual ao `destination_email` do convite;
- `source = 'ADMIN_INVITE'`;
- convite ainda `PENDING`;
- `expires_at > now()`;
- `access_expires_at` presente e ainda válido;
- Agency ainda não criada para o convite;
- aceite final ainda não consumido.

O convidado não pode editar responsável, e-mail, validade técnica do link ou
`access_expires_at`. Após `ACCEPTED`, o nome não pode ser alterado por essa
rota. Alterações posteriores pertencem às Configurações da Agency.

## 3. Validação server-side

O cliente envia somente o nome proposto para a operação autenticada. O
servidor deve revalidar sessão, convite, origem, estado, e-mail e expirações.

O nome confirmado deve ser:

- `btrim` aplicado no servidor;
- não vazio;
- limitado a 160 caracteres, conforme o contrato atual de
  `agency_invitations.proposed_agency_name`;
- usado para gerar o slug canônico da Agency;
- persistido sem aceitar override de outro campo ou identidade.

## 4. Atomicidade e implementação vigente

A RPC 0039
`complete_agency_onboarding_with_confirmed_agency_name(...)` é a fronteira
transacional canônica do `ADMIN_TRUSTED_INVITE` para receber o nome confirmado
e delegar o onboarding de Agency, owner, membership, onboarding, access period,
aceite do convite e consumo do token.

Ela revalida o ator e o convite, normaliza e persiste
`proposed_agency_name` e cria ou retorna o resultado canônico do onboarding na
mesma fronteira transacional.

Não existe uma sequência de `UPDATE agency_invitations` no TypeScript seguida
de uma chamada independente à RPC 0037. A alteração do nome e o aceite são
atômicos e idempotentes.

Segurança homologada: `SECURITY DEFINER`, `VOLATILE`, owner `postgres`,
`search_path` restrito e ACL conforme o contrato remoto verificado.

Classificação deste adendo:

```text
TRUSTED_INVITE_AGENCY_NAME_ATOMICITY = IMPLEMENTED_AND_POST_VERIFIED
```

## 5. Contrato implementado

A operação canônica mantém, na mesma transação:

1. lock e revalidação do convite/ator;
2. normalização e validação do nome;
3. atualização de `proposed_agency_name`;
4. criação ou readback idempotente de Agency, owner, membership e
   `agency_access_period`;
5. aceite do convite e consumo do token;
6. retorno do nome persistido e dos resultados canônicos.

Em qualquer falha, a transação inteira é revertida. Retry idempotente não
renomeia nem duplica Agency, membership ou access period.

O fluxo `PUBLIC_FREE_TRIAL` permanece compatível e continua usando sua
fronteira canônica própria.

## 6. UX homologada pelo contrato

Na tela `Confirmar sua Agência`, somente o campo Agency é editável antes da
criação. Responsável, e-mail e validade continuam somente leitura. O CTA é
`Confirmar e criar Agência` ou equivalente existente.

## 7. Aceite

O escopo foi liberado após evidência manual de:

- nome original sem alteração;
- nome corrigido persistido no convite e na Agency;
- criação/aceite transacional;
- retry idempotente sem duplicidade;
- `PUBLIC_FREE_TRIAL` e `access_expires_at` preservados.

Pendências de identidade existente, isolamento completo de múltiplos slots e
refinamentos de copy permanecem no backlog do Admin; não reabrem a fronteira
transacional homologada.

Classificação final: `TRUSTED_INVITE_AGENCY_NAME_IMPLEMENTED_AND_HOMOLOGATED`.
