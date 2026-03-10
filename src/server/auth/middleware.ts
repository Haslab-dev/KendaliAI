import { authManager } from "./manager";
import { AuthContext } from "./types";

export interface RequestWithAuth extends Request {
  auth?: AuthContext;
}

/**
 * Extract Bearer token from Authorization header
 */
function extractBearerToken(authHeader: string | null): string | null {
  if (!authHeader) return null;
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

/**
 * Auth middleware for API routes
 */
export async function authMiddleware(request: Request): Promise<AuthContext> {
  // Try API key authentication first
  const authHeader = request.headers.get("Authorization");
  const bearerToken = extractBearerToken(authHeader);

  if (bearerToken) {
    // Check if it's an API key (starts with kai_)
    if (bearerToken.startsWith("kai_")) {
      const context = await authManager.validateApiKey(bearerToken);
      if (context) return context;
    }
  }

  // Try X-API-Key header
  const apiKeyHeader = request.headers.get("X-API-Key");
  if (apiKeyHeader && apiKeyHeader.startsWith("kai_")) {
    const context = await authManager.validateApiKey(apiKeyHeader);
    if (context) return context;
  }

  // No valid authentication
  return {
    isAuthenticated: false,
    isApiKey: false,
  };
}

/**
 * Create an unauthorized response
 */
export function unauthorizedResponse(
  message: string = "Unauthorized",
): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 401,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Create a forbidden response
 */
export function forbiddenResponse(message: string = "Forbidden"): Response {
  return new Response(JSON.stringify({ error: message }), {
    status: 403,
    headers: {
      "Content-Type": "application/json",
    },
  });
}

/**
 * Require authentication wrapper for route handlers
 */
export function requireAuth(
  handler: (request: Request, auth: AuthContext) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const auth = await authMiddleware(request);
    if (!auth.isAuthenticated) {
      return unauthorizedResponse();
    }
    return handler(request, auth);
  };
}

/**
 * Require admin role wrapper for route handlers
 */
export function requireAdmin(
  handler: (request: Request, auth: AuthContext) => Promise<Response>,
): (request: Request) => Promise<Response> {
  return async (request: Request) => {
    const auth = await authMiddleware(request);
    if (!auth.isAuthenticated) {
      return unauthorizedResponse();
    }
    if (auth.user?.role !== "admin") {
      return forbiddenResponse("Admin access required");
    }
    return handler(request, auth);
  };
}
