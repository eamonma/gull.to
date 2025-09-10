import {
  RedirectService,
  RedirectRequest,
} from '@application/redirect-service';
import { WorkerConfig } from './worker-handler';
import { ResponseFactory } from './response-factory';

/**
 * Diagnostic endpoint handler for health checks and metadata per instructions.md:92-96
 * Separated from main worker handler for better separation of concerns
 */
export class DiagnosticHandler {
  private readonly redirectService: RedirectService;
  private readonly config: WorkerConfig;

  constructor(redirectService: RedirectService, config: WorkerConfig) {
    this.redirectService = redirectService;
    this.config = config;
  }

  /**
   * Check if path is a diagnostic endpoint
   */
  isDiagnosticPath(pathname: string): boolean {
    return pathname === '/g/_health' || pathname.startsWith('/g/_meta/');
  }

  /**
   * Handle diagnostic endpoint requests
   */
  handleDiagnosticRequest(pathname: string): Response {
    const baseHeaders = this.getStandardHeaders();

    if (pathname === '/g/_health') {
      return this.createHealthResponse(baseHeaders);
    }

    if (pathname.startsWith('/g/_meta/')) {
      return this.createMetaResponse(pathname, baseHeaders);
    }

    // Should not reach here due to isDiagnosticPath check
    throw new Error(`Unsupported diagnostic path: ${pathname}`);
  }

  /**
   * Create health check response per instructions.md:94
   */
  private createHealthResponse(headers: Record<string, string>): Response {
    const healthData = {
      status: 'ok',
      worker_version: this.config.workerVersion,
      map_version: this.config.mapVersion,
      timestamp: new Date().toISOString(),
    };

    return ResponseFactory.createJsonResponse(healthData, 200, headers);
  }

  /**
   * Create metadata response for alpha4 code per instructions.md:95
   */
  private createMetaResponse(
    pathname: string,
    headers: Record<string, string>
  ): Response {
    try {
      // Extract alpha4 from path /g/_meta/{alpha4}
      const segments = pathname.split('/');
      const alpha4Raw = segments[3] || '';

      // Create a mock request for the redirect service to process
      const mockRequest: RedirectRequest = {
        path: `/g/${alpha4Raw}`,
        method: 'GET',
        headers: {},
      };

      // Parse the path using redirect service logic
      const parseResult = this.redirectService.parsePath(mockRequest.path);

      if (!parseResult.success) {
        // Return error for invalid alpha4 format
        return ResponseFactory.createErrorResponse(
          400,
          parseResult.error?.type || 'INVALID_INPUT',
          parseResult.error?.message || 'Invalid input',
          headers
        );
      }

      // Look up the alpha4 code
      const alpha4Code = parseResult.alpha4Code;
      if (!alpha4Code) {
        return ResponseFactory.createErrorResponse(
          400,
          'INVALID_ALPHA4_FORMAT',
          'Alpha4 code missing after parse',
          headers
        );
      }
      const lookupResult = this.redirectService.lookupAlpha4(alpha4Code);

      const metaData = {
        input: {
          path: pathname,
          alpha4_code: parseResult.alpha4Code,
        },
        resolved: {
          found: lookupResult.success,
          ...(lookupResult.success && {
            ebird6_code: lookupResult.ebird6Code,
            common_name: lookupResult.mappingRecord?.common_name,
            scientific_name: lookupResult.mappingRecord?.scientific_name,
          }),
          destination_url: this.redirectService.generateBOWUrl(
            lookupResult.success ? (lookupResult.ebird6Code ?? null) : null
          ),
        },
      };

      return ResponseFactory.createJsonResponse(metaData, 200, headers);
    } catch (error) {
      return ResponseFactory.createInternalErrorResponse(
        error,
        this.config.environment !== 'production',
        headers
      );
    }
  }

  /**
   * Get standard response headers
   */
  private getStandardHeaders(): Record<string, string> {
    return {
      'X-Gull-Worker': this.config.workerVersion,
      'X-Gull-Map': this.config.mapVersion,
    };
  }
}
