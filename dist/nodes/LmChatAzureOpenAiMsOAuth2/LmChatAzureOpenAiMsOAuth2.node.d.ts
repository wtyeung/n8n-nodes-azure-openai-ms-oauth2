import type { ILoadOptionsFunctions, INodeListSearchResult, ISupplyDataFunctions, INodeType, INodeTypeDescription, SupplyData } from 'n8n-workflow';
export declare class LmChatAzureOpenAiMsOAuth2 implements INodeType {
    description: INodeTypeDescription;
    methods: {
        listSearch: {
            getModels(this: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult>;
        };
    };
    supplyData(this: ISupplyDataFunctions, itemIndex: number): Promise<SupplyData>;
}
