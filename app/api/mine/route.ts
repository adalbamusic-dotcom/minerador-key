import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "../auth/[...nextauth]/route";
import { google } from "googleapis";

// Configura o tempo limite da requisição na Vercel (adequado para o loop de ~40s)
export const maxDuration = 60;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

export async function POST(req: Request) {
  try {
    // 1. Autenticação e validação de sessão
    const session = await getServerSession(authOptions);
    if (!session || !session.accessToken) {
      return NextResponse.json(
        { error: "Não autorizado. Por favor, conecte sua conta Google." },
        { status: 401 }
      );
    }

    const { seed, locations } = await req.json();
    if (!seed || !seed.trim()) {
      return NextResponse.json(
        { error: "A palavra-chave semente é obrigatória." },
        { status: 400 }
      );
    }
    if (!locations || !Array.isArray(locations) || locations.length === 0) {
      return NextResponse.json(
        { error: "Pelo menos uma localidade é obrigatória para a extração." },
        { status: 400 }
      );
    }

    const alphabet = "abcdefghijklmnopqrstuvwxyz".split("");
    const keywordsList: { keyword: string; location: string }[] = [];
    const seenKeywords = new Set<string>();

    // 3. Loop pelas localidades e letras para mineração
    for (const loc of locations) {
      for (const letter of alphabet) {
        // Delay de 1500ms entre requisições para respeitar o rate limit do Google Autocomplete
        await sleep(1500);

        // Se loc for "Brasil", faz busca nacional (sem concatenar cidade/estado)
        const query = loc === "Brasil" 
          ? `${seed.trim()} ${letter}` 
          : `${seed.trim()} ${letter} ${loc}`;

        const url = `http://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;

        try {
          const response = await fetch(url, {
            headers: {
              "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
          });

          if (response.ok) {
            const data = await response.json();
            const suggestions: string[] = data[1] || [];
            for (const sug of suggestions) {
              const cleaned = sug.trim().toLowerCase();
              if (cleaned) {
                // Evita duplicar a mesma palavra para a mesma localidade
                const key = `${cleaned}-${loc}`;
                if (!seenKeywords.has(key)) {
                  seenKeywords.add(key);
                  keywordsList.push({ keyword: cleaned, location: loc });
                }
              }
            }
          }
        } catch (err) {
          console.error(`Erro ao minerar sugestões para a localidade "${loc}" e letra "${letter}":`, err);
        }
      }
    }

    // Se nenhuma palavra-chave for encontrada
    if (keywordsList.length === 0) {
      return NextResponse.json({
        success: true,
        message: "Nenhuma sugestão de palavra-chave foi encontrada.",
        keywords: [],
        spreadsheetUrl: null
      });
    }

    const keywords = Array.from(new Set(keywordsList.map(item => item.keyword)));

    // 4. Integração com o Google Sheets para salvar os dados
    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: session.accessToken });
    const sheets = google.sheets({ version: "v4", auth });

    const sheetTitle = `Minerador Key: ${seed.trim()} (${locations.length} locs)`;

    // Cria uma nova planilha no Drive do usuário autenticado
    const createResponse = await sheets.spreadsheets.create({
      requestBody: {
        properties: {
          title: sheetTitle,
        },
      },
    });

    const spreadsheetId = createResponse.data.spreadsheetId;
    const spreadsheetUrl = createResponse.data.spreadsheetUrl;
    const firstSheetTitle = createResponse.data.sheets?.[0]?.properties?.title || "Sheet1";

    if (!spreadsheetId) {
      throw new Error("Falha ao inicializar planilha no Google Sheets.");
    }

    // Estruturação dos dados da planilha de acordo com os requisitos estritos (com coluna Localidade)
    const values = [
      ["Keyword", "Localidade", "Resultados", "Volume", "KGR", "Search String"],
      ...keywordsList.map((item, index) => {
        const rowIndex = index + 2; // Linha 1 é o cabeçalho
        
        // Resultados / Volume (Colunas C e D)
        const kgrFormula = `=IFERROR(C${rowIndex}/D${rowIndex}, 0.000)`;
        
        const formattedKw = item.keyword.replace(/\s+/g, "+");
        const searchString = `https://www.google.com/search?q=allintitle:${formattedKw}`;

        return [
          item.keyword,  // Coluna A (Keyword)
          item.location, // Coluna B (Localidade)
          "",            // Coluna C (Resultados)
          "",            // Coluna D (Volume)
          kgrFormula,    // Coluna E (KGR)
          searchString   // Coluna F (Search String)
        ];
      })
    ];

    // Escreve os dados estruturados na planilha
    await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${firstSheetTitle}!A1`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values,
      },
    });

    return NextResponse.json({
      success: true,
      keywords,
      spreadsheetUrl,
      spreadsheetId
    });

  } catch (error: any) {
    console.error("Erro na API de mineração:", error);

    // Verifica se é um erro de credencial expirada/revogada do Google
    const isAuthError = 
      error.status === 401 || 
      error.message?.includes("invalid_grant") || 
      error.message?.includes("invalid_credentials") || 
      error.message?.includes("auth") ||
      error.response?.status === 401;

    if (isAuthError) {
      return NextResponse.json(
        { error: "Sua conexão com o Google expirou. Por favor, saia (Sair) e entre novamente para reautorizar a ferramenta." },
        { status: 401 }
      );
    }

    return NextResponse.json(
      { error: `Ocorreu um erro no processamento: ${error.message || "Erro interno do servidor"}` },
      { status: 500 }
    );
  }
}
