import { proxyRequest } from '@/app/api/proxy/utils';

// GET /api/tasks/:id/update-history -> proxies to BACKEND_URL/tasks/:id/update-history
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `/tasks/${encodeURIComponent(id)}/update-history`);
}