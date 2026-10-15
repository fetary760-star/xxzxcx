import { NextResponse } from 'next/server';

/*
  GET /api/employees

  Dynamic-imports next-auth/jwt inside the handler to avoid build-time errors.
  Replace placeholder DB functions with your actual queries/ORM logic.
*/

const ALLOWED = ['director', 'team_leader', 'engineer', 'shop_tl', 'shop_manager'];

interface Token {
  role?: string
  user?: {
    role?: string
    id?: string
  }
  sub?: string
  id?: string
  teamId?: string
  shopId?: string
  shop_id?: string
}

async function fetchAllEmployees() {
  // TODO: Replace with DB call returning all employee records
  return [];
}
async function fetchEmployeesForTeam() {
  // TODO: Replace with DB call returning employees for a specific team
  return [];
}
async function fetchEmployeesForShop() {
  // TODO: Replace with DB call returning employees for a specific shop
  return [];
}
async function fetchEmployeeById() {
  // TODO: Replace with DB call returning a single employee profile by userId
  return null;
}

export async function GET(req: Request) {
  try {
    let getToken: any;
    try {
      const nextAuthModule = await import('next-auth/jwt');
      getToken = nextAuthModule.getToken;
    } catch (impErr) {
      console.error('next-auth/jwt not available:', impErr);
      return new Response(JSON.stringify({
        error: 'Authentication library not available on server. Install next-auth or adapt this route to your auth system.'
      }), { status: 500, headers: { 'Content-Type': 'application/json' } });
    }

    const cookie = req.headers.get('cookie') ?? '';
    const token = await getToken({ req: { headers: { cookie } }, secret: process.env.NEXTAUTH_SECRET });

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { 'Content-Type': 'application/json' } });
    }

    const role = token.role || token.user?.role;
    const userId = token.sub || token.user?.id || token.id;
    const teamId = token.teamId || token.shopId || token.shop_id;

    if (!role || !ALLOWED.includes(role)) {
      return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
    }

    const url = new URL(req.url);
    const qUserId = url.searchParams.get('userId');
    const qTeamId = url.searchParams.get('teamId');
    const qShopId = url.searchParams.get('shopId');

    if (role === 'director') {
      const data = await fetchAllEmployees();
      return NextResponse.json(data);
    }

    if (role === 'team_leader') {
      const effectiveTeamId = qTeamId ?? teamId;
      if (!effectiveTeamId) {
        return new Response(JSON.stringify({ error: 'Team not identified' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const data = await fetchEmployeesForTeam();
      return NextResponse.json(data);
    }

    if (role === 'shop_tl' || role === 'shop_manager') {
      const effectiveShopId = qShopId ?? teamId;
      if (!effectiveShopId) {
        return new Response(JSON.stringify({ error: 'Shop not identified' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const data = await fetchEmployeesForShop();
      return NextResponse.json(data);
    }

    if (role === 'engineer') {
      if (qUserId && qUserId !== userId) {
        return new Response(JSON.stringify({ error: 'Engineers may only view their own profile' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
      }
      const effectiveUserId = qUserId ?? userId;
      if (!effectiveUserId) {
        return new Response(JSON.stringify({ error: 'User identity not found' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
      }
      const data = await fetchEmployeeById();
      return NextResponse.json(data);
    }

    return new Response(JSON.stringify({ error: 'Forbidden' }), { status: 403, headers: { 'Content-Type': 'application/json' } });
  } catch (err: unknown) {
    console.error('Employees API error:', err);
    const errorMessage = err instanceof Error ? err.message : 'Internal Server Error'
    return new Response(JSON.stringify({ error: errorMessage }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }
}