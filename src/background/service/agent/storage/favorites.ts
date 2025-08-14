import { createStorage } from './storage';

export interface FavoritePrompt {
  id: number;
  title: string;
  content: string;
  createdAt: number;
  order: number;
}

export interface FavoritePromptRecord {
  prompts: FavoritePrompt[];
}

export type FavoritePromptStorage = {
  addPrompt: (title: string, content: string) => Promise<void>;
  getAllPrompts: () => Promise<FavoritePrompt[]>;
  updatePromptTitle: (id: number, title: string) => Promise<void>;
  removePrompt: (id: number) => Promise<void>;
  reorderPrompts: (draggedId: number, targetId: number) => Promise<void>;
};

const storage = createStorage<FavoritePromptRecord>(
  'favorite-prompts',
  { prompts: [] },
  {
    isPersistant: true,
  }
);

const favoritesStorage: FavoritePromptStorage = {
  async addPrompt(title: string, content: string) {
    const all = await storage.get();
    const newPrompt: FavoritePrompt = {
      id: Date.now(),
      title,
      content,
      createdAt: Date.now(),
      order: all.prompts.length,
    };
    await storage.set({ prompts: [...all.prompts, newPrompt] });
  },
  async getAllPrompts() {
    const all = await storage.get();
    return all.prompts.sort((a, b) => a.order - b.order);
  },
  async updatePromptTitle(id: number, title: string) {
    const all = await storage.get();
    const prompts = all.prompts.map((p) => (p.id === id ? { ...p, title } : p));
    await storage.set({ prompts });
  },
  async removePrompt(id: number) {
    const all = await storage.get();
    const prompts = all.prompts.filter((p) => p.id !== id);
    await storage.set({ prompts });
  },
  async reorderPrompts(draggedId: number, targetId: number) {
    const all = await storage.get();
    const prompts = [...all.prompts];
    const draggedIndex = prompts.findIndex((p) => p.id === draggedId);
    const targetIndex = prompts.findIndex((p) => p.id === targetId);

    if (draggedIndex === -1 || targetIndex === -1) return;

    const [removed] = prompts.splice(draggedIndex, 1);
    prompts.splice(targetIndex, 0, removed);

    const updatedPrompts = prompts.map((p, index) => ({ ...p, order: index }));

    await storage.set({ prompts: updatedPrompts });
  },
};

export default favoritesStorage;
