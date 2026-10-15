using CMT.Application.DTOs;

namespace CMT.Application.Interfaces
{
    public interface IPerformanceService
    {
        Task<List<EngineerPerformanceDto>> GetEngineerPerformanceAsync(
            string[]? engineerNames = null,
            int? categoryId = null,
            int? priorityId = null,
            int? shopId = null,
            string? status = null,
            DateTime? startDate = null,
            DateTime? endDate = null);
        
        Task<EngineerDetailedPerformanceDto> GetEngineerDetailedPerformanceAsync(
            string engineerName,
            int? categoryId = null,
            int? priorityId = null,
            int? shopId = null,
            string? status = null,
            DateTime? startDate = null,
            DateTime? endDate = null);
    }
}
