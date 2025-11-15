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
			type: 'hidden',
			default: '={{$self.apiScope.includes("offline_access") ? $self.apiScope : "offline_access " + $self.apiScope}}',
		},
		{
			displayName: 'API Scope',
			name: 'apiScope',
			type: 'string',
			required: true,
			default: 'api://REPLACE-WITH-YOUR-APP-ID/.default',
			placeholder: 'api://12345678-1234-1234-1234-123456789abc/.default',
			description: '⚠️ REQUIRED: Enter your Azure AD application scope. Format: api://<your-app-id>/.default. Note: offline_access is automatically added for token refresh.',
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
		{
			displayName: 'Token Refresh Buffer (seconds)',
			name: 'refreshBeforeExpirySeconds',
			type: 'number',
			typeOptions: {
				minValue: 60,
				maxValue: 3600,
			},
			default: 900,
			description: 'How many seconds before token expiry to proactively refresh the token. This prevents the token from expiring in the middle of a workflow execution. Default: 900 (15 minutes). Range: 60-3600.',
			placeholder: '900',
			hint: 'Set based on your workflow duration: Long workflows (30-60 min) → 1800-3600, Quick workflows (5-10 min) → 300-600. This ensures the token stays valid throughout the entire workflow.',
			noDataExpression: true,
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
