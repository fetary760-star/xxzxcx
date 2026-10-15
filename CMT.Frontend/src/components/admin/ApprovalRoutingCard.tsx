"use client"

/**
 * ApprovalRoutingCard — NEW FILE (amendment v5).
 *
 * Specification: "Based on the existing Table of Contents and forms for approval,
 * rejection, delegation, editing, etc., these roles should be included to ensure
 * the workflow reaches all users created and assigned accordingly, enabling them
 * to take the appropriate actions."
 *
 * The chain itself already exists on both sides (RoleHierarchy.StandardChain and
 * STANDARD_CHAIN in lib/role-hierarchy.ts), but the Admin Panel never showed it,
 * so there was no way to verify that a newly created role can actually act on the
 * forms. This card renders the chain, the roles entitled to act at each stage,
 * which of them may DELEGATE the stage, and the two exit paths (rejection returns
 * to the originator, a return hands the record back to the previous stage).
 */

import {
  STANDARD_CHAIN,
  canActOn,
  canDelegate,
  roleLabel,
} from '@/lib/role-hierarchy';
import { ApprovalStatus } from '@/lib/self-evaluation/types';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';

const STATUS_LABELS: Record<number, string> = {
  [ApprovalStatus.Draft]: 'Draft',
  [ApprovalStatus.PendingTeamLeaderReview]: 'PendingTeamLeaderReview',
  [ApprovalStatus.PendingManagerApproval]: 'PendingManagerApproval',
  [ApprovalStatus.PendingDirectorApproval]: 'PendingDirectorApproval',
  [ApprovalStatus.PendingQAApproval]: 'PendingQAApproval',
  [ApprovalStatus.Approved]: 'Approved',
  [ApprovalStatus.Rejected]: 'Rejected',
  [ApprovalStatus.Returned]: 'Returned',
};

export interface ApprovalRoutingCardProps {
  /** Canonical role of the signed-in user, used to highlight their own stages. */
  currentRole: string;
}

export default function ApprovalRoutingCard({ currentRole }: ApprovalRoutingCardProps) {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-sm font-medium">Approval Routing</CardTitle>
        <CardDescription className="text-xs">
          Every Table of Contents form follows this chain, so each role created in User Management can review,
          approve, reject, return or delegate at its own stage. Stages you may act on are highlighted.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs">#</TableHead>
              <TableHead className="text-xs">Stage</TableHead>
              <TableHead className="text-xs">Status</TableHead>
              <TableHead className="text-xs">Roles that may act</TableHead>
              <TableHead className="text-xs">You</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {STANDARD_CHAIN.map((stage, index) => {
              const mayAct = canActOn(currentRole, stage.status);
              const mayDelegate = canDelegate(currentRole, stage.status);
              return (
                <TableRow key={stage.status} className={mayAct ? 'bg-blue-50/60' : undefined}>
                  <TableCell className="text-xs font-mono">{index + 1}</TableCell>
                  <TableCell className="text-xs font-medium">{stage.title}</TableCell>
                  <TableCell className="text-xs font-mono">{STATUS_LABELS[stage.status]}</TableCell>
                  <TableCell className="text-xs">
                    <div className="flex flex-wrap gap-1">
                      {stage.approverRoles.map(role => (
                        <Badge key={role} variant="outline" className="text-[9px]">{roleLabel(role)}</Badge>
                      ))}
                    </div>
                  </TableCell>
                  <TableCell className="text-[10px]">
                    {mayAct ? (
                      <span className="text-blue-700">
                        Approve / Reject / Return{mayDelegate ? ' / Delegate' : ''}
                      </span>
                    ) : (
                      <span className="text-slate-400">—</span>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}

            <TableRow>
              <TableCell className="text-xs font-mono">✓</TableCell>
              <TableCell className="text-xs font-medium">Approved</TableCell>
              <TableCell className="text-xs font-mono">{STATUS_LABELS[ApprovalStatus.Approved]}</TableCell>
              <TableCell className="text-xs text-slate-400">Chain complete</TableCell>
              <TableCell className="text-[10px] text-slate-400">—</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="text-xs font-mono">↩</TableCell>
              <TableCell className="text-xs font-medium">Returned for correction</TableCell>
              <TableCell className="text-xs font-mono">{STATUS_LABELS[ApprovalStatus.Returned]}</TableCell>
              <TableCell className="text-xs text-slate-500">Previous stage / originator corrects and resubmits</TableCell>
              <TableCell className="text-[10px] text-slate-400">—</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="text-xs font-mono">✕</TableCell>
              <TableCell className="text-xs font-medium">Rejected</TableCell>
              <TableCell className="text-xs font-mono">{STATUS_LABELS[ApprovalStatus.Rejected]}</TableCell>
              <TableCell className="text-xs text-slate-500">Originator revises and resubmits</TableCell>
              <TableCell className="text-[10px] text-slate-400">—</TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </CardContent>
    </Card>
  );
}