import express from 'express';
import http from 'http';
import { Server } from 'socket.io';
import cors from 'cors';

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

app.use(cors());
app.use(express.json());

// Map username -> { socketId, publicKey }
const users = new Map();

io.on('connection', (socket) => {
  console.log('socket connected', socket.id);

  socket.on('register', ({ username, publicKey }) => {
    users.set(username, { socketId: socket.id, publicKey });
    console.log('register', username);
    // broadcast user list
    const list = [...users.entries()].map(([username, info]) => ({ username, publicKey: info.publicKey }));
    io.emit('users', list);
  });

  socket.on('sendMessage', (payload) => {
    // payload: { to, from, ciphertext, nonce, fromPublicKey }
    const recipient = users.get(payload.to);
    if (recipient) {
      // send to recipient
      io.to(recipient.socketId).emit('message', payload);
    }
    // also emit back to sender so sender can show their message in UI
    io.to(socket.id).emit('message', payload);
  });

  socket.on('disconnect', () => {
    // remove user by socket id
    for (const [username, info] of users.entries()) {
      if (info.socketId === socket.id) {
        users.delete(username);
      }
    }
    const list = [...users.entries()].map(([username, info]) => ({ username, publicKey: info.publicKey }));
    io.emit('users', list);
    console.log('socket disconnected', socket.id);
  });
});

const PORT = process.env.PORT || 5000;
server.listen(PORT, () => console.log('Server running on', PORT));
