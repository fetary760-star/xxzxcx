"use client"

/**
 * OrgHierarchyTree — NEW FILE (amendment v5).
 *
 * The old Admin Panel only grouped users by role, so the ACTUAL reporting lines
 * required by the specification were invisible:
 *
 *   Admin
 *     -> Director (one per department, Admin-assigned only)
 *          -> Manager (ACS, MCS, NDT, Standard ...)
 *               -> Shop Manager (per shop)
 *                    -> Shop Team Leader
 *               -> Shop Team Leader (shops without a Shop Manager)
 *                    -> Technician / Certifying Staff / QA / ECAA
 *     -> Special Team Leader (created by Admin UNDER a Director)
 *          -> Engineer
 *
 * This component renders that tree from `supervisorUserId`, and flags roles whose
 * data scope is the whole shop (Shop Manager / Shop Team Leader), which is the
 * "multiple Shop Team Leaders share information and responsibilities for the
 * shop" rule.
 */

import type { ReactNode } from 'react';
import {
  ALL_ROLES,
  ORG_ROLES,
  normalizeRole,
  roleLabel,
  sharesShopScope,
} from '@/lib/role-hierarchy';
import { Badge } from '@/components/ui/badge';
import {
  Building2, Crown, Briefcase, GitBranch, HardHat, Network, Shield,
  UserCheck, Users, Wrench, CornerDownRight,
} from 'lucide-react';

/** The subset of a user row the admin screens need. */
export interface AdminUserRecord {
  id: number;
  username: string;
  email: string;
  fullName: string;
  role: string;
  shopId: string | null;
  departmentId: string | null;
  jobTitle: string | null;
  personnelType: string | null;
  isActive: boolean;
  supervisorUserId: string | null;
  managerId: number | null;
  /** Needed to seed the privilege editor with the current effective set. */
  additionalPermissions: string | null;
  revokedPermissions: string | null;
}

/** One icon per canonical role, shared by every admin surface. */
export const ROLE_ICONS: Record<string, ReactNode> = {
  Admin: <Crown className="w-4 h-4 text-amber-500" />,
  Director: <Briefcase className="w-4 h-4 text-purple-500" />,
  SpecialTeamLeader: <GitBranch className="w-4 h-4 text-pink-500" />,
  Manager: <Network className="w-4 h-4 text-blue-500" />,
  ShopManager: <Building2 className="w-4 h-4 text-teal-500" />,
  TeamLeader: <HardHat className="w-4 h-4 text-orange-500" />,
  Engineer: <Wrench className="w-4 h-4 text-indigo-500" />,
  Technician: <Wrench className="w-4 h-4 text-slate-500" />,
  CertifyingStaff: <UserCheck className="w-4 h-4 text-green-500" />,
  QAPersonnel: <UserCheck className="w-4 h-4 text-cyan-500" />,
  ECAAPersonnel: <Shield className="w-4 h-4 text-rose-500" />,
};

export function roleIcon(role?: string | null): ReactNode {
  const canonical = normalizeRole(role) ?? '';
  return ROLE_ICONS[canonical] ?? <Users className="w-4 h-4 text-slate-400" />;
}

export interface TreeNode {
  user: AdminUserRecord;
  children: TreeNode[];
}

function rankOfUser(user: AdminUserRecord): number {
  const canonical = normalizeRole(user.role);
  const index = canonical ? ALL_ROLES.indexOf(canonical) : -1;
  return index < 0 ? Number.MAX_SAFE_INTEGER : index;
}

/**
 * Builds the reporting forest. Users whose supervisor is missing (or outside the
 * caller's visible scope) become roots, so nobody is ever hidden. Cycle safe.
 */
export function buildForest(users: AdminUserRecord[]): TreeNode[] {
  const nodes = new Map<number, TreeNode>();
  users.forEach(u => nodes.set(u.id, { user: u, children: [] }));

  const roots: TreeNode[] = [];

  users.forEach(u => {
    const node = nodes.get(u.id)!;
    const supervisorId = u.supervisorUserId ? Number(u.supervisorUserId) : NaN;
    const parent = Number.isFinite(supervisorId) ? nodes.get(supervisorId) : undefined;
    if (parent && parent.user.id !== u.id) parent.children.push(node);
    else roots.push(node);
  });

  const visited = new Set<number>();
  const sortRecursive = (list: TreeNode[]) => {
    list.sort((a, b) => rankOfUser(a.user) - rankOfUser(b.user) || a.user.fullName.localeCompare(b.user.fullName));
    list.forEach(node => {
      if (visited.has(node.user.id)) {
        node.children = [];
        return;
      }
      visited.add(node.user.id);
      sortRecursive(node.children);
    });
  };
  sortRecursive(roots);

  return roots;
}

interface BranchProps {
  node: TreeNode;
  depth: number;
  describe: (user: AdminUserRecord) => string;
}

function OrgBranch({ node, depth, describe }: BranchProps) {
  const canonical = normalizeRole(node.user.role) ?? '';
  const isShopGroup = sharesShopScope(canonical);
  const isAdminOnlyAssignment =
    canonical === ORG_ROLES.Director || canonical === ORG_ROLES.SpecialTeamLeader;

  return (
    <div>
      <div
        className="flex items-center gap-2 py-1.5 px-2 rounded-md border border-transparent hover:bg-slate-50 hover:border-slate-100"
        style={{ marginLeft: depth * 18 }}
      >
        {depth > 0 && <CornerDownRight className="w-3 h-3 text-slate-300 flex-shrink-0" />}
        {roleIcon(node.user.role)}
        <span className="text-xs font-medium truncate">{node.user.fullName}</span>
        <Badge variant="outline" className="text-[9px] flex-shrink-0">{roleLabel(node.user.role)}</Badge>
        {isAdminOnlyAssignment && (
          <Badge variant="secondary" className="text-[8px] flex-shrink-0">Admin-assigned</Badge>
        )}
        {isShopGroup && (
          <Badge variant="secondary" className="text-[8px] flex-shrink-0">Shared shop scope</Badge>
        )}
        {!node.user.isActive && (
          <Badge variant="secondary" className="text-[8px] flex-shrink-0">Inactive</Badge>
        )}
        <span className="text-[10px] text-slate-400 truncate">{describe(node.user)}</span>
      </div>
      {node.children.map(child => (
        <OrgBranch key={child.user.id} node={child} depth={depth + 1} describe={describe} />
      ))}
    </div>
  );
}

export interface OrgHierarchyTreeProps {
  users: AdminUserRecord[];
  describe: (user: AdminUserRecord) => string;
}

export default function OrgHierarchyTree({ users, describe }: OrgHierarchyTreeProps) {
  const forest = buildForest(users);

  if (forest.length === 0) {
    return <p className="text-xs text-gray-400 italic">No users found</p>;
  }

  return (
    <div className="space-y-0.5">
      {forest.map(node => (
        <OrgBranch key={node.user.id} node={node} depth={0} describe={describe} />
      ))}
    </div>
  );
}