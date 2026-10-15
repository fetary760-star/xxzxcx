import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthorizationHeader } from '@/lib/proxy-auth';

const API_BASE = (process.env.CMT_API_BASE_URL || process.env.NEXT_PUBLIC_API_BASE_URL || 'http://localhost:5000/api').replace(/\/+$/, '');

/**
 * /api/reports/export-performance  —  AMENDED
 *
 * FIX #2 (extra records in the exported file)
 *   a) export_mode === 'selected' with an EMPTY engineer list is now rejected
 *      instead of silently exporting every engineer.
 *   b) Empty / 'all' / duplicate engineer values are stripped before they reach
 *      the backend, so "?engineer=" can no longer disable the filter.
 *   c) The rows returned by the backend are re-verified against the selected
 *      engineer list on this side too (defence in depth), so a row that does not
 *      match the selection can never reach the file.
 *   d) Rows with no data inside the selected window (assigned = 0 AND completed = 0)
 *      are dropped — these were the "extra records" appearing in the export.
 *   e) The applied filters echoed by the backend are written into the file header
 *      so the exported content is auditable.
 *
 * FIX #1  Exclusive buckets: Early + On-Time + Delayed == Completed. A separate
 *         "Met Target (Early+On-Time)" column carries the rate numerator.
 *
 * FIX #3  On-Time Rate is exactly 100.00% when the engineer has no delayed task.
 */

const toNumber = (value: any): number => {
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
};

const fmtRate = (value: any): string => toNumber(value).toFixed(2);

const csvCell = (value: any): string => `"${String(value ?? '').replace(/"/g, '""')}"`;

const deriveRating = (efficiency: number, completed: number): string => {
  if (completed <= 0) return 'No Data';
  if (efficiency > 100) return 'Outstanding';
  if (efficiency >= 85) return 'Excellent';
  if (efficiency >= 70) return 'Good';
  if (efficiency >= 50) return 'Fair';
  return 'Needs Improvement';
};

const norm = (value: any): string => String(value ?? '').trim().toLowerCase();

/**
 * Normalises one backend row into the exact numbers written to the file.
 * All three fixes are applied here so the export and the grid can never diverge.
 */
const normalizeRow = (r: any) => {
  const completed = toNumber(r.completed_tasks_count);
  const delayed = toNumber(r.delayed_completed_count);

  // FIX #1: the backend now sends exclusive buckets. The fallback below keeps the
  // export working against an older payload where on_time still contained early.
  const exactlyOnTime = r.exactly_on_time_count !== undefined && r.exactly_on_time_count !== null
    ? toNumber(r.exactly_on_time_count)
    : toNumber(r.on_time_completed_count);

  let early = r.early_completed_count !== undefined && r.early_completed_count !== null
    ? toNumber(r.early_completed_count)
    : Math.max(0, completed - exactlyOnTime - delayed);

  let onTime = exactlyOnTime;

  // Hard reconciliation: Early + On-Time + Delayed MUST equal Completed.
  const classified = early + onTime + delayed;
  if (classified !== completed) {
    if (classified < completed) {
      onTime += completed - classified;
    } else {
      // Trim the surplus from the non-delayed buckets only.
      let surplus = classified - completed;
      const trimOnTime = Math.min(surplus, onTime);
      onTime -= trimOnTime;
      surplus -= trimOnTime;
      early = Math.max(0, early - surplus);
    }
  }

  const metTarget = r.met_target_count !== undefined && r.met_target_count !== null
    ? toNumber(r.met_target_count)
    : early + onTime;

  // FIX #3: no delayed task => exactly 100%.
  const onTimeRate = completed > 0 && delayed === 0
    ? 100
    : (completed > 0 ? (metTarget / completed) * 100 : 0);
  const delayRate = completed > 0 && delayed === 0
    ? 0
    : (completed > 0 ? (delayed / completed) * 100 : 0);

  const earlyBonusRate = toNumber(r.early_bonus_rate);
  const earlyRate = completed > 0 ? (early / completed) * 100 + earlyBonusRate : 0;
  const efficiency = onTimeRate + earlyBonusRate;

  return {
    engineerName: String(r.engineer_name ?? ''),
    assigned: toNumber(r.total_assigned_tasks),
    completed,
    early,
    onTime,
    delayed,
    metTarget,
    onTimeRate,
    delayRate,
    earlyRate,
    earlyBonusRate,
    efficiency,
    rating: r.efficiency_rating ?? deriveRating(efficiency, completed),
    activeTasks: toNumber(r.active_tasks),
    pendingTasks: toNumber(r.pending_tasks),
    inProgressTasks: toNumber(r.in_progress_tasks),
    blockedTasks: toNumber(r.blocked_tasks),
    onHoldTasks: toNumber(r.on_hold_tasks),
    pausedTasks: toNumber(r.paused_tasks),
    rejectedTasks: toNumber(r.rejected_tasks),
    cancelledTasks: toNumber(r.cancelled_tasks),
    pendingTlTasks: toNumber(r.pending_tl_approval_tasks),
  };
};

export async function GET(req: NextRequest) {
  try {
    const url = new URL(req.url);

    // ===== FIX #2b: sanitise the engineer selection =====
    const engineers = Array.from(new Set(
      url.searchParams.getAll('engineer')
        .map(e => (e ?? '').trim())
        .filter(e => e.length > 0 && e.toLowerCase() !== 'all')
    ));

    const category = url.searchParams.get('category');
    const priority = url.searchParams.get('priority');
    const shop = url.searchParams.get('shop');
    const status = url.searchParams.get('status');
    const startDate = url.searchParams.get('start_date');
    const endDate = url.searchParams.get('end_date');
    const exportMode = url.searchParams.get('export_mode') === 'selected' ? 'selected' : 'all';

    // ===== FIX #2a: 'selected' without a selection must NOT fall back to all =====
    if (exportMode === 'selected' && engineers.length === 0) {
      return NextResponse.json(
        { message: 'Please select at least one engineer before exporting the selected engineers.' },
        { status: 400 }
      );
    }

    // Build query params for the backend performance API — exactly the filters chosen.
    const backendParams = new URLSearchParams();
    if (exportMode === 'selected') {
      engineers.forEach(e => backendParams.append('engineer', e));
    }
    if (category && category !== 'all') backendParams.set('category', category);
    if (priority && priority !== 'all') backendParams.set('priority', priority);
    if (shop && shop !== 'all') backendParams.set('shop', shop);
    if (status && status !== 'all') backendParams.set('status', status);
    if (startDate) backendParams.set('start_date', startDate);
    if (endDate) backendParams.set('end_date', endDate);

    // Forward auth headers
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    const auth = resolveAuthorizationHeader(req);
    if (auth) headers['Authorization'] = auth;
    const cookie = req.headers.get('cookie');
    if (cookie) headers['Cookie'] = cookie;

    const backendUrl = `${API_BASE}/performance?${backendParams.toString()}`;
    const res = await fetch(backendUrl, { method: 'GET', headers, cache: 'no-store' });

    if (!res.ok) {
      console.error('Export: Backend performance API error:', res.status);
      return NextResponse.json({ message: 'Failed to fetch performance data for export' }, { status: res.status });
    }

    const data = await res.json();
    const rawRows: any[] = Array.isArray(data.summary_table_data)
      ? data.summary_table_data
      : (Array.isArray(data) ? data : data.summary ?? data.rows ?? []);

    // ===== FIX #2c: re-verify each row against the selection on this side =====
    const selectedSet = new Set(engineers.map(norm));
    let filteredRows = rawRows.filter(r => {
      const name = norm(r.engineer_name);
      if (!name) return false;
      if (exportMode === 'selected') return selectedSet.has(name);
      // 'all' mode: if the UI still passed an engineer list, honour it.
      if (selectedSet.size > 0) return selectedSet.has(name);
      return true;
    });

    // ===== FIX #2d: drop rows with no task at all inside the selected window =====
    filteredRows = filteredRows.filter(r =>
      toNumber(r.total_assigned_tasks) > 0 || toNumber(r.completed_tasks_count) > 0
    );

    const rows = filteredRows.map(normalizeRow);

    if (rows.length === 0) {
      return NextResponse.json({ message: 'No data available for export with the selected filters' }, { status: 404 });
    }

    // Build CSV — mirrors the Performance Summary grid columns
    const csvHeaders = [
      'Engineer',
      'Assigned',
      'Completed',
      'Early Tasks',
      'On-Time (Count)',
      'Delayed (Count)',
      'Met Target (Early + On-Time)',
      'On-Time Rate (%)',
      'Delay Rate (%)',
      'Early Rate (%)',
      'Efficiency (%)',
      'Efficiency Rating',
      'Active Tasks',
      'Pending Tasks',
      'In Progress Tasks',
      'Blocked Tasks',
      'On Hold Tasks',
      'Paused Tasks',
      'Rejected Tasks',
      'Cancelled Tasks',
      'Pending TL Approval'
    ];

    const csvRows = rows.map(r => [
      csvCell(r.engineerName),
      r.assigned,
      r.completed,
      r.early,
      r.onTime,
      r.delayed,
      r.metTarget,
      fmtRate(r.onTimeRate),
      fmtRate(r.delayRate),
      fmtRate(r.earlyRate),
      fmtRate(r.efficiency),
      csvCell(r.rating),
      r.activeTasks,
      r.pendingTasks,
      r.inProgressTasks,
      r.blockedTasks,
      r.onHoldTasks,
      r.pausedTasks,
      r.rejectedTasks,
      r.cancelledTasks,
      r.pendingTlTasks
    ].join(','));

    // ===== OVERALL TOTALS ROW (recomputed from the exported rows only) =====
    const sum = (pick: (r: ReturnType<typeof normalizeRow>) => number) =>
      rows.reduce((s, r) => s + pick(r), 0);

    const totalAssigned = sum(r => r.assigned);
    const totalCompleted = sum(r => r.completed);
    const totalEarly = sum(r => r.early);
    const totalOnTime = sum(r => r.onTime);
    const totalDelayed = sum(r => r.delayed);
    const totalMetTarget = sum(r => r.metTarget);

    // FIX #3 at aggregate level too.
    const overallOnTimeRate = totalCompleted > 0 && totalDelayed === 0
      ? 100
      : (totalCompleted > 0 ? (totalMetTarget / totalCompleted) * 100 : 0);
    const overallDelayRate = totalCompleted > 0 && totalDelayed === 0
      ? 0
      : (totalCompleted > 0 ? (totalDelayed / totalCompleted) * 100 : 0);
    const weightedBonus = totalCompleted > 0
      ? sum(r => r.earlyBonusRate * r.completed) / totalCompleted
      : 0;
    const overallEarlyRate = totalCompleted > 0 ? (totalEarly / totalCompleted) * 100 + weightedBonus : 0;
    const overallEfficiency = overallOnTimeRate + weightedBonus;

    const overallRow = [
      csvCell('OVERALL TOTAL / AVERAGE'),
      totalAssigned,
      totalCompleted,
      totalEarly,
      totalOnTime,
      totalDelayed,
      totalMetTarget,
      fmtRate(overallOnTimeRate),
      fmtRate(overallDelayRate),
      fmtRate(overallEarlyRate),
      fmtRate(overallEfficiency),
      csvCell(deriveRating(overallEfficiency, totalCompleted)),
      sum(r => r.activeTasks),
      sum(r => r.pendingTasks),
      sum(r => r.inProgressTasks),
      sum(r => r.blockedTasks),
      sum(r => r.onHoldTasks),
      sum(r => r.pausedTasks),
      sum(r => r.rejectedTasks),
      sum(r => r.cancelledTasks),
      sum(r => r.pendingTlTasks)
    ].join(',');

    // ===== FIX #2e: auditable filter header =====
    const applied = data.applied_filters ?? {};
    const filterInfo: string[] = [];
    filterInfo.push(engineers.length > 0 ? `Engineers: ${engineers.join('; ')}` : 'Engineers: All');
    filterInfo.push(`Category: ${category && category !== 'all' ? category : 'All'}`);
    filterInfo.push(`Priority: ${priority && priority !== 'all' ? priority : 'All'}`);
    filterInfo.push(`Shop: ${shop && shop !== 'all' ? shop : 'All'}`);
    filterInfo.push(`Status: ${status && status !== 'all' ? status : 'All'}`);
    filterInfo.push(`Start Date: ${applied.start_date ?? startDate ?? 'Not set'}`);
    filterInfo.push(`End Date: ${applied.end_date ?? endDate ?? 'Not set'}`);

    const csvContent = [
      csvCell(`Performance Export - ${new Date().toISOString().slice(0, 10)}`),
      csvCell(`Filters Applied: ${filterInfo.join(' | ')}`),
      csvCell(`Export Mode: ${exportMode === 'selected' ? `Selected Engineers (${engineers.length})` : 'All Engineers'}`),
      csvCell(`Rows Exported: ${rows.length}`),
      csvCell('Completed = Early + On-Time + Delayed. On-Time Rate uses Met Target (Early + On-Time) and is 100.00% when no task is delayed.'),
      csvCell('Rates above 100% in Early Rate / Efficiency indicate delivery ahead of the configured target.'),
      '',
      csvHeaders.join(','),
      ...csvRows,
      '',
      overallRow
    ].join('\n');

    const filename = `performance_export_${exportMode}_${new Date().toISOString().slice(0, 10)}.csv`;

    // BOM keeps Excel happy with UTF-8 content.
    return new NextResponse('\uFEFF' + csvContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${filename}"`,
      },
    });
  } catch (err) {
    console.error('Export performance failed', err);
    return NextResponse.json({ error: 'Export failed' }, { status: 500 });
  }
}