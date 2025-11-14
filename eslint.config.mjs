import { config } from '@n8n/node-cli/eslint';

export default [
	...config,
	{
		rules: {
			// Disable restricted imports check since this is a self-hosted only node
			// that requires @langchain/openai and langchain as peer dependencies
			'@n8n/community-nodes/no-restricted-imports': 'off',
		},
	},
];
