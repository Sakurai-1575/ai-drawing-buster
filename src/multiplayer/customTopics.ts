import { TOPIC_POOL_MAX, isValidTopic, sanitizeTopicText, type CustomTopic } from '../net/protocol';

/** Mode B custom topics this player has authored, kept across sessions. */
const KEY = 'adb.customTopics';

export function loadSavedTopics(): CustomTopic[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (t): t is CustomTopic =>
        typeof t?.id === 'string' && typeof t?.answer === 'string' && Array.isArray(t?.dummies) && t.dummies.length === 3 && isValidTopic(t),
    );
  } catch {
    return [];
  }
}

export function saveTopics(topics: CustomTopic[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(topics.slice(-TOPIC_POOL_MAX)));
  } catch {
    /* storage unavailable */
  }
}

export function makeTopic(answer: string, dummies: [string, string, string]): CustomTopic {
  return {
    id: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
    answer: sanitizeTopicText(answer),
    dummies: dummies.map(sanitizeTopicText) as [string, string, string],
  };
}
