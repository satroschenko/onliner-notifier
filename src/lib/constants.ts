export const BOOKMARKS_URL = "https://profile.onliner.by/bookmarks/forum";
export const LOGIN_URL = "https://profile.onliner.by/login#login";
export const ALARM_NAME = "check-forum-bookmarks";
export const SETTINGS_KEY = "settings";
export const STATE_KEY = "state";

export function unreadTopicUrl(topicId: string): string {
  return `https://forum.onliner.by/viewtopic.php?t=${topicId}&view=unread#unread`;
}
