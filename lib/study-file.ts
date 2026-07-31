const audioExtensions = new Set(["mp3", "mp4", "mpeg", "mpga", "m4a", "wav", "webm"]);

export const isPdf = (value: File) =>
  value.type === "application/pdf" || value.name.toLowerCase().endsWith(".pdf");

export const isAudio = (value: File) =>
  value.type.startsWith("audio/") ||
  value.type === "video/mp4" ||
  audioExtensions.has(value.name.toLowerCase().split(".").pop() || "");

export const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
