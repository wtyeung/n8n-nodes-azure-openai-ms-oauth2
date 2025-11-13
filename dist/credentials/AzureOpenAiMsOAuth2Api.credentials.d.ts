import type { IAuthenticateGeneric, ICredentialTestRequest, ICredentialType, INodeProperties } from 'n8n-workflow';
export declare class AzureOpenAiMsOAuth2Api implements ICredentialType {
    name: string;
    extends: string[];
    displayName: string;
    documentationUrl: string;
    icon: "file:azure-openai.svg";
    properties: INodeProperties[];
    authenticate: IAuthenticateGeneric;
    test: ICredentialTestRequest;
}
