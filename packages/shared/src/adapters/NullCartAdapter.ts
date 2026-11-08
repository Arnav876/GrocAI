import type { PlatformId } from '../types/platforms.js';

export interface CartCapabilities {
  createCart: boolean;
  automatedCheckout: boolean;
  search: boolean;
  livePrice: boolean;
  searchDeepLink: boolean;
  checklistHandoff: boolean;
}

export class UnsupportedCapabilityError extends Error {
  constructor(message?: string) {
    super(
      message ||
        'Unsupported capability: Automated cart creation is disabled. GrocAI never handles user credentials, intercepts OTPs, or processes payments.'
    );
    this.name = 'UnsupportedCapabilityError';
  }
}

export class NullCartAdapter {
  constructor(public readonly platformId: PlatformId) {}

  supportsCartCreation(): boolean {
    return false;
  }

  static getCapabilities(): CartCapabilities {
    return {
      createCart: false,
      automatedCheckout: false,
      search: true,
      livePrice: true,
      searchDeepLink: true,
      checklistHandoff: true,
    };
  }

  getCapabilities(): CartCapabilities {
    return NullCartAdapter.getCapabilities();
  }

  createCart(): never {
    throw new UnsupportedCapabilityError(
      `Platform ${this.platformId} does not support automated cart creation. GrocAI never handles user credentials, intercepts OTPs, or executes automated checkout or payment transactions.`
    );
  }
}

