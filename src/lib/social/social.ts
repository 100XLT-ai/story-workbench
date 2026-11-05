// Ported from longtale-core at 136fa4ac:
//   apps/api/src/api/modules/organic-social/organic-social.prompt.helper.ts
//     (replacePlaceholders, removeEmptyLines, buildMultiPlatformPrompt, loadPlatformTemplate)
//   apps/api/src/api/modules/organic-social/organic-social.service.ts
//     (buildPromptData, resolveStoryTitle, applyFacebookTextRules, parseMultiPlatformResponse)
//   apps/api/src/api/modules/organic-social/facebook-text-rules.ts (all of it)
// The templates are not read from disk here: the seed version holds them as
// code-step parameters, so a person can edit them in the app.

export type PlatformType = "x" | "facebook" | "instagram" | "linkedin";

export const SOCIAL_PLATFORMS: PlatformType[] = ["facebook", "instagram", "linkedin", "x"];

export interface SocialTemplates {
  base: string;
  platform: string;
  outputSchema: unknown;
  /** Facebook only: the AP style rules that production appends to the platform template. */
  apStyle?: string | null;
}

/** `loadPlatformTemplate`: Facebook gets the AP style block appended. */
export function platformTemplate(platform: PlatformType, t: SocialTemplates): string {
  if (platform === "facebook" && t.apStyle) {
    return `${t.platform.trimEnd()}\n\n${t.apStyle.trim()}\n`;
  }
  return t.platform;
}

function removeEmptyLines(text: string): string {
  const lines = text.split("\n");
  const filtered = lines.filter((line) => !/\[[^\]]+\]/.test(line));
  return filtered
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

/** `replacePlaceholders`, with its quirks kept (P5): `${a.b.join(', ')}` etc. */
export function replacePlaceholders(template: string, data: unknown): string {
  const replaced = template.replace(/\$\{([^}]+)\}/g, (_match, key: string) => {
    const keys = key.split(".");
    let value: unknown = data;
    for (const k of keys) {
      if (k.includes("(")) break;
      value =
        value !== null && value !== undefined && typeof value === "object"
          ? (value as Record<string, unknown>)[k]
          : undefined;
    }
    const root =
      data !== null && typeof data === "object"
        ? (data as Record<string, unknown>)[key.split(".")[0]]
        : undefined;
    if (key.includes(".join(")) {
      if (Array.isArray(root)) {
        const separatorMatch = key.match(/join\(['"]([^'"]*)['"]\)/);
        const separator = separatorMatch ? separatorMatch[1] : ", ";
        return root.join(separator);
      }
    }
    if (key.includes(".map(") && key.includes(".join(")) {
      if (Array.isArray(root)) {
        const propMatch = key.match(/\.(\w+)\)/);
        const propName = propMatch ? propMatch[1] : null;
        const separatorMatch = key.match(/join\(['"]([^'"]*)['"]\)/);
        const separator = separatorMatch ? separatorMatch[1] : ", ";
        if (propName) {
          return root
            .map((item: unknown) =>
              item !== null && typeof item === "object"
                ? (item as Record<string, unknown>)[propName]
                : undefined,
            )
            .join(separator);
        }
      }
    }
    return value !== undefined && value !== null ? String(value) : `[${key}]`;
  });
  return removeEmptyLines(replaced);
}

/** `buildMultiPlatformPrompt` (production calls it with the platform list; here one platform per step). */
export function buildMultiPlatformPrompt(
  platforms: PlatformType[],
  data: unknown,
  templates: Record<string, SocialTemplates>,
): string {
  const first = templates[platforms[0]];
  let combined = first.base + "\n\n";
  combined += "---\n\n";
  combined += "# GENERATE CONTENT FOR MULTIPLE PLATFORMS\n\n";
  combined += `You need to create ${platforms.length} different versions of this story, optimized for each platform.\n\n`;
  platforms.forEach((platform, index) => {
    combined += `\n## Platform ${index + 1}: ${platform.toUpperCase()}\n`;
    combined += platformTemplate(platform, templates[platform]) + "\n";
    combined += "---\n";
  });
  combined += "\n## OUTPUT FORMAT\n";
  combined += "You MUST respond with a valid JSON ARRAY containing one object for each platform:\n";
  combined += "```json\n" + JSON.stringify(first.outputSchema, null, 2) + "\n```\n";
  combined += "\nIMPORTANT:\n";
  combined += "- Return ONLY the JSON array, no additional text or markdown.\n";
  combined += `- The array must contain exactly ${platforms.length} objects.\n`;
  combined += '- Each object must have a "platform" field matching one of: ' + platforms.join(", ") + "\n";
  combined += "- Each platform's content should follow its specific requirements above.\n";
  return replacePlaceholders(combined, data);
}

/** `resolveStoryTitle`: the article title when short, else the short story title made at story creation. */
export function resolveStoryTitle(
  tiptapTitle: string | null | undefined,
  storyTitle: string | null | undefined,
  shortStoryTitle: string | null | undefined,
  maxLen = 35,
): string {
  const primary = tiptapTitle || storyTitle;
  if (!primary) return "[Story Title]";
  if (primary.length <= maxLen) return primary;
  const short = shortStoryTitle?.trim();
  return short || primary;
}

export interface StoryDataForLlm {
  brandName: string | null;
  initiativeDetails: string | null;
  keyThemesToEmphasize: string | null;
  callToActionLink: string | null;
}

/** `buildPromptData`: the data object the social templates read. */
export function buildPromptData(input: {
  storyData: StoryDataForLlm;
  tiptapTitle: string | null;
  articleMarkdown: string | null;
  storyTitle: string | null;
  shortStoryTitle: string | null;
  facebook: { name: string | null; characterLimit: number };
}): Record<string, unknown> {
  const { storyData } = input;
  return {
    organization: {
      legal_name: storyData.brandName || "[Brand Name]",
      industry: "[Industry]",
      facebook_handle: input.facebook.name ?? undefined,
    },
    platformRules: {
      facebook: { characterLimit: input.facebook.characterLimit },
    },
    branding: {
      brand_voice: "[Professional and engaging]",
      brand_personality: ["Authentic", "Compassionate", "Results-driven"],
      value_proposition: "[Creating meaningful social impact]",
      target_audiences: [{ segment_name: "[Socially conscious consumers]" }],
    },
    story: {
      title: resolveStoryTitle(input.tiptapTitle, input.storyTitle, input.shortStoryTitle),
      headline: "[Story Headline]",
      generatedContent: input.articleMarkdown || "[Story content not available]",
      brief: {
        overview: storyData.initiativeDetails || "[Story Overview]",
        keyMessages: [storyData.keyThemesToEmphasize || "[Key message]"],
        targetAudience: { primary: "[Target Audience]" },
        callToAction: storyData.callToActionLink || "[Call to Action]",
        tone: "[Professional and inspiring]",
      },
    },
  };
}

// --- facebook-text-rules.ts ---------------------------------------------------

const EMOJI_PATTERN = /\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Regional_Indicator}|‍|️|⃣/gu;
const FACEBOOK_NAME_PATTERN = /^[A-Za-z0-9._-]+$/;
const FACEBOOK_ROUTES = new Set(["pages", "people", "groups", "profile.php", "p", "sharer"]);

export function stripEmojis(text: string): string {
  return text
    .replace(EMOJI_PATTERN, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/[ \t]+([.,;:!?])/g, "$1")
    .replace(/[ \t]+$/gm, "")
    .trim();
}

export function plainLength(markdown: string): number {
  const plain = markdown
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/[*_`~]/g, "")
    .trim();
  return [...plain].length;
}

export function facebookNameOf(handle?: string | null, url?: string | null): string | null {
  const fromHandle = handle?.trim().replace(/^@/, "");
  if (fromHandle && FACEBOOK_NAME_PATTERN.test(fromHandle)) return fromHandle;
  const match = url?.trim().match(/^(?:https?:\/\/)?(?:[\w-]+\.)*(?:facebook|fb)\.com\/([^/?#]+)/i);
  const fromUrl = match?.[1];
  if (!fromUrl || FACEBOOK_ROUTES.has(fromUrl.toLowerCase()) || !FACEBOOK_NAME_PATTERN.test(fromUrl)) {
    return null;
  }
  return fromUrl;
}

// --- parseMultiPlatformResponse -------------------------------------------------

export interface SocialPost {
  platform: string;
  content: string;
  urls: unknown[];
  hashtags: unknown[];
}

/** `parseMultiPlatformResponse`: the JSON array in the reply, valid entries only. Throws like production. */
export function parseMultiPlatformResponse(aiResponse: string): SocialPost[] {
  let cleaned = aiResponse.trim();
  const fence = cleaned.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) cleaned = fence[1].trim();
  const jsonMatch = cleaned.match(/\[[\s\S]*\]/);
  if (!jsonMatch) throw new Error("AI did not return valid multi-platform JSON array");
  const jsonString = jsonMatch[0];
  if (!jsonString.trim().endsWith("]"))
    throw new Error("AI response was truncated. The JSON is incomplete. Try increasing max_tokens.");
  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonString);
  } catch (e) {
    throw new Error(
      `Failed to parse JSON: ${e instanceof Error ? e.message : String(e)}. The response may be truncated or malformed.`,
    );
  }
  if (!Array.isArray(parsed)) throw new Error("AI did not return valid multi-platform JSON array");
  return parsed.filter(
    (item): item is SocialPost =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as Record<string, unknown>).platform === "string" &&
      typeof (item as Record<string, unknown>).content === "string" &&
      Array.isArray((item as Record<string, unknown>).urls) &&
      Array.isArray((item as Record<string, unknown>).hashtags),
  );
}

/** The retry prompt of `applyFacebookTextRules`. */
export function facebookRetryPrompt(prompt: string, count: number, limit: number): string {
  return `${prompt}\n\nYour Facebook post has ${count} characters. Write the Facebook post again in at most ${limit} characters.`;
}

/** Display limits per platform (the CRM editor limits, `types.ts`). Shown next to each post. */
export const PLATFORM_LIMITS: Record<PlatformType, number> = {
  facebook: 400,
  instagram: 2200,
  linkedin: 3000,
  x: 280,
};
