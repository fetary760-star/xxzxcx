using CMT.Application.Services;
using SystemTask = System.Threading.Tasks.Task;

namespace CMT.Application.Services;

/// <summary>
/// Default implementation of INotificationHubService that does nothing
/// This is used when no specific hub service is registered
/// </summary>
public class NotificationHubService : INotificationHubService
{
    public async SystemTask SendNotificationToUserAsync(string userId, string message, string type = "notification", string priority = "medium", string? taskId = null, string? actionUrl = null)
    {
        // Real implementation should be provided by SignalRNotificationHubService
        await SystemTask.CompletedTask;
    }

    public async SystemTask SendNotificationToRoleAsync(string role, string message, string type = "notification", string priority = "medium")
    {
        // Real implementation should be provided by SignalRNotificationHubService
        await SystemTask.CompletedTask;
    }

    public async SystemTask SendBroadcastNotificationAsync(string message, string type = "notification", string priority = "medium")
    {
        // Real implementation should be provided by SignalRNotificationHubService
        await SystemTask.CompletedTask;
    }

    public async SystemTask SendTaskAssignedNotificationAsync(string userId, string taskId, string serialNumber)
    {
        // Real implementation should be provided by SignalRNotificationHubService
        await SystemTask.CompletedTask;
    }

    public async SystemTask SendTaskCompletedNotificationAsync(string userId, string taskId, string serialNumber)
    {
        // Real implementation should be provided by SignalRNotificationHubService
        await SystemTask.CompletedTask;
    }

    public async SystemTask SendTaskStatusChangedNotificationAsync(string userId, string taskId, string serialNumber, string status)
    {
        // Real implementation should be provided by SignalRNotificationHubService
        await SystemTask.CompletedTask;
    }
}