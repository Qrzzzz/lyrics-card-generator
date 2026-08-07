import { notFound } from "next/navigation";
import { ExamplePaletteGeneratorClient } from "@/app/example-palette-generator/ExamplePaletteGeneratorClient";

export default function ExamplePaletteGeneratorPage() {
  // The generator is an internal build tool and must never become a public route.
  if (process.env.NODE_ENV === "production") {
    notFound();
  }

  return <ExamplePaletteGeneratorClient />;
}
