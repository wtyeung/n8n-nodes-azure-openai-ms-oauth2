"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LmChatAzureOpenAiMsOAuth2 = void 0;
const n8n_workflow_1 = require("n8n-workflow");
const openai_1 = require("@langchain/openai");
async function getCurrentToken(context, deploymentName) {
    var _a;
    const credentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
    const oauthData = credentials.oauthTokenData;
    context.logger.info('Getting current token', {
        hasToken: !!(oauthData === null || oauthData === void 0 ? void 0 : oauthData.access_token),
        hasExpiresAt: !!(oauthData === null || oauthData === void 0 ? void 0 : oauthData.expires_at),
        hasExp: !!(oauthData === null || oauthData === void 0 ? void 0 : oauthData.exp),
        expiresAt: (oauthData === null || oauthData === void 0 ? void 0 : oauthData.expires_at) ? new Date(oauthData.expires_at * 1000).toISOString() : 'not set',
        exp: (oauthData === null || oauthData === void 0 ? void 0 : oauthData.exp) ? new Date(oauthData.exp * 1000).toISOString() : 'not set',
        allFields: Object.keys(oauthData || {})
    });
    if (!(oauthData === null || oauthData === void 0 ? void 0 : oauthData.access_token)) {
        throw new n8n_workflow_1.NodeOperationError(context.getNode(), 'OAuth2 access token not found. Please reconnect your credentials.');
    }
    let expiryTime = oauthData.expires_at || oauthData.exp;
    const FORCE_REFRESH_FOR_TESTING = false;
    if (FORCE_REFRESH_FOR_TESTING) {
        context.logger.info('TEST MODE: Forcing token refresh to test mechanism...');
        context.logger.info('TEST MODE: Making test request to trigger OAuth2 refresh...');
        try {
            const testUrl = `${credentials.endpoint}openai/deployments/${deploymentName}/chat/completions?api-version=${credentials.apiVersion}`;
            context.logger.info('TEST MODE: Test URL:', { url: testUrl });
            await context.helpers.httpRequestWithAuthentication.call(context, 'azureOpenAiMsOAuth2Api', {
                url: testUrl,
                method: 'POST',
                body: { messages: [{ role: 'user', content: 'test' }] },
                json: true,
            });
            context.logger.info('TEST MODE: Test request succeeded');
            const refreshedCredentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
            const refreshedOauthData = refreshedCredentials.oauthTokenData;
            if (refreshedOauthData === null || refreshedOauthData === void 0 ? void 0 : refreshedOauthData.access_token) {
                const tokenChanged = refreshedOauthData.access_token !== oauthData.access_token;
                context.logger.info('TEST MODE: Token refresh test completed', {
                    tokenChanged,
                    oldTokenPrefix: oauthData.access_token.substring(0, 20),
                    newTokenPrefix: refreshedOauthData.access_token.substring(0, 20)
                });
                return refreshedOauthData.access_token;
            }
        }
        catch (error) {
            context.logger.error('TEST MODE: Token refresh test failed', {
                error: error.message,
                statusCode: error.statusCode,
                response: error.response
            });
        }
    }
    if (!expiryTime && oauthData.expires_in) {
        context.logger.warn(`Token only has expires_in (${oauthData.expires_in}s) without timestamp - cannot determine exact expiry. Will rely on 401 retry logic.`);
    }
    if (expiryTime) {
        const now = Math.floor(Date.now() / 1000);
        const expiresAt = expiryTime;
        const bufferTime = 300;
        if (now >= expiresAt - bufferTime) {
            context.logger.info(`Token expired or expiring soon (expires at ${new Date(expiresAt * 1000).toISOString()}), triggering refresh via test request...`);
            try {
                await context.helpers.httpRequestWithAuthentication.call(context, 'azureOpenAiMsOAuth2Api', {
                    url: `${credentials.endpoint}openai/deployments?api-version=${credentials.apiVersion}`,
                    method: 'GET',
                });
                context.logger.info('Test request succeeded, fetching refreshed credentials...');
                const refreshedCredentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
                const refreshedOauthData = refreshedCredentials.oauthTokenData;
                if ((refreshedOauthData === null || refreshedOauthData === void 0 ? void 0 : refreshedOauthData.access_token) && refreshedOauthData.access_token !== oauthData.access_token) {
                    context.logger.info('Token refreshed successfully - new token received');
                    return refreshedOauthData.access_token;
                }
                else if (refreshedOauthData === null || refreshedOauthData === void 0 ? void 0 : refreshedOauthData.access_token) {
                    context.logger.info('Token still valid after test request');
                    return refreshedOauthData.access_token;
                }
            }
            catch (error) {
                context.logger.error('Token refresh test request failed', {
                    error: error.message,
                    status: error.statusCode || error.status,
                    response: ((_a = error.response) === null || _a === void 0 ? void 0 : _a.body) || error.response
                });
                try {
                    const refreshedCredentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
                    const refreshedOauthData = refreshedCredentials.oauthTokenData;
                    if ((refreshedOauthData === null || refreshedOauthData === void 0 ? void 0 : refreshedOauthData.access_token) && refreshedOauthData.access_token !== oauthData.access_token) {
                        context.logger.info('Token was refreshed despite error');
                        return refreshedOauthData.access_token;
                    }
                }
                catch (e) {
                    context.logger.error('Failed to fetch credentials after error', { error: e });
                }
            }
        }
        else {
            context.logger.info(`Token still valid, expires in ${Math.floor((expiresAt - now) / 60)} minutes`);
        }
    }
    else {
        context.logger.warn('Token does not have expires_at or exp field - cannot proactively refresh. Will rely on 401 retry logic.');
    }
    return oauthData.access_token;
}
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
        this.logger.info('=== supplyData called for Azure OpenAI Chat Model (MS OAuth2) v1.2.0 ===');
        const deploymentName = this.getNodeParameter('deploymentName', itemIndex);
        const options = this.getNodeParameter('options', itemIndex, {});
        const context = this;
        const getCredentialsWithFreshToken = async () => {
            const credentials = await context.getCredentials('azureOpenAiMsOAuth2Api');
            if (!credentials.endpoint) {
                throw new n8n_workflow_1.NodeOperationError(context.getNode(), 'Endpoint is required in credentials');
            }
            const accessToken = await getCurrentToken(context, deploymentName);
            return {
                endpoint: credentials.endpoint.replace(/\/$/, ''),
                apiVersion: credentials.apiVersion,
                accessToken,
            };
        };
        const initialCreds = await getCredentialsWithFreshToken();
        const model = new openai_1.AzureChatOpenAI({
            azureOpenAIApiDeploymentName: deploymentName,
            azureOpenAIApiKey: initialCreds.accessToken,
            azureOpenAIEndpoint: initialCreds.endpoint,
            azureOpenAIApiVersion: initialCreds.apiVersion,
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
        const modelMethods = Object.getOwnPropertyNames(Object.getPrototypeOf(model)).filter(m => typeof model[m] === 'function');
        context.logger.info('Model methods available:', { methods: modelMethods });
        const originalInvoke = model.invoke.bind(model);
        const originalStream = model.stream.bind(model);
        const originalCall = model.call ? model.call.bind(model) : null;
        const originalGenerate = model.generate ? model.generate.bind(model) : null;
        model.invoke = async function (input, options) {
            var _a;
            context.logger.info('=== Model invoke() called - fetching fresh credentials ===');
            const freshCreds = await getCredentialsWithFreshToken();
            this.azureOpenAIApiKey = freshCreds.accessToken;
            context.logger.info('Token injected into model, calling original invoke');
            try {
                return await originalInvoke(input, options);
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.status) === 401 || ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status) === 401) {
                    context.logger.info('Received 401 error, retrying with fresh token...');
                    const retryCreds = await getCredentialsWithFreshToken();
                    this.azureOpenAIApiKey = retryCreds.accessToken;
                    return await originalInvoke(input, options);
                }
                throw error;
            }
        };
        model.stream = async function (input, options) {
            var _a;
            context.logger.info('=== Model stream() called - fetching fresh credentials ===');
            const freshCreds = await getCredentialsWithFreshToken();
            this.azureOpenAIApiKey = freshCreds.accessToken;
            try {
                return await originalStream(input, options);
            }
            catch (error) {
                if ((error === null || error === void 0 ? void 0 : error.status) === 401 || ((_a = error === null || error === void 0 ? void 0 : error.response) === null || _a === void 0 ? void 0 : _a.status) === 401) {
                    context.logger.info('Received 401 error, retrying with fresh token...');
                    const retryCreds = await getCredentialsWithFreshToken();
                    this.azureOpenAIApiKey = retryCreds.accessToken;
                    return await originalStream(input, options);
                }
                throw error;
            }
        };
        if (originalCall) {
            model.call = async function (...args) {
                context.logger.info('=== Model call() called - fetching fresh credentials ===');
                const freshCreds = await getCredentialsWithFreshToken();
                this.azureOpenAIApiKey = freshCreds.accessToken;
                return await originalCall(...args);
            };
        }
        if (originalGenerate) {
            model.generate = async function (...args) {
                context.logger.info('=== Model generate() called - fetching fresh credentials ===');
                const freshCreds = await getCredentialsWithFreshToken();
                this.azureOpenAIApiKey = freshCreds.accessToken;
                return await originalGenerate(...args);
            };
        }
        return {
            response: model,
        };
    }
}
exports.LmChatAzureOpenAiMsOAuth2 = LmChatAzureOpenAiMsOAuth2;
//# sourceMappingURL=LmChatAzureOpenAiMsOAuth2.node.js.map