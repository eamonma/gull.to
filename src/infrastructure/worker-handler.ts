import {
  RedirectService,
  RedirectRequest,
  RedirectResponse,
} from '@application/redirect-service';
import { MappingRecord } from '@domain/types';
import { DiagnosticHandler } from './diagnostic-handler';
import { ResponseFactory } from './response-factory';

// Cloudflare Worker configuration
export interface WorkerConfig {
  readonly mappingData: readonly MappingRecord[];
  readonly workerVersion: string;
  readonly mapVersion: string;
  readonly environment: 'production' | 'staging' | 'development' | 'testing';
}

// Cloudflare Worker handler interface
export interface WorkerHandler {
  fetch(
    request: Request,
    env: Record<string, unknown>,
    ctx: {
      waitUntil?: (p: Promise<unknown>) => void;
      passThroughOnException?: () => void;
    }
  ): Promise<Response>;
}

// Implementation of Cloudflare Worker handler
class WorkerHandlerImpl implements WorkerHandler {
  private readonly redirectService: RedirectService;
  private readonly diagnosticHandler: DiagnosticHandler;
  private readonly config: WorkerConfig;

  constructor(config: WorkerConfig) {
    this.config = config;

    // Initialize redirect service with mapping data
    this.redirectService = new RedirectService(config.mappingData, {
      workerVersion: config.workerVersion,
      mapVersion: config.mapVersion,
    });

    // Initialize diagnostic handler
    this.diagnosticHandler = new DiagnosticHandler(
      this.redirectService,
      config
    );
  }

  /**
   * Main Cloudflare Workers fetch handler per instructions.md:22-24
   */
  async fetch(
    request: Request,
    _env: Record<string, unknown>,
    _ctx: {
      waitUntil?: (p: Promise<unknown>) => void;
      passThroughOnException?: () => void;
    }
  ): Promise<Response> {
    try {
      // Extract URL and method from Cloudflare Request
      const url = new URL(request.url);
      const method = request.method;
      const pathname = url.pathname;

      // Route filtering: only handle /g/* paths per instructions.md:23
      if (!this.shouldHandlePath(pathname)) {
        return this.createPassthroughResponse();
      }

      // Handle diagnostic endpoints per instructions.md:92-96
      if (this.diagnosticHandler.isDiagnosticPath(pathname)) {
        // HTTP method validation for diagnostics
        if (!this.isAllowedMethod(method)) {
          return this.createMethodNotAllowedResponse();
        }

        return this.diagnosticHandler.handleDiagnosticRequest(pathname);
      }

      // HTTP method validation
      if (!this.isAllowedMethod(method)) {
        return this.createMethodNotAllowedResponse();
      }

      // Transform Cloudflare Request to internal RedirectRequest
      const redirectRequest = this.transformRequest(request);

      // Process redirect using business logic
      const redirectResponse =
        this.redirectService.processRedirect(redirectRequest);

      // Transform internal response to Cloudflare Response
      return this.transformResponse(redirectResponse);
    } catch (error) {
      return this.createInternalErrorResponse(error);
    }
  }

  /**
   * Determine if path should be handled by this worker per instructions.md:23
   */
  private shouldHandlePath(pathname: string): boolean {
    // Handle /g/* paths only, let everything else pass through to Short.io
    return pathname.startsWith('/g/') || pathname === '/g';
  }

  /**
   * Check if HTTP method is allowed
   */
  private isAllowedMethod(method: string): boolean {
    return ['GET', 'HEAD'].includes(method.toUpperCase());
  }

  /**
   * Transform Cloudflare Request to internal RedirectRequest
   */
  private transformRequest(request: Request): RedirectRequest {
    const url = new URL(request.url);
    const headers: Record<string, string> = {};

    // Extract headers from Cloudflare Request
    request.headers.forEach((value, key) => {
      headers[key] = value;
    });

    return {
      path: url.pathname,
      method: request.method,
      headers,
    };
  }

  /**
   * Transform internal RedirectResponse to Cloudflare Response
   */
  private transformResponse(redirectResponse: RedirectResponse): Response {
    // Merge standard headers with redirect service headers
    const allHeaders = {
      ...this.getStandardHeaders(),
      ...redirectResponse.headers,
    };

    // Handle successful redirects
    if (redirectResponse.status === 302) {
      const location = redirectResponse.headers['Location'];
      if (!location) {
        return ResponseFactory.createInternalErrorResponse(
          new Error('Redirect missing Location header'),
          this.config.environment !== 'production',
          allHeaders
        );
      }
      return ResponseFactory.createRedirectResponse(location, allHeaders);
    }

    // Handle error responses with JSON body
    if (redirectResponse.error) {
      return ResponseFactory.createErrorResponse(
        redirectResponse.status,
        redirectResponse.error.type,
        redirectResponse.error.message,
        allHeaders
      );
    }

    // Default response
    return new Response(null, {
      status: redirectResponse.status,
      headers: allHeaders,
    });
  }

  /**
   * Create pass-through response for non-/g/* paths per instructions.md:24
   */
  private createPassthroughResponse(): Response {
    return ResponseFactory.createPassthroughResponse(this.getStandardHeaders());
  }

  /**
   * Create Method Not Allowed response
   */
  private createMethodNotAllowedResponse(): Response {
    return ResponseFactory.createMethodNotAllowedResponse(
      ['GET', 'HEAD'],
      this.getStandardHeaders()
    );
  }

  /**
   * Create internal error response
   */
  private createInternalErrorResponse(error: unknown): Response {
    return ResponseFactory.createInternalErrorResponse(
      error,
      this.config.environment !== 'production',
      this.getStandardHeaders()
    );
  }

  /**
   * Get standard response headers used across all responses
   */
  private getStandardHeaders(): Record<string, string> {
    return {
      'X-Gull-Worker': this.config.workerVersion,
      'X-Gull-Map': this.config.mapVersion,
    };
  }
}

/**
 * Factory function to create WorkerHandler with configuration validation
 */
export function createWorkerHandler(config: WorkerConfig): WorkerHandler {
  // Validate configuration
  if (!config.workerVersion || config.workerVersion.trim() === '') {
    throw new Error('Invalid worker configuration: workerVersion is required');
  }

  if (!config.mapVersion || config.mapVersion.trim() === '') {
    throw new Error('Invalid worker configuration: mapVersion is required');
  }

  if (!config.mappingData) {
    throw new Error('Invalid worker configuration: mappingData is required');
  }

  if (
    !['production', 'staging', 'development', 'testing'].includes(
      config.environment
    )
  ) {
    throw new Error(
      'Invalid worker configuration: environment must be production, staging, development, or testing'
    );
  }

  return new WorkerHandlerImpl(config);
}
