import {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';

export class TokenRefresh implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Azure OpenAI Token Refresh',
		name: 'tokenRefresh',
		icon: 'file:azure-openai.svg',
		group: ['transform'],
		version: 1,
		description: 'Ensures Azure OpenAI OAuth2 token is fresh before workflow execution',
		defaults: {
			name: 'Token Refresh',
		},
		inputs: ['main'],
		outputs: ['main'],
		credentials: [
			{
				name: 'azureOpenAiMsOAuth2Api',
				required: true,
			},
		],
		properties: [],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		
		// Make a lightweight test request to trigger token refresh if needed
		// This uses n8n's httpRequestWithAuthentication which handles OAuth2 refresh
		try {
			const credentials = await this.getCredentials('azureOpenAiMsOAuth2Api');
			
			this.logger.info('Token Refresh: Making test request to ensure token is fresh...');
			
			// Make a minimal request that will trigger 401 if token is expired
			await this.helpers.httpRequestWithAuthentication.call(
				this,
				'azureOpenAiMsOAuth2Api',
				{
					url: `${credentials.endpoint}openai/deployments?api-version=${credentials.apiVersion}`,
					method: 'GET',
				},
			);
			
			this.logger.info('Token Refresh: Token is valid');
		} catch (error: any) {
			// If the request fails, n8n should have already refreshed the token
			// Log the error but continue - the token should be fresh now
			this.logger.info('Token Refresh: Test request completed (may have triggered refresh)', {
				error: error.message,
			});
		}
		
		// Pass through the input data unchanged
		return [items];
	}
}
