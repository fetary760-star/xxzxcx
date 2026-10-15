using Microsoft.EntityFrameworkCore;
using CMT.Application.SelfEvaluation.Options;
using CMT.Application.SelfEvaluation.Services;
using CMT.Web.Api.SelfEvaluation.Infrastructure;

namespace CMT.Web.Api.Extensions;

public static class SelfEvaluationModuleExtensions
{
    public static IServiceCollection AddSelfEvaluationModule(
        this IServiceCollection services,
        IConfiguration configuration)
    {
        var connectionString = configuration.GetConnectionString("SEDefaultConnection");
        if (string.IsNullOrWhiteSpace(connectionString))
        {
            throw new InvalidOperationException(
                "ConnectionStrings:SEDefaultConnection must be configured for Self Evaluation.");
        }

        services.AddDbContext<CMT.Domain.SelfEvaluation.Data.ApplicationDbContext>(options =>
            options.UseSqlServer(connectionString));

        services.AddScoped<CMT.Application.SelfEvaluation.Services.PasswordService>();
        services.AddScoped<WorkflowInboxQueryService>();
        services.AddScoped<HierarchyRuleService>();

        services.AddOptions<SignatureStorageOptions>()
            .Bind(configuration.GetSection(SignatureStorageOptions.SectionName))
            .Validate(options => !string.IsNullOrWhiteSpace(options.Root),
                "SignatureStorage:Root must be configured.")
            .Validate(options => options.MaxFileSizeBytes > 0,
                "SignatureStorage:MaxFileSizeBytes must be greater than zero.")
            .Validate(options => options.AllowedContentTypes is { Length: > 0 },
                "SignatureStorage:AllowedContentTypes must contain at least one type.")
            .Validate(options => options.AllowedExtensions is { Length: > 0 },
                "SignatureStorage:AllowedExtensions must contain at least one extension.")
            .ValidateOnStart();

        services.AddHttpContextAccessor();
        services.AddScoped<IContentRootAccessor, ContentRootAccessor>();
        services.AddScoped<ICurrentUserAccessor, CurrentUserAccessor>();
        services.AddScoped<IUserSignatureService, UserSignatureService>();
        services.AddScoped<ISignatureReadService, SignatureReadService>();
        services.AddScoped<WorkflowInstanceQueryService>();
        services.AddScoped<WorkflowLegacySelfHealService>();
        services.AddScoped<IFormUploadAuthorizationService, FormUploadAuthorizationService>();
        services.AddScoped<IFormUploadGrantService, FormUploadGrantService>();

        services.AddHttpClient();
        services.AddScoped<ICMMExternalService, CMMExternalService>();
        services.AddScoped<IMaintainXExternalService, MaintainXExternalService>();
        services.Configure<MaintainXConnectorOptions>(
            configuration.GetSection(MaintainXConnectorOptions.SectionName));

        services.AddSingleton(serviceProvider =>
        {
            var settings = configuration.GetSection("MaintainXSystem");
            return new MaintainXBrowserFactory(
                headless: !string.Equals(settings["Headless"], "false", StringComparison.OrdinalIgnoreCase),
                slowMoMs: int.TryParse(settings["SlowMoMs"], out var slowMo) && slowMo > 0 ? slowMo : 0,
                executablePath: settings["ExecutablePath"],
                browserChannel: settings["BrowserChannel"],
                autoInstallBrowser: !string.Equals(settings["AutoInstallBrowser"], "false", StringComparison.OrdinalIgnoreCase),
                logger: serviceProvider.GetRequiredService<ILogger<MaintainXBrowserFactory>>());
        });

        services.AddScoped<IMaintainXEtPartNumberResolver, NullMaintainXEtPartNumberResolver>();
        services.AddScoped<IMaintainXUserSignatureProvider, NullMaintainXUserSignatureProvider>();
        services.AddScoped<IMaintainXEtPartNumberResolver, MaintainXEtPartNumberScraper>();
        services.AddScoped<IMaintainXUserSignatureProvider, MaintainXSignatureScraper>();
        services.AddScoped<IMaintainXUserIdentityResolver, MaintainXUserIdentityResolver>();

        return services;
    }
}