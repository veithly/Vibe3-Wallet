import type {
  CoordinateSet,
  HashedDomElement,
  ViewportInfo,
} from './history/view';
import { HistoryTreeProcessor } from './history/service';

export abstract class DOMBaseNode {
  isVisible: boolean;
  parent: DOMElementNodeSnapshot | null;

  constructor(isVisible: boolean, parent?: DOMElementNodeSnapshot | null) {
    this.isVisible = isVisible;
    // Use None as default and set parent later to avoid circular reference issues
    this.parent = parent ?? null;
  }
}

export class DOMTextNode extends DOMBaseNode {
  type = 'TEXT_NODE' as const;
  text: string;

  constructor(
    text: string,
    isVisible: boolean,
    parent?: DOMElementNodeSnapshot | null
  ) {
    super(isVisible, parent);
    this.text = text;
  }

  hasParentWithHighlightIndex(): boolean {
    let current = this.parent;
    while (current != null) {
      if (current.highlightIndex !== null) {
        return true;
      }
      current = current.parent;
    }
    return false;
  }

  isParentInViewport(): boolean {
    if (this.parent === null) {
      return false;
    }
    return this.parent.isInViewport;
  }

  isParentTopElement(): boolean {
    if (this.parent === null) {
      return false;
    }
    return this.parent.isTopElement;
  }
}

// Renamed to avoid conflict with DOMElementNode from views.ts
export class DOMElementNodeSnapshot extends DOMBaseNode {
  tagName: string | null;
  xpath: string | null;
  attributes: Record<string, string>;
  children: DOMBaseNode[];
  isInteractive: boolean;
  isTopElement: boolean;
  isInViewport: boolean;
  shadowRoot: boolean;
  highlightIndex: number | null;
  viewportCoordinates?: CoordinateSet;
  pageCoordinates?: CoordinateSet;
  viewportInfo?: ViewportInfo;
  isNew: boolean | null;

  constructor(params: {
    tagName: string | null;
    xpath: string | null;
    attributes: Record<string, string>;
    children: DOMBaseNode[];
    isVisible: boolean;
    isInteractive?: boolean;
    isTopElement?: boolean;
    isInViewport?: boolean;
    shadowRoot?: boolean;
    highlightIndex?: number | null;
    viewportCoordinates?: CoordinateSet;
    pageCoordinates?: CoordinateSet;
    viewportInfo?: ViewportInfo;
    isNew?: boolean | null;
    parent?: DOMElementNodeSnapshot | null;
  }) {
    super(params.isVisible, params.parent);
    this.tagName = params.tagName;
    this.xpath = params.xpath;
    this.attributes = params.attributes;
    this.children = params.children;
    this.isInteractive = params.isInteractive ?? false;
    this.isTopElement = params.isTopElement ?? false;
    this.isInViewport = params.isInViewport ?? false;
    this.shadowRoot = params.shadowRoot ?? false;
    this.highlightIndex = params.highlightIndex ?? null;
    this.viewportCoordinates = params.viewportCoordinates;
    this.pageCoordinates = params.pageCoordinates;
    this.viewportInfo = params.viewportInfo;
    this.isNew = params.isNew ?? null;
  }

  private _hashedValue?: HashedDomElement;
  private _hashPromise?: Promise<HashedDomElement>;

  async hash(): Promise<HashedDomElement> {
    if (this._hashedValue) {
      return this._hashedValue;
    }

    if (!this._hashPromise) {
      this._hashPromise = HistoryTreeProcessor.hashDomElement(this as any)
        .then((result: HashedDomElement) => {
          this._hashedValue = result;
          this._hashPromise = undefined;
          return result;
        })
        .catch((error: Error) => {
          this._hashPromise = undefined;
          console.error('Error computing DOM element hash:', error);
          const enhancedError = new Error(
            `Failed to hash DOM element (${this.tagName || 'unknown'}): ${
              error.message
            }`
          );
          if (error.stack) {
            enhancedError.stack = error.stack;
          }
          throw enhancedError;
        });
    }

    return this._hashPromise;
  }

  clearHashCache(): void {
    this._hashedValue = undefined;
    this._hashPromise = undefined;
  }

  getAllTextTillNextClickableElement(maxDepth = -1): string {
    const textParts: string[] = [];

    const collectText = (node: DOMBaseNode, currentDepth: number): void => {
      if (maxDepth !== -1 && currentDepth > maxDepth) {
        return;
      }

      if (
        node instanceof DOMElementNodeSnapshot &&
        node !== this &&
        node.highlightIndex !== null
      ) {
        return;
      }

      if (node instanceof DOMTextNode) {
        textParts.push(node.text);
      } else if (node instanceof DOMElementNodeSnapshot) {
        for (const child of node.children) {
          collectText(child, currentDepth + 1);
        }
      }
    };

    collectText(this, 0);
    return textParts.join('\n').trim();
  }

  clickableElementsToString(includeAttributes: string[] = []): string {
    const formattedText: string[] = [];

    const processNode = (node: DOMBaseNode, depth: number): void => {
      let nextDepth = depth;
      const depthStr = '\t'.repeat(depth);

      if (node instanceof DOMElementNodeSnapshot) {
        if (node.highlightIndex !== null) {
          formattedText.push(
            `${depthStr}[${node.highlightIndex}] Something...`
          );
          nextDepth++;
        }

        for (const child of node.children) {
          processNode(child, nextDepth);
        }
      }
    };

    processNode(this, 0);
    return formattedText.join('\n');
  }
}
