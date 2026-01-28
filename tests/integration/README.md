# Integration Tests

This directory contains comprehensive integration tests for the n8n-openai Revenium nodes. These tests verify end-to-end functionality including API integrations, node execution, and cross-component interactions.

## Test Structure

### Test Files

- **`setup.ts`** - Common test utilities, mocks, and setup functions
- **`revenium-openai-chat-model.integration.test.ts`** - Tests for ReveniumOpenAIChatModel node
- **`revenium-ai-agent.integration.test.ts`** - Tests for ReveniumAIAgent node  
- **`revenium-api.integration.test.ts`** - Tests for Revenium API communication
- **`end-to-end-workflow.integration.test.ts`** - Complete workflow tests
- **`vitest.integration.config.ts`** - Integration test configuration

### Test Categories

#### 1. Node Integration Tests
- **ReveniumOpenAIChatModel**: Tests OpenAI API integration, streaming, usage tracking
- **ReveniumAIAgent**: Tests n8n node execution, memory integration, tool usage

#### 2. API Integration Tests  
- **Revenium API**: Tests payload construction, authentication, error handling
- **OpenAI API**: Tests model invocation, streaming responses, error scenarios

#### 3. End-to-End Workflow Tests
- **Complete Workflows**: Tests multi-node workflows with memory and tools
- **Error Recovery**: Tests graceful handling of partial failures
- **Performance**: Tests concurrent execution and scalability

## Running Integration Tests

### Prerequisites

```bash
# Install dependencies
npm install

# Set up environment variables (optional for mocked tests)
cp .env.example .env
```

### Test Commands

```bash
# Run all integration tests
npm run test:integration

# Run integration tests in watch mode
npm run test:integration:watch

# Run specific test file
npx vitest tests/integration/revenium-openai-chat-model.integration.test.ts

# Run with coverage
npm run test:integration -- --coverage

# Run all tests (unit + integration)
npm run test:all
```

### Environment Variables

Integration tests use mocked APIs by default, but you can test against real APIs by setting:

```bash
# Optional: Test against real APIs (not recommended for CI)
OPENAI_API_KEY=your-openai-key
REVENIUM_API_KEY=your-revenium-key
REVENIUM_BASE_URL=https://api.revenium.ai

# Test configuration
REVENIUM_LOG_LEVEL=DEBUG
NODE_ENV=test
```

## Test Features

### Comprehensive Mocking
- **OpenAI API**: Mocked responses for chat completions and streaming
- **Revenium API**: Mocked tracking and error responses  
- **n8n Framework**: Mocked execution functions and node parameters
- **Memory & Tools**: Mocked connections and data

### Realistic Scenarios
- **Streaming Responses**: Tests real-time chunk processing
- **Tool Integration**: Tests function calling and tool execution
- **Memory Management**: Tests conversation history and context
- **Error Handling**: Tests API failures and recovery

### Performance Testing
- **Concurrent Execution**: Tests multiple simultaneous workflows
- **Large Payloads**: Tests handling of complex data structures
- **Timeout Scenarios**: Tests timeout handling and recovery

## Test Utilities

### Setup Functions

```typescript
import { 
  setupTestEnvironment,
  createMockExecuteFunctions,
  mockReveniumCredentials,
  setupFetchMock 
} from './setup.js';

// Setup test environment
setupTestEnvironment();

// Create n8n execution context
const mockExecFunctions = createMockExecuteFunctions(inputData);

// Setup API mocking
const fetchMock = setupFetchMock();
```

### Mock Data

```typescript
// Revenium credentials
const credentials = mockReveniumCredentials;

// OpenAI responses
const response = mockOpenAIResponse;

// Streaming chunks
const chunks = mockStreamingResponse;

// Memory connections
const memory = mockMemoryConnection;

// Tool connections  
const tools = mockToolConnections;
```

## Writing New Integration Tests

### Test Template

```typescript
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { setupTestEnvironment, resetMocks } from './setup.js';

describe('New Integration Test', () => {
  beforeEach(() => {
    setupTestEnvironment();
    // Setup test-specific mocks
  });

  afterEach(() => {
    resetMocks();
  });

  it('should test specific integration scenario', async () => {
    // Arrange: Setup mocks and test data
    
    // Act: Execute the functionality
    
    // Assert: Verify expected behavior
  });
});
```

### Best Practices

1. **Use Descriptive Test Names**: Clearly describe what scenario is being tested
2. **Mock External Dependencies**: Use provided mock utilities for consistent testing
3. **Test Error Scenarios**: Include tests for failure cases and error recovery
4. **Verify Side Effects**: Check that tracking, memory, and tool calls occur as expected
5. **Clean Up**: Use `resetMocks()` to ensure test isolation

### Common Patterns

```typescript
// Testing API integration
fetchMock.mockResolvedValue(mockResponse);
const result = await apiFunction();
expect(fetchMock).toHaveBeenCalledWith(expectedUrl, expectedOptions);

// Testing node execution
const mockExecFunctions = createMockExecuteFunctions(inputData);
const result = await node.execute.call(mockExecFunctions);
expect(result[0][0].json).toMatchObject(expectedOutput);

// Testing error handling
fetchMock.mockRejectedValue(new Error('API Error'));
await expect(apiFunction()).rejects.toThrow('API Error');
```

## Debugging Integration Tests

### Verbose Output
```bash
npm run test:integration -- --reporter=verbose
```

### Debug Specific Test
```bash
npx vitest tests/integration/specific-test.ts --reporter=verbose
```

### Environment Debug
```bash
REVENIUM_LOG_LEVEL=DEBUG npm run test:integration
```

### Mock Inspection
```typescript
// Check mock calls
console.log('Fetch calls:', fetchMock.mock.calls);
console.log('Tool calls:', mockTool.call.mock.calls);
```

## CI/CD Integration

Integration tests are designed to run in CI environments:

- **No External Dependencies**: All APIs are mocked by default
- **Deterministic**: Tests produce consistent results
- **Fast Execution**: Optimized for CI performance
- **Comprehensive Coverage**: Tests critical integration paths

Add to your CI pipeline:

```yaml
- name: Run Integration Tests
  run: npm run test:integration
```
