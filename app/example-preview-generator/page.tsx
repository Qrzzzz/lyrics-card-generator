import { notFound } from "next/navigation";
import { ExamplePreviewGeneratorClient } from "@/app/example-preview-generator/ExamplePreviewGeneratorClient";

export default function ExamplePreviewGeneratorPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <ExamplePreviewGeneratorClient />;
}
