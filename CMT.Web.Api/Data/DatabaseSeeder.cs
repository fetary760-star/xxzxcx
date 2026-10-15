using CMT.Domain.Data;
using CMT.Domain.Models;
using CMT.Domain.Enums;
using Microsoft.EntityFrameworkCore;
using BCrypt.Net;

namespace CMT.Web.Api.Data
{
    public class DatabaseSeeder
    {
        private readonly ApplicationDbContext _context;

        public DatabaseSeeder(ApplicationDbContext context)
        {
            _context = context;
        }

        public async System.Threading.Tasks.Task SeedAsync()
        {
            try
            {
                await _context.Database.EnsureCreatedAsync();

                if (!await _context.Shops.AnyAsync())
                {
                    await SeedShopsAsync();
                }

                if (!await _context.TaskCategories.AnyAsync())
                {
                    await SeedTaskCategoriesAsync();
                }

                if (!await _context.TaskPriorityLevels.AnyAsync())
                {
                    await SeedPriorityLevelsAsync();
                }

                if (!await _context.RequestTypes.AnyAsync())
                {
                    await SeedRequestTypesAsync();
                }

                await _context.SaveChangesAsync();
                Console.WriteLine("Database seeded successfully with reference data only!");
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Error seeding database: {ex.Message}");
                throw;
            }
        }

        private async System.Threading.Tasks.Task SeedShopsAsync()
        {
            var shops = new[]
            {
                new Shop 
                { 
                    Name = "Avionics Shop", 
                    Description = "Avionics and Electronics"
                },
                new Shop 
                { 
                    Name = "Engine Shop", 
                    Description = "Engine Maintenance and Repair"
                },
                new Shop 
                { 
                    Name = "Structural Shop", 
                    Description = "Structural Components and Repairs"
                }
            };

            await _context.Shops.AddRangeAsync(shops);
            await _context.SaveChangesAsync();
        }

        private async System.Threading.Tasks.Task SeedTaskCategoriesAsync()
        {
            var categories = new[]
            {
                new TaskCategory 
                { 
                    Name = "Engine", 
                    Description = "Engine components and systems"
                },
                new TaskCategory 
                { 
                    Name = "Avionics", 
                    Description = "Avionics and electronic systems"
                },
                new TaskCategory 
                { 
                    Name = "Landing Gear", 
                    Description = "Landing gear components"
                },
                new TaskCategory 
                { 
                    Name = "Hydraulics", 
                    Description = "Hydraulic systems and components"
                }
            };

            await _context.TaskCategories.AddRangeAsync(categories);
            await _context.SaveChangesAsync();
        }

        private async System.Threading.Tasks.Task SeedPriorityLevelsAsync()
        {
            var priorities = new[]
            {
                new TaskPriorityLevel 
                { 
                    LevelName = "Low", 
                    Description = "Low priority tasks",
                    OrderRank = 1
                },
                new TaskPriorityLevel 
                { 
                    LevelName = "Medium", 
                    Description = "Medium priority tasks",
                    OrderRank = 2
                },
                new TaskPriorityLevel 
                { 
                    LevelName = "High", 
                    Description = "High priority tasks",
                    OrderRank = 3
                },
                new TaskPriorityLevel 
                { 
                    LevelName = "Urgent", 
                    Description = "Urgent priority tasks",
                    OrderRank = 4
                }
            };

            await _context.TaskPriorityLevels.AddRangeAsync(priorities);
            await _context.SaveChangesAsync();
        }

        private async System.Threading.Tasks.Task SeedRequestTypesAsync()
        {
            var requestTypes = new[]
            {
                new RequestType 
                { 
                    Name = "Maintenance", 
                    Description = "Regular maintenance tasks"
                },
                new RequestType 
                { 
                    Name = "Repair", 
                    Description = "Repair and fix tasks"
                },
                new RequestType 
                { 
                    Name = "Inspection", 
                    Description = "Inspection and testing tasks"
                },
                new RequestType 
                { 
                    Name = "Modification", 
                    Description = "Modification and upgrade tasks"
                }
            };

            await _context.RequestTypes.AddRangeAsync(requestTypes);
            await _context.SaveChangesAsync();
        }
    }
}