import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class AzureOpenAiApiKeyApi implements ICredentialType {
	name = 'azureOpenAiApiKeyApi';

	displayName = 'Azure OpenAI API Key API';

	documentationUrl = 'https://github.com/wtyeung/n8n-nodes-azure-openai-ms-oauth2';

	icon = 'file:azure-openai.svg' as const;

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: { password: true },
			required: true,
			default: '',
			description: 'The API key for your Azure OpenAI resource or APIM gateway',
			noDataExpression: true,
		},
		{
			displayName: 'Endpoint',
			name: 'endpoint',
			type: 'string',
			required: true,
			default: '',
			placeholder: 'https://your-resource.openai.azure.com/',
			description: 'The base endpoint URL for your Azure OpenAI service or APIM gateway (with trailing slash)',
			hint: 'Example: https://your-resource.openai.azure.com/ or https://your-apim.azure-api.net/aiProject/',
			noDataExpression: true,
		},
		{
			displayName: 'API Version',
			name: 'apiVersion',
			type: 'string',
			required: true,
			default: '2025-03-01-preview',
			description: 'The API version to use for Azure OpenAI',
			noDataExpression: true,
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'api-key': '={{$credentials.apiKey}}',
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
