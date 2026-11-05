const KEY = "story-workbench:name";

export function getName(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

export function setName(name: string) {
  try {
    localStorage.setItem(KEY, name);
  } catch {
    /* private window: the name lasts for this page only */
  }
}

export const authorName = () => getName() ?? "anonymous";
