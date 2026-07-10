import NextAuth, { AuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";

export const authOptions: AuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || "",
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || "",
      authorization: {
        params: {
          scope: "openid email profile https://www.googleapis.com/auth/spreadsheets",
          prompt: "consent",
          access_type: "offline",
          response_type: "code",
        },
      },
    }),
    CredentialsProvider({
      name: "Supabase",
      credentials: {
        email: { label: "E-mail", type: "email", placeholder: "seu-email@exemplo.com" },
        password: { label: "Senha", type: "password" }
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) {
          throw new Error("E-mail e senha são obrigatórios.");
        }

        try {
          // Faz a autenticação na API do Supabase Auth
          const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/auth/v1/token?grant_type=password`, {
            method: "POST",
            headers: {
              "apikey": process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || "",
              "Content-Type": "application/json"
            },
            body: JSON.stringify({
              email: credentials.email,
              password: credentials.password
            })
          });

          if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.error_description || errorData.message || "E-mail ou senha incorretos.");
          }

          const data = await response.json();

          if (data.user) {
            return {
              id: data.user.id,
              name: data.user.email.split("@")[0],
              email: data.user.email,
              accessToken: data.access_token // Propaga o token de acesso do Supabase
            };
          }
        } catch (error: any) {
          console.error("Erro de autorização Supabase:", error);
          throw new Error(error.message || "Erro de conexão com o banco de dados.");
        }
        return null;
      }
    })
  ],
  callbacks: {
    async jwt({ token, account, user }) {
      // Login via Google OAuth
      if (account) {
        token.accessToken = account.access_token;
        token.accessTokenExpires = account.expires_at ? account.expires_at * 1000 : undefined;
        token.refreshToken = account.refresh_token;
      }
      // Login via E-mail/Senha (Supabase)
      if (user && (user as any).accessToken) {
        token.accessToken = (user as any).accessToken;
        token.userId = user.id;
      }
      return token;
    },
    async session({ session, token }) {
      session.accessToken = token.accessToken;
      session.error = token.error;
      if (token.userId) {
        session.user = {
          ...session.user,
          id: token.userId as string
        } as any;
      } else if (token.sub) {
        session.user = {
          ...session.user,
          id: token.sub
        } as any;
      }
      return session;
    },
  },
  secret: process.env.NEXTAUTH_SECRET,
  session: {
    strategy: "jwt",
  },
  pages: {
    signIn: "/",
  },
};

const handler = NextAuth(authOptions);

export { handler as GET, handler as POST };
