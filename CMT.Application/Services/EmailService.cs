using CMT.Application.Interfaces;
using Microsoft.Extensions.Configuration;
using System;
using System.Net;
using System.Net.Mail;
using System.Threading.Tasks;

namespace CMT.Application.Services
{
    public class EmailService : IEmailService
    {
        private readonly IConfiguration _configuration;
        private readonly string _smtpHost;
        private readonly int _smtpPort;
        private readonly string _smtpUsername;
        private readonly string _smtpPassword;
        private readonly string _fromEmail;
        private readonly string _fromName;
        private readonly bool _enableSsl;

        public EmailService(IConfiguration configuration)
        {
            _configuration = configuration;
            
            // Read SMTP settings from configuration
            _smtpHost = _configuration["EmailSettings:SmtpHost"] ?? "smtp.gmail.com";
            _smtpPort = int.Parse(_configuration["EmailSettings:SmtpPort"] ?? "587");
            _smtpUsername = _configuration["EmailSettings:SmtpUsername"] ?? "";
            _smtpPassword = _configuration["EmailSettings:SmtpPassword"] ?? "";
            _fromEmail = _configuration["EmailSettings:FromEmail"] ?? _smtpUsername;
            _fromName = _configuration["EmailSettings:FromName"] ?? "CMT Task Management System";
            _enableSsl = bool.Parse(_configuration["EmailSettings:EnableSsl"] ?? "true");
        }

        public async Task<bool> SendEmailAsync(string toEmail, string subject, string body, bool isHtml = true)
        {
            try
            {
                // Validate SMTP configuration
                if (string.IsNullOrEmpty(_smtpUsername) || string.IsNullOrEmpty(_smtpPassword))
                {
                    Console.WriteLine("Email service not configured. Please set SMTP credentials in appsettings.json");
                    return false;
                }

                using var message = new MailMessage();
                message.From = new MailAddress(_fromEmail, _fromName);
                message.To.Add(new MailAddress(toEmail));
                message.Subject = subject;
                message.Body = body;
                message.IsBodyHtml = isHtml;

                using var smtpClient = new SmtpClient(_smtpHost, _smtpPort);
                smtpClient.Credentials = new NetworkCredential(_smtpUsername, _smtpPassword);
                smtpClient.EnableSsl = _enableSsl;
                smtpClient.DeliveryMethod = SmtpDeliveryMethod.Network;

                await smtpClient.SendMailAsync(message);
                return true;
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to send email: {ex.Message}");
                return false;
            }
        }

        public async Task<bool> SendFeedbackEmailAsync(string userEmail, string userName, string feedbackType, string subject, string message, string priority, string ticketId)
        {
            try
            {
                var supportEmail = _configuration["EmailSettings:SupportEmail"] ?? "SintayehuH@ethiopianairlines.com";
                
                var emailBody = $@"
                    <html>
                    <head>
                        <style>
                            body {{ font-family: Arial, sans-serif; line-height: 1.6; color: #333; }}
                            .container {{ max-width: 600px; margin: 0 auto; padding: 20px; }}
                            .header {{ background-color: #1e40af; color: white; padding: 20px; border-radius: 5px 5px 0 0; }}
                            .content {{ background-color: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }}
                            .field {{ margin-bottom: 15px; }}
                            .label {{ font-weight: bold; color: #1f2937; }}
                            .value {{ margin-top: 5px; padding: 10px; background-color: white; border-left: 3px solid #1e40af; }}
                            .footer {{ margin-top: 20px; padding: 15px; background-color: #f3f4f6; border-radius: 0 0 5px 5px; font-size: 12px; color: #6b7280; }}
                            .priority-high {{ border-left-color: #dc2626; }}
                            .priority-urgent {{ border-left-color: #991b1b; }}
                        </style>
                    </head>
                    <body>
                        <div class='container'>
                            <div class='header'>
                                <h2 style='margin: 0;'>CMT Task Management - New Feedback</h2>
                            </div>
                            <div class='content'>
                                <div class='field'>
                                    <div class='label'>Ticket ID:</div>
                                    <div class='value'>{ticketId}</div>
                                </div>
                                <div class='field'>
                                    <div class='label'>Type:</div>
                                    <div class='value'>{feedbackType}</div>
                                </div>
                                <div class='field'>
                                    <div class='label'>Priority:</div>
                                    <div class='value {(priority == "high" || priority == "urgent" ? "priority-high" : "")}'>{priority.ToUpper()}</div>
                                </div>
                                <div class='field'>
                                    <div class='label'>Subject:</div>
                                    <div class='value'>{subject}</div>
                                </div>
                                <div class='field'>
                                    <div class='label'>Message:</div>
                                    <div class='value'>{message.Replace("\n", "<br>")}</div>
                                </div>
                                <div class='field'>
                                    <div class='label'>Submitted By:</div>
                                    <div class='value'>{userName} ({userEmail})</div>
                                </div>
                                <div class='field'>
                                    <div class='label'>Submitted At:</div>
                                    <div class='value'>{DateTime.UtcNow:yyyy-MM-ddTHH:mm:ssZ}</div>
                                </div>
                            </div>
                            <div class='footer'>
                                <p>This is an automated message from the CMT Task Management System.</p>
                                <p>Please respond to the user at: {userEmail}</p>
                            </div>
                        </div>
                    </body>
                    </html>
                ";

                var emailSubject = $"[{ticketId}] {feedbackType.ToUpper()} - {subject}";
                
                return await SendEmailAsync(supportEmail, emailSubject, emailBody, true);
            }
            catch (Exception ex)
            {
                Console.WriteLine($"Failed to send feedback email: {ex.Message}");
                return false;
            }
        }
    }
}