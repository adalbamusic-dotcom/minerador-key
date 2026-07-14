import { BrandPage } from "@/components/product/operational-pages";
export default async function Page({ searchParams }: { searchParams: Promise<{ secao?: string }> }) { return <BrandPage initialSection={(await searchParams).secao || "visao"}/>; }
