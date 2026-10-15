using System.Threading;
using System.Threading.Tasks;
using CMT.Domain.Models.SelfEvaluation;

namespace CMT.Application.SelfEvaluation.Services
{
    // =====================================================================================
    // NEW FILE - CMT.Application.SelfEvaluation/Services/ICurrentUserAccessor.cs
    //
    // WHY THIS FILE IS REQUIRED
    // -------------------------
    // AdminSignaturesController.cs declares:
    //     private readonly ICurrentUserAccessor _currentUser;   // your existing accessor
    // but no such type exists anywhere in the solution, so after the CS0246 fixes the
    // build would report, in CMT.Web.Api.SelfEvaluation:
    //     error CS0246: The type or namespace name 'ICurrentUserAccessor' could not be found
    //
    // The controller already has 'using CMT.Application.SelfEvaluation.Services;', therefore declaring the
    // abstraction in THIS namespace resolves it with no edit to the controller.
    // The concrete implementation lives in CMT.Web.Api.SelfEvaluation/Infrastructure/HostAccessors.cs
    // because only the web layer knows about HttpContext.
    // =====================================================================================

    /// <summary>
    /// Resolves the authenticated caller as a tracked <see cref="User"/> entity.
    /// Returns null when the request is anonymous, or when the token points at a user
    /// that no longer exists / was soft-deleted.
    /// </summary>
    public interface ICurrentUserAccessor
    {
        Task<User?> GetAsync(CancellationToken cancellationToken = default);
    }
}