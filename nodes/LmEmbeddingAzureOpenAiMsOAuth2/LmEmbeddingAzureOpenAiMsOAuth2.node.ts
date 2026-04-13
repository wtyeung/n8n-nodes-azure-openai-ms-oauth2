import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

export class LmEmbeddingAzureOpenAiMsOAuth2 implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Azure OpenAI Embeddings MS OAuth2',
		name: 'azureOpenAiEmbeddingsMsOAuth2',
		icon: 'file:azure-openai.svg',
		group: ['transform'],
		version: 1,
		subtitle: '=Generate Embeddings',
		description: 'Generate embeddings using Azure OpenAI with Microsoft OAuth2 authentication',
		defaults: {
			name: 'Azure OpenAI Embeddings MS OAuth2',
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
		properties: [
			{
				displayName: 'Deployment Name',
				name: 'deploymentName',
				type: 'string',
				default: 'text-embedding-3-small',
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
						default: 1536,
						description: 'The number of dimensions the resulting output embeddings should have. Only supported in text-embedding-3 and later models. Default: 1536 for text-embedding-3-small, 3072 for text-embedding-3-large.',
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
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const deploymentName = this.getNodeParameter('deploymentName', itemIndex) as string;
				const text = this.getNodeParameter('text', itemIndex) as string;
				const options = this.getNodeParameter('options', itemIndex, {}) as {
					dimensions?: number;
					encoding_format?: string;
				};

				const credentials = await this.getCredentials('azureOpenAiMsOAuth2Api');
				const endpoint = credentials.endpoint as string;
				const apiVersion = credentials.apiVersion as string;
				let oauthData = credentials.oauthTokenData as any;
				
				if (!oauthData?.access_token) {
					throw new Error('No access token available in credentials');
				}

				// Check if token is expired or about to expire
				let accessToken = oauthData.access_token;
				const now = Math.floor(Date.now() / 1000);
				let isExpired = false;

				// Check expiry from various possible fields
				if (oauthData.expires_at) {
					isExpired = now >= oauthData.expires_at;
				} else if (oauthData.exp) {
					isExpired = now >= oauthData.exp;
				} else {
					// Try to decode JWT to get exp claim
					try {
						const parts = accessToken.split('.');
						if (parts.length === 3) {
							const payload = JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
							if (payload.exp) {
								isExpired = now >= payload.exp;
							}
						}
					} catch (e) {
						// If we can't decode, assume not expired and let the API call handle it
					}
				}

				// If token is expired, trigger refresh by making a test request
				if (isExpired) {
					try {
						// Make a test request that will trigger n8n's OAuth2 refresh on 401
						await this.helpers.httpRequestWithAuthentication.call(
							this,
							'azureOpenAiMsOAuth2Api',
							{
								method: 'GET',
								url: `${endpoint}openai/deployments?api-version=${apiVersion}`,
								json: true,
							},
						);

						// Get the refreshed credentials
						const refreshedCredentials = await this.getCredentials('azureOpenAiMsOAuth2Api');
						oauthData = refreshedCredentials.oauthTokenData as any;
						accessToken = oauthData?.access_token;

						if (!accessToken) {
							throw new Error('Failed to refresh access token');
						}
					} catch (error) {
						// If refresh fails, continue with existing token and let the main request handle it
					}
				}

				const url = `${endpoint}openai/deployments/${deploymentName}/embeddings?api-version=${apiVersion}`;

				const body: any = {
					input: text,
				};

				if (options.dimensions) {
					body.dimensions = options.dimensions;
				}

				if (options.encoding_format) {
					body.encoding_format = options.encoding_format;
				}

				// Explicitly add both api-key and Authorization headers
				// api-key is required for APIM, Authorization is standard OAuth2
				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'azureOpenAiMsOAuth2Api',
					{
						method: 'POST',
						url,
						headers: {
							'api-key': accessToken,
							'Authorization': `Bearer ${accessToken}`,
						},
						body,
						json: true,
					},
				);

				// Extract embeddings from response
				const embeddings = response.data || [];

				for (const embedding of embeddings) {
					returnData.push({
						json: embedding,
						pairedItem: { item: itemIndex },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: (error as Error).message,
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}
				throw error;
			}
		}

		return [returnData];
	}
}
