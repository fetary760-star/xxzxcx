namespace CMT.Application.DTOs;

public class ServiceResult<T>
{
    public bool IsSuccess { get; set; }
    public T? Payload { get; set; }
    public List<string> Errors { get; set; } = new();
    public string? Message { get; set; }

    public static ServiceResult<T> Success(T payload, string? message = null)
    {
        return new ServiceResult<T>
        {
            IsSuccess = true,
            Payload = payload,
            Message = message
        };
    }

    public static ServiceResult<T> Failure(string error)
    {
        return new ServiceResult<T>
        {
            IsSuccess = false,
            Errors = new List<string> { error }
        };
    }

    public static ServiceResult<T> Failure(List<string> errors)
    {
        return new ServiceResult<T>
        {
            IsSuccess = false,
            Errors = errors
        };
    }
}