using System;
using System.Linq;
using System.Security.Claims;
using System.Threading;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Http;
using Microsoft.AspNetCore.Hosting;
using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Services;
using CMT.Domain.SelfEvaluation.Data;
using CMT.Domain.Models.SelfEvaluation;
using CMT.Domain.Models.Shared;
using User = CMT.Domain.Models.SelfEvaluation.User;
using RecordStatus = CMT.Domain.Models.Shared.RecordStatus;

namespace CMT.Web.Api.SelfEvaluation.Infrastructure
{
    // =====================================================================================
    // NEW FILE - CMT.Web.Api.SelfEvaluation/Infrastructure/HostAccessors.cs
    //
    // Implements the two abstractions CMT.Application.SelfEvaluation declares but cannot implement,
    // because CMT.Application.SelfEvaluation must not reference ASP.NET hosting:
    //
    //   1. IContentRootAccessor  - declared at the bottom of
    //      CMT.Application.SelfEvaluation/Services/UserSignatureService.cs. Without an implementation
    //      registered, DI throws at the first signature request:
    //        "Unable to resolve service for type 'CMT.Application.SelfEvaluation.Services.IContentRootAccessor'
    //         while attempting to activate 'CMT.Application.SelfEvaluation.Services.UserSignatureService'."
    //
    //   2. ICurrentUserAccessor  - required by AdminSignaturesController.
    //
    // Register both in Program.cs (see the Program.cs amendment).
    // =====================================================================================

    /// <summary>
    /// Exposes the host content root to CMT.Application.SelfEvaluation. Signature specimens are stored
    /// under ContentRootPath + SignatureStorageOptions.Root, i.e. OUTSIDE wwwroot, so the
    /// files can never be served statically.
    /// </summary>
    public sealed class ContentRootAccessor : IContentRootAccessor
    {
        public ContentRootAccessor(IWebHostEnvironment environment)
        {
            ContentRootPath = environment.ContentRootPath;
        }

        public string ContentRootPath { get; }
    }

    /// <summary>
    /// Resolves the caller from the JWT and loads the matching <see cref="User"/> row.
    ///
    /// Claim resolution is intentionally DEFENSIVE and tries, in order:
    ///   1. a numeric user id claim  (NameIdentifier / "sub" / "uid" / "userId" / "id")
    ///   2. the username claim       ("unique_name" - the NameClaimType configured in
    ///                                Program.cs - then ClaimTypes.Name / "username")
    ///   3. the email claim
    /// so it works with the token shape produced by TokenHandlerService without requiring
    /// any change to that service.
    /// </summary>
    public sealed class CurrentUserAccessor : ICurrentUserAccessor
    {
        private static readonly string[] IdClaimTypes =
        {
            ClaimTypes.NameIdentifier, "sub", "uid", "userId", "user_id", "id"
        };

        private static readonly string[] UsernameClaimTypes =
        {
            "unique_name", ClaimTypes.Name, "username", "preferred_username", "name"
        };

        private static readonly string[] EmailClaimTypes =
        {
            ClaimTypes.Email, "email"
        };

        private readonly IHttpContextAccessor _httpContextAccessor;
        private readonly ApplicationDbContext _context;

        public CurrentUserAccessor(
            IHttpContextAccessor httpContextAccessor,
            ApplicationDbContext context)
        {
            _httpContextAccessor = httpContextAccessor;
            _context = context;
        }

        public async Task<User?> GetAsync(CancellationToken cancellationToken = default)
        {
            var principal = _httpContextAccessor.HttpContext?.User;
            if (principal?.Identity?.IsAuthenticated != true) return null;

            // ---------- 1. numeric id ----------
            foreach (var claimType in IdClaimTypes)
            {
                var raw = principal.FindFirst(claimType)?.Value;
                if (long.TryParse(raw, out var userId) && userId > 0)
                {
                    var byId = await LoadAsync(u => u.Id == userId, cancellationToken);
                    if (byId is not null) return byId;
                }
            }

            // ---------- 2. username ----------
            foreach (var claimType in UsernameClaimTypes)
            {
                var username = principal.FindFirst(claimType)?.Value;
                if (string.IsNullOrWhiteSpace(username)) continue;

                var byName = await LoadAsync(u => u.Username == username, cancellationToken);
                if (byName is not null) return byName;
            }

            // ---------- 3. email ----------
            foreach (var claimType in EmailClaimTypes)
            {
                var email = principal.FindFirst(claimType)?.Value;
                if (string.IsNullOrWhiteSpace(email)) continue;

                var byEmail = await LoadAsync(u => u.Email == email, cancellationToken);
                if (byEmail is not null) return byEmail;
            }

            return null;
        }

        /// <summary>
        /// TRACKED load on purpose: UserSignatureService.StampAsync participates in the
        /// workflow engine transaction and the engine owns SaveChangesAsync.
        /// </summary>
        private Task<User?> LoadAsync(
            System.Linq.Expressions.Expression<Func<User, bool>> predicate,
            CancellationToken cancellationToken)
            => _context.Users
                .Where(u => u.RecordStatus != RecordStatus.Deleted)
                .FirstOrDefaultAsync(predicate, cancellationToken);
    }
}