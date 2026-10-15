using CMT.Domain.Data;
using CMT.Application.Interfaces;
using CMT.Application.Services;
using CMT.Web.Api.Data;
using CMT.Web.Api.Services;
using CMT.Web.Api.Middleware;
using CMT.Web.Api.Extensions;
using CMT.Web.Api.SelfEvaluation.Infrastructure;
using Microsoft.EntityFrameworkCore;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.IdentityModel.Tokens;
using System.Text;
using Microsoft.OpenApi.Models;
using System.Reflection;
using CMT.Web.Api.Hubs;
using SystemTask = System.Threading.Tasks.Task;
using Microsoft.Extensions.FileProviders;
using Microsoft.AspNetCore.Mvc;
using System.Net;
using System.Net.Mail;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers().AddSelfEvaluationJsonBinding();

// Add Entity Framework with SQL Server (changed from SQLite)
builder.Services.AddDbContext<ApplicationDbContext>(options =>
{
    options.UseSqlServer(
        builder.Configuration.GetConnectionString("DefaultConnection"),
        sqlServerOptions =>
        {
            sqlServerOptions.EnableRetryOnFailure(
                maxRetryCount: 10,
                maxRetryDelay: TimeSpan.FromSeconds(60),
                errorNumbersToAdd: null
            );
            sqlServerOptions.CommandTimeout(60);
        }
    );
});

// Add MediatR
builder.Services.AddMediatR(cfg => {
    cfg.RegisterServicesFromAssembly(typeof(CMT.Application.Services.TaskService).Assembly);
});

// Add SignalR
builder.Services.AddSignalR();

builder.Services.AddSelfEvaluationModule(builder.Configuration);

// Add JWT Authentication
var jwtSettings = builder.Configuration.GetSection("JwtSettings");
var secretKey = jwtSettings["SecretKey"] ?? "DefaultSecretKeyForCMTApplication123456789";
var key = Encoding.ASCII.GetBytes(secretKey);

builder.Services.AddAuthentication(x =>
{
    x.DefaultAuthenticateScheme = JwtBearerDefaults.AuthenticationScheme;
    x.DefaultChallengeScheme = JwtBearerDefaults.AuthenticationScheme;
})
.AddJwtBearer(x =>
{
    x.RequireHttpsMetadata = false;
    x.SaveToken = true;
    x.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuerSigningKey = true,
        IssuerSigningKey = new SymmetricSecurityKey(key),
        ValidateIssuer = true,
        ValidateAudience = true,
        ValidIssuer = jwtSettings["Issuer"] ?? "CMT.Api",
        ValidAudience = jwtSettings["Audience"] ?? "CMT.Client",
        // ClockSkew = Zero caused spurious 401s when the issuing server and
        // validating server had sub-second clock drift. 2 minutes is the
        // typical industry default and is small enough to keep short-lived
        // tokens meaningful while tolerating ordinary NTP drift.
        ClockSkew = TimeSpan.FromMinutes(2)
    };

    // ============================================================================
    // SECURITY FIX (Finding 12 — Sensitive Data Exposure via Browser Local Storage)
    //
    // Accept JWT from:
    //   1. Authorization: Bearer header (legacy / fallback for in-memory store)
    //   2. HttpOnly "access_token" cookie (preferred — not reachable from JS, so
    //      it cannot be exfiltrated through XSS)
    //   3. SignalR "access_token" query parameter (only on /notificationHub path)
    //
    // Priority order: Authorization header > HttpOnly cookie > SignalR query param.
    // The frontend stops writing tokens to localStorage and relies on the cookie
    // being sent automatically via `credentials: 'include'`.
    // ============================================================================
    x.Events = new JwtBearerEvents
    {
        OnMessageReceived = context =>
        {
            // If no Authorization: Bearer header is present, try to read the JWT
            // from the HttpOnly "access_token" cookie instead.
            if (string.IsNullOrEmpty(context.Token))
            {
                var cookieToken = context.Request.Cookies["access_token"];
                if (!string.IsNullOrEmpty(cookieToken))
                {
                    context.Token = cookieToken;
                }
            }

            // SignalR clients cannot set headers on the WebSocket upgrade request,
            // so we continue to support the access_token query parameter — but
            // ONLY on the notification hub path.
            var accessToken = context.Request.Query["access_token"];
            var path = context.HttpContext.Request.Path;
            if (!string.IsNullOrEmpty(accessToken) && path.StartsWithSegments("/notificationHub"))
            {
                context.Token = accessToken;
            }

            return SystemTask.CompletedTask;
        }
    };
});

// Add Authorization
builder.Services.AddAuthorization();

// Add Application Services
builder.Services.AddScoped<IPasswordService, PasswordService>();
builder.Services.AddScoped<IAuthenticationService, AuthenticationService>();
builder.Services.AddScoped<IJwtTokenService, JwtTokenService>();
builder.Services.AddScoped<IUserService, UserService>();
builder.Services.AddScoped<ISelfEvaluationUserMirrorService, CMT.Application.SelfEvaluation.Services.SelfEvaluationUserMirrorService>();
builder.Services.AddScoped<IUserAuditService, UserAuditService>();
builder.Services.AddScoped<IAuthorizationService, AuthorizationService>();
builder.Services.AddScoped<ITaskService, TaskService>();
builder.Services.AddScoped<ICompletedTaskService, CompletedTaskService>();
builder.Services.AddScoped<DatabaseSeeder>();

builder.Services.AddScoped<IShopService, ShopService>();
builder.Services.AddScoped<ITaskUpdateHistoryService, TaskUpdateHistoryService>();
builder.Services.AddScoped<ITaskHoldService, TaskHoldService>();

// Add notification services
builder.Services.AddScoped<INotificationService, NotificationService>();
builder.Services.AddScoped<TokenHandlerService>();
builder.Services.AddScoped<INotificationHubService, SignalRNotificationHubService>();

builder.Services.AddScoped<IAmendmentService, EnhancedAmendmentService>();
builder.Services.AddScoped<IEnhancedAmendmentService, EnhancedAmendmentService>();

// Add Schedule and Workload Services
builder.Services.AddScoped<IScheduleService, ScheduleService>();
builder.Services.AddScoped<IWorkloadService, WorkloadService>();
builder.Services.AddScoped<IWorkloadAdjustmentService, WorkloadAdjustmentService>();

builder.Services.AddScoped<IDashboardService, DashboardService>();
builder.Services.AddScoped<IPerformanceService, PerformanceService>();
builder.Services.AddScoped<IAnalyticsService, AnalyticsService>();
builder.Services.AddScoped<IEmailService, EmailService>();
builder.Services.AddScoped<IDuplicateDetectionService, DuplicateDetectionService>();
builder.Services.AddScoped<IDepartmentService, DepartmentService>();
builder.Services.AddScoped<IDirectorService, DirectorService>();
builder.Services.AddScoped<IDirectorPermissionService, DirectorPermissionService>();
builder.Services.AddScoped<ITlPermissionService, TlPermissionService>();
builder.Services.AddScoped<ITaskPauseService, TaskPauseService>();
builder.Services.AddScoped<IRolePermissionService, RolePermissionService>();

// ============================================================================
// CORS CONFIGURATION
// ============================================================================
builder.Services.AddCors(options =>
{
    options.AddPolicy("CorsPolicy", policy =>
    {
        policy.WithOrigins(
            "http://svhqiis03:8757", // Production frontend origin
            "http://localhost:3000"  // Unified frontend development origin
              )
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();  // Required for SignalR AND for HttpOnly auth cookies
    });
});

// Add Swagger/OpenAPI
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen(c =>
{
    c.SwaggerDoc("v1", new OpenApiInfo
    {
        Title = "CMT Task Management API",
        Version = "v1",
        Description = "API for CMT Task Management System with Role-Based Access Control"
    });

    c.AddSecurityDefinition("Bearer", new OpenApiSecurityScheme
    {
        Description = "JWT Authorization header using the Bearer scheme. Example: \"Authorization: Bearer {token}\"",
        Name = "Authorization",
        In = ParameterLocation.Header,
        Type = SecuritySchemeType.ApiKey,
        Scheme = "Bearer"
    });

    c.AddSecurityRequirement(new OpenApiSecurityRequirement
    {
        {
            new OpenApiSecurityScheme
            {
                Reference = new OpenApiReference
                {
                    Type = ReferenceType.SecurityScheme,
                    Id = "Bearer"
                }
            },
            Array.Empty<string>()
        }
    });
});

var app = builder.Build();

// Configure the HTTP request pipeline.
app.UseSwagger();
app.UseSwaggerUI();

// Initialize database and seed data
using (var scope = app.Services.CreateScope())
{
    var services = scope.ServiceProvider;
    try
    {
        var context = services.GetRequiredService<ApplicationDbContext>();
        var seeder = services.GetRequiredService<DatabaseSeeder>();

        Console.WriteLine("Initializing database...");
        await context.Database.EnsureCreatedAsync();

        Console.WriteLine("Seeding database with reference data only...");
        await seeder.SeedAsync();

        Console.WriteLine("Database initialization completed successfully!");
    }
    catch (Exception ex)
    {
        Console.WriteLine($"An error occurred while seeding the database: {ex.Message}");
        Console.WriteLine($"Stack trace: {ex.StackTrace}");
    }
}

// ============================================================================
// CORS MUST be applied FIRST — before any middleware that might short-circuit
// the request (like CsrfMiddleware returning 403). If CORS runs after
// CsrfMiddleware, the 403 response won't have Access-Control-Allow-Origin
// headers, and the browser reports a CORS error.
// ============================================================================
app.UseCors("CorsPolicy");

// SECURITY: GLOBAL FRAME PROTECTION - Applied after CORS
app.Use(async (context, next) =>
{
    context.Response.Headers["X-Frame-Options"] = "DENY";
    await next();
});

// SECURITY: Apply comprehensive security headers middleware
app.UseMiddleware<SecurityHeadersMiddleware>();

// SECURITY: Apply CSRF protection middleware
app.UseMiddleware<CsrfMiddleware>();

// SECURITY: Apply secure cookie authentication middleware
app.UseMiddleware<CookieAuthenticationMiddleware>();

// Serve static files from wwwroot (including uploaded profile pictures)
app.UseStaticFiles();

// Serve uploaded files from wwwroot/uploads directory
var uploadsPath = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads");
if (!Directory.Exists(uploadsPath))
{
    Directory.CreateDirectory(uploadsPath);
}

// Ensure the profiles subdirectory exists
var profilesPath = Path.Combine(uploadsPath, "profiles");
if (!Directory.Exists(profilesPath))
{
    Directory.CreateDirectory(profilesPath);
}

app.UseStaticFiles(new StaticFileOptions
{
    FileProvider = new PhysicalFileProvider(uploadsPath),
    RequestPath = "/uploads",
    OnPrepareResponse = ctx =>
    {
        // Allow profile images to be cached briefly by browsers
        ctx.Context.Response.Headers["Cache-Control"] = "public,max-age=3600";
    }
});

// FIX: Fallback handler for missing profile pictures.
// Previously, a stale DB reference to a non-existent file (e.g. profile_23_20260225080817.png)
// returned a 404 HTML page, resulting in broken <img> tags on the frontend.
// Now: if the static file handler did not serve the file and it's a /uploads/profiles/*
// request, serve a default placeholder (or return a clean 404 with short-circuit).
app.Use(async (context, next) =>
{
    await next();

    if (context.Response.StatusCode == 404 &&
        !context.Response.HasStarted &&
        context.Request.Path.StartsWithSegments("/uploads/profiles"))
    {
        // Try to serve a default avatar placeholder if one is bundled in wwwroot.
        var defaultAvatar = Path.Combine(Directory.GetCurrentDirectory(), "wwwroot", "uploads", "profiles", "default-avatar.png");
        if (File.Exists(defaultAvatar))
        {
            context.Response.StatusCode = 200;
            context.Response.ContentType = "image/png";
            context.Response.Headers["Cache-Control"] = "public,max-age=300";
            await context.Response.SendFileAsync(defaultAvatar);
            return;
        }

        // No placeholder available — return a small transparent 1x1 PNG so the
        // browser shows a blank space instead of a broken-image icon.
        byte[] transparentPng = new byte[]
        {
            0x89,0x50,0x4E,0x47,0x0D,0x0A,0x1A,0x0A,0x00,0x00,0x00,0x0D,0x49,0x48,0x44,0x52,
            0x00,0x00,0x00,0x01,0x00,0x00,0x00,0x01,0x08,0x06,0x00,0x00,0x00,0x1F,0x15,0xC4,
            0x89,0x00,0x00,0x00,0x0D,0x49,0x44,0x41,0x54,0x78,0x9C,0x63,0x00,0x01,0x00,0x00,
            0x05,0x00,0x01,0x0D,0x0A,0x2D,0xB4,0x00,0x00,0x00,0x00,0x49,0x45,0x4E,0x44,0xAE,
            0x42,0x60,0x82
        };
        context.Response.StatusCode = 200;
        context.Response.ContentType = "image/png";
        context.Response.Headers["Cache-Control"] = "public,max-age=60";
        context.Response.ContentLength = transparentPng.Length;
        await context.Response.Body.WriteAsync(transparentPng, 0, transparentPng.Length);
    }
});

app.UseAuthentication();
app.UseAuthorization();
app.MapControllers();

// ============================================================================
// SignalR Hub Mapping with CORS
// ============================================================================
app.MapHub<NotificationHub>("/notificationHub")
   .RequireCors("CorsPolicy");

// Health check endpoint
app.MapGet("/health", () => new { Status = "Healthy", Timestamp = DateTime.UtcNow });

// API info endpoint
app.MapGet("/api/info", () => new
{
    Name = "CMT Task Management API",
    Version = "1.0.0",
    Description = "Role-Based Access Control API for Task Management",
    Timestamp = DateTime.UtcNow
});

// Database connection test endpoint
app.MapGet("/api/db-test", async (ApplicationDbContext context) =>
{
    try
    {
        await context.Database.CanConnectAsync();
        return Results.Ok(new { Status = "Connected", Message = "Database connection successful" });
    }
    catch (Exception ex)
    {
        return Results.Problem($"Database connection failed: {ex.Message}");
    }
});

app.Run();