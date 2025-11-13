"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.AzureOpenAiMsOAuth2Api = void 0;
class AzureOpenAiMsOAuth2Api {
    constructor() {
        this.name = 'azureOpenAiMsOAuth2Api';
        this.extends = ['microsoftOAuth2Api'];
        this.displayName = 'Azure OpenAI MS OAuth2 API';
        this.documentationUrl = 'azureopenai';
        this.properties = [
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
            {
                displayName: 'Scope',
                name: 'scope',
                type: 'string',
                required: true,
                default: 'https://cognitiveservices.azure.com/.default',
                placeholder: 'api://<APIM URL>/.default',
                description: 'OAuth2 scope for your API (e.g., api://<APIM URL>/.default or https://cognitiveservices.azure.com/.default)',
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