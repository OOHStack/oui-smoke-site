import { neon } from '@neondatabase/serverless';
import QRCode from 'qrcode';
import { writeFile, mkdir } from 'node:fs/promises';
import { unitServeUrl, unitStickerSvg } from '../lib/unit-sticker';

const destination = process.argv[2];
if (!destination) throw new Error('Output directory required');
await mkdir(destination, { recursive: true });
const sql = neon(process.env.DATABASE_URL!);
const units = await sql`SELECT id, model_number, qr_token FROM hookahs WHERE model_number BETWEEN 1 AND 14 ORDER BY model_number`;
if (units.length !== 14) throw new Error('Expected all 14 units');
const manifest = [];
for (const unit of units) {
  const url = unitServeUrl('https://ouismoke.co', unit.qr_token);
  await writeFile(`${destination}/oui-smoke-unit-${String(unit.model_number).padStart(2,'0')}-1in.svg`, await unitStickerSvg(url, unit.model_number));
  const qr = QRCode.create(url, { errorCorrectionLevel: 'M' });
  manifest.push({ number: unit.model_number, url, size: qr.modules.size, data: [...qr.modules.data] });
}
await writeFile(`${destination}/manifest.json`, JSON.stringify(manifest));
console.log(`Exported ${units.length} unit stickers`);
