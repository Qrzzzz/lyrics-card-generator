import { mkdirSync, writeFileSync } from "node:fs";
import qrcode from "qrcode-generator";
import { SUPPORT_METHODS } from "../lib/settings/support-addresses";

mkdirSync("public/support", { recursive: true });
for (const method of SUPPORT_METHODS) {
  const code = qrcode(0, "M");
  code.addData(method.address, "Byte");
  code.make();
  // Four modules of quiet space on each edge; white background in every theme.
  const svg = code.createSvgTag({ cellSize: 4, margin: 16, scalable: true });
  writeFileSync(`public${method.qr}`, svg + "\n");
}
console.log("Generated two local receiving-address QR codes.");
