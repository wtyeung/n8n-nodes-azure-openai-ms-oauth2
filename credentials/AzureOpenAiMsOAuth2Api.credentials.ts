import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class AzureOpenAiMsOAuth2Api implements ICredentialType {
	name = 'azureOpenAiMsOAuth2Api';

	extends = ['microsoftOAuth2Api'];

	displayName = 'Azure OpenAI MS OAuth2 API';

	documentationUrl = 'https://github.com/wtyeung/n8n-nodes-azure-openai-ms-oauth2';

	icon = 'file:azure-openai.svg' as const;

	properties: INodeProperties[] = [
		{
			displayName: 'Scope',
			name: 'scope',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'api://<APIM URL>/.default',
			description: 'OAuth2 scope for your Azure AD application. Must match the API exposed in your app registration (format: api://<your-app-id>/.default)',
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

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				Authorization: '=Bearer {{$credentials.oauthTokenData.access_token}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.endpoint}}',
			url: '=openai/deployments?api-version={{$credentials.apiVersion}}',
			method: 'GET',
		},
	};
}
