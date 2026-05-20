import type {
	IExecuteFunctions,
	ILoadOptionsFunctions,
	INodeExecutionData,
	INodeListSearchResult,
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
				type: 'resourceLocator',
				default: {
					mode: 'list',
					value: (() => {
						const modelsEnv = process.env.AZURE_OPENAI_MODELS || '*gpt-4o,gpt-4,gpt-35-turbo';
						const defaultModel = modelsEnv.split(',').map(m => m.trim()).find(m => m.startsWith('*'));
						return defaultModel ? defaultModel.replace(/^\*/, '') : '';
					})(),
				},
				required: true,
				description: 'The model deployment name. Mark default with * in AZURE_OPENAI_MODELS env var (e.g. "*gpt-4o,gpt-4.1,gpt-5.5")',
				displayOptions: {
					hide: {
						inputMode: ['rawJson'],
					},
				},
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
									errorMessage: 'Model name cannot be empty',
								},
							},
						],
						placeholder: 'e.g. gpt-4o',
					},
				],
			},
			{
				displayName: 'Input Mode',
				name: 'inputMode',
				type: 'options',
				noDataExpression: true,
				default: 'fields',
				options: [
					{
						name: 'Fields',
						value: 'fields',
						description: 'Build the input using form fields',
					},
					{
						name: 'JSON (Input Array)',
						value: 'json',
						description: 'Provide the input[] array as JSON — model, instructions and options still apply',
					},
					{
						name: 'Raw JSON (Full Payload)',
						value: 'rawJson',
						description: 'Provide the entire request body as JSON — supports n8n expressions',
					},
				],
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
				displayOptions: {
					show: {
						inputMode: ['fields'],
					},
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
				displayOptions: {
					show: {
						inputMode: ['fields'],
					},
				},
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
								default: '',
								placeholder: 'Leave empty to use filename from binary data',
								description: 'Filename to send to the API. If left empty, uses the filename from the binary object.',
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
				displayName: 'Raw Payload (JSON)',
				name: 'rawJsonPayload',
				type: 'string',
				default: '',
				required: true,
				description: 'The full request body as a JSON string. Supports n8n expressions. Must include at least "model" and "input". Authentication headers are added automatically.',
				hint: 'Tip: use {{ JSON.stringify($json.payload) }} to pass a payload from a previous node',
				typeOptions: {
					rows: 12,
				},
				displayOptions: {
					show: {
						inputMode: ['rawJson'],
					},
				},
			},
			{
				displayName: 'Instructions',
				name: 'instructionsJson',
				type: 'string',
				default: '',
				description: 'System-level instructions for the model (system prompt)',
				typeOptions: {
					rows: 4,
				},
				displayOptions: {
					show: {
						inputMode: ['json'],
					},
				},
			},
			{
				displayName: 'Input (JSON)',
				name: 'inputJson',
				type: 'json',
				default: '[\n  {\n    "role": "user",\n    "content": [\n      {\n        "type": "input_text",\n        "text": "Hello!"\n      }\n    ]\n  }\n]',
				required: true,
				description: 'The input array as raw JSON. Must be an array of message objects with role and content.',
				typeOptions: {
					rows: 10,
				},
				displayOptions: {
					show: {
						inputMode: ['json'],
					},
				},
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

	methods = {
		listSearch: {
			async getModels(
				this: ILoadOptionsFunctions,
				filter?: string,
			): Promise<INodeListSearchResult> {
				const modelsEnv = process.env.AZURE_OPENAI_MODELS || '*gpt-4o,gpt-4,gpt-35-turbo';
				const models = modelsEnv.split(',').map(m => m.trim()).filter(m => m.length > 0);
				const filteredModels = filter
					? models.filter(m => m.replace(/^\*/, '').toLowerCase().includes(filter.toLowerCase()))
					: models;
				const sortedModels = filteredModels.sort((a, b) => {
					if (a.startsWith('*') && !b.startsWith('*')) return -1;
					if (!a.startsWith('*') && b.startsWith('*')) return 1;
					return 0;
				});
				return {
					results: sortedModels.map(model => {
						const isDefault = model.startsWith('*');
						const modelName = model.replace(/^\*/, '');
						return {
							name: isDefault ? `${modelName} (default)` : modelName,
							value: modelName,
						};
					}),
				};
			},
		},
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const modelParam = this.getNodeParameter('model', itemIndex) as { mode: string; value: string } | string;
				const model = typeof modelParam === 'string' ? modelParam : modelParam.value;
				const inputMode = this.getNodeParameter('inputMode', itemIndex, 'fields') as string;
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

				// Build the request body
				const body: Record<string, unknown> = { model };

				if (inputMode === 'rawJson') {
					// Raw JSON mode: user provides entire payload — parse and use directly
					const rawJsonPayload = this.getNodeParameter('rawJsonPayload', itemIndex) as string;

					let parsedBody: unknown;
					try {
						parsedBody = typeof rawJsonPayload === 'string' ? JSON.parse(rawJsonPayload) : rawJsonPayload;
					} catch {
						throw new NodeOperationError(
							this.getNode(),
							'Raw Payload (JSON) is not valid JSON',
							{ itemIndex },
						);
					}

					if (typeof parsedBody !== 'object' || parsedBody === null || Array.isArray(parsedBody)) {
						throw new NodeOperationError(
							this.getNode(),
							'Raw Payload (JSON) must be a JSON object',
							{ itemIndex },
						);
					}

					// Use the raw body directly — skip size check and options merging below
					const rawUrl = `${endpoint}openai/responses?api-version=${apiVersion}`;
					const rawPayloadSize = Buffer.byteLength(rawJsonPayload, 'utf8');
					const maxSize = 20 * 1024 * 1024;
					if (rawPayloadSize > maxSize) {
						throw new NodeOperationError(
							this.getNode(),
							`Payload size (${(rawPayloadSize / 1024 / 1024).toFixed(2)} MB) exceeds the 20MB limit.`,
							{ itemIndex },
						);
					}
					this.logger.debug(`Raw payload size: ${(rawPayloadSize / 1024 / 1024).toFixed(2)} MB`);
					this.logger.debug(`Calling Azure OpenAI Responses API: ${rawUrl}`);

					const rawResponse = await this.helpers.httpRequestWithAuthentication.call(
						this,
						'azureOpenAiMsOAuth2Api',
						{
							method: 'POST',
							url: rawUrl,
							body: parsedBody,
							json: true,
						},
					);

					returnData.push({
						json: {
							output_text: rawResponse.output_text ?? '',
							id: rawResponse.id,
							model: rawResponse.model,
							status: rawResponse.status,
							usage: rawResponse.usage,
							output: rawResponse.output,
						},
						pairedItem: { item: itemIndex },
					});
					continue;

				} else if (inputMode === 'json') {
					// JSON mode: user provides raw input array and optional instructions
					const instructionsJson = this.getNodeParameter('instructionsJson', itemIndex, '') as string;
					const inputJsonRaw = this.getNodeParameter('inputJson', itemIndex) as string;

					let parsedInput: unknown;
					try {
						parsedInput = typeof inputJsonRaw === 'string' ? JSON.parse(inputJsonRaw) : inputJsonRaw;
					} catch {
						throw new NodeOperationError(
							this.getNode(),
							'Input (JSON) is not valid JSON',
							{ itemIndex },
						);
					}

					if (!Array.isArray(parsedInput)) {
						throw new NodeOperationError(
							this.getNode(),
							'Input (JSON) must be an array of message objects',
							{ itemIndex },
						);
					}

					body.input = parsedInput;
					if (instructionsJson) {
						body.instructions = instructionsJson;
					}
				} else {
					// Fields mode: build content array from fixedCollection
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
							const filename = item.filename || binaryData.fileName || 'document.pdf';
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

					body.input = [{ role: 'user', content: contentItems }];
					if (instructions) {
						body.instructions = instructions;
					}
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

				// Check payload size — Azure OpenAI Responses API limit is 20MB
				const payloadSize = Buffer.byteLength(JSON.stringify(body), 'utf8');
				const maxPayloadSize = 20 * 1024 * 1024; // 20MB in bytes
				if (payloadSize > maxPayloadSize) {
					throw new NodeOperationError(
						this.getNode(),
						`Payload size (${(payloadSize / 1024 / 1024).toFixed(2)} MB) exceeds the 20MB limit. Reduce the size of your input files or text.`,
						{ itemIndex },
					);
				}
				this.logger.debug(`Payload size: ${(payloadSize / 1024 / 1024).toFixed(2)} MB`);

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
