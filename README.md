# gull.to Bird Species Redirect System

A TypeScript Cloudflare Worker that redirects `gull.to/g/{alpha4}` paths to Birds of the World species pages.

## Architecture

Clean architecture with strict separation of concerns:

- `src/domain/` - Core business logic and entities
- `src/application/` - Use cases and application services  
- `src/infrastructure/` - External adapters (HTTP, storage)
- `src/etl/` - Extract-Transform-Load pipeline for bird data

## Development

```bash
# Install dependencies
npm install

# Run tests with watch mode
npm run test:watch

# Type checking
npm run typecheck

# Code quality
npm run lint
npm run format

# Local development
npm run dev

# Build and validate
npm run validate
```

## Testing Strategy

- **Unit Tests**: Pure functions and business logic
- **Integration Tests**: ETL pipeline and data transformations
- **Contract Tests**: API responses and data schemas
- **Coverage**: 80% minimum across all metrics

## Data Pipeline

1. **Input**: eBird taxonomy CSV + IBP-AOS alpha codes CSV
2. **Join**: Scientific name matching with normalization
3. **Transform**: Canonical JSON mapping format
4. **Bundle**: Static data embedded in Worker
5. **Deploy**: Versioned releases with rollback capability