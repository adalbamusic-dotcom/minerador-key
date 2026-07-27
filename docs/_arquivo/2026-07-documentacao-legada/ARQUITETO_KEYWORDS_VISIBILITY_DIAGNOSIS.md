# Diagnostico de visibilidade de keywords no Arquiteto

## Causa raiz

O catch block em `components/editorial-pipeline-context.tsx` linha 248 executava:
```js
window.localStorage.removeItem(workflowRecoveryStorageKey(selectedBrandId));
```
Isso apagava TODO o localStorage de recuperacao quando o `LocalWorkflowRecoverySchema.parse()` falhava, incluindo `architectImportedKeywordIds`. Sem esses IDs, `fetchMasterList` so carregava keywords publicadas do Supabase.

## Rastreamento por camadas

### Camada 1-2: Minerador (Supabase)
- Fonte: tabela `keywords_kgr` com `status = "aprovado"` ou `status = "publicado"`
- Status: NAO afetados pelo bug (dados no Supabase permanecem intactos)

### Camada 3-4: Importacao e IDs importados
- `architectImportedKeywordIds` no pipeline context
- Fonte: localStorage via `LocalWorkflowRecoverySchema`
- Bug: catch block deletava localStorage se parse falhasse
- Resultado: IDs perdidos → `fetchMasterList` nao carregava aprovados

### Camada 5: fetchMasterList
- Busca keywords do Supabase com `status = "aprovado"` E `effectiveApprovedIds.has(k.id)`
- Se `architectImportedKeywordIds` estava vazio, `effectiveApprovedIds` so tinha `recoveredKeywordIds` do IndexedDB
- Se IndexedDB tambem estava vazio (primeira carga), nenhum aprovado era carregado
- Resultado: `items[]` so continha keywords publicadas

### Camada 6-7: Recuperacao local
- IndexedDB: ArticleDNA, SiloDNA, review recovery
- localStorage: workflow recovery (architectImportedKeywordIds, articleVersions, etc.)
- Bug: localStorage era deletado em caso de erro de parse

### Camada 8: Agrupamento
- `buildProvisionalGroups(items)` agrupa keywords em artigos
- Sem aprovados, grupos so continham publicados
- `articlesList` useMemo constroi artigos de `masterList`

### Camada 9: Filtros
- `filteredArticles` filtra por search/hierarquia/status
- Nao filtra por existencia de DNA (correto)
- Bug secundario: `articleWorkflowStatus` retornava "published" imediatamente para publicados, sem checar ArticleDNA

### Camada 10: Renderizacao
- `groupedArticles` agrupa `filteredArticles` por silo
- Se `filteredArticles` estava vazio, mostrava "Nenhum artigo disponivel"

## Correcoes aplicadas

### Correcao 1: Catch block nao deleta localStorage
Arquivo: `components/editorial-pipeline-context.tsx`

Antes:
```js
} catch {
  window.localStorage.removeItem(workflowRecoveryStorageKey(selectedBrandId));
  recoveredBrands.current.add(selectedBrandId);
}
```

Depois:
```js
} catch (error) {
  // NUNCA apagamos o localStorage. O parse pode falhar por mudanca de schema.
  console.error("[pipeline] recovery parse falhou, mantendo localStorage intacto", error);
  recoveredBrands.current.add(selectedBrandId);
}
```

### Correcao 2: articleWorkflowStatus checa ArticleDNA para publicados
Arquivo: `app/(workspace)/arquiteto/page.tsx`

Antes:
```js
if (art.isPublished) return "published";
const articleEntityId = art.mainKeywordObj?.provisionalGroupId || art.briefingId;
```

Depois:
```js
const articleEntityId = art.isPublished
  ? art.mainKeywordObj?.id
  : art.mainKeywordObj?.provisionalGroupId || art.briefingId;
// ... checa sent_radar, approved, awaiting_approval antes de retornar "published"
if (art.isPublished) return "published";
return "draft";
```

### Correcao 3: Diagnostic logs temporarios
Adicionados logs `console.log("[DIAG]...")` em:
- `fetchMasterList`: conta keywords do Supabase, aprovados, publicados, effectiveApprovedIds
- `articlesList`: conta total, publicados, novos
- `filteredArticles`: conta total, filtros ativos

Estes logs permitem rastrear exatamente onde as keywords desaparecem no console do navegador.

## Dados preservados

- IndexedDB: ArticleDNA, SiloDNA, review recovery - NAO afetados
- localStorage: NAO mais deletado em caso de erro de parse
- Supabase: keywords_kgr NAO afetado
- Historico: NAO afetado

## Arquivos modificados

- `components/editorial-pipeline-context.tsx` - catch block nao deleta localStorage
- `app/(workspace)/arquiteto/page.tsx` - articleWorkflowStatus + diagnostic logs

## Como usar os logs de diagnostico

1. Abra o Arquiteto no navegador
2. Abra o DevTools (F12) > Console
3. Atualize a pagina
4. Procure por linhas `[DIAG]` no console
5. Cada linha mostra a quantidade de keywords em cada camada
6. O primeiro `[DIAG]` que mostrar 0 ou um numero inesperado identifica onde as keywords desaparecem