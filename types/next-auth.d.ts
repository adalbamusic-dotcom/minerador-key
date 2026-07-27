import { DefaultSession } from "next-auth";
import type { SupabaseSessionReason } from "@/lib/auth/supabase-token";

declare module "next-auth" {
  interface Session {
    accessToken?: string;
    googleTokenError?: string;
    error?: string;
    supabaseAuth?: {
      status: "ready" | "error";
      reason: SupabaseSessionReason;
      expiresAt: number | null;
    };
    supabaseProvider?: "credentials" | "google";
    supabaseSessionReason?: SupabaseSessionReason;
    supabaseFailureExpiresAt?: number;
    user: {
      id?: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    accessToken?: string;
    accessTokenExpires?: number;
    refreshToken?: string;
    accessTokenKind?: "supabase";
    googleAccessToken?: string;
    googleAccessTokenExpires?: number;
    googleRefreshToken?: string;
    googleTokenError?: string;
    userId?: string;
    error?: string;
    supabaseProvider?: "credentials" | "google";
    supabaseSessionReason?: SupabaseSessionReason;
  }
}
