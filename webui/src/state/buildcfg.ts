export const uios = (process.env.UI_OS || "").trim().toLowerCase();
export const isWindows = uios === "windows";
export const uiBuildVersion = (
  process.env.BACKREST_BUILD_VERSION || "dev-snapshot-build"
).trim();
export const isDevBuild = uiBuildVersion === "dev-snapshot-build";
export const pathSeparator = isWindows ? "\\" : "/";
export const backendUrl = process.env.UI_BACKEND_URL || "./";
console.log(`UI OS: ${uios}, 构建版本: ${uiBuildVersion}, 后端 URL: ${backendUrl}`);
export const features = new Set<string>((process.env.UI_FEATURES || "").split(","));

// Feature flags
export const isMultihostSyncEnabled = features.has("multihost-sync");
