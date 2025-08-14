import { createPersistStore } from '@/background/utils';

export type Vibe3PointsStore = {
  signatures: Record<string, string>;
  redirect2Points: boolean;
};

class Vibe3Points {
  store: Vibe3PointsStore = {
    signatures: {},
    redirect2Points: false,
  };

  init = async () => {
    const storage = await createPersistStore<Vibe3PointsStore>({
      name: 'Vibe3Points',
      template: {
        signatures: {},
        redirect2Points: false,
      },
    });

    this.store = storage || this.store;
  };
  setRedirect2Points = (redirect2Points: boolean) => {
    this.store.redirect2Points = redirect2Points;
  };

  setSignature = (addr: string, signature: string) => {
    this.store.signatures = {
      ...this.store.signatures,
      [addr.toLowerCase()]: signature,
    };
  };

  getSignature = (addr: string) => {
    return this.store.signatures[addr.toLowerCase()];
  };
  clearSignatureByAddr = (addr: string) => {
    delete this.store.signatures[addr];
    this.store.signatures = {
      ...this.store.signatures,
    };
  };
  clearSignature = () => {
    this.store.signatures = {};
  };
}

export default new Vibe3Points();
