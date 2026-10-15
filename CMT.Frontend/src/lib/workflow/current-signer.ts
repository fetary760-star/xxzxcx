/**
 * =====================================================================================
 * AMENDED v30 — ITEM 14 / DELIVERABLE 1: THE LOGGED-IN SIGNER
 * Copy to: CMT.Frontend/src/lib/workflow/current-signer.ts    (REPLACES the v27 file)
 *
 * WHAT v27 GOT RIGHT (kept, and mostly byte for byte)
 * --------------------------------------------------
 *   - ONE pure, typed description of the logged-in user, canonicalised into the role
 *     vocabulary `signature-matrix.ts` speaks;
 *   - `canonicalRoleOfUser()` consulting `personnelType` when the role string alone is a
 *     placeholder (`customer_personnel`), which `normalizeRole()` cannot resolve;
 *   - the provisional value being a PREVIEW, never a legal stamp;
 *   - UTC today, so the preview cannot be one day off the stamp the server is about to write;
 *   - no React in the pure half, so the folder PDF exporter and unit tests can reuse it.
 *
 * WHY v30 AMENDS IT — THE SECOND, SILENT REASON THE BLOCK STAYS BLANK
 * -----------------------------------------------------------------
 * v27 ends with:
 *
 *      const isResolved = !!personName && !!canonicalRole
 *
 * and `personName` is read from THREE fields only:
 *
 *      user.fullName || user.full_name || user.name
 *
 * `isUsableSigner()` (signature-blocks.ts) refuses a signer whose `isResolved` is false, and
 * `canFillProvisionally()` refuses everything after that. So an account that carries only
 * `username`, only `displayName`, or only `email` yields `ANONYMOUS_SIGNER` and DISABLES THE
 * WHOLE AUTOMATIC LAYER — silently, with no error anywhere, even after the wiring defect in
 * `FormDocumentChrome.tsx` is fixed. A printed form has to show SOMETHING on the name rule,
 * and the account's login name is a far better print than an empty rule.
 *
 * DEFECT 1 — NAME RESOLUTION WAS TOO NARROW.
 *   FIX: `resolvePersonName()` walks fullName -> full_name -> name -> displayName ->
 *   display_name -> firstName+lastName -> userName -> username -> employeeName -> the LOCAL
 *   PART of an e-mail, prettified ("karim.nour" -> "Karim Nour"). The first non-empty wins.
 *
 * DEFECT 2 — ROLE STRINGS THE HOST PERSISTS WERE STILL UNRESOLVABLE.
 *   `normalizeRole('shop_team_leader')` -> null on the alias table shipped in
 *   `role-hierarchy.ts`, and that is EXACTLY the string a Shop Team Leader account carries in
 *   the running database. Same for `special_team_leader`, `documentation_team_leader`,
 *   `hr_manager`, `qa`, `ecaa_personnel`, `certifying_staff`, `dir`, `mgr`, `stl`, `eng`.
 *   FIX: `HOST_ROLE_ALIASES` extended, and the lookup now ALSO tries a punctuation-collapsed
 *   form, so `Shop Team Leader`, `shop-team-leader` and `SHOP_TEAM_LEADER` all resolve.
 *
 * DEFECT 3 — `useCurrentSigner()` MEMOISED ON A STALE CLOSURE.
 *   v27 built the deps array from primitives (correct) but called `signerFromUser(user)` with
 *   the OBJECT captured in that render. With an exhaustive-deps suppression in place this is
 *   fragile: a `refreshUser()` that changes ONLY a field outside the deps list would return a
 *   signer built from the previous object. FIX: the primitives are extracted first and a plain
 *   object is rebuilt inside `useMemo`, so the memo can only ever see the values it depends on.
 *
 * DEFECT 4 — A DEFENSIVE `try/catch` AROUND `useAuth()` BROKE THE HOOK RULES.
 *   v27 wrapped `useAuth()` in `try/catch` with an eslint suppression. If the provider throws
 *   on the FIRST render and not on the second, React sees a different number of hooks and
 *   crashes the tree. FIX: `useOptionalAuthUser()` isolates the call in its own hook that
 *   ALWAYS runs, and only the RESULT is treated as optional.
 *
 * FOUR HARD RULES (unchanged from v27)
 *   (1) THIS IS A PREVIEW, NEVER A LEGAL STAMP. The value is printed as
 *       `PrintedSignatureState.SelfFill`. The moment the server records the real step,
 *       `instance.signatures[]` / `steps[]` WIN and overwrite it.
 *   (2) ROLE-GATED, NEVER POSITIONAL. A signer only fills a line whose `expectedRoles` accept
 *       his canonical role. An STL can never appear on "Mgr. Componenet Shop".
 *   (3) NO REACT IN THE PURE HALF. `canonicalRoleOfUser`, `signerFromUser`, `resolvePersonName`
 *       and `utcToday` are pure.
 *   (4) IDS: user ids are NUMBERS (C# long). Entity ids are STRINGS (C# Guid).
 * =====================================================================================
 */
'use client'

import { useMemo } from 'react'

import { useOptionalAuth } from '@/lib/auth-context'
import { ORG_ROLES, normalizeRole, roleLabel, type OrgRole } from '@/lib/role-hierarchy'

// =====================================================================================
// 1. THE SIGNER
// =====================================================================================

/**
 * The logged-in user, expressed in exactly the terms a printed signature line needs.
 *
 * `canonicalRole` is the ONLY field the matrix matching uses. When it is null the signer is
 * unusable for auto-fill (unknown role), and every printed line stays blank — which is the
 * correct, safe degradation.
 */
export interface ProvisionalSigner {
  /** C# long. Null when no session is resolved yet, or the API returned no id. */
  userId: number | null
  /** Printed on the name rule, e.g. "Karim Nour". */
  personName: string
  /** Canonical role string when resolvable, else the raw value (for tooltips / audit). */
  personRole: string
  /** The matched OrgRole. NULL means "do not auto-fill anything". */
  canonicalRole: OrgRole | null
  /** roleLabel(canonicalRole) — tooltip / audit only, NEVER the printed role line. */
  personRoleLabel: string
  /** "YYYY-MM-DD" in UTC — the date printed the moment the user prepares / approves. */
  today: string
  /** Owning shop, so a caller may additionally scope the fill to its own shop. */
  shopId: string | null
  /** True when a session AND a usable canonical role were both resolved. */
  isResolved: boolean
}

/** The safe "nothing is known" signer. Produces NO auto-fill at all. */
export const ANONYMOUS_SIGNER: ProvisionalSigner = {
  userId: null,
  personName: '',
  personRole: '',
  canonicalRole: null,
  personRoleLabel: '',
  today: '',
  shopId: null,
  isResolved: false,
}

// =====================================================================================
// 2. UTC TODAY
//    Approval stamps are frozen in UTC server side (`formatSignatureDate` in
//    signature-render.ts renders UTC verbatim). The provisional date MUST use the same
//    clock, otherwise a form previewed at 01:00 local time would show a date one day off
//    the date the server is about to stamp.
// =====================================================================================

/** "2026-08-29" — today in UTC, identical in shape to a frozen server stamp. */
export function utcToday(now: Date = new Date()): string {
  return now.toISOString().slice(0, 10)
}

// =====================================================================================
// 3. ROLE CANONICALISATION
// =====================================================================================

/**
 * `personnelType` -> canonical role. `auth-context.tsx` uses this field to decide the
 * DISPLAY name of a `customer_personnel` account ("Technician", "Tools Clerk",
 * "Warranty Officer"), so it is also the only place the real role can be recovered from.
 */
const PERSONNEL_TYPE_ROLES: Record<string, OrgRole> = {
  technician: ORG_ROLES.Technician,
  tech: ORG_ROLES.Technician,
  tools_clerk: ORG_ROLES.Technician,
  toolsclerk: ORG_ROLES.Technician,
  'tools clerk': ORG_ROLES.Technician,
  warranty_officer: ORG_ROLES.QAPersonnel,
  warrantyofficer: ORG_ROLES.QAPersonnel,
  'warranty officer': ORG_ROLES.QAPersonnel,
  inspector: ORG_ROLES.Inspector,
  inspection: ORG_ROLES.Inspector,
  certifying_staff: ORG_ROLES.CertifyingStaff,
  certifyingstaff: ORG_ROLES.CertifyingStaff,
  'certifying staff': ORG_ROLES.CertifyingStaff,
  special_team_leader: ORG_ROLES.SpecialTeamLeader,
  specialteamleader: ORG_ROLES.SpecialTeamLeader,
  'special team leader': ORG_ROLES.SpecialTeamLeader,
  documentation_clerk: ORG_ROLES.DocumentationClerk,
  documentationclerk: ORG_ROLES.DocumentationClerk,
  hr_specialist: ORG_ROLES.HRSpecialist,
  hrspecialist: ORG_ROLES.HRSpecialist,
  engineer: ORG_ROLES.Engineer,
  ecaa: ORG_ROLES.ECAAPersonnel,
  ecaa_team: ORG_ROLES.ECAAPersonnel,
}

/**
 * Role strings the running application persists that `role-hierarchy.ts` does not alias.
 * Kept SEPARATE from `ROLE_ALIASES` on purpose: this table is host-application specific,
 * whereas `role-hierarchy.ts` is a verbatim mirror of `RoleHierarchy.cs` and must not drift.
 *
 * AMENDED v30 (DEFECT 2) — every abbreviation and snake_case form the login screen and the
 * seed data actually produce. Keys are stored in the COLLAPSED form (lower case, every run of
 * non-alphanumerics turned into a single space), so `shop_team_leader`, `Shop-Team-Leader`
 * and `SHOP TEAM LEADER` all hit the same entry.
 */
const HOST_ROLE_ALIASES: Record<string, OrgRole> = {
  // ---- Shop Team Leader (the single most important one: the preparer of most forms) ----
  'shop team leader': ORG_ROLES.TeamLeader,
  'shop teamleader': ORG_ROLES.TeamLeader,
  'team leader': ORG_ROLES.TeamLeader,
  teamleader: ORG_ROLES.TeamLeader,
  stl: ORG_ROLES.TeamLeader,
  tl: ORG_ROLES.TeamLeader,

  // ---- Special Team Leader (the TL. Component Engineering Support line) ----
  'special team leader': ORG_ROLES.SpecialTeamLeader,
  specialteamleader: ORG_ROLES.SpecialTeamLeader,
  'special tl': ORG_ROLES.SpecialTeamLeader,
  stl2: ORG_ROLES.SpecialTeamLeader,

  // ---- Shop / component managers ----
  'shop manager': ORG_ROLES.ShopManager,
  shopmanager: ORG_ROLES.ShopManager,
  'component shop manager': ORG_ROLES.ShopManager,
  'mgr component shop': ORG_ROLES.ShopManager,
  'mgr componenet shop': ORG_ROLES.ShopManager, // verbatim typo of the controlled form
  manager: ORG_ROLES.Manager,
  mgr: ORG_ROLES.Manager,

  // ---- Director ----
  director: ORG_ROLES.Director,
  dir: ORG_ROLES.Director,
  'department director': ORG_ROLES.Director,
  'responsible director': ORG_ROLES.Director,
  'dir cmt': ORG_ROLES.Director,

  // ---- Engineering ----
  engineer: ORG_ROLES.Engineer,
  eng: ORG_ROLES.Engineer,
  'component engineer': ORG_ROLES.Engineer,
  'engineering support': ORG_ROLES.Engineer,

  // ---- Documentation ----
  documentation: ORG_ROLES.DocumentationTeamLeader,
  'documentation team leader': ORG_ROLES.DocumentationTeamLeader,
  documentationteamleader: ORG_ROLES.DocumentationTeamLeader,
  dl: ORG_ROLES.DocumentationTeamLeader,
  'documentation clerk': ORG_ROLES.DocumentationClerk,
  documentationclerk: ORG_ROLES.DocumentationClerk,
  clerk: ORG_ROLES.DocumentationClerk,

  // ---- HR ----
  'hr specialist': ORG_ROLES.HRSpecialist,
  hrspecialist: ORG_ROLES.HRSpecialist,
  'hr manager': ORG_ROLES.HRManager,
  hrmanager: ORG_ROLES.HRManager,
  hr: ORG_ROLES.HRSpecialist,

  // ---- Quality / regulator ----
  quality: ORG_ROLES.QAPersonnel,
  quality_assurance: ORG_ROLES.QAPersonnel,
  'quality assurance': ORG_ROLES.QAPersonnel,
  'manager quality assurance': ORG_ROLES.QAPersonnel,
  qa: ORG_ROLES.QAPersonnel,
  'qa personnel': ORG_ROLES.QAPersonnel,
  ecaa: ORG_ROLES.ECAAPersonnel,
  'ecaa team': ORG_ROLES.ECAAPersonnel,
  'ecaa personnel': ORG_ROLES.ECAAPersonnel,

  // ---- Shop floor ----
  inspector: ORG_ROLES.Inspector,
  inspection: ORG_ROLES.Inspector,
  technician: ORG_ROLES.Technician,
  'certifying staff': ORG_ROLES.CertifyingStaff,
  certifyingstaff: ORG_ROLES.CertifyingStaff,
  'certifying stuff': ORG_ROLES.CertifyingStaff, // observed misspelling in seed data
}

/** Role values that carry NO information on their own and must defer to `personnelType`. */
const DEFERS_TO_PERSONNEL_TYPE = new Set([
  'customer_personnel',
  'customerpersonnel',
  'customer personnel',
  'personnel',
  'staff',
  'user',
  '',
])

/** "  Shop_Team-Leader " -> "shop team leader". The single normal form of every lookup. */
function collapse(value?: string | null): string {
  return (value ?? '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ')
    .toLowerCase()
}

/** Both spellings of a table lookup: the raw lower-cased value and the collapsed one. */
function fromTable(table: Record<string, OrgRole>, raw: string): OrgRole | null {
  if (!raw) return null
  return table[raw] ?? table[collapse(raw)] ?? null
}

/**
 * The canonical role of a user account.
 *
 * RESOLUTION ORDER — deliberate, and the reason a `customer_personnel` Technician and a
 * `shop_team_leader` STL both work:
 *   1. `personnelType`, when the role string is a placeholder that defers to it;
 *   2. `normalizeRole(role)` — the authoritative 16-role mirror of RoleHierarchy.cs;
 *   3. the host-specific alias table (raw AND collapsed spelling);
 *   4. `personnelType` as a fallback for any still-unresolved role;
 *   5. null -> NO auto-fill (safe).
 */
export function canonicalRoleOfUser(
  role?: string | null,
  personnelType?: string | null,
): OrgRole | null {
  const rawRole = (role ?? '').trim().toLowerCase()
  const rawType = (personnelType ?? '').trim().toLowerCase()

  // ---- 1. placeholder role -> personnelType ------------------------------------------
  if (DEFERS_TO_PERSONNEL_TYPE.has(rawRole) && rawType) {
    const byType =
      fromTable(PERSONNEL_TYPE_ROLES, rawType) ??
      normalizeRole(rawType) ??
      fromTable(HOST_ROLE_ALIASES, rawType)
    if (byType) return byType
  }

  // ---- 2. the authoritative mirror ----------------------------------------------------
  const direct = normalizeRole(rawRole) ?? normalizeRole(collapse(rawRole))
  if (direct) return direct

  // ---- 3. host-specific aliases (AMENDED v30: now BEFORE the personnelType fallback,
  //         because an explicit role string is always more trustworthy than a type hint) --
  const hostRole = fromTable(HOST_ROLE_ALIASES, rawRole)
  if (hostRole) return hostRole

  // ---- 4. personnelType as a last resort ---------------------------------------------
  if (rawType) {
    const byType =
      fromTable(PERSONNEL_TYPE_ROLES, rawType) ??
      normalizeRole(rawType) ??
      fromTable(HOST_ROLE_ALIASES, rawType)
    if (byType) return byType
  }

  // ---- 5. unknown -> no auto-fill -----------------------------------------------------
  return null
}

// =====================================================================================
// 4. NAME RESOLUTION   (AMENDED v30 — DEFECT 1)
// =====================================================================================

/**
 * The subset of the `auth-context.tsx` User shape this module needs. Declared structurally
 * so the module never imports that interface (which is not exported) and so the folder PDF
 * exporter can pass a plain object.
 */
export interface SignerSourceUser {
  userId?: number | null
  id?: number | null
  user_id?: number | null

  fullName?: string | null
  full_name?: string | null
  name?: string | null
  displayName?: string | null
  display_name?: string | null
  firstName?: string | null
  first_name?: string | null
  lastName?: string | null
  last_name?: string | null
  userName?: string | null
  username?: string | null
  employeeName?: string | null
  employee_name?: string | null
  email?: string | null

  role?: string | null
  roleName?: string | null
  role_name?: string | null
  personnelType?: string | null
  personnel_type?: string | null
  shopId?: number | string | null
}

/** "karim.nour" / "karim_nour" / "karim-nour" -> "Karim Nour". */
function prettifyLogin(value: string): string {
  const words = value
    .replace(/[._\-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
  if (!words) return ''
  return words
    .split(' ')
    .map(word => (word.length <= 1 ? word.toUpperCase() : word[0].toUpperCase() + word.slice(1)))
    .join(' ')
}

/**
 * The name to PRINT on the rule. First non-empty candidate wins, in decreasing order of how
 * close it is to the legal name on the hard copy.
 *
 * The e-mail local part is deliberately LAST and prettified: printing "karim.nour@et.com" on
 * a controlled form would be wrong, but printing "Karim Nour" is exactly what the paper
 * expects — and it is infinitely better than the empty rule you are seeing today, which is
 * what an all-or-nothing rule produced.
 */
export function resolvePersonName(user?: SignerSourceUser | null): string {
  if (!user) return ''

  const direct = [
    user.fullName,
    user.full_name,
    user.name,
    user.displayName,
    user.display_name,
    user.employeeName,
    user.employee_name,
  ]
  for (const candidate of direct) {
    const value = (candidate ?? '').trim()
    if (value) return value
  }

  const first = (user.firstName ?? user.first_name ?? '').trim()
  const last = (user.lastName ?? user.last_name ?? '').trim()
  if (first || last) return [first, last].filter(Boolean).join(' ')

  const login = (user.userName ?? user.username ?? '').trim()
  if (login) return prettifyLogin(login)

  const email = (user.email ?? '').trim()
  if (email.includes('@')) {
    const local = email.slice(0, email.indexOf('@'))
    const pretty = prettifyLogin(local)
    if (pretty) return pretty
  }

  return ''
}

// =====================================================================================
// 5. THE PURE PROJECTION
// =====================================================================================

function positiveUserId(value: unknown): number | null {
  const parsed = typeof value === 'number' ? value : Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(parsed) || parsed <= 0) return null
  return parsed
}

/**
 * Builds the printed-signature view of an account. NEVER throws, and returns
 * `ANONYMOUS_SIGNER` for anything it cannot use, so the printed block degrades to the blank
 * hard copy instead of showing a wrong name.
 *
 * `now` is injectable purely so a test can freeze the date.
 */
export function signerFromUser(
  user?: SignerSourceUser | null,
  now: Date = new Date(),
): ProvisionalSigner {
  if (!user) return ANONYMOUS_SIGNER

  const userId = positiveUserId(user.userId ?? user.id ?? user.user_id)
  const personName = resolvePersonName(user)
  const rawRole = (user.role || user.roleName || user.role_name || '').trim()
  const personnelType = (user.personnelType || user.personnel_type || '').trim()

  const canonicalRole = canonicalRoleOfUser(rawRole, personnelType)

  // A signer with no NAME cannot be printed on a name rule, and a signer with no CANONICAL
  // ROLE cannot be matched to a printed line. Either gap disables auto-fill entirely.
  const isResolved = !!personName && !!canonicalRole

  return {
    userId,
    personName,
    personRole: canonicalRole ?? rawRole,
    canonicalRole,
    personRoleLabel: canonicalRole ? roleLabel(canonicalRole) : rawRole,
    today: utcToday(now),
    shopId: user.shopId !== undefined && user.shopId !== null ? String(user.shopId) : null,
    isResolved,
  }
}

// =====================================================================================
// 6. THE REACT BINDING
// =====================================================================================

/**
 * `useAuth()` in isolation. AMENDED v30 (DEFECT 4): the call is made by a hook of its own that
 * ALWAYS executes, so the number of hooks React sees never changes between renders. Only the
 * RESULT is optional — a screen rendered outside an `AuthProvider` (unit test, storybook)
 * receives null and prints the blank hard copy instead of crashing.
 */
function useOptionalAuthUser(): SignerSourceUser | null {
  const context = useOptionalAuth()
  if (!context || typeof context !== 'object') return null
  const user = (context as { user?: unknown }).user
  if (!user || typeof user !== 'object') return null
  return user as SignerSourceUser
}

/**
 * The logged-in user as a printable signer.
 *
 * A form does NOT need this hook: `FormDocumentChrome.SignatureBlock` v30 calls it itself,
 * which is what keeps the adoption cost at zero for the ~30 controlled documents:
 *
 *     <SignatureBlock rows={rows} editable={isEditing} formType={FORM_TYPE} instance={instance} />
 *
 * Call it directly only when a screen needs the signer for something else (for example to
 * decide whether to show an "Approve" button).
 */
export function useCurrentSigner(): ProvisionalSigner {
  const user = useOptionalAuthUser()

  // The identity is memoised on its PRIMITIVE fields, not on the `user` object identity:
  // `auth-context.tsx` rebuilds that object on every `refreshUser()`, which would otherwise
  // re-run the whole printed projection (and the specimen fetch) on every poll.
  const userId = user?.userId ?? user?.id ?? user?.user_id ?? null
  const fullName = user?.fullName ?? user?.full_name ?? null
  const name = user?.name ?? null
  const displayName = user?.displayName ?? user?.display_name ?? null
  const firstName = user?.firstName ?? user?.first_name ?? null
  const lastName = user?.lastName ?? user?.last_name ?? null
  const login = user?.userName ?? user?.username ?? null
  const employeeName = user?.employeeName ?? user?.employee_name ?? null
  const email = user?.email ?? null
  const rawRole = user?.role ?? user?.roleName ?? user?.role_name ?? null
  const personnelType = user?.personnelType ?? user?.personnel_type ?? null
  const shopId = user?.shopId ?? null

  return useMemo(() => {
    if (!user) return ANONYMOUS_SIGNER

    // DEFECT 3: the memo builds its OWN source object from the exact values it depends on,
    // so it can never read a field of a stale closure.
    return signerFromUser({
      userId,
      fullName,
      name,
      displayName,
      firstName,
      lastName,
      userName: login,
      employeeName,
      email,
      role: rawRole,
      personnelType,
      shopId,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    userId,
    fullName,
    name,
    displayName,
    firstName,
    lastName,
    login,
    employeeName,
    email,
    rawRole,
    personnelType,
    shopId,
  ])
}