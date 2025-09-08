/**
 * Standardized response factory for consistent HTTP response creation
 * Implements factory pattern for better maintainability and consistency
 */
export class ResponseFactory {
  
  /**
   * Create a JSON response with standard headers
   */
  static createJsonResponse(
    data: any,
    status: number = 200,
    additionalHeaders: Record<string, string> = {}
  ): Response {
    return new Response(JSON.stringify(data), {
      status,
      headers: {
        'Content-Type': 'application/json',
        ...additionalHeaders,
      },
    });
  }

  /**
   * Create a redirect response with proper headers
   */
  static createRedirectResponse(
    location: string,
    additionalHeaders: Record<string, string> = {}
  ): Response {
    return new Response(null, {
      status: 302,
      headers: {
        'Location': location,
        'Cache-Control': 'private, max-age=0',
        ...additionalHeaders,
      },
    });
  }

  /**
   * Create a standardized error response
   */
  static createErrorResponse(
    status: number,
    errorType: string,
    message: string,
    additionalHeaders: Record<string, string> = {},
    details?: string
  ): Response {
    const errorData = {
      error: {
        type: errorType,
        message,
        ...(details && { details }),
      },
    };

    return this.createJsonResponse(errorData, status, additionalHeaders);
  }

  /**
   * Create a method not allowed response
   */
  static createMethodNotAllowedResponse(
    allowedMethods: string[] = ['GET', 'HEAD'],
    additionalHeaders: Record<string, string> = {}
  ): Response {
    return this.createErrorResponse(
      405,
      'METHOD_NOT_ALLOWED',
      `Only ${allowedMethods.join(' and ')} methods are allowed`,
      {
        'Allow': allowedMethods.join(', '),
        ...additionalHeaders,
      }
    );
  }

  /**
   * Create a passthrough response indicating request should be handled by origin
   */
  static createPassthroughResponse(
    additionalHeaders: Record<string, string> = {}
  ): Response {
    return new Response('Path passed through to origin', {
      status: 200,
      headers: {
        'X-Gull-Passthrough': 'true',
        ...additionalHeaders,
      },
    });
  }

  /**
   * Create an internal server error response
   */
  static createInternalErrorResponse(
    error: unknown,
    includeDetails: boolean = false,
    additionalHeaders: Record<string, string> = {}
  ): Response {
    return this.createErrorResponse(
      500,
      'INTERNAL_ERROR',
      'Internal server error occurred',
      additionalHeaders,
      includeDetails ? String(error) : undefined
    );
  }
}