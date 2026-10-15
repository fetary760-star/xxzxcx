using System;
using System.Collections.Generic;
using System.Linq;
using CMT.Domain.Models.Shared;
using CMT.Domain.Models.Workflow;

namespace CMT.Domain.Models.SelfEvaluation
{
    /// <summary>
    /// The ATA record approval chain, as DATA.
    ///
    /// ⚠️ REPLACES the hard-coded switch in ATARecordCommandHandler (defect D2), which
    /// (a) performed no role check and (b) forced Director AND QA onto every record.
    ///
    /// The requirement was: "from Shop Team Leader to Manager, without requiring Director
    /// approval unless specified". So the default chain has three signing stages and no
    /// Director, and the optional stages are opted into per record.
    ///
    /// This type is PURE — no DbContext, no I/O — so it is trivially unit-testable and can
    /// be called from a query handler, a command handler or a capability projection.
    /// </summary>
    public static class ATARecordWorkflowCatalog
    {
        /// <summary>Canonical printed label for the ATA record revision.</summary>
        public static string RevisionLabel(int revisionNumber)
            => $"Revision v{Math.Max(1, revisionNumber)}";

        /// <summary>One stage of the chain.</summary>
        public sealed class Stage
        {
            /// <summary>0 = drafting.</summary>
            public int Order { get; init; }

            /// <summary>Status the record sits in WHILE this stage is pending.</summary>
            public ApprovalStatus Status { get; init; }

            public string Title { get; init; } = string.Empty;

            public SignatureBlockType SignatureBlock { get; init; }

            /// <summary>Printed caption; resolved through FormWorkflowCatalog.</summary>
            public string Caption => FormWorkflowCatalog.SignatureCaption(SignatureBlock);

            /// <summary>
            /// Canonical OrgRoles allowed to execute THIS stage. Approve / Reject /
            /// Request Revision are visible only to these roles (plus Admin).
            /// </summary>
            public string[] EligibleRoles { get; init; } = Array.Empty<string>();

            /// <summary>True for a stage that only appears when the record opts in.</summary>
            public bool IsOptional { get; init; }
        }

        // ---------------- stage definitions ----------------

        private static Stage Draft => new()
        {
            Order = 0,
            Status = ApprovalStatus.Draft,
            Title = "Prepared by",
            SignatureBlock = SignatureBlockType.PreparedBy,
            EligibleRoles = new[]
            {
                OrgRoles.TeamLeader, OrgRoles.ShopManager,
                OrgRoles.Engineer,   OrgRoles.CertifyingStaff
            }
        };

        private static Stage TeamLeaderReview => new()
        {
            Order = 1,
            Status = ApprovalStatus.PendingTeamLeaderReview,
            Title = "Shop Team Leader review",
            SignatureBlock = SignatureBlockType.ReviewedBy,
            EligibleRoles = new[] { OrgRoles.TeamLeader, OrgRoles.ShopManager }
        };

        private static Stage ManagerApproval => new()
        {
            Order = 2,
            Status = ApprovalStatus.PendingManagerApproval,
            Title = "Department Manager approval",
            SignatureBlock = SignatureBlockType.ApprovedBy,
            EligibleRoles = new[] { OrgRoles.Manager }
        };

        private static Stage QAApproval => new()
        {
            Order = 3,
            Status = ApprovalStatus.PendingQAApproval,
            Title = "QA approval",
            SignatureBlock = SignatureBlockType.ApprovedBy,
            EligibleRoles = new[] { OrgRoles.QAPersonnel, OrgRoles.CertifyingStaff },
            IsOptional = true
        };

        private static Stage DirectorApproval => new()
        {
            Order = 4,
            Status = ApprovalStatus.PendingDirectorApproval,
            Title = "Director approval",
            SignatureBlock = SignatureBlockType.ApprovedBy,
            EligibleRoles = new[] { OrgRoles.Director },
            IsOptional = true
        };

        private static Stage ECAAEndorsement => new()
        {
            Order = 5,
            Status = ApprovalStatus.PendingECAAEndorsement,
            Title = "ECAA endorsement",
            SignatureBlock = SignatureBlockType.ApprovedBy,
            EligibleRoles = new[] { OrgRoles.ECAAPersonnel },
            IsOptional = true
        };

        /// <summary>Terminal stage. Not signable; the chain ends here.</summary>
        private static Stage Approved => new()
        {
            Order = 99,
            Status = ApprovalStatus.Approved,
            Title = "Approved",
            SignatureBlock = SignatureBlockType.None,
            EligibleRoles = Array.Empty<string>()
        };

        /// <summary>
        /// The chain for one record. AMENDED v22: the Department Manager approval stage
        /// is RETIRED from the default chain — the Shop Team Leader review is now the
        /// confirmation / finalization step, so an engineer- or delegate-created record
        /// routes to the Shop Team Leader and ends at their sign-off. Legacy records
        /// persisted while the manager stage was active remain actionable (see below).
        /// Optional stages are still appended only when the record specifies them, and
        /// Stage Order values are RENUMBERED contiguously so StageOrder is dense.
        /// </summary>
        public static IReadOnlyList<Stage> ChainFor(ATARecord record)
        {
            if (record is null) throw new ArgumentNullException(nameof(record));

            var stages = new List<Stage> { Draft, TeamLeaderReview };

            // Legacy compatibility: a record persisted while the retired manager stage
            // was active may still sit in PendingManagerApproval. Keep that stage
            // actionable for exactly those records so nothing is stranded mid-chain;
            // new records never enter it.
            if (record.ApprovalStatus == ApprovalStatus.PendingManagerApproval)
                stages.Add(ManagerApproval);

            if (record.RequiresQAApproval)       stages.Add(QAApproval);
            if (record.RequiresDirectorApproval) stages.Add(DirectorApproval);
            if (record.RequiresECAAEndorsement)  stages.Add(ECAAEndorsement);

            stages.Add(Approved);

            return stages
                .Select((s, index) => new Stage
                {
                    Order = index,
                    Status = s.Status,
                    Title = s.Title,
                    SignatureBlock = s.SignatureBlock,
                    EligibleRoles = s.EligibleRoles,
                    IsOptional = s.IsOptional
                })
                .ToList();
        }

        /// <summary>The stage the record is sitting in, or null for a terminal status.</summary
        public static Stage? CurrentStage(ATARecord record)
            => ChainFor(record).FirstOrDefault(s => s.Status == record.ApprovalStatus);

        /// <summary>
        /// The status the record moves to when the current stage is approved.
        /// Null when the record is not in a signable stage.
        /// </summary>
        public static ApprovalStatus? NextStatusAfterApproval(ATARecord record)
        {
            var chain = ChainFor(record);
            var index = chain.ToList().FindIndex(s => s.Status == record.ApprovalStatus);

            if (index < 0) return null;                       // not in this chain
            if (index >= chain.Count - 1) return null;        // already terminal
            return chain[index + 1].Status;
        }

        /// <summary>
        /// The status a "Request Revision" returns the record to: the previous signable
        /// stage, or Returned when the record is at the first review stage.
        /// </summary>
        public static ApprovalStatus StatusAfterRequestRevision(ATARecord record)
        {
            var chain = ChainFor(record);
            var index = chain.ToList().FindIndex(s => s.Status == record.ApprovalStatus);

            if (index <= 1) return ApprovalStatus.Returned;
            return chain[index - 1].Status;
        }

        /// <summary>
        /// Roles allowed to act on the record RIGHT NOW. Admin is always included as the
        /// universal supervisor, consistent with RoleHierarchy.CanActOn.
        /// </summary>
        public static string[] EligibleRolesNow(ATARecord record)
        {
            var stage = CurrentStage(record);
            if (stage is null) return Array.Empty<string>();

            return stage.EligibleRoles
                .Concat(new[] { OrgRoles.Admin })
                .Distinct(StringComparer.OrdinalIgnoreCase)
                .ToArray();
        }

        /// <summary>True when <paramref name="role"/> owns the record's current stage.</summary>
        public static bool IsCurrentStageRole(ATARecord record, string? role)
        {
            var canonical = RoleHierarchy.Normalize(role);
            if (canonical is null) return false;

            return EligibleRolesNow(record)
                .Contains(canonical, StringComparer.OrdinalIgnoreCase);
        }
    }
}