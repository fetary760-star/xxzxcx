"use client"

/**
 * Admin Panel — AMENDED v5.
 *
 * ===================== WHAT v5 CHANGES vs v4 =====================
 * v4 fixed the 422 "cannot create user" problem by driving the dropdowns from
 * GET /api/users/creation-rules. But the canonical hierarchy has since moved to
 * RoleHierarchy.cs v7 / role-hierarchy.ts v8, and this page was still the v4
 * file, so four requirements of the specification had NO user interface at all:
 *
 *  (1) THE MANAGER DELEGATION RULE (the "FYI" requirement).
 *      "Once the Manager role is created, the 'User Management' feature should
 *       restrict creating users who belong to the department from creating Shop
 *       Team Leaders or Shop Managers."
 *      v4 rendered every creatable role unconditionally, so a Director kept
 *      seeing Shop Manager / Shop Team Leader after the department got its
 *      Manager and only discovered the restriction through a late 422.
 *      v5 filters the Role dropdown with `isBlockedByManagerDelegation()`,
 *      evaluated against the department actually selected in the form (falling
 *      back to the caller's own department), and shows the server's
 *      `restrictions` notice. If the selected role becomes blocked because the
 *      department changed, it is cleared instead of failing on submit.
 *
 *  (2) PRIVILEGE DELEGATION ("Directors ... can assign privileges to roles such
 *      as edit, delete, etc."). v5 wires the Privileges dialog to
 *      PUT /api/users/{id}/permissions, posting the DIFF against the target
 *      role's defaults, and only offers it for targets the caller may adjust
 *      (`canAdjustPrivilegesOf`). The grantable set comes from the server when
 *      available, otherwise from the local mirror.
 *
 *  (3) THE REAL REPORTING LINES. v4 only grouped users by role, so
 *      Admin → Director → Manager → Shop Manager → Shop Team Leader →
 *      personnel, and Special Team Leader → Engineer, were invisible. v5 renders
 *      the actual tree from `supervisorUserId` via OrgHierarchyTree, plus the
 *      shop leadership groups ("multiple Shop Team Leaders share information and
 *      responsibilities for the shop").
 *
 *  (4) WORKFLOW REACH. "these roles should be included to ensure the workflow
 *      reaches all users created and assigned accordingly". v5 adds the
 *      Approval Routing tab so every role created here can be verified against
 *      the approve / reject / return / delegate chain of the Table of Contents
 *      forms.
 *
 * Everything v4 fixed is preserved: server-driven creatable roles, scoped
 * supervisor candidates, local pre-flight validation of
 * requiresShop / requiresDepartment / requiresSupervisor, and 422 field errors
 * rendered under the exact input that failed.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import apiClient from '@/lib/api';
import { getShops } from '@/lib/self-evaluation/api';
import type { ShopDto } from '@/lib/self-evaluation/types';
import {
  ORG_ROLES,
  ROLE_RULES,
  canGrantPrivileges,
  canAdjustPrivilegesOf,
  creatableRulesFiltered,
  grantablePermissions as grantablePermissionsFor,
  isBlockedByManagerDelegation,
  normalizeRole,
  roleLabel,
  ruleFor,
  type RoleRule,
} from '@/lib/role-hierarchy';
import { canAccessUserManagement } from '@/lib/nav-access';
import { parseApiError, type FieldErrors } from '@/lib/api-validation';
import OrgHierarchyTree, { roleIcon, type AdminUserRecord } from '@/components/admin/OrgHierarchyTree';
import ApprovalRoutingCard from '@/components/admin/ApprovalRoutingCard';
import PrivilegesDialog, { type PrivilegeTarget } from '@/components/admin/PrivilegesDialog';
import SignatureSpecimenPanel from '@/components/admin/SignatureSpecimenPanel';
import { canManageSignatures } from '@/lib/signature/signature-access';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { toast } from 'sonner';
import {
  ArrowLeft, Plus, Building2, Users, Shield, Loader2, UserPlus, Trash2, Edit,
  Network, GitBranch, AlertCircle, KeyRound, Workflow,
  PenLine, X,
} from 'lucide-react';

interface Shop {
  id: string;
  name: string;
  code: string;
  description: string;
  isActive: boolean;
}

interface Department {
  id: string;
  name: string;
  code: string;
  description: string;
  directorUserId: string | null;
  parentDepartmentId: string | null;
  isActive: boolean;
}

/** The admin directory row. Extends the shared shape used by OrgHierarchyTree. */
type UserRecord = AdminUserRecord;

interface SupervisorCandidate {
  id: number;
  fullName: string;
  username: string;
  role: string;
  shopId: string | null;
  departmentId: string | null;
  jobTitle: string | null;
}

/**
 * Shape returned by GET /api/users/creation-rules (amended controller).
 * `departmentHasActiveManager`, `restrictions` and `grantablePermissions` are
 * what make the delegation rule and the privilege editor server-driven.
 */
interface CreationRulesResponse {
  currentUserId: number;
  currentRole: string;
  currentRoleDisplayName: string;
  departmentId: string | null;
  shopId: string | null;
  departmentHasActiveManager?: boolean;
  restrictions?: string[];
  grantablePermissions?: string[];
  creatableRoles: Partial<RoleRule>[];
}

const NONE = 'none';

/**
 * Turns a server rule (which may omit the v8-only flags) into a complete
 * RoleRule by merging it with the local mirror. Never trusts a partial object.
 */
function hydrateRule(partial: Partial<RoleRule> | null | undefined): RoleRule | null {
  const canonical = normalizeRole(partial?.role);
  const local = canonical ? ROLE_RULES[canonical] : null;
  if (!local) return null;
  return {
    ...local,
    ...partial,
    role: local.role,
    displayName: partial?.displayName || local.displayName,
    description: partial?.description || local.description,
    allowedSupervisorRoles: partial?.allowedSupervisorRoles?.length
      ? partial.allowedSupervisorRoles
      : local.allowedSupervisorRoles,
    preferredSupervisorRoles: partial?.preferredSupervisorRoles?.length
      ? partial.preferredSupervisorRoles
      : local.preferredSupervisorRoles,
  };
}

/** Renders the first server-side error for a field, if any. */
function FieldError({ errors, field }: { errors: FieldErrors; field: string }) {
  const message = errors[field]?.[0];
  if (!message) return null;
  return (
    <p className="text-[10px] text-red-600 mt-1 flex items-start gap-1">
      <AlertCircle className="w-3 h-3 flex-shrink-0 mt-[1px]" />
      <span>{message}</span>
    </p>
  );
}

interface UserFormState {
  username: string;
  email: string;
  fullName: string;
  password: string;
  role: string;
  shopId: string;
  departmentId: string;
  supervisorUserId: string;
}

const EMPTY_USER_FORM: UserFormState = {
  username: '',
  email: '',
  fullName: '',
  password: '',
  role: '',
  shopId: '',
  departmentId: '',
  supervisorUserId: '',
};

export default function AdminPanel() {
  const { user, isLoading: authLoading } = useAuth();
  const router = useRouter();

  const [shops, setShops] = useState<Shop[]>([]);
  const [departments, setDepartments] = useState<Department[]>([]);
  const [users, setUsers] = useState<UserRecord[]>([]);
  const [creationRules, setCreationRules] = useState<RoleRule[]>([]);
  const [restrictions, setRestrictions] = useState<string[]>([]);
  const [serverDepartmentId, setServerDepartmentId] = useState<string | null>(null);
  const [serverHasActiveManager, setServerHasActiveManager] = useState(false);
  const [serverGrantable, setServerGrantable] = useState<string[]>([]);
  const [supervisorCandidates, setSupervisorCandidates] = useState<SupervisorCandidate[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [showAddShop, setShowAddShop] = useState(false);
  const [showCreateDepartment, setShowCreateDepartment] = useState(false);
  const [showCreateUser, setShowCreateUser] = useState(false);
  const [showAssignRole, setShowAssignRole] = useState(false);
  const [showPrivileges, setShowPrivileges] = useState(false);
  const [privilegeTarget, setPrivilegeTarget] = useState<PrivilegeTarget | null>(null);

  const [newShop, setNewShop] = useState({ name: '', code: '' });
  const [newDepartment, setNewDepartment] = useState({ name: '', code: '' });
  const [newUser, setNewUser] = useState<UserFormState>(EMPTY_USER_FORM);
  const [assignRole, setAssignRole] = useState<UserFormState & { userId: number }>({ ...EMPTY_USER_FORM, userId: 0 });

  const [userErrors, setUserErrors] = useState<FieldErrors>({});
  const [assignErrors, setAssignErrors] = useState<FieldErrors>({});

  const currentRole = normalizeRole(user?.role) ?? '';

  /**
   * AMENDED v6 — the page guard now uses the SAME derived rule as the sidebar
   * (`@/lib/nav-access`), instead of the hard-coded Admin / Director / Manager
   * list of v5. A role may open User Management when it can create at least one
   * role (CREATION_MATRIX) or when it may assign privileges, i.e. Admin,
   * Director, Special Team Leader, Manager, Shop Manager and Shop Team Leader.
   * Individual Personnel (Engineer, Technician, Certifying Staff, QA, ECAA)
   * create nobody and stay excluded. The server rules still win when
   * GET /api/users/creation-rules answers.
   */
  const canAccessAdmin = creationRules.length > 0 || canAccessUserManagement(currentRole);
  const canUploadSignatures = canManageSignatures(currentRole);

  /** Privileges the signed-in user may hand out (server value preferred). */
  const grantable = useMemo(
    () => (serverGrantable.length > 0 ? serverGrantable : grantablePermissionsFor(currentRole)),
    [serverGrantable, currentRole],
  );

  /**
   * Departments that already have an ACTIVE Manager. This is the trigger of the
   * delegation restriction and is derived from the directory itself, so the rule
   * applies the moment the Manager appears in the list.
   */
  const departmentsWithActiveManager = useMemo(
    () =>
      new Set(
        users
          .filter(u => u.isActive && normalizeRole(u.role) === ORG_ROLES.Manager && u.departmentId)
          .map(u => String(u.departmentId)),
      ),
    [users],
  );

  /** The department the restriction must be evaluated against, per form. */
  const scopeDepartmentOf = useCallback(
    (formDepartmentId: string) => formDepartmentId || serverDepartmentId || '',
    [serverDepartmentId],
  );

  const departmentHasActiveManager = useCallback(
    (formDepartmentId: string) => {
      const scope = scopeDepartmentOf(formDepartmentId);
      if (!scope) return serverHasActiveManager;
      return departmentsWithActiveManager.has(scope) || (scope === serverDepartmentId && serverHasActiveManager);
    },
    [scopeDepartmentOf, departmentsWithActiveManager, serverDepartmentId, serverHasActiveManager],
  );

  /**
   * THE "FYI" REQUIREMENT, applied to the dropdown: a department-level creator
   * loses Shop Manager / Shop Team Leader as soon as the department has an
   * active Manager who owns the shop layer.
   */
  const roleOptionsFor = useCallback(
    (formDepartmentId: string) => {
      const hasManager = departmentHasActiveManager(formDepartmentId);
      return creationRules.filter(rule => !isBlockedByManagerDelegation(currentRole, rule.role, hasManager));
    },
    [creationRules, currentRole, departmentHasActiveManager],
  );

  const createRoleOptions = useMemo(() => roleOptionsFor(newUser.departmentId), [roleOptionsFor, newUser.departmentId]);
  const assignRoleOptions = useMemo(() => roleOptionsFor(assignRole.departmentId), [roleOptionsFor, assignRole.departmentId]);

  /** Rule of the role currently selected in the Create User dialog. */
  const activeCreateRule = useMemo<RoleRule | null>(
    () => creationRules.find(r => r.role === newUser.role) ?? ruleFor(newUser.role),
    [creationRules, newUser.role],
  );

  /** Rule of the role currently selected in the Assign Role dialog. */
  const activeAssignRule = useMemo<RoleRule | null>(
    () => creationRules.find(r => r.role === assignRole.role) ?? ruleFor(assignRole.role),
    [creationRules, assignRole.role],
  );

  const loadCreationRules = useCallback(async () => {
    try {
      const response = await apiClient.get<CreationRulesResponse>('/users/creation-rules');
      const hydrated = (Array.isArray(response?.creatableRoles) ? response.creatableRoles : [])
        .map(hydrateRule)
        .filter((rule): rule is RoleRule => Boolean(rule));

      setServerDepartmentId(response?.departmentId ? String(response.departmentId) : null);
      setServerHasActiveManager(Boolean(response?.departmentHasActiveManager));
      setRestrictions(Array.isArray(response?.restrictions) ? response.restrictions : []);
      setServerGrantable(Array.isArray(response?.grantablePermissions) ? response.grantablePermissions : []);

      if (hydrated.length > 0) {
        setCreationRules(hydrated);
        return hydrated;
      }
    } catch (err) {
      console.error('Failed to load creation rules, falling back to the local mirror:', err);
    }
    // Fallback mirrors the server matrix INCLUDING the delegation rule.
    const fallback = creatableRulesFiltered(user?.role, serverHasActiveManager);
    setCreationRules(fallback);
    return fallback;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.role]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      await loadCreationRules();

      try {
        const shopsData = await getShops();
        setShops(
          (shopsData ?? []).map((s: ShopDto) => ({
            id: s.id,
            name: s.name,
            code: s.certificateNumber || '',
            description: s.address || '',
            isActive: s.isActive,
          })),
        );
      } catch (err) {
        console.error('Failed to load shops:', err);
        setShops([]);
      }

      try {
        const usersResponse = await apiClient.get<any>('/users?pageSize=500');
        const list: any[] = Array.isArray(usersResponse)
          ? usersResponse
          : Array.isArray(usersResponse?.data)
            ? usersResponse.data
            : Array.isArray(usersResponse?.$values)
              ? usersResponse.$values
              : [];

        setUsers(
          list.map((u: any) => ({
            id: Number(u.id ?? u.Id ?? 0),
            username: u.username ?? u.Username ?? '',
            email: u.email ?? u.Email ?? '',
            fullName: u.fullName ?? u.FullName ?? '',
            role: u.role ?? u.Role ?? '',
            shopId: u.shopId ?? u.ShopId ?? null,
            departmentId: u.departmentId ?? u.DepartmentId ?? null,
            jobTitle: u.jobTitle ?? u.JobTitle ?? null,
            personnelType: u.personnelType ?? u.PersonnelType ?? null,
            isActive: u.isActive ?? u.IsActive ?? true,
            supervisorUserId:
              u.supervisorUserId != null ? String(u.supervisorUserId) : u.SupervisorUserId != null ? String(u.SupervisorUserId) : null,
            managerId: u.managerId ?? u.ManagerId ?? null,
            additionalPermissions: u.additionalPermissions ?? u.AdditionalPermissions ?? null,
            revokedPermissions: u.revokedPermissions ?? u.RevokedPermissions ?? null,
          })),
        );
      } catch (err) {
        console.error('Failed to load users:', err);
        setUsers([]);
      }

      try {
        const deptResponse = await apiClient.get<any>('/self-evaluation/departments');
        const list: any[] = Array.isArray(deptResponse)
          ? deptResponse
          : Array.isArray(deptResponse?.data)
            ? deptResponse.data
            : Array.isArray(deptResponse?.$values)
              ? deptResponse.$values
              : [];

        setDepartments(
          list.map((d: any) => ({
            id: d.id ?? d.Id ?? '',
            name: d.name ?? d.Name ?? '',
            code: d.code ?? d.Code ?? '',
            description: d.description ?? d.Description ?? '',
            directorUserId: d.directorUserId != null ? String(d.directorUserId) : null,
            parentDepartmentId: d.parentDepartmentId ?? d.ParentDepartmentId ?? null,
            isActive: d.isActive ?? d.IsActive ?? true,
          })),
        );
      } catch (err) {
        console.error('Failed to load departments:', err);
        setDepartments([]);
      }
    } finally {
      setLoading(false);
    }
  }, [loadCreationRules]);

  useEffect(() => {
    if (!authLoading && !user) router.push('/dashboard');
  }, [authLoading, user, router]);

  useEffect(() => {
    if (user) loadData();
  }, [user, loadData]);

  /** Seeds the Role field once the creatable list is known. */
  useEffect(() => {
    if (!newUser.role && createRoleOptions.length > 0) {
      setNewUser(prev => (prev.role ? prev : { ...prev, role: createRoleOptions[0].role }));
    }
  }, [createRoleOptions, newUser.role]);

  /**
   * If the selected department introduces a Manager, a role that is now
   * delegated must not stay selected — clear it instead of failing on submit.
   */
  useEffect(() => {
    if (!showCreateUser || !newUser.role) return;
    if (createRoleOptions.some(r => r.role === newUser.role)) return;
    setNewUser(prev => ({ ...prev, role: createRoleOptions[0]?.role ?? '', supervisorUserId: '' }));
    toast.info('The shop layer of this department is delegated to its Manager, so that role is no longer available here.');
  }, [showCreateUser, newUser.role, createRoleOptions]);

  useEffect(() => {
    if (!showAssignRole || !assignRole.role) return;
    if (assignRoleOptions.some(r => r.role === assignRole.role)) return;
    setAssignRole(prev => ({ ...prev, role: assignRoleOptions[0]?.role ?? '', supervisorUserId: '' }));
  }, [showAssignRole, assignRole.role, assignRoleOptions]);

  /**
   * Loads only the supervisors the server accepts for the chosen role/shop.
   * This is what prevents "must report to a Shop Manager or Manager" 422s.
   */
  const loadSupervisorCandidates = useCallback(async (role: string, shopId: string, departmentId: string) => {
    if (!role) {
      setSupervisorCandidates([]);
      return;
    }
    const params = new URLSearchParams({ role });
    if (shopId) params.set('shopId', shopId);
    if (departmentId) params.set('departmentId', departmentId);
    try {
      const response = await apiClient.get<any>(`/users/supervisor-candidates?${params.toString()}`);
      const list: any[] = Array.isArray(response) ? response : Array.isArray(response?.data) ? response.data : [];
      setSupervisorCandidates(
        list.map((c: any) => ({
          id: Number(c.id ?? c.Id ?? 0),
          fullName: c.fullName ?? c.FullName ?? '',
          username: c.username ?? c.Username ?? '',
          role: c.role ?? c.Role ?? '',
          shopId: c.shopId ?? c.ShopId ?? null,
          departmentId: c.departmentId ?? c.DepartmentId ?? null,
          jobTitle: c.jobTitle ?? c.JobTitle ?? null,
        })),
      );
    } catch (err) {
      console.error('Failed to load supervisor candidates:', err);
      // Fallback: filter the already loaded users by the allowed supervisor roles.
      const rule = ruleFor(role);
      const allowed = rule?.allowedSupervisorRoles ?? [];
      setSupervisorCandidates(
        users
          .filter(u => u.isActive && allowed.includes(normalizeRole(u.role) ?? ''))
          .map(u => ({
            id: u.id,
            fullName: u.fullName,
            username: u.username,
            role: u.role,
            shopId: u.shopId,
            departmentId: u.departmentId,
            jobTitle: u.jobTitle,
          })),
      );
    }
  }, [users]);

  useEffect(() => {
    if (showCreateUser) {
      loadSupervisorCandidates(newUser.role, newUser.shopId, newUser.departmentId);
    }
  }, [showCreateUser, newUser.role, newUser.shopId, newUser.departmentId, loadSupervisorCandidates]);

  useEffect(() => {
    if (showAssignRole) {
      loadSupervisorCandidates(assignRole.role, assignRole.shopId, assignRole.departmentId);
    }
  }, [showAssignRole, assignRole.role, assignRole.shopId, assignRole.departmentId, loadSupervisorCandidates]);

  /**
   * Client-side mirror of the server rules, including the delegation rule, so
   * the user sees the problem instantly instead of a round-trip 422.
   */
  const validateStructure = (form: UserFormState, rule: RoleRule | null): FieldErrors => {
    const errors: FieldErrors = {};
    if (!form.role) errors.role = ['Select a role.'];
    if (!rule) return errors;

    if (isBlockedByManagerDelegation(currentRole, rule.role, departmentHasActiveManager(form.departmentId))) {
      errors.role = [
        `This department already has an active Manager who owns the shop layer, so a ${roleLabel(currentRole)} ` +
          `may no longer create a ${rule.displayName}. Ask that Manager to create it.`,
      ];
    }
    if (rule.requiresShop && !form.shopId) {
      errors.shopId = [`A ${rule.displayName} must be assigned to a shop.`];
    }
    if (rule.requiresDepartment && !form.departmentId) {
      errors.departmentId = [`A ${rule.displayName} must be assigned to a department.`];
    }
    if (rule.requiresSupervisor && !form.supervisorUserId) {
      const expected = rule.allowedSupervisorRoles.map(r => roleLabel(r)).join(' or ') || 'supervisor';
      errors.supervisorUserId = [`A ${rule.displayName} must be assigned under a ${expected}.`];
    }
    return errors;
  };

  /** Only sends ids that are actually set; never sends the string "none". */
  const buildIdPayload = (form: UserFormState) => {
    const payload: Record<string, unknown> = {};
    if (form.shopId && form.shopId !== NONE) payload.shopId = form.shopId;
    if (form.departmentId && form.departmentId !== NONE) payload.departmentId = form.departmentId;
    if (form.supervisorUserId && form.supervisorUserId !== NONE) payload.supervisorUserId = form.supervisorUserId;
    return payload;
  };

  const handleCreateUser = async () => {
    setUserErrors({});

    const local: FieldErrors = {};
    if (!newUser.username.trim()) local.username = ['Username is required.'];
    else if (newUser.username.trim().length < 3) local.username = ['Username must be at least 3 characters.'];
    if (!newUser.email.trim()) local.email = ['Email is required.'];
    else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newUser.email.trim())) local.email = ['Enter a valid email address.'];
    if (!newUser.fullName.trim()) local.fullName = ['Full name is required.'];
    if (!newUser.password) local.password = ['Password is required.'];
    else if (newUser.password.length < 6) local.password = ['Password must be at least 6 characters.'];

    Object.assign(local, validateStructure(newUser, activeCreateRule));

    if (Object.keys(local).length > 0) {
      setUserErrors(local);
      toast.error(Object.values(local)[0][0]);
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/users', {
        username: newUser.username.trim(),
        email: newUser.email.trim(),
        fullName: newUser.fullName.trim(),
        password: newUser.password,
        role: newUser.role,
        ...buildIdPayload(newUser),
      });
      toast.success('User created successfully');
      setShowCreateUser(false);
      setNewUser({ ...EMPTY_USER_FORM, role: createRoleOptions[0]?.role ?? '' });
      await loadData();
    } catch (err) {
      // 422 field errors land on the exact inputs that failed.
      const parsed = parseApiError(err, 'Failed to create user');
      setUserErrors(parsed.fieldErrors);
      toast.error(parsed.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleAssignRole = async () => {
    setAssignErrors({});

    const local: FieldErrors = {};
    if (!assignRole.userId || assignRole.userId <= 0) local.userId = ['Select a valid user.'];
    Object.assign(local, validateStructure(assignRole, activeAssignRule));

    if (Object.keys(local).length > 0) {
      setAssignErrors(local);
      toast.error(Object.values(local)[0][0]);
      return;
    }

    setSubmitting(true);
    try {
      await apiClient.post('/users/assign-role', {
        userId: assignRole.userId,
        role: assignRole.role,
        ...buildIdPayload(assignRole),
      });
      toast.success('Role assigned successfully');
      setShowAssignRole(false);
      setAssignRole({ ...EMPTY_USER_FORM, userId: 0 });
      await loadData();
    } catch (err) {
      const parsed = parseApiError(err, 'Failed to assign role');
      setAssignErrors(parsed.fieldErrors);
      toast.error(parsed.message);
    } finally {
      setSubmitting(false);
    }
  };

  /**
   * "Directors ... can assign privileges to roles such as edit, delete, etc."
   * The dialog produces the diff against the target role's defaults; the server
   * re-validates it with RoleHierarchy.CanGrantPermission.
   */
  const handleSavePrivileges = async (payload: { permissionsToGrant: string[]; permissionsToRevoke: string[] }) => {
    if (!privilegeTarget) return;
    setSubmitting(true);
    try {
      await apiClient.put(`/users/${privilegeTarget.id}/permissions`, payload);
      toast.success('Privileges updated successfully');
      setShowPrivileges(false);
      setPrivilegeTarget(null);
      await loadData();
    } catch (err) {
      toast.error(parseApiError(err, 'Failed to update privileges').message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCreateShop = async () => {
    if (!newShop.name.trim() || !newShop.code.trim()) {
      toast.error('Name and code are required');
      return;
    }
    try {
      await apiClient.post('/self-evaluation/shops', {
        name: newShop.name.trim(),
        certificateNumber: newShop.code.trim(),
      });
      toast.success('Shop created successfully');
      setShowAddShop(false);
      setNewShop({ name: '', code: '' });
      await loadData();
    } catch (err) {
      toast.error(parseApiError(err, 'Failed to create shop').message);
    }
  };

  const handleCreateDepartment = async () => {
    if (!newDepartment.name.trim() || !newDepartment.code.trim()) {
      toast.error('Department name and cost center are required');
      return;
    }
    try {
      const payload: Record<string, unknown> = {
        name: newDepartment.name.trim(),
        code: newDepartment.code.trim(),
      };
      await apiClient.post('/self-evaluation/departments', payload);
      toast.success('Department created successfully');
      setShowCreateDepartment(false);
      setNewDepartment({ name: '', code: '' });
      await loadData();
    } catch (err) {
      toast.error(parseApiError(err, 'Failed to create department').message);
    }
  };

  const handleToggleUser = async (userId: number, activate: boolean) => {
    if (!activate && !confirm('Are you sure you want to deactivate this user?')) return;
    try {
      await apiClient.put(`/users/${userId}/${activate ? 'activate' : 'deactivate'}`);
      toast.success(activate ? 'User activated' : 'User deactivated');
      await loadData();
    } catch (err) {
      toast.error(parseApiError(err, 'Failed to update user').message);
    }
  };

  const getShopName = (shopId: string | null) => (shopId ? shops.find(s => s.id === shopId)?.name ?? `${shopId.slice(0, 8)}…` : '—');
  const getDepartmentName = (deptId: string | null) => (deptId ? departments.find(d => d.id === deptId)?.name ?? `${deptId.slice(0, 8)}…` : '—');
  const getSupervisorName = (supervisorId: string | null) =>
    supervisorId ? users.find(u => String(u.id) === String(supervisorId))?.fullName ?? '—' : '—';

  /** One-line context shown next to every node of the org tree. */
  const describeUser = useCallback(
    (u: UserRecord) => {
      const parts = [u.jobTitle || u.username];
      if (u.shopId) parts.push(getShopName(u.shopId));
      if (u.departmentId) parts.push(getDepartmentName(u.departmentId));
      return parts.filter(Boolean).join(' • ');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shops, departments],
  );

  /**
   * "If multiple Shop Team Leaders exist in a single shop, the Shop Manager can
   *  view all Shop Team Leaders as a group."
   */
  const shopLeadershipGroups = useMemo(
    () =>
      shops.map(shop => {
        const managers = users.filter(u => u.shopId === shop.id && normalizeRole(u.role) === ORG_ROLES.ShopManager);
        const leaders = users.filter(u => u.shopId === shop.id && normalizeRole(u.role) === ORG_ROLES.TeamLeader);
        return {
          shop,
          managers,
          leaders,
          personnel: users.filter(u => u.shopId === shop.id).length,
          sharedDataScope: leaders.length > 1,
        };
      }),
    [shops, users],
  );

  const openPrivileges = (u: UserRecord) => {
    setPrivilegeTarget({
      id: u.id,
      fullName: u.fullName,
      role: u.role,
      additionalPermissions: u.additionalPermissions,
      revokedPermissions: u.revokedPermissions,
    });
    setShowPrivileges(true);
  };

  if (authLoading || loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <Loader2 className="w-6 h-6 animate-spin text-slate-400" />
      </div>
    );
  }

  /** Reusable structural inputs shared by both dialogs. */
  const renderStructuralFields = (
    form: UserFormState,
    setForm: (patch: Partial<UserFormState>) => void,
    rule: RoleRule | null,
    errors: FieldErrors,
  ) => (
    <>
      <div>
        <Label className="text-xs">
          Assigned Shop {rule?.requiresShop ? <span className="text-red-600">*</span> : <span className="text-gray-400">(not used for this role)</span>}
        </Label>
        <Select
          value={form.shopId || NONE}
          disabled={!rule?.requiresShop}
          onValueChange={v => setForm({ shopId: v === NONE ? '' : v, supervisorUserId: '' })}
        >
          <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select a shop..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} className="text-xs">No specific shop</SelectItem>
            {shops.filter(s => s.isActive).map(s => (
              <SelectItem key={s.id} value={s.id} className="text-xs">{s.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError errors={errors} field="shopId" />
      </div>

      <div>
        <Label className="text-xs">
          Department {rule?.requiresDepartment ? <span className="text-red-600">*</span> : <span className="text-gray-400">(optional)</span>}
        </Label>
        <Select
          value={form.departmentId || NONE}
          onValueChange={v => setForm({ departmentId: v === NONE ? '' : v, supervisorUserId: '' })}
        >
          <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select a department..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} className="text-xs">No department</SelectItem>
            {departments.filter(d => d.isActive).map(d => (
              <SelectItem key={d.id} value={d.id} className="text-xs">
                {d.name}{departmentsWithActiveManager.has(d.id) ? ' — shop layer owned by its Manager' : ''}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError errors={errors} field="departmentId" />
      </div>

      <div>
        <Label className="text-xs">
          Reports To {rule?.requiresSupervisor ? <span className="text-red-600">*</span> : <span className="text-gray-400">(optional)</span>}
        </Label>
        <Select value={form.supervisorUserId || NONE} onValueChange={v => setForm({ supervisorUserId: v === NONE ? '' : v })}>
          <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select a supervisor..." /></SelectTrigger>
          <SelectContent>
            <SelectItem value={NONE} className="text-xs">No direct supervisor</SelectItem>
            {supervisorCandidates.map(c => (
              <SelectItem key={c.id} value={String(c.id)} className="text-xs">
                {c.fullName} ({roleLabel(c.role)})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {rule?.requiresSupervisor && supervisorCandidates.length === 0 && (
          <p className="text-[10px] text-amber-600 mt-1">
            No eligible {rule.allowedSupervisorRoles.map(r => roleLabel(r)).join(' / ')} found
            {rule.requiresShop ? ' for the selected shop' : ''}. Create one first.
          </p>
        )}
        <FieldError errors={errors} field="supervisorUserId" />
      </div>

    </>
  );

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="h-14 border-b bg-white flex items-center px-4 gap-3 shadow-sm">
        <Button variant="ghost" size="sm" className="h-8" onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="w-4 h-4 mr-1" />Back
        </Button>
        <Button
          variant="outline"
          size="sm"
          className="h-8 text-xs"
          onClick={() => router.push('/dashboard')}
          title="Close User Management"
        >
          <X className="w-3.5 h-3.5 mr-1" />Close
        </Button>
        <Shield className="w-5 h-5 text-blue-600" />
        <h1 className="text-sm font-bold">Administration Panel</h1>
        <Badge variant="outline" className="ml-2 text-xs">{roleLabel(currentRole)}</Badge>
      </header>

      <div className="max-w-7xl mx-auto p-6">
        {!canAccessAdmin && (
          <Card className="mb-4 border-amber-300">
            <CardContent className="py-3 text-xs text-amber-700 flex items-center gap-2">
              <AlertCircle className="w-4 h-4" />
              Your role cannot create users. You can still browse the directory below.
            </CardContent>
          </Card>
        )}

        {restrictions.length > 0 && (
          <Card className="mb-4 border-amber-300">
            <CardContent className="py-3 space-y-1">
              {restrictions.map(text => (
                <p key={text} className="text-xs text-amber-700 flex items-start gap-2">
                  <AlertCircle className="w-3.5 h-3.5 flex-shrink-0 mt-[2px]" />
                  <span>{text}</span>
                </p>
              ))}
            </CardContent>
          </Card>
        )}

        <Tabs defaultValue="users">
          <TabsList className="mb-4">
            <TabsTrigger value="hierarchy" className="gap-1.5 text-xs"><GitBranch className="w-3.5 h-3.5" />Org Hierarchy</TabsTrigger>
            <TabsTrigger value="users" className="gap-1.5 text-xs"><Users className="w-3.5 h-3.5" />User Management</TabsTrigger>
            <TabsTrigger value="shops" className="gap-1.5 text-xs"><Building2 className="w-3.5 h-3.5" />Shop Management</TabsTrigger>
            <TabsTrigger value="departments" className="gap-1.5 text-xs"><Network className="w-3.5 h-3.5" />Departments</TabsTrigger>
            <TabsTrigger value="workflow" className="gap-1.5 text-xs"><Workflow className="w-3.5 h-3.5" />Approval Routing</TabsTrigger>
            {canUploadSignatures && (
  <TabsTrigger value="signatures" className="gap-1.5 text-xs">
    <PenLine className="w-3.5 h-3.5" />Signatures
  </TabsTrigger>
)}
            <TabsTrigger value="permissions" className="gap-1.5 text-xs"><Shield className="w-3.5 h-3.5" />Creation Rules</TabsTrigger>
          </TabsList>

          {/* ===== Org Hierarchy: the REAL reporting lines ===== */}
          <TabsContent value="hierarchy" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Organizational Hierarchy</CardTitle>
                <CardDescription className="text-xs">
                  Admin → Director → Manager → Shop Manager → Shop Team Leader → Personnel. A Special Team Leader sits
                  under a Director and owns Engineer assignments. Roles marked &quot;Shared shop scope&quot; see the whole shop.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <OrgHierarchyTree users={users} describe={describeUser} />
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== User Management ===== */}
          <TabsContent value="users" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-sm font-medium">Users ({users.length})</CardTitle>
                  <CardDescription className="text-xs">
                    You may create: {createRoleOptions.length > 0 ? createRoleOptions.map(r => r.displayName).join(', ') : 'no roles'}
                  </CardDescription>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm" variant="outline" className="h-8 text-xs" disabled={createRoleOptions.length === 0}
                    onClick={() => { setAssignErrors({}); setAssignRole({ ...EMPTY_USER_FORM, userId: 0, role: createRoleOptions[0]?.role ?? '' }); setShowAssignRole(true); }}
                  >
                    <Shield className="w-3.5 h-3.5 mr-1" />Assign Role
                  </Button>
                  <Button
                    size="sm" className="h-8 text-xs" disabled={createRoleOptions.length === 0}
                    onClick={() => { setUserErrors({}); setNewUser({ ...EMPTY_USER_FORM, role: createRoleOptions[0]?.role ?? '' }); setShowCreateUser(true); }}
                  >
                    <UserPlus className="w-3.5 h-3.5 mr-1" />Create User
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="text-xs">ID</TableHead>
                        <TableHead className="text-xs">Username</TableHead>
                        <TableHead className="text-xs">Full Name</TableHead>
                        <TableHead className="text-xs">Email</TableHead>
                        <TableHead className="text-xs">Role</TableHead>
                        <TableHead className="text-xs">Shop</TableHead>
                        <TableHead className="text-xs">Department</TableHead>
                        <TableHead className="text-xs">Supervisor</TableHead>
                        <TableHead className="text-xs">Status</TableHead>
                        <TableHead className="text-xs">Actions</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {users.map(u => (
                        <TableRow key={u.id}>
                          <TableCell className="text-xs font-mono">{u.id}</TableCell>
                          <TableCell className="text-xs font-medium">{u.username}</TableCell>
                          <TableCell className="text-xs">{u.fullName}</TableCell>
                          <TableCell className="text-xs text-slate-500">{u.email}</TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              {roleIcon(u.role)}
                              <Badge variant="outline" className="text-xs">{roleLabel(u.role)}</Badge>
                            </div>
                          </TableCell>
                          <TableCell className="text-xs">{getShopName(u.shopId)}</TableCell>
                          <TableCell className="text-xs">{getDepartmentName(u.departmentId)}</TableCell>
                          <TableCell className="text-xs">{getSupervisorName(u.supervisorUserId)}</TableCell>
                          <TableCell>
                            <Badge variant={u.isActive ? 'default' : 'secondary'} className="text-xs">{u.isActive ? 'Active' : 'Inactive'}</Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button
                                variant="ghost" size="sm" className="h-6 w-6 p-0" title="Assign Role"
                                onClick={() => {
                                  setAssignErrors({});
                                  setAssignRole({
                                    userId: u.id,
                                    username: u.username,
                                    email: u.email,
                                    fullName: u.fullName,
                                    password: '',
                                    role: normalizeRole(u.role) ?? createRoleOptions[0]?.role ?? '',
                                    shopId: u.shopId ?? '',
                                    departmentId: u.departmentId ?? '',
                                    supervisorUserId: u.supervisorUserId ?? '',
                                  });
                                  setShowAssignRole(true);
                                }}
                              >
                                <Edit className="w-3 h-3" />
                              </Button>
                              {canGrantPrivileges(currentRole) && canAdjustPrivilegesOf(currentRole, u.role) && (
                                <Button
                                  variant="ghost" size="sm" className="h-6 w-6 p-0 text-blue-600 hover:text-blue-800"
                                  title="Assign Privileges" onClick={() => openPrivileges(u)}
                                >
                                  <KeyRound className="w-3 h-3" />
                                </Button>
                              )}
                              {u.isActive ? (
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-red-500 hover:text-red-700" title="Deactivate" onClick={() => handleToggleUser(u.id, false)}>
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              ) : (
                                <Button variant="ghost" size="sm" className="h-6 w-6 p-0 text-green-600 hover:text-green-800" title="Activate" onClick={() => handleToggleUser(u.id, true)}>
                                  <Plus className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                      {users.length === 0 && (
                        <TableRow><TableCell colSpan={10} className="text-center text-xs text-slate-400">No users found</TableCell></TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== Shops, with the shop leadership group ===== */}
          <TabsContent value="shops" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-sm font-medium">Workshops ({shops.length})</CardTitle>
                  <CardDescription className="text-xs">
                    Where a shop has several Shop Team Leaders, they share the shop&apos;s information and
                    responsibilities and the Shop Manager views them as one group.
                  </CardDescription>
                </div>
                <Button size="sm" className="h-8 text-xs" disabled={!canAccessAdmin} onClick={() => setShowAddShop(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />Add Shop
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Code</TableHead>
                      <TableHead className="text-xs">Shop Managers</TableHead>
                      <TableHead className="text-xs">Shop Team Leaders</TableHead>
                      <TableHead className="text-xs">Personnel</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {shopLeadershipGroups.map(group => (
                      <TableRow key={group.shop.id}>
                        <TableCell className="text-xs font-medium">{group.shop.name}</TableCell>
                        <TableCell className="text-xs font-mono">{group.shop.code || '—'}</TableCell>
                        <TableCell className="text-xs">
                          {group.managers.length > 0 ? (
                            <div className="flex flex-wrap gap-1">
                              {group.managers.map(m => <Badge key={m.id} variant="outline" className="text-[9px]">{m.fullName}</Badge>)}
                            </div>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-xs">
                          {group.leaders.length > 0 ? (
                            <div className="flex flex-wrap gap-1 items-center">
                              {group.leaders.map(tl => <Badge key={tl.id} variant="outline" className="text-[9px]">{tl.fullName}</Badge>)}
                              {group.sharedDataScope && (
                                <Badge variant="secondary" className="text-[8px]">Shared shop scope</Badge>
                              )}
                            </div>
                          ) : '—'}
                        </TableCell>
                        <TableCell className="text-xs"><Badge variant="secondary" className="text-[10px]">{group.personnel}</Badge></TableCell>
                        <TableCell><Badge variant={group.shop.isActive ? 'default' : 'secondary'} className="text-xs">{group.shop.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                      </TableRow>
                    ))}
                    {shops.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-xs text-slate-400">No shops configured</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== Departments ===== */}
          <TabsContent value="departments" className="mt-4">
            <Card>
              <CardHeader className="flex flex-row items-center justify-between pb-3">
                <div>
                  <CardTitle className="text-sm font-medium">Departments ({departments.length})</CardTitle>
                  <CardDescription className="text-xs">
                    A Director requires a department and is assigned only by the Admin. Once a department has an active
                    Manager, that Manager owns the shop layer (Shop Managers and Shop Team Leaders).
                  </CardDescription>
                </div>
                <Button size="sm" className="h-8 text-xs" disabled={!canAccessAdmin} onClick={() => setShowCreateDepartment(true)}>
                  <Plus className="w-3.5 h-3.5 mr-1" />Add Department
                </Button>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Name</TableHead>
                      <TableHead className="text-xs">Code</TableHead>
                      <TableHead className="text-xs">Director</TableHead>
                      <TableHead className="text-xs">Managers</TableHead>
                      <TableHead className="text-xs">Shop layer owner</TableHead>
                      <TableHead className="text-xs">Status</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {departments.map(dept => {
                      const director = users.find(u => normalizeRole(u.role) === ORG_ROLES.Director && u.departmentId === dept.id);
                      const managers = users.filter(u => u.departmentId === dept.id && normalizeRole(u.role) === ORG_ROLES.Manager);
                      const hasManager = departmentsWithActiveManager.has(dept.id);
                      return (
                        <TableRow key={dept.id}>
                          <TableCell className="text-xs font-medium">{dept.name}</TableCell>
                          <TableCell className="text-xs font-mono">{dept.code || '—'}</TableCell>
                          <TableCell className="text-xs">{director ? <Badge variant="outline" className="text-[9px]">{director.fullName}</Badge> : '—'}</TableCell>
                          <TableCell className="text-xs">
                            {managers.length > 0 ? (
                              <div className="flex flex-wrap gap-1">
                                {managers.map(m => <Badge key={m.id} variant="outline" className="text-[9px]">{m.fullName}</Badge>)}
                              </div>
                            ) : '—'}
                          </TableCell>
                          <TableCell className="text-[10px]">
                            {hasManager ? (
                              <span className="text-blue-700">Manager (Director restricted)</span>
                            ) : (
                              <span className="text-slate-400">Director may bootstrap</span>
                            )}
                          </TableCell>
                          <TableCell><Badge variant={dept.isActive ? 'default' : 'secondary'} className="text-xs">{dept.isActive ? 'Active' : 'Inactive'}</Badge></TableCell>
                        </TableRow>
                      );
                    })}
                    {departments.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-xs text-slate-400">No departments configured</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ===== Approval routing for the Table of Contents forms ===== */}
          <TabsContent value="workflow" className="mt-4">
            <ApprovalRoutingCard currentRole={currentRole} />
          </TabsContent>

{canUploadSignatures && (
  <TabsContent value="signatures" className="mt-4">
    <SignatureSpecimenPanel embedded />
  </TabsContent>
)}

          {/* ===== Creation Rules (server authority) ===== */}
          <TabsContent value="permissions" className="mt-4">
            <Card>
              <CardHeader className="pb-3">
                <CardTitle className="text-sm font-medium">Server Creation Rules</CardTitle>
                <CardDescription className="text-xs">
                  Loaded from /api/users/creation-rules. These are the exact rules enforced by the API, already filtered
                  by the Manager delegation rule.
                </CardDescription>
              </CardHeader>
              <CardContent>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs">Role you can create</TableHead>
                      <TableHead className="text-xs">Department</TableHead>
                      <TableHead className="text-xs">Shop</TableHead>
                      <TableHead className="text-xs">Supervisor</TableHead>
                      <TableHead className="text-xs">Allowed Supervisors</TableHead>
                      <TableHead className="text-xs">Scope</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {createRoleOptions.map(rule => (
                      <TableRow key={rule.role}>
                        <TableCell className="text-xs font-medium">
                          <div className="flex items-center gap-1.5">{roleIcon(rule.role)}{rule.displayName}</div>
                        </TableCell>
                        <TableCell className="text-xs">{rule.requiresDepartment ? 'Required' : '—'}</TableCell>
                        <TableCell className="text-xs">{rule.requiresShop ? 'Required' : '—'}</TableCell>
                        <TableCell className="text-xs">{rule.requiresSupervisor ? 'Required' : 'Auto-resolved'}</TableCell>
                        <TableCell className="text-xs">{rule.allowedSupervisorRoles.map(r => roleLabel(r)).join(', ') || '—'}</TableCell>
                        <TableCell className="text-[10px]">
                          <div className="flex flex-wrap gap-1">
                            {rule.adminOnly && <Badge variant="secondary" className="text-[8px]">Admin-only</Badge>}
                            {rule.managerDelegated && <Badge variant="secondary" className="text-[8px]">Manager-owned</Badge>}
                            {rule.sharesShopScope && <Badge variant="secondary" className="text-[8px]">Shared shop</Badge>}
                            {rule.isIndividualPersonnel && <Badge variant="secondary" className="text-[8px]">Personnel</Badge>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                    {createRoleOptions.length === 0 && (
                      <TableRow><TableCell colSpan={6} className="text-center text-xs text-slate-400">Your role cannot create users here</TableCell></TableRow>
                    )}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>

      {/* ===== Add Shop Dialog ===== */}
      <Dialog open={showAddShop} onOpenChange={setShowAddShop}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Add New Workshop</DialogTitle>
            <DialogDescription>Create a shop so shop-scoped roles can be assigned to it.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Shop Name *</Label>
              <Input value={newShop.name} onChange={e => setNewShop(p => ({ ...p, name: e.target.value }))} placeholder="e.g., Galley Shop" className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Cost Center *</Label>
              <Input value={newShop.code} onChange={e => setNewShop(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="e.g., GALLEY" className="h-8 text-sm mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAddShop(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateShop}>Create Shop</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Create Department Dialog ===== */}
      <Dialog open={showCreateDepartment} onOpenChange={setShowCreateDepartment}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Create Department</DialogTitle>
            <DialogDescription>Add a department (e.g., CMT, ACS, MCS, NDT, Standard).</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <Label className="text-xs">Department Name *</Label>
              <Input value={newDepartment.name} onChange={e => setNewDepartment(p => ({ ...p, name: e.target.value }))} placeholder="e.g., CMT" className="h-8 text-sm mt-1" />
            </div>
            <div>
              <Label className="text-xs">Cost Center *</Label>
              <Input value={newDepartment.code} onChange={e => setNewDepartment(p => ({ ...p, code: e.target.value.toUpperCase() }))} placeholder="e.g., CMT" className="h-8 text-sm mt-1" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCreateDepartment(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateDepartment}>Create Department</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Create User Dialog ===== */}
      <Dialog open={showCreateUser} onOpenChange={setShowCreateUser}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Create New User</DialogTitle>
            <DialogDescription>Only roles your account may create are listed, with their mandatory parents.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
            <div>
              <Label className="text-xs">Username *</Label>
              <Input value={newUser.username} onChange={e => setNewUser(p => ({ ...p, username: e.target.value }))} placeholder="e.g., john.doe" className="h-8 text-sm mt-1" />
              <FieldError errors={userErrors} field="username" />
            </div>
            <div>
              <Label className="text-xs">Email *</Label>
              <Input type="email" value={newUser.email} onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))} placeholder="e.g., john@company.com" className="h-8 text-sm mt-1" />
              <FieldError errors={userErrors} field="email" />
            </div>
            <div>
              <Label className="text-xs">Full Name *</Label>
              <Input value={newUser.fullName} onChange={e => setNewUser(p => ({ ...p, fullName: e.target.value }))} placeholder="e.g., John Doe" className="h-8 text-sm mt-1" />
              <FieldError errors={userErrors} field="fullName" />
            </div>
            <div>
              <Label className="text-xs">Password * (min 6 characters)</Label>
              <Input type="password" value={newUser.password} onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))} placeholder="Enter password" className="h-8 text-sm mt-1" />
              <FieldError errors={userErrors} field="password" />
            </div>
            <div>
              <Label className="text-xs">Role *</Label>
              <Select value={newUser.role} onValueChange={v => setNewUser(p => ({ ...p, role: v, shopId: '', supervisorUserId: '' }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select a role..." /></SelectTrigger>
                <SelectContent>
                  {createRoleOptions.map(rule => (
                    <SelectItem key={rule.role} value={rule.role} className="text-xs">
                      <div className="flex items-center gap-2">{roleIcon(rule.role)}<span>{rule.displayName}</span></div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeCreateRule && <p className="text-[10px] text-gray-500 mt-1">{activeCreateRule.description}</p>}
              <FieldError errors={userErrors} field="role" />
            </div>
            {renderStructuralFields(newUser, patch => setNewUser(p => ({ ...p, ...patch })), activeCreateRule, userErrors)}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowCreateUser(false)}>Cancel</Button>
            <Button size="sm" onClick={handleCreateUser} disabled={submitting}>
              {submitting && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}Create User
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Assign Role Dialog ===== */}
      <Dialog open={showAssignRole} onOpenChange={setShowAssignRole}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Assign User Role</DialogTitle>
            <DialogDescription>Change a role and its reporting structure. The same server rules apply.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 max-h-[60vh] overflow-y-auto pr-2">
            <div>
              <Label className="text-xs">Select User *</Label>
              <Select value={assignRole.userId > 0 ? String(assignRole.userId) : ''} onValueChange={v => setAssignRole(p => ({ ...p, userId: Number(v) }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select a user..." /></SelectTrigger>
                <SelectContent>
                  {users.filter(u => u.isActive).map(u => (
                    <SelectItem key={u.id} value={String(u.id)} className="text-xs">
                      {u.fullName} ({u.username}) - {roleLabel(u.role)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FieldError errors={assignErrors} field="userId" />
            </div>
            <div>
              <Label className="text-xs">Role *</Label>
              <Select value={assignRole.role} onValueChange={v => setAssignRole(p => ({ ...p, role: v, shopId: '', supervisorUserId: '' }))}>
                <SelectTrigger className="h-8 text-sm mt-1"><SelectValue placeholder="Select a role..." /></SelectTrigger>
                <SelectContent>
                  {assignRoleOptions.map(rule => (
                    <SelectItem key={rule.role} value={rule.role} className="text-xs">
                      <div className="flex items-center gap-2">{roleIcon(rule.role)}<span>{rule.displayName}</span></div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {activeAssignRule && <p className="text-[10px] text-gray-500 mt-1">{activeAssignRule.description}</p>}
              <FieldError errors={assignErrors} field="role" />
            </div>
            {renderStructuralFields(assignRole, patch => setAssignRole(p => ({ ...p, ...patch })), activeAssignRule, assignErrors)}
          </div>
          <DialogFooter>
            <Button variant="outline" size="sm" onClick={() => setShowAssignRole(false)}>Cancel</Button>
            <Button size="sm" onClick={handleAssignRole} disabled={submitting}>
              {submitting && <Loader2 className="w-3 h-3 mr-1 animate-spin" />}Assign Role
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ===== Privileges Dialog ("assign privileges such as edit, delete") ===== */}
      <PrivilegesDialog
        open={showPrivileges}
        onOpenChange={open => {
          setShowPrivileges(open);
          if (!open) setPrivilegeTarget(null);
        }}
        target={privilegeTarget}
        grantorRole={currentRole}
        grantablePermissions={grantable}
        submitting={submitting}
        onSave={handleSavePrivileges}
      />
    </div>
  );
}