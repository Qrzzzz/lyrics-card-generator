export function cleanAITranslation(text: string) {
  return text
    .trim()
    .replace(/^```[a-zA-Z]*\n?/, "")
    .replace(/```$/, "")
    .trim()
    .replace(/^下面是.*?[:：]\s*/i, "")
    .replace(/^以下是.*?[:：]\s*/i, "")
    .replace(/^译文如下[:：]\s*/i, "")
    .replace(/^好的.*?[:：]\s*/i, "")
    .trim();
}
