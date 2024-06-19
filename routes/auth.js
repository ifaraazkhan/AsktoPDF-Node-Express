import express from 'express';
import { createAuthToken, generateOTP, sendOTP, checkLoginAttempts, encryptData,checkUserAlreadyExists, validateOTP } from '../utils/helper.js';
import { insertSql, selectSql, updateSql } from '../utils/pg_helper.js';
import error_resp from '../constants/errors.js';

const router = express.Router();

router.get('/alluserchats', async (req, res) => {
  const userId = req.userId;
  const sql = `select id,pdf_name,TO_CHAR(CAST(created_at AS TIMESTAMP), 'DD/MM/YYYY') AS created_at from atp.chats where user_id=$1 order by id desc`;
  const result = await selectSql(sql, [userId]);
  res.send(result);
});




export default router;
