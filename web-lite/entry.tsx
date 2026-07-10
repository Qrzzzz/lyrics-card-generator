import { createRoot } from "react-dom/client";
import { WebLiteEditor } from "@/web-lite/WebLiteEditor";

const root = document.getElementById("web-lite-root");

if (!root) {
  throw new Error("Web Lite root element is missing.");
}

createRoot(root).render(<WebLiteEditor />);
