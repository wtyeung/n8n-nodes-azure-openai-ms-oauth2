import { AzureOpenAIEmbeddings } from '@langchain/openai';
import { logWrapper } from '@n8n/ai-utilities';
import {
	NodeConnectionTypes,
	NodeOperationError,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';

async function getCurrentToken(
	context: ISupplyDataFunctions,
	deploymentName?: string,
): Promise<string> {
	const credentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
	
	const oauthTokenData = credentials.oauthTokenData as {
		access_token?: string;
		expires_in?: number;
		expires_at?: number;
		exp?: number;
		refresh_token?: string;
	};

	if (!oauthTokenData?.access_token) {
		throw new NodeOperationError(
			context.getNode(),
			'No access token found in credentials. Please reconnect your Azure OpenAI MS OAuth2 credential.',
		);
	}

	const accessToken = oauthTokenData.access_token;

	// Decode JWT to get expiry
	function decodeJWT(token: string): { exp?: number } | null {
		try {
			const parts = token.split('.');
			if (parts.length !== 3) return null;
			const payload = parts[1];
			const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
			const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
			return JSON.parse(jsonPayload);
		} catch {
			return null;
		}
	}

	const decoded = decodeJWT(accessToken);
	const credentialBufferTime = (credentials.refreshBeforeExpirySeconds as number | undefined) ?? 900;

	if (decoded?.exp) {
		const expiryTime = decoded.exp * 1000;
		const now = Date.now();
		const timeUntilExpiry = expiryTime - now;
		const bufferMs = credentialBufferTime * 1000;

		if (timeUntilExpiry < bufferMs) {
			context.logger.warn(
				`Token expires in ${Math.round(timeUntilExpiry / 1000 / 60)} minutes, triggering refresh (buffer: ${credentialBufferTime}s)`,
			);

			if (timeUntilExpiry <= 0) {
				// Token already expired - use HTTP request to force n8n OAuth2 refresh
				try {
					const testUrl = `${credentials.endpoint}openai/deployments/${deploymentName || 'test'}/embeddings?api-version=${credentials.apiVersion}`;
					await context.helpers.httpRequestWithAuthentication.call(
						context,
						'azureOpenAiMsOAuth2Api',
						{
							method: 'POST',
							url: testUrl,
							body: { input: 'test' },
							skipSslCertificateValidation: true,
							ignoreHttpStatusErrors: true,
						},
					);

					const refreshedCredentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
					const refreshedTokenData = refreshedCredentials.oauthTokenData as typeof oauthTokenData;
					
					if (refreshedTokenData?.access_token && refreshedTokenData.access_token !== accessToken) {
						context.logger.info('✅ SUCCESS: Token refreshed via HTTP request (n8n OAuth2)');
						return refreshedTokenData.access_token;
					}
				} catch (error) {
					context.logger.error('Failed to refresh token via HTTP request', error);
				}
			}
		}
	}

	return accessToken;
}

export class LmEmbeddingAzureOpenAiMsOAuth2SubNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Embeddings Azure OpenAI (MS OAuth2)',
		name: 'lmEmbeddingAzureOpenAiMsOAuth2SubNode',
		icon: 'file:azure-openai.svg',
		credentials: [
			{
				name: 'azureOpenAiMsOAuth2Api',
				required: true,
			},
		],
		group: ['transform'],
		version: 1,
		description: 'Use Azure OpenAI Embeddings with Microsoft OAuth2 authentication',
		defaults: {
			name: 'Embeddings Azure OpenAI (MS OAuth2)',
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

		inputs: [],
		outputs: [NodeConnectionTypes.AiEmbedding],
		outputNames: ['Embeddings'],
		
		properties: [
			{
				displayName: 'Model (Deployment) Name',
				name: 'model',
				type: 'string',
				description: 'The deployment name you chose when you deployed the embedding model in Azure OpenAI',
				default: 'text-embedding-3-small',
				placeholder: 'text-embedding-3-small',
				required: true,
			},
			{
				displayName: 'Options',
				name: 'options',
				placeholder: 'Add Option',
				description: 'Additional options to add',
				type: 'collection',
				default: {},
				options: [
					{
						displayName: 'Batch Size',
						name: 'batchSize',
						default: 512,
						typeOptions: { maxValue: 2048 },
						description: 'Maximum number of documents to send in each request',
						type: 'number',
					},
					{
						displayName: 'Strip New Lines',
						name: 'stripNewLines',
						default: true,
						description: 'Whether to strip new lines from the input text',
						type: 'boolean',
					},
					{
						displayName: 'Timeout',
						name: 'timeout',
						default: -1,
						description:
							'Maximum amount of time a request is allowed to take in seconds. Set to -1 for no timeout.',
						type: 'number',
					},
					{
						displayName: 'Dimensions',
						name: 'dimensions',
						default: 1536,
						description:
							'The number of dimensions the resulting output embeddings should have. Only supported in text-embedding-3 and later models.',
						type: 'options',
						options: [
							{
								name: '256',
								value: 256,
							},
							{
								name: '512',
								value: 512,
							},
							{
								name: '1024',
								value: 1024,
							},
							{
								name: '1536',
								value: 1536,
							},
							{
								name: '3072',
								value: 3072,
							},
						],
					},
				],
			},
		],
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		this.logger.debug('Supply data for Azure OpenAI embeddings with MS OAuth2');
		
		const credentials = await this.getCredentials('azureOpenAiMsOAuth2Api');
		const modelName = this.getNodeParameter('model', itemIndex) as string;

		const options = this.getNodeParameter('options', itemIndex, {}) as {
			batchSize?: number;
			stripNewLines?: boolean;
			timeout?: number;
			dimensions?: number | undefined;
		};

		if (options.timeout === -1) {
			options.timeout = undefined;
		}

		if (!credentials.endpoint) {
			throw new NodeOperationError(
				this.getNode(),
				'Endpoint is required in credentials',
			);
		}

		// Get fresh OAuth2 token
		const accessToken = await getCurrentToken(this, modelName);
		const endpoint = (credentials.endpoint as string).replace(/\/$/, '');
		const apiVersion = credentials.apiVersion as string;

		const embeddings = new AzureOpenAIEmbeddings({
			azureOpenAIApiDeploymentName: modelName,
			azureOpenAIApiKey: accessToken, // OAuth2 token passed as API key for APIM
			azureOpenAIApiVersion: apiVersion,
			// Use azureOpenAIBasePath for custom endpoint (APIM gateway)
			azureOpenAIBasePath: `${endpoint}/openai/deployments`,
			configuration: {
				defaultHeaders: {
					'api-key': accessToken,
					'Authorization': `Bearer ${accessToken}`,
				},
			},
			...options,
		});

		return {
			response: logWrapper(embeddings as any, this),
		};
	}
}
