const { io } = require('socket.io-client');

const DRIVER_ID = 'f87dcb5a-9a30-4473-b91d-b36667dd9e5e';

const socket = io('http://localhost:3000');

socket.on('connect', () => {
    console.log('Connected:', socket.id);

    socket.emit('register-driver', DRIVER_ID);
});

socket.on('new-booking', (booking) => {
    console.log('NEW BOOKING RECEIVED');
    console.log(booking);
});