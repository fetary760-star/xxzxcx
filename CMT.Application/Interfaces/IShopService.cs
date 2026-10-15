using CMT.Application.DTOs;

namespace CMT.Application.Interfaces
{
    public interface IShopService
    {
        System.Threading.Tasks.Task<List<ShopDto>> GetAllShopsAsync();
        System.Threading.Tasks.Task<List<ShopDto>> GetActiveShopsAsync();
        System.Threading.Tasks.Task<ShopDto?> GetShopByIdAsync(int shopId);
        
        // NEW: Manager-related methods
        System.Threading.Tasks.Task<List<ShopDto>> GetShopsByManagerAsync(int managerId);
        
        System.Threading.Tasks.Task<ShopDto> CreateShopAsync(CreateShopDto createShopDto, int createdByUserId);
        System.Threading.Tasks.Task<ShopDto> UpdateShopAsync(int shopId, UpdateShopDto updateShopDto, int updatedByUserId);
        System.Threading.Tasks.Task<bool> DeleteShopAsync(int shopId, int deletedByUserId);
        System.Threading.Tasks.Task<bool> AssignTeamLeaderAsync(int shopId, int teamLeaderId, int assignedByUserId);
        
        // NEW: Manager assignment method
        System.Threading.Tasks.Task<bool> AssignManagerAsync(int shopId, int managerId, int assignedByUserId);
        
        System.Threading.Tasks.Task<List<ShopDto>> GetShopsWithTeamLeadersAsync();
        
        // NEW: Get shops with managers
        System.Threading.Tasks.Task<List<ShopDto>> GetShopsWithManagersAsync();
    }
}