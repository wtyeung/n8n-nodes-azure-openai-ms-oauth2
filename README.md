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

Follow the [installation guide](https://docs.n8n.io/integrations/community-nodes/installation/) in the n8n community nodes documentation.

## Features

### LangChain Chat Model
- **AI Agent Integration**: Use as a language model in AI Agent workflows
- **LangChain Chains**: Compatible with all LangChain chain types
- **Streaming Support**: Real-time response streaming
- **Model Parameters**: Full control over temperature, max tokens, penalties, etc.
- **OAuth2 Security**: Enterprise-grade authentication with automatic token refresh

### Azure API Management (APIM) AI Gateway Support
- **Centralized Management**: Route requests through APIM for unified API governance
- **Advanced Monitoring**: Track usage, performance, and costs across all AI services
- **Rate Limiting & Quotas**: Implement usage policies and prevent overages
- **Security Policies**: Add authentication, IP filtering, and request validation
- **Load Balancing**: Distribute requests across multiple Azure OpenAI instances
- **Custom Endpoints**: Use your organization's APIM gateway URL with custom OAuth2 scopes

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

2. **Configure API Permissions**:
   - Add `Cognitive Services` API permissions
   - Grant `https://cognitiveservices.azure.com/.default` scope

3. **Create Client Secret**:
   - In your app registration, go to Certificates & secrets
   - Create a new client secret and save it securely

4. **Configure n8n Credentials**:
   - Credential Type: `Azure OpenAI MS OAuth2 API`
   - **Endpoint**: Your API endpoint with trailing slash
     - Direct Azure OpenAI: `https://<resource-name>.openai.azure.com/`
     - APIM AI Gateway: `https://<apim-gateway-url>/aiProject/`
   - **API Version**: `2025-03-01-preview` (default, or use your preferred version)
   - **Scope**: Your OAuth2 scope
     - Direct Azure OpenAI: `https://cognitiveservices.azure.com/.default`
     - APIM with custom scope: `api://<your-app-id>/.default`
   - **Client ID**: Your Azure AD application ID
   - **Client Secret**: Your Azure AD client secret
   - **Tenant ID**: Your Azure AD tenant ID

   The node will construct the full URL as: `{endpoint}openai/deployments/{model}/chat/completions?api-version={apiVersion}`

   **Note**: When using APIM as an AI Gateway, the JWT token's `aud` (audience) claim will match your configured scope. Ensure your APIM policies validate this audience claim.

## Compatibility

- Minimum n8n version: 1.0.0
- Tested with n8n version: 1.119.1+
- Requires LangChain support in n8n

## Usage

### Using with AI Agent

1. Add an **AI Agent** node to your workflow
2. In the AI Agent configuration, add a **Language Model**
3. Select **Azure OpenAI Chat Model (MS OAuth2)**
4. Configure your credentials
5. Set the **Model** parameter to your deployment name (e.g., `gpt-4`)
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
