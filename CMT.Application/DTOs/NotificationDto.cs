namespace CMT.Application.DTOs;

public class NotificationDto
{
    public int NotificationId { get; set; }
    public string Message { get; set; } = string.Empty;
    public DateTime CreatedAt { get; set; }
    public bool IsRead { get; set; }
    public int RecipientId { get; set; }
    public string NotificationType { get; set; } = "General";
    public string Priority { get; set; } = "Medium";
    public string? TaskId { get; set; }
    public string? RelatedEntity { get; set; }
    public string? ActionUrl { get; set; }
    public Dictionary<string, object>? Metadata { get; set; }
}

public class NotificationListDto
{
    public List<NotificationDto> Notifications { get; set; } = new();
    public int TotalCount { get; set; }
    public int UnreadCount { get; set; }
    public PaginationDto Pagination { get; set; } = new();
}

public class PaginationDto
{
    public int Page { get; set; }
    public int Limit { get; set; }
    public int Total { get; set; }
    public int TotalPages { get; set; }
    public bool HasNext { get; set; }
    public bool HasPrevious { get; set; }
}

public class BulkNotificationActionDto
{
    public List<int> NotificationIds { get; set; } = new();
    public string Action { get; set; } = string.Empty; // "mark_read", "mark_unread", "delete"
}

public class NotificationSettingsDto
{
    public int UserId { get; set; }
    public bool EmailNotifications { get; set; } = true;
    public bool PushNotifications { get; set; } = true;
    public bool TaskAssignments { get; set; } = true;
    public bool DeadlineWarnings { get; set; } = true;
    public bool TaskCompletions { get; set; } = false;
    public bool SystemUpdates { get; set; } = true;
    public bool AmendmentRequests { get; set; } = true;
    public bool InterventionRequests { get; set; } = true;
    public DateTime UpdatedAt { get; set; }
}