using CMT.Application.Interfaces;
using CMT.Domain.Models;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.Logging;
using System.Security.Claims;
using System.Text;
using System.Text.Json;
using TaskEntity = CMT.Domain.Models.Task;
using TaskStatusEnum = CMT.Domain.Enums.TaskStatus;
using OfficeOpenXml;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/reports")]
    [Authorize]
    public class ReportsController : ControllerBase
    {
        private readonly ITaskService _taskService;
        private readonly ICompletedTaskService _completedTaskService;
        private readonly IUserService _userService;
        private readonly ILogger<ReportsController> _logger;

        public ReportsController(
            ITaskService taskService,
            ICompletedTaskService completedTaskService,
            IUserService userService,
            ILogger<ReportsController> logger)
        {
            _taskService = taskService;
            _completedTaskService = completedTaskService;
            _userService = userService;
            _logger = logger;
        }

        private (int UserId, string UserName) GetCurrentUser()
        {
            var userIdClaim = User.FindFirstValue(ClaimTypes.NameIdentifier);
            var userName = User.FindFirstValue(ClaimTypes.Name);

            if (string.IsNullOrEmpty(userIdClaim) || !int.TryParse(userIdClaim, out var userId))
            {
                _logger.LogWarning("Could not find authenticated user for reports.");
                return (1, "System");
            }

            return (userId, userName ?? "Unknown");
        }

        /// <summary>
        /// Generate a new report - FIXED to support both camelCase and PascalCase, and proper file generation
        /// </summary>
        [HttpPost("generate")]
        public async Task<ActionResult> GenerateReport([FromBody] JsonElement requestJson)
        {
            try
            {
                var (userId, userName) = GetCurrentUser();
                _logger.LogInformation("Generating report for user {UserId} ({UserName}) with request: {Request}", 
                    userId, userName, requestJson.ToString());

                // Parse request with support for both camelCase (frontend) and PascalCase (backend)
                string? reportType = null;
                string? format = null;
                string? dateRange = null;
                string? startDate = null;
                string? endDate = null;

                if (requestJson.TryGetProperty("reportType", out var reportTypeElement))
                {
                    reportType = reportTypeElement.GetString();
                }
                else if (requestJson.TryGetProperty("ReportType", out var reportTypePascal))
                {
                    reportType = reportTypePascal.GetString();
                }

                if (requestJson.TryGetProperty("format", out var formatElement))
                {
                    format = formatElement.GetString();
                }
                else if (requestJson.TryGetProperty("Format", out var formatPascal))
                {
                    format = formatPascal.GetString();
                }

                if (requestJson.TryGetProperty("dateRange", out var dateRangeElement))
                {
                    dateRange = dateRangeElement.GetString();
                }
                else if (requestJson.TryGetProperty("DateRange", out var dateRangePascal))
                {
                    dateRange = dateRangePascal.GetString();
                }

                if (requestJson.TryGetProperty("startDate", out var startDateElement))
                {
                    startDate = startDateElement.GetString();
                }
                else if (requestJson.TryGetProperty("StartDate", out var startDatePascal))
                {
                    startDate = startDatePascal.GetString();
                }

                if (requestJson.TryGetProperty("endDate", out var endDateElement))
                {
                    endDate = endDateElement.GetString();
                }
                else if (requestJson.TryGetProperty("EndDate", out var endDatePascal))
                {
                    endDate = endDatePascal.GetString();
                }

                // Validate request
                if (string.IsNullOrEmpty(reportType))
                {
                    return BadRequest(new { message = "Report type is required" });
                }

                if (string.IsNullOrEmpty(format))
                {
                    return BadRequest(new { message = "Format is required" });
                }

                // Parse date range
                var (fromDate, toDate) = ParseDateRange(dateRange, startDate, endDate);

                _logger.LogInformation("Date range: {FromDate} to {ToDate}", fromDate, toDate);

                // Get tasks data based on report type
                var tasks = await GetTasksForReport(reportType, fromDate, toDate);

                // Generate file based on format
                byte[] fileBytes;
                string contentType;
                string fileExtension;

                switch (format.ToLower())
                {
                    case "pdf":
                        // For PDF, return HTML with proper headers for browser rendering
                        var htmlContent = GeneratePDFReport(tasks, reportType, fromDate, toDate);
                        contentType = "text/html";
                        fileExtension = "html";
                        fileBytes = htmlContent;
                        break;
                    case "excel":
                        fileBytes = GenerateExcelReport(tasks, reportType, fromDate, toDate);
                        contentType = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
                        fileExtension = "xlsx";
                        break;
                    case "csv":
                        fileBytes = GenerateCSVReport(tasks, reportType);
                        contentType = "text/csv";
                        fileExtension = "csv";
                        break;
                    default:
                        return BadRequest(new { message = $"Unsupported format: {format}" });
                }

                var fileName = $"{reportType}_{DateTime.Now:yyyyMMdd_HHmmss}.{fileExtension}";
                
                _logger.LogInformation("Report generated successfully: {FileName}, Size: {Size} bytes, ContentType: {ContentType}", 
                    fileName, fileBytes.Length, contentType);

                return File(fileBytes, contentType, fileName);
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Error generating report");
                return StatusCode(500, new { message = "An error occurred while generating the report", error = ex.Message });
            }
        }

        private (DateTime fromDate, DateTime toDate) ParseDateRange(string? dateRange, string? startDate, string? endDate)
        {
            var now = DateTime.Now;
            var today = now.Date;

            switch (dateRange?.ToLower())
            {
                case "today":
                    return (today, today.AddDays(1).AddSeconds(-1));
                case "yesterday":
                    return (today.AddDays(-1), today.AddSeconds(-1));
                case "last_7_days":
                    return (today.AddDays(-7), now);
                case "last_30_days":
                    return (today.AddDays(-30), now);
                case "this_month":
                    return (new DateTime(now.Year, now.Month, 1), now);
                case "last_month":
                    var lastMonth = now.AddMonths(-1);
                    var firstDayLastMonth = new DateTime(lastMonth.Year, lastMonth.Month, 1);
                    var lastDayLastMonth = firstDayLastMonth.AddMonths(1).AddSeconds(-1);
                    return (firstDayLastMonth, lastDayLastMonth);
                case "custom":
                    if (!string.IsNullOrEmpty(startDate) && !string.IsNullOrEmpty(endDate))
                    {
                        var from = DateTime.Parse(startDate);
                        var to = DateTime.Parse(endDate);
                        return (from, to.Date.AddDays(1).AddSeconds(-1));
                    }
                    goto default;
                default:
                    return (today.AddDays(-30), now);
            }
        }

        private async Task<List<TaskReportData>> GetTasksForReport(string reportType, DateTime fromDate, DateTime toDate)
        {
            var (tasks, _) = await _taskService.GetTasksWithFiltersAsync(
                pageNumber: 1,
                pageSize: 10000,
                fromDate: fromDate,
                toDate: toDate
            );

            var (completedTasks, _) = await _completedTaskService.GetCompletedTasksWithFiltersAsync(
                pageNumber: 1,
                pageSize: 10000,
                fromDate: fromDate,
                toDate: toDate
            );

            var allTasks = tasks.Select(t => new TaskReportData
            {
                TaskId = t.TaskId,
                SerialNumber = t.SerialNumber ?? "",
                PartNumber = t.PartNumber ?? "",
                Description = t.Description ?? "",
                Status = t.Status.ToString(),
                AssignedEngineer = t.AssignedEngineer ?? "Unassigned",
                Category = t.Category?.Name ?? "",
                Priority = t.Priority?.LevelName ?? "",
                CreatedDate = t.CreatedAt,
                CompletionDate = t.ActualCompletionDate,
                Shop = t.Shop?.Name ?? ""
            }).ToList();

            allTasks.AddRange(completedTasks.Select(ct => new TaskReportData
            {
                TaskId = ct.OriginalTaskId,
                SerialNumber = ct.SerialNumber ?? "",
                PartNumber = ct.PartNumber ?? "",
                Description = ct.Description ?? "",
                Status = ct.Status.ToString(),
                AssignedEngineer = ct.AssignedEngineer ?? "Unassigned",
                Category = ct.Category?.Name ?? "",
                Priority = ct.Priority?.LevelName ?? "",
                CreatedDate = ct.TaskCreatedAt,
                CompletionDate = ct.ActualCompletionDate,
                Shop = ct.Shop?.Name ?? ""
            }));

            // Filter based on report type
            switch (reportType.ToLower())
            {
                case "task_completion":
                    return allTasks.Where(t => t.Status == "Completed").ToList();
                case "performance":
                    return allTasks;
                case "user_activity":
                    return allTasks;
                case "shop_summary":
                    return allTasks;
                default:
                    return allTasks;
            }
        }

        private byte[] GenerateExcelReport(List<TaskReportData> tasks, string reportType, DateTime fromDate, DateTime toDate)
        {
            ExcelPackage.LicenseContext = LicenseContext.NonCommercial;
            
            using (var package = new ExcelPackage())
            {
                var worksheet = package.Workbook.Worksheets.Add(GetReportTitle(reportType));
                
                // Add report header
                worksheet.Cells[1, 1].Value = GetReportTitle(reportType);
                worksheet.Cells[1, 1, 1, 11].Merge = true;
                worksheet.Cells[1, 1].Style.Font.Size = 16;
                worksheet.Cells[1, 1].Style.Font.Bold = true;
                worksheet.Cells[1, 1].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                worksheet.Cells[2, 1].Value = $"Period: {fromDate:yyyy-MM-dd} to {toDate:yyyy-MM-dd}";
                worksheet.Cells[2, 1, 2, 11].Merge = true;
                worksheet.Cells[2, 1].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                // Add summary
                worksheet.Cells[3, 1].Value = $"Total Tasks: {tasks.Count}";
                worksheet.Cells[3, 1, 3, 11].Merge = true;
                worksheet.Cells[3, 1].Style.HorizontalAlignment = OfficeOpenXml.Style.ExcelHorizontalAlignment.Center;

                // Add headers
                int headerRow = 5;
                worksheet.Cells[headerRow, 1].Value = "Task ID";
                worksheet.Cells[headerRow, 2].Value = "Serial Number";
                worksheet.Cells[headerRow, 3].Value = "Part Number";
                worksheet.Cells[headerRow, 4].Value = "Description";
                worksheet.Cells[headerRow, 5].Value = "Status";
                worksheet.Cells[headerRow, 6].Value = "Assigned Engineer";
                worksheet.Cells[headerRow, 7].Value = "Category";
                worksheet.Cells[headerRow, 8].Value = "Priority";
                worksheet.Cells[headerRow, 9].Value = "Shop";
                worksheet.Cells[headerRow, 10].Value = "Created Date";
                worksheet.Cells[headerRow, 11].Value = "Completion Date";
                
                // Style the headers
                using (var range = worksheet.Cells[headerRow, 1, headerRow, 11])
                {
                    range.Style.Font.Bold = true;
                    range.Style.Fill.PatternType = OfficeOpenXml.Style.ExcelFillStyle.Solid;
                    range.Style.Fill.BackgroundColor.SetColor(System.Drawing.Color.LightBlue);
                    range.Style.Border.BorderAround(OfficeOpenXml.Style.ExcelBorderStyle.Thin);
                }
                
                // Add data
                int row = headerRow + 1;
                foreach (var task in tasks)
                {
                    worksheet.Cells[row, 1].Value = task.TaskId;
                    worksheet.Cells[row, 2].Value = task.SerialNumber;
                    worksheet.Cells[row, 3].Value = task.PartNumber;
                    worksheet.Cells[row, 4].Value = task.Description;
                    worksheet.Cells[row, 5].Value = task.Status;
                    worksheet.Cells[row, 6].Value = task.AssignedEngineer;
                    worksheet.Cells[row, 7].Value = task.Category;
                    worksheet.Cells[row, 8].Value = task.Priority;
                    worksheet.Cells[row, 9].Value = task.Shop;
                    worksheet.Cells[row, 10].Value = task.CreatedDate.ToString("yyyy-MM-dd HH:mm");
                    worksheet.Cells[row, 11].Value = task.CompletionDate?.ToString("yyyy-MM-dd HH:mm") ?? "";
                    row++;
                }
                
                // Auto-fit columns
                worksheet.Cells.AutoFitColumns();
                
                return package.GetAsByteArray();
            }
        }

        private byte[] GeneratePDFReport(List<TaskReportData> tasks, string reportType, DateTime fromDate, DateTime toDate)
        {
            // Generate print-friendly HTML that can be saved as PDF by the browser
            var html = new StringBuilder();
            html.AppendLine("<!DOCTYPE html>");
            html.AppendLine("<html><head>");
            html.AppendLine("<meta charset='UTF-8'>");
            html.AppendLine($"<title>{GetReportTitle(reportType)}</title>");
            html.AppendLine("<style>");
            html.AppendLine("@media print {");
            html.AppendLine("  body { margin: 0; }");
            html.AppendLine("  @page { margin: 1cm; }");
            html.AppendLine("}");
            html.AppendLine("body { font-family: Arial, sans-serif; margin: 20px; }");
            html.AppendLine("h1 { color: #333; text-align: center; margin-bottom: 10px; }");
            html.AppendLine(".info { text-align: center; margin-bottom: 20px; color: #666; font-size: 14px; }");
            html.AppendLine(".summary { text-align: center; margin-bottom: 20px; font-weight: bold; }");
            html.AppendLine("table { width: 100%; border-collapse: collapse; margin-top: 20px; font-size: 11px; }");
            html.AppendLine("th, td { border: 1px solid #ddd; padding: 6px; text-align: left; }");
            html.AppendLine("th { background-color: #4CAF50; color: white; font-weight: bold; }");
            html.AppendLine("tr:nth-child(even) { background-color: #f9f9f9; }");
            html.AppendLine(".footer { margin-top: 30px; text-align: center; color: #999; font-size: 10px; }");
            html.AppendLine(".print-button { display: block; margin: 20px auto; padding: 10px 30px; background: #4CAF50; color: white; border: none; cursor: pointer; font-size: 16px; border-radius: 4px; }");
            html.AppendLine(".print-button:hover { background: #45a049; }");
            html.AppendLine("@media print { .print-button { display: none; } }");
            html.AppendLine("</style>");
            html.AppendLine("<script>");
            html.AppendLine("function printReport() {");
            html.AppendLine("  window.print();");
            html.AppendLine("}");
            html.AppendLine("</script>");
            html.AppendLine("</head><body>");
            
            html.AppendLine("<button class='print-button' onclick='printReport()'>Print / Save as PDF</button>");
            
            html.AppendLine($"<h1>{GetReportTitle(reportType)}</h1>");
            html.AppendLine($"<div class='info'>Period: {fromDate:yyyy-MM-dd} to {toDate:yyyy-MM-dd}</div>");
            html.AppendLine($"<div class='summary'>Total Tasks: {tasks.Count}</div>");
            html.AppendLine("<table>");
            html.AppendLine("<thead>");
            html.AppendLine("<tr>");
            html.AppendLine("<th>Task ID</th>");
            html.AppendLine("<th>Serial Number</th>");
            html.AppendLine("<th>Part Number</th>");
            html.AppendLine("<th>Description</th>");
            html.AppendLine("<th>Status</th>");
            html.AppendLine("<th>Engineer</th>");
            html.AppendLine("<th>Category</th>");
            html.AppendLine("<th>Priority</th>");
            html.AppendLine("<th>Shop</th>");
            html.AppendLine("<th>Created</th>");
            html.AppendLine("<th>Completed</th>");
            html.AppendLine("</tr>");
            html.AppendLine("</thead>");
            html.AppendLine("<tbody>");

            foreach (var task in tasks)
            {
                html.AppendLine("<tr>");
                html.AppendLine($"<td>{task.TaskId}</td>");
                html.AppendLine($"<td>{System.Web.HttpUtility.HtmlEncode(task.SerialNumber)}</td>");
                html.AppendLine($"<td>{System.Web.HttpUtility.HtmlEncode(task.PartNumber)}</td>");
                html.AppendLine($"<td>{System.Web.HttpUtility.HtmlEncode(task.Description)}</td>");
                html.AppendLine($"<td>{task.Status}</td>");
                html.AppendLine($"<td>{System.Web.HttpUtility.HtmlEncode(task.AssignedEngineer)}</td>");
                html.AppendLine($"<td>{System.Web.HttpUtility.HtmlEncode(task.Category)}</td>");
                html.AppendLine($"<td>{System.Web.HttpUtility.HtmlEncode(task.Priority)}</td>");
                html.AppendLine($"<td>{System.Web.HttpUtility.HtmlEncode(task.Shop)}</td>");
                html.AppendLine($"<td>{task.CreatedDate:yyyy-MM-dd}</td>");
                html.AppendLine($"<td>{task.CompletionDate?.ToString("yyyy-MM-dd") ?? ""}</td>");
                html.AppendLine("</tr>");
            }

            html.AppendLine("</tbody>");
            html.AppendLine("</table>");
            html.AppendLine($"<div class='footer'>Generated on {DateTime.Now:yyyy-MM-dd HH:mm:ss}</div>");
            html.AppendLine("</body></html>");
            
            return Encoding.UTF8.GetBytes(html.ToString());
        }

        private byte[] GenerateCSVReport(List<TaskReportData> tasks, string reportType)
        {
            var csv = new StringBuilder();
            csv.AppendLine("Task ID,Serial Number,Part Number,Description,Status,Assigned Engineer,Category,Priority,Shop,Created Date,Completion Date");

            foreach (var task in tasks)
            {
                csv.AppendLine($"{task.TaskId}," +
                    $"\"{task.SerialNumber.Replace("\"", "\"\"")}\"," +
                    $"\"{task.PartNumber.Replace("\"", "\"\"")}\"," +
                    $"\"{task.Description.Replace("\"", "\"\"")}\"," +
                    $"{task.Status}," +
                    $"\"{task.AssignedEngineer.Replace("\"", "\"\"")}\"," +
                    $"\"{task.Category.Replace("\"", "\"\"")}\"," +
                    $"\"{task.Priority.Replace("\"", "\"\"")}\"," +
                    $"\"{task.Shop.Replace("\"", "\"\"")}\"," +
                    $"{task.CreatedDate:yyyy-MM-dd HH:mm}," +
                    $"{task.CompletionDate?.ToString("yyyy-MM-dd HH:mm") ?? ""}");
            }

            return Encoding.UTF8.GetBytes(csv.ToString());
        }

        private string GetReportTitle(string reportType)
        {
            return reportType.ToLower() switch
            {
                "task_completion" => "Task Completion Report",
                "performance" => "Performance Report",
                "user_activity" => "User Activity Report",
                "shop_summary" => "Shop Summary Report",
                _ => "Task Report"
            };
        }
    }

    public class GenerateReportRequest
    {
        public string? ReportType { get; set; }
        public string? Format { get; set; }
        public string? DateRange { get; set; }
        public string? StartDate { get; set; }
        public string? EndDate { get; set; }
    }

    public class TaskReportData
    {
        public int TaskId { get; set; }
        public string SerialNumber { get; set; } = "";
        public string PartNumber { get; set; } = "";
        public string Description { get; set; } = "";
        public string Status { get; set; } = "";
        public string AssignedEngineer { get; set; } = "";
        public string Category { get; set; } = "";
        public string Priority { get; set; } = "";
        public string Shop { get; set; } = "";
        public DateTime CreatedDate { get; set; }
        public DateTime? CompletionDate { get; set; }
    }
}