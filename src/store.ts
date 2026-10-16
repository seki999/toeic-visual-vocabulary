import { create } from "zustand";
import { persist } from "zustand/middleware";
import { fields, type Field } from "./types";
export interface Settings {
  mode: "both" | "text" | "image";
  font: number;
  ratio: number;
  visible: Field[];
  overlay: Field[];
  imageIpa: boolean;
  overlayPosition: "top" | "center" | "bottom";
  overlayColor: string;
  overlaySize: number;
  overlayBackground: number;
  reveal: boolean;
  order: Field[];
  enRate: number;
  zhRate: number;
  pitch: number;
  volume: number;
  enVoice: string;
  zhVoice: string;
  accent: "en-US" | "en-GB";
  repeat: number;
  fieldRepeat: number;
  gap: number;
  itemGap: number;
  loop: boolean;
  currentOnly: boolean;
  autoScroll: boolean;
  scrollPosition: ScrollLogicalPosition;
  pauseFollow: boolean;
  wake: boolean;
  compress: boolean;
  quality: number;
}
export const defaults: Settings = {
  mode: "both",
  font: 18,
  ratio: 55,
  visible: [
    "word",
    "meaning",
    "collocation.en",
    "collocation.zh",
    "example.en",
    "example.zh",
  ],
  overlay: ["word"],
  imageIpa: false,
  overlayPosition: "bottom",
  overlayColor: "#ffffff",
  overlaySize: 24,
  overlayBackground: 0.65,
  reveal: false,
  order: [...fields],
  enRate: 0.8,
  zhRate: 1.2,
  pitch: 1,
  volume: 1,
  enVoice: "",
  zhVoice: "",
  accent: "en-US",
  repeat: 1,
  fieldRepeat: 1,
  gap: 300,
  itemGap: 500,
  loop: false,
  currentOnly: false,
  autoScroll: true,
  scrollPosition: "center",
  pauseFollow: true,
  wake: true,
  compress: true,
  quality: 0.82,
};
export const useStore = create<{
  listId: string;
  positions: Record<string, number>;
  settings: Settings;
  setList: (id: string) => void;
  setPosition: (id: string, n: number) => void;
  set: (s: Partial<Settings>) => void;
}>()(
  persist(
    (set) => ({
      listId: "list01",
      positions: {},
      settings: defaults,
      setList: (listId) => set({ listId }),
      setPosition: (id, n) =>
        set((s) => ({ positions: { ...s.positions, [id]: n } })),
      set: (settings) =>
        set((s) => ({ settings: { ...s.settings, ...settings } })),
    }),
    {
      name: "toeic-settings-v1",
      version: 4,
      // Upgrade the former default without replacing a custom reading order.
      migrate: (persisted, version) => {
        const state = persisted as { settings?: Partial<Settings> };
        const previous = state.settings ?? {};
        const oldDefault = previous.order?.join(",") === "word,example.en";
        return {
          ...state,
          settings: {
            ...defaults,
            ...previous,
            ...(version < 3 ? { enRate: 0.8, zhRate: 1.2, wake: true } : {}),
            ...(!previous.order || oldDefault ? { order: [...fields] } : {}),
          },
        };
      },
    },
  ),
);
