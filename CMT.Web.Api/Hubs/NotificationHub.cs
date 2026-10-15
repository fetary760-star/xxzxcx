using Microsoft.AspNetCore.SignalR;
using Microsoft.AspNetCore.Authorization;
using System.Security.Claims;
using SystemTask = System.Threading.Tasks.Task;

namespace CMT.Web.Api.Hubs;

/// <summary>
/// FIX #5: The hub is marked [AllowAnonymous] for testing, but OnConnectedAsync
/// previously tried to extract userId from claims — which returns null for
/// anonymous users, meaning they'd never be added to any group and would
/// miss targeted notifications.
///
/// The fix: OnConnectedAsync no longer auto-joins groups based on claims.
/// Instead, the client explicitly calls JoinUserGroup(userId) after connection,
/// which the frontend already does via signalRService.joinUserGroup().
/// OnConnectedAsync now only logs the connection event.
///
/// When [AllowAnonymous] is removed and [Authorize] is restored, the
/// OnConnectedAsync can be updated to auto-join groups from claims again.
/// </summary>
[AllowAnonymous] // Temporarily allow anonymous access for testing
public class NotificationHub : Hub
{
    /// <summary>
    /// Explicitly join a user group. This is the PRIMARY mechanism for
    /// group assignment when [AllowAnonymous] is active, since claims
    /// are not available for unauthenticated connections.
    ///
    /// The frontend calls this after successful connection via
    /// signalRService.joinUserGroup().
    /// </summary>
    public async SystemTask JoinUserGroup(string userId)
    {
        if (string.IsNullOrWhiteSpace(userId))
        {
            Console.WriteLine($"[SIGNALR] JoinUserGroup called with empty userId on connection {Context.ConnectionId}");
            return;
        }

        await Groups.AddToGroupAsync(Context.ConnectionId, $"User_{userId}");
        Console.WriteLine($"[SIGNALR] User {userId} joined group User_{userId} with connection {Context.ConnectionId}");
    }

    /// <summary>
    /// Explicitly leave a user group.
    /// </summary>
    public async SystemTask LeaveUserGroup(string userId)
    {
        if (string.IsNullOrWhiteSpace(userId)) return;

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"User_{userId}");
        Console.WriteLine($"[SIGNALR] User {userId} left group User_{userId} with connection {Context.ConnectionId}");
    }

    /// <summary>
    /// Join a role-based group. Can be called by the client after connection
    /// to receive role-specific notifications.
    /// </summary>
    public async SystemTask JoinRoleGroup(string role)
    {
        if (string.IsNullOrWhiteSpace(role)) return;

        await Groups.AddToGroupAsync(Context.ConnectionId, $"Role_{role}");
        Console.WriteLine($"[SIGNALR] Connection {Context.ConnectionId} joined role group Role_{role}");
    }

    /// <summary>
    /// Leave a role-based group.
    /// </summary>
    public async SystemTask LeaveRoleGroup(string role)
    {
        if (string.IsNullOrWhiteSpace(role)) return;

        await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"Role_{role}");
        Console.WriteLine($"[SIGNALR] Connection {Context.ConnectionId} left role group Role_{role}");
    }

    public override async SystemTask OnConnectedAsync()
    {
        // FIX #5: Try to auto-join group from claims as a BEST-EFFORT fallback.
        // When [AllowAnonymous] is active, claims are typically null, so the
        // client must call JoinUserGroup() explicitly. When [Authorize] is
        // restored, this will auto-join the group from the JWT claims.
        var userId = GetUserIdFromContext();
        if (!string.IsNullOrEmpty(userId))
        {
            await Groups.AddToGroupAsync(Context.ConnectionId, $"User_{userId}");
            Console.WriteLine($"[SIGNALR] User {userId} auto-joined group User_{userId} from claims on connection {Context.ConnectionId}");
        }
        else
        {
            Console.WriteLine($"[SIGNALR] Anonymous/unknown user connected with connection {Context.ConnectionId}. Waiting for explicit JoinUserGroup() call.");
        }
        
        await base.OnConnectedAsync();
    }

    public override async SystemTask OnDisconnectedAsync(Exception? exception)
    {
        var userId = GetUserIdFromContext();
        if (!string.IsNullOrEmpty(userId))
        {
            await Groups.RemoveFromGroupAsync(Context.ConnectionId, $"User_{userId}");
            Console.WriteLine($"[SIGNALR] User {userId} disconnected from connection {Context.ConnectionId}");
        }
        else
        {
            Console.WriteLine($"[SIGNALR] Anonymous/unknown user disconnected from connection {Context.ConnectionId}");
        }
        
        if (exception != null)
        {
            Console.WriteLine($"[SIGNALR] Connection {Context.ConnectionId} disconnected due to error: {exception.Message}");
        }
        
        await base.OnDisconnectedAsync(exception);
    }

    private string? GetUserIdFromContext()
    {
        // Try multiple claim types for compatibility
        var userId = Context.User?.FindFirst("user_id")?.Value ??
                     Context.User?.FindFirst("userId")?.Value ??
                     Context.User?.FindFirst("id")?.Value ??
                     Context.User?.FindFirst(ClaimTypes.NameIdentifier)?.Value;
        
        return userId;
    }
}