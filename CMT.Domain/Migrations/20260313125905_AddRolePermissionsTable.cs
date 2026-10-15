using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMT.Domain.Migrations
{
    /// <inheritdoc />
    public partial class AddRolePermissionsTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "role_permissions",
                columns: table => new
                {
                    role_permission_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    role_key = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    permission_key = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    is_granted = table.Column<bool>(type: "bit", nullable: false),
                    updated_by_user_id = table.Column<int>(type: "int", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    updated_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()")
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_role_permissions", x => x.role_permission_id);
                });

            migrationBuilder.CreateIndex(
                name: "IX_role_permissions_role_key_permission_key",
                table: "role_permissions",
                columns: new[] { "role_key", "permission_key" },
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "role_permissions");
        }
    }
}
