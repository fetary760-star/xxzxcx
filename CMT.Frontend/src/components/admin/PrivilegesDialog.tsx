"use client"

/**
 * PrivilegesDialog - NEW FILE (amendment v5).
 *
 * Implements the specification line that had no UI at all before:
 *
 *   "Directors (one per department) ... Can assign privileges to roles such as
 *    edit, delete, etc."
 *
 * The server guard already exists (HierarchyRuleService.ValidatePermissionGrantAsync
 * + RoleHierarchy.CanGrantPermission), but the Admin Panel never offered a way to
 * call PUT /api/users/{id}/permissions, so privileges could only ever be the role
 * defaults.
 *
 * ============================ HOW IT STAYS SAFE ============================
 * The effective permission set of a user is, per RoleHierarchy:
 *
 *     effective = role defaults + AdditionalPermissions - RevokedPermissions
 *
 * So this dialog does NOT post the checked list. It posts the DIFF against the
 * target role's defaults:
 *
 *     permissionsToGrant  = checked   AND NOT a role default
 *     permissionsToRevoke = unchecked AND IS  a role default
 *
 * which is exactly the payload the server validates. Three client-side guards
 * mirror the server so an escalation is never even offered:
 *
 *   1. `canAdjustPrivilegesOf(grantor, target)` - the target role must be
 *      strictly less senior, and Director / Special Team Leader are Admin-only.
 *   2. `grantablePermissions(grantor)` - a grantor can only hand out privileges
 *      its OWN role holds (the Admin holds everything). The server value from
 *      GET /api/users/creation-rules wins when available.
 *   3. `canGrantPermission(grantor, target, permission)` - per checkbox, so a
 *      privilege outside the grantor's set renders disabled instead of silently
 *      failing with a 422.
 */

import { useEffect, useMemo, useState } from 'react';
import {
  DEFAULT_PERMISSIONS,
  canAdjustPrivilegesOf,
  canGrantPermission,
  effectivePermissions,
  normalizeRole,
  permissionLabel,
  roleLabel,
} from '@/lib/role-hierarchy';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription,
} from '@/components/ui/dialog';
import { AlertCircle, Loader2 } from 'lucide-react';

/** Minimal shape the dialog needs from a user row. */
export interface PrivilegeTarget {
  id: number;
  fullName: string;
  role: string;
  additionalPermissions: string | null;
  revokedPermissions: string | null;
}

export interface PrivilegesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** The user whose privileges are being edited. */
  target: PrivilegeTarget | null;
  /** Canonical role of the signed-in grantor. */
  grantorRole: string;
  /** Privileges the grantor may hand out (server value preferred). */
  grantablePermissions: string[];
  submitting: boolean;
  /** Receives the validated diff; the page performs the PUT. */
  onSave: (payload: { permissionsToGrant: string[]; permissionsToRevoke: string[] }) => void;
}

export default function PrivilegesDialog({
  open,
  onOpenChange,
  target,
  grantorRole,
  grantablePermissions,
  submitting,
  onSave,
}: PrivilegesDialogProps) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [blocked, setBlocked] = useState<string[]>([]);

  const targetCanonical = normalizeRole(target?.role) ?? '';
  const roleDefaults = useMemo<string[]>(
    () => DEFAULT_PERMISSIONS[targetCanonical] ?? [],
    [targetCanonical],
  );

  /** Role defaults plus everything the grantor may add on top. */
  const visiblePermissions = useMemo(
    () => Array.from(new Set([...roleDefaults, ...grantablePermissions])).sort(),
    [roleDefaults, grantablePermissions],
  );

  const canEditTarget = canAdjustPrivilegesOf(grantorRole, target?.role);

  /** Re-seed the checkboxes from the target's current effective set. */
  useEffect(() => {
    if (!open || !target) return;
    setBlocked([]);
    setSelected(
      new Set(effectivePermissions(target.role, target.additionalPermissions, target.revokedPermissions)),
    );
  }, [open, target]);

  const toggle = (permission: string, checked: boolean) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (checked) next.add(permission);
      else next.delete(permission);
      return next;
    });
  };

  const handleSave = () => {
    if (!target || !canEditTarget) return;

    const defaults = new Set(roleDefaults);
    const permissionsToGrant: string[] = [];
    const permissionsToRevoke: string[] = [];
    const rejected: string[] = [];

    // Checked but not a role default -> grant.
    for (const permission of selected) {
      if (defaults.has(permission)) continue;
      if (canGrantPermission(grantorRole, target.role, permission)) permissionsToGrant.push(permission);
      else rejected.push(permission);
    }
    // A role default that was unchecked -> revoke.
    for (const permission of defaults) {
      if (selected.has(permission)) continue;
      if (canGrantPermission(grantorRole, target.role, permission)) permissionsToRevoke.push(permission);
      else rejected.push(permission);
    }

    if (rejected.length > 0) {
      setBlocked(rejected);
      return;
    }

    setBlocked([]);
    onSave({ permissionsToGrant, permissionsToRevoke });
  };

  const grantCount = Array.from(selected).filter(p => !roleDefaults.includes(p)).length;
  const revokeCount = roleDefaults.filter(p => !selected.has(p)).length;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Assign Privileges</DialogTitle>
          <DialogDescription>
            {target
              ? `${target.fullName} - ${roleLabel(target.role)}. Only privileges your own role holds can be granted or revoked.`
              : 'Select a user first.'}
          </DialogDescription>
        </DialogHeader>

        {target && (
          <div className="space-y-3 max-h-[55vh] overflow-y-auto pr-2">
            {!canEditTarget && (
              <p className="text-[11px] text-red-600 flex items-start gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-[1px]" />
                <span>
                  A {roleLabel(grantorRole)} cannot change the privileges of a {roleLabel(target.role)}. You may only
                  adjust roles below your own, and Director / Special Team Leader privileges are Admin-only.
                </span>
              </p>
            )}

            {blocked.length > 0 && (
              <p className="text-[11px] text-red-600 flex items-start gap-1">
                <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-[1px]" />
                <span>
                  You cannot change {blocked.map(permissionLabel).join(', ')} because your own role does not hold that
                  privilege.
                </span>
              </p>
            )}

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {visiblePermissions.map(permission => {
                const editable = canEditTarget && canGrantPermission(grantorRole, target.role, permission);
                const isDefault = roleDefaults.includes(permission);
                return (
                  <label
                    key={permission}
                    className={`flex items-start gap-2 p-2 rounded-md border text-xs ${
                      editable ? 'bg-white border-gray-200' : 'bg-gray-50 border-gray-100 opacity-60'
                    }`}
                  >
                    <Checkbox
                      className="mt-[2px]"
                      checked={selected.has(permission)}
                      disabled={!editable}
                      onCheckedChange={checked => toggle(permission, checked === true)}
                    />
                    <span className="flex-1 min-w-0">
                      <span className="block font-medium truncate">{permissionLabel(permission)}</span>
                      <span className="block text-[9px] text-gray-400 font-mono truncate">{permission}</span>
                    </span>
                    {isDefault && (
                      <Badge variant="secondary" className="text-[8px] flex-shrink-0">
                        Role default
                      </Badge>
                    )}
                  </label>
                );
              })}
            </div>

            <p className="text-[10px] text-gray-500">
              Pending changes: {grantCount} to grant, {revokeCount} to revoke. The effective set is
              &quot;role defaults + granted - revoked&quot;.
            </p>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button size="sm" onClick={handleSave} disabled={submitting || !canEditTarget}>
            {submitting && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}Save Privileges
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}