import { getDb } from "@/lib/db";
import { hookahs } from "@/lib/db/schema";
import { asc } from "drizzle-orm";
import { getSiteUrl } from "@/lib/guest";
import { unitServeUrl, unitStickerSvg } from "@/lib/unit-sticker";
import StickerPicker from "./StickerPicker";

export const dynamic = "force-dynamic";
export default async function StickersPage() {
  const units = await getDb().select().from(hookahs).orderBy(asc(hookahs.modelNumber));
  const stickers = await Promise.all(units.map(async unit => ({
    id: unit.id, number: unit.modelNumber, status: unit.status,
    svg: await unitStickerSvg(unitServeUrl(getSiteUrl(), unit.qrToken), unit.modelNumber),
  })));
  return <StickerPicker units={stickers} />;
}
