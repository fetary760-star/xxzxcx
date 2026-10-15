using CMT.Application.DTOs;

namespace CMT.Application.Interfaces
{
    public interface IDepartmentService
    {
        Task<DepartmentDto?> GetDepartmentByIdAsync(int departmentId);
        Task<List<DepartmentDto>> GetAllDepartmentsAsync();
        Task<List<DepartmentDto>> GetDepartmentsByDirectorAsync(int directorId);
        Task<DirectorDashboardDto> GetDirectorDashboardAsync(int directorId);
        Task<DepartmentWithHierarchyDto> GetDepartmentHierarchyAsync(int departmentId);
        Task<DepartmentDto> CreateDepartmentAsync(CreateDepartmentDto createDepartmentDto, int createdByDirectorId);
        Task<DepartmentDto> UpdateDepartmentAsync(int departmentId, UpdateDepartmentDto updateDepartmentDto, int updatedByUserId);
        Task<bool> DeleteDepartmentAsync(int departmentId, int deletedByUserId);
        Task<bool> AssignManagerToDepartmentAsync(int departmentId, int managerId, int assignedByUserId);
    }
}