"use client";
import { useState } from "react";

type Unit = { id: number; number: number; status: string; svg: string };
export default function StickerPicker({ units }: { units: Unit[] }) {
  const [selected, setSelected] = useState(() => units.filter(u => u.status !== "retired").map(u => u.id));
  return <div className="sticker-page">
    <div className="sticker-controls">
      <h1 className="page-title">Permanent QR stickers</h1>
      <p>Choose your physical units. Each sticker is exactly 1″ × 1″, black on white. Print at actual size / 100%, with browser headers and footers off. Save as PDF for vector printing, or download individual SVGs from Fleet.</p>
      <p>These links stay with the unit across jobs. They open guest service when the unit is sent out on a confirmed or active job. Retired and maintenance units show a service unavailable message.</p>
      <button className="btn btn-primary" onClick={() => window.print()} disabled={!selected.length}>Print / save PDF ({selected.length})</button>{" "}
      <a className="btn" href="/admin/fleet">Back to Fleet</a>
    </div>
    <div className="sticker-grid">{units.map(unit => <div key={unit.id} className={`sticker-item ${selected.includes(unit.id) ? "chosen" : "excluded"}`}>
      <label className="sticker-controls"><input type="checkbox" checked={selected.includes(unit.id)} onChange={e => setSelected(old => e.target.checked ? [...old, unit.id] : old.filter(id => id !== unit.id))} /> Unit {unit.number} · {unit.status}</label>
      <div className="sticker-art" dangerouslySetInnerHTML={{ __html: unit.svg }} />
    </div>)}</div>
    <style>{`
      .sticker-grid{display:flex;flex-wrap:wrap;gap:24px;margin-top:24px}
      .sticker-item{display:flex;flex-direction:column;gap:8px}.sticker-art{width:1in;height:1in;background:white}
      @media print {
        @page {size:letter;margin:0.5in}
        html,body{background:white!important;color:black!important}
        .admin-sidebar,.admin-mobile-nav,.admin-header{display:none!important}
        body *{visibility:hidden}
        .sticker-page,.sticker-page *{visibility:visible}
        .sticker-page{position:absolute;inset:0;margin:0;padding:0}
        .sticker-page .sticker-controls,.sticker-page .excluded{display:none!important}
        .sticker-grid{gap:0.15in;margin:0;display:flex;flex-wrap:wrap}
        .sticker-item{width:1in;height:1in;break-inside:avoid;page-break-inside:avoid;print-color-adjust:exact;-webkit-print-color-adjust:exact}
      }
    `}</style>
  </div>;
}
