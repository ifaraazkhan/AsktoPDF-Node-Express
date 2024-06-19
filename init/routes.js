import express from 'express';
import cookieparser from 'cookie-parser';
import { frameguard } from 'helmet';
import cors from 'cors';
import auth from '../routes/auth.js';
import userdetails from '../routes/userdetails.js';
import payments from '../routes/payments.js';
import publcRoutes from '../routes/public_api.js';

import {schemaValidation,validateSession } from '../utils/middlewares.js';


const corsOptions = {
    origin: `${process.env.CORS_DOMAIN}`
};

const ROUTES = (server) => {
    server.use(express.json({ limit: '50mb' }))
    server.use(express.urlencoded({ extended: true }));
    server.use(cors(corsOptions));
    server.use(cookieparser());
    server.use(frameguard({ action: 'DENY' }));

   // Error handling middleware
    server.use((err, req, res, next) => {
    console.error(err); // Log the error for debugging purposes
    // Send an error response to the client
    res.status(500).json({ error: 'Internal Server Error' });
  });

    server.use('/public', publcRoutes);
    server.use('/auth', [schemaValidation,validateSession], auth);
    server.use('/user', [schemaValidation], userdetails);
    server.use('/payment', [schemaValidation], payments);
};

export default ROUTES;