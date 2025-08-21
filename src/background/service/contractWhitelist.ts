import { createPersistStore } from '@/background/utils';

export interface WhitelistEntry {
  address: string;
  name?: string;
  addedAt: number;
  origin?: string;
  chainId?: number;
}

export interface WhitelistStore {
  contracts: WhitelistEntry[];
}

class ContractWhitelistService {
  store: WhitelistStore = {
    contracts: [],
  };

  init = async () => {
    const storage = await createPersistStore<WhitelistStore>({
      name: 'contractWhitelist',
      // Ensure a stable default shape so downstream .some/.filter never crash
      template: {
        contracts: [],
      },
    });
    this.store = storage || this.store;
    // Defensive: normalize legacy or malformed storage
    if (!Array.isArray((this.store as any).contracts)) {
      (this.store as any).contracts = [];
    }
  };

  /**
   * Add a contract address to whitelist
   */
  addToWhitelist = (
    address: string,
    options?: {
      name?: string;
      origin?: string;
      chainId?: number;
    }
  ) => {
    if (!address) return;
    if (!this.store || !Array.isArray((this.store as any).contracts)) {
      this.store = { contracts: [] } as WhitelistStore;
    }
    const normalizedAddress = address.toLowerCase();

    // Check if already exists
    const existingIndex = (this.store.contracts || []).findIndex(
      (entry) => entry.address === normalizedAddress
    );

    if (existingIndex >= 0) {
      // Update existing entry
      this.store.contracts[existingIndex] = {
        ...this.store.contracts[existingIndex],
        ...options,
        addedAt: Date.now(),
      };
    } else {
      // Add new entry
      this.store.contracts.push({
        address: normalizedAddress,
        name: options?.name,
        origin: options?.origin,
        chainId: options?.chainId,
        addedAt: Date.now(),
      });
    }
  };

  /**
   * Remove a contract address from whitelist
   */
  removeFromWhitelist = (address: string) => {
    if (!address) return;
    if (!this.store || !Array.isArray((this.store as any).contracts)) {
      this.store = { contracts: [] } as WhitelistStore;
    }
    const normalizedAddress = address.toLowerCase();
    this.store.contracts = (this.store.contracts || []).filter(
      (entry) => entry.address !== normalizedAddress
    );
  };

  /**
   * Check if a contract address is whitelisted
   */
  isWhitelisted = (address: string, chainId?: number): boolean => {
    if (!address) return false;
    const normalizedAddress = address.toLowerCase();
    const list = (this.store && Array.isArray((this.store as any).contracts))
      ? this.store.contracts
      : [];
    return list.some((entry) => {
      const addressMatch = entry.address === normalizedAddress;
      const chainMatch = !chainId || !entry.chainId || entry.chainId === chainId;
      return addressMatch && chainMatch;
    });
  };

  /**
   * Get all whitelisted contracts
   */
  getWhitelistedContracts = (): WhitelistEntry[] => {
    const list = (this.store && Array.isArray((this.store as any).contracts))
      ? this.store.contracts
      : [];
    return [...list];
  };

  /**
   * Get whitelisted contracts for a specific chain
   */
  getWhitelistedContractsForChain = (chainId: number): WhitelistEntry[] => {
    const list = (this.store && Array.isArray((this.store as any).contracts))
      ? this.store.contracts
      : [];
    return list.filter(
      (entry) => !entry.chainId || entry.chainId === chainId
    );
  };

  /**
   * Clear all whitelisted contracts
   */
  clearWhitelist = () => {
    if (!this.store) this.store = { contracts: [] } as WhitelistStore;
    this.store.contracts = [];
  };

  /**
   * Get whitelist entry by address
   */
  getWhitelistEntry = (address: string): WhitelistEntry | undefined => {
    if (!address) return undefined;
    const normalizedAddress = address.toLowerCase();
    const list = (this.store && Array.isArray((this.store as any).contracts))
      ? this.store.contracts
      : [];
    return list.find(
      (entry) => entry.address === normalizedAddress
    );
  };
}

export const contractWhitelistService = new ContractWhitelistService();
