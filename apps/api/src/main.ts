import "reflect-metadata";

import { ValidationPipe } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { NestFactory } from "@nestjs/core";

import { AppModule } from "./app.module";
import { SingleServerIoAdapter } from "./realtime/single-server-io.adapter";

async function bootstrap(): Promise<void> {
  const app = await NestFactory.create(AppModule);

  app.useGlobalPipes(
    new ValidationPipe({
      whitelist: true,
      forbidNonWhitelisted: true,
      transform: true,
    }),
  );
  app.enableCors();
  app.useWebSocketAdapter(new SingleServerIoAdapter(app));

  const configService = app.get(ConfigService);
  const port = configService.get<string>("PORT") ?? "3001";

  await app.listen(port);
}

void bootstrap();
