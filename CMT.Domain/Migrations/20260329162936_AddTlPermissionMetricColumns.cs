using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMT.Domain.Migrations
{
    /// <inheritdoc />
    public partial class AddTlPermissionMetricColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "can_view_avg_delay",
                table: "tl_permissions",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "can_view_completion_rate",
                table: "tl_permissions",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "can_view_pending_tasks",
                table: "tl_permissions",
                type: "bit",
                nullable: false,
                defaultValue: true);

            migrationBuilder.AddColumn<bool>(
                name: "can_view_tasks_completed",
                table: "tl_permissions",
                type: "bit",
                nullable: false,
                defaultValue: true);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "can_view_avg_delay",
                table: "tl_permissions");

            migrationBuilder.DropColumn(
                name: "can_view_completion_rate",
                table: "tl_permissions");

            migrationBuilder.DropColumn(
                name: "can_view_pending_tasks",
                table: "tl_permissions");

            migrationBuilder.DropColumn(
                name: "can_view_tasks_completed",
                table: "tl_permissions");
        }
    }
}
