'use client';

import { useAuth } from '@/lib/auth-context';
import Sidebar from './sidebar';
import Header from './header';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import NotificationToaster from '@/components/NotificationToaster';
import { SelfEvaluationSidebar } from '@/components/self-evaluation/SelfEvaluationSidebar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TLPermissionsProvider } from '@/lib/tl-permissions-context';
import { usePathname } from 'next/navigation';

interface MainLayoutProps {
  children: React.ReactNode;
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
      staleTime: 1000 * 30,
    },
    mutations: {
      retry: false,
    },
  },
});

export function MainLayout({ children }: MainLayoutProps) {
  const { user, isLoading, isAuthenticated } = useAuth();
  const router = useRouter();
  const pathname = usePathname() ?? '';
  const isSelfEvaluation = pathname === '/self-evaluation' || pathname.startsWith('/self-evaluation/');

  useEffect(() => {
    if (!isLoading && !isAuthenticated) {
      router.push('/login');
    }
  }, [isLoading, isAuthenticated, router]);

  if (isLoading) {
    return (
      <div className="flex h-screen items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return null;
  }

  return (
    <QueryClientProvider client={queryClient}>
      <TLPermissionsProvider>
        <div className="flex h-screen bg-gray-50">
          <Sidebar />
          {isSelfEvaluation && <SelfEvaluationSidebar />}
          <div className="flex-1 flex flex-col overflow-hidden">
            <Header />
            <NotificationToaster />
            <main className="flex-1 overflow-y-auto p-6">
              {children}
            </main>
          </div>
        </div>
      </TLPermissionsProvider>
    </QueryClientProvider>
  );
}

export default MainLayout;