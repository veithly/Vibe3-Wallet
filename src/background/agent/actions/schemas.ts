export interface ActionSchema {
  name: string;
  description: string;
  schema: any; // Using any instead of zod type
}

// Basic action types
export interface DoneAction {
  text: string;
  success: boolean;
}

export interface SearchGoogleAction {
  intent?: string;
  query: string;
}

export interface GoToUrlAction {
  intent?: string;
  url: string;
}

export interface GoBackAction {
  intent?: string;
}

export interface ClickElementAction {
  intent?: string;
  index: number;
  xpath?: string | null;
}

export interface InputTextAction {
  intent?: string;
  index: number;
  text: string;
  xpath?: string | null;
}

export interface SwitchTabAction {
  intent?: string;
  tab_id: number;
}

export interface OpenTabAction {
  intent?: string;
  url: string;
}

export interface CloseTabAction {
  intent?: string;
  tab_id: number;
}

export interface CacheContentAction {
  intent?: string;
  content: string;
}

export interface ScrollToPercentAction {
  intent?: string;
  yPercent: number;
  index?: number | null;
}

export interface ScrollToTopAction {
  intent?: string;
  index?: number | null;
}

export interface ScrollToBottomAction {
  intent?: string;
  index?: number | null;
}

export interface PreviousPageAction {
  intent?: string;
  index?: number | null;
}

export interface NextPageAction {
  intent?: string;
  index?: number | null;
}

export interface ScrollToTextAction {
  intent?: string;
  text: string;
  nth?: number;
}

export interface SendKeysAction {
  intent?: string;
  keys: string;
}

export interface GetDropdownOptionsAction {
  intent?: string;
  index: number;
}

export interface SelectDropdownOptionAction {
  intent?: string;
  index: number;
  text: string;
}

export interface WaitAction {
  intent?: string;
  seconds?: number;
}

// Schema definitions (simplified without zod)
export const doneActionSchema: ActionSchema = {
  name: 'done',
  description: 'Complete task',
  schema: null, // Simplified - no validation
};

export const searchGoogleActionSchema: ActionSchema = {
  name: 'search_google',
  description:
    'Search the query in Google in the current tab, the query should be a search query like humans search in Google, concrete and not vague or super long. More the single most important items.',
  schema: null,
};

export const goToUrlActionSchema: ActionSchema = {
  name: 'go_to_url',
  description: 'Navigate to URL in the current tab',
  schema: null,
};

export const goBackActionSchema: ActionSchema = {
  name: 'go_back',
  description: 'Go back to the previous page',
  schema: null,
};

export const clickElementActionSchema: ActionSchema = {
  name: 'click_element',
  description: 'Click element by index',
  schema: null,
};

export const inputTextActionSchema: ActionSchema = {
  name: 'input_text',
  description: 'Input text into an interactive input element',
  schema: null,
};

export const switchTabActionSchema: ActionSchema = {
  name: 'switch_tab',
  description: 'Switch to tab by tab id',
  schema: null,
};

export const openTabActionSchema: ActionSchema = {
  name: 'open_tab',
  description: 'Open URL in new tab',
  schema: null,
};

export const closeTabActionSchema: ActionSchema = {
  name: 'close_tab',
  description: 'Close tab by tab id',
  schema: null,
};

export const cacheContentActionSchema: ActionSchema = {
  name: 'cache_content',
  description:
    'Cache what you have found so far from the current page for future use',
  schema: null,
};

export const scrollToPercentActionSchema: ActionSchema = {
  name: 'scroll_to_percent',
  description:
    'Scrolls to a particular vertical percentage of the document or an element. If no index of element is specified, scroll the whole document.',
  schema: null,
};

export const scrollToTopActionSchema: ActionSchema = {
  name: 'scroll_to_top',
  description: 'Scroll the document in the window or an element to the top',
  schema: null,
};

export const scrollToBottomActionSchema: ActionSchema = {
  name: 'scroll_to_bottom',
  description: 'Scroll the document in the window or an element to the bottom',
  schema: null,
};

export const previousPageActionSchema: ActionSchema = {
  name: 'previous_page',
  description:
    'Scroll the document in the window or an element to the previous page. If no index is specified, scroll the whole document.',
  schema: null,
};

export const nextPageActionSchema: ActionSchema = {
  name: 'next_page',
  description:
    'Scroll the document in the window or an element to the next page. If no index is specified, scroll the whole document.',
  schema: null,
};

export const scrollToTextActionSchema: ActionSchema = {
  name: 'scroll_to_text',
  description:
    'If you dont find something which you want to interact with in current viewport, try to scroll to it',
  schema: null,
};

export const sendKeysActionSchema: ActionSchema = {
  name: 'send_keys',
  description:
    'Send strings of special keys like Backspace, Insert, PageDown, Delete, Enter. Shortcuts such as `Control+o`, `Control+Shift+T` are supported as well. This gets used in keyboard press. Be aware of different operating systems and their shortcuts',
  schema: null,
};

export const getDropdownOptionsActionSchema: ActionSchema = {
  name: 'get_dropdown_options',
  description: 'Get all options from a native dropdown',
  schema: null,
};

export const selectDropdownOptionActionSchema: ActionSchema = {
  name: 'select_dropdown_option',
  description:
    'Select dropdown option for interactive element index by the text of the option you want to select',
  schema: null,
};

export const waitActionSchema: ActionSchema = {
  name: 'wait',
  description:
    'Wait for x seconds default 3, do NOT use this action unless user asks to wait explicitly',
  schema: null,
};
