using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMT.Domain.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkloadAdjustmentFields : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<decimal>(
                name: "adjusted_estimated_hours",
                table: "tasks",
                type: "decimal(10,2)",
                precision: 10,
                scale: 2,
                nullable: true);

            migrationBuilder.CreateTable(
                name: "workload_adjustment_requests",
                columns: table => new
                {
                    adjustment_request_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    task_id = table.Column<int>(type: "int", nullable: false),
                    requester_id = table.Column<int>(type: "int", nullable: false),
                    original_estimated_hours = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false),
                    requested_estimated_hours = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: false),
                    request_reason = table.Column<string>(type: "TEXT", nullable: false),
                    status = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    reviewed_by_tl_id = table.Column<int>(type: "int", nullable: true),
                    tl_review_date = table.Column<DateTime>(type: "datetime2", nullable: true),
                    tl_review_comments = table.Column<string>(type: "TEXT", nullable: true),
                    approved_estimated_hours = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
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
                    table.PrimaryKey("PK_workload_adjustment_requests", x => x.adjustment_request_id);
                    table.ForeignKey(
                        name: "FK_workload_adjustment_requests_tasks_task_id",
                        column: x => x.task_id,
                        principalTable: "tasks",
                        principalColumn: "task_id");
                    table.ForeignKey(
                        name: "FK_workload_adjustment_requests_users_requester_id",
                        column: x => x.requester_id,
                        principalTable: "users",
                        principalColumn: "user_id");
                    table.ForeignKey(
                        name: "FK_workload_adjustment_requests_users_reviewed_by_tl_id",
                        column: x => x.reviewed_by_tl_id,
                        principalTable: "users",
                        principalColumn: "user_id");
                });

            migrationBuilder.CreateIndex(
                name: "IX_workload_adjustment_requests_created_at",
                table: "workload_adjustment_requests",
                column: "created_at");

            migrationBuilder.CreateIndex(
                name: "IX_workload_adjustment_requests_requester_id",
                table: "workload_adjustment_requests",
                column: "requester_id");

            migrationBuilder.CreateIndex(
                name: "IX_workload_adjustment_requests_reviewed_by_tl_id",
                table: "workload_adjustment_requests",
                column: "reviewed_by_tl_id");

            migrationBuilder.CreateIndex(
                name: "IX_workload_adjustment_requests_status",
                table: "workload_adjustment_requests",
                column: "status");

            migrationBuilder.CreateIndex(
                name: "IX_workload_adjustment_requests_task_id",
                table: "workload_adjustment_requests",
                column: "task_id");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropTable(
                name: "workload_adjustment_requests");

            migrationBuilder.DropColumn(
                name: "adjusted_estimated_hours",
                table: "tasks");
        }
    }
}
