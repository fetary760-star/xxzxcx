using CMT.Application.DTOs;

namespace CMT.Application.Services;

public interface IAmendmentService
{
    Task<ServiceResult<AmendmentDto>> RequestAmendmentAsync(int taskId, int requesterId, string reason, CancellationToken cancellationToken = default);
    Task<ServiceResult<AmendmentDto>> ReviewAmendmentAsync(int taskId, int reviewerId, AmendmentStatus decision, string reviewNotes, CancellationToken cancellationToken = default);
    Task<ServiceResult<AmendmentDto>> ApproveAmendmentAsync(int taskId, int approverId, string approvalNotes, CancellationToken cancellationToken = default);
    Task<ServiceResult<AmendmentDto>> RejectAmendmentAsync(int taskId, int rejectorId, string rejectionReason, CancellationToken cancellationToken = default);
    Task<ServiceResult<List<AmendmentDto>>> GetPendingAmendmentsAsync(int userId, CancellationToken cancellationToken = default);
    Task<ServiceResult<List<AmendmentDto>>> GetAmendmentHistoryAsync(int taskId, CancellationToken cancellationToken = default);
    Task<ServiceResult<AmendmentDto>> ForwardToDirectorAsync(int taskId, int teamLeaderId, string forwardingNotes, CancellationToken cancellationToken = default);
}