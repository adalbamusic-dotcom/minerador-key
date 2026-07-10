import { NextResponse } from 'next/server';
import { requireSessionProfile, authzErrorResponse } from '@/lib/server/authz';

export async function POST(request: Request) {
  try {
    // 1. Autenticacao: protege gasto de chave de API externa
    await requireSessionProfile();

    // 2. Recebe a lista de palavras enviada pelo seu frontend (ex: ['botox', 'harmonização facial'])
    const { keywords } = await request.json();

    if (!keywords || !Array.isArray(keywords) || keywords.length === 0) {
      return NextResponse.json({ error: 'Nenhuma palavra-chave fornecida.' }, { status: 400 });
    }

    let resultData;

    // Se RAPIDAPI_KEY estiver configurado, utiliza o fluxo da RapidAPI
    if (process.env.RAPIDAPI_KEY) {
      const url = process.env.RAPIDAPI_URL || 'https://google-keyword-search-volume.p.rapidapi.com/v1/keywords';
      const host = process.env.RAPIDAPI_HOST || 'google-keyword-search-volume.p.rapidapi.com';

      // Nota: Adapte o método (POST/GET) e o payload do body conforme a API do RapidAPI que você escolheu.
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'x-rapidapi-key': process.env.RAPIDAPI_KEY,
          'x-rapidapi-host': host,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({ keywords, country: 'br' })
      });

      if (!response.ok) {
        throw new Error('Falha na comunicação com o provedor RapidAPI.');
      }
      
      const responseJson = await response.json();
      resultData = responseJson.data || responseJson;
    } else {
      // 2. A API do Keywords Everywhere exige os dados no formato form-urlencoded
      const formData = new URLSearchParams();
      formData.append('country', 'br'); // Foca no volume do Brasil
      formData.append('currency', 'brl');
      formData.append('dataSource', 'gkp'); // Google Keyword Planner data
      
      // Adiciona cada palavra-chave no corpo da requisição
      keywords.forEach((kw) => formData.append('kw[]', kw));

      // 3. Faz a requisição para a API externa usando a sua chave guardada no .env.local
      const response = await fetch('https://api.keywordseverywhere.com/v1/get_keyword_data', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.KEYWORDS_EVERYWHERE_API_KEY}`,
          'Accept': 'application/json',
          'Content-Type': 'application/x-www-form-urlencoded'
        },
        body: formData
      });

      if (!response.ok) {
        throw new Error('Falha na comunicação com o provedor Keywords Everywhere.');
      }

      // 4. Recebe o pacote com os volumes
      const responseJson = await response.json();
      resultData = responseJson.data;
    }

    // 5. Retorna para o frontend atualizar a tabela visualmente
    return NextResponse.json({ success: true, data: resultData });

  } catch (error) {
    const mapped = authzErrorResponse(error);
    if (mapped.status === 500) console.error('Erro na rota de volume:', error);
    return NextResponse.json(
      { success: false, error: mapped.message || 'Erro interno ao processar os volumes.' },
      { status: mapped.status }
    );
  }
}
