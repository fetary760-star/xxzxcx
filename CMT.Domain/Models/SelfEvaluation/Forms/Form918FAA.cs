using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;
using CMT.Domain.Models.Shared;

namespace CMT.Domain.Models.SelfEvaluation.Forms
{
    /// <summary>
    /// 918 FAA Form - FAA Form 8110-3 equivalent for repair station capability.
    /// Corresponds to Excel sheet "918 FAA".
    /// </summary>
    public class Form918FAA
    {
        public Guid Id { get; set; }

        public Guid ATARecordId { get; set; }
        public Guid ShopId { get; set; }

        [MaxLength(100)]
        public string FormNumber { get; set; } = string.Empty;

        [MaxLength(50)]
        public string RevisionNumber { get; set; } = string.Empty;

        public DateTime? RevisionDate { get; set; }

        [MaxLength(200)]
        public string RepairStationName { get; set; } = string.Empty;

        [MaxLength(100)]
        public string CertificateNumber { get; set; } = string.Empty;

        [MaxLength(500)]
        public string Address { get; set; } = string.Empty;

        [MaxLength(100)]
        public string ATAChapterCode { get; set; } = string.Empty;

        [MaxLength(500)]
        public string ComponentDescription { get; set; } = string.Empty;

        [MaxLength(200)]
        public string PartNumber { get; set; } = string.Empty;

        [MaxLength(200)]
        public string Manufacturer { get; set; } = string.Empty;

        [MaxLength(200)]
        public string ModelDesignation { get; set; } = string.Empty;

        // Capability fields
        public bool HasOverhaul { get; set; }
        public bool HasRepair { get; set; }
        public bool HasInspection { get; set; }
        public bool HasModification { get; set; }

        [MaxLength(2000)]
        public string LimitationsRemarks { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string SpecialEquipment { get; set; } = string.Empty;

        [MaxLength(2000)]
        public string TechnicalData { get; set; } = string.Empty;

        [MaxLength(200)]
        public string PreparedBy { get; set; } = string.Empty;

        public DateTime? PreparedDate { get; set; }

        [MaxLength(200)]
        public string ApprovedBy { get; set; } = string.Empty;

        public DateTime? ApprovedDate { get; set; }

        // Approval workflow
        public ApprovalStatus ApprovalStatus { get; set; } = ApprovalStatus.Draft;

        public bool IsActive { get; set; } = true;
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        [MaxLength(200)]
        public string CreatedBy { get; set; } = string.Empty;

        [MaxLength(200)]
        public string UpdatedBy { get; set; } = string.Empty;

        // Navigation properties
        public ATARecord ATARecord { get; set; } = null!;
        public Shop Shop { get; set; } = null!;
    }
}