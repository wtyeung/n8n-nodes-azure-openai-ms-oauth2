"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LmChatAzureOpenAiMsOAuth2 = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const openai_1 = require("@langchain/openai");
class LmChatAzureOpenAiMsOAuth2 {
    constructor() {
        this.description = {
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
                    displayName: 'If using JSON response format, you must include word "json" in the prompt. Also, make sure to select latest models released post November 2023.',
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
                    description: 'The deployment name (not model name) configured in your Azure OpenAI resource. <a href="https://learn.microsoft.com/en-us/azure/ai-services/openai/how-to/create-resource">Learn more</a>.',
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
                            description: "Positive values penalize new tokens based on their existing frequency in the text so far, decreasing the model's likelihood to repeat the same line verbatim",
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
                            description: 'The maximum number of tokens to generate in the completion. Use -1 for default.',
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
                            description: "Positive values penalize new tokens based on whether they appear in the text so far, increasing the model's likelihood to talk about new topics",
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
                                    description: 'Enables JSON mode, which should guarantee the message the model generates is valid JSON',
                                },
                            ],
                        },
                        {
                            displayName: 'Sampling Temperature',
                            name: 'temperature',
                            default: 0.7,
                            typeOptions: { maxValue: 2, minValue: 0, numberPrecision: 1 },
                            description: 'Controls randomness: Lowering results in less random completions. As the temperature approaches zero, the model will become deterministic and repetitive.',
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
                            description: 'Controls diversity via nucleus sampling: 0.5 means half of all likelihood-weighted options are considered. We generally recommend altering this or temperature but not both.',
                            type: 'number',
                        },
                    ],
                },
            ],
        };
    }
    async supplyData(itemIndex) {
        var _a, _b;
        const credentials = await this.getCredentials('azureOpenAiMsOAuth2Api');
        const deploymentName = this.getNodeParameter('deploymentName', itemIndex);
        const options = this.getNodeParameter('options', itemIndex, {});
        if (!credentials.endpoint) {
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'Endpoint is required in credentials');
        }
        const oauthData = credentials.oauthTokenData;
        if (!(oauthData === null || oauthData === void 0 ? void 0 : oauthData.access_token)) {
            throw new n8n_workflow_1.NodeOperationError(this.getNode(), 'OAuth2 access token not found. Please reconnect your credentials.');
        }
        const endpoint = credentials.endpoint.replace(/\/$/, '');
        const model = new openai_1.AzureChatOpenAI({
            azureOpenAIApiDeploymentName: deploymentName,
            azureOpenAIApiKey: 'dummy-key',
            azureOpenAIEndpoint: endpoint,
            azureOpenAIApiVersion: credentials.apiVersion,
            configuration: {
                defaultHeaders: {
                    Authorization: `Bearer ${oauthData.access_token}`,
                },
            },
            maxTokens: options.maxTokens !== -1 ? options.maxTokens : undefined,
            temperature: options.temperature,
            topP: options.topP,
            frequencyPenalty: options.frequencyPenalty,
            presencePenalty: options.presencePenalty,
            timeout: (_a = options.timeout) !== null && _a !== void 0 ? _a : 60000,
            maxRetries: (_b = options.maxRetries) !== null && _b !== void 0 ? _b : 2,
            modelKwargs: options.responseFormat
                ? {
                    response_format: { type: options.responseFormat },
                }
                : undefined,
        });
        return {
            response: model,
        };
    }
}
exports.LmChatAzureOpenAiMsOAuth2 = LmChatAzureOpenAiMsOAuth2;
//# sourceMappingURL=LmChatAzureOpenAiMsOAuth2.node.js.map