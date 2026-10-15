using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMT.Domain.Migrations
{
    /// <inheritdoc />
    public partial class AddRejectedByColumns : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "rejected_at",
                table: "tasks",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "rejected_by",
                table: "tasks",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "rejection_reason",
                table: "tasks",
                type: "TEXT",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "rejected_at",
                table: "completed_tasks",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<int>(
                name: "rejected_by",
                table: "completed_tasks",
                type: "int",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "rejection_reason",
                table: "completed_tasks",
                type: "TEXT",
                nullable: true);

            migrationBuilder.CreateIndex(
                name: "IX_tasks_rejected_by",
                table: "tasks",
                column: "rejected_by");

            migrationBuilder.CreateIndex(
                name: "IX_completed_tasks_rejected_by",
                table: "completed_tasks",
                column: "rejected_by");

            migrationBuilder.AddForeignKey(
                name: "FK_completed_tasks_users_rejected_by",
                table: "completed_tasks",
                column: "rejected_by",
                principalTable: "users",
                principalColumn: "user_id");

            migrationBuilder.AddForeignKey(
                name: "FK_tasks_users_rejected_by",
                table: "tasks",
                column: "rejected_by",
                principalTable: "users",
                principalColumn: "user_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_completed_tasks_users_rejected_by",
                table: "completed_tasks");

            migrationBuilder.DropForeignKey(
                name: "FK_tasks_users_rejected_by",
                table: "tasks");

            migrationBuilder.DropIndex(
                name: "IX_tasks_rejected_by",
                table: "tasks");

            migrationBuilder.DropIndex(
                name: "IX_completed_tasks_rejected_by",
                table: "completed_tasks");

            migrationBuilder.DropColumn(
                name: "rejected_at",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "rejected_by",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "rejection_reason",
                table: "tasks");

            migrationBuilder.DropColumn(
                name: "rejected_at",
                table: "completed_tasks");

            migrationBuilder.DropColumn(
                name: "rejected_by",
                table: "completed_tasks");

            migrationBuilder.DropColumn(
                name: "rejection_reason",
                table: "completed_tasks");
        }
    }
}
