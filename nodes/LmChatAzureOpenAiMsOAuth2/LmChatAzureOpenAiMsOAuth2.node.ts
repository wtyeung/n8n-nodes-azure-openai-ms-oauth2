import type {
	ILoadOptionsFunctions,
	INodeListSearchResult,
	ISupplyDataFunctions,
	INodeType,
	INodeTypeDescription,
	SupplyData,
} from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';
import {
	azureAuthenticationProperty,
	azureCredentialsDescriptor,
	resolveAzureOpenAiAuth,
} from '../shared/azureOpenAiAuth';

export class LmChatAzureOpenAiMsOAuth2 implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Azure OpenAI Chat Model (MS OAuth2)',
		name: 'lmChatAzureOpenAiMsOAuth2',
		icon: 'file:azure-openai.svg',
		group: ['transform'],
		version: 1,
		description: 'Azure OpenAI Chat Model with Microsoft OAuth2 or API key authentication',
		defaults: {
			name: 'Azure OpenAI Chat Model (MS OAuth2)',
		},
		usableAsTool: true,
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
				'Language Models': ['Chat Models (Recommended)'],
			},
			resources: {
				primaryDocumentation: [
					{
						url: 'https://docs.n8n.io/integrations/builtin/cluster-nodes/sub-nodes/n8n-nodes-langchain.lmchatazureopenai/',
					},
				],
			},
		},
		inputs: [],
		outputs: [NodeConnectionTypes.AiLanguageModel],
		outputNames: ['Model'],
		credentials: azureCredentialsDescriptor,
		requestDefaults: {
			ignoreHttpStatusErrors: true,
			baseURL: '={{ $credentials.endpoint }}',
		},
		properties: [
			azureAuthenticationProperty,
			{
				displayName:
					'If using JSON response format, you must include word "json" in the prompt. Also, make sure to select latest models released post November 2023.',
				name: 'notice',
				type: 'notice',
				default: '',
				displayOptions: {
					show: {
						'/options.responseFormat': ['json_object'],
					},
				},
			},
			{
				displayName: 'Model',
				name: 'deploymentName',
				type: 'resourceLocator',
				default: { 
					mode: 'list', 
					value: (() => {
						// Extract default from AZURE_OPENAI_MODELS (model with * prefix)
						// eslint-disable-next-line @n8n/community-nodes/no-restricted-globals
						const modelsEnv = process.env.AZURE_OPENAI_MODELS || '*gpt-4o,gpt-4,gpt-35-turbo';
						const defaultModel = modelsEnv.split(',')
							.map(m => m.trim())
							.find(m => m.startsWith('*'));
						return defaultModel ? defaultModel.replace(/^\*/, '') : '';
					})()
				},
				required: true,
				description: 'The deployment name configured in your Azure OpenAI resource. Mark default with * in AZURE_OPENAI_MODELS (e.g., "*gpt-4o,gpt-4,gpt-35-turbo").',
				modes: [
					{
						displayName: 'From List',
						name: 'list',
						type: 'list',
						hint: 'Select from models configured via AZURE_OPENAI_MODELS environment variable',
						typeOptions: {
							searchListMethod: 'getModels',
							searchable: true,
						},
					},
					{
						displayName: 'By ID',
						name: 'id',
						type: 'string',
						hint: 'Enter the deployment name manually',
						validation: [
							{
								type: 'regex',
								properties: {
									regex: '.+',
									errorMessage: 'Deployment name cannot be empty',
								},
							},
						],
						placeholder: 'e.g. gpt-4o-deployment',
					},
				],
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
						displayName: 'Frequency Penalty',
						name: 'frequencyPenalty',
						default: 0,
						typeOptions: { maxValue: 2, minValue: -2, numberPrecision: 1 },
						description:
							"Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim",
						type: 'number',
					},
					{
						displayName: 'Max Retries',
						name: 'maxRetries',
						default: 2,
						description: 'Maximum number of retries to attempt on failure',
						type: 'number',
					},
					{
						displayName: 'Maximum Number of Tokens',
						name: 'maxTokens',
						default: -1,
						description:
							'The maximum number of tokens to generate in the completion. Use -1 for default.',
						type: 'number',
						typeOptions: {
							maxValue: 128000,
						},
					},
					{
						displayName: 'Presence Penalty',
						name: 'presencePenalty',
						default: 0,
						typeOptions: { maxValue: 2, minValue: -2, numberPrecision: 1 },
						description:
							"Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics",
						type: 'number',
					},
					{
						displayName: 'Response Format',
						name: 'responseFormat',
						default: 'text',
						type: 'options',
						options: [
							{
								name: 'Text',
								value: 'text',
								description: 'Regular text response',
							},
							{
								name: 'JSON',
								value: 'json_object',
								description:
									'Enables JSON mode, which should guarantee the message the model generates is valid JSON',
							},
						],
					},
					{
						displayName: 'Sampling Temperature',
						name: 'temperature',
						default: 0.7,
						typeOptions: { maxValue: 2, minValue: 0, numberPrecision: 1 },
						description:
							'Controls randomness: Lowering results in less random completions. As the temperature approaches zero, the model will become deterministic and repetitive.',
						type: 'number',
					},
					{
						displayName: 'Timeout (Ms)',
						name: 'timeout',
						default: 60000,
						description: 'Maximum amount of time a request is allowed to take in milliseconds',
						type: 'number',
					},
					{
						displayName: 'Top P',
						name: 'topP',
						default: 1,
						typeOptions: { maxValue: 1, minValue: 0, numberPrecision: 1 },
						description:
							'Controls diversity via nucleus sampling: 0.5 means half of all likelihood-weighted options are considered. We generally recommend altering this or temperature but not both.',
						type: 'number',
					},
				],
			},
		],
	};

	methods = {
		listSearch: {
			async getModels(
				this: ILoadOptionsFunctions,
				filter?: string,
			): Promise<INodeListSearchResult> {
				// Read from environment variables
				// Format: "model1,*model2,model3" where * marks the default
				// eslint-disable-next-line @n8n/community-nodes/no-restricted-globals
				const modelsEnv = process.env.AZURE_OPENAI_MODELS || '*gpt-4o,gpt-4,gpt-35-turbo';
				const models = modelsEnv.split(',').map(m => m.trim()).filter(m => m.length > 0);
				
				// Filter models if search term provided
				const filteredModels = filter
					? models.filter(m => {
						const modelName = m.replace(/^\*/, ''); // Remove * for filtering
						return modelName.toLowerCase().includes(filter.toLowerCase());
					})
					: models;
				
				// Sort so default (with *) appears first
				const sortedModels = filteredModels.sort((a, b) => {
					const aIsDefault = a.startsWith('*');
					const bIsDefault = b.startsWith('*');
					if (aIsDefault && !bIsDefault) return -1;
					if (!aIsDefault && bIsDefault) return 1;
					return 0;
				});
				
				return {
					results: sortedModels.map(model => {
						const isDefault = model.startsWith('*');
						const modelName = model.replace(/^\*/, ''); // Remove * prefix
						return {
							name: isDefault ? `${modelName} (default)` : modelName,
							value: modelName,
						};
					}),
				};
			},
		},
	};

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		this.logger.info('=== supplyData called for Azure OpenAI Chat Model (MS OAuth2) v1.5.3 ===');
		
		// Handle resourceLocator format
		const deploymentNameParam = this.getNodeParameter('deploymentName', itemIndex) as { mode: string; value: string } | string;
		const deploymentName = typeof deploymentNameParam === 'string' 
			? deploymentNameParam 
			: deploymentNameParam.value;
		const options = this.getNodeParameter('options', itemIndex, {}) as {
			maxTokens?: number;
			temperature?: number;
			topP?: number;
			frequencyPenalty?: number;
			presencePenalty?: number;
			timeout?: number;
			maxRetries?: number;
			responseFormat?: string;
		};

		// Resolve endpoint/apiVersion/token based on the selected authentication method.
		// For OAuth2 this also handles proactive token refresh.
		const auth = await resolveAzureOpenAiAuth(this, itemIndex, deploymentName);

		// Dynamic imports prevent silent node unloading when @langchain packages
		// are not resolvable at module load time on some workers in queue mode
		const { AzureChatOpenAI } = await import('@langchain/openai');
		const { N8nLlmTracing } = await import('./N8nLlmTracing');

		// Create model with fresh token
		const timeout = options.timeout ?? 60000;
		const model = new AzureChatOpenAI({
			// model name is required for correct internal logic (e.g. maxTokens vs maxCompletionTokens mapping)
			// and for proper tool call response parsing in the agent loop
			model: deploymentName,
			azureOpenAIApiDeploymentName: deploymentName,
			azureOpenAIApiKey: auth.token, // API key, or fresh JWT token passed as api-key for APIM to validate
			azureOpenAIEndpoint: auth.endpoint,
			azureOpenAIApiVersion: auth.apiVersion,
			maxTokens: options.maxTokens !== -1 ? options.maxTokens : undefined,
			temperature: options.temperature,
			topP: options.topP,
			frequencyPenalty: options.frequencyPenalty,
			presencePenalty: options.presencePenalty,
			timeout,
			maxRetries: options.maxRetries ?? 2,
			modelKwargs: options.responseFormat
				? {
						response_format: { type: options.responseFormat },
					}
				: undefined,
			streaming: false,
			// Force Chat Completions API regardless of model name heuristics. Newer
			// @langchain/openai versions auto-detect certain model families (e.g. GPT-5 /
			// reasoning models) and silently switch to the Responses API, which uses a
			// different URL shape ("openai/responses") than our deployment-based Azure
			// OpenAI endpoint ("openai/deployments/{name}/chat/completions"), causing a
			// 404 Resource not found error for deployment names not explicitly handled.
			useResponsesApi: false,
			callbacks: [new N8nLlmTracing(this)],
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
		} as any);

		return {
			response: model,
		};
	}
}
