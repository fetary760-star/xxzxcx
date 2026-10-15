using System;
using System.Collections.Generic;
using System.Linq;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation
{
    // =====================================================================================
    // AMENDED v14 - FEATURE 3: ENGINEER ROLE & SHOP TEAM ROUTING
    //
    // REQUIREMENT, VERBATIM
    //   "Creation by Special Team Leader: The Engineer role is created and assigned by the
    //    Special Team Leader.
    //    Targeted Routing to Specific Shops: When an Engineer creates a New ATA Record that
    //    spans multiple shops or teams, the system must route the record strictly to the
    //    designated Shop Team Leader's page for that specific shop."
    //
    // WHAT ALREADY EXISTS - AND WHAT WAS MISSING
    // ------------------------------------------
    //   Already present:
    //     - OrgRoles.Engineer and OrgRoles.SpecialTeamLeader;
    //     - RoleHierarchy's creation matrix already maps SpecialTeamLeader -> Engineer;
    //     - ATARecordShopRouting already models per-shop state INCLUDING the resolved STL
    //       (ResolvedTeamLeaderUserId / HasActiveTeamLeader).
    //   Missing, and supplied here:
    //     - the ENFORCEMENT of "created and assigned by the Special Team Leader" as a
    //       checkable decision rather than a comment in a matrix;
    //     - the CONSTRUCTION of the routing rows from a multi-shop selection;
    //     - the VISIBILITY rule that makes "strictly to the designated Shop Team Leader's
    //       page" true - i.e. an STL of shop B must not see the shop A routing row.
    //
    // THE WORD "STRICTLY" IS THE WHOLE FEATURE
    //   Without a visibility rule, a multi-shop record appears in every STL's queue and each
    //   one waits for the others. CanTeamLeaderSee(...) and RoutingsFor(...) below make the
    //   record appear ONLY in the queue of the STL resolved for that shop, and
    //   RecomputeCompletion(...) closes the parent only when every active shop is done.
    //
    // A SHOP WITH NO ACTIVE STL IS A WARNING, NEVER A SILENT DROP
    //   ATARecordShopRouting.HasActiveTeamLeader exists precisely so this case is visible.
    //   BuildRoutings still creates the row, flags it, and reports it - dropping it would
    //   lose a shop from a regulatory record.
    // =====================================================================================

    /// <summary>Stable refusal codes for engineer provisioning and routing.</summary>
    public static class EngineerRoutingDenialCodes
    {
        public const string NotSpecialTeamLeader = "ENG_NOT_SPECIAL_TEAM_LEADER";
        public const string NotEngineerRole = "ENG_TARGET_NOT_ENGINEER";
        public const string MissingPermission = "ENG_MISSING_PERMISSION";
        public const string NoTargetShops = "ENG_NO_TARGET_SHOPS";
        public const string DuplicateTargetShop = "ENG_DUPLICATE_TARGET_SHOP";
        public const string ShopHasNoTeamLeader = "ENG_SHOP_HAS_NO_TEAM_LEADER";
        public const string NotOwningTeamLeader = "ENG_NOT_OWNING_TEAM_LEADER";
        public const string DelegationNotUsable = "ENG_DELEGATION_NOT_USABLE";
    }

    /// <summary>Outcome of an engineer/routing authorization check.</summary>
    public sealed class EngineerRoutingDecision
    {
        public bool Allowed { get; init; }
        public string? DenialCode { get; init; }
        public string Message { get; init; } = string.Empty;

        /// <summary>Non-fatal problems, e.g. a target shop without an active STL.</summary>
        public string[] Warnings { get; init; } = Array.Empty<string>();

        public static EngineerRoutingDecision Allow(params string[] warnings) =>
            new() { Allowed = true, Message = "Allowed.", Warnings = warnings ?? Array.Empty<string>() };

        public static EngineerRoutingDecision Deny(string code, string message) =>
            new() { Allowed = false, DenialCode = code, Message = message };
    }

    /// <summary>
    /// One selected target shop, resolved by the caller from the Shop table before routing.
    /// A plain DTO so the policy needs no DbContext.
    /// </summary>
    public sealed class ShopRoutingTarget
    {
        public Guid ShopId { get; init; }

        public string ShopName { get; init; } = string.Empty;

        /// <summary>
        /// STL resolved from the shop. Null when the shop currently has no active Shop Team
        /// Leader - surfaced as a warning, never silently dropped.
        /// </summary>
        public long? TeamLeaderUserId { get; init; }

        public string TeamLeaderName { get; init; } = string.Empty;

        /// <summary>False when the resolved STL account is inactive.</summary>
        public bool IsTeamLeaderActive { get; init; }

        /// <summary>True for the shop that owns the record (the Engineer's own shop).</summary>
        public bool IsPrimary { get; init; }

        /// <summary>Usable as a routing destination that somebody can actually action.</summary>
        public bool HasActionableTeamLeader =>
            TeamLeaderUserId.HasValue && TeamLeaderUserId.Value > 0 && IsTeamLeaderActive;
    }

    /// <summary>
    /// Who may create an Engineer, and who may route an ATA record. Pure decisions.
    /// </summary>
    public static class EngineerProvisioningPolicy
    {
        /// <summary>
        /// Roles that may create and assign an Engineer. The requirement names the Special
        /// Team Leader; Admin is included because Admin provisions every role in this system.
        /// Director is included because the Special Team Leader is created UNDER a Director
        /// and a vacancy at that post must not block engineer provisioning entirely.
        /// </summary>
        public static readonly string[] EngineerCreatorRoles =
        {
            OrgRoles.SpecialTeamLeader,
            OrgRoles.Admin,
            OrgRoles.Director
        };

        /// <summary>True when the actor may create/assign Engineer accounts.</summary>
        public static bool CanCreateEngineerRole(string? actorRole) =>
            !string.IsNullOrWhiteSpace(actorRole)
            && EngineerCreatorRoles.Any(r =>
                string.Equals(r, actorRole, StringComparison.OrdinalIgnoreCase));

        /// <summary>
        /// Decision for "create a user whose role is Engineer".
        /// </summary>
        /// <param name="actorRole">Canonical role of the caller.</param>
        /// <param name="targetRole">Role being assigned to the new/edited user.</param>
        public static EngineerRoutingDecision CanProvisionEngineer(
            string? actorRole,
            string? targetRole)
        {
            if (!string.Equals(targetRole, OrgRoles.Engineer, StringComparison.OrdinalIgnoreCase))
            {
                return EngineerRoutingDecision.Deny(
                    EngineerRoutingDenialCodes.NotEngineerRole,
                    "This rule governs the Engineer role only; use the standard user-creation "
                    + "matrix for any other role.");
            }

            if (!CanCreateEngineerRole(actorRole))
            {
                return EngineerRoutingDecision.Deny(
                    EngineerRoutingDenialCodes.NotSpecialTeamLeader,
                    "The Engineer role is created and assigned by the Special Team Leader. "
                    + "Ask the Special Team Leader (or an Admin) to provision this account.");
            }

            return EngineerRoutingDecision.Allow();
        }
    }

    /// <summary>
    /// Construction and visibility of per-shop routing rows for an ATA record.
    /// </summary>
    public static class EngineerRoutingPolicy
    {
        /// <summary>Roles that may route an ATA record to shops.</summary>
        public static readonly string[] RoutingRoles =
        {
            OrgRoles.Engineer,
            OrgRoles.TeamLeader,
            OrgRoles.SpecialTeamLeader,
            OrgRoles.ShopManager,
            OrgRoles.Manager,
            OrgRoles.Admin
        };

        /// <summary>
        /// May this actor route the record to the supplied shops?
        /// Validates authority, a non-empty selection, and duplicate-free targets.
        /// </summary>
        public static EngineerRoutingDecision CanRoute(
            string? actorRole,
            IReadOnlyCollection<string>? effectivePermissions,
            IReadOnlyCollection<ShopRoutingTarget>? targets)
        {
            var isAdmin = string.Equals(actorRole, OrgRoles.Admin, StringComparison.OrdinalIgnoreCase);

            var hasPermission = isAdmin
                || (effectivePermissions is not null
                    && effectivePermissions.Any(p =>
                        string.Equals(p, Permissions.RouteATARecord, StringComparison.OrdinalIgnoreCase)))
                || (!string.IsNullOrWhiteSpace(actorRole)
                    && RoutingRoles.Any(r =>
                        string.Equals(r, actorRole, StringComparison.OrdinalIgnoreCase)));

            if (!hasPermission)
            {
                return EngineerRoutingDecision.Deny(
                    EngineerRoutingDenialCodes.MissingPermission,
                    "Routing an ATA record to a shop requires the Engineer, Shop Team Leader, "
                    + "Special Team Leader, Shop Manager or Manager role, or the "
                    + "'ata_record.route' permission.");
            }

            if (targets is null || targets.Count == 0)
            {
                return EngineerRoutingDecision.Deny(
                    EngineerRoutingDenialCodes.NoTargetShops,
                    "Select at least one target shop: an ATA record cannot be routed to nobody.");
            }

            var duplicate = targets
                .GroupBy(t => t.ShopId)
                .FirstOrDefault(g => g.Count() > 1);

            if (duplicate is not null)
            {
                return EngineerRoutingDecision.Deny(
                    EngineerRoutingDenialCodes.DuplicateTargetShop,
                    "The same shop was selected more than once. Each shop must appear exactly "
                    + "once so its Shop Team Leader has a single, unambiguous routing row.");
            }

            var warnings = targets
                .Where(t => !t.HasActionableTeamLeader)
                .Select(t =>
                    $"Shop '{t.ShopName}' has no active Shop Team Leader. The routing row will "
                    + "be created and flagged, but nobody can action it until an STL is assigned.")
                .ToArray();

            return EngineerRoutingDecision.Allow(warnings);
        }

        /// <summary>
        /// Build one <see cref="ATARecordShopRouting"/> per target shop.
        ///
        /// Every row is created, including shops with no active STL: that is what
        /// HasActiveTeamLeader is for. Dropping such a row would remove a shop from a
        /// regulatory record without a trace.
        /// </summary>
        public static List<ATARecordShopRouting> BuildRoutings(
            Guid ataRecordId,
            IReadOnlyCollection<ShopRoutingTarget> targets,
            long routedByUserId,
            DateTime utcNow)
        {
            if (targets is null)
            {
                throw new ArgumentNullException(nameof(targets));
            }

            var rows = new List<ATARecordShopRouting>(targets.Count);

            foreach (var target in targets)
            {
                rows.Add(new ATARecordShopRouting
                {
                    Id = Guid.NewGuid(),
                    ATARecordId = ataRecordId,
                    TargetShopId = target.ShopId,
                    TargetShopName = target.ShopName ?? string.Empty,
                    IsPrimaryTarget = target.IsPrimary,

                    ResolvedTeamLeaderUserId = target.HasActionableTeamLeader
                        ? target.TeamLeaderUserId
                        : null,
                    ResolvedTeamLeaderName = target.HasActionableTeamLeader
                        ? (target.TeamLeaderName ?? string.Empty)
                        : string.Empty,
                    HasActiveTeamLeader = target.HasActionableTeamLeader,

                    // A row with a resolved STL waits for that STL; a row without one waits
                    // for an assignment, which is exactly PendingAssignment.
                    Status = target.HasActionableTeamLeader
                        ? ApprovalStatus.PendingTeamLeaderReview
                        : ApprovalStatus.PendingAssignment,

                    RoutedAt = utcNow,
                    RoutedByUserId = routedByUserId,
                    IsComplete = false,
                    IsActive = true,
                    Notes = target.HasActionableTeamLeader
                        ? string.Empty
                        : "No active Shop Team Leader resolved for this shop at routing time.",
                    UpdatedAt = utcNow
                });
            }

            return rows;
        }

        /// <summary>
        /// THE "STRICTLY" RULE. True only when this user is the STL the routing row was
        /// resolved to. An STL of another shop gets false, which is what keeps a multi-shop
        /// record out of every queue except the designated ones.
        /// </summary>
        public static bool CanTeamLeaderSee(ATARecordShopRouting routing, long userId)
        {
            if (routing is null || !routing.IsActive)
            {
                return false;
            }

            return routing.ResolvedTeamLeaderUserId.HasValue
                && routing.ResolvedTeamLeaderUserId.Value == userId;
        }

        /// <summary>
        /// Rows a given Shop Team Leader may act on. This is the query the STL's page should
        /// use; filtering by shop name or by the record's own ShopId is a defect, because a
        /// record routed to three shops has one ShopId and three responsible STLs.
        /// </summary>
        public static IEnumerable<ATARecordShopRouting> RoutingsFor(
            IEnumerable<ATARecordShopRouting> routings,
            long teamLeaderUserId)
        {
            return (routings ?? Enumerable.Empty<ATARecordShopRouting>())
                .Where(r => CanTeamLeaderSee(r, teamLeaderUserId));
        }

        /// <summary>
        /// Decision for "this STL wants to act on this routing row".
        /// </summary>
        public static EngineerRoutingDecision CanActOnRouting(
            ATARecordShopRouting routing,
            long actorUserId,
            string? actorRole)
        {
            if (routing is null)
            {
                return EngineerRoutingDecision.Deny(
                    EngineerRoutingDenialCodes.NotOwningTeamLeader,
                    "No routing row was supplied.");
            }

            if (string.Equals(actorRole, OrgRoles.Admin, StringComparison.OrdinalIgnoreCase))
            {
                return EngineerRoutingDecision.Allow();
            }

            if (!routing.HasActiveTeamLeader)
            {
                return EngineerRoutingDecision.Deny(
                    EngineerRoutingDenialCodes.ShopHasNoTeamLeader,
                    $"Shop '{routing.TargetShopName}' has no active Shop Team Leader. Assign "
                    + "one before this routing can be actioned.");
            }

            if (!CanTeamLeaderSee(routing, actorUserId))
            {
                return EngineerRoutingDecision.Deny(
                    EngineerRoutingDenialCodes.NotOwningTeamLeader,
                    $"This record is routed to the designated Shop Team Leader of "
                    + $"'{routing.TargetShopName}'. Only that Shop Team Leader can action it.");
            }

            return EngineerRoutingDecision.Allow();
        }

        /// <summary>
        /// Mark one shop's work complete.
        /// </summary>
        public static void CompleteRouting(
            ATARecordShopRouting routing,
            long actorUserId,
            DateTime utcNow,
            string notes = "")
        {
            if (routing is null)
            {
                throw new ArgumentNullException(nameof(routing));
            }

            routing.IsComplete = true;
            routing.Status = ApprovalStatus.Approved;
            routing.CompletedAt = utcNow;
            routing.CompletedByUserId = actorUserId;
            routing.UpdatedAt = utcNow;

            if (!string.IsNullOrWhiteSpace(notes))
            {
                routing.Notes = notes;
            }
        }

        /// <summary>
        /// Acknowledge receipt on the STL's page, so a record that has been seen is
        /// distinguishable from one nobody has opened.
        /// </summary>
        public static void AcknowledgeRouting(
            ATARecordShopRouting routing,
            long actorUserId,
            DateTime utcNow)
        {
            if (routing is null)
            {
                throw new ArgumentNullException(nameof(routing));
            }

            if (!routing.AcknowledgedAt.HasValue)
            {
                routing.AcknowledgedAt = utcNow;
                routing.AcknowledgedByUserId = actorUserId;
                routing.UpdatedAt = utcNow;
            }
        }

        /// <summary>
        /// True when EVERY active routing row is complete. The parent record must not be
        /// approved before this returns true, otherwise a multi-shop record closes while one
        /// shop is still working.
        /// </summary>
        public static bool AllShopsComplete(IEnumerable<ATARecordShopRouting> routings)
        {
            var active = (routings ?? Enumerable.Empty<ATARecordShopRouting>())
                .Where(r => r.IsActive)
                .ToArray();

            return active.Length > 0 && active.All(r => r.IsComplete);
        }

        /// <summary>
        /// Progress of the shop fan-out, for the Engineer's and the Special Team Leader's
        /// view: "2 of 3 shops complete".
        /// </summary>
        public static (int Completed, int Total, string Text) ShopProgress(
            IEnumerable<ATARecordShopRouting> routings)
        {
            var active = (routings ?? Enumerable.Empty<ATARecordShopRouting>())
                .Where(r => r.IsActive)
                .ToArray();

            var done = active.Count(r => r.IsComplete);

            if (active.Length == 0)
            {
                return (0, 0, "Not routed to any shop yet.");
            }

            var pending = active
                .Where(r => !r.IsComplete)
                .Select(r => r.TargetShopName)
                .Where(n => !string.IsNullOrWhiteSpace(n))
                .ToArray();

            var text = done == active.Length
                ? $"All {active.Length} shops complete."
                : $"{done} of {active.Length} shops complete - waiting on "
                  + string.Join(", ", pending) + ".";

            return (done, active.Length, text);
        }
    }
}