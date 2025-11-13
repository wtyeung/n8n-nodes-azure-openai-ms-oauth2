"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AzureOpenAiMsOAuth2Api = void 0;
class AzureOpenAiMsOAuth2Api {
    constructor() {
        this.name = 'azureOpenAiMsOAuth2Api';
        this.extends = ['microsoftOAuth2Api'];
        this.displayName = 'Azure OpenAI MS OAuth2 API';
        this.documentationUrl = 'https://github.com/wtyeung/n8n-nodes-azure-openai-ms-oauth2';
        this.icon = 'file:azure-openai.svg';
        this.properties = [
            {
                displayName: 'Scope',
                name: 'scope',
                type: 'string',
                required: true,
                default: 'api://YOUR-APP-ID-HERE/.default',
                placeholder: 'api://12345678-1234-1234-1234-123456789abc/.default',
                description: 'REQUIRED: Replace YOUR-APP-ID-HERE with your actual Azure AD application ID. Format: api://<your-app-id>/.default',
            },
            {
                displayName: 'Endpoint',
                name: 'endpoint',
                type: 'string',
                required: true,
                default: '',
                placeholder: 'https://<APIM URL>/aiProject/',
                description: 'The base endpoint URL for your Azure OpenAI service (with trailing slash)',
            },
            {
                displayName: 'API Version',
                name: 'apiVersion',
                type: 'string',
                required: true,
                default: '2025-03-01-preview',
                description: 'The API version to use for Azure OpenAI',
            },
        ];
        this.authenticate = {
            type: 'generic',
            properties: {
                headers: {
                    Authorization: '=Bearer {{$credentials.oauthTokenData.access_token}}',
                },
            },
        };
        this.test = {
            request: {
                baseURL: '={{$credentials.endpoint}}',
                url: '=openai/deployments?api-version={{$credentials.apiVersion}}',
                method: 'GET',
            },
        };
    }
}
exports.AzureOpenAiMsOAuth2Api = AzureOpenAiMsOAuth2Api;
//# sourceMappingURL=AzureOpenAiMsOAuth2Api.credentials.js.map