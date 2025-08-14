// Type definitions for action schemas without zod dependency
export interface ActionSchema {
  name: string;
  description: string;
  // Type validation is handled at runtime
}

// Type definitions for action parameters
export interface DoneActionParams {
  text: string;
  success: boolean;
}

// Basic Navigation Actions
export interface SearchGoogleActionParams {
  intent?: string;
  query: string;
}

export interface GoToUrlActionParams {
  intent?: string;
  url: string;
}

export interface GoBackActionParams {
  intent?: string;
}

export interface GoForwardActionParams {
  intent?: string;
}

export interface ClickElementActionParams {
  intent?: string;
  index: number;
  xpath?: string | null;
}

export interface InputTextActionParams {
  intent?: string;
  index: number;
  text: string;
  xpath?: string | null;
}

// Tab Management Actions
export interface SwitchTabActionParams {
  intent?: string;
  tab_id: number;
}

export interface OpenTabActionParams {
  intent?: string;
  url: string;
}

export interface CloseTabActionParams {
  intent?: string;
  tab_id: number;
}

// Scroll Actions
export interface ScrollToPercentActionParams {
  intent?: string;
  yPercent: number;
  index?: number | null;
}

export interface ScrollToTopActionParams {
  intent?: string;
  index?: number | null;
}

export interface ScrollToBottomActionParams {
  intent?: string;
  index?: number | null;
}

export interface ScrollToTextActionParams {
  intent?: string;
  text: string;
  nth?: number;
}

// Utility Actions
export interface SendKeysActionParams {
  intent?: string;
  keys: string;
}

export interface GetDropdownOptionsActionParams {
  intent?: string;
  index: number;
}

export interface SelectDropdownOptionActionParams {
  intent?: string;
  index: number;
  text: string;
}

export interface WaitActionParams {
  intent?: string;
  seconds?: number;
}

// Enhanced schemas with TypeScript interfaces matching nanobrowser patterns
export const doneActionSchema: ActionSchema = {
  name: 'done',
  description: 'Complete task',
};

// Basic Navigation Actions
export const searchGoogleActionSchema: ActionSchema = {
  name: 'search_google',
  description:
    'Search the query in Google in the current tab, the query should be a search query like humans search in Google, concrete and not vague or super long. More the single most important items.',
};

export const goToUrlActionSchema: ActionSchema = {
  name: 'go_to_url',
  description: 'Navigate to URL in the current tab',
};

export const goBackActionSchema: ActionSchema = {
  name: 'go_back',
  description: 'Go back to the previous page',
};

export const goForwardActionSchema: ActionSchema = {
  name: 'go_forward',
  description: 'Go forward to the next page',
};

export const clickElementActionSchema: ActionSchema = {
  name: 'click_element',
  description: 'Click element by index',
};

export const inputTextActionSchema: ActionSchema = {
  name: 'input_text',
  description: 'Input text into an interactive input element',
};

// Tab Management Actions
export const switchTabActionSchema: ActionSchema = {
  name: 'switch_tab',
  description: 'Switch to tab by tab id',
};

export const openTabActionSchema: ActionSchema = {
  name: 'open_tab',
  description: 'Open URL in new tab',
};

export const closeTabActionSchema: ActionSchema = {
  name: 'close_tab',
  description: 'Close tab by tab id',
};

// Scroll Actions
export const scrollToPercentActionSchema: ActionSchema = {
  name: 'scroll_to_percent',
  description:
    'Scrolls to a particular vertical percentage of the document or an element. If no index of element is specified, scroll the whole document.',
};

export const scrollToTopActionSchema: ActionSchema = {
  name: 'scroll_to_top',
  description: 'Scroll the document in the window or an element to the top',
};

export const scrollToBottomActionSchema: ActionSchema = {
  name: 'scroll_to_bottom',
  description: 'Scroll the document in the window or an element to the bottom',
};

export const scrollToTextActionSchema: ActionSchema = {
  name: 'scroll_to_text',
  description:
    'If you dont find something which you want to interact with in current viewport, try to scroll to it',
};

// Utility Actions
export const sendKeysActionSchema: ActionSchema = {
  name: 'send_keys',
  description:
    'Send strings of special keys like Backspace, Insert, PageDown, Delete, Enter. Shortcuts such as `Control+o`, `Control+Shift+T` are supported as well. This gets used in keyboard press. Be aware of different operating systems and their shortcuts',
};

export const getDropdownOptionsActionSchema: ActionSchema = {
  name: 'get_dropdown_options',
  description: 'Get all options from a native dropdown',
};

export const selectDropdownOptionActionSchema: ActionSchema = {
  name: 'select_dropdown_option',
  description:
    'Select dropdown option for interactive element index by the text of the option you want to select',
};

export const waitActionSchema: ActionSchema = {
  name: 'wait',
  description:
    'Wait for x seconds default 3, do NOT use this action unless user asks to wait explicitly',
};

// Type guard functions for runtime validation
export function isDoneActionParams(obj: any): obj is DoneActionParams {
  return (
    typeof obj === 'object' &&
    typeof obj.text === 'string' &&
    typeof obj.success === 'boolean'
  );
}

export function isSearchGoogleActionParams(
  obj: any
): obj is SearchGoogleActionParams {
  return typeof obj === 'object' && typeof obj.query === 'string';
}

export function isGoToUrlActionParams(obj: any): obj is GoToUrlActionParams {
  return typeof obj === 'object' && typeof obj.url === 'string';
}

export function isGoBackActionParams(obj: any): obj is GoBackActionParams {
  return typeof obj === 'object';
}

export function isGoForwardActionParams(
  obj: any
): obj is GoForwardActionParams {
  return typeof obj === 'object';
}

export function isClickElementActionParams(
  obj: any
): obj is ClickElementActionParams {
  return typeof obj === 'object' && typeof obj.index === 'number';
}

export function isInputTextActionParams(
  obj: any
): obj is InputTextActionParams {
  return (
    typeof obj === 'object' &&
    typeof obj.index === 'number' &&
    typeof obj.text === 'string'
  );
}

export function isSwitchTabActionParams(
  obj: any
): obj is SwitchTabActionParams {
  return typeof obj === 'object' && typeof obj.tab_id === 'number';
}

export function isOpenTabActionParams(obj: any): obj is OpenTabActionParams {
  return typeof obj === 'object' && typeof obj.url === 'string';
}

export function isCloseTabActionParams(obj: any): obj is CloseTabActionParams {
  return typeof obj === 'object' && typeof obj.tab_id === 'number';
}

export function isScrollToPercentActionParams(
  obj: any
): obj is ScrollToPercentActionParams {
  return typeof obj === 'object' && typeof obj.yPercent === 'number';
}

export function isScrollToTextActionParams(
  obj: any
): obj is ScrollToTextActionParams {
  return typeof obj === 'object' && typeof obj.text === 'string';
}

export function isSendKeysActionParams(obj: any): obj is SendKeysActionParams {
  return typeof obj === 'object' && typeof obj.keys === 'string';
}

export function isGetDropdownOptionsActionParams(
  obj: any
): obj is GetDropdownOptionsActionParams {
  return typeof obj === 'object' && typeof obj.index === 'number';
}

export function isSelectDropdownOptionActionParams(
  obj: any
): obj is SelectDropdownOptionActionParams {
  return (
    typeof obj === 'object' &&
    typeof obj.index === 'number' &&
    typeof obj.text === 'string'
  );
}

export function isWaitActionParams(obj: any): obj is WaitActionParams {
  return typeof obj === 'object';
}

// Legacy interface compatibility (for backward compatibility)
export interface ClickableSchema {
  tag: string;
  properties?: Record<string, any>;
}

export interface InputTextSchema {
  tag: string;
  properties?: Record<string, any>;
  text: string;
}

export interface ScrollSchema {
  direction: 'up' | 'down';
  amount: number;
}

export interface NavigateSchema {
  url: string;
}

export interface DoneSchema {}

export interface BackSchema {}

export interface ForwardSchema {}

export interface NewTabSchema {}

export interface SwitchTabSchema {
  tabIndex: number;
}

export interface CloseTabSchema {
  tabIndex: number;
}

export interface GetTabsSchema {}

export interface NoOpSchema {}

export interface AnswerSchema {
  answer: string;
}

export interface ExtractInfoSchema {
  schema: Record<string, any>;
}

export interface WaitSchema {
  seconds: number;
}
