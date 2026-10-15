using CMT.Domain.Models;
using Task = System.Threading.Tasks.Task;

namespace CMT.Application.Interfaces;

public interface ISelfEvaluationUserMirrorService
{
    Task UpsertAsync(User user, CancellationToken cancellationToken = default);
}