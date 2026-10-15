import { proxyRequest } from '@/app/api/proxy/utils';

// POST /api/tasks/:id/pause -> proxies to BACKEND_URL/tasks/:id/pause
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return proxyRequest(req, `/tasks/${encodeURIComponent(id)}/pause`);
}