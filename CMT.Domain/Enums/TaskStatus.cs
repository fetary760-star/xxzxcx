using System;

namespace CMT.Domain.Enums
{
    public enum TaskStatus
    {
        Pending,
        InProgress,
        Completed,
        Blocked,
        OnHold,
        Rejected,
        Cancelled,
        Paused,
        PendingTLApproval
    }

    public enum AmendmentStatus
    {
        PendingTLReview,
        ForwardedToDirector,
        Approved,
        Rejected
    }
}