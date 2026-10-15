using SystemTask = System.Threading.Tasks.Task;

namespace CMT.Application.Services;

public interface INotificationHubService
{
    SystemTask SendNotificationToUserAsync(string userId, string message, string type = "notification", string priority = "medium", string? taskId = null, string? actionUrl = null);
    SystemTask SendNotificationToRoleAsync(string role, string message, string type = "notification", string priority = "medium");
    SystemTask SendBroadcastNotificationAsync(string message, string type = "notification", string priority = "medium");
    SystemTask SendTaskAssignedNotificationAsync(string userId, string taskId, string serialNumber);
    SystemTask SendTaskCompletedNotificationAsync(string userId, string taskId, string serialNumber);
    SystemTask SendTaskStatusChangedNotificationAsync(string userId, string taskId, string serialNumber, string status);
}