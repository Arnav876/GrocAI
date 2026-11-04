import path from "path";
import fs from "fs";
import { LocationContext, PlatformId } from "@groqai/shared";

export interface BrowserSessionConfig {
  platform: PlatformId;
  userDataDir: string;
  location: LocationContext;
  headless: boolean;
}

export function getBrowserSessionConfig(
  platform: PlatformId,
  location?: LocationContext,
  headless: boolean = false
): BrowserSessionConfig {
  const baseCacheDir = path.resolve(process.cwd(), ".cache/groqai", platform);
  if (!fs.existsSync(baseCacheDir)) {
    fs.mkdirSync(baseCacheDir, { recursive: true });
  }

  const loc: LocationContext = location || {
    locationKey: "delhi_110001",
    pincode: "110001",
    city: "Central Delhi",
    latitude: 28.6304,
    longitude: 77.2177,
    serviceableArea: "Connaught Place",
  };

  return {
    platform,
    userDataDir: baseCacheDir,
    location: loc,
    headless,
  };
}
