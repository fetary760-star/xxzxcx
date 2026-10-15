using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Design;
using Microsoft.Extensions.Configuration; // Required for configuration access
using System.IO;

namespace CMT.Domain.Data
{
    // The design-time factory is used by 'dotnet ef' tools to create a DbContext
    // when running commands like 'migrations add' or 'database update'.
    public class ApplicationDbContextFactory : IDesignTimeDbContextFactory<ApplicationDbContext>
    {
        public ApplicationDbContext CreateDbContext(string[] args)
        {
            var optionsBuilder = new DbContextOptionsBuilder<ApplicationDbContext>();

            // ---------------------------------------------------------------------------------
            // NOTE: The connection string must be hardcoded here for the 'dotnet ef' tools to work
            // during design-time/build-time operations outside of the main Web API process.
            // This string is pulled directly from your appsettings.json file.
            // ---------------------------------------------------------------------------------
            string connectionString = "Server=db30178.databaseasp.net; Database=db30178; User Id=db30178; Password=Nh2_-Xa8s5C%; Encrypt=False; MultipleActiveResultSets=True;";
            
            // Use UseSqlServer now that the package has been added
            optionsBuilder.UseSqlServer(connectionString);

            return new ApplicationDbContext(optionsBuilder.Options);
        }
    }
}
