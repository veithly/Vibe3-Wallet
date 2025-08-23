import type { AgentContext } from '../types';
import type { BaseChatModel } from '@langchain/core/language_models/chat_models';
import { BrowserAction } from './browser-actions';
import { Web3Action } from './web3-actions';

// Import type guards and schemas
import * as schemaImports from './schemas';
import * as web3SchemaImports from './web3-schemas';

// Type validation functions using type guards
export function validateActionParams(actionName: string, params: any): boolean {
  switch (actionName) {
    case 'click':
      return schemaImports.isClickElementActionParams(params);
    case 'inputText':
      return schemaImports.isInputTextActionParams(params);
    case 'scroll':
      return schemaImports.isScrollToPercentActionParams(params);
    case 'navigate':
      return schemaImports.isGoToUrlActionParams(params);
    case 'back':
      return schemaImports.isGoBackActionParams(params);
    case 'forward':
      return schemaImports.isGoForwardActionParams(params);
    case 'done':
      return schemaImports.isDoneActionParams(params);
    case 'switchTab':
      return schemaImports.isSwitchTabActionParams(params);
    case 'openTab':
      return schemaImports.isOpenTabActionParams(params);
    case 'closeTab':
      return schemaImports.isCloseTabActionParams(params);
    case 'scrollToText':
      return schemaImports.isScrollToTextActionParams(params);
    case 'sendKeys':
      return schemaImports.isSendKeysActionParams(params);
    case 'getDropdownOptions':
      return schemaImports.isGetDropdownOptionsActionParams(params);
    case 'selectDropdownOption':
      return schemaImports.isSelectDropdownOptionActionParams(params);
    case 'wait':
      return schemaImports.isWaitActionParams(params);

    // Web3 actions
    case 'addLiquidity':
      return web3SchemaImports.isAddLiquidityActionParams(params);
    case 'removeLiquidity':
      return web3SchemaImports.isRemoveLiquidityActionParams(params);

    case 'interactWithContract':
      return web3SchemaImports.isInteractWithContractActionParams(params);
    case 'signMessage':
      return web3SchemaImports.isSignMessageActionParams(params);
    case 'signTypedData':
      return web3SchemaImports.isSignTypedDataActionParams(params);

    case 'getNFTs':
      return web3SchemaImports.isGetNFTsActionParams(params);
    // case 'getTransactionHistory':
    //   return web3SchemaImports.isGetTransactionHistoryActionParams(params);
    case 'getGasPrice':
      return web3SchemaImports.isGetGasPriceActionParams(params);
    case 'estimateGas':
      return web3SchemaImports.isEstimateGasActionParams(params);

    default:
      // For legacy actions without specific type guards, do basic validation
      return typeof params === 'object' && params !== null;
  }
}

export interface ActionRegistry {
  [key: string]: {
    schema: any;
    handler?: any;
    description: string;
    validate?: (params: any) => boolean;
  };
}

export class ActionBuilder {
  private readonly context: AgentContext;
  private readonly extractorLLM: BaseChatModel;
  private readonly browserAction: BrowserAction;
  private readonly web3Action: Web3Action;
  private actionRegistry: ActionRegistry = {};

  constructor(context: AgentContext, extractorLLM: BaseChatModel) {
    this.context = context;
    this.extractorLLM = extractorLLM;
    this.browserAction = new BrowserAction(context);
    this.web3Action = new Web3Action(context);
    this.initializeActionRegistry();
  }

  private initializeActionRegistry() {
    // Initialize basic actions (placeholder for actual action implementations)
    this.actionRegistry = {
      // Basic Web Actions
      click: {
        schema: schemaImports.clickElementActionSchema,
        description: 'Click element by index',
        validate: (params: any) => validateActionParams('click', params),
        handler: this.browserAction,
      },
      inputText: {
        schema: schemaImports.inputTextActionSchema,
        description: 'Input text into an interactive input element',
        validate: (params: any) => validateActionParams('inputText', params),
        handler: this.browserAction,
      },
      scroll: {
        schema: schemaImports.scrollToPercentActionSchema,
        description: 'Scroll to percentage of document',
        validate: (params: any) => validateActionParams('scroll', params),
        handler: this.browserAction,
      },
      navigate: {
        schema: schemaImports.goToUrlActionSchema,
        description: 'Navigate to URL in the current tab',
        validate: (params: any) => validateActionParams('navigate', params),
        handler: this.browserAction,
      },
      done: {
        schema: schemaImports.doneActionSchema,
        description: 'Complete task',
        validate: (params: any) => validateActionParams('done', params),
        // handler: new DoneAction(this.context),
      },
      back: {
        schema: schemaImports.goBackActionSchema,
        description: 'Go back to the previous page',
        validate: (params: any) => validateActionParams('back', params),
        // handler: new BackAction(this.context),
      },
      forward: {
        schema: schemaImports.goForwardActionSchema,
        description: 'Go forward to the next page',
        validate: (params: any) => validateActionParams('forward', params),
        // handler: new ForwardAction(this.context),
      },
      newTab: {
        schema: schemaImports.openTabActionSchema,
        description: 'Open URL in new tab',
        validate: (params: any) => validateActionParams('openTab', params),
        handler: this.browserAction,
      },
      switchTab: {
        schema: schemaImports.switchTabActionSchema,
        description: 'Switch to tab by tab id',
        validate: (params: any) => validateActionParams('switchTab', params),
        handler: this.browserAction,
      },
      closeTab: {
        schema: schemaImports.closeTabActionSchema,
        description: 'Close tab by tab id',
        validate: (params: any) => validateActionParams('closeTab', params),
        handler: this.browserAction,
      },
      getTabs: {
        schema: {
          name: 'get_tabs',
          description: 'Get all open tabs',
        },
        description: 'Get all open tabs',
        validate: (params: any) =>
          typeof params === 'object' && params !== null,
        // handler: new GetTabsAction(this.context),
      },
      noop: {
        schema: { name: 'noop', description: 'No operation' },
        description: 'No operation',
        validate: (params: any) =>
          typeof params === 'object' && params !== null,
        // handler: new NoOpAction(this.context),
      },
      answer: {
        schema: {
          name: 'answer',
          description: 'Provide answer',
        },
        description: 'Provide answer',
        validate: (params: any) =>
          typeof params === 'object' && typeof params.answer === 'string',
        // handler: new AnswerAction(this.context),
      },
      extractInfo: {
        schema: {
          name: 'extract_info',
          description: 'Extract information',
        },
        description: 'Extract information',
        validate: (params: any) =>
          typeof params === 'object' && typeof params.goal === 'string',
        // handler: new ExtractInfoAction(this.context, this.extractorLLM),
      },
      wait: {
        schema: schemaImports.waitActionSchema,
        description: 'Wait for specified seconds',
        validate: (params: any) => validateActionParams('wait', params),
        handler: this.browserAction,
      },
      addLiquidity: {
        schema: web3SchemaImports.addLiquidityActionSchema,
        description: 'Add liquidity to a liquidity pool',
        validate: (params: any) => validateActionParams('addLiquidity', params),
        handler: this.web3Action,
      },
      removeLiquidity: {
        schema: web3SchemaImports.removeLiquidityActionSchema,
        description: 'Remove liquidity from a liquidity pool',
        validate: (params: any) =>
          validateActionParams('removeLiquidity', params),
        handler: this.web3Action,
      },
      interactWithContract: {
        schema: web3SchemaImports.interactWithContractActionSchema,
        description: 'Interact with a smart contract (read or write)',
        validate: (params: any) =>
          validateActionParams('interactWithContract', params),
        handler: this.web3Action,
      },
      signMessage: {
        schema: web3SchemaImports.signMessageActionSchema,
        description: 'Sign a message with the wallet',
        validate: (params: any) => validateActionParams('signMessage', params),
        handler: this.web3Action,
      },
      signTypedData: {
        schema: web3SchemaImports.signTypedDataActionSchema,
        description: 'Sign typed data (EIP-712) with the wallet',
        validate: (params: any) =>
          validateActionParams('signTypedData', params),
        handler: this.web3Action,
      },
      getNFTs: {
        schema: web3SchemaImports.getNFTsActionSchema,
        description: 'Get NFTs owned by an address',
        validate: (params: any) => validateActionParams('getNFTs', params),
        handler: this.web3Action,
      },
      // getTransactionHistory: {
      //   schema: web3SchemaImports.getTransactionHistoryActionSchema,
      //   description: 'Get transaction history for an address',
      //   validate: (params: any) =>
      //     validateActionParams('getTransactionHistory', params),
      //   handler: this.web3Action,
      // },
      getGasPrice: {
        schema: web3SchemaImports.getGasPriceActionSchema,
        description: 'Get current gas price for a network',
        validate: (params: any) => validateActionParams('getGasPrice', params),
        handler: this.web3Action,
      },
      estimateGas: {
        schema: web3SchemaImports.estimateGasActionSchema,
        description: 'Estimate gas cost for a transaction',
        validate: (params: any) => validateActionParams('estimateGas', params),
        handler: this.web3Action,
      },
    };
  }

  buildDefaultActions() {
    return this.actionRegistry;
  }

  buildWeb3Actions() {
    const web3Actions: ActionRegistry = {};

    // Extract only Web3 actions
    Object.keys(this.actionRegistry).forEach((key) => {
      if (this.isWeb3Action(key)) {
        web3Actions[key] = this.actionRegistry[key];
      }
    });

    return web3Actions;
  }

  buildBasicActions() {
    const basicActions: ActionRegistry = {};

    // Extract only basic actions
    Object.keys(this.actionRegistry).forEach((key) => {
      if (!this.isWeb3Action(key)) {
        basicActions[key] = this.actionRegistry[key];
      }
    });

    return basicActions;
  }

  getActionSchema(actionName: string) {
    return this.actionRegistry[actionName]?.schema;
  }

  getActionDescription(actionName: string) {
    return this.actionRegistry[actionName]?.description;
  }

  validateActionParams(actionName: string, params: any): boolean {
    const action = this.actionRegistry[actionName];
    if (!action) return false;

    if (action.validate) {
      return action.validate(params);
    }

    // Fallback to generic validation
    return validateActionParams(actionName, params);
  }

  getAllActionNames() {
    return Object.keys(this.actionRegistry);
  }

  getWeb3ActionNames() {
    return Object.keys(this.actionRegistry).filter((key) =>
      this.isWeb3Action(key)
    );
  }

  getBasicActionNames() {
    return Object.keys(this.actionRegistry).filter(
      (key) => !this.isWeb3Action(key)
    );
  }

  private isWeb3Action(actionName: string): boolean {
    const web3ActionPatterns = [
      'addLiquidity',
      'removeLiquidity',
      'interactWithContract',
      'signMessage',
      'signTypedData',
      'getNFTs',
      'getGasPrice',
      'estimateGas',
    ];

    return web3ActionPatterns.includes(actionName);
  }

  registerCustomAction(
    name: string,
    schema: any,
    handler?: any,
    description?: string,
    validate?: (params: any) => boolean
  ) {
    this.actionRegistry[name] = {
      schema,
      handler,
      description: description || `Custom action: ${name}`,
      validate:
        validate ||
        ((params: any) => typeof params === 'object' && params !== null),
    };
  }

  unregisterAction(name: string) {
    delete this.actionRegistry[name];
  }
}

// Legacy compatibility
export class LegacyActionBuilder {
  private readonly context: AgentContext;
  private readonly extractorLLM: BaseChatModel;
  constructor(context: AgentContext, extractorLLM: BaseChatModel) {
    this.context = context;
    this.extractorLLM = extractorLLM;
  }

  buildDefaultActions() {
    // Return basic actions in legacy format
    return {
      click: null, // new ClickAction(this.context),
      inputText: null, // new InputTextAction(this.context),
      scroll: null, // new ScrollAction(this.context),
      navigate: null, // new NavigateAction(this.context),
      done: null, // new DoneAction(this.context),
      back: null, // new BackAction(this.context),
      forward: null, // new ForwardAction(this.context),
      newTab: null, // new NewTabAction(this.context),
      switchTab: null, // new SwitchTabAction(this.context),
      closeTab: null, // new CloseTabAction(this.context),
      getTabs: null, // new GetTabsAction(this.context),
      noop: null, // new NoOpAction(this.context),
      answer: null, // new AnswerAction(this.context),
      extractInfo: null, // new ExtractInfoAction(this.context, this.extractorLLM),
      wait: null, // new WaitAction(this.context),
    };
  }
}
