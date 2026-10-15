using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMT.Domain.Migrations
{
    /// <inheritdoc />
    public partial class AddTlPermissionsTable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "tl_permissions",
                columns: table => new
                {
                    tl_permission_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    user_id = table.Column<int>(type: "int", nullable: false),
                    can_view_performance_metrics = table.Column<bool>(type: "bit", nullable: false),
                    can_view_engineer_workload = table.Column<bool>(type: "bit", nullable: false),
                    can_view_analytics = table.Column<bool>(type: "bit", nullable: false),
                    can_manage_data = table.Column<bool>(type: "bit", nullable: false),
                    can_manage_categories = table.Column<bool>(type: "bit", nullable: false),
                    can_manage_priorities = table.Column<bool>(type: "bit", nullable: false),
                    can_manage_task_types = table.Column<bool>(type: "bit", nullable: false),
                    can_create_team_leaders = table.Column<bool>(type: "bit", nullable: false),
                    can_create_managers = table.Column<bool>(type: "bit", nullable: false),
                    can_manage_users = table.Column<bool>(type: "bit", nullable: false),
                    can_view_reports = table.Column<bool>(type: "bit", nullable: false),
                    can_export_data = table.Column<bool>(type: "bit", nullable: false),
                    can_manage_schedules = table.Column<bool>(type: "bit", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    updated_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    start_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    end_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValue: new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc)),
                    timezone_info = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    registered_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    registered_by = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    last_update_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    updated_by = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    record_status = table.Column<int>(type: "int", nullable: false),
                    is_readonly = table.Column<bool>(type: "bit", nullable: false)
                },
                constraints: table =>
                {
                    table.PrimaryKey("PK_tl_permissions", x => x.tl_permission_id);
                    table.ForeignKey(
                        name: "FK_tl_permissions_users_user_id",
                        column: x => x.user_id,
                        principalTable: "users",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateIndex(
                name: "IX_tl_permissions_user_id",
                table: "tl_permissions",
                column: "user_id",
                unique: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "tl_permissions");
        }
    }
}
