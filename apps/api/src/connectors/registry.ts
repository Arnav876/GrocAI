import { PlatformId, SUPPORTED_PLATFORMS } from "@groqai/shared";
import { IPlatformConnector } from "./types.js";
import { MockConnector } from "./mockConnector.js";
import { PrismaClient } from "@prisma/client";

export class ConnectorRegistry {
  private connectors = new Map<PlatformId, IPlatformConnector>();
  private killSwitches = new Map<PlatformId, boolean>();

  constructor(private prisma: PrismaClient) {
    for (const pid of SUPPORTED_PLATFORMS) {
      this.connectors.set(pid, new MockConnector(pid, prisma));
      this.killSwitches.set(pid, false);
    }
  }

  get(platformId: PlatformId): IPlatformConnector {
    if (this.killSwitches.get(platformId)) {
      throw new Error(`Platform connector for ${platformId} has been disabled by kill switch`);
    }
    const conn = this.connectors.get(platformId);
    if (!conn) {
      throw new Error(`No connector registered for platform ${platformId}`);
    }
    return conn;
  }

  setKillSwitch(platformId: PlatformId, disabled: boolean): void {
    this.killSwitches.set(platformId, disabled);
  }

  isKillSwitchActive(platformId: PlatformId): boolean {
    return !!this.killSwitches.get(platformId);
  }

  getAll(): IPlatformConnector[] {
    return SUPPORTED_PLATFORMS.map((pid) => this.get(pid));
  }
}
