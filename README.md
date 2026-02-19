# Revenium AI Agent for n8n

[![npm version](https://img.shields.io/npm/v/n8n-nodes-revenium.svg)](https://www.npmjs.com/package/n8n-nodes-revenium)
[![Node.js](https://img.shields.io/badge/Node.js-18%2B-green)](https://nodejs.org/)
[![n8n](https://img.shields.io/badge/n8n-community%20node-orange)](https://n8n.io)
[![Documentation](https://img.shields.io/badge/docs-revenium.io-blue)](https://docs.revenium.io)
[![Website](https://img.shields.io/badge/website-revenium.ai-blue)](https://www.revenium.ai)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

**Drop-in replacement for n8n AI Agent with automatic Revenium usage tracking**

A drop-in replacement for the standard n8n AI Agent with all the same capabilities, plus automatic AI cost tracking powered by [Revenium](https://www.revenium.ai). Track costs by customer, agent, or task. Enable usage-based billing and spending alerts to ensure you're never surprised by unexpected AI costs.

## Overview

This custom node provides seamless integration between OpenAI's ChatCompletion API and Revenium's AI cost tracking & alerting platform. Track AI costs in n8n by customer, agent, task, and more. Extend cost-tracking into usage-based billing with automatic Stripe integration.

## Features

- **OpenAI ChatCompletion Integration**: Full support for OpenAI's chat completion API
- **Automatic Revenium Tracking**: Fire-and-forget usage tracking with Revenium
- **Token Usage Monitoring**: Tracks prompt tokens, completion tokens, and total usage
- **Cost & Performance Metrics**: Monitors request duration and response times
- **Transparent Workflow Integration**: Returns OpenAI responses immediately while tracking usage asynchronously

## Quick Start

### **Installation**

For detailed instructions, see the [official n8n community nodes installation guide](https://docs.n8n.io/integrations/community-nodes/installation/).

#### **Method 1: [GUI Installation](https://docs.n8n.io/integrations/community-nodes/installation/gui-install/) (Recommended)**

1. Go to **Settings** > **Community Nodes**
2. Select **Install**
3. Enter the npm package name: `n8n-nodes-revenium`
4. Agree to the risks of installing unverified community nodes
5. Select **Install**
6. Search for "Revenium" in the node panel

#### **Method 2: Manual Installation**

```bash
# Navigate to your n8n custom nodes directory
cd ~/.n8n/custom
npm install n8n-nodes-revenium
# Restart n8n
```

See [manual installation guide](https://docs.n8n.io/integrations/community-nodes/installation/manual-install/) for details.

#### **Method 3: Docker Deployment**

```dockerfile
FROM n8nio/n8n:latest
USER root
RUN npm install -g n8n-nodes-revenium
USER node
```

**Note**: Community node installation from npm is only available on self-hosted n8n instances.

### **Verify Installation**

After installation, verify the nodes are available:

1. **Restart n8n** (if not done automatically)
2. **Open n8n** in your browser
3. **Search for "Revenium"** in the node panel
4. **You should see**:
   - **Revenium AI Agent** (drop-in replacement for n8n AI Agent)
   - **Revenium OpenAI Chat Model** (with automatic usage tracking)

## Configuration

### Credentials Setup

#### **Required Credentials:**

1. **OpenAI API Key**:
   - Get from [OpenAI Platform](https://platform.openai.com/api-keys)
   - Ensure it has access to the models you want to use

2. **Revenium API Key**:
   - Sign up at [Revenium](https://www.revenium.ai) for AI cost tracking
   - Get your API key from the Revenium dashboard
   - Free tier available for getting started

#### **Setting Up Credentials in n8n:**

1. **Go to**: n8n → Credentials → Add Credential
2. **Search for**: "Revenium OpenAI"
3. **Enter**:
   - **OpenAI API Key**: Your OpenAI key
   - **OpenAI Base URL**: Leave default (`https://api.openai.com/v1`) unless using Azure OpenAI or custom endpoint
   - **Revenium API Key**: Your Revenium key
   - **Revenium Metering Base URL**: Leave default (`https://api.revenium.ai`) unless using custom instance

### Node Parameters

- The Revenium n8n Agent is a drop in replacement for the standard n8n AI Agent. It has the same parameters and functionality, with the addition of Revenium credentials to enable metadata tracking in Revenium for all AI operations.

## Usage

### Quick Setup for Chat Conversations

1. **Add a Chat Trigger**: Search for "When chat message received" and add it to your workflow
2. **Add Revenium AI Agent**: Search for "Revenium AI Agent" and connect it to the Chat Trigger
3. **Add Revenium OpenAI Chat Model**: Connect it to the "Chat Model\*" input on the AI Agent
4. **Configure credentials**: Set up your OpenAI and Revenium API keys in the Chat Model
5. **Activate workflow**: Your AI Agent is now ready for chat conversations!

### What You Get

- **Automatic chat handling**: Users send messages → AI responds intelligently
- **Transparent Revenium tracking**: All OpenAI usage automatically tracked in background
- **Memory support**: Add a Memory node to maintain conversation history
- **Tool integration**: Connect Tools for enhanced AI capabilities (Calculator, Wikipedia, etc.)

### Workflow Structure

```
When chat message received → Revenium AI Agent → [Response to user]
                                   ↓
                          Revenium OpenAI Chat Model
                                   ↓
                               [Memory] (optional)
                                   ↓
                                [Tools] (optional)
```

## Output

The Revenium AI Agent returns:

```json
{
  "response": "The AI response content",
  "message": "The AI response content",
  "full_response": {...},
  "tool_calls": [],
  "revenium_tracking": "Chat model automatically tracked via Revenium OpenAI Chat Model",
  "conversation_saved": true,
  "tools_executed": 0
}
```

## Tool Metering

Track execution of custom tools and external API calls with automatic timing, error handling, and metadata collection.

### Quick Example

```typescript
import { meterTool, setToolContext } from "n8n-nodes-revenium";

// Set context once (propagates to all tool calls)
setToolContext({
  agent: "my-agent",
  traceId: "session-123"
});

// Wrap tool execution
const result = await meterTool("weather-api", async () => {
  return await fetch("https://api.example.com/weather");
}, {
  operation: "get_forecast",
  outputFields: ["temperature", "humidity"]
});
// Automatically extracts temperature & humidity from result
```

### Functions

**meterTool(toolId, fn, metadata?)**
- Wraps a function with automatic metering
- Captures duration, success/failure, and errors
- Returns function result unchanged

**reportToolCall(toolId, report)**
- Manually report a tool call that was already executed
- Useful when wrapping isn't possible

**Context Management**
- `setToolContext(ctx)` - Set context for all subsequent tool calls
- `getToolContext()` - Get current context
- `clearToolContext()` - Clear context
- `runWithToolContext(ctx, fn)` - Run function with scoped context

### Metadata Options

| Field | Description |
|-------|-------------|
| `operation` | Tool operation name (e.g., "search", "scrape") |
| `outputFields` | Array of field names to auto-extract from result |
| `usageMetadata` | Custom metrics (e.g., tokens, results count) |
| `agent`, `traceId`, etc. | Context fields (inherited from setToolContext) |

## Troubleshooting

### Node Not Appearing in n8n

1. **Restart n8n** after installation
2. **Hard refresh your browser** (Ctrl+Shift+R / Cmd+Shift+R)
3. **Check installation**: In n8n → Settings → Community Nodes
4. **Verify package**: `npm list n8n-nodes-revenium` in your n8n directory

### OpenAI API Errors

- Verify your OpenAI API key is valid and has sufficient credits
- Check the model name matches OpenAI's available models
- Ensure your API key has access to the selected model

### Revenium Tracking Issues

- **Verify credentials**: Check your Revenium API key is correct
- **Check connectivity**: Ensure n8n can reach `https://api.revenium.ai`
- **Review logs**: Check n8n logs for Revenium API error messages
- **Test separately**: Verify your Revenium API key works outside n8n

### Getting Help

- **Documentation**: [Revenium Documentation](https://docs.revenium.io)
- **Support**: Contact Revenium support for API key or tracking issues
- **Community**: [n8n Community Forum](https://community.n8n.io) for general n8n questions

## Documentation

For detailed documentation, visit [docs.revenium.io](https://docs.revenium.io)

## Security

Report security vulnerabilities to **support@revenium.io** (do not create public issues).

## License

This project is licensed under the MIT License - see the [LICENSE](https://github.com/revenium/revenium-middleware-openai-n8n/blob/HEAD/LICENSE) file for details.

## Support

For issues, feature requests, or contributions:

- **Website**: [www.revenium.ai](https://www.revenium.ai)
- **GitHub Repository**: [revenium/revenium-middleware-openai-n8n](https://github.com/revenium/revenium-middleware-openai-n8n)
- **Issues**: [Report bugs or request features](https://github.com/revenium/revenium-middleware-openai-n8n/issues)
- **Documentation**: [docs.revenium.io](https://docs.revenium.io)
- **Email**: support@revenium.io

---

**Built by Revenium**
