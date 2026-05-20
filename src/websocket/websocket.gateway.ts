import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';

import { Server, Socket } from 'socket.io';

@WebSocketGateway({
  cors: {
    origin: '*',
  },
})
export class WebsocketGateway {
  @WebSocketServer()
  server!: Server;

  private drivers = new Map<string, string>();

  @SubscribeMessage('register-driver')
  handleRegisterDriver(
    @MessageBody() driverId: string,
    @ConnectedSocket() client: Socket,
  ) {
    this.drivers.set(driverId, client.id);

    return {
      success: true,
    };
  }

  sendBookingToDriver(driverId: string, booking: any) {
    const socketId = this.drivers.get(driverId);

    if (socketId) {
      this.server.to(socketId).emit('new-booking', booking);
    }
  }
}