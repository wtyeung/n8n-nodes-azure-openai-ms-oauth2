import type {
	ICredentialDataDecryptedObject,
	IExecuteFunctions,
	INodeProperties,
	ISupplyDataFunctions,
} from 'n8n-workflow';
import { NodeOperationError } from 'n8n-workflow';

type AzureAuthContext = ISupplyDataFunctions | IExecuteFunctions;

/**
 * The published npm package version, read from package.json at runtime so it
 * stays in sync automatically instead of being hand-maintained in each node.
 * Falls back to 'unknown' if package.json can't be resolved for any reason
 * (e.g. an unusual install layout) so this never breaks node loading.
 */
export const packageVersion: string = (() => {
	try {
		// eslint-disable-next-line @typescript-eslint/no-require-imports
		return (require('../../package.json') as { version: string }).version;
	} catch {
		return 'unknown';
	}
})();

export type AzureAuthenticationMethod = 'apiKey' | 'oAuth2';

export interface ResolvedAzureAuth {
	endpoint: string;
	apiVersion: string;
	/** The value to send as the api-key / Bearer token */
	token: string;
	authentication: AzureAuthenticationMethod;
}

interface OAuthTokenData {
	access_token?: string;
	expires_in?: number;
	expires_at?: number;
	exp?: number; // JWT standard expiry claim
	refresh_token?: string;
}

/** The node property added to every node that offers a choice of authentication method. */
export const azureAuthenticationProperty: INodeProperties = {
	displayName: 'Authentication',
	name: 'authentication',
	type: 'options',
	noDataExpression: true,
	options: [
		{
			name: 'Microsoft OAuth2',
			value: 'oAuth2',
			description: 'Authenticate using a Microsoft Entra ID OAuth2 flow',
		},
		{
			name: 'API Key',
			value: 'apiKey',
			description: 'Authenticate using a traditional Azure OpenAI API key',
		},
	],
	default: 'oAuth2',
};

/** The two credential entries a node should declare so the correct one is required per auth method. */
export const azureCredentialsDescriptor = [
	{
		name: 'azureOpenAiMsOAuth2Api',
		required: true,
		displayOptions: {
			show: {
				authentication: ['oAuth2'],
			},
		},
	},
	{
		name: 'azureOpenAiApiKeyApi',
		required: true,
		displayOptions: {
			show: {
				authentication: ['apiKey'],
			},
		},
	},
];

/**
 * Decode JWT token to extract claims (without validation)
 * Returns the payload as a JSON object
 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function decodeJWT(token: string): any {
	try {
		const parts = token.split('.');
		if (parts.length !== 3) {
			return null;
		}
		const payload = parts[1];
		const base64 = payload.replace(/-/g, '+').replace(/_/g, '/');
		const jsonPayload = Buffer.from(base64, 'base64').toString('utf8');
		return JSON.parse(jsonPayload);
	} catch {
		return null;
	}
}

/**
 * Get the current OAuth2 access token from credentials.
 * If the token is expired or about to expire, either triggers n8n's automatic
 * OAuth2 refresh (via a probe request) or performs a manual refresh_token grant.
 */
async function getCurrentOAuthToken(
	context: AzureAuthContext,
	credentials: ICredentialDataDecryptedObject,
	deploymentName?: string,
): Promise<string> {
	const oauthData = credentials.oauthTokenData as OAuthTokenData;

	if (!oauthData?.access_token) {
		throw new NodeOperationError(
			context.getNode(),
			'OAuth2 access token not found. Please reconnect your credentials.',
		);
	}

	const decodedToken = decodeJWT(oauthData.access_token);
	const tokenExp = decodedToken?.exp;
	const expiryTime = tokenExp || oauthData.expires_at || oauthData.exp;

	if (!expiryTime && oauthData.expires_in) {
		context.logger.warn(
			`Token only has expires_in (${oauthData.expires_in}s) without timestamp - cannot determine exact expiry. Will rely on 401 retry logic.`,
		);
	}

	if (!expiryTime) {
		context.logger.warn(
			'Token does not have expires_at or exp field - cannot proactively refresh. Will rely on 401 retry logic.',
		);
		return oauthData.access_token;
	}

	const now = Math.floor(Date.now() / 1000);
	const expiresAt = expiryTime;

	const credentialBufferTime = credentials.refreshBeforeExpirySeconds as number | undefined;
	let bufferTime = 900; // Default: 15 minutes
	if (credentialBufferTime !== undefined && credentialBufferTime >= 60 && credentialBufferTime <= 3600) {
		bufferTime = credentialBufferTime;
	}

	if (now < expiresAt - bufferTime) {
		context.logger.info(`✓ Token still valid, expires in ${Math.floor((expiresAt - now) / 60)} minutes`);
		return oauthData.access_token;
	}

	const isExpired = now >= expiresAt;
	context.logger.info(
		`Token ${isExpired ? 'expired' : 'expiring soon'} (expires at ${new Date(expiresAt * 1000).toISOString()}), triggering refresh...`,
	);

	if (isExpired) {
		try {
			const testUrl = `${credentials.endpoint}openai/deployments/${deploymentName}/chat/completions?api-version=${credentials.apiVersion}`;

			await context.helpers.httpRequestWithAuthentication.call(context, 'azureOpenAiMsOAuth2Api', {
				url: testUrl,
				method: 'POST',
				body: { messages: [{ role: 'user', content: 'test' }], max_tokens: 1 },
				json: true,
			});

			const refreshedCredentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
			const refreshedOauthData = refreshedCredentials.oauthTokenData as OAuthTokenData;

			if (refreshedOauthData?.access_token && refreshedOauthData.access_token !== oauthData.access_token) {
				context.logger.info('✅ SUCCESS: Token refreshed via HTTP request (n8n OAuth2)');
				return refreshedOauthData.access_token;
			}

			return oauthData.access_token;
		} catch (httpError) {
			context.logger.warn('HTTP request failed, falling back to manual refresh', {
				error: (httpError as Error).message,
			});
			// Fall through to manual refresh
		}
	}

	if (!oauthData.refresh_token) {
		context.logger.warn('No refresh token available - cannot refresh proactively');
		return oauthData.access_token;
	}

	try {
		const tokenUrl = credentials.accessTokenUrl as string;
		const apiScope = credentials.apiScope as string;
		const scope = `offline_access ${apiScope}`;

		const response = await context.helpers.request({
			method: 'POST',
			url: tokenUrl,
			headers: {
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: new URLSearchParams({
				grant_type: 'refresh_token',
				refresh_token: oauthData.refresh_token,
				client_id: credentials.clientId as string,
				client_secret: credentials.clientSecret as string,
				scope,
			}).toString(),
			json: false,
		});

		const tokenData = JSON.parse(response as string);
		if (tokenData.access_token) {
			context.logger.info('✅ SUCCESS: Token refreshed via manual refresh_token grant');
			return tokenData.access_token;
		}
	} catch (refreshError) {
		context.logger.error('❌ FAILED: Manual token refresh failed', {
			error: (refreshError as Error).message,
		});
	}

	return oauthData.access_token;
}

/**
 * Resolve the endpoint/apiVersion/token to use for a request, based on the node's
 * selected `authentication` parameter (API Key vs Microsoft OAuth2).
 */
export async function resolveAzureOpenAiAuth(
	context: AzureAuthContext,
	itemIndex: number,
	deploymentName?: string,
): Promise<ResolvedAzureAuth> {
	const authentication = context.getNodeParameter('authentication', itemIndex, 'oAuth2') as AzureAuthenticationMethod;

	if (authentication === 'apiKey') {
		const credentials = await context.getCredentials('azureOpenAiApiKeyApi');

		if (!credentials.endpoint) {
			throw new NodeOperationError(context.getNode(), 'Endpoint is required in credentials');
		}

		return {
			endpoint: (credentials.endpoint as string).replace(/\/+$/, ''),
			apiVersion: credentials.apiVersion as string,
			token: credentials.apiKey as string,
			authentication,
		};
	}

	const credentials = await context.getCredentials('azureOpenAiMsOAuth2Api');

	if (!credentials.endpoint) {
		throw new NodeOperationError(context.getNode(), 'Endpoint is required in credentials');
	}

	const token = await getCurrentOAuthToken(context, credentials, deploymentName);

	return {
		endpoint: (credentials.endpoint as string).replace(/\/+$/, ''),
		apiVersion: credentials.apiVersion as string,
		token,
		authentication,
	};
}
