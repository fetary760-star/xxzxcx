using System.Threading.Tasks;

namespace CMT.Application.Interfaces
{
    public interface IEmailService
    {
        Task<bool> SendEmailAsync(string toEmail, string subject, string body, bool isHtml = true);
        Task<bool> SendFeedbackEmailAsync(string userEmail, string userName, string feedbackType, string subject, string message, string priority, string ticketId);
    }
}