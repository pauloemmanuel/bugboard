import { Monitor, Tablet } from "lucide-react";
import type { Platform } from "./api";
import { AndroidIcon, AppleIcon } from "./icons";

const size = 20;

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
      {platform === "ios" && <AppleIcon width={size} height={size} />}
      {platform === "android" && <AndroidIcon width={size} height={size} />}
      {platform === "web" && <Monitor size={size} strokeWidth={2} aria-hidden />}
      {platform === "ipad" && <Tablet size={size} strokeWidth={2} aria-hidden />}
    </span>
  );
}
