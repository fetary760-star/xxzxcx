using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMT.Domain.Migrations
{
    /// <inheritdoc />
    public partial class AddTargetHoursAndMinutes : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<int>(
                name: "target_hours",
                table: "task_category_target_days",
                type: "int",
                nullable: false,
                defaultValue: 0);

            migrationBuilder.AddColumn<int>(
                name: "target_minutes",
                table: "task_category_target_days",
                type: "int",
                nullable: false,
                defaultValue: 0);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "target_hours",
                table: "task_category_target_days");

            migrationBuilder.DropColumn(
                name: "target_minutes",
                table: "task_category_target_days");
        }
    }
}
