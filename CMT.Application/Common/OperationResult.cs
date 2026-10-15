namespace CMT.Application.Common
{
    public class OperationResult<T>
    {
        public T? Payload { get; set; }
        public List<Error> Errors { get; set; } = new List<Error>();
        public bool IsSuccess => !Errors.Any();

        public void AddError(ErrorCode code, string message)
        {
            Errors.Add(new Error { Code = code, Message = message });
        }
    }

    public class Error
    {
        public ErrorCode Code { get; set; }
        public string Message { get; set; } = string.Empty;
    }

    public enum ErrorCode
    {
        ServerError,
        UnAuthorized,
        NotFound,
        ValidationError
    }
}