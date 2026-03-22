import type { NextConfig } from "next";
import path from "path";
import { fileURLToPath } from "url";

/** Always the `frontend/` directory, even when the shell cwd is the monorepo root. */
const frontendDir = path.dirname(fileURLToPath(import.meta.url));

const nextConfig: NextConfig = {
  reactCompiler: true,
  turbopack: {
    root: frontendDir,
  },
};

export default nextConfig;
