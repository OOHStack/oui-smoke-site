import QRCode from "qrcode";
import { unitStickerHeading } from "./unit-sticker-heading";
import { unitStickerLogo } from "./unit-sticker-logo";

export function unitServeUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/unit/${token}`;
}

/** One-inch artboard with at least 1/16-inch trim clearance and a four-module QR quiet zone. */
export async function unitStickerSvg(url: string, number: number) {
  const qr = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4, color: { dark: "#000000", light: "#ffffff" } });
  const qrSize = Number(qr.match(/viewBox="0 0 (\d+)/)?.[1]);
  const nested = `<g transform="translate(15 14) scale(${70 / qrSize})">${qr.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")}</g>`;
  const qrLeft = 15 + 4 * 70 / qrSize;
  const qrRight = 85 - 4 * 70 / qrSize;
  const headingBox = unitStickerHeading.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
  const heading = `<g transform="translate(${qrLeft} 8) scale(${(qrRight - qrLeft) / headingBox[2]} ${5 / headingBox[3]}) translate(${-headingBox[0]} ${-headingBox[1]})">${unitStickerHeading.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")}</g>`;
  const box = unitStickerLogo.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
  const logo = `<g transform="translate(${qrLeft} 85) scale(${32 / box[2]}) translate(${-box[0]} ${-box[1]})">${unitStickerLogo.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="1in" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/>${nested}${heading}<g fill="black" font-family="Arial,Helvetica,sans-serif" text-anchor="middle"><text x="${qrRight}" y="92" font-size="5.6" text-anchor="end">UNIT ${number}</text></g>${logo}</svg>`;
}
