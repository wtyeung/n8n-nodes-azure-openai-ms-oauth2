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
	exp?: number; // JWT standard expiry claim
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
	
	// Log all available fields in token data for debugging
	context.logger.info('Getting current token', { 
		hasToken: !!oauthData?.access_token,
		hasExpiresAt: !!oauthData?.expires_at,
		hasExp: !!oauthData?.exp,
		expiresAt: oauthData?.expires_at ? new Date(oauthData.expires_at * 1000).toISOString() : 'not set',
		exp: oauthData?.exp ? new Date(oauthData.exp * 1000).toISOString() : 'not set',
		allFields: Object.keys(oauthData || {})
	});
	
	if (!oauthData?.access_token) {
		throw new NodeOperationError(
			context.getNode(),
			'OAuth2 access token not found. Please reconnect your credentials.',
		);
	}

	// Check if token is expired or about to expire (within 5 minutes)
	// Support multiple expiry formats:
	// - expires_at: Unix timestamp (n8n format)
	// - exp: Unix timestamp (JWT standard)
	// - expires_in: Duration in seconds (need to calculate expiry time)
	let expiryTime = oauthData.expires_at || oauthData.exp;
	
	// TEST MODE: Force refresh on every call to test the mechanism
	// Set to true to test token refresh without waiting for expiry
	const FORCE_REFRESH_FOR_TESTING = true;
	
	if (FORCE_REFRESH_FOR_TESTING) {
		context.logger.info('TEST MODE: Forcing token refresh to test mechanism...');
		try {
			await context.helpers.httpRequestWithAuthentication.call(
				context,
				'azureOpenAiMsOAuth2Api',
				{
					url: `${credentials.endpoint}openai/deployments?api-version=${credentials.apiVersion}`,
					method: 'GET',
				},
			);
			
			const refreshedCredentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
			const refreshedOauthData = refreshedCredentials.oauthTokenData as OAuthTokenData;
			
			if (refreshedOauthData?.access_token) {
				context.logger.info('TEST MODE: Token refresh test completed');
				return refreshedOauthData.access_token;
			}
		} catch (error: any) {
			context.logger.error('TEST MODE: Token refresh test failed', { error: error.message });
		}
	}
	
	// If we only have expires_in, we can't determine exact expiry without knowing when token was issued
	// In this case, we'll have to rely on 401 retry logic
	if (!expiryTime && oauthData.expires_in) {
		context.logger.warn(`Token only has expires_in (${oauthData.expires_in}s) without timestamp - cannot determine exact expiry. Will rely on 401 retry logic.`);
	}
	
	if (expiryTime) {
		const now = Math.floor(Date.now() / 1000);
		const expiresAt = expiryTime;
		const bufferTime = 300; // 5 minutes

		if (now >= expiresAt - bufferTime) {
			context.logger.info(`Token expired or expiring soon (expires at ${new Date(expiresAt * 1000).toISOString()}), triggering refresh via test request...`);
			
			try {
				// Make a test request using n8n's HTTP helper to trigger OAuth2 refresh
				// httpRequestWithAuthentication will automatically refresh the token on 401
				await context.helpers.httpRequestWithAuthentication.call(
					context,
					'azureOpenAiMsOAuth2Api',
					{
						url: `${credentials.endpoint}openai/deployments?api-version=${credentials.apiVersion}`,
						method: 'GET',
					},
				);
				
				context.logger.info('Test request succeeded, fetching refreshed credentials...');
				
				// Re-fetch credentials after the test request (token should be refreshed now)
				const refreshedCredentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
				const refreshedOauthData = refreshedCredentials.oauthTokenData as OAuthTokenData;
				
				if (refreshedOauthData?.access_token && refreshedOauthData.access_token !== oauthData.access_token) {
					context.logger.info('Token refreshed successfully - new token received');
					return refreshedOauthData.access_token;
				} else if (refreshedOauthData?.access_token) {
					context.logger.info('Token still valid after test request');
					return refreshedOauthData.access_token;
				}
			} catch (error: any) {
				// Log detailed error information
				context.logger.error('Token refresh test request failed', { 
					error: error.message,
					status: error.statusCode || error.status,
					response: error.response?.body || error.response
				});
				
				// Try to fetch credentials anyway - n8n might have refreshed despite error
				try {
					const refreshedCredentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
					const refreshedOauthData = refreshedCredentials.oauthTokenData as OAuthTokenData;
					if (refreshedOauthData?.access_token && refreshedOauthData.access_token !== oauthData.access_token) {
						context.logger.info('Token was refreshed despite error');
						return refreshedOauthData.access_token;
					}
				} catch (e) {
					context.logger.error('Failed to fetch credentials after error', { error: e });
				}
			}
		} else {
			context.logger.info(`Token still valid, expires in ${Math.floor((expiresAt - now) / 60)} minutes`);
		}
	} else {
		context.logger.warn('Token does not have expires_at or exp field - cannot proactively refresh. Will rely on 401 retry logic.');
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
		this.logger.info('=== supplyData called for Azure OpenAI Chat Model (MS OAuth2) v1.1.6 [TEST MODE] ===');
		
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
			context.logger.info('=== Model invoke() called - fetching fresh credentials ===');
			// Get fresh token before invoke
			const freshCreds = await getCredentialsWithFreshToken();
			(this as any).azureOpenAIApiKey = freshCreds.accessToken;
			context.logger.info('Token injected into model, calling original invoke');
			
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
