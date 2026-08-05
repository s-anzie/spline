import "reflect-metadata";

import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { configureApp } from "./bootstrap";
import { listenHost } from "./config/hardening";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  configureApp(app);

  const configService = app.get(ConfigService);
  const port = configService.get<string>("PORT") ?? "8765";
  const host = listenHost();

  await app.listen(port, host);
  console.info(`hub listening on ${host}:${port}`);
}

void bootstrap();
