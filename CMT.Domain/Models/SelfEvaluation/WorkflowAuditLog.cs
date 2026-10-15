using System;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation
{
    public class WorkflowAuditLog
    {
        public Guid Id { get; set; }

        [Required]
        [MaxLength(200)]
        public string Action { get; set; } = string.Empty;

        public WorkflowAction WorkflowAction { get; set; }

        [Required]
        [MaxLength(100)]
        public string EntityType { get; set; } = string.Empty;

        public Guid EntityId { get; set; }

        [Required]
        [MaxLength(200)]
        public string PerformedBy { get; set; } = string.Empty;

        /// <summary>
        /// Role of the user who performed the action (e.g., Manager, Engineer, STL, Director).
        /// Explicitly tracked for compliance and audit trail clarity.
        /// </summary>
        [MaxLength(100)]
        public string UserRole { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string Details { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string PreviousValues { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string NewValues { get; set; } = string.Empty;

        [MaxLength(100)]
        public string IpAddress { get; set; } = string.Empty;

        public DateTime Timestamp { get; set; } = DateTime.UtcNow;
    }
}