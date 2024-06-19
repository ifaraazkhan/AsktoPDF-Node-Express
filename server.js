import express from 'express';
import dotenv from 'dotenv';
import routes from './init/routes.js';
import pinecone from './init/pinecone.js';

dotenv.config();
const server = express();

routes(server); //initiate routes


const port = process.env.PORT || 9000;
server.listen(port, () => console.log(`Listening on port ${port}`));

server.get('/health', (req, res) => {
    const currentTime = new Date().toISOString();
    res.status(200).json({ currentTime });
  });
