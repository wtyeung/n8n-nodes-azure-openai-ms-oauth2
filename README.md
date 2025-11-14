# n8n-nodes-azure-openai-ms-oauth2

This is an n8n community node that provides an **Azure OpenAI Chat Model** with **Microsoft OAuth2 authentication** for LangChain workflows in n8n.

Azure OpenAI Service provides REST API access to OpenAI's powerful language models including GPT-4, GPT-4o, and GPT-3.5-Turbo. This node uses Microsoft OAuth2 for secure, enterprise-grade authentication instead of API keys.

**Perfect for Azure API Management (APIM) as an AI Gateway**: This node is designed to work seamlessly with [Azure API Management as an AI Gateway](https://learn.microsoft.com/en-us/azure/api-management/azure-ai-foundry-api), enabling centralized management, monitoring, rate limiting, and security policies for your Azure OpenAI deployments.

[n8n](https://n8n.io/) is a [fair-code licensed](https://docs.n8n.io/sustainable-use-license/) workflow automation platform.

[Installation](#installation)  
[Features](#features)  
[Credentials](#credentials)  
[Compatibility](#compatibility)  
[Usage](#usage)  
[Resources](#resources)

## Installation

**⚠️ Self-Hosted n8n Required**: This node requires a self-hosted n8n instance as it depends on `@langchain/openai` and `langchain` packages. n8n Cloud does not support community nodes with external dependencies.

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

For self-hosted n8n:
```bash
npm install n8n-nodes-azure-openai-ms-oauth2
```

Or install directly in n8n:
1. Go to **Settings** > **Community Nodes**
2. Select **Install**
3. Enter `n8n-nodes-azure-openai-ms-oauth2`
4. Agree to the risks and install

## Features

### LangChain Chat Model
- **AI Agent Integration**: Use as a language model in AI Agent workflows
- **LangChain Chains**: Compatible with all LangChain chain types
- **Streaming Support**: Real-time response streaming
- **Model Parameters**: Full control over temperature, max tokens, penalties, etc.
- **OAuth2 Security**: Enterprise-grade authentication with automatic token refresh

### Azure API Management (APIM) AI Gateway Support
This node is specifically designed for APIM AI Gateway scenarios where:
- **n8n sends JWT token** → APIM validates the OAuth2 JWT in `api-key` header
- **APIM authenticates to Azure OpenAI** → APIM uses its own credentials (API key or managed identity)
- **Centralized Management**: Route requests through APIM for unified API governance
- **Advanced Monitoring**: Track usage, performance, and costs across all AI services
- **Rate Limiting & Quotas**: Implement usage policies and prevent overages
- **Security Policies**: JWT validation, IP filtering, and request validation at APIM layer
- **Load Balancing**: Distribute requests across multiple Azure OpenAI instances
- **Custom OAuth2 Scopes**: Use your organization's custom API scopes (e.g., `api://your-app-id/.default`)

## Credentials

To use this node, you need:

### Prerequisites
1. An Azure subscription
2. Azure OpenAI resource created in Azure Portal
3. A deployed model (e.g., GPT-4, GPT-3.5-Turbo)
4. Azure AD app registration with appropriate permissions

### Setting up Microsoft OAuth2 credentials

1. **Register an Azure AD Application**:
   - Go to Azure Portal > Azure Active Directory > App registrations
   - Create a new registration
   - Note the Application (client) ID and Directory (tenant) ID

2. **Expose an API**:
   - In your app registration, go to "Expose an API"
   - Add an Application ID URI (e.g., `api://12345678-1234-1234-1234-123456789abc`)
   - Add a scope (e.g., `user_impersonation`) or use the default `.default` scope
   - This creates the scope: `api://<your-app-id>/.default`

3. **Create Client Secret**:
   - In your app registration, go to Certificates & secrets
   - Create a new client secret and save it securely

4. **Configure n8n Credentials**:
   - Credential Type: `Azure OpenAI MS OAuth2 API`
   - **API Scope**: Your Azure AD application scope in format `api://<your-app-id>/.default`
     - Example: `api://12345678-1234-1234-1234-123456789abc/.default`
     - This must match the API exposed in your Azure AD app registration
     - The JWT token's `aud` (audience) claim will be set to this value
   - **Endpoint**: Your APIM gateway base URL (without trailing slash)
     - Example: `https://your-apim.azure-api.net/aiProject`
     - This is your APIM API path, NOT the Azure OpenAI endpoint
     - APIM will rewrite this to the actual Azure OpenAI backend endpoint
   - **API Version**: `2025-03-01-preview` (default, or use your preferred version)
   - **Client ID**: Your Azure AD application ID
   - **Client Secret**: Your Azure AD client secret
   - **Tenant ID**: Your Azure AD tenant ID

5. **APIM Configuration**:
   - Configure APIM to validate the JWT token in the `api-key` header
   - Set up APIM policies to validate the `aud` claim matches your API scope
   - Configure APIM backend to point to your Azure OpenAI resource
   - APIM will rewrite the URL from your APIM path to the Azure OpenAI endpoint
   - Example flow:
     - n8n calls: `https://your-apim.azure-api.net/aiProject/deployments/gpt-4/chat/completions`
     - APIM extracts JWT from `api-key` header and validates it
     - APIM rewrites to: `https://your-resource.openai.azure.com/openai/deployments/gpt-4/chat/completions`
     - APIM replaces `api-key` header with actual Azure OpenAI credentials
   - The node sends: `api-key: <jwt-token>`
   - APIM validates the JWT and forwards requests to Azure OpenAI with its own credentials

## Compatibility

- **Self-hosted n8n only** (not compatible with n8n Cloud)
- Minimum n8n version: 1.0.0
- Tested with n8n version: 1.119.1+
- Requires LangChain support in n8n
- Requires `@langchain/openai` and `langchain` packages (installed as peer dependencies)

## Usage

### Using with AI Agent

1. Add an **AI Agent** node to your workflow
2. In the AI Agent configuration, add a **Language Model**
3. Select **Azure OpenAI Chat Model (MS OAuth2)**
4. Configure your credentials
5. Set the **Deployment Name** parameter to your Azure OpenAI deployment name (e.g., `gpt-4-deployment`)
   - This is the deployment name configured in your Azure OpenAI resource, NOT the model name
6. Adjust options as needed:
   - **Frequency Penalty**: Reduces repetition (-2 to 2, default: 0)
   - **Maximum Number of Tokens**: Max tokens to generate (default: -1 for model default, max: 128000)
   - **Max Retries**: Number of retry attempts on failure (default: 2)
   - **Presence Penalty**: Encourages new topics (-2 to 2, default: 0)
   - **Response Format**: Choose between Text or JSON output
     - **Text**: Regular text response (default)
     - **JSON**: Enables JSON mode for structured output (requires "json" in prompt, use with models post-Nov 2023)
   - **Temperature**: Controls randomness (0-2, default: 0.7)
   - **Timeout (Ms)**: Request timeout in milliseconds (default: 60000)
   - **Top P**: Nucleus sampling (0-1, default: 1)

### Using with LangChain Chains

1. Add a **Chain** node (e.g., "Conversation Chain", "Question and Answer Chain")
2. Connect the **Azure OpenAI Chat Model (MS OAuth2)** as the language model
3. Configure your chain logic
4. The model will be used for all LLM operations in the chain

### Example: Simple AI Agent

```
[Manual Trigger] → [AI Agent]
                      ↓
         [Azure OpenAI Chat Model (MS OAuth2)]
                      ↓
                  [Output]
```

The AI Agent can use your Azure OpenAI deployment with OAuth2 authentication for secure, enterprise-grade AI workflows.

## Resources

* [n8n community nodes documentation](https://docs.n8n.io/integrations/#community-nodes)
* [Azure OpenAI Service documentation](https://learn.microsoft.com/en-us/azure/ai-services/openai/)
* [Azure OpenAI REST API reference](https://learn.microsoft.com/en-us/azure/ai-services/openai/reference)
* [Azure API Management as AI Gateway](https://learn.microsoft.com/en-us/azure/api-management/azure-ai-foundry-api)
* [Configure OAuth2 with Azure AD](https://learn.microsoft.com/en-us/azure/active-directory/develop/v2-oauth2-auth-code-flow)
