import { gateway } from "../gateway/gateway";
import { log } from "../core/logger";
import {
  ChatCompletionRequest,
  ChatCompletionStreamChunk,
} from "../gateway/types";

/**
 * Get CORS headers based on request origin and environment configuration
 *
 * Configure allowed origins via ALLOWED_ORIGINS environment variable:
 * - Set to "*" to allow all origins (development mode)
 * - Set to comma-separated list of origins for production:
 *   ALLOWED_ORIGINS=https://app.example.com,https://dashboard.example.com
 */
function getCorsHeaders(request: Request): Record<string, string> {
  const requestOrigin = request.headers.get("Origin") || "";
  const allowedOriginsEnv = process.env.ALLOWED_ORIGINS || "*";

  // Parse allowed origins from environment
  const allowedOrigins = allowedOriginsEnv.split(",").map((o) => o.trim());

  // Determine which origin to allow
  let allowOrigin = "*";

  if (allowedOrigins.includes("*")) {
    // Allow all origins (development mode)
    allowOrigin = requestOrigin || "*";
  } else if (requestOrigin && allowedOrigins.includes(requestOrigin)) {
    // Origin is in allowed list
    allowOrigin = requestOrigin;
  } else if (allowedOrigins.length > 0 && allowedOrigins[0] !== "*") {
    // Use first allowed origin as default
    allowOrigin = allowedOrigins[0];
  }

  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type, Authorization, X-API-Key",
    "Access-Control-Allow-Credentials": "true",
  };
}

// Default CORS headers for responses
const CORS_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Handle OPTIONS preflight requests
 */
export function handleOptions(): Response {
  return new Response(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

/**
 * GET /v1/models - List available models
 */
export async function listModels(): Promise<Response> {
  try {
    const models = await gateway.listModels();

    return new Response(JSON.stringify(models), {
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (error: any) {
    log.error(`[OpenAI] List models error: ${error}`);

    return new Response(
      JSON.stringify({
        error: {
          message: error.message,
          type: "internal_error",
          code: "internal_error",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      },
    );
  }
}

/**
 * POST /v1/chat/completions - Create chat completion
 */
export async function createChatCompletion(
  request: Request,
): Promise<Response> {
  try {
    const body = (await request.json()) as ChatCompletionRequest;

    // Validate request
    if (!body.model) {
      return new Response(
        JSON.stringify({
          error: {
            message: "Missing required field: model",
            type: "invalid_request_error",
            code: "invalid_request",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        },
      );
    }

    if (
      !body.messages ||
      !Array.isArray(body.messages) ||
      body.messages.length === 0
    ) {
      return new Response(
        JSON.stringify({
          error: {
            message: "Missing required field: messages",
            type: "invalid_request_error",
            code: "invalid_request",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        },
      );
    }

    // Handle streaming
    if (body.stream) {
      return handleStreamingCompletion(body);
    }

    // Non-streaming completion
    const response = await gateway.chatCompletion(body);

    return new Response(JSON.stringify(response), {
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (error: any) {
    log.error(`[OpenAI] Chat completion error: ${error}`);

    return new Response(
      JSON.stringify({
        error: {
          message: error.message,
          type: "internal_error",
          code: "internal_error",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      },
    );
  }
}

/**
 * Handle streaming chat completion
 */
function handleStreamingCompletion(request: ChatCompletionRequest): Response {
  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();

      try {
        for await (const chunk of gateway.streamChatCompletion(request)) {
          const data = `data: ${JSON.stringify(chunk)}\n\n`;
          controller.enqueue(encoder.encode(data));
        }

        // Send final [DONE] message
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      } catch (error: any) {
        log.error(`[OpenAI] Streaming error: ${error}`);

        const errorChunk = {
          id: `error-${Date.now()}`,
          object: "chat.completion.chunk",
          created: Math.floor(Date.now() / 1000),
          model: request.model,
          choices: [
            {
              index: 0,
              delta: {
                content: `\n\nError: ${error.message}`,
              },
              finish_reason: "stop",
            },
          ],
        };

        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(errorChunk)}\n\n`),
        );
        controller.enqueue(encoder.encode("data: [DONE]\n\n"));
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
      ...CORS_HEADERS,
    },
  });
}

/**
 * POST /v1/embeddings - Create embeddings
 */
export async function createEmbeddings(request: Request): Promise<Response> {
  try {
    const body = await request.json();

    if (!body.model) {
      return new Response(
        JSON.stringify({
          error: {
            message: "Missing required field: model",
            type: "invalid_request_error",
            code: "invalid_request",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        },
      );
    }

    if (!body.input) {
      return new Response(
        JSON.stringify({
          error: {
            message: "Missing required field: input",
            type: "invalid_request_error",
            code: "invalid_request",
          },
        }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            ...CORS_HEADERS,
          },
        },
      );
    }

    const response = await gateway.embeddings(body);

    return new Response(JSON.stringify(response), {
      headers: {
        "Content-Type": "application/json",
        ...CORS_HEADERS,
      },
    });
  } catch (error: any) {
    log.error(`[OpenAI] Embeddings error: ${error}`);

    return new Response(
      JSON.stringify({
        error: {
          message: error.message,
          type: "internal_error",
          code: "internal_error",
        },
      }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          ...CORS_HEADERS,
        },
      },
    );
  }
}

/**
 * Route OpenAI-compatible API requests
 */
export async function routeOpenAIRequest(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url);
  const path = url.pathname;

  // Handle OPTIONS for all routes
  if (request.method === "OPTIONS") {
    return handleOptions();
  }

  // GET /v1/models
  if (request.method === "GET" && path === "/v1/models") {
    return listModels();
  }

  // POST /v1/chat/completions
  if (request.method === "POST" && path === "/v1/chat/completions") {
    return createChatCompletion(request);
  }

  // POST /v1/embeddings
  if (request.method === "POST" && path === "/v1/embeddings") {
    return createEmbeddings(request);
  }

  // Not an OpenAI route
  return null;
}
