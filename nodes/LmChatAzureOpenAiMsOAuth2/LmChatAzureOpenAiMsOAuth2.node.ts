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
 * Decode JWT token to extract claims (without validation)
 * Returns the payload as a JSON object
 */
function decodeJWT(token: string): any {
	try {
		// JWT format: header.payload.signature
		const parts = token.split('.');
		if (parts.length !== 3) {
			return null;
		}
		
		// Decode the payload (base64url)
		const payload = parts[1];
		// Replace base64url chars with base64
		const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
		// Decode base64
		const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
		return JSON.parse(jsonPayload);
	} catch (error) {
		return null;
	}
}

/**
 * Get the current access token from credentials
 * If token is expired or about to expire, makes a test request to trigger n8n's OAuth2 refresh
 */
async function getCurrentToken(
	context: ISupplyDataFunctions,
	deploymentName?: string,
): Promise<string> {
	const credentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
	const oauthData = credentials.oauthTokenData as OAuthTokenData;
	
	if (!oauthData?.access_token) {
		throw new NodeOperationError(
			context.getNode(),
			'OAuth2 access token not found. Please reconnect your credentials.',
		);
	}

	// Decode the JWT access token to get the exp claim
	const decodedToken = decodeJWT(oauthData.access_token);
	const tokenExp = decodedToken?.exp;
	
	// Log all available fields in token data for debugging
	context.logger.info('Getting current token', { 
		hasToken: !!oauthData?.access_token,
		hasExpiresAt: !!oauthData?.expires_at,
		hasExp: !!oauthData?.exp,
		tokenExp: tokenExp ? new Date(tokenExp * 1000).toISOString() : 'not in JWT',
		expiresAt: oauthData?.expires_at ? new Date(oauthData.expires_at * 1000).toISOString() : 'not set',
		allFields: Object.keys(oauthData || {})
	});

	// Check if token is expired or about to expire (within 5 minutes)
	// Priority: JWT exp claim > expires_at > exp from oauthData
	let expiryTime = tokenExp || oauthData.expires_at || oauthData.exp;
	
	// TEST MODE: Force refresh on every call to test the mechanism
	// Set to true to test token refresh without waiting for expiry
	const FORCE_REFRESH_FOR_TESTING = false;
	
	if (FORCE_REFRESH_FOR_TESTING) {
		context.logger.info('TEST MODE: Forcing token refresh to test mechanism...');
		context.logger.info('TEST MODE: Making test request to trigger OAuth2 refresh...');
		
		try {
			// Make a test request that will intentionally fail with 401 if token is expired
			// This triggers n8n's OAuth2 refresh mechanism
			// We use a simple endpoint that should exist but will return 401 if token is bad
			const testUrl = `${credentials.endpoint}openai/deployments/${deploymentName}/chat/completions?api-version=${credentials.apiVersion}`;
			context.logger.info('TEST MODE: Test URL:', { url: testUrl });
			
			// Make a minimal POST request that will fail fast but trigger auth check
			await context.helpers.httpRequestWithAuthentication.call(
				context,
				'azureOpenAiMsOAuth2Api',
				{
					url: testUrl,
					method: 'POST',
					body: { messages: [{ role: 'user', content: 'test' }] },
					json: true,
				},
			);
			
			context.logger.info('TEST MODE: Test request succeeded');
			
			const refreshedCredentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
			const refreshedOauthData = refreshedCredentials.oauthTokenData as OAuthTokenData;
			
			if (refreshedOauthData?.access_token) {
				const tokenChanged = refreshedOauthData.access_token !== oauthData.access_token;
				context.logger.info('TEST MODE: Token refresh test completed', { 
					tokenChanged,
					hasNewToken: !!refreshedOauthData.access_token
				});
				return refreshedOauthData.access_token;
			}
		} catch (error: any) {
			context.logger.error('TEST MODE: Token refresh test failed', { 
				error: error.message,
				statusCode: error.statusCode,
				response: error.response
			});
			// Continue with existing token
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
		
		// Get buffer time from environment variable or use default (15 minutes)
		// Valid range: 60 seconds (1 minute) to 3600 seconds (60 minutes)
		const envBufferTime = process.env.AZURE_OPENAI_TOKEN_REFRESH_BUFFER_SECONDS;
		let bufferTime = 900; // Default: 15 minutes
		
		if (envBufferTime) {
			const parsedBuffer = parseInt(envBufferTime, 10);
			if (!isNaN(parsedBuffer) && parsedBuffer >= 60 && parsedBuffer <= 3600) {
				bufferTime = parsedBuffer;
				context.logger.info(`Using custom token refresh buffer: ${bufferTime} seconds (${Math.floor(bufferTime / 60)} minutes)`);
			} else {
				context.logger.warn(`Invalid AZURE_OPENAI_TOKEN_REFRESH_BUFFER_SECONDS value: ${envBufferTime}. Must be between 60 and 3600. Using default: ${bufferTime} seconds.`);
			}
		}

		if (now >= expiresAt - bufferTime) {
			context.logger.info(`Token expired or expiring soon (expires at ${new Date(expiresAt * 1000).toISOString()}), triggering refresh...`);
			
			// Since the token is still valid (not yet expired), making a test request won't return 401
			// and won't trigger n8n's OAuth2 refresh automatically.
			// We need to manually refresh using the refresh token.
			
			if (!oauthData.refresh_token) {
				context.logger.warn('No refresh token available - cannot refresh proactively');
				return oauthData.access_token;
			}
			
			try {
				// Manually refresh the token using Azure AD token endpoint
				context.logger.info('Manually refreshing token using refresh_token...');
				
				const tokenUrl = credentials.accessTokenUrl as string;
				const refreshToken = oauthData.refresh_token;
				const clientId = credentials.clientId as string;
				const clientSecret = credentials.clientSecret as string;
				
				// Get the API scope from credentials (e.g., api://12345678-1234-1234-1234-123456789abc/.default)
				const apiScope = credentials.apiScope as string;
				// Build the full scope with offline_access
				const scope = `offline_access ${apiScope}`;
				
				context.logger.info('Refresh parameters', {
					tokenUrl,
					clientId,
					hasRefreshToken: !!refreshToken,
					apiScope,
					fullScope: scope
				});
				
				const response = await context.helpers.request({
					method: 'POST',
					url: tokenUrl,
					headers: {
						'Content-Type': 'application/x-www-form-urlencoded',
					},
					body: new URLSearchParams({
						grant_type: 'refresh_token',
						refresh_token: refreshToken,
						client_id: clientId,
						client_secret: clientSecret,
						scope: scope,
					}).toString(),
					json: false,
				});
				
				const tokenData = JSON.parse(response as string);
				
				if (tokenData.access_token) {
					context.logger.info('Token refreshed successfully via manual refresh');
					// Note: We can't update the stored credentials from here
					// But we can return the new token for this execution
					return tokenData.access_token;
				}
			} catch (error: any) {
				context.logger.error('Manual token refresh failed', { 
					error: error.message,
					statusCode: error.statusCode,
					response: error.response
				});
				// Continue with existing token - it might still work for a few more minutes
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
		this.logger.info('=== supplyData called for Azure OpenAI Chat Model (MS OAuth2) v1.3.0 ===');
		
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
			const accessToken = await getCurrentToken(context, deploymentName);
			
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

		// Log available methods on the model instance and its prototype chain
		const instanceMethods = Object.getOwnPropertyNames(model).filter(m => typeof (model as any)[m] === 'function');
		const prototypeMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(model)).filter(m => typeof (model as any)[m] === 'function');
		context.logger.info('Model methods:', { 
			instance: instanceMethods,
			prototype: prototypeMethods,
			hasInvoke: typeof model.invoke === 'function',
			hasStream: typeof model.stream === 'function',
			hasCall: typeof (model as any).call === 'function',
			hasGenerate: typeof (model as any).generate === 'function'
		});
		
		// Wrap ALL async methods to ensure token refresh
		// Check if methods exist before wrapping
		const originalInvoke = typeof model.invoke === 'function' ? model.invoke.bind(model) : null;
		const originalStream = typeof model.stream === 'function' ? model.stream.bind(model) : null;
		const originalCall = typeof (model as any).call === 'function' ? (model as any).call.bind(model) : null;
		const originalGenerate = typeof (model as any).generate === 'function' ? (model as any).generate.bind(model) : null;
		
		// Only wrap methods that exist
		if (originalInvoke) {
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
		}
		
		if (originalStream) {
			model.stream = async function(input: any, options?: any) {
				context.logger.info('=== Model stream() called - fetching fresh credentials ===');
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
		}
		
		// Wrap call() if it exists
		if (originalCall) {
			(model as any).call = async function(...args: any[]) {
				context.logger.info('=== Model call() called - fetching fresh credentials ===');
				const freshCreds = await getCredentialsWithFreshToken();
				(this as any).azureOpenAIApiKey = freshCreds.accessToken;
				return await originalCall(...args);
			};
		}
		
		// Wrap generate() if it exists
		if (originalGenerate) {
			(model as any).generate = async function(...args: any[]) {
				context.logger.info('=== Model generate() called - fetching fresh credentials ===');
				const freshCreds = await getCredentialsWithFreshToken();
				(this as any).azureOpenAIApiKey = freshCreds.accessToken;
				return await originalGenerate(...args);
			};
		}

		return {
			response: model,
		};
	}
}
