export interface StoryCharacter {
  id: string;
  name: string;
  voiceGender?: "male" | "female" | "neutral";
  preferredVoice?: string | null;
}
export interface StoryLine {
  id: string;
  speakerId: string;
  en: string;
  zh: string;
  targetWordIds: string[];
  image?: string | null;
}
export interface StoryScene {
  id: string;
  title: string;
  titleZh: string;
  image?: string | null;
  lines: StoryLine[];
}
export interface Story {
  schemaVersion: 1;
  id: string;
  listId: string;
  title: string;
  titleZh: string;
  targetWordIds: string[];
  characters: StoryCharacter[];
  scenes: StoryScene[];
}
export interface StoryPosition {
  sceneIndex: number;
  lineIndex: number;
}
export type StoryStatus = "idle" | "playing" | "paused" | "completed" | "error";
export interface StorySettings {
  mode: "en" | "zh" | "bilingual";
  enRate: number;
  zhRate: number;
  voices: Record<string, string>;
  zhVoice: string;
  pitch: number;
  volume: number;
}
export function flattenStory(story: Story) {
  return story.scenes.flatMap((s, sceneIndex) =>
    s.lines.map((line, lineIndex) => ({
      sceneIndex,
      lineIndex,
      line,
      scene: s,
    })),
  );
}
