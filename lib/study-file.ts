export const isPdf = (value: File) =>
  value.type === "application/pdf" || value.name.toLowerCase().endsWith(".pdf");

export const formatBytes = (bytes: number) => `${(bytes / 1024 / 1024).toFixed(1)} MB`;
