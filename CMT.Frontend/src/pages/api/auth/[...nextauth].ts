import NextAuth, { AuthOptions, SessionStrategy } from 'next-auth'
import CredentialsProvider from 'next-auth/providers/credentials'

export const authOptions: AuthOptions = {
  providers: [
    CredentialsProvider({
      name: 'credentials',
      credentials: {
        username: { label: 'Username', type: 'text' },
        password: { label: 'Password', type: 'password' }
      },
      async authorize(credentials) {
        // Simple demo authentication - in production, connect to your actual auth system
        if (credentials?.username && credentials?.password) {
          // Demo user data - replace with actual authentication logic
          const user = {
            id: '1',
            name: credentials.username,
            email: `${credentials.username}@example.com`,
            role: 'engineer'
          }
          return user
        }
        return null
      }
    })
  ],
  session: {
    strategy: 'jwt' as SessionStrategy
  },
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = (user as any).role
      }
      return token
    },
    async session({ session, token }) {
      if (session.user) {
        (session.user as any).role = token.role as string
      }
      return session
    }
  },
  pages: {
    signIn: '/auth/signin',
  }
}

export default NextAuth(authOptions)