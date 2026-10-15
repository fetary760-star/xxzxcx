using CMT.Application.DTOs;

namespace CMT.Application.Interfaces
{
    public interface IWorkloadService
    {
        Task<IEnumerable<EngineerWorkloadDto>> GetEngineerWorkloadAsync();
        Task<WorkloadSummaryDto> GetWorkloadSummaryAsync();
        Task<EngineerWorkloadDto?> GetEngineerWorkloadByIdAsync(int userId);
        Task<IEnumerable<WorkloadTrendDto>> GetWorkloadTrendAsync(DateTime startDate, DateTime endDate);
        Task<ScheduleAnalysisDto> AnalyzeScheduleAsync(DateTime startDate, DateTime endDate);
        Task<ScheduleGenerationResultDto> GenerateScheduleAsync(ScheduleGenerationRequestDto request);

        /// <summary>
        /// NEW: Get workload data filtered to only the accessible (granted) engineers.
        /// Returns an enhanced summary with category distribution, status breakdown,
        /// and urgency-prioritized task lists for the descriptive graph.
        /// </summary>
        Task<AccessibleEngineerWorkloadSummaryDto> GetAccessibleEngineerWorkloadAsync(List<string> accessibleEngineerNames);
    }
}