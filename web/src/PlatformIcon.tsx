import type { Platform } from "./api";

const size = 22;

export function PlatformIcon({ platform }: { platform: Platform | null }) {
  if (!platform) return null;
  const label =
    platform === "ios"
      ? "iOS"
      : platform === "android"
        ? "Android"
        : platform === "ipad"
          ? "iPad"
          : "Web";
  return (
    <span className="platform-icon" role="img" aria-label={label}>
      {platform === "ios" && (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M16.5 12.9c-.02 2.1 1.74 2.78 1.76 2.79-.01.05-.28 1-.92 2.01-1.12 1.64-2.28 3.28-4.1 3.31-1.8.03-2.38-1.07-4.44-1.07-2.06 0-2.7 1.04-4.4 1.1-1.77.06-3.12-1.6-4.24-3.23C-.12 14.16 1.2 8.6 3.6 5.75c1.2-1.38 2.64-2.7 4.48-2.72 1.76-.02 2.71 1.14 4.07 1.14 1.33 0 2.15-1.14 4.02-1.12 1.56.02 2.9.8 3.73 2.03-3.28 1.78-2.75 6.41.6 7.82zM13.2 3.86c.9-1.12 1.52-2.66 1.35-4.2-1.3.05-2.88.87-3.82 1.99-.83.97-1.56 2.52-1.36 4.01 1.44.11 2.92-.73 3.83-1.8z"
          />
        </svg>
      )}
      {platform === "android" && (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M8 4.8l-1-1.7h-.1V4h1v.8zm8 0V4h1v-.9h-.1L16 4.8zM7 18c0 .6.4 1 1 1h1v2.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h2v2.5c0 .8.7 1.5 1.5 1.5s1.5-.7 1.5-1.5V19h1c.6 0 1-.4 1-1V8H7v10zm12-12.5c0-.8-.7-1.5-1.5-1.5h-11C5.7 4 5 4.7 5 5.5v1c0 .8.7 1.5 1.5 1.5h11c.8 0 1.5-.7 1.5-1.5v-1z"
          />
        </svg>
      )}
      {platform === "web" && (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M4 5h16a1 1 0 0 1 1 1v12a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1zm8 2a6 6 0 1 0 .001 12A6 6 0 0 0 12 7zm0 2c2.2 0 4 1.6 4.4 3.7H7.6C8 10.6 9.8 9 12 9zm-4.2 2h8.4c-.2.7-.6 1.3-1.1 1.8-.6.5-1.3.8-2.1.8s-1.5-.3-2.1-.8c-.5-.5-.9-1.1-1.1-1.8z"
          />
        </svg>
      )}
      {platform === "ipad" && (
        <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
          <path
            fill="currentColor"
            d="M6 3h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2zm6 16.5a1.25 1.25 0 1 0 0-2.5 1.25 1.25 0 0 0 0 2.5z"
          />
        </svg>
      )}
    </span>
  );
}
