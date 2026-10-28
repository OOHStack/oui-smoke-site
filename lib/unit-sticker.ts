import QRCode from "qrcode";
import { unitStickerLogo } from "./unit-sticker-logo";

export function unitServeUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/unit/${token}`;
}

/** Exact one-inch artboard. QR retains its four-module white quiet zone. */
export async function unitStickerSvg(url: string, number: number) {
  const qr = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4, color: { dark: "#000000", light: "#ffffff" } });
  const qrSize = Number(qr.match(/viewBox="0 0 (\d+)/)?.[1]);
  const nested = `<g transform="translate(10 8) scale(${80 / qrSize})">${qr.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")}</g>`;
  const qrLeft = 10 + 4 * 80 / qrSize;
  const qrRight = 90 - 4 * 80 / qrSize;
  const box = unitStickerLogo.match(/viewBox="([^"]+)"/)![1].split(" ").map(Number);
  const logo = `<g transform="translate(${qrLeft} 89) scale(${35 / box[2]}) translate(${-box[0]} ${-box[1]})">${unitStickerLogo.replace(/<svg[^>]*>/, "").replace(/<\/svg>\s*$/, "")}</g>`;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="1in" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/>${nested}<g fill="black" font-family="Arial,Helvetica,sans-serif" text-anchor="middle"><text x="50" y="7" font-size="6.8" font-weight="700">SCAN FOR SERVICE</text><text x="${qrRight}" y="96" font-size="5.6" text-anchor="end">UNIT ${number}</text></g>${logo}</svg>`;
}
