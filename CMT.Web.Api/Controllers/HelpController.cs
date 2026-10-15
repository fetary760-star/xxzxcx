using System;
using System.Collections.Generic;
using System.Security.Claims;
using System.Threading.Tasks;
using Microsoft.AspNetCore.Authorization;
using Microsoft.AspNetCore.Mvc;
using CMT.Application.Interfaces;
using System.Net;
using System.Net.Mail;

namespace CMT.Web.Api.Controllers
{
    [ApiController]
    [Route("api/[controller]")]
    [Authorize]
    public class HelpController : ControllerBase
    {
        private readonly IUserAuditService _auditService;

        // Required support email and app password as requested.
        private const string SupportEmail = "adeyanos@gmail.com";
        private const string SupportSmtpPassword = "paoojihypejjyutp"; // ensure no trailing spaces

        public HelpController(IUserAuditService auditService)
        {
            _auditService = auditService;
        }

        [HttpGet]
        public async Task<ActionResult<HelpContentDto>> GetHelp()
        {
            try
            {
                var currentUserId = GetCurrentUserId();
                var userRole = User.FindFirst("role")?.Value ?? "guest";

                var helpContent = new HelpContentDto
                {
                    UserRole = userRole,
                    ContactInfo = new ContactInfoDto
                    {
                        SupportEmail = SupportEmail,
                        SupportPhone = "+251-15-17-3387",
                        HelpDeskHours = "Mon-Fri 08:00 - 11:00",
                        EmergencyContact = "+251-912-674668"
                    },
                    SystemInfo = new SystemInfoDto
                    {
                        Version = "1.0.0",
                        LastUpdated = DateTime.UtcNow,
                        SupportedBrowsers = new[] { "Chrome", "Firefox", "Safari", "Edge" }
                    },
                    Sections = GetHelpSectionsByRole(userRole)
                };

                // Log help access if possible (best-effort)
                try
                {
                    var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                    await _auditService.LogUserActionAsync(
                        "HELP_ACCESS",
                        currentUserId,
                        currentUserId,
                        $"Role: {userRole}",
                        "User accessed help documentation",
                        ipAddress
                    );
                }
                catch
                {
                    // swallow audit exceptions
                }

                return Ok(helpContent);
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while retrieving help content", error = ex.Message });
            }
        }

        [HttpPost("feedback")]
        public async Task<ActionResult> SubmitFeedback([FromBody] FeedbackDto feedbackDto)
        {
            try
            {
                if (feedbackDto == null)
                    return BadRequest(new { message = "Invalid request body" });

                if (string.IsNullOrWhiteSpace(feedbackDto.Subject) || string.IsNullOrWhiteSpace(feedbackDto.Message))
                    return BadRequest(new { message = "Subject and Message are required" });

                var currentUserId = GetCurrentUserId();
                if (currentUserId == 0)
                    return Unauthorized(new { message = "User ID not found in token" });

                var userName = User.FindFirst("name")?.Value ?? User.FindFirst(ClaimTypes.Name)?.Value ?? "Unknown User";
                var userEmail = User.FindFirst("email")?.Value ?? User.FindFirst(ClaimTypes.Email)?.Value ?? "unknown@email.com";
                var ticketId = $"CMT-{DateTime.UtcNow:yyyyMMdd}-{currentUserId:D4}";

                // Audit the submission (best-effort)
                try
                {
                    var ipAddress = HttpContext.Connection.RemoteIpAddress?.ToString();
                    await _auditService.LogUserActionAsync(
                        "FEEDBACK_SUBMIT",
                        currentUserId,
                        currentUserId,
                        $"Type: {feedbackDto.Type}, Subject: {feedbackDto.Subject}, Priority: {feedbackDto.Priority}",
                        "User submitted feedback/support request",
                        ipAddress
                    );
                }
                catch
                {
                    // ignore audit errors
                }

                // Build email
                var mail = new MailMessage
                {
                    From = new MailAddress(SupportEmail, "CMT Support"),
                    Subject = $"[CMT-{ticketId}] {feedbackDto.Subject}",
                    Body = $"Ticket: {ticketId}\nType: {feedbackDto.Type}\nPriority: {feedbackDto.Priority}\n\nFrom: {userName} <{userEmail}>\n\nMessage:\n{feedbackDto.Message}",
                    IsBodyHtml = false
                };

                // Set Reply-To to user email if valid
                try
                {
                    mail.ReplyToList.Add(new MailAddress(userEmail, userName));
                }
                catch
                {
                    // ignore invalid reply-to
                }

                mail.To.Add(SupportEmail);

                var emailSent = false;
                try
                {
                    using var smtp = new SmtpClient("smtp.gmail.com", 587)
                    {
                        EnableSsl = true,
                        UseDefaultCredentials = false,
                        Credentials = new NetworkCredential(SupportEmail, SupportSmtpPassword)
                    };

                    await smtp.SendMailAsync(mail);
                    emailSent = true;
                }
                catch (Exception sendEx)
                {
                    Console.WriteLine($"Failed to send feedback email for ticket {ticketId}: {sendEx}");
                    emailSent = false;
                }

                return Ok(new
                {
                    message = "Feedback submitted successfully",
                    ticketId = ticketId,
                    emailSent = emailSent
                });
            }
            catch (Exception ex)
            {
                return StatusCode(500, new { message = "An error occurred while submitting feedback", error = ex.Message });
            }
        }

        private List<HelpSectionDto> GetHelpSectionsByRole(string userRole)
        {
            var sections = new List<HelpSectionDto>
            {
                // Getting Started - Available to all roles (full descriptions preserved)
                new HelpSectionDto
                {
                    Title = "Getting Started",
                    Icon = "play-circle",
                    Articles = new[]
                    {
                        new HelpArticleDto
                        {
                            Title = "System Login and Authentication",
                            Content = "To access the CMT Engineering Task Management system, navigate to the login page and enter your Ethiopian Airlines credentials. Your username is typically your employee ID or email address. If you've forgotten your password, click 'Forgot Password' to receive a reset link via email. For first-time users, contact your Team Leader or IT support to set up your account."
                        },
                        new HelpArticleDto
                        {
                            Title = "Dashboard Overview and Navigation",
                            Content = "Upon successful login, you'll see the main dashboard displaying key metrics including completion rate, average delay, tasks completed, and pending tasks. The navigation bar provides access to different modules: Tasks, Transfers, Employees, Performance, Reports, and Help including shows your profile information and quick actions. Use the search bar at the top to quickly find specific tasks or information. The notification bell icon displays real-time updates about task assignments, status changes, and system announcements."
                        },
                        new HelpArticleDto
                        {
                            Title = "Understanding User Roles and Permissions",
                            Content = "The CMT system has seven user roles with different access levels: (1) Director - Full system access, can approve amendments and view all reports. (2) Manager - Oversees shop team leader-specific operations and personnel.(3) Team Leader - Manages tasks, assigns engineers, and approves schedules. (4) Shop Team Leader - Oversees shop-specific operations and personnel. (5) Engineer - Executes assigned tasks and updates progress. (6) Customer Personnel - Submits service requests and tracks status. (7) Customer (Guest) - Views request status and history. Your role determines which features and data you can access. Contact your supervisor if you need additional permissions."
                        },
                        new HelpArticleDto
                        {
                            Title = "System Requirements and Browser Compatibility",
                            Content = "For optimal performance, use the latest version of Chrome (90+), Firefox (88+), Safari (14+), or Edge (90+). Ensure JavaScript is enabled and cookies are allowed. Recommended screen resolution is 1366x768 or higher. The system works on desktop, laptop, and tablet devices. Mobile phone access is limited to viewing tasks and notifications. Clear your browser cache if you experience loading issues. For best results, maintain a stable internet connection with minimum 2 Mbps speed."
                        }
                    }
                },

                // Task Management - Role-specific content (full descriptions)
                new HelpSectionDto
                {
                    Title = "Task Management",
                    Icon = "clipboard-list",
                    Articles = GetTaskManagementArticles(userRole)
                },

                // User Management - For Team Leaders and Directors (full descriptions)
                new HelpSectionDto
                {
                    Title = "User Management",
                    Icon = "users",
                    Articles = GetUserManagementArticles(userRole)
                },

                // Profile & Settings - Available to all roles (full descriptions)
                new HelpSectionDto
                {
                    Title = "Profile & Settings",
                    Icon = "user",
                    Articles = new[]
                    {
                        new HelpArticleDto
                        {
                            Title = "Managing Your Profile Information",
                            Content = "Click your profile icon in the top-right corner and select 'Profile' to view your personal information. You CANNOT modify your display name, contact email, phone number, or department from this page. To upload a profile picture, click the camera icon and select an image (max 2MB, JPG/PNG format). Changes to allowed fields are saved automatically. Your employee ID and role cannot be changed through the profile page - contact support for these modifications. Keep your contact information current by contacting your administrator to update records when necessary."
                        },
                        new HelpArticleDto
                        {
                            Title = "Notification Preferences and Settings",
                            Content = "Navigate to Settings > Notifications to customize your alert preferences. You can enable/disable email notifications for task assignments, status updates, deadline reminders, and system announcements. Set your preferred notification frequency (immediate, hourly digest, or daily summary). Configure desktop push notifications for real-time alerts when logged in. Choose which events trigger notifications and set quiet hours to avoid disruptions during off-work times. Mobile notifications can be configured through the mobile app settings."
                        },
                        new HelpArticleDto
                        {
                            Title = "Password Management and Security",
                            Content = "To change your password, go to Settings > Security and click 'Change Password'. Enter your current password, then create a new password meeting these requirements: minimum 8 characters, at least one uppercase letter, one lowercase letter, one number, and one special character. Passwords expire every 90 days for security. Never share your password with others. If you suspect unauthorized access, change your password immediately and contact IT support. Review your login history in Settings > Security to monitor account activity."
                        },
                        new HelpArticleDto
                        {
                            Title = "Language and Display Preferences",
                            Content = "The system supports English. Adjust the interface theme (Light/Dark mode) to reduce eye strain. Configure date and time format preferences to match your regional settings. Set your timezone to ensure accurate task deadlines and scheduling."
                        }
                    }
                },

                // Shop Management - For Shop Team Leaders (full descriptions)
                new HelpSectionDto
                {
                    Title = "Shop Management",
                    Icon = "building",
                    Articles = GetShopManagementArticles(userRole)
                },

                // Troubleshooting - Available to all roles (full descriptions)
                new HelpSectionDto
                {
                    Title = "Troubleshooting",
                    Icon = "alert-circle",
                    Articles = new[]
                    {
                        new HelpArticleDto
                        {
                            Title = "Login and Authentication Issues",
                            Content = "If you cannot log in, first verify your username and password are correct (passwords are case-sensitive). Clear your browser cache and cookies, then try again. If you see 'Account Locked' message, wait 30 minutes or contact IT support to unlock. For 'Invalid Credentials' errors, use the 'Forgot Password' link to reset.Check your network connection and try accessing other Ethiopian Airlines systems. For persistent issues, contact support with your employee ID and error message screenshot."
                        },
                        new HelpArticleDto
                        {
                            Title = "Page Loading and Performance Problems",
                            Content = "Slow page loading can be caused by several factors. First, check your internet connection speed (minimum 2 Mbps required). Clear your browser cache: Chrome (Ctrl+Shift+Delete), Firefox (Ctrl+Shift+Delete). Disable browser extensions that might interfere with the system. Try accessing the system during off-peak hours (before 8 AM or after 6 PM). If specific pages won't load, try a different browser. For persistent performance issues, report to IT with details about your browser version, operating system, and specific pages affected."
                        },
                        new HelpArticleDto
                        {
                            Title = "Data Not Displaying or Updating",
                            Content = "If tasks or data aren't displaying correctly, first refresh the page (F5 or Ctrl+R). Check if you have the required permissions to view the data - contact your Team Leader if needed. Verify your role allows access to the specific module. If data appears outdated, the system may be syncing - wait 2-3 minutes and refresh. For missing attachments or files, check if they were uploaded successfully and file size limits weren't exceeded. If filters are applied, reset them to view all data. Report persistent data issues to support with screenshots showing the problem."
                        },
                        new HelpArticleDto
                        {
                            Title = "File Upload and Attachment Errors",
                            Content = "File upload failures usually occur due to: (1) File size exceeding 10MB limit - compress or split large files. (2) Unsupported file format - use PDF, DOC, DOCX, XLS, XLSX, JPG, PNG only. (3) Network interruption during upload - ensure stable connection. (4) Browser storage full - clear cache and try again. (5) Special characters in filename - rename file using only letters, numbers, hyphens, and underscores. If upload succeeds but file doesn't appear, refresh the page. For recurring upload issues, try a different browser or contact IT support."
                        },
                        new HelpArticleDto
                        {
                            Title = "Notification and Email Issues",
                            Content = "Not receiving notifications? Check these: (1) Verify notification settings are enabled in Settings > Notifications. (2) Check your spam/junk folder for system emails. (3) Confirm your email address is correct in your profile. (4) Whitelist 'noreply@cmt.ethiopianairlines.com' in your email client. (5) Browser notifications require permission - click 'Allow' when prompted. (6) Check if 'Do Not Disturb' mode is enabled. For delayed notifications, the system sends batches every 15 minutes. If you're not receiving critical alerts, contact support immediately."
                        },
                        new HelpArticleDto
                        {
                            Title = "Browser Compatibility and Technical Requirements",
                            Content = "Ensure you're using a supported browser: Chrome 90+, Firefox 88+, Safari 14+, or Edge 90+. Update your browser to the latest version for best performance. Enable JavaScript and cookies in browser settings."
                        }
                    }
                }
            };

            return sections;
        }

        private HelpArticleDto[] GetTaskManagementArticles(string userRole)
        {
            var roleNormalized = userRole?.ToLower() ?? string.Empty;

            if (roleNormalized == "director" || roleNormalized == "team_leader")
            {
                return new[]
                {
                    new HelpArticleDto
                    {
                        Title = "Creating and Assigning Tasks",
                        Content = "To create a new task, click the 'Create Task' button on the Tasks page. Fill in required fields: Serial Number, Part Number, Description, Category, Priority Level, and Target Completion Date. Select the assigned engineer from the dropdown menu - the system shows available engineers based on current workload. Add attachments by clicking 'Upload Files' (max 10MB per file, PDF/DOC/XLS/JPG formats supported). Set task priority (High/Medium/Low) based on urgency and impact. For recurring tasks, use the 'Duplicate Task' feature. After creation, the assigned engineer receives an instant notification. You can bulk-assign multiple tasks using the 'Bulk Actions' feature."
                    },
                    new HelpArticleDto
                    {
                        Title = "Task Monitoring and Status Tracking",
                        Content = "The Tasks dashboard displays all active tasks with color-coded status indicators: Yellow (Pending), Blue (In Progress), Green (Completed), Red (Blocked), Gray (On Hold). Use filters to view tasks by status, priority, engineer, or date range. Click any task to view detailed information including progress notes, attachments, and history. The 'Revision Alert' icon (yellow triangle) indicates tasks requiring review. Set up custom alerts for overdue tasks in Settings. Export task lists to Excel for offline analysis. The Gantt chart view shows task timelines and dependencies. Use the search bar to quickly find specific tasks by serial number, part number, or description."
                    },
                    new HelpArticleDto
                    {
                        Title = "Task Amendment and Approval Process",
                        Content = "Engineers can request task amendments when they encounter issues or need changes. Amendment requests appear in your 'Pending Approvals' section with a notification badge. Click the request to view details including reason, proposed changes, and supporting documentation. You can approve, reject, or request more information. When approving, add comments explaining your decision. Rejected amendments require a detailed reason that's logged in the audit trail. The system tracks all amendment history for compliance. Set approval delegation rules in Settings for when you're unavailable. Urgent amendments can be flagged for immediate attention. All amendments require Team Leader or Director approval before implementation."
                    },
                    new HelpArticleDto
                    {
                        Title = "Task Reports and Performance Analytics",
                        Content = "Access comprehensive reports through the Reports menu. Available reports include: Task Completion Rate (by engineer, shop, or period), Average Delay Analysis, Workload Distribution, Priority Breakdown, and Category Performance. Customize report parameters using date range, filters, and grouping options. Export reports to PDF or Excel for presentations. Schedule automated reports to be emailed daily, weekly, or monthly. The Performance Dashboard shows real-time KPIs including completion percentage, on-time delivery rate, and resource utilization. Use trend analysis to identify bottlenecks and improvement opportunities. Compare current period performance against historical data."
                    },
                    new HelpArticleDto
                    {
                        Title = "Task Transfer Between Engineers",
                        Content = "To transfer a task, open the task details and click 'Transfer Task'. Select the new engineer from the available list - the system shows their current workload to help you decide. Add a transfer reason (required for audit purposes). The original engineer receives a notification about the transfer. Task history preserves all previous assignments and progress notes. For bulk transfers (e.g., when an engineer is on leave), use the 'Bulk Transfer' feature from the Transfers page. Set up automatic transfer rules for specific scenarios. Both engineers can view the complete task history after transfer. The system logs all transfers with timestamps and reasons."
                    }
                };
            }
            else if (roleNormalized == "engineer")
            {
                return new[]
                {
                    new HelpArticleDto
                    {
                        Title = "Viewing and Managing Assigned Tasks",
                        Content = "Your assigned tasks appear on the Tasks page, sorted by priority and deadline. Tasks are color-coded by status: Pending (yellow), In Progress (blue), Completed (green), Blocked (red), On Hold (gray). Click any task to view full details including serial number, part number, description, attachments, and deadline. Use the 'My Tasks' filter to see only your assignments. The dashboard shows your current workload and upcoming deadlines. Set personal reminders for important tasks. You can sort tasks by priority, deadline, or creation date. The search function helps you quickly find specific tasks. Overdue tasks are highlighted in red with an alert icon."
                    },
                    new HelpArticleDto
                    {
                        Title = "Updating Task Status and Progress",
                        Content = "To update a task, click it to open details, then click 'Update Status'. Change the status from Pending to In Progress when you start work. Add progress notes describing work completed, issues encountered, and next steps. Upload supporting documents like inspection reports, photos, or test results (max 10MB per file). If you encounter problems, change status to 'Blocked' and explain the issue in notes. When work is complete, change status to 'Completed' and add final notes. The system timestamps all updates and notifies your Team Leader. You can add multiple updates throughout the task lifecycle. All updates are preserved in the task history."
                    },
                    new HelpArticleDto
                    {
                        Title = "Requesting Task Amendments",
                        Content = "If you need to modify task parameters (deadline, priority, or scope), click 'Request Amendment' in the task details. Select amendment type: Deadline Extension, Priority Change, Scope Modification, or Resource Request. Provide a detailed reason explaining why the amendment is needed - this helps approvers make informed decisions. Attach supporting documentation if available (photos, reports, technical specifications). Your Team Leader receives an immediate notification. Track amendment status in the 'My Amendments' section. You'll be notified when the request is approved or rejected. If rejected, review the rejection reason and address concerns before resubmitting. Approved amendments automatically update the task."
                    },
                    new HelpArticleDto
                    {
                        Title = "Managing Task Attachments and Documentation",
                        Content = "Each task can have multiple attachments including inspection reports, photos, technical drawings, and test results. To upload files, open the task and click 'Add Attachment'. Supported formats: PDF, DOC, DOCX, XLS, XLSX, JPG, PNG (max 10MB per file). Add a description for each attachment to help others understand its purpose. You can download, preview, or delete attachments you uploaded. Organize attachments by type using the category dropdown. The system automatically generates thumbnails for images. Large files may take time to upload - don't close the browser until upload completes. All attachments are virus-scanned before storage."
                    },
                    new HelpArticleDto
                    {
                        Title = "Task Completion and Handover Process",
                        Content = "When finishing a task, ensure all work is documented with final notes and photos. Change status to 'Completed' and fill in the completion form: actual completion date, total hours worked, materials used, and any observations. Upload final inspection reports and sign-off documents. If the task requires Team Leader review, select 'Request Review' before marking complete. The system automatically calculates task duration and compares against target. Completed tasks move to the 'Completed Tasks' archive but remain searchable. Your Team Leader may request additional information or reopen the task if issues are found. Timely completion improves your performance metrics."
                    }
                };
            }
            else // customer_personnel, customer, shop_tl
            {
                return new[]
                {
                    new HelpArticleDto
                    {
                        Title = "Submitting Service Requests",
                        Content = "To create a service request, click 'Create Task' and fill in the request form. Provide detailed information: aircraft serial number, part number, description of the issue or service needed, and preferred completion date. Select the appropriate category and priority level based on urgency. Attach relevant documents such as maintenance logs, photos of issues, or technical specifications. The more details you provide, the faster the request can be processed. After submission, you'll receive a confirmation with a unique task ID. Track your request status. You'll receive notifications when the status changes."
                    },
                    new HelpArticleDto
                    {
                        Title = "Tracking Request Status and Progress",
                        Content = "View all your submitted requests on the Tasks page. Each request shows current status: Pending (awaiting assignment), In Progress (being worked on), Completed (finished), Blocked (issues encountered), or On Hold (temporarily paused). Click any request to see detailed information including assigned engineer, progress notes, and estimated completion date. The timeline view shows all status changes and updates. You'll receive email notifications for major status changes. If a request is blocked, the notes explain the issue and what's needed to proceed. Use the search and filter functions to find specific requests. Export your request history to Excel for record-keeping."
                    },
                    new HelpArticleDto
                    {
                        Title = "Viewing Request History and Reports",
                        Content = "Access your complete request history through the 'History' tab. Filter by date range, status, or category to find specific requests. Each historical request shows: submission date, completion date, assigned personnel, and final outcome. Download detailed reports showing your request patterns, average completion time, and service quality metrics. Use this data for maintenance support. You can export historical data to Excel or PDF format. Compare current requests against historical averages to set realistic expectations. Historical data helps identify recurring issues that may need preventive action."
                    },
                    new HelpArticleDto
                    {
                        Title = "Communicating with CMT Engineering Team",
                        Content = "Use the task comments section to communicate with the assigned engineer or Team Leader. Click 'Add Comment' to ask questions, provide additional information, or clarify requirements. Comments are visible to all team members working on the task. You'll receive notifications when someone replies to your comments. For urgent matters, mark your comment as 'Urgent' to ensure immediate attention. Attach files to comments if you need to share additional documentation. Keep communication professional and focused on the task. The system logs all communications for reference. If you need to escalate an issue, contact the Team Leader directly using the contact information in the task details."
                    }
                };
            }
        }

        private HelpArticleDto[] GetUserManagementArticles(string userRole)
        {
            var roleNormalized = userRole?.ToLower() ?? string.Empty;

            if (roleNormalized == "director" || roleNormalized == "team_leader")
            {
                return new[]
                {
                    new HelpArticleDto
                    {
                        Title = "Adding and Managing User Accounts",
                        Content = "To create a new user account, navigate to Management > Users and click 'Add User'. Enter required information: full name, employee ID, email address, phone number, and department. Select the appropriate user role (Engineer, Customer Personnel, Shop TL) based on their job function. Set initial password or enable automatic password generation with email delivery. Specify the user's shop location if applicable. New users receive a welcome email with login instructions. To edit existing users, click the user row and modify details. You can deactivate users instead of deleting to preserve historical data. Bulk user import is available via CSV upload for adding multiple users at once."
                    },
                    new HelpArticleDto
                    {
                        Title = "Role Assignment and Permission Management",
                        Content = "The system has seven predefined roles with specific permissions: (1) Director - Full system access including user management, reports, and system settings. (2) Team Leader - Task management, engineer assignment, and performance monitoring. (3) Manager - Oversees shop team leader-specific operations and personnel. (4) Shop Team Leader - Shop-specific operations and personnel management. (5) Engineer - Task execution and status updates. (6) Customer Personnel - Service request submission and tracking. (7) Customer - View-only access to their requests. To change a user's role, go to Management > Users, select the user, and choose the new role from the dropdown. Role changes take effect immediately and the user is notified. Custom permissions can be configured for special cases by contacting IT support."
                    },
                    new HelpArticleDto
                    {
                        Title = "Monitoring User Activity and Audit Logs",
                        Content = "Access comprehensive audit logs through Management > Audit Logs. View all user actions including logins, task updates, file uploads, and system changes. Filter logs by user, action type, date range, or IP address. Each log entry shows: timestamp, user, action performed, affected resource, and IP address. Export logs to Excel for compliance reporting or security analysis. Set up alerts for suspicious activities like multiple failed login attempts or unauthorized access attempts. The system retains audit logs for 7 years for regulatory compliance. Use audit logs to investigate issues, verify user actions, and ensure accountability. Search functionality helps quickly find specific events or user activities."
                    },
                    new HelpArticleDto
                    {
                        Title = "User Performance and Productivity Tracking",
                        Content = "Monitor individual and team performance through the Performance Dashboard. View metrics including: tasks completed, average completion time, on-time delivery rate, and quality scores. Compare engineer performance using side-by-side charts. Filter by date range, shop, or task category. The workload distribution chart shows current task assignments across all engineers. Identify overloaded or underutilized resources. Export performance reports for reviews and planning. Set performance benchmarks and track progress over time. The system calculates efficiency scores based on task complexity and completion time. Use this data for resource allocation, training needs identification, and performance evaluations."
                    }
                };
            }
            else
            {
                return new[]
                {
                    new HelpArticleDto
                    {
                        Title = "Understanding User Roles",
                        Content = "The CMT system uses role-based access control to ensure users can access only the features they need. Your current role determines which pages, actions, and data you can access. If you need additional permissions, contact your Team Leader or supervisor. Role changes must be approved by management and are logged for security purposes."
                    },
                    new HelpArticleDto
                    {
                        Title = "Viewing Team Members",
                        Content = "You can view your team members and their contact information through the Team Directory. This helps you know who to contact for specific tasks or questions. The directory shows each person's name, role, department, and contact details. Use the search function to quickly find specific team members."
                    }
                };
            }
        }

        private HelpArticleDto[] GetShopManagementArticles(string userRole)
        {
            var roleNormalized = userRole?.ToLower() ?? string.Empty;

            if (roleNormalized == "shop_tl")
            {
                return new[]
                {
                    new HelpArticleDto
                    {
                        Title = "Managing Shop Operations and Tasks",
                        Content = "As Shop Team Leader, you oversee all tasks assigned to your shop location. Access the Shop Dashboard to view current workload, pending tasks, and resource utilization. Filter tasks by your shop to see only relevant work. Monitor task progress and identify bottlenecks. Reassign tasks within your shop based on engineer availability and expertise. Set shop-specific priorities when multiple urgent tasks compete for resources. Coordinate with other shops for resource sharing when needed. Generate shop performance reports showing completion rates, delays, and quality metrics. Use the workload balancer to distribute tasks evenly among your team. Escalate issues to the Team Leader when additional support is needed."
                    },
                    new HelpArticleDto
                    {
                        Title = "Shop Personnel and Schedule Management",
                        Content = "Manage your shop's personnel through the Shop Personnel page. View all engineers and customer personnel assigned to your shop. Track attendance, leave requests, and availability. Create and manage work schedules ensuring adequate coverage for all shifts. The schedule planner shows resource availability and helps prevent conflicts. Approve or deny leave requests based on workload and coverage needs. Assign backup personnel for critical tasks. Monitor individual performance and provide feedback. Coordinate training schedules to improve team skills. The system alerts you to scheduling conflicts or understaffing situations. Export schedules to share with your team or management."
                    },
                    new HelpArticleDto
                    {
                        Title = "Shop Performance Monitoring and Reporting",
                        Content = "Track your shop's performance through dedicated dashboards and reports. Key metrics include: task completion rate, average turnaround time, quality scores, and resource utilization. Compare your shop's performance against other shops and organizational targets. Identify trends and patterns in task types, delays, and issues. Generate monthly performance reports for management review. Use data to justify resource requests or process improvements. The system highlights areas needing attention with color-coded alerts. Set performance goals and track progress over time. Drill down into specific metrics to understand root causes of issues. Share performance data with your team to drive improvement."
                    },
                    new HelpArticleDto
                    {
                        Title = "Coordinating with Other Shops and Departments",
                        Content = "Use the Transfers module to coordinate task transfers between shops. When your shop is overloaded, request assistance from other shops with available capacity. Review incoming transfer requests and accept based on your capacity. The system shows real-time workload across all shops to facilitate coordination. Communicate with other Shop Team Leaders through the messaging system. Coordinate shared resources like specialized equipment or expertise. Track inter-shop transfers to ensure smooth handovers. Document transfer reasons for future reference and analysis. The collaboration dashboard shows all active cross-shop activities. Escalate coordination issues to the Team Leader when needed."
                    }
                };
            }
            else
            {
                return new[]
                {
                    new HelpArticleDto
                    {
                        Title = "Shop Information and Locations",
                        Content = "View information about different shop locations through the Shops directory. Each shop entry shows location, contact information, operating hours, and specializations. This helps you understand which shop to contact for specific services or questions. The directory is updated regularly by management."
                    }
                };
            }
        }

        private int GetCurrentUserId()
        {
            var userIdClaim = User.FindFirst(ClaimTypes.NameIdentifier);
            return int.TryParse(userIdClaim?.Value, out var userId) ? userId : 0;
        }
    }

    // DTOs used by the controller
    public class HelpContentDto
    {
        public string UserRole { get; set; } = string.Empty;
        public List<HelpSectionDto> Sections { get; set; } = new();
        public ContactInfoDto ContactInfo { get; set; } = new();
        public SystemInfoDto SystemInfo { get; set; } = new();
    }

    public class HelpSectionDto
    {
        public string Title { get; set; } = string.Empty;
        public string Icon { get; set; } = string.Empty;
        public HelpArticleDto[] Articles { get; set; } = Array.Empty<HelpArticleDto>();
    }

    public class HelpArticleDto
    {
        public string Title { get; set; } = string.Empty;
        public string Content { get; set; } = string.Empty;
    }

    public class ContactInfoDto
    {
        public string SupportEmail { get; set; } = string.Empty;
        public string SupportPhone { get; set; } = string.Empty;
        public string HelpDeskHours { get; set; } = string.Empty;
        public string EmergencyContact { get; set; } = string.Empty;
    }

    public class SystemInfoDto
    {
        public string Version { get; set; } = string.Empty;
        public DateTime LastUpdated { get; set; }
        public string[] SupportedBrowsers { get; set; } = Array.Empty<string>();
    }

    public class FeedbackDto
    {
        public string Type { get; set; } = string.Empty; // "feature", "support", "general"
        public string Subject { get; set; } = string.Empty;
        public string Message { get; set; } = string.Empty;
        public string Priority { get; set; } = "normal"; // "low", "normal", "high", "urgent"
    }
}