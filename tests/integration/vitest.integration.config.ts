/**
 * Vitest configuration specifically for integration tests
 * Provides longer timeouts and specific setup for integration testing
 */

import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    setupFiles: ['dotenv/config'],
    include: ['tests/integration/**/*.integration.test.ts'],
    exclude: ['node_modules', 'dist', 'tests/unit/**/*', 'tests/*.test.ts'],
    testTimeout: 15000, // 15 seconds for integration tests
    hookTimeout: 5000, // 5 seconds for setup/teardown
    teardownTimeout: 3000, // 3 seconds for cleanup
    pool: 'threads',
    poolOptions: {
      threads: {
        singleThread: true,
        maxThreads: 1,
        minThreads: 1
      }
    },
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/**',
        'dist/**',
        'tests/**',
        '**/*.d.ts',
        '**/*.config.*',
        '**/coverage/**'
      ],
      include: [
        'src/**/*.ts',
        'nodes/**/*.ts'
      ],
      thresholds: {
        global: {
          branches: 70,
          functions: 70,
          lines: 70,
          statements: 70
        }
      }
    },
    reporters: ['verbose'],
    logHeapUsage: true,
    isolate: true, // Ensure test isolation
    sequence: {
      shuffle: false, // Keep deterministic order for integration tests
      concurrent: false // Run integration tests sequentially for stability
    }
  },
  esbuild: {
    target: 'node18'
  }
});
