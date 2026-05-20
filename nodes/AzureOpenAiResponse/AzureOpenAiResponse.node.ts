import type {
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
} from 'n8n-workflow';
import { NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

type ContentItem =
	| { type: 'input_text'; text: string }
	| { type: 'input_image'; image_url: string }
	| { type: 'input_file'; filename: string; file_data: string };

export class AzureOpenAiResponse implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Azure OpenAI Response (MS OAuth2)',
		name: 'azureOpenAiResponseMsOAuth2',
		icon: 'file:azure-openai.svg',
		group: ['transform'],
		version: 1,
		subtitle: '={{$parameter["model"]}}',
		description: 'Call the Azure OpenAI Responses API with text, image, or file inputs using MS OAuth2',
		defaults: {
			name: 'Azure OpenAI Response',
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
				displayName: 'Model',
				name: 'model',
				type: 'string',
				default: 'gpt-4o',
				required: true,
				description: 'The model deployment name to use (e.g. gpt-4o, gpt-4.1, gpt-5.5)',
				placeholder: 'gpt-4o',
				noDataExpression: false,
			},
			{
				displayName: 'Instructions',
				name: 'instructions',
				type: 'string',
				default: '',
				description: 'System-level instructions for the model (system prompt)',
				typeOptions: {
					rows: 4,
				},
			},
			{
				displayName: 'Input Content',
				name: 'inputContent',
				type: 'fixedCollection',
				typeOptions: {
					multipleValues: true,
				},
				placeholder: 'Add Content Item',
				default: { items: [{ type: 'input_text', text: '' }] },
				description: 'The content items to send in the user message. Add text, images, or PDF files.',
				options: [
					{
						name: 'items',
						displayName: 'Content Item',
						values: [
							{
								displayName: 'Type',
								name: 'type',
								type: 'options',
								default: 'input_text',
								noDataExpression: false,
								options: [
									{
										name: 'Text',
										value: 'input_text',
										description: 'Plain text input',
									},
									{
										name: 'Image URL',
										value: 'input_image_url',
										description: 'Image from a URL (PNG, JPEG, WEBP)',
									},
									{
										name: 'Image (Binary)',
										value: 'input_image_binary',
										description: 'Image from n8n binary data (PNG, JPEG, WEBP)',
									},
									{
										name: 'File / PDF (Binary)',
										value: 'input_file_binary',
										description: 'PDF or file from n8n binary data',
									},
								],
							},
							{
								displayName: 'Text',
								name: 'text',
								type: 'string',
								default: '',
								description: 'The text content to send',
								typeOptions: {
									rows: 3,
								},
								displayOptions: {
									show: {
										type: ['input_text'],
									},
								},
							},
							{
								displayName: 'Image URL',
								name: 'imageUrl',
								type: 'string',
								default: '',
								description: 'The URL of the image to send',
								placeholder: 'https://example.com/image.png',
								displayOptions: {
									show: {
										type: ['input_image_url'],
									},
								},
							},
							{
								displayName: 'Binary Property',
								name: 'binaryProperty',
								type: 'string',
								default: 'data',
								description: 'Name of the binary property in the input item that contains the image or file data',
								displayOptions: {
									show: {
										type: ['input_image_binary', 'input_file_binary'],
									},
								},
							},
							{
								displayName: 'Filename',
								name: 'filename',
								type: 'string',
								default: 'document.pdf',
								description: 'Filename to use when sending the file to the API',
								displayOptions: {
									show: {
										type: ['input_file_binary'],
									},
								},
							},
						],
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				options: [
					{
						displayName: 'Response Format',
						name: 'responseFormat',
						type: 'options',
						default: 'text',
						options: [
							{
								name: 'Text',
								value: 'text',
								description: 'Regular text response',
							},
							{
								name: 'JSON Object',
								value: 'json_object',
								description: 'Forces the model to return valid JSON. Include "json" in your instructions.',
							},
						],
					},
					{
						displayName: 'Temperature',
						name: 'temperature',
						type: 'number',
						default: 1,
						typeOptions: {
							minValue: 0,
							maxValue: 2,
							numberPrecision: 1,
						},
						description: 'Controls randomness. Lower values are more deterministic, higher values more creative.',
					},
					{
						displayName: 'Max Output Tokens',
						name: 'maxOutputTokens',
						type: 'number',
						default: 4096,
						description: 'Maximum number of tokens to generate in the response',
					},
					{
						displayName: 'Previous Response ID',
						name: 'previousResponseId',
						type: 'string',
						default: '',
						description: 'ID of a previous response to chain conversations. Leave empty for a new conversation.',
						placeholder: 'resp_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx',
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
				const model = this.getNodeParameter('model', itemIndex) as string;
				const instructions = this.getNodeParameter('instructions', itemIndex, '') as string;
				const inputContent = this.getNodeParameter('inputContent', itemIndex, { items: [] }) as {
					items: Array<{
						type: string;
						text?: string;
						imageUrl?: string;
						binaryProperty?: string;
						filename?: string;
					}>;
				};
				const options = this.getNodeParameter('options', itemIndex, {}) as {
					responseFormat?: string;
					temperature?: number;
					maxOutputTokens?: number;
					previousResponseId?: string;
				};

				const credentials = await this.getCredentials('azureOpenAiMsOAuth2Api');
				const endpoint = credentials.endpoint as string;
				const apiVersion = credentials.apiVersion as string;

				if (!endpoint) {
					throw new NodeOperationError(
						this.getNode(),
						'Endpoint is not configured in credentials',
						{ itemIndex },
					);
				}

				// Build the content array from fixedCollection items
				const contentItems: ContentItem[] = [];

				for (const item of inputContent.items ?? []) {
					if (item.type === 'input_text') {
						if (!item.text) {
							throw new NodeOperationError(
								this.getNode(),
								'Text content item is empty',
								{ itemIndex },
							);
						}
						contentItems.push({ type: 'input_text', text: item.text });
					} else if (item.type === 'input_image_url') {
						if (!item.imageUrl) {
							throw new NodeOperationError(
								this.getNode(),
								'Image URL content item is empty',
								{ itemIndex },
							);
						}
						contentItems.push({ type: 'input_image', image_url: item.imageUrl });
					} else if (item.type === 'input_image_binary') {
						const binaryProp = item.binaryProperty ?? 'data';
						const binaryData = this.helpers.assertBinaryData(itemIndex, binaryProp);
						const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryProp);
						const base64 = buffer.toString('base64');
						contentItems.push({
							type: 'input_image',
							image_url: `data:${binaryData.mimeType};base64,${base64}`,
						});
					} else if (item.type === 'input_file_binary') {
						const binaryProp = item.binaryProperty ?? 'data';
						const binaryData = this.helpers.assertBinaryData(itemIndex, binaryProp);
						const buffer = await this.helpers.getBinaryDataBuffer(itemIndex, binaryProp);
						const base64 = buffer.toString('base64');
						const filename = item.filename ?? binaryData.fileName ?? 'document.pdf';
						contentItems.push({
							type: 'input_file',
							filename,
							file_data: `data:${binaryData.mimeType};base64,${base64}`,
						});
					}
				}

				if (contentItems.length === 0) {
					throw new NodeOperationError(
						this.getNode(),
						'At least one input content item is required',
						{ itemIndex },
					);
				}

				// Build the request body
				const body: Record<string, unknown> = {
					model,
					input: [
						{
							role: 'user',
							content: contentItems,
						},
					],
				};

				if (instructions) {
					body.instructions = instructions;
				}

				if (options.responseFormat) {
					body.text = {
						format: {
							type: options.responseFormat,
						},
					};
				}

				if (options.temperature !== undefined) {
					body.temperature = options.temperature;
				}

				if (options.maxOutputTokens) {
					body.max_output_tokens = options.maxOutputTokens;
				}

				if (options.previousResponseId) {
					body.previous_response_id = options.previousResponseId;
				}

				const url = `${endpoint}openai/responses?api-version=${apiVersion}`;

				this.logger.debug(`Calling Azure OpenAI Responses API: ${url} with model: ${model}`);

				const response = await this.helpers.httpRequestWithAuthentication.call(
					this,
					'azureOpenAiMsOAuth2Api',
					{
						method: 'POST',
						url,
						body,
						json: true,
					},
				);

				this.logger.debug(`Response received, id: ${response.id}, status: ${response.status}`);

				returnData.push({
					json: {
						output_text: response.output_text ?? '',
						id: response.id,
						model: response.model,
						status: response.status,
						usage: response.usage,
						output: response.output,
					},
					pairedItem: { item: itemIndex },
				});
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
