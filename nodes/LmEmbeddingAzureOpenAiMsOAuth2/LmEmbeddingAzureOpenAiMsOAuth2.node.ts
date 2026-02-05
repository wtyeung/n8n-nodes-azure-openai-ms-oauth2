import type { INodeType, INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class LmEmbeddingAzureOpenAiMsOAuth2 implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Azure OpenAI Embedding (MS OAuth2)',
		name: 'lmEmbeddingAzureOpenAiMsOAuth2',
		icon: 'file:azure-openai.svg',
		group: ['transform'],
		version: 1,
		subtitle: '=Generate Embeddings',
		description: 'Generate embeddings using Azure OpenAI with Microsoft OAuth2 authentication',
		defaults: {
			name: 'Azure OpenAI Embedding (MS OAuth2)',
		},
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Embeddings'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://github.com/wtyeung/n8n-nodes-azure-openai-ms-oauth2',
					},
				],
			},
		},
		usableAsTool: true,
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		credentials: [
			{
				name: 'azureOpenAiMsOAuth2Api',
				required: true,
			},
		],
		requestDefaults: {
			baseURL: '={{$credentials.endpoint}}',
			headers: {
				Accept: 'application/json',
				'Content-Type': 'application/json',
				'api-key': '={{$credentials.oauthTokenData.access_token}}',
				Authorization: '=Bearer {{$credentials.oauthTokenData.access_token}}',
			},
		},
		properties: [
			{
				displayName: 'Deployment Name',
				name: 'deploymentName',
				type: 'string',
				default: '',
				required: true,
				description: 'The deployment name you chose when you deployed the embedding model in Azure OpenAI',
				placeholder: 'text-embedding-3-small',
			},
			{
				displayName: 'Text',
				name: 'text',
				type: 'string',
				default: '',
				required: true,
				description: 'The text to generate embeddings for',
				typeOptions: {
					rows: 4,
				},
				routing: {
					request: {
						method: 'POST',
						url: '=/openai/deployments/{{$parameter.deploymentName}}/embeddings',
						qs: {
							'api-version': '={{$credentials.apiVersion}}',
						},
						body: {
							input: '={{$parameter.text}}',
						},
					},
					output: {
						postReceive: [
							{
								type: 'rootProperty',
								properties: {
									property: 'data',
								},
							},
						],
					},
				},
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Dimensions',
						name: 'dimensions',
						type: 'number',
						default: undefined,
						description: 'The number of dimensions the resulting output embeddings should have. Only supported in text-embedding-3 and later models.',
						routing: {
							send: {
								type: 'body',
								property: 'dimensions',
							},
						},
					},
					{
						displayName: 'Encoding Format',
						name: 'encoding_format',
						type: 'options',
						options: [
							{
								name: 'Float',
								value: 'float',
							},
							{
								name: 'Base64',
								value: 'base64',
							},
						],
						default: 'float',
						description: 'The format to return the embeddings in',
						routing: {
							send: {
								type: 'body',
								property: 'encoding_format',
							},
						},
					},
					{
						displayName: 'User',
						name: 'user',
						type: 'string',
						default: '',
						description: 'A unique identifier representing your end-user, which can help Azure OpenAI to monitor and detect abuse',
						routing: {
							send: {
								type: 'body',
								property: 'user',
							},
						},
					},
				],
			},
		],
	};
}
