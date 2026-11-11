import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["pdfkit"], // carga sus fuentes del disco: no se empaqueta
};

export default nextConfig;
