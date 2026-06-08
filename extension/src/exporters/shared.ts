export function safeFileName(value: string): string {
  return value.replace(/[<>:"/\\|?*\u0000-\u001f]+/g, "_").trim() || "conversation";
}

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    };
    return entities[char] || char;
  });
}
