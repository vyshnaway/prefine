import type { MetadataRoute } from "next";
import { PACKAGE_DESC, PACKAGE_NAME } from "./types";


export default function manifest(): MetadataRoute.Manifest {
  return {
    name: PACKAGE_NAME,
    short_name: PACKAGE_NAME.toLowerCase().split('-').join(' '),
    description: PACKAGE_DESC,
    start_url: "/",
    display: "standalone",
    background_color: "#141414",
    theme_color: "#1c1c1c",
    icons: [
      {
        src: "/icon-192x192.png",
        sizes: "192x192",
        type: "image/png",
      },
      {
        src: "/icon-512x512.png",
        sizes: "512x512",
        type: "image/png",
      },
    ],
  };
}
