using CMT.Application.DTOs;

namespace CMT.Application.Interfaces
{
    public interface IDashboardService
    {
        Task<DashboardMetricsDto> GetDashboardMetricsAsync(int? userId = null, string? userRole = null, int? userShopId = null);
        Task<UserPerformanceMetricsDto> GetUserPerformanceMetricsAsync(int userId);
        Task<ShopPerformanceMetricsDto> GetShopPerformanceMetricsAsync(int shopId);
        Task<List<UserPerformanceMetricsDto>> GetAllUsersPerformanceAsync();
        Task<List<ShopPerformanceMetricsDto>> GetAllShopsPerformanceAsync();
    }
}