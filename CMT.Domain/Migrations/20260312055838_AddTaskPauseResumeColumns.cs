using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMT.Domain.Migrations
{
    /// <inheritdoc />
    public partial class AddTaskPauseResumeColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "is_paused",
                table: "tasks",
                type: "bit",
                nullable: false,
                defaultValue: false);

            migrationBuilder.AddColumn<DateTime>(
                name: "last_resumed_at",
                table: "tasks",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "paused_at",
                table: "tasks",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "paused_by",
                table: "tasks",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "paused_reason",
                table: "tasks",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<long>(
                name: "total_paused_duration_minutes",
                table: "tasks",
                type: "bigint",
                nullable: false,
                defaultValue: 0L);

            migrationBuilder.CreateIndex(
                name: "IX_tasks_paused_by",
                table: "tasks",
                column: "paused_by");

            migrationBuilder.AddForeignKey(
                name: "FK_tasks_users_paused_by",
                table: "tasks",
                column: "paused_by",
                principalTable: "users",
                principalColumn: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_tasks_users_paused_by",
                table: "tasks");

            migrationBuilder.DropIndex(
                name: "IX_tasks_paused_by",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "is_paused",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "last_resumed_at",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "paused_at",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "paused_by",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "paused_reason",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "total_paused_duration_minutes",
                table: "tasks");
        }
    }
}
