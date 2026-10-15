// types/next-auth.d.ts
// Extend NextAuth types to include role and shop_id on session.user
import NextAuth from "next-auth";

declare module "next-auth" {
  interface Session {
    user: {
      name?: string | null;
      email?: string | null;
      image?: string | null;
      // added fields
      role?: string | null;
      shop_id?: number | null;
      accessToken?: string | null;
    };
  }

  // If you also use JWT, extend as needed
  interface User {
    role?: string | null;
    shop_id?: number | null;
  }
}