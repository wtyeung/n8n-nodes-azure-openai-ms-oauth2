import type {
	ISupplyDataFunctions,
	INodeType,
	INodeTypeDescription,
	SupplyData,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';
import { AzureChatOpenAI } from '@langchain/openai';

interface OAuthTokenData {
	access_token?: string;
	expires_in?: number;
	expires_at?: number;
	refresh_token?: string;
}

/**
 * Get the current access token from credentials
 * If token is expired or about to expire, makes a test request to trigger n8n's OAuth2 refresh
 */
async function getCurrentToken(
	context: ISupplyDataFunctions,
): Promise<string> {
	const credentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
	const oauthData = credentials.oauthTokenData as OAuthTokenData;
	
	if (!oauthData?.access_token) {
		throw new NodeOperationError(
			context.getNode(),
			'OAuth2 access token not found. Please reconnect your credentials.',
		);
	}

	// Check if token is expired or about to expire (within 5 minutes)
	if (oauthData.expires_at) {
		const now = Math.floor(Date.now() / 1000);
		const expiresAt = oauthData.expires_at;
		const bufferTime = 300; // 5 minutes

		if (now >= expiresAt - bufferTime) {
			context.logger.info('Token expired or expiring soon, triggering refresh via test request...');
			
			try {
				// Make a test request using n8n's HTTP helper to trigger OAuth2 refresh
				// This will cause n8n to refresh the token if it gets a 401 error
				await context.helpers.httpRequestWithAuthentication.call(
					context,
					'azureOpenAiMsOAuth2Api',
					{
						url: `${credentials.endpoint}openai/deployments?api-version=${credentials.apiVersion}`,
						method: 'GET',
					},
				);
				
				// Re-fetch credentials after the test request (token should be refreshed now)
				const refreshedCredentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
				const refreshedOauthData = refreshedCredentials.oauthTokenData as OAuthTokenData;
				
				if (refreshedOauthData?.access_token) {
					context.logger.info('Token refreshed successfully');
					return refreshedOauthData.access_token;
				}
			} catch (error) {
				// If test request fails, log but continue with existing token
				// The actual API call will fail and provide better error message
				context.logger.warn('Token refresh test request failed, continuing with existing token', { error });
			}
		}
	}

	return oauthData.access_token;
}

export class LmChatAzureOpenAiMsOAuth2 implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Azure OpenAI Chat Model (MS OAuth2)',
		name: 'lmChatAzureOpenAiMsOAuth2',
		icon: 'file:azure-openai.svg',
		group: ['transform'],
		version: 1,
		description: 'Azure OpenAI Chat Model with Microsoft OAuth2 authentication',
		defaults: {
			name: 'Azure OpenAI Chat Model (MS OAuth2)',
		},
		usableAsTool: true,
		codex: {
			categories: ['AI'],
			subcategories: {
				AI: ['Language Models', 'Root Nodes'],
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
		outputs: ['ai_languageModel'],
		outputNames: ['Model'],
		credentials: [
			{
				name: 'azureOpenAiMsOAuth2Api',
				required: true,
			},
		],
		requestDefaults: {
			ignoreHttpStatusErrors: true,
			baseURL: '={{ $credentials.endpoint }}',
		},
		properties: [
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
				displayName: 'Deployment Name',
				name: 'deploymentName',
				type: 'string',
				description:
					'The deployment name (not model name) configured in your Azure OpenAI resource. <a href="https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/create-resource">Learn more</a>.',
				placeholder: 'e.g. gpt-4-deployment',
				default: '',
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

	async supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData> {
		const deploymentName = this.getNodeParameter('deploymentName', itemIndex) as string;
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

		// Store context reference for token refresh
		const context = this;
		
		// Create a wrapper that provides fresh credentials on each call
		const getCredentialsWithFreshToken = async () => {
			const credentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
			
			if (!credentials.endpoint) {
				throw new NodeOperationError(
					context.getNode(),
					'Endpoint is required in credentials',
				);
			}

			// Get current access token
			const accessToken = await getCurrentToken(context);
			
			return {
				endpoint: (credentials.endpoint as string).replace(/\/$/, ''),
				apiVersion: credentials.apiVersion as string,
				accessToken,
			};
		};

		// Get initial credentials
		const initialCreds = await getCredentialsWithFreshToken();

		// Create model with configuration that will be used
		// Note: We need to recreate the model on each invocation to get fresh tokens
		// This is a workaround for LangChain not supporting dynamic token refresh
		const model = new AzureChatOpenAI({
			azureOpenAIApiDeploymentName: deploymentName,
			azureOpenAIApiKey: initialCreds.accessToken, // JWT token passed as api-key for APIM to validate
			azureOpenAIEndpoint: initialCreds.endpoint,
			azureOpenAIApiVersion: initialCreds.apiVersion,
			maxTokens: options.maxTokens !== -1 ? options.maxTokens : undefined,
			temperature: options.temperature,
			topP: options.topP,
			frequencyPenalty: options.frequencyPenalty,
			presencePenalty: options.presencePenalty,
			timeout: options.timeout ?? 60000,
			maxRetries: options.maxRetries ?? 2,
			modelKwargs: options.responseFormat
				? {
						response_format: { type: options.responseFormat },
					}
				: undefined,
		});

		// Wrap the model to refresh token before each call and handle 401 errors
		const originalInvoke = model.invoke.bind(model);
		const originalStream = model.stream.bind(model);
		
		model.invoke = async function(input: any, options?: any) {
			// Get fresh token before invoke
			const freshCreds = await getCredentialsWithFreshToken();
			(this as any).azureOpenAIApiKey = freshCreds.accessToken;
			
			try {
				return await originalInvoke(input, options);
			} catch (error: any) {
				// If we get a 401 error, the token might have expired between fetch and use
				// Retry once with a fresh token
				if (error?.status === 401 || error?.response?.status === 401) {
					context.logger.info('Received 401 error, retrying with fresh token...');
					const retryCreds = await getCredentialsWithFreshToken();
					(this as any).azureOpenAIApiKey = retryCreds.accessToken;
					return await originalInvoke(input, options);
				}
				throw error;
			}
		};
		
		model.stream = async function(input: any, options?: any) {
			// Get fresh token before stream
			const freshCreds = await getCredentialsWithFreshToken();
			(this as any).azureOpenAIApiKey = freshCreds.accessToken;
			
			try {
				return await originalStream(input, options);
			} catch (error: any) {
				// If we get a 401 error, retry with fresh token
				if (error?.status === 401 || error?.response?.status === 401) {
					context.logger.info('Received 401 error, retrying with fresh token...');
					const retryCreds = await getCredentialsWithFreshToken();
					(this as any).azureOpenAIApiKey = retryCreds.accessToken;
					return await originalStream(input, options);
				}
				throw error;
			}
		};

		return {
			response: model,
		};
	}
}
