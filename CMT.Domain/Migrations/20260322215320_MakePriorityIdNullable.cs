using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMT.Domain.Migrations
{
    /// <inheritdoc />
    public partial class MakePriorityIdNullable : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_completed_tasks_task_priority_levels_priority_id",
                table: "completed_tasks");

            migrationBuilder.DropForeignKey(
                name: "FK_tasks_task_priority_levels_priority_id",
                table: "tasks");

            migrationBuilder.AlterColumn<int>(
                name: "priority_id",
                table: "tasks",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AlterColumn<int>(
                name: "priority_id",
                table: "completed_tasks",
                type: "int",
                nullable: true,
                oldClrType: typeof(int),
                oldType: "int");

            migrationBuilder.AddForeignKey(
                name: "FK_completed_tasks_task_priority_levels_priority_id",
                table: "completed_tasks",
                column: "priority_id",
                principalTable: "task_priority_levels",
                principalColumn: "priority_id",
                onDelete: ReferentialAction.SetNull);

            migrationBuilder.AddForeignKey(
                name: "FK_tasks_task_priority_levels_priority_id",
                table: "tasks",
                column: "priority_id",
                principalTable: "task_priority_levels",
                principalColumn: "priority_id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_completed_tasks_task_priority_levels_priority_id",
                table: "completed_tasks");

            migrationBuilder.DropForeignKey(
                name: "FK_tasks_task_priority_levels_priority_id",
                table: "tasks");

            migrationBuilder.AlterColumn<int>(
                name: "priority_id",
                table: "tasks",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.AlterColumn<int>(
                name: "priority_id",
                table: "completed_tasks",
                type: "int",
                nullable: false,
                defaultValue: 0,
                oldClrType: typeof(int),
                oldType: "int",
                oldNullable: true);

            migrationBuilder.AddForeignKey(
                name: "FK_completed_tasks_task_priority_levels_priority_id",
                table: "completed_tasks",
                column: "priority_id",
                principalTable: "task_priority_levels",
                principalColumn: "priority_id");

            migrationBuilder.AddForeignKey(
                name: "FK_tasks_task_priority_levels_priority_id",
                table: "tasks",
                column: "priority_id",
                principalTable: "task_priority_levels",
                principalColumn: "priority_id");
        }
    }
}
