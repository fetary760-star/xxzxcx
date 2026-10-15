using Microsoft.AspNetCore.SignalR;
using CMT.Web.Api.Hubs;
using CMT.Application.Services;
using SystemTask = System.Threading.Tasks.Task;

namespace CMT.Web.Api.Services;

public class SignalRNotificationHubService : INotificationHubService
{
    private readonly IHubContext<NotificationHub> _hubContext;

    public SignalRNotificationHubService(IHubContext<NotificationHub> hubContext)
    {
        _hubContext = hubContext;
    }

    public async SystemTask SendNotificationToUserAsync(string userId, string message, string type = "notification", string priority = "medium", string? taskId = null, string? actionUrl = null)
    {
        try
        {
            await _hubContext.Clients.Group($"User_{userId}")
                .SendAsync("ReceiveNotification", new { 
                    message, 
                    timestamp = DateTime.UtcNow,
                    type,
                    priority,
                    taskId = taskId ?? (string?)null,
                    actionUrl = actionUrl ?? (string?)null
                });
            
            Console.WriteLine($"[SIGNALR] Sent notification to User_{userId}: type={type}, priority={priority}, message={message}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SIGNALR ERROR] Failed to send notification to User_{userId}: {ex.Message}");
        }
    }

    public async SystemTask SendNotificationToRoleAsync(string role, string message, string type = "notification", string priority = "medium")
    {
        try
        {
            await _hubContext.Clients.Group($"Role_{role}")
                .SendAsync("ReceiveNotification", new { 
                    message, 
                    timestamp = DateTime.UtcNow,
                    type,
                    priority
                });
            
            Console.WriteLine($"[SIGNALR] Sent notification to Role_{role}: type={type}, priority={priority}, message={message}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SIGNALR ERROR] Failed to send notification to Role_{role}: {ex.Message}");
        }
    }

    public async SystemTask SendBroadcastNotificationAsync(string message, string type = "notification", string priority = "medium")
    {
        try
        {
            await _hubContext.Clients.All
                .SendAsync("ReceiveNotification", new { 
                    message, 
                    timestamp = DateTime.UtcNow,
                    type,
                    priority
                });
            
            Console.WriteLine($"[SIGNALR] Sent broadcast notification: type={type}, priority={priority}, message={message}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SIGNALR ERROR] Failed to send broadcast notification: {ex.Message}");
        }
    }

    public async SystemTask SendTaskAssignedNotificationAsync(string userId, string taskId, string serialNumber)
    {
        try
        {
            await _hubContext.Clients.Group($"User_{userId}")
                .SendAsync("TaskAssigned", new { 
                    taskId, 
                    serialNumber,
                    timestamp = DateTime.UtcNow,
                    priority = "high"
                });
            
            Console.WriteLine($"[SIGNALR] Sent task assigned notification to User_{userId}: Task {taskId}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SIGNALR ERROR] Failed to send task assigned notification: {ex.Message}");
        }
    }

    public async SystemTask SendTaskCompletedNotificationAsync(string userId, string taskId, string serialNumber)
    {
        try
        {
            await _hubContext.Clients.Group($"User_{userId}")
                .SendAsync("TaskCompleted", new { 
                    taskId, 
                    serialNumber,
                    timestamp = DateTime.UtcNow,
                    priority = "low"
                });
            
            Console.WriteLine($"[SIGNALR] Sent task completed notification to User_{userId}: Task {taskId}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SIGNALR ERROR] Failed to send task completed notification: {ex.Message}");
        }
    }

    public async SystemTask SendTaskStatusChangedNotificationAsync(string userId, string taskId, string serialNumber, string status)
    {
        try
        {
            await _hubContext.Clients.Group($"User_{userId}")
                .SendAsync("TaskStatusChanged", new { 
                    taskId, 
                    serialNumber,
                    status,
                    timestamp = DateTime.UtcNow,
                    priority = "medium"
                });
            
            Console.WriteLine($"[SIGNALR] Sent task status changed notification to User_{userId}: Task {taskId} -> {status}");
        }
        catch (Exception ex)
        {
            Console.WriteLine($"[SIGNALR ERROR] Failed to send task status changed notification: {ex.Message}");
        }
    }
}