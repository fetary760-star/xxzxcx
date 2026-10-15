import { proxyRequest } from '@/app/api/proxy/utils';

// POST /api/tasks/:id/reject-completion -> proxies to BACKEND_URL/tasks/:id/reject-completion
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `/tasks/${encodeURIComponent(id)}/reject-completion`);
}