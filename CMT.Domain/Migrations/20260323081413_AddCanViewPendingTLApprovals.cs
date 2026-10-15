using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

namespace CMT.Domain.Migrations
{
    /// <inheritdoc />
    public partial class AddCanViewPendingTLApprovals : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.AddColumn<bool>(
                name: "can_view_pending_tl_approvals",
                table: "director_permissions",
                type: "bit",
                nullable: false,
                defaultValue: false);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropColumn(
                name: "can_view_pending_tl_approvals",
                table: "director_permissions");
        }
    }
}
