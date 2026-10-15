using System;
using System.Collections.Generic;
using System.ComponentModel.DataAnnotations;

namespace CMT.Domain.Models.SelfEvaluation
{
    public class ATAChapter
    {
        public Guid Id { get; set; }

        [Required]
        [MaxLength(10)]
        public string ChapterNumber { get; set; } = string.Empty;

        [Required]
        [MaxLength(300)]
        public string Title { get; set; } = string.Empty;

        [MaxLength(1000)]
        public string Description { get; set; } = string.Empty;

        public bool IsActive { get; set; } = true;

        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
        public DateTime UpdatedAt { get; set; } = DateTime.UtcNow;

        // Navigation properties
        public ICollection<Component> Components { get; set; } = new List<Component>();
    }
}