import { IoAdapter } from "@nestjs/platform-socket.io";
import { Server, ServerOptions } from "socket.io";

/**
 * The stock IoAdapter creates a brand-new socket.io Server (and therefore a
 * brand-new engine.io listener on the same underlying HTTP server) every
 * time create() is called with a `namespace` option and no explicit
 * `server` — see @nestjs/platform-socket.io's io-adapter.js: `namespace ?
 * this.createIOServer(port, opt).of(namespace) : ...`. With two gateways
 * (RealtimeGateway on "/", MachineGateway on "/machines"), that produces
 * TWO independent Server instances both attached to the same httpServer,
 * which double-fires handleConnection and corrupts per-connection state.
 * Caching the first-created Server and reusing it for every later
 * create() call (namespaces are then just `.of(namespace)` on the SAME
 * server) is the standard fix for multi-gateway NestJS apps.
 */
export class SingleServerIoAdapter extends IoAdapter {
  private ioServer?: Server;

  override createIOServer(port: number, options?: ServerOptions): Server {
    if (!this.ioServer) {
      this.ioServer = super.createIOServer(port, options) as Server;
    }
    return this.ioServer;
  }
}
