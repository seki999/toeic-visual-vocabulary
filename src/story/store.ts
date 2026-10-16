import { create } from "zustand";
import { persist } from "zustand/middleware";
export const useStoryStore = create<{
  mode: "en" | "zh" | "bilingual";
  enRate: number;
  zhRate: number;
  layout: "image" | "text" | "mixed";
  voices: Record<string, Record<string, string>>;
  patch: (
    value: Partial<{
      mode: "en" | "zh" | "bilingual";
      enRate: number;
      zhRate: number;
      layout: "image" | "text" | "mixed";
    }>,
  ) => void;
  voice: (storyId: string, characterId: string, uri: string) => void;
}>()(
  persist(
    (set) => ({
      mode: "bilingual",
      enRate: 0.8,
      zhRate: 1.2,
      layout: "mixed",
      voices: {},
      patch: (value) => set(value),
      voice: (s, c, uri) =>
        set((state) => ({
          voices: { ...state.voices, [s]: { ...state.voices[s], [c]: uri } },
        })),
    }),
    { name: "toeic-story-settings-v1" },
  ),
);
