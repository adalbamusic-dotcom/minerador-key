import { WriterPage } from "@/components/product/operational-pages";
export default async function Page({ searchParams }: { searchParams: Promise<{ articleId?: string | string[]; documentId?: string | string[] }> }) {
  const query = await searchParams; const articleId = Array.isArray(query.articleId) ? query.articleId[0] : query.articleId;
  const documentId = Array.isArray(query.documentId) ? query.documentId[0] : query.documentId;
  return <WriterPage initialArticleId={articleId || null} initialDocumentId={documentId || null}/>;
}
