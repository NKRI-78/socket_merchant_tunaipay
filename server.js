require('dotenv/config');

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const bodyParser = require('body-parser');
const cors = require('cors');

const { setTransactionStatus, ensureTables, findTransactionByReference, pick } = require('./model');
const { response } = require('./response');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: '*',
  },
});

app.use(cors());
app.use(bodyParser.json());

const connectedUsers = {};

io.on('connection', (socket) => {
  const userId = socket.handshake.query.user_id;

  if (userId) {
    connectedUsers[userId] = socket.id;
    console.log(`User ${userId} connected with socket ID: ${socket.id}`);
  } else {
    console.log('Client connected without user_id');
  }

  socket.on('payment-update', (data) => {
    console.log('payment-update', data);
  });

  socket.on('disconnect', () => {
    for (const [uid, sid] of Object.entries(connectedUsers)) {
      if (sid === socket.id) {
        delete connectedUsers[uid];
        console.log(`User ${uid} disconnected`);
        break;
      }
    }
  });
});

app.post('/api/v1/payment/qris/webhook', async (req, res) => {
  try {
    await ensureTables();
    const body = req.body || {};

    const reference_id = pick(body, ['reference_id', 'data.reference_id']);
    if (!reference_id) response(res, 400, true, 'reference_id is required');

    const exists = await findTransactionByReference(reference_id);
    if (!exists) response(res, 404, true, 'transaction not found');

    const userId = exists.created_by;

    const incomingStatus = String(
      pick(body, ['status', 'data.status'], exists.status) || exists.status,
    ).toUpperCase();

    if (userId && connectedUsers[userId]) {
      const socketId = connectedUsers[userId];
      io.to(socketId).emit('payment-update', {
        order_id: reference_id,
        status: incomingStatus,
        user_id: userId,
      });
      console.log(`Sent update to user ${userId}`);
    } else {
      console.log('User not connected or user_id missing');
    }

    await setTransactionStatus({
      reference_id,
      status: body.status == '1' ? 'UNPAID' : 'PAID',
      provider_response: JSON.stringify(body),
    });

    return response(res, 200, false, 'OK', { reference_id, status: incomingStatus });
  } catch (e) {
    return response(res, 400, true, e.message);
  }
});

server.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
