using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMT.Domain.Migrations
{
    /// <inheritdoc />
    public partial class AddWorkloadAdjustmentRequestUnitAndTargetDates : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<DateTime>(
                name: "new_target_completion_date",
                table: "workload_adjustment_requests",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<DateTime>(
                name: "previous_target_completion_date",
                table: "workload_adjustment_requests",
                type: "datetime2",
                nullable: true);

            migrationBuilder.AddColumn<string>(
                name: "request_unit",
                table: "workload_adjustment_requests",
                type: "nvarchar(10)",
                maxLength: 10,
                nullable: true,
                defaultValue: "hours");
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "new_target_completion_date",
                table: "workload_adjustment_requests");

            migrationBuilder.DropColumn(
                name: "previous_target_completion_date",
                table: "workload_adjustment_requests");

            migrationBuilder.DropColumn(
                name: "request_unit",
                table: "workload_adjustment_requests");
        }
    }
}
