// =====================================================================================
// AMENDED v32 — PHASE 1 / BACKEND DELIVERABLE 2 (NEW FILE)
// Copy to: CMT.Web.Api.SelfEvaluation/Infrastructure/SelfEvaluationJsonBinding.cs
//
// WHAT THIS FILE IS FOR
// -------------------------------------------------------------------------------------
// Program.cs currently calls a bare:
//
//     builder.Services.AddControllers();
//
// with NO AddJsonOptions. Two consequences, both visible in the reported 400s:
//
//   1. CMT.Web.Api.SelfEvaluation/Converters/NullableGuidConverter.cs already exists in the solution but
//      is NEVER REGISTERED, so it has never actually protected a single request.
//   2. There is no place for the new date converter either, which is why
//      "revDate": "MAR 11 2021" aborts model binding and produces
//      "$.revDate" + the cascade "The command field is required.".
//
// This file provides ONE extension method so Program.cs changes by a SINGLE line:
//
//     builder.Services
//         .AddControllers()
//         .AddSelfEvaluationJsonBinding();
//
// IT DOES EXACTLY THREE THINGS
//   (A) Registers the flexible converters (dates, Guid?, long?, int?, decimal?, bool?)
//       so an empty or human-readable value can never abort binding again.
//   (B) Makes reading numbers from strings legal ("qty": "3"), which the hard-copy
//       forms produce whenever a numeric box is typed into a text input.
//   (C) Replaces the misleading default 400 body with an accurate one: the cascade
//       "The <param> field is required." noise is suppressed whenever a real "$.path"
//       conversion error explains the failure, and a genuinely missing body gets a
//       message that names the endpoint contract instead of blaming the parameter.
//
// WHAT IT DELIBERATELY DOES **NOT** DO
//   - It does not change PropertyNamingPolicy. Responses stay camelCase exactly as today,
//     so no frontend normaliser, export or PDF layout is affected.
//   - It does not change how DateTime is WRITTEN. Both date converters use the
//     Utf8JsonWriter DateTime overload, i.e. byte-identical to the framework default.
//   - It does not touch any entity, table, command, endpoint route or workflow rule.
// =====================================================================================

using System;
using System.Collections.Generic;
using System.Diagnostics;
using System.Linq;
using System.Text.Json.Serialization;
using Microsoft.AspNetCore.Mvc;
using Microsoft.Extensions.DependencyInjection;
using CMT.Web.Api.SelfEvaluation.Converters;

namespace CMT.Web.Api.SelfEvaluation.Infrastructure
{
    public static class SelfEvaluationJsonBinding
    {
        /// <summary>
        /// Marker echoed on every amended 400 body so a support ticket can be traced to
        /// this amendment without reading the server log.
        /// </summary>
        public const string AmendmentTag = "v32-phase1-json-binding";

        /// <summary>
        /// Registers the tolerant JSON boundary for the whole API.
        /// Call it directly on AddControllers() in Program.cs.
        /// </summary>
        public static IMvcBuilder AddSelfEvaluationJsonBinding(this IMvcBuilder builder)
        {
            if (builder is null) throw new ArgumentNullException(nameof(builder));

            // ---------------------------------------------------------------------------
            // (A) + (B) — the tolerant reader
            // ---------------------------------------------------------------------------
            builder.AddJsonOptions(options =>
            {
                var json = options.JsonSerializerOptions;

                // ORDER MATTERS: the first converter that CanConvert a type wins, so the
                // flexible ones must be added before anything the framework supplies.
                json.Converters.Add(new FlexibleNullableDateTimeConverter());
                json.Converters.Add(new FlexibleDateTimeConverter());

                // Already in the solution, never registered until now. This is what makes
                // "assignedToUserId": "" / "folderId": "" survive instead of 400-ing.
                json.Converters.Add(new NullableGuidConverter());

                json.Converters.Add(new FlexibleNullableLongConverter());
                json.Converters.Add(new FlexibleNullableIntConverter());
                json.Converters.Add(new FlexibleNullableDecimalConverter());
                json.Converters.Add(new FlexibleNullableBooleanConverter());

                // "revNo": "17" binding to a numeric property, and vice versa.
                json.NumberHandling = JsonNumberHandling.AllowReadingFromString;

                // camelCase body -> PascalCase command. This is the MVC default; stated
                // explicitly so a future edit cannot silently break every controller.
                json.PropertyNameCaseInsensitive = true;

                // Tolerate the cosmetic JSON a hand-edited Postman collection produces.
                json.AllowTrailingCommas = true;
                json.ReadCommentHandling = System.Text.Json.JsonCommentHandling.Skip;
            });

            // ---------------------------------------------------------------------------
            // (C) — an honest 400 body
            // ---------------------------------------------------------------------------
            builder.Services.Configure<ApiBehaviorOptions>(options =>
            {
                options.InvalidModelStateResponseFactory = context =>
                {
                    var errors = new Dictionary<string, string[]>(StringComparer.Ordinal);

                    foreach (var entry in context.ModelState)
                    {
                        if (entry.Value is null || entry.Value.Errors.Count == 0) continue;

                        var messages = entry.Value.Errors
                            .Select(error => string.IsNullOrWhiteSpace(error.ErrorMessage)
                                ? (error.Exception?.Message ?? "The value is not valid.")
                                : error.ErrorMessage)
                            .ToArray();

                        errors[entry.Key] = messages;
                    }

                    // A "$."-prefixed key is a real System.Text.Json conversion failure and
                    // is ALWAYS the true cause.
                    var hasJsonPathError = errors.Keys
                        .Any(key => key.StartsWith("$.", StringComparison.Ordinal));

                    var bodyWasMissing = errors.Values
                        .SelectMany(messages => messages)
                        .Any(message => message.IndexOf("non-empty request body",
                            StringComparison.OrdinalIgnoreCase) >= 0);

                    string hint;

                    if (hasJsonPathError)
                    {
                        // Suppress the cascade. "The command field is required." is emitted
                        // only BECAUSE the conversion above aborted binding; reporting it
                        // alongside the real error is what sent this investigation down the
                        // wrong path in the first place.
                        var cascadeKeys = errors
                            .Where(pair =>
                                !pair.Key.StartsWith("$.", StringComparison.Ordinal) &&
                                pair.Value.All(message => message.IndexOf("is required",
                                    StringComparison.OrdinalIgnoreCase) >= 0))
                            .Select(pair => pair.Key)
                            .ToList();

                        foreach (var key in cascadeKeys) errors.Remove(key);

                        hint =
                            "One field could not be converted, which aborts binding for the " +
                            "WHOLE body. Fix the '$.' path listed above; any companion " +
                            "\"field is required\" error was only a side effect and has been " +
                            "removed from this response.";
                    }
                    else if (bodyWasMissing)
                    {
                        hint =
                            "The request arrived with no body. Endpoints that take a command " +
                            "require at least '{}'. Note that " +
                            "POST /api/self-evaluation/forms/{id}/submit takes NO body by " +
                            "design, so a 400 on that route is a workflow-state problem " +
                            "(the form is no longer Draft or Returned), not a payload problem.";
                    }
                    else
                    {
                        hint = "Correct the fields listed above and resend the request.";
                    }

                    var problem = new ValidationProblemDetails(errors)
                    {
                        Type = "https://tools.ietf.org/html/rfc9110#section-15.5.1",
                        Title = hasJsonPathError
                            ? "The request body could not be bound."
                            : "One or more validation errors occurred.",
                        Status = StatusCodes.Status400BadRequest,
                        Instance = context.HttpContext.Request.Path
                    };

                    problem.Extensions["hint"] = hint;
                    problem.Extensions["amendment"] = AmendmentTag;
                    problem.Extensions["traceId"] =
                        Activity.Current?.Id ?? context.HttpContext.TraceIdentifier;

                    return new BadRequestObjectResult(problem)
                    {
                        ContentTypes = { "application/problem+json" }
                    };
                };
            });

            return builder;
        }
    }
}