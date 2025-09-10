import {
  MappingRecord,
  Alpha4Code,
  EBirdCode,
  isValidAlpha4Code,
} from '@domain/types';

// Request/Response interfaces for clean contracts
export interface RedirectRequest {
  readonly path: string;
  readonly method: string;
  readonly headers: Record<string, string>;
}

export interface RedirectResponse {
  readonly status: number;
  readonly headers: Record<string, string>;
  readonly redirectType?: 'success' | 'unknown';
  readonly error?: {
    readonly type: string;
    readonly message: string;
  };
}

// Path parsing result with comprehensive error handling
export interface PathParseResult {
  readonly success: boolean;
  readonly namespace?: string;
  readonly alpha4Code?: Alpha4Code;
  readonly error?: {
    readonly type:
      | 'INVALID_NAMESPACE'
      | 'INVALID_ALPHA4_FORMAT'
      | 'MALFORMED_PATH';
    readonly message: string;
  };
}

// Lookup result for alpha4 → eBird6 resolution
export interface LookupResult {
  readonly success: boolean;
  readonly ebird6Code?: EBirdCode;
  readonly mappingRecord?: MappingRecord;
  readonly error?: {
    readonly type: 'UNKNOWN_ALPHA4_CODE';
    readonly message: string;
  };
}

// Service statistics for observability
export interface ServiceStats {
  readonly totalLookups: number;
  readonly successfulLookups: number;
  readonly unknownLookups: number;
  readonly totalRequests: number;
  readonly successfulRedirects: number;
  readonly errorResponses: number;
}

interface MutableServiceStats {
  totalLookups: number;
  successfulLookups: number;
  unknownLookups: number;
  totalRequests: number;
  successfulRedirects: number;
  errorResponses: number;
}

// Service configuration
export interface RedirectServiceConfig {
  readonly workerVersion: string;
  readonly mapVersion: string;
}

/**
 * Core redirect service implementing business logic per instructions.md:49-117
 */
export class RedirectService {
  private readonly mappingLookup: Map<string, MappingRecord>;
  private readonly config: RedirectServiceConfig;
  private readonly stats: MutableServiceStats;

  constructor(
    mappingData: readonly MappingRecord[],
    config: RedirectServiceConfig
  ) {
    this.config = config;

    // Build efficient lookup map for O(1) alpha4 → mapping resolution
    this.mappingLookup = new Map();
    for (const record of mappingData) {
      this.mappingLookup.set(record.alpha4, record);
    }

    // Initialize statistics
    this.stats = {
      totalLookups: 0,
      successfulLookups: 0,
      unknownLookups: 0,
      totalRequests: 0,
      successfulRedirects: 0,
      errorResponses: 0,
    };
  }

  /**
   * Parse and validate paths per instructions.md:49-54
   * Handles /g/{alpha4} format with normalization and validation
   */
  parsePath(path: string): PathParseResult {
    if (!path || typeof path !== 'string') {
      return {
        success: false,
        error: {
          type: 'MALFORMED_PATH',
          message: 'Path is required and must be a string',
        },
      };
    }

    // Remove query string per instructions.md:53, but preserve structure for parsing
    const pathWithoutQuery = path.split('?')[0]!;

    // Parse path segments (don't filter empty segments yet to detect /g/ case)
    const allSegments = pathWithoutQuery.split('/');
    const segments = allSegments.filter((s) => s.length > 0);

    if (segments.length === 0) {
      return {
        success: false,
        error: {
          type: 'MALFORMED_PATH',
          message: 'Empty path provided',
        },
      };
    }

    if (segments.length === 1 && segments[0] === 'g') {
      // Handle /g/ case - treat as having empty alpha4 code
      const alpha4Raw = '';
      const alpha4Normalized = alpha4Raw.toUpperCase();

      // Validate alpha4 format per instructions.md:58
      if (!isValidAlpha4Code(alpha4Normalized)) {
        return {
          success: false,
          error: {
            type: 'INVALID_ALPHA4_FORMAT',
            message: `Invalid alpha4 code format: empty. Must be exactly 4 letters A-Z.`,
          },
        };
      }
    }

    if (segments.length < 2) {
      return {
        success: false,
        error: {
          type: 'MALFORMED_PATH',
          message: 'Path must be in format /g/{alpha4}',
        },
      };
    }

    const [namespace, alpha4Raw] = segments;

    // Validate namespace per instructions.md:51
    if (namespace !== 'g') {
      return {
        success: false,
        error: {
          type: 'INVALID_NAMESPACE',
          message: `Invalid namespace: ${namespace}. Only 'g' is supported.`,
        },
      };
    }

    // Normalize to uppercase per instructions.md:57
    const alpha4Normalized = (alpha4Raw || '').toUpperCase();

    // Validate alpha4 format per instructions.md:58
    if (!isValidAlpha4Code(alpha4Normalized)) {
      return {
        success: false,
        error: {
          type: 'INVALID_ALPHA4_FORMAT',
          message: `Invalid alpha4 code format: ${alpha4Raw || 'empty'}. Must be exactly 4 letters A-Z.`,
        },
      };
    }

    return {
      success: true,
      namespace,
      alpha4Code: alpha4Normalized as Alpha4Code,
    };
  }

  /**
   * Lookup alpha4 code in mapping data per instructions.md:62-66
   */
  lookupAlpha4(alpha4: Alpha4Code): LookupResult {
    // Update statistics
    this.stats.totalLookups++;

    const mappingRecord = this.mappingLookup.get(alpha4);

    if (!mappingRecord) {
      this.stats.unknownLookups++;
      return {
        success: false,
        error: {
          type: 'UNKNOWN_ALPHA4_CODE',
          message: `Unknown alpha4 code: ${alpha4}`,
        },
      };
    }

    this.stats.successfulLookups++;
    return {
      success: true,
      ebird6Code: mappingRecord.ebird6,
      mappingRecord,
    };
  }

  /**
   * Generate BOW URL from eBird6 code per instructions.md:65
   */
  generateBOWUrl(ebird6Code: EBirdCode | null): string {
    if (!ebird6Code) {
      // Return BOW home for unknown codes per instructions.md:75
      return 'https://birdsoftheworld.org/';
    }

    // Use destination template per instructions.md:65
    return `https://birdsoftheworld.org/bow/species/${ebird6Code}`;
  }

  /**
   * Process complete redirect request per instructions.md:68-73
   */
  processRedirect(request: RedirectRequest): RedirectResponse {
    // Update request statistics
    this.stats.totalRequests++;

    try {
      // Parse the request path
      const parseResult = this.parsePath(request.path);

      if (!parseResult.success) {
        this.stats.errorResponses++;
        return {
          status: 400,
          headers: this.getStandardHeaders(),
          error: {
            type: parseResult.error?.type ?? 'INVALID_INPUT',
            message: parseResult.error?.message ?? 'Invalid input',
          },
        };
      }

      // Lookup the alpha4 code
      const alpha4Code = parseResult.alpha4Code;
      if (!alpha4Code) {
        this.stats.errorResponses++;
        return {
          status: 400,
          headers: this.getStandardHeaders(),
          error: {
            type: 'INVALID_ALPHA4_FORMAT',
            message: 'Alpha4 code missing after parse',
          },
        };
      }
      const lookupResult = this.lookupAlpha4(alpha4Code);

      let destinationUrl: string;
      let redirectType: 'success' | 'unknown';

      if (lookupResult.success) {
        // Successful lookup - redirect to specific BOW species page
        destinationUrl = this.generateBOWUrl(lookupResult.ebird6Code ?? null);
        redirectType = 'success';
        this.stats.successfulRedirects++;
      } else {
        // Unknown code - redirect to BOW home per instructions.md:75
        destinationUrl = this.generateBOWUrl(null);
        redirectType = 'unknown';
        this.stats.successfulRedirects++; // Still a successful redirect, just to fallback
      }

      return {
        status: 302, // Temporary redirect per instructions.md:70
        headers: {
          ...this.getStandardHeaders(),
          Location: destinationUrl,
          'Cache-Control': 'private, max-age=0', // Per instructions.md:70
        },
        redirectType,
      };
    } catch (error) {
      this.stats.errorResponses++;
      return {
        status: 500,
        headers: this.getStandardHeaders(),
        error: {
          type: 'INTERNAL_ERROR',
          message: `Internal server error: ${String(error)}`,
        },
      };
    }
  }

  /**
   * Get standard response headers per instructions.md:85-88
   */
  private getStandardHeaders(): Record<string, string> {
    return {
      'X-Gull-Worker': this.config.workerVersion,
      'X-Gull-Map': this.config.mapVersion,
    };
  }

  /**
   * Get service statistics for observability
   */
  getStats(): ServiceStats {
    return { ...this.stats }; // Return immutable copy
  }
}
