"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.LmChatAzureOpenAiMsOAuth2 = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const azureOpenAiAuth_1 = require("../shared/azureOpenAiAuth");
class LmChatAzureOpenAiMsOAuth2 {
    constructor() {
        this.description = {
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
            outputs: [n8n_workflow_1.NodeConnectionTypes.AiLanguageModel],
            outputNames: ['Model'],
            credentials: azureOpenAiAuth_1.azureCredentialsDescriptor,
            requestDefaults: {
                ignoreHttpStatusErrors: true,
                baseURL: '={{ $credentials.endpoint }}',
            },
            properties: [
                azureOpenAiAuth_1.azureAuthenticationProperty,
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
                    displayName: 'Model',
                    name: 'deploymentName',
                    type: 'resourceLocator',
                    default: {
                        mode: 'list',
                        value: (() => {
                            const modelsEnv = process.env.AZURE_OPENAI_MODELS || '*gpt-4o,gpt-4,gpt-35-turbo';
                            const defaultModel = modelsEnv.split(',')
                                .map(m => m.trim())
                                .find(m => m.startsWith('*'));
                            return defaultModel ? defaultModel.replace(/^\*/, '') : '';
                        })()
                    },
                    required: true,
                    description: 'The deployment name configured in your Azure OpenAI resource. Mark default with * in AZURE_OPENAI_MODELS (e.g., "*gpt-4o,gpt-4,gpt-35-turbo")',
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
        this.methods = {
            listSearch: {
                async getModels(filter) {
                    const modelsEnv = process.env.AZURE_OPENAI_MODELS || '*gpt-4o,gpt-4,gpt-35-turbo';
                    const models = modelsEnv.split(',').map(m => m.trim()).filter(m => m.length > 0);
                    const filteredModels = filter
                        ? models.filter(m => {
                            const modelName = m.replace(/^\*/, '');
                            return modelName.toLowerCase().includes(filter.toLowerCase());
                        })
                        : models;
                    const sortedModels = filteredModels.sort((a, b) => {
                        const aIsDefault = a.startsWith('*');
                        const bIsDefault = b.startsWith('*');
                        if (aIsDefault && !bIsDefault)
                            return -1;
                        if (!aIsDefault && bIsDefault)
                            return 1;
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
    }
    async supplyData(itemIndex) {
        var _a, _b;
        this.logger.info('=== supplyData called for Azure OpenAI Chat Model (MS OAuth2) v1.5.3 ===');
        const deploymentNameParam = this.getNodeParameter('deploymentName', itemIndex);
        const deploymentName = typeof deploymentNameParam === 'string'
            ? deploymentNameParam
            : deploymentNameParam.value;
        const options = this.getNodeParameter('options', itemIndex, {});
        const auth = await (0, azureOpenAiAuth_1.resolveAzureOpenAiAuth)(this, itemIndex, deploymentName);
        const { AzureChatOpenAI } = await Promise.resolve().then(() => __importStar(require('@langchain/openai')));
        const { N8nLlmTracing } = await Promise.resolve().then(() => __importStar(require('./N8nLlmTracing')));
        const timeout = (_a = options.timeout) !== null && _a !== void 0 ? _a : 60000;
        const model = new AzureChatOpenAI({
            model: deploymentName,
            azureOpenAIApiDeploymentName: deploymentName,
            azureOpenAIApiKey: auth.token,
            azureOpenAIEndpoint: auth.endpoint,
            azureOpenAIApiVersion: auth.apiVersion,
            maxTokens: options.maxTokens !== -1 ? options.maxTokens : undefined,
            temperature: options.temperature,
            topP: options.topP,
            frequencyPenalty: options.frequencyPenalty,
            presencePenalty: options.presencePenalty,
            timeout,
            maxRetries: (_b = options.maxRetries) !== null && _b !== void 0 ? _b : 2,
            modelKwargs: options.responseFormat
                ? {
                    response_format: { type: options.responseFormat },
                }
                : undefined,
            streaming: false,
            useResponsesApi: false,
            callbacks: [new N8nLlmTracing(this)],
        });
        return {
            response: model,
        };
    }
}
exports.LmChatAzureOpenAiMsOAuth2 = LmChatAzureOpenAiMsOAuth2;
//# sourceMappingURL=LmChatAzureOpenAiMsOAuth2.node.js.map