// pineconeClient.js
import { Pinecone } from '@pinecone-database/pinecone';
import dotenv from 'dotenv';

dotenv.config();
const pinecone = new Pinecone();
console.log('Pinecone initialized successfully');

export default pinecone;
