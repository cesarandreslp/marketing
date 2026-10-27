import { NextResponse, type NextRequest } from "next/server";
import { COOKIE, leerToken } from "./lib/sesion";

// Revisión rápida de la cookie firmada. Cada página y acción vuelve a validar
// con requerirSesion() y filtra por la cuenta de la sesión.
export function proxy(req: NextRequest) {
  if (leerToken(req.cookies.get(COOKIE)?.value)) return NextResponse.next();
  return NextResponse.redirect(new URL("/login", req.url));
}

export const config = {
  // /api/n8n usa la clave de la cuenta (Bearer); /login y /bienvenida son públicos;
  // /api/medios valida la sesión en la ruta (así los videos no se copian en memoria en el proxy).
  matcher: ["/((?!login|bienvenida|api/n8n|api/medios|_next|favicon.ico).*)"],
};
