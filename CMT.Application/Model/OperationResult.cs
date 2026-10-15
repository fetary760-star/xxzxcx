using System.Collections.Generic;
using System.Linq;

namespace CMT.Application.SelfEvaluation.Model;

// =========================================================================================
// AMENDED - CMT.Application.SelfEvaluation/Model/OperationResult.cs   (AMENDMENT OF THE EXISTING FILE)
//
// WHY THIS FILE MUST CHANGE
// -------------------------
// UserSignatureService.cs calls, about a dozen times:
//     OperationResult<UserSignatureResponse>.Fail("message", SignatureErrorCodes.AdminOnly)
//     OperationResult<UserSignatureResponse>.Ok(ToResponse(signature))
//     OperationResult<bool>.Fail(...) / OperationResult<bool>.Ok(true)
//
// and AdminSignaturesController.cs reads:
//     result.Success, result.ErrorCode, result.Message, result.Data
//
// The pre-amendment version of this class exposed ONLY Payload / IsError / Errors /
// AddError, so after fixing the 4 CS0246 errors the build would immediately fail with
// CS0117 ("'OperationResult<T>' does not contain a definition for 'Ok'/'Fail'") and
// CS1061 ("no definition for 'Success'/'ErrorCode'/'Message'/'Data'").
//
// THIS AMENDMENT IS PURELY ADDITIVE - NOTHING EXISTING WAS REMOVED OR RENAMED:
//   Payload, IsError, Errors, AddError(ErrorCode, string), the Error class and the
//   ErrorCode enum are byte-for-byte the same, so EVERY existing call site in the
//   solution (command handlers, query handlers, the other controllers) keeps compiling
//   and behaving identically.
//
// WHAT WAS ADDED
//   Ok(payload)                  - success factory
//   Fail(message, errorCode)     - failure factory carrying a STRING error code
//                                  (SignatureErrorCodes.*), plus a matching
//                                  Errors entry so IsError stays true
//   Fail(ErrorCode, message)     - enum overload, for symmetry with AddError
//   Success                      - !IsError
//   Data                         - alias of Payload (what the controller reads)
//   Message                      - first error message, or string.Empty
//   ErrorCode                    - the string code, e.g. "SIGNATURE_ADMIN_ONLY"
//
// NOTE on the property named 'ErrorCode' sitting next to the enum named 'ErrorCode':
// this is the well-known and fully legal C# "Color Color" case. Type-name lookup and
// member-name lookup are separate, so 'AddError(ErrorCode code, ...)' below still binds
// its parameter to the ENUM. No rename is required.
// =========================================================================================

public class OperationResult<T>
{
    public T? Payload { get; set; }
    public bool IsError => Errors.Any();
    public List<Error> Errors { get; set; } = new();

    public void AddError(ErrorCode code, string message)
    {
        Errors.Add(new Error { Code = code, Message = message });
    }

    // ===================== AMENDED: additive convenience surface =====================

    /// <summary>Inverse of <see cref="IsError"/>. Read by AdminSignaturesController.</summary>
    public bool Success => !IsError;

    /// <summary>Alias of <see cref="Payload"/>, so 'result.Data' compiles.</summary>
    public T? Data
    {
        get => Payload;
        set => Payload = value;
    }

    /// <summary>
    /// Domain error code as a STRING, e.g. SignatureErrorCodes.AdminOnly
    /// ("SIGNATURE_ADMIN_ONLY"). Empty on success.
    /// </summary>
    public string ErrorCode { get; set; } = string.Empty;

    /// <summary>First human readable error message, or empty on success.</summary>
    public string Message
    {
        get => string.IsNullOrEmpty(_message)
            ? (Errors.FirstOrDefault()?.Message ?? string.Empty)
            : _message;
        set => _message = value;
    }

    private string _message = string.Empty;

    /// <summary>Success factory.</summary>
    public static OperationResult<T> Ok(T payload) => new() { Payload = payload };

    /// <summary>
    /// Failure factory used throughout UserSignatureService. Also records a
    /// ValidationError entry so the legacy <see cref="IsError"/> / <see cref="Errors"/>
    /// contract keeps working for callers that only know the old surface.
    /// </summary>
    public static OperationResult<T> Fail(string message, string errorCode = "")
    {
        var result = new OperationResult<T>
        {
            ErrorCode = errorCode ?? string.Empty,
            Message = message ?? string.Empty
        };
        result.AddError(ErrorCode_.MapToEnum(errorCode), message ?? string.Empty);
        return result;
    }

    /// <summary>Failure factory with the legacy enum code.</summary>
    public static OperationResult<T> Fail(ErrorCode code, string message)
    {
        var result = new OperationResult<T> { Message = message ?? string.Empty };
        result.AddError(code, message ?? string.Empty);
        return result;
    }
}

public class Error
{
    public ErrorCode Code { get; set; }
    public string Message { get; set; } = string.Empty;
}

public enum ErrorCode
{
    NotFound = 1,
    ValidationError = 2,
    RecordFound = 3,
    ServerError = 4,
    UnAuthorized = 5
}

/// <summary>
/// AMENDED - maps a string domain code (SignatureErrorCodes.*) onto the legacy
/// <see cref="ErrorCode"/> enum, so old consumers of Errors still see a sensible
/// category. Named with a trailing underscore purely to avoid clashing with the enum.
/// </summary>
internal static class ErrorCode_
{
    public static ErrorCode MapToEnum(string? code) => code switch
    {
        "SIGNATURE_USER_NOT_FOUND" => ErrorCode.NotFound,
        "SIGNATURE_NOT_FOUND" => ErrorCode.NotFound,
        "SIGNATURE_ADMIN_ONLY" => ErrorCode.UnAuthorized,
        "SIGNATURE_STORAGE_FAILURE" => ErrorCode.ServerError,
        _ => ErrorCode.ValidationError
    };
}