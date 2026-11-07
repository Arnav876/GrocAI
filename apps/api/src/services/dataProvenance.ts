import { PrismaClient } from "@prisma/client";
import { DataProvenance, summarizeProvenance } from "@groqai/shared";

export {
  pincodeFromLocationKey,
  summarizeProvenance,
} from "@groqai/shared";
export type { ProvenanceListingRow } from "@groqai/shared";

export class DataProvenanceService {
  constructor(private prisma: PrismaClient) {}

  async getForLocation(locationKey: string): Promise<DataProvenance> {
    const rows = await this.prisma.platformListing.findMany({
      where: { locationKey },
      select: {
        platform: true,
        sourceType: true,
        availability: true,
        lastObservedAt: true,
      },
    });

    return summarizeProvenance(rows, locationKey);
  }
}
