import { INestApplication, ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import helmet from "helmet";

/**
 * Everything that hardens the HTTP surface, in one function rather than
 * inline in `main.ts`.
 *
 * The reason is a test: an e2e spec builds its app with
 * `moduleRef.createNestApplication()`, which runs the module graph and
 * nothing of `main.ts`. Protections written only in `main.ts` are therefore
 * protections no test can ever observe — and a security control nobody
 * verifies is a security control nobody has.
 */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );

  /**
   * §18 — "la sécurité est appliquée à tous les niveaux". This is the level a
   * framework does not give for free: what a browser must be told. No MIME
   * sniffing, no framing, a referrer policy, HSTS. The API answers JSON, so
   * most matter less than for a page — but a single route that ever returns
   * HTML would otherwise inherit none of them.
   */
  app.use(helmet());

  const config = app.get(ConfigService);

  /**
   * This was `enableCors()` with no argument, which allows EVERY origin: any
   * page a member happens to be visiting could call this API from their
   * browser. Bearer tokens are not attached automatically the way cookies
   * are, so it was not an open door — but it was an open door frame, and
   * closing it costs one variable.
   *
   * No origin configured means no browser origin is allowed, which is the
   * right default for an API whose clients are a worker and a first-party UI
   * that ships with its origin known.
   */
  const origins = (config.get<string>("CORS_ORIGINS") ?? "")
    .split(",")
    .map((origin) => origin.trim())
    .filter(Boolean);
  app.enableCors({
    origin: origins.length > 0 ? origins : false,
    credentials: true,
  });

  /**
   * A policy value (§12.3), a command payload (§6.8) and a memory content
   * (§16) all accept arbitrary JSON by design. Without a ceiling, "arbitrary"
   * includes "large enough to exhaust the process" — and no route here needs
   * a megabyte. Express defaults to 100kb for JSON but leaves urlencoded and
   * raw bodies wide open, so both are named.
   */
  const bodyLimit = config.get<string>("BODY_LIMIT") ?? "256kb";
  const expressApp = app as INestApplication & {
    useBodyParser?: (type: string, options: { limit: string }) => void;
  };
  expressApp.useBodyParser?.("json", { limit: bodyLimit });
  expressApp.useBodyParser?.("urlencoded", { limit: bodyLimit });
}
