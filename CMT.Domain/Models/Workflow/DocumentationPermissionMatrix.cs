using System;
using System.Collections.Generic;
using System.Linq;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.Workflow
{
    // =====================================================================================
    // AMENDED v10 - DocumentationPermissionMatrix.cs   (NEW FILE)
    // Copy to: CMT.Domain/Models/Workflow/DocumentationPermissionMatrix.cs
    //
    // WHY THIS FILE EXISTS
    // --------------------
    // RoleHierarchy.DefaultPermissions answers "may this ROLE do this kind of thing at all".
    // FormWorkflowCatalog answers "may this ROLE act on this STEP".
    // Neither answers the three questions the DOCUMENTATION section actually asks:
    //
    //   (1) May THIS user act on THIS ticket right now?
    //       A Documentation Clerk holds Permissions.EditForm and is an eligible role of
    //       step 3 of MNT-1420A - but he must only touch the ticket the DL assigned to HIM.
    //       Without an ownership check, any clerk could process any bulletin.
    //
    //   (2) Is the actor inside the right SCOPE?
    //       An STL may only touch MNT-1420B rows of HIS OWN SHOP. A DL/clerk is unit-scoped
    //       and therefore shop-agnostic: applying the shop rule to them would lock them out
    //       of every ticket, because they have no ShopId.
    //
    //   (3) Which capability flags should the API return to the UI?
    //       The frontend must never re-implement these rules. Every documentation response
    //       carries CanIAct / CanIAssign / CanIProcess / CanISignOff / CanIRegister,
    //       computed here, once.
    //
    // DESIGN
    //   - Pure decision functions. No EF, no DbContext, no services, no I/O.
    //   - The caller passes a DocumentationActorContext (who am I) and the ticket facts.
    //     That keeps the file unit-testable and free of any persistence dependency.
    //   - Every decision returns DocumentationAccessDecision, which carries the machine
    //     readable WorkflowErrorCodes value, so the controller maps failure -> HTTP 403/409
    //     without inventing its own strings.
    //
    // NOT MODIFIED
    //   ApprovalStatus.cs, RoleHierarchy.cs, Enums.cs, WorkflowContracts.cs,
    //   WorkflowEntities.cs, WorkflowApiContracts.cs. This file only CONSUMES them.
    // =====================================================================================

    /// <summary>
    /// Machine readable outcomes specific to the DOCUMENTATION section. They complement
    /// CMT.Application.SelfEvaluation.Contracts.Workflow.WorkflowErrorCodes; the string values are chosen so
    /// the frontend can treat both sets uniformly.
    /// </summary>
    public static class DocumentationErrorCodes
    {
        public const string NotDocumentationForm = "NOT_DOCUMENTATION_FORM";
        public const string NotDocumentationUnitMember = "NOT_DOCUMENTATION_UNIT_MEMBER";
        public const string NotTicketOwnerClerk = "NOT_TICKET_OWNER_CLERK";
        public const string NotDocumentationLeader = "NOT_DOCUMENTATION_LEADER";
        public const string ClerkNotAvailable = "CLERK_NOT_AVAILABLE";
        public const string ClerkAtCapacity = "CLERK_AT_CAPACITY";
        public const string AssigneeNotClerk = "ASSIGNEE_NOT_CLERK";
        public const string TicketAlreadyAssigned = "TICKET_ALREADY_ASSIGNED";
        public const string TicketNotAssigned = "TICKET_NOT_ASSIGNED";
        public const string TicketClosed = "TICKET_CLOSED";
        public const string InitiationCategoryNotOthers = "INITIATION_CATEGORY_NOT_OTHERS";
        public const string AdSoleAuthorityViolation = "AD_SOLE_AUTHORITY_VIOLATION";
        public const string AdOutsideOwnShop = "AD_OUTSIDE_OWN_SHOP";
        public const string RegisterLocked = "REGISTER_LOCKED";
        public const string DirectiveAlreadyIssued = "DIRECTIVE_ALREADY_ISSUED";
        public const string PermissionMissing = "PERMISSION_MISSING";
        public const string Allowed = "ALLOWED";
    }

    /// <summary>Result of one access decision.</summary>
    public sealed class DocumentationAccessDecision
    {
        public bool Allowed { get; init; }

        /// <summary>DocumentationErrorCodes / WorkflowErrorCodes value.</summary>
        public string Code { get; init; } = DocumentationErrorCodes.Allowed;

        /// <summary>Message safe to surface in the UI.</summary>
        public string Reason { get; init; } = string.Empty;

        public static DocumentationAccessDecision Allow() => new()
        {
            Allowed = true,
            Code = DocumentationErrorCodes.Allowed
        };

        public static DocumentationAccessDecision Deny(string code, string reason) => new()
        {
            Allowed = false,
            Code = code,
            Reason = reason
        };

        public static implicit operator bool(DocumentationAccessDecision decision) => decision.Allowed;
    }

    /// <summary>
    /// Everything the matrix needs to know about the CALLING user. Built once per request
    /// from the JWT plus the Users row, then reused for every decision of that request.
    /// </summary>
    public sealed class DocumentationActorContext
    {
        /// <summary>long, never Guid.</summary>
        public long UserId { get; init; }

        /// <summary>Raw role value from the JWT / Users row; may be a legacy alias.</summary>
        public string? Role { get; init; }

        public Guid? ShopId { get; init; }
        public Guid? DepartmentId { get; init; }

        /// <summary>Users.AdditionalPermissions CSV.</summary>
        public string? AdditionalPermissionsCsv { get; init; }

        /// <summary>Users.RevokedPermissions CSV.</summary>
        public string? RevokedPermissionsCsv { get; init; }

        /// <summary>Canonical OrgRoles value, or null when the role is unknown.</summary>
        public string? CanonicalRole => RoleHierarchy.Normalize(Role);

        public bool IsAdmin => CanonicalRole == OrgRoles.Admin;

        public bool IsDocumentationLeader => CanonicalRole == OrgRoles.DocumentationTeamLeader;

        public bool IsDocumentationClerk => CanonicalRole == OrgRoles.DocumentationClerk;

        public bool IsShopTeamLeader => CanonicalRole == OrgRoles.TeamLeader;

        /// <summary>FunctionalUnits value of the role, or null for shop roles.</summary>
        public string? FunctionalUnit => RoleHierarchy.FunctionalUnitOf(Role);

        public bool IsInDocumentationUnit =>
            string.Equals(FunctionalUnit, FunctionalUnits.Documentation, StringComparison.OrdinalIgnoreCase);

        /// <summary>(defaults + AdditionalPermissions) - RevokedPermissions.</summary>
        public HashSet<string> EffectivePermissions =>
            RoleHierarchy.EffectivePermissions(Role, AdditionalPermissionsCsv, RevokedPermissionsCsv);

        public bool Has(string permission) => IsAdmin || EffectivePermissions.Contains(permission);
    }

    /// <summary>The facts of one Documentation Team ticket the matrix reasons about.</summary>
    public sealed class DocumentationTicketFacts
    {
        public Guid TicketId { get; init; }
        public Guid FormWorkflowInstanceId { get; init; }

        /// <summary>FormNodeTypes value / CmmDocumentationFormType.</summary>
        public string FormType { get; init; } = string.Empty;

        public DocumentationTicketState State { get; init; }
        public ApprovalStatus FormStatus { get; init; }

        /// <summary>Currently pending step of the generic chain.</summary>
        public int CurrentStepNo { get; init; }

        public Guid? OriginShopId { get; init; }
        public long OriginatorUserId { get; init; }

        public long? DocumentationLeaderUserId { get; init; }
        public long? AssignedClerkUserId { get; init; }

        public bool IsClosed { get; init; }

        /// <summary>The bulletin register line has been signed off and frozen.</summary>
        public bool RegisterLocked { get; init; }
    }

    /// <summary>The facts of one MNT-1420B directive row the matrix reasons about.</summary>
    public sealed class DirectiveEntryFacts
    {
        public Guid EntryId { get; init; }
        public Guid FormWorkflowInstanceId { get; init; }

        /// <summary>Owning shop of the directive. An STL must match it exactly.</summary>
        public Guid ShopId { get; init; }

        public int CurrentStepNo { get; init; }
        public ApprovalStatus FormStatus { get; init; }

        public long DraftedByStlUserId { get; init; }

        public bool IsIssued { get; init; }
        public bool IsLocked { get; init; }
    }

    /// <summary>
    /// The DOCUMENTATION role-permission matrix. One place, one rule set, consumed by the
    /// controllers, the engine and the response builders.
    /// </summary>
    public static class DocumentationPermissionMatrix
    {
        // =================================================================================
        // 1. THE DECLARATIVE MATRIX  (also served verbatim by GET /api/documentation/matrix)
        // =================================================================================

        /// <summary>One row of the printed role-permission matrix.</summary>
        public sealed class MatrixRow
        {
            /// <summary>Printed form number, e.g. "MNT-1420A".</summary>
            public string FormNo { get; init; } = string.Empty;

            public string FormType { get; init; } = string.Empty;

            /// <summary>0 = drafting.</summary>
            public int StepNo { get; init; }

            public string Capability { get; init; } = string.Empty;

            /// <summary>Canonical OrgRoles values allowed. Admin is always additionally allowed.</summary>
            public string[] Roles { get; init; } = Array.Empty<string>();

            /// <summary>Permission constant that must also be held.</summary>
            public string RequiredPermission { get; init; } = string.Empty;

            /// <summary>Scope rule applied on top of the role and permission checks.</summary>
            public string Scope { get; init; } = string.Empty;

            public string Notes { get; init; } = string.Empty;
        }

        /// <summary>Scope rule labels used by <see cref="MatrixRow.Scope"/>.</summary>
        public static class Scopes
        {
            public const string OwnShop = "OWN_SHOP";
            public const string DocumentationUnit = "DOCUMENTATION_UNIT";
            public const string AssignedTicketOnly = "ASSIGNED_TICKET_ONLY";
            public const string Global = "GLOBAL";
        }

        /// <summary>
        /// The authoritative DOCUMENTATION matrix, generated once from the catalog so it can
        /// never drift away from the executed step tables, then enriched with the scope and
        /// permission columns the catalog does not carry.
        /// </summary>
        public static readonly MatrixRow[] Rows = BuildRows();

        private static MatrixRow[] BuildRows()
        {
            var rows = new List<MatrixRow>();

            foreach (var form in FormWorkflowCatalog.BySection(ToCSections.Documentation))
            {
                // ---- drafting row ----
                rows.Add(new MatrixRow
                {
                    FormNo = form.FormNo,
                    FormType = form.FormType,
                    StepNo = 0,
                    Capability = "Create the draft",
                    Roles = form.DraftRoles,
                    RequiredPermission = Permissions.CreateForm,
                    Scope = Scopes.OwnShop,
                    Notes = string.Equals(form.FormType, FormNodeTypes.SB, StringComparison.OrdinalIgnoreCase)
                        ? "Only under the \"Others\" initiation category."
                        : string.Empty
                });

                // ---- one row per executed step ----
                foreach (var step in form.Steps.Where(s => s.StepNo > 0).OrderBy(s => s.StepNo))
                {
                    rows.Add(new MatrixRow
                    {
                        FormNo = form.FormNo,
                        FormType = form.FormType,
                        StepNo = step.StepNo,
                        Capability = step.Title,
                        Roles = step.EligibleRoles,
                        RequiredPermission = PermissionForStep(step),
                        Scope = ScopeForStep(step),
                        Notes = NotesForStep(form, step)
                    });

                    // ---- an extra row for the assignment authority of that step ----
                    if (step.RequiresManualAssignment)
                    {
                        rows.Add(new MatrixRow
                        {
                            FormNo = form.FormNo,
                            FormType = form.FormType,
                            StepNo = step.StepNo,
                            Capability = $"Assign / re-assign step {step.StepNo}",
                            Roles = step.AssignerRoles.Length > 0 ? step.AssignerRoles : step.EligibleRoles,
                            RequiredPermission =
                                string.Equals(step.AssignmentUnit, FunctionalUnits.Documentation,
                                    StringComparison.OrdinalIgnoreCase)
                                    ? Permissions.AssignDocumentationClerk
                                    : Permissions.AssignFormStep,
                            Scope = ScopeForStep(step),
                            Notes = "The assignee must be an available Documentation Clerk."
                        });
                    }
                }
            }

            return rows.ToArray();
        }

        private static string PermissionForStep(WorkflowStepDefinition step) => step.Kind switch
        {
            WorkflowStepKind.Assignment => Permissions.AssignFormStep,
            WorkflowStepKind.Processing => Permissions.EditForm,
            WorkflowStepKind.Verification => Permissions.EditForm,
            WorkflowStepKind.SignOff when step.Status == ApprovalStatus.PendingDocumentationLeaderSignOff
                => Permissions.SignOffDocumentation,
            WorkflowStepKind.SignOff => Permissions.SignOffForm,
            _ => Permissions.ApproveForm
        };

        private static string ScopeForStep(WorkflowStepDefinition step)
        {
            if (string.Equals(step.AssignmentUnit, FunctionalUnits.Documentation,
                    StringComparison.OrdinalIgnoreCase))
            {
                return step.Status == ApprovalStatus.PendingDocumentationClerk
                    ? Scopes.AssignedTicketOnly
                    : Scopes.DocumentationUnit;
            }

            return step.RestrictToOriginatorShop ? Scopes.OwnShop : Scopes.Global;
        }

        private static string NotesForStep(FormWorkflowDefinition form, WorkflowStepDefinition step)
        {
            var notes = new List<string>();

            if (string.Equals(form.FormType, FormNodeTypes.AD, StringComparison.OrdinalIgnoreCase))
                notes.Add("STL sole authority: no delegation, no skipping.");

            if (!step.AllowsDelegation && !string.Equals(form.FormType, FormNodeTypes.AD,
                    StringComparison.OrdinalIgnoreCase))
                notes.Add("Not delegable.");

            if (step.Skip != SkipMode.NotSkippable)
                notes.Add($"Skippable ({step.Skip}) on '{step.SkipConditionField}'.");

            if (step.RequiredFields.Length > 0)
                notes.Add("Required fields: " + string.Join(", ", step.RequiredFields) + ".");

            return string.Join(" ", notes);
        }

        /// <summary>Matrix rows of one form.</summary>
        public static MatrixRow[] RowsFor(string? formType) =>
            Rows.Where(r => string.Equals(r.FormType, formType, StringComparison.OrdinalIgnoreCase))
                .OrderBy(r => r.StepNo)
                .ToArray();

        // =================================================================================
        // 2. DECISION FUNCTIONS
        // =================================================================================

        /// <summary>
        /// May the actor create a draft of this documentation form?
        /// Combines: catalogued form + draft role + CreateForm permission + the "Others"
        /// initiation rule of MNT-1420A.
        /// </summary>
        public static DocumentationAccessDecision CanDraft(
            DocumentationActorContext actor,
            string? formType,
            IReadOnlyDictionary<string, string?>? formFields)
        {
            if (!FormWorkflowCatalog.IsDocumentationForm(formType))
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.NotDocumentationForm,
                    "The form does not belong to the DOCUMENTATION section.");
            }

            if (!FormWorkflowCatalog.CanDraft(actor.CanonicalRole, formType))
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.PermissionMissing,
                    $"{RoleHierarchy.Label(actor.Role)} may not draft " +
                    $"{FormWorkflowCatalog.FormNoOf(formType)}.");
            }

            if (!actor.Has(Permissions.CreateForm))
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.PermissionMissing,
                    $"The '{Permissions.CreateForm}' permission is missing.");
            }

            if (!FormWorkflowCatalog.IsInitiationCategoryValid(formType, formFields))
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.InitiationCategoryNotOthers,
                    $"{FormWorkflowCatalog.FormNoSB} must be initiated under the " +
                    $"\"{DocumentationInitiationCategories.Others}\" category.");
            }

            return DocumentationAccessDecision.Allow();
        }

        /// <summary>
        /// May the actor assign / re-assign a Documentation Clerk to this ticket?
        /// Only the DL (or Admin), only inside the Documentation unit, only while the
        /// ticket is open.
        /// </summary>
        public static DocumentationAccessDecision CanAssignClerk(
            DocumentationActorContext actor,
            DocumentationTicketFacts ticket)
        {
            if (actor.IsAdmin) return DocumentationAccessDecision.Allow();

            if (ticket.IsClosed)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.TicketClosed,
                    "The ticket is closed.");
            }

            if (!actor.IsDocumentationLeader)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.NotDocumentationLeader,
                    "Only the Documentation Team Leader may assign a clerk.");
            }

            if (!actor.IsInDocumentationUnit)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.NotDocumentationUnitMember,
                    "The actor does not belong to the Documentation Team.");
            }

            if (!actor.Has(Permissions.AssignDocumentationClerk))
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.PermissionMissing,
                    $"The '{Permissions.AssignDocumentationClerk}' permission is missing.");
            }

            var expectedStep = FormWorkflowCatalog.ClerkAssignmentStepNo(ticket.FormType);
            var processingStep = FormWorkflowCatalog.ClerkProcessingStepNo(ticket.FormType);

            // Assignment is legal on the assignment step, and re-assignment is legal while
            // the clerk processing step is still open.
            var onAssignmentStep = expectedStep.HasValue && ticket.CurrentStepNo == expectedStep.Value;
            var onProcessingStep = processingStep.HasValue && ticket.CurrentStepNo == processingStep.Value;

            if (!onAssignmentStep && !onProcessingStep)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.TicketNotAssigned,
                    $"Clerk assignment is only possible on step {expectedStep} " +
                    $"or during step {processingStep}.");
            }

            return DocumentationAccessDecision.Allow();
        }

        /// <summary>
        /// Is the proposed assignee a legitimate, available Documentation Clerk?
        /// This is the implementation of the word "available" in the matrix.
        /// </summary>
        public static DocumentationAccessDecision IsAssignableClerk(
            string? assigneeRole,
            bool assigneeIsAvailable,
            int assigneeOpenTickets,
            int assigneeMaxConcurrent,
            bool assigneeIsAbsentNow)
        {
            if (RoleHierarchy.Normalize(assigneeRole) != OrgRoles.DocumentationClerk)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.AssigneeNotClerk,
                    "The assignee must hold the Documentation Clerk role.");
            }

            if (!assigneeIsAvailable || assigneeIsAbsentNow)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.ClerkNotAvailable,
                    "The selected clerk is currently marked unavailable.");
            }

            if (assigneeMaxConcurrent > 0 && assigneeOpenTickets >= assigneeMaxConcurrent)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.ClerkAtCapacity,
                    $"The selected clerk already holds {assigneeOpenTickets} open tickets " +
                    $"(cap {assigneeMaxConcurrent}).");
            }

            return DocumentationAccessDecision.Allow();
        }

        /// <summary>
        /// May the actor process the bulletin / library entry of this ticket?
        /// The assigned clerk only - or the DL, who may always take a ticket back.
        /// </summary>
        public static DocumentationAccessDecision CanProcessAsClerk(
            DocumentationActorContext actor,
            DocumentationTicketFacts ticket)
        {
            if (actor.IsAdmin) return DocumentationAccessDecision.Allow();

            if (ticket.IsClosed)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.TicketClosed,
                    "The ticket is closed.");
            }

            if (ticket.RegisterLocked)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.RegisterLocked,
                    "The register line was signed off and is locked. Raise an amendment cycle.");
            }

            var processingStep = FormWorkflowCatalog.ClerkProcessingStepNo(ticket.FormType);
            if (processingStep is null || ticket.CurrentStepNo != processingStep.Value)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.TicketNotAssigned,
                    "The ticket is not on the clerk processing step.");
            }

            // The DL may always intervene on his own unit's ticket.
            if (actor.IsDocumentationLeader && actor.IsInDocumentationUnit)
                return DocumentationAccessDecision.Allow();

            if (!actor.IsDocumentationClerk)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.NotDocumentationUnitMember,
                    "Only a Documentation Clerk may process the entry.");
            }

            if (ticket.AssignedClerkUserId is null)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.TicketNotAssigned,
                    "No clerk has been assigned yet.");
            }

            if (ticket.AssignedClerkUserId.Value != actor.UserId)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.NotTicketOwnerClerk,
                    "The ticket is assigned to a different clerk.");
            }

            if (!actor.Has(Permissions.EditForm))
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.PermissionMissing,
                    $"The '{Permissions.EditForm}' permission is missing.");
            }

            return DocumentationAccessDecision.Allow();
        }

        /// <summary>
        /// May the actor perform the DL final review and sign-off (routing step 3)?
        /// </summary>
        public static DocumentationAccessDecision CanSignOffAsLeader(
            DocumentationActorContext actor,
            DocumentationTicketFacts ticket)
        {
            if (actor.IsAdmin) return DocumentationAccessDecision.Allow();

            if (ticket.IsClosed)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.TicketClosed,
                    "The ticket is closed.");
            }

            if (!actor.IsDocumentationLeader || !actor.IsInDocumentationUnit)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.NotDocumentationLeader,
                    "Only the Documentation Team Leader may sign off the entry.");
            }

            if (!actor.Has(Permissions.SignOffDocumentation))
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.PermissionMissing,
                    $"The '{Permissions.SignOffDocumentation}' permission is missing.");
            }

            var signOffStep = FormWorkflowCatalog.DocumentationSignOffStepNo(ticket.FormType);
            if (signOffStep is null || ticket.CurrentStepNo != signOffStep.Value)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.TicketNotAssigned,
                    $"Sign-off is only possible on step {signOffStep}.");
            }

            return DocumentationAccessDecision.Allow();
        }

        /// <summary>
        /// MNT-1420B sole-authority gate. Applies to drafting, processing and issuing:
        /// the actor must be an STL of the OWNING shop (or Admin), and nobody else ever.
        /// </summary>
        public static DocumentationAccessDecision CanActOnDirective(
            DocumentationActorContext actor,
            DirectiveEntryFacts entry,
            int stepNo)
        {
            if (actor.IsAdmin) return DocumentationAccessDecision.Allow();

            if (entry.IsLocked)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.RegisterLocked,
                    "The directive entry is locked. Raise an amendment cycle.");
            }

            if (!actor.IsShopTeamLeader)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.AdSoleAuthorityViolation,
                    "The Shop Team Leader holds sole authority over " +
                    $"{FormWorkflowCatalog.FormNoAD}; " +
                    $"{RoleHierarchy.Label(actor.Role)} may not act on it.");
            }

            if (actor.ShopId is null || actor.ShopId.Value != entry.ShopId)
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.AdOutsideOwnShop,
                    "A Shop Team Leader may only act on the directives of his own shop.");
            }

            if (!FormWorkflowCatalog.CanActOnStep(actor.CanonicalRole, FormNodeTypes.AD, stepNo))
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.AdSoleAuthorityViolation,
                    $"Step {stepNo} of {FormWorkflowCatalog.FormNoAD} does not accept this role.");
            }

            if (stepNo == FormWorkflowCatalog.ADStepStlIssue)
            {
                if (entry.IsIssued)
                {
                    return DocumentationAccessDecision.Deny(
                        DocumentationErrorCodes.DirectiveAlreadyIssued,
                        "The directive has already been issued.");
                }

                if (!actor.Has(Permissions.SignOffForm))
                {
                    return DocumentationAccessDecision.Deny(
                        DocumentationErrorCodes.PermissionMissing,
                        $"The '{Permissions.SignOffForm}' permission is missing.");
                }
            }
            else if (!actor.Has(Permissions.EditForm))
            {
                return DocumentationAccessDecision.Deny(
                    DocumentationErrorCodes.PermissionMissing,
                    $"The '{Permissions.EditForm}' permission is missing.");
            }

            return DocumentationAccessDecision.Allow();
        }

        /// <summary>
        /// May the actor SEE the ticket? Documentation unit members see every unit ticket;
        /// the originating shop sees its own tickets; management above the shop sees all.
        /// </summary>
        public static bool CanViewTicket(DocumentationActorContext actor, DocumentationTicketFacts ticket)
        {
            if (actor.IsAdmin) return true;
            if (!actor.Has(Permissions.ViewForm)) return false;
            if (actor.IsInDocumentationUnit) return true;
            if (ticket.OriginatorUserId == actor.UserId) return true;

            if (actor.ShopId.HasValue && ticket.OriginShopId.HasValue
                && actor.ShopId.Value == ticket.OriginShopId.Value)
            {
                return true;
            }

            // Manager / Director / QA oversight.
            return RoleHierarchy.RankOf(actor.CanonicalRole)
                   <= RoleHierarchy.RankOf(OrgRoles.Manager)
                   || actor.CanonicalRole == OrgRoles.QAPersonnel;
        }

        /// <summary>
        /// The capability flags returned on every documentation response, so the frontend
        /// implements no rules at all.
        /// </summary>
        public static (bool CanAct, bool CanAssign, bool CanProcess, bool CanSignOff, bool CanView)
            CapabilitiesFor(DocumentationActorContext actor, DocumentationTicketFacts ticket)
        {
            var canAssign = CanAssignClerk(actor, ticket).Allowed;
            var canProcess = CanProcessAsClerk(actor, ticket).Allowed;
            var canSignOff = CanSignOffAsLeader(actor, ticket).Allowed;

            var canAct = canAssign || canProcess || canSignOff
                         || FormWorkflowCatalog.CanActOnStep(actor.CanonicalRole,
                             ticket.FormType, ticket.CurrentStepNo);

            return (canAct, canAssign, canProcess, canSignOff, CanViewTicket(actor, ticket));
        }

        // =================================================================================
        // 3. SELF-CHECK
        // =================================================================================

        /// <summary>
        /// Startup / unit-test assertion: every role named by a Documentation matrix row
        /// must actually hold the permission that row demands, otherwise the step is
        /// unreachable in production.
        /// </summary>
        public static IReadOnlyList<string> Validate()
        {
            var problems = new List<string>();

            foreach (var row in Rows)
            {
                foreach (var role in row.Roles)
                {
                    var canonical = RoleHierarchy.Normalize(role);
                    if (canonical is null)
                    {
                        problems.Add($"{row.FormNo} step {row.StepNo}: unknown role '{role}'.");
                        continue;
                    }

                    if (canonical == OrgRoles.Admin) continue;
                    if (string.IsNullOrWhiteSpace(row.RequiredPermission)) continue;

                    if (!RoleHierarchy.DefaultPermissions.TryGetValue(canonical, out var defaults)
                        || !defaults.Contains(row.RequiredPermission, StringComparer.OrdinalIgnoreCase))
                    {
                        problems.Add(
                            $"{row.FormNo} step {row.StepNo} ('{row.Capability}'): " +
                            $"{RoleHierarchy.Label(canonical)} is eligible but its default " +
                            $"permission set does not contain '{row.RequiredPermission}'.");
                    }
                }
            }

            return problems
                .Concat(FormWorkflowCatalog.ValidateDocumentationSection())
                .ToList();
        }
    }
}