import { AzureOpenAIEmbeddings } from '@langchain/openai';
import { logWrapper } from '@n8n/ai-utilities';
import {
	NodeConnectionTypes,
	type INodeType,
	type INodeTypeDescription,
	type ISupplyDataFunctions,
	type SupplyData,
} from 'n8n-workflow';
import {
	azureAuthenticationProperty,
	azureCredentialsDescriptor,
	resolveAzureOpenAiAuth,
} from '../shared/azureOpenAiAuth';

export class LmEmbeddingAzureOpenAiMsOAuth2SubNode implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Embeddings Azure OpenAI (MS OAuth2)',
		name: 'lmEmbeddingAzureOpenAiMsOAuth2SubNode',
		icon: 'file:azure-openai.svg',
		credentials: azureCredentialsDescriptor,
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
			azureAuthenticationProperty,
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
		usableAsTool: true,
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		this.logger.debug('Supply data for Azure OpenAI embeddings');

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

		// Resolve endpoint/apiVersion/token based on the selected authentication method.
		// For OAuth2 this also handles proactive token refresh.
		const auth = await resolveAzureOpenAiAuth(this, itemIndex, modelName);

		const defaultHeaders: Record<string, string> =
			auth.authentication === 'apiKey'
				? { 'api-key': auth.token }
				: { 'api-key': auth.token, Authorization: `Bearer ${auth.token}` };

		const embeddings = new AzureOpenAIEmbeddings({
			azureOpenAIApiDeploymentName: modelName,
			azureOpenAIApiKey: auth.token, // API key, or OAuth2 token passed as API key for APIM
			azureOpenAIApiVersion: auth.apiVersion,
			// Use azureOpenAIBasePath for custom endpoint (APIM gateway)
			azureOpenAIBasePath: `${auth.endpoint}/openai/deployments`,
			configuration: {
				defaultHeaders,
			},
			...options,
		});

		return {
			// `embeddings` satisfies logWrapper's Embeddings constraint structurally, but the
			// @langchain/core version resolved here differs from the one @n8n/ai-utilities'
			// type declarations expect, so TS sees them as incompatible nominal types.
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			response: logWrapper(embeddings as any, this),
		};
	}
}
