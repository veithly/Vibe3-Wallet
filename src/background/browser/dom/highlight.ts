export async function highlightElement(
  tabId: number,
  elementId: string
): Promise<void> {
  await chrome.debugger.sendCommand({ tabId }, 'DOM.highlightNode', {
    nodeId: elementId,
  });
}
