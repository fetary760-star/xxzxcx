using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMT.Domain.Migrations
{
    /// <inheritdoc />
    public partial class AddStatusChangedAtToTasks : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "status_changed_at",
                table: "tasks",
                type: "datetime2",
                nullable: true);

        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "status_changed_at",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "engineer_completed_at",
                table: "completed_tasks");
        }
    }
}
