import { notFound } from "next/navigation";
import { ExamplePaletteGeneratorClient } from "@/app/example-palette-generator/ExamplePaletteGeneratorClient";

export default function ExamplePaletteGeneratorPage() {
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <ExamplePaletteGeneratorClient />;
}
