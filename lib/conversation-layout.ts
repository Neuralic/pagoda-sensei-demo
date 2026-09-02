/**
 * Conversation pages fill the scrollable app shell below the global header.
 * Parent is `flex-1 min-h-0 overflow-y-auto` in root layout — use full height of that pane.
 */
export const CONVERSATION_PAGE_CLASS =
  "relative flex flex-col min-h-0 overflow-hidden h-full bg-background px-5 pt-2 pb-3";

export const CONVERSATION_TOOLBAR_CLASS = "shrink-0 mb-2";

export const CONVERSATION_MAIN_ROW_CLASS =
  "flex flex-col lg:flex-row gap-4 flex-1 min-h-0 w-full overflow-hidden";
