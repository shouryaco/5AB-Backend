import { WebSocketGateway, WebSocketServer } from '@nestjs/websockets';

import { Server } from 'socket.io';

const allowedOrigins = (process.env.CORS_ORIGINS || 'http://localhost:3001')
  .split(',')
  .map((origin) => origin.trim())
  .filter(Boolean);

@WebSocketGateway({
  cors: {
    origin: allowedOrigins,
    credentials: true,
  },
})
export class WebsocketGateway {
  @WebSocketServer()
  server!: Server;

  /*
   * Driver-specific socket registration is intentionally disabled
   * for the current admin-only deployment.
   *
   * The old "register-driver" event accepted an arbitrary driverId
   * without authenticating the socket. When the Driver App is built,
   * re-enable driver registration using the driver's JWT and verify
   * the linked driver profile before storing the socket connection.
   */
  sendBookingToDriver(_driverId: string, _booking: unknown) {
    // Driver App realtime delivery will be enabled with JWT socket auth.
  }

  notifyDispatchUpdate() {
    this.server.emit('dispatch-updated');
  }
}
