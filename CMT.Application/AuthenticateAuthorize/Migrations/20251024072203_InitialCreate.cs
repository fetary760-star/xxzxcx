using System;
using Microsoft.EntityFrameworkCore.Migrations;

#nullable disable

#pragma warning disable CA1814 // Prefer jagged arrays over multidimensional

namespace CMT.Domain.Migrations
{
    /// <inheritdoc />
    public partial class InitialCreate : Migration
    {
        /// <inheritdoc />
        protected override void Up(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.CreateTable(
                name: "request_types",
                columns: table => new
                {
                    request_type_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    description = table.Column<string>(type: "TEXT", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    updated_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    start_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValue: new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)),
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
                    table.PrimaryKey("PK_request_types", x => x.request_type_id);
                });

            migrationBuilder.CreateTable(
                name: "task_categories",
                columns: table => new
                {
                    category_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    description = table.Column<string>(type: "TEXT", nullable: true),
                    start_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValue: new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)),
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
                    table.PrimaryKey("PK_task_categories", x => x.category_id);
                });

            migrationBuilder.CreateTable(
                name: "task_priority_levels",
                columns: table => new
                {
                    priority_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    level_name = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    description = table.Column<string>(type: "TEXT", nullable: true),
                    order_rank = table.Column<int>(type: "int", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    updated_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    start_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValue: new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)),
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
                    table.PrimaryKey("PK_task_priority_levels", x => x.priority_id);
                });

            migrationBuilder.CreateTable(
                name: "task_category_target_days",
                columns: table => new
                {
                    target_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    category_id = table.Column<int>(type: "int", nullable: false),
                    target_days = table.Column<int>(type: "int", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    updated_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    start_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValue: new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)),
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
                    table.PrimaryKey("PK_task_category_target_days", x => x.target_id);
                    table.ForeignKey(
                        name: "FK_task_category_target_days_task_categories_category_id",
                        column: x => x.category_id,
                        principalTable: "task_categories",
                        principalColumn: "category_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "task_sub_types",
                columns: table => new
                {
                    sub_type_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    category_id = table.Column<int>(type: "int", nullable: false),
                    name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    description = table.Column<string>(type: "TEXT", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    updated_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    start_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValue: new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)),
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
                    table.PrimaryKey("PK_task_sub_types", x => x.sub_type_id);
                    table.ForeignKey(
                        name: "FK_task_sub_types_task_categories_category_id",
                        column: x => x.category_id,
                        principalTable: "task_categories",
                        principalColumn: "category_id");
                });

            migrationBuilder.CreateTable(
                name: "notifications",
                columns: table => new
                {
                    notification_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    recipient_id = table.Column<int>(type: "int", nullable: false),
                    message = table.Column<string>(type: "TEXT", nullable: false),
                    is_read = table.Column<bool>(type: "bit", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    start_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValue: new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)),
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
                    table.PrimaryKey("PK_notifications", x => x.notification_id);
                });

            migrationBuilder.CreateTable(
                name: "performance_metrics",
                columns: table => new
                {
                    metric_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    user_id = table.Column<int>(type: "int", nullable: false),
                    tasks_completed = table.Column<int>(type: "int", nullable: false),
                    tasks_on_time = table.Column<int>(type: "int", nullable: false),
                    tasks_overdue = table.Column<int>(type: "int", nullable: false),
                    average_completion_time = table.Column<decimal>(type: "decimal(10,2)", precision: 10, scale: 2, nullable: true),
                    efficiency_rating = table.Column<decimal>(type: "decimal(5,2)", precision: 5, scale: 2, nullable: true),
                    last_calculated_at = table.Column<DateTime>(type: "datetime2", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    updated_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    start_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValue: new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)),
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
                    table.PrimaryKey("PK_performance_metrics", x => x.metric_id);
                });

            migrationBuilder.CreateTable(
                name: "shops",
                columns: table => new
                {
                    shop_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    description = table.Column<string>(type: "TEXT", nullable: true),
                    team_leader_id = table.Column<int>(type: "int", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    start_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValue: new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)),
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
                    table.PrimaryKey("PK_shops", x => x.shop_id);
                });

            migrationBuilder.CreateTable(
                name: "users",
                columns: table => new
                {
                    user_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    username = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    password = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    email = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    full_name = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: false),
                    role = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: false),
                    status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    profile_picture_path = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    supervisor_id = table.Column<int>(type: "int", nullable: true),
                    shop_id = table.Column<int>(type: "int", nullable: true),
                    password_reset_token = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    password_reset_expires_at = table.Column<DateTime>(type: "datetime2", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    updated_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    start_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValue: new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)),
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
                    table.PrimaryKey("PK_users", x => x.user_id);
                    table.ForeignKey(
                        name: "FK_users_shops_shop_id",
                        column: x => x.shop_id,
                        principalTable: "shops",
                        principalColumn: "shop_id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_users_users_supervisor_id",
                        column: x => x.supervisor_id,
                        principalTable: "users",
                        principalColumn: "user_id");
                });

            migrationBuilder.CreateTable(
                name: "tasks",
                columns: table => new
                {
                    task_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    serial_number = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    part_number = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    po_number = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    description = table.Column<string>(type: "TEXT", nullable: false),
                    category_id = table.Column<int>(type: "int", nullable: false),
                    sub_type_id = table.Column<int>(type: "int", nullable: true),
                    request_type_id = table.Column<int>(type: "int", nullable: true),
                    status = table.Column<string>(type: "nvarchar(20)", maxLength: 20, nullable: false),
                    comments = table.Column<string>(type: "TEXT", nullable: true),
                    assigned_engineer = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    priority_id = table.Column<int>(type: "int", nullable: false),
                    estimated_completion_date = table.Column<DateTime>(type: "datetime2", nullable: false),
                    target_completion_date = table.Column<DateTime>(type: "datetime2", nullable: true),
                    actual_completion_date = table.Column<DateTime>(type: "datetime2", nullable: true),
                    attachment_path = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: true),
                    amendment_request = table.Column<bool>(type: "bit", nullable: false),
                    amendment_status = table.Column<string>(type: "nvarchar(50)", maxLength: 50, nullable: true),
                    amendment_reviewed_by_tl_id = table.Column<int>(type: "int", nullable: true),
                    is_duplicate = table.Column<bool>(type: "bit", nullable: false),
                    duplicate_justification = table.Column<string>(type: "TEXT", nullable: true),
                    revision_notes = table.Column<string>(type: "TEXT", nullable: true),
                    show_revision_alert = table.Column<bool>(type: "bit", nullable: false),
                    shop_id = table.Column<int>(type: "int", nullable: true),
                    created_by = table.Column<int>(type: "int", nullable: false),
                    is_mandatory = table.Column<bool>(type: "bit", nullable: false),
                    cancelled_by = table.Column<int>(type: "int", nullable: true),
                    cancellation_reason = table.Column<string>(type: "TEXT", nullable: true),
                    cancelled_at = table.Column<DateTime>(type: "datetime2", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    updated_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    TaskPriorityLevelPriorityId = table.Column<int>(type: "int", nullable: true),
                    TaskSubTypeSubTypeId = table.Column<int>(type: "int", nullable: true),
                    start_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValue: new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)),
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
                    table.PrimaryKey("PK_tasks", x => x.task_id);
                    table.ForeignKey(
                        name: "FK_tasks_request_types_request_type_id",
                        column: x => x.request_type_id,
                        principalTable: "request_types",
                        principalColumn: "request_type_id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_tasks_shops_shop_id",
                        column: x => x.shop_id,
                        principalTable: "shops",
                        principalColumn: "shop_id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_tasks_task_categories_category_id",
                        column: x => x.category_id,
                        principalTable: "task_categories",
                        principalColumn: "category_id");
                    table.ForeignKey(
                        name: "FK_tasks_task_priority_levels_TaskPriorityLevelPriorityId",
                        column: x => x.TaskPriorityLevelPriorityId,
                        principalTable: "task_priority_levels",
                        principalColumn: "priority_id");
                    table.ForeignKey(
                        name: "FK_tasks_task_priority_levels_priority_id",
                        column: x => x.priority_id,
                        principalTable: "task_priority_levels",
                        principalColumn: "priority_id");
                    table.ForeignKey(
                        name: "FK_tasks_task_sub_types_TaskSubTypeSubTypeId",
                        column: x => x.TaskSubTypeSubTypeId,
                        principalTable: "task_sub_types",
                        principalColumn: "sub_type_id");
                    table.ForeignKey(
                        name: "FK_tasks_task_sub_types_sub_type_id",
                        column: x => x.sub_type_id,
                        principalTable: "task_sub_types",
                        principalColumn: "sub_type_id",
                        onDelete: ReferentialAction.SetNull);
                    table.ForeignKey(
                        name: "FK_tasks_users_amendment_reviewed_by_tl_id",
                        column: x => x.amendment_reviewed_by_tl_id,
                        principalTable: "users",
                        principalColumn: "user_id");
                    table.ForeignKey(
                        name: "FK_tasks_users_cancelled_by",
                        column: x => x.cancelled_by,
                        principalTable: "users",
                        principalColumn: "user_id");
                    table.ForeignKey(
                        name: "FK_tasks_users_created_by",
                        column: x => x.created_by,
                        principalTable: "users",
                        principalColumn: "user_id");
                });

            migrationBuilder.CreateTable(
                name: "task_attachments",
                columns: table => new
                {
                    attachment_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    task_id = table.Column<int>(type: "int", nullable: false),
                    file_name = table.Column<string>(type: "nvarchar(255)", maxLength: 255, nullable: false),
                    file_path = table.Column<string>(type: "nvarchar(500)", maxLength: 500, nullable: false),
                    file_type = table.Column<string>(type: "nvarchar(100)", maxLength: 100, nullable: true),
                    file_size = table.Column<long>(type: "bigint", nullable: true),
                    uploaded_by = table.Column<int>(type: "int", nullable: false),
                    uploaded_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    start_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValue: new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)),
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
                    table.PrimaryKey("PK_task_attachments", x => x.attachment_id);
                    table.ForeignKey(
                        name: "FK_task_attachments_tasks_task_id",
                        column: x => x.task_id,
                        principalTable: "tasks",
                        principalColumn: "task_id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_task_attachments_users_uploaded_by",
                        column: x => x.uploaded_by,
                        principalTable: "users",
                        principalColumn: "user_id",
                        onDelete: ReferentialAction.Cascade);
                });

            migrationBuilder.CreateTable(
                name: "task_comments",
                columns: table => new
                {
                    comment_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    task_id = table.Column<int>(type: "int", nullable: false),
                    author_id = table.Column<int>(type: "int", nullable: false),
                    content = table.Column<string>(type: "TEXT", nullable: false),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    updated_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    start_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValue: new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)),
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
                    table.PrimaryKey("PK_task_comments", x => x.comment_id);
                    table.ForeignKey(
                        name: "FK_task_comments_tasks_task_id",
                        column: x => x.task_id,
                        principalTable: "tasks",
                        principalColumn: "task_id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_task_comments_users_author_id",
                        column: x => x.author_id,
                        principalTable: "users",
                        principalColumn: "user_id");
                });

            migrationBuilder.CreateTable(
                name: "task_transfers",
                columns: table => new
                {
                    transfer_id = table.Column<int>(type: "int", nullable: false)
                        .Annotation("SqlServer:Identity", "1, 1"),
                    task_id = table.Column<int>(type: "int", nullable: false),
                    from_user_id = table.Column<int>(type: "int", nullable: false),
                    to_user_id = table.Column<int>(type: "int", nullable: false),
                    reason = table.Column<string>(type: "TEXT", nullable: true),
                    transfer_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    status = table.Column<int>(type: "int", nullable: false),
                    approved_by = table.Column<int>(type: "int", nullable: true),
                    approved_at = table.Column<DateTime>(type: "datetime2", nullable: true),
                    created_at = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValueSql: "GETUTCDATE()"),
                    start_date = table.Column<DateTime>(type: "datetime2", nullable: false, defaultValue: new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc)),
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
                    table.PrimaryKey("PK_task_transfers", x => x.transfer_id);
                    table.ForeignKey(
                        name: "FK_task_transfers_tasks_task_id",
                        column: x => x.task_id,
                        principalTable: "tasks",
                        principalColumn: "task_id",
                        onDelete: ReferentialAction.Cascade);
                    table.ForeignKey(
                        name: "FK_task_transfers_users_approved_by",
                        column: x => x.approved_by,
                        principalTable: "users",
                        principalColumn: "user_id");
                    table.ForeignKey(
                        name: "FK_task_transfers_users_from_user_id",
                        column: x => x.from_user_id,
                        principalTable: "users",
                        principalColumn: "user_id");
                    table.ForeignKey(
                        name: "FK_task_transfers_users_to_user_id",
                        column: x => x.to_user_id,
                        principalTable: "users",
                        principalColumn: "user_id");
                });

            migrationBuilder.InsertData(
                table: "shops",
                columns: new[] { "shop_id", "created_at", "description", "end_date", "is_readonly", "last_update_date", "name", "record_status", "registered_by", "registered_date", "start_date", "team_leader_id", "timezone_info", "updated_by" },
                values: new object[,]
                {
                    { 1, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Handles all machining tasks.", new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc), false, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Machine Shop", 2, "System", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "UTC", "System" },
                    { 2, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Handles all painting tasks.", new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc), false, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Paint Shop", 2, "System", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "UTC", "System" },
                    { 3, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Handles all welding tasks.", new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc), false, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Welding Shop", 2, "System", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, "UTC", "System" }
                });

            migrationBuilder.InsertData(
                table: "task_categories",
                columns: new[] { "category_id", "description", "end_date", "is_readonly", "last_update_date", "name", "record_status", "registered_by", "registered_date", "start_date", "timezone_info", "updated_by" },
                values: new object[,]
                {
                    { 1, "Aircraft on Ground (AOG) and Critical Spares Demand (CSD) component evaluations.", new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc), false, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "AOG & CSD Components Evaluation", 2, "System", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "UTC", "System" },
                    { 2, "Tasks related to creating, revising, or approving task cards.", new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc), false, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Task Card Related", 2, "System", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "UTC", "System" },
                    { 3, "Evaluation and approval process for parts marked for scrap.", new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc), false, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Scrap Evaluation & Approval", 2, "System", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "UTC", "System" }
                });

            migrationBuilder.InsertData(
                table: "task_priority_levels",
                columns: new[] { "priority_id", "created_at", "description", "end_date", "is_readonly", "last_update_date", "level_name", "order_rank", "record_status", "registered_by", "registered_date", "start_date", "timezone_info", "updated_at", "updated_by" },
                values: new object[,]
                {
                    { 1, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc), false, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Critical", 0, 2, "System", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "UTC", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System" },
                    { 2, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc), false, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "High", 1, 2, "System", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "UTC", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System" },
                    { 3, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc), false, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Medium", 2, 2, "System", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "UTC", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System" },
                    { 4, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), null, new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc), false, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Low", 3, 2, "System", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "UTC", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System" }
                });

            migrationBuilder.InsertData(
                table: "users",
                columns: new[] { "user_id", "created_at", "email", "end_date", "full_name", "is_readonly", "last_update_date", "password", "password_reset_expires_at", "password_reset_token", "profile_picture_path", "record_status", "registered_by", "registered_date", "role", "shop_id", "start_date", "status", "supervisor_id", "timezone_info", "updated_at", "updated_by", "username" },
                values: new object[,]
                {
                    { 2, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "director@cmt.com", new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc), "Director", false, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "$2a$11$Xp7L8vJZ8vJZ8vJZ8vJZ8O.KqF8vJZ8vJZ8vJZ8vJZ8vJZ8vJZ8vJu", null, null, null, 2, "System", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Director", null, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Active", null, "UTC", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System", "director" },
                    { 1, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "team_leader@cmt.com", new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc), "Team Leader", false, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "$2a$11$Xp7L8vJZ8vJZ8vJZ8vJZ8O.KqF8vJZ8vJZ8vJZ8vJZ8vJZ8vJZ8vJu", null, null, null, 2, "System", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "TeamLeader", 1, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Active", null, "UTC", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System", "team_leader" },
                    { 4, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "shop_tl@cmt.com", new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc), "Shop Team Leader", false, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "$2a$11$Xp7L8vJZ8vJZ8vJZ8vJZ8O.KqF8vJZ8vJZ8vJZ8vJZ8vJZ8vJZ8vJu", null, null, null, 2, "System", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "ShopTL", 2, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Active", null, "UTC", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System", "shop_tl" },
                    { 3, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "engineer@cmt.com", new DateTime(9999, 12, 31, 23, 59, 59, 0, DateTimeKind.Utc), "Engineer", false, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "$2a$11$Xp7L8vJZ8vJZ8vJZ8vJZ8O.KqF8vJZ8vJZ8vJZ8vJZ8vJZ8vJZ8vJu", null, null, null, 2, "System", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Engineer", 1, new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "Active", 1, "UTC", new DateTime(2024, 1, 1, 0, 0, 0, 0, DateTimeKind.Utc), "System", "engineer" }
                });

            migrationBuilder.CreateIndex(
                name: "IX_notifications_recipient_id",
                table: "notifications",
                column: "recipient_id");

            migrationBuilder.CreateIndex(
                name: "IX_performance_metrics_user_id",
                table: "performance_metrics",
                column: "user_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_request_types_name",
                table: "request_types",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_shops_name",
                table: "shops",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_shops_team_leader_id",
                table: "shops",
                column: "team_leader_id");

            migrationBuilder.CreateIndex(
                name: "IX_task_attachments_task_id",
                table: "task_attachments",
                column: "task_id");

            migrationBuilder.CreateIndex(
                name: "IX_task_attachments_uploaded_by",
                table: "task_attachments",
                column: "uploaded_by");

            migrationBuilder.CreateIndex(
                name: "IX_task_categories_name",
                table: "task_categories",
                column: "name",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_task_category_target_days_category_id",
                table: "task_category_target_days",
                column: "category_id",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_task_comments_author_id",
                table: "task_comments",
                column: "author_id");

            migrationBuilder.CreateIndex(
                name: "IX_task_comments_task_id",
                table: "task_comments",
                column: "task_id");

            migrationBuilder.CreateIndex(
                name: "IX_task_sub_types_category_id_name",
                table: "task_sub_types",
                columns: new[] { "category_id", "name" },
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_task_transfers_approved_by",
                table: "task_transfers",
                column: "approved_by");

            migrationBuilder.CreateIndex(
                name: "IX_task_transfers_from_user_id",
                table: "task_transfers",
                column: "from_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_task_transfers_task_id",
                table: "task_transfers",
                column: "task_id");

            migrationBuilder.CreateIndex(
                name: "IX_task_transfers_to_user_id",
                table: "task_transfers",
                column: "to_user_id");

            migrationBuilder.CreateIndex(
                name: "IX_tasks_amendment_reviewed_by_tl_id",
                table: "tasks",
                column: "amendment_reviewed_by_tl_id");

            migrationBuilder.CreateIndex(
                name: "IX_tasks_cancelled_by",
                table: "tasks",
                column: "cancelled_by");

            migrationBuilder.CreateIndex(
                name: "IX_tasks_category_id",
                table: "tasks",
                column: "category_id");

            migrationBuilder.CreateIndex(
                name: "IX_tasks_created_by",
                table: "tasks",
                column: "created_by");

            migrationBuilder.CreateIndex(
                name: "IX_tasks_priority_id",
                table: "tasks",
                column: "priority_id");

            migrationBuilder.CreateIndex(
                name: "IX_tasks_request_type_id",
                table: "tasks",
                column: "request_type_id");

            migrationBuilder.CreateIndex(
                name: "IX_tasks_shop_id",
                table: "tasks",
                column: "shop_id");

            migrationBuilder.CreateIndex(
                name: "IX_tasks_sub_type_id",
                table: "tasks",
                column: "sub_type_id");

            migrationBuilder.CreateIndex(
                name: "IX_tasks_TaskPriorityLevelPriorityId",
                table: "tasks",
                column: "TaskPriorityLevelPriorityId");

            migrationBuilder.CreateIndex(
                name: "IX_tasks_TaskSubTypeSubTypeId",
                table: "tasks",
                column: "TaskSubTypeSubTypeId");

            migrationBuilder.CreateIndex(
                name: "IX_users_email",
                table: "users",
                column: "email",
                unique: true);

            migrationBuilder.CreateIndex(
                name: "IX_users_shop_id",
                table: "users",
                column: "shop_id");

            migrationBuilder.CreateIndex(
                name: "IX_users_supervisor_id",
                table: "users",
                column: "supervisor_id");

            migrationBuilder.CreateIndex(
                name: "IX_users_username",
                table: "users",
                column: "username",
                unique: true);

            migrationBuilder.AddForeignKey(
                name: "FK_notifications_users_recipient_id",
                table: "notifications",
                column: "recipient_id",
                principalTable: "users",
                principalColumn: "user_id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_performance_metrics_users_user_id",
                table: "performance_metrics",
                column: "user_id",
                principalTable: "users",
                principalColumn: "user_id",
                onDelete: ReferentialAction.Cascade);

            migrationBuilder.AddForeignKey(
                name: "FK_shops_users_team_leader_id",
                table: "shops",
                column: "team_leader_id",
                principalTable: "users",
                principalColumn: "user_id",
                onDelete: ReferentialAction.SetNull);
        }

        /// <inheritdoc />
        protected override void Down(MigrationBuilder migrationBuilder)
        {
            migrationBuilder.DropForeignKey(
                name: "FK_shops_users_team_leader_id",
                table: "shops");

            migrationBuilder.DropTable(
                name: "notifications");

            migrationBuilder.DropTable(
                name: "performance_metrics");

            migrationBuilder.DropTable(
                name: "task_attachments");

            migrationBuilder.DropTable(
                name: "task_category_target_days");

            migrationBuilder.DropTable(
                name: "task_comments");

            migrationBuilder.DropTable(
                name: "task_transfers");

            migrationBuilder.DropTable(
                name: "tasks");

            migrationBuilder.DropTable(
                name: "request_types");

            migrationBuilder.DropTable(
                name: "task_priority_levels");

            migrationBuilder.DropTable(
                name: "task_sub_types");

            migrationBuilder.DropTable(
                name: "task_categories");

            migrationBuilder.DropTable(
                name: "users");

            migrationBuilder.DropTable(
                name: "shops");
        }
    }
}
