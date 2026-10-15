import { proxyRequest } from '@/app/api/proxy/utils';

// GET /api/tasks/:id/pause-history -> proxies to BACKEND_URL/tasks/:id/pause-history
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `/tasks/${encodeURIComponent(id)}/pause-history`);
}