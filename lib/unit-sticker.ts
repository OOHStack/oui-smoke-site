import QRCode from "qrcode";

export function unitServeUrl(origin: string, token: string) {
  return `${origin.replace(/\/$/, "")}/unit/${token}`;
}

/** Exact one-inch artboard. QR retains its four-module white quiet zone. */
export async function unitStickerSvg(url: string, number: number) {
  const qr = await QRCode.toString(url, { type: "svg", errorCorrectionLevel: "M", margin: 4, color: { dark: "#000000", light: "#ffffff" } });
  const nested = qr.replace(/<svg /, '<svg x="4" y="1" width="92" height="80" ').replace(/width="100%" height="100%"/g, "");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="1in" height="1in" viewBox="0 0 100 100"><rect width="100" height="100" fill="white"/>${nested}<g fill="black" font-family="Arial,Helvetica,sans-serif" text-anchor="middle"><text x="50" y="86" font-size="6.8" font-weight="700">SCAN FOR SERVICE</text><text x="50" y="94" font-size="5.6">OUI SMOKE · UNIT ${number}</text></g></svg>`;
}
